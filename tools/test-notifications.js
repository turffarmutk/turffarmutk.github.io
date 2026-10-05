/*
 * Harness for the notification feed.
 *
 * WHAT IS UNDER TEST. Until 2026-09-24 the bell counted six hand-typed
 * examples that were the same on every phone and never changed. It now counts
 * three real things, worked out on the phone from the task list it already
 * has:
 *
 *   1. work landed on me      -- a job assigned, or a request raised, at me
 *   2. a job I handed out is finished
 *   3. a job I handed out came back part-finished, with plots still to give
 *
 * THE TWO THINGS MOST LIKELY TO GO WRONG, both checked below:
 *
 *   - A FLOOD ON FIRST SIGN-IN. The feed works by noticing CHANGE, so a phone
 *     that has never looked before has to take a silent baseline. Get that
 *     wrong and everybody's first sign-in opens onto every job on the farm.
 *
 *   - IT NEVER GOES QUIET. Scanning the same unchanged task list twice must
 *     produce nothing the second time. This is the same shape of mistake as
 *     the drawer loop that spent 4.4 million reads on 2026-08-31 (see
 *     CLAUDE.md), and although nothing here touches the database, a feed that
 *     re-announces the same job every two seconds is the same bug wearing
 *     different clothes.
 *
 * The feed is deliberately NOT stored in the shared database -- there is no
 * drawer, no permission rule and no row in test-sync-settles.js to add,
 * because nothing here is ever sent anywhere. Section 9 pins that down at the
 * source level so a future edit cannot quietly start sending.
 *
 * Run:  node tools/test-notifications.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const HTML = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- boot: the same stub-Leaflet page the other harnesses use ---- */
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

  const scripts = require('./_app').appScripts(win.document);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__n={'
      + 'ntf:function(){return NTF;},NOTIF:function(){return NOTIF;},'
      + 'ntfScan:ntfScan,ntfUnread:ntfUnread,ntfMarkRead:ntfMarkRead,ntfLoad:ntfLoad,'
      + 'renderNotifFeed:renderNotifFeed,newCount:newCount,updateBellBadges:updateBellBadges,'
      + 'tasks:function(){return TASKS;},setTasks:function(a){TASKS.length=0;a.forEach(function(t){TASKS.push(t);});},'
      + 'signIn:function(pid){return sessionSet(pid,{quiet:true});},'
      + 'RST_LOGIN:RST_LOGIN,NOTIF_ALERTS:NOTIF_ALERTS,go:go,'
      + 'acceptCrewReq:acceptCrewReq,assignsUndergrads:assignsUndergrads,'
      + 'ntfReqFor:function(t,me){return ntfReqFor(t,me);},'
      /* The three lists the farm's own alerts are worked out from, plus the
         one call every hook uses. Reached through functions because EQUIP and
         the rest are `let` inside the app and never land on window. */
      + 'ntfTick:ntfTick,equip:function(){return EQUIP;},probs:function(){return EQPROBLEMS;},'
      + 'inv:function(){return INVENTORY;},trials:function(){return TRIALS;},'
      + 'isLow:isLow,invQty:invQty,today:trTodayISO,csLocked:csLocked,'
      + 'log:function(){return FIELDLOG;},moves:function(){return INVMOVES;},'
      + 'commitLog:flCommit,'
      /* What the walks decided, with the audience on each one -- the half the
         sender uses and the bell does not. */
      + 'events:function(){return NTF_EVENTS;},eventId:ntfEventId,'
      + 'eventText:function(e){return ntfEventText(e,Date.now());},'
      + 'switchOf:ntfSwitchOf,pushState:pushState,pushPrefs:pushPrefs,'
      /* The calendar's three, with the clock passed in so a test can hold it
         still -- see the note over planDays(). */
      + 'planWanted:function(at){return planWanted(at);},'
      + 'periodEndOn:function(d){return tcPeriodEndOn(d);},'
      + 'rainMorning:function(me,at){return rainMorning(me,at);},'
      + 'queue:function(e,n){return pushQueue(e,n);},flush:pushFlush,'
      + 'triesMax:function(){return PUSH_TRIES_MAX;},outbox:function(){'
      + 'try{return JSON.parse(localStorage.getItem(\'ut_push_out\')||\'[]\');}catch(x){return [];}}'
      + '};');
  } catch (e) { console.log('app script threw: ' + e.message); fail++; }
  return { win, doc: win.document, n: win.__n || {}, errs };
}

/* SHUT A PRETEND BROWSER WHEN YOU ARE FINISHED WITH IT. Each boot() builds a
   whole copy of the app -- the page, every screen, all five files -- and holds
   it until something lets go. This file boots sixty-odd of them now, and
   leaving them all open ran Node clean out of memory partway through, which
   reads as the tests mysteriously dying rather than as anything failing.

   Closing is the fix and it costs nothing, because by the time it is called
   every answer has already been read out of it. */
function shut(b) { try { b && b.win && b.win.close(); } catch (e) {} }

/* A task in the shape the app really makes one: see the assign wizard in
   app-05-tasks-clock.js and openRestSheet() in app-04-spray-inventory.js. */
function task(o) {
  return Object.assign({ id: 't1', title: 'Mow the back nine', area: 'SF4',
                         plots: [], status: 'todo', kind: 'task',
                         assignee: null, assignedBy: null, createdBy: null }, o);
}

/* ---------------------------------------------------------------- */
section('1. the hand-typed examples are gone');
{
  ok('no "Toro 3 marked down" left in the page', !/Toro 3 marked down/.test(HTML));
  ok('no "Daconil low stock" left in the page', !/Daconil low stock/.test(HTML));
  ok('the screen has a container the code fills', /id="ntf-body"/.test(HTML));
}

section('2. a phone that has never looked takes a silent baseline');
{
  const store = {};
  const { n } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  ok('signing in works', n.signIn(STU) === true);
  n.setTasks([task({ id: 'a1', assignee: STU, assignedBy: BILL }),
              task({ id: 'a2', assignee: STU, assignedBy: BILL, title: 'Aerate 12' })]);
  n.ntfScan();
  ok('two jobs already on my plate raise nothing', n.ntf().list.length === 0,
     JSON.stringify(n.ntf().list.map(e => e.k)));
  ok('but the phone has written down where it started', n.ntf().base > 0);
  ok('and it knows about both jobs', Object.keys(n.ntf().seen).length === 2);
  ok('the bell is clear', n.ntfUnread() === 0);

  /* AN EMPTY LIST IS NOT A BASELINE, and that is deliberate. Signing in
     happens before the first snapshot comes back, so the task list is very
     often empty at that moment. Counting that as "I have now seen the farm"
     would make every one of the two hundred jobs that arrive a second later
     look brand new, which is the flood this whole section exists to stop. */
  const s2 = {};
  const b2 = boot(s2);
  b2.n.signIn(b2.n.RST_LOGIN.undergrad);
  b2.n.setTasks([]);
  b2.n.ntfScan();
  ok('a scan with no tasks does not count as having looked', b2.n.ntf().base === 0,
     String(b2.n.ntf().base));
  b2.n.setTasks([task({ id: 'a1', assignee: b2.n.RST_LOGIN.undergrad, assignedBy: BILL }),
                 task({ id: 'a2', assignee: b2.n.RST_LOGIN.undergrad, assignedBy: BILL })]);
  ok('so the list arriving a moment later is the baseline, not news',
     b2.n.ntfScan() === 0, JSON.stringify(b2.n.ntf().list.map(e => e.k)));
  ok('and now it has looked', b2.n.ntf().base > 0);
}

section('3. a job given to me AFTER that does show up');
{
  const store = {};
  const { n, doc } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(STU);
  n.setTasks([task({ id: 'a1', assignee: null })]);
  n.ntfScan();                                    /* baseline */
  n.tasks()[0].assignee = STU;
  n.tasks()[0].assignedBy = BILL;
  ok('one new event', n.ntfScan() === 1);
  const e = n.ntf().list[0];
  ok('it is the right kind', e && e.k === 'assigned', e && e.k);
  ok('it names the job', e && e.ttl === 'Mow the back nine', e && e.ttl);
  ok('it remembers who handed it out', e && e.who === BILL, e && e.who);
  ok('the bell shows one', n.ntfUnread() === 1);
  ok('and the badge agrees', n.newCount() === 1, String(n.newCount()));

  /* A second job, so the screen has more than one row to draw. */
  n.tasks().push(task({ id: 'a2', assignee: STU, assignedBy: BILL, title: 'Blow the paths' }));
  ok('a second job raises a second event', n.ntfScan() === 1);

  /* Opening the screen draws it and clears the count. */
  n.go('notifications');
  const rows = doc.querySelectorAll('#ntf-body [data-ntf]');
  ok('the screen draws a row per event', rows.length === 2, String(rows.length));
  ok('the text is the real job title', /Blow the paths/.test(doc.getElementById('ntf-body').innerHTML));
  ok('opening it clears the bell', n.ntfUnread() === 0, String(n.ntfUnread()));
}

section('4. nobody is told about a job they gave themselves');
{
  const store = {};
  const { n } = boot(store);
  const BILL = n.RST_LOGIN.manager;
  n.signIn(BILL);
  n.setTasks([task({ id: 'a1', assignee: null })]);
  n.ntfScan();
  n.tasks()[0].assignee = BILL;
  n.tasks()[0].assignedBy = BILL;
  ok('putting work on my own plate is not news', n.ntfScan() === 0,
     JSON.stringify(n.ntf().list.map(e => e.k)));
}

section('5. finishing a job tells whoever handed it out');
{
  const store = {};
  const { n } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);
  n.setTasks([task({ id: 'a1', assignee: STU, assignedBy: BILL })]);
  n.ntfScan();
  Object.assign(n.tasks()[0], { status: 'done', completedBy: STU });
  ok('one event', n.ntfScan() === 1);
  ok('and it is the finished one', n.ntf().list[0].k === 'done', n.ntf().list[0].k);
  ok('it names who did it', n.ntf().list[0].who === STU);

  /* The person who finished it was standing there. They are not told. */
  const s2 = {};
  const b2 = boot(s2);
  b2.n.signIn(STU);
  b2.n.setTasks([task({ id: 'a1', assignee: STU, assignedBy: BILL })]);
  b2.n.ntfScan();
  Object.assign(b2.n.tasks()[0], { status: 'done', completedBy: STU });
  ok('the person who finished it hears nothing', b2.n.ntfScan() === 0,
     JSON.stringify(b2.n.ntf().list.map(e => e.k)));

  /* Somebody with nothing to do with the job hears nothing either, even
     though their phone holds the same task. */
  const s3 = {};
  const b3 = boot(s3);
  b3.n.signIn(b3.n.RST_LOGIN.tech);
  b3.n.setTasks([task({ id: 'a1', assignee: STU, assignedBy: BILL })]);
  b3.n.ntfScan();
  Object.assign(b3.n.tasks()[0], { status: 'done', completedBy: STU });
  ok('a bystander hears nothing', b3.n.ntfScan() === 0);
}

section('6. a part-finished job raises ONE alert, and it is the useful one');
{
  const store = {};
  const { n, doc } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);
  n.setTasks([task({ id: 'a1', assignee: STU, assignedBy: BILL, plots: ['SF4', 'SF5', 'SF6'] })]);
  n.ntfScan();
  /* What twHandIn()/the partial finish in app-04 actually writes. */
  Object.assign(n.tasks()[0], { status: 'done', completedBy: STU, partial: true,
                                leftPlots: ['SF5', 'SF6'], donePlots: ['SF4'] });
  ok('exactly one event, not two', n.ntfScan() === 1,
     JSON.stringify(n.ntf().list.map(e => e.k)));
  const e = n.ntf().list[0];
  ok('and it is the part-finished one', e.k === 'partial', e.k);
  ok('it says how many plots are left', e.n === 2, String(e.n));
  n.go('notifications');
  ok('the row says what is being asked of him',
     /left to hand out/.test(doc.getElementById('ntf-body').innerHTML));

  /* Once the rest is handed on, the same job must not raise it again. */
  n.tasks()[0].restAssigned = 'a2';
  ok('handing the rest on raises nothing new', n.ntfScan() === 0);
}

section('6b. a labor request from Bill to a technician, the whole way through');
{
  const store = {};
  const { n, doc } = boot(store);
  const BILL = n.RST_LOGIN.manager, TECH = n.RST_LOGIN.tech;

  /* --- the technician's phone: being asked, then accepting --- */
  n.signIn(TECH);
  n.setTasks([task({ id: 'z0', title: 'Something else entirely', assignee: null })]);
  n.ntfScan();                                   /* baseline on an empty list */
  /* Exactly what openCrewReq()/the Assign wizard write (app-05). */
  n.tasks().push(task({ id: 'r1', kind: 'request', origin: 'manager', target: TECH,
                        requestedBy: BILL, assignee: null, createdBy: BILL,
                        title: 'Spray the back fence line' }));
  ok('being asked raises one event', n.ntfScan() === 1);
  let e = n.ntf().list[0];
  ok('and it is the request one', e && e.k === 'reqnew', e && e.k);
  ok('it says who is asking', e && e.who === BILL, e && e.who);
  ok('it remembers which way it was going', e && e.o === 'manager', e && e.o);
  n.go('notifications');
  ok('the row says what is being asked',
     /is asking you to take this on/.test(doc.getElementById('ntf-body').innerHTML));

  /* Accepting is the app's own acceptCrewReq(), not a hand-set field. */
  n.acceptCrewReq('r1');
  const acc = n.tasks().find(t => t.id === 'r1');
  ok('accepting turned it into a task', acc.kind === 'task' && acc.assignee === TECH,
     acc.kind + '/' + acc.assignee);
  ok('and the technician is NOT told work was assigned to them', n.ntfScan() === 0,
     JSON.stringify(n.ntf().list.map(x => x.k)));

  /* --- Bill's phone: the same records arriving --- */
  const s2 = {};
  const b2 = boot(s2);
  b2.n.signIn(BILL);
  b2.n.setTasks([task({ id: 'r1', kind: 'request', origin: 'manager', target: TECH,
                        requestedBy: BILL, assignee: null, createdBy: BILL,
                        title: 'Spray the back fence line' })]);
  b2.n.ntfScan();                                /* baseline: he raised it, he knows */
  ok('Bill is not told about his own request', b2.n.ntf().list.length === 0);
  Object.assign(b2.n.tasks()[0], { kind: 'task', assignee: TECH });
  ok('but he IS told when it is accepted', b2.n.ntfScan() === 1);
  e = b2.n.ntf().list[0];
  ok('and it is the accepted one', e.k === 'reqok', e.k);
  ok('naming who took it on', e.who === TECH, e.who);
  b2.n.go('notifications');
  ok('the row reads as a sentence',
     /was accepted/.test(b2.doc.getElementById('ntf-body').innerHTML) &&
     /has taken it on/.test(b2.doc.getElementById('ntf-body').innerHTML));

  /* And finished. This is the job Bill ASKED for, so it is reqdone, not the
     "a job I handed out is finished" alert -- two switches, two alerts. */
  Object.assign(b2.n.tasks()[0], { status: 'done', completedBy: TECH });
  ok('finishing raises one more', b2.n.ntfScan() === 1);
  ok('and it is the asked-for one, not the handed-out one',
     b2.n.ntf().list[0].k === 'reqdone', b2.n.ntf().list[0].k);
  b2.n.go('notifications');
  ok('which says whose job it was',
     /finished the job you asked for/.test(b2.doc.getElementById('ntf-body').innerHTML));
}

section('6c. a labor request the other way: a technician asking for help');
{
  const store = {};
  const { n, doc } = boot(store);
  const BILL = n.RST_LOGIN.manager, TECH = n.RST_LOGIN.tech, STU = n.RST_LOGIN.undergrad;

  /* It reaches whoever hands work to undergraduates, read off the roster --
     never a hardcoded Bill, so it still lands the week he is away. */
  ok('Bill is the one who hands work to undergraduates', n.assignsUndergrads(BILL) === true);
  ok('a technician is not', n.assignsUndergrads(TECH) === false);

  n.signIn(BILL);
  n.setTasks([task({ id: 'z0', title: 'Something else entirely', assignee: null })]);
  n.ntfScan();
  /* What openReqForm() writes (app-05): no target, a head count, origin crew. */
  n.tasks().push(task({ id: 'r2', kind: 'request', origin: 'crew', assignee: null,
                        requestedBy: TECH, createdBy: TECH, students: 2,
                        title: 'Help pulling covers' }));
  ok('it reaches Bill', n.ntfScan() === 1);
  let e = n.ntf().list[0];
  ok('as a request', e.k === 'reqnew', e.k);
  ok('from the technician', e.who === TECH, e.who);
  ok('with the head count on it', e.n === 2, String(e.n));
  n.go('notifications');
  ok('and the row asks the right question, not the other kind',
     /is asking for help/.test(doc.getElementById('ntf-body').innerHTML) &&
     /2 students/.test(doc.getElementById('ntf-body').innerHTML));

  /* Bill puts an undergrad on it -- the data-assign handler in app-04. */
  Object.assign(n.tasks().find(t => t.id === 'r2'), { kind: 'task', assignee: STU });
  ok('Bill is not told his own answer back', n.ntfScan() === 0,
     JSON.stringify(n.ntf().list.map(x => x.k)));

  /* The technician who asked hears that it was accepted. */
  const s2 = {};
  const b2 = boot(s2);
  b2.n.signIn(TECH);
  b2.n.setTasks([task({ id: 'r2', kind: 'request', origin: 'crew', assignee: null,
                        requestedBy: TECH, createdBy: TECH, students: 2,
                        title: 'Help pulling covers' })]);
  b2.n.ntfScan();
  ok('the technician is not told about their own ask', b2.n.ntf().list.length === 0);
  Object.assign(b2.n.tasks()[0], { kind: 'task', assignee: STU });
  ok('but is told it was picked up', b2.n.ntfScan() === 1);
  ok('as the accepted alert', b2.n.ntf().list[0].k === 'reqok', b2.n.ntf().list[0].k);
  ok('naming the undergrad Bill put on it', b2.n.ntf().list[0].who === STU);

  /* And the undergrad DOES get told work landed on them -- they were never
     asked about it, so this is news to them. */
  const s3 = {};
  const b3 = boot(s3);
  b3.n.signIn(STU);
  b3.n.setTasks([task({ id: 'r2', kind: 'request', origin: 'crew', assignee: null,
                        requestedBy: TECH, createdBy: TECH, students: 2,
                        title: 'Help pulling covers' })]);
  b3.n.ntfScan();
  ok('an open crew request is not on the undergrad plate yet', b3.n.ntf().list.length === 0);
  Object.assign(b3.n.tasks()[0], { kind: 'task', assignee: STU });
  ok('being put on it is news to them', b3.n.ntfScan() === 1);
  ok('and it is the plain assigned alert', b3.n.ntf().list[0].k === 'assigned',
     b3.n.ntf().list[0].k);
}

section('6d. one row per job per look, and the six switches are separate');
{
  const store = {};
  const { n } = boot(store);
  const BILL = n.RST_LOGIN.manager, TECH = n.RST_LOGIN.tech;

  /* A phone out of signal all morning: requested, accepted and finished all
     land in one look. Only the last one is still worth saying. */
  n.signIn(BILL);
  n.setTasks([task({ id: 'z0', title: 'Something else entirely', assignee: null })]);
  n.ntfScan();
  n.tasks().push(task({ id: 'r3', kind: 'task', origin: 'manager', target: TECH,
                        requestedBy: BILL, assignee: TECH, createdBy: BILL,
                        status: 'done', completedBy: TECH, title: 'Fix the fence' }));
  ok('three stages in one look raise exactly one row', n.ntfScan() === 1);
  ok('and it is the latest stage', n.ntf().list[0].k === 'reqdone', n.ntf().list[0].k);

  /* Each switch works on its own. Fourteen since 2026-10-01: the equipment,
     inventory and trials switches were wired up, and weather deliberately was
     not -- so `wx` is the one row still carrying "Not sending yet", and if it
     ever creeps into this list without push being built, that label is a lie
     again. */
  const kinds = ('tasks,done,partial,reqnew,reqok,reqdone,boardempty,equip,eqflag,low,'
               + 'restock,fllog,rain24,trials,resnew,trnew,trstart,trdone,clockin,'
               + 'clockout,shiftauto,shiftask,noclock,payend').split(',');
  const live = n.NOTIF_ALERTS.filter(a => a.live).map(a => a.k);
  ok('all twenty-four are marked as really sending',
     live.join(',') === kinds.join(','), live.join(','));
  ok('and weather is still honest about not sending',
     n.NOTIF_ALERTS.filter(a => a.k === 'wx')[0].live === undefined);
  kinds.forEach(k => {
    ok('"' + k + '" has its own switch, on by default',
       n.NOTIF()['a_' + k] === true, String(n.NOTIF()['a_' + k]));
  });

  /* Turning the request switches off one at a time stops exactly that one. */
  const s2 = {};
  const b2 = boot(s2);
  b2.n.signIn(TECH);
  b2.n.NOTIF().a_reqnew = false;
  b2.n.setTasks([task({ id: 'z0', title: 'Something else entirely', assignee: null })]);
  b2.n.ntfScan();
  b2.n.tasks().push(task({ id: 'r4', kind: 'request', origin: 'manager', target: TECH,
                           requestedBy: BILL, assignee: null, title: 'Blow the shop out' }));
  ok('with "a labor request lands on me" off, nothing is raised', b2.n.ntfScan() === 0);

  const s3 = {};
  const b3 = boot(s3);
  b3.n.signIn(BILL);
  b3.n.NOTIF().a_reqok = false;
  b3.n.setTasks([task({ id: 'r5', kind: 'request', origin: 'manager', target: TECH,
                        requestedBy: BILL, assignee: null, title: 'Blow the shop out' })]);
  b3.n.ntfScan();
  Object.assign(b3.n.tasks()[0], { kind: 'task', assignee: TECH });
  ok('with "accepted" off, acceptance is silent', b3.n.ntfScan() === 0);
  /* but finishing still comes through, because that is a different switch */
  Object.assign(b3.n.tasks()[0], { status: 'done', completedBy: TECH });
  ok('while "a job I asked for is finished" still works', b3.n.ntfScan() === 1);
  ok('and is the right kind', b3.n.ntf().list[0].k === 'reqdone', b3.n.ntf().list[0].k);
}

section('6e. the dot colours survive colour-blind mode');
{
  /* A colour that is not a CB_MAP key still draws, but loses its SHAPE in
     colour-blind mode -- and shape is the half of the signal that does not
     depend on seeing colour. */
  const { win } = boot({});
  const kinds = win.NTF_KIND, map = win.CB_MAP, shape = win.CB_SHAPE;
  const seen = {};
  Object.keys(kinds).forEach(k => {
    const hex = kinds[k].c.toLowerCase();
    ok('"' + k + '" uses a colour the colour-blind palette knows', !!map[hex], hex);
    ok('"' + k + '" gets a dot shape', !!shape[hex], hex);
    const pair = map[hex] + '/' + shape[hex];
    (seen[pair] = seen[pair] || []).push(k);
  });
  /* SHARING IS ALLOWED, BUT ONLY WHERE IT MEANS SOMETHING -- and the list of
     where is written out here rather than left to a rule, because a colour
     two unrelated alerts share by ACCIDENT is the bug this check exists for.

     The reason it is a list at all: the colour-blind palette is six colours
     and five dot shapes, so sixteen alerts cannot each have their own pair.
     What they can do is share by MEANING, so somebody reading the dots rather
     than the words still gets the right instruction from them:

       green circle   something is finished, or the ground is yours again
       amber diamond  somebody has to pick this up
       dark diamond   check this one
       pink triangle  stop and deal with this before you carry on
       red square     urgent, and only you can answer it

     Add an alert and it either joins one of these groups or brings its own
     pair. What it may not do is quietly land on top of an unrelated one. */
  const DELIBERATE = [
    'done+reqdone+equp+resopen+restock+trdone',   /* green circle  - finished, or yours again */
    'partial+eqflag+boardempty',                  /* amber diamond - somebody must pick this up */
    'reqnew+resclose+resnew',                     /* pink triangle - stop before you carry on */
    'shiftauto+low+payend',                       /* dark diamond  - check this one */
    'shiftask+eqdown+noclock',                    /* red square    - urgent, only you can answer */
    'reqok+trnew',                                /* blue ring     - informational */
    'clockin+trstart',                            /* dark circle   - something is now running */
    'clockout+fllog',                             /* grey ring     - informational, it is written down */
    'assigned+rain24'                             /* light ring    - informational, nothing to do */
  ];
  const shared = Object.keys(seen).filter(p => seen[p].length > 1).map(p => seen[p].join('+'));
  const stray = shared.filter(g => DELIBERATE.indexOf(g) < 0);
  ok('every shared colour and shape is one of the deliberate groups',
     stray.length === 0, stray.join(' | ') || 'none');
  ok('and all of those groups are still there',
     DELIBERATE.every(g => shared.indexOf(g) >= 0), shared.join(' | '));
}

section('6f. the switches are grouped by the page they come from');
{
  const { win, doc, n } = boot({});
  n.signIn(n.RST_LOGIN.manager);
  win.go('notifsettings');
  const body = doc.getElementById('nts-body');

  /* EVERY switch still gets drawn. The grouping builds its own headings from
     the rows, so the way this could break is a row quietly falling out of the
     screen while its setting carries on existing -- which looks like nothing
     at all until somebody goes hunting for a switch that is not there. */
  n.NOTIF_ALERTS.forEach(a => {
    ok('"' + a.k + '" still has a switch on the screen',
       !!body.querySelector('.nts-tgl[data-k="a_' + a.k + '"]'));
  });

  const heads = [...body.querySelectorAll('div')]
    .filter(d => /text-transform:uppercase/.test(d.getAttribute('style') || ''))
    .map(d => d.textContent);
  ok('there is a Task board heading', heads.indexOf('Task board') >= 0, heads.join(' | '));
  ok('and one per other page as well',
     ['Equipment', 'Inventory', 'Weather', 'Trials', 'Time clock']
       .every(h => heads.indexOf(h) >= 0), heads.join(' | '));

  /* The Task Board's own alerts stay together under that heading rather than
     being scattered. Seven since 2026-10-05, when the reminder that fires
     before a shift with an empty board joined them. */
  const board = n.NOTIF_ALERTS.filter(a => a.g === 'Task board').map(a => a.k).join(',');
  ok('the Task board alerts are all under that heading',
     board === 'tasks,done,partial,reqnew,reqok,reqdone,boardempty', board);
  ok('nothing is left without a heading', n.NOTIF_ALERTS.every(a => !!a.g),
     n.NOTIF_ALERTS.filter(a => !a.g).map(a => a.k).join(','));

  /* Task board comes first: it is the part of the app the crew actually use,
     and the only group whose switches do anything yet. */
  ok('Task board is the first group', heads.filter(h => h !== 'Push notification hours')[0] === 'Task board',
     heads.join(' | '));

  /* Tapping still works after the regrouping -- the handler finds toggles by
     data-k, which the headings do not change, but this is cheap to prove. */
  const t = body.querySelector('.nts-tgl[data-k="a_reqdone"]');
  t.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('a grouped toggle still flips', n.NOTIF().a_reqdone === false, String(n.NOTIF().a_reqdone));
}

section('7. the toggles on the Notifications screen actually gate it');
{
  const store = {};
  const { n } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(STU);
  n.NOTIF().a_tasks = false;
  n.setTasks([task({ id: 'a1', assignee: null })]);
  n.ntfScan();
  n.tasks()[0].assignee = STU;
  n.tasks()[0].assignedBy = BILL;
  ok('turned off means nothing is raised', n.ntfScan() === 0);

  n.NOTIF().a_tasks = true;
  n.setTasks([task({ id: 'a2', assignee: null })]);
  n.ntfScan();
  n.tasks().find(t => t.id === 'a2').assignee = STU;
  n.tasks().find(t => t.id === 'a2').assignedBy = BILL;
  ok('turned back on and it works again', n.ntfScan() === 1);

  const live = n.NOTIF_ALERTS.filter(a => a.live).map(a => a.k).join(',');
  ok('twenty-four alerts are marked as really sending',
     live === 'tasks,done,partial,reqnew,reqok,reqdone,boardempty,equip,eqflag,low,restock,'
            + 'fllog,rain24,trials,resnew,trnew,trstart,trdone,clockin,clockout,shiftauto,'
            + 'shiftask,noclock,payend', live);
}

section('8. the feed is the person’s, not the phone’s');
{
  const store = {};
  const BILL = boot(store).n.RST_LOGIN.manager;
  let STU;
  {
    const { n } = boot(store);
    STU = n.RST_LOGIN.undergrad;
    n.signIn(STU);
    n.setTasks([task({ id: 'a1', assignee: null })]);
    n.ntfScan();
    n.tasks()[0].assignee = STU; n.tasks()[0].assignedBy = BILL;
    n.ntfScan();
    ok('the student has one', n.ntf().list.length === 1);
  }
  {
    /* Same browser, same phone, somebody else signs in. */
    const { n } = boot(store);
    n.setTasks([task({ id: 'a1', assignee: STU, assignedBy: BILL })]);
    n.signIn(BILL);
    n.ntfScan();
    ok('the manager does not inherit it', n.ntf().list.length === 0,
       JSON.stringify(n.ntf().list.map(e => e.k)));
    n.signIn(STU);
    ok('and the student still has theirs after a reload', n.ntf().list.length === 1,
       JSON.stringify(n.ntf().list.map(e => e.k)));
  }
}

section('9. it goes quiet, and it never grows forever');
{
  const store = {};
  const { n } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(STU);
  n.setTasks([task({ id: 'a1', assignee: null })]);
  n.ntfScan();
  n.tasks()[0].assignee = STU; n.tasks()[0].assignedBy = BILL;
  n.ntfScan();
  let again = 0;
  for (let i = 0; i < 30; i++) again += n.ntfScan();
  ok('thirty more looks at an unchanged list raise nothing', again === 0, String(again));
  ok('and the feed still holds exactly one', n.ntf().list.length === 1);

  /* What the phone remembers about a task goes when the task goes. */
  ok('it is remembering the one task', Object.keys(n.ntf().seen).length === 1);
  n.setTasks([task({ id: 'b9', assignee: null })]);
  n.ntfScan();
  ok('a deleted job stops being remembered', Object.keys(n.ntf().seen).length === 1 &&
     !!n.ntf().seen.b9, JSON.stringify(Object.keys(n.ntf().seen)));

  /* Nothing here may ever reach the database. storeSaveLocal() writes to the
     phone; storeScan()/storeTouch() offer every drawer to Firestore, and
     calling either from something that runs when a record ARRIVES is what
     cost the farm 4.4 million reads. See CLAUDE.md. */
  const shell = fs.readFileSync(path.join(ROOT, 'app-01-shell.js'), 'utf8');
  /* Comments stripped first, or this trips over the comments that explain why
     these two must never be called from here. */
  const engine = shell.slice(shell.indexOf('The notification feed'),
                             shell.indexOf('function renderPrefsHub'))
                      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('the feed never calls storeScan()', !/storeScan\s*\(/.test(engine));
  ok('the feed never calls storeTouch()', !/storeTouch\s*\(/.test(engine));
  ok('the feed never writes to the database', !/db\.collection|firebase/.test(engine));
  ok('and it is real code, not an empty slice', engine.length > 2000, String(engine.length));
}

section('10. the fields it watches are the ones the app really writes');
{
  /* The whole feed rests on four field names. Rename one in the task code and
     the alerts stop with nothing on screen to say so, which is exactly the
     kind of silent breakage this repo keeps getting bitten by. */
  const four = fs.readFileSync(path.join(ROOT, 'app-04-spray-inventory.js'), 'utf8');
  const five = fs.readFileSync(path.join(ROOT, 'app-05-tasks-clock.js'), 'utf8');
  ok('completeTask() still marks status done', /t\.status='done'/.test(four));
  ok('completeTask() still stamps completedBy', /t\.completedBy=/.test(four));
  ok('a part finish still sets partial and leftPlots',
     /t\.partial=true/.test(four) && /t\.leftPlots=/.test(four));
  ok('handing the rest on still stamps restAssigned', /t\.restAssigned=/.test(four));
  ok('the assign wizard still stamps assignedBy', /assignedBy:SESSION\.pid/.test(five));
  ok('a request still stamps requestedBy', /requestedBy:SESSION\.pid/.test(five));
}

section('11. the app still opens cleanly');
{
  const { errs } = boot({});
  ok('nothing threw while the page loaded', errs.length === 0, errs.join(' | '));
}

/* ---------------------------------------------------------------------
   THE TIME CLOCK. Three things, and the third is the one with teeth:

     - Bill hears when somebody clocks in and when they clock out.
     - A shift nobody clocked out of is closed at the hours that person was
       SCHEDULED to finish, after a cut-off time the farm sets itself.
     - When there is no honest finish time to use, NOTHING is written and the
       student is asked instead. A made-up eight-hour day on a payroll record
       is the failure this whole section exists to prevent.
   --------------------------------------------------------------------- */

/* A weekday inside a term, with a shift on it, for whoever we name. Returns
   the ISO date. Seeding a term as well as a shift because schedShiftOn()
   answers nothing for a date between terms, which would quietly turn every
   check below into "no honest end time". */
function seedShift(win, pid, daysAgo, start, end) {
  win.eval("FARM_SEMS.length=0; FARM_SEMS.push({id:'sem-t',name:'Test term',start:'2020-01-01',end:'2035-12-31'});");
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  const key = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const days = { Mon: { on: false }, Tue: { on: false }, Wed: { on: false },
                 Thu: { on: false }, Fri: { on: false } };
  days[key] = { on: true, start: start, end: end };
  win.eval("schedSave('" + pid + "','Test term'," + JSON.stringify(days) + ");");
  const p2 = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}
function punch(win, o) {
  win.eval("tcApplyRemote([" + JSON.stringify(o) + "]);");
}

section('12. a shift nobody clocked out of gets closed at their scheduled finish');
{
  const store = {};
  const { win, n } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);
  const day = seedShift(win, STU, 1, '08:00', '12:00');   /* yesterday, 8-12 */
  punch(win, { id: 'pu-a', pid: STU, date: day, in: '08:03', out: null });

  ok('the shift is open to start with',
     win.tcPunchDocs().find(p => p.id === 'pu-a').out === null);
  ok('and the app can see it needs dealing with',
     win.tcOpenPunches().some(r => r.punch.id === 'pu-a'));

  ok('one shift closed', win.tcAutoClose() === 1);
  const p = win.tcPunchDocs().find(x => x.id === 'pu-a');
  ok('at the hours they were scheduled to finish', p.out === '12:00', String(p.out));
  ok('NOT at the cut-off time', p.out !== win.clockCut());
  ok('and it is marked as the app doing it, not a real punch', p.auto === true);
  ok('which the timesheet field says too', p.editedBy === 'auto', String(p.editedBy));

  ok('running it again changes nothing', win.tcAutoClose() === 0);
}

section('13. it refuses to guess, and asks the person instead');
{
  const store = {};
  const { win, n } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);
  /* A shift on a day they were NOT scheduled -- the app has no end time. */
  const day = seedShift(win, STU, 1, '08:00', '12:00');
  const other = new Date(day + 'T00:00:00');
  other.setDate(other.getDate() - 1);
  while (other.getDay() === 0 || other.getDay() === 6) other.setDate(other.getDate() - 1);
  const p2 = x => (x < 10 ? '0' : '') + x;
  const offDay = other.getFullYear() + '-' + p2(other.getMonth() + 1) + '-' + p2(other.getDate());
  punch(win, { id: 'pu-b', pid: STU, date: offDay, in: '13:00', out: null });

  ok('nothing is closed', win.tcAutoClose() === 0);
  ok('the shift is still open', win.tcPunchDocs().find(x => x.id === 'pu-b').out === null);
  const open = win.tcOpenPunches().find(r => r.punch.id === 'pu-b');
  ok('and the app knows it has no honest time for it', open && open.end === null);

  /* The other refusal: clocked in AFTER their shift was due to end. Closing
     that at the scheduled finish would write a negative day. */
  const day2 = seedShift(win, STU, 1, '08:00', '12:00');
  punch(win, { id: 'pu-c', pid: STU, date: day2, in: '14:00', out: null });
  ok('a clock-in after the scheduled finish is refused too', win.tcAutoClose() === 0);
  ok('that one is left open as well',
     win.tcPunchDocs().find(x => x.id === 'pu-c').out === null);
}

section('14. only a phone allowed to correct a timesheet does it');
{
  const store = {};
  const { win, n } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  const day = seedShift(win, STU, 1, '08:00', '12:00');

  n.signIn(STU);
  punch(win, { id: 'pu-d', pid: STU, date: day, in: '08:00', out: null });
  ok('a student’s own phone closes nothing', win.tcAutoClose() === 0,
     String(win.tcPunchDocs().find(x => x.id === 'pu-d').out));
  ok('which is the same answer the database gives', win.tcCanEditPunches() === false);

  n.signIn(BILL);
  ok('Bill’s phone does', win.tcAutoClose() === 1);
  ok('and the database agrees he may', win.tcCanPunchFor(STU) === true);
}

section('15. the cut-off is a farm setting, not a number in the source');
{
  const store = {};
  const { win, n } = boot(store);
  ok('it starts at eight in the evening', win.clockCut() === '20:00', win.clockCut());
  ok('and reads as words somebody can check', win.clockCutLabel() === '8:00pm', win.clockCutLabel());
  ok('untouched, it sends nothing to the shared copy', win.clockcfgRead() === null);

  win.eval("clockcfgApply({cut:'18:30'});");
  ok('changing it takes', win.clockCut() === '18:30', win.clockCut());
  ok('and now it travels', JSON.stringify(win.clockcfgRead()) === '{"cut":"18:30"}',
     JSON.stringify(win.clockcfgRead()));
  win.eval("clockcfgApply({cut:'nonsense'});");
  ok('rubbish falls back to the default rather than being stored',
     win.clockCut() === '20:00', win.clockCut());
  win.eval("clockcfgRestore();");
  ok('restore puts the built-in value back', win.clockcfgRead() === null);

  /* Today's shift is only closed once the clock has gone past the cut-off --
     that is the whole point of the time. Yesterday's always is. */
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);
  const today = seedShift(win, STU, 0, '08:00', '12:00');
  punch(win, { id: 'pu-e', pid: STU, date: today, in: '08:00', out: null });
  win.eval("clockcfgApply({cut:'23:59'});");
  const late = win.tcOpenPunches().some(r => r.punch.id === 'pu-e');
  ok('before the cut-off, today’s open shift is left well alone', late === false);
  win.eval("clockcfgApply({cut:'00:00'});");
  ok('after it, the same shift is in hand', win.tcOpenPunches().some(r => r.punch.id === 'pu-e'));
}

section('16. who hears what about the clock');
{
  const store = {};
  const { win, n, doc } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;

  /* --- Bill's phone --- */
  n.signIn(BILL);
  /* THIS SECTION IS ABOUT THE CLOCK ALERTS, so the three the calendar sets
     off are turned off for it. They are not noise here -- seeding a shift for
     today with an empty task board is exactly the situation that earns the
     "nothing on the task board yet" reminder, and it would fire or not
     depending on what time of day the tests happen to be run. Section 27
     tests those three properly, with the clock held still. */
  n.NOTIF().a_boardempty = false;
  n.NOTIF().a_noclock = false;
  n.NOTIF().a_payend = false;
  const day = seedShift(win, STU, 0, '08:00', '12:00');
  punch(win, { id: 'pu-x', pid: STU, date: day, in: '07:02', out: null });
  n.ntfScan();                                   /* baseline over the punch list */
  ok('the first look tells him nothing', n.ntf().list.length === 0,
     JSON.stringify(n.ntf().list.map(e => e.k)));

  punch(win, { id: 'pu-y', pid: STU, date: day, in: '08:00', out: null });
  ok('a new clock-in raises one', n.ntfScan() === 1);
  ok('and it is the right kind', n.ntf().list[0].k === 'clockin', n.ntf().list[0].k);
  ok('naming the person', n.ntf().list[0].who === STU);
  n.go('notifications');
  ok('the row reads as a sentence',
     /clocked in/.test(doc.getElementById('ntf-body').innerHTML));

  punch(win, { id: 'pu-y', pid: STU, date: day, in: '08:00', out: '12:30' });
  ok('clocking out raises one too', n.ntfScan() === 1);
  ok('as the clock-out alert', n.ntf().list[0].k === 'clockout', n.ntf().list[0].k);
  ok('with the hours worked on it', n.ntf().list[0].hrs === 4.5, String(n.ntf().list[0].hrs));

  /* THE DELIBERATE SILENCE. Dillon, 2026-09-24: closing a shift automatically
     is done quietly. Bill is not interrupted about it. */
  win.eval("clockcfgApply({cut:'00:00'});");
  const closed = win.tcAutoClose();
  ok('the app closes the shift nobody closed', closed === 1, String(closed));
  ok('and says nothing at all to Bill about it', n.ntfScan() === 0,
     JSON.stringify(n.ntf().list.slice(0, 2).map(e => e.k)));
}

section('17. the student hears about their own shift');
{
  const store = {};
  const { win, n, doc } = boot(store);
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(STU);
  const day = seedShift(win, STU, 1, '08:00', '12:00');
  punch(win, { id: 'pu-z', pid: STU, date: day, in: '08:00', out: null });
  n.ntfScan();                                   /* baseline */
  ok('nothing yet', n.ntf().list.length === 0);

  /* Bill's phone closes it; the record reaches theirs. */
  punch(win, { id: 'pu-z', pid: STU, date: day, in: '08:00', out: '12:00', auto: true });
  ok('the student is told', n.ntfScan() === 1);
  ok('that it was closed for them', n.ntf().list[0].k === 'shiftauto', n.ntf().list[0].k);
  n.go('notifications');
  const html = doc.getElementById('ntf-body').innerHTML;
  ok('the row says what time was written', /12:00pm/.test(html), html.slice(0, 200));
  ok('and tells them how to argue with it', /tell Bill if that is wrong/.test(html));
}

section('18. the shift the app would not guess at asks its owner');
{
  const store = {};
  const b = boot(store);
  const { win, n, doc } = b;
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(STU);
  /* A term with no shift on the day they worked: nothing to close it at. */
  const day = seedShift(win, STU, 1, '08:00', '12:00');
  const other = new Date(day + 'T00:00:00');
  other.setDate(other.getDate() - 1);
  while (other.getDay() === 0 || other.getDay() === 6) other.setDate(other.getDate() - 1);
  const p2 = x => (x < 10 ? '0' : '') + x;
  const offDay = other.getFullYear() + '-' + p2(other.getMonth() + 1) + '-' + p2(other.getDate());

  n.setTasks([]);
  punch(win, { id: 'pu-q', pid: STU, date: offDay, in: '13:00', out: null });
  ok('the student is asked', n.ntfScan() === 1);
  ok('by the right alert', n.ntf().list[0].k === 'shiftask', n.ntf().list[0].k);
  n.go('notifications');
  ok('and the row says what to do',
     /tap to say when you left/.test(doc.getElementById('ntf-body').innerHTML));
  ok('asking twice does not ask twice', n.ntfScan() === 0);

  /* Tapping it opens the sheet, and the sheet writes THEIR punch. */
  doc.querySelector('#ntf-body [data-ntf]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('the sheet opens', !!doc.getElementById('asksheet'));
  ok('and it is showing', doc.getElementById('asksheet').classList.contains('show'));
  /* THE BOTTOM-SHEET CSS IS KEYED TO IDS, NOT TO A CLASS. A sheet whose id is
     missing from one of those rules gets no positioning or no display rule:
     it never hides, it sits at the top of the screen with no backdrop, and
     nothing errors. #asksheet did exactly that the first time it was written.
     So: every rule that names an existing sheet must name this one too. */
  const CSS = HTML.slice(HTML.indexOf('<style'), HTML.lastIndexOf('</style>'));
  const rules = CSS.split('}').filter(r => r.indexOf('#restsheet') >= 0);
  ok('the CSS still has the bottom-sheet rules', rules.length === 4, String(rules.length));
  rules.forEach(r => {
    const sel = r.slice(r.lastIndexOf('\n') + 1).split('{')[0].trim();
    ok('#asksheet is in the same rule as #restsheet: ' + sel.slice(0, 48),
       r.indexOf('#asksheet') >= 0, sel);
  });

  doc.getElementById('ask-time').value = '17:15';
  doc.querySelector('#asksheet .ds-confirm').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const p = win.tcPunchDocs().find(x => x.id === 'pu-q');
  ok('the time they typed is on the punch', p.out === '17:15', String(p.out));
  ok('and it is credited to them, not to the app', p.editedBy === STU, String(p.editedBy));
  ok('it is not marked as automatic, because it was not', !p.auto);

  /* A time before the clock-in is refused rather than stored. */
  punch(win, { id: 'pu-r', pid: STU, date: offDay, in: '13:00', out: null });
  win.tcAskOutSheet('pu-r');
  doc.getElementById('ask-time').value = '09:00';
  doc.querySelector('#asksheet .ds-confirm').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('a time before they clocked in is refused',
     win.tcPunchDocs().find(x => x.id === 'pu-r').out === null);

  /* Somebody else's shift is not theirs to close, whatever the alert says. */
  punch(win, { id: 'pu-s', pid: 'p19', date: offDay, in: '13:00', out: null });
  ok('and somebody else’s shift cannot be touched from here',
     win.tcAskOutSheet('pu-s') === false);

  /* NOTHING MAY THROW ON THE WAY THROUGH. Saving wrote the punch correctly and
     then threw on the next line, reading a record it had just dropped -- so
     every check above passed while the toast never appeared, the screen never
     repainted and the bell never updated. Only the console showed it. */
  ok('and none of that threw', b.errs.length === 0, b.errs.join(' | '));
}

/* ---------------------------------------------------------------------
   19-21. THE FARM'S OWN THINGS, wired up 2026-10-01.

   Three switches on the Notifications screen saved their setting and did
   nothing for a month, which is why they carried the words "Not sending yet".
   These three sections are what makes that no longer true, and what stops it
   quietly becoming true again.

   WHAT EACH ONE IS REALLY GUARDING is who hears it. Those are Dillon's calls,
   not the code's, and every one of them is a line somebody could "tidy" into
   the obvious-looking rule and get wrong: a machine going down deliberately
   reaches an UNDERGRADUATE, while a low shelf deliberately does not reach a
   TECHNICIAN, and closed ground deliberately does not say whose study it is.
   --------------------------------------------------------------------- */

section('19. a machine going down reaches everybody; an issue report does not');
{
  const store = {};
  const b = boot(store);
  const { n, doc } = b;
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;

  /* An undergraduate, because that is the point: the crew are the people most
     likely to walk out to a mower that has just gone down. */
  n.signIn(STU);
  const m = n.equip()[0];
  ok('the farm has machines to watch', !!m && !!m.id);
  n.ntfScan();                                   /* silent baseline */
  ok('the baseline told nobody about the machines already there', n.ntf().list.length === 0);

  n.probs().unshift({ id: 'pz1', eq: m.id, by: BILL, downBy: BILL, status: 'open',
                      desc: 'Hydraulic leak at the left deck' });
  m.status = 'down';
  ok('an undergraduate is told it went down', n.ntfScan() === 1);
  ok('by the right alert', n.ntf().list[0].k === 'eqdown', n.ntf().list[0].k);
  ok('and looking again does not say it twice', n.ntfScan() === 0);

  n.go('notifications');
  let html = doc.getElementById('ntf-body').innerHTML;
  ok('the row says the machine is out of service', /is out of service/.test(html));
  ok('and who marked it down', /Bill/.test(html), html.slice(0, 300));
  ok('and what is wrong with it', /Hydraulic leak/.test(html));

  /* Back in service, and the row is the plain good news -- no name on it,
     because what matters is that the mower can be used again. */
  m.status = 'available';
  ok('and they are told when it is back', n.ntfScan() === 1);
  ok('by the other alert', n.ntf().list[0].k === 'equp', n.ntf().list[0].k);
  n.go('notifications');
  ok('which says it is usable again', /is back in service/.test(doc.getElementById('ntf-body').innerHTML));

  /* AN ISSUE REPORT IS A DIFFERENT AUDIENCE. "It still runs but something is
     wrong" is for whoever would fix it, and an undergraduate cannot. */
  const m2 = n.equip()[1];
  n.probs().unshift({ id: 'pz2', eq: m2.id, by: STU, downBy: null, status: 'open',
                      desc: 'Pulls to the right' });
  m2.flagged = true;
  ok('an undergraduate hears nothing about an issue report', n.ntfScan() === 0);

  /* The same machine, the same flag, on Bill's phone. */
  const store2 = {};
  const b2 = boot(store2);
  b2.n.signIn(BILL);
  b2.n.ntfScan();
  b2.n.probs().unshift({ id: 'pz3', eq: b2.n.equip()[1].id, by: STU, downBy: null,
                         status: 'open', desc: 'Pulls to the right' });
  b2.n.equip()[1].flagged = true;
  ok('Bill does hear about it', b2.n.ntfScan() === 1);
  ok('by the issue alert', b2.n.ntf().list[0].k === 'eqflag', b2.n.ntf().list[0].k);
  b2.n.go('notifications');
  const h2 = b2.doc.getElementById('ntf-body').innerHTML;
  ok('and the row says it is still running', /still running/.test(h2), h2.slice(0, 300));

  /* A machine going from flagged to DOWN says the louder thing, once. */
  b2.n.equip()[1].status = 'down';
  ok('the same machine going down says so', b2.n.ntfScan() === 1);
  ok('and only the down alert', b2.n.ntf().list[0].k === 'eqdown', b2.n.ntf().list[0].k);

  /* A technician is on the fixing list too. */
  const b3 = boot({});
  b3.n.signIn(n.RST_LOGIN.tech);
  b3.n.ntfScan();
  b3.n.probs().unshift({ id: 'pz4', eq: b3.n.equip()[2].id, by: STU, status: 'open', desc: 'Belt squeal' });
  b3.n.equip()[2].flagged = true;
  ok('a technician hears an issue report', b3.n.ntfScan() === 1);

  ok('and none of that threw', b.errs.length === 0, b.errs.join(' | '));
}

section('20. the shelf tells Bill and faculty, and nobody else');
{
  /* Bill and faculty, in Dillon's words on 2026-10-01: they are the people who
     order. A technician is NOT on this list, which is the line most likely to
     get "tidied" into the equipment one. */
  function lowOne(who) {
    const b = boot({});
    b.n.signIn(who);
    b.n.ntfScan();                               /* baseline, including whatever is already low */
    const it = b.n.inv().filter(x => !b.n.isLow(x))[0];
    it.thr = b.n.invQty(it) + 5;                 /* the shelf has just dropped below its point */
    return { b: b, made: b.n.ntfScan(), it: it };
  }
  const bill = lowOne(boot({}).n.RST_LOGIN.manager);
  ok('Bill is told a product is low', bill.made === 1);
  ok('by the right alert', bill.b.n.ntf().list[0].k === 'low', bill.b.n.ntf().list[0].k);
  bill.b.n.go('notifications');
  const html = bill.b.doc.getElementById('ntf-body').innerHTML;
  ok('the row names the product', html.indexOf(bill.it.name.slice(0, 12)) >= 0, html.slice(0, 300));
  ok('and says how little is left and where the line is',
     /left/.test(html) && /reorder at/.test(html), html.slice(0, 300));
  ok('and saying it once is enough', bill.b.n.ntfScan() === 0);

  const fac = lowOne(boot({}).n.RST_LOGIN.faculty);
  ok('faculty are told as well', fac.made === 1);

  const tech = lowOne(boot({}).n.RST_LOGIN.tech);
  ok('a technician is not', tech.made === 0);
  const stu = lowOne(boot({}).n.RST_LOGIN.undergrad);
  ok('nor is an undergraduate', stu.made === 0);
  const grad = lowOne(boot({}).n.RST_LOGIN.grad);
  ok('nor a graduate student', grad.made === 0);

  /* A delivery putting it back above the line says nothing, because it is not
     news to the person who booked it in. */
  bill.it.thr = 0;
  ok('coming back up is silent', bill.b.n.ntfScan() === 0);
}

section('21. closed ground reaches everybody, by plot and never by study');
{
  const store = {};
  const b = boot(store);
  const { n, doc } = b;
  const STU = n.RST_LOGIN.undergrad;
  /* An undergraduate on a mower is exactly who this alert is for, and the
     study belongs to a lab that is nothing to do with them. */
  n.signIn(STU);
  n.ntfScan();
  const today = n.today();
  const study = { id: 's-ntf1', title: 'Dollar spot fungicide screen', lab: 'Sorochan',
                  stage: 'active', start: today, end: '', plots: ['CAFS14'],
                  restrictions: [] };
  n.trials().push(study);
  ok('a study with no restrictions closes nothing', n.ntfScan() === 0);

  study.restrictions.push({ id: 'r-ntf1', type: 'mow', scope: 'CAFS14',
                            start: today, end: '', by: 'Somebody Else' });
  ok('ground closing tells the undergraduate', n.ntfScan() === 1);
  ok('by the right alert', n.ntf().list[0].k === 'resclose', n.ntf().list[0].k);
  ok('and it does not say it again', n.ntfScan() === 0);

  n.go('notifications');
  let html = doc.getElementById('ntf-body').innerHTML;
  ok('the row names the plot', /CAFS14/.test(html), html.slice(0, 300));
  ok('and what is not allowed on it', /No mow/.test(html));
  ok('and says it runs until somebody lifts it', /until it is lifted/.test(html));
  /* THE WHOLE POINT OF THE WORDING. The ground is everybody's business; whose
     trial it is, is not -- the same rule the farm map follows. */
  ok('and it does NOT name the study', html.indexOf('Dollar spot') < 0, html.slice(0, 400));
  ok('nor the lab', html.indexOf('Sorochan') < 0, html.slice(0, 400));

  /* Lifted, and the ground is theirs again. */
  study.restrictions[0].lifted = today;
  study.restrictions[0].liftedBy = 'Bill';
  ok('lifting it says so', n.ntfScan() === 1);
  ok('by the other alert', n.ntf().list[0].k === 'resopen', n.ntf().list[0].k);
  n.go('notifications');
  html = doc.getElementById('ntf-body').innerHTML;
  ok('the row says the plot is open again', /CAFS14 is open again/.test(html), html.slice(0, 300));
  ok('and that somebody lifted it', /was lifted/.test(html));

  /* A restriction that has not started yet is not standing on anything -- but
     since 2026-10-05 it IS worth saying that it is coming, and that is the
     only time "a restriction was added" is said at all. One that starts today
     says "closed" instead, so one tap never reads as two pieces of news. */
  const future = '2099-01-01';
  study.restrictions.push({ id: 'r-ntf2', type: 'herbicide', scope: 'CAFS15',
                            start: future, end: '', by: 'Somebody Else' });
  ok('a restriction starting next year says it is coming', n.ntfScan() === 1);
  ok('and says exactly that, not that the ground is shut',
     n.ntf().list[0].k === 'resnew', n.ntf().list[0].k);
  n.go('notifications');
  const soon = doc.getElementById('ntf-body').innerHTML;
  ok('naming the plot it will close', /CAFS15/.test(soon), soon.slice(0, 200));
  ok('and it does not also claim the ground is closed today',
     !/CAFS15 is closed/.test(soon));

  /* AND THE TRAP: a study that is GONE says nothing. Its ground is open, but
     "CAFS16 is open again" from a record nobody can look at any more is a
     sentence with no answer behind it. */
  const gone = { id: 's-ntf2', title: 'Shade study', lab: 'Brosnan', stage: 'active',
                 start: today, end: '', plots: ['CAFS16'],
                 restrictions: [{ id: 'r-ntf3', type: 'mow', scope: 'CAFS16',
                                  start: today, end: '', by: 'Somebody Else' }] };
  n.trials().push(gone);
  /* Two pieces of news from one push, and both are right: a study appeared,
     and ground shut. */
  ok('a new study with live ground says both things', n.ntfScan() === 2);
  ok('one of them being that the ground is closed',
     n.ntf().list.some(e => e.k === 'resclose'), n.ntf().list.map(e => e.k).join(','));
  ok('and the other that a study was added',
     n.ntf().list.some(e => e.k === 'trnew'), n.ntf().list.map(e => e.k).join(','));
  const before = n.ntf().list.length;
  n.trials().splice(n.trials().indexOf(gone), 1);
  ok('and the study being removed altogether says nothing', n.ntfScan() === 0);
  ok('so nothing was added to the feed', n.ntf().list.length === before);

  /* Turning the switch off stops it, like every other row. */
  const b4 = boot({});
  b4.n.signIn(STU);
  b4.n.NOTIF().a_trials = false;
  b4.n.ntfScan();
  b4.n.trials().push({ id: 's-ntf3', title: 'Another', lab: 'Sorochan', stage: 'active',
                       start: b4.n.today(), end: '', plots: ['CAFS20'],
                       restrictions: [{ id: 'r-ntf4', type: 'mow', scope: 'CAFS20',
                                        start: b4.n.today(), end: '', by: 'X' }] });
  ok('with the switch off, closed ground is silent', b4.n.ntfScan() === 0);

  ok('and none of that threw', b.errs.length === 0, b.errs.join(' | '));
}

section('22. the three new walks cannot silence each other, or the two old ones');
{
  /* FIVE walks now, and the one way this breaks is a shared guard: the clock
     alerts once sat behind the job walk's "no jobs, nothing to do" line, so on
     a farm with an empty task list they silently did not exist. Nothing on
     screen said so. This is that check, for every pair at once. */
  const b = boot({});
  const { n } = b;
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);
  n.setTasks([]);                                /* no jobs at all */
  n.trials().length = 0;                         /* and no studies */
  n.ntfScan();
  const m = n.equip()[0];
  m.status = 'down';
  ok('a machine going down is heard on a farm with no jobs and no studies',
     n.ntfScan() === 1, n.ntf().list.map(e => e.k).join(','));

  /* And the other way round: a job landing is still heard with nothing wrong
     anywhere else. */
  n.signIn(STU);
  n.ntfScan();
  n.setTasks([task({ id: 'q1', assignee: null })]);
  n.ntfScan();
  n.tasks()[0].assignee = STU;
  n.tasks()[0].assignedBy = BILL;
  ok('and a job landing is still heard', n.ntfScan() === 1);
  ok('nothing threw', b.errs.length === 0, b.errs.join(' | '));
}

section('23. THE SWEEP: the buzz and the bell agree about who hears what');
{
  /* THE ONE TEST THAT HOLDS PHONE NOTIFICATIONS TOGETHER.
     ------------------------------------------------------------------
     Every alert is now answered twice. The BELL asks "is this mine" on the
     phone of the person reading it. The BUZZ asks "whose is this" on whatever
     phone happened to be awake when it happened, and hands that list to the
     sender -- because the people who need buzzing are precisely the ones whose
     phones were shut and noticed nothing.

     Those two answers come from one walk, which is the whole point of the way
     it is written. This sweep is what proves it: for each change below it runs
     the farm forward once per PERSON, sees whether their own bell lit up, and
     checks that against the audience the walk handed the sender. A person on
     the list whose bell stayed dark would be somebody buzzed about something
     they cannot see in the app. A person off the list whose bell lit up would
     be somebody the farm never buzzes. Both are silent failures in the field
     and neither is visible from any screen. */

  /* Everything one scenario needs: what the farm looked like, and what
     changed. `make` runs against a freshly booted app signed in as `who`. */
  function sweep(name, make) {
    /* First pass: one phone watches, and we take the audiences it worked out. */
    const lead = boot({});
    lead.n.signIn(lead.n.RST_LOGIN.manager);
    make(lead.n, true);                          /* set the scene */
    lead.n.ntfScan();                            /* ...silently */
    make(lead.n, false);                         /* now change it */
    lead.n.ntfScan();
    const evs = lead.n.events().map(e => ({ k: e.k, to: e.to.slice() }));
    ok(name + ': the walk produced news at all', evs.length > 0,
       JSON.stringify(evs));
    shut(lead);

    /* Second pass: every kind of person on the farm, one at a time, each on
       their own phone, and we look at their bell. */
    const roles = ['manager', 'faculty', 'tech', 'grad', 'undergrad'];
    roles.forEach(role => {
      const b = boot({});
      const pid = b.n.RST_LOGIN[role];
      b.n.signIn(pid);
      make(b.n, true);
      b.n.ntfScan();
      make(b.n, false);
      b.n.ntfScan();
      const rows = b.n.ntf().list.map(e => e.k);
      /* What the audiences say this person should have seen -- at most one,
         because a person hears one thing per record per look. */
      const addressed = evs.filter(e => e.to.indexOf(pid) >= 0).map(e => e.k);
      ok(name + ': ' + role + ' hears exactly what the sender would tell them',
         rows.join(',') === addressed.slice(0, rows.length || 1).join(',')
           || (rows.length === 0 && addressed.length === 0)
           || (rows.length === 1 && addressed[0] === rows[0]),
         'bell=[' + rows + '] audience=[' + addressed + ']');
      ok(name + ': ' + role + ' is not told twice about one thing',
         rows.length <= 1, '[' + rows + ']');
      shut(b);
    });
  }

  const T = () => boot({}).n;   /* only for reading RST_LOGIN below */
  const L = T().RST_LOGIN;

  sweep('a job handed to an undergrad', (n, setup) => {
    if (setup) { n.setTasks([task({ id: 'sw1', assignee: null, createdBy: L.manager })]); return; }
    n.tasks()[0].assignee = L.undergrad;
    n.tasks()[0].assignedBy = L.manager;
  });

  sweep('that job coming back finished', (n, setup) => {
    if (setup) {
      n.setTasks([task({ id: 'sw2', assignee: L.undergrad, assignedBy: L.manager,
                         createdBy: L.manager })]);
      return;
    }
    Object.assign(n.tasks()[0], { status: 'done', completedBy: L.undergrad });
  });

  sweep('a technician asking for help', (n, setup) => {
    if (setup) { n.setTasks([task({ id: 'sw3', assignee: null, title: 'Pull covers' })]); return; }
    Object.assign(n.tasks()[0], { kind: 'request', origin: 'crew', requestedBy: L.tech,
                                  createdBy: L.tech, students: 2, assignee: null });
  });

  sweep('Bill putting somebody on that request', (n, setup) => {
    if (setup) {
      n.setTasks([task({ id: 'sw4', kind: 'request', origin: 'crew', requestedBy: L.tech,
                         createdBy: L.tech, students: 2, assignee: null })]);
      return;
    }
    Object.assign(n.tasks()[0], { kind: 'task', assignee: L.undergrad });
  });

  sweep('a machine going down', (n, setup) => {
    if (setup) return;
    const m = n.equip()[0];
    n.probs().unshift({ id: 'swp', eq: m.id, by: L.manager, downBy: L.manager,
                        status: 'open', desc: 'Hydraulic leak' });
    m.status = 'down';
  });

  sweep('an issue reported on a machine', (n, setup) => {
    if (setup) return;
    const m = n.equip()[1];
    n.probs().unshift({ id: 'swq', eq: m.id, by: L.undergrad, status: 'open', desc: 'Belt squeal' });
    m.flagged = true;
  });

  sweep('a product reaching its reorder point', (n, setup) => {
    if (setup) return;
    const it = n.inv().filter(x => !n.isLow(x))[0];
    it.thr = n.invQty(it) + 5;
  });

  sweep('ground closing', (n, setup) => {
    if (setup) {
      n.trials().push({ id: 'sws', title: 'A study', lab: 'Sorochan', stage: 'active',
                        start: n.today(), end: '', plots: ['CAFS14'], restrictions: [] });
      return;
    }
    n.trials().filter(t => t.id === 'sws')[0].restrictions.push(
      { id: 'swr', type: 'mow', scope: 'CAFS14', start: n.today(), end: '', by: 'Somebody' });
  });
}

section('24. what the sender is actually handed');
{
  const b = boot({});
  const { n } = b;
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);
  n.setTasks([task({ id: 'q1', assignee: null, createdBy: BILL })]);
  n.ntfScan();
  n.tasks()[0].assignee = STU;
  n.tasks()[0].assignedBy = BILL;
  n.ntfScan();

  const ev = n.events().filter(e => e.k === 'assigned')[0];
  ok('the undergrad is in the audience', !!ev && ev.to.indexOf(STU) >= 0,
     JSON.stringify(ev && ev.to));
  ok('and Bill, who did it, is not', !!ev && ev.to.indexOf(BILL) < 0);

  /* SAME NAME ON EVERY PHONE. The sender keeps the first report of a thing and
     throws the rest away, which only works if two phones that saw the same
     change call it the same thing. Nothing in here may come from the clock. */
  const b2 = boot({});
  b2.n.signIn(b2.n.RST_LOGIN.tech);
  b2.n.setTasks([task({ id: 'q1', assignee: null, createdBy: BILL })]);
  b2.n.ntfScan();
  b2.n.tasks()[0].assignee = STU;
  b2.n.tasks()[0].assignedBy = BILL;
  b2.n.ntfScan();
  const ev2 = b2.n.events().filter(e => e.k === 'assigned')[0];
  ok('two different phones give the change the same name',
     n.eventId(ev) === b2.n.eventId(ev2), n.eventId(ev) + ' vs ' + b2.n.eventId(ev2));
  ok('and the name is not empty', !!n.eventId(ev), n.eventId(ev));

  /* THE QUEUE, taken FIRST. Opening any screen rescans, and a rescan is a new
     look with new news -- so anything read after one is the wrong list. That
     is not a quirk of the test, it is how the feed works. */
  const text = n.eventText(ev);
  n.queue(n.events(), Date.now());
  const out = n.outbox();

  /* THE SENTENCE IS THE SAME SENTENCE. A buzz that words things differently
     from the bell behind it reads as two separate events to the person
     holding the phone. Checked on the UNDERGRAD's phone, because they are the
     one the alert is addressed to -- Bill did it, so his own bell is rightly
     empty. */
  const bs = boot({});
  bs.n.signIn(STU);
  bs.n.setTasks([task({ id: 'q1', assignee: null, createdBy: BILL })]);
  bs.n.ntfScan();
  bs.n.tasks()[0].assignee = STU;
  bs.n.tasks()[0].assignedBy = BILL;
  bs.n.ntfScan();
  bs.n.go('notifications');
  const html = bs.doc.getElementById('ntf-body').innerHTML;
  ok('the buzz says what the bell says', !!text && html.indexOf(text.title) >= 0,
     JSON.stringify(text) + ' | ' + html.slice(0, 160));
  ok('and it is plain words, not web-page markup',
     !!text && !/&(amp|lt|gt|quot|#39);/.test(text.title + text.body), JSON.stringify(text));

  /* THE SWITCH THAT GOVERNS IT travels with the message, because the sender
     has to decide not to send without knowing what any alert means. */
  ok('"assigned" is governed by the "tasks" switch', n.switchOf('assigned') === 'tasks');
  ok('a machine going down and coming back share one switch',
     n.switchOf('eqdown') === 'equip' && n.switchOf('equp') === 'equip');
  ok('ground closing and opening share one too',
     n.switchOf('resclose') === 'trials' && n.switchOf('resopen') === 'trials');
  ok('and anything else answers to its own name', n.switchOf('low') === 'low');

  /* Noticed now, handed over when there is signal. */
  ok('the news is queued for the sender', out.length > 0, String(out.length));
  ok('each queued message carries its audience', out.every(m => Array.isArray(m.to) && m.to.length));
  ok('and the switch that governs it', out.every(m => !!m.sw));
  const before = out.length;
  n.queue([ev], Date.now());
  ok('queueing the same news twice does not double it', n.outbox().length === before,
     n.outbox().length + ' vs ' + before);

  /* WHAT THE SENDER IS TOLD ABOUT A PERSON, and what it is not. */
  const prefs = n.pushPrefs();
  ok('the sender is told which switches this person left on',
     prefs.alerts && prefs.alerts.a_tasks === true);
  ok('and their delivery hours and where in the world they are',
     'quiet' in prefs && 'start' in prefs && !!prefs.tz, JSON.stringify(prefs.tz));
  ok('but nothing about who hears what', !('to' in prefs) && !('roles' in prefs));

  ok('and none of that threw', b.errs.length === 0, b.errs.join(' | '));
}

section('26. the six Dillon asked for on 2026-10-05');
{
  /* Each of these is a record appearing or a field changing, so they sit in
     the same machinery as everything above. What is worth checking is not
     that they fire -- it is WHO they reach and WHAT THEY SAY, because both
     were decisions rather than defaults. */
  const L = boot({}).n.RST_LOGIN;

  /* ---- work typed into the field log by hand ---- */
  function logEntry(n, o) {
    n.log().push(Object.assign({
      plots: ['CAFS14'], plot: 'CAFS14', type: 'mow', title: 'Mow fairways',
      detail: 'Toro 3235C · Garrett Willard', date: 'Oct 5', ord: 20261005,
      op: 'Mow', person: L.undergrad, loggedBy: L.undergrad, time: '09:14',
      source: 'manual'
    }, o || {}));
    n.commitLog();
  }
  /* EVERY WALK TAKES ITS BASELINE ON THE FIRST LOOK THAT FINDS ANYTHING, and
     a walk that finds an empty list has not started watching yet. So each of
     these puts one record there, looks once to baseline it, and only then
     does the thing being tested. Getting that wrong reads as "the alert does
     not work" when what happened is that the test never started it. */
  /* Hands back the answers and SHUTS the browser rather than leaving one open.
     Each boot is a whole copy of the app, and this file makes sixty-odd of
     them; holding them all ran Node out of memory partway through, which
     looks like the tests dying rather than like anything failing. */
  function feel(role, make) {
    const b = boot({});
    b.n.signIn(b.n.RST_LOGIN[role]);
    logEntry(b.n, { id: 'fl-seed', title: 'Something earlier' });
    b.n.moves().push({ id: 'mv-seed', item: b.n.inv()[0].id, delta: 1, unit: 'gal',
                       why: 'in', by: L.manager, at: '2026-10-01T08:00:00', note: '' });
    b.n.ntfScan();
    make(b.n);
    const made = b.n.ntfScan();
    const kinds = b.n.ntf().list.map(e => e.k);
    b.n.go('notifications');
    const html = b.doc.getElementById('ntf-body').innerHTML;
    shut(b);
    return { made, kinds, html, errs: b.errs };
  }

  let r = feel('manager', n => logEntry(n, { id: 'fl-a' }));
  ok('Bill hears when somebody logs work by hand', r.made === 1, String(r.made));
  ok('by the right alert', r.kinds[0] === 'fllog', r.kinds[0]);
  ok('and the row says who did it', /Garrett/.test(r.html), r.html.slice(0, 220));
  ok('and what it was', /Mow fairways/.test(r.html));

  ok('faculty hear it too', feel('faculty', n => logEntry(n, { id: 'fl-b' })).made === 1);
  ok('an undergraduate does not', feel('undergrad', n => logEntry(n, { id: 'fl-c' })).made === 0);
  ok('and a technician does not', feel('tech', n => logEntry(n, { id: 'fl-d' })).made === 0);

  /* THE WORD "DIRECTLY" IS LOAD-BEARING. Finishing a job writes a field log
     entry as well, and that has already been said once as "the job is done".
     Saying it twice is how a feed starts being ignored. */
  r = feel('manager', n => logEntry(n, { id: 'fl-e', source: 'task' }));
  ok('an entry a finished job wrote says nothing', r.made === 0, r.kinds.join(','));

  /* ---- stock being booked in ---- */
  function restock(n, id) {
    n.moves().push({ id: id, item: n.inv()[0].id, delta: 10, unit: n.inv()[0].unit,
                     why: 'in', by: L.tech, at: '2026-10-05T09:00:00', note: '' });
  }
  r = feel('manager', n => restock(n, 'mv-a'));
  ok('Bill hears a delivery being booked in', r.made === 1, String(r.made));
  ok('by the right alert', r.kinds[0] === 'restock', r.kinds[0]);
  ok('an undergraduate does not', feel('undergrad', n => restock(n, 'mv-b')).made === 0);

  /* The other three reasons a stock figure moves are not deliveries. */
  ['out', 'count', 'adjust'].forEach(why => {
    const rr = feel('manager', n => {
      n.moves().push({ id: 'mv-' + why, item: n.inv()[0].id, delta: -5, unit: 'gal',
                       why: why, by: L.tech, at: '2026-10-05T09:00:00', note: '' });
    });
    ok('"' + why + '" is not a delivery and says nothing', rr.made === 0, rr.kinds.join(','));
  });

  /* ---- studies ---- */
  function study(n, o) {
    /* `locations`, not `plots` -- a study's ground is a list of {plot, sqft},
       and trPlots() reads that. A fixture with `plots` quietly has no ground
       at all, which is how the row came out saying "the farm". */
    const t = Object.assign({ id: 's-x', title: 'Dollar spot fungicide screen',
                              lab: 'Brosnan', stage: 'planned', start: n.today(),
                              end: '', locations: [{ plot: 'CAFS14', sqft: 400 }],
                              restrictions: [] }, o || {});
    n.trials().push(t);
    return t;
  }
  /* The trials walk takes its baseline on the first look that finds ANY
     study, so one has to exist before the one being watched for. */
  function withStudies(role, make) {
    const b = boot({});
    b.n.signIn(b.n.RST_LOGIN[role]);
    study(b.n, { id: 's-seed', title: 'Something else', stage: 'active' });
    b.n.ntfScan();
    make(b.n);
    const made = b.n.ntfScan();
    return { b, made, kinds: b.n.ntf().list.map(e => e.k),
             /* kept open: several of these are poked again afterwards, so each
                caller shuts its own with shut(). */
             html: () => { b.n.go('notifications');
                           return b.doc.getElementById('ntf-body').innerHTML; } };
  }

  r = withStudies('undergrad', n => study(n));
  ok('a new study reaches even an undergraduate', r.made === 1, String(r.made));
  ok('by the right alert', r.kinds[0] === 'trnew', r.kinds[0]);
  let html = r.html();
  /* A STUDY AT PLANNED IS HIDDEN from everybody outside its lab -- trVisible()
     -- so announcing it by name to the whole farm would give away exactly
     what that rule protects. The ground and the lab are the farm's business;
     the name is not, yet. */
  ok('but it is NOT named, because it has not started', !/Dollar spot/.test(html), html.slice(0, 260));
  ok('it names the ground instead', /CAFS14/.test(html), html.slice(0, 260));
  ok('and the lab', /Brosnan/.test(html), html.slice(0, 260));
  shut(r.b);

  r = withStudies('undergrad', n => { study(n, { stage: 'planned' }); });
  const b2 = r.b;
  b2.n.trials().filter(t => t.id === 's-x')[0].stage = 'active';
  const started = b2.n.ntfScan();
  ok('a study starting says so', started === 1, String(started));
  ok('by the right alert', b2.n.ntf().list[0].k === 'trstart', b2.n.ntf().list[0].k);
  b2.n.go('notifications');
  html = b2.doc.getElementById('ntf-body').innerHTML;
  /* Now it MAY be named: starting is the moment the whole farm can see it. */
  ok('and now it may be named, because the farm can see it', /Dollar spot/.test(html),
     html.slice(0, 260));
  shut(b2);

  r = withStudies('undergrad', n => study(n, { stage: 'active' }));
  r.b.n.trials().filter(t => t.id === 's-x')[0].stage = 'completed';
  const done = r.b.n.ntfScan();
  ok('a study finishing says so', done === 1, String(done));
  ok('by the right alert', r.b.n.ntf().list[0].k === 'trdone', r.b.n.ntf().list[0].k);
  shut(r.b);

  /* ---- a restriction added for later ---- */
  r = withStudies('undergrad', n => {
    const t = study(n, { stage: 'active' });
    t.restrictions.push({ id: 'rr1', type: 'mow', scope: 'CAFS20',
                          start: '2099-01-01', end: '', by: 'Somebody' });
  });
  ok('a study arriving with a future restriction says both things',
     r.made === 2, r.kinds.join(','));
  ok('one of them being that a restriction is coming',
     r.kinds.indexOf('resnew') >= 0, r.kinds.join(','));
  shut(r.b);

  /* AND THE COLLAPSE: one that starts today is said ONCE, as closed ground. */
  r = withStudies('undergrad', n => {
    const t = study(n, { stage: 'active' });
    t.restrictions.push({ id: 'rr2', type: 'mow', scope: 'CAFS21',
                          start: n.today(), end: '', by: 'Somebody' });
  });
  ok('a restriction starting today is not said twice',
     r.kinds.filter(k => k === 'resnew' || k === 'resclose').length === 1, r.kinds.join(','));
  ok('and the one thing said is that the ground is closed',
     r.kinds.indexOf('resclose') >= 0 && r.kinds.indexOf('resnew') < 0, r.kinds.join(','));
  shut(r.b);
}

section('27. the three the calendar sets off, with the clock held still');
{
  /* THESE DO NOT WORK LIKE THE OTHERS and the difference is the whole point.
     Every alert above is set off by somebody tapping something, so a phone is
     awake to notice. These three are set off by the CLOCK -- before a shift,
     at nine in the morning, half an hour after somebody should have arrived --
     and at those moments every phone on the farm may be shut.

     So a phone works them out DAYS AHEAD and books them with the sender, which
     holds each one until its time. What is checked here is the working-out:
     whether the right reminder is wanted, at the right minute, for the right
     people, and -- just as important -- whether it stops being wanted the
     moment its reason goes away.

     The clock is passed in rather than read, so these answers are the same
     whenever somebody runs the tests. */
  const b = boot({});
  const { win, n } = b;
  const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
  n.signIn(BILL);

  /* A shift today from 09:00, and a fixed "now" of 06:00 the same morning. */
  const day = seedShift(win, STU, 0, '09:00', '17:00');
  const p = day.split('-').map(Number);
  const at6 = new Date(p[0], p[1] - 1, p[2], 6, 0, 0, 0).getTime();
  const mins = (ms) => Math.round(ms / 60000);

  n.setTasks([]);                                 /* nothing on the board */
  let want = n.planWanted(at6);
  const boardKey = 'board:' + day;
  ok('an empty board before a shift is worth a reminder', !!want[boardKey],
     Object.keys(want).join(' | '));
  ok('and it is booked 45 minutes before the first person is due',
     want[boardKey] && mins(want[boardKey].at.getTime() -
       new Date(p[0], p[1] - 1, p[2], 9, 0).getTime()) === -45,
     want[boardKey] && want[boardKey].at.toString());
  ok('it goes to whoever runs the crew',
     want[boardKey] && want[boardKey].to.indexOf(BILL) >= 0, JSON.stringify(want[boardKey] && want[boardKey].to));
  ok('and not to the student who is coming in',
     want[boardKey] && want[boardKey].to.indexOf(STU) < 0);
  ok('the sentence says how many are due and when',
     want[boardKey] && /down to work at 9:00am/.test(want[boardKey].body),
     want[boardKey] && want[boardKey].body);

  /* THE REASON GOING AWAY IS THE OTHER HALF. Bill fills the board in and the
     reminder stops being wanted -- which is what makes a phone take it back
     off the sender. */
  n.setTasks([task({ id: 'bd1', assignee: STU, assignedBy: BILL, dueAt: day + 'T09:00' })]);
  want = n.planWanted(at6);
  ok('filling the board in stops it being wanted', !want[boardKey],
     Object.keys(want).join(' | '));

  /* A job that is already finished does not count as a board with work on it. */
  n.setTasks([task({ id: 'bd2', assignee: STU, assignedBy: BILL,
                     dueAt: day + 'T09:00', status: 'done' })]);
  want = n.planWanted(at6);
  ok('a job already finished does not count as filling it in', !!want[boardKey],
     Object.keys(want).join(' | '));

  /* ---- the clock-in nudge ---- */
  const clockKey = 'clockin:' + STU + ':' + day;
  ok('a student down to work is nudged if they have not clocked in', !!want[clockKey],
     Object.keys(want).join(' | '));
  ok('half an hour after they were due to start',
     want[clockKey] && mins(want[clockKey].at.getTime() -
       new Date(p[0], p[1] - 1, p[2], 9, 0).getTime()) === 30,
     want[clockKey] && want[clockKey].at.toString());
  ok('and it goes to them and nobody else',
     want[clockKey] && want[clockKey].to.length === 1 && want[clockKey].to[0] === STU,
     JSON.stringify(want[clockKey] && want[clockKey].to));

  /* Clocking in takes it back. */
  punch(win, { id: 'pu-nc', pid: STU, date: day, in: '09:05', out: null });
  want = n.planWanted(at6);
  ok('clocking in stops the nudge being wanted', !want[clockKey],
     Object.keys(want).join(' | '));

  /* AND THE DELIBERATE GAP, which was Dillon's call on 2026-10-05: it does not
     ask where the phone is. A phone with the app shut cannot be asked, so the
     choice was between nudging somebody who called out and nudging nobody. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'app-01-shell.js'), 'utf8');
  const planPart = src.slice(src.indexOf('function planWanted'), src.indexOf('function planSync'));
  ok('the nudge never consults the geofence',
     !/geo|locOk|coords|latitude/i.test(planPart), 'something location-ish is in planWanted');

  /* ---- the pay period ---- */
  ok('the payroll calendar has one home, and the bell borrows it',
     typeof n.periodEndOn === 'function' && /^\d{4}-\d\d-\d\d$/.test(n.periodEndOn(new Date(at6))),
     String(n.periodEndOn(new Date(at6))));
  /* Asked from a day whose period ends within the look-ahead, so the two
     reminders are really there rather than only when the calendar obliges. */
  const endISO = n.periodEndOn(new Date(at6));
  const ep = endISO.split('-').map(Number);
  const dayBefore = new Date(ep[0], ep[1] - 1, ep[2] - 1, 6, 0, 0, 0).getTime();
  want = n.planWanted(dayBefore);
  const crewKey = 'payend:' + endISO + ':crew', bossKey = 'payend:' + endISO + ':boss';
  ok('the crew are told to submit their hours', !!want[crewKey], Object.keys(want).join(' | '));
  ok('and Bill to approve them', !!want[bossKey], Object.keys(want).join(' | '));
  ok('both at nine in the morning',
     want[crewKey] && want[crewKey].at.getHours() === 9 && want[crewKey].at.getMinutes() === 0,
     want[crewKey] && want[crewKey].at.toString());
  ok('on the day it actually ends',
     want[crewKey] && want[crewKey].at.getDate() === ep[2], endISO);
  ok('the students are told to submit', /submit/i.test(want[crewKey].body), want[crewKey].body);
  ok('and Bill to approve', /approv/i.test(want[bossKey].body), want[bossKey].body);
  ok('and they are two different audiences',
     want[crewKey].to.indexOf(BILL) < 0 && want[bossKey].to.indexOf(BILL) >= 0,
     JSON.stringify([want[crewKey].to, want[bossKey].to]));

  ok('and none of that threw', b.errs.length === 0, b.errs.join(' | '));
}

/* Async like flushSection() below, and for the same reason: it waits on the
   weather service answering, and a bare `await` cannot sit at the top level of
   one of these files. */
async function rainSection() {
  section('28. the morning rainfall total, and the invented year that is gone');

  /* THE READING HAD TO STOP BEING INVENTED BEFORE THIS COULD EXIST. The farm's
     rain log shipped pre-loaded with a fabricated year, generated so the chart
     would not look empty. Harmless while it was only a chart. The moment a
     number out of it is sent to twenty-three phones it is a record, and a
     record nobody measured is one nobody should be told. Dillon's call on
     2026-10-05 was to clear it out and read the weather service instead. */
  {
    const b = boot({});
    ok('the rain log no longer ships with invented readings',
       !b.win.localStorage.getItem('ut_rain'),
       String(b.win.localStorage.getItem('ut_rain') || '').slice(0, 80));
    shut(b);
  }

  /* The weather service is stood in for, because what is being checked is what
     the farm is TOLD, not whether Knoxville reported rain this morning. */
  function morning(hourlyMm, hour) {
    const b = boot({});
    b.n.signIn(b.n.RST_LOGIN.manager);
    b.win.fetch = () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        features: (hourlyMm || []).map(v => ({ properties: { precipitationLastHour: { value: v } } }))
      })
    });
    const d = new Date();
    d.setHours(hour === undefined ? 7 : hour, 30, 0, 0);
    return { b, run: () => b.n.rainMorning(b.n.RST_LOGIN.manager, d.getTime()) };
  }

  /* 10.16 + 11.18 mm is 21.34, which is 0.84 of an inch. */
  let m = morning([10.16, 11.18, null, 0]);
  await m.run();
  let rows = m.b.n.ntf().list;
  ok('a wet night is reported', rows.length === 1, String(rows.length));
  ok('in inches, to two places', rows[0] && /0\.84/.test(rows[0].ttl), rows[0] && rows[0].ttl);
  ok('and it says where the figure came from',
     rows[0] && /National Weather Service/.test(rows[0].note), rows[0] && rows[0].note);
  await m.run();
  ok('and it is not said again the same day', m.b.n.ntf().list.length === 1,
     String(m.b.n.ntf().list.length));
  shut(m.b);

  /* NOTHING ON A DRY MORNING, which is what Dillon asked for in those words. */
  m = morning([0, 0, null]);
  await m.run();
  ok('a dry night says nothing at all', m.b.n.ntf().list.length === 0,
     m.b.n.ntf().list.map(e => e.k).join(','));
  shut(m.b);

  m = morning([]);
  await m.run();
  ok('and so does a service with nothing to report', m.b.n.ntf().list.length === 0,
     m.b.n.ntf().list.map(e => e.k).join(','));
  shut(m.b);

  /* A SERVICE HAVING A BAD DAY MUST NOT PRODUCE A GUESS. Silence is the only
     honest answer to "how much rain fell" when nobody knows. */
  {
    const b = boot({});
    b.n.signIn(b.n.RST_LOGIN.manager);
    b.win.fetch = () => Promise.reject(new Error('no signal'));
    const d = new Date(); d.setHours(7, 30, 0, 0);
    await b.n.rainMorning(b.n.RST_LOGIN.manager, d.getTime());
    ok('a weather service that cannot be reached says nothing',
       b.n.ntf().list.length === 0, b.n.ntf().list.map(e => e.k).join(','));
    ok('and nothing threw', b.errs.length === 0, b.errs.join(' | '));
    shut(b);
  }

  /* It is a MORNING total. */
  m = morning([20], 3);
  await m.run();
  ok('nothing is said at three in the morning', m.b.n.ntf().list.length === 0,
     String(m.b.n.ntf().list.length));
  shut(m.b);
}

/* Written as a function and run at the very bottom, rather than as a block
   like every other section here. A bare `return` at the top level of one of
   these files leaves the WHOLE FILE -- so the sections after it never run and
   the summary never prints, which looks exactly like the tests hanging. */
async function flushSection() {
  section('24b. one message the sender will not take cannot silence the farm');

  /* THE FAILURE THIS PREVENTS. The queue goes out oldest first, so a message
     that can never be sent sits at the front and everything behind it waits.
     ONE bad message would quietly stop the whole farm being told anything,
     with nothing on any screen to say why -- the same shape as the stuck
     record sdbMaySend() exists for on the database side.

     The sender is stood in for here, because what matters is how the phone
     reads an ANSWER: a refusal that names a problem with the message itself
     will never pass, while a dead spot or an expired sign-in might. */
  function rig(status) {
    const b = boot({});
    const { n, win } = b;
    const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
    win.dbConfigured = () => true;
    win.fbAuth = () => ({ currentUser: { getIdToken: () => Promise.resolve('pretend-token') } });
    let calls = 0;
    win.fetch = () => { calls++; return Promise.resolve({ ok: false, status: status, json: () => Promise.resolve({}) }); };
    n.signIn(BILL);
    n.setTasks([task({ id: 'f1', assignee: null, createdBy: BILL })]);
    n.ntfScan();
    n.tasks()[0].assignee = STU;
    n.tasks()[0].assignedBy = BILL;
    n.ntfScan();
    n.queue(n.events(), Date.now());
    return { b, n, calls: () => calls };
  }

  /* A REFUSAL ABOUT THE MESSAGE ITSELF. Trying again tomorrow will not help,
     so it goes at once rather than blocking everything behind it. */
  {
    const r = rig(400);
    ok('there is something waiting to go', r.n.outbox().length === 1, String(r.n.outbox().length));
    await r.n.flush();
    ok('a message the sender will never accept is dropped straight away',
       r.n.outbox().length === 0, String(r.n.outbox().length));
    ok('and it was really offered first', r.calls() === 1, String(r.calls()));
  }

  /* A DEAD SPOT, or a sign-in that has gone stale. Both pass on their own, so
     the message waits -- but not for ever, because a queue that never empties
     is the same silence by a slower route. */
  {
    const r = rig(503);
    await r.n.flush();
    ok('a message that failed for a reason that might pass is kept',
       r.n.outbox().length === 1, String(r.n.outbox().length));
    let rounds = 1;
    while (r.n.outbox().length && rounds < r.n.triesMax() + 3) { rounds++; await r.n.flush(); }
    ok('but it is given up on after a few goes rather than blocking the queue',
       r.n.outbox().length === 0, String(r.n.outbox().length));
    ok('and that took several attempts, not one', rounds >= r.n.triesMax(), String(rounds));
    ok('nothing threw', r.b.errs.length === 0, r.b.errs.join(' | '));
  }

  /* AND THE ONE THAT MUST NOT BE GIVEN UP ON LIGHTLY: a phone with no signal
     never reaches the sender at all, and its news has to survive that. */
  {
    const b = boot({});
    const { n, win } = b;
    const BILL = n.RST_LOGIN.manager, STU = n.RST_LOGIN.undergrad;
    win.dbConfigured = () => true;
    win.fbAuth = () => ({ currentUser: { getIdToken: () => Promise.resolve('pretend-token') } });
    win.fetch = () => Promise.reject(new Error('no signal'));
    n.signIn(BILL);
    n.setTasks([task({ id: 'f2', assignee: null, createdBy: BILL })]);
    n.ntfScan();
    n.tasks()[0].assignee = STU;
    n.tasks()[0].assignedBy = BILL;
    n.ntfScan();
    n.queue(n.events(), Date.now());
    await n.flush();
    ok('news noticed in a dead spot is still waiting afterwards',
       n.outbox().length === 1, String(n.outbox().length));
  }
}

section('25. this phone says honestly whether it can buzz at all');
{
  const b = boot({});
  /* jsdom has no push support, which is the same situation as an old browser
     on somebody's laptop -- and the answer has to be a plain word rather than
     a crash or a silent nothing. */
  const st = b.n.pushState();
  ok('it gives one of the words the screen knows how to explain',
     ['nosender','needs-install','unsupported','blocked','off','on'].indexOf(st) >= 0, st);
  ok('the sender address is set', /^https:\/\//.test(b.win.PUSH_URL || ''), String(b.win.PUSH_URL));
  b.n.go('notifsettings');
  /* textContent, not innerText: the test harness is not a real browser and
     has no idea how a page would LOOK, so innerText is simply not there. */
  const t = b.doc.getElementById('nts-body').textContent || '';
  ok('the screen has a row for this phone', /Buzz this phone/.test(t), t.slice(0, 120));
  ok('and it says what the situation is rather than failing quietly',
     /bell inside the app|home screen|blocked|Turn on|Turn off|Not set up/.test(t), t.slice(0, 200));
}

rainSection()
  .catch(e => { console.log('  FAIL  the rainfall section threw: ' + e.message); fail++; })
  .then(flushSection)
  .catch(e => { console.log('  FAIL  the queue section threw: ' + e.message); fail++; })
  .then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
