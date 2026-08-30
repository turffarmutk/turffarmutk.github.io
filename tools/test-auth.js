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
/* The app's code, with the app-*.js files written back into the page exactly
   where their <script> tags sit. The checks below search the source for a
   line — that something dangerous is absent, that a comment still explains
   why — and they have to search all of it, not just the part still written
   inside the page. */
const SRC = require('./_app').appText();

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
    signInWithEmailAndPassword: (email, pass) => {
      seen.signIn++;
      seen.signInWith = { email: email, pass: pass };
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
      /* Lets a test pin any Firebase code it likes — the console-misconfigured
         cases below are the ones that used to hide behind a green tick. */
      if (fake.resetCode) return rej(fake.resetCode);
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

  const scripts = require('./_app').appScripts(win.document);
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
  ok('the shipped file carries a FB_CONFIG block', /var FB_CONFIG = \{[\s\S]*?\};/.test(SRC));
  /* A service-account key bypasses every rule. It must never be in a file
     served to browsers, and this repo is public. */
  ok('no service-account key is anywhere in the file',
     !/"type"\s*:\s*"service_account"|private_key|BEGIN PRIVATE KEY/.test(SRC));
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
  ok('the old picker renderer is gone for good', SRC.indexOf('function renderSignIn') < 0);
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

section('10. the App Manager post is a HAT, not a replacement job');
{
  /* p01 is Dillon: Technician in the Sorochan lab, and also the App Manager.
     The post used to be `currentRole='admin'`, which REPLACED the job - so
     signing in stopped him being a technician, buried his own home screen and
     dropped him on the roster. The post now sits on top of the job. */
  const a = boot({}, { user: userFor('p01', true) });
  a.p.authSignIn('admin@example.edu', 'pw');
  await settle();
  ok('the post-holder keeps the job the roster gives them',
     a.win.__get('currentRole') === 'tech', a.win.__get('currentRole'));
  ok('and still holds every admin power', a.win.__get('rstIsAdmin')() === true);
  ok('their account card is their own, not an "App Manager" card',
     a.win.__get('me')().t === 'Technician', a.win.__get('me')().t);
  ok('and the roster still opens for them', a.win.__get('rstCanOpen')() === true);

  const c = boot({}, { user: userFor('p01', false) });
  c.p.authSignIn('admin@example.edu', 'pw');
  await settle();
  ok('the same person without the flag holds no admin power',
     c.win.__get('rstIsAdmin')() === false);
  ok('but is still a technician', c.win.__get('currentRole') === 'tech', c.win.__get('currentRole'));
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

section('14b. a broken project says so instead of showing a green tick');
{
  /* The bug this pins: every failure except three fell through to the
     "a link is on its way" message, so a project with sign-in switched off
     looked exactly like a working one. Only auth/user-not-found may hide —
     it is the only code that differs between a real address and an invented
     one. The rest describe the PROJECT, are the same whoever asks, and are
     what someone needs in order to fix it. */
  const msg = b => (b.doc.getElementById('lg-msg') || {}).textContent || '';
  const send = async code => {
    const b = boot({}, { resetCode: code });
    b.doc.getElementById('lg-email').value = 'rose@example.edu';
    b.p.authSendReset();
    await settle();
    return msg(b);
  };

  const pretendsToWork = t => /on its way/i.test(t);

  const off = await send('auth/operation-not-allowed');
  ok('sign-in switched off is reported', !pretendsToWork(off), off);
  ok('and it names the step that fixes it', /step 1/i.test(off), off);

  const dom = await send('auth/unauthorized-domain');
  ok('an unlisted web address is reported', !pretendsToWork(dom), dom);
  ok('and it names the step that fixes it', /step 2/i.test(dom), dom);

  const key = await send('auth/invalid-api-key');
  ok('wrong Firebase details are reported', !pretendsToWork(key), key);

  const odd = await send('auth/some-code-nobody-has-seen');
  ok('an unrecognised failure is still reported', !pretendsToWork(odd), odd);
  ok('and it hands over the code to pass on', /some-code-nobody-has-seen/.test(odd), odd);
  ok('while making clear the address is not the problem',
     /nothing is wrong with your email/i.test(odd), odd);

  /* The one that must still hide, re-checked here beside its exceptions so the
     reason the others changed cannot be misread as "surface everything". */
  const hidden = await send('auth/user-not-found');
  ok('but a missing account still shows the ordinary message', pretendsToWork(hidden), hidden);
  ok('and never says the account is missing',
     !/no account|not found|unknown|does not exist/i.test(hidden), hidden);
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

section('16. TEMPORARY email-only sign-in, and the way back off it');
{
  ok('the switch ships in the file', /var EASY_SIGN_IN = (true|false);/.test(SRC));
  ok('and the shared password with it', /var EASY_PASSWORD = '[^']+';/.test(SRC));

  const b = boot({}, { user: userFor('p09') });
  b.win.__set('EASY_SIGN_IN', true);
  b.p.authRenderLogin();
  const passw = b.doc.getElementById('lg-pass'), link = b.doc.getElementById('lg-reset');
  ok('the password box is off the screen', passw.style.display === 'none', passw.style.display);
  /* The emailed link is the thing that is broken. Leaving it on screen would
     have people standing in a field waiting for mail that never comes. */
  ok('so is the emailed-link offer', link.style.display === 'none', link.style.display);
  ok('and the screen says no password is needed',
     /no password is needed/i.test((b.doc.getElementById('lg-note') || {}).textContent || ''));

  b.p.authSignIn('rose@example.edu', '');
  await settle();
  ok('an email address on its own signs you in', b.win.__get('SESSION').pid === 'p09',
     b.win.__get('SESSION').pid);
  ok('and it was the app that supplied the password, not the person',
     b.seen.signInWith && b.seen.signInWith.pass === b.win.__get('EASY_PASSWORD'),
     JSON.stringify(b.seen.signInWith));
}
{
  const b = boot({}, { user: userFor('p09') });
  b.win.__set('EASY_SIGN_IN', true);
  b.p.authSignIn('', '');
  await settle();
  ok('an empty address asks for one rather than doing nothing',
     b.seen.signIn === 0 && /email/i.test((b.doc.getElementById('lg-msg') || {}).textContent || ''));
}
{
  /* Anyone who already has a password of their own - Dillon does. The shared
     one is refused for them, and the box has to come back. */
  const b = boot({}, { user: null });
  b.win.__set('EASY_SIGN_IN', true);
  b.p.authRenderLogin();
  b.p.authSignIn('dillon@example.edu', '');
  await settle();
  const msg = (b.doc.getElementById('lg-msg') || {}).textContent || '';
  ok('a refused shared password brings the password box back',
     b.doc.getElementById('lg-pass').style.display !== 'none');
  ok('and says what to do about it', /type it below/i.test(msg), msg);
  ok('while still not saying whether that account exists',
     !/no account|not found|unknown|does not exist/i.test(msg), msg);
}
{
  /* The check that says this is a switch and not a one-way door. */
  const b = boot({}, { user: userFor('p09') });
  b.win.__set('EASY_SIGN_IN', false);
  b.p.authRenderLogin();
  ok('switched off, the password box is back',
     b.doc.getElementById('lg-pass').style.display !== 'none');
  ok('and so is the emailed-link offer',
     b.doc.getElementById('lg-reset').style.display !== 'none');
  ok('and the note goes back to the ordinary wording',
     /choose your own password/i.test((b.doc.getElementById('lg-note') || {}).textContent || ''));
  b.p.authSignIn('rose@example.edu', '');
  await settle();
  ok('an email alone gets nobody in', b.seen.signIn === 0 && b.win.__get('SESSION').pid === null);
  ok('and it asks for a password', /password/i.test((b.doc.getElementById('lg-msg') || {}).textContent || ''));
}
{
  /* The other half of the switch. Turning EASY_SIGN_IN off in the app without
     running this leaves a public password on 23 live accounts, so the script
     has to exist, has to refuse to run in the wrong order, and must not keep a
     second copy of the password that could drift out of step. */
  const src = fs.readFileSync(path.join(__dirname, 'easy-sign-in.js'), 'utf8');
  ok('the account script is there', src.length > 0);
  ok('it reads the shared password out of the app', /var EASY_PASSWORD/.test(src));
  const pw = (SRC.match(/var EASY_PASSWORD = '([^']+)';/) || [])[1];
  ok('and keeps no second copy of it that could drift',
     !!pw && src.indexOf("'" + pw + "'") < 0, pw);
  ok('it refuses to switch off in the wrong order', /Set it to false FIRST/.test(src));
  ok('and switching off leaves a password nobody knows', /unknowablePassword/.test(src));
}

section('17. Admin is a page you go to, not the first thing you see');
{
  const store = {};
  const b = boot(store, { user: userFor('p01', true) });
  b.p.authSignIn('admin@example.edu', 'pw');
  await settle();
  ok('signing in lands on your own home, not the roster',
     (b.doc.querySelector('.screen.active') || {}).id === 's-home-tech',
     (b.doc.querySelector('.screen.active') || {}).id);

  /* Same farm phone, next person. A post left lying around is how somebody
     ends up holding powers nobody gave them. */
  const c = boot(store, { user: userFor('p09', false) });
  c.p.authSignIn('rose@example.edu', 'pw');
  await settle();
  ok('the post does not carry over to the next person on the phone',
     c.win.__get('rstIsAdmin')() === false);
  ok('and they land on their own home too',
     (c.doc.querySelector('.screen.active') || {}).id === 's-home-grad',
     (c.doc.querySelector('.screen.active') || {}).id);
}
{
  const b = boot({}, { user: userFor('p01', true) });
  ok('there is an Admin screen', !!b.doc.getElementById('s-admin'));
  const row = b.doc.getElementById('more-admin');
  ok('and a row on More that reaches it', !!row && row.getAttribute('data-go') === 'admin');

  b.p.authSignIn('admin@example.edu', 'pw');
  await settle();
  b.win.__get('moreEnter')();
  ok('the post-holder sees that row', row.style.display !== 'none', row.style.display);

  b.win.__get('admRender')();
  const body = b.doc.getElementById('adm-body').innerHTML;
  ok('the page holds the roster', /data-go="roster"/.test(body));
  ok('farm settings', /data-go="farmsettings"/.test(body));
  ok('the shared database', /data-go="sharedb"/.test(body));
  ok('and bug reports', /data-go="bugsettings"/.test(body));
  ok('and it says the post is not the job', /post, not a job/i.test(body), body.slice(0, 120));
}
{
  /* A hidden row is a courtesy. The page checks again, because courtesy is
     not a lock. */
  const b = boot({}, { user: userFor('p09', false) });
  b.p.authSignIn('rose@example.edu', 'pw');
  await settle();
  b.win.__get('moreEnter')();
  ok('somebody without the post does not see the row',
     b.doc.getElementById('more-admin').style.display === 'none');
  b.win.__get('admRender')();
  const body = b.doc.getElementById('adm-body').innerHTML;
  ok('and gets none of it if they reach the page anyway', !/data-go="roster"/.test(body));
  ok('with an explanation rather than a blank screen', /App Manager/.test(body));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})();
