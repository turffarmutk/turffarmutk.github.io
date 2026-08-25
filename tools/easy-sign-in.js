/*
 * The other half of the EASY_SIGN_IN switch in UT-TurfFarm-App.html.
 *
 * WHAT THIS IS FOR
 * The password-set links sent to @utk.edu addresses are not arriving, so for
 * now the app signs people in on their email address alone and supplies one
 * shared password behind the scenes. This script is what puts that shared
 * password onto the accounts - and, just as importantly, what takes it off
 * again afterwards.
 *
 * TWO COMMANDS, AND YOU WILL USE BOTH
 *
 *   node tools/easy-sign-in.js on
 *       Sets the shared password on every roster account. Do this once, after
 *       setting EASY_SIGN_IN = true in the app.
 *
 *   node tools/easy-sign-in.js off
 *       Puts a fresh random password that NOBODY knows on every account. Do
 *       this the moment email is working again, straight after setting
 *       EASY_SIGN_IN = false in the app. Everyone then taps "First time here,
 *       or forgotten your password?" once and chooses their own.
 *
 * Turning the switch off in the app WITHOUT running "off" here leaves the
 * public shared password sitting on 23 live accounts. That is the mistake this
 * script exists to prevent, so it says so loudly at the end of every run.
 *
 * The shared password is READ OUT OF THE APP FILE rather than written down
 * twice. There is only ever one of it, and it cannot drift.
 *
 * WHAT YOU NEED - same as tools/create-accounts.js
 *   1. The service-account key JSON from Step 4, kept OUTSIDE this repo (the
 *      repo is public). It is the master key to the project. This script looks
 *      for it on the Desktop, in Downloads and in the home folder.
 *   2. roster-emails.local.json, the git-ignored list of who has an account.
 *
 * RUN
 *   node tools/easy-sign-in.js on --dry-run     (a rehearsal, changes nothing)
 *   node tools/easy-sign-in.js on               (for real)
 *
 * It finds the master key itself, as long as the .json file from Step 4 is on
 * your Desktop, in Downloads, or in your home folder. If you keep it somewhere
 * else, say so:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *     node tools/easy-sign-in.js on
 *
 * Anyone who has changed their own password since is simply set back to the
 * shared one by "on" - they can still get in, which is the whole point.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROSTER = path.join(ROOT, 'roster-emails.local.json');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');

const MODE = (process.argv[2] || '').toLowerCase();
const DRY = process.argv.indexOf('--dry-run') >= 0;

/* --- guard rails ------------------------------------------------------- */

if (MODE !== 'on' && MODE !== 'off') {
  console.error('Say which way round:\n' +
                '  node tools/easy-sign-in.js on    (put the shared password on every account)\n' +
                '  node tools/easy-sign-in.js off   (take it off again - nobody knows the new one)\n' +
                'Add --dry-run to see the plan without changing anything.');
  process.exit(1);
}
/* Finding the master key WITHOUT having to type a path.
   GOOGLE_APPLICATION_CREDENTIALS still wins if it is set. Otherwise look in the
   handful of places Step 4 of the go-live manual tells you to put the file -
   Desktop, Downloads, home folder - and use it only if there is exactly ONE
   and it really is a key for THIS project. Never inside the repo: the repo is
   public, and a key in it is the one mistake that cannot be undone quietly.

   This exists because the person running it in three years' time will not know
   what an environment variable is. If it finds nothing, it says where to look
   rather than printing a shell incantation. */
function findKey() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const dirs = [path.join(home, 'Desktop'), path.join(home, 'Downloads'), home];
  /* Read the app here rather than using the `html` further down: this runs
     before that line, and a const cannot be read before it is set. */
  let appSrc = ''; try { appSrc = fs.readFileSync(APP, 'utf8'); } catch (e) {}
  const wanted = (appSrc.match(/projectId:\s*'([^']+)'/) || [])[1] || '';
  const hits = [];
  for (const d of dirs) {
    let names = [];
    try { names = fs.readdirSync(d); } catch (e) { continue; }
    for (const n of names) {
      if (!/\.json$/i.test(n)) continue;
      const full = path.join(d, n);
      if (path.resolve(full).startsWith(path.resolve(ROOT))) continue;
      let j = null;
      try {
        const raw = fs.readFileSync(full, 'utf8');
        if (raw.length > 20000) continue;          /* a key is a few KB */
        j = JSON.parse(raw);
      } catch (e) { continue; }
      if (!j || j.type !== 'service_account' || !j.private_key) continue;
      if (wanted && j.project_id && j.project_id !== wanted) continue;
      if (hits.indexOf(full) < 0) hits.push(full);
    }
  }
  return hits;
}

let cred = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (!cred && !DRY) {
  const hits = findKey();
  if (hits.length === 1) {
    cred = hits[0];
    process.env.GOOGLE_APPLICATION_CREDENTIALS = cred;
    console.log('Using the master key found at: ' + cred + '\n');
  } else if (hits.length > 1) {
    console.error('Found more than one master key, so I will not guess which:');
    hits.forEach(h => console.error('  ' + h));
    console.error('\nRun it again with the one you mean, like this:\n' +
                  '  GOOGLE_APPLICATION_CREDENTIALS="' + hits[0] + '" \\\n' +
                  '    node tools/easy-sign-in.js ' + MODE);
    process.exit(1);
  } else {
    console.error('Could not find the master key for this project.\n\n' +
                  'It is the .json file from Step 4 of docs/GO-LIVE-MANUAL.md:\n' +
                  '  Firebase console -> gear icon -> Project settings ->\n' +
                  '  Service accounts -> Generate new private key\n\n' +
                  'Put it on your Desktop (NOT in the project folder - that folder\n' +
                  'is published to a public website) and run this again.');
    process.exit(1);
  }
}
if (cred && path.resolve(cred).startsWith(path.resolve(ROOT))) {
  console.error('The service-account key is inside the repo: ' + cred + '\n' +
                'Move it elsewhere before running this. It must never be committed.');
  process.exit(1);
}
if (!fs.existsSync(ROSTER)) {
  console.error('Missing ' + ROSTER + '\nThat file holds the crew addresses and is git-ignored on purpose.');
  process.exit(1);
}

/* --- the app file is the source of truth for both halves ---------------- */

const html = fs.readFileSync(APP, 'utf8');

const swMatch = html.match(/var EASY_SIGN_IN\s*=\s*(true|false)\s*;/);
const pwMatch = html.match(/var EASY_PASSWORD\s*=\s*'([^']+)'\s*;/);
if (!swMatch || !pwMatch) {
  console.error('Could not find EASY_SIGN_IN / EASY_PASSWORD in ' + path.basename(APP) + '.\n' +
                'Either they were renamed, or this is the wrong copy of the app.');
  process.exit(1);
}
const switchIsOn = swMatch[1] === 'true';
const shared = pwMatch[1];

/* Saying it out loud beats a silent mismatch. The two halves have to agree or
   people either cannot get in, or get in when they should not. */
if (MODE === 'on' && !switchIsOn) {
  console.error('EASY_SIGN_IN is FALSE in the app, but you asked to put the shared\n' +
                'password on. Set it to true first, or nobody will use it.');
  process.exit(1);
}
if (MODE === 'off' && switchIsOn) {
  console.error('EASY_SIGN_IN is still TRUE in the app. Set it to false FIRST, then\n' +
                'run this - otherwise the app keeps trying a password that no longer\n' +
                'works and the whole crew is locked out.');
  process.exit(1);
}

/* --- who --------------------------------------------------------------- */

const people = JSON.parse(fs.readFileSync(ROSTER, 'utf8')).filter(p => p.email);

/* Same random-string maker as create-accounts.js: generated, used once by
   Firebase, and never printed or kept. */
function unknowablePassword() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = require('crypto').randomBytes(20);
  let s = ''; for (let i = 0; i < 20; i++) s += abc[b[i] % abc.length];
  return s;
}

const plan = people.map(p => ({
  pid: p.id,
  name: p.name,
  email: String(p.email).trim().toLowerCase(),
  password: MODE === 'on' ? shared : unknowablePassword()
}));

console.log(MODE === 'on'
  ? 'Putting the SHARED password on ' + plan.length + ' account(s).'
  : 'Putting a FRESH password nobody knows on ' + plan.length + ' account(s).');
plan.forEach(p => console.log('  ' + p.pid + '  ' + p.email));

if (DRY) {
  console.log('\n--dry-run: nothing was sent to Firebase.');
  process.exit(0);
}

/* --- do it -------------------------------------------------------------- */

/* firebase-admin v13+ dropped the old `admin.credential` / `admin.auth()`
 * namespace. Import from the subpaths instead. Do not "simplify" it back. */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault() });
const auth = getAuth();

(async function () {
  let done = 0, missing = [];
  for (const p of plan) {
    let user = null;
    try { user = await auth.getUserByEmail(p.email); } catch (e) { user = null; }
    if (!user) {
      missing.push(p.pid + '  ' + p.email);
      console.log('SKIPPED  ' + p.pid + '  ' + p.email + '  (no account - run create-accounts.js)');
      continue;
    }
    await auth.updateUser(user.uid, { password: p.password });
    done++;
    console.log('set      ' + p.pid + '  ' + p.email);
  }

  if (missing.length) {
    console.log('\n' + missing.length + ' address(es) had no account:');
    missing.forEach(m => console.log('  ' + m));
    console.log('Run tools/create-accounts.js, then run this again.');
  }

  console.log('\n' + done + ' account(s) changed.');
  if (MODE === 'on') {
    console.log('\nEmail-only sign-in is now live. Tell the crew: open the app, type');
    console.log('your farm email address, tap Sign in. No password.');
    console.log('\nAnyone already signed in stays signed in. Anyone who was signed OUT');
    console.log('and had set their own password will find it no longer works - that is');
    console.log('expected, they just type their email now.');
    console.log('\nDO NOT LEAVE THIS ON. The shared password is readable by anyone who');
    console.log('opens the app file. When farm email works: set EASY_SIGN_IN = false in');
    console.log('the app, then run  node tools/easy-sign-in.js off');
  } else {
    console.log('\nThe shared password is gone. Nobody - including you - knows any of');
    console.log('these passwords now, which is the point.');
    console.log('\nTell the crew: open the app, type your farm email, and tap');
    console.log('"First time here, or forgotten your password?". They get a link,');
    console.log('choose their own password, and sign in. Test one address yourself');
    console.log('BEFORE telling everyone, so you find out if mail is still broken.');
  }
  process.exit(0);
})().catch(e => { console.error('\nFailed: ' + (e && e.message)); process.exit(1); });
