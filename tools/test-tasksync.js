/*
 * Tasks moving between the phone and the shared copy.
 *
 * The three sections that matter are 4, 5 and 6. In order of how bad it would
 * be to get them wrong:
 *
 *   - a day's work that only exists on one phone must reach the shared copy;
 *   - an empty local array must NEVER be read as "the farm deleted everything";
 *   - a record arriving from the server must not be sent straight back.
 *
 * None of these can be tested against the real Firebase from here, so the
 * database is stood in for by a fake that records every write and delete. That
 * is the right level anyway: what is being tested is the app's decisions, not
 * Google's client.
 *
 * Run:  node tools/test-tasksync.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ------------------------------------------------------- the fake db ---- */
const state = { docs: {}, writes: [], deletes: [], listeners: [], persistence: 0 };
function docRef(id) {
  return {
    id: String(id),
    set(data) { state.writes.push({ id: String(id), data }); state.docs[String(id)] = data; return Promise.resolve(); },
    delete() { state.deletes.push(String(id)); delete state.docs[String(id)]; return Promise.resolve(); }
  };
}
const fakeDb = {
  enablePersistence() { state.persistence++; return Promise.resolve(); },
  collection() {
    return {
      doc: docRef,
      onSnapshot(next, err) { state.listeners.push({ next, err }); return () => { state.listeners = []; }; }
    };
  },
  doc: docRef
};
const fakeFirebase = {
  apps: [],
  initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { currentUser: null, onAuthStateChanged() { return () => {}; } }; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = {};

/* Deliver a snapshot the way Firestore would. fromCache=true is the local
   copy answering first, before the server has been heard from. */
function emit(changes, fromCache) {
  const snap = {
    metadata: { fromCache: !!fromCache },
    docChanges: () => changes.map(c => ({
      type: c.type || 'added',
      doc: { id: String(c.id), data: () => JSON.parse(JSON.stringify(c.data || {})) }
    }))
  };
  state.listeners.slice().forEach(l => l.next(snap));
}
function reset() { state.writes.length = 0; state.deletes.length = 0; }

/* ------------------------------------------------------------- boot ---- */
const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;
const noop = () => {};
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'getBounds' ? () => ({ getSouthWest: () => ({ lat: 0, lng: 0 }), getNorthEast: () => ({ lat: 0, lng: 0 }),
                                               getCenter: () => ({ lat: 0, lng: 0 }), extend() { return this; }, pad() { return this; } })
                 : (k === 'getZoom' || k === 'getMaxZoom' || k === 'getBoundsZoom') ? () => 20
                 : (k === 'hasLayer') ? () => false : (k === 'getContainer') ? () => null : chain()),
  apply: () => chain()
});
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.firebase = fakeFirebase;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
/* TASKS is declared with `let`, so it is not on window. It is never
   reassigned — storeHydrate() refills it in place — so a reference is safe. */
try {
  win.eval(appSource(win.document) + '\n;window.__TASKS = TASKS;');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const T = () => win.__TASKS;
const setTasks = arr => { T().length = 0; arr.forEach(x => T().push(x)); };
const job = (id, extra) => Object.assign({ id, title: 'Mow ' + id, area: 'B12', assignee: 'p18',
                                           status: 'todo', kind: 'task', createdBy: 'p07' }, extra || {});

/* ------------------------------------------------ 1. off by default ----- */
section('1. It is off until somebody turns it on');
ok('the switch starts off', win.TSYNC.on === false);
ok('nothing is attached', win.TSYNC.live === false);
{
  setTasks([job('t1')]);
  reset();
  win.tsyncTick();
  ok('a scan sends nothing while it is off', state.writes.length === 0 && state.deletes.length === 0);
}
ok('the status line says so in plain words', /own copy/i.test(win.tsyncSummary()));

/* -------------------------------------------------- 2. turning it on --- */
section('2. Turning it on');
win.sessionSet('p07');
ok('somebody is signed in', win.SESSION.pid === 'p07');
win.tsyncSetWanted(true);
ok('the switch is remembered on this device', store['ut_tasks_shared_v1'] === '1');
ok('a listener is attached', win.TSYNC.live === true && state.listeners.length === 1);
ok('the local copy was switched on before anything was read', state.persistence === 1);
ok('it has not gone live until the server has been heard from', win.TSYNC.ready === false);

/* ---------------------------- 3. the cache answers before the server --- */
section('3. A cached answer is not the server answering');
{
  reset();
  emit([{ type: 'added', id: 's1', data: job('s1', { title: 'From the shared copy' }) }], true);
  ok('the record still lands on the phone', T().some(t => t.id === 's1'));
  ok('but nothing is uploaded yet', state.writes.length === 0);
  ok('and it is still not ready', win.TSYNC.ready === false);
}

/* ------------------------------------ 4. a day's work must reach it ---- */
section('4. Records that only exist on this phone go up');
{
  setTasks([job('t1'), job('t2'), job('s1')]);
  win.TSYNC.seen = { s1: JSON.stringify(win.taskDoc(job('s1'))) };
  reset();
  emit([], false);                       /* the first SERVER snapshot */
  ok('it is now ready', win.TSYNC.ready === true);
  const sent = state.writes.map(w => w.id).sort();
  ok('the two records only this phone had were sent', JSON.stringify(sent) === '["t1","t2"]', sent.join(','));
  ok('the one the shared copy already had was not re-sent', sent.indexOf('s1') < 0);
}
{
  /* Matched on the device-generated id — opening the app twice cannot double up. */
  reset();
  win.tsyncUploadNew();
  ok('running the upload again sends nothing', state.writes.length === 0);
}
{
  /* Records made before createdBy was stamped would be refused by the database. */
  const legacy = { id: 'old1', title: 'Old job', assignee: 'p18', status: 'todo' };
  setTasks([legacy]);
  win.TSYNC.seen = {};
  reset();
  win.tsyncUploadNew();
  ok('a record from before createdBy existed is stamped on the way up',
     state.writes.length === 1 && state.writes[0].data.createdBy === 'p07');
}

/* --------------------------------- 5. an empty array is not a delete --- */
section('5. An empty array is a fault, not a deletion');
{
  setTasks([job('a1'), job('a2'), job('a3')]);
  win.TSYNC.seen = {}; win.TSYNC.ready = true; win.TSYNC.live = true; win.TSYNC.on = true;
  reset(); win.tsyncScan();
  ok('three records are known to the shared copy', Object.keys(win.TSYNC.seen).length === 3);

  T().length = 0;                                   /* a cleared browser, a failed hydrate */
  reset(); win.tsyncScan();
  ok('NOTHING is deleted', state.deletes.length === 0);
  ok('and it says why, in words', /Refused/i.test(win.TSYNC.err || ''));
  ok('the shared copy still knows about them', Object.keys(win.TSYNC.seen).length === 3);
}
{
  /* A mass disappearance that is not quite everything is refused too. */
  const many = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].map(id => job(id));
  setTasks(many); win.TSYNC.seen = {}; win.TSYNC.err = null;
  reset(); win.tsyncScan();
  setTasks([job('b1')]);
  reset(); win.tsyncScan();
  ok('six vanishing at once is refused', state.deletes.length === 0);
  ok('the limit is named, not magic', typeof win.TSYNC_MAX_DELETE === 'number');
}
{
  /* A real deletion, one at a time, does go through. */
  setTasks([job('c1'), job('c2')]); win.TSYNC.seen = {}; win.TSYNC.err = null;
  reset(); win.tsyncScan();
  setTasks([job('c1')]);
  reset(); win.tsyncScan();
  ok('deleting one job does delete one document',
     state.deletes.length === 1 && state.deletes[0] === 'c2', state.deletes.join(','));
}

/* ------------------------------------------------ 6. no echoing back --- */
section('6. What comes down does not go straight back up');
{
  setTasks([]); win.TSYNC.seen = {}; win.TSYNC.err = null;
  reset();
  emit([{ type: 'added', id: 'e1', data: job('e1', { title: "Bill's job" }) }], false);
  ok('it landed', T().some(t => t.id === 'e1'));
  reset(); win.tsyncScan();
  ok('the very next scan sends nothing back', state.writes.length === 0, state.writes.map(w => w.id).join(','));
}
{
  /* An update from somebody else fills the existing object rather than
     swapping it, so a screen holding a reference is not left stale. */
  const before = T().find(t => t.id === 'e1');
  emit([{ type: 'modified', id: 'e1', data: job('e1', { title: 'Renamed by Bill', status: 'done' }) }], false);
  const after = T().find(t => t.id === 'e1');
  ok('the same object is still in the array', before === after);
  ok('and it carries the change', after.title === 'Renamed by Bill' && after.status === 'done');
  reset(); win.tsyncScan();
  ok('still nothing echoed', state.writes.length === 0);
}
{
  /* Fields the other person removed have to actually go. */
  emit([{ type: 'modified', id: 'e1', data: { id: 'e1', title: 'Renamed by Bill', createdBy: 'p07' } }], false);
  ok('a field the other person cleared is cleared here too',
     T().find(t => t.id === 'e1').assignee === undefined);
}

/* ------------------------------------- 7. one change, one document ----- */
section('7. A local change sends exactly that one record');
{
  setTasks([job('d1'), job('d2'), job('d3')]); win.TSYNC.seen = {};
  reset(); win.tsyncScan();
  reset();
  T().find(t => t.id === 'd2').status = 'done';
  win.tsyncScan();
  ok('one document written', state.writes.length === 1, state.writes.map(w => w.id).join(','));
  ok('and it is the one that changed', state.writes[0] && state.writes[0].id === 'd2');
  ok('the change is in it', state.writes[0].data.status === 'done');
}

/* --------------------------------- 8. removals we never saw from them -- */
section('8. A removal for something this phone was still sending up');
{
  setTasks([job('f1')]);
  win.TSYNC.seen = {};                       /* never agreed with the server about f1 */
  emit([{ type: 'removed', id: 'f1' }], false);
  ok('the record stays on this phone', T().some(t => t.id === 'f1'));
}
{
  setTasks([job('g1')]);
  win.TSYNC.seen = { g1: JSON.stringify(win.taskDoc(job('g1'))) };
  emit([{ type: 'removed', id: 'g1' }], false);
  ok('but one the shared copy really did have is removed', !T().some(t => t.id === 'g1'));
}

/* ----------------------------------------------- 9. turning it off ----- */
section('9. Turning it off puts the phone back as it was');
{
  win.tsyncSetWanted(false);
  ok('the switch is remembered as off', store['ut_tasks_shared_v1'] === '0');
  ok('nothing is attached', win.TSYNC.live === false);
  ok('what was agreed is forgotten', Object.keys(win.TSYNC.seen).length === 0);
  setTasks([job('h1')]);
  reset(); win.tsyncTick();
  ok('and a scan sends nothing', state.writes.length === 0 && state.deletes.length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
