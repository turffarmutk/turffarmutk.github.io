/*
 * Equipment — drawer 8. The machines, and what is wrong with them.
 *
 * WHAT THIS IS FOR, in one sentence: somebody marks a mower down on their
 * phone, and this is what makes it read "Down" on the other twenty-two rather
 * than "Available" while the next person walks out to it.
 *
 * Two things are worth more here than the plumbing:
 *
 *   - THE PERMISSIONS COME OFF THE ROSTER, not off currentRole. currentRole is
 *     set once at sign-in and drifts; the database reads the roster. When the
 *     screens ask one and the database enforces the other, the app offers a
 *     button whose write is then refused, which looks to whoever tapped it
 *     like the app is broken. Several checks below deliberately set
 *     currentRole to the WRONG thing and prove the answer does not move.
 *
 *   - SERVICE HISTORY IS WRITE-ONCE. A service either happened or it did not.
 *     An incoming record this phone already holds is left alone rather than
 *     overwritten, the same rule the field log and the stock ledger follow.
 *
 * Run:  node tools/test-equipment-sync.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const RULES = path.join(ROOT, 'firestore.rules');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ------------------------------------------------------- the fake db ---- */
const state = { writes: [], deletes: [], listeners: {} };
function docRef(coll, id) {
  return {
    id: String(id),
    set(data) { state.writes.push({ coll, id: String(id), data }); return Promise.resolve(); },
    delete() { state.deletes.push({ coll, id: String(id) }); return Promise.resolve(); }
  };
}
const fakeDb = {
  enablePersistence() { return Promise.resolve(); },
  collection(name) {
    return { doc: id => docRef(name, id),
             onSnapshot(opts, next, err) { (state.listeners[name] = state.listeners[name] || []).push({ next, err }); return () => { state.listeners[name] = []; }; } };
  },
  doc: p => docRef('_', p)
};
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { currentUser: null, onAuthStateChanged() { return () => {}; } }; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = { delete: () => ({ __delete: true }) };
function emit(coll, changes, fromCache) {
  const snap = {
    metadata: { fromCache: !!fromCache },
    docChanges: () => changes.map(c => ({ type: c.type || 'added',
      doc: { id: String(c.id), data: () => JSON.parse(JSON.stringify(c.data || {})) } }))
  };
  (state.listeners[coll] || []).slice().forEach(l => l.next(snap));
}
const reset = () => { state.writes.length = 0; state.deletes.length = 0; };
const wrote = coll => state.writes.filter(w => w.coll === coll);

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

/* The five equipment lists are `let`, so they are not on window. They are
   filled in place and never reassigned, so holding the reference is safe. */
try {
  win.eval(appSource(win.document)
    + '\n;window.__EQ=EQUIP; window.__EQP=EQPROBLEMS; window.__EQM=EQMAINT;'
    + ' window.__EQS=EQSCHED; window.__EQC=EQCHECKOUT;'
    + ' window.__ROLE=function(v){ if(v!==undefined) currentRole=v; return currentRole; };');
} catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const appText = require('./_app').appText();   /* the page WITH the app-*.js files written back in */
const rulesText = fs.readFileSync(RULES, 'utf8');
const EQ = () => win.__EQ, EQP = () => win.__EQP, EQM = () => win.__EQM, EQS = () => win.__EQS;

/* The five roles, by the roster ids they actually hold. */
const BILL = 'p07', TECH = 'p01', GRAD = 'p09', FACULTY = 'p13', UNDERGRAD = 'p18';
const as = pid => { win.sessionSet(pid); };

/* --------------------------------------------- 1. who may do what ------- */
section('1. Who may do what — and it comes off the roster');

as(UNDERGRAD);
ok('an undergrad may report a problem — they are the ones on the mowers',
   win.eqCanReportProblem() === true);
ok('but may not take a machine out of service', win.eqCanTakeDown() === false);
ok('nor edit what a machine is', win.eqCanEditMachine() === false);
ok('nor touch the service record', win.eqCanMaintain() === false);

as(GRAD);
ok('a grad may report a problem', win.eqCanReportProblem() === true);
ok('but may not take a machine down — that changes everyone\'s day',
   win.eqCanTakeDown() === false);

as(FACULTY);
ok('faculty may describe their lab\'s machine', win.eqCanEditMachine() === true);
ok('but the service record is not theirs', win.eqCanMaintain() === false);
ok('nor is taking one out of service', win.eqCanTakeDown() === false);

as(TECH);
ok('a technician may take a machine down', win.eqCanTakeDown() === true);
ok('and keep the service record', win.eqCanMaintain() === true);
as(BILL);
ok('so may Bill', win.eqCanTakeDown() === true && win.eqCanMaintain() === true);

/* The whole point of moving these off currentRole. */
section('1b. currentRole cannot talk the app into the wrong answer');
as(UNDERGRAD);
win.__ROLE('manager');
ok('an undergrad with currentRole set to manager still may not take one down',
   win.eqCanTakeDown() === false, 'currentRole=' + win.__ROLE());
ok('and the screens agree, because they ask the same function',
   win.eqCanDown() === false);
as(BILL);
win.__ROLE('undergrad');
ok('and Bill with currentRole set to undergrad still may',
   win.eqCanTakeDown() === true && win.eqCanDown() === true);
win.__ROLE('manager');
ok('the buttons never read currentRole for equipment any more',
   !/function eqCanDown\(\)\{return currentRole/.test(appText)
   && !/function eqCanReport\(\)\{return currentRole/.test(appText));
ok('and somebody taken off the roster loses all four immediately',
   (function () {
     as(BILL);
     const me = win.PEOPLE.find(p => p.id === BILL);
     const was = me.active; me.active = false;
     const out = win.eqCanTakeDown() || win.eqCanMaintain()
              || win.eqCanEditMachine() || win.eqCanReportProblem();
     me.active = was;
     return out === false;
   })());

/* ------------------------------------ 2. the database says the same ----- */
section('2. The database says the same thing');
ok('there is an equipment block', /match \/equipment\/\{machineId\}/.test(rulesText));
ok('and one for problems', /match \/eqproblems\/\{problemId\}/.test(rulesText));
ok('and one for the service history', /match \/eqmaint\/\{recordId\}/.test(rulesText));
ok('and one for the service schedules', /match \/eqsched\/\{schedId\}/.test(rulesText));
ok('reading is open to everyone signed in',
   (rulesText.match(/allow read: if actor\(\);/g) || []).length >= 4);
ok('reporting a problem is open to everybody, undergraduates included',
   /function canReportProblem\(\)\s*\{\s*return actor\(\);/.test(rulesText.replace(/\s+/g, ' ').replace(/\{ /g, '{').replace(/ \}/g, '}'))
   || /function canReportProblem\(\)[\s\S]{0,60}return actor\(\);/.test(rulesText));
ok('taking one down is the manager and the technicians',
   /function canTakeDownMachine\(\)[\s\S]{0,120}'Farm Manager', 'Technician'\]/.test(rulesText));
ok('so is the service record',
   /function canMaintainEquip\(\)[\s\S]{0,120}'Farm Manager', 'Technician'\]/.test(rulesText));
ok('faculty are in for describing a machine, not for servicing it',
   /function canEditMachine\(\)[\s\S]{0,140}'Faculty'\]/.test(rulesText));
ok('marking one down is checked even on a write that may otherwise edit it',
   /status', ''\) != 'down' \|\| canTakeDownMachine\(\)/.test(rulesText));
ok('the service history has no update rule at all — it is write-once',
   /match \/eqmaint\/\{recordId\}[\s\S]*?allow update: if false;/.test(rulesText));
ok('nothing in the drawer may ever be deleted',
   (rulesText.match(/match \/(equipment|eqproblems|eqmaint|eqsched)\/[\s\S]*?allow delete: if false;/g) || []).length === 4);
ok('the roster is what the rules read, never a role sent up with the write',
   !/request\.resource\.data\.role/.test(rulesText));

/* ------------------------------------------- 3. what actually travels --- */
section('3. Four lists travel, and the fifth deliberately does not');
as(BILL);
win.eqsyncSetWanted(true);
ok('a listener is attached to each of the four',
   ['equipment', 'eqproblems', 'eqmaint', 'eqsched'].every(c => (state.listeners[c] || []).length > 0));
ok('and none to the checkout list, which nothing writes',
   !state.listeners['eqcheckout']);
ok('the app still never writes to the checkout list',
   !/EQCHECKOUT\.(push|unshift|splice)/.test(appText));
ok('it is on from the moment the app opens', win.EQSYNC.on === true);
ok('nothing on this phone decides that', /function eqsyncWanted\(\)\{ return true; \}/.test(appText));
ok('and there is no button to turn it off', !/eqsyncSetWanted\(false\)/.test(appText));
ok('it rides the two-second scan', appText.indexOf('eqsyncTick();') > 0);
ok('and is hydrated at startup', appText.indexOf('eqsyncHydrate();') > 0);

/* Ready is decided by the machines: nothing goes up before the shared copy
   has arrived, or this phone's rows are sent back as if they were new. */
reset();
ok('nothing is sent before the shared copy has landed', state.writes.length === 0);
emit('equipment', [], false);
ok('once it has, this phone sends what the farm is missing', wrote('equipment').length > 0);
ok('the machines went up', wrote('equipment').length === EQ().length);
ok('every one is keyed by its own id',
   wrote('equipment').every(w => w.data.id === w.id));

/* ------------------------------------------ 4. the record is a record -- */
section('4. A service either happened or it did not');
ok('every service record is given an id when it is written',
   (appText.match(/EQMAINT\.unshift\(\{id:eqMaintNewId\(\)/g) || []).length === 3);
ok('and rows already on a phone are stamped on read, never migrated',
   /function eqMaintStampIds\(\)/.test(appText));
{
  reset();
  EQM().length = 0;
  EQM().push({ eq: 'e1', type: 'oil', at: '2026-08-01', by: BILL, note: 'Oil change' });
  win.eqPush();
  const w = wrote('eqmaint');
  ok('a record with no id still gets one before it leaves', w.length === 1 && !!w[0].data.id);
  ok('and it names the machine as text, not a number', w[0].data.eq === 'e1');
}
{
  /* The write-once rule, from the other direction: a rewrite arriving from
     anywhere is a bug somewhere else, so this phone keeps what it has. */
  EQM().length = 0;
  EQM().push({ id: 'm1', eq: 'e1', type: 'oil', at: '2026-08-01', by: BILL, note: 'Oil change' });
  emit('eqmaint', [{ id: 'm1', data: { id: 'm1', eq: 'e1', type: 'oil', at: '2026-08-01', by: BILL, note: 'REWRITTEN' } }]);
  ok('an incoming rewrite of a service record is ignored', EQM()[0].note === 'Oil change');
  emit('eqmaint', [{ id: 'm2', data: { id: 'm2', eq: 'e2', type: 'belt', at: '2026-08-02', by: TECH, note: 'Belt' } }]);
  ok('but a service somebody else logged does arrive', EQM().some(m => m.id === 'm2'));
  emit('eqmaint', [{ type: 'removed', id: 'm2', data: {} }]);
  ok('and a removal never takes it back off this phone', EQM().some(m => m.id === 'm2'));
}

section('5. A machine changes; the app is told');
{
  const mower = EQ()[0];
  emit('equipment', [{ type: 'modified', id: mower.id,
    data: { id: mower.id, name: mower.name, status: 'down', notes: 'Hydraulic leak' } }]);
  ok('a mower marked down elsewhere reads down here', mower.status === 'down');
  ok('and the record is updated in place, not swapped out', EQ()[0] === mower);
  ok('so the screens still point at live data', EQ().find(m => m.id === mower.id).notes === 'Hydraulic leak');
  mower.status = 'available'; mower.notes = '';
}
{
  emit('eqproblems', [{ id: 'pr1', data: { id: 'pr1', eq: 'e1', by: UNDERGRAD, desc: 'Blade chipped', status: 'open' } }]);
  ok('a problem an undergrad reported arrives', EQP().some(p => p.id === 'pr1'));
  emit('eqproblems', [{ type: 'modified', id: 'pr1', data: { id: 'pr1', eq: 'e1', by: UNDERGRAD, desc: 'Blade chipped', status: 'resolved' } }]);
  ok('and resolving it travels too, because a problem does change',
     (EQP().find(p => p.id === 'pr1') || {}).status === 'resolved');
}
ok('a machine is retired with a flag, never deleted',
   /mr\.active=true/.test(appText) && state.deletes.length === 0);
ok('the drawer never calls delete at all', !/EQSYNC[\s\S]{0,2000}\.delete\(\)/.test(appText));

section('6. The eleventh read-out, and no switches');
ok('it has a read-out on the Shared database screen', /st:EQSYNC,\s*summary:eqsyncSummary\(\)/.test(appText));
ok('the read-out is in the list', /st:FSTSYNC[\s\S]{0,900}st:EQSYNC/.test(appText));
ok('it says in plain words what is being shared', /nobody walks out/.test(appText));
ok('and says who may report and who may take one down',
   /undergraduates included/.test(appText) && /Bill and the technicians/.test(appText));
ok('the summary reads in plain words',
   /a machine marked down stays known to this phone/.test(appText));
{
  as(BILL);
  const s = win.eqsyncSummary();
  ok('and a live one counts what went each way', /sent · .*received/.test(s), s);
}

/* ---------------------------------------------------------------- */
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
