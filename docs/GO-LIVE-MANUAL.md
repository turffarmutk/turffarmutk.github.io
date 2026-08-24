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
for real use — 23 people signing up would take a day and a half. So the app
sends through the farm's own Gmail account instead.

**Why Gmail and not an email service.** The obvious move is a service like
Brevo, and that was what this step used to say. It does not work here. Those
services have to *prove* an email really came from you, and they do that by
adding records to the settings of the domain it is sent from — the part after
the @. Send from `turffarmutk@gmail.com` and that domain is `gmail.com`, which
belongs to Google, not to the farm. Nothing you can do makes that box go green,
and Gmail and Outlook increasingly bin mail that fails the check. Sending
through Google itself sidesteps the whole thing: the mail genuinely is from that
account, so it passes every check with nothing to configure.

The limit is **500 emails a day**, against a crew of 23. Not a concern.

**A. Turn on 2-Step Verification** on the farm Google account — Google will not
issue the password below without it.

1. Sign in as **turffarmutk@gmail.com** (not your student account)
2. Go to <https://myaccount.google.com/security> → **2-Step Verification** →
   follow it through. A phone number is fine
3. Save the backup codes it offers somewhere the farm keeps things. If the
   farm ever loses access to this account, nobody can log into the app

**B. Make an app password.** This is a one-off 16-letter password that lets the
app send mail as this account, and nothing else. It cannot read the mailbox and
you can revoke it any time without touching the real password.

1. Go to <https://myaccount.google.com/apppasswords>
2. Name it `Turf Farm app` and click **Create**
3. Google shows 16 letters in four blocks. **Copy them now** — it never shows
   them again. Type them into Firebase below **without the spaces**
4. Treat it like a key to the mailbox: don't email it, don't paste it into a
   chat, don't put it in the project folder

**C. Tell Firebase to use it.**

1. Firebase console → **Authentication → Templates** → **SMTP settings**
   (sometimes behind a "Customize" or pencil icon), enter:
   - Host `smtp.gmail.com`
   - Port `587`
   - Username `turffarmutk@gmail.com`
   - Password: the 16 letters from B, no spaces
   - Sender address: `turffarmutk@gmail.com`
2. Save

**The sender address must be exactly the same account as the username.** Google
will not send mail claiming to be from anyone else, and the failure is silent —
the app says the link is on its way and nothing arrives.

*Check:* Firebase → Authentication → Templates → **Password reset** → send
yourself a test if offered. Otherwise you'll confirm it for real in Step 7.

**If you already set up Brevo:** nothing to undo. Replacing the SMTP settings
above is enough, and the Brevo account can simply be left alone or closed.

### When the farm gets a university address

Changing where the app sends from is five boxes in the Firebase console and
takes about two minutes. No code, no rebuild, nobody signs out. So this is not a
decision you are locked into.

**But do not plan on the app sending through a UT Outlook account.** Microsoft
is switching off the old username-and-password way of letting a program send
mail — off by default at the end of 2026, gone during 2027 — and Firebase only
knows that old way. Many universities have already turned it off. It may look
like it works for a while and then stop, which is the worst way for a login
system to fail.

Keep the two things separate in your head:

- **The farm's mailbox** — where people write to the farm, who owns the account.
  That should absolutely become a university address.
- **The machine that sends automated password links.** That is a different job,
  and it is fine, permanently, for it to stay the Gmail account. It costs
  nothing and nothing about it expires.

**So what to ask OIT for.** A mailbox on its own does not help the app. The
thing worth asking for is **a web address the farm controls — say
`turffarm.utk.edu` — or a willingness to add two or three DNS records for the
farm.** That is what would let the app send as a genuine UT address through a
proper email service. If OIT can only offer a mailbox, that is still worth
having; just leave this step exactly as it is.

The rule underneath all of this, if you want one sentence: **the address on the
"from" line has to belong to whoever actually sends the mail.** Every dead end
in this step has been a version of breaking that rule.

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
   Step 3** — check junk first, then that the sender address in Firebase is
   exactly `turffarmutk@gmail.com` and the app password was typed without spaces
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

**The password link never arrives** → in order: junk folder; does Firebase →
Authentication → **Users** actually list the person (no account, no email);
is the sender address in Step 3 exactly the same Gmail account as the username;
was the app password typed without its spaces. If the app now shows a message
naming a reason, send me that wording — it is the fastest way in.

**"App passwords" isn't there on the Google account** → 2-Step Verification is
not on yet. Step 3A.

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
| 3 | Point Firebase at the farm Gmail so password links can be sent | YOU |
| 4 | Download the service-account key, keep it OUT of the project folder | YOU |
| 5 | Run the account script — dry run first | YOU |
| 6 | Commit and push in GitHub Desktop | YOU |
| 7 | Set your own password via the link; test, including offline | YOU |
| 8 | Tell the crew to do the same; nothing to hand out | YOU |
| 9 | Decide backups and budget with Bill | YOU |
| 10 | Shared database, one drawer at a time | CLAUDE |
| 11 | Everyone opens the app on wifi before each switch-over | YOU |
