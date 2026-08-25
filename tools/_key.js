/*
 * Finding the master key, so nobody has to type a path.
 *
 * WHY THIS FILE EXISTS
 * The admin scripts need the service-account JSON from Step 4 of
 * docs/GO-LIVE-MANUAL.md. The documented way to point at it is an environment
 * variable, and every set of instructions that mentions one has to write
 * something like /path/to/serviceAccount.json — which is an invitation to
 * paste it literally and get "no such file or directory /path". That happened
 * on 2026-08-25, and it will happen to whoever takes this on next, because the
 * person running these scripts is not a programmer and should not have to be.
 *
 * So: look in the three places the manual tells you to put it, and use it if
 * there is exactly one and it really is a key for THIS project.
 *
 * NEVER inside the repo. The repo is public, and a key committed to it is the
 * one mistake that cannot be undone quietly — the whole project has to be
 * re-keyed. .gitignore has a rule too; this is the belt to that pair of braces.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* Every plausible key on this machine, outside the repo, for this project. */
function findKeys(root, appPath) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const dirs = [path.join(home, 'Desktop'), path.join(home, 'Downloads'), home];

  let wanted = '';
  try {
    const app = fs.readFileSync(appPath, 'utf8');
    wanted = (app.match(/projectId:\s*'([^']+)'/) || [])[1] || '';
  } catch (e) { /* no app file: accept any project's key rather than none */ }

  const hits = [];
  for (const d of dirs) {
    let names = [];
    try { names = fs.readdirSync(d); } catch (e) { continue; }
    for (const n of names) {
      if (!/\.json$/i.test(n)) continue;
      const full = path.join(d, n);
      if (path.resolve(full).startsWith(path.resolve(root))) continue;   /* never in the repo */
      let j = null;
      try {
        const raw = fs.readFileSync(full, 'utf8');
        if (raw.length > 20000) continue;                                 /* a key is a few KB */
        j = JSON.parse(raw);
      } catch (e) { continue; }
      if (!j || j.type !== 'service_account' || !j.private_key) continue;
      if (wanted && j.project_id && j.project_id !== wanted) continue;
      if (hits.indexOf(full) < 0) hits.push(full);
    }
  }
  return hits;
}

/*
 * Settle on one key, or explain what to do instead. Returns the path, or null
 * having already printed why and NOT exited — the caller decides that, because
 * a dry run does not need a key at all.
 *
 * An explicit GOOGLE_APPLICATION_CREDENTIALS always wins, EXCEPT when it points
 * at nothing: somebody who pasted the example path verbatim gets told that is
 * what happened, rather than a raw ENOENT with "/path" in it.
 */
function resolveKey(opts) {
  const root = opts.root, appPath = opts.appPath, cmd = opts.cmd || 'the script';
  const given = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

  if (given) {
    if (path.resolve(given).startsWith(path.resolve(root))) {
      console.error('The master key is inside the project folder:\n  ' + given +
                    '\nMove it out — that folder is published to a public website.');
      return null;
    }
    if (fs.existsSync(given) && fs.statSync(given).isFile()) return given;

    const looksLikeThePlaceholder = /\/path\/to\/|serviceAccount\.json$/i.test(given) &&
                                    !fs.existsSync(given);
    console.error('There is no file at:\n  ' + given);
    if (looksLikeThePlaceholder) {
      console.error('\nThat looks like the EXAMPLE path rather than a real one — the\n' +
                    '"/path/to/..." part was a stand-in for wherever your key actually is.');
    }
    console.error('\nEasier: run it without GOOGLE_APPLICATION_CREDENTIALS at all —\n' +
                  '  ' + cmd + '\n' +
                  'and it will find the key itself, as long as that .json file is on your\n' +
                  'Desktop, in Downloads, or in your home folder.');
    return null;
  }

  const hits = findKeys(root, appPath);
  if (hits.length === 1) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = hits[0];
    console.log('Using the master key found at: ' + hits[0] + '\n');
    return hits[0];
  }
  if (hits.length > 1) {
    console.error('Found more than one master key, so I will not guess which:');
    hits.forEach(h => console.error('  ' + h));
    console.error('\nRun it again naming the one you mean:\n' +
                  '  GOOGLE_APPLICATION_CREDENTIALS="' + hits[0] + '" \\\n    ' + cmd);
    return null;
  }
  console.error('Could not find the master key for this project.\n\n' +
                'It is the .json file from Step 4 of docs/GO-LIVE-MANUAL.md:\n' +
                '  Firebase console -> gear icon -> Project settings ->\n' +
                '  Service accounts -> Generate new private key\n\n' +
                'Put it on your Desktop (NOT in the project folder — that folder is\n' +
                'published to a public website) and run this again.');
  return null;
}

module.exports = { findKeys, resolveKey };
