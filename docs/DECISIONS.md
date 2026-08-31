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

### A check must not depend on the clock it happens to run on — 2026-08-30
**Decision:** `tools/test-weather.js` builds its fake forecast from **local
midnight** and sets the hours on it — a day period at 07:00 and its night at
19:00 on the same date — rather than from "now" plus an offset. A second check
sits next to it that reads the fixture back and asserts each day and its night
really do land on one date.
**Why:** it used to build the night period as "now plus thirteen hours", which
is the same day only if you run it before 11am. From 11am the night landed on
the FOLLOWING date, `wxFoldDays()` correctly paired it with the wrong day, and
"each with a high and a low" went red. Confirmed by running the file at fixed
times: green at 03:00 and 08:00, red at 11:00, 14:00 and 20:00, with not one
line of app code different between them. That is worse than a plain broken
test. It taught everyone to look at a red result and say "oh, that one always
fails", which is exactly how a real failure gets waved through — and this one
sat red through several pushes for that reason.
**Don't:** anchor test data to `Date.now()` when the thing under test buckets
by calendar date, and don't paper over a red check by loosening the assertion.
If a check passes in the morning and fails in the afternoon, the clock is the
bug, and it is nearly always in the fixture rather than in the app.

### The weather is fetched, not invented — 2026-08-30
**Decision:** the weather screen reads api.weather.gov (the National Weather
Service). Every hardcoded forecast is gone, including `WXDAYS` and the
`wxCurve()`/`wxCond()` pair that manufactured an hourly strip from it.
**Why:** every number on that screen used to be typed into the source — "78°
Clear", the wind, the humidity, five day cards — and the hourly strip was those
five made-up days pushed through a sine curve. Only the radar was ever real.
That was not merely useless: four of the five home screens carried a **spray
window reading GOOD or HOLD off those invented numbers**, which is a go/no-go on
taking the rig out. The comment above one of them said "real numbers".
NWS was chosen over any commercial forecast for one reason above accuracy —
**no account, no key, no card.** There is nothing to expire and nothing to bill,
which is the only kind of dependency this app can safely carry past whoever
wrote it. The farm resolves to office MRX, the same station the radar loop
already used.
**Don't:** put a fallback forecast in the source "so the screen is never empty".
An empty screen tells the truth; a fallback is how this happened the first time.

### A stale forecast gives NO spray answer — 2026-08-30
**Decision:** `hwSprayOK()` returns `null` — not true, not false — when the
reading is missing or older than `WX_STALE_MS` (3 hours). Every widget that
calls it must render "No current forecast" for `null`. The weather screen turns
its age line red and says "too old to spray by".
**Why:** an out-of-date GOOD is worse than no answer at all, because no answer
sends somebody to look out of the window and a stale GOOD does not. This is the
single rule the whole weather rewrite exists to enforce.
**Don't:** make `null` fall through to `false` "because HOLD is the safe
default". It is not safe — a HOLD nobody believes gets ignored, and the next
GOOD gets ignored with it. Say you do not know.

### The weather day cards are FILLED, never rebuilt — 2026-08-30
**Decision:** `wxRenderCards()` writes into the five `.wxcard` divs that are
already in the page. It must not replace them or their container.
**Why:** those five divs are written **unclosed** in `UT-TurfFarm-App.html`, and
the browser's own repair of that malformed markup is what puts the rest of the
screens at the nesting depth the app expects. Replacing them with tidy, balanced
markup — which is what a reasonable person would do — moved **forty-four screens
up one level, out of `#app`**, so the click handler that runs `back()` never saw
them and the back arrow died on every one of those screens. That happened during
this very change and only `tools/test-back-nav.js` caught it.
**Don't:** "fix" the unclosed divs without checking every screen's nesting
afterwards. `tools/test-weather.js` asserts the card count survives a redraw and
that every screen is still inside `#app`; `tools/test-back-nav.js` is what
actually catches the consequence.

### The spray hold limits live with the spray settings — 2026-08-30
**Decision:** `WX_SPRAY_WIND` (10 mph) and `WX_SPRAY_PRECIP` (20%) moved out of
the weather code into `app-04-spray-inventory.js`, into the saved-difference
machinery alongside the nozzle rates and boom charge, and onto the Spray
settings screen under "When to hold off".
**Why:** they are a decision about spraying, not about the weather — the
forecast reports the wind, it does not decide how much of it is too much. And
per `SUCCESSION.md`, "we hold at 8 mph, not 10" must not be a code edit.
**Don't:** read them from the weather module's side. They are fenced on the way
in (1–40 mph, 0–100%) because a hand-edited settings file claiming a 900 mph
limit would switch the spray warning off entirely and look like nothing.

### Taking a calendar entry off is a mark, never a delete — 2026-08-30
**Decision:** `calRemoveEvent()` sets `removed:true` (with who and when) instead
of rebuilding `EVENTS` with `filter()`. `firestore.rules` refuses `delete`
outright, and the app hides removed entries rather than dropping them.
**Why:** the moment the calendar is shared, deleting an entry stops working. A
phone that was switched off still holds its own copy, and pushes up whatever the
shared copy is missing when it comes back — so a genuinely deleted entry comes
straight back, and keeps coming back, forever. A mark travels like any other
change, so it stays gone. The task list hit this first and solved it the same
way. The old code also **reassigned** `EVENTS`, which strands every reference
already held elsewhere; it now edits the list in place.
**Don't:** "simplify" this back to removing the entry from the array. It will
look like it works on one phone and be unfixable on twenty-three.

### Anyone signed in can read the whole calendar, time off included — 2026-08-30
**Decision:** `allow read: if actor()` on `events`, the same as every other
collection. The app still shows an undergrad only their own absences and hides
crew entries from faculty; that is a screen rule, not a database one.
**Why:** Dillon's call, made knowing what it means — **a phone HOLDS everybody's
time off even though it only ever DRAWS your own.** This is already true of the
time clock's punches and the weekly schedules, both more personal than a day off,
so the calendar is consistent rather than newly permissive. Refusing records
that are not yours is possible but would need a different query per person,
because Firestore rules filter nothing: a listener on a collection fails
entirely if any document in it might be unreadable. No drawer does that.
**Don't:** tighten this for the calendar alone. If it changes it has to change
for punches and schedules at the same time, and each of those needs its sync
rewritten to query per person.

### An undergrad may remove their own time off — 2026-08-30
**Decision:** `calCanRemoveEvent()` lets the Farm Manager remove anything, and
lets anybody else remove a crew entry carrying their own roster id. The button
now reads "Remove" and appears for both.
**Why:** Dillon's call, 2026-08-30. Before this only Bill could take anything off
the calendar, so an undergrad who mistyped their own day off had to go and find
him. This is the one branch in the calendar checked against a person's **own
id** rather than their role — which is also exactly what stops them putting
somebody else down as out.
**Don't:** widen it to "your own entries" generally. It is deliberately only
crew/time-off entries; a spray somebody scheduled is farm business.

### Equipment permissions read the roster, not currentRole — 2026-08-30
**Decision:** the four equipment checks (`eqCanReport`, `eqCanDown`,
`eqCanEdit`, `eqCanMaint`) no longer work the answer out from `currentRole`.
They delegate to `eqCanReportProblem()`, `eqCanTakeDown()`, `eqCanEditMachine()`
and `eqCanMaintain()` in `app-02-fieldlog-sync.js`, which read the roster — and
those four are what `firestore.rules` was transcribed from.
**Why:** the moment equipment started sharing, these stopped being "which
buttons do I draw" and became rules the database enforces on everybody.
`currentRole` is set once at sign-in, changes when somebody switches user, and
the App Manager post used to overwrite it outright; the database reads the
roster. When the screens ask one and the database enforces the other, the app
offers a button whose write is refused — which, to whoever tapped it, looks
exactly like the app is broken.
**Don't:** put a `currentRole` test back into any of the four, and don't add a
fifth equipment permission that reads it. `tools/test-equipment-sync.js`
deliberately sets `currentRole` to the wrong value and proves the answer does
not move; if that test starts failing, this is what broke.

### Equipment checkout is not shared, because nothing writes it — 2026-08-30
**Decision:** the equipment drawer carries four lists — machines, problems,
service history, service schedules. `EQCHECKOUT` is left out.
**Why:** the machine detail page displays a checkout log, but **nothing in the
app has ever written to it.** It is an empty array on all twenty-three phones.
Sharing it would mean a collection with no records and a database rule guarding
nothing, against the rule the rules file states for itself: an empty drawer
nobody can write into beats an open one nobody is watching.
**Don't:** file "the checkout log never syncs" as a sync bug — the sync is
fine, the feature was never finished. Either build signing a machine out and
back in and then add the fifth list, or delete the section. Dillon's call on
2026-08-30 was to leave it visible for now.

### The equipment drawer is one table, not four pasted copies — 2026-08-30
**Decision:** `EQSYNC` drives its four collections from a small table
(`eqsyncTables()`) that says, per list, which collection it is, whether records
change after they are written, and who may send them. The other ten drawers
each carry one or two collections written out longhand.
**Why:** four longhand copies of the sync module is roughly five hundred lines
in which one copy can carry a typo nothing catches, because each collection is
exercised so rarely that a wrong collection name would sit there for months.
Everything *outside* the module — `eqsyncTick`, `eqsyncHydrate`,
`eqsyncSummary`, the state object, on-always-with-no-switch — is shaped exactly
like every other drawer.
**Don't:** "make it consistent" by expanding the table back into four copies.
And when adding a fifth list, add a row to the table rather than a new module.

### Service history entries get an id, stamped on read — 2026-08-30
**Decision:** `EQMAINT` records are minted with `id:eqMaintNewId()` at all three
places that write one, and `eqMaintStampIds()` fills one in on any older row
before it is sent.
**Why:** they had no id, because nothing outside the phone had ever needed to
name one. Every drawer keys its documents by id, and two phones logging a
service in the same second must not land on the same one. Stamping on read
rather than migrating is the same choice the field log made: a migration would
have to run once on twenty-three phones and be right every time, while stamping
on read cannot be missed.
**Don't:** remove the stamp on the assumption every row now has an id — a phone
that has been switched off since before this change still holds rows that do
not.

### The drawer numbers in the plan and in the rules are different — 2026-08-30
**Decision:** `firestore.rules` numbers drawers in the order they were actually
built (equipment is drawer 8). `docs/BACKEND-STEPS.md` numbers them in the order
originally proposed (equipment is drawer 3).
**Why:** the build order changed as the farm's needs did, and renumbering the
rules file afterwards would break every comment that refers to a drawer by
number.
**Don't:** try to reconcile them. The rules file's numbers are the real build
order; the plan's are a proposal from before any of it existed.

### The app's code is six files, loaded in numeric order — 2026-08-29
**Decision:** the 10,800-line `<script>` block inside `UT-TurfFarm-App.html` was
cut into `app-01-shell.js` through `app-05-tasks-clock.js`, sitting beside the
app file and loaded in numeric order. **Not one line of code was changed** — the
files were generated as exact slices and diffed against the original to prove
it. The map, trials, sign-in and boot code stayed in the page. No bundler, no
build step, no modules: they are ordinary scripts sharing one namespace, exactly
as they did when they were one block.
**Why:** when a line fails while the app is opening, the browser abandons
everything below it *in that block*, silently — the 2026-08-27 outage, live for
two days. The size of the block is the size of the hole. This took the worst
case from 10,800 lines to 2,900. Splitting further, or into real modules with
imports, was rejected: a successor who cannot code can still open a plain file
and read it, and a build step is one more thing that can stop working in 2031.
**Don't:** rename them, reorder them, or move them into a subfolder — the
numbers *are* the load order, and a subfolder would make `.nojekyll` load-bearing
for the whole app rather than just the map. Adding `app-06-` is fine and needs
no list updated anywhere: `tools/build-sw.js` finds them on disk and
`tools/_app.js` tells every test harness about them.

### A file may not call forward into a later file — 2026-08-29
**Decision:** `tools/test-load-order.js` was added, and it runs with every
`npm test`. It reads each file, finds the lines that run *as the app opens*, and
fails if one of them calls something that is not written until a later file.
**Why:** inside one file a function can be written at the bottom and called from
the top, because the browser reads the whole file first. Across files it cannot.
This is not theoretical — the split itself created exactly this bug on its first
attempt (a line at the end of `app-01` calling `flStampWho()`, which had landed
in `app-02`), and **all 1,700 existing checks passed anyway.** They passed
because `test-boot.js` has to glue the files into one string to run them, and
the glue hides the very mistake it should catch. Only opening the app in a
browser found it. That is too thin a net for something that takes the app down
on twenty-three phones.
**Don't:** assume `test-boot.js` covers this — it structurally cannot, and the
reason is written at the top of both files. And don't delete the new check
because it "never finds anything": that is what it looks like when it is working.

### The CSS stays inside the page, and that is not untidiness — 2026-08-29
**Decision:** all of the app's CSS stays written in `<style>` blocks inside
`UT-TurfFarm-App.html`. It was deliberately left there when the JavaScript was
split out into files.
**Why:** colour-blind mode (`cbCss()`) works by walking every `<style>` block,
reading its text, rewriting each colour, and appending the result as a last
stylesheet. A stylesheet loaded from a separate `.css` file has no text to read
this way. Moving the CSS out would therefore switch colour-blind mode off for
the entire app — **with no error, nothing in the console, and nothing on screen
to notice** — for the people who need it most.
**Don't:** "tidy" the CSS into `app.css`. If it ever has to move, `cbCss()` has
to be rewritten to read `document.styleSheets` and its `cssRules` first, and
somebody has to check colour-blind mode by eye afterwards, because no test
watches colour.

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

### The bug-report key is a farm setting, not a phone setting — 2026-08-30
**Decision:** the Web3Forms access key rides the `farmsettings` drawer as a
fifth group, `farmsettings/bugcfg`, alongside the sprayer numbers, the mowers,
the labs and the semester dates. It is written only by Bill or the App Manager
and read by every phone.
**Why:** it used to live in the storage of whichever phone it was pasted into.
That made "Report a technical bug" a form that looked completely finished and
delivered nothing. Bill sets it up, Bill's phone starts sending, and the other
twenty-two go on writing reports down and keeping them — no error, no warning,
and the one screen that would have said "not set up to send" is a settings
screen a crew member cannot open. The crew believe they have reported
something. Nobody has received anything. It is the same shape of failure as a
nozzle rate fixed on one phone, so it gets the same answer.
**Don't:** treat the key as a secret that ought to stay off the shared
database. It only lets a form post to one inbox, and this page is public
anyway — a key nobody's phone can read is a key that does nothing.

### Who may redirect bug reports is narrower than the rest of Farm settings — 2026-08-30
**Decision:** `fstCanEditBugs()` is Bill or the App Manager. Faculty edit every
other part of Farm settings and not this one.
**Why:** the other four groups are how the farm operates — the sprayer, the
mowers, the labs, the term dates. This one is who maintains the app, which is
the hand-off question, not a farm question. It is also the faithful reading of
what the gate already did (`rstIsAdmin() || currentRole==='manager'`) and of
what the screen has always told people: "ask Bill or the app manager to finish
setup."
**Don't:** widen it to `fstCanEditLists()` just because it now sits in the same
table. And don't put `currentRole` back into it — that is only which screen is
showing, so it drifts from `firestore.rules`, which cannot see screens at all.

### `json==='null'` in fstsyncPush() is quoted on purpose — 2026-08-30
**Decision:** the guard in `fstsyncPush()` compares against the four-character
string `'null'`, not the value `null`.
**Why:** `fstValueJson()` returns JSON **text**. It never returns the value
`null` except from its own catch block. The guard used to say `json===null`,
so it never once fired, and every phone published a `v:null` document for every
farm-settings group whether or not a human had touched it — which is why
`spray`, `mowers`, `labs` and `semesters` all carry `v:null` documents dated
2026-08-27 that nobody set. Invisible for those four, because "go back to the
built-in values" changes nothing on a phone already using them. Not invisible
for `bugcfg`, where the shared copy is the only copy: a freshly installed
second phone belonging to Bill would have published its nothing and wiped the
bug-report key off every phone on the farm.
**Don't:** "correct" the quotes away. `fstsyncSeed()` twenty lines above has
always compared `fstValueJson(g)==='null'`, quoted, for exactly this reason —
the two are meant to match.

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

### A mow job finds its machine through the mower list, never by its name — 2026-08-30
**Decision:** `jobMowerKinds()` no longer carries the mower labels as text.
It looks for a WORD in the farm's own mower list — both the "Machine on the
plot record" column and the "Shows as" column — and hands back whatever that
machine is called today. An empty result means "this job is one machine's
ground and that machine is not on the list", which is different from `null`,
"this job does not narrow to a machine at all", and the two must never be
confused: answering `null` there would hand a rotary mow every plot on the
farm.
**Why:** it used to return `'Rotary Mower'`, `'Fairway Mower'` and four more as
literal strings, and compare them against `mowerLabel()`, which reads the very
same labels back out of `MOWER_CFG`. More → Farm settings → Mowers lets anyone
retype those in the "Shows as" box. One retype and the two halves stopped
agreeing: the job matched no plot, `taskPlots()` came back empty, and the work
screen drew every plot grey and untappable while still reading "0 / 0 done"
over a green **Complete task** button that would file a Field Log entry for a
mow nobody did. Reproduced on 2026-08-30: renaming "Rotary Mower" took the
Rotary - Plots job from 24 plots to 0. The machine column was already
protected — renaming it moves the plots with it, see `mowersRename` — and the
label column, the one this actually matched on, had none. It is also the
succession rule in CLAUDE.md straight out: renaming a mower is exactly the
routine change a farm manager should be able to make without editing source.
**Don't:** put a machine name back in the code, here or anywhere. If a job ever
needs a new machine, give it a word to look for. And do not "simplify" the
empty list back to `null` — `tools/test-taskwork.js` section 2 pins the
difference, because the two failures look identical on screen and only one of
them is safe.

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

### A claim expires on the clock of the phone READING it — 2026-08-30
**Decision:** `crewLive()` decides whether a claim on a zone is still live.
A timestamp dated in this phone's future is not used for arithmetic at all;
that claim is timed from when this phone first saw it instead.
**Why:** a claim carries `beat` from the phone that made it, and the old test
was `now - beat > CREW_TTL_MS`. A phone whose clock runs fast stamps a beat in
everybody else's future, and that subtraction is then negative for as long as
the clock is wrong — so the claim never went stale and the ground stayed locked
on every other phone. Measured on 2026-08-30: a holder five minutes fast locked
a zone permanently; a day fast locked it for a day. On the alleys job, where
every piece of ground is a zone, that is the whole job dead for the rest of the
crew. Erring towards keeping a claim is deliberate: holding it eight minutes too
long costs a wait, freeing it too early costs two people on one strip.
**Don't:** go back to comparing two clocks, and do not "fix" it by trusting
`at` instead — it comes off the same phone. Anything that has to expire must be
measured against a clock this device owns.

### You can hand in your part of a job somebody else is still on — 2026-08-30
**Decision:** on a zone job, when everything still open is held by other people,
the finish button stops refusing. If you finished ground of your own it offers
**Hand in my part**, which puts those zones on the Field Log under your name
and leaves the task open for whoever is still out there. With nothing of your
own done it offers a way back to the task list instead. Which ground is already
handed in is read off the Field Log itself — `flPartUnits()` — and never from a
field on the task.
**Why:** the button used to say "Check off every plot first" whatever the
reason, and on a job whose remaining ground was all claimed by a co-worker that
could not be acted on: taps on their zones refused, the button refused, and the
crew were stuck on a screen they could not finish, unable to move to the next
task. Reported from the field 2026-08-30 on more than one phone. Reading the
guard off the log rather than off the task is the part worth keeping: a task is
a shared record that goes up to the database and comes back, and an older copy
arriving from another phone would quietly take a marker off it — after which
closing the job would log the same acre a second time under the wrong person's
name. Log entries carry the `taskId` that made them and are never rewritten.
**Don't:** move that marker onto the task "so it is in one place", and don't let
a job with no ground on it be completable — that path files a Field Log entry
for work nobody did, which is how this was found. `tools/test-taskwork.js`
sections 2 and 5 pin both.

### More is on the wide-screen rail, even though every page already is — 2026-08-30
**Decision:** the left rail that replaces the bottom tab bar at 820px and up now
ends with a **More** item, below the divider, wearing the same ••• and the same
word it wears on the phone's bottom bar. The rule behind it: the rail is
`navMap`, whole — every page the role can reach, *plus* More.
**Why:** the rail was built to list pages only, on the reasoning that a monitor
has room for all of them so nothing needs hiding behind More. That is true of
pages and wrong about More, because More is not only a page list. It is the
**only** door in the app to *Report a technical bug*, *Farm settings* (sprayer,
mowers, labs, semester dates, shared database, bug-report settings) and *Admin*
(roster and accounts). Each is linked from exactly one place in the whole
codebase — a row on the More screen — and nothing anywhere linked to More except
the bottom bar, which is hidden on the wide shell. So on every iPad, laptop and
monitor those screens were **unreachable**, and nothing on screen said so: the
rail simply did not have them, and the app looked complete. Adding More rather
than three separate rail rows fixes the class rather than the three examples —
More builds its own rows from the role and its permissions, so anything added to
it later shows up on a big screen automatically instead of being phone-only
again. `RAIL_ROLLUP` also gained `farmsettings`, `admin`, `spraysettings`,
`mowersettings`, `labsettings`, `semsettings` and `sharedb` → `more`, so the
rail stays lit on More while you are inside one of them.
**Don't:** tidy More off the rail again as "redundant on a monitor" — that is
the exact reasoning that caused this, and the comment in `renderRail()` used to
say it out loud. It is not a page list. Before touching it, search the source
for what links to `s-more`: the answer is still nothing else. And put those
roll-ups in `RAIL_ROLLUP`, never in `SCREEN_DEST` — `SCREEN_DEST` is read by the
phone's bottom bar too, so adding them there changes what lights up on the
crew's phones. `tools/test-responsive.js` section 6b walks rail → More → each
row and asserts you land on the screen; if it goes red, something is stranded on
big screens again.

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
