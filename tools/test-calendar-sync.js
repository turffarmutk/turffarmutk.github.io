/*
 * The calendar — drawer 9, and the last one.
 *
 * WHAT IT IS FOR: five people keeping five versions of the same month. A spray
 * somebody put on their own calendar is a spray nobody else knows about, and
 * time off logged on a phone is time off Bill never sees until the person does
 * not turn up.
 *
 * Three things here are worth more than the plumbing:
 *
 *   - TAKING AN ENTRY OFF IS A MARK, NOT A DELETE. A phone that was switched
 *     off still holds its own copy, and pushes up whatever the shared copy is
 *     missing when it comes back. A genuinely deleted entry would come
 *     straight back, and keep coming back. The task list learned this first.
 *
 *   - WHO MAY ADD WHAT COMES OFF THE ROSTER, not off currentRole, because the
 *     database now enforces the same list. Checks below set currentRole to the
 *     wrong thing on purpose and prove the answer does not move.
 *
 *   - TIME OFF IS YOURS. An undergrad may add their own and remove their own,
 *     and may not put anybody else down as out. That is the one branch that is
 *     checked against a person's own id rather than against their role.
 *
 * Run:  node tools/test-calendar-sync.js
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
const wrote = () => state.writes.filter(w => w.coll === 'events');

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

try {
  win.eval(appSource(win.document)
    + '\n;window.__EV=EVENTS; window.__ROLE=function(v){ if(v!==undefined) currentRole=v; return currentRole; };');
} catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const appText = require('./_app').appText();
const rulesText = fs.readFileSync(RULES, 'utf8');
const EV = () => win.__EV;
const BILL = 'p07', TECH = 'p01', GRAD = 'p09', FACULTY = 'p13', UNDERGRAD = 'p18', OTHERUG = 'p19';
const as = pid => win.sessionSet(pid);
const clearCal = () => { EV().length = 0; };
const ev = over => Object.assign({
  id: win.newId('ev'), date: '2026-09-03', endDate: null, type: 'event', title: 'Field day',
  sub: 'Field day', time: '9:00a–11:00a', person: null, lab: 'Bill', notes: '',
  repeat: 'None', repeatEndDate: null
}, over || {});
const timeOff = pid => ev({ type: 'crew', person: pid, status: 'out', title: 'Time off', sub: 'Time off' });

/* ------------------------------------------- 1. who may add what -------- */
section('1. Who may put what on the month — off the roster');
as(BILL);
ok('Bill may put somebody down as out', win.calCanAddType('crew') === true);
ok('and add anything else', ['event', 'spray', 'trial', 'other'].every(t => win.calCanAddType(t)));
as(TECH);
ok('a technician may schedule a spray', win.calCanAddType('spray') === true);
ok('but may not put somebody down as out', win.calCanAddType('crew') === false);
as(GRAD);
ok('a grad may add a trial visit', win.calCanAddType('trial') === true);
as(FACULTY);
ok('faculty may add an event', win.calCanAddType('event') === true);
ok('but a spray is the crew\'s to schedule', win.calCanAddType('spray') === false);
as(UNDERGRAD);
ok('an undergrad adds their own time off', win.calAddTypesFor(UNDERGRAD).join(',') === 'timeoff');
ok('and nothing else', ['event', 'spray', 'trial', 'crew', 'other'].every(t => !win.calCanAddType(t)));
ok('the Add screen is built from that same list',
   win.calAddTypes().join(',') === 'timeoff');

section('1b. currentRole cannot talk the app into the wrong answer');
as(UNDERGRAD); win.__ROLE('manager');
ok('an undergrad with currentRole set to manager still gets only time off',
   win.calAddTypes().join(',') === 'timeoff', win.calAddTypes().join(','));
as(BILL); win.__ROLE('undergrad');
ok('and Bill with currentRole set to undergrad still gets everything',
   win.calAddTypes().length === 5);
win.__ROLE('manager');
ok('somebody taken off the roster may add nothing',
   (function () { as(TECH); const me = win.PEOPLE.find(p => p.id === TECH);
     const was = me.active; me.active = false;
     const out = win.calAddTypesFor(TECH).length; me.active = was; return out === 0; })());

/* --------------------------------------------- 2. who may remove -------- */
section('2. Taking an entry off the month');
as(BILL);
ok('Bill may remove a farm event', win.calCanRemoveEvent(ev()) === true);
ok('and somebody else\'s time off', win.calCanRemoveEvent(timeOff(UNDERGRAD)) === true);
as(UNDERGRAD);
ok('an undergrad may remove their OWN time off — their mistake to undo',
   win.calCanRemoveEvent(timeOff(UNDERGRAD)) === true);
ok('but not another undergrad\'s', win.calCanRemoveEvent(timeOff(OTHERUG)) === false);
ok('and not a farm event', win.calCanRemoveEvent(ev()) === false);
as(TECH);
ok('a technician may not remove a farm event either', win.calCanRemoveEvent(ev()) === false);

/* ----------------------------------------- 3. a mark, never a delete ---- */
section('3. An entry is marked, never deleted');
ok('the app no longer rebuilds the list with filter()',
   !/EVENTS=EVENTS\.filter/.test(appText));
{
  as(BILL); clearCal();
  const e = ev({ id: 'ev1' }); EV().push(e);
  win.calRemoveEvent('ev1');
  ok('removing marks it', e.removed === true);
  ok('and says who and when', e.removedBy === BILL && !!e.removedAt);
  ok('the record itself stays on the list', EV().length === 1);
  ok('and it stops being drawn', win.calVisible(e) === false);
}
{
  as(UNDERGRAD); clearCal();
  const mine = timeOff(UNDERGRAD); mine.id = 'ev2';
  const theirs = timeOff(OTHERUG); theirs.id = 'ev3';
  EV().push(mine, theirs);
  win.calRemoveEvent('ev2');
  ok('an undergrad removing their own time off works', mine.removed === true);
  win.calRemoveEvent('ev3');
  ok('and removing somebody else\'s does nothing at all', !theirs.removed);
}

/* --------------------------------------------- 4. what travels ---------- */
section('4. What leaves the phone');
as(BILL);
win.evsyncSetWanted(true);
ok('a listener is attached', (state.listeners['events'] || []).length > 0);
ok('it is on from the moment the app opens', win.EVSYNC.on === true);
ok('nothing on this phone decides that', /function evsyncWanted\(\)\{ return true; \}/.test(appText));
ok('and there is no button to turn it off', !/evsyncSetWanted\(false\)/.test(appText));
ok('it rides the two-second scan', appText.indexOf('evsyncTick();') > 0);
ok('and is hydrated at startup', appText.indexOf('evsyncHydrate();') > 0);
{
  clearCal(); reset();
  EV().push(ev({ id: 'ev10', type: 'spray', title: 'Spray B12' }));
  ok('nothing goes up before the shared copy has landed', wrote().length === 0);
  emit('events', [], false);
  ok('once it has, this phone sends what the farm is missing', wrote().length === 1);
  ok('and every entry says plainly whether it was taken off',
     wrote().every(w => w.data.removed === false));
}
{
  /* An undergrad's phone must not push a spray somebody else's phone made,
     because the database would only refuse it. */
  as(UNDERGRAD); clearCal(); reset();
  EV().push(ev({ id: 'ev11', type: 'spray', title: 'Spray B12' }));
  EV().push(timeOff(UNDERGRAD));
  win.evPush();
  ok('an undergrad sends their own time off', wrote().some(w => w.data.type === 'crew'));
  ok('and does not send a spray it has no business sending',
     !wrote().some(w => w.data.type === 'spray'));
}

section('5. What arrives');
{
  as(BILL); clearCal(); reset();
  emit('events', [{ id: 'ev20', data: { id: 'ev20', date: '2026-09-10', type: 'trial', title: 'Trial rating', removed: false } }]);
  ok('an entry somebody else added arrives', EV().some(x => x.id === 'ev20'));
  const got = EV().find(x => x.id === 'ev20');
  ok('and is drawn', win.calVisible(got) === true);
  emit('events', [{ type: 'modified', id: 'ev20', data: { id: 'ev20', date: '2026-09-10', type: 'trial', title: 'Trial rating', removed: true } }]);
  ok('a removal made elsewhere takes it off this month too', got.removed === true);
  ok('and the record is updated in place, not swapped out', EV().find(x => x.id === 'ev20') === got);
  emit('events', [{ type: 'removed', id: 'ev20', data: {} }]);
  ok('a document deleted straight from the console reads as removed, not as still on', got.removed === true);
}
{
  /* The whole point of a mark rather than a delete. */
  as(BILL); clearCal(); reset();
  const e = ev({ id: 'ev30' }); e.removed = true; e.removedBy = BILL; EV().push(e);
  win.evPush();                       /* what the two-second scan does on reconnect */
  const w = wrote().find(x => x.id === 'ev30');
  ok('a phone coming back online pushes the REMOVAL up, not the entry',
     !!w && w.data.removed === true);
}

/* ----------------------------------------- 6. the database agrees ------- */
section('6. The database says the same thing');
ok('there is a calendar block', /match \/events\/\{eventId\}/.test(rulesText));
ok('reading is open to everyone signed in, like every other drawer',
   /match \/events\/\{eventId\}[\s\S]{0,120}allow read: if actor\(\);/.test(rulesText));
ok('the types each role may add are spelled out',
   /function calTypesFor\(role\)/.test(rulesText)
   && /'Farm Manager' \? \['crew', 'event', 'spray', 'trial', 'other'\]/.test(rulesText));
ok('faculty cannot schedule a spray there either',
   /role == 'Faculty' \? \['event', 'trial', 'other'\]/.test(rulesText));
ok('time off is checked against the person\'s own id, not their role',
   /function calIsOwnTimeOff\(d\)[\s\S]{0,140}d\.get\('person', ''\) == me\(\)/.test(rulesText));
ok('Bill may remove anything; everybody else only their own time off',
   /function calMayRemove\(d\)[\s\S]{0,160}'Farm Manager' \|\| calIsOwnTimeOff\(d\)/.test(rulesText));
ok('a new entry may not arrive already marked as removed',
   /allow create:[\s\S]{0,400}removed == false;/.test(rulesText));
ok('an update may never move the day, the kind, or whose it is',
   /request\.resource\.data\.date == resource\.data\.date/.test(rulesText)
   && /request\.resource\.data\.type == resource\.data\.type/.test(rulesText)
   && /get\('person', ''\) == resource\.data\.get\('person', ''\)/.test(rulesText));
ok('an entry can never be un-removed once it is marked',
   /removed == true && resource\.data\.removed == false/.test(rulesText));
ok('and nothing may be deleted outright',
   /match \/events\/\{eventId\}[\s\S]*?allow delete: if false;/.test(rulesText));
ok('the drawer never calls delete either', state.deletes.length === 0);

section('7. The twelfth read-out, and no switches');
ok('it has a read-out on the Shared database screen', /st:EVSYNC,\s*summary:evsyncSummary\(\)/.test(appText));
ok('the read-out is in the list', /st:EQSYNC[\s\S]{0,1200}st:EVSYNC/.test(appText));
ok('twelve drawers now, and every one of them on',
   (appText.match(/summary:[a-z]+syncSummary\(\)/g) || []).length === 12);
ok('it says in plain words what is being shared', /five people keeping five versions/.test(appText));
ok('and that a removal sticks', /stays gone instead of coming back/.test(appText));
ok('the summary reads in plain words', /this phone keeps its own month/.test(appText));

/* ---------------------------------------------------------------- */
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
