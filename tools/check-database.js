/*
 * WHAT IS ACTUALLY IN THE SHARED DATABASE
 * ----------------------------------------------------------------------
 * Run this when somebody says "it did not show up on my phone".
 *
 *   node tools/check-database.js
 *
 * It CHANGES NOTHING. It reads three things and prints them in plain
 * English:
 *
 *   1. The roster the database is using. Every phone's permission to read
 *      anything at all is checked against this one document. A person who
 *      is missing from it, or switched off in it, is refused by the
 *      database and their app quietly shows an empty board.
 *
 *   2. The sign-in accounts. Each one has to carry that person's roster id
 *      ("p23") stamped on it. Without the stamp the database does not know
 *      who is asking and refuses everything.
 *
 *   3. The tasks. Every job that has actually reached the shared database,
 *      who it is for, and what day it is filed under. If a task Bill made
 *      is not in this list, it never left Bill's phone.
 *
 * Between them those three answer the question "did it sync, or is it a
 * display problem" without touching anybody's phone.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const ROSTER_FILE = path.join(ROOT, 'roster-emails.local.json');

/* The key is FOUND, not typed — same as the other scripts. */
if (!require('./_key').resolveKey({
      root: ROOT, appPath: APP, cmd: 'node tools/check-database.js' })) {
  process.exit(1);
}

/* Names live in the app, not in the database — the database only ever gets
   roster ids. This file is the one place on this machine that has both. */
let NAMES = {};
try {
  JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8')).forEach(function (p) {
    NAMES[p.id] = { name: p.name || p.id, email: p.email || '' };
  });
} catch (e) { /* keep going; ids alone still answer the question */ }

function who(pid) {
  if (!pid) return '(nobody)';
  return (NAMES[pid] ? NAMES[pid].name : '(not on this machine\'s list)') + ' [' + pid + ']';
}
function day(t) {
  const v = t.dueAt || '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return t.dueOrd ? String(t.dueOrd) : 'no day set';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate();
}
function line(s) { console.log(s); }
function rule(title) {
  line('');
  line('======================================================================');
  line('  ' + title);
  line('======================================================================');
}

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

(async function () {

  /* ---- 1. the roster the database is using ------------------------- */
  rule('1. THE ROSTER THE DATABASE IS USING');
  /* ONE RECORD PER PERSON, in the `roster` collection. This used to read the
     single document refdata/roster, and went on reading it for a day after
     the roster was split on 2026-08-31 — so it reported the state of a
     document nothing writes any more, and told whoever ran it that people
     were missing who were not missing at all. The old document is closed in
     firestore.rules; the collection below is the one the app uses. */
  let roster = null;
  try {
    const snap = await db.collection('roster').get();
    if (snap.size) {
      roster = {};
      snap.forEach(function (d) {
        const v = d.data() || {};
        /* When the database last accepted this person. "They all changed in
           the same second" means one press of the roster button; a straggler
           on its own clock is a record that arrived some other way. It is the
           quickest way to tell a send that landed from one that was refused. */
        try { v._at = d.updateTime ? d.updateTime.toDate().toISOString() : ''; } catch (e) { v._at = ''; }
        roster[d.id] = v;
      });
    }
  } catch (e) {
    line('Could not read it: ' + (e && e.message));
  }

  if (roster === null) {
    line('THERE IS NO ROSTER IN THE DATABASE AT ALL.');
    line('');
    line('Nothing will sync for anybody until it is there. Fix: open the app,');
    line('More -> Admin -> Shared database, and press the roster button.');
  } else {
    const ids = Object.keys(roster).sort();
    line(ids.length + ' people are in it.');
    line('');
    ids.forEach(function (id) {
      const p = roster[id] || {};
      const off = (p.active === false) ? '   *** SWITCHED OFF — this phone can read NOTHING ***' : '';
      /* Names travel on the record itself since 2026-08-31, so somebody hired
         through the app has a name here even on a machine that has never had
         roster-emails.local.json. Fall back to that file for the old records. */
      const nm = (p.first || p.last) ? ((p.first || '') + ' ' + (p.last || '')).trim() + ' [' + id + ']' : who(id);
      line('  ' + (nm + '                              ').slice(0, 34) +
           (p.role || '(no role)') + '   lab: ' + (p.lab || '—') +
           (p.grants && p.grants.length ? '   extra jobs: ' + p.grants.join(', ') : '') + off +
           (p._at ? '   last accepted: ' + p._at : ''));
    });
    const local = Object.keys(NAMES);
    const missing = local.filter(function (id) { return !roster[id]; });
    if (missing.length) {
      line('');
      line('ON THIS MACHINE\'S LIST BUT NOT IN THE DATABASE:');
      missing.forEach(function (id) { line('  ' + who(id)); });
      line('');
      line('Each of these people gets an EMPTY app — the database refuses');
      line('them. Fix: More -> Admin -> Shared database, press the roster');
      line('button. It has to be pressed again every time somebody\'s role,');
      line('lab or on/off switch changes.');
    }
  }

  /* ---- 2. the sign-in accounts ------------------------------------- */
  rule('2. THE SIGN-IN ACCOUNTS AND THEIR ROSTER STAMP');
  const stamped = {};
  const unstamped = [];
  try {
    let page = await auth.listUsers(1000);
    for (;;) {
      page.users.forEach(function (u) {
        const pid = u.customClaims && u.customClaims.pid;
        if (pid) { (stamped[pid] = stamped[pid] || []).push(u.email || u.uid); }
        else { unstamped.push(u.email || u.uid); }
      });
      if (!page.pageToken) break;
      page = await auth.listUsers(1000, page.pageToken);
    }
  } catch (e) {
    line('Could not read the accounts: ' + (e && e.message));
  }

  const stampedIds = Object.keys(stamped).sort();
  line(stampedIds.length + ' accounts carry a roster stamp.');
  const noAccount = Object.keys(NAMES).filter(function (id) { return !stamped[id]; });
  if (noAccount.length) {
    line('');
    line('NO ACCOUNT, OR AN ACCOUNT WITH NO STAMP:');
    noAccount.forEach(function (id) { line('  ' + who(id) + '   ' + (NAMES[id] ? NAMES[id].email : '')); });
    line('');
    line('An unstamped account can sign in and then read NOTHING — the');
    line('database cannot tell who it is. Fix: node tools/create-accounts.js');
  }
  if (unstamped.length) {
    line('');
    line('Accounts with no roster stamp at all: ' + unstamped.join(', '));
  }

  /* ---- 3. the tasks ------------------------------------------------ */
  rule('3. EVERY TASK THAT HAS REACHED THE SHARED DATABASE');
  let tasks = [];
  try {
    const snap = await db.collection('tasks').get();
    snap.forEach(function (d) { tasks.push(d.data() || {}); });
  } catch (e) {
    line('Could not read them: ' + (e && e.message));
  }

  if (!tasks.length) {
    line('THERE ARE NO TASKS IN THE DATABASE.');
    line('');
    line('If Bill can see them on his own phone, they never left it. That is');
    line('a sending problem on his device, not a receiving problem on');
    line('anybody else\'s: check his Shared database read-out (or have him');
    line('open the app on wifi and leave it open for ten seconds).');
  } else {
    line(tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + ' in the database.');
    const by = {};
    tasks.forEach(function (t) {
      const k = t.assignee || (t.kind === 'request' ? '(a request — nobody on it yet)' : '(open — up for grabs)');
      (by[k] = by[k] || []).push(t);
    });
    Object.keys(by).sort().forEach(function (k) {
      line('');
      line('  FOR: ' + (/^p\d+$/.test(k) ? who(k) : k));
      by[k].forEach(function (t) {
        line('     - ' + (t.title || '(no name)') +
             '   day: ' + day(t) +
             '   status: ' + (t.status || '?') +
             '   put there by: ' + (t.assignedBy ? who(t.assignedBy) : (t.createdBy ? who(t.createdBy) : '?')));
      });
    });
  }

  rule('WHAT THIS MEANS');
  line('A task shows on somebody\'s phone only if ALL of these are true:');
  line('  - it appears in section 3 above, with THEIR name next to it');
  line('  - they are in section 1, and not switched off');
  line('  - their account is stamped in section 2');
  line('  - the day it is filed under is a day their Task Board can show');
  line('    (Mon-Fri buttons only, and only within the coming week)');
  line('');
  process.exit(0);
})().catch(function (e) {
  console.error('\nSomething went wrong: ' + (e && e.message || e));
  process.exit(1);
});
