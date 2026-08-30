/*
 * Where the app's code is, so no harness has to know.
 *
 * WHY THIS EXISTS. The app's JavaScript used to be entirely inside
 * UT-TurfFarm-App.html, so a harness could find all of it with one line:
 * "every <script> tag that has no src". On 2026-08-29 the biggest block moved
 * out into app-01-shell.js ... app-05-tasks-clock.js, and that one line
 * silently stopped seeing 10,800 lines of the app. Silently is the problem —
 * the tests would still have run, and still have passed, against an app that
 * was two thirds missing.
 *
 * So the rule now lives in ONE file. If the app is ever split further, or the
 * files renamed, this is the only place that has to know.
 *
 * HOW IT WORKS. jsdom is booted with runScripts:'outside-only', which means it
 * does NOT go and fetch a <script src>. So this walks the page's script tags in
 * document order and, for each one, hands back either the text written inside
 * the tag or the contents of the file it points at. Anything under vendor/ is
 * left out on purpose: Leaflet, Firebase and turf are other people's code, and
 * every harness stubs them itself.
 *
 * The result is the app's code in exactly the order a browser would run it.
 *
 * Three ways in:
 *     const { appScripts, appJs, appHtml } = require('./_app');
 *     appScripts(doc)  -> an array of source strings, in load order
 *     appJs(doc)       -> the same thing joined up, for searching the source
 *     appHtml()        -> the page itself, for checking the markup
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');

function appHtml() { return fs.readFileSync(APP, 'utf8'); }

/* Which line of UT-TurfFarm-App.html each inline <script> block's code starts
   on, in order — so a failure can name a line somebody can actually go and look
   at, rather than an offset into a string that only exists inside a harness.

   Anchored at column 0: the file writes its real tags there, and the word
   "<script>" also appears inside comments and inside a string that builds the
   print view. Matching those shifted every reported line number onto the wrong
   part of the file. */
function inlineStartLines() {
  const starts = [];
  appHtml().split('\n').forEach(function (ln, i) {
    if (/^<script(?![^>]*\bsrc=)[^>]*>/.test(ln)) starts.push(i + 2);
  });
  return starts;
}

/* Each piece of the app's own code, in the order the browser runs it, with the
   name of the file it came from and the line its first line really is. The name
   is what lets a failure point at somewhere a person can actually go and look.

   For a file of its own that is line 1. For a block still written inside
   UT-TurfFarm-App.html it is the line just after the opening tag. */
function appParts(doc) {
  const out = [];
  const inline = inlineStartLines();
  let nth = 0;
  doc.querySelectorAll('script').forEach(function (s) {
    const src = s.getAttribute('src');
    if (!src) {
      out.push({ file: 'UT-TurfFarm-App.html', code: s.textContent, startLine: inline[nth++] || 0 });
      return;
    }
    /* Other people's code. Every harness supplies its own stand-in. */
    if (/^vendor\//.test(src) || /^https?:/.test(src)) return;
    out.push({ file: src, code: fs.readFileSync(path.join(ROOT, src), 'utf8'), startLine: 1 });
  });
  return out;
}

function appScripts(doc) { return appParts(doc).map(function (p) { return p.code; }); }
function appJs(doc) { return appScripts(doc).join('\n;\n'); }

/* The page with the app's own code written back into it, exactly where its
   <script src> tags sit — which is what UT-TurfFarm-App.html was before
   2026-08-29.

   Several harnesses check things by SEARCHING THE SOURCE for a line: that a
   dangerous call is absent, that one thing appears before another, that a
   comment still explains why. Those searches used to read the page and find
   everything, because everything was in it. Splicing the files back in keeps
   every one of those checks meaning exactly what it meant before, instead of
   quietly passing because the text it was looking for had moved house.

   farm-geo.js is deliberately NOT spliced in: it moved out in a separate
   change long before this one, and no search has ever expected to find it. */
function appText() {
  return appHtml().replace(/^<script src="(app-\d\d-[a-z0-9-]+\.js)"><\/script>$/gm,
    function (whole, file) {
      try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
      catch (e) { return whole; }
    });
}

module.exports = { appHtml, appText, appParts, appScripts, appJs };
