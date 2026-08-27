/*
 * Harness for the weekly schedules, the semester dates, and the time clock's
 * persistence.
 *
 * WHY THIS FILE EXISTS
 * Three separate things went wrong here at once, and each one is the kind
 * that hides:
 *
 *   1. The time clock threw its own history away every 14 days. load() would
 *      only restore punches saved in the CURRENT pay period; on the first day
 *      of a new one it returned false, the caller seeded an empty clock, and
 *      saved the empty version over the top. Silent, fortnightly, total.
 *      Section 4 walks a punch across a period boundary and insists it lives.
 *
 *   2. A schedule was stored under the ROLE ('ut_sched_undergrad_Fall 2026'),
 *      so two undergrads on one phone overwrote each other, and nothing
 *      outside the profile screen ever read it. Sections 1-3 pin that a
 *      schedule belongs to a PERSON and that the day board reads it.
 *
 *   3. Made-up demo data -- invented shifts for four real, named students, a
 *      fabricated year of punches, demo no-shows and late arrivals -- sat in
 *      the file next to the real payroll screens. Section 5 fails if any of
 *      it comes back.
 *
 * Run:  node tools/test-schedule.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'UT-TurfFarm-App.html'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

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

function makeLS(store) {
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i],
    get length() { return Object.keys(store).length; }
  };
}

const EX = ['SCHEDULES','FARM_SEMS','SCHED_DAYS','SESSION','STUDENTS','PEOPLE',
            'semForDate','semCurrent','semCurrentName','semNames','semSorted','semOrd','semValid',
            'schedShiftOn','schedShiftLabel','schedHrsOn','schedCrewOn','schedHasAny',
            'schedDaysOf','schedSave','schedRecId','schedDefault','schedTotals','schedCanEdit',
            'schedPill','schedSortForDay','tcCanPunchFor','tcCanEditPunches',
            'STORE_DEFS','SHIFT','WEEKCREW','ROSTER','rstFind','nameOf',
            'tcPunchDocs','tcApplyRemote','tcDropRemote','tcSummary','tcShift','tcToggleClock',
            'SCHSYNC','TCSYNC','schsyncSummary','tcsyncSummary','assignsUndergrads'];

/* The app is one file with no exports, so booting it in jsdom and reading the
   globals back out is the only way to test what it actually does. */
function boot(store, tweak) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc,
                                url: 'https://turffarmutk.github.io/' });
  const win = dom.window;
  win.L = chain(); win.firebase = undefined;
  Object.defineProperty(win, 'localStorage', { value: makeLS(store), configurable: true });
  win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {},
                            addEventListener() {}, removeEventListener() {} });
  win.scrollTo = () => {};
  win.alert = () => {}; win.confirm = () => true;
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(HTML))) { if (!/\bsrc\s*=/i.test(m[1])) scripts.push(m[2]); }
  scripts.unshift(fs.readFileSync(path.join(ROOT, 'farm-geo.js'), 'utf8'));
  if (tweak) scripts.push(tweak);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, p: win.__p || {}, errs, store };
}

/* ---------------------------------------------------------------- */
section('0. the app still boots');
const store = {};
const b = boot(store);
ok('no jsdom errors on load', b.errs.length === 0, b.errs[0]);
const p = b.p;
ok('SCHEDULES exists and is a list', Array.isArray(p.SCHEDULES));
ok('it starts empty — no seeded schedules', Array.isArray(p.SCHEDULES) && p.SCHEDULES.length === 0,
   JSON.stringify(p.SCHEDULES));
ok('the semester list has dates', Array.isArray(p.FARM_SEMS) && p.FARM_SEMS.every(x => p.semValid(x)));
{
  const names = (p.STORE_DEFS || []).map(d => d.name);
  ok('schedules are a registered store', names.indexOf('schedules') >= 0, names.join(','));
  ok('semesters are a registered store', names.indexOf('semesters') >= 0, names.join(','));
}

section('1. a semester is a range of dates, not a label');
{
  const inFall = new Date(2026, 9, 15);      // Oct 15 2026
  const between = new Date(2026, 11, 24);    // Dec 24 2026 — after Fall ends
  ok('a date inside a term finds it', (p.semForDate(inFall) || {}).name === 'Fall 2026',
     JSON.stringify(p.semForDate(inFall)));
  ok('a date between terms finds nothing', p.semForDate(between) === null,
     JSON.stringify(p.semForDate(between)));
  ok('terms come back in date order', p.semNames().join('|') === 'Fall 2026|Spring 2027|Summer 2027',
     p.semNames().join('|'));
  ok('a term with no dates is not valid', p.semValid({ name: 'Bad' }) === false);
  ok('a term that ends before it starts is not valid',
     p.semValid({ name: 'Bad', start: '2026-10-01', end: '2026-09-01' }) === false);
}

section('2. a schedule belongs to a PERSON, not to a role');
{
  const w = b.win;
  w.eval("schedSave('p18','Fall 2026',(function(){var d=schedDefault();d.Thu={on:true,start:'08:00',end:'12:00'};return d;})());");
  w.eval("schedSave('p20','Fall 2026',(function(){var d=schedDefault();d.Thu={on:true,start:'13:00',end:'17:00'};return d;})());");
  ok('two undergrads get two records', p.SCHEDULES.length === 2, String(p.SCHEDULES.length));
  ok('and they do not share an id',
     p.schedRecId('p18', 'Fall 2026') !== p.schedRecId('p20', 'Fall 2026'));
  ok("p18's hours are p18's", p.schedDaysOf('p18', 'Fall 2026').Thu.start === '08:00');
  ok("p20's hours are untouched by them", p.schedDaysOf('p20', 'Fall 2026').Thu.start === '13:00');

  /* The bug the old key had: saving again must UPDATE, never lay down a
     second record for the same person and term. */
  w.eval("schedSave('p18','Fall 2026',(function(){var d=schedDefault();d.Thu={on:true,start:'09:00',end:'12:00'};return d;})());");
  ok('saving again updates rather than duplicating', p.SCHEDULES.length === 2, String(p.SCHEDULES.length));
  ok('and the new time took', p.schedDaysOf('p18', 'Fall 2026').Thu.start === '09:00');

  /* Nothing may be stored under a role ever again. */
  ok('no role-keyed key was written',
     Object.keys(store).every(k => !/^ut_sched_(undergrad|manager|grad|tech|faculty)/.test(k)),
     Object.keys(store).filter(k => k.indexOf('ut_sched_') === 0).join(','));
  ok('it went to the schedules store', typeof store['ut_schedules_v1'] === 'string');
  ok('and it survives a reload', (function () {
    const again = boot(JSON.parse(JSON.stringify(store)));
    return again.p.SCHEDULES.length === 2 &&
           again.p.schedDaysOf('p18', 'Fall 2026').Thu.start === '09:00';
  })());
}

section('3. the day board asks one question, and gets one answer');
{
  const thu = new Date(2026, 9, 15);   // a Thursday inside Fall 2026
  const fri = new Date(2026, 9, 16);
  const sat = new Date(2026, 9, 17);
  const brk = new Date(2026, 11, 24);  // Thursday, but between terms

  ok('scheduled Thursday shows a shift', !!p.schedShiftOn('p18', thu));
  ok('with the hours they entered', p.schedShiftLabel('p18', thu) === '9:00a–12:00p',
     p.schedShiftLabel('p18', thu));
  ok('and the length of it', p.schedHrsOn('p18', thu) === 3, String(p.schedHrsOn('p18', thu)));
  ok('a day they did not tick is nothing', p.schedShiftOn('p18', fri) === null);
  ok('a weekend is nothing', p.schedShiftOn('p18', sat) === null);
  /* The one that would have put names on the board over Christmas. */
  ok('a Thursday between terms is nothing', p.schedShiftOn('p18', brk) === null);
  ok('somebody with no schedule at all is nothing', p.schedShiftOn('p21', thu) === null);

  ok('the crew for a day is everybody down for it',
     p.schedCrewOn(thu).join(',') === 'p18,p20', p.schedCrewOn(thu).join(','));
  ok('and nobody between terms', p.schedCrewOn(brk).length === 0);

  ok('"has not set their hours" is not the same as "off"',
     p.schedHasAny('p18', thu) === true && p.schedHasAny('p21', thu) === false);

  /* Green is the whole point of the feature Bill sees. */
  ok('a scheduled person gets the green pill', p.schedPill('p18', false, thu).indexOf('ppill sched') >= 0,
     p.schedPill('p18', false, thu).slice(0, 60));
  ok('with their hours under their name', p.schedPill('p18', false, thu).indexOf('9:00a–12:00p') >= 0);
  ok('an unscheduled person does not', p.schedPill('p18', false, fri).indexOf('sched') < 0);
  ok('selection still beats green', p.schedPill('p18', true, thu).indexOf('ppill sched on') >= 0);
  ok('scheduled people sort to the front',
     p.schedSortForDay(['p21', 'p18'], thu).join(',') === 'p18,p21',
     p.schedSortForDay(['p21', 'p18'], thu).join(','));
}

section('4. THE WIPE — the time clock keeps its history across a pay period');
{
  /* TC_ANCHOR is Sun Jul 26 2026 and periods run 14 days, so a punch written
     while the stored idx says an OLDER period must still load. Before the fix
     this returned an empty clock and then saved the empty version over it. */
  const stale = {
    idx: 0,                                  // written in the FIRST pay period
    punches: { p18: [{ id: 'pu-old', pid: 'p18', date: '2026-07-28', in: '08:00',
                       out: '12:00', locOk: true, note: '', editedBy: '' }] },
    noshow: {}, excused: {}, exlate: {}
  };
  const s2 = { ut_timeclock_v6: JSON.stringify(stale) };
  const old = boot(s2);
  const docs = old.p.tcPunchDocs ? old.p.tcPunchDocs() : [];
  ok('a punch from an earlier pay period still loads', docs.length === 1, String(docs.length));
  ok('and it is the same punch', docs.length === 1 && docs[0].id === 'pu-old');
  ok('the hours are intact', docs.length === 1 && docs[0].in === '08:00' && docs[0].out === '12:00');
  ok('and the stored copy was not emptied',
     JSON.parse(s2.ut_timeclock_v6).punches.p18.length === 1,
     s2.ut_timeclock_v6.slice(0, 120));
  ok('the idx guard is gone from the source', HTML.indexOf('if(r&&r.idx===curIdx())') < 0);

  /* Every punch needs an id before it can be a row in a shared database. */
  const noIds = { ut_timeclock_v6: JSON.stringify({
    idx: 0, punches: { p18: [{ date: '2026-07-28', in: '08:00', out: '12:00' }] },
    noshow: {}, excused: {}, exlate: {} }) };
  const stamped = boot(noIds).p.tcPunchDocs();
  ok('a punch written before ids existed gets one', stamped.length === 1 && !!stamped[0].id,
     JSON.stringify(stamped[0]));
  ok('and gets its owner stamped on', stamped.length === 1 && stamped[0].pid === 'p18');
}

section('5. no fabricated data anywhere near the payroll screens');
{
  ok('the clock starts genuinely empty', b.p.tcPunchDocs().length === 0,
     JSON.stringify(b.p.tcPunchDocs()));
  ok('no demo shift table survives',
     p.SHIFT === undefined && p.WEEKCREW === undefined && p.ROSTER === undefined,
     [typeof p.SHIFT, typeof p.WEEKCREW, typeof p.ROSTER].join(','));
  /* Named, so that reintroducing one is a failure rather than a surprise. */
  [['seedYear',   'function seedYear('],
   ['seedNoShows','function seedNoShows('],
   ['seedLates',  'function seedLates('],
   ['pushLate',   'function pushLate('],
   ['LATE_TOTAL', 'var LATE_TOTAL='],
   ['NOSHOW_TOTAL','var NOSHOW_TOTAL='],
   ['TC_BREAKS',  'var TC_BREAKS='],
   ['TC_SCHED',   'TC_SCHED['],
   ['the manual crew board', 'var WEEKCREW='],
   ['the Edit crew button',  'data-editcrew']
  ].forEach(function (x) {
    ok('  ' + x[0] + ' is gone', HTML.indexOf(x[1]) < 0);
  });
}

section('6. the app and the rules agree about who may write');
{
  /* Same discipline as test-rules: ONE function in the app, transcribed into
     firestore.rules, and a test that fails when the two drift. This mirrors
     the rules rather than running them (Google's engine only runs in the
     emulator), so it proves the LOGIC matches, not that the file parses. */
  const w = b.win;
  const rec = id => w.eval("JSON.parse(JSON.stringify(rstFind(" + JSON.stringify(id) + ")||null))") || {};
  const assigns = id => !!w.eval("assignsUndergrads(" + JSON.stringify(id) + ")");

  /* The app is asked as the app asks itself: set who is signed in, then call
     the function the buttons call. Note it does NOT set currentRole -- these
     functions deliberately read the roster instead, because currentRole is a
     screen state and the database has never been able to see it. */
  function appCan(fn, actor, target) {
    w.eval("SESSION.pid=" + JSON.stringify(actor) + ";");
    return !!w.eval(fn + "(" + JSON.stringify(target) + ")");
  }
  /* firestore.rules, by hand:
       canSetSchedule(pid) = actor() && (pid==me() || assignsUndergrads(me())
                             || (roleOf(me())=='Faculty' && sameLab(me(),pid)))
       canPunchFor(pid)    = actor() && (pid==me() || assignsUndergrads(me())) */
  function rulesSchedCan(actor, target) {
    const a = rec(actor), t = rec(target);
    if (!a.id || a.active === false) return false;
    if (actor === target) return true;
    if (assigns(actor)) return true;
    return a.role === 'Faculty' && !!a.lab && a.lab !== '—' && a.lab === t.lab;
  }
  function rulesPunchCan(actor, target) {
    const a = rec(actor);
    if (!a.id || a.active === false) return false;
    return actor === target || assigns(actor);
  }
  const ids = (w.eval("JSON.parse(JSON.stringify(PEOPLE.filter(function(x){return x.active!==false;}).map(function(x){return x.id;})))") || []);
  let checked = 0; const driftS = [], driftP = [];
  ids.forEach(function (a) {
    ids.forEach(function (t) {
      checked++;
      if (appCan('schedCanEdit', a, t)  !== rulesSchedCan(a, t)) driftS.push(a + '->' + t);
      if (appCan('tcCanPunchFor', a, t) !== rulesPunchCan(a, t)) driftP.push(a + '->' + t);
    });
  });
  ok('schedCanEdit and canSetSchedule agree on every pair (' + checked + ' checks)',
     driftS.length === 0, driftS.slice(0, 6).join(' '));
  ok('tcCanPunchFor and canPunchFor agree on every pair (' + checked + ' checks)',
     driftP.length === 0, driftP.slice(0, 6).join(' '));
  /* A faculty member may fix their own lab's hours but not their own lab's
     punches -- that is Bill's. If that ever stops being true, these two
     assertions are the ones that should have to be edited on purpose. */
  {
    const fac = ids.filter(i => rec(i).role === 'Faculty')[0];
    const mate = fac && ids.filter(i => i !== fac && rec(i).lab === rec(fac).lab)[0];
    ok('faculty may fix their own lab\'s schedule', !!mate && appCan('schedCanEdit', fac, mate),
       fac + ' -> ' + mate);
    ok('but not their punches', !!mate && !appCan('tcCanPunchFor', fac, mate));
  }
  w.eval("SESSION.pid='p18';");

  ok('the rules file has a schedules block', /match \/schedules\/\{schedId\}/.test(RULES));
  ok('the rules file has a punches block', /match \/punches\/\{punchId\}/.test(RULES));
  ok('a schedule can never be deleted', /match \/schedules[\s\S]*?allow delete: if false;/.test(RULES));
  ok('a punch keeps its owner across an update',
     /allow update: if canPunchFor[\s\S]*?request\.resource\.data\.get\('pid',''\)\) == str\(punchRec\(\)\.get\('pid',''\)\)/.test(RULES));
  ok('only the undergrad-assigner may remove a punch',
     /match \/punches[\s\S]*?allow delete: if actor\(\) && assignsUndergrads\(me\(\)\);/.test(RULES));
}

section('7. both are shared, and neither can be turned off');
{
  ok('schedules have a read-out on the Shared database screen',
     /st:SCHSYNC,\s*summary:schsyncSummary\(\)/.test(HTML));
  ok('the time clock has one', /st:TCSYNC,\s*summary:tcsyncSummary\(\)/.test(HTML));
  ok('schedules are on from the moment the app opens', p.SCHSYNC && p.SCHSYNC.on === true);
  ok('so is the clock', p.TCSYNC && p.TCSYNC.on === true);
  ok('and nothing on the phone decides either',
     HTML.indexOf("ut_schedules_shared_v1") < 0 && HTML.indexOf("ut_timeclock_shared_v1") < 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
