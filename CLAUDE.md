# CLAUDE.md

Instructions for Claude working in this repo. Read this before touching
anything.

---

## Who you are talking to

Dillon runs the farm and built this app. He is **not a professional
programmer.** Write and speak accordingly:

- **Plain English, always.** Say what a thing *does*, not what it is called.
  "The app crashed while opening, so the time clock never loaded" — not "an
  uncaught TypeError in the boot path."
- **If a technical word is genuinely needed, define it once, in the sentence
  where you use it.** Don't send him to look something up.
- **Lead with what it means for the farm.** "Nobody could clock in" comes
  before "line 10462 threw."
- **Never assume he knows the tools.** Do not answer with "just check the
  console" or "run a diff" as if that were an instruction. Say exactly what to
  type and what he should expect to see.
- **Don't hide bad news in jargon.** If something is broken, say "this is
  broken and here is what it costs" in words anyone would understand.
- **Explain the why, briefly, every time.** He is the person who will have to
  live with these decisions, so he should understand them, not just approve
  them.

The same rule applies to comments you write in the code. This repo's comments
explain *why* in plain sentences. Match that.

---

## What this is

The UT Turf Farm app: one web page the farm crew opens on their phones out in
the fields. It is live at <https://turffarmutk.github.io/>.

**Pushing to `main` publishes it immediately.** There is no practice version
and no safety step in between. A bad push is a bad push onto twenty-three
people's phones, and they may be standing in a field when it happens.

From `docs/SUCCESSION.md`, the rule everything else follows from:

> **If a routine change to the farm requires editing the source file, that
> change stops happening the day I leave.**

Ask it of every new feature: *who changes this in 2030, and can they?* If a
farm manager would reasonably want to edit it — a person, a spray rate, a
piece of equipment — it belongs in the database with a screen for editing it,
not buried in the code. Genuinely structural things, like the map maths, can
stay in the code and get written down instead.

**Hiring passes that test as of 2026-08-31, and it did not before.** Bill, the
faculty or Dillon add somebody on the Roster screen; they appear on every
phone and can sign in, with no source edit, no push and no laptop. What still
does *not* pass: adding a new role name or a new lab, and the map maths. Those
are still code.

---

## Check that it works before pushing. This is not optional.

**"It should work" is not a result. "I watched it work" is.**

A change is not finished when the code looks right. It is finished when you
have seen the broken thing working, and seen that nothing else broke. Do all
five, in this order, every time.

**1. Rebuild the offline file.**

```bash
npm run sw
```

The app keeps a copy of itself on each phone so it works with no signal. That
copy only updates when this command has been run. Skip it and every phone that
already has the app keeps showing the OLD version — no error message, no
warning, nothing to see. The only symptom is Dillon saying "my change didn't
show up." Never edit `sw.js` by hand; this command writes it.

**2. Run the checks.**

```bash
npm test
```

42 sets of automated checks, about 2,800 in total, in a minute or so. They
run several at a time (`tools/run-tests.js`); `npm run test:serial` runs them
one after another instead, which is slower but easier to read when two of them
disagree.
They all have to pass. Two things to watch for:

- The words **`app script threw`** anywhere in the output mean the app crashed
  while opening. That is a failure even if checks after it say PASS. Stop and
  fix it.
- If a check dies with a message about something being `undefined`, that is
  almost always the same crash, not a broken test. Fix the crash first.

**3. Open the app and look at the console.**

```bash
python3 -m http.server 8891
```

Then open `http://localhost:8891/UT-TurfFarm-App.html` in the browser tool and
read the console — the browser's own list of errors. **It must be empty.**

This step is not optional, and here is why. If any line fails while the page is
opening, the browser gives up on **everything below that line in the same
file** — those parts of the app simply never come into existence. The page
still draws, sign-in still works, and it all looks completely normal. That is
what makes it dangerous.

Splitting the app into files on 2026-08-29 made that hole smaller — one file
instead of all of it — but it did not close it, and it will not tell you when
it happens. **Only opening the app does.** The split itself proves the point:
it introduced a crash that all 1,700 checks passed straight over, and reading
the console is what found it.

Two traps when you do this:

- **The browser caches the old file.** If you still see an error you have
  already fixed, you are looking at a stale copy. Use a fresh port number, or
  add `?fresh=1` to the end of the address, and check again before believing
  it.
- **The app's own offline copy is worse, and `?fresh=1` does not beat it.**
  Once the page has been opened on a port, the offline copy on that port
  hands over the app files it saved — and it can save an *old* file under the
  *new* version number, because it picks them up from the browser's cache
  when it installs. On 2026-09-18 that hid a finished change for half an hour
  of testing. **A port the browser has never opened is the only sure way.**
  Before trusting what you see, run `typeof someNewFunction` in the page: if
  it says `undefined`, you are not looking at your change.
- **The console keeps old messages** from before your fix. Confirm an error is
  really still happening rather than reading history.

**4. Use the thing you changed, at BOTH widths.** Click it. If it was a bug,
make the old problem happen again and confirm it is gone.

Then look at it narrow (a phone, under 820px) **and** wide (a laptop, 820px and
up). This is not tidiness. Those are two different shells — the narrow one has
a bottom bar, the wide one hides that bar and puts a rail down the left — and a
change can land in one and not the other. That is not hypothetical: More was
left off the rail, and because More is the only thing that links to Report a
bug, Farm settings and Admin, all three were unreachable on every laptop and
iPad from the day the rail shipped until 2026-08-30. Nothing looked wrong. The
rail just didn't have them.

The crew are on phones in the fields, so narrow still decides how a thing should
look. Wide decides whether it is there at all.

The sign-in screen is the exception, and it is a useful one: it exists *before*
the app has chosen a shell, so anything put there cannot go missing from
either. That is why "First time here" is a panel on that screen and not a
screen of its own.

**4b. If you touched a shared-database drawer, watch two phones for five
minutes.**

Open the app in two browser profiles signed in as different people. Make a
change on one and watch it arrive on the other. **Then leave both sitting and
watch the Shared database screen on each. Every `sent · received` count must go
flat.** A count still climbing on a phone nobody is touching is the bug.

A drawer sends a record whenever it differs from what the server last said, so
if applying an arriving record leaves *any* difference behind — a field you
declined to take, a person you declined to drop, or the same fields in a
different order — two phones write at each other until the allowance is gone.

**This is not hypothetical and the numbers here are the real ones.** On
2026-08-31 it happened, and it cost more than this file used to say. The free
plan allows twenty thousand **writes** a day and fifty thousand **reads** —
reads are the tighter limit, because every phone is told about every write. The
farm spent **4.4 million reads in one day, with one person using the app.** It
was not twice a second either: snapshot handlers were kicking off a send of all
seventeen drawers, so the loop ran at network speed. See `docs/DECISIONS.md`
for all four entries dated 2026-08-31.

The rule that prevents it: **apply an arriving record completely, or refuse it
completely and stop sending it too.** Never half of one.

**And the rule that now checks it for you:** `tools/test-sync-settles.js` walks
every drawer and requires each one to settle. It is part of `npm test`, so this
particular mistake can no longer reach a phone. Watching two phones is still
worth doing — but it is confirmation now, not the only defence.

**5. Say honestly what you did.** Report what you ran and what you saw. If you
skipped a step, say which and why. If something is still failing, say so. Do
not call a change done because the code is written.

Only then commit. **Never push unless Dillon asks you to.** After a push, wait
ten minutes before judging it — the website holds files for ten minutes, so a
change is not visible instantly.

**Two things now check this automatically**, so a broken push is hard rather
than easy:

- `.githooks/pre-push` **refuses the push** if `sw.js` is out of date or any
  check fails. It needs one command per computer, once:
  `git config core.hooksPath .githooks`
- `.github/workflows/checks.yml` runs everything on GitHub after each push and
  shows a red X on the commit. Nothing to install, nothing to skip.

Neither replaces step 3. **No automated check opens the app and looks at it** —
that is still yours to do.

---

## Before you "fix" something that looks wrong

**Search `docs/DECISIONS.md` first.**

This app contains an unusual number of things that look like mistakes and are
deliberate: the CAFS alleyway split, the alleys being one painted shape that
finishes at 80% rather than ten zones that finish at 100%, the SF4/SF9 plot
swap, the missing task priority field, saving by scanning instead of on every
change, sharing having no off switch. Every one of them is a trap for someone tidying up.

That file is the only place the reasoning survives. When you make a choice a
future person could mistake for a bug, add the entry **in the same change**,
not later. Three lines: what was decided, why, and what someone is likely to
get wrong.

---

## Things that break the whole app if you touch them

| | |
|---|---|
| `.nojekyll` | An empty file, and it is holding the app up. Delete it and the website stops serving the `vendor` folder — the map library, the fonts, everything. Then the offline copy refuses to install at all, while the page still loads and looks fine. **If the map ever goes blank after a push, check this first.** |
| `sw.js` | Written by `npm run sw`. Never edit it by hand. |
| `farm-geo.js` | The plot shapes. Must stay next to the app file. |
| `app-01-*.js` … `app-05-*.js` | Two thirds of the app. They must sit next to the app file, and they must load **in numeric order** — the numbers are the order. Renaming or reordering them breaks the app on opening. Adding a sixth is fine: `npm run sw` finds it and `tools/_app.js` tells the tests about it, so nothing needs a list updating by hand. |
| `RST_SEED` in `app-03-people.js` | **No longer how a person reaches a phone**, since 2026-08-31. It is the starting list for a phone that has never had the app, and nothing else. Adding somebody here looks like it worked on the laptop and reaches **nobody** — the farm's real list of people lives in the database now. **The Roster screen is the way, and it is the only way.** |
| The five weather day cards in the page | Those `.wxcard` divs are written **unclosed**, and the browser's repair of that is what puts every other screen at the depth the app expects. Tidying them into balanced markup moves 44 screens out of `#app` and the back arrow dies on all of them — silently, because the page still looks right. Fill them from code; never rewrite them. See `docs/DECISIONS.md`. |
| `storeScan()` / `storeTouch()` | The two-second heartbeat that offers **every** drawer to the shared database. `storeSaveLocal()` is the other half — it writes to the phone and touches no network. Calling `storeScan()` or `storeTouch()` from anywhere that runs when a record *arrives* closes a loop and spends the farm's whole day of database allowance in an afternoon, with nothing on any screen to say why. That is not a worry, it is a thing that happened on 2026-08-31. Arriving records call `storeSaveLocal()`. |
| The CSS, which stays inside the page | Color-blind mode works by reading the text of every `<style>` block and rewriting the colors. Move the CSS out to a `.css` file and color-blind mode stops working **with no error at all** — nothing to see, just wrong colors for the people who need it most. The same rewrite also runs over colors written *for* color-blind mode (`body.cb …` rules). So any color picked by hand for it must also be listed in `CB_MAP` (`app-01-shell.js`) as mapping to itself, or it gets shifted a second time. The Task Board's name highlights are the example. |
| `isWorkUpdate()` and the `isCompletion()` field list in `firestore.rules` | **What lets the crew save their work.** Without them, anybody who is not Bill or the job's creator can tap plots green and watch them turn orange again a second later, and can never finish a job — the database refuses the write and the phone takes the database's copy back. That was live from late August until 2026-09-22 and nobody could tell why. **Never remove either, never narrow the field lists, and never "tidy" them into `isEdit()`.** When the app starts writing a new field on a task while someone works or finishes it, add that field to the lists in the same change. See "The third trap" under The shared database. |
| `CATEGORIES` in `app-05-tasks-clock.js` | 7 values, not 9, since 2026-09-22: Paint folded into Miscellaneous, Aeration into Cultivation. `FL_CAT_TASKCAT` (`app-02`) maps the Field Log's own 6 categories onto these 1:1 — Maintenance is the one left out, on purpose, because that work gets its own log on the Equipment page. A template saved before this change can still be sitting in Firestore under the old name; `tplFixLegacy()` folds it to the new one everywhere a template enters `TEMPLATES` (initial load **and** `tplsyncOnSnapshot` in `app-02`) — miss either spot and Paint or Aeration silently comes back as its own heading on the Task List or Assign screen, which is exactly what happened the first time this shipped. See "The fifth trap" under The shared database and `docs/DECISIONS.md`. |
| `flMixItems()` in `app-04-spray-inventory.js` | Decides whether a chemical amount is `mixCompute()`'s `total` (the whole tank, boom-charge buffer included) or its `onTarget` (just the ground, nothing else) — `sprayIsBoom()` decides which. Reading `mixCompute(t).items[i].need`/`.short` directly anywhere gets the **tank** figure always, which overstates what a backpack or granular job actually needs. Both `flSave()` (`app-02`, the manual Field Log entry) and `completeTask()` (`app-04`, finishing an assigned task) go through this and then `mixInvDecrement()` — one call per product, never blocking a save or a completion if a product doesn't match inventory. |
| Bare class names in the CSS, like `.del` | The page has one stylesheet for the whole app, so a rule written for one screen reaches every element with that class. `.del` is pinned to a 30px square for a little round X button — and the plot popup's Delete button carries the same class, so "Delete" was squeezed into 30px and cut off for months. If a new rule uses a short, ordinary word as a class, scope it (`.plotpop .pp-btn`) or expect it to land somewhere you were not looking. Two other things to know here: `font: 600 12px inherit` is **not valid CSS** — `inherit` cannot be the family inside the `font` shorthand, so the browser throws the whole line away and the element silently draws at the page default; write it longhand. And measure rather than squint: `scrollWidth > clientWidth` on a button is how the clipping above was actually found. |
| Files at the top level | The website serves this folder directly, so these filenames *are* the web address. Nothing the live app needs can move into a subfolder. |
| Bottom sheets, and the four CSS rules that name them | `#donesheet`, `#partsheet`, `#restsheet` and `#asksheet` are listed **by id** in four rules in the page's stylesheet. Add a sheet without adding its id to all four and it gets no positioning and no display rule — so it never hides, sits at the top of the screen with no dark backdrop, and **nothing errors**. `#asksheet` did exactly that on 2026-09-24 and every check passed over it, because the markup and the behaviour were both right. `tools/test-notifications.js` section 18 now fails when a sheet is missing from a rule that names `#restsheet`. |
| `tcAutoClose()` in `app-05-tasks-clock.js` | Writes a clock-out onto somebody's **payroll record**. It uses the hours they were scheduled to finish, never the cut-off time, and when there is no honest end time it writes nothing at all and asks the student instead. Only a phone `tcCanEditPunches()` allows runs it, because `canPunchFor()` in `firestore.rules` is the same test. Making it fall back to a guess, or letting any phone run it, are both changes to what the farm pays people. See `docs/DECISIONS.md`, 2026-09-24. |
| The task fields the bell reads | `assignee`, `assignedBy`, `requestedBy`, `completedBy`, `partial`, `leftPlots`, `restAssigned` — plus `kind`, `origin`, `target` and `students`, which are what tell a labor request from an ordinary job and which way it was going. The notification feed (`ntfScan()`, `app-01-shell.js`) works out who to tell by watching these change. Rename one in the task code and the alerts stop — no error, no empty screen, just a bell that never lights up again. `tools/test-notifications.js` section 10 checks the app still writes them. **The feed is derived, not stored:** it is worked out on each phone from the task list, so there is no drawer, no rule and no row in `test-sync-settles.js` to add. Don't turn it into one without reading `docs/DECISIONS.md`, 2026-09-24. |
| `roster-emails.local.json` | The crew's email addresses. Deliberately kept out of the public repo. Never commit it. |

---

## Working inside the app

The app is about 24,800 lines spread over the page and five files beside it.
**Work out which file first** — that is most of finding your way around:

| File | Roughly | What is in it |
|---|---|---|
| `app-01-shell.js` | 2,500 | Per-person preferences, the phone/roomy shell, the notification feed (`ntfScan()` and the Notifications screen), home-screen widgets, theme and color-blind mode |
| `app-02-fieldlog-sync.js` | 4,000 | The Field Log **screen** — including its manual "Add entry" form, which since 2026-09-22 picks a category and a real task name (`FL_CAT_TASKCAT`) and, for a Spray/Fertilize entry, embeds app-04's mix calculator (`flMixTask()`/`flMixItems()`) rather than a hand-typed amount; the shared-database drawers, including the roster one; ids and timestamps |
| `app-03-people.js` | 1,700 | The Roster **screen**, labs, session, sign-in, profile, semesters, and who may change what. It no longer owns who is on the farm — the database does, and `RSTSYNC` in `app-02` is what carries it. |
| `app-04-spray-inventory.js` | 3,800 | The spray mix calculator (`mixCompute()`, `MIX_UNITS`) — used by both a task's own work screen and, since 2026-09-22, the Field Log's manual entry — undergrad task-work mode, inventory, equipment. `completeTask()` here now also takes stock off the shelf for a finished chemical job (`mixInvDecrement()`) — see the table below. |
| `app-05-tasks-clock.js` | 3,000 | Task templates and list, assign wizard, calendar, time clock (including `tcAutoClose()`, which closes a shift nobody clocked out of, and the sheet that asks the student when the app will not guess), weather, rainfall. `CATEGORIES` is 7 items, not 9 — see the table below before adding an eighth. |
| `UT-TurfFarm-App.html` | 10,500 | Every screen's markup, all the CSS, and three remaining blocks of code: the map, trials, sign-in and boot |

Within a file, navigate by the `/* ===== SECTION ===== */` headings and by
function name — **not** by line number, which changes the moment either of you
edits the file.

**The app has two shells, and a screen can go missing from one of them.**
Under 820px wide it is the phone: a bottom bar with Home, three chosen pages and
More. At 820px and up — iPad, laptop, monitor — that bottom bar is hidden and a
rail down the left side takes over. Same markup, same code, different furniture.

The trap is that a screen reached from only one of those two is **invisible in
the other, with nothing on screen to say so**. It does not error, it does not
look broken, it is simply not there. So before you add a screen, or move where
one is reached from, ask: *what links to this?* — and check that link exists at
both widths. `tools/test-responsive.js` section 6b does this for everything
behind More; the rest is yours to check by opening the app twice.

**Most pages are covered for the crew, on purpose.** Since 2026-09-18, anyone
who is not the Farm Manager or the App Manager sees every page except Home,
Tasks and the Farm Map faded, under a "Coming Soon" card (`CS_LOCKED` and
`csApply()` in `app-01-shell.js`). If you sign in as a crew member to test
Inventory, Equipment, Time Clock and the rest, you will hit that cover. It is
not a bug. Test those pages signed in as Bill (`p07`) or Dillon (`p01`), and
check the cover separately as a crew member. Take a page off `CS_LOCKED` only
when Dillon says it is ready.

- Make small, targeted edits. Most things that break here break because
  something was rewritten wholesale rather than adjusted.
- **Watch the order things are written in.** A line that runs while the app is
  opening and uses something defined further down gets nothing, and the app
  crashes on opening. This is exactly what took the app down on 2026-08-27.
  Anything that draws a screen belongs at the **end** of its file.
  `tools/test-boot.js` checks for this.
- **Across files the rule is stricter, and it is the one new trap.** Inside one
  file a function can be written at the bottom and called from the top — the
  browser reads the whole file before running it. **Across files it cannot.**
  While `app-01` is running, `app-02` has not been read yet, so calling
  something that lives in `app-02` throws and kills the rest of `app-01`.
  `tools/test-load-order.js` checks for this, because `test-boot.js`
  structurally cannot — it glues the files together to run them, and the glue
  hides exactly this mistake. It caught a real one the day the files were
  split.
- Write in the style already there: same formatting, and comments that explain
  *why* at the same density.
- `archive/` and `_to_delete/` are old scratch. Never read them to find out
  how something works, and never edit them.

---

## The shared database

The farm's records live in Firebase, on the free plan with no card on the
account — a deliberate choice, explained in `docs/BACKEND-STEPS.md`. Phones
keep working with no signal and catch up later.

Records are moved over one group at a time: tasks, calendar, equipment, field
log, inventory, map, — since 2026-08-31 — **the roster**, and — since
2026-09-18 — **alley paint** (what has been mown on the alleys; see
`docs/DECISIONS.md`).

**The map's records do not travel in the shape the app holds them in, and that
is load-bearing.** A plot's information goes as `[{k,v}, …]` rather than as
pairs, and a plot's shape goes as *text*, always written the same way so two
phones holding one shape cannot disagree about it. `mapWireEncode()` /
`mapWireDecode()` do it and both must stay safe to run twice. There is also a
`clear` field, which is **not** the same as a field set to `null`: `null` means
the farm deliberately took something off, `clear` means a correction has been
withdrawn and the place goes back to what `farm-geo.js` says. Merging a split
plot back together is what needs it — see the fourth trap below and
`docs/DECISIONS.md`, 2026-09-22.

**The roster is not just another drawer.** Every rule in `firestore.rules`
goes through `rec()`, which reads it, so a mistake there does not break one
screen: the database refuses *the whole farm*. It is also the only drawer that
starts before anybody is signed in to the app, and there is a long comment
over `RSTSYNC` in `app-02-fieldlog-sync.js` explaining the deadlock that
forces that. Read it before changing anything about how it starts.

Each group is **four things that change together**:

1. the syncing code in the app, copying the pattern the existing ones use,
2. the matching permission rules in `firestore.rules`,
3. a test in `tools/` that proves it,
4. **a row in the table at the top of `tools/test-sync-settles.js`**, which is
   what proves the drawer can ever stop talking.

Never do one without the other three. **And none of it is live until Dillon
publishes the rules by hand** (`docs/PUBLISH-THE-RULES.md`) — pushing the app
does not change what the database accepts. Until then the database refuses
the new drawer, so the rules go up *before* the push, and you tell him so. Number 4 is the newest and it is there
because of the worst day this app has had — see below.

**THE TWO TRAPS THAT SPENT 4.4 MILLION READS IN AN AFTERNOON.** Both look like
nothing. Both are in `docs/DECISIONS.md` under 2026-08-31.

- **Compare records with their fields sorted — use `sdbJson()`, never
  `JSON.stringify`.** The database hands a record back with its fields in
  alphabetical order, which is almost never the order the app made them in. A
  record typed in on a phone therefore comes back looking *different from
  itself*. The drawer sends it again. And again. Nothing on screen changes;
  only the bill does.
- **A snapshot handler must never call `storeTouch()`. Call
  `storeSaveLocal()`.** `storeTouch()` offers all seventeen drawers to the
  database on the spot, and a record arriving is the thing a send causes — so
  it closes a circle. It is the difference between a bad drawer costing 43,000
  reads a day and costing four million. Saving to the phone is what a snapshot
  handler wants; sending is the two-second heartbeat's job, two seconds away.

**THE THIRD TRAP: A FIELD THE CREW WRITES THAT THE RULES DO NOT ALLOW.** This
one costs nothing on the bill and everything on the farm. On 2026-09-22 Dillon
reported that nobody he assigned a job to could check its plots off. The tap
worked. The database refused to store it, because ticked plots live on the task
(`donePlots`) and the rules only let an undergrad claim or complete a task. The
database sent its copy back, the phone took it, and the plot went orange again.
Finishing was refused too, over two fields (`completedNote`, `_logged`) that
`completeTask()` writes on every finish. It worked for Bill the whole time —
his edits pass `isEdit()` — which is exactly why it went unnoticed for weeks.

The permission that fixes it is **`isWorkUpdate()`** in the tasks section of
`firestore.rules`, together with the field list inside **`isCompletion()`**:

- `isWorkUpdate()` — anybody on the job may change `donePlots`, `doneTrials`,
  `mix` and their own entry in `eqUsed`, and nothing else in the same write.
- `isCompletion()` — also accepts `completedNote`, `_logged` and those same
  progress fields, because the last tick and Finish go up in **one** write
  (the phone sends every two seconds, not on every tap). And `partial` /
  `leftPlots`, which is a student submitting a part-finished job for Bill to
  hand out the rest (PART-FINISHED JOBS in `app-04`).

The rules for anyone touching these:

- **Never remove them, never narrow the lists, never fold them into
  `isEdit()`.** Testing as Bill or Dillon will look fine; it is only broken
  for the crew. If a change seems to call for narrowing them, stop and ask
  Dillon first.
- **A new field the app writes on a task while somebody works or finishes a
  job goes into these lists in the same change** — and into `WORK_FIELDS` /
  `COMPLETION_FIELDS` in `tools/rules-model.js`, which must match the rules
  file word for word.
- **`tools/test-task-work-rules.js` is the guard.** It runs the app's real code
  as a student — opening a job, ticking plots, finishing with and without a
  note, filling in a spray mix — and fails if the rules would refuse any of
  it, or if the mirror and the rules file disagree. It is part of `npm test`.
  If it fails, the fix is the rules, not the test.
- **Test the crew's path as the crew.** Signed in as Bill, every task write is
  allowed, so a refusal like this cannot show up there at all.

**THE FOURTH TRAP: THE PRETEND DATABASE IN THE TESTS ACCEPTS WHAT THE REAL ONE
REFUSES.** Firestore cannot hold a list placed directly inside another list.
The map drawer sent a plot's information as a list of pairs and a plot's shape
as GeoJSON, whose coordinates are lists inside lists inside lists — so from
2026-08-25 until 2026-09-22 **every map edit was thrown out before it left the
phone** and nothing reached another device. The alley paint drawer already knew
this and keeps its track as text; nothing joined the two up. The only sign was
`· N refused` on the Shared database screen.

Every drawer's test hands writes to a pretend database that recorded whatever
it was given, so 2,400 checks passed over it for a month. The pretend database
in `tools/test-sync-settles.js` and `tools/test-mapsync.js` now **refuses a
list inside a list**, which closes this for every drawer at once. If a new
drawer needs to send something shaped like that, flatten it the way the paint
and map drawers do — do not loosen the check. See `docs/DECISIONS.md`,
2026-09-22.

**THE FIFTH TRAP: FIXING AN ARRIVING RECORD IS ITSELF A WAY TO NEVER STOP
SENDING.** When Paint and Aeration were folded into Miscellaneous and
Cultivation, the first version of the fix (`tplFixLegacy()`, `app-05`) ran
*after* `tplsyncOnSnapshot()` (`app-02`) had already stamped `TPLSYNC.seen`
with the arriving, still-stale record. That made the correction itself look
like a local edit — the phone now disagreed with "what the server last said"
on every single tick, so it tried to push the fix back up forever.
`tools/test-sync-settles.js` caught it before it shipped a second time.

The fix was to normalize the record **before** stamping `seen`, so the
correction is folded into what the phone considers "the same as the server
already said" — it settles quietly, on that one phone, and never sends
anything. This is *not* the same as self-healing the stale value in
Firestore: nothing here fixes the server's copy, which stays wrong until
someone actually edits and re-saves that record. That's deliberate — see
`docs/DECISIONS.md`, 2026-09-22.

**The rule for any future "fix legacy data on the way in": normalize a
snapshot's data before it's compared against what the drawer last sent, never
after.** If you find yourself mutating `have` or `data` inside a
`*syncOnSnapshot()` handler for any reason other than applying exactly what
arrived, check whether `seen` gets stamped from the fixed-up copy or the raw
one — the raw one is the mistake, and it produces no visible symptom in the
app itself, only a climbing `sent` count nobody's looking at.

There is also a brake, `sdbMaySend()`, in front of every send: a record offered
more than twelve times in a minute stops going up and the Shared database
screen says so. **It is a backstop, not permission to skip the two rules above**
— by the time it fires something is already wrong. The permission checks written in the app
are the real decision, and they get **copied across** into `firestore.rules`
— never invent a rule that only exists in the rules file. A person's role
always comes from the roster, never from `currentRole`, which is only about
which screen is showing.

The one number worth watching on the free plan is how much the app *reads*.
Fetch what changed, never the whole farm every time someone opens the app.
A drawer whose records pile up forever — one per finished job, say — should
listen only to the ones still in use, the way alley paint listens only to
`open` records. Otherwise every phone reads the farm's whole history every
time the app opens.

---

## Ask, don't guess

Questions about how the farm actually works are Dillon's to answer, not yours
to assume: who may edit whose records, what happens when two people log the
same job, whether a correction needs the manager's approval.
`docs/BACKEND-STEPS.md` lists the open ones. These matter more than they used
to, because they are becoming rules the database enforces on everybody.

---

## Commit messages

Written for a stranger reading them in 2031: what changed and **why**, not
"update". Reasoning that does not fit belongs in `docs/DECISIONS.md`.
