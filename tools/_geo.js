/*
 * farm-geo.js used to be six `var` lines inside UT-TurfFarm-App.html. It is now
 * a separate file the browser loads with <script src>. jsdom is booted with
 * runScripts:'outside-only', which means it does NOT follow that src — so every
 * harness has to hand the geometry to the app itself.
 *
 * geoSource() is that file's contents, for a harness that only wants the plot
 * shapes.
 *
 * appSource() is the whole app, and it now lives in _app.js — because since
 * 2026-08-29 the app is six files rather than one, and only one place should
 * have to know that. It is kept here so the harnesses that already ask this
 * file for it keep working.
 *
 *     const { appSource } = require('./_geo');
 *     win.eval(appSource(win.document) + '\n;window.__p={...};');
 */
const fs = require('fs');
const path = require('path');
const { appJs } = require('./_app');

const GEO = path.join(__dirname, '..', 'farm-geo.js');

function geoSource() { return fs.readFileSync(GEO, 'utf8'); }

/* The full script the app would have run, in document order. farm-geo.js is
   picked up automatically now: it is a <script src> in <head> like the app's
   own files, so _app.js splices it in where its tag actually sits. */
function appSource(doc) { return appJs(doc); }

module.exports = { geoSource, appSource };
