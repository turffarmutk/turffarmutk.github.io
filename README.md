# UT Turf Farm

The farm's app: tasks, crew, equipment, inventory, trials and the farm map.

**Live at <https://turffarmutk.github.io/>** — that is the address to give a crew
member. On a phone, open it and use *Add to Home Screen*; it then works with no
signal.

New here? Read [`docs/SUCCESSION.md`](docs/SUCCESSION.md) first. It explains why
the app is built the way it is and what has to stay true for it to outlive the
person who wrote it.

---

## What runs the site

Everything the live site serves sits at the **repo root**, and has to stay
there. GitHub Pages serves this repo from the root, so these paths are the URL:

| File | What it is |
|---|---|
| `index.html` | Forwards to the app. This is why the bare URL works — Pages does not list directories. |
| `UT-TurfFarm-App.html` | The app. One file, ~1.3 MB. |
| `farm-geo.js` | Plot shapes and map data. Must sit beside the app. |
| `sw.js` | Service worker — the offline cache. **Generated; never hand-edit.** |
| `manifest.webmanifest` | Makes it installable. |
| `icons/`, `vendor/` | Home-screen icons; Leaflet, Geoman, Turf and the fonts. |
| `robots.txt` | Keeps the site out of search results. |
| `.nojekyll` | **Empty file. Load-bearing. Never delete it.** See below. |

### `.nojekyll` is not optional

GitHub Pages runs Jekyll by default, and Jekyll does not publish folders named
`/vendor`. Delete this zero-byte file and Leaflet, Geoman, Turf and every font
stop being served — and because the service worker caches the whole shell as a
set, one missing file means **it never installs at all**. The page still loads,
so it looks like a successful deploy while the map is dead and offline is gone.
If the map ever goes blank after a push, check this first.

---

## Everything else

```
docs/          SUCCESSION.md, DECISIONS.md, LAUNCH.md
  specs/       what each screen is supposed to do
  plans/       the plan, the exec summary, the backend plan
reference/     the spreadsheets and documents the farm's data came from
prototypes/    one-off tools used to draw plots and alleys — not part of the app
tools/         test harnesses and build scripts
Inventory-App/ a separate, smaller app for chemical and bulk inventory
```

Two files exist on disk but are deliberately **not** in this repo:
`roster-emails.local.json` (the crew's addresses) and `archive/` (superseded
versions). Both are git-ignored on purpose — see `docs/DECISIONS.md`.

---

## Making a change

```bash
npm install                              # first time only
git config core.hooksPath .githooks      # first time only - turns on the push check
# edit UT-TurfFarm-App.html or farm-geo.js
npm run sw           # REQUIRED — regenerates the service worker
npm test             # 29 harnesses, 1,698 checks, about a minute
git add -A && git commit -m "what changed and why" && git push
```

**`git config core.hooksPath .githooks` is the line people forget.** It is what
switches on the check that refuses a push when the tests fail or `sw.js` is
stale. Git does not copy hooks when you clone, so a fresh clone has no
protection until somebody runs it. GitHub also runs the same checks after every
push (`.github/workflows/checks.yml`) and marks the commit with a red X, which
is the backstop for exactly this.

**Pushing takes about a minute, and looks like nothing is happening.** The
push runs every check first, and GitHub Desktop shows a bare spinner with no
output while it does. That is normal. Do not quit or restart the app — that
kills the check part-way and nothing gets pushed at all.

**`npm run sw` is not optional.** The service worker's version is a hash of the
files it caches. Skip it and every phone that already installed the app keeps
serving the old copy, with no error and no symptom other than "my change didn't
show up". `npm test` fails if you forget, which is the point.

After a push, allow ten minutes: Pages serves everything with a ten-minute
cache, so a new service worker is not picked up instantly.

---

## Things that will surprise you

- **There is no login.** The sign-in screen is a person picker — tap a name and
  you are that person. Anyone with the URL can do that. Closing this is the next
  piece of work; `docs/SUCCESSION.md` has the detail.
- **There is no server.** Every record lives in browser storage on the device
  that typed it. Nothing syncs between phones, and clearing site data erases
  that device's records. Export backups (App Manager → Roster → Hand off the
  app → Data & backup). Ending this is what the Supabase port is for.
- **The crew's email addresses are not in this repo**, on purpose. The app ships
  with them blank; each person fills in their own under More → Roster, and it
  stays on their device.
- **Bug reports** come from More → Report a technical bug and are emailed via a
  form relay. If they stop arriving, check More → Farm settings → Bug reports.
