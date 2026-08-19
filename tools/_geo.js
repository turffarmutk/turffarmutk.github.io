/*
 * farm-geo.js used to be six `var` lines inside UT-TurfFarm-App.html. It is now
 * a separate file the browser loads with <script src>. jsdom is booted here with
 * runScripts:'outside-only', which means it does NOT follow that src — so every
 * harness has to hand the geometry to the app itself, in the same order the
 * browser would: farm-geo.js first, then the app's own inline blocks.
 *
 * Every test does this the same way:
 *     const { appSource } = require('./_geo');
 *     win.eval(appSource(win.document) + '\n;window.__p={...};');
 */
const fs = require('fs');
const path = require('path');

const GEO = path.join(__dirname, '..', 'farm-geo.js');

function geoSource() { return fs.readFileSync(GEO, 'utf8'); }

/* The full script the app would have run, in document order, with the external
   farm-geo.js spliced in where its <script src> tag sits. */
function appSource(doc) {
  const inline = [...doc.querySelectorAll('script:not([src])')].map(s => s.textContent);
  return geoSource() + '\n;\n' + inline.join('\n;\n');
}

module.exports = { geoSource, appSource };
