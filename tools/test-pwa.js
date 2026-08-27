/*
 * Harness for the installable app — manifest, icons and service worker.
 *
 * What it pins:
 *   1. Manifest     — the fields a browser needs before it will offer to
 *                     install, and icons that are the size they claim.
 *   2. Freshness    — sw.js is regenerated whenever the app changes. This is
 *                     the check that matters. A stale service worker serves
 *                     the old app to every installed device forever, and the
 *                     only symptom is "it didn't update" — undiagnosable from
 *                     a phone, and unfixable by whoever inherits this.
 *   3. Scope        — the shell is precached; live things are not.
 *
 * Run:  node tools/test-pwa.js
 *
 * With Chromium available, `node tools/test-pwa.js --browser` serves the app
 * over localhost, waits for the worker to take control, then kills the network
 * and reloads — the only way to actually know it works offline.
 */
const fs = require('fs');
const path = require('path');
const { shellFiles, shellVersion } = require('./build-sw.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'UT-TurfFarm-App.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* PNG header: width and height are big-endian at byte 16. */
function pngSize(p) {
  const b = fs.readFileSync(p);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* ---------------------------------------------------------------- */
section('1. the manifest');
let man = null;
{
  const p = path.join(ROOT, 'manifest.webmanifest');
  ok('there is a manifest', fs.existsSync(p));
  try { man = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { ok('it is valid JSON', false, e.message); }
  if (man) {
    ok('it is valid JSON', true);
    ok('it has a name', !!man.name, man.name);
    ok('and a short name that fits under an icon', !!man.short_name && man.short_name.length <= 12, man.short_name);
    ok('it opens the app', man.start_url === './UT-TurfFarm-App.html', man.start_url);
    ok('its scope covers the folder', man.scope === './', man.scope);
    ok('it installs standalone, without browser chrome', man.display === 'standalone', man.display);
    ok('the splash colour matches the app', man.background_color === '#2f3133' && man.theme_color === '#2f3133');
  }
}

section('2. icons that are the size they claim');
if (man) {
  const any = (man.icons || []).filter(i => (i.purpose || 'any').split(' ').indexOf('any') >= 0);
  const mask = (man.icons || []).filter(i => (i.purpose || '').split(' ').indexOf('maskable') >= 0);
  ok('there is a 192 and a 512', any.some(i => i.sizes === '192x192') && any.some(i => i.sizes === '512x512'),
     any.map(i => i.sizes).join(','));
  /* Without a maskable icon Android puts the square in a white circle. */
  ok('and maskable versions for Android', mask.length >= 2, String(mask.length));

  (man.icons || []).forEach(i => {
    const p = path.join(ROOT, i.src);
    if (!fs.existsSync(p)) { ok('exists: ' + i.src, false); return; }
    const s = pngSize(p);
    const want = +i.sizes.split('x')[0];
    ok(i.src + ' really is ' + i.sizes, !!s && s.w === want && s.h === want, s ? s.w + 'x' + s.h : 'not a png');
  });

  const apple = path.join(ROOT, 'icons/apple-touch-icon.png');
  ok('iOS has its own icon', fs.existsSync(apple));
  const as = fs.existsSync(apple) && pngSize(apple);
  ok('at 180x180', !!as && as.w === 180 && as.h === 180, as ? as.w + 'x' + as.h : '');
}

section('3. the page asks to be installed');
{
  ok('it links the manifest', /<link[^>]+rel="manifest"[^>]+href="manifest\.webmanifest"/.test(HTML));
  ok('it names a theme colour', /<meta[^>]+name="theme-color"[^>]+content="#2f3133"/.test(HTML));
  ok('it sets the viewport', /<meta[^>]+name="viewport"/.test(HTML));
  /* iOS ignores the manifest for these two and wants its own tags. */
  ok('iOS gets its touch icon', /rel="apple-touch-icon"/.test(HTML));
  ok('iOS gets a home-screen title', /name="apple-mobile-web-app-title"/.test(HTML));
  ok('iOS runs it without browser chrome', /name="apple-mobile-web-app-capable"[^>]+content="yes"/.test(HTML));
  ok('there is a favicon', /rel="icon"/.test(HTML));
}

section('4. the service worker is not stale');
{
  const p = path.join(ROOT, 'sw.js');
  ok('there is a service worker', fs.existsSync(p));
  const sw = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const m = sw.match(/const VERSION = '([0-9a-f]+)'/);
  ok('it carries a version', !!m, sw.slice(0, 60));

  /* The whole point of this file. If someone edits the app and forgets
     `npm run sw`, every installed device keeps the old copy — so that mistake
     fails here instead of in the field. */
  const fresh = shellVersion();
  ok('and the version matches the files on disk — run `npm run sw` if this fails',
     !!m && m[1] === fresh, m ? (m[1] + ' vs ' + fresh) : '');

  const files = shellFiles();
  ok('the app itself is precached', sw.indexOf('"UT-TurfFarm-App.html"') > 0);
  ok('so is the map data', sw.indexOf('"farm-geo.js"') > 0);
  ok('so is every vendored file', files.filter(f => /^vendor\//.test(f)).every(f => sw.indexOf('"' + f + '"') > 0));
  ok('so are the icons', files.filter(f => /^icons\//.test(f)).every(f => sw.indexOf('"' + f + '"') > 0));
  ok('and the manifest', sw.indexOf('"manifest.webmanifest"') > 0);

  /* Caching these would be wrong, not just wasteful: a stored radar loop is a
     lie about the weather somebody is deciding to spray in. */
  /* Both matchers live in sw.js as regex literals, so the source text carries
     escaped dots — match on the host label rather than the literal hostname. */
  ok('the radar is never served from cache',
     /const isLive[^\n]*radar/.test(sw) && /if \(isLive\(url\)\) return;/.test(sw));
  ok('tiles are cached at runtime, not precached',
     /const isTile[^\n]*arcgisonline/.test(sw) && sw.indexOf('"https://server') < 0);
  ok('the tile cache is capped', /TILE_MAX\s*=\s*\d+/.test(sw));

  /* THE ONE THAT COST A DAY, 2026-08-27.
     The shared database works by holding one long request open to Google and
     being pushed changes down it. If this worker answers that request through
     respondWith(), the reply is collected here and handed over in one piece at
     the end -- and there is no end, so every drawer sits on "Connected --
     waiting for the shared copy" forever, with nothing red to show for it and
     nothing ever sent up. Map imagery is the single deliberate exception and
     its branch has to come FIRST, or tiles stop being cached. */
  ok('other websites are left alone entirely',
     /const isOurs[^\n]*=/.test(sw) &&
     /new URL\([^)]*\)\.origin === self\.location\.origin/.test(sw) &&
     /if \(!isOurs\(url\)\) return;/.test(sw));
  ok('and the tile branch still runs before that bail-out',
     sw.indexOf('if (isTile(url))') > 0 &&
     sw.indexOf('if (isTile(url))') < sw.indexOf('if (!isOurs(url)) return;'));

  /* An update must be offered, not forced — see the note in the app. */
  ok('it waits to be told before taking over', sw.indexOf("'SKIP_WAITING'") > 0 && !/self\.skipWaiting\(\)\s*;?\s*\n[\s\S]{0,40}install/.test(sw));
  ok('old versions are cleaned up on activate', /caches\.delete/.test(sw));
  ok('but the tile cache survives an update', /k !== TILES/.test(sw));
}

section('5. registration is conditional');
{
  /* Opened from a file today. Registration must simply not happen there
     rather than throwing on load. */
  ok('it only registers over http(s)', /function pwaSupported\(\)[\s\S]{0,160}location\.protocol/.test(HTML));
  ok('it registers sw.js at the app scope', /navigator\.serviceWorker\.register\('sw\.js'/.test(HTML));
  ok('a failed registration is not fatal', /register\('sw\.js'[\s\S]{0,1400}\.catch\(function\(\)\{/.test(HTML));
  ok('an update offers a reload rather than taking one', /pwaUpdateBar/.test(HTML) && /SKIP_WAITING/.test(HTML));
  ok('and flushes unsaved work before reloading', /storeFlush\(\)[\s\S]{0,120}onReload\(\)/.test(HTML));
  ok('the running version is shown on Farm settings', /pwaVersionLine\(\)/.test(HTML));
}

/* ---------------------------------------------------------------- */
if (process.argv.indexOf('--browser') >= 0) {
  section('6. it installs and survives the network dying (browser)');
  runBrowser().then(finish, e => { console.log('  FAIL  browser check: ' + e.message); fail++; finish(); });
} else {
  console.log('\n(run with --browser to install it in Chromium and pull the plug)');
  finish();
}

function finish() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

async function runBrowser() {
  const { chromium } = require('playwright');
  const http = require('http');

  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'UT-TurfFarm-App.html';
    const p = path.join(ROOT, rel);
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (e, b) => {
      if (e) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(b);
    });
  });
  await new Promise(r => server.listen(8137, r));
  const URL = 'http://localhost:8137/UT-TurfFarm-App.html';

  const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'load' });
  const controlled = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    /* First load installs but does not control; one reload and it does. */
    return !!reg.active;
  });
  ok('the worker installs', controlled);

  await page.reload({ waitUntil: 'load' });
  const state = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const c = await caches.open(keys.find(k => /ut-turf-farm-/.test(k)));
    return { controlling: !!navigator.serviceWorker.controller, caches: keys, cached: (await c.keys()).length };
  });
  ok('and takes control on the next load', state.controlling);
  ok('the shell is in the cache', state.cached >= 40, String(state.cached));
  ok('under a versioned cache name', state.caches.some(k => /^ut-turf-farm-[0-9a-f]{12}$/.test(k)), state.caches.join(','));

  /* The real test: pull the plug. */
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  const offline = await page.evaluate(() => ({
    leaflet: typeof window.L !== 'undefined' && !!L.map,
    turf: typeof window.turf !== 'undefined',
    screens: document.querySelectorAll('section.screen').length,
    title: document.title,
    geo: typeof PLOTS_DATA !== 'undefined' && PLOTS_DATA.features.length,
  }));
  ok('it still loads with no network at all', offline.screens > 40, String(offline.screens));
  ok('with its libraries', offline.leaflet && offline.turf);
  ok('and the whole farm map', offline.geo > 100, String(offline.geo));

  await ctx.setOffline(false);
  ok('nothing threw along the way', errors.length === 0, errors[0]);

  await browser.close();
  server.close();
}
