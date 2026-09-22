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
const state = { writes: [], deletes: [], listeners: {}, persistence: 0, badData: [] };

/* Firestore cannot hold a list directly inside a list. This drawer sent plot
   information as a list of pairs and shapes as GeoJSON, whose coordinates are
   lists inside lists inside lists, so from the day it was built until
   2026-09-22 nearly every map record was thrown out before it left the phone
   -- and this file passed the whole time, because the pretend database took
   anything. It does not any more. */
function nestedArrayPath(v, path) {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (Array.isArray(v[i])) return path + '[' + i + ']';
      const deeper = nestedArrayPath(v[i], path + '[' + i + ']');
      if (deeper) return deeper;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      const deeper = nestedArrayPath(v[k], path ? path + '.' + k : k);
      if (deeper) return deeper;
    }
  }
  return null;
}
function docRef(coll, id) {
  return {
    id: String(id),
    set(data, opts) {
      const bad = nestedArrayPath(data, '');
      if (bad) state.badData.push({ coll, id: String(id), at: bad });
      state.writes.push({ coll, id: String(id), data, merge: !!(opts && opts.merge) });
      return Promise.resolve();
    },
    update(data) { state.writes.push({ coll, id: String(id), data, update: true }); return Promise.resolve(); },
    delete() { state.deletes.push({ coll, id: String(id) }); return Promise.resolve(); }
  };
}
const fakeDb = {
  enablePersistence() { state.persistence++; return Promise.resolve(); },
  collection(name) {
    return {
      doc: id => docRef(name, id),
      onSnapshot(opts, next, err) { state.snapOpts = (state.snapOpts||[]).concat([opts]); (state.listeners[name] = state.listeners[name] || []).push({ next, err }); return () => { state.listeners[name] = []; }; }
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
  ok('and it is still held as pairs on the phone — only the wire is flattened',
     Array.isArray(recs.B12.plotinfo[0]), JSON.stringify(recs.B12.plotinfo[0]));
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
  /* The whole reason the map never reached anybody. */
  const b12 = wrote('mapplaces').find(w => w.id === 'B12');
  ok('the plot information travels as objects, not pairs',
     !!b12 && b12.data.plotinfo[0].k === 'Turfgrass' && b12.data.plotinfo[0].v === 'Bermuda',
     JSON.stringify(b12 && b12.data.plotinfo));

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
  /* Deliberately NOT wiping MSYNC.seen. Wiping it makes the drawer forget
     every record it has ever sent, so the next scan re-offers all of them and
     the echo we are actually looking for gets lost in the noise. C7 is new
     here, which is all this section needs. */
  emit('mapplaces', [{ type: 'added', id: 'C7', data: { id: 'C7', plotinfo: [{ k: 'Turfgrass', v: 'Zoysia' }], updatedBy: 'p07' } }], false);
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
section('6. Crew claims — no switch, so they travel on their own');
ok('sharing is on with nothing to press', win.CSYNC.on === true);
/* The two-second heartbeat is what attaches a drawer. It used to be enough to
   let another drawer receive something, because every snapshot handler called
   storeTouch() -- which is exactly the amplification that spent 4.4 million
   reads on 2026-08-31. Snapshot handlers now only save to the phone, so the
   heartbeat is the only thing that attaches and sends. Run it. */
win.storeScan();
ok('and it attached itself once somebody was signed in', win.CSYNC.live === true);
{
  reset();
  win.crewTake('job1', 'AZ06', 'p18');
  ok('the claim is held here', !!win.crewClaim('job1', 'AZ06'));
  const w = wrote('crew');
  ok('and it left this machine without anybody switching anything on',
     w.length === 1 && w[0].id === 'job1', JSON.stringify(w.map(x => x.id)));
}

section('7. A claim reaches the other people on the job');
{
  reset();
  win.crewTake('job1', 'AZ11', 'p18');
  const w = wrote('crew');
  ok('one write, for that job', w.length === 1 && w[0].id === 'job1', JSON.stringify(w.map(x => x.id)));
  ok('it is a merge, so it cannot clobber the rest of the job', w[0].merge === true);
  /* Only what actually changed is named, so two people claiming different
     zones on the same job cannot overwrite each other. */
  ok('and it names only the zone that changed',
     Object.keys(w[0].data.claims).join(',') === 'AZ11', Object.keys(w[0].data.claims).join(','));
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
  ok('and goes back to the quick beat while nothing is attached, when it is free again',
     win.crewBeatMs() === win.CREW_BEAT_MS);
}

/* --------------------------------------------------- 8. the screen ----- */
section('8. All three are read-outs on one screen');
{
  win.sdbRender();
  const html = win.document.getElementById('sdb-body').innerHTML;
  ok('tasks', />Tasks</.test(html));
  ok('the map', />Map corrections</.test(html));
  ok('who is working where', />Who is working where</.test(html));
  ok('and not one of them can be switched off', !/Turn off|Turn on/.test(html));
}

/* ------------------------------------------- 9. shapes travel too ------ */
section('9. A plot\'s shape reaches the other phone');
{
  win.PE_STORE.geom = {}; win.PE_STORE.added = []; win.PE_STORE.deleted = []; win.PE_STORE.cleared = {};
  const poly = { type: 'Polygon', coordinates: [[[-83.9594, 35.9016], [-83.9593, 35.9016], [-83.9593, 35.9017], [-83.9594, 35.9016]]] };
  win.PE_STORE.geom['B12'] = JSON.parse(JSON.stringify(poly));
  reset(); win.msyncScan();
  const w = wrote('mapplaces').find(x => x.id === 'B12');
  ok('the reshape is sent', !!w);
  ok('the shape travels as text, because the database cannot hold lists of lists',
     !!w && typeof w.data.geom === 'string', typeof (w && w.data.geom));
  ok('and it is the same shape written out', !!w && JSON.parse(w.data.geom).coordinates[0][0][0] === -83.9594);

  reset(); win.msyncScan();
  ok('the very next scan sends nothing', wrote('mapplaces').length === 0);

  /* The same record handed back, exactly as the database would hand it back. */
  emit('mapplaces', [{ type: 'modified', id: 'B12', data: JSON.parse(JSON.stringify(w.data)) }], false);
  reset(); win.msyncScan();
  ok('and it is not sent back when the database echoes it', wrote('mapplaces').length === 0,
     JSON.stringify(wrote('mapplaces')));
}
{
  /* Somebody else's new plot, in the shape it travels in. */
  const g = '{"type":"Polygon","coordinates":[[[-83.96,35.90],[-83.959,35.90],[-83.959,35.901],[-83.96,35.90]]]}';
  emit('mapplaces', [{ type: 'added', id: 'NEW1', data: { id: 'NEW1', added: { number: 'NEW1', geom: g }, updatedBy: 'p07' } }], false);
  const got = win.PE_STORE.added.find(a => a.number === 'NEW1');
  ok('a plot drawn on another phone arrives here', !!got);
  ok('and arrives as a real shape, not as text', !!got && got.geometry && got.geometry.type === 'Polygon',
     JSON.stringify(got));
  reset(); win.msyncScan();
  ok('and is not sent straight back, even though the other phone wrote 35.90 where '
     + 'this one writes 35.9', wrote('mapplaces').length === 0, JSON.stringify(wrote('mapplaces')));
}

/* ----------------------------------- 10. taking a correction back ------ */
section('10. A correction can be taken back, and it settles');
{
  /* Back to a plain B12 first. Section 4 left "the farm removed this plot's
     information" on it, and section 9 left a reshape; neither is what this
     section is about. */
  INFO()['B12'] = JSON.parse(win._mapBase.plotinfo['B12']);
  win.PE_STORE.geom = {}; win.PE_STORE.added = [];
  win.PE_STORE.deleted = ['B12']; win.PE_STORE.cleared = {};
  reset(); win.msyncScan();
  ok('taking a plot off the map is sent', wrote('mapplaces').some(x => x.id === 'B12' && x.data.removed === true));

  /* Putting it back. Dropping it locally says NOTHING on its own. */
  win.PE_STORE.deleted = [];
  reset(); win.msyncScan();
  ok('just forgetting it locally says nothing at all', wrote('mapplaces').length === 0);

  win.msyncClear('B12', ['removed']);        /* the order mergeBack uses: drop it, then say so */
  const w = wrote('mapplaces').find(x => x.id === 'B12');
  ok('msyncClear does say it', !!w && Array.isArray(w.data.clear) && w.data.clear.indexOf('removed') >= 0,
     JSON.stringify(w && w.data));
  ok('and it is a flat list of words the database can hold', state.badData.length === 0,
     JSON.stringify(state.badData));

  reset(); win.msyncScan();
  ok('and it goes quiet afterwards', wrote('mapplaces').length === 0, JSON.stringify(wrote('mapplaces')));

  /* On the other phone. B12 is a real plot in farm-geo.js, so "clear" means
     put it back to what the file says. */
  win.PE_STORE.deleted = ['B12']; win.PE_STORE.cleared = {};
  emit('mapplaces', [{ type: 'modified', id: 'B12', data: { id: 'B12', clear: ['removed'], updatedBy: 'p07' } }], false);
  ok('the other phone puts the plot back on the map', win.PE_STORE.deleted.indexOf('B12') < 0);
  reset(); win.msyncScan();
  ok('and does not argue about it', wrote('mapplaces').length === 0, JSON.stringify(wrote('mapplaces')));
}
{
  /* Withdrawing plot information restores what farm-geo.js says, which is NOT
     the same as a field carrying null -- that one means the farm took it off. */
  const fileSays = win._mapBase.plotinfo['B12'];      /* what farm-geo.js says */
  INFO()['B12'] = [['Turfgrass', 'Something wrong']];
  emit('mapplaces', [{ type: 'modified', id: 'B12', data: { id: 'B12', clear: ['plotinfo'], updatedBy: 'p07' } }], false);
  ok('a withdrawn correction goes back to what the file says',
     JSON.stringify(INFO()['B12']) === fileSays, JSON.stringify(INFO()['B12']));
}

/* ------------------------- 11. split, merge back and delete are real --- */
section('11. Split, merge back and delete are saved and shared');
{
  win.PE_STORE.geom = {}; win.PE_STORE.added = []; win.PE_STORE.deleted = []; win.PE_STORE.cleared = {};
  win.sessionSet('p07');                                   /* Bill */
  win.confirm = () => true;
  const target = win.PLOTS_DATA.features.find(f => (f.properties || {}).number && win.PLOT_INFO[(f.properties || {}).number]);
  const nm = target.properties.number;

  win.doSplit(nm, 2);
  const kids = win.PE_STORE.added.map(a => a.number).sort();
  ok('splitting writes the pieces down', kids.join(',') === nm + 'a,' + nm + 'b', kids.join(','));
  ok('and takes the parent off the map', win.PE_STORE.deleted.indexOf(nm) >= 0);
  ok('the parent keeps its own details, so merging back can restore them', !!win.PLOT_INFO[nm]);
  ok('each piece starts with the parent\'s details',
     JSON.stringify(win.PLOT_INFO[nm + 'a']) === JSON.stringify(win.PLOT_INFO[nm]));

  reset(); win.msyncScan();
  const ids = wrote('mapplaces').map(w => w.id).sort();
  ok('the split goes out to the farm', ids.indexOf(nm) >= 0 && ids.indexOf(nm + 'a') >= 0, ids.join(','));
  ok('nothing sent was a list inside a list', state.badData.length === 0, JSON.stringify(state.badData));
  reset(); win.msyncScan();
  ok('and then it goes quiet', wrote('mapplaces').length === 0, JSON.stringify(wrote('mapplaces')));

  reset();
  win.mergeBack(nm + 'a');
  ok('merging back drops the pieces', !win.PE_STORE.added.some(a => String(a.number).indexOf(nm) === 0));
  ok('and puts the parent back on the map', win.PE_STORE.deleted.indexOf(nm) < 0);
  const cleared = wrote('mapplaces').filter(w => w.data.clear);
  ok('and TELLS the database, or the split would come straight back', cleared.length >= 2,
     JSON.stringify(wrote('mapplaces').map(w => w.id)));
  reset(); win.msyncScan();
  ok('then it goes quiet', wrote('mapplaces').length === 0, JSON.stringify(wrote('mapplaces')));

  reset();
  win.deletePlot(nm);
  ok('the popup Delete is saved on the phone', win.PE_STORE.deleted.indexOf(nm) >= 0);
  win.msyncScan();
  ok('and goes out to the farm', wrote('mapplaces').some(w => w.id === nm && w.data.removed === true));
}

/* ---------------------------------------------- 12. the whole file ----- */
section('12. Nothing this file sent was a list inside a list');
ok('not one write the database would have refused', state.badData.length === 0,
   state.badData.map(b => b.coll + '/' + b.id + ' at ' + b.at).join(', '));
ok('the popup no longer calls its own edits a demo', !/Demo - edits are session only|Demo \u2014 edits are session only|Demo - session only/.test(appText));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
