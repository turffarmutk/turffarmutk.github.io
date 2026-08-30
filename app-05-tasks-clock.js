/* ============================================================
   THE DAY'S WORK — tasks, the calendar, the clock, and the weather.

   Task templates and the task list, the assign wizard that puts a job on a
   map and hands it to somebody, the calendar, the time clock (punches, pay
   periods, and Bill's corrections), the forecast, and the rainfall log.
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
/* ---- inventory interactions ---- */
document.getElementById('s-inventory').addEventListener('click',function(e){
 var chip=e.target.closest('.chip'); if(chip){invFilter=chip.getAttribute('data-f');buildChips();renderInvList();return;}
 var u=e.target.closest('#inv-units span'); if(u){invUnit=u.getAttribute('data-u');u.parentElement.querySelectorAll('span').forEach(function(s){s.classList.remove('on');});u.classList.add('on');renderInvList();return;}
 var row=e.target.closest('[data-item]'); if(row){openItem(row.getAttribute('data-item'));return;}
});
document.getElementById('inv-search').addEventListener('input',function(){invSearch=this.value;renderInvList();});
document.getElementById('s-lowstock').addEventListener('click',function(e){var row=e.target.closest('[data-item]');if(row)openItem(row.getAttribute('data-item'));});
/* capture log mode/item before global data-go navigation fires */
app.addEventListener('click',function(e){var m=e.target.closest('[data-mode]');if(m){window.ilMode=m.getAttribute('data-mode');window.ilItem=m.getAttribute('data-item')||null;}var ed=e.target.closest('[data-edit]');if(ed){window.aiEdit=ed.getAttribute('data-edit');return;}var addNav=e.target.closest('[data-go="additem"]');if(addNav)window.aiEdit=null;},true);

/* ---- Task templates: Add / Edit form ---- */
const CATEGORIES=['Mow','Paint','Spray','Fertilize','Aeration','Cultivation','Irrigation','Maintenance','Miscellaneous'];
function isMowCat(cat){ return /mow/i.test(cat||''); }
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FREQS=[2,3,4,5,6];
const PLOTS=[
 {n:'11',label:'11',l:5,t:6,w:28,h:22},{n:'12',label:'12',l:36,t:6,w:28,h:22},{n:'13',label:'13',l:67,t:6,w:28,h:22},
 {n:'14',label:'14',l:5,t:31,w:28,h:30},{n:'15',label:'15',l:36,t:31,w:28,h:30},{n:'16',label:'16',l:67,t:31,w:28,h:30},
 {n:'17',label:'17',l:5,t:64,w:28,h:22},{n:'18',label:'18',l:36,t:64,w:28,h:22},{n:'GH',label:'GH',l:67,t:64,w:28,h:22}
];
const TPL_KEY='ut_task_templates_v2';
/* The task list used to save itself with its own localStorage write, which is
   why it was the one list on the Tasks page that never left the phone that
   made it. It is a registered store now (see STORE_DEFS), so the same
   two-second scan that persists tasks, stock and the field log persists this,
   and the shared-database module can carry it to everybody else. */
function saveTemplates(){ try{ storeTouch(); }catch(e){} }
function loadTemplates(){try{return JSON.parse(localStorage.getItem(TPL_KEY)||'null');}catch(e){return null;}}
/* Task list — sourced from the Tasks sheet of Farm_info.xlsx.
   machines[] = equipment IDs valid for that task; eqNote = raw text when no
   machine in the equipment roster matches. */
const TASK_SEED=[
 {id:'tpl1', category:'Mow',           name:'Rotary - Plots',       machines:['e3','e4','e5']},
 {id:'tpl2', category:'Mow',           name:'Rotary - Alleys',      machines:['e3','e4','e5']},
 {id:'tpl3', category:'Mow',           name:'Rotary - Borders',     machines:['e3','e4','e5']},
 {id:'tpl4', category:'Mow',           name:'Walk - Dennis',        machines:['e13','e14','e15']},
 {id:'tpl5', category:'Mow',           name:'Fairway',              machines:['e1']},
 {id:'tpl6', category:'Mow',           name:'2653',                 machines:['e10']},
 {id:'tpl7', category:'Mow',           name:'Greens - Triplex',     machines:['e9','e8']},
 {id:'tpl8', category:'Mow',           name:'Greens - Walk',        machines:['e6','e7']},
 {id:'tpl9', category:'Paint',         name:'Trial Dots',           machines:[], eqNote:'Paint Gun'},
 {id:'tpl10',category:'Spray',         name:'Pesticide - Boom',     machines:['e2']},
 /* Small runs where the leftover has nowhere to go: no 20-gal boom charge,
    mix only what the ground needs. See the spray mix calculator. */
 {id:'tpl29',category:'Spray',         name:'Pesticide - Boom (Precise)', machines:['e2']},
 {id:'tpl11',category:'Spray',         name:'Pesticide - Backpack', machines:['e43','e44','e45','e46','e47']},
 {id:'tpl12',category:'Spray',         name:'Fertilizer',           machines:['e2']},
 {id:'tpl13',category:'Spray',         name:'Fertilizer',           machines:['e43','e44','e45','e46','e47']},
 {id:'tpl14',category:'Fertilize',     name:'Granular',             machines:['e28','e29']},
 {id:'tpl15',category:'Aeration',      name:'Tractor-Mounted',      machines:['e23','e22','e30']},
 {id:'tpl16',category:'Miscellaneous', name:'Traffic Plots',        machines:['e31']},
 {id:'tpl17',category:'Cultivation',   name:'Bleckavate',           machines:['e23','e22','e33']},
 {id:'tpl18',category:'Cultivation',   name:'Fraise Mow',           machines:['e23','e22','e32']},
 {id:'tpl19',category:'Irrigation',    name:'Valve - Fix',          machines:[]},
 {id:'tpl20',category:'Irrigation',    name:'Head - Fix',           machines:[]},
 {id:'tpl21',category:'Maintenance',   name:'Reels - Grind',        machines:['e35','e36']},
 {id:'tpl22',category:'Maintenance',   name:'Bed Knife - Grind',    machines:['e34']},
 {id:'tpl23',category:'Maintenance',   name:'Reels - Backlap',      machines:[]},
 {id:'tpl24',category:'Maintenance',   name:'Oil Change',           machines:[]},
 {id:'tpl25',category:'Cultivation',   name:'Topdress - Rotary',    machines:['e49','e24']},
 {id:'tpl26',category:'Cultivation',   name:'Topdress - Drop',      machines:['e49','e25']},
 {id:'tpl27',category:'Mow',           name:'Weedeat',              machines:['e57','e59','e60','e61']},
 {id:'tpl28',category:'Irrigation',    name:'Hand Water',           machines:[]}
];
/* Filled in place rather than reassigned: STORE_DEFS, the sync module and a
   dozen closures all hold this one array, and swapping it for a new one would
   leave every one of them pointing at the old contents. */
var TEMPLATES=[];
(function(){
  var stored=loadTemplates();
  if(stored&&stored.length){ stored.forEach(function(t){ if(t) TEMPLATES.push(t); }); return; }
  TASK_SEED.forEach(function(t){
    TEMPLATES.push({id:t.id,name:t.name,category:t.category,plots:[],repeat:'As needed',freq:null,months:[],
                    machines:(t.machines||[]).slice(),machine:'',eqNote:t.eqNote||''});
  });
})();

/* ---- who may change the task list ----
   The list of jobs the farm does. Everybody but the undergraduates, matching
   invCanEdit(): deciding what a job IS is a different thing from doing it.
   Transcribed into firestore.rules as canEditTaskList(). */
function tplCanEdit(){
  if(!SESSION.pid) return false;
  if(typeof personActive==='function'&&!personActive(SESSION.pid)) return false;
  /* Off the ROSTER, never off currentRole -- currentRole is screen state the
     database cannot see, so reading it here guarantees the app and the rules
     drift apart. Same rule as schedCanEdit(). */
  return (typeof personRole==='function')&&personRole(SESSION.pid)!=='Undergraduate Student';
}

/* ---- removal ----
   Dillon's call, 2026-08-26: anybody who can edit the list can remove from it.
   Under the hood a removal is a TOMBSTONE, not a deletion, and that is not
   second-guessing him -- it is the only version that actually works over the
   shared database. A phone with the switch off keeps its own copy of the list;
   when it is switched on it pushes up everything the shared copy does not have,
   which would resurrect anything genuinely deleted. Marking it removed means
   the removal itself travels, so it stays removed.

   It is invisible either way: nothing but tplRestore() ever shows one again. */
function tplLive(){ return TEMPLATES.filter(function(t){ return t&&!t.removed; }); }
function tplFind(id){ for(var i=0;i<TEMPLATES.length;i++) if(TEMPLATES[i]&&TEMPLATES[i].id===id) return TEMPLATES[i]; return null; }
function tplRemove(id){
  var t=tplFind(id); if(!t||!tplCanEdit()) return false;
  t.removed=true; t.removedBy=SESSION.pid||null; t.removedAt=isoLocal(new Date(),true);
  saveTemplates(); return true;
}
function tplRestore(id){
  var t=tplFind(id); if(!t||!tplCanEdit()) return false;
  delete t.removed; delete t.removedBy; delete t.removedAt;
  t.updatedAt=isoLocal(new Date(),true); t.updatedBy=SESSION.pid||null;
  saveTemplates(); return true;
}
function tplRemovedList(){ return TEMPLATES.filter(function(t){ return t&&t.removed; }); }
/* Machines allowed for a task; falls back to the whole active roster. */
function tplMachineList(list){
 var all=(typeof EQUIP!=='undefined'?EQUIP:[]).filter(function(e){return e.active;});
 if(!list||!list.length)return all;
 var byId={}; all.forEach(function(e){byId[e.id]=e;});
 return list.map(function(id){return byId[id];}).filter(Boolean);
}
let FORM={id:null,mode:'template',students:1,name:'',category:CATEGORIES[0],plots:[],repeat:'Daily',freq:3,months:[]};

/* "Plots 14, 15" — except the alley network, which reads as zones. */
function areaLabel(pl){
 if(!pl||!pl.length) return '';
 if(pl.length===1&&pl[0]===ALLEY_UNIT) return 'Alleys & borders';
 var zn=pl.filter(function(n){return typeof jobIsZone==='function'&&jobIsZone(n);});
 if(zn.length===pl.length) return zn.length===1?jobZoneName(zn[0]):('Alleys & borders · '+zn.length+' zones');
 /* A spray can now cover plots AND alley ground in one job, so the label names
    both rather than printing a zone code in the middle of a plot list. */
 var plots=pl.filter(function(n){return zn.indexOf(n)<0;});
 var head='Plots '+plots.join(', ');
 if(!zn.length) return head;
 return head+' + '+(zn.length===1?jobZoneName(zn[0]):(zn.length+' alley zones'));
}
function plotsLabel(arr){return arr&&arr.length?(areaLabel(arr)+' ›'):'Tap to choose ›';}
/* Show the machine picker when the task has a machine list, or for any
   category that normally runs a machine. */
function wantsMachineRow(){
 if(FORM.machines&&FORM.machines.length)return true;
 return /mow|spray|fertiliz|aerat|cultivat|paint|maintenance/i.test(FORM.category||'');
}
function initFormChrome(){
 var cat=document.getElementById('tn-cat');
 if(cat&&!cat.options.length)cat.innerHTML=CATEGORIES.map(function(c){return '<option value="'+c+'">'+c+'</option>';}).join('');
 var mg=document.getElementById('tn-months');
 if(mg)mg.innerHTML=MONTHS.map(function(m){return '<span class="mchip" data-month="'+m+'">'+m+'</span>';}).join('');
 var fr=document.getElementById('tn-freq');
 if(fr)fr.innerHTML=FREQS.map(function(n){return '<span class="fchip" data-freq="'+n+'">'+n+'× / wk</span>';}).join('');
}
function editAssigneePool(){
 var pool=CREW.slice();
 if(FORM.target&&!pool.some(function(c){return c.pid===FORM.target;})){
   var p=rstFind(FORM.target);
   if(p) pool.unshift({pid:p.id,name:pName(p),role:p.role,lab:p.lab||'—'});
 }
 return pool;
}
function syncForm(){
 var req=FORM.mode==='request';
 var asg=FORM.mode==='assign';
 var edt=FORM.mode==='edit';
 document.getElementById('tn-name').value=FORM.name;
 document.getElementById('tn-cat').value=FORM.category;var _mm=document.getElementById('tn-machine');if(_mm){_mm.innerHTML='<option value="">— None —</option>'+tplMachineList(FORM.machines).map(function(e){return '<option value="'+e.id+'">'+esc(e.name)+'</option>';}).join('');_mm.value=FORM.machine||'';}
 document.getElementById('tn-plots').textContent=plotsLabel(FORM.plots);
 document.getElementById('tn-students-row').style.display=(req&&FORM.showStudents)?'':'none';
 document.getElementById('tn-students').value=FORM.students||1;
 var toCrew=req&&FORM.reqType==='toCrew';
 var toLab=asg&&FORM.scope==='lab';
 var showTarget=toCrew||toLab||edt;
 var secEl=document.getElementById('tn-target-sec');
 secEl.style.display=showTarget?'':'none';
 secEl.textContent=edt?'Assigned to':(asg?'Assign to (your lab)':'Request to');
 document.getElementById('tn-target').style.display=showTarget?'':'none';
 if(showTarget){var pool=edt?editAssigneePool():(toLab?labMembers():CREW); var el=document.getElementById('tn-target'); el.innerHTML=pool.length?pool.map(function(c){return crewPill(c,FORM.target===c.pid);}).join(''):'<div class="rs" style="padding:4px 4px">No grad students or technicians in your lab yet.</div>';}
 var selfRow=document.getElementById('tn-selfrow');
 if(selfRow)selfRow.style.display=(asg&&FORM.scope==='self')?'':'none';
 var mrow=document.getElementById('tn-machine-row'); if(mrow)mrow.style.display=wantsMachineRow()?'':'none';
 var enote=document.getElementById('tn-eqnote');
 if(enote){enote.style.display=FORM.eqNote?'':'none';enote.textContent=FORM.eqNote?('Equipment on file: '+FORM.eqNote+' — not in the equipment roster yet.'):'';}
 var wrow=document.getElementById('tn-whenrow'), wsel=document.getElementById('tn-when');
 if(wrow&&wsel){ if(asg||edt){ wrow.style.display=''; wsel.innerHTML=asDateOptions(FORM.dueOrd||asTodayOrd()); } else { wrow.style.display='none'; } }
 document.getElementById('tn-schedule').style.display=(req||asg||edt)?'none':'';
 /* Delete belongs to an existing job on the task list, and nowhere else: not
    on a new one (there is nothing to delete), not on an assignment, and not on
    a request. Undergrads never see it because they cannot open this form to
    edit in the first place, but the check is here too -- a hidden control is a
    courtesy, not a lock. */
 var dw=document.getElementById('tn-delwrap');
 if(dw) dw.style.display=(!req&&!asg&&!edt&&!!FORM.id&&(typeof tplCanEdit!=='function'||tplCanEdit()))?'':'none';
 document.getElementById('tn-repeat').value=FORM.repeat;
 var custom=FORM.repeat==='Custom';
 document.getElementById('tn-custom-sec').style.display=custom?'':'none';
 document.getElementById('tn-freq').style.display=custom?'':'none';
 document.querySelectorAll('#tn-freq .fchip').forEach(function(c){c.classList.toggle('on',+c.getAttribute('data-freq')===+FORM.freq);});
 document.querySelectorAll('#tn-months .mchip').forEach(function(c){c.classList.toggle('on',FORM.months.indexOf(c.getAttribute('data-month'))>=0);});
 document.getElementById('tn-title').textContent=req?(FORM.reqType==='toCrew'?'Request grad / tech':(FORM.showStudents?'Request an undergrad':'Request a task')):(asg?(FORM.scope==='self'?'Assign task to me':'Assign to my lab'):(edt?'Edit task':(FORM.id?'Edit this job':'Add to the task list')));
 document.getElementById('tn-save').textContent=(req?'Submit request':(asg?'Assign task':(edt?'Save changes':'Save Task')));
}
function openAssignForm(){FORM={id:null,mode:'assign',scope:'lab',target:(labMembers()[0]||{}).pid||null,name:'',category:CATEGORIES[0],plots:[],repeat:'None',freq:3,months:[],dueOrd:asTodayOrd()};syncForm();go('tasknew');}
function openSelfTask(){FORM={id:null,mode:'assign',scope:'self',target:SESSION.pid,name:'',category:CATEGORIES[0],plots:[],repeat:'None',freq:3,months:[],dueOrd:asTodayOrd()};syncForm();go('tasknew');}
function openEditTask(id){
 var t=TASKS.find(function(x){return x.id===id;}); if(!t) return;
 FORM={id:t.id,mode:'edit',name:t.title,category:t.type,plots:(t.plots||[]).slice(),machine:t.machine||'',machines:[],repeat:'None',freq:3,months:[],dueOrd:t.dueOrd||asTodayOrd(),target:t.assignee||null};
 syncForm(); go('tasknew');
}
function openForm(tpl){
 if(tpl){FORM={id:tpl.id,mode:'template',students:1,name:tpl.name,category:tpl.category,plots:(tpl.plots||[]).slice(),repeat:tpl.repeat,freq:tpl.freq||3,months:(tpl.months||[]).slice(),machine:tpl.machine||'',machines:(tpl.machines||[]).slice(),eqNote:tpl.eqNote||''};}
 else{FORM={id:null,mode:'template',students:1,name:'',category:CATEGORIES[0],plots:[],repeat:'As needed',freq:3,months:[],machines:[],eqNote:''};}
 syncForm(); go('tasknew');
}
function openReqForm(withStudents){
 FORM={id:null,mode:'request',reqType:'toBill',showStudents:withStudents!==false,students:1,name:'',category:CATEGORIES[0],plots:[],repeat:'None',freq:3,months:[]};
 syncForm(); go('tasknew');
}
function openCrewReq(){
 FORM={id:null,mode:'request',reqType:'toCrew',showStudents:false,students:1,target:(CREW[0]&&CREW[0].pid)||null,name:'',category:CATEGORIES[0],plots:[],repeat:'None',freq:3,months:[]};
 syncForm(); go('tasknew');
}
function saveForm(){
 FORM.name=document.getElementById('tn-name').value.trim();
 if(FORM.mode==='assign'){
   if(!FORM.name){toast('Enter a task name');return;}
   var who=(FORM.scope==='self')?SESSION.pid:FORM.target;
   if(FORM.scope==='lab'&&!who){toast('Pick a lab member to assign');return;}
   var _ws=document.getElementById('tn-when'); var _do=(_ws&&parseInt(_ws.value,10))||FORM.dueOrd||asTodayOrd();
   TASKS.push({createdBy:SESSION.pid,id:newId('a'),title:FORM.name,area:FORM.plots.length?areaLabel(FORM.plots):'—',plots:FORM.plots.slice(),assignee:who,status:'todo',kind:'task',badge:null,type:FORM.category,machine:FORM.machine||null,dueAt:isoFromOrd(_do),dueOrd:_do,repeat:'None',freq:null,months:[],assignedBy:SESSION.pid,desc:''});
   toast(FORM.scope==='self'?'Added to your tasks ✓':'Assigned to '+(nameOf(who)||who)+' ✓');
   back();
   tbTab=(FORM.scope==='self')?'mine':'board';
   renderBoard();
   return;
 }
 if(FORM.mode==='edit'){
   if(!FORM.name){toast('Enter a task name');return;}
   var _et=TASKS.find(function(x){return x.id===FORM.id;});
   if(!_et){toast('That task no longer exists');back();return;}
   var _ews=document.getElementById('tn-when'); var _edo=(_ews&&parseInt(_ews.value,10))||FORM.dueOrd||asTodayOrd();
   _et.title=FORM.name;
   _et.type=FORM.category;
   _et.plots=FORM.plots.slice();
   _et.area=FORM.plots.length?areaLabel(FORM.plots):'—';
   _et.machine=FORM.machine||null;
   _et.dueOrd=_edo;
   _et.dueAt=isoFromOrd(_edo);
   if(FORM.target) _et.assignee=FORM.target;
   toast('Task updated ✓');
   back();
   renderBoard();
   return;
 }
 if(FORM.mode==='request'){
   if(!FORM.name){toast(FORM.reqType==='toCrew'?'Enter the task':'Enter what you need');return;}
   if(FORM.reqType==='toCrew'){
     if(!FORM.target){toast('Pick who to request');return;}
     TASKS.push({createdBy:SESSION.pid,id:newId('r'),title:FORM.name,area:FORM.plots.length?areaLabel(FORM.plots):'—',plots:FORM.plots.slice(),assignee:null,status:'todo',kind:'request',origin:'manager',target:FORM.target,badge:null,type:FORM.category,machine:FORM.machine||null,dueAt:atToday(null),repeat:'None',freq:null,months:[],requestedBy:SESSION.pid,desc:''});
     toast('Request sent to '+nameOf(FORM.target)+' ✓'); back(); tbTab='requests'; renderBoard(); return;
   }
   TASKS.push({createdBy:SESSION.pid,id:newId('r'),title:FORM.name,area:FORM.plots.length?areaLabel(FORM.plots):'—',plots:FORM.plots.slice(),assignee:null,status:'todo',kind:'request',origin:'crew',badge:null,type:FORM.category,machine:FORM.machine||null,dueAt:atToday(null),repeat:'None',freq:null,months:[],students:FORM.showStudents?(+FORM.students||1):1,requestedBy:SESSION.pid,desc:''});
   toast('Request submitted ✓'); back(); tbTab='requests'; renderBoard(); return;
 }
 if(!FORM.name){toast('Enter a task name');return;}
 /* The Add button is hidden from undergraduates and the rows are not tappable
    for them, but a hidden control is a courtesy and not a lock. The database
    refuses this write too -- see canEditTaskList() in firestore.rules. */
 if(!tplCanEdit()){ toast('Only staff can change the task list'); return; }
 var editing=!!FORM.id;
 var t={id:FORM.id||(newId('tpl')),updatedAt:isoLocal(new Date(),true),updatedBy:SESSION.pid||null,name:FORM.name,category:FORM.category,plots:FORM.plots.slice(),repeat:FORM.repeat,freq:FORM.repeat==='Custom'?FORM.freq:null,months:FORM.months.slice(),machine:FORM.machine||null,machines:(FORM.machines||[]).slice(),eqNote:FORM.eqNote||''};
 var idx=TEMPLATES.findIndex(function(x){return x.id===t.id;});
 if(idx>=0)TEMPLATES[idx]=t; else TEMPLATES.push(t);
 saveTemplates();
 toast(editing?'Task updated ✓':'Task saved ✓');
 back();
}
// form field events
document.getElementById('tn-name').addEventListener('input',function(e){FORM.name=e.target.value;});
document.getElementById('tn-students').addEventListener('change',function(e){FORM.students=+e.target.value;});
document.getElementById('tn-cat').addEventListener('change',function(e){FORM.category=e.target.value;var mrow=document.getElementById('tn-machine-row');if(mrow)mrow.style.display=wantsMachineRow()?'':'none';});
document.getElementById('s-tasknew').addEventListener('click',function(e){
});document.getElementById('tn-machine').addEventListener('change',function(e){FORM.machine=e.target.value;});
document.getElementById('tn-when')&&document.getElementById('tn-when').addEventListener('change',function(e){FORM.dueOrd=parseInt(e.target.value,10)||FORM.dueOrd;});
document.getElementById('tn-repeat').addEventListener('change',function(e){FORM.repeat=e.target.value;syncForm();});
document.getElementById('tn-freq').addEventListener('click',function(e){var c=e.target.closest('[data-freq]');if(!c)return;FORM.freq=+c.getAttribute('data-freq');syncForm();});
document.getElementById('tn-months').addEventListener('click',function(e){var c=e.target.closest('[data-month]');if(!c)return;var m=c.getAttribute('data-month');var i=FORM.months.indexOf(m);if(i>=0)FORM.months.splice(i,1);else FORM.months.push(m);syncForm();});
document.getElementById('tn-plots-row').addEventListener('click',function(){openPlotPick();});
document.getElementById('tn-target').addEventListener('click',function(e){var p=e.target.closest('[data-person]');if(!p)return;FORM.target=p.getAttribute('data-person');document.querySelectorAll('#tn-target .ppill').forEach(function(x){x.classList.remove('on');});p.classList.add('on');});
document.getElementById('tn-save').addEventListener('click',saveForm);
document.getElementById('tn-del').addEventListener('click',function(){
  if(!FORM.id||!tplCanEdit()) return;
  var t=tplFind(FORM.id); if(!t) return;
  if(!confirm('Delete “'+t.name+'”?\n\nIt stops showing when anybody assigns work. You can put it back from the bottom of the task list.')) return;
  var nm=t.name;
  if(tplRemove(FORM.id)){ toast('Deleted “'+nm+'”'); back(); }
});

/* ---- Plot picker (real farm map) ---- */
let PICK=[];
var PICKCTX={type:'',name:''};
function renderPlotPick(){
 var targets=PICKCTX.targets||(PICKCTX.targets=jobPlots(PICKCTX.type,PICKCTX.name,PICK));
 var st=jobMapEnsure('pick','ppmap');
 jobMapDraw(st,{mode:'pick',targets:targets,sel:PICK,fitKey:'pp:'+PICKCTX.type+'|'+PICKCTX.name,jobType:PICKCTX.type,jobName:PICKCTX.name,onTap:function(n,info){
   if(info.blocked){ toast(resStopMsg(info,n)); return; }
   if(info.partial) toast(resAroundMsg(info,n));
   jobTapSelect(PICK,n,info);
   renderPlotPick();
 }});
 pickFindWire('pp-find','pp-find-sug',function(){return PICKCTX.targets;},function(n){
   if(pickSelectByName(PICK,n,PICKCTX.type,PICKCTX.name)) renderPlotPick();
 });
 var k=document.getElementById('pp-kind'); if(k)k.textContent=jobKindLabel(PICKCTX.type,PICKCTX.name)||'Plots';
 var c=document.getElementById('pp-count'); if(c)c.textContent=PICK.length+' of '+targets.length+' selected';
 jobSyncAllChip('pp-all',PICK,targets,PICKCTX.type,PICKCTX.name);
}
document.getElementById('pp-all').addEventListener('click',function(){
 var r=jobToggleAll(PICK,PICKCTX.targets,PICKCTX.type,PICKCTX.name);
 toast(r.on?('Selected '+r.n+(r.skipped?(' · skipped '+r.skipped+' restricted'):'')):'Cleared');
 renderPlotPick();
});
var plotPickDone=null;
/* Keep only plots that exist on the map for this job, so a stale stub list
   ('11','12') does not survive into a real selection. */
function pickOpen(type,name,list){
 PICKCTX={type:type||'',name:name||''};
 PICKCTX.targets=jobPlots(PICKCTX.type,PICKCTX.name,list);
 /* A trial-dots job carries no plot list, but the picker still has to offer
    something tappable — e.g. logging where dots actually went. */
 if(!PICKCTX.targets.length) PICKCTX.targets=jobAllPlots();
 PICK=(list||[]).filter(function(n){return PICKCTX.targets.indexOf(n)>=0;});
}
function openPlotPick(){plotPickDone=null;pickOpen(FORM.category,FORM.name,FORM.plots);go('plotpick');}
function openFlPlotPick(){
 plotPickDone=function(sel){FLFORM.plots=sel.slice();};
 var op=FL_OPS.filter(function(o){return o.id===FLFORM.op;})[0];
 pickOpen(op?op.label:'','',FLFORM.plots);
 go('plotpick');
}
document.getElementById('pp-done').addEventListener('click',function(){if(plotPickDone){var cb=plotPickDone;plotPickDone=null;cb(PICK.slice());back();return;}FORM.plots=PICK.slice();document.getElementById('tn-plots').textContent=plotsLabel(FORM.plots);back();});

/* ---- Edit list + Assign stub ---- */
function tplSummary(t){
 var bits=[t.category];
 if(t.plots&&t.plots.length)bits.push(areaLabel(t.plots));
 if(t.machines&&t.machines.length)bits.push(tplMachineList(t.machines).map(function(e){return e.name;}).join(' · '));
 else if(t.eqNote)bits.push(t.eqNote);
 bits.push(t.repeat==='Custom'?(t.freq+'×/wk'):t.repeat);
 return bits.join(' · ');
}
/* ================== THE TASK LIST ==================
   The jobs the farm does, as opposed to the jobs somebody has been given. It
   is what the assign screen is built from, so it is the closest thing the app
   has to a definition of the work -- which is why it now lives behind its own
   button on the Task Board rather than behind an "Edit" button that read like
   it edited the board.

   Everybody sees it. Undergraduates read it (looking up what a job you have
   been handed actually involves is the point); everybody else may add, change
   and remove. See tplCanEdit().
   ================================================== */
function renderTemplates(){
 var el=document.getElementById('tpl-list');
 var intro=document.getElementById('tpl-intro');
 var addBtn=document.getElementById('tpl-add');
 var qEl=document.getElementById('tpl-search');
 var q=(qEl?qEl.value:'').trim().toLowerCase();
 var edit=tplCanEdit();
 if(addBtn) addBtn.style.display=edit?'inline-flex':'none';

 var live=tplLive();
 if(intro){
   intro.innerHTML='<div class="sec" style="display:flex;align-items:baseline;justify-content:space-between">'
     +'<span>'+(edit?'Tap a job to change it':'The jobs the farm does')+'</span>'
     +'<span style="font-weight:700;text-transform:none;letter-spacing:0">'+live.length+' job'+(live.length===1?'':'s')+'</span></div>'
     +(edit?'':'<div style="margin:0 16px 4px;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.45">'
       +'This is the list Bill and the labs assign work from. You can read what any job involves — which machine it needs, which plots, how often it comes round.</div>');
 }

 if(!live.length){
   el.innerHTML='<div class="sec" style="text-align:center;margin-top:24px">'
     +(edit?'Nothing on the list yet — tap ＋ Add to put the first job on it':'No jobs on the list yet')+'</div>';
   return;
 }
 var items=live.filter(function(t){if(!q)return true;return (t.name+' '+t.category+' '+(t.plots||[]).join(' ')+' '+t.repeat).toLowerCase().indexOf(q)>=0;});
 if(!items.length){ el.innerHTML='<div class="sec" style="text-align:center;margin-top:24px">No matches for “'+esc(q)+'”</div>'; return; }

 /* Grouped by category. A flat list of forty jobs is a list you scroll past;
    the categories are how everybody already talks about the work. */
 var byCat={};
 items.forEach(function(t){ (byCat[t.category]=byCat[t.category]||[]).push(t); });
 var cats=(typeof CATEGORIES!=='undefined'?CATEGORIES:[]).filter(function(c){return byCat[c]&&byCat[c].length;});
 Object.keys(byCat).forEach(function(c){ if(cats.indexOf(c)<0) cats.push(c); });

 el.innerHTML=cats.map(function(c){
   return '<div class="sec">'+esc(c)+'</div><div class="list">'+byCat[c].map(function(t){
     /* The ✕ used to sit here, right-aligned on every row. Deleting now lives
        at the bottom of the job's own edit form, where the thing itself is in
        front of you -- rather than a small red cross a thumb can catch while
        scrolling past forty of them. */
     var chev=edit?'<span style="color:#c2c7cd;font-size:17px;flex:none">›</span>':'';
     return '<div class="row'+(edit?' tap':'')+'" data-tpl="'+esc(t.id)+'">'
       +'<div style="flex:1;min-width:0"><div class="rt">'+esc(t.name)+'</div>'
       +'<div class="rs">'+tplSummary(t)+'</div></div>'+chev+'</div>';
   }).join('')+'</div>';
 }).join('')
 /* Removed jobs are kept, not destroyed, so somebody who takes one off by
    mistake can put it back rather than retyping it from memory. */
 +(function(){
    if(!edit) return '';
    var gone=tplRemovedList();
    if(!gone.length) return '';
    return '<div class="sec" style="margin-top:18px">Removed · tap to put back</div><div class="list">'
      +gone.map(function(t){
        return '<div class="row tap" data-tplback="'+esc(t.id)+'" style="opacity:.7">'
          +'<div style="flex:1;min-width:0"><div class="rt">'+esc(t.name)+'</div>'
          +'<div class="rs">'+esc(t.category||'')+(t.removedBy?(' · removed by '+esc(nameOf(t.removedBy)||t.removedBy)):'')+'</div></div>'
          +'<span style="font:800 12px \'Public Sans\';color:var(--acc);flex:none">Put back</span></div>';
      }).join('')+'</div>';
  })()
 +'<div style="height:18px"></div>';
}
document.getElementById('tpl-add').addEventListener('click',function(){ if(tplCanEdit()) openForm(null); });
document.getElementById('tpl-list').addEventListener('click',function(e){
 var bk=e.target.closest('[data-tplback]');
 if(bk){ e.stopPropagation(); if(tplRestore(bk.getAttribute('data-tplback'))){ toast('Back on the list ✓'); renderTemplates(); } return; }
 var r=e.target.closest('[data-tpl]');
 if(!r||!tplCanEdit()) return;
 var t=tplFind(r.getAttribute('data-tpl'));
 if(t)openForm(t);
});
document.getElementById('tpl-search').addEventListener('input',renderTemplates);
const FULLMONTH={Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May',Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December'};
function curMonth(){return MONTHS[new Date().getMonth()];}
const OPEN='__OPEN__';
const SELF='__SELF__';
let asTab='scheduled', asPerson=null, PICKS=[];
/* ---- assign scheduling (days in advance) ---- */
var ASMON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var ASDOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function asOrd(d){return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();}
function asToday0(){var d=new Date();d.setHours(0,0,0,0);return d;}
function asTodayOrd(){return asOrd(asToday0());}
function asDateFromOrd(o){return new Date(Math.floor(o/10000),(Math.floor(o/100)%100)-1,o%100);}
/* The wizard still picks a day, not a time, so this produces a date-only
   dueAt. A job given an hour gets one through the task form instead. */
function isoFromOrd(o){ var d=asDateFromOrd(o); return d?isoLocal(d,false):null; }
function asDateLabel(o){var t=asToday0();var to=asOrd(t);if(o===to)return 'Today';var tm=new Date(t);tm.setDate(tm.getDate()+1);if(o===asOrd(tm))return 'Tomorrow';var d=asDateFromOrd(o);return ASDOW[d.getDay()]+', '+ASMON[d.getMonth()]+' '+d.getDate();}
function asDateOptions(selOrd){var t=asToday0();var arr=[];for(var i=0;i<15;i++){var d=new Date(t);d.setDate(d.getDate()+i);arr.push(asOrd(d));}if(selOrd&&arr.indexOf(selOrd)<0)arr.unshift(selOrd);return arr.map(function(o){return '<option value="'+o+'"'+(o===selOrd?' selected':'')+'>'+asDateLabel(o)+'</option>';}).join('');}
function evSprayOrd(e){return evOrd(e)||asTodayOrd();}
function isFutureTask(t){var o=taskOrd(t); return !!o&&o>asTodayOrd();}
/* Bill reads the board to know what to grab on the way out the door -- which
   machine matters more there than which plots, so a task that names one shows
   the machine instead of the plot list. Jobs with no machine (paint, hand
   watering, ...) still show the plot/area text. */
function taskBoardSub(t){
 var m=(t&&t.machine&&typeof EQUIP!=='undefined')?EQUIP.find(function(e){return e.id===t.machine;}):null;
 return m?m.name:(t.area||'');
}
function areaWithDue(t){return taskBoardSub(t)+(isFutureTask(t)?' · 📅 '+dueLabel(t):'');}
/* ---- who is in, on any given day ----------------------------------
   This used to be three tables of made-up demo data: WEEKCREW (a hand-built
   Mon-Fri roster), SHIFT (invented hours per person) and ROSTER (a third,
   slightly different set of the same invented hours). Bill also had an
   "Edit crew" button that let him type the day board in by hand, which meant
   the app held an opinion about who was working that nobody had told it.

   All of it is gone. The undergrads say when they are coming in, on their own
   profile, and every screen that needs to know reads schedShiftOn(). One
   answer, given by the people who actually know it. */
var asDay=new Date().getDay();
function asDayOrd(){var t=asToday0();for(var i=0;i<7;i++){var d=new Date(t);d.setDate(d.getDate()+i);if(d.getDay()===asDay)return asOrd(d);}return asTodayOrd();}
/* The date the day chips are pointing at -- the next occurrence of that
   weekday. Which matters: the schedule is read per DATE, not per weekday, so
   the term the date falls in is what decides whose hours apply. */
function asDayDate(){ return asDateFromOrd(asDayOrd()); }
function pickRank(kind,id){for(var i=0;i<PICKS.length;i++){if(PICKS[i].kind===kind&&PICKS[i].id===id)return i+1;}return 0;}

/* One pill, three states, used by both the assign screen and the task detail
   picker so they can never disagree:
     scheduled  - green, with the hours they said they would be here
     off        - dimmed, "Off Thursday"
     not set    - dimmed, and says so, because "has not filled it in" and
                  "told us they are off" are different facts to whoever is
                  handing out the work. */
function schedPill(pid,on,d,clickable){
  d=d||new Date();
  var sh=schedShiftOn(pid,d);
  var dowName=(typeof WEEKDAYS_FULL!=='undefined'&&WEEKDAYS_FULL[d.getDay()])||'that day';
  var cls='ppill'+(sh?' sched':' off')+(on?' on':'');
  var sub= sh ? schedFmt(sh.start)+'–'+schedFmt(sh.end)
        : (schedHasAny(pid,d) ? 'Off '+dowName : 'No hours set');
  var attr=(clickable===false&&!sh)?'':' data-person="'+esc(pid)+'"';
  var tip=sh?'':' title="'+esc(sub)+'"';
  return '<span class="'+cls+'"'+attr+tip+'><span class="ppn"><span class="dotsm"></span>'+esc(nameOf(pid))+'</span>'
        +'<span class="ppt">'+esc(sub)+'</span></span>';
}
/* Scheduled first, then everyone else, each group in roster order. Bill reads
   the top of the list and stops. */
function schedSortForDay(ids,d){
  var inDay=[],out=[];
  ids.forEach(function(p){ (schedShiftOn(p,d)?inDay:out).push(p); });
  return inDay.concat(out);
}
function rosterPill(s,on){ return schedPill(pidOf(s)||s,on,new Date(),true); }
function renderAssignPeople(){
 var el=document.getElementById('as-people'); if(!el)return;
 var todayDow=new Date().getDay();
 /* Same two-label trick as boardDayChips() — CSS decides which one shows. */
 var days='<div class="chiprow" id="as-days">'+WEEKDAYS.map(function(w,i){var isToday=(i===todayDow);return '<span class="chip'+(asDay===i?' on':'')+(isToday?' today':'')+'" data-asday="'+i+'"'+(isToday?' title="Today"':'')+'><span class="dl-s">'+w+'</span><span class="dl-f">'+WEEKDAYS_FULL[i]+'</span>'+(isToday?'<span class="todot"></span>':'')+'</span>';}).join('')+'</div>';
 var dayLabel=WEEKDAYS[asDay]+' · '+asDateLabel(asDayOrd());
 var open='<span class="ppill open'+(asPerson===OPEN?' on':'')+'" data-person="'+OPEN+'"><span class="ppn"><span class="dotsm"></span>Open board</span><span class="ppt">Anyone can claim</span></span>';
 var self='<span class="ppill'+(asPerson===SELF?' on':'')+'" data-person="'+SELF+'"><span class="ppn"><span class="dotsm"></span>'+meName()+' (you)</span><span class="ppt">Assign to yourself</span></span>';
 var grads=CREW.filter(function(c){return c.role==='Grad student';});
 var techs=CREW.filter(function(c){return c.role==='Technician';});
 var theDay=asDayDate();
 var ordered=schedSortForDay(STUDENTS.slice(),theDay);
 var inCount=schedCrewOn(theDay).length;
 var workingPills=ordered.map(function(s){ return schedPill(s,asPerson===s,theDay,true); }).join('');
 /* Said out loud rather than left to be counted off the pills, because "three
    people are in on Thursday" is the number that decides how much work goes
    out. Between terms it is nobody, and the reason is worth naming -- an empty
    board with no explanation reads as a broken screen. */
 var sem=semForDate(theDay);
 var note = !sem
   ? 'No term covers '+dayLabel.replace(/^[^·]*· /,'')+' — nobody is scheduled between terms.'
   : (inCount? (inCount+' scheduled in'+(inCount===STUDENTS.length?'':' · the rest are off or have not set their hours'))
             : 'Nobody has hours down for '+WEEKDAYS_FULL[asDay]+' this term.');
 el.innerHTML=
   '<div class="sec">Day board</div>'+days
  +'<div class="sec">'+dayLabel+' · assign directly</div>'
  +'<div style="margin:0 16px 6px;font:600 11px \'Public Sans\';color:'+(inCount?'#2f9e4f':'var(--muted)')+';line-height:1.4">'+esc(note)+'</div>'
  +'<div class="chiprow">'+(workingPills||'<span style="font:600 11.5px \'Public Sans\';color:var(--muted);padding:2px 4px">No undergrads on the roster</span>')+'</div>'
  +'<div class="sec">Yourself</div><div class="chiprow">'+self+'</div>'
  +'<div class="sec">Open</div><div class="chiprow">'+open+'</div>'
  +'<div class="sec">Grad students · sends a request</div><div class="chiprow">'+grads.map(function(c){return crewPill(c,asPerson===c.pid);}).join('')+'</div>'
  +'<div class="sec">Technicians · sends a request</div><div class="chiprow">'+techs.map(function(c){return crewPill(c,asPerson===c.pid);}).join('')+'</div>';
}
function asRepeatLabel(t){return t.repeat==='Custom'?(t.freq+'×/wk'):t.repeat;}
function getPick(kind,id){return PICKS.find(function(p){return p.kind===kind&&p.id===id;});}
function assignRow(kind,id,title,sub){
 var r=pickRank(kind,id);
 var pill;
 if(r){ pill = isUndergrad(asPerson)
   ? '<span class="rankpill tap" data-unpick="'+kind+':'+id+'" title="Remove">'+r+'</span>'
   : '<span class="pill tap" data-unpick="'+kind+':'+id+'" title="Remove" style="background:#489FDF;color:#fff;flex:none">✓ Added</span>'; }
 else { pill='<span class="pill" style="background:#489FDF;color:#fff;flex:none">+ Add</span>'; }
 return '<div class="row tap" data-assign-'+kind+'="'+id+'"><div style="flex:1;min-width:0"><div class="rt">'+title+'</div><div class="rs">'+sub+'</div></div>'+pill+'</div>';
}
function renderAssignList(){
 var el=document.getElementById('as-list'); if(!el)return;
 var q=(document.getElementById('as-search').value||'').trim().toLowerCase();
 var html='';
 if(asTab==='scheduled'){
   var m=curMonth();
   var items=tplLive().filter(function(t){return (t.months||[]).indexOf(m)>=0;})
     .filter(function(t){return !q||(t.name+' '+t.category+' '+(t.plots||[]).join(' ')).toLowerCase().indexOf(q)>=0;});
   html+='<div class="sec">Repeating in '+(FULLMONTH[m]||m)+'</div>';
   html+= items.length? '<div class="list">'+items.map(function(t){return assignRow('tpl',t.id,t.name,t.category+' · '+(t.plots&&t.plots.length?areaLabel(t.plots):'—')+' · '+asRepeatLabel(t));}).join('')+'</div>'
        : '<div class="sec" style="text-align:center;margin-top:20px">'+(q?'No matches':'Nothing scheduled this month')+'</div>';
   var sprays=EVENTS.filter(function(e){return e.type==='spray';})
     .filter(function(e){return !q||(e.title+' '+(e.sub||'')).toLowerCase().indexOf(q)>=0;})
     .sort(function(a,b){return a.d-b.d;});
   if(sprays.length){
     html+='<div class="sec">Sprays from the calendar</div><div class="list">'+sprays.map(function(e){return assignRow('ev',e.id,e.title,(e.sub||'Spray')+' · '+asDateLabel(evSprayOrd(e)));}).join('')+'</div>';
   }
 } else if(asTab==='all'){
   var byCat={};
   tplLive().filter(function(t){return !q||(t.name+' '+t.category+' '+(t.plots||[]).join(' ')).toLowerCase().indexOf(q)>=0;})
     .forEach(function(t){(byCat[t.category]=byCat[t.category]||[]).push(t);});
   var cats=CATEGORIES.filter(function(c){return byCat[c]&&byCat[c].length;});
   Object.keys(byCat).forEach(function(c){if(cats.indexOf(c)<0)cats.push(c);});
   if(!cats.length){html+='<div class="sec" style="text-align:center;margin-top:20px">'+(q?'No matches':'No saved tasks yet')+'</div>';}
   else cats.forEach(function(c){
     html+='<div class="sec">'+c+'</div><div class="list">'+byCat[c].map(function(t){
       var mn=tplMachineList(t.machines&&t.machines.length?t.machines:null);
       var sub=(t.machines&&t.machines.length)?mn.map(function(e){return e.name;}).join(' · '):(t.eqNote||'No machine');
       return assignRow('tpl',t.id,t.name,sub);
     }).join('')+'</div>';
   });
 } else {
   var done=TASKS.filter(function(t){return t.status==='done'&&(!t.repeat||t.repeat==='None');})
     .filter(function(t){return !q||(t.title+' '+(t.type||'')).toLowerCase().indexOf(q)>=0;});
   html+='<div class="sec">Recently completed · one-off</div>';
   html+= done.length? '<div class="list">'+done.map(function(t){return assignRow('task',t.id,t.title,(t.area||'')+' · done '+(nameOf(t.completedBy)||'')+(t.completedAt?' · '+(fmtTime(t.completedAt)||t.completedAt):''));}).join('')+'</div>'
        : '<div class="sec" style="text-align:center;margin-top:20px">'+(q?'No matches':'No recent one-off tasks')+'</div>';
 }
 el.innerHTML=html;
}
function updateSaveBtn(){var b=document.getElementById('as-save');if(!b)return;b.textContent=PICKS.length?('Save · '+PICKS.length+' task'+(PICKS.length>1?'s':'')):'Save assignments';}
function assignEnter(){
 asTab='scheduled'; asPerson=null; PICKS=[]; asDay=new Date().getDay();
 var seg=document.getElementById('as-seg'); if(seg)seg.querySelectorAll('span').forEach(function(s){s.classList.toggle('on',s.getAttribute('data-atab')==='scheduled');});
 var sr=document.getElementById('as-search'); if(sr)sr.value='';
 closeWiz(); renderAssignPeople(); renderAssignList(); updateSaveBtn();
}
function removePick(kind,id){var i=PICKS.findIndex(function(p){return p.kind===kind&&p.id===id;});if(i>=0)PICKS.splice(i,1);renderAssignList();updateSaveBtn();}
/* ---- Assign wizard (map + note) ---- */
var WIZ=null;
/* Any job that lands on specific ground gets the plot-picking step — that is
   also the only place trial restrictions can be surfaced before the work goes
   out. Paint and shop Maintenance are not plot work, so they skip it. */
function needsMap(cat,name){
  /* A job gets the plot-picking step exactly when it lands on ground — which
     is also the only place trial restrictions can be surfaced before the work
     goes out. "Traffic Plots" sits under Miscellaneous but is plot work, so
     the job's own restriction kind decides, with the category as a backstop
     for free-text tasks. Paint and shop Maintenance skip it. */
  if(jobIsTrialDots(cat,name)) return false;
  if(jobResKind(cat,name)) return true;
  return /mow|spray|cultiv|fertiliz|aerat|irrigat/i.test(cat||'');
}
/* Whether starting the job drops the undergrad on the work map. Same set as
   needsMap, plus trial dots — that job has no plots to pick when it is being
   assigned, but the crew still works it off the map, ticking one pin per study. */
function worksOnMap(cat,name){ return jobIsTrialDots(cat,name)||needsMap(cat,name); }
function openWiz(kind,id){
 if(!asPerson){toast('Pick who to assign first');return;}
 var cat,name,defPlots,defDue=asDayOrd(),defMow=null,defMach='';
 if(kind==='tpl'){var t=TEMPLATES.find(function(x){return x.id===id;});if(!t)return;cat=t.category;name=t.name;defPlots=(t.plots||[]).slice();defMow=t;
   /* A task pinned to exactly one machine is on that machine whether or not
      anyone picked it, which is how a "Fertilizer · Spray" job is known to be
      going out through the boom rig. */
   defMach=t.machine||((t.machines||[]).length===1?t.machines[0]:'');}
 else if(kind==='ev'){var ev=EVENTS.find(function(x){return x.id===id;});if(!ev)return;cat='spray';name=ev.title;defPlots=parsePlots({area:ev.title});defDue=evSprayOrd(ev);}
 else{var tk=TASKS.find(function(x){return x.id===id;});if(!tk)return;cat=tk.type;name=tk.title;defPlots=parsePlots(tk);defMow=tk;defMach=tk.machine||'';}
 var pk=getPick(kind,id);
 WIZ={kind:kind,id:id,name:name,cat:cat,map:needsMap(cat,name),plots:(pk&&pk.plots?pk.plots:defPlots).slice(),note:pk?pk.note:'',dueOrd:(pk&&pk.dueOrd)?pk.dueOrd:defDue};
 /* A boom spray is planned here, not in the field: what is going in the tank
    and at what rate is Bill's call, and it rides out with the job so the crew
    only has to work out the volumes. */
 WIZ.spray=sprayIsBoom({type:cat,title:name,machine:defMach});
 WIZ.machine=defMach;
 WIZ.products=(pk&&pk.products&&pk.products.length)
   ? pk.products.map(function(p){return {name:p.name,rate:p.rate,unit:p.unit};})
   : [mixBlankProduct()];
 if(WIZ.map){
   /* Work out the tappable plots once, from the job itself — not from what is
      currently selected, or the map would shrink to the first plot picked.
      Nothing is pre-selected: the map opens empty and Bill taps what he wants. */
   WIZ.targets=jobPlots(WIZ.cat,WIZ.name,defPlots);
   WIZ.plots=WIZ.plots.filter(function(n){return WIZ.targets.indexOf(n)>=0;});
 }
 WIZ.step=WIZ.map?'map':'note';
 renderWiz(); document.getElementById('aswiz').classList.add('show');
}
function renderWizMap(){
 var targets=WIZ.targets||(WIZ.targets=jobPlots(WIZ.cat,WIZ.name,WIZ.plots));
 var st=jobMapEnsure('wiz','wzmap');
 jobMapDraw(st,{mode:'pick',targets:targets,sel:WIZ.plots,fitKey:'wz:'+WIZ.kind+':'+WIZ.id,jobType:WIZ.cat,jobName:WIZ.name,onTap:function(n,info){
   if(info.blocked){ toast(resStopMsg(info,n)); return; }
   if(info.partial) toast(resAroundMsg(info,n));
   jobTapSelect(WIZ.plots,n,info);
   renderWizMap();
 }});
 pickFindWire('wz-find','wz-find-sug',function(){return WIZ.targets;},function(n){
   if(pickSelectByName(WIZ.plots,n,WIZ.cat,WIZ.name)) renderWizMap();
 });
 var k=document.getElementById('wz-kind'); if(k)k.textContent=jobKindLabel(WIZ.cat,WIZ.name)||'Plots';
 document.getElementById('wz-count').textContent=WIZ.plots.length+' of '+targets.length+' selected';
 jobSyncAllChip('wz-all',WIZ.plots,targets,WIZ.cat,WIZ.name);
}
function renderWiz(){
 document.getElementById('wz-title').textContent=WIZ.name;
 document.getElementById('wz-map').classList.toggle('on',WIZ.step==='map');
 document.getElementById('wz-note-step').classList.toggle('on',WIZ.step==='note');
 document.getElementById('wz-next').textContent=WIZ.step==='map'?'Next':'✓';
 document.getElementById('wz-x').textContent=(WIZ.step==='note'&&WIZ.map)?'‹':'✕';
 if(WIZ.step==='map')renderWizMap();
 if(WIZ.step==='note'){document.getElementById('wz-note').value=WIZ.note||'';var ws=document.getElementById('wz-when');if(ws)ws.innerHTML=asDateOptions(WIZ.dueOrd||asTodayOrd());renderWizSpray();}
}
/* Same product cards as the mix sheet, redrawn only when one is added or
   dropped so typing is never interrupted. */
function renderWizSpray(){
 var box=document.getElementById('wz-spray'); if(!box||!WIZ)return;
 box.style.display=WIZ.spray?'':'none';
 if(!WIZ.spray)return;
 document.getElementById('wz-prods').innerHTML=mixProductRowsHtml(WIZ.products,'wzp');
}
function closeWiz(){var el=document.getElementById('aswiz');if(el)el.classList.remove('show');WIZ=null;}
function confirmWiz(){
 if(!WIZ)return;
 /* A spray goes out naming something the farm actually stocks, or it does not
    go out — a rate against a product nobody can find is not a work order. */
 if(WIZ.spray){ var pb=mixProductsProblem(WIZ.products); if(pb){ toast(pb); return; } }
 WIZ.note=document.getElementById('wz-note').value.trim();
 var ws=document.getElementById('wz-when'); if(ws)WIZ.dueOrd=parseInt(ws.value,10)||WIZ.dueOrd||asTodayOrd();
 var i=PICKS.findIndex(function(p){return p.kind===WIZ.kind&&p.id===WIZ.id;});
 var entry={kind:WIZ.kind,id:WIZ.id,note:WIZ.note,plots:WIZ.plots.slice(),dueOrd:WIZ.dueOrd,
            machine:WIZ.machine||null,
            products:WIZ.spray?WIZ.products.map(function(p){return {id:p.id,name:p.name,rate:p.rate,unit:p.unit};}):null};
 if(i>=0)PICKS[i]=entry; else PICKS.push(entry);
 closeWiz(); renderAssignList(); updateSaveBtn();
}
document.getElementById('aswiz').addEventListener('click',function(e){
 if(e.target.closest('#wz-x')){ if(WIZ&&WIZ.step==='note'&&WIZ.map){WIZ.note=document.getElementById('wz-note').value;WIZ.step='map';renderWiz();} else {closeWiz();} return; }
 if(e.target.closest('#wz-next')){ if(WIZ&&WIZ.step==='map'){WIZ.step='note';renderWiz();} else {confirmWiz();} return; }
 if(!WIZ)return;
 if(e.target.closest('#wz-addprod')){ WIZ.products.push(mixBlankProduct()); renderWizSpray(); return; }
 var wrm=e.target.closest('[data-wzprm]');
 if(wrm){ if(WIZ.products.length>1){ WIZ.products.splice(+wrm.getAttribute('data-wzprm'),1); renderWizSpray(); } return; }
 if(e.target.closest('#wz-all')){
   var r=jobToggleAll(WIZ.plots,WIZ.targets,WIZ.cat,WIZ.name);
   toast(r.on?('Selected '+r.n+(r.skipped?(' · skipped '+r.skipped+' restricted'):'')):'Cleared');
   renderWizMap(); return;
 }
});
/* Product fields write straight into the pick — no redraw, so the caret and
   the keyboard stay put while a rate is being typed. */
(function(){
 function readWizProd(e){
  if(!WIZ||!WIZ.products)return;
  var el=e.target, v;
  if(!el||!el.getAttribute)return;
  if((v=el.getAttribute('data-wzprate'))!=null){ WIZ.products[+v].rate=el.value; }
  else if((v=el.getAttribute('data-wzpunit'))!=null){ WIZ.products[+v].unit=el.value; }
 }
 var wz=document.getElementById('aswiz');
 wz.addEventListener('input',readWizProd);
 wz.addEventListener('change',readWizProd);
 /* The name field belongs to the inventory picker. */
 mixWireProducts(wz,'wzp',function(){ return WIZ?WIZ.products:null; },null);
})();
function togglePick(kind,id){
 if(!asPerson){toast('Pick an undergrad first');return;}
 var i=PICKS.findIndex(function(p){return p.kind===kind&&p.id===id;});
 if(i>=0)PICKS.splice(i,1); else PICKS.push({kind:kind,id:id,note:''});
 renderAssignList(); updateSaveBtn();
}
function pushAssign(o){
 var dueOrd=o.dueOrd||asTodayOrd();
 var base={createdBy:SESSION.pid,id:newId('t'),title:o.title,area:o.area,plots:o.plots,badge:o.badge||null,type:o.type,dueAt:isoFromOrd(dueOrd),dueOrd:dueOrd,repeat:o.repeat||'None',status:'todo',desc:o.note||''};
 if(o.mow&&o.mow.machine) base.machine=o.mow.machine;
 /* Whatever Bill wrote into the tank rides out on the job. The nozzle and the
    area are left for the field — the nozzle is whatever is on the rig that
    morning, and the area fills itself in from the plots. */
 if(o.mow&&o.mow.products){
   var prods=o.mow.products.filter(function(p){return (p.name&&p.name.trim())||mixNum(p.rate)!=null;});
   if(prods.length) base.mix={nozzle:SPRAY_NOZZLES[0].id,area:'',charge:'',
     products:prods.map(function(p){return {id:p.id||null,name:(p.name||'').trim(),rate:p.rate||'',unit:p.unit||MIX_UNITS[0].id};})};
 }
 if(isCrew(asPerson)){ base.kind='request'; base.origin='manager'; base.target=asPerson; base.assignee=null; base.requestedBy=SESSION.pid; }
 else { base.kind='task'; base.assignee=(asPerson===OPEN?null:(asPerson===SELF?SESSION.pid:asPerson)); }
 TASKS.push(base);
}
function commitTpl(id,note,plots,dueOrd,mow){var t=TEMPLATES.find(function(x){return x.id===id;});if(!t)return;var pl=(plots&&plots.length?plots:(t.plots||[])).slice();pushAssign({title:t.name,area:jobIsTrialDots(t.category,t.name)?'All active trials':(pl.length?areaLabel(pl):'—'),plots:pl,type:t.category,repeat:t.repeat,badge:(t.repeat&&t.repeat!=='None')?{t:'↻ '+asRepeatLabel(t),bg:'#eef1f4',fg:'#7b828d'}:null,note:note,dueOrd:dueOrd,mow:mow});}
function commitTask(id,note,plots,dueOrd,mow){var t=TASKS.find(function(x){return x.id===id;});if(!t)return;var pl=(plots&&plots.length?plots:parsePlots(t)).slice();pushAssign({title:t.title,area:pl.length?areaLabel(pl):t.area,plots:pl,type:t.type,repeat:'None',badge:null,note:note||t.desc||'',dueOrd:dueOrd,mow:mow});}
function commitEv(id,note,plots,dueOrd,mow){var e=EVENTS.find(function(x){return x.id===id;});if(!e)return;var pl=(plots&&plots.length?plots:parsePlots({area:e.title})).slice();pushAssign({title:e.title,area:pl.length?areaLabel(pl):(e.sub||'Spray'),plots:pl,type:'Spray',repeat:'None',badge:{t:'From calendar',bg:'#e7f1fb',fg:'#1f6fb0'},note:note||e.sub||'',dueOrd:dueOrd,mow:mow});}
function saveAssignments(){
 if(!asPerson){toast('Pick who to assign first');return;}
 if(!PICKS.length){toast('Add tasks first');return;}
 var who=asPerson, n=PICKS.length;
 PICKS.forEach(function(p){ if(p.kind==='tpl')commitTpl(p.id,p.note,p.plots,p.dueOrd,p); else if(p.kind==='ev')commitEv(p.id,p.note,p.plots,p.dueOrd,p); else commitTask(p.id,p.note,p.plots,p.dueOrd,p); });
 asPerson=null; PICKS=[]; asTab='scheduled';
 var seg=document.getElementById('as-seg'); if(seg)seg.querySelectorAll('span').forEach(function(s){s.classList.toggle('on',s.getAttribute('data-atab')==='scheduled');});
 var sr=document.getElementById('as-search'); if(sr)sr.value='';
 renderAssignPeople(); renderAssignList(); updateSaveBtn();
 toast(who===OPEN?('Posted '+n+' task'+(n>1?'s':'')+' to the open board ✓'):(who===SELF?('Assigned '+n+' task'+(n>1?'s':'')+' to yourself ✓'):(isCrew(who)?('Requested '+nameOf(who)+' for '+n+' task'+(n>1?'s':'')+' ✓'):('Assigned '+n+' task'+(n>1?'s':'')+' to '+nameOf(who)+' ✓'))));
}
document.getElementById('s-assign').addEventListener('click',function(e){
 if(e.target.closest('#as-save')){saveAssignments();return;}
 var dd=e.target.closest('[data-asday]'); if(dd){asDay=parseInt(dd.getAttribute('data-asday'),10);renderAssignPeople();return;}
 var p=e.target.closest('[data-person]'); if(p){var n=p.getAttribute('data-person');var prev=asPerson;asPerson=asPerson===n?null:n;if(asPerson!==prev)PICKS=[];renderAssignPeople();renderAssignList();updateSaveBtn();return;}
 var at=e.target.closest('span[data-atab]'); if(at){asTab=at.getAttribute('data-atab');renderAssignList();return;}
 var up=e.target.closest('[data-unpick]'); if(up){e.stopPropagation();var parts=up.getAttribute('data-unpick').split(':');removePick(parts[0],parts.slice(1).join(':'));return;}
 var atpl=e.target.closest('[data-assign-tpl]'); if(atpl){openWiz('tpl',atpl.getAttribute('data-assign-tpl'));return;}
 var aev=e.target.closest('[data-assign-ev]'); if(aev){openWiz('ev',aev.getAttribute('data-assign-ev'));return;}
 var atask=e.target.closest('[data-assign-task]'); if(atask){openWiz('task',atask.getAttribute('data-assign-task'));return;}
});
document.getElementById('as-search').addEventListener('input',renderAssignList);
document.getElementById('gr-submit').addEventListener('click',submitGradReq);
document.getElementById('s-assign').addEventListener('input',function(e){var n=e.target.closest('[data-note-id]');if(!n)return;var p=getPick(n.getAttribute('data-note-kind'),n.getAttribute('data-note-id'));if(p)p.note=n.value;});
initFormChrome(); syncForm();

/* ================= CALENDAR MODULE ================= */
/* ============================================================
   CALENDAR DATES · real days, not day-of-July
   ------------------------------------------------------------
   Every event used to carry `d:21` — a day number understood to mean July 2026
   — and the calendar refused to render anything outside that month:
   eventsOnDate() opened with a hard `if(dt.getMonth()!==6) return []`. Today
   was the constant 21. The whole module was a photograph of one week.

   Events now carry `date` (and `endDate`) as 'YYYY-MM-DD'. The seed keeps its
   day numbers as a layout — the demo week was built deliberately, with the
   spray on Monday and the lab tour on Thursday — and calSeedDate() re-anchors
   that layout onto the current week at boot. Jul 20 2026 was a Monday, so seed
   day 20 becomes this week's Monday and the shape of the week is preserved
   wherever in the year the app is opened.

   Anything created in the app gets a real date directly; only the seed goes
   through the re-anchoring.
   ============================================================ */
var CAL_SEED_MONDAY=20;   /* Jul 20 2026 — the Monday the demo week was drawn around */

/* The Monday of the week containing today. */
function calWeekMonday(){
  var d=new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return d;
}
/* Seed day-of-July -> a real date in the current week's frame. */
function calSeedDate(dayNum){
  if(dayNum==null) return null;
  var d=calWeekMonday(); d.setDate(d.getDate()+(dayNum-CAL_SEED_MONDAY));
  return isoLocal(d,false);
}
/* Give every seeded event a real date, once, at boot. */
function calSeedDates(){
  EVENTS.forEach(function(e){
    if(!e.date&&e.d!=null) e.date=calSeedDate(e.d);
    if(!e.endDate&&e.endD!=null) e.endDate=calSeedDate(e.endD);
    if(!e.repeatEndDate&&e.repeatEnd!=null) e.repeatEndDate=calSeedDate(e.repeatEnd);
  });
}
function evOrd(e){ return e&&e.date?ordOfISO(e.date):0; }
function evEndOrd(e){ return e?(e.endDate?ordOfISO(e.endDate):evOrd(e)):0; }
var DOWSH=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var DOWFULL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
/* fmtDate now takes an ISO date rather than a day-of-July number. */
function fmtDate(v){ var d=parseISO(v); if(!d)return ''; return DOWSH[d.getDay()]+', '+CAL_MON_SH[d.getMonth()]+' '+d.getDate(); }
var CAL_MON_SH=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function calMins(t){ if(!t)return 100000; t=(''+t).toLowerCase(); if(t.indexOf('all day')>=0)return -1; if(t==='out')return 200000;
 var m=t.match(/(\d+)(?::(\d+))?\s*([ap])/); if(!m)return 99999;
 var h=parseInt(m[1],10)%12; if(m[3]==='p')h+=12; return h*60+(m[2]?parseInt(m[2],10):0); }
var CTYPES2={crew:{label:'Crew',c:'#2f9e4f'},task:{label:'Tasks',c:'#58595b'},spray:{label:'Sprays',c:'#d17a00'},trial:{label:'Trials',c:'#489FDF'},event:{label:'Events',c:'#7c5cbf'},other:{label:'Other',c:'#8a94a0'}};
var CTYPE_ORDER=['crew','task','spray','trial','event'];
var EVENTS=[
 /* Empty on purpose — see TASKS. Held 28 sample calendar entries. */
];
var NOSHOW={};   /* calendar no-show tally, keyed by name; nameOf() passes an unmatched name through. Paused along with Time Clock no-shows -- see TC_NOSHOW_LATE_PAUSED. */
var CAL_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
var CAL_TODAY_DT=(function(){var d=new Date();d.setHours(0,0,0,0);return d;})();
var CAL_LABS=labNames();
var CTYPE_PILLS=['crew','spray','trial','event','other'];   // Tasks intentionally not filterable
/* Default lab per role, used only as a fallback for previews and for anyone
   whose roster record has no lab. The signed-in person's own lab comes from
   myLab(); see calMyLab(). */
var ROLE_LAB={manager:'Bill',grad:'Brosnan',faculty:'Horvath',tech:'Bill',undergrad:'Bill'};
/* The lab whose calendar the signed-in person lands on. Their own, if the
   roster knows it. */
function calMyLab(){ var l=myLab(); return (l&&l!=='—')?l:(ROLE_LAB[currentRole]||'Bill'); }
Object.keys(ROLE_LAB).forEach(function(k){if(USERS[k]&&USERS[k].lab&&USERS[k].lab!=='—')ROLE_LAB[k]=USERS[k].lab;});
calSeedDates();   /* give the seeded events real dates before anything reads them */
var calView='week';
var calLab=null;                            // null = All labs
var calTypes=new Set();                     // empty = all types
var calDayOpen=null;                        // Date when a single day is open, else null
var calWeekAnchor=new Date(CAL_TODAY_DT);    // any day within the shown week
var calMonthAnchor=new Date(CAL_TODAY_DT.getFullYear(),CAL_TODAY_DT.getMonth(),1);  // first of the shown month
function sameYMD(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
/* CAL_TODAY_DT is captured at load; compare against the live date so a
   session left open overnight does not keep calling yesterday "today". */
function isTodayD(dt){return sameYMD(dt,new Date());}
function addDays(dt,n){var d=new Date(dt);d.setDate(d.getDate()+n);return d;}
/* CAREFUL: the calendar's week starts on SUNDAY, because that is how the wall
   calendar it draws is laid out. The rainfall log further down this file has
   its own weekStart() that starts on MONDAY, because rain is totalled against
   the working week. Two different weeks, both correct, same name — they never
   meet because the rainfall one lives inside its own block. Do not "tidy" them
   into one; picking either answer silently moves the other screen's numbers by
   a day. */
function weekStart(dt){var d=new Date(dt);d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return d;}
function fmtClock(v){ // "HH:MM" (24h) -> "7:00a"
 if(!v)return ''; var p=(''+v).split(':'); var h=parseInt(p[0],10), m=parseInt(p[1]||'0',10);
 if(isNaN(h))return ''; var ap=h<12?'a':'p'; var h12=h%12; if(h12===0)h12=12;
 return h12+':'+(m<10?'0'+m:m)+ap;
}
function occursOn(e,dt){ // multi-day span + optional recurrence, on real dates
 var day=ordOfISO(isoLocal(dt,false));
 var start=evOrd(e); if(!start)return false;
 var span=evEndOrd(e);
 if(day>=start&&day<=span)return true;               // within the event's day span
 if(!e.repeat||e.repeat==='None')return false;
 var end=e.repeatEndDate?ordOfISO(e.repeatEndDate):(start+10000); /* a year out if open-ended */
 if(day<start||day>end)return false;
 var diff=Math.round((parseISO(isoLocal(dt,false))-parseISO(e.date))/86400000);
 if(e.repeat==='Daily')return true;
 if(e.repeat==='Weekly')return diff%7===0;
 if(e.repeat==='Every 2 weeks')return diff%14===0;
 return false;
}
function evMultiDay(e){return !!e.endDate&&evEndOrd(e)>evOrd(e);}
function evTimeLabel(e,dt){ // per-day label for multi-day events
 if(!evMultiDay(e))return e.time||'';
 var day=dt?ordOfISO(isoLocal(dt,false)):evOrd(e);
 if(day<=evOrd(e))return (e.start?e.start+' ':'')+'→';
 if(day>=evEndOrd(e))return '→ '+(e.end||'');
 return 'All day';
}
function eventsOnDate(dt){
 /* The month guard that used to live here — "return [] unless this is July
    2026" — is what made every other month of the calendar render blank. */
 return EVENTS.filter(calVisible).filter(function(e){return occursOn(e,dt);});
}
function calSelf(){ return me().n; }
function calUserLab(){return calMyLab();}   // who's adding → which lab tag
function evLab(ev){return ev.lab||'Bill';}                     // untagged/farm items belong to Bill
function calCanSeeType(t){ if(currentRole==='faculty'&&t==='crew')return false; return true; }
/* Taking an entry off the calendar MARKS it rather than removing it.

   Why it cannot simply be dropped from the list, now that the calendar is
   shared: a phone that was switched off still holds its own copy, and when it
   comes back it pushes up everything the shared copy is missing. A genuinely
   deleted entry would come straight back, and keep coming back. A mark travels
   like any other change, so it stays gone. The task list learned this first --
   see its sync module and docs/DECISIONS.md.

   It also no longer rebuilds EVENTS with filter(). Reassigning the array
   strands every reference already held elsewhere; the list is edited in place,
   the same rule storeHydrate follows. */
function calRemoveEvent(id){
  var ev=EVENTS.find(function(x){return x.id===id;});
  if(!ev) return false;
  if(typeof calCanRemoveEvent==='function'&&!calCanRemoveEvent(ev)){
    toast('That one is not yours to remove'); return false;
  }
  ev.removed=true;
  ev.removedBy=SESSION.pid||null;
  ev.removedAt=isoLocal(new Date(),true);
  try{ storeTouch(); }catch(e){}
  toast('Removed from the calendar');
  return true;
}

function calVisible(ev){
 if(ev.removed)return false;                              // taken off the calendar; the record stays
 if(!calCanSeeType(ev.type))return false;
 if(ev.type==='crew'&&ev.status!=='out')return false;     // Crew on calendar = absences only (availability lives on task board / home)
 if(ev.type==='crew'&&currentRole==='undergrad'&&!isMe(ev.person))return false;
 if(calLab&&evLab(ev)!==calLab)return false;              // lab selected → hide other labs
 if(calTypes.size>0&&!calTypes.has(ev.type))return false; // type pills active → only those types
 return true;
}
/* The list the Add screen is built from. It comes from calAddTypesFor() in
   app-02-fieldlog-sync.js, which reads the ROSTER -- because the database now
   enforces the same list, and a screen offering a choice the database will
   refuse looks to whoever taps it like the app is broken. The fallback is the
   old behaviour and is only reached if this file loads without app-02. */
function calAddTypes(){
  if(typeof calAddTypesFor==='function'){
    var t=calAddTypesFor(SESSION.pid);
    if(t&&t.length) return t;
  }
  if(currentRole==='manager')return ['crew','event','spray','trial','other'];
  if(currentRole==='grad'||currentRole==='tech')return ['event','spray','trial','other'];
  if(currentRole==='faculty')return ['event','trial','other'];
  if(currentRole==='undergrad')return ['timeoff'];
  return ['other'];
}
function getDayEvents(v){var d=(v instanceof Date)?v:parseISO(v); return d?eventsOnDate(d):[];}
function uniqTypes(evs){var s=[];evs.forEach(function(e){if(s.indexOf(e.type)<0)s.push(e.type);});return s;}
function buildCalLabs(){
 var el=document.getElementById('cal-labs'); if(!el)return;
 var h='<span class="labbtn'+(calLab===null?' on':'')+'" data-lab="__all">All</span>';
 CAL_LABS.forEach(function(l){h+='<span class="labbtn'+(calLab===l?' on':'')+'" data-lab="'+l+'">'+l+'</span>';});
 el.innerHTML=h;
}
function buildCalChips(){
 var el=document.getElementById('cal-chips'); if(!el)return;
 var types=CTYPE_PILLS.filter(calCanSeeType);
 var h=types.map(function(t){return '<span class="chip'+(calTypes.has(t)?' on':'')+'" data-cf="'+t+'"><span class="ev-dot" style="width:8px;height:8px;background:'+CTYPES2[t].c+';margin-right:6px;vertical-align:middle"></span>'+CTYPES2[t].label+'</span>';}).join('');
 el.innerHTML=h;
}
function calLabTag(ev){ if(calLab!==null)return ''; return ' <span style="display:inline-block;font:700 9px \'Public Sans\';color:#5b6470;background:#eef1f4;border-radius:5px;padding:1px 6px;margin-left:2px;vertical-align:middle">'+evLab(ev)+'</span>'; }
function evRow(ev,dt){
 var tm=CTYPES2[ev.type];
 var lbl=evTimeLabel(ev,dt);
 var right=lbl?'<span class="rs" style="flex:none">'+lbl+'</span>':'';
 var sub=(ev.sub&&ev.sub!==ev.time)?ev.sub:(nameOf(ev.person)||ev.person||tm.label);
 return '<div class="row tap" data-ev="'+ev.id+'"><span class="ev-dot" style="background:'+tm.c+'"></span><div style="flex:1;min-width:0"><div class="rt">'+esc(ev.title)+'</div><div class="rs">'+sub+calLabTag(ev)+'</div></div>'+right+'</div>';
}
function dayStrip(dt){
 var ws=weekStart(dt), s='<div class="cal-strip">';
 for(var i=0;i<7;i++){ var wd=addDays(ws,i);
   var pips=uniqTypes(eventsOnDate(wd)).slice(0,4).map(function(t){return '<span class="pip" style="background:'+CTYPES2[t].c+'"></span>';}).join('');
   var sel=(calDayOpen&&sameYMD(wd,calDayOpen));
   s+='<div class="cal-d tap'+(sel?' on':(isTodayD(wd)?' today':''))+'" data-date="'+wd.getTime()+'"><div class="dow">'+DOWSH[wd.getDay()]+'</div><div class="dnum">'+wd.getDate()+'</div><div class="pips">'+pips+'</div></div>';
 }
 return s+'</div>';
}
function setCalToggleVisible(show){ var sv=document.getElementById('cal-view'); if(sv)sv.style.display=show?'':'none'; }
function renderCalWeek(){
 var body=document.getElementById('cal-body'); if(!body)return;
 var ws=weekStart(calDayOpen||calWeekAnchor), first=ws, last=addDays(ws,6);
 var head='';
 if(!calDayOpen){
   var title=(first.getMonth()===last.getMonth())?CAL_MONTHS[first.getMonth()]
     :CAL_MONTHS[first.getMonth()]+' – '+CAL_MONTHS[last.getMonth()];
   head='<div class="cal-monthnav"><span class="cm-nav tap" data-wnav="-1">‹</span><div class="cm-t">'+title+'</div><span class="cm-nav tap" data-wnav="1">›</span></div>';
 }
 setCalToggleVisible(!calDayOpen);
 var dayBanner='';
 if(calDayOpen){
   var dsel=calDayOpen;
   dayBanner='<div class="cal-daynav">'
     +'<span class="cd-nav tap" data-dnav="-1">‹</span>'
     +'<div class="cd-t"><div class="d1">'+DOWFULL[dsel.getDay()]+'</div><div class="d2'+(isTodayD(dsel)?' today':'')+'">'+CAL_MONTHS[dsel.getMonth()]+' '+dsel.getDate()+', '+dsel.getFullYear()+(isTodayD(dsel)?' · Today':'')+'</div></div>'
     +'<span class="cd-nav tap" data-dnav="1">›</span></div>';
 }
 var strip=dayStrip(ws);
 var filters='<div class="chips" id="cal-labs"></div><div class="chips" id="cal-chips"></div>';
 var lists='';
 if(calDayOpen){
   var dt2=calDayOpen;
   var evs2=eventsOnDate(dt2).slice().sort(function(a,b){return calMins(a.time)-calMins(b.time);});
   lists= evs2.length? '<div class="cal-agenda">'+evs2.map(function(e){return agRow(e,dt2);}).join('')+'</div>'
        : '<div class="cal-ag-empty">Nothing scheduled for this day</div>';
 } else {
   for(var i=0;i<7;i++){ var dt=addDays(ws,i);
     var evs=eventsOnDate(dt).slice().sort(function(a,b){return calMins(a.time)-calMins(b.time);});
     lists+='<div class="cal-daytitle tap" data-date="'+dt.getTime()+'"><span class="d1">'+DOWSH[dt.getDay()]+'</span><span class="d2">'+CAL_MONTHS[dt.getMonth()].slice(0,3)+' '+dt.getDate()+(isTodayD(dt)?' · Today':'')+'</span><span style="flex:1"></span><span class="cal-chev">›</span></div>';
     lists+= evs.length? '<div class="list">'+evs.map(function(e){return evRow(e,dt);}).join('')+'</div>' : '<div class="list"><div class="row" style="border-bottom:none"><div class="rs">No events</div></div></div>';
   }
 }
 body.innerHTML=head+dayBanner+strip+filters+lists+'<div style="height:16px"></div>';
 buildCalLabs(); buildCalChips();
}
function renderCalMonth(){
 var body=document.getElementById('cal-body'); if(!body)return;
 setCalToggleVisible(true);
 var y=calMonthAnchor.getFullYear(), m=calMonthAnchor.getMonth();
 var lead=new Date(y,m,1).getDay(), dim=new Date(y,m+1,0).getDate();
 var head='<div class="cal-monthnav"><span class="cm-nav tap" data-mnav="-1">‹</span><div class="cm-t">'+CAL_MONTHS[m]+'</div><span class="cm-nav tap" data-mnav="1">›</span></div>';
 var dowhead='<div class="cal-dow">'+['S','M','T','W','T','F','S'].map(function(x){return '<span>'+x+'</span>';}).join('')+'</div>';
 var cells='';
 for(var i=0;i<lead;i++)cells+='<div class="cal-cell mut"></div>';
 for(var d=1;d<=dim;d++){ var dt=new Date(y,m,d);
   var pips=uniqTypes(eventsOnDate(dt)).slice(0,4).map(function(t){return '<span class="pip" style="background:'+CTYPES2[t].c+'"></span>';}).join('');
   cells+='<div class="cal-cell tap'+(isTodayD(dt)?' today':'')+'" data-date="'+dt.getTime()+'"><div class="cn">'+d+'</div><div class="pips">'+pips+'</div></div>';
 }
 body.innerHTML=head+dowhead+'<div class="cal-grid">'+cells+'</div><div style="height:16px"></div>';
}
function agRow(ev,dt){
 var tm=CTYPES2[ev.type];
 var time=evTimeLabel(ev,dt)||'—';
 var sub=(ev.sub&&ev.sub!==ev.time)?ev.sub:(nameOf(ev.person)||ev.person||tm.label);
 return '<div class="cal-ag tap'+(ev.status==='out'?' out':'')+'" data-ev="'+ev.id+'"><div class="cal-ag-t">'+time+'</div><div class="cal-ag-bar" style="background:'+tm.c+'"></div><div class="cal-ag-main"><div class="rt">'+esc(ev.title)+'</div><div class="rs">'+sub+calLabTag(ev)+'</div></div></div>';
}
function renderCalBody(){ if(calView==='month')renderCalMonth(); else renderCalWeek(); }
function setCalView(v){ calView=v; calDayOpen=null; var sv=document.getElementById('cal-view'); if(sv)sv.querySelectorAll('span').forEach(function(s){s.classList.toggle('on',s.getAttribute('data-v')===v);}); renderCalBody(); }
function openCalDay(dt){
 calDayOpen=new Date(dt); calWeekAnchor=new Date(dt); calView='week';
 var sv=document.getElementById('cal-view'); if(sv)sv.querySelectorAll('span').forEach(function(s){s.classList.toggle('on',s.getAttribute('data-v')==='week');});
 renderCalBody();
}
function calEnter(){
 var sv=document.getElementById('cal-view'); if(sv)sv.querySelectorAll('span').forEach(function(s){s.classList.toggle('on',s.getAttribute('data-v')===calView);});
 renderCalBody();
}
function openCalEvent(id){
 var ev=EVENTS.find(function(x){return x.id===id;}); if(!ev)return;
 var tm=CTYPES2[ev.type];
 var rows='<div class="fld"><span class="fl">Type</span><span class="fv"><span class="ev-dot" style="width:9px;height:9px;background:'+tm.c+';margin-right:6px;vertical-align:middle"></span>'+tm.label+'</span></div>';
 rows+='<div class="fld"><span class="fl">Date</span><span class="fv">'+esc(evMultiDay(ev)?fmtDate(ev.date)+' → '+fmtDate(ev.endDate):fmtDate(ev.date))+'</span></div>';
 if(ev.time)rows+='<div class="fld"><span class="fl">Time</span><span class="fv">'+ev.time+'</span></div>';
 if(ev.person)rows+='<div class="fld"><span class="fl">Person</span><span class="fv">'+esc(nameOf(ev.person)||ev.person)+'</span></div>';
 rows+='<div class="fld"><span class="fl">Lab</span><span class="fv">'+evLab(ev)+'</span></div>';
 if(ev.repeat&&ev.repeat!=='None')rows+='<div class="fld"><span class="fl">Repeat</span><span class="fv">'+esc(ev.repeat)+(ev.repeatEndDate?' · until '+esc(fmtDate(ev.repeatEndDate)):'')+'</span></div>';
 if(ev.sub&&ev.sub!==ev.time)rows+='<div class="fld"><span class="fl">Details</span><span class="fv">'+esc(ev.sub)+'</span></div>';
 if(ev.notes)rows+='<div class="fld" style="align-items:flex-start"><span class="fl">Notes</span><span class="fv" style="text-align:right;white-space:pre-wrap">'+esc(ev.notes)+'</span></div>';
 document.getElementById('ce-body').innerHTML=
   '<div class="hdr" style="background:#2f3133;padding:15px 16px;gap:10px"><div class="title" style="color:#fff;font-size:17px;flex:1;line-height:1.15">'+esc(ev.title)+'</div></div>'
  +'<div class="sec">Details</div><div class="list">'+rows+'</div>';
 var acts='';
 /* Bill may remove anything; everybody else may remove their own time off.
    Same function the database checks, so the button and the answer agree. */
 var mayRemove=(typeof calCanRemoveEvent==='function') ? calCanRemoveEvent(ev)
                                                       : (currentRole==='manager');
 if(mayRemove){
   acts+='<div class="action tap" data-delev="'+ev.id+'" style="flex:1;background:#17181a">Remove</div>';
 }
 if(!acts)acts='<div style="text-align:center;width:100%;font-weight:700;font-size:12px;color:var(--muted);padding:6px">View only</div>';
 document.getElementById('ce-actions').innerHTML=acts;
 show('calevent',true);
}
function renderCalAdd(){
 var types=calAddTypes();
 var isTimeoff=(types.length===1&&types[0]==='timeoff');
 document.getElementById('ca-title').textContent=isTimeoff?'Log time off':'Add to calendar';
 document.getElementById('ca-save').textContent=isTimeoff?'Submit time off':'Add to calendar';
 var typeSeg = types.length>1 ? '<div class="sec" style="margin:12px 18px 7px">Type</div><div class="seg" id="ca-type">'+types.map(function(t,i){return '<span'+(i===0?' class="on"':'')+' data-t="'+t+'">'+CTYPES2[t].label+'</span>';}).join('')+'</div>' : '';
 /* Was a fixed list of Jul 20-31. Now three weeks forward from today, with
    the real date as the option value. */
 var dayOpts='', endOpts='<option value="">Never</option>';
 for(var k=0;k<21;k++){
   var iso=atOffset(k,null), lbl=esc(fmtDate(iso));
   dayOpts+='<option value="'+esc(iso)+'"'+(k===0?' selected':'')+'>'+lbl+'</option>';
   endOpts+='<option value="'+esc(iso)+'">'+lbl+'</option>';
 }
 var repeatRow='<div class="fld"><span class="fl">Repeat</span><select class="inv-sel" id="ca-repeat"><option value="None" selected>Does not repeat</option><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Every 2 weeks">Every 2 weeks</option><option value="Monthly">Monthly</option></select></div>'
   +'<div class="fld"><span class="fl">Repeat ends</span><select class="inv-sel" id="ca-repend">'+endOpts+'</select></div>';
 document.getElementById('ca-body').innerHTML=
   typeSeg
  +'<div class="sec" style="margin:12px 18px 7px">Details</div><div class="list">'
  +(isTimeoff? '<div class="fld"><span class="fl">Who</span><span class="fv">'+calSelf()+' (you)</span></div>' : '<div class="fld"><span class="fl">Title *</span><input class="inv-in" id="ca-name" placeholder="e.g. Spray fungicide" style="max-width:175px"></div>')
  +'<div class="fld"><span class="fl">Start</span><span style="display:flex;gap:6px;align-items:center;flex:none"><select class="inv-sel" id="ca-day" style="max-width:104px">'+dayOpts+'</select><input type="time" class="inv-in" id="ca-start" style="max-width:98px"></span></div>'
  +'<div class="fld"'+(isTimeoff?' style="border-bottom:none"':'')+'><span class="fl">End</span><span style="display:flex;gap:6px;align-items:center;flex:none"><select class="inv-sel" id="ca-endday" style="max-width:104px">'+dayOpts+'</select><input type="time" class="inv-in" id="ca-end" style="max-width:98px"></span></div>'
  +(isTimeoff? '' : repeatRow+'<div class="fld" style="border-bottom:none"><span class="fl">Lab</span><span class="fv" id="ca-lab-val"><span class="ev-dot" style="width:8px;height:8px;background:var(--acc);margin-right:6px;vertical-align:middle"></span>'+((types[0]==='event')?'Everyone · farm-wide':calUserLab())+'</span></div>')
  +'</div>'
  +'<div class="sec" style="margin:12px 18px 7px">Notes</div><div class="list"><div class="fld" style="border-bottom:none;align-items:flex-start"><textarea class="inv-in" id="ca-notes" rows="2" placeholder="Optional details…" style="max-width:none;width:100%;flex:1;resize:none"></textarea></div></div>'
  +(isTimeoff? '<div style="margin:12px 16px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:12px;padding:11px 13px;font-weight:600;font-size:11.5px;color:#2456b8">This notifies Bill and marks you out for that day.</div>' : '');
}
document.getElementById('ca-save').addEventListener('click',function(){
 var types=calAddTypes();
 var typeEl=document.querySelector('#ca-type span.on');
 var t=typeEl?typeEl.getAttribute('data-t'):types[0];
 /* The pickers now carry ISO dates, so nothing has to be re-derived from a
    day-of-month that only made sense inside one month. */
 var day=(document.getElementById('ca-day').value)||todayISO();
 var endDay=((document.getElementById('ca-endday')||{}).value)||day;
 if(ordOfISO(endDay)<ordOfISO(day))endDay=day;
 var start=fmtClock(((document.getElementById('ca-start')||{}).value||'').trim());
 var end=fmtClock(((document.getElementById('ca-end')||{}).value||'').trim());
 var multi=ordOfISO(endDay)>ordOfISO(day);
 var time=multi?(fmtDate(day)+(start?' '+start:'')+' → '+fmtDate(endDay)+(end?' '+end:''))
               :((start&&end)?start+'–'+end:(start||end||''));
 var endD=multi?endDay:null;
 var repeat=((document.getElementById('ca-repeat')||{}).value)||'None';
 var repend=((document.getElementById('ca-repend')||{}).value)||'';
 var repeatEnd=repend||null;
 var notes=(((document.getElementById('ca-notes')||{}).value)||'').trim();
 var lab=(t==='event')?'Bill':calUserLab();
 var ev;
 if(t==='timeoff'){
   ev={id:newId('ev'),date:day,endDate:endD,type:'crew',title:'Time off — '+calSelf(),sub:'Time off',time:(time||'All day'),start:start||null,end:end||null,person:SESSION.pid,status:'out',lab:lab,notes:notes,repeat:'None',repeatEnd:null};
   toast('Time off logged · Bill notified ✓');
 } else {
   var nm=(document.getElementById('ca-name')||{}).value; nm=(nm||'').trim();
   if(!nm){toast('Enter a title');return;}
   ev={id:newId('ev'),date:day,endDate:endD,type:t,title:nm,sub:(time||CTYPES2[t].label),time:time,start:start||null,end:end||null,person:(t==='crew'?SESSION.pid:null),lab:lab,repeat:repeat,repeatEndDate:repeatEnd,notes:notes};
   toast('Added to calendar ✓');
 }
 EVENTS.push(ev); calLab=null; calTypes.clear(); calDayOpen=null;
 var _d=parseISO(day)||new Date();
 calMonthAnchor=new Date(_d.getFullYear(),_d.getMonth(),1); calWeekAnchor=new Date(_d);
 show('calendar'); stack=stack.filter(function(x){return x!=='caladd';});
});
document.getElementById('s-caladd').addEventListener('click',function(e){
 var tt=e.target.closest('#ca-type span[data-t]'); if(tt){var lv=document.getElementById('ca-lab-val'); if(lv){var t=tt.getAttribute('data-t'); lv.innerHTML='<span class="ev-dot" style="width:8px;height:8px;background:var(--acc);margin-right:6px;vertical-align:middle"></span>'+((t==='event')?'Everyone · farm-wide':calUserLab());}}
});
document.getElementById('s-calendar').addEventListener('click',function(e){
 var v=e.target.closest('#cal-view span'); if(v){setCalView(v.getAttribute('data-v'));return;}
 var lb=e.target.closest('[data-lab]'); if(lb){var lv=lb.getAttribute('data-lab');calLab=(lv==='__all')?null:lv;renderCalBody();return;}
 var chip=e.target.closest('.chip[data-cf]'); if(chip){var ct=chip.getAttribute('data-cf');if(calTypes.has(ct))calTypes.delete(ct);else calTypes.add(ct);renderCalBody();return;}
 var mnav=e.target.closest('[data-mnav]'); if(mnav){calMonthAnchor=new Date(calMonthAnchor.getFullYear(),calMonthAnchor.getMonth()+parseInt(mnav.getAttribute('data-mnav'),10),1);renderCalMonth();return;}
 var wnav=e.target.closest('[data-wnav]'); if(wnav){var wn=7*parseInt(wnav.getAttribute('data-wnav'),10); if(calDayOpen){calDayOpen=addDays(calDayOpen,wn);calWeekAnchor=new Date(calDayOpen);} else {calWeekAnchor=addDays(calWeekAnchor,wn);} renderCalWeek();return;}
 var dnav=e.target.closest('[data-dnav]'); if(dnav){calDayOpen=addDays(calDayOpen||CAL_TODAY_DT,parseInt(dnav.getAttribute('data-dnav'),10));calWeekAnchor=new Date(calDayOpen);renderCalWeek();return;}
 var dc=e.target.closest('[data-date]'); if(dc){var pd=new Date(parseInt(dc.getAttribute('data-date'),10)); if(calDayOpen&&sameYMD(calDayOpen,pd)){calDayOpen=null;renderCalBody();}else{openCalDay(pd);} return;}
 var ev=e.target.closest('[data-ev]'); if(ev){openCalEvent(ev.getAttribute('data-ev'));return;}
});
document.getElementById('s-calevent').addEventListener('click',function(e){
 var ns=e.target.closest('[data-noshow]'); if(ns){var ev=EVENTS.find(function(x){return x.id===ns.getAttribute('data-noshow');});if(ev&&ev.person){NOSHOW[ev.person]=(NOSHOW[ev.person]||0)+1;toast('No-show recorded · '+(nameOf(ev.person)||ev.person));back();}return;}
 var dl=e.target.closest('[data-delev]'); if(dl){var id=dl.getAttribute('data-delev');calRemoveEvent(id);back();return;}
});

/* ======================= TIME CLOCK ======================= */
(function(){
  var TC_ANCHOR=new Date(2026,6,26);                 // Sun Jul 26 2026 — first pay period starts
  /* Everything in here is keyed by roster id. The local variables are still
     called `name` — they are the same lookup key they always were — but the
     value is 'p18', not 'Garrett Willard', so a punch stays attached to the
     person who made it even if their name on the roster changes. Names are
     produced with nameOf() at the point of drawing. */
  var TC_STUDENTS=(typeof rstUndergradIds==='function'?rstUndergradIds():[]);
  /* Whether somebody was due in, and between what times, on a given DATE.
     This used to be a hardcoded table of invented shifts for four named
     students, with everybody added later silently defaulted to Tue/Thu 8-12 --
     so the clock compared real punches against hours nobody had ever agreed
     to. It now asks the same schedShiftOn() the day board asks, which is the
     hours the person themselves entered on their profile, for the term the
     date actually falls in. No shift for a weekend, a day off, a term they
     have not filled in, or a date between terms. */
  function tcSchedOn(pid,d){
    if(typeof schedShiftOn!=='function') return null;
    try{ return schedShiftOn(pid,d); }catch(e){ return null; }
  }
  function tcSchedToday(pid){ return tcSchedOn(pid,new Date()); }
  var TC_PUNCHES={};   // pid -> [{date,in,out,locOk,note,editedBy}]
  var TC_NOSHOW={};    // pid -> [dateISO,...]  (auto-created misses)
  var TC_EXCUSED={};   // pid -> [dateISO,...]  (approved call-outs / absences)
  var TC_EXLATE={};    // name -> [dateISO,...]  (late arrivals Bill has forgiven)
  var tcIdx=0, tcPerson=null, tcTimer=null;
  /* tcPerson lives inside this closure, so the home-screen router needs a door
     in — a crew row on the home screen and a crew row on the Time Clock page
     both land on the same card this way. */
  window.tcOpenPerson=function(n){ var id=pidOf(n); if(!id)return; tcPerson=id; go('tcperson'); };

  /* ---- date + pay-period helpers ---- */
  function midnight(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  function daysBetween(a,b){return Math.round((midnight(b)-midnight(a))/86400000);}
  function periodIndexOf(d){return Math.floor(daysBetween(TC_ANCHOR,d)/14);}
  function periodStart(i){var d=new Date(TC_ANCHOR);d.setDate(d.getDate()+i*14);return d;}
  function periodEnd(i){var d=periodStart(i);d.setDate(d.getDate()+13);return d;}
  function curIdx(){return periodIndexOf(new Date());}
  function pad(n){return (n<10?'0':'')+n;}
  function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  /* These two shadow the app-wide parseISO()/todayISO() in
     app-02-fieldlog-sync.js on purpose: the time clock works in plain local
     dates with no time attached, while the shared ones carry a timestamp for
     the database. Kept inside this block so the two cannot be confused for one
     another. Deleting these to "reuse" the shared pair changes what a punch is
     dated. */
  function parseISO(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
  function todayISO(){return iso(new Date());}
  function hm(t){var p=t.split(':');return +p[0]+(+p[1])/60;}
  function nowHM(){var d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes());}
  function t12(t){if(!t)return '—';var p=t.split(':'),h=+p[0],m=p[1];return (h%12||12)+':'+m+(h<12?'a':'p');}
  function dur(pin,pout){if(!pin||!pout)return 0;return Math.max(0,hm(pout)-hm(pin));}
  function fh(n){return (Math.round(n*10)/10).toString();}
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var DOWF=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONF=['January','February','March','April','May','June','July','August','September','October','November','December'];
  function mdd(d){return MON[d.getMonth()]+' '+d.getDate();}
  function mddF(d){return MONF[d.getMonth()]+' '+d.getDate();}
  function dow(d){return DOW[d.getDay()];}
  function dowF(d){return DOWF[d.getDay()];}
  function rangeLabel(i){var s=periodStart(i),e=periodEnd(i);return mdd(s)+' – '+mdd(e)+(e.getFullYear()!==new Date().getFullYear()?', '+e.getFullYear():'');}

  /* ---- queries ---- */
  function punchesFor(name,di){return (TC_PUNCHES[name]||[]).filter(function(p){return p.date===di;});}
  function hoursForDate(name,di){return punchesFor(name,di).reduce(function(s,p){return s+dur(p.in,p.out);},0);}
  function inPeriod(di,i){var d=parseISO(di);return d>=midnight(periodStart(i))&&d<=midnight(periodEnd(i));}
  function hoursForPeriod(name,i){return (TC_PUNCHES[name]||[]).reduce(function(s,p){return s+(inPeriod(p.date,i)?dur(p.in,p.out):0);},0);}
  function weekHours(name,i,wk){var s=periodStart(i);s.setDate(s.getDate()+wk*7);var e=new Date(s);e.setDate(s.getDate()+6);return (TC_PUNCHES[name]||[]).reduce(function(t,p){var d=parseISO(p.date);return t+((d>=midnight(s)&&d<=midnight(e))?dur(p.in,p.out):0);},0);}
  function workedDays(name,i){var set={};(TC_PUNCHES[name]||[]).forEach(function(p){if(inPeriod(p.date,i)&&dur(p.in,p.out)>0)set[p.date]=1;});return Object.keys(set).length;}
  function openPunch(name){return (TC_PUNCHES[name]||[]).find(function(p){return p.date===todayISO()&&!p.out;});}
  // No-show tallies reset twice a year: at the start of summer (Jun 1, after spring)
  // and at the start of fall. Only no-shows on/after the most recent reset boundary
  // are counted. Fall resets when classes begin (~Aug 15), not Aug 1 — an Aug 1 reset
  // wiped the tally two weeks before the crew actually turned over.
  var SUMMER_RESET=[5,1];   // Jun 1  [monthIndex, day]
  var FALL_RESET=[7,15];    // Aug 15
  function resets(y){return {sum:new Date(y,SUMMER_RESET[0],SUMMER_RESET[1]),fall:new Date(y,FALL_RESET[0],FALL_RESET[1])};}
  function termStart(d){d=d||new Date();var b=resets(d.getFullYear());if(d>=b.fall)return b.fall;if(d>=b.sum)return b.sum;return resets(d.getFullYear()-1).fall;}
  function termLabel(d){d=d||new Date();var y=d.getFullYear(),b=resets(y);if(d>=b.fall)return 'Fall '+y;if(d>=b.sum)return 'Summer '+y;return 'Spring '+y;}
  function inTerm(di){return parseISO(di)>=midnight(termStart());}
  function isExcused(name,di){return (TC_EXCUSED[name]||[]).indexOf(di)>=0;}
  // Automatic no-shows: any scheduled day that has already passed with no clock-in
  // and no approved absence becomes a no-show. Runs before any count/render.
  function autoDetect(){
    if(TC_NOSHOW_LATE_PAUSED)return;
    var today=midnight(new Date());
    TC_STUDENTS.forEach(function(name){
      TC_NOSHOW[name]=TC_NOSHOW[name]||[];
      var s=periodStart(curIdx());
      for(var k=0;k<14;k++){var d=new Date(s);d.setDate(s.getDate()+k);
        if(d>=today)break;                                  // only days that have fully passed
        if(!tcSchedOn(name,d))continue;                     // not a scheduled shift
        var di=iso(d);
        if(punchesFor(name,di).length)continue;             // they clocked in -> present
        if(isExcused(name,di))continue;                     // approved call-out -> excused
        if(TC_NOSHOW[name].indexOf(di)<0)TC_NOSHOW[name].push(di);
      }
    });
  }
  function noShowDates(name){return (TC_NOSHOW[name]||[]).filter(inTerm).sort();}
  function noShowCount(name){return noShowDates(name).length;}
  function isNoShow(name,di){return (TC_NOSHOW[name]||[]).indexOf(di)>=0;}

  /* ---- late check-ins ----
     Lateness is derived, never stored: a day is late when the first clock-in
     lands more than the grace window past that day's scheduled start. Storing a
     flag instead would go stale the moment Bill corrects a punch on the time
     wheel — this way fixing the time fixes the record. The only stored piece is
     TC_EXLATE, the days Bill has forgiven. */
  var LATE_GRACE_MIN=30;
  function schedStart(name,d){var sh=tcSchedOn(name,d);return sh?sh.start:null;}
  function firstPunch(name,di){return punchesFor(name,di).reduce(function(a,p){return (!a||hm(p.in)<hm(a.in))?p:a;},null);}
  /* Minutes past the scheduled start, or 0 when on time / not a scheduled day. */
  function lateMin(name,di){
    var d=parseISO(di),st=schedStart(name,d);if(!st)return 0;
    var p=firstPunch(name,di);if(!p||!p.in)return 0;
    var mins=Math.round((hm(p.in)-hm(st))*60);
    return mins>LATE_GRACE_MIN?mins:0;
  }
  function isLateExcused(name,di){return (TC_EXLATE[name]||[]).indexOf(di)>=0;}
  function isLate(name,di){return lateMin(name,di)>0&&!isLateExcused(name,di);}
  function lateDates(name){var seen={},out=[];
    (TC_PUNCHES[name]||[]).forEach(function(p){if(seen[p.date])return;seen[p.date]=1;
      if(inTerm(p.date)&&isLate(name,p.date))out.push(p.date);});
    return out.sort();}
  function lateCount(name){return lateDates(name).length;}
  /* Every late day this term including the approved ones — Bill's per-worker
     page lists these so he can forgive one without paging back through periods. */
  function lateAllDates(name){var seen={},out=[];
    (TC_PUNCHES[name]||[]).forEach(function(p){if(seen[p.date])return;seen[p.date]=1;
      if(inTerm(p.date)&&lateMin(name,p.date))out.push(p.date);});
    return out.sort();}
  function lateLabel(m){return m>=60?(Math.floor(m/60)+' h '+pad(m%60)+' m late'):(m+' min late');}
  function hasUnverified(name,i){return (TC_PUNCHES[name]||[]).some(function(p){return inPeriod(p.date,i)&&p.locOk===false;});}

  /* ---- reporting ranges ----
     Bill and the PIs both need to look past the current two weeks — annual
     totals for payroll and grant reporting, shorter windows for a sanity check.
     Every total on the manager and faculty pages runs through one range key so
     the pay-period view and the rolling views can't drift apart.
     '1y' is a rolling 12 months; 'ytd' is the calendar year, Jan 1 to today. */
  var TC_RANGES=[{k:'period',l:'Pay period'},{k:'3m',l:'3 months'},{k:'6m',l:'6 months'},{k:'1y',l:'1 year'},{k:'ytd',l:'YTD'}];
  var tcRange='period';
  function rangeSpan(k,i){
    var today=midnight(new Date());
    if(k==='period')return [midnight(periodStart(i)),midnight(periodEnd(i))];
    if(k==='ytd')return [new Date(today.getFullYear(),0,1),today];
    var a=new Date(today);
    if(k==='3m')a.setMonth(a.getMonth()-3);
    else if(k==='6m')a.setMonth(a.getMonth()-6);
    else a.setFullYear(a.getFullYear()-1);
    return [a,today];
  }
  function rangeName(k){for(var j=0;j<TC_RANGES.length;j++)if(TC_RANGES[j].k===k)return TC_RANGES[j].l;return '';}
  function spanLabel(k,i){if(k==='period')return rangeLabel(i);
    var sp=rangeSpan(k,i),sy=sp[0].getFullYear(),ey=sp[1].getFullYear();
    return mdd(sp[0])+(sy!==ey?', '+sy:'')+' – '+mdd(sp[1])+', '+ey;}
  function inSpan(di,sp){var d=parseISO(di);return d>=sp[0]&&d<=sp[1];}
  function hoursIn(name,k,i){var sp=rangeSpan(k,i);
    return (TC_PUNCHES[name]||[]).reduce(function(t,p){return t+(inSpan(p.date,sp)?dur(p.in,p.out):0);},0);}
  function daysIn(name,k,i){var sp=rangeSpan(k,i),set={};
    (TC_PUNCHES[name]||[]).forEach(function(p){if(inSpan(p.date,sp)&&dur(p.in,p.out)>0)set[p.date]=1;});
    return Object.keys(set).length;}
  /* Farm-wide undergrad hours — the number Bill reports up the chain. */
  function crewHours(k,i){var t=0;TC_STUDENTS.forEach(function(n){t+=hoursIn(n,k,i);});return t;}
  function crewActive(k,i){var c=0;TC_STUDENTS.forEach(function(n){if(hoursIn(n,k,i)>0)c++;});return c;}

  /* ---- seed / persist ---- */
  function seed(){
    /* Used to fabricate two weeks of punches, a full backdated year (seedYear),
       and demo no-shows/lates (seedNoShows/seedLates) for Garrett, Taryn, Jed and
       Caroline's real accounts. Removed 2026-08-25 -- nothing but equipment, the
       roster and the task catalog is supposed to ship pre-loaded. Time Clock now
       starts genuinely empty; real punches build the real history from here. */
    TC_PUNCHES={};TC_NOSHOW={};TC_EXCUSED={};TC_EXLATE={};
    TC_STUDENTS.forEach(function(n){TC_PUNCHES[n]=[];TC_NOSHOW[n]=[];TC_EXCUSED[n]=[];TC_EXLATE[n]=[];});
  }
  /* Removed 2026-08-26 along with the last of the seed: seedYear(),
     seedNoShows(), seedLates(), pushLate() and their target tables
     (LATE_TOTAL, NOSHOW_TOTAL, LATE_OFFSETS, TC_BREAKS) fabricated a backdated
     year of punches plus demo no-shows and late arrivals against four real
     people's accounts. seed() stopped calling them on 2026-08-25 but they were
     left in the file, which is how fabricated hours find their way back into a
     payroll screen. The real punches are the only history now. */
  // Key is versioned: bump it whenever the seed changes, or cached demo data from a
  // previous build masks the new seed and the leaderboard comes up empty.
  /* v5 re-keys every punch, no-show and excusal from the person's name to
     their roster id. Old v4 data is not migrated — the punches in it are
     prototype, and a half-converted clock is worse than a clean one. */
  var TC_KEY='ut_timeclock_v6';   /* bumped 2026-08-25: v5 and earlier could hold the fabricated year of demo punches/no-shows/lates seed() used to generate -- this forces every browser to drop that cache and start clean */
  /* Dillon asked (2026-08-25) to pause no-show and late check-in tracking --
     remove it from the app for right now, not delete it for good. Clocking in
     and out still works normally; this only turns off the automatic "you were
     scheduled and didn't show" / "you clocked in late" detection and the two
     leaderboards built from it. Flip this back to false to resume. */
  var TC_NOSHOW_LATE_PAUSED=true;
  function save(){try{localStorage.setItem(TC_KEY,JSON.stringify({idx:curIdx(),punches:TC_PUNCHES,noshow:TC_NOSHOW,excused:TC_EXCUSED,exlate:TC_EXLATE}));}catch(e){}}
  /* THE BUG THIS FIXES, so nobody reintroduces it:
     load() used to refuse the saved data unless `r.idx===curIdx()` -- unless
     the pay period the data was WRITTEN in was still the pay period we are in
     NOW. Pay periods roll every 14 days, so on the first day of every new
     period load() returned false, the caller ran seed(), and seed() emptied
     every punch and immediately saved the empty version over the top. Two
     weeks of hours, gone, silently, on a fortnightly clock.

     The stored `idx` is a note of when the file was written. It is not a
     reason to throw the file away. Punches carry their own dates and every
     total is worked out from those, so data from any period loads fine. */
  function load(){
    try{
      var r=JSON.parse(localStorage.getItem(TC_KEY)||'null');
      if(r&&r.punches&&typeof r.punches==='object'){
        TC_PUNCHES=r.punches; TC_NOSHOW=r.noshow||{}; TC_EXCUSED=r.excused||{}; TC_EXLATE=r.exlate||{};
        /* Anyone hired since the last save needs their empty lists, or the
           first write against them throws. */
        TC_STUDENTS.forEach(function(n){
          TC_PUNCHES[n]=TC_PUNCHES[n]||[]; TC_NOSHOW[n]=TC_NOSHOW[n]||[];
          TC_EXCUSED[n]=TC_EXCUSED[n]||[]; TC_EXLATE[n]=TC_EXLATE[n]||[];
        });
        tcStampIds();
        return true;
      }
    }catch(e){}
    return false;
  }
  /* Every punch needs an id of its own before it can be a row in a shared
     database -- without one there is nothing to update, and the same shift
     would land twice. Stamped on load so punches written by earlier builds
     get one too. */
  function tcStampIds(){
    var seen={},dirty=false;
    Object.keys(TC_PUNCHES).forEach(function(n){
      (TC_PUNCHES[n]||[]).forEach(function(p){
        if(!p) return;
        if(!p.pid){ p.pid=n; dirty=true; }
        if(!p.id||seen[p.id]){ p.id=newId('pu'); dirty=true; }
        seen[p.id]=1;
      });
    });
    return dirty;
  }
  if(!load()){seed();save();}
  tcIdx=curIdx();

  /* ---- shared UI ---- */
  function navBar(i){
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin:12px 14px 4px;background:var(--card);border-radius:12px;padding:6px 10px;box-shadow:0 4px 14px rgba(0,0,0,.06)">'
      +'<div class="tap" data-tcnav="prev" style="font:800 22px \'Archivo\';color:var(--acc);width:36px;height:36px;display:flex;align-items:center;justify-content:center">‹</div>'
      +'<div style="text-align:center"><div style="font:800 14px \'Archivo\';color:var(--ink)">'+rangeLabel(i)+'</div><div style="font:700 9.5px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Pay period '+(i+1)+(i===curIdx()?' · current':'')+'</div></div>'
      +'<div class="tap" data-tcnav="next" style="font:800 22px \'Archivo\';color:var(--acc);width:36px;height:36px;display:flex;align-items:center;justify-content:center">›</div>'
      +'</div>';
  }
  /* Range filter chips. The ‹ › pay-period arrows only make sense on the
     pay-period view, so the header swaps to a plain date span otherwise. */
  function rangeChips(){
    var h='<div style="display:flex;gap:6px;overflow-x:auto;padding:11px 14px 1px;-webkit-overflow-scrolling:touch">';
    TC_RANGES.forEach(function(r){var on=r.k===tcRange;
      h+='<div class="tap" data-tcrange="'+r.k+'" style="flex:none;padding:7px 14px;border-radius:999px;font:800 12px \'Public Sans\';white-space:nowrap;'
        +(on?'background:var(--acc);color:#fff;border:1.5px solid var(--acc)':'background:var(--card);color:var(--muted);border:1.5px solid var(--line)')+'">'+r.l+'</div>';});
    return h+'</div>';
  }
  function rangeHeader(k,i){
    return '<div style="margin:12px 14px 4px;background:var(--card);border-radius:12px;padding:7px 12px;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.06)">'
      +'<div style="font:800 14px \'Archivo\';color:var(--ink)">'+rangeName(k)+(k==='ytd'?' · '+new Date().getFullYear():'')+'</div>'
      +'<div style="font:700 9.5px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px">'+spanLabel(k,i)+'</div></div>';
  }
  function rangeTop(i){return rangeChips()+(tcRange==='period'?navBar(i):rangeHeader(tcRange,i));}
  /* The calendar-year figure stays pinned no matter which filter is selected —
     it is the one number that gets reported off the farm. */
  function ytdBanner(){
    var y=new Date().getFullYear(),tot=crewHours('ytd',tcIdx),act=crewActive('ytd',tcIdx);
    return '<div style="margin:10px 14px 0;background:#fff1e0;border:1.5px solid #ffcf9e;border-radius:14px;padding:11px 14px">'
      +'<div style="font:800 9.5px \'Public Sans\';color:#9a5b00;text-transform:uppercase;letter-spacing:.8px">Undergrad hours · calendar year '+y+'</div>'
      +'<div style="display:flex;align-items:baseline;gap:9px;margin-top:3px">'
        +'<span style="font:800 27px \'Archivo\';color:var(--acc)">'+fh(tot)+'</span>'
        +'<span style="font:700 11.5px \'Public Sans\';color:var(--muted)">hours · '+act+' student'+(act===1?'':'s')+' · Jan 1 – '+mdd(new Date())+'</span></div></div>';
  }
  function workerTabs(){return '<div class="tab"><span class="te">🏠</span>Home</div><div class="tab"><span class="te">📋</span>Tasks</div><div class="tab"><span class="te">🗺️</span>Map</div><div class="tab on"><span class="te">⏱️</span>Clock</div><div class="tab"><span class="te">•••</span>More</div>';}
  function managerTabs(){return '<div class="tab"><span class="te">🏠</span>Home</div><div class="tab"><span class="te">📋</span>Tasks</div><div class="tab"><span class="te">🗺️</span>Map</div><div class="tab"><span class="te">📦</span>Inventory</div><div class="tab"><span class="te">•••</span>More</div>';}
  var TAB_EMOJI={Home:'🏠',Tasks:'📋',Map:'🗺️',Inventory:'📦',Clock:'⏱️',More:'•••',Trials:'🔬',Equip:'🚜',Field:'✏️',Spray:'🧪',Calendar:'📅',Weather:'🌤️'};
  // navMap now holds every page a role can reach, so preview off the chosen tabs (the 3 chosen) instead.
  function roleTabs(role){var nm=navMap[role]||{};var labels=['Home'].concat(navChosen(role).filter(function(l){return nm[l];})).concat(['More']);return labels.map(function(l){return '<div class="tab"><span class="te">'+(TAB_EMOJI[l]||'•')+'</span>'+l+'</div>';}).join('');}
  /* Read-only viewer (faculty only). A PI signs off on the payroll for the
     students their grants carry, so they get the same period-by-period hours
     Bill sees — the arrows walk back through closed periods — but no clock
     button, no punch editing and no drill-down into someone's day. */
  function renderViewer(body){
    autoDetect();
    var i=tcIdx,k=tcRange,totAll=crewHours(k,i),onNow=0,noShows=0;
    TC_STUDENTS.forEach(function(n){if(openPunch(n))onNow++;noShows+=noShowCount(n);});
    var html=rangeTop(i);
    html+='<div style="margin:10px 14px 2px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:12px;padding:10px 13px;font:700 11.5px \'Public Sans\';color:#2f5fa0">Faculty view · read-only. Punch edits and absence approvals are Bill\'s.</div>';
    html+=ytdBanner();
    html+='<div class="kpis"><div class="kpi"><div class="n">'+fh(totAll)+'</div><div class="l">'+(k==='period'?'Total hrs':rangeName(k)+' hrs')+'</div></div>'
      +'<div class="kpi"><div class="n">'+TC_STUDENTS.length+'</div><div class="l">Undergrads</div></div>'
      +'<div class="kpi"><div class="n">'+onNow+'</div><div class="l">On clock now</div></div></div>';
    html+='<div style="font:800 11px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin:14px 16px 6px">Hours · '+(k==='period'?'this pay period':spanLabel(k,i))+'</div><div class="list" style="margin-bottom:16px">';
    var roster=TC_STUDENTS.slice().sort(function(a,b){ return hoursIn(b,k,i)-hoursIn(a,k,i); });
    roster.forEach(function(n){
      var h=hoursIn(n,k,i),on=!!openPunch(n),ns=noShowCount(n);
      var sub=k==='period'?('Wk 1 '+fh(weekHours(n,i,0))+' h · Wk 2 '+fh(weekHours(n,i,1))+' h')
                          :(daysIn(n,k,i)+' days worked · '+fh(hoursIn(n,'ytd',i))+' h YTD');
      var tag='';
      if(on) tag+='<span class="pill" style="background:#eafaef;color:#2f7d3a;margin-left:7px">On clock</span>';
      if(ns) tag+='<span class="pill" style="background:#fdeceb;color:#c0392b;margin-left:7px">'+ns+' no-show'+(ns===1?'':'s')+'</span>';
      html+='<div class="row"><div style="flex:1;min-width:0"><div class="rt">'+esc(nameOf(n))+tag+'</div><div class="rs">'+sub+'</div></div>'
        +'<span style="font:800 15px \'Archivo\';color:var(--ink);flex:none">'+fh(h)+' h</span></div>';
    });
    if(!roster.length) html+='<div class="row"><div class="rs">No hourly crew on the roster.</div></div>';
    html+='</div>';
    html+=noShowListHTML(false)+lateListHTML(false);
    body.innerHTML=html;
  }

  /* ---- worker view ---- */
  function renderWorker(body){
    /* was USERS.undergrad.n — the clock punched the demo undergrad in no
       matter who was holding the phone. */
    var me=SESSION.pid,i=tcIdx,op=openPunch(me),clockedIn=!!op;
    var wk=daysBetween(periodStart(i),new Date())>=7?1:0;
    var html=navBar(i);
    html+='<div style="margin:10px 14px;background:'+(clockedIn?'linear-gradient(135deg,#2f9e4f,#39b95e)':'var(--card)')+';border-radius:18px;padding:20px 16px;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,.10)">';
    if(clockedIn){
      html+='<div style="font:700 11px \'Public Sans\';color:#eafff0;text-transform:uppercase;letter-spacing:1.2px">On the clock</div>'
        +'<div id="tc-elapsed" style="font:800 36px \'Archivo\';color:#fff;margin:6px 0 2px">0:00:00</div>'
        +'<div style="font:700 12px \'Public Sans\';color:#eafff0">since '+t12(op.in)+'</div>'
        +'<div class="tap" data-tcclock="out" style="margin-top:16px;background:#fff;color:#1a7a37;border-radius:14px;padding:15px;font:800 16px \'Public Sans\'">Clock Out</div>';
    }else{
      html+='<div style="font:700 11px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:1.2px">Not clocked in</div>'
        +'<div style="font:800 32px \'Archivo\';color:var(--ink);margin:8px 0 2px">'+fh(hoursForDate(me,todayISO()))+' h</div>'
        +'<div style="font:700 12px \'Public Sans\';color:var(--muted)">logged today</div>'
        +'<div class="tap" data-tcclock="in" style="margin-top:16px;background:var(--acc);color:#fff;border-radius:14px;padding:15px;font:800 16px \'Public Sans\'">Clock In</div>';
    }
    html+='</div>';
    html+='<div class="kpis"><div class="kpi"><div class="n">'+fh(hoursForPeriod(me,i))+'</div><div class="l">Period hrs</div></div><div class="kpi"><div class="n">'+fh(weekHours(me,i,wk))+'</div><div class="l">This week</div></div><div class="kpi"><div class="n">'+workedDays(me,i)+'</div><div class="l">Days worked</div></div></div>';
    html+='<div style="font:800 11px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin:14px 16px 6px">Your days this period</div>';
    var rows='',s=periodStart(i);
    for(var k=0;k<14;k++){var d=new Date(s);d.setDate(s.getDate()+k);var di=iso(d),ps=punchesFor(me,di);if(!ps.length)continue;
      var times=ps.map(function(p){return t12(p.in)+'–'+t12(p.out);}).join(', ');
      rows+='<div class="row"><div style="flex:1"><div class="rt">'+dow(d)+' '+mdd(d)+(di===todayISO()?' · today':'')+'</div><div class="rs">'+times+'</div></div><span style="font:800 14px \'Archivo\';color:var(--ink)">'+fh(hoursForDate(me,di))+' h</span></div>';}
    html+='<div class="list" style="margin-bottom:16px">'+(rows||'<div class="row"><div class="rs" style="color:var(--muted)">No hours logged this period yet.</div></div>')+'</div>';
    html+=noShowListHTML(false)+lateListHTML(false);   // undergrads see both boards read-only
    body.innerHTML=html;startTimer(me);
  }
  // Shared no-show count list. interactive=true lets Bill tap through to a worker's days.
  function noShowListHTML(interactive){
    if(TC_NOSHOW_LATE_PAUSED)return '';
    var h='<div style="display:flex;align-items:baseline;justify-content:space-between;margin:2px 16px 6px"><span style="font:800 11px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.6px">No-shows · '+termLabel()+'</span><span style="font:700 9.5px \'Public Sans\';color:var(--muted)">auto · resets each summer &amp; fall</span></div><div class="list" style="margin-bottom:16px">';
    var any=false;
    // ranked worst-first — it reads as a leaderboard, and Bill scans the top of it
    var ranked=TC_STUDENTS.slice().sort(function(a,b){return noShowCount(b)-noShowCount(a)||a.localeCompare(b);});
    ranked.forEach(function(n){var c=noShowCount(n);if(!c)return;any=true;
      var pill='<span class="pill" style="background:#fdeceb;color:#c0392b;font:800 12px \'Archivo\';padding:5px 12px">'+c+'</span>';
      if(interactive)h+='<div class="row tap" data-tcperson="'+esc(n)+'"><div style="flex:1"><div class="rt">'+esc(nameOf(n))+'</div></div>'+pill+'<span style="color:#c2c7cd;font-size:18px;margin-left:8px">›</span></div>';
      else h+='<div class="row"><div style="flex:1"><div class="rt">'+esc(nameOf(n))+'</div></div>'+pill+'</div>';
    });
    if(!any)h+='<div class="row"><div class="rs" style="color:var(--muted)">No no-shows this term.</div></div>';
    return h+'</div>';
  }
  /* Late check-in leaderboard. Same shape and same term window as the no-show
     board, and posted to every role — the crew see where they stand, not just
     Bill. interactive=true lets Bill tap through to approve one. */
  function lateListHTML(interactive){
    if(TC_NOSHOW_LATE_PAUSED)return '';
    var h='<div style="display:flex;align-items:baseline;justify-content:space-between;margin:2px 16px 6px"><span style="font:800 11px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.6px">Late check-ins · '+termLabel()+'</span><span style="font:700 9.5px \'Public Sans\';color:var(--muted)">more than '+LATE_GRACE_MIN+' min past start</span></div><div class="list" style="margin-bottom:16px">';
    var any=false;
    var ranked=TC_STUDENTS.slice().sort(function(a,b){return lateCount(b)-lateCount(a)||a.localeCompare(b);});
    ranked.forEach(function(n){var c=lateCount(n);if(!c)return;any=true;
      var dates=lateDates(n),last=parseISO(dates[dates.length-1]);
      var sub='<div class="rs">latest '+dow(last)+' '+mdd(last)+' · '+lateLabel(lateMin(n,dates[dates.length-1]))+'</div>';
      var pill='<span class="pill" style="background:#fff5ec;color:#b26a00;font:800 12px \'Archivo\';padding:5px 12px">'+c+'</span>';
      if(interactive)h+='<div class="row tap" data-tcperson="'+esc(n)+'"><div style="flex:1;min-width:0"><div class="rt">'+esc(nameOf(n))+'</div>'+sub+'</div>'+pill+'<span style="color:#c2c7cd;font-size:18px;margin-left:8px">›</span></div>';
      else h+='<div class="row"><div style="flex:1;min-width:0"><div class="rt">'+esc(nameOf(n))+'</div>'+sub+'</div>'+pill+'</div>';
    });
    if(!any)h+='<div class="row"><div class="rs" style="color:var(--muted)">Nobody has checked in late this term.</div></div>';
    return h+'</div>';
  }
  /* ---- geofence: notify Bill only when a punch is outside the farm ---- */
  var FARM_LAT=35.90203, FARM_LON=-83.95762, FARM_RADIUS_MI=0.5;
  function haversineMi(la1,lo1,la2,lo2){var R=3958.8,r=Math.PI/180,dLa=(la2-la1)*r,dLo=(lo2-lo1)*r,a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)*Math.sin(dLo/2);return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  function geoCheck(cb){if(!navigator.geolocation){cb('unknown',null);return;}navigator.geolocation.getCurrentPosition(function(p){cb(haversineMi(p.coords.latitude,p.coords.longitude,FARM_LAT,FARM_LON)<=FARM_RADIUS_MI?'inside':'outside',haversineMi(p.coords.latitude,p.coords.longitude,FARM_LAT,FARM_LON));},function(){cb('unknown',null);},{enableHighAccuracy:true,timeout:8000,maximumAge:60000});}
  function notifyBillOffsite(name,punch,mi){if(typeof NOTIFS==='undefined')return;NOTIFS.unshift({t:name+' clocked in off-site',s:t12(punch.in)+' · outside the farm geofence'+(mi?' ('+(Math.round(mi*10)/10)+' mi away)':''),time:t12(punch.in),h:0,c:'#c0392b'});}
  function startTimer(name){
    if(tcTimer){clearInterval(tcTimer);tcTimer=null;}
    var op=openPunch(name);if(!op)return;
    function upd(){var el=document.getElementById('tc-elapsed');if(!el){clearInterval(tcTimer);tcTimer=null;return;}
      var st=parseISO(op.date),p=op.in.split(':');st.setHours(+p[0],+p[1],0,0);
      var s=Math.max(0,Math.floor((Date.now()-st)/1000));
      el.textContent=Math.floor(s/3600)+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60);}
    upd();tcTimer=setInterval(upd,1000);
  }
  function clockIn(name){var punch={id:newId('pu'),pid:name,date:todayISO(),in:nowHM(),out:null,locOk:true,note:'',editedBy:''};TC_PUNCHES[name]=TC_PUNCHES[name]||[];TC_PUNCHES[name].push(punch);save();toast('Clocked in · '+t12(punch.in));tcEnter();
    geoCheck(function(res,mi){if(res==='outside'){punch.locOk=false;notifyBillOffsite(name,punch,mi);save();if(currentRole!=='undergrad')tcEnter();}});}
  function clockOut(name){var op=openPunch(name);if(!op)return;op.out=nowHM();save();toast('Clocked out · '+fh(dur(op.in,op.out))+' h');tcEnter();}

  /* ---- manager view ---- */
  function renderManager(body){
    autoDetect();
    var i=tcIdx,k=tcRange,totAll=crewHours(k,i),clockedNow=0,noShows=0;
    TC_STUDENTS.forEach(function(n){if(openPunch(n))clockedNow++;noShows+=noShowCount(n);});
    var html=rangeTop(i)+ytdBanner();
    html+='<div class="kpis"><div class="kpi"><div class="n">'+fh(totAll)+'</div><div class="l">'+(k==='period'?'Total hrs':rangeName(k)+' hrs')+'</div></div><div class="kpi"><div class="n">'+clockedNow+'</div><div class="l">On clock now</div></div>'+(TC_NOSHOW_LATE_PAUSED?'':'<div class="kpi"><div class="n">'+noShows+'</div><div class="l">No-shows</div></div>')+'</div>';
    html+='<div style="font:800 11px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin:14px 16px 6px">Crew · tap to view &amp; edit</div><div class="list" style="margin-bottom:16px">';
    TC_STUDENTS.forEach(function(n){
      var h=hoursIn(n,k,i),on=!!openPunch(n),unv=hasUnverified(n,i),b='';
      if(on)b+='<span class="pill" style="background:#eafaef;color:#2f7d3a">On clock</span> ';
      if(unv)b+='<span class="pill" style="background:#fff5ec;color:#b26a00">📍 Off-site</span> ';
      var sub=b||(k==='period'?('Wk 1 '+fh(weekHours(n,i,0))+'h · Wk 2 '+fh(weekHours(n,i,1))+'h')
                              :(daysIn(n,k,i)+' days · '+fh(hoursIn(n,'ytd',i))+' h YTD'));
      html+='<div class="row tap" data-tcperson="'+esc(n)+'"><div style="flex:1"><div class="rt">'+esc(nameOf(n))+'</div><div class="rs">'+sub+'</div></div><span style="font:800 15px \'Archivo\';color:var(--ink)">'+fh(h)+' h</span><span style="color:#c2c7cd;font-size:18px;margin-left:8px">›</span></div>';
    });
    html+='</div>';
    html+=noShowListHTML(true)+lateListHTML(true);   // Bill: tappable through to each worker's days
    body.innerHTML=html;
  }

  /* ---- Bill's per-worker day detail ---- */
  function tChip(label,val,key){
    return '<div class="tap" data-tcfield="'+key+'" style="flex:1;background:#f5f6f8;border:1.5px solid var(--line);border-radius:13px;padding:9px 12px">'
      +'<div style="font:800 9.5px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:1px">'+label+'</div>'
      +'<div style="font:800 20px \'Archivo\';color:'+(val?'var(--ink)':'var(--acc)')+'">'+(val?t12(val):'Set time ›')+'</div></div>';
  }
  function dayCard(name,di,d,ps,scheduled,future,today){
    var h=hoursForDate(name,di),noshow=isNoShow(name,di),isToday=di===todayISO();
    var head='<div style="display:flex;justify-content:space-between;align-items:baseline"><div style="font:800 17px \'Archivo\';color:var(--ink)">'+dowF(d)+'</div><div style="font:800 16px \'Archivo\';color:'+(h>0?'var(--ink)':'var(--muted)')+'">'+(h>0?fh(h)+' hrs':(noshow?'':'—'))+'</div></div>'
      +'<div style="font:700 11.5px \'Public Sans\';color:var(--muted);margin:1px 0 8px">'+mddF(d)+', '+d.getFullYear()+(isToday?' · Today':'')+'</div>';
    var inner='';
    ps.forEach(function(p,idx){
      var key=name+'|'+di+'|'+idx;
      inner+=(idx>0?'<div style="height:1px;background:var(--line);margin:10px 0"></div>':'');
      inner+='<div style="display:flex;align-items:stretch;gap:9px">'+tChip('Clock in',p.in,key+'|in')+'<div style="display:flex;align-items:center;color:var(--muted);font-size:18px">→</div>'+tChip('Clock out',p.out,key+'|out')+'</div>';
      var loc=p.locOk===false?'<span class="tap" data-tcverify="'+key+'" style="font:800 11px \'Public Sans\';color:#b26a00;background:#fff5ec;border:1px solid #ffd9ac;border-radius:9px;padding:4px 9px">📍 Off-site · tap to clear</span>':'';
      var edited=p.editedBy?'<span style="font:700 10.5px \'Public Sans\';color:var(--muted)">✎ edited by '+p.editedBy+'</span>':'';
      inner+='<div style="display:flex;align-items:center;gap:8px;margin-top:8px">'+loc+edited+'<span style="flex:1"></span>'
        +'<span style="font:800 14px \'Archivo\';color:var(--ink)">'+fh(dur(p.in,p.out))+' hrs</span>'
        +'<span class="tap" data-tcdel="'+key+'" style="font-size:17px;margin-left:12px">🗑️</span></div>';
      if(p.note)inner+='<div style="font:600 11.5px \'Public Sans\';color:var(--muted);margin-top:4px">✎ '+esc(p.note)+'</div>';
    });
    if(!ps.length){
      if(noshow)inner+='<div style="display:flex;align-items:center;gap:9px"><span class="pill" style="background:#fdeceb;color:#c0392b;font-size:11px;padding:5px 11px">NO-SHOW</span><span style="font:600 12.5px \'Public Sans\';color:var(--muted)">no call-out approved</span><span style="flex:1"></span><span class="tap" data-tcclear="'+name+'|'+di+'" style="font:800 12.5px \'Public Sans\';color:var(--acc)">Approve absence</span></div>';
      else if(isExcused(name,di))inner+='<div style="display:flex;align-items:center;gap:9px"><span class="pill" style="background:#eafaef;color:#2f7d3a;font-size:11px;padding:5px 11px">EXCUSED</span><span style="font:600 12.5px \'Public Sans\';color:var(--muted)">approved absence</span><span style="flex:1"></span><span class="tap" data-tcunexcuse="'+name+'|'+di+'" style="font:800 12.5px \'Public Sans\';color:#c0392b">Undo</span></div>';
      else inner+='<div style="font:600 13px \'Public Sans\';color:var(--muted)">No clock-in'+(scheduled?' · scheduled shift':'')+'</div>';
    }
    /* Late banner sits under the punches, since it is about the day rather than
       any one punch. Approving forgives the day without touching the clock-in —
       the hours stay honest, only the tally changes. */
    var lm=lateMin(name,di);
    if(lm){
      var sst=schedStart(name,d),ex=isLateExcused(name,di);
      inner+='<div style="display:flex;align-items:center;gap:9px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">'
        +(ex?'<span class="pill" style="background:#eafaef;color:#2f7d3a;font-size:11px;padding:5px 11px">LATE · APPROVED</span>'
            :'<span class="pill" style="background:#fff5ec;color:#b26a00;font-size:11px;padding:5px 11px">LATE</span>')
        +'<span style="font:600 12px \'Public Sans\';color:var(--muted);flex:1;min-width:0">'+lateLabel(lm)+' · scheduled '+t12(sst)+'</span>'
        +(ex?'<span class="tap" data-tcunlate="'+name+'|'+di+'" style="font:800 12.5px \'Public Sans\';color:#c0392b;flex:none">Undo</span>'
            :'<span class="tap" data-tcexlate="'+name+'|'+di+'" style="font:800 12.5px \'Public Sans\';color:var(--acc);flex:none">Approve late</span>')
        +'</div>';
    }
    if(!future)inner+='<div class="tap" data-tcadd="'+name+'|'+di+'" style="margin-top:12px;text-align:center;background:var(--accent-soft,#fff1e0);border:1px dashed #ffcf9e;border-radius:12px;padding:11px;font:800 13.5px \'Public Sans\';color:var(--acc)">＋ Add a punch</div>';
    return '<div style="background:var(--card);border-radius:16px;padding:14px 16px;margin-bottom:12px;box-shadow:0 3px 12px rgba(0,0,0,.07)">'+head+inner+'</div>';
  }
  window.tcRenderPerson=function(){
    var name=tcPerson;if(!name)return;autoDetect();document.getElementById('tcp-title').textContent=nameOf(name);
    var i=tcIdx,body=document.getElementById('tcp-body'),s=periodStart(i),today=midnight(new Date());
    var html=navBar(i);
    html+='<div class="kpis"><div class="kpi"><div class="n">'+fh(hoursForPeriod(name,i))+'</div><div class="l">Period hrs</div></div><div class="kpi"><div class="n">'+fh(weekHours(name,i,0))+' / '+fh(weekHours(name,i,1))+'</div><div class="l">Wk1 / Wk2</div></div><div class="kpi"><div class="n">'+noShowCount(name)+'</div><div class="l">No-shows</div></div><div class="kpi"><div class="n">'+lateCount(name)+'</div><div class="l">Late</div></div></div>';
    /* Per-student annual total — the payroll question Bill gets asked most. */
    html+='<div style="margin:6px 14px 0;background:#fff1e0;border:1.5px solid #ffcf9e;border-radius:13px;padding:10px 13px;display:flex;align-items:baseline;gap:8px">'
      +'<span style="font:800 9.5px \'Public Sans\';color:#9a5b00;text-transform:uppercase;letter-spacing:.8px;flex:1">'+new Date().getFullYear()+' year to date</span>'
      +'<span style="font:800 20px \'Archivo\';color:var(--acc)">'+fh(hoursIn(name,'ytd',i))+' h</span>'
      +'<span style="font:700 11px \'Public Sans\';color:var(--muted)">'+daysIn(name,'ytd',i)+' days</span></div>';
    /* Term-wide late list, so approving an older one doesn't mean paging back
       through pay periods to find the day. */
    var lateAll=lateAllDates(name);
    if(lateAll.length){
      html+='<div style="display:flex;align-items:baseline;justify-content:space-between;margin:16px 16px 6px"><span style="font:800 13px \'Public Sans\';color:var(--ink)">Late check-ins · '+termLabel()+'</span><span style="font:700 10px \'Public Sans\';color:var(--muted)">'+lateCount(name)+' on record</span></div><div class="list" style="margin-bottom:4px">';
      lateAll.slice().reverse().forEach(function(di){
        var dd=parseISO(di),m=lateMin(name,di),ex=isLateExcused(name,di),fp=firstPunch(name,di);
        html+='<div class="row"><div style="flex:1;min-width:0"><div class="rt">'+dow(dd)+' '+mdd(dd)
          +(ex?' <span class="pill" style="background:#eafaef;color:#2f7d3a;margin-left:5px">Approved</span>':'')+'</div>'
          +'<div class="rs">in '+t12(fp.in)+' · scheduled '+t12(schedStart(name,dd))+' · '+lateLabel(m)+'</div></div>'
          +(ex?'<span class="tap" data-tcunlate="'+name+'|'+di+'" style="font:800 12.5px \'Public Sans\';color:#c0392b;flex:none">Undo</span>'
              :'<span class="tap" data-tcexlate="'+name+'|'+di+'" style="font:800 12.5px \'Public Sans\';color:var(--acc);flex:none">Approve</span>')
          +'</div>';
      });
      html+='</div>';
    }
    html+='<div style="font:800 13px \'Public Sans\';color:var(--ink);margin:16px 16px 4px">Daily punches</div><div style="font:600 11.5px \'Public Sans\';color:var(--muted);margin:0 16px 8px">Tap a time to change it with the time wheel.</div><div style="margin:0 12px 16px">';
    for(var k=0;k<14;k++){var d=new Date(s);d.setDate(s.getDate()+k);var di=iso(d),ps=punchesFor(name,di),scheduled=!!tcSchedOn(name,d),future=d>today;
      if(!ps.length&&!scheduled&&!isNoShow(name,di))continue;
      if(future&&!ps.length)continue;
      html+=dayCard(name,di,d,ps,scheduled,future,today);}
    html+='</div>';body.innerHTML=html;
  };

  /* ---- edit actions (Bill) ---- */
  function normHM(v){if(v==null)return null;v=(''+v).trim().toLowerCase();if(!v)return null;var ap=null;if(/[ap]m?$/.test(v)){ap=v.slice(-1)==='m'?v.slice(-2,-1):v.slice(-1);v=v.replace(/\s*[ap]m?$/,'');}var h,m;if(v.indexOf(':')>=0){var p=v.split(':');h=+p[0];m=+p[1];}else if(v.length<=2){h=+v;m=0;}else{h=+v.slice(0,v.length-2);m=+v.slice(-2);}if(isNaN(h)||isNaN(m))return null;if(ap==='p'&&h<12)h+=12;if(ap==='a'&&h===12)h=0;if(h<0||h>23||m<0||m>59)return null;return pad(h)+':'+pad(m);}
  // Edit one field (in/out) of a punch via the scroll-wheel picker
  function editField(key){var a=key.split('|'),name=a[0],di=a[1],idx=+a[2],field=a[3],p=punchesFor(name,di)[idx];if(!p)return;
    var cur=field==='in'?p.in:p.out;var d=parseISO(di);
    openTimePicker(field==='in'?'Clock-in time':'Clock-out time',name+' · '+dow(d)+' '+mdd(d),cur,function(val){
      if(field==='in')p.in=val;else p.out=val;p.editedBy='Bill';save();toast((field==='in'?'Clock-in':'Clock-out')+' set to '+t12(val));tcRenderPerson();});}
  function delPunch(key){var a=key.split('|'),name=a[0],di=a[1],p=punchesFor(name,di)[+a[2]];if(!p)return;if(!confirm('Delete this punch?'))return;var arr=TC_PUNCHES[name],pos=arr.indexOf(p);if(pos>=0)arr.splice(pos,1);save();toast('Punch removed');tcRenderPerson();}
  function addPunch(key){var a=key.split('|'),name=a[0],di=a[1],d=parseISO(di);
    openTimePicker('Clock-in time',name+' · new punch · '+dow(d)+' '+mdd(d),'08:00',function(val){
      TC_PUNCHES[name]=TC_PUNCHES[name]||[];TC_PUNCHES[name].push({id:newId('pu'),pid:name,date:di,in:val,out:null,locOk:true,note:'',editedBy:'Bill'});
      var arr=TC_NOSHOW[name]||[],pos=arr.indexOf(di);if(pos>=0)arr.splice(pos,1);save();toast('Punch added · set the clock-out next');tcRenderPerson();});}

  /* ---- scroll-wheel time picker ---- */
  var TP_HOURS=['1','2','3','4','5','6','7','8','9','10','11','12'],TP_MINS=[],TP_ITEMH=42;
  for(var _m=0;_m<60;_m++)TP_MINS.push(pad(_m));
  function tpEnsure(){
    if(document.getElementById('tc-tp'))return;
    var el=document.createElement('div');el.id='tc-tp';el.style.cssText='position:absolute;inset:0;z-index:70;display:none';
    /* position+z-index matter: the highlight band is absolutely positioned, so
       without a stacking context here it paints over the very number it marks. */
    function col(id){return '<div id="'+id+'" class="tp-col" style="position:relative;z-index:2;height:'+(TP_ITEMH*5)+'px;width:66px;overflow-y:scroll;scroll-snap-type:y mandatory;text-align:center;-webkit-overflow-scrolling:touch"></div>';}
    el.innerHTML='<style>#tc-tp .tp-col::-webkit-scrollbar{display:none}#tc-tp .tp-col{scrollbar-width:none}'
      /* Every row used to render identically, so nothing told you which value the
         band had captured. Distance from the centre now drives size + colour. */
      +'#tc-tp .tp-i{font-family:\'Archivo\';font-weight:700;font-size:19px;color:#aab2bb;opacity:.55;cursor:pointer;transition:font-size .12s,color .12s,opacity .12s}'
      +'#tc-tp .tp-i.near{font-size:21px;color:#6c7681;opacity:.85}'
      +'#tc-tp .tp-i.on{font-size:27px;font-weight:800;color:var(--acc);opacity:1}'
      +'#tc-tp .tp-fade{position:absolute;left:8px;right:8px;height:'+TP_ITEMH+'px;pointer-events:none;z-index:3}</style>'
      +'<div id="tc-tp-bd" style="position:absolute;inset:0;background:rgba(20,22,25,.45)"></div>'
      +'<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:22px 22px 0 0;padding:16px 18px 22px;box-shadow:0 -8px 30px rgba(0,0,0,.25)">'
        +'<div id="tc-tp-title" style="text-align:center;font:800 17px \'Archivo\';color:var(--ink)">Set time</div>'
        +'<div id="tc-tp-sub" style="text-align:center;font:700 11.5px \'Public Sans\';color:var(--muted);margin:2px 0 10px"></div>'
        +'<div style="text-align:center;margin:0 0 12px"><span id="tc-tp-live" style="display:inline-block;background:var(--acc);color:#fff;border-radius:999px;padding:6px 18px;font:800 17px \'Archivo\';letter-spacing:.3px">8:00 AM</span></div>'
        +'<div style="position:relative;display:flex;gap:4px;justify-content:center;align-items:center">'
          +'<div style="position:absolute;z-index:1;left:8px;right:8px;top:'+(TP_ITEMH*2)+'px;height:'+TP_ITEMH+'px;background:#fff1e0;border:2px solid var(--acc);border-radius:11px;pointer-events:none"></div>'
          +'<div class="tp-fade" style="top:0;background:linear-gradient(#fff,rgba(255,255,255,0))"></div>'
          +'<div class="tp-fade" style="bottom:0;background:linear-gradient(rgba(255,255,255,0),#fff)"></div>'
          +col('tc-tp-h')+'<div style="position:relative;z-index:2;font:800 22px \'Archivo\';color:var(--ink);padding-bottom:2px">:</div>'+col('tc-tp-m')+col('tc-tp-ap')
        +'</div>'
        +'<div style="display:flex;gap:10px;margin-top:18px">'
          +'<div id="tc-tp-cancel" class="tap" style="flex:1;text-align:center;padding:15px;border-radius:13px;background:#eef1f4;color:var(--ink);font:800 15px \'Public Sans\'">Cancel</div>'
          +'<div id="tc-tp-set" class="tap" style="flex:1;text-align:center;padding:15px;border-radius:13px;background:var(--acc);color:#fff;font:800 15px \'Public Sans\'">Set time</div>'
        +'</div></div>';
    document.getElementById('app').appendChild(el);
    el.querySelector('#tc-tp-bd').addEventListener('click',tpClose);
    el.querySelector('#tc-tp-cancel').addEventListener('click',tpClose);
    el.querySelector('#tc-tp-set').addEventListener('click',function(){var v=tpRead();var cb=window._tpCb;tpClose();if(cb)cb(v);});
    /* Repaint the wheel as it moves, and let a tap on any visible value pull it
       into the band — scrolling 60 minutes by flick alone is fiddly. */
    ['tc-tp-h','tc-tp-m','tc-tp-ap'].forEach(function(id){
      var c=el.querySelector('#'+id);
      c.addEventListener('scroll',function(){tpPaint(c);tpLive();},{passive:true});
      c.addEventListener('click',function(e){var it=e.target.closest('.tp-i');if(!it)return;
        var items=c.querySelectorAll('.tp-i'),i=Array.prototype.indexOf.call(items,it);
        if(c.scrollTo)c.scrollTo({top:i*TP_ITEMH,behavior:'smooth'});else c.scrollTop=i*TP_ITEMH;
        tpPaint(c);tpLive();});
    });
  }
  function tpFill(id,list,idx){var c=document.getElementById(id),pad2=TP_ITEMH*2,html='<div style="height:'+pad2+'px"></div>';
    list.forEach(function(v){html+='<div class="tp-i" style="height:'+TP_ITEMH+'px;line-height:'+TP_ITEMH+'px;scroll-snap-align:center">'+v+'</div>';});
    html+='<div style="height:'+pad2+'px"></div>';c.innerHTML=html;c.scrollTop=idx*TP_ITEMH;tpPaint(c);}
  /* Centre row = selected. One step out is legible, the rest fade back. */
  function tpPaint(c){if(typeof c==='string')c=document.getElementById(c);if(!c)return;
    var sel=Math.round(c.scrollTop/TP_ITEMH),items=c.querySelectorAll('.tp-i');
    for(var i=0;i<items.length;i++){var d=Math.abs(i-sel);items[i].className='tp-i'+(d===0?' on':(d===1?' near':''));}}
  function tpLive(){var el=document.getElementById('tc-tp-live');if(!el)return;
    var p=tpRead().split(':'),h=+p[0];el.textContent=(h%12||12)+':'+p[1]+' '+(h<12?'AM':'PM');}
  function tpSel(id,len){var c=document.getElementById(id);return Math.max(0,Math.min(len-1,Math.round(c.scrollTop/TP_ITEMH)));}
  function tpRead(){var h=tpSel('tc-tp-h',12)+1,m=tpSel('tc-tp-m',60),ap=tpSel('tc-tp-ap',2)===0?'a':'p';if(ap==='p'&&h<12)h+=12;if(ap==='a'&&h===12)h=0;return pad(h)+':'+pad(m);}
  function tpClose(){window._tpCb=null;var el=document.getElementById('tc-tp');if(el)el.style.display='none';}
  function openTimePicker(title,sub,initHM,cb){tpEnsure();var H=8,m=0,ap='a';if(initHM){var p=initHM.split(':');var hh=+p[0];m=+p[1];ap=hh<12?'a':'p';H=hh%12||12;}
    document.getElementById('tc-tp-title').textContent=title;document.getElementById('tc-tp-sub').textContent=sub||'';
    /* Show the sheet BEFORE filling: a display:none column has no scroll range,
       so setting scrollTop there is dropped and every wheel opens at 1:00 AM. */
    window._tpCb=cb;document.getElementById('tc-tp').style.display='block';
    tpFill('tc-tp-h',TP_HOURS,H-1);tpFill('tc-tp-m',TP_MINS,m);tpFill('tc-tp-ap',['AM','PM'],ap==='a'?0:1);
    tpLive();}
  function clearNoShow(key){var a=key.split('|'),name=a[0],di=a[1],arr=TC_NOSHOW[name]||[],pos=arr.indexOf(di);if(pos>=0)arr.splice(pos,1);TC_EXCUSED[name]=TC_EXCUSED[name]||[];if(TC_EXCUSED[name].indexOf(di)<0)TC_EXCUSED[name].push(di);save();toast('Absence approved · excused');tcRenderPerson();}
  function unexcuse(key){var a=key.split('|'),name=a[0],di=a[1],arr=TC_EXCUSED[name]||[],pos=arr.indexOf(di);if(pos>=0)arr.splice(pos,1);save();toast('Approval removed');tcRenderPerson();}
  /* Bill forgives a late arrival. The punch is left alone on purpose — payroll
     still sees the real clock-in, the leaderboard just stops counting it. */
  function excuseLate(key){var a=key.split('|'),name=a[0],di=a[1];
    TC_EXLATE[name]=TC_EXLATE[name]||[];
    if(TC_EXLATE[name].indexOf(di)<0)TC_EXLATE[name].push(di);
    save();toast('Late check-in approved · off their record');tcRenderPerson();}
  function unexcuseLate(key){var a=key.split('|'),name=a[0],di=a[1],arr=TC_EXLATE[name]||[],pos=arr.indexOf(di);
    if(pos>=0)arr.splice(pos,1);save();toast('Approval removed · counts again');tcRenderPerson();}
  function verifyPunch(key){var a=key.split('|'),p=punchesFor(a[0],a[1])[+a[2]];if(!p)return;p.locOk=true;p.editedBy='Bill';save();toast('Location confirmed');tcRenderPerson();}

  /* ---- entry + wiring ---- */
  /* Read-only peek at the current pay period for the home-screen widgets. The
     punch data lives in this closure, so this is the one way out. */
  window.tcSummary=function(){
    var i=curIdx();
    return {label:rangeLabel(i),
      year:new Date().getFullYear(),
      ytdTotal:crewHours('ytd',i),        // farm-wide undergrad hours, calendar year
      people:TC_STUDENTS.map(function(n){
        return {pid:n,name:nameOf(n),hours:hoursForPeriod(n,i),days:workedDays(n,i),
                ytd:hoursIn(n,'ytd',i),ytdDays:daysIn(n,'ytd',i),
                noshow:(TC_NOSHOW_LATE_PAUSED?0:noShowDates(n).length),late:(TC_NOSHOW_LATE_PAUSED?0:lateCount(n)),onClock:!!openPunch(n),
                unverified:hasUnverified(n,i)};
      })};
  };
  /* The home-screen shift banner punches in place, so it needs both the current
     state and a way to flip it without opening the Time Clock screen. */
  window.tcShift=function(name){
    var n=pidOf(name)||SESSION.pid,op=openPunch(n),sh=tcSchedToday(n),i=curIdx();
    return {on:!!op, since:op?t12(op.in):'',
            elapsed:op?fh(dur(op.in,nowHM())):'0.0',
            hours:hoursForPeriod(n,i),
            span:sh?(t12(sh.start)+' – '+t12(sh.end)):'',
            scheduledToday:!!sh};
  };
  window.tcToggleClock=function(name){
    var n=pidOf(name)||SESSION.pid;
    if(openPunch(n))clockOut(n); else clockIn(n);
    return !!openPunch(n);
  };
  /* Upcoming shifts off the usual weekly pattern — what the undergrad's
     "My schedule" widget needs, without exposing the punch data. */
  window.tcNextShifts=function(name,n){
    var out=[],d=midnight(new Date());
    for(var k=0;k<21&&out.length<(n||3);k++){
      var sh=tcSchedOn(name,d);
      if(sh)
        out.push({off:k,dow:d.getDay(),date:iso(d),
                  span:sh.start+'–'+sh.end,
                  noshow:isNoShow(name,iso(d))});
      d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
    }
    return out;
  };
  /* ---- the three doors the shared-database module comes in through ----
     Every punch lives in this closure. Rather than let the sync module keep a
     second copy -- two copies of a payroll record is how hours go missing --
     it asks through these and nothing else. */
  window.tcPunchDocs=function(){
    tcStampIds();
    var out=[];
    Object.keys(TC_PUNCHES).forEach(function(n){
      (TC_PUNCHES[n]||[]).forEach(function(p){ if(p&&p.id) out.push(p); });
    });
    return out;
  };
  /* Incoming punches, matched on id: the same shift never lands twice, and a
     time Bill corrected on his phone replaces the old one instead of sitting
     beside it. A punch that arrives filed under a different person than the
     copy here (somebody's roster id changed) is moved, not duplicated. */
  window.tcApplyRemote=function(list){
    if(!list||!list.length) return false;
    var touched=false;
    list.forEach(function(d){
      if(!d||!d.id||!d.pid) return;
      var id=String(d.id), n=String(d.pid), existing=null;
      Object.keys(TC_PUNCHES).forEach(function(k){
        var arr=TC_PUNCHES[k]||[];
        for(var i=arr.length-1;i>=0;i--){
          if(!arr[i]||String(arr[i].id)!==id) continue;
          if(k===n&&!existing) existing=arr[i];
          else { arr.splice(i,1); touched=true; }
        }
      });
      if(existing){
        if(JSON.stringify(existing)!==JSON.stringify(d)){
          Object.keys(existing).forEach(function(k){ if(!(k in d)) delete existing[k]; });
          Object.keys(d).forEach(function(k){ existing[k]=d[k]; });
          touched=true;
        }
        return;
      }
      TC_PUNCHES[n]=TC_PUNCHES[n]||[]; TC_NOSHOW[n]=TC_NOSHOW[n]||[];
      TC_EXCUSED[n]=TC_EXCUSED[n]||[]; TC_EXLATE[n]=TC_EXLATE[n]||[];
      TC_PUNCHES[n].push(d); touched=true;
    });
    if(touched){ save(); tcRepaintOpen(); }
    return touched;
  };
  window.tcDropRemote=function(ids){
    if(!ids||!ids.length) return false;
    var kill={}, touched=false;
    ids.forEach(function(i){ kill[String(i)]=1; });
    Object.keys(TC_PUNCHES).forEach(function(n){
      var arr=TC_PUNCHES[n]||[], before=arr.length;
      TC_PUNCHES[n]=arr.filter(function(p){ return !(p&&kill[String(p.id)]); });
      if(TC_PUNCHES[n].length!==before) touched=true;
    });
    if(touched){ save(); tcRepaintOpen(); }
    return touched;
  };
  function tcRepaintOpen(){
    try{
      var a=document.getElementById('s-timeclock');
      if(a&&a.classList.contains('active')){ tcEnter(); return; }
      var b=document.getElementById('s-tcperson');
      if(b&&b.classList.contains('active')) tcRenderPerson();
    }catch(e){}
  }
  window.tcEnter=function(){
    var body=document.getElementById('tc-body'),bk=document.getElementById('tc-back');
    if(currentRole==='undergrad'){renderWorker(body);if(bk)bk.style.display='none';}
    else if(currentRole==='manager'){renderManager(body);if(bk)bk.style.display='';}
    else if(currentRole==='faculty'){renderViewer(body);if(bk)bk.style.display='';}
    // grads and techs have no Time Clock access; if they land here anyway, show nothing.
    else{body.innerHTML='<div style="margin:14px;background:var(--card);border-radius:14px;padding:18px 16px;font:700 13px \'Public Sans\';color:var(--muted);text-align:center">Time Clock is limited to hourly crew, Bill and faculty.</div>';if(bk)bk.style.display='';}
  };
  document.getElementById('s-timeclock').addEventListener('click',function(e){
    var nav=e.target.closest('[data-tcnav]');if(nav){tcIdx+=nav.getAttribute('data-tcnav')==='next'?1:-1;tcEnter();return;}
    var rg=e.target.closest('[data-tcrange]');
    // stepping back through pay periods then switching to a rolling range would
    // otherwise leave the old period selected underneath — reset to current.
    if(rg){tcRange=rg.getAttribute('data-tcrange');if(tcRange!=='period')tcIdx=curIdx();tcEnter();return;}
    var ck=e.target.closest('[data-tcclock]');if(ck){if(ck.getAttribute('data-tcclock')==='in')clockIn(SESSION.pid);else clockOut(SESSION.pid);return;}
    var pr=e.target.closest('[data-tcperson]');if(pr){tcOpenPerson(pr.getAttribute('data-tcperson'));return;}
  });
  document.getElementById('s-tcperson').addEventListener('click',function(e){
    var nav=e.target.closest('[data-tcnav]');if(nav){tcIdx+=nav.getAttribute('data-tcnav')==='next'?1:-1;tcRenderPerson();return;}
    var x;
    if(x=e.target.closest('[data-tcfield]'))return editField(x.getAttribute('data-tcfield'));
    if(x=e.target.closest('[data-tcdel]'))return delPunch(x.getAttribute('data-tcdel'));
    if(x=e.target.closest('[data-tcadd]'))return addPunch(x.getAttribute('data-tcadd'));
    if(x=e.target.closest('[data-tcclear]'))return clearNoShow(x.getAttribute('data-tcclear'));
    if(x=e.target.closest('[data-tcunexcuse]'))return unexcuse(x.getAttribute('data-tcunexcuse'));
    if(x=e.target.closest('[data-tcverify]'))return verifyPunch(x.getAttribute('data-tcverify'));
    if(x=e.target.closest('[data-tcexlate]'))return excuseLate(x.getAttribute('data-tcexlate'));
    if(x=e.target.closest('[data-tcunlate]'))return unexcuseLate(x.getAttribute('data-tcunlate'));
  });
})();

/* ---- Weather: clickable forecast day detail ---- */
var WXDAYS=[
 {day:'Wednesday',cond:'Partly cloudy',ico:'⛅',hi:90,lo:71,hum:'58%',wind:'8 mph SW',precip:'20%',uv:'7 · High'},
 {day:'Thursday',cond:'Scattered storms',ico:'⛈️',hi:85,lo:68,hum:'74%',wind:'12 mph S',precip:'60%',uv:'5 · Moderate'},
 {day:'Friday',cond:'Sunny',ico:'☀️',hi:88,lo:70,hum:'49%',wind:'5 mph NW',precip:'5%',uv:'8 · Very high'},
 {day:'Saturday',cond:'Mostly sunny',ico:'🌤️',hi:89,lo:70,hum:'52%',wind:'6 mph W',precip:'10%',uv:'8 · Very high'},
 {day:'Sunday',cond:'Isolated storms',ico:'🌦️',hi:86,lo:69,hum:'66%',wind:'9 mph SW',precip:'40%',uv:'6 · High'}
];
function renderWxDay(i){var d=WXDAYS[i];if(!d)return;var q=function(id){return document.getElementById(id);};
 q('wxd-day').textContent=d.day;q('wxd-temp').textContent=d.hi+'°';q('wxd-cond').textContent=d.cond;
 q('wxd-hilo').textContent='H '+d.hi+'° / L '+d.lo+'°';q('wxd-ico').textContent=d.ico;
 q('wxd-hum').textContent=d.hum;q('wxd-wind').textContent=d.wind;q('wxd-precip').textContent=d.precip;q('wxd-uv').textContent=d.uv;}
document.querySelectorAll('#s-weather .wxcard').forEach(function(c){c.addEventListener('click',function(){renderWxDay(+c.getAttribute('data-wx'));show('wxday',true);});});

/* ---- Hourly forecast -------------------------------------------------------
   The five-day row answers "what is the week doing". It does not answer the
   question the crew actually asks at 7am, which is "how long have I got before
   the wind picks up". This section is that question: 24 hours from now, each
   one carrying the two numbers that decide whether the rig rolls — wind and
   rain — and a bar saying whether that hour is inside the limits.

   The forecast is shaped from the day cards rather than invented separately, so
   the hours and the day they sit under always agree: each hour belongs to a
   WXDAYS entry, and its temperature swings between that day's high and low on a
   diurnal curve, its rain chance peaks mid-afternoon against that day's number,
   and its wind follows the same curve. Nothing here is random — the same clock
   hour always produces the same forecast, so the strip does not reshuffle
   itself every time the screen is opened.

   When this app is wired to a live NWS feed, only wxHours() changes: everything
   below reads the array it returns. */
var WX_SPRAY_WIND=10;    /* mph — over this and the spray drifts */
var WX_SPRAY_PRECIP=20;  /* % — over this and it washes off */
function wxIsNight(h){ return h<7||h>=20; }
function wxHourLabel(h){ return (h%12||12)+(h<12?'a':'p'); }
/* Warmest at 3p, coldest at 3a — one curve drives temperature, wind and the
   rain chance, which is why they move together the way a real day does. */
function wxCurve(h){ return (Math.cos((h-15)/24*2*Math.PI)+1)/2; }
function wxCond(precip,h){
  if(precip>=50) return {ico:'⛈️',txt:'Storms'};
  if(precip>=30) return {ico:'🌦️',txt:'Showers around'};
  if(precip>=15) return wxIsNight(h)?{ico:'☁️',txt:'Cloudy'}:{ico:'⛅',txt:'Partly cloudy'};
  return wxIsNight(h)?{ico:'🌙',txt:'Clear'}:{ico:'☀️',txt:'Sunny'};
}
function wxHours(){
  if(typeof WXDAYS==='undefined'||!WXDAYS.length) return [];
  var now=new Date(), out=[];
  var t0=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  for(var k=0;k<24;k++){
    var d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),now.getHours()+k);
    var h=d.getHours();
    /* Which day card this hour belongs to — counted off midnight so the last
       day of a month behaves like any other. */
    var d0=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
    var di=Math.min(Math.round((d0-t0)/86400000),WXDAYS.length-1);
    var day=WXDAYS[di], c=wxCurve(h);
    var temp=Math.round(day.lo+(day.hi-day.lo)*c);
    var hum=Math.round(88-36*c);
    /* Rain holds off overnight and stacks up through the afternoon. */
    var pk=Math.max(0,Math.cos((h-16)/24*2*Math.PI));
    var precip=Math.round(parseInt(day.precip,10)*(0.3+0.7*pk)/5)*5;
    var wind=Math.round(3+9*c);
    var dir=(day.wind.match(/[NSEW]{1,2}$/)||['SW'])[0];
    var cond=wxCond(precip,h);
    out.push({when:d,hour:h,label:k===0?'Now':wxHourLabel(h),
              /* Day names come off the forecast row, not off the calendar, so
                 the strip and the five-day cards never disagree. */
              newDay:(k>0&&h===0),dayShort:(day.day||'').slice(0,3),
              temp:temp,feels:temp+(hum>65&&temp>80?3:0),hum:hum,
              /* dew ≈ T − 0.36(100 − RH) in Fahrenheit */
              dew:Math.round(temp-0.36*(100-hum)),
              precip:precip,wind:wind,dir:dir,ico:cond.ico,cond:cond.txt,
              spray:(wind<=WX_SPRAY_WIND&&precip<=WX_SPRAY_PRECIP)});
  }
  return out;
}
var WXH=[], wxhSel=0;
/* The first stretch of green in the strip, read back in words — the answer to
   "can I go now, and how long have I got". */
function wxNextWindow(list){
  var s=-1,e=-1;
  for(var i=0;i<list.length;i++){
    if(list[i].spray){ if(s<0)s=i; e=i; }
    else if(s>=0) break;
  }
  if(s<0) return {txt:'No spray window in the next 24 h',c:'#c0392b'};
  var endH=(list[e].hour+1)%24;
  if(s===0) return {txt:'Good to spray now → '+wxHourLabel(endH),c:'#2f7d3a'};
  return {txt:'Next window '+wxHourLabel(list[s].hour)+' → '+wxHourLabel(endH),c:'#9a5b00'};
}
function wxHourCard(x,i){
  return '<div class="wxh tap'+(i===wxhSel?' on':'')+(i===0?' now':'')+'" data-wxh="'+i+'">'
   +'<div class="h">'+(x.newDay?x.dayShort+' 12a':x.label)+'</div>'
   +'<div class="i">'+x.ico+'</div>'
   +'<div class="t">'+x.temp+'°</div>'
   +'<div class="p">'+(x.precip>=5?x.precip+'%':'')+'</div>'
   +'<div class="w">'+x.wind+' mph</div>'
   +'<div class="sw '+(x.spray?'ok':'no')+'"></div>'
   +'</div>';
}
function wxReadHtml(x){
  if(!x) return '';
  var chip=x.spray
    ? '<span class="pill" style="background:#eafaef;color:#2f7d3a">Spray window OK</span>'
    : '<span class="pill" style="background:#fdeceb;color:#c0392b">Hold · '
        +(x.wind>WX_SPRAY_WIND?(x.precip>WX_SPRAY_PRECIP?'wind and rain':'wind'):'rain')+'</span>';
  var when=(x.label==='Now'?'Now':x.dayShort+' '+wxHourLabel(x.hour));
  return '<div class="list">'
   +'<div class="fld"><span class="fl">'+when+' · '+esc(x.cond)+'</span>'+chip+'</div>'
   +'<div class="fld"><span class="fl">Temperature</span><span class="fv">'+x.temp+'°'
     +(x.feels!==x.temp?' · feels '+x.feels+'°':'')+'</span></div>'
   +'<div class="fld"><span class="fl">Wind</span><span class="fv">'+x.wind+' mph '+esc(x.dir)+'</span></div>'
   +'<div class="fld"><span class="fl">Rain chance</span><span class="fv">'+x.precip+'%</span></div>'
   +'<div class="fld" style="border-bottom:none"><span class="fl">Humidity · dew point</span>'
     +'<span class="fv">'+x.hum+'% · '+x.dew+'°</span></div>'
   +'</div>';
}
function wxRenderHours(){
  var strip=document.getElementById('wxh-strip'); if(!strip) return;
  strip.innerHTML=WXH.map(wxHourCard).join('');
  var rd=document.getElementById('wxh-read'); if(rd) rd.innerHTML=wxReadHtml(WXH[wxhSel]);
  var w=document.getElementById('wxh-win');
  if(w){ var nw=wxNextWindow(WXH); w.textContent=nw.txt; w.style.color=nw.c; }
}
/* Rebuilt on the way in so the strip always starts at the hour it is now. */
function wxEnter(){ WXH=wxHours(); if(wxhSel>=WXH.length) wxhSel=0; wxRenderHours(); }
(function(){
  var host=document.getElementById('s-weather'); if(!host) return;
  host.addEventListener('click',function(e){
    var c=e.target.closest('[data-wxh]'); if(!c) return;
    wxhSel=+c.getAttribute('data-wxh');
    /* Only the selection moved — repainting the strip would scroll it home. */
    host.querySelectorAll('#wxh-strip .wxh').forEach(function(el){
      el.classList.toggle('on',el===c);
    });
    var rd=document.getElementById('wxh-read'); if(rd) rd.innerHTML=wxReadHtml(WXH[wxhSel]);
  });
})();
(function(){var e=document.querySelector('#s-weather .radaropen'),f=document.getElementById('wxradar-img');if(e&&f)e.addEventListener('click',function(){if(!f.getAttribute('src'))f.src=f.getAttribute('data-src')+'?t='+Date.now();show('wxradar',true);});})();

/* ---- rainfall log ----------------------------------------------------------
   The gauge gets read by hand, so the truth is a flat list of dated readings:
   {id, d:'YYYY-MM-DD', amt (inches), note}. Every view is a rollup of that one
   list — week is 7 day-bars, month is one bar per day, year is one bar per
   month — which means adding a reading updates all three for free and there is
   no second copy of the numbers to drift.

   First run seeds a deterministic year of East-Tennessee-shaped rain (monthly
   normals, ~10 rain days a month, a couple of soakers carrying most of the
   total) so the year view isn't a blank wall before anyone has logged anything.
   The seed is written to storage immediately, so from then on it behaves like
   real data: editable, deletable, and never regenerated. Clear ut_rain to
   reseed. */
(function(){
  var RN_KEY='ut_rain';
  var MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var MONS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  /* Knoxville monthly precipitation normals, inches */
  var NORM=[4.4,4.3,4.6,4.0,4.4,4.6,4.7,3.1,3.2,3.0,3.9,4.6];

  var RN=[], view='week', anchor=today(), sel=null, editId=null, showAll=false;

  function p2(n){return (n<10?'0':'')+n;}
  function d2s(d){return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());}
  function s2d(s){var a=s.split('-');return new Date(+a[0],+a[1]-1,+a[2]);}
  function today(){var t=new Date();return new Date(t.getFullYear(),t.getMonth(),t.getDate());}
  function fmtDay(d){return DOW[d.getDay()]+' '+MONS[d.getMonth()]+' '+d.getDate();}
  function inch(v){return (Math.round(v*100)/100).toFixed(2)+'″';}
  /* MONDAY, unlike the calendar's weekStart() near the top of this file, which
     starts on Sunday. Rain is read against the working week. Both are right for
     what they do; see the note up there before merging them. */
  function weekStart(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
  function $(id){return document.getElementById(id);}

  /* deterministic PRNG — same seeded year on every machine, every reload */
  function lcg(seed){var s=seed>>>0;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

  function seed(){
    var out=[],r=lcg(20260101),t=today(),y=t.getFullYear(),id=1;
    for(var m=0;m<12;m++){
      if(new Date(y,m,1)>t)break;
      var dim=new Date(y,m+1,0).getDate();
      var last=(m===t.getMonth())?t.getDate():dim;      /* current month is partial */
      var frac=last/dim;
      var target=NORM[m]*frac*(0.72+r()*0.62);          /* wet years and dry years */
      var days=Math.max(1,Math.round((9+r()*4)*frac));
      var picked={},list=[],guard=0;
      while(list.length<days&&guard++<500){var dd=1+Math.floor(r()*last);if(!picked[dd]){picked[dd]=1;list.push(dd);}}
      list.sort(function(a,b){return a-b;});
      /* skewed weights: most readings are showers, one or two are the storm */
      var w=list.map(function(){return Math.pow(r(),2.4)+0.04;});
      var sum=w.reduce(function(a,b){return a+b;},0)||1;
      list.forEach(function(dd,i){
        var amt=Math.round(target*w[i]/sum*100)/100;
        out.push({id:id++,d:d2s(new Date(y,m,dd)),amt:amt<0.02?0.02:amt,note:''});
      });
    }
    return out;
  }

  function load(){
    try{var r=JSON.parse(localStorage.getItem(RN_KEY)||'null');if(r&&r.length){RN=r;return;}}catch(e){}
    RN=seed(); save();
  }
  function save(){try{localStorage.setItem(RN_KEY,JSON.stringify(RN));}catch(e){}}
  function nextId(){var n=0;RN.forEach(function(x){if(x.id>n)n=x.id;});return n+1;}

  /* ---- period math ---- */
  function period(){
    var y=anchor.getFullYear(),m=anchor.getMonth(),b=[],i;
    if(view==='week'){
      var s=weekStart(anchor);
      for(i=0;i<7;i++){var dd=new Date(s.getFullYear(),s.getMonth(),s.getDate()+i);
        b.push({key:d2s(dd),lbl:'MTWTFSS'[i],full:fmtDay(dd),amt:0});}
      var e=new Date(s.getFullYear(),s.getMonth(),s.getDate()+6);
      return {bars:b,gap:8,unit:'day',
        label:MONS[s.getMonth()]+' '+s.getDate()+' – '+MONS[e.getMonth()]+' '+e.getDate()+(e.getFullYear()!==today().getFullYear()?', '+e.getFullYear():''),
        start:s,end:e};
    }
    if(view==='month'){
      var dim=new Date(y,m+1,0).getDate();
      for(i=1;i<=dim;i++){var d2=new Date(y,m,i);
        b.push({key:d2s(d2),lbl:(i===1||i%5===0)?String(i):'',full:fmtDay(d2),amt:0});}
      return {bars:b,gap:2,unit:'day',label:MON[m]+' '+y,start:new Date(y,m,1),end:new Date(y,m,dim)};
    }
    for(i=0;i<12;i++)b.push({key:y+'-'+p2(i+1),lbl:'JFMAMJJASOND'[i],full:MON[i]+' '+y,amt:0,mi:i});
    return {bars:b,gap:5,unit:'month',label:String(y),start:new Date(y,0,1),end:new Date(y,11,31)};
  }

  function fill(p){
    var map={},i;
    for(i=0;i<p.bars.length;i++)map[p.bars[i].key]=p.bars[i];
    var rain={};   /* distinct dates with measurable rain, for the "rain days" stat */
    RN.forEach(function(x){
      var k=p.unit==='month'?x.d.slice(0,7):x.d, bar=map[k];
      if(!bar)return;
      bar.amt+=x.amt;
      if(x.amt>0)rain[x.d]=1;
    });
    p.total=0;p.max=0;p.top=null;
    p.bars.forEach(function(bar){
      bar.amt=Math.round(bar.amt*100)/100;
      p.total+=bar.amt;
      if(bar.amt>p.max){p.max=bar.amt;p.top=bar;}
    });
    p.total=Math.round(p.total*100)/100;
    p.rainDays=Object.keys(rain).length;
    return p;
  }

  function entriesIn(p){
    var a=d2s(p.start),b=d2s(p.end);
    return RN.filter(function(x){return x.d>=a&&x.d<=b;})
             .sort(function(x,y){return x.d<y.d?1:x.d>y.d?-1:y.id-x.id;});
  }

  function atEnd(p){ return p.end>=today(); }

  /* ---- render ---- */
  function render(){
    var p=fill(period());
    $('rn-lbl').textContent=p.label;
    $('rn-next').classList.toggle('off',atEnd(p));
    Array.prototype.forEach.call($('rn-seg').children,function(s){s.classList.toggle('on',s.getAttribute('data-v')===view);});

    var mx=p.max||1;
    $('rn-chart').style.gap=p.gap+'px';
    $('rn-axis').style.gap=p.gap+'px';
    $('rn-chart').innerHTML=p.bars.map(function(bar,i){
      var r=bar.amt/mx, h=bar.amt<=0?3:Math.max(6,Math.round(r*100));
      var c=bar.amt<=0?'#e6ebf2':r<0.34?'#cfe0ff':r<0.7?'#7aa7f0':'#2456b8';
      return '<div class="rn-bw'+(sel===i?' sel':'')+'" data-i="'+i+'"><div class="rn-bar" style="height:'+h+'%;background:'+c+'"></div></div>';
    }).join('');
    $('rn-axis').innerHTML=p.bars.map(function(bar){return '<div>'+bar.lbl+'</div>';}).join('');

    var sb=sel!=null?p.bars[sel]:null;
    $('rn-read').innerHTML=sb
      ? '<b style="color:var(--ink)">'+sb.full+'</b> · '+(sb.amt>0?'<b style="color:#2456b8">'+inch(sb.amt)+'</b>':'no rain')
        +(view==='year'&&sb.amt>0?' · tap again for the daily breakdown':'')
      : (view==='year'?'Tap a month to open it':'Tap a bar for that day’s total');

    var stat3=p.max>0
      ? {n:inch(p.max),l:view==='year'?'Wettest · '+MONS[p.top.mi]:'Wettest day'}
      : {n:'—',l:view==='year'?'Wettest month':'Wettest day'};
    $('rn-stats').innerHTML=
       '<div><div class="n">'+inch(p.total)+'</div><div class="l">'+(view==='week'?'Week':view==='month'?'Month':'Year')+' total</div></div>'
      +'<div><div class="n">'+p.rainDays+'</div><div class="l">Rain days</div></div>'
      +'<div><div class="n">'+stat3.n+'</div><div class="l">'+stat3.l+'</div></div>';

    renderList(p);
  }

  function renderList(p){
    var w=$('rn-listwrap'),html;
    if(view==='year'){
      var cnt={};RN.forEach(function(x){if(x.d.slice(0,4)===String(anchor.getFullYear())&&x.amt>0)cnt[x.d.slice(0,7)]=(cnt[x.d.slice(0,7)]||0)+1;});
      var rows=p.bars.filter(function(b){return b.amt>0;}).map(function(b){
        var n=cnt[b.key]||0;
        return '<div class="row tap" data-mi="'+b.mi+'"><div style="flex:1"><div class="rt">'+MON[b.mi]+'</div>'
          +'<div class="rs">'+n+' rain day'+(n===1?'':'s')+' · vs '+NORM[b.mi].toFixed(1)+'″ normal</div></div>'
          +'<div style="font:800 14px \'Archivo\';color:#2456b8">'+inch(b.amt)+'</div>'
          +'<span style="color:#c2c7cd;font-size:18px">›</span></div>';
      }).join('');
      html='<div class="sec" style="margin:14px 16px 5px">'+esc(p.label)+' by month</div>'
        +'<div class="list">'+(rows||'<div class="row"><div class="rs">No readings logged this year yet.</div></div>')+'</div>';
    }else{
      var all=entriesIn(p), list=showAll?all:all.slice(0,6);
      var rows2=list.map(function(x){
        var d=s2d(x.d);
        return '<div class="row tap" data-id="'+x.id+'"><div style="flex:1;min-width:0"><div class="rt">'+fmtDay(d)+'</div>'
          +'<div class="rs">'+(x.note?esc(x.note):'Gauge reading')+'</div></div>'
          +'<div style="font:800 14px \'Archivo\';color:#2456b8">'+inch(x.amt)+'</div>'
          +'<span style="color:#c2c7cd;font-size:18px">›</span></div>';
      }).join('');
      var more=all.length>6
        ? '<div class="row tap" id="rn-more" style="justify-content:center"><span style="font:800 12px \'Public Sans\';color:#2456b8">'
          +(showAll?'Show fewer':'Show all '+all.length+' readings')+'</span></div>' : '';
      html='<div class="sec" style="margin:14px 16px 5px">Readings · '+esc(p.label)+'</div>'
        +'<div class="list">'+(rows2||'<div class="row"><div class="rs">No readings logged for this '+view+'.</div></div>')+more+'</div>';
    }
    w.innerHTML=html;
  }

  /* ---- entry form ---- */
  function openForm(id){
    editId=id||null;
    var x=editId?RN.filter(function(r){return r.id===editId;})[0]:null;
    var d=x?x.d:d2s(today());
    $('rn-form').style.display='';
    $('rn-addbar').style.display='none';
    $('rn-form').innerHTML=
       '<div class="sec" style="margin:14px 16px 5px">'+(x?'Edit reading':'New gauge reading')+'</div>'
      +'<div class="list">'
      +'<div class="fld"><span class="fl">Date</span><input type="date" id="rn-f-date" class="rn-in" max="'+d2s(today())+'" value="'+d+'"></div>'
      +'<div class="fld"><span class="fl">Amount (inches)</span><input type="number" id="rn-f-amt" class="rn-in" step="0.01" min="0" inputmode="decimal" placeholder="0.00" value="'+(x?x.amt:'')+'"></div>'
      +'<div class="fld"><span class="fl">Note</span><input type="text" id="rn-f-note" class="rn-in" placeholder="Optional" value="'+esc(x?x.note:'')+'"></div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;margin:9px 14px 0">'
      +'<div class="rn-btn tap" id="rn-cancel">Cancel</div>'
      +'<div class="rn-btn pri tap" id="rn-save">'+(x?'Save changes':'Save reading')+'</div></div>'
      +(x?'<div style="margin:8px 14px 0"><div class="rn-btn del tap" id="rn-del">Delete reading</div></div>':'');
    try{$('rn-form').scrollIntoView({block:'nearest'});}catch(e){}
  }
  function closeForm(){editId=null;$('rn-form').style.display='none';$('rn-form').innerHTML='';$('rn-addbar').style.display='';}

  function commit(){
    var d=$('rn-f-date').value, amt=parseFloat($('rn-f-amt').value), note=$('rn-f-note').value.trim();
    if(!d){toast('Pick a date for the reading');return;}
    if(!(amt>=0)||isNaN(amt)){toast('Enter the amount in inches');return;}
    amt=Math.round(amt*100)/100;
    if(editId){
      RN.forEach(function(x){if(x.id===editId){x.d=d;x.amt=amt;x.note=note;}});
      toast('Reading updated ✓');
    }else{
      RN.push({id:nextId(),d:d,amt:amt,note:note});
      toast('Rain-gauge reading saved ✓');
    }
    save(); closeForm();
    /* jump the chart to whatever period the reading landed in, so the bar the
       person just created is the one they're looking at */
    anchor=s2d(d); sel=null; showAll=false; render();
  }

  function remove(){
    RN=RN.filter(function(x){return x.id!==editId;});
    save(); closeForm(); toast('Reading deleted'); sel=null; render();
  }

  /* ---- wiring ---- */
  function step(dir){
    if(view==='week')anchor=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()+7*dir);
    else if(view==='month')anchor=new Date(anchor.getFullYear(),anchor.getMonth()+dir,1);
    else anchor=new Date(anchor.getFullYear()+dir,anchor.getMonth(),1);
    sel=null; showAll=false; render();
  }

  var host=document.getElementById('s-weather');
  if(!host)return;
  host.addEventListener('click',function(e){
    var t;
    if((t=e.target.closest('#rn-seg span'))){view=t.getAttribute('data-v');sel=null;showAll=false;render();return;}
    if(e.target.closest('#rn-prev')){step(-1);return;}
    if(e.target.closest('#rn-next')){step(1);return;}
    if((t=e.target.closest('.rn-bw'))){
      var i=+t.getAttribute('data-i');
      /* second tap on a month drills in — the chart is the navigation */
      if(view==='year'&&sel===i){view='month';anchor=new Date(anchor.getFullYear(),i,1);sel=null;showAll=false;render();return;}
      sel=(sel===i?null:i); render(); return;
    }
    if((t=e.target.closest('[data-mi]'))){view='month';anchor=new Date(anchor.getFullYear(),+t.getAttribute('data-mi'),1);sel=null;showAll=false;render();return;}
    if(e.target.closest('#rn-more')){showAll=!showAll;render();return;}
    if((t=e.target.closest('#rn-listwrap [data-id]'))){openForm(+t.getAttribute('data-id'));return;}
    if(e.target.closest('#rn-add')){openForm(null);return;}
    if(e.target.closest('#rn-cancel')){closeForm();return;}
    if(e.target.closest('#rn-save')){commit();return;}
    if(e.target.closest('#rn-del')){remove();return;}
  });

  load(); render();
  window.rnRender=render;
})();

/* The task board's first paint. This MUST stay at the end of the block.

   It used to sit up in the inventory section, ~400 lines above the ASMON/ASDOW
   month and day-name arrays it ends up reading through asDateLabel(). `var`
   declarations hoist but their VALUES do not, so those arrays were still
   undefined when the board drew, and reading one threw. This is all one
   <script>, so that throw killed every line below it -- the calendar, the time
   clock, semester dates, farm settings and admin all silently stopped
   existing, while the page still rendered and looked fine. It shipped that way
   on 2026-08-27 and nobody could have seen it without opening the console.

   Anything that draws a screen belongs down here, below every definition it
   could possibly reach. tools/test-boot.js fails if this rule is broken. */
renderBoard();

