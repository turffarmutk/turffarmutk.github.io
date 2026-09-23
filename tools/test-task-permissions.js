/*
 * Harness for taskCan() — who may do what with a task.
 *
 * This is the farm's organisation chart expressed as code, and it is the one
 * rule where being wrong is not a cosmetic bug: it decides whether an undergrad
 * can put work on Bill's list, and whether the Farm Manager can order a grad
 * student around when in fact that person answers to their faculty advisor.
 *
 * The table below is exhaustive on purpose — every role assigning to every
 * other role, in and out of lab. When these rules move into the database they
 * will be a transcription of this, so this is what proves them.
 *
 * Run:  node tools/test-task-permissions.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;
const noop = () => {};
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'getBounds' ? () => ({ getSouthWest: () => ({ lat: 0, lng: 0 }), getNorthEast: () => ({ lat: 0, lng: 0 }),
                                               getCenter: () => ({ lat: 0, lng: 0 }), extend() { return this; }, pad() { return this; } })
                 : (k === 'getZoom' || k === 'getMaxZoom' || k === 'getBoundsZoom') ? () => 20
                 : (k === 'hasLayer') ? () => false : (k === 'getContainer') ? () => null : chain()),
  apply: () => chain()
});
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
/* TASKS, currentRole and tbTab are `let`, so they are global lexical bindings
   and never appear on `window`. Section 8d needs to set them to draw the board
   the way a faculty member sees it, so the app is handed two accessors that
   evaluate in its own scope -- the same shim tools/test-task-mutation.js uses
   and for the same reason. */
try { win.eval(appSource(win.document)
        + '\n;window.__get=function(k){return eval(k);};'
        + '\n;window.__set=function(k,v){eval(k+"=v");};'); }
catch (e) { console.log('app script threw: ' + e.message); fail++; }

const can = (a, act, t) => win.taskCan(a, act, t);
const to  = pid => ({ assignee: pid });

/* Cast, by role and lab (from the real roster):
     p07 Bill        Farm Manager
     p01 Dillon      Technician,        Sorochan  — holds assign_undergrads
     p16 Sorochan    Faculty,           Sorochan
     p13 Brosnan     Faculty,           Brosnan
     p02 Fielder     Technician,        Sorochan
     p05 Breeden     Technician,        Brosnan
     p09 Rose        Graduate Student,  Sorochan
     p12 Logan       Graduate Student,  Brosnan
     p18 Garrett     Undergraduate,     pool
     p23 Lauren      Undergraduate,     Brosnan  */

section('1. Bill directs undergrads, and only asks everyone else');
{
  ok('Bill assigns an undergrad', can('p07', 'assign', to('p18')));
  ok('Bill may NOT assign a technician', !can('p07', 'assign', to('p02')));
  ok('nor a grad student', !can('p07', 'assign', to('p09')));
  ok('nor a faculty member', !can('p07', 'assign', to('p16')));
  ok('but he can raise a request instead', can('p07', 'request', {}));
}

section('2. faculty direct their own lab, and nobody else\'s');
{
  ok('Sorochan assigns his own technician', can('p16', 'assign', to('p02')));
  ok('and his own grad student', can('p16', 'assign', to('p09')));
  ok('but NOT another lab\'s technician', !can('p16', 'assign', to('p05')));
  ok('nor another lab\'s grad student', !can('p16', 'assign', to('p12')));
  ok('and an undergrad in his own lab, who answers to it', can('p13', 'assign', to('p23')));
  ok('faculty may not assign the Farm Manager', !can('p16', 'assign', to('p07')));
}

section('3. techs and grads assign only themselves');
{
  ok('a technician self-assigns', can('p02', 'assign', to('p02')));
  ok('a grad student self-assigns', can('p09', 'assign', to('p09')));
  ok('a technician may NOT assign a colleague in the same lab', !can('p02', 'assign', to('p09')));
  ok('nor their own faculty advisor', !can('p02', 'assign', to('p16')));
  ok('nor a pooled undergrad', !can('p02', 'assign', to('p18')));
  ok('nor another lab\'s undergrad', !can('p02', 'assign', to('p23')));
  ok('but they can ask for undergrad help', can('p02', 'request', {}));
}

section('4. undergrads receive work and nothing else');
{
  ok('an undergrad cannot create a task', !can('p18', 'create', {}));
  ok('nor raise a request', !can('p18', 'request', {}));
  ok('nor assign themselves', !can('p18', 'assign', to('p18')));
  ok('nor assign another undergrad', !can('p18', 'assign', to('p20')));
  ok('nor claim from the pool', !can('p18', 'claim', { assignee: null }));
  ok('but they DO complete what they are given',
     can('p18', 'complete', { assignee: 'p18', kind: 'task' }));
  ok('and not somebody else\'s job',
     !can('p18', 'complete', { assignee: 'p20', kind: 'task' }));
}

section('5. the undergrad job can be handed over');
{
  ok('Dillon holds it today, so he can assign an undergrad', can('p01', 'assign', to('p18')));
  ok('another technician cannot', !can('p02', 'assign', to('p18')));
  ok('it is a grant on the person, not the words "Farm Manager"',
     win.assignsUndergrads('p01') && win.assignsUndergrads('p07') && !win.assignsUndergrads('p02'));
  /* Bill hands it to Rose while he is away, and takes it back. */
  const rose = win.rstFind('p09');
  rose.grants = ['assign_undergrads'];
  ok('handing it over works immediately', can('p09', 'assign', to('p18')));
  delete rose.grants;
  ok('and taking it back does too', !can('p09', 'assign', to('p18')));
}

section('6. the pool');
{
  const pool = { assignee: null, kind: 'request' };
  ok('a technician can claim', can('p02', 'claim', pool));
  ok('a grad student can claim', can('p09', 'claim', pool));
  ok('Bill can pull one off the pool', can('p07', 'claim', pool));
  ok('an undergrad cannot', !can('p18', 'claim', pool));
  ok('nothing already taken can be claimed', !can('p02', 'claim', { assignee: 'p09' }));
}

section('7. editing, and who closes a job');
{
  ok('Bill edits anything', can('p07', 'edit', { assignee: 'p09', createdBy: 'p16' }));
  ok('the person who raised it can edit it', can('p16', 'edit', { createdBy: 'p16' }));
  ok('a stranger cannot', !can('p05', 'edit', { assignee: 'p09', createdBy: 'p16' }));
  ok('Bill can close a job on the worker\'s behalf',
     can('p07', 'complete', { assignee: 'p18', kind: 'task' }));
  ok('a bystander cannot close it', !can('p05', 'complete', { assignee: 'p18', kind: 'task' }));
}

section('8. nobody who has left the roster can do anything');
{
  const p = win.rstFind('p02');
  p.active = false;
  ok('a deactivated person cannot assign themselves', !can('p02', 'assign', to('p02')));
  ok('nor create', !can('p02', 'create', {}));
  ok('nor claim', !can('p02', 'claim', { assignee: null }));
  p.active = true;
  ok('and reactivating restores them', can('p02', 'assign', to('p02')));

  ok('an unknown id is refused', !can('p99', 'create', {}));
  ok('so is an empty one', !can('', 'create', {}) && !can(null, 'create', {}));
  ok('an unknown action is refused, not allowed by default',
     !can('p07', 'launch_the_missiles', to('p18')));
}

section('8b. a lab-assigned undergrad answers to their lab');
{
  /* Dillon, 2026-08-25. Lauren (p23) is an undergrad in Brosnan's lab. The
     other five carry Bill's own lab, which is how the pool is expressed, so
     this exception does not reach them. */
  ok('her faculty advisor can put her on a job',      can('p13', 'assign', to('p23')));
  ok('so can a technician in her lab',                can('p05', 'assign', to('p23')));
  ok('and a grad student in her lab',                 can('p12', 'assign', to('p23')));
  ok('Bill still can, as he always could',            can('p07', 'assign', to('p23')));
  ok('another undergrad in her lab still cannot',     !can('p23', 'assign', to('p23')));
  ok('a technician in a DIFFERENT lab cannot',        !can('p02', 'assign', to('p23')));
  ok('faculty in a different lab cannot',             !can('p16', 'assign', to('p23')));

  /* The pool is untouched: only the job-holder hands those five out. */
  ok('a Brosnan technician cannot take a pooled undergrad',  !can('p05', 'assign', to('p18')));
  ok('a Sorochan faculty member cannot either',              !can('p16', 'assign', to('p20')));
  ok('Bill can, because he holds the job',                   can('p07', 'assign', to('p20')));
}

/* CANCELLING A REQUEST YOU RAISED - Dillon, 2026-09-23.

   Bill asks a grad or a technician for help; a grad or a technician asks Bill
   for an undergrad. Either of them can now take that request back, from the
   bin on the row. taskCan() already said they could -- the button was what was
   missing -- so what this section guards is that the BUTTON and the RULE keep
   giving the same answer.

   The thing to get wrong here is drawing a bin that does nothing. reqDelBtn()
   is the only thing deciding whether it appears, and deleteTask() is the only
   thing deciding whether the removal happens; if those two ever disagree,
   somebody taps a bin and watches the row stay put with no explanation. So
   every case below checks them together.

   The finished-job case is the one that is not about permission at all: a
   completed request is the farm's record of work that actually happened, and
   the Requests tab is the one screen where it could have been quietly
   deleted. No bin there, on purpose. */
section('8c. taking back a request you raised');
{
  const bin = (me, t) => { win.SESSION.pid = me; return win.reqDelBtn(t) !== ''; };
  const req = (by, extra) => Object.assign(
    { id: 'rq1', title: 'Mow the alleys', kind: 'request', status: 'todo',
      assignee: null, createdBy: by, requestedBy: by }, extra || {});

  ok('Bill gets a bin on the request he sent a grad',  bin('p07', req('p07', { origin: 'manager', target: 'p09' })));
  ok('a grad gets one on the request she sent Bill',   bin('p09', req('p09')));
  ok('so does a technician',                           bin('p02', req('p02')));
  ok('and the rule agrees in all three cases',
     can('p07', 'delete', req('p07')) && can('p09', 'delete', req('p09')) && can('p02', 'delete', req('p02')));

  ok('no bin on somebody ELSE\'s request',             !bin('p02', req('p09')));
  ok('and the rule refuses that one too',              !can('p02', 'delete', req('p09')));

  ok('no bin on a FINISHED job -- that is the record', !bin('p09', req('p09', { status: 'done' })));
  ok('even for Bill, who may delete anything else',    !bin('p07', req('p09', { status: 'done' })));

  /* Still cancellable once Bill has handed it to an undergrad: the point of
     cancelling is usually that the work is no longer wanted, and the app asks
     first and says the job comes off that person's list. */
  ok('still there once an undergrad is on it',
     bin('p09', req('p09', { kind: 'task', assignee: 'p18' })));

  /* A request raised before the app started stamping createdBy has no author
     the database recognises, so a bin on it would be refused on the way up. */
  ok('no bin on a request with no author on record',
     !bin('p09', { id: 'rq0', title: 'Old one', kind: 'request', status: 'todo', assignee: null, requestedBy: 'p09' }));

  ok('a deactivated person gets no bin on their own old request', (function () {
    const p = win.rstFind('p09'); p.active = false;
    const b = bin('p09', req('p09')); p.active = true; return !b;
  })());

  /* FACULTY - Dillon, 2026-09-23: "anyone" means anyone. They raise requests
     through the same form and the same fields, so the same bin applies. Their
     tab used to be a single read-only list of the whole farm's open requests
     with no row of their own on it at all, which is why they were the one role
     left out when the bin first shipped. */
  ok('faculty get a bin on the request THEY raised',   bin('p16', req('p16')));
  ok('and the rule agrees',                            can('p16', 'delete', req('p16')));
  ok('but not on another lab\'s request',              !bin('p16', req('p12')));
  ok('nor on a finished one of their own',             !bin('p16', req('p16', { status: 'done' })));

  /* Faculty CAN delete work sitting on their own lab's people -- a separate
     clause in taskCan() that predates all of this. Worth pinning: it is the
     one case where the bin appears on something they did not raise, and it is
     deliberate, not a leak. */
  ok('faculty may still remove work on their own lab member',
     can('p16', 'delete', req('p09', { kind: 'task', assignee: 'p09' })));
  ok('but not on another lab\'s',
     !can('p16', 'delete', req('p12', { kind: 'task', assignee: 'p12' })));

  /* The two rows that draw it, so a future tidy-up of either cannot drop it. */
  win.SESSION.pid = 'p09';
  ok('the "Sent to Bill" row carries the bin',
     win.gradReqRow(req('p09')).indexOf('data-reqdel="rq1"') >= 0);
  win.SESSION.pid = 'p07';
  ok('and so does Bill\'s "Sent to grad / tech" row',
     win.billSentRow(req('p07', { origin: 'manager', target: 'p09' })).indexOf('data-reqdel="rq1"') >= 0);
  win.SESSION.pid = null;
}

/* THE FACULTY REQUESTS TAB, AS IT IS ACTUALLY DRAWN.
   The section above proves the button is allowed; this proves it is on the
   screen. They are different failures: faculty had the right to cancel all
   along, and still could not, because the tab never drew a row of their own
   for the bin to sit on. A permission nobody can reach is not a permission. */
section('8d. the faculty Requests tab lists their own requests');
{
  const mine  = { id: 'fq1', title: 'Two students on the alleys', kind: 'request', status: 'todo',
                  assignee: null, origin: 'crew', createdBy: 'p16', requestedBy: 'p16', students: 2 };
  const hers  = { id: 'fq2', title: 'Somebody else asked for this', kind: 'request', status: 'todo',
                  assignee: null, origin: 'crew', createdBy: 'p09', requestedBy: 'p09', students: 3 };
  const fromBill = { id: 'fq3', title: 'Bill asked a grad', kind: 'request', status: 'todo',
                     assignee: null, origin: 'manager', target: 'p09', createdBy: 'p07', requestedBy: 'p07' };
  const TASKS = win.__get('TASKS');
  const keep = TASKS.slice();
  TASKS.length = 0;
  TASKS.push(mine, hers, fromBill);

  const draw = (pid, role) => {
    win.SESSION.pid = pid; win.__set('currentRole', role); win.__set('tbTab', 'requests');
    win.renderBoard();
    const b = win.document.getElementById('tb-body');
    return { html: b.innerHTML,
             secs: [...b.querySelectorAll('.sec')].map(e => e.textContent.trim()) };
  };

  const fac = draw('p16', 'faculty');
  ok('their own requests get a section of their own',
     fac.secs.some(t => /Sent to Bill/.test(t)), fac.secs.join(' | '));
  ok('with a bin on the one they raised',        fac.html.indexOf('data-reqdel="fq1"') >= 0);
  ok('the farm\'s open queue is still there',     fac.secs.some(t => /open requests/i.test(t)));
  ok('somebody else\'s request is in it',         fac.html.indexOf('Somebody else asked') >= 0);
  ok('and carries no bin',                        fac.html.indexOf('data-reqdel="fq2"') < 0);
  ok('their own is not listed twice',
     fac.html.split('Two students on the alleys').length - 1 === 1);
  /* Bill's request form only offers grads and technicians, so this section
     would be permanently empty for faculty and is left out rather than drawn. */
  ok('no empty "From Bill" section for faculty', !fac.secs.some(t => /From Bill/.test(t)));
  /* The raw roster id used to be printed here -- "p09 · needs 3". */
  ok('the asker is named, not printed as an id',
     fac.html.indexOf('Rose') >= 0 && !/>p09/.test(fac.html));

  const grad = draw('p09', 'grad');
  ok('a grad student still gets the "From Bill" section',
     grad.secs.some(t => /From Bill/.test(t)), grad.secs.join(' | '));
  ok('and can still accept from it',              grad.html.indexOf('data-accept="fq3"') >= 0);
  ok('with a bin on what they raised',            grad.html.indexOf('data-reqdel="fq2"') >= 0);
  ok('and none on what Bill sent them',           grad.html.indexOf('data-reqdel="fq3"') < 0);

  const bill = draw('p07', 'manager');
  ok('Bill\'s two sections are unchanged',
     bill.secs.some(t => /From crew/.test(t)) && bill.secs.some(t => /Sent to grad/.test(t)),
     bill.secs.join(' | '));
  ok('with a bin on the one he sent',             bill.html.indexOf('data-reqdel="fq3"') >= 0);

  TASKS.length = 0; keep.forEach(t => TASKS.push(t));
  win.SESSION.pid = null;
}

section('9. the whole grid, so nothing is allowed by accident');
{
  /* Every actor against every target. Anything true that is not in this list
     is a rule nobody wrote down. */
  const expected = new Set([
    'p07>p18','p07>p19','p07>p20','p07>p21','p07>p22','p07>p23','p07>p24',   /* Bill -> undergrads */
    'p01>p18','p01>p19','p01>p20','p01>p21','p01>p22','p01>p23','p01>p24',   /* Dillon holds the grant */
    'p13>p05','p13>p06','p13>p12','p13>p23',                        /* Brosnan -> own lab */
    'p05>p23','p06>p23','p12>p23',                                  /* ...and Lauren's lab-mates */
    'p14>p08',                                                      /* Horvath -> own lab */
    'p15>p10','p15>p11',                                            /* Bowling -> own lab */
    'p16>p01','p16>p02','p16>p03','p16>p04','p16>p09',              /* Sorochan -> own lab */
  ]);
  const people = win.PEOPLE.map(p => p.id);
  const got = [];
  people.forEach(a => people.forEach(b => {
    if (a !== b && can(a, 'assign', to(b))) got.push(a + '>' + b);
  }));
  const extra = got.filter(k => !expected.has(k));
  const missing = [...expected].filter(k => !got.includes(k));
  ok('nothing is permitted that was not asked for', extra.length === 0, extra.join(' '));
  ok('and everything that was asked for is permitted', missing.length === 0, missing.join(' '));

  const self = people.filter(a => can(a, 'assign', to(a)));
  const undergrads = win.PEOPLE.filter(p => p.role === 'Undergraduate Student').map(p => p.id);
  ok('everyone but the undergrads can take a job themselves',
     self.length === people.length - undergrads.length, self.length + ' of ' + people.length);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
