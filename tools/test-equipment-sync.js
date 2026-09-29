/*
 * Equipment — drawer 8. The machines, and what is wrong with them.
 *
 * WHAT THIS IS FOR, in one sentence: somebody marks a mower down on their
 * phone, and this is what makes it read "Down" on the other twenty-two rather
 * than "Available" while the next person walks out to it.
 *
 * Two things are worth more here than the plumbing:
 *
 *   - THE PERMISSIONS COME OFF THE ROSTER, not off currentRole. currentRole is
 *     set once at sign-in and drifts; the database reads the roster. When the
 *     screens ask one and the database enforces the other, the app offers a
 *     button whose write is then refused, which looks to whoever tapped it
 *     like the app is broken. Several checks below deliberately set
 *     currentRole to the WRONG thing and prove the answer does not move.
 *
 *   - SERVICE HISTORY IS WRITE-ONCE. A service either happened or it did not.
 *     An incoming record this phone already holds is left alone rather than
 *     overwritten, the same rule the field log and the stock ledger follow.
 *
 * Run:  node tools/test-equipment-sync.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const RULES = path.join(ROOT, 'firestore.rules');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ------------------------------------------------------- the fake db ---- */
const state = { writes: [], deletes: [], listeners: {} };
function docRef(coll, id) {
  return {
    id: String(id),
    set(data) { state.writes.push({ coll, id: String(id), data }); return Promise.resolve(); },
    delete() { state.deletes.push({ coll, id: String(id) }); return Promise.resolve(); }
  };
}
const fakeDb = {
  enablePersistence() { return Promise.resolve(); },
  collection(name) {
    return { doc: id => docRef(name, id),
             onSnapshot(opts, next, err) { (state.listeners[name] = state.listeners[name] || []).push({ next, err }); return () => { state.listeners[name] = []; }; } };
  },
  doc: p => docRef('_', p)
};
const fakeFirebase = {
  apps: [], initializeApp() { fakeFirebase.apps.push({}); },
  auth() { return { currentUser: null, onAuthStateChanged() { return () => {}; } }; },
  firestore() { return fakeDb; }
};
fakeFirebase.firestore.FieldValue = { delete: () => ({ __delete: true }) };
function emit(coll, changes, fromCache) {
  const snap = {
    metadata: { fromCache: !!fromCache },
    docChanges: () => changes.map(c => ({ type: c.type || 'added',
      doc: { id: String(c.id), data: () => JSON.parse(JSON.stringify(c.data || {})) } }))
  };
  (state.listeners[coll] || []).slice().forEach(l => l.next(snap));
}
const reset = () => { state.writes.length = 0; state.deletes.length = 0; };
const wrote = coll => state.writes.filter(w => w.coll === coll);

/* ------------------------------------------------------------- boot ---- */
const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;
const noop = () => {};
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'getBounds' ? () => ({ getSouthWest: () => ({ lat: 0, lng: 0 }), getNorthEast: () => ({ lat: 0, lng: 0 }),
                                               getCenter: () => ({ lat: 0, lng: 0 }), extend() { return this; }, pad() { return this; } })
                 : (k === 'getZoom' || k === 'getMaxZoom' || k === 'getBoundsZoom') ? () => 20
                 : (k === 'hasLayer') ? () => false : (k === 'getContainer') ? () => null : chain()),
  apply: () => chain()
});
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.firebase = fakeFirebase;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };

/* The five equipment lists are `let`, so they are not on window. They are
   filled in place and never reassigned, so holding the reference is safe. */
try {
  win.eval(appSource(win.document)
    + '\n;window.__EQ=EQUIP; window.__EQP=EQPROBLEMS; window.__EQM=EQMAINT;'
    + ' window.__EQS=EQSCHED; window.__EQC=EQCHECKOUT;'
    + ' window.__ROLE=function(v){ if(v!==undefined) currentRole=v; return currentRole; };');
} catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const appText = require('./_app').appText();   /* the page WITH the app-*.js files written back in */
const rulesText = fs.readFileSync(RULES, 'utf8');
const EQ = () => win.__EQ, EQP = () => win.__EQP, EQM = () => win.__EQM, EQS = () => win.__EQS;

/* The five roles, by the roster ids they actually hold. */
const BILL = 'p07', TECH = 'p01', GRAD = 'p09', FACULTY = 'p13', UNDERGRAD = 'p18';
const as = pid => { win.sessionSet(pid); };

/* --------------------------------------------- 1. who may do what ------- */
section('1. Who may do what — and it comes off the roster');

as(UNDERGRAD);
ok('an undergrad may report a problem — they are the ones on the mowers',
   win.eqCanReportProblem() === true);
ok('but may not take a machine out of service', win.eqCanTakeDown() === false);
ok('nor edit what a machine is', win.eqCanEditMachine() === false);
ok('nor touch the service record', win.eqCanMaintain() === false);

as(GRAD);
ok('a grad may report a problem', win.eqCanReportProblem() === true);
ok('but may not take a machine down — that changes everyone\'s day',
   win.eqCanTakeDown() === false);

as(FACULTY);
ok('faculty may describe their lab\'s machine', win.eqCanEditMachine() === true);
ok('but the service record is not theirs', win.eqCanMaintain() === false);
ok('nor is taking one out of service', win.eqCanTakeDown() === false);

as(TECH);
ok('a technician may take a machine down', win.eqCanTakeDown() === true);
ok('and keep the service record', win.eqCanMaintain() === true);
as(BILL);
ok('so may Bill', win.eqCanTakeDown() === true && win.eqCanMaintain() === true);

/* The whole point of moving these off currentRole. */
section('1b. currentRole cannot talk the app into the wrong answer');
as(UNDERGRAD);
win.__ROLE('manager');
ok('an undergrad with currentRole set to manager still may not take one down',
   win.eqCanTakeDown() === false, 'currentRole=' + win.__ROLE());
ok('and the screens agree, because they ask the same function',
   win.eqCanDown() === false);
as(BILL);
win.__ROLE('undergrad');
ok('and Bill with currentRole set to undergrad still may',
   win.eqCanTakeDown() === true && win.eqCanDown() === true);
win.__ROLE('manager');
ok('the buttons never read currentRole for equipment any more',
   !/function eqCanDown\(\)\{return currentRole/.test(appText)
   && !/function eqCanReport\(\)\{return currentRole/.test(appText));
ok('and somebody taken off the roster loses all four immediately',
   (function () {
     as(BILL);
     const me = win.PEOPLE.find(p => p.id === BILL);
     const was = me.active; me.active = false;
     const out = win.eqCanTakeDown() || win.eqCanMaintain()
              || win.eqCanEditMachine() || win.eqCanReportProblem();
     me.active = was;
     return out === false;
   })());

/* ------------------------------------ 2. the database says the same ----- */
section('2. The database says the same thing');
ok('there is an equipment block', /match \/equipment\/\{machineId\}/.test(rulesText));
ok('and one for problems', /match \/eqproblems\/\{problemId\}/.test(rulesText));
ok('and one for the service history', /match \/eqmaint\/\{recordId\}/.test(rulesText));
ok('and one for the service schedules', /match \/eqsched\/\{schedId\}/.test(rulesText));
ok('reading is open to everyone signed in',
   (rulesText.match(/allow read: if actor\(\);/g) || []).length >= 4);
ok('reporting a problem is open to everybody, undergraduates included',
   /function canReportProblem\(\)[\s\S]{0,220}\(actor\(\)\);/.test(rulesText));
/* Every permission in the rules now opens `appAdmin() ||` -- the App Manager
   has no restrictions, 2026-09-29. That is why the windows below are wider
   than they were; the farm's own line is unchanged and still what is checked. */
ok('taking one down is the manager and the technicians',
   /function canTakeDownMachine\(\)[\s\S]{0,260}'Farm Manager', 'Technician'\]/.test(rulesText));
ok('so is the service record',
   /function canMaintainEquip\(\)[\s\S]{0,260}'Farm Manager', 'Technician'\]/.test(rulesText));
ok('faculty are in for describing a machine, not for servicing it',
   /function canEditMachine\(\)[\s\S]{0,280}'Faculty'\]/.test(rulesText));
ok('marking one down is checked even on a write that may otherwise edit it',
   /status', ''\) != 'down' \|\| canTakeDownMachine\(\)/.test(rulesText));
ok('the service history has no update rule at all — it is write-once',
   /match \/eqmaint\/\{recordId\}[\s\S]*?allow update: if false;/.test(rulesText));
ok('nothing in the drawer may ever be deleted',
   (rulesText.match(/match \/(equipment|eqproblems|eqmaint|eqsched)\/[\s\S]*?allow delete: if false;/g) || []).length === 4);
ok('the roster is what the rules read, never a role sent up with the write',
   !/request\.resource\.data\.role/.test(rulesText));

/* ------------------------------------------- 3. what actually travels --- */
section('3. Four lists travel, and the fifth deliberately does not');
as(BILL);
win.eqsyncSetWanted(true);
ok('a listener is attached to each of the four',
   ['equipment', 'eqproblems', 'eqmaint', 'eqsched'].every(c => (state.listeners[c] || []).length > 0));
ok('and none to the checkout list, which nothing writes',
   !state.listeners['eqcheckout']);
ok('the app still never writes to the checkout list',
   !/EQCHECKOUT\.(push|unshift|splice)/.test(appText));
ok('it is on from the moment the app opens', win.EQSYNC.on === true);
ok('nothing on this phone decides that', /function eqsyncWanted\(\)\{ return true; \}/.test(appText));
ok('and there is no button to turn it off', !/eqsyncSetWanted\(false\)/.test(appText));
ok('it rides the two-second scan', appText.indexOf('eqsyncTick();') > 0);
ok('and is hydrated at startup', appText.indexOf('eqsyncHydrate();') > 0);

/* Ready is decided by the machines: nothing goes up before the shared copy
   has arrived, or this phone's rows are sent back as if they were new. */
reset();
ok('nothing is sent before the shared copy has landed', state.writes.length === 0);
emit('equipment', [], false);
ok('once it has, this phone sends what the farm is missing', wrote('equipment').length > 0);
ok('the machines went up', wrote('equipment').length === EQ().length);
ok('every one is keyed by its own id',
   wrote('equipment').every(w => w.data.id === w.id));

/* ------------------------------------------ 4. the record is a record -- */
section('4. A service either happened or it did not');
ok('every service record is given an id when it is written',
   (appText.match(/EQMAINT\.unshift\(\{id:eqMaintNewId\(\)/g) || []).length === 3);
ok('and rows already on a phone are stamped on read, never migrated',
   /function eqMaintStampIds\(\)/.test(appText));
{
  reset();
  EQM().length = 0;
  EQM().push({ eq: 'e1', type: 'oil', at: '2026-08-01', by: BILL, note: 'Oil change' });
  win.eqPush();
  const w = wrote('eqmaint');
  ok('a record with no id still gets one before it leaves', w.length === 1 && !!w[0].data.id);
  ok('and it names the machine as text, not a number', w[0].data.eq === 'e1');
}
{
  /* The write-once rule, from the other direction: a rewrite arriving from
     anywhere is a bug somewhere else, so this phone keeps what it has. */
  EQM().length = 0;
  EQM().push({ id: 'm1', eq: 'e1', type: 'oil', at: '2026-08-01', by: BILL, note: 'Oil change' });
  emit('eqmaint', [{ id: 'm1', data: { id: 'm1', eq: 'e1', type: 'oil', at: '2026-08-01', by: BILL, note: 'REWRITTEN' } }]);
  ok('an incoming rewrite of a service record is ignored', EQM()[0].note === 'Oil change');
  emit('eqmaint', [{ id: 'm2', data: { id: 'm2', eq: 'e2', type: 'belt', at: '2026-08-02', by: TECH, note: 'Belt' } }]);
  ok('but a service somebody else logged does arrive', EQM().some(m => m.id === 'm2'));
  emit('eqmaint', [{ type: 'removed', id: 'm2', data: {} }]);
  ok('and a removal never takes it back off this phone', EQM().some(m => m.id === 'm2'));
}

section('5. A machine changes; the app is told');
{
  const mower = EQ()[0];
  emit('equipment', [{ type: 'modified', id: mower.id,
    data: { id: mower.id, name: mower.name, status: 'down', notes: 'Hydraulic leak' } }]);
  ok('a mower marked down elsewhere reads down here', mower.status === 'down');
  ok('and the record is updated in place, not swapped out', EQ()[0] === mower);
  ok('so the screens still point at live data', EQ().find(m => m.id === mower.id).notes === 'Hydraulic leak');
  mower.status = 'available'; mower.notes = '';
}
{
  emit('eqproblems', [{ id: 'pr1', data: { id: 'pr1', eq: 'e1', by: UNDERGRAD, desc: 'Blade chipped', status: 'open' } }]);
  ok('a problem an undergrad reported arrives', EQP().some(p => p.id === 'pr1'));
  emit('eqproblems', [{ type: 'modified', id: 'pr1', data: { id: 'pr1', eq: 'e1', by: UNDERGRAD, desc: 'Blade chipped', status: 'resolved' } }]);
  ok('and resolving it travels too, because a problem does change',
     (EQP().find(p => p.id === 'pr1') || {}).status === 'resolved');
}
ok('a machine is retired with a flag, never deleted',
   /mr\.active=true/.test(appText) && state.deletes.length === 0);
ok('the drawer never calls delete at all', !/EQSYNC[\s\S]{0,2000}\.delete\(\)/.test(appText));

section('6. The eleventh read-out, and no switches');
ok('it has a read-out on the Shared database screen', /st:EQSYNC,\s*summary:eqsyncSummary\(\)/.test(appText));
ok('the read-out is in the list', /st:FSTSYNC[\s\S]{0,900}st:EQSYNC/.test(appText));
ok('it says in plain words what is being shared', /nobody walks out/.test(appText));
ok('and says who may report and who may take one down',
   /undergraduates included/.test(appText) && /Bill and the technicians/.test(appText));
ok('the summary reads in plain words',
   /a machine marked down stays known to this phone/.test(appText));
{
  as(BILL);
  const s = win.eqsyncSummary();
  ok('and a live one counts what went each way', /sent · .*received/.test(s), s);
}

/* ------------------------------------------------- 7. height of cut ------
   Dillon, 2026-09-28: he wanted the height of cut of every mower except the
   rotary ones written down. It lives ON THE MACHINE, because a reel unit is set
   up once on the grinder and then cuts everything it touches at that height
   until somebody changes the bedknife — the height belongs to the machine the
   same way the number of reels does.

   THE ROTARY MOWERS ARE LEFT OUT ON PURPOSE. A rotary deck is wound up and down
   per job, so one number on the machine would be a lie; those heights already
   live per PLOT in MGMT_DATA[plot].c, set on the plot's Mowing screen. If a
   future tidy-up "completes" this by giving the Z915Es a height too, the farm
   ends up with two answers for the same ground and no way to tell which is
   current. That is what the first few checks here are guarding.

   AND IT IS NOT A NEW DRAWER. Both the height and its history ride inside the
   machine's own record, which already travels and already says who may write
   it — so there is no new collection, no new permission rule and nothing for
   Dillon to publish by hand. The settling of that shape is checked in
   tools/test-sync-settles.js, where the machines sample now carries one. */
section('7. Height of cut — on the mowers that hold one, and not the rotaries');
{
  const byName = n => EQ().find(m => m.name === n);
  const triplex = byName('John Deere 2653');           /* Triplex reel mower */
  const walker  = byName('Dennis G860 #1');            /* Pedestrian Reel Mower */
  const zturn   = byName('John Deere Z915E #1');       /* Zero-Turn Rotary Mower */
  const push    = byName('Toro Recycler #1');          /* Pedestrian Rotary Mower */
  ok('the machines these checks name are all still on the farm',
     !!(triplex && walker && zturn && push));
  /* The fairway unit is checked by its TYPE rather than by its record, because
     section 5 above deliberately hands e1 a shared copy with no `type` on it to
     prove the drawer drops fields the server does not have. Reading that record
     here would be reading section 5's leftovers, and the check would be about
     the wrong thing. */

  ok('a fairway reel unit carries a height of cut',
     win.eqTakesHoc({ type: 'Fairway Reel Mower' }));
  ok('so does a triplex', win.eqTakesHoc(triplex));
  ok('and a walk-behind reel mower', win.eqTakesHoc(walker));
  ok('a zero-turn rotary does NOT — its deck is set per job, per plot',
     !win.eqTakesHoc(zturn));
  ok('nor does a pedestrian rotary', !win.eqTakesHoc(push));

  /* Everything that is not a mower is out, which is what keeps the box off the
     fifty-odd sprayers, blowers, trailers and trucks. The spreaders matter most
     here: three of them have the word "Rotary" in their type and are not mowers
     at all. */
  ['John Deere HD200', 'Kawasaki Mule 3010', 'Anderson #1', 'Dakota Turf Tender 410',
   'Stihl #1', 'Trailer #1', 'Foley 672 Accu-Pro'].forEach(n => {
    const m = byName(n);
    ok(('a ' + (m ? m.type : '?') + ' does not').toLowerCase(), !!m && !win.eqTakesHoc(m));
  });
  /* A fraise mower says "Mower" and is an implement, not a mowing machine —
     eqCatGuess tests implements first, and this is why. */
  ok('a fraise mower is an implement, so it holds no cut height',
     !win.eqTakesHoc(byName('GKB CB120')));
  ok('and an aerifier does not either', !win.eqTakesHoc(byName('Toro ProCore 648')));
  ok('nothing at all is not a mower', !win.eqTakesHoc(null) && !win.eqTakesHoc({}));

  /* ---- setting one, and remembering that it changed ---- */
  as(BILL);
  delete triplex.hoc; delete triplex.hocLog;
  ok('a change is recorded', win.eqHocSet(triplex, 0.5, BILL) === true);
  ok('and the machine now says what it cuts at', triplex.hoc === 0.5, String(triplex.hoc));
  ok('the history has one line', (triplex.hocLog || []).length === 1, JSON.stringify(triplex.hocLog));
  ok('which says what, when and who',
     triplex.hocLog[0].h === 0.5 && /^\d{4}-\d{2}-\d{2}$/.test(triplex.hocLog[0].at)
     && triplex.hocLog[0].by === BILL, JSON.stringify(triplex.hocLog[0]));

  /* Saving the machine without touching the height must not add a history line
     saying the height stayed the same, or the history becomes noise nobody
     reads and the record grows on every save. */
  ok('setting the same height again changes nothing', win.eqHocSet(triplex, 0.5, BILL) === false);
  ok('and leaves the history alone', triplex.hocLog.length === 1);
  ok('a string of the same number is still the same number',
     win.eqHocSet(triplex, '0.5', BILL) === false, JSON.stringify(triplex.hocLog));

  ok('a real change is recorded', win.eqHocSet(triplex, 0.625, BILL) === true);
  ok('newest first', triplex.hocLog[0].h === 0.625 && triplex.hocLog[1].h === 0.5,
     JSON.stringify(triplex.hocLog.map(x => x.h)));

  /* Taking a height off is a real event too — "nobody has written one down" and
     "it used to be half an inch" are different things to read on the page. */
  ok('clearing it is recorded as well', win.eqHocSet(triplex, '', BILL) === true);
  ok('and the machine reads as having none', triplex.hoc === null, String(triplex.hoc));
  ok('the history says it was cleared', triplex.hocLog[0].h === null);

  /* The list rides inside the machine's record, and a record that grows forever
     is a record every phone re-reads forever. */
  for (let i = 1; i <= win.EQ_HOC_MAX + 6; i++) win.eqHocSet(triplex, i / 8, BILL);
  ok('the history is capped', triplex.hocLog.length === win.EQ_HOC_MAX,
     triplex.hocLog.length + ' of ' + win.EQ_HOC_MAX);
  ok('and it is the OLDEST that falls off, not the newest',
     triplex.hocLog[0].h === (win.EQ_HOC_MAX + 6) / 8, String(triplex.hocLog[0].h));

  /* Firestore refuses a list inside a list, which is how every map edit was
     thrown away for a month. A list of small records is fine, and that is what
     this is. */
  const doc = JSON.parse(JSON.stringify(win.eqMachineDoc ? win.eqMachineDoc(triplex) : triplex));
  ok('what goes up carries the height and its history',
     doc.hoc === triplex.hoc && Array.isArray(doc.hocLog));
  ok('and no part of it is a list inside a list',
     doc.hocLog.every(x => x && typeof x === 'object' && !Array.isArray(x)
                        && Object.keys(x).every(k => !Array.isArray(x[k]))));

  ok('a height reads with the inch mark', win.eqHocText(0.5) === '0.5″', win.eqHocText(0.5));
  ok('and nothing reads as blank rather than as zero',
     win.eqHocText(null) === '' && win.eqHocText('') === '', JSON.stringify(win.eqHocText(null)));

  /* ---- the box on the edit screen follows what the machine IS ---- */
  const row = () => win.document.getElementById('eqe-hocrow');
  win.eqEditId = triplex.id; win.renderEqEdit();
  ok('editing a triplex shows the height box', row() && row().style.display !== 'none');
  ok('and it opens with the height already in it',
     win.document.getElementById('eqe-hoc').value === String(triplex.hoc), win.document.getElementById('eqe-hoc').value);

  win.eqEditId = zturn.id; win.renderEqEdit();
  ok('editing a rotary does not show it', row() && row().style.display === 'none');

  /* Both halves of "what the machine is" are editable on this screen, so the box
     has to react to the type text AND the category dropdown. Asking one and not
     the other is how a field goes missing for exactly the machines that need
     it. */
  const ty = win.document.getElementById('eqe-type');
  ty.value = 'Triplex reel mower';
  ty.dispatchEvent(new win.Event('input', { bubbles: true }));
  ok('retyping the type to a reel mower brings the box back', row().style.display !== 'none');
  ty.value = 'Zero-Turn Rotary Mower';
  ty.dispatchEvent(new win.Event('input', { bubbles: true }));
  ok('and typing it back to rotary takes it away again', row().style.display === 'none');

  win.eqEditId = null; win.renderEqEdit();
  const cat = win.document.getElementById('eqe-cat');
  ok('a brand-new machine is not asked for a height yet', row().style.display === 'none');
  cat.value = 'mower';
  cat.dispatchEvent(new win.Event('change', { bubbles: true }));
  ok('choosing Mowers on a new machine asks for one', row().style.display !== 'none');

  /* ---- saving through the form, which is what a person actually does ---- */
  win.eqEditId = triplex.id; win.renderEqEdit();
  const lines = triplex.hocLog.length;
  win.document.getElementById('eqe-hoc').value = '0.4375';
  win.document.getElementById('eqe-save').click();
  ok('the form saves a new height onto the machine', triplex.hoc === 0.4375, String(triplex.hoc));
  ok('and writes one history line for it', triplex.hocLog.length === lines, String(triplex.hocLog.length));
  ok('whose newest entry is the height just typed', triplex.hocLog[0].h === 0.4375);

  /* A height typed as a word or as zero would sit on the machine page looking
     like a real setting somebody would go to the grinder with. */
  win.eqEditId = triplex.id; win.renderEqEdit();
  win.document.getElementById('eqe-hoc').value = 'low';
  win.document.getElementById('eqe-save').click();
  ok('a height that is not a number is refused, leaving the old one', triplex.hoc === 0.4375, String(triplex.hoc));
  win.eqEditId = triplex.id; win.renderEqEdit();
  win.document.getElementById('eqe-hoc').value = '0';
  win.document.getElementById('eqe-save').click();
  ok('and so is zero', triplex.hoc === 0.4375, String(triplex.hoc));

  /* A machine that never had a height must not gain an empty field — the same
     care the category takes, and the reason is the same: a field nobody chose,
     written onto sixty records, is sixty writes from every phone. */
  const trailer = byName('Trailer #1');
  delete trailer.hoc; delete trailer.hocLog;
  win.eqEditId = trailer.id; win.renderEqEdit();
  win.document.getElementById('eqe-save').click();
  ok('saving a trailer gives it no height field at all',
     !('hoc' in trailer) && !('hocLog' in trailer), JSON.stringify({ h: trailer.hoc, l: trailer.hocLog }));

  /* ---- and it is readable on the machine's own page ---- */
  win.openMachine(triplex.id);
  const page = win.document.getElementById('eqd-body').textContent;
  ok('the machine page says what it cuts at', /Height of cut/.test(page));
  ok('and shows the height itself', page.indexOf('0.4375″') >= 0, page.slice(0, 400));
  ok('with its own history section, not buried among the oil changes',
     /Height of cut history/.test(page));
  win.openMachine(zturn.id);
  ok('a rotary machine page does not mention one at all',
     !/Height of cut/.test(win.document.getElementById('eqd-body').textContent));
  win.openMachine(walker.id);
  ok('a reel mower with none written down says so rather than leaving the row off',
     /Height of cut/.test(win.document.getElementById('eqd-body').textContent));

  /* No new drawer means no new rule to publish. If somebody later moves this
     into a collection of its own, this check fails and says why. */
  ok('the height rides in the machine record, so the rules needed no change',
     !/match \/(hoc|cutheights?)\//.test(rulesText));
  ok('and the machine rule still only pins the id and the name',
     /match \/equipment\/\{machineId\}/.test(rulesText));
}

/* ---------------------------------------------------------------- */
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
