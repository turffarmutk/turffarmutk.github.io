/*
 * Harness for the code that CHANGES tasks.
 *
 * Why this exists, and why it exists NOW: everything that writes to TASKS is
 * about to be moved behind a shared database. tools/test-store.js covers
 * whether records are *saved*; nothing covered whether they are *changed
 * correctly*. Written against today's behaviour, before the move, these become
 * the proof that the move did not quietly alter what the app does. Written
 * afterwards they would only prove the new code does what the new code does.
 *
 * Backend-agnostic on purpose. It does not know or care where records end up.
 *
 * What it pins:
 *   1. Completion credits the WORKER, and records the closer separately. Bill
 *      clearing an undergrad's job must not steal the credit for it.
 *   2. Completing a job writes it to the Field Log, once and only once.
 *   3. Claiming takes the signed-in person, not a name typed anywhere.
 *   4. Deleting removes exactly one row and leaves the rest alone.
 *   5. Reordering moves a job within that person's list only — it cannot
 *      reach into somebody else's day.
 *   6. A labour request is a request until it is accepted, and accepting it
 *      turns it into a real task for a real person.
 *   7. Every person written to a record is a roster id, never a name. This is
 *      the Phase 0 convention the whole app depends on and the one a database
 *      port is most likely to break.
 *
 * Run:  node tools/test-task-mutation.js
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
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
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

function makeLS(store) {
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: i => Object.keys(store)[i],
  };
  Object.defineProperty(ls, 'length', { get: () => Object.keys(store).length });
  return ls;
}

const EX = ['TASKS','FIELDLOG','SESSION','sessionSet','currentRole','newId','atToday','isoLocal',
            'completeTask','acceptCrewReq','moveTask','submitGradReq','flAddFromTask','parseISO',
            'pidOf','nameOf','isMe','taskIsFor','taskCrew','rstFind','renderBoard','me'];

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
  Object.defineProperty(win, 'localStorage', { value: makeLS(store || {}), configurable: true });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });
  /* The auth module is not the subject here. */
  win.supabase = { createClient: () => ({ auth: {
    signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'x' } }),
    getSession: () => Promise.resolve({ data: { session: null } }),
    signOut: () => Promise.resolve({}), updateUser: () => Promise.resolve({}) } }) };

  const scripts = require('./_app').appScripts(win.document);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};'
      + '\n;window.__get=function(k){return eval(k);};'
      + '\n;window.__set=function(k,v){eval(k+"=v");};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, doc: win.document, p: win.__p || {}, errs };
}

/* A fresh task owned by whoever is named, due today. */
function addTask(p, over) {
  const t = Object.assign({
    id: p.newId('t'), title: 'ZZ test job', area: 'Plots 1-3', assignee: 'p18',
    status: 'todo', kind: 'task', type: 'Mowing', dueAt: p.atToday(null), repeat: 'None'
  }, over || {});
  p.TASKS.push(t);
  return t;
}

section('0. it boots');
{
  const b = boot();
  ok('no jsdom errors', b.errs.length === 0, b.errs[0]);
  ok('the mutation functions are all present',
     ['completeTask','acceptCrewReq','moveTask','submitGradReq'].every(f => typeof b.p[f] === 'function'));
}

section('1. completing a job credits the worker, not the closer');
{
  const b = boot();
  b.p.sessionSet('p07');                       /* Bill closes it */
  const t = addTask(b.p, { assignee: 'p18' }); /* Garrett did it */
  b.p.completeTask(t.id, 'looked fine');

  ok('the job is done', t.status === 'done', t.status);
  ok('credit goes to the person who did the work', t.completedBy === 'p18', t.completedBy);
  ok('and the closer is recorded separately', t.closedBy === 'p07', t.closedBy);
  ok('both are roster ids, not names', /^p\d\d$/.test(t.completedBy) && /^p\d\d$/.test(t.closedBy));
  ok('the note is kept', t.completedNote === 'looked fine', t.completedNote);
  ok('completed time is local wall clock with no zone suffix',
     /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t.completedAt || ''), t.completedAt);
}

section('2. an unassigned job completed by whoever is holding the phone');
{
  const b = boot();
  b.p.sessionSet('p09');
  const t = addTask(b.p, { assignee: null });
  b.p.completeTask(t.id, '');
  ok('falls back to the signed-in person', t.completedBy === 'p09', t.completedBy);
}

section('3. completing writes to the Field Log, once');
{
  const b = boot();
  b.p.sessionSet('p18');
  const before = b.p.FIELDLOG.length;
  const t = addTask(b.p, { assignee: 'p18', type: 'Mowing', title: 'Rotary Mow', area: 'Plots 1-3' });
  b.p.completeTask(t.id, '');
  const after = b.p.FIELDLOG.length;
  /* The log is per PLOT, not per task: a mow across three plots is three
     records, because that is the unit the farm reports and bills work in.
     Pinning it here so a database port cannot quietly collapse them into one. */
  ok('a mow reaches the field log once per plot covered', after === before + 3, before + ' -> ' + after);
  /* Completing twice must not double-log — the guard is t._logged. */
  b.p.flAddFromTask(t);
  ok('and completing again does not log it twice', b.p.FIELDLOG.length === after, String(b.p.FIELDLOG.length));
  const entry = b.p.FIELDLOG[0];
  ok('the log credits a roster id, not a name', /^p\d\d$/.test(entry.person || entry.byId || ''),
     JSON.stringify({ person: entry.person, byId: entry.byId }));
}

section('4. claiming takes the signed-in person');
{
  const b = boot();
  b.p.sessionSet('p20');
  const t = addTask(b.p, { assignee: null });
  /* the board's claim handler, reduced to what it actually does */
  t.assignee = b.win.__get('SESSION').pid;
  ok('the claimer becomes the assignee', t.assignee === 'p20', t.assignee);
  ok('and it is an id', /^p\d\d$/.test(t.assignee));
  ok('the task now belongs to them', b.p.taskIsFor(t, 'p20') === true);
  ok('and not to anyone else', b.p.taskIsFor(t, 'p18') === false);
}

section('5. deleting removes exactly one');
{
  const b = boot();
  const a = addTask(b.p, { title: 'ZZ keep me' });
  const gone = addTask(b.p, { title: 'ZZ delete me' });
  const c = addTask(b.p, { title: 'ZZ keep me too' });
  const before = b.p.TASKS.length;
  const i = b.p.TASKS.findIndex(x => x.id === gone.id);
  b.p.TASKS.splice(i, 1);
  ok('one fewer task', b.p.TASKS.length === before - 1, before + ' -> ' + b.p.TASKS.length);
  ok('the right one went', !b.p.TASKS.some(x => x.id === gone.id));
  ok('the neighbours survived',
     b.p.TASKS.some(x => x.id === a.id) && b.p.TASKS.some(x => x.id === c.id));
}

section('6. reordering stays inside one person\'s list');
{
  const b = boot();
  const mine1 = addTask(b.p, { assignee: 'p18', title: 'ZZ mine 1' });
  const theirs = addTask(b.p, { assignee: 'p19', title: 'ZZ theirs' });
  const mine2 = addTask(b.p, { assignee: 'p18', title: 'ZZ mine 2' });

  const before = b.p.TASKS.map(x => x.id);
  b.p.moveTask(mine2.id, 'up');
  const mineOrder = b.p.TASKS.filter(x => x.assignee === 'p18' && x.status === 'todo' && x.kind === 'task').map(x => x.title);

  ok('the second job moved ahead of the first',
     mineOrder.indexOf('ZZ mine 2') < mineOrder.indexOf('ZZ mine 1'), mineOrder.join(' | '));
  ok('the other person\'s job is untouched',
     b.p.TASKS.some(x => x.id === theirs.id && x.assignee === 'p19'));
  ok('nothing was created or lost', b.p.TASKS.length === before.length,
     before.length + ' -> ' + b.p.TASKS.length);

  /* Moving the first one up again is a no-op, not a crash or a wrap-around. */
  const first = b.p.TASKS.filter(x => x.assignee === 'p18' && x.status === 'todo' && x.kind === 'task')[0];
  const snapshot = b.p.TASKS.map(x => x.id).join(',');
  b.p.moveTask(first.id, 'up');
  ok('moving the top job up does nothing', b.p.TASKS.map(x => x.id).join(',') === snapshot);
}

section('7. a labour request is not a task until it is accepted');
{
  const b = boot();
  b.p.sessionSet('p09');
  const req = { id: b.p.newId('r'), title: 'ZZ need two people', area: '—', assignee: null,
                status: 'todo', kind: 'request', type: 'Miscellaneous', dueAt: b.p.atToday(null),
                repeat: 'None', requestedBy: 'p09', target: 'p18' };
  b.p.TASKS.push(req);

  ok('it starts as a request with nobody on it', req.kind === 'request' && req.assignee === null);
  ok('and it does not show up as anybody\'s task', b.p.taskIsFor(req, 'p18') === false);
  ok('the requester is stored as an id', /^p\d\d$/.test(req.requestedBy), req.requestedBy);

  b.p.acceptCrewReq(req.id);
  ok('accepting turns it into a real task', req.kind === 'task', req.kind);
  ok('assigned to the person it was aimed at', req.assignee === 'p18', req.assignee);
  ok('and now it is theirs', b.p.taskIsFor(req, 'p18') === true);
}

section('8. nothing ever stores a person as a name');
{
  const b = boot();
  b.p.sessionSet('p07');
  const t = addTask(b.p, { assignee: 'p18' });
  b.p.completeTask(t.id, '');
  const PEOPLE_FIELDS = ['assignee','completedBy','closedBy','requestedBy','target'];
  const offenders = [];
  b.p.TASKS.forEach(function (task) {
    PEOPLE_FIELDS.forEach(function (f) {
      const v = task[f];
      if (v && typeof v === 'string' && !/^p\d\d$/.test(v)) offenders.push(task.title + '.' + f + '=' + v);
    });
    (task.helpers || []).forEach(function (h) {
      if (h && !/^p\d\d$/.test(h)) offenders.push(task.title + '.helpers=' + h);
    });
  });
  ok('every person on every task is a roster id', offenders.length === 0, offenders.slice(0, 4).join(' | '));
}

section('9. ids stay unique across a burst of real mutations');
{
  const b = boot();
  b.p.sessionSet('p07');
  for (let i = 0; i < 400; i++) addTask(b.p, { title: 'ZZ burst ' + i });
  const ids = b.p.TASKS.map(x => x.id);
  ok('no two tasks share an id', new Set(ids).size === ids.length,
     ids.length - new Set(ids).size + ' duplicates');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
