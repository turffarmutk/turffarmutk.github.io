/*
 * Harness for FAVORITES — the jobs one person stars so the Assign screen
 * opens on the handful they actually reach for.
 *
 * WHY THIS FILE EXISTS
 * Favorites replaced the Assign screen's "Scheduled" tab on 2026-09-28, and
 * the change touches four things that each fail quietly on their own:
 *
 *   1. A STAR IS PERSONAL. Bill's list is not a grad student's, and nothing
 *      on screen would say so if they got crossed — it would just look like
 *      somebody else had been starring your jobs. Sections 2 and 3 pin that
 *      one person's star never lands on another person's record, and that
 *      the drawer refuses to send anybody's record but its own.
 *
 *   2. THE MONTH BOXES CAME OFF THE TASK FORM, and the line that wired them
 *      up had no guard on it. Taking the element out of the page and leaving
 *      that line behind would have thrown while app-05 was still loading,
 *      killing the time clock, the weather and the calendar below it — with
 *      the page still drawing normally and nothing to see. Section 5 fails
 *      if any reference to #tn-months comes back.
 *
 *   3. A JOB'S MONTHS ARE STILL SAVED even though nothing reads them, so the
 *      old view could be put back. Section 5 fails if an edit quietly drops
 *      them, which would make that promise untrue the first time anybody
 *      opened an old job.
 *
 *   4. THE DRAWER MUST SETTLE, and what it sends must be flat. That is
 *      checked for every drawer at once in test-sync-settles.js; what is
 *      checked HERE is the thing that file cannot see — that the record the
 *      app builds is the shape firestore.rules will actually accept.
 *
 * Run:  node tools/test-favorites.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const turf = require('@turf/turf');
const { appText, appScripts } = require('./_app');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'UT-TurfFarm-App.html'), 'utf8');
const SRC = appText();
/* Comments explain why a thing was removed and naturally quote the thing --
   so a check for "is this dangerous call really gone" has to read the CODE,
   not the prose around it, or it fails on its own explanation. */
const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ')
                            .replace(/<!--[\s\S]*?-->/g, ' ')
                            .replace(/^\s*\/\/.*$/gm, ' ');
const CODE = stripComments(SRC);
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  -> ' + x : ''))); };
const section = s => console.log('\n' + s);

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
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i],
    get length() { return Object.keys(store).length; }
  };
}

const EX = ['FAVS', 'FAVSYNC', 'favCanUse', 'favRec', 'favIds', 'favHas', 'favTemplates',
            'favToggle', 'favStar', 'favDoc', 'favJson', 'favCanPush', 'favPush',
            'favsyncSummary', 'favsyncTick', 'favsyncOnSnapshot',
            'SESSION', 'TEMPLATES', 'tplLive', 'tplFind', 'STORE_DEFS',
            'renderAssignList', 'renderTemplates', 'asTab', 'FORM', 'openForm', 'syncForm'];

/* The app is one file with no exports, so booting it in jsdom and reading the
   globals back out is the only way to test what it actually does. */
function boot(store, tweak) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', virtualConsole: vc,
                                url: 'https://turffarmutk.github.io/' });
  const win = dom.window;
  win.L = chain(); win.firebase = undefined;
  Object.defineProperty(win, 'localStorage', { value: makeLS(store), configurable: true });
  win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {},
                            addEventListener() {}, removeEventListener() {} });
  win.scrollTo = () => {};
  win.alert = () => {}; win.confirm = () => true;
  const scripts = appScripts(win.document);
  if (tweak) scripts.push(tweak);
  try {
    win.eval(scripts.join('\n;\n')
      + '\n;window.__p={' + EX.map(n => n + ':(typeof ' + n + '!=="undefined"?' + n + ':undefined)').join(',') + '};');
  } catch (e) { console.log('app script threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); fail++; }
  return { win, p: win.__p || {}, errs, store };
}

/* ---------------------------------------------------------------- */
section('0. the app still boots, and the pieces are there');
/* FORM and asTab are `let` bindings inside the app's own scope, and a later
   win.eval() cannot see them -- nor would reading the FORM object once be
   right, because openForm() replaces it rather than editing it. So the boot
   gets a tweak, which runs inside the SAME eval as the app, handing back two
   accessors that read the live bindings each time they are called. */
const PEEK = 'window.__fav={form:function(){return FORM;},tab:function(){return asTab;}};';
const store = {};
const b = boot(store, PEEK);
const w = b.win, p = b.p;
const FORM = () => w.__fav.form();
ok('no jsdom errors on load', b.errs.length === 0, b.errs[0]);
ok('FAVS exists and is a list', Array.isArray(p.FAVS));
ok('it starts empty — nobody is given favorites they did not pick',
   Array.isArray(p.FAVS) && p.FAVS.length === 0, JSON.stringify(p.FAVS));
['favCanUse', 'favHas', 'favToggle', 'favTemplates', 'favStar'].forEach(n =>
  ok(n + '() is there', typeof p[n] === 'function'));
['favDoc', 'favPush', 'favCanPush', 'favsyncTick', 'favsyncSummary'].forEach(n =>
  ok('the drawer\'s ' + n + '() is there', typeof p[n] === 'function'));
{
  const names = (p.STORE_DEFS || []).map(d => d.name);
  ok('favorites are a registered store, so they survive with no signal',
     names.indexOf('favorites') >= 0, names.join(','));
}

/* ---------------------------------------------------------------- */
section('1. a star belongs to a PERSON, and the record is named after them');
{
  w.eval("SESSION.pid='p07';");                       // Bill, Farm Manager
  const tpl = p.tplLive()[0].id;
  ok('Bill may use favorites', p.favCanUse() === true);
  ok('nothing is starred to begin with', p.favHas(tpl) === false);
  w.eval("favToggle(" + JSON.stringify(tpl) + ");");
  ok('starring it takes', p.favHas(tpl) === true);
  ok('exactly one record was made', p.FAVS.length === 1, JSON.stringify(p.FAVS));
  ok('and the record is named after the person, which is what the rules read',
     String(p.FAVS[0].id) === 'p07', String(p.FAVS[0].id));
  ok('the starred job is in the list', (p.FAVS[0].tpls || []).indexOf(tpl) >= 0);
  ok('favTemplates() hands back the job itself, not just its id',
     p.favTemplates().length === 1 && p.favTemplates()[0].id === tpl);

  w.eval("favToggle(" + JSON.stringify(tpl) + ");");
  ok('tapping it again takes the star off', p.favHas(tpl) === false);
  ok('the record stays, holding an empty list — never deleted, so the removal '
     + 'itself travels', p.FAVS.length === 1 && (p.FAVS[0].tpls || []).length === 0);
}

/* ---------------------------------------------------------------- */
section('2. one person\'s stars never land on another person\'s record');
{
  const jobs = p.tplLive();
  const a = jobs[0].id, c = jobs[1].id;
  w.eval("SESSION.pid='p07'; favToggle(" + JSON.stringify(a) + ");");   // Bill
  w.eval("SESSION.pid='p09'; favToggle(" + JSON.stringify(c) + ");");   // Rose, grad student
  const bill = p.favRec('p07'), rose = p.favRec('p09');
  ok('two people, two records', !!bill && !!rose && bill !== rose);
  ok("Bill's star is on Bill's record", (bill.tpls || []).indexOf(a) >= 0);
  ok("and it is NOT on Rose's", (rose.tpls || []).indexOf(a) < 0);
  ok("Rose's star is on Rose's record", (rose.tpls || []).indexOf(c) >= 0);

  w.eval("SESSION.pid='p07';");
  ok('signed in as Bill, favHas() answers about Bill', p.favHas(a) === true && p.favHas(c) === false);
  w.eval("SESSION.pid='p09';");
  ok('signed in as Rose, the same two questions answer the other way',
     p.favHas(a) === false && p.favHas(c) === true);
}

/* ---------------------------------------------------------------- */
section('3. undergraduates get no star, and the drawer sends only your own');
{
  w.eval("SESSION.pid='p18';");                       // Garrett, Undergraduate
  ok('an undergraduate may not use favorites', p.favCanUse() === false);
  ok('so no star is drawn for them at all', p.favStar(p.tplLive()[0].id) === '');
  const before = JSON.stringify(p.FAVS);
  w.eval("favToggle(" + JSON.stringify(p.tplLive()[0].id) + ");");
  ok('and tapping one changes nothing', JSON.stringify(p.FAVS) === before);

  /* favCanPush() is the mirror of the favorites block in firestore.rules.
     A phone HOLDS everybody's favorites; offering one that is not yours
     would be refused by the database every tick for something nobody did. */
  w.eval("SESSION.pid='p07';");
  ok('Bill may push his own record', p.favCanPush({ id: 'p07', tpls: [] }) === true);
  ok("Bill may NOT push Rose's", p.favCanPush({ id: 'p09', tpls: [] }) === false);
  ok('nor a record with no id at all', p.favCanPush({ tpls: [] }) === false);
  w.eval("SESSION.pid='p18';");
  ok('an undergraduate pushes nothing, not even a record named after them',
     p.favCanPush({ id: 'p18', tpls: [] }) === false);
}

/* ---------------------------------------------------------------- */
section('4. what travels is flat, and safe to normalise twice');
{
  w.eval("SESSION.pid='p07';");
  const doc = p.favDoc({ id: 'p07', tpls: ['tpl1', 'tpl2'], updatedBy: 'p07' });
  ok('a good record normalises', !!doc && doc.id === 'p07');
  ok('the ids come out as strings', doc.tpls.every(x => typeof x === 'string'));
  ok('running it twice changes nothing — which is what makes the comparison honest',
     JSON.stringify(p.favDoc(doc)) === JSON.stringify(doc));
  ok('a record with no list is refused rather than sent half-made',
     p.favDoc({ id: 'p07' }) === null);
  ok('a record with no id is refused', p.favDoc({ tpls: [] }) === null);

  /* Firestore cannot hold a list inside a list. A drawer that offers one has
     its writes thrown away before they leave the phone, with nothing on any
     screen to say so — that is what cost the map feature a month. */
  const nested = p.favDoc({ id: 'p07', tpls: ['ok', ['bad'], { also: 'bad' }] });
  ok('anything that is not a plain id is dropped, never nested inside the list',
     !!nested && nested.tpls.length === 1 && nested.tpls[0] === 'ok',
     JSON.stringify(nested));
}

/* ---------------------------------------------------------------- */
section('5. the task form: months gone, star in, months STILL SAVED');
{
  /* The unguarded listener on #tn-months would have thrown at load and killed
     everything below it in app-05. The element is gone, so every reference to
     it has to be gone too. */
  ok('no code anywhere still reaches for the month grid',
     CODE.indexOf('tn-months') < 0);
  ok('and the month grid is out of the page',
     HTML.indexOf('id="tn-months"') < 0);
  ok('the Favorite row is on the form', HTML.indexOf('id="tn-fav-row"') >= 0);

  /* The promise made when the boxes came off was that a job's existing months
     are left untouched, so the old view could be put back. */
  w.eval("SESSION.pid='p07';");
  const t = p.tplLive()[0];
  w.eval("(function(){var t=tplFind(" + JSON.stringify(t.id) + ");t.months=['Jan','Feb'];})();");
  w.eval("openForm(tplFind(" + JSON.stringify(t.id) + "));");
  ok('opening a job reads its months into the form',
     (FORM().months || []).join(',') === 'Jan,Feb', JSON.stringify(FORM().months));
  w.eval("window.__fav.form().name='Renamed for the test'; saveForm();");
  ok('and saving it puts them back untouched',
     (p.tplFind(t.id).months || []).join(',') === 'Jan,Feb',
     JSON.stringify(p.tplFind(t.id).months));
}

/* ---------------------------------------------------------------- */
section('6. starring from the form, and only for me');
{
  w.eval("SESSION.pid='p07';");
  const t = p.tplLive()[2];
  w.eval("openForm(tplFind(" + JSON.stringify(t.id) + "));");
  ok('the form opens showing MY star, not a field on the job', FORM().fav === false);
  w.eval("window.__fav.form().fav=true; saveForm();");
  ok('saving with the star on stars it for me', p.favHas(t.id, 'p07') === true);
  ok('and for nobody else', p.favHas(t.id, 'p09') === false);
  ok('nothing was written onto the job itself — a star is not part of the job',
     !('fav' in p.tplFind(t.id)), JSON.stringify(Object.keys(p.tplFind(t.id))));

  w.eval("openForm(tplFind(" + JSON.stringify(t.id) + "));");
  ok('reopening it shows the star on', FORM().fav === true);
  w.eval("window.__fav.form().fav=false; saveForm();");
  ok('and saving with it off takes it back off', p.favHas(t.id, 'p07') === false);
}

/* ---------------------------------------------------------------- */
section('7. the Assign screen opens on Favorites');
{
  ok('the first tab is Favorites, not Scheduled',
     /data-atab="fav"/.test(HTML) && !/data-atab="scheduled"/.test(HTML));
  ok('the three tabs are Favorites, All tasks and Recent',
     (HTML.match(/data-atab="(fav|all|recent)"/g) || []).length === 3);
  ok('nothing in the app still switches to a scheduled tab',
     !/asTab\s*=\s*'scheduled'/.test(SRC));

  w.eval("SESSION.pid='p07'; currentRole='manager'; assignEnter();");
  ok('entering the screen lands on the Favorites tab', w.__fav.tab() === 'fav', w.__fav.tab());
  /* Earlier sections left stars on Bill. Clear them so the empty state is
     really being looked at rather than an accident of test order. */
  w.eval("(function(){var r=favRec('p07'); if(r) r.tpls=[];})();");
  w.eval("asPerson='p18'; renderAssignList();");
  const empty = w.document.getElementById('as-list').textContent;
  ok('with nothing starred it says so, and says what to do about it',
     /No favorites yet/.test(empty) && /Tap the/.test(empty), empty.slice(0, 90));

  const t = p.tplLive()[1];
  w.eval("favToggle(" + JSON.stringify(t.id) + "); renderAssignList();");
  const filled = w.document.getElementById('as-list').textContent;
  ok('starring a job puts it on the tab', filled.indexOf(t.name) >= 0, filled.slice(0, 120));
  ok('and the empty message is gone', !/No favorites yet/.test(filled));
  ok('the row can still be assigned — the star did not replace the + Add',
     !!w.document.querySelector('#as-list [data-assign-tpl="' + t.id + '"]'));
  ok('and it carries a star that is on',
     !!w.document.querySelector('#as-list .favstar.on[data-fav="' + t.id + '"]'));
}

/* ---------------------------------------------------------------- */
section('8. the star is on the Task List rows too');
{
  w.eval("SESSION.pid='p07'; renderTemplates();");
  const list = w.document.getElementById('tpl-list');
  ok('every job on the list has a star', list.querySelectorAll('.favstar').length === p.tplLive().length,
     list.querySelectorAll('.favstar').length + ' stars for ' + p.tplLive().length + ' jobs');
  const t = p.tplLive()[1];
  ok('the one starred earlier shows filled',
     !!list.querySelector('.favstar.on[data-fav="' + t.id + '"]'));

  /* Tapping the star must NOT also open the job for editing — the star sits
     inside a row that navigates. */
  const star = list.querySelector('.favstar[data-fav="' + t.id + '"]');
  const before = w.document.getElementById('s-tasknew').classList.contains('active');
  star.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('tapping it turns the star off', p.favHas(t.id) === false);
  ok('and does NOT open the job for editing',
     w.document.getElementById('s-tasknew').classList.contains('active') === before);

  w.eval("SESSION.pid='p18'; renderTemplates();");
  ok('an undergraduate reading the list sees no stars at all',
     w.document.getElementById('tpl-list').querySelectorAll('.favstar').length === 0);
}

/* ---------------------------------------------------------------- */
section('8b. a starred job taken off the list hides, but the star is kept');
{
  w.eval("SESSION.pid='p07';");
  const t = p.tplLive()[5];
  w.eval("favToggle(" + JSON.stringify(t.id) + ");");
  ok('it is on the tab to begin with',
     p.favTemplates().some(x => x.id === t.id));
  w.eval("tplRemove(" + JSON.stringify(t.id) + ");");
  ok('taking the job off the task list takes it off the Favorites tab too — '
     + 'a row nobody can assign is worse than no row',
     !p.favTemplates().some(x => x.id === t.id));
  ok('but the star itself is kept, so putting the job back brings it back',
     p.favIds().indexOf(t.id) >= 0, JSON.stringify(p.favIds()));
  w.eval("tplRestore(" + JSON.stringify(t.id) + ");");
  ok('and putting it back does exactly that — nobody has to star it again',
     p.favTemplates().some(x => x.id === t.id));
  w.eval("favToggle(" + JSON.stringify(t.id) + ");");
}

/* ---------------------------------------------------------------- */
section('9. a star survives the app being closed');
{
  w.eval("SESSION.pid='p07';");
  const t = p.tplLive()[3];
  w.eval("favToggle(" + JSON.stringify(t.id) + "); storeSaveLocal();");
  ok('it was written to the phone', typeof store['ut_favorites_v1'] === 'string');
  const again = boot(JSON.parse(JSON.stringify(store)), PEEK);
  again.win.eval("SESSION.pid='p07';");
  ok('and it is still starred after a reload', again.p.favHas(t.id) === true);
  ok('still on the right person', again.p.favHas(t.id, 'p09') === false);
}

/* ---------------------------------------------------------------- */
section('10. the rules say the same thing the app does');
{
  const block = (RULES.match(/match \/favorites\/\{favId\} \{[\s\S]*?\n    \}/) || [''])[0];
  ok('there is a favorites block in firestore.rules', block.length > 0);
  ok('reading it needs somebody signed in and active', /allow read: if actor\(\)/.test(block));
  ok('writing is limited to the document named after you', /favId == me\(\)/.test(block));
  ok('and the record has to agree about whose it is',
     /request\.resource\.data\.id == favId/.test(block));
  ok('the starred list has to be a list', /request\.resource\.data\.tpls is list/.test(block));
  ok('nothing may be deleted — an empty list is how you clear it',
     /allow delete: if false/.test(block));
  ok('the closing note lists favorites as a drawer with a block of its own',
     /favorites,\s*\n?\s*the trials/.test(RULES) || /favorites/.test(RULES.slice(RULES.indexOf('EVERYTHING ELSE IS CLOSED'))));

  /* The app is allowed to be STRICTER than the rules (undergraduates get no
     star) but never looser — a rule the app does not know about is a silent
     refusal nobody can explain. */
  /* The comment sits ABOVE the match block, so this reads the whole favorites
     section of the file rather than the block alone. */
  const favSection = RULES.slice(RULES.indexOf('FAVORITES —'),
                                 RULES.indexOf('match /favorites/') + block.length);
  ok('the rules explain, in the file, why they are looser than the app here',
     /ONE NOTCH LOOSER/.test(favSection));
}

/* ---------------------------------------------------------------- */
section('11. it is on the Shared database screen, like every other drawer');
{
  ok('the drawer has a row people can read',
     /st:FAVSYNC,\s*summary:favsyncSummary\(\)/.test(SRC));
  ok('the heartbeat offers it', /favsyncTick\(\)/.test(SRC));
  ok('and it is started with the rest', /favsyncHydrate\(\)/.test(SRC));
  /* The one mistake that cost 4.4 million reads in a day. */
  const handler = stripComments((SRC.match(/function favsyncOnSnapshot[\s\S]*?\n}/) || [''])[0]);
  ok('the snapshot handler saves to the phone', /storeSaveLocal\(\)/.test(handler));
  ok('and never offers every drawer to the database from inside itself',
     !/storeTouch\(\)/.test(handler) && !/storeScan\(\)/.test(handler));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
