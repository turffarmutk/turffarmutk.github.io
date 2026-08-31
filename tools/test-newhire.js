/*
 * Hiring somebody, end to end, without touching the source code.
 *
 * This is the journey no other test file owns: Bill adds a person on the
 * Roster screen; the record and the address go up together; the new hire opens
 * the app on a phone that has never had it, chooses a password, and lands on
 * their own home screen.
 *
 * The three things that used to make that impossible, each pinned below:
 *
 *   1. THE ROSTER ID USED TO COME ONLY FROM THE TOKEN, stamped by a command on
 *      Dillon's Mac. Somebody hired in the app has no such stamp, so the id is
 *      looked up from their `accounts` row instead — but ONLY when there is no
 *      claim, and ONLY when there is a network. §3 and §5.
 *
 *   2. THE PHONE HAD NEVER HEARD OF THEM. sessionSet() refuses an id it cannot
 *      find, so a brand-new hire was told "not on the roster", which was both
 *      untrue and impossible to act on. Sign-in now fetches the roster once and
 *      tries again. §4.
 *
 *   3. THE ADDRESS WAS ONLY ON DILLON'S MAC. It is in the database now, filed
 *      one row per address and readable only by its owner — never on the roster
 *      record, which everybody signed in can read. §2.
 *
 * Run:  node tools/test-newhire.js
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
const settle = () => new Promise(r => setTimeout(r, 40));

/* ------------------------------------------------- the fake database ---- */
/* Two collections matter: `roster` (a record per person) and `accounts` (a row
   per email address). Everything written is kept so the tests can look at it. */
const db = { roster: {}, accounts: {} };
const state = { writes: [], batches: 0, reads: [] };
function docRef(coll, id) {
  return {
    id: String(id),
    set(data) {
      state.writes.push({ coll, id: String(id), data });
      (db[coll] = db[coll] || {})[String(id)] = JSON.parse(JSON.stringify(data));
      return Promise.resolve();
    },
    get() {
      state.reads.push(coll + '/' + id);
      const v = (db[coll] || {})[String(id)];
      return Promise.resolve({ exists: v !== undefined, data: () => v });
    },
    delete() { delete (db[coll] || {})[String(id)]; return Promise.resolve(); }
  };
}
const fakeDb = {
  enablePersistence() { return Promise.resolve(); },
  collection(name) {
    return {
      doc: id => docRef(name, id),
      onSnapshot(opts, next, err) { return () => {}; },
      get() {
        state.reads.push(name + '/*');
        const rows = Object.keys(db[name] || {}).map(id => ({ id, data: () => db[name][id] }));
        return Promise.resolve({ forEach: fn => rows.forEach(fn), size: rows.length });
      }
    };
  },
  doc: p => docRef('_', p),
  batch() {
    const q = [];
    return {
      set(ref, data) { q.push({ ref, data }); },
      commit() { state.batches++; q.forEach(w => w.ref.set(w.data)); return Promise.resolve(); }
    };
  }
};

/* ----------------------------------------------------- the fake auth ---- */
/* Accounts that exist in Firebase, by address. `claims` is what the token
   carries — the twenty-four existing people have a pid on theirs; anybody
   hired through the app has an empty one, which is the whole point. */
const users = {};
let currentUser = null;
const auth = {
  get currentUser() { return currentUser; },
  createUserWithEmailAndPassword(email, pw) {
    const key = String(email).toLowerCase();
    if (users[key]) return Promise.reject({ code: 'auth/email-already-in-use' });
    users[key] = { uid: 'u_' + key, email: key, password: pw, claims: {} };
    currentUser = mkUser(key);
    return Promise.resolve({ user: currentUser });
  },
  signInWithEmailAndPassword(email, pw) {
    const key = String(email).toLowerCase();
    const u = users[key];
    if (!u || u.password !== pw) return Promise.reject({ code: 'auth/invalid-credential' });
    currentUser = mkUser(key);
    return Promise.resolve({ user: currentUser });
  },
  signOut() { currentUser = null; return Promise.resolve(); },
  onAuthStateChanged(fn) { setTimeout(() => fn(currentUser), 0); return () => {}; },
  sendPasswordResetEmail() { return Promise.resolve(); }
};
function mkUser(key) {
  return {
    uid: users[key].uid,
    email: users[key].email,
    getIdTokenResult: () => Promise.resolve({ claims: users[key].claims }),
    updatePassword: pw => { users[key].password = pw; return Promise.resolve(); }
  };
}
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return auth; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = { delete: () => ({ __delete: true }) };

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
let online = true;
Object.defineProperty(win.navigator, 'onLine', { get: () => online, configurable: true });

try {
  win.eval(appSource(win.document)
    + '\n;window.__P=function(){return PEOPLE;};'
    + ' window.__ROLE=function(){return currentRole;};');
} catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const P = () => win.__P();
const find = id => P().filter(p => p.id === id)[0] || null;
const NEW = 'nellis@vols.utk.edu';

/* The twenty-four already have their id stamped on the token. */
users['wczekai@utk.edu'] = { uid: 'u_bill', email: 'wczekai@utk.edu', password: 'x', claims: { pid: 'p07' } };

/* ---------------------------------------------------------------------- */
section('1. Bill adds somebody, entirely in the app');
{
  win.sessionSet('p07');
  const p = { id: win.rstNewId(), first: 'Nora', last: 'Ellis', pron: 'she/her/hers',
              role: 'Undergraduate Student', lab: 'Bill', email: NEW, active: true };
  P().push(p);
  win.rstSync();
  ok('the new person got the next id in order', p.id === 'p25', p.id);
  ok('and is on this phone', !!find('p25'));

  win.rosterLinkPerson(p, p.email).then(() => {
    ok('the record and the address went up in ONE batch, not two writes',
       state.batches === 1, String(state.batches));
    ok('her roster record is in the database', !!db.roster.p25);
    ok('her address row is in the database', !!db.accounts[NEW]);
    ok('and the row points at her', db.accounts[NEW] && db.accounts[NEW].pid === 'p25');
    ok('the row records who added her', db.accounts[NEW] && db.accounts[NEW].addedBy === 'p07');
    two();
  }).catch(e => { ok('adding her works', false, String(e && e.message || e)); two(); });
}

function two() {
  section('2. The address is NOT on the record everybody can read');
  ok('no address on her roster record', !('email' in db.roster.p25));
  ok('none anywhere in the roster at all',
     JSON.stringify(db.roster).indexOf('@') < 0);
  ok('it is only in the accounts row', JSON.stringify(db.accounts).indexOf('@') >= 0);
  ok('and that row holds nothing but the three agreed fields',
     Object.keys(db.accounts[NEW]).sort().join(',') === 'addedAt,addedBy,pid',
     Object.keys(db.accounts[NEW]).join(','));

  section('3. Her token carries no id, so it is looked up instead');
  /* She signs herself up — there was no laptop involved, so nobody could have
     stamped an id on her token. */
  win.authSignOut();
  auth.createUserWithEmailAndPassword(NEW, 'chosen-by-her').then(user =>
    win.authPidResolve(user.user).then(r => {
      ok('the token has nothing on it', Object.keys(users[NEW].claims).length === 0);
      ok('but she is resolved to the right person', r.pid === 'p25', String(r.pid));
      ok('and is not handed the App Manager job by accident', r.admin === false);
      ok('it read exactly one row to do it',
         state.reads.filter(x => x.indexOf('accounts/') === 0).length === 1,
         state.reads.join(' '));
      return four();
    })).catch(e => { ok('resolving her works', false, String(e && e.message || e)); four(); });
}

function four() {
  section('4. A phone that has never heard of her still lets her in');
  /* This is the deadlock. Wipe her off this phone's list of people — which is
     exactly the state a brand-new phone is in — and sign in. */
  const at = P().findIndex(p => p.id === 'p25');
  P().splice(at, 1);
  win.rstSave();
  win.sessionClear();
  ok('this phone does not know her', !find('p25'));
  ok('and would refuse her outright', win.sessionSet('p25') === false);

  store = {};
  return win.authSignIn(NEW, 'chosen-by-her') || settle().then(() => settle()).then(() => {
    ok('she is signed in anyway', win.SESSION.pid === 'p25', String(win.SESSION.pid));
    ok('because the roster was fetched on the spot',
       state.reads.indexOf('roster/*') >= 0, state.reads.join(' '));
    ok('she is on this phone now', !!find('p25'));
    ok('with her name, not a blank row', find('p25') && find('p25').first === 'Nora');
    ok('and lands on her own home screen', win.__ROLE() === 'undergrad', win.__ROLE());
    ok('the phone remembers her for next time', (store.ut_auth_v1 || '').indexOf('p25') >= 0);
    return five();
  });
}

function five() {
  section('5. None of it happens when there is no signal');
  /* The rule the whole auth file is built around: offline must never be the
     reason somebody cannot record a mow. A lookup that cannot run returns
     nothing and changes nothing — it does NOT sign anybody out. */
  online = false;
  const before = state.reads.length;
  return win.authPidResolve(mkUser(NEW)).then(r => {
    ok('no id is looked up with no signal', r.pid === null, String(r.pid));
    ok('and the database was not even asked', state.reads.length === before);
    ok('the person stays signed in regardless', win.SESSION.pid === 'p25');

    /* And a phone that already knows her opens straight up, no network. */
    win.sessionClear();
    ok('a phone that has signed in before opens offline', win.authBoot() === true);
    ok('as her', win.SESSION.pid === 'p25', String(win.SESSION.pid));
    online = true;
    return six();
  });
}

function six() {
  section('6. An address nobody added gets nowhere, and is told nothing');
  return win.authPidResolve({ uid: 'u_x', email: 'stranger@example.com',
                              getIdTokenResult: () => Promise.resolve({ claims: {} }) })
    .then(r => {
      ok('a stranger resolves to nobody', r.pid === null, String(r.pid));

      section('7. The existing crew keep working exactly as before');
      return win.authPidResolve(mkUser('wczekai@utk.edu')).then(r2 => {
        ok('Bill still gets his id straight off the token', r2.pid === 'p07', String(r2.pid));
        const reads = state.reads.filter(x => x.indexOf('accounts/') === 0).length;
        return win.authPidResolve(mkUser('wczekai@utk.edu')).then(r3 => {
          ok('and it costs the database nothing at all',
             state.reads.filter(x => x.indexOf('accounts/') === 0).length === reads,
             'extra reads for a person with a claim');
          ok('twice over', r3.pid === 'p07');
          done();
        });
      });
    });
}

function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
