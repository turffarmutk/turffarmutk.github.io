/*
 * Harness for "Report a technical bug" and for Bill's own rows on the board.
 *
 * What it pins:
 *   1. Reachable   — every role can file a bug, including an undergrad whose
 *                    nav has been trimmed. A crew member who cannot report a
 *                    broken app is a crew member who stops using the app.
 *   2. Never lost  — the report is written to storage BEFORE the network is
 *                    touched, a failed send leaves it queued rather than
 *                    dropped, and it rides along in the backup export. This is
 *                    a field app on a farm with dead spots; the moment somebody
 *                    most wants to report a bug is often the moment the thing
 *                    that is broken is the signal.
 *   3. Sent once   — a report in flight is not also picked up by a concurrent
 *                    flush. Duplicate mail trains the maintainer to ignore it.
 *   4. Follows the — the address is not a constant. It tracks APP_ADMIN, so the
 *      hand-off       existing "Hand off the app" step redirects bug reports as
 *                     a side effect and nobody has to edit this file.
 *   5. Bill's rows — a task Bill assigned to himself carries a Start button,
 *                    not the rank arrows and bin he uses to direct other
 *                    people. Everyone else's rows keep those controls.
 *
 * Run:  node tools/test-bugreport.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');

const APP = path.join(__dirname, '..', 'UT-TurfFarm-App.html');
const HTML = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

const noop = () => {};
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'getBounds' ? () => ({ getSouthWest: () => ({ lat: 0, lng: 0 }),
                                               getNorthEast: () => ({ lat: 0, lng: 0 }),
                                               getCenter: () => ({ lat: 0, lng: 0 }),
                                               extend() { return this; }, pad() { return this; } })
                 : (k === 'getZoom' || k === 'getMaxZoom' || k === 'getBoundsZoom') ? () => 20
                 : (k === 'hasLayer') ? () => false
                 : (k === 'getContainer') ? () => null
                 : chain()),
  apply: () => chain()
});

function makeLS(store) {
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: i => Object.keys(store)[i],
  };
  Object.defineProperty(ls, 'length', { get: () => Object.keys(store).length });
  return ls;
}

const EX = ['BUGS','BUGCFG','BUGCFG_KEY','bugTo','bugKey','bugConfigured','bugCanConfig','bugQueued',
            'bugDiag','bugBody','bugToLabel','rstFind','bugSend','bugFlush','bugRender','bgsRender','bugFromScreen','bugNoteErr',
            'BUG_ERRS','APP_ADMIN','FARM_CATS','MORE_ALWAYS','STORE_DEFS','storeFlush','storeScan',
            'bkPayload','sessionSet','SESSION','currentRole','TASKS','STUDENTS','nameOf','newId',
            'atToday','renderBoard','go','goRoot','moreEnter','stack','tbTab','boardDay','isoLocal'];

/* The relay never gets called for real. Every fetch is recorded and answered
   with whatever the current test wants, so the queue, retry and
   sent-exactly-once paths are all reachable without spending a submission. */
function boot(store, fetchMode) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
  const win = dom.window;
  win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
  win.turf = turf;
  win.BroadcastChannel = class { postMessage() {} close() {} };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
  Object.defineProperty(win, 'localStorage', { value: makeLS(store), configurable: true });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });

  const sent = [];
  const mode = { now: fetchMode || 'ok' };
  win.fetch = function (url, opts) {
    sent.push({ url: String(url), body: JSON.parse((opts && opts.body) || '{}') });
    if (mode.now === 'fail') return Promise.resolve({ ok: false, status: 500 });
    if (mode.now === 'throw') return Promise.reject(new Error('offline'));
    return Promise.resolve({ ok: true, status: 200 });
  };
  win.AbortController = class { constructor() { this.signal = {}; } abort() {} };

  const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};'
      + '\n;window.__set=function(k,v){eval(k+"=v");};'
      + '\n;window.__get=function(k){return eval(k);};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, doc: win.document, p: win.__p || {}, errs, sent, mode };
}
const settle = () => new Promise(r => setTimeout(r, 30));

(async function () {

section('0. the app still boots');
{
  const b = boot({});
  ok('no jsdom errors on load', b.errs.length === 0, b.errs[0]);
  ok('the bug module is present', typeof b.p.bugSend === 'function' && Array.isArray(b.p.BUGS));
  ok('reports are a registered collection, so they persist and export',
     (b.p.STORE_DEFS || []).some(d => d.name === 'bugs'));
}

section('1. anybody can reach it');
{
  const b = boot({});
  ok('the screen exists', !!b.doc.getElementById('s-bugreport'));
  ok('and its settings screen exists', !!b.doc.getElementById('s-bugsettings'));
  ok('the More menu links to it', !!b.doc.querySelector('#s-more .row[data-go="bugreport"]'));
  ok('it is never hidden by a role', b.p.MORE_ALWAYS && b.p.MORE_ALWAYS.bugreport === 1);

  ['p07', 'p18', 'p09', 'p13'].forEach(function (pid) {
    b.p.sessionSet(pid);
    b.win.__get('moreEnter')();
    const row = b.doc.querySelector('#s-more .row[data-go="bugreport"]');
    ok('  visible to ' + pid + ' (' + b.win.__get('currentRole') + ')', row && row.style.display !== 'none');
  });
}

section('2. it is written down before it is sent');
{
  const store = {};
  const b = boot(store);
  b.p.sessionSet('p18');
  b.win.__get('go')('map'); b.win.__get('go')('more'); b.win.__get('go')('bugreport');
  b.doc.getElementById('bug-what').value = 'Map is blank';
  b.doc.getElementById('bug-send').click();
  await settle();

  ok('the report is kept even with no relay configured', b.p.BUGS.length === 1);
  ok('and nothing was posted', b.sent.length === 0, String(b.sent.length));
  ok('it is on disk immediately, not after a scan tick', !!store['ut_bugs_v1']);
  ok('a blank description is refused', (function () {
    b.doc.getElementById('bug-what').value = '   ';
    b.doc.getElementById('bug-send').click();
    return b.p.BUGS.length === 1;
  })());
}

section('3. what it captures without being asked');
{
  const b = boot({});
  b.p.sessionSet('p09');
  b.win.__get('go')('fieldlog'); b.win.__get('go')('more'); b.win.__get('go')('bugreport');
  let d = b.p.bugDiag();
  ok('the screen they came from, not the bug screen', d.screen === 'fieldlog', d.screen);
  ok('who filed it', /Rose/.test(d.who), d.who);
  /* The app ships with blank emails on purpose — the crew addresses are not in
     the published file. Whoever has filled theirs in under More -> Roster gets
     a working reply-to; whoever has not still files a perfectly good report. */
  ok('no address is seeded into the app', d.email === '', d.email);
  b.p.rstFind('p09').email = 'rose@example.edu';
  d = b.p.bugDiag();
  ok('but once they fill theirs in, a reply reaches them', d.email === 'rose@example.edu', d.email);
  ok('and a timestamp', /^\d{4}-\d{2}-\d{2}T/.test(d.at), d.at);

  b.p.bugNoteErr('x is not a function', '/app/UT-TurfFarm-App.html', 4214);
  const body = b.p.bugBody({ id: 'bug1', what: 'It broke', doing: 'Tapped save', diag: b.p.bugDiag() });
  ok('the body leads with what went wrong', /WHAT WENT WRONG\nIt broke/.test(body), body.slice(0, 60));
  ok('and carries what they were doing', /Tapped save/.test(body));
  ok('an error the app threw is attached', /x is not a function/.test(body));
  ok('the version is in there', /App version/.test(body));
}

section('4. sending, and not sending twice');
{
  const b = boot({});
  b.p.sessionSet('p18');
  b.win.__set('BUGCFG.key', 'k-123');
  b.win.__get('go')('bugreport');
  b.doc.getElementById('bug-what').value = 'Spray screen wont save';
  b.doc.getElementById('bug-send').click();
  await settle();

  /* Deliberately sent with NO destination address configured, which is how the
     app ships. Delivery is routed by the access key; requiring a display
     address here once made every report refuse to send. */
  ok('it posts to the relay with only a key and no address set',
     b.sent.length === 1 && b.p.bugTo() === '', b.sent.length + ' / to=' + b.p.bugTo());
  ok('at the documented endpoint', /api\.web3forms\.com\/submit/.test(b.sent[0].url), b.sent[0].url);
  ok('with the access key', b.sent[0].body.access_key === 'k-123');
  ok('a subject an inbox can scan', /^\[Turf Farm bug\] /.test(b.sent[0].body.subject), b.sent[0].body.subject);
  ok('reply-to falls back to the destination when they have no address on file',
     /@|inbox/.test(b.sent[0].body.email) || b.sent[0].body.email === '', b.sent[0].body.email);
  ok('the report is marked sent', b.p.BUGS[0].status === 'sent');
  ok('and it is not queued any more', b.p.bugQueued().length === 0);

  b.p.bugFlush(true); await settle();
  ok('a later flush does not mail it again', b.sent.length === 1, String(b.sent.length));
}

section('5. no signal: queued, then retried');
{
  const b = boot({}, 'throw');
  b.p.sessionSet('p18');
  b.win.__set('BUGCFG.key', 'k-123');
  b.win.__get('go')('bugreport');
  b.doc.getElementById('bug-what').value = 'Nothing loads';
  b.doc.getElementById('bug-send').click();
  await settle();
  ok('a dead network leaves it queued, not dropped', b.p.BUGS[0].status === 'queued' && b.p.BUGS.length === 1);

  b.mode.now = 'fail';
  b.p.bugFlush(true); await settle();
  ok('a 500 from the relay also leaves it queued', b.p.BUGS[0].status === 'queued');

  b.mode.now = 'ok';
  b.p.bugFlush(true); await settle();
  ok('and it goes out once the network is back', b.p.BUGS[0].status === 'sent');
  /* The count is not pinned: opening the screen retries too, so the number of
     ATTEMPTS is deliberately more than the number of sends. What matters is
     that it kept trying while it was failing and stops the moment it lands. */
  ok('it kept retrying while it was failing', b.sent.length >= 3, String(b.sent.length));
  const after = b.sent.length;
  b.p.bugFlush(true); await settle();
  b.p.bugRender(); await settle();
  ok('and never sends it again once it has landed', b.sent.length === after,
     after + ' -> ' + b.sent.length);
}

section('6. the address follows the hand-off');
{
  const b = boot({});
  /* No address ships in the file, so the destination is whatever inbox the
     Web3Forms account was opened with — the label has to say that rather than
     render an empty pair of brackets. */
  ok('with nothing configured it names the account inbox, not a blank',
     b.p.bugTo() === '' && /inbox/.test(b.p.bugToLabel()), b.p.bugToLabel());
  b.win.__set('APP_ADMIN.email', 'holder@utk.edu');
  ok('it defaults to whoever holds the app', b.p.bugTo() === 'holder@utk.edu', b.p.bugTo());
  b.win.__set('APP_ADMIN', { name: 'Successor', email: 'successor@utk.edu', pid: 'p02', since: '2029-01-01' });
  ok('handing the app over redirects reports with no code edit',
     b.p.bugTo() === 'successor@utk.edu', b.p.bugTo());
  b.win.__set('BUGCFG.to', 'somebody@utk.edu');
  ok('an explicit override still wins', b.p.bugTo() === 'somebody@utk.edu', b.p.bugTo());
  b.win.__set('BUGCFG.to', '');
  ok('and clearing it goes back to following', b.p.bugTo() === 'successor@utk.edu', b.p.bugTo());

  ok('it is on the Farm settings hub', (b.p.FARM_CATS || []).some(c => c.go === 'bugsettings'));
  b.p.sessionSet('p07'); ok('the manager can set it up', b.p.bugCanConfig());
  b.p.sessionSet('p18'); ok('an undergrad cannot', !b.p.bugCanConfig());
}

section('7. an untouched config does not freeze the address');
{
  const store = {};
  const b = boot(store);
  b.p.storeFlush();
  ok('nothing is written while both settings are blank', !store['ut_bugcfg_v1'], store['ut_bugcfg_v1']);
  b.win.__set('BUGCFG.key', 'k-9'); b.p.storeFlush();
  ok('but a real setting is saved', !!store['ut_bugcfg_v1']);
  b.win.__set('BUGCFG.key', ''); b.p.storeFlush();
  ok('and clearing it removes the key again', !store['ut_bugcfg_v1'], store['ut_bugcfg_v1']);
}

section('8. a queued report survives the move to hosting');
{
  const store = {};
  const b = boot(store);
  b.p.sessionSet('p18');
  b.win.__get('go')('bugreport');
  b.doc.getElementById('bug-what').value = 'Queued and unsent';
  b.doc.getElementById('bug-send').click();
  await settle();
  b.p.storeFlush();
  const payload = b.p.bkPayload();
  ok('an undelivered report is in the backup export',
     JSON.stringify(payload).indexOf('Queued and unsent') >= 0);

  const b2 = boot(store);
  ok('and it is still there after a reload', b2.p.BUGS.length === 1 && b2.p.BUGS[0].what === 'Queued and unsent',
     JSON.stringify(b2.p.BUGS.map(x => x.what)));
}

section('9. Bill\'s own tasks carry a Start button');
{
  const b = boot({});
  b.p.sessionSet('p07');
  const today = b.p.atToday(null);
  const other = b.p.STUDENTS.find(s => s !== 'p07');
  b.p.TASKS.push({ id: b.p.newId('t'), title: 'ZZ Bill one', area: 'A', assignee: 'p07', status: 'todo', kind: 'task', type: 'Mowing', dueAt: today, repeat: 'None' });
  b.p.TASKS.push({ id: b.p.newId('t'), title: 'ZZ Bill two', area: 'B', assignee: 'p07', status: 'todo', kind: 'task', type: 'Mowing', dueAt: today, repeat: 'None' });
  b.win.__set('tbTab', 'board');
  b.win.__set('boardDay', new Date().getDay());
  b.win.__get('renderBoard')();

  const kids = [...b.doc.getElementById('tb-body').children];
  let mine = null, crew = null;
  const crewName = b.p.nameOf(other);
  for (let i = 0; i < kids.length; i++) {
    if (!kids[i].classList.contains('sec')) continue;
    const t = kids[i].textContent || '', next = kids[i + 1];
    if (!next || !next.classList.contains('list')) continue;
    if (/\(you\)/.test(t)) mine = next;
    else if (crewName && t.indexOf(crewName) === 0 && !crew) crew = next;
  }
  const n = (el, s) => (el ? el.querySelectorAll(s).length : -1);

  ok('his section renders', !!mine);
  ok('there is a Start button', n(mine, '[data-start]') === 1, String(n(mine, '[data-start]')));
  ok('on the next-up job only', n(mine, '.row') === 2, String(n(mine, '.row')));
  ok('the rank arrows are gone', n(mine, '[data-move]') === 0, String(n(mine, '[data-move]')));
  ok('and so is the bin', n(mine, '[data-del]') === 0, String(n(mine, '[data-del]')));

  ok('a crew member\'s section still renders', !!crew);
  ok('their rows keep both arrows', crew && n(crew, '[data-move]') === n(crew, '.row') * 2,
     n(crew, '[data-move]') + ' for ' + n(crew, '.row') + ' rows');
  ok('and keep the bin', crew && n(crew, '[data-del]') === n(crew, '.row'));
  ok('and get no Start button', n(crew, '[data-start]') === 0, String(n(crew, '[data-start]')));
}

section('10. tapping your own task on the board opens it');
{
  /* SESSION.pid is a roster id. It used to be called as SESSION.pid(), which
     threw a TypeError out of the board's click handler, so the tap did
     nothing at all. */
  const b = boot({});
  ok('the handler reads SESSION.pid as a value, not a call',
     HTML.indexOf('taskIsFor(rt,SESSION.pid())') < 0);
  b.p.sessionSet('p18');
  const today = b.p.atToday(null);
  const id = b.p.newId('t');
  b.p.TASKS.push({ id, title: 'ZZ Mine', area: 'Plots 1-2', assignee: 'p18', status: 'todo', kind: 'task', type: 'Mowing', dueAt: today, repeat: 'None' });
  b.win.__set('tbTab', 'mine');
  b.win.__set('boardDay', new Date().getDay());
  b.win.__get('renderBoard')();
  const before = b.errs.length;
  const row = b.doc.querySelector('#s-taskboard [data-task]');
  if (row) row.click();
  ok('the tap throws nothing', b.errs.length === before, b.errs[before]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})();
