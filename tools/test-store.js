/*
 * Harness for the STORE module and the backup/restore screen.
 *
 * What it pins:
 *   1. Persistence  — the six globals that used to snap back to seed on every
 *                     reload now survive one.
 *   2. Safety       — corrupt or foreign data in localStorage must never wipe
 *                     the seed. A bad save is recoverable; a wiped array is not.
 *   3. Backup       — the export sweeps every ut_* key rather than a hand list,
 *                     leaves the session out, and survives a round trip.
 *   4. CSV          — a value a person typed cannot break the spreadsheet.
 *   5. Map records   — PLOT_INFO and MGMT_DATA store only what differs from
 *                     farm-geo.js, so the file stays the source of truth for
 *                     everything nobody has touched.
 *
 * Run:  node tools/test-store.js
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

/* A localStorage that can be made to fail, so the quota path is reachable. */
function makeLS(store) {
  const ls = {
    fail: false,
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { if (ls.fail) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: i => Object.keys(store)[i],
  };
  Object.defineProperty(ls, 'length', { get: () => Object.keys(store).length });
  return ls;
}

const EX = ['TASKS','INVENTORY','EQUIP','EQMAINT','EQPROBLEMS','EQCHECKOUT','EQSCHED','EVENTS',
            'STORE_DEFS','storeHydrate','storeFlush','storeScan','storeWriteRaw','storeDef',
            'bkKeys','bkPayload','bkCsvCell','bkCsvTable','bkCsvSections','bkRestore','bkLastHtml',
            'bkDaysSinceExport','bkNoteExport','SESSION_KEY','sessionSet','newId',
            'PLOT_INFO','MGMT_DATA','MAP_DEFS','mapDiff','mapOverrideCount','mapClearOverrides',
            'bkPlotInfoRows','bkMgmtRows'];

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
  const ls = makeLS(store);
  Object.defineProperty(win, 'localStorage', { value: ls, configurable: true });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });

  const scripts = require('./_app').appScripts(win.document);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, p: win.__p || {}, errs, ls };
}

/* ---------------------------------------------------------------- */
section('0. the app still boots');
const store = {};
const first = boot(store);
ok('no jsdom errors on load', first.errs.length === 0, first.errs[0]);
ok('the store module is present', Array.isArray(first.p.STORE_DEFS) && first.p.STORE_DEFS.length === 15,
   String(first.p.STORE_DEFS && first.p.STORE_DEFS.length));
/* Named rather than counted: a collection that silently drops off the registry
   loses its persistence, its export and its restore all at once, and a bare
   length check cannot say which one went. */
{
  const want = ["tasks","inventory","equip","eqmaint","eqproblems","eqcheckout","eqsched","events","bugs","invmoves","templates","semesters","schedules","trials","trialsgone"];
  const got  = (first.p.STORE_DEFS||[]).map(d => d.name);
  want.forEach(function(n){ ok("  "+n+" is registered", got.indexOf(n) >= 0, got.join(",")); });
}

section('1. seeds become the baseline on first run');
{
  const keys = first.p.STORE_DEFS.map(d => d.key);
  ok('every collection wrote a key', keys.every(k => typeof store[k] === 'string'),
     keys.filter(k => typeof store[k] !== 'string').join(','));
  /* Tasks ship EMPTY since 2026-08-24 — only equipment, the roster and the task
     catalog are pre-loaded now, so an empty tasks key is correct, not a bug.
     What still has to be true is that the collection was written at all, and
     that a collection which DOES carry a seed keeps it. */
  ok('tasks were written, even though empty', Array.isArray(JSON.parse(store['ut_tasks_v1'])),
     store['ut_tasks_v1']);
  ok('equipment was seeded', JSON.parse(store['ut_equip_v1']).length > 0,
     String(JSON.parse(store['ut_equip_v1'] || '[]').length));
}

section('2. a change survives a reload — the whole point');
{
  const before = first.p.TASKS.length;
  first.p.TASKS.push({ id: first.p.newId('a'), title: 'Mow the bullpen', status: 'todo', kind: 'task', assignee: 'p07' });
  first.p.storeFlush();
  ok('the write landed in storage', JSON.parse(store['ut_tasks_v1']).length === before + 1);

  const second = boot(store);                     /* same storage, fresh page */
  ok('the task is still there after reload', second.p.TASKS.length === before + 1,
     second.p.TASKS.length + ' vs ' + (before + 1));
  ok('and it is the same task',
     second.p.TASKS.some(t => t.title === 'Mow the bullpen'));

  /* The bug this replaces: TASKS.push() with nowhere to go. */
  const third = boot({});                         /* empty storage = back to seed */
  ok('a clean device still gets the seed', third.p.TASKS.length === before);
}

section('3. bad data must never wipe good data');
{
  /* Asserted against EQUIP, not TASKS: tasks now ship empty, so an empty array
     could not tell "seed survived" from "seed was wiped". Equipment still
     carries 87 rows, which makes the difference visible. */
  const corrupt = Object.assign({}, store, { ut_equip_v1: '{not json at all' });
  const b = boot(corrupt);
  ok('corrupt JSON leaves the seed standing', b.p.EQUIP.length > 0, String(b.p.EQUIP.length));

  const wrongShape = Object.assign({}, store, { ut_equip_v1: '{"a":1}' });
  const c = boot(wrongShape);
  ok('a non-array leaves the seed standing', c.p.EQUIP.length > 0, String(c.p.EQUIP.length));

  const empty = Object.assign({}, store, { ut_events_v1: '[]' });
  const d = boot(empty);
  ok('but a genuinely empty list is respected', d.p.EVENTS.length === 0, String(d.p.EVENTS.length));
}

section('4. a full disk is reported, not swallowed');
{
  const s4 = {};
  const b = boot(s4);
  b.ls.fail = true;
  const def = b.p.storeDef('tasks');
  ok('a failed write returns false', b.p.storeWriteRaw(def, '[]') === false);
  b.ls.fail = false;
  ok('and recovers once there is room', b.p.storeWriteRaw(def, '[]') === true);
}

section('5. the backup sweeps everything and leaves the session out');
{
  const b = boot(Object.assign({}, store, { ut_theme: 'dark', utturf_crew_v1: '["p07"]', ut_sched_undergrad_Fall2026: '{}' }));
  b.p.sessionSet('p07');
  const keys = b.p.bkKeys();
  ok('it finds ut_ keys', keys.indexOf('ut_theme') >= 0);
  ok('it finds the odd utturf_ prefix too', keys.indexOf('utturf_crew_v1') >= 0);
  ok('it finds dynamically-named keys', keys.indexOf('ut_sched_undergrad_Fall2026') >= 0);

  const p = b.p.bkPayload();
  ok('the payload is stamped', p.meta.app === 'UT Turf Farm' && p.meta.format === 1);
  ok('it carries the tasks', Array.isArray(p.data['ut_tasks_v1']));
  ok('a plain string stays a string', p.data['ut_theme'] === 'dark', JSON.stringify(p.data['ut_theme']));
  ok('who is signed in is NOT exported', !(b.p.SESSION_KEY in p.data), b.p.SESSION_KEY);
}

section('6. export → restore round trip');
{
  const source = boot({});
  source.p.TASKS.length = 0;
  source.p.TASKS.push({ id: 'x1', title: 'Round trip', status: 'todo', kind: 'task' });
  source.p.storeFlush();
  const payload = source.p.bkPayload();

  const targetStore = {};
  const target = boot(targetStore);
  ok('the target starts from its own seed', target.p.EQUIP.length > 1,
     String(target.p.EQUIP.length));
  target.win.eval('_bkPending=' + JSON.stringify(payload) + ';');
  try { target.p.bkRestore(); } catch (e) { /* location.reload is not implemented in jsdom */ }
  ok('storage now holds the backup\'s tasks',
     JSON.parse(targetStore['ut_tasks_v1']).length === 1,
     String(JSON.parse(targetStore['ut_tasks_v1'] || '[]').length));

  const after = boot(targetStore);
  ok('and a reload reads them back', after.p.TASKS.length === 1 && after.p.TASKS[0].title === 'Round trip',
     JSON.stringify(after.p.TASKS.map(t => t.title)));

  /* A backup that is not ours must not be swallowed. */
  const guard = boot({});
  guard.win.eval('_bkPending=null;');
  guard.p.bkRestore();
  ok('restoring nothing does nothing', guard.p.EQUIP.length > 0,
     String(guard.p.EQUIP.length));
}

section('7. a value somebody typed cannot break the spreadsheet');
{
  const b = boot({});
  ok('a comma is quoted', b.p.bkCsvCell('Mow, then spray') === '"Mow, then spray"', b.p.bkCsvCell('Mow, then spray'));
  ok('a quote is doubled', b.p.bkCsvCell('6" cut') === '"6"" cut"', b.p.bkCsvCell('6" cut'));
  ok('a newline is quoted', b.p.bkCsvCell('a\nb') === '"a\nb"');
  ok('null is blank', b.p.bkCsvCell(null) === '');
  ok('an object is stringified, not [object Object]', b.p.bkCsvCell({ a: 1 }) === '"{""a"":1}"', b.p.bkCsvCell({ a: 1 }));

  const t = b.p.bkCsvTable([{ id: 1, note: 'a,b' }, { id: 2, extra: 'z' }]);
  const lines = t.split('\r\n');
  ok('columns are the union of every row', lines[0] === 'id,note,extra', lines[0]);
  ok('a missing field is an empty cell', lines[2] === '2,,z', lines[2]);

  const secs = b.p.bkCsvSections();
  ok('the spreadsheet has tables to write', secs.length >= 4, String(secs.length));
  ok('every section is named', secs.every(s => typeof s.label === 'string' && s.label.length));
}

section('8. the backup nag');
{
  const b = boot({});
  ok('never backed up reads as a warning', /never/.test(b.p.bkLastHtml()) && /c0392b/.test(b.p.bkLastHtml()));
  b.p.bkNoteExport();
  ok('a fresh backup reads as fine', /today/.test(b.p.bkLastHtml()) && /2f7d3a/.test(b.p.bkLastHtml()), b.p.bkLastHtml());
  ok('days since is zero', b.p.bkDaysSinceExport() === 0);
}

section('9. map records store the difference, not the whole thing');
{
  const s9 = {};
  const b = boot(s9);
  const plot = Object.keys(b.p.PLOT_INFO)[3];

  ok('nothing is stored before anything is edited',
     JSON.stringify(JSON.parse(s9['ut_plot_info_v1'] || '{}')) === '{}', s9['ut_plot_info_v1']);

  b.p.PLOT_INFO[plot] = [['Turfgrass', 'Zoysia'], ['Cultivar', 'Meyer']];
  b.p.storeFlush();
  const stored = JSON.parse(s9['ut_plot_info_v1']);
  ok('the edited plot is stored', Array.isArray(stored[plot]), JSON.stringify(stored[plot]));
  ok('and ONLY the edited plot is', Object.keys(stored).length === 1, Object.keys(stored).join(','));
  /* This is the whole point: an untouched plot keeps coming from farm-geo.js,
     so a corrected area in the file is not shadowed by a stale snapshot. */
  const other = Object.keys(b.p.PLOT_INFO)[0];
  ok('an untouched plot is not shadowed', !(other in stored), other);

  const b2 = boot(s9);
  ok('the edit survives a reload',
     JSON.stringify(b2.p.PLOT_INFO[plot]) === JSON.stringify([['Turfgrass', 'Zoysia'], ['Cultivar', 'Meyer']]),
     JSON.stringify(b2.p.PLOT_INFO[plot]));
  ok('and the rest of the map still comes from the file', Object.keys(b2.p.PLOT_INFO).length > 100,
     String(Object.keys(b2.p.PLOT_INFO).length));
  ok('the override count reads back', b2.p.mapOverrideCount() === 1, String(b2.p.mapOverrideCount()));

  /* A deletion has to travel too, or it comes back on the next reload. */
  delete b2.p.PLOT_INFO[other];
  b2.p.storeFlush();
  ok('a deleted plot is recorded as null', JSON.parse(s9['ut_plot_info_v1'])[other] === null);
  const b3 = boot(s9);
  ok('and it stays deleted after a reload', !(other in b3.p.PLOT_INFO), other);
}

section('10. mowing setup persists, edited in place');
{
  const s10 = {};
  const b = boot(s10);
  const plot = Object.keys(b.p.MGMT_DATA).find(k => b.p.MGMT_DATA[k] && b.p.MGMT_DATA[k].c != null);
  const was = b.p.MGMT_DATA[plot].c;
  b.p.MGMT_DATA[plot].c = 1.25;                    /* saveMowing() mutates the object in place */
  b.p.storeFlush();
  ok('an in-place field change is caught', JSON.parse(s10['ut_mgmt_data_v1'])[plot].c === 1.25);
  const b2 = boot(s10);
  ok('and survives a reload', b2.p.MGMT_DATA[plot].c === 1.25, String(b2.p.MGMT_DATA[plot].c));
  ok('the old value really was different', was !== 1.25, String(was));

  b2.p.mapClearOverrides();
  ok('clearing drops the stored overrides', !('ut_mgmt_data_v1' in s10) && !('ut_plot_info_v1' in s10));
  const b3 = boot(s10);
  ok('and the file value comes back', b3.p.MGMT_DATA[plot].c === was, String(b3.p.MGMT_DATA[plot].c));
}

section('11. the map records reach the spreadsheet');
{
  const b = boot({});
  const rows = b.p.bkPlotInfoRows();
  ok('every plot is a row', rows.length > 100, String(rows.length));
  ok('the label/value pairs became columns', 'Turfgrass' in rows[0] && 'plot' in rows[0], Object.keys(rows[0]).join(','));

  const mg = b.p.bkMgmtRows();
  ok('mowing rows are readable, not m/c/h', mg.some(r => 'Cut height (in)' in r || 'Mower' in r),
     Object.keys(mg[0] || {}).join(','));

  const labels = b.p.bkCsvSections().map(s => s.label);
  ok('both tables are in the export', labels.indexOf('Plot information') >= 0 && labels.indexOf('Mowing & irrigation') >= 0,
     labels.join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
