# The yearly count — plan, for approval

**What you asked for:** a button on the Inventory screen that makes it easy to
walk the shelf once a year, product by product, and correct what the app thinks
is there — because somebody forgot to log a spray, or a delivery went on the
shelf without being booked in.

Nothing below is built yet. This is the plan, and the questions at the bottom
are yours to answer before I start.

---

## 1. The good news: the hard part already exists

The shelf is not a number the app overwrites. It is a **list of movements** that
every phone adds up — "50 lb in", "12 fl oz out" — and a **recount is already
one of the four kinds of movement** the app knows how to write (`why:'count'`).
It has been there since 25 August. The Edit-product form quietly uses it today:
if you change "On hand" there, the app does not rewrite anything, it books the
difference as a correction.

That matters for three reasons, and they are the reasons this feature is small
rather than large:

1. **Nothing new goes in the database.** A recount is a movement, and movements
   already travel between phones. No new collection.
2. **Nothing has to be published by hand.** The permission rules already say who
   may write a movement, so there is no `firestore.rules` change and no step
   where you have to go and publish anything. Pushing the app ships it.
3. **The April counts stay readable.** The opening figures out of the April
   spreadsheet are never touched. "What the shelf said in April" and "what we
   found when we counted" sit next to each other forever, which is what you want
   the first time two people disagree about a jug.

So the work is almost entirely the **screen** — making 191 products quick to get
through on a phone while standing in a cage.

---

## 2. What it looks like to use

**Getting in.** A card at the top of the Inventory screen, above the search box:

> **Yearly count** — never done · 191 products
>
> or, once started: **Yearly count** — 112 of 191 counted · started 3 Oct

It is a card and not a third button in the bottom bar on purpose: the bottom bar
has Restock and Log usage in it, those get used every week, and a once-a-year job
should not take a thumb-sized piece of that forever.

**Starting.** One short screen: count the whole shelf, or just one category
(Fungicides, Herbicides…), or just one storage place. Then **Begin counting**.
Picking a category is what makes this survivable — 49 fungicides in an afternoon
is a real job, 191 products in one sitting is not.

**Counting.** One product per screen, big, thumb-first:

> ### Daconil Action
> Fungicide · Cage 2 · a jug holds 2.5 gal
>
> **The app says: 5.5 jugs** (13.75 gal)
>
> [ **That's right ✓** ]   [ **It's different** ]   [ Skip ]
>
> *47 of 191*

- **That's right** is one tap and moves on. Most of the shelf will be right, and
  this is the tap that has to be fast or nobody finishes.
- **It's different** opens a counter underneath: − and ＋ for whole containers,
  plus one-tap **¼ · ½ · ¾** for a part-used jug, because that is how the April
  sheet already describes them ("1 Full 1 Half"). Or switch to measuring —
  gallons, pounds — for anything you would rather weigh than count.
- Under it, in plain words, what saving will do:
  *"That is 1.5 jugs more than the app thought. Saving records a correction of
  +3.75 gal."*
- **Skip** is for "I can't find it" or "not in this cage". It stays on the list.

**Saving happens as you go, one product at a time.** Not at the end. If the phone
dies, or you get pulled away for three days, nothing is lost and nothing is
half-done — every product you have answered is already recorded, on every phone.

**Finishing.** A summary: how many you counted, how many matched, what changed
and by how much, and anything you skipped. Every line of it is also on the
product's own screen under "Recent movement", so it is still readable next year.

---

## 3. The three things that need deciding in the code

### 3a. "I counted it and it matched" has to be recordable

Right now the app refuses to write a movement of zero — reasonably, since
nothing moved. But for a count, "I stood in front of it and it was right" is a
fact worth having: without it, a product that matched looks exactly like a
product nobody got to, and the progress count is a lie.

So: **a count may record zero.** It shows on the product's history as
*"Counted · no change"* rather than *"Recount · +0"*. Side benefit you will
probably use more than the count itself: every product gains a **last verified**
date.

The cost is honest — about 191 extra rows a year in the ledger, and the product
screen only shows the last 12 movements, so a count run pushes older entries off
that first page for a while. I think that is a fair trade. Say if you disagree
and I will track progress on the phone only, which works until somebody swaps
phones mid-count.

### 3b. Each count run gets a name, so progress is shared

Each run gets an id stamped on every movement it writes — `count started
2026-10-03`, in effect. That is what lets your phone and Bill's phone both know
that 112 of 191 are done, rather than each keeping its own private tally. It is a
new field on a record that already travels, so it still needs no rules change.

A phone joining a run in progress looks for the most recent run that has had
activity in the last **45 days** and offers to carry on with it; older than that
and it offers to start a new one. 45 days because a count spread over a month of
odd afternoons is normal and one spread over two months probably means last
year's was abandoned.

### 3c. The order to walk in — and a data problem you should know about

The obvious best order is **the order you physically walk**: Cage 1, then Cage 2,
then Cage 3, then the Barn. The app cannot fully do that today, because the
storage information on the products is patchy:

| Where the April sheet says it lives | Products |
|---|---|
| Cage 2 | 49 |
| Cage 3 | 38 |
| Cage (no number) | 48 |
| Barn | 15 |
| Chem Room | 5 |
| Cage 1 | 3 |
| Fertilizers | 1 |
| "Cage Barn?" | 1 |
| nothing at all | 31 |

So I propose: **group by storage place as far as the sheet knows**, with the
80 vague ones in a "Cage, not sure which" and "Where does this live?" group at
the end — and while you are standing in front of a product, one tap to record
where it actually is. Do that once and next year's count walks the rooms
properly. Within a group, alphabetical, matching the list you already read.

**A small bug I found while reading this, same area.** Every product's detail
screen has a "Storage" row, and for all 191 products it currently reads
**"undefined"** — the storage information lives on the container records, and
that row is reading a field on the product that was never filled in. Nobody has
mentioned it, so I assume nobody has looked hard at that row. It is a one-line
fix and it is the same information this feature needs, so I would like to fix it
in the same change. Say if you would rather it stayed separate.

---

## 4. What this deliberately does not do

Each of these is a decision, not an omission:

- **It never rewrites the April opening figures.** They are a fact about April.
- **It never edits or deletes a movement.** If you miscount and tap save, you
  count it again — the second count corrects the first, and both stay readable.
  That is how the whole ledger works and this does not get an exception.
- **There is no "submit the count" step.** Nothing is held on the phone waiting
  to be sent, so there is nothing to lose.
- **It does not block a count that takes a product below zero**, the same as
  Log usage does not. It says so in red and records it anyway.
- **It does not touch the permission rules**, so there is nothing for you to
  publish by hand.

---

## 5. What I will actually change

| File | What goes in |
|---|---|
| `app-04-spray-inventory.js` | The count run (which products, where you are up to, what has been answered), the one-product-at-a-time screen, the start and finish screens. The small change to the ledger that lets a count record zero, and the history row that says "Counted · no change". |
| `UT-TurfFarm-App.html` | Two new screens' markup, the entry card on the Inventory screen, and their CSS. |
| `app-01-shell.js` | The two screens listed so they belong to the Inventory tab and so the back arrow works. |
| `tools/test-inventory.js` | A new section: a count that matches records zero and nothing else; a count that differs books exactly the difference; a run's progress is counted from the movements and not from anything held on the phone; two phones counting the same product both count; April's figure is still readable afterwards. |
| `tools/test-sync-settles.js` | Its sample movement updated to be a real count movement carrying the new run field, so the new shape is proven to settle rather than assumed to. |
| `docs/DECISIONS.md` | Three entries: why a count may be zero, why it saves as you go instead of at the end, and why there is no new collection. |

**The database:** nothing. No new collection, no rules change, nothing to
publish. Worth saying plainly because it is unusual — most things this size have
needed all three.

**What it costs the free plan:** a full count writes up to 191 movements, and
every phone is told about every one, so about 4,400 of the 50,000 daily reads.
Once a year, spread over days. Not a concern.

---

## 6. Before I push

The usual five, and I will tell you what I saw rather than that it should work:
rebuild the offline copy (`npm run sw`), run all 44 checks, open the app and read
the console, use the thing at phone width and laptop width, and watch two phones
to confirm the counts go flat. Then I report, and **I do not push until you ask.**

---

## Questions for you

1. **Who may run a count?** Anybody may already record stock going in and out,
   including undergraduates — your call on 25 August, because the people who
   carry the jugs know what left the shelf. A yearly count is a bigger thing. My
   suggestion is to keep it the same (anybody), because a crew member counting a
   cage is exactly the help you want and every line is stamped with who wrote it.
   The alternative is Farm Manager, Technician and Faculty only.
2. **Should a count that matched be recorded (3a)?** I recommend yes.
3. **Shall I fix the "Storage: undefined" row in the same change (3c)?**
4. **Does anything else belong on the count screen while somebody is standing in
   front of the product?** Where it lives is the obvious one. A photo, a note, or
   the year on the jug are all possible and all cheap to add now, expensive to
   bolt on later.
5. **Inventory is still behind the "Coming Soon" cover for the crew.** If the
   answer to 1 is "anybody", the crew cannot reach it until you take Inventory
   off that cover. Is that for now or for later?
