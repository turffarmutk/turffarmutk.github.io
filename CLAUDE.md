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

33 sets of automated checks, about 1,900 in total, in roughly a minute. They
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
deliberate: the CAFS alleyway split, the SF4/SF9 plot swap, the missing task
priority field, saving by scanning instead of on every change, sharing having
no off switch. Every one of them is a trap for someone tidying up.

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
| The CSS, which stays inside the page | Colour-blind mode works by reading the text of every `<style>` block and rewriting the colours. Move the CSS out to a `.css` file and colour-blind mode stops working **with no error at all** — nothing to see, just wrong colours for the people who need it most. |
| Files at the top level | The website serves this folder directly, so these filenames *are* the web address. Nothing the live app needs can move into a subfolder. |
| `roster-emails.local.json` | The crew's email addresses. Deliberately kept out of the public repo. Never commit it. |

---

## Working inside the app

The app is about 22,000 lines spread over the page and five files beside it.
**Work out which file first** — that is most of finding your way around:

| File | Roughly | What is in it |
|---|---|---|
| `app-01-shell.js` | 1,900 | Per-person preferences, the phone/roomy shell, notifications, home-screen widgets, theme and colour-blind mode |
| `app-02-fieldlog-sync.js` | 3,600 | The field log and its corrections; the shared-database drawers, including the roster one; ids and timestamps |
| `app-03-people.js` | 1,600 | The Roster **screen**, labs, session, sign-in, profile, semesters, and who may change what. It no longer owns who is on the farm — the database does, and `RSTSYNC` in `app-02` is what carries it. |
| `app-04-spray-inventory.js` | 3,200 | Spray mix calculator, undergrad task-work mode, inventory, equipment |
| `app-05-tasks-clock.js` | 2,700 | Task templates and list, assign wizard, calendar, time clock, weather, rainfall |
| `UT-TurfFarm-App.html` | 9,400 | Every screen's markup, all the CSS, and three remaining blocks of code: the map, trials, sign-in and boot |

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
log, inventory, map, and — since 2026-08-31 — **the roster**.

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

Never do one without the other three. Number 4 is the newest and it is there
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
