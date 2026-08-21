# Building the shared database — what happens, in plain terms

Written 2026-08-20, after the login went in.

This document is for **you**, not for a programmer. It explains what we are
about to build, what you will have to decide, and what you will actually see
happen. The code and the database language are my job — you should never have to
read them.

---

## What we are fixing

Right now every phone keeps its **own private copy** of the farm's records.

If Rose marks a task done on her phone, it is done *on her phone*. Bill's phone
never hears about it. If Rose drops her phone in the pond, everything she
entered is gone — there is no other copy anywhere.

That is not a bug I forgot to fix. The app was built before there was anywhere
shared to put things. What we are doing now is giving the farm **one shared
copy** that every phone reads from and writes to.

After this:

- Bill assigns a task; it appears on the crew member's phone.
- Someone marks it done; Bill sees it done.
- A lost or broken phone loses nothing.
- Somebody new gets the whole picture the moment they sign in.

This is the single biggest improvement left, and it is also the most work.

---

## The one decision that matters most

**When someone is out in a dead spot with no signal, what should the app do?**

Two possible answers:

**Option A — the app needs signal to work.** Simple to build. Also useless at
the far end of the farm, which is exactly where the crew are when they need to
record a mow.

**Option B — the phone keeps working, and catches up later.** The phone stays
the working copy. You tap "done", it saves on the phone straight away, and it
quietly sends it to the shared copy the next time there is signal. This is how
the bug reporter already works, and the crew already rely on it.

**I strongly recommend B.** It is more work for me and invisible to you when it
works — but the alternative is an app that stops working in a field.

I need you to confirm B before I start, because it changes almost everything
about how I build it.

---

## Three more things only you can decide

**1. The free plan goes to sleep.** A free database shuts itself down after a
week with nobody using it. Today that would just mean nobody can sign in.
Once the farm's records live there, it means **the records are unreachable**
until someone wakes it up. The paid plan is $25 a month and does not sleep.

My honest view: fine on free while we build and test, but the farm should be
paying for it before the crew depend on it. It is worth raising with Bill now
rather than the week it happens.

**2. There are no backups on the free plan.** Once the shared copy is the real
one, the Export button in the app becomes the farm's only safety net. Somebody
needs to actually press it on a schedule. Worth deciding who.

**3. Who is allowed to see and change what?** The app already has ideas about
this — undergrads can't edit the sprayer settings, trials belong to a lab. Right
now those are just *hidden buttons*: anyone who knew how could get around them.
In the shared copy I can make them **real rules the database enforces**, which
nobody can get around.

I need you to confirm the rules are still right. In particular: **should people
see trials from labs other than their own?** Today the app says no. Tell me if
that's wrong.

---

## How it will go — one drawer at a time

Think of the shared copy as a filing cabinet with a drawer for each kind of
thing: tasks, equipment, field logs, inventory, the calendar, and so on.

**I will do one drawer at a time, start to finish, and we will use it for a week
before starting the next.** Tasks first, because it is the busiest.

Doing all of them at once would mean a single enormous change where, if
something is wrong, it is wrong everywhere and hard to undo. One at a time means
each change is small, and the crew barely notice.

For each drawer, the same four things happen:

**1. I build it.** I write the shape of the drawer and the rules about who can
open it. You see nothing yet; the app carries on as normal.

**2. Everyone opens the app once, on wifi.** This is the step that needs you.
Whatever is on each person's phone gets copied up into the shared drawer. Until
that happens, their records exist only on their phone — so **anyone who skips
this loses what they entered.** It is a five-minute job per person and it has to
happen before I flip the switch.

**3. I flip the switch.** The shared copy becomes the real one. From here,
everyone sees the same thing.

**4. We watch it for a week.** Then the next drawer.

Roughly: tasks, then the calendar, then equipment, then the field log, then
inventory, and the map last — the map is the fiddliest and the least urgent.

---

## What you will have to do

Not much, but the bits that need you really do need you:

- **Confirm Option B** above, and the three decisions.
- **Get everyone to open the app on wifi** before each switch-over. This is the
  one that can actually lose data if it is skipped.
- **Tell Bill about the $25/month** before the farm depends on it.
- **Answer questions about the farm** when I hit them — things like "should a
  technician be able to delete somebody else's field log?" I can guess, but you
  know.

---

## What could go wrong, honestly

**Someone's phone records don't get uploaded.** The main risk, and the reason
for the wifi step. If someone has been logging work for weeks and never opens
the app before we switch over, that work is gone. I will make the upload step
as obvious as I can, but I cannot make somebody open the app.

**Two people change the same thing at once.** Two crew both mark the same task
done, or Bill edits a task while it is open on someone's screen. Today this
cannot happen because the phones never talk. I will handle each case
deliberately — first one wins, second one gets told — rather than letting the
last person to press a button silently overwrite the other.

**Counting stock is the one I am most careful about.** If two people restock the
same item at the same time, the naive approach loses one of them, quietly and
permanently. So inventory will record *movements* — "50 bags in", "3 bags out" —
and add them up, rather than storing one number that people overwrite. Slightly
more work, and it cannot lose a delivery.

**We break something that works.** The app has 846 automatic checks that run
before anything ships. I will add more around the parts I am changing, written
*before* I change them, so they prove the behaviour did not shift.

---

## How long

I am not going to give you a date I cannot keep. What I can say honestly:

- The first drawer (tasks) is the slow one — it establishes the pattern
  everything else follows.
- Each drawer after that is faster.
- The map is a project of its own.

The useful measure is that after the **first** drawer is done, the farm has real
shared tasks. That alone is most of the day-to-day value, and everything after
it is steady improvement rather than a leap.

---

## Where the technical detail lives

I have kept the database design, the exact rules, and the migration order in my
own working notes and in the project memory, so a future maintainer can pick it
up. Two things I found while planning that are worth recording in plain terms:

- **The old backend plan has a mistake in it.** The permission check it
  describes would not actually work — it asks the database a question the
  database cannot answer about farm roles. I know the fix; noting it so nobody
  follows that document blindly later.
- **The old plan only covers the map.** The map is about a third of the job. The
  rest — tasks, equipment, inventory, logs, the calendar — was never scoped.
  That is why this document exists.
