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
  console.log('No passwords are set or printed by this script — each person chooses');
  console.log('their own through the emailed link on the sign-in screen.');
  process.exit(0);
}

/* --- do it -------------------------------------------------------------- */

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const auth = admin.auth();

(async function () {
  const handout = [];
  for (const p of plan) {
    let user = null;
    try { user = await auth.getUserByEmail(p.email); } catch (e) { user = null; }

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
      await auth.updateUser(user.uid, { displayName: p.name, disabled: !p.active });
      console.log('updated  ' + p.pid + '  ' + p.email + '  (password left alone)');
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

  console.log('\nDone. A person only picks up a changed claim on their next sign-in,');
  console.log('so anyone already signed in should sign out and back in.');
  process.exit(0);
})().catch(e => { console.error('\nFailed: ' + (e && e.message)); process.exit(1); });
