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
own lab's people. Undergrad labour is handed out by whoever holds that job. It
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
| Bill, and whoever holds the undergrad-assignment job | Put an undergrad on a job; close a job on somebody's behalf |
| Faculty | Put their **own lab's** grad students and technicians on a job |
| Grad students and technicians | Put themselves on a job; pick up anything from the open pool |
| Undergrads | Do the work they are given, and mark it done |
| Anybody who is not on the roster, or is switched off | Nothing at all |

Two things the database now insists on that the app only *suggested* today:

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

## You will do this again

Each drawer we build adds a block to the same file. When it does, I will tell
you, and the job is the same: pull in GitHub Desktop, open the file, copy,
paste over what is in the box, Publish. Same ten minutes.
