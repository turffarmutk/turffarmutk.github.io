/*
 * Harness for the sign-in module.
 *
 * What it pins, and why each one matters:
 *
 *   1. No session, no app. The old picker let anyone be anyone; that must not
 *      come back, so the harness also checks the picker is gone for good.
 *   2. The roster id arrives as a CUSTOM CLAIM on the token. It cannot come
 *      from an email lookup — the crew's addresses were deliberately removed
 *      from the app and are not coming back.
 *   3. Offline never signs anybody out. This is a field app on a farm with dead
 *      spots. Boot must paint from the stored record without touching the
 *      network, and an unreachable server must change nothing.
 *   4. The role is derived from the roster, never taken from the client. A
 *      token says who you are; the roster says what you may do.
 *   5. A failed sign-in must not reveal whether an account exists — otherwise
 *      anyone with the URL can work out who does and does not work here.
 *
 * Firebase is stubbed. The real library is exercised in a browser, against a
 * real project, once the farm's Firebase project exists.
 *
 * Run:  node tools/test-auth.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');
const HTML = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

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

function makeLS(store) {
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: i => Object.keys(store)[i],
  };
  Object.defineProperty(ls, 'length', { get: () => Object.keys(store).length });
  return ls;
}

const EX = ['SESSION','sessionSet','sessionClear','currentRole','me','rstIsAdmin','rstFind','isoLocal',
            'authBoot','authVerify','authSignIn','authSignOut','authRenderLogin','authRenderAccount',
            'authLocal','authSaveLocal','authClearLocal','authClaims','authPidOfClaims','authIsAdminClaims',
            'authEnter','fbAuth','authConfigured','authSendReset','FB_CONFIG','AUTH_KEY','signInAdmin','lgHome','go','goRoot','stack'];

/* A signed-in user as Firebase hands one back. The roster id rides in the
   token claims, and getIdTokenResult(false) must be answerable with no
   network — that is the whole point of using a claim rather than a lookup. */
const userFor = (pid, admin) => ({
  uid: 'uid-' + pid,
  email: 'someone@example.edu',
  getIdTokenResult: () => Promise.resolve({ claims: { pid: pid, app_admin: !!admin } }),
  updatePassword: () => Promise.resolve()
});

/*
 * `fake` controls what the stubbed Firebase says:
 *   user       — what a sign-in returns (null = wrong credentials)
 *   session    — the user onAuthStateChanged reports (null = signed out)
 *   throws     — every call rejects, i.e. the server is unreachable
 *   offline    — navigator.onLine is false
 *   configured — false to simulate a copy with no Firebase project yet
 */
function boot(store, fake) {
  fake = fake || {};
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
  const win = dom.window;
  win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
  win.turf = turf;
  win.BroadcastChannel = class { postMessage() {} close() {} };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
  Object.defineProperty(win, 'localStorage', { value: makeLS(store), configurable: true });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });
  Object.defineProperty(win.navigator, 'onLine', { value: fake.offline ? false : true, configurable: true });

  const seen = { signOut: 0, signIn: 0, watch: 0, reset: 0, resetTo: null };
  const rej = (code) => Promise.reject(Object.assign(new Error('x'), { code: code || 'auth/network-request-failed' }));

  const authObj = {
    get currentUser() { return fake.session || null; },
    signInWithEmailAndPassword: () => {
      seen.signIn++;
      if (fake.throws) return rej();
      return fake.user ? Promise.resolve({ user: fake.user }) : rej('auth/invalid-credential');
    },
    onAuthStateChanged: (cb) => {
      seen.watch++;
      if (fake.throws) return () => {};
      setTimeout(() => cb(fake.session || null), 0);
      return () => {};
    },
    signOut: () => { seen.signOut++; return fake.throws ? rej() : Promise.resolve(); },
    sendPasswordResetEmail: (email) => {
      seen.reset++; seen.resetTo = email;
      if (fake.throws) return rej();
      /* Firebase really does reject for an address with no account. The app
         must not let that difference reach the screen. */
      return fake.knownEmail && email !== fake.knownEmail
        ? rej('auth/user-not-found') : Promise.resolve();
    }
  };
  win.firebase = {
    apps: [],
    initializeApp: function () { win.firebase.apps.push({}); return {}; },
    auth: function () { return authObj; }
  };

  const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};'
      + '\n;window.__get=function(k){return eval(k);};'
      + '\n;window.__set=function(k,v){eval(k+"=v");};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

  /* The shipped file has an empty FB_CONFIG until the farm's project exists.
     Fill it in here so the module can be exercised, and clear the one-shot
     guard so the handle gets built with it. */
  try {
    /* The shipped file now carries the farm's real project. Swap in a test one
       to exercise the module, or blank it to simulate a copy that has not been
       set up — and clear the one-shot guard either way so the handle is rebuilt
       from whichever config we just installed. */
    win.__set('FB_CONFIG', fake.configured === false
      ? { apiKey: '', authDomain: '', projectId: '', appId: '' }
      : { apiKey: 'test-key', authDomain: 't.firebaseapp.com', projectId: 't', appId: '1:2:web:3' });
    win.__set('_fbTried', false);
    win.__set('_fbAuth', null);
  } catch (e) {}
  return { win, doc: win.document, p: win.__p || {}, errs, seen };
}
const settle = () => new Promise(r => setTimeout(r, 40));

(async function () {

section('0. it boots');
{
  const b = boot({});
  ok('no jsdom errors on load', b.errs.length === 0, b.errs[0]);
  ok('the auth module is present', typeof b.p.authSignIn === 'function' && typeof b.p.authBoot === 'function');
  ok('a handle is configured once the project details are in', b.win.__get('authConfigured')() === true);
}

section('1. the config is the public kind, and no secret is near it');
{
  ok('the shipped file carries a FB_CONFIG block', /var FB_CONFIG = \{[\s\S]*?\};/.test(HTML));
  /* A service-account key bypasses every rule. It must never be in a file
     served to browsers, and this repo is public. */
  ok('no service-account key is anywhere in the file',
     !/"type"\s*:\s*"service_account"|private_key|BEGIN PRIVATE KEY/.test(HTML));
}

section('2. the sign-in screen is an email and password form, not a picker');
{
  const b = boot({});
  const email = b.doc.getElementById('lg-email'), passw = b.doc.getElementById('lg-pass');
  ok('there is an email field', !!email && email.type === 'email', email && email.type);
  ok('and a masked password field', !!passw && passw.type === 'password', passw && passw.type);
  const login = b.doc.getElementById('s-login');
  ok('no picker rows remain', login.querySelectorAll('[data-pid]').length === 0);
  /* The old screen listed all 23 names to anyone who opened the app. */
  const names = (login.textContent || '');
  ok('no crew member is named on it', !/Czekai|Gibbons|McCallum|Brosnan/.test(names), names.slice(0, 80));
  ok('the old picker renderer is gone for good', HTML.indexOf('function renderSignIn') < 0);
}

section('3. with no stored session, nobody is signed in');
{
  const b = boot({});
  ok('boot reports nobody', b.p.authBoot() === false);
  ok('SESSION.pid is null', b.win.__get('SESSION').pid === null, b.win.__get('SESSION').pid);
  ok('and the least-privileged role is what paints', b.win.__get('currentRole') === 'undergrad', b.win.__get('currentRole'));
}

section('4. a good sign-in puts the right person in');
{
  const store = {};
  const b = boot(store, { user: userFor('p09') });
  b.p.authSignIn('rose@example.edu', 'a-good-password');
  await settle();

  ok('the person is signed in', b.win.__get('SESSION').pid === 'p09', b.win.__get('SESSION').pid);
  /* p09 is a Graduate Student on the roster. Nothing the client sent said so. */
  ok('the role is derived from the roster, never sent by the client',
     b.win.__get('currentRole') === 'grad', b.win.__get('currentRole'));
  const rec = JSON.parse(store['ut_auth_v1'] || 'null');
  ok('the device remembers for next time', rec && rec.pid === 'p09', JSON.stringify(rec));
  ok('the password is not stored anywhere', JSON.stringify(store).indexOf('a-good-password') < 0);
}

section('5. a bad sign-in says nothing useful to a stranger');
{
  const b = boot({}, { user: null });
  b.p.authSignIn('someone@example.edu', 'wrong');
  await settle();
  ok('a bad password gets nobody in', b.win.__get('SESSION').pid === null);
  const msg = (b.doc.getElementById('lg-msg') || {}).textContent || '';
  ok('and the message does not reveal who has an account',
     /do not match/i.test(msg) && !/no account|not found|unknown/i.test(msg), msg);
}

section('6. an account with no roster id is refused');
{
  const b = boot({}, { user: { uid: 'x', email: 'a@b.c', getIdTokenResult: () => Promise.resolve({ claims: {} }) } });
  b.p.authSignIn('a@b.c', 'right-password');
  await settle();
  ok('a valid password with no pid on the token is refused', b.win.__get('SESSION').pid === null);
  const msg = (b.doc.getElementById('lg-msg') || {}).textContent || '';
  ok('and it explains why', /roster/i.test(msg), msg);
}

section('7. offline: the stored record opens the app, and nothing signs you out');
{
  const store = {};
  const first = boot(store, { user: userFor('p18') });
  first.p.authSignIn('u@example.edu', 'pw');
  await settle();
  ok('signed in while online', first.win.__get('SESSION').pid === 'p18');

  /* Same device, no signal, fresh start. */
  const b = boot(store, { offline: true, throws: true });
  const opened = b.p.authBoot();
  ok('boot opens the app from the stored record', opened === true);
  ok('as the right person', b.win.__get('SESSION').pid === 'p18', b.win.__get('SESSION').pid);
  ok('and it did not call the server to decide that', b.seen.watch === 0, String(b.seen.watch));

  b.p.authVerify();
  await settle();
  ok('an unreachable server does not sign you out', b.win.__get('SESSION').pid === 'p18');
  ok('and the stored record survives', !!store['ut_auth_v1']);
}

section('8. online with a genuinely ended session does sign you out');
{
  const store = {};
  const first = boot(store, { user: userFor('p18') });
  first.p.authSignIn('u@example.edu', 'pw');
  await settle();

  const b = boot(store, { session: null });   /* reachable, and says nobody */
  b.p.authBoot();
  b.p.authVerify();
  await settle();
  ok('online with no server session does sign you out', b.win.__get('SESSION').pid === null,
     b.win.__get('SESSION').pid);
  ok('the stored record is cleared', !store['ut_auth_v1']);
  ok('and the login screen says so',
     /sign in again/i.test((b.doc.getElementById('lg-msg') || {}).textContent || ''));
}

section('9. signing out clears the device even if the network fails');
{
  const store = {};
  const first = boot(store, { user: userFor('p09') });
  first.p.authSignIn('r@example.edu', 'pw');
  await settle();

  const b = boot(store, { throws: true });
  b.p.authBoot();
  b.p.authSignOut();
  await settle();
  ok('the session is gone', b.win.__get('SESSION').pid === null);
  ok('the stored record is gone too', !store['ut_auth_v1']);
  ok('and the role drops to the least privileged', b.win.__get('currentRole') === 'undergrad');
}

section('10. the admin flag is honoured, and only from the token');
{
  const a = boot({}, { user: userFor('p01', true) });
  a.p.authSignIn('admin@example.edu', 'pw');
  await settle();
  ok('an admin account lands in the admin role', a.win.__get('currentRole') === 'admin', a.win.__get('currentRole'));

  const c = boot({}, { user: userFor('p01', false) });
  c.p.authSignIn('admin@example.edu', 'pw');
  await settle();
  ok('the same person without the flag does not', c.win.__get('currentRole') !== 'admin', c.win.__get('currentRole'));
}

section('11. a copy with no Firebase project still runs and says so');
{
  const b = boot({}, { configured: false });
  ok('it does not throw', b.errs.length === 0, b.errs[0]);
  ok('and reports itself unconfigured', b.win.__get('authConfigured')() === false);
  b.p.authRenderLogin();
  const note = (b.doc.getElementById('lg-note') || {}).textContent || '';
  ok('the screen explains rather than failing silently', /not set up/i.test(note), note);
}

section('12. a stale record for somebody who has left cannot sign in');
{
  const store = { 'ut_auth_v1': JSON.stringify({ pid: 'p99', email: 'gone@example.edu', admin: false }) };
  const b = boot(store, {});
  ok('boot refuses an id that is not on the roster', b.p.authBoot() === false);
  ok('and clears the stale record', !store['ut_auth_v1']);
}

section('13. setting a first password, and forgetting one, are the same flow');
{
  const b = boot({}, { knownEmail: 'rose@example.edu' });
  const link = b.doc.getElementById('lg-reset');
  ok('the sign-in screen offers it', !!link, 'no #lg-reset');
  ok('and it covers both cases in one line',
     /first time/i.test(link.textContent) && /forgot/i.test(link.textContent), link.textContent);

  /* With no address typed it must ask, not silently do nothing. */
  b.p.authSendReset();
  await settle();
  ok('an empty box asks for the address', b.seen.reset === 0 &&
     /email/i.test((b.doc.getElementById('lg-msg') || {}).textContent || ''));

  b.doc.getElementById('lg-email').value = 'rose@example.edu';
  b.p.authSendReset();
  await settle();
  ok('a known address sends the link', b.seen.reset === 1 && b.seen.resetTo === 'rose@example.edu');
  const good = (b.doc.getElementById('lg-msg') || {}).textContent || '';
  ok('and tells them to expect it', /link/i.test(good), good);
}

section('14. the reset flow cannot be used to discover who works here');
{
  /* This is the whole reason the flow is safe to expose publicly. A stranger
     must not be able to tell a real farm address from an invented one. */
  const b = boot({}, { knownEmail: 'rose@example.edu' });
  b.doc.getElementById('lg-email').value = 'rose@example.edu';
  b.p.authSendReset();
  await settle();
  const known = (b.doc.getElementById('lg-msg') || {}).textContent || '';

  const c = boot({}, { knownEmail: 'rose@example.edu' });
  c.doc.getElementById('lg-email').value = 'not-a-real-person@example.edu';
  c.p.authSendReset();
  await settle();
  const unknown = (c.doc.getElementById('lg-msg') || {}).textContent || '';

  ok('an unknown address is still attempted', c.seen.reset === 1);
  ok('and the wording is IDENTICAL either way', known === unknown,
     JSON.stringify({ known: known.slice(0, 40), unknown: unknown.slice(0, 40) }));
  ok('neither message says whether an account exists',
     !/no account|not found|unknown|does not exist/i.test(known + unknown), known);
}

section('15. offline, it says so rather than pretending to send');
{
  const b = boot({}, { offline: true, knownEmail: 'rose@example.edu' });
  b.doc.getElementById('lg-email').value = 'rose@example.edu';
  b.p.authSendReset();
  await settle();
  ok('nothing was sent', b.seen.reset === 0);
  ok('and it explains why', /signal|connection/i.test((b.doc.getElementById('lg-msg') || {}).textContent || ''));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})();
