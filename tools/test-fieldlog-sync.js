/*
 * The field log: corrections that keep the original, and sharing that cannot
 * lose history.
 *
 * This is the record that outlives everybody currently on the farm. Two things
 * are worth more here than anywhere else in the app:
 *
 *   - nothing is ever deleted, and nothing is ever edited in place. A
 *     correction is a NEW entry; the old one is marked, not rewritten.
 *   - the 5,000-entry cap is a phone limit. It must never become a farm limit
 *     by deleting trimmed history off the shared copy — or, just as bad, drag
 *     it back down and trim it again forever.
 *
 * Run:  node tools/test-fieldlog-sync.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const RULES = path.join(ROOT, 'firestore.rules');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ------------------------------------------------------- the fake db ---- */
const state = { writes: [], deletes: [], listeners: {} };
function docRef(coll, id) {
  return {
    id: String(id),
    set(data) { state.writes.push({ coll, id: String(id), data }); return Promise.resolve(); },
    delete() { state.deletes.push({ coll, id: String(id) }); return Promise.resolve(); }
  };
}
const fakeDb = {
  enablePersistence() { return Promise.resolve(); },
  collection(name) {
    return { doc: id => docRef(name, id),
             onSnapshot(opts, next, err) { state.snapOpts = (state.snapOpts||[]).concat([opts]); (state.listeners[name] = state.listeners[name] || []).push({ next, err }); return () => { state.listeners[name] = []; }; } };
  },
  doc: p => docRef('_', p)
};
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { currentUser: null, onAuthStateChanged() { return () => {}; } }; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = { delete: () => ({ __delete: true }) };
function emit(coll, changes, fromCache) {
  const snap = {
    metadata: { fromCache: !!fromCache },
    docChanges: () => changes.map(c => ({ type: c.type || 'added',
      doc: { id: String(c.id), data: () => JSON.parse(JSON.stringify(c.data || {})) } }))
  };
  (state.listeners[coll] || []).slice().forEach(l => l.next(snap));
}
const reset = () => { state.writes.length = 0; state.deletes.length = 0; };
const wrote = coll => state.writes.filter(w => w.coll === coll);

/* ------------------------------------------------------------- boot ---- */
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
win.firebase = fakeFirebase;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
/* FIELDLOG is `let`, so it is not on window; it is never reassigned after boot. */
try { win.eval(appSource(win.document) + '\n;window.__FL = FIELDLOG; window.__FLCAP = FL_CAP; window.__FLCUR = function(v){ if(v!==undefined) flCur = v; return flCur; };'); }
catch (e) { console.log('app script threw: ' + e.message); fail++; }

const appText = fs.readFileSync(APP, 'utf8');
const rulesText = fs.readFileSync(RULES, 'utf8');
const FL = () => win.__FL;
const clearLog = () => { FL().length = 0; };
const entry = (over) => Object.assign({
  id: win.newId('fl'), plot: 'B12', type: 'mow', title: 'Mow B12', detail: 'Mowing',
  date: 'Aug 20', ord: 20260820, person: 'p18', loggedBy: 'p18', time: '7:20 AM', source: 'manual'
}, over || {});

/* ------------------------------------------------- 1. who may do what --- */
section('1. One rule, and everybody can log their own work');
ok('flCan() exists', typeof win.flCan === 'function');
win.sessionSet('p18');
ok('an undergrad may log the mow they did', win.flCan('p18', 'log', {}) === true);
ok('so may everybody else', win.flCan('p16', 'log', {}) === true);
ok('nobody may delete, ever', win.flCan('p07', 'delete', {}) === false);
{
  const mine = entry({ person: 'p18', loggedBy: 'p18' });
  const theirs = entry({ person: 'p09', loggedBy: 'p09' });
  ok('I may correct the entry I wrote', win.flCan('p18', 'correct', mine) === true);
  ok('I may correct an entry about work I did', win.flCan('p18', 'correct', entry({ person: 'p18', loggedBy: 'p07' })) === true);
  ok('I may not correct somebody else\'s', win.flCan('p18', 'correct', theirs) === false);
  ok('Bill may correct anybody\'s', win.flCan('p07', 'correct', theirs) === true);
  ok('Dillon may, holding the undergrad job', win.flCan('p01', 'correct', theirs) === true);
  ok('faculty may, over their own lab\'s person', win.flCan('p16', 'correct', entry({ person: 'p09', loggedBy: 'p09' })) === true);
  ok('but not another lab\'s', win.flCan('p16', 'correct', entry({ person: 'p12', loggedBy: 'p12' })) === false);
  ok('an already-corrected entry is not corrected again',
     win.flCan('p07', 'correct', entry({ correctedBy: 'x' })) === false);
}

/* ------------------------------------- 2. the original is never lost ---- */
section('2. A correction writes a new entry and keeps the old one');
clearLog();
{
  const a = entry({ plot: 'B12', person: 'p18', loggedBy: 'p18' });
  FL().push(a);
  win.flCommit();
  const before = FL().length;

  const made = win.flCorrect(a.id, { plot: 'B13' }, 'Logged on B12, the mow was actually B13');
  ok('a correction was made', !!made);
  ok('the log GREW — nothing was replaced', FL().length === before + 1, before + ' -> ' + FL().length);
  ok('the original is still there', !!win.flById(a.id));
  ok('and still says what it always said', win.flById(a.id).plot === 'B12');
  ok('the correction carries the fix', made.plot === 'B13');
  ok('it points at what it replaced', made.corrects === a.id);
  ok('and the original points forward to it', win.flById(a.id).correctedBy === made.id);
  ok('who corrected it is recorded', win.flById(a.id).correctedWho === 'p18');
  ok('and when', !!win.flById(a.id).correctedAt);
  ok('the reason is kept — the part somebody will need in 2035',
     /actually B13/.test(made.correctionNote || ''));
}
{
  /* The totals have to be right, or the log is not usable as a summary. */
  const live = win.flLive();
  ok('only the correction counts in the totals', live.length === 1, String(live.length));
  ok('and it is the corrected one', live[0].plot === 'B13');
  const dead = FL().filter(e => e.correctedBy)[0];
  ok('the superseded entry is still reachable by its id', !!dead && win.flById(dead.id) === dead);
}
{
  /* A correction may not rewrite the record OF the record. */
  const a = entry({ person: 'p18', loggedBy: 'p18' });
  FL().push(a); win.flCommit();
  const made = win.flCorrect(a.id, { loggedBy: 'p07', corrects: 'nonsense', id: 'nope' }, 'test');
  ok('a correction cannot forge who wrote the original', made.loggedBy === 'p18');
  ok('nor what it corrects', made.corrects === a.id);
  ok('nor its own id', made.id !== 'nope');
}
{
  const a = entry({ person: 'p09', loggedBy: 'p09' });
  FL().push(a); win.flCommit();
  ok('somebody with no standing gets nothing back', win.flCorrect(a.id, { plot: 'C1' }, 'why') === null);
  ok('and the entry is untouched', win.flById(a.id).plot === 'B12' && !win.flById(a.id).correctedBy);
}

/* ------------------------------------------- 3. the database agrees ----- */
section('3. The database says the same thing');
ok('there is a field log block', /match \/fieldlog\/\{entryId\}/.test(rulesText));
ok('nothing is ever deleted',
   /match \/fieldlog\/\{entryId\}[\s\S]*?allow delete: if false;/.test(rulesText));
ok('the only permitted change is marking it superseded',
   /hasOnly\(\['correctedBy', 'correctedAt', 'correctedWho'\]\)/.test(rulesText));
ok('and whoever does it has to own up to it',
   /str\(request\.resource\.data\.get\('correctedWho',''\)\) == me\(\)/.test(rulesText));
ok('the app records who wrote every entry down', /loggedBy:SESSION\.pid|loggedBy:whoId/.test(appText));

/* --------------------------------------------- 4. sharing adds only ----- */
section('4. Sharing the log can only ever add to the record');
clearLog();
win.sessionSet('p07');
{
  FL().push(entry({ plot: 'A1', ord: 20260810 }));
  FL().push(entry({ plot: 'A2', ord: 20260811 }));
  win.flsyncSetWanted(true);
  ok('a listener is attached', win.FLSYNC.live === true);
  reset();
  emit('fieldlog', [], false);
  ok('it is ready', win.FLSYNC.ready === true);
  ok('both entries went up', wrote('fieldlog').length === 2, String(wrote('fieldlog').length));
  reset(); win.flPush();
  ok('and are not sent twice', wrote('fieldlog').length === 0);
}
{
  reset();
  const a = FL()[0];
  win.flCorrect(a.id, { plot: 'A9' }, 'wrong plot');
  const ids = wrote('fieldlog').map(w => w.id);
  ok('a correction writes the new entry AND marks the old', ids.length === 2, ids.join(','));
  ok('the marked one is the original', ids.indexOf(a.id) >= 0);
  ok('nothing was deleted', state.deletes.length === 0);
}
{
  /* An entry from somebody else's phone. */
  reset();
  emit('fieldlog', [{ type: 'added', id: 'fl-other', data: { id: 'fl-other', plot: 'C7', type: 'spray', ord: 20260812, person: 'p09', loggedBy: 'p09', title: 'Spray C7' } }], false);
  ok('it lands here', !!win.flById('fl-other'));
  reset(); win.flPush();
  ok('and is not sent straight back', wrote('fieldlog').length === 0, wrote('fieldlog').map(w => w.id).join(','));
}

/* ------------------------------- 5. the cap is a phone limit, not a farm's */
section('5. The 5,000 cap trims this phone, never the farm');
{
  ok('the cap exists and is named', typeof win.__FLCAP === 'number' && win.__FLCAP === 5000);
  clearLog();
  /* Fill past the cap so flCommit() trims, then check what that did. */
  for (let i = 0; i < win.__FLCAP + 25; i++) FL().push(entry({ ord: 20200101 + i, plot: 'P' + i }));
  reset();
  win.flCommit();
  ok('the phone is trimmed to the cap', FL().length === win.__FLCAP, String(FL().length));
  ok('but NOTHING is deleted from the shared copy', state.deletes.length === 0);

  const oldest = win.flOldestKeptOrd();
  ok('the oldest day still on this phone is known', typeof oldest === 'number' && oldest > 0);

  /* The trimmed history must not come straight back down and be trimmed again. */
  const n = FL().length;
  emit('fieldlog', [{ type: 'added', id: 'fl-ancient', data: { id: 'fl-ancient', plot: 'OLD', ord: oldest - 500, person: 'p09', loggedBy: 'p09' } }], false);
  ok('history older than this phone\'s window is left where it is',
     FL().length === n && !win.flById('fl-ancient'));

  /* Something recent still arrives normally. */
  emit('fieldlog', [{ type: 'added', id: 'fl-recent', data: { id: 'fl-recent', plot: 'NEW', ord: oldest + 100000, person: 'p09', loggedBy: 'p09' } }], false);
  ok('a recent entry from somebody else still arrives', !!win.flById('fl-recent'));
}

/* ------------------------------------------------- 6. the correction UI - */
section('6. The correction sheet');
clearLog();
{
  const a = entry({ person: 'p07', loggedBy: 'p07', product: 'Barricade', amount: '2 gal' });
  FL().push(a); win.flCommit();
  win.__FLCUR(a.id);
  win.flxRender();
  const html = win.document.getElementById('flx-body').innerHTML;
  ok('it explains that the original is kept', /original is kept/i.test(html));
  ok('it offers the plot', /id="flx-plot"/.test(html));
  ok('and the date', /id="flx-date"/.test(html));
  ok('a chemical entry can fix the product', /id="flx-product"/.test(html));
  ok('and it insists on a reason', /id="flx-why"/.test(html));

  /* A correction with no reason is only half a record. */
  win.document.getElementById('flx-why').value = '';
  const before = FL().length;
  win.flxSave();
  ok('saving with no reason does nothing', FL().length === before);
}
{
  const a = win.flById(win.__FLCUR());
  ok('the detail page offers the button to those permitted',
     /flCan\(SESSION\.pid,'correct',a\)/.test(appText));
  win.renderFlDetail();
  ok('and both halves of a correction say so on the page',
     /This entry was corrected/.test(appText) && /This is a correction/.test(appText));
}

/* ------------------------------------------------- 7. the read-out ------ */
section('7. Ten read-outs, one screen, no switches');
{
  win.sdbRender();
  const html = win.document.getElementById('sdb-body').innerHTML;
  ['Tasks', 'Map corrections', 'Who is working where', 'The field log']
    .forEach(t => ok(t, html.indexOf('>' + t + '<') >= 0));
  ok('nothing on the screen can be switched off', !/Turn off|Turn on/.test(html));
  /* This counted buttons as a stand-in for "the ten switches are gone". Two
     diagnostic buttons were added on 2026-08-27, so count them by NAME
     instead -- the thing that actually must never come back is a per-drawer
     switch, and a bare count cannot tell one from the other. */
  ok('no per-drawer switch has come back',
     (html.match(/id="sdb-(?!push|copy|test|dump)/g) || []).length === 0);
  ok('the roster button, the connection test and the copy button, and nothing else',
     html.indexOf('id="sdb-push"') >= 0 &&
     html.indexOf('id="sdb-test"') >= 0 &&
     html.indexOf('id="sdb-copy"') >= 0 &&
     (html.match(/class="action tap"/g) || []).length === 3);
  ok('the log read-out still says nothing is ever deleted', /is ever deleted/i.test(html));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
