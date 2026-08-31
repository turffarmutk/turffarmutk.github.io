/*
 * Harness for sign-in.
 *
 * What changed: `currentRole` used to be picked from a menu, and each of the
 * five roles had exactly one person wired to it. Signing in as "grad" made you
 * Rose Gibbons whether you were Rose or not, and eighteen of the twenty-three
 * people on the roster had no way in at all. SESSION.pid is now the source of
 * truth and the role is derived from the person's roster record.
 *
 * Four things get pinned here:
 *   1. Derivation  — the role, the lab and the account card all come off the
 *                    roster row, for everybody, not just the old demo five.
 *   2. Isolation    — two people in the same role get their own lab and their
 *                    own preferences.
 *   3. Durability   — a signed-in session survives a reload, and a session for
 *                    somebody since deactivated does not.
 *   4. No promotion — opening a screen can no longer change your role.
 *
 * Run:  node tools/test-session.js
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
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
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

function boot(store) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
  const win = dom.window;
  win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
  win.turf = turf;
  win.BroadcastChannel = class { postMessage() {} close() {} };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
  Object.defineProperty(win, 'localStorage', {
    value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
             removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; } },
    configurable: true
  });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });

  const scripts = require('./_app').appScripts(win.document);
  const EX = ['SESSION','sessionSet','sessionPerson','sessionRestore','sessionClear','signOut','doSignIn',
              'me','myLab','meName','calSelf','trMe','rstMe','roleSlug','ROLE_SLUG','renderSignIn',
              'authBoot','authSaveLocal','authLocal','authClearLocal',
              'trAccess','trCanEdit','trMyLabs','prefsWho','prefsGet','prefsSet','rstFind','pName',
              'PEOPLE','USERS','RST_LOGIN','HOME_DEST','show','go','goRoot','rstActive','tbLabKey','calMyLab'];
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__s={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',')
      + ',getRole:function(){return currentRole;}};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack||'').split('\n')[1]); fail++; }
  return { win, doc: win.document, s: win.__s || {}, errs };
}

/* The roster as it stood on the day before Levi was hired -- taken from the
   app's own built-in list with him dropped, so it cannot drift out of step
   with the real thing the way a second copy typed out here would. */
const RST23 = (function () {
  const { s } = boot({});
  return s.PEOPLE.filter(p => p.id !== 'p24').map(p => JSON.parse(JSON.stringify(p)));
})();

/* ---------------------------------------------------------------- */
section('1. the role is derived from the person, not chosen');
{
  const { s } = boot({});
  const cases = [
    ['p07', 'manager',   'Bill Czekai',   'Bill'],
    ['p18', 'undergrad', 'Garrett Willard','Bill'],
    ['p09', 'grad',      'Rose Gibbons',  'Sorochan'],
    ['p14', 'faculty',   'Brandon Horvath','Horvath'],
    ['p05', 'tech',      'Greg Breeden',  'Brosnan'],
  ];
  cases.forEach(([pid, role, name, lab]) => {
    s.sessionSet(pid);
    ok(name + ' -> ' + role, s.getRole() === role, s.getRole());
    ok(name + ' account card is them', s.me().n === name, s.me().n);
    ok(name + ' lab is ' + lab, s.myLab() === lab, s.myLab());
  });
}

section('2. the eighteen people who could never sign in before');
{
  const { s } = boot({});
  const everyone = s.rstActive();
  ok('roster has 24 active people', everyone.length === 24, String(everyone.length));
  const bad = everyone.filter(p => !s.sessionSet(p.id));
  ok('every one of them can sign in', bad.length === 0, bad.map(p => p.id).join(','));

  /* The case the old role table got wrong: three grads, three different labs. */
  s.sessionSet('p09'); const rose = s.myLab();
  s.sessionSet('p12'); const logan = s.myLab();
  s.sessionSet('p10'); const zoe = s.myLab();
  ok('Rose is Sorochan', rose === 'Sorochan', rose);
  ok('Logan is Brosnan', logan === 'Brosnan', logan);
  ok('Zoe is Bowling', zoe === 'Bowling', zoe);
  ok('three grads, three labs (the old table gave all three Brosnan)',
     new Set([rose, logan, zoe]).size === 3);
}

section('3. trial edit rights follow the person\'s lab');
{
  const { s } = boot({});
  s.sessionSet('p10');   /* Zoe, Bowling */
  ok('Zoe may edit a Bowling study', s.trCanEdit({ lab: 'Bowling' }));
  ok('Zoe may not edit a Brosnan study', !s.trCanEdit({ lab: 'Brosnan' }));

  s.sessionSet('p16');   /* Sorochan PI */
  ok('Sorochan PI edits Sorochan', s.trCanEdit({ lab: 'Sorochan' }));
  ok('Sorochan PI does not edit Horvath', !s.trCanEdit({ lab: 'Horvath' }));

  s.sessionSet('p07');   /* Bill */
  ok('the manager sees every lab', s.trAccess().seeAll === true);

  s.sessionSet('p18');   /* an undergrad */
  ok('an undergrad edits nothing', s.trMyLabs().length === 0, s.trMyLabs().join(','));

  s.sessionSet('p17');   /* Dr Stier: own lab plus Sorochan */
  ok('Stier holds two labs', s.trMyLabs().length === 2, s.trMyLabs().join(','));
  ok('Stier edits his own lab', s.trCanEdit({ lab: 'Stier' }));
  ok('Stier also edits Sorochan', s.trCanEdit({ lab: 'Sorochan' }));
  ok('Stier does not edit Bowling', !s.trCanEdit({ lab: 'Bowling' }));
}

section('4. preferences are per person, including two people in one role');
{
  const store = {};
  const { s } = boot(store);
  s.sessionSet('p09'); s.prefsSet('nav', ['Trials']);
  s.sessionSet('p12');
  ok('Logan does not inherit Rose\'s tabs', (s.prefsGet('nav') || []).join(',') !== 'Trials',
     (s.prefsGet('nav') || []).join(','));
  ok('the bucket is the roster id', s.prefsWho() === 'p12', s.prefsWho());
  const stored = JSON.parse(store.ut_prefs);
  ok('Rose\'s choice is filed under p09', !!(stored.p09 || {}).nav, Object.keys(stored).join(','));
  ok('nothing is filed under the role name', !stored.grad);
}

section('5. a session survives a reload — but only a real one');
{
  const store = {};
  { const { s } = boot(store); s.sessionSet('p12'); s.authSaveLocal({ pid: 'p12', admin: false }); }
  { const { s } = boot(store);
    ok('comes back as Logan', s.me().n === 'Logan Smith', s.me().n);
    ok('and as a grad', s.getRole() === 'grad', s.getRole());
  }
  /* The difference between the old picker and a login: a leftover roster id
     with no auth record behind it must NOT let anybody in. Before sign-in
     existed, SESSION_KEY alone was enough. */
  { const bare = {};
    { const { s } = boot(bare); s.sessionSet('p12'); }      /* writes SESSION_KEY, no auth record */
    const { s } = boot(bare);
    ok('a stored roster id with no auth record signs nobody in', s.authBoot() === false);
    ok('and SESSION.pid stays null', s.SESSION.pid === null, s.SESSION.pid);
  }
  /* Somebody who has left cannot be restored into the app. */
  { const { s, win } = boot(store);
    const logan = s.rstFind('p12'); logan.active = false;
    ok('a deactivated person is refused', s.sessionSet('p12') === false);
  }
}

section('6. opening a screen can no longer promote you');
{
  const { s } = boot({});
  s.sessionSet('p18');                 /* Garrett, undergrad */
  ok('signed in as an undergrad', s.getRole() === 'undergrad', s.getRole());
  s.go('home-manager');                /* the old data-role escalation */
  ok('opening the manager home does not make you the manager',
     s.getRole() === 'undergrad', s.getRole());
  ok('and the account is still Garrett', s.me().n === 'Garrett Willard', s.me().n);
}

section('7. the sign-in screen is a login, not a list');
{
  const { s, doc } = boot({});
  ok('there is an email field', !!doc.getElementById('lg-email'));
  ok('and a masked password field', (doc.getElementById('lg-pass') || {}).type === 'password');
  /* The picker published all 23 names to anyone who opened the page. It is
     gone, and it must not come back. */
  ok('no picker rows remain', doc.querySelectorAll('[data-signin]').length === 0);
  ok('the picker renderer is gone', typeof s.renderSignIn === 'undefined');
  ok('nobody is named on the sign-in screen',
     !/Czekai|Gibbons|McCallum|Brosnan/.test(doc.getElementById('s-login').textContent || ''));
}

section('8. signing out');
{
  const store = {};
  const { s, doc } = boot(store);
  s.sessionSet('p07');
  s.signOut();
  ok('the session is cleared', !s.SESSION.pid, String(s.SESSION.pid));
  ok('and forgotten on this device', !store.ut_session_v1, store.ut_session_v1);
  ok('the login screen is showing', doc.getElementById('s-login').classList.contains('active'));
}

section('9. a new hire reaches a phone that already has the app');
{
  /* Bill's phone, 2026-08-31: it saved its own roster back when the farm had
     23 people, so it had stopped reading the built-in list and could not see
     Levi (p24) to put him on a job. */
  const older = JSON.parse(JSON.stringify(RST23));
  const store = { ut_people_v1: JSON.stringify(older) };
  const { s } = boot(store);
  const ids = s.PEOPLE.map(p => p.id);
  ok('Levi is there now', ids.indexOf('p24') >= 0, ids.length + ' people');
  ok('and nobody was lost doing it', ids.length === 24, String(ids.length));
  const levi = s.rstFind('p24');
  ok('with his real role and lab', !!levi && levi.role === 'Undergraduate Student' && levi.lab === 'Bill',
     levi ? levi.role + '/' + levi.lab : 'missing');
  ok('Bill can now put him on a job', s.rstActive().some(p => p.id === 'p24'));
  ok('and the phone remembers it saw him', store.ut_people_seen_v1 === '24', store.ut_people_seen_v1);
  ok('the roster was written back to the phone',
     JSON.parse(store.ut_people_v1 || '[]').length === 24);
}

section('9b. and it CANNOT bring back somebody who was removed');
{
  /* The whole risk of the above. Removing somebody is deliberate and there is
     no undo on the screen, so a phone that has taken a person off must never
     have them handed back at the next reload. */

  /* Removed AFTER the mark was being kept: p24 himself. */
  const minusLevi = JSON.parse(JSON.stringify(RST23));
  const storeA = { ut_people_v1: JSON.stringify(minusLevi), ut_people_seen_v1: '24' };
  const a = boot(storeA).s;
  ok('Levi stays off once this phone has removed him',
     a.PEOPLE.every(p => p.id !== 'p24'), a.PEOPLE.length + ' people');

  /* Removed BEFORE it existed, and they held the highest id -- the case the
     base mark is there to cover. Lauren (p23) is gone and nothing is
     remembered, so only the base mark stands between her and coming back. */
  const minusLauren = JSON.parse(JSON.stringify(RST23)).filter(p => p.id !== 'p23');
  const storeB = { ut_people_v1: JSON.stringify(minusLauren) };
  const b = boot(storeB).s;
  ok('somebody removed before this shipped stays removed',
     b.PEOPLE.every(p => p.id !== 'p23'), b.PEOPLE.filter(p => p.id === 'p23').length + ' found');
  ok('while the new hire still arrives on that same phone',
     b.PEOPLE.some(p => p.id === 'p24'));
}

section('9c. an edited roster is not overwritten by the built-in list');
{
  /* The reason the saved roster wins in the first place. Somebody moved lab on
     the Roster screen; reading the built-in list back over the top would undo
     their work every morning. */
  const edited = JSON.parse(JSON.stringify(RST23));
  edited.find(p => p.id === 'p18').lab = 'Sorochan';
  const store = { ut_people_v1: JSON.stringify(edited) };
  const { s } = boot(store);
  ok('the edit survives', s.rstFind('p18').lab === 'Sorochan', s.rstFind('p18').lab);
  ok('and the new hire still arrived', !!s.rstFind('p24'));
}

section('Load errors');
{
  const { errs } = boot({});
  ok('no uncaught errors while booting the app', errs.length === 0, errs.join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
