/*
 * Profile pictures — one record per person, named after that person.
 *
 * WHAT THIS IS FOR, in one sentence: everybody on the farm puts a picture on
 * their own account and it shows up on all twenty-three phones, and nobody can
 * put a picture on anybody else's account.
 *
 * Four things here are worth more than the plumbing:
 *
 *   - EVERYBODY SETS THEIR OWN, undergraduates included. There is no role test
 *     on the way in, on purpose. A picture of your own face changes nothing for
 *     anybody else.
 *
 *   - BILL AND THE APP MANAGER CAN ONLY CLEAR, NEVER REPLACE. That is the
 *     difference between "take down a picture that should not be on the farm's
 *     phones" and "choose somebody's face", and it is enforced in both places:
 *     photoCanWrite() here and the photos block in firestore.rules. Several
 *     checks below prove a clear is allowed and the same write carrying an
 *     image is not.
 *
 *   - THE SIZE CAP IS LOAD-BEARING. A camera photo is three to five megabytes;
 *     the database refuses any record over about one, and every phone re-reads
 *     a record each time it changes. A record over the cap is refused before
 *     the wire, because a refused write is offered again on every tick forever.
 *
 *   - THE PERMISSIONS COME OFF THE ROSTER, not off currentRole. currentRole is
 *     set once at sign-in and drifts; the database reads the roster. Where the
 *     two disagree the app offers a button whose write is then refused, which
 *     looks to whoever tapped it like the app is broken. Two checks below set
 *     currentRole to the wrong thing deliberately and prove nothing moves.
 *
 * Run:  node tools/test-photos.js
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

/* Two doors into the app's own scope: currentRole, so a check can set it to the
   WRONG thing and prove the answer does not move, and the App Manager flag,
   which is a claim off the sign-in token in real life. */
try {
  win.eval(appSource(win.document)
    + '\n;window.__ROLE=function(v){ if(v!==undefined) currentRole=v; return currentRole; };'
    + ' window.__ADMIN=function(v){ if(v!==undefined) IS_APP_ADMIN=v; return IS_APP_ADMIN; };');
} catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const rulesText = fs.readFileSync(RULES, 'utf8');

/* The roles, by the roster ids they actually hold. */
const BILL = 'p07', TECH = 'p01', GRAD = 'p09', FACULTY = 'p13', UNDERGRAD = 'p18', UG2 = 'p20';
const as = pid => { win.__ADMIN(false); win.sessionSet(pid); };
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg=';
const clearPhotos = () => { win.PHOTOS.length = 0; };

/* ------------------------------------------- 1. everybody gets one ------ */
section('1. Everybody sets their own — undergraduates included');

[UNDERGRAD, GRAD, TECH, FACULTY, BILL].forEach(pid => {
  as(pid);
  ok('  ' + pid + ' may set their own picture', win.photoCanSet() === true);
  ok('  ' + pid + ' may write their own record', win.photoCanWrite(pid, IMG) === true);
});

as(UNDERGRAD);
ok('somebody signed out may not set one', (function () {
  win.sessionClear ? win.sessionClear() : (win.SESSION.pid = null);
  const r = win.photoCanSet();
  win.sessionSet(UNDERGRAD);
  return r === false;
})());

/* ------------------------------------- 2. nobody paints anyone else ----- */
section('2. Nobody puts a picture on somebody else\'s account');

[UNDERGRAD, GRAD, TECH, FACULTY, BILL].forEach(pid => {
  as(pid);
  const victim = pid === UG2 ? UNDERGRAD : UG2;
  ok('  ' + pid + ' may NOT put a picture on ' + victim,
     win.photoCanWrite(victim, IMG) === false);
});

as(BILL);
win.__ADMIN(true);
ok('not even the App Manager — this is the one thing the hat does not lift',
   win.photoCanWrite(UG2, IMG) === false);
win.__ADMIN(false);

/* --------------------------------------- 3. who may take one down ------- */
section('3. Taking somebody else\'s picture down — Bill and the App Manager');

as(BILL);
ok('Bill may clear anyone\'s', win.photoCanClear() === true && win.photoCanWrite(UG2, null) === true);

[TECH, GRAD, FACULTY, UNDERGRAD].forEach(pid => {
  as(pid);
  ok('  ' + pid + ' may not clear somebody else\'s', win.photoCanClear() === false);
  ok('  ' + pid + ' may not write ' + UG2 + '\'s record at all',
     win.photoCanWrite(UG2, null) === false);
});

as(TECH);
win.__ADMIN(true);
ok('the App Manager may clear anyone\'s, whatever farm job they hold',
   win.photoCanClear() === true && win.photoCanWrite(UG2, null) === true);
win.__ADMIN(false);

as(UNDERGRAD);
ok('and everybody may always clear their OWN', win.photoCanWrite(UNDERGRAD, null) === true);

/* ------------------------------------- 4. it comes off the roster ------- */
section('4. The answer comes off the roster, never off currentRole');

as(UNDERGRAD);
win.__ROLE('manager');          /* lying about the screen being shown */
ok('an undergrad showing the manager screens still may not clear',
   win.photoCanClear() === false);
as(BILL);
win.__ROLE('undergrad');        /* and the other way round */
ok('Bill showing an undergrad screen still may',
   win.photoCanClear() === true);
win.__ROLE('manager');

/* ------------------------------------------- 5. writing a record -------- */
section('5. Writing one, and taking one off');

as(UNDERGRAD); clearPhotos();
ok('there is no picture to start with', win.photoOf(UNDERGRAD) === '');
ok('writing one reports success', win.photoWrite(UNDERGRAD, IMG) === true);
ok('and it reads back', win.photoOf(UNDERGRAD) === IMG);
ok('as exactly one record', win.PHOTOS.length === 1);
ok('named after the person', String(win.PHOTOS[0].id) === UNDERGRAD);
ok('stamped with who and when', win.PHOTOS[0].by === UNDERGRAD && !!win.PHOTOS[0].at);

ok('clearing it reports success', win.photoClear(UNDERGRAD) === true);
ok('the picture is gone', win.photoOf(UNDERGRAD) === '');
/* THE POINT OF THIS ONE: a document genuinely deleted comes straight back off
   the next phone that reconnects still holding its own copy. */
ok('but the RECORD stays — a clear is img:null, never a deleted document',
   win.PHOTOS.length === 1 && win.PHOTOS[0].img === null);

as(GRAD);
ok('somebody else trying to write it changes nothing',
   win.photoWrite(UNDERGRAD, IMG) === false && win.photoOf(UNDERGRAD) === '');

as(BILL); clearPhotos();
win.photoWrite(BILL, IMG);
win.PHOTOS.push({ id: UG2, img: IMG, at: '2026-10-01T08:00:00.000Z', by: UG2 });
ok('Bill clearing an undergrad\'s picture works', win.photoClear(UG2) === true);
ok('and leaves the record behind with no image',
   win.photoOf(UG2) === '' && win.photoRec(UG2) !== null && win.photoRec(UG2).img === null);
ok('and does not touch his own', win.photoOf(BILL) === IMG);

/* ----------------------------------------- 6. the shape on the wire ----- */
section('6. The record that actually travels');

const d = win.phDoc({ id: UNDERGRAD, img: IMG, at: 'x', by: BILL, junk: 'local only' });
ok('is four fields and no more',
   d && Object.keys(d).sort().join(',') === 'at,by,id,img', d && Object.keys(d).join(','));
ok('with nothing nested inside it — no list in a list for Firestore to refuse',
   d && Object.keys(d).every(k => d[k] === null || typeof d[k] === 'string'));
ok('a cleared one travels as img:null',
   (function () { const x = win.phDoc({ id: UG2, img: '', at: '', by: '' }); return x && x.img === null; })());
ok('a record with no id does not travel at all', win.phDoc({ img: IMG }) === null);

/* THE SIZE CAP. A picture over it cannot have come from photoShrink(), so it
   came from an older phone or a hand edit — and the database would refuse it,
   which means the phone would offer it again on every tick forever. */
const huge = 'data:image/jpeg;base64,' + 'A'.repeat(win.PHOTO_MAX_CHARS + 10);
ok('an oversized picture is refused before the wire, not after',
   win.phDoc({ id: UNDERGRAD, img: huge, at: '', by: '' }) === null);
ok('the cap itself is small enough to be worth having',
   win.PHOTO_MAX_CHARS <= 60000 && win.PHOTO_PX <= 320,
   win.PHOTO_MAX_CHARS + ' / ' + win.PHOTO_PX);

/* ------------------------------------------------- 7. the drawer -------- */
section('7. The drawer itself');

as(BILL); clearPhotos(); reset();
win.phsyncSetWanted(true);
ok('the app listens to the photos collection',
   (state.listeners['photos'] || []).length > 0);
ok('and it is on without anybody asking — sharing is not optional',
   win.phsyncWanted() === true);

/* A record arriving is applied COMPLETELY. Leaving a field behind that the
   server did not send is the other half of the 4.4-million-read day: the
   record never matches, so it goes up again forever. */
win.PHOTOS.push({ id: UG2, img: 'old', at: 'then', by: UG2, leftover: 'should not survive' });
emit('photos', [{ type: 'modified', id: UG2, data: { id: UG2, img: IMG, at: 'now', by: UG2 } }]);
const got = win.photoRec(UG2);
ok('an arriving picture replaces what was held', got && got.img === IMG);
ok('and leaves nothing behind that the server did not send',
   got && !('leftover' in got), got && Object.keys(got).join(','));

/* Never offer the database a write it is going to refuse. This phone holds
   everybody's pictures and all but my own would be turned away. */
as(UNDERGRAD); clearPhotos();
win.PHOTOS.push({ id: UNDERGRAD, img: IMG, at: 'x', by: UNDERGRAD });
win.PHOTOS.push({ id: UG2, img: IMG, at: 'x', by: UG2 });
ok('an undergrad offers their own record', win.phCanPush(win.PHOTOS[0]) === true);
ok('and never somebody else\'s', win.phCanPush(win.PHOTOS[1]) === false);

as(BILL); clearPhotos();
win.PHOTOS.push({ id: UG2, img: IMG, at: 'x', by: UG2 });
ok('Bill does not offer another person\'s picture-bearing record either',
   win.phCanPush(win.PHOTOS[0]) === false);
win.PHOTOS[0].img = null;
ok('but he does offer the clear he just made', win.phCanPush(win.PHOTOS[0]) === true);

/* ------------------------------------------------- 8. the rules --------- */
section('8. firestore.rules says the same thing');

ok('there is a block for the pictures', /match \/photos\/\{photoId\}/.test(rulesText));
const block = (rulesText.match(/match \/photos\/\{photoId\}[\s\S]*?\n    \}/) || [''])[0];
ok('anybody signed in may read them', /allow read: if actor\(\)/.test(block));
ok('a record may not claim to be a different person',
   /request\.resource\.data\.id == photoId/.test(block));
ok('your own record is one of the two doors', /photoId == me\(\)/.test(block));
ok('and the other is a clear by somebody who may clear',
   /canClearPhoto\(\)\s*&&\s*photoIsCleared\(\)/.test(block));
ok('nothing is ever deleted — a clear is a tombstone',
   /allow delete: if false;/.test(block));
ok('the size cap is in the rules too, not just the app',
   /photoImgOk\(\)/.test(block) && /img\.size\(\) < 60000/.test(rulesText));
ok('clearing is Bill or the App Manager, matching photoCanClear()',
   /function canClearPhoto\(\)[\s\S]*?appAdmin\(\)[\s\S]*?roleOf\(me\(\)\) == 'Farm Manager'/.test(rulesText));

/* -------------------------------------- 9. registered everywhere -------- */
section('9. Registered in all four places a drawer has to be');

const appText = require('./_app').appText();
ok('the phone keeps a copy of them (STORE_DEFS)', /name:'photos'/.test(appText));
ok('the two-second heartbeat offers them', /phsyncTick\(\)/.test(appText));
ok('they are switched on at boot', /phsyncHydrate\(\)/.test(appText));
ok('and the Shared database screen explains them',
   /st:PHSYNC/.test(appText) && /Profile pictures/.test(appText));
/* The settling check is the one that proves the drawer can ever stop talking.
   A drawer without a row there is a drawer nothing proves. */
const settles = fs.readFileSync(path.join(__dirname, 'test-sync-settles.js'), 'utf8');
ok('and it has a row in the settling check, carrying a REAL picture',
   /coll: 'photos'/.test(settles) && /img: 'data:image\/jpeg/.test(settles));

/* ------------------------------------------- 10. the fallback ----------- */
section('10. Somebody with no picture still has a face');

clearPhotos();
ok('photoOf is empty for everybody', [BILL, TECH, UNDERGRAD].every(p => win.photoOf(p) === ''));
ok('so the initials are still there to fall back on',
   win.initOf(BILL) !== '?' && win.initOf(BILL).length === 2, win.initOf(BILL));
ok('and asking about nobody does not throw',
   win.photoOf(null) === '' && win.photoOf('') === '' && win.photoRec(null) === null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
