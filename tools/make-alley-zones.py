#!/usr/bin/env python3
"""
Split the single ALLEYS_DATA polygon into one work zone per block area.

The alley network is one merged 10-acre MultiPolygon that the app used to check
off as a single unit. This cuts it into ten zones, each one the alley and border
ground belonging to a block: A, B, C, E & F, P, CAFS, NTEP, Ornamentals, the
Sports Field, and the ground around the shop and barns.

Method: every plot is a seed point labelled with its `Area` from PLOT_INFO. A
Voronoi diagram over those seeds says which block each patch of ground is
nearest to; cells are merged per block and clipped to the alley polygon. So a
zone boundary always falls halfway between two blocks' plots, which is where a
person would naturally stop mowing anyway.

Writes tools/alley-zones.json. Paste that into ALLEY_ZONES in
UT-TurfFarm-App.html.

Run:  python3 tools/make-alley-zones.py
"""

import collections
import json
import math
from pathlib import Path

from shapely.geometry import shape, mapping, box, MultiPoint, Polygon, MultiPolygon
from shapely.ops import unary_union, voronoi_diagram

APP = Path(__file__).resolve().parent.parent / "UT-TurfFarm-App.html"
OUT = Path(__file__).resolve().parent / "alley-zones.json"

# Farm centre latitude - the local equirectangular projection is anchored here
# so shapely works in feet instead of degrees.
LAT0 = 35.9015
FT_PER_DEG_LON = math.radians(1) * 6371000 * math.cos(math.radians(LAT0)) * 3.28084
FT_PER_DEG_LAT = math.radians(1) * 6371000 * 3.28084
SQFT_PER_ACRE = 43560.0

MIN_PIECE_SQFT = 40.0     # drop slivers the clip leaves behind at block borders

# Plots carry no Area field for the buildings; they group as one zone.
FACILITY_PLOTS = {
    "Shop": "Facilities",
    "Chemical Building": "Facilities",
    "Pull Barn": "Facilities",
    "Bullpen": "Facilities",
    "LH": "Facilities",
}

# Areas that share a zone. E and F are combined by request - F is a single plot
# and would otherwise be a two-minute zone of its own. Synthetic Field sits
# inside the Sports Field ground and is worked with it.
AREA_MERGE = {
    "E Block": "E & F Block",
    "F Block": "E & F Block",
    "Synthetic Field": "Sports Field",
}

# What each zone is called on the map.
ZONE_NAMES = {
    "A Block": "A Block alleys",
    "B Block": "B Block alleys",
    "C Block": "C Block alleys",
    "E & F Block": "E & F Block alleys",
    "P Block": "P Block alleys",
    "CAFS": "CAFS alleys",
    "NTEP": "NTEP alleys",
    "Ornamentals": "Ornamentals alleys",
    "Sports Field": "Sports Field alleys",
    "Facilities": "Shop & barns",
}


# ---------------------------------------------------------------- projection


def project(geom, fn):
    """Apply a coordinate function to every vertex of a (Multi)Polygon."""
    if geom.geom_type == "Polygon":
        ext = [fn(*c[:2]) for c in geom.exterior.coords]
        ints = [[fn(*c[:2]) for c in r.coords] for r in geom.interiors]
        return Polygon(ext, ints)
    return MultiPolygon([project(g, fn) for g in geom.geoms])


def to_ft(lon, lat):
    return (lon * FT_PER_DEG_LON, lat * FT_PER_DEG_LAT)


def to_deg(x, y):
    return (x / FT_PER_DEG_LON, y / FT_PER_DEG_LAT)


# ---------------------------------------------------------------- html access


def read_var(src, name):
    """Pull a `name={...}` JSON literal out of the single-file app."""
    i = src.find(name + "=")
    if i < 0:
        raise SystemExit("could not find %s in %s" % (name, APP))
    j = src.find("{", i)
    depth = 0
    for k in range(j, len(src)):
        if src[k] == "{":
            depth += 1
        elif src[k] == "}":
            depth -= 1
            if depth == 0:
                return json.loads(src[j : k + 1])
    raise SystemExit("unbalanced braces reading %s" % name)


def plot_area(info, number):
    """The block a plot belongs to, from its Area row in PLOT_INFO."""
    for row in info.get(number, []):
        if row and row[0] == "Area":
            return row[1]
    return FACILITY_PLOTS.get(number)


def clean(geom):
    """Keep the real polygons, throw away clip noise."""
    if geom.is_empty:
        return None
    parts = [geom] if geom.geom_type == "Polygon" else [
        g for g in geom.geoms if g.geom_type == "Polygon"
    ]
    parts = [p for p in parts if p.area >= MIN_PIECE_SQFT]
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


# ---------------------------------------------------------------------- main


def main():
    src = APP.read_text(encoding="utf8", errors="replace")
    plots = read_var(src, "var PLOTS_DATA")
    info = read_var(src, "var PLOT_INFO")
    alleys = read_var(src, "ALLEYS_DATA")

    alley = project(shape(alleys["features"][0]["geometry"]), to_ft).buffer(0)
    total = alley.area

    # One seed per plot, labelled with the zone it belongs to.
    seeds, labels = [], []
    skipped = []
    for f in plots["features"]:
        num = (f.get("properties") or {}).get("number", "")
        area = plot_area(info, num)
        if not area or area == "Alleys":
            skipped.append(num)
            continue
        g = project(shape(f["geometry"]).buffer(0), to_ft)
        if g.is_empty:
            continue
        seeds.append(g.centroid)
        labels.append(AREA_MERGE.get(area, area))

    if skipped:
        print("note: %d feature(s) carry no block and seed nothing: %s"
              % (len(skipped), ", ".join(sorted(skipped))))

    groups = sorted(set(labels))
    print("%d plots seeding %d zones: %s" % (len(seeds), len(groups), ", ".join(groups)))

    # Voronoi over the seeds, then merge cells by block.
    envelope = box(*alley.bounds).buffer(2000)
    cells = list(voronoi_diagram(MultiPoint(seeds), envelope=envelope).geoms)
    by_group = collections.defaultdict(list)
    for cell in cells:
        for i, pt in enumerate(seeds):
            if cell.contains(pt):
                by_group[labels[i]].append(cell)
                break

    features = []
    for group in groups:
        region = unary_union(by_group[group])
        piece = clean(alley.intersection(region))
        if piece is None:
            print("skipping %s - no alley ground falls to it" % group)
            continue
        features.append({
            "group": group,
            "geom": piece,
            "acres": piece.area / SQFT_PER_ACRE,
            "sqft": int(round(piece.area)),
            # rough rotary-mow estimate: 5 ft deck at 4 mph, 80% efficiency
            "est_min": max(3, int(round(piece.area / (5 * 4 * 5280 / 60 * 0.8)))),
        })

    # Number them the way the ground reads: north to south, then west to east.
    features.sort(key=lambda f: (-f["geom"].centroid.y, f["geom"].centroid.x))

    out = {"type": "FeatureCollection", "features": []}
    for i, f in enumerate(features):
        parts = 1 if f["geom"].geom_type == "Polygon" else len(f["geom"].geoms)
        out["features"].append({
            "type": "Feature",
            "properties": {
                "zone": "AZ%02d" % (i + 1),
                "name": ZONE_NAMES.get(f["group"], f["group"] + " alleys"),
                "block": f["group"],
                "acres": round(f["acres"], 2),
                "sqft": f["sqft"],
                "est_min": f["est_min"],
                "parts": parts,
            },
            "geometry": mapping(project(f["geom"], to_deg)),
        })

    print("\n%-6s %-22s %-16s %7s %6s %6s" % ("zone", "name", "block", "acres", "~min", "parts"))
    for feat in out["features"]:
        p = feat["properties"]
        print("%-6s %-22s %-16s %7.2f %6d %6d"
              % (p["zone"], p["name"], p["block"], p["acres"], p["est_min"], p["parts"]))

    covered = sum(p["properties"]["sqft"] for p in out["features"])
    print("\n%d zones, %.2f acres covered of %.2f (%.1f%%)"
          % (len(out["features"]), covered / SQFT_PER_ACRE, total / SQFT_PER_ACRE,
             100.0 * covered / total))

    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf8")
    print("wrote %s" % OUT)
    return out


if __name__ == "__main__":
    main()
