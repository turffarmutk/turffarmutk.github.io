/* ============================================================
   THE FIELD LOG, AND THE SHARED DATABASE DRAWERS.

   The field log itself -- logging an operation, correcting one without losing
   the original, who and when, and the printed export. Then the drawers that
   carry records off the phone: field log, schedules, time clock, trials and
   restrictions, and farm settings.

   The two conventions everything else is built on live at the end of this
   file: how an id is minted so two phones in the same second cannot collide,
   and the rule that a due date is stored as a timestamp rather than the words
   that describe it.

   The permission checks in here are the real decision. Each one is
   transcribed by hand into firestore.rules -- never invent a rule that only
   exists in the rules file.
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
const FL_TYPES={
 spray:{label:'Spray',ic:'',bg:'#e7f1fb',fg:'#1f6fb0',dot:'#489FDF'},
 fert:{label:'Fertilize',ic:'',bg:'#e7f7ec',fg:'#237a3a',dot:'#2f9e4f'},
 cult:{label:'Cultivation',ic:'',bg:'#fdf0dd',fg:'#9a5b00',dot:'#b07d3e'},
 mow:{label:'Mow',ic:'',bg:'#e3f2ec',fg:'#0a6b5f',dot:'#0f8a78'},
 irrig:{label:'Irrigation',ic:'',bg:'#e5f4fa',fg:'#1c7f9a',dot:'#22a5c4'},
 misc:{label:'Misc',ic:'',bg:'#eef0f2',fg:'#4b5157',dot:'#7b828d'}
};
const FL_CATS=['spray','fert','cult','mow','irrig','misc'];
const FL_CAP=5000;              // rolling cap: keep newest 5,000 entries
/* v2 stores the person as a roster id rather than the name typed at the time.
   The entries in v1 are prototype seed, so it is not migrated. */
const FL_KEY='ut_fieldlog_v3';   /* bumped 2026-08-25 to clear out any cached prototype/demo rows still sitting in a browser's local storage -- see seed-data notes */
/* The seeded history is expressed as "N days before today" rather than as
   fixed dates in July 2026, so the log always covers the fortnight leading up
   to now and the month/week export ranges have something in them. Real entries
   written by the app carry their own ord and date. */
function flOrdAgo(n){ var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-n); return flOrdOf(d); }
function flDateAgo(n){ var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-n);
  return d.toLocaleString('en-US',{month:'short'})+' '+d.getDate(); }
let FIELDLOG=[
 /* Empty on purpose — see TASKS. Held 20 sample log entries. */
];
function flLoad(){try{var r=JSON.parse(localStorage.getItem(FL_KEY)||'null');if(r&&r.length)return r;}catch(e){}return null;}
/* Every entry needs a stable handle so a home-screen row, the feed and the
   detail page all point at the same record. Seed rows never had one, and rows
   restored from localStorage keep whatever they were given, so the id is
   stamped on read rather than baked into the array literal. */
function flNewId(){return newId('fl');}
function flStampIds(){for(var i=0;i<FIELDLOG.length;i++){if(!FIELDLOG[i].id)FIELDLOG[i].id=flNewId();}}
function flById(id){for(var i=0;i<FIELDLOG.length;i++){if(FIELDLOG[i].id===id)return FIELDLOG[i];}return null;}
/* The single write point for the log, and therefore the single place the shared
   copy has to be told about. flStampIds() runs first so every record has its
   handle before anything sends it anywhere. */
function flCommit(){flStampIds();try{if(FIELDLOG.length>FL_CAP){FIELDLOG.sort((a,b)=>a.ord-b.ord);FIELDLOG.splice(0,FIELDLOG.length-FL_CAP);}localStorage.setItem(FL_KEY,JSON.stringify(FIELDLOG));}catch(e){}try{flPush();}catch(e){}}
(function(){var r=flLoad();if(r)FIELDLOG=r;flStampWho();flCommit();})();
/* ============================================================
   THE FIELD LOG — corrections that keep the original
   ------------------------------------------------------------
   Dillon, 2026-08-25: **the wrong entry stays.** Correcting an entry writes a
   NEW record carrying the fix, and marks the old one as superseded by it.
   Nothing is ever edited in place and nothing is ever deleted.

   Why, in his words and mine: the spray entries are the farm's application
   records. A log that can be quietly rewritten is worth much less than one
   where you can see what changed and when — and this is the record that
   outlives everybody currently on the farm.

   The feed and the counts show only live entries, so a wrong mow does not sit
   in the totals forever. The superseded record is still there, reachable from
   the correction that replaced it, which is the difference between a total
   that is right and a record that is missing something.

   ONE FUNCTION for who may do it, like taskCan() and mapCan(), because the
   database enforces the same rule and two copies would drift.
   ============================================================ */

/* Everybody logs their own work — an undergrad who mowed is exactly the person
   who should be recording that they mowed. Correcting is narrower. */
function flCan(actor,action,entry){
  var me=pidOf(actor)||SESSION.pid;
  if(!me||!personActive(me)) return false;
  var role=personRole(me); if(!role) return false;
  var e=entry||{};
  switch(action){
    case 'log':
      return true;
    case 'correct':
      if(e.correctedBy) return false;                  /* correct the correction instead */
      if(pidOf(e.loggedBy)===me) return true;          /* I wrote it down */
      if(pidOf(e.person)===me) return true;            /* the work was mine */
      if(assignsUndergrads(me)) return true;           /* Bill, or whoever holds the job */
      if(role==='Faculty'&&e.person&&sameLab(me,pidOf(e.person))) return true;
      return false;
    case 'delete':
      return false;                                     /* never, by anybody */
  }
  return false;
}

/* What a correction is allowed to change. Deliberately not everything: who
   wrote the original, when it was written and what it superseded are the
   record of the record, and a correction that could rewrite those would defeat
   the point of keeping the original. */
var FL_CORRECTABLE=['plot','type','op','title','date','ord','time','person',
                    'equipment','product','ai','rate','amount','target','notes','detail'];

function flSuperseded(a){ return !!(a&&a.correctedBy); }
/* The true record: what the farm actually did, with corrected entries replaced
   by their corrections rather than counted twice. */
function flLive(){ return FIELDLOG.filter(function(a){ return !flSuperseded(a); }); }

function flCorrect(id,changes,why){
  var orig=flById(id);
  if(!orig){ return null; }
  if(!flCan(SESSION.pid,'correct',orig)){ return null; }

  var copy; try{ copy=JSON.parse(JSON.stringify(orig)); }catch(e){ return null; }
  copy.id=flNewId();
  Object.keys(changes||{}).forEach(function(k){
    if(FL_CORRECTABLE.indexOf(k)>=0) copy[k]=changes[k];
  });
  var at=new Date().toISOString();
  copy.corrects=orig.id;
  copy.correctionOf=orig.ord;
  copy.correctionNote=(why||'').trim()||null;
  copy.correctedAt=at;
  copy.loggedBy=SESSION.pid;
  delete copy.correctedBy;                 /* the new one is live, not superseded */
  delete copy.correctedWho;
  FIELDLOG.push(copy);

  orig.correctedBy=copy.id;
  orig.correctedAt=at;
  orig.correctedWho=SESSION.pid;

  flCommit();
  return copy;
}

let flState={type:'all',plots:[]};
function flPlotMatch(p){return flState.plots.length===0||flState.plots.indexOf(p)>=0;}
function flRender(){
 const feed=document.getElementById('fl-feed'); if(!feed)return;
 /* flLive(): a corrected entry is replaced by its correction, never counted
    twice and never left sitting in the totals. It is still reachable from
    the correction that replaced it. */
 let items=flLive().filter(a=>(flState.type==='all'||a.type===flState.type)&&flPlotMatch(a.plot));
 items.sort((a,b)=>b.ord-a.ord);
 const sum=document.getElementById('fl-sum');
 if(sum){const base=flLive().filter(a=>flPlotMatch(a.plot));const c={};FL_CATS.forEach(k=>c[k]=0);base.forEach(a=>{if(c[a.type]!=null)c[a.type]++;});
  sum.className='fl-sum'+(flState.type==='all'?'':' dim');
  sum.innerHTML=FL_CATS.map(k=>{const t=FL_TYPES[k];return '<div class="k'+(flState.type===k?' on':'')+'" data-cat="'+k+'"><div class="n">'+c[k]+'</div><div class="l">'+esc(t.label)+'</div></div>';}).join('');}
 const head=document.getElementById('fl-feedhead');
 if(head){const pl=flState.plots.length; const scope=pl===0?'':(pl===1?flPlotLabel(flState.plots[0]):pl+' plots')+' · '; head.textContent=scope+items.length+' '+(items.length===1?'activity':'activities');}
 if(!items.length){feed.innerHTML='<div class="fl-empty">No activities logged for this filter yet.</div>';return;}
 feed.innerHTML='<div class="list">'+items.map(a=>{const t=FL_TYPES[a.type];return '<div class="row tap" data-flog="'+a.id+'"><span class="dot" style="background:'+t.dot+'"></span><div style="flex:1"><div class="rt">'+esc(a.title)+'</div><div class="rs">'+flRowPlot(a.plot)+' · '+esc(a.detail)+'</div></div><div style="text-align:right;flex:none"><span class="pill" style="background:'+t.bg+';color:'+t.fg+'">'+esc(t.label)+'</span><div class="rs" style="margin-top:5px">'+a.date+(a.time?(' · '+a.time):'')+'</div></div></div>';}).join('')+'</div>';
}
const FL_PLOTS=['11','12','13','14','15','16','17','18','GH'];
function flPlotLabel(id){return id==='all'?'All plots':(id==='GH'?'Greenhouse':(/^\d+$/.test(id)?'Plot '+id:id));}
function flRowPlot(id){return id==='GH'?'Greenhouse':(/^\d+$/.test(id)?'Plot '+id:id);}
function flPlotCount(id){return flLive().filter(a=>a.plot===id).length;}
/* ---- Field Log: one logged operation ------------------------------------
   Entries arrive two ways — typed into the log form, or written automatically
   when a task board job is finished. Both land here. Anything the record does
   not carry is dropped from the list rather than shown blank, so a seed row
   from before the task hand-off existed still reads cleanly.              */
var flCur=null;
function openFlEntry(id){ if(!flById(id))return; flCur=id; show('fldetail',true); }
function flDetRow(l,v){return v==null||v===''?'':'<div class="fld"><span class="fl">'+esc(l)+'</span><span class="fv">'+esc(v)+'</span></div>';}
function renderFlDetail(){
 var a=flById(flCur),body=document.getElementById('fld-body'),ab=document.getElementById('fld-actions');
 if(!body)return;
 if(!a){body.innerHTML='';if(ab)ab.innerHTML='';return;}
 var t=FL_TYPES[a.type]||FL_TYPES.misc;
 var task=(a.taskId&&typeof TASKS!=='undefined')?TASKS.filter(function(x){return x.id===a.taskId;})[0]:null;
 var rows=flDetRow('Operation',a.op||t.label)
  +flDetRow('Plot',flRowPlot(a.plot))
  +flDetRow('Area',a.area)
  +flDetRow('Date',a.date)
  +flDetRow('Time',a.time)
  +flDetRow('Logged by',nameOf(a.person)||a.person)
  +flDetRow('Marked complete by',nameOf(a.closedBy)||a.closedBy)
  +flDetRow('Equipment',a.equipment);
 var chem=flDetRow('Product',a.product)+flDetRow('Active ingredient',a.ai)
  +flDetRow('Rate',a.rate)+flDetRow('Amount used',a.amount)+flDetRow('Target',a.target);
 /* Entries written by the board keep the work order's own wording — the
    schedule it ran on and the instructions the crew worked from. */
 var job=flDetRow('From task',task?task.title:(a.taskId?'Task '+a.taskId:null))
  +flDetRow('Job type',task?task.type:null)
  +flDetRow('Scheduled',a.dueAt?fmtDateTime(a.dueAt):a.due)
  +flDetRow('Repeats',a.repeat)
  +flDetRow('Assigned to',task?(nameOf(task.assignee)||'unassigned'):null);
 body.innerHTML=
   '<div class="hdr" style="background:#2f3133;padding:15px 16px;gap:10px">'
   +'<div style="flex:1;min-width:0"><div class="title" style="color:#fff;font-size:17px;line-height:1.15">'+esc(a.title)+'</div>'
   +'<div style="font:700 11px \'Public Sans\';color:#b9bfc6;margin-top:3px">'+esc(flRowPlot(a.plot))+' · '+esc(a.date)+'</div></div>'
   +'<span class="pill" style="background:'+t.bg+';color:'+t.fg+';flex:none">'+esc(t.label)+'</span></div>'
  +'<div class="sec">Details</div><div class="list">'+(rows||'<div class="fld"><span class="fl">Summary</span><span class="fv">'+esc(a.detail||'')+'</span></div>')+'</div>'
  +(chem?'<div class="sec">Application</div><div class="list">'+chem+'</div>':'')
  +(job?'<div class="sec">Work order</div><div class="list">'+job+'</div>':'')
  +(a.notes?'<div class="sec">Notes</div><div class="list"><div class="fld" style="align-items:flex-start"><span class="fl">Notes</span><span class="fv" style="text-align:right;white-space:pre-wrap">'+esc(a.notes)+'</span></div></div>':'')
  +(!rows&&!a.detail?'':'')
  +'<div style="height:14px"></div>';
 /* Both halves of a correction say so, and each links to the other. An entry
    that was quietly replaced would be worse than one that was quietly edited. */
 var band='';
 if(a.correctedBy){
   band='<div style="margin:12px 16px 0;padding:10px 12px;background:#fdeceb;border-radius:10px;'
       +'font:700 11.5px \'Public Sans\';color:#c0392b;line-height:1.5">'
       +'This entry was corrected'+(a.correctedWho?(' by '+esc(nameOf(a.correctedWho)||a.correctedWho)):'')
       +(a.correctedAt?(' on '+esc(String(a.correctedAt).slice(0,10))):'')+'. '
       +'It is kept because it is part of the record, and it is not counted in the totals.'
       +'<div class="tap" data-flgo="'+esc(a.correctedBy)+'" style="margin-top:7px;text-decoration:underline">See the entry that replaced it ›</div>'
       +'</div>';
 } else if(a.corrects){
   band='<div style="margin:12px 16px 0;padding:10px 12px;background:#eef4ff;border-radius:10px;'
       +'font:700 11.5px \'Public Sans\';color:#2f5fa0;line-height:1.5">'
       +'This is a correction'+(a.correctedAt?(' made on '+esc(String(a.correctedAt).slice(0,10))):'')+'.'
       +(a.correctionNote?('<br>'+esc(a.correctionNote)):'')
       +'<div class="tap" data-flgo="'+esc(a.corrects)+'" style="margin-top:7px;text-decoration:underline">See what it replaced ›</div>'
       +'</div>';
 }
 body.innerHTML=band+body.innerHTML;

 if(ab){
  var acts='<div class="action tap" id="fld-map" style="flex:1;background:#2f3133">Show on map</div>';
  if(task)acts+='<div class="action tap" id="fld-task" style="flex:1">Open the task</div>';
  if(flCan(SESSION.pid,'correct',a))
    acts+='<div class="action tap" id="fld-fix" style="flex:1;background:#e7e9e6;color:#2f3133">Correct this</div>';
  ab.innerHTML=acts;
 }
}
document.getElementById('s-fldetail').addEventListener('click',function(e){
 var a=flById(flCur); if(!a)return;
 if(e.target.closest('#fld-map')){ if(typeof trGoPlot==='function')trGoPlot(a.plot); else go('map'); return; }
 if(e.target.closest('#fld-task')){ if(a.taskId&&typeof openTask==='function')openTask(a.taskId); return; }
 if(e.target.closest('#fld-fix')){ go('flfix'); return; }
 var jump=e.target.closest('[data-flgo]');
 if(jump){ var to=jump.getAttribute('data-flgo'); if(flById(to)){ flCur=to; renderFlDetail(); } return; }
});
/* ============================================================
   THE FIELD LOG IN THE SHARED DATABASE — drawer 3
   ------------------------------------------------------------
   The record that matters most long-term, and the one somebody will be reading
   in 2035 to answer a question nobody has thought of yet. Two things follow
   from that and they shape everything here.

   NOTHING IS EVER DELETED. Not by a scan, not by the app, not by the rules —
   `allow delete: if false`. A correction writes a new record and marks the old
   one; see flCorrect(). There is no code path that removes a field log record
   from the shared copy, deliberately.

   THE 5,000-ENTRY CAP IS A PHONE LIMIT, NOT A FARM LIMIT. flCommit() keeps the
   newest 5,000 records on the device so a phone does not fill up. Under a
   naive sync that would be a disaster twice over: the trimmed records would be
   deleted from the shared copy, and then the listener would drag them back
   down and the cap would trim them again, forever. So: the sync never deletes,
   and an arriving record older than the oldest one this phone kept is left
   where it is. The farm's history lives in the shared copy; the phone carries
   a window onto it.
   ============================================================ */

var FLSYNC_COLL='fieldlog';
var FLSYNC_RETRY_MS=10000;

var FLSYNC={ on:false, live:false, ready:false, seen:{}, err:null,
             up:0, down:0, failed:{} };
var _flsyncNextTry=0;

/* SHARING IS NOT OPTIONAL — 2026-08-26.
   Every drawer used to have its own on/off switch, kept in this phone's own
   storage and starting OFF. Two things were wrong with that. The screen the
   switches lived on is the App Manager's, so nobody else's phone could ever
   have been switched on at all; and a farm where one phone shares and the next
   one does not is worse than either answer on its own. So sharing is simply on,
   everywhere, always: every *syncWanted() below answers yes and nothing on any
   screen can change it. Each drawer still connects on its own, so one drawer
   failing still does not take the rest with it.
   The *syncSetWanted() functions are kept ONLY so the tests can drive the
   stop path. Nothing the crew can touch calls them. */
function flsyncWanted(){ return true; }
function flsyncHydrate(){ FLSYNC.on=flsyncWanted(); }
function flsyncSetWanted(on){
  FLSYNC.on=!!on;
  if(on){ _flsyncNextTry=0; flsyncStart(); } else flsyncStop();
}

function flDoc(a){
  var out; try{ out=JSON.parse(JSON.stringify(a||{})); }catch(e){ return null; }
  if(!out||!out.id) return null;
  out.id=String(out.id);
  if(!out.loggedBy) out.loggedBy=out.person||SESSION.pid||null;
  return out;
}
function flJson(a){ var d=flDoc(a); return d?JSON.stringify(d):null; }

/* The oldest day this phone still holds. Anything older was trimmed by the
   cap, and must not be dragged back down. */
function flOldestKeptOrd(){
  var o=null;
  for(var i=0;i<FIELDLOG.length;i++){
    var v=+FIELDLOG[i].ord||0;
    if(v&&(o===null||v<o)) o=v;
  }
  return o;
}

function flsyncStart(){
  if(FLSYNC.live) return true;
  if(Date.now()<_flsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    FLSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _flsyncNextTry=Date.now()+FLSYNC_RETRY_MS; return false;
  }
  try{
    FLSYNC.unsub=db.collection(FLSYNC_COLL).onSnapshot(snapOpts(),flsyncOnSnapshot,function(e){
      FLSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
      FLSYNC.live=false; FLSYNC.ready=false; _flsyncNextTry=Date.now()+FLSYNC_RETRY_MS;
    });
    FLSYNC.live=true; FLSYNC.err=null;
    return true;
  }catch(e){
    FLSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _flsyncNextTry=Date.now()+FLSYNC_RETRY_MS;
    return false;
  }
}
function flsyncStop(){
  try{ if(FLSYNC.unsub) FLSYNC.unsub(); }catch(e){}
  FLSYNC.unsub=null; FLSYNC.live=false; FLSYNC.ready=false;
  FLSYNC.seen={}; FLSYNC.failed={};
}

function flsyncOnSnapshot(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false, oldest=flOldestKeptOrd();

  changes.forEach(function(ch){
    if(ch.type==='removed'){ delete FLSYNC.seen[String(ch.doc.id)]; return; }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data) return;
    data.id=String(ch.doc.id);
    FLSYNC.seen[data.id]=JSON.stringify(data);      /* agreed before anything reads it */
    delete FLSYNC.failed[data.id];
    FLSYNC.down++;

    var have=flById(data.id);
    if(have){
      if(JSON.stringify(flDoc(have))!==JSON.stringify(data)){
        Object.keys(have).forEach(function(k){ if(!(k in data)) delete have[k]; });
        Object.keys(data).forEach(function(k){ have[k]=data[k]; });
        touched=true;
      }
      return;
    }
    /* Older than anything this phone kept: it belongs to the shared copy's
       history, not to this device's window onto it. */
    if(oldest!==null && FIELDLOG.length>=FL_CAP && (+data.ord||0) < oldest) return;
    FIELDLOG.push(data); touched=true;
  });

  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!FLSYNC.ready&&!fromCache){ FLSYNC.ready=true; flsyncUploadNew(); }

  if(touched){
    try{ flStampIds(); localStorage.setItem(FL_KEY,JSON.stringify(FIELDLOG)); }catch(e){}
    try{ if(typeof flRender==='function') flRender(); }catch(e){}
    try{ if(typeof flsyncRepaint==='function') flsyncRepaint(); }catch(e){}
  }
}

/* This phone's history going up for the first time. */
function flsyncUploadNew(){
  var db=fbDb(); if(!db) return 0;
  var n=0;
  FIELDLOG.slice().forEach(function(a){
    if(!a||!a.id) return;
    var id=String(a.id);
    if(FLSYNC.seen[id]!==undefined) return;
    var doc=flDoc(a); if(!doc) return;
    FLSYNC.seen[id]=JSON.stringify(doc);
    n++; FLSYNC.up++;
    try{ db.collection(FLSYNC_COLL).doc(id).set(doc).catch(function(e){ flsyncFail(id,e); }); }
    catch(e){ flsyncFail(id,e); }
  });
  if(n){ try{ toast(n+' log entr'+(n===1?'y':'ies')+' from this phone sent up'); }catch(e){} }
  return n;
}
function flsyncFail(id,e){
  FLSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}

/* Outbound. Writes only — see the note at the top about never deleting. */
function flPush(){
  if(!FLSYNC.on||!FLSYNC.live||!FLSYNC.ready) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  FIELDLOG.forEach(function(a){
    if(!a||!a.id) return;
    var id=String(a.id), json=flJson(a);
    if(json===null||FLSYNC.seen[id]===json) return;
    FLSYNC.seen[id]=json; n++; FLSYNC.up++;
    try{ db.collection(FLSYNC_COLL).doc(id).set(JSON.parse(json)).catch(function(e){ flsyncFail(id,e); }); }
    catch(e){ flsyncFail(id,e); }
  });
  return n;
}

function flsyncTick(){
  if(!FLSYNC.on) return;
  if(!FLSYNC.live){ flsyncStart(); return; }
  flPush();
}

function flsyncRepaint(){
  try{
    var d=document.getElementById('s-sharedb');
    if(d&&d.classList.contains('active')&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}

function flsyncSummary(){
  if(!FLSYNC.on) return 'Off — this phone keeps its own log';
  if(FLSYNC.err) return FLSYNC.err;
  if(!FLSYNC.live) return 'Connecting…';
  if(!FLSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(FLSYNC.failed).length;
  return FLSYNC.up+' sent · '+FLSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}


/* ==================== SHARING THE SHELF ====================
   Drawer 4. Two collections under ONE switch, because they are two halves of
   one answer and a phone holding only one of them is worse than a phone
   holding neither:

     invmoves/{id}  the ledger. APPEND ONLY. Nothing is ever edited or
                    deleted, by the app or by the rules - the same rule the
                    field log lives by, and for the same reason: a movement is
                    a record of something that happened, and things that
                    happened do not stop having happened. A mistake is
                    corrected by ANOTHER movement.
     invitems/{id}  the product records - what a thing is, what a container
                    holds, when to reorder. These DO change, because a product
                    genuinely changes. Only somebody who may edit a product
                    sends them (invCanEdit), which is not everybody.

   WHY BOTH. A movement names a product by id. If products did not travel,
   a delivery of something one person added on their phone would arrive
   everywhere else as a movement against a product nobody has, and quietly
   count towards nothing. All 23 phones ship with the same 191 products baked
   in, so this only bites for products added afterwards - which is exactly the
   case a shared shelf exists to handle.

   WHAT IT DELIBERATELY DOES NOT DO: reconcile. There is no merge, no
   last-write-wins on a total, and no arithmetic anywhere in the sync. Every
   phone receives the same movements and adds them up itself, and addition
   gives the same answer in any order. That is the whole reason the ledger was
   built before the sync was.
   =========================================================== */

var INVSYNC_MOVES='invmoves';
var INVSYNC_ITEMS='invitems';
var INVSYNC_RETRY_MS=10000;

var INVSYNC={ on:false, live:false, ready:false, seen:{}, itemSeen:{}, err:null,
              up:0, down:0, failed:{} };
var _invsyncNextTry=0;

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function invsyncWanted(){ return true; }
function invsyncHydrate(){ INVSYNC.on=invsyncWanted(); }
function invsyncSetWanted(on){
  INVSYNC.on=!!on;
  if(on){ _invsyncNextTry=0; invsyncStart(); } else invsyncStop();
}

function invMoveDoc(m){
  var out; try{ out=JSON.parse(JSON.stringify(m||{})); }catch(e){ return null; }
  if(!out||!out.id||!out.item) return null;
  out.id=String(out.id); out.item=String(out.item);
  out.delta=+out.delta||0;
  if(!out.who) out.who=(typeof SESSION!=='undefined'&&SESSION.pid)||null;
  return out;
}
function invItemDoc(it){
  var out; try{ out=JSON.parse(JSON.stringify(it||{})); }catch(e){ return null; }
  if(!out||!out.id) return null;
  out.id=String(out.id);
  return out;
}
function invMoveById(id){
  for(var i=0;i<INVMOVES.length;i++) if(INVMOVES[i]&&String(INVMOVES[i].id)===String(id)) return INVMOVES[i];
  return null;
}

function invsyncStart(){
  if(INVSYNC.live) return true;
  if(Date.now()<_invsyncNextTry) return false;
  var db=fbDb();
  if(!db || !(typeof SESSION!=='undefined'&&SESSION.pid)){
    INVSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _invsyncNextTry=Date.now()+INVSYNC_RETRY_MS; return false;
  }
  try{
    INVSYNC.unsubM=db.collection(INVSYNC_MOVES).onSnapshot(snapOpts(),invsyncOnMoves,function(e){
      INVSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
      INVSYNC.live=false; INVSYNC.ready=false; _invsyncNextTry=Date.now()+INVSYNC_RETRY_MS;
    });
    INVSYNC.unsubI=db.collection(INVSYNC_ITEMS).onSnapshot(snapOpts(),invsyncOnItems,function(e){
      /* The products failing is not fatal - the ledger is still right, the
         phone just may not know a name yet. Do not tear the whole thing down. */
      INVSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    });
    INVSYNC.live=true; INVSYNC.err=null;
  }catch(e){
    INVSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _invsyncNextTry=Date.now()+INVSYNC_RETRY_MS;
  }
  return INVSYNC.live;
}
function invsyncStop(){
  try{ if(INVSYNC.unsubM) INVSYNC.unsubM(); }catch(e){}
  try{ if(INVSYNC.unsubI) INVSYNC.unsubI(); }catch(e){}
  INVSYNC.unsubM=null; INVSYNC.unsubI=null;
  INVSYNC.live=false; INVSYNC.ready=false;
  INVSYNC.seen={}; INVSYNC.itemSeen={}; INVSYNC.failed={};
}

/* Inbound movements. New ones are appended; an id this phone already holds is
   left ALONE rather than overwritten, because a movement never legitimately
   changes and a rewrite arriving from anywhere is a bug somewhere else. */
function invsyncOnMoves(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    if(ch.type==='removed'){ delete INVSYNC.seen[String(ch.doc.id)]; return; }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data) return;
    data.id=String(ch.doc.id);
    INVSYNC.seen[data.id]=JSON.stringify(data);
    delete INVSYNC.failed[data.id];
    INVSYNC.down++;
    if(invMoveById(data.id)) return;                 /* already here, and immutable */
    INVMOVES.push(data); touched=true;
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!INVSYNC.ready&&!fromCache){ INVSYNC.ready=true; invsyncUploadNew(); }
  if(touched){
    invSumsDirty();                                  /* the totals are now stale */
    try{ storeTouch(); }catch(e){}
    invsyncRepaintScreens();
  }
}

/* Inbound products. Updated IN PLACE so the dozens of closures already holding
   a reference keep pointing at live data - the same rule storeHydrate follows. */
function invsyncOnItems(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    if(ch.type==='removed') return;                  /* products are never deleted */
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data) return;
    data.id=String(ch.doc.id);
    INVSYNC.itemSeen[data.id]=JSON.stringify(data);
    var have=INVENTORY.find(function(x){return x.id===data.id;});
    if(have){
      if(JSON.stringify(invItemDoc(have))!==JSON.stringify(data)){
        Object.keys(data).forEach(function(k){ have[k]=data[k]; });
        touched=true;
      }
      return;
    }
    INVENTORY.push(data); touched=true;
  });
  if(touched){
    try{ storeTouch(); }catch(e){}
    invsyncRepaintScreens();
  }
}

function invsyncRepaintScreens(){
  try{
    var scr=document.querySelector('.screen.active');
    var id=scr?scr.id.replace(/^s-/,''):'';
    if(id==='inventory'&&typeof renderInvList==='function') renderInvList();
    if(id==='lowstock'&&typeof renderLowStock==='function') renderLowStock();
    if(id==='sharedb'&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}

/* This phone's ledger going up for the first time. */
function invsyncUploadNew(){
  var db=fbDb(); if(!db) return 0;
  var n=0;
  INVMOVES.slice().forEach(function(m){
    if(!m||!m.id) return;
    var id=String(m.id);
    if(INVSYNC.seen[id]!==undefined) return;
    var doc=invMoveDoc(m); if(!doc) return;
    INVSYNC.seen[id]=JSON.stringify(doc);
    n++; INVSYNC.up++;
    try{ db.collection(INVSYNC_MOVES).doc(id).set(doc).catch(function(e){ invsyncFail(id,e); }); }
    catch(e){ invsyncFail(id,e); }
  });
  if(n){ try{ toast(n+' stock movement'+(n===1?'':'s')+' from this phone sent up'); }catch(e){} }
  return n;
}
function invsyncFail(id,e){
  INVSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}

/* Outbound. Movements from anybody; product records only from somebody the app
   already lets edit a product, so the rules and the screens agree. */
function invPush(){
  if(!INVSYNC.on||!INVSYNC.live||!INVSYNC.ready) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  INVMOVES.forEach(function(m){
    if(!m||!m.id) return;
    var doc=invMoveDoc(m); if(!doc) return;
    var id=String(m.id), json=JSON.stringify(doc);
    if(INVSYNC.seen[id]===json) return;
    INVSYNC.seen[id]=json; n++; INVSYNC.up++;
    try{ db.collection(INVSYNC_MOVES).doc(id).set(doc).catch(function(e){ invsyncFail(id,e); }); }
    catch(e){ invsyncFail(id,e); }
  });
  if(typeof invCanEdit==='function' && invCanEdit()){
    INVENTORY.forEach(function(it){
      if(!it||!it.id) return;
      var doc=invItemDoc(it); if(!doc) return;
      var id=String(it.id), json=JSON.stringify(doc);
      if(INVSYNC.itemSeen[id]===json) return;
      INVSYNC.itemSeen[id]=json; n++; INVSYNC.up++;
      try{ db.collection(INVSYNC_ITEMS).doc(id).set(doc).catch(function(e){ invsyncFail(id,e); }); }
      catch(e){ invsyncFail(id,e); }
    });
  }
  return n;
}

function invsyncTick(){
  if(!INVSYNC.on) return;
  if(!INVSYNC.live){ invsyncStart(); return; }
  invPush();
}

function invsyncSummary(){
  if(!INVSYNC.on) return 'Off — this phone keeps its own stock figures';
  if(INVSYNC.err) return INVSYNC.err;
  if(!INVSYNC.live) return 'Connecting…';
  if(!INVSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(INVSYNC.failed).length;
  return INVSYNC.up+' sent · '+INVSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}


/* ============================================================
   SCHEDULES + TIME CLOCK — drawers 5 and 6
   ============================================================
   Two collections, both built on the same pattern as the field log: attach a
   listener, merge what comes down, push up anything this phone has that the
   shared copy does not. One switch each on More -> Admin -> Shared database,
   off on every phone until somebody turns it on.

   WHY THESE TWO ARE WORTH SYNCING AT ALL, said plainly: without them, an
   undergrad filling in their hours on their own phone changes nothing that
   anybody else can see, and a punch clocked in the field is a number only
   that phone knows. Bill's day board and every payroll total read as empty on
   his device. Neither feature does its job until the records leave the phone
   that made them.
   ============================================================ */

/* ---- who may change what --------------------------------------------
   ONE function each, transcribed into firestore.rules. A drawer means a
   function, not a rule invented in the rules file. */

/* Your own schedule is yours. Bill may fix anybody's, because he is the one
   who notices when the board is wrong and the student is out in a field.
   Faculty may fix their own lab's people, matching how they may already
   direct them. Nobody else touches it. */
function schedCanEdit(pid){
  if(!pid||!SESSION.pid) return false;
  /* Signed in AND still on the roster, which is the first thing every rule in
     firestore.rules checks. Somebody switched off keeps their screens until
     they reload; the database stops taking their writes immediately. */
  if(typeof personActive==='function'&&!personActive(SESSION.pid)) return false;
  if(SESSION.pid===pid) return true;
  if(typeof assignsUndergrads==='function'&&assignsUndergrads(SESSION.pid)) return true;
  /* The role comes off the ROSTER, never off currentRole. currentRole is a
     screen state -- it changes when somebody switches user, and the App
     Manager post used to overwrite it entirely -- while the database reads the
     roster. Taking it from anywhere but the roster is precisely how the app's
     copy of the org chart and the database's copy drift apart. */
  return (typeof personRole==='function'&&personRole(SESSION.pid)==='Faculty'
       && typeof sameLab==='function'&&sameLab(SESSION.pid,pid));
}
/* Clocking yourself in and out is yours. Correcting somebody else's times, or
   removing a punch, is Bill's -- it is a payroll correction, and the app has
   only ever offered those controls to him. */
function tcCanPunchFor(pid){
  if(!pid||!SESSION.pid) return false;
  if(typeof personActive==='function'&&!personActive(SESSION.pid)) return false;
  if(SESSION.pid===pid) return true;
  return (typeof assignsUndergrads==='function')&&assignsUndergrads(SESSION.pid);
}
function tcCanEditPunches(){
  return !!SESSION.pid&&(typeof assignsUndergrads==='function')&&assignsUndergrads(SESSION.pid);
}

/* ================= SCHEDULES ================= */
var SCHSYNC_COLL='schedules';
var SCHSYNC_RETRY_MS=10000;
var SCHSYNC={ on:false, live:false, ready:false, seen:{}, err:null, up:0, down:0, failed:{} };
var _schsyncNextTry=0;

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function schsyncWanted(){ return true; }
function schsyncHydrate(){ SCHSYNC.on=schsyncWanted(); }
function schsyncSetWanted(on){
  SCHSYNC.on=!!on;
  if(on){ _schsyncNextTry=0; schsyncStart(); } else schsyncStop();
}
function schDoc(r){
  var out; try{ out=JSON.parse(JSON.stringify(r||{})); }catch(e){ return null; }
  if(!out||!out.id||!out.pid||!out.sem) return null;
  out.id=String(out.id); out.pid=String(out.pid); out.sem=String(out.sem);
  if(!out.days||typeof out.days!=='object') return null;
  return out;
}
function schJson(r){ var d=schDoc(r); return d?JSON.stringify(d):null; }
function schById(id){ for(var i=0;i<SCHEDULES.length;i++) if(SCHEDULES[i]&&String(SCHEDULES[i].id)===String(id)) return SCHEDULES[i]; return null; }

function schsyncStart(){
  if(SCHSYNC.live) return true;
  if(Date.now()<_schsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    SCHSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _schsyncNextTry=Date.now()+SCHSYNC_RETRY_MS; return false;
  }
  try{
    SCHSYNC.unsub=db.collection(SCHSYNC_COLL).onSnapshot(snapOpts(),schsyncOnSnapshot,function(e){
      SCHSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
      SCHSYNC.live=false; SCHSYNC.ready=false; _schsyncNextTry=Date.now()+SCHSYNC_RETRY_MS;
    });
    SCHSYNC.live=true; SCHSYNC.err=null; return true;
  }catch(e){
    SCHSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _schsyncNextTry=Date.now()+SCHSYNC_RETRY_MS; return false;
  }
}
function schsyncStop(){
  try{ if(SCHSYNC.unsub) SCHSYNC.unsub(); }catch(e){}
  SCHSYNC.unsub=null; SCHSYNC.live=false; SCHSYNC.ready=false;
  SCHSYNC.seen={}; SCHSYNC.failed={};
}
function schsyncOnSnapshot(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    if(ch.type==='removed'){
      delete SCHSYNC.seen[String(ch.doc.id)];
      var had=schById(ch.doc.id);
      if(had){ var k=SCHEDULES.indexOf(had); if(k>=0){ SCHEDULES.splice(k,1); touched=true; } }
      return;
    }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data) return;
    data.id=String(ch.doc.id);
    SCHSYNC.seen[data.id]=JSON.stringify(data);
    delete SCHSYNC.failed[data.id];
    SCHSYNC.down++;
    var have=schById(data.id);
    if(have){
      if(JSON.stringify(schDoc(have))!==JSON.stringify(data)){
        Object.keys(have).forEach(function(k){ if(!(k in data)) delete have[k]; });
        Object.keys(data).forEach(function(k){ have[k]=data[k]; });
        touched=true;
      }
      return;
    }
    SCHEDULES.push(data); touched=true;
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!SCHSYNC.ready&&!fromCache){ SCHSYNC.ready=true; schsyncUploadNew(); }
  if(touched){
    try{ storeTouch(); }catch(e){}
    /* Somebody else's hours changing is exactly the thing the day board is
       for, so repaint whatever is open rather than waiting for a navigation. */
    try{ if(typeof renderAssignPeople==='function') renderAssignPeople(); }catch(e){}
    try{ if(typeof renderTasks==='function') renderTasks(); }catch(e){}
    try{ if(typeof renderProfileSchedule==='function') renderProfileSchedule(); }catch(e){}
    try{ schsyncRepaint(); }catch(e){}
  }
}
function schsyncUploadNew(){
  var db=fbDb(); if(!db) return 0;
  var n=0;
  SCHEDULES.slice().forEach(function(r){
    if(!r||!r.id) return;
    var id=String(r.id);
    if(SCHSYNC.seen[id]!==undefined) return;
    if(!schCanPush(r)) return;
    var doc=schDoc(r); if(!doc) return;
    SCHSYNC.seen[id]=JSON.stringify(doc);
    n++; SCHSYNC.up++;
    try{ db.collection(SCHSYNC_COLL).doc(id).set(doc).catch(function(e){ schsyncFail(id,e); }); }
    catch(e){ schsyncFail(id,e); }
  });
  if(n){ try{ toast(n+' schedule'+(n===1?'':'s')+' from this phone sent up'); }catch(e){} }
  return n;
}
/* Never offer the database a write it is going to refuse. A phone holding
   somebody else's schedule (it came down from the shared copy) must not try to
   push it back up, or every tick logs a refusal nobody caused. */
function schCanPush(r){ return !!r&&schedCanEdit(String(r.pid||'')); }
function schsyncFail(id,e){
  SCHSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}
function schPush(){
  if(!SCHSYNC.on||!SCHSYNC.live||!SCHSYNC.ready) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  SCHEDULES.forEach(function(r){
    if(!r||!r.id||!schCanPush(r)) return;
    var id=String(r.id), json=schJson(r);
    if(json===null||SCHSYNC.seen[id]===json) return;
    SCHSYNC.seen[id]=json; n++; SCHSYNC.up++;
    try{ db.collection(SCHSYNC_COLL).doc(id).set(JSON.parse(json)).catch(function(e){ schsyncFail(id,e); }); }
    catch(e){ schsyncFail(id,e); }
  });
  return n;
}
function schsyncTick(){
  if(!SCHSYNC.on) return;
  if(!SCHSYNC.live){ schsyncStart(); return; }
  schPush();
}
function schsyncRepaint(){
  try{
    var d=document.getElementById('s-sharedb');
    if(d&&d.classList.contains('active')&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}
function schsyncSummary(){
  if(!SCHSYNC.on) return 'Off — hours set on this phone stay on it';
  if(SCHSYNC.err) return SCHSYNC.err;
  if(!SCHSYNC.live) return 'Connecting…';
  if(!SCHSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(SCHSYNC.failed).length;
  return SCHSYNC.up+' sent · '+SCHSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}

/* ================= TIME CLOCK ================= */
/* The punches live inside the Time Clock's own closure, so this module talks
   to them through the three doors it opens: tcPunchDocs(), tcApplyRemote()
   and tcDropRemote(). Reaching in any other way would mean a second copy of
   the punch list, and two copies of a payroll record is how hours go missing. */
var TCSYNC_COLL='punches';
var TCSYNC_RETRY_MS=10000;
var TCSYNC={ on:false, live:false, ready:false, seen:{}, err:null, up:0, down:0, failed:{} };
var _tcsyncNextTry=0;

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function tcsyncWanted(){ return true; }
function tcsyncHydrate(){ TCSYNC.on=tcsyncWanted(); }
function tcsyncSetWanted(on){
  TCSYNC.on=!!on;
  if(on){ _tcsyncNextTry=0; tcsyncStart(); } else tcsyncStop();
}
function tcDoc(p){
  var out; try{ out=JSON.parse(JSON.stringify(p||{})); }catch(e){ return null; }
  if(!out||!out.id||!out.pid||!out.date) return null;
  out.id=String(out.id); out.pid=String(out.pid); out.date=String(out.date);
  if(out.out===undefined) out.out=null;
  return out;
}
function tcJson(p){ var d=tcDoc(p); return d?JSON.stringify(d):null; }
function tcAllDocs(){
  try{ return (typeof window.tcPunchDocs==='function')?(window.tcPunchDocs()||[]):[]; }catch(e){ return []; }
}
function tcCanPush(p){ return !!p&&tcCanPunchFor(String(p.pid||'')); }

function tcsyncStart(){
  if(TCSYNC.live) return true;
  if(Date.now()<_tcsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    TCSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _tcsyncNextTry=Date.now()+TCSYNC_RETRY_MS; return false;
  }
  try{
    TCSYNC.unsub=db.collection(TCSYNC_COLL).onSnapshot(snapOpts(),tcsyncOnSnapshot,function(e){
      TCSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
      TCSYNC.live=false; TCSYNC.ready=false; _tcsyncNextTry=Date.now()+TCSYNC_RETRY_MS;
    });
    TCSYNC.live=true; TCSYNC.err=null; return true;
  }catch(e){
    TCSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _tcsyncNextTry=Date.now()+TCSYNC_RETRY_MS; return false;
  }
}
function tcsyncStop(){
  try{ if(TCSYNC.unsub) TCSYNC.unsub(); }catch(e){}
  TCSYNC.unsub=null; TCSYNC.live=false; TCSYNC.ready=false;
  TCSYNC.seen={}; TCSYNC.failed={};
}
function tcsyncOnSnapshot(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var add=[], drop=[];
  changes.forEach(function(ch){
    if(ch.type==='removed'){ delete TCSYNC.seen[String(ch.doc.id)]; drop.push(String(ch.doc.id)); return; }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data||!data.pid||!data.date) return;
    data.id=String(ch.doc.id);
    TCSYNC.seen[data.id]=JSON.stringify(data);
    delete TCSYNC.failed[data.id];
    TCSYNC.down++;
    add.push(data);
  });
  var touched=false;
  if(drop.length){ try{ touched=!!window.tcDropRemote(drop)||touched; }catch(e){} }
  if(add.length){ try{ touched=!!window.tcApplyRemote(add)||touched; }catch(e){} }
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!TCSYNC.ready&&!fromCache){ TCSYNC.ready=true; tcsyncUploadNew(); }
  if(touched){ try{ tcsyncRepaint(); }catch(e){} }
}
function tcsyncUploadNew(){
  var db=fbDb(); if(!db) return 0;
  var n=0;
  tcAllDocs().forEach(function(p){
    if(!p||!p.id) return;
    var id=String(p.id);
    if(TCSYNC.seen[id]!==undefined) return;
    if(!tcCanPush(p)) return;
    var doc=tcDoc(p); if(!doc) return;
    TCSYNC.seen[id]=JSON.stringify(doc);
    n++; TCSYNC.up++;
    try{ db.collection(TCSYNC_COLL).doc(id).set(doc).catch(function(e){ tcsyncFail(id,e); }); }
    catch(e){ tcsyncFail(id,e); }
  });
  if(n){ try{ toast(n+' punch'+(n===1?'':'es')+' from this phone sent up'); }catch(e){} }
  return n;
}
function tcsyncFail(id,e){
  TCSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}
function tcPush(){
  if(!TCSYNC.on||!TCSYNC.live||!TCSYNC.ready) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  tcAllDocs().forEach(function(p){
    if(!p||!p.id||!tcCanPush(p)) return;
    var id=String(p.id), json=tcJson(p);
    if(json===null||TCSYNC.seen[id]===json) return;
    TCSYNC.seen[id]=json; n++; TCSYNC.up++;
    try{ db.collection(TCSYNC_COLL).doc(id).set(JSON.parse(json)).catch(function(e){ tcsyncFail(id,e); }); }
    catch(e){ tcsyncFail(id,e); }
  });
  return n;
}
function tcsyncTick(){
  if(!TCSYNC.on) return;
  if(!TCSYNC.live){ tcsyncStart(); return; }
  tcPush();
}
function tcsyncRepaint(){
  try{
    var d=document.getElementById('s-sharedb');
    if(d&&d.classList.contains('active')&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}
function tcsyncSummary(){
  if(!TCSYNC.on) return 'Off — this phone keeps its own hours';
  if(TCSYNC.err) return TCSYNC.err;
  if(!TCSYNC.live) return 'Connecting…';
  if(!TCSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(TCSYNC.failed).length;
  return TCSYNC.up+' sent · '+TCSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}


/* ================= EQUIPMENT ================= */
/* Drawer 8. The machines and what is wrong with them.

   THE PROBLEM THIS SOLVES, plainly: somebody marks a mower down on their phone
   and nobody else finds out. It still reads "Available" on the other
   twenty-two phones, so the next person walks out to a machine that does not
   run. The same is true of every service record and every reported problem --
   each one has lived on exactly one phone, and died with it.

   FOUR LISTS, not five. Machines, problems, service history, service
   schedules. EQCHECKOUT is deliberately left out: the machine detail page
   reads it, but nothing in the app has ever written to it, so it is empty on
   every phone. Sharing an empty list would mean a database rule guarding
   nothing. See docs/DECISIONS.md.

   ---- who may change what ----
   ONE function each, transcribed into firestore.rules. A drawer means a
   function, not a rule invented in the rules file.

   All four read the ROSTER, never currentRole. The equipment screens used to
   ask currentRole, which is fine for deciding which buttons to draw and wrong
   for anything the database enforces: it is set once at sign-in, it changes
   when somebody switches user, and the App Manager post used to overwrite it
   outright. The database reads the roster, so these have to as well, or the
   app's copy of the org chart and the database's copy drift and the app starts
   offering buttons whose writes are refused. */

/* Reporting a problem is now everybody's, undergraduates included -- Dillon's
   call, 2026-08-30. They are the ones on the mowers and are usually first to
   notice. Reporting only raises a flag; it does NOT take the machine out of
   service, which is the separate and narrower eqCanTakeDown() below. */
function eqCanReportProblem(){
  if(!SESSION.pid) return false;
  /* Signed in AND still on the roster -- the first thing every rule in
     firestore.rules checks. Somebody switched off keeps their screens until
     they reload; the database stops taking their writes immediately. */
  return !(typeof personActive==='function'&&!personActive(SESSION.pid));
}
/* Taking a machine DOWN takes it out of everyone's day, so it stays with Bill
   and the technicians -- the people who answer for whether it runs. A grad who
   finds a machine unsafe reports it, and that flag is visible to everybody. */
function eqCanTakeDown(){ return eqRoleIs(['Farm Manager','Technician']); }
/* Deciding what a machine IS -- its name, model, hours, whether it is retired
   -- rather than recording what happened to it. Faculty are in because a lab's
   own equipment is theirs to describe. */
function eqCanEditMachine(){ return eqRoleIs(['Farm Manager','Technician','Faculty']); }
/* Service history and the service intervals: the maintenance record, which is
   the technicians' job and Bill's. */
function eqCanMaintain(){ return eqRoleIs(['Farm Manager','Technician']); }

function eqRoleIs(roles){
  if(!SESSION.pid) return false;
  if(typeof personActive==='function'&&!personActive(SESSION.pid)) return false;
  if(typeof personRole!=='function') return false;
  return roles.indexOf(personRole(SESSION.pid))>=0;
}


/* ---- the four lists, and how each one merges ----------------------------
   The drawer is driven from this table rather than from four near-identical
   copies of the module below it. That is a deliberate difference from the
   other drawers and it is worth a sentence: four pasted copies would be about
   five hundred lines in which one copy can carry a typo that nothing catches,
   because each collection is exercised so rarely. A table of four is something
   a person can read in one go and check. Everything OUTSIDE this module --
   eqsyncTick, eqsyncHydrate, eqsyncSummary, the state object -- is shaped
   exactly like the other ten drawers.

   The lists are reached through get() rather than captured here, for two
   reasons: this file loads before app-04-spray-inventory.js, where they are
   declared; and storeHydrate fills them in place, so a captured reference
   would be right today and quietly wrong the day somebody reassigns one.
   STORE_DEFS uses get() for the same reason.

   MUTABLE says whether a record legitimately changes after it is written:
     machines   - yes. Status, hours, whether it is retired.
     problems   - yes. Opened, then resolved.
     schedules  - yes. Intervals get edited.
     history    - NO. A service either happened or it did not, so an incoming
                  row this phone already holds is left ALONE rather than
                  overwritten. Same rule as stock movements and the field log:
                  a rewrite arriving from anywhere is a bug somewhere else. */
var EQSYNC_MACHINES='equipment';
var EQSYNC_PROBLEMS='eqproblems';
var EQSYNC_MAINT='eqmaint';
var EQSYNC_SCHED='eqsched';
var EQSYNC_RETRY_MS=10000;

var EQSYNC={ on:false, live:false, ready:false, seen:{}, err:null, up:0, down:0,
             failed:{}, unsub:{} };
var _eqsyncNextTry=0;

function eqsyncTables(){
  return [
    { coll:EQSYNC_MACHINES, mutable:true,  what:'machine',
      get:function(){return EQUIP;},      can:function(){return eqCanEditMachine();} },
    { coll:EQSYNC_PROBLEMS, mutable:true,  what:'problem',
      get:function(){return EQPROBLEMS;}, can:function(){return eqCanReportProblem();} },
    { coll:EQSYNC_SCHED,    mutable:true,  what:'service schedule',
      get:function(){return EQSCHED;},    can:function(){return eqCanMaintain();} },
    { coll:EQSYNC_MAINT,    mutable:false, what:'service record',
      get:function(){return EQMAINT;},    can:function(){return eqCanMaintain();} }
  ];
}

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function eqsyncWanted(){ return true; }
function eqsyncHydrate(){ EQSYNC.on=eqsyncWanted(); }
function eqsyncSetWanted(on){
  EQSYNC.on=!!on;
  if(on){ _eqsyncNextTry=0; eqsyncStart(); } else eqsyncStop();
}

/* One record, ready to travel. Everything is keyed by id, and a record that
   points at a machine says which one as a string, because a number and the
   same number as text are two different ids to a database. */
function eqDoc(rec){
  var out; try{ out=JSON.parse(JSON.stringify(rec||{})); }catch(e){ return null; }
  if(!out||!out.id) return null;
  out.id=String(out.id);
  if(out.eq!==undefined&&out.eq!==null) out.eq=String(out.eq);
  return out;
}
/* Two records are the same to this drawer if they say the same thing. Keyed by
   collection AND id: a machine and a problem could both be "e1" otherwise. */
function eqKey(coll,id){ return coll+'/'+id; }

function eqsyncStart(){
  if(EQSYNC.live) return true;
  if(Date.now()<_eqsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    EQSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _eqsyncNextTry=Date.now()+EQSYNC_RETRY_MS; return false;
  }
  try{
    eqsyncTables().forEach(function(tab){
      EQSYNC.unsub[tab.coll]=db.collection(tab.coll).onSnapshot(snapOpts(),
        function(snap){ eqsyncOnSnapshot(tab,snap); },
        function(e){
          /* One collection failing is not fatal to the rest — a phone that
             cannot read service history can still be told a mower is down,
             which is the part somebody is standing in a field waiting for. */
          EQSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
          if(tab.coll===EQSYNC_MACHINES){
            EQSYNC.live=false; EQSYNC.ready=false;
            _eqsyncNextTry=Date.now()+EQSYNC_RETRY_MS;
          }
        });
    });
    EQSYNC.live=true; EQSYNC.err=null; return true;
  }catch(e){
    EQSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _eqsyncNextTry=Date.now()+EQSYNC_RETRY_MS; return false;
  }
}
function eqsyncStop(){
  Object.keys(EQSYNC.unsub).forEach(function(k){
    try{ if(EQSYNC.unsub[k]) EQSYNC.unsub[k](); }catch(e){}
  });
  EQSYNC.unsub={}; EQSYNC.live=false; EQSYNC.ready=false;
  EQSYNC.seen={}; EQSYNC.failed={};
}

function eqsyncOnSnapshot(tab,snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var list=tab.get(); if(!list) return;
  var touched=false;
  changes.forEach(function(ch){
    var id=String(ch.doc.id), key=eqKey(tab.coll,id);
    /* Nothing in this drawer is ever deleted — the rules refuse it, and a
       machine is retired with active:false instead. A removal arriving here
       means somebody got into the database another way, so forget it was seen
       and otherwise leave this phone's copy alone. */
    if(ch.type==='removed'){ delete EQSYNC.seen[key]; return; }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data) return;
    data.id=id;
    EQSYNC.seen[key]=JSON.stringify(data);
    delete EQSYNC.failed[key];
    EQSYNC.down++;
    var have=null;
    for(var i=0;i<list.length;i++){ if(String(list[i].id)===id){ have=list[i]; break; } }
    if(have){
      if(!tab.mutable) return;                        /* written once, never rewritten */
      if(JSON.stringify(eqDoc(have))===JSON.stringify(data)) return;
      /* Updated IN PLACE so the closures already holding a reference keep
         pointing at live data — the same rule storeHydrate follows. */
      Object.keys(data).forEach(function(k){ have[k]=data[k]; });
      touched=true;
      return;
    }
    list.push(data); touched=true;
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  /* Ready is decided by the machines, the one collection everything else
     names. Uploading before the shared copy has arrived would send this
     phone's rows back up as if they were new. */
  if(tab.coll===EQSYNC_MACHINES&&!EQSYNC.ready&&!fromCache){
    EQSYNC.ready=true; eqsyncUploadNew();
  }
  if(touched){
    try{ storeTouch(); }catch(e){}
    eqsyncRepaint();
  }
}

function eqsyncRepaint(){
  try{
    var scr=document.querySelector('.screen.active');
    var id=scr?scr.id.replace(/^s-/,''):'';
    /* Only the list screens. Redrawing a detail page or a form under somebody
       who is halfway through filling it in is worse than showing them a stale
       number for a few seconds. */
    if(id==='equipment'&&typeof renderEquip==='function') renderEquip();
    if(id==='sharedb'&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}

/* This phone's equipment records going up for the first time. */
function eqsyncUploadNew(){
  var db=fbDb(); if(!db) return 0;
  try{ if(typeof eqMaintStampIds==='function') eqMaintStampIds(); }catch(e){}
  var n=0;
  eqsyncTables().forEach(function(tab){
    if(!tab.can()) return;
    (tab.get()||[]).slice().forEach(function(rec){
      var doc=eqDoc(rec); if(!doc) return;
      var key=eqKey(tab.coll,doc.id);
      if(EQSYNC.seen[key]!==undefined) return;
      EQSYNC.seen[key]=JSON.stringify(doc);
      n++; EQSYNC.up++;
      try{ db.collection(tab.coll).doc(doc.id).set(doc).catch(function(e){ eqsyncFail(key,e); }); }
      catch(e){ eqsyncFail(key,e); }
    });
  });
  if(n){ try{ toast(n+' equipment record'+(n===1?'':'s')+' from this phone sent up'); }catch(e){} }
  return n;
}
function eqsyncFail(key,e){
  EQSYNC.failed[key]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}

/* Outbound. Each list only goes up from somebody the app already lets change
   it, so the screens and the rules agree and nothing is sent that the database
   is only going to refuse. */
function eqPush(){
  if(!EQSYNC.on||!EQSYNC.live||!EQSYNC.ready) return 0;
  var db=fbDb(); if(!db) return 0;
  try{ if(typeof eqMaintStampIds==='function') eqMaintStampIds(); }catch(e){}
  var n=0;
  eqsyncTables().forEach(function(tab){
    if(!tab.can()) return;
    (tab.get()||[]).forEach(function(rec){
      var doc=eqDoc(rec); if(!doc) return;
      var key=eqKey(tab.coll,doc.id), json=JSON.stringify(doc);
      if(EQSYNC.seen[key]===json) return;
      EQSYNC.seen[key]=json; n++; EQSYNC.up++;
      try{ db.collection(tab.coll).doc(doc.id).set(doc).catch(function(e){ eqsyncFail(key,e); }); }
      catch(e){ eqsyncFail(key,e); }
    });
  });
  return n;
}

function eqsyncTick(){
  if(!EQSYNC.on) return;
  if(!EQSYNC.live){ eqsyncStart(); return; }
  eqPush();
}

function eqsyncSummary(){
  if(!EQSYNC.on) return 'Off — a machine marked down stays known to this phone';
  if(EQSYNC.err) return EQSYNC.err;
  if(!EQSYNC.live) return 'Connecting…';
  if(!EQSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(EQSYNC.failed).length;
  return EQSYNC.up+' sent · '+EQSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}


/* ================= THE CALENDAR ================= */
/* Drawer 9, and the last of them.

   THE PROBLEM THIS SOLVES: five people keeping five versions of the same
   month. A spray somebody put on their own calendar is a spray nobody else
   knows about, and time off logged on a phone is time off Bill never sees
   until the person does not turn up.

   ---- who may change what ----
   ONE function each, transcribed into firestore.rules, and both read the
   ROSTER rather than currentRole for the same reason the equipment checks do:
   these are about to be enforced by the database, and currentRole is a screen
   state that drifts.

   ON READING. Anybody signed in can read the whole calendar, which is the
   same rule every other drawer uses -- including the time clock's punches and
   the weekly schedules, both of which are more personal than a day off.
   Dillon's call, 2026-08-30, made knowing what it means: an undergrad's phone
   HOLDS everybody's time off even though it only ever DRAWS their own. The
   alternative -- the database refusing records that are not yours -- would
   need a different query per person, which no drawer does, and would make
   this the only collection of its kind. If that ever changes it has to change
   for punches and schedules too. */

/* Which kinds of entry a person may add. This is the list the Add screen is
   built from, so it is also the list the database will accept.
     Bill        - everything, including putting somebody down as out
     tech / grad - farm work: an event, a spray, a trial, anything else
     faculty     - events and trials; sprays are the crew's to schedule
     undergrad   - their own time off, and nothing else */
function calAddTypesFor(pid){
  var who=pid||SESSION.pid;
  if(!who) return [];
  if(typeof personActive==='function'&&!personActive(who)) return [];
  var role=(typeof personRole==='function')?personRole(who):null;
  if(role==='Farm Manager')          return ['crew','event','spray','trial','other'];
  if(role==='Technician'||role==='Graduate Student') return ['event','spray','trial','other'];
  if(role==='Faculty')               return ['event','trial','other'];
  if(role==='Undergraduate Student') return ['timeoff'];
  return [];
}
function calCanAddType(type){ return calAddTypesFor(SESSION.pid).indexOf(type)>=0; }

/* Taking an entry OFF the calendar. Bill may remove anything, because a wrong
   entry on the farm's month is his to fix. Everybody else may remove their own
   time off and nothing else -- Dillon's call, 2026-08-30, so somebody who
   mistypes their own day off can undo it without going to find him. */
function calCanRemoveEvent(ev){
  if(!ev||!SESSION.pid) return false;
  if(typeof personActive==='function'&&!personActive(SESSION.pid)) return false;
  if(typeof personRole==='function'&&personRole(SESSION.pid)==='Farm Manager') return true;
  return ev.type==='crew' && !!ev.person && String(ev.person)===String(SESSION.pid);
}


/* ---- the drawer ----------------------------------------------------------
   Same shape as the others. The collection is called `events`; the state
   object is EVSYNC rather than CSYNC, because CSYNC was taken years ago by the
   crew claims on the task board and renaming it now would rewrite ten
   comments that refer to it. */
var EVSYNC_COLL='events';
var EVSYNC_RETRY_MS=10000;
var EVSYNC={ on:false, live:false, ready:false, seen:{}, err:null, up:0, down:0, failed:{} };
var _evsyncNextTry=0;

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function evsyncWanted(){ return true; }
function evsyncHydrate(){ EVSYNC.on=evsyncWanted(); }
function evsyncSetWanted(on){
  EVSYNC.on=!!on;
  if(on){ _evsyncNextTry=0; evsyncStart(); } else evsyncStop();
}

function evFind(id){
  for(var i=0;i<EVENTS.length;i++){ if(String(EVENTS[i].id)===String(id)) return EVENTS[i]; }
  return null;
}
/* One entry, ready to travel. `removed` is always present and always a real
   true/false, so a tombstone is never mistaken for a field somebody forgot. */
function evDoc(ev){
  var out; try{ out=JSON.parse(JSON.stringify(ev||{})); }catch(e){ return null; }
  if(!out||!out.id||!out.date||!out.type) return null;
  out.id=String(out.id); out.date=String(out.date); out.type=String(out.type);
  if(out.person!==undefined&&out.person!==null) out.person=String(out.person);
  out.removed=!!out.removed;
  return out;
}
function evJson(ev){ var d=evDoc(ev); return d?JSON.stringify(d):null; }

/* What this phone is allowed to send. An entry only goes up from somebody the
   app would have let make it, so the screens and the rules agree and nothing
   is sent that the database is only going to refuse.

   A time-off entry is a 'crew' entry carrying the person's own id, so it is
   checked against that rather than against the type list -- an undergrad may
   add their own time off and nothing else. */
function evCanPush(ev){
  if(!ev) return false;
  if(ev.removed) return (typeof calCanRemoveEvent==='function')&&calCanRemoveEvent(ev);
  if(ev.type==='crew'&&ev.person&&String(ev.person)===String(SESSION.pid)) return true;
  return (typeof calCanAddType==='function')&&calCanAddType(ev.type);
}

function evsyncStart(){
  if(EVSYNC.live) return true;
  if(Date.now()<_evsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    EVSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _evsyncNextTry=Date.now()+EVSYNC_RETRY_MS; return false;
  }
  try{
    EVSYNC.unsub=db.collection(EVSYNC_COLL).onSnapshot(snapOpts(),evsyncOnSnapshot,function(e){
      EVSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
      EVSYNC.live=false; EVSYNC.ready=false; _evsyncNextTry=Date.now()+EVSYNC_RETRY_MS;
    });
    EVSYNC.live=true; EVSYNC.err=null; return true;
  }catch(e){
    EVSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _evsyncNextTry=Date.now()+EVSYNC_RETRY_MS; return false;
  }
}
function evsyncStop(){
  try{ if(EVSYNC.unsub) EVSYNC.unsub(); }catch(e){}
  EVSYNC.unsub=null; EVSYNC.live=false; EVSYNC.ready=false;
  EVSYNC.seen={}; EVSYNC.failed={};
}

function evsyncOnSnapshot(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    if(ch.type==='removed'){
      /* Somebody deleted the document outright rather than marking it removed
         -- not something this app does, but the console can. Treat it as a
         removal rather than leaving the entry sitting on everyone's month. */
      delete EVSYNC.seen[String(ch.doc.id)];
      var had=evFind(String(ch.doc.id));
      if(had&&!had.removed){ had.removed=true; touched=true; }
      return;
    }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data||!data.date||!data.type) return;
    data.id=String(ch.doc.id);
    EVSYNC.seen[data.id]=JSON.stringify(data);
    delete EVSYNC.failed[data.id];
    EVSYNC.down++;
    var have=evFind(data.id);
    if(have){
      if(JSON.stringify(evDoc(have))!==JSON.stringify(data)){
        /* Updated IN PLACE, and fields the shared copy no longer has are
           dropped, so an entry cannot keep a stale value forever. */
        Object.keys(have).forEach(function(k){ if(!(k in data)) delete have[k]; });
        Object.keys(data).forEach(function(k){ have[k]=data[k]; });
        touched=true;
      }
      return;
    }
    EVENTS.push(data); touched=true;
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!EVSYNC.ready&&!fromCache){ EVSYNC.ready=true; evsyncUploadNew(); }
  if(touched){
    try{ storeTouch(); }catch(e){}
    evsyncRepaint();
  }
}

function evsyncRepaint(){
  try{
    var scr=document.querySelector('.screen.active');
    var id=scr?scr.id.replace(/^s-/,''):'';
    /* Only the month itself and the read-out. Redrawing the Add form under
       somebody halfway through filling it in is worse than a stale month. */
    if(id==='calendar'&&typeof renderCalBody==='function') renderCalBody();
    if(id==='sharedb'&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}

/* This phone's calendar going up for the first time. */
function evsyncUploadNew(){
  var db=fbDb(); if(!db) return 0;
  var n=0;
  EVENTS.slice().forEach(function(ev){
    if(!ev||!ev.id) return;
    var id=String(ev.id);
    if(EVSYNC.seen[id]!==undefined) return;
    if(!evCanPush(ev)) return;
    var doc=evDoc(ev); if(!doc) return;
    EVSYNC.seen[id]=JSON.stringify(doc);
    n++; EVSYNC.up++;
    try{ db.collection(EVSYNC_COLL).doc(id).set(doc).catch(function(e){ evsyncFail(id,e); }); }
    catch(e){ evsyncFail(id,e); }
  });
  if(n){ try{ toast(n+' calendar entr'+(n===1?'y':'ies')+' from this phone sent up'); }catch(e){} }
  return n;
}
function evsyncFail(id,e){
  EVSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}

function evPush(){
  if(!EVSYNC.on||!EVSYNC.live||!EVSYNC.ready) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  EVENTS.forEach(function(ev){
    if(!ev||!ev.id||!evCanPush(ev)) return;
    var id=String(ev.id), json=evJson(ev);
    if(json===null||EVSYNC.seen[id]===json) return;
    EVSYNC.seen[id]=json; n++; EVSYNC.up++;
    try{ db.collection(EVSYNC_COLL).doc(id).set(JSON.parse(json)).catch(function(e){ evsyncFail(id,e); }); }
    catch(e){ evsyncFail(id,e); }
  });
  return n;
}

function evsyncTick(){
  if(!EVSYNC.on) return;
  if(!EVSYNC.live){ evsyncStart(); return; }
  evPush();
}

function evsyncSummary(){
  if(!EVSYNC.on) return 'Off — this phone keeps its own month';
  if(EVSYNC.err) return EVSYNC.err;
  if(!EVSYNC.live) return 'Connecting…';
  if(!EVSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(EVSYNC.failed).length;
  return EVSYNC.up+' sent · '+EVSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}


/* ================= THE TASK LIST ================= */
/* Drawer 7. The jobs the farm does, which the assign screen is built from --
   so with this off, a job Bill adds on his phone is a job nobody else can hand
   out. Same shape as the others.

   The one difference: this collection allows DELETE, because a job can be
   taken off the list. A removal travels as a document marked `removed`, never
   as a missing document -- a phone that was switched off still holds its own
   copy of the list, and on being switched on it pushes up everything the
   shared copy lacks. Against a real deletion that resurrects the job. Against
   a tombstone it does not. */
var TPLSYNC_COLL='templates';
var TPLSYNC_RETRY_MS=10000;
var TPLSYNC={ on:false, live:false, ready:false, seen:{}, err:null, up:0, down:0, failed:{} };
var _tplsyncNextTry=0;

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function tplsyncWanted(){ return true; }
function tplsyncHydrate(){ TPLSYNC.on=tplsyncWanted(); }
function tplsyncSetWanted(on){
  TPLSYNC.on=!!on;
  if(on){ _tplsyncNextTry=0; tplsyncStart(); } else tplsyncStop();
}
function tplDoc(t){
  var out; try{ out=JSON.parse(JSON.stringify(t||{})); }catch(e){ return null; }
  if(!out||!out.id||typeof out.name!=='string') return null;
  out.id=String(out.id);
  out.removed=!!out.removed;
  return out;
}
function tplJson(t){ var d=tplDoc(t); return d?JSON.stringify(d):null; }

function tplsyncStart(){
  if(TPLSYNC.live) return true;
  if(Date.now()<_tplsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    TPLSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _tplsyncNextTry=Date.now()+TPLSYNC_RETRY_MS; return false;
  }
  try{
    TPLSYNC.unsub=db.collection(TPLSYNC_COLL).onSnapshot(snapOpts(),tplsyncOnSnapshot,function(e){
      TPLSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
      TPLSYNC.live=false; TPLSYNC.ready=false; _tplsyncNextTry=Date.now()+TPLSYNC_RETRY_MS;
    });
    TPLSYNC.live=true; TPLSYNC.err=null; return true;
  }catch(e){
    TPLSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _tplsyncNextTry=Date.now()+TPLSYNC_RETRY_MS; return false;
  }
}
function tplsyncStop(){
  try{ if(TPLSYNC.unsub) TPLSYNC.unsub(); }catch(e){}
  TPLSYNC.unsub=null; TPLSYNC.live=false; TPLSYNC.ready=false;
  TPLSYNC.seen={}; TPLSYNC.failed={};
}
function tplsyncOnSnapshot(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    if(ch.type==='removed'){
      /* Someone deleted the document outright rather than marking it removed
         -- not something this app does, but the console can. Treat it as a
         removal rather than pretending the job is still on the list. */
      delete TPLSYNC.seen[String(ch.doc.id)];
      var had=tplFind(String(ch.doc.id));
      if(had&&!had.removed){ had.removed=true; touched=true; }
      return;
    }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data||typeof data.name!=='string') return;
    data.id=String(ch.doc.id);
    TPLSYNC.seen[data.id]=JSON.stringify(data);
    delete TPLSYNC.failed[data.id];
    TPLSYNC.down++;
    var have=tplFind(data.id);
    if(have){
      if(JSON.stringify(tplDoc(have))!==JSON.stringify(data)){
        Object.keys(have).forEach(function(k){ if(!(k in data)) delete have[k]; });
        Object.keys(data).forEach(function(k){ have[k]=data[k]; });
        touched=true;
      }
      return;
    }
    TEMPLATES.push(data); touched=true;
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!TPLSYNC.ready&&!fromCache){ TPLSYNC.ready=true; tplsyncUploadNew(); }
  if(touched){
    try{ storeTouch(); }catch(e){}
    /* The assign screen and the task list are both built from this, so repaint
       whichever is open instead of waiting for a navigation. */
    try{ if(document.getElementById('s-templates').classList.contains('active')&&typeof renderTemplates==='function') renderTemplates(); }catch(e){}
    try{ if(document.getElementById('s-assign').classList.contains('active')&&typeof renderAssignList==='function') renderAssignList(); }catch(e){}
    try{ tplsyncRepaint(); }catch(e){}
  }
}
/* Never offer a write that is going to be refused: an undergrad's phone holds
   the list too, and pushing it back up would log a refusal nobody caused. */
function tplCanPush(){ return tplCanEdit(); }
function tplsyncUploadNew(){
  var db=fbDb(); if(!db||!tplCanPush()) return 0;
  var n=0;
  TEMPLATES.slice().forEach(function(t){
    if(!t||!t.id) return;
    var id=String(t.id);
    if(TPLSYNC.seen[id]!==undefined) return;
    var doc=tplDoc(t); if(!doc) return;
    TPLSYNC.seen[id]=JSON.stringify(doc);
    n++; TPLSYNC.up++;
    try{ db.collection(TPLSYNC_COLL).doc(id).set(doc).catch(function(e){ tplsyncFail(id,e); }); }
    catch(e){ tplsyncFail(id,e); }
  });
  if(n){ try{ toast(n+' job'+(n===1?'':'s')+' from this phone sent up'); }catch(e){} }
  return n;
}
function tplsyncFail(id,e){
  TPLSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}
function tplPush(){
  if(!TPLSYNC.on||!TPLSYNC.live||!TPLSYNC.ready||!tplCanPush()) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  TEMPLATES.forEach(function(t){
    if(!t||!t.id) return;
    var id=String(t.id), json=tplJson(t);
    if(json===null||TPLSYNC.seen[id]===json) return;
    TPLSYNC.seen[id]=json; n++; TPLSYNC.up++;
    try{ db.collection(TPLSYNC_COLL).doc(id).set(JSON.parse(json)).catch(function(e){ tplsyncFail(id,e); }); }
    catch(e){ tplsyncFail(id,e); }
  });
  return n;
}
function tplsyncTick(){
  if(!TPLSYNC.on) return;
  if(!TPLSYNC.live){ tplsyncStart(); return; }
  tplPush();
}
function tplsyncRepaint(){
  try{
    var d=document.getElementById('s-sharedb');
    if(d&&d.classList.contains('active')&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}
function tplsyncSummary(){
  if(!TPLSYNC.on) return 'Off — the list on this phone stays on it';
  if(TPLSYNC.err) return TPLSYNC.err;
  if(!TPLSYNC.live) return 'Connecting…';
  if(!TPLSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(TPLSYNC.failed).length;
  return TPLSYNC.up+' sent · '+TPLSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}

/* ================= TRIALS AND RESTRICTIONS ================= */
/* The studies running on the farm, and the restrictions they put on the
   ground: no mow, no spray, no irrigate. With this off, a restriction saved on
   one phone is invisible to the person who turns up with the mower -- which is
   the single most expensive thing in this app to get wrong.

   TWO collections, on purpose, and this is the whole design:

     trials/{id}      the study itself. Only that study's lab may write it.
     triallifts/{rid} one tiny record per LIFTED restriction. The lab may write
                      one, and so may Bill.

   Dillon, 2026-08-26: Bill can take a restriction off anybody's study and can
   change nothing else about it. If the lift lived inside the study document,
   that sentence would be unenforceable -- letting Bill write the study to lift
   one restriction lets him write everything else in it at the same time, and
   the database has no way to tell the difference. Splitting the lift out makes
   the rule exactly as narrow as the sentence: the study document stays
   lab-only, and Bill's name only ever appears on the lift.

   It also means a lab saving its study can never wipe a lift, and Bill lifting
   can never overwrite an edit the lab made a second earlier. Nobody has to win
   a race that nobody knew they were in.

   Removals travel as records (see trMarkGone), never as missing documents. */
var TRSYNC_COLL='trials';
var TRSYNC_LIFTS='triallifts';
var TRSYNC_RETRY_MS=10000;
var TRSYNC={ on:false, live:false, liveLifts:false, ready:false, readyLifts:false,
             seen:{}, liftSeen:{}, lifts:{}, err:null, up:0, down:0, failed:{} };
var _trsyncNextTry=0;

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function trsyncWanted(){ return true; }
function trsyncHydrate(){ TRSYNC.on=trsyncWanted(); }
function trsyncSetWanted(on){
  TRSYNC.on=!!on;
  if(on){ _trsyncNextTry=0; trsyncStart(); } else trsyncStop();
}

/* ---- what goes up ----
   The study, with every trace of lift state stripped out of its restrictions.
   Whether a restriction is lifted is answered by triallifts and by nothing
   else; a copy of the answer inside the study document would be a second
   source of truth, and the two would disagree the first time Bill lifted
   something while the lab was editing. */
function trTrialDoc(t){
  var out; try{ out=JSON.parse(JSON.stringify(t||{})); }catch(e){ return null; }
  if(!out||!out.id||typeof out.title!=='string') return null;
  out.id=String(out.id);
  out.lab=String(out.lab||'');
  if(!out.lab) return null;
  out.removed=false;
  (out.restrictions||[]).forEach(function(r){
    if(!r) return;
    delete r.lifted; delete r.liftedBy; delete r.liftedByPid;
  });
  return out;
}
function trGoneDoc(g){
  if(!g||!g.id||!g.lab) return null;
  return { id:String(g.id), lab:String(g.lab), title:String(g.title||''), removed:true,
           removedBy:String(g.removedBy||''), removedByPid:String(g.removedByPid||''),
           removedAt:String(g.removedAt||'') };
}
function trLiftDoc(t,r){
  if(!t||!r||!r.id||!r.lifted) return null;
  return { id:String(r.id), trialId:String(t.id), lab:String(t.lab||''),
           lifted:String(r.lifted), liftedBy:String(r.liftedBy||''),
           liftedByPid:String(r.liftedByPid||'') };
}
function trTrialJson(t){ var d=trTrialDoc(t); return d?JSON.stringify(d):null; }
function trLiftJson(t,r){ var d=trLiftDoc(t,r); return d?JSON.stringify(d):null; }

/* ---- what this phone is allowed to offer ----
   Never offer a write that is going to be refused: every phone holds a copy of
   every study, and pushing back the ones this person cannot edit would log a
   pile of refusals nobody caused. */
function trsyncCanPushTrial(t){ return !!t && trCanEditLab(t.lab); }
function trsyncCanPushLift(t){ return !!t && (trCanEditLab(t.lab)||trCanLiftAny()); }

function trsyncStart(){
  if(TRSYNC.live&&TRSYNC.liveLifts) return true;
  if(Date.now()<_trsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    TRSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _trsyncNextTry=Date.now()+TRSYNC_RETRY_MS; return false;
  }
  try{
    if(!TRSYNC.live){
      TRSYNC.unsub=db.collection(TRSYNC_COLL).onSnapshot(snapOpts(),trsyncOnTrials,function(e){ trsyncDown(e); });
      TRSYNC.live=true;
    }
    if(!TRSYNC.liveLifts){
      TRSYNC.unsubLifts=db.collection(TRSYNC_LIFTS).onSnapshot(snapOpts(),trsyncOnLifts,function(e){ trsyncDown(e); });
      TRSYNC.liveLifts=true;
    }
    TRSYNC.err=null; return true;
  }catch(e){
    trsyncDown(e); return false;
  }
}
function trsyncDown(e){
  TRSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
  TRSYNC.live=false; TRSYNC.liveLifts=false; TRSYNC.ready=false; TRSYNC.readyLifts=false;
  try{ if(TRSYNC.unsub) TRSYNC.unsub(); }catch(_e){}
  try{ if(TRSYNC.unsubLifts) TRSYNC.unsubLifts(); }catch(_e){}
  TRSYNC.unsub=null; TRSYNC.unsubLifts=null;
  _trsyncNextTry=Date.now()+TRSYNC_RETRY_MS;
}
function trsyncStop(){
  try{ if(TRSYNC.unsub) TRSYNC.unsub(); }catch(e){}
  try{ if(TRSYNC.unsubLifts) TRSYNC.unsubLifts(); }catch(e){}
  TRSYNC.unsub=null; TRSYNC.unsubLifts=null;
  TRSYNC.live=false; TRSYNC.liveLifts=false; TRSYNC.ready=false; TRSYNC.readyLifts=false;
  TRSYNC.seen={}; TRSYNC.liftSeen={}; TRSYNC.lifts={}; TRSYNC.failed={};
}

/* Stamp whatever lifts we know about onto a study's restrictions. Called after
   anything replaces a study's contents, so an incoming edit from the lab never
   quietly un-lifts something Bill lifted. */
function trsyncApplyLifts(t){
  if(!t) return false;
  var touched=false;
  (t.restrictions||[]).forEach(function(r){
    if(!r||!r.id) return;
    var L=TRSYNC.lifts[String(r.id)];
    if(!L) return;
    if(r.lifted!==L.lifted||r.liftedBy!==L.liftedBy){
      r.lifted=L.lifted; r.liftedBy=L.liftedBy; r.liftedByPid=L.liftedByPid||''; touched=true;
    }
  });
  return touched;
}

function trsyncOnTrials(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    var id=String(ch.doc.id);
    if(ch.type==='removed'){
      /* Somebody deleted the document outright rather than marking it removed --
         not something this app does, but the Firebase console can. Treat it as
         a removal rather than pretending the study is still running. */
      delete TRSYNC.seen[id];
      var had=trById(id);
      if(had&&trMarkGone(had,'','','')) touched=true;
      return;
    }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data) return;
    data.id=id;
    TRSYNC.seen[id]=JSON.stringify(data);
    delete TRSYNC.failed[id];
    TRSYNC.down++;
    if(data.removed===true){
      var t0=trById(id);
      if(t0){ trMarkGone(t0,data.removedBy||'',data.removedByPid||'',data.removedAt||''); touched=true; }
      else if(!trIsGone(id)){
        TR_GONE.push({id:id,lab:data.lab||'',title:data.title||'',
                      removedBy:data.removedBy||'',removedByPid:data.removedByPid||'',
                      removedAt:data.removedAt||''});
        touched=true;
      }
      return;
    }
    if(trIsGone(id)) return;               /* removed here; our tombstone goes up */
    if(typeof data.title!=='string') return;
    var have=trById(id);
    if(have){
      var mine=JSON.stringify(trTrialDoc(have));
      if(mine!==JSON.stringify(data)){
        Object.keys(have).forEach(function(k){ if(!(k in data)) delete have[k]; });
        Object.keys(data).forEach(function(k){ have[k]=data[k]; });
        trsyncApplyLifts(have);
        touched=true;
      }
      return;
    }
    TRIALS.unshift(data);
    trsyncApplyLifts(data);
    touched=true;
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!TRSYNC.ready&&!fromCache){ TRSYNC.ready=true; trsyncUploadNew(); }
  if(touched) trsyncTouched();
}

function trsyncOnLifts(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    var rid=String(ch.doc.id);
    if(ch.type==='removed'){ delete TRSYNC.liftSeen[rid]; delete TRSYNC.lifts[rid]; return; }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    if(!data||!data.lifted) return;
    data.id=rid;
    TRSYNC.liftSeen[rid]=JSON.stringify(data);
    delete TRSYNC.failed[rid];
    TRSYNC.down++;
    TRSYNC.lifts[rid]={lifted:String(data.lifted),liftedBy:String(data.liftedBy||''),
                       liftedByPid:String(data.liftedByPid||'')};
    TRIALS.forEach(function(t){ if(trsyncApplyLifts(t)) touched=true; });
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!TRSYNC.readyLifts&&!fromCache){ TRSYNC.readyLifts=true; trsyncUploadNew(); }
  if(touched) trsyncTouched();
}

function trsyncTouched(){
  try{ storeTouch(); }catch(e){}
  try{ if(document.getElementById('s-trial').classList.contains('active')&&typeof trRender==='function') trRender(); }catch(e){}
  try{ if(document.getElementById('s-trialdetail').classList.contains('active')&&typeof trRenderDetail==='function') trRenderDetail(); }catch(e){}
  try{ trsyncRepaint(); }catch(e){}
}

function trsyncFail(id,e){
  TRSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}

/* First connection: offer up everything the shared copy has never seen. */
function trsyncUploadNew(){
  if(!TRSYNC.ready||!TRSYNC.readyLifts) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  TRIALS.slice().forEach(function(t){
    if(!t||!t.id||!trsyncCanPushTrial(t)) return;
    var id=String(t.id);
    if(TRSYNC.seen[id]===undefined){
      var doc=trTrialDoc(t); if(!doc) return;
      TRSYNC.seen[id]=JSON.stringify(doc); n++; TRSYNC.up++;
      try{ db.collection(TRSYNC_COLL).doc(id).set(doc).catch(function(e){ trsyncFail(id,e); }); }
      catch(e){ trsyncFail(id,e); }
    }
  });
  TR_GONE.slice().forEach(function(g){
    var doc=trGoneDoc(g); if(!doc||!trCanEditLab(doc.lab)) return;
    if(TRSYNC.seen[doc.id]!==undefined) return;
    TRSYNC.seen[doc.id]=JSON.stringify(doc); n++; TRSYNC.up++;
    try{ db.collection(TRSYNC_COLL).doc(doc.id).set(doc).catch(function(e){ trsyncFail(doc.id,e); }); }
    catch(e){ trsyncFail(doc.id,e); }
  });
  trsyncPushLifts(db);
  if(n){ try{ toast(n+' stud'+(n===1?'y':'ies')+' from this phone sent up'); }catch(e){} }
  return n;
}

function trsyncPushLifts(db){
  var n=0;
  TRIALS.forEach(function(t){
    if(!t||!trsyncCanPushLift(t)) return;
    (t.restrictions||[]).forEach(function(r){
      if(!r||!r.id||!r.lifted) return;
      var rid=String(r.id), json=trLiftJson(t,r);
      if(json===null||TRSYNC.liftSeen[rid]===json) return;
      TRSYNC.liftSeen[rid]=json; n++; TRSYNC.up++;
      try{ db.collection(TRSYNC_LIFTS).doc(rid).set(JSON.parse(json)).catch(function(e){ trsyncFail(rid,e); }); }
      catch(e){ trsyncFail(rid,e); }
    });
  });
  return n;
}

/* The two-second scan. Sends what changed, and nothing else. */
function trsyncPush(){
  if(!TRSYNC.on||!TRSYNC.live||!TRSYNC.ready||!TRSYNC.readyLifts) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  TRIALS.forEach(function(t){
    if(!t||!t.id||!trsyncCanPushTrial(t)) return;
    var id=String(t.id), json=trTrialJson(t);
    if(json===null||TRSYNC.seen[id]===json) return;
    TRSYNC.seen[id]=json; n++; TRSYNC.up++;
    try{ db.collection(TRSYNC_COLL).doc(id).set(JSON.parse(json)).catch(function(e){ trsyncFail(id,e); }); }
    catch(e){ trsyncFail(id,e); }
  });
  TR_GONE.forEach(function(g){
    var doc=trGoneDoc(g); if(!doc||!trCanEditLab(doc.lab)) return;
    var json=JSON.stringify(doc);
    if(TRSYNC.seen[doc.id]===json) return;
    TRSYNC.seen[doc.id]=json; n++; TRSYNC.up++;
    try{ db.collection(TRSYNC_COLL).doc(doc.id).set(doc).catch(function(e){ trsyncFail(doc.id,e); }); }
    catch(e){ trsyncFail(doc.id,e); }
  });
  n+=trsyncPushLifts(db);
  return n;
}
function trsyncTick(){
  if(!TRSYNC.on) return;
  if(!TRSYNC.live||!TRSYNC.liveLifts){ trsyncStart(); return; }
  trsyncPush();
}
function trsyncRepaint(){
  try{
    var d=document.getElementById('s-sharedb');
    if(d&&d.classList.contains('active')&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}
function trsyncSummary(){
  if(!TRSYNC.on) return 'Off — studies and restrictions stay on this phone';
  if(TRSYNC.err) return TRSYNC.err;
  if(!TRSYNC.live||!TRSYNC.liveLifts) return 'Connecting…';
  if(!TRSYNC.ready||!TRSYNC.readyLifts) return 'Connected — waiting for the shared copy';
  var f=Object.keys(TRSYNC.failed).length;
  return TRSYNC.up+' sent · '+TRSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}

/* ================= FARM SETTINGS ================= */
/* The sprayer numbers, the mower list, the labs list and the semester dates.
   Four small things rather than a list of records, so this drawer is shaped
   differently from every other one, in two ways that matter.

   ONE DOCUMENT PER GROUP, not per record. `farmsettings/spray`,
   `farmsettings/mowers`, `farmsettings/labs`, `farmsettings/semesters`.

   AND THE SHARED COPY WINS ON ARRIVAL. Everywhere else a phone that has been
   switched off pushes up whatever the shared copy is missing. That is right for
   a list of jobs and wrong here: these four each have exactly one value, so a
   phone still holding the built-in defaults would not be adding anything, it
   would be overwriting the farm's real settings with them. So: turning the
   switch on TAKES the farm's settings, and this phone only sends a value it
   changes afterwards. The only exception is a group the shared copy has never
   held at all, which the first phone that may edit it seeds.

   "Back to the built-in defaults" travels as a VALUE (`v:null`), never as a
   missing document -- same reasoning as every tombstone in this app. A document
   that simply vanished would be re-seeded from the next phone that connected,
   and the reset would undo itself. */
var FSTSYNC_COLL='farmsettings';
var FSTSYNC_RETRY_MS=10000;
var FSTSYNC={ on:false, live:false, ready:false, seen:{}, err:null, up:0, down:0, failed:{} };
var _fstsyncNextTry=0;

/* One row per group. `read` gives what this phone would send (null meaning the
   built-in defaults), `apply` takes what arrived, `restore` puts the built-in
   values back, and `can` is the same gate the screen uses. */
var FST_GROUPS=[
 {id:'spray', label:'the sprayer numbers',
  can:function(){ return (typeof sprCanEdit==='function')&&sprCanEdit(); },
  read:function(){ var d=sprayDiff(); return (d&&Object.keys(d).length)?d:null; },
  apply:function(v){ sprayApply(v); },
  restore:function(){
    if(!_sprayBase) return;
    var n=null; try{ n=JSON.parse(_sprayBase.nozzles); }catch(e){ n=null; }
    sprayApply({nozzles:n,charge:_sprayBase.charge,over:_sprayBase.over});
  },
  repaint:function(){ _fstRepaint('s-spraysettings','sprRender'); }},

 {id:'mowers', label:'the mower list',
  can:function(){ return (typeof mowCanEdit==='function')&&mowCanEdit(); },
  read:function(){ return mowersDiff(); },
  apply:function(v){ mowersApply(v); },
  restore:function(){ if(_mowersBase){ try{ mowersApply(JSON.parse(_mowersBase)); }catch(e){} } },
  repaint:function(){ _fstRepaint('s-mowersettings','mwsRender'); }},

 {id:'labs', label:'the labs list',
  can:function(){ return (typeof labsCanEdit==='function')&&labsCanEdit(); },
  read:function(){ return labsDiff(); },
  /* labsApply() calls labsRebuild(), which is what carries a lab change into
     the roster dropdown, the calendar filter and the trials legend. */
  apply:function(v){ labsApply(v); },
  restore:function(){ if(_labsBase){ try{ labsApply(JSON.parse(_labsBase)); }catch(e){} } },
  repaint:function(){ _fstRepaint('s-labsettings','lbsRender'); }},

 {id:'semesters', label:'the semester dates',
  can:function(){ return (typeof semCanEdit==='function')&&semCanEdit(); },
  /* Not a diff -- the whole list travels -- but still null while nobody has
     touched it, so an untouched phone never seeds the shared copy. */
  read:function(){ return semIsDefault()?null:FARM_SEMS.slice(); },
  apply:function(v){
    if(!Array.isArray(v)) return;
    var good=v.filter(function(x){ return (typeof semValid==='function')&&semValid(x); });
    if(!good.length) return;
    FARM_SEMS.length=0;
    good.forEach(function(x){ FARM_SEMS.push(x); });
    try{ storeTouch(); }catch(e){}
  },
  restore:function(){
    var b=null; try{ b=JSON.parse(_semBase); }catch(e){ b=null; }
    if(!Array.isArray(b)) return;
    FARM_SEMS.length=0;
    b.forEach(function(x){ FARM_SEMS.push(x); });
    try{ storeTouch(); }catch(e){}
  },
  repaint:function(){ _fstRepaint('s-semsettings','smsRender'); }}
];
function fstGroup(id){
  for(var i=0;i<FST_GROUPS.length;i++) if(FST_GROUPS[i].id===id) return FST_GROUPS[i];
  return null;
}
function _fstRepaint(screenId,fn){
  try{
    var d=document.getElementById(screenId);
    if(d&&d.classList.contains('active')&&typeof window[fn]==='function') window[fn]();
  }catch(e){}
  try{
    var f=document.getElementById('s-farmsettings');
    if(f&&f.classList.contains('active')&&typeof fstRender==='function') fstRender();
  }catch(e){}
}

/* On, always — see "SHARING IS NOT OPTIONAL" over flsyncWanted(). */
function fstsyncWanted(){ return true; }
function fstsyncHydrate(){ FSTSYNC.on=fstsyncWanted(); }
function fstsyncSetWanted(on){
  FSTSYNC.on=!!on;
  if(on){ _fstsyncNextTry=0; fstsyncStart(); } else fstsyncStop();
}
function fstDoc(g){
  var v=null; try{ v=g.read(); }catch(e){ v=null; }
  if(v===undefined) v=null;
  return { id:g.id, v:v,
           updatedAt:new Date().toISOString(),
           updatedBy:(typeof meName==='function'?meName():'')||'',
           updatedByPid:SESSION.pid||'' };
}
/* The comparison ignores who and when — otherwise every phone would send the
   same value back and forth forever, each stamping its own name on it. */
function fstValueJson(g){
  var v=null; try{ v=g.read(); }catch(e){ v=null; }
  if(v===undefined) v=null;
  try{ return JSON.stringify(v===null?null:v); }catch(e){ return null; }
}

function fstsyncStart(){
  if(FSTSYNC.live) return true;
  if(Date.now()<_fstsyncNextTry) return false;
  var db=fbDb();
  if(!db||!SESSION.pid){
    FSTSYNC.err=db?'Nobody is signed in yet':'The database code did not load on this device';
    _fstsyncNextTry=Date.now()+FSTSYNC_RETRY_MS; return false;
  }
  try{
    FSTSYNC.unsub=db.collection(FSTSYNC_COLL).onSnapshot(snapOpts(),fstsyncOnSnapshot,function(e){
      FSTSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
      FSTSYNC.live=false; FSTSYNC.ready=false; _fstsyncNextTry=Date.now()+FSTSYNC_RETRY_MS;
    });
    FSTSYNC.live=true; FSTSYNC.err=null; return true;
  }catch(e){
    FSTSYNC.err=(typeof sdbError==='function')?sdbError(e):String(e&&e.message||e);
    _fstsyncNextTry=Date.now()+FSTSYNC_RETRY_MS; return false;
  }
}
function fstsyncStop(){
  try{ if(FSTSYNC.unsub) FSTSYNC.unsub(); }catch(e){}
  FSTSYNC.unsub=null; FSTSYNC.live=false; FSTSYNC.ready=false;
  FSTSYNC.seen={}; FSTSYNC.failed={};
}
/* Take what arrived. This is the half that makes the shared copy authoritative. */
function fstsyncApplyDoc(id,data){
  var g=fstGroup(id); if(!g) return false;
  var v=(data&&('v' in data))?data.v:null;
  var mine=fstValueJson(g);
  var theirs; try{ theirs=JSON.stringify(v===undefined?null:v); }catch(e){ return false; }
  FSTSYNC.seen[id]=theirs;
  if(mine===theirs) return false;
  try{
    if(v===null||v===undefined) g.restore();
    else g.apply(v);
  }catch(e){ return false; }
  try{ g.repaint(); }catch(e){}
  return true;
}
function fstsyncOnSnapshot(snap){
  var changes; try{ changes=snap.docChanges(); }catch(e){ return; }
  var touched=false;
  changes.forEach(function(ch){
    var id=String(ch.doc.id);
    if(!fstGroup(id)) return;                    /* a group this version does not know */
    if(ch.type==='removed'){
      /* Not something this app does — the console can. Treat a vanished
         document as "nobody has set this", not as "go back to defaults". */
      delete FSTSYNC.seen[id];
      return;
    }
    var data; try{ data=ch.doc.data(); }catch(e){ return; }
    FSTSYNC.down++;
    delete FSTSYNC.failed[id];
    if(fstsyncApplyDoc(id,data)) touched=true;
  });
  var fromCache=true;
  try{ fromCache=!!(snap.metadata&&snap.metadata.fromCache); }catch(e){}
  if(!FSTSYNC.ready&&!fromCache){ FSTSYNC.ready=true; fstsyncSeed(); }
  if(touched){
    try{ storeTouch(); }catch(e){}
    try{ fstsyncRepaint(); }catch(e){}
  }
}
/* Only groups the shared copy has NEVER held. Anything already up there is the
   farm's answer and this phone does not argue with it. */
function fstsyncSeed(){
  var db=fbDb(); if(!db) return 0;
  var n=0;
  FST_GROUPS.forEach(function(g){
    if(FSTSYNC.seen[g.id]!==undefined) return;
    /* Only a group this phone has actually CHANGED. A phone still on the
       built-in values has nothing to contribute, and seeding "defaults" from it
       would reset the farm for everybody the moment somebody who had set the
       labs up properly connected afterwards. */
    if(fstValueJson(g)==='null') return;
    var may=false; try{ may=!!g.can(); }catch(e){ may=false; }
    if(!may) return;
    var doc=fstDoc(g);
    FSTSYNC.seen[g.id]=fstValueJson(g);
    n++; FSTSYNC.up++;
    try{ db.collection(FSTSYNC_COLL).doc(g.id).set(doc).catch(function(e){ fstsyncFail(g.id,e); }); }
    catch(e){ fstsyncFail(g.id,e); }
  });
  return n;
}
function fstsyncFail(id,e){
  FSTSYNC.failed[id]=(typeof sdbError==='function')?sdbError(e):String((e&&e.message)||e);
}
/* The two-second scan. A group is sent only when what this phone holds has
   moved away from what it last saw on the shared copy. */
function fstsyncPush(){
  if(!FSTSYNC.on||!FSTSYNC.live||!FSTSYNC.ready) return 0;
  var db=fbDb(); if(!db) return 0;
  var n=0;
  FST_GROUPS.forEach(function(g){
    var json=fstValueJson(g);
    if(json===null&&FSTSYNC.seen[g.id]===undefined) return;
    if(FSTSYNC.seen[g.id]===json) return;
    var may=false; try{ may=!!g.can(); }catch(e){ may=false; }
    if(!may) return;                              /* never offer a refused write */
    FSTSYNC.seen[g.id]=json;
    n++; FSTSYNC.up++;
    try{ db.collection(FSTSYNC_COLL).doc(g.id).set(fstDoc(g)).catch(function(e){ fstsyncFail(g.id,e); }); }
    catch(e){ fstsyncFail(g.id,e); }
  });
  return n;
}
function fstsyncTick(){
  if(!FSTSYNC.on) return;
  if(!FSTSYNC.live){ fstsyncStart(); return; }
  fstsyncPush();
}
function fstsyncRepaint(){
  try{
    var d=document.getElementById('s-sharedb');
    if(d&&d.classList.contains('active')&&typeof sdbRender==='function') sdbRender();
  }catch(e){}
}
function fstsyncSummary(){
  if(!FSTSYNC.on) return 'Off — settings changed here stay on this phone';
  if(FSTSYNC.err) return FSTSYNC.err;
  if(!FSTSYNC.live) return 'Connecting…';
  if(!FSTSYNC.ready) return 'Connected — waiting for the shared copy';
  var f=Object.keys(FSTSYNC.failed).length;
  return FSTSYNC.up+' sent · '+FSTSYNC.down+' received'+(f?(' · '+f+' refused'):'');
}

/* ---- the correction sheet ----
   Small on purpose. It offers the things that actually go wrong — the plot,
   the date, the time, and on a chemical entry the product and the amounts —
   and it insists on a sentence saying what was wrong. A correction with no
   reason is only half a record, and the reason is the part somebody reading
   this in three years will actually need. */
function flxPlotOptions(sel){
  var src=[];
  try{ src=(typeof jobAllPlots==='function')?jobAllPlots().concat(['GH']):[]; }catch(e){ src=[]; }
  if(!src.length) src=FL_PLOTS.slice();
  if(sel&&src.indexOf(sel)<0) src.unshift(sel);
  return src.map(function(p){
    return '<option value="'+esc(p)+'"'+(p===sel?' selected':'')+'>'+esc(flPlotLabel(p))+'</option>';
  }).join('');
}
/* ord is YYYYMMDD as an integer; the date input speaks YYYY-MM-DD. */
function flxOrdToInput(o){
  o=+o||0; if(o<10000101) return '';
  var y=Math.floor(o/10000), m=Math.floor(o/100)%100, d=o%100;
  return y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d;
}
function flxInputToOrd(v){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||''); if(!m) return null;
  return (+m[1])*10000+(+m[2])*100+(+m[3]);
}
function flxOrdLabel(o){
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  o=+o||0; if(o<10000101) return '';
  return MON[(Math.floor(o/100)%100)-1]+' '+(o%100);
}

function flxRender(){
  var body=document.getElementById('flx-body'); if(!body) return;
  var a=flById(flCur);
  if(!a){ body.innerHTML='<div class="fl-empty">That entry is gone.</div>'; return; }

  var t=FL_TYPES[a.type]||{label:a.type||''};
  var chem=!!(a.product||a.amount||a.rate||a.target);
  var fld=function(label,inner){
    return '<div class="fld"><span class="fl">'+esc(label)+'</span>'+inner+'</div>';
  };
  var inp=function(id,val,ph){
    return '<input class="inv-in" id="'+id+'" value="'+esc(val==null?'':val)+'"'
          +(ph?(' placeholder="'+esc(ph)+'"'):'')+' style="max-width:210px">';
  };

  body.innerHTML=
     '<div style="margin:14px 16px 0;padding:11px 13px;border:1px solid var(--line);border-radius:12px">'
    +'<div style="font:800 13px \'Archivo\';color:var(--ink)">The original is kept</div>'
    +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:3px;line-height:1.45">'
    +'This does not change the entry. It writes a new one carrying the fix, and marks the old one as '
    +'replaced by it. Both stay in the record, and only the corrected version counts in the totals.'
    +'</div></div>'

    +'<div class="sec">What it says now</div><div class="list">'
    +'<div class="fld"><span class="fl">Entry</span><span class="fv">'+esc(a.title||'')+'</span></div>'
    +'<div class="fld"><span class="fl">Where</span><span class="fv">'+esc(flRowPlot(a.plot))+'</span></div>'
    +'<div class="fld"><span class="fl">When</span><span class="fv">'+esc(a.date||'')+(a.time?(' · '+esc(a.time)):'')+'</span></div>'
    +'<div class="fld" style="border-bottom:none"><span class="fl">Kind</span><span class="fv">'+esc(t.label)+'</span></div>'
    +'</div>'

    +'<div class="sec">What it should say</div><div class="list">'
    +fld('Where','<select class="inv-in" id="flx-plot" style="max-width:210px">'+flxPlotOptions(a.plot)+'</select>')
    +fld('Date','<input class="inv-in" type="date" id="flx-date" value="'+esc(flxOrdToInput(a.ord))+'" style="max-width:170px">')
    +fld('Time',inp('flx-time',a.time,'7:20 AM'))
    +(chem?(fld('Product',inp('flx-product',a.product))
           +fld('Amount used',inp('flx-amount',a.amount))
           +fld('Rate',inp('flx-rate',a.rate))
           +fld('Target',inp('flx-target',a.target))):'')
    +'<div class="fld" style="border-bottom:none;align-items:flex-start"><span class="fl">What was wrong</span>'
    +'<textarea class="inv-in" id="flx-why" rows="3" placeholder="Logged on B12, the mow was actually B13" '
    +'style="max-width:210px;resize:vertical"></textarea></div>'
    +'</div>'
    +'<div style="height:22px"></div>';
}

function flxSave(){
  var a=flById(flCur); if(!a){ toast('That entry is gone'); return; }
  if(!flCan(SESSION.pid,'correct',a)){ toast('You cannot correct this entry'); return; }

  var why=(document.getElementById('flx-why')||{}).value||'';
  if(!why.trim()){ toast('Say what was wrong — it is the part somebody will need later'); return; }

  var changes={}, v;
  var g=function(id){ var el=document.getElementById(id); return el?(el.value||'').trim():null; };

  v=g('flx-plot'); if(v&&v!==a.plot) changes.plot=v;
  v=flxInputToOrd(g('flx-date'));
  if(v&&v!==a.ord){ changes.ord=v; changes.date=flxOrdLabel(v); }
  v=g('flx-time'); if(v!==null&&v!==(a.time||'')) changes.time=v;
  ['product','amount','rate','target'].forEach(function(k){
    var el=document.getElementById('flx-'+k); if(!el) return;
    var nv=(el.value||'').trim();
    if(nv!==(a[k]||'')) changes[k]=nv||null;
  });

  if(!Object.keys(changes).length){ toast('Nothing was changed'); return; }

  var made=flCorrect(a.id,changes,why);
  if(!made){ toast('That could not be corrected'); return; }
  /* If the amount changed, the shelf is now wrong too. Fix it the way the
     field log fixes itself - a NEW movement for the difference, with the
     original left exactly as it was. */
  try{ invReconcileFromLog(a,made); }catch(e){}
  flCur=made.id;
  toast('Corrected ✓ · the original is kept');
  back(); renderFlDetail(); flRender();
}
(function(){
  var b=document.getElementById('flx-save');
  if(b) b.addEventListener('click',flxSave);
})();

let flSugIdx=-1;
function flSugList(q){
 q=(q||'').trim().toLowerCase();
 let src=(typeof jobAllPlots==='function'&&typeof PLOTS_DATA!=='undefined')?jobAllPlots().concat(['GH']):FL_PLOTS;
 let list=src.map(id=>({id,label:flPlotLabel(id),n:flPlotCount(id)}));
 if(q){list=list.filter(p=>p.label.toLowerCase().includes(q)||p.id.toLowerCase()===q||(p.id==='GH'&&'greenhouse'.includes(q)));}
 else{list=list.filter(p=>p.n>0).sort((a,b)=>b.n-a.n).slice(0,6);}
 return list;
}
function flRenderSug(q){
 const box=document.getElementById('fl-plotsug'); if(!box)return;
 const list=flSugList(q); flSugIdx=-1;
 const hint=(!q||!q.trim())?'<div class="sughint">Recommended plots</div>':'';
 box.innerHTML=list.length?hint+list.map(p=>'<div class="s" data-plot="'+p.id+'"><span>'+esc(p.label)+'</span><span class="c">'+p.n+' logged</span></div>').join(''):'<div class="none">No plot matches “'+q+'”</div>';
 box.style.display='block';
}
function flHideSug(){const b=document.getElementById('fl-plotsug');if(b)b.style.display='none';}
function flSyncPlotUI(){
 const tag=document.getElementById('fl-plottag');
 if(tag){tag.innerHTML=flState.plots.length?flState.plots.map(id=>'<span class="fl-tag">'+flPlotLabel(id)+'<span class="x" data-clr="'+id+'">✕</span></span>').join('')+(flState.plots.length>1?'<span class="fl-clear" id="fl-clrall">Clear all</span>':''):'';}
}
function flAddPlot(id){
 if(id&&flState.plots.indexOf(id)<0)flState.plots.push(id);
 const inp=document.getElementById('fl-plotsearch'); if(inp)inp.value='';
 flHideSug(); flSyncPlotUI(); flRender();
}
function flRemovePlot(id){const i=flState.plots.indexOf(id);if(i>=0)flState.plots.splice(i,1);flSyncPlotUI();flRender();}
function flClearPlots(){flState.plots=[];flSyncPlotUI();flRender();}
function openFlFilterPick(){plotPickDone=function(sel){flState.plots=sel.slice();flSyncPlotUI();flRender();};pickOpen('','',flState.plots);go('plotpick');}
function flClassify(t){
 var s=((t.type||'')+' '+(t.title||'')).toLowerCase();
 if(/fungicid|herbicid|insecticid|pesticid|nematicid|fumig|\bspray|pre-?emerg|\bpgr\b|application/.test(s))return 'spray';
 if(/fertil|nutrient|\burea\b|milorganite|\bfeed\b|\bn\/m\b/.test(s))return 'fert';
 if(/irrig|handwater|hand-?water|\bwater\b/.test(s))return 'irrig';
 if(/\bmow\b|mowing|reel mow|rotary|weed ?eat|\btrim\b|\bclip/.test(s))return 'mow';
 if(/aerat|verticut|top-?dress|cultivat|\bcore\b|\bdrag\b|\bsand\b|slice|spike|dethatch|scarif/.test(s))return 'cult';
 return 'misc';
}
function flTodayLabel(){var d=new Date();return d.toLocaleString('en-US',{month:'short'})+' '+d.getDate();}
function flTodayOrd(){var d=new Date();return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();}
function flAddFromTask(t){
 if(!t||t._logged)return false;
 var type=flClassify(t); if(!type)return false;
 var plots=parsePlots(t); if(!plots.length)plots=[(t.area||'—')];
 /* `byId` is what the record stores; `by` is only for the human-readable
    detail line the entry shows on the log. */
 var byId=t.completedBy||t.assignee||SESSION.pid, by=nameOf(byId)||meName(),
     at=fmtTime(t.completedAt)||t.completedAt||nowTime();
 /* A boom spray that was mixed on its task sheet writes the real numbers into
    the record rather than leaving the application blank. */
 var mx=(typeof mixSummaryFor==='function')?mixSummaryFor(t):null;
 /* Carry the whole job over, not just a one-line summary. The detail page reads
    these straight off the task that produced the entry, so the log record and
    the work order never drift apart. */
 plots.forEach(function(p){FIELDLOG.push({
   id:flNewId(),plot:p,type:type,title:t.title,
   detail:(t.type||'Field practice')+' · '+by+' · '+at,
   date:flTodayLabel(),ord:flTodayOrd(),fromTask:true,source:'task',
   taskId:t.id,op:t.type||'Field practice',person:byId,loggedBy:SESSION.pid,time:at,
   equipment:flEqName(t.machine),area:(t.area&&t.area!=='—')?t.area:null,
   dueAt:t.dueAt||null,due:dueLabel(t)||null,repeat:(t.repeat&&t.repeat!=='None')?t.repeat:null,
   product:mx?mx.productName:null,rate:mx?mx.rateText:null,amount:mx?mx.productText:null,
   closedBy:(t.closedBy&&t.closedBy!==by)?t.closedBy:null,
   notes:(t.desc||'')+(mx?((t.desc?'\n':'')+'Mix: '+mx.line):'')
 });});
 t._logged=true; flCommit(); return true;
}
function flEqName(id){
 if(!id)return null;
 if(typeof EQUIP==='undefined')return id;
 var m=EQUIP.filter(function(x){return x.id===id;})[0];
 return m?m.name:id;
}
function fieldlogEnter(){
 const sm=document.getElementById('fl-sum'),inp=document.getElementById('fl-plotsearch'),sug=document.getElementById('fl-plotsug'),tag=document.getElementById('fl-plottag'),mb=document.getElementById('fl-mapbtn');
 if(sm&&!sm._wired){sm._wired=1;sm.addEventListener('click',e=>{const k=e.target.closest('[data-cat]');if(!k)return;const cat=k.getAttribute('data-cat');flState.type=(flState.type===cat?'all':cat);flRender();});}
 if(mb&&!mb._wired){mb._wired=1;mb.addEventListener('click',openFlFilterPick);}
 if(tag&&!tag._wired){tag._wired=1;tag.addEventListener('click',e=>{const x=e.target.closest('[data-clr]');if(x){flRemovePlot(x.getAttribute('data-clr'));return;}if(e.target.closest('#fl-clrall'))flClearPlots();});}
 if(inp&&!inp._wired){inp._wired=1;
  inp.addEventListener('focus',()=>flRenderSug(inp.value));
  inp.addEventListener('input',()=>flRenderSug(inp.value));
  inp.addEventListener('keydown',e=>{const box=document.getElementById('fl-plotsug');const opts=box?[].slice.call(box.querySelectorAll('.s')):[];if(e.key==='ArrowDown'){e.preventDefault();flSugIdx=Math.min(flSugIdx+1,opts.length-1);}else if(e.key==='ArrowUp'){e.preventDefault();flSugIdx=Math.max(flSugIdx-1,0);}else if(e.key==='Enter'){e.preventDefault();const pick=opts[flSugIdx]||opts[0];if(pick)flAddPlot(pick.dataset.plot);return;}else if(e.key==='Escape'){flHideSug();return;}else return;opts.forEach((o,i)=>o.classList.toggle('hl',i===flSugIdx));});
  inp.addEventListener('blur',()=>setTimeout(flHideSug,150));
 }
 if(sug&&!sug._wired){sug._wired=1;sug.addEventListener('mousedown',e=>{const s=e.target.closest('.s');if(s){e.preventDefault();flAddPlot(s.dataset.plot);}});}
 ['fl-add-top'].forEach(id=>{const e=document.getElementById(id);if(e&&!e._wired){e._wired=1;e.addEventListener('click',()=>openFlNew());}});
 const xb=document.getElementById('fl-export-top');
 if(xb&&!xb._wired){xb._wired=1;xb.addEventListener('click',()=>go('flexport'));}
 const fd=document.getElementById('fl-feed');
 if(fd&&!fd._wired){fd._wired=1;fd.addEventListener('click',e=>{const r=e.target.closest('[data-flog]');if(r)openFlEntry(r.getAttribute('data-flog'));});}
 flSyncPlotUI(); flRender();
}

/* ======================= FIELD LOG: WHO, WHEN, AND EXPORT ===================
   The log is the farm's record of practice: what went on which ground, at what
   rate, by whose hand, on what day. Two things follow from that.

   First, every entry needs a name and a clock time on it, not just inside the
   summary line. Entries written by the task board carry the person who marked
   the job complete; entries typed into the form carry whoever typed them. The
   seed rows predate both, so they are stamped on load from the trailing name in
   their summary rather than left blank in an export.

   Second, the record has to leave the app. A season's spray history is asked
   for by an auditor, a committee, or a co-operator, and none of them want a
   phone screen. Two files come out of here:

   - .csv, one row per logged operation, for a spreadsheet.
   - .html, a standalone page that keeps a live search box, so someone chasing
     "everything Javi sprayed on B14" can find it without a spreadsheet at all.

   Both cover a date range picked from the presets a season actually gets asked
   about — this month, last month, year to date, last year — or a pair of dates
   typed in.                                                                */

/* ---- who and when: backfill ---- */
/* "Chlorothalonil · 3.6 fl oz/M · Javi V." — the crew's name is the last piece
   of the summary, which is where it lived before the field existed. */
function flPersonFromDetail(d){
  var bits=(''+(d||'')).split('·').map(function(x){return x.trim();}).filter(Boolean);
  if(!bits.length) return null;
  var last=bits[bits.length-1];
  /* Only a name, never a measurement or a machine setting. */
  if(/\d/.test(last)||last.length>34) return null;
  return last;
}
/* Older entries carried the person only inside the free-text detail line.
   Recover it and store the roster id, so an export can group by person. */
function flStampWho(){
  for(var i=0;i<FIELDLOG.length;i++){
    var a=FIELDLOG[i];
    if(!a.person){ var p=flPersonFromDetail(a.detail); if(p) a.person=pidOf(p)||p; }
    else if(typeof a.person==='string'&&!/^p\d+$/.test(a.person)){ a.person=pidOf(a.person)||a.person; }
  }
}

/* ord is YYYYMMDD as an integer, so a date range is plain arithmetic. */
function flOrdOf(d){ return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate(); }
function flOrdParse(str){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(str||''); if(!m) return null;
  return (+m[1])*10000+(+m[2])*100+(+m[3]);
}
function flOrdToIso(o){
  if(!o) return '';
  var y=Math.floor(o/10000), m=Math.floor(o/100)%100, d=o%100;
  return y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d;
}
/* The ranges people actually ask for, resolved against today. */
var FX_RANGES=[
 {id:'this_month', label:'This month'},
 {id:'last_month', label:'Last month'},
 {id:'last_30',    label:'Last 30 days'},
 {id:'ytd',        label:'This year to date'},
 {id:'last_year',  label:'Last year'},
 {id:'lytd',       label:'Last year to date'},
 {id:'last_12',    label:'Last 12 months'},
 {id:'all',        label:'All time'},
 {id:'custom',     label:'Custom dates'}
];
function flRangeBounds(id,from,to){
  var now=new Date(), y=now.getFullYear(), m=now.getMonth();
  function ord(yy,mm,dd){ return yy*10000+(mm+1)*100+dd; }
  function lastDay(yy,mm){ return new Date(yy,mm+1,0).getDate(); }
  switch(id){
    case 'this_month': return [ord(y,m,1),ord(y,m,lastDay(y,m))];
    case 'last_month': var pm=m?m-1:11, py=m?y:y-1; return [ord(py,pm,1),ord(py,pm,lastDay(py,pm))];
    case 'last_30':    var d30=new Date(now.getTime()-29*864e5); return [flOrdOf(d30),flOrdOf(now)];
    case 'ytd':        return [ord(y,0,1),flOrdOf(now)];
    case 'last_year':  return [ord(y-1,0,1),ord(y-1,11,31)];
    /* Same calendar window as this year so far, one year back — the comparison
       an annual report is actually built on. */
    case 'lytd':       return [ord(y-1,0,1),ord(y-1,m,Math.min(now.getDate(),lastDay(y-1,m)))];
    case 'last_12':    var d12=new Date(y-1,m,now.getDate()); return [flOrdOf(d12),flOrdOf(now)];
    case 'custom':     return [flOrdParse(from)||0,flOrdParse(to)||99999999];
    default:           return [0,99999999];
  }
}
var FXFORM={range:'this_month',from:'',to:'',useFilter:false};
function flRangeLabel(){
  var b=flRangeBounds(FXFORM.range,FXFORM.from,FXFORM.to);
  if(FXFORM.range==='all') return 'All time';
  return flOrdToIso(b[0])+' to '+flOrdToIso(b[1]);
}
/* Rows the export will contain, newest first. */
function flExportRows(){
  var b=flRangeBounds(FXFORM.range,FXFORM.from,FXFORM.to);
  var rows=FIELDLOG.filter(function(a){
    if(!(a.ord>=b[0]&&a.ord<=b[1])) return false;
    if(!FXFORM.useFilter) return true;
    return (flState.type==='all'||a.type===flState.type)&&flPlotMatch(a.plot);
  });
  return rows.sort(function(x,y){ return (y.ord-x.ord)||(''+(x.title||'')).localeCompare(''+(y.title||'')); });
}
var FX_COLS=[
 ['Date',       function(a){ return flOrdToIso(a.ord); }],
 ['Time',       function(a){ return a.time||''; }],
 ['Person',     function(a){ return nameOf(a.person)||a.person||''; }],
 ['Closed by',  function(a){ return nameOf(a.closedBy)||a.closedBy||''; }],
 ['Plot',       function(a){ return flRowPlot(a.plot); }],
 ['Area',       function(a){ return a.area||''; }],
 ['Category',   function(a){ return (FL_TYPES[a.type]||FL_TYPES.misc).label; }],
 ['Operation',  function(a){ return a.op||''; }],
 ['Entry',      function(a){ return a.title||''; }],
 ['Product',    function(a){ return a.product||''; }],
 ['Active ingredient', function(a){ return a.ai||''; }],
 ['Rate',       function(a){ return a.rate||''; }],
 ['Amount used',function(a){ return a.amount||''; }],
 ['Target',     function(a){ return a.target||''; }],
 ['Equipment',  function(a){ return a.equipment||''; }],
 ['Source',     function(a){ return a.source==='task'?'Task board':'Logged by hand'; }],
 ['Summary',    function(a){ return a.detail||''; }],
 ['Notes',      function(a){ return a.notes||''; }]
];
function flCsvCell(v){
  v=(v==null?'':''+v).replace(/\r?\n/g,' ');
  return /[",]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v;
}
function flExportCsv(rows){
  var out=[FX_COLS.map(function(c){return flCsvCell(c[0]);}).join(',')];
  rows.forEach(function(a){ out.push(FX_COLS.map(function(c){return flCsvCell(c[1](a));}).join(',')); });
  return out.join('\r\n');
}
/* The HTML export is a whole page, not a fragment: it has to open from a
   Downloads folder years from now with no app around it, so the search box and
   its script travel inside the file. */
function flExportHtml(rows){
  var head=FX_COLS.map(function(c){ return '<th>'+esc(c[0])+'</th>'; }).join('');
  var body=rows.map(function(a){
    var t=FL_TYPES[a.type]||FL_TYPES.misc;
    return '<tr><td class="cat"><span class="pill" style="background:'+t.bg+';color:'+t.fg+'">'+esc(t.label)+'</span></td>'
      +FX_COLS.filter(function(c){return c[0]!=='Category';}).map(function(c){ return '<td>'+esc(c[1](a))+'</td>'; }).join('')
      +'</tr>';
  }).join('\n');
  var headNoCat='<th>Category</th>'+FX_COLS.filter(function(c){return c[0]!=='Category';})
    .map(function(c){ return '<th>'+esc(c[0])+'</th>'; }).join('');
  var when=new Date(), stamp=flOrdToIso(flOrdOf(when));
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
   +'<meta name="viewport" content="width=device-width,initial-scale=1">'
   +'<title>UT Turf Farm · Field Log · '+esc(flRangeLabel())+'</title><style>'
   +'*{box-sizing:border-box}'
   +'body{margin:0;background:#f4f5f6;color:#2f3133;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}'
   +'header{background:#2f3133;color:#fff;padding:18px 22px}'
   +'h1{margin:0;font-size:19px;letter-spacing:.2px}'
   +'.sub{margin-top:5px;font-size:12.5px;color:#b9bfc6}'
   +'.bar{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #e3e7ea;padding:12px 22px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}'
   +'#q{flex:1;min-width:220px;font:15px inherit;padding:10px 13px;border:1px solid #d7dce0;border-radius:10px;outline:none}'
   +'#q:focus{border-color:#ff8200;box-shadow:0 0 0 3px rgba(255,130,0,.15)}'
   +'#count{font-size:12.5px;color:#6b7280;white-space:nowrap}'
   +'#clear{font:700 12px inherit;color:#6b7280;background:#f1f2f4;border:1px solid #e3e7ea;border-radius:8px;padding:8px 12px;cursor:pointer}'
   +'.wrap{padding:14px 22px 40px;overflow-x:auto}'
   +'table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}'
   +'th,td{padding:9px 12px;text-align:left;font-size:12.5px;border-bottom:1px solid #eef0f2;vertical-align:top;white-space:nowrap}'
   +'th{background:#fafbfc;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;position:sticky;top:0;cursor:pointer;user-select:none}'
   +'th:hover{color:#2f3133}th.sorted:after{content:" \\2193";color:#ff8200}th.sorted.asc:after{content:" \\2191"}'
   +'td:last-child,th:last-child{white-space:normal;min-width:180px}'
   +'tr:hover td{background:#fffaf3}'
   +'.pill{display:inline-block;padding:2px 8px;border-radius:20px;font-weight:800;font-size:11px}'
   +'mark{background:#ffe9c9;color:inherit;padding:0 1px;border-radius:2px}'
   +'#none{display:none;padding:26px;text-align:center;color:#6b7280;background:#fff;border-radius:12px;margin-top:12px}'
   +'@media print{.bar{position:static}#clear{display:none}}'
   +'</style></head><body>'
   +'<header><h1>UT Turf Farm &middot; Field Log</h1>'
   +'<div class="sub">'+esc(flRangeLabel())+' &middot; '+rows.length+' entr'+(rows.length===1?'y':'ies')+' &middot; exported '+esc(stamp)+'</div></header>'
   +'<div class="bar"><input id="q" type="search" placeholder="Search anything — a plot, a product, a person, a practice…" autocomplete="off">'
   +'<button id="clear" type="button">Clear</button><span id="count"></span></div>'
   +'<div class="wrap"><table><thead><tr>'+headNoCat+'</tr></thead><tbody id="tb">'+body+'</tbody></table>'
   +'<div id="none">Nothing matches that search.</div></div>'
   +'<script>(function(){'
   +'var q=document.getElementById("q"),tb=document.getElementById("tb"),cnt=document.getElementById("count"),none=document.getElementById("none");'
   +'var rows=[].slice.call(tb.rows);'
   +'rows.forEach(function(r){r._t=r.textContent.toLowerCase();});'
   /* Space-separated words all have to match, so "javi b14" narrows instead of
      widening — that is how someone searches a log they are chasing a fact in. */
   +'function run(){var terms=q.value.toLowerCase().split(/\\s+/).filter(Boolean),n=0;'
   +'rows.forEach(function(r){var ok=terms.every(function(t){return r._t.indexOf(t)>=0;});r.style.display=ok?"":"none";if(ok)n++;});'
   +'cnt.textContent=n+" of "+rows.length+" shown";none.style.display=n?"none":"block";}'
   +'q.addEventListener("input",run);'
   +'document.getElementById("clear").addEventListener("click",function(){q.value="";run();q.focus();});'
   +'var ths=[].slice.call(document.querySelectorAll("th")),dir={};'
   +'ths.forEach(function(th,i){th.addEventListener("click",function(){'
   +'var asc=!dir[i];dir={};dir[i]=asc;'
   +'ths.forEach(function(x){x.className="";});th.className="sorted"+(asc?" asc":"");'
   +'rows.sort(function(a,b){var x=a.cells[i].textContent.trim(),y=b.cells[i].textContent.trim();'
   +'var nx=parseFloat(x),ny=parseFloat(y);'
   +'var c=(!isNaN(nx)&&!isNaN(ny)&&/^[-\\d.,]+$/.test(x)&&/^[-\\d.,]+$/.test(y))?(nx-ny):x.localeCompare(y);'
   +'return asc?c:-c;});'
   +'rows.forEach(function(r){tb.appendChild(r);});});});'
   +'run();})();<\/script></body></html>';
}
/* Blob download — the app is one file opened from disk, so there is no server
   to fetch from and nothing to POST to. */
function flDownload(name,text,mime){
  try{
    var blob=new Blob([text],{type:mime+';charset=utf-8'});
    var url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=name; a.style.display='none';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); },400);
    return true;
  }catch(e){ return false; }
}
function flExportName(ext){
  var b=flRangeBounds(FXFORM.range,FXFORM.from,FXFORM.to);
  var tag=(FXFORM.range==='all')?'all':(flOrdToIso(b[0])+'_'+flOrdToIso(b[1]));
  return 'UT-TurfFarm-FieldLog_'+tag+'.'+ext;
}
function flDoExport(kind){
  var rows=flExportRows();
  if(!rows.length){ toast('Nothing logged in that range'); return; }
  var ok=(kind==='csv')
    ? flDownload(flExportName('csv'),flExportCsv(rows),'text/csv')
    : flDownload(flExportName('html'),flExportHtml(rows),'text/html');
  toast(ok?(rows.length+' entries exported ✓'):'Could not build the file');
}
function renderFlExport(){
  var body=document.getElementById('fx-body'); if(!body) return;
  var rows=flExportRows();
  var chips=FX_RANGES.map(function(r){
    return '<span class="fchip tap'+(FXFORM.range===r.id?' on':'')+'" data-fxrange="'+r.id+'">'+esc(r.label)+'</span>';
  }).join('');
  var b=flRangeBounds(FXFORM.range,FXFORM.from,FXFORM.to);
  var custom=(FXFORM.range==='custom')
   ? '<div class="list"><div class="fld"><span class="fl">From</span><input class="inv-in" type="date" id="fx-from" value="'+esc(FXFORM.from)+'" style="max-width:170px"></div>'
     +'<div class="fld" style="border-bottom:none"><span class="fl">To</span><input class="inv-in" type="date" id="fx-to" value="'+esc(FXFORM.to)+'" style="max-width:170px"></div></div>'
   : '';
  var filtOn=(flState.type!=='all')||flState.plots.length>0;
  var filtWhat=[];
  if(flState.type!=='all') filtWhat.push((FL_TYPES[flState.type]||FL_TYPES.misc).label+' only');
  if(flState.plots.length) filtWhat.push(flState.plots.length===1?flPlotLabel(flState.plots[0]):flState.plots.length+' plots');
  body.innerHTML=
    '<div class="sec">Date range</div>'
   +'<div class="chiprow" style="padding:0 14px 4px">'+chips+'</div>'
   +custom
   +(FXFORM.range==='all'?'':'<div style="margin:8px 16px 0;font:600 11px \'Public Sans\';color:var(--muted)">'+esc(flOrdToIso(b[0]))+' → '+esc(flOrdToIso(b[1]))+'</div>')
   +(filtOn
     ? '<div class="sec">Field Log filter</div><div class="list"><div class="fld tap" id="fx-usefilter" style="border-bottom:none">'
       +'<span class="fl">Apply '+esc(filtWhat.join(' · '))+'</span>'
       +'<span class="fv" style="color:'+(FXFORM.useFilter?'#2f9e4f':'var(--muted)')+'">'+(FXFORM.useFilter?'On ✓':'Off')+'</span></div></div>'
     : '')
   +'<div class="sec">What comes out</div><div class="list">'
   +'<div class="fld"><span class="fl">Entries</span><span class="fv" style="font-weight:800">'+rows.length+'</span></div>'
   +'<div class="fld"><span class="fl">Columns</span><span class="fv">'+FX_COLS.length+' · who, when, plot, product, rate, amount</span></div>'
   +'<div class="fld" style="border-bottom:none"><span class="fl">File name</span><span class="fv" style="font-size:11px">'+esc(flExportName('csv'))+'</span></div>'
   +'</div>'
   +'<div style="margin:10px 16px 0;background:#eef4ff;border:1px solid #cfe0ff;border-radius:12px;padding:10px 12px;font:600 11px \'Public Sans\';color:#2456b8;line-height:1.5">'
   +'The .csv opens in Excel. The .html is a standalone page with a live search box and sortable columns — open it in any browser, no app needed.</div>'
   +'<div style="height:12px"></div>';
}
document.getElementById('s-flexport').addEventListener('click',function(e){
  var r=e.target.closest('[data-fxrange]');
  if(r){ FXFORM.range=r.getAttribute('data-fxrange'); renderFlExport(); return; }
  if(e.target.closest('#fx-usefilter')){ FXFORM.useFilter=!FXFORM.useFilter; renderFlExport(); return; }
});
document.getElementById('s-flexport').addEventListener('change',function(e){
  if(e.target.id==='fx-from'){ FXFORM.from=e.target.value; renderFlExport(); }
  else if(e.target.id==='fx-to'){ FXFORM.to=e.target.value; renderFlExport(); }
});
document.getElementById('fx-csv').addEventListener('click',function(){ flDoExport('csv'); });
document.getElementById('fx-html').addEventListener('click',function(){ flDoExport('html'); });

/* ---- Field Log: log an operation (entry form) ---- */
const FL_OPS=[
 {id:'reelmow',label:'Reel Mow',feed:'mow',eq:true},
 {id:'rotarymow',label:'Rotary Mow',feed:'mow',eq:true},
 {id:'weedeat',label:'Weedeat / Trim',feed:'mow',eq:true},
 {id:'spray_fung',label:'Spray Pesticide — Fungicide',feed:'spray',chem:true,pest:true},
 {id:'spray_herb',label:'Spray Pesticide — Herbicide',feed:'spray',chem:true,pest:true},
 {id:'spray_ins',label:'Spray Pesticide — Insecticide',feed:'spray',chem:true,pest:true},
 {id:'spray_fert',label:'Spray Fertilizer',feed:'fert',chem:true},
 {id:'gran_fert',label:'Fertilize — Granular',feed:'fert',chem:true},
 {id:'aeration',label:'Aeration',feed:'cult'},
 {id:'topdress',label:'Topdress',feed:'cult'},
 {id:'verticut',label:'Verticut / Dethatch',feed:'cult'},
 {id:'irrigation',label:'Irrigation',feed:'irrig'},
 {id:'handwater',label:'Handwater',feed:'irrig'},
 {id:'traffic',label:'Traffic / Wear sim',feed:'misc'},
 {id:'paintdots',label:'Paint Trial Dots',feed:'misc'},
 {id:'other',label:'Other operation',feed:'misc'}
];
function flOp(id){return FL_OPS.find(function(o){return o.id===id;});}
function flCanChem(){return currentRole==='tech'||currentRole==='grad'||currentRole==='manager';}
/* productId / amtNum / amtUnit / takeStock were added 2026-08-25 so a spray can
   come off the shelf. `product` and `amount` are still here and still hold the
   same strings they always did - the detail line, the export columns and the
   correction screen all read them, and none of that had to change. */
let FLFORM={op:'',plots:[],day:28,time:'',product:'',productId:null,ai:'',amount:'',
            amtNum:'',amtUnit:'',takeStock:true,rate:'',target:'',equipment:'',notes:''};
function openFlNew(){FLFORM={op:'',plots:[],day:28,time:'',product:'',productId:null,ai:'',
   amount:'',amtNum:'',amtUnit:'',takeStock:true,rate:'',target:'',equipment:'',notes:''};go('flnew');}
function renderFlNew(){
 var body=document.getElementById('fln-body'); if(!body)return;
 var canChem=flCanChem();
 var op=flOp(FLFORM.op);
 var opts='<option value="" '+(FLFORM.op?'':'selected')+' disabled>Choose an operation…</option>'+FL_OPS.map(function(o){
   var lock=(o.chem&&!canChem);
   return '<option value="'+o.id+'"'+(FLFORM.op===o.id?' selected':'')+(lock?' disabled':'')+'>'+esc(o.label)+(lock?' (locked)':'')+'</option>';
 }).join('');
 var chemNote=canChem?'':'<div style="margin:0 18px 4px;font:600 11px \'Public Sans\';color:#b26a00">Chemical &amp; fertilizer ops are limited to techs, grads, and Bill.</div>';
 var selChips=FLFORM.plots.length?('<div class="chiprow" style="padding:0 0 8px">'+FLFORM.plots.map(function(p){return '<span class="chip on" data-flplot="'+p+'">'+flPlotLabel(p)+' ✕</span>';}).join('')+'</div>'):'';
 var whereBlock='<div style="padding:0 16px">'+selChips
   +'<div class="fl-search" style="position:relative;margin:0"><input class="inv-search" id="fln-plotsearch" placeholder="Search a plot… e.g. 14, Greenhouse" autocomplete="off" style="width:100%"><div id="fln-plotsug" class="fl-sug" style="display:none"></div></div>'
   +'<div class="action tap" id="fln-mapbtn" style="background:#489FDF;color:#fff;margin-top:8px">Choose on map</div></div>';
 var chemRows='';
 if(op&&op.chem){
   var pit=flnProduct();
   var uOpts=flnUnitChoices().map(function(u){
     return '<option'+((FLFORM.amtUnit||'')===u?' selected':'')+'>'+esc(u)+'</option>';}).join('');
   chemRows=''
    +'<div class="sec" style="margin:12px 18px 7px">Chemical application record</div><div class="list">'
    +'<div class="fld" style="position:relative"><span class="fl">Product *</span>'
    +'<input class="inv-in" id="fln-product" value="'+esc(FLFORM.product)+'" placeholder="e.g. Daconil Weatherstik" autocomplete="off" style="max-width:175px">'
    +'<div id="fln-prodsug" class="il-sugg" style="display:none;left:auto;right:16px;top:38px"></div></div>'
    +'<div class="fld"><span class="fl">Active ingredient</span><input class="inv-in" id="fln-ai" value="'+esc(FLFORM.ai)+'" placeholder="e.g. Chlorothalonil" style="max-width:175px"></div>'
    +'<div class="fld"><span class="fl">Amount used *<div style="font:600 10px \'Public Sans\';color:var(--muted);font-weight:600">total for this job</div></span>'
    +'<span style="display:flex;align-items:center;gap:6px">'
    +'<input class="inv-in" id="fln-amtnum" inputmode="decimal" value="'+esc(FLFORM.amtNum)+'" placeholder="12" style="max-width:74px">'
    +'<select class="inv-sel" id="fln-amtunit" style="max-width:92px">'+uOpts+'</select></span></div>'
    +'<div class="fld"'+(op.pest?'':' style="border-bottom:none"')+'><span class="fl">Rate</span><input class="inv-in" id="fln-rate" value="'+esc(FLFORM.rate)+'" placeholder="e.g. 3.6 fl oz/M" style="max-width:175px"></div>'
    +(op.pest?'<div class="fld" style="border-bottom:none"><span class="fl">Target pest/weed</span><input class="inv-in" id="fln-target" value="'+esc(FLFORM.target)+'" placeholder="e.g. Dollar spot" style="max-width:175px"></div>':'')
    +'</div>'
    +(pit?('<div class="list" style="margin-top:10px"><div class="fld tap" id="fln-takestock" style="border-bottom:none">'
       +'<span class="fl">Take it out of stock</span>'
       +'<span class="fv" style="color:'+(FLFORM.takeStock?'#2f7d3a':'var(--muted)')+'">'+(FLFORM.takeStock?'Yes':'No')+'</span></div></div>'):'')
    +'<div id="fln-stocknote">'+flnStockNoteHTML()+'</div>';
 }
 var eqRow=(op&&op.eq)?'<div class="sec" style="margin:12px 18px 7px">Equipment</div><div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Machine used</span><input class="inv-in" id="fln-eq" value="'+esc(FLFORM.equipment)+'" placeholder="e.g. Toro 3 reel" style="max-width:175px"></div></div>':'';
 body.innerHTML=
   chemNote
  +'<div class="sec" style="margin:12px 18px 7px">Operation</div><div class="list">'
  +'<div class="fld"><span class="fl">Operation type *</span><select class="inv-sel" id="fln-op" style="max-width:210px">'+opts+'</select></div>'
  +'<div class="fld"><span class="fl">Person</span><span class="fv">'+meName()+' (you)</span></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Date / time</span><span class="fv" style="color:var(--muted)">Set automatically on save</span></div>'
  +'</div>'
  +'<div class="sec" style="margin:12px 18px 7px">Where * <span style="color:var(--muted);font-weight:600">· '+FLFORM.plots.length+' selected</span></div>'
  +whereBlock
  +eqRow
  +chemRows
  +'<div class="sec" style="margin:12px 18px 7px">Notes</div><div class="list"><div class="fld" style="border-bottom:none;align-items:flex-start"><textarea class="inv-in" id="fln-notes" rows="2" placeholder="Optional details…" style="max-width:none;width:100%;flex:1;resize:none">'+esc(FLFORM.notes)+'</textarea></div></div>'
  +'<div style="height:12px"></div>';
}
/* ---- the field log's link to the shelf ----
   A spray is already written down here; making the crew write it a second time
   on the inventory screen is how stock numbers rot. So this screen takes it
   off the shelf - but ONLY when it is certain what came off:

     - the product has to be matched to something in INVENTORY, and
     - the amount has to convert into that product's own unit.

   Anything less and the entry still saves and stock is simply left alone. The
   field log's own rule applies here too: NOBODY IS EVER BLOCKED IN A FIELD.
   Spraying something not on the list is a real thing that happens, and the
   application record matters more than the stock figure. */
function flnProduct(){
  return FLFORM.productId ? (INVENTORY.find(function(x){return x.id===FLFORM.productId;})||null) : null;
}
function flnUnitChoices(){
  var pit=flnProduct();
  var list=pit?invUnitChoices(pit):['fl oz','gal','qt','pt','L','mL','oz','lb','kg','g'];
  if(FLFORM.amtUnit && list.indexOf(FLFORM.amtUnit)<0) list=[FLFORM.amtUnit].concat(list);
  return list;
}
/* How much comes off the shelf, in the product's own unit. null = nothing
   does, and the caller must treat that as "leave it alone", never as zero. */
function flnStockAmount(){
  var pit=flnProduct(); if(!pit || !FLFORM.takeStock) return null;
  var n=parseFloat(FLFORM.amtNum);
  if(!isFinite(n) || n<=0) return null;
  return invConvert(n, FLFORM.amtUnit||pit.unit, pit.unit);
}
function flnBox(bg,br,col,txt){
  return '<div style="margin:6px 16px 0;background:'+bg+';border:1px solid '+br
    +';border-radius:12px;padding:9px 12px;font:600 11px \'Public Sans\';color:'+col+'">'+txt+'</div>';
}
function flnStockNoteHTML(){
  var pit=flnProduct();
  if(!pit) return flnBox('#eef4ff','#cfe0ff','#2456b8',
    'Saved as a chemical application record. This product is not matched to anything on the shelf, so stock will not change.');
  if(!FLFORM.takeStock) return flnBox('#f4f5f6','#e2e5e8','#6b7076',
    'Saved as a chemical application record. Stock will not change.');
  var n=parseFloat(FLFORM.amtNum);
  if(!isFinite(n)||n<=0) return flnBox('#eef4ff','#cfe0ff','#2456b8',
    'Enter the amount and it will come off '+esc(pit.name)+' automatically.');
  var conv=invConvert(n, FLFORM.amtUnit||pit.unit, pit.unit);
  if(conv===null) return flnBox('#fff6e6','#f0d9a8','#8a5a00',
    esc((FLFORM.amtUnit||''))+' cannot be converted to '+esc(pit.unit)+', so stock will not change. The record still saves.');
  var after=invQty(pit)-conv;
  if(after<-1e-9) return flnBox('#fdeceb','#f3c9c4','#c0392b',
    '\u2212'+fmt(conv)+' '+esc(pit.unit)+' from '+esc(pit.name)+' \u2192 '+fmt(after)+' '+esc(pit.unit)
    +'. That is below zero, so the count is probably out. It will still be recorded.');
  return flnBox('#eafaef','#bfe6c9','#2f7d3a',
    '\u2713 \u2212'+fmt(conv)+' '+esc(pit.unit)+' from '+esc(pit.name)+' \u2192 leaves '+fmt(after)+' '+esc(pit.unit));
}
function flnPaintStockNote(){
  var el=document.getElementById('fln-stocknote');
  if(el) el.innerHTML=flnStockNoteHTML();
}
/* The product typeahead. Matching is what turns a written record into a stock
   movement, so it is offered rather than demanded - typing straight past it
   leaves productId null and that is a valid way to save. */
function flnProdSug(q){
  var box=document.getElementById('fln-prodsug'); if(!box)return;
  q=(q||'').trim().toLowerCase();
  if(q.length<2){ box.style.display='none'; return; }
  var hits=INVENTORY.filter(function(it){
    return it.name.toLowerCase().indexOf(q)>=0 || String(it.ai||'').toLowerCase().indexOf(q)>=0;
  }).slice(0,6);
  if(!hits.length){ box.style.display='none'; return; }
  box.innerHTML=hits.map(function(it){
    return '<div class="s-row" data-flprod="'+it.id+'"><span class="s-nm">'+esc(it.name)+'</span>'
      +'<span class="s-sub">'+fmt(invQty(it))+' '+esc(it.unit)+' on hand</span></div>';
  }).join('');
  box.style.display='block';
}
function flnPickProduct(id){
  var it=INVENTORY.find(function(x){return x.id===id;}); if(!it) return;
  flReadInputs();
  FLFORM.productId=it.id;
  FLFORM.product=it.name;
  if(!FLFORM.ai && it.ai) FLFORM.ai=it.ai;
  if(!FLFORM.amtUnit) FLFORM.amtUnit=it.unit;
  renderFlNew();
}

function flReadInputs(){
 var g=function(id){var e=document.getElementById(id);return e?e.value:undefined;};
 var v;
 if((v=g('fln-product'))!==undefined)FLFORM.product=v.trim();
 if((v=g('fln-ai'))!==undefined)FLFORM.ai=v.trim();
 if((v=g('fln-amtnum'))!==undefined)FLFORM.amtNum=v.trim();
 if((v=g('fln-amtunit'))!==undefined)FLFORM.amtUnit=v.trim();
 /* `amount` stays the readable string everything downstream already reads. */
 FLFORM.amount=FLFORM.amtNum?((FLFORM.amtNum+' '+(FLFORM.amtUnit||'')).trim()):'';
 if((v=g('fln-rate'))!==undefined)FLFORM.rate=v.trim();
 if((v=g('fln-target'))!==undefined)FLFORM.target=v.trim();
 if((v=g('fln-eq'))!==undefined)FLFORM.equipment=v.trim();
 if((v=g('fln-notes'))!==undefined)FLFORM.notes=v.trim();
}
function flnRenderSug(q){
 var box=document.getElementById('fln-plotsug'); if(!box)return;
 var list=flSugList(q).filter(function(p){return FLFORM.plots.indexOf(p.id)<0;});
 if(!list.length){box.style.display='none';return;}
 var hint=(!q||!q.trim())?'<div class="sughint">Recommended plots</div>':'';
 box.innerHTML=hint+list.map(function(p){return '<div class="s" data-flplot="'+p.id+'"><span>'+esc(p.label)+'</span><span class="c">'+p.n+' logged</span></div>';}).join('');
 box.style.display='block';
}
document.getElementById('s-flnew').addEventListener('click',function(e){
 var mb=e.target.closest('#fln-mapbtn'); if(mb){flReadInputs();openFlPlotPick();return;}
 var pp=e.target.closest('[data-flprod]'); if(pp){flnPickProduct(pp.getAttribute('data-flprod'));return;}
 var ts=e.target.closest('#fln-takestock'); if(ts){flReadInputs();FLFORM.takeStock=!FLFORM.takeStock;renderFlNew();return;}
 var pc=e.target.closest('[data-flplot]'); if(pc){flReadInputs();var p=pc.getAttribute('data-flplot');var i=FLFORM.plots.indexOf(p);if(i>=0)FLFORM.plots.splice(i,1);else FLFORM.plots.push(p);renderFlNew();return;}
});
document.getElementById('s-flnew').addEventListener('input',function(e){
 if(e.target.id==='fln-plotsearch'){flnRenderSug(e.target.value);}
 /* Editing the name after picking BREAKS the match on purpose. Otherwise a
    typo'd name could still take stock off the product that was picked three
    keystrokes ago, and the record and the shelf would disagree. */
 else if(e.target.id==='fln-product'){
   var pit=flnProduct();
   if(pit && e.target.value.trim()!==pit.name) FLFORM.productId=null;
   FLFORM.product=e.target.value.trim();
   flnProdSug(e.target.value); flnPaintStockNote();
 }
 else if(e.target.id==='fln-amtnum'){ flReadInputs(); flnPaintStockNote(); }
});
document.getElementById('s-flnew').addEventListener('change',function(e){
 if(e.target.id==='fln-op'){flReadInputs();FLFORM.op=e.target.value;renderFlNew();return;}
 if(e.target.id==='fln-amtunit'){ flReadInputs(); flnPaintStockNote(); return; }
});
function flSave(){
 flReadInputs();
 var op=flOp(FLFORM.op);
 if(!op){toast('Pick an operation type');return;}
 if(op.chem&&!flCanChem()){toast('Not permitted to log chemical applications');return;}
 if(!FLFORM.plots.length){toast('Pick at least one plot / area');return;}
 if(op.chem&&(!FLFORM.product||!FLFORM.amount)){toast('Product and amount are required');return;}
 /* the record stores the id; the detail line keeps the readable name */
 var whoId=SESSION.pid, who=meName();
 var title=(op.chem&&FLFORM.product)?FLFORM.product:op.label;
 var bits=[];
 if(op.chem){ if(FLFORM.ai)bits.push(FLFORM.ai); if(FLFORM.rate)bits.push(FLFORM.rate); if(FLFORM.amount)bits.push(FLFORM.amount+' used'); if(op.pest&&FLFORM.target)bits.push('target: '+FLFORM.target); }
 if(op.eq&&FLFORM.equipment)bits.push(FLFORM.equipment);
 bits.push(who);
 var detail=bits.join(' · ');
 var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 var now=new Date();
 var date=MON[now.getMonth()]+' '+now.getDate();
 var ord=now.getFullYear()*10000+(now.getMonth()+1)*100+now.getDate();
 var time=nowTime();
 FLFORM.plots.forEach(function(p){
   FIELDLOG.push({plot:p,type:op.feed,title:title,detail:detail,date:date,ord:ord,op:op.label,product:FLFORM.product||null,ai:FLFORM.ai||null,amount:FLFORM.amount||null,rate:FLFORM.rate||null,target:FLFORM.target||null,equipment:FLFORM.equipment||null,notes:FLFORM.notes||'',person:whoId,loggedBy:whoId,time:time,source:'manual'});
 });
 flCommit();                                    /* stamps the ids we need below */

 /* ONE movement per save, not one per plot.
    Spraying three plots writes three entries - that is how the field log has
    always worked - but the person mixed ONE tank. Taking the amount off three
    times would drain the shelf at triple speed and nobody would spot it for
    weeks. The box says "total for this job" for the same reason. The movement
    hangs off the FIRST entry's id, which is what a later correction looks for.

    Nothing here can stop the save: the entry is already committed above. If
    the product is unmatched or the unit will not convert, flnStockAmount()
    returns null and the shelf is simply left alone. */
 var _msg=op.chem?'Logged ✓ · chemical record saved':'Operation logged ✓';
 try{
   var _take=flnStockAmount(), _pit=flnProduct();
   if(_take!==null && _take>0 && _pit){
     var _made=FIELDLOG.slice(-FLFORM.plots.length);
     var _warn=invNegWarn(_pit,-_take);          /* BEFORE the movement lands */
     invMove(_pit.id, -_take, 'out',
       {ref:(_made[0]&&_made[0].id)||null, note:'Field log · '+op.label});
     flCommit();                                 /* the ref may have stamped an id */
     _msg+=' · '+fmt(_take)+' '+_pit.unit+' off the shelf';
     if(_warn) _msg=_warn;
   }
 }catch(e){}
 toast(_msg);
 flState={type:'all',plots:[]};
 back(); flRender();
}
document.getElementById('fln-save').addEventListener('click',flSave);
/* ============================================================
   IDS · one generator, collision-proof across devices
   ------------------------------------------------------------
   Every record used to mint its own id as a prefix plus Date.now():
   newId('t'), newId('i'), newId('ev'). That is a timestamp, and a
   timestamp is only unique on one device with one person tapping. Two people
   adding a task in the same millisecond — which is exactly what happens when
   Bill assigns work while a crew member claims a job — produce the same id, and
   whichever write lands second silently overwrites the first.

   newId() is the shape flNewId() already used: the time in base 36 for rough
   sortability, plus five random characters so two devices cannot land on the
   same value. The prefix is kept because it makes an id readable in a log —
   't' is a task, 'e' equipment, 'ev' a calendar event.

   In Phase 2 this becomes a UUID (or a database default). Until then this is
   safe to generate on the client, which a bare timestamp never was.
   ============================================================ */
/* ============================================================
   TIME · a due date is a timestamp, not the words that describe it
   ------------------------------------------------------------
   Tasks used to carry `dueAt:atToday('06:00')` — the sentence the screen prints,
   stored as if it were the data. Three things follow from that, and all three
   were live bugs rather than theory:

     · Nothing ever rolled over. A daily mow said "Today" on Tuesday and still
       said "Today" on Friday, because the string never changed and nothing
       could compare it to the actual date.
     · Nothing could be sorted, filtered or asked a question. "What was sprayed
       on B12 in July" is not answerable against the word "Today".
     · It cannot be stored. `due_at timestamptz` will not take a sentence, so
       the port would have had to invent the real value anyway — from data that
       no longer contains it.

   So the stored field is `dueAt`, an ISO-8601 local wall-clock string with no
   zone suffix: '2026-08-14T06:00:00', or '2026-08-14' for a job with no
   particular hour. Wall clock is deliberate. A 6:00a mow is 6:00a at the farm
   in August and 6:00a in November; storing an instant in UTC would move it an
   hour when the clocks change, which is not what "first thing in the morning"
   means to the person doing it.

   `dueLabel()` turns that back into "Today · 6:00a" at the moment of drawing.
   Same words on screen, real data underneath.

   The demo tasks are seeded relative to the current date with atToday() rather
   than pinned to a date in 2026, so the board still reads as a working day
   whenever the app is opened — and the field genuinely holds a timestamp,
   which is the point.
   ============================================================ */
var TZ_NOTE='America/New_York';   /* the farm's wall clock; see above */

function _p2(n){ return (n<10?'0':'')+n; }
/* Local wall-clock ISO. Deliberately not toISOString(), which converts to UTC
   and would file a 6am job on the previous day for half the year. */
function isoLocal(d,withTime){
  var s=d.getFullYear()+'-'+_p2(d.getMonth()+1)+'-'+_p2(d.getDate());
  return withTime===false?s:(s+'T'+_p2(d.getHours())+':'+_p2(d.getMinutes())+':00');
}
function parseISO(v){
  if(!v) return null;
  if(v instanceof Date) return v;
  var m=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v);
  if(!m) return null;
  return new Date(+m[1],+m[2]-1,+m[3],m[4]?+m[4]:0,m[5]?+m[5]:0,0,0);
}
function hasTime(v){ return typeof v==='string'&&v.indexOf('T')>0; }
function todayISO(){ return isoLocal(new Date(),false); }

/* Seed helpers. 'HH:MM' or null for an all-day job. */
function atToday(hhmm){ return atOffset(0,hhmm); }
function atOffset(days,hhmm){
  var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+(days||0));
  if(!hhmm) return isoLocal(d,false);
  var p=String(hhmm).split(':'); d.setHours(+p[0],+(p[1]||0),0,0);
  return isoLocal(d,true);
}

/* YYYYMMDD as an integer — the form the board's day arithmetic already used. */
function ordOfISO(v){ var d=parseISO(v); return d?(d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate()):0; }

var _T12M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var _T12D=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function fmtTime(v){
  var d=parseISO(v); if(!d||!hasTime(v)) return '';
  var h=d.getHours(), m=d.getMinutes(), ap=h<12?'a':'p';
  h=h%12; if(!h)h=12;
  return h+(m?(':'+_p2(m)):':00')+ap;
}
/* "Today", "Tomorrow", "Yesterday", else "Mon, Aug 18". */
function fmtDay(v){
  var d=parseISO(v); if(!d) return '';
  var t=new Date(); t.setHours(0,0,0,0);
  var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  var diff=Math.round((x-t)/86400000);
  if(diff===0) return 'Today';
  if(diff===1) return 'Tomorrow';
  if(diff===-1) return 'Yesterday';
  if(diff>1&&diff<7) return _T12D[x.getDay()];
  return _T12D[x.getDay()]+', '+_T12M[x.getMonth()]+' '+x.getDate();
}
function fmtDateTime(v){ var t=fmtTime(v); return fmtDay(v)+(t?(' · '+t):''); }
/* What a task row prints where `t.due` used to be read directly. */
function dueLabel(t){ return t&&t.dueAt?fmtDateTime(t.dueAt):(t&&t.due)||''; }

/* Ids are the join key every other record hangs off, so a duplicate is not a
   cosmetic problem — it is two things silently becoming one, and once the shared database
   is holding these it is a primary-key error instead of a quiet overwrite.

   The old version was Date.now() plus five characters of Math.random(), which
   had two holes. Inside a single millisecond the ONLY entropy was those five
   characters — about 60 million values — so by the birthday bound a burst of a
   few thousand ids collided at double-digit odds; that is what made
   test-phase0 fail roughly one run in five. And Math.random().toString(36) is
   not fixed width: a draw such as 0.5 renders as "0.i", so slice(2,7) returned
   ONE character rather than five and the odds got very much worse.

   The counter is what actually guarantees uniqueness now. It advances on every
   call, so no two ids minted by this session can collide unless 1.68 million
   of them are issued inside the same millisecond. The random block solves the
   different problem the counter cannot — two phones minting at the same moment
   — and is drawn from crypto where the browser offers it. Both blocks are
   padded to a fixed width, so an id is always the same length for a prefix. */
var _idSeq=0;
function _idRand(){
  var n;
  try{ var a=new Uint32Array(1); crypto.getRandomValues(a); n=a[0]%60466176; }  /* 36^5 */
  catch(e){ n=Math.floor(Math.random()*60466176); }
  return ('00000'+n.toString(36)).slice(-5);
}
function newId(prefix){
  _idSeq=(_idSeq+1)%1679616;                                                    /* 36^4 */
  return (prefix||'x')+Date.now().toString(36)+('0000'+_idSeq.toString(36)).slice(-4)+_idRand();
}
function esc(s){return (s==null?'':(''+s)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
btn('equipment','Report a Problem',null,'Problem reported ✓');
