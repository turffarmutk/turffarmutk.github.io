/*
 * Proves the database rules and the app agree — for every person on the
 * roster, against every other person, for every action.
 *
 * WHAT THIS CATCHES
 * `taskCan()` in the app decides which buttons appear. `firestore.rules`
 * decides what the database will accept. They are two copies of the farm's
 * organisation chart, and two copies drift. When they do, the copy that
 * drifted is the one that lets somebody put work on a person who does not
 * answer to them — or, just as bad, silently refuses work that should be
 * allowed and looks like the app is broken.
 *
 * WHAT IT CANNOT CATCH
 * Google's rules language only runs inside Firebase's local emulator, which
 * needs a program downloaded from Google's servers that this machine cannot
 * reach. So this runs a mirror of the rules (tools/rules-model.js), not the
 * rules themselves. It proves the LOGIC matches. It does not prove the file
 * parses — the console does that, and it refuses to publish a file it cannot
 * read, which is the check that matters for typos.
 *
 * Run:  node tools/test-rules.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');
const { appParts } = require('./_app');
const { rosterDoc, rulesCan, creditsWorker } = require('./rules-model');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const RULES = path.join(ROOT, 'firestore.rules');
const MODEL = path.join(__dirname, 'rules-model.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ---------------------------------------------------------------- app ---- */
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
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
try { win.eval(appSource(win.document)); }
catch (e) { console.log('app script threw: ' + e.message); fail++; }

const PEOPLE = win.PEOPLE || [];
const PIDS = PEOPLE.map(p => p.id);
const nameOf = id => { const p = PEOPLE.find(x => x.id === id); return p ? (p.first + ' ' + p.last + ' (' + p.role + ')') : id; };

/* ------------------------------------------------------------ 1. shape ---- */
section('1. The rules file is present and readable');
const rulesText = fs.existsSync(RULES) ? fs.readFileSync(RULES, 'utf8') : '';
ok('firestore.rules exists', rulesText.length > 0);
ok("declares rules_version = '2'", /rules_version\s*=\s*'2'/.test(rulesText));
ok('has a tasks block', /match \/tasks\/\{taskId\}/.test(rulesText));
ok('has a roster block', /match \/refdata\/roster/.test(rulesText));
ok('reads the roster id off the token, not the email',
   /request\.auth\.token\.pid/.test(rulesText) && !/token\.email/.test(rulesText));


/* --------------------------------------- 1b. the rules file hangs together - */
section('1b. The rules file is internally consistent');
{
  /* Not a parser — the console is the parser, and it refuses a file it cannot
     read. This catches the one class of mistake the console would catch only
     after a paste: a helper that is called but was never written. */
  const bal = (open, close) => {
    let n = 0;
    for (const ch of rulesText) { if (ch === open) n++; else if (ch === close) n--; if (n < 0) return false; }
    return n === 0;
  };
  ok('braces balance', bal('{', '}'));
  ok('brackets balance', bal('[', ']'));

  /* Comments talk ABOUT the app's function by name; strip them first. */
  const code = rulesText.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const defined = new Set([...code.matchAll(/function\s+([A-Za-z_]\w*)\s*\(/g)].map(m => m[1]));
  const builtins = new Set(['get', 'exists', 'hasAny', 'hasOnly', 'diff', 'affectedKeys', 'keys',
                            'values', 'size', 'matchAll', 'is', 'in', 'if', 'return', 'function']);
  const called = [...code.matchAll(/(?:^|[^\w.])([a-z][A-Za-z_]\w*)\s*\(/g)].map(m => m[1]);
  const undef = [...new Set(called)].filter(n => !defined.has(n) && !builtins.has(n));
  ok('every helper the rules call is defined in the file', undef.length === 0, undef.join(', '));

  ok('the four update moves are all present',
     /function isClaim\(/.test(rulesText) && /function isCompletion\(/.test(rulesText)
  && /function isAssignment\(/.test(rulesText) && /function isEdit\(/.test(rulesText));
  ok('a narrow move cannot touch fields it has no business touching',
     (rulesText.match(/hasOnly\(\[/g) || []).length >= 3);
  ok('createdBy can never be rewritten',
     /createdBy[^\n]*==[^\n]*resource\.data\.get\('createdBy'/.test(rulesText.replace(/\s+/g, ' ')));
}

/* ------------------------------------------------- 2. roster doc shape ---- */
section('2. The roster document carries everything the rules ask about');
const DOC = rosterDoc(PEOPLE);
ok('one entry per person on the roster', Object.keys(DOC.people).length === PIDS.length,
   Object.keys(DOC.people).length + ' vs ' + PIDS.length);
ok('every entry has a role', Object.keys(DOC.people).every(k => DOC.people[k].role));
ok('the assign_undergrads grant survives the trip',
   (DOC.people.p01.grants || []).indexOf('assign_undergrads') >= 0);
ok('Bill is the Farm Manager', DOC.people.p07 && DOC.people.p07.role === 'Farm Manager');

/* ------------------------------------------- 3. the every-pair sweep ------ */
section('3. Rules vs app — every person, every other person, every action');
const cases = [];
PIDS.forEach(a => {
  cases.push([a, 'create', {}, 'create']);
  cases.push([a, 'request', {}, 'request']);
  cases.push([a, 'claim', { assignee: null }, 'claim an open job']);
  cases.push([a, 'claim', { assignee: 'p18' }, 'claim a job already taken']);
  PIDS.forEach(b => {
    cases.push([a, 'assign', { assignee: b }, 'assign to ' + b]);
    cases.push([a, 'complete', { assignee: b }, 'complete ' + b + "'s job"]);
    cases.push([a, 'complete', { assignee: null, helpers: [b] }, 'complete a job ' + b + ' helps on']);
    cases.push([a, 'edit', { assignee: b, createdBy: b }, 'edit ' + b + "'s own job"]);
    cases.push([a, 'edit', { assignee: b, createdBy: a }, 'edit a job they raised for ' + b]);
    cases.push([a, 'delete', { assignee: b, createdBy: b }, 'delete ' + b + "'s own job"]);
    cases.push([a, 'delete', { assignee: null, createdBy: b }, 'delete an open job ' + b + ' raised']);
  });
});

let mismatches = [];
cases.forEach(([a, action, task, label]) => {
  const app = !!win.taskCan(a, action, task);
  const db = !!rulesCan(DOC, a, action, task);
  if (app !== db) mismatches.push(nameOf(a) + ' — ' + label + ': app says ' + app + ', database says ' + db);
});
ok(cases.length + ' checks, app and database agree on every one', mismatches.length === 0,
   mismatches.slice(0, 8).join(' | '));
if (mismatches.length > 8) console.log('        ...and ' + (mismatches.length - 8) + ' more');


/* ------------------------------------- 3b. the lab-assigned exception ----- */
section('3b. A lab-assigned undergrad, in both places');
{
  /* Covered by the sweep above, but named here so the intent survives:
     Lauren (p23) is an undergrad in Brosnan's lab. The other five carry
     Bill's own lab, which is how the pool is expressed. */
  const pairs = [
    ['p13', 'p23', true,  "her faculty advisor"],
    ['p05', 'p23', true,  "a technician in her lab"],
    ['p12', 'p23', true,  "a grad student in her lab"],
    ['p07', 'p23', true,  "Bill, who holds the job"],
    ['p02', 'p23', false, "a technician from another lab"],
    ['p16', 'p23', false, "faculty from another lab"],
    ['p05', 'p18', false, "a technician reaching into the pool"],
    ['p16', 'p20', false, "faculty reaching into the pool"]
  ];
  pairs.forEach(([a, b, want, label]) => {
    const app = win.taskCan(a, 'assign', { assignee: b });
    const db = rulesCan(DOC, a, 'assign', { assignee: b });
    ok(label + ' -> ' + (want ? 'may' : 'may not') + ' assign',
       app === want && db === want, 'app ' + app + ', database ' + db);
  });
}

/* --------------------------------------------- 4. people off the roster --- */
section('4. Somebody who is not on the roster, or has been switched off');
{
  const gone = { id: 'p99', first: 'Former', last: 'Employee', role: 'Technician', lab: 'Sorochan', active: false };
  win.PEOPLE.push(gone);
  const DOC2 = rosterDoc(win.PEOPLE);
  ['create', 'assign', 'claim', 'complete', 'edit', 'delete'].forEach(act => {
    const t = { assignee: 'p18', createdBy: 'p99' };
    ok('a deactivated person may not ' + act,
       win.taskCan('p99', act, t) === false && rulesCan(DOC2, 'p99', act, t) === false);
  });
  ok('an id that is not on the roster at all is refused',
     win.taskCan('p00', 'create', {}) === false && rulesCan(DOC2, 'p00', 'create', {}) === false);
  ok('nobody signed in is refused',
     win.taskCan('', 'create', {}) === false && rulesCan(DOC2, '', 'create', {}) === false);
  win.PEOPLE.pop();
}


/* ------------------------------------------- 4b. credit for the work ------ */
section('4b. Closing a job and doing it are not the same act');
{
  const job = { assignee: 'p18', helpers: ['p20'], createdBy: 'p07' };
  ok('the worker closing their own job is credited',
     creditsWorker(job, { completedBy: 'p18' }, 'p18'));
  ok('a helper on the job can be credited',
     creditsWorker(job, { completedBy: 'p20' }, 'p07'));
  ok('Bill closing on their behalf still credits the worker',
     creditsWorker(job, { completedBy: 'p18' }, 'p07'));
  ok('Bill cannot credit somebody who was never on the job',
     !creditsWorker(job, { completedBy: 'p09' }, 'p07'));
  ok('a closer may credit themselves if they did it',
     creditsWorker({ assignee: null }, { completedBy: 'p07' }, 'p07'));
  ok('a completion with nobody credited is refused',
     !creditsWorker(job, { completedBy: null }, 'p07'));
}

/* -------------------------------------------- 5. the two files' words ----- */
section('5. The rules file and its mirror use the same words');
const modelText = fs.readFileSync(MODEL, 'utf8');
const wordsIn = txt => {
  const found = new Set();
  ['Farm Manager', 'Faculty', 'Technician', 'Graduate Student', 'Undergraduate Student',
   'assign_undergrads', 'assignee', 'helpers', 'createdBy', 'completedBy'].forEach(w => {
    if (txt.indexOf(w) >= 0) found.add(w);
  });
  return found;
};
const inRules = wordsIn(rulesText), inModel = wordsIn(modelText);
const onlyRules = [...inRules].filter(w => !inModel.has(w));
const onlyModel = [...inModel].filter(w => !inRules.has(w));
ok('no role, grant or field name appears in one file but not the other',
   onlyRules.length === 0 && onlyModel.length === 0,
   ['rules only: ' + onlyRules.join(','), 'mirror only: ' + onlyModel.join(',')].join(' | '));

/* ------------------------------------ 6. the app stamps what rules need --- */
section('6. Every new task carries the fields the database will insist on');
/* Read every file the app is made of, not just the page — most of this code
   moved into app-05-tasks-clock.js on 2026-08-29. Each line is remembered with
   the file it came from, so a failure names somewhere a person can open. */
const creations = [];
let appText = '';
appParts(win.document).forEach(part => {
  appText += part.code + '\n';
  part.code.split('\n').forEach((line, i) => {
    if (/TASKS\.(push|unshift)\(\{/.test(line)) creations.push({ line, where: part.file + ':' + (part.startLine + i) });
  });
});
ok('found the places that create a task', creations.length > 0, creations.length + ' found');
const missing = creations.filter(x => !/createdBy\s*:/.test(x.line));
ok('every one stamps createdBy — the rules reject a task without it',
   missing.length === 0, missing.map(x => x.where).join(', '));
ok('the assembled task in pushAssign() stamps createdBy',
   /base\.createdBy\s*=|createdBy\s*:\s*SESSION\.pid/.test(appText));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
