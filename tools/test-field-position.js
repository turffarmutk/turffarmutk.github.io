/*
 * Harness for the field-position features.
 *
 * The app is one HTML file that expects Leaflet, Geoman and a browser. This
 * loads it into jsdom with a real Turf.js and a stub Leaflet, then drives the
 * zone / coverage / claim / proximity logic the way a person on a mower would:
 * walk a track, watch zones paint themselves, and have a second person try to
 * take ground that is already claimed.
 *
 * Run:  node tools/test-field-position.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- a Leaflet stub with just enough shape to let the draw code run ---- */
function makeL() {
  const bounds = (pts) => ({
    _pts: pts,
    getSouthWest: () => ({ lat: Math.min(...pts.map(p => p[0])), lng: Math.min(...pts.map(p => p[1])) }),
    getNorthEast: () => ({ lat: Math.max(...pts.map(p => p[0])), lng: Math.max(...pts.map(p => p[1])) }),
    getCenter: () => ({
      lat: (Math.min(...pts.map(p => p[0])) + Math.max(...pts.map(p => p[0]))) / 2,
      lng: (Math.min(...pts.map(p => p[1])) + Math.max(...pts.map(p => p[1]))) / 2
    }),
    extend() { return this; },
    pad() { return this; }
  });
  const coordsOf = (geojson) => {
    const out = [];
    turf.coordEach(geojson, (c) => out.push([c[1], c[0]]));
    return out.length ? out : [[0, 0]];
  };
  const layerish = (pts) => ({
    _h: {},
    addTo(g) { if (g && g._add) g._add(this); return this; },
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; },
    fire(ev) { (this._h[ev] || []).forEach(f => f({})); },
    bindPopup() { return this; },
    closePopup() { return this; },
    getBounds: () => bounds(pts),
    setLatLng() { return this; },
    setRadius() { return this; },
    setStyle() { return this; }
  });
  const group = () => {
    const g = { _kids: [], _add(x) { this._kids.push(x); }, clearLayers() { this._kids = []; },
                addTo(m) { if (m && m._add) m._add(this); return this; } };
    return g;
  };
  const L = {
    map: () => ({ _add() {}, _layers: [], on() {}, setView() { return this; }, panTo() {},
                  getZoom: () => 20, getMaxZoom: () => 22, getBoundsZoom: () => 20,
                  invalidateSize() {}, hasLayer: () => true, addLayer() {}, removeLayer() {},
                  getContainer: () => null, remove() {}, fitBounds() {} }),
    tileLayer: () => ({ addTo() { return this; } }),
    canvas: () => ({}),
    control: { zoom: () => ({ addTo() {} }) },
    layerGroup: group,
    geoJSON: (gj) => Object.assign(layerish(coordsOf(gj)), { _gj: gj }),
    polygon: (pts) => layerish(pts),
    polyline: (pts) => layerish(pts),
    circle: (ll) => layerish([ll]),
    circleMarker: (ll) => layerish([ll]),
    marker: (ll) => layerish([ll]),
    divIcon: (o) => o,
    point: (a, b) => ({ x: a, y: b }),
    latLngBounds: (sw, ne) => bounds([[sw.lat, sw.lng], [ne.lat, ne.lng]]),
    DomEvent: { stop() {} }
  };
  return L;
}

/* ---- boot the app ---- */
const html = fs.readFileSync(APP, 'utf8');
const vc = new VirtualConsole();
const seen = [];
vc.on('jsdomError', e => seen.push(e.message));

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  virtualConsole: vc,
  url: 'https://localhost/'
});
const win = dom.window;

win.L = makeL();
win.turf = turf;
win.BroadcastChannel = class { constructor() {} postMessage() {} close() {} };
/* this jsdom build has no rAF; the app uses it to nudge map label offsets */
if (!win.requestAnimationFrame) win.requestAnimationFrame = (fn) => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null),
           setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } },
  configurable: true
});
/* a geolocation that does nothing until the test drives it via geoSim */
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {} };

/* The app's script blocks share one scope in the browser, and some of its state
   is `let`-bound - which an eval keeps to itself. Concatenate the blocks into a
   single eval and hand the let-bound names back out at the end. */
const scripts = [require('./_geo').geoSource(), ...dom.window.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
const EXPORTS = ['TASKS', 'TRIALS', 'STUDENTS', 'CREW', 'currentRole'];
const source = scripts.join('\n;\n')
  + '\n;window.__app={' + EXPORTS.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};';
try { win.eval(source); }
catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
const APPV = win.__app || {};
EXPORTS.forEach(n => { if (win[n] === undefined && APPV[n] !== undefined) win[n] = APPV[n]; });

/* Somebody has to be signed in. The app now boots to the sign-in screen with
   SESSION.pid null, and claims, punches and completions are all recorded
   against the signed-in person's roster id — so a harness that skips sign-in
   is testing an app nobody is holding. Garrett (p18) is the undergrad the
   alley job is assigned to. */
win.sessionSet('p18');
const ME = win.SESSION.pid;

/* ================================================================ tests == */

section('Zones');
/* These three used to assert 10 zones totalling 10.02 acres, which is what the
   original merge of ALLEYS_DATA produced. AZ11 (the CAFS alleyways) was added
   afterwards and is gravel ground that was never part of that merged polygon,
   so it is genuinely extra area rather than a double-count. The assertions were
   never updated and had been failing on main since; they now pin the real
   shape, and AZ11 is checked against the alley polygon separately. */
ok('ALLEY_ZONES loaded', win.ALLEY_ZONES && win.ALLEY_ZONES.features.length === 11,
   win.ALLEY_ZONES && win.ALLEY_ZONES.features.length);

const zoneAcres = win.ALLEY_ZONES.features.reduce((a, f) => a + f.properties.acres, 0);
ok('zones total ~11.5 acres', Math.abs(zoneAcres - 11.48) < 0.1, zoneAcres.toFixed(2));

/* The ten mown zones still tile the original alley shape exactly. AZ11 is
   excluded because it covers ground that shape never included. */
const alleyArea = turf.area(win.ALLEYS_DATA.features[0]) * 10.7639;
const mown = win.ALLEY_ZONES.features.filter(f => f.properties.zone !== 'AZ11');
const zoneArea = mown.reduce((a, f) => a + turf.area(f), 0) * 10.7639;
ok('the ten mown zones cover the original alley polygon (within 1%)',
   Math.abs(zoneArea - alleyArea) / alleyArea < 0.01,
   'alley ' + Math.round(alleyArea) + ' sqft vs zones ' + Math.round(zoneArea));

let overlap = 0;
const zf = win.ALLEY_ZONES.features;
for (let i = 0; i < zf.length; i++) {
  for (let j = i + 1; j < zf.length; j++) {
    const hit = turf.intersect(turf.featureCollection([zf[i], zf[j]]));
    if (hit) overlap += turf.area(hit);
  }
}
ok('no zone overlaps another', overlap * 10.7639 < 1, (overlap * 10.7639).toFixed(2) + ' sqft');
ok('every zone geometry is valid polygon',
   zf.every(f => /Polygon$/.test(f.geometry.type) && turf.area(f) > 0));
ok('zone work estimates are sane (3-70 min)',
   zf.every(f => f.properties.est_min >= 3 && f.properties.est_min <= 70),
   zf.map(f => f.properties.est_min).join(','));

section('Alley job resolves to zones');
/* A fixture, not a seed row. Demo tasks were removed from the app on
   2026-08-24 — only equipment, the roster and the task catalog ship
   pre-loaded now — so this test brings the two-person alley job it needs.
   Same shape the assign screen writes: a second person rides in `helpers`. */
if (!win.TASKS.some(t => t.id === 't21')) win.TASKS.push({
  id:'t21', title:'Rotary Mow \u00b7 Alleys', area:'Alleys & borders', machine:'e3',
  mowDir:'12\u20136', dblMow:false, assignee:'p18', helpers:['p20'],
  status:'todo', kind:'task', type:'Mow', repeat:'Daily',
  badge:{t:'2 crew', bg:'#e8eff5', fg:'#42688a'},
  dueAt: win.atToday('06:30'), desc:'Fixture alley job.'
});
const alleyTask = win.TASKS.find(t => t.id === 't21');
ok('the two-person alley job is on the board', !!alleyTask);
ok('job carries two people', win.taskCrew(alleyTask).length === 2, win.taskCrew(alleyTask).join('/'));
/* Read the crew off the task rather than hard-coding names - the seed data
   carries real people and those change. */
const A_NAME = win.taskCrew(alleyTask)[0];
const B_NAME = win.taskCrew(alleyTask)[1];        /* a roster id, e.g. 'p20' */
const B_LABEL = win.nameOf(B_NAME);              /* what the screen actually prints */
const C_NAME = 'Somebody Else';
ok('taskIsFor matches the helper', win.taskIsFor(alleyTask, B_NAME), B_NAME);
ok('taskIsFor rejects someone not on the job', !win.taskIsFor(alleyTask, C_NAME));

const targets = win.taskPlots(alleyTask);
ok('alley job targets 10 zones, not one unit', targets.length === 10 && targets.every(win.jobIsZone),
   targets.length + ' targets');
ok('area label reads as zones', win.areaLabel(targets) === 'Alleys & borders · 10 zones', win.areaLabel(targets));
ok('plot summary reads as acres', /10 zones · 10\.0 acres/.test(win.plotsSummary(targets)),
   win.plotsSummary(targets));
ok('legacy ALLEYS unit still labels', win.areaLabel(['ALLEYS']) === 'Alleys & borders');

section('Claims stop the double mow');
const TID = 't21';
/* Two people are two devices, so the names go in explicitly rather than
   leaning on whichever role this harness happens to be signed in as. */
ok('zone starts unclaimed', win.crewClaim(TID, 'AZ07') === null);
ok('the first person takes AZ07', win.crewTake(TID, 'AZ07', A_NAME).ok);
ok('the claim reads back as theirs', win.crewClaim(TID, 'AZ07').who === A_NAME);
const grab = win.crewTake(TID, 'AZ07', B_NAME);
ok('the second person is refused AZ07', grab.ok === false && grab.by === A_NAME, JSON.stringify(grab));
ok('but can take a different zone', win.crewTake(TID, 'AZ08', B_NAME).ok);
ok('the first person sees them on AZ08',
   win.crewOthers(TID, A_NAME).some(o => o.who === B_NAME && o.units.indexOf('AZ08') >= 0));
win.crewComplete(TID, 'AZ07', A_NAME, 'tap');
ok('completing releases the claim', win.crewClaim(TID, 'AZ07') === null);
ok('completion is recorded against the person', win.crewDoneBy(TID, 'AZ07').who === A_NAME);
ok('done list is shared', win.crewDoneList(TID).indexOf('AZ07') >= 0);

/* a claim whose phone went quiet must not lock the ground forever */
const db = JSON.parse(store['utturf_crew_v1']);
db[TID].claims['AZ09'] = { who: C_NAME, at: Date.now() - 60 * 60 * 1000, beat: Date.now() - 60 * 60 * 1000 };
store['utturf_crew_v1'] = JSON.stringify(db);
ok('a stale claim reads as free', win.crewClaim(TID, 'AZ09') === null);
ok('anyone can take a staled zone', win.crewTake(TID, 'AZ09', B_NAME).ok);

section('Coverage painting');
const zoneId = 'AZ10';        /* A Block - one contiguous patch, quick to drive */
const zone = win.jobZoneFeature(zoneId);
ok('picked a real zone to walk', !!zone, zoneId);

/* Drive a boustrophedon mow across the zone, the way the machine actually
   runs it: up one pass, over a deck width, back down the next. */
const bb = turf.bbox(zone);          /* [minX,minY,maxX,maxY] */
win.covFor(TID, 6);
const deckDeg = 6 / 295445.9;        /* 6 ft of longitude in degrees */
let painted = 0;
for (let x = bb[0]; x <= bb[2]; x += deckDeg * 0.9) {
  const up = (painted % 2 === 0);
  const steps = 90;
  for (let s = 0; s <= steps; s++) {
    const fy = up ? s / steps : 1 - s / steps;
    const y = bb[1] + (bb[3] - bb[1]) * fy;
    win.covPush(TID, { lat: y, lng: x, acc: 15, at: Date.now() });
  }
  painted++;
}
ok('breadcrumbs recorded', win.COV[TID].track.length > 100, win.COV[TID].track.length + ' points');
ok('jitter below the step threshold is dropped',
   win.covPush(TID, { lat: win.COV[TID].track.at(-1)[0] + 0.000001,
                      lng: win.COV[TID].track.at(-1)[1], acc: 15, at: Date.now() }) === false);
ok('a bad fix is not allowed to paint',
   win.covPush(TID, { lat: bb[1], lng: bb[0], acc: 200, at: Date.now() }) === false);

const pct = win.covZonePct(TID, zoneId);
ok('mowing the zone covers most of it', pct > 0.85, (pct * 100).toFixed(1) + '%');

const untouched = win.covZonePct(TID, 'AZ02');
ok('a zone nobody drove stays at 0%', untouched < 0.02, (untouched * 100).toFixed(1) + '%');

const crossed = win.covRecalc(TID, targets);
ok('the mown zone auto-completes', crossed.indexOf(zoneId) >= 0, crossed.join(','));
ok('auto-complete fires once, not every fix', win.covRecalc(TID, targets).indexOf(zoneId) < 0);

ok('deck width comes off the machine, not a guess',
   win.covDeckFt({ title: 'Weedeat' }) === 3 &&
   win.covDeckFt({ title: 'Fairway Mow' }) === 16 &&
   win.covDeckFt({ title: 'Rotary Mow · Alleys' }) === 6);

section('Restriction proximity');
/* Fixtures, not seed rows — the demo tasks and the sample trials that carried
   restrictions were both removed from the app on 2026-08-24. This section is
   about whether a MOW job sees mow holds and a SPRAY job sees fungicide holds,
   so it needs one plot carrying one of each. */
if (!win.TASKS.some(t => t.id === 't1')) win.TASKS.push({
  id:'t1', title:'Fairway Mow', area:'Fairway-mown plots', machine:'e1',
  mowDir:'12\u20136', dblMow:false, assignee:'p18', status:'todo', kind:'task',
  type:'Mow', repeat:'Daily', dueAt:win.atToday('06:00'), plots:['B14']
});
if (!win.TASKS.some(t => t.id === 't2')) win.TASKS.push({
  id:'t2', title:'Spray Pesticide (John Deere) \u00b7 Fungicide', area:'B12\u2013B14',
  plots:['B12','B13','B14'], machine:'e2', assignee:'p18', status:'todo',
  kind:'task', type:'Spray', repeat:'None', dueAt:win.atToday('06:30')
});
if (!win.TRIALS.some(t => t.id === 's-fixture')) win.TRIALS.push({
  id:'s-fixture', title:'Fixture \u2014 holds on B14', lab:'Sorochan', pi:'p13', owner:'p01',
  stage:'active', multiPlot:false, coverage:'full', pin:null,
  start:'2020-01-01', end:'2099-12-31',
  locations:[{plot:'B14', sqft:7500}],
  restrictions:[
    {id:'r-mow',  type:'mow',       scope:'B14', note:'Fixture mow hold',
     start:'2020-01-01', end:'2099-12-31', by:'p01'},
    {id:'r-fung', type:'fungicide', scope:'B14', note:'Fixture fungicide hold',
     start:'2020-01-01', end:'2099-12-31', by:'p01'}
  ]
});
const mowTask = win.TASKS.find(t => t.id === 't1');     /* Fairway Mow */
const sprayTask = win.TASKS.find(t => t.id === 't2');   /* Fungicide spray */
const mowHits = win.proxTargets(mowTask).map(h => h.plot + ':' + h.r.type);
const sprayHits = win.proxTargets(sprayTask).map(h => h.plot + ':' + h.r.type);
ok('a mow job only picks up mow restrictions',
   mowHits.length > 0 && mowHits.every(s => /:mow$/.test(s)), mowHits.join(', '));
ok('a fungicide job picks up fungicide restrictions, not mow holds',
   sprayHits.length > 0 && sprayHits.every(s => /:fungicide$/.test(s)), sprayHits.join(', '));

const b14 = win.trPlotFeature('B14');
const c = turf.centroid(b14).geometry.coordinates;
ok('standing in the plot reads as 0 ft', win.proxDistFt([c[1], c[0]], b14) === 0);
/* step 300 ft east of the plot centre */
const far = [c[1], c[0] + 300 / 295445.9];
const d = win.proxDistFt(far, b14);
ok('distance falls off outside the plot', d > 100 && d < 350, Math.round(d) + ' ft');

win.proxSetTask(mowTask);
let alerts = 0;
const realToast = win.toast;
win.toast = (m) => { alerts++; };
/* walk in from far away, then right up to the restricted plot */
win.geoSim(c[1] + 0.004, c[0], 12);
const farAlerts = alerts;
win.geoSim(c[1], c[0], 12);
ok('no alert while well clear of the plot', farAlerts === 0, farAlerts + ' alerts');
ok('alert fires on approach', alerts === 1, alerts + ' alerts');
win.geoSim(c[1] + 0.00001, c[0], 12);
ok('it does not fire again while still there', alerts === 1, alerts + ' alerts');
win.geoSim(c[1] + 0.004, c[0], 12);          /* walk away past the clear radius */
win.geoSim(c[1], c[0], 12);                  /* and come back */
ok('it re-arms after walking clear', alerts === 2, alerts + ' alerts');

alerts = 0;
win.geoSim(c[1] + 0.004, c[0], 12);
win.geoSim(c[1], c[0], 400);                 /* a 400 ft fix cannot tell inside from out */
ok('a useless fix is not allowed to alert', alerts === 0, alerts + ' alerts');
win.toast = realToast;

section('GPS dot');
ok('geoSim produces a position', !!win.geoLatLng());
ok('position is fresh', win.geoFresh());
win.GEO.pos.at = Date.now() - 60000;
ok('an old fix reads as stale', !win.geoFresh());
ok('permission-denied has copy for the user',
   (win.GEO.err = 'denied', /turn it on/.test(win.geoErrText())));
win.GEO.err = null;

section('Work screen renders the zone job');
let renderErr = null;
try {
  win.geoSim(null);                    /* back to the real (stubbed) watch */
  win.workTaskId = 't21';
  alleyTask.donePlots = [];
  win.twBrief = false;
  win.renderTaskWork();
} catch (e) { renderErr = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
ok('renderTaskWork survives a zone job', !renderErr, renderErr);
ok('chip row says Zones, not Plots',
   win.document.getElementById('tw-kind').textContent === 'Zones',
   win.document.getElementById('tw-kind').textContent);
ok('progress counts zones',
   /\/ 10 done/.test(win.document.getElementById('tw-progress').textContent),
   win.document.getElementById('tw-progress').textContent);
ok('hint tells them to take a zone',
   /paints itself/.test(win.document.getElementById('tw-hint').textContent),
   win.document.getElementById('tw-hint').textContent);
ok('crew row shows the other person on the job',
   win.document.getElementById('tw-crew').innerHTML.indexOf(B_LABEL) >= 0);
ok('finish button counts zones',
   /zones to finish/.test(win.document.getElementById('tw-complete').textContent),
   win.document.getElementById('tw-complete').textContent);

/* and a plain plot job still behaves the way it always did */
let plotErr = null;
try { win.workTaskId = 't1'; win.twBrief = false; win.renderTaskWork(); }
catch (e) { plotErr = e.message; }
ok('renderTaskWork still handles a plot job', !plotErr, plotErr);
ok('plot job chip row still says its own kind',
   win.document.getElementById('tw-kind').textContent !== 'Zones',
   win.document.getElementById('tw-kind').textContent);

section('Tapping a zone: claim, then done');
/* Grab the tap handler the work screen hands to the map, and use it the way a
   thumb would. */
let lastDraw = null;
const realDraw = win.jobMapDraw;
win.jobMapDraw = function (st, o) { lastDraw = o; return realDraw.call(this, st, o); };
win.workTaskId = 't21';
alleyTask.donePlots = [];
win.crewUncomplete('t21', 'AZ07');
win.renderTaskWork();
const tap = lastDraw && lastDraw.onTap;
ok('work map exposes a tap handler', typeof tap === 'function');
ok('taskId is passed to the map so it can show claims', lastDraw.taskId === 't21');

const zoneInfo = { blocked: false, partial: false, zone: true, taken: false, claim: null, res: { full: [], pin: [] } };
tap('AZ03', zoneInfo);
ok('first tap claims, does not complete',
   win.crewClaim('t21', 'AZ03') && alleyTask.donePlots.indexOf('AZ03') < 0);
tap('AZ03', { ...zoneInfo, claim: win.crewClaim('t21', 'AZ03') });
ok('second tap completes it', alleyTask.donePlots.indexOf('AZ03') >= 0 && !!win.crewDoneBy('t21', 'AZ03'));
tap('AZ03', zoneInfo);
ok('third tap reopens it', alleyTask.donePlots.indexOf('AZ03') < 0 && !win.crewDoneBy('t21', 'AZ03'));

/* the other person's ground is not tappable */
win.crewTake('t21', 'AZ05', B_NAME);
win.renderTaskWork();
let blockedToast = '';
const t0 = win.toast; win.toast = (m) => { blockedToast = m; };
lastDraw.onTap('AZ05', { blocked: false, partial: false, zone: true, taken: true,
                         claim: win.crewClaim('t21', 'AZ05'), res: { full: [], pin: [] } });
win.toast = t0;
ok('tapping a claimed zone is refused with a name',
   blockedToast.indexOf(B_LABEL + ' is on') === 0 && alleyTask.donePlots.indexOf('AZ05') < 0, blockedToast);
win.jobMapDraw = realDraw;

section('GPS finishes a zone without anyone tapping');
alleyTask.donePlots = [];
win.COV['t21'] = null; win.covFor('t21', 6);
win.workTaskId = 't21';
win.renderTaskWork();                      /* installs the fix handler */
const walkZone = win.jobZoneFeature('AZ04');
const wb = turf.bbox(walkZone);
const deckD = 6 / 295445.9;
let n = 0;
const t1 = Date.now();
for (let x = wb[0]; x <= wb[2]; x += deckD * 0.9) {
  for (let s = 0; s <= 90; s++) {
    const fy = (n % 2 === 0) ? s / 90 : 1 - s / 90;
    win.geoSim(wb[1] + (wb[3] - wb[1]) * fy, x, 15);
  }
  n++;
}
const fixes = win.COV['t21'].track.length;
const perFix = (Date.now() - t1) / fixes;
ok('a full zone of driving stays cheap per fix (<8 ms)', perFix < 8, perFix.toFixed(2) + ' ms/fix over ' + fixes + ' fixes');
/* force the throttled check that a real session would hit a few seconds in */
win.TW.lastCheck = 0;
const t2 = Date.now();
win.geoSim(wb[1], wb[0] + deckD, 15);
ok('the zone re-measure is fast enough to run on a phone (<1500 ms)',
   Date.now() - t2 < 1500, (Date.now() - t2) + ' ms');
ok('driving the zone checks it off on its own',
   alleyTask.donePlots.indexOf('AZ04') >= 0,
   'coverage ' + Math.round(win.covPct('t21', 'AZ04') * 100) + '%');
ok('and records it as GPS, not a tap',
   (win.crewDoneBy('t21', 'AZ04') || {}).how === 'gps');
ok('a zone that was never driven stays open', alleyTask.donePlots.indexOf('AZ01') < 0);

/* leaving the screen must hand back anything claimed but unfinished */
win.crewTake('t21', 'AZ10', ME);
win.TW.taskId = 't21';
win.twStop();
ok('walking away releases an unfinished claim', win.crewClaim('t21', 'AZ10') === null);
ok('walking away does not undo finished ground', !!win.crewDoneBy('t21', 'AZ04'));

section('Assigning the job still works');
/* Bill picks ground in "pick" mode, where claims are irrelevant and no taskId
   is passed - the zone branch has to cope with that. */
let pickErr = null;
try {
  const st = win.jobMapEnsure('pick-test', 'twmap');
  win.jobMapDraw(st, { mode: 'pick', targets: targets, sel: ['AZ01', 'AZ02'],
                       jobType: 'Mow', jobName: 'Rotary - Alleys', fitKey: 'pick' });
} catch (e) { pickErr = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
ok('the assign wizard can draw zones with no task attached', !pickErr, pickErr);

section('The GPS watch is shared, not fought over');
win.GEO.holds = 0; win.GEO.sim = null; win.GEO.watch = null;
let watches = 0, clears = 0;
win.navigator.geolocation = { watchPosition: () => { watches++; return watches; },
                              clearWatch: () => { clears++; }, getCurrentPosition: () => {} };
const mapStub = win.L.map();
const dotA = win.geoDot(mapStub);
ok('one watch for the first consumer', watches === 1 && win.GEO.holds === 1);
win.TW.held = false; win.TW.taskId = 't21';
win.geoAcquire();
ok('a second consumer reuses the same watch', watches === 1 && win.GEO.holds === 2);
win.geoRelease();
ok('releasing one consumer does not blind the other', clears === 0 && win.GEO.watch !== null);
dotA.remove();
ok('the watch stops once nobody wants it', clears === 1 && win.GEO.holds === 0);

section('Load errors');
ok('no uncaught errors while booting the app', seen.length === 0, seen.join(' | '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
