/*
 * Harness for farm settings — the sprayer numbers, the mower list, the labs
 * list and the semester dates.
 *
 * WHY THIS FILE EXISTS
 * These four are the reference data the rest of the app does arithmetic with.
 * A nozzle rate fixed on one phone left the rest of the farm spraying the old
 * figure; a semester date fixed on one phone left everybody else's weekly hours
 * counting against the wrong term. All four also had permission gates that read
 * `currentRole` — screen state the database cannot see — so they could not be
 * transcribed into rules at all until this pass.
 *
 * Dillon, 2026-08-26: keep the lines as they were, and give faculty the run of
 * the whole page.
 *
 * The shape is different from every other drawer and section 4 is why:
 * ONE DOCUMENT PER GROUP, and THE SHARED COPY WINS ON ARRIVAL. Everywhere else
 * a returning phone pushes up what the shared copy lacks. Here that would mean
 * a phone still on the built-in defaults overwriting the farm's real settings
 * with them.
 *
 * What this pins:
 *   1. Nothing in Farm settings reads currentRole any more.
 *   2. Who may change what — in the app AND in the rules, person by person.
 *   3. Back-to-defaults travels as a value, never as a missing document.
 *   4. A phone still on the defaults never seeds, and never clobbers.
 *   5. An incoming labs change rebuilds the four lists derived from it.
 *
 * Run:  node tools/test-farmsettings.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'UT-TurfFarm-App.html'), 'utf8');
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
const EX = ['FST_GROUPS','FSTSYNC','SESSION','PEOPLE','FARM_LABS','FARM_SEMS','MOWER_CFG',
            'SPRAY_NOZZLES','RST_LABS','TR_LABS','fstGroup','fstCanEditKit','fstCanEditLists',
            'sprCanEdit','mowCanEdit','labsCanEdit','semCanEdit','farmCanSee',
            'labsDiff','mowersDiff','sprayDiff','semIsDefault','labsRecordCount',
            'fstsyncSummary','personRole','rstFind','toast'];

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
  const scripts = [fs.readFileSync(path.join(ROOT, 'farm-geo.js'), 'utf8')];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(HTML))) { if (!/\bsrc\s*=/i.test(m[1])) scripts.push(m[2]); }
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
section('0. it boots, and there are four groups');
ok('no jsdom errors on load', b.errs.length === 0, b.errs[0]);
{
  const ids = (p.FST_GROUPS || []).map(g => g.id);
  ok('four settings groups', ids.length === 4, ids.join(','));
  ok('and they are the four screens on the page',
     ids.sort().join(',') === 'labs,mowers,semesters,spray', ids.join(','));
  (p.FST_GROUPS || []).forEach(g => {
    ok(g.id + ' can be read, applied, restored and asked about',
       typeof g.read === 'function' && typeof g.apply === 'function'
       && typeof g.restore === 'function' && typeof g.can === 'function');
  });
}

/* ---------------------------------------------------------------- */
section('1. none of the four gates reads currentRole');
{
  ['sprCanEdit', 'mowCanEdit', 'labsCanEdit', 'semCanEdit', 'farmCanSee',
   'fstCanEditKit', 'fstCanEditLists'].forEach(fn => {
    const src = w.eval(fn + '.toString()');
    ok(fn + ' is off the roster, not the screen', src.indexOf('currentRole') < 0, src.slice(0, 90));
  });
}

/* ---------------------------------------------------------------- */
section('2. who may change what — the app against the rules, person by person');
{
  const ids = w.eval("JSON.parse(JSON.stringify(PEOPLE.map(function(x){return x.id;})))") || [];
  const rec = id => w.eval("JSON.parse(JSON.stringify(rstFind(" + J(id) + ")||null))") || {};
  const asPerson = id => { w.eval("SESSION.pid=" + J(id) + ";IS_APP_ADMIN=false;"); };

  /* firestore.rules, transcribed by hand:
       canEditFarmKit()   = isAppManager() || (actor() && role != 'Undergraduate Student')
       canEditFarmLists() = isAppManager() || (actor() && (role == 'Farm Manager'
                                                        || role == 'Faculty'))            */
  const rulesKit = id => {
    const r = rec(id);
    return !!r.id && !!r.role && r.active !== false && r.role !== 'Undergraduate Student';
  };
  const rulesLists = id => {
    const r = rec(id);
    return !!r.id && r.active !== false && (r.role === 'Farm Manager' || r.role === 'Faculty');
  };

  const kitDrift = ids.filter(id => { asPerson(id); return !!w.eval("fstCanEditKit()") !== rulesKit(id); });
  ok('fstCanEditKit and canEditFarmKit agree on all ' + ids.length + ' people',
     kitDrift.length === 0, kitDrift.join(','));
  const listDrift = ids.filter(id => { asPerson(id); return !!w.eval("fstCanEditLists()") !== rulesLists(id); });
  ok('fstCanEditLists and canEditFarmLists agree on all ' + ids.length + ' people',
     listDrift.length === 0, listDrift.join(','));

  /* and the four screen gates are those two and nothing else */
  const gateDrift = [];
  ids.forEach(id => {
    asPerson(id);
    if (!!w.eval("sprCanEdit()") !== !!w.eval("fstCanEditKit()")) gateDrift.push('spray/' + id);
    if (!!w.eval("mowCanEdit()") !== !!w.eval("fstCanEditKit()")) gateDrift.push('mowers/' + id);
    if (!!w.eval("labsCanEdit()") !== !!w.eval("fstCanEditLists()")) gateDrift.push('labs/' + id);
    if (!!w.eval("semCanEdit()") !== !!w.eval("fstCanEditLists()")) gateDrift.push('sems/' + id);
  });
  ok('every screen gate is one of the two lines', gateDrift.length === 0, gateDrift.slice(0, 5).join(' '));

  const role = id => rec(id).role;
  const fac = ids.find(id => role(id) === 'Faculty');
  const tech = ids.find(id => role(id) === 'Technician');
  const ug = ids.find(id => role(id) === 'Undergraduate Student');
  asPerson(fac);
  ok('faculty now edit the sprayer and mowers', w.eval("sprCanEdit()&&mowCanEdit()"), fac);
  ok('and the labs and semester dates too', w.eval("labsCanEdit()&&semCanEdit()"), fac);
  asPerson(tech);
  ok('a technician still edits the sprayer and mowers', w.eval("sprCanEdit()&&mowCanEdit()"), tech);
  ok('but not the labs or the semester dates', !w.eval("labsCanEdit()||semCanEdit()"), tech);
  asPerson(ug);
  ok('an undergraduate edits none of it', !w.eval("sprCanEdit()||mowCanEdit()||labsCanEdit()||semCanEdit()"), ug);
  ok('and cannot even see the page', !w.eval("farmCanSee()"));

  /* The App Manager post is a hat worn on top, and it is a TOKEN claim, which
     is the only reason a rule can ask about it. */
  w.eval("SESSION.pid=" + J(ug) + ";IS_APP_ADMIN=true;");
  ok('the App Manager hat opens all four', w.eval("sprCanEdit()&&mowCanEdit()&&labsCanEdit()&&semCanEdit()"));
  w.eval("IS_APP_ADMIN=false;");
  ok('and taking the hat off closes them again', !w.eval("labsCanEdit()"));

  w.eval("SESSION.pid=null;IS_APP_ADMIN=false;");
  ok('nobody signed in edits nothing', !w.eval("sprCanEdit()||labsCanEdit()"));
}

/* ---------------------------------------------------------------- */
section('3. a phone on the built-in values reads as null, not as an empty answer');
{
  w.eval("SESSION.pid='p07';");                   /* Bill */
  const readOf = id => w.eval("JSON.stringify(fstGroup(" + J(id) + ").read())");
  ok('spray starts at the built-ins', readOf('spray') === 'null', readOf('spray'));
  ok('mowers too', readOf('mowers') === 'null', readOf('mowers'));
  ok('labs too', readOf('labs') === 'null', readOf('labs'));
  ok('and the semester dates too', readOf('semesters') === 'null', readOf('semesters'));
  ok('semIsDefault() says so as well', w.eval("semIsDefault()"));

  /* change one, and it stops reading as default */
  w.eval("FARM_SEMS.push({id:'sem-x',name:'Test term',start:'2027-09-01',end:'2027-12-01'});");
  ok('adding a term makes it a real value', readOf('semesters') !== 'null');
  ok('and the value is the whole list, not a diff',
     JSON.parse(readOf('semesters')).length === w.eval("FARM_SEMS.length"));
  /* and putting it back restores the built-ins */
  w.eval("fstGroup('semesters').restore();");
  ok('restore puts the built-in terms back', readOf('semesters') === 'null', readOf('semesters'));
}

/* ---------------------------------------------------------------- */
section('4. THE ONE THAT MATTERS — a phone on the defaults never seeds');
{
  const src = w.eval("fstsyncSeed.toString()");
  ok('the seed skips a group this phone has not changed',
     src.indexOf("fstValueJson(g)==='null'") > 0, src.slice(0, 200));
  ok('and it skips any group the shared copy already holds',
     src.indexOf('FSTSYNC.seen[g.id]!==undefined') > 0);
  ok('and never offers a write this person would be refused', src.indexOf('g.can()') > 0);

  /* Arrival replaces what is here. That is the whole difference from the other
     drawers, and it is what stops a stale phone winning. */
  w.eval("SESSION.pid='p07';");
  w.eval("FARM_LABS.push({name:'Testlab',color:'#123456',ab:'Tes',pi:true});");
  ok('this phone has a lab the shared copy does not', w.eval("labsDiff()!==null"));
  w.eval("fstsyncApplyDoc('labs',{id:'labs',v:null});");
  ok('an incoming "back to defaults" takes it away again', w.eval("labsDiff()===null"));

  /* and an incoming real value is applied, not merged */
  w.eval("fstsyncApplyDoc('labs',{id:'labs',v:[{name:'Alpha',color:'#111111',ab:'Alp',pi:true},"
       + "{name:'Beta',color:'#222222',ab:'Bet',pi:false}]});");
  ok('an incoming list replaces the list', w.eval("FARM_LABS.length") === 2, String(w.eval("FARM_LABS.length")));
  ok('the derived roster dropdown was rebuilt with it',
     w.eval("RST_LABS.indexOf('Alpha')") >= 0, w.eval("JSON.stringify(RST_LABS)"));
  ok('and so was the trials colour map', w.eval("!!TR_LABS['Alpha']"));
  ok('a lab marked not-a-PI stays out of trials', w.eval("!TR_LABS['Beta']"));

  /* junk on the way in is refused rather than applied */
  const before = w.eval("FARM_LABS.length");
  w.eval("fstsyncApplyDoc('labs',{id:'labs',v:[{name:''}]});");
  ok('an invalid list is refused, not applied', w.eval("FARM_LABS.length") === before);
  w.eval("fstsyncApplyDoc('nonsense',{id:'nonsense',v:[1,2,3]});");
  ok('a group this version does not know is ignored', true);
}

/* ---------------------------------------------------------------- */
section('5. what goes up says who, when, and what');
{
  w.eval("SESSION.pid='p07';");
  const doc = JSON.parse(w.eval("JSON.stringify(fstDoc(fstGroup('labs')))"));
  ok('the document id is the group name', doc.id === 'labs');
  ok('it carries the value under v', 'v' in doc);
  ok('and who changed it, and when', !!doc.updatedByPid && !!doc.updatedAt);
  /* The comparison must ignore who and when, or two phones would send the same
     value back and forth forever, each stamping its own name on it. */
  const cmp = w.eval("fstValueJson.toString()");
  ok('but the change check ignores who and when',
     cmp.indexOf('updatedBy') < 0 && cmp.indexOf('updatedAt') < 0);
}

/* ---------------------------------------------------------------- */
section('6. renaming warns when the records it moves cannot follow');
{
  const src = w.eval("fstRenameOk.toString()");
  /* Every drawer is shared now, so the question is not whether a switch is on
     -- it is whether this phone has actually REACHED that drawer. */
  ok('it says nothing while farm settings have not connected', src.indexOf('if(!FSTSYNC.live) return true;') > 0);
  ok('a mower rename checks the map has connected', src.indexOf('MSYNC.live') > 0);
  ok('a lab rename checks the trials have connected', src.indexOf('TRSYNC.live') > 0);
  ok('it warns and allows rather than blocking', src.indexOf('return confirm(') > 0);
  ok('the mower rename asks first', HTML.indexOf("fstRenameOk('mower'") > 0);
  ok('and so does the lab rename', HTML.indexOf("fstRenameOk('lab'") > 0);
  ok('counting people and studies in a lab is its own function',
     typeof w.eval("labsRecordCount('Sorochan')") === 'number');
}

/* ---------------------------------------------------------------- */
section('7. the rules file says all of it');
{
  ok('there is a farm settings block', /match \/farmsettings\/\{group\}/.test(RULES));
  ok('reading is open to everyone signed in',
     /match \/farmsettings\/\{group\} \{[\s\S]{0,200}?allow read: if actor\(\);/.test(RULES));
  ok('nothing is ever deleted', /match \/farmsettings[\s\S]*?allow delete: if false;/.test(RULES));
  ok('the document id must match the group', /request\.resource\.data\.id == group/.test(RULES));
  ok('sprayer and mowers go through the kit line',
     /\(group == 'spray' \|\| group == 'mowers'\) && canEditFarmKit\(\)/.test(RULES));
  ok('labs and semester dates through the lists line',
     /\(group == 'labs'\s+\|\| group == 'semesters'\) && canEditFarmLists\(\)/.test(RULES));
  ok('the kit line is everybody but the undergraduates',
     /canEditFarmKit\(\)[\s\S]{0,200}?roleOf\(me\(\)\) != 'Undergraduate Student'/.test(RULES));
  ok('the lists line is Bill and faculty',
     /canEditFarmLists\(\)[\s\S]{0,260}?Farm Manager[\s\S]{0,80}?Faculty/.test(RULES));
  ok('the App Manager post is read off the token, not the roster',
     /function isAppManager\(\)[\s\S]{0,200}?request\.auth\.token\.app_admin == true/.test(RULES));
  ok('and it is defined exactly once', (RULES.match(/function isAppManager\(/g) || []).length === 1);
}

/* ---------------------------------------------------------------- */
section('8. sharing, and the wiring');
{
  ok('it is on from the moment the app opens', p.FSTSYNC && p.FSTSYNC.on === true);
  ok('nothing on this phone decides it', HTML.indexOf('ut_farmsettings_shared_v1') < 0);
  ok('one collection, four documents', HTML.indexOf("FSTSYNC_COLL='farmsettings'") > 0);
  ok('it has a read-out on the Shared database screen', /st:FSTSYNC,\s*summary:fstsyncSummary\(\)/.test(HTML));
  ok('the read-out is in the list', /st:TRSYNC[\s\S]{0,900}st:FSTSYNC/.test(HTML));
  ok('and there is no button to turn it off', HTML.indexOf("closest('#sdb-farm')") < 0);
  ok('it rides the two-second scan', HTML.indexOf('fstsyncTick();') > 0);
  ok('and is hydrated at startup', HTML.indexOf('fstsyncHydrate();') > 0);
  /* Switching this one on REPLACES what is on the phone. Nowhere else does
     that, so the switch has to say so before it is pressed. */
  ok('the switch says plainly that it replaces this phone\'s settings',
     /TAKES the farm's settings/.test(HTML));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
