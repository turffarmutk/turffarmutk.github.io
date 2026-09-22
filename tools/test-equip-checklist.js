/*
 * Harness for the Start page: the assign note, then an equipment checklist.
 *
 * Dillon, 2026-09-22: after a student presses Start, show the note left when
 * the job was assigned and a tile for each piece of equipment the job needs,
 * grouped by category (mowers, carts, trailers ...). The student taps the one
 * they took in each group before they can go on -- so the farm knows which
 * rotary mower went out with which student.
 *
 * What it pins:
 *   1. Every machine on the farm lands in a real category, not "Other".
 *   2. A job's equipment comes from the task list, grouped so "a tractor AND
 *      the aerifier" and "any one of three mowers" both read right.
 *   3. Start opens the page, Continue waits for every group, and the pick is
 *      written onto the task under the student's own id.
 *   4. The mower shows as "with" that student until the task is done.
 *   5. A job with nothing to say still goes straight to work, as before.
 *   6. The database rule lets a student record their own picks and nobody
 *      else's (the rules mirror in tools/rules-model.js).
 *   7. The task-list form's "Equipment needed" picker edits the job's list.
 *
 * Run:  node tools/test-equip-checklist.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const model = require('./rules-model');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');
const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- boot, the same way tools/test-taskwork.js does ---- */
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
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
win.confirm = () => true;

const scripts = require('./_app').appScripts(win.document);
try {
  win.eval(scripts.join('\n;\n')
    + '\n;window.__eq={TASKS:TASKS,EQUIP:EQUIP,TEMPLATES:TEMPLATES,'
    + 'tp:function(){return TP;},form:function(){return FORM;},setForm:function(f){FORM=f;},'
    + 'stack:function(){return stack.slice();}};');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const doc = win.document;
const X = win.__eq || {};
const TASKS = X.TASKS || [], EQUIP = X.EQUIP || [], TEMPLATES = X.TEMPLATES || [];
const active = () => { const s = doc.querySelector('.screen.active'); return s ? s.id.replace(/^s-/, '') : ''; };
const tile = (cat, id) => doc.querySelector('#tp-body [data-tpcat="' + cat + '"][data-tpeq="' + id + '"]');
const tpl = name => TEMPLATES.find(t => t.name === name);

win.sessionSet('p18', { quiet: true });
const ME = win.SESSION.pid;

function job(id, over) {
  const t = Object.assign({ id: id, title: 'Rotary - Plots', type: 'Mow', area: '', plots: [], donePlots: [],
                            status: 'todo', kind: 'task', assignee: ME, desc: '', createdBy: 'p07' }, over || {});
  TASKS.push(t);
  return t;
}

/* ---------------------------------------------------------------- */
section('1. every machine on the farm has a real category');
{
  /* Research kit genuinely is "Other". Anything else landing there means a
     new kind of machine the guess has not met -- file it, or pick its
     category on the edit screen. */
  const research = /jugs|field tester/i;
  const other = EQUIP.filter(m => win.eqCatOf(m) === 'other' && !research.test(m.type))
                     .map(m => m.name + ' (' + m.type + ')');
  ok('no seeded machine falls through to Other by accident', other.length === 0, other.join(', '));
  const want = { e3: 'mower', e22: 'tractor', e30: 'implement', e31: 'implement', e32: 'implement',
                 e24: 'spreader', e43: 'sprayer', e2: 'sprayer', e18: 'cart', e50: 'cart',
                 e52: 'trailer', e57: 'tool', e62: 'tool', e35: 'shop', e55: 'painter', e42: 'mower' };
  EQUIP.forEach(m => { if (/Truck/.test(m.type)) want[m.id] = 'cart';
                       if (/Sod Cutter|Slit Seeder|Traficker|Roller/.test(m.type)) want[m.id] = 'implement'; });
  const wrong = Object.keys(want).filter(id => win.eqCatOf(EQUIP.find(m => m.id === id)) !== want[id]);
  ok('and the right one', wrong.length === 0,
     wrong.map(id => id + '=' + win.eqCatOf(EQUIP.find(m => m.id === id))).join(', '));
  ok('a category picked by hand wins over the guess',
     win.eqCatOf({ type: 'Zero-Turn Rotary Mower', cat: 'cart' }) === 'cart');
  ok('a category the app does not know falls back to the guess',
     win.eqCatOf({ type: 'Trailer', cat: 'nonsense' }) === 'trailer');
}

section('2. a job\'s equipment, grouped');
{
  const rot = win.taskEquipNeeded(job('eq-2a'));
  ok('Rotary - Plots is one group of mowers', rot.length === 1 && rot[0].cat === 'mower',
     rot.map(g => g.cat).join(','));
  ok('with all three rotary mowers in it', rot[0] && rot[0].items.length === 3);

  const aer = win.taskEquipNeeded(job('eq-2b', { title: 'Tractor-Mounted', type: 'Aeration' }));
  ok('aerating is a tractor group AND an implement group',
     aer.map(g => g.cat).join(',') === 'tractor,implement', aer.map(g => g.cat).join(','));

  const pinned = win.taskEquipNeeded(job('eq-2c', { machine: 'e4' }));
  ok('a machine Bill pinned is the only one offered in its group',
     pinned[0].items.length === 1 && pinned[0].items[0].id === 'e4');

  const renamed = job('eq-2d', { title: 'Mow the plots', tplId: tpl('Rotary - Plots').id });
  ok('a renamed task still finds its job by id', win.taskEquipNeeded(renamed).length === 1);

  const retired = EQUIP.find(m => m.id === 'e5'); retired.active = false;
  ok('a retired machine is not offered', win.taskEquipNeeded(job('eq-2e'))[0].items.length === 2);
  retired.active = true;
}

section('3. Start opens the page, and Continue waits for every group');
{
  const t = job('eq-3', { title: 'Tractor-Mounted', type: 'Aeration', desc: 'Skip plot 7.' });
  win.show('taskboard', false);
  win.startTask(t.id);
  ok('Start opens the Start page', active() === 'taskprep', active());
  ok('the note is on it', /Skip plot 7\./.test(doc.getElementById('tp-body').textContent));
  ok('and who left it', /Notes from/.test(doc.getElementById('tp-body').textContent));
  const go = doc.getElementById('tp-go');
  ok('Continue starts greyed out', go.classList.contains('off'), go.textContent);

  go.click();
  ok('and pressing it anyway does not go on', active() === 'taskprep');

  tile('tractor', 'e22').click();
  ok('one group done leaves one to go', /1 more/.test(go.textContent), go.textContent);
  ok('the tapped tile shows as ticked', tile('tractor', 'e22').classList.contains('eqt-on'));
  tile('tractor', 'e23').click();
  ok('tapping another in the same group moves the tick',
     tile('tractor', 'e23').classList.contains('eqt-on') && !tile('tractor', 'e22').classList.contains('eqt-on'));
  tile('implement', 'e30').click();
  ok('every group answered: Continue lights up', !go.classList.contains('off'), go.textContent);

  go.click();
  ok('the picks are written under the student\'s own id',
     JSON.stringify(t.eqUsed) === JSON.stringify({ [ME]: ['e23', 'e30'] }), JSON.stringify(t.eqUsed));
  ok('and the job opens', active() === 'taskwork' || active() === 'taskdetail', active());
  ok('back from the job does not land on the Start page again', X.stack().indexOf('taskprep') < 0,
     X.stack().join(','));
}

section('4. the machine is "with" the student until the task is done');
{
  const t = TASKS.find(x => x.id === 'eq-3');
  const tractor = EQUIP.find(m => m.id === 'e23');
  const h = win.eqHolder('e23');
  ok('the Equipment screen knows who has it', h && h.pid === ME && h.task.id === 'eq-3');
  ok('and calls it In use', win.eqStatusOf(tractor) === 'in_use');
  ok('the one not taken is still Available', win.eqStatusOf(EQUIP.find(m => m.id === 'e22')) === 'available');

  /* Somebody else starting a job that wants the same tractor sees it taken. */
  const other = job('eq-4', { title: 'Bleckavate', type: 'Cultivation', assignee: ME, desc: 'x' });
  t.eqUsed = { p19: ['e23', 'e30'] };
  win.startTask(other.id);
  const busy = tile('tractor', 'e23');
  ok('a machine with somebody else is marked, not hidden',
     busy && busy.classList.contains('eqt-busy') && /With/.test(busy.textContent), busy && busy.textContent);
  t.eqUsed = { [ME]: ['e23', 'e30'] };

  t.status = 'done';
  ok('finishing the task hands the tractor back', win.eqStatusOf(tractor) === 'available');
  t.status = 'todo';
  const down = EQUIP.find(m => m.id === 'e22'); down.status = 'down';
  ok('a machine that is down stays Down, whoever has it', win.eqStatusOf(down) === 'down');
  down.status = 'available';
}

section('5. coming back, sharing, and going without');
{
  const t = TASKS.find(x => x.id === 'eq-3');
  win.startTask(t.id);
  ok('opening a started job again has last time\'s picks ticked',
     !doc.getElementById('tp-go').classList.contains('off'));

  const shared = job('eq-5', { helpers: ['p19'], eqUsed: { p19: ['e3'] }, desc: 'both of you' });
  win.startTask(shared.id);
  tile('mower', 'none').click();
  ok('"Not taking one" answers a group', !doc.getElementById('tp-go').classList.contains('off'));
  doc.getElementById('tp-go').click();
  ok('going without writes nothing for me and keeps the other student\'s mower',
     JSON.stringify(shared.eqUsed) === JSON.stringify({ p19: ['e3'] }), JSON.stringify(shared.eqUsed));

  const plain = job('eq-6', { title: 'Valve - Fix', type: 'Irrigation' });
  win.show('taskboard', false);
  win.startTask(plain.id);
  ok('a job with no note and no equipment skips the page, as before', active() !== 'taskprep', active());
}

section('6. the database rule');
{
  ok('the rules file has the move', /function isWorkUpdate\(\)/.test(RULES) && /function eqPickOk\(\)/.test(RULES));
  ok('and allows it on update', /isCompletion\(\) \|\| isWorkUpdate\(\)/.test(RULES));

  const before = { id: 't', assignee: 'p18', helpers: ['p19'], status: 'todo', eqUsed: { p19: ['e3'] } };
  const mine = Object.assign({}, before, { eqUsed: { p19: ['e3'], p18: ['e4'] } });
  ok('a student records their own pick', model.isWorkUpdate(before, mine, 'p18'));
  ok('a helper records theirs', model.isWorkUpdate(before, Object.assign({}, before, { eqUsed: { p19: ['e5'] } }), 'p19'));
  ok('nobody changes another person\'s pick',
     !model.isWorkUpdate(before, Object.assign({}, before, { eqUsed: { p19: ['e5'] } }), 'p18'));
  ok('somebody not on the job cannot record one',
     !model.isWorkUpdate(before, Object.assign({}, before, { eqUsed: { p19: ['e3'], p20: ['e4'] } }), 'p20'));
  ok('and a pick cannot smuggle in another change',
     !model.isWorkUpdate(before, Object.assign({}, mine, { title: 'something else' }), 'p18'));
  ok('a completion carrying only my own picks passes the pick check',
     model.eqPickOk(before, Object.assign({}, mine, { status: 'done' }), 'p18'));
}

section('7. the task-list form edits a job\'s equipment');
{
  const t = tpl('Rotary - Plots');
  const f = X.form();
  X.setForm(Object.assign({}, f, { id: t.id, mode: 'template', name: t.name, category: t.category,
                                   machines: t.machines.slice(), machine: 'e5' }));
  win.show('tasknew', false);
  win.syncForm();
  ok('the form shows an Equipment needed row', doc.getElementById('tn-equip-row').style.display === '');
  ok('and says how many', /3 items/.test(doc.getElementById('tn-equip').textContent),
     doc.getElementById('tn-equip').textContent);
  win.go('eqpick');
  ok('tapping it opens the picker', active() === 'eqpick', active());
  const e5 = doc.querySelector('#ep-body [data-epeq="e5"]');
  ok('the job\'s machines are ticked', e5 && e5.classList.contains('eqt-on'));
  e5.click();
  ok('tapping one takes it off the job', X.form().machines.indexOf('e5') < 0);
  ok('and it stops being the default machine', X.form().machine === '');
  doc.querySelector('#ep-body [data-epeq="e18"]').click();
  ok('tapping a cart adds it', X.form().machines.indexOf('e18') >= 0);
  doc.getElementById('ep-done').click();
  ok('Done goes back to the form', active() === 'tasknew', active());
}

section('8. a photo drops straight into the tile');
{
  const m = { id: 'x', name: 'Shovel', type: 'Shovel', photo: 'data:image/png;base64,AAAA' };
  ok('with a photo, the tile shows it', /background-image:url\('data:image\/png/.test(win.eqTileHtml(m, 'off', '')));
  ok('without one, the category initial holds its place',
     /eqt-noph">T</.test(win.eqTileHtml(Object.assign({}, m, { photo: null }), 'off', '')));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
