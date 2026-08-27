/*
 * IS THE RULES FILE THAT IS PUBLISHED THE SAME AS THE ONE IN THIS FOLDER?
 * ----------------------------------------------------------------------
 *
 *   node tools/check-rules-live.js        (or: npm run check:rules)
 *
 * CHANGES NOTHING. It downloads the rules that are actually live on the
 * database right now, and compares them line by line with firestore.rules
 * in this folder.
 *
 * WHY THIS EXISTS
 * The rules are installed by pasting them into the Firebase console
 * (docs/PUBLISH-THE-RULES.md) -- a deliberate choice, because a successor
 * can do it with clicks. The cost of that choice is that nothing checks the
 * paste: half a file, an old copy, or a paste into the wrong project all
 * look exactly like success. `npm test` proves the file in this folder is
 * RIGHT; only this proves it is what the database is actually using.
 *
 * It also prints when the live copy was published, which answers "did my
 * last paste go through" on its own.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const RULES = path.join(ROOT, 'firestore.rules');

/* Answerable from this machine first; the key check comes last. Same order as
   the other scripts, and for the same reason -- see tools/_key.js. */
if (!fs.existsSync(RULES)) {
  console.error('There is no firestore.rules in this folder, so there is nothing to compare.');
  process.exit(1);
}
let PROJECT = '';
try {
  PROJECT = (fs.readFileSync(APP, 'utf8').match(/projectId:\s*'([^']+)'/) || [])[1] || '';
} catch (e) { /* fall through */ }
if (!PROJECT) {
  console.error('Could not find the project name in UT-TurfFarm-App.html (the projectId line).');
  process.exit(1);
}

if (!require('./_key').resolveKey({
      root: ROOT, appPath: APP, cmd: 'node tools/check-rules-live.js' })) {
  process.exit(1);
}

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const app = initializeApp({ credential: applicationDefault() });

function get(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: 'Bearer ' + token } }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('the server said ' + res.statusCode + ': ' + body.slice(0, 400)));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async function () {
  const tok = await app.options.credential.getAccessToken();
  const token = tok.access_token;

  console.log('Project: ' + PROJECT + '\n');

  const rel = await get('https://firebaserules.googleapis.com/v1/projects/' +
                        encodeURIComponent(PROJECT) + '/releases/cloud.firestore', token);
  if (!rel.rulesetName) {
    console.log('THERE ARE NO RULES PUBLISHED ON THIS DATABASE AT ALL.');
    console.log('Nothing will save for anybody. See docs/PUBLISH-THE-RULES.md.');
    process.exit(0);
  }

  const set = await get('https://firebaserules.googleapis.com/v1/' + rel.rulesetName, token);
  const when = set.createTime || rel.createTime || '(unknown)';
  const files = (set.source && set.source.files) || [];
  const live = files.map(f => f.content).join('\n');

  console.log('The live rules were published: ' + when);
  console.log('');

  const mine = fs.readFileSync(RULES, 'utf8');
  const norm = t => t.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');

  if (norm(live) === norm(mine)) {
    console.log('THEY MATCH. The database is using exactly the rules in this folder.');
    process.exit(0);
  }

  console.log('THEY DO NOT MATCH. The database is NOT using the rules in this folder.\n');

  const a = norm(mine).split('\n');
  const b = norm(live).split('\n');
  console.log('  this folder: ' + a.length + ' lines');
  console.log('  published:   ' + b.length + ' lines');

  let first = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { first = i; break; }
  }
  if (first >= 0) {
    console.log('\nFirst line that differs is line ' + (first + 1) + ':');
    console.log('  this folder: ' + (a[first] === undefined ? '(the file ends here)' : a[first]));
    console.log('  published:   ' + (b[first] === undefined ? '(the file ends here)' : b[first]));
  }

  /* Which named rules exist in one and not the other -- the difference that
     actually changes who may do what. */
  const fns = t => (t.match(/function\s+([A-Za-z0-9_]+)\s*\(/g) || [])
                     .map(m => m.replace(/function\s+/, '').replace(/\s*\($/, ''));
  const mineF = fns(mine), liveF = fns(live);
  const missing = mineF.filter(f => liveF.indexOf(f) < 0);
  const extra = liveF.filter(f => mineF.indexOf(f) < 0);
  if (missing.length) console.log('\nIn this folder but NOT published: ' + missing.join(', '));
  if (extra.length) console.log('\nPublished but not in this folder: ' + extra.join(', '));

  console.log('\nFix: open docs/PUBLISH-THE-RULES.md and paste firestore.rules in again,');
  console.log('whole file, top to bottom, then press Publish and run this again.');
  process.exit(2);
})().catch(function (e) {
  console.error('\nCould not read the live rules: ' + (e && e.message || e));
  console.error('\nIf it says 403, the master key does not have permission to read rules;');
  console.error('that is a Firebase console setting, and the rest of the app is unaffected.');
  process.exit(1);
});
