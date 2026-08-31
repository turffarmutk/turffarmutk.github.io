/*
 * Harness for choosing the ground when a job is handed out.
 *
 * WHAT THIS IS ABOUT. Reported from the farm on 2026-08-30: assigning a job,
 * Bill could not pick certain plots at all. A mowing job offered only the
 * plots booked on that machine, an alley job offered only alley zones, a
 * border job only the borders, and a spray whose task-list entry carried a
 * few plots offered only those. Everything else was drawn grey and ignored
 * the tap, with nothing on screen to say why.
 *
 * That was one list doing two jobs: the ground a job is USUALLY on was also
 * the ground it was ALLOWED on. So the two are now separate —
 *
 *   jobPickTargets()  what may be picked   — the whole farm
 *   jobQuickSet()     what it is usually on — a button, not a boundary
 *
 * — and the things that must not come loose in the process:
 *
 *   1. Restrictions. A trial hold still refuses the tap, on any plot, and
 *      quick select still steps over closed ground.
 *   2. No one-tap way to book the entire farm. The button only appears where
 *      the usual set is genuinely narrower; a spray stays plot-by-plot.
 *   3. Cut-height blocks stay inside the usual ground. Merging the whole farm
 *      by height would fuse a fairway to the plot next door and make the two
 *      impossible to pick apart.
 *   4. What was picked is what goes out — see also tools/test-taskwork.js §7.
 *
 * Run:  node tools/test-plot-picker.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- boot (same stubbed Leaflet as the other map suites) ---- */
const vc = new VirtualConsole();
const seen = [];
vc.on('jsdomError', e => seen.push(e.message));
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;

const noop = () => {};
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'getBounds' ? () => ({ getSouthWest: () => ({ lat: 0, lng: 0 }),
                                               getNorthEast: () => ({ lat: 0, lng: 0 }),
                                               getCenter: () => ({ lat: 0, lng: 0 }),
                                               extend() { return this; }, pad() { return this; } })
                 : (k === 'getZoom' || k === 'getMaxZoom' || k === 'getBoundsZoom') ? () => 20
                 : (k === 'hasLayer') ? () => false
                 : (k === 'getContainer') ? () => null
                 : chain()),
  apply: () => chain()
});
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true
});
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };

const scripts = require('./_app').appScripts(win.document);
try {
  /* asPerson, PICKS and WIZ are `let`, so they are not window properties —
     these little accessors are the only way in from out here. */
  win.eval(scripts.join('\n;\n')
    + '\n;window.__pk={setPerson:function(p){asPerson=p;},clearPicks:function(){PICKS.length=0;},'
    + 'picks:function(){return PICKS;},wiz:function(){return WIZ;},'
    + 'pick:function(){return PICK;},ctx:function(){return PICKCTX;},'
    + 'TASKS:TASKS,TEMPLATES:TEMPLATES};');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const doc = win.document;
const P = win.__pk || {};
const txt = id => { const e = doc.getElementById(id); return e ? e.textContent.trim() : '(missing)'; };
const shown = id => { const e = doc.getElementById(id); return !!e && e.style.display !== 'none'; };
const tap = id => doc.getElementById(id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const tplNamed = re => (P.TEMPLATES || []).filter(t => re.test(t.name))[0];

/* Open the assign wizard the way the screen does: pick who it is for, then
   tap the job in the list. Nobody is signed in in a harness, so the undergrad
   the work is going to is named outright. */
const WHO = (win.STUDENTS && win.STUDENTS[0]) || 'p18';
function openFor(tpl) {
  P.setPerson(WHO);
  win.openWiz('tpl', tpl.id);
  return P.wiz();
}

/* ---------------------------------------------------------------- */
section('1. the map offers the whole farm, whatever the job is');
const fairwayTpl = tplNamed(/^fairway$/i) || tplNamed(/fairway/i);
ok('the farm has a fairway mowing job to assign', !!fairwayTpl,
   (P.TEMPLATES || []).map(t => t.name).slice(0, 6).join(', '));
{
  const w = openFor(fairwayTpl);
  const every = win.jobAllPlots();
  ok('the wizard opened on the map step', w && w.step === 'map', w && w.step);
  ok('every plot on the farm can be tapped',
     every.every(n => w.targets.indexOf(n) >= 0), w.targets.length + ' targets, ' + every.length + ' plots');

  /* THE REGRESSION. A plot that is not on this machine used to be grey and
     dead — this is the tap Bill could not make. */
  const offMachine = every.filter(n => win.jobPlots('Mow', fairwayTpl.name, []).indexOf(n) < 0
                                    && win.jobRes(n, 'Mow', fairwayTpl.name).full.length === 0)[0];
  ok('including one that is not booked on this machine', w.targets.indexOf(offMachine) >= 0, offMachine);
  ok('and tapping it actually picks it',
     win.pickSelectByName(w.plots, offMachine, w.cat, w.name) === true && w.plots.indexOf(offMachine) >= 0,
     w.plots.join(','));

  /* Alleys are mown ground, so a mowing job can reach them; a fertiliser run
     has no business on gravel and still cannot. */
  ok('a mowing job can also reach the alley zones',
     w.targets.filter(win.jobIsZone).length === win.jobAlleyZones().length,
     String(w.targets.filter(win.jobIsZone).length));
  ok('a fertiliser run is offered no gravel',
     win.jobPickTargets('Fertilizer', 'Granular fert', []).filter(win.jobIsZone).length === 0);
  ok('a herbicide spray still is', win.jobPickTargets('Spray', 'Herbicide spray', []).filter(win.jobIsZone).length > 0);
}

section('2. what the job is usually on is a button, not a boundary');
{
  const w = openFor(fairwayTpl);
  const usual = win.jobPlots('Mow', fairwayTpl.name, []);
  ok('the usual set is the machine\'s ground', w.quick.length === usual.length && usual.length > 0,
     w.quick.length + ' vs ' + usual.length);
  ok('which is narrower than what may be picked', w.quick.length < w.targets.length,
     w.quick.length + ' of ' + w.targets.length);
  ok('the button is on screen', shown('wz-all'));
  ok('and it names the machine, off the farm\'s own mower list',
     /Fairway/i.test(txt('wz-all')), txt('wz-all'));
  ok('and says how many it will take', /\d+$/.test(txt('wz-all')), txt('wz-all'));

  tap('wz-all');
  ok('tapping it takes the whole of that ground',
     w.plots.length === win.jobSelectable(usual, w.cat, w.name).length, w.plots.length + ' picked');
  ok('the button now offers to clear instead', /^Clear$/.test(txt('wz-all')), txt('wz-all'));
  tap('wz-all');
  ok('and tapping again clears the lot', w.plots.length === 0, w.plots.join(','));

  /* The count no longer reads "3 of 158", which is a number nobody needs. */
  win.pickSelectByName(w.plots, w.quick[0], w.cat, w.name);
  win.renderWizMap();
  ok('the count says what is picked, not what exists', txt('wz-count') === '1 selected', txt('wz-count'));
}

section('3. there is still no one-tap way to book the entire farm');
{
  const sprayTpl = (P.TEMPLATES || []).filter(t => /spray|fungicid|herbicid/i.test(t.category + ' ' + t.name)
                                                && !(t.plots || []).length)[0];
  if (sprayTpl) {
    const w = openFor(sprayTpl);
    ok('a spray can be put on any plot', w.targets.length >= win.jobAllPlots().length, String(w.targets.length));
    ok('but it gets no quick-select button at all', w.quick.length === 0 && !shown('wz-all'),
       txt('wz-all'));
  } else {
    ok('a spray gets no quick-select button at all',
       win.jobQuickSet('Spray', 'Fungicide spray', []).length === 0);
  }
  /* A job whose task-list entry carries a few plots keeps them as the
     shortcut — that is what the entry is FOR — while the map stays open. */
  ok('a job saved with its own plots offers those as the shortcut',
     win.jobQuickSet('Spray', 'Fungicide spray', ['B1', 'B2']).length === 2);
  ok('and calls them what they are',
     win.jobQuickLabel('Spray', 'Fungicide spray', ['B1', 'B2']) === 'The usual plots',
     win.jobQuickLabel('Spray', 'Fungicide spray', ['B1', 'B2']));
  ok('while the map still offers the rest of the farm',
     win.jobPickTargets('Spray', 'Fungicide spray', ['B1', 'B2']).length > 2);
}

section('4. a trial hold still refuses the tap, and quick select steps over it');
{
  /* A fixture, not a seed row: the sample trials were removed from the app on
     2026-08-24. Same shape the trial editor writes. Dates deliberately wide so
     this never fails on a calendar boundary. */
  const held = win.jobPlots('Mow', 'Fairway', [])[0];
  win.TRIALS.push({
    id: 's-pickfix', title: 'Fixture — no-mow hold', lab: 'Sorochan', pi: 'p13', owner: 'p01',
    stage: 'active', multiPlot: false, coverage: 'full', pin: null,
    start: '2020-01-01', end: '2099-12-31',
    locations: [{ plot: held, sqft: 7500 }],
    restrictions: [{ id: 'r-pickfix', type: 'mow', scope: held,
                     note: 'Fixture hold', start: '2020-01-01', end: '2099-12-31', by: 'p01' }]
  });
  ok('the hold is live on that plot', win.jobRes(held, 'Mow', 'Fairway').full.length > 0, held);

  const w = openFor(fairwayTpl);
  ok('the plot is still offered on the map', w.targets.indexOf(held) >= 0, held);
  ok('but it refuses to be picked',
     win.pickSelectByName(w.plots, held, w.cat, w.name) === false && w.plots.indexOf(held) < 0);

  tap('wz-all');
  ok('and quick select leaves it out', w.plots.indexOf(held) < 0, w.plots.join(','));
  ok('while taking the rest of the ground', w.plots.length === w.quick.length - 1,
     w.plots.length + ' of ' + w.quick.length);
  win.TRIALS.splice(win.TRIALS.findIndex(t => t.id === 's-pickfix'), 1);
}

section('5. cut-height blocks stay inside the usual ground');
{
  /* Blocks merge adjoining plots cut at the same height. Merged across the
     whole farm they would fuse a fairway to whatever sits beside it at that
     height, and the two could no longer be picked apart — so the picker draws
     blocks over the job's usual ground only and leaves the rest as plots. */
  const w = openFor(fairwayTpl);
  const realDraw = win.jobMapDraw;
  let drawn = null;
  win.jobMapDraw = function (st, o) { drawn = o; };
  win.renderWizMap();
  win.jobMapDraw = realDraw;
  ok('the map is drawn with the whole farm tappable', drawn && drawn.targets.length === w.targets.length,
     drawn && String(drawn.targets.length));
  ok('but only the usual ground may merge into a block',
     drawn && drawn.blockOn === w.quick, drawn && String((drawn.blockOn || []).length));
  ok('and that is fewer plots than the map shows',
     drawn && drawn.blockOn.length < drawn.targets.length,
     drawn && (drawn.blockOn.length + ' of ' + drawn.targets.length));
}

section('6. the ground picked is the ground that goes out');
{
  const w = openFor(fairwayTpl);
  P.clearPicks();
  const extra = win.jobAllPlots().filter(n => w.quick.indexOf(n) < 0
                                           && win.jobRes(n, 'Mow', w.name).full.length === 0)[0];
  win.pickSelectByName(w.plots, w.quick[0], w.cat, w.name);
  win.pickSelectByName(w.plots, extra, w.cat, w.name);
  win.confirmWiz();
  const p = P.picks()[0];
  ok('the pick carries both plots', p && p.plots.length === 2 && p.plots.indexOf(extra) >= 0,
     p && p.plots.join(','));

  win.saveAssignments();
  const t = P.TASKS[P.TASKS.length - 1];
  ok('and so does the task that lands on the board', t.plots.indexOf(extra) >= 0, t.plots.join(','));
  ok('the plot nobody would have been able to pick is on the crew\'s map',
     win.taskPlots(t).indexOf(extra) >= 0, win.taskPlots(t).join(','));
  ok('and the job is those two plots, not the whole machine',
     win.taskPlots(t).length === 2, String(win.taskPlots(t).length));
}

section('7. the Choose plots screen works the same way');
{
  /* The task-list editor's picker shares all of this. It used to narrow to the
     entry's own plots, so a job could never be given new ground. */
  win.pickOpen('Mow', 'Fairway', ['B14']);
  const ctx = P.ctx();
  ok('it opens on the whole farm', ctx.targets.length === win.jobPickTargets('Mow', 'Fairway', ['B14']).length,
     String(ctx.targets.length));
  ok('with the machine\'s ground as the shortcut', ctx.quick.length === win.jobPlots('Mow', 'Fairway', []).length,
     String(ctx.quick.length));
  ok('and what was already saved still selected', P.pick().indexOf('B14') >= 0, P.pick().join(','));
  win.renderPlotPick();
  ok('the button is on that screen too', shown('pp-all') && /Fairway/i.test(txt('pp-all')), txt('pp-all'));
  ok('and its count reads plainly', txt('pp-count') === '1 selected', txt('pp-count'));
}

section('8. nothing blew up');
{
  const real = seen.filter(m => !/Not implemented|Could not parse CSS/i.test(m));
  ok('no jsdom errors', real.length === 0, real.slice(0, 3).join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
