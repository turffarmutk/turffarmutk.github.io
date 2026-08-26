/*
 * Harness for the Phase 0 data-model work — the groundwork done inside the HTML
 * before the Supabase port, so the port is not fighting the front end at the
 * same time. Four of the six items are behavioural and are pinned here:
 *
 *   1. Time      — a due date is a timestamp, not the sentence that describes
 *                  it, and it rolls over.
 *   2. People    — a stored person is a roster id, so renaming somebody does
 *                  not orphan their work.
 *   4. Ids       — minted so two devices in the same millisecond cannot collide.
 *   5. Escaping  — a value typed by a person cannot become markup.
 *
 * (Item 3, sign-in, has its own harness in test-session.js. Item 6, the map
 * data split, is exercised by every harness via tools/_geo.js.)
 *
 * Run:  node tools/test-phase0.js
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
    value: { getItem: k => (k in (store||{}) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
             removeItem: k => { delete store[k]; }, clear: () => {} },
    configurable: true
  });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });

  const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
  const EX = ['TASKS','EVENTS','FIELDLOG','EQMAINT','TEMPLATES','STUDENTS','CREW','WEEKCREW','SHIFT','ROSTER','SCHEDULES','FARM_SEMS',
              'dueLabel','fmtDay','fmtTime','fmtDateTime','isoLocal','parseISO','atToday','atOffset','ordOfISO',
              'taskOrd','isFutureTask','newId','flNewId','esc','pidOf','nameOf','isMe','initOf','titleOf',
              'sessionSet','SESSION','rstFind','PEOPLE','renderBoard','renderTasks','eventsOnDate','calSeedDate',
              'go','taskCrew','taskCrewLabel','taskIsFor','PP_ACTIONS'];
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack||'').split('\n')[1]); fail++; }
  return { win, doc: win.document, p: win.__p || {}, errs };
}

const { win, doc, p, errs } = boot({});
p.sessionSet('p07');

/* ---------------------------------------------------------------- */
section('1. a due date is a timestamp');
{
  /* Fixtures, not seed rows. The demo tasks were removed from the app on
     2026-08-24 (only equipment, roster and the task catalog ship pre-loaded),
     so anything asserting on a seeded task has to bring its own. Same shape as
     the rows the app creates. */
  p.TASKS.push(
    {id:'t1', title:'Fairway Mow', area:'Fairway-mown plots', plots:[], machine:'e1',
     assignee:'p18', status:'todo', kind:'task', dueAt:p.atToday('06:00')},
    {id:'t12', title:'Take Trash Out', area:'Shop', plots:[],
     assignee:'p18', status:'todo', kind:'task', dueAt:p.atToday(null)}
  );

  const withTime = p.TASKS.find(t => t.id === 't1');
  ok('the seed carries dueAt, not a sentence', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(withTime.dueAt), withTime.dueAt);
  ok('and it still prints the same words', p.dueLabel(withTime) === 'Today · 6:00a', p.dueLabel(withTime));

  const allDay = p.TASKS.find(t => t.id === 't12');
  ok('an all-day job stores a date with no time', /^\d{4}-\d{2}-\d{2}$/.test(allDay.dueAt), allDay.dueAt);
  ok('and prints without one', p.dueLabel(allDay) === 'Today', p.dueLabel(allDay));

  /* The bug this replaces: "Today" was a string and stayed "Today" forever. */
  ok('tomorrow reads as Tomorrow', p.fmtDay(p.atOffset(1, null)) === 'Tomorrow', p.fmtDay(p.atOffset(1, null)));
  ok('yesterday reads as Yesterday', p.fmtDay(p.atOffset(-1, null)) === 'Yesterday', p.fmtDay(p.atOffset(-1, null)));
  ok('a fortnight out reads as a date', /,\s/.test(p.fmtDay(p.atOffset(14, null))), p.fmtDay(p.atOffset(14, null)));
  ok('a job dated tomorrow is in the future', p.isFutureTask({ dueAt: p.atOffset(1, '09:00') }));
  ok('a job dated today is not', !p.isFutureTask({ dueAt: p.atToday('09:00') }));
}

section('1b. wall-clock, not UTC');
{
  /* toISOString() would file an early-morning job on the previous day for any
     timezone west of Greenwich. This is why isoLocal exists. */
  const d = new Date(2026, 0, 15, 6, 0, 0);
  ok('6am on the 15th stores as the 15th', p.isoLocal(d) === '2026-01-15T06:00:00', p.isoLocal(d));
  ok('it round-trips', p.parseISO(p.isoLocal(d)).getTime() === d.getTime());
  ok('the ordinal matches the local day', p.ordOfISO(p.isoLocal(d)) === 20260115, String(p.ordOfISO(p.isoLocal(d))));
}

section('1c. the calendar is no longer pinned to July 2026');
{
  ok('seeded events carry real dates',
     p.EVENTS.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)),
     (p.EVENTS.find(e => !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) || {}).date);
  const today = new Date();
  ok('something is on the calendar this week', p.eventsOnDate(today).length >= 0);
  /* The guard that used to make every other month render empty. */
  const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
  ok('a date outside July 2026 is no longer rejected outright',
     Array.isArray(p.eventsOnDate(nextYear)));
  /* The demo week's shape survives the re-anchoring: seed day 20 was a Monday. */
  ok('seed day 20 lands on a Monday', p.parseISO(p.calSeedDate(20)).getDay() === 1,
     p.calSeedDate(20));
  ok('seed day 24 lands on a Friday', p.parseISO(p.calSeedDate(24)).getDay() === 5,
     p.calSeedDate(24));
}

section('2. a stored person is a roster id');
{
  const t = p.TASKS.find(x => x.id === 't1');
  ok('assignee is an id', /^p\d+$/.test(t.assignee), t.assignee);
  ok('and resolves to a name for display', p.nameOf(t.assignee) === 'Garrett Willard', p.nameOf(t.assignee));
  ok('initials come from the roster too', p.initOf(t.assignee) === 'GW', p.initOf(t.assignee));
  ok('so does the job title', p.titleOf(t.assignee) === 'Undergrad Worker', p.titleOf(t.assignee));

  ok('no task still holds a name in assignee',
     p.TASKS.every(x => !x.assignee || /^p\d+$/.test(x.assignee)),
     (p.TASKS.find(x => x.assignee && !/^p\d+$/.test(x.assignee)) || {}).assignee);
  ok('nor in completedBy',
     p.TASKS.every(x => !x.completedBy || /^p\d+$/.test(x.completedBy)));
  ok('nor in requestedBy',
     p.TASKS.every(x => !x.requestedBy || /^p\d+$/.test(x.requestedBy)));
  ok('the crew lists are ids', p.STUDENTS.every(s => /^p\d+$/.test(s)), p.STUDENTS.join(','));
  /* The three demo shift tables -- SHIFT (invented hours), WEEKCREW (a
     hand-built weekday roster) and ROSTER (a third, slightly different set of
     the same invented hours) -- were deleted on 2026-08-26. Who is in on a
     given day is read from the schedules the undergrads set on their own
     profile instead. The id rule this section exists to pin still holds:
     a schedule hangs off a roster id, so it survives a rename. */
  ok('no demo shift table is left', p.SHIFT === undefined && p.WEEKCREW === undefined && p.ROSTER === undefined,
     [typeof p.SHIFT, typeof p.WEEKCREW, typeof p.ROSTER].join(','));
  ok('schedules are keyed by roster id',
     Array.isArray(p.SCHEDULES) && p.SCHEDULES.every(r => /^p\d+$/.test(r.pid)),
     (p.SCHEDULES || []).map(r => r.pid).join(','));
}

section('2b. renaming somebody keeps their work attached');
{
  /* This is the whole point. Before, every record held the name as typed. */
  const garrett = p.rstFind('p18');
  const before = p.TASKS.filter(t => t.assignee === 'p18').length;
  ok('Garrett has jobs on the board', before > 0, String(before));

  garrett.last = 'Willard-Smith';
  const after = p.TASKS.filter(t => t.assignee === 'p18').length;
  ok('he still has all of them after a rename', after === before, before + ' -> ' + after);
  ok('and they now show the new name', p.nameOf('p18') === 'Garrett Willard-Smith', p.nameOf('p18'));
  ok('taskCrewLabel follows the rename',
     p.taskCrewLabel(p.TASKS.find(t => t.assignee === 'p18')).indexOf('Willard-Smith') >= 0);
  garrett.last = 'Willard';
}

section('2c. pidOf takes whatever it is handed');
{
  ok('an id passes through', p.pidOf('p09') === 'p09');
  ok('a full name resolves', p.pidOf('Rose Gibbons') === 'p09', p.pidOf('Rose Gibbons'));
  ok('a roster object resolves', p.pidOf(p.rstFind('p09')) === 'p09');
  ok('seeded shorthand resolves', p.pidOf('Rose G.') === 'p09', p.pidOf('Rose G.'));
  ok('somebody unknown yields null', p.pidOf('A Passing Stranger') === null);
  ok('and nameOf passes an unknown name straight through',
     p.nameOf('Devon K.') === 'Devon K.', p.nameOf('Devon K.'));
  ok('isMe matches the signed-in person', p.sessionSet('p09') && p.isMe('p09'));
  ok('and nobody else', !p.isMe('p18'));
  p.sessionSet('p07');
}

section('4. ids do not collide');
{
  /* This used to be a bare "mint 20,000 in a loop and hope", which failed about
     one run in five and read like a flaky test. It was not flaky — newId() had
     only ~60M values of entropy inside a single millisecond, so the birthday
     bound caught up with it. The checks below remove the luck: the clock is
     frozen and the random source is pinned to a constant, so the ONLY thing
     keeping ids apart is the sequence counter. Under the old scheme every one
     of these would be identical. */
  const realNow = win.Date.now;
  const realRandom = win.Math.random;
  const realCrypto = win.crypto && win.crypto.getRandomValues;
  try {
    win.Date.now = () => 1755000000000;          /* one millisecond, forever */
    win.Math.random = () => 0.5;                 /* the degenerate draw */
    if (win.crypto) win.crypto.getRandomValues = a => { a[0] = 7; return a; };

    const seen = new Set();
    for (let i = 0; i < 50000; i++) seen.add(p.newId('t'));
    ok('50,000 ids minted inside one millisecond are all distinct, with no entropy at all',
       seen.size === 50000, String(seen.size));

    /* Math.random().toString(36) is not fixed width. 0.5 renders as "0.i", so
       the old slice(2,7) took ONE character; 0.9999 renders long and it took
       five. Sweeping the draw is what exposes that — pinning a single value
       makes every id equally short and the ragged edge stays hidden. */
    const widths = new Set();
    [0.5, 0.9999999, 0.0000001, 0.75, 0.3125].forEach(function (r) {
      win.Math.random = () => r;
      widths.add(p.newId('t').length);
    });
    ok('and the width does not move with the random draw, so the block cannot come up short',
       widths.size === 1, [...widths].join(','));
  } finally {
    win.Date.now = realNow;
    win.Math.random = realRandom;
    if (win.crypto && realCrypto) win.crypto.getRandomValues = realCrypto;
  }

  /* Real clock, real randomness — the ordinary path still holds. */
  const live = new Set();
  for (let i = 0; i < 20000; i++) live.add(p.newId('t'));
  ok('20,000 ids minted in a tight loop are all distinct', live.size === 20000, String(live.size));

  ok('the prefix survives', p.newId('ev').indexOf('ev') === 0, p.newId('ev'));
  ok('the field log generator uses the same scheme', p.flNewId().indexOf('fl') === 0, p.flNewId());
  /* The old scheme was a bare timestamp, so this is the case that broke. */
  const a = p.newId('t'), b = p.newId('t');
  ok('two ids minted back to back differ', a !== b, a + ' / ' + b);
  /* The timestamp still leads, so ids sort roughly by when they were made and
     stay readable in a log. Read as "everything between the prefix and the
     trailing counter+random blocks" rather than a fixed offset, which would
     quietly start failing the year the millisecond clock needs another
     base36 digit. Compared as a time, not as a string: an exact match would
     race the millisecond it was minted in. */
  const stamped = p.newId('t');
  const when = parseInt(stamped.slice(1, stamped.length - 9), 36);
  ok('the timestamp still leads, so ids sort by when they were made',
     Math.abs(when - Date.now()) < 5000, stamped + ' -> ' + when);
}

section('5. a typed value cannot become markup');
{
  const nasty = '<img src=x onerror=alert(1)>';
  ok('esc neutralises a tag', p.esc(nasty).indexOf('<') < 0, p.esc(nasty));
  ok('and quotes, so it is safe in an attribute', p.esc('a"b').indexOf('"') < 0, p.esc('a"b'));

  /* End to end: a task title full of markup renders as text, not as elements. */
  const t = p.TASKS.find(x => x.id === 't1');
  const title = t.title;
  t.title = nasty;
  p.sessionSet('p07');
  p.go('taskboard');
  const board = doc.getElementById('tb-body');
  ok('the board renders it', board && board.innerHTML.length > 0);
  ok('and injects no element', !board.querySelector('img[onerror]'));
  ok('the text is still there, escaped', board.innerHTML.indexOf('&lt;img') >= 0);
  t.title = title;
}

section('5b. map popups use delegated handlers');
{
  ok('the popup action registry is populated', Object.keys(p.PP_ACTIONS).length > 0,
     Object.keys(p.PP_ACTIONS).join(','));
  ['editPlot','deletePlot','askSplit','doSplit','editDumpNote','saveMowing'].forEach(k => {
    ok('  ' + k + ' is registered', typeof p.PP_ACTIONS[k] === 'function');
  });
  ok('no string-built onclick is left in the source',
     !/onclick="[A-Za-z_$][\w$]*\(\\''\+/.test(HTML));
}

section('Load errors');
ok('no uncaught errors while booting the app', errs.length === 0, errs.join(' | '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
