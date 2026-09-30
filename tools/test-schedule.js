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
/* The app's code, with the app-*.js files written back into the page exactly
   where their <script> tags sit. The checks below search the source for a
   line — that something dangerous is absent, that a comment still explains
   why — and they have to search all of it, not just the part still written
   inside the page. */
const SRC = require('./_app').appText();
const { appScripts } = require('./_app');
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
            'SCHSYNC','TCSYNC','schsyncSummary','tcsyncSummary','assignsUndergrads',
            'tbPersonState','CB_MAP','TASKS'];

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
  const scripts = appScripts(win.document);
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

section('3b. the task board colors each name by where they are in their day');
{
  /* A fresh app, so the punches below cannot leak into section 5's check
     that the clock starts empty. Dillon, 2026-09-18: orange before they
     arrive, green on the clock, red clocked out or shift over. */
  const c = boot({});
  const w = c.win, q = c.p;
  w.eval("schedSave('p18','Fall 2026',(function(){var d=schedDefault();d.Thu={on:true,start:'09:00',end:'12:00'};return d;})());");
  const thu = new Date(2026, 9, 15);
  const fri = new Date(2026, 9, 16);
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  const fut = q.tbPersonState('p18', thu);
  ok('scheduled on a day still to come is orange', !!fut && fut.k === 'sched', JSON.stringify(fut));
  ok('and says the hours', !!fut && fut.txt.indexOf('9:00a–12:00p') >= 0, fut && fut.txt);
  ok('not scheduled and not in is no highlight at all', q.tbPersonState('p18', fri) === null);
  ok('nobody has punched today yet, so p21 is blank today', q.tbPersonState('p21', today) === null);

  w.eval("tcApplyRemote([{id:'pu-tb1',pid:'p21',date:'" + iso + "',in:'08:00',out:null}]);");
  const on = q.tbPersonState('p21', today);
  ok('on the clock is green, even with no schedule', !!on && on.k === 'on', JSON.stringify(on));
  ok('with the time they came in', !!on && on.txt.indexOf('8:00a') >= 0, on && on.txt);

  w.eval("tcApplyRemote([{id:'pu-tb1',pid:'p21',date:'" + iso + "',in:'08:00',out:'11:30'}]);");
  const off = q.tbPersonState('p21', today);
  ok('clocked out is red', !!off && off.k === 'off', JSON.stringify(off));
  ok('with the time they left', !!off && off.txt.indexOf('11:30a') >= 0, off && off.txt);

  w.eval("tcApplyRemote([{id:'pu-tb2',pid:'p21',date:'" + iso + "',in:'12:30',out:null}]);");
  ok('back from lunch is green again', (q.tbPersonState('p21', today) || {}).k === 'on');

  /* The color-blind copy of the stylesheet runs every color through CB_MAP.
     These have to come out unchanged or the hand-picked palette is lost. */
  ['#e69f00', '#0072b2', '#8c6d00', '#fbf3d9', '#e8f4fc', '#fdf0e6', '#d55e00'].forEach(h => {
    ok('color-blind palette keeps ' + h, q.CB_MAP && q.CB_MAP[h] === h);
  });
  ok('the color-blind board colors exist', /body\.cb \.tbp-sched\{/.test(HTML) &&
     /body\.cb \.tbp-on\{/.test(HTML) && /body\.cb \.tbp-off\{/.test(HTML));
  ok('no errors in the second boot', c.errs.length === 0, c.errs[0]);
}

section('3c. the graduate students stand on the board with the undergraduates');
{
  /* Dillon, 2026-09-23. Until this, a job on a grad student was drawn on no
     screen Bill had: the Board tab listed the undergrad pool and nobody else,
     so boardOffChart() swept it into "Not on any day above" instead. */
  const c = boot({});
  const w = c.win;
  w.sessionSet('p07');                       // Bill, the farm manager
  w.boardEnter();
  const people = w.tbBoardPeople();

  ok('the undergrads are still on it', people.indexOf('p18') >= 0, people.join(','));
  ok('and the grad students are on it now', people.indexOf('p09') >= 0, people.join(','));
  /* Dillon, 2026-09-30: "I would like technicians to even appear on the task
     board if they are currently on a job so that Bill and the Faculty can
     see." They are on the list the board CAN draw from now; whether a name
     actually appears is section 3e. */
  ok('and so are the technicians', people.indexOf('p05') >= 0, people.join(','));
  ok('nor is the person reading it', people.indexOf('p07') < 0, people.join(','));
  ok('every entry is a roster id, never a display name',
     people.every(x => /^p\d+$/.test(x)), people.join(','));

  /* The job that used to disappear. It also gives Rose a reason to be on the
     board at all -- since 2026-09-30 a name with no shift and no job is not
     drawn, so this push has to come BEFORE looking for her name. */
  /* TASKS and STUDENTS are declared with let/const, so they are not window
     properties — the boot's export list is the way in. boardDay is a var and
     so is reachable. */
  const gid = w.newId('t');
  c.p.TASKS.push({ id: gid, title: 'ZZ Collect plugs', area: 'Plots 1-2', assignee: 'p09',
                   status: 'todo', kind: 'task', type: 'Miscellaneous',
                   dueAt: w.atToday(null), repeat: 'None' });
  w.eval('boardDay=' + new Date().getDay() + ';');
  w.renderBoard();
  const body = w.document.getElementById('tb-body').innerHTML;
  ok("a grad student's name is drawn", body.indexOf('Rose Gibbons') >= 0);
  ok('with their job title beside it, so Bill knows he asks rather than tells',
     /Rose Gibbons · Grad Student/.test(body), body.slice(0, 200));
  ok('an undergrad carries no title — nothing changed for them',
     body.indexOf('Sam Dean · ') < 0 || /Sam Dean · \d/.test(body));
  ok("a grad student's job is drawn on their day", body.indexOf('ZZ Collect plugs') >= 0);
  ok('and no longer falls off the chart',
     !w.boardOffChart(w.tbBoardPeople()).some(t => t.id === gid));

  /* The line that must NOT have moved: who Bill hands work to directly. */
  const pool = c.p.STUDENTS;
  ok('the assign picker still offers undergrads only',
     pool.indexOf('p09') < 0 && pool.indexOf('p18') >= 0, pool.join(','));
  ok('and grad students still sit under "sends a request"',
     /Grad students · sends a request/.test(SRC));

  /* A PI sees their own lab, not the whole farm — and as ids, so the board
     can read their hours. */
  w.sessionSet('p14');
  const fpeople = w.tbBoardPeople();
  ok('a PI gets ids too, not names', fpeople.every(x => /^p\d+$/.test(x)), fpeople.join(','));
  ok("a PI does not get the whole farm's grads",
     fpeople.filter(x => ['p09','p10','p11','p12'].indexOf(x) >= 0).length < 4, fpeople.join(','));
  ok('no errors while drawing any of it', c.errs.length === 0, c.errs[0]);
}

section('3d. a grad student fills in their hours on their own profile');
{
  const c = boot({});
  const w = c.win, d = w.document;
  const wrap = () => d.getElementById('pf-sched-wrap');

  w.sessionSet('p18'); w.fillProfile();
  ok('an undergrad still gets the schedule panel', wrap().style.display !== 'none');
  ok('and it is still their weekly schedule', wrap().innerHTML.indexOf('My weekly schedule') >= 0);
  ok('worded for somebody Bill hands work to',
     wrap().innerHTML.indexOf('hands out work') >= 0);

  w.sessionSet('p09'); w.fillProfile();
  ok('a grad student gets it now too', wrap().style.display !== 'none');
  ok('with the same five days to fill in',
     ['Monday','Tuesday','Wednesday','Thursday','Friday']
       .every(x => wrap().innerHTML.indexOf(x) >= 0));
  ok('but not told Bill hands them their work — he asks',
     wrap().innerHTML.indexOf('hands out work') < 0);
  ok('it says what the hours are for instead',
     wrap().innerHTML.indexOf('before he asks you to take something on') >= 0);

  w.sessionSet('p07'); w.fillProfile();
  ok('the farm manager does not keep standing hours', wrap().style.display === 'none');
  w.sessionSet('p05'); w.fillProfile();
  ok('nor does a technician', wrap().style.display === 'none');

  /* It has to be a real record that leaves the phone, not a screen that
     draws. The gate reads the roster, so switching people switches whose. */
  w.sessionSet('p09');
  w.eval("schedSave('p09','Fall 2026',(function(){var x=schedDefault();x.Tue={on:true,start:'07:00',end:'11:00'};return x;})());");
  const tue = new Date(2026, 9, 13);   // a Tuesday inside Fall 2026
  ok("the grad student's shift is now a shift like anybody's",
     w.schedShiftLabel('p09', tue) === '7:00a–11:00a', w.schedShiftLabel('p09', tue));
  ok('and the board colors their name from it',
     (w.tbPersonState('p09', tue) || {}).k === 'sched',
     JSON.stringify(w.tbPersonState('p09', tue)));
  ok('their own hours are theirs to set', w.schedCanEdit('p09') === true);
  w.sessionSet('p18');
  ok("and not another student's to set", w.schedCanEdit('p09') === false);
  w.sessionSet('p07');
  ok('Bill may still fix anybody\'s', w.schedCanEdit('p09') === true);

  /* The assign picker's count is the undergrad pool, and must stay that way
     now that grads have hours — it sits beside the pills Bill assigns from. */
  ok('the day-board count did not quietly gain the grads',
     w.schedCrewOn(tue).indexOf('p09') < 0, w.schedCrewOn(tue).join(','));
  ok('no errors', c.errs.length === 0, c.errs[0]);
}

/* ------------------------------------------------------------------------- */
section('3e. only people with a reason to be there have a name on the board');
{
  /* Dillon, 2026-09-30: "I only want the names of people scheduled or have
     been assigned a task to appear. Everyone else should be silently in the
     background until a task is assigned to them."

     Before this, every undergraduate and every graduate student got a heading
     and an "All caught up ✓" row whether or not they were anywhere near the
     farm, so the screen Bill reads to see what is happening was mostly people
     who are not there.

     Nothing is hidden from the farm by this. The jobs are still on their
     owner's Mine tab, still in the notification feed, still in the database.
     tbBoardPeople() is deliberately unchanged in size, because two other
     things read it: the once-a-minute repaint, which has to notice somebody
     clocking in who was not showing a moment ago, and boardOffChart(), which
     sweeps up work on people the board knows nothing about. */
  const c = boot({});
  const w = c.win;
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0')
            + '-' + String(today.getDate()).padStart(2, '0');
  const dow = now.getDay();
  const weekend = (dow === 0 || dow === 6);
  const board = () => { w.eval('boardDay=' + (weekend ? 1 : dow) + ';'); w.renderBoard();
                        return w.document.getElementById('tb-body').innerHTML; };

  w.sessionSet('p07');                       // Bill, the farm manager
  w.boardEnter();
  const empty = board();
  ok('an empty day draws no names at all',
     empty.indexOf('Garrett Willard') < 0 && empty.indexOf('Rose Gibbons') < 0, empty.slice(0, 160));
  ok('and says so in words rather than showing a bare date',
     empty.indexOf('Nobody is down for this day') >= 0, empty.slice(0, 200));
  ok('nobody is offered an "All caught up" row they did not earn',
     empty.indexOf('All caught up') < 0);

  /* REASON ONE: a job. This is the half Dillon put first -- somebody Bill has
     given work to appears even if they never filled their hours in. */
  const tid = w.newId('t');
  c.p.TASKS.push({ id: tid, title: 'ZZ Drag the infield', area: 'Plots 3-4', assignee: 'p18',
                   status: 'todo', kind: 'task', type: 'Miscellaneous',
                   dueAt: w.atToday(null), repeat: 'None' });
  const withJob = board();
  ok('an undergrad with a job dated to the day has a name', withJob.indexOf('Garrett Willard') >= 0);
  ok('and their job under it', withJob.indexOf('ZZ Drag the infield') >= 0);
  ok('the undergrad next to them, with nothing, still has none',
     withJob.indexOf('Barrett Smith') < 0, withJob.slice(0, 300));

  /* A finished job still counts. Somebody who came in and cleared their list
     should not vanish off the board the moment they are done. */
  c.p.TASKS[c.p.TASKS.length - 1].status = 'done';
  c.p.TASKS[c.p.TASKS.length - 1].completedBy = 'p18';
  ok('and they stay on it once the job is finished', board().indexOf('Garrett Willard') >= 0);
  c.p.TASKS.pop();
  ok('but not when the job is taken away again', board().indexOf('Garrett Willard') < 0);

  /* REASON TWO: they are down for the day. */
  if (!weekend) {
    const dayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow];
    w.eval("schedSave('p19','" + w.semCurrentName() + "',(function(){var d=schedDefault();"
           + "d." + dayKey + "={on:true,start:'08:00',end:'12:00'};return d;})());");
    const sched = board();
    ok('somebody scheduled for the day has a name, job or no job',
       sched.indexOf('Barrett Smith') >= 0, sched.slice(0, 300));
    ok('and the row says they are expected',
       /Barrett Smith[\s\S]{0,240}scheduled|Barrett Smith[\s\S]{0,240}Scheduled/.test(sched));
  }

  /* REASON THREE, and the one Dillon asked for by name: a technician out on a
     job. They set their own day and keep no standing hours, so a punch is
     usually the only sign -- which is exactly why they were not on the board
     before. */
  ok('a technician with nothing on is not drawn', board().indexOf('Greg Breeden') < 0);
  w.eval("tcApplyRemote([{id:'pu-tb3',pid:'p05',date:'" + iso + "',in:'07:00',out:null}]);");
  const onClock = board();
  ok('a technician on the clock IS drawn', onClock.indexOf('Greg Breeden') >= 0, onClock.slice(0, 400));
  ok('with their job title, so Bill knows he asks rather than tells',
     /Greg Breeden · Technician/.test(onClock), onClock.slice(0, 400));
  ok('and the green line saying they are clocked in',
     /Greg Breeden[\s\S]{0,300}Clocked in/.test(onClock));

  /* The once-a-minute repaint has to be able to SEE them arrive, which is why
     it walks the whole list and not the drawn names. */
  ok('the repaint signature moves when somebody clocks in',
     w.tbStateSig().indexOf('Clocked in') >= 0 || weekend, w.tbStateSig().slice(0, 120));

  /* A technician's job no longer falls off the chart either -- it is drawn on
     their day like anybody else's. */
  const kid = w.newId('t');
  c.p.TASKS.push({ id: kid, title: 'ZZ Rebuild the reel', area: '—', assignee: 'p05',
                   status: 'todo', kind: 'task', type: 'Maintenance',
                   dueAt: w.atToday(null), repeat: 'None' });
  ok("a technician's job is drawn on their day", board().indexOf('ZZ Rebuild the reel') >= 0);
  ok('and is not swept into "Not on any day above"',
     !w.boardOffChart(w.tbBoardPeople()).some(t => t.id === kid));
  ok('no errors while drawing any of it', c.errs.length === 0, c.errs[0]);
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
  ok('the idx guard is gone from the source', SRC.indexOf('if(r&&r.idx===curIdx())') < 0);

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
    ok('  ' + x[0] + ' is gone', SRC.indexOf(x[1]) < 0);
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
     /st:SCHSYNC,\s*summary:schsyncSummary\(\)/.test(SRC));
  ok('the time clock has one', /st:TCSYNC,\s*summary:tcsyncSummary\(\)/.test(SRC));
  ok('schedules are on from the moment the app opens', p.SCHSYNC && p.SCHSYNC.on === true);
  ok('so is the clock', p.TCSYNC && p.TCSYNC.on === true);
  ok('and nothing on the phone decides either',
     SRC.indexOf("ut_schedules_shared_v1") < 0 && SRC.indexOf("ut_timeclock_shared_v1") < 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
