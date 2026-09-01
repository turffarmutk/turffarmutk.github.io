/*
 * PUT BACK PEOPLE THE DATABASE IS MISSING
 * ----------------------------------------------------------------------
 *
 *   node tools/fix-roster.js            shows what it would do, changes nothing
 *   node tools/fix-roster.js --write    actually writes them
 *
 * WHY THIS EXISTS
 * On 2026-09-01 the database accepted 19 of the farm's 24 people and refused
 * the other five, in the middle of one burst of sends, for no reason any rule
 * in firestore.rules can express. Those five then STAYED missing, because a
 * drawer marks somebody "already sent" before it knows the write worked and
 * never puts them back if it did not. Five people had an empty app and no
 * screen anywhere said why.
 *
 * The roster button in the app cannot repair that. It sends everybody as one
 * all-or-nothing batch, so while any single person in it is being refused,
 * the whole batch is thrown away and NOBODY is written. Pressing it harder
 * does nothing at all.
 *
 * This script uses the master key, which is not subject to the permission
 * rules, so it gets through whatever the rules were objecting to.
 *
 * WHAT IT WILL AND WILL NOT DO
 * It only ever ADDS people who are missing. It never deletes anybody and
 * never overwrites a record that is already there — the copy in the database
 * may have been edited on somebody's phone since, and that edit is newer and
 * more right than the built-in list this reads from.
 *
 * Deleting is the thing to avoid here: every phone drops a person the instant
 * their record disappears, so a wipe-and-resend leaves the whole farm with an
 * empty roster in between, and anybody standing in a field is thrown out of
 * their own screens.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const PEOPLE_FILE = path.join(ROOT, 'app-03-people.js');

const WRITE = process.argv.includes('--write');

/* The starting list of people, read out of the app rather than typed again
   here. It is RST_SEED in app-03-people.js — no longer how somebody reaches a
   phone (the database is), but still the one machine-readable record of who
   the farm's original people are and what their role and lab is. */
function readSeed() {
  const src = fs.readFileSync(PEOPLE_FILE, 'utf8');
  const m = /var\s+RST_SEED\s*=\s*(\[[\s\S]*?\n\s*\]);/.exec(src);
  if (!m) return null;
  try { return vm.runInNewContext('(' + m[1] + ')'); } catch (e) { return null; }
}

/* MUST MATCH rstDoc() in app-02-fieldlog-sync.js — the same nine fields, and
   NOT the email address, which lives one row per person in `accounts`. If the
   two ever drift, every phone would see the record written here as different
   from its own and push its version straight back. The check further down
   catches that by comparing against a person already in the database, rather
   than trusting this list to have stayed in step. */
const ROSTER_V = 2;
function rosterDoc(p) {
  if (!p || !p.id || !/^p\d+$/.test(String(p.id))) return null;
  if (!p.role) return null;
  return {
    id: String(p.id),
    first: String(p.first || ''),
    last: String(p.last || ''),
    pron: String(p.pron || ''),
    role: String(p.role),
    lab: String(p.lab || ''),
    active: p.active !== false,
    grants: (p.grants || []).map(String),
    v: ROSTER_V
  };
}

const seed = readSeed();
if (!seed || !seed.length) {
  console.error('Could not read the list of people out of app-03-people.js.');
  console.error('Nothing has been changed.');
  process.exit(1);
}

if (!require('./_key').resolveKey({
      root: ROOT, appPath: APP, cmd: 'node tools/fix-roster.js' })) {
  process.exit(1);
}

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

(async function () {
  const snap = await db.collection('roster').get();
  const have = {};
  snap.forEach(function (d) { have[d.id] = d.data() || {}; });

  console.log('');
  console.log('The database is holding ' + snap.size + ' people.');
  console.log('The app\'s starting list has ' + seed.length + '.');
  console.log('');

  const missing = seed.filter(function (p) { return p && p.id && !have[p.id]; });
  if (!missing.length) {
    console.log('Nobody is missing. Nothing to do.');
    process.exit(0);
  }

  /* THE SHAPE CHECK. The people already in the database were written by the
     app itself, so they are the truth about what a record should look like.
     If what this script builds does not have exactly the same fields, writing
     it would leave every phone thinking the record is wrong and pushing its
     own version back — so stop instead, and say so. */
  const ref = Object.keys(have).map(function (id) { return have[id]; })[0];
  if (ref) {
    const theirs = Object.keys(ref).sort().join(',');
    const ours = Object.keys(rosterDoc(missing[0]) || {}).sort().join(',');
    if (theirs !== ours) {
      console.error('STOPPING. The records already in the database do not have the');
      console.error('same fields as the ones this script builds, so writing them');
      console.error('would make every phone disagree with the database.');
      console.error('');
      console.error('  already there:  ' + theirs);
      console.error('  this script:    ' + ours);
      console.error('');
      console.error('Fix: make rosterDoc() in this file match rstDoc() in');
      console.error('app-02-fieldlog-sync.js. Nothing has been changed.');
      process.exit(1);
    }
  }

  console.log('MISSING FROM THE DATABASE — these people have an empty app:');
  console.log('');
  missing.forEach(function (p) {
    const d = rosterDoc(p);
    console.log('  ' + p.first + ' ' + p.last + ' [' + p.id + ']   ' +
                (d ? d.role + '   lab: ' + (d.lab || '—') : 'NOT A COMPLETE PERSON — will be skipped'));
  });
  console.log('');

  const writable = missing.map(rosterDoc).filter(Boolean);
  if (!writable.length) {
    console.log('None of them has enough filled in to write. Nothing done.');
    process.exit(1);
  }

  if (!WRITE) {
    console.log('This was a look, not a change. NOTHING HAS BEEN WRITTEN.');
    console.log('To actually put those ' + writable.length + ' people in:');
    console.log('');
    console.log('    node tools/fix-roster.js --write');
    process.exit(0);
  }

  /* One write each, NOT a batch. A batch is all-or-nothing, which is exactly
     what made the app's own roster button useless here: one refusal threw
     away everybody else's write too. Separately means four people still get
     put right if the fifth goes wrong, and the output says which. */
  let ok = 0, bad = 0;
  for (const doc of writable) {
    try {
      await db.collection('roster').doc(doc.id).create(doc);   /* create: never overwrite */
      ok++;
      console.log('  written: ' + doc.first + ' ' + doc.last + ' [' + doc.id + ']');
    } catch (e) {
      bad++;
      console.log('  FAILED:  ' + doc.first + ' ' + doc.last + ' [' + doc.id + ']  -> ' +
                  ((e && e.message) || e));
    }
  }
  console.log('');
  console.log(ok + ' written, ' + bad + ' failed.');
  console.log('');
  console.log('Check it with:  node tools/check-database.js');
  console.log('Their phones should pick them up within a few seconds.');
  process.exit(bad ? 1 : 0);
})().catch(function (e) {
  console.error('Could not finish: ' + ((e && e.message) || e));
  process.exit(1);
});
