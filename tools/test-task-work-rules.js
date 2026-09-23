/*
 * Can the person out in the field actually SAVE their work?
 *
 * The bug this exists for, reported by Dillon on 2026-09-22: "after I assign a
 * task to someone they are not able to click off the plots." On the phone it
 * looked like this: tap a plot, it goes green and says "done ✓", and a second
 * later it is orange again. The Finish button never lit up.
 *
 * Nothing was wrong with the tapping. The database was refusing the write.
 * Ticked plots are stored on the task (donePlots), and firestore.rules let an
 * undergraduate change a task in exactly two ways -- claim it, or complete it
 * -- neither of which listed donePlots. So every tick was refused, the
 * database handed its own copy back, and the phone put the plot back the way
 * the database had it. The finish was refused too: completeTask() also writes
 * completedNote, which was not on the completion list either.
 *
 * Every existing test passed straight over this, because none of them asked
 * the question this one asks: take what the REAL APP does to a task while a
 * student works it, and put the before and after in front of the rules. It
 * uses the mirror in tools/rules-model.js, and checks that mirror's field
 * lists against firestore.rules itself so the two cannot quietly drift.
 *
 * Sections 7 and 8 cover part-finished jobs (Dillon, 2026-09-22): a student
 * submits what they did, and Bill hands the rest to somebody.
 *
 * Run:  node tools/test-task-work-rules.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const model = require('./rules-model');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');
const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- boot, the same way tools/test-taskwork.js does ---- */
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
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
win.confirm = () => true;

const scripts = require('./_app').appScripts(win.document);
try {
  win.eval(scripts.join('\n;\n') + '\n;window.__w={TASKS:TASKS,FIELDLOG:FIELDLOG,setBrief:function(b){twBrief=b;}};');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const TASKS = (win.__w && win.__w.TASKS) || [];
/* What the database holds: the record exactly as the phone would send it. */
const doc = t => JSON.parse(JSON.stringify(win.taskDoc(t)));
const STUDENT = 'p18';

/* A job as Bill's Assign screen writes it (copied from a real one, 2026-09-22). */
function assigned(id, over) {
  const t = Object.assign({ createdBy: 'p07', id: id, title: 'Rotary - Plots', area: 'Plots P1, P2',
    plots: ['P1', 'P2'], badge: null, type: 'Mow', dueAt: '2026-09-22', dueOrd: 20260922,
    repeat: 'None', status: 'todo', desc: '', kind: 'task', assignee: STUDENT }, over || {});
  TASKS.push(t);
  return t;
}
function why(before, after) { return 'changed: ' + model.changedKeys(before, after).join(', '); }

/* ---------------------------------------------------------------- */
section('1. the rules mirror says what firestore.rules says');
{
  const list = name => {
    const m = RULES.match(new RegExp('function ' + name + '\\(\\) \\{[\\s\\S]*?hasOnly\\(\\[([^\\]]*)\\]'));
    return m ? m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean).sort() : null;
  };
  ok('the working-the-job fields match', JSON.stringify(list('isWorkUpdate')) === JSON.stringify(model.WORK_FIELDS.slice().sort()),
     JSON.stringify(list('isWorkUpdate')));
  ok('the completion fields match', JSON.stringify(list('isCompletion')) === JSON.stringify(model.COMPLETION_FIELDS.slice().sort()),
     JSON.stringify(list('isCompletion')));
  ok('and working the job is one of the update moves', /isCompletion\(\) \|\| isWorkUpdate\(\)/.test(RULES));
}

section('2. a student ticks off an assigned mowing job (THE BUG)');
{
  win.sessionSet(STUDENT, { quiet: true });
  const t = assigned('wr-1');
  const server = doc(t);

  win.openTaskWork(t.id);
  win.renderTaskWork();
  const opened = doc(t);
  ok('just opening the job writes nothing the database would refuse',
     model.changedKeys(server, opened).length === 0 || model.isWorkUpdate(server, opened, STUDENT), why(server, opened));

  win.jobTapSelect(t.donePlots, 'P1', {});
  const oneTick = doc(t);
  ok('the tick is on the task', oneTick.donePlots.indexOf('P1') >= 0);
  ok('and the database accepts a student\'s tick', model.isWorkUpdate(server, oneTick, STUDENT), why(server, oneTick));
  ok('but not from somebody who is not on the job', !model.isWorkUpdate(server, oneTick, 'p19'));

  /* The last tick and Finish, a second apart, go up as ONE write. */
  win.jobTapSelect(t.donePlots, 'P2', {});
  win.completeTask(t.id, '');
  const finished = doc(t);
  ok('finishing is allowed for the student', model.rulesCan(model.rosterDoc(win.PEOPLE || []), STUDENT, 'complete', server) !== false);
  ok('the finish write only touches fields a completion may', model.completionFieldsOk(oneTick, finished, STUDENT), why(oneTick, finished));
  ok('even with the last tick in the same write', model.completionFieldsOk(server, finished, STUDENT), why(server, finished));
  ok('and it credits the student', model.creditsWorker(server, finished, STUDENT));
}

section('3. a finish with a note');
{
  const t = assigned('wr-2');
  const server = doc(t);
  win.completeTask(t.id, 'Left the mower at the shop');
  const finished = doc(t);
  ok('the note goes up with the finish', model.completionFieldsOk(server, finished, STUDENT), why(server, finished));
}

section('4. a boom spray: the mix sheet is filled in at the rig');
{
  const t = assigned('wr-3', { title: 'Pesticide - Boom', type: 'Spray', plots: ['P1'], area: 'Plots P1',
                               mix: { nozzle: 'n1', area: '', charge: '', products: [{ id: null, name: 'Daconil', rate: '3.6', unit: 'fl oz' }] } });
  const server = doc(t);
  win.openTaskWork(t.id);
  win.renderTaskWork();              /* opens on the brief, which draws the mix sheet */
  const briefed = doc(t);
  ok('opening the brief writes nothing the database would refuse',
     model.changedKeys(server, briefed).length === 0 || model.isWorkUpdate(server, briefed, STUDENT), why(server, briefed));
  t.mix = t.mix || {}; t.mix.area = '43,560';
  const filled = doc(t);
  ok('the student may fill in the area on the mix', model.isWorkUpdate(server, filled, STUDENT), why(server, filled));
}

section('5. a trial-dots job');
{
  const t = assigned('wr-4', { title: 'Trial Dots', type: 'Miscellaneous', plots: [], area: 'All active trials' });
  const server = doc(t);
  t.doneTrials = ['tr1'];
  ok('ticking a study off is allowed', model.isWorkUpdate(server, doc(t), STUDENT), why(server, doc(t)));
}

/* Dillon, 2026-09-23: the cans of paint the dots were sprayed out of come off
   the inventory when the job is finished. Two halves have to hold at once --
   the database must accept the new field, and the shelf must actually move --
   and the first of those is the one that cannot be seen on a phone. */
section('5b. the cans of paint a trial-dots job used');
{
  win.sessionSet(STUDENT, { quiet: true });
  /* A paint set up the way Bill would on the Inventory screen. It is pushed in
     here rather than shipped in the app on purpose: the app must read whatever
     is in the Paint · Cans category, not a product named in the source. */
  win.INVENTORY.push({ id: 'ipaint', name: 'Field Marking Paint', ai: null, cat: 'paint_can',
                       form: 'other', loc: 'Barn', ctype: 'can', csize: 1, unit: 'can', qty: 10, thr: 2 });
  const paint = win.INVENTORY.find(x => x.id === 'ipaint');
  const before = win.invQty(paint);

  const t = assigned('wr-4b', { title: 'Trial Dots', type: 'Miscellaneous', plots: [], area: 'All active trials' });
  const server = doc(t);
  win.openTaskWork(t.id);
  win.__w.setBrief(false);
  win.renderTaskWork();
  win.document.getElementById('tw-complete').click();

  const sheet = win.document.getElementById('donesheet');
  const cans = win.document.getElementById('ds-paint-cans');
  ok('finishing asks how much paint went', sheet && sheet.classList.contains('show') && !!cans);
  ok('and the only answers offered are whole cans',
     cans && [...cans.options].slice(1).every(o => /^\d+ cans?$/.test(o.textContent) && String(+o.value) === o.value),
     cans && [...cans.options].map(o => o.textContent).join('|'));
  ok('one paint in inventory is not a question worth asking', !win.document.getElementById('ds-paint-item'));

  const btn = sheet.querySelector('.ds-confirm');
  btn.click();
  ok('confirming without an answer does not close the job', t.status === 'todo', t.status);
  ok('and the button says what is missing', /how many cans/i.test(btn.textContent), btn.textContent);

  cans.value = '3';
  cans.dispatchEvent(new win.Event('change', { bubbles: true }));
  ok('picking a number lights the button up', btn.textContent.indexOf('Confirm') === 0, btn.textContent);
  btn.click();

  const finished = doc(t);
  ok('the job is done', t.status === 'done');
  ok('the cans are on the job', t.paintUsed && t.paintUsed.cans === 3 && t.paintUsed.item === 'ipaint',
     JSON.stringify(t.paintUsed));
  ok('THE DATABASE ACCEPTS THE FINISH WITH THE PAINT ON IT',
     model.completionFieldsOk(server, finished, STUDENT), why(server, finished));
  ok('three cans came off the shelf', win.invQty(paint) === before - 3, before + ' -> ' + win.invQty(paint));
  ok('and the movement says which job took them',
     win.INVMOVES.some(m => m.item === 'ipaint' && m.delta === -3 && m.ref === t.id && m.who === STUDENT));

  const entry = win.__w.FIELDLOG.filter(e => e.taskId === t.id)[0];
  ok('the Field Log says what went out and how much',
     entry && entry.product === 'Field Marking Paint' && entry.amount === '3 cans',
     entry && entry.product + ' / ' + entry.amount);
}

section('5c. a paint measured in ounces, not in cans');
{
  win.sessionSet(STUDENT, { quiet: true });
  /* A 17 oz can counted in ounces. Two cans must take 34 oz off, not 2 --
     using the can count straight would empty a shelf eight times too slowly
     and make the Inventory screen quietly wrong. */
  win.INVENTORY.push({ id: 'ipaint2', name: 'Upside-Down Marker', ai: null, cat: 'paint_can',
                       form: 'other', loc: 'Barn', ctype: 'can', csize: 17, unit: 'oz', qty: 170, thr: 0 });
  const oz = win.INVENTORY.find(x => x.id === 'ipaint2');
  const before = win.invQty(oz);

  const t = assigned('wr-4c', { title: 'Trial Dots', type: 'Miscellaneous', plots: [], area: 'All active trials' });
  win.openTaskWork(t.id);
  win.__w.setBrief(false);
  win.renderTaskWork();
  win.document.getElementById('tw-complete').click();
  const pick = win.document.getElementById('ds-paint-item');
  ok('with two paints on the shelf, the student says which', !!pick, 'no product dropdown');
  const btn = win.document.getElementById('donesheet').querySelector('.ds-confirm');
  btn.click();
  ok('and it will not close until they do', t.status === 'todo' && /which paint/i.test(btn.textContent), btn.textContent);
  pick.value = 'ipaint2';
  pick.dispatchEvent(new win.Event('change', { bubbles: true }));
  const cans = win.document.getElementById('ds-paint-cans');
  cans.value = '2';
  cans.dispatchEvent(new win.Event('change', { bubbles: true }));
  btn.click();
  ok('two 17 oz cans take 34 oz off the shelf, not 2', win.invQty(oz) === before - 34,
     before + ' -> ' + win.invQty(oz));
}

section('5d. trial dots still finishes when no paint is set up at all');
{
  /* The farm may not have added a paint yet. A student must never be stranded
     on a finished job over that -- the count still gets recorded, there is
     simply no shelf to take it off. */
  win.sessionSet(STUDENT, { quiet: true });
  const keep = win.INVENTORY.filter(it => it.cat === 'paint_can');
  keep.forEach(it => win.INVENTORY.splice(win.INVENTORY.indexOf(it), 1));

  const t = assigned('wr-4d', { title: 'Trial Dots', type: 'Miscellaneous', plots: [], area: 'All active trials' });
  const server = doc(t);
  win.openTaskWork(t.id);
  win.__w.setBrief(false);
  win.renderTaskWork();
  win.document.getElementById('tw-complete').click();
  const cans = win.document.getElementById('ds-paint-cans');
  ok('it still asks', !!cans);
  cans.value = '1';
  cans.dispatchEvent(new win.Event('change', { bubbles: true }));
  win.document.getElementById('donesheet').querySelector('.ds-confirm').click();
  ok('the job closes', t.status === 'done', t.status);
  ok('the count is kept even with nothing to subtract it from',
     t.paintUsed && t.paintUsed.cans === 1 && !t.paintUsed.item, JSON.stringify(t.paintUsed));
  ok('and the database still accepts it', model.completionFieldsOk(server, doc(t), STUDENT), why(server, doc(t)));

  keep.forEach(it => win.INVENTORY.push(it));
}

section('5e. an ordinary job is not asked about paint');
{
  win.sessionSet(STUDENT, { quiet: true });
  const t = assigned('wr-4e');
  win.openDoneSheet(t.id);
  ok('a mowing job gets the sheet it always had', !win.document.getElementById('ds-paint-cans'));
  const btn = win.document.getElementById('donesheet').querySelector('.ds-confirm');
  ok('and its Confirm button is not greyed out', btn.textContent.indexOf('Confirm') === 0, btn.textContent);
  btn.click();
  ok('one tap finishes it', t.status === 'done', t.status);
}

section('6. what working a job still may NOT do');
{
  const t = assigned('wr-5');
  const server = doc(t);
  const moved = Object.assign(doc(t), { donePlots: ['P1'], plots: ['P1', 'P2', 'P3'] });
  ok('a tick cannot carry a change to the job\'s ground', !model.isWorkUpdate(server, moved, STUDENT), why(server, moved));
  const retitled = Object.assign(doc(t), { donePlots: ['P1'], title: 'Something easier' });
  ok('or to what the job is', !model.isWorkUpdate(server, retitled, STUDENT));
  const reassigned = Object.assign(doc(t), { donePlots: ['P1'], assignee: 'p19' });
  ok('or to who is on it', !model.isWorkUpdate(server, reassigned, STUDENT));
}

section('7. a student submits a part-finished job, and Bill hands out the rest');
{
  const FIELDLOG = win.__w.FIELDLOG;
  win.sessionSet(STUDENT, { quiet: true });
  const t = assigned('wr-7', { plots: ['P1', 'P2'], area: 'Plots P1, P2' });
  const server = doc(t);
  win.openTaskWork(t.id);
  win.renderTaskWork();
  const btn = win.document.getElementById('tw-complete');
  ok('with nothing ticked, the button still says keep going', /Check off all/.test(btn.textContent), btn.textContent);
  win.jobTapSelect(t.donePlots, 'P1', {});
  win.renderTaskWork();
  ok('one ticked: the button offers to submit it', /Submit 1 of 2 done/.test(btn.textContent), btn.textContent);

  btn.click();
  const sheet = win.document.getElementById('partsheet');
  ok('pressing it asks first, it does not submit on the spot',
     sheet && sheet.classList.contains('show') && t.status === 'todo');
  ok('and says what goes back to Bill', /1 of 2 done\. The other one goes back to Bill/.test(win.document.getElementById('ps-sub').textContent),
     win.document.getElementById('ps-sub').textContent);
  win.document.getElementById('ps-note').value = 'Ran out of time';
  const logBefore = FIELDLOG.length;
  sheet.querySelector('.ds-confirm').click();

  const after = doc(t);
  ok('the student\'s part is closed and credited to them', t.status === 'done' && t.completedBy === STUDENT);
  ok('marked part-finished, with the plot nobody got to', t.partial === true && JSON.stringify(t.leftPlots) === '["P2"]',
     JSON.stringify(t.leftPlots));
  ok('the reason is kept', t.completedNote === 'Ran out of time');
  ok('the database accepts it from the student', model.completionFieldsOk(server, after, STUDENT), why(server, after));
  const logged = FIELDLOG.slice(logBefore).filter(e => e.taskId === t.id).map(e => e.plot);
  ok('the Field Log gets only the plot actually done', JSON.stringify(logged) === '["P1"]', JSON.stringify(logged));

  /* Bill's side. */
  win.sessionSet('p07', { quiet: true });
  ok('it is waiting on Bill\'s board', win.tbLeftovers().some(x => x.id === t.id));
  win.goRoot('taskboard'); win.__w.setBrief(false);
  win.renderBoard();
  const body = win.document.getElementById('tb-body').textContent;
  ok('under "Left over", with who, what is left and why',
     /Left over — needs someone/.test(body) && /did 1 · 1 left/.test(body) && /Ran out of time/.test(body));

  const beforeBill = doc(t);
  const d1 = new win.Date(); d1.setDate(d1.getDate() + 1);
  const tomorrow = win.asNearestWeekday(win.asOrd(d1));
  const nt = win.assignRest(t.id, 'p19', tomorrow);
  ok('assigning the rest makes a new job with only what was left',
     nt && JSON.stringify(nt.plots) === '["P2"]' && nt.assignee === 'p19' && nt.status === 'todo');
  ok('for the day Bill picked', nt.dueOrd === tomorrow);
  ok('carrying the same work', nt.title === t.title && nt.type === t.type && nt.restOf === t.id);
  ok('the old job says where its rest went', t.restAssigned === nt.id);
  ok('and it drops off the "Left over" list', !win.tbLeftovers().some(x => x.id === t.id));
  const R = model.rosterDoc(win.PEOPLE || []);
  ok('the database lets Bill create it for that student', model.rulesCan(R, 'p07', 'assign', nt) && model.rulesCan(R, 'p07', 'create', nt));
  ok('and mark the old one', model.rulesCan(R, 'p07', 'edit', beforeBill));

  const t2 = assigned('wr-8', { status: 'done', partial: true, leftPlots: ['P2'], donePlots: ['P1'], completedBy: STUDENT });
  win.dropRest(t2.id);
  ok('"Leave it" takes it off the list without making a job', t2.restAssigned === 'none' && !win.tbLeftovers().some(x => x.id === t2.id));
}

section('8. nobody submits part of a job somebody else is still out on');
{
  win.sessionSet(STUDENT, { quiet: true });
  const t = assigned('wr-9', { plots: ['P1', 'P2'], helpers: ['p19'] });
  win.openTaskWork(t.id);
  win.renderTaskWork();
  win.jobTapSelect(t.donePlots, 'P1', {});
  const realClaim = win.crewClaim;
  win.crewClaim = (id, u) => (u === 'P2' ? { who: 'p19' } : null);
  win.renderTaskWork();
  const btn = win.document.getElementById('tw-complete');
  ok('with a helper on the rest, "Submit" is not offered', !/Submit 1 of/.test(btn.textContent), btn.textContent);
  win.crewClaim = realClaim;
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
