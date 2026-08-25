/*
 * Map corrections, and crew claims, moving between phones.
 *
 * The two things worth being careful about here, and both have bitten this
 * app's design before:
 *
 *   - What is stored is the CHANGE, never the finished object. A whole-object
 *     save would shadow farm-geo.js forever: the next time the file gains a
 *     plot or a corrected area, every device would go on serving its own stale
 *     copy and nobody would know why.
 *   - "Clear this device's plot edits" must never be able to delete the farm's
 *     corrections. This sync does not delete documents at all, and section 4
 *     is what holds that.
 *
 * Run:  node tools/test-mapsync.js
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
const DELETE = { __delete: true };
const state = { writes: [], deletes: [], listeners: {}, persistence: 0 };
function docRef(coll, id) {
  return {
    id: String(id),
    set(data, opts) { state.writes.push({ coll, id: String(id), data, merge: !!(opts && opts.merge) }); return Promise.resolve(); },
    update(data) { state.writes.push({ coll, id: String(id), data, update: true }); return Promise.resolve(); },
    delete() { state.deletes.push({ coll, id: String(id) }); return Promise.resolve(); }
  };
}
const fakeDb = {
  enablePersistence() { state.persistence++; return Promise.resolve(); },
  collection(name) {
    return {
      doc: id => docRef(name, id),
      onSnapshot(next, err) { (state.listeners[name] = state.listeners[name] || []).push({ next, err }); return () => { state.listeners[name] = []; }; }
    };
  },
  doc: p => docRef('_', p)
};
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { currentUser: null, onAuthStateChanged() { return () => {}; } }; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = { delete: () => DELETE };

function emit(coll, changes, fromCache) {
  const snap = {
    metadata: { fromCache: !!fromCache },
    docChanges: () => changes.map(c => ({
      type: c.type || 'added',
      doc: { id: String(c.id), data: () => JSON.parse(JSON.stringify(c.data || {})) }
    }))
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
try {
  win.eval(appSource(win.document) + '\n;window.__PLOT_INFO = PLOT_INFO; window.__MGMT = MGMT_DATA;');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const appText = fs.readFileSync(APP, 'utf8');
const rulesText = fs.readFileSync(RULES, 'utf8');
const INFO = () => win.__PLOT_INFO;
const MGMT = () => win.__MGMT;

/* --------------------------------------------- 1. one rule for the map -- */
section('1. One rule for the map, in the app and in the database');
ok('mapCan() exists', typeof win.mapCan === 'function');
ok('a technician may reshape', win.mapCan('p02', 'shape') === true);
ok('a grad student may change plot information', win.mapCan('p09', 'info') === true);
ok('faculty may change the mowing setup', win.mapCan('p16', 'mowing') === true);
ok('Bill may too', win.mapCan('p07', 'shape') === true);
ok('an undergrad may not — the one exception', win.mapCan('p18', 'shape') === false);
ok('nor for plot information', win.mapCan('p18', 'info') === false);
ok('nor for the mowing setup', win.mapCan('p18', 'mowing') === false);
ok('an unknown action is refused', win.mapCan('p07', 'whatever') === false);
ok('somebody not on the roster is refused', win.mapCan('p00', 'shape') === false);
ok('the shape editor asks the same function', /function peCanEdit\(\)\{ return mapCan\(/.test(appText));
ok('the database has the same rule', /roleOf\(me\(\)\) != 'Undergraduate Student'/.test(rulesText)
   && /match \/mapplaces\/\{placeId\}/.test(rulesText));

/* ------------------------------------- 2. the change, not the object ---- */
section('2. What is stored is the change, never the finished object');
{
  const before = Object.keys(win.mapPlaceRecords()).length;
  ok('a farm nobody has corrected has no records at all', before === 0, String(before));

  INFO()['B12'] = [['Turfgrass', 'Bermuda'], ['Cultivar', 'Latitude 36']];
  MGMT()['AZ06'] = { m: 'Toro 3100', c: 1.5 };
  const recs = win.mapPlaceRecords();
  ok('only the two touched places have records', Object.keys(recs).sort().join(',') === 'AZ06,B12',
     Object.keys(recs).join(','));
  ok('the plot information rides on its own place', !!recs.B12.plotinfo);
  ok('and the mowing setup on its own', recs.AZ06.mgmt && recs.AZ06.mgmt.c === 1.5);
  ok('nothing else about B12 is dragged along',
     Object.keys(recs.B12).sort().join(',') === 'id,plotinfo', Object.keys(recs.B12).join(','));
}

/* ------------------------------------------------- 3. it goes up once -- */
section('3. Corrections go up, and are not sent twice');
win.sessionSet('p01');
win.msyncSetWanted(true);
ok('a listener is attached', win.MSYNC.live === true);
{
  reset();
  emit('mapplaces', [], false);                    /* the first SERVER answer */
  ok('it is ready', win.MSYNC.ready === true);
  const ids = wrote('mapplaces').map(w => w.id).sort();
  ok('both corrections were sent', ids.join(',') === 'AZ06,B12', ids.join(','));
  ok('each says who made it', wrote('mapplaces').every(w => w.data.updatedBy === 'p01'));

  reset(); win.msyncScan();
  ok('the very next scan sends nothing', wrote('mapplaces').length === 0);
}
{
  reset();
  MGMT()['AZ06'].c = 2;
  win.msyncScan();
  ok('changing one place sends one record', wrote('mapplaces').length === 1);
  ok('and it is that place', wrote('mapplaces')[0].id === 'AZ06');
  ok('carrying the new number', wrote('mapplaces')[0].data.mgmt.c === 2);
}

/* ------------------------------ 4. clearing a phone must not delete ----- */
section('4. Clearing one phone must never delete the farm\'s corrections');
{
  reset();
  delete INFO()['B12'];
  delete MGMT()['AZ06'];
  win.msyncScan();
  ok('NOTHING is deleted from the shared copy', state.deletes.length === 0);
  ok('the database refuses deletion outright', /match \/mapplaces\/\{placeId\}[\s\S]*?allow delete: if false;/.test(rulesText));
  ok('and the clear button warns when the map is shared',
     /MSYNC\.on\)\{\s*\n?\s*toast\('The map is shared/.test(appText.replace(/\r/g, '')));
}

/* ---------------------------------------- 5. a correction coming down -- */
section('5. A correction from somebody else lands here');
{
  win.MSYNC.seen = {};
  emit('mapplaces', [{ type: 'added', id: 'C7', data: { id: 'C7', plotinfo: [['Turfgrass', 'Zoysia']], updatedBy: 'p07' } }], false);
  ok('it is applied to this phone', JSON.stringify(INFO()['C7']) === '[["Turfgrass","Zoysia"]]');
  reset(); win.msyncScan();
  ok('and is not sent straight back', wrote('mapplaces').length === 0, JSON.stringify(wrote('mapplaces')));
}
{
  /* A field carrying null is the farm removing what the file says. */
  emit('mapplaces', [{ type: 'modified', id: 'C7', data: { id: 'C7', plotinfo: null, updatedBy: 'p07' } }], false);
  ok('null means the farm took it off', !('C7' in INFO()));
}

/* ------------------------------------------- 6. crew claims, off/on ---- */
section('6. Crew claims — off by default, and only tabs see each other');
ok('the switch starts off', win.CSYNC.on === false);
{
  reset();
  win.crewTake('job1', 'AZ06', 'p18');
  ok('a claim still works with sharing off', !!win.crewClaim('job1', 'AZ06'));
  ok('but nothing left this machine', wrote('crew').length === 0);
}

section('7. Turned on, a claim reaches the other people on the job');
win.csyncSetWanted(true);
ok('a listener is attached', win.CSYNC.live === true);
{
  reset();
  win.crewTake('job1', 'AZ11', 'p18');
  const w = wrote('crew');
  ok('one write, for that job', w.length === 1 && w[0].id === 'job1', JSON.stringify(w.map(x => x.id)));
  ok('it is a merge, so it cannot clobber the rest of the job', w[0].merge === true);
  /* AZ06 was claimed on this machine BEFORE sharing was switched on, so the
     first write carries it too — a claim somebody is already holding must not
     be invisible to everyone else just because the switch came later. */
  ok('the claim made before the switch goes up as well',
     Object.keys(w[0].data.claims).sort().join(',') === 'AZ06,AZ11', Object.keys(w[0].data.claims).join(','));
}
{
  /* From here on, only what actually changed is named. */
  reset();
  win.crewTake('job1', 'B12', 'p18');
  const w = wrote('crew');
  ok('the next claim names only itself',
     w.length === 1 && Object.keys(w[0].data.claims).join(',') === 'B12',
     w.length ? Object.keys(w[0].data.claims).join(',') : 'no write');
}
{
  /* The case this whole feature exists for: two people, two zones, one job. */
  reset();
  win.crewComplete('job1', 'AZ11', 'p18', 'tap');
  const w = wrote('crew')[0];
  ok('finishing a zone names the zone, not the whole job',
     Object.keys(w.data.done).join(',') === 'AZ11');
  ok('and releases the claim by naming it too',
     w.data.claims.AZ11 && w.data.claims.AZ11.__delete === true, JSON.stringify(w.data.claims));
}
{
  reset();
  emit('crew', [{ type: 'added', id: 'job2', data: { claims: { B12: { who: 'p20', at: 1, beat: Date.now() } }, done: {} } }], false);
  const held = win.crewClaim('job2', 'B12');
  ok('somebody else\'s claim shows up here', !!held && held.who === 'p20');
  reset(); win.crewSend(win.crewLoad());
  ok('and is not echoed back', wrote('crew').length === 0, JSON.stringify(wrote('crew')));
}
{
  ok('the heartbeat slows down when it costs a write each time',
     win.crewBeatMs() === win.CREW_BEAT_SHARED_MS && win.CREW_BEAT_SHARED_MS > win.CREW_BEAT_MS);
  win.csyncSetWanted(false);
  ok('and goes back to the quick beat when it is free again', win.crewBeatMs() === win.CREW_BEAT_MS);
}

/* --------------------------------------------------- 8. the screen ----- */
section('8. All three switches are on one screen');
{
  win.sdbRender();
  const html = win.document.getElementById('sdb-body').innerHTML;
  ok('tasks', /Share tasks with everyone/.test(html));
  ok('the map', /Share map corrections/.test(html));
  ok('who is working where', /Share who is working where/.test(html));
  ok('each has its own button',
     /id="sdb-tasks"/.test(html) && /id="sdb-map"/.test(html) && /id="sdb-crew"/.test(html));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
