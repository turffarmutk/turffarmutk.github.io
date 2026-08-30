/*
 * The weather screen: a real forecast, and the discipline that goes with it.
 *
 * WHAT THIS REPLACED. Every number on the weather screen used to be typed into
 * the source — "78° Clear", the wind, the humidity, five day cards. The hourly
 * strip looked convincing because it was CALCULATED from those five made-up
 * days on a sine curve. Only the radar was ever real.
 *
 * That was not merely useless. Four of the five home screens carried a spray
 * window reading GOOD or HOLD off those invented numbers — a go/no-go on
 * taking the rig out, decided by a figure somebody typed in months earlier.
 *
 * So the three things worth guarding here are:
 *
 *   1. NOTHING IS INVENTED. No forecast in the source, and a missing number
 *      shows as a dash rather than a guess.
 *   2. A STALE READING GIVES NO SPRAY ANSWER. Not GOOD, not HOLD — "no current
 *      forecast". An out-of-date GOOD is the exact failure this removed.
 *   3. THE DAY CARDS ARE FILLED, NOT REBUILT. Those five divs are written
 *      unclosed in the page, and the browser's repair of that is what puts the
 *      other screens where they belong. Replacing them with tidy markup on
 *      2026-08-30 moved forty-four screens up a level and killed the back
 *      arrow on every one of them. The last section here pins that.
 *
 * Run:  node tools/test-weather.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appSource } = require('./_geo');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'UT-TurfFarm-App.html');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

/* ---- a National Weather Service that answers from this file -------------- */
const HOUR = 3600000;
function hourly(n, over) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Object.assign({
      startTime: new Date(Date.now() + i * HOUR).toISOString(),
      temperature: 72 + i, temperatureUnit: 'F',
      probabilityOfPrecipitation: { value: 5 },
      relativeHumidity: { value: 60 }, dewpoint: { value: 15 },
      windSpeed: '4 mph', windDirection: 'SW', shortForecast: 'Sunny'
    }, (over && over(i)) || {}));
  }
  return out;
}
function daily() {
  const out = [];
  for (let d = 0; d < 5; d++) {
    const day = new Date(Date.now() + d * 24 * HOUR);
    out.push({ startTime: day.toISOString(), isDaytime: true, temperature: 88 - d,
               probabilityOfPrecipitation: { value: 10 + d }, windSpeed: '5 to 12 mph',
               windDirection: 'SW', shortForecast: 'Partly Sunny' });
    out.push({ startTime: new Date(day.getTime() + 13 * HOUR).toISOString(), isDaytime: false,
               temperature: 68 - d, probabilityOfPrecipitation: { value: 5 },
               windSpeed: '3 mph', windDirection: 'S', shortForecast: 'Mostly Clear' });
  }
  return out;
}
let served = [], failNext = null, hourlyOver = null;
function fakeFetch(url) {
  served.push(String(url));
  if (failNext) { const e = failNext; failNext = null; return Promise.reject(new Error(e)); }
  const body =
    /\/points\//.test(url) ? { properties: {
        forecast: 'https://api.weather.gov/gridpoints/MRX/70,48/forecast',
        forecastHourly: 'https://api.weather.gov/gridpoints/MRX/70,48/forecast/hourly',
        observationStations: 'https://api.weather.gov/gridpoints/MRX/70,48/stations' } }
  : /forecast\/hourly/.test(url) ? { properties: { periods: hourly(24, hourlyOver) } }
  : /\/forecast$/.test(url) ? { properties: { periods: daily() } }
  : /observations\/latest/.test(url) ? { properties: {
        timestamp: new Date().toISOString(), textDescription: 'Clear',
        temperature: { value: 24 }, windSpeed: { value: 8 }, windDirection: { value: 180 },
        relativeHumidity: { value: 71 }, dewpoint: { value: 18 },
        barometricPressure: { value: null },          /* the airport sensor was down */
        station: 'https://api.weather.gov/stations/KTYS' } }
  : {};
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

/* ------------------------------------------------------------- boot ---- */
const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync(APP, 'utf8'),
  { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
const win = dom.window;
const noop = () => {};
const chain = () => new Proxy(function () {}, { get: () => chain(), apply: () => chain() });
win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
win.turf = turf;
win.firebase = chain();
win.BroadcastChannel = class { postMessage() {} close() {} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
let store = {};
Object.defineProperty(win, 'localStorage', {
  value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; }, clear: () => { store = {}; } }, configurable: true });
win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
win.fetch = fakeFetch;
win.AbortController = class { constructor(){ this.signal = {}; } abort(){} };

try { win.eval(appSource(win.document) + '\n;window.__WX=function(){return WX;};'); }
catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }

const appText = require('./_app').appText();
const WX = () => win.__WX();
const doc = win.document;
const txt = id => { const e = doc.getElementById(id); return e ? e.textContent : null; };
const wait = () => new Promise(r => setTimeout(r, 0));

/* ---------------------------------------------------- 1. nothing typed in */
section('1. There is no forecast written into the app any more');
ok('the five hardcoded days are gone', !/\{day:'Wednesday',cond:'Partly cloudy'/.test(appText));
ok('and the sine curve that invented the hours with them',
   !/function wxCurve\(h\)\{ return \(Math\.cos/.test(appText));
ok('WXDAYS starts empty and is filled from the service', /var WXDAYS=\[\];/.test(appText));
ok('the page no longer ships a temperature', !/>78°<\/div>/.test(appText));
ok('it says Loading rather than a number it does not have', /id="wx-now-temp"[^>]*>—</.test(appText));
ok('the source is named on the screen', /National Weather Service/.test(appText));
ok('and it needs no key, account or card',
   !/api[_-]?key|apikey|token=/i.test(appText.match(/api\.weather\.gov[^'"]*/g) ? appText.match(/api\.weather\.gov[^'"]*/g).join(' ') : ''));

/* --------------------------------------------------- 2. a real fetch ---- */
section('2. Asking the service, and what comes back');
(async () => {
  await win.wxRefresh(true);
  await wait();

  ok('it looked the farm up, then asked for the forecast',
     served.some(u => /\/points\/35\.902/.test(u)) && served.some(u => /\/forecast$/.test(u)));
  ok('and for the hour-by-hour', served.some(u => /forecast\/hourly/.test(u)));
  ok('and for what it is doing right now', served.some(u => /observations\/latest/.test(u)));
  ok('five days came back', WX().days.length === 5, String(WX().days.length));
  ok('each with a high and a low', WX().days.every(d => d.hi !== null && d.lo !== null));
  ok('24 hours came back', WX().hours.length === 24, String(WX().hours.length));

  section('3. Wind, read the way a sprayer has to read it');
  ok('a range like "5 to 12 mph" is taken at its HIGHEST',
     WX().days[0].wind.indexOf('12 mph') === 0, WX().days[0].wind);
  ok('because rounding a gust down is how somebody sprays in it',
     win.wxWindMph('5 to 12 mph') === 12 && win.wxWindMph('4 mph') === 4);

  section('4. A number it does not have is a dash, never a guess');
  win.renderWxNow();
  ok('the pressure sensor was down, so pressure shows a dash', txt('wx-now-press') === '—', txt('wx-now-press'));
  ok('the service publishes no UV index, so UV shows a dash', txt('wx-now-uv') === '—', txt('wx-now-uv'));
  ok('but the real temperature is shown', txt('wx-now-temp') === '75°', txt('wx-now-temp'));
  ok('and the real humidity', txt('wx-now-hum') === '71%', txt('wx-now-hum'));
  ok('the day cards carry a dash for humidity rather than inventing one',
     WX().days[0].hum === '—');
  ok('and a dash for UV', WX().days[0].uv === '—');

  section('5. It says how old the reading is');
  ok('a fresh one reads as just now', /just now/.test(txt('wx-age')), txt('wx-age'));
  ok('and names where it came from', /National Weather Service/.test(txt('wx-age')));
  ok('an hour-old reading says so', (function () {
     const w = WX(); const was = w.at; w.at = Date.now() - 62 * 60 * 1000;
     const s = win.wxAgeText(); w.at = was; return /hour ago/.test(s); })());
  ok('a reading from yesterday says so', (function () {
     const w = WX(); const was = w.at; w.at = Date.now() - 30 * HOUR;
     const s = win.wxAgeText(); w.at = was; return /1 day ago/.test(s); })());

  section('6. THE RULE THAT MATTERS: a stale reading gives no spray answer');
  ok('with a fresh calm forecast, spraying is fine', win.hwSprayOK() === true);
  {
    const w = WX(); const was = w.at;
    w.at = Date.now() - 5 * HOUR;                    /* older than WX_STALE_MS */
    ok('the same forecast, four hours later, answers nothing at all',
       win.hwSprayOK() === null, String(win.hwSprayOK()));
    win.hwWxStrip('hw-m-wx');
    const strip = doc.getElementById('hw-m-wx');
    ok('and the manager strip says so in words rather than saying GOOD',
       /no current forecast/i.test(strip.textContent) && !/GOOD/.test(strip.textContent),
       strip.textContent.trim().slice(0, 80));
    w.at = was;
  }
  ok('with no forecast at all it also answers nothing', (function () {
     const w = WX(); const d = w.days; w.days = [];
     const out = win.hwSprayOK(); w.days = d; return out === null; })());

  section('7. The limits come off the Spray settings screen');
  ok('a windy forecast holds the spray', (function () {
     const w = WX(); const h = w.hours;
     w.hours = w.hours.map(x => Object.assign({}, x, { wind: 25 }));
     const out = win.hwSprayOK(); w.hours = h; return out === false; })());
  ok('and raising the farm\'s limit lets it through again', (function () {
     const w = WX(); const h = w.hours;
     w.hours = w.hours.map(x => Object.assign({}, x, { wind: 25 }));
     win.eval('WX_SPRAY_WIND=30;');
     const out = win.hwSprayOK();
     win.eval('WX_SPRAY_WIND=10;'); w.hours = h; return out === true; })());
  ok('the limits live with the spray settings, not the weather code',
     /var WX_SPRAY_WIND=10;/.test(appText) && /Spray settings/.test(appText));

  section('8. With no signal it still shows the last reading');
  {
    const saved = store['ut_weather_v1'];
    ok('the reading was kept on the phone', !!saved && JSON.parse(saved).days.length === 5);
    ok('and it is kept apart from the farm\'s own records',
       !/name:'weather'|ut_weather_v1/.test(appText.split('STORE_DEFS=[')[1].split('];')[0]));
    const w = WX(); w.days = []; w.hours = []; w.at = 0;
    ok('a phone that has just opened loads it back', win.wxCacheLoad() === true);
    ok('and the five days are there again', WX().days.length === 5);
    ok('so WXDAYS is filled without asking anybody', win.WXDAYS.length === 5);
  }
  {
    win.navigator.__defineGetter__ && Object.defineProperty(win.navigator, 'onLine', { value: false, configurable: true });
    const before = served.length;
    await win.wxRefresh(true);
    ok('with no signal it does not even try', served.length === before);
    Object.defineProperty(win.navigator, 'onLine', { value: true, configurable: true });
  }
  {
    failNext = 'HTTP 500';
    const w = WX(); const keep = w.days.length;
    await win.wxRefresh(true); await wait();
    ok('a service that fails leaves the last good reading alone', WX().days.length === keep);
    ok('and says so in plain words', /Could not reach the weather service|No connection/.test(WX().err || ''),
       String(WX().err));
  }

  section('9. The day cards are FILLED, never rebuilt');
  /* The regression of 2026-08-30, pinned. Those five divs are written unclosed
     in the page; the browser's repair of that is what puts the other screens
     where they belong. Tidying them into balanced markup moved 44 screens up a
     level and killed the back arrow on every one. */
  {
    const before = doc.querySelectorAll('#s-weather .wxcard').length;
    win.wxRenderCards();
    const after = doc.querySelectorAll('#s-weather .wxcard').length;
    ok('there are still exactly five cards after a redraw', after === 5, String(after));
    ok('and they are the same five elements', before === after);
    ok('the container is not rewritten', !/wx-cards/.test(appText));
    ok('a card now carries a real day', /Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(
       doc.querySelector('#s-weather .wxcard').textContent));
  }
  ok('every screen is still inside #app, which is what makes Back work',
     [...doc.querySelectorAll('.screen')].every(s => doc.getElementById('app').contains(s)));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
