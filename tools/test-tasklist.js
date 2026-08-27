/*
 * Harness for the task list — the catalogue of jobs the farm does, which the
 * assign screen is built from.
 *
 * WHY THIS FILE EXISTS
 * The Task Board carried two buttons, "＋ Add Task" and "✎ Edit", that both
 * led to this list and neither of which put anything on anybody's board.
 * "Add Task" reads as "give somebody a job"; it saved a catalogue entry and
 * raised a toast saying "Task saved ✓". Worse, the list was the one thing on
 * the Tasks page that saved itself with its own localStorage write and so
 * never reached a second phone — a job added on Bill's phone could only ever
 * be assigned from Bill's phone.
 *
 * What this pins:
 *   1. It is a registered store, so it persists, backs up and can sync.
 *   2. Undergraduates read it; everybody else edits it — in the app AND in
 *      the rules, checked pair by pair.
 *   3. A removal is a TOMBSTONE. This is the one that matters: a phone with
 *      sharing off keeps its own copy and pushes up whatever the shared copy
 *      lacks, so a genuinely deleted job would come straight back.
 *   4. The duplicate buttons are gone and the list has one door.
 *
 * Run:  node tools/test-tasklist.js
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
const EX = ['TEMPLATES','TASKS','STORE_DEFS','SESSION','PEOPLE','TPLSYNC',
            'tplCanEdit','tplLive','tplFind','tplRemove','tplRestore','tplRemovedList',
            'renderTemplates','openForm','saveForm','FORM','tplsyncSummary',
            'personRole','rstFind','toast','go','renderBoard'];

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

/* ---------------------------------------------------------------- */
section('0. the app still boots, and the list is a real store');
const store = {};
const b = boot(store);
const p = b.p, w = b.win;
ok('no jsdom errors on load', b.errs.length === 0, b.errs[0]);
ok('the task list has jobs in it', Array.isArray(p.TEMPLATES) && p.TEMPLATES.length > 10,
   String((p.TEMPLATES || []).length));
{
  const names = (p.STORE_DEFS || []).map(d => d.name);
  ok('it is a registered store', names.indexOf('templates') >= 0, names.join(','));
  const def = (p.STORE_DEFS || []).find(d => d.name === 'templates');
  ok('under the key it already used', def && def.key === 'ut_task_templates_v2', def && def.key);
  ok('and the registry hands back the live array', def && def.get() === p.TEMPLATES);
}
ok('it no longer writes itself by hand', HTML.indexOf('localStorage.setItem(TPL_KEY') < 0);

section('1. one door, not three');
ok('the "＋ Add Task" button is gone', HTML.indexOf('data-board="add"') < 0);
ok('the "✎ Edit" button is gone', HTML.indexOf('data-board="edit"') < 0);
ok('the board keeps its Assign button', HTML.indexOf('data-board="assign"') > 0);
ok('the Task Board header opens the list',
   /id="s-taskboard"[\s\S]{0,600}?data-go="templates"/.test(HTML));
ok('the list has its own Add button', HTML.indexOf('id="tpl-add"') > 0);
ok('the screen is called the task list', /id="s-templates"[\s\S]{0,400}?>Task list</.test(HTML));
/* Deleting moved off the rows and onto the job's own form, where the thing is
   in front of you — a red cross right-aligned on forty scrolling rows is a
   mis-tap waiting to happen. */
ok('no ✕ on the rows any more', HTML.indexOf('data-tplrm') < 0);
ok('the edit form carries the delete', HTML.indexOf('id="tn-del"') > 0);
ok('Save sits in the form header, right-aligned',
   /id="s-tasknew"[\s\S]{0,400}?<div class="hdr">[\s\S]{0,600}?id="tn-save"/.test(HTML));
ok('and no longer in a bar at the bottom',
   HTML.indexOf('<div class="actionbar"><div class="action" id="tn-save">') < 0);

section('2. undergraduates read it; everybody else writes it');
{
  const role = id => (w.eval("JSON.parse(JSON.stringify(rstFind(" + JSON.stringify(id) + ")||null))") || {}).role;
  const ids = w.eval("JSON.parse(JSON.stringify(PEOPLE.filter(function(x){return x.active!==false;}).map(function(x){return x.id;})))") || [];
  const appCan = id => { w.eval("SESSION.pid=" + JSON.stringify(id) + ";"); return !!w.eval("tplCanEdit()"); };
  /* firestore.rules, by hand:
       canEditTaskList() = actor() && roleOf(me()) != 'Undergraduate Student' */
  const rulesCan = id => {
    const r = w.eval("JSON.parse(JSON.stringify(rstFind(" + JSON.stringify(id) + ")||null))") || {};
    return !!r.id && r.active !== false && r.role !== 'Undergraduate Student';
  };
  const drift = ids.filter(id => appCan(id) !== rulesCan(id));
  ok('tplCanEdit and canEditTaskList agree on all ' + ids.length + ' people',
     drift.length === 0, drift.join(','));
  const ug = ids.find(id => role(id) === 'Undergraduate Student');
  const tech = ids.find(id => role(id) === 'Technician');
  ok('an undergrad may not edit', !!ug && !appCan(ug), ug);
  ok('a technician may', !!tech && appCan(tech), tech);
  ok('nobody signed in may not', (w.eval("SESSION.pid=null;"), !w.eval("tplCanEdit()")));
  ok('the rules file has a task list block', /match \/templates\/\{tplId\}/.test(RULES));
  ok('and it never deletes', /match \/templates[\s\S]*?allow delete: if false;/.test(RULES));
}

section('2b. the delete button appears only where deleting means something');
{
  const wrap = () => w.document.getElementById('tn-delwrap').style.display !== 'none';
  w.eval("sessionSet('p05');");                 // a technician
  w.eval("openForm(null);");
  ok('hidden on a brand-new job', !wrap());
  w.eval("openForm(tplLive()[0]);");
  ok('shown when editing one that exists', wrap());
  w.eval("openReqForm(true);");
  ok('hidden on a labour request', !wrap());
  w.eval("openCrewReq();");
  ok('hidden on a request to a grad or tech', !wrap());
  w.eval("sessionSet('p18');");                 // an undergrad
  w.eval("openForm(tplLive()[0]);");
  ok('hidden from an undergrad even on an existing job', !wrap());
  w.eval("sessionSet('p05');");
}

section('3. a removal is a tombstone, not a hole');
{
  w.eval("sessionSet('p05');");                       // a technician
  const before = w.eval("tplLive().length");
  const id = w.eval("tplLive()[0].id");
  const name = w.eval("tplLive()[0].name");
  ok('removing takes it off the list', (w.eval("tplRemove(" + JSON.stringify(id) + ")"),
     w.eval("tplLive().length") === before - 1), String(w.eval("tplLive().length")));
  ok('but the record is still there', w.eval("!!tplFind(" + JSON.stringify(id) + ")"));
  ok('marked removed, with who and when',
     w.eval("!!(tplFind(" + JSON.stringify(id) + ").removed && tplFind(" + JSON.stringify(id) + ").removedBy && tplFind(" + JSON.stringify(id) + ").removedAt)"));
  ok('it shows in the put-back list', w.eval("tplRemovedList().length") === 1);
  ok('it cannot be assigned from',
     w.eval("tplLive().filter(function(t){return t.id===" + JSON.stringify(id) + ";}).length") === 0);

  /* THE ONE THAT MATTERS. A phone that never saw the removal still holds the
     job. It must not be able to put it back by simply reconnecting. */
  ok('the removal is what travels, not an absence',
     w.eval("JSON.stringify(TEMPLATES.filter(function(t){return t.id===" + JSON.stringify(id) + ";}).length)") === '1');

  ok('putting it back restores it', (w.eval("tplRestore(" + JSON.stringify(id) + ")"),
     w.eval("tplLive().length") === before));
  ok('and clears the removal marks',
     w.eval("!tplFind(" + JSON.stringify(id) + ").removed && !tplFind(" + JSON.stringify(id) + ").removedBy"));
  ok('the job kept its name through all that', w.eval("tplFind(" + JSON.stringify(id) + ").name") === name);

  /* An undergrad must not be able to remove one even by calling it directly. */
  w.eval("sessionSet('p18');");
  ok('an undergrad cannot remove', w.eval("tplRemove(" + JSON.stringify(id) + ")") === false);
  ok('nor put one back', w.eval("tplRestore(" + JSON.stringify(id) + ")") === false);
  w.eval("sessionSet('p05');");
}

section('4. it survives a reload and reaches the backup');
{
  w.eval("sessionSet('p05'); storeTouch();");
  ok('the store key was written', typeof store['ut_task_templates_v2'] === 'string');
  w.eval("sessionSet('p05'); openForm(null);");
  /* The form opens on the first category, which is Mow, and a mow will not
     save without a direction — so drive the category picker the way a person
     would rather than fighting that rule. */
  const cat = w.document.getElementById('tn-cat');
  cat.value = 'Cultivation';
  cat.dispatchEvent(new w.Event('change', { bubbles: true }));
  w.document.getElementById('tn-name').value = 'Verticut · Nursery';
  w.eval("saveForm(); storeTouch();");
  ok('a new job saves', w.eval("!!tplLive().filter(function(t){return t.name==='Verticut · Nursery';}).length"));
  ok('stamped with who added it',
     w.eval("tplLive().filter(function(t){return t.name==='Verticut · Nursery';})[0].updatedBy") === 'p05');
  const again = boot(JSON.parse(JSON.stringify(store)));
  ok('and it is still there after a reload',
     again.p.TEMPLATES.filter(t => t.name === 'Verticut · Nursery').length === 1,
     String(again.p.TEMPLATES.length));
}

section('5. it is shared, and cannot be turned off');
ok('the task list has a read-out on the Shared database screen',
   /st:TPLSYNC,\s*summary:tplsyncSummary\(\)/.test(HTML));
ok('it is on from the moment the app opens', p.TPLSYNC && p.TPLSYNC.on === true);
ok('and nothing on the phone decides it', HTML.indexOf('ut_tasklist_shared_v1') < 0);
ok('the publish notes cover it',
   fs.readFileSync(path.join(ROOT, 'docs', 'PUBLISH-THE-RULES.md'), 'utf8').indexOf('the task list') > 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
