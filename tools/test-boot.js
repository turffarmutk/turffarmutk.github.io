/*
 * Harness: does the app survive being opened at all?
 *
 * This is the cheapest and most important check in the suite, and it is the
 * one that was missing. Run it FIRST — everything else assumes the app booted.
 *
 * WHY IT EXISTS. The app is six pieces of code: app-01-shell.js through
 * app-05-tasks-clock.js, plus the blocks still written inside
 * UT-TurfFarm-App.html. If any top-level line in one of them throws, the
 * browser abandons THE REST OF THAT FILE and moves on to the next one. Every
 * function below the throw simply never comes into existence.
 *
 * Nothing about that is visible. The page still renders, the header still
 * draws, sign-in still works. What is gone is whatever happened to live below
 * the crash — and you only find out when somebody taps Time Clock in a field
 * and nothing happens.
 *
 * That shipped. On 2026-08-27 a top-level renderBoard() call sat ~400 lines
 * above the ASMON/ASDOW arrays it read through asDateLabel(). `var` hoists but
 * its VALUE does not, so the arrays were undefined, reading one threw, and the
 * calendar, the time clock, semester dates, farm settings and admin — about
 * 2,200 lines — stopped existing on every phone. It was live for two days.
 *
 * That is also WHY THE APP WAS SPLIT INTO FILES on 2026-08-29. The hole a
 * crash leaves is the size of the file it happens in, and one of them used to
 * be 10,800 lines. Nothing about the code changed — only how much of it a
 * single mistake can take down.
 *
 * HOW IT WORKS. A marker is appended to the end of every piece. They are then
 * run the way the browser runs them. A piece whose marker is missing did not
 * reach its own last line, which means it threw, and the error is reported
 * against the real file and line number.
 *
 * The markers are generated, not maintained, and tools/_app.js is the only
 * thing that knows where the app's code lives — so this harness needs no
 * editing when the app grows or is split further.
 *
 * Run:  node tools/test-boot.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appParts } = require('./_app');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');
const HTML = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        -> ' + extra.split('\n').join('\n        ') : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- a Leaflet that does nothing, agreeably ------------------------------
   Boot only needs L to not throw; the map's real behaviour is covered by
   test-field-position.js. Every property is a function returning the same
   object, so any chain the app writes keeps working. */
function makeL() {
  const noop = function () { return proxy; };
  const proxy = new Proxy(noop, {
    get(t, k) {
      if (k === 'then') return undefined;            /* not a promise */
      if (k === Symbol.toPrimitive) return () => 0;  /* survives arithmetic */
      return proxy;
    },
    apply() { return proxy; }
  });
  return proxy;
}

/* ---- boot it the way a browser would ------------------------------------ */
const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', e => jsdomErrors.push(e.message));

const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;

win.L = makeL();
win.turf = turf;
win.firebase = makeL();
win.BroadcastChannel = class { constructor() {} postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null),
           setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } },
  configurable: true
});
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {} };

/* Every piece of the app's own code, in the order a browser runs it — the five
   app-*.js files, farm-geo.js, and the blocks still written inside the page.
   _app.js is the only thing that knows where they all are. */
const blocks = appParts(win.document);

/* They are joined into one eval rather than run separately, because the app's
   top-level `let` bindings are shared across files in a browser and a separate
   eval would keep each one to itself. */
const parts = [];
blocks.forEach((b, i) => {
  parts.push(b.code);
  parts.push('window.__block' + i + '=true;');
});
const source = parts.join('\n;\n');

/* Which eval line each piece's code starts on, so an error can be translated
   back to a real file and a real line in it. */
const evalStart = [];
{
  let n = 0;
  blocks.forEach((b, i) => {
    evalStart[i] = n + 1;
    n += b.code.split('\n').length + 1;             /* the code */
    n += 1 + 1;                                     /* the marker line */
  });
}
function realLine(evalLine) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (evalLine >= evalStart[i]) {
      const off = evalLine - evalStart[i];
      return { block: i, file: blocks[i].file, line: blocks[i].startLine + off };
    }
  }
  return null;
}

let threw = null;
try { win.eval(source); }
catch (e) {
  const m = /<anonymous>:(\d+):(\d+)/.exec(e.stack || '');
  const at = m ? realLine(+m[1]) : null;
  threw = { message: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join('\n'), at };
}

/* ================================================================ tests == */

section('1. the app opens without throwing');
ok('no error while the app boots', !threw,
   threw && (threw.message
     + (threw.at ? '\n' + threw.at.file + ':' + threw.at.line : '')
     + '\n' + threw.stack));

section('2. every file of the app runs to its last line');
/* A block that starts but does not finish is the dangerous case: the page
   renders, so it looks like it worked, and everything below the throw is gone.

   ONE THING TO KNOW WHEN READING A FAILURE HERE. A real browser runs each
   file separately, so a throw in app-02 does not stop app-03 and app-04. This
   harness has to join them into one eval — the app's top-level `let` bindings
   are shared across files in a browser, and separate evals would keep each one
   to itself — so the first file to throw also marks every file after it as
   unfinished. Fix the FIRST failure and the rest usually go with it. Erring this way is deliberate: over-reporting is recoverable, and a
   harness that quietly under-reports a boot crash is the thing that let the
   2026-08-27 bug ship. */
blocks.forEach((b, i) => {
  const n = b.code.split('\n').length;
  ok(b.file + (b.startLine > 1 ? ' (line ' + b.startLine + ', ' : ' (') + n + ' lines) finished',
     win['__block' + i] === true,
     win['__block' + i] === true ? null
       : 'It stopped partway. Everything below the throw in this file never'
         + '\nran — those functions do not exist. See failure 1 for where.');
});

section('3. jsdom reported no uncaught errors');
ok('nothing landed on the window error handler', jsdomErrors.length === 0, jsdomErrors.join('\n'));

section('4. the screens the crash of 2026-08-27 took out');
/* Not an exhaustive list — a spot check that reads like the app. Each of these
   lives near the bottom of the big block, which is what makes them a canary. */
[['asDateLabel', 'due dates on the task board'],
 ['calEnter', 'the calendar'],
 ['renderCalBody', 'the calendar grid'],
 ['tcEnter', 'the time clock'],
 ['fstRender', 'farm settings'],
 ['admRender', 'the admin screen'],
 ['renderBoard', 'the task board']].forEach(([fn, what]) => {
  ok(what + ' (' + fn + ')', typeof win[fn] === 'function');
});
/* ASDOW/ASMON are the two the board actually read while they were undefined. */
ok('the day and month names are filled in',
   Array.isArray(win.ASDOW) && win.ASDOW.length === 7 && Array.isArray(win.ASMON) && win.ASMON.length === 12);

section('5. nothing draws a screen before the app is defined');
/* The rule that keeps this from happening again: a render call at the top
   level belongs at the END of its own file, below everything it might reach. */
blocks.forEach(b => {
  const lines = b.code.split('\n');
  const early = [];
  lines.forEach((ln, j) => {
    const m = /^(render|draw)[A-Z][A-Za-z0-9_$]*\(\s*\)\s*;\s*$/.exec(ln);
    /* only flag one that is NOT in the last 40 lines of its file */
    if (m && j < lines.length - 40) early.push('line ' + (b.startLine + j) + ': ' + ln.trim());
  });
  ok(b.file + ' has no render call stranded partway through it', early.length === 0,
     early.length ? early.join('\n') + '\nMove it to the end of the file.' : null);
});

/* ---------------------------------------------------------------- */
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
