/*
 * Harness for the back-navigation rule.
 *
 * The behaviour under test: if you got to a screen from somewhere, that screen
 * offers a way back, and taking it returns you where you came from. Root screens
 * you reach off the bottom bar do not pretend you drilled in.
 *
 * Same jsdom + stub-Leaflet approach as test-mowing-setup.js.
 *
 * Run:  node tools/test-back-nav.js
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

const scripts = require('./_app').appScripts(win.document);
/* stack is a `let` binding and the app reassigns it in a few places, so reach it
   through accessors rather than snapshotting the array once. */
try {
  win.eval(scripts.join('\n;\n')
    + '\n;window.__stack=function(){return stack;};'
    + '\n;window.__clearStack=function(){stack.length=0;};');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }
const STACK = () => win.__stack();
const RESET = () => win.__clearStack();

const doc = win.document;
const active = () => { const a = doc.querySelector('.screen.active'); return a ? a.id.slice(2) : null; };
const screens = [...doc.querySelectorAll('.screen')].map(s => s.id.slice(2));

/* The arrow is only real if tapping it actually moves you, so drive it the way a
   thumb does - dispatch a click and let the app's own delegated handler run. */
function tapBack(id) {
  const bb = doc.querySelector('#s-' + id + ' .hdr .backbtn');
  if (!bb) return false;
  bb.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  return true;
}
/* A hidden chevron is not a back button, so treat display:none as absent. */
function backEl(id) {
  const el = doc.querySelector('#s-' + id + ' .hdr .backbtn');
  return el && el.style.display !== 'none' ? el : null;
}

/* Screens you land on off the bottom bar, plus the two that precede sign-in. */
const ROOTS = ['home-manager', 'home-undergrad', 'home-grad', 'home-faculty', 'home-tech', 'login', 'roles'];

section('Every drilled-into screen offers a way back');
let noArrow = [], deadArrow = [], wrongDest = [];
screens.forEach(id => {
  if (ROOTS.indexOf(id) >= 0) return;
  RESET();
  win.show('home-manager', false);
  win.go(id);
  if (active() !== id) return;               /* screen refused to open; not this suite's business */
  if (!backEl(id)) { noArrow.push(id); return; }
  const moved = tapBack(id);
  if (!moved) { deadArrow.push(id); return; }
  if (active() !== 'home-manager') wrongDest.push(id + '->' + active());
});
ok('no screen is missing its back arrow', noArrow.length === 0, noArrow.join(', '));
ok('no arrow is decorative - each one actually fires', deadArrow.length === 0, deadArrow.join(', '));
ok('and each one lands you back where you came from', wrongDest.length === 0, wrongDest.join(', '));

section('The eight dead chevrons specifically');
['taskdetail', 'fieldlog', 'tasknew', 'taskwork', 'gradreq', 'plotpick', 'templates', 'assign', 'indoor']
  .forEach(id => {
    RESET();
    win.show('taskboard', false);
    win.go(id);
    const el = backEl(id);
    ok(id + ' has a live back control', !!el && el.classList.contains('backbtn'));
  });

section('Hub pages only show the arrow when you drilled in');
['map', 'equipment', 'inventory', 'trial', 'taskboard', 'weather', 'fieldlog'].forEach(id => {
  RESET();
  win.goRoot(id);
  const asTab = backEl(id);
  RESET();
  win.show('more', false);
  win.go(id);
  const asDrill = backEl(id);
  ok(id + ': bare as a tab, arrow when opened from More', !asTab && !!asDrill,
     'tab=' + !!asTab + ' drill=' + !!asDrill);
});

section('Tapping a bottom tab does not pile up history');
RESET();
win.show('home-manager', false);
win.goRoot('map'); win.goRoot('taskboard'); win.goRoot('equipment');
ok('three tab hops leave nothing on the stack', STACK().length === 0, JSON.stringify(STACK()));
ok('so the third one shows no arrow', !backEl('equipment'));

section('Deep drilling unwinds one screen at a time');
RESET();
win.show('home-manager', false);
win.go('more'); win.go('equipment'); win.go('eqdetail');
ok('three deep', active() === 'eqdetail' && STACK().length === 3, JSON.stringify(STACK()));
tapBack('eqdetail');
ok('back to equipment', active() === 'equipment', active());
ok('equipment still shows an arrow - more is still behind it', !!backEl('equipment'));
tapBack('equipment');
ok('back to more', active() === 'more', active());
tapBack('more');
ok('back to home', active() === 'home-manager', active());
ok('and home is clean', !backEl('home-manager') && STACK().length === 0);

section('Headers that carry an action button keep it');
RESET();
win.show('more', false);
win.go('inventory');
ok('inventory keeps its add button alongside the new arrow',
   !!doc.querySelector('#s-inventory .hdr #inv-addbtn') && !!backEl('inventory'));
ok('and the title is not shoved to the far side',
   doc.querySelector('#s-inventory .hdr').style.justifyContent === 'flex-start',
   doc.querySelector('#s-inventory .hdr').style.justifyContent);
RESET();
win.goRoot('inventory');
ok('opening it as a tab restores the original header layout',
   doc.querySelector('#s-inventory .hdr').style.justifyContent === 'space-between'
   && !backEl('inventory'),
   doc.querySelector('#s-inventory .hdr').style.justifyContent);

section('Hand-written chevrons are left alone');
RESET();
win.show('more', false);
win.go('eqdetail');
const hand = backEl('eqdetail');
ok('the machine screen still uses its own arrow, not an injected one',
   hand && !hand.hasAttribute('data-autoback'));

section('Android back button');
RESET();
win.show('home-manager', false);
win.go('more'); win.go('equipment');
win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
ok('hardware back unwinds one screen', active() === 'more', active());
win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
ok('and again', active() === 'home-manager', active());
const atRoot = active();
win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
ok('at the root it stops rather than looping', active() === atRoot, active());

section('Load errors');
ok('no uncaught errors', seen.length === 0, seen.join(' | '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
