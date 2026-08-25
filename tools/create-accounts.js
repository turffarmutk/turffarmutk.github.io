/*
 * Creates (or updates) one Firebase account per person on the roster, and
 * stamps each one with the roster id the app reads off the token.
 *
 * WHY THE ROSTER ID IS A CUSTOM CLAIM
 * The app cannot look up "which person is rgibbon2@vols.utk.edu" — the crew's
 * addresses were deliberately taken out of the app and are not going back (see
 * docs/DECISIONS.md). So the id travels ON the token instead. A custom claim is
 * set here, by an admin, cannot be edited by the account holder, and is cached
 * with the token — which means it is readable in a field with no signal.
 *
 * WHAT YOU NEED
 *   1. A service-account key JSON from the Firebase console:
 *        Project settings -> Service accounts -> Generate new private key
 *      That file is the master key to the project. It must NEVER be committed,
 *      pasted into a chat, or put anywhere near the app. Keep it outside the
 *      repo — the repo is public.
 *   2. roster-emails.local.json — the git-ignored list of who gets an account.
 *
 * RUN
 *   npm install firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/outside/the/repo/serviceAccount.json \
 *     node tools/create-accounts.js --dry-run
 *   ...then again without --dry-run once the plan looks right.
 *
 * Nobody's password is set here, and none is ever printed. Each account is
 * created with a throwaway random string, and the person chooses their real
 * password through the emailed link on the sign-in screen — which is also what
 * proves they own that mailbox. Requires custom SMTP to be configured in the
 * Firebase console; the built-in mail sends 2 messages an hour and will not do.
 *
 * Safe to run more than once: existing accounts are updated rather than
 * duplicated, and existing passwords are never touched.
 *
 * AND SAFE WHEN SOMEBODY'S ADDRESS CHANGES. People move from @vols.utk.edu to
 * @utk.edu, and addresses get typed wrong. Fix the address in
 * roster-emails.local.json and run this again: it finds the account by the
 * ROSTER ID on its token, not by the address, so it renames the account that
 * already exists rather than making a second one. The person keeps their
 * password and their history; only what they type to sign in changes.
 *
 * Looking people up by address was the earlier behaviour and it was quietly
 * wrong: a corrected address created a NEW account, left the old one live, and
 * the person ended up owning two - one of which nobody could see was stale.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROSTER = path.join(ROOT, 'roster-emails.local.json');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const DRY = process.argv.indexOf('--dry-run') >= 0;

/* --- guard rails ------------------------------------------------------- */

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !DRY) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service-account JSON.\n' +
                'Keep that file OUTSIDE this repo — the repo is public.');
  process.exit(1);
}
const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (cred && path.resolve(cred).startsWith(path.resolve(ROOT))) {
  console.error('The service-account key is inside the repo: ' + cred + '\n' +
                'Move it elsewhere before running this. It must never be committed.');
  process.exit(1);
}
if (!fs.existsSync(ROSTER)) {
  console.error('Missing ' + ROSTER + '\nThat file holds the crew addresses and is git-ignored on purpose.');
  process.exit(1);
}

/* --- who gets an account ----------------------------------------------- */

const people = JSON.parse(fs.readFileSync(ROSTER, 'utf8')).filter(p => p.email);

/* The app is the source of truth for who is still on the roster and who holds
   the App Manager post — read it rather than keeping a second list in step. */
const html = fs.readFileSync(APP, 'utf8');
const active = (function () {
  const out = {};
  const re = /\{id:'(p\d+)',[^}]*?active:(true|false)/g;
  let m; while ((m = re.exec(html))) out[m[1]] = (m[2] === 'true');
  return out;
})();
const adminMatch = html.match(/var APP_ADMIN=\{[^}]*?pid:'(p\d+)'/);
const adminPid = adminMatch ? adminMatch[1] : null;

/* A placeholder password that nobody is ever told, and nobody ever types.
   Firebase requires a password to create an account, so each one gets a long
   random string that is generated, used once, and thrown away. The crew set
   their own on first use via the emailed link, which is the step that actually
   proves they own the mailbox. Nothing is ever handed out on paper. */
function firstPassword() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = require('crypto').randomBytes(20);
  let s = ''; for (let i = 0; i < 20; i++) s += abc[b[i] % abc.length];
  return s;
}

const plan = people.map(p => ({
  pid: p.id,
  name: p.name,
  email: String(p.email).trim().toLowerCase(),
  active: active[p.id] !== false,
  admin: p.id === adminPid,
  password: firstPassword()
}));

console.log('Roster accounts to create or update: ' + plan.length +
            (adminPid ? ('   (app admin: ' + adminPid + ')') : '   (no app admin found)'));
plan.forEach(p => console.log(
  '  ' + p.pid + '  ' + p.email.padEnd(30) +
  (p.active ? '' : ' [INACTIVE - will be disabled]') + (p.admin ? ' [app admin]' : '')));

if (DRY) {
  console.log('\n--dry-run: nothing was sent to Firebase.');
  console.log('No passwords are set or printed by this script, and none is ever changed.');
  console.log('\nA dry run cannot see the project, so it CANNOT show you which addresses');
  console.log('have changed since last time — only the real run can. It will print any');
  console.log('it renames, and it renames rather than duplicating.');
  process.exit(0);
}

/* --- do it -------------------------------------------------------------- */

/* firebase-admin v13+ dropped the old `admin.credential` / `admin.auth()`
 * namespace. Import from the subpaths instead — this is the current API and
 * the one the Firebase docs show. Do not "simplify" it back. */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault() });
const auth = getAuth();

(async function () {
  /* Everybody already in the project, indexed by the roster id on their token.
     This is what makes a changed address safe. */
  const byPid = {};
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach(u => {
      const pid = u.customClaims && u.customClaims.pid;
      if (pid) byPid[pid] = u;
    });
    pageToken = page.pageToken;
  } while (pageToken);

  const handout = [], renamed = [], clashes = [];
  for (const p of plan) {
    /* By roster id first. Only fall back to the address for somebody who has
       an account but no claim yet - which can only be an account made before
       this script existed. */
    let user = byPid[p.pid] || null;
    if (!user) {
      try { user = await auth.getUserByEmail(p.email); } catch (e) { user = null; }
    }

    if (!user) {
      user = await auth.createUser({
        email: p.email,
        emailVerified: true,      /* no confirmation mail — see the note above */
        password: p.password,
        displayName: p.name,
        disabled: !p.active
      });
      handout.push({ name: p.name, email: p.email });
      console.log('created  ' + p.pid + '  ' + p.email + '  (they set their own password)');
    } else {
      const was = String(user.email || '').toLowerCase();
      const patch = { displayName: p.name, disabled: !p.active };
      const moving = was && was !== p.email;
      if (moving) { patch.email = p.email; patch.emailVerified = true; }
      try {
        await auth.updateUser(user.uid, patch);
      } catch (e) {
        /* The one failure worth naming: the new address is already an account
           of its own, so there are two and this script must not pick. */
        if (e && String(e.code || '').indexOf('email-already-exists') >= 0) {
          clashes.push({ pid: p.pid, was: was, now: p.email });
          console.log('SKIPPED  ' + p.pid + '  ' + was + ' -> ' + p.email +
                      '  (that address is already another account)');
          continue;
        }
        throw e;
      }
      if (moving) {
        renamed.push({ pid: p.pid, name: p.name, was: was, now: p.email });
        console.log('RENAMED  ' + p.pid + '  ' + was + '  ->  ' + p.email +
                    '  (same account, same password)');
      } else {
        console.log('updated  ' + p.pid + '  ' + p.email + '  (password left alone)');
      }
    }

    /* The claim is the whole point of this script. */
    await auth.setCustomUserClaims(user.uid, { pid: p.pid, app_admin: !!p.admin });
  }

  if (handout.length) {
    console.log('\n' + handout.length + ' new account(s). NOTHING to hand out and no passwords to keep.');
    console.log('Tell each person: open the app, type your farm email, and tap');
    console.log('"First time here, or forgotten your password?". They get a link,');
    console.log('choose their own password, and sign in.');
  }

  if (renamed.length) {
    console.log('\n' + renamed.length + ' address(es) changed:');
    renamed.forEach(r => console.log('  ' + r.name + '  ' + r.was + '  ->  ' + r.now));
    console.log('Tell each of them the address they sign in with has changed.');
    console.log('Their password and everything they have recorded are untouched.');
  }
  if (clashes.length) {
    console.log('\n' + clashes.length + ' address(es) could NOT be changed, because the new');
    console.log('address already belongs to a separate account:');
    clashes.forEach(c => console.log('  ' + c.pid + '  ' + c.was + '  ->  ' + c.now));
    console.log('\nTwo accounts exist for one person and only you can say which to keep.');
    console.log('In Firebase console -> Authentication -> Users, delete the one that is');
    console.log('NOT wanted, then run this again.');
  }

  console.log('\nDone. A person only picks up a changed claim on their next sign-in,');
  console.log('so anyone already signed in should sign out and back in.');
  process.exit(0);
})().catch(e => { console.error('\nFailed: ' + (e && e.message)); process.exit(1); });
