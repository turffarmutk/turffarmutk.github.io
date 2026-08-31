/*
 * A line-by-line JavaScript mirror of firestore.rules.
 *
 * WHY THIS FILE EXISTS
 * The rules file is the farm's organisation chart written in Google's rules
 * language. The only way to run that language is Firebase's local emulator,
 * which downloads a program from Google's servers that this machine cannot
 * reach. So the rules cannot be executed here — but they can be MIRRORED, and
 * the mirror can be run against the same 23-person roster as the real
 * function in the app.
 *
 * tools/test-rules.js does exactly that: every person, against every other
 * person, for every action. If the mirror and taskCan() ever disagree, the
 * test fails.
 *
 * THE RULE FOR ANYONE EDITING THIS
 * This file must be changed ONLY to match firestore.rules, never to make a
 * test pass. If the mirror and the rules drift, the test is checking nothing.
 * The test also compares the two files' role names and grant names and fails
 * if one has a string the other does not.
 */

'use strict';

/* The roster as the rules see it. Since 2026-08-31 this is ONE RECORD PER
   PERSON — roster/{pid} — rather than one document holding everybody:
     { id, first, last, pron, role, lab, active, grants[], v }
   and NOT the email address, which lives one row per person in `accounts`.

   The split was needed so the rules could say "a PI may edit their own lab
   and nobody else's"; a whole-roster document arrives as one write and no
   rule can look inside it and tell which part changed.

   `people` is still keyed by id here, because that is how a rules `get()` on
   roster/$(id) behaves from the model's point of view — one lookup per id.
   Built from the app's PEOPLE list, and it is also the shape the app pushes,
   so tools/test-db.js can compare the two directly. */
const ROSTER_V = 2;
function rosterDoc(people) {
  const out = {};
  (people || []).forEach(function (p) {
    if (!p || !p.id) return;
    if (!p.role) return;                 /* no role means not a person yet */
    out[p.id] = {
      id: String(p.id),
      first: String(p.first || ''),
      last: String(p.last || ''),
      pron: String(p.pron || ''),
      role: p.role,
      lab: p.lab || '',
      active: p.active !== false,
      grants: (p.grants || []).slice().map(String),
      v: ROSTER_V
    };
  });
  return { people: out };
}

/* Mirrors the roster/{pid} write rule -- rosterKeeper(), appAdmin() and
   facultyMayWrite() together. The app's copy is rosterCanWrite() in
   UT-TurfFarm-App.html; tools/test-rules.js runs the two against every person
   against every person and fails if they ever differ.

   `existing` is the record as it stands before the write, or null for a new
   person -- the rules check the lab on BOTH sides of an edit, so the model
   has to as well, or it would miss a PI pulling another lab's technician into
   their own and then editing them. */
function labNorm(v) { return (!v || v === '—') ? '' : String(v); }
function rosterCanWriteIn(doc, mePid, target, opts) {
  const o = opts || {};
  const me = mePid == null ? '' : String(mePid);
  if (o.appAdmin) return true;
  if (keepsRoster(doc, me)) return true;
  const mine = ((doc && doc.people) || {})[me] || {};
  if (mine.role !== 'Faculty') return false;
  if (!target) return false;
  if (target.role === 'Faculty') return false;
  if ((target.grants || []).length) return false;
  const was = o.existing || null;
  if (was && (was.role === 'Faculty' || (was.grants || []).length)) return false;
  if (target.role === 'Undergraduate Student') return true;
  if (target.role === 'Farm Manager') return true;
  const myLab = labNorm(mine.lab);
  if (myLab === '' || labNorm(target.lab) !== myLab) return false;
  if (was && labNorm(was.lab) !== myLab) return false;
  return true;
}

/* Mirrors rosterKeeper() in firestore.rules — who may write a roster record,
   and (Stage 3) an `accounts` row. The app's own copy is rosterCanPush() in
   UT-TurfFarm-App.html; tools/test-db.js runs the two against each other. */
function keepsRoster(doc, mePid) {
  const me = mePid == null ? '' : String(mePid);
  if (me === '') return false;
  if (me === 'p01' || me === 'p07') return true;
  const r = ((doc && doc.people) || {})[me] || {};
  return r.role === 'Farm Manager' || (r.grants || []).indexOf('assign_undergrads') >= 0;
}

/* ---- the rules file, function for function ---- */

function Rules(doc, mePid) {
  const people = (doc && doc.people) || {};

  function str(v) { return v == null ? '' : v; }
  function rec(id) { return people[id] || {}; }
  function roleOf(id) { return str(rec(id).role); }
  function grantsOf(id) { return rec(id).grants || []; }
  function known(id) { return id !== '' && roleOf(id) !== ''; }
  function activeOf(id) { return known(id) && rec(id).active !== false; }
  function labOf(id) { return str(rec(id).lab) === '—' ? '' : str(rec(id).lab); }
  function sameLab(a, b) { return labOf(a) !== '' && labOf(a) === labOf(b); }
  function assignsUndergrads(id) {
    return roleOf(id) === 'Farm Manager' || grantsOf(id).indexOf('assign_undergrads') >= 0;
  }

  const me = str(mePid);

  function signedIn() { return me !== ''; }
  function actor() { return signedIn() && activeOf(me); }

  function canCreate() { return roleOf(me) !== 'Undergraduate Student'; }

  function canDirectUndergrad(target) {
    return assignsUndergrads(me)
      || (roleOf(me) !== 'Undergraduate Student' && sameLab(me, target));
  }

  function canAssignTo(target) {
    return target === '' ? false
      : target === me ? roleOf(me) !== 'Undergraduate Student'
      : roleOf(target) === 'Undergraduate Student' ? canDirectUndergrad(target)
      : roleOf(me) === 'Faculty'
        ? ((roleOf(target) === 'Graduate Student' || roleOf(target) === 'Technician')
           && sameLab(me, target))
      : false;
  }

  function canClaim(d) {
    return str(d.assignee) === ''
      && (roleOf(me) === 'Graduate Student'
          || roleOf(me) === 'Technician'
          || assignsUndergrads(me));
  }

  function onTask(d, id) {
    return id !== '' && (str(d.assignee) === id || (d.helpers || []).indexOf(id) >= 0);
  }
  function canComplete(d) { return onTask(d, me) || assignsUndergrads(me); }

  function canEdit(d) {
    return assignsUndergrads(me)
      || str(d.createdBy) === me
      || (roleOf(me) === 'Faculty'
          && str(d.assignee) !== ''
          && sameLab(me, str(d.assignee)));
  }

  return { actor, canCreate, canAssignTo, canDirectUndergrad, canClaim, canComplete, canEdit, onTask };
}

/*
 * The same question taskCan() answers, answered the way the database will
 * answer it. Actions map onto the rules blocks like this:
 *
 *   create / request  -> allow create        (canCreate)
 *   assign            -> isAssignment()      (canAssignTo)
 *   claim             -> isClaim()           (canClaim)
 *   complete          -> isCompletion()      (canComplete)
 *   edit              -> isEdit()            (canEdit)
 *   delete            -> allow delete        (canEdit)
 */
function rulesCan(doc, actorPid, action, task) {
  const R = Rules(doc, actorPid);
  if (!R.actor()) return false;
  const t = task || {};
  switch (action) {
    case 'create':
    case 'request':  return R.canCreate();
    case 'assign':   return R.canAssignTo(t.assignee == null ? '' : t.assignee);
    case 'claim':    return R.canClaim(t);
    case 'complete': return R.canComplete(t);
    case 'edit':
    case 'delete':   return R.canEdit(t);
  }
  return false;
}


/*
 * The completion rule has one clause beyond taskCan(): the credit.
 *
 * taskCan(actor,'complete',t) answers "may this person close it". The database
 * asks a second question the app does not — "and who is being credited for the
 * work?" — because closing a job and doing it are not the same act. Bill can
 * close a job on somebody's behalf; the record still has to say the worker did
 * it. Mirrors isCompletion() in firestore.rules.
 */
function creditsWorker(before, after, mePid) {
  const me = mePid == null ? '' : mePid;
  const credited = (after && after.completedBy) == null ? '' : after.completedBy;
  if (credited === '') return false;
  const onIt = credited === (before.assignee == null ? '' : before.assignee)
            || (before.helpers || []).indexOf(credited) >= 0;
  return onIt || credited === me;
}

module.exports = { rosterDoc, Rules, rulesCan, creditsWorker, keepsRoster, ROSTER_V, rosterCanWriteIn };
