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
      /* What the walks decided, with the audience on each one -- the half the
         sender uses and the bell does not. */
      + 'events:function(){return NTF_EVENTS;},eventId:ntfEventId,'
      + 'eventText:function(e){return ntfEventText(e,Date.now());},'
      + 'switchOf:ntfSwitchOf,pushState:pushState,pushPrefs:pushPrefs,'
      + 'queue:function(e,n){return pushQueue(e,n);},flush:pushFlush,'
      + 'triesMax:function(){return PUSH_TRIES_MAX;},outbox:function(){'
      + 'try{return JSON.parse(localStorage.getItem(\'ut_push_out\')||\'[]\');}catch(x){return [];}}'
      + '};');
  } catch (e) { console.log('app script threw: ' + e.message); fail++; }
  return { win, doc: win.document, n: win.__n || {}, errs };
}

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
  const kinds = ('tasks,done,partial,reqnew,reqok,reqdone,equip,eqflag,low,trials,'
               + 'clockin,clockout,shiftauto,shiftask').split(',');
  const live = n.NOTIF_ALERTS.filter(a => a.live).map(a => a.k);
  ok('all fourteen are marked as really sending', live.join(',') === kinds.join(','), live.join(','));
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
  const DELIBERATE = ['done+reqdone+equp+resopen', 'partial+eqflag',
                      'reqnew+resclose', 'shiftauto+low', 'shiftask+eqdown'];
  const shared = Object.keys(seen).filter(p => seen[p].length > 1).map(p => seen[p].join('+'));
  const stray = shared.filter(g => DELIBERATE.indexOf(g) < 0);
  ok('every shared colour and shape is one of the deliberate groups',
     stray.length === 0, stray.join(' | ') || 'none');
  ok('and all five groups are still there',
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

  /* Every alert that really sends something today is a Task Board one, and
     all six of them are under that heading rather than scattered. */
  const board = n.NOTIF_ALERTS.filter(a => a.g === 'Task board').map(a => a.k).join(',');
  ok('all six working alerts are on the Task board',
     board === 'tasks,done,partial,reqnew,reqok,reqdone', board);
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
  ok('fourteen alerts are marked as really sending',
     live === 'tasks,done,partial,reqnew,reqok,reqdone,equip,eqflag,low,trials,'
            + 'clockin,clockout,shiftauto,shiftask', live);
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

  /* A restriction that has not started yet is not standing on anything. */
  const future = '2099-01-01';
  study.restrictions.push({ id: 'r-ntf2', type: 'herbicide', scope: 'CAFS15',
                            start: future, end: '', by: 'Somebody Else' });
  ok('a restriction starting next year closes nothing today', n.ntfScan() === 0);

  /* AND THE TRAP: a study that is GONE says nothing. Its ground is open, but
     "CAFS16 is open again" from a record nobody can look at any more is a
     sentence with no answer behind it. */
  const gone = { id: 's-ntf2', title: 'Shade study', lab: 'Brosnan', stage: 'active',
                 start: today, end: '', plots: ['CAFS16'],
                 restrictions: [{ id: 'r-ntf3', type: 'mow', scope: 'CAFS16',
                                  start: today, end: '', by: 'Somebody Else' }] };
  n.trials().push(gone);
  ok('its restriction closes the ground', n.ntfScan() === 1);
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

flushSection()
  .catch(e => { console.log('  FAIL  the queue section threw: ' + e.message); fail++; })
  .then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
