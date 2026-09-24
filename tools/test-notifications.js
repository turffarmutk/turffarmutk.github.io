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
      + 'ntfReqFor:function(t,me){return ntfReqFor(t,me);}'
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

  /* Each switch works on its own. */
  const kinds = ['tasks', 'done', 'partial', 'reqnew', 'reqok', 'reqdone'];
  const live = n.NOTIF_ALERTS.filter(a => a.live).map(a => a.k);
  ok('all six are marked as really sending', live.join(',') === kinds.join(','), live.join(','));
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

section('6e. the six dot colours survive colour-blind mode');
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
    seen[map[hex] + '/' + shape[hex]] = (seen[map[hex] + '/' + shape[hex]] || 0) + 1;
  });
  /* done and reqdone share one on purpose; everything else is distinct. */
  ok('five distinct colour-and-shape pairs across six alerts',
     Object.keys(seen).length === 5, Object.keys(seen).join(' '));
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
  ok('six alerts are marked as really sending',
     live === 'tasks,done,partial,reqnew,reqok,reqdone', live);
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
