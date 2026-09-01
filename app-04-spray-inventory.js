/* ============================================================
   THE FIELD TOOLS — the screens somebody uses standing in a field.

   The spray mix calculator and the settings behind its numbers; the undergrad
   task-work mode where plots get checked off as they are done; the inventory
   module and its movement ledger; and the equipment module with its
   maintenance schedules.

   Stock is a ledger of movements that gets added up, never a running total
   somebody edits. See docs/DECISIONS.md before "simplifying" that.
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
/* ======================= SPRAY MIX CALCULATOR =======================
   Every boom spray on this farm is the same three-step arithmetic done on the
   tailgate with a phone calculator, and it is the step that gets fumbled: the
   nozzle sets how much water goes down per thousand square feet, the plots set
   how many thousand square feet there are, and the label rate sets how much
   product rides in that water. Getting it wrong costs either a re-spray or a
   ruined trial, so the task carries the mix sheet with it.

   Two numbers the crew already knows, kept here so nobody has to remember them:

   - Nozzle output is measured in gallons per 1000 sq ft, not the gpm printed on
     the tip. The rig is driven at a set speed, so output per ground area is the
     figure that actually predicts the tank, and it is what the crew calls out.
   - The boom needs charging. On a run over 25 gallons an extra 20 gallons goes
     in the tank so the boom pressurises and so a slope cannot suck the sump
     dry mid-pass. That water is real and it is mixed at label strength, which
     is why the product figure below is computed for the WHOLE tank rather than
     for the treated area — anything that comes out of the nozzle is then on
     rate, and the surplus is accounted for instead of silently diluting.

   Under 25 gallons the surplus has nowhere to go — a small precise job cannot
   dump its leftover on the next block without contaminating it — so those runs
   are booked as "Pesticide - Boom (Precise)", which skips the charge entirely
   and mixes only what the ground needs.                                    */

/* gal per 1000 sq ft of ground covered. Three tips live on the John Deere. */
var SPRAY_NOZZLES=[
 {id:'red_ai', label:'Red air induction', sub:'John Deere · red AI tip', galM:0.91},
 {id:'blue_tj',label:'Blue TeeJet',       sub:'John Deere',              galM:2},
 {id:'red_tj', label:'Red TeeJet',        sub:'John Deere',              galM:0.91}
];
var BOOM_CHARGE_GAL=20;      /* extra water for boom pressure and slope */
var BOOM_CHARGE_OVER_GAL=25; /* only runs bigger than this get the charge */

/* ---- spray settings: the numbers, made editable -------------------------
   The tip rates and the boom charge decide how much chemical reaches the
   ground. They were constants in this file, which meant changing a nozzle or
   a charge rule was a code edit — something the farm will not be able to do
   once whoever wrote this has gone. They now live behind a screen.

   Stored as a difference from the built-in values, per section, so a default
   corrected in the file later still reaches anyone who has not overridden
   that particular section. Nothing is written until somebody changes it. */
var SPRAY_KEY='ut_spray_settings_v1';
var SPRAY_MIN_RATE=0.01, SPRAY_MAX_RATE=20;   /* gal/1000 ft² — a sanity fence, not a label */

/* When it is too windy to spray, and how much rain in the forecast means it
   would only wash off. The weather screen and every home-screen spray widget
   judge the forecast against these two numbers.

   They were constants in the weather code until 2026-08-30, which made "we
   hold at 8 mph, not 10" a code edit. They are spray settings rather than
   weather ones -- the forecast reports the wind, it does not decide how much
   of it is too much -- so they live here with the tips and the boom charge,
   and they are on the Spray settings screen. */
var WX_SPRAY_WIND=10;    /* mph — over this and the spray drifts */
var WX_SPRAY_PRECIP=20;  /* % — over this and it washes off */
var _sprayBase=null;

function sprayCaptureBase(){
  _sprayBase={ nozzles:JSON.stringify(SPRAY_NOZZLES), charge:BOOM_CHARGE_GAL, over:BOOM_CHARGE_OVER_GAL,
               wind:WX_SPRAY_WIND, precip:WX_SPRAY_PRECIP };
}
function sprayDiff(){
  var o={}; if(!_sprayBase) return o;
  if(JSON.stringify(SPRAY_NOZZLES)!==_sprayBase.nozzles) o.nozzles=SPRAY_NOZZLES;
  if(BOOM_CHARGE_GAL!==_sprayBase.charge) o.charge=BOOM_CHARGE_GAL;
  if(BOOM_CHARGE_OVER_GAL!==_sprayBase.over) o.over=BOOM_CHARGE_OVER_GAL;
  if(WX_SPRAY_WIND!==_sprayBase.wind) o.wind=WX_SPRAY_WIND;
  if(WX_SPRAY_PRECIP!==_sprayBase.precip) o.precip=WX_SPRAY_PRECIP;
  return o;
}
/* Every value is re-checked on the way in. A saved file can be edited by hand,
   and a bad rate here is a bad rate on the grass. */
function sprayApply(v){
  if(!v||typeof v!=='object'||Array.isArray(v)) return;
  if(Array.isArray(v.nozzles)){
    var good=v.nozzles.filter(function(n){
      return n&&typeof n==='object'&&n.id&&n.label
        && typeof n.galM==='number'&&isFinite(n.galM)
        && n.galM>=SPRAY_MIN_RATE&&n.galM<=SPRAY_MAX_RATE;
    });
    if(good.length){ SPRAY_NOZZLES.length=0; good.forEach(function(n){ SPRAY_NOZZLES.push(n); }); }
  }
  if(typeof v.charge==='number'&&isFinite(v.charge)&&v.charge>=0&&v.charge<=200) BOOM_CHARGE_GAL=v.charge;
  if(typeof v.over==='number'&&isFinite(v.over)&&v.over>=0&&v.over<=500) BOOM_CHARGE_OVER_GAL=v.over;
  /* Fenced the same way as the rates. A hand-edited file saying the wind limit
     is 900 mph would quietly turn the spray warning off altogether. */
  if(typeof v.wind==='number'&&isFinite(v.wind)&&v.wind>=1&&v.wind<=40) WX_SPRAY_WIND=v.wind;
  if(typeof v.precip==='number'&&isFinite(v.precip)&&v.precip>=0&&v.precip<=100) WX_SPRAY_PRECIP=v.precip;
}
function sprayHydrate(){
  sprayCaptureBase();
  var raw=null; try{ raw=localStorage.getItem(SPRAY_KEY); }catch(e){}
  if(raw!==null&&raw!==undefined){
    var p=null; try{ p=JSON.parse(raw); }catch(e){ p=null; }
    sprayApply(p);
  }
  try{ _storeSeen['spray']=JSON.stringify(sprayDiff()); }catch(e){}
}
function sprayScan(){
  var s; try{ s=JSON.stringify(sprayDiff()); }catch(e){ return; }
  if(_storeSeen['spray']===s) return;
  if(storeWriteRaw({key:SPRAY_KEY},s)) _storeSeen['spray']=s;
}
function sprayIsDefault(){ return Object.keys(sprayDiff()).length===0; }
function sprayResetDefaults(){
  try{ localStorage.removeItem(SPRAY_KEY); }catch(e){}
  _storeSeen['spray']=undefined;
  toast('Spray settings back to the built-in numbers — reloading');
  setTimeout(function(){ try{ location.reload(); }catch(e){} },700);
}

/* ---- the screen ---- */
var sprAdding=false;
/* Was flCanChem()||admin, which read currentRole. flCanChem() still governs
   logging a CHEMICAL in the field log -- a different question, left alone. */
function sprCanEdit(){ return fstCanEditKit(); }
function sprNum(v){ var n=parseFloat(String(v==null?'':v).trim()); return isFinite(n)?n:null; }

function sprRender(){
  var body=document.getElementById('spr-body'); if(!body) return;
  var edit=sprCanEdit();

  var tips=SPRAY_NOZZLES.map(function(n,i){
    var right = edit
      ? '<input class="inv-in" data-spr-rate="'+esc(n.id)+'" value="'+esc(String(n.galM))+'" '
        +'inputmode="decimal" style="max-width:76px;text-align:right">'
        +'<span style="font:700 11px \'Public Sans\';color:var(--muted);margin-left:6px;flex:none">gal/1000 ft²</span>'
      : '<span class="fv">'+esc(String(n.galM))+' gal/1000 ft²</span>';
    var kill = (edit&&SPRAY_NOZZLES.length>1)
      ? '<span class="tap" data-spr-del="'+esc(n.id)+'" style="color:#c0392b;font-size:15px;flex:none;margin-left:10px;padding:0 4px">✕</span>' : '';
    return '<div class="row" style="align-items:center'+(i===SPRAY_NOZZLES.length-1&&!edit?';border-bottom:none':'')+'">'
      +'<div style="flex:1;min-width:0"><div class="rt">'+esc(n.label)+'</div>'
      +'<div class="rs">'+esc(n.sub||'')+'</div></div>'+right+kill+'</div>';
  }).join('');

  var addRow='';
  if(edit){
    addRow = sprAdding
      ? '<div style="padding:11px 15px;border-top:1px solid var(--line)">'
        +'<div class="fld"><span class="fl">Tip name</span><input class="inv-in" id="spr-n-label" placeholder="Green TeeJet" style="max-width:190px"></div>'
        +'<div class="fld"><span class="fl">On which rig</span><input class="inv-in" id="spr-n-sub" placeholder="John Deere" style="max-width:190px"></div>'
        +'<div class="fld" style="border-bottom:none"><span class="fl">Output (gal/1000 ft²)</span><input class="inv-in" id="spr-n-rate" inputmode="decimal" placeholder="0.91" style="max-width:90px;text-align:right"></div>'
        +'<div style="display:flex;gap:8px;margin-top:10px">'
        +'<div class="action tap" data-spr="addsave" style="flex:1">Add this tip</div>'
        +'<div class="action tap" data-spr="addcancel" style="flex:none;background:#e7e9e6;color:#2f3133;padding:0 16px">Cancel</div></div></div>'
      : '<div class="row tap" data-spr="addopen" style="border-bottom:none"><div style="flex:1"><div class="rt">Add a tip</div>'
        +'<div class="rs">For a nozzle that is not on the list yet</div></div>'
        +'<span style="color:#c2c7cd;font-size:18px;flex:none">＋</span></div>';
  }

  var charge = edit
    ? '<div class="fld"><span class="fl">Boom charge</span><input class="inv-in" data-spr-num="charge" value="'+esc(String(BOOM_CHARGE_GAL))+'" inputmode="decimal" style="max-width:76px;text-align:right"><span style="font:700 11px \'Public Sans\';color:var(--muted);margin-left:6px">gal</span></div>'
     +'<div class="fld" style="border-bottom:none"><span class="fl">Only on runs over</span><input class="inv-in" data-spr-num="over" value="'+esc(String(BOOM_CHARGE_OVER_GAL))+'" inputmode="decimal" style="max-width:76px;text-align:right"><span style="font:700 11px \'Public Sans\';color:var(--muted);margin-left:6px">gal</span></div>'
    : '<div class="fld"><span class="fl">Boom charge</span><span class="fv">'+esc(String(BOOM_CHARGE_GAL))+' gal</span></div>'
     +'<div class="fld" style="border-bottom:none"><span class="fl">Only on runs over</span><span class="fv">'+esc(String(BOOM_CHARGE_OVER_GAL))+' gal</span></div>';

  /* The two numbers the weather screen judges the forecast against. Shown here
     rather than on the weather screen because they are a decision about
     spraying, not about the weather. */
  var limits = edit
    ? '<div class="fld"><span class="fl">Hold above</span><input class="inv-in" data-spr-num="wind" value="'+esc(String(WX_SPRAY_WIND))+'" inputmode="decimal"><span class="fv" style="flex:none;padding-left:6px">mph wind</span></div>'
     +'<div class="fld" style="border-bottom:none"><span class="fl">Hold above</span><input class="inv-in" data-spr-num="precip" value="'+esc(String(WX_SPRAY_PRECIP))+'" inputmode="decimal"><span class="fv" style="flex:none;padding-left:6px">% rain</span></div>'
    : '<div class="fld"><span class="fl">Hold above</span><span class="fv">'+esc(String(WX_SPRAY_WIND))+' mph wind</span></div>'
     +'<div class="fld" style="border-bottom:none"><span class="fl">Hold above</span><span class="fv">'+esc(String(WX_SPRAY_PRECIP))+'% rain</span></div>';

  body.innerHTML=
     '<div style="margin:14px 16px 0;padding:11px 13px;border:1px solid var(--line);border-radius:12px">'
    +'<div style="font:800 13px \'Archivo\';color:var(--ink)">These numbers decide what reaches the grass</div>'
    +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:3px;line-height:1.45">'
    +'The mix calculator works every tank off the figures below. Change them when a tip is swapped or '
    +'the rig is re-measured — not to make a single job come out differently. A one-off is the charge box on the mix sheet.</div>'
    +(edit?'':'<div style="font:800 11.5px \'Public Sans\';color:#8a929c;margin-top:7px">Read-only for your role</div>')
    +'</div>'

    +'<div class="sec">Sprayer tips</div>'
    +'<div style="font:600 11.5px \'Public Sans\';color:var(--muted);line-height:1.5;margin:0 20px 8px">'
    +'Output is gallons per 1,000 square feet of ground, measured off the rig — not the gallons-per-minute printed on the tip.</div>'
    +'<div class="list">'+tips+addRow+'</div>'

    +'<div class="sec">Boom charge</div>'
    +'<div style="font:600 11.5px \'Public Sans\';color:var(--muted);line-height:1.5;margin:0 20px 8px">'
    +'Extra water for boom pressure and slope reserve, added to any run that works out bigger than the threshold. '
    +'Product is still mixed for the whole tank, so everything leaving the nozzle stays on label rate.</div>'
    +'<div class="list">'+charge+'</div>'

    +'<div class="sec">When to hold off</div>'
    +'<div style="font:600 11.5px \'Public Sans\';color:var(--muted);line-height:1.5;margin:0 20px 8px">'
    +'What counts as too windy to spray, and how much rain in the forecast means it would only wash off. '
    +'The weather screen and the spray window on the home screens judge the forecast against these. '
    +'They are a decision about spraying, so they are set here rather than there.</div>'
    +'<div class="list">'+limits+'</div>'

    +(sprayIsDefault()
      ? '<div style="font:600 11.5px \'Public Sans\';color:var(--muted);margin:12px 20px 0">These are the built-in numbers.</div>'
      : ('<div class="sec">Changed on this device</div><div class="list">'
         +'<div class="row'+(edit?' tap':'')+'" '+(edit?'data-spr="reset"':'')+' style="border-bottom:none">'
         +'<div style="flex:1"><div class="rt">Restore the built-in numbers</div>'
         +'<div class="rs">'+esc(sprayChangedText())+'</div></div>'
         +(edit?'<span style="color:#c2c7cd;font-size:16px;flex:none">↺</span>':'')+'</div></div>'))
    +'<div style="height:24px"></div>';
}

function sprayChangedText(){
  var d=sprayDiff(), bits=[];
  if(d.nozzles) bits.push('tips');
  if(d.charge!==undefined) bits.push('boom charge');
  if(d.over!==undefined) bits.push('threshold');
  if(d.wind!==undefined) bits.push('wind limit');
  if(d.precip!==undefined) bits.push('rain limit');
  return bits.length?(bits.join(', ')+' differ from the file'):'';
}

/* Rates are committed on blur with the new value named back, so nobody
   changes a chemical rate without seeing what they changed it to. */
document.getElementById('s-spraysettings').addEventListener('change',function(e){
  if(!sprCanEdit()) return;
  var r=e.target.closest('[data-spr-rate]');
  if(r){
    var id=r.getAttribute('data-spr-rate'), n=null;
    for(var i=0;i<SPRAY_NOZZLES.length;i++) if(SPRAY_NOZZLES[i].id===id) n=SPRAY_NOZZLES[i];
    var v=sprNum(r.value);
    if(n===null) return;
    if(v===null||v<SPRAY_MIN_RATE||v>SPRAY_MAX_RATE){
      toast('Output has to be between '+SPRAY_MIN_RATE+' and '+SPRAY_MAX_RATE+' gal/1000 ft²');
      sprRender(); return;
    }
    if(v===n.galM) return;
    n.galM=v; sprayScan(); sprRender();
    toast(n.label+' set to '+v+' gal/1000 ft² ✓');
    return;
  }
  var num=e.target.closest('[data-spr-num]');
  if(num){
    var which=num.getAttribute('data-spr-num'), val=sprNum(num.value);
    if(which==='charge'){
      if(val===null||val<0||val>200){ toast('Boom charge has to be between 0 and 200 gal'); sprRender(); return; }
      if(val===BOOM_CHARGE_GAL) return;
      BOOM_CHARGE_GAL=val; sprayScan(); sprRender(); toast('Boom charge set to '+val+' gal ✓');
    }else if(which==='wind'){
      /* Fenced low as well as high: a limit of 0 would hold every spray
         forever, which reads as the app being broken rather than as a setting. */
      if(val===null||val<1||val>40){ toast('The wind limit has to be between 1 and 40 mph'); sprRender(); return; }
      if(val===WX_SPRAY_WIND) return;
      WX_SPRAY_WIND=val; sprayScan(); sprRender(); toast('Holding above '+val+' mph wind ✓');
    }else if(which==='precip'){
      if(val===null||val<0||val>100){ toast('The rain limit has to be between 0 and 100%'); sprRender(); return; }
      if(val===WX_SPRAY_PRECIP) return;
      WX_SPRAY_PRECIP=val; sprayScan(); sprRender(); toast('Holding above '+val+'% rain ✓');
    }else{
      if(val===null||val<0||val>500){ toast('The threshold has to be between 0 and 500 gal'); sprRender(); return; }
      if(val===BOOM_CHARGE_OVER_GAL) return;
      BOOM_CHARGE_OVER_GAL=val; sprayScan(); sprRender(); toast('Charge now applies over '+val+' gal ✓');
    }
  }
});

document.getElementById('s-spraysettings').addEventListener('click',function(e){
  if(!sprCanEdit()) return;
  var del=e.target.closest('[data-spr-del]');
  if(del){
    var id=del.getAttribute('data-spr-del');
    if(SPRAY_NOZZLES.length<2){ toast('Keep at least one tip'); return; }
    var gone=null;
    for(var i=0;i<SPRAY_NOZZLES.length;i++) if(SPRAY_NOZZLES[i].id===id){ gone=SPRAY_NOZZLES[i]; SPRAY_NOZZLES.splice(i,1); break; }
    if(!gone) return;
    sprayScan(); sprRender();
    /* Jobs already booked against it fall back to the first tip — mixNozzle's
       long-standing behaviour, worth saying out loud here. */
    toast(gone.label+' removed · jobs set to it fall back to '+SPRAY_NOZZLES[0].label);
    return;
  }
  var a=e.target.closest('[data-spr]'); if(!a) return;
  var act=a.getAttribute('data-spr');
  if(act==='addopen'){ sprAdding=true; sprRender(); return; }
  if(act==='addcancel'){ sprAdding=false; sprRender(); return; }
  if(act==='reset'){ sprayResetDefaults(); return; }
  if(act==='addsave'){
    var lb=(document.getElementById('spr-n-label')||{}).value||'';
    var sb=(document.getElementById('spr-n-sub')||{}).value||'';
    var rt=sprNum((document.getElementById('spr-n-rate')||{}).value);
    lb=lb.trim(); sb=sb.trim();
    if(!lb){ toast('Name the tip'); return; }
    if(rt===null||rt<SPRAY_MIN_RATE||rt>SPRAY_MAX_RATE){ toast('Output has to be between '+SPRAY_MIN_RATE+' and '+SPRAY_MAX_RATE+' gal/1000 ft²'); return; }
    var base=lb.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'tip';
    var id2=base, k=2;
    while(SPRAY_NOZZLES.some(function(n){return n.id===id2;})) id2=base+'_'+(k++);
    SPRAY_NOZZLES.push({id:id2,label:lb,sub:sb,galM:rt});
    sprAdding=false; sprayScan(); sprRender();
    toast(lb+' added at '+rt+' gal/1000 ft² ✓');
  }
});


/* Label rates come in per-thousand or per-acre. basis is the ground area the
   rate is quoted against, so product = rate x (area / basis) in every case. */
var MIX_UNITS=[
 {id:'floz_m', label:'fl oz / 1000 ft²', unit:'fl oz', basis:1000,  gal:1/128},
 {id:'oz_m',   label:'oz / 1000 ft²',    unit:'oz',    basis:1000,  gal:null},
 {id:'lb_m',   label:'lb / 1000 ft²',    unit:'lb',    basis:1000,  gal:null},
 {id:'gal_m',  label:'gal / 1000 ft²',   unit:'gal',   basis:1000,  gal:1},
 {id:'floz_ac',label:'fl oz / acre',     unit:'fl oz', basis:43560, gal:1/128},
 {id:'pt_ac',  label:'pt / acre',        unit:'pt',    basis:43560, gal:1/8},
 {id:'qt_ac',  label:'qt / acre',        unit:'qt',    basis:43560, gal:1/4},
 {id:'lb_ac',  label:'lb / acre',        unit:'lb',    basis:43560, gal:null}
];
function mixNozzle(id){ for(var i=0;i<SPRAY_NOZZLES.length;i++){ if(SPRAY_NOZZLES[i].id===id) return SPRAY_NOZZLES[i]; } return SPRAY_NOZZLES[0]; }
function mixUnit(id){ for(var i=0;i<MIX_UNITS.length;i++){ if(MIX_UNITS[i].id===id) return MIX_UNITS[i]; } return MIX_UNITS[0]; }

/* Which tasks get a mix sheet. Boom work only — a backpack is mixed by the
   jug and has no boom to charge. */
function sprayIsBoom(t){
  if(!t) return false;
  var s=((t.type||'')+' '+(t.title||'')).toLowerCase();
  if(!/spray/.test(s)) return false;
  if(/backpack/.test(s)) return false;
  return /boom/.test(s) || t.machine==='e2';
}
function sprayIsPrecise(t){ return !!t && /precise/i.test((t.title||'')+' '+(t.type||'')); }

/* Ground area to spray, read off the farm data so nobody types it twice.
   Alley zones carry their own square footage; plots carry theirs in PLOT_INFO. */
function mixPlotSqft(n){
  if(!n) return 0;
  try{ if(typeof jobIsZone==='function'&&jobIsZone(n)){ var f=jobZoneFeature(n); return (f&&f.properties.sqft)||0; } }catch(e){}
  try{
    var o=(typeof infoObj==='function')?infoObj(n):{};
    var v=parseFloat((''+(o['Area (sq ft)']||'')).replace(/,/g,''));
    return isFinite(v)?v:0;
  }catch(e){ return 0; }
}
function mixAreaAuto(t){
  var pl=[]; try{ pl=taskPlots(t)||[]; }catch(e){ pl=(t&&t.plots)||[]; }
  var sum=0, miss=0;
  pl.forEach(function(p){ var a=mixPlotSqft(p); if(a>0)sum+=a; else miss++; });
  return {sqft:Math.round(sum),plots:pl.length,missing:miss};
}
/* ---- what is in the tank ------------------------------------------------
   A tank is rarely one jug. A fungicide goes out with a wetting agent, a
   herbicide with its adjuvant, and the crew mixes them into the same load in
   one pass. Each product carries its own label rate and its own unit, so the
   sheet holds a LIST and every line is figured against the same tank.
   The old single-product shape (product/rate/unit on the mix itself) is still
   read once and folded into the list, so tasks saved before this survive. */
function mixBlankProduct(){ return {id:null,name:'',rate:'',unit:MIX_UNITS[0].id}; }
function mixProducts(m){
  if(!m.products||!m.products.length){
    m.products=[{id:null,name:m.product||'',rate:m.rate||'',unit:m.unit||MIX_UNITS[0].id}];
  }
  return m.products;
}
/* ---- the tank is filled out of the chem room -----------------------------
   A mix sheet that names a product the farm does not stock is a job that stops
   at the shed door, and it is how a rate ends up recorded against a product
   nobody can trace. So the name is not free text: it is picked out of the
   Inventory page, the sheet carries the item id, and what the row shows is the
   inventory record — active ingredient, what is on the shelf, where it lives.

   Only what can go through a sprayer is offered. Seed, paint and hand tools are
   in inventory too and have no business in a tank. */
var MIX_CATS=['fungicide','herbicide','insecticide','pgr','fert_liq','fert_gran','wetting','misc'];
function mixInvAll(){
  try{ return INVENTORY.filter(function(it){ return MIX_CATS.indexOf(it.cat)>=0; }); }catch(e){ return []; }
}
function mixInvById(id){
  if(!id) return null;
  var a=mixInvAll(); for(var i=0;i<a.length;i++){ if(a[i].id===id) return a[i]; } return null;
}
function mixInvByName(n){
  n=(n||'').trim().toLowerCase(); if(!n) return null;
  var a=mixInvAll(); for(var i=0;i<a.length;i++){ if(a[i].name.toLowerCase()===n) return a[i]; } return null;
}
/* Name first, then active ingredient — the crew calls a product by either. */
function mixInvMatch(q){
  q=(q||'').trim().toLowerCase();
  var a=mixInvAll();
  if(!q) return a.slice(0,8);
  var starts=[],has=[],ai=[];
  a.forEach(function(it){
    var n=it.name.toLowerCase();
    if(n.indexOf(q)===0) starts.push(it);
    else if(n.indexOf(q)>=0) has.push(it);
    else if((it.ai||'').toLowerCase().indexOf(q)>=0) ai.push(it);
  });
  return starts.concat(has,ai).slice(0,8);
}
/* The item a product row points at: the id if one was picked, otherwise an
   exact name match so a typed-out name still resolves. */
function mixProdItem(p){
  if(!p) return null;
  return (p.id?mixInvById(p.id):null)||mixInvByName(p.name);
}
function mixInvQty(it){ return fmt(invQty(it))+' '+it.unit; }
function mixSugHtml(q){
  var list=mixInvMatch(q);
  if(!list.length) return '<div class="none">Nothing in inventory matches — add it on the Inventory page first.</div>';
  return list.map(function(it){
    return '<div class="s" data-invpick="'+it.id+'"><span>'+esc(it.name)
      +(it.ai?' <span style="font-weight:600;color:var(--muted)">· '+esc(it.ai)+'</span>':'')
      +'</span><span class="c">'+esc(mixInvQty(it))+'</span></div>';
  }).join('');
}
/* One line under the name: what was picked, or why it will not do. */
function mixProdInfoHtml(p){
  var it=mixProdItem(p);
  if(it) return '<span class="mx-it">'+esc((it.ai?it.ai+' · ':'')+mixInvQty(it)+' on hand'+(it.loc?' · '+it.loc:''))+'</span>';
  if((p&&p.name||'').trim()) return '<span class="mx-it bad">Not in inventory — pick one from the list</span>';
  return '<span class="mx-it">Type to pick a product from inventory</span>';
}
/* Inventory counts in gallons and pounds; label rates come in fluid ounces and
   pints. Only conversions that are actually the same substance are made —
   anything else returns null and the stock check stays quiet rather than
   comparing two different things. */
function mixToInvQty(total,unit,iu){
  if(total==null||!iu) return null;
  unit=(unit||'').toLowerCase(); iu=(''+iu).toLowerCase();
  if(unit===iu) return total;
  var k={'fl oz>gal':1/128,'fl oz>oz':1,'gal>fl oz':128,'gal>oz':128,
         'pt>gal':1/8,'pt>fl oz':16,'pt>oz':16,'qt>gal':1/4,'qt>fl oz':32,'qt>oz':32,
         'oz>lb':1/16,'lb>oz':16}[unit+'>'+iu];
  return k==null?null:total*k;
}
function mixState(t){
  if(!t.mix) t.mix={nozzle:SPRAY_NOZZLES[0].id,area:'',products:[mixBlankProduct()]};
  mixProducts(t.mix);
  if(!t.mix.nozzle) t.mix.nozzle=SPRAY_NOZZLES[0].id;
  return t.mix;
}
function mixNum(v){ var n=parseFloat((''+(v==null?'':v)).replace(/,/g,'')); return isFinite(n)?n:null; }
/* Square footage is read off a phone in the sun — 560,525 lands, 560525 does not. */
function mixThou(n){ return (''+Math.round(n||0)).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
function mixRound(n,d){ if(n==null)return null; var f=Math.pow(10,d==null?1:d); return Math.round(n*f)/f; }
function mixQty(n,u){
  if(n==null) return '—';
  var s=mixRound(n,n<10?2:1)+' '+u;
  /* Anything past a gallon is easier to pour from a jug than a measure. */
  var m=mixUnit_byUnit(u);
  if(m&&m.gal){ var g=n*m.gal; if(g>=1) s+=' ('+mixRound(g,2)+' gal)'; }
  return s;
}
function mixUnit_byUnit(u){ for(var i=0;i<MIX_UNITS.length;i++){ if(MIX_UNITS[i].unit===u) return MIX_UNITS[i]; } return null; }

function mixCompute(t){
  var m=mixState(t), noz=mixNozzle(m.nozzle), precise=sprayIsPrecise(t);
  var auto=mixAreaAuto(t);
  var override=mixNum(m.area);
  var area=(override!=null&&override>0)?override:auto.sqft;
  var base=noz.galM*area/1000;
  /* 20 gal is the standing rule, not a law: a short run down one side, a tank
     that has to finish on a known volume, a boom already part charged — the
     operator can set the number and everything below it follows. Blank means
     "use the rule". */
  var chargeAuto=(!precise && base>BOOM_CHARGE_OVER_GAL)?BOOM_CHARGE_GAL:0;
  var co=mixNum(m.charge);
  var chargeIsAuto=!(co!=null&&co>=0);
  var charge=chargeIsAuto?chargeAuto:co;
  var tank=base+charge;
  /* The tank sprays more ground than the job covers, so the product that keeps
     every gallon on rate is the product for the tank's worth of ground. */
  var tankArea=noz.galM>0?(tank/noz.galM*1000):0;
  /* Every product is figured against that same tank. Liquids displace water,
     so what is poured in comes off the water figure; a dry product does not. */
  var prodGal=0, any=false, leftover=0;
  var items=mixProducts(m).map(function(p){
    var un=mixUnit(p.unit), rate=mixNum(p.rate);
    var onTarget=(rate!=null)?rate*(area/un.basis):null;
    var total=(rate!=null)?rate*(tankArea/un.basis):null;
    if(total!=null){ any=true; if(un.gal) prodGal+=total*un.gal; leftover+=(total-onTarget); }
    /* What the shelf says, in the shelf's own units, so the job is not sent
       out for more product than the farm has. */
    var it=mixProdItem(p);
    var need=it?mixToInvQty(total,un.unit,it.unit):null;
    return {name:(p.name||'').trim(),un:un,rate:rate,onTarget:onTarget,total:total,
            leftover:(total!=null)?(total-onTarget):null,
            item:it,need:need,short:(need!=null&&it)?(need>invQty(it)+1e-9):false};
  });
  return {noz:noz,precise:precise,auto:auto,area:area,areaIsAuto:!(override!=null&&override>0),
          base:base,charge:charge,chargeAuto:chargeAuto,chargeIsAuto:chargeIsAuto,
          tank:tank,tankArea:tankArea,
          items:items,anyRate:any,leftover:any?leftover:null,
          water:any?Math.max(0,tank-prodGal):null};
}

/* One-line summary that rides onto the Field Log when the task is completed. */
function mixSummaryFor(t){
  if(!sprayIsBoom(t)) return null;
  if(!t.mix) return null;
  var c=mixCompute(t); if(!c.anyRate) return null;
  var got=c.items.filter(function(i){return i.total!=null;});
  function nm(i,n){ return i.name||('Product'+(got.length>1?' '+(n+1):'')); }
  return {productName:got.map(function(i,n){return nm(i,n);}).join(' + '),
          rateText:got.map(function(i){return mixRound(i.rate,2)+' '+i.un.label.replace(/ \/ /,'/');}).join(' · '),
          productText:got.map(function(i){return mixQty(i.total,i.un.unit);}).join(' · '),
          tankText:mixRound(c.tank,1)+' gal',
          line:got.map(function(i,n){return nm(i,n)+' '+mixQty(i.total,i.un.unit);}).join(' + ')
               +' in '+mixRound(c.tank,1)+' gal'
               +' · '+c.noz.label+' ('+c.noz.galM+' gal/M)'
               +(c.charge?' · incl. '+c.charge+' gal boom charge':'')};
}

function mixRow(k,v,strong,last){
  return '<div class="fld"'+(last?' style="border-bottom:none"':'')+'><span class="fl">'+k+'</span>'
    +'<span class="fv"'+(strong?' style="font-weight:800;font-size:14px"':'')+'>'+v+'</span></div>';
}
function mixNote(text,tone){
  var c=tone==='warn'?['#fff4e0','#f0d3a0','#8a5300']:(tone==='bad'?['#fdeceb','#f3c4c0','#a4342b']:['#eef4ff','#cfe0ff','#2456b8']);
  return '<div style="margin:8px 16px 0;background:'+c[0]+';border:1px solid '+c[1]+';border-radius:12px;padding:9px 12px;'
    +'font:600 11px \'Public Sans\';color:'+c[2]+';line-height:1.45">'+text+'</div>';
}
/* Results only — redrawn on every keystroke without rebuilding the inputs, so
   the caret and the keyboard stay where they are. */
function mixResultsHtml(t){
  var m=mixState(t), c=mixCompute(t);
  if(!c.area){
    return mixNote('Pick the plots on this task (or type an area) and the tank works itself out.');
  }
  /* Volume first — it is the number the operator fills the tank to — then what
     goes into that water. Minimum is what the ground actually needs; the charge
     under it is editable, and the tank total follows whatever it is set to.

     The two halves are separate elements on purpose: typing in the charge box
     redraws only the second half, so the caret stays in the box. */
  var out=''
   +'<div class="sec">Tank volume</div>'
   +'<div class="list">'
   +mixRow('Output rate',c.noz.galM+' gal / 1000 ft²')
   +mixRow('Minimum spray volume',mixRound(c.base,1)+' gal')
   +'<div class="fld"><span class="fl">Boom charge · gal '
     +'<span id="mx-chghint" style="color:var(--muted);font-weight:600">('+mixChargeHint(c)+')</span></span>'
     +'<input class="inv-in" id="mx-charge" inputmode="decimal" value="'+esc(m.charge||'')+'" placeholder="'+mixRound(c.chargeAuto,1)+'" style="max-width:90px"></div>'
   +'<div class="fld" style="border-bottom:none"><span class="fl">Tank volume</span>'
     +'<span class="fv" id="mx-tankvol" style="font-weight:800;font-size:14px">'+mixRound(c.tank,1)+' gal</span></div>'
   +'</div>';
  return '<div id="mx-vol">'+out+'</div><div id="mx-tank">'+mixTankHtml(t,c)+'</div>';
}
function mixChargeHint(c){
  if(!c.chargeIsAuto) return 'set by hand';
  if(c.chargeAuto) return 'standard';
  return c.precise?'precise job':'under '+BOOM_CHARGE_OVER_GAL+' gal';
}
/* Everything that follows from the tank: what to pour in, and the warnings. */
function mixTankHtml(t,c){
  c=c||mixCompute(t);
  var out='';
  if(!c.anyRate){
    out+=mixNote('Enter a spray rate above to get the product figures.');
  } else {
    var rows='', n=0, got=c.items.filter(function(i){return i.total!=null;});
    got.forEach(function(i){
      n++;
      var label=i.name||('Product'+(got.length>1?' '+n:''));
      rows+=mixRow(label+(i.item?'<span style="color:var(--muted);font-weight:600"> · '+esc(mixInvQty(i.item))+' on hand</span>':''),
                   mixQty(i.total,i.un.unit),true);
    });
    out+='<div class="sec">Add to the tank</div><div class="list">'
      +rows
      +(c.water!=null?mixRow('Water',mixRound(c.water,1)+' gal',true):'')
      +mixRow('Tank total',mixRound(c.tank,1)+' gal',false,true)
      +'</div>';
    /* Short on the shelf is a problem to find out about at the sheet, not at
       the chem room door with a tank half filled. */
    var shy=got.filter(function(i){return i.short;});
    if(shy.length){
      out+=mixNote('Not enough on hand for this tank — '+shy.map(function(i){
        return esc(i.name)+' needs '+fmt(Math.round(i.need*100)/100)+' '+i.item.unit+', '+mixInvQty(i.item)+' on the shelf';
      }).join('; ')+'.','bad');
    }
    if(c.leftover>0.0001){
      out+=mixNote('Mixed at label strength for the full tank, so every gallon that leaves the nozzle is on rate. '
        +'The '+mixRound(c.tank-c.base,1)+' gal of charge carries the surplus — spray it out on labelled ground or account for it.');
    }
  }
  /* The two ways a job ends up booked under the wrong task. Both are about the
     standing rule, so neither applies once the charge has been set by hand. */
  if(c.chargeIsAuto&&c.precise&&c.tank>BOOM_CHARGE_OVER_GAL){
    out+=mixNote('This is booked as a precise job but the tank works out at '+mixRound(c.tank,1)+' gal — over '+BOOM_CHARGE_OVER_GAL+'. '
      +'Run it as Spray · Pesticide - Boom so the boom gets its charge, or split the ground.','warn');
  }
  if(c.chargeIsAuto&&!c.precise&&c.tank>0&&c.tank<BOOM_CHARGE_OVER_GAL){
    out+=mixNote('Under '+BOOM_CHARGE_OVER_GAL+' gal, so no charge was added. If the leftover cannot go anywhere else, '
      +'book this as Spray · Pesticide - Boom (Precise).','warn');
  }
  if(c.areaIsAuto&&c.auto.missing){
    out+=mixNote(c.auto.missing+' of the '+c.auto.plots+' selected plots have no area on file, so they are not in this total. Type the area to override.','warn');
  }
  return out;
}
/* Unit dropdown and one product card. The same markup serves the assign wizard
   (where Bill writes the plan) and the mix sheet (where the operator works it),
   so a rate typed in one place reads the same in the other. `pfx` keeps the two
   sets of fields apart when both are alive on the page. */
function mixUnitOptions(sel){
  return MIX_UNITS.map(function(u){
    return '<option value="'+u.id+'"'+(sel===u.id?' selected':'')+'>'+esc(u.label)+'</option>';
  }).join('');
}
function mixProductRowsHtml(list,pfx){
  return list.map(function(p,i){
    var many=list.length>1;
    return '<div class="list mx-card" style="margin-bottom:8px">'
     +'<div class="fld" style="border-bottom:none;padding-bottom:4px"><span class="fl">Product'+(many?' '+(i+1):'')+'</span>'
       +'<span class="mx-pw">'
         +'<input class="inv-in" autocomplete="off" data-'+pfx+'name="'+i+'" value="'+esc(p.name||'')+'" placeholder="Search inventory…">'
         +'<div class="fl-sug mx-sug" data-'+pfx+'sug="'+i+'" style="display:none"></div>'
       +'</span>'
       +(many?'<span class="mx-rm tap" data-'+pfx+'rm="'+i+'" title="Remove this product">✕</span>':'')
     +'</div>'
     +'<div class="fld" style="padding-top:0;justify-content:flex-end" data-'+pfx+'inforow="'+i+'">'+mixProdInfoHtml(p)+'</div>'
     +'<div class="fld"><span class="fl">Spray rate</span>'
       +'<input class="inv-in" inputmode="decimal" data-'+pfx+'rate="'+i+'" value="'+esc(p.rate||'')+'" placeholder="e.g. 3.6" style="max-width:90px"></div>'
     +'<div class="fld" style="border-bottom:none"><span class="fl">Rate unit</span>'
       +'<select class="inv-sel" data-'+pfx+'unit="'+i+'">'+mixUnitOptions(p.unit)+'</select></div>'
     +'</div>';
  }).join('');
}
/* ---- the picker ----------------------------------------------------------
   Wired once per container. Nothing here rebuilds the cards: the suggestion
   list, the info line and the input's own value are patched in place, so a
   rate being typed two rows down is never yanked out from under the thumb.
   `getList` hands back whichever product array this container is editing —
   the wizard's pick, or the mix on the open task. */
function mixWireProducts(root,pfx,getList,onLive){
  if(!root||root['_mxwire'+pfx]) return;
  root['_mxwire'+pfx]=1;
  function idx(el,key){ var v=(el&&el.getAttribute)?el.getAttribute('data-'+pfx+key):null; return v==null?null:+v; }
  function q(key,i){ return root.querySelector('[data-'+pfx+key+'="'+i+'"]'); }
  function paint(i,p){ var el=q('inforow',i); if(el) el.innerHTML=mixProdInfoHtml(p); }
  function sug(i,text,open){
    var box=q('sug',i); if(!box) return;
    if(open===false){ box.style.display='none'; return; }
    box.innerHTML=mixSugHtml(text); box.style.display='';
  }
  root.addEventListener('input',function(e){
    var i=idx(e.target,'name'); if(i==null) return;
    var list=getList(); if(!list||!list[i]) return;
    var p=list[i];
    p.name=e.target.value;
    /* Typing away from the picked product drops the link to it — the row is
       only "from inventory" while the name still matches the item. */
    var hit=mixInvByName(p.name);
    p.id=hit?hit.id:null;
    sug(i,p.name,true); paint(i,p); if(onLive) onLive();
  });
  root.addEventListener('focusin',function(e){
    var i=idx(e.target,'name'); if(i==null) return;
    var list=getList(); if(!list||!list[i]) return;
    sug(i,list[i].name,true);
  });
  root.addEventListener('focusout',function(e){
    var i=idx(e.target,'name'); if(i==null) return;
    setTimeout(function(){ sug(i,'',false); },170);
  });
  root.addEventListener('mousedown',function(e){
    var s=e.target.closest?e.target.closest('[data-invpick]'):null; if(!s) return;
    var box=s.closest('[data-'+pfx+'sug]'); if(!box) return;
    e.preventDefault();                       /* keep the field from blurring first */
    var i=+box.getAttribute('data-'+pfx+'sug');
    var it=mixInvById(s.getAttribute('data-invpick'));
    var list=getList(); if(!it||!list||!list[i]) return;
    list[i].id=it.id; list[i].name=it.name;
    var inp=q('name',i); if(inp) inp.value=it.name;
    sug(i,'',false); paint(i,list[i]); if(onLive) onLive();
  });
}
/* Every named row has to resolve to something on the shelf before the job can
   go out. Blank rows are ignored; a boom spray with nothing in the tank is not. */
function mixProductsProblem(list){
  var named=list.filter(function(p){return (p.name||'').trim();});
  if(named.filter(function(p){return !!mixProdItem(p);}).length!==named.length)
    return 'Pick each product from inventory';
  if(!named.length) return 'Add a product from inventory';
  return null;
}
function mixSectionHtml(t){
  if(!sprayIsBoom(t)) return '';
  var m=mixState(t), c=mixCompute(t);
  var nozOpts=SPRAY_NOZZLES.map(function(n){
    return '<option value="'+n.id+'"'+(m.nozzle===n.id?' selected':'')+'>'+esc(n.label)+' · '+n.galM+' gal/M</option>';
  }).join('');
  /* Area comes off the map — the plots on the task already carry their square
     footage — so it arrives filled in and the box is only for overriding it. */
  var areaHint=c.areaIsAuto?('from '+c.auto.plots+' plot'+(c.auto.plots===1?'':'s')):'typed in';
  /* Alley ground auto-fills to the WHOLE zone, which is right for a boom pass
     and wrong for a backpack walking the weeds. Say so where the number is,
     rather than letting someone mix 62 gallons for a spot treatment. */
  var zoneSel=[]; try{ zoneSel=(taskPlots(t)||[]).filter(jobIsZone); }catch(e){}
  var zoneNote=(zoneSel.length&&c.areaIsAuto)
    ? mixNote('Area is the full '+(zoneSel.length===1?jobZoneName(zoneSel[0]):zoneSel.length+' zones')
        +' — right for a boom pass. Spot-treating with a backpack? Type the ground you will actually cover.','warn')
    : '';
  return '<div class="sec">Spray mix'+(c.precise?' · precise':'')+'</div>'
   +'<div class="list">'
   +'<div class="fld"><span class="fl">Nozzle</span><select class="inv-sel" id="mx-noz" style="max-width:200px">'+nozOpts+'</select></div>'
   +'<div class="fld" style="border-bottom:none"><span class="fl">Area · sq ft <span style="color:var(--muted);font-weight:600">('+areaHint+')</span></span>'
     +'<input class="inv-in" id="mx-area" inputmode="decimal" value="'+esc(m.area||(c.auto.sqft?mixThou(c.auto.sqft):''))+'" placeholder="'+mixThou(c.auto.sqft||0)+'" style="max-width:120px"></div>'
   +'</div>'
   +'<div class="sec">Products in the tank</div>'
   +'<div id="mx-prods">'+mixProductRowsHtml(mixProducts(m),'mxp')+'</div>'
   +'<div class="chiprow"><span class="fchip tap" id="mx-addprod">+ Add another product</span></div>'
   +zoneNote
   +'<div id="mx-out">'+mixResultsHtml(t)+'</div>';
}
/* Keep the sheet with the task rather than in a form buffer: whoever opens the
   job next sees the same mix the person who worked it out saw. */
function mixCurrentTask(){
  try{
    var scr=document.querySelector('.screen.active');
    /* The same job is reachable two ways — the detail sheet a manager reads and
       the work screen the operator opens — and both carry the mix. Which task
       is being edited follows whichever screen is up, so the sheet is never
       written against a job the person is not looking at. */
    var id=(scr&&scr.id==='s-taskwork')?workTaskId:tdCur;
    return TASKS.filter(function(x){return x.id===id;})[0]||null;
  }catch(e){ return null; }
}
/* `tank` redraws only what follows the boom-charge box, so typing in that box
   does not rebuild the box itself. Everything else redraws the lot. */
function mixRefresh(which){
  var t=mixCurrentTask(); if(!t) return;
  if(which==='tank'){
    var tk=document.querySelector('.screen.active #mx-tank');
    if(tk){
      var c=mixCompute(t);
      tk.innerHTML=mixTankHtml(t,c);
      /* the two figures above the box that move with it */
      var tv=document.querySelector('.screen.active #mx-tankvol');
      if(tv) tv.textContent=mixRound(c.tank,1)+' gal';
      var hn=document.querySelector('.screen.active #mx-chghint');
      if(hn) hn.textContent='('+mixChargeHint(c)+')';
      return;
    }
  }
  var el=document.querySelector('.screen.active #mx-out'); if(!el) return;
  el.innerHTML=mixResultsHtml(t);
}
/* Adding or dropping a product is the only thing that rebuilds the cards, so
   nothing typed into the others is disturbed. */
function mixProdsRefresh(){
  var t=mixCurrentTask(); if(!t) return;
  var el=document.querySelector('.screen.active #mx-prods'); if(!el) return;
  el.innerHTML=mixProductRowsHtml(mixProducts(mixState(t)),'mxp');
  mixRefresh();
}
(function(){
  var body=document.getElementById('td-body'); if(!body) return;
  function pIdx(el,key){ var v=el&&el.getAttribute&&el.getAttribute('data-mxp'+key); return v==null?null:+v; }
  function read(e){
    var t=mixCurrentTask(); if(!t) return false;
    var m=mixState(t), id=e.target.id, i;
    if(id==='mx-noz'){ m.nozzle=e.target.value; return 'all'; }
    if(id==='mx-area'){ m.area=e.target.value; return 'all'; }
    if(id==='mx-charge'){ m.charge=e.target.value; return 'tank'; }
    if((i=pIdx(e.target,'rate'))!=null){ mixProducts(m)[i].rate=e.target.value; return 'all'; }
    if((i=pIdx(e.target,'unit'))!=null){ mixProducts(m)[i].unit=e.target.value; return 'all'; }
    return false;   /* the name field is the picker's — see mixWireProducts */
  }
  [body,document.getElementById('tw-brief')].forEach(function(el){
    if(!el) return;
    el.addEventListener('input',function(e){ var w=read(e); if(w) mixRefresh(w); });
    el.addEventListener('change',function(e){ var w=read(e); if(w) mixRefresh(w); });
    el.addEventListener('click',function(e){
      var t=mixCurrentTask(); if(!t) return;
      if(e.target.closest('#mx-addprod')){ mixProducts(mixState(t)).push(mixBlankProduct()); mixProdsRefresh(); return; }
      var rm=e.target.closest('[data-mxprm]');
      if(rm){ var list=mixProducts(mixState(t));
        if(list.length>1){ list.splice(+rm.getAttribute('data-mxprm'),1); mixProdsRefresh(); } }
    });
    mixWireProducts(el,'mxp',function(){
      var t=mixCurrentTask(); return t?mixProducts(mixState(t)):null;
    },function(){ mixRefresh(); });
  });
})();

var tdCur=null;   /* task the detail screen is showing — the mix sheet writes to it */
function openTask(id){
 var t=TASKS.find(function(x){return x.id===id;}); if(!t)return;
 tdCur=id;
 var isReq=t.kind==='request'&&!t.assignee;
 var stat = t.status==='done'?'<span class="pill" style="background:#eaf3ea;color:#2f9e4f">✓ Done</span>'
          : isReq?'<span class="pill" style="background:#489FDF;color:#fff">Request</span>'
          : !t.assignee?'<span class="pill" style="background:#489FDF;color:#fff">Unclaimed</span>'
          : '<span class="pill" style="background:#fff4e0;color:#9a5b00">In progress</span>';
 var rows='';
 rows+=fldRow('Task type',t.type);
 rows+=fldRow('Plot / area',t.area);
 if(t.status==='done'){ rows+=fldRow('Completed by',nameOf(t.completedBy)); rows+=fldRow('Time',fmtTime(t.completedAt)||t.completedAt); }
 else if(isReq){ rows+=fldRow('Requested by',reqByLabel(t.requestedBy)); rows+=fldRow('Students needed',t.students||1); }
 else { rows+=fldRow('Assigned to',taskCrewLabel(t)); rows+=fldRow('When',(isFutureTask(t)?'📅 ':'')+(dueLabel(t)||'Today')); }
 /* Who put this job on the list. It was never shown before, and its absence
    is what made five mystery tasks on Dillon's own list unanswerable in
    August 2026 -- the board could say a job was his, and nothing anywhere in
    the app could say where it had come from. */
 rows+=fldRow('Added by',esc(nameOf(t.createdBy)||t.createdBy||'—'));
 rows+=fldRow('↻ Repeat',t.repeat,true);
 var picker= isReq? '<div class="sec">Assign to undergrad</div><div class="chiprow" id="td-people">'+STUDENTS.map(function(s,i){return rosterPill(s,i===0);}).join('')+'</div>':'';
 document.getElementById('td-body').innerHTML=
   '<div class="hdr" style="background:#2f3133;padding:15px 16px;gap:10px"><div class="title" style="color:#fff;font-size:17px;flex:1;line-height:1.15">'+esc(t.title)+'</div>'+stat+'</div>'
  +'<div class="sec">Details</div><div class="list">'+rows+'</div>'
  +(function(){var pl=taskPlots(t);return pl.length?('<div class="sec">Plots · '+plotsSummary(pl)+'</div><div id="tdmap"></div>'):'';})()
  +mixSectionHtml(t)
  +(t.completedNote?'<div class="sec">Completion note</div><div class="list"><div class="fld" style="border-bottom:none;align-items:flex-start"><span class="rs" style="line-height:1.45">'+t.completedNote+'</span></div></div>':'')
  +'<div class="sec">Notes</div><div class="list"><div class="fld" style="border-bottom:none;align-items:flex-start"><span class="rs" style="line-height:1.45">'+(t.desc||'—')+'</span></div></div>'
  +picker;
 var act=document.getElementById('td-actions');
 var main = t.status==='done'?'<div class="action tap" data-reopen="'+t.id+'" style="flex:1;background:#e7e9e6;color:#2f3133">Reopen Task</div>'
          : isReq?'<div class="action tap" data-assign="'+t.id+'" style="flex:1">Assign Task</div>'
          : !t.assignee?'<div class="action tap" data-claim="'+t.id+'" style="flex:1">Claim Task</div>'
          : '<div class="action tap" data-complete="'+t.id+'" style="flex:1">Mark Complete</div>';
 /* Delete belongs HERE, not only on the board, because this screen is the one
    place every task can be opened from -- the board, the map, a home-screen
    widget and the Mine list all end up here. The bin on the board draws on
    other people's rows only, so before this a job on anybody who is not an
    undergrad had no delete anywhere in the app. Same rule as the bin
    (taskCan), same rule the database enforces. */
 var del=taskCan(SESSION.pid,'delete',t)?'<div class="action tap" data-tdel="'+t.id+'" style="flex:1;background:#fdeceb;color:#c0392b">Delete</div>':'';
 act.style.display='flex'; act.style.gap='8px';
 act.innerHTML=main+del;
 var edtBtn=document.getElementById('td-edit');
 if(edtBtn) edtBtn.style.display=(currentRole==='manager'&&!isReq)?'inline-flex':'none';
 show('taskdetail',true);
 /* read-only preview of the ground this task covers */
 if(document.getElementById('tdmap')){
   var tp=taskPlots(t);
   var stp=jobMapEnsure('detail','tdmap');
   if(stp) jobMapDraw(stp,{mode:'work',targets:tp,done:(t.donePlots||[]),fitKey:'td:'+t.id});
 }
}
function plotsSummary(a){
 if(!a||!a.length)return '—';
 /* Mixed plot-and-zone jobs count the zones separately — "CAFS1, CAFS2, AZ06"
    reads as three plots when one of them is an acre and a half of gravel. */
 if(typeof jobIsZone==='function'){
   var z=a.filter(jobIsZone), p=a.filter(function(n){return !jobIsZone(n);});
   if(z.length&&p.length){
     var ac=0; z.forEach(function(id){var f=jobZoneFeature(id); if(f)ac+=f.properties.acres;});
     return p.length+' plot'+(p.length===1?'':'s')+' + '+(z.length===1?jobZoneName(z[0]):z.length+' zones')+' · '+ac.toFixed(1)+' acres';
   }
 }
 /* An alley job is 20 zone codes — "AZ01, AZ02, AZ03 +17 more" tells nobody
    anything, so it reads as the ground it actually covers. */
 if(typeof jobIsZone==='function'&&a.every(jobIsZone)){
   var ac=0; a.forEach(function(z){var f=jobZoneFeature(z); if(f)ac+=f.properties.acres;});
   return a.length+' zones · '+ac.toFixed(1)+' acres';
 }
 return a.length<=6?a.join(', '):(a.slice(0,5).join(', ')+' +'+(a.length-5)+' more');
}
function progressCard(done,total){var pct=total?Math.round(done/total*100):0;return '<div class="progcard"><div class="progtop"><span class="progn">'+done+' of '+total+' done</span><span class="progpct">'+pct+'%</span></div><div class="progbar"><div class="progfill" style="width:'+pct+'%"></div></div></div>';}
function parsePlots(t){if(t.plots&&t.plots.length)return t.plots.slice();var m=(t.area||'').match(/Plots?\s+(.+)/i);if(!m)return [];var out=[];m[1].split(',').forEach(function(part){part=part.trim();var r=part.match(/^(\d+)\s*[–-]\s*(\d+)$/);if(r){for(var i=+r[1];i<=+r[2];i++)out.push(''+i);}else if(/^(\d+)$/.test(part))out.push(part);else if(/^gh/i.test(part))out.push('GH');});return out;}
function nowTime(){var d=new Date(),h=d.getHours(),m=d.getMinutes();return (h%12||12)+':'+(m<10?'0'+m:m)+(h<12?'a':'p');}
var doneSheet=null, doneTaskId=null;
function ensureDoneSheet(){ if(doneSheet)return; doneSheet=document.createElement('div'); doneSheet.id='donesheet'; doneSheet.innerHTML='<div class="ds-back"></div><div class="ds-card"><div class="ds-title">Mark task complete?</div><div class="ds-sub" id="ds-sub"></div><div class="ds-btns"><div class="ds-cancel tap">Cancel</div><div class="ds-confirm tap">Confirm ✓</div></div></div>'; app.appendChild(doneSheet); doneSheet.querySelector('.ds-back').addEventListener('click',closeDoneSheet); doneSheet.querySelector('.ds-cancel').addEventListener('click',closeDoneSheet); doneSheet.querySelector('.ds-confirm').addEventListener('click',function(){completeTask(doneTaskId);}); }
function openDoneSheet(id){ var t=TASKS.find(function(x){return x.id===id;});
 /* Whatever the sheet says went in the tank ends up in the Field Log and in the
    spray record, so a name that is not a product on the farm cannot be signed
    off. A row left blank is fine — a row half typed is not. */
 if(t&&typeof sprayIsBoom==='function'&&sprayIsBoom(t)&&t.mix){
   var bad=mixProducts(t.mix).filter(function(p){ return (p.name||'').trim()&&!mixProdItem(p); });
   if(bad.length){ toast('Pick “'+bad[0].name+'” from inventory first'); return; }
 }
 ensureDoneSheet(); doneTaskId=id; doneSheet.querySelector('#ds-sub').textContent=t?t.title:''; doneSheet.classList.add('show'); }
function closeDoneSheet(){ if(doneSheet)doneSheet.classList.remove('show'); }
function completeTask(id,note){ var t=TASKS.find(function(x){return x.id===id;}); if(!t)return; t.status='done';
 /* Who did the work and who closed the job are not always the same person —
    Bill clears a job an undergrad finished. The log credits the worker and
    keeps the closer beside it, so neither is guessed at later. */
 t.completedBy=t.assignee||SESSION.pid; t.closedBy=SESSION.pid; t.completedAt=isoLocal(new Date()); t.completedNote=note||''; var _flg=flAddFromTask(t); closeDoneSheet(); toast(_flg?'Complete ✓ · logged to Field Log':'Marked complete ✓'); renderBoard(); back(); }
document.getElementById('tb-seg').addEventListener('click',function(e){var sp=e.target.closest('span[data-tab]');if(!sp)return;tbTab=sp.getAttribute('data-tab');renderTasks();});
document.getElementById('s-taskboard').addEventListener('click',function(e){
 var bd=e.target.closest('[data-bday]'); if(bd){boardDay=parseInt(bd.getAttribute('data-bday'),10);renderTasks();return;}
 var bb=e.target.closest('[data-board]'); if(bb){var w=bb.getAttribute('data-board');if(w==='assign'||w==='selftask')go('assign');else if(w==='assignlab')openAssignForm();else if(w==='reqct')openCrewReq();return;}
 var ac=e.target.closest('[data-accept]'); if(ac){acceptCrewReq(ac.getAttribute('data-accept'));return;}
 var gr=e.target.closest('[data-req]'); if(gr){openReqForm(gr.getAttribute('data-req')==='undergrad');return;}
 /* The bin used to splice the array right here and tell nothing else. It now
    goes through deleteTask(), which checks who is asking and sends the removal
    to the shared copy itself -- see the note over that function. */
 var dl=e.target.closest('[data-del]'); if(dl){e.stopPropagation();var did=dl.getAttribute('data-del');var dt=TASKS.find(function(x){return x.id===did;});if(dt){var dn=dt.title;if(deleteTask(did)){toast('Deleted “'+dn+'”');renderBoard();}else toast('You cannot delete this task');}return;}
 var mv=e.target.closest('[data-move]'); if(mv){e.stopPropagation();moveTask(mv.getAttribute('data-id'),mv.getAttribute('data-move'));return;}
 var claim=e.target.closest('[data-claim]');
 if(claim){e.stopPropagation();var t=TASKS.find(function(x){return x.id===claim.getAttribute('data-claim');});if(t){t.assignee=SESSION.pid;toast('Claimed ✓');renderTasks();}return;}
 var st=e.target.closest('[data-start]'); if(st){var sid=st.getAttribute('data-start');var stt=TASKS.find(function(x){return x.id===sid;});if(stt&&worksOnMap(stt.type,stt.title))openTaskWork(sid);else openTask(sid);return;}
 /* SESSION.pid is a roster id, not a function. Calling it threw a TypeError
    out of this handler, so tapping any of your own to-do tasks on the board
    did nothing at all — the row swallowed the tap and never opened. */
 var row=e.target.closest('[data-task]'); if(row){var rid=row.getAttribute('data-task');var rt=TASKS.find(function(x){return x.id===rid;});if(rt&&rt.status==='todo'&&taskIsFor(rt,SESSION.pid)&&worksOnMap(rt.type,rt.title)){openTaskWork(rid);}else{openTask(rid);}return;}
});
document.getElementById('td-actions').addEventListener('click',function(e){
 var c=e.target.closest('[data-complete]'); if(c){openDoneSheet(c.getAttribute('data-complete'));return;}
 var cl=e.target.closest('[data-claim]'); if(cl){var t2=TASKS.find(function(x){return x.id===cl.getAttribute('data-claim');});if(t2){t2.assignee=SESSION.pid;t2.status='todo';toast('Claimed ✓');renderBoard();back();}return;}
 var as=e.target.closest('[data-assign]'); if(as){var t3=TASKS.find(function(x){return x.id===as.getAttribute('data-assign');});if(t3){var sel=document.querySelector('#td-people .ppill.on');var who=sel?sel.getAttribute('data-person'):STUDENTS[0];t3.assignee=who;t3.kind='task';t3.status='todo';toast('Assigned to '+nameOf(who)+' ✓');renderBoard();back();}return;}
 var r=e.target.closest('[data-reopen]'); if(r){var t4=TASKS.find(function(x){return x.id===r.getAttribute('data-reopen');});if(t4){t4.status='todo';t4.completedBy=null;toast('Task reopened');renderBoard();back();}return;}
 /* Asks first, like the Field Log's Delete does, and for the same reason: this
    takes the job off everybody's board, not just this phone's. */
 var dd=e.target.closest('[data-tdel]');
 if(dd){
   var t5=TASKS.find(function(x){return x.id===dd.getAttribute('data-tdel');}); if(!t5)return;
   if(!confirm('Delete “'+t5.title+'”?\n\nThis removes the job from everybody\'s board, for good — there is no undo.')) return;
   var dn5=t5.title;
   if(deleteTask(t5.id)){ toast('Deleted “'+dn5+'”'); renderBoard(); back(); }
   else toast('You cannot delete this task');
   return;
 }
});
document.getElementById('td-body').addEventListener('click',function(e){var p=e.target.closest('#td-people [data-person]');if(!p)return;document.querySelectorAll('#td-people .ppill').forEach(function(x){x.classList.remove('on');});p.classList.add('on');});
document.getElementById('td-edit').addEventListener('click',function(){if(tdCur)openEditTask(tdCur);});
/* ---- Undergrad task work mode (check plots off) ---- */
var workTaskId=null;
function openTaskWork(id){var t=TASKS.find(function(x){return x.id===id;});if(!t)return;if(!t.donePlots)t.donePlots=[];workTaskId=id;
 /* Notes first when there are any — otherwise straight to the map. A boom
    spray always opens on the brief: the tank has to be mixed before anyone
    drives anywhere, and the mix sheet lives there. */
 twBrief=!!(t.desc&&t.desc.trim())||(typeof sprayIsBoom==='function'&&sprayIsBoom(t));
 go('taskwork');}
/* Plots a task covers -- the ground THIS assignment is on, which is not the
   same question the plot picker asks.

   jobPlots() answers "what could a job like this cover?", and for a mow job
   that is every plot booked on the machine. Handing that same answer to the
   undergrad is what put fairways on his phone that Bill had deliberately left
   unpicked on Friday: the three plots saved on the task were passed in as a
   fallback, and a fallback is only read when nothing else matched. So the
   selection was thrown away every time the machine had ground of its own --
   mow jobs, alley jobs and border jobs, silently, on the work map, the task
   detail map and the progress count.

   Picked ground wins. A task saved with no plots at all still falls through to
   the machine's ground, which is the "mow the lot" case and stays as it was. */
function taskPlots(t){
  if(jobIsTrialDots(t.type,t.title)) return [];
  var picked=parsePlots(t);
  /* Dropping plots that are no longer on the map, rather than falling back to
     the whole machine, keeps this in step with jobNoGround(): a job whose
     ground has vanished says so instead of quietly growing. */
  if(picked.length) return jobRealPlots(picked);
  return jobPlots(t.type,t.title,picked);
}
function taskOpenPlots(t){ return taskPlots(t).filter(function(n){ return jobRes(n,t.type,t.title).full.length===0; }); }
/* ---- The brief -----------------------------------------------------------
   A job with notes opens on them, not on the map: the crew reads what Bill
   wrote and what ground is closed, then taps through to the map to work it. */
function twRestrictionLines(t){
  if(jobIsTrialDots(t.type,t.title)) return [];
  var out=[];
  taskPlots(t).forEach(function(n){
    var r=jobRes(n,t.type,t.title);
    r.full.concat(r.pin).forEach(function(x){
      var rt=trRType(x.r.type);
      out.push({plot:n,ab:rt.ab,c:rt.c,label:rt.label,
                extent:trResExtentText(x.t,x.r),study:x.t.title,note:x.r.note,end:x.r.end});
    });
  });
  return out;
}
function renderTaskBrief(t){
  var el=document.getElementById('tw-brief'); if(!el)return;
  var h='';
  h+='<div class="sec">The job</div><div class="list"><div class="row" style="align-items:flex-start">'
   +'<div style="flex:1"><div class="rt">'+esc(t.title)+'</div>'
   +'<div class="rs">'+esc(t.area||'—')+(dueLabel(t)?(' · '+esc(dueLabel(t))):'')+'</div></div>'
   +'</div></div>';
  var mach=(t.machine&&typeof EQUIP!=='undefined')?EQUIP.filter(function(e){return e.id===t.machine;})[0]:null;
  if(mach) h+='<div class="sec">Equipment</div><div class="list"><div class="row"><div style="flex:1">'
   +'<div class="rt">'+esc(mach.name)+'</div><div class="rs">'+esc(mach.location||'')+'</div></div></div></div>';
  if(t.desc) h+='<div class="sec">Notes</div><div class="list"><div class="row"><div class="rt" style="font-weight:700;line-height:1.5;white-space:pre-wrap">'+esc(t.desc)+'</div></div></div>';
  var res=twRestrictionLines(t);
  if(res.length){
    h+='<div class="sec">Restrictions on this job</div><div class="list">';
    res.forEach(function(r){
      h+='<div class="row" style="align-items:flex-start">'
       +'<span class="tr-resic" style="background:'+r.c+'">'+esc(r.ab)+'</span>'
       +'<div style="flex:1"><div class="rt">'+esc(r.plot)+' · '+esc(r.label)+'</div>'
       +'<div class="rs">'+esc(r.extent)+' · through '+trFmt(r.end)+'</div>'
       +(r.note?'<div class="rs" style="margin-top:3px">'+esc(r.note)+'</div>':'')
       +'</div></div>';
    });
    h+='</div>';
  }
  /* On a boom spray the mix IS the brief — it is what gets loaded before the
     rig moves — so it sits here rather than only on the manager's sheet. */
  h+=mixSectionHtml(t);
  h+='<div class="sec" style="text-align:center;color:var(--muted)">Read it, then open the map to work the job.</div>';
  el.innerHTML=h;
}
var twBrief=false;
/* ---- The live work session ----------------------------------------------
   While someone has a job open the screen holds a GPS session: the dot, the
   restriction footprints for that job, the breadcrumb paint, and a
   subscription to what everyone else on the task is doing. All of it is torn
   down on the way out (see show()), so nothing keeps watching the satellites
   after the person has moved on. */
var TW={dot:null,cov:null,res:null,onFix:null,onCrew:null,me:true,track:true,taskId:null,held:false,lastPaint:0,lastCheck:0,map:null};

/* ---- locate control, work map ----
   Same three-state button the farm map uses, so finding yourself works the same
   way on both screens. The difference is what it controls: the work map already
   holds a GPS watch for coverage tracking, so this only decides whether the dot
   is drawn and whether the map follows it. Turning it off does not stop the
   coverage painting underneath. */
function twLocatePaint(){
  var b=document.getElementById('tw-locate'); if(!b) return;
  b.classList.remove('on','lock','seek','dead');
  if(GEO.err&&GEO.err!=='timeout'){ b.classList.add('dead'); return; }
  if(!TW.me) return;
  if(!GEO.pos||geoPaused()){ b.classList.add('seek'); return; }
  b.classList.add(GEO.follow?'lock':'on');
}

document.addEventListener('click',function(e){
  if(!e.target.closest||!e.target.closest('#tw-locate')) return;
  if(GEO.err&&GEO.err!=='timeout'){ toast(geoErrText()); twLocatePaint(); return; }

  if(TW.me&&GEO.follow){                       /* locked -> off */
    TW.me=false;
    if(TW.dot){ TW.dot.remove(); TW.dot=null; }
    GEO.follow=false;
  }else{                                       /* off, or panned away -> lock on */
    TW.me=true; GEO.follow=true;
    if(!TW.dot&&TW.map) TW.dot=geoDot(TW.map,{follow:true});
    var ll=geoLatLng();
    if(ll&&TW.map){ try{ TW.map.setView(ll,Math.max(TW.map.getZoom(),19)); }catch(err){} }
    else if(!ll) toast('Finding you…');
  }
  twLocatePaint();
},true);
var TW_PAINT_MS=2500;    /* how often the painted coverage is redrawn */
var TW_CHECK_MS=6000;    /* how often zones are re-measured for auto-complete */

function twStop(){
  if(TW.onFix){ geoOff(TW.onFix); TW.onFix=null; }
  if(TW.onCrew){ crewOff(TW.onCrew); TW.onCrew=null; }
  if(TW.dot){ TW.dot.remove(); TW.dot=null; }
  if(TW.cov){ TW.cov.remove(); TW.cov=null; }
  if(TW.res){ TW.res.remove(); TW.res=null; }
  TW.map=null;
  crewHeartbeat(null,false);
  proxSetTask(null);
  /* Hand back anything claimed but not finished, so the next person is not
     locked out of ground that has been walked away from. */
  if(TW.taskId){ var me=SESSION.pid; var db=crewLoad(), t=db[TW.taskId];
    if(t&&t.claims){ var ch=false;
      Object.keys(t.claims).forEach(function(u){ if(t.claims[u].who===me){ delete t.claims[u]; ch=true; } });
      if(ch) crewSend(db); } }
  TW.taskId=null;
  if(TW.held){ TW.held=false; geoRelease(); }
}

/* Start (or re-attach) the session for the task on screen. */
function twStart(t,st){
  if(!t||!st) return;
  TW.taskId=t.id;
  proxSetTask(t);
  crewHeartbeat(t.id,true);
  covFor(t.id,covDeckFt(t));
  /* Tell the watch how precise this job actually needs to be before opening it,
     so a greens mow never pays for alley-grade accuracy. */
  geoWant(gpsProfileFor(t));
  if(!TW.held){ TW.held=true; geoAcquire(); }

  if(TW.res){ TW.res.remove(); TW.res=null; }
  TW.res=proxLayer(st.map,t);

  /* The locate button needs a map to recentre, and it lives outside this scope. */
  TW.map=st.map;
  /* Dragging breaks the lock without hiding the dot, same as the farm map. */
  if(!st._twDrag){ st._twDrag=true; try{ st.map.on('dragstart',function(){
    if(TW.me&&GEO.follow){ GEO.follow=false; twLocatePaint(); }
  }); }catch(e){} }

  if(TW.me && !TW.dot){ GEO.follow=true; TW.dot=geoDot(st.map,{follow:true}); }
  if(TW.track && !TW.cov) TW.cov=covLayer(st.map,t.id);
  twLocatePaint();

  if(!TW.onFix){
    /* Every fix is recorded, but the expensive work is throttled. Buffering
       the track and intersecting twenty polygons on each of ~3600 fixes an
       hour would cook the phone; once every few seconds is well inside what a
       mower can cover anyway. */
    TW.onFix=function(pos){
      if(!pos||!TW.track||TW.taskId!==t.id) return;
      if(!covPush(t.id,pos)) return;
      var now=Date.now();
      if(now-(TW.lastPaint||0)>=TW_PAINT_MS){ TW.lastPaint=now; if(TW.cov) TW.cov.redraw(); }
      if(now-(TW.lastCheck||0)<TW_CHECK_MS) return;
      TW.lastCheck=now;
      /* Only zones can be auto-completed. A plot is either mown or not, and a
         breadcrumb through the middle of one proves nothing. */
      var zones=taskPlots(t).filter(jobIsZone);
      if(!zones.length) return;
      var crossed=covRecalc(t.id,zones);
      crossed.forEach(function(z){
        if(t.donePlots.indexOf(z)<0){
          t.donePlots.push(z);
          crewComplete(t.id,z,SESSION.pid,'gps');
          toast(jobZoneName(z)+' covered ✓');
        }
      });
      if(crossed.length) renderTaskWork();
    };
    geoOn(TW.onFix);
  }
  if(!TW.onCrew){ TW.onCrew=function(){ renderTaskWork(); }; crewOn(TW.onCrew); }
}

/* The row under the chips: who else is on this job and what they hold. */
function twCrewRow(t){
  var el=document.getElementById('tw-crew'); if(!el) return;
  var others=crewOthers(t.id);
  var mineHeld=[]; var me=SESSION.pid;
  var db=crewLoad(), rec=db[t.id];
  if(rec&&rec.claims) Object.keys(rec.claims).forEach(function(u){ if(rec.claims[u].who===me) mineHeld.push(u); });
  if(!others.length && !mineHeld.length){ el.style.display='none'; return; }
  var h='<div class="list" style="margin:0">';
  if(mineHeld.length){
    h+='<div class="row"><span class="tr-resic" style="color:#fff;background:'+crewColor(me)+'">'+esc(initOf(me))+'</span>'
      +'<div style="flex:1"><div class="rt">You</div><div class="rs">on '+esc(mineHeld.map(jobZoneName).join(', '))+'</div></div></div>';
  }
  others.forEach(function(o){
    h+='<div class="row"><span class="tr-resic" style="color:#fff;background:'+crewColor(o.who)+'">'+esc(initOf(o.who))+'</span>'
      +'<div style="flex:1"><div class="rt">'+esc(nameOf(o.who))+'</div><div class="rs">on '+esc(o.units.map(jobZoneName).join(', '))+'</div></div></div>';
  });
  el.innerHTML=h+'</div>';
  el.style.display='';
}

/* ---- who has what, on a job worked by more than one person ---------------
   Zone jobs (the alleys, and the gravel on a spray) hand each piece of ground
   to one person at a time so nobody mows a strip twice. That means "not
   finished" and "not finishable by me" are different states, and the finish
   button has to tell them apart -- before 2026-08-30 it did not, and a person
   whose remaining ground was all held by somebody else got "Check off every
   plot first" with no way to act on it and no way to close the job. */
function twSplit(t){
  var open=taskOpenPlots(t), me=SESSION.pid;
  var done=[], held=[], free=[];
  open.forEach(function(u){
    if(t.donePlots.indexOf(u)>=0 || crewDoneBy(t.id,u)){ done.push(u); return; }
    var c=crewClaim(t.id,u);
    if(c && c.who!==me){ held.push({unit:u,who:c.who}); return; }
    free.push(u);
  });
  /* What THIS person finished, which is what they can hand in. The shared
     record knows who did each one; ground ticked before that record existed
     falls back to what is on this phone. */
  var mine=done.filter(function(u){
    var d=crewDoneBy(t.id,u);
    return d?(d.who===me):(t.donePlots.indexOf(u)>=0);
  });
  return {open:open,done:done,held:held,free:free,mine:mine};
}

/* Hand in the ground this person finished and leave the job open for whoever
   is still out on the rest. Their zones go on the Field Log under their own
   name; the task keeps its 'todo' status because it is genuinely not done. */
function twHandIn(t,sp){
  var n=(typeof flAddPartFromTask==='function')?flAddPartFromTask(t,sp.mine):0;
  toast(n?('Your part is in the Field Log \u2713 \u00b7 job stays open')
         :'Nothing new to hand in');
  try{ renderBoard(); }catch(e){}
  /* back() runs show(), and show() calls twStop() -- which hands back anything
     still claimed, so walking away never locks ground behind you. */
  back();
}

function renderTaskWork(){
 var t=TASKS.find(function(x){return x.id===workTaskId;}); if(!t)return;
 if(!t.donePlots)t.donePlots=[];
 document.getElementById('tw-title').textContent=t.title;
 var brief=document.getElementById('tw-brief'),wrap=document.getElementById('tw-mapwrap'),chips=document.getElementById('tw-chips');
 if(twBrief){
   renderTaskBrief(t);
   if(brief)brief.style.display='block';
   if(wrap)wrap.style.display='none';
   if(chips)chips.style.display='none';
   var bb=document.getElementById('tw-complete');
   bb.textContent='Open the map ›'; bb.style.background='var(--acc)'; bb.style.opacity='1';
   return;
 }
 if(brief)brief.style.display='none';
 if(wrap)wrap.style.display='';
 if(chips)chips.style.display='';
 var hintEl=document.getElementById('tw-hint');
 /* Trial dots: the targets are the studies, not the plots. Every active trial
    is drawn — footprint and pin — and each one gets ticked off as its dots go
    down, so the job is only finished when no study was missed. */
 if(jobIsTrialDots(t.type,t.title)){
   if(!t.doneTrials)t.doneTrials=[];
   var trials=jobActiveTrials(), ids=trials.map(function(x){return x.id;});
   t.doneTrials=t.doneTrials.filter(function(id){return ids.indexOf(id)>=0;});
   var dn0=t.doneTrials.length;
   var kEl0=document.getElementById('tw-kind'); if(kEl0)kEl0.textContent='Active trials';
   document.getElementById('tw-progress').textContent=dn0+' / '+trials.length+' dotted';
   if(hintEl)hintEl.textContent='Tap each trial when its dots are down · tap again to undo';
   var st0=jobMapEnsure('work','twmap');
   jobMapDraw(st0,{mode:'work',targets:[],trials:true,doneTrials:t.doneTrials,fitKey:'tw:'+t.id,
     onTrialTap:function(id){
       var i=t.doneTrials.indexOf(id), tr=trials.filter(function(x){return x.id===id;})[0];
       if(i>=0){t.doneTrials.splice(i,1); toast((tr?tr.title:'Trial')+' unchecked');}
       else {t.doneTrials.push(id); toast((tr?tr.title:'Trial')+' dotted ✓');}
       renderTaskWork();
     }});
   var b0=document.getElementById('tw-complete');
   if(dn0>=trials.length){b0.textContent=trials.length?'Finish — all trials dotted ✓':'Complete task';b0.style.background='#2f9e4f';}
   else{b0.textContent='Check off every trial to finish ('+dn0+'/'+trials.length+')';b0.style.background='#c2c7cd';}
   b0.style.opacity='1';
   return;
 }
 var plots=taskPlots(t), open=taskOpenPlots(t);
 var shut=plots.length-open.length;
 /* Zones finished by anyone on this task count towards the job, not just the
    ones this phone ticked — that is the whole point of sharing the map. */
 crewDoneList(t.id).forEach(function(u){ if(t.donePlots.indexOf(u)<0 && open.indexOf(u)>=0) t.donePlots.push(u); });
 var done=t.donePlots.filter(function(p){return open.indexOf(p)>=0;}).length;
 var zoneJob=plots.length&&plots.every(jobIsZone);
 var kEl=document.getElementById('tw-kind'); if(kEl)kEl.textContent=zoneJob?'Zones':(jobKindLabel(t.type,t.title)||'Plots');
 document.getElementById('tw-progress').textContent=done+' / '+open.length+' done'+(shut?(' · '+shut+' restricted'):'');
 if(hintEl){ var hc=jobResCfg(t.type,t.title);
   hintEl.textContent=zoneJob
     ? 'Tap a zone to take it · it paints itself as you mow'
     : ('Tap a plot when you finish it'+(hc?(' · red ground is closed to '+hc.ing):'')); }
 var st=jobMapEnsure('work','twmap');
 twStart(t,st);
 twCrewRow(t);
 twLocatePaint();
 var trChip=document.getElementById('tw-track'); if(trChip){ trChip.classList.toggle('on',!!TW.track); trChip.style.display=zoneJob?'':'none'; }
 jobMapDraw(st,{mode:'work',targets:plots,done:t.donePlots,fitKey:'tw:'+t.id,jobType:t.type,jobName:t.title,taskId:t.id,onTap:function(n,info){
   if(info.blocked){ toast(resStopMsg(info,n)); return; }
   if(info.partial) toast(resAroundMsg(info,n));
   /* A zone tap is a claim first and a check-off second: first tap takes the
      ground so nobody else starts it, second tap says it is finished. */
   if(info.zone){
     if(info.taken){ toast(nameOf(info.claim.who)+' is on '+jobZoneName(n)); return; }
     var i=t.donePlots.indexOf(n);
     if(i>=0){ t.donePlots.splice(i,1); crewUncomplete(t.id,n); toast(jobZoneName(n)+' reopened'); }
     else if(crewClaim(t.id,n)){ t.donePlots.push(n); crewComplete(t.id,n,SESSION.pid,'tap'); toast(jobZoneName(n)+' done ✓'); }
     else {
       var r=crewTake(t.id,n);
       if(!r.ok){ toast(nameOf(r.by)+' just took '+jobZoneName(n)); }
       else toast('You have '+jobZoneName(n)+' · tap again when it is done');
     }
     renderTaskWork(); return;
   }
   jobTapSelect(t.donePlots,n,info);
   renderTaskWork();
 }});
 var btn=document.getElementById('tw-complete');
 var allDone=(open.length===0)||(done>=open.length);
 var unit=zoneJob?'zones':'plots';
 btn.style.opacity='1';

 /* A job with no ground on it at all. This is the state a renamed or deleted
    mower used to produce: every plot drawn grey, nothing to tap, "0 / 0 done"
    and a green Complete button that would close the job and file a Field Log
    entry for work nobody did. Say what is wrong and refuse instead. */
 var noGround=(typeof jobNoGround==='function')?jobNoGround(t.type,t.title,parsePlots(t)):'';
 if(noGround){
   if(hintEl) hintEl.textContent=noGround;
   /* jobKindLabel falls back to "All mowers" when it cannot name a machine,
      which on an empty job reads as though the whole farm is in scope. */
   if(kEl) kEl.textContent='No ground';
   btn.textContent='Nothing to check off — tell Bill';
   btn.style.background='#c2c7cd';
   return;
 }

 if(allDone){
   btn.textContent=open.length?('Finish — all '+unit+' done ✓'):'Complete task';
   btn.style.background='#2f9e4f';
   return;
 }

 /* Nothing left that this person is allowed to take: everything still open is
    in somebody else's hands. Offer the honest thing rather than a button that
    refuses. twCrewRow above already names who is on what. */
 var sp=twSplit(t);
 if(!sp.free.length && sp.held.length){
   if(sp.mine.length){
     btn.textContent='Hand in my part ('+sp.mine.length+' '+(sp.mine.length===1?unit.replace(/s$/,''):unit)+') ›';
     btn.style.background='var(--acc)';
   } else {
     btn.textContent='Nothing free right now · back to tasks';
     btn.style.background='#c2c7cd';
   }
   return;
 }

 btn.textContent='Check off all '+unit+' to finish ('+done+'/'+open.length+')';
 btn.style.background='#c2c7cd';
}
document.getElementById('s-taskwork').addEventListener('click',function(e){
 var tc=e.target.closest('[data-twchip]');
 if(tc){
   var k=tc.getAttribute('data-twchip'), wt=TASKS.find(function(x){return x.id===workTaskId;});
   if(k==='track'){
     TW.track=!TW.track;
     if(!TW.track){ if(TW.cov){TW.cov.remove();TW.cov=null;} toast('Coverage tracking off · tap zones to check them off'); }
     else toast('Coverage tracking on');
   }
   if(wt) renderTaskWork();
   return;
 }
 if(e.target.closest('#tw-complete')){
   if(twBrief){ twBrief=false; renderTaskWork(); return; }
   var ct=TASKS.find(function(x){return x.id===workTaskId;});
   if(ct&&jobIsTrialDots(ct.type,ct.title)){
     var tr=jobActiveTrials(),td=(ct.doneTrials||[]).length;
     if(td<tr.length){toast('Tap every trial pin first');return;}
     openDoneSheet(workTaskId);return;
   }
   if(!ct) return;
   /* A job with no ground on it must not be closeable -- it would file a Field
      Log entry for work nobody did. Say why instead. */
   var ng=(typeof jobNoGround==='function')?jobNoGround(ct.type,ct.title,parsePlots(ct)):'';
   if(ng){ toast(ng); return; }
   var sp=twSplit(ct);
   var zoneJob=sp.open.length&&sp.open.every(jobIsZone);
   var word=zoneJob?'zone':'plot';
   if(sp.open.length && sp.done.length<sp.open.length){
     /* Everything left is in somebody else's hands. Two honest outcomes: hand
        in what this person finished, or -- with nothing of their own to hand
        in -- get them back to the board instead of stranding them here. This
        used to be one flat "Check off every plot first" that could not be
        acted on, which is how a crew ended up stuck on the alleys job unable
        to move to the next task. */
     if(!sp.free.length && sp.held.length){
       if(sp.mine.length){ twHandIn(ct,sp); return; }
       var who=nameOf(sp.held[0].who)||'somebody else';
       toast('Every '+word+' is with '+who+' right now');
       back(); return;
     }
     toast('Check off every '+word+' first'); return;
   }
   openDoneSheet(workTaskId);return;}
});
document.querySelectorAll('.hdr').forEach(function(h){var f=h.firstElementChild;if(f&&f.textContent.trim()==='‹'){f.classList.add('backbtn','tap');}});

/* ================= INVENTORY MODULE ================= */
var CAT=[
 {k:'fungicide', label:'Fungicides',            emoji:'🍄', res:'FRAC'},
 {k:'herbicide', label:'Herbicides',            emoji:'🌿', res:'HRAC'},
 {k:'insecticide',label:'Insecticides',         emoji:'🐛', res:'IRAC'},
 {k:'pgr',       label:'Growth regulators',     emoji:'✂️', res:null},
 {k:'fert_gran', label:'Fertilizer · Granular', emoji:'🌾', res:null},
 {k:'fert_liq',  label:'Fertilizer · Liquid',   emoji:'💧', res:null},
 {k:'wetting',   label:'Wetting agents',        emoji:'🫧', res:null},
 {k:'seed',      label:'Seed',                  emoji:'🌱', res:null},
 {k:'paint_can', label:'Paint · Cans',          emoji:'🎨', res:null},
 {k:'paint_liq', label:'Paint · Liquid',        emoji:'🪣', res:null},
 {k:'test_equip',label:'Testing equipment',     res:null},
 {k:'tools',     label:'Tools',                 res:null},
 {k:'misc',      label:'Miscellaneous',         res:null}
];
function catMeta(k){return CAT.find(function(c){return c.k===k;})||{k:k,label:k,emoji:'📦',res:null};}
var INVENTORY=[
 /* Built by tools/build-inventory.py from
    reference/Inventory of Cages_Bulk Materials.xlsx (the April count).
    Re-run that script after editing the sheet; do not hand-edit this block.

    One entry per PRODUCT. `containers` holds each physical size the farm has
    of it — a 2018 2.5-gallon jug is not the same thing as a 2025 1-gallon one,
    so they stay separate lines with their own year and cage.

    `qty` counts CONTAINERS, not volume: 1 = a full jug, 0.5 = a half one.
    The sheet's own wording is kept in `src` so a recount can be checked
    against what April actually said. Quantities are April's and are expected
    to be wrong by now — they are a starting point to correct, not a truth. */
 {id:'i1', name:'0-0-22/ Mayo Fert', ai:'', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:200,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:4, year:null, loc:'Barn', cage:'', src:'4 bags'}]},
 {id:'i2', name:'17-17-17', ai:'', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:300,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:6, year:null, loc:'Barn', cage:'', src:'6 Bags'}]},
 {id:'i3', name:'26GT', ai:'Iprodione', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:'2018', loc:'Cage', cage:'2', src:'Half'}]},
 {id:'i4', name:'Accord XRT', ai:'glyphosate', cat:'herbicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:2, year:null, loc:'Cage', cage:'3', src:'2 Full'}]},
 {id:'i5', name:'Acelepryn', ai:'Chloramtraniliprole', cat:'insecticide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:3,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:3, year:'2020', loc:'Cage', cage:'3', src:'3 Full'}]},
 {id:'i6', name:'Advion', ai:'Indoxacarb', cat:'insecticide', form:'Granular', thr:0, csize:1, unit:'lb', ctype:'bag', qty:1,
  containers:[
   {csize:1, unit:'lb', ctype:'bag', qty:1, year:'2019', loc:'Cage', cage:'3', src:'1 Full'}]},
 {id:'i7', name:'Akron', ai:'Purimisulfan', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:3.75,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.5, year:null, loc:'Cage', cage:'3', src:'1 Full 1 partial'}]},
 {id:'i8', name:'Aliette', ai:'Aluminum tris', cat:'fungicide', form:'Liquid', thr:0, csize:5, unit:'lb', ctype:'bag', qty:10,
  containers:[
   {csize:5, unit:'lb', ctype:'bag', qty:2, year:'2026', loc:'Cage', cage:'2', src:'2 Full'}]},
 {id:'i9', name:'Aloft LCSC', ai:'clothianidin + bifenthrin', cat:'insecticide', form:'Liquid', thr:0, csize:64, unit:'oz', ctype:'bottle', qty:64,
  containers:[
   {csize:64, unit:'oz', ctype:'bottle', qty:1, year:null, loc:'Cage', cage:'3', src:'Full'}]},
 {id:'i10', name:'Anderson\'s Crab/Goose', ai:'Bensulide + Oxadiazon', cat:'herbicide', form:'Granular', thr:0, csize:28.7, unit:'lb', ctype:'bag', qty:229.6,
  containers:[
   {csize:28.7, unit:'lb', ctype:'bag', qty:8, year:null, loc:'Cage', cage:'', src:'8 Full'}]},
 {id:'i11', name:'Appear II', ai:'Potassium Phosphite', cat:'fungicide', form:'Liquid', thr:0, csize:7, unit:'gal', ctype:'jug', qty:23,
  containers:[
   {csize:7, unit:'gal', ctype:'jug', qty:1, year:'<2017', loc:'Cage', cage:'2', src:'7 gal'},
   {csize:2, unit:'gal', ctype:'jug', qty:8, year:'<2018', loc:'Cage', cage:'2', src:'8 Full'}]},
 {id:'i12', name:'Armada', ai:'Trifloxistrobin', cat:'fungicide', form:'WG', thr:0, csize:8, unit:'lb', ctype:'bag', qty:8,
  containers:[
   {csize:8, unit:'lb', ctype:'bag', qty:1, year:'<2017', loc:'Cage', cage:'2', src:'8 lbs'}]},
 {id:'i13', name:'Avenue South', ai:'24D+Dicamba+Penoxsulam+Sulfentrazone', cat:'herbicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:2, year:'2022', loc:'Cage', cage:'3', src:'2 Full'}]},
 {id:'i14', name:'Barricade 4FL', ai:'Prodiamine', cat:'herbicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:4,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:4, year:'<2017', loc:'Cage', cage:'3', src:'4 full'}]},
 {id:'i15', name:'Basamid G', ai:'Dazomet', cat:'herbicide', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:25,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:0.5, year:null, loc:'Cage', cage:'', src:'1 Half'}]},
 {id:'i16', name:'Bayleton', ai:'Triadimefon', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:10,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:4, year:'2018', loc:'Cage', cage:'2', src:'4 Full'}]},
 {id:'i17', name:'Bensumec 4', ai:'Bensulfide', cat:'herbicide', form:'LF', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:'<2017', loc:'Cage', cage:'', src:'Half'}]},
 {id:'i18', name:'Bulk Fert', ai:'', cat:'fert_gran', form:'', thr:0, csize:2, unit:'ton', ctype:'bag', qty:2,
  containers:[
   {csize:2, unit:'ton', ctype:'bag', qty:1, year:null, loc:'Barn', cage:'', src:'2 tons'}]},
 {id:'i19', name:'Caravel', ai:'clomazone', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:'2022', loc:'Cage', cage:'3', src:'2 Full'}]},
 {id:'i20', name:'Celsilus', ai:'dicamba-sodium', cat:'herbicide', form:'WG', thr:0, csize:10, unit:'lb', ctype:'bag', qty:20,
  containers:[
   {csize:10, unit:'lb', ctype:'bag', qty:2, year:null, loc:'Cage', cage:'3', src:'2 full'}]},
 {id:'i21', name:'Chipco 26019', ai:'Iprodione', cat:'fungicide', form:'Flow', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:'2024', loc:'Cage', cage:'2', src:'2 Full'}]},
 {id:'i22', name:'Coastal', ai:'Prodiamine, Imazaquin, Simazine', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:3.75,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.5, year:'2022', loc:'Cage', cage:'', src:'1 Full 1 partial'}]},
 {id:'i23', name:'Confront', ai:'Triclopyr', cat:'herbicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:'<2017', loc:'Cage', cage:'3', src:'1 full'}]},
 {id:'i24', name:'Daconil Ultrex', ai:'Chlorothalonil', cat:'fungicide', form:'WSG', thr:0, csize:5, unit:'lb', ctype:'bag', qty:25,
  containers:[
   {csize:5, unit:'lb', ctype:'bag', qty:5, year:'<2017', loc:'Cage', cage:'2', src:'5 Full'}]},
 {id:'i25', name:'Daconil Weatherstik', ai:'Chlorothalonil', cat:'fungicide', form:'Flow', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:'2018', loc:'Cage', cage:'2', src:'Half'},
   {csize:1, unit:'L', ctype:'bottle', qty:0.5, year:'<2017', loc:'Cage', cage:'2', src:'Half'}]},
 {id:'i26', name:'Daconil Action', ai:'Chlorothalonil', cat:'fungicide', form:'Flow', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:13.75,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:5.5, year:'2023', loc:'Cage', cage:'2', src:'5 Full 1 Half'}]},
 {id:'i27', name:'DI AQUA NIS', ai:'Nonionnic Surfactant', cat:'wetting', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:2, year:null, loc:'Cage', cage:'', src:'2 Full'}]},
 {id:'i28', name:'DI AQUA MSO', ai:'Methylated Seed Oil', cat:'wetting', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:0.5,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:0.5, year:null, loc:'Cage', cage:'', src:'Half'}]},
 {id:'i29', name:'Dimension', ai:'Dithiopyr', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:0.62,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.25, year:'2020', loc:'Cage', cage:'3', src:'Low (Empty)'}]},
 {id:'i30', name:'Drive XLR8', ai:'Dimethylamine', cat:'herbicide', form:'Liquid', thr:0, csize:0.5, unit:'gal', ctype:'jug', qty:0.38,
  containers:[
   {csize:0.5, unit:'gal', ctype:'jug', qty:0.75, year:null, loc:'Cage', cage:'3', src:'3/4 gal'}]},
 {id:'i31', name:'Drive 75', ai:'3, 7-dichloro-8-quinolinecarboxylicacid', cat:'herbicide', form:'Granular', thr:0, csize:1, unit:'lb', ctype:'bag', qty:0,
  containers:[
   {csize:1, unit:'lb', ctype:'bag', qty:0, year:null, loc:'Cage', cage:'3', src:'0.0'}]},
 {id:'i32', name:'Eagle', ai:'Myclobutanil', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:'<2017', loc:'Cage', cage:'2', src:'1 Full'}]},
 {id:'i33', name:'Echelon 4SC', ai:'sulfentrazone', cat:'herbicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:2, year:null, loc:'Cage', cage:'', src:'2 Full'}]},
 {id:'i34', name:'Emerald', ai:'BoscalidjasIk', cat:'fungicide', form:'WDG', thr:0, csize:0.49, unit:'lb', ctype:'bag', qty:2.94,
  containers:[
   {csize:0.49, unit:'lb', ctype:'bag', qty:6, year:null, loc:'Cage', cage:'2', src:'6 Full'}]},
 {id:'i35', name:'Exteris Stressgard', ai:'', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:17.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:4, year:'2026', loc:'Cage', cage:'2', src:'4 Full'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:3, year:'2019', loc:'Cage', cage:'2', src:'3 Full'}]},
 {id:'i36', name:'Ferromec AC', ai:'Liquid Iron', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:20,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:8, year:'2025', loc:'Fertilizers', cage:'', src:'8 Full'}]},
 {id:'i37', name:'Finale XL', ai:'glufosinate-ammonium', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:'2022', loc:'Cage', cage:'', src:'Half'}]},
 {id:'i38', name:'Fleet', ai:'Polyoxyethylene Polymers', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:3.75,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:'2021', loc:'Cage', cage:'', src:'Half'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'2.5gal'}]},
 {id:'i39', name:'Freehand', ai:'Dimethenamid', cat:'herbicide', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:175,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:3.5, year:null, loc:'Cage', cage:'', src:'3.5 Full'}]},
 {id:'i40', name:'Fusilade 2', ai:'Fluazifop-P-butyl', cat:'herbicide', form:'Liquid', thr:0, csize:1.5, unit:'gal', ctype:'jug', qty:1.5,
  containers:[
   {csize:1.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'3', src:'Full'}]},
 {id:'i41', name:'Gallery', ai:'isoxaben', cat:'herbicide', form:'Granular', thr:0, csize:1, unit:'lb', ctype:'bag', qty:0.5,
  containers:[
   {csize:1, unit:'lb', ctype:'bag', qty:0.5, year:'<2017', loc:'Cage', cage:'', src:'1 Half'}]},
 {id:'i42', name:'Garlon 3A', ai:'Triclopyr', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:3.75,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.5, year:'<2017', loc:'Cage', cage:'3', src:'1 full 1 half'}]},
 {id:'i43', name:'Goosegrass Crabgrass Control', ai:'Bensulide', cat:'herbicide', form:'Granular', thr:0, csize:28.87, unit:'lb', ctype:'bag', qty:7.22,
  containers:[
   {csize:28.87, unit:'lb', ctype:'bag', qty:0.25, year:null, loc:'Cage', cage:'1', src:'Low'}]},
 {id:'i44', name:'Gramoxone', ai:'Paraquat', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'3', src:'1 Full'}]},
 {id:'i45', name:'Harells 21-0-0', ai:'', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:700,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:14, year:null, loc:'Barn', cage:'', src:'14 bags'}]},
 {id:'i46', name:'Harells Ronstar 1.5%', ai:'Oxadiazon', cat:'herbicide', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:75,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:1.5, year:null, loc:'Cage', cage:'', src:'1 Bag Partial 30lbs'}]},
 {id:'i47', name:'Harrell\'s Profertilizer', ai:'5% Nitrogen', cat:'fert_gran', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:50,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:1, year:'2024', loc:'Barn', cage:'', src:'Full'}]},
 {id:'i48', name:'Headway', ai:'Azoxystrobin', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:3,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:'<2017', loc:'Cage', cage:'2', src:'1 Full'},
   {csize:1, unit:'gal', ctype:'jug', qty:2, year:'2025', loc:'Cage', cage:'2', src:'2 Full'}]},
 {id:'i49', name:'Heritage Action', ai:'Azoxystrobin', cat:'fungicide', form:'WG', thr:0, csize:1, unit:'lb', ctype:'bag', qty:1.5,
  containers:[
   {csize:1, unit:'lb', ctype:'bag', qty:1.5, year:'<2017', loc:'Cage', cage:'', src:'1.5 lbs'},
   {csize:500, unit:'g', ctype:'bag', qty:0.5, year:'<2017', loc:'Cage', cage:'2', src:'Half'}]},
 {id:'i50', name:'Heritage TL', ai:'Azoxystrobin', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'2', src:'1.0'},
   {csize:1, unit:'gal', ctype:'jug', qty:0.25, year:null, loc:'Cage', cage:'', src:'Low'}]},
 {id:'i51', name:'Insignia', ai:'Pyraclostrobin', cat:'fungicide', form:'Granular', thr:0, csize:2.5, unit:'lb', ctype:'bag', qty:0.91,
  containers:[
   {csize:2.5, unit:'lb', ctype:'bag', qty:0.2, year:null, loc:'Cage', cage:'2', src:'.5 lb'},
   {csize:2.4, unit:'lb', ctype:'bag', qty:0.17, year:null, loc:'Cage', cage:'', src:'0.4lbs Low'}]},
 {id:'i52', name:'Insignia SC', ai:'Pyraclostrobin', cat:'fungicide', form:'Liquid', thr:0, csize:500, unit:'mL', ctype:'bottle', qty:500,
  containers:[
   {csize:500, unit:'mL', ctype:'bottle', qty:1, year:'<2017', loc:'Cage', cage:'2', src:'Full'},
   {csize:30.5, unit:'oz', ctype:'bottle', qty:0.5, year:null, loc:'Cage', cage:'2', src:'1 Half'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.5, year:'2018', loc:'Cage', cage:'2', src:'1 Full 1 Partial'}]},
 {id:'i53', name:'Instrata', ai:'Chlorothalonil, Propiconazole', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:'<2017', loc:'Cage', cage:'2', src:'2 Full'}]},
 {id:'i54', name:'Interface', ai:'Iprodione', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.68,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.67, year:'<2017', loc:'Cage', cage:'2', src:'2/3 Full'}]},
 {id:'i55', name:'Interface Stressguard', ai:'Iprodione', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:'<2017', loc:'Cage', cage:'2', src:'2 Full'}]},
 {id:'i56', name:'Junction', ai:'Mancozeb', cat:'fungicide', form:'DF', thr:0, csize:6, unit:'lb', ctype:'bag', qty:9,
  containers:[
   {csize:6, unit:'lb', ctype:'bag', qty:1.5, year:'<2017', loc:'Cage', cage:'2', src:'1 Full 1 partial'}]},
 {id:'i57', name:'Kabuto', ai:'Isofetamid', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:6,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:2, year:'2019/2022', loc:'Cage', cage:'2', src:'2 Full'},
   {csize:21.8, unit:'oz', ctype:'bottle', qty:1, year:'2019', loc:'', cage:'', src:'Full'},
   {csize:1, unit:'gal', ctype:'jug', qty:4, year:'2025', loc:'Cage', cage:'2', src:'4 Full'}]},
 {id:'i58', name:'Katana', ai:'flazasulfuron', cat:'herbicide', form:'Granular', thr:0, csize:5, unit:'lb', ctype:'bag', qty:25,
  containers:[
   {csize:5, unit:'lb', ctype:'bag', qty:5, year:null, loc:'Cage', cage:'3', src:'5.0'}]},
 {id:'i59', name:'Lexicon', ai:'Fluxapyroxad', cat:'fungicide', form:'Liquid', thr:0, csize:21, unit:'oz', ctype:'bottle', qty:55.02,
  containers:[
   {csize:21, unit:'oz', ctype:'bottle', qty:2.62, year:'2018', loc:'Cage', cage:'2', src:'55 oz'}]},
 {id:'i60', name:'Liberty Ultra', ai:'Glufosinate', cat:'herbicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'3', src:'Full'}]},
 {id:'i61', name:'Matrix', ai:'Rimsulfuron', cat:'herbicide', form:'WG', thr:0, csize:1.25, unit:'lb', ctype:'bag', qty:1.25,
  containers:[
   {csize:1.25, unit:'lb', ctype:'bag', qty:1, year:'<2017', loc:'Cage', cage:'', src:'1 Full'}]},
 {id:'i62', name:'Maxtima', ai:'Mefentrifluconazole', cat:'fungicide', form:'Liquid', thr:0, csize:26, unit:'oz', ctype:'bottle', qty:112,
  containers:[
   {csize:26, unit:'oz', ctype:'bottle', qty:4, year:'2024', loc:'Cage', cage:'2', src:'4 Full'},
   {csize:8, unit:'oz', ctype:'bottle', qty:1, year:null, loc:'Cage', cage:'2', src:'Full'}]},
 {id:'i63', name:'Merit', ai:'Imidacloprid', cat:'insecticide', form:'Granular', thr:0, csize:30, unit:'lb', ctype:'bag', qty:60,
  containers:[
   {csize:30, unit:'lb', ctype:'bag', qty:2, year:'2024', loc:'Cage', cage:'3', src:'2 Full'}]},
 {id:'i64', name:'Millennium', ai:'Dimethylamine Salt', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'3', src:'Full'}]},
 {id:'i65', name:'Nano Charge', ai:'Nitrogen', cat:'fert_liq', form:'Liquid', thr:0, csize:8.5, unit:'lb', ctype:'bag', qty:0,
  containers:[
   {csize:8.5, unit:'lb', ctype:'bag', qty:0, year:null, loc:'Cage', cage:'3', src:'1 qt'}]},
 {id:'i66', name:'NutraWash Tank Cleaner', ai:'', cat:'misc', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:4,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:4, year:'2026', loc:'Cage', cage:'2', src:'4 Full'}]},
 {id:'i67', name:'Nutrite 24-6-12/ Gal Xe One', ai:'Nitrogen', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:150,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:3, year:null, loc:'Barn', cage:'', src:'3 bags'}]},
 {id:'i68', name:'Outlook', ai:'dimethenamid-p', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:null, loc:'Cage', cage:'3', src:'1/2 gal'}]},
 {id:'i69', name:'Pendulum', ai:'Pendimethalin', cat:'herbicide', form:'Liquid', thr:0, csize:15, unit:'gal', ctype:'drum', qty:17.5,
  containers:[
   {csize:15, unit:'gal', ctype:'drum', qty:0.5, year:null, loc:'Cage', cage:'', src:'1 Half'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:4, year:'2020', loc:'Cage', cage:'3', src:'4 Full'}]},
 {id:'i70', name:'Pennant Magnum', ai:'S- metolachlor', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:'<2017', loc:'Cage', cage:'3', src:'1 partial'}]},
 {id:'i71', name:'Pillar G', ai:'Pyraclostrobin', cat:'fungicide', form:'Granular', thr:0, csize:30, unit:'lb', ctype:'bag', qty:45,
  containers:[
   {csize:30, unit:'lb', ctype:'bag', qty:1.5, year:null, loc:'Cage', cage:'2', src:'1.5 Full'}]},
 {id:'i72', name:'Posterity XT', ai:'pydiflumetofen, azoxystrobin, propiconazole', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:8.12,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.25, year:null, loc:'Cage', cage:'2', src:'1 Full 1 Low'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:null, loc:'Cage', cage:'', src:'2 Full'}]},
 {id:'i73', name:'Primo Maxx PGR', ai:'Triexapac-ethyl', cat:'pgr', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:6,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:6, year:'<2017', loc:'Cage', cage:'3', src:'6 Full'}]},
 {id:'i74', name:'Princep', ai:'Simazine', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:7.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:3, year:'<2017', loc:'Cage', cage:'3', src:'3 Full'}]},
 {id:'i75', name:'Professional Choice 00-20-20', ai:'', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:2200,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:44, year:null, loc:'Barn', cage:'', src:'44 bags'}]},
 {id:'i76', name:'Professional Choice 21-0-0/ Ammonium Sulfate', ai:'', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:200,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:4, year:null, loc:'Barn', cage:'', src:'4 bags'}]},
 {id:'i77', name:'Professional Choice 46-0-0/ W/Nutrisphere-N', ai:'', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:1600,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:32, year:null, loc:'Barn', cage:'', src:'32 bags'}]},
 {id:'i78', name:'Pylex', ai:'Topramezone', cat:'herbicide', form:'Liquid', thr:0, csize:4, unit:'oz', ctype:'bottle', qty:16,
  containers:[
   {csize:4, unit:'oz', ctype:'bottle', qty:4, year:'2024', loc:'Cage', cage:'3', src:'4 Full'}]},
 {id:'i79', name:'Quicksilver', ai:'carfentrazone-ethyl', cat:'herbicide', form:'Liquid', thr:0, csize:12, unit:'oz', ctype:'bottle', qty:6,
  containers:[
   {csize:12, unit:'oz', ctype:'bottle', qty:0.5, year:null, loc:'Cage', cage:'', src:'1/2'}]},
 {id:'i80', name:'Quinclorac', ai:'dimetrylamine', cat:'herbicide', form:'Liquid', thr:0, csize:30, unit:'oz', ctype:'bottle', qty:30,
  containers:[
   {csize:30, unit:'oz', ctype:'bottle', qty:1, year:null, loc:'Cage', cage:'', src:'1.0'}]},
 {id:'i81', name:'Recognition', ai:'Trifloxysulfuron-sodium', cat:'herbicide', form:'Granular', thr:0, csize:14, unit:'g', ctype:'bag', qty:14,
  containers:[
   {csize:14, unit:'g', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'3', src:'Full'}]},
 {id:'i82', name:'Regalite', ai:'Nitrogen', cat:'fert_gran', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:50,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'1', src:'1 Bag'}]},
 {id:'i83', name:'Regal Ronstar 100% XCU 38-0-0', ai:'Oxadiazon', cat:'herbicide', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:50,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:1, year:'2019', loc:'Cage', cage:'', src:'1 Full'}]},
 {id:'i84', name:'Regal Ronstar 1% 38-0-0', ai:'Oxadiazon', cat:'herbicide', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:200,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:4, year:'2019', loc:'Cage', cage:'', src:'4 Full'}]},
 {id:'i85', name:'RegalStar II', ai:'Oxadiazon', cat:'herbicide', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:200,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:4, year:'2019', loc:'Cage', cage:'1', src:'3 Full 2 Half'}]},
 {id:'i86', name:'Regal Ronstar AC 2%', ai:'Oxadiazon', cat:'herbicide', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:50,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Chem Room', cage:'', src:'1 Bag'}]},
 {id:'i87', name:'RegalKade G', ai:'Prodiamine', cat:'herbicide', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:150,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:3, year:null, loc:'Chem Room', cage:'', src:'3 full'}]},
 {id:'i88', name:'Rely III Soil Surfactant', ai:'Oxirane', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:10,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:4, year:'2026', loc:'Cage', cage:'2', src:'4 full'}]},
 {id:'i89', name:'Rely III', ai:'Oxirane', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:'2021', loc:'Cage', cage:'', src:'1 Full'}]},
 {id:'i90', name:'Revolution', ai:'Modified Alkylated Polyol', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:7.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.5, year:'2021', loc:'Cage', cage:'', src:'1.5 Full'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.4, year:null, loc:'Cage', cage:'', src:'3.5 gal'}]},
 {id:'i91', name:'Ronstar', ai:'Oxadiazon', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'3', src:'1 Full'}]},
 {id:'i92', name:'Round Up Quick Pro', ai:'glyphosate, indaziflam, disquat', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:0.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.2, year:null, loc:'Cage', cage:'3', src:'0.5 gal'}]},
 {id:'i93', name:'Round Up Ranger Pro', ai:'glyphosate', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:null, loc:'Cage', cage:'', src:'2 Full'}]},
 {id:'i94', name:'Roundup G', ai:'Glyphosate', cat:'herbicide', form:'Liquid', thr:0, csize:10, unit:'lb', ctype:'bag', qty:10,
  containers:[
   {csize:10, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'3', src:'Full'}]},
 {id:'i95', name:'SAF 816 Field Conditioner', ai:'', cat:'misc', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:350,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:4, year:null, loc:'Barn', cage:'', src:'4 bags'},
   {csize:150, unit:'lb', ctype:'bag', qty:1, year:null, loc:'', cage:'', src:'150lbs'}]},
 {id:'i96', name:'Safety Guard 0.125%', ai:'Flumioxazin', cat:'herbicide', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:50,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:1, year:'2024', loc:'Barn', cage:'', src:'Full'}]},
 {id:'i97', name:'Secure', ai:'Fluazinam', cat:'fungicide', form:'Liquid', thr:0, csize:0.5, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:0.5, unit:'gal', ctype:'jug', qty:2, year:null, loc:'Cage', cage:'2', src:'2 Full'}]},
 {id:'i98', name:'Segway', ai:'Cyazofamid', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'qt', ctype:'bottle', qty:8.5,
  containers:[
   {csize:1, unit:'qt', ctype:'bottle', qty:8.5, year:'2022', loc:'Cage', cage:'2', src:'8 Full, 1 Half'},
   {csize:39.2, unit:'oz', ctype:'bottle', qty:12, year:'2025', loc:'Cage', cage:'2', src:'12 Full'}]},
 {id:'i99', name:'Signature Chipco', ai:'Aluminum tris', cat:'fungicide', form:'WG', thr:0, csize:5.5, unit:'lb', ctype:'bag', qty:104.5,
  containers:[
   {csize:5.5, unit:'lb', ctype:'bag', qty:11, year:'2019', loc:'Cage', cage:'', src:'11 Full'},
   {csize:5.5, unit:'lb', ctype:'bag', qty:8, year:null, loc:'Cage', cage:'2', src:'8 Full'}]},
 {id:'i100', name:'Signature XTRA', ai:'Aluminum tris', cat:'fungicide', form:'WG', thr:0, csize:5.5, unit:'lb', ctype:'bag', qty:8.25,
  containers:[
   {csize:5.5, unit:'lb', ctype:'bag', qty:1.5, year:'2024', loc:'Cage', cage:'2', src:'1 Full 1 partial'},
   {csize:null, unit:'', ctype:'bag', qty:0.25, year:'2022', loc:'Cage', cage:'', src:'Low'}]},
 {id:'i101', name:'Simplot 10-18-22/Greens Grade', ai:'Soluble Potash', cat:'fert_gran', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:900,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:18, year:null, loc:'Barn', cage:'', src:'18 bags'}]},
 {id:'i102', name:'Simplot 18-3-6/Greens Grade', ai:'Nitrogen', cat:'fert_gran', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:400,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:8, year:null, loc:'Barn', cage:'', src:'8 bags'}]},
 {id:'i103', name:'Simplot 18-3-6 UMaxx', ai:'Urea', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:60,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:20, year:'2026', loc:'Cage', cage:'', src:'20 Full'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:4, year:'2022', loc:'Cage', cage:'', src:'4 Full'}]},
 {id:'i104', name:'Simplot 30-0-0 UMaxx', ai:'Urea', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:10,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:4, year:'2026', loc:'Cage', cage:'', src:'4 Full'}]},
 {id:'i105', name:'Simplot 30-0-0', ai:'nitrogen', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:22.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:9, year:null, loc:'', cage:'', src:'22.5 gal'}]},
 {id:'i106', name:'SpeedZone EW', ai:'24D+MCPP+Dicamba+ Carfentrazone', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:'2022', loc:'Cage', cage:'3', src:'2  Full'}]},
 {id:'i107', name:'Spotlight', ai:'Fluroxypyr', cat:'herbicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:'<2017', loc:'Cage', cage:'3', src:'1 Full'}]},
 {id:'i108', name:'Stellar', ai:'Fluopicolide', cat:'fungicide', form:'Liquid', thr:0, csize:104, unit:'oz', ctype:'bottle', qty:52,
  containers:[
   {csize:104, unit:'oz', ctype:'bottle', qty:0.5, year:'<2017', loc:'Cage', cage:'2', src:'1 Half'}]},
 {id:'i109', name:'Subdue Maxx', ai:'Mefenoxam', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:4.5,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:4.5, year:'<2017', loc:'Cage', cage:'2', src:'4 Full 1 Half'}]},
 {id:'i110', name:'SURGE', ai:'24D+Mecoprop-p+Dicamba+Sulfentrazone', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:3.75,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.5, year:'2022', loc:'Cage', cage:'3', src:'1 Full 1 half'}]},
 {id:'i111', name:'Target 6', ai:'msma', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:null, loc:'Cage', cage:'', src:'Half'}]},
 {id:'i112', name:'Target 6.6', ai:'msma', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'Full'}]},
 {id:'i113', name:'Tartan', ai:'Trifloxystrobin', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:3.75,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.5, year:null, loc:'Cage', cage:'2', src:'1 Full 1 Half'}]},
 {id:'i114', name:'Tebuconazole', ai:'Tebuconazole', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:'2018', loc:'Cage', cage:'2', src:'1 Full'}]},
 {id:'i115', name:'Tenacity', ai:'Mesotrione', cat:'herbicide', form:'Liquid', thr:0, csize:96, unit:'oz', ctype:'bottle', qty:96,
  containers:[
   {csize:96, unit:'oz', ctype:'bottle', qty:1, year:null, loc:'Cage', cage:'3', src:'Full'}]},
 {id:'i116', name:'Terminator II Defoamer', ai:'', cat:'misc', form:'Liquid', thr:0, csize:1, unit:'qt', ctype:'bottle', qty:13,
  containers:[
   {csize:1, unit:'qt', ctype:'bottle', qty:13, year:'2022', loc:'Cage', cage:'', src:'13.0'}]},
 {id:'i117', name:'Touchdown Total', ai:'Glyphosate', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:'<2017', loc:'Cage', cage:'3', src:'2 Full'}]},
 {id:'i118', name:'Track-IT Foam Marker', ai:'', cat:'misc', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:3.5,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:3.5, year:'2022', loc:'Cage', cage:'', src:'3.5 gal'}]},
 {id:'i119', name:'Tru-Prill 15-2-15/ Greens Grade', ai:'', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:150,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:3, year:null, loc:'Barn', cage:'', src:'3 Bags'}]},
 {id:'i120', name:'Tupersan', ai:'Siduron', cat:'herbicide', form:'WP', thr:0, csize:5, unit:'lb', ctype:'bag', qty:20,
  containers:[
   {csize:5, unit:'lb', ctype:'bag', qty:4, year:null, loc:'Cage', cage:'', src:'4 Full'}]},
 {id:'i121', name:'32-0-4', ai:'', cat:'fert_gran', form:'Granular', thr:0, csize:2, unit:'ton', ctype:'bag', qty:2,
  containers:[
   {csize:2, unit:'ton', ctype:'bag', qty:1, year:'2026', loc:'', cage:'', src:'Full'}]},
 {id:'i122', name:'46-0-0 (U-Flexx?)', ai:'Nitrogen', cat:'fert_gran', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:300,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:6, year:null, loc:'Cage Barn?', cage:'', src:'6 bags'}]},
 {id:'i123', name:'Union', ai:'cyazofamid, azoxystrobin', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:15,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:4, year:'2025', loc:'Cage', cage:'2', src:'4 Full'},
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:null, loc:'Cage', cage:'2', src:'2 Full'}]},
 {id:'i124', name:'Velista', ai:'Penthiopyrad', cat:'fungicide', form:'Liquid', thr:0, csize:22, unit:'oz', ctype:'bottle', qty:44,
  containers:[
   {csize:22, unit:'oz', ctype:'bottle', qty:2, year:'2019', loc:'Cage', cage:'2', src:'2 Full'},
   {csize:500, unit:'g', ctype:'bottle', qty:0.5, year:'2018', loc:'Cage', cage:'2', src:'1 Half'}]},
 {id:'i125', name:'Verdi-Cal G', ai:'Calcium Sulfate Dihydrate', cat:'fert_gran', form:'', thr:0, csize:50, unit:'lb', ctype:'bag', qty:200,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:4, year:null, loc:'Barn', cage:'', src:'4 bags'}]},
 {id:'i126', name:'Xzemplar', ai:'Fluxapyroxad', cat:'fungicide', form:'Liquid', thr:0, csize:114, unit:'oz', ctype:'bottle', qty:114,
  containers:[
   {csize:114, unit:'oz', ctype:'bottle', qty:1, year:'2019', loc:'Cage', cage:'2', src:'1 Full'}]},
 {id:'i127', name:'Zylam', ai:'Dinotefuran', cat:'insecticide', form:'Liquid', thr:0, csize:64, unit:'oz', ctype:'bottle', qty:64,
  containers:[
   {csize:64, unit:'oz', ctype:'bottle', qty:1, year:'2018', loc:'Cage', cage:'2', src:'1 Full'}]},
 {id:'i128', name:'Briskway', ai:'Prototype?', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'L', ctype:'bottle', qty:4,
  containers:[
   {csize:1, unit:'L', ctype:'bottle', qty:4, year:'2014', loc:'Cage', cage:'2', src:'4 Full'}]},
 {id:'i129', name:'Musketeer', ai:'Flurprimidol; Paclobutrazol', cat:'pgr', form:'Liquid', thr:0, csize:1, unit:'qt', ctype:'bottle', qty:3,
  containers:[
   {csize:1, unit:'qt', ctype:'bottle', qty:2, year:'<2017', loc:'Cage', cage:'3', src:'2 Full'},
   {csize:1, unit:'qt', ctype:'bottle', qty:1, year:'<2017', loc:'Chem Room', cage:'', src:'Full'}]},
 {id:'i130', name:'Monument 75 WG (8 packets)', ai:'', cat:'herbicide', form:'Granular', thr:0, csize:5, unit:'g', ctype:'bag', qty:5,
  containers:[
   {csize:5, unit:'g', ctype:'bag', qty:1, year:'2020', loc:'Chem Room', cage:'', src:'Full'}]},
 {id:'i131', name:'Destiny', ai:'Methylated Soybean Oil, soybean oil, Alkylphenol ethoxylate', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:'<2017', loc:'Chem Room', cage:'', src:'Full'}]},
 {id:'i132', name:'Touche', ai:'Vinclozolin', cat:'fungicide', form:'EG', thr:0, csize:2.75, unit:'lb', ctype:'bag', qty:2.5,
  containers:[
   {csize:2.75, unit:'lb', ctype:'bag', qty:0.91, year:'<2017', loc:'Cage', cage:'2', src:'2.5 lbs'}]},
 {id:'i133', name:'Surf 80', ai:'Alkyl Polyoxythylene', cat:'wetting', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:'2018', loc:'Chem Room', cage:'', src:'Full'}]},
 {id:'i134', name:'Lesco Stonewall-0.43%', ai:'', cat:'herbicide', form:'Granular', thr:0, csize:40, unit:'lb', ctype:'bag', qty:40,
  containers:[
   {csize:40, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'', src:'40lbs'}]},
 {id:'i135', name:'3800 - ronstar + fertilizer', ai:'', cat:'herbicide', form:'Granular', thr:0, csize:290, unit:'lb', ctype:'bag', qty:290,
  containers:[
   {csize:290, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'', src:'290lbs'}]},
 {id:'i136', name:'harrells 0-0-51', ai:'', cat:'fert_gran', form:'Granular', thr:0, csize:25, unit:'lb', ctype:'bag', qty:25,
  containers:[
   {csize:25, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'', src:'25lbs'}]},
 {id:'i137', name:'harrells 43-0-0', ai:'', cat:'fert_gran', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:50,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'', src:'50lbs'}]},
 {id:'i138', name:'roots 3-3-3', ai:'nitrogen', cat:'fert_gran', form:'Granular', thr:0, csize:20, unit:'lb', ctype:'bag', qty:20,
  containers:[
   {csize:20, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'', src:'20lbs'}]},
 {id:'i139', name:'spray 007', ai:'Alcohol Ethoxylate', cat:'wetting', form:'Liquid', thr:0, csize:3.5, unit:'gal', ctype:'jug', qty:3.5,
  containers:[
   {csize:3.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'3.5 gal'}]},
 {id:'i140', name:'ambient plus', ai:'', cat:'misc', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'1gal'}]},
 {id:'i141', name:'farmworks spray tank cleaner', ai:'', cat:'misc', form:'Liquid', thr:0, csize:1.5, unit:'lb', ctype:'bag', qty:1.5,
  containers:[
   {csize:1.5, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'', src:'1.5 lb'}]},
 {id:'i142', name:'foam concentrate', ai:'', cat:'misc', form:'Liquid', thr:0, csize:1, unit:'pt', ctype:'bottle', qty:1,
  containers:[
   {csize:1, unit:'pt', ctype:'bottle', qty:1, year:null, loc:'Cage', cage:'', src:'1 pint'}]},
 {id:'i143', name:'harrells 0-0-10', ai:'Oxadiazon', cat:'fert_gran', form:'Granular', thr:0, csize:50, unit:'lb', ctype:'bag', qty:100,
  containers:[
   {csize:50, unit:'lb', ctype:'bag', qty:2, year:null, loc:'Cage', cage:'', src:'2 Half Bags'}]},
 {id:'i144', name:'Foliar Pak 2-0-0', ai:'Nitrogen', cat:'fert_liq', form:'Liquid', thr:0, csize:1.5, unit:'gal', ctype:'jug', qty:1.5,
  containers:[
   {csize:1.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'1.5gal'}]},
 {id:'i145', name:'brandt', ai:'', cat:'fert_liq', form:'Liquid', thr:0, csize:3.5, unit:'gal', ctype:'jug', qty:3.5,
  containers:[
   {csize:3.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'3.5 gal'}]},
 {id:'i146', name:'armament concentrate', ai:'', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'2.5gal'}]},
 {id:'i147', name:'foliar pak csi 2-0-0', ai:'', cat:'fert_liq', form:'Liquid', thr:0, csize:4.5, unit:'gal', ctype:'jug', qty:4.5,
  containers:[
   {csize:4.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'', cage:'', src:'4.5 gal'}]},
 {id:'i148', name:'floratine', ai:'', cat:'fert_liq', form:'Liquid', thr:0, csize:10, unit:'gal', ctype:'jug', qty:10,
  containers:[
   {csize:10, unit:'gal', ctype:'jug', qty:1, year:null, loc:'', cage:'', src:'10gal'}]},
 {id:'i149', name:'Curalan EG', ai:'Vinclozolin, 4-oxazolidinedionej', cat:'fungicide', form:'Granular', thr:0, csize:2.75, unit:'lb', ctype:'bag', qty:2.75,
  containers:[
   {csize:2.75, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'2', src:'Full'}]},
 {id:'i150', name:'Honor', ai:'Pyraclostrobin, Boscalid', cat:'fungicide', form:'Granular', thr:0, csize:3, unit:'lb', ctype:'bag', qty:0.75,
  containers:[
   {csize:3, unit:'lb', ctype:'bag', qty:0.25, year:null, loc:'Cage', cage:'2', src:'Low'}]},
 {id:'i151', name:'Fame', ai:'Fluoxastrobin, Chlorothalonil', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'lb', ctype:'bag', qty:2.5,
  containers:[
   {csize:2.5, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'2', src:'Full'}]},
 {id:'i152', name:'Prostar', ai:'Flutolanil', cat:'fungicide', form:'Granular', thr:0, csize:3, unit:'lb', ctype:'bag', qty:1.5,
  containers:[
   {csize:3, unit:'lb', ctype:'bag', qty:0.5, year:null, loc:'Cage', cage:'2', src:'2 Low'}]},
 {id:'i153', name:'Mirage Stressguard', ai:'Triazole-1-ethanol', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:'2019', loc:'Cage', cage:'2', src:'1 Full'}]},
 {id:'i154', name:'Rayora', ai:'Fluteiafol', cat:'fungicide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:0.75,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:0.75, year:'2020', loc:'Cage', cage:'2', src:'3/4'}]},
 {id:'i155', name:'3336.0', ai:'Thiophanate-methyl', cat:'fungicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.25,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.5, year:'<2017', loc:'Cage', cage:'2', src:'1 partial'}]},
 {id:'i156', name:'Nutrol', ai:'', cat:'fungicide', form:'Granular', thr:0, csize:40, unit:'lb', ctype:'bag', qty:40,
  containers:[
   {csize:40, unit:'lb', ctype:'bag', qty:1, year:null, loc:'Cage', cage:'', src:'Full'}]},
 {id:'i157', name:'Fore 80WP', ai:'Mancozeb', cat:'fungicide', form:'Granular', thr:0, csize:1.5, unit:'lb', ctype:'bag', qty:20,
  containers:[
   {csize:1.5, unit:'lb', ctype:'bag', qty:13.33, year:null, loc:'Cage', cage:'2', src:'20 lbs'}]},
 {id:'i158', name:'simplot rely III', ai:'oxirain', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:19,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:7.6, year:null, loc:'Cage', cage:'', src:'19gal'}]},
 {id:'i159', name:'9-3-6', ai:'', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'2.5 gal'}]},
 {id:'i160', name:'foliar pak 4-0-6', ai:'', cat:'fert_liq', form:'Liquid', thr:0, csize:2, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:2, unit:'gal', ctype:'jug', qty:1, year:null, loc:'Cage', cage:'', src:'2gal'}]},
 {id:'i161', name:'Avalon', ai:'bifenthrin', cat:'insecticide', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:0.5,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:0.5, year:null, loc:'Cage', cage:'3', src:'0.5gal'}]},
 {id:'i162', name:'talestar', ai:',zeta-cypermethrine, bifenthrin', cat:'insecticide', form:'Granular', thr:0, csize:25, unit:'lb', ctype:'bag', qty:6.25,
  containers:[
   {csize:25, unit:'lb', ctype:'bag', qty:0.25, year:null, loc:'Cage', cage:'', src:'Low'}]},
 {id:'i163', name:'Speed XT', ai:'isooctyl', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.4, year:null, loc:'Cage', cage:'3', src:'1 gal'}]},
 {id:'i164', name:'KOCH-U Flexible u6-0-0', ai:'', cat:'fert_gran', form:'Granular', thr:0, csize:325, unit:'lb', ctype:'bag', qty:325,
  containers:[
   {csize:325, unit:'lb', ctype:'bag', qty:1, year:null, loc:'', cage:'', src:'325lbs'}]},
 {id:'i165', name:'simplot 10-18-22', ai:'', cat:'fert_gran', form:'Granular', thr:0, csize:550, unit:'lb', ctype:'bag', qty:550,
  containers:[
   {csize:550, unit:'lb', ctype:'bag', qty:1, year:null, loc:'', cage:'', src:'550lbs'}]},
 {id:'i166', name:'Simply 18-3-16', ai:'', cat:'fert_gran', form:'', thr:0, csize:null, unit:'', ctype:'bottle', qty:0,
  containers:[
   {csize:null, unit:'', ctype:'bottle', qty:8, year:null, loc:'', cage:'', src:'8- 50 lbs'}]},
 {id:'i167', name:'Extreme Green 16', ai:'', cat:'fert_gran', form:'', thr:0, csize:125, unit:'lb', ctype:'bag', qty:125,
  containers:[
   {csize:125, unit:'lb', ctype:'bag', qty:1, year:null, loc:'', cage:'', src:'125 lbs'}]},
 {id:'i168', name:'Milorganite', ai:'', cat:'fert_gran', form:'Granular', thr:0, csize:106, unit:'lb', ctype:'bag', qty:106,
  containers:[
   {csize:106, unit:'lb', ctype:'bag', qty:1, year:null, loc:'', cage:'', src:'106 lbs'}]},
 {id:'i169', name:'Ascernity', ai:'Benzovindiflupyr, Difenoconazole', cat:'fungicide', form:'Liquid', thr:0, csize:2, unit:'gal', ctype:'jug', qty:5.5,
  containers:[
   {csize:2, unit:'gal', ctype:'jug', qty:2.75, year:'2021', loc:'Cage', cage:'2', src:'5.5 gal'}]},
 {id:'i170', name:'Turflawn Ester', ai:'triclopyr, pyridinyloxyacetic acid, butoxyethyl', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.4, year:null, loc:'', cage:'', src:'1 Gal'}]},
 {id:'i171', name:'Lesco 12-0-0', ai:'urea nitrogen', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.4, year:'2016', loc:'', cage:'', src:'1 gal'}]},
 {id:'i172', name:'Biophase SBE', ai:'humic acid', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:7,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2.8, year:'2009', loc:'', cage:'', src:'7 gal'}]},
 {id:'i173', name:'Nutrigrow Magnum', ai:'ammoniacil nitrogen,', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:2, year:null, loc:'', cage:'', src:'5 gal'}]},
 {id:'i174', name:'Simplot Spray Slick', ai:'methylated seed oil, polyether modified polysiloxane, alkophenol ethoxylate', cat:'wetting', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:1, year:'2021', loc:'', cage:'', src:'1 gal'}]},
 {id:'i175', name:'Foundation Forty', ai:'nitrogen, potash', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'', cage:'', src:'2.5 gal'}]},
 {id:'i176', name:'RhizoMate', ai:'humic acid', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:4,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.6, year:null, loc:'', cage:'', src:'4 gal'}]},
 {id:'i177', name:'Fight\'s On', ai:'potash', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.8, year:'2017', loc:'', cage:'', src:'2 gal'}]},
 {id:'i178', name:'Glycofuse', ai:'urea', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.6, year:'2021', loc:'', cage:'', src:'1.5 gal'}]},
 {id:'i179', name:'Maxiplex', ai:'humic acid', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.6, year:'2019', loc:'', cage:'', src:'1.5 gal'}]},
 {id:'i180', name:'Pervade', ai:'disulfosuccinate', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.4, year:null, loc:'', cage:'', src:'1 gal'}]},
 {id:'i181', name:'Spray wet', ai:'Alkylphenol ethoxylate, propylene glycol, tall oil fatty acids', cat:'wetting', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:0.75,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:0.75, year:null, loc:'', cage:'', src:'3/4 gal'}]},
 {id:'i182', name:'Schaben\'s Foam', ai:'', cat:'misc', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:0.75,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:0.75, year:null, loc:'', cage:'', src:'3/4 gal'}]},
 {id:'i183', name:'Managnese 2-0-0', ai:'', cat:'fert_gran', form:'', thr:0, csize:2, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:2, unit:'gal', ctype:'jug', qty:1, year:null, loc:'', cage:'', src:'2 gal'}]},
 {id:'i184', name:'Oxifloor', ai:'', cat:'misc', form:'', thr:0, csize:2, unit:'gal', ctype:'jug', qty:2,
  containers:[
   {csize:2, unit:'gal', ctype:'jug', qty:1, year:null, loc:'', cage:'', src:'2 gal'}]},
 {id:'i185', name:'Harrol\'s HydroMax', ai:'polyoxialkylene polymer', cat:'wetting', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:2.5,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1, year:null, loc:'', cage:'', src:'2.5 gal'}]},
 {id:'i186', name:'Spray Rite', ai:'Ammonium Sulfat', cat:'fert_gran', form:'WSP', thr:0, csize:4, unit:'lb', ctype:'bag', qty:16,
  containers:[
   {csize:4, unit:'lb', ctype:'bag', qty:4, year:null, loc:'', cage:'', src:'16 lbs'}]},
 {id:'i187', name:'NonIonic Surfactant MS-9', ai:'ethylene oxide', cat:'wetting', form:'Liquid', thr:0, csize:1, unit:'gal', ctype:'jug', qty:0.5,
  containers:[
   {csize:1, unit:'gal', ctype:'jug', qty:0.5, year:null, loc:'', cage:'', src:'1/2 gal'}]},
 {id:'i188', name:'Lesco Spar Tech 0-8-5', ai:'phosphate', cat:'fert_liq', form:'lliquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:4,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.6, year:null, loc:'', cage:'', src:'4 gal'}]},
 {id:'i189', name:'Anew EZ', ai:'prohexadione calcium', cat:'fert_liq', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:4,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:1.6, year:'2024', loc:'', cage:'', src:'4 gal'}]},
 {id:'i190', name:'4-Speed XT', ai:'isooctyl ester of 2, 4-dichlorophenoxyacetic acid', cat:'herbicide', form:'Liquid', thr:0, csize:2.5, unit:'gal', ctype:'jug', qty:1,
  containers:[
   {csize:2.5, unit:'gal', ctype:'jug', qty:0.4, year:null, loc:'', cage:'', src:'1 gal'}]},
 {id:'i191', name:'Tal Star Extra', ai:'zeta-cypermethrin', cat:'insecticide', form:'Granular', thr:0, csize:25, unit:'lb', ctype:'bag', qty:10,
  containers:[
   {csize:25, unit:'lb', ctype:'bag', qty:0.4, year:null, loc:'', cage:'', src:'10 lbs'}]}
];
var invUnit='cont', invFilter='all', invSearch='';
var PRODREF=[
 {name:'Daconil Weatherstik', ai:'Chlorothalonil', cat:'fungicide', form:'SC', moa:'M05'},
 {name:'Heritage', ai:'Azoxystrobin', cat:'fungicide', form:'SC', moa:'11'},
 {name:'Banner Maxx', ai:'Propiconazole', cat:'fungicide', form:'EC', moa:'3'},
 {name:'Prodiamine', ai:'Prodiamine', cat:'herbicide', form:'WDG', moa:'3'},
 {name:'Tenacity', ai:'Mesotrione', cat:'herbicide', form:'SC', moa:'27'},
 {name:'Roundup', ai:'Glyphosate', cat:'herbicide', form:'liquid', moa:'9'},
 {name:'Acelepryn', ai:'Chlorantraniliprole', cat:'insecticide', form:'SC', moa:'28'},
 {name:'Merit', ai:'Imidacloprid', cat:'insecticide', form:'granular', moa:'4A'},
 {name:'Primo Maxx', ai:'Trinexapac-ethyl', cat:'pgr', form:'EC', moa:''},
 {name:'Revolution', ai:'Alkyl polyglucoside', cat:'wetting', form:'liquid', moa:''}
];
function fmt(n){n=Math.round(n*100)/100;return (n%1===0)?String(n):String(n);}
function plural(t,n){if(n===1)return t;if(t==='box')return 'boxes';return t+'s';}
/* ================= THE MOVEMENT LEDGER =================
   Stock is NOT a number that gets overwritten.

   `it.qty += n` is a read-modify-write: two people booking the same delivery
   at the same moment both read the old figure, both add to it, and one of the
   two writes disappears leaving no trace that it ever happened. On one phone
   that is unlikely. Across 23 phones and a shared database it is a Tuesday.

   So the shelf is RECORDED AS MOVEMENTS and added up. "50 lb in", "12 fl oz
   out". Two people booking at once write two movements and both count. There
   is nothing to overwrite.

   `it.qty` stays as the OPENING BALANCE - the April count out of the
   spreadsheet - so tools/build-inventory.py can still regenerate the product
   list without knowing any of this exists. On hand = opening balance + every
   movement since. A RECOUNT IS A MOVEMENT TOO (why:'count'), never an edit of
   the opening figure, because "what the shelf said in April" is a fact and
   should stay readable next to what happened afterwards.

   Settled with Dillon 2026-08-25, before any of it was written. Do not
   collapse it back into a scalar to "simplify" - the scalar is the bug.
   ======================================================= */

/* A movement: {id, item, delta, unit, why, ref, who, at, note}
     delta  in the PRODUCT'S unit (it.unit). Positive in, negative out.
     why    'in'    a delivery arrived
            'out'   it was used
            'count' a recount - the difference between shelf and record
            'adjust' anything else, and it must carry a note
     ref    what caused it: a field-log entry id, or null
     who    roster pid.   at  ISO local time. */
var INVMOVES=[];

/* Totals are worked out lazily and cached. The inventory list asks for 191
   products' totals one after another, and walking the whole ledger 191 times
   is exactly what would make that screen feel slow on a phone. Anything that
   changes INVMOVES must call invSumsDirty() - invMove() does it for you, and
   the sync will too. */
var _invSums=null;
function invSumsDirty(){ _invSums=null; }
function invSums(){
  if(_invSums) return _invSums;
  var s={};
  for(var i=0;i<INVMOVES.length;i++){
    var m=INVMOVES[i]; if(!m||!m.item) continue;
    s[m.item]=(s[m.item]||0)+(+m.delta||0);
  }
  return (_invSums=s);
}

/* THE one answer to "how much is on the shelf". Every screen asks this.
   NOTHING reads it.qty directly any more - if you find something that does, it
   is a bug, and it will be wrong the moment anybody moves any stock. */
function invQty(it){
  if(!it) return 0;
  return (+it.qty||0)+(invSums()[it.id]||0);
}

/* Newest first, for the item screen. */
function invMovesFor(id){
  return INVMOVES.filter(function(m){return m&&m.item===id;})
                 .sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));});
}

/* THE single write point. Everything that changes stock comes through here:
   one place to read, one place for the shared-database sync to hang off, and
   one place that stamps who and when. Same shape as flCommit() in the field
   log, and for the same reason. */
function invMove(itemId, delta, why, opts){
  opts=opts||{};
  var it=INVENTORY.find(function(x){return x.id===itemId;});
  if(!it || !delta) return null;
  var m={ id:newId('m'), item:itemId, delta:+delta, unit:it.unit,
          why:why||'adjust', ref:opts.ref||null,
          who:(typeof SESSION!=='undefined'&&SESSION.pid)||null,
          at:isoLocal(new Date()), note:opts.note||'' };
  INVMOVES.push(m); invSumsDirty();
  return m;
}

/* Going below zero WARNS, it never blocks - Dillon, 2026-08-25. The April
   counts are known to be stale, and stopping somebody in a field to fix
   paperwork is worse than carrying a wrong number for a day. A negative is a
   prompt to recount, not an error. Returns the warning to show, or ''. */
function invNegWarn(it, delta){
  if(!it || delta>=0) return '';
  var after=invQty(it)+delta;
  if(after>=-1e-9) return '';
  return 'That takes '+it.name+' to '+fmt(after)+' '+it.unit+'. Recorded anyway - worth a recount.';
}

/* Who moved it, for the history rows. */
function invWhoName(pid){
  if(!pid) return 'Someone';
  var p=(typeof rstFind==='function')?rstFind(pid):null;
  return p?pName(p):'Someone';
}

var INV_WHY={in:'Delivery',out:'Used',count:'Recount',adjust:'Adjustment'};

/* ---- units, so the field log can subtract what it says was used ----

   The field log records "12 fl oz" and the shelf is counted in gallons. One of
   them has to convert, and it must NEVER guess: an amount it cannot convert
   with certainty leaves stock alone and says so, rather than taking a number
   off the shelf that might be 128 times wrong.

   Two families that never meet: volume (based on fl oz) and weight (based on
   oz). `oz` is weight and `fl oz` is volume - they are different things and
   the app must not treat them as the same word. Countable units (bag, can,
   ea, jug) belong to no family and only ever match themselves. */
var INV_UNIT_FAM={
  'fl oz':['v',1],'floz':['v',1],'fluid ounce':['v',1],'fluid ounces':['v',1],
  'gal':['v',128],'gallon':['v',128],'gallons':['v',128],
  'qt':['v',32],'quart':['v',32],'quarts':['v',32],
  'pt':['v',16],'pint':['v',16],'pints':['v',16],
  'cup':['v',8],'cups':['v',8],
  'l':['v',33.8140226],'liter':['v',33.8140226],'litre':['v',33.8140226],
  'ml':['v',0.0338140226],
  'oz':['w',1],'ounce':['w',1],'ounces':['w',1],
  'lb':['w',16],'lbs':['w',16],'pound':['w',16],'pounds':['w',16],
  'kg':['w',35.2739619],
  'g':['w',0.0352739619],'gram':['w',0.0352739619],'grams':['w',0.0352739619]
};
function invUnitKey(u){ return String(u||'').trim().toLowerCase().replace(/\./g,'').replace(/\s+/g,' '); }

/* Returns the converted number, or NULL meaning "I do not know" - and null is
   always treated as "leave the shelf alone". */
function invConvert(n, from, to){
  n=+n; if(!isFinite(n)) return null;
  var a=invUnitKey(from), b=invUnitKey(to);
  if(a===b) return n;
  var fa=INV_UNIT_FAM[a], fb=INV_UNIT_FAM[b];
  if(!fa || !fb) return null;              /* a countable unit, or one we do not know */
  if(fa[0]!==fb[0]) return null;           /* never weight <-> volume */
  return n*fa[1]/fb[1];
}

/* "12 fl oz" -> {n:12, unit:'fl oz'}. Used for entries typed before the amount
   box was split in two, and for the correction screen, which is still free
   text on purpose - a correction must never be harder to write than the
   original. */
function invParseAmount(text){
  var m=String(text||'').trim().match(/^([0-9]*\.?[0-9]+)\s*(.*)$/);
  if(!m) return null;
  var n=parseFloat(m[1]);
  if(!isFinite(n)) return null;
  return {n:n, unit:(m[2]||'').trim()};
}
function invAmountIn(text, it){
  var p=invParseAmount(text); if(!p || !it) return null;
  if(!p.unit) return p.n;                  /* no unit typed reads as the product's own */
  return invConvert(p.n, p.unit, it.unit);
}

/* Every unit it is safe to offer for a product: its own first, then the rest
   of its family. A countable product gets only its own. */
function invUnitChoices(it){
  var own=(it&&it.unit)||'', k=invUnitKey(own), fam=INV_UNIT_FAM[k];
  if(!fam) return [own];
  var out=[own], seen={};
  seen[k]=1;
  ['fl oz','gal','qt','pt','L','mL','oz','lb','kg','g'].forEach(function(u){
    var uk=invUnitKey(u), f=INV_UNIT_FAM[uk];
    if(f && f[0]===fam[0] && !seen[uk]){ seen[uk]=1; out.push(u); }
  });
  return out;
}

/* Movements caused by one field-log entry. The link is the entry id, so a
   correction can find what its original took off the shelf. */
function invMovesForRef(ref){
  return ref ? INVMOVES.filter(function(m){return m&&m.ref===ref;}) : [];
}
function invRefTotal(ref){
  return invMovesForRef(ref).reduce(function(t,m){return t+(+m.delta||0);},0);
}

/* A field log entry was corrected, and the correction may have changed how
   much was used. Fix the shelf the way the field log fixes itself: by writing
   a NEW movement for the difference, never by editing or deleting the one that
   is already there. See [[fieldlog]] - the original stays exactly as it was.
   Returns the compensating movement, or null if there was nothing to fix. */
/* An entry can be corrected more than once, and each correction hangs its own
   movement off its own id. So the question "how much has this job taken off
   the shelf" has to be asked of the WHOLE CHAIN, not of one entry.

   Getting this wrong is not a small error: reconciling against only the last
   correction's movement compares a difference with a total and books the gap
   between them a second time. A 20 fl oz spray corrected to 12 and then
   corrected again for an unrelated typo would take another 20 off a shelf
   nobody had touched. */
function invLogChainIds(entry){
  var ids=[], seen={}, cur=entry, guard=0;
  while(cur && !seen[cur.id] && guard++ < 50){
    seen[cur.id]=1; ids.push(cur.id);
    cur=(cur.corrects && typeof flById==='function') ? flById(cur.corrects) : null;
  }
  return ids;
}
function invLogChainMoves(entry){
  var out=[];
  invLogChainIds(entry).forEach(function(id){ out=out.concat(invMovesForRef(id)); });
  return out;
}
function invReconcileFromLog(orig, corrected){
  if(!orig || !corrected) return null;
  var moves=invLogChainMoves(corrected);
  if(!moves.length) return null;                     /* stock was never touched */
  var it=INVENTORY.find(function(x){return x.id===moves[0].item;});
  if(!it) return null;
  var was=moves.reduce(function(t,m){return t+(+m.delta||0);},0);   /* negative */
  var amt=invAmountIn(corrected.amount, it);
  var now=(amt===null)?was:-amt;                     /* unreadable amount: change nothing */
  var diff=now-was;
  if(Math.abs(diff)<1e-9) return null;
  return invMove(it.id, diff, 'adjust',
    {ref:corrected.id, note:'Field log entry corrected'});
}

function isLow(it){return invQty(it)<=it.thr;}
function contCount(it){var q=invQty(it);return it.csize?q/it.csize:q;}
function amtStr(it){
 if(invUnit==='meas')return fmt(invQty(it))+' '+it.unit;
 var c=contCount(it); return fmt(c)+' '+plural(it.ctype,c);
}
function amtBoth(it){var c=contCount(it);return fmt(c)+' '+plural(it.ctype,c)+' · '+fmt(invQty(it))+' '+it.unit;}
function lowList(){return INVENTORY.filter(isLow);}

function buildChips(){
 var el=document.getElementById('inv-chips'); if(!el)return;
 var cats=CAT;
 var h='<span class="chip'+(invFilter==='all'?' on':'')+'" data-f="all">All</span>';
 var nlow=lowList().length;
 h+='<span class="chip low'+(invFilter==='low'?' on':'')+'" data-f="low">Low'+(nlow?' · '+nlow:'')+'</span>';
 cats.forEach(function(c){h+='<span class="chip'+(invFilter===c.k?' on':'')+'" data-f="'+c.k+'">'+esc(c.label)+'</span>';});
 el.innerHTML=h;
}
/* TWO different permissions, and they were one before the ledger existed.

   invCanMove  - book a delivery in, take stock out. EVERYBODY, undergraduates
                 included. Dillon, 2026-08-25: the people who carry the jugs
                 are the people who know what left the shelf, and the field log
                 already trusts them to write the farm's spray records.
   invCanEdit  - change what a PRODUCT IS: its name, its container size, its
                 reorder point. That is a decision about the shelf rather than
                 a record of what happened on it, so it stays where it was. */
function invCanMove(){return true;}
function invCanEdit(){return currentRole!=='undergrad';}
function invEnter(){
 var u=document.getElementById('inv-units'); if(u)u.querySelectorAll('span').forEach(function(s){s.classList.toggle('on',s.getAttribute('data-u')===invUnit);});
 document.getElementById('inv-addbtn').style.display=invCanEdit()?'block':'none';
 var rb=document.getElementById('inv-restock'); if(rb)rb.parentElement.style.display=invCanMove()?'flex':'none';
 buildChips(); renderInvList();
}
function renderInvAlert(){
 var el=document.getElementById('inv-alert'); if(el)el.innerHTML='';
}
function invRow(it){
 var low=isLow(it);
 var pill=low?'<span class="pill lowpill">Low</span>':'';
 return '<div class="row tap" data-item="'+it.id+'"><div class="invamt"'+(low?' style="color:#e8341f"':'')+'>'+amtStr(it)+'</div><div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px"><div class="rt" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(it.name)+'</div>'+pill+'</div></div>';
}
function renderInvList(){
 renderInvAlert();
 var body=document.getElementById('inv-body'); if(!body)return;
 var q=invSearch.trim().toLowerCase();
 var items=INVENTORY.filter(function(it){
   if(invFilter==='low'&&!isLow(it))return false;
   if(invFilter!=='all'&&invFilter!=='low'&&it.cat!==invFilter)return false;
   if(q){var s=(it.name+' '+(it.ai||'')).toLowerCase();if(s.indexOf(q)<0)return false;}
   return true;
 });
 if(!items.length){body.innerHTML='<div class="sec" style="text-align:center;margin-top:26px">No products match</div>';return;}
 var html='';
 CAT.forEach(function(c){
   var grp=items.filter(function(it){return it.cat===c.k;});
   if(!grp.length)return;
   html+='<div class="invhead">'+esc(c.label)+' · '+grp.length+'</div><div class="list">'+grp.map(invRow).join('')+'</div>';
 });
 body.innerHTML=html;
}
function fldRowI(l,v,last){return '<div class="fld"'+(last?' style="border-bottom:none"':'')+'><span class="fl">'+l+'</span><span class="fv">'+v+'</span></div>';}
function openItem(id){
 var it=INVENTORY.find(function(x){return x.id===id;}); if(!it)return;
 window.ilItem=null;
 var cm=catMeta(it.cat);
 var stat=isLow(it)?'<span class="pill lowpill">Low</span>':'';
 var rows='';
 rows+=fldRowI('Category', cm.label);
 if(it.ai)rows+=fldRowI('Active ingredient', it.ai);
 if(cm.res&&it.moa)rows+=fldRowI(cm.res+' group', it.moa);
 rows+=fldRowI('Formulation', it.form);
 rows+=fldRowI('Storage', it.loc);
 rows+=fldRowI('Container', '1 '+it.ctype+' = '+fmt(it.csize)+' '+it.unit);
 rows+=fldRowI('On hand', amtBoth(it));
 rows+=fldRowI('Reorder at', fmt(it.thr)+' '+it.unit, true);
 /* Real movements now. This block used to be two hardcoded demo rows with
    Bill's and Garrett's names on them - the last of the fake data, and it
    would have been read as a real record the day the shelf went shared. */
 var mv=invMovesFor(it.id).slice(0,12);
 var hist=mv.length ? mv.map(function(m){
     var up=m.delta>0;
     var sign=up?'+':'−';
     var why=INV_WHY[m.why]||'Adjustment';
     var sub=invWhoName(m.who)+' · '+String(m.at||'').slice(0,10)+(m.note?(' · '+m.note):'');
     return '<div class="row"><span class="dot" style="background:'+(up?'#2f9e4f':'#c0392b')+'"></span>'
       +'<div style="flex:1;min-width:0"><div class="rt">'+esc(why)+' · '+sign+fmt(Math.abs(m.delta))+' '+esc(m.unit||it.unit)+'</div>'
       +'<div class="rs">'+esc(sub)+'</div></div></div>';
   }).join('')
 : '<div class="row"><div style="flex:1"><div class="rs">Nothing has moved yet. The figure above is the April count.</div></div></div>';
 document.getElementById('id-body').innerHTML=
   '<div class="hdr" style="background:#2f3133;padding:15px 16px;gap:10px"><div class="title" style="color:#fff;font-size:17px;flex:1;line-height:1.15">'+esc(it.name)+'</div>'+stat+'</div>'
  +'<div class="sec">Details</div><div class="list">'+rows+'</div>'
  +'<div class="sec">Recent movement</div><div class="list">'+hist+'</div>'
   +'<div style="height:18px"></div>';
 document.getElementById('id-actions').innerHTML=
   (invCanMove()
     ? ('<div class="action tap" data-go="invlog" data-mode="restock" data-item="'+it.id+'" style="flex:1">Restock</div>'
       +'<div class="action tap" data-go="invlog" data-mode="out" data-item="'+it.id+'" style="flex:1;background:#2f9e4f">Log usage</div>')
     : '')
  +(invCanEdit()
     ? '<div class="action tap" data-go="additem" data-edit="'+it.id+'" style="flex:1;background:#17181a">Edit</div>'
     : '');
 show('itemdetail',true);
}

/* ---- restock (typeahead + inline new product) ---- */
window.ilItem=null; window.ilQty=1; window.ilSel=null; window.ilNew=false; window.ilNewName='';
var CTYPES=['jug','bottle','bag','box','case','tote','drum','can'];
var VUNITS=['gal','fl oz','oz','qt','pt','lb','kg','L','mL','can','ea','bag'];
function whoBlock(){return '<div class="sec" style="margin:14px 18px 7px">Logged by</div><div class="list"><div class="fld"><span class="fl">Who</span><span class="fv">'+meName()+'</span></div><div class="fld" style="border-bottom:none"><span class="fl">When</span><span class="fv">Today · now</span></div></div>';}
function previewBlock(){return '<div id="il-preview" style="margin:12px 16px;background:#eafaef;border:1px solid #bfe6c9;border-radius:12px;padding:11px 13px;font:700 12px;color:#2f7d3a"></div>';}
function stepperHTML(){return '<div class="stepper"><span class="stepbtn tap" data-step="-1">−</span><span class="stepval" id="il-qtyval">1</span><span class="stepbtn tap" data-step="1">＋</span></div>';}
function existingDetailHTML(it){
 return '<div class="sec" style="margin:14px 18px 7px">What came in</div><div class="list">'
  +'<div class="fld"><span class="fl">Container size</span><span class="fv" id="il-csize">1 '+it.ctype+' = '+fmt(it.csize)+' '+it.unit+'</span></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Containers received</span>'+stepperHTML()+'</div></div>'
  +whoBlock()+previewBlock();
}
function newDetailHTML(){
 return '<div class="sec" style="margin:14px 18px 7px">New product — define the container</div><div class="list">'
  +'<div class="fld"><span class="fl">Category</span><select class="inv-sel" id="il-cat">'+catOpts('fungicide')+'</select></div>'
  +'<div class="fld"><span class="fl">Container type</span><select class="inv-sel" id="il-ctype">'+CTYPES.map(function(t){return '<option>'+t+'</option>';}).join('')+'</select></div>'
  +'<div class="fld"><span class="fl">Volume unit</span><select class="inv-sel" id="il-vunit">'+VUNITS.map(function(u){return '<option>'+u+'</option>';}).join('')+'</select></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Volume per container</span><input class="inv-in" id="il-vol" inputmode="decimal" placeholder="2.5" style="max-width:90px"></div>'
  +'</div>'
  +'<div class="sec" style="margin:14px 18px 7px">Containers received</div><div class="list"><div class="fld" style="border-bottom:none"><span class="fl">How many came in</span>'+stepperHTML()+'</div></div>'
  +whoBlock()+previewBlock();
}
function curLogItem(){return window.ilSel?INVENTORY.find(function(x){return x.id===window.ilSel;}):null;}

/* ---- taking stock out ----
   The same screen as a restock, pointed the other way. It is deliberately NOT
   a second screen: one product picker, one save button, one place a movement
   is written from.

   Amounts are typed in the PRODUCT'S OWN UNIT rather than in containers,
   because nobody uses a whole jug - they use 12 fl oz out of one. The
   container line is shown as a reminder of what a full one holds.

   Going below zero warns and records anyway. See invNegWarn(). */
function ilOut(){ return window.ilMode==='out'; }

var IL_OUT_REASONS=[
 {v:'used',  t:'Used on the farm',               why:'out'},
 {v:'spill', t:'Spilled, damaged or thrown out', why:'adjust'},
 {v:'lent',  t:'Lent or given to another lab',   why:'adjust'},
 {v:'other', t:'Something else',                 why:'adjust'}
];
function ilOutReason(v){
  for(var i=0;i<IL_OUT_REASONS.length;i++) if(IL_OUT_REASONS[i].v===v) return IL_OUT_REASONS[i];
  return IL_OUT_REASONS[0];
}
function outDetailHTML(it){
 return '<div class="sec" style="margin:14px 18px 7px">What went out</div><div class="list">'
  +'<div class="fld"><span class="fl">Amount</span><span style="display:flex;align-items:center;gap:7px">'
  +'<input class="inv-in" id="il-outamt" inputmode="decimal" placeholder="0" style="max-width:90px">'
  +'<span class="fv">'+esc(it.unit)+'</span></span></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">A full '+esc(it.ctype)+' holds</span><span class="fv">'+fmt(it.csize)+' '+esc(it.unit)+'</span></div></div>'
  +'<div class="sec" style="margin:14px 18px 7px">Why</div><div class="list">'
  +'<div class="fld"><span class="fl">Reason</span><select class="inv-sel" id="il-outwhy">'
  +IL_OUT_REASONS.map(function(r){return '<option value="'+r.v+'">'+esc(r.t)+'</option>';}).join('')
  +'</select></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Note</span><input class="inv-in" id="il-outnote" placeholder="optional" style="max-width:175px"></div></div>'
  +whoBlock()+previewBlock();
}
function updateOutPreview(){
 var pv=document.getElementById('il-preview'); if(!pv)return;
 var it=curLogItem(); if(!it){pv.innerHTML='';return;}
 var amt=parseFloat((document.getElementById('il-outamt')||{}).value)||0;
 if(!amt){
   pv.style.background='#eef4ff';pv.style.borderColor='#cfe0ff';pv.style.color='#2456b8';
   pv.innerHTML='Enter how much came off the shelf.'; return;
 }
 var after=invQty(it)-amt;
 if(after<-1e-9){
   /* Red, but not a refusal - the button still works. */
   pv.style.background='#fdeceb';pv.style.borderColor='#f3c9c4';pv.style.color='#c0392b';
   pv.innerHTML='−'+fmt(amt)+' '+it.unit+' → '+fmt(after)+' '+it.unit+'. That is below zero, so the count is probably out. It will still be recorded.';
 } else {
   pv.style.background='#eafaef';pv.style.borderColor='#bfe6c9';pv.style.color='#2f7d3a';
   pv.innerHTML='✓ −'+fmt(amt)+' '+it.unit+' → new on hand '+fmt(after)+' '+it.unit;
 }
}
function invSuggest(txt){
 var box=document.getElementById('il-sugg'); if(!box)return;
 var q=txt.trim().toLowerCase();
 if(!q){box.style.display='none';box.innerHTML='';return;}
 var matches=INVENTORY.filter(function(it){return it.name.toLowerCase().indexOf(q)>=0;}).slice(0,6);
 var exact=INVENTORY.some(function(it){return it.name.toLowerCase()===q;});
 var h=matches.map(function(it){return '<div class="s-row" data-pick="'+it.id+'"><span class="s-nm">'+esc(it.name)+'</span><span class="s-sub">'+catMeta(it.cat).label+' · '+fmt(invQty(it))+' '+it.unit+'</span></div>';}).join('');
 if(!exact){h+='<div class="s-row" data-new="1"><span class="s-new">＋ Add “'+txt.trim()+'”</span><span class="s-sub">new product</span></div>';}
 box.innerHTML=h; box.style.display='block';
}
function setExisting(id){
 var it=INVENTORY.find(function(x){return x.id===id;}); if(!it)return;
 window.ilSel=id; window.ilNew=false; window.ilQty=1;
 var inp=document.getElementById('il-prod-in'); if(inp)inp.value=it.name;
 document.getElementById('il-sugg').style.display='none';
 document.getElementById('il-detail').innerHTML=ilOut()?outDetailHTML(it):existingDetailHTML(it);
 if(ilOut()) updateOutPreview(); else updateRestockPreview();
}
function setNew(name){
 name=(name||'').trim(); if(!name)return;
 /* You cannot use what the shelf has never heard of. Booking it in first is
    the honest order, and it is one tap away. */
 if(ilOut()){ toast('That product is not on the shelf yet — restock it first'); return; }
 window.ilSel=null; window.ilNew=true; window.ilNewName=name; window.ilQty=1;
 var inp=document.getElementById('il-prod-in'); if(inp)inp.value=name;
 document.getElementById('il-sugg').style.display='none';
 document.getElementById('il-detail').innerHTML=newDetailHTML();
 updateRestockPreview();
}
function updateRestockPreview(){
 var pv=document.getElementById('il-preview'); if(!pv)return;
 var n=window.ilQty;
 if(window.ilNew){
   var amt=parseFloat((document.getElementById('il-vol')||{}).value)||0;
   var unit=(document.getElementById('il-vunit')||{}).value||'';
   if(!amt){pv.style.background='#eef4ff';pv.style.borderColor='#cfe0ff';pv.style.color='#2456b8';pv.innerHTML='Enter the volume per container to finish adding this product.';return;}
   pv.style.background='#eafaef';pv.style.borderColor='#bfe6c9';pv.style.color='#2f7d3a';
   pv.innerHTML='✓ New product · '+n+' × '+fmt(amt)+' '+unit+' = '+fmt(n*amt)+' '+unit+' on hand';
 } else {
   var it=curLogItem(); if(!it){pv.innerHTML='';return;}
   var cs=document.getElementById('il-csize'); if(cs)cs.textContent='1 '+it.ctype+' = '+fmt(it.csize)+' '+it.unit;
   var add=n*it.csize;
   pv.innerHTML='✓ +'+fmt(add)+' '+it.unit+' → new on hand '+fmt(invQty(it)+add)+' '+it.unit;
 }
}
function renderInvLog(){
 var out=ilOut();
 document.getElementById('il-title').textContent=out?'Take stock out':'Restock';
 var sv=document.getElementById('il-save'); if(sv)sv.textContent=out?'Take it out':'Save';
 window.ilQty=1; window.ilNew=false; window.ilSel=null; window.ilNewName='';
 document.getElementById('il-body').innerHTML=
   '<div class="sec" style="margin:12px 18px 7px">Product</div>'
  +'<div style="position:relative;margin:0 14px"><input class="il-input" id="il-prod-in" placeholder="Type a product name…" autocomplete="off"><div class="il-sugg" id="il-sugg" style="display:none"></div></div>'
  +'<div id="il-detail" style="margin-top:2px"></div>';
 if(window.ilItem){var it=INVENTORY.find(function(x){return x.id===window.ilItem;}); if(it)setExisting(it.id);}
}
document.getElementById('s-invlog').addEventListener('click',function(e){
 var st=e.target.closest('[data-step]');
 if(st){window.ilQty=Math.max(1,window.ilQty+(+st.getAttribute('data-step')));var qv=document.getElementById('il-qtyval');if(qv)qv.textContent=window.ilQty;updateRestockPreview();return;}
 var pk=e.target.closest('[data-pick]'); if(pk){setExisting(pk.getAttribute('data-pick'));return;}
 var nw=e.target.closest('[data-new]'); if(nw){setNew(document.getElementById('il-prod-in').value);return;}
});
document.getElementById('s-invlog').addEventListener('input',function(e){
 if(e.target.id==='il-prod-in'){window.ilSel=null;window.ilNew=false;document.getElementById('il-detail').innerHTML='';invSuggest(e.target.value);}
 else if(e.target.id==='il-vol'){updateRestockPreview();}
 else if(e.target.id==='il-outamt'||e.target.id==='il-outnote'){updateOutPreview();}
});
document.getElementById('s-invlog').addEventListener('change',function(e){
 if(e.target.id==='il-vunit'||e.target.id==='il-ctype'||e.target.id==='il-cat')updateRestockPreview();
 else if(e.target.id==='il-outwhy')updateOutPreview();
});
document.getElementById('s-invlog').addEventListener('keydown',function(e){
 if(e.target.id!=='il-prod-in'||e.key!=='Enter')return;
 e.preventDefault();
 var q=e.target.value.trim(); if(!q)return;
 var exact=INVENTORY.find(function(it){return it.name.toLowerCase()===q.toLowerCase();});
 if(exact){setExisting(exact.id);return;}
 var subs=INVENTORY.filter(function(it){return it.name.toLowerCase().indexOf(q.toLowerCase())>=0;});
 if(subs.length===1){setExisting(subs[0].id);return;}
 setNew(q);
});
document.getElementById('il-save').addEventListener('click',function(){
 if(ilOut()){
   var oit=curLogItem(); if(!oit){toast('Pick a product');return;}
   var amt=parseFloat((document.getElementById('il-outamt')||{}).value);
   if(!amt||amt<=0){toast('Enter how much went out');return;}
   var r=ilOutReason((document.getElementById('il-outwhy')||{}).value);
   var typed=((document.getElementById('il-outnote')||{}).value||'').trim();
   var note=(r.v==='used'?'':r.t)+((r.v!=='used'&&typed)?' — ':'')+(r.v==='used'?typed:(typed?'':''));
   if(r.v==='used'&&typed) note=typed;
   /* Work the warning out BEFORE the movement lands, or it is measuring the
      shelf after the fact and always comes back clean. */
   var warn=invNegWarn(oit,-amt);
   invMove(oit.id,-amt,r.why,{note:note});
   toast(warn||('Took out '+fmt(amt)+' '+oit.unit+' ✓'));
   window.ilItem=null; show('inventory');
   stack=stack.filter(function(x){return x!=='invlog'&&x!=='itemdetail';});
   return;
 }
 if(window.ilNew){
   var name=(window.ilNewName||document.getElementById('il-prod-in').value||'').trim();
   if(!name){toast('Type a product name');return;}
   var amt=parseFloat((document.getElementById('il-vol')||{}).value);
   if(!amt||amt<=0){toast('Enter volume per container');return;}
   var cat=document.getElementById('il-cat').value, ctype=document.getElementById('il-ctype').value, unit=document.getElementById('il-vunit').value;
   var qty=window.ilQty*amt;
   /* Opening balance ZERO, then book the delivery. The product did not
      exist a moment ago, so it has no April count - everything it holds
      arrived, and the ledger should say so. */
   var nid=newId('i');
   INVENTORY.push({id:nid,name:name,ai:null,moa:null,cat:cat,form:'other',loc:'—',ctype:ctype,csize:amt,unit:unit,qty:0,thr:0});
   invMove(nid, qty, 'in', {note:'First delivery of a new product'});
   toast('Added '+name+' · '+fmt(qty)+' '+unit+' ✓'); invFilter=cat;
 } else {
   var it=curLogItem(); if(!it){toast('Pick a product');return;}
   var add=window.ilQty*it.csize;
   invMove(it.id, add, 'in');
   toast('Restocked +'+fmt(add)+' '+it.unit+' ✓');
 }
 window.ilItem=null; show('inventory');
 stack=stack.filter(function(x){return x!=='invlog'&&x!=='itemdetail';});
});

/* ---- add item (manager) ---- */
function catOpts(sel){return CAT.map(function(c){return '<option value="'+c.k+'"'+(c.k===sel?' selected':'')+'>'+esc(c.label)+'</option>';}).join('');}
function renderAddItem(){
 var ed=window.aiEdit?INVENTORY.find(function(x){return x.id===window.aiEdit;}):null;
 document.querySelector('#s-additem .hdr .title').textContent=ed?'Edit item':'Add item';
 document.getElementById('ai-save').textContent=ed?'Save changes':'Add to inventory';
 var forms=['liquid','EC','SC','WP','WDG','SP','granular','DF','other'];
 document.getElementById('ai-body').innerHTML=
   '<div class="sec" style="margin:12px 18px 7px">Product</div><div class="list">'
  +'<div class="fld"><span class="fl">Brand name *</span><input class="inv-in" id="ai-name" placeholder="e.g. Daconil" style="max-width:160px"></div>'
  +'<div class="fld"><span class="fl">Category *</span><select class="inv-sel" id="ai-cat">'+catOpts('fungicide')+'</select></div>'
  +'<div class="fld"><span class="fl">Active ingredient</span><input class="inv-in" id="ai-ai" placeholder="—" style="max-width:160px"></div>'
  +'<div class="fld"><span class="fl" id="ai-reslbl">FRAC group</span><input class="inv-in" id="ai-moa" placeholder="—" style="max-width:110px"></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Formulation</span><select class="inv-sel" id="ai-form">'+forms.map(function(f){return '<option'+(f==='SC'?' selected':'')+'>'+f+'</option>';}).join('')+'</select></div>'
  +'</div>'
  +'<div class="sec" style="margin:14px 18px 7px">Stock &amp; storage</div><div class="list">'
  +'<div class="fld"><span class="fl">Storage</span><input class="inv-in" id="ai-loc" placeholder="Chem room" style="max-width:150px"></div>'
  +'<div class="fld"><span class="fl">Container</span><select class="inv-sel" id="ai-ctype">'+['jug','bottle','bag','box','case','tote','drum','can'].map(function(t){return '<option>'+t+'</option>';}).join('')+'</select></div>'
  +'<div class="fld"><span class="fl">Container size</span><span style="display:flex;gap:6px;align-items:center"><input class="inv-in" id="ai-csize" inputmode="decimal" placeholder="2.5" style="max-width:70px"><input class="inv-in" id="ai-unit" placeholder="gal" style="max-width:60px"></span></div>'
  +'<div class="fld"><span class="fl">On hand (measured)</span><input class="inv-in" id="ai-qty" inputmode="decimal" placeholder="0" style="max-width:90px"></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Reorder at</span><input class="inv-in" id="ai-thr" inputmode="decimal" placeholder="0" style="max-width:90px"></div>'
  +'</div>'
  +'<div style="margin:12px 16px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:12px;padding:11px 13px;font:600 11.5px;color:#2456b8">Type a known brand name to autofill ingredient, category, formulation &amp; resistance group. Everything stays editable.</div>';
 var reslbl=function(){var c=catMeta(document.getElementById('ai-cat').value);document.getElementById('ai-reslbl').textContent=(c.res||'Resistance')+' group';};
 if(ed){var g=function(x){return document.getElementById('ai-'+x);};g('name').value=ed.name;g('ai').value=ed.ai||'';g('moa').value=ed.moa||'';g('cat').value=ed.cat;g('form').value=ed.form;g('loc').value=(ed.loc==='—'?'':ed.loc);g('ctype').value=ed.ctype;g('csize').value=ed.csize;g('unit').value=ed.unit;g('qty').value=fmt(invQty(ed));g('thr').value=ed.thr;}
 reslbl();
 document.getElementById('ai-cat').addEventListener('change',reslbl);
 if(!ed)document.getElementById('ai-name').addEventListener('input',function(){
   var v=this.value.trim().toLowerCase(); if(v.length<2)return;
   var m=PRODREF.find(function(p){return p.name.toLowerCase().indexOf(v)===0||v.indexOf(p.name.toLowerCase())===0;});
   if(m){document.getElementById('ai-ai').value=m.ai||'';document.getElementById('ai-cat').value=m.cat;document.getElementById('ai-form').value=m.form;document.getElementById('ai-moa').value=m.moa||'';reslbl();}
 });
}
document.getElementById('ai-save').addEventListener('click',function(){
 var g=function(x){return document.getElementById('ai-'+x);};
 var name=g('name').value.trim(); if(!name){toast('Enter a brand name');return;}
 var csize=parseFloat(g('csize').value)||1, qty=parseFloat(g('qty').value)||0, thr=parseFloat(g('thr').value)||0;
 var ed=window.aiEdit?INVENTORY.find(function(x){return x.id===window.aiEdit;}):null;
 if(ed){
   ed.name=name; ed.ai=g('ai').value.trim()||null; ed.moa=g('moa').value.trim()||null; ed.cat=g('cat').value; ed.form=g('form').value; ed.loc=g('loc').value.trim()||'—'; ed.ctype=g('ctype').value; ed.csize=csize; ed.unit=g('unit').value.trim()||'unit'; ed.thr=thr;
    /* "On hand" on this form is a RECOUNT. Writing ed.qty would quietly
       rewrite the April opening balance and leave every movement since
       describing a shelf that no longer adds up. Book the difference instead,
       so the number reads what was typed AND the record still says how it got
       there. */
    var diff=qty-invQty(ed);
    if(Math.abs(diff)>1e-9) invMove(ed.id, diff, 'count', {note:'Recount on the item screen'});
   toast('Saved changes ✓'); invFilter=ed.cat; window.aiEdit=null;
   show('inventory'); stack=stack.filter(function(x){return x!=='additem'&&x!=='itemdetail';});
   return;
 }
 INVENTORY.push({id:newId('i'), name:name, ai:g('ai').value.trim()||null, moa:g('moa').value.trim()||null, cat:g('cat').value, form:g('form').value, loc:g('loc').value.trim()||'—', ctype:g('ctype').value, csize:csize, unit:g('unit').value.trim()||'unit', qty:qty, thr:thr});
 if(!PRODREF.some(function(p){return p.name.toLowerCase()===name.toLowerCase();}))PRODREF.push({name:name,ai:g('ai').value.trim(),cat:g('cat').value,form:g('form').value,moa:g('moa').value.trim()});
 toast('Added '+name+' ✓'); invFilter=g('cat').value; show('inventory'); stack=stack.filter(function(x){return x!=='additem';});
});

/* ---- low-stock view ---- */
function renderLowStock(){
 var body=document.getElementById('ls-body'); if(!body)return;
 var lows=lowList();
 if(!lows.length){body.innerHTML='<div class="sec" style="text-align:center;margin-top:30px">Nothing below reorder ✓</div>';return;}
 var html='<div class="sec">'+lows.length+' at or below reorder point</div><div class="list">';
 html+=lows.map(function(it){
   return '<div class="row tap" data-item="'+it.id+'"><span class="dot" style="background:#c0392b"></span><div style="flex:1;min-width:0"><div class="rt">'+esc(it.name)+'</div><div class="rs">'+catMeta(it.cat).label+' · '+fmt(invQty(it))+' '+it.unit+' left · reorder at '+fmt(it.thr)+' '+it.unit+'</div></div><span class="pill lowpill">Low</span></div>';
 }).join('')+'</div>';
 body.innerHTML=html;
}

/* ===================== Equipment module ===================== */
var eqTab='home'; var eqSearch=''; window.eqCur=null; window.eqEditId=null; window.eqSchedEditId=null; window.eqReportSetDown=false;
function eqModal(msg,yesLabel,onYes,onCancel){
 var ov=document.getElementById('eq-modal');
 if(!ov){ov=document.createElement('div');ov.id='eq-modal';ov.style.cssText='position:absolute;inset:0;background:rgba(20,22,24,.45);display:flex;align-items:center;justify-content:center;z-index:60;padding:24px';app.appendChild(ov);}
 ov.innerHTML='<div style="background:#fff;border-radius:16px;max-width:300px;width:100%;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.3)"><div style="font:600 13.5px \'Public Sans\',sans-serif;color:#1f2328;line-height:1.45;margin-bottom:16px">'+msg+'</div><div style="display:flex;gap:8px"><span class="tap" data-eqm="cancel" style="flex:1;text-align:center;padding:12px;border-radius:10px;background:#f1f2f4;color:#42484f;font:800 13px \'Public Sans\',sans-serif">Cancel</span><span class="tap" data-eqm="yes" style="flex:1;text-align:center;padding:12px;border-radius:10px;background:#c0392b;color:#fff;font:800 13px \'Public Sans\',sans-serif">'+yesLabel+'</span></div></div>';
 ov.style.display='flex';
 ov.onclick=function(e){
   if(e.target.closest('[data-eqm="yes"]')){ov.style.display='none';if(onYes)onYes();}
   else if(e.target.closest('[data-eqm="cancel"]')||e.target===ov){ov.style.display='none';if(onCancel)onCancel();}
 };
}
var EQTYPES=[['triplex','Triplex reel'],['walk','Walk mower'],['rotary','Rotary mower'],['sprayer','Sprayer'],['tractor','Tractor'],['aerator','Aerator'],['backpack','Backpack sprayer'],['utility','Utility vehicle'],['other','Other']];
var EQFUELS=['Gas','Diesel','Electric','Gas (mix)','Other'];
var EQJOBS=['Greens Triplex Mow','Fairway Mow','Rough Mow','Tee Mow','Spray Application','Fungicide Application','Aerify','Topdress','Fertilize','Reel Grind','Backlap'];
var EQMTL={oil_change:'Oil change',reel_grind:'Reel grind',backlap:'Backlap',repair:'Repair',other:'Service'};
let EQUIP=[
 {id:"e1",name:"John Deere 7700A",type:"Fairway Reel Mower",make:"John Deere",model:"7700A",year:null,fuel:"Diesel",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:5,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e2",name:"John Deere HD200",type:"Boom Sprayer",make:"John Deere",model:"HD200",year:null,fuel:"Gasoline",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e3",name:"John Deere Z915E #1",type:"Zero-Turn Rotary Mower",make:"John Deere",model:"Z915E",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e4",name:"John Deere Z915E #2",type:"Zero-Turn Rotary Mower",make:"John Deere",model:"Z915E",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e5",name:"Greenworks Optimus Z",type:"Zero-Turn Rotary Mower",make:"Greenworks",model:"Optimus Z",year:null,fuel:"Electric",hours:null,location:"Shop",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e6",name:"Toro Greenmaster flex 2100 #1",type:"Walking reel mower",make:"Toro",model:"Greenmaster flex 2100",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e7",name:"Toro Greenmaster flex 2100 #2",type:"Walking reel mower",make:"Toro",model:"Greenmaster flex 2100",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e8",name:"Toro Greenmaster 3300 TriFlex",type:"Triplex reel mower",make:"Toro",model:"Greenmaster 3300 TriFlex",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:3,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e9",name:"John Deere 2550",type:"Triplex reel mower",make:"John Deere",model:"2550",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:6,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e10",name:"John Deere 2653",type:"Triplex reel mower",make:"John Deere",model:"2653",year:null,fuel:"Diesel",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:3,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e11",name:"Toro Recycler #1",type:"Pedestrian Rotary Mower",make:"Toro",model:"Recycler",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e12",name:"Toro Recycler #2",type:"Pedestrian Rotary Mower",make:"Toro",model:"Recycler",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e13",name:"Dennis G860 #1",type:"Pedestrian Reel Mower",make:"Dennis",model:"G860",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:3,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e14",name:"Dennis G860 #2",type:"Pedestrian Reel Mower",make:"Dennis",model:"G860",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:3,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e15",name:"Dennis Premier 2 910",type:"Pedestrian Reel Mower",make:"Dennis",model:"Premier 2 910",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:1,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e16",name:"Toro Power Brrom",type:"Brush",make:"Toro",model:"Power Brrom",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e17",name:"Jacobson Textron",type:"Pedestrian Reel Mower",make:"Jacobson",model:"Textron",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e18",name:"John Deere Gator TX 4x2 #1",type:"Cart",make:"John Deere",model:"Gator TX 4x2",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e19",name:"John Deere Gator TX 4x2 #2",type:"Cart",make:"John Deere",model:"Gator TX 4x2",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e20",name:"Kawasaki Mule 3010",type:"Cart",make:"Kawasaki",model:"Mule 3010",year:null,fuel:"Gasoline",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e21",name:"Kawasaki Mule 600",type:"Cart",make:"Kawasaki",model:"Mule 600",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e22",name:"Kioti DK 5320 SE HST",type:"Tractor",make:"Kioti",model:"DK 5320 SE HST",year:null,fuel:"Diesel",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e23",name:"John Deere 4005",type:"Tractor",make:"John Deere",model:"4005",year:null,fuel:"Diesel",hours:null,location:"F Block",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e24",name:"Dakota Turf Tender 410",type:"Pull Behind Rotary  Spreader",make:"Dakota",model:"Turf Tender 410",year:null,fuel:"",hours:null,location:"Farm Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e25",name:"Toro Top Dresser 2500",type:"Pull Behind Drop Spreader",make:"Toro",model:"Top Dresser 2500",year:null,fuel:"",hours:null,location:"Farm Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e26",name:"POS Silver",type:"Pedestrian Drop Spreader",make:"POS",model:"Silver",year:null,fuel:"",hours:null,location:"Bullpen",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e27",name:"Stryker",type:"Pedestrian Drop Spreader",make:"Stryker",model:"",year:null,fuel:"",hours:null,location:"Slightly Dirty Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e28",name:"Anderson #1",type:"Pedestrian Rotary Spreader",make:"Anderson",model:"",year:null,fuel:"",hours:null,location:"Pull Barn",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e29",name:"Anderson #2",type:"Pedestrian Rotary Spreader",make:"Anderson",model:"",year:null,fuel:"",hours:null,location:"Pull Barn",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e30",name:"STI",type:"Tractor mounted Aerifier",make:"STI",model:"",year:null,fuel:"",hours:null,location:"Farm Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e31",name:"Toro ProCore 648",type:"Pedestrian Trafficker (Aerfier)",make:"Toro",model:"ProCore 648",year:null,fuel:"",hours:null,location:"Shop",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e32",name:"GKB CB120",type:"Pedestrian Fraise Mower",make:"GKB",model:"CB120",year:null,fuel:"",hours:null,location:"Bullpen",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e33",name:"STEC",type:"Blecklavator",make:"STEC",model:"",year:null,fuel:"",hours:null,location:"Farm Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e34",name:"Foley 672 Accu-Pro",type:"Bed Knife Grinder",make:"Foley",model:"672 Accu-Pro",year:null,fuel:"Electric",hours:null,location:"Shop",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e35",name:"Foley 633 Accu-Pro AC",type:"Reel Grinder",make:"Foley",model:"633 Accu-Pro AC",year:null,fuel:"Electric",hours:null,location:"Shop",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e36",name:"Foley 642 Quick-Spin",type:"Reel Grinder",make:"Foley",model:"642 Quick-Spin",year:null,fuel:"Electric",hours:null,location:"Shop",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e37",name:"Allett STIR43",type:"Pedestrian Reel Mower",make:"Allett",model:"STIR43",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:null,cassettes:4,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e38",name:"Allett STIR51",type:"Pedestrian Reel Mower",make:"Allett",model:"STIR51",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:null,cassettes:1,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e39",name:"Ego Select Cut XP",type:"Pedestrian Rotary Mower",make:"Ego",model:"Select Cut XP",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e40",name:"Toro eProstripe 560",type:"Pedestrian Rotary Mower",make:"Toro",model:"eProstripe 560",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e41",name:"SDI",type:"Pedestrian Boom Sprayer",make:"SDI",model:"",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e42",name:"Dennis ES-510",type:"Pedestrian Trafficker (Reel Mower)",make:"Dennis",model:"ES-510",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:null,cassettes:3,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e43",name:"RedMax #1",type:"Backpack Sprayer",make:"RedMax",model:"",year:null,fuel:"Pump",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e44",name:"RedMax #2",type:"Backpack Sprayer",make:"RedMax",model:"",year:null,fuel:"Pump",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e45",name:"Smith Professional",type:"Backpack Sprayer",make:"Smith",model:"Professional",year:null,fuel:"Pump",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e46",name:"Husqvarna",type:"Backpack Sprayer",make:"Husqvarna",model:"",year:null,fuel:"Pump",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e47",name:"King Promax",type:"Backpack Sprayer",make:"King",model:"Promax",year:null,fuel:"Battery",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e48",name:"Ewing",type:"Backpack Sprayer",make:"Ewing",model:"",year:null,fuel:"Pump",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e49",name:"John Deere Pro Gator",type:"Cart",make:"John Deere",model:"Pro Gator",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e50",name:"Toro Dingo TXL 2000",type:"Compact Utility Loader",make:"Toro",model:"Dingo TXL 2000",year:null,fuel:"Diesel",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e51",name:"Spider Donkey",type:"Forklift",make:"Spider",model:"Donkey",year:null,fuel:"Diesel",hours:null,location:"Pull Barn",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e52",name:"NorthStar Dump, Bump, Pull 7000",type:"Trailer",make:"NorthStar",model:"Dump, Bump, Pull 7000",year:null,fuel:"",hours:null,location:"F Block",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e53",name:"Trailer #1",type:"Trailer",make:"",model:"",year:null,fuel:"",hours:null,location:"F Block",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e54",name:"Trailer #2",type:"Trailer",make:"",model:"",year:null,fuel:"",hours:null,location:"F Block",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e55",name:"Graco Field Lazer S200",type:"Line Painter",make:"Graco",model:"Field Lazer S200",year:null,fuel:"Gasoline",hours:null,location:"Turf Chemical Room",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e56",name:"Pitchmark Classic",type:"wheel to wheel painter",make:"Pitchmark",model:"Classic",year:null,fuel:"",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e57",name:"Greenworks Optimus #1",type:"Weedeater",make:"Greenworks",model:"Optimus",year:null,fuel:"Electric",hours:null,location:"Tool Shed",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e58",name:"Greenworks Optimus #2",type:"Edger",make:"Greenworks",model:"Optimus",year:null,fuel:"Electric",hours:null,location:"Tool Shed",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e59",name:"Ego #1",type:"Weedeater",make:"Ego",model:"",year:null,fuel:"Electric",hours:null,location:"Tool Shed",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e60",name:"Stihl #1",type:"Weedeater",make:"Stihl",model:"",year:null,fuel:"Mixed Gasoline",hours:null,location:"Tool Shed",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e61",name:"Stihl #2",type:"Weedeater",make:"Stihl",model:"",year:null,fuel:"Mixed Gasoline",hours:null,location:"Tool Shed",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e62",name:"Stihl BR 800 C",type:"Backpack Blower",make:"Stihl",model:"BR 800 C",year:null,fuel:"Mixed Gasoline",hours:null,location:"Tool Shed",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e63",name:"Stihl BR 550 #1",type:"Backpack Blower",make:"Stihl",model:"BR 550",year:null,fuel:"Mixed Gasoline",hours:null,location:"Tool Shed",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e64",name:"Stihl BR 550 #2",type:"Backpack Blower",make:"Stihl",model:"BR 550",year:null,fuel:"Mixed Gasoline",hours:null,location:"Tool Shed",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e65",name:"Greenworks BB361",type:"Backpack Blower",make:"Greenworks",model:"BB361",year:null,fuel:"Electric",hours:null,location:"Tool Shed",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e66",name:"Greenworks 82LM21S #1",type:"Pedestrian Rotary Mower",make:"Greenworks",model:"82LM21S",year:null,fuel:"Electric",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e67",name:"Greenworks 82LM21S #2",type:"Pedestrian Rotary Mower",make:"Greenworks",model:"82LM21S",year:null,fuel:"Electric",hours:null,location:"Turf Chemical Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e68",name:"Greenworks",type:"Handheld Blower",make:"Greenworks",model:"",year:null,fuel:"Electric",hours:null,location:"Shop",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e69",name:"Ego #2",type:"Handheld Blower",make:"Ego",model:"",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e70",name:"Globus Eurogoal",type:"JUGS Machine",make:"Globus",model:"Eurogoal",year:null,fuel:"Electric",hours:null,location:"Slightly Dirty Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e71",name:"Turf Tank 2",type:"Line Painter",make:"Turf Tank",model:"2",year:null,fuel:"Electric",hours:null,location:"Slightly Dirty Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e72",name:"SGL fLEX fLEX",type:"Field Tester",make:"SGL fLEX",model:"fLEX",year:null,fuel:"Electric",hours:null,location:"Slightly Dirty Room",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e73",name:"UT fLEX #1",type:"Field Tester",make:"UT",model:"fLEX",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:"DTS-24-01",cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e74",name:"UT fLEX #2",type:"Field Tester",make:"UT",model:"fLEX",year:null,fuel:"Electric",hours:null,location:"Light House",oilType:"NA",oilFilter:"",reels:"DTS-25-05",cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e75",name:"Jacobsen Ryan",type:"Sod Cutter",make:"Jacobsen",model:"Ryan",year:null,fuel:"Gasoline",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e76",name:"Turfco",type:"Slit Seeder",make:"Turfco",model:"",year:null,fuel:"Gasoline",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e77",name:"SISIS #1",type:"Soccer Traficker",make:"SISIS",model:"",year:null,fuel:"Gasoline",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e78",name:"SISIS #2",type:"Fraise Mower",make:"SISIS",model:"",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e79",name:"Permaspray",type:"Rotary Spreader, Sprayer",make:"Permaspray",model:"",year:null,fuel:"Gasoline",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e80",name:"Tru-Turf RS48-T1C",type:"Greens Roller",make:"Tru-Turf",model:"RS48-T1C",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e81",name:"Honda EU1000i",type:"Generator",make:"Honda",model:"EU1000i",year:null,fuel:"Gasoline",hours:null,location:"Shop",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e82",name:"Scotts Turf Builder Classic Drop",type:"Pedestrian Drop Spreader",make:"Scotts",model:"Turf Builder Classic Drop",year:null,fuel:"",hours:null,location:"Pull Barn",oilType:"NA",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e83",name:"Dodge Ram 2500",type:"Truck",make:"Dodge",model:"Ram 2500",year:null,fuel:"Gasoline",hours:null,location:"Pull Barn",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e84",name:"Ford F-250 #1",type:"Truck",make:"Ford",model:"F-250",year:null,fuel:"Gasoline",hours:null,location:"Pull Barn",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e85",name:"GMC Big Blue",type:"Truck",make:"GMC",model:"Big Blue",year:null,fuel:"Gasoline",hours:null,location:"F Block",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e86",name:"Ford F-250 #2",type:"Truck",make:"Ford",model:"F-250",year:null,fuel:"Gasoline",hours:null,location:"F Block",oilType:"",oilFilter:"",reels:null,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""},
 {id:"e87",name:"Toro 5500",type:"Reel Mower",make:"Toro",model:"5500",year:null,fuel:"Diesel",hours:null,location:"Bullpen",oilType:"",oilFilter:"",reels:5,cassettes:null,manualUrl:"",photo:null,jobs:[],status:"available",holder:null,task:null,flagged:false,active:true,notes:""}
];
(function(){var naRe=/^(na|n\/a|n\.a\.?|none|null|-|—)$/i;EQUIP.forEach(function(m){['make','model','type','fuel','location','oilType','oilFilter','notes'].forEach(function(k){if(m[k]!=null&&naRe.test((''+m[k]).trim()))m[k]='';});['reels','cassettes','year','hours'].forEach(function(k){if(m[k]!=null&&naRe.test((''+m[k]).trim()))m[k]=null;});});})();
let EQCHECKOUT=[];
let EQMAINT=[];
let EQPROBLEMS=[];
/* Service-history entries had no id until 2026-08-30, because nothing outside
   this phone ever needed to name one. Sharing them does: every drawer keys its
   records by id, and two phones logging a service in the same second must not
   land on the same one.

   Rows already sitting on somebody's phone are stamped on READ rather than
   being migrated, exactly as the field log does (flStampIds) -- a migration
   would have to run once on twenty-three phones and be right every time, while
   stamping on read simply cannot be missed. */
function eqMaintNewId(){ return newId('m'); }
function eqMaintStampIds(){
  for(var i=0;i<EQMAINT.length;i++){ if(!EQMAINT[i].id) EQMAINT[i].id=eqMaintNewId(); }
}
/* ---- interval-based maintenance schedules ---- */
function eqToday(){var d=new Date();d.setHours(0,0,0,0);return d;}
function daysAgo(n){var d=eqToday();d.setDate(d.getDate()-(n||0));return d;}
function schedDaysUntil(s){var nd=new Date(s.lastDone);nd.setHours(0,0,0,0);nd.setDate(nd.getDate()+s.intervalDays);return Math.round((nd-eqToday())/86400000);}
function dueMeta(d){
 if(d<0)return {lbl:'Overdue '+(-d)+'d',color:'#c0392b',bg:'#fdeceb',fg:'#c0392b'};
 if(d===0)return {lbl:'Due today',color:'#b26a00',bg:'#fef1dc',fg:'#9a5b00'};
 if(d<=7)return {lbl:'Due in '+d+'d',color:'#b26a00',bg:'#fef1dc',fg:'#9a5b00'};
 return {lbl:'Due in '+d+'d',color:'#7b828d',bg:'#eef1f4',fg:'#5b6470'};
}
let EQSCHED=[
 /* Empty on purpose — see TASKS. Held 6 sample service schedules. */
];
/* ---- roles ----
   These four decide which buttons the equipment screens draw. They used to
   work it out from currentRole; since 2026-08-30 they ask the four functions
   over in app-02-fieldlog-sync.js, which read the ROSTER.

   WHY THAT MATTERS, in one sentence: those same four rules are now written
   into firestore.rules and enforced on every phone, so the button on screen
   and the answer the database will give have to come from ONE place. When they
   came from two, the app could cheerfully offer a button whose write the
   database then refused -- which looks, to whoever tapped it, like the app is
   broken.

   The fallbacks are the old behaviour, and they are only reached if this file
   somehow loads without app-02. Any real change goes in app-02. */
function eqCanReport(){
  return (typeof eqCanReportProblem==='function') ? eqCanReportProblem()
       : (currentRole==='manager'||currentRole==='tech'||currentRole==='grad');
}
function eqCanDown(){
  return (typeof eqCanTakeDown==='function') ? eqCanTakeDown()
       : (currentRole==='manager'||currentRole==='tech');
}
function eqCanEdit(){
  return (typeof eqCanEditMachine==='function') ? eqCanEditMachine()
       : (currentRole!=='grad'&&currentRole!=='undergrad');
}
function eqCanMaint(){
  return (typeof eqCanMaintain==='function') ? eqCanMaintain()
       : (currentRole==='manager'||currentRole==='tech');
}
function eqStat(s){
 if(s==='down')return {lbl:'Down',dot:'#c0392b',bg:'#fdeceb',fg:'#c0392b'};
 if(s==='in_use')return {lbl:'In use',dot:'#489FDF',bg:'#e8eff5',fg:'#42688a'};
 return {lbl:'Available',dot:'#2f9e4f',bg:'#eafaef',fg:'#2f7d3a'};
}
function eqTypeLabel(t){return (t&&(''+t).trim())||'Other';}
function eqActive(id){var m=EQUIP.find(function(x){return x.id===id;});return m&&m.active;}
/* ---- shell / tabs ---- */
function eqSyncSearch(){var s=document.getElementById('eq-search');if(s)s.style.display=(eqTab==='home')?'block':'none';}
function equipEnter(){
 var add=document.getElementById('eq-addbtn'); if(add)add.style.display=eqCanEdit()?'block':'none';
 var seg=document.getElementById('eq-seg'); if(seg)seg.querySelectorAll('span').forEach(function(sp){sp.classList.toggle('on',sp.getAttribute('data-t')===eqTab);});
 eqSyncSearch(); renderEquip();
}
function renderEquip(){ if(eqTab==='status')renderEquipStatus(); else if(eqTab==='maint')renderEquipMaint(); else renderEquipHome(); eqSyncActionbar(); }
function eqSyncActionbar(){var ab=document.getElementById('eq-actionbar');if(ab)ab.style.display=(eqTab==='maint'&&eqCanMaint())?'':'none';}
function equipRow(m){
 var st=eqStat(m.status);
 var sub = m.status==='in_use' ? (esc(m.holder||'—')+(m.task?' · '+esc(m.task):'')) : (m.status==='down' ? (m.notes?esc(m.notes):'Out of service') : (m.notes?esc(m.notes):'Ready'));
 var flag = (m.flagged&&m.status!=='down') ? '<span class="pill" style="background:#fef1dc;color:#9a5b00;margin-right:4px">⚠ Issue</span>' : '';
 return '<div class="row tap" data-eq="'+m.id+'"><span class="dot" style="background:'+st.dot+'"></span><div style="flex:1;min-width:0"><div class="rt" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(m.name)+'</div><div class="rs">'+eqTypeLabel(m.type)+' · '+sub+'</div></div>'+flag+'<span class="pill" style="background:'+st.bg+';color:'+st.fg+'">'+st.lbl+'</span></div>';
}
function equipRowPlain(m){
 var flag = m.flagged ? '<span class="pill" style="background:#fef1dc;color:#9a5b00;margin-right:2px">⚠</span>' : '';
 return '<div class="row tap" data-eq="'+m.id+'"><div style="flex:1;min-width:0"><div class="rt" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(m.name)+'</div><div class="rs">'+eqTypeLabel(m.type)+'</div></div>'+flag+'<span style="color:#c9ccd1;font-size:20px;line-height:1;padding-left:2px">›</span></div>';
}
function renderEquipHome(){
 var body=document.getElementById('eq-body'); if(!body)return;
 var press=EQSCHED.map(function(s){return {s:s,d:schedDaysUntil(s)};}).filter(function(x){return x.d<=7&&eqActive(x.s.eq);}).sort(function(a,b){return a.d-b.d;});
 var mh='';
 if(press.length){
   mh='<div class="invhead" style="color:#9a5b00">⚠ Maintenance needed · '+press.length+'</div><div class="list">'+press.map(function(x){
     var m=EQUIP.find(function(e){return e.id===x.s.eq;}); var dm=dueMeta(x.d);
     return '<div class="row tap" data-eq="'+x.s.eq+'"><span class="dot" style="background:'+dm.color+'"></span><div style="flex:1;min-width:0"><div class="rt">'+(m?esc(m.name):'—')+' · '+(EQMTL[x.s.type]||'Service')+'</div><div class="rs">'+(x.s.note?esc(x.s.note)+' · ':'')+'every '+x.s.intervalDays+'d</div></div><span class="pill" style="background:'+dm.bg+';color:'+dm.fg+'">'+dm.lbl+'</span></div>';
   }).join('')+'</div>';
 } else {
   mh='<div class="invhead" style="color:#2f7d3a">Maintenance</div><div class="list"><div class="row"><span class="dot" style="background:#2f9e4f"></span><div class="rt">All caught up ✓</div></div></div>';
 }
 var q=(eqSearch||'').trim().toLowerCase();
 var list=EQUIP.filter(function(m){return m.active && (!q || m.name.toLowerCase().indexOf(q)>=0 || eqTypeLabel(m.type).toLowerCase().indexOf(q)>=0 || (m.make&&m.make.toLowerCase().indexOf(q)>=0) || (m.model&&m.model.toLowerCase().indexOf(q)>=0));});
 var rl = list.length ? '<div class="list">'+list.map(equipRowPlain).join('')+'</div>' : '<div class="sec" style="text-align:center;margin-top:20px">No machines match</div>';
 body.innerHTML=mh+'<div class="invhead">All equipment · '+list.length+'</div>'+rl;
}
function renderEquipStatus(){
 var body=document.getElementById('eq-body'); if(!body)return;
 var list=EQUIP.filter(function(m){return m.active;});
 var html='';
 [['down','Down'],['in_use','In use'],['available','Available']].forEach(function(g){
   var grp=list.filter(function(m){return m.status===g[0];});
   if(!grp.length)return;
   html+='<div class="invhead">'+g[1]+' · '+grp.length+'</div><div class="list">'+grp.map(equipRow).join('')+'</div>';
 });
 var arch=EQUIP.filter(function(m){return !m.active;});
 if(arch.length){
   html+='<div class="invhead" style="color:#9aa0a8">Archived · '+arch.length+'</div><div class="list">'+arch.map(function(m){return '<div class="row tap" data-eq="'+m.id+'" style="opacity:.65"><span class="dot" style="background:#c9ccd1"></span><div style="flex:1;min-width:0"><div class="rt">'+esc(m.name)+'</div><div class="rs">'+eqTypeLabel(m.type)+' · archived</div></div></div>';}).join('')+'</div>';
 }
 body.innerHTML=html||'<div class="sec" style="text-align:center;margin-top:20px">No machines</div>';
}
function eqSchedRow(x,can){
 var m=EQUIP.find(function(e){return e.id===x.s.eq;}); var dm=dueMeta(x.d);
 var doneBtn = can ? '<span class="pill tap" data-schdone="'+x.s.id+'" style="background:#eafaef;color:#2f7d3a;margin-left:6px">Done</span>' : '';
 return '<div class="row'+(can?' tap':'')+'"'+(can?' data-sched="'+x.s.id+'"':'')+'><span class="dot" style="background:'+dm.color+'"></span><div style="flex:1;min-width:0"><div class="rt">'+(m?esc(m.name):'—')+' · '+(EQMTL[x.s.type]||'Service')+'</div><div class="rs">'+(x.s.note?esc(x.s.note)+' · ':'')+'every '+x.s.intervalDays+'d</div></div><span class="pill" style="background:'+dm.bg+';color:'+dm.fg+'">'+dm.lbl+'</span>'+doneBtn+'</div>';
}
function renderEquipMaint(){
 var body=document.getElementById('eq-body'); if(!body)return;
 var can=eqCanMaint();
 var rows=EQSCHED.filter(function(s){return eqActive(s.eq);}).map(function(s){return {s:s,d:schedDaysUntil(s)};}).sort(function(a,b){return a.d-b.d;});
 var due=rows.filter(function(x){return x.d<=7;}), later=rows.filter(function(x){return x.d>7;});
 var html='';
 html+='<div class="invhead" style="color:#9a5b00">Due soon / overdue · '+due.length+'</div>';
 html+= due.length ? '<div class="list">'+due.map(function(x){return eqSchedRow(x,can);}).join('')+'</div>' : '<div class="list"><div class="row"><div class="rs" style="padding:4px 2px">Nothing due within 7 days ✓</div></div></div>';
 if(later.length){ html+='<div class="invhead">Scheduled · '+later.length+'</div><div class="list">'+later.map(function(x){return eqSchedRow(x,can);}).join('')+'</div>'; }
 body.innerHTML=html;
}
function markSchedDone(id){
 var s=EQSCHED.find(function(x){return x.id===id;}); if(!s)return;
 s.lastDone=eqToday();
 EQMAINT.unshift({id:eqMaintNewId(),eq:s.eq,type:s.type,at:atToday(null),by:SESSION.pid,note:(s.note||'Scheduled service'),task:null});
 toast((EQMTL[s.type]||'Service')+' logged ✓');
 renderEquip();
}
function eqPhotoInput(){
 var inp=document.getElementById('eq-photo-file');
 if(!inp){
   inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.id='eq-photo-file'; inp.style.display='none'; document.body.appendChild(inp);
   inp.addEventListener('change',function(){
     var f=inp.files&&inp.files[0]; if(!f){return;}
     var mp=EQUIP.find(function(x){return x.id===window.eqPhotoFor;}); if(!mp){inp.value='';return;}
     var r=new FileReader();
     r.onload=function(){mp.photo=r.result;toast('Photo added ✓');stack=stack.filter(function(x){return x!=='eqdetail';});openMachine(mp.id);};
     r.readAsDataURL(f); inp.value='';
   });
 }
 return inp;
}
function eqPhotoPick(id){window.eqPhotoFor=id;eqPhotoInput().click();}
function openMachine(id){
 var m=EQUIP.find(function(x){return x.id===id;}); if(!m)return;
 window.eqCur=id;
 var can=eqCanEdit();
 var st=eqStat(m.status);
 var photo = m.photo
   ? '<div style="position:relative">'
     +'<div'+(can?' class="tap" data-eqphoto="1"':'')+' style="height:150px;background:#000;background-image:url(\''+esc(m.photo)+'\');background-size:cover;background-position:center"></div>'
     +(can?'<span class="tap" data-eqphotodel="1" title="Remove photo" style="position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:14px;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1">✕</span>':'')
     +'</div>'
   : (can ? '<div class="tap" data-eqphoto="1" style="height:104px;background:#f1f2f4;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9aa0a8;font:600 12px \'Public Sans\',sans-serif"><div style="font-size:24px;line-height:1.2">📷</div>Tap to add a photo</div>' : '');
 var rows='';
 if(m.make||m.model)rows+=fldRowI('Make / model', esc((m.make||'')+((m.make&&m.model)?' · ':'')+(m.model||'')));
 if(m.year)rows+=fldRowI('Year', esc(''+m.year));
 rows+=fldRowI('Type', eqTypeLabel(m.type));
 if(m.reels!=null&&m.reels!=='')rows+=fldRowI('Number of reels', esc(''+m.reels));
 if(m.cassettes!=null&&m.cassettes!=='')rows+=fldRowI('Cassettes', esc(''+m.cassettes));
 if(m.fuel)rows+=fldRowI('Fuel', esc(m.fuel));
 if(m.hours!=null&&m.hours!=='')rows+=fldRowI('Engine hours', esc(''+m.hours)+' h');
 if(m.location)rows+=fldRowI('Location', esc(m.location));
 if(m.oilType)rows+=fldRowI('Oil type', esc(m.oilType));
 if(m.oilFilter)rows+=fldRowI('Oil filter', esc(m.oilFilter));
 var jobTypes=[]; (typeof TASKS!=='undefined'?TASKS:[]).forEach(function(tk){ if(tk.machine===id&&tk.type&&tk.type!=='Equipment repair'&&jobTypes.indexOf(tk.type)<0)jobTypes.push(tk.type); });
 rows+=fldRowI('Runs jobs', jobTypes.length?jobTypes.map(esc).join(', '):'— (assign this machine on a task)');
 if(m.status==='in_use')rows+=fldRowI('Checked out to', esc(m.holder||'—')+(m.task?' · '+esc(m.task):''));
 rows+=fldRowI('Notes', m.notes?esc(m.notes):'—', true);
 var manualRow = m.manualUrl ? '<div class="list"><a class="row" href="'+esc(m.manualUrl)+'" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="dot" style="background:#2456b8"></span><div style="flex:1;min-width:0"><div class="rt">📖 Owner&#39;s / maintenance manual</div><div class="rs" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(m.manualUrl)+'</div></div><span style="color:#c9ccd1;font-size:16px">↗</span></a></div>' : '';
 var probs=EQPROBLEMS.filter(function(p){return p.eq===id&&p.status==='open';});
 var probBanner = probs.length ? '<div style="margin:12px 16px;background:#fef1dc;border:1px solid #f0d28a;border-radius:12px;padding:11px 13px;font:600 12px;color:#9a5b00">⚠ Issue reported: '+esc(probs[0].desc)+' — repair task is on the board'+(probs[0].downBy?' · confirmed Down by '+esc(nameOf(probs[0].downBy)):'')+'</div>' : '';
 var sch=EQSCHED.filter(function(s){return s.eq===id;}).map(function(s){return {s:s,d:schedDaysUntil(s)};}).sort(function(a,b){return a.d-b.d;});
 var schHtml = sch.length ? sch.map(function(x){var dm=dueMeta(x.d);return '<div class="row"><span class="dot" style="background:'+dm.color+'"></span><div style="flex:1"><div class="rt">'+(EQMTL[x.s.type]||'Service')+' · every '+x.s.intervalDays+'d</div><div class="rs">'+(x.s.note?esc(x.s.note)+' · ':'')+dm.lbl+'</div></div></div>';}).join('') : '<div class="row"><div class="rs" style="padding:4px 2px">No scheduled maintenance</div></div>';
 var schAdd = '';
 var logs=EQCHECKOUT.filter(function(l){return l.eq===id;});
 var logHtml = logs.length ? logs.map(function(l){
   var open=!l.in;
   return '<div class="row"><span class="dot" style="background:'+(open?'#489FDF':'#2f9e4f')+'"></span><div style="flex:1"><div class="rt">'+esc(l.user)+' · '+esc(l.task)+'</div><div class="rs">Out '+esc(l.out)+(l.in?' · In '+esc(l.in):' · still out')+'</div></div></div>';
 }).join('') : '<div class="row"><div class="rs" style="padding:4px 2px">No checkout history yet</div></div>';
 var mnt=EQMAINT.filter(function(x){return x.eq===id;});
 var mntHtml = mnt.length ? mnt.map(function(x){
   return '<div class="row"><span class="dot" style="background:#7b828d"></span><div style="flex:1"><div class="rt">'+(EQMTL[x.type]||'Service')+(x.note?' · '+esc(x.note):'')+'</div><div class="rs">'+esc(fmtDay(x.at)||x.at||x.date||'')+' · '+esc(nameOf(x.by))+'</div></div></div>';
 }).join('') : '<div class="row"><div class="rs" style="padding:4px 2px">No service records yet</div></div>';
 var addMaint = eqCanEdit() ? (m.active
   ? '<div class="list" style="margin-top:10px"><div class="row tap" data-eqarchive="1"><span class="dot" style="background:#c0392b"></span><div class="rt" style="color:#c0392b">Archive equipment</div></div></div>'
   : '<div class="list" style="margin-top:10px"><div class="row tap" data-eqrestore="1"><span class="dot" style="background:#2f9e4f"></span><div class="rt" style="color:#2f7d3a">Restore equipment</div></div></div>') : '';
 var editRow = can ? '<div class="list" style="margin-top:8px"><div class="row tap" data-go="eqedit" data-eqedit="'+m.id+'"><span class="dot" style="background:#ff8200"></span><div class="rt">Edit machine details</div></div></div>' : '';
 var adminRow = can ? (m.active
   ? '<div class="list"><div class="row tap" data-eqarchive="1"><span class="dot" style="background:#c0392b"></span><div class="rt" style="color:#c0392b">Archive machine</div></div></div>'
   : '<div class="list"><div class="row tap" data-eqrestore="1"><span class="dot" style="background:#2f9e4f"></span><div class="rt" style="color:#2f7d3a">Restore machine</div></div></div>') : '';
 var archTag = !m.active ? '<span class="pill" style="background:#eef1f4;color:#9aa0a8">Archived</span>' : '<span class="pill" style="background:'+st.bg+';color:'+st.fg+'">'+st.lbl+'</span>';
 var down=m.status==='down';
 var statusToggle = !m.active ? '' : (eqCanDown()
   ? '<div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Machine status</span><span style="display:flex;align-items:center;gap:9px"><span style="font:800 12px \'Public Sans\',sans-serif;color:'+(down?'#c0392b':st.fg)+'">'+(down?'Down':st.lbl)+'</span><span class="tap" data-eqtoggle="1" style="width:46px;height:26px;border-radius:14px;position:relative;flex:none;cursor:pointer;transition:background .15s;background:'+(down?'#c0392b':'#2f9e4f')+'"><span style="position:absolute;top:3px;left:'+(down?'23':'3')+'px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s"></span></span></span></div></div>'
   : '<div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Machine status</span><span class="pill" style="background:'+st.bg+';color:'+st.fg+'">'+st.lbl+'</span></div></div>');
 document.getElementById('eqd-body').innerHTML=
   '<div class="hdr'+(can?' tap':'')+'"'+(can?' data-go="eqedit" data-eqedit="'+m.id+'"':'')+' style="background:#2f3133;padding:15px 16px;gap:10px;align-items:center"><div class="title" style="color:#fff;font-size:17px;flex:1;line-height:1.15">'+esc(m.name)+'</div>'+(can?'<span style="font:700 11px \'Public Sans\',sans-serif;color:#c9ccd1">Edit ›</span>':'')+archTag+'</div>'
  +photo
  +statusToggle
  +probBanner
  +'<div class="sec">Details</div><div class="list">'+rows+'</div>'
  +manualRow
  +'<div class="sec">Upcoming service</div><div class="list">'+schHtml+'</div>'+schAdd
  +'<div class="sec">Checkout log</div><div class="list">'+logHtml+'</div>'
  +'<div class="sec">Maintenance history</div><div class="list">'+mntHtml+'</div>'+addMaint;
 var acts='';
 if(!m.active){
   acts = can ? '<div style="text-align:center;width:100%;font:700 12px \'Public Sans\',sans-serif;color:var(--muted);padding:6px">Archived — restore below to reactivate</div>' : '<div style="text-align:center;width:100%;font:700 12px \'Public Sans\',sans-serif;color:var(--muted);padding:6px">Archived — view only</div>';
 } else if(eqCanMaint()){
   acts='<div class="action tap" data-maintnew="1" style="flex:1">＋ Log maintenance</div>';
 } else if(eqCanReport()){
   acts='<div class="action tap" data-eqreportbtn="1" data-go="eqreport" style="flex:1;background:#fff;color:#c0392b;border:1.5px solid #f3c0ba">Report a Problem</div>';
 } else {
   acts='<div style="text-align:center;width:100%;font:700 12px \'Public Sans\',sans-serif;color:var(--muted);padding:6px">View only</div>';
 }
 document.getElementById('eqd-actions').innerHTML=acts;
 show('eqdetail',true);
}
document.getElementById('s-equipment').addEventListener('click',function(e){
 var seg=e.target.closest('.seg span'); if(seg){eqTab=seg.getAttribute('data-t')||'home';eqSyncSearch();renderEquip();return;}
 var done=e.target.closest('[data-schdone]'); if(done){markSchedDone(done.getAttribute('data-schdone'));return;}
 var sch=e.target.closest('[data-sched]'); if(sch){window.eqSchedEditId=sch.getAttribute('data-sched');window.eqMaintMachine=null;go('eqmaint');return;}
 var addm=e.target.closest('[data-maintnew]'); if(addm){window.eqSchedEditId=null;window.eqMaintMachine=null;window.eqMaintMode='single';go('eqmaint');return;}
 var row=e.target.closest('[data-eq]'); if(row){openMachine(row.getAttribute('data-eq'));return;}
});
document.getElementById('eq-search').addEventListener('input',function(){eqSearch=this.value;if(eqTab==='home')renderEquipHome();});
document.getElementById('s-eqdetail').addEventListener('click',function(e){
 if(e.target.closest('[data-eqphotodel]')){
   if(!eqCanEdit())return;
   var md=EQUIP.find(function(x){return x.id===window.eqCur;}); if(md){md.photo=null;toast('Photo removed');stack=stack.filter(function(x){return x!=='eqdetail';});openMachine(md.id);}
   return;
 }
 if(e.target.closest('[data-eqphoto]')){
   if(!eqCanEdit())return;
   eqPhotoPick(window.eqCur);
   return;
 }
 if(e.target.closest('[data-eqarchive]')){
   var ma=EQUIP.find(function(x){return x.id===window.eqCur;}); if(ma){ma.active=false;toast(ma.name+' archived');eqTab='home';stack=stack.filter(function(x){return x!=='eqdetail';});show('equipment');}
   return;
 }
 if(e.target.closest('[data-eqrestore]')){
   var mr=EQUIP.find(function(x){return x.id===window.eqCur;}); if(mr){mr.active=true;toast(mr.name+' restored ✓');stack=stack.filter(function(x){return x!=='eqdetail';});openMachine(mr.id);}
   return;
 }
 if(e.target.closest('[data-maintnew]')){window.eqSchedEditId=null;window.eqMaintMachine=window.eqCur;window.eqMaintMode='single';go('eqmaint');return;}
 if(e.target.closest('[data-eqreportbtn]')){window.eqReportSetDown=false;/* fall through to global nav */}
 if(e.target.closest('[data-eqtoggle]')){
   e.stopPropagation();
   if(!eqCanDown())return;
   var mt=EQUIP.find(function(x){return x.id===window.eqCur;}); if(!mt)return;
   if(mt.status==='down'){
     mt.status='available';mt.flagged=false;
     var p=EQPROBLEMS.find(function(pp){return pp.eq===mt.id&&pp.status==='open';});
     /* Same completion stamp completeTask() writes -- without it this job
        would carry status:'done' but no completedAt, and the Completed tab's
        "today" filter would drop it even though it was just closed. */
     var tid=null; if(p){p.status='resolved';tid=p.repairTask;var rt=TASKS.find(function(t){return t.id===p.repairTask;});if(rt){rt.status='done';rt.completedBy=rt.assignee||SESSION.pid;rt.completedAt=isoLocal(new Date());}}
     EQMAINT.unshift({id:eqMaintNewId(),eq:mt.id,type:'repair',at:atToday(null),by:SESSION.pid,note:'Repair completed',task:tid});
     toast(mt.name+' back in service ✓');
     stack=stack.filter(function(x){return x!=='eqdetail';});
     openMachine(mt.id);
   } else {
     eqModal('Mark <b>'+esc(mt.name)+'</b> as <b>Down</b>? Please file a problem report so the crew knows what’s wrong.','Yes, file report',function(){window.eqReportSetDown=true;go('eqreport');},null);
   }
   return;
 }
});
function renderEqReport(){
 var m=EQUIP.find(function(x){return x.id===window.eqCur;});
 document.getElementById('eqr-body').innerHTML=
   '<div class="sec" style="margin:12px 18px 7px">Machine</div><div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Machine</span><span class="fv">'+(m?esc(m.name):'—')+'</span></div></div>'
  +'<div class="sec" style="margin:14px 18px 7px">What&#39;s wrong?</div><div style="margin:0 16px"><textarea class="inv-in" id="eqr-desc" placeholder="Describe the problem…" style="width:100%;min-height:96px;resize:vertical;padding:10px"></textarea></div>'
  +'<div style="margin:12px 16px;background:'+(window.eqReportSetDown?'#fdeceb':'#eef4ff')+';border:1px solid '+(window.eqReportSetDown?'#f3c0ba':'#cfe0ff')+';border-radius:12px;padding:11px 13px;font:600 11.5px;color:'+(window.eqReportSetDown?'#c0392b':'#2456b8')+'">'+(window.eqReportSetDown?'Submitting this report will mark the machine <b>Down</b> and create a repair task assigned to Bill.':'This flags the machine and creates a repair task assigned to Bill. Only Bill or a technician can then set the machine Down.')+'</div>'
  +whoBlock();
}
document.getElementById('eqr-save').addEventListener('click',function(){
 var m=EQUIP.find(function(x){return x.id===window.eqCur;}); if(!m){toast('No machine selected');return;}
 var d=(document.getElementById('eqr-desc').value||'').trim(); if(!d){toast('Describe the problem');return;}
 m.flagged=true;
 var tid=newId('t');
 TASKS.unshift({createdBy:SESSION.pid,id:tid,title:'Repair '+m.name,area:'Shop',assignee:'p07',status:'todo',kind:'task',badge:{t:'Repair',bg:'#fdeceb',fg:'#c0392b'},type:'Equipment repair',dueAt:atToday(null),repeat:'None',desc:d+' (reported by '+meName()+')'});
 EQPROBLEMS.unshift({id:newId('p'),eq:m.id,by:SESSION.pid,desc:d,repairTask:tid,downBy:null,status:'open',at:isoLocal(new Date())});
 if(window.eqReportSetDown){m.status='down';m.holder=null;m.task=null;EQPROBLEMS[0].downBy=SESSION.pid;}
 var wasDown=window.eqReportSetDown; window.eqReportSetDown=false;
 toast(wasDown?'Reported · '+esc(m.name)+' set Down ✓':'Problem reported · repair task created ✓');
 stack=stack.filter(function(x){return x!=='eqreport';});
 openMachine(m.id);
});
function eqmApplyMode(mode){
 window.eqMaintMode=mode;
 var single=document.getElementById('eqm-single'), sched=document.getElementById('eqm-sched');
 if(single)single.style.display=(mode==='single')?'':'none';
 if(sched)sched.style.display=(mode==='schedule')?'':'none';
 var tg=document.getElementById('eqm-toggle'); if(tg)tg.querySelectorAll('span').forEach(function(sp){sp.classList.toggle('on',sp.getAttribute('data-mm')===mode);});
 var sv=document.getElementById('eqm-save'); if(sv&&!window.eqSchedEditId)sv.textContent=(mode==='schedule'?'Add schedule':'Add entry');
}
function eqmPreview(){
 var pv=document.getElementById('eqm-preview'); if(!pv)return;
 var intv=parseInt((document.getElementById('eqm-int')||{}).value)||0;
 var ago=parseInt((document.getElementById('eqm-ago')||{}).value)||0;
 if(!intv){pv.style.background='#eef4ff';pv.style.borderColor='#cfe0ff';pv.style.color='#2456b8';pv.textContent='Enter how often (days) to see the next due date.';return;}
 var dd=intv-ago; var dm=dueMeta(dd);
 pv.style.background=dm.bg;pv.style.borderColor=dm.fg;pv.style.color=dm.fg;
 pv.textContent='Next due: '+dm.lbl+' · repeats every '+intv+' days';
}
function renderEqMaint(){
 var edSched=window.eqSchedEditId?EQSCHED.find(function(x){return x.id===window.eqSchedEditId;}):null;
 var mode=edSched?'schedule':(window.eqMaintMode||'single');
 window.eqMaintMode=mode;
 var machineId=edSched?edSched.eq:(window.eqMaintMachine||null);
 var m=machineId?EQUIP.find(function(x){return x.id===machineId;}):null;
 document.querySelector('#s-eqmaint .hdr .title').textContent=edSched?'Edit schedule':'Log maintenance';
 var types=[['oil_change','Oil change'],['reel_grind','Reel grind'],['backlap','Backlap'],['repair','Repair'],['other','Other']];
 var machines=EQUIP.filter(function(x){return x.active;});
 var machineBlock=m
   ? '<div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Machine</span><span class="fv">'+esc(m.name)+'</span></div></div>'
   : '<div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Machine</span><span class="tn-selwrap"><select class="inv-sel" id="eqm-eq">'+machines.map(function(x){return '<option value="'+x.id+'">'+esc(x.name)+'</option>';}).join('')+'</select></span></div></div>';
 var toggle=edSched?'':'<div class="seg" id="eqm-toggle" style="margin:12px 16px 4px"><span'+(mode==='single'?' class="on"':'')+' data-mm="single">Single entry</span><span'+(mode==='schedule'?' class="on"':'')+' data-mm="schedule">Schedule</span></div>';
 document.getElementById('eqm-body').innerHTML=
   '<div class="sec" style="margin:12px 18px 7px">Machine</div>'+machineBlock
  +toggle
  +'<div class="sec" style="margin:14px 18px 7px">Details</div><div class="list">'
  +'<div class="fld"><span class="fl">Type</span><select class="inv-sel" id="eqm-type">'+types.map(function(t){return '<option value="'+t[0]+'">'+t[1]+'</option>';}).join('')+'</select></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Note</span><input class="inv-in" id="eqm-note" placeholder="—" style="max-width:160px"></div></div>'
  +'<div id="eqm-single"><div class="sec" style="margin:14px 18px 7px">When performed</div><div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Date</span><input class="inv-in" type="date" id="eqm-date" style="max-width:170px"></div></div>'+whoBlock()+'</div>'
  +'<div id="eqm-sched"><div class="sec" style="margin:14px 18px 7px">How often</div><div class="list"><div class="fld"><span class="fl">Repeat every (days)</span><input class="inv-in" id="eqm-int" inputmode="numeric" placeholder="30" style="max-width:90px"></div><div class="fld" style="border-bottom:none"><span class="fl">Last done (days ago)</span><input class="inv-in" id="eqm-ago" inputmode="numeric" placeholder="0" style="max-width:90px"></div></div><div id="eqm-preview" style="margin:12px 16px;border:1px solid #cfe0ff;border-radius:12px;padding:11px 13px;font:600 11.5px;color:#2456b8;background:#eef4ff"></div></div>';
 if(edSched){document.getElementById('eqm-type').value=edSched.type;document.getElementById('eqm-note').value=edSched.note||'';document.getElementById('eqm-int').value=edSched.intervalDays;document.getElementById('eqm-ago').value=Math.max(0,edSched.intervalDays-schedDaysUntil(edSched));}
 eqmApplyMode(mode);
 document.getElementById('eqm-save').textContent=edSched?'Save changes':(mode==='schedule'?'Add schedule':'Add entry');
 eqmPreview();
}
document.getElementById('s-eqmaint').addEventListener('click',function(e){
 var sg=e.target.closest('#eqm-toggle span'); if(sg){eqmApplyMode(sg.getAttribute('data-mm'));return;}
});
document.getElementById('s-eqmaint').addEventListener('input',function(e){if(e.target.id==='eqm-int'||e.target.id==='eqm-ago')eqmPreview();});
document.getElementById('eqm-save').addEventListener('click',function(){
 var edSched=window.eqSchedEditId?EQSCHED.find(function(x){return x.id===window.eqSchedEditId;}):null;
 var mode=edSched?'schedule':(window.eqMaintMode||'single');
 var sel=document.getElementById('eqm-eq');
 var machineId=edSched?edSched.eq:(window.eqMaintMachine||(sel?sel.value:null));
 if(!machineId){toast('Pick a machine');return;}
 var ty=document.getElementById('eqm-type').value;
 var note=(document.getElementById('eqm-note').value||'').trim();
 if(mode==='schedule'){
   var intv=parseInt(document.getElementById('eqm-int').value)||0;
   if(!intv||intv<=0){toast('Enter how often (days)');return;}
   var ago=parseInt(document.getElementById('eqm-ago').value)||0;
   var ld=daysAgo(ago);
   if(edSched){edSched.eq=machineId;edSched.type=ty;edSched.intervalDays=intv;edSched.lastDone=ld;edSched.note=note;toast('Schedule updated ✓');}
   else{EQSCHED.push({id:newId('s'),eq:machineId,type:ty,intervalDays:intv,lastDone:ld,note:note});toast('Schedule added ✓');}
 } else {
   /* A date input yields YYYY-MM-DD, which is already the stored form. */
   var dt=(document.getElementById('eqm-date').value||'').trim()||todayISO();
   EQMAINT.unshift({id:eqMaintNewId(),eq:machineId,type:ty,at:dt,by:SESSION.pid,note:note,task:null});
   toast('Maintenance logged ✓');
 }
 var back=window.eqMaintMachine;
 window.eqSchedEditId=null; window.eqMaintMachine=null;
 stack=stack.filter(function(x){return x!=='eqmaint';});
 if(back){openMachine(back);} else {eqTab='maint';show('equipment');}
});
function eqeInput(l,id,ph,mw){return '<div class="fld"><span class="fl">'+l+'</span><input class="inv-in" id="'+id+'" placeholder="'+ph+'" style="max-width:'+(mw||160)+'px"></div>';}
function renderEqEdit(){
 var ed=window.eqEditId?EQUIP.find(function(x){return x.id===window.eqEditId;}):null;
 document.querySelector('#s-eqedit .hdr .title').textContent=ed?'Edit machine':'Add machine';
 document.getElementById('eqe-save').textContent=ed?'Save changes':'Add machine';
 document.getElementById('eqe-body').innerHTML=
   '<div class="sec" style="margin:12px 18px 7px">Machine</div><div class="list">'
  +'<div class="fld"><span class="fl">Name *</span><input class="inv-in" id="eqe-name" placeholder="e.g. Toro 3" style="max-width:170px"></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Type</span><input class="inv-in" id="eqe-type" placeholder="e.g. Fairway Reel Mower" style="max-width:185px"></div></div>'
  +'<div class="sec" style="margin:14px 18px 7px">Specs</div><div class="list">'
  +eqeInput('Make','eqe-make','e.g. Toro')
  +eqeInput('Model','eqe-model','e.g. Greensmaster 3150')
  +eqeInput('Fuel','eqe-fuel','e.g. Gasoline',150)
  +eqeInput('Number of reels','eqe-reels','—',80)
  +eqeInput('Cassettes','eqe-cassettes','—',80)
  +eqeInput('Year','eqe-year','2020',90)
  +eqeInput('Engine hours','eqe-hours','0',90)
  +eqeInput('Location','eqe-location','e.g. Shop')
  +eqeInput('Oil type','eqe-oiltype','e.g. SAE 10W-30')
  +'<div class="fld" style="border-bottom:none"><span class="fl">Oil filter</span><input class="inv-in" id="eqe-oilfilter" placeholder="part #" style="max-width:160px"></div></div>'
  +'<div class="sec" style="margin:14px 18px 7px">Manual &amp; photo</div><div class="list">'
  +'<div class="fld"><span class="fl">Manual link</span><input class="inv-in" id="eqe-manual" placeholder="https://…" style="max-width:170px"></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Photo URL</span><input class="inv-in" id="eqe-photo" placeholder="https://…" style="max-width:170px"></div></div>'
  +'<div style="margin:14px 16px 2px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:12px;padding:10px 12px;font:600 11px;color:#2456b8">Jobs this machine runs are pulled from the task manager — pick this machine when creating a task, and they’ll appear here automatically.</div>'
  +'<div class="sec" style="margin:14px 18px 7px">Notes</div><div class="list"><div class="fld" style="border-bottom:none"><span class="fl">Notes</span><input class="inv-in" id="eqe-notes" placeholder="—" style="max-width:160px"></div></div>';
 if(ed){
   var g=function(x){return document.getElementById('eqe-'+x);};
   g('name').value=ed.name; g('type').value=ed.type;
   g('reels').value=(ed.reels==null?'':ed.reels); g('cassettes').value=(ed.cassettes==null?'':ed.cassettes);
   g('make').value=ed.make||''; g('model').value=ed.model||''; g('year').value=ed.year||'';
   g('fuel').value=ed.fuel||''; g('hours').value=(ed.hours==null?'':ed.hours); g('location').value=ed.location||'';
   g('oiltype').value=ed.oilType||''; g('oilfilter').value=ed.oilFilter||'';
   g('manual').value=ed.manualUrl||''; g('photo').value=ed.photo||''; g('notes').value=ed.notes||'';
 }
}
document.getElementById('s-eqedit').addEventListener('click',function(e){
 var c=e.target.closest('.eqjob'); if(!c)return;
 c.classList.toggle('on'); var on=c.classList.contains('on');
 c.style.border='1px solid '+(on?'#ff8200':'#d7dade'); c.style.background=on?'#fff6ec':'#fff'; c.style.color=on?'#9a5b00':'#5b6470';
});
document.getElementById('eqe-save').addEventListener('click',function(){
 var g=function(x){return document.getElementById('eqe-'+x);};
 var nm=(g('name').value||'').trim(); if(!nm){toast('Enter a name');return;}
 var yr=parseInt(g('year').value)||null;
 var hrs=g('hours').value.trim()===''?null:(parseInt(g('hours').value)||0);
 var rl=g('reels').value.trim(); rl=(rl===''?null:(isNaN(+rl)?rl:+rl));
 var cs=g('cassettes').value.trim(); cs=(cs===''?null:(isNaN(+cs)?cs:+cs));
 var vals={name:nm,type:g('type').value.trim(),make:g('make').value.trim(),model:g('model').value.trim(),year:yr,fuel:g('fuel').value.trim(),hours:hrs,reels:rl,cassettes:cs,location:g('location').value.trim(),oilType:g('oiltype').value.trim(),oilFilter:g('oilfilter').value.trim(),manualUrl:g('manual').value.trim(),photo:g('photo').value.trim()||null,notes:g('notes').value.trim()};
 var ed=window.eqEditId?EQUIP.find(function(x){return x.id===window.eqEditId;}):null;
 if(ed){Object.keys(vals).forEach(function(k){ed[k]=vals[k];});toast('Saved changes ✓');window.eqEditId=null;stack=stack.filter(function(x){return x!=='eqedit';});openMachine(ed.id);return;}
 var id=newId('e');
 EQUIP.push(Object.assign({id:id,status:'available',holder:null,task:null,flagged:false,active:true,jobs:[]},vals));
 toast('Added '+nm+' ✓'); eqTab='home'; show('equipment'); stack=stack.filter(function(x){return x!=='eqedit';});
});
/* ---- maintenance schedule add/edit ---- */
function eqsPreview(){
 var pv=document.getElementById('eqs-preview'); if(!pv)return;
 var intv=parseInt((document.getElementById('eqs-int')||{}).value)||0;
 var ago=parseInt((document.getElementById('eqs-ago')||{}).value)||0;
 if(!intv){pv.style.background='#eef4ff';pv.style.borderColor='#cfe0ff';pv.style.color='#2456b8';pv.textContent='Enter an interval in days to see the next due date.';return;}
 var d=intv-ago; var dm=dueMeta(d);
 pv.style.background=dm.bg;pv.style.borderColor=dm.fg;pv.style.color=dm.fg;
 pv.textContent='Next due: '+dm.lbl+' · repeats every '+intv+' days';
}
function renderEqSched(){
 var ed=window.eqSchedEditId?EQSCHED.find(function(x){return x.id===window.eqSchedEditId;}):null;
 document.querySelector('#s-eqsched .hdr .title').textContent=ed?'Edit schedule':'Schedule maintenance';
 document.getElementById('eqs-save').textContent=ed?'Save changes':'Add schedule';
 var types=[['oil_change','Oil change'],['reel_grind','Reel grind'],['backlap','Backlap'],['repair','Repair'],['other','Other']];
 var machines=EQUIP.filter(function(m){return m.active;});
 document.getElementById('eqs-body').innerHTML=
   '<div class="sec" style="margin:12px 18px 7px">Operation</div><div class="list">'
  +'<div class="fld"><span class="fl">Machine</span><select class="inv-sel" id="eqs-eq">'+machines.map(function(m){return '<option value="'+m.id+'">'+esc(m.name)+'</option>';}).join('')+'</select></div>'
  +'<div class="fld"><span class="fl">Type</span><select class="inv-sel" id="eqs-type">'+types.map(function(t){return '<option value="'+t[0]+'">'+t[1]+'</option>';}).join('')+'</select></div>'
  +'<div class="fld"><span class="fl">Repeat every (days)</span><input class="inv-in" id="eqs-int" inputmode="numeric" placeholder="30" style="max-width:90px"></div>'
  +'<div class="fld"><span class="fl">Last done (days ago)</span><input class="inv-in" id="eqs-ago" inputmode="numeric" placeholder="0" style="max-width:90px"></div>'
  +'<div class="fld" style="border-bottom:none"><span class="fl">Note</span><input class="inv-in" id="eqs-note" placeholder="—" style="max-width:150px"></div></div>'
  +'<div id="eqs-preview" style="margin:12px 16px;border:1px solid #cfe0ff;border-radius:12px;padding:11px 13px;font:600 11.5px;color:#2456b8;background:#eef4ff"></div>';
 if(ed){document.getElementById('eqs-eq').value=ed.eq;document.getElementById('eqs-type').value=ed.type;document.getElementById('eqs-int').value=ed.intervalDays;document.getElementById('eqs-ago').value=Math.max(0,ed.intervalDays-schedDaysUntil(ed));document.getElementById('eqs-note').value=ed.note||'';}
 else if(window.eqSchedFor){document.getElementById('eqs-eq').value=window.eqSchedFor;}
 eqsPreview();
}
document.getElementById('s-eqsched').addEventListener('input',function(e){if(e.target.id==='eqs-int'||e.target.id==='eqs-ago')eqsPreview();});
document.getElementById('eqs-save').addEventListener('click',function(){
 var eqid=document.getElementById('eqs-eq').value;
 var ty=document.getElementById('eqs-type').value;
 var intv=parseInt(document.getElementById('eqs-int').value)||0;
 if(!intv||intv<=0){toast('Enter a repeat interval in days');return;}
 var ago=parseInt(document.getElementById('eqs-ago').value)||0;
 var note=(document.getElementById('eqs-note').value||'').trim();
 var ld=daysAgo(ago);
 var ed=window.eqSchedEditId?EQSCHED.find(function(x){return x.id===window.eqSchedEditId;}):null;
 if(ed){ed.eq=eqid;ed.type=ty;ed.intervalDays=intv;ed.lastDone=ld;ed.note=note;toast('Schedule updated ✓');window.eqSchedEditId=null;}
 else{EQSCHED.push({id:newId('s'),eq:eqid,type:ty,intervalDays:intv,lastDone:ld,note:note});toast('Schedule added ✓');}
 var backTo=window.eqSchedFor; window.eqSchedFor=null;
 stack=stack.filter(function(x){return x!=='eqsched';});
 if(backTo){openMachine(backTo);} else {eqTab='maint';show('equipment');}
});
app.addEventListener('click',function(e){
 var n=e.target.closest('[data-eqnew]'); if(n){window.eqEditId=null;return;}
 var ed=e.target.closest('[data-eqedit]'); if(ed){window.eqEditId=ed.getAttribute('data-eqedit');}
},true);
/* =================== end Equipment module =================== */

