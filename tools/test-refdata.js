/*
 * Harness for the farm reference lists — mowers and labs.
 *
 * These are the lists the rest of the app reads: which machines exist and
 * what colour they draw, which labs exist and which of them run trials. They
 * were constants, written out more than once, and had already drifted apart.
 *
 * What it pins:
 *   1. One source     — the roster list, the calendar filter, the trials
 *                       colours and the legend badges all derive from
 *                       FARM_LABS and cannot disagree.
 *   2. Migration      — renaming a mower or a lab carries the records that
 *                       name it, or plots turn grey and studies lose colour.
 *   3. Drift surfaced — a name in use but not on the list is reported, not
 *                       hidden.
 *   4. Validation     — a bad list, including one from a hand-edited backup,
 *                       never replaces a good one.
 *   5. Roles          — labs are the manager's; mowers are the tech's.
 *
 * Run:  node tools/test-refdata.js
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

const EX = ['FARM_LABS','MOWER_CFG','MGMT_DATA','PEOPLE','TRIALS',
            'labsUnlisted','labsRename','labsApply','labsIsDefault','labsScan','labsValid','labFind',
            'mowersUnlisted','mowersRename','mowersApply','mowersIsDefault','mowersScan','mowersPlotCount','mowersValid',
            'mowerLabel','mowerColor','mowCanEdit','labsCanEdit','farmCanSee',
            'fstRender','mwsRender','lbsRender','sessionSet','FARM_CATS'];

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
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => {}, key: i => Object.keys(store)[i],
  };
  Object.defineProperty(ls, 'length', { get: () => Object.keys(store).length });
  Object.defineProperty(win, 'localStorage', { value: ls, configurable: true });
  win.navigator.geolocation = { watchPosition: () => 1, clearWatch: noop, getCurrentPosition: noop };
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });

  const scripts = [require('./_geo').geoSource(), ...win.document.querySelectorAll('script:not([src])')].map(s => typeof s === 'string' ? s : s.textContent);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};'
      /* currentRole is a `let` and the four derived lists get reassigned, so
         both need a hook minted inside this eval's scope. */
      /* Was `currentRole=r`. The Farm settings gates read the ROSTER now, so
         assigning the screen's idea of your role proves nothing -- it is the
         exact drift the move off currentRole was meant to end. Sign a real
         person in instead, picked off the roster by role. */
      + '\n;window.__setRole=function(r){'
      + '  var want={manager:"Farm Manager",faculty:"Faculty",grad:"Graduate Student",'
      + '            tech:"Technician",undergrad:"Undergraduate Student"}[r]||r;'
      + '  var who=PEOPLE.filter(function(x){return x.role===want&&x.active!==false;})[0];'
      + '  if(who) sessionSet(who.id); else { SESSION.pid=null; currentRole=r; }'
      + '  return who&&who.id;};'
      + '\n;window.__lists=function(){return {rst:RST_LABS,cal:CAL_LABS,tr:TR_LABS,ab:TR_LAB_AB};};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, doc: win.document, p: win.__p || {}, errs, store };
}

/* ---------------------------------------------------------------- */
section('1. four lists, one source');
{
  const b = boot({});
  ok('no errors on load', b.errs.length === 0, b.errs[0]);
  const L = b.win.__lists();
  const names = b.p.FARM_LABS.map(l => l.name);
  const pis = b.p.FARM_LABS.filter(l => l.pi).map(l => l.name);

  ok('the roster list is every lab', L.rst.length === names.length, L.rst.join(','));
  ok('and it is sorted, as it always was', JSON.stringify(L.rst) === JSON.stringify(names.slice().sort()), L.rst.join(','));
  ok('the calendar filter is every lab', JSON.stringify(L.cal) === JSON.stringify(names), L.cal.join(','));
  ok('the trials colours are the research groups only', JSON.stringify(Object.keys(L.tr)) === JSON.stringify(pis), Object.keys(L.tr).join(','));
  ok('Bill is not a research group', !('Bill' in L.tr));
  ok('every trials lab has a badge', Object.keys(L.tr).every(n => L.ab[n]), JSON.stringify(L.ab));

  /* The drift this replaces: Stier was on the roster list and nowhere else. */
  ok('Stier is on every list now', L.rst.indexOf('Stier') >= 0 && L.cal.indexOf('Stier') >= 0 && !!L.tr['Stier'],
     JSON.stringify({ rst: L.rst.indexOf('Stier') >= 0, cal: L.cal.indexOf('Stier') >= 0, tr: !!L.tr['Stier'] }));
  ok('a fresh device counts as unchanged', b.p.labsIsDefault() === true);
  ok('and writes nothing', !('ut_labs_v1' in b.store));
}

section('2. a name in use but not listed is reported');
{
  const b = boot({});
  ok('nothing is adrift to start with', b.p.labsUnlisted().length === 0,
     JSON.stringify(b.p.labsUnlisted()));

  /* A fixture, not a seed row — the sample trials were removed from the app on
     2026-08-24, so this test brings its own to rename. */
  if (!b.p.TRIALS.length) b.p.TRIALS.push({id:'s1', title:'Fixture trial', lab:'Brosnan'});
  b.p.PEOPLE[0].lab = 'Fenwick';
  b.p.TRIALS[0].lab = 'Fenwick';
  const un = b.p.labsUnlisted();
  ok('the unlisted lab is found', un.length === 1 && un[0].name === 'Fenwick', JSON.stringify(un));
  ok('with a count of who names it', un[0].people === 1 && un[0].trials === 1, JSON.stringify(un[0]));

  /* Placeholders are not labs. */
  b.p.PEOPLE[1].lab = '—';
  ok('a dash is not reported as a lab', b.p.labsUnlisted().length === 1, JSON.stringify(b.p.labsUnlisted()));
}

section('3. renaming a lab carries its people and studies');
{
  const b = boot({});
  const before = b.p.PEOPLE.filter(p => p.lab === 'Brosnan').length
               + b.p.TRIALS.filter(t => t.lab === 'Brosnan').length;
  ok('Brosnan has records to move', before > 0, String(before));

  const moved = b.p.labsRename('Brosnan', 'Brosnan Lab');
  ok('every record moved', moved === before, moved + ' vs ' + before);
  ok('nobody is left on the old name', b.p.PEOPLE.every(p => p.lab !== 'Brosnan') && b.p.TRIALS.every(t => t.lab !== 'Brosnan'));
  ok('and nothing is adrift as a result',
     b.p.labsUnlisted().filter(u => u.name === 'Brosnan Lab').length === 1,
     JSON.stringify(b.p.labsUnlisted()));
}

section('4. a bad lab list never replaces a good one');
{
  const b = boot({});
  const n = b.p.FARM_LABS.length;
  ok('an empty list is refused', b.p.labsApply([]) === false && b.p.FARM_LABS.length === n);
  ok('a nameless lab is refused', b.p.labsApply([{ name: '', color: '#123456' }]) === false);
  ok('a lab with no colour is refused', b.p.labsApply([{ name: 'X' }]) === false);
  ok('a colour that is not a colour is refused', b.p.labsApply([{ name: 'X', color: 'red' }]) === false);
  ok('a duplicate name is refused', b.p.labsApply([{ name: 'X', color: '#111111' }, { name: 'X', color: '#222222' }]) === false);
  ok('not a list at all is refused', b.p.labsApply('Brosnan') === false && b.p.FARM_LABS.length === n);
  ok('but a good list applies', b.p.labsApply([{ name: 'Solo', color: '#123456', pi: true }]) === true && b.p.FARM_LABS.length === 1);

  const hostile = boot({ ut_labs_v1: JSON.stringify([{ name: 'Bad', color: 'not-a-colour' }]) });
  ok('a hand-edited backup cannot break the lists', hostile.p.FARM_LABS.length > 1,
     String(hostile.p.FARM_LABS.length));
  const junk = boot({ ut_labs_v1: '{oh dear' });
  ok('corrupt settings leave the built-in labs standing', junk.p.FARM_LABS.length > 1);
}

section('5. labs persist, and a device back at default stores nothing');
{
  const s = {};
  const b = boot(s);
  b.p.FARM_LABS.push({ name: 'Fenwick', color: '#123456', ab: 'Fe', pi: true });
  b.win.eval('labsRebuild();'); b.p.labsScan();
  ok('the change is stored', JSON.parse(s['ut_labs_v1']).some(l => l.name === 'Fenwick'));

  const b2 = boot(s);
  ok('it survives a reload', !!b2.win.__lists().tr['Fenwick']);
  ok('and reaches the calendar filter too', b2.win.__lists().cal.indexOf('Fenwick') >= 0);

  /* Undo it by hand: the key should go away, not linger as a no-op override. */
  const i = b2.p.FARM_LABS.findIndex(l => l.name === 'Fenwick');
  b2.p.FARM_LABS.splice(i, 1);
  b2.win.eval('labsRebuild();'); b2.p.labsScan();
  ok('back at the built-in list, the key is dropped', !('ut_labs_v1' in s), JSON.stringify(Object.keys(s).filter(k => /labs/.test(k))));
}

section('6. renaming a mower carries its plots');
{
  const b = boot({});
  const machine = b.p.MOWER_CFG[0][0];
  const n = b.p.mowersPlotCount(machine);
  ok('the first machine has plots', n > 0, String(n));

  const moved = b.p.mowersRename(machine, 'John Deere 2653B');
  ok('every plot moved', moved === n, moved + ' vs ' + n);
  ok('none are left on the old name', b.p.mowersPlotCount(machine) === 0);
  ok('and they are on the new one', b.p.mowersPlotCount('John Deere 2653B') === n);

  /* Until the list is updated too, those plots are adrift — and say so. */
  const un = b.p.mowersUnlisted();
  ok('the unlisted machine is reported', un.length === 1 && un[0].plots === n, JSON.stringify(un));
  b.p.MOWER_CFG[0][0] = 'John Deere 2653B';
  ok('updating the list clears it', b.p.mowersUnlisted().length === 0);
}

section('7. the map reads the edited machines');
{
  const b = boot({});
  const plot = Object.keys(b.p.MGMT_DATA).find(k => b.p.MGMT_DATA[k] && b.p.MGMT_DATA[k].m);
  const label0 = b.p.mowerLabel(plot), color0 = b.p.mowerColor(plot);
  ok('a plot has a mower label', !!label0 && label0 !== 'Not mowed', label0);

  const idx = b.p.MOWER_CFG.findIndex(m => m[1] === label0);
  b.p.MOWER_CFG[idx][1] = 'Tee Mower';
  b.p.MOWER_CFG[idx][2] = '#123456';
  ok('renaming the machine changes what the plot reads', b.p.mowerLabel(plot) === 'Tee Mower', b.p.mowerLabel(plot));
  ok('and recolouring changes what it draws', b.p.mowerColor(plot) === '#123456', b.p.mowerColor(plot));

  /* Removing a machine leaves the plot naming something nobody lists. */
  const machine = b.p.MOWER_CFG[idx][0];
  b.p.MOWER_CFG.splice(idx, 1);
  ok('the plot falls back to the raw machine name', b.p.mowerLabel(plot) === machine, b.p.mowerLabel(plot));
  ok('and draws grey', b.p.mowerColor(plot) === '#8a8f98', b.p.mowerColor(plot));
  ok('with the loss reported', b.p.mowersUnlisted().some(u => u.name === machine), JSON.stringify(b.p.mowersUnlisted()));
}

section('8. a bad mower list never replaces a good one');
{
  const b = boot({});
  const n = b.p.MOWER_CFG.length;
  ok('an empty list is refused', b.p.mowersApply([]) === false && b.p.MOWER_CFG.length === n);
  ok('a short row is refused', b.p.mowersApply([['a', 'b']]) === false);
  ok('a blank machine is refused', b.p.mowersApply([['', 'b', '#111111']]) === false);
  ok('a bad colour is refused', b.p.mowersApply([['a', 'b', 'blue']]) === false);
  ok('but a good list applies', b.p.mowersApply([['a', 'b', '#111111']]) === true && b.p.MOWER_CFG.length === 1);

  const hostile = boot({ ut_mowers_v1: JSON.stringify([['x', 'y', 'chartreuse']]) });
  ok('a hand-edited backup cannot break the machines', hostile.p.MOWER_CFG.length > 1, String(hostile.p.MOWER_CFG.length));
}

section('9. the screens');
{
  const b = boot({});
  b.p.sessionSet('p07');
  b.win.__setRole('manager');

  b.p.fstRender();
  const hub = b.doc.getElementById('fst-body').innerHTML;
  /* Derived from the registry rather than pinned to a number: the point of
     this check is that the hub renders a row for every category, which stays
     true when one is added. The categories themselves are named below. */
  ok('the hub lists every category',
     b.p.FARM_CATS.length > 0 && (hub.match(/data-go="/g) || []).length === b.p.FARM_CATS.length,
     b.p.FARM_CATS.length + " cats, " + (hub.match(/data-go="/g) || []).length + " rows");
  {
    const gos = b.p.FARM_CATS.map(function(c){ return c.go; });
    ["spraysettings","mowersettings","labsettings","bugsettings"].forEach(function(g){
      ok("  " + g + " is on the hub", gos.indexOf(g) >= 0, gos.join(","));
    });
  }
  ok('and summarises each one', /tips/.test(hub) && /machines/.test(hub) && /in trials/.test(hub), hub.slice(0, 200));

  b.p.mwsRender();
  const mw = b.doc.getElementById('mws-body').innerHTML;
  ok('every machine has a row', (mw.match(/data-mw-machine="/g) || []).length === b.p.MOWER_CFG.length);
  ok('with its plot count', /\d+ plots/.test(mw));

  b.p.lbsRender();
  const lb = b.doc.getElementById('lbs-body').innerHTML;
  ok('every lab has a row', (lb.match(/data-lb-name="/g) || []).length === b.p.FARM_LABS.length);
  ok('and a trials toggle', (lb.match(/data-lb-pi="/g) || []).length === b.p.FARM_LABS.length);

  /* Typing a new name in and blurring migrates and re-derives. */
  const inp = b.doc.querySelector('[data-lb-name="1"]');
  const was = b.p.FARM_LABS[1].name;
  inp.value = 'Renamed';
  inp.dispatchEvent(new b.win.Event('change', { bubbles: true }));
  ok('the lab is renamed from the screen', b.p.FARM_LABS[1].name === 'Renamed', b.p.FARM_LABS[1].name);
  ok('the derived lists followed', b.win.__lists().cal.indexOf('Renamed') >= 0 && b.win.__lists().cal.indexOf(was) < 0);
  ok('and it was written', JSON.parse(b.store['ut_labs_v1']).some(l => l.name === 'Renamed'));

  /* A duplicate name has to be refused, or two labs share a colour slot. */
  const dup = b.doc.querySelector('[data-lb-name="2"]');
  const kept = b.p.FARM_LABS[2].name;
  dup.value = 'Renamed';
  dup.dispatchEvent(new b.win.Event('change', { bubbles: true }));
  ok('a duplicate name is refused', b.p.FARM_LABS[2].name === kept, b.p.FARM_LABS[2].name);
}

/* Two lines, not four, and both read off the roster — see fstCanEditKit() and
   fstCanEditLists(). Dillon added faculty to the whole page on 2026-08-26; the
   rest of the grid is as it was. tools/test-farmsettings.js compares both lines
   against firestore.rules person by person. */
section('10. the sprayer and mowers are the crew\'s, the labs are Bill\'s and faculty\'s');
{
  const b = boot({});
  b.win.__setRole('tech');
  ok('a technician can edit mowers', b.p.mowCanEdit() === true);
  ok('but not the labs', b.p.labsCanEdit() === false);
  b.win.__setRole('manager');
  ok('the manager can edit both', b.p.mowCanEdit() === true && b.p.labsCanEdit() === true);
  b.win.__setRole('undergrad');
  ok('an undergrad edits neither', b.p.mowCanEdit() === false && b.p.labsCanEdit() === false);
  ok('and cannot even see the hub', b.p.farmCanSee() === false);
  b.win.__setRole('faculty');
  ok('faculty edit the whole page now', b.p.mowCanEdit() === true && b.p.labsCanEdit() === true);
  ok('including the semester dates', b.win.eval('semCanEdit()') === true);

  /* A technician is the read-only case on the labs screen. */
  b.win.__setRole('tech');
  b.p.lbsRender();
  const ro = b.doc.getElementById('lbs-body').innerHTML;
  ok('the labs screen is read-only for a technician',
     !/data-lb-name/.test(ro) && /Read-only for your role/.test(ro));

  /* The handler is the fence, not the markup. */
  b.win.__setRole('manager'); b.p.lbsRender();
  const inp = b.doc.querySelector('[data-lb-name="1"]');
  const was = b.p.FARM_LABS[1].name;
  b.win.__setRole('grad');
  inp.value = 'Sneaky';
  inp.dispatchEvent(new b.win.Event('change', { bubbles: true }));
  ok('a stale input cannot rename a lab', b.p.FARM_LABS[1].name === was, b.p.FARM_LABS[1].name);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
