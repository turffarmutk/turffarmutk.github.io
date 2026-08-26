# Publishing the rules

Written 2026-08-25. This is a **ten-minute job you do at a computer**, and you
will do the same ten minutes again each time we finish a drawer. Nothing on this
page requires you to understand what is in the file you are pasting.

---

## What a "rule" is here, in one paragraph

Today the app decides who may do what by showing or hiding buttons. Bill sees an
"Assign" button on an undergrad's name; a grad student does not. That works
right up until somebody knows where to tap — the buttons are a suggestion, not a
lock. A **rule** is the same decision written down where the *database* enforces
it. Once these are published, an undergrad cannot put work on Bill's list even
if they went looking for a way to. That is a real upgrade in safety, and it is
the reason the wording of the rules matters more than it used to.

The file says exactly one thing, in a lot of words: **the farm's organisation
chart.** Bill directs undergrads and asks everybody else. Faculty direct their
own lab's people. Undergrad labour is handed out by whoever holds that job —
unless the undergrad belongs to a lab, in which case that lab directs them. It
is the same rule that is already in the app — written a second time, in the
language the database speaks.

---

## Before you start

- The database exists. (You confirmed this — it is the "Firestore Database"
  section of the Firebase console.)
- **Pull the latest from GitHub Desktop first.** The file you are about to copy
  is `firestore.rules`, and it sits in the top level of the project folder next
  to `UT-TurfFarm-App.html`.

---

## The steps

1. Go to **console.firebase.google.com** and open the project
   **utk-turf-farm-app**.
2. In the left-hand menu, under **Build**, click **Firestore Database**.
3. Along the top of that page there are tabs — Data, **Rules**, Indexes, Usage.
   Click **Rules**.
4. You will see a box with a few lines of text already in it. That is the
   locked-down starter Google puts there. **Click inside the box, select
   everything (Ctrl-A / Cmd-A), and delete it.** You are not losing anything —
   the old text refuses every single request, which is why nothing works yet.
5. Open `firestore.rules` from the project folder in any text editor (TextEdit
   is fine). Select all, copy.
6. Click back in the console box and paste.
7. Press **Publish**.
8. A confirmation appears, and the page starts showing a **"Last published"**
   time. That is it.

---

## How to tell it worked

**It worked** if the Rules page shows a "Last published" timestamp of a few
seconds ago.

**It refused** if a red message appears with a line number in it. That means a
typo somewhere between the file and the box — usually a partial paste. Try step
4 through 7 again, and if it refuses a second time, send me the red message
word for word. The console will not publish a file it cannot read, which means
a typo can never reach the farm. That is a good property and it is why we are
doing it this way rather than through a command line.

---

## What changes for the crew: nothing, yet

This is worth being clear about so you are not watching for something. **The app
does not talk to the database yet.** Publishing the rules is putting the lock on
the door before there is anything in the room. Everyone's phone carries on
exactly as it does today, with its own private copy.

What it *does* do is make the next piece safe to build. Until the rules are
published, the database refuses everything, so I cannot test a single write.
Once they are published, the database refuses the *right* things, and I can
start moving tasks into it knowing that a mistake in my code cannot hand
somebody permissions they should not have.

---

## What the rules now allow

| Who | Can do |
|---|---|
| Anyone signed in and on the roster | See every task on the board |
| Everyone except undergrads | Raise a job, or ask for one |
| Bill, and whoever holds the undergrad-assignment job | Put **any** undergrad on a job; close a job on somebody's behalf |
| Faculty | Put their **own lab's** grad students, technicians and undergrads on a job |
| Grad students and technicians | Put themselves on a job; put **their own lab's undergrads** on one; pick up anything from the open pool |
| Undergrads | Do the work they are given, and mark it done |
| Anybody who is not on the roster, or is switched off | Nothing at all |

### Undergrads attached to a lab

An undergrad who **belongs to a lab** answers to that lab, and anyone in it can
put them on a job — Lauren Valk works to Brosnan's lab, so Dr. Brosnan, Greg,
Javi and Logan can all give her work directly. The five undergrads who work for
the farm rather than for a lab are still handed out by you and Bill.

You control this yourself, from inside the app: **More → People**, change
somebody's lab, and the rule follows. No code change, nothing to republish.

### Two things the database now insists on

Two things it insists on that the app only *suggested* today:

- **Credit goes to whoever did the work, not whoever closed it.** Bill can close
  a job for Rose, and the record still says Rose did it. The database will now
  reject a completion that credits somebody who was never on that job.
- **"I raised this" is permanent.** Whoever creates a job is stamped on it and
  that stamp cannot be rewritten afterwards, by anyone. It is what lets a person
  correct their own request later.

---

## The one thing in the file with a person's name in it

Near the bottom of `firestore.rules` there is a line listing two roster ids —
**p01 (you) and p07 (Bill)**. It is the only place in the whole file where a
person is named, and it exists for one reason: the rules check the roster to
decide who may do what, so *somebody* has to be allowed to write the roster down
in the first place, before there is a roster to check against.

If both of you ever leave the farm, that is the one line a successor has to
change, and it is commented in the file saying so. Everything else about who may
do what is driven by the roster inside the app, which you already edit through
**More → People** without touching any code.

---

## What changed on 2026-08-25

The file grew two new sections — one for map corrections, one for who is
working which piece of ground. **Publish it again**, same eight steps. Nothing
in the farm's day changes when you do; it just means the database will accept
those two things once the switches are turned on.

Both are governed by one rule you set: **anyone but an undergrad may correct
the map.** Reshaping a plot, fixing an area, changing a mower or a cut height.
Claiming a zone on a shared mow is different — that one is open to whoever is
actually on the job, undergrads included, because being out on the mow is
exactly who it is for.

## And again on 2026-08-25 — the field log

A third new section. **Publish it again**, same eight steps.

The field log is the one place the database is strict on purpose. **No entry
can ever be deleted, and no entry can ever be edited** — not by Bill, not by
you, not by me. Correcting an entry writes a new one carrying the fix and marks
the old one as replaced, and the app makes you say what was wrong. Both halves
stay in the record, and only the corrected version counts in the totals.

Everybody can log their own work, including undergrads. Correcting is narrower:
whoever wrote it down, whoever did the work, you or Bill, or a faculty member
over their own lab's person.

---

## And again on 2026-08-25 — the shelf

A fourth new section, and the last one for a while. **Publish it again**, same
eight steps.

Inventory is kept as a **list of what moved**, not as one running total. Every
delivery booked in and every amount taken out is its own record, and each phone
adds them up itself. That is what makes two people booking the same delivery at
the same moment safe — two records, both counted, neither lost. Under a single
number one of the two would simply have vanished.

So the database is strict here in the same way it is strict about the field
log: **a stock movement can never be edited and never be deleted.** Got the
amount wrong? Record another movement. Recounted the shelf? That is a movement
too. The history of what the shelf did stays readable.

**Anyone can record stock moving**, undergraduates included — the people who
carry the jugs are the people who know what left the shelf. **Changing what a
product is** — its name, what a container holds, when to reorder — stays closed
to undergraduates, same as it is in the app.

---

## And again on 2026-08-26 — the schedule and the time clock

**Two** new sections this time, and they go up together. **Publish again**, the
same eight steps.

### The weekly schedules

Undergrads set their standing weekly hours on their own profile, per semester.
Until now that went nowhere — filling it in changed nothing anybody else could
see, and Bill's day board knew nothing about it. These are the rules that let
those hours off the phone.

**Everybody may read them.** Who is on the farm on Thursday is the rota, not
private information, and the whole point is that the person handing out work
can see it.

**Everybody writes their own.** Bill may fix anyone's, because he is the one
who notices the board is wrong while the student is out in a field. A faculty
member may fix their own lab's, which matches the fact that they can already
direct those people. Nobody else.

**A schedule is never deleted.** Turning every day off is how somebody says
"not this term" — there is no reason to remove the record, and removing it
would quietly drop whatever the shared copy knew.

### The time clock

This one is different from the field log and the shelf, and it is worth knowing
why. Those two can **never** be edited or deleted: a mistake is corrected by
writing another record.

A punch cannot work that way. **A punch is opened when somebody clocks in and
closed hours later when they clock out** — closing it means writing the
finish time onto the record that already exists. And a wrong time on a
timesheet has to be fixable by the person who signs it.

So the database allows changes here, narrowly:

- **You clock yourself in and out.** Anybody may open and close their own punch.
- **Bill may add or correct anyone's times** — the same "add a punch" and time
  wheel controls his screen has always had.
- **A punch can never change hands.** An edit cannot move a punch onto a
  different person's name. That is the one thing spelled out explicitly in the
  file, because it is the one that would put somebody else's hours on your
  timesheet.
- **Only Bill can remove a punch.** Somebody clocking in by mistake at 6am is
  not a record of work, and leaving it on the timesheet is not honesty — it is
  a wrong number on a pay slip.

### After you publish

Both drawers have their own switch under **More → Admin → Shared database**,
and both start **off on every phone**, like the others. Turning the schedule
one on first is the sensible order: the day board is the thing you will
actually see change.

---

## And again on 2026-08-26 — the task list

One more section. **Publish again**, the same eight steps. This one went up the
same day as the schedule and the time clock, so if you have not published since
this morning you are getting all three at once — which is fine, it is still one
copy and paste.

**What the task list is:** the jobs the farm does — Rotary – Plots, Greens –
Walk, Hand Water. Not jobs anybody has been given; the menu those are chosen
from. The assign screen is built from it, so a job that is not on the list is a
job nobody can hand out.

Until now it was the one list on the Tasks page that never left the phone that
made it. Add a job on Bill's phone and it existed on Bill's phone only.

**Everybody but the undergraduates can add to it, change it, and take jobs off
it.** That is the same line the app already draws for editing a product in the
inventory: doing a job and deciding what the job *is* are two different things.

**Undergraduates can read it.** Looking up what a job you have been handed
actually involves — which machine, which plots, how often — is the point of
having a list at all.

**Nothing on it is ever really deleted.** Taking a job off marks it as removed
rather than destroying the record, and the bottom of the Task list screen has a
"Removed · tap to put back" section. This is not caution for its own sake: a
phone that has had sharing switched off still holds its own copy of the list,
and when it reconnects it sends up anything the shared copy is missing. A job
that had been properly deleted would come straight back from that phone. A job
marked removed stays removed.

---

## You will do this again

Each drawer we build adds a block to the same file. When it does, I will tell
you, and the job is the same: pull in GitHub Desktop, open the file, copy,
paste over what is in the box, Publish. Same ten minutes.
