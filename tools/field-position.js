/* NOTE: this is a readable copy. The version that actually runs is embedded in
   UT-TurfFarm-App.html under the same banner — edit there. Kept here so the
   module can be read on its own without scrolling through a 7,000-line file.

   ============================================================
   FIELD POSITION · where the person is, what they are near, where they
   have been, and who else is working the same job.

   Four pieces that all hang off one GPS watch:

     GEO   - a single navigator.geolocation watch, shared by every map and
             every listener. One watch, not one per screen: a second watch
             does not improve the fix and doubles the battery cost.
     PROX  - warns when the person carrying an open task walks up on a plot
             that is restricted *for that kind of work*. A no-fungicide plot
             is silent on a mowing job.
     COV   - breadcrumb coverage. Buffers the track by the deck width and
             paints the ground already worked, auto-completing an alley zone
             once it is mostly covered.
     CREW  - claims. When two people share a task, each zone or plot can be
             claimed by one of them so the same ground is not worked twice.

   CREW is prototyped over BroadcastChannel + localStorage, which syncs
   across tabs and windows on one machine. That is enough to demo the
   behaviour, and the read/write/subscribe shape is the same one Supabase
   Realtime uses, so swapping the transport later touches only crewSend and
   crewLoad. Nothing syncs between *devices* until that backend lands.
   ============================================================ */

/* ---------------------------------------------------------------- GEO ---- */

var GEO = {
  watch: null,            /* navigator.geolocation watch id */
  pos: null,              /* {lat,lng,acc,heading,speed,at} - null until first fix */
  err: null,              /* 'denied' | 'unavailable' | 'timeout' | null */
  subs: [],               /* fns called on every fix and every error */
  follow: true,           /* recentre the map as the dot moves */
  sim: null               /* {lat,lng,acc} - set by geoSim() to fake a fix */
};

var GEO_STALE_MS = 30000; /* older than this and the dot goes hollow */

function geoOn(fn)  { if (GEO.subs.indexOf(fn) < 0) GEO.subs.push(fn); }
function geoOff(fn) { var i = GEO.subs.indexOf(fn); if (i >= 0) GEO.subs.splice(i, 1); }
function geoEmit()  { GEO.subs.slice().forEach(function (f) { try { f(GEO.pos, GEO.err); } catch (e) {} }); }

function geoLatLng() { return GEO.pos ? [GEO.pos.lat, GEO.pos.lng] : null; }
function geoFresh()  { return !!GEO.pos && (Date.now() - GEO.pos.at) < GEO_STALE_MS; }

/* Feet per degree at the farm. The whole site is 1700 ft across, so a fixed
   local scale is exact enough and far cheaper than a full projection. */
var FT_DEG_LAT = 364566.9; /* ft per degree latitude */
var FT_DEG_LON = 295445.9; /* ft per degree longitude at 35.90 N */

function ftBetween(a, b) {
  if (!a || !b) return Infinity;
  var dx = (b[1] - a[1]) * FT_DEG_LON, dy = (b[0] - a[0]) * FT_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

function geoStart() {
  if (GEO.watch != null) return;
  if (GEO.sim) { geoEmit(); return; }
  if (!navigator.geolocation) { GEO.err = 'unavailable'; geoEmit(); return; }
  GEO.watch = navigator.geolocation.watchPosition(
    function (p) {
      GEO.err = null;
      GEO.pos = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        acc: p.coords.accuracy ? p.coords.accuracy * 3.28084 : null,  /* metres -> ft */
        heading: p.coords.heading,
        speed: p.coords.speed,
        at: Date.now()
      };
      geoEmit();
    },
    function (e) {
      GEO.err = (e && e.code === 1) ? 'denied' : ((e && e.code === 3) ? 'timeout' : 'unavailable');
      geoEmit();
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

function geoStop() {
  if (GEO.watch != null) { try { navigator.geolocation.clearWatch(GEO.watch); } catch (e) {} }
  GEO.watch = null;
}

/* Drop a fake fix in, for walking the farm from a desk. geoSim(35.9012,-83.9605) */
function geoSim(lat, lng, acc) {
  if (lat == null) { GEO.sim = null; geoStop(); geoStart(); return; }
  geoStop();
  GEO.sim = { lat: lat, lng: lng, acc: acc || 16 };
  GEO.err = null;
  GEO.pos = { lat: lat, lng: lng, acc: GEO.sim.acc, heading: null, speed: null, at: Date.now() };
  geoEmit();
}

function geoErrText() {
  if (GEO.err === 'denied')  return 'Location off · turn it on in your browser settings to see yourself on the map';
  if (GEO.err === 'timeout') return 'No GPS fix yet · move into the open';
  if (GEO.err)               return 'Location unavailable on this device';
  return '';
}

/* ---- the dot -------------------------------------------------------------
   One call per map. Returns a handle so a screen can drop it on teardown.
   The accuracy ring is drawn to scale, so a bad fix looks bad rather than
   quietly lying about where someone is standing. */
function geoDot(map, opts) {
  if (!map || typeof L === 'undefined') return null;
  opts = opts || {};
  var g = L.layerGroup().addTo(map);
  var ring = null, dot = null, first = true;

  function draw(pos) {
    if (!pos) { g.clearLayers(); ring = dot = null; return; }
    var ll = [pos.lat, pos.lng], stale = !geoFresh();
    if (!ring) {
      ring = L.circle(ll, { radius: 1, color: '#489FDF', weight: 1, opacity: .5,
                            fillColor: '#489FDF', fillOpacity: .12, interactive: false }).addTo(g);
      dot = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 3,
                                 fillColor: '#489FDF', fillOpacity: 1, interactive: false }).addTo(g);
    } else {
      ring.setLatLng(ll); dot.setLatLng(ll);
    }
    ring.setRadius(Math.max(2, (pos.acc || 33) / 3.28084));   /* Leaflet wants metres */
    dot.setStyle({ fillColor: stale ? '#9aa4ac' : '#489FDF', fillOpacity: stale ? .45 : 1 });
    ring.setStyle({ color: stale ? '#9aa4ac' : '#489FDF', fillColor: stale ? '#9aa4ac' : '#489FDF' });
    if (GEO.follow && (first || opts.follow !== false)) {
      try { if (first) map.setView(ll, Math.max(map.getZoom(), 19)); else map.panTo(ll, { animate: true }); } catch (e) {}
    }
    first = false;
  }

  function onFix(pos) { draw(pos); }
  geoOn(onFix);
  geoStart();
  if (GEO.pos) draw(GEO.pos);

  return {
    layer: g,
    remove: function () { geoOff(onFix); try { map.removeLayer(g); } catch (e) {} }
  };
}

/* --------------------------------------------------------------- PROX ---- */
/* Warn on approach to ground this job must stay off.

   Two rules keep this from becoming noise:
     - the restriction has to match the job kind (jobResCfg), so a mow task is
       silent on the fungicide holds sitting on the same plot;
     - each plot fires once per task per session, and re-arms only after the
       person has moved well clear of it. */

var PROX = {
  on: true,
  warnFt: 75,        /* fire at this range */
  clearFt: 130,      /* must get back past this before the same plot can fire again */
  fired: {},         /* 'taskId|plot' -> true while inside */
  task: null,        /* the task being worked, or null */
  lastToast: 0
};

function proxSetTask(task) {
  if (PROX.task && task && PROX.task.id === task.id) return;
  PROX.task = task || null;
  PROX.fired = {};
}

/* Every plot this job must stay off or work around, with the reason. */
function proxTargets(task) {
  if (!task || typeof TRIALS === 'undefined') return [];
  var cfg = jobResCfg(task.type, task.title);
  if (!cfg) return [];
  var out = [], seen = {};
  TRIALS.forEach(function (t) {
    if (!trVisible(t) || t.stage !== 'active') return;
    trLiveRes(t).forEach(function (r) {
      if (cfg.kinds.indexOf(r.type) < 0) return;
      var f = trPlotFeature(r.scope);
      if (!f) return;
      var k = r.scope + '|' + r.id;
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ plot: r.scope, feature: f, study: t, r: r, cfg: cfg,
                 partial: (typeof trResExtent === 'function' && trResExtent(t, r) === 'pin') });
    });
  });
  return out;
}

/* Distance in feet from a point to a plot, 0 when standing inside it. */
function proxDistFt(latlng, feature) {
  try {
    var pt = turf.point([latlng[1], latlng[0]]);
    if (turf.booleanPointInPolygon(pt, feature)) return 0;
    var line = turf.polygonToLine(feature);
    return turf.pointToLineDistance(pt, line, { units: 'feet' });
  } catch (e) {
    /* geometry hiccup - fall back to centroid range so the alert still fires */
    try {
      var c = turf.centroid(feature).geometry.coordinates;
      return ftBetween(latlng, [c[1], c[0]]);
    } catch (e2) { return Infinity; }
  }
}

function proxAlert(hit) {
  var cfg = hit.cfg;
  var head = (hit.partial ? cfg.around : cfg.stop) + ' · ' + hit.plot;
  var body = hit.r.note || hit.study.title;
  toast(head + ' — ' + body);
  if (typeof NOTIFS !== 'undefined') {
    NOTIFS.unshift({ t: head, s: body + ' · ' + hit.study.lab + ' lab', time: 'now', h: 0, c: '#c0392b' });
  }
  /* A phone in a pocket cannot show a toast. Ask once; the browser only
     delivers this while the page is alive, which is why real background
     alerts need the PWA wrapper. */
  try {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(head, { body: body, tag: 'prox-' + hit.plot });
    }
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
}

function proxCheck(pos) {
  if (!PROX.on || !pos || !PROX.task) return;
  if (!geoFresh()) return;
  /* A fix worse than the warning radius cannot tell inside from outside. */
  if (pos.acc && pos.acc > PROX.warnFt) return;
  var ll = [pos.lat, pos.lng];
  proxTargets(PROX.task).forEach(function (hit) {
    var key = PROX.task.id + '|' + hit.plot + '|' + hit.r.id;
    var d = proxDistFt(ll, hit.feature);
    if (d <= PROX.warnFt && !PROX.fired[key]) {
      PROX.fired[key] = true;
      proxAlert(hit);
    } else if (d > PROX.clearFt && PROX.fired[key]) {
      PROX.fired[key] = false;    /* walked clear - allow it to fire again */
    }
  });
}
geoOn(function (pos) { proxCheck(pos); });

/* Draw the restricted ground for the open task so the alert has something to
   point at. Red hatch = stay off, amber = work around. */
function proxLayer(map, task) {
  if (!map || !task) return null;
  var g = L.layerGroup().addTo(map);
  proxTargets(task).forEach(function (hit) {
    var c = hit.partial ? '#ff8200' : '#c0392b';
    L.geoJSON(hit.feature, {
      interactive: false,
      style: { color: c, weight: 2.2, dashArray: '6 5', fillColor: c, fillOpacity: .22 }
    }).addTo(g);
  });
  return { layer: g, remove: function () { try { map.removeLayer(g); } catch (e) {} } };
}

/* ---------------------------------------------------------------- COV ---- */
/* Breadcrumb coverage. Buffer the track by half the deck width and intersect
   it with each zone; a zone flips to done once COV_DONE_PCT of it is covered.

   The manual toggle stays live throughout. GPS drops under the tree line and
   behind the shop, and a person who has finished a zone must always be able
   to say so without arguing with a satellite. */

var COV = {};                 /* taskId -> {track:[], zones:{}, deckFt:n, poly:null} */
var COV_MIN_STEP_FT = 12;     /* ignore jitter smaller than this */
var COV_MAX_ACC_FT = 50;      /* a fix worse than this does not get to paint */
var COV_DONE_PCT = 0.85;      /* auto-complete threshold */
var COV_DEFAULT_DECK_FT = 6;

function covFor(taskId, deckFt) {
  if (!COV[taskId]) COV[taskId] = { track: [], zones: {}, deckFt: deckFt || COV_DEFAULT_DECK_FT, poly: null, auto: {} };
  if (deckFt) COV[taskId].deckFt = deckFt;
  return COV[taskId];
}

/* Deck width for the machine on the task, so the paint stroke matches the
   ground actually cut rather than a guess. */
function covDeckFt(task) {
  var w = task && task.deckFt;
  if (w) return w;
  var s = ((task && task.title) || '').toLowerCase();
  if (/weed ?eat|trim|backpack/.test(s)) return 3;
  if (/rotary/.test(s))  return 6;
  if (/2653|triplex/.test(s)) return 7;
  if (/fairway/.test(s)) return 16;
  if (/greens|walk/.test(s)) return 2;
  return COV_DEFAULT_DECK_FT;
}

function covPush(taskId, pos) {
  if (!pos || !pos.lat) return false;
  if (pos.acc && pos.acc > COV_MAX_ACC_FT) return false;
  var c = covFor(taskId);
  var last = c.track[c.track.length - 1];
  if (last && ftBetween([last[0], last[1]], [pos.lat, pos.lng]) < COV_MIN_STEP_FT) return false;
  c.track.push([pos.lat, pos.lng, pos.at || Date.now()]);
  c.poly = null;    /* invalidate the buffered shape */
  return true;
}

/* The painted shape: the track line, fattened by half the deck each side. */
function covPoly(taskId) {
  var c = covFor(taskId);
  if (c.poly) return c.poly;
  if (c.track.length < 2) return null;
  try {
    var line = turf.lineString(c.track.map(function (p) { return [p[1], p[0]]; }));
    c.poly = turf.buffer(line, c.deckFt / 2, { units: 'feet' });
  } catch (e) { c.poly = null; }
  return c.poly;
}

/* Fraction of one zone the track has covered, 0-1. */
function covZonePct(taskId, zoneId) {
  var poly = covPoly(taskId);
  if (!poly) return 0;
  var f = covZoneFeature(zoneId);
  if (!f) return 0;
  try {
    var hit = turf.intersect(turf.featureCollection([poly, f]));
    if (!hit) return 0;
    return Math.max(0, Math.min(1, turf.area(hit) / turf.area(f)));
  } catch (e) { return 0; }
}

function covZoneFeature(zoneId) {
  if (typeof ALLEY_ZONES === 'undefined') return null;
  var out = null;
  ALLEY_ZONES.features.forEach(function (f) { if ((f.properties || {}).zone === zoneId) out = f; });
  return out;
}

function covZones() {
  return (typeof ALLEY_ZONES === 'undefined') ? [] : ALLEY_ZONES.features.map(function (f) { return f.properties; });
}

/* Recompute every zone and report the ones that crossed the line this pass.
   Only zones the job actually targets are considered - no point costing a
   turf.intersect on ground nobody was asked to mow. */
function covRecalc(taskId, targets) {
  var c = covFor(taskId), crossed = [];
  (targets || []).forEach(function (zoneId) {
    if (!covZoneFeature(zoneId)) return;
    var pct = covZonePct(taskId, zoneId);
    c.zones[zoneId] = pct;
    if (pct >= COV_DONE_PCT && !c.auto[zoneId]) { c.auto[zoneId] = true; crossed.push(zoneId); }
  });
  return crossed;
}

function covPct(taskId, zoneId) { return (COV[taskId] && COV[taskId].zones[zoneId]) || 0; }

/* Paint the covered ground plus the raw track, so a person can see both what
   counted and where they actually drove. */
function covLayer(map, taskId) {
  if (!map) return null;
  var g = L.layerGroup().addTo(map);
  function redraw() {
    g.clearLayers();
    var poly = covPoly(taskId);
    if (poly) L.geoJSON(poly, { interactive: false,
      style: { color: '#2f9e4f', weight: 0, fillColor: '#2f9e4f', fillOpacity: .38 } }).addTo(g);
    var c = covFor(taskId);
    if (c.track.length > 1) {
      L.polyline(c.track.map(function (p) { return [p[0], p[1]]; }),
        { color: '#1e6b2e', weight: 1.5, opacity: .55, interactive: false }).addTo(g);
    }
  }
  redraw();
  return { layer: g, redraw: redraw, remove: function () { try { map.removeLayer(g); } catch (e) {} } };
}

/* --------------------------------------------------------------- CREW ---- */
/* Shared claims so two people on one task do not mow the same zone.

   Claim, not lock: a claim is advisory and expires. If someone's phone dies
   mid-zone the ground must not stay locked for the rest of the day, so a
   claim goes stale after CREW_TTL_MS without a heartbeat and anyone can pick
   it up. Completions, unlike claims, never expire. */

var CREW_KEY = 'utturf_crew_v1';
var CREW_TTL_MS = 8 * 60 * 1000;      /* a claim with no heartbeat for 8 min is free */
var CREW_BEAT_MS = 45 * 1000;
var CREW_CH = null;
var CREW_SUBS = [];

try { CREW_CH = new BroadcastChannel('utturf-crew'); } catch (e) { CREW_CH = null; }

function crewLoad() {
  try { return JSON.parse(localStorage.getItem(CREW_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function crewSave(db) {
  try { localStorage.setItem(CREW_KEY, JSON.stringify(db)); } catch (e) {}
}
/* The one place the transport lives. Swapping to Supabase Realtime replaces
   this body with a channel.send and leaves every caller untouched. */
function crewSend(db) {
  crewSave(db);
  try { if (CREW_CH) CREW_CH.postMessage({ at: Date.now() }); } catch (e) {}
  crewEmit();
}
function crewOn(fn)  { if (CREW_SUBS.indexOf(fn) < 0) CREW_SUBS.push(fn); }
function crewOff(fn) { var i = CREW_SUBS.indexOf(fn); if (i >= 0) CREW_SUBS.splice(i, 1); }
function crewEmit()  { CREW_SUBS.slice().forEach(function (f) { try { f(); } catch (e) {} }); }

if (CREW_CH) CREW_CH.onmessage = function () { crewEmit(); };
try {
  window.addEventListener('storage', function (e) { if (e.key === CREW_KEY) crewEmit(); });
} catch (e) {}

function crewTask(taskId) {
  var db = crewLoad();
  if (!db[taskId]) db[taskId] = { claims: {}, done: {} };
  return db;
}

/* Live claim on a unit, or null. Stale claims read as free. */
function crewClaim(taskId, unit) {
  var db = crewLoad(), t = db[taskId];
  if (!t || !t.claims) return null;
  var c = t.claims[unit];
  if (!c) return null;
  if (Date.now() - (c.beat || c.at || 0) > CREW_TTL_MS) return null;
  return c;
}

function crewDoneBy(taskId, unit) {
  var db = crewLoad(), t = db[taskId];
  return (t && t.done && t.done[unit]) || null;
}

/* Take a unit. Refuses if someone else holds a live claim, which is what
   stops the double mow. */
function crewTake(taskId, unit, who) {
  who = who || meName();
  var held = crewClaim(taskId, unit);
  if (held && held.who !== who) return { ok: false, by: held.who };
  var db = crewTask(taskId);
  db[taskId].claims[unit] = { who: who, at: (held && held.at) || Date.now(), beat: Date.now() };
  crewSend(db);
  return { ok: true };
}

function crewDrop(taskId, unit, who) {
  who = who || meName();
  var db = crewTask(taskId), c = db[taskId].claims[unit];
  if (c && c.who !== who) return false;
  delete db[taskId].claims[unit];
  crewSend(db);
  return true;
}

/* Finish a unit: record who and when, and release the claim. */
function crewComplete(taskId, unit, who, how) {
  who = who || meName();
  var db = crewTask(taskId);
  db[taskId].done[unit] = { who: who, at: Date.now(), how: how || 'tap' };
  delete db[taskId].claims[unit];
  crewSend(db);
}

function crewUncomplete(taskId, unit) {
  var db = crewTask(taskId);
  delete db[taskId].done[unit];
  crewSend(db);
}

function crewDoneList(taskId) {
  var db = crewLoad(), t = db[taskId];
  return (t && t.done) ? Object.keys(t.done) : [];
}

/* Everyone with a live claim on this task, for the "who else is out here" row. */
function crewOthers(taskId, me) {
  me = me || meName();
  var db = crewLoad(), t = db[taskId], out = {};
  if (!t || !t.claims) return [];
  Object.keys(t.claims).forEach(function (u) {
    var c = t.claims[u];
    if (!c || c.who === me) return;
    if (Date.now() - (c.beat || c.at || 0) > CREW_TTL_MS) return;
    (out[c.who] = out[c.who] || []).push(u);
  });
  return Object.keys(out).map(function (w) { return { who: w, units: out[w] }; });
}

/* Keep my own claims alive while I am actually on the task. */
var _crewBeat = null;
function crewHeartbeat(taskId, on) {
  if (_crewBeat) { clearInterval(_crewBeat); _crewBeat = null; }
  if (!on || !taskId) return;
  _crewBeat = setInterval(function () {
    var me = meName(), db = crewLoad(), t = db[taskId];
    if (!t || !t.claims) return;
    var touched = false;
    Object.keys(t.claims).forEach(function (u) {
      if (t.claims[u].who === me) { t.claims[u].beat = Date.now(); touched = true; }
    });
    if (touched) crewSave(db);
  }, CREW_BEAT_MS);
}

/* Colour per person so the map reads at a glance. Stable by name, not by
   join order, so Maria is the same colour on everyone's screen. */
var CREW_COLORS = ['#489FDF', '#9b59b6', '#e67e22', '#16a085', '#c0392b', '#2c3e50'];
function crewColor(who) {
  var h = 0, s = who || '';
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return CREW_COLORS[h % CREW_COLORS.length];
}
