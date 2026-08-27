# What the shared database actually holds

Written 2026-08-25, at the start of drawer 1 (Tasks). This is the working
record — the decisions, and the reasons, so that whoever picks this up in 2030
does not have to reverse-engineer them from the code. The plain-language version
of the same project is `docs/BACKEND-STEPS.md`.

Rules live in `firestore.rules`. Publishing them is `docs/PUBLISH-THE-RULES.md`.

---

## The two collections that exist so far

Everything else is denied by the rules until its drawer is built. An unbuilt
drawer is a closed one, not an open one.

### `refdata/roster` — one document, not one per person

```
refdata/roster
  updatedAt : ISO string
  updatedBy : roster id
  people:
    p01: { role:'Technician', lab:'Sorochan', active:true, grants:['assign_undergrads'] }
    p07: { role:'Farm Manager', lab:'Bill',   active:true, grants:[] }
    ...23 entries
```

**Why one document rather than 23.** A security rule may only fetch a small
number of documents per request, and it has to answer questions about two people
at once — the person asking, and the person the work is being put on. Repeated
lookups of the same document inside one request are fetched once and reused, so
the whole roster costs a single read no matter how many questions the rules ask.
Twenty-three short entries is nowhere near the 1 MB document ceiling.

**Why the roster is in the database at all**, when it is also baked into the app:
the rules cannot see inside the app. This is the fix for the mistake noted in
`docs/BACKEND-STEPS.md` — the old plan's permission check asked the database a
question about farm roles that the database had no way to answer.

**Only four fields per person travel.** Role, lab, active, grants. Names,
pronouns and email addresses stay in the app. The crew's email addresses were
deliberately taken out of the app (`docs/DECISIONS.md`) and this is not the place
to put them back.

**Who may write it.** Whoever holds `assign_undergrads` — the same grant that
governs handing out undergrad labour, because it is the same job. The bootstrap
is two hardcoded ids (p01, p07), because until the roster document exists there
is no roster to check a grant against. That is the only place a person is named
in the rules.

### `tasks/{taskId}` — one document per job

The document is the task object the app already carries, unchanged. Nothing was
renamed for the database; the point of the seam in `STORE_DEFS` is that the same
records move.

| Field | What it is |
|---|---|
| `id` | device-generated, and **must equal the document id** — the rules check this |
| `title`, `desc`, `type`, `badge` | what the job is |
| `area`, `plots[]` | where — `plots` are PLACES ids, see below |
| `assignee` | the primary person, a roster id, or `null` for the open pool |
| `helpers[]` | everyone else on it — a mow can go out to three people |
| `kind` | `'task'` (directed) or `'request'` (sits until claimed) |
| `origin` | `'manager'` (Bill → grad/tech) or `'crew'` (anyone → Bill for undergrads) |
| `target`, `students`, `requestedBy` | who a request is aimed at, how many are needed, who asked |
| `assignedBy` | who put the named person on it |
| **`createdBy`** | **who raised it — stamped at creation, never rewritable** |
| `status`, `completedBy`, `completedAt`, `closedBy` | state, and the credit |
| `dueAt`, `dueOrd`, `repeat`, `freq`, `months[]` | when |
| `machine`, `mowDir`, `dblMow`, `dblPass`, `mix` | how — mower, direction, tank |

**`createdBy` was missing and is now stamped.** `taskCan(actor,'edit'|'delete')`
has always had a branch reading "the person who raised it may change it", and it
had never once fired: no creation site set the field. Harmless while the rules
were only buttons — the person usually also matched another branch. Fatal once
the database enforces it, because a create without `createdBy` is now *rejected*.
All six creation sites stamp it, and `tools/test-rules.js` fails if a new one
ever forgets.

---

## Plot identity — shared by tasks, the field log and the map

Settled before any of this and not re-opened here: **`PLACES` in `farm-geo.js`
says what every named place is**, and code asks `placeIsWorkable(id)` rather than
pattern-matching the name. `tasks.plots[]` holds those ids.

This matters for the database because tasks, the field log and the map all key
off it, and it is the one thing that must not be settled three times. Of the 166
features in `PLOTS_DATA`, 8 are facilities and 2 rows of `PLOT_INFO` are
aggregates with no polygon — they are not all plots, and a rule or a query that
assumes they are will be quietly wrong.

Plot geometry itself does **not** go in the database in drawer 1. It stays in
`farm-geo.js`, processed client-side by Turf. Drawer 6 moves the four override
sets (`ut_plot_shapes_v1`, `ut_dump_notes_v1`, `ut_plot_info_v1`,
`ut_mgmt_data_v1`) and is a project of its own.

---

## What stays on the phone

Per-person settings (`ut_prefs`, keyed by roster id), the map overrides until
drawer 6, and the crew claim channel (`utturf_crew_v1`) which is currently
BroadcastChannel between tabs on one machine. That last one has the same
read/write/subscribe shape Firestore uses, so it swaps transport without callers
changing — but it is not part of drawer 1.

---

## The read budget, which is the only limit worth watching

The free plan allows 50,000 record reads a day. The whole risk is a design where
opening the app re-fetches the farm. It will not:

- The phone keeps its copy and asks only for **what changed since it last
  looked** — a query on `updatedAt`, not a full fetch.
- Firestore's own offline cache serves the board on a cold open; the network
  query fills in behind it. This is also decision 1 (works with no signal) and it
  is the reason for choosing Firebase at all.
- The rules' roster lookup costs one read per write, not per question asked.

Fifteen people opening the app six times a day, on that design, is a few thousand
reads. On the naive design it is close to the line. Same farm, same people.

---

## Migration, per drawer

Local records upload matched on their **device-generated `id`**, so a person who
opens the app twice does not create two copies of the same task. Ids stay
device-generated for exactly this reason. `due_at` stays local wall-clock text —
the farm works in local time and a timezone conversion is a bug waiting for a
season change.

A failed fetch must never wipe good local data. `storeHydrate()` already refuses
to overwrite a seed array with a corrupt or non-array payload; the network path
needs the same rule and it is the single most important line in the sync code.

---

## Still open

Answers change the rules, so they are worth getting before the drawer ships:

- Can a technician or grad student **hand back** a request they claimed?
- **Cross-lab visibility**: tasks are readable by everyone signed in, and the
  rules currently say so. Trials are lab-scoped. Confirm that is intended rather
  than inherited.
- Can anyone edit or delete **somebody else's** field log entry? (Drawer 4, but
  the answer shapes how corrections work everywhere.)
- ~~Lauren Valk / lab-assigned undergrads~~ — **settled 2026-08-25**, see below.


---

## The lab-assigned exception — Dillon, 2026-08-25

An undergrad who **belongs to a lab** answers to that lab. Anybody in it above
undergrad — faculty, grad students and technicians alike — may put them on a
job directly. Dr. Brosnan, Greg, Javi and Logan can all direct Lauren Valk.

Undergrads with **no lab of their own remain pooled** and are still handed out
only by whoever holds `assign_undergrads`.

**The pool is expressed as `lab:'Bill'`.** The five pooled undergrads carry Bill
Czekai's own lab value, and Bill is the only non-undergrad in it, so "same lab"
resolves to "Bill" and the exception cannot reach the pool. This is worth
knowing before anybody edits a lab:

- Moving a pooled undergrad into a real lab through **More → People** hands that
  lab direction over them *immediately*, with no code change. That is the
  intended behaviour and it is a small win for [[handoff-constraint]].
- Giving any other person `lab:'Bill'` would hand them direction over all five
  pooled undergrads. Nothing stops it and nothing should — it is the same
  mechanism — but it is the one edit with a surprising blast radius.

`sameLab()` requires both people to actually have a lab; a blank lab or the em
dash the app writes for "none" is not a lab everyone shares.


---

## How tasks actually move — built 2026-08-25

`vendor/firebase/firebase-firestore-compat.js` (547 KB, firebase 12.18.0, the
same version as the app and auth builds already there). Vendored like
everything else — nothing in this app loads from a CDN — and precached by the
service worker, so it is downloaded once per device rather than once per visit.
It has to be local anyway: a farm with no signal cannot fetch a library before
it can read its own task list.

**`fbDb()` is the one handle**, made on first use, exactly like `fbAuth()`. It
turns on `enablePersistence({synchronizeTabs:true})` in the constructor rather
than at a call site, because it must run before the first read or write and a
caller who forgot would silently produce an app that needs bars.

**The array stays.** ~900 render functions read `TASKS` synchronously and some
capture a reference, so records arriving from the database are written *into*
the existing objects (`tsyncApply`) rather than replacing them — the same rule
as `storeHydrate`.

**Outbound changes ride the existing 2-second scan.** `tsyncScan()` hangs off
`storeScan()`. Around thirty places change a task across twelve thousand lines;
adding a `save()` to each is thirty chances to miss one. The scan serialises
each task, compares it with what the server last agreed to (`TSYNC.seen`), and
writes only what differs. It cannot be defeated by a mutation site nobody
remembered.

### The three things it must never do

1. **Lose a day's work.** Local-only records are uploaded on the first *server*
   snapshot — `snap.metadata.fromCache === false`. Uploading off a cached
   snapshot would resurrect records somebody else had deleted. Matching is on
   the device-generated `id`, so opening the app twice cannot double anything.
   Legacy records with no `createdBy` are stamped on the way up, since the
   database refuses a create without it.
2. **Delete the farm.** An empty local array and "everything was deleted" look
   identical to a diff. So a scan that would remove everything, or more than
   `TSYNC_MAX_DELETE` (5) at once, refuses and says so. Losing all of it at once
   is a fault, not a deletion. Symmetrically, a `removed` from the server only
   takes a record off the phone if that record was in `TSYNC.seen` — one this
   phone is still trying to send up is ours going out, not theirs coming down.
3. **Echo.** A record arriving from the server is written into `TSYNC.seen`
   *before* anything else reads it, so the next scan sees no difference.

### THERE IS NO SWITCH — removed 26 August 2026

Sharing is on, on every phone, from the moment the app opens. `tsyncWanted()`
returns `true` and nothing on any screen can change it; the full reasoning is in
the comment over `flsyncWanted()` in the app.

What was there before: `ut_tasks_shared_v1` in localStorage, one key per drawer,
all starting off, all flipped on **More → Admin → Shared database**. Two things
were wrong with it. That screen is the App Manager's, so no other phone could
ever have been switched on at all — the staged rollout it was built for could
not actually have happened. And a farm where one phone shares and the next does
not is worse than either answer on its own.

The `refdata/config` document this section used to call the next step is
therefore **not needed** and was never built. Turning sharing off again now
means editing the app.

Each drawer still attaches on its own, so one drawer failing does not take the
other nine with it.

### Proven by

`tools/test-tasksync.js` — 39 checks against a fake database that records every
write and delete. Sections 4, 5 and 6 are the three rules above. `tools/test-db.js`
— 40 checks on the handle, the roster payload, and who may send it; section 3
compares the payload field-for-field against the shape `firestore.rules` reads,
which nothing else in the system checks.


---

## The map, and who is working where — built 2026-08-25

### `mapplaces/{placeId}` — one document per place somebody has changed

Four localStorage keys became four fields on one record, keyed by the place —
B12, AZ06, CAFS9. A place nobody has touched has no document at all.

| Field | Was | Holds |
|---|---|---|
| `places` | `ut_places_v1` | what a named place IS |
| `plotinfo` | `ut_plot_info_v1` | turfgrass, cultivar, area, rootzone |
| `mgmt` | `ut_mgmt_data_v1` | mower, cut height, irrigation heads |
| `geom` / `added` / `removed` | `ut_plot_shapes_v1` | polygon, a place drawn, a place taken off |

**Still overrides, never whole objects.** Storing the finished object would
shadow `farm-geo.js` forever: the next time the file gains a plot or a corrected
area, every device would go on serving its own stale copy and nobody would know
why. Same reasoning as the local overrides this replaces — it is why the file
stays useful. A field carrying `null` means the file has it and the farm has
removed it, exactly as `mapDiff` has always meant it.

**This sync never deletes a document, and the rules refuse deletion outright.**
That is the difference between it and the task sync, and it exists for one
button: "clear this device's plot edits" wipes localStorage and reloads. Under a
scan that deletes, that button would take the whole farm's map corrections with
it. Removing a *place* is expressible without deleting a *record*
(`removed: true`), so the dangerous case cannot arise. After that button the
farm's edits come back down on the next load, which is the right answer for a
shared map — and the button now says so.

**Who may change it: anyone but an undergrad.** Dillon, 2026-08-25. Before this
the app had three different answers — reshaping needed Bill or faculty, a cut
height needed a technician or grad student, and the plot information form was
not gated at all. That was not a decision anybody made, it was how it grew.
`mapCan(actor, action)` is now the single rule, transcribed into
`firestore.rules` as `canMap()`, with the same warning attached as `taskCan()`.
Actions are named separately (`shape` / `info` / `mowing`) so that if the farm
ever wants them to differ, one function changes.

### `crew/{taskId}` — who is working which piece of ground

When two or three people share a mow, each zone or plot is claimed by one of
them so the same ground is not worked twice. This existed already, over a
BroadcastChannel — which reaches other *tabs on the same machine* and nothing
else. Honest as a prototype, useless in a field.

One document per task, holding a claim per unit. **Writes name the unit they
touch** (`{claims:{AZ06:…}}` merged in) rather than replacing the record, so two
people claiming different zones cannot overwrite each other. Releasing a claim
writes `FieldValue.delete()` for that one key.

**Heartbeats had to start leaving the phone.** A claim expires after eight
minutes without one; a beat that never reached the other phones would let a live
claim read as abandoned everywhere but the phone holding it — which is precisely
how the same ground gets mown twice. They cost a write each, so the beat slows
from 45 seconds to two minutes when claims are shared. Eight minutes is still
four chances to miss.

Writing is gated on being **on that job** — assignee, helper, or the
undergrad-job holder sorting it out from the shed. Not on rank: undergrads claim
ground, and being out on the mow is exactly who this is for. A task with no
record in the database yet is not a reason to refuse, since tasks and the map are
separate drawers and either may reach the database first.

### Ten read-outs, one screen, no switches

**More → Admin → Shared database** shows one line per drawer — connecting, so
many sent and received, or what went wrong in words — and the roster button.
Nothing on it can be turned off; see "THERE IS NO SWITCH" above. The drawers
still connect separately, so a fault shows up as one red line rather than taking
the other nine with it.

Proven by `tools/test-mapsync.js` — 49 checks, including that clearing one phone
deletes nothing, that a correction coming down is not sent straight back, and
that two people on different zones of one job write different fields.


---

## The field log — drawer 3, built 2026-08-25

The record that outlives everybody currently on the farm. Two rules shape the
whole drawer, and both are enforced by the database, not just by the app.

### Nothing is ever edited. A correction is a new entry.

Dillon, 2026-08-25, choosing between four options: **the wrong entry stays.**
`flCorrect()` copies the entry, applies the fix, stamps `corrects`,
`correctionNote`, `correctedAt` and `loggedBy` on the copy, and marks the
original with `correctedBy` / `correctedAt` / `correctedWho`. The original is
never touched otherwise.

The feed and the counts read `flLive()` — entries with no `correctedBy` — so a
wrong mow does not sit in the totals forever. The superseded record is still
there, linked from the correction that replaced it, and both halves of the pair
say so on screen. That is the difference between a total that is right and a
record that is missing something.

The reason is **required**. A correction with no sentence saying what was wrong
is refused by the form. The reason is the part somebody reading this in 2035
will actually need.

Why it works this way rather than an edit-in-place: the spray entries are the
farm's application records, and a log that can be quietly rewritten is worth
much less than one where you can see what changed and when. Recordkeeping
requirements for pesticide applications vary by state and have moved at the
federal level recently, so this is not written against a specific rule — it is
written so that whatever the rule turns out to be, the record survives it.

### Nothing is ever deleted

`allow delete: if false` on `fieldlog/{entryId}`, and no code path in the app
removes a record from the shared copy. The only permitted change to an existing
entry is the three fields that mark it superseded, and whoever does it has to
be named in `correctedWho`.

### The 5,000-entry cap is a phone limit, not a farm limit

`flCommit()` keeps the newest `FL_CAP` records on the device. Under a naive sync
that is a disaster twice over: the trimmed records get deleted from the shared
copy, and then the listener drags them back down and the cap trims them again,
forever. So the sync never deletes, and `flsyncOnSnapshot()` ignores an arriving
record older than `flOldestKeptOrd()` once the phone is at the cap. **The farm's
history lives in the shared copy; the phone carries a window onto it.**

### Who may do what — `flCan(actor, action, entry)`

| Action | Who |
|---|---|
| `log` | everybody. An undergrad who mowed is exactly who should record that they mowed. |
| `correct` | whoever wrote it down, whoever did the work, Bill or the undergrad-job holder, or faculty over their own lab's person |
| `delete` | nobody, ever |

`loggedBy` is now stamped on both creation paths — the manual form and
`flAddFromTask()`. It is distinct from `person`, which is who did the work: Bill
closing a job on Rose's behalf writes an entry where `person` is Rose and
`loggedBy` is Bill, and both of them can correct it.

Proven by `tools/test-fieldlog-sync.js` — 63 checks. Section 2 is the one that
matters: the log grows, the original still says what it always said, and only
the correction counts in the totals.

---

## Trials and restrictions — built 2026-08-26

Two collections, and the split is the whole design rather than a detail of it.

Dillon's rule, in his words: *trials sync to everyone; a trial can only be
edited by the people in that lab; Bill can remove restrictions on anyone's trial
but is not able to edit any details about the trial.*

### `trials/{trialId}` — one document per study

The whole study: title, lab, PI, stage, dates, plots, treatments, and the
restrictions it carries. **With one thing deliberately stripped out on the way
up — whether a restriction has been lifted.** That answer lives in
`triallifts` and nowhere else; a second copy inside the study would be a second
source of truth, and the two would disagree the first time Bill lifted something
while the lab was editing.

Writing is scoped to the study's own lab, off the roster. Reading is open to
everyone signed in.

### `triallifts/{restrictionId}` — one small record per lifted restriction

`{id, trialId, lab, lifted, liftedBy, liftedByPid}`. That is all of it. The
study's lab may write one; so may whoever runs the farm.

### Why two documents and not one

Because "Bill may lift a restriction but may not change the study" is
unenforceable inside a single document. A rule that lets him write the study to
lift one restriction lets him rewrite every other word in it in the same breath,
and Firestore rules cannot practically inspect what changed inside an array to
tell the difference. Split out, the rule is exactly as narrow as the sentence.

Two smaller things fall out of the split for free: a lab saving its study can
never wipe a lift, and a lift can never overwrite an edit the lab made a second
earlier. Nobody has to win a race nobody knew they were in.

### Who may do what

| Action | Who |
|---|---|
| read any study | everybody signed in |
| create / edit a study, its stage, its plots, its restrictions | that study's **lab** — faculty, grads and technicians in it. Not the undergraduates, and **not Bill** |
| lift a restriction | that study's lab, **or the Farm Manager** |
| delete anything | nobody, ever |

The app still shows an undergraduate only the active studies, and keeps one
lab's planned and finished work off another lab's screen. **That is a tidy
screen, not a lock** — every study on the shared copy is physically on every
signed-in phone — and it is written down in the rules file as such so the two
never get confused for each other.

### The second lab is a roster grant now

Dr. Stier edits Sorochan studies as well as his own. That used to be a hardcoded
map inside the app (`TR_EXTRA_LABS`), which the database could not read. It is
`grants: ['trials:Sorochan']` on his roster record now — one source, read
identically by `trCanEditLab()` and by `canEditTrialLab()` in the rules.
**The roster has to be sent up again for it to take effect.**

Lifting is a role plus a movable grant — Farm Manager, or anyone carrying
`lift_restrictions` — for the same reason `assignsUndergrads` is one: ground
fenced off by a study nobody is running any more has to be freeable while Bill
is away, without anybody editing code.

### Removals travel as records

Removing a study writes `removed:true`, never a deleted document, and the id is
kept on the phone in a short list of its own (`ut_trials_gone_v1`) rather than
as a flag on the study — so the twenty-odd screens that read `TRIALS` carry on
seeing exactly what they saw before: a removed study is simply not in the array.

Proven by `tools/test-trials.js` — 79 checks. Section 4 is the one that matters:
Bill lifts, and cannot write the study document at all.

---

## Farm settings — built 2026-08-26

Four small things rather than a list of records, so this drawer is shaped
differently from every other one, in two ways that both matter.

### `farmsettings/{group}` — one document per GROUP, not per record

`spray` · `mowers` · `labs` · `semesters`. The group's name is the document id.

`{ id, v, updatedAt, updatedBy, updatedByPid }`, where **`v: null` means "the
built-in defaults"** — a real answer, not an absence. A reset that travelled as a
deleted document would be undone by the next phone to connect, which still holds
its own copy.

### THE SHARED COPY WINS ON ARRIVAL

Everywhere else in this app, a phone pushes up whatever the shared copy is
missing. That is right for a list of jobs and wrong
here: each of these four has exactly one value, so a phone still holding the
built-in defaults would not be *adding* anything — it would be overwriting the
farm's real settings with them.

So: farm settings **takes** rather than sends — the farm's copy wins the moment
it arrives, and the phone then sends up only a value it changes itself. Two guards make that safe:

1. `fstsyncSeed()` only seeds a group **the shared copy has never held**.
2. It only seeds a group **this phone has actually changed** — `read()` returning
   `null` (still on the built-ins) is skipped. Without this second guard, the
   first phone to connect could seed `labs: null` and reset the farm for
   everybody the moment somebody who had set the labs up properly connected.

Each group is a row in `FST_GROUPS` with four functions: `read` (what this phone
would send, `null` for the built-ins), `apply`, `restore`, `can`. The sprayer,
mowers and labs already had a `xxxDiff()`/`xxxApply()` pair and a captured
baseline; the semester dates did not, so `_semBase` was added at the declaration
— captured there because `storeHydrate()` later fills `FARM_SEMS` in place from
the phone's saved copy, and by then the built-in list would be gone.

### Who may do what

| Group | Who |
|---|---|
| `spray`, `mowers` | everybody but the undergraduates — `canEditFarmKit()` |
| `labs`, `semesters` | the Farm Manager, faculty, or the App Manager — `canEditFarmLists()` |
| read any of them | everybody signed in |
| delete | nobody, ever |

Faculty were added to all four by Dillon on 2026-08-26.

**All four gates used to read `currentRole`** — `sprCanEdit()` and `mowCanEdit()`
via `flCanChem()`, `labsCanEdit()` and `semCanEdit()` directly — which is why
they could not be transcribed into rules at all until this pass. They read the
roster now.

**The App Manager post is the one thing here that is not on the roster.** It
rides on the sign-in token as its own claim (`app_admin`), stamped by
`tools/create-accounts.js` exactly like `pid` — which is precisely why a rule is
allowed to ask about it: the database can see it for itself.

### Renaming moves records that ride a different drawer

Renaming a mower moves every plot booked on it; renaming a lab moves the people
and studies in it. Those records travel through the **map** and **trials**
collections, not through this one. `fstRenameOk()` says so and lets the rename
go ahead — Dillon's call, 2026-08-26 — and the orphans it can leave behind are
already visible in the "in use but not on the list" section on both screens.

Proven by `tools/test-farmsettings.js` — 75 checks. Section 4 is the one that
matters: a phone on the defaults never seeds, and an arriving value replaces
rather than merges.

---

## How the two copies of the rule are kept honest

`taskCan()` in the app and `firestore.rules` are the same organisation chart
written twice. Two copies drift.

`tools/test-rules.js` runs **every person on the roster against every other
person, for every action** — 3,795 comparisons — through both the app's function
and a mirror of the rules, and fails if they ever disagree. It also fails if a
role name, a grant name or a field name appears in one file and not the other,
and if a new task-creation site forgets `createdBy`.

**What it cannot do:** run the actual rules file. Google's rules language only
executes inside the Firebase emulator, which downloads a program from Google's
servers this machine cannot reach. So the test proves the *logic* matches. The
console proves the *file parses* — it refuses to publish a file it cannot read.
Between them the gap is small, but it is real and it is written down here rather
than pretended away.
