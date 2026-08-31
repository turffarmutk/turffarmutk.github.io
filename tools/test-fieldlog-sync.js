/*
 * The field log: editing and deleting an entry, and sharing that carries a
 * real delete both ways.
 *
 * Until 2026-08-31 nothing here was ever deleted or edited in place — see
 * docs/DECISIONS.md, "Field Log entries can now be edited and deleted". Two
 * things are worth more here than anywhere else in the app, and both
 * survived that change:
 *
 *   - who may edit or delete an entry is one rule (flCan), the same rule the
 *     database enforces, so the two can never drift apart.
 *   - the 5,000-entry cap is still a phone limit, not a farm limit. Trimming
 *     a phone down to the cap must never send a delete to the shared copy —
 *     only an explicit flDelete() may do that.
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

const appText = require('./_app').appText();   /* the page WITH the app-*.js files written back in — see tools/_app.js */
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
['edit', 'delete'].forEach(action => {
  const mine = entry({ person: 'p18', loggedBy: 'p18' });
  const theirs = entry({ person: 'p09', loggedBy: 'p09' });
  ok('I may ' + action + ' the entry I wrote', win.flCan('p18', action, mine) === true);
  ok('I may ' + action + ' an entry about work I did', win.flCan('p18', action, entry({ person: 'p18', loggedBy: 'p07' })) === true);
  ok('I may not ' + action + ' somebody else\'s', win.flCan('p18', action, theirs) === false);
  ok('Bill may ' + action + ' anybody\'s', win.flCan('p07', action, theirs) === true);
  ok('Dillon may, holding the undergrad job', win.flCan('p01', action, theirs) === true);
  ok('faculty may, over their own lab\'s person', win.flCan('p16', action, entry({ person: 'p09', loggedBy: 'p09' })) === true);
  ok('but not another lab\'s', win.flCan('p16', action, entry({ person: 'p12', loggedBy: 'p12' })) === false);
});

/* ------------------------------------------- 2. edit changes it in place ---- */
section('2. Editing changes the entry itself, and deleting removes it');
clearLog();
win.sessionSet('p18');
{
  const a = entry({ plot: 'B12', person: 'p18', loggedBy: 'p18' });
  FL().push(a);
  win.flCommit();
  const before = FL().length;

  const made = win.flEdit(a.id, { plot: 'B13' });
  ok('an edit was made', !!made);
  ok('the log did NOT grow -- nothing new was written', FL().length === before, before + ' -> ' + FL().length);
  ok('it is the same id', made.id === a.id);
  ok('and it is the same object flById(a.id) now returns', win.flById(a.id) === made);
  ok('the entry now says the fix', win.flById(a.id).plot === 'B13');
  ok('the old plot value is gone, not kept alongside the new one', made.plot === 'B13' && made.plot !== 'B12');
}
{
  /* Editing may not rewrite the record OF the record. */
  const a = entry({ person: 'p18', loggedBy: 'p18' });
  FL().push(a); win.flCommit();
  const made = win.flEdit(a.id, { loggedBy: 'p07', id: 'nope', plot: 'C1' });
  ok('editing cannot forge who wrote it', made.loggedBy === 'p18');
  ok('nor its own id', made.id !== 'nope' && made.id === a.id);
  ok('but an editable field does change', made.plot === 'C1');
}
{
  const a = entry({ person: 'p09', loggedBy: 'p09' });
  FL().push(a); win.flCommit();
  win.sessionSet('p18');
  ok('somebody with no standing gets nothing back from an edit', win.flEdit(a.id, { plot: 'C1' }) === null);
  ok('and the entry is untouched', win.flById(a.id).plot === 'B12');
  ok('nor may they delete it', win.flDelete(a.id) === false);
  ok('so it is still there', !!win.flById(a.id));
}
{
  win.sessionSet('p18');
  const a = entry({ person: 'p18', loggedBy: 'p18' });
  FL().push(a); win.flCommit();
  const before = FL().length;
  ok('somebody with standing can delete it', win.flDelete(a.id) === true);
  ok('the log shrank by one', FL().length === before - 1);
  ok('and it is gone for good', !win.flById(a.id));
}

/* ------------------------------------------- 3. the database agrees ----- */
section('3. The database says the same thing');
ok('there is a field log block', /match \/fieldlog\/\{entryId\}/.test(rulesText));
ok('delete now follows the same rule as edit, not `if false`',
   /allow delete: if actor\(\) && canEditLog\(\);/.test(rulesText));
ok('update allows the entry\'s real fields, not just the old supersede fields',
   /hasOnly\(\['plot', 'type', 'op', 'title', 'date', 'ord', 'time',[\s\S]*?'amount', 'target', 'notes', 'detail'\]\)/.test(rulesText));
ok('the old supersede-only update rule is gone',
   !/hasOnly\(\['correctedBy', 'correctedAt', 'correctedWho'\]\)/.test(rulesText));
ok('the app records who wrote every entry down', /loggedBy:SESSION\.pid|loggedBy:whoId/.test(appText));

/* --------------------------------------- 4. sharing carries a real delete */
section('4. Sharing the log — edits overwrite, deletes really delete');
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
  win.flEdit(a.id, { plot: 'A9' });
  const ids = wrote('fieldlog').map(w => w.id);
  ok('editing sends one write, for the same id', ids.length === 1 && ids[0] === a.id, ids.join(','));
  ok('carrying the new value', wrote('fieldlog')[0].data.plot === 'A9');
  ok('nothing was deleted by an edit', state.deletes.length === 0);
}
{
  reset();
  const a = FL()[0];
  const id = a.id;
  ok('deleting sends an actual delete', win.flDelete(id) === true);
  ok('to the field log collection, for that id', state.deletes.some(d => d.coll === 'fieldlog' && d.id === id));
  ok('and nothing was merely written instead', wrote('fieldlog').length === 0);
}
{
  /* An entry from somebody else's phone. */
  reset();
  emit('fieldlog', [{ type: 'added', id: 'fl-other', data: { id: 'fl-other', plot: 'C7', type: 'spray', ord: 20260812, person: 'p09', loggedBy: 'p09', title: 'Spray C7' } }], false);
  ok('it lands here', !!win.flById('fl-other'));
  reset(); win.flPush();
  ok('and is not sent straight back', wrote('fieldlog').length === 0, wrote('fieldlog').map(w => w.id).join(','));
}
{
  /* The server confirming somebody else deleted an entry this phone has. */
  reset();
  ok('this phone still has it', !!win.flById('fl-other'));
  emit('fieldlog', [{ type: 'removed', id: 'fl-other' }], false);
  ok('it is removed here too', !win.flById('fl-other'));
}
{
  /* A record this phone has never sent up (FLSYNC.seen has no entry for it
     yet) must not be mistaken for one the server says is gone — same guard
     tsync uses for tasks. Pushed straight onto the array, not through
     flCommit(), so flPush() never runs for it and FLSYNC.seen stays empty. */
  reset();
  const a = entry({ id: 'fl-brandnew', plot: 'Z1' });
  FL().push(a);
  ok('FLSYNC has not seen it yet', win.FLSYNC.seen['fl-brandnew'] === undefined);
  emit('fieldlog', [{ type: 'removed', id: 'fl-brandnew' }], false);
  ok('so an unrelated removed event for that id leaves it alone',
     !!win.flById('fl-brandnew'));
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

/* ------------------------------------------------- 6. the edit sheet ---- */
section('6. The edit sheet');
clearLog();
win.sessionSet('p07');
{
  const a = entry({ person: 'p07', loggedBy: 'p07', product: 'Barricade', amount: '2 gal', notes: 'first pass' });
  FL().push(a); win.flCommit();
  win.__FLCUR(a.id);
  win.flxRender();
  const html = win.document.getElementById('flx-body').innerHTML;
  ok('it warns that saving replaces the record, with no old value kept',
     /old value is not kept/i.test(html));
  ok('it offers the plot', /id="flx-plot"/.test(html));
  ok('and the date', /id="flx-date"/.test(html));
  ok('a chemical entry can fix the product', /id="flx-product"/.test(html));
  ok('it offers Notes, pre-filled', /id="flx-notes"/.test(html) && html.indexOf('first pass') >= 0);
  ok('there is no reason field any more — nothing is kept to hang it on',
     !/id="flx-why"/.test(html));

  /* Saving with nothing changed does nothing — there is no reason to require. */
  const before = FL().length;
  win.flxSave();
  ok('saving with nothing changed does nothing, and does not error', FL().length === before);

  win.document.getElementById('flx-plot').value = 'C1';
  win.flxSave();
  ok('an actual change saves onto the SAME entry', win.flById(a.id).plot === 'C1' && FL().length === before);
}
{
  const a = win.flById(win.__FLCUR());
  ok('the detail page offers Edit to those permitted',
     /flCan\(SESSION\.pid,'edit',a\)/.test(appText));
  ok('and Delete to those permitted',
     /flCan\(SESSION\.pid,'delete',a\)/.test(appText));
  ok('the old Correct-this button is gone', !/Correct this/.test(appText));
  win.renderFlDetail();
  const ab = win.document.getElementById('fld-actions').innerHTML;
  ok('the page shows exactly Edit and Delete', /id="fld-edit"/.test(ab) && /id="fld-del"/.test(ab));
  ok('Show on map and Open the task are gone from this page',
     !/id="fld-map"/.test(ab) && !/id="fld-task"/.test(ab));
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
  ok('the log read-out now says who may edit or delete an entry',
     /edited or deleted/i.test(html));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
