/*
 * Builds the PLACES table — one record for every named piece of ground the app
 * can point at — from the six globals in farm-geo.js.
 *
 * Why this exists: tasks, the field log, trials and the map all refer to ground
 * by a bare string ("CAFS9", "Shop", "Alleys"). Nothing said what KIND of thing
 * that string was, so the app had no way to know that eight of the 166 shapes
 * are buildings, or that two of the PLOT_INFO rows are totals with no shape at
 * all. Getting that wrong means a mow task can be created for the Chemical
 * Building, and a spray rate can be computed from a polygon that was never
 * survey-accurate.
 *
 * Run:  node tools/build-places.js > places.js
 */
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '..', 'farm-geo.js'), 'utf8'));

const shapes = new Map();
PLOTS_DATA.features.forEach(f => shapes.set(f.properties.number, f));

const val = (n, label) => {
  const row = (PLOT_INFO[n] || []).find(p => p[0] === label);
  return row ? row[1] : null;
};

/* The CAFS polygons are a synthetic grid drawn to sit roughly in the right
   place. Their computed area is meaningless, so area must come from PLOT_INFO
   and the schema has to SAY so rather than leaving it in a comment. */
const synthetic = n => /^CAFS/.test(n);

function surfaceOf(n) {
  const turf = (val(n, 'Turfgrass') || '').toLowerCase();
  const type = (val(n, 'Type') || '').toLowerCase();
  const root = (val(n, 'Rootzone') || '').toLowerCase();
  if (type === 'synthetic') return 'synthetic';
  if (type === 'track' || /track/.test(turf)) return 'track';
  if (/gravel/.test(root) || /gravel/.test(turf)) return 'gravel';
  /* "Open" means nothing was planted there, not that nothing grows there.
     CAFS53 and O3 are both "Open" and both have a mower and a cut height —
     they are rough ground that still gets cut. A mower assignment is the
     honest test: nobody mows gravel. */
  if (MGMT_DATA[n] && MGMT_DATA[n].m) return 'turf';
  if (turf === 'open' || turf === '') return 'bare';
  return 'turf';
}

const places = [];

/* --- research plots -------------------------------------------------------
   Everything with turf information. All but the two aggregates have a shape. */
Object.keys(PLOT_INFO).forEach(n => {
  const aggregate = !shapes.has(n);
  const m = MGMT_DATA[n] || {};
  const parent = (SUBDIV.find(p => n !== p && n.startsWith(p) && /[a-z]$/.test(n))) || null;
  const area = val(n, 'Area (sq ft)');
  places.push({
    id: n,
    kind: aggregate ? 'aggregate' : 'plot',
    name: n,
    block: val(n, 'Area') || null,
    parent,
    hasShape: !aggregate,
    surface: surfaceOf(n),
    areaSqft: area == null ? null : Number(String(area).replace(/,/g, '')),
    /* false = the polygon is a stand-in, never measure it */
    areaFromShape: !aggregate && !synthetic(n),
    mower: m.m || null,
    cutHeightIn: m.c == null ? null : m.c,
    irrigationHeads: m.h == null ? null : m.h,
    mowable: !!m.m,
    active: true
  });
});

/* --- facilities -----------------------------------------------------------
   Shapes with no turf information: buildings and dump piles. Work is never
   assigned to these, but the map draws them and people navigate by them. */
[...shapes.keys()].filter(n => !PLOT_INFO[n]).forEach(n => {
  places.push({
    id: n, kind: 'facility', name: n, block: 'Facilities', parent: null,
    hasShape: true, surface: /dump pile/i.test(n) ? 'bare' : 'building',
    areaSqft: null, areaFromShape: false,
    mower: null, cutHeightIn: null, irrigationHeads: null,
    mowable: false, active: true
  });
});

/* --- alley work zones -----------------------------------------------------
   The eleven zones the alley network is cut into. AZ11 is gravel: it is
   sprayed, never mowed, and it stays in the rotation because the rotation is
   about covering ground rather than cutting it. */
ALLEY_ZONES.features.forEach(f => {
  const p = f.properties;
  places.push({
    id: p.zone, kind: 'alley_zone', name: p.name, block: p.block, parent: null,
    hasShape: true,
    surface: p.zone === 'AZ11' ? 'gravel' : 'turf',
    areaSqft: p.sqft, areaFromShape: true,
    mower: null, cutHeightIn: null, irrigationHeads: null,
    mowable: p.zone !== 'AZ11',
    estMinutes: p.est_min,
    active: true
  });
});

/* split parents are a label, not ground you can work on */
SUBDIV.forEach(p => {
  places.push({
    id: p, kind: 'split_parent', name: p, block: null, parent: null,
    hasShape: false, surface: null, areaSqft: null, areaFromShape: false,
    mower: null, cutHeightIn: null, irrigationHeads: null,
    mowable: false, active: true
  });
});

if (require.main === module) {
  const counts = places.reduce((a, p) => (a[p.kind] = (a[p.kind] || 0) + 1, a), {});
  process.stderr.write(JSON.stringify(counts, null, 1) + '\n');
  process.stderr.write('total ' + places.length + '\n');
  fs.writeFileSync(path.join(__dirname, '..', 'places.json'), JSON.stringify(places, null, 1));
}
module.exports = { places };

/* ---- emit the block that goes at the end of farm-geo.js ---- */
function emit(list) {
  const q = v => v === null ? 'null' : (typeof v === 'string' ? "'" + v.replace(/'/g, "\\'") + "'" : String(v));
  const KEYS = ['kind','name','block','parent','hasShape','surface','areaSqft',
                'areaFromShape','mower','cutHeightIn','irrigationHeads','mowable','estMinutes','active'];
  const rows = list.map(p => {
    const body = KEYS.filter(k => p[k] !== undefined)
                     .map(k => k + ':' + q(p[k])).join(',');
    return '  ' + JSON.stringify(p.id) + ':{' + body + '}';
  });
  return `
/* ---------------------------------------------------------------- PLACES ----
   Every named piece of ground the app can point at, in one table, each saying
   what KIND of thing it is. Generated by tools/build-places.js from the tables
   above — do not hand-edit; edit the source and re-run.

   Before this existed, a place was a bare string. Nothing distinguished a
   research plot from the Chemical Building, so an app that let you assign a
   mow to "CAFS9" would equally let you assign one to "Shop", and a spray rate
   could be worked out from a polygon that was never survey-accurate.

     plot          158  research ground with turf information and a shape
     aggregate       2  Alleys, CAFS Alleyways — totals with no shape
     facility        8  Shop, Pull Barn, Chemical Building, Bullpen, LH,
                        three Dump Piles: shapes, but never work
     alley_zone     11  AZ01-AZ11, the alley network cut into workable pieces
     split_parent   11  CAFS6, C7, P3 … a label for plots split into a/b/c;
                        the children are the real ground

   Two fields carry rules that used to live only in comments:

     areaFromShape  false means the polygon is a stand-in and its measured area
                    is meaningless. True of every CAFS plot — the grid was drawn
                    to sit roughly in the right place. Spray rates take area
                    from areaSqft and from nowhere else.
     mowable        AZ06 (CAFS surrounds) is grass and gets cut. AZ11 (CAFS
                    alleyways) is gravel — sprayed, never mowed, and still in
                    the rotation because the rotation is about covering ground.

   Runtime edits are layered over this by placeOf() in the app, so a correction
   never needs a code change. */
var PLACES={
${rows.join(',\n')}
};
`;
}
if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, '..', 'places-block.js'), emit(places));
  process.stderr.write('wrote places-block.js\n');
}
module.exports.emit = emit;
