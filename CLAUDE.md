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

29 sets of automated checks, about 1,700 in total, in roughly a minute. They
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

This step is not optional, and here is why. The app is one enormous block of
code. If any line in it fails while the page is opening, the browser gives up
on **everything below that line** — those parts of the app simply never come
into existence. The page still draws, sign-in still works, and it all looks
completely normal. That is what makes it dangerous.

Two traps when you do this:

- **The browser caches the old file.** If you still see an error you have
  already fixed, you are looking at a stale copy. Use a fresh port number, or
  add `?fresh=1` to the end of the address, and check again before believing
  it.
- **The console keeps old messages** from before your fix. Confirm an error is
  really still happening rather than reading history.

**4. Use the thing you changed.** Click it. If it was a bug, make the old
problem happen again and confirm it is gone. If it is something people touch
in the field, look at it at phone width — that is the only screen that
matters here.

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
| Files at the top level | The website serves this folder directly, so these filenames *are* the web address. Nothing the live app needs can move into a subfolder. |
| `roster-emails.local.json` | The crew's email addresses. Deliberately kept out of the public repo. Never commit it. |

---

## Working inside the app file

`UT-TurfFarm-App.html` is about 19,500 lines. Find your way around by the
`/* ===== SECTION ===== */` headings and by function name — **not** by line
number, which changes the moment either of you edits the file.

- Make small, targeted edits. Most things that break here break because
  something was rewritten wholesale rather than adjusted.
- **Watch the order things are written in.** It is one long block, so a line
  near the top that uses something defined further down gets nothing, and the
  app crashes on opening. This is exactly what took the app down on
  2026-08-27. Anything that draws a screen belongs at the **end** of its
  block. `tools/test-boot.js` now checks for this.
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
log, inventory, map. Each group is **three things that change together**:

1. the syncing code in the app, copying the pattern the existing ones use,
2. the matching permission rules in `firestore.rules`,
3. a test in `tools/` that proves it.

Never do one without the other two. The permission checks written in the app
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
