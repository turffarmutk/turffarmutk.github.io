# The yearly count — plan, version 2

**What you asked for:** a button on the Inventory screen that makes it easy to
walk the shelf once a year, product by product, and correct what the app thinks
is there — because somebody forgot to log a spray, or a delivery went on the
shelf without being booked in.

Version 2 folds in your answers of 1 October. Four of the five landed exactly
where the code already is. The fifth — **anyone may do this** *and* **they may
record where the product is stored** — cannot both be true today, and sorting
that out is the one real decision left. It is section 4.

---

## 1. Your five answers, and what each one costs

| What you asked for | Where it stands |
|---|---|
| Break it up by type — herbicide, fungicide, insecticide | **Free.** The Inventory page already groups by those 13 types. The count uses the same ones, so it reads the same. |
| Reconciling changes the actual amount on the Inventory page | **Already true, and it was always going to be.** See section 2 — worth reading, because the way it does this is the reason the farm can trust it. |
| Anyone may do this job | **Free for the counting.** Anyone may already record stock in and out — your call, 25 August — and a count is the same kind of record. Not free for the storage location. Section 4. |
| Log whether the amount matched | **Small change, in section 3.** |
| Everyone's phone shows which products are already done | **Free, and it also fixes a bug I had not spotted.** Section 5. |
| Also log where the product is stored | **This is the one with a cost.** Section 4. |

---

## 2. "Change the actual amount on the inventory page" — yes, and here is how

This is the most important thing in the plan to understand, so it is in plain
words.

When somebody counts 4 jugs of Daconil and the app thought there were 5.5, the
Inventory page will say **4 jugs** from that moment on. On their phone
immediately, and on everyone else's within about two seconds. Every screen that
shows a stock figure — the list, the product page, the low-stock widget on the
home screen, the spray mix calculator — asks the same one question for that
number, so they all change together. There is no screen that can be left behind.

**What it does *not* do is overwrite anything.** It records "found 1.5 jugs fewer
than the record said" and the app adds that to everything it already knew. The
number you see is the answer; the record of how it got there is kept underneath.

That is not a technicality, and it is worth one more paragraph because it is the
difference between a count you can act on and a count you cannot. If the app
simply overwrote the figure, then next March, when somebody says "we've had three
jugs of Daconil disappear", there would be nothing to look at. Kept this way, the
product's own screen shows the whole story: April said 13.75 gallons, four sprays
took 9 gallons, a delivery put 5 back, and the October count found 1.5 jugs
missing. **You can see where the gap came from, and that is the actual point of
counting.** Overwriting would give you a correct number today and nothing to
reason with.

The one figure never touched is the April opening count out of the spreadsheet.
It is not what any screen shows — it is just the first line of the story, and it
has to stay put for the arithmetic to add up.

---

## 3. Logging that the amount matched

Right now the app refuses to record a movement of zero, reasonably, since nothing
moved. You want "I counted it and it was right" kept, so: **a count may record
zero.** It shows on the product's history as *"Counted · no change"* rather than
*"Recount · +0"*.

Two things come free with it. Every product gains a **last counted** date, which
you will probably look at more than the count itself. And it is what makes the
shared progress in section 5 work, because without it a product that matched is
indistinguishable from a product nobody reached.

The honest cost: about 191 extra lines a year in the movement history, and the
product screen only shows the most recent 12, so for a while after a count those
pages show mostly counts. Liveable.

---

## 4. Where the product is stored — the one thing that needs your decision

**What you asked for is right, and I want to build it.** Standing in front of the
jug is the only moment anybody will ever know where the jug actually is, and the
data needs it: of 191 products, **31 have no storage information at all** and
**48 say only "Cage" with no cage number**. A year of counting would fix that
permanently.

**The problem is that it is a different kind of act from counting, and the
database knows the difference.**

- Recording a count is recording *something that happened*. Anyone may do that.
- Recording where a product lives is changing *what the product is* — the same
  kind of edit as its name or its container size. Today **undergraduates are not
  allowed to do that**, in the app and in the database both.

So if an undergraduate counts a cage and types in a storage location, the app
would accept the tap, the database would refuse the write, and **the location
would quietly revert a second later with nothing on screen to say why.** That is
not a guess. That exact failure is what stopped the crew ticking plots off their
jobs from late August to 22 September, and nobody could work out why for three
weeks, because it worked perfectly whenever Bill tested it.

**I will not build the version that does that.** Two honest ways forward:

**Option A — let anyone set the storage location, and nothing else.**
I add one narrow permission to the database rules: anybody may change a
product's storage location, on its own, and no other field in the same write.
The app already has this exact shape in one place — it is what lets the crew
tick plots off a job without being able to edit the job — so it is a pattern the
farm has used and tested rather than something new.

- **You get:** exactly what you asked for. Anyone counting can fix a location.
- **The cost:** this is a **rules change**, which means it is the one part of
  this that **you have to publish by hand**, and it has to go up **before** I
  push the app. I would walk you through it; it is a copy, a paste and a click,
  and `docs/PUBLISH-THE-RULES.md` is the page. Until it is published, the
  database refuses the location and the app would be the broken thing described
  above — which is why the order matters and why I will tell you rather than
  assume.

**Option B — anyone counts, but only Farm Manager, Technician and Faculty get
the location box.** No rules change, nothing to publish, works the moment I
push. An undergraduate counting a cage simply does not see that box.

**My recommendation is A.** The location is the kind of thing only the person
holding the jug knows, so putting it behind a role puts it behind the wrong
people. The rules change is small and well-precedented. But it is your decision,
because it is you who has to publish it.

**How the box itself works, either way.** Not a free-typing box — 23 phones typing
"Cage 2", "cage2" and "C2" would give you three storage places that are one
place. It is a list of the places already in use on the farm, read off the
products and off the April sheet (Cage 1, Cage 2, Cage 3, Barn, Chem Room,
Fertilizers), plus **"somewhere else"**, which lets you type a new one. Type it
once and from then on it is in everyone's list. **No new storage place ever needs
a code change** — which is the rule from `docs/SUCCESSION.md` that everything
here has to answer to.

**And a bug this fixes on the way past.** Every product's detail screen has a
"Storage" row, and for all 191 products it currently reads **"undefined"** — the
April storage information sits on the container records, and that row reads a
field on the product that was never filled in. Nobody has reported it, so I
assume nobody has looked hard at that row. One-line fix, same information, same
change.

---

## 5. Everyone's phone showing what is already done

Each count run gets an id, stamped on every line it writes, so progress belongs
to the run and not to a phone. Your phone and Bill's phone both say *112 of 191
counted* because both are reading the same movements. It survives the app
closing, a flat battery, and swapping phones mid-count. It needs no new
collection, because it is a new field on a record that already travels.

Two honest details:

- **Other phones learn about a run when the first product is answered**, not at
  the instant somebody taps Begin. In practice that is a couple of seconds. The
  alternative is a whole new kind of record in the database to announce a run
  that is about to start, which is not worth it.
- **A phone that has been in a cage with no signal** catches up when it comes
  back out, and the counting it did while offline is not lost — it is recorded
  on that phone and sent when there is signal.

**This also closes a hole I had not spotted until you asked for it.** If two
people count the same category at once, and both find 4 jugs where the record
says 5.5, you could end up with the shortfall booked **twice** — ending at 2.5
jugs, which is wrong and which nothing would flag. Because a product already
answered in this run is shown as **done** and is not offered again, that cannot
happen. Your requirement and the safety fix turn out to be the same feature,
which is the nicest kind of answer.

---

## 6. What it looks like to use

**Getting in.** A card at the top of the Inventory screen, above the search box:

> **Yearly count** — never done · 191 products
>
> or, once started: **Yearly count** — 112 of 191 done · started 3 Oct by Dillon

A card rather than a third button in the bottom bar, because Restock and Log
usage get used every week and a once-a-year job should not hold a thumb-sized
piece of that forever.

**Choosing what to count.** The 13 types, with how many are left in each — and
only the ones that have anything in them, so you are not offered Seed when there
is no seed:

> Herbicides · 58 · **12 left**
> Fungicides · 49 · **done ✓**
> Fertilizer · Granular · 27 · 27 left
> …

This is the screen your "break it into type" answer buys. Nobody counts 191
products in an afternoon; somebody can count the fungicide cage in one.

**Counting.** One product per screen, big, thumb-first:

> ### Daconil Action
> Fungicide · a jug holds 2.5 gal
>
> **The app says: 5.5 jugs** (13.75 gal)
>
> [ **That's right ✓** ]   [ **It's different** ]   [ Skip ]
>
> Stored in: **Cage 2** ▾
>
> *47 of 191*

- **That's right** is one tap and moves on. Most of the shelf will be right, and
  this tap has to be fast or nobody finishes.
- **It's different** opens a counter: − and ＋ for whole containers, plus one-tap
  **¼ · ½ · ¾** for a part-used jug, because that is how the April sheet already
  describes them ("1 Full 1 Half"). Or switch to measuring — gallons, pounds —
  for anything you would rather weigh.
- Under it, in plain words, what saving will do: *"That is 1.5 jugs fewer than
  the app thought. Saving changes the Inventory page to 4 jugs."*
- **Skip** is for "can't find it" or "not in this cage". It stays on the list.

**Saving happens one product at a time, as you tap.** Not at the end. If the
phone dies or you get pulled away for three days, nothing is half-done.

**Finishing.** What you counted, what matched, what changed and by how much, and
anything skipped. Every line is also on the product's own page, so it is still
readable next year.

---

## 7. What this deliberately does not do

- **It never rewrites the April opening figures.** Section 2.
- **It never edits or deletes a movement.** Miscount and save? Count it again —
  the second count corrects the first and both stay readable.
- **There is no "submit the count" step.** Nothing waits on a phone, so there is
  nothing to lose.
- **It does not block a count that goes below zero**, same as Log usage. It says
  so in red and records it anyway.

---

## 8. What I will change

| File | What goes in |
|---|---|
| `app-04-spray-inventory.js` | The count run — which type, where you are up to, which products this run has answered. The one-product screen, the choose-a-type screen, the finish screen. The storage-location box and the list of places it offers. The small change that lets a count record zero, and the history line that says "Counted · no change". |
| `UT-TurfFarm-App.html` | Three new screens, the entry card on the Inventory page, and their CSS. |
| `app-01-shell.js` | The three screens listed so they belong to the Inventory tab and the back arrow works. |
| `firestore.rules` | **Option A only.** One narrow permission: anyone may change a product's storage location, on its own, nothing else in the same write. **You publish this by hand, before I push.** |
| `tools/rules-model.js` | The mirror of that permission, which the checks require to match the rules word for word. |
| `tools/test-inventory.js` | A count that matched records zero and nothing else; a count that differs changes the figure on the Inventory page by exactly the difference; progress is read off the movements and not off anything held on a phone; a product already answered in this run is not offered twice; April's figure is still readable afterwards; **and, for Option A, that an undergraduate may set a storage location and may not touch anything else on the product** — the check that would have caught September's three-week bug. |
| `tools/test-sync-settles.js` | Its sample movement becomes a real count movement carrying the run id, so the new shape is proven to settle rather than assumed to. |
| `docs/DECISIONS.md` | Why a count may be zero; why it saves as you go; why there is no new collection; and, for Option A, why one narrow permission was opened rather than letting undergraduates edit products. |

**What it costs the free plan:** a full count writes up to 191 lines, and every
phone is told about each one — about 4,400 of the 50,000 daily reads, once a
year, spread over days. Not a concern.

---

## 9. Before I push

The five steps, and I will tell you what I saw rather than that it should work:
rebuild the offline copy (`npm run sw`), run all 44 checks, open the app and read
the console, use it at phone width and laptop width, and watch two phones to
confirm the counts go flat. Then I report. **I do not push until you ask** — and
on Option A, the rules go up before the push, not after.

---

## 10. What is still open

1. **Option A or Option B in section 4** — the only thing blocking me starting.
2. **Inventory is still behind the "Coming Soon" cover for the crew.** Anyone may
   count, but the crew cannot reach the Inventory page at all until you take that
   cover off. Is that now or later? It is one line either way.
3. **Anything else worth capturing while somebody is in front of the product?**
   The year on the jug is the one I would suggest — the April sheet has it for
   some products and not others, and an out-of-date chemical is worth knowing
   about. Cheap now, expensive to bolt on later.
