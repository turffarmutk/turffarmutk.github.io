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

### A task nobody could delete, and the two holes that made it — 2026-08-31
**Decision:** three changes, made together because on their own none of them
fixes it. (1) The task's own screen gained a **Delete**, gated by `taskCan()`,
and both it and the bin on the board now go through one `deleteTask()` in
`app-03-people.js`. (2) `taskCan(...,'edit'|'delete',...)` was widened from
`role==='Farm Manager'` to `assignsUndergrads(me)`, so whoever is holding the
undergrad-assignment job in Bill's absence can delete as well — mirrored in
`firestore.rules` and `tools/rules-model.js`, which must always move together.
(3) Bill's Board tab gained a **"Not on any day above"** section listing open
jobs no day chip can draw.
**Why:** five mow jobs surfaced on Dillon's list (see the entry above for where
they came from) and nothing in the app could remove them. The bin 🗑 draws on
one row only — somebody else's row on Bill's Board tab — and that board lists
undergraduates plus Bill himself. Dillon is a Technician, so he never appears
on it and does not even have a Board tab; that made every task on a technician,
a grad student or faculty undeletable by anybody. Bill could not reach them
either, for a second reason: `taskOnDay()` matches one exact date, so a job
dated outside this Monday-to-Friday run is drawn on no chip at all. And under
the old permission Dillon could not have deleted them even with a button,
because he had not created them.
**Don't:** assume the bin on the board is "the delete". It is one route to a
function, and a job that route does not draw needs another one — which is why
Delete now lives on the detail screen, the one place every task can be opened
from. Don't "simplify" `deleteTask()` back into a splice inside the click
handler either: it sends the removal to the shared copy itself, because
`tsyncScan()` refuses to send anything once the list has emptied completely
(`TSYNC_MAX_DELETE`, and the `!Object.keys(here).length` guard beside it). That
guard is right — a list that emptied by accident must not wipe the farm — but
it also means the last job on the board could never be deleted by waiting for
the scan. `flDelete()` sends its own delete for exactly the same reason. And
note that widening `taskCan()` means the rules have to be published again
before the database will accept it: see docs/PUBLISH-THE-RULES.md.

### A phone's old local tasks surfaced on their own once task sharing went live — 2026-08-31
**Decision:** the task list's local storage key was bumped from `ut_tasks_v1`
to `ut_tasks_v2` in `STORE_DEFS` (`UT-TurfFarm-App.html`), the same move
already made for the field log (`FL_KEY` → `ut_fieldlog_v3`, 2026-08-25).
**Why:** four mow jobs appeared on the task board and in the field log with
nobody having assigned them. The task list's code was cleared to an empty
seed on 2026-08-24, but nothing ever cleared a phone's own saved copy — so a
phone still holding old test tasks from before that date, the first time it
finally got a working connection after task sharing shipped (2026-08-26,
fixed for real 2026-08-27, see "`json==='null'`" below), uploaded that
backlog to the shared database in one shot, with no button press anybody on
another phone could see happen. The field log's key had already been bumped
for exactly this reason; the task list's key simply never was.
**Don't:** assume a bump is a one-time fix for whatever key needed it at the
time — the same gap can exist in any drawer that persists locally and was
seeded with real (not empty) test data before its first bump. If another
drawer starts showing records nobody remembers creating, check whether its
storage key has ever been bumped since the drawer's seed array was last
cleared.

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

### The home weather card falls back to the reading NOW, not to a dash — 2026-08-30
**Decision:** the temperature on the home screen's weather card (and on the
manager's weather strip) shows today's forecast high while there is one, and
otherwise the current reading, labelled **now**. A dash only when there is
neither. `hwWxTemp()` in `app-01-shell.js` decides; `hwDeg()` is what stops a
missing number ever being printed as text.
**Why:** the National Weather Service drops today's daytime period once the
afternoon is past, so `WXDAYS[0].hi` is `null` for the second half of every
day. The widget printed it straight out, and the home screen read
**"null°"** — reported from the farm on 2026-08-30. The obvious repair is a
dash, which is what the Weather day cards do, but a dash on the biggest number
on the card from mid-afternoon onwards helps nobody deciding whether to go out.
The current reading is already fetched — it is what the Weather screen leads
with — so the card shows that instead, with a small "now" beside it so it is
never mistaken for the day's high. Dillon chose this over the dash.
**Don't:** print a forecast number by concatenating it into text without
`hwDeg()`. And do not "make the home card consistent" by dropping the fallback
back to a dash — the difference from the day cards is deliberate: a day card is
a record of one day, while this card is answering "what is it like out there
right now". `tools/test-weather.js` section 4b pins all of it, including that
the word "null" never reaches the screen.

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
**Why:** color-blind mode (`cbCss()`) works by walking every `<style>` block,
reading its text, rewriting each color, and appending the result as a last
stylesheet. A stylesheet loaded from a separate `.css` file has no text to read
this way. Moving the CSS out would therefore switch color-blind mode off for
the entire app — **with no error, nothing in the console, and nothing on screen
to notice** — for the people who need it most.
**Don't:** "tidy" the CSS into `app.css`. If it ever has to move, `cbCss()` has
to be rewritten to read `document.styleSheets` and its `cssRules` first, and
somebody has to check color-blind mode by eye afterwards, because no test
watches color.

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

### Trial dots ask what paint went, and it comes off the shelf — 2026-09-23
**Decision:** finishing a **Trial Dots** job now asks three things on the
confirm sheet — the **type** (spray or liquid), the **color**, and **how many
cans**, a dropdown of whole cans 1 to 12 with no "None". The answer is stored
on the task as `paintUsed` ({type, color, item, cans}), written into the Field
Log's own product and amount columns, and taken off the inventory through
`mixInvDecrement()`. The amount subtracted is `cans × csize` in the product's
own unit, the same sum the restock screen does.

The paint itself is **not named anywhere in the code**: it is whatever products
sit in the **Paint · Cans** (or **Paint · Liquid**) category of the inventory.
A paint is added **once per color**, each with its own count, and each carries
a **`color`** set on the Add item form — a box that only appears for those two
categories, and is required there. The sheet's color dropdown **is** that
product list, labelled by color. So "we now stock pink" is one item added on
a phone, and the Inventory screen can say you are out of blue while there is
still orange.

The **type** is filled in from the job (`taskPaintType()` — Trial Dots means
spray) but is **shown and changeable**, so a job set up wrong can be put right
in the field instead of emptying the wrong shelf. **Liquid is deliberately not
counted yet:** nobody has decided whether a liquid job is measured in whole
jugs or in gallons, so picking Liquid records the type and the color, asks for
no amount, takes nothing off the shelf, and says so on the sheet. Give
`PAINT_TYPES`' liquid row a `count` the day that is answered and the rest works
unchanged. With no paint set up at all the job **still finishes** — what was
picked is kept, and the sheet says plainly that nothing came off the shelf.
**Why:** the cans were leaving the paint cage with nothing recording it, so the
count on the Inventory screen was only ever right on the day somebody typed it
in. The student who did the job is the only person who knows the number, and
the finish sheet is the one moment they are already stopped and answering a
question. A dropdown rather than a typed box because half a can is not
something anybody can measure standing in a field, and a number box on a phone
invites "1.5" and stray zeros — Dillon asked for it to round them to whole
cans, and a list does that by construction. No "None" because Dillon wants a
real answer from every job (Dillon, 2026-09-23); 12 because that is past a big
day of dots without being a long spin on a phone. Reading the product off the
inventory rather than naming it here is the succession rule: a new color or
brand in 2030 must not need this file edited. One item per color rather than
one paint with a color picked per job, because "how much blue is left" is a
question the farm actually asks and a single lumped count cannot answer it.
The type is written in code rather than put on the task form — Dillon's call,
2026-09-23 — only because Trial Dots is the farm's one painted job today.
**Don't:** don't take `cans` off the shelf directly. A paint set up as a 17 oz
can would then lose 2 oz instead of 34 — `paintCanAmount()` exists for this.
Don't drop `paintUsed` from `isCompletion()` in `firestore.rules` or from
`COMPLETION_FIELDS` in `tools/rules-model.js`: an undergrad writes it as they
finish, so leaving it out means the database refuses the whole finish and the
job will not close, with nothing on screen to say why — the same shape of bug
`donePlots` caused for three weeks in September. And **the rules have to be
published before the app is pushed** (`docs/PUBLISH-THE-RULES.md`), because
until they are, the new field is exactly what gets refused. Don't make the
question block a finish when no paint is set up either: stranding somebody on a
finished job over paperwork is worse than a missing number — and for the same
reason don't make Liquid refuse to close while it has no count. Don't give
liquid a guessed `count` to "finish the feature": a wrong amount on the farm's
records every time is worse than an honest blank. And **the day a second
painted job exists**, move `taskPaintType()` onto the task form rather than
adding a second job name to it — one hardcoded name is a shortcut Dillon
chose, two is the thing SUCCESSION.md exists to stop.

### Any plot may be picked; the machine's ground is a button — 2026-08-30
**Decision:** the plot maps (the assign wizard and Choose plots) offer **every
plot on the farm**, whatever the job is — `jobPickTargets()`. The ground the
job is usually on — the machine's plots, the alley zones, the borders, the
plots saved on the task-list entry — is now a quick-select button instead,
`jobQuickSet()` / `jobQuickLabel()`, which names the machine off the farm's own
mower list ("All Fairway Mower ground · 18").
**Why:** `jobPlots()` decided both at once, so what a job was *usually* on was
also all it was *allowed* on. A fairway mow offered eighteen plots and nothing
else; an alley job offered zones and no plots at all; a spray whose task-list
entry carried three plots offered only those three. Everything else drew grey
and ignored the tap, with nothing on screen to explain it. Reported from the
farm on 2026-08-30: Bill could not put a job on ground he wanted mown. The
usual set is a good default, not a rule — the day it is wrong is exactly the
day somebody needs to say so.
Three things stayed deliberately as they were:
- **No one-tap way to book the whole farm.** The button only appears where the
  usual set is genuinely narrower, so a spray or a fertiliser run is still
  chosen plot by plot. That was the original reason select-all was mow-only.
- **Trial holds still refuse the tap**, on every plot the map now offers, and
  quick select still steps over closed ground.
- **Cut-height blocks merge only the usual ground** (`blockOn` in
  `jobMapDraw`). Merged across the whole farm they would fuse a fairway to
  whatever sits beside it at the same height and the two could never be picked
  apart again.
**Don't:** narrow the map back to the machine's plots "because that is what the
job is". Narrow the *button*, never the map. And do not drop `blockOn` and let
the picker block everything it draws — the map still looks right and two plots
quietly become one. `tools/test-plot-picker.js` pins all of it.

### The alleys are one shape, painted as they are mown — 2026-09-18
**Decision:** the alley job's ground is ONE shape, `ALLEY_UNIT` (all of
`ALLEYS_DATA`), not the ten zones AZ01–AZ10. What has been mown is **paint**:
the phone's GPS paints a deck-wide stroke as the mower drives, and "Paint by
hand" lets a person drag a finger over ground the GPS missed (Undo takes back
their own last finger stroke; GPS paint cannot be undone). The job can be
finished once **80%** of the alleys is painted (`PAINT_DONE_PCT`), so nobody
chases the last few feet. The paint lives in the shared database as
`paint/{taskId}`, so two people see each other's paint, and when Bill hands an
unfinished alley job to somebody else the next day (Edit → change the
person), they see only what is left. The field log entry says how much was
mown ("Alleys 93% mown").
**Why:** Dillon asked for one shape, but also for two people at once and for
partial days to carry over. Zones gave those by cutting the ground up; paint
gives them without cutting it up.
**Things that look wrong and are not:**
- **AZ01–AZ10 are still in `farm-geo.js`.** Old field log entries name them.
  A task saved with those codes now reads as the one shape (`jobAlleyMerge`).
- **AZ11, the CAFS gravel, is still a zone** that is claimed and ticked, on
  weed sprays only. The claim / hand-in machinery is its alone now.
- **The percentage is measured on a one-metre grid**, not with polygon maths,
  because intersecting hundreds of strokes with a 1,400-corner outline would
  stall a phone. Paint off the alleys (the road from the shop) is drawn but
  never counted.
- **Phones listen only to `open` paint records.** A finished task closes its
  record, which drops it from every phone. Listening to the whole collection
  would read every alley job ever mown each time anybody opened the app.
- **One send per task per ten seconds.** Finger painting makes many strokes a
  minute, and the loop brake (`sdbMaySend`) stops a record for good at twelve.
- **A stroke never changes once written; Undo only sets `del`, one way.** That
  is what lets an arriving record be applied completely without fighting this
  phone's unsent work — the rule from 2026-08-31.
**Don't:** go back to ten zones to get "progress" — the percentage is the
progress. Don't list the whole `paint` collection. Don't send from
`psyncOnSnapshot`. `tools/test-paint.js` and the row in
`tools/test-sync-settles.js` pin it. **The rules file gained a `paint` block —
it does nothing until it is published** (`docs/PUBLISH-THE-RULES.md`); until
then paint stays on each phone and the Shared database screen says it was
refused.

### The grass alleys are offered on the alley job and nowhere else — 2026-09-18
**Decision:** `jobPickTargets()` adds the alleys only when `jobIsAlleys()`
— the Rotary - Alleys job. It used to add them to *every* mowing job, so a
fairway or greens mow was offered ten alley pieces. (Later the same day the
ten pieces became one shape — see the entry above.) The CAFS gravel (AZ11) is
unchanged: weed sprays only, per the AZ06/AZ11 entry below.
**Why:** Dillon asked for it. Nobody puts alley ground on a fairway mow, and
offering it only made a wrong tap possible.
**Don't:** read this as undoing "any plot may be picked" above. That entry is
about *plots*, and every plot is still offered on every job. Only the alley
zones are narrowed. `tools/test-plot-picker.js` section 1 pins it.

### The plots picked when a job is assigned ARE the job — 2026-08-30
**Decision:** `taskPlots()` — the ground an assigned job actually covers —
returns the plots saved on the task whenever there are any, and only falls
through to `jobPlots()` when the task was assigned with nothing picked.
`jobPlots()` answers a different question: *what could a job like this cover?*
That is the picker's question, and for a mow job the answer is every plot
booked on the machine.
**Why:** the two questions shared one function, with the saved plots passed in
as a *fallback* — and a fallback is only read when nothing else matched. A mow
job always matched something (its machine's ground), so the manager's
selection was thrown away every single time. Reported from the farm: Bill did
not want all the fairways mown on Friday, picked three, and the undergrad's
phone listed all eighteen, with a progress count of 0/18 he could not clear.
Nothing looked broken — the task even *said* "Plots B1, B2, B3" at the top of
the brief, because that text is stored, while the map below it was recomputed.
It hit mow, alley and border jobs, which narrow to a machine or a zone list;
sprays were never affected, because their branch already preferred the
selection. `tools/test-taskwork.js` section 7 pins it.
**Don't:** "tidy" these back into one call. And do not make `taskPlots()` fall
back to the machine's ground when the picked plots no longer exist on the map
— it now returns nothing there, on purpose, so `jobNoGround()` can say *the
plots this job was given are not on the farm map any more* rather than the job
quietly growing back into every fairway. Those two have to agree, or the work
screen goes silent in exactly the way the entry below describes.

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
**Still true after 2026-08-31:** an edit no longer creates a new id, so the
chain `invLogChainIds()` walks is always exactly one id long — but the same
function, unchanged, still asks "how much has this id taken off the shelf so
far" and books the difference. See the entry directly below for why the chain
can now be length one instead of longer.

### Field Log entries can now be edited and deleted — 2026-08-31
**Decision:** Field Log entries lost the guarantee described two entries
above ("Nothing is ever edited... nothing is ever deleted") that stood from
2026-08-25. `flEdit()` now changes an entry's own fields in place with no
record of the old value, and `flDelete()` removes an entry from the shared
database permanently, for anybody `flCan(...,'edit'|'delete',...)` allows —
the same people who could correct an entry under the old rule (whoever logged
it, whoever the work was credited to, whoever holds the undergrad job, or
faculty over their own lab's person). `firestore.rules` was rewritten to
match: `allow delete` went from `if false` to `canEditLog()`, and `allow
update` now permits the entry's real fields to change instead of only the
three fields that used to mark it superseded.
**Why:** Dillon's call, made after four mow jobs surfaced in the field log
with nobody having logged them (see the task-sharing entry under Process &
project) — the field log had no way to remove them, only to correct around
them and leave the wrong entry sitting in the record forever. He chose to
give up the append-only guarantee entirely rather than add a narrower
exception for sync artifacts.
**Don't:** assume this was free. The original 2026-08-25 reasoning was that
pesticide application records are the kind of thing recordkeeping law might
one day require to be tamper-evident, and that reasoning did not stop being
true — it was a deliberate trade Dillon made with that cost in view, not an
oversight to "fix" back the other way. If a future recordkeeping requirement
actually bites, the honest options are re-adding an append-only mode for
chemical-application entries specifically, or keeping an off-app export of
the log as the real backstop — not quietly reintroducing `flCorrect()`, which
`invReconcileFromLog()` and `invLogChainIds()` still tolerate transparently if
it ever comes back (see the entry above).

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
**Decision:** `FARM_LABS` (name, color, badge, `pi`) is the source. `RST_LABS`,
`CAL_LABS`, `TR_LABS` and `TR_LAB_AB` are all derived from it by `labsRebuild()`
and rebuilt together. `pi:false` marks the farm crew — on the roster and calendar
lists, absent from trials. Renaming a lab migrates `PEOPLE[].lab` and
`TRIALS[].lab`.
**Why:** the four lists were written out separately and had already drifted —
**Stier** was on the roster list and on none of the others, so a Stier study had
no color and a Stier event could not be filtered for. Stier is now a PI lab on
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
`GRAVEL_ZONES={AZ11:1}` drives it: the alley *mow* job never offers it (since
2026-09-18 that job is the one `ALLEYS_DATA` shape, which never included the
gravel), while `jobSpraysGravel()` makes it pickable on
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

### A trial's size is treatments × reps × one plot, never a typed total — 2026-09-25
**Decision:** the study form stopped asking for "Trial area (ft²)" and
"Plot layout (rows × columns)". It asks for **number of treatments**, **number
of reps**, the **width and length of one plot** in feet, and an optional
**alley width between plots**. The total is worked out (`trGridFt()`,
`trTotalFt2()` in the page) and written onto `t.area` at save time so that
everything already reading `t.area` carries on working.
**Why:** a square footage cannot be drawn. 25 ft² is 5 × 5 or 10 × 2.5, and a
6-treatment, 4-rep trial comes out 45 × 49 ft one way and a completely
different rectangle the other. The old `trFootprintFt()` split the typed area
by the square root of the grid ratio, which is a guess dressed as a
measurement — and that guess is the box somebody rotates on the map to say
where their trial actually is. Asking for two measurements instead of one is
the difference between drawing the trial and drawing a rectangle of the right
size.
**Don't:** don't "simplify" the form back to a single area box, and don't
delete the fallback at the bottom of `trFootprintFt()` / `trTotalFt2()` — every
study saved before this date has only `area` and `layout`, and that branch is
the only thing still drawing them. They are deliberately **not** migrated:
rewriting every stored study to a new shape would have every phone offering
every study to the database at once, for a number nobody asked to change.

### A restriction entered on the study form covers the whole study — 2026-09-25
**Decision:** the new-study form asks about restrictions *before* it asks where
the trial is, so a restriction entered there becomes **one record per plot**,
tied together by a shared `gid` (`trSyncFormRes()`). A restriction added later
from the study page has no `gid` and the form never touches it. The form's own
rows are rebuilt from the records each time it opens (`trResDraftFrom()`) and
`hasRes` / `resDraft` are stripped before the study is stored.
**Why:** `r.scope` is read as a real plot name in about ten places — the farm
map, the plot popup, the crew's job warnings, `proxTargets()`, and the mirror
in `tools/field-position.js`. A `scope:'all'` would have meant changing all of
them, including the one that is duplicated for testing. Expanding to one record
per plot changes nothing downstream at all.
**Don't:** don't rebuild a restriction record that already exists — reuse it.
A lift is filed in `triallifts` against the restriction's own **id**, so a
fresh id makes a restriction somebody deliberately lifted come straight back.
And don't store `resDraft` on the study: it is a second copy of every
restriction, and a second copy that can differ is a copy that gets sent again,
forever. See "4.4 million reads" under Process & project.

### An open-ended restriction says "until it is lifted", never "unknown" — 2026-09-25
**Decision:** both restriction forms offer "No end date — until it is lifted"
and store `end:''`. The study's own end date offers "End date unknown" and
stores the same empty string. `trResState()` was already treating an empty end
date as never ending; only the wording is new (`trResEndText()`,
`trResRangeText()`).
**Why:** they are two different facts and the crew have to be able to tell them
apart. A study with no end date is a study nobody has finished planning. A
restriction with no end date is ground that stays closed until a person opens
it — and "end date unknown" on a no-mow plot reads as a date somebody forgot,
which is exactly the reading that gets it ignored. "Until it is lifted" names
the thing that ends it: Bill, or the lab, using **Lift** on the study page.
**Don't:** don't add a default end date to make it tidy, and don't let the
study form's "unknown" wording spread onto a restriction.

### Study categories and restriction types are the farm's lists, not the code's — 2026-09-25
**Decision:** both moved into the `farmsettings` drawer as
`farmsettings/trialcats` and `farmsettings/restypes`, with their own screens
under More → Farm settings. A restriction type carries `stops`, the kinds of
work it blocks, and `jobResCfg()` folds those into `JOB_RES` as a **union**.
The app picks a new type's color from `TR_RES_PALETTE`; a person never types
one.
**Why:** the succession rule. Adding a ninth restriction type or a new study
category was a source edit, which means it stops happening the day Dillon
leaves. Two details are load-bearing. First, `stops`: without it a type somebody
added would draw on the map and block nothing — it would look like it was
protecting the ground and it would not. Second, the color: every entry in
`TR_RES_PALETTE` is registered in `CB_MAP` as mapping to itself, so it survives
color-blind mode; a hand-picked color would be shifted a second time into
something nobody chose.
**Don't:** don't make `jobResCfg()` derive its list purely from `TR_RTYPES`. It
is a union on purpose, so that a list which is empty, malformed, or simply has
not reached this phone yet can only ever fail by leaving the original eight
blocking what they always did. Derived outright, a bad list would silently
**unblock** a job on ground a study has closed, and nothing on any screen would
say so. And don't add a color to `TR_RES_PALETTE` without adding it to `CB_MAP`
in `app-01-shell.js` in the same change.

### Location asks how much ground first, how many plots second — 2026-09-25
**Decision:** the Location section asks "entire plot or part of a plot?", and
only then, for a whole-plot study, "does it use more than one plot?".
`multiPlot` starts as **null** on a new study, meaning nobody has answered yet.
Plots are chosen by typing or with a Summitt blue **Select from the map**
button that reuses the crew's own plot picker (`pickOpen()` / `plotPickDone`).
**Why:** it is the order somebody standing in a field answers in. The old form
asked about multiple plots first, so a single-plot study — nearly all of them —
had to answer a question about several plots before it could say anything. Null
rather than false because false is an answer: an assumed "one plot" is how a
two-plot study ends up filed on one.
A part-of-a-plot study goes further: tapping the plot on that map goes
**straight on** to the pin screen, zoomed into the plot it just took
(`PICKCTX.thenPin`). No Done button in that mode — the tap is the answer.
**Don't:** don't collapse `multiPlot` back to a plain boolean, and don't build a
second plot-picking map. The one on `s-plotpick` is the map the crew already
use for every job, and a second one would be a second set of habits and a
second thing to keep in step with the farm's geometry. And don't push the pin
screen on top of the picker — it replaces it (`show('trialpin',false)`), so
Back from placing the trial returns to the form, where the plot is written
down and can be changed, rather than to the map again.

### The plot picker's search box is wired ONCE, for the life of the app — 2026-09-25
**Decision:** anything that changes how the picker behaves is read from
`PICKCTX` at the moment of the tap, never captured in the callback handed to
`pickFindWire()`.
**Why:** `pickFindWire()` guards itself with `inp._pfWired`, so the **first**
callback it is ever given is the one that serves every later use of that
screen — a job, a field log filter, a whole-plot study, a trial. Writing
`if(one)` against a variable from the enclosing render froze the mode at
whatever the picker happened to be doing the first time anybody opened it.
Caught in testing on the day it was written: after a part-of-a-plot trial, the
search box on the crew's own task screen threw `PICKCTX.thenPin is not a
function` and silently did nothing, while the map next to it carried on
working perfectly.
**Don't:** don't close over render-time state in that callback, and don't
assume a fresh render re-wires it — only `jobMapDraw()` does that, because it
clears and rebuilds its layers every time. `tools/test-plot-picker.js` §7b
guards it, and it has to **replace** the input and suggestion elements with
clones to test this: merely clearing `_pfWired` adds a second set of listeners,
so every choice fires twice and cancels itself out, and the check passes while
the bug sits there. The first version of that test did exactly that.

### "Treatments / products" came off the study form — 2026-09-25
**Decision:** the form no longer asks for it. Studies that already carry
`t.treatments` still show it, on the study page and at the bottom of the form,
labelled as being from the old form.
**Why:** Dillon's call. What is in a trial is usually a company's to keep quiet
about, and the app had no business asking twenty-three phones to carry it.
**Don't:** don't delete the field or the code that displays it. Taking the
question off the form is the decision; wiping what people already typed is not,
and nothing in the app should make a record disappear without being asked.

### A shift nobody clocked out of is closed at the SCHEDULED finish, or not at all — 2026-09-24
**Decision:** after a cut-off time the farm sets itself (`farmsettings/clockcut`,
8:00pm out of the box), `tcAutoClose()` in `app-05-tasks-clock.js` closes any
open punch on a day that has passed — at the hours that person was **scheduled
to finish**, never at the cut-off. It marks the punch `auto:true` and
`editedBy:'auto'` so a timesheet can tell it from a real one. If there is no
honest end time — no schedule for that date, no term filled in, or a clock-in
*after* the scheduled finish — **it writes nothing** and the student is asked
instead (the `shiftask` alert and `tcAskOutSheet()`).
**Why:** an open punch is a question somebody can still answer; a made-up
eight-hour day on a payroll record is a lie that gets paid. Closing at the
cut-off would have paid a student for standing in a field until eight at night.
**Don't:** don't make it fall back to the cut-off, or to a "typical" shift
length, to avoid leaving records open. Dillon chose the refusal on 2026-09-24
knowing it leaves work for him. And don't widen who runs it: only a phone that
`tcCanEditPunches()` allows does, because `canPunchFor()` in `firestore.rules`
is the same test — a student's phone writing another student's hours is the
thing that rule exists to stop.

### Closing a shift tells the student, not the manager — 2026-09-24
**Decision:** the manager hears when somebody clocks in and when somebody
clocks out, and hears **nothing** when the app closes a shift for them. The
student whose shift it is hears both "your shift was closed for you" and, when
the app would not guess, "you did not clock out — tap to say when you left".
**Why:** Dillon, asked directly: "just do it silently". It is a correction, not
an event he has to act on. The student is told because it is their pay and
their one chance to say the time is wrong before payroll.
**Don't:** don't read the silence as an oversight and add a manager alert while
"tidying". It is one branch in `ntfScanPunches()` plus one row in
`NOTIF_ALERTS`, deliberately absent.

### "You did not clock out" is the one alert the baseline does not swallow — 2026-09-24
**Decision:** every other alert works by noticing a CHANGE since the phone last
looked, and a phone's first look is a silent baseline so nobody's first sign-in
opens onto the farm's whole history. `shiftask` is exempt: it raises on a first
look too.
**Why:** it is a standing condition rather than a moment — "you have a shift
still open that the app cannot close" is just as true on a phone that only
started watching today. Baselining it meant a student who got a new phone or
cleared their browser was never asked again, and this is the only clock alert
with something for them to actually do. Safe because it can only ever be about
the signed-in person's own shifts, of which there are a handful.
**Don't:** don't "make it consistent" with the others by moving it back below
the `if(first) return;` line. That is exactly the bug, and nothing on any screen
shows it — the shift simply stays open for ever.

### A new bottom sheet must be named in all four CSS rules — 2026-09-24
**Decision:** `#donesheet`, `#partsheet`, `#restsheet` and `#asksheet` are
listed by id in four rules in the page's stylesheet. A sheet added without
being added to all four gets no positioning and no display rule.
**Why:** it fails silently and confusingly — the sheet never hides, sits at the
top of the screen with no dark backdrop, and nothing errors. `#asksheet` did
exactly that on its first outing and the tests sailed past it, because the
markup and the behaviour were both right.
**Don't:** don't convert these to a class to "fix" it without checking every
sheet still hides — and if you do add a sheet, `tools/test-notifications.js`
section 18 now fails when its id is missing from a rule that names
`#restsheet`.

### A labor request gets three alerts of its own, not the task ones — 2026-09-24
**Decision:** a labor request — Bill asking a grad or technician to take a job
on, or a grad or technician asking for help — raises **`reqnew`** when it is
sent, **`reqok`** when it is accepted, and **`reqdone`** when the job is
finished. Each has its own switch on the Notifications screen. The first goes
to whoever is being asked; the other two go back to whoever asked. The plain
"work assigned to me" and "a job I handed out is finished" alerts now
deliberately **exclude** request jobs, so no job ever raises two rows.
Who a crew request reaches is read off the roster through
`assignsUndergrads()`, never a hardcoded Bill, so it still lands the week he is
away and after he has gone.
**Why:** being asked, being told yes, and being told it is done are three
different interruptions with three different answers, and Dillon asked for a
switch on each. Folding them into the two task alerts would have meant one
switch for two unrelated relationships — and, worse, two rows about the same
job, because a request that is accepted becomes an ordinary assigned task and
would have tripped both.
**Don't:** don't "simplify" `ntfPlate()` back to including a request's
`target`. That is what makes a technician who ACCEPTS a request get told, one
tick later, that work was assigned to them — by themselves. The `t.target!==me`
guard on the assigned branch is the other half of the same fix. And don't
reorder the branch chain in `ntfScan()`: it runs latest-stage-first on purpose,
so a phone that was out of signal all morning hears "it is done" rather than
"somebody is asking".

### Notifications are worked out on the phone, never stored in the database — 2026-09-24
**Decision:** the bell and the Notifications screen show three real things — work
assigned to you, a job you handed out being finished, and a job coming back
part-finished — and every one of them is **derived from the task list each phone
already holds**. There is no notifications collection, no permission rule, no
drawer and no row in `tools/test-sync-settles.js`, because nothing is ever sent.
Each phone keeps only its own small ledger under the signed-in person
(`prefsGet('ntfeed')`): the last state it acted on for each task, the events it
has raised, and when that person last read them. A phone's first look at the
task list is a silent baseline, so nobody's first sign-in opens onto every job
on the farm. `ntfScan()` and the rest are in `app-01-shell.js`; the hook is
`tsyncRepaint()` in the page, which is where a task actually changes.
**Why:** a notification is a fact about a task, and every phone already has
every task. Storing them would have cost a record per person per event, piling
up forever with no natural end — the exact shape CLAUDE.md warns about — plus
rules, a settle test, and another chance to build the send-it-back-and-forth
loop that spent 4.4 million reads on 2026-08-31. Derived costs **nothing**: no
extra read, no extra write, and it keeps working with no signal.
**Don't:** don't "fix" this by making notifications a shared drawer so they
follow a person between phones. That trade is real — sign in on a new phone and
you start from that moment, with no history — and it was made deliberately in
favour of costing the farm nothing. If it ever has to change, the thing to
change is push, not storage. And don't rename `assignee`, `assignedBy`,
`requestedBy`, `completedBy`, `partial`, `leftPlots` or `restAssigned` on a task
without looking here: those seven field names are the whole feed, and renaming
one kills the alerts with nothing on screen to say so.
`tools/test-notifications.js` section 10 is the tripwire.

### A settings screen says when it is not doing anything — 2026-09-24
**Decision:** the five alert types that are not wired up yet, and both Delivery
toggles, carry the words **"Not sending yet"**, and a note at the top of the
screen says these alerts reach you inside the app rather than by making the
phone buzz.
**Why:** the toggles saved their state from the day they were written but
nothing read them, so a person could turn "Equipment down" on, see it stay on
through a reload, and reasonably conclude they would be told when a mower went
down. A control that lies about what it does is worse than one that admits it.
The switches are grouped under the **page of the app** each alert comes from,
Task Board first, and the screen builds those headings from the rows
themselves (`ntsAlertGroups()`).
**Don't:** don't leave the label on after wiring an alert up — it goes in the
same change, by adding `live:1` to that row of `NOTIF_ALERTS` (or
`NOTIF_DELIVERY`) in `app-01-shell.js`. And delete `NTS_NOTE` in the change
that makes push notifications actually work. Don't put the headings in a list
of their own either: a second list disagrees with the first eventually, and
the way it fails is a switch that stops being drawn while its setting carries
on existing — invisible until somebody goes hunting for it.

### A request can be taken back — 2026-09-23
**Decision:** the Requests tab draws a bin on a request **you** raised, and
tapping it asks before it removes the job everywhere. **Everyone who can raise
a request can cancel one** — Bill on his "Sent to grad / tech" list, and grad
students, technicians **and faculty** on their "Sent to Bill" list.
`reqDelBtn()` in `app-03-people.js` decides whether it is drawn; the
`data-reqdel` handler in `app-04-spray-inventory.js` asks and then calls the
existing `deleteTask()`.

Faculty needed a second change to get there. Their Requests tab was a single
read-only list of the whole farm's open requests with no row of their own on
it, so there was nowhere to put a bin. They now get the same "Sent to Bill"
section everybody else has, with the farm-wide list kept below it and their
own requests taken out of it — one request, one row, one answer. The
farm-wide list stays read-only: watching the queue is not the same as handing
undergraduates out, which is still only Bill. There is no "From Bill" section
for faculty because `openCrewReq()` only offers `CREW` — grads and
technicians — so it could never hold anything.
**Why:** Dillon asked for it. Until now a request was permanent the moment it
was sent — the board's own bin only draws on Bill's Board tab, and a request
sitting on nobody's day is never on that tab — so work nobody wanted any more
sat on somebody's screen until they did it. **No permission changed and
`firestore.rules` was not touched.** `taskCan(...,'delete')` and the rules
file's `canEdit()` have both said "the person who raised it" since
2026-08-31; the button is what was missing, not the right. That is also why
the rules do not need publishing for this.
**Don't:** three things. (1) Don't draw the bin on a **finished** request —
that is the farm's record of work that actually happened, and this tab is the
one screen it could have been quietly deleted from. (2) Don't draw it without
asking `taskCan()` first: a request raised before the app stamped `createdBy`
has no author the database recognises, so the bin would be a button that does
nothing and says nothing. (3) Don't fold `data-reqdel` into the board's
`data-del` handler to save a few lines — that one deletes with no question
asked, which is fine for Bill removing a job off his own board and wrong for
a request somebody else may already be out doing. `tools/test-task-permissions.js`
section 8c holds all three, and 8d holds the tab as it is actually drawn for
each role — a permission nobody can reach on screen is not a permission, which
is the whole reason faculty were left out of the first version.

While these rows were open, two of them were printing a raw roster id where a
person's name belongs — "→ p09" on Bill's sent list and on an assigned
request, and "p09 · needs 3" as the asker on the faculty list. Fixed with
`nameOf()` / `reqByLabel()` in the same change.

### The graduate students are on the Task Board, and keep weekly hours — 2026-09-23
**Decision:** two changes made together, because neither is worth much alone.
(1) The Board tab lists the graduate students beside the undergraduates.
`tbBoardPeople()` in `app-03-people.js` is now the one place that says who the
board draws, and the once-a-minute color repaint (`tbStateSig()`) reads the
same function. (2) The weekly schedule panel on the profile screen is open to
grad students as well as undergrads — `schedKeepsHours()`, which asks the
**roster** for the person's job, not `currentRole`.
**Why:** Dillon asked for both, and they fit together. A job sitting on a grad
student used to be drawn on no screen Bill had: the board listed the undergrad
pool and nobody else, so `boardOffChart()` swept it into "Not on any day above"
— the section for work the board cannot place. That is the same hole that made
five mow jobs undeletable on 2026-08-31, still open for one whole role. And a
name on the board is colored by whether the person is down to be in that day,
so putting grad students up there without giving them anywhere to say when they
work would have left four permanently grey names.
**What this does NOT change:** who Bill may direct. He still only **asks** a
grad student — `taskCan()` is untouched, and the assign screen still keeps them
under "Grad students · sends a request" rather than in the day board he assigns
from directly. Seeing what somebody is doing and setting their day are different
questions, and the board answers the first one. That is why a grad student's row
on the board carries their job title after their name and an undergrad's does
not: the row looks identical otherwise, and what Bill may do with it is not.
**Don't:** don't fold `rstGradIds()` and `rstUndergradIds()` into one list. The
assign picker reads the undergrad list to decide who Bill hands work to
**directly**, and a combined list would quietly move grad students into that row
— the farm's organisation chart changed by a tidy-up. For the same reason
`schedCrewOn()` still answers for the undergrad pool only; the board counts its
own people for the "· N in" line instead. And don't narrow faculty to match the
manager: a PI still sees their own lab plus the shared pool, not every grad on
the farm.
**Also fixed on the way past:** the faculty branch put display *names* into that
list where everything else holds roster ids, so `tbPersonState()` could not
resolve them and a PI never saw their own lab's hours or clock-ins on the board
at all. It is ids now, and `tools/test-schedule.js` section 3c fails if a name
ever gets back in.

### The Farm Manager is not a section on his own Task Board — 2026-09-23
**Decision:** the Board tab lists the crew only. The signed-in manager's own
name, and the jobs he assigned to himself, no longer appear there — they are on
his **Mine** tab, which is the tab that exists for them. `boardOffChart()` skips
his jobs for the same reason, so they cannot reappear under "Not on any day
above".
**Why:** Dillon, 2026-09-23: the Board is the screen he reads to see who is
working and on what, and his own name sitting at the top of it was noise on the
one screen that is meant to be about other people. It also put his name on every
row of his own section. Mine already shows those jobs, numbered, with Start,
exactly as before.
**Don't:** don't "restore" him by putting `SESSION.pid` back into `people` in
`renderBoard()` — and if you ever do, remember the two halves move together: the
`isMe()` skip in `boardOffChart()` has to come out at the same time or half his
work disappears. One real cost is worth knowing: a job he dates beyond the five
day chips is now on no screen of his until that week comes round, the same as it
already was for every crew member.

### Every page but Home, Tasks and the Map is "Coming Soon" for the crew — 2026-09-18
**Decision:** Inventory, Trials, Equipment, Field Log, Time Clock, Calendar and
Weather open faded under a "Coming Soon" card for everyone except the Farm
Manager and whoever holds the App Manager post (`CS_LOCKED` / `csApply()` in
`app-01-shell.js`). Their entries on the bottom bar, the rail and More are dimmed
but still tappable. The pages still load and sync underneath; only the screen is
covered.
**Why:** those pages need serious refining before the crew relies on them, and
Bill and Dillon still need to use them to do that. Asking by job rather than by
name means a new Farm Manager or App Manager is let through without a code edit.
Undergrads can still clock in and out from the Home screen's clock widget, which
is not covered.
**Don't:** mistake the cover for a bug, or hide the pages from the nav instead —
a missing page looks broken, a labelled one does not. To release a page, take
its screen name off `CS_LOCKED`; to release them all, delete the block and the
`csApply()` line in `show()`. This is a courtesy, not security: the database
rules are unchanged.

### A name on the Task Board is colored by where that person is in their day — 2026-09-18
**Decision:** on the Board tab each name's text is colored (`tbPersonState()`
in `app-03-people.js`). Only the text: the same day a highlighted bar with a
background was tried, and Dillon asked for plain colored names back, as the
schedule's green name used to be. **Orange** means scheduled and not clocked in yet.
**Green** means on the clock now. **Red** means clocked out today, or the shift
has ended. A person with no shift and no punch stays plain grey. Clocking in
beats everything else, so somebody who comes in early, or comes in when they
were not scheduled, shows green. If their start time passes and they have not
clocked in, they stay orange ("not clocked in yet") until the shift ends, then
go red. Clocking out for lunch turns a name red, and clocking back in turns it
green again. Any day other than today can only be orange or grey, because
nobody has clocked in on it yet. Dillon asked for all of this, including that
unscheduled people stay grey until they clock in.
**Why:** Bill can see who has actually turned up, not only who said they would.
With the color-blind palette on, the usual color swap would turn red and
orange into two nearly identical oranges, and those are exactly the two
colors this feature needs people to tell apart. So color-blind mode uses
three hand-picked colors instead: amber, blue and vermillion. Each dot also
gets its own shape (diamond, circle, square), and the words under every name
say what the color means.
**Don't:** remove the identity entries at the bottom of `CB_MAP` (colors that
map to themselves, like `'#0072b2':'#0072b2'`). They look pointless. But the
color-blind copy of the stylesheet sends *every* color through `CB_MAP`,
including the hand-picked ones, and without those entries it would shift them
a second time. Also don't read the board's colors from `currentRole` or from
the phone's own punches only: `window.tcBoardState()` reads the shared time
clock, so a clock-in on someone else's phone reaches Bill's board.

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

### A new hire is added by roster id, and 23 is frozen in place — 2026-08-31
**Decision:** `rstSeedNewcomers()` in `app-03-people.js` copies somebody from
the built-in roster onto a phone only when their id is HIGHER than the highest
that phone has ever seen. The mark is stored in `ut_people_seen_v1`, and on a
phone that has never stored one it starts at `RST_HWM_BASE=23`.
**Why:** a phone that has saved its own roster stops reading the built-in list,
which is right — it is holding somebody's edits, and reading over the top would
undo them every morning. The cost was that a new hire was invisible to everyone
except whoever typed them in. Levi Cunningham (p24) could sign in on his own new
phone while Bill, whose phone had had the app for weeks, could not see him to
put him on a job. Copying the list back in blindly would have been worse than
the bug: removing somebody from the roster is deliberate and has no undo, and a
blind copy would hand them back at the next reload. Ids only ever count upwards
— `rstNewId()` takes the highest and adds one — so an id above the mark cannot
be somebody this phone removed, and an id below it that is missing was taken off
on purpose. That is the whole trick.
**Don't:** raise `RST_HWM_BASE` when somebody is hired. It is not the size of
the roster; it is a fact about what was on every phone on 2026-08-31, and it
must stay 23 forever. Raising it to 24 for Levi would tell every phone that
p24 is old news and he would stop arriving on the ones that have not opened the
app yet. Also don't replace the stored mark with "the highest id I hold, worked
out fresh" — removing p24 would drop that to 23 and hand him straight back the
next morning. `tools/test-session.js` sections 9, 9b and 9c pin all of this.
**Still true, and worth saying out loud:** hiring somebody STILL means editing
`app-03-people.js`, which is exactly what `docs/SUCCESSION.md` says should not
be necessary. This makes the current arrangement work; it does not fix it. The
real fix is the roster travelling through the shared database like tasks and
equipment do, and that needs a decision first — `refdata/roster` deliberately
carries only role, lab, active and grants, and NOT names (see the crew-addresses
entry), so it cannot carry a new person today.

### The roster is one record per person, not one document — 2026-08-31
**Decision:** `refdata/roster`, a single document holding everybody, was
replaced by `roster/{pid}`, one record each. `rec()` in `firestore.rules` reads
those instead. The old document is left in the rules as an explicit
`allow write: if false` rather than deleted.
**Why:** Dillon wanted the faculty to be able to add a hire. A whole-roster
document arrives at the database as ONE write, and no rule can look inside it
and tell "added an undergrad to my own lab" apart from "made myself Farm
Manager". One record per person is the only shape in which that sentence can be
written down and enforced — it is now `facultyMayWrite()`. The split also made
the syncing code *simpler*, not harder: the roster became an ordinary
collection drawer like the other twelve instead of the app's only document
listener.
**What it costs:** a request that asks about two people now fetches two records
instead of one. The ceiling is ten per request and repeated lookups of the same
record inside one request are still fetched once, so two is not close.
**Don't:** delete the closed `refdata/roster` block. A phone running a
week-old copy of the app still knows that path, and a clean refusal is better
than a write that lands somewhere nothing reads. And don't "simplify" `rec()`
by dropping the `exists()` guard — reading a field off a record that is not
there is an error, and an error there denies *every* rule in the file for that
person, including the roster read they need before the app can tell them
anything at all.

### Names travel to the database now; addresses travel separately — 2026-08-31
**Decision:** roster records carry `first`, `last` and `pron`. Email addresses
do not — they live one row per address in `accounts/{lowercased-email}`, which
is `allow get` for the owner of that address and `allow list: if false`.
**Why:** the entry above from 2026-08-17 kept names out along with the
addresses. That was over-cautious and it cost the farm the ability to hire
anybody without a code change: the names are already in the app's source, and
the source is a **public website**. Keeping them out of a private,
rules-protected database bought nothing. Addresses are genuinely different, and
not for squeamish reasons: a roster record is readable by everybody signed in,
so an address on it is the whole crew's address book handed to anyone with an
account — and anyone on the internet can make an account in this project,
because the app's Firebase key is public and has to be. One row per address,
readable only by its owner, is a different thing entirely.
**Don't:** change `allow get` to `allow read` on `accounts`. In Firestore
`read` means get **and list**, and the addresses ARE the document names, so
that one word hands the address book to any junk account in a single request.
`allow list: if false` is written out underneath precisely so that nobody
re-adds it by accident. Also don't put addresses back into `RST_SEED` or the
repo — that decision has not changed and `tools/test-db.js` fails on an `@` in
anything the roster sends.

### The roster drawer starts before anybody is signed in — 2026-08-31
**Decision:** `rstsyncStart()` gates on `fbAuth().currentUser`, where all
twelve other drawers gate on `SESSION.pid`. `authSignIn` also fetches the
roster once, on the spot, when it knows who somebody is but this phone does
not.
**Why:** a deadlock. `sessionSet()` refuses an id it cannot find in `PEOPLE`. A
new hire's phone has never had the app, so `PEOPLE` is `RST_SEED`, which does
not contain them — they were told *"That account is no longer active on the
roster"*, which is both untrue and impossible for them to act on. But the
roster is what would tell the phone who they are, and every other drawer
refuses to start until the phone already knows. Roster needs session; session
needs roster. The roster is the one that has to give.
**Don't:** "tidy" that gate to match the other twelve. It looks like an
inconsistency and it is the fix. And don't move the roster fetch into
`authBoot()` — that function is synchronous on purpose and must never wait on
the network; `authSignIn` is the right place because it already refuses to run
offline.

### A roster id can come from the database, not only the token — 2026-08-31
**Decision:** `me()` in `firestore.rules` is now "the claim on the token if
there is one, otherwise the `accounts` row". `authPidResolve()` in the app does
the same, in the same order.
**Why:** a custom claim can only be stamped with the master key, which means a
laptop, which is the exact thing hiring-in-the-app exists to remove. Somebody
hired through the app has no claim, so there has to be a second answer. The
claim is still tried first and is still better: it costs nothing, it cannot be
edited by the account holder, and it works with no signal. The lookup is only
ever reached by somebody who has no claim, and the moment
`tools/create-accounts.js` is run again the claim takes over and the read stops
happening. **The twenty-four existing people pay nothing** — the ternary
short-circuits before the `get()`.
**Don't:** reverse the order "for consistency". And note that
`tools/test-rules.js` used to assert `token.email` appeared nowhere in the
rules; that assertion was this decision written as a test, and replacing it was
deliberate, not a workaround.

### "First time here" is a panel on the sign-in screen, not a screen — 2026-08-31
**Decision:** the flow that lets anybody choose their own password lives inside
`#s-login` as `#lg-first`, and the link that opens it is shown even in
`EASY_SIGN_IN` mode, where it used to be hidden.
**Why:** two reasons. The sign-in screen is the one screen that exists *before*
the app has chosen between the phone shell and the wide one, so a panel there
cannot go missing from one of them — which is exactly what happened to More on
the rail (see the entry for 2026-08-30). And the link was hidden because it
only sent mail that was not arriving; it now also lets a person set a password
with no mail at all, which is **the way off the one shared password published
in this public file**. Hiding it would hide the only way out.
**Don't:** hide the link again while `EASY_SIGN_IN` is true. The switch is
still meant to be turned off, and this panel is how the crew get moved across
one at a time instead of all at once from a laptop.

### Records are compared with their fields sorted — 2026-08-31
**Decision:** every drawer decides "has this changed?" through `sdbJson()` in
`app-02-fieldlog-sync.js`, which sorts a record's fields by name before turning
it into text. Bare `JSON.stringify` is no longer used for that anywhere, and
`sdbJson()` is what fills each drawer's `seen` list too.
**Why:** the database hands a record back with its fields in **alphabetical**
order, which is almost never the order the app created them in. Comparing the
two as plain text therefore reads an unchanged record as changed. The drawer
sends it up, the server sends it back, and it never converges. On 2026-08-31
that spent **4.4 million reads in one day** against a free-plan allowance of
fifty thousand, with one person using the app, and took the farm's sharing down
with nothing on any screen to say why.
**Don't:** "simplify" a comparison back to `JSON.stringify` because it looks
like the same thing. It is the same thing exactly until a record makes a round
trip, which is the only case that matters. Lists are deliberately **not**
sorted — the order of a list is part of what it says.

### A drawer remembers a record in the form it would SEND it — 2026-08-31
**Decision:** when a record arrives, a drawer records `seen[id]` as
`sdbJson(theDrawersOwnDocFunction(arrivingRecord))`, not as `sdbJson(arriving)`.
The stock movements drawer was changed to do this; it is the rule for new ones.
**Why:** several `*Doc()` functions fill in a missing field — `invMoveDoc()`
supplies `delta`, `flDoc()` supplies `loggedBy`, `taskDoc()` supplies
`createdBy`. Remembering the raw arrival while comparing against the filled-in
version means the two never match, and the record goes up on every scan
forever. Same failure as above, different cause.
**Don't:** assume a record that came from the server is already in the form
this phone would send. It is only true when the doc function adds nothing.

### An arriving record saves to the phone; it does not start a send — 2026-08-31
**Decision:** `storeScan()` was split. `storeSaveLocal()` is the half that
writes to the phone and touches no network; `storeScan()` is that plus every
drawer's `*syncTick()`. **Every snapshot handler calls `storeSaveLocal()`.**
Only the two-second heartbeat and a few deliberate user actions call
`storeScan()`/`storeTouch()`.
**Why:** eleven snapshot handlers used to call `storeTouch()`, so one record
arriving from another phone immediately offered **all seventeen drawers** to
the database. A record arriving is the thing a send causes, so that closed a
circle: send, receive, send. It meant a disagreement in ONE drawer ran at
network speed rather than once every two seconds — the difference between about
43,000 reads in a day and 4.4 million.
**Don't:** put `storeTouch()` back in a snapshot handler because the screen
felt slow to catch up. It never was the thing that made records reach other
phones; the heartbeat is, and it is two seconds away.
**Note:** `tools/test-mapsync.js` had two checks that only passed *because* of
this amplification — one drawer's traffic was starting another drawer. They
were rewritten to run the heartbeat instead.

### The brake: a record offered over and over is stopped — 2026-08-31
**Decision:** `sdbMaySend(key, what)` in `app-02-fieldlog-sync.js` sits in front
of every send. Offer the same record more than `SDB_LOOP_MAX` (12) times in a
minute and it stops going up; every drawer's summary line on the Shared
database screen then says so in words. Reopening the app clears it.
**Why:** the three fixes above repair the loops we found. This catches the next
one. The fastest anything here can legitimately send is once every two seconds,
and nobody saves the same record twelve times in a minute, so twelve is well
clear of real use and still stops a runaway in under a second. The cost of
being wrong is one record not syncing until the app is reopened, and it says on
screen that it happened. The cost of not having it was the whole farm's day of
database allowance, spent by lunchtime, silently.
**Don't:** raise the limit to get past a record that keeps tripping it. A
record that trips it is a record that cannot agree with the server, and that is
the bug.

### Every drawer has a settling test — 2026-08-31
**Decision:** `tools/test-sync-settles.js` walks every drawer, hands it a
record, hands the same record back as the server would, and requires the drawer
to have nothing to say. It does it twice: once with the fields in the order the
database uses, once reversed.
**Why:** this check already existed on 2026-08-31, for **one** drawer — the
roster, in `tools/test-rostersync.js` — and the roster is the one drawer that
did not break. That is the whole lesson. Written as one file rather than a line
in each drawer's own test so that leaving a drawer out is visible: section 1
fails if the app listens to a collection the table does not name, which is how
the time clock got added to it.
**Don't:** let a row go vacuous. Each row carries its own sample record on
purpose — an earlier draft used whatever the app had seeded, and most
collections are empty at boot, so it passed while checking almost nothing.

### A weekend due date is not unusual, it is invisible forever — 2026-09-01
**Decision:** `openWiz()` in `app-05-tasks-clock.js` runs a spray pulled off
the calendar through `asNearestWeekday()` before using its date as the
assignment's default due date. `asDateOptions()` itself is untouched — it
still lets an *existing* task keep a weekend due date rather than silently
moving it, which is deliberate and predates this entry.
**Why:** the day board only ever draws Monday–Friday chips (`boardDayOrd()`
can only equal one of those five). A spray calendared for a Saturday, assigned
to an undergrad with its date left untouched, produced a task with a due date
no chip will ever match — not "hard to find," but permanently absent from
that person's Mine tab with nothing on screen to say why. This is what "Bill
assigned a task and it never showed up" turned out to be. Unlike a task due
next week, which simply waits for its week to arrive, a weekend due date never
resolves on its own.
**Don't:** "fix" this by also changing `asDateOptions()`'s own selOrd
fallback. That fallback is what stops an old, already-saved weekend-dated task
from being silently rewritten the moment somebody opens it to edit something
else — see the comment above it. The bug was in the FRESH default offered for
a brand-new assignment, not in how an existing record is preserved, and the
two must not be conflated. `asNearestWeekday()` only ever touches a default
being proposed for a new pick, never a task's own stored due date.

### The home screen's task card only repaints when you walk onto it — 2026-09-01
**Decision:** `tsyncRepaint()` in `UT-TurfFarm-App.html` now also calls
`hwApply(currentRole)` when the signed-in person's own home screen is the one
currently on screen, the same guarded pattern it already used for the task
board and the shared-database screen.
**Why:** "My tasks today" and the Assigned/Done/Hours strip on Home are built
once, by `hwApply()`, and `hwApply()` only ever ran from two places: boot, and
`show()`'s `id.indexOf('home-')===0` line when you navigate onto a home
screen. Neither of those fires when a task arrives from the server a moment
*after* you're already sitting on Home — which is the ordinary case, since
signing in lands you on Home before the first Firestore snapshot is even
back. Confirmed live: signed in as Barrett Smith against the real database,
Home said "0 assigned / Nothing assigned to you right now" for a mow job that
was correctly sitting in `TASKS` and correctly showing on the Task Board
underneath the whole time. Bill reported this as "tasks don't sync" — they do;
the one card that greets you first just never found out.
**Don't:** "fix" this by having `hwApply()` run on a timer, or by having every
sync module poke Home directly. `tsyncRepaint()` is already the one place
that knows a redraw is due and already gates it on which screen is active —
this is one more line in that same gate, not a new mechanism.

### A refused upload was remembered as a sent one — 2026-09-02
**Decision:** `tsyncScan()` and `tsyncUploadNew()` now undo their own optimistic
`TSYNC.seen[id]` mark when the write they just made it for actually fails,
guarded so a real answer that lands in the meantime (a later success, a
delete) is never clobbered by a stale retry's cleanup.
**Why:** both functions mark a record `seen` — "the server has this now" —
*before* `.set()` resolves, so the very next tick, two seconds away, does not
send the same record twice while the first attempt is still in flight. That
is the right call when the write is going to succeed. It is the wrong one
when it is not: a refusal (the published rules not matching the app yet, a
dropped connection, `sdbMaySend`'s own brake) left `seen` holding a value
nothing on the server has ever agreed to, and `if(TSYNC.seen[id]===json)
return;` then skips that record on every scan from then on, forever, in that
tab. Found live on 2026-09-02: the Firestore rules had not been republished
after the roster migration, Bill's assignment to an undergrad was refused
with `permission-denied`, and the task sat "sent" on his phone and absent
everywhere else, with nothing on any screen saying why. Republishing the
rules fixed *new* attempts; it could not fix that one, because the app had
already convinced itself the job was done.
**Don't:** remove the optimistic mark entirely to "just be safe" — that
brings back the double-send it was written to prevent. And don't treat this
as reason to distrust `sdbMaySend()`'s twelve-a-minute brake — it still
gates every retry this produces, unchanged; this only stops a permanently
wrong answer from being cached in between brake checks.

### "No connection" is double-checked with Google before it is shown — 2026-09-15
**Decision:** when the database library reports `unavailable`, `sdbError()` no
longer says "No connection — try again on wifi" straight away. `sdbReachCheck()`
in `UT-TurfFarm-App.html` asks Google once, directly, with a plain web request
that goes round the library, and the words follow the answer: no answer means
no connection; a 429 means the free allowance is used up; any other answer means
the connection is fine and the app itself needs reopening. The Shared database
screen's connection test and its "copy details" text use the same answer.
**Why:** the library reports "Google is turning this project away because it
is over its free limit" as `unavailable`, exactly like "no signal". On
2026-09-15 Dillon was told to try wifi while sitting on wifi, with the project
over its no-cost limit, and nothing on screen pointed at the real cause.
**Don't:** call `sdbReachCheck()` without its five-minute memory, or from
anywhere that runs on a timer. Seventeen drawers retry every ten seconds when
the database is down; each asking Google would be a stream of requests from
every phone. It is only asked when something has already failed, at most once
every five minutes, and the anonymous question it asks is refused by the rules
before any record is read.

### A device that talks to the database too often pauses itself — 2026-09-16
**Decision:** `sdbNetWatch()` in `app-02-fieldlog-sync.js` counts every request
this device makes to the database, using the browser's own record of its
requests rather than anything the database library reports. The count is shown
on the Shared database screen in plain words ("11 times a minute — normal").
Past `SDBNET_MAX_PER_MIN` (200 in a minute) that one device stops talking to
the database, every drawer's line says so, and reopening the app clears it.
**Why:** `sdbMaySend()` watches records going UP. On 2026-09-15 the farm's
whole day of allowance — 2.2 million reads against fifty thousand — went on
something it cannot see: one device re-making its connection over and over,
each time re-registering all seventeen drawers, each registration costing a
roster lookup inside the rules. Almost nothing was sent, no drawer reported an
error, and that device's own counts on screen stayed small. Nothing in the app
could see it, because nothing in the app was counting. Measured for comparison
the next morning on a signed-in browser: 18 requests in 86 minutes.
**Don't:** raise the limit to get a device working again. A device past 200 a
minute is a device with something wrong, and the limit is already five times a
busy phone. Don't count with a wrapper around the database library either —
the library believed it was idle throughout 2026-09-15; the browser's own
record of its requests is the thing that cannot be fooled.

### Every open copy of the app talks to the database for itself — 2026-09-16
**Decision:** `fbDb()` turns on the saved copy with `synchronizeTabs:false`, not
`true`.
**Why:** with it on, only ONE open copy of the app on a computer talks to the
database and every other copy goes through it. On 2026-09-16 Bill's laptop, running
the installed app, had that one copy paused by `sdbNetPause()`, which switches its
connection off. Every copy opened afterwards made **zero requests** and got
`unavailable`, even after the browser was quit, because the installed app can
stay running on its own. Bill's task for Garrett could not leave the laptop, and
the screen told him to reopen the app, which did nothing. Reproduced the same
day in two tabs with the farm's own copy of the library (12.18): with it on, the
second tab gets `unavailable` in 11 ms and makes no requests, and still does
after the first tab is closed. With it off, the second tab reaches the
database, and so does the first one after it.
**Don't:** turn it back on to save a few reads when two windows are open. The
cost of on is one hidden window silencing every other copy with nothing on
screen to say so.

### A pause writes down what caused it, and keeps it — 2026-09-16
**Decision:** when `sdbNetPause()` fires it first saves a report on the device
(`ut_sdb_pause_last`): the last minute's requests sorted into kinds (new
connection, waiting for news, closing, listening, sending, asking directly),
whether the device had just slept, lost signal or been hidden, installed app or
browser tab, and each drawer's state. It survives reopening, and the Shared
database screen's copied details include it.
**Why:** Bill's laptop paused on 2026-09-16 with one copy open and nothing else
running, and nobody could say what the 200 requests were. Reopening wiped the
count. "Reconnecting over and over", "sending" and "reading" are three
different bugs, and guessing between them had already sent us the wrong way
once that day.
**Don't:** clear the report when the app reopens. Reopening is the first thing
anybody does, so a report that doesn't survive it is useless. And don't read
the kinds as exact: they come from how Google's addresses look (see
`sdbNetKind()`), and a library update could change those. If a report says
everything was "other", check the addresses before trusting it.

### A failed task send waits before it tries again — 2026-09-16
**Decision:** a task whose send fails waits 10 seconds, then twice as long after
each further failure, up to 5 minutes (`tsyncWaiting()`), before `tsyncScan()`
or `tsyncUploadNew()` offers it again.
**Why:** after the 2026-09-02 fix a failed send went back out on the very next
scan, every two seconds. `sdbMaySend()` reads 13 sends in a minute as a loop and
stops the record until the app is reopened, so half a minute of failure turned
into a task parked for good, while the assigner had been told "Assigned ✓".
**Don't:** exempt retries from `sdbMaySend()` instead. The brake is right about
real loops; the retries just should never look like one.

### A screen must survive a companion file being older than the page — 2026-09-16
**Decision:** anything a screen borrows from `app-01`…`app-05` is called
through `typeof fn==='function'` and falls back to words that say the app is
still updating. `sdbRender()` and `sdbDetails()` do this for the traffic meter
that lives in `app-02-fieldlog-sync.js`; `tools/test-db.js` renders the screen
with those functions removed and fails if it throws or draws nothing.
**Why:** the meter shipped the same day it was written, and the Shared database
screen called `sdbNetWords()` — which lives in a different file — without a
guard. A phone that had the new page beside the previous copy of `app-02`, the
ordinary state for a few minutes during any update, threw on that line and drew
**an entirely blank screen**: no error, no explanation, nothing. Dillon opened
it and found nothing there. Every phone passes through that mixed state on
every single update, so this is not an edge case, it is the rollout.
**Don't:** conclude the guard is unnecessary because the files are published
together. They are *served* together and *cached* separately — the page comes
down fresh while the old companion file is still in the phone's offline copy.
And don't rely on the checks to catch it: all 2,229 of them passed, because
they glue the current files together and the mixed state never arises.

### "Send the roster" follows the database, not this device — 2026-09-16
**Decision:** the Shared database screen asks `rosterInDb()` — is the roster in
the database — instead of `rosterSentAt()`, which only ever said whether
somebody pressed the button **on this device**. The answer comes from the
roster drawer's `seen` list, which holds what the server has agreed to, and it
has three states: yes, no, and "this device has not heard back yet". Only a
definite no shows the red warning. `rosterSentAt()` survives as a footnote on
that row and in the copied details, where it is labelled as this device's own
history.
**Why:** on 2026-09-16 Dillon's laptop said "Send the roster first. Until it is
up there, the database refuses everything" on every drawer, while the same
screen showed 24 people arriving from the database, 87 machines, 31 tasks and a
connection test answering in 5 milliseconds. The laptop had simply never
pressed the button. Worse than noise: pressing it rewrites the farm's roster
from whatever that device happens to be holding, so the screen was pushing him
towards the one action that could do damage.
**Don't:** treat "not heard back yet" as "the database is empty" — that puts
the red warning on every phone for the first seconds after it opens, which
trains everybody to ignore it. And don't delete `rosterSentAt()`: the first
migration still needs a device to know it has done it.

### The plot-picking maps zoom closer than the Farm Map — 2026-09-16

**Decision:** the maps built by `jobMapEnsure()` — assigning a task, the plot
picker, the task detail map and the crew's work map — go to zoom 20 and snap in
quarter steps. The Farm Map, the trial pin map and everything else stay at 18.

**Why:** these are the maps where somebody taps one plot. At 18 a CAFS or SF
plot is roughly fingertip-wide and picking one out of a row was guesswork. The
photo is only sharp to 19 and is enlarged beyond that, which is acceptable
because the plot outlines are drawn on top and stay sharp. Quarter-step zoom
lets the map open filling a phone screen instead of rounding a whole level out.

**Don't:** "tidying" the four maps back to one matching `maxZoom:18`.
That brings back the bug. The Farm Map was capped at 18 on 2026-08-26 for its
own reasons; it was not a rule that every map must match.

**Update 2026-09-18:** the Farm Map now goes to 20 as well. Dillon found it
stopped three or four clicks short of the Assign Task map, and he wanted to see
single plots there too. The trial pin map is still at 18. The Farm Map snaps in
whole steps, not quarter steps, so the way it opens is unchanged.

### Completed tasks are shown one day at a time, looking back — 2026-09-16

**Decision:** the Completed tab on the Task Board uses the same Mon–Fri chips as
Board and Mine, but on Completed a chip means the most recent such day (today
or earlier), where on Board it means the next one. Jobs are filed by the day
they were **finished**, not the day they were due. A job finished on a Saturday
or Sunday is filed under the Friday before, and its row says the real day.

**Why:** nothing has been completed next Monday, so the forward-looking reading
would leave most chips permanently empty. There are no weekend chips, and
without the Friday rule weekend work would vanish from the tab.

**Don't:** swapping `boardPastOrdFor()` for `boardDayOrd()` so the two
tabs "agree", or filtering on `dueAt` instead of `completedAt`.

### Map photos are fetched openly, and saving one can never cost it — 2026-09-16

**Decision:** the offline worker (`tools/build-sw.js`, which writes `sw.js`)
asks the Esri imagery server for each satellite photo as an open (cors)
request, keeps only photos it can read, and saves them in the background where
any failure is ignored. The photo cache was renamed `ut-turf-tiles-v2` so every
phone throws the old one away. Every map also asks again for a photo that fails
to download: three more tries, after 2, 5 and 12 seconds (`mapChrome()`).

**Why:** the map showed flat green squares where photos should be. The map's
own request gets a sealed reply the phone cannot measure, so storage booked
every photo at several megabytes: 30 photos of about 10 KB each booked 225 MB.
Once a phone ran out of room, saving failed, and the old code then threw away
the photo it had just downloaded. With open requests the same 30 photos take
0.4 MB. The retry covers the other cause: one bar of signal in the field.

**Don't:** go back to `caches.put(req, await fetch(req))` in one step, or cache
a reply whose `type` is `'opaque'`. Either brings the green squares back, and
nothing shows an error when it happens. If `TILES` is renamed again, keep the
`k !== TILES` in `activate` or the photos get deleted on every update.

### An update is applied on opening if nobody has touched anything yet — 2026-09-18

**Decision:** when the app opens and a newer version is waiting, or finishes
downloading in the first 20 seconds, it switches to it straight away, as long
as nobody has tapped or typed yet. After that, the "A new version is ready"
bar works exactly as before. An open app also checks for a new version when its
window comes back to the front, at most every 30 minutes, and `sw.js` is always
checked against the website rather than a browser-kept copy
(`updateViaCache:'none'`).

**Why:** Dillon's installed desktop app loaded the old version however many
times he quit it. A waiting version only takes over when every window using the
app is closed, and quitting an installed app does not reliably count as that.
Reloading before anybody has done anything costs nothing, so there was no
reason to make people wait.

**Don't:** make updates silent at any other moment. The reason the bar exists
still holds: a reload in the middle of a spray record loses work.

### The crew's task list shows the assign note, not the plot list — 2026-09-22

**Decided:** on the Mine tab, everyone except Bill sees each job's title, then
the note left when it was assigned, then the machine (if one is named). The
plot list is not shown there. Bill's own rows still show plots above the note.

**Why:** Dillon asked for it. The plot list ran long and told a student little;
the note is what they need. Start still opens the job with its plots.

**Likely mistake:** "fixing" the missing plots on the students' list by putting
`areaWithDue()` back in `tbTaskRow()`. It is missing on purpose.

### Start opens an equipment checklist, and "in use" is read from the tasks — 2026-09-22

**Decided:** pressing Start shows one page first: the note from whoever
assigned the job, anything closed on the ground, and a tile for each piece of
equipment the job needs, grouped by category. The student taps the machine
they took in each group; Continue stays grey until every group is answered.
"Not taking one" is a tile of its own, so a group can be answered when every
machine in it is down or out. A job with nothing to show skips the page.

The pick is written onto the TASK (`eqUsed`, keyed by person), and the
Equipment screen works out "In use · Garrett · Rotary - Plots" from any open
task that names the machine (`eqHolder()`). Finishing or deleting the task
hands the machine back. Nothing on the machine record changes.

**Why:** Dillon wants to know which rotary mower went out with which student.
Undergraduates may not write machine records, and a machine marked "out" on
its own record stays out forever if the phone that took it dies. The task
already has to be right, so it is the one record.

A job's equipment is the job's `machines[]` on the task list, now edited from
the task form's "Equipment needed" row. Several machines in one category mean
"any one of these"; machines in different categories mean "all of these" —
the categories carry that, so nobody has to spell it out.

A machine's category is `cat` if somebody picked one on its edit screen,
otherwise a guess from its type, made when it is read and never written back.

**Likely mistakes:**
- Setting `status:'in_use'` / `holder` on the machine at Start. See above;
  and the database refuses it from an undergraduate anyway.
- Writing the guessed category onto every machine to "tidy up". That is one
  database write per machine from every phone, for a value nobody chose.
- Removing `'eqUsed'` from `isCompletion()` in `firestore.rules`. A phone
  offline at Continue sends the pick and the finish in one write, and without
  it the finish is refused too.

### Anyone on a job may save their progress on it — 2026-09-22

**Decided:** `firestore.rules` has a fifth way to change a task,
`isWorkUpdate()`: anybody on the job may change `donePlots`, `doneTrials`,
`mix` and their own entry in `eqUsed`, and nothing else in the same write.
`isCompletion()` also accepts those, plus `completedNote` and `_logged`.

**Why:** Dillon, 2026-09-22: "after I assign a task to someone they are not
able to click off the plots." The tap worked; the database refused to store
it, because an undergrad is not a job's creator and no rule allowed a tick.
The database handed its copy back and the plot went orange again a second
after going green. The finish was refused as well: `completeTask()` writes
`completedNote` and `_logged`, neither of which was on the completion list.
Both had been true since tasks moved into the database at the end of August.
Nothing caught it because no test put what the app REALLY writes in front of
the rules; `tools/test-task-work-rules.js` does now.

**Likely mistake:** adding a new field the app writes while someone works a
job (or while finishing one) without adding it to these two lists. It will
work for Bill, whose edits pass `isEdit()`, and silently fail for everybody
else. Run `node tools/test-task-work-rules.js` — it checks the real code's
writes against the lists.

### A job's place in the running order is its own `rank` field — 2026-09-22

**Decided:** Bill's ▲▼ arrows set `rank` on the two jobs they swap, and every
list that shows jobs in order — the Board tab, the crew's Mine tab, the home
cards and their Start button — sorts through `taskInOrder()` (app-03). A job
nobody has moved has no `rank` and sorts by when it was made, read from the
front of its id. The arrows only move a job among the ones on the day being
shown.

**Why:** Dillon: "when Bill changed the order of the tasks for a student, the
student's task board did not change." The order used to be nothing but the
position in each phone's own TASKS array. The arrows swapped two array slots,
no record changed, nothing reached the database, and every other phone kept
whatever order the database delivered — even Bill's own reset on reload. The
arrows also counted jobs on other days, so ▲ could swap with a hidden job and
seem to do nothing.

**Likely mistakes:**
- Showing somebody's jobs "in order" straight from `TASKS.filter(...)`. The
  array order means nothing and differs between phones; wrap it in
  `taskInOrder()`.
- Reordering by moving things around in `TASKS`. Change `rank`; that is the
  only thing that travels.
- Writing `rank` onto every job to "tidy up". One database write per job from
  every phone, for an order that already reads the same everywhere.

### A part-finished job is completed as far as it went; Bill hands out the rest — 2026-09-22

**Decided:** once a student has ticked at least one plot, the work map's button
offers "Submit N of M done". Confirming (with an optional reason) COMPLETES the
job, credited to them, marked `partial:true`, with the plots nobody got to in
`leftPlots`. Only the ticked plots go on the Field Log. Bill's board shows every
such job as one row at the very top, above the day and above everybody's name,
until he deals with it. Tapping the row opens "Assign the rest": he picks a day
and a person and gets a NEW job holding only `leftPlots`, badged "Rest of job",
linked back by `restOf`. The same sheet carries "Leave the rest undone" for
ground not worth chasing. Either stamps `restAssigned` on the old job, which
takes the row off the board.

**Why:** Dillon asked for students to be able to hand in a half-done job and for
Bill to give the remainder to someone else the same day or the next. Completing
the student's part rather than leaving the job open keeps their record true
(what they did, when, and why they stopped), and it is the only thing the
database lets a student do that closes their part — a student may not reassign
or create jobs. The leftover as a job of its own can go to anybody on any day
without rewriting the first one.

**Not offered** when a helper is still out on the same job (their part is "the
rest"; "Hand in my part" covers that), nor on alley paint or trial-dot jobs,
which are not plot lists.

**Likely mistakes:**
- Removing `partial` or `leftPlots` from `isCompletion()` in `firestore.rules`:
  every "Submit my part" would be refused. See "The third trap" in CLAUDE.md.
- Logging every plot of a partial job. `flAddFromTask()` logs `donePlots`
  minus `leftPlots` for a partial job, on purpose.
- Lowering the sheets' z-index. At 60 the Leaflet map drew over the top half of
  every bottom sheet on the work map, including "Mark task complete?". They sit
  at 1200.

**Amended 2026-09-23.** The leftover started life as its own section — a
heading reading "Left over — needs someone · N" over rows carrying an "Assign
the rest ›" pill and a small "Leave it" link. Dillon asked for the job to just
sit at the top of the board and open when tapped, like any other job. So the
heading is gone, the whole row is one tap (`data-rest` on the row itself), and
"Leave the rest undone" moved inside the sheet the tap opens. Two things
someone could get wrong putting this back: the row must NOT carry `data-task`,
which would open the read-only job screen and leave Bill no way to hand the
rest out; and "Leave the rest undone" has to exist somewhere, or a job nobody
is going to finish sits on the board until it is assigned to somebody who then
deletes it.

### The Task Board's categories and the Field Log's categories are the same 6, plus Maintenance — 2026-09-22

**Decided:** `CATEGORIES` (app-05) dropped from 9 to 7: Paint folded into
Miscellaneous, Aeration folded into Cultivation. `FL_CAT_TASKCAT` (app-02) maps
each of the Field Log's 6 categories to exactly one Task Board category —
Spray, Fertilize, Cultivation, Mow and Irrigation by name, Misc to
Miscellaneous. Maintenance stays a Task Board category but is the one name
`FL_CAT_TASKCAT` never mentions, on purpose: it gets its own log on the
Equipment page, never the Field Log. Every task template also carries its own
`logField` flag (default `true`, `false` for the four existing Maintenance
tasks), a per-task override on top of the category rule, set from a checkbox
on the "Add to the task list" form.

**Why:** the Field Log's manual entry form (below) was rebuilt to pick a real
task name instead of a fixed list of 16 operations, which meant its 6
categories needed to line up with the Task Board's. Rather than keep a
translation table for two diverging lists, the lists themselves were merged.
Maintenance was deliberately left out at the category level rather than relying
on `logField` alone, because Dillon said reel grinds, oil changes and the rest
belong on a separate equipment log, not mixed into field work at all.

**Likely mistakes:**
- Reading `t.category==='Paint'` or `'Aeration'` anywhere new. Both still exist
  in Firestore on templates saved before this change until somebody edits and
  re-saves them — `tplFixLegacy()` (app-05) folds them to the new names for
  *display*, called both when `TEMPLATES` is first built and every time a
  template arrives from the shared database (`tplsyncOnSnapshot`, app-02),
  but the value stored on the server only updates when that record is
  actually edited and saved again.
- Adding a 7th Field Log category to cover Maintenance "just in case". The
  Equipment page's own log is where that work belongs; see BACKEND-STEPS.md if
  that log doesn't exist yet.
- Assuming `logField:false` is what keeps Maintenance out of the Field Log. The
  category map does that; `logField` is the separate, finer override for the
  other 6 categories.

### Fixing a template's category on the way in must never look like a local edit — 2026-09-22

**Decided:** the first version of `tplFixLegacy()` ran *after* `TPLSYNC.seen`
was stamped with the arriving record's json, so a legacy Paint/Aeration
template (or one missing `logField`) always looked, to `tplPush()`, like it
had just been changed locally — and got pushed straight back to the server on
the next 2-second tick. Moving `tplFixLegacy(data)` to run *before*
`TPLSYNC.seen[data.id]=sdbJson(data)` fixed it: the correction is folded into
what the phone considers "the same as the server already said," so it never
looks like a local change and nothing gets sent.

**Why:** Dillon reported "Trial Dots" still showing under Paint and
"Tractor-Mounted" still showing under Aerate after the category merge shipped
— the display fix only ran once, at load, and the live sync was re-applying
the server's still-stale category on every snapshot, silently undoing it.
Fixing that exposed a second bug in the fix itself: `tools/test-sync-settles.js`
caught it immediately — a phone that only ever *reads* a legacy record must
never start *sending* because of it. That's the exact shape of mistake behind
the 4.4-million-read day.

**Likely mistakes:**
- "Fixing" data on the way in by mutating it *after* it's been compared
  against what the server last said, anywhere in this app, not just here.
  Normalize first, then stamp `seen` from the normalized copy — never the
  other way around.
- Treating this as self-healing the server's copy. It isn't, and deliberately
  isn't — see the entry above. Each phone corrects its own display, forever,
  cheaply; nothing pushes the fix to Firestore itself.
- Trusting a fix like this because it "looks right" in the browser without
  running `node tools/test-sync-settles.js`. The bug this entry describes
  produced no visible symptom at all until that test was run — the app looked
  completely correct while quietly queuing a write every two seconds.

### A Field Log entry now names a real task, a real person, and a real day — 2026-09-22

**Decided:** the "Add manual entry" form on the Field Log (`openFlNew()` /
`renderFlNew()`, app-02) now asks for Category → Task name (from the matching
Task Board templates, list-only, no typing) → Person → Date → Plots → Notes,
instead of a fixed 16-item operation list with the person and time locked to
"now". `person` (who gets credit) is editable and defaults to whoever is
signed in; `loggedBy` is always the actual signed-in person and is never
touched by this form — the two fields already existed and already held the
same value, they just weren't independent before. `date`/`ord` come from a
picker that walks back 30 days (weekends included, since fieldwork happens on
those too) rather than app-05's `asDateOptions()`, which only offers weekdays
going forward and is built for scheduling, not for saying when something
already happened. Whether the chemical fields (product, amount, rate) show up
is now decided by category — Spray or Fertilize, always — instead of a
per-operation flag, and the "target pest/weed" field is shown for all of Spray
but left optional, since Spray also covers liquid fertilizer. The equipment
field, when it shows at all, is now the chosen task's own machine list
(`tplMachineList()`, app-05) instead of a separate on/off flag, so it now
appears for any category with machines on file, not just Mow.

**Why:** Dillon asked for the form to look like the Task Board, so an entry
about work that wasn't done through a task still names a real task, a real
person and a real day — useful for logging something after the fact, or for
Bill logging on someone else's behalf.

**Likely mistakes:**
- Reintroducing `FL_OPS` or a fixed operation dropdown. It's gone; the task
  name list comes from `flTemplatesFor()`, which reads live templates.
- Reusing `asDateOptions()` for this field. It silently drops any date more
  than a day or two old off the list and skips weekends — see `flDateOptions()`
  in app-02.
- Treating `person` and `loggedBy` as the same field again. `person` is on
  `FL_EDITABLE` (and the matching `firestore.rules` list) so it can be
  corrected later; `loggedBy` deliberately is not, which is what keeps it a
  reliable audit trail.

### The Field Log's chemical entry uses the real spray mix calculator, and finishing a task actually takes stock off the shelf — 2026-09-22

**Decided:** the manual entry's Product/Amount/Rate boxes are gone. In their
place, a Spray or Fertilize entry gets the same calculator app-04 already
built for working an assigned boom-spray task — `mixCompute()`, `MIX_UNITS`,
`mixProductRowsHtml()`/`mixWireProducts()` (called with the field log's own
`'flmxp'` prefix and its own `fln-`/`mx-out`-wrapped markup, not
`mixSectionHtml()`'s own `td-body`/`tw-brief` markup verbatim, since some of
its ids like `mx-charge` aren't scoped to a container and two screens holding
one each would collide). `flMixTask()` builds a stand-in task object from the
form's own state — `{type, title, machine, plots, mix}` — good enough for
`sprayIsBoom()`/`mixCompute()` to read exactly as they would a real task's own
`t.mix`.

Which of `mixCompute()`'s two numbers is used — `onTarget` (rate × the ground
alone) or `total` (rate × the whole tank, boom-charge buffer included) — is
decided by `sprayIsBoom()`, the same function a real task's mix sheet already
answers to (`flMixItems()`, app-04). A boom job gets the full tank/nozzle/
charge picture and `total`; a backpack or granular job skips straight to
`onTarget` with no tank section at all, since there's no tank to overfill.
This is not a new rule — `mixCompute()` always computed both numbers — it is
simply the first place that reads `onTarget` for anything.

Finishing an assigned task with a filled-in mix sheet now also takes stock off
the shelf (`completeTask()`, app-04) — before this, only the Field Log's
manual entry ever touched inventory; a boom task's whole worked-out mix sheet
was discarded the moment the job closed. The decrement is gated on
`flAddFromTask()`'s own return value — the same `_logged` guard that already
stops a re-tap or a second phone's sync from double-logging the Field Log
entry — so it can never double-fire, and it only runs from `completeTask()`'s
two button-tap call sites, never from the task-arrival sync handler (which
only ever copies fields onto the task and calls `storeSaveLocal()`). It is
**not** wired into `twHandIn()`/`flAddPartFromTask()` (a helper handing in
their own share while the job stays open for others) — the tank was filled
once for the whole job, so decrementing on every helper's individual hand-in
would count it more than once.

**Why:** Dillon asked for the manual entry to have the same calculator the
task flow already uses, and for both paths to actually decrement inventory —
today only one of the two ever did.

**Likely mistakes:**
- Reading `mixCompute(t).items[i].need`/`.short` for anything other than a
  boom job. Both are always figured against `total` (the tank), which is
  wrong for a backpack or granular amount — use `flMixItems()`, which already
  picks the right one.
- Wiring the stock decrement into `twHandIn()`/`flAddPartFromTask()`, or into
  the task-arrival sync handler (`tsyncOnSnapshot`). Either one turns a single
  real completion into more than one stock movement.
- Letting an unmatched product or a plot with no area on file block a save or
  a completion. Neither does today — `mixInvDecrement()` silently skips
  anything it can't resolve, matching the Field Log's older rule: NOBODY IS
  EVER BLOCKED IN A FIELD.
- Letting the merged alley shape (`ALLEY_UNIT`) into a Spray/Fertilize plot
  list. Its area is 0 in `PLOT_INFO` today (a `'Alleys'`/`'ALLEYS'` key-case
  mismatch), and even fixed, how much of it is actually treated is a live
  number tied to an in-progress mowing job — not something a one-time area
  figure can capture. `flStripAlleys()` keeps it out of a chemical entry
  specifically; it's still fine to pick for Mow, Cultivation, Irrigation or
  Misc, where no amount is being calculated from it.

### The database cannot hold a list inside a list, and the map had been doing it for a month — 2026-09-22

**Decided:** map records are re-shaped on the way out. A plot's information
travels as `[{k:"Turfgrass", v:"Zoysia"}, …]` instead of `[["Turfgrass",
"Zoysia"], …]`, and a plot's shape travels as text instead of as GeoJSON.
Split, Merge back and the Delete button on the plot popup now save to
`PE_STORE` and share like every other map edit, and a new `clear` field lets a
correction be taken back.

**Why:** Firestore refuses a list placed directly inside another list. A plot's
information is a list of pairs, and a shape's coordinates are lists inside
lists inside lists. So from the day the map drawer was built (2026-08-25) until
today, almost every map record was thrown out by the Firebase code *before it
left the phone*. Reshaping a plot, correcting an area, adding a plot — none of
it ever reached another device or another account. A record carrying any
refused field is refused whole, so a cut-height change on a plot whose
turfgrass had also been edited went down with it, which is why it looked like
nothing shared at all.

The app already knew this. The alley paint drawer, written a month later, keeps
its GPS tracks as `"lat,lng;lat,lng;…"` with the comment *"the database cannot
hold a list of lists"* right above it. The map drawer never got the same
treatment and nothing joined the two up.

**Nothing on any screen said so.** The only sign was `· N refused` on the
Shared database screen. Dillon reported it as "map edits are not shared",
which is exactly what it looked like from a field.

**Why no test caught it.** Every drawer's test hands writes to a pretend
database that records whatever it is given. It accepted lists of lists happily;
the real one does not. That is the same shape of hole as the one CLAUDE.md
describes for the console — the checks pass straight over it. The pretend
database in `tools/test-sync-settles.js` and `tools/test-mapsync.js` now
refuses a list inside a list, which closes it for **every** drawer at once, not
just this one.

**Things that look wrong and are not:**

- **Plot information is pairs on the phone and objects on the wire.** The order
  of those pairs is meaning — `farm-geo.js` says so and the popup prints them
  in order — so it cannot become a plain `{label: value}` object. A list of
  objects keeps the order and the database accepts it.
- **A shape travels as text and `mapWireGeom()` re-writes text it is handed.**
  That is not a wasted round trip. Two phones holding the same shape can write
  it differently — `35.90` and `35.9` are the same corner — and compared as
  text they are not equal, so each phone would read the other's as a change and
  send its own back forever. Everything goes through the parsed form and comes
  out written the same way. `tools/test-mapsync.js` section 9 is that case.
- **`clear` and a field set to `null` mean opposite things and must stay
  separate words.** `null` means *the file has this and the farm has
  deliberately taken it off*. `clear` means *forget the farm's correction and
  go back to what the file says*. Merging a split plot back needs the second
  one; without it, dropping the split locally says nothing to the database and
  the split comes straight back within two seconds.
- **The withdrawal is kept on the phone (`PE_STORE.cleared`) and travels on the
  ordinary two-second heartbeat**, not as a one-off write. A part stays on that
  list only while there is genuinely nothing local for it, so the moment
  somebody corrects that part again the correction is what travels and the
  withdrawal drops off by itself. That is what makes the two unable to argue.
- **Splitting marks the parent removed but leaves its plot information alone.**
  Wiping it would send `plotinfo: null` — "the farm took this off" — and Merge
  back would hand you a plot that had forgotten the turfgrass somebody typed in
  last spring.
- **A split child inherits the parent's stated area rather than one worked out
  from the polygon.** `farm-geo.js` says in its own header that the CAFS shapes
  are a drawn grid, not a survey, and every spray rate reads the area typed in
  on the plot information form. A made-up number going quietly out to the whole
  farm is worse than an obviously-wrong inherited one, so the toast says to set
  the real areas.
- **Split offers 2 or 3 pieces and no more.** `CHILD_RE` only recognises the
  suffixes a, b and c; a fourth piece would be a plot the app could never merge
  back.

**Don't:** don't send a list inside a list from any drawer — the settle test
now fails the build for it. Don't fold `clear` into the `null` case. Don't
narrow `mapWireGeom()` into a plain `JSON.stringify`, which is the loop above.
The `mapplaces` rules did **not** change and did not need republishing: that
block checks the record's id and who wrote it, not its fields.
