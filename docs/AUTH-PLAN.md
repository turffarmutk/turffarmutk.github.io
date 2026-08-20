# Adding a real login

Plan, written 2026-08-20. Nothing here is built yet. Read this before any code
lands, because two of the decisions below are expensive to reverse.

---

## What this does and does not solve

**Solves:** nobody can be somebody else. Today the sign-in screen is a list of
23 names and tapping one makes you that person — including Bill and the App
Manager. After this, you sign in with your own email and password, and the
app's idea of who you are comes from a token the server issued, not from a tap.

**Does not solve, on its own:** the app file stays publicly downloadable. GitHub
Pages serves `UT-TurfFarm-App.html` to anyone who asks, so a stranger can still
read the roster names and the farm's reference data straight out of the source.
A login gates *use of the app*, not *access to the file*.

That gap closes properly in Stage 2, when the farm's records move into the
database — because then the file contains no records at all, only the code to
fetch them, and the fetching is what requires a login.

If hiding the file itself matters sooner, that is a hosting change, not an app
change (Cloudflare Pages + Access would do it). Worth revisiting, but it is a
different job from this one.

---

## The decision: Supabase Auth, email and password

Chosen because the farm is already committed to Supabase for the data port, and
using two identity systems would be worse than either. `sessionSet(pid)` was
built in Phase 0 as the single seam this replaces, so the front end is already
shaped for it.

**Free tier is comfortable:** 50,000 monthly active users against our 23, 500 MB
database, unlimited API requests. One caveat with teeth — **a free project
pauses after one week of inactivity.** A farm app that goes quiet between
seasons will hit that. It is a dashboard click to resume, but a paused project
means nobody can log in, which for a field app is an outage. Either accept it
with a documented "if nobody can log in, resume the project" note, or move to
Pro ($25/mo) when the farm can carry it.

### Why email + password, and not the person picker

The picker is being replaced by a plain email and password form. That is the
right call for a second reason beyond familiarity: a picker has to list all 23
names to an unauthenticated visitor. The names are already in the file today, so
the picker was not *creating* the leak — but once Stage 2 moves records out of
the file, a plain login form leaks nothing at all, while a picker would still be
publishing the roster on the front door.

---

## How identity survives the change

This is the part that has to be right, because 48 role checks, `taskIsFor()`,
`myLab()` and `isMe()` all depend on `SESSION.pid` being a roster id like `p09`.

**The crew's email addresses are deliberately not in the app** (see
`DECISIONS.md`), so the app cannot look up "which person is
`rgibbon2@vols.utk.edu`". It does not need to:

> **Each Supabase account carries its roster id in its user metadata.** On
> successful sign-in the app reads `user.app_metadata.pid` and calls
> `sessionSet(pid)`. Everything downstream is unchanged.

That keeps the privacy work intact — no addresses re-enter the published file —
and it makes the roster id the single join key between the auth system and the
app, which is exactly what Stage 2's access rules will key on.

`roster-emails.local.json` is the list used to create those accounts. That is
what it has been kept for.

### The App Manager

Today "App Manager" is a separate entry on the sign-in screen that sets
`currentRole = 'admin'`. It cannot stay a separate login, because it is a post,
not a person. It becomes a **flag in user metadata** (`is_app_admin`) on the
real person who currently holds it. Handing the app over then means moving one
flag, which fits how the hand-off screen already works.

---

## Offline: the constraint that shapes everything

This is a field app on a farm with dead spots. **A login must never be the
reason someone cannot record a mow.**

Rules for the implementation:

1. **Boot must not block on the network.** If a valid session is already stored
   on the device, the app opens immediately and does not wait for the server to
   confirm anything.
2. **An expired token, offline, does not sign you out.** Supabase refreshes
   tokens in the background; with no signal that refresh fails. The app must
   treat that as "carry on with the last known identity", not "throw the user
   out into a login screen they cannot complete".
3. **First sign-in on a device requires signal.** Unavoidable — there is nothing
   stored yet to trust. This belongs in the rollout instructions: get everyone
   signed in once, on wifi, before they need the app in the field.
4. **Signing out must be deliberate.** It clears the stored session, so it
   should warn that signing in again needs a connection.

There are known reports of Supabase clients mishandling a cold start with no
network, so this needs testing with the network genuinely cut, not simulated —
the same way `tools/test-pwa.js --browser` already tests the offline shell.

---

## Running the accounts, without a code edit

The whole point of the succession plan is that routine changes must not require
touching this file. Account admin is squarely routine: people arrive, leave, and
forget passwords every season.

**Creating the 23 accounts:** as an admin, with passwords set and email already
confirmed, so no confirmation emails are involved. Hand out initial passwords in
person and have people change them.

**The email limit is the trap here.** Supabase's built-in email service is
capped at **2 messages per hour** and is explicitly not for production. A
password-reset flow built on it will not work for a crew of 23 — the third
person to forget their password in an afternoon gets nothing.

Two ways out, and the farm should pick one before rollout:

- **No reset emails at all.** Bill or the app manager resets a password from the
  Supabase dashboard and tells the person. No email service to own, and it is a
  code-free task a successor can do from a web page. Fine at 23 people.
- **Custom SMTP** (Resend, Postmark, SES). Proper self-service reset, at the
  cost of one more account for the farm to own — and one more thing that must
  not be registered to a personal address.

Recommendation: start with the first, add the second only if resets become a
nuisance.

---

## Stages

### Stage 1 — the login (this piece of work)

- A Supabase project owned by the farm account.
- 23 accounts created, each carrying its `pid` in metadata.
- `supabase-js` vendored into `vendor/` by `tools/build-vendor.js` — nothing
  loads from a CDN at boot, and that rule does not get an exception.
- The sign-in screen becomes email + password. `sessionSet()` is driven by the
  token, and the person picker and `signInAdmin()` are retired.
- Session persists on the device; offline behaviour per the rules above.
- Sign out, and change-your-own-password.
- A new harness, `tools/test-auth.js`, covering: no session means no app; a
  stored session opens the app with no network; an expired token offline does
  not sign you out; the pid from the token drives the role.

**Records still live on each device after Stage 1.** Nothing about where the
data lives changes yet. This stage buys trustworthy identity, which is the thing
Stage 2 needs in order to be safe.

### Stage 2 — the data (planned separately)

Records move into Postgres with row-level security. Already flagged in the
readiness review and still true:

- **Access rules key on the person's lab, not their role.** The existing
  `Editable-Map-Backend-Plan.md` writes its policies against the five roles;
  that needs amending.
- **Inventory must become a movement ledger, not a scalar.** `it.qty += add` is
  a read-modify-write and two simultaneous restocks lose one.
- **The map namespace does three jobs** — plots, facilities, and aggregate rows
  with no polygon — and the planned `plot` table assumes they are all plots.
- Render functions stay synchronous. Hydrate at boot, mutate in place, re-render.

---

## What Dillon needs to do before I can build Stage 1

1. Create a Supabase project **owned by the farm account**, not a personal one.
2. Send me the **project URL** and the **anon key**. Both are public by design —
   they are safe to commit, and safe to paste here.
3. Decide the password-reset route above.

The service-role key is the one that must never be shared or committed. I will
not ask for it, and it must not go in this repo.

---

## Open questions

- **Who holds the Supabase account?** Same problem as the GitHub account, same
  answer: the farm, not a student address.
- **What happens to someone who leaves?** Disabling their auth account is the
  new "remove from roster". The roster screen and the auth system will need to
  agree; today the roster has an `active` flag that nothing enforces.
- **Do we require a password change on first login?** Recommended, but it is
  extra UI and can wait.
- **Project pausing.** Decide now whether the farm accepts a possible outage
  after a quiet week, or budgets for Pro.
