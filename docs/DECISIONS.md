# Decisions

Why the UT Turf Farm app is the way it is.

**What belongs here:** any choice that a reasonable person would otherwise
"fix." If someone could look at the code or the data, think *that's a bug*, and
break something by correcting it — it goes here. Farm constants that aren't
derivable from the source go here too.

**What doesn't:** what the code does. That's readable. This file is only ever
about *why*.

**How to add one** — append to the right section, newest first, and keep it to
the three lines:

```
### Short title — YYYY-MM-DD
**Decision:** what was chosen.
**Why:** the reason, including what the alternative would have cost.
**Don't:** the specific mistake a future editor is likely to make.
```

Started 2026-08-15, backfilled from working notes. Entries before that date are
reconstructed and dated to when the decision was made, not when it was written
down.

---

## Process & project

### Sharing has no switch, and no way to turn it off — 2026-08-26
**Decision:** the ten per-phone sharing switches were deleted. Every drawer
shares with the whole farm from the moment the app opens, on every phone, and
nothing on any screen can stop it. Dillon was offered a farm-wide pause button
and chose not to have one.
**Why:** the switches were on **More → Admin → Shared database**, which only the
App Manager can open — so no other phone could ever have been switched on, and
the staged one-drawer-at-a-time rollout they were built for could not actually
have happened. A farm where one phone shares and the next does not is also worse
than either answer on its own: half the crew looking at a day board the other
half cannot see is how two people mow the same ground. The cost of having no
off switch is real and was accepted knowingly: if sharing ever misbehaves,
stopping it means editing the app.
**Don't:** add a switch back as a "safety valve" without saying where it lives
and who can reach it — a switch nobody but the App Manager can see is the exact
mistake this removed. And don't read `X.on` as a question any more: it is `true`
on every phone forever. The honest question is `X.live` — has this phone
actually reached that drawer — and that is what `crewBeatMs()` and
`fstRenameOk()` now ask.

### The app ships with no login, on purpose and with eyes open — 2026-08-17
**Decision:** publish to the crew without authentication. The sign-in screen
stays a person picker; a real password login is the next piece of work, not a
blocker for launch.
**Why:** the crew needs the app in their hands more than it needs a lock this
month, and the honest exposure is narrower than it first looks. Every record
lives in per-device browser storage, so a stranger with the URL gets the seed
content of the file — 23 names, roles, labs, and the plot/equipment/spray
reference data — and *not* the farm's work, which never leaves the phone it was
typed on. They also cannot damage anything, because nothing is shared. What
guards the rest is `noindex`, `robots.txt` and an unlisted URL, which is
obscurity, not security, and is written down as such in `LAUNCH.md`.
**Don't:** mistake a client-side passcode for a fix. On a static host anyone can
fetch the file and read the roster out of the HTML without touching the UI —
a gate in the page stops casual use and nothing else. Real gating has to happen
at the hosting layer or behind a server. And don't tell the crew "it's secure";
tell them the link is the key.

### `roster-emails.local.json` is kept, git-ignored, as the future allowlist — 2026-08-17
**Decision:** the 23 crew addresses live in this one git-ignored file. Not in
the app, not in the repo, not in any commit.
**Why:** they have to be somewhere. Whatever login gets built — Supabase Auth,
a hosting-layer gate such as Cloudflare Access, anything else — starts from a
list of who is allowed in, and this is that list. Keeping it out of version
control is what lets the repo be public at all.
**Don't:** commit it, and don't assume GitHub is holding a copy — it is not, and
that is the point. Keep a copy somewhere the farm owns. Also don't imagine this
file gates anything today; it is a list, not a lock.

### The crew's addresses are not in this repo — 2026-08-17
**Decision:** every roster `email` ships blank, and the three commits that
contained the real addresses were replaced with one fresh initial commit before
the repo was ever pushed. Each person fills in their own under More → Roster,
which persists on their device and is never committed. A reference copy of the
original 23 lives in `roster-emails.local.json`, git-ignored.
**Why:** GitHub Pages needs a **public** repo on the Free plan, and the site is
publicly reachable by URL regardless of plan (access-controlled Pages is
Enterprise-only). Deleting addresses from the working tree would not have been
enough — `git log -p` on a public repo shows every earlier version, so the
history had to go too. The repo had never been pushed, so this cost three
commit messages (preserved below) and nothing else.
**Don't:** re-seed addresses into `RST_SEED` "to make Profile look finished."
And don't assume a display address is needed to send a bug report — it is not,
see the entry below.

### A bug report needs an access key, not a destination address — 2026-08-17
**Decision:** `bugDeliver()` gates on the Web3Forms access key alone. The
"send reports to" setting is a **label** — for display and as a reply-to
fallback — not a precondition for delivery.
**Why:** Web3Forms routes by access key to whatever inbox the account was
opened with. `bugDeliver()` originally also required `bugTo()`; the moment the
addresses came out of this file that value was empty by default and every
report silently refused to send. It was caught by a test, not by using the app,
which is exactly how it would have shipped.
**Don't:** add `|| !bugTo()` back to that guard. If the destination needs to be
visible somewhere, use `bugToLabel()`, which words itself correctly when no
address is stored.

### Published as a user site, not a project site — 2026-08-17
**Decision:** the repo is named `<account>.github.io`, so the app is served
from the origin root.
**Why:** two reasons, and the second is the one that matters. The URL is short
enough to say out loud to a crew member. And a user site **owns
`/robots.txt`**, which a project site does not — under
`<account>.github.io/<repo>/` that file is ignored by crawlers entirely, and
the per-page `noindex` tags were the only working defence. Both are in place
now, so moving to a project path later degrades rather than breaks.
**Don't:** delete `.nojekyll`. It is a zero-byte file and it is load-bearing:
Jekyll does not publish folders named `/vendor`, so without it Leaflet, Geoman,
Turf and every font 404 — and because `cache.addAll()` rejects on any single
404, the service worker then never installs at all. The app still renders, so
it looks like it deployed fine.

### Git history starts at one commit — 2026-08-17
**Decision:** history was reset to a single initial commit on 2026-08-17. The
three commits it replaced are recorded here so their reasoning survives.
**Why:** see the addresses entry above.
**Don't:** treat the absence of history as "nothing happened before this date."
The reasoning lives in this file, which is where it should have been anyway.

<details>
<summary>The three replaced commit messages, verbatim</summary>

```
Make the app installable: manifest, icons, service worker      (2026-08-16)

Precaches the app, farm-geo.js, vendor/ and icons — 44 files, ~2.9MB —
so it opens with no network. sw.js is generated by tools/build-sw.js
with VERSION derived from a hash of those files, because a forgotten
cache bump pins every installed device to a stale copy with no
diagnosable symptom. tools/test-pwa.js fails if sw.js is stale.

Updates install and wait: the page offers Reload/Later and flushes
unsaved work first, rather than reloading someone out of a half-filled
spray record. Map tiles cache as you pan (capped, survives updates);
the radar never caches, since a stored loop misreports the weather
somebody is spraying in.

Registration is gated to http(s), so the file:// copy is unchanged.
Still needed before launch: an https host, and a localStorage export/
restore for each user, since storage does not follow the origin.
```

```
Vendor Leaflet, Geoman, Turf and the fonts                     (2026-08-16)

Nothing loads from a CDN at boot any more; four of them each had the
power to take the app down at once. vendor/ is built from pinned npm
packages by tools/build-vendor.js. tools/test-offline.js fails if any
script or link points at http(s), and with --browser loads the app in
Chromium with the network cut. Tiles and radar stay remote by nature.
```

```
Initial commit: app, specs, tools, and dev tooling             (2026-08-16)

Snapshot of UT-TurfFarm-App.html + farm-geo.js, the module specs, the
test harnesses, and the map/alley tools. Adds SUCCESSION.md and
DECISIONS.md. Retires the .bak convention; prior backups moved to
archive/ (git-ignored).
```

</details>


### Persistence saves by watching, not by calling `save()` — 2026-08-15
**Decision:** the STORE module writes the eight registered collections by
serialising each one every 2 seconds and writing only what changed, plus a flush
on `pagehide` and `visibilitychange`. There is no `saveTasks()` call at the
mutation sites.
**Why:** roughly 30 places mutate these arrays across 12,000 lines. Adding a save
call to each is 30 chances to miss one and 30 chances to break something that
already works, in a file with no test coverage over task/inventory/equipment
mutation. A scan cannot be defeated by a mutation site nobody remembered. The
arrays are small enough that the cost is nil.
**Don't:** assume a missing `save()` is a bug. When the Supabase port lands and
those mutations have tests around them, explicit writes should replace the scan —
until then the scan is deliberate.

### Map records store the difference, not the whole object — 2026-08-15
**Decision:** `PLOT_INFO` and `MGMT_DATA` edits persist as an override set
(`ut_plot_info_v1`, `ut_mgmt_data_v1`) holding only the entries that differ from
what `farm-geo.js` says. A deleted entry is recorded as `null`. `mapCaptureBase()`
snapshots the file's version at boot, before any saved edit is applied.
**Why:** saving the whole object would shadow the file permanently — the next
time `farm-geo.js` gains a plot or a corrected area, every device would go on
serving its own stale snapshot and nobody would be able to tell why. This is the
same override shape the shape editor already uses for `ut_plot_shapes_v1`, and
the same hazard the "Reset all" step in the bake-in workflow exists to avoid.
**Don't:** switch these to whole-object saves because it's simpler. The "Clear
this device's plot edits" row in App Admin → Hand off the app is the escape
hatch when an override set has gone stale.

### Hydration replaces array contents in place — 2026-08-15
**Decision:** `storeHydrate()` does `arr.length=0` then pushes the saved rows,
rather than assigning a new array to the global.
**Why:** ~900 render functions read these globals synchronously and some capture
a reference. Swapping the object identity would silently strand them — the kind
of bug that shows up as one stale screen, weeks later.
**Don't:** "simplify" it to `TASKS = saved`.

### Corrupt saved data must never wipe the seed — 2026-08-15
**Decision:** if a stored value fails to parse, or parses to something that
isn't an array, hydration leaves the in-file seed standing. An array that is
genuinely empty *is* respected.
**Why:** a failed save is recoverable; an array silently emptied by a bad parse
is not, and the person it happens to has no way to tell the difference.
**Don't:** add a `|| []` fallback anywhere in that path — that's exactly the wipe
this prevents.

### A backup does not include who is signed in — 2026-08-15
**Decision:** `bkPayload()` skips `SESSION_KEY`, and `bkRestore()` leaves the
local session alone when it clears storage.
**Why:** restoring a backup taken on Bill's iPad shouldn't sign you in as Bill.
The session is a property of the device, not a farm record.
**Don't:** "fix" the export to be complete by including it.

### The service worker's version is a hash, not a number — 2026-08-16
**Decision:** `tools/build-sw.js` generates `sw.js`, deriving `VERSION` from a
SHA-256 of the precached files themselves. `tools/test-pwa.js` recomputes it and
fails if `sw.js` is stale.
**Why:** the classic way a PWA dies is that a change ships, the cache name
doesn't change, and every installed device serves the old copy forever. The only
symptom is "it didn't update" — which cannot be diagnosed from a phone and
cannot be fixed by a non-technical successor. A hash can't be forgotten the way
a version number can, and the test turns the remaining mistake (editing the app
without running `npm run sw`) into a red build instead of a silent field
failure.
**Don't:** hand-edit `sw.js`, or replace the hash with a manual version.

### Updates are offered, never forced — 2026-08-16
**Decision:** the new worker installs and waits. The page shows a bar with
Reload / Later, and calls `storeFlush()` before reloading. `skipWaiting()` only
runs when the person taps Reload.
**Why:** auto-updating would reload the page out from under somebody halfway
through a spray record. A crew member being a day behind is cheaper than losing
the tank they just mixed.
**Don't:** move `skipWaiting()` into `install`.

### Tiles are cached at runtime; the radar never is — 2026-08-16
**Decision:** ArcGIS basemap tiles are cached on use, capped at 400 entries, in
a cache that deliberately survives an app update. The NWS radar loop bypasses
the service worker entirely.
**Why:** imagery you've already looked at should still be there in a dead spot,
and re-downloading it after every release costs the farm data for nothing. The
radar is the opposite: a cached radar loop is a lie about the weather somebody
is deciding to spray in.
**Don't:** precache tiles (there are far too many), or cache the radar at all.

### The libraries are vendored, the tiles are not — 2026-08-15
**Decision:** Leaflet, Geoman, Turf and both fonts are served from `vendor/`,
built by `tools/build-vendor.js` from pinned npm packages. The satellite tiles
from `server.arcgisonline.com` and the NWS radar image stay remote.
**Why:** four CDNs — cdnjs, unpkg, jsdelivr, Google Fonts — each had the power
to take the app down for everyone at once by changing a URL, and nobody left
behind would have been able to diagnose it. Vendoring also means the app runs
with no internet at all, which is a real condition in the middle of a farm. The
tiles can't be vendored because they're fetched per tile as you pan; they're the
live picture, not a library.
**Don't:** add a `<script src="https://…">` back. `tools/test-offline.js` fails
if any `<script>` or `<link>` points at http(s), which is the whole reason that
harness exists. Pin versions when rebuilding — an unpinned upgrade is exactly
the surprise vendoring is meant to prevent.

### Fonts load from disk, verified in a real browser — 2026-08-15
**Decision:** `vendor/fonts/fonts.css` carries woff2 only, with `./files/x`
flattened to `./x`, and `tools/test-offline.js --browser` loads the app from
`file://` with the network cut and asserts both families actually rendered.
**Why:** local fonts are the one part of vendoring that can plausibly fail on
`file://` — some browsers treat local font files as cross-origin. Dillon opens
the app from disk today, so a static check that the files exist would not have
been enough. They do load; the browser check is there so it stays that way.
**Don't:** trust the static test alone after changing anything about how fonts
are referenced.

### Git replaces the `.bak` convention — 2026-08-15
**Decision:** the folder is a git repository. The ~56 `UT-TurfFarm-App.pre-*.bak`
files were moved to `archive/` (git-ignored, still on disk) and version history
now lives in commits.
**Why:** `.bak` files record *what* the file looked like but never *why* it
changed, they can't be diffed against each other meaningfully, and on 2026-08-14
two concurrent editing sessions nearly destroyed a day's work — recovery
depended on a `cp` that happened to land at the right moment. Git makes that
class of loss recoverable by design.
**Don't:** add new `.bak` files. Commit instead, with a message a stranger can
read. Don't delete `archive/` until the repo has been pushed somewhere off this
machine.

### The app must survive a non-technical successor — 2026-08-14
**Decision:** every design choice is now weighed against the question "who
changes this in 2030, and can they?" Farm data that a manager would reasonably
want to change belongs in the database behind an admin screen, never in a
`const` in the source. No account, key, or hosted resource is created under a
personal or student identity.
**Why:** Dillon leaves in roughly three years and the likely successor cannot
edit code. Hardcoded farm data converts every routine change — a new hire, a
label change, a re-split plot — into a code edit nobody will be able to make.
**Don't:** add a new hardcoded list of farm data. See `SUCCESSION.md` for the
full plan and the running list of what still needs de-hardcoding.

### Phase 0 data-model conventions — 2026-08-14
**Decision:** before any backend work, five conventions were established inside
the HTML: due dates are stored as timestamps rather than the sentence describing
them; a stored person is a roster id, not a name; ids are minted so two devices
in the same millisecond can't collide; user-typed values are escaped so they
can't become markup; and the map data was split out into `farm-geo.js`.
**Why:** doing this first means the Supabase port isn't fighting the front end at
the same time. Each of these is a change that gets exponentially more expensive
after data exists in a shared database.
**Don't:** store a person by name, format a date into storage, or interpolate a
user-typed string into HTML. `tools/test-phase0.js` and `tools/test-session.js`
pin this behaviour — keep them green.

---

## Field data & farm constants

### Stock is a ledger of movements, never a running total — 2026-08-25
**Decision:** inventory records **movements** (`INVMOVES`: `+50 lb in`,
`−12 fl oz out`) and adds them up. `it.qty` is frozen as the **April opening
balance** from the spreadsheet; on hand is `invQty(it)` = opening + every
movement since. `invMove()` is the only thing that writes. A recount is a
movement (`why:'count'`), and editing "On hand" on the item screen books the
difference rather than rewriting April.
**Why:** `it.qty += n` is a read-modify-write. Two people booking a delivery at
the same moment both read the old figure, both add to it, and one write
disappears with nothing to show it ever happened. On one phone that is
unlikely; across 23 phones and a shared database it is a Tuesday. Keeping the
opening balance separate also means `tools/build-inventory.py` can still
regenerate the product list from the sheet without knowing the ledger exists.
**Don't:** add a running total back "for speed" — `invSums()` already caches,
and the scalar *is* the bug. Don't read `it.qty` anywhere; ask `invQty()`.
Don't let anything write stock except `invMove()`.

### The field log takes stock out, and charges the job once — 2026-08-25
**Decision:** logging a chemical application matches the product against
`INVENTORY` and books an `out` movement for the amount. The "Amount used" box is
now a number plus a unit picker defaulting to the product's own unit. The
movement is written **once per save, not once per plot**, and the box says
"total for this job".
**Why:** the farm already writes down what it sprayed; asking for it a second
time on the inventory screen is how stock numbers rot. The once-per-save rule
matters more than it looks: the field log writes one entry per plot, so a
three-plot spray from one tank would otherwise take the amount off three times
and drain the shelf at triple speed with nothing to show why.
**Don't:** move the deduction inside the per-plot loop. Don't make the product
match compulsory — see below.

### An uncertain amount leaves the shelf alone; it never blocks the save — 2026-08-25
**Decision:** stock only moves when the product is matched **and** the amount
converts into that product's own unit. Otherwise the entry saves exactly as
before and stock is untouched, with the screen saying so. Weight never converts
to volume, `oz` and `fl oz` are different units, and countable units (bag, can,
ea) only match themselves.
**Why:** the same rule as the rest of the field log — **nobody is ever blocked
in a field**. Spraying something not yet on the list is a real thing that
happens, and the application record matters more than the stock figure. A
guessed conversion is worse than no conversion: `fl oz` read as `gal` is a
128-fold error on a record the farm may have to defend.
**Don't:** add "helpful" fallbacks that assume a unit. `invConvert()` returning
null means *leave the shelf alone*, never *treat as zero*.

### A correction to a field log entry is reconciled across the whole chain — 2026-08-25
**Decision:** correcting the amount writes a **new** compensating movement for
the difference; the original movement is never edited or deleted.
`invReconcileFromLog()` sums the movements of every entry in the correction
chain (`corrects` walked back through `invLogChainIds()`), not just the entry
being corrected.
**Why:** it mirrors the field log's own rule — a correction adds, it never
overwrites. The chain part is the sharp edge: each correction hangs its
movement off its own id, so asking only the latest entry compares a *difference*
against a *total* and books the gap a second time. A 20 fl oz spray corrected to
12 and then corrected again for an unrelated typo would take another 20 off a
shelf nobody had touched. There is a test for exactly that.

### Stock going below zero warns, it never blocks — 2026-08-25
**Decision:** taking out more than the record shows is recorded, with a warning
that names the resulting figure and suggests a recount. `invNegWarn()` produces
the wording; nothing refuses the save.
**Why:** Dillon's call. The April counts are known to be stale, so a negative is
evidence the *record* is wrong, not that the person is. Stopping someone in a
field to fix paperwork is worse than carrying a wrong number for a day.
**Don't:** turn it into a validation error. A negative is a prompt to recount.

### Anyone may move stock; not everyone may redefine a product — 2026-08-25
**Decision:** `invCanMove()` is true for everybody, undergraduates included —
booking a delivery in and taking stock out. `invCanEdit()` (a product's name,
container size, reorder point) stays closed to undergrads.
**Why:** the people who carry the jugs are the people who know what left the
shelf, and the field log already trusts them to write the farm's spray records.
Recording what happened and deciding what the shelf *is* are different jobs.
**Don't:** narrow the movement side to Bill without asking Dillon — it was an
explicit answer, not a default.


### One labs list, four consumers — 2026-08-15
**Decision:** `FARM_LABS` (name, colour, badge, `pi`) is the source. `RST_LABS`,
`CAL_LABS`, `TR_LABS` and `TR_LAB_AB` are all derived from it by `labsRebuild()`
and rebuilt together. `pi:false` marks the farm crew — on the roster and calendar
lists, absent from trials. Renaming a lab migrates `PEOPLE[].lab` and
`TRIALS[].lab`.
**Why:** the four lists were written out separately and had already drifted —
**Stier** was on the roster list and on none of the others, so a Stier study had
no colour and a Stier event could not be filtered for. Stier is now a PI lab on
all four; flip its `pi` toggle if that's wrong. Derivation makes the drift
structurally impossible rather than a thing to remember.
**Don't:** hardcode a fifth lab list. If something needs labs, derive it in
`labsRebuild()`.

### Reference lists surface their own drift — 2026-08-15
**Decision:** the Mowers and Labs screens each show an "in use but not on the
list" section — machines named by `MGMT_DATA` or labs named by `PEOPLE`/`TRIALS`
that no longer appear in the list — with one tap to adopt them.
**Why:** a plot booked on a machine nobody lists draws grey with no explanation,
and a person in an unlisted lab is invisible to the filters. The old failure was
silent. Surfacing it means the farm can fix its own data without knowing why it
broke — which is the whole point of the handoff work.
**Don't:** auto-adopt unlisted names. Someone has to look, because the usual
cause is a typo rather than a new machine.

### Renaming reference data migrates the records that name it — 2026-08-15
**Decision:** `mowersRename()` moves every `MGMT_DATA[*].m`, and `labsRename()`
moves every `PEOPLE[].lab` and `TRIALS[].lab`, then saves both. Both report how
many records moved in the confirmation toast.
**Why:** plots store the *machine string*, not an id, and people store the *lab
name*. Renaming without migrating would silently orphan 43 plots on the first
mower alone.
**Don't:** add an editable reference name without asking what stores it by value.

### The spray numbers are editable, and fenced — 2026-08-15
**Decision:** tip output, the boom charge and the charge threshold moved out of
the source into **More → Spray settings**, gated to the roles that can log a
chemical (tech, grad, manager, plus admin; faculty may look). Every value is
re-validated on the way in, including when it arrives from a saved backup file:
rates must be 0.01–20 gal/1000 ft², the charge 0–200, the threshold 0–500, and
the tip list can never be emptied. Settings store as a per-section difference
from the built-in values, so a default corrected in the file later still reaches
anyone who hasn't overridden that section.
**Why:** these are the numbers that decide how much chemical reaches the ground,
and they were a code edit — the single clearest case of "the farm can't do this
once Dillon leaves." Making them editable also makes a bad value reachable from
the interface, which is what the validation and the role gate are for. The
read-only render is a courtesy; the handler re-checks the role, so a stale input
left on screen can't change a rate.
**Don't:** widen the fences to accommodate an unusual reading — a rate outside
that range is a measurement error, not a nozzle. Don't move this under
Preferences: those are per-person ([[prefs-are-per-person]]), and these are farm
constants everyone shares.

### Spray output is per 1000 sq ft, and a run over 25 gal gets +20 gal — 2026-08-14
**Decision:** the John Deere HD200 (`e2`) tips are quoted in gallons per 1000 sq
ft of ground, not gpm: red air induction 0.91, blue TeeJet 2.0, red TeeJet 0.91.
Any run working out to more than 25 gallons adds 20 gallons for boom
pressurisation and slope reserve. That 20 is a *default*, not a lock — `m.charge`
is editable and a typed number wins.
**Why:** these are farm constants measured on this rig. They are not derivable
from anything in the code.
**Don't:** treat the tip's rated gpm as the output figure, and don't make the
boom charge automatic-only again — the operator's judgment overrides the rule.

### Product is mixed for the full tank, not the treated area — 2026-08-14
**Decision:** product quantity is `rate × (tankArea / basis)` where
`tankArea = tank ÷ nozzleGalM × 1000`. The surplus riding in the boom charge is
called out separately on the mix sheet.
**Why:** everything leaving the nozzle is then at label rate. Mixing for the
treated area only would silently under-dose by diluting the mix with the charge
water — a compliance problem, not just a math one.
**Don't:** "correct" this to mix for the sprayed area.

### Spray products come from Inventory, not free text — 2026-08-14
**Decision:** the product name field is a type-ahead over `INVENTORY`
(categories in `MIX_CATS`), storing the inventory `id`. A spray can't be assigned
or completed while a named row doesn't resolve to a real inventory item.
**Why:** a free-text product name can't be checked against what's on the shelf
and can't warn when the tank needs more than the farm has.
**Don't:** relax the resolve requirement to make the form easier to fill.

### CAFS plot areas must not come from the map polygons — 2026-08-14
**Decision:** `PLOT_INFO["Area (sq ft)"]` for the CAFS block comes from
`Farm_info.xlsx` (the designed dimensions), not from `turf.area` on the polygon.
Everywhere else, a geodesic measurement that rounds *larger* than the value on
file replaces it; smaller measurements are left alone.
**Why:** all 51 CAFS 450-plots measure exactly 502 sq ft — identical to the
digit. That uniformity means the polygons are a generated grid roughly 5.6%
oversized per side, not aerial traces. Area feeds the spray calculator, so
bulk-replacing them would put ~11% more chemical on the whole block.
**Don't:** bulk-recompute CAFS areas from geometry. If that map data is ever
re-cut against real aerials, revisit. The uniformity test — are the measurements
identical to the digit? — is how to tell a synthetic grid from a real trace in
any block. Known bad traces left alone deliberately: C15 measures ~34% of its
stated area, B18 ~77%.

### AZ06 surrounds are grass; AZ11 alleyways are gravel — 2026-08-14
**Decision:** two different pieces of ground that are easy to confuse. **AZ06
"CAFS surrounds"** (67,955 sq ft) is grass, rings the CAFS block, is mowable, and
counts in the `Alleys` total. **AZ11 "CAFS alleyways"** (63,517 sq ft) is gravel
— defined as every square foot inside the surrounds boundary that isn't a plot.
`GRAVEL_ZONES={AZ11:1}` drives it: `jobAlleyZones()` filters gravel out so the
alley *mow* job never offers it, while `jobSpraysGravel()` makes it pickable on
pesticide/herbicide/fungicide/insecticide — never fertilizer or wetting agent.
**Why:** you mow grass and you spray gravel, and the app has to know which is
which. AZ11 was briefly and wrongly named "CAFS alleys" and marked gravel, which
is the confusion this entry exists to prevent.
**Don't:** offer AZ11 on a mow job, or on a fertilizer spray. Don't rename
either zone.

### SF plot info was swapped; the mowing data deliberately wasn't — 2026-08-14
**Decision:** `PLOT_INFO` was swapped between **SF4 ↔ SF9** and **SF5 ↔ SF10**
(turfgrass, cultivar, type, rootzone). `MGMT_DATA` for those plots was left
alone: SF4/SF5 stay on the John Deere 2653 at 0.75″, SF9/SF10 on the 7700A
at 0.5″.
**Why:** the mowing assignment follows the ground, not the plot record. Dillon
was asked directly whether the mowers should swap too and said no.
**Don't:** "fix" the apparent mismatch between `PLOT_INFO` and `MGMT_DATA` on
the SF plots. It is intentional.

### Map shape edits live in localStorage until baked in — 2026-08-14
**Decision:** Farm Map editor changes save to `ut_plot_shapes_v1` and
`ut_dump_notes_v1` only. Making them permanent is a manual workflow: **Export**
(copies a JSON diff), paste it in, apply `geom` overrides onto the matching
`PLOTS_DATA` features and append `added` entries as new ones, then **Reset all**
in the editor so localStorage stops shadowing the file.
**Why:** it keeps one source of truth. `peApply()` gives a baked-in shape
precedence over a local draw of the same name, so a stale local copy is
harmless, but Reset keeps it clean.
**Don't:** assume a shape someone drew has reached the file — it hasn't until
it's baked in. This whole workflow goes away with the Supabase port; until then,
always offer the bake-in after map editing.

---

## Interface

### The App Manager post is a hat, not a job — 2026-08-25
**Decision:** holding the App Manager post no longer sets `currentRole`. It is
its own flag, `IS_APP_ADMIN`, read off the `app_admin` claim on the sign-in
token and answered by `rstIsAdmin()`. Your role still comes from the roster, so
Dillon signs in as a **Technician in the Sorochan lab** who also happens to
look after the app. Everything the post can do lives on one screen, **More →
Admin**, and only its holder sees the row that reaches it.
**Why:** the post used to be `currentRole='admin'`, which *replaced* the job.
The moment Dillon signed in he stopped being a technician: no technician home,
no technician tabs, `me()` returned an "App Manager" card instead of his own,
and sign-in dropped him on the roster. He could see the whole farm's records
and not his own work. Nobody at this farm holds the post *instead of* working —
whoever inherits it will be doing a farm job too.
**Don't:** add `admin` back to `HOME_DEST`, `ROLE_SLUG`, `navMap` or any other
map keyed by role — the post is not a role and must not appear beside the five
that are. Don't grant a power by checking `currentRole`; ask `rstIsAdmin()`,
which is the one question every admin check already asks. Don't persist the
flag: it comes off the token on every sign-in, and `authEnter()` clears it
*before* anyone is put in, so a shared farm phone can never hand the post to
the next person who signs in.


### There is no task priority field — 2026-08-06
**Decision:** High/Med/Low was removed globally — entry form, seed data, all
task-creation paths, the detail brief, and the home widgets. Priority is
expressed by **rank order**: Bill assigns tasks in the sequence he wants them
worked and the crew works top-down. Lists number 1, 2, 3… with a Start button on
whichever job is up next.
**Why:** it matches how Bill actually runs the farm. A priority field would
compete with the ordering and let the two disagree.
**Don't:** reintroduce a `priority` property, pill, or picker. If something needs
to convey urgency, use position in the list or the due time.

### Text codes for status, emoji for navigation and weather — 2026-08-06 / 2026-08-11
**Decision:** status, type, and category indicators — restriction chips, pills,
badges — use short text codes ("Mow", "No mow", "Irr"). Simple glyphs (✓ ✕ →)
are fine. Navigation (`TAB_EMOJI`, in both the bottom bar and the desktop rail)
and weather conditions (the `ico` field on `WXDAYS`) use emoji, by explicit
request.
**Why:** short codes stay legible at small sizes on map labels and in dense list
rows, so data keeps them. Navigation and weather are scanned rather than read,
and a glyph lands faster there.
**Don't:** emoji-ise status chips, or strip the emoji out of navigation and
weather. A page must wear the same icon in the bar and the rail. Ask before
adding emoji anywhere else.

### Preferences are keyed by person, never by role — 2026-08-11
**Decision:** all user-tunable settings live in one `ut_prefs` object keyed by
roster id (`p07`, `p18`, …), reached through `prefsWho()`. The role decides which
widgets and pages *exist*; the person decides which are on and how they look.
**Why:** the goal is per-individual customization. The original role-keyed
version meant every Technician shared one home screen, and no number of
additional settings could fix that.
**Don't:** add a preference keyed by `currentRole`. New tunables go in the
person's bucket via `prefsGet`/`prefsSet`. Note that `prefsMigrate()` bails until
`RST_LOGIN` exists, so anything reading prefs during boot needs a fallback.

### No CSS `filter` or `transform` hover on home widgets — 2026-08-13
**Decision:** hover styling for `> [data-w]` cards uses `outline` with
`outline-offset:-2px`, not `filter` or `transform`.
**Why:** home widgets sit in a CSS multi-column masonry and several (`.wx`,
`.kpis`, `.hdr`, `.hw-runout`) are `column-span:all`. A filter turns the element
into its own stacking context, and Blink drops a column-spanning box out of the
paint when it gains one mid-flow — the global
`.tap:hover,[data-go]:hover{filter:brightness(1.03)}` rule made the weather strip
vanish on mouseover. Desktop only, since the rule lives inside
`@media (hover:hover) and (pointer:fine)`.
**Don't:** remove the override, or reach for `filter`/`transform` on these cards.
The cards carry inline `background` and `box-shadow`, so a stylesheet hover can't
override those anyway — `outline` is the only free lever.

### The checks run several at a time, capped by memory — 2026-08-29
**Decision:** `npm test` runs `tools/run-tests.js`, which starts several test
files at once instead of running all 29 one after another. How many at once is
worked out from the machine's memory (`totalmem / 2.5 GB`), **not** from the
number of processor cores. `npm run test:serial` keeps the old one-at-a-time
chain for when interleaved output gets in the way.
**Why:** one after another took about three minutes on the farm laptop. Pushing
runs the checks first, and GitHub Desktop shows a bare spinner the whole time
with no output at all — so a push that is working perfectly looks frozen. On
2026-08-29 that misread cost three consecutive push attempts: each one was
quit and restarted part-way through the checks, and nothing ever reached the
crew. Several at a time brings it to about a minute, which is short enough to
sit through. The test files themselves were not touched — each still runs as
its own separate `node`, and they are safe to overlap only because every one of
them just *reads* the app file and none of them writes anything.
**Don't:** raise the limit to the core count. Each file loads the whole
19,500-line app into a fake browser and can reach 1.6 GB on its own, so 16 at
once on a 16 GB laptop means swapping, which is slower than not doing it at
all. Measured there: 4 at a time 72s, 6 at a time 65s, 8 at a time 60s but
600 MB more swap — the five seconds are not worth it. Also don't try to cap it
with node's `--max-old-space-size`: at 512 MB `test-auth.js` runs out of memory
and aborts part-way through, which looks like a passing run right up until you
read the exit code.

### GitHub's copy of the checks runs Node 24, not 20 — 2026-08-29
**Decision:** `.github/workflows/checks.yml` pins `node-version: '24'`, and
`package.json` now declares the same requirement under `engines`.
**Why:** the test harnesses are built on jsdom, and jsdom 30 refuses to run on
anything older than Node 22.22 / 24.15. The workflow was written pinned to 20,
so from its very first run every check failed on GitHub while the identical
checks passed on the farm laptop, which runs 24. What made it hard to read is
that it did not look like a version problem: installing worked, the sw.js check
worked, and only "Run every check" failed — because those earlier steps are the
ones that never touch jsdom. The whole job was over in seventeen seconds, far
too fast to have run 1,698 checks, which is the tell.
**Don't:** lower the Node version to match some other project, or bump the
dependencies without checking what Node they now want. If GitHub starts failing
every check in under twenty seconds while the laptop is green, this is the first
thing to look at — it is a version mismatch, not a broken test.
