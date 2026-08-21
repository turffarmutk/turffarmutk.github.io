# Getting the app live with logins and a shared database

Written 2026-08-20, for Dillon. Plain language — no programming needed for
anything marked **YOU**. Steps marked **NEEDS CLAUDE** are code changes.

Work through it in order. You can stop after any numbered step and the app will
still work; nothing here leaves it half-broken.

---

## Where things stand right now

**Live:** <https://turffarmutk.github.io/> — working, installable, works offline.

**On your computer but not yet published:** the whole login system. It is built,
tested and configured with your Firebase details. It is sitting in your project
folder waiting to be pushed.

**Not started:** the shared database. That is Part Two.

---

# PART ONE — Turn on the logins

About an hour of your time, spread over two sittings. Nobody has to be
handed a password — each person sets their own.

---

## Step 1 — Switch on email sign-in in Firebase  **YOU**

New Firebase projects have every sign-in method **off**. If you skip this, the
app will look right and nobody will be able to log in — the error just says the
password doesn't match, which sends you hunting in the wrong place.

1. Go to <https://console.firebase.google.com> and open **utk-turf-farm-app**
2. Left sidebar: **Build → Authentication**
3. Click **Get started** if it's the first time
4. **Sign-in method** tab → click **Email/Password**
5. Turn on the **first** toggle (Email/Password). Leave "Email link" **off**
6. **Save**

*Check:* the Sign-in method list should now show Email/Password as "Enabled".

---

## Step 2 — Tell Firebase your website is allowed  **YOU**

Firebase only accepts logins from web addresses you've listed.

1. Same Authentication page → **Settings** tab → **Authorized domains**
2. Check the list contains **`turffarmutk.github.io`**
3. If not: **Add domain**, type `turffarmutk.github.io`, save

`localhost` is usually there already — leave it, it's for testing.

---

## Step 3 — Set up sending email  **YOU**

The crew choose their own passwords, and the way that stays safe is a link sent
to their farm mailbox. So the app needs to be able to send email.

**Why it can't just let them pick a password on the spot:** your crew's
addresses are institutional and easy to guess. If choosing a password only
needed an email address, anyone who guessed `wczekai@utk.edu` could claim Bill's
account and become the Farm Manager. Clicking a link sent to the mailbox is what
proves the person owns it.

Firebase's own email service sends **2 messages an hour** and is explicitly not
for real use — 23 people signing up would take a day and a half. So use Brevo,
which is free forever for 300 a day and lets you send from a single address
without owning a domain.

1. Sign up at <https://www.brevo.com> — use a **farm-owned** address, not your
   student one
2. In Brevo: **Senders, Domains & Dedicated IPs → Senders → Add a sender**.
   Use the farm address. Brevo emails it a confirmation link — click it
3. In Brevo: **SMTP & API** → note the **SMTP login** (looks like
   `7abcde@smtp-brevo.com`) and the **master password**
4. In Firebase console → **Authentication → Templates** → **SMTP settings**
   (sometimes under a "Customize" or pencil icon), enter:
   - Host `smtp-relay.brevo.com`
   - Port `587`
   - Username: the Brevo SMTP login from step 3
   - Password: the Brevo master password
   - Sender address: the farm address you verified
5. Save

*Check:* Firebase → Authentication → Templates → **Password reset** → send
yourself a test if offered. Otherwise you'll confirm it for real in Step 6.

---

## Step 4 — Get the master key for creating accounts  **YOU**

This key creates the 23 accounts. It is the **master key to the whole project** —
anyone holding it can do anything.

1. Firebase console → gear icon (top left) → **Project settings**
2. **Service accounts** tab → **Generate new private key** → confirm
3. A `.json` file downloads

Then:

- Move it **outside** your project folder. Your Desktop is fine for now. If it
  sits inside `UT-TurfFarm-app` it could get published to a public website. The
  script refuses to run if it finds it there, but don't rely on that
- **Never paste its contents into a chat**, with me or anyone
- Long term it belongs somewhere the farm owns, not just your laptop

---

## Step 5 — Create the 23 accounts  **YOU**

The one step that needs Terminal. Copy and paste, one block at a time.

A rehearsal that changes nothing:

```
cd ~/Documents/GitHub/UT-TurfFarm-app
npm install firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=~/Desktop/YOUR-KEY-FILE.json node tools/create-accounts.js --dry-run
```

Replace `YOUR-KEY-FILE.json` with the real filename from Step 4.

It prints the 23 people it would create and stops. **Read that list.** It should
be your crew, with `p01` marked as app admin. If it looks wrong, stop and tell
me.

When it looks right, run it for real by removing `--dry-run`:

```
GOOGLE_APPLICATION_CREDENTIALS=~/Desktop/YOUR-KEY-FILE.json node tools/create-accounts.js
```

**No passwords are created and nothing is printed to hand out.** Each account
gets a throwaway string nobody ever sees; the crew set their own in Step 7.

*Check:* Firebase → Authentication → **Users** lists 23 accounts.

**Safe to run again** when somebody joins or leaves — it updates rather than
duplicating, and never touches an existing password.

---

## Step 6 — Publish the login  **YOU**

In GitHub Desktop:

1. A long list of changed files — expected, it's the whole login system
2. Summary: `Add sign-in with email and password`
3. **Commit to main**, then **Push origin**

Wait about two minutes, plus up to ten more for the site's cache.

---

## Step 7 — Set your own password, and test it  **YOU**

Do this yourself before anyone else sees it. Open
<https://turffarmutk.github.io/>, ideally in a private/incognito window.

1. You get an email and password box, **not** a list of names
2. Type your farm email, then tap **"First time here, or forgotten your
   password?"**
3. You should get an email within a minute. **If nothing arrives, the problem is
   Step 3** — check junk first, then the Brevo sender confirmation
4. Open the link, choose a password, come back and sign in
5. You land on the right screens for your role
6. **More → Account** shows your name and email
7. A wrong password says *"That email and password do not match"* — and says the
   same for an address with no account. Deliberate: it stops anyone with the
   link working out who works at the farm
8. **The offline test, and the one that matters most:** signed in, turn off wifi
   and mobile data, then close and reopen the app. **It should open straight
   into your screens, not a login page.** If it throws you out to a login you
   can't complete without signal, stop and tell me — that would strand people
   in the field

---

## Step 8 — Hand it to the crew  **YOU**

Nothing to hand out. Tell each person:

> Go to turffarmutk.github.io, type your UT email, and tap "First time here".
> You'll get a link to choose your own password.

Then:

- They should do it **on wifi**. Only the first sign-in needs a connection
- Then Share → **Add to Home Screen** (iPhone must use Safari)
- Forgotten later? Same button. No need to ask you

You can still reset someone from Firebase → Authentication → Users → the three
dots → **Reset password**, if somebody's mailbox is the problem.

---

### What you've got at the end of Part One

Everyone signs in as themselves and nobody can pretend to be anyone else.

**What it does not do yet:** records still live on each phone separately. Bill
still can't see what Rose marked done. That's Part Two.

Worth knowing: the app file itself can still be downloaded by anyone with the
link, so the roster names are still readable to someone determined. That only
changes in Part Two, when the records move out of the file.

---

# PART TWO — The shared database

This is the bigger piece: weeks, not hours, and most of it is mine. Your time is
needed at three points, marked **YOU**.

---

## Step 9 — Decide the money question  **YOU**

Free Firebase covers 23 people comfortably. But once the farm's records live
there, two things matter that don't today:

- **No backups on the free plan.** The Export button in the app becomes the only
  safety net. Decide who presses it and how often. Put it in the calendar
- **If usage ever outgrows free**, it's pay-as-you-go rather than a flat fee

Raise both with Bill **before** the crew depend on it, not the week it bites.

---

## Step 10 — Build it one drawer at a time  **NEEDS CLAUDE**

Think of the shared database as a filing cabinet with a drawer per kind of
thing: tasks, calendar, equipment, field logs, inventory, the map.

I do **one drawer at a time**, start to finish, and the farm uses it for a week
before the next. All at once would be a single enormous change that's hard to
undo if something's wrong.

Order: **tasks** (busiest, so it proves the pattern), then calendar, equipment,
field log, inventory, and the map last.

For each drawer:

1. **I build it** — the drawer and the rules about who can open it. You see
   nothing yet; the app carries on as normal
2. **YOU: everybody opens the app once, on wifi.** Whatever is on each person's
   phone gets copied up. **Anyone who skips this loses what they entered.** This
   is the step that can actually lose data
3. **I flip the switch** — the shared copy becomes the real one
4. **We watch it for a week**

---

## Step 11 — Things I already know will need care  **NEEDS CLAUDE**

Recording these so they aren't rediscovered the hard way:

- **Stock counts** get recorded as movements in and out, not one number people
  overwrite. Two people restocking at once would otherwise silently lose one
- **Two people finishing the same job** — first one wins, the second is told,
  rather than one silently overwriting the other
- **Who can see what** keys off a person's **lab**, not their job title
- **The field log stays one entry per plot** — a mow across three plots is three
  records, because that's how the farm reports work. Easy to accidentally
  collapse into one
- **The older backend plan in your repo has a mistake** and only covers the map.
  Don't follow it — I've written what's actually needed in `docs/BACKEND-STEPS.md`

---

## If something breaks

**Nobody can log in** → Step 1. Email/Password sign-in is almost certainly off.

**"Unauthorized domain"** → Step 2.

**The map is blank after a push** → a file called `.nojekyll` went missing from
the project. Tell me; it's a one-line fix and there's a note in
`docs/LAUNCH.md`.

**Changes don't show up** → wait ten minutes, then fully close the app and
reopen. If an update bar appears in the app, tap Reload.

**Someone lost their records** → restore their last backup: sign in as App
Manager → Roster → Hand off the app → Data & backup.

---

## The short version

| # | What | Who |
|---|---|---|
| 1 | Turn on Email/Password in Firebase | YOU |
| 2 | Add `turffarmutk.github.io` to authorized domains | YOU |
| 3 | Set up Brevo email so password links can be sent | YOU |
| 4 | Download the service-account key, keep it OUT of the project folder | YOU |
| 5 | Run the account script — dry run first | YOU |
| 6 | Commit and push in GitHub Desktop | YOU |
| 7 | Set your own password via the link; test, including offline | YOU |
| 8 | Tell the crew to do the same; nothing to hand out | YOU |
| 9 | Decide backups and budget with Bill | YOU |
| 10 | Shared database, one drawer at a time | CLAUDE |
| 11 | Everyone opens the app on wifi before each switch-over | YOU |
