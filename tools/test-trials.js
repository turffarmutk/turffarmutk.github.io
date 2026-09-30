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

/* ---------------------------------------------------------------- */
section('15. placing the pin — close enough to see, and draggable after');
{
  /* Leaflet is a stub in this harness, so the DRAG itself cannot be performed
     here. What can be pinned is everything that made it impossible before:
     the zoom ceiling, the kind of thing the pin is, and the one call that
     would break a drag halfway through. */
  const i = SRC.indexOf('function trRenderPin(');
  const j = SRC.indexOf("var sv=document.getElementById('trp-save')");
  const block = SRC.slice(i, j);
  ok('the placing screen was found', i > 0 && j > i);

  /* THE ONE THAT CAUSED IT. This map was capped at 18 while every other map in
     the app goes to 20, so the plot opened as a small square in the middle and
     pinching did nothing. */
  const ceil = /maxZoom:(\d+),zoomSnap/.exec(block);
  ok('the placing map zooms in past the farm map', ceil && +ceil[1] >= 20, ceil && ceil[1]);
  ok('and it is no longer capped at 18', block.indexOf('maxZoom:18') < 0);
  ok('its imagery is allowed to enlarge past what exists',
     /maxZoom:21,maxNativeZoom:19/.test(block));
  ok('and the old 60% padding that threw away half the screen is gone',
     block.indexOf('pad(0.6)') < 0);
  ok('a study that already has a pin opens on the trial, not the whole plot',
     /trFootprintBounds\(trDraft/.test(block));

  /* Draggable means a marker. A circleMarker cannot be dragged at all, which
     is why it was the wrong thing here. */
  ok('the pin is a marker', /_trpPin=L\.marker\(/.test(SRC));
  ok('and it is draggable', /_trpPin=L\.marker\([\s\S]{0,60}draggable:true/.test(SRC));
  ok('not a circle any more', SRC.indexOf('_trpPin=L.circleMarker(') < 0);
  ok('it has a dragend that puts it back inside the plot',
     /_trpPin\.on\('dragend'/.test(SRC) && /function trpWireDrag/.test(SRC));

  /* THE ONE THAT MATTERS while a finger is on the screen. setIcon() rebuilds
     the marker's element, and rebuilding the element being dragged ends the
     drag halfway through -- the pin would stick and the map would carry on. */
  const drag = SRC.slice(SRC.indexOf('function trpWireDrag'), SRC.indexOf("_trpPin.on('dragend'"));
  ok('the drag handler was found', drag.length > 50);
  ok('and it never calls setIcon mid-drag', drag.indexOf('setIcon') < 0);
  ok('it recolors the dot in place instead', /trpPinColor\(/.test(drag));
  ok('and it does not clamp while the finger is still down',
     drag.indexOf('trClampToPlot') < 0);

  /* The clamp itself, which is what dragend leans on. Pure maths, so it can
     really be run: a point well outside the plot has to come back inside it. */
  const t = { nTrt: '2', nRep: '2', plotW: '5', plotL: '5' };
  const ring = w.eval("trPlotRing('B14')");
  ok('B14 has an outline to test against', Array.isArray(ring) && ring.length > 2);
  const mid = w.eval("trPlotCentroid('B14')");
  ok('and a centre inside itself', w.eval('trPointInRing(' + mid[0] + ',' + mid[1] + ',trPlotRing("B14"))'));
  /* a quarter-degree away is comfortably off the farm */
  const out = w.eval('JSON.stringify(trClampToPlot(' + J(t) + ',' + (mid[0] + 0.002) + ',' + (mid[1] + 0.002) + ',0,"B14"))');
  const c = JSON.parse(out);
  ok('a pin let go outside the plot is moved back in', c.clamped === true && c.fits === true, out);
  ok('and it lands inside the outline',
     w.eval('trPointInRing(' + c.lat + ',' + c.lng + ',trPlotRing("B14"))'), out);
  /* and one dropped inside is left exactly where it was put */
  const keep = JSON.parse(w.eval('JSON.stringify(trClampToPlot(' + J(t) + ',' + mid[0] + ',' + mid[1] + ',0,"B14"))'));
  ok('a pin let go inside is not shifted', keep.clamped === false && keep.lat === mid[0], J(keep));

  /* The dot has to have a thumb-sized grab area and survive color-blind mode. */
  ok('the pin is bigger than it looks, for a thumb', /iconSize:\[34,34\]/.test(SRC));
  ok('and it asks for its own color-blind color', /function trpSafe/.test(SRC)
     && /trpSafe\('#ff8200'\)|trpSafe\(col\)/.test(SRC));
  ok('the dot is styled by a scoped name, not a bare one', HTML.indexOf('.trp-pin{') > 0);
}

/* ---------------------------------------------------------------- */
section('16. THE ONE THAT MATTERS — the stage does not decide, the dates do');
{
  /* Dillon, 2026-09-30: a study still at the Planned stage kept its
     restrictions off the farm map after their start date had passed, so closed
     ground looked open. The restriction's own dates are the only test now, at
     every stage and for everybody. Getting this wrong costs a season's trial,
     so it is checked by running the real code rather than by reading it. */
  w.eval("SESSION.pid='p01';");
  w.eval("TRIALS.length=0; TR_GONE.length=0;");
  const mk = (id, stage, lab, start, end) =>
    "TRIALS.push({id:'" + id + "',title:'" + id + " study',lab:'" + lab + "',stage:'" + stage + "'," +
    "coverage:'whole',multiPlot:false,start:'2020-01-01',end:'" + end + "'," +
    "locations:[{plot:'AZ06',sqft:100}]," +
    "restrictions:[{id:'r_" + id + "',type:'mow',scope:'AZ06',start:'" + start + "',end:'" + end + "',by:'p01',note:''}]});";

  w.eval(mk('sPlan', 'planned', 'Sorochan', '2020-01-01', '2099-01-01'));
  const held = () => w.eval("JSON.stringify(jobRes('AZ06','Mow','Rotary').full.map(function(x){return x.t.id;}))");
  ok('a PLANNED study whose restriction has started stops the mower',
     JSON.parse(held()).indexOf('sPlan') >= 0, held());

  /* and the same study before its restriction starts does not */
  w.eval("trById('sPlan').restrictions[0].start='2099-01-01';");
  ok('the same study, restriction not started yet, stops nothing', JSON.parse(held()).length === 0, held());
  w.eval("trById('sPlan').restrictions[0].start='2020-01-01';");

  /* a completed study inside a re-entry interval still holds the ground */
  w.eval("trById('sPlan').stage='completed';");
  ok('a COMPLETED study with time left on its restriction still holds it',
     JSON.parse(held()).indexOf('sPlan') >= 0, held());

  /* an expired restriction lets go, whatever the stage says */
  w.eval("trById('sPlan').stage='active'; trById('sPlan').restrictions[0].end='2020-06-01';");
  ok('a restriction whose end date has gone by lets go', JSON.parse(held()).length === 0, held());

  /* and Lift still ends one early */
  w.eval("trById('sPlan').restrictions[0].end='2099-01-01'; trById('sPlan').restrictions[0].lifted='2026-01-01';");
  ok('a lifted restriction stops nothing', JSON.parse(held()).length === 0, held());
  w.eval("delete trById('sPlan').restrictions[0].lifted;");

  /* THE CREW HALF: an undergraduate cannot SEE another lab's draft study, and
     must still be stopped by the ground it closes. */
  const ug = w.eval("JSON.parse(JSON.stringify((PEOPLE.filter(function(x){return x.role==='Undergraduate Student'&&x.active!==false;})[0]||{}).id))");
  w.eval("trById('sPlan').stage='planned'; SESSION.pid='" + ug + "';");
  ok('the draft study itself stays hidden from an undergraduate', !w.eval("trVisible(trById('sPlan'))"));
  ok('but its closed ground still stops their mower',
     JSON.parse(held()).indexOf('sPlan') >= 0, held());
  ok('and the popup gives them the lab without the study name',
     w.eval("trResStudyName(trById('sPlan'))").indexOf('lab study') > 0
     && w.eval("trResStudyName(trById('sPlan'))").indexOf('sPlan study') < 0,
     w.eval("trResStudyName(trById('sPlan'))"));
  w.eval("SESSION.pid='p01';");
  ok('somebody who may see the study gets its real name',
     w.eval("trResStudyName(trById('sPlan'))").indexOf('sPlan study') === 0,
     w.eval("trResStudyName(trById('sPlan'))"));

  /* Nobody puts a stage test back into the two places that ask. */
  ok('the map shading asks no stage question', !/stage!=='active'[\s\S]{0,80}trLiveRes/.test(SRC));
  ok('and neither does the block on a job',
     !/function jobRes\(plot[\s\S]{0,400}stage!=='active'/.test(SRC));
}

/* ---------------------------------------------------------------- */
section('17. one restriction, several plots, in one pass of the form');
{
  /* Dillon, 2026-09-30: the same rest usually goes on a whole study, and the
     form took one plot at a time. It takes a list now and writes one record
     per plot -- separate records on purpose, because r.scope is read as ONE
     plot name by the map, the job block and the Lift button. */
  w.eval("TRIALS.length=0; TR_GONE.length=0; SESSION.pid='p01';");
  w.eval("TRIALS.push({id:'sMulti',title:'Six plot study',lab:'Sorochan',stage:'active'," +
         "coverage:'whole',multiPlot:true,start:'2026-01-01',end:'2026-12-01'," +
         "locations:[{plot:'AZ06'},{plot:'AZ07'},{plot:'AZ08'}],restrictions:[]});");
  w.eval("trResNew('sMulti');");
  ok('the form opens on the first plot only, as it always did',
     JSON.stringify(w.eval('JSON.parse(JSON.stringify(trResDraft.scopes))')) === '["AZ06"]',
     w.eval('JSON.stringify(trResDraft.scopes)'));

  /* save all three */
  w.eval("trResDraft.scopes=['AZ06','AZ07','AZ08']; trResDraft.start='2026-02-01'; trResDraft.end='2026-11-01';");
  w.eval("(function(){var b=document.getElementById('trr-body');if(b)b.innerHTML='';})();");
  w.eval("trRenderRes(); trResDraft.scopes=['AZ06','AZ07','AZ08']; trSaveRes();");
  const recs = w.eval("JSON.parse(JSON.stringify(trById('sMulti').restrictions))");
  ok('three plots ticked writes three records', recs.length === 3, String(recs.length));
  ok('each names one plot, never a list',
     recs.every(r => typeof r.scope === 'string') &&
     recs.map(r => r.scope).sort().join(',') === 'AZ06,AZ07,AZ08',
     JSON.stringify(recs.map(r => r.scope)));
  ok('each gets its own id, so one can be lifted alone',
     new Set(recs.map(r => r.id)).size === 3);
  /* THE ONE THAT MATTERS: no gid. trSyncFormRes() rebuilds t.restrictions from
     the protocol form's rows plus every record WITHOUT a gid, so a gid this
     form invented would be deleted the next time the protocol was saved. */
  ok('and no gid, or saving the protocol would delete them',
     recs.every(r => !r.gid), JSON.stringify(recs.map(r => r.gid)));
  /* the protocol form really does leave them alone */
  w.eval("(function(){var t=trById('sMulti');t.hasRes=false;t.resDraft=[];trSyncFormRes(t);})();");
  ok('saving the protocol leaves all three standing',
     w.eval("trById('sMulti').restrictions.length") === 3,
     String(w.eval("trById('sMulti').restrictions.length")));
  ok('a study with no plots refuses rather than writing a nameless record',
     !/scopes\.length[\s\S]{0,40}push\(/.test(SRC) && /if\(!scopes\.length\)/.test(SRC));
}

/* ---------------------------------------------------------------- */
section('18. a restriction that runs for the whole trial');
{
  /* Dillon, 2026-09-30: the quick option when entering a trial. It is not a
     default filled in once -- the dates are worked out from the study on every
     save, so moving the trial's end date moves the restriction with it. */
  const run = (t) => w.eval('(function(){var t=' + J(t) + ';trSyncFormRes(t);return t.restrictions;})()');

  const base = { start: '2026-03-01', end: '2026-08-01',
                 locations: [{ plot: 'B14' }, { plot: 'B15' }], hasRes: true,
                 resDraft: [{ gid: 'g1', type: 'mow', whole: true, start: '2020-01-01', end: '2020-02-01', note: '' }] };
  const out = run(base);
  ok('it takes the study\u2019s start date, not the row\u2019s',
     out.every(r => r.start === '2026-03-01'), J(out.map(r => r.start)));
  ok('and the study\u2019s end date', out.every(r => r.end === '2026-08-01'), J(out.map(r => r.end)));
  ok('on every plot the study uses', out.length === 2);
  ok('and it is marked so it can be read back', out.every(r => r.whole === true));

  /* THE ONE THAT MATTERS: move the trial, and the restriction moves with it. */
  const moved = run(Object.assign({}, base, { end: '2026-10-15' }));
  ok('moving the trial\u2019s end date moves the restriction', moved.every(r => r.end === '2026-10-15'),
     J(moved.map(r => r.end)));

  /* A trial with no end date gives a restriction with no end date, which the
     app words as "until it is lifted" and trResState() keeps live. */
  const openEnded = run(Object.assign({}, base, { end: '' }));
  ok('a trial with no end date leaves the restriction open', openEnded.every(r => r.end === ''));
  ok('and that still reads as live', w.eval("trResState({start:'2026-03-01',end:''})") === 'active');

  /* Unticking it goes back to the row's own dates and carries no marker, so a
     record that never used this is byte-for-byte what it always was -- a
     record that differs from what the server last said gets sent again. */
  const own = run(Object.assign({}, base, {
    resDraft: [{ gid: 'g1', type: 'mow', whole: false, start: '2026-04-01', end: '2026-05-01', note: '' }] }));
  ok('a row with its own dates keeps them', own.every(r => r.start === '2026-04-01' && r.end === '2026-05-01'));
  ok('and carries no whole-trial marker at all', own.every(r => !('whole' in r)), J(own[0]));

  /* It round-trips: the form rebuilds its rows from the records. */
  const back = w.eval('trResDraftFrom(' + J({ restrictions: [
    { id: 'r1', gid: 'gA', type: 'mow', scope: 'B14', whole: true, start: '2026-03-01', end: '2026-08-01' }] }) + ')');
  ok('reopening the form knows it runs for the whole trial', back[0].whole === true);
  const backOld = w.eval('trResDraftFrom(' + J({ restrictions: [
    { id: 'r1', gid: 'gB', type: 'mow', scope: 'B14', start: '2026-03-01', end: '2026-08-01' }] }) + ')');
  ok('and a restriction saved before today does not pretend it does', backOld[0].whole === false);

  /* Switching a whole-trial row back to its own dates must not leave a record
     reusing the SAME id with a stale marker -- the id is what a lift is filed
     against, so the record is reused, not rebuilt. */
  const keep = { start: '2026-03-01', end: '2026-08-01', locations: [{ plot: 'B14' }], hasRes: true,
                 resDraft: [{ gid: 'g1', type: 'mow', whole: false, start: '2026-04-01', end: '2026-05-01' }],
                 restrictions: [{ id: 'rKeep', gid: 'g1', type: 'mow', scope: 'B14', whole: true,
                                  start: '2026-03-01', end: '2026-08-01' }] };
  const kept = run(keep);
  ok('unticking it on a saved restriction keeps the id', kept.length === 1 && kept[0].id === 'rKeep');
  ok('and clears the marker rather than leaving it stale', !('whole' in kept[0]), J(kept[0]));
}

/* ---------------------------------------------------------------- */
section('19. THE ONE THAT MATTERS \u2014 a study moves itself along, and lets go');
{
  /* Dillon, 2026-09-30: a study starts on its start date, finishes on its end
     date, and finishing hands the ground back. Tapping still works and still
     wins. Everything here runs the real code. */
  w.eval("SESSION.pid='p01'; TRIALS.length=0; TR_GONE.length=0;");
  const today = w.eval('trTodayISO()');
  const day = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n);
                       return d.toISOString().slice(0, 10); };
  const put = (o) => w.eval('TRIALS.push(' + J(Object.assign({
    lab: 'Sorochan', coverage: 'whole', multiPlot: false,
    locations: [{ plot: 'AZ06' }], restrictions: [] }, o)) + ')');
  const stage = (id) => w.eval("trById('" + id + "').stage");

  /* --- planned -> active on the start date, and not a day early --- */
  put({ id: 'aDue',   title: 'Starts today',    stage: 'planned', start: today,    end: day(90) });
  put({ id: 'aSoon',  title: 'Starts tomorrow', stage: 'planned', start: day(1),   end: day(90) });
  put({ id: 'aLate',  title: 'Started a while back', stage: 'planned', start: day(-30), end: day(60) });
  w.eval('trAutoStage()');
  ok('a study whose start date is TODAY goes active', stage('aDue') === 'active', stage('aDue'));
  ok('one starting tomorrow is left alone', stage('aSoon') === 'planned', stage('aSoon'));
  ok('one that started weeks ago goes active too', stage('aLate') === 'active', stage('aLate'));

  /* --- active -> completed the day AFTER the end date, the same comparison
         trResState() makes, so a study and its restrictions cannot disagree --- */
  w.eval("TRIALS.length=0;");
  put({ id: 'cOver',  title: 'Ended yesterday', stage: 'active', start: day(-90), end: day(-1) });
  put({ id: 'cToday', title: 'Ends today',      stage: 'active', start: day(-90), end: today });
  put({ id: 'cOpen',  title: 'No end date',     stage: 'active', start: day(-90), end: '' });
  w.eval('trAutoStage()');
  ok('a study whose end date has gone by finishes', stage('cOver') === 'completed', stage('cOver'));
  ok('one ending TODAY is still running today', stage('cToday') === 'active', stage('cToday'));
  ok('THE ONE THAT MATTERS \u2014 a study with no end date never finishes on its own',
     stage('cOpen') === 'active', stage('cOpen'));

  /* --- finishing lifts the ground --- */
  w.eval("TRIALS.length=0;");
  put({ id: 'lift', title: 'Ended, still holding', stage: 'active', start: day(-90), end: day(-1),
        restrictions: [
          { id: 'rA', type: 'mow', scope: 'AZ06', start: day(-90), end: '' },
          { id: 'rB', type: 'irrigate', scope: 'AZ06', start: day(-90), end: day(30) },
          { id: 'rC', type: 'mow', scope: 'AZ06', start: day(-90), end: day(30),
            lifted: day(-40), liftedBy: 'Bill Taylor', liftedByPid: 'p07' }] });
  w.eval('trAutoStage()');
  const res = () => w.eval("JSON.parse(JSON.stringify(trById('lift').restrictions))");
  ok('finishing lifts the restrictions still standing', res().filter(r => r.lifted).length === 3);
  ok('including an open-ended one', res().filter(r => r.id === 'rA')[0].lifted === today);
  ok('and one with time left to run', res().filter(r => r.id === 'rB')[0].lifted === today);
  ok('a lift somebody already made is left exactly as it was',
     res().filter(r => r.id === 'rC')[0].lifted === day(-40)
     && res().filter(r => r.id === 'rC')[0].liftedBy === 'Bill Taylor');
  ok('none of them stops a mower any more', w.eval("jobRes('AZ06','Mow','Rotary').full.length") === 0);
  ok('the lift names no person, because no person decided it',
     res().filter(r => r.id === 'rA')[0].liftedByPid === '');
  /* The lift has to be able to travel, or it is only true on this phone. */
  ok('and it is a real lift the drawer can send',
     w.eval("JSON.stringify(trLiftDoc(trById('lift'),trById('lift').restrictions[0]))").indexOf('"lifted"') > 0);

  /* --- THE ONE THAT MATTERS: it moves a study forward ONCE --- */
  w.eval("TRIALS.length=0;");
  put({ id: 'back', title: 'Put back by hand', stage: 'active', start: day(-90), end: day(-1) });
  w.eval('trAutoStage()');
  ok('it finishes the first time', stage('back') === 'completed');
  w.eval("trSetStage(trById('back'),'active');");          /* a person puts it back */
  w.eval('trAutoStage()');
  ok('a person putting it back to Active MAKES IT STAY there', stage('back') === 'active', stage('back'));
  w.eval('trAutoStage(); trAutoStage();');
  ok('and it stays there however many times this runs', stage('back') === 'active');

  /* the same going the other way: back to Planned is not re-started */
  w.eval("TRIALS.length=0;");
  put({ id: 'back2', title: 'Back to planned', stage: 'planned', start: day(-5), end: day(90) });
  w.eval('trAutoStage()');
  ok('it starts the first time', stage('back2') === 'active');
  w.eval("trSetStage(trById('back2'),'planned'); trAutoStage();");
  ok('put back to Planned, it stays planned', stage('back2') === 'planned', stage('back2'));

  /* --- THE OTHER ONE THAT MATTERS: only a phone the DATABASE would let write
         the study touches it. Otherwise every phone applies a change it can
         never push, and disagrees with the server for good. --- */
  w.eval("TRIALS.length=0;");
  put({ id: 'mine',   title: 'My lab',    lab: 'Sorochan', stage: 'planned', start: day(-5), end: day(90) });
  put({ id: 'theirs', title: 'Other lab', lab: 'Brosnan',  stage: 'planned', start: day(-5), end: day(90) });
  const ug = w.eval("JSON.parse(JSON.stringify((PEOPLE.filter(function(x){return x.role==='Undergraduate Student'&&x.active!==false;})[0]||{}).id))");
  w.eval("SESSION.pid='" + ug + "'; trAutoStage();");
  ok('an undergraduate\u2019s phone moves nothing at all',
     stage('mine') === 'planned' && stage('theirs') === 'planned');
  w.eval("SESSION.pid='p07'; trAutoStage();");            /* Bill edits no lab */
  ok('and neither does Bill\u2019s, because he may not write a study',
     stage('mine') === 'planned' && stage('theirs') === 'planned');
  w.eval("SESSION.pid='p01'; trAutoStage();");            /* Sorochan technician */
  ok('the lab\u2019s own phone moves its own study', stage('mine') === 'active');
  ok('and leaves another lab\u2019s alone, as the database would',
     stage('theirs') === 'planned', stage('theirs'));
  ok('what it may move is the same test the drawer uses to push',
     w.eval("trsyncCanPushTrial(trById('mine'))") && !w.eval("trsyncCanPushTrial(trById('theirs'))"));

  /* --- a completed study is left alone, and a person can still finish one by
         hand at any time --- */
  w.eval("TRIALS.length=0;");
  put({ id: 'hand', title: 'Finished by hand', stage: 'active', start: day(-10), end: day(90),
        restrictions: [{ id: 'rH', type: 'mow', scope: 'AZ06', start: day(-10), end: day(90) }] });
  const liftedByHand = w.eval("trSetStage(trById('hand'),'completed')");
  ok('a person can finish a study long before its end date', stage('hand') === 'completed');
  ok('and that lifts its restrictions too', liftedByHand === 1
     && w.eval("trById('hand').restrictions[0].lifted") === today);
  w.eval('trAutoStage()');
  ok('a finished study is not touched again', stage('hand') === 'completed');

  /* Nothing here may be wired into a snapshot handler: applying a change as a
     record ARRIVES is what spent 4.4 million reads in an afternoon. */
  ok('the automatic move is never called from a drawer\u2019s snapshot handler',
     !/syncOn[A-Za-z]*\([^)]*\)\s*\{[\s\S]{0,2000}trAutoStage\(/.test(SRC));
  ok('and it saves through trSave() like any other edit',
     /if\(moved\)\s*trSave\(\);/.test(SRC));
}

/* ---------------------------------------------------------------- */
section('20. the protocol form\u2019s order, and the restriction tile');
{
  /* Dillon, 2026-09-30: Location moved up to sit directly under Study, and the
     restriction control became a tile rather than a tick box. Both are what he
     asked for, so both are pinned -- an order is exactly the sort of thing a
     later tidy-up puts back "somewhere more logical". */
  w.eval("SESSION.pid='p01'; TRIALS.length=0; TR_GONE.length=0; trNew(); trRenderEdit();");
  const secs = w.eval("JSON.parse(JSON.stringify([].slice.call(" +
    "document.querySelectorAll('#tre-body .tr-sec')).map(function(e){return e.textContent;})))");
  ok('Location sits directly under Study',
     secs[0] === 'Study' && secs[1] === 'Location', J(secs));
  ok('and the rest follows in order',
     secs[2] === 'Size of the trial' && secs[3] === 'Restrictions', J(secs));
  /* The Location section's pin hint used to send you "above" for the trial
     size. That section is now BELOW it, so the hint has to point the other way.
     (The Total trial area line inside the size section still says "above", and
     is still right -- the fields it means really are above it.) */
  ok('the location hint no longer sends you up for the trial size',
     !/treatments, reps and plot size above/.test(SRC));
  ok('it sends you down to the section by name instead',
     /Size of the trial\\u201d below|Size of the trial\u201d below/.test(SRC));

  const tile = () => w.eval("document.getElementById('tre-hasres').className");
  ok('the restriction control is a tile, not a tick box',
     /tr-tile/.test(tile()) && !/tr-opt/.test(tile()), tile());
  ok('it is scoped, so the rule cannot land on somebody else\u2019s element',
     HTML.indexOf('.tr-tile{') > 0 && !/^\s*\.tile\{/m.test(HTML));
  ok('it starts off', !/\bon\b/.test(tile()), tile());
  ok('and says in WORDS which way it is set, not only in colour',
     /Add a restriction/.test(w.eval("document.getElementById('tre-hasres').textContent")));

  /* It still does exactly what the tick box did. */
  w.eval("document.getElementById('tre-hasres').click();");
  ok('tapping it adds the first restriction',
     w.eval('trDraft.hasRes') === true && w.eval('trDraft.resDraft.length') === 1);
  ok('and the tile lights up', /\bon\b/.test(tile()), tile());
  ok('and says how many there are',
     /1 restriction/.test(w.eval("document.getElementById('tre-hasres').textContent")));
  w.eval("document.getElementById('tre-hasres').click();");
  ok('tapping it again turns it back off', w.eval('trDraft.hasRes') === false);
  ok('and the rows come off the form',
     !w.eval("!!document.querySelector('#tre-body [data-rd-type=\"0\"]')"));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
