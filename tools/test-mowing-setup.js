/*
 * Harness for the mowing-setup rule.
 *
 * The behaviour under test: change a plot's cut height and it must be given a
 * mower before it saves; once saved, the plot is selectable on that mower's
 * job and gone from its old one.
 *
 * Same jsdom + stub-Leaflet approach as test-field-position.js.
 *
 * Run:  node tools/test-mowing-setup.js
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

/* ---- boot ---- */
const vc = new VirtualConsole();
const seen = [];
vc.on('jsdomError', e => seen.push(e.message));
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;

/* Leaflet is only needed here so the app's map code does not explode on load;
   this suite is about data rules, not drawing. */
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

const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
const EXPORTS = ['TASKS', 'TRIALS', 'TEMPLATES', 'FIELDLOG', 'currentRole'];
try {
  win.eval(scripts.join('\n;\n')
    + '\n;window.__app={' + EXPORTS.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }
const APPV = win.__app || {};
EXPORTS.forEach(n => { if (win[n] === undefined && APPV[n] !== undefined) win[n] = APPV[n]; });

/* A mowing change is stamped with the roster id of whoever made it, so the
   harness has to sign somebody in. Bill (p07) sets up mowers. */
win.sessionSet('p07');

/* Drive the popup form the way a thumb would: the app writes it into the
   Leaflet popup, so stand in a container with the same element ids. */
const host = win.document.createElement('div');
host.innerHTML = '<input id="mg_c"><select id="mg_m"></select>'
  + '<div id="mg_hint"></div><div id="mg_eff"></div>';
win.document.body.appendChild(host);
const $c = () => win.document.getElementById('mg_c');
const $m = () => win.document.getElementById('mg_m');
win.MOWER_CFG.forEach(m => {
  const o = win.document.createElement('option'); o.value = m[1]; o.textContent = m[1]; $m().appendChild(o);
});
const oNone = win.document.createElement('option'); oNone.value = '__none'; $m().appendChild(oNone);
const oBlank = win.document.createElement('option'); oBlank.value = ''; $m().appendChild(oBlank);

let toasts = [];
win.toast = m => toasts.push(m);

/* Sit the form on a plot the way editMowing would, then type into it. */
function openForm(plot) {
  const o = win.mgmtObj(plot);
  $c().value = (o.c === '' ? '' : o.c);
  $m().value = o.m ? win.mowerLabel(plot) : '';
  win._mgStart = { c: (o.c === '' ? null : +o.c), m: o.m ? win.mowerLabel(plot) : '' };
  toasts = [];
}
function typeHeight(plot, v) { $c().value = String(v); win.mgHeightTouched(plot); }
function pickMower(v) { $m().value = v; }
function save(plot) { toasts = []; win.saveMowing(plot); return toasts.join(' | '); }

/* ================================================================ tests == */

section('The farm knows which machine runs which height');
const idx = win.mowHeightIndex();
ok('height index built from the live data', Object.keys(idx).length >= 5, Object.keys(idx).join(', '));
ok('0.5 in is the fairway unit', win.mowSuggest(0.5).exact.join() === 'Fairway Mower',
   JSON.stringify(win.mowSuggest(0.5)));
ok('0.75 in is genuinely ambiguous — two machines run it',
   win.mowSuggest(0.75).exact.length === 2, win.mowSuggest(0.75).exact.join(' + '));
ok('0.14 in is ambiguous too',
   win.mowSuggest(0.14).exact.length === 2, win.mowSuggest(0.14).exact.join(' + '));
ok('the hint says so rather than guessing', /pick which/.test(win.mowHint(0.75)), win.mowHint(0.75));
ok('a novel height offers the closest fit instead of nothing',
   /Closest fit/.test(win.mowHint(2.5)), win.mowHint(2.5));
ok('the job name is read off the templates, not a second table',
   /Fairway/.test(win.mowJobLabel('Fairway Mower')), win.mowJobLabel('Fairway Mower'));

section('A height change cannot be saved without the mower');
/* Pick a rotary plot off the live data rather than naming one - the farm's
   mowing assignments are exactly the thing this feature lets people change. */
const P = Object.keys(win.MGMT_DATA).filter(n => win.mowerLabel(n) === 'Rotary Mower')[0];
ok('found a rotary plot to move', !!P, P);
const before = win.mgmtObj(P);

openForm(P);
typeHeight(P, 0.5);
ok('changing the height clears the stale machine', $m().value === '',
   'select still reads ' + $m().value);
ok('the form warns before you try to save', /Pick the machine/.test(win.document.getElementById('mg_eff').textContent),
   win.document.getElementById('mg_eff').textContent);

const refused = save(P);
ok('saving is refused', /Set the mower/.test(refused), refused);
ok('and nothing was written', win.MGMT_DATA[P].c === before.c && win.mowerLabel(P) === 'Rotary Mower',
   JSON.stringify(win.MGMT_DATA[P]));
ok('the rotary job still has it', win.jobPlots('Mow', 'Rotary Mow · Plots', []).indexOf(P) >= 0);

section('Set the mower and it goes through');
pickMower('Fairway Mower');
win.mgEffect(P);
ok('the form says what will happen', /selectable when assigning/.test(win.document.getElementById('mg_eff').textContent),
   win.document.getElementById('mg_eff').textContent);
const saved = save(P);
ok('the save lands', win.MGMT_DATA[P].c === 0.5, JSON.stringify(win.MGMT_DATA[P]));
ok('the machine is stored as the farm spells it', win.MGMT_DATA[P].m === 'John Deere 7700A', win.MGMT_DATA[P].m);
ok('the plot now reads as fairway ground', win.mowerLabel(P) === 'Fairway Mower');
ok('the toast names the job it joined', /Fairway/.test(saved), saved);

section('It shows up when assigning the task');
const fairway = win.jobPlots('Mow', 'Fairway Mow', []);
const rotary = win.jobPlots('Mow', 'Rotary Mow · Plots', []);
ok('selectable on the fairway job', fairway.indexOf(P) >= 0, fairway.length + ' fairway plots');
ok('gone from the rotary job', rotary.indexOf(P) < 0, rotary.length + ' rotary plots');
ok('the live fairway task picks it up without being touched',
   win.taskPlots(win.TASKS.find(t => t.id === 't1')).indexOf(P) >= 0);
ok('the map colours it as fairway now', win.mowerColor(P) === '#D55E00', win.mowerColor(P));
ok('the cut-height label follows', win.plotCut(P) === 0.5, String(win.plotCut(P)));

section('The change is on the record');
const entry = win.FIELDLOG.filter(e => e.plot === P && e.source === 'mowing').pop();
ok('a field log entry was written', !!entry);
ok('it records what it was and what it became',
   entry && /Rotary Mower/.test(entry.detail) && /Fairway Mower/.test(entry.detail), entry && entry.detail);
ok('and the height either side of the change', entry && /0\.5/.test(entry.detail), entry && entry.detail);
/* The record holds the roster id, not the name that was on screen at the time. */
ok('and who did it', entry && entry.person === win.SESSION.pid, entry && entry.person);
ok('and the id resolves back to a person', entry && win.nameOf(entry.person) === 'Bill Czekai',
   entry && win.nameOf(entry.person));

section('Taking a plot out of mowing');
openForm(P);
pickMower('__none');
save(P);
ok('not-mowed clears both fields', win.MGMT_DATA[P].m === undefined && win.MGMT_DATA[P].c === undefined,
   JSON.stringify(win.MGMT_DATA[P]));
ok('and it drops off every mow job',
   win.jobPlots('Mow', 'Fairway Mow', []).indexOf(P) < 0 &&
   win.jobPlots('Mow', 'Rotary Mow · Plots', []).indexOf(P) < 0);
/* Not every plot records irrigation heads, so check on one that does - the
   mowing form must not wipe a field it does not own. */
const H = Object.keys(win.MGMT_DATA).filter(n => win.MGMT_DATA[n].h !== undefined && win.MGMT_DATA[n].m)[0];
const heads = win.MGMT_DATA[H].h;
openForm(H); typeHeight(H, 0.5); pickMower('Fairway Mower'); save(H);
ok('a height change leaves the irrigation head count alone',
   win.MGMT_DATA[H].h === heads, H + ' -> ' + JSON.stringify(win.MGMT_DATA[H]));
openForm(H); pickMower('__none'); save(H);
ok('so does taking the plot out of mowing', win.MGMT_DATA[H].h === heads,
   H + ' -> ' + JSON.stringify(win.MGMT_DATA[H]));

section('Re-saving without moving the height is not blocked');
openForm(P);
pickMower('Rotary Mower');
const back = save(P);
ok('a machine-only change saves fine', win.mowerLabel(P) === 'Rotary Mower', back);
openForm(P);
const resave = save(P);
ok('saving an untouched form is allowed', !/Set the mower/.test(resave), resave);

section('Guards');
openForm(P);
$c().value = 'abc'; win.mgHeightTouched(P);
ok('a nonsense height is refused', /cut height in inches/.test(save(P)));
openForm(P);
typeHeight(P, 0);
ok('zero is refused too', /cut height in inches/.test(save(P)));

section('Restrictions still apply to the plot in its new job');
openForm('B14');
typeHeight('B14', 0.5);
pickMower('Fairway Mower');
save('B14');
const res = win.jobRes('B14', 'Mow', 'Fairway Mow');
ok('B14 keeps its no-mow hold after moving to fairway',
   res.full.length + res.pin.length > 0, JSON.stringify(res.full.length + '/' + res.pin.length));

section('Load errors');
ok('no uncaught errors', seen.length === 0, seen.join(' | '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
