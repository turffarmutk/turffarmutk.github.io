/*
 * THE APP MANAGER HAS NO RESTRICTIONS.        (Dillon, 2026-09-29)
 *
 * Whoever holds the App Manager post answers yes to every permission in the
 * app: writing a study for a lab that is not theirs, correcting somebody
 * else's record, changing a setting that is normally Bill's, and Bill's own
 * view of the Task Board. The post is a claim on the sign-in token, so the
 * same question is asked the same way in firestore.rules.
 *
 * THIS FILE EXISTS FOR ONE REASON. A rule like that is only true while
 * somebody remembers it. The next person to add a permission function will not
 * know about it — section 1 below walks the source and FAILS if a function
 * named like a permission does not lift for the App Manager, so it cannot be
 * forgotten quietly, which is the only way it would ever be forgotten.
 *
 * Section 4 is the other half and matters just as much: the app and the
 * database must lift for the SAME person on the SAME evidence. A permission
 * the app grants and the database refuses is a tap that quietly undoes itself
 * a second later — the third trap in CLAUDE.md, which went unnoticed on this
 * farm for a month.
 *
 * Run:  node tools/test-app-admin.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const RULES = path.join(ROOT, 'firestore.rules');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ------------------------------------------------------------------ boot -- */
const vc = new VirtualConsole();
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
                 : (k === 'getContainer') ? () => null : chain()),
  apply: () => chain()
});
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };

const parts = require('./_app').appParts(win.document);
/* IS_APP_ADMIN and currentRole are `let`/`var` inside the app; the two the
   harness has to be able to SET are reached through functions, so nothing here
   depends on which keyword the app happens to use. */
try {
  win.eval(parts.map(p => p.code).join('\n;\n')
    + '\n;window.__hat=function(on){ if(on) signInAdmin(); else signOutAdmin(); return rstIsAdmin(); };'
    + '\n;window.__role=function(){ return currentRole; };'
    + '\n;window.__homeFor=function(r){ return HOME_DEST[r]; };');
} catch (e) { console.log('app script threw: ' + e.message); fail++; }

const rulesText = fs.readFileSync(RULES, 'utf8');

/* ============================================================ 1. the guard ==
   Every permission function in the app lifts for the App Manager. Walked out
   of the source rather than listed here, so a new one is caught on the day it
   is written instead of the day somebody notices it does not work. */
section('1. Every permission function in the app lifts for the App Manager');

/* What counts as a permission function: the name says so. `xxxCanYyy`,
   `canXxx`, or one of the three the farm's chart is written in (taskCan,
   mapCan, flCan). */
const LOOKS_LIKE_PERMISSION = /^(?:[a-z][A-Za-z0-9]*Can[A-Z][A-Za-z0-9]*|[a-z][A-Za-z0-9]*Can|can[A-Z][A-Za-z0-9]*)$/;

/* Named exceptions, each with the reason written down. Anything NOT on this
   list has to lift, so adding to it is a deliberate act somebody reviews. */
const EXEMPT = {
  /* Not a permission at all — how much paint N cans hold. */
  paintCanAmount: 'arithmetic, not a permission',
  /* The record is NAMED after the person whose stars it holds, and
     firestore.rules says the same (favId == me()). That is which record this
     phone owns, not a restriction on anybody — and overriding it would send up
     a write the database refuses. The star itself is favCanUse(). */
  favCanPush: 'identity of the record, enforced identically by the rules',
  /* Pure pass-throughs whose own guard rejects a missing record first, then
     ask a function that DOES lift. Listed so the walk stays honest about
     them rather than matching a substring and calling it covered. */
  schCanPush: 'passes through to schedCanEdit(), which lifts',
  tcCanPush: 'passes through to tcCanPunchFor(), which lifts',
  rstCanPush: 'passes through to rosterCanWrite(), which lifts',
  photoCanWrite: 'passes through to photoCanSet()/photoCanClear(), which lift',
  phCanPush: 'passes through to photoCanWrite(), which passes through to both of those',
  trsyncCanPushTrial: 'passes through to trCanEditLab(), which lifts',
  trsyncCanPushLift: 'passes through to trCanEditLab()/trCanLiftAny(), which lift',
  trCanEdit: 'passes through to trCanEditLab(), which lifts',
  /* Not a permission — whether there is a hand stroke of your own left to
     undo. Nobody is being refused anything. */
  paintCanUndo: 'is there anything to undo, not may you undo it'
};

const found = [];
parts.forEach(p => {
  const lines = p.code.split('\n');
  lines.forEach((ln, i) => {
    const m = /^function ([A-Za-z0-9_]+)\s*\(/.exec(ln);
    if (!m) return;
    const name = m[1];
    if (!LOOKS_LIKE_PERMISSION.test(name)) return;
    /* The whole function, so the override counts wherever in it it sits --
       several are deliberately below a guard that rejects a missing record. */
    let depth = 0, body = '', started = false;
    for (let j = i; j < lines.length; j++) {
      body += lines[j] + '\n';
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
      }
      if (started && depth <= 0) break;
    }
    found.push({ name, file: p.file, line: p.startLine + i, body });
  });
});

ok('the walk found the permission functions at all', found.length >= 45, String(found.length));

const naked = found.filter(f => !EXEMPT[f.name] && f.body.indexOf('appAdminAll(') < 0);
ok('and every one of them lifts for the App Manager', naked.length === 0,
   naked.map(f => f.name + ' (' + f.file + ':' + f.line + ')').join(', '));

/* The exemptions have to still exist. One deleted or renamed without this list
   being updated would silently stop being checked. */
Object.keys(EXEMPT).forEach(n => {
  ok('the exemption for ' + n + ' still names a real function',
     found.some(f => f.name === n) || n === 'paintCanAmount');
});

/* The three named in the farm's organisation chart take the ACTOR as their
   first argument, and plenty of places ask them about other people. The hat
   must only ever lift for the person wearing it. */
['taskCan', 'mapCan', 'flCan'].forEach(n => {
  const f = found.filter(x => x.name === n)[0];
  ok(n + '() passes its own actor to the override', !!f && /appAdminAll\(actor\)/.test(f.body));
});

/* ================================================ 2. with the hat off ====== */
section('2. With the hat off, nothing changed for anybody');
win.__hat(false);
win.sessionSet('p18');                       /* Garrett, an undergraduate */
ok('an undergrad still may not redefine a product', win.invCanEdit() === false);
ok('nor edit the task list', win.tplCanEdit() === false);
ok('nor write a study for a lab', win.trCanEditLab('Sorochan') === false);
win.sessionSet('p01');                       /* Dillon: Technician, Sorochan lab */
ok('Dillon writes his own lab\'s study', win.trCanEditLab('Sorochan') === true);
ok('but not Brosnan\'s, with the hat off', win.trCanEditLab('Brosnan') === false);
ok('and the Task Board is not Bill\'s', win.actsAsManager() === false);

/* ============================================== 3. with the hat on ========= */
section('3. With the hat on, there are no restrictions');
win.__hat(true);
ok('the post is held', win.rstIsAdmin() === true);
ok('and it did NOT take over his farm role', win.__role() === 'tech', win.__role());

/* The one Dillon asked for by name. */
section('3a. A study for any lab');
const labs = win.FARM_LABS.filter(l => l.pi).map(l => l.name);
ok('there is more than one lab to test with', labs.length > 1, String(labs.length));
ok('every lab on the farm is writable',
   labs.every(L => win.trCanEditLab(L) === true),
   labs.filter(L => !win.trCanEditLab(L)).join(','));
ok('including one that is not his own', win.trCanEditLab('Brosnan') === true);
ok('the new-study form is offered every lab, so it opens on a real one',
   win.trMyLabs().length === labs.length, win.trMyLabs().join(','));
ok('and the ＋ Add a study button is there', win.trCanCreate() === true);
ok('he sees every study at every stage, not just the active ones',
   win.trSeesAll() === true);
ok('he lifts anybody\'s restriction', win.trCanLiftAny() === true);
/* A blank lab is still not a lab. That is the shape of the record, and it is
   the one thing here the hat deliberately does not lift. */
ok('but a study still cannot be filed under no lab at all',
   win.trCanEditLab('') === false && win.trCanEditLab('—') === false);

section('3b. Everything else on the app');
[['invCanEdit', 'redefine a product'],
 ['invCanMove', 'move stock'],
 ['tplCanEdit', 'edit the task list'],
 ['eqCanEdit', 'edit a machine'],
 ['eqCanMaint', 'write a service record'],
 ['sprCanEdit', 'change the spray settings'],
 ['labsCanEdit', 'change the labs'],
 ['semCanEdit', 'change the semester dates'],
 ['mowCanEdit', 'change the mowers'],
 ['resTypesCanEdit', 'change the restriction types'],
 ['trialCatsCanEdit', 'change the study categories'],
 ['bugCanConfig', 'change where bug reports go'],
 ['peCanEdit', 'edit a plot shape'],
 ['flCanChem', 'log a chemical application'],
 ['tcCanEditPunches', 'fix a time clock punch'],
 ['clockCutCanEdit', 'change the clock cut-off'],
 ['rstCanOpen', 'open the roster'],
 ['favCanUse', 'star a job']
].forEach(([fn, what]) => ok('he may ' + what, win[fn]() === true, fn));

ok('he may fix anybody\'s schedule', win.schedCanEdit('p18') === true);
ok('and punch for anybody', win.tcCanPunchFor('p18') === true);
ok('he may edit a faculty record', win.rstCanEdit({ role: 'Faculty', lab: 'Brosnan' }) === true);
ok('he may edit and delete somebody else\'s log entry',
   win.flCan('p01', 'edit', { person: 'p09', loggedBy: 'p09' }) === true
   && win.flCan('p01', 'delete', { person: 'p09', loggedBy: 'p09' }) === true);
ok('he may assign, edit and delete anybody\'s task',
   ['assign', 'edit', 'delete', 'complete', 'claim', 'create']
     .every(a => win.taskCan('p01', a, { assignee: 'p09', createdBy: 'p09' }) === true));
/* A REQUEST is the one thing on a task only its author may delete, since
   2026-09-30 -- Bill and a faculty advisor both lost the bin on somebody
   else's. The hat lifts that too, like every other permission. */
ok('and delete a request somebody else raised',
   win.taskCan('p01', 'delete', { kind: 'request', assignee: null,
                                  createdBy: 'p09', requestedBy: 'p09' }) === true);

section('3c. Bill\'s view of the Task Board, which is what Dillon asked for');
ok('the board reads as the manager\'s', win.actsAsManager() === true);
/* The post is a hat worn on top of a farm job. Sending him to Bill's home
   screen is exactly what left him unable to reach his own work in 2026-08-25,
   so actsAsManager() is deliberately NOT used for that. */
ok('but his home screen is still his own', win.lgHome() === win.__homeFor('tech'),
   win.lgHome());

section('3d. The hat lifts for the wearer, and nobody else');
ok('asking about somebody else is still a no',
   win.appAdminAll('p09') === false);
ok('asking about the wearer is a yes', win.appAdminAll('p01') === true);
ok('asking about nobody in particular means the wearer', win.appAdminAll() === true);
ok('so a task check about another person is unaffected',
   win.taskCan('p18', 'edit', { assignee: 'p09', createdBy: 'p09' }) === false);
/* A missing record is not a restriction either -- there is nothing to permit. */
ok('and there is still nothing to permit on a record that is not there',
   win.trCanEdit(null) === false && win.rstCanEdit(null) === false);

win.__hat(false);
ok('taking the hat off puts everything back',
   win.trCanEditLab('Brosnan') === false && win.actsAsManager() === false);

/* ================================= 4. the database says the same thing ===== */
section('4. The database lifts for the same person, on the same evidence');
ok('the rules have an appAdmin()', /function appAdmin\(\) \{/.test(rulesText));
/* THE SAME CLAIM, read the same way. If these two ever name different things,
   the app offers a button the database refuses and the tap undoes itself. */
ok('and it reads the app_admin claim off the token',
   /request\.auth\.token\.app_admin == true/.test(rulesText));
ok('the app reads that same claim, through the sign-in token',
   /app_admin/.test(require('./_app').appText()));

/* Every permission function in the rules opens with it. Walked out of the file
   for the same reason as section 1. */
const ruleFns = [];
rulesText.split('\n').forEach((ln, i) => {
  const m = /^    function ((?:can|lifts|calMayAdd)[A-Za-z0-9_]*)\(/.exec(ln);
  if (m) ruleFns.push({ name: m[1], line: i + 1 });
});
ok('the walk found the rules\' permission functions', ruleFns.length >= 20, String(ruleFns.length));

/* The four branches of taskCan() are lifted at their own `allow` lines instead,
   because each of those also carries a shape check that stays for everybody. */
const AT_THE_ALLOW = ['canCreate', 'canAssignTo', 'canDirectUndergrad', 'canClaim',
                      'canComplete', 'canEdit'];
const nakedRules = ruleFns.filter(f => {
  if (AT_THE_ALLOW.indexOf(f.name) >= 0) return false;
  const body = rulesText.slice(rulesText.indexOf('function ' + f.name + '('));
  return body.slice(0, body.indexOf('\n    }')).indexOf('appAdmin()') < 0;
});
ok('and every one of them lifts for the App Manager', nakedRules.length === 0,
   nakedRules.map(f => f.name + ' (firestore.rules:' + f.line + ')').join(', '));

AT_THE_ALLOW.forEach(() => {});
ok('the task rules lift at the allow line instead, where the shape check lives',
   (rulesText.match(/allow (create|update|delete): if \(?appAdmin\(\)/g) || []).length >= 4);

section('4a. What the hat deliberately does NOT lift');
/* Dillon's call, 2026-09-29: append-only ledgers and tombstones are the SHAPE
   of a record, not a permission. A genuinely deleted document comes straight
   back off the next phone that reconnects still holding its own copy. */
ok('nothing gained a delete it did not have',
   !/allow delete: if appAdmin\(\);/.test(rulesText));
ok('the stock ledger is still append only',
   /match \/invmoves\/\{moveId\}[\s\S]*?allow update: if false;[\s\S]*?allow delete: if false;/.test(rulesText));
ok('the service history is still write-once',
   /match \/eqmaint\/\{recordId\}[\s\S]*?allow update: if false;/.test(rulesText));
/* Scoped to the block itself. An unbounded [\s\S]*? would run on into the
   punches below and find their appAdmin() instead, which is the sort of
   false pass this whole file exists to prevent. */
const favBlock = (rulesText.match(/match \/favorites\/\{favId\} \{[\s\S]*?\n    \}/) || [''])[0];
ok('favorites are still the document named after the person',
   /favId == me\(\)/.test(favBlock) && favBlock.indexOf('appAdmin()') < 0,
   favBlock.slice(0, 120));
/* A record filed under one name may not claim to be another, for anybody. */
ok('a record still cannot be filed under the wrong name',
   /request\.resource\.data\.id == taskId/.test(rulesText)
   && /request\.resource\.data\.id == entryId/.test(rulesText));
ok('and a study still cannot be filed under no lab',
   /lab is string && lab != '' && lab != '—'/.test(rulesText));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
