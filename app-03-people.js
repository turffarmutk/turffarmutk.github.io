/* ============================================================
   WHO IS WHO, AND WHO MAY CHANGE WHAT.

   The farm roster, the labs, the rule that a stored person is a roster id and
   never a name, the session (who is signed in on this phone), the sign-in
   list, the profile screen, semesters and weekly schedules -- and the
   permission checks the rest of the app asks before it lets anybody edit
   anything.

   A person's role always comes from the ROSTER. It never comes from
   currentRole, which only says which screen is showing.
   ------------------------------------------------------------
   PART OF UT-TurfFarm-App.html. This file used to be part of one 10,800-line
   <script> block inside that page. It was split out on 2026-08-29 for one
   reason: when a line fails while the app is opening, the browser throws away
   everything below it IN THAT FILE -- silently. Smaller files mean a smaller
   hole when that happens.

   THESE FILES MUST LOAD IN NUMERIC ORDER, and they must sit beside
   UT-TurfFarm-App.html at the top level of the repo. They are ordinary
   scripts sharing one namespace, exactly as they did when they were one
   block, so nothing here changed except which file it lives in.
   ============================================================ */
/* ---- end of header; the app's own code starts below ---- */
/* ======================= FARM ROSTER =======================
   One list of everyone who works at the farm, seeded from the Roster tab of
   Farm_info.xlsx. The demo logins (USERS), the undergrad pool (STUDENTS), the
   grad/tech crew (CREW) and the time clock all read off this list, so when Bill
   or a PI promotes someone or removes a student who graduated, the change
   follows them through the whole app instead of stopping at the roster page. */
var RST_ROLES=['Farm Manager','Faculty','Graduate Student','Technician','Undergraduate Student'];
var RST_TITLE={'Farm Manager':'Farm Manager','Faculty':'Faculty (PI)','Graduate Student':'Grad Student','Technician':'Technician','Undergraduate Student':'Undergrad Worker'};
var RST_SHORT={'Farm Manager':'MGR','Faculty':'PI','Graduate Student':'GRAD','Technician':'TECH','Undergraduate Student':'UG'};
var RST_ORDER={'Farm Manager':0,'Faculty':1,'Graduate Student':2,'Technician':3,'Undergraduate Student':4};
/* ---- labs: one list, four consumers ------------------------------------
   The farm's labs used to be written out four times — RST_LABS for the roster
   dropdown, CAL_LABS for the calendar filter, TR_LABS for the trials colours
   and TR_LAB_AB for its legend badges. They had already drifted: Stier was on
   the roster list and on nobody else's, so a Stier trial had no colour and a
   Stier event could not be filtered for.

   All four are now derived from FARM_LABS. Adding a lab is one row on the
   Labs screen instead of four edits in three parts of this file.

   `pi` marks a research group: those get a trials colour and a legend badge.
   Bill is the farm crew rather than a lab, so he appears on the roster and
   calendar lists but not in trials. */
var FARM_LABS=[
 {name:'Bill',     color:'#8a8f98', ab:'Bi', pi:false},
 {name:'Brosnan',  color:'#489FDF', ab:'B',  pi:true},
 {name:'Horvath',  color:'#58595b', ab:'H',  pi:true},
 {name:'Bowling',  color:'#2f7d3a', ab:'Bo', pi:true},
 {name:'Sorochan', color:'#D55E00', ab:'So', pi:true},
 {name:'Stier',    color:'#7d5ba6', ab:'St', pi:true}
];
var LABS_KEY='ut_labs_v1';
var _labsBase=null;

function labNames(){ return FARM_LABS.map(function(l){ return l.name; }); }
function labNamesSorted(){ return labNames().slice().sort(); }
function labFind(n){ for(var i=0;i<FARM_LABS.length;i++) if(FARM_LABS[i].name===n) return FARM_LABS[i]; return null; }
function labColorMap(){ var o={}; FARM_LABS.forEach(function(l){ if(l.pi) o[l.name]=l.color; }); return o; }
function labAbMap(){ var o={}; FARM_LABS.forEach(function(l){ if(l.pi) o[l.name]=l.ab||l.name.slice(0,2); }); return o; }

/* The four derived lists are rebuilt together, so they cannot fall out of
   step again. Every one is a `var` read by name at render time. */
function labsRebuild(){
  RST_LABS=labNamesSorted();
  CAL_LABS=labNames();
  TR_LABS=labColorMap();
  TR_LAB_AB=labAbMap();
}

var LAB_HEX=/^#[0-9a-fA-F]{6}$/;
function labsValid(list){
  if(!Array.isArray(list)||!list.length) return false;
  var seen={};
  for(var i=0;i<list.length;i++){
    var l=list[i];
    if(!l||typeof l!=='object') return false;
    if(typeof l.name!=='string'||!l.name.trim()) return false;
    if(seen[l.name]) return false;
    seen[l.name]=1;
    if(typeof l.color!=='string'||!LAB_HEX.test(l.color)) return false;
  }
  return true;
}

function labsCaptureBase(){ _labsBase=JSON.stringify(FARM_LABS); }
function labsDiff(){ return (_labsBase!==null&&JSON.stringify(FARM_LABS)!==_labsBase)?FARM_LABS:null; }
function labsIsDefault(){ return labsDiff()===null; }
function labsApply(list){
  if(!labsValid(list)) return false;
  FARM_LABS.length=0;
  list.forEach(function(l){
    FARM_LABS.push({name:String(l.name).trim(),color:l.color,
                    ab:(typeof l.ab==='string'&&l.ab.trim())?l.ab.trim().slice(0,3):String(l.name).trim().slice(0,2),
                    pi:l.pi!==false});
  });
  labsRebuild();
  return true;
}
function labsHydrate(){
  labsCaptureBase();
  var raw=null; try{ raw=localStorage.getItem(LABS_KEY); }catch(e){}
  if(raw!==null&&raw!==undefined){
    var p=null; try{ p=JSON.parse(raw); }catch(e){ p=null; }
    labsApply(p);
  }
  try{ _storeSeen['labs']=JSON.stringify(labsDiff()); }catch(e){}
}
function labsScan(){
  var s; try{ s=JSON.stringify(labsDiff()); }catch(e){ return; }
  if(_storeSeen['labs']===s) return;
  var d=labsDiff();
  if(d===null){ try{ localStorage.removeItem(LABS_KEY); }catch(e){} _storeSeen['labs']=s; return; }
  if(storeWriteRaw({key:LABS_KEY},JSON.stringify(d))) _storeSeen['labs']=s;
}

/* Names in use somewhere that are not on the list — the drift this replaces,
   surfaced instead of hidden. */
function labsUnlisted(){
  var known={}, out={};
  FARM_LABS.forEach(function(l){ known[l.name]=1; });
  function note(n,where){
    if(!n||n==='—'||n==='all'||known[n]) return;
    (out[n]=out[n]||{name:n,people:0,trials:0})[where]++;
  }
  try{ PEOPLE.forEach(function(p){ note(p&&p.lab,'people'); }); }catch(e){}
  try{ TRIALS.forEach(function(t){ note(t&&t.lab,'trials'); }); }catch(e){}
  return Object.keys(out).map(function(k){ return out[k]; });
}

var RST_LABS=labNamesSorted();
var RST_KEY='ut_people_v1';
var RST_SEED=[
 {id:'p01',first:'Dillon',last:'McCallum',pron:'he/him/his',role:'Technician',lab:'Sorochan',email:'',active:true,grants:['assign_undergrads']},
 {id:'p02',first:'Rhys',last:'Fielder',pron:'he/him/his',role:'Technician',lab:'Sorochan',email:'',active:true},
 {id:'p03',first:'Kyley',last:'Dickson',pron:'he/him/his',role:'Technician',lab:'Sorochan',email:'',active:true},
 {id:'p04',first:'Taylor',last:'Williams',pron:'he/him/his',role:'Technician',lab:'Sorochan',email:'',active:true},
 {id:'p05',first:'Greg',last:'Breeden',pron:'he/him/his',role:'Technician',lab:'Brosnan',email:'',active:true},
 {id:'p06',first:'Javi',last:'Vargas',pron:'he/him/his',role:'Technician',lab:'Brosnan',email:'',active:true},
 {id:'p07',first:'Bill',last:'Czekai',pron:'he/him/his',role:'Farm Manager',lab:'Bill',email:'',active:true},
 {id:'p08',first:'David',last:'Shell',pron:'he/him/his',role:'Technician',lab:'Horvath',email:'',active:true},
 {id:'p09',first:'Rose',last:'Gibbons',pron:'she/her/hers',role:'Graduate Student',lab:'Sorochan',email:'',active:true},
 {id:'p10',first:'Zoe',last:'Haub-Hinton',pron:'she/her/hers',role:'Graduate Student',lab:'Bowling',email:'',active:true},
 {id:'p11',first:'Siena',last:'Jobkar',pron:'she/her/hers',role:'Graduate Student',lab:'Bowling',email:'',active:true},
 {id:'p12',first:'Logan',last:'Smith',pron:'he/him/his',role:'Graduate Student',lab:'Brosnan',email:'',active:true},
 {id:'p13',first:'Jim',last:'Brosnan',pron:'he/him/his',role:'Faculty',lab:'Brosnan',email:'',active:true},
 {id:'p14',first:'Brandon',last:'Horvath',pron:'he/him/his',role:'Faculty',lab:'Horvath',email:'',active:true},
 {id:'p15',first:'Becky',last:'Bowling',pron:'she/her/hers',role:'Faculty',lab:'Bowling',email:'',active:true},
 {id:'p16',first:'John',last:'Sorochan',pron:'he/him/his',role:'Faculty',lab:'Sorochan',email:'',active:true},
 {id:'p17',first:'John',last:'Stier',pron:'he/him/his',role:'Faculty',lab:'Stier',email:'',active:true,grants:['trials:Sorochan']},
 {id:'p18',first:'Garrett',last:'Willard',pron:'he/him/his',role:'Undergraduate Student',lab:'Bill',email:'',active:true},
 {id:'p19',first:'Barrett',last:'Smith',pron:'he/him/his',role:'Undergraduate Student',lab:'Bill',email:'',active:true},
 {id:'p20',first:'Taryn',last:'Breeden',pron:'she/her/hers',role:'Undergraduate Student',lab:'Bill',email:'',active:true},
 {id:'p21',first:'Jed',last:'Bates',pron:'he/him/his',role:'Undergraduate Student',lab:'Bill',email:'',active:true},
 {id:'p22',first:'Caroline',last:'Hagler',pron:'she/her/hers',role:'Undergraduate Student',lab:'Bill',email:'',active:true},
 {id:'p23',first:'Lauren',last:'Valk',pron:'she/her/hers',role:'Undergraduate Student',lab:'Brosnan',email:'',active:true},
 {id:'p24',first:'Levi',last:'Cunningham',pron:'he/him/his',role:'Undergraduate Student',lab:'Bill',email:'',active:true}
];
var PEOPLE=RST_SEED.map(function(p){var c={};for(var k in p)c[k]=p[k];return c;});
try{var _rp=localStorage.getItem(RST_KEY);if(_rp){var _pp=JSON.parse(_rp);if(_pp&&_pp.length)PEOPLE=_pp;}}catch(e){}
function rstSave(){try{localStorage.setItem(RST_KEY,JSON.stringify(PEOPLE));}catch(e){}}

/* ---- A NEW HIRE REACHES PHONES THAT ALREADY HAVE THE APP -----------------
   A phone that has saved its own roster stops reading RST_SEED above, for
   good reason: it is holding edits somebody made. The cost was that a person
   added to the built-in list was invisible to everyone EXCEPT whoever typed
   them in. That is how Levi Cunningham (p24) could sign in on his own new
   phone on 2026-08-31 while Bill, whose phone had had the app for weeks,
   could not see him to put him on a job.

   Copying the built-in list back in blindly would be worse than the bug: it
   would resurrect anybody who had been REMOVED from the roster, and removing
   somebody is deliberate and cannot be undone from the screen.

   So this leans on the one thing that tells a new hire apart from a removal.
   Roster ids only ever count UPWARDS -- rstNewId() takes the highest and adds
   one -- so an id higher than any this phone has ever seen cannot be somebody
   this phone removed. It has to be new. Anyone BELOW the mark who is missing
   was taken off on purpose, and stays off.

   The mark is remembered rather than worked out fresh each time. Working it
   out would read "highest id I hold", so removing p24 would drop it back to
   23 and hand p24 straight back the next morning. */
var RST_HWM_KEY='ut_people_seen_v1';
/* Every id up to here was on every phone before this mechanism existed, so on
   the first run they count as already seen -- otherwise somebody removed from
   the old roster would come back once. It is a fact about 2026-08-31 and
   nothing else; it never needs raising when somebody new is hired. */
var RST_HWM_BASE=23;
function rstIdNum(id){ var m=/^p(\d+)$/.exec(id||''); return m?+m[1]:0; }
function rstSeedNewcomers(){
  var have={}; PEOPLE.forEach(function(p){ if(p&&p.id) have[p.id]=1; });
  var hwm=0;
  try{ var v=localStorage.getItem(RST_HWM_KEY); if(v!==null) hwm=+v||0; }catch(e){}
  if(!hwm){
    hwm=RST_HWM_BASE;
    PEOPLE.forEach(function(p){ var n=rstIdNum(p&&p.id); if(n>hwm) hwm=n; });
  }
  var added=0, top=hwm;
  RST_SEED.forEach(function(sp){
    var n=rstIdNum(sp.id);
    if(n>top) top=n;
    if(n<=hwm || have[sp.id]) return;
    var c={}; for(var k in sp) c[k]=sp[k];
    PEOPLE.push(c); added++;
  });
  try{ localStorage.setItem(RST_HWM_KEY,String(top)); }catch(e){}
  if(added) rstSave();
  return added;
}
rstSeedNewcomers();
/* ---- one-time: Dr. Stier's second lab moves onto the roster --------------
   It used to be a hardcoded map inside the trials module (TR_EXTRA_LABS), which
   the database could not read. It is a grant on his roster record now. A phone
   that already had a saved roster would never see the new seed, so it is
   stamped on once here, behind a flag, so that clearing it later sticks.
   Safe to delete this whole block once every phone has opened the app once. */
(function(){
  var FLAG='ut_trials_grant_v1';
  try{ if(localStorage.getItem(FLAG)==='1') return; }catch(e){}
  try{
    var p17=null;
    PEOPLE.forEach(function(p){ if(p&&p.id==='p17') p17=p; });
    if(p17){
      p17.grants=p17.grants||[];
      if(p17.grants.indexOf('trials:Sorochan')<0){ p17.grants.push('trials:Sorochan'); rstSave(); }
    }
    localStorage.setItem(FLAG,'1');
  }catch(e){}
})();
function pName(p){return ((p.first||'')+' '+(p.last||'')).replace(/\s+/g,' ').trim();}
function pInit(p){return (((p.first||'')[0]||'')+((p.last||'')[0]||'')).toUpperCase()||'?';}
/* ============================================================
   PERSON REFERENCES · a stored person is a roster id, never a name
   ------------------------------------------------------------
   Everywhere the app records who did something, who a job belongs to, or who
   is on a crew, the value stored is the person's roster id — 'p18', not
   'Garrett Willard'. Names are produced at render time by nameOf().

   It used to be the other way round: assignments, completions, shift tables,
   time-clock punches and trial owners all held the full name as typed. That
   worked only because nobody had ever been renamed. The moment somebody's
   surname changed on the roster, every task they had ever been assigned, every
   job they had closed out and every punch they had made silently detached —
   the records still held the old spelling and nothing pointed at them any more.

   It also cannot survive the port. `task.assignee_id` has to be a foreign key
   to `person.id`; Postgres will not accept a name where a key belongs.

   pidOf() is the one-way door: it takes a name, an id, or a roster object and
   gives back an id. It exists so old saved data and any hand-written seed can
   be normalised on the way in. Nothing should be storing names by the time it
   is called, but the app has to be able to read what it wrote last week.
   ============================================================ */
function pidOf(x){
  if(!x) return null;
  if(typeof x==='object') return x.id||null;
  if(/^p\d+$/.test(x)) return x;                 /* already an id */
  /* The field log restores itself from storage before the roster exists, so a
     name cannot be resolved on that first pass. Returning null leaves the name
     in place; flStampWho() runs again once PEOPLE is built and converts it. */
  if(typeof PEOPLE==='undefined'||!PEOPLE) return null;
  var p=rstFindByName(x); if(p) return p.id;
  /* Seeded shorthand — "Rose G." — and anyone who has left the roster. Match on
     first name plus last initial before giving up. */
  var m=/^(\S+)\s+([A-Za-z])\.?$/.exec(x);
  if(m){
    var hit=PEOPLE.filter(function(q){
      return (q.first||'').toLowerCase()===m[1].toLowerCase()
          && ((q.last||'')[0]||'').toLowerCase()===m[2].toLowerCase(); });
    if(hit.length===1) return hit[0].id;
  }
  return null;
}
/* The display name for a stored reference. Falls back to whatever it was given
   so a record naming somebody no longer on the roster still reads as a person
   rather than as a blank or an id. */
function nameOf(x){
  if(!x) return '';
  var p=(typeof x==='object')?x:rstFind(pidOf(x)||'');
  return p?pName(p):(typeof x==='string'&&!/^p\d+$/.test(x)?x:'');
}
function initOf(x){ var p=rstFind(pidOf(x)||''); return p?pInit(p):'?'; }
function titleOf(x){ var p=rstFind(pidOf(x)||''); return p?(RST_TITLE[p.role]||p.role):''; }
function labOf(x){ var p=rstFind(pidOf(x)||''); return p?(p.lab||'—'):''; }
/* Does this reference point at whoever is signed in. Replaces the dozen
   `t.assignee===meName()` string comparisons, which broke the moment two
   people shared a display name. */
function isMe(x){ var id=pidOf(x); return !!id && id===SESSION.pid; }
function namesOf(list){ return (list||[]).map(nameOf).filter(Boolean); }
function pidsOf(list){ return (list||[]).map(pidOf).filter(Boolean); }
/* Sort a list of ids the way people expect to read them. */
function sortPids(ids){ return rstSort(pidsOf(ids).map(function(i){return rstFind(i);}).filter(Boolean)).map(function(p){return p.id;}); }

function rstFind(id){for(var i=0;i<PEOPLE.length;i++)if(PEOPLE[i].id===id)return PEOPLE[i];return null;}
function rstFindByName(n){for(var i=0;i<PEOPLE.length;i++)if(pName(PEOPLE[i])===n)return PEOPLE[i];return null;}
function rstActive(){return PEOPLE.filter(function(p){return p.active!==false;});}
/* The next free roster id. It counts up from the highest this phone has ever
   SEEN, not the highest it currently holds — and since 2026-08-31 that matters,
   because two people can now add a hire at the same time on two phones. Taking
   only what is held would hand p25 to both of them, the second write would
   quietly overwrite the first, and every task, punch and field-log entry filed
   against p25 would then point at the wrong person. The high-water mark is
   already kept for rstSeedNewcomers(); this reads the same one. */
function rstNewId(){
  var n=1;
  PEOPLE.forEach(function(p){var m=/^p(\d+)$/.exec(p.id||'');if(m&&+m[1]>=n)n=+m[1]+1;});
  try{
    var seen=+(localStorage.getItem(RST_HWM_KEY)||0);
    if(seen>=n) n=seen+1;
  }catch(e){}
  return 'p'+(n<10?'0':'')+n;
}
function rstSort(list){return list.slice().sort(function(a,b){
  var d=(RST_ORDER[a.role]==null?9:RST_ORDER[a.role])-(RST_ORDER[b.role]==null?9:RST_ORDER[b.role]);
  return d||(a.lab||'').localeCompare(b.lab||'')||pName(a).localeCompare(pName(b));});}
function rstUndergradNames(){return rstActive().filter(function(p){return p.role==='Undergraduate Student';}).map(pName);}
/* The undergrad pool and the grad/tech crew as roster ids. These replaced the
   name lists STUDENTS and CREW were built from: the lists feed pickers whose
   selection is stored on a task, so what they carry has to be the key that
   ends up in the record. */
function rstUndergradIds(){return rstActive().filter(function(p){return p.role==='Undergraduate Student';}).map(function(p){return p.id;});}
function rstCrewList(){return rstActive().filter(function(p){return p.role==='Graduate Student'||p.role==='Technician';})
  .map(function(p){return {pid:p.id,name:pName(p),role:p.role==='Graduate Student'?'Grad student':'Technician',lab:p.lab||'—'};});}
/* Demo logins point at real roster entries, so editing a person on the roster
   also updates the account card they sign in with. */
var RST_LOGIN={manager:'p07',undergrad:'p18',grad:'p09',faculty:'p14',tech:'p05'};
var RST_COLOR={manager:'#ff8200',undergrad:'#489FDF',grad:'#00746F',faculty:'#58595b',tech:'#58595b'};
var RST_HIRED={manager:'2014-03-01',undergrad:'2025-08-18',grad:'2023-08-21',faculty:'2011-01-10',tech:'2018-06-04'};
var USERS={};

/* ============================================================
   SESSION · who is signed in
   ------------------------------------------------------------
   One person is signed in at a time, and everything about them — their role,
   their lab, what they may edit, whose name lands on the work they finish —
   is read off their roster record.

   This used to run the other way round. `currentRole` was picked from a menu,
   and each of the five roles had exactly one person wired to it (RST_LOGIN
   below), so signing in as "grad" always meant Rose and "faculty" always meant
   Brandon. Only five of the twenty-three people on the roster could use the
   app, and permissions that are really about a person — which lab's trials you
   may edit — were hardcoded against the role instead.

   Now SESSION.pid is the source of truth and currentRole is derived from it.
   The ninety-odd places that read `currentRole` did not have to change: the
   value means the same thing, it is just no longer chosen by hand. What did
   change is that they are now correct for all twenty-three people rather than
   for five.

   This is also the shape Firebase Auth expects. `sessionSet(pid)` becomes
   "resolve auth.uid() to a person row", and the RLS policies in
   Editable-Map-Backend-Plan.md key off SESSION.person.lab — a real column —
   rather than off a role string that guessed at it.
   ============================================================ */

/* Roster job titles are prose ("Graduate Student"); the app's internal role
   slugs are short ('grad'). One map, both directions, so neither side has to
   know the other's spelling. */
var ROLE_SLUG={'Farm Manager':'manager','Faculty':'faculty','Graduate Student':'grad',
               'Technician':'tech','Undergraduate Student':'undergrad'};
var SLUG_ROLE={}; Object.keys(ROLE_SLUG).forEach(function(r){SLUG_ROLE[ROLE_SLUG[r]]=r;});

var SESSION_KEY='ut_session_v1';
var SESSION={pid:null};

function roleSlug(p){ return (p&&ROLE_SLUG[p.role])||'undergrad'; }
/* The signed-in person's roster record, or null before anyone has signed in. */
function sessionPerson(){ return SESSION.pid?rstFind(SESSION.pid):null; }

/* The account card the profile screen, the home banner and every "who did
   this" field read. Built from the live roster record, so editing someone on
   the roster updates their card immediately — the same guarantee the old
   RST_LOGIN wiring gave, now for everybody.

   Colour and hire date have no roster column yet. Until they do they come from
   the per-role defaults, which is what they always were. */
function meCard(p){
  p=p||sessionPerson();
  if(!p) return USERS.manager||{pid:null,n:'Signed out',i:'?',t:'',e:'',c:'#58595b',lab:'—',hired:''};
  var k=roleSlug(p);
  return {pid:p.id,n:pName(p),i:pInit(p),t:RST_TITLE[p.role]||p.role,e:p.email||'',
          c:RST_COLOR[k]||'#58595b',lab:p.lab||'—',hired:RST_HIRED[k]||''};
}
/* `me()` is the one call for "the signed-in account". Before this there were
   four spellings of it — USERS[currentRole], USERS.undergrad, meName(),
   calSelf() — and two of them were wrong for anyone who was not the demo
   user. They all route here now. */
function me(){ return USERS[currentRole]||meCard(); }
function myLab(){ var p=sessionPerson(); return (p&&p.lab)||'—'; }

/* Signing in. Sets the person, derives the role, rebuilds the account card,
   and swaps in that person's saved preferences. Returns false for an id that
   is not on the roster or has been deactivated, so a stale saved session from
   a previous visit cannot sign someone in who has since left. */
function sessionSet(pid,opts){
  var p=rstFind(pid);
  if(!p||p.active===false) return false;
  SESSION.pid=p.id;
  currentRole=roleSlug(p);
  USERS[currentRole]=meCard(p);
  try{ localStorage.setItem(SESSION_KEY,p.id); }catch(e){}
  if(typeof prefsSwitch==='function') prefsSwitch();
  if(typeof rstSync==='function' && !(opts&&opts.quiet)) rstSync();
  return true;
}
function sessionClear(){
  SESSION.pid=null;
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
}
/* Whoever was signed in last on this device. Not authentication — it is the
   "keep me signed in" box, and it is exactly the slot a real token goes in
   once the shared database Auth lands. */
function sessionRestore(){
  var pid=null; try{ pid=localStorage.getItem(SESSION_KEY); }catch(e){}
  return pid?sessionSet(pid,{quiet:true}):false;
}

/* USERS is still keyed by role slug, because the home-screen previews and the
   calendar's lab lookup ask "who is the <role> here". For the role that is
   signed in, the entry is the signed-in person. For the others it stays the
   RST_LOGIN default, which is all a preview needs. */
function rstBuildUsers(){
  Object.keys(RST_LOGIN).forEach(function(k){
    var p=rstFind(RST_LOGIN[k]); if(!p)return;
    var u=USERS[k]||(USERS[k]={});
    u.pid=p.id; u.n=pName(p); u.i=pInit(p); u.t=RST_TITLE[p.role]||p.role;
    u.e=p.email||''; u.c=u.c||RST_COLOR[k]; u.lab=p.lab||'—'; u.hired=u.hired||RST_HIRED[k];
  });
  /* the signed-in person always wins over the default for their own role */
  var sp=sessionPerson();
  if(sp) USERS[roleSlug(sp)]=meCard(sp);
}
rstBuildUsers();
/* The roster now exists, so the boot-time migration can finally resolve role
   names to roster ids. No-ops once it has run. */
prefsMigrate(); notifLoad(); try{themeLoad();}catch(e){}
/* Second pass over the field log: anything restored from storage before the
   roster existed still holds a name, and can now be resolved to an id. */
try{ if(typeof flStampWho==='function'){ flStampWho(); flCommit(); } }catch(e){}
/* ---- App Manager ----
   A separate administrator account, not a farm job. It exists so faculty
   records — who is a PI, which lab they hold, whether they are still here —
   sit outside the farm's own chain of command: Bill runs the crew, the App
   Manager runs the app. The post is handed over, not inherited, so whoever
   takes the app on next gets it cleanly when the current holder moves jobs. */
var RST_ADMIN_KEY='ut_appadmin_v1';
var APP_ADMIN={name:'Dillon McCallum',email:'',pid:'p01',since:'2026-08-07'};
try{var _aa=localStorage.getItem(RST_ADMIN_KEY);if(_aa){var _ap=JSON.parse(_aa);if(_ap&&_ap.name)APP_ADMIN=_ap;}}catch(e){}
function rstAdminSave(){try{localStorage.setItem(RST_ADMIN_KEY,JSON.stringify(APP_ADMIN));}catch(e){}}
/* THE APP MANAGER POST IS A HAT, NOT A JOB.       (changed 2026-08-25)

   It used to be `currentRole='admin'`, which REPLACED the holder's farm role.
   Dillon holds the post and is also a Technician in the Sorochan lab, and the
   old way meant signing in stopped him being a technician: no technician home
   screen, no technician tabs, and `me()` returned an "App Manager" card
   instead of his own. He landed on the roster and could not get to his own
   work.

   Now the post is its own flag, worn on top of whatever job the roster says.
   currentRole stays whatever `sessionSet()` derived from the roster, and every
   admin power still answers to `rstIsAdmin()` exactly as before - so nothing
   that grants a power had to change, only the question it asks.

   It is deliberately NOT stored anywhere. It comes off the sign-in token every
   time (the `app_admin` claim), which is the only thing that can be trusted to
   say who holds the post. */
var IS_APP_ADMIN=false;
function rstIsAdmin(){return IS_APP_ADMIN===true;}
function rstAdminInit(){return (APP_ADMIN.name||'').split(/\s+/).map(function(x){return x[0]||'';}).join('').slice(0,2).toUpperCase()||'AM';}
function rstBuildAdminUser(){USERS.admin={pid:APP_ADMIN.pid||null,n:APP_ADMIN.name,i:rstAdminInit(),t:'App Manager',e:APP_ADMIN.email||'',c:'#58595b',lab:'—',hired:APP_ADMIN.since||''};}
rstBuildAdminUser();
/* ============================================================
   SIGN-IN · pick the person, not the role
   ------------------------------------------------------------
   Both the login screen and "Switch user" render from here, because they are
   the same list asking the same question. Before this, the login screen was a
   painted mock-up — an email box and a password box that did nothing — and the
   real entry point was a "Choose your role" menu of five cards. Signing in as
   a grad student meant becoming Rose whether you were Rose or not.

   Now every active person on the roster is listed, grouped by job, and tapping
   one signs in as that person. The role is a consequence of who you are, not a
   thing you choose: Bill lands on the manager home because Bill is the Farm
   Manager, and if the roster later says otherwise he lands somewhere else
   without a line of this changing.

   The App Manager sits below a divider because it is a post rather than a farm
   job — it holds the faculty records and sits outside Bill's chain of command.

   There is deliberately no password. Authentication is Stage 1 (Firebase
   Auth); this is the screen it slots behind, and sessionSet() is the one call
   that changes when it does.
   ============================================================ */
function lgHome(){ return HOME_DEST[currentRole]||'home-undergrad'; }

/* One row per person: initials, name, job, lab. */
/* The App Manager is a post, not a person, so it is a flag on a real account
   rather than a login of its own. It arrives on the auth token as
   app_metadata.is_app_admin and is applied on top of a normal sign-in. */
function signInAdmin(){
  IS_APP_ADMIN=true;
  rstBuildAdminUser();
  /* No prefsSwitch() here any more. Preferences follow the PERSON (their
     roster pid, see prefsWho), and sessionSet has already switched them. This
     call used to be needed only because the line above it changed the role. */
}
/* Taking the hat off. Called wherever somebody stops being signed in, so the
   post can never carry over to whoever signs in next on the same device. */
function signOutAdmin(){ IS_APP_ADMIN=false; }
function signOut(){ authSignOut(); }

function rstPaintRolesCard(){
  var el=document.getElementById('rolecard-admin-sub');
  if(el)el.textContent=APP_ADMIN.name+' · accounts, roles & faculty records';
}
/* Push roster edits out to every list that names people. STUDENTS and CREW are
   rebuilt in place so the dozens of closures already holding a reference keep
   pointing at live data. */
function rstSync(){
  rstBuildUsers(); if(typeof rstBuildAdminUser==='function')rstBuildAdminUser();
  if(typeof STUDENTS!=='undefined'){var s=rstUndergradIds();STUDENTS.length=0;s.forEach(function(n){STUDENTS.push(n);});}
  if(typeof CREW!=='undefined'){var c=rstCrewList();CREW.length=0;c.forEach(function(x){CREW.push(x);});}
  if(typeof ROLE_LAB!=='undefined'){Object.keys(ROLE_LAB).forEach(function(k){if(USERS[k]&&USERS[k].lab)ROLE_LAB[k]=USERS[k].lab;});}
  /* someone off the roster can't still be on next week's day board */
  rstSave();
}
/* ---- who is allowed to change what ----
   Bill edits the whole farm. A PI edits their own lab, every undergraduate
   (they all work the same shared pool), and the Farm Manager entry — so if Bill
   ever leaves, the faculty can still hand the job to someone. A PI cannot edit
   another PI or another lab's grads and techs. */
function rstMe(){ return sessionPerson(); }
function rstCanOpen(){return currentRole==='manager'||currentRole==='faculty'||rstIsAdmin();}
function rstCanEdit(p){
  if(!p)return false;
  if(rstIsAdmin())return true;                     /* the App Manager holds every record */
  if(p.role==='Faculty')return false;              /* a PI is appointed, not hired — App Manager only */
  if(currentRole==='manager')return true;
  if(currentRole!=='faculty')return false;
  if(p.role==='Undergraduate Student')return true;
  if(p.role==='Farm Manager')return true;
  var me=rstMe();
  return !!me&&(p.lab||'')===(me.lab||'');
}
function rstWhyLocked(p){
  if(p.role==='Faculty')return 'Faculty records are held by the App Manager · '+APP_ADMIN.name;
  return 'In the '+(p.lab||'—')+' lab · edited by that PI or by Bill';
}
function fillProfile(){const u=me();const q=x=>document.getElementById(x);if(!q('pf-init'))return;q('pf-init').textContent=u.i;q('pf-init').style.background=u.c;q('pf-name').textContent=u.n;q('pf-role').textContent=u.t;q('pf-email').textContent=u.e;q('pf-lab').textContent=u.lab;var rr=q('pf-roster-row');if(rr){rr.style.display=rstCanOpen()?'':'none';var rs=q('pf-roster-sub');if(rs)rs.textContent=rstActive().length+' people · '+(currentRole==='manager'?'edit everyone but the faculty':'edit your lab and the undergrads');}renderProfileSchedule();var pso=q('pf-signout');if(pso&&!pso._wired){pso._wired=true;pso.addEventListener('click',signOut);}}
function renderProfEdit(){const u=me();
 document.getElementById('pfe-body').innerHTML=
   '<div class="sec" style="margin:14px 18px 7px">Profile</div><div class="list">'
  +'<div class="fld"><span class="fl">Name</span><input class="inv-in" id="pfe-name" style="max-width:190px"></div>'
  +'<div class="fld"><span class="fl">Title</span><span class="fv" id="pfe-title" style="color:var(--muted)"></span></div>'
  +'<div class="fld"><span class="fl">Email</span><span class="fv" id="pfe-email" style="color:var(--muted)"></span></div>'
  +'<div class="fld"><span class="fl">Lab</span><input class="inv-in" id="pfe-lab" style="max-width:190px"></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Hired / started</span><input type="date" class="inv-in" id="pfe-hired" style="max-width:190px"></div></div>'
  +'<div class="sec" style="margin:14px 18px 7px">Account security</div><div class="list">'
  +'<div class="fld"><span class="fl">New password</span><input type="password" class="inv-in" id="pfe-pw1" placeholder="Leave blank to keep current" style="max-width:190px"></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Confirm password</span><input type="password" class="inv-in" id="pfe-pw2" placeholder="Re-enter new password" style="max-width:190px"></div></div>';
 document.getElementById('pfe-name').value=u.n;
 document.getElementById('pfe-title').textContent=u.t;
 document.getElementById('pfe-email').textContent=u.e;
 document.getElementById('pfe-lab').value=u.lab==='—'?'':u.lab;
 document.getElementById('pfe-hired').value=u.hired||'';
 document.getElementById('pfe-pw1').value='';
 document.getElementById('pfe-pw2').value='';
}
document.getElementById('pfe-save').addEventListener('click',function(){
 const u=me();const g=x=>document.getElementById('pfe-'+x).value.trim();
 const name=g('name'); if(!name){toast('Name is required');return;}
 const pw1=g('pw1'),pw2=g('pw2');
 if(pw1||pw2){
   if(pw1.length<8){toast('Password must be at least 8 characters');return;}
   if(pw1!==pw2){toast('Passwords do not match');return;}
 }
 function finishProfileSave(){
   u.n=name; u.lab=g('lab')||'—'; u.hired=g('hired')||u.hired;
   var mp=u.pid?rstFind(u.pid):null;
   if(mp){var np=name.split(/\s+/);mp.first=np.shift()||mp.first;mp.last=np.join(' ');if(u.lab&&u.lab!=='—')mp.lab=u.lab;rstSync();}
   u.i=name.split(/\s+/).map(function(p){return p[0]||'';}).join('').slice(0,2).toUpperCase()||u.i;
   fillProfile(); toast(pw1?'Saved changes · password updated ✓':'Saved changes ✓'); back();
 }
 if(!pw1){ finishProfileSave(); return; }
 /* A password change is a real Firebase call (see the auth notes) -- everything
    else on this form is only kept locally either way, so only leave the screen
    once the password change has actually gone through. Same checks and wording
    as the old "Switch user" account screen used, before it was retired. */
 var auth=(typeof fbAuth==='function')?fbAuth():null;
 if(!auth||!auth.currentUser){ toast('Cannot reach the sign-in service.'); return; }
 if(navigator.onLine===false){ toast('No signal — a password change needs a connection.'); return; }
 toast('Working…');
 auth.currentUser.updatePassword(pw1).then(finishProfileSave).catch(function(err){
   var code=(err&&err.code)||'';
   if(code==='auth/requires-recent-login') toast('For safety this needs a fresh sign-in. Sign out, sign back in, then try again.');
   else if(code==='auth/weak-password') toast('That password is too easy to guess. Try a longer one.');
   else if(code==='auth/network-request-failed') toast('Could not reach the sign-in service. Check your connection.');
   else toast('That did not work.');
 });
});
/* ---- Roster page: who works here, and what they are ----
   Bill and the PIs get a read of the whole farm; the edit rights are narrower
   (see rstCanEdit). Everything written here goes through rstSync, so a
   promotion or a graduation lands on the task board and crew pickers too. */
var rstEditId=null, rstQ='', rstArmedDelete=false;
function rstChip(role){
  var bg={'Farm Manager':'#fff1e3','Faculty':'#e9edf2','Graduate Student':'#e4f1ef','Technician':'#eef1f4','Undergraduate Student':'#e7f1fa'}[role]||'#eef1f4';
  var fg={'Farm Manager':'#9a5b00','Faculty':'#4a5560','Graduate Student':'#00746F','Technician':'#7b828d','Undergraduate Student':'#2a6ea8'}[role]||'#7b828d';
  return '<span style="flex:none;background:'+bg+';color:'+fg+';border-radius:7px;padding:3px 7px;font:800 10px \'Public Sans\';letter-spacing:.4px">'+(RST_SHORT[role]||'—')+'</span>';
}
function rstRow(p){
  var can=rstCanEdit(p), inactive=p.active===false;
  var sub=(RST_TITLE[p.role]||p.role)+' · '+(p.lab||'—')+' lab';
  var right=can?'<span style="color:#c2c7cd;font-size:18px;flex:none">›</span>'
               :'<span style="flex:none;font:700 10px \'Public Sans\';color:#b6bcc4">Locked</span>';
  return '<div class="row'+(can?' tap':'')+'" data-rst="'+p.id+'"'+(can?'':' title="'+esc(rstWhyLocked(p))+'"')+' style="'+(inactive?'opacity:.55':'')+'">'
    +rstChip(p.role)
    +'<div style="flex:1;min-width:0;margin-left:10px"><div class="rt">'+esc(pName(p))+(inactive?' <span style="font:700 10px \'Public Sans\';color:#b6bcc4">· inactive</span>':'')+'</div>'
    +'<div class="rs">'+esc(sub)+'</div></div>'+right+'</div>';
}
function rstMatch(p){
  if(!rstQ)return true;
  var q=rstQ.toLowerCase();
  return (pName(p)+' '+(p.role||'')+' '+(p.lab||'')+' '+(p.email||'')).toLowerCase().indexOf(q)>=0;
}
function rstRender(){
  var body=document.getElementById('rst-body'); if(!body)return;
  var all=rstSort(PEOPLE).filter(rstMatch);
  var live=all.filter(function(p){return p.active!==false;});
  var gone=all.filter(function(p){return p.active===false;});
  var counts={};rstActive().forEach(function(p){counts[p.role]=(counts[p.role]||0)+1;});
  var scope=rstIsAdmin()
    ? 'You hold every record on the farm, faculty included.'
    : (currentRole==='manager'
      ? 'You can change anyone except the faculty — those records sit with the App Manager.'
      : 'You can edit your own lab and every undergraduate. Faculty records sit with the App Manager.');
  var html='<div style="margin:14px 16px 0;padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:var(--card,#fff)">'
    +'<div style="font:800 13px \'Archivo\';color:var(--ink)">'+rstActive().length+' people at the farm</div>'
    +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:3px;line-height:1.45">'
    +RST_ROLES.filter(function(r){return counts[r];}).map(function(r){return counts[r]+' '+(RST_SHORT[r]||r);}).join(' · ')
    +'<br>'+scope+'</div></div>'
    +'<div style="margin:12px 16px 0"><input id="rst-q" class="inv-in" placeholder="Search name, role, lab or email" style="text-align:left" value="'+esc(rstQ)+'"></div>';
  RST_ROLES.forEach(function(r){
    var grp=live.filter(function(p){return p.role===r;});
    if(!grp.length)return;
    html+='<div class="sec">'+r+(grp.length>1?'s':'')+' · '+grp.length+'</div><div class="list">'+grp.map(rstRow).join('')+'</div>';
  });
  var other=live.filter(function(p){return RST_ROLES.indexOf(p.role)<0;});
  if(other.length)html+='<div class="sec">Other · '+other.length+'</div><div class="list">'+other.map(rstRow).join('')+'</div>';
  if(gone.length)html+='<div class="sec">Inactive · '+gone.length+'</div>'
    +'<div style="margin:0 20px 8px;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.4">Kept on the roster so their name still reads correctly on old field logs and timesheets. They are off the task board and the day crew.</div>'
    +'<div class="list">'+gone.map(rstRow).join('')+'</div>';
  if(!live.length&&!gone.length)html+='<div style="margin:22px 20px;font:700 13px \'Public Sans\';color:var(--muted);text-align:center">Nobody matches that search.</div>';
  html+='<div class="sec">App administration</div><div class="list">'
   +'<div class="row"><span style="flex:none;background:#eef1f4;color:#7b828d;border-radius:7px;padding:3px 7px;font:800 10px \'Public Sans\';letter-spacing:.4px">APP</span>'
   +'<div style="flex:1;min-width:0;margin-left:10px"><div class="rt">'+esc(APP_ADMIN.name)+'</div>'
   +'<div class="rs">App Manager · appoints faculty, holds every account</div></div></div>'
   +(rstIsAdmin()?'<div class="row tap" id="rst-xfer"><span style="width:26px;font:800 10px \'Public Sans\';color:var(--muted);letter-spacing:.4px">XFR</span>'
     +'<div style="flex:1"><div class="rt">Hand off app administration</div><div class="rs">Pass this account to whoever takes the app on next</div></div>'
     +'<span style="color:#c2c7cd;font-size:18px">›</span></div>':'')
   +'</div>';
  if(!rstIsAdmin())html+='<div style="margin:7px 20px 0;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.45">Faculty are appointed by the university, not hired by the farm, so their records are kept out of the farm chain of command. Ask '+esc(APP_ADMIN.name)+' to add, reclassify or retire a PI.</div>';
  if(rstIsAdmin())html+='<div class="list" style="margin-top:12px">'
   +'<div class="row tap" id="rst-signout"><span style="width:26px;font:800 10px \'Public Sans\';color:var(--muted)">OUT</span><div style="flex:1"><div class="rt">Log out</div></div><span style="color:#c2c7cd;font-size:18px">›</span></div></div>';
  body.innerHTML=html+'<div style="height:20px"></div>';
  var rso=document.getElementById('rst-signout');
  if(rso) rso.addEventListener('click',signOut);
}
function rstOpen(id){rstEditId=id;rstArmedDelete=false;go('rosteredit');}
function rstEditRender(){
  var body=document.getElementById('rste-body'); if(!body)return;
  var adding=rstEditId===null;
  var p=adding?{id:null,first:'',last:'',pron:'',role:'Undergraduate Student',lab:(rstMe()||{}).lab||'Bill',email:'',active:true}:rstFind(rstEditId);
  if(!p){back();return;}
  document.getElementById('rste-title').textContent=adding?'Add person':pName(p);
  document.getElementById('rste-save').textContent=adding?'Add to roster':'Save changes';
  /* Faculty is not on this menu unless the App Manager is the one holding it.
     Nobody at the farm — Bill included — appoints or unseats a PI from here. */
  var roleOpts=RST_ROLES.filter(function(r){return r!=='Faculty'||rstIsAdmin();});
  var sel=function(id,opts,val){return '<select id="'+id+'" class="sched-sel">'+opts.map(function(o){return '<option'+(o===val?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';};
  var labs=RST_LABS.slice(); if(p.lab&&labs.indexOf(p.lab)<0)labs.unshift(p.lab);
  body.innerHTML=
    '<div class="sec">Person</div><div class="list">'
   +'<div class="fld"><span class="fl">First name</span><input class="inv-in" id="rste-first" style="max-width:190px" value="'+esc(p.first)+'"></div>'
   +'<div class="fld"><span class="fl">Last name</span><input class="inv-in" id="rste-last" style="max-width:190px" value="'+esc(p.last)+'"></div>'
   +'<div class="fld"><span class="fl">Pronouns</span><input class="inv-in" id="rste-pron" placeholder="optional" style="max-width:190px" value="'+esc(p.pron||'')+'"></div>'
   +'<div class="fld" style="border-bottom:none"><span class="fl">Email</span><input class="inv-in" id="rste-email" style="max-width:210px" value="'+esc(p.email||'')+'"></div></div>'
   +'<div class="sec">Standing at the farm</div><div class="list">'
   +'<div class="fld"><span class="fl">Role</span>'+sel('rste-role',roleOpts,p.role)+'</div>'
   +'<div class="fld" style="border-bottom:none"><span class="fl">Lab</span>'+sel('rste-lab',labs,p.lab||'Bill')+'</div></div>'
   +'<div style="margin:7px 20px 0;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.45">Role decides where they show up: undergraduates land in the day crew and the assign-directly list, grads and technicians receive task requests, faculty and the farm manager can open this roster.</div>'
   +(adding?'':
      '<div class="sec">Status</div><div class="list">'
     +'<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px">'
     +'<div style="padding-right:12px"><div style="font:700 13px \'Public Sans\';color:var(--ink)">Currently working here</div>'
     +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px" id="rste-actsub">'+(p.active===false?'Off · kept on old records, hidden from every picker':'On · appears in crew lists and pickers')+'</div></div>'
     +'<span class="tgl'+(p.active===false?'':' on')+'" id="rste-active"></span></div></div>'
     +'<div style="margin:16px 16px 0"><div class="tap" id="rste-del" style="border:1px solid #e6c6c2;border-radius:12px;padding:13px;text-align:center;font:800 13px \'Archivo\';color:#c0392b;background:#fdf3f2">Remove from roster</div>'
     +'<div style="margin:7px 4px 0;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.45" id="rste-delsub">Deletes them outright. If they graduated but you still want their name on past logs, switch off <em>Currently working here</em> instead.</div></div>')
   +'<div style="height:26px"></div>';
}
document.getElementById('s-roster').addEventListener('click',function(e){
  var add=e.target.closest('#rst-addbtn'); if(add){rstOpen(null);return;}
  if(e.target.closest('#rst-xfer')){go('adminxfer');return;}
  var r=e.target.closest('[data-rst]'); if(!r)return;
  var p=rstFind(r.getAttribute('data-rst'));
  if(!p)return;
  if(!rstCanEdit(p)){toast(rstWhyLocked(p));return;}
  rstOpen(p.id);
});
document.getElementById('s-roster').addEventListener('input',function(e){
  if(e.target.id!=='rst-q')return;
  rstQ=e.target.value;
  var pos=e.target.selectionStart;
  rstRender();
  var q=document.getElementById('rst-q'); if(q){q.focus();try{q.setSelectionRange(pos,pos);}catch(err){}}
});
document.getElementById('s-rosteredit').addEventListener('click',function(e){
  var t=e.target.closest('#rste-active');
  if(t){var wasOn=t.classList.contains('on');var sb=document.getElementById('rste-actsub');if(sb)sb.textContent=wasOn?'Off · kept on old records, hidden from every picker':'On · appears in crew lists and pickers';return;}
  var d=e.target.closest('#rste-del'); if(!d)return;
  var p=rstFind(rstEditId); if(!p)return;
  var me=rstMe();
  if(me&&me.id===p.id){toast('You cannot remove your own account');return;}
  if(p.role==='Farm Manager'&&PEOPLE.filter(function(x){return x.role==='Farm Manager'&&x.active!==false;}).length<2){
    toast('Promote someone to Farm Manager first');return;}
  if(!rstArmedDelete){
    rstArmedDelete=true;
    d.textContent='Tap again to remove '+pName(p);
    d.style.background='#c0392b';d.style.color='#fff';d.style.borderColor='#c0392b';
    var s=document.getElementById('rste-delsub'); if(s)s.textContent='This cannot be undone. Their past field logs and timesheets keep the name as typed.';
    setTimeout(function(){if(rstArmedDelete&&document.getElementById('rste-del')===d){rstArmedDelete=false;rstEditRender();}},4000);
    return;
  }
  var name=pName(p);
  PEOPLE=PEOPLE.filter(function(x){return x.id!==p.id;});
  rstArmedDelete=false; rstSync();
  if(typeof renderBoard==='function'){try{renderBoard();}catch(err){}}
  toast(name+' removed from the roster ✓');
  back(); rstRender();
});
document.getElementById('rste-save').addEventListener('click',function(){
  var g=function(x){var el=document.getElementById('rste-'+x);return el?el.value.trim():'';};
  var first=g('first'), last=g('last'), email=g('email');
  if(!first&&!last){toast('Name is required');return;}
  if(email&&email.indexOf('@')<0){toast('That email address looks wrong');return;}
  var adding=rstEditId===null;
  var p=adding?{id:rstNewId(),active:true}:rstFind(rstEditId);
  if(!p){back();return;}
  var wasRole=p.role;
  p.first=first; p.last=last; p.pron=g('pron'); p.email=email;
  p.role=g('role')||p.role; p.lab=g('lab')||p.lab;
  var tg=document.getElementById('rste-active');
  if(tg)p.active=tg.classList.contains('on');
  if(adding){PEOPLE.push(p);}
  rstSync();
  if(typeof renderBoard==='function'){try{renderBoard();}catch(err){}}
  toast(adding?pName(p)+' added ✓':(wasRole!==p.role?pName(p)+' is now a '+(RST_TITLE[p.role]||p.role)+' ✓':'Saved changes ✓'));
  /* Send the person AND their sign-in together, rather than waiting for the
     drawer's next scan to take the roster record on its own. Somebody added
     with an address can then sign in straight away, which is the whole point
     of hiring inside the app. The drawer is still the safety net: if this
     fails -- no signal, usually -- the record goes up on the next scan and
     the address follows the next time somebody opens this screen. */
  if(typeof rosterLinkPerson==='function'){
    rosterLinkPerson(p,p.email).then(function(){
      if(adding&&p.email) toast(pName(p)+' can sign in with '+p.email);
    }).catch(function(e){
      /* Silent when there is simply no database on this device or no signal --
         the drawer will catch up. Loud when it was actually refused, because
         that means the person cannot get in and somebody has to know. */
      var why=(e&&e.message)||'';
      if(why==='notallowed') toast('Saved here, but only Bill can add somebody to the database');
      else if(why!=='nodb'&&why!=='nobody'&&typeof sdbError==='function') toast(sdbError(e));
    });
  }
  back(); rstRender();
});
/* ---- handing the app over ----
   Irreversible on purpose: the moment it is confirmed the current holder drops
   back to the role picker with no App Manager card of their own. */
var axfPid=null, axfArmed=false;
function axfRender(){
  var body=document.getElementById('axf-body'); if(!body)return;
  axfPid=null; axfArmed=false;
  var btn=document.getElementById('axf-save');
  if(btn){btn.textContent='Hand off app administration';btn.style.background='';}
  var pick=rstSort(rstActive()).map(function(p){
    return '<div class="row tap" data-axf="'+p.id+'">'+rstChip(p.role)
      +'<div style="flex:1;min-width:0;margin-left:10px"><div class="rt">'+esc(pName(p))+'</div>'
      +'<div class="rs">'+esc((RST_TITLE[p.role]||p.role)+' · '+(p.lab||'—')+' lab')+'</div></div>'
      +'<span style="color:#c2c7cd;font-size:18px;flex:none">＋</span></div>';
  }).join('');
  body.innerHTML=
    bkSectionHtml()
   +'<div style="margin:14px 16px 0;padding:11px 13px;border:1px solid var(--line);border-radius:12px">'
   +'<div style="font:800 13px \'Archivo\';color:var(--ink)">'+esc(APP_ADMIN.name)+' holds the app today</div>'
   +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:3px;line-height:1.45">Handing off moves the App Manager account — faculty records, roles and accounts — to whoever you name below. You lose it the moment you confirm, so make sure they are expecting it.</div></div>'
   +'<div class="sec">Hand it to</div><div class="list">'
   +'<div class="fld"><span class="fl">Name</span><input class="inv-in" id="axf-name" placeholder="Full name" style="max-width:200px"></div>'
   +'<div class="fld" style="border-bottom:none"><span class="fl">Email</span><input class="inv-in" id="axf-email" placeholder="name@utk.edu" style="max-width:210px"></div></div>'
   +'<div class="sec">Or pick someone already on the roster</div><div class="list">'+pick+'</div>'
   +'<div style="height:20px"></div>';
}
document.getElementById('s-adminxfer').addEventListener('click',function(e){
  var bk=e.target.closest('[data-bk]');
  if(bk){
    var act=bk.getAttribute('data-bk');
    if(act==='json') bkExportJson();
    else if(act==='csv') bkExportCsv();
    else if(act==='pick') bkPickFile();
    else if(act==='clearmap') mapClearOverrides();
    else if(act==='go'){
      /* Same two-tap arming as the hand-off button — a restore is not undoable. */
      if(!_bkArmed){ _bkArmed=true; axfRender(); setTimeout(function(){ if(_bkArmed){ _bkArmed=false; axfRender(); } },4000); }
      else bkRestore();
    }
    return;
  }
  var r=e.target.closest('[data-axf]'); if(!r)return;
  var p=rstFind(r.getAttribute('data-axf')); if(!p)return;
  axfPid=p.id; axfArmed=false;
  document.getElementById('axf-name').value=pName(p);
  document.getElementById('axf-email').value=p.email||'';
  var btn=document.getElementById('axf-save');
  btn.textContent='Hand off app administration'; btn.style.background='';
  toast(pName(p)+' filled in — confirm below');
});
document.getElementById('axf-save').addEventListener('click',function(){
  var nEl=document.getElementById('axf-name'), eEl=document.getElementById('axf-email');
  var name=nEl?nEl.value.trim():'', email=eEl?eEl.value.trim():'';
  if(!name){toast('Name the person taking it on');return;}
  if(email&&email.indexOf('@')<0){toast('That email address looks wrong');return;}
  if(!axfArmed){
    axfArmed=true;
    this.textContent='Tap again to hand the app to '+name;
    this.style.background='#c0392b';
    var self=this;
    setTimeout(function(){if(axfArmed){axfArmed=false;self.textContent='Hand off app administration';self.style.background='';}},4000);
    return;
  }
  var d=new Date();
  APP_ADMIN={name:name,email:email,pid:axfPid||null,since:d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)};
  axfArmed=false; rstAdminSave(); rstBuildAdminUser(); rstPaintRolesCard();
  toast('App administration handed to '+name+' ✓');
  stack.length=0; show('profile',true);
});


/* ---- semesters ----------------------------------------------------
   The farm's own list, edited on More -> Farm settings. It used to be three
   hardcoded strings ('Fall 2026' / 'Spring 2027' / 'Summer 2027') with no
   dates attached: stale within a year, and unfixable by anybody who cannot
   edit the code. The DATES are the part that earns its keep -- they are what
   lets the app answer "which term is today in", and therefore "who is coming
   in on Thursday". Registered in STORE_DEFS, so it backs up and restores. */
var SEM_MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var SEM_ISO=/^\d{4}-\d{2}-\d{2}$/;
var FARM_SEMS=[
 {id:'sem-f26', name:'Fall 2026',   start:'2026-08-19', end:'2026-12-11'},
 {id:'sem-s27', name:'Spring 2027', start:'2027-01-13', end:'2027-05-07'},
 {id:'sem-u27', name:'Summer 2027', start:'2027-05-17', end:'2027-08-07'}
];
/* The terms as they ship. Captured here, at the declaration, because
   storeHydrate() later fills FARM_SEMS in place from this phone's saved copy --
   so by the time anything else runs, the built-in list is gone unless it was
   kept. Farm settings sync needs it for the same reason the sprayer, mowers and
   labs need theirs: to tell "nobody has changed this" apart from "somebody set
   it to exactly this", which is the difference between seeding the shared copy
   and quietly overwriting it with defaults. */
var _semBase=JSON.stringify(FARM_SEMS);
function semIsDefault(){
  try{ return JSON.stringify(FARM_SEMS)===_semBase; }catch(e){ return false; }
}
function semOrd(v){ if(typeof v!=='string'||!SEM_ISO.test(v)) return 0; var p=v.split('-'); return (+p[0])*10000+(+p[1])*100+(+p[2]); }
function semDateOrd(d){ d=d||new Date(); return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(); }
function semValid(x){ return !!(x&&typeof x==='object'&&typeof x.name==='string'&&x.name.trim()&&semOrd(x.start)&&semOrd(x.end)&&semOrd(x.end)>=semOrd(x.start)); }
function semSorted(){ return FARM_SEMS.filter(semValid).sort(function(a,b){ return semOrd(a.start)-semOrd(b.start); }); }
function semNames(){ return semSorted().map(function(s){ return s.name; }); }
function semFind(n){ for(var i=0;i<FARM_SEMS.length;i++) if(FARM_SEMS[i]&&FARM_SEMS[i].name===n) return FARM_SEMS[i]; return null; }
function semDateLabel(v){ if(!semOrd(v)) return '--'; var p=v.split('-'); return SEM_MON[(+p[1])-1]+' '+(+p[2])+', '+p[0]; }
/* Which term a date falls inside, or nothing. Between terms the honest answer
   is that nobody is scheduled -- carrying last term's hours through the winter
   break would put names on Bill's board for days the farm is shut. */
function semForDate(d){
  var o=semDateOrd(d||new Date()), list=semSorted();
  for(var i=0;i<list.length;i++) if(o>=semOrd(list[i].start)&&o<=semOrd(list[i].end)) return list[i];
  return null;
}
/* What the profile dropdown opens on: the term we are in, else the next one to
   start, else the last on the list. Never nothing, so the screen always draws. */
function semCurrent(){
  var now=semForDate(new Date()); if(now) return now;
  var o=semDateOrd(new Date()), list=semSorted();
  for(var i=0;i<list.length;i++) if(semOrd(list[i].start)>o) return list[i];
  return list.length?list[list.length-1]:null;
}
function semCurrentName(){ var s=semCurrent(); return s?s.name:''; }

/* ---- weekly schedules ---------------------------------------------
   What each undergrad says their standing hours are: one record per person per
   term. This used to be a single localStorage key named after the ROLE --
   'ut_sched_undergrad_Fall 2026' -- so every undergrad who touched the same
   phone overwrote the others, which is the mistake the per-person prefs rule
   was written to stop. And nothing outside the profile screen ever read it, so
   filling it in achieved nothing.

   It is keyed on the roster id now, and it is a real store: it backs up,
   restores and syncs like every other drawer, and Bill's day board is built
   from it. */
var SCHED_DAYS=['Mon','Tue','Wed','Thu','Fri'];
var SCHED_DAYFULL={Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday'};
var SCHED_BYDOW={1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri'};
var SCHEDULES=[];
var schedSem=null;   /* set on first render, once the semester list has loaded */

function schedDefault(){ var d={}; SCHED_DAYS.forEach(function(k){ d[k]={on:false,start:'08:00',end:'12:00'}; }); return d; }
function schedToMin(t){ var p=(t||'').split(':'); var h=+p[0],m=+p[1]; return (isFinite(h)?h:0)*60+(isFinite(m)?m:0); }
function schedFmt(t){ if(!t) return ''; var p=t.split(':'),h=+p[0],m=p[1]; var ap=h<12?'a':'p'; var hh=h%12; if(hh===0)hh=12; return hh+':'+m+ap; }
/* One id per person per term, built from both, so saving twice updates the
   same record instead of laying down a second one. */
function schedRecId(pid,sem){ return 'sch-'+String(pid)+'-'+String(sem||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function schedRec(pid,sem){ var id=schedRecId(pid,sem); for(var i=0;i<SCHEDULES.length;i++) if(SCHEDULES[i]&&SCHEDULES[i].id===id) return SCHEDULES[i]; return null; }
/* Always a full five-day object, whatever is stored -- a record written before
   a day existed, or half-arrived from the database, still draws. */
function schedDaysOf(pid,sem){
  var r=schedRec(pid,sem), out=schedDefault();
  if(r&&r.days&&typeof r.days==='object'){
    SCHED_DAYS.forEach(function(k){
      var d=r.days[k];
      if(d&&typeof d==='object') out[k]={on:!!d.on,start:d.start||'08:00',end:d.end||'12:00'};
    });
  }
  return out;
}
function schedSave(pid,sem,days){
  if(!pid||!sem) return null;
  var r=schedRec(pid,sem);
  if(!r){ r={id:schedRecId(pid,sem),pid:String(pid),sem:String(sem)}; SCHEDULES.push(r); }
  r.days=days; r.updatedAt=isoLocal(new Date(),true); r.updatedBy=SESSION.pid||null;
  try{ storeTouch(); }catch(e){}
  return r;
}
function schedTotals(data){
  var mins=0,days=0;
  SCHED_DAYS.forEach(function(k){ var d=data[k]; if(d&&d.on){ var a=schedToMin(d.start),b=schedToMin(d.end); if(b>a){ mins+=b-a; days++; } } });
  return {hrs:Math.round(mins/6)/10,days:days};
}

/* THE question every other screen asks: is this person down to be here on this
   date, and between what times. ONE function, so the day board, the task
   board, the assign picker and the time clock can never disagree about who is
   in. Returns null for a weekend, a day they marked off, a term they have not
   filled in, and any date that falls between terms. */
function schedShiftOn(pid,d){
  if(!pid||!d) return null;
  var k=SCHED_BYDOW[d.getDay()]; if(!k) return null;
  var sem=semForDate(d); if(!sem) return null;
  var day=schedDaysOf(pid,sem.name)[k];
  if(!day||!day.on) return null;
  if(schedToMin(day.end)<=schedToMin(day.start)) return null;
  return {start:day.start,end:day.end,sem:sem.name};
}
function schedShiftLabel(pid,d){ var s=schedShiftOn(pid,d); return s?(schedFmt(s.start)+'–'+schedFmt(s.end)):''; }
function schedHrsOn(pid,d){ var s=schedShiftOn(pid,d); return s?Math.round((schedToMin(s.end)-schedToMin(s.start))/6)/10:0; }
/* Everyone down for a date, roster order kept. */
function schedCrewOn(d){
  var out=[];
  try{ rstUndergradIds().forEach(function(p){ if(schedShiftOn(p,d)) out.push(p); }); }catch(e){}
  return out;
}
/* Has this person filled ANYTHING in for the term covering this date? Lets a
   screen say "has not set their hours yet" rather than "off today" -- very
   different things to whoever is handing out the work. */
function schedHasAny(pid,d){
  var sem=semForDate(d||new Date()); if(!sem) return false;
  var days=schedDaysOf(pid,sem.name);
  for(var i=0;i<SCHED_DAYS.length;i++) if(days[SCHED_DAYS[i]].on) return true;
  return false;
}

/* ---- the profile screen ---- */
/* True while someone has a day-time box open on their own schedule screen --
   including the phone's own time wheel, which the OS anchors to that box.
   Rebuilding the row out from under it (which a remote repaint does) kills
   the wheel mid-pick, so a repaint arriving from someone else's schedule
   syncing in has to wait rather than barge in. The data itself is not
   delayed, only the repaint -- the next thing the person does (pick a time,
   flip a day, leave and come back) draws with whatever landed meanwhile. */
function schedIsEditing(){
  var w=document.getElementById('pf-sched-wrap');
  var a=document.activeElement;
  return !!(w&&a&&w.contains(a)&&a.tagName==='INPUT');
}
function renderProfileSchedule(){
  var w=document.getElementById('pf-sched-wrap'); if(!w) return;
  if(currentRole!=='undergrad'){ w.style.display='none'; w.innerHTML=''; return; }
  w.style.display='block';
  if(!schedSem||!semFind(schedSem)) schedSem=semCurrentName();
  renderSchedule();
}
function renderSchedule(){
  var w=document.getElementById('pf-sched-wrap'); if(!w) return;
  var names=semNames();
  if(!names.length){
    w.innerHTML='<div class="sec" style="margin:18px 16px 7px">My weekly schedule</div>'
      +'<div class="sched-note">No semester dates have been set up yet, so there is nothing to fill in against. '
      +'Whoever looks after the app can add them on More &rarr; Farm settings &rarr; Semester dates.</div>';
    return;
  }
  if(!schedSem||names.indexOf(schedSem)<0) schedSem=semCurrentName()||names[0];
  var pid=SESSION.pid;
  var data=schedDaysOf(pid,schedSem);
  var sems=names.map(function(x){ return '<option'+(x===schedSem?' selected':'')+'>'+esc(x)+'</option>'; }).join('');
  var rows=SCHED_DAYS.map(function(k){
    var d=data[k];
    var times=d.on?('<div class="sched-times"><input type="time" class="sched-in" data-day="'+k+'" data-f="start" value="'+d.start+'"><span class="sched-dash">-</span><input type="time" class="sched-in" data-day="'+k+'" data-f="end" value="'+d.end+'"></div>'):'';
    return '<div class="sched-day"><div class="sched-dhead"><span class="sched-dname">'+SCHED_DAYFULL[k]+'</span><span class="sched-status">'+(d.on?'':'Unavailable')+'</span><span class="tgl sched-tgl'+(d.on?' on':'')+'" data-day="'+k+'"></span></div>'+times+'</div>';
  }).join('');
  var t=schedTotals(data);
  var sem=semFind(schedSem);
  var when=sem?(semDateLabel(sem.start)+' - '+semDateLabel(sem.end)):'';
  /* The old screen carried a "Save schedule" button that did nothing but raise
     a toast -- every change was already written the moment it was made. Saying
     so plainly beats a button pretending to be the thing that saves. */
  w.innerHTML=
     '<div class="sec" style="margin:18px 16px 7px">My weekly schedule</div>'
    +'<div class="list"><div class="fld"><span class="fl">Semester</span><select id="sched-sem" class="sched-sel">'+sems+'</select></div>'
    +(when?'<div class="fld" style="border-bottom:none"><span class="fl">Term runs</span><span class="fv">'+esc(when)+'</span></div>':'')+'</div>'
    +'<div class="list" style="margin-top:8px">'+rows+'</div>'
    +'<div class="sched-sum"><span>'+t.hrs+' hrs/week</span><span class="sub">&middot; '+t.days+' day'+(t.days===1?'':'s')+'</span></div>'
    +'<div class="sched-note">Your standard weekly hours for '+esc(schedSem)+'. Tap a day to turn it on or off, then set your times. '
    +'Every change saves as you make it &mdash; there is nothing to press. Bill sees these hours on his day board when he hands out work, '
    +'so keep them up to date if your classes change.</div>';
  attachSchedule();
}
function attachSchedule(){
  var w=document.getElementById('pf-sched-wrap'); if(!w) return;
  var pid=SESSION.pid;
  var sel=w.querySelector('#sched-sem');
  if(sel) sel.addEventListener('change',function(){ schedSem=this.value; renderSchedule(); });
  w.querySelectorAll('.sched-tgl').forEach(function(tg){
    tg.addEventListener('click',function(e){
      e.stopPropagation();
      var k=this.getAttribute('data-day'), data=schedDaysOf(pid,schedSem);
      data[k].on=!data[k].on;
      schedSave(pid,schedSem,data); renderSchedule();
    });
  });
  w.querySelectorAll('.sched-in').forEach(function(inp){
    inp.addEventListener('change',function(){
      var k=this.getAttribute('data-day'), fld=this.getAttribute('data-f'), v=this.value;
      var data=schedDaysOf(pid,schedSem);
      data[k][fld]=v;
      /* An end time that is not after the start is not a shift. Nudge it out an
         hour rather than storing something every reader has to guard against. */
      if(fld==='start'&&schedToMin(data[k].end)<=schedToMin(v)){
        var nm=schedToMin(v)+60, hh=('0'+(Math.floor(nm/60)%24)).slice(-2), mm=('0'+(nm%60)).slice(-2);
        data[k].end=hh+':'+mm;
      }
      schedSave(pid,schedSem,data); renderSchedule();
    });
  });
}
/* The avatar used to be found by sniffing its inline style for border-radius.
   The home banner's avatar now carries .hh-av and gets its shape from CSS, so
   that sniff missed it and the circle went dead. Match the class first and
   keep the style probe for the headers that still spell it out inline. */
document.querySelectorAll('.hdr').forEach(h=>{h.querySelectorAll('span').forEach(s=>{if(s.textContent.trim()==='🔔'){s.classList.add('tap','bellwrap');s.setAttribute('data-go','notifications');}});const av=h.querySelector('span.hh-av, span[style*="border-radius:50%"]');if(av){av.classList.add('tap');av.setAttribute('data-go','profile');}});
const NOTIFS=[
 /* Empty on purpose — see TASKS. Held 6 sample notifications. */
];
function getSeen(){try{return +localStorage.getItem('ut_seen')||0;}catch(e){return 0;}}
function setSeen(v){try{localStorage.setItem('ut_seen',v);}catch(e){}}
/* Unread count sits on the bell instead of a banner down the page. */
function updateBellBadges(){
  var c=newCount();
  document.querySelectorAll('.bellwrap').forEach(function(b){
    var d=b.querySelector('.nbadge');
    if(!c){ if(d) d.remove(); return; }
    if(!d){ d=document.createElement('i'); d.className='nbadge'; b.appendChild(d); }
    d.textContent=c>99?'99+':c;
  });
}
function renderHomeNotif(){ updateBellBadges(); }
function _oldRenderHomeNotif(){var el=document.getElementById('homenotif');if(!el)return;var seen=getSeen()||(Date.now()-12*3600e3),now=Date.now();var nw=NOTIFS.filter(function(n){return (now-n.h*3600e3)>seen;});if(!nw.length){el.style.display='none';el.innerHTML='';return;}var rows=nw.map(function(n){return '<div class="row"><span class="dot" style="background:'+n.c+'"></span><div style="flex:1"><div class="rt">'+n.t+'</div><div class="rs">'+n.s+'</div></div><span class="rs" style="flex:none">'+n.time+'</span></div>';}).join('');rows+='<div class="row tap" data-go="notifications" style="justify-content:center"><div class="rt" style="color:var(--acc)">View all notifications ›</div></div>';el.innerHTML='<div class="list" style="margin:0">'+rows+'</div>';el.style.display='block';}
function newCount(){var seen=getSeen()||(Date.now()-12*3600e3),now=Date.now();return NOTIFS.filter(function(n){return (now-n.h*3600e3)>seen;}).length;}
function updateNewBanner(){var el=document.getElementById('newnotif');if(!el)return;var c=newCount();if(c>0){document.getElementById('newnotif-t').textContent=c+' new since your last visit';el.style.display='flex';}else{el.style.display='none';}}
const kpiMap={'Open':'taskboard','Restrict':'map','Low':'inventory','Down':'equipment'};
document.querySelectorAll('#s-home-manager .kpi').forEach(k=>{const l=k.querySelector('.l');const d=l&&kpiMap[l.textContent.trim()];if(d){k.classList.add('tap');k.setAttribute('data-go',d);}});
/* The old quiet-hours handler lived here and toggled a class on static markup —
   nothing was ever written down, so every switch on the Notifications screen
   reset on reload. The screen is rendered from NOTIF_DEF below now and saves to
   the person's prefs bucket like everything else. */
document.querySelectorAll('#s-fieldlog .hdr > div, #s-tasknew .hdr > div').forEach(d=>{ if(d.textContent.trim()==='‹'){ d.classList.add('backbtn','tap'); }});
app.addEventListener('click',e=>{
 const seg=e.target.closest('.seg span'); if(seg){ seg.parentElement.querySelectorAll('span').forEach(s=>s.classList.remove('on')); seg.classList.add('on'); } var tg=e.target.closest('.tgl'); if(tg){tg.classList.toggle('on');return;}
 if(e.target.closest('.backbtn')){ back(); return; }
 const g=e.target.closest('[data-go]');
 if(g){ const r=g.getAttribute('data-setrole'); if(r)currentRole=r; const tm=g.getAttribute('data-toast'); if(tm)toast(tm); go(g.getAttribute('data-go')); return; }
 const tEl=e.target.closest('[data-toast]'); if(tEl){ toast(tEl.getAttribute('data-toast')); return; }
 const tab=e.target.closest('.tab'); if(tab){ const lbl=tab.textContent.replace(/[^A-Za-z]/g,''); const d=(navMap[currentRole]||{})[lbl]; if(d)goRoot(d); return; }
 const hub=e.target.closest('.hub'); if(hub){ const ti=hub.querySelector('.t'); const d=ti&&hubMap[ti.textContent.trim()]; if(d)go(d); return; }
});
document.querySelectorAll('.mapvp[data-panzoom]').forEach(vp=>{ const inner=vp.querySelector('.mapinner'); if(!inner)return; let s=1,x=0,y=0,drag=false,px,py; const apply=()=>inner.style.transform='translate('+x+'px,'+y+'px) scale('+s+')';
 vp.addEventListener('pointerdown',e=>{drag=true;px=e.clientX;py=e.clientY;});
 window.addEventListener('pointermove',e=>{if(!drag)return;x+=e.clientX-px;y+=e.clientY-py;px=e.clientX;py=e.clientY;apply();});
 window.addEventListener('pointerup',()=>drag=false);
 vp.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();s*=b.getAttribute('data-zoom')==='in'?1.3:1/1.3;s=Math.max(.6,Math.min(4,s));apply();}));
});

/* ---- Task Board: role-aware ---- */
const STUDENTS=rstUndergradIds();   /* live view of the roster's undergrads, as ids */
/* Board seed comes straight off the farm's task list. Nine of these are the
   plot jobs an undergrad actually starts from the map, and between them they
   run into all eight restriction types the trials can place — mow, fungicide,
   herbicide, insecticide, fertilizer, wetting, irrigate and cultivate — so the
   restriction handling is visible without hunting for a plot. */
let TASKS=[
 /* Empty on purpose. The demo jobs were removed 2026-08-24 — Dillon asked
    that nothing but the equipment list, the roster and the task catalog ship
    pre-loaded. Seeded rows would also multiply at migration: 23 phones each
    uploading the same fake task into the shared copy. */
];
let tbTab='board';
var WEEKDAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var WEEKDAYS_FULL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
/* Weekends are never on the board -- nobody works Saturday or Sunday, so
   opening the board then shows Monday instead of a day with no chip to
   match it. */
function boardDefaultDay(){var d=new Date().getDay();return (d===0||d===6)?1:d;}
var boardDay=boardDefaultDay();
function boardOrdFor(dow){var t=asToday0();for(var i=0;i<7;i++){var d=new Date(t);d.setDate(d.getDate()+i);if(d.getDay()===dow)return asOrd(d);}return asTodayOrd();}
function boardDayOrd(){return boardOrdFor(boardDay);}
/* The day a task belongs to, as YYYYMMDD. dueAt is the stored field; dueOrd is
   kept because the assign wizard and the day chips do plain integer comparison
   on it, and deriving it here means the two can never disagree. */
function taskOrd(t){ return (t&&t.dueAt)?ordOfISO(t.dueAt):((t&&t.dueOrd)||0); }
function taskOnDay(t){var o=taskOrd(t); if(o)return o===boardDayOrd(); return boardDay===new Date().getDay();}
/* Both spellings ship in the markup and CSS picks one. The board is re-rendered
   on navigation, not on resize, so a JS choice made at render time would stay
   wrong until you left the screen and came back. */
function boardDayChips(){var todayDow=new Date().getDay();return '<div class="chiprow" id="tb-days" style="padding:8px 12px 2px">'+[1,2,3,4,5].map(function(i){var w=WEEKDAYS[i];var isToday=(i===todayDow);return '<span class="chip'+(boardDay===i?' on':'')+(isToday?' today':'')+'" data-bday="'+i+'"'+(isToday?' title="Today"':'')+'><span class="dl-s">'+w+'</span><span class="dl-f">'+WEEKDAYS_FULL[i]+'</span>'+(isToday?'<span class="todot"></span>':'')+'</span>';}).join('')+'</div>';}
function tbTaskRow(t,n,isFirst){
 var num=n?'<span style="width:22px;height:22px;border-radius:7px;background:#2f3133;color:#fff;font:800 12px \'Archivo\';display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start;margin-top:1px">'+n+'</span>':'';
 var note=t.desc?'<div class="rs" style="margin-top:4px;color:#7b828d;line-height:1.4">'+esc(t.desc)+'</div>':'';
 var start=isFirst?'<span class="startbtn tap" data-start="'+t.id+'">Start ›</span>':'';
 return '<div class="row" style="align-items:flex-start">'+num+'<div style="flex:1;min-width:0"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+areaWithDue(t)+'</div>'+note+'</div>'+start+'</div>';
}
function tbPoolRow(t){
 return '<div class="row"><div class="tap" data-task="'+t.id+'" style="flex:1"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+esc(taskBoardSub(t))+'</div></div><span class="pill tap" data-claim="'+t.id+'" style="background:var(--acc);color:#fff;padding:5px 12px;font-size:10.5px">Claim</span></div>';
}
function tbDoneRow(t){
 return '<div class="row tap" data-task="'+t.id+'"><span style="color:#2f9e4f;font-size:16px;flex:none">✓</span><div style="flex:1"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+esc(taskBoardSub(t))+' · '+t.completedBy+' · '+t.completedAt+'</div></div></div>';
}
function tbReqRow(t){
 var needs=(t.students&&t.students>1)?' · needs '+t.students:'';
 return '<div class="row"><div class="tap" data-task="'+t.id+'" style="flex:1"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+esc(reqByLabel(t.requestedBy))+needs+'</div></div><span class="pill tap" data-task="'+t.id+'" style="background:var(--acc);color:#fff;padding:5px 12px;font-size:10.5px">Assign ›</span></div>';
}
function meName(){ return me().n; }
/* A job can carry more than one person — the alley mow and the trial dots both
   go out to two or three, who split the ground zone by zone on the shared map.
   `assignee` stays the primary name every existing screen already reads, and
   `helpers` is everyone else on it. */
/* The people on a job, as roster ids. Callers that want names run it through
   namesOf(); callers that want to know whether it is yours use isMe(). */
function taskCrew(t){ return t?[t.assignee].concat(t.helpers||[]).filter(Boolean):[]; }
/* ---- who may do what with a task ----
   ONE function, deliberately. This rule is the farm's organisation chart, not
   a interface preference, and it has to read identically in both places it is
   enforced: the buttons the app offers, and the rules the database applies.
   Two copies of it would drift, and the copy that drifts is the one that lets
   somebody put work on a person who does not answer to them.

   The shape of it, in Dillon's words (2026-08-24):

     - Grad students and technicians answer to their FACULTY ADVISOR, not to
       the Farm Manager. So Bill may direct an undergrad, but he may only ASK
       a tech or a grad student — a request they pick up, or leave.
     - Faculty may direct their own lab's techs and grad students, and only
       their own lab's.
     - Undergrad labour is pooled. Nobody hands out an undergrad except
       whoever is holding that job, which is normally Bill - UNLESS the
       undergrad belongs to a lab, in which case that lab directs them.

   That last one is a GRANT on a person rather than a test for the words "Farm
   Manager", because it moves: Dillon holds it today, and Bill needs to be able
   to hand it to someone while he is away. */
var GRANT_ASSIGN_UNDERGRADS='assign_undergrads';

function personOf(x){ var id=pidOf(x); return id?rstFind(id):null; }
function personRole(x){ var p=personOf(x); return p?p.role:null; }
function personLab(x){ var p=personOf(x); var l=p&&p.lab; return (l&&l!=='—')?l:null; }
function personActive(x){ var p=personOf(x); return !!(p&&p.active!==false); }
function personHas(x,grant){
  var p=personOf(x);
  return !!(p&&p.grants&&p.grants.indexOf(grant)>=0);
}

/* ---- who may change Farm settings -----------------------------------------
   Three lines, all read off the ROSTER rather than currentRole. currentRole is
   screen state the database cannot see, so any gate that consults it is
   guaranteed to drift from its transcription in firestore.rules -- the bug
   already caught in schedCanEdit() and trAccess().

   The App Manager post rides on the sign-in TOKEN (`app_admin`), not on the
   roster, which is the one thing here the database can also see for itself.
   That is why it is allowed to sit beside a roster question.

   Dillon, 2026-08-26: faculty get the run of Farm settings, on top of the
   lines that were already there.

     fstCanEditKit()   the sprayer numbers and the mower list -- the people who
                       actually spray and mow. Everybody but the undergraduates.
     fstCanEditLists() the labs and the semester dates -- the two lists that
                       decide who belongs where and when the farm is running.
                       Bill, faculty, or the App Manager.
     fstCanEditBugs()  where the crew's bug reports are delivered. Bill or the
                       App Manager only -- see the note above the function. */
function fstRole(){
  if(!SESSION.pid) return null;
  if(typeof personActive==='function'&&!personActive(SESSION.pid)) return null;
  return (typeof personRole==='function')?personRole(SESSION.pid):null;
}
function fstCanEditKit(){
  if((typeof rstIsAdmin==='function')&&rstIsAdmin()) return true;
  var r=fstRole();
  return !!r && r!=='Undergraduate Student';
}
function fstCanEditLists(){
  if((typeof rstIsAdmin==='function')&&rstIsAdmin()) return true;
  var r=fstRole();
  return r==='Farm Manager' || r==='Faculty';
}
/* Where the crew's bug reports get delivered. Narrower than the other two on
   purpose: this is not a farm setting, it is who maintains the app, and the
   screen has always said "ask Bill or the app manager". Faculty are out.

   It reads the roster like its two neighbours. It used to ask currentRole,
   which is only which screen is showing -- so a manager who had tapped into
   another view lost the ability to change it, and the database, which cannot
   see currentRole at all, had nothing it could copy. */
function fstCanEditBugs(){
  if((typeof rstIsAdmin==='function')&&rstIsAdmin()) return true;
  return fstRole()==='Farm Manager';
}
function assignsUndergrads(x){
  return personRole(x)==='Farm Manager' || personHas(x,GRANT_ASSIGN_UNDERGRADS);
}
/* Two people share a lab only if they actually have one. A blank lab is the
   shared undergrad pool, not a lab everyone is in together. */
function sameLab(a,b){ var la=personLab(a); return !!la && la===personLab(b); }

function taskCan(actor,action,task){
  var me=pidOf(actor);
  if(!me || !personActive(me)) return false;
  var role=personRole(me); if(!role) return false;
  var t=task||{};
  var target=pidOf(t.assignee);
  var UG='Undergraduate Student';

  switch(action){
    /* Undergrads do the work they are given; they do not raise it. */
    case 'create':
    case 'request':
      return role!==UG;

    /* Putting a NAMED person on a job. Everything above turns on this. */
    case 'assign':
      if(!target) return false;
      if(target===me) return role!==UG;                     /* taking it yourself */
      if(personRole(target)===UG){
        if(assignsUndergrads(me)) return true;
        /* THE LAB-ASSIGNED EXCEPTION - Dillon, 2026-08-25.
           An undergrad who belongs to a lab answers to that lab, so anybody
           in it above undergrad may direct them - faculty, grad students and
           technicians alike. The pooled undergrads carry Bill's own lab, so
           the pool is untouched by this and still goes through him. */
        return role!==UG && sameLab(me,target);
      }
      if(role==='Faculty'){
        var tr=personRole(target);
        return (tr==='Graduate Student'||tr==='Technician') && sameLab(me,target);
      }
      return false;                                          /* Bill included: he asks */

    /* Picking up something nobody is on. Undergrads never see the pool. */
    case 'claim':
      if(t.assignee) return false;
      return role==='Graduate Student' || role==='Technician' || assignsUndergrads(me);

    /* The worker closes their own; Bill can close on their behalf, and the
       credit still goes to the worker (completedBy) not the closer. */
    case 'complete':
      return taskIsFor(t,me) || assignsUndergrads(me);

    /* Bill, whoever is holding the undergrad-assignment job in his place, the
       person who raised the job, or faculty over work sitting on their own
       lab's person. assignsUndergrads() is Bill AND the deputy in one test,
       which is exactly how 'claim' and 'complete' above already read.
       Widened on 2026-08-31 to include the deputy: before that, a job that
       landed on anybody but an undergrad had nobody who could remove it if
       Bill had not raised it himself. See docs/DECISIONS.md. */
    case 'edit':
    case 'delete':
      if(assignsUndergrads(me)) return true;
      if(pidOf(t.createdBy)===me) return true;
      if(role==='Faculty' && target && sameLab(me,target)) return true;
      return false;
  }
  return false;
}

/* ---- who may change the map ----
   ONE function, for the same reason taskCan() is one function: this is now a
   rule the database enforces as well as the app, and two copies of it would
   drift.

   Dillon, 2026-08-25: **anyone but an undergrad.** Before this the app had
   three different answers — reshaping needed Bill or faculty, a cut height
   needed a technician or grad student, and the plot information form was not
   gated at all. That was not a decision anybody made, it was how it grew. One
   rule is easier to explain, and the thing it protects against is a wrong
   number staying wrong because the person who spotted it had to go and find
   somebody.

   Actions: 'shape' (draw, reshape, delete a plot) · 'info' (turfgrass,
   cultivar, area, rootzone) · 'mowing' (mower, cut height, irrigation heads).
   They take the same answer today; they are named separately so that if the
   farm ever wants them to differ, this is the only place that changes. */
function mapCan(actor,action){
  var me=pidOf(actor)||SESSION.pid;
  if(!me||!personActive(me)) return false;
  var role=personRole(me); if(!role) return false;
  if(role==='Undergraduate Student') return false;
  return action==='shape'||action==='info'||action==='mowing';
}

function taskIsFor(t,who){ var id=pidOf(who); return !!t&&!!id&&taskCrew(t).indexOf(id)>=0; }
function taskCrewLabel(t){
  var c=namesOf(taskCrew(t));
  if(!c.length) return 'Unassigned (pool)';
  return c.length===1?c[0]:(c[0]+' +'+(c.length-1)+' · '+c.slice(1).join(', '));
}
function reqRoleLabel(){return currentRole==='grad'?'Grad student':(currentRole==='tech'?'Technician':(currentRole==='faculty'?'Faculty':'Staff'));}
/* requestedBy holds a roster id. It used to hold "Rose Gibbons · Grad student"
   — the name and the job baked into one string — which meant a promotion or a
   rename left every request they had ever filed describing the old person. */
function reqByLabel(x){ var n=nameOf(x); if(!n)return '—'; var t=titleOf(x); return t?(n+' · '+t):n; }
var CREW=rstCrewList();   /* live view of the roster's grads + technicians */
/* The lab a task board filters to. The signed-in person's own lab, falling
   back to the role default only when the roster has none on file. */
function tbLabKey(){ var l=(typeof myLab==='function')?myLab():''; 
  if(l&&l!=='—')return l;
  return (typeof ROLE_LAB!=='undefined'&&ROLE_LAB[currentRole])||''; }
function labMembers(){var lab=tbLabKey();return CREW.filter(function(c){return (c.role==='Grad student'||c.role==='Technician')&&c.lab===lab;});}
function crewPill(c,on){return '<span class="ppill'+(on?' on':'')+'" data-person="'+esc(c.pid)+'"><span class="ppn"><span class="dotsm"></span>'+esc(c.name)+'</span><span class="ppt">'+esc(c.role)+'</span></span>';}
function isCrew(n){var id=pidOf(n);return !!id&&CREW.some(function(c){return c.pid===id;});}
function isUndergrad(n){var id=pidOf(n);return !!id&&STUDENTS.indexOf(id)>=0;}
function receivedRow(t){return '<div class="row"><div style="flex:1;min-width:0"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+(t.area&&t.area!=='—'?t.area+' · ':'')+'from Bill</div></div><span class="pill tap" data-accept="'+t.id+'" style="background:#2f9e4f;color:#fff;flex:none">Accept ✓</span></div>';}
function billSentRow(t){var done=t.status==='done';var pending=(t.kind==='request');var pill=done?'<span class="pill" style="background:#eaf3ea;color:#2f9e4f;flex:none">✓ Done</span>':(pending?'<span class="pill" style="background:#fff4e0;color:#9a5b00;flex:none">Pending</span>':'<span class="pill" style="background:#489FDF;color:#fff;flex:none">Accepted</span>');return '<div class="row"><div style="flex:1;min-width:0"><div class="rt">'+esc(t.title)+'</div><div class="rs">→ '+(t.target||'')+'</div></div>'+pill+'</div>';}
function acceptCrewReq(id){var t=TASKS.find(function(x){return x.id===id;});if(!t)return;t.kind='task';t.assignee=pidOf(t.target);t.status='todo';toast('Accepted ✓');renderBoard();}
function numBadge(n){return '<span style="width:22px;height:22px;border-radius:7px;background:#2f3133;color:#fff;font:800 12px \'Archivo\';display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start;margin-top:1px">'+n+'</span>';}
function roRow(lead,title,sub){return '<div class="row" style="align-items:flex-start">'+(lead||'')+'<div style="flex:1;min-width:0"><div class="rt">'+title+'</div><div class="rs">'+sub+'</div></div></div>';}
function renderBoard(){
 var seg=document.getElementById('tb-seg'); if(!seg)return;
 var mgr=currentRole==='manager';
 var viewer=currentRole==='faculty';
 var boardView=mgr||viewer;
 var requester=(currentRole==='grad'||currentRole==='tech');
 /* Bill gets a Mine tab because he can put work on his own plate from the
    Assign screen; faculty have no route to self-assign, so theirs would only
    ever be empty. */
 var tabs=boardView?(mgr?[['board','Board'],['mine','Mine'],['completed','Completed'],['requests','Requests']]
                        :[['board','Board'],['completed','Completed'],['requests','Requests']])
   :(requester?[['mine','Mine'],['open','Open'],['requests','My Requests']]:[['mine','Mine'],['open','Open']]);
 if(!tabs.some(function(x){return x[0]===tbTab;})) tbTab=tabs[0][0];
 seg.innerHTML=tabs.map(function(x){return '<span'+(x[0]===tbTab?' class="on"':'')+' data-tab="'+x[0]+'">'+x[1]+'</span>';}).join('');
 var ttl=document.querySelector('#s-taskboard .hdr .title'); if(ttl)ttl.textContent=boardView?'Task Board':'My Tasks';
 var ab=document.getElementById('tb-actionbar');
 /* "＋ Add Task" and "✎ Edit" both went to the task list -- one to a blank
    form, one to the list itself -- and neither put anything on the board,
    which is what "Add Task" plainly reads as. Both are gone: the list has its
    own button in the header now, with its own Add inside it, and the only
    thing left down here is the one that actually gives somebody work. */
 if(ab)ab.innerHTML=mgr?'<div class="boardbtns"><div class="action tap" data-board="assign" style="background:#2f3133">Assign Tasks</div></div>'
   :(viewer?'<div class="boardbtns"><div class="action tap" data-board="assignlab" style="background:#2f3133">Assign to my lab</div><div class="action tap" data-req="undergrad">＋ Request labor from Bill</div></div>'
   :(requester?'<div class="boardbtns"><div class="action tap" data-board="selftask" style="background:#2f3133">＋ Assign task to me</div><div class="action tap" data-req="undergrad">＋ Request labor from Bill</div></div>':''));
 renderTasks();
}
function boardEnter(){ tbTab=(currentRole==='manager'||currentRole==='faculty')?'board':'mine'; boardDay=boardDefaultDay(); renderBoard(); }
function simpleTaskRow(t){var note=t.desc?'<div class="rs" style="margin-top:4px;color:#7b828d;line-height:1.4">'+esc(t.desc)+'</div>':'';return '<div class="row tap" data-task="'+t.id+'" style="align-items:flex-start"><div style="flex:1;min-width:0"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+areaWithDue(t)+'</div>'+note+'</div><span style="color:#c2c7cd;font-size:17px;flex:none;align-self:center">›</span></div>';}
function gradReqRow(t){var done=t.status==='done';var pending=(t.kind==='request'&&!t.assignee);var pill=done?'<span class="pill" style="background:#eaf3ea;color:#2f9e4f;flex:none">✓ Done</span>':(pending?'<span class="pill" style="background:#fff4e0;color:#9a5b00;flex:none">Pending</span>':'<span class="pill" style="background:#489FDF;color:#fff;flex:none">→ '+t.assignee+'</span>');return '<div class="row"><div style="flex:1;min-width:0"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+(t.area||'')+'</div></div>'+pill+'</div>';}
function openGradReq(){var a=document.getElementById('gr-name');if(a)a.value='';var b=document.getElementById('gr-area');if(b)b.value='';var c=document.getElementById('gr-note');if(c)c.value='';go('gradreq');}
function submitGradReq(){var name=document.getElementById('gr-name').value.trim();if(!name){toast('Enter what you need');return;}var area=document.getElementById('gr-area').value.trim();var note=document.getElementById('gr-note').value.trim();TASKS.push({createdBy:SESSION.pid,id:newId('r'),title:name,area:area||'—',assignee:null,status:'todo',kind:'request',badge:null,type:'Miscellaneous',dueAt:atToday(null),repeat:'None',requestedBy:SESSION.pid,desc:note});toast('Request submitted ✓');back();tbTab='requests';renderBoard();}
function moveTask(id,dir){
 var t=TASKS.find(function(x){return x.id===id;}); if(!t)return;
 var grp=TASKS.filter(function(x){return x.assignee&&x.assignee===t.assignee&&x.status==='todo'&&x.kind==='task';});
 var p=grp.indexOf(t); var sw=dir==='up'?grp[p-1]:grp[p+1]; if(!sw)return;
 var i=TASKS.indexOf(t), j=TASKS.indexOf(sw); TASKS[i]=sw; TASKS[j]=t;
 renderBoard();
}
/* Getting rid of a job, from wherever it was reached. ONE function, because
   until 2026-08-31 the only route was the bin on Bill's board and the code
   for it lived inside that screen's click handler -- so a job the bin never
   draws was a job nothing in the app could remove. The bin only draws on
   somebody ELSE'S row on Bill's board, and that board only lists undergrads,
   which left every task on a technician, a grad student, faculty or Bill
   himself undeletable by anybody, forever. See docs/DECISIONS.md.

   Who may: taskCan(), same as everywhere else, and the same answer the
   database will give when the delete below reaches it.

   The removal is SENT STRAIGHT UP rather than left for the 2-second scan to
   notice the job has gone missing. tsyncScan() refuses to send anything when
   the list has emptied completely -- the right call for a list that emptied
   by accident, the wrong one for the last job somebody deliberately deleted,
   and on a farm whose board holds five jobs those are the same event.
   flDelete() sends its own delete for exactly this reason. */
function deleteTask(id){
 var t=TASKS.find(function(x){return x.id===id;}); if(!t) return false;
 if(!taskCan(SESSION.pid,'delete',t)) return false;
 var i=TASKS.indexOf(t); if(i>=0) TASKS.splice(i,1);
 /* Off the scan's books before it next runs, so the removal travels as the
    delete below and never as records the scan has to make a judgement about. */
 try{ if(typeof TSYNC!=='undefined') delete TSYNC.seen[String(id)]; }catch(e){}
 var db=(typeof fbDb==='function')?fbDb():null;
 if(db&&typeof TSYNC_COLL==='string'){
   try{ db.collection(TSYNC_COLL).doc(String(id)).delete().catch(function(e){ try{ tsyncFail(String(id),e); }catch(_e){} }); }
   catch(e){ try{ tsyncFail(String(id),e); }catch(_e){} }
 }
 try{ storeTouch(); }catch(e){}
 return true;
}
/* THE JOBS THE BOARD CANNOT DRAW.
   The board shows one day at a time, and only five chips -- Monday to Friday
   of the run it is on. taskOnDay() draws a job only when its date is an exact
   match for the chip you are looking at, so two kinds of open job appear on no
   chip at all, however many you tap:

     - one whose date has passed, or falls outside this run. An overdue job
       does not turn red and does not move to today. It stops being drawn.
     - one sitting on somebody the board does not list. That list is the
       undergraduates plus Bill himself, so every job on a technician, a grad
       student or faculty is off it.

   Both were invisible to the person running the farm, and until 2026-08-31
   both were also undeletable, because the bin only draws on a row the board
   draws. Five mow jobs on Dillon's own list hit both at once, which is what
   found this. See docs/DECISIONS.md. */
function boardOffChart(people){
  var ords=[1,2,3,4,5].map(boardOrdFor);
  var listed={}; (people||[]).forEach(function(p){ listed[p]=1; });
  /* Nobody works the weekend, so the chips only run Monday to Friday. An
     undated job rides on today's chip -- which on a Saturday is no chip at
     all. Same reading taskOnDay() makes, so the two cannot disagree. */
  var dow=new Date().getDay(), weekend=(dow===0||dow===6);
  return TASKS.filter(function(t){
    if(t.status!=='todo'||t.kind!=='task') return false;
    var o=taskOrd(t);
    var onChip=o?(ords.indexOf(o)>=0):!weekend;
    var whose=pidOf(t.assignee);
    return !onChip || !whose || !listed[whose];
  });
}
/* Same bin as a board row, because reaching these is the whole point of the
   section. No rank arrows: these jobs are not in anybody's running order for a
   day, which is exactly why they are down here rather than up there. */
function tbOffRow(t){
  var who=t.assignee?(nameOf(t.assignee)||t.assignee):'Nobody yet';
  /* dueLabel() only speaks for a job carrying a full timestamp. One carrying
     just a day still has a day, and saying "no date" about it would be a lie
     in the one place somebody is trying to work out where a job came from. */
  var when=dueLabel(t)||(taskOrd(t)?asDateLabel(taskOrd(t)):'No date set');
  var del='<span class="del tap" data-del="'+t.id+'" title="Delete">🗑</span>';
  return '<div class="row"><div class="tap" data-task="'+t.id+'" style="flex:1;min-width:0"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+esc(who)+' · '+esc(when)+'</div></div>'+del+'</div>';
}
function tbBoardRow(t,n,first,last){
 var num='<span style="width:22px;height:22px;border-radius:7px;background:#2f3133;color:#fff;font:800 12px \'Archivo\';display:flex;align-items:center;justify-content:center;flex:none">'+n+'</span>';
 var up='<span class="rk tap'+(first?' off':'')+'" data-move="up" data-id="'+t.id+'">▲</span>';
 var dn='<span class="rk tap'+(last?' off':'')+'" data-move="down" data-id="'+t.id+'">▼</span>';
 var del='<span class="del tap" data-del="'+t.id+'" title="Delete">🗑</span>';
 return '<div class="row">'+num+'<div class="tap" data-task="'+t.id+'" style="flex:1;min-width:0"><div class="rt">'+esc(t.title)+'</div><div class="rs">'+areaWithDue(t)+'</div></div><span style="display:flex;flex-direction:column;gap:4px;flex:none">'+up+dn+'</span>'+del+'</div>';
}
function renderTasks(){
 var body=document.getElementById('tb-body'); if(!body)return;
 var daysbar=document.getElementById('tb-daysbar');
 var showDays=false;
 var html='';
 if(tbTab==='open'){
   var pool=TASKS.filter(function(t){return t.status==='todo'&&!t.assignee&&t.kind==='task';});
   html+= pool.length? '<div class="sec">Up for grabs — tap Claim</div><div class="list">'+pool.map(tbPoolRow).join('')+'</div>'
        : '<div class="sec" style="text-align:center;margin-top:26px">No open tasks right now</div>';
 } else if(tbTab==='mine'){
   var me=SESSION.pid;
   /* Everyone works their own list the same way — numbered in rank order, day
      chips, a Start button on the job that is up next. A task Bill assigned to
      himself is still a task, and he should be able to run it off the map the
      way the crew does rather than reading a flat list. */
   var weekView=true;
   var mineAll=TASKS.filter(function(t){return taskIsFor(t,me)&&t.status==='todo';});
   var doneMineAll=TASKS.filter(function(t){return taskIsFor(t,me)&&t.status==='done';});
   var totalAll=mineAll.length+doneMineAll.length;
   if(weekView){
     showDays=true;
     var mine=mineAll.filter(taskOnDay);
     var doneMine=doneMineAll.filter(taskOnDay);
     if(totalAll===0){ html+='<div class="sec" style="text-align:center;margin-top:26px">Nothing assigned to you</div>'; }
     else {
       html+='<div class="sec" style="color:#2f3133">'+WEEKDAYS[boardDay]+' · '+asDateLabel(boardDayOrd())+'</div>';
       html+=progressCard(doneMine.length,mine.length+doneMine.length);
       html+= mine.length? '<div class="sec">Work these in order</div><div class="list">'+mine.map(function(t,i){return tbTaskRow(t,i+1,i===0);}).join('')+'</div>'
            : '<div class="sec" style="text-align:center;margin-top:16px">'+(doneMine.length?'All done for this day 🎉':'Nothing scheduled this day')+'</div>';
     }
   }
   else {
     var mine=mineAll, doneMine=doneMineAll, total=totalAll;
     if(total===0){ html+='<div class="sec" style="text-align:center;margin-top:26px">Nothing assigned to you</div>'; }
     else {
       html+=progressCard(doneMine.length,total);
       html+= mine.length? '<div class="sec">My tasks</div><div class="list">'+mine.map(simpleTaskRow).join('')+'</div>'
            : '<div class="sec" style="text-align:center;margin-top:16px">All done for today 🎉</div>';
     }
   }
 } else if(tbTab==='board'){
   showDays=true;
   var ro=currentRole!=='manager';
   var people=STUDENTS.slice();
   if(currentRole==='faculty'){ labMembers().map(function(m){return m.name;}).reverse().forEach(function(n){if(people.indexOf(n)<0)people.unshift(n);}); }
   if(currentRole==='manager'&&SESSION.pid&&people.indexOf(SESSION.pid)<0){ people.unshift(SESSION.pid); }
   var bDate=asDateFromOrd(boardDayOrd());
   var bIn=schedCrewOn(bDate).length;
   html+='<div class="sec" style="color:#2f3133">'+WEEKDAYS[boardDay]+' · '+asDateLabel(boardDayOrd())
        +(bIn?(' <span style="color:#2f9e4f">· '+bIn+' in</span>'):'')+'</div>';
   people.forEach(function(s){
     var mine=TASKS.filter(function(t){return taskIsFor(t,s)&&t.status==='todo'&&t.kind==='task'&&taskOnDay(t);});
     var slabel=(isMe(s)?nameOf(s)+' (you)':nameOf(s));
     /* The hours they told us they would be here, under their name. Green
        means in; no line under the name means they are not down for this day.
        Same schedShiftOn() the assign screen reads, so the two boards cannot
        tell Bill different things about the same person on the same day. */
     var bsh=schedShiftOn(s,bDate);
     html+='<div class="sec"'+(bsh?' style="color:#2f9e4f"':'')+'>'+esc(slabel)+' · '+mine.length+(mine.length===1?' task':' tasks')
          +(bsh?('<div style="font:800 10px \'Public Sans\';color:#2f9e4f;letter-spacing:.3px;margin-top:2px;text-transform:none">In '+esc(schedFmt(bsh.start))+'–'+esc(schedFmt(bsh.end))+'</div>'):'')
          +'</div>';
     /* Bill's own section is his work, not his paperwork. Everyone else's rows
        keep the manager controls — rank arrows and a bin — because that is him
        directing other people. On his own tasks those controls are meaningless
        (he is the whole list, so reordering against himself and deleting his
        own next job are not the actions he wants standing in a field), so his
        rows render exactly like a crew member's: numbered, in order, with a
        Start button on the one that is up next. Same row, same button, same
        behaviour the crew already knows — the comment on the Mine tab has said
        this was the intent since the day that tab was written. */
     html+= mine.length? '<div class="list">'+mine.map(function(t,i){
              if(ro) return roRow(numBadge(i+1),t.title,areaWithDue(t));
              return isMe(s)?tbTaskRow(t,i+1,i===0):tbBoardRow(t,i+1,i===0,i===mine.length-1);
            }).join('')+'</div>'
          : '<div class="list"><div class="row" style="border-bottom:none"><div style="flex:1"><div class="rs">All caught up ✓</div></div></div></div>';
   });
   /* Bill only. Faculty see their own lab and the pool, which is a deliberate
      scope -- this section is about the farm as a whole having nowhere to put
      a job that no day shows, and that is the farm manager's problem. */
   if(currentRole==='manager'){
     var off=boardOffChart(people);
     if(off.length){
       html+='<div class="sec">Not on any day above · '+off.length+'</div>';
       html+='<div class="list">'+off.map(tbOffRow).join('')+'</div>';
     }
   }
 } else if(tbTab==='completed'){
   var ro2=currentRole!=='manager';
   /* "Completed today" means what it says -- only jobs actually finished
      today, not the whole history of every job ever closed. A task with no
      completedAt on it was never properly closed and has no day to belong to,
      so it drops out here rather than pretending to be today's. */
   var todayOrd=asTodayOrd();
   var done=TASKS.filter(function(t){return t.status==='done'&&ordOfISO(t.completedAt)===todayOrd;});
   html+='<div class="sec">Completed today · '+done.length+'</div>';
   html+= done.length? '<div class="list">'+done.map(function(t){return ro2?roRow('<span style="color:#2f9e4f;font-size:16px;flex:none;align-self:flex-start;margin-top:1px">✓</span>',t.title,taskBoardSub(t)+' · '+t.completedBy+' · '+t.completedAt):tbDoneRow(t);}).join('')+'</div>'
        : '<div class="sec" style="text-align:center;margin-top:20px">Nothing completed yet</div>';
 } else if(tbTab==='requests'){
   if(currentRole==='manager'){
     var fromCrew=TASKS.filter(function(t){return t.kind==='request'&&!t.assignee&&t.origin!=='manager';});
     var sentCrew=TASKS.filter(function(t){return t.origin==='manager';});
     html+='<div class="sec">From crew — assign an undergrad</div>';
     html+= fromCrew.length? '<div class="list">'+fromCrew.map(tbReqRow).join('')+'</div>'
          : '<div class="sec" style="text-align:center;margin:8px 0 6px;color:#9aa0a6">Nothing to assign</div>';
     html+='<div class="sec">Sent to grad / tech</div>';
     html+= sentCrew.length? '<div class="list">'+sentCrew.map(billSentRow).join('')+'</div>'
          : '<div class="sec" style="text-align:center;margin:8px 0;color:#9aa0a6">None sent</div>';
   } else if(currentRole==='faculty'){
     var freqs=TASKS.filter(function(t){return t.kind==='request'&&!t.assignee&&t.origin!=='manager';});
     html+= freqs.length? '<div class="sec">Open requests to Bill</div><div class="list">'+freqs.map(function(t){var needs=(t.students&&t.students>1)?' · needs '+t.students:'';return roRow('',t.title,t.requestedBy+needs);}).join('')+'</div>'
          : '<div class="sec" style="text-align:center;margin-top:26px">No open requests</div>';
   } else {
     /* Both of these used to match on a display name — `target===meName()` and
        a startsWith on the "Name · Role" string. Ids compare exactly. */
     var received=TASKS.filter(function(t){return t.kind==='request'&&t.origin==='manager'&&isMe(t.target);});
     var sent=TASKS.filter(function(t){return isMe(t.requestedBy);});
     html+='<div class="sec">From Bill — accept to add to your list</div>';
     html+= received.length? '<div class="list">'+received.map(receivedRow).join('')+'</div>'
          : '<div class="sec" style="text-align:center;margin:8px 0 6px;color:#9aa0a6">Nothing from Bill</div>';
     html+='<div class="sec">Sent to Bill</div>';
     html+= sent.length? '<div class="list">'+sent.map(gradReqRow).join('')+'</div>'
          : '<div class="sec" style="text-align:center;margin:8px 0;color:#9aa0a6">No requests sent</div>';
   }
 }
 if(daysbar){daysbar.innerHTML=showDays?boardDayChips():'';daysbar.style.display=showDays?'':'none';}
 body.innerHTML=html;
}
function fldRow(l,v,last){return '<div class="fld"'+(last?' style="border-bottom:none"':'')+'><span class="fl">'+l+'</span><span class="fv">'+v+'</span></div>';}
