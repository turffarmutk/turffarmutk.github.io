/*
 * EVERY DRAWER MUST SETTLE.  Added 2026-08-31, the day it cost 4.4 million reads.
 *
 * WHAT WENT WRONG. A drawer sends a record whenever it differs from what the
 * server last said. Two of them could never agree with the server, so they
 * argued with it forever: send it up, get it back, decide it looks different,
 * send it again. In one day, with one person using the app, that spent 4.4
 * MILLION database reads against a free-plan allowance of fifty thousand.
 * Sharing went down for the whole farm and nothing on any screen said why.
 *
 * There were two separate reasons, and BOTH are checked below:
 *
 *   1. The arriving record was applied by copying its fields over the top,
 *      leaving behind any field the server had not sent. That leftover field
 *      meant the record never matched, so it went up again forever.
 *
 *   2. The database hands a record back with its fields in ALPHABETICAL order,
 *      which is almost never the order the app made them in. A drawer that
 *      compares records as plain text therefore reads an unchanged record as
 *      changed, purely because `active` now comes before `role`.
 *
 * WHY THIS FILE EXISTS RATHER THAN A LINE IN EACH DRAWER'S OWN TEST. Exactly
 * one drawer had this check before today -- the roster, in test-rostersync.js
 * -- and the roster is the one drawer that did not break. That is the whole
 * lesson. The check belongs to every drawer or it protects nothing, so it goes
 * in one file that walks all of them and cannot be forgotten when the next
 * drawer is added: leave a drawer out of the table below and its row is the
 * only thing missing, which is easy to see. See CLAUDE.md and docs/DECISIONS.md.
 *
 * Run:  node tools/test-sync-settles.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ------------------------------------------------------- the fake db ---- */
const state = { writes: [], deletes: [], listeners: {} };
function docRef(coll, id) {
  return { id: String(id),
    set(data) { state.writes.push({ coll, id: String(id), data }); return Promise.resolve(); },
    delete() { state.deletes.push({ coll, id: String(id) }); return Promise.resolve(); } };
}
const fakeDb = {
  enablePersistence() { return Promise.resolve(); },
  batch() { const w = []; return { set(ref, d) { w.push([ref, d]); },
                                   commit() { w.forEach(([r, d]) => r.set(d)); return Promise.resolve(); } }; },
  collection(name) {
    return { doc: id => docRef(name, id),
             get() { return Promise.resolve({ size: 0, forEach() {} }); },
             onSnapshot(opts, next, err) { (state.listeners[name] = state.listeners[name] || []).push({ next, err }); return () => { state.listeners[name] = []; }; } };
  },
  doc: p => docRef('_', p)
};
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { currentUser: { email: 'x@vols.utk.edu', getIdTokenResult: () => Promise.resolve({ claims: {} }) },
                    onAuthStateChanged() { return () => {}; } }; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = { delete: () => ({ __delete: true }) };

/* The database hands fields back in alphabetical order, so that is what the
   fake one does too. `shuffle` goes further and hands them back in the WORST
   order -- reversed -- which is the case the old code could not survive. */
function reorder(o, how) {
  if (Array.isArray(o)) return o.map(x => reorder(x, how));
  if (o && typeof o === 'object') {
    const ks = Object.keys(o).sort();
    if (how === 'reverse') ks.reverse();
    const out = {};
    ks.forEach(k => { out[k] = reorder(o[k], how); });
    return out;
  }
  return o;
}
function emit(coll, changes, fromCache, how) {
  const snap = {
    metadata: { fromCache: !!fromCache },
    docChanges: () => changes.map(c => ({ type: c.type || 'added',
      doc: { id: String(c.id), data: () => reorder(JSON.parse(JSON.stringify(c.data || {})), how) } }))
  };
  (state.listeners[coll] || []).slice().forEach(l => l.next(snap));
}
const reset = () => { state.writes.length = 0; state.deletes.length = 0; };

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

/* Several of the collections are `let`, so they are not on window. They are
   filled in place and never reassigned, so holding the reference is safe. */
try {
  win.eval(appSource(win.document)
    + '\n;window.__L={EQUIP:EQUIP,EQPROBLEMS:EQPROBLEMS,EQSCHED:EQSCHED,EQMAINT:EQMAINT,'
    + ' INVENTORY:INVENTORY,INVMOVES:INVMOVES,FIELDLOG:FIELDLOG,TASKS:TASKS,'
    + ' TRIALS:TRIALS,PEOPLE:PEOPLE,TASK_TEMPLATES:(typeof TASK_TEMPLATES!=="undefined"?TASK_TEMPLATES:null)};');
} catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const L = () => win.__L;
win.sessionSet('p07');                    /* Bill — allowed to push the most */
try { win.currentRole = 'manager'; } catch (e) {}

/* ------------------------------------------------------------ the table --
   One row per drawer. `docs` turns the records this phone is holding into the
   records the SERVER would hold. Add a drawer to the app, add its row here. */
/* ------------------------------------------------------------ the table --
   One row per drawer, each with a sample record in the shape the SERVER would
   hold it. Written out by hand rather than taken from whatever the app happens
   to have seeded, because a seed that is empty makes this whole file quietly
   pass while checking nothing -- which is the exact way the original bug got
   through. Add a drawer to the app, add its row here. */
const P = 'p07';                                  /* Bill: allowed to push the most */
const DRAWERS = [
  { name: 'the field log',      coll: 'fieldlog',   push: 'flPush',    local: () => L().FIELDLOG,
    sample: { id: 'zz1', op: 'Mow', when: '2026-08-31', ord: 20260831, loggedBy: P } },
  { name: 'stock movements',    coll: 'invmoves',   push: 'invPush',   local: () => L().INVMOVES,
    sample: { id: 'zz1', item: 'i1', qty: 2, who: P, when: '2026-08-31' } },
  { name: 'products',           coll: 'invitems',   push: 'invPush',   local: () => L().INVENTORY,
    sample: { id: 'zz1', name: 'Test product', unit: 'gal', qty: 3 } },
  { name: 'schedules',          coll: 'schedules',  push: 'schPush',   local: () => win.SCHEDULES,
    sample: { id: 'zz1', pid: P, sem: 'sem1', days: { mon: [['08:00', '12:00']] } } },
  /* The punches do not live in a list of their own -- the time clock keeps
     them per person and opens three doors onto them, so this reads the same
     door the drawer itself reads. */
  { name: 'time clock punches', coll: 'punches',    push: 'tcPush',    local: () => win.tcPunchDocs(),
    sample: { id: 'zz1', pid: P, date: '2026-08-31', in: '08:00', out: null, note: '' } },
  { name: 'machines',           coll: 'equipment',  push: 'eqPush',    local: () => L().EQUIP,
    sample: { id: 'zz1', name: 'Test mower', active: true, kind: 'mower' } },
  { name: 'reported problems',  coll: 'eqproblems', push: 'eqPush',    local: () => L().EQPROBLEMS,
    sample: { id: 'zz1', eq: 'zz1', what: 'flat tyre', by: P, when: '2026-08-31' } },
  { name: 'service schedules',  coll: 'eqsched',    push: 'eqPush',    local: () => L().EQSCHED,
    sample: { id: 'zz1', eq: 'zz1', every: 100, what: 'oil change' } },
  { name: 'the calendar',       coll: 'events',     push: 'evPush',    local: () => win.EVENTS,
    sample: { id: 'zz1', date: '2026-08-31', type: 'crew', person: P, removed: false, note: 'x' } },
  { name: 'the roster',         coll: 'roster',     push: 'rstPush',   local: () => L().PEOPLE,
    sample: { id: 'p90', first: 'Test', last: 'Person', pron: '', role: 'Undergraduate Student',
              lab: '', active: true, grants: [], v: 2 } },
  { name: 'task templates',     coll: 'templates',  push: 'tplPush',   local: () => win.TEMPLATES,
    sample: { id: 'zz1', name: 'Test template', removed: false, mins: 30 } },
  { name: 'studies',            coll: 'trials',     push: 'trsyncPush', local: () => L().TRIALS,
    sample: { id: 'zz1', title: 'Test study', lab: 'Sorochan', removed: false, restrictions: [] } },
  { name: 'the task list',      coll: 'tasks',      push: 'tsyncScan', local: () => L().TASKS,
    sample: { id: 'zz1', title: 'Test task', createdBy: P, status: 'open' } }
];

/* Every drawer has to be attached and to have heard from the server before it
   will send anything. That is the heartbeat's job, so run it. */
win.storeScan();
DRAWERS.forEach(d => { emit(d.coll, [], false); });   /* the first SERVER answer */
win.storeScan();
reset();

/* ------------------------------------------------------------------------ */
section('1. Every drawer is here');
{
  const listened = Object.keys(state.listeners).filter(k => (state.listeners[k] || []).length);
  /* Four collections are checked by their own harnesses instead: the crew
     claims and the map are in test-mapsync.js, service history is write-once
     so it can never argue, and lifted restrictions ride with the studies. */
  const elsewhere = ['crew', 'mapplaces', 'eqmaint', 'triallifts', 'farmsettings'];
  const missing = listened.filter(c => elsewhere.indexOf(c) < 0 && !DRAWERS.some(d => d.coll === c));
  ok('no drawer the app listens to has been left out of the table below',
     missing.length === 0, missing.join(','));
}

/* ------------------------------------------------------------------------
   THE CHECK ITSELF. Hand the drawer a record, then hand it back again exactly
   as it is. It must have nothing to say. If it writes here, it will write
   forever on a real phone, and that is 4.4 million reads in a day. */
function settles(d, how, label) {
  const doc = JSON.parse(JSON.stringify(d.sample));
  emit(d.coll, [{ type: 'added', id: doc.id, data: doc }], false);
  const list = d.local() || [];
  const landed = Array.prototype.some.call(list, r => r && String(r.id) === doc.id);
  ok(d.name + ' — the record actually arrived, so this is a real check', landed,
     'not in the ' + (list.length) + ' held here');
  emit(d.coll, [{ type: 'modified', id: doc.id, data: doc }], false, how);
  reset();
  win[d.push]();
  const w = state.writes.filter(x => x.coll === d.coll);
  ok(d.name + ' settles', w.length === 0, w.length + ' sent: ' + JSON.stringify(w.map(x => x.id)));
}

section('2. A record coming back unchanged is not sent up again');
DRAWERS.forEach(d => settles(d, null));

section('3. And still not when the fields come back in a different order');
/* Reversed alphabetical: the worst order the database could hand back. Not one
   character of the record has changed, only the order of its fields. Comparing
   records as plain text without sorting them first reads this as "changed" and
   sends it up -- forever. */
DRAWERS.forEach(d => settles(d, 'reverse'));

section('4. Applying an arriving record leaves NOTHING behind');
{
  /* The specific fault in the inventory and equipment drawers: a field the
     server did not send was left sitting on the local record, so the record
     never matched and went up forever. */
  const m = L().EQUIP[0];
  if (m) {
    const doc = win.eqDoc(m);
    m.somethingThisPhoneInvented = 'left over from an older version';
    emit('equipment', [{ type: 'modified', id: doc.id, data: doc }], false);
    ok('equipment drops a field the shared copy does not have',
       !('somethingThisPhoneInvented' in m), Object.keys(m).join(','));
    reset(); win.eqPush();
    ok('and therefore has nothing to send', state.writes.filter(x => x.coll === 'equipment').length === 0);
  } else ok('no machine seeded to check', false);

  const it = L().INVENTORY[0];
  if (it) {
    const doc = win.invItemDoc(it);
    it.somethingThisPhoneInvented = 'left over from an older version';
    emit('invitems', [{ type: 'modified', id: doc.id, data: doc }], false);
    ok('products drop a field the shared copy does not have',
       !('somethingThisPhoneInvented' in it), Object.keys(it).join(','));
    reset(); win.invPush();
    ok('and therefore have nothing to send', state.writes.filter(x => x.coll === 'invitems').length === 0);
  } else ok('no product seeded to check', false);
}

section('5. An arriving record saves to the phone and does NOT start a send');
{
  /* This is the amplifier. Every snapshot handler used to call storeTouch(),
     which offers all seventeen drawers to the database on the spot -- so one
     record arriving from another phone set off a full sweep, and a loop in ONE
     drawer ran at network speed instead of once every two seconds. */
  const src = require('./_app').appText();
  ok('storeSaveLocal() exists — the save-to-phone half, with no network in it',
     typeof win.storeSaveLocal === 'function');
  /* Read the function's own body, not the whole file: storeScan() sits right
     below it and of course does contain the ticks. */
  const body = src.slice(src.indexOf('function storeSaveLocal()'));
  const mine = body.slice(0, body.indexOf('\nfunction storeScan()'));
  ok('and there is not one syncTick inside it', !/syncTick/.test(mine), String(mine.length));
  reset();
  const before = state.writes.length;
  win.storeSaveLocal();
  ok('running it sends nothing at all', state.writes.length === before, String(state.writes.length - before));

  /* THE AMPLIFIER. One record arriving must not set off a send of all
     seventeen drawers -- that is what turned a loop in ONE drawer from twice a
     second into as fast as the network would go. */
  /* Comments explaining the old mistake naturally mention it by name, so take
     them out before looking for the mistake itself. */
  const tight = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t]+/g, '');
  const blocks = tight.split('if(touched)').slice(1).map(b => b.slice(0, 300));
  ok('there are snapshot handlers to check', blocks.length > 5, String(blocks.length));
  const guilty = blocks.filter(b => /storeTouch\(/.test(b));
  ok('and not one of them asks for an immediate send', guilty.length === 0, String(guilty.length));
}

section('6. The brake');
{
  win.sdbLoopReset();
  let allowed = 0;
  for (let i = 0; i < 60; i++) if (win.sdbMaySend('product/x1', 'product')) allowed++;
  ok('a record offered over and over is stopped', allowed === win.SDB_LOOP_MAX, String(allowed));
  ok('and it is stopped well short of a day\'s allowance', allowed < 50);
  ok('a different record is not punished for it', win.sdbMaySend('product/x2', 'product') === true);
  ok('the screen is told, in words anybody can read',
     /stuck in a loop/.test(win.sdbStuckNote()), win.sdbStuckNote());
  ok('one record is counted, not sixty', win.sdbStuckCount() === 1, String(win.sdbStuckCount()));
  win.sdbLoopReset();
  ok('and reopening the app clears it', win.sdbStuckCount() === 0 && win.sdbMaySend('product/x1') === true);
}

section('7. A blown allowance is explained, not spelled out in code words');
{
  const msg = win.sdbError({ code: 'resource-exhausted' });
  ok('it does not just say resource-exhausted', !/resource-exhausted/.test(msg), msg);
  ok('it says the app still works', /still works/.test(msg), msg);
  ok('and that nothing is lost', /nothing is lost/.test(msg), msg);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
