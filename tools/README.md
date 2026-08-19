# tools/

Dev-only. `UT-TurfFarm-App.html` runs on its own and needs nothing in here.

| File | What it is |
|---|---|
| `make-alley-zones.py` | Cuts the single 10-acre `ALLEYS_DATA` polygon into one work zone per block area and writes `alley-zones.json`. Paste the output into `ALLEY_ZONES` in the app. |
| `alley-zones.json` | Last generated zone set. Mirrored into `ALLEY_ZONES` in the app. |
| `field-position.js` | Readable copy of the FIELD POSITION section embedded in the app (GEO / PROX / COV / CREW). The copy inside the HTML is the one that runs — edit there, and keep this in step if you want it readable on its own. |
| `test-field-position.js` | Loads the real app into jsdom with a stub Leaflet and a real Turf, then drives the zone, coverage, claim and proximity logic. |
| `test-mowing-setup.js` | Drives the cut-height / mower form: a height change must be given a machine before it saves, and the plot then moves between mow jobs. |

## How the zones are drawn

Every plot is a seed point labelled with its `Area` from `PLOT_INFO`. A Voronoi
diagram over those seeds says which block each patch of ground is nearest to;
cells merge per block and get clipped to the alley polygon. So a zone boundary
always falls halfway between two blocks' plots — which is where a person would
stop mowing anyway.

| Zone | Acres | ~min | Patches |
|---|---:|---:|---:|
| Shop & barns | 0.59 | 18 | 3 |
| Sports Field alleys | 0.46 | 14 | 1 |
| Ornamentals alleys | 0.87 | 27 | 5 |
| NTEP alleys | 0.08 | 3 | 2 |
| E & F Block alleys | 0.90 | 28 | 5 |
| CAFS alleys | 1.56 | 48 | 8 |
| C Block alleys | 2.09 | 65 | 1 |
| B Block alleys | 1.88 | 58 | 3 |
| P Block alleys | 0.92 | 29 | 1 |
| A Block alleys | 0.67 | 21 | 1 |

To change the grouping, edit `AREA_MERGE` (which blocks share a zone) and
`ZONE_NAMES` (what they are called) at the top of `make-alley-zones.py`.
E and F share a zone because F is a single plot; Synthetic Field is worked with
the Sports Field.

## Running

```
npm install          # once - turf + jsdom
npm test             # 111 checks against the live UT-TurfFarm-App.html
npm run zones        # regenerate the alley zones (needs python3 + shapely)
```

## Cut height and mower

A mow task resolves its plots from the **machine** on each plot, not the
height — so setting a plot to the fairway unit is what makes it selectable
under Fairway Mow. Height cannot pick the machine on its own, because 0.75″ is
run by both the 2653 and the Dennis walkers and 0.14″ by both the greens
triplex and the Toro walkers. So the **Mowing** button on a plot popup makes
them one decision: change the height and the mower field clears until you
choose, and the form tells you which machines actually run that height.

The height-to-machine suggestions are read off `MGMT_DATA` at runtime, not
hard-coded, so they follow the farm as plots are reassigned.

## Faking a position from a desk

The app exposes `geoSim(lat, lng, accuracyFt)` in the console. It drops a fake
fix in and every listener — the dot, the proximity alerts, the coverage paint —
reacts as if it came from the GPS.

```js
geoSim(35.900232, -83.961573, 12)   // standing on B14
geoSim(null)                        // back to the real watch
```

## What is not real yet

`CREW` syncs over `BroadcastChannel` + `localStorage`, which reaches other tabs
and windows on the same machine but **not other devices**. Two phones will not
see each other until the Supabase backend in `Editable-Map-Backend-Plan.md` is
stood up. The read/write/subscribe shape is deliberately the same one Supabase
Realtime uses, so that swap should only touch `crewSend` and `crewLoad`.
