/*
 * Harness for the adaptive-layout rule.
 *
 * The behaviour under test: the app reports one of two sizes and each gets the
 * shell that suits it. Phone keeps the bottom tab bar and is otherwise
 * untouched. Everything wider swaps that bar for a left rail built from the
 * same navMap, so a page added in one place shows up in both.
 *
 * There used to be a third 'desktop' band with its own rail width, a 4-column
 * home and master-detail split panes. It was merged into the tablet band so
 * every change only has to be made and checked once; the tests below pin that
 * merge down so it cannot half-come-back.
 *
 * jsdom does no layout, so this checks the wiring — attributes, rail contents,
 * split classes, navigation — not the pixels. Same stub-Leaflet boot as
 * test-back-nav.js.
 *
 * Run:  node tools/test-responsive.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- boot ---- */
const vc = new VirtualConsole();
const seen = [];
vc.on('jsdomError', e => seen.push(e.message));
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;

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
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true
});
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };

const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
try {
  /* NAV_OPTIONS and friends are `const`, so indirect eval keeps them out of the
     global object. Hand them out explicitly rather than duplicating the tables. */
  win.eval(scripts.join('\n;\n')
    + '\n;window.__nav={NAV_OPTIONS:NAV_OPTIONS,NAV_DEF:NAV_DEF,navChosen:navChosen,navMap:navMap,SCREEN_DEST:SCREEN_DEST};');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const doc = win.document;
const root = doc.documentElement;
const NAV = win.__nav || {};
const active = () => { const a = doc.querySelector('.screen.active'); return a ? a.id.slice(2) : null; };

/* innerWidth is read-only-ish in jsdom but configurable, so redefine it and then
   drive the app's own detector rather than setting data-size by hand. */
function setWidth(w, h) {
  Object.defineProperty(win, 'innerWidth', { value: w, configurable: true, writable: true });
  Object.defineProperty(win, 'innerHeight', { value: h == null ? 900 : h,
                                              configurable: true, writable: true });
  win.APP_SIZE_APPLY();
  win.renderRail();
}

/* pick() also asks whether the pointer is coarse — that is how a phone on its
   side is told apart from a short laptop window. jsdom answers false to every
   media query, so the harness has to fake it. Reset to false when done: false
   is jsdom's own answer, so leaving it set is a no-op for everything else. */
function setPointer(coarse) {
  win.matchMedia = q => ({
    matches: /pointer\s*:\s*coarse/.test(q) ? !!coarse : false,
    media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
  });
}
function rail() { return doc.getElementById('rail'); }
function railLabels() {
  const r = rail();
  return r ? [...r.querySelectorAll('.rl-item')].map(i => i.getAttribute('data-rail')) : [];
}

/* ---------------------------------------------------------------- */
section('1. breakpoints');
{
  /* Two bands, not three. The large-screen layout was merged into one 'tablet'
     band that covers everything from an iPad to a monitor. */
  const cases = [[390, 'phone'], [819, 'phone'], [820, 'tablet'], [1179, 'tablet'],
                 [1180, 'tablet'], [2560, 'tablet']];
  cases.forEach(([w, want]) => {
    setWidth(w);
    ok(w + 'px reports ' + want, win.APP_SIZE() === want, 'got ' + win.APP_SIZE());
  });
  setWidth(1440);
  ok('data-size lands on <html>', root.getAttribute('data-size') === 'tablet',
     'got ' + root.getAttribute('data-size'));
  ok('there is no desktop band left', !cases.some(c => c[1] === 'desktop'));
}

section('1b. a phone on its side is still a phone');
{
  /* Regression: width was the only test, so an iPhone turned landscape (~850-930
     across, ~400 tall) read as a monitor and swapped the bottom tab bar for a
     rail mid-shift. It takes shape AND pointer type to separate the three cases
     below — either signal alone gets one of them wrong. */
  setPointer(true);
  [[852, 393, 'iPhone on its side'],
   [932, 430, 'a big phone on its side'],
   [915, 412, 'an Android on its side']].forEach(([w, h, what]) => {
    setWidth(w, h);
    ok(what + ' stays on the phone shell', win.APP_SIZE() === 'phone', 'got ' + win.APP_SIZE());
  });

  /* A tablet on its side is short and wide too, but nowhere near this short. */
  [[1180, 820, 'an iPad on its side'],
   [1133, 744, 'a small iPad on its side']].forEach(([w, h, what]) => {
    setWidth(w, h);
    ok(what + ' gets the roomy shell', win.APP_SIZE() === 'tablet', 'got ' + win.APP_SIZE());
  });

  /* And a laptop reports a fine pointer, so a squashed window stays a laptop. */
  setPointer(false);
  setWidth(1440, 380);
  ok('a squashed laptop window is not a phone', win.APP_SIZE() === 'tablet', 'got ' + win.APP_SIZE());
  setWidth(390, 400);
  ok('a genuinely narrow window is, whatever the pointer',
     win.APP_SIZE() === 'phone', 'got ' + win.APP_SIZE());

  setPointer(false);
  setWidth(1440);
}

section('2. phone is untouched');
{
  setWidth(390);
  win.go('home-manager');
  const tabs = doc.querySelector('#s-home-manager .tabs');
  ok('bottom bar still renders its tabs', tabs && tabs.querySelectorAll('.tab').length >= 3,
     tabs ? tabs.querySelectorAll('.tab').length + ' tabs' : 'no .tabs');
  ok('rail is empty on phone', railLabels().length === 0, railLabels().join(','));
  ok('no split classes on phone', doc.querySelectorAll('.splitL,.splitR').length === 0);
}

section('3. rail is built from navMap');
{
  setWidth(1440);
  win.go('home-manager');
  const labels = railLabels();
  ok('rail renders for manager', labels.length > 0);
  ok('Home is first', labels[0] === 'Home', labels[0]);
  /* "Switch role" used to take the slot More used to hold, but it was
     demo-only and was retired 2026-08-25 -- every page is already on the
     rail, and Profile plus the bell still reach everything else, so nothing
     took its place. */
  ok('no Switch entry', !labels.includes('Switch'), labels.join(','));
  ok('no More entry', !labels.includes('More'), labels.join(','));

  /* The point of the rail: every page the role can reach, not the three
     favourites the phone bar has room for. */
  const reachable = NAV.NAV_OPTIONS.manager.filter(l => NAV.navMap.manager[l]);
  const missing = reachable.filter(l => !labels.includes(l));
  ok('the rail exposes every manager page', missing.length === 0, 'missing ' + missing.join(','));
  ok('which beats the 5-slot bottom bar', labels.length > 5, labels.length + ' items');

  /* Same rail at every width above phone — that is the whole point of merging
     the bands. */
  setWidth(900);
  win.go('home-manager');
  const narrow = railLabels();
  setWidth(2200);
  win.go('home-manager');
  const wide = railLabels();
  ok('900px and 2200px get the same rail',
     narrow.join(',') === wide.join(','), narrow.join(',') + ' vs ' + wide.join(','));
}

section('3c. the rail has no brand block');
{
  [1440, 1000].forEach(w => {
    setWidth(w);
    win.go('home-manager');
    ok('no logo header at ' + w + 'px', !rail().querySelector('.rl-brand'));
    ok('first row is Home at ' + w + 'px',
       rail().firstElementChild.getAttribute('data-rail') === 'Home',
       rail().firstElementChild.className);
  });
}

section('3d. the rail hangs below the banner');
{
  setWidth(1440);
  win.go('home-manager');
  /* jsdom does no layout, so the measurement falls back to the 64px floor —
     what matters is that both the custom property and the inline top get set. */
  ok('--hdrh is published', /\d+px/.test(root.style.getPropertyValue('--hdrh')),
     root.style.getPropertyValue('--hdrh'));
  ok('rail top matches --hdrh', rail().style.top === root.style.getPropertyValue('--hdrh'),
     rail().style.top + ' vs ' + root.style.getPropertyValue('--hdrh'));
  setWidth(390);
  ok('phone clears the offset', !root.style.getPropertyValue('--hdrh'),
     root.style.getPropertyValue('--hdrh'));
}

section('3b. every rail item wears the bottom bar\'s icon');
{
  setWidth(1440);
  win.go('home-manager');
  const items = [...rail().querySelectorAll('.rl-item')];
  ok('every item has an icon',
     items.every(i => (i.querySelector('.rl-ic') || {}).textContent.trim().length > 0));
  /* A page must not change its face between the phone bar and the desktop rail. */
  const mismatched = items
    .map(i => i.getAttribute('data-rail'))
    .filter(k => win.TAB_EMOJI[k])
    .filter(k => rail().querySelector('[data-rail="' + k + '"] .rl-ic').textContent !== win.TAB_EMOJI[k]);
  ok('page icons match TAB_EMOJI', mismatched.length === 0, mismatched.join(','));
  ok('no bare bullet placeholders on a page row',
     items.filter(i => NAV.navMap.manager[i.getAttribute('data-rail')])
          .every(i => i.querySelector('.rl-ic').textContent !== '•'));
}

section('4. rail follows the role');
{
  setWidth(1440);
  win.go('home-tech');
  const labels = railLabels();
  /* This used to assert the tech rail said "Jobs". That label was retired on
     purpose — every role names the task board the same way now, and navChosen()
     folds a saved 'Jobs' tab back to 'Tasks' on read so nobody loses a pinned
     tab. The assertion was never updated and had been failing on main since.
     It now pins the decision that was actually made. */
  ok('tech rail says Tasks, the one name every role uses',
     labels.includes('Tasks') && !labels.includes('Jobs'), labels.join(','));
  const techReach = NAV.NAV_OPTIONS.tech.filter(l => NAV.navMap.tech[l]);
  ok('tech rail exposes every tech page',
     techReach.every(l => labels.includes(l)), labels.join(','));
}

section('5. rail marks where you are');
{
  setWidth(1440);
  /* Section 4 left the rail on the tech home. Land on the manager home first
     so we're asserting against the manager's rail. */
  win.go('home-manager');
  win.go('taskboard');
  const on = [...rail().querySelectorAll('.rl-item.on')].map(i => i.getAttribute('data-rail'));
  ok('exactly one item is active', on.length === 1, on.join(','));
  ok('Tasks is the active item', on[0] === 'Tasks', on[0]);

  /* Detail screens roll up to their parent via SCREEN_DEST, so the rail should
     stay lit on Tasks rather than going blank. */
  win.go('taskdetail');
  const on2 = [...rail().querySelectorAll('.rl-item.on')].map(i => i.getAttribute('data-rail'));
  ok('detail screen keeps parent lit', on2[0] === 'Tasks', on2.join(','));
}

section('6. rail navigates');
{
  setWidth(1440);
  win.go('home-manager');
  const map = rail().querySelector('[data-rail="Map"]');
  ok('rail has a Map item', !!map);
  if (map) {
    map.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('clicking it lands on the map', active() === 'map', 'got ' + active());
  }
  const more = rail().querySelector('[data-rail="More"]');
  if (more) {
    more.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('More opens the more screen', active() === 'more', 'got ' + active());
  }
}

section('7. rail stays out of the gates');
{
  setWidth(1440);
  win.go('roles');
  ok('no rail on the role picker', railLabels().length === 0, railLabels().join(','));
  win.go('home-manager');
  ok('rail comes back after signing in', railLabels().length > 0);
}

section('8. master-detail split is gone, not just switched off');
{
  /* The split panes belonged to the desktop band. Dead code that only wakes up
     at a width nothing reports is worse than no code, so it was removed
     outright — this pins that it stays removed. */
  const src = fs.readFileSync(APP, 'utf8');
  ['SPLIT_PARENT', 'applySplit', 'splitL', 'splitR'].forEach(t => {
    ok('no ' + t + ' left in the source', src.indexOf(t) < 0);
  });
}

section('9. detail screens stand alone at every width');
{
  const details = ['taskdetail', 'itemdetail', 'eqdetail', 'trialdetail', 'fldetail', 'tcperson'];
  [390, 900, 1440, 2400].forEach(w => {
    setWidth(w);
    details.forEach(id => win.go(id));
    ok('one active screen at ' + w + 'px',
       doc.querySelectorAll('.screen.active').length === 1,
       [...doc.querySelectorAll('.screen.active')].map(s2 => s2.id).join(','));
  });
  /* And the rail still points at the section you are inside. */
  setWidth(1440);
  win.go('home-manager'); win.go('taskdetail');
  const on = [...rail().querySelectorAll('.rl-item.on')].map(i => i.getAttribute('data-rail'));
  ok('a detail screen keeps its section lit', on[0] === 'Tasks', on.join(','));
}

section('10. resizing keeps the rail honest');
{
  setWidth(1440); win.go('taskboard');
  const before = railLabels().join(',');
  Object.defineProperty(win, 'innerWidth', { value: 900, configurable: true, writable: true });
  win.adaptiveResize();
  ok('still tablet after a shrink', win.APP_SIZE() === 'tablet', win.APP_SIZE());
  ok('rail survives and is unchanged',
     railLabels().join(',') === before, railLabels().join(','));

  Object.defineProperty(win, 'innerWidth', { value: 400, configurable: true, writable: true });
  win.adaptiveResize();
  ok('dropping under 820 goes back to phone', win.APP_SIZE() === 'phone', win.APP_SIZE());
  ok('and the rail empties', railLabels().length === 0, railLabels().join(','));
}

section('11. TAB_EMOJI covers every nav label');
{
  const all = new Set(['Home', 'More']);
  Object.keys(NAV.NAV_OPTIONS).forEach(r => NAV.NAV_OPTIONS[r].forEach(l => all.add(l)));
  const missing = [...all].filter(l => !win.TAB_EMOJI[l]);
  ok('no label falls back to a bullet', missing.length === 0, 'missing ' + missing.join(','));
}

section('12. the account rows live behind Profile, not on the rail');
{
  setWidth(1440);
  win.go('home-manager');
  const labels = railLabels();
  /* "Switch" (switch-user/switch-role) was demo-only and was retired
     2026-08-25 -- the rail is simply one item shorter now, nothing took its
     old slot. */
  ['Profile', 'Notifications', 'Preferences', 'Logout', 'Switch'].forEach(k => {
    ok(k + ' is not on the rail', !labels.includes(k), labels.join(','));
  });

  /* But every one of them is still reachable, which is the part that matters. */
  ['s-profile', 's-notifications', 's-navsettings', 's-roster', 's-powersettings']
    .forEach(id => ok(id + ' still exists', !!doc.getElementById(id)));
  ok('Profile links to Preferences',
     !!doc.querySelector('#s-profile [data-go="navsettings"]'));
  ok('Profile links to the roster',
     !!doc.querySelector('#s-profile [data-go="roster"]'));
  /* Sign out moved onto Profile 2026-08-25 and is wired straight to the real
     signOut() -- not a data-go link, which used to just repaint the login
     screen without actually signing anyone out. */
  ok('Profile has a real sign-out row',
     !!doc.getElementById('pf-signout'));
}

section('12b. the sign-in stack is centred on a big screen');
{
  /* Regression: the tablet band capped the sign-in form at 360px but never
     centred it, so on a monitor it rendered jammed in the top-left corner.
     jsdom does no layout, so this reads the stylesheet text rather than
     measuring pixels — enough to stop the rules being deleted again. The real
     pixel check is a browser job. */
  const CSS = fs.readFileSync(APP, 'utf8');
  const rule = sel => {
    const i = CSS.indexOf(sel);
    if (i < 0) return '';
    const open = CSS.indexOf('{', i), close = CSS.indexOf('}', open);
    return open < 0 || close < 0 ? '' : CSS.slice(open + 1, close);
  };

  const wrap = rule('html[data-size="tablet"] #s-login .lg-wrap{');
  ok('the wrap centres its column across', /align-items\s*:\s*center/.test(wrap), wrap);
  ok('and owns the scrolling', /overflow-y\s*:\s*auto/.test(wrap), wrap);

  ok('the first child pushes off the top',
     /margin-top\s*:\s*auto/.test(rule('#s-login .lg-wrap > :first-child{')));
  ok('the last child pushes off the bottom',
     /margin-bottom\s*:\s*auto/.test(rule('#s-login .lg-wrap > :last-child{')));

  /* Auto margins, not justify-content:center — a short window must keep the
     top of the form reachable rather than pushing the logo off-screen. */
  ok('it does not centre with justify-content',
     !/justify-content\s*:\s*center/.test(wrap), wrap);

  /* #lg-body carries flex:1;overflow-y:auto INLINE for the phone shell, which
     beats any stylesheet rule. The tablet band has to shout over it. */
  const body = rule('html[data-size="tablet"] #s-login #lg-body{');
  ok('#lg-body stops stretching on tablet', /flex\s*:\s*0 0 auto\s*!important/.test(body), body);
  ok('#lg-body stops scrolling on tablet', /overflow\s*:\s*visible\s*!important/.test(body), body);

  ok('the cap is still 360px', /max-width\s*:\s*360px/.test(rule('#s-login .lg-wrap > *{')));

  /* The phone path is deliberately byte-for-byte unchanged. */
  ok('none of it leaks to the phone band',
     !/html\[data-size="phone"\][^{]*#s-login/.test(CSS));
}

section('13. the preview lock pins a band, but has no on-screen control');
{
  /* The View toggle (Auto / Phone / Desktop) that sat bottom-right was
     prototype furniture and is gone. The plumbing behind it stays, callable
     from a browser console, so a band can still be pinned when troubleshooting
     — but nothing in the UI offers it to the crew. */
  ok('the toggle is not in the page', !doc.getElementById('szt'));
  ok('and none of its styling is left',
     !fs.readFileSync(APP, 'utf8').includes('#szt'));

  ok('a lock getter is exposed', typeof win.SIZE_LOCK === 'function');
  ok('nothing is locked by default', win.SIZE_LOCK() === null, String(win.SIZE_LOCK()));

  win.SIZE_LOCK_SET('phone');
  Object.defineProperty(win, 'innerWidth', { value: 1600, configurable: true, writable: true });
  win.APP_SIZE_APPLY();
  ok('a phone lock beats a 1600px window', win.APP_SIZE() === 'phone', win.APP_SIZE());
  ok('and is written down', store.ut_sizelock === 'phone', String(store.ut_sizelock));

  win.SIZE_LOCK_SET(null);
  win.APP_SIZE_APPLY();
  ok('clearing it follows the window again', win.APP_SIZE() === 'tablet', win.APP_SIZE());
  ok('and forgets the setting', !store.ut_sizelock, String(store.ut_sizelock));
}

section('14. nothing blew up');
{
  const real = seen.filter(m => !/Not implemented|Could not parse CSS/i.test(m));
  ok('no jsdom errors', real.length === 0, real.slice(0, 3).join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
