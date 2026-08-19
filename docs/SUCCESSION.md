# UT Turf Farm App — Succession Plan

**Written:** August 14, 2026
**Author:** Dillon McCallum
**Horizon:** ~3 years to handoff
**Assumed successor:** somebody who can open a link and click buttons, and who will never open a code editor.

---

## The one rule

> **If a routine change to the farm requires editing the source file, that change stops happening the day I leave.**

Everything below follows from that sentence. Read it before adding any feature. The question to ask about each new thing is not "does this work?" but **"who changes this in 2030, and can they?"**

There is a second, quieter version of the same rule:

> **If an account, key, or file lives under a personal student address or on one
> persons laptop, it disappears when that account is deprovisioned.**

That is the failure mode that kills most of these apps, and it kills them silently — months later, when nobody remembers who set it up.

---

## What breaks today if I vanished tomorrow

An honest inventory, as of this writing. None of this is a criticism of the build; it's the normal state of an app that has been growing fast on one person's machine.

| # | Failure | Why it's fatal | Severity |
|---|---|---|---|
| 1 | **The app is a file on my laptop.** `UT-TurfFarm-App.html` (1.4 MB) + `farm-geo.js` must sit beside each other. | Nobody can "go to the app." Distribution is me emailing a file. When the laptop goes, the newest version goes. | Fatal |
| 2 | **All data lives in `localStorage`.** `ut_prefs`, `ut_weekcrew`, `ut_rain`, `ut_sched_*`, timeclock punches, map shape edits. | Data is per-browser, per-device. Nothing is shared, nothing is backed up, clearing site data erases the farm's records. Two people never see the same thing. | Fatal |
| 3 | **The farm's real data is hardcoded in the source.** `ROSTER`, `EQUIP`, `PLOTS`, `PLOT_INFO`, `TASK_SEED`, `TEMPLATES`, the spray constants (`BOOM_CHARGE_GAL`, nozzle rates), alley definitions. | Hiring a new tech, buying a mower, changing a spray rate, re-splitting a plot — every one of these is a code edit today. A non-technical successor cannot do any of them. | Fatal |
| 4 | **No version control.** `Documents/GitHub/UT-TurfFarm-app` is not a git repo. History is ~45 `.bak` files with informal tags (`pre-boommix`, `pre-gravelalleys`). | There is no record of why anything changed, no way to undo a bad change safely, and no way for a future maintainer (human or AI) to see the shape of the code's evolution. Already caused one near-loss on 2026-08-14 when two sessions edited the file concurrently. | High |
| 5 | **No named owner and nobody to call.** No institutional account, no budget line, no service agreement. | When it breaks in year 4, the farm's only option is to stop using it. | High |
| 6 | **Third-party CDNs load at runtime** — unpkg, cdnjs, jsdelivr, Google Fonts. | Any of those changing a URL or going away breaks the app for everyone at once, with no local fallback and nobody able to diagnose it. | Medium |
| 7 | **No export.** There is no button that turns the app's state into a file a human can read. | If the app dies, the data dies with it. This is also the thing that makes every other risk survivable, which is why it's the first thing to build. | High |

---

## The strategy in one paragraph

Spend the next three years converting **every piece of farm knowledge currently living in the source file or in my head into either (a) data in a shared database that an admin screen can edit, or (b) a written document.** In parallel, move ownership of every account, file, and URL from me to the farm. The Supabase port already scoped in `Editable-Map-Backend-Plan.md` is not a feature — it is the handoff. Then, a year before I go, stop and prove the whole thing works by disappearing for two weeks and refusing to answer questions.

---

## Phase A — Ownership and safety net (do this now, weeks not months)

Cheap, boring, and it protects everything built afterward. None of it requires the app to change.

### A1. Create a farm-owned identity

Ask whoever runs the farm for a departmental account — something like `turffarm@utk.edu`, or a UT service account, or at minimum a Google account owned by the farm with the manager holding the recovery info. **Every** account created from here forward is created under it:

- the GitHub organization/repo
- the hosting (GitHub Pages, Netlify, Cloudflare Pages — all free tiers)
- Supabase, when the time comes
- any domain name
- any API key

Add my personal account as a *collaborator*, never as the owner. Write the credentials into the farm's existing password practice (a shared 1Password/Bitwarden vault, or a sealed printed sheet in the manager's file cabinet — a low-tech answer is fine, no answer is not).

**The test:** if my UT account were deleted tonight, would anything stop working or become unrecoverable? Keep working on A1 until the answer is no.

### A2. Put it in git, under the farm org

```
cd ~/Documents/GitHub/UT-TurfFarm-app
git init
```

Then, before the first commit:

- Add a `.gitignore` for `node_modules/`, `.DS_Store`, `*.bak`, `.fuse_hidden*`, `testperm.tmp`.
- Move the ~45 `.bak` files into an `archive/` folder outside the repo, or delete them once the first commits exist. They are the version control being replaced.
- First commit is the current working state. Every commit after that gets a message written for a stranger: what changed and *why*, not `update`.

Push to the farm-owned GitHub org, private for now. The value here isn't for the successor — they will never see GitHub. It's so that a developer hired in 2031 can read three years of intent in an afternoon, and so that concurrent edits stop being dangerous.

### A3. Build export before building anything else

One button, in App Admin: **Export all data**. It writes a single `.json` file with every `ut_*` key, plus a folder of plain CSVs — roster, tasks, timeclock, spray log, field log, rain log, plot info. And a matching **Import** that reads the JSON back.

This does three jobs at once:

1. It makes today's `localStorage` data survivable — a weekly manual export to the farm's Drive is a real backup.
2. It's the migration path into Supabase, so building it now is not throwaway work.
3. It is the **break-glass exit**: if in 2032 the app dies and nobody can fix it, the farm still has readable CSVs of its own records. An app you can walk away from with your data intact is one people trust.

### A4. Vendor the CDN dependencies

Download Leaflet, Turf, and the fonts into a local `vendor/` folder and point the app at them. One afternoon, and it removes an entire class of "it just stopped working one Tuesday" failure that nobody left behind could diagnose.

---

## Phase B — Make it a URL, not a file (next 3–6 months)

Publish the app to a stable web address off the farm-owned repo — GitHub Pages is free and deploys on push.

Why this matters more than it sounds:

- "Go to turffarm.utk.edu" is a sentence a new seasonal hire can follow. "Get the HTML file from Dillon and keep `farm-geo.js` next to it" is not.
- Updates stop being a distribution problem. Push, and everyone has the new version.
- It works on phones in the field without anyone installing anything.
- Printing that URL on a laminated card in the shop is a durable handoff artifact.

Print the URL somewhere physical. Sticker on the tractor dash, card by the shop computer. Paper outlives people.

### Status: done 2026-08-19 — and the two things that will bite later

Live at **https://turffarmutk.github.io/**, published from the farm-owned
`turffarmutk` account. Full procedure in `LAUNCH.md`.

**1. The push token expires.** Pushing uses a fine-grained personal access token
(GitHub has not accepted passwords for git since 2021). When it expires, every
push fails with `Invalid username or token. Password authentication is not
supported` — a message that says nothing about expiry, and which will read like
the app is broken. Whoever hits it will not guess.

| | |
|---|---|
| Token owner | `turffarmutk` |
| Scope | `turffarmutk.github.io` only, Contents: Read and write |
| **Expires** | **_______________** ← fill this in, and set a calendar reminder a month before |
| To renew | Settings → Developer settings → Personal access tokens → Fine-grained tokens → regenerate, then push once and paste the new token |

An SSH key is the alternative that never expires. If this repo outlives a
couple of token renewals, switch to one.

**2. There is still no login.** Anyone with the URL can open the app and act as
anyone on the roster, including the Farm Manager — the sign-in screen is a
person picker with no password. What a stranger would see is limited (the roster
names and the farm's reference data; no actual records, because those live in
each phone's own storage), but it is not nothing. Treat the URL as a key: fine
to hand to the crew, not to post publicly. Closing this is the next piece of
work, and `roster-emails.local.json` — git-ignored, never published — is the
list of who should be let in.

---

## Phase C — The Supabase port (year 1–2, the big one)

`Editable-Map-Backend-Plan.md` already has the stack, the schema, and the role matrix, and Phase 0 groundwork is done (timestamps, roster ids, collision-safe ids, escaping, the geo split). Build it. Three notes specific to *handoff*, not to the port itself:

**C1. Own the Supabase project under the farm account.** Free tier is fine for this scale, but it must not be on my email. Document what happens if billing ever needs to move.

**C2. Roles must be assignable from inside the app.** If promoting a new grad student to manager requires me, the permission system is a liability rather than a safety feature. There should be one screen where a manager adds a person, sets their role, and deactivates a departed one — and the departure case matters more than the arrival case, because nobody remembers to clean up.

**C3. Automate the backup.** A scheduled job that drops the CSV export into the farm's Drive nightly. Configure it to email the manager if it hasn't run in 7 days — a silent backup is not a backup, and nobody will check a dashboard.

**Honest tradeoff:** a hosted backend adds a maintenance surface a static file doesn't have — an account that can lapse, a service that can change its terms. I judge it worth it because shared, real-time, multi-user data is the actual requirement and a static file genuinely cannot do it. A3 and C3 are what make that judgment safe: if Supabase ever becomes a problem, the farm still holds its own data in a readable form and can move.

---

## Phase D — Get the farm out of the source file (year 2, continuous)

This is the phase that decides whether the app survives. Work through the hardcoded constants one at a time and give each one an admin screen. Rough order, most-likely-to-change first:

| Data | Currently | Who needs to change it | How often |
|---|---|---|---|
| `ROSTER` / `STUDENTS` | hardcoded | manager | every semester |
| Crew schedule, semesters | `ut_sched_*` | manager | every semester |
| `EQUIP`, maintenance intervals | hardcoded | manager/tech | a few times a year |
| Task templates, `TASK_SEED` | hardcoded | manager | a few times a year |
| Spray products, rates, `BOOM_CHARGE_GAL` | hardcoded | tech/manager | when a label or nozzle changes |
| `PLOT_INFO`, cultivars, plant history | hardcoded | grad/faculty | per trial |
| Plot geometry & splits | `PLOTS_DATA` + localStorage | grad | per trial |
| Trials | `TRIALS` | grad/faculty | per season |
| Mowers, cut heights, irrigation blocks | hardcoded | tech | seasonally |

**The rule to apply while building each one:** anything a farm employee would reasonably want to change without asking permission belongs in the database with an edit screen. Anything that is genuinely structural — the map projection, the spray math itself — can stay in code, and gets documented instead.

**A discipline to hold for three years:** every feature added from here is a feature someone must maintain. With a non-technical successor, the right bias is fewer moving parts and fewer integrations. When choosing between a clever automation and a simple screen someone can operate, pick the screen. Prefer things that fail visibly and locally over things that fail silently in a service nobody knew existed.

---

## Phase E — The two documents (year 2–3, but start the log now)

### E1. Farm Operator Guide — for the successor

Written for someone with no technical background, illustrated with screenshots, kept short. Sections:

- What this app is for, and what it replaced
- How to get to it, on desktop and on a phone
- The weekly rhythm: assigning crew, logging work, the timeclock, closing the week
- **How to add a person, change a spray rate, add equipment** — the things they will actually need
- Where the data lives and how to export it (the A3 button)
- **What to do when something looks wrong**: export first, then who to contact
- What is *not* in the app and never was

Deliver it as a PDF *and* leave a printed copy in the shop.

### E2. Maintainer Handbook — for a stranger with an AI assistant

The realistic future is that the farm's next change gets made by someone non-technical sitting down with Claude, or by a contractor hired for a week. Write for that reader:

- Architecture: one HTML file + `farm-geo.js`, Leaflet/Turf, Supabase tables, why each choice was made
- **The decisions that look like bugs but aren't.** These are the things nobody can reconstruct: AZ06 CAFS surrounds are grass and mowable while AZ11 CAFS alleyways are gravel, filtered out of the alley-mow job but sprayable for pesticides and never fertilizer; the SF4↔SF9 and SF5↔SF10 plot-info swap where mowing data intentionally did *not* move; CAFS alley polygons are a synthetic grid so area must never be read from them; `ut_prefs` is keyed by roster pid because preferences are per-person not per-role; there is deliberately no task priority field because Bill sets priority by rank order. There are more of these in my head — **write them down as you hit them, in a running `DECISIONS.md`, starting today.** In three years you will not remember which of them were principled.
- How to run the tests (`npm test` — eight harnesses; keep them green, add one per feature)
- The release procedure: branch, test, push, verify on the live URL
- Where every account and key lives, and who holds them
- Known weak points and what you'd fix first

Set the test suite to run automatically on every push (GitHub Actions, ~20 lines of YAML). A future editor who breaks something gets a red X instead of a silent failure discovered three weeks later in the field.

### E3. Start `DECISIONS.md` today

Not year 2. Today. It costs a line per change and it is the single highest-value document in this plan, because it captures the only thing that is truly unrecoverable: why.

---

## Phase F — Prove it (final year)

Documentation nobody has tested is fiction.

**F1. The two-week silence.** A year out, hand the operator guide to the person most likely to inherit it and go quiet for two weeks — no questions answered, including the easy ones. Every question they *would* have asked is a gap. Fix the gaps, repeat in six months.

**F2. The cold-start test.** Have someone who has never seen the project try to make one small change using only the maintainer handbook and an AI assistant. Whatever they get stuck on is the real state of the documentation.

**F3. Name the owner in writing.** Not "the farm" — a person, in a job description, with the credentials and a stated expectation that they hold them. An unowned system is an abandoned system, and this step is administrative rather than technical, which means it is the one most likely to be skipped.

**F4. Line up the "who do I call."** Options, roughly in order of durability: a small annual maintenance agreement with a local developer; a standing relationship with UT IT or a departmental developer; or, at minimum, a documented statement that the app is unsupported and the farm's fallback is the exported CSVs. Any of these is fine. Silence on the question is not — it converts a small problem in 2031 into the end of the app.

---

## Timeline

| When | What | Done? |
|---|---|---|
| Now | Farm-owned account; git repo under it; `.gitignore`; archive the `.bak` files | ☐ |
| Now | Export/import buttons (A3) | ☐ |
| Now | Start `DECISIONS.md` | ☐ |
| Weeks | Vendor the CDN dependencies | ☐ |
| 3–6 mo | Live URL; printed in the shop | ☐ |
| 6–18 mo | Supabase port; farm-owned project; in-app role management | ☐ |
| 12–18 mo | Nightly automated backup with a staleness alert | ☐ |
| Yr 2 | Admin screens for roster, schedule, equipment, spray products, templates | ☐ |
| Yr 2 | Admin screens for plots, trials, mowing/irrigation | ☐ |
| Yr 2–3 | CI running the test suite on every push | ☐ |
| Yr 3 | Operator Guide (PDF + printed) | ☐ |
| Yr 3 | Maintainer Handbook | ☐ |
| Yr 3 | Two-week silence test; cold-start test | ☐ |
| Before leaving | Named owner; credentials transferred; support arrangement in writing | ☐ |

---

## The three sentences to keep

1. **Nothing routine should require editing code** — hardcoded farm data is a deadline, not a detail.
2. **Nothing important should be owned by my student account** — accounts outlive intentions, but not enrollment.
3. **Write down why, not just what** — code and data can be re-derived from the app; reasoning cannot be re-derived from anything.
