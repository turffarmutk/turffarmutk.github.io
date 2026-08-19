/*
 * Harness for per-person preferences.
 *
 * The behaviour under test: everything a person can tune is stored under their
 * roster id, not under their role, and it survives a reload. Before this, two
 * technicians shared one home screen because both were "tech", and two of the
 * five Preferences categories — Navigation and Notifications — were not written
 * down at all, so every choice evaporated on refresh.
 *
 * Three things get pinned here:
 *   1. Isolation   — two people in the same role do not read each other's prefs.
 *   2. Durability  — a choice made, then re-read from a fresh boot, comes back.
 *   3. Row counts  — the per-widget count reaches the renderers, replacing the
 *                    hardcoded slice(0,3) each card used to end in.
 *
 * jsdom does no layout, so this checks the wiring and the stored shape, not the
 * pixels. Same stub-Leaflet boot as test-responsive.js.
 *
 * Run:  node tools/test-prefs.js
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

/* ---- boot ----
   Returns a live app sharing the `store` object handed in, so a second boot over
   the same store is exactly the reload a person would do. */
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

  const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={'
      + 'prefsWho:prefsWho,prefsGet:prefsGet,prefsSet:prefsSet,'
      + 'navChosen:navChosen,navSetChosen:navSetChosen,NAV_DEF:NAV_DEF,NAV_OPTIONS:NAV_OPTIONS,'
      + 'hwOn:hwOn,hwToggle:hwToggle,hwOrder:hwOrder,hwMove:hwMove,'
      + 'hwRows:hwRows,hwSetRows:hwSetRows,HW_ROWS:HW_ROWS,hwWid:hwWid,'
      + 'NOTIF:NOTIF,notifSave:notifSave,notifLoad:notifLoad,notifSummary:notifSummary,'
      + 'RST_LOGIN:RST_LOGIN,HOME_WIDGETS:HOME_WIDGETS,'
      + 'setRole:function(r){currentRole=r;prefsSwitch();},getRole:function(){return currentRole;},'
      + 'THEME:THEME,themeSave:themeSave,themeLoad:themeLoad'
      + '};');
  } catch (e) { console.log('app script threw: ' + e.message); fail++; }
  return { win, doc: win.document, p: win.__p || {}, errs };
}

/* ---------------------------------------------------------------- */
section('1. preferences are keyed to the person, not the role');
{
  const store = {};
  const { p } = boot(store);
  p.setRole('tech');
  ok('signed-in tech resolves to a roster id', p.prefsWho() === p.RST_LOGIN.tech,
     p.prefsWho() + ' vs ' + p.RST_LOGIN.tech);
  ok('the id is not the role name', p.prefsWho() !== 'tech');

  p.setRole('manager');
  ok('switching person changes the key', p.prefsWho() === p.RST_LOGIN.manager, p.prefsWho());

  /* The isolation that did not exist before: same role, different person. */
  p.setRole('tech');
  p.prefsSet('nav', ['Equip']);
  const stored = JSON.parse(store.ut_prefs);
  ok('the choice lands under the roster id', !!(stored[p.RST_LOGIN.tech] || {}).nav,
     Object.keys(stored).join(','));
  ok('and not under the role name', !(stored.tech && stored.tech.nav));
}

section('2. navigation tabs survive a reload');
{
  const store = {};
  {
    const { p } = boot(store);
    p.setRole('manager');
    ok('starts on the role default', p.navChosen().join(',') === p.NAV_DEF.manager.join(','),
       p.navChosen().join(','));
    p.navSetChosen(['Trials', 'Equip', 'Field']);
    ok('the new choice reads back in-session', p.navChosen().join(',') === 'Trials,Equip,Field',
       p.navChosen().join(','));
  }
  /* Fresh boot, same browser. This is the bug that was there: NAV_PREFS was a
     const, so this used to come back as the default every time. */
  {
    const { p } = boot(store);
    p.setRole('manager');
    ok('and again after a reload', p.navChosen().join(',') === 'Trials,Equip,Field',
       p.navChosen().join(','));
    /* Someone else in another role is unaffected. */
    p.setRole('tech');
    ok('another person still gets their own default',
       p.navChosen().join(',') === p.NAV_DEF.tech.join(','), p.navChosen().join(','));
  }
}

section('3. a role that cannot reach a page never shows its tab');
{
  const store = {};
  const { p } = boot(store);
  p.setRole('manager');
  p.navSetChosen(['Clock', 'Map', 'Tasks']);
  p.setRole('tech');
  const tabs = p.navChosen();
  const reachable = p.NAV_OPTIONS.tech;
  ok('tech gets no Clock tab from the manager who shares the device',
     !tabs.includes('Clock'), tabs.join(','));
  ok('every tab shown is one the role can open',
     tabs.every(l => reachable.includes(l)), tabs.join(','));
}

section('4. notification settings are written down');
{
  const store = {};
  let summary;
  {
    const { win, doc, p } = boot(store);
    p.setRole('manager');
    ok('trials alerts start off', p.NOTIF.a_trials === false, String(p.NOTIF.a_trials));
    win.go('notifsettings');
    const tgl = doc.querySelector('#s-notifsettings .nts-tgl[data-k="a_trials"]');
    ok('the screen renders a toggle for each alert', !!tgl);
    if (tgl) tgl.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('tapping it flips the value', p.NOTIF.a_trials === true, String(p.NOTIF.a_trials));

    const q = doc.querySelector('#s-notifsettings .nts-tgl[data-k="quiet"]');
    if (q) q.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('quiet hours can be turned on', p.NOTIF.quiet === true, String(p.NOTIF.quiet));
    ok('and the hour inputs appear only then',
       !!doc.querySelector('#s-notifsettings .nts-time'));
    summary = p.notifSummary();
    ok('the hub summary reflects the real state', /07:00–21:00/.test(summary), summary);
  }
  {
    const { p } = boot(store);
    p.setRole('manager');
    ok('the alert is still on after a reload', p.NOTIF.a_trials === true, String(p.NOTIF.a_trials));
    ok('quiet hours too', p.NOTIF.quiet === true, String(p.NOTIF.quiet));
    ok('and the summary matches what it was', p.notifSummary() === summary, p.notifSummary());
  }
}

section('5. home widget choices follow the person');
{
  const store = {};
  {
    const { p } = boot(store);
    p.setRole('manager');
    ok('everything starts on', p.hwOn('manager', 'inv') === true);
    p.hwToggle('manager', 'inv');
    ok('turning one off sticks', p.hwOn('manager', 'inv') === false);
    p.hwMove('manager', 'field', -1);
  }
  {
    const { p } = boot(store);
    p.setRole('manager');
    ok('still off after a reload', p.hwOn('manager', 'inv') === false);
    const order = p.hwOrder('manager');
    const cat = p.HOME_WIDGETS.manager.map(w => w.id);
    ok('the saved order came back', order.join(',') !== cat.join(','), order.join(','));
    ok('and still holds every widget the role has',
       cat.every(id => order.includes(id)), order.join(','));
    /* The whole point: a different tech is not looking at Bill's home screen. */
    p.setRole('tech');
    ok('another person is untouched', p.hwOn('tech', 'inv') === true);
  }
}

section('6. row counts reach the renderers');
{
  const store = {};
  const { win, doc, p } = boot(store);
  p.setRole('manager');
  ok('a list widget has a row spec', !!p.HW_ROWS.inv);
  ok('a non-list widget does not', !p.HW_ROWS.wx && !p.HW_ROWS.kpis);
  ok('default is three rows', p.hwRows('inv') === 3, String(p.hwRows('inv')));

  ok('the element id maps to the widget id', p.hwWid('hw-u-mytasks') === 'mytasks', p.hwWid('hw-u-mytasks'));
  ok('and for the tech jobs card', p.hwWid('hw-t-jobs') === 'jobs', p.hwWid('hw-t-jobs'));

  p.hwSetRows('inv', 6);
  ok('the count can be raised', p.hwRows('inv') === 6, String(p.hwRows('inv')));
  p.hwSetRows('inv', 99);
  ok('but is clamped to the widget max', p.hwRows('inv') === p.HW_ROWS.inv.max, String(p.hwRows('inv')));
  p.hwSetRows('inv', 0);
  ok('and to the minimum', p.hwRows('inv') === p.HW_ROWS.inv.min, String(p.hwRows('inv')));
  ok('a widget with no spec is never settable', p.hwSetRows('wx', 5) === false);

  /* The stepper only exists for widgets that actually show rows. */
  win.go('homescreen');
  const body = doc.getElementById('hws-body');
  const steppers = body ? [...body.querySelectorAll('.hws-rows')] : [];
  const wids = [...new Set(steppers.map(s => s.getAttribute('data-w')))];
  ok('Home screen settings draws steppers', wids.length > 0, wids.join(','));
  ok('only for widgets with a row spec', wids.every(w => !!p.HW_ROWS[w]), wids.join(','));
  ok('and never for the weather strip or the KPI tiles',
     !wids.includes('wx') && !wids.includes('kpis'), wids.join(','));

  /* And the count actually lands in the rendered card, not just in storage. */
  p.hwSetRows('inv', 1);
  win.go('home-manager');
  const before = doc.querySelectorAll('#hw-m-inv [data-open^="item:"]').length;
  p.hwSetRows('inv', 5);
  win.go('home-manager');
  const after = doc.querySelectorAll('#hw-m-inv [data-open^="item:"]').length;
  ok('raising the count renders more rows', after > before, before + ' -> ' + after);
}

section('7. theme follows the person');
{
  const store = {};
  {
    const { p } = boot(store);
    p.setRole('manager');
    p.THEME.size = 'lg'; p.themeSave();
  }
  {
    const { p } = boot(store);
    p.setRole('manager');
    ok('text size comes back for the person who set it', p.THEME.size === 'lg', p.THEME.size);
    ok('the last-signed-in marker was written', !!store.ut_last_person, String(store.ut_last_person));
  }
}

section('8. an existing install keeps what it had');
{
  /* Someone who used the app before this change has role-keyed keys sitting in
     localStorage. They should wake up to the same home screen, not a reset one. */
  const store = {
    ut_home_widgets: JSON.stringify({ manager: ['inv'] }),
    ut_home_order:   JSON.stringify({ manager: ['kpis', 'wx', 'cal'] }),
    ut_theme:        JSON.stringify({ banner: 'smokey', cb: true, size: 'lg' })
  };
  const { p } = boot(store);
  p.setRole('manager');
  ok('the widget they turned off is still off', p.hwOn('manager', 'inv') === false);
  ok('their order was carried over', p.hwOrder('manager')[0] === 'kpis', p.hwOrder('manager')[0]);
  ok('and their theme came with them', p.THEME.cb === true && p.THEME.size === 'lg',
     p.THEME.size + '/' + p.THEME.cb);
  ok('migration runs once', JSON.parse(store.ut_prefs).__v === 1);
  ok('the old keys are left alone for older builds', !!store.ut_home_widgets);
}

section('9. nothing blew up');
{
  const store = {};
  const { errs } = boot(store);
  ok('no jsdom errors', errs.length === 0, errs.join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
