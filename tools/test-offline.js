/*
 * Harness for the vendored assets.
 *
 * The app used to pull Leaflet, Geoman, Turf and two fonts off four different
 * CDNs on every load. Any one of them changing a URL would have taken the farm
 * down with no way for anyone left behind to work out why. They now live in
 * vendor/.
 *
 * What it pins:
 *   1. Nothing loads from the internet — no <script> or <link> may point at
 *      http(s). This is the invariant that stops a CDN creeping back in.
 *   2. Every vendored path the app names actually exists on disk.
 *   3. The fonts the app asks for are the fonts vendor/fonts carries.
 *
 * Run:  node tools/test-offline.js
 *
 * With Chromium available, `node tools/test-offline.js --browser` also loads
 * the app for real with the network cut off and checks that Leaflet, Geoman,
 * Turf and both fonts come up and nothing tries to escape. That one needs
 * playwright and a browser, so it is not in `npm test`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
const HTML = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---------------------------------------------------------------- */
section('1. nothing loads from the internet');
{
  const tags = HTML.match(/<(?:script|link)[^>]*>/g) || [];
  const remote = tags.filter(t => /https?:\/\//.test(t));
  ok('no script or stylesheet points at a CDN', remote.length === 0, remote.join(' | ').slice(0, 300));

  /* The preconnect hints went with them — they only cost a DNS lookup now. */
  ok('no preconnect hints are left', !/rel="preconnect"/.test(HTML));
  ok('nothing references fonts.googleapis.com', HTML.indexOf('fonts.googleapis.com') < 0);
  ok('nothing references unpkg', HTML.indexOf('unpkg.com') < 0);
  ok('nothing references cdnjs', HTML.indexOf('cdnjs.cloudflare.com') < 0);
  ok('nothing references jsdelivr', HTML.indexOf('jsdelivr.net') < 0);

  /* Tiles and radar are fetched later, by the map and the weather screen, and
     cannot be vendored — they are the live picture, not a library. */
  ok('the basemap tiles are still remote, as they must be', HTML.indexOf('server.arcgisonline.com') > 0);
}

section('2. every vendored path exists');
{
  const refs = [...HTML.matchAll(/(?:src|href)="(vendor\/[^"]+)"/g)].map(m => m[1]);
  ok('the app names vendored files', refs.length === 6, String(refs.length) + ': ' + refs.join(' '));
  refs.forEach(r => {
    ok('exists: ' + r, fs.existsSync(path.join(ROOT, r)));
  });

  ok('leaflet is vendored', fs.existsSync(path.join(ROOT, 'vendor/leaflet/leaflet.js')));
  ok('geoman is vendored', fs.existsSync(path.join(ROOT, 'vendor/geoman/leaflet-geoman.min.js')));
  ok('turf is vendored', fs.existsSync(path.join(ROOT, 'vendor/turf/turf.min.js')));
  /* leaflet.css names these by relative path; without them the layers control
     and the default marker draw as broken images. */
  ['layers.png', 'layers-2x.png', 'marker-icon.png', 'marker-shadow.png'].forEach(f => {
    ok("leaflet's " + f + ' came along', fs.existsSync(path.join(ROOT, 'vendor/leaflet/images', f)));
  });
  ok('there is a README saying where it all came from', fs.existsSync(path.join(ROOT, 'vendor/README.md')));
  ok('and a script that rebuilds it', fs.existsSync(path.join(ROOT, 'tools/build-vendor.js')));
}

section('3. the fonts the app asks for are the fonts it carries');
{
  const css = fs.readFileSync(path.join(ROOT, 'vendor/fonts/fonts.css'), 'utf8');
  const dir = fs.readdirSync(path.join(ROOT, 'vendor/fonts'));

  /* Weights named in the app's own stylesheet, e.g. font:800 13px 'Archivo'. */
  const wanted = { Archivo: new Set(), 'Public Sans': new Set() };
  for (const m of HTML.matchAll(/font:\s*(\d{3})[^;'"]*['"](Archivo|Public Sans)['"]/g)) {
    wanted[m[2]].add(m[1]);
  }
  ok('the app asks for Archivo weights', wanted.Archivo.size > 0, [...wanted.Archivo].join(','));
  ok('and Public Sans weights', wanted['Public Sans'].size > 0, [...wanted['Public Sans']].join(','));

  const have = {};
  for (const m of css.matchAll(/font-family:\s*'([^']+)';[\s\S]*?font-weight:\s*(\d+);/g)) {
    (have[m[1]] = have[m[1]] || new Set()).add(m[2]);
  }
  Object.keys(wanted).forEach(fam => {
    [...wanted[fam]].sort().forEach(w => {
      ok(fam + ' ' + w + ' is vendored', !!(have[fam] && have[fam].has(w)),
         'have ' + (have[fam] ? [...have[fam]].sort().join(',') : 'none'));
    });
  });

  const files = [...css.matchAll(/url\(\.\/([^)]+)\)/g)].map(m => m[1]);
  ok('every font file the stylesheet names is present',
     files.every(f => dir.indexOf(f) >= 0),
     files.filter(f => dir.indexOf(f) < 0).join(','));
  ok('and they are woff2, not the old .woff too', files.every(f => /\.woff2$/.test(f)));
}

/* ---------------------------------------------------------------- */
if (process.argv.indexOf('--browser') >= 0) {
  section('4. it really runs with the network cut (browser)');
  runBrowser().then(finish, e => { console.log('  FAIL  browser check: ' + e.message); fail++; finish(); });
} else {
  console.log('\n(run with --browser to also load it in Chromium offline)');
  finish();
}

function finish() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

async function runBrowser() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.PW_CHROME?{executablePath:process.env.PW_CHROME}:{});
  const ctx = await browser.newContext();
  const escaped = [], errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (/^https?:/i.test(u)) { escaped.push(u); return route.abort(); }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto('file://' + APP, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const p = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
    return {
      leaflet: typeof window.L !== 'undefined' && !!L.map,
      geoman: !!(window.L && L.PM),
      turf: typeof window.turf !== 'undefined' && typeof turf.area === 'function',
      screens: document.querySelectorAll('section.screen').length,
      archivo: loaded.some(f => /Archivo/.test(f)),
      publicSans: loaded.some(f => /Public Sans/.test(f)),
    };
  });

  ok('Leaflet came up', p.leaflet);
  ok('Geoman came up', p.geoman);
  ok('Turf came up', p.turf);
  ok('the screens are there', p.screens > 40, String(p.screens));
  ok('Archivo rendered from disk', p.archivo);
  ok('Public Sans rendered from disk', p.publicSans);
  ok('nothing tried to reach the internet', escaped.length === 0, [...new Set(escaped)].join(' '));
  ok('and it loaded without errors', errors.length === 0, errors[0]);

  await browser.close();
}
