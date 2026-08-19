# UT Turf Farm — Editable Map & Shared Backend Plan

**Goal:** turn the map from a fixed snapshot into a live, editable system where any non‑undergrad user can edit plot information, split plots, and delete/merge splits at any moment, with changes shared across everyone in real time.

This document scopes the backend and the four capabilities you asked for (edit info · split in‑app · delete/merge · role gating), and gives a phased path from today's single HTML file to a hosted, multi‑user app.

---

## 1. Why we need a backend

The current app is one self‑contained `UT-TurfFarm-App.html` with the 159 plots, their info, alleys, and trials **baked into the file**. That is perfect for review but has no shared source of truth: if a grad student splits a plot in their browser, no one else sees it. "Flexible and changeable at any moment, for many users" requires three things a static file can't provide:

- a **shared database** that holds the live state of every plot,
- **accounts and permissions** so undergrads are read‑only and others can edit, and
- **real‑time sync** so an edit on one screen appears on all the others.

The plan keeps everything you already have — the Leaflet map, the Turf geometry logic, the info forms, the indoor view — and swaps the *embedded data* for *data fetched from a live service*.

---

## 2. Recommended stack

**Supabase** is the best fit and lets us keep the existing front end almost unchanged.

| Need | Supabase piece | Why it fits here |
|---|---|---|
| Store plots + geometry | **Postgres + PostGIS** | Native polygon storage; can compute areas, unions, and splits in the database as well as the browser. |
| Accounts & roles | **Auth** | Email/UT SSO login; each user has a role. |
| Undergrad = read‑only | **Row‑Level Security (RLS)** | One policy set enforces "undergrads can read, others can write" at the data layer — can't be bypassed from the browser. |
| Live sync | **Realtime** | Subscribes each open map to plot changes; edits/splits/deletes broadcast instantly. |
| Aerials / floor plans | **Storage** | Holds the indoor Light House plan and any uploaded imagery. |

The front end stays HTML + Leaflet + Turf.js. Instead of `var PLOTS_DATA = {…}` embedded in the file, the map calls Supabase on load and subscribes for updates. **Turf still does the geometry** (slicing, unions) in the browser; we just save the result to the database.

*Alternatives considered:* Firebase (great realtime/auth, but weak for polygon geometry — no PostGIS), or a custom Node/Express + Postgres server (most control, most maintenance). Supabase gives the geometry strengths of Postgres with the least backend code to maintain.

---

## 3. Data model

| Table | Key columns | Notes |
|---|---|---|
| `plot` | id, number, geom (Polygon/MultiPolygon), parent_id (nullable), is_parent, area_sqft | `parent_id` links a/b/c splits to their base; a split replaces one row with children rows pointing at the (retained or virtual) parent. |
| `plot_info` | plot_id, area_name, turfgrass, cultivar, hybrid, type, face_weight, pile_height, spacing, infill, shock_pad, rootzone | The editable info form — one row per plot. `NA`/null fields stay hidden as they do now. |
| `mgmt` | plot_id, mower, cut_height_in, irrigation_block, irrigation_heads | Kept separate (drives the future Mower / Cut‑height / Irrigation layers; not shown in the info form). |
| `trial` | id, name, lab, owner, status, start, end, objective, treatments, restriction | The Trials module source (already prototyped as `TRIALS`). |
| `trial_plot` | trial_id, plot_id | Which plots a trial occupies — powers the plot info popups and future Trials/Restrictions layers. |
| `plant_history` | plot_id, turfgrass, established, ended | Optional but recommended: grass changes over time (from the earlier planting‑history idea) without overwriting. |
| `edit_log` | id, user, table, row_id, change, at | Audit trail — who split/edited/deleted what and when. |

Geometry lives in `plot.geom`; `plot_info`/`mgmt`/`trial_plot` reference it. This mirrors the current in‑file structure, so migration is mostly a copy.

---

## 4. Roles & permissions

Five roles already exist in the app: **manager, faculty, grad, tech, undergrad**. Mapped to permissions:

| Capability | manager | faculty | grad | tech | undergrad |
|---|---|---|---|---|---|
| View map & info | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit plot info | ✓ | ✓ | ✓ | ✓ | — |
| Split a plot | ✓ | ✓ | ✓ | ✓ | — |
| Delete / merge splits | ✓ | ✓ | ✓ | ✓ | — |
| Manage accounts | ✓ | — | — | — | — |

Enforced with RLS: a read policy for everyone, and write policies that check `auth.role() <> 'undergrad'`. Because it's enforced in the database, the UI simply *hides* the edit controls for undergrads while the server *guarantees* they can't write.

---

## 5. How each capability works

**Edit plot info.** Opening a plot shows the same info form; for non‑undergrads it gains an **Edit** button that turns the fields into inputs (with the Type dropdown: Natural / Synthetic / Other / Track / NA). Save writes to `plot_info`; Realtime pushes it to every open map.

**Split a plot (in‑app).** We embed the splitter you already have into the map: pick a plot, draw cut lines, Turf slices it, you label a/b/c and confirm. On save it runs one transaction — the base row becomes `is_parent`/virtual and the new child polygons are inserted with `parent_id`. The collapse/expand drill‑down we just built works unchanged because it's driven by `parent_id`/naming. Because trials re‑split areas often, splitting is non‑destructive: the parent footprint is always recoverable.

**Delete / merge splits.** Selecting a parent offers **Merge back** (delete the children, restore the single parent) or delete an individual sub‑plot. This is how you reset a plot when a trial ends and the next one divides it differently.

**Real‑time + history.** Every write broadcasts to open maps and appends to `edit_log`, so the map is always current and every change is attributable.

---

## 6. Migration from today

Nothing you've built is thrown away:

1. **Seed the database** from the current files — `ut-turf-plots.geojson` (159 plots incl. splits, O5/B17/E16S surrounds, LH) → `plot`; `Plot_map_info.xlsx` → `plot_info`/`mgmt`; the `TRIALS` array → `trial`/`trial_plot`; the alley layer + Light House plan → their tables/Storage. I can generate the seed scripts directly from these files.
2. **Point the front end at Supabase** — replace the embedded `PLOTS_DATA` / `ALLEYS_DATA` / `PLOT_INFO` / `TRIALS` with fetches + a realtime subscription. The rendering, drill‑down, popups, and indoor view stay as they are.
3. **Add the edit UI** and wire the four capabilities to the tables.

---

## 7. Hosting

- **Data + auth + realtime:** Supabase project (managed; nothing to run yourself).
- **The app itself:** the static HTML deploys to Netlify, Vercel, or GitHub Pages (your repo is already on GitHub) — a URL your team opens, no installs.

Both have free tiers suitable for a single research farm's traffic; confirm current limits when we set it up.

---

## 8. Phased roadmap

| Phase | What ships | Result |
|---|---|---|
| **0 — Seed & read** | DB seeded from current files; app reads live data (still view‑only) | Same map you have now, but data lives in the database. |
| **1 — Auth & roles** | Login; roles; undergrad read‑only enforced by RLS | Right people can act; others just view. |
| **2 — Edit info** | Inline editable info forms + realtime | Anyone (non‑undergrad) fixes plot data instantly for all. |
| **3 — Split & merge** | In‑app splitting + delete/merge + history | Full flexibility for changing trial layouts. |
| **4 — Polish** | Edit log view, conflict handling, mobile pass | Production‑ready. |

Phases 0–1 are the foundation; 2–3 deliver exactly what you asked for. Each phase is usable on its own, so we're never mid‑broken.

---

## 9. What I need from you

- **Approve the stack** (Supabase + keep the current front end) or tell me a constraint (e.g., must self‑host, or UT IT has a preferred database).
- **A Supabase project** (free to create) when you're ready — then I can seed it from your files and start Phase 0.
- **Login method** — UT single sign‑on if IT allows, or simple email accounts to start.

Once you're good with this, I can begin immediately by generating the database schema + seed scripts from your existing `ut-turf-plots.geojson` and `Plot_map_info.xlsx`, so Phase 0 is ready the moment the project exists.
