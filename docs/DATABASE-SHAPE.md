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
