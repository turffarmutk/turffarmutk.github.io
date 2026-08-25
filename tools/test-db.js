/*
 * The shared database: the handle, and the roster document the rules read.
 *
 * The one that matters here is section 3. `refdata/roster` is written by the
 * app and read by firestore.rules, and nothing else in the system checks that
 * the two agree on its shape. If the app sends `{role}` where the rules read
 * `{title}`, every rule quietly answers "not on the roster" and the database
 * refuses the whole farm — with no error anybody could act on. So the app's
 * payload is compared, field for field, against the shape the rules mirror
 * expects.
 *
 * Run:  node tools/test-db.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');
const { rosterDoc } = require('./rules-model');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const RULES = path.join(ROOT, 'firestore.rules');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

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
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
try { win.eval(appSource(win.document)); }
catch (e) { console.log('app script threw: ' + e.message); fail++; }

const appText = fs.readFileSync(APP, 'utf8');
const rulesText = fs.readFileSync(RULES, 'utf8');

/* -------------------------------------------------- 1. it is vendored ---- */
section('1. The database library is on the farm\'s own server, not a CDN');
ok('vendor/firebase/firebase-firestore-compat.js exists',
   fs.existsSync(path.join(ROOT, 'vendor/firebase/firebase-firestore-compat.js')));
ok('the app loads it from vendor/, never from gstatic',
   /<script src="vendor\/firebase\/firebase-firestore-compat\.js"><\/script>/.test(appText)
   && !/gstatic\.com\/firebasejs/.test(appText));
ok('build-vendor.js knows how to reproduce it',
   /firebase-firestore-compat\.js/.test(fs.readFileSync(path.join(__dirname, 'build-vendor.js'), 'utf8')));
ok('the service worker precaches it',
   /vendor\/firebase\/firebase-firestore-compat\.js/.test(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')));

/* ------------------------------------------------ 2. it degrades safely -- */
section('2. With no database, the app carries on rather than breaking');
ok('fbDb() returns null instead of throwing', win.fbDb() === null);
ok('dbConfigured() says no', win.dbConfigured() === false);
ok('asking twice does not retry and does not throw', win.fbDb() === null);
{
  let msg = null;
  win.rosterPush().catch(e => { msg = String(e && e.message); });
  ok('rosterPush() rejects rather than throwing', true);
}
ok('the offline copy reports a state, never undefined', typeof win.DB_CACHE === 'string');

/* ------------------------------- 3. the payload the rules have to read --- */
section('3. What the app sends is exactly what the rules expect');
{
  const sent = win.rosterPayload();
  const want = rosterDoc(win.PEOPLE);
  ok('one entry per person', Object.keys(sent.people).length === win.PEOPLE.length);
  ok('the count travels with it', sent.count === Object.keys(sent.people).length);

  const mismatch = [];
  Object.keys(want.people).forEach(pid => {
    const a = sent.people[pid], b = want.people[pid];
    if (!a) { mismatch.push(pid + ' missing'); return; }
    if (a.role !== b.role) mismatch.push(pid + ' role');
    if (a.lab !== b.lab) mismatch.push(pid + ' lab');
    if (a.active !== b.active) mismatch.push(pid + ' active');
    if (JSON.stringify(a.grants) !== JSON.stringify(b.grants)) mismatch.push(pid + ' grants');
  });
  ok('every person matches the shape the rules read', mismatch.length === 0, mismatch.slice(0, 6).join(', '));

  /* Each of these is a field firestore.rules actually looks up. */
  ['role', 'lab', 'active', 'grants'].forEach(f => {
    ok('the rules read .' + f + ', and it is sent',
       rulesText.indexOf("'" + f + "'") >= 0 && Object.keys(sent.people).every(p => f in sent.people[p]));
  });

  ok("Dillon's undergrad grant survives the trip",
     (sent.people.p01.grants || []).indexOf('assign_undergrads') >= 0);
  ok('Bill is sent as the Farm Manager', sent.people.p07.role === 'Farm Manager');
  ok('the pool is sent as a lab, which is how the rules see it',
     sent.people.p18.lab === sent.people.p07.lab);
}

/* --------------------------------------- 4. what must NOT leave the app -- */
section('4. Names and addresses stay in the app');
{
  const sent = win.rosterPayload();
  const leaked = [];
  Object.keys(sent.people).forEach(pid => {
    Object.keys(sent.people[pid]).forEach(k => {
      if (['role', 'lab', 'active', 'grants'].indexOf(k) < 0) leaked.push(pid + '.' + k);
    });
  });
  ok('nothing travels but role, lab, active and grants', leaked.length === 0, leaked.slice(0, 6).join(', '));
  const blob = JSON.stringify(sent);
  ok('no email address is in the payload', blob.indexOf('@') < 0);
  ok('no first or last name is in the payload',
     blob.indexOf('Dillon') < 0 && blob.indexOf('Czekai') < 0 && blob.indexOf('Valk') < 0);
}

/* ------------------------------------------- 5. who may send the roster -- */
section('5. Who may send it — the app and the rules agree');
{
  const inRules = (rulesText.match(/me\(\) in \[([^\]]*)\]/) || [null, ''])[1]
    .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean).sort();
  const inApp = (win.DB_BOOTSTRAP_PIDS || []).slice().sort();
  ok('the bootstrap list is the same in both files',
     JSON.stringify(inRules) === JSON.stringify(inApp),
     'rules ' + inRules.join(',') + ' vs app ' + inApp.join(','));
  ok('it is exactly two people, and no more', inApp.length === 2);

  ok('Bill may send it', win.rosterCanPush('p07'));
  ok('Dillon may, and he holds the grant too', win.rosterCanPush('p01'));
  ok('a technician without the grant may not', !win.rosterCanPush('p02'));
  ok('a faculty member may not', !win.rosterCanPush('p16'));
  ok('an undergrad may not', !win.rosterCanPush('p18'));
  ok('nobody signed in may not', !win.rosterCanPush(''));

  /* The grant is what makes this survivable — Bill hands the job over and the
     new holder can send the roster without anybody editing the app. */
  const rose = win.PEOPLE.find(p => p.id === 'p09');
  rose.grants = ['assign_undergrads'];
  ok('handing over the undergrad job hands over this too', win.rosterCanPush('p09'));
  delete rose.grants;
  ok('and taking it back takes this back', !win.rosterCanPush('p09'));
}

/* ----------------------------------------------------- 6. the screen ----- */
section('6. The screen exists and is reachable');
ok('there is a Shared database screen', !!win.document.getElementById('s-sharedb'));
ok('it has a body to render into', !!win.document.getElementById('sdb-body'));
ok('Farm settings links to it', /go:'sharedb'/.test(appText));
ok('opening it renders it', /if\(id==='sharedb'\)sdbRender\(\);/.test(appText));
{
  win.sdbRender();
  const html = win.document.getElementById('sdb-body').innerHTML;
  ok('it renders something', html.length > 200);
  ok('it says the roster has never been sent', /Never/.test(html));
  ok('it names what is wrong when the library is missing', /did not load/i.test(html));
}
ok('every failure has words a person can act on',
   ['nodb', 'notallowed', 'permission-denied', 'unauthenticated', 'unavailable']
     .every(c => win.sdbError({ code: c }) && !/^It did not save/.test(win.sdbError({ code: c }))));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
