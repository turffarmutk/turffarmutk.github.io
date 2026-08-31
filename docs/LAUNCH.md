# Launch runbook — putting the app on the web

Written 2026-08-17, for the first publish. Follow it top to bottom; the order
matters in two places and those are called out.

Everything in the repo is already prepared. What is left is the part that needs
your GitHub account and your Terminal, which no tooling here can do for you.

The farm account is **`turffarmutk`**, so the repo is
`turffarmutk.github.io` and the live URL will be `https://turffarmutk.github.io/`.

---

## Read this first: there is no login yet

**Anyone with the URL can open the app and act as anyone on the roster**,
including Bill and the App Manager. The sign-in screen is a person picker with
no password — deliberately, as a placeholder for real authentication. Publishing
does not change that; it just means the picker is reachable from the internet
instead of only from a file on a laptop.

A real password login is planned and is the last piece of work before this is
properly locked down. Until then, be clear-eyed about what going live means.

**What a stranger with the link would actually see:**

- the 23 crew names, their roles and labs
- the farm's reference data baked into the file — plots, equipment, mowers,
  spray rates, the seeded example tasks

**What they would _not_ see, and could not damage:**

- any real records. Tasks, field logs, trial results, inventory counts and map
  edits all live in browser storage on each individual device. There is no
  shared server yet, so a visitor gets a blank slate, not the farm's work — and
  nothing they type can reach anyone else's phone.

The crew's **email addresses are not in the published files** and neither is any
personal contact detail. That was done on purpose (see `DECISIONS.md`), and it
is why `roster-emails.local.json` exists.

**Mitigations already in place:** the URL is not linked from anywhere, every
page carries `noindex,nofollow`, and `robots.txt` disallows crawlers — so the
site should not turn up in a search for somebody's name. That is obscurity, not
security. Treat the URL as you would a door key: fine to give to the crew, not
something to post publicly.

If that trade is not acceptable for your farm, stop here and do the login work
first rather than publishing and retrofitting.

---

## Before you start: two files

**Keep `roster-emails.local.json`.** It holds the 23 crew addresses and is
deliberately git-ignored, so it will **not** be pushed to GitHub and **not** be
in anything GitHub backs up. It is the allowlist for the login you are going to
add — whichever way that is built, it starts from this list. Put a copy
somewhere the farm owns, not just on your laptop.

**`_to_delete/`** is scratch this environment could not remove. Git-ignored and
safe to delete by hand. Do that now so it stops following you.

---

## Step 1 — Create the repository

On github.com, signed in as the farm account:

1. **New repository**
2. Name it **exactly** `turffarmutk.github.io` — the account name, then
   `.github.io`. The name *is* the configuration: match it and the site is
   served from the origin root, get it wrong and you get a project site at a
   longer URL where `robots.txt` silently stops working.
3. **Do not clone it, and do not open it in a desktop Git client that offers
   to.** You already have every file locally. Cloning the empty repo *into*
   `UT-TurfFarm-app/` puts a second `.git` inside the project, and `git add -A`
   then aborts with `does not have a commit checked out` — taking the whole
   commit with it. The folder on your disk does not need to match the repo
   name; only the name on GitHub matters.
4. **Public.** Not optional: GitHub Pages does not serve from a private repo on
   the Free plan. (Even on a paid plan the published site is reachable by anyone
   with the URL — access-controlled Pages is Enterprise-only.) This is why the
   crew's addresses came out of the files and the history.
5. Do **not** add a README, .gitignore or licence. The repo must start empty or
   the first push is rejected.

---

## Step 2 — Reset the history and push

In Terminal, one at a time. **Read the notes under the block first.**

```bash
cd ~/Documents/GitHub/UT-TurfFarm-app

# Start history clean. The three original commits contained the crew's
# addresses, and on a public repo `git log -p` would show them forever.
# ALREADY DONE on 2026-08-19 — this repo now starts from zero commits. Skip
# these three lines unless you are setting up somewhere new.
rm -f .git/index.lock
rm -rf .git
git init -b main

# If a clone of the GitHub repo was made inside this folder, remove it first —
# a nested .git makes the next line abort with "does not have a commit
# checked out", and it aborts the WHOLE add, so nothing gets committed.
rm -rf turffarmutk.github.io
git prune && git gc --prune=now

git add -A
git commit -m "UT Turf Farm app: tasks, crew, equipment, inventory, trials and the farm map

Installable offline-first PWA. Single HTML file plus farm-geo.js, with
Leaflet, Geoman, Turf and the fonts vendored so nothing loads from a CDN.
Service worker precaches 44 files and is generated by tools/build-sw.js.
14 test harnesses, 796 checks.

No authentication yet — the sign-in screen is a person picker and is the
seam a real login slots behind. Crew email addresses are deliberately not
in this repo; each person fills in their own under More -> Roster, which
stays on their device. See DECISIONS.md."

git remote add origin https://github.com/turffarmutk/turffarmutk.github.io.git
git push -u origin main
```

`rm -rf .git` is the destructive line, and it has already been run once. It was
safe for one reason: this repo had never been pushed anywhere, so there was
nothing to disagree with and nobody to disrupt. The three commit messages it
discarded are preserved verbatim in `DECISIONS.md` under "Git history starts at
one commit". Verified afterwards: zero reachable commits, and none of the
orphaned objects left behind contain a crew address.

### Pushing with GitHub Desktop (the recommended route)

This is the path to prefer, and the one to hand to a successor. Desktop signs
in with OAuth, so there is **no access token and no expiry date to track** —
which removes the single most likely way this repo becomes unpushable in three
years.

1. **File → Add Local Repository…** → choose this folder → **Add repository**.
   **Do not clone.** If Desktop offers to clone `turffarmutk.github.io`, decline
   it: cloning drops a second `.git` inside the project and breaks committing
   (see the troubleshooting section). This folder is already a repo with the
   remote set; Desktop only needs pointing at it.
2. **Settings → Accounts** — sign in as `turffarmutk`.
3. **Settings → Git** — set the email to the account's **noreply** address, from
   github.com → Settings → Emails → *Keep my email addresses private*. A commit
   authored from a personal address is public forever and contradicts the rule
   at the top of `SUCCESSION.md`.
4. Write a summary, **Commit to main**, then **Push origin**.

To fold changes into the previous commit rather than stacking a new one — worth
doing when the last commit has not been pushed: **History** → right-click the
commit → **Amend commit…** → **Begin Amend** → tick the files → **Amend last
commit**.

### Pushing from Terminal instead

GitHub disabled password authentication for git operations in 2021, so the
account password will never work. The push fails with
`Invalid username or token. Password authentication is not supported`, which
does not say what to do about it. You need a **personal access token**.

Signed in on github.com as `turffarmutk`:

1. **Settings → Developer settings → Personal access tokens → Fine-grained
   tokens → Generate new token**
2. **Resource owner:** `turffarmutk`
3. **Repository access:** Only select repositories → `turffarmutk.github.io`
4. **Permissions:** Repository permissions → **Contents: Read and write**
   (that is the whole list — this token should not be able to do anything else)
5. Set an expiry and **write the date in `SUCCESSION.md`**
6. Generate and copy it immediately; it is shown once

Then, so it is only pasted once rather than on every push:

```bash
git config --global credential.helper osxkeychain
git push -u origin main
```

At the prompt the username is `turffarmutk` and the **password is the token**.
Nothing appears as you paste it; that is normal.

**When that token expires, pushes fail with the exact same message**, and
nothing in the error hints at the cause. That is the trap to know about. An SSH
key is the alternative that never expires, at the cost of managing a key file.

### Committing as the farm, not as a person

Check with `git log -1 --format='%an <%ae>'`. A commit authored from a personal
address puts that address permanently in a public repo, and it contradicts the
rule at the top of `SUCCESSION.md` about things living under personal accounts.
Set it per-repo, using the account's noreply address from
**Settings → Emails → Keep my email addresses private**:

```bash
git config user.name "UT Turf Farm"
git config user.email "<id>+turffarmutk@users.noreply.github.com"
git commit --amend --reset-author --no-edit   # only before the first push
```

**Check before pushing** — the first should print `1`, the second nothing:

```bash
git log --oneline | wc -l
git log -p | grep -iE '[a-z0-9._%+-]+@(vols\.)?utk\.edu' | grep -v 'name@utk.edu\|you@utk.edu\|turffarm@utk.edu\|example\.edu\|geoman\.io\|w8r\.name'
```

If the second prints an address, check it against `roster-emails.local.json`
before doing anything. `tools/test-bugreport.js` deliberately contains invented
fixtures — `holder@utk.edu`, `successor@utk.edu`, `somebody@utk.edu`,
`rose@example.edu` — which are nobody, and `turffarm@utk.edu` is a departmental
address rather than a person. Only a match against the real 23 is a problem.

---

## Step 3 — Turn on Pages

In the new repo: **Settings → Pages**.

- **Source:** Deploy from a branch
- **Branch:** `main`, folder **`/ (root)`**
- **Save**

First build takes a minute or two; a "Your site is live at…" banner appears when
it is done. Your URL is:

```
https://turffarmutk.github.io/
```

That is the address to give the crew. It ends in a slash with nothing after it —
`index.html` forwards to the app, which is why the bare folder URL works at all.
GitHub Pages does not list directories; without that file it would be a 404.

---

## Step 4 — Check it actually worked

In a browser that has never opened this app:

1. Go to `https://turffarmutk.github.io/` — it should land on the app.
2. **Open the map.** The single most important check. If it is blank or the
   plots are missing, `.nojekyll` did not survive the commit — Jekyll strips
   `/vendor` and takes Leaflet, Geoman, Turf and the fonts with it. Confirm with
   `git ls-files | grep nojekyll`; it must print `.nojekyll`.
3. Turn off wifi and reload. The app should still open. If not, the service
   worker did not install — again, almost always `.nojekyll`.
4. Visit `https://turffarmutk.github.io/robots.txt` — it should show the
   `Disallow: /` file. This only works because the repo is named
   `turffarmutk.github.io`.

A new `sw.js` can take up to ten minutes to be picked up after any future push,
because Pages serves everything with a ten-minute cache. Normal, not a failure.

---

## Step 5 — Switch on bug reports

**Report a technical bug** works now, but reports queue on the phone instead of
sending until this is done.

1. Go to **web3forms.com**. Enter the address reports should land in — a
   farm-owned address, not a student one. They email back an **access key**.
2. In the app: **More → Farm settings → Bug reports**.
3. Paste the key into **Web3Forms access key** → **Save**.
4. Leave **Send reports to** blank. Delivery is routed by the key to whatever
   inbox you registered; that box is only a label shown on screen.
5. File a test report from **More → Report a technical bug** and confirm it
   arrives.

Do this once, on one phone. The key is shared with the whole farm through the
same channel that carries the sprayer numbers, so every other phone picks it up
by itself and nobody else has to type anything. Any reports already waiting on
those phones go out the moment it lands.

Free tier is 250 reports a month, far more than this farm will file. A copy of
every report stays on the phone that filed it, and anything that fails to send
retries by itself when signal returns.

---

## Step 6 — Get the crew onto it

**Install, do not bookmark.** On iPhone this genuinely matters: iOS clears a
website's stored data after about seven days without a visit, but not for a site
added to the Home Screen. For a farm app that goes quiet between seasons, a
bookmark will lose data.

- **iPhone / iPad:** open the URL in **Safari** (not Chrome) → Share → **Add to
  Home Screen**.
- **Android:** open in Chrome → menu → **Install app**.

Then each person: **More → Roster →** their own name → fill in their **Email** →
Save. Only needed so a reply to their bug report reaches them; the app works
fine without it. Those entries stay on their device and are never published.

Worth saying out loud when you hand out the link: there is no password yet, so
the link is the key, and anyone can sign in as anyone. Ask them not to share it
outside the farm.

---

## Step 7 — Move existing data across (only if there is any)

**Do this before anyone starts using the new URL.**

Browser storage is per-origin. `file:///Users/...` and `https://turffarmutk.github.io`
are two different worlds, so **nothing carries over on its own** — not tasks,
not field logs, not map edits, not preferences.

For each device holding real records in the old file:// copy:

1. Open the **old** copy. Sign in as **App Manager**.
2. Profile → **Roster** → **Hand off the app** → **Data & backup** →
   **Download a backup**.
3. Open the **new** URL. Sign in as App Manager again.
4. Same screen → **Restore from a backup** → pick the file → confirm.

If the only real data is on your laptop, this is a two-minute job done once. If
nobody has entered anything yet, skip the step entirely.

Keep exporting a backup on a schedule after launch, to somewhere the farm owns.
Until the backend work lands there is still no server, and the browser on each
phone holds the only copy of what was entered there.

---

## Still to come, in order

1. **A real login.** The last piece before the app is properly closed. The
   sign-in screen is already the right shape for it — `sessionSet()` is the
   single call that changes — and `roster-emails.local.json` is the list of who
   should be let in.
2. **The backend port (Supabase).** Ends the "each phone holds the only copy"
   problem, and is the natural place for that login to live.

---

## Afterwards: making a change

```bash
cd ~/Documents/GitHub/UT-TurfFarm-app
# edit UT-TurfFarm-App.html or farm-geo.js
npm run sw     # REQUIRED after touching the app, farm-geo.js, vendor/ or icons/
npm test       # 14 harnesses, 796 checks
git add -A && git commit -m "what changed and why" && git push
```

`npm run sw` is not optional. The service worker's version is a hash of the
files it caches; skip it and every installed phone keeps serving the old copy
with no visible symptom. `npm test` fails if you forget.

---

## If something goes wrong

**Map is blank / app dead offline** — `.nojekyll` is missing.
`git ls-files | grep nojekyll`, and if it prints nothing:
`touch .nojekyll && git add -f .nojekyll && git commit -m "Restore .nojekyll" && git push`

**Changes do not show up** — wait ten minutes for Pages' cache, then close every
tab. If an update banner appears in the app, tap Reload.

**Bug reports are not arriving** — More → Farm settings → Bug reports shows
"Waiting to send" if they are queued. Check the key is pasted correctly and the
monthly allowance is not spent. If it works on your phone but the crew's reports
never appear, check More → Shared database says the farm settings drawer is
connected — that is what carries the key to their phones.

**`git add` says "does not have a commit checked out"** — there is a nested
repository inside the project folder, almost always the GitHub repo cloned in by
mistake, usually by accepting GitHub Desktop's offer to clone it. Use **Add
Local Repository**, never Clone. It aborts the entire `add`, so nothing gets committed. Delete the
nested folder (`rm -rf <name>`) and re-run `git add -A`.

**`git init` says "Reinitialized existing Git repository"** — harmless if
`git log --oneline` then reports *does not have any commits yet*. It means
`rm -rf .git` emptied the directory and git recreated the shell. Confirm with
`git rev-list --all --count`, which must print `0`, then `git gc --prune=now` to
drop any orphaned objects.

**Someone lost their data** — restore their last backup (Step 7). If there is no
backup, it is gone; that is the situation the backend port exists to end.
