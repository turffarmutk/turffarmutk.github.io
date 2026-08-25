/*
 * Harness for PLACES — the table that says what every named piece of ground is.
 *
 * The behaviour under test: a place name is not just a string. Something has to
 * know that "CAFS9" is a research plot, "Shop" is a building nobody mows,
 * "Alleys" is a total with no shape, and "CAFS6" is a heading for CAFS6a/6b/6c.
 * Tasks, the field log, trials and the map all point at ground by name, so if
 * this table is wrong or missing they all inherit the same wrong idea.
 *
 * It also pins two rules that used to live only in comments, and that would
 * cause quiet, confident errors if they were ever dropped:
 *   - the CAFS polygons are a synthetic grid; their measured area is meaningless
 *   - AZ11 is gravel: sprayed, never mowed, but still in the rotation
 *
 * Run:  node tools/test-places.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

const vc = new VirtualConsole();
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
                 : (k === 'getContainer') ? () => null : chain()),
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

try {
  win.eval(appSource(win.document));
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const P = win.PLACES || {};
const kinds = Object.values(P).reduce((a, p) => (a[p.kind] = (a[p.kind] || 0) + 1, a), {});

section('1. every named place is in the table, and says what it is');
{
  ok('PLACES exists', Object.keys(P).length > 0);
  ok('158 research plots', kinds.plot === 158, String(kinds.plot));
  ok('8 facilities', kinds.facility === 8, String(kinds.facility));
  ok('2 alley totals with no shape', kinds.aggregate === 2, String(kinds.aggregate));
  ok('11 alley work zones', kinds.alley_zone === 11, String(kinds.alley_zone));
  ok('11 split-plot labels', kinds.split_parent === 11, String(kinds.split_parent));
  ok('every entry has a kind', Object.values(P).every(p => !!p.kind));

  /* The counts have to reconcile with the tables they came from, or a plot has
     silently gone missing. */
  const shapes = win.PLOTS_DATA.features.length;
  ok('shapes still reconcile: plots + facilities = polygons',
     kinds.plot + kinds.facility === shapes, kinds.plot + '+' + kinds.facility + ' vs ' + shapes);
  ok('plots + totals = PLOT_INFO rows',
     kinds.plot + kinds.aggregate === Object.keys(win.PLOT_INFO).length);
}

section('2. you can only be sent somewhere real');
{
  ok('a research plot is workable', win.placeIsWorkable('CAFS9'));
  ok('an alley zone is workable', win.placeIsWorkable('AZ07'));
  ok('the Shop is NOT', !win.placeIsWorkable('Shop'));
  ok('nor the Chemical Building', !win.placeIsWorkable('Chemical Building'));
  ok('nor a dump pile', !win.placeIsWorkable('Dump Pile #1'));
  ok('"Alleys" is a total, not a place to send someone', !win.placeIsWorkable('Alleys'));
  ok('"CAFS Alleyways" likewise', !win.placeIsWorkable('CAFS Alleyways'));
  ok('a split-plot label is not workable', !win.placeIsWorkable('CAFS6'));
  ok('but its children are', win.placeIsWorkable('CAFS6a') && win.placeIsWorkable('CAFS6b'));
  ok('and they remember their parent', win.placeOf('CAFS6a').parent === 'CAFS6');
  ok('a name nobody knows is null, not a guess', win.placeOf('Narnia') === null);
  ok('every workable place is a plot or a zone',
     win.placesWorkable().every(id => ['plot', 'alley_zone'].includes(win.placeKind(id))));
}

section('3. area comes from the record, never from the polygon');
{
  /* The CAFS grid was drawn to sit roughly in the right place. Measuring it
     gives a confident wrong answer, and that answer would feed spray rates. */
  ok('a CAFS plot knows its shape cannot be measured', win.placeAreaFromShape('CAFS9') === false);
  ok('no CAFS plot claims otherwise',
     Object.keys(P).filter(id => /^CAFS\d/.test(id)).every(id => !P[id].areaFromShape));
  ok('a surveyed plot still can be', win.placeAreaFromShape('B12') === true);
  ok('CAFS9 has a recorded area', win.placeArea('CAFS9') === 450, String(win.placeArea('CAFS9')));
  ok('every research plot has one',
     Object.values(P).filter(p => p.kind === 'plot').every(p => typeof p.areaSqft === 'number'));
  ok('facilities have no area to spray', win.placeArea('Shop') === null);
}

section('4. gravel is sprayed, not mowed');
{
  ok('AZ06, the CAFS surrounds, is grass and gets cut', win.placeMowable('AZ06'));
  ok('AZ11, the CAFS alleyways, does not', !win.placeMowable('AZ11'));
  ok('and AZ11 is recorded as gravel', win.placeOf('AZ11').surface === 'gravel');
  ok('but AZ11 is still in the rotation', win.placesWorkable().includes('AZ11'));
  ok('nothing with a mower is anything but turf',
     Object.values(P).every(p => !p.mowable || p.surface === 'turf'),
     JSON.stringify(Object.values(P).find(p => p.mowable && p.surface !== 'turf')));
  ok('no building is mowable',
     Object.values(P).filter(p => p.kind === 'facility').every(p => !p.mowable));
}

section('5. a correction never needs a code change');
{
  const def = win.MAP_DEFS.find(d => d.name === 'places');
  ok('places is an editable map layer', !!def);
  ok('with its own storage key', def && def.key === 'ut_places_v1', def && def.key);

  win.PLACES['AZ11'].mowable = true;
  const diff = win.mapDiff(def);
  ok('only the corrected entry is stored', Object.keys(diff).join(',') === 'AZ11',
     Object.keys(diff).join(','));
  ok('and the correction is what is stored', diff.AZ11 && diff.AZ11.mowable === true);
  win.PLACES['AZ11'].mowable = false;
  ok('putting it back leaves nothing stored', Object.keys(win.mapDiff(def)).length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
