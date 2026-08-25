# Part Two — the shared database, start to finish

Written 2026-08-20. Rewritten 2026-08-24 after the move to Firebase.

This document is for **you**, not for a programmer. It explains what we are
about to build, what you will have to decide, and what you will actually see
happen. The code and the database language are my job — you should never have to
read them.

It picks up where `docs/GO-LIVE-MANUAL.md` ends. Finish that first: everyone
signing in as themselves is the foundation this whole thing sits on.

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

## What is already decided

You settled these. They are not open questions any more — I am listing them so
you know you do not have to think about them again.

**1. The app keeps working with no signal.** The phone stays the working copy.
You tap "done", it saves on the phone straight away, and it quietly sends it up
the next time there is signal. The alternative — an app that needs bars to work
— is useless at the far end of the farm, which is exactly where the crew are
when they need to record a mow.

**2. The database is Firebase.** Same company as the logins you are setting up
now, which means one account, one bill, one place to look when something is
wrong. It also does the no-signal catching-up above for free, which is the
hardest part of this whole job.

---

## The money question, honestly

**An earlier version of this document said the database costs $25 a month and
goes to sleep if nobody uses it. That was about Supabase, which we moved away
from. Please ignore it — it is wrong now.** This section replaces it.

Firebase's free plan does not sleep and does not expire. Here is every limit
that applies, and what the farm would actually have to do to reach it.

| What's counted | Free every day | What a busy farm day looks like | Used |
|---|---|---|---|
| Records **read** | 50,000 | see below | 5–10% |
| Records **written** | 20,000 | ~500–1,500 | under 10% |
| Records **deleted** | 20,000 | a handful | ~0% |
| Total **stored** | 1 GB | grows a few MB a year | under 1% |
| People signing in | 50,000 a month | 23 | 0.05% |

**Storing things is not the constraint.** Everything the farm records is text —
a task, a stock count, a line in the field log. One field-log record is about
half a kilobyte, so 1 GB is roughly two million of them. Even logging every mow
on every plot all season, the farm produces a few thousand a year. That is
decades of headroom, not years.

**Writing is not the constraint either.** The heaviest realistic day — everyone
logging their work, plus a full-farm mow that creates one record per plot — is
somewhere around a thousand writes. The allowance is twenty thousand.

**Reading is the only number worth watching, and it is my problem, not yours.**
A "read" is the app fetching one record. If I build it so that opening the app
re-fetches the whole farm every time, one person opening it costs several
hundred reads, and fifteen people opening it six times a day gets close to the
line. Built the way we planned — the phone keeps its own copy and only asks for
what has *changed* — the same day costs a few thousand.

So whether this stays free depends on how carefully it is built, not on how big
the farm gets. Hiring five more people would barely move it. That is my job to
get right, and it is worth knowing so you can hold me to it.

**If it were ever exceeded**, two things are true and both are reassuring:

- The overflow price is trivial. Reads are **3 cents per hundred thousand**;
  writes **9 cents per hundred thousand**. A farm somehow using double the free
  allowance every single day would owe about **a dollar a month**.
- **You would only ever be charged if somebody put a card on the account.**

**My recommendation: never put a card on it.** On the free plan there is no
payment method and no possible bill. If the farm ever did hit a daily limit, the
app does not break — the phones keep working on their own copies, they just
cannot sync until the count resets after midnight. Then it carries on.

For a farm with no software budget and a non-technical person holding this in
2030, a hard stop that fixes itself overnight is *better* than a surprise
invoice nobody is watching for. Take the cutoff.

You can see the numbers any time: Firebase console → **Usage**.

**The thing that does matter: there are no automatic backups on the free plan.**
Once the shared copy is the real one, the Export button in the app is the farm's
only safety net. Somebody has to actually press it on a schedule.

**Your job here:** decide with Bill *who* presses Export and *how often*, and
put it in a calendar. Monthly is fine in winter; weekly in season. This is worth
five minutes now and is miserable to sort out after something goes wrong.

---

## The drawers, and the order

Think of the shared copy as a filing cabinet with a drawer for each kind of
thing. **I do one drawer at a time, start to finish, and the farm uses it for a
week before I start the next.**

Doing all of them at once would be a single enormous change where, if something
is wrong, it is wrong everywhere and hard to undo. One at a time means each
change is small and the crew barely notice.

| # | Drawer | What changes for the farm | Why here in the order |
|---|--------|---------------------------|-----------------------|
| 1 | **Tasks** | Bill assigns; it lands on the right phone. Marked done; Bill sees it done. | Busiest drawer, so it proves the pattern. Slowest one — everything after copies it. |
| 2 | **Calendar** | One shared schedule instead of five versions. | Simple, and immediately obvious to everyone that it worked. |
| 3 | **Equipment** | Somebody marks a mower down and nobody else drives out to it. | Small drawer, high daily value. |
| 4 | **Field log** | Every mow, spray and application in one place, readable by whoever writes the reports. | The record that matters most long-term, so it goes after the pattern is proven. |
| 5 | **Inventory** | Real stock counts that two people can update at once without losing one. | The fiddliest of the text drawers — see below. |
| 6 | **The map** | Plot shapes and edits shared instead of living on one phone. | A project of its own. Least urgent; the map already works offline. |

**After drawer 1, the farm has real shared tasks.** That alone is most of the
day-to-day value. Everything after it is steady improvement rather than a leap.

---

## What happens for each drawer

The same four things, every time:

**1. I build it.** I write the shape of the drawer and the rules about who can
open it. You see nothing yet; the app carries on as normal.

**2. Everyone opens the app once, on wifi.** This is the step that needs you.
Whatever is on each person's phone gets copied up into the shared drawer. Until
that happens, their records exist only on their phone — so **anyone who skips
this loses what they entered.** Five minutes per person, and it has to happen
before I flip the switch.

**3. I flip the switch.** The shared copy becomes the real one. From here,
everyone sees the same thing.

**4. We watch it for a week.** Then the next drawer.

Step 2 is the only one that can actually lose data. I will make it as obvious as
I can inside the app — a banner, a nudge — but I cannot make somebody open their
phone. A message from Bill the week before each switch-over is worth more than
anything I can build.

---

## Questions I will need you to answer

I can guess at these. You actually know. None of them block the start — I will
ask each one when its drawer comes up — but they are worth turning over in your
head now, and some are worth asking Bill.

**About who can see what** (this comes up in drawer 1 and affects all of them):

- Should people see **trials from labs other than their own**? Today the app
  says no. Is that right, or is it just cautious?
- Can a Technician edit or delete **somebody else's** field log entry — a
  correction the next morning, say?
- Who can **assign** a task? Bill only, or can faculty and grad students assign
  within their own lab?

**About the awkward moments:**

- Two people mark the same job done. First one wins and the second is told —
  but told *what*? "Rose already logged this" is friendlier than an error.
- Somebody logs a mow on the wrong plot and notices a week later. Should they be
  able to fix it themselves, or does that need Bill?

**About inventory, when we get there:**

- Who is allowed to record a delivery coming in?
- Should a stock count going negative stop somebody, or just warn them?

Right now these rules exist in the app as **hidden buttons** — anyone who knew
how could get around them. In the shared copy they become **real rules the
database enforces**, which nobody can get around. That is a genuine upgrade in
safety, and it is also why getting the answers right matters more than it did
before.

---

## What could go wrong, honestly

**Someone's phone records don't get uploaded.** The main risk, and the reason
for the wifi step. If someone has been logging work for weeks and never opens
the app before we switch over, that work is gone.

**Two people change the same thing at once.** Today this cannot happen because
the phones never talk. I will handle each case deliberately — first one wins,
second one gets told — rather than letting the last person to press a button
silently overwrite the other.

**Counting stock is the one I am most careful about.** If two people restock the
same item at the same time, the naive approach loses one of them, quietly and
permanently. So inventory will record *movements* — "50 bags in", "3 bags out" —
and add them up, rather than storing one number people overwrite. Slightly more
work, and it cannot lose a delivery.

**We break something that works.** The app has hundreds of automatic checks that
run before anything ships, including a set I wrote *before* starting this work
specifically to prove that changing where records live did not change what the
app does with them.

**Google lock-in.** Worth saying plainly: once the records are in Firebase,
getting them out to somewhere else is real work. That is the price of the free
plan and the no-signal handling. The Export button is also the escape hatch —
another reason it matters that somebody presses it.

---

## How long

I am not going to give you a date I cannot keep. Honestly:

- Drawer 1 (tasks) is the slow one. It establishes the pattern.
- Each drawer after that is faster.
- The map is a project of its own and should not be judged against the others.

The useful measure is drawer 1. Once it lands, the farm has shared tasks, and
the rest is steady progress you can watch happen.

---

## Your part, in one list

1. Finish `docs/GO-LIVE-MANUAL.md` — everyone signed in.
2. Agree with Bill **who presses Export and how often**, and put it in a
   calendar.
3. Think about the questions above; ask Bill the ones that are his call.
4. Before **each** switch-over: get everybody to open the app once on wifi.
5. Answer my farm questions as they come up. That is the part only you can do.

Everything else on this page is mine.

---

## Where the technical detail lives

The database design, the exact rules and the migration order live in my working
notes and in the project memory, so a future maintainer can pick it up.

Two things worth recording in plain terms:

- **The old backend plan in the repo has a mistake in it.** The permission check
  it describes would not actually work — it asks the database a question the
  database cannot answer about farm roles. I know the fix; noting it so nobody
  follows that document blindly later.
- **The old plan only covers the map**, which is about a third of the job. The
  rest — tasks, equipment, inventory, logs, the calendar — was never scoped.
  That is why this document exists.
