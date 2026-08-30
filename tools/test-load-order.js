/*
 * Harness: does any file reach forward into one that has not loaded yet?
 *
 * WHY THIS EXISTS, in plain words. The app is six files, and the browser runs
 * them strictly one after another. Inside ONE file, a function can be written
 * at the bottom and called from the top — the browser reads the whole file
 * first, so it already knows the function is there. ACROSS files it cannot do
 * that. When app-01 is running, app-02 has not been read yet, so a function
 * that lives in app-02 does not exist yet. Calling it right then throws, and
 * everything below the throw in app-01 never happens.
 *
 * THIS ALREADY HAPPENED ONCE, on the very day the files were split
 * (2026-08-29). One line at the bottom of app-01 called flStampWho(), which
 * had landed in app-02. The app died on opening — and the whole test suite,
 * all 1,700 checks, passed anyway.
 *
 * That is the part worth understanding, because it is the reason this file is
 * separate from test-boot.js. test-boot has to glue every file into one string
 * and run that, because the app's top-level `let` and `const` are shared
 * between files in a real browser and would stop being shared if the files
 * were run separately. But glued into one string, the bottom-of-app-01 call
 * finds flStampWho perfectly well — the very mistake it should be catching is
 * the thing the gluing hides. Only opening the app in a browser found it.
 *
 * So this reads the files instead of running them.
 *
 * HOW IT WORKS. For each file, in load order:
 *   - collect every name the file defines at its top level, and
 *   - find the statements that RUN as the file loads: a bare call like
 *     prefsLoad(); and the (function(){ ... })() blocks.
 * A name used by one of those statements has to be defined in the same file or
 * an earlier one. If it is defined in a LATER file, that is the bug.
 *
 * Only the statements at the top level of those blocks are read. A call
 * written INSIDE a function that the block merely hands to something else —
 * an event listener, a setTimeout — does not run while the file is loading,
 * so it is allowed to point anywhere and is skipped on purpose.
 *
 * Nothing here needs editing when the app grows: the file list comes from the
 * page itself, through tools/_app.js.
 *
 * Run:  node tools/test-load-order.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { appHtml, appParts } = require('./_app');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        -> ' + extra.split('\n').join('\n        ') : '')); }
}
function section(s) { console.log('\n' + s); }

/* Comments and strings talk about function names constantly, and a name inside
   a comment is not a call. Blanking them out first is cruder than parsing the
   language properly and quite a lot easier to read. Length is preserved so
   line numbers still line up with the real file. */
function blank(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, ' '))
    .replace(/'(?:\\.|[^'\\\n])*'/g, m => "'" + ' '.repeat(m.length - 2) + "'")
    .replace(/"(?:\\.|[^"\\\n])*"/g, m => '"' + ' '.repeat(m.length - 2) + '"')
    .replace(/`(?:\\.|[^`\\])*`/g, m => m.replace(/[^\n]/g, ' '));
}

/* Every name declared at the very start of a line — which, in this app, means
   at the top level of its file. */
function definedNames(src) {
  const set = new Set();
  (blank(src).match(/^(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/gm) || [])
    .forEach(m => set.add(m.split(/\s+/)[1]));
  return set;
}

/* The stretches of a file that actually execute while it is loading, with the
   bodies of any nested functions removed — those are definitions being handed
   around, not calls being made now. */
function runsAtLoad(src) {
  const lines = blank(src).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const isIife = /^\(function\s*\(|^\(\(\s*\)\s*=>/.test(ln);
    const isCall = /^[A-Za-z_$][\w$]*\s*\(/.test(ln) && !/^(function|if|for|while|switch|catch|return)\b/.test(ln);
    if (!isIife && !isCall) continue;

    /* Take the whole statement: follow the braces until they close again. */
    let depth = 0, j = i, text = '';
    do {
      text += lines[j] + '\n';
      for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      j++;
    } while (depth > 0 && j < lines.length);

    /* A (function(){ ... })() runs its OWN body right now — that body is the
       whole point, so it must not be stripped as if it were a definition being
       passed somewhere. Step inside it first, then strip what is nested in
       there. Getting this backwards is not hypothetical: the first draft of
       this file stripped the outer body too, and so agreed happily that the
       very bug it was written to catch was fine. */
    out.push({ line: i + 1, text: stripNested(isIife ? insideOuterBraces(text) : text) });
    i = j - 1;
  }
  return out;
}

/* What sits between a block's first { and its matching }. */
function insideOuterBraces(text) {
  const open = text.indexOf('{');
  if (open < 0) return text;
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}') { depth--; if (depth === 0) return text.slice(open + 1, k); }
  }
  return text.slice(open + 1);
}

/* Cut out the body of every nested `function`, keeping what is left. A call
   inside one of those runs later — when a button is tapped, when a timer goes
   off — by which point every file has loaded and anything is fair game. */
function stripNested(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const m = /\bfunction\b/.exec(text.slice(i));
    if (!m) { out += text.slice(i); break; }
    const at = i + m.index;
    const open = text.indexOf('{', at);
    if (open < 0) { out += text.slice(i); break; }
    out += text.slice(i, at);
    let depth = 0, k = open;
    for (; k < text.length; k++) {
      if (text[k] === '{') depth++;
      else if (text[k] === '}') { depth--; if (depth === 0) { k++; break; } }
    }
    i = k;
  }
  return out;
}

/* ---------------------------------------------------------------- */
const dom = new JSDOM(appHtml(), { runScripts: 'outside-only', url: 'https://localhost/' });
const parts = appParts(dom.window.document);

section('1. the app is more than one file, so this check has something to do');
ok('found the app\'s files, in the order the browser runs them', parts.length > 1,
   parts.map(p => p.file).join(' -> '));

section('2. nothing calls forward into a file that has not loaded yet');
const defined = parts.map(p => definedNames(p.code));

parts.forEach((part, i) => {
  const known = new Set();
  defined.slice(0, i + 1).forEach(d => d.forEach(n => known.add(n)));
  const laterFile = new Map();
  for (let k = parts.length - 1; k > i; k--) defined[k].forEach(n => laterFile.set(n, parts[k].file));

  const problems = [];
  runsAtLoad(part.code).forEach(stmt => {
    const called = [...stmt.text.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
    [...new Set(called)].forEach(n => {
      if (!known.has(n) && laterFile.has(n)) {
        problems.push(part.file + ':' + (part.startLine + stmt.line - 1)
          + '  calls ' + n + '(), which is not written until ' + laterFile.get(n));
      }
    });
  });

  ok(part.file + ' only uses what has already loaded', problems.length === 0,
     problems.length
       ? problems.join('\n')
         + '\n\nThis crashes the app as it opens, and everything below the call in'
         + '\n' + part.file + ' never runs. Nothing on screen says so.'
         + '\nEither move the call into the later file, or move what it needs earlier.'
       : null);
});

/* ---------------------------------------------------------------- */
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
