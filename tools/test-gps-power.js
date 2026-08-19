/*
 * Harness for the GPS power rules.
 *
 * The behaviour under test: the app never holds a location watch it isn't
 * using, and never pays for more accuracy than the job needs. A watch exists
 * only while something holds it; it is suspended while the page is hidden and
 * while the crew member is standing still; it comes back when they move or ask
 * for it; and the accuracy it opens with depends on the geometry the job is
 * working over — an alley is a few feet wide, a green is not.
 *
 * The real navigator.geolocation is replaced with a recorder so every
 * watchPosition/clearWatch pair is observable, including the options each watch
 * was opened with. Same stub-Leaflet boot as test-back-nav.js.
 *
 * Run:  node tools/test-gps-power.js
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

/* ---- geolocation recorder ----
   Every open watch is kept so a test can assert not just "is there a watch"
   but "what did it ask the chip for". */
const GPS = { next: 1, open: new Map(), opened: [], cleared: [] };
function gpsReset() { GPS.open.clear(); GPS.opened.length = 0; GPS.cleared.length = 0; }
function liveWatch() { return GPS.open.size ? [...GPS.open.values()][GPS.open.size - 1] : null; }
win.navigator.geolocation = {
  watchPosition(okCb, errCb, opts) {
    const id = GPS.next++;
    const rec = { id, ok: okCb, err: errCb, opts: opts || {} };
    GPS.open.set(id, rec); GPS.opened.push(rec);
    return id;
  },
  clearWatch(id) { GPS.cleared.push(id); GPS.open.delete(id); },
  getCurrentPosition: noop
};

/* jsdom has no document.hidden setter, so make it writable. */
let hidden = false;
Object.defineProperty(win.document, 'hidden', { get: () => hidden, configurable: true });
function setHidden(v) {
  hidden = v;
  win.document.dispatchEvent(new win.Event('visibilitychange'));
}

const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
try {
  win.eval(scripts.join('\n;\n'));
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const G = () => win.GEO;

/* Feed a fix to whichever watch is live, as the device would. */
function fix(lat, lng, acc) {
  const w = liveWatch(); if (!w) return false;
  w.ok({ coords: { latitude: lat, longitude: lng, accuracy: acc == null ? 4 : acc,
                   heading: null, speed: null } });
  return true;
}
/* Roughly 100 ft of northward travel per step at this latitude. */
const FARM = [35.9, -83.95];
function north(ft) { return [FARM[0] + ft / 364566.9, FARM[1]]; }

function reset() {
  win.geoRelease(); win.geoRelease(); win.geoRelease();   /* drain any holds */
  G().holds = 0; G().paused = null; G().noIdleUntil = 0;
  G().anchor = null; G().lastMove = 0; G().want = 'fine';
  /* A fix left over from an earlier section makes the locate button look
     located before it has heard anything, so clear the position too. */
  G().pos = null; G().err = null; G().follow = false;
  win.POWER.saver = false;
  gpsReset();
}

/* ---------------------------------------------------------------- */
section('1. a watch only exists while something holds it');
{
  reset();
  ok('nothing open at rest', GPS.open.size === 0, GPS.open.size + ' open');
  win.geoAcquire();
  ok('acquiring opens one watch', GPS.open.size === 1, GPS.open.size + ' open');
  win.geoAcquire();
  ok('a second hold does not open a second watch', GPS.open.size === 1, GPS.open.size + ' open');
  win.geoRelease();
  ok('releasing one of two keeps it open', GPS.open.size === 1, GPS.open.size + ' open');
  win.geoRelease();
  ok('releasing the last one closes it', GPS.open.size === 0, GPS.open.size + ' open');
  ok('holds bottom out at zero', G().holds === 0, String(G().holds));
}

section('2. accuracy follows the geometry, not the mower');
{
  reset();
  const fine = ['Rotary mow alleys', 'Mow alleys 12-18', 'Weed eat around plot 6',
                'Trim borders', 'Spray plot 14', 'Stake trial plots'];
  const coarse = ['Greens mow', 'Mow fairway 3', 'Mow the rough', 'Tee mow', 'Mow driving range'];
  fine.forEach(t => ok('"' + t + '" asks for fine',
    win.gpsProfileFor({ title: t }) === 'fine', win.gpsProfileFor({ title: t })));
  coarse.forEach(t => ok('"' + t + '" asks for coarse',
    win.gpsProfileFor({ title: t }) === 'coarse', win.gpsProfileFor({ title: t })));

  ok('unrecognised work defaults to fine',
     win.gpsProfileFor({ title: 'Haul topdressing' }) === 'fine');
  ok('an explicit task.gps beats the title',
     win.gpsProfileFor({ title: 'Greens mow', gps: 'fine' }) === 'fine');
  ok('no task at all still answers', win.gpsProfileFor(null) === 'fine');
}

section('3. the profile reaches the actual watch options');
{
  reset();
  win.geoWant('fine'); win.geoAcquire();
  ok('fine opens a high-accuracy watch', liveWatch().opts.enableHighAccuracy === true);
  ok('fine keeps cached fixes short', liveWatch().opts.maximumAge <= 5000,
     String(liveWatch().opts.maximumAge));

  win.geoWant('coarse');
  ok('switching profile reopens the watch', GPS.cleared.length === 1, GPS.cleared.join(','));
  ok('coarse drops high accuracy', liveWatch().opts.enableHighAccuracy === false);
  ok('coarse lets fixes go stale', liveWatch().opts.maximumAge >= 20000,
     String(liveWatch().opts.maximumAge));

  const before = GPS.opened.length;
  win.geoWant('coarse');
  ok('asking for the same profile changes nothing', GPS.opened.length === before);
  reset();
}

section('4. hiding the page drops the watch but not the hold');
{
  reset();
  win.geoAcquire();
  ok('watching while visible', GPS.open.size === 1);
  setHidden(true);
  ok('hidden closes the watch', GPS.open.size === 0, GPS.open.size + ' open');
  ok('the hold survives', G().holds === 1, String(G().holds));
  ok('state records why', win.geoPaused() === 'hidden', String(win.geoPaused()));
  setHidden(false);
  ok('coming back reopens it', GPS.open.size === 1, GPS.open.size + ' open');
  ok('pause cleared', win.geoPaused() === null, String(win.geoPaused()));
  reset();
}

section('5. standing still steps down, then lets go');
{
  reset();
  win.geoWant('fine'); win.geoAcquire();
  fix(FARM[0], FARM[1]);
  ok('starts fine', G().profile === 'fine', String(G().profile));

  /* Pretend the last real movement was two minutes ago. */
  G().lastMove = Date.now() - 120000;
  win.geoTick();
  ok('90 seconds still drops to coarse', G().profile === 'coarse', String(G().profile));
  ok('still watching, just cheaper', GPS.open.size === 1);

  /* Now six minutes. */
  G().lastMove = Date.now() - 360000;
  win.geoTick();
  ok('five minutes still releases the watch', GPS.open.size === 0, GPS.open.size + ' open');
  ok('paused as idle', win.geoPaused() === 'idle', String(win.geoPaused()));
  ok('the hold is still there', G().holds === 1, String(G().holds));
  reset();
}

section('6. moving again earns the accuracy back');
{
  reset();
  win.geoWant('fine'); win.geoAcquire();
  fix(FARM[0], FARM[1]);
  G().lastMove = Date.now() - 120000;
  win.geoTick();
  ok('dropped to coarse first', G().profile === 'coarse', String(G().profile));

  /* Jitter must not count — a couple of feet is the chip, not a mower. */
  const jitter = north(5);
  fix(jitter[0], jitter[1]);
  ok('5 ft of jitter does not restore fine', G().profile === 'coarse', String(G().profile));

  const moved = north(200);
  fix(moved[0], moved[1]);
  ok('200 ft of travel restores fine', G().profile === 'fine', String(G().profile));
  reset();
}

section('7. the crew can override an idle pause');
{
  reset();
  win.geoAcquire();
  fix(FARM[0], FARM[1]);
  G().lastMove = Date.now() - 360000;
  win.geoTick();
  ok('paused for idling', win.geoPaused() === 'idle');

  const chip = win.document.getElementById('tw-gpspaused');
  ok('the work screen has a resume chip', !!chip);
  ok('the chip is showing', chip.style.display === '', JSON.stringify(chip.style.display));

  chip.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping it resumes', win.geoPaused() === null, String(win.geoPaused()));
  ok('and reopens a watch', GPS.open.size === 1, GPS.open.size + ' open');
  ok('the chip hides again', chip.style.display === 'none', JSON.stringify(chip.style.display));

  /* Somebody who taps resume is telling us they're working while parked. */
  G().lastMove = Date.now() - 360000;
  win.geoTick();
  ok('it does not immediately re-pause', win.geoPaused() === null, String(win.geoPaused()));
  reset();
}

section('8. a tab switch cannot clear an idle pause');
{
  reset();
  win.geoAcquire();
  fix(FARM[0], FARM[1]);
  G().lastMove = Date.now() - 360000;
  win.geoTick();
  ok('idle-paused', win.geoPaused() === 'idle');
  setHidden(true); setHidden(false);
  ok('still idle-paused after a hide/show', win.geoPaused() === 'idle', String(win.geoPaused()));
  ok('no watch was opened', GPS.open.size === 0, GPS.open.size + ' open');
  reset();
}

section('9. battery saver overrides everything');
{
  reset();
  win.POWER.saver = true;
  ok('saver forces coarse even for alleys',
     win.gpsProfileFor({ title: 'Rotary mow alleys' }) === 'coarse');
  ok('saver beats an explicit task.gps',
     win.gpsProfileFor({ title: 'x', gps: 'fine' }) === 'coarse');

  win.geoWant('fine'); win.geoAcquire();
  ok('the watch opens coarse regardless', liveWatch().opts.enableHighAccuracy === false);

  ok('saver halves the idle patience',
     win.geoIdleMs(win.GEO_RELEASE_MS) === Math.round(win.GEO_RELEASE_MS / 2),
     String(win.geoIdleMs(win.GEO_RELEASE_MS)));

  fix(FARM[0], FARM[1]);
  G().lastMove = Date.now() - 160000;   /* under 5 min, over 2.5 */
  win.geoTick();
  ok('and releases sooner because of it', win.geoPaused() === 'idle', String(win.geoPaused()));
  reset();
}

section('10. saver persists and is reachable from Preferences');
{
  reset();
  ok('a Battery category exists',
     win.PREF_CATS.some(c => c.go === 'powersettings'),
     win.PREF_CATS.map(c => c.go).join(','));
  ok('it has a settings screen', !!win.document.getElementById('s-powersettings'));

  win.go('powersettings');
  const tgl = win.document.getElementById('pwr-tgl');
  ok('the screen renders a switch', !!tgl);
  ok('the switch starts off', !tgl.classList.contains('on'));

  tgl.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping it turns saver on', win.POWER.saver === true);
  ok('and writes it down', /"saver":true/.test(store.ut_power || ''), store.ut_power);

  win.document.getElementById('pwr-tgl')
     .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping again turns it off', win.POWER.saver === false);
  reset();
}

section('11. releasing clears any pause');
{
  reset();
  win.geoAcquire();
  setHidden(true);
  ok('paused while hidden', win.geoPaused() === 'hidden');
  win.geoRelease();
  ok('releasing the hold clears the pause', win.geoPaused() === null, String(win.geoPaused()));
  setHidden(false);
  ok('and no watch comes back unasked', GPS.open.size === 0, GPS.open.size + ' open');
  reset();
}

section('12. locating is a control, not a layer');
{
  reset();
  /* The old "Me" chip sat between Labels and Trials, which put finding yourself
     on the same footing as turning on alley shading. */
  const chips = [...win.document.querySelectorAll('#s-map [data-mchip]')]
    .map(c => c.getAttribute('data-mchip'));
  ok('no Me chip on the farm map layer row', !chips.includes('me'), chips.join(','));
  ok('no Me chip on the work map layer row',
     !win.document.querySelector('#tw-chips [data-twchip="me"]'));

  const fm = win.document.getElementById('map-locate');
  const tw = win.document.getElementById('tw-locate');
  ok('the farm map has a locate button', !!fm);
  ok('the work map has one too', !!tw);
  ok('both use the same control class',
     fm && tw && fm.classList.contains('locbtn') && tw.classList.contains('locbtn'));
  ok('the button is inside the map viewport, not the chip row',
     fm && fm.closest('.mapvp') && !fm.closest('.mapchips'));

  /* Map furniture is set once in mapChrome() so no view can drift out of line:
     zoom bottom-right, attribution under it, top corners left for the locate
     button and the mow badge. A raw L.map() that skips it would take Leaflet's
     default top-left zoom and land back on top of something. */
  /* Strip block comments first — mapChrome's own doc comment mentions L.map()
     and would otherwise count as an unwrapped call site. */
  const src = fs.readFileSync(APP, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const raw = (code.match(/L\.map\(/g) || []).length;
  const wrapped = (code.match(/mapChrome\(L\.map\(/g) || []).length;
  ok('every map is built through mapChrome', raw > 0 && raw === wrapped, wrapped + ' of ' + raw);
  ok('no map installs its own zoom control',
     !/zoomControl:\s*true/.test(src));
  ok('the only zoom control asks for bottomright',
     (src.match(/L\.control\.zoom\(/g) || []).length === 1
       && /L\.control\.zoom\(\{position:'bottomright'\}\)/.test(src));
  ok('attribution is pinned to the same corner',
     /setPosition\('bottomright'\)/.test(src));
  ok('and the two are ordered explicitly, not by DOM position',
     /leaflet-control-zoom\{order:1/.test(src) && /leaflet-control-attribution\{order:2/.test(src));
}

section('13. the work map locate button cycles off -> locked -> off');
{
  reset();
  const b = win.document.getElementById('tw-locate');
  win.TW.me = false; win.GEO.follow = false; win.TW.dot = null; win.TW.map = null;
  win.twLocatePaint();
  ok('starts with no state class',
     !b.classList.contains('on') && !b.classList.contains('lock'), b.className);

  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('first tap turns the dot on', win.TW.me === true);
  ok('and locks the map to it', win.GEO.follow === true);

  /* No fix yet, so it should read as searching rather than located. */
  ok('shows the seeking state until a fix lands', b.classList.contains('seek'), b.className);

  win.GEO.pos = { lat: FARM[0], lng: FARM[1], acc: 12, at: Date.now() };
  win.twLocatePaint();
  ok('with a fix and follow on it reads locked', b.classList.contains('lock'), b.className);

  /* Panning away breaks the lock but keeps the dot. */
  win.GEO.follow = false; win.twLocatePaint();
  ok('panning away drops to the on state', b.classList.contains('on'), b.className);
  ok('the dot is still wanted', win.TW.me === true);

  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping after a pan recentres rather than switching off', win.TW.me === true);
  ok('and locks again', win.GEO.follow === true);

  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping while locked switches off', win.TW.me === false);
  ok('and unlocks', win.GEO.follow === false);
  win.GEO.pos = null;
  reset();
}

section('14. a refused permission is shown, not hidden');
{
  reset();
  const b = win.document.getElementById('tw-locate');
  win.GEO.err = 'denied';
  win.twLocatePaint();
  ok('the button reads as dead', b.classList.contains('dead'), b.className);
  const wasMe = win.TW.me;
  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping it changes nothing', win.TW.me === wasMe);
  ok('geoErrText explains why', /Location off/.test(win.geoErrText()), win.geoErrText());
  win.GEO.err = null;
  reset();
}

section('15. nothing blew up');
{
  const real = seen.filter(m => !/Not implemented|Could not parse CSS/i.test(m));
  ok('no jsdom errors', real.length === 0, real.slice(0, 3).join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
