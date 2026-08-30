/*
 * Harness for the spray settings screen.
 *
 * The tip rates and the boom charge decide how much chemical lands on the
 * grass. They used to be constants in the source, which meant the farm could
 * not change them without a developer. Now they are editable, which means a
 * bad value is reachable from the interface — so what this file mostly pins
 * is the fence around them:
 *
 *   1. Defaults    — the built-in numbers are what the file says.
 *   2. Overrides   — only the section somebody changed is stored, so a
 *                    corrected default still reaches an untouched device.
 *   3. Validation  — a rate that would be wrong on the ground never applies,
 *                    including one hand-typed into a backup file.
 *   4. Effect      — the mix calculator actually reads the new numbers.
 *   5. Roles       — a person who cannot log a chemical cannot edit them.
 *
 * Run:  node tools/test-spray.js
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

const EX = ['SPRAY_NOZZLES','BOOM_CHARGE_GAL','BOOM_CHARGE_OVER_GAL','SPRAY_KEY',
            'sprayDiff','sprayApply','sprayIsDefault','sprayScan','sprayCaptureBase',
            'sprRender','sprCanEdit','mixCompute','mixNozzle','storeFlush','sessionSet','toast'];

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
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => {}, key: i => Object.keys(store)[i],
  };
  Object.defineProperty(ls, 'length', { get: () => Object.keys(store).length });
  Object.defineProperty(win, 'localStorage', { value: ls, configurable: true });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });

  const scripts = require('./_app').appScripts(win.document);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};'
      /* currentRole is a `let`, so it lives in this eval's own scope and a later
         win.eval('currentRole=...') would create an unrelated global instead.
         The setter has to be minted in here, with the binding.

         It signs a real person in now rather than just assigning the screen's
         idea of a role: sprCanEdit() reads the ROSTER since 2026-08-26, which is
         what lets it be transcribed into firestore.rules at all. */
      + '\n;window.__setRole=function(r){'
      + '  var want={manager:"Farm Manager",faculty:"Faculty",grad:"Graduate Student",'
      + '            tech:"Technician",undergrad:"Undergraduate Student"}[r]||r;'
      + '  var who=PEOPLE.filter(function(x){return x.role===want&&x.active!==false;})[0];'
      + '  if(who) sessionSet(who.id); else { SESSION.pid=null; currentRole=r; }'
      + '  return who&&who.id;};'
      + '\n;window.__role=function(){return currentRole;};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, doc: win.document, p: win.__p || {}, errs, store };
}

/* Read a global by name — sprayApply reassigns the charge vars, so a value
   captured into __p at boot goes stale. */
const g = (b, name) => b.win.eval(name);

/* ---------------------------------------------------------------- */
section('1. the built-in numbers');
{
  const b = boot({});
  ok('no errors on load', b.errs.length === 0, b.errs[0]);
  ok('three tips ship with the app', b.p.SPRAY_NOZZLES.length === 3, String(b.p.SPRAY_NOZZLES.length));
  ok('the red AI tip is 0.91 gal/1000 ft²', b.p.mixNozzle('red_ai').galM === 0.91);
  ok('the blue TeeJet is 2', b.p.mixNozzle('blue_tj').galM === 2);
  ok('the boom charge is 20 gal', g(b, 'BOOM_CHARGE_GAL') === 20);
  ok('the threshold is 25 gal', g(b, 'BOOM_CHARGE_OVER_GAL') === 25);
  ok('a fresh device counts as unchanged', b.p.sprayIsDefault() === true);
  ok('and writes nothing', !('ut_spray_settings_v1' in b.store), JSON.stringify(Object.keys(b.store).filter(k => /spray/.test(k))));
}

section('2. only the section somebody changed is stored');
{
  const s = {};
  const b = boot(s);
  b.win.eval('BOOM_CHARGE_GAL=18;'); b.p.sprayScan();
  const saved = JSON.parse(s['ut_spray_settings_v1']);
  ok('the charge is stored', saved.charge === 18, JSON.stringify(saved));
  /* This is the point: the tips still come from the file, so correcting a
     default rate later still reaches this device. */
  ok('the tips are NOT stored', !('nozzles' in saved), Object.keys(saved).join(','));
  ok('nor is the threshold', !('over' in saved), Object.keys(saved).join(','));

  const b2 = boot(s);
  ok('the charge survives a reload', g(b2, 'BOOM_CHARGE_GAL') === 18, String(g(b2, 'BOOM_CHARGE_GAL')));
  ok('the tips still read from the file', b2.p.mixNozzle('red_ai').galM === 0.91);
  ok('and the device knows it is modified', b2.p.sprayIsDefault() === false);
}

section('3. a rate change persists');
{
  const s = {};
  const b = boot(s);
  b.p.mixNozzle('red_ai').galM = 1.05;
  b.p.sprayScan();
  ok('the tips are stored once one changes', Array.isArray(JSON.parse(s['ut_spray_settings_v1']).nozzles));
  const b2 = boot(s);
  ok('the new rate comes back', b2.p.mixNozzle('red_ai').galM === 1.05, String(b2.p.mixNozzle('red_ai').galM));
  ok('the untouched tips came with it', b2.p.SPRAY_NOZZLES.length === 3);
}

section('4. a bad number never reaches the grass');
{
  const b = boot({});
  const before = b.p.mixNozzle('red_ai').galM;

  b.p.sprayApply({ nozzles: [{ id: 'red_ai', label: 'Red', galM: 0 }] });
  ok('a zero rate is refused', b.p.mixNozzle('red_ai').galM === before, String(b.p.mixNozzle('red_ai').galM));
  b.p.sprayApply({ nozzles: [{ id: 'red_ai', label: 'Red', galM: -3 }] });
  ok('a negative rate is refused', b.p.mixNozzle('red_ai').galM === before);
  b.p.sprayApply({ nozzles: [{ id: 'red_ai', label: 'Red', galM: 9999 }] });
  ok('an absurd rate is refused', b.p.mixNozzle('red_ai').galM === before);
  b.p.sprayApply({ nozzles: [{ id: 'red_ai', label: 'Red', galM: '0.91' }] });
  ok('a rate typed as text is refused', b.p.mixNozzle('red_ai').galM === before);
  b.p.sprayApply({ nozzles: [] });
  ok('an empty tip list is refused', b.p.SPRAY_NOZZLES.length === 3, String(b.p.SPRAY_NOZZLES.length));
  b.p.sprayApply({ nozzles: 'red' });
  ok('a tip list that is not a list is refused', b.p.SPRAY_NOZZLES.length === 3);

  b.p.sprayApply({ charge: -5 });
  ok('a negative charge is refused', g(b, 'BOOM_CHARGE_GAL') === 20);
  b.p.sprayApply({ charge: 500 });
  ok('an absurd charge is refused', g(b, 'BOOM_CHARGE_GAL') === 20);
  b.p.sprayApply({ over: -1 });
  ok('a negative threshold is refused', g(b, 'BOOM_CHARGE_OVER_GAL') === 25);
  b.p.sprayApply(null);
  ok('nothing at all is survivable', g(b, 'BOOM_CHARGE_GAL') === 20);

  b.p.sprayApply({ charge: 18.5, over: 30 });
  ok('but a sensible pair does apply', g(b, 'BOOM_CHARGE_GAL') === 18.5 && g(b, 'BOOM_CHARGE_OVER_GAL') === 30);

  /* A backup file is a text file somebody can edit. */
  const hostile = boot({ ut_spray_settings_v1: JSON.stringify({ nozzles: [{ id: 'red_ai', label: 'Red', galM: 400 }], charge: 1e6 }) });
  ok('a hand-edited backup cannot poison the rates', hostile.p.mixNozzle('red_ai').galM === 0.91,
     String(hostile.p.mixNozzle('red_ai').galM));
  ok('nor the charge', g(hostile, 'BOOM_CHARGE_GAL') === 20, String(g(hostile, 'BOOM_CHARGE_GAL')));

  const junk = boot({ ut_spray_settings_v1: '{oh dear' });
  ok('corrupt settings leave the defaults standing', junk.p.mixNozzle('red_ai').galM === 0.91);
}

section('5. the mix calculator reads the new numbers');
{
  const b = boot({});
  const task = { id: 'z1', title: 'Spray · Pesticide - Boom', type: 'Spray · Pesticide - Boom', machine: 'e2', plots: [] };
  b.win.eval('window.__t=' + JSON.stringify(task) + ';');

  const base = b.win.eval('var c=mixCompute(window.__t); JSON.stringify({base:c.base,charge:c.charge,tank:c.tank});');
  const c0 = JSON.parse(base);
  ok('a boom job computes a tank', c0.tank > 0, base);
  ok('and takes the 20-gal charge', c0.charge === 20, String(c0.charge));

  b.win.eval('BOOM_CHARGE_GAL=12;');
  const c1 = JSON.parse(b.win.eval('var c=mixCompute(window.__t); JSON.stringify({charge:c.charge,tank:c.tank});'));
  ok('changing the charge changes the tank', c1.charge === 12 && c1.tank === c0.tank - 8,
     JSON.stringify(c1) + ' vs ' + base);

  /* Raising the threshold above the run should drop the charge entirely. */
  b.win.eval('BOOM_CHARGE_OVER_GAL=100000;');
  const c2 = JSON.parse(b.win.eval('var c=mixCompute(window.__t); JSON.stringify({charge:c.charge});'));
  ok('raising the threshold above the run drops the charge', c2.charge === 0, JSON.stringify(c2));

  /* And the tip rate drives the volume itself. */
  b.win.eval('BOOM_CHARGE_OVER_GAL=25; mixNozzle("red_ai").galM=1.82;');
  const c3 = JSON.parse(b.win.eval('var c=mixCompute(window.__t); JSON.stringify({base:c.base});'));
  ok('doubling the tip rate doubles the volume', Math.abs(c3.base - c0.base * 2) < 1e-6,
     c3.base + ' vs ' + c0.base);
}

section('6. the screen');
{
  const b = boot({});
  b.p.sessionSet('p07');
  b.p.sprRender();
  const html = b.doc.getElementById('spr-body').innerHTML;
  ok('it renders', html.length > 200);
  ok('every tip has a row', (html.match(/data-spr-rate="/g) || []).length === 3,
     String((html.match(/data-spr-rate="/g) || []).length));
  /* Four editable numbers now: the boom charge, the run threshold, and since
     2026-08-30 the two spray-hold limits that used to be constants in the
     weather code. */
  ok('the charge, the threshold and both hold limits are editable',
     (html.match(/data-spr-num="/g) || []).length === 4,
     String((html.match(/data-spr-num="/g) || []).length));
  ok('the wind limit is on the screen', /data-spr-num="wind"/.test(html));
  ok('and the rain limit', /data-spr-num="precip"/.test(html));
  ok('with a plain-English reason for them', /too windy to spray/.test(html));
  ok('an unchanged device says so', /built-in numbers\./.test(html));
  ok('and offers no reset it does not need', !/data-spr="reset"/.test(html));

  /* Typing a rate in and blurring is how a rate actually gets changed. */
  const inp = b.doc.querySelector('[data-spr-rate="blue_tj"]');
  inp.value = '1.75';
  inp.dispatchEvent(new b.win.Event('change', { bubbles: true }));
  ok('a typed rate applies', b.p.mixNozzle('blue_tj').galM === 1.75, String(b.p.mixNozzle('blue_tj').galM));
  ok('and is written straight away', JSON.parse(b.store['ut_spray_settings_v1']).nozzles.length === 3);
  ok('the screen now offers a reset', /data-spr="reset"/.test(b.doc.getElementById('spr-body').innerHTML));

  const bad = b.doc.querySelector('[data-spr-rate="blue_tj"]');
  bad.value = '-4';
  bad.dispatchEvent(new b.win.Event('change', { bubbles: true }));
  ok('a bad typed rate is refused', b.p.mixNozzle('blue_tj').galM === 1.75, String(b.p.mixNozzle('blue_tj').galM));

  /* The spray-hold limits, which the weather screen and every home-screen
     spray widget judge the forecast against. */
  {
    const w = b.doc.querySelector('[data-spr-num="wind"]');
    w.value = '8';
    w.dispatchEvent(new b.win.Event('change', { bubbles: true }));
    ok('Bill can say the farm holds at 8 mph, not 10', b.win.eval('WX_SPRAY_WIND') === 8,
       String(b.win.eval('WX_SPRAY_WIND')));
    ok('and it is written straight away', JSON.parse(b.store['ut_spray_settings_v1']).wind === 8);

    const w2 = b.doc.querySelector('[data-spr-num="wind"]');
    w2.value = '900';
    w2.dispatchEvent(new b.win.Event('change', { bubbles: true }));
    ok('a limit that would switch the warning off is refused', b.win.eval('WX_SPRAY_WIND') === 8,
       String(b.win.eval('WX_SPRAY_WIND')));

    const r = b.doc.querySelector('[data-spr-num="precip"]');
    r.value = '35';
    r.dispatchEvent(new b.win.Event('change', { bubbles: true }));
    ok('and the rain limit moves too', b.win.eval('WX_SPRAY_PRECIP') === 35,
       String(b.win.eval('WX_SPRAY_PRECIP')));
    ok('the reset row names what was changed', /wind limit|rain limit/.test(b.doc.getElementById('spr-body').innerHTML));
  }

  /* Adding and removing a tip. */
  b.doc.querySelector('[data-spr="addopen"]').click();
  b.doc.getElementById('spr-n-label').value = 'Green TeeJet';
  b.doc.getElementById('spr-n-rate').value = '0.4';
  b.doc.querySelector('[data-spr="addsave"]').click();
  ok('a new tip is added', b.p.SPRAY_NOZZLES.length === 4 && b.p.mixNozzle('green_teejet').galM === 0.4,
     JSON.stringify(b.p.SPRAY_NOZZLES.map(n => n.id)));

  b.doc.querySelector('[data-spr-del="green_teejet"]').click();
  ok('and can be removed again', b.p.SPRAY_NOZZLES.length === 3);

  /* The last tip has to stay: mixNozzle falls back to SPRAY_NOZZLES[0]. */
  b.win.eval('SPRAY_NOZZLES.length=1; sprRender();');
  ok('the last tip has no delete', !/data-spr-del/.test(b.doc.getElementById('spr-body').innerHTML));
}

/* Was "only the roles that can log a chemical" -- sprCanEdit() delegated to
   flCanChem(), which reads currentRole. It is its own roster-read line now
   (fstCanEditKit), and Dillon added faculty to Farm settings on 2026-08-26.
   Logging a chemical is still flCanChem() and still a separate question. */
section('7. everybody but the undergraduates can edit the sprayer');
{
  const b = boot({});
  b.win.__setRole('tech');
  ok('a technician can edit', b.p.sprCanEdit() === true);
  b.win.__setRole('grad');
  ok('so can a grad student', b.p.sprCanEdit() === true);
  b.win.__setRole('manager');
  ok('so can the manager', b.p.sprCanEdit() === true);
  b.win.__setRole('faculty');
  ok('and so can faculty now', b.p.sprCanEdit() === true);

  b.win.__setRole('undergrad');
  ok('an undergrad cannot', b.p.sprCanEdit() === false);
  b.p.sprRender();
  const ro = b.doc.getElementById('spr-body').innerHTML;
  ok('and gets a read-only screen', !/data-spr-rate/.test(ro) && /Read-only for your role/.test(ro));
  ok('with the numbers still visible', /0\.91/.test(ro) && /20 gal/.test(ro));

  /* The interface being read-only is not the fence — the handler is. */
  b.win.__setRole('tech'); b.p.sprRender();
  const inp = b.doc.querySelector('[data-spr-rate="red_ai"]');
  b.win.__setRole('undergrad');
  inp.value = '5';
  inp.dispatchEvent(new b.win.Event('change', { bubbles: true }));
  ok('a stale input cannot change a rate either', b.p.mixNozzle('red_ai').galM === 0.91,
     String(b.p.mixNozzle('red_ai').galM));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
