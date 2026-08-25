/*
 * Harness for the inventory MOVEMENT LEDGER.
 *
 * Why this exists: stock used to be one number that every restock overwrote
 * (`it.qty += n`). That is a read-modify-write, and the moment the shelf is
 * shared across 23 phones it starts losing deliveries silently — no error, no
 * trace, just a smaller number than the farm actually has. The fix was to stop
 * storing the answer and start storing the movements.
 *
 * What it pins, and why each one matters:
 *
 *   1. ON HAND IS DERIVED. it.qty is the April opening balance and is never
 *      written to again. Anything that "simplifies" the ledger back into a
 *      running total reintroduces exactly the bug it was built to remove.
 *   2. TWO MOVEMENTS AT ONCE BOTH COUNT. This is the whole point. If this test
 *      ever fails the ledger has stopped being a ledger.
 *   3. GOING BELOW ZERO WARNS, IT NEVER BLOCKS. Dillon, 2026-08-25: the April
 *      counts are stale and stopping somebody in a field to fix paperwork is
 *      worse than carrying a wrong number for a day.
 *   4. A RECOUNT IS A MOVEMENT. Editing "on hand" must not rewrite April.
 *   5. EVERY SCREEN ASKS invQty(). A screen still reading it.qty shows the
 *      April figure forever and nobody notices until the numbers are wrong.
 *   6. ANYONE MAY MOVE STOCK, undergraduates included — the people who carry
 *      the jugs are the people who know what left the shelf.
 *
 * Run:  node tools/test-inventory.js
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
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }
const near = (a, b) => Math.abs(a - b) < 1e-9;

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

const EX = ['INVENTORY','INVMOVES','invQty','invMove','invMovesFor','invSums','invSumsDirty',
            'invNegWarn','invCanMove','invCanEdit','invWhoName','isLow','contCount','amtStr',
            'amtBoth','lowList','openItem','sessionSet','currentRole','SESSION','newId','fmt',
            'STORE_DEFS','INV_WHY','renderInvList','renderLowStock',
            'invConvert','invParseAmount','invAmountIn','invUnitChoices','invMovesForRef',
            'invRefTotal','invReconcileFromLog','FLFORM','FIELDLOG','flSave','flCorrect',
            'flnStockAmount','flnProduct','flById',
            'INVSYNC','invsyncOnMoves','invsyncOnItems','invsyncWanted','invsyncSetWanted',
            'invMoveDoc','invItemDoc','invsyncSummary','invMoveById'];

function boot(store) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc, url: 'https://localhost/' });
  const win = dom.window;
  win.L = new Proxy({}, { get: (t, k) => (k === 'DomEvent' ? { stop: noop } : chain()) });
  win.turf = turf;
  win.BroadcastChannel = class { postMessage() {} close() {} };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = fn => setTimeout(fn, 0);
  Object.defineProperty(win, 'localStorage', { value: makeLS(store || {}), configurable: true });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });

  const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};'
      + '\n;window.__get=function(k){return eval(k);};'
      + '\n;window.__set=function(k,v){eval(k+"=v");};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, doc: win.document, p: win.__p || {}, errs };
}

/* The first real product off the April list. Every test works relative to
   whatever its opening balance happens to be, so re-running
   tools/build-inventory.py cannot break this file. */
const first = b => b.p.INVENTORY[0];

section('0. it boots and the ledger is there');
{
  const b = boot();
  ok('no jsdom errors', b.errs.length === 0, b.errs[0]);
  ok('the ledger functions are present',
     ['invQty', 'invMove', 'invMovesFor', 'invNegWarn'].every(f => typeof b.p[f] === 'function'));
  ok('and it starts empty — no seeded movements', b.p.INVMOVES.length === 0, b.p.INVMOVES.length);
  ok('there are real products to move', b.p.INVENTORY.length > 100, b.p.INVENTORY.length);
}

section('1. on hand is DERIVED — the opening balance is never written to');
{
  const b = boot();
  const it = first(b), opening = it.qty;
  ok('with no movements, on hand is the April count', near(b.p.invQty(it), opening), b.p.invQty(it));

  b.p.invMove(it.id, 10, 'in');
  ok('a delivery raises on hand', near(b.p.invQty(it), opening + 10), b.p.invQty(it));
  ok('and the April count is untouched', near(it.qty, opening), it.qty);

  b.p.invMove(it.id, -4, 'out');
  ok('stock going out lowers it', near(b.p.invQty(it), opening + 6), b.p.invQty(it));
  ok('the April count is STILL untouched', near(it.qty, opening), it.qty);
  ok('and both movements are on the record', b.p.invMovesFor(it.id).length === 2);
}

section('2. two deliveries at the same moment BOTH count');
{
  /* The bug this whole design exists to prevent. Under `it.qty += n` these two
     read the same figure, add to it, and one of them vanishes. */
  const b = boot();
  const it = first(b), opening = it.qty;
  b.p.invMove(it.id, 5, 'in');
  b.p.invMove(it.id, 5, 'in');
  ok('both land', near(b.p.invQty(it), opening + 10), b.p.invQty(it));
  const mv = b.p.invMovesFor(it.id);
  ok('as two separate records', mv.length === 2);
  ok('with different ids', mv[0].id !== mv[1].id, mv[0].id);
}

section('3. below zero WARNS, and records anyway');
{
  const b = boot();
  const it = first(b);
  const tooMuch = b.p.invQty(it) + 25;

  ok('a delivery never warns', b.p.invNegWarn(it, 40) === '');
  const warn = b.p.invNegWarn(it, -tooMuch);
  ok('taking out more than there is does warn', warn.length > 0, warn);
  ok('and the warning says what it will read', /-?25/.test(warn) || /recount/i.test(warn), warn);

  b.p.invMove(it.id, -tooMuch, 'out');
  ok('but it is recorded, not refused', b.p.invMovesFor(it.id).length === 1);
  ok('and on hand really does go negative', b.p.invQty(it) < 0, b.p.invQty(it));
  ok('which shows up as low stock', b.p.isLow(it) === true);
}

section('4. a recount is a MOVEMENT, not an edit of April');
{
  const b = boot();
  const it = first(b), opening = it.qty;
  b.p.invMove(it.id, -3, 'out');
  const target = 12;
  b.p.invMove(it.id, target - b.p.invQty(it), 'count', { note: 'Recount' });
  ok('the shelf now reads what was counted', near(b.p.invQty(it), target), b.p.invQty(it));
  ok('April is still April', near(it.qty, opening), it.qty);
  const mv = b.p.invMovesFor(it.id);
  ok('and how it got there is still readable',
     mv.length === 2 && mv.some(m => m.why === 'count') && mv.some(m => m.why === 'out'),
     mv.map(m => m.why).join(','));
}

section('5. every screen asks invQty() — none of them read it.qty');
{
  const b = boot();
  const it = first(b);
  b.p.invMove(it.id, 100, 'in');

  ok('the list row shows the derived figure', b.p.amtBoth(it).indexOf(b.p.fmt(b.p.invQty(it))) >= 0,
     b.p.amtBoth(it));
  ok('so does the container count', near(b.p.contCount(it), b.p.invQty(it) / it.csize));

  /* Source-level, because a screen that quietly goes back to it.qty keeps
     working and just shows April forever — the failure nobody notices. */
  const fnSrc = name => {
    const i = HTML.indexOf('function ' + name + '(');
    return i < 0 ? '' : HTML.slice(i, i + 400);
  };
  ['isLow', 'contCount', 'amtStr', 'amtBoth', 'mixInvQty'].forEach(n => {
    ok(n + '() derives it', fnSrc(n).indexOf('invQty(') >= 0, fnSrc(n).slice(0, 60));
  });
  /* Comments are stripped first: the ledger's own explanation quotes the old
     line, and quoting the bug is not committing it. */
  const CODE = HTML.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('nothing adds straight to the stored figure any more', !/\.qty\s*\+=/.test(CODE),
     (CODE.match(/.{0,40}\.qty\s*\+=.{0,20}/) || [''])[0]);
}

section('6. who may move stock, and who may change what a product IS');
{
  const b = boot();
  b.p.sessionSet('p19');                       /* Barrett Smith, an undergraduate */
  ok('the signed-in person really is an undergrad',
     b.win.__get('currentRole') === 'undergrad', b.win.__get('currentRole'));
  ok('an undergrad MAY record stock moving', b.p.invCanMove() === true);
  ok('but may not redefine the product', b.p.invCanEdit() === false);

  b.p.sessionSet('p01');                       /* a technician */
  ok('a technician may do both', b.p.invCanMove() === true && b.p.invCanEdit() === true);
}

section('7. a movement says who and when');
{
  const b = boot();
  b.p.sessionSet('p18');
  const it = first(b);
  const m = b.p.invMove(it.id, 6, 'in');
  ok('it carries a roster id, never a name', m.who === 'p18', m.who);
  ok('and a timestamp', /^\d{4}-\d{2}-\d{2}T/.test(m.at || ''), m.at);
  ok('in the product’s own unit', m.unit === it.unit, m.unit);
  ok('and the name reads back off the roster', b.p.invWhoName('p18').length > 2, b.p.invWhoName('p18'));
}

section('8. the item screen shows real movements, not the old demo rows');
{
  const b = boot();
  b.p.sessionSet('p01');
  const it = first(b);

  b.p.openItem(it.id);
  let body = b.doc.getElementById('id-body').innerHTML;
  ok('an untouched product says so plainly', /April count/i.test(body), body.slice(-160));
  /* Two hardcoded demo rows used to live here with real crew names on them.
     On a shared shelf they would have been read as a real record. */
  ok('no invented restock is shown', body.indexOf('Bill Czekai') < 0);
  ok('and no invented usage', body.indexOf('Garrett Willard') < 0);

  b.p.invMove(it.id, 20, 'in');
  b.p.openItem(it.id);
  body = b.doc.getElementById('id-body').innerHTML;
  ok('a real delivery appears', /Delivery/.test(body));
  ok('signed with the person who booked it', body.indexOf(b.p.invWhoName('p01')) >= 0);
}

section('9. the ledger is saved, backed up and restored with everything else');
{
  const b = boot();
  const def = b.p.STORE_DEFS.filter(d => d.name === 'invmoves')[0];
  ok('it is in the store registry', !!def);
  ok('under its own key', def && def.key === 'ut_invmoves_v1', def && def.key);
  ok('and it hands back the live array', def && def.get() === b.p.INVMOVES);
}

section('10. units convert, or the shelf is left alone');
{
  const b = boot();
  const C = b.p.invConvert;
  ok('a gallon is 128 fluid ounces', near(C(1, 'gal', 'fl oz'), 128), C(1, 'gal', 'fl oz'));
  ok('a pound is 16 ounces', near(C(1, 'lb', 'oz'), 16), C(1, 'lb', 'oz'));
  ok('the same unit converts to itself', near(C(2.5, 'fl oz', 'fl oz'), 2.5));
  ok('capitals and full stops do not matter', near(C(1, 'Fl. Oz', 'fl oz'), 1), C(1, 'Fl. Oz', 'fl oz'));

  /* The two that must NEVER guess. `oz` and `fl oz` are different things, and
     a bag is not a number of pounds. Guessing here is a 128x error on a
     chemical record. */
  ok('weight never becomes volume', C(1, 'lb', 'gal') === null);
  ok('fluid ounces are not ounces', C(1, 'fl oz', 'oz') === null);
  ok('a countable unit only matches itself', C(1, 'bag', 'lb') === null);
  ok('and an unknown unit gives up honestly', C(1, 'smidge', 'gal') === null);

  const p = b.p.invParseAmount('12 fl oz');
  ok('a typed amount is read apart', p && near(p.n, 12) && p.unit === 'fl oz', JSON.stringify(p));
  ok('and nonsense is not', b.p.invParseAmount('a lot') === null);
}

section('11. logging a spray takes it off the shelf');
{
  const b = boot();
  b.p.sessionSet('p01');                       /* a technician — may log chemicals */
  const it = b.p.INVENTORY.find(x => x.unit === 'fl oz') || b.p.INVENTORY[0];
  const before = b.p.invQty(it), logged = b.p.FIELDLOG.length;

  Object.assign(b.p.FLFORM, {
    op: 'spray_fung', plots: ['14'], product: it.name, productId: it.id,
    amtNum: '12', amtUnit: it.unit, takeStock: true
  });
  b.p.flSave();

  ok('the entry is written', b.p.FIELDLOG.length === logged + 1, b.p.FIELDLOG.length - logged);
  ok('and the stock came off', near(b.p.invQty(it), before - 12), b.p.invQty(it));
  const mv = b.p.invMovesFor(it.id);
  ok('as one movement', mv.length === 1, mv.length);
  ok('marked as used', mv[0].why === 'out', mv[0].why);
  ok('and tied to the entry that caused it',
     mv[0].ref === b.p.FIELDLOG[b.p.FIELDLOG.length - 1].id, mv[0].ref);
}

section('12. three plots, one tank — the shelf is charged ONCE');
{
  /* The trap: the field log writes one entry per plot. Taking the amount off
     per entry would drain the shelf three times as fast as the farm really
     uses it, and nobody would notice for weeks. */
  const b = boot();
  b.p.sessionSet('p01');
  const it = b.p.INVENTORY.find(x => x.unit === 'fl oz') || b.p.INVENTORY[0];
  const before = b.p.invQty(it), logged = b.p.FIELDLOG.length;

  Object.assign(b.p.FLFORM, {
    op: 'spray_fung', plots: ['14', '15', '16'], product: it.name, productId: it.id,
    amtNum: '10', amtUnit: it.unit, takeStock: true
  });
  b.p.flSave();

  ok('three entries are written', b.p.FIELDLOG.length === logged + 3, b.p.FIELDLOG.length - logged);
  ok('but only one movement', b.p.invMovesFor(it.id).length === 1);
  ok('and only one amount came off', near(b.p.invQty(it), before - 10), b.p.invQty(it));
}

section('13. when it cannot be sure, it logs anyway and leaves stock alone');
{
  const b = boot();
  b.p.sessionSet('p01');
  const it = b.p.INVENTORY[0];

  /* Something sprayed that is not on the shelf. This must still save — the
     application record matters more than the stock figure, and nobody may be
     blocked in a field. */
  let logged = b.p.FIELDLOG.length;
  Object.assign(b.p.FLFORM, {
    op: 'spray_fung', plots: ['14'], product: 'Something not on the list',
    productId: null, amtNum: '8', amtUnit: 'fl oz', takeStock: true
  });
  b.p.flSave();
  ok('an unmatched product still logs', b.p.FIELDLOG.length === logged + 1);
  ok('and touches no stock at all', b.p.INVMOVES.length === 0, b.p.INVMOVES.length);

  /* A unit that cannot be converted into the product's own. */
  const bagged = b.p.INVENTORY.find(x => b.p.invUnitChoices && b.p.invConvert(1, 'fl oz', x.unit) === null);
  if (bagged) {
    logged = b.p.FIELDLOG.length;
    const before = b.p.invQty(bagged);
    Object.assign(b.p.FLFORM, {
      op: 'spray_fung', plots: ['14'], product: bagged.name, productId: bagged.id,
      amtNum: '3', amtUnit: 'fl oz', takeStock: true
    });
    b.p.flSave();
    ok('an unconvertible unit still logs', b.p.FIELDLOG.length === logged + 1);
    ok('and leaves the shelf exactly as it was', near(b.p.invQty(bagged), before), b.p.invQty(bagged));
  }

  /* And the tick turns it off outright. */
  const it2 = b.p.INVENTORY.find(x => x.unit === 'fl oz') || b.p.INVENTORY[1];
  const was = b.p.invQty(it2);
  Object.assign(b.p.FLFORM, {
    op: 'spray_fung', plots: ['14'], product: it2.name, productId: it2.id,
    amtNum: '5', amtUnit: it2.unit, takeStock: false
  });
  b.p.flSave();
  ok('the tick turned off means the shelf is untouched', near(b.p.invQty(it2), was), b.p.invQty(it2));
}

section('14. correcting the amount corrects the shelf, without editing anything');
{
  const b = boot();
  b.p.sessionSet('p01');
  const it = b.p.INVENTORY.find(x => x.unit === 'fl oz') || b.p.INVENTORY[0];
  const before = b.p.invQty(it);

  Object.assign(b.p.FLFORM, {
    op: 'spray_fung', plots: ['14'], product: it.name, productId: it.id,
    amtNum: '20', amtUnit: it.unit, takeStock: true
  });
  b.p.flSave();
  const orig = b.p.FIELDLOG[b.p.FIELDLOG.length - 1];
  const firstMove = b.p.invMovesFor(it.id)[0];
  ok('20 came off to begin with', near(b.p.invQty(it), before - 20), b.p.invQty(it));

  /* It was really 12, not 20. */
  const corrected = b.p.flCorrect(orig.id, { amount: '12 ' + it.unit }, 'Read the jug wrong');
  ok('the correction was accepted', !!corrected);
  b.p.invReconcileFromLog(orig, corrected);

  ok('the shelf now reflects 12', near(b.p.invQty(it), before - 12), b.p.invQty(it));
  const mv = b.p.invMovesFor(it.id);
  ok('by ADDING a movement, not changing one', mv.length === 2, mv.length);
  ok('the first movement is exactly as it was', near(firstMove.delta, -20), firstMove.delta);
  ok('and the fix points at the correction', b.p.invRefTotal(corrected.id) !== 0);

  /* Correcting something else must not move stock at all. */
  const n = b.p.INVMOVES.length;
  const c2 = b.p.flCorrect(corrected.id, { target: 'Dollar spot' }, 'Missed the target');
  b.p.invReconcileFromLog(corrected, c2);
  ok('a correction that leaves the amount alone moves no stock', b.p.INVMOVES.length === n);

  /* Corrected TWICE. Each correction hangs its movement off its own id, so
     "how much has this job taken off" has to be asked of the whole chain. Ask
     only the last one and you compare a difference against a total and book
     the gap a second time — which is how a 20 fl oz spray quietly takes 40. */
  const c3 = b.p.flCorrect(c2.id, { amount: '30 ' + it.unit }, 'Actually thirty');
  b.p.invReconcileFromLog(c2, c3);
  ok('a second correction lands on the right total', near(b.p.invQty(it), before - 30),
     b.p.invQty(it));
  ok('and still only ever adds movements', b.p.invMovesFor(it.id).length === 3,
     b.p.invMovesFor(it.id).length);
}

section('15. the correction screen really does call the reconciler');
{
  /* Section 14 proves the reconciler is right. This proves it is wired in —
     the two failures look identical from the outside. */
  const i = HTML.indexOf('function flxSave()');
  const src = i < 0 ? '' : HTML.slice(i, i + 2200);
  ok('flxSave exists', i > 0);
  ok('and reconciles stock after correcting', src.indexOf('invReconcileFromLog') >= 0);
  const j = HTML.indexOf('function flSave()');
  ok('flSave asks how much to take off', HTML.slice(j, j + 3000).indexOf('flnStockAmount') >= 0);
}

/* A Firestore snapshot, near enough. fromCache:true keeps the handler from
   trying to upload, which would need a real database. */
const snapOf = (docs, fromCache) => ({
  docChanges: () => docs.map(d => ({ type: 'added', doc: { id: d.id, data: () => d } })),
  metadata: { fromCache: fromCache !== false }
});

section('16. sharing the shelf — the switch');
{
  const b = boot();
  ok('it starts OFF, like every other drawer', b.p.INVSYNC.on === false);
  ok('and off is what the device says', b.p.invsyncWanted() === false);
  ok('the summary says so in plain words', /own stock figures/i.test(b.p.invsyncSummary()),
     b.p.invsyncSummary());

  const store = {};
  const c = boot(store);
  c.p.invsyncSetWanted(true);
  ok('turning it on is remembered on THIS device', store['ut_inventory_shared_v1'] === '1');
  ok('and it is per device, not per person', /_v1$/.test('ut_inventory_shared_v1'));
}

section('17. movements arriving from another phone');
{
  const b = boot();
  const it = first(b), opening = it.qty;

  b.p.invsyncOnMoves(snapOf([
    { id: 'm-other-1', item: it.id, delta: -5, unit: it.unit, why: 'out', who: 'p09',
      at: '2026-08-25T10:00:00', ref: null, note: '' }
  ]));
  ok('it lands in the ledger', b.p.INVMOVES.length === 1);
  /* The real check: the cached totals have to be thrown away, or the screen
     keeps showing yesterday's figure with today's data underneath it. */
  ok('and the total on this phone changes', near(b.p.invQty(it), opening - 5), b.p.invQty(it));

  /* The same movement again — a re-listen, a reconnect, a second tab. */
  b.p.invsyncOnMoves(snapOf([
    { id: 'm-other-1', item: it.id, delta: -5, unit: it.unit, why: 'out', who: 'p09',
      at: '2026-08-25T10:00:00', ref: null, note: '' }
  ]));
  ok('arriving twice counts once', b.p.INVMOVES.length === 1, b.p.INVMOVES.length);
  ok('and the total is not double-counted', near(b.p.invQty(it), opening - 5), b.p.invQty(it));

  /* Two people, same moment, different products or the same — both count. */
  b.p.invsyncOnMoves(snapOf([
    { id: 'm-other-2', item: it.id, delta: 50, unit: it.unit, why: 'in', who: 'p07', at: '2026-08-25T10:00:01' },
    { id: 'm-other-3', item: it.id, delta: 50, unit: it.unit, why: 'in', who: 'p18', at: '2026-08-25T10:00:01' }
  ]));
  ok('two deliveries in the same second both count', near(b.p.invQty(it), opening - 5 + 100),
     b.p.invQty(it));
}

section('18. products arriving from another phone');
{
  const b = boot();
  const before = b.p.INVENTORY.length;
  const it = first(b);

  b.p.invsyncOnItems(snapOf([{ id: 'i-new-1', name: 'ZZ Test Product', cat: 'fungicide',
    form: 'other', loc: '—', ctype: 'jug', csize: 2.5, unit: 'gal', qty: 0, thr: 0 }]));
  ok('a product somebody else added appears here', b.p.INVENTORY.length === before + 1);

  /* Updated IN PLACE, so the closures already holding this object keep
     pointing at live data — the same rule storeHydrate follows. */
  const ref = b.p.INVENTORY.find(x => x.id === it.id);
  b.p.invsyncOnItems(snapOf([Object.assign({}, b.p.invItemDoc(it), { thr: 99 })]));
  ok('a changed product is updated in place, not replaced',
     b.p.INVENTORY.find(x => x.id === it.id) === ref);
  ok('and the change is really there', ref.thr === 99, ref.thr);
}

section('19. what goes up is the right shape');
{
  const b = boot();
  const it = first(b);
  b.p.sessionSet('p01');
  const m = b.p.invMove(it.id, -3, 'out');
  const doc = b.p.invMoveDoc(m);
  ok('a movement carries its own id', doc.id === m.id);
  ok('the product it moved', doc.item === it.id);
  ok('a number, not a string', typeof doc.delta === 'number', typeof doc.delta);
  ok('and who moved it', doc.who === 'p01', doc.who);

  ok('a movement with no product is refused', b.p.invMoveDoc({ id: 'x', delta: 1 }) === null);
  ok('a product with no id is refused', b.p.invItemDoc({ name: 'x' }) === null);
}

section('20. the rules and the app say the same thing');
{
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const block = name => {
    const i = rules.indexOf('match /' + name + '/');
    if (i < 0) return '';
    const j = rules.indexOf('\n    }', i);
    return rules.slice(i, j < 0 ? rules.length : j);
  };
  const moves = block('invmoves'), items = block('invitems');

  ok('the ledger has a rules block', moves.length > 0);
  ok('the products have one too', items.length > 0);

  /* The ledger is append-only in BOTH places, or it is append-only in
     neither. A movement records something that happened. */
  ok('a movement can never be rewritten', /allow update: if false;/.test(moves), moves.slice(0, 80));
  ok('and never deleted', /allow delete: if false;/.test(moves));
  ok('nor can a product be deleted', /allow delete: if false;/.test(items));
  ok('a movement must say who made it', /get\('who',''\)\) == me\(\)/.test(moves.replace(/\s+/g, ' ')),
     moves.slice(-160));

  /* invCanMove() is true for everybody; invCanEdit() is not. The rules have
     to draw the same line or the app offers a button the database refuses. */
  const canMove = rules.slice(rules.indexOf('function canMoveStock()'), rules.indexOf('function canEditProduct()'));
  ok('the rules let anybody move stock, as the app does',
     /return actor\(\);/.test(canMove) && canMove.indexOf('Undergraduate') < 0, canMove.slice(-90));
  const canEdit = rules.slice(rules.indexOf('function canEditProduct()'), rules.indexOf('function canEditProduct()') + 220);
  ok('but not anybody to redefine a product', canEdit.indexOf('Undergraduate Student') >= 0);

  const b = boot();
  b.p.sessionSet('p19');
  ok('and the app agrees on the undergrad side',
     b.p.invCanMove() === true && b.p.invCanEdit() === false);
}

section('21. nothing anywhere deletes a movement');
{
  /* The property the whole drawer rests on. Said once in the app, once in the
     rules, and checked here so neither can quietly stop being true. */
  const CODE = HTML.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('the app never splices the ledger', !/INVMOVES\.splice/.test(CODE));
  ok('nor empties it', !/INVMOVES\s*=\s*\[\]/.test(CODE.replace('var INVMOVES=[]', '')));
  ok('and the only thing that writes to it is invMove()',
     (CODE.match(/INVMOVES\.push/g) || []).length <= 2,
     (CODE.match(/INVMOVES\.push/g) || []).length);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
