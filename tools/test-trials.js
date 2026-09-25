/*
 * Harness for the trials drawer — the studies running on the farm and the
 * restrictions they put on the ground.
 *
 * WHY THIS FILE EXISTS
 * A restriction that says "do not mow this plot" was, until now, a note on one
 * phone. Whoever turned up with the mower saw nothing. That is the most
 * expensive thing in this app to get wrong, and it was the last farm-wide list
 * still saving itself with its own localStorage write.
 *
 * Dillon's rule, 2026-08-26, in his words: trials sync to everyone; a trial can
 * only be edited by the people in that lab; Bill can remove restrictions on
 * anyone's trial but cannot edit any details about the trial.
 *
 * That last sentence is why there are TWO collections. If the lift lived inside
 * the study document, letting Bill write that document to lift one restriction
 * would let him rewrite the whole study in the same breath, and the database
 * could not tell the difference. Section 4 is the one that pins it.
 *
 * What this pins:
 *   1. Studies are a registered store, so they persist, back up and can sync.
 *   2. Who edits which lab's studies — in the app AND in the rules, compared
 *      person by person, lab by lab, across every pair.
 *   3. Bill lifts anybody's restriction and edits nobody's study.
 *   4. The study document that goes up carries no lift state at all.
 *   5. A removal is a TOMBSTONE, not a missing document.
 *   6. Nothing reads currentRole.
 *
 * Run:  node tools/test-trials.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'UT-TurfFarm-App.html'), 'utf8');
/* The app's code, with the app-*.js files written back into the page exactly
   where their <script> tags sit. The checks below search the source for a
   line — that something dangerous is absent, that a comment still explains
   why — and they have to search all of it, not just the part still written
   inside the page. */
const SRC = require('./_app').appText();
const { appScripts } = require('./_app');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n' + s); }

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
  return { getItem: k => (k in store ? store[k] : null),
           setItem: (k, v) => { store[k] = String(v); },
           removeItem: k => { delete store[k]; },
           key: i => Object.keys(store)[i],
           get length() { return Object.keys(store).length; } };
}
const EX = ['TRIALS','TR_GONE','STORE_DEFS','SESSION','PEOPLE','TRSYNC','TR_LABS',
            'TRIAL_CATS','TR_RTYPES','TR_RES_PALETTE','TR_RES_STOPS','TR_MAX_N',
            'trialCatsValid','trialCatsApply','resTypesValid','resTypesApply',
            'trRows','trCols','trGridFt','trTotalFt2','trFootprintFt','trResDraftFrom',
            'trSyncFormRes','trResEndText','jobResCfg','resTypeKey','resTypeAb','resTypeColor',
            'trEditLabs','trCanEditLab','trCanLiftAny','trSeesAll','trCanEdit','trCanLift',
            'trById','trIsGone','trMarkGone','trTrialDoc','trLiftDoc','trGoneDoc',
            'trVisible','trGrantLabs','trsyncSummary','trsyncCanPushTrial','trsyncCanPushLift',
            'personRole','personLab','personHas','rstFind','toast'];

function boot(store) {
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc,
                                url: 'https://turffarmutk.github.io/' });
  const win = dom.window;
  win.L = chain();
  Object.defineProperty(win, 'localStorage', { value: makeLS(store), configurable: true });
  win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {},
                            addEventListener() {}, removeEventListener() {} });
  win.scrollTo = () => {}; win.alert = () => {}; win.confirm = () => true;
  const scripts = appScripts(win.document);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};');
  } catch (e) { console.log('app script threw: ' + e.message); fail++; }
  return { win, p: win.__p || {}, errs, store };
}

const store = {};
const b = boot(store);
const p = b.p, w = b.win;
const J = JSON.stringify;

/* ---------------------------------------------------------------- */
section('0. the app boots and the studies are a real store');
ok('no jsdom errors on load', b.errs.length === 0, b.errs[0]);
ok('TRIALS exists', Array.isArray(p.TRIALS));
ok('TR_GONE exists', Array.isArray(p.TR_GONE));
{
  const names = (p.STORE_DEFS || []).map(d => d.name);
  ok('trials is a registered store', names.indexOf('trials') >= 0, names.join(','));
  ok('removed trials are too', names.indexOf('trialsgone') >= 0);
  const def = (p.STORE_DEFS || []).find(d => d.name === 'trials');
  ok('under the key it already used', def && def.key === 'ut_trials_v1', def && def.key);
  ok('and the registry hands back the live array', def && def.get() === p.TRIALS);
  const gdef = (p.STORE_DEFS || []).find(d => d.name === 'trialsgone');
  ok('tombstones have their own key', gdef && gdef.key === 'ut_trials_gone_v1');
}
ok('it no longer writes itself by hand',
   SRC.indexOf('localStorage.setItem(TR_KEY,JSON.stringify(TRIALS))') < 0);
/* Filled in place, never reassigned: the store registry, TRSYNC and a dozen
   closures all hold this one array. */
ok('the array is never swapped out', SRC.indexOf('TRIALS=JSON.parse(JSON.stringify(TRIALS_SEED))') < 0);
ok('nor by the reseed', SRC.indexOf('TRIALS=JSON.parse(JSON.stringify(TRIALS_SEED)).concat(kept)') < 0);
ok('nor by a delete', SRC.indexOf('TRIALS=TRIALS.filter(') < 0);

/* ---------------------------------------------------------------- */
section('1. nothing here reads currentRole');
{
  const i = SRC.indexOf('function trGrantLabs(');
  const j = SRC.indexOf('function trTrialOfRes(');
  const block = SRC.slice(i, j);
  ok('the access block was found', i > 0 && j > i);
  ok('and it never mentions currentRole', block.indexOf('currentRole') < 0);
  /* Check for the CODE that defined it, never the bare name — the comment that
     replaced it says what it replaced, and would match. */
  ok('the old hardcoded second-lab map is gone', SRC.indexOf('var TR_EXTRA_LABS=') < 0);
  ok('the second lab is a roster grant now', SRC.indexOf("'trials:Sorochan'") > 0);
}

/* ---------------------------------------------------------------- */
section('2. who edits which lab — the app against the rules, pair by pair');
{
  const ids = w.eval("JSON.parse(JSON.stringify(PEOPLE.map(function(x){return x.id;})))") || [];
  const rec = id => w.eval("JSON.parse(JSON.stringify(rstFind(" + J(id) + ")||null))") || {};
  const labs = ['Sorochan', 'Brosnan', 'Horvath', 'Stier', 'Bowling', 'Bill', '—', ''];

  const appCan = (id, lab) => {
    w.eval("SESSION.pid=" + J(id) + ";");
    return !!w.eval("trCanEditLab(" + J(lab) + ")");
  };
  /* firestore.rules, transcribed by hand — never by calling the app:
       canEditTrialLab(lab) =
            actor()
         && roleOf(me()) != 'Undergraduate Student'
         && roleOf(me()) != 'Farm Manager'
         && lab is string && lab != '' && lab != '—'
         && (labOf(me()) == lab || grantsOf(me()).hasAny(['trials:' + lab]))   */
  const rulesCan = (id, lab) => {
    const r = rec(id);
    if (!r.id || r.role === undefined || r.role === '') return false;
    if (r.active === false) return false;
    if (r.role === 'Undergraduate Student') return false;
    if (r.role === 'Farm Manager') return false;
    if (typeof lab !== 'string' || lab === '' || lab === '—') return false;
    const mine = (r.lab === '—' ? '' : (r.lab || ''));
    return mine === lab || (r.grants || []).indexOf('trials:' + lab) >= 0;
  };
  let drift = [];
  ids.forEach(id => labs.forEach(lab => {
    if (appCan(id, lab) !== rulesCan(id, lab)) drift.push(id + '/' + lab);
  }));
  ok('trCanEditLab and canEditTrialLab agree on all ' + (ids.length * labs.length) + ' pairs',
     drift.length === 0, drift.slice(0, 6).join(' '));

  /* and the lifting rule, person by person */
  const appLift = id => { w.eval("SESSION.pid=" + J(id) + ";"); return !!w.eval("trCanLiftAny()"); };
  const rulesLift = id => {
    const r = rec(id);
    if (!r.id || !r.role || r.active === false) return false;
    return r.role === 'Farm Manager' || (r.grants || []).indexOf('lift_restrictions') >= 0;
  };
  const ldrift = ids.filter(id => appLift(id) !== rulesLift(id));
  ok('trCanLiftAny and liftsRestrictions agree on all ' + ids.length + ' people',
     ldrift.length === 0, ldrift.join(','));

  ok('nobody signed in edits nothing', (w.eval("SESSION.pid=null;"), !w.eval("trCanEditLab('Sorochan')")));
  ok('nobody signed in lifts nothing', !w.eval("trCanLiftAny()"));
}

/* ---------------------------------------------------------------- */
section('3. the lab, the undergrad, and the second lab that is a grant');
{
  const labsFor = id => { w.eval("SESSION.pid=" + J(id) + ";"); return w.eval("JSON.stringify(trEditLabs())"); };
  ok('a Sorochan technician edits Sorochan', labsFor('p01').indexOf('Sorochan') > 0, labsFor('p01'));
  ok('and nothing else', JSON.parse(labsFor('p02')).length === 1, labsFor('p02'));
  ok('Dr. Stier edits his own lab and Sorochan',
     JSON.parse(labsFor('p17')).sort().join(',') === 'Sorochan,Stier', labsFor('p17'));
  ok('the grant is what says so', w.eval("SESSION.pid='p17';JSON.stringify(trGrantLabs('p17'))") === '["Sorochan"]');
  const ug = w.eval("JSON.parse(JSON.stringify((PEOPLE.filter(function(x){return x.role==='Undergraduate Student'&&x.active!==false;})[0]||{}).id))");
  ok('an undergraduate edits no lab at all', JSON.parse(labsFor(ug)).length === 0, ug + ' ' + labsFor(ug));
  ok('and Bill edits none either', JSON.parse(labsFor('p07')).length === 0, labsFor('p07'));
  /* A deactivated person keeps their roster row and loses everything on it. */
  w.eval("var _p=rstFind('p02'); _p.active=false;");
  ok('somebody switched off edits nothing', JSON.parse(labsFor('p02')).length === 0);
  w.eval("var _p=rstFind('p02'); _p.active=true;");
}

/* ---------------------------------------------------------------- */
section('4. THE ONE THAT MATTERS — Bill lifts, and touches nothing else');
{
  w.eval("SESSION.pid='p01';");                       /* a Sorochan technician */
  w.eval("TRIALS.length=0; TR_GONE.length=0;");
  w.eval("TRIALS.push({id:'sT1',title:'Fraise mow depth',lab:'Sorochan',stage:'active'," +
         "start:'2026-08-01',end:'2026-12-01',locations:[{plot:'AZ06',sqft:100}]," +
         "restrictions:[{id:'rT1',type:'mow',scope:'AZ06',start:'2026-08-01',end:'2026-12-01',by:'p01',note:''}]});");
  const t = () => w.eval("trById('sT1')");
  const r = () => w.eval("trById('sT1').restrictions[0]");

  w.eval("SESSION.pid='p07';");                       /* Bill */
  ok('Bill may not edit the study', !w.eval("trCanEdit(trById('sT1'))"));
  ok('Bill MAY lift its restriction', w.eval("trCanLift(trById('sT1').restrictions[0])"));
  ok('Bill may not push the study document up', !w.eval("trsyncCanPushTrial(trById('sT1'))"));
  ok('but he may push the lift', w.eval("trsyncCanPushLift(trById('sT1'))"));

  w.eval("SESSION.pid='p01';");                       /* the lab */
  ok('the lab may edit its own study', w.eval("trCanEdit(trById('sT1'))"));
  ok('and may lift its own restriction', w.eval("trCanLift(trById('sT1').restrictions[0])"));

  w.eval("SESSION.pid='p05';");                       /* a Brosnan technician */
  ok('another lab may not edit it', !w.eval("trCanEdit(trById('sT1'))"));
  ok('nor lift its restriction', !w.eval("trCanLift(trById('sT1').restrictions[0])"));
  ok('nor push either document', !w.eval("trsyncCanPushTrial(trById('sT1'))")
     && !w.eval("trsyncCanPushLift(trById('sT1'))"));

  const ug = w.eval("JSON.parse(JSON.stringify((PEOPLE.filter(function(x){return x.role==='Undergraduate Student'&&x.active!==false&&x.lab==='Sorochan';})[0]||PEOPLE.filter(function(x){return x.role==='Undergraduate Student';})[0]||{}).id))");
  w.eval("SESSION.pid=" + J(ug) + ";");
  ok('an undergraduate in the lab may not edit', !w.eval("trCanEdit(trById('sT1'))"), ug);
  ok('nor lift', !w.eval("trCanLift(trById('sT1').restrictions[0])"));
  ok('but does see an active study', w.eval("trVisible(trById('sT1'))"));
}

/* ---------------------------------------------------------------- */
section('5. the study that goes up carries no lift state');
{
  w.eval("SESSION.pid='p07';");
  w.eval("var _r=trById('sT1').restrictions[0]; _r.lifted='2026-08-26'; _r.liftedBy='Bill Czekai'; _r.liftedByPid='p07';");
  const doc = JSON.parse(w.eval("JSON.stringify(trTrialDoc(trById('sT1')))"));
  ok('the study document has the restriction', (doc.restrictions || []).length === 1);
  ok('with no lifted date on it', doc.restrictions[0].lifted === undefined, J(doc.restrictions[0]));
  ok('and no lifter', doc.restrictions[0].liftedBy === undefined && doc.restrictions[0].liftedByPid === undefined);
  ok('and it is marked not removed', doc.removed === false);
  ok('its id matches the study', doc.id === 'sT1');

  const lift = JSON.parse(w.eval("JSON.stringify(trLiftDoc(trById('sT1'),trById('sT1').restrictions[0]))"));
  ok('the lift travels on its own, keyed by the restriction', lift.id === 'rT1');
  ok('it names the study and the lab', lift.trialId === 'sT1' && lift.lab === 'Sorochan');
  ok('and who lifted it, and when', lift.lifted === '2026-08-26' && lift.liftedByPid === 'p07');
  ok('a restriction that is not lifted has no lift document',
     w.eval("trLiftDoc(trById('sT1'),{id:'rT9',type:'mow'})") === null);

  /* An incoming edit from the lab must not quietly un-lift it. */
  w.eval("TRSYNC.lifts['rT1']={lifted:'2026-08-26',liftedBy:'Bill Czekai',liftedByPid:'p07'};");
  w.eval("var _t=trById('sT1'); _t.restrictions[0].lifted=undefined; _t.restrictions[0].liftedBy=undefined; trsyncApplyLifts(_t);");
  ok('a lift is stamped back on after an incoming study edit',
     w.eval("trById('sT1').restrictions[0].lifted") === '2026-08-26');
}

/* ---------------------------------------------------------------- */
section('6. a removal is a tombstone, not a hole');
{
  w.eval("SESSION.pid='p01';");
  const before = w.eval("TRIALS.length");
  w.eval("trMarkGone(trById('sT1'),'Dillon McCallum','p01','2026-08-26T12:00:00.000Z');");
  ok('it comes off the list', w.eval("TRIALS.length") === before - 1);
  ok('the study is gone from every screen', w.eval("trById('sT1')") === null);
  ok('but the removal is remembered', w.eval("trIsGone('sT1')"));
  ok('with who and when', w.eval("TR_GONE[0].removedBy") === 'Dillon McCallum'
     && w.eval("TR_GONE[0].removedAt") === '2026-08-26T12:00:00.000Z');
  ok('and which lab it belonged to', w.eval("TR_GONE[0].lab") === 'Sorochan');

  const g = JSON.parse(w.eval("JSON.stringify(trGoneDoc(TR_GONE[0]))"));
  ok('the tombstone is what goes up', g.removed === true && g.id === 'sT1');
  ok('and it carries the lab, so the rules can check it', g.lab === 'Sorochan');
  ok('marking it twice does not double it', (w.eval("trMarkGone({id:'sT1',lab:'Sorochan'},'x','p01','')"),
     w.eval("TR_GONE.length") === 1));
  ok('a tombstone with no lab never goes up', w.eval("trGoneDoc({id:'sX',lab:''})") === null);
}

/* ---------------------------------------------------------------- */
section('7. the rules file says all of it');
{
  ok('there is a trials block', /match \/trials\/\{trialId\}/.test(RULES));
  ok('and a separate lifts block', /match \/triallifts\/\{restrictionId\}/.test(RULES));
  ok('reading is open to everyone signed in',
     /match \/trials\/\{trialId\} \{[\s\S]{0,200}?allow read: if actor\(\);/.test(RULES));
  ok('a study is never deleted', /match \/trials[\s\S]*?allow delete: if false;/.test(RULES));
  ok('a lift is never deleted', /match \/triallifts[\s\S]*?allow delete: if false;/.test(RULES));
  ok('the edit rule is lab-scoped', /canEditTrialLab\(request\.resource\.data\.lab\)/.test(RULES));
  ok('and an update checks the lab it is moving OUT of too',
     /allow update: if canEditTrialLab\(request\.resource\.data\.lab\)[\s\S]{0,120}?canEditTrialLab\(resource\.data\.lab\)/.test(RULES));
  ok('the manager is excluded from editing', /roleOf\(me\(\)\) != 'Farm Manager'/.test(RULES));
  ok('lifting is a role plus a movable grant',
     /liftsRestrictions\(\)[\s\S]{0,300}?lift_restrictions/.test(RULES));
  ok('the second lab is read as a grant', /'trials:' \+ lab/.test(RULES));
  ok('Bill is never named in the trials blocks', RULES.indexOf('Bill Czekai') < 0);
}

/* ---------------------------------------------------------------- */
section('8. sharing, and the wiring');
{
  ok('it is on from the moment the app opens', p.TRSYNC && p.TRSYNC.on === true);
  ok('nothing on this phone decides it', SRC.indexOf('ut_trials_shared_v1') < 0);
  ok('it has a read-out on the Shared database screen', /st:TRSYNC,\s*summary:trsyncSummary\(\)/.test(SRC));
  /* Anchored to the PAIR, not to being last in the list -- the next drawer
     adds itself after this one. */
  ok('the read-out is in the list', /st:TPLSYNC[\s\S]{0,900}st:TRSYNC/.test(SRC));
  ok('and there is no button to turn it off', SRC.indexOf("closest('#sdb-trials')") < 0);
  ok('it rides the two-second scan', SRC.indexOf('trsyncTick();') > 0);
  ok('and is hydrated at startup', SRC.indexOf('trsyncHydrate();') > 0);
  ok('two collections, named', SRC.indexOf("TRSYNC_COLL='trials'") > 0
     && SRC.indexOf("TRSYNC_LIFTS='triallifts'") > 0);
  ok('the read-out says in plain words what is being shared',
     /restrictions they put on the ground/.test(SRC));
  ok('the summary reads in plain words', typeof w.eval("trsyncSummary()") === 'string');
}

/* ---------------------------------------------------------------- */
section('9. how big a trial is — treatments across, reps down');
{
  /* 6 treatments of 5 ft, 4 reps of 10 ft, 3 ft alleys between them.
     Across:  6*5 + 5*3 = 45 ft.   Down:  4*10 + 3*3 = 49 ft.
     The alleys are counted BETWEEN plots and not around the outside, which is
     the whole reason this is arithmetic and not a guess. */
  const t = { nTrt: '6', nRep: '4', plotW: '5', plotL: '10', alley: '3' };
  const g = w.eval('trGridFt(' + J(t) + ')');
  ok('treatments are the columns', w.eval('trCols(' + J(t) + ')') === 6);
  ok('reps are the rows', w.eval('trRows(' + J(t) + ')') === 4);
  ok('45 ft across', Math.round(g.w) === 45, String(g.w));
  ok('49 ft down', Math.round(g.h) === 49, String(g.h));
  ok('and the total is those two multiplied',
     w.eval('trTotalFt2(' + J(t) + ')') === 45 * 49, String(w.eval('trTotalFt2(' + J(t) + ')')));

  /* No alleys means no alleys — not a default somebody has to remember. */
  const noAlley = { nTrt: '4', nRep: '3', plotW: '5', plotL: '5' };
  ok('with no alley it is plots and nothing else',
     w.eval('trTotalFt2(' + J(noAlley) + ')') === 4 * 5 * 3 * 5);

  /* THE ONE THAT MATTERS for the map: the footprint is the real rectangle,
     not a square root of an area. A 45 x 49 trial must not come back square. */
  const fp = w.eval('trFootprintFt(' + J(t) + ')');
  ok('the footprint is the real shape', Math.round(fp.w) === 45 && Math.round(fp.h) === 49,
     Math.round(fp.w) + 'x' + Math.round(fp.h));

  /* A study saved before any of this existed has a typed area and a grid and
     nothing else. It must still draw, the old way, untouched. */
  const legacy = { area: '1200', layout: { rows: '3', cols: '4' } };
  ok('an old study still knows its treatments', w.eval('trCols(' + J(legacy) + ')') === 4);
  ok('and its reps', w.eval('trRows(' + J(legacy) + ')') === 3);
  ok('its total is the number that was typed in', w.eval('trTotalFt2(' + J(legacy) + ')') === 1200);
  const lfp = w.eval('trFootprintFt(' + J(legacy) + ')');
  ok('and it is still drawn from that area', Math.round(lfp.w * lfp.h) === 1200,
     String(Math.round(lfp.w * lfp.h)));
  ok('wider than tall, in the ratio of the grid', lfp.w > lfp.h);

  ok('both counts stop at 50', p.TR_MAX_N === 50);
  ok('and a bigger number is pulled back to it',
     w.eval("trCols({nTrt:'999'})") === 50);
}

/* ---------------------------------------------------------------- */
section('10. a restriction on the form covers the whole study');
{
  /* One row on the form becomes one record per plot. Anything added from the
     study page has no gid and must be left completely alone. */
  const t = { locations: [{ plot: 'B14' }, { plot: 'B15' }],
              hasRes: true,
              resDraft: [{ gid: 'g1', type: 'mow', start: '2026-04-01', end: '2026-06-01', noEnd: false, note: 'n' }],
              restrictions: [{ id: 'rOld', type: 'irrigate', scope: 'B14', start: '2026-01-01', end: '2026-02-01' }] };
  const out = w.eval('(function(){var t=' + J(t) + ';trSyncFormRes(t);return t.restrictions;})()');
  ok('one record per plot', out.filter(r => r.gid === 'g1').length === 2, String(out.length));
  ok('and they name real plots, never a wildcard',
     out.filter(r => r.gid === 'g1').map(r => r.scope).sort().join(',') === 'B14,B15');
  ok('the one added from the study page is untouched',
     out.some(r => r.id === 'rOld' && r.type === 'irrigate' && !r.gid));

  /* THE ONE THAT MATTERS: a record already there is reused, not rebuilt. A
     lift is filed against the restriction's own id, so a fresh id would make
     a restriction somebody deliberately lifted come back. */
  const t2 = { locations: [{ plot: 'B14' }],
               hasRes: true,
               resDraft: [{ gid: 'g1', type: 'mow', start: '2026-04-01', end: '2026-07-01', noEnd: false, note: '' }],
               restrictions: [{ id: 'rKeep', gid: 'g1', type: 'mow', scope: 'B14', start: '2026-04-01', end: '2026-06-01' }] };
  const out2 = w.eval('(function(){var t=' + J(t2) + ';trSyncFormRes(t);return t.restrictions;})()');
  ok('editing a restriction keeps its id', out2.length === 1 && out2[0].id === 'rKeep',
     J(out2.map(r => r.id)));
  ok('and takes the new date', out2[0].end === '2026-07-01');

  /* Unticking "is there a restriction" takes the form's own records off, and
     still leaves the study page's alone. */
  const t3 = { locations: [{ plot: 'B14' }], hasRes: false,
               resDraft: [{ gid: 'g1', type: 'mow', start: '2026-04-01', end: '2026-06-01' }],
               restrictions: [{ id: 'rOld', type: 'irrigate', scope: 'B14' },
                              { id: 'rForm', gid: 'g1', type: 'mow', scope: 'B14' }] };
  const out3 = w.eval('(function(){var t=' + J(t3) + ';trSyncFormRes(t);return t.restrictions;})()');
  ok('turning restrictions off removes the form’s own', out3.length === 1 && out3[0].id === 'rOld');

  /* The rows are rebuilt from the records, so there is no second copy. */
  const back = w.eval('trResDraftFrom(' + J({ restrictions: [
    { id: 'r1', gid: 'gA', type: 'mow', scope: 'B14', start: '2026-04-01', end: '' },
    { id: 'r2', gid: 'gA', type: 'mow', scope: 'B15', start: '2026-04-01', end: '' },
    { id: 'r3', type: 'irrigate', scope: 'B14' }] }) + ')');
  ok('two records from one row read back as one row', back.length === 1, String(back.length));
  ok('and no end date reads back as "until it is lifted"', back[0].noEnd === true);
  ok('a study-page restriction is not one of the form’s rows', !back.some(r => r.gid === undefined));
}

/* ---------------------------------------------------------------- */
section('11. a restriction with no end date');
{
  ok('an empty end date is still live', w.eval("trResState({start:'2020-01-01',end:''})") === 'active');
  ok('and reads as until it is lifted', w.eval("trResEndText({end:''})") === 'until it is lifted');
  ok('a real end date still reads as a date', w.eval("trResEndText({end:'2026-06-01'})").indexOf('Jun') === 0);
  ok('nothing on screen ever says the end date is unknown for a restriction',
     SRC.indexOf('End date unknown') > 0 && !/restriction[^\n]{0,80}End date unknown/i.test(SRC));
}

/* ---------------------------------------------------------------- */
section('12. THE ONE THAT MATTERS — the form’s own state never reaches the database');
{
  /* hasRes and resDraft are how the FORM holds its restriction rows. On a
     stored study they would be a second copy of every restriction that nothing
     reads -- and, because every phone compares a study with what the server
     last said, a copy that can differ is a copy that gets sent again. */
  const i = SRC.indexOf('function trSaveStudy(');
  const j = SRC.indexOf('/* ========================= PIN PICKER');
  const block = SRC.slice(i, j);
  ok('the save block was found', i > 0 && j > i);
  ok('the record written is a copy, not the draft itself',
     /var rec=JSON\.parse\(JSON\.stringify\(trDraft\)\)/.test(block));
  ok('and both form-only fields are stripped off it',
     /delete rec\.hasRes/.test(block) && /delete rec\.resDraft/.test(block));
  ok('the draft is never left pointing at the stored study',
     block.indexOf('TRIALS[i]=trDraft') < 0 && block.indexOf('TRIALS.unshift(trDraft)') < 0);
  ok('the total area is derived, never typed', /trDraft\.area=String\(trTotalFt2\(trDraft\)\)/.test(block));
  /* And the form field that used to type it is gone. */
  ok('there is no trial-area box on the form any more', SRC.indexOf("id=\"tre-area\"") < 0);
  ok('nor a treatments/products box', SRC.indexOf("id=\"tre-treat\"") < 0);
}

/* ---------------------------------------------------------------- */
section('13. the two lists the farm owns');
{
  ok('there are study categories', Array.isArray(p.TRIAL_CATS) && p.TRIAL_CATS.length > 0);
  ok('and restriction types', Array.isArray(p.TR_RTYPES) && p.TR_RTYPES.length === 8);
  ok('the original eight keep their keys',
     p.TR_RTYPES.map(r => r.k).join(',') === 'mow,irrigate,fungicide,herbicide,insecticide,fertilizer,wetting,cultivate');

  /* Junk arriving from another phone is refused, never applied. */
  ok('an empty category list is refused', w.eval('trialCatsValid([])') === false);
  ok('a blank category is refused', w.eval("trialCatsValid(['ok',''])") === false);
  ok('a repeated category is refused', w.eval("trialCatsValid(['a','a'])") === false);
  ok('a restriction type with no color is refused',
     w.eval("resTypesValid([{k:'x',label:'No x'}])") === false);
  ok('a restriction type with a bad color is refused',
     w.eval("resTypesValid([{k:'x',label:'No x',c:'red'}])") === false);
  ok('a good one is accepted',
     w.eval("resTypesValid([{k:'x',label:'No x',c:'#123456',stops:['mow']}])") === true);

  /* The color the app hands out has to be one color-blind mode leaves alone,
     or the badge comes out a color nobody chose. */
  const cb = w.eval('JSON.parse(JSON.stringify(CB_MAP))');
  (p.TR_RES_PALETTE || []).forEach(c => {
    ok('the palette color ' + c + ' maps to itself in color-blind mode', cb[c] === c, cb[c]);
  });

  ok('a new type gets a key from its name', w.eval("resTypeKey('No topdressing')") === 'topdressing');
  ok('and never collides with one already there', w.eval("resTypeKey('No mow')") === 'mow2');
  ok('and a four-letter badge', w.eval("resTypeAb('No topdressing')") === 'Topd');
  ok('the color it gets is from the palette',
     (p.TR_RES_PALETTE || []).indexOf(w.eval('resTypeColor()')) >= 0);
}

/* ---------------------------------------------------------------- */
section('14. THE ONE THAT MATTERS — a restriction type the farm adds really stops work');
{
  /* A type that draws on the map and blocks nothing is the worst of both: it
     looks like it is protecting the ground and it is not. */
  const before = w.eval("JSON.stringify(jobResCfg('Mow','Rotary').kinds)");
  ok('mowing is blocked by no-mow today', JSON.parse(before).indexOf('mow') >= 0, before);
  w.eval("TR_RTYPES.push({k:'topdressing',label:'No topdressing',ab:'Topd',c:'#009e73',stops:['mow','cultivate']});");
  const after = JSON.parse(w.eval("JSON.stringify(jobResCfg('Mow','Rotary').kinds)"));
  ok('a new type that stops mowing now blocks a mow', after.indexOf('topdressing') >= 0, J(after));
  ok('and the original is still there', after.indexOf('mow') >= 0);
  const cult = JSON.parse(w.eval("JSON.stringify(jobResCfg('Aerate','Aeration').kinds)"));
  ok('it blocks cultivation too', cult.indexOf('topdressing') >= 0, J(cult));
  const spray = JSON.parse(w.eval("JSON.stringify(jobResCfg('Spray','Fungicide').kinds)"));
  ok('and nothing it was not ticked for', spray.indexOf('topdressing') < 0, J(spray));

  /* A type with nothing ticked changes nothing at all. */
  w.eval("TR_RTYPES.push({k:'quiet',label:'No nothing',ab:'Quie',c:'#cc79a7',stops:[]});");
  const still = JSON.parse(w.eval("JSON.stringify(jobResCfg('Mow','Rotary').kinds)"));
  ok('a type that stops nothing blocks nothing', still.indexOf('quiet') < 0, J(still));

  /* THE FAILURE DIRECTION. An empty or broken list must leave the eight
     built-ins blocking exactly what they always did -- never unblock a job on
     ground a study has closed. */
  w.eval("TR_RTYPES.length=0;");
  const empty = JSON.parse(w.eval("JSON.stringify(jobResCfg('Mow','Rotary').kinds)"));
  ok('with the list wiped, no-mow still stops a mow', empty.indexOf('mow') >= 0, J(empty));
  const emptySpray = JSON.parse(w.eval("JSON.stringify(jobResCfg('Spray','Pesticide').kinds)"));
  ok('and no-fungicide still stops a spray', emptySpray.indexOf('fungicide') >= 0, J(emptySpray));
  w.eval("resTypesApply(JSON.parse(JSON.stringify(TR_RTYPES_SEED)));");
  ok('and the built-in eight go back', w.eval('TR_RTYPES.length') === 8);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
