/*
 * The roster — drawer 13, and the one the other twelve stand on.
 *
 * WHAT IT IS FOR: hiring somebody used to take a source-code edit and a push to
 * twenty-three phones, which docs/SUCCESSION.md says is exactly the kind of
 * change that stops happening the day Dillon leaves. The roster moves into the
 * shared database so the Roster screen is the only thing anybody has to touch.
 *
 * Four things here are worth more than the plumbing:
 *
 *   - IT STARTS WITHOUT A SESSION, and it is the only drawer that does. A new
 *     hire's phone has never had the app, so its list of people does not
 *     contain them, so sessionSet() refuses them, so they are told they are not
 *     on the roster — which is the opposite of the truth. The roster has to be
 *     allowed to arrive before the app knows who is holding the phone.
 *
 *   - APPLYING AN ARRIVING RECORD MUST LEAVE NOTHING TO PUSH BACK. A drawer
 *     sends a record whenever it differs from what the server last said. If
 *     applying left any difference behind, two phones would write at each other
 *     twice a second forever and spend the free plan's twenty thousand daily
 *     writes in about seven hours. Section 5 is that regression test and it is
 *     the most valuable check in this file.
 *
 *   - EMAIL ADDRESSES NEVER TRAVEL HERE. A roster record is readable by
 *     everybody signed in. Addresses are filed one row per person, readable
 *     only by their owner. An arriving record must not wipe the address this
 *     phone already had, either.
 *
 *   - A RECORD WITH THE OLD SHAPE IS IGNORED. A phone whose saved copy of the
 *     app is a week old still sends the old four-field record with no names in
 *     it. Taking those would show the whole farm a list of people with no
 *     names and nothing to explain it.
 *
 * Run:  node tools/test-rostersync.js
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
             onSnapshot(opts, next, err) { (state.listeners[name] = state.listeners[name] || []).push({ next, err, opts }); return () => { state.listeners[name] = []; }; } };
  },
  doc: p => docRef('_', p),
  batch() {
    const q = [];
    return { set(ref, data) { q.push({ ref, data }); }, commit() { q.forEach(w => w.ref.set(w.data)); return Promise.resolve(); } };
  }
};
/* Signed in to Firebase is a separate thing from being on the roster, and this
   drawer turns on the first without waiting for the second. */
let currentUser = { uid: 'u1', email: 'someone@utk.edu' };
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { get currentUser() { return currentUser; }, onAuthStateChanged() { return () => {}; } }; },
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
const wrote = () => state.writes.filter(w => w.coll === 'roster');

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
    + '\n;window.__P=function(){return PEOPLE;}; window.__S=RSTSYNC;'
    + ' window.__ROLE=function(v){ if(v!==undefined) currentRole=v; return currentRole; };');
} catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const appText = require('./_app').appText();
const rulesText = fs.readFileSync(RULES, 'utf8');
const P = () => win.__P();
const S = () => win.__S;
const BILL = 'p07', UG = 'p18';
const as = pid => win.sessionSet(pid);
const find = id => P().filter(p => p.id === id)[0] || null;

/* Bring the drawer up and get past the "waiting for the shared copy" gate.
   `fromCache:false` is what says the server itself answered, which is the only
   thing that lets a phone start sending. */
function live(seed) {
  win.rstsyncStop();
  /* setWanted rather than start, because it clears the ten-second backoff a
     previous deliberate failure left behind — section 2 turns the drawer down
     on purpose and every section after it would otherwise be talking to a
     listener that was never opened. */
  win.rstsyncSetWanted(true);
  emit('roster', seed || [], false);
  reset();
}

/* ---------------------------------------------------------------------- */
section('1. It is a drawer like the others, and it is wired in');
{
  ok('the collection is roster', win.RSTSYNC_COLL === 'roster');
  ok('it has the same state shape as every other drawer',
     ['on', 'live', 'ready', 'seen', 'err', 'up', 'down', 'failed'].every(k => k in S()));
  ok('sharing has no off switch, like the rest', win.rstsyncWanted() === true);
  ok('it is hydrated at boot', /rstsyncHydrate\(\);/.test(appText));
  ok('it is ticked on the scan', /rstsyncTick\(\);/.test(appText));
  ok('it has a read-out on the Shared database screen',
     /st:RSTSYNC,\s*summary:rstsyncSummary\(\)/.test(appText));
  ok('the listener asks to be told when the connection comes up',
     (state.listeners.roster || []).every(l => l.opts && l.opts.includeMetadataChanges === true));
  ok('the rules have a per-person roster block', /match \/roster\/\{pid\}/.test(rulesText));
}

section('2. It starts WITHOUT a session — the deadlock');
{
  /* The whole reason this drawer differs. Nobody is on the roster yet as far
     as this phone is concerned; it must still be allowed to fetch the roster,
     because the roster is what would tell it who this person is. */
  win.rstsyncStop();
  win.sessionClear();
  currentUser = { uid: 'u1', email: 'newhire@utk.edu' };
  S().on = true;
  ok('it comes up with nobody signed in to the app', win.rstsyncStart() === true);
  ok('and it really is listening', (state.listeners.roster || []).length > 0);

  /* And it does NOT come up for somebody not signed in to Firebase at all. */
  win.rstsyncStop();
  currentUser = null;
  ok('but not for somebody signed in to nothing', win.rstsyncStart() === false);
  ok('and it says so in plain words', /not signed in/i.test(S().err), S().err);
  currentUser = { uid: 'u1', email: 'someone@utk.edu' };
}

section('3. A new hire arrives, and can then be signed in');
{
  as(BILL);
  live([]);
  ok('the farm starts without p25', !find('p25'));
  emit('roster', [{ id: 'p25', data: {
    id: 'p25', first: 'Nora', last: 'Ellis', pron: 'she/her/hers',
    role: 'Undergraduate Student', lab: 'Bill', active: true, grants: [], v: 2 } }], false);
  const nora = find('p25');
  ok('she is on this phone now', !!nora, String(P().length));
  ok('with her name', nora && nora.first === 'Nora' && nora.last === 'Ellis');
  ok('and her role and lab', nora && nora.role === 'Undergraduate Student' && nora.lab === 'Bill');
  ok('she can be signed in, which is the whole point', win.sessionSet('p25') === true);
  ok('and she lands as an undergrad', win.__ROLE() === 'undergrad', win.__ROLE());
  ok('she is in the undergrad pool Bill assigns from', win.rstUndergradIds().indexOf('p25') >= 0);
  ok('the roster was written back to the phone',
     JSON.parse(store.ut_people_v1 || '[]').some(p => p.id === 'p25'));
  as(BILL);
}

section('4. The guards — a bad record is ignored, not adopted');
{
  as(BILL);
  live([]);
  const before = P().length;

  emit('roster', [{ id: 'p90', data: { role: 'Technician', lab: 'Bill', active: true, grants: [] } }], false);
  ok('a record with the OLD shape and no names is ignored', !find('p90'));

  emit('roster', [{ id: 'p91', data: { id: 'p91', first: 'X', last: 'Y', role: '', lab: '', active: true, grants: [], v: 2 } }], false);
  ok('a record with no role is ignored', !find('p91'));

  emit('roster', [{ id: 'p92', data: { id: 'p92', first: 'X', last: 'Y', role: 'Technician', lab: 'Bill', active: true, grants: [], v: 1 } }], false);
  ok('so is one stamped with an older shape', !find('p92'));

  ok('and nobody was added by any of them', P().length === before, P().length + ' vs ' + before);
  ok('a refused record is NOT recorded as seen, so this phone keeps offering its own',
     S().seen.p90 === undefined && S().seen.p92 === undefined);
}

section('5. Applying leaves NOTHING to push back — the write loop');
{
  /* If this section ever fails, do not "fix the test". Two phones are about to
     write at each other twice a second until the farm's daily allowance is
     gone, and nothing on screen will say why. */
  as(BILL);
  live([]);

  /* Bill's phone says Greg is in Brosnan's lab. The shared copy says Sorochan.
     The shared copy wins, and then Bill's phone must go quiet. */
  const greg = find('p05');
  ok('Greg starts in Brosnan', greg.lab === 'Brosnan', greg.lab);
  emit('roster', [{ id: 'p05', data: {
    id: 'p05', first: 'Greg', last: 'Breeden', pron: 'he/him/his',
    role: 'Technician', lab: 'Sorochan', active: true, grants: [], v: 2 } }], false);
  ok('the shared copy wins', find('p05').lab === 'Sorochan', find('p05').lab);

  reset();
  const n = win.rstPush();
  ok('and this phone sends NOTHING back', n === 0, n + ' writes: ' + wrote().map(w => w.id).join(','));
  ok('a second round is silent too', win.rstPush() === 0);

  /* The same, for a person who arrives brand new rather than one who changed. */
  emit('roster', [{ id: 'p26', data: {
    id: 'p26', first: 'Sam', last: 'Reed', pron: 'they/them/theirs',
    role: 'Technician', lab: 'Bill', active: true, grants: [], v: 2 } }], false);
  reset();
  ok('an arriving newcomer is not echoed back either', win.rstPush() === 0,
     wrote().map(w => w.id).join(','));
}

section('6. Email addresses stay out of it');
{
  as(BILL);
  live([]);
  const bill = find('p07');
  bill.email = 'wczekai@utk.edu';

  reset();
  win.rstPush();
  const blob = JSON.stringify(state.writes);
  ok('no address is ever sent', blob.indexOf('@') < 0, blob.slice(0, 120));
  ok('and no address field is offered', wrote().every(w => !('email' in w.data)));

  /* An arriving record says nothing about addresses. It must not wipe the one
     this phone already had. */
  emit('roster', [{ id: 'p07', data: {
    id: 'p07', first: 'Bill', last: 'Czekai', pron: 'he/him/his',
    role: 'Farm Manager', lab: 'Bill', active: true, grants: [], v: 2 } }], false);
  ok('an arriving record does not wipe the address on this phone',
     find('p07').email === 'wczekai@utk.edu', String(find('p07').email));

  reset();
  ok('and keeping it does not start a write loop', win.rstPush() === 0,
     wrote().map(w => w.id).join(','));
}

section('7. Taking somebody off');
{
  as(BILL);
  live([]);
  ok('Lauren is here to start with', !!find('p23'));
  emit('roster', [{ id: 'p23', type: 'removed', data: {} }], false);
  ok('a record deleted in the console goes from this phone too', !find('p23'));

  /* The one person who is never dropped: whoever is holding the phone. */
  emit('roster', [{ id: BILL, type: 'removed', data: {} }], false);
  ok('but never the person holding the phone', !!find(BILL));
  ok('so they are not signed out of their own app in a field',
     win.SESSION.pid === BILL, String(win.SESSION.pid));
}

section('8. Only somebody who may write the roster sends anything');
{
  as(UG);                                  /* an undergrad */
  live([]);
  find('p18').lab = 'Sorochan';            /* a change that would want pushing */
  reset();
  ok('an undergrad sends nothing', win.rstPush() === 0, wrote().map(w => w.id).join(','));
  ok('and the app agrees they may not', win.rosterCanPush() === false);

  as(BILL);
  reset();
  ok('Bill does send', win.rstPush() > 0);
  ok('and the app agrees he may', win.rosterCanPush() === true);
}

section('9. The migration button writes one record per person');
{
  as(BILL);
  live([]);
  reset();
  win.rosterPush().then(() => {
    const ids = wrote().map(w => w.id);
    ok('every person got their own record', ids.length === P().length, ids.length + ' vs ' + P().length);
    ok('filed under their roster id', ids.indexOf('p07') >= 0 && ids.indexOf('p01') >= 0);
    ok('each carrying the shape stamp', wrote().every(w => w.data.v === 2));
    ok('and a name', wrote().every(w => typeof w.data.first === 'string'));
    ok('no address anywhere in it', JSON.stringify(wrote()).indexOf('@') < 0);

    reset();
    ok('and the drawer does not then send it all a second time', win.rstPush() === 0,
       wrote().map(w => w.id).join(','));
    done();
  }).catch(e => { ok('the migration button works', false, String(e && e.message || e)); done(); });
}

function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
