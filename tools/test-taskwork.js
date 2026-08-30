/*
 * Harness for the work screen an undergrad uses to check plots off.
 *
 * Two real faults, both reported from the field on 2026-08-30 as "they can't
 * tap the plots and nothing happens":
 *
 *   1. THE JOB LOST ITS GROUND. A mowing job narrows to one machine, and it
 *      did that by hardcoding the machine's NAME -- the same name Farm
 *      settings > Mowers lets anyone retype in the "Shows as" box. Retype it
 *      and the job matched no plot at all, so every plot drew grey and
 *      non-interactive. The screen still said "0 / 0 done" and still offered a
 *      green Complete button, which would file a Field Log entry for a mow
 *      that never happened.
 *
 *   2. THE JOB WAS HELD BY SOMEBODY ELSE, FOREVER. Zone jobs -- the alleys,
 *      and the gravel on a spray -- claim each piece of ground so two people
 *      never mow one strip. A claim carries the time from the phone that made
 *      it, and a phone whose clock runs fast stamps a time in everyone else's
 *      future, which no expiry test can ever pass. The ground stayed locked
 *      for as long as that clock was wrong, on every other phone, and the
 *      finish button refused along with it -- so the crew could not move on to
 *      the next task either.
 *
 * jsdom does no layout, so this checks the wiring and the words, not pixels.
 *
 * Run:  node tools/test-taskwork.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- boot ---- */
const vc = new VirtualConsole();
const seen = [];
vc.on('jsdomError', e => seen.push(e.message));
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;

const noop = () => {};
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'getBounds' ? () => ({ getSouthWest: () => ({ lat: 0, lng: 0 }),
                                               getNorthEast: () => ({ lat: 0, lng: 0 }),
                                               getCenter: () => ({ lat: 0, lng: 0 }),
                                               extend() { return this; }, pad() { return this; } })
                 : (k === 'getZoom' || k === 'getMaxZoom' || k === 'getBoundsZoom') ? () => 20
                 : (k === 'hasLayer') ? () => false
                 : (k === 'getContainer') ? () => null
                 : chain()),
  apply: () => chain()
});
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true
});
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };

const scripts = require('./_app').appScripts(win.document);
try {
  win.eval(scripts.join('\n;\n')
    + '\n;window.__tw={setWork:function(id){workTaskId=id;twBrief=false;},'
    + 'getWork:function(){return workTaskId;},TASKS:TASKS,FIELDLOG:FIELDLOG};'
    + '\n;window.flPartUnits=flPartUnits;');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const doc = win.document;
const TASKS = (win.__tw && win.__tw.TASKS) || [];
const FIELDLOG = (win.__tw && win.__tw.FIELDLOG) || [];
const txt = id => { const e = doc.getElementById(id); return e ? e.textContent.trim() : '(missing)'; };

/* A mow job, assigned to whoever is signed in, with no plots picked by hand —
   the ordinary case, where the machine decides the ground. */
function mowTask(id, title) {
  const t = { id: id, title: title || 'Rotary - Plots', type: 'Mow', area: 'Rotary ground',
              plots: [], donePlots: [], status: 'todo', kind: 'task',
              assignee: win.SESSION.pid, desc: '' };
  TASKS.push(t);
  return t;
}
function labels() { return win.MOWER_CFG.map(m => m.slice()); }
function restore(saved) { win.MOWER_CFG.length = 0; saved.forEach(m => win.MOWER_CFG.push(m.slice())); }

/* ---------------------------------------------------------------- */
section('1. a mowing job finds its ground through the farm\'s mower list');
{
  const t = mowTask('tw-1');
  const base = win.taskPlots(t).length;
  ok('the rotary job starts with ground on it', base > 0, base + ' plots');

  const saved = labels();

  /* THE REGRESSION. Renaming what a machine "shows as" must not empty the job.
     This is a farm manager doing an ordinary thing on a settings screen built
     for it -- see docs/DECISIONS.md and the succession rule in CLAUDE.md. */
  win.MOWER_CFG.forEach(m => { if (/rotary/i.test(m[1])) m[1] = 'Z915E Rotary'; });
  const afterRename = win.taskPlots(t).length;
  ok('renaming the mower keeps the job\'s ground', afterRename === base,
     base + ' before, ' + afterRename + ' after');
  ok('and it is still the same ground', afterRename > 0, String(afterRename));
  restore(saved);

  /* The other half of the same coupling: the job asks the mower list what the
     machine is called now, rather than carrying a copy of the name. */
  win.MOWER_CFG.forEach(m => { if (/fairway/i.test(m[1])) m[1] = 'Big Reel'; });
  const fw = mowTask('tw-1b', 'Fairway');
  ok('a fairway job survives its mower being renamed too',
     win.taskPlots(fw).length > 0, String(win.taskPlots(fw).length));
  restore(saved);
}

section('2. a job with no ground says so, and cannot be closed');
{
  const saved = labels();
  /* Deleting the machine outright is the case a rename cannot cover: there is
     no name left to find, and no plot is booked on anything the job wants. */
  for (let i = win.MOWER_CFG.length - 1; i >= 0; i--) {
    if (/rotary|z915|optimus/i.test(win.MOWER_CFG[i][0] + ' ' + win.MOWER_CFG[i][1])) win.MOWER_CFG.splice(i, 1);
  }
  const t = mowTask('tw-2');
  ok('the job now has no ground', win.taskPlots(t).length === 0, String(win.taskPlots(t).length));

  const why = win.jobNoGround(t.type, t.title, win.parsePlots(t));
  ok('and the app can say why in plain words', !!why && why.length > 20, why);
  ok('naming the screen to go and fix it on', /Farm settings/.test(why), why);

  win.__tw.setWork('tw-2');
  win.go('taskwork');
  ok('the screen tells the person, instead of showing an empty map',
     txt('tw-hint') === why, txt('tw-hint'));
  /* The heading fell back to "All mowers", which on a job with no ground at
     all reads as though the whole farm were in scope. */
  ok('and the heading does not claim the whole farm', txt('tw-kind') === 'No ground',
     txt('tw-kind'));
  /* The dangerous part: this used to read "Complete task" on a green button,
     and pressing it filed a Field Log entry for a mow nobody did. */
  ok('the finish button refuses rather than offering to complete',
     !/^Complete task$/.test(txt('tw-complete')), txt('tw-complete'));
  ok('and says who to tell', /Bill/.test(txt('tw-complete')), txt('tw-complete'));

  const logged = FIELDLOG.length;
  doc.getElementById('tw-complete').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('pressing it does not close the job', t.status === 'todo', t.status);
  ok('and writes nothing to the Field Log', FIELDLOG.length === logged,
     (FIELDLOG.length - logged) + ' entries appeared');
  restore(saved);
}

section('3. a claim from a phone whose clock runs fast still expires');
{
  /* The fault: the expiry test was `now - beat > TTL`, and a beat stamped in
     OUR future never satisfies it, however long you wait. Everyone except the
     holder was locked off that ground for as long as that clock was wrong.

     What must NOT change is what a claim is for. A claim that has just been
     seen is live whatever the clock says -- it is indistinguishable from
     somebody who genuinely just took the ground, and freeing it early is how
     two people end up mowing one strip. The fix is only that the eight
     minutes are now counted on a clock this phone owns. So: read the claims
     once, then move time forward and check they let go. */
  const realNow = Date.now;
  const db = win.crewLoad();
  db['tw-clock'] = { claims: {}, done: {} };
  const now = realNow();
  db['tw-clock'].claims['A'] = { who: 'p04', at: now - 3 * 3600e3, beat: now - 3 * 3600e3 };
  db['tw-clock'].claims['B'] = { who: 'p04', at: now, beat: now + 5 * 60e3 };
  db['tw-clock'].claims['C'] = { who: 'p04', at: now, beat: now + 24 * 3600e3 };
  db['tw-clock'].claims['D'] = { who: 'p04', at: now, beat: now };
  win.crewSave(db);

  ok('an abandoned claim from a correct clock is already free',
     win.crewClaim('tw-clock', 'A') === null);
  ok('one just seen is held, whatever clock stamped it',
     !!win.crewClaim('tw-clock', 'B'), 'freed too early');
  ok('and one from a badly wrong clock is held too, on first sight',
     !!win.crewClaim('tw-clock', 'C'), 'freed too early');
  ok('and so is a normal live one', !!win.crewClaim('tw-clock', 'D'));

  /* Now move this phone's clock forward past the eight minutes, with no
     further heartbeat from them. Fifteen rather than nine: B was stamped five
     minutes ahead, so our own clock has to get past that stamp before even
     ordinary arithmetic can call it old. */
  let offset = 0;
  Date.now = () => realNow() + offset;
  win.Date.now = Date.now;
  offset = 15 * 60 * 1000;

  ok('a claim from a clock five minutes fast lets go after the wait',
     win.crewClaim('tw-clock', 'B') === null, 'still held');
  /* This is the one that used to be locked for a whole day. */
  ok('so does one from a clock a day fast',
     win.crewClaim('tw-clock', 'C') === null, 'still held');
  ok('and so does an ordinary one, exactly as before',
     win.crewClaim('tw-clock', 'D') === null, 'still held');
  ok('crewOthers agrees with crewClaim about who is out there',
     win.crewOthers('tw-clock', win.SESSION.pid).length === 0,
     JSON.stringify(win.crewOthers('tw-clock', win.SESSION.pid)));

  /* Proof this was the clock and not just the passage of time: the beats on B
     and C are STILL in the future, so the old `now - beat > TTL` test would
     still be holding both of them. */
  ok('the future-dated beats are still in the future, so the old test would still hold them',
     db['tw-clock'].claims['C'].beat > Date.now());

  Date.now = realNow;
  win.Date.now = realNow;
}

section('4. ground held by somebody else is not a dead end');
{
  const t = mowTask('tw-4', 'Rotary - Alleys');
  const zones = win.taskPlots(t);
  ok('the alleys job is worked in zones', zones.length > 0 && zones.every(win.jobIsZone),
     zones.length + ' zones');

  /* A co-worker is genuinely out on every zone. */
  const db = win.crewLoad();
  db['tw-4'] = { claims: {}, done: {} };
  zones.forEach(z => { db['tw-4'].claims[z] = { who: 'p04', at: Date.now(), beat: Date.now() }; });
  win.crewSave(db);

  win.__tw.setWork('tw-4');
  win.go('taskwork');
  const sp = win.twSplit(t);
  ok('nothing is free to take', sp.free.length === 0, sp.free.join(','));
  ok('and it is all accounted for as held', sp.held.length === zones.length, String(sp.held.length));

  /* With nothing of their own finished there is nothing to hand in, so the
     button's job is to get them back to work rather than to refuse. */
  ok('the button offers a way out rather than refusing',
     /back to tasks/i.test(txt('tw-complete')), txt('tw-complete'));
  doc.getElementById('tw-complete').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const now = doc.querySelector('.screen.active');
  ok('pressing it leaves the work screen', now && now.id !== 's-taskwork',
     now ? now.id : 'none');
  ok('and the job is still open for whoever holds it', t.status === 'todo', t.status);
}

section('5. finishing your part when somebody else still holds the rest');
{
  const t = mowTask('tw-5', 'Rotary - Alleys');
  const zones = win.taskPlots(t);
  const me = win.SESSION.pid;
  const db = win.crewLoad();
  db['tw-5'] = { claims: {}, done: {} };
  /* Two zones this person mowed, the rest in somebody else's hands. */
  db['tw-5'].done[zones[0]] = { who: me, at: Date.now(), how: 'tap' };
  db['tw-5'].done[zones[1]] = { who: me, at: Date.now(), how: 'tap' };
  zones.slice(2).forEach(z => { db['tw-5'].claims[z] = { who: 'p04', at: Date.now(), beat: Date.now() }; });
  win.crewSave(db);
  t.donePlots = [zones[0], zones[1]];

  win.__tw.setWork('tw-5');
  win.go('taskwork');
  const sp = win.twSplit(t);
  ok('two zones are recorded as mine', sp.mine.length === 2, sp.mine.join(','));
  ok('the button offers to hand that part in', /hand in my part/i.test(txt('tw-complete')),
     txt('tw-complete'));
  ok('and says how much', /\(2 zones\)/.test(txt('tw-complete')), txt('tw-complete'));

  const before = FIELDLOG.length;
  doc.getElementById('tw-complete').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const added = FIELDLOG.slice(before);
  ok('their two zones go on the Field Log', added.length === 2, added.length + ' entries');
  ok('credited to them', added.every(e => e.person === me),
     added.map(e => e.person).join(','));
  ok('and marked as one person\'s share, not the whole job',
     added.every(e => e.part === true));
  ok('the task stays open for whoever is still out there', t.status === 'todo', t.status);
  /* What was handed in is remembered by the Field Log, not by a field on the
     task -- a task travels between phones and an older copy coming back would
     wipe a marker kept there, after which the same acre would be logged twice
     under the wrong name. */
  ok('and the log itself remembers what has been handed in',
     win.flPartUnits(t).length === 2, JSON.stringify(win.flPartUnits(t)));
  ok('which does not depend on anything stored on the task',
     !('loggedUnits' in t), 'the task is still carrying loggedUnits');

  /* The half that matters for the farm's records: when the job finally does
     close, the ground already on the log must not go on it a second time
     under somebody else's name. */
  const handedIn = win.flPartUnits(t);
  const before2 = FIELDLOG.length;
  win.flAddFromTask(t);
  const added2 = FIELDLOG.slice(before2);
  ok('closing the job later does not log the same zones again',
     added2.every(e => handedIn.indexOf(e.plot) < 0),
     added2.map(e => e.plot).join(','));
  ok('and it lists the ground that is left, not one summary row over all of it',
     added2.length > 0 && added2.every(e => e.plot !== t.area),
     added2.map(e => e.plot).join(','));

  /* The fragile version of this guard lived on the task. Prove the log-based
     one survives a task arriving fresh from the database with no memory. */
  const wiped = JSON.parse(JSON.stringify(t));
  delete wiped._logged;
  ok('a task copy straight from the database still knows what was handed in',
     win.flPartUnits(wiped).length === 2, JSON.stringify(win.flPartUnits(wiped)));
}

section('6. an ordinary job is untouched by any of this');
{
  const t = mowTask('tw-6');
  const plots = win.taskPlots(t);
  ok('it has its ground', plots.length > 0, String(plots.length));
  win.__tw.setWork('tw-6');
  win.go('taskwork');
  ok('and the button still asks for every plot',
     /check off all plots to finish/i.test(txt('tw-complete')), txt('tw-complete'));

  /* Check one off and the count moves, which is the whole point of the screen. */
  t.donePlots.push(plots[0]);
  win.renderTaskWork();
  ok('checking one off is counted', /\(1\//.test(txt('tw-complete')), txt('tw-complete'));

  t.donePlots = win.taskOpenPlots(t).slice();
  win.renderTaskWork();
  ok('and with all of them done it offers to finish',
     /finish/i.test(txt('tw-complete')), txt('tw-complete'));
}

section('7. nothing blew up');
{
  const real = seen.filter(m => !/Not implemented|Could not parse CSS/i.test(m));
  ok('no jsdom errors', real.length === 0, real.slice(0, 3).join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
