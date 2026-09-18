/*
 * The alleys, painted as they are mown.  Added 2026-09-18.
 *
 * WHAT CHANGED. The alley job used to be ten zones, each claimed and ticked
 * off. Dillon asked for the alleys to be ONE shape, with what has been mown
 * painted on it -- by the phone's GPS as the mower drives, and by a finger
 * where the GPS got it wrong -- and for the job to be finishable once 80% of
 * the alleys is painted, so nobody has to chase the last few feet.
 *
 * The paint belongs to the task, in the shared database, so:
 *   - two people on the alleys at once see each other's paint, and
 *   - Bill can hand an unfinished alley job to somebody else tomorrow, and
 *     they see only the ground still unpainted.
 *
 * WHAT THIS PROVES
 *   1. The alley shape is measured properly (the grid matches its real area).
 *   2. Paint on the alleys counts; paint off them (the road from the shop)
 *      does not.
 *   3. 80% finishes the job, 79% does not.
 *   4. Undo takes back your own finger paint and nothing else.
 *   5. GPS paint: a vague fix does not paint, a dropout does not draw a line
 *      across ground nobody mowed, and a stroke is closed off every minute.
 *   6. The drawer goes quiet -- the lesson of 2026-08-31, when a drawer that
 *      never stopped talking spent 4.4 million reads in a day.
 *   7. A finished job stops being listened to by every phone.
 *   8. The rules file gates it the same way as the crew claims.
 *
 * Run:  node tools/test-paint.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ------------------------------------------------------- the fake db ---- */
const state = { writes: [], listeners: {}, where: [], refuse: false };
function docRef(coll, id) {
  return { id: String(id),
    set(data, opts) {
      state.writes.push({ coll, id: String(id), data: JSON.parse(JSON.stringify(data)), opts });
      return state.refuse ? Promise.reject({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })
                          : Promise.resolve();
    } };
}
const fakeDb = {
  enablePersistence() { return Promise.resolve(); },
  batch() { return { set() {}, commit() { return Promise.resolve(); } }; },
  collection(name) {
    const c = { doc: id => docRef(name, id),
      where(f, op, v) { state.where.push([name, f, op, v]); return c; },
      get() { return Promise.resolve({ size: 0, forEach() {} }); },
      onSnapshot(opts, next, err) { (state.listeners[name] = state.listeners[name] || []).push({ next, err }); return () => { state.listeners[name] = []; }; } };
    return c;
  },
  doc: p => docRef('_', p)
};
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { currentUser: { email: 'x@vols.utk.edu', getIdTokenResult: () => Promise.resolve({ claims: {} }) },
                    onAuthStateChanged() { return () => {}; } }; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = { delete: () => ({ __delete: true }) };

function reorder(o, how) {
  if (Array.isArray(o)) return o.map(x => reorder(x, how));
  if (o && typeof o === 'object') {
    const ks = Object.keys(o).sort(); if (how === 'reverse') ks.reverse();
    const out = {}; ks.forEach(k => { out[k] = reorder(o[k], how); }); return out;
  }
  return o;
}
function emit(coll, changes, how) {
  const snap = { metadata: { fromCache: false },
    docChanges: () => changes.map(c => ({ type: c.type || 'added',
      doc: { id: String(c.id), data: () => reorder(JSON.parse(JSON.stringify(c.data || {})), how) } })) };
  (state.listeners[coll] || []).slice().forEach(l => l.next(snap));
}
const paintWrites = () => state.writes.filter(w => w.coll === 'paint');
const reset = () => { state.writes.length = 0; };

/* ------------------------------------------------------------- boot ---- */
const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'), { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
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
win.firebase = fakeFirebase;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
try { win.eval(appSource(win.document) + '\n;window.__P={TASKS:TASKS};'); }
catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const P = 'p07';                  /* Bill */
win.sessionSet(P);
const TASKS = win.__P.TASKS;
function alleyTask(id) {
  const t = { id, title: 'Rotary - Alleys', type: 'Mow', area: 'Alleys & borders', plots: [win.ALLEY_UNIT],
              donePlots: [], status: 'todo', kind: 'task', assignee: P, desc: '' };
  TASKS.push(t); return t;
}
/* A line straight down the middle of one alley zone, as [lat,lng] points. */
function lineThrough(zone, n) {
  const b = turf.bbox(win.jobZoneFeature(zone)), x = (b[0] + b[2]) / 2, out = [];
  for (let i = 0; i <= n; i++) out.push([b[1] + (b[3] - b[1]) * i / n, x]);
  return out;
}

/* ------------------------------------------------------------------------ */
section('1. The alleys are measured properly');
const g = win.paintGrid();
ok('the grid was built', !!g && g.total > 0);
{
  const real = turf.area(win.ALLEYS_DATA);        /* square metres */
  ok('its cells add up to the real alley area (within 3%)', Math.abs(g.total - real) / real < 0.03,
     g.total + ' cells vs ' + Math.round(real) + ' m²');
}
{
  const t0 = Date.now(); win.PAINT_GRID = null; win.paintGrid();
  ok('building it is quick enough for a phone (<1500 ms here)', Date.now() - t0 < 1500, (Date.now() - t0) + ' ms');
}

section('2. Paint on the alleys counts; paint off them does not');
{
  const t = alleyTask('pt-2');
  ok('a new job starts at 0%', win.paintPct(t.id) === 0);
  win.paintAdd(t.id, { sid: 'h1', who: P, at: Date.now(), how: 'hand', w: 6, pts: lineThrough('AZ10', 40) });
  const p1 = win.paintPct(t.id);
  ok('a stroke down an alley adds to it', p1 > 0.001, (p1 * 100).toFixed(2) + '%');
  /* The middle of a field a mile away. */
  win.paintAdd(t.id, { sid: 'h2', who: P, at: Date.now(), how: 'hand', w: 6, pts: [[35.95, -83.90], [35.9501, -83.90]] });
  ok('a stroke off the alleys adds nothing', win.paintPct(t.id) === p1);
  win.paintAdd(t.id, { sid: 'h3', who: P, at: Date.now(), how: 'hand', w: 6, pts: lineThrough('AZ10', 40) });
  ok('painting the same strip twice does not count it twice', win.paintPct(t.id) === p1);
}

section('3. 80% finishes the job, and not a cell less');
{
  const t = alleyTask('pt-3');
  /* Sweep the whole alley box, a deck width apart, the way a mower would. */
  const b = [g.x0, g.y0], stepLat = 1.5 / g.ky, cols = g.cols * 1 / g.kx;
  const rows = [];
  for (let lat = g.y0; lat <= g.y0 + g.rows / g.ky; lat += stepLat) rows.push([[lat, g.x0], [lat, g.x0 + g.cols / g.kx]]);
  rows.forEach((r, i) => win.paintAdd(t.id, { sid: 's' + i, who: P, at: i, how: 'gps', w: 6, pts: r }));
  ok('sweeping all of it paints nearly all of it', win.paintPct(t.id) > 0.97, (win.paintPct(t.id) * 100).toFixed(1) + '%');
  ok('and the job can be finished', win.twPaintState(t).ready === true);

  const real = win.paintPct;
  win.paintPct = () => 0.7999;
  ok('at 79.99% it cannot', win.twPaintState(t).ready === false);
  ok('and the percentage reads as 79%, not rounded up to 80%', win.twPaintState(t).pctTxt === '79%', win.twPaintState(t).pctTxt);
  win.paintPct = () => 0.80;
  ok('at exactly 80% it can', win.twPaintState(t).ready === true);
  /* A job with the alleys AND a plot needs the plot ticked as well. */
  const plot = win.jobAllPlots().filter(n => win.jobRes(n, 'Mow', 'Rotary - Alleys').full.length === 0)[0];
  t.plots = [win.ALLEY_UNIT, plot];
  ok('with a plot on the job too, 80% alone is not enough', win.twPaintState(t).ready === false);
  t.donePlots = [plot];
  ok('and ticking the plot finishes it', win.twPaintState(t).ready === true);
  win.paintPct = real;
}

section('4. Undo takes back your own finger paint and nothing else');
{
  const t = alleyTask('pt-4');
  win.paintAdd(t.id, { sid: 'gps1', who: P, at: 1, how: 'gps', w: 6, pts: lineThrough('AZ09', 30) });
  const afterGps = win.paintPct(t.id);
  ok('nothing to undo while only the GPS has painted', win.paintCanUndo(t.id) === false);
  win.paintAdd(t.id, { sid: 'someone-else', who: 'p20', at: 2, how: 'hand', w: 6, pts: lineThrough('AZ08', 30) });
  ok("somebody else's finger paint is not yours to undo", win.paintCanUndo(t.id) === false);
  const afterTheirs = win.paintPct(t.id);
  win.paintHandStart(t.id, lineThrough('AZ07', 30)[0], 6);
  lineThrough('AZ07', 30).forEach(p => win.paintHandMove(p));
  win.paintHandEnd();
  ok('a finger stroke paints', win.paintPct(t.id) > afterTheirs);
  ok('and can be undone', win.paintCanUndo(t.id) === true);
  ok('undo works', win.paintUndo(t.id) === true);
  ok('and the percentage goes back exactly', win.paintPct(t.id) === afterTheirs,
     (win.paintPct(t.id) * 100).toFixed(3) + ' vs ' + (afterTheirs * 100).toFixed(3));
  ok('the GPS paint is still there', win.paintPct(t.id) >= afterGps);
  ok('a second undo has nothing left of yours', win.paintUndo(t.id) === false);

  /* A second finger mid-stroke is a pinch to zoom, not paint. */
  win.paintHandStart(t.id, lineThrough('AZ06', 10)[0], 6);
  win.paintHandMove(lineThrough('AZ06', 10)[5]);
  const mid = win.paintPct(t.id);
  win.paintHandCancel();
  ok('a cancelled stroke leaves no paint behind', win.paintPct(t.id) <= mid && win.paintPct(t.id) === afterTheirs);
}

section('5. GPS paint');
{
  const t = alleyTask('pt-5');
  const pts = lineThrough('AZ07', 200);
  ok('a vague fix does not paint', win.paintGps(t.id, { lat: pts[0][0], lng: pts[0][1], acc: 200 }, 6) === false);
  ok('a good one does', win.paintGps(t.id, { lat: pts[0][0], lng: pts[0][1], acc: 10 }, 6) === true);
  ok('jitter on the spot does not', win.paintGps(t.id, { lat: pts[0][0] + 0.000005, lng: pts[0][1], acc: 10 }, 6) === false);
  /* ~2 m apart, a step over the 12 ft threshold every few points. */
  pts.slice(1, 60).forEach(p => win.paintGps(t.id, { lat: p[0], lng: p[1], acc: 10 }, 6));
  ok('the live stroke is on the map before it is closed off', win.paintPct(t.id) > 0);
  const live = win.PAINT.live[t.id];
  ok('and is still live, not yet shared', !!live && !win.paintLoad()[t.id]);

  /* A GPS dropout: the next fix is 300 ft away. Joining the dots would paint
     a line across ground nobody mowed. */
  const jumpFrom = win.PAINT.live[t.id].pts.slice(-1)[0];
  win.paintGps(t.id, { lat: jumpFrom[0] + 300 / 364566.9, lng: jumpFrom[1], acc: 10 }, 6);
  const rec = win.paintLoad()[t.id];
  ok('a dropout closes off the stroke instead of bridging it', !!rec && Object.keys(rec.strokes).length === 1);
  ok('and starts a fresh one at the new fix', win.PAINT.live[t.id].pts.length === 1);

  /* A minute later the stroke is closed off and shared, and carries on. */
  win.PAINT.live[t.id].at -= 61 * 1000;
  const last = win.PAINT.live[t.id].pts[0];
  win.paintGps(t.id, { lat: last[0] + 20 / 364566.9, lng: last[1], acc: 10 }, 6);
  ok('after a minute the stroke is closed off', Object.keys(win.paintLoad()[t.id].strokes).length === 2);
  ok('and the next one starts where it ended, so there is no gap',
     win.PAINT.live[t.id] && win.PAINT.live[t.id].pts.length === 1);
  win.paintSealAll();
  ok('putting the phone away closes off what is left', !win.PAINT.live[t.id]);
}

section('6. The drawer goes quiet');
/* Attach, and hear from the server once. */
win.psyncTick();
emit('paint', []);
ok('it listens only to open records', state.where.some(w => w[0] === 'paint' && w[1] === 'open' && w[2] === '==' && w[3] === true),
   JSON.stringify(state.where));
{
  const t = alleyTask('pt-6');
  win.PSYNC.lastSent = {};
  reset();
  win.paintAdd(t.id, { sid: 'a1', who: P, at: 5, how: 'hand', w: 6, pts: lineThrough('AZ05', 10) });
  const w = paintWrites();
  ok('a new stroke goes up', w.length === 1, String(w.length));
  ok('merged, so it cannot wipe anybody else\'s', w[0] && w[0].opts && w[0].opts.merge === true);
  ok('naming only that stroke, with the record marked open',
     w[0] && Object.keys(w[0].data.strokes).join() === 'a1' && w[0].data.open === true, JSON.stringify(w[0] && w[0].data).slice(0, 120));

  /* Twenty finger strokes in a few seconds go up together, not one by one. */
  reset();
  for (let i = 0; i < 20; i++) win.paintAdd(t.id, { sid: 'b' + i, who: P, at: 10 + i, how: 'hand', w: 6, pts: lineThrough('AZ05', 3) });
  ok('a burst of strokes inside ten seconds sends nothing more yet', paintWrites().length === 0, String(paintWrites().length));
  win.PSYNC.lastSent[t.id] = 0;
  win.psyncPush();
  ok('then they all go up in one send', paintWrites().length === 1 && Object.keys(paintWrites()[0].data.strokes).length === 20,
     paintWrites().length + ' sends');

  /* The echo comes back -- in the worst field order -- and must be the end of it. */
  const server = { open: true, strokes: {} };
  Object.entries(win.paintLoad()[t.id].strokes).forEach(([k, v]) => { server.strokes[k] = v; });
  reset(); win.PSYNC.lastSent[t.id] = 0;
  emit('paint', [{ type: 'modified', id: t.id, data: server }], 'reverse');
  win.psyncPush();
  ok('its own record coming back, fields reversed, sends nothing', paintWrites().length === 0, JSON.stringify(paintWrites()).slice(0, 160));

  /* Another phone paints. It lands, and does not go back up. */
  server.strokes['p20-x'] = { who: 'p20', at: 99, how: 'gps', w: 6, pts: '35.899500,-83.962000;35.899600,-83.962000' };
  reset(); win.PSYNC.lastSent[t.id] = 0;
  emit('paint', [{ type: 'modified', id: t.id, data: server }]);
  ok('another phone\'s paint arrives', !!win.paintLoad()[t.id].strokes['p20-x']);
  win.psyncPush();
  ok('and is not sent back', paintWrites().length === 0);

  /* An Undo here, and a copy from the server that has not heard of it yet. */
  win.paintUndo(t.id);
  const undone = Object.keys(win.paintLoad()[t.id].strokes).filter(k => win.paintLoad()[t.id].strokes[k].del);
  ok('undo marks one stroke', undone.length === 1, undone.join());
  reset(); win.PSYNC.lastSent[t.id] = 0;
  emit('paint', [{ type: 'modified', id: t.id, data: server }]);
  ok('the older server copy does not bring the undone stroke back', win.paintLoad()[t.id].strokes[undone[0]].del === true);
  win.psyncPush();
  ok('the undo goes up once', paintWrites().length === 1 && paintWrites()[0].data.strokes[undone[0]].del === true);
  server.strokes[undone[0]] = JSON.parse(JSON.stringify(win.paintLoad()[t.id].strokes[undone[0]]));
  reset(); win.PSYNC.lastSent[t.id] = 0;
  emit('paint', [{ type: 'modified', id: t.id, data: server }]);
  win.psyncPush();
  ok('and once it comes back agreed, nothing more', paintWrites().length === 0);
}

section('6b. A refused stroke is not sent over and over');
(async () => {
  const t = alleyTask('pt-6b');
  win.PSYNC.lastSent = {};
  state.refuse = true; reset();
  win.paintAdd(t.id, { sid: 'r1', who: P, at: 1, how: 'hand', w: 6, pts: lineThrough('AZ04', 4) });
  await new Promise(r => setTimeout(r, 0));
  state.refuse = false;
  ok('it was tried once', paintWrites().length === 1);
  ok('and the refusal is on the Shared database screen', Object.keys(win.PSYNC.failed).length > 0);
  /* The database takes the write back out and says so -- the record arrives
     without the stroke. That must not start the send again. */
  reset(); win.PSYNC.lastSent[t.id] = 0;
  emit('paint', [{ type: 'modified', id: t.id, data: { open: true, strokes: {} } }]);
  win.psyncPush();
  ok('the refusal coming back does not send it again', paintWrites().filter(w => w.data.strokes && w.data.strokes.r1).length === 0,
     JSON.stringify(paintWrites()));
  ok('but it is still on this phone', !!win.paintLoad()[t.id].strokes.r1);

  section('7. A finished job stops being listened to');
  {
    const t7 = alleyTask('pt-7');
    win.PSYNC.lastSent = {};
    reset();
    win.paintAdd(t7.id, { sid: 'c1', who: P, at: 1, how: 'gps', w: 6, pts: lineThrough('AZ03', 4) });
    emit('paint', [{ type: 'added', id: t7.id, data: { open: true, strokes: JSON.parse(JSON.stringify(win.paintLoad()[t7.id].strokes)) } }]);
    t7.status = 'done';
    reset(); win.PSYNC.lastSent[t7.id] = 0;
    win.psyncTick();
    const w = paintWrites();
    ok('finishing the task closes the record', w.length === 1 && w[0].data.open === false, JSON.stringify(w.map(x => x.data)));
    ok('and sends no paint with it', w[0] && Object.keys(w[0].data.strokes || {}).length === 0);
    /* It drops out of the open list on every phone. */
    emit('paint', [{ type: 'removed', id: t7.id }]);
    ok('it leaves this phone', !win.paintLoad()[t7.id]);
    reset(); win.psyncTick();
    ok('and nothing more is said about it', paintWrites().length === 0);
  }

  section('8. The database rules gate it like the crew claims');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const m = rules.match(/match \/paint\/\{taskId\} \{([\s\S]*?)\n    \}/);
    ok('there is a block for it', !!m);
    ok('anyone signed in may read', m && /allow read: if actor\(\);/.test(m[1]));
    ok('only people on the job may write', m && /allow create, update: if actor\(\) && onThisJob\(taskId\);/.test(m[1]));
    ok('nobody may delete', m && /allow delete: if false;/.test(m[1]));
  }

  section('9. Handing the job to somebody else keeps the paint');
  {
    const t9 = alleyTask('pt-9');
    win.paintAdd(t9.id, { sid: 'd1', who: P, at: 1, how: 'gps', w: 6, pts: lineThrough('AZ02', 20) });
    const before = win.paintPct(t9.id);
    t9.assignee = 'p18';                       /* Bill edits the task the next morning */
    win.sessionSet('p18');
    ok('the new person sees the same paint', win.paintPct(t9.id) === before && before > 0);
    ok('and cannot undo the last person\'s', win.paintCanUndo(t9.id) === false);
    win.sessionSet(P);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
