# vendor/

The libraries and fonts the app used to fetch from the internet on every load.
They live here so the app keeps working when a CDN changes a URL, blocks a
region, or goes away — and so it runs with no internet at all, which is a real
condition in the middle of a turf farm.

Nothing here is written by hand. `tools/build-vendor.js` copies it verbatim from
published packages, so it can be rebuilt from scratch:

| Folder | Package | Version |
|---|---|---|
| `leaflet/` | `leaflet` | 1.9.4 |
| `geoman/` | `@geoman-io/leaflet-geoman-free` | 2.16.0 |
| `turf/` | `@turf/turf` | 7 |
| `fonts/` | `@fontsource/archivo`, `@fontsource/public-sans` | latest at build |

`leaflet/images/` is required — `leaflet.css` refers to it by relative path for
the layers control and the default marker.

`fonts/fonts.css` is generated: the per-weight stylesheets from the two
@fontsource packages, concatenated, `.woff` sources dropped (every browser that
can run this app reads woff2), and `./files/x` rewritten to `./x`. It carries
Archivo 600–900 and Public Sans 500–800 — the weights the app asks for.

## Rebuilding

```
npm install leaflet@1.9.4 @geoman-io/leaflet-geoman-free@2.16.0 @turf/turf@7 \
            @fontsource/archivo @fontsource/public-sans
node tools/build-vendor.js
```

## What is deliberately NOT here

The satellite basemap tiles from `server.arcgisonline.com`. Those are fetched
per tile as you pan, so they cannot be vendored — the map needs the internet to
draw its imagery. Everything else, including the plot outlines, the app itself
and all of its data, works offline.
