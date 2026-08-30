/* ============================================================
   THE SHELL — what the app looks like before it holds any farm data.

   Per-person preferences, the adaptive shell (phone / roomy layout), the
   notification list, the home-screen widgets, and the theme: banner colour,
   text size, and colour-blind mode.

   ONE THING TO KNOW. Colour-blind mode works by reading the text of every
   <style> block in the page and rewriting the colours it finds (see cbCss()).
   That is why the app's CSS has to stay written inside UT-TurfFarm-App.html.
   Move the CSS out to a .css file and colour-blind mode stops working with no
   error at all -- nothing to see, just wrong colours for the people who need
   it most.
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
const app=document.getElementById('app');
let currentRole='manager', stack=[];
/* PAGE_DEST is the master label→screen catalog. Every page a role can reach gets
   a label here; per-role option lists below decide which labels that role sees. */
const PAGE_DEST={Tasks:'taskboard',Map:'map',Inventory:'inventory',Trials:'trial',Equip:'equipment',Field:'fieldlog',Clock:'timeclock',Calendar:'calendar',Weather:'weather'};
const HOME_DEST={manager:'home-manager',undergrad:'home-undergrad',grad:'home-grad',faculty:'home-faculty',tech:'home-tech'};
/* Every page each role has access to, in the order it should appear in Preferences.
   The first entries are the defaults most roles keep on the bottom bar. */
const NAV_OPTIONS={
 manager:['Tasks','Map','Inventory','Trials','Equip','Field','Clock','Calendar','Weather'],
 undergrad:['Tasks','Map','Clock','Trials','Field','Equip','Inventory','Calendar','Weather'],
 /* Time Clock (and the no-show list it holds) is limited to Bill, faculty and the
    undergrads themselves — grads and techs are not hourly and have no reason to see it. */
 grad:['Trials','Map','Tasks','Inventory','Equip','Field','Calendar','Weather'],
 faculty:['Trials','Map','Tasks','Inventory','Equip','Field','Clock','Calendar','Weather'],
 tech:['Tasks','Equip','Field','Trials','Map','Inventory','Calendar','Weather']
};
/* navMap is derived from the two tables above so a page only ever needs adding once. */
const navMap=(function(){var m={};Object.keys(NAV_OPTIONS).forEach(function(role){var o={Home:HOME_DEST[role],More:'more'};NAV_OPTIONS[role].forEach(function(l){if(PAGE_DEST[l])o[l]=PAGE_DEST[l];});m[role]=o;});return m;})();
/* ===================== Per-person preferences =====================
   Preferences follow the person, not the role. Two technicians share a role but
   they do not share eyesight, a home screen, or an opinion about how many rows
   belong on a card, so everything a person can tune is stored under their
   roster id.

   The catalog stays role-driven: the role decides which widgets and pages EXIST,
   the person decides which of them are on and how they look. Those are two
   different questions and conflating them is what made the old code share Bill's
   home screen with everyone else who ever logged in as manager.

   PREFS is one object rather than the six loose localStorage keys it replaces:
     { "<pid>": { nav:[...], hw:{off:[],order:[],rows:{}}, notif:{}, theme:{} } }
   Adding a new tunable is one entry in a person's bucket, not a new key with its
   own loader and saver.                                                     */
var PREFS_KEY='ut_prefs',PREFS={},PREFS_LAST_KEY='ut_last_person';
/* Who are we saving for. USERS is built further down the file, so anything that
   runs during boot falls back to the role name and gets re-read after login —
   see prefsSwitch(). The fallback is deliberately the role string: it can never
   collide with a roster id, which are all "pNN". */
function prefsWho(){
  /* The signed-in person, straight from SESSION. The two fallbacks below it
     still matter: SESSION is defined further down the file, so anything that
     runs during boot lands on the last-signed-in id instead. */
  try{ if(typeof SESSION!=='undefined'&&SESSION.pid)return SESSION.pid; }catch(e){}
  try{ var u=USERS[currentRole]; if(u&&u.pid)return u.pid; }catch(e){}
  try{ if(typeof RST_LOGIN!=='undefined'&&RST_LOGIN[currentRole])return RST_LOGIN[currentRole]; }catch(e){}
  /* Boot runs before the roster is built, so fall back to whoever signed in last
     on this device. That is what makes the app come up already wearing their
     text size instead of flashing the default and correcting itself. */
  try{ var l=localStorage.getItem(PREFS_LAST_KEY); if(l)return l; }catch(e){}
  return currentRole;
}
function prefsLoad(){
  try{ var r=JSON.parse(localStorage.getItem(PREFS_KEY)||'null'); if(r&&typeof r==='object')PREFS=r; }catch(e){}
  prefsMigrate();
}
function prefsSave(){ try{ localStorage.setItem(PREFS_KEY,JSON.stringify(PREFS)); }catch(e){} }
/* The person's bucket, created on demand. */
function prefsBag(who){ var k=who||prefsWho(); return PREFS[k]||(PREFS[k]={}); }
function prefsGet(section,def){
  var b=PREFS[prefsWho()]; var v=b&&b[section];
  return (v===undefined||v===null)?def:v;
}
function prefsSet(section,val){ prefsBag()[section]=val; prefsSave(); }
/* One-time lift of the old role-keyed and device-wide keys onto the person who
   was using them, so nobody loses a home screen they already arranged. Runs once
   and drops a marker; the old keys are left alone rather than deleted, so an
   older build opened against the same browser still finds its data.        */
function prefsMigrate(){
  if(PREFS.__v)return;
  /* The roster is defined much further down the file, so the call from
     prefsLoad() at boot lands here before RST_LOGIN exists. Bail without setting
     the marker and let the retry after rstBuildUsers() do the work — migrating
     early would file everything under role names, which is the exact thing this
     change exists to stop. */
  if(typeof RST_LOGIN==='undefined'||!RST_LOGIN)return;
  var ROLES=['manager','undergrad','grad','faculty','tech'];
  function pidFor(role){ return RST_LOGIN[role]||role; }
  function old(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }
  var off=old('ut_home_widgets')||{},ord=old('ut_home_order')||{},thm=old('ut_theme');
  ROLES.forEach(function(role){
    var who=pidFor(role),bag=PREFS[who]||(PREFS[who]={});
    if(off[role]&&!bag.hwOff)bag.hwOff=off[role];
    if(ord[role]&&!bag.hwOrder)bag.hwOrder=ord[role];
    /* Theme was device-wide, so every person inherits whatever was set. That is
       the honest read of the old data: we cannot know who chose it. */
    if(thm&&!bag.theme)bag.theme={banner:thm.banner,cb:!!thm.cb,size:thm.size};
  });
  PREFS.__v=1; prefsSave();
}
/* Called whenever the signed-in person changes. Anything that was applied to the
   document from the old person's prefs has to be re-applied from the new one's,
   or Bill's text size follows a student onto their own phone. */
function prefsSwitch(){
  prefsMigrate();
  try{ localStorage.setItem(PREFS_LAST_KEY,prefsWho()); }catch(e){}
  try{ themeLoad(); applyTextSize(); applyBanner(); cbApply(); }catch(e){}
  try{ notifLoad(); }catch(e){}
}
prefsLoad();
/* Default bottom tabs per role. What a person actually chose lives in their own
   bucket under "nav"; this is only the starting point for someone who has never
   opened Preferences. It used to be the whole story, which is why tab choices
   evaporated on every reload. */
const NAV_DEF={
 manager:['Tasks','Map','Inventory'],
 undergrad:['Tasks','Map','Clock'],
 grad:['Trials','Map','Tasks'],
 faculty:['Trials','Map','Tasks'],
 tech:['Tasks','Equip','Field']
};
/* The live list for whoever is signed in, falling back to the role default. */
function navChosen(role){
  var r=role||currentRole;
  var opts=NAV_OPTIONS[r]||[];
  /* Asking about a role that isn't the one signed in — the roles explainer does
     this to preview every tab bar — gets the role default, never the current
     person's choices. Their picks describe their own bar and nobody else's. */
  if(r!==currentRole)return (NAV_DEF[r]||[]).slice();
  var saved=prefsGet('nav',null);
  if(!saved||!saved.length)return (NAV_DEF[r]||[]).slice();
  /* Drop anything the role cannot reach — a person who switches roles in the
     demo should not carry a tab into a screen that has no matching page.
     Technicians used to call the task board "Jobs"; the label was retired so
     every role names the page the same way, but anyone who pinned the old tab
     still has "Jobs" saved in their prefs. Fold it back to Tasks on read rather
     than dropping their tab on the floor. */
  saved=saved.map(function(l){return l==='Jobs'?'Tasks':l;})
             .filter(function(l,i,a){return a.indexOf(l)===i;});
  var keep=saved.filter(function(l){return opts.indexOf(l)>=0;});
  return keep.length?keep:(NAV_DEF[r]||[]).slice();
}
function navSetChosen(arr){ prefsSet('nav',arr.slice()); }
const SCREEN_DEST={
 'home-manager':'home-manager','home-undergrad':'home-undergrad','home-grad':'home-grad','home-faculty':'home-faculty','home-tech':'home-tech',
 'taskboard':'taskboard','taskdetail':'taskboard','tasknew':'taskboard','taskwork':'taskboard','gradreq':'taskboard','templates':'taskboard','assign':'taskboard','plotpick':'taskboard',
 'map':'map','indoor':'map',
 'inventory':'inventory','itemdetail':'inventory','invlog':'inventory','additem':'inventory','lowstock':'inventory',
 'trial':'trial','trialdetail':'trial','trialedit':'trial','trialres':'trial',
 'equipment':'equipment','eqdetail':'equipment','eqreport':'equipment','eqmaint':'equipment','eqedit':'equipment','eqsched':'equipment',
 'fieldlog':'fieldlog','flnew':'fieldlog','fldetail':'fieldlog','flexport':'fieldlog',
 'timeclock':'timeclock','tcperson':'timeclock',
 'calendar':'calendar','calevent':'calendar','caladd':'calendar',
 'weather':'weather','wxday':'weather','wxradar':'weather',
 'more':'more','bugreport':'more','bugsettings':'more'
};
/* renderTabs() runs from show(), so its emoji map has to be global. The other
   copy lower down is function-scoped and invisible from here — reading it threw
   a ReferenceError out of show() and broke every navigation. */
var TAB_EMOJI={Home:'🏠',Tasks:'📋',Map:'🗺️',Inventory:'📦',Clock:'⏱️',More:'•••',Trials:'🔬',Equip:'🚜',Field:'✏️',Spray:'🧪',Calendar:'📅',Weather:'🌤️'};
/* Bottom tabs need short labels; the Preferences rows can spell things out. */
var PAGE_LABEL={Tasks:'Tasks',Map:'Farm Map',Inventory:'Inventory',Trials:'Trials',Equip:'Equipment',Field:'Field Log',Clock:'Time Clock',Calendar:'Calendar',Weather:'Weather & conditions'};
function renderTabs(){
 var scr=document.querySelector('.screen.active'); if(!scr)return;
 renderRail();
 var target=scr.querySelector('.tabs'); if(!target)return;
 var role=currentRole,nm=navMap[role]||{};
 var chosen=navChosen(role).filter(function(l){return nm[l];});
 var labels=['Home'].concat(chosen).concat(['More']);
 var dest=SCREEN_DEST[scr.id.replace(/^s-/,'')];
 target.innerHTML=labels.map(function(l){
   var d=nm[l],on=!!(d&&dest&&d===dest);
   return '<div class="tab'+(on?' on':'')+'"><span class="te">'+(TAB_EMOJI[l]||'•')+'</span>'+l+'</div>';
 }).join('');
}

/* ================= adaptive shell =================
   Tablet and desktop swap the bottom tab bar for a persistent left rail, built
   from the same navMap and TAB_EMOJI the bar uses — a page added to
   PAGE_DEST/NAV_OPTIONS shows up in both places with no extra wiring, wearing
   the same icon in both. The difference is how much fits: the bar has five
   slots, so it shows the three chosen favourites. The rail has a whole column,
   so it shows every page the role can reach and, on desktop, the account rows
   too. Nothing on a monitor needs to hide behind "More". */

/* The rail's account block belonged to the retired desktop band. Profile,
   notifications, roster, preferences and log out are reached the same way they
   always have been on phone and tablet — behind More, the bell and the avatar. */

/* SCREEN_DEST rolls the page screens up to their tab; the account screens need
   the same treatment so the rail stays lit while you're three levels into
   Preferences or editing a roster entry. */
var RAIL_ROLLUP={profedit:'profile',rosteredit:'roster',adminxfer:'roster',
  navtabs:'navsettings',homescreen:'navsettings',notifsettings:'navsettings',theme:'navsettings',
  powersettings:'navsettings'};

function railIcon(l){ return (typeof TAB_EMOJI!=='undefined' && TAB_EMOJI[l]) || '•'; }

function renderRail(){
  /* Dropping back to phone has to clear the banner offset as well as the rail,
     or --hdrh lingers on <html> from the last desktop paint. */
  if(APP_SIZE()==='phone'){ var old=document.getElementById('rail'); if(old)old.innerHTML=''; railTop(); return; }
  var rail=document.getElementById('rail');
  if(!rail){ rail=document.createElement('nav'); rail.id='rail'; app.appendChild(rail); }
  var scr=document.querySelector('.screen.active');
  /* Login and the role picker are full-bleed gates — no rail until you're in. */
  if(!scr || scr.id==='s-login' || scr.id==='s-roles'){ rail.innerHTML=''; rail.style.display='none'; return; }
  rail.style.display='';

  var role=currentRole,nm=navMap[role]||{};
  var raw=scr.id.replace(/^s-/,'');
  /* Three ways a screen can name what should be lit, in order of specificity. */
  var dest=SCREEN_DEST[raw]||RAIL_ROLLUP[raw]||raw;

  /* The rail lists every page the role can reach, icon stacked over a short
     label in ~82px. This is now the only large-screen rail — the wider
     labelled variant went with the desktop band. */
  var pages=(NAV_OPTIONS[role]||[]).filter(function(l){ return nm[l]; });

  function item(o){
    return '<div class="rl-item'+(o.on?' on':'')+(o.bell?' bellwrap':'')+'"'
         + ' data-rail="'+o.k+'" data-dest="'+o.dest+'">'
         + '<span class="rl-ic">'+o.ic+'</span>'
         + '<span class="rl-label">'+esc(o.label)+'</span></div>';
  }

  /* No brand block — the banner across the top already carries the logo, and
     repeating it in the rail just ate a row. */
  var h=['Home'].concat(pages).map(function(l){
      var d=nm[l];
      return item({k:l,ic:railIcon(l),dest:d,on:!!(d&&d===dest),label:l});
    }).join('');
  h+='<div class="rl-spacer"></div><div class="rl-sep"></div>';

  /* 82px can't carry the whole account block, and More is redundant now that
     every page is on the rail — Profile and the bell still reach the rest.
     The "Switch" slot (switch-role/switch-user) was demo-only and was
     removed 2026-08-25 -- nothing replaces it, the rail is just one item
     shorter now. */
  rail.innerHTML=h;
  /* The bell badge paints itself onto anything carrying .bellwrap. */
  try{updateBellBadges();}catch(e){}
  railTop();
}

/* The banner spans the window and the rail hangs beneath it, so the rail's top
   is whatever the active screen's header measured. Headers differ (the home one
   carries a logo and two lines, most carry a title) and text size is a theme
   setting, so measure rather than hard-code. */
function railTop(){
  var root=document.documentElement, rail=document.getElementById('rail');
  if(APP_SIZE()==='phone'){ root.style.removeProperty('--hdrh'); if(rail)rail.style.top=''; return; }
  var scr=document.querySelector('.screen.active');
  var hd=scr&&scr.querySelector('.app.field > .hdr');
  var h=hd?Math.round(hd.getBoundingClientRect().height):64;
  if(h<40) h=64;                       /* screen is hidden or mid-paint */
  root.style.setProperty('--hdrh',h+'px');
  if(rail) rail.style.top=h+'px';
}

/* Rail clicks carry their own destination — the account rows aren't in navMap.
   The rail is the desktop stand-in for the bottom tab bar, so it navigates the
   same way: root, not history. Using go() here piled screens up behind you and
   left an arrow on the Home banner pointing at wherever you had just been. */
document.addEventListener('click',function(e){
  var it=e.target.closest && e.target.closest('#rail .rl-item'); if(!it)return;
  var d=it.getAttribute('data-dest')||(navMap[currentRole]||{})[it.getAttribute('data-rail')];
  if(d)goRoot(d);
},true);

/* On a size flip the shell changes shape underneath Leaflet. Leaflet's own
   trackResize fires on window resize, but the rail appearing changes the
   container width in the same frame, so nudge every live map once things settle. */
function adaptiveResize(){
  /* The banner can rewrap at any width, so re-measure even when the size band
     hasn't changed — otherwise the rail floats off the bottom of the header. */
  railTop();
  if(!APP_SIZE_APPLY()) return;
  renderRail();
  /* Same list applyTextSize() pokes — every live Leaflet instance, including the
     per-job maps in JOBMAP, since all of them just had their box resized. */
  setTimeout(function(){
    var maps=[];
    try{ if(typeof _appmap!=='undefined'&&_appmap)maps.push(_appmap); }catch(e){}
    try{ if(typeof _trpMap!=='undefined'&&_trpMap)maps.push(_trpMap); }catch(e){}
    try{ Object.keys(JOBMAP).forEach(function(k){ if(JOBMAP[k]&&JOBMAP[k].map)maps.push(JOBMAP[k].map); }); }catch(e){}
    maps.forEach(function(m){ if(m&&m.invalidateSize){try{m.invalidateSize();}catch(e){}} });
  },90);
}
window.addEventListener('resize',function(){
  clearTimeout(window._szT); window._szT=setTimeout(adaptiveResize,110);
});
window.addEventListener('orientationchange',function(){ setTimeout(adaptiveResize,180); });
/* More lists everything the role can reach that ISN'T already a bottom tab, plus
   the utility rows (switch role, log out) which always stay. */
/* bugreport is on this list on purpose: a broken app is exactly the thing that
   every role has to be able to flag, including the undergrad whose nav has been
   trimmed to four tabs. It is never hidden behind a permission. */
var MORE_ALWAYS={roles:1,login:1,farmsettings:1,bugreport:1,admin:1};
function moreEnter(){ var role=currentRole,nav=navMap[role]||{},chosen=navChosen(role);
  var onNav={}; chosen.forEach(function(l){ if(nav[l]) onNav[nav[l]]=1; });
  var reachable={}; (NAV_OPTIONS[role]||[]).forEach(function(l){ if(PAGE_DEST[l]) reachable[PAGE_DEST[l]]=1; });
  var scr=document.getElementById('s-more'); if(!scr)return;
  scr.querySelectorAll('.row[data-go]').forEach(function(r){
    var d=r.getAttribute('data-go');
    if(MORE_ALWAYS[d]){ r.style.display=''; return; }
    r.style.display=(reachable[d]&&!onNav[d])?'':'none';
  });
  /* The one row on this screen that depends on the HAT rather than the job.
     Hiding it is a courtesy, not a lock - admRender() checks again. */
  var ad=document.getElementById('more-admin');
  if(ad) ad.style.display=((typeof rstIsAdmin==='function')&&rstIsAdmin())?'':'none';
  /* Mixing is a chemical job: only the roles that can log one see the numbers. */
  var sp=document.getElementById('more-spray');
  if(sp) sp.style.display=(((typeof farmCanSee==='function')&&farmCanSee()))?'':'none';
}
/* Preferences is a hub: each category is its own screen, reached from these rows.
   Add a category by appending to PREF_CATS — nothing else needs to change. */
var PREF_CATS=[
 {go:'navtabs',t:'Navigation',d:function(){var c=navChosen().map(function(l){return PAGE_LABEL[l]||l;});return c.length?c.join(' · '):'No tabs chosen';}},
 {go:'homescreen',t:'Home screen',d:function(){var all=HOME_WIDGETS[currentRole]||[],on=all.filter(function(w){return hwOn(currentRole,w.id);});return on.length+' of '+all.length+' widgets showing';}},
 {go:'notifsettings',t:'Notifications',d:function(){return (typeof notifSummary==='function')?notifSummary():'Alerts, delivery hours, email digest';}},
 {go:'theme',t:'Theme',d:function(){return bannerOf().n+' · '+sizeOf().n+' text'+(THEME.cb?' · color-blind palette on':'');}},
 {go:'powersettings',t:'Battery',d:function(){return POWER.saver?'Saver on · GPS held at coarse accuracy':'Normal · accuracy set per job';}}
];
/* Battery is one switch and an explanation. The explanation matters more than
   the switch: nobody turns on a setting they have to guess the cost of, and the
   cost here is real — coarse fixes will not paint coverage cleanly. */
function renderPowerSettings(){
 var body=document.getElementById('pwr-body'); if(!body)return;
 var mins=Math.round(GEO_RELEASE_MS/60000), sm=Math.round(geoIdleMs(GEO_RELEASE_MS)/60000);
 body.innerHTML=
  '<div class="sec" style="margin:16px 18px 7px">Location</div>'
 +'<div class="list"><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px">'
 +'<div style="padding-right:12px"><div style="font:700 13px \'Public Sans\';color:var(--ink)">Battery saver</div>'
 +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px" id="pwr-sub"></div></div>'
 +'<span class="tgl'+(POWER.saver?' on':'')+'" id="pwr-tgl"></span></div></div>'
 +'<div style="font:600 11.5px \'Public Sans\';color:var(--muted);line-height:1.55;margin:10px 20px 0">'
 +'GPS is only on while a job is open or the map is following you — never on the '
 +'home screen or the task board, and never while the app is in your pocket.</div>'
 +'<div class="sec" style="margin:18px 18px 7px">What the app already does</div>'
 +'<div class="list">'
 +'<div class="fld"><span class="fl">Screen off or app hidden</span><span class="fv">GPS stops</span></div>'
 +'<div class="fld"><span class="fl">Standing still 90 seconds</span><span class="fv">Drops to coarse</span></div>'
 +'<div class="fld"><span class="fl">Standing still '+mins+' minutes</span><span class="fv">GPS stops</span></div>'
 +'<div class="fld" style="border-bottom:none"><span class="fl">Accuracy per job</span><span class="fv">From the job title</span></div>'
 +'</div>'
 +'<div style="font:600 11.5px \'Public Sans\';color:var(--muted);line-height:1.55;margin:10px 20px 0">'
 +'Alley and rotary work asks for fine accuracy because an alley is only a few '
 +'feet wide. Greens and fairways use coarse — they are big enough that a loose '
 +'fix still lands on the right one. Saver mode holds everything at coarse and '
 +'halves the timers above, so GPS stops after '+sm+' minutes of standing still.</div>'
 +'<div style="height:22px"></div>';
 var sub=document.getElementById('pwr-sub');
 if(sub) sub.textContent=POWER.saver
   ? 'On · coarse fixes everywhere, coverage painting will be rougher'
   : 'Off · each job asks for the accuracy it needs';
}
document.addEventListener('click',function(e){
 var t=e.target.closest && e.target.closest('#pwr-tgl'); if(!t)return;
 POWER.saver=!POWER.saver; powerSave();
 t.classList.toggle('on',POWER.saver);
 renderPowerSettings();
 /* Re-open the live watch under the new rules rather than waiting for the next job. */
 if(GEO.watch!=null){ geoStop(); geoStart(); }
 toast(POWER.saver?'Battery saver on':'Battery saver off');
},true);

/* ===================== Notifications =====================
   Was static markup with eight anonymous toggles and no storage: flipping one
   did nothing and did not survive a reload. Rendered from this table now, which
   also means adding an alert type is one row rather than a block of inline HTML.

   Defaults match what the old markup showed as pre-ticked, so nobody's screen
   looks different on the first load after this change.                     */
var NOTIF_ALERTS=[
 {k:'tasks',  t:'Tasks assigned to me', d:1},
 {k:'equip',  t:'Equipment down',       d:1},
 {k:'low',    t:'Low stock alerts',     d:1},
 {k:'wx',     t:'Weather & spray window',d:1},
 {k:'trials', t:'Trials & restrictions',d:0},
 {k:'crew',   t:'Crew & time clock',    d:0}
];
var NOTIF_DELIVERY=[
 {k:'push',  t:'Push notifications', d:1},
 {k:'email', t:'Email digest',       d:0}
];
function notifDef(){
 var o={quiet:false,start:'07:00',end:'21:00',summary:false};
 NOTIF_ALERTS.forEach(function(a){o['a_'+a.k]=!!a.d;});
 NOTIF_DELIVERY.forEach(function(a){o['d_'+a.k]=!!a.d;});
 return o;
}
var NOTIF=notifDef();
function notifLoad(){
 var d=notifDef(),s=prefsGet('notif',null)||{};
 Object.keys(d).forEach(function(k){ NOTIF[k]=(s[k]===undefined?d[k]:s[k]); });
}
function notifSave(){ prefsSet('notif',NOTIF); }
/* One-line summary for the Preferences hub, so the row says what is actually set
   rather than repeating the screen's title back at you. */
function notifSummary(){
 var on=NOTIF_ALERTS.filter(function(a){return NOTIF['a_'+a.k];}).length;
 var bits=[on+' of '+NOTIF_ALERTS.length+' alerts'];
 bits.push(NOTIF.quiet?(NOTIF.start+'–'+NOTIF.end):'any time');
 if(NOTIF.d_email)bits.push('email digest');
 if(!NOTIF.d_push)bits.push('push off');
 return bits.join(' · ');
}
function ntsToggle(k,label,sub,last){
 var bb=last?'':';border-bottom:1px solid var(--line)';
 return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px'+bb+'">'
  +'<div style="padding-right:12px"><div style="font:700 13px \'Public Sans\';color:var(--ink)">'+label+'</div>'
  +(sub?'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px">'+sub+'</div>':'')+'</div>'
  +'<span class="tgl nts-tgl'+(NOTIF[k]?' on':'')+'" data-k="'+k+'"></span></div>';
}
function renderNotifSettings(){
 var body=document.getElementById('nts-body'); if(!body)return;
 var quietExtra='';
 if(NOTIF.quiet){
   quietExtra='<div class="fld" style="border-bottom:1px solid var(--line)"><span class="fl">Allowed hours</span>'
    +'<span style="display:flex;gap:6px;align-items:center;flex:none">'
    +'<input type="time" class="sched-in nts-time" data-k="start" value="'+NOTIF.start+'" style="max-width:98px">'
    +'<span class="sched-dash">–</span>'
    +'<input type="time" class="sched-in nts-time" data-k="end" value="'+NOTIF.end+'" style="max-width:98px"></span></div>'
    +ntsToggle('summary','Morning summary','Recap what you missed overnight when you log in',true);
 }
 function sec(t){return '<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:16px 18px 6px">'+t+'</div>';}
 body.innerHTML=
   sec('Push notification hours')
  +'<div class="list">'
   +ntsToggle('quiet','Limit delivery hours',
      NOTIF.quiet?'On · push notifications only arrive in this window'
                 :'Off · push notifications come through any time',!NOTIF.quiet)
   +quietExtra
  +'</div>'
  +sec('Alerts')
  +'<div class="list">'+NOTIF_ALERTS.map(function(a,i){
      return ntsToggle('a_'+a.k,a.t,'',i===NOTIF_ALERTS.length-1);
    }).join('')+'</div>'
  +sec('Delivery')
  +'<div class="list">'+NOTIF_DELIVERY.map(function(a,i){
      return ntsToggle('d_'+a.k,a.t,'',i===NOTIF_DELIVERY.length-1);
    }).join('')+'</div>'
  +'<div style="margin:12px 16px;font:600 11px \'Public Sans\';color:var(--muted)">These settings are yours alone — they follow you, not your role.</div>'
  +'<div style="height:16px"></div>';
}
document.getElementById('s-notifsettings').addEventListener('click',function(e){
 var t=e.target.closest('.nts-tgl'); if(!t)return;
 e.stopPropagation();
 var k=t.getAttribute('data-k');
 NOTIF[k]=!NOTIF[k];
 /* Turning the window off takes the morning summary with it — a recap of what
    was held back makes no sense when nothing is being held back. */
 if(k==='quiet'&&!NOTIF.quiet)NOTIF.summary=false;
 notifSave(); renderNotifSettings();
},true);
document.getElementById('s-notifsettings').addEventListener('change',function(e){
 var t=e.target.closest&&e.target.closest('.nts-time'); if(!t)return;
 NOTIF[t.getAttribute('data-k')]=t.value||'07:00';
 notifSave();
});
notifLoad();

function renderPrefsHub(){
 var body=document.getElementById('prf-body'); if(!body)return;
 var rows=PREF_CATS.map(function(c,i){
   var bb=i===PREF_CATS.length-1?'':';border-bottom:1px solid var(--line)';
   return '<div class="row tap" data-go="'+c.go+'" style="padding:13px 15px'+bb+'">'
     +'<div style="flex:1;padding-right:12px"><div class="rt">'+c.t+'</div>'
     +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px">'+c.d()+'</div></div>'
     +'<span style="color:#c2c7cd;font-size:18px">›</span></div>';
 }).join('');
 body.innerHTML='<div class="list" style="margin-top:12px">'+rows+'</div>';
}

/* ===================== Home screen widgets =====================
   Each card on a role's home screen carries data-w="<id>" in the markup. The
   catalog below names those ids so Preferences can list them; hwApply() is the
   only thing that touches the DOM, flipping display on the tagged elements.
   Add a widget by tagging its wrapper and adding one row here.               */
var HOME_WIDGETS={
 manager:[
  {id:'wx',   t:'Weather & spray window', d:'Conditions strip under the header'},
  {id:'kpis', t:'Farm numbers',           d:'Open · Restrict · Low · Down'},
  {id:'cal',  t:'Today on the calendar',  d:'Next few scheduled events'},
  {id:'clock',t:'Time clock summary',     d:'Hours logged this pay period'},
  {id:'tasks',t:'On task now',            d:'Who is working what, right now'},
  {id:'equip', t:'Equipment status',      d:'Down and checked-out units'},
  {id:'inv',   t:'Low stock',             d:'Products at or below reorder point'},
  {id:'field', t:'Recent field log',      d:'Last few applications logged'},
  {id:'trials',t:'Active trials',         d:'Studies running and their restrictions'},
  {id:'map',   t:'Restricted plots',      d:'Where work is on hold today'}
 ],
 undergrad:[
  {id:'shift',  t:'Shift & clock in',  d:'Start your shift from the home screen'},
  {id:'kpis',   t:'My numbers',        d:'Assigned · Done · Hours'},
  {id:'mytasks',t:'My tasks today',    d:'The jobs assigned to you'},
  {id:'clock',  t:'My hours',          d:'Punches and hours this pay period'},
  {id:'cal',    t:'My schedule',       d:'Shifts and time off coming up'},
  {id:'wx',     t:'Weather',           d:'Conditions for working outside today'},
  {id:'map',    t:'Restrictions',      d:'Plots to leave alone — check before you start'},
  {id:'equip',  t:'Equipment',         d:'What is down and what you have out'},
  {id:'trials', t:'Protocols',         d:'Studies running on the plots · view only'},
  {id:'field',  t:'Field log',         d:'Work logged under your name · view only'},
  {id:'inv',    t:'Inventory',         d:'Low stock · log what you use'}
 ],
 grad:[
  {id:'kpis',  t:'My numbers',         d:'Trials · Restrictions · Plots'},
  {id:'trials',t:'My trials',          d:'Studies you are running'},
  {id:'tasks', t:'Tasks',              d:'Yours, plus what you have asked Bill for'},
  {id:'map',   t:'My plots',           d:'Restrictions on your lab’s plots'},
  {id:'field', t:'Field log',          d:'Recent operations on your plots'},
  {id:'inv',   t:'Inventory',          d:'Low stock in the chem room'},
  {id:'equip', t:'Equipment',          d:'Status board · report a problem'},
  {id:'cal',   t:'This week',          d:'Sprays, ratings and lab events'},
  {id:'wx',    t:'Spray window',       d:'Conditions before you mix'}
 ],
 faculty:[
  {id:'kpis',  t:'Program numbers',    d:'Active trials · Plots · Students'},
  {id:'trials',t:'Lab activity',       d:'Trials and drafts from your students'},
  {id:'tasks', t:'Tasks farm-wide',    d:'Everything open, and your lab’s share'},
  {id:'map',   t:'My plots',           d:'Restrictions your lab has set'},
  {id:'field', t:'Field log',          d:'Operations on your plots · view only'},
  {id:'clock', t:'Crew hours',         d:'No-show tally and pay-period hours'},
  {id:'inv',   t:'Inventory',          d:'Stock levels · log what you use'},
  {id:'equip', t:'Equipment',          d:'Status board · view only'},
  {id:'cal',   t:'This week',          d:'Sprays, ratings and lab events'},
  {id:'wx',    t:'Weather',            d:'Conditions and the spray window'}
 ],
 tech:[
  {id:'kpis',  t:'My numbers',         d:'Tasks · Equip down · Apps today'},
  {id:'jobs',  t:'My tasks today',     d:'Work orders assigned to you'},
  {id:'equip', t:'Equipment',          d:'Status board · confirm a machine down'},
  {id:'field', t:'Field log',          d:'What you and the crew have logged'},
  {id:'trials',t:'Protocols',          d:'Studies running and their restrictions'},
  {id:'map',   t:'Restrictions',       d:'Plots on hold — check before you start'},
  {id:'inv',   t:'Inventory',          d:'Low stock in the chem room'},
  {id:'cal',   t:'This week',          d:'Sprays, tasks and farm events'},
  {id:'wx',    t:'Spray window',       d:'Conditions before you mix'}
 ]
};
/* Home-screen state lives in the signed-in person's prefs bucket, not under the
   role. The role argument these functions still take is only used to read the
   catalog — which widgets this role HAS — and never to decide what is saved.
   hwoLoad/hwLoad remain as no-ops so the boot sequence below reads the same;
   prefsLoad() has already done the work.                                    */
function hwoLoad(){}
function hwLoad(){}
/* Saved order for this person. Anything missing from the saved list (a widget
   added in a later build) falls in at its catalog position rather than
   vanishing. */
function hwOrder(role){
 var cat=(HOME_WIDGETS[role]||[]).map(function(w){return w.id;});
 var out=(prefsGet('hwOrder',[])||[]).filter(function(id){return cat.indexOf(id)>=0;});
 if(!out.length)return cat.slice();
 cat.forEach(function(id,i){
   if(out.indexOf(id)>=0)return;
   /* Land a newly added widget just below whichever of its catalog neighbours
      is already placed, so the person's own ordering survives an update. */
   var at=0;
   for(var k=i-1;k>=0;k--){ var p=out.indexOf(cat[k]); if(p>=0){at=p+1;break;} }
   out.splice(at,0,id);
 });
 return out;
}
function hwMove(role,id,dir){
 var o=hwOrder(role),i=o.indexOf(id),j=i+dir;
 if(i<0||j<0||j>=o.length)return false;
 o.splice(j,0,o.splice(i,1)[0]);
 prefsSet('hwOrder',o); return true;
}
function hwResetOrder(role){ delete prefsBag().hwOrder; prefsSave(); }
/* Off-list only: anything not stored is on, so a newly added widget shows up for
   everyone instead of silently hiding until they go turn it on. */
function hwOn(role,id){var o=prefsGet('hwOff',null);return !(o&&o.indexOf(id)>=0);}
function hwToggle(role,id){
 var o=(prefsGet('hwOff',[])||[]).slice(),i=o.indexOf(id);
 if(i>=0)o.splice(i,1); else o.push(id);
 prefsSet('hwOff',o);
}
/* ---- how many rows a card shows -----------------------------------------
   Every list widget used to end in a hardcoded slice(0,3). Three is a fine
   default on a phone and the wrong number for a manager on a tablet who wants
   the whole low-stock list in front of him, so the count is now the person's to
   set. HW_ROWS names the widgets that show rows at all — a card that is a KPI
   grid or a weather strip has no rows to count and gets no stepper.

   {def, min, max} rather than a bare default: "On task now" is a taller row than
   "Low stock", so the sensible ceilings differ.                            */
var HW_ROWS={
 tasks:  {def:3,min:1,max:8},
 mytasks:{def:3,min:1,max:8},
 jobs:   {def:3,min:1,max:8},
 equip:  {def:3,min:1,max:8},
 inv:    {def:3,min:1,max:8},
 field:  {def:3,min:1,max:8},
 trials: {def:3,min:1,max:8},
 map:    {def:3,min:1,max:8},
 cal:    {def:3,min:1,max:8},
 clock:  {def:4,min:1,max:8}
};
function hwRowSpec(id){ return HW_ROWS[id]||null; }
/* The shared renderers are handed the card's element id ("hw-u-mytasks"), not the
   widget id. The last segment is the widget id by construction — the markup and
   the catalog were built from the same names — so one split saves passing the id
   through every renderer signature. */
function hwWid(elId){ var s=String(elId||''); var i=s.lastIndexOf('-'); return i<0?s:s.slice(i+1); }
/* The count a renderer should slice to. Falls back to the catalog default, so a
   widget added later works before anyone has touched its stepper. */
function hwRows(id){
 var sp=HW_ROWS[id]; if(!sp)return 3;
 var m=prefsGet('hwRows',null),v=m&&m[id];
 v=parseInt(v,10);
 if(!v||isNaN(v))return sp.def;
 return Math.max(sp.min,Math.min(sp.max,v));
}
function hwSetRows(id,n){
 var sp=HW_ROWS[id]; if(!sp)return false;
 n=Math.max(sp.min,Math.min(sp.max,n|0));
 var m={},cur=prefsGet('hwRows',null);
 if(cur)Object.keys(cur).forEach(function(k){m[k]=cur[k];});
 m[id]=n; prefsSet('hwRows',m); return true;
}
/* ---- live widget renderers ----------------------------------------------
   Cards whose markup is an empty shell get filled here from the app's own
   arrays, so a home widget and its full page can never disagree. Each one
   bails quietly if its data module has not run yet: hwApply() fires once at
   load, ahead of the <script> blocks further down the file.               */
/* ---- widget navigation ---------------------------------------------------
   Two targets per card. A row is a thing — a day, a plot, a restriction, a
   trial, a machine, an item — and tapping it opens that thing. Everything that
   is not a specific thing (the pill, the title, the KPI tiles, the "+N more"
   line, the card's own background) opens the full page instead, carrying the
   card's scope so the page lands showing what the card was showing.

   Rows carry data-open="<kind>:<id>" and are caught in the capture phase, so
   the card's data-go never fires underneath them.                        */
function hwOpen(spec){
 if(!spec)return;
 var i=spec.indexOf(':'),k=spec.slice(0,i),v=spec.slice(i+1);
 switch(k){
  case 'trial':  if(typeof trOpen==='function')trOpen(v); break;
  case 'task':   if(typeof openTask==='function')openTask(v); break;
  case 'equip':  if(typeof openMachine==='function')openMachine(v); break;
  case 'item':   if(typeof openItem==='function')openItem(v); break;
  case 'plot':   if(typeof trGoPlot==='function')trGoPlot(v); else go('map'); break;
  case 'flog':   if(typeof openFlEntry==='function')openFlEntry(v); break;
  case 'cal':    if(typeof openCalEvent==='function')openCalEvent(v); break;
  case 'wx':     if(typeof renderWxDay==='function'){renderWxDay(+v);show('wxday',true);} break;
  case 'person': if(typeof tcOpenPerson==='function')tcOpenPerson(v); else go('timeclock'); break;
  case 'page':   hwGoScoped(v); break;
 }
}
/* Page-level taps. The part after the slash is the scope the widget was
   showing; the page's own enter routine runs first from show(), so the scope
   is re-applied afterwards or it would just be overwritten. */
function hwGoScoped(spec){
 var i=spec.indexOf('/'),dest=i<0?spec:spec.slice(0,i),sc=i<0?'':spec.slice(i+1);
 go(dest);
 if(!sc)return;
 var j=sc.indexOf('='),k=j<0?sc:sc.slice(0,j),v=j<0?'':sc.slice(j+1);
 try{
  if(k==='board'&&typeof tbTab!=='undefined'){ tbTab=v; if(typeof renderBoard==='function')renderBoard(); }
  else if(k==='eqtab'&&typeof eqTab!=='undefined'){ eqTab=v; if(typeof equipEnter==='function')equipEnter(); }
  else if(k==='trlab'&&typeof trState!=='undefined'){ trState.tab='active'; trState.lab=v; if(typeof trRender==='function')trRender(); }
  else if(k==='flplots'&&typeof flState!=='undefined'){ flState.type='all'; flState.plots=v?v.split(','):[]; if(typeof flSyncPlotUI==='function')flSyncPlotUI(); if(typeof flRender==='function')flRender(); }
  else if(k==='fltype'&&typeof flState!=='undefined'){ flState.type=v; flState.plots=[]; if(typeof flSyncPlotUI==='function')flSyncPlotUI(); if(typeof flRender==='function')flRender(); }
 }catch(e){}
}
['s-home-manager','s-home-undergrad','s-home-grad','s-home-faculty','s-home-tech'].forEach(function(sid){
 var scr=document.getElementById(sid); if(!scr)return;
 scr.addEventListener('click',function(e){
  /* Start has its own handler further down and goes to the map view of the
     job, not the task page — let it through untouched. */
  if(e.target.closest('.hw-start')||e.target.closest('#hw-u-punch'))return;
  var el=e.target.closest('[data-open]'); if(!el||!scr.contains(el))return;
  e.stopPropagation(); e.preventDefault();
  hwOpen(el.getAttribute('data-open'));
 },true);
});
function hwHead(title,link){
 return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
  +'<div style="font:800 14px \'Archivo\';color:var(--ink)">'+title+'</div>'
  +'<span class="pill" style="background:#eef1f4;color:#7b828d">'+link+' ›</span></div>';
}
function hwSub(txt){return '<div style="font:700 11px \'Public Sans\';color:var(--muted);margin-bottom:5px">'+txt+'</div>';}
function hwRow(left,right,last,open){
 return '<div'+(open?' class="tap" data-open="'+open+'"':'')
  +' style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0'
  +(last?'':';border-bottom:1px solid var(--line)')+'">'+left+right+'</div>';
}
function hwName(t,s){return '<div style="flex:1;min-width:0"><div class="rt">'+t+'</div>'+(s?'<div class="rs">'+s+'</div>':'')+'</div>';}
function hwPill(txt,bg,fg){return '<span class="pill" style="background:'+bg+';color:'+fg+';flex:none">'+txt+'</span>';}
function hwEmpty(msg){return '<div style="font:700 12px \'Public Sans\';color:var(--muted);padding:3px 0 2px">'+msg+'</div>';}
function hwMore(n){return n>0?'<div style="font:700 11px \'Public Sans\';color:var(--acc);padding-top:8px">+ '+n+' more ›</div>':'';}
/* A scope turns the whole card into a filtered jump to its page. Because the
   card itself carries data-open, the title, the pill, the "+N more" line and
   the bare background all resolve to it — a row only wins because it is nearer
   the click. The card's original data-go is dropped so the two can't race. */
function hwFill(id,html,scope){
 var el=document.getElementById(id); if(!el)return;
 el.innerHTML=html;
 if(scope){ el.setAttribute('data-open','page:'+scope); el.removeAttribute('data-go'); el.classList.add('tap'); }
}

function hwMgrEquip(){
 if(typeof EQUIP==='undefined')return;
 var live=EQUIP.filter(function(e){return e.active;});
 var down=live.filter(function(e){return e.status==='down';});
 var use=live.filter(function(e){return e.status==='in_use';});
 var list=down.concat(use),show=list.slice(0,hwRows('equip'));
 var rows=show.map(function(e,i){var s=eqStat(e.status);
   return hwRow(hwName(e.name,e.type+(e.holder?' · '+e.holder:'')),hwPill(s.lbl,s.bg,s.fg),i===show.length-1,'equip:'+e.id);
 }).join('');
 hwFill('hw-m-equip',hwHead('Equipment','All equipment')
  +hwSub(down.length+' down · '+use.length+' in use · '+(live.length-down.length-use.length)+' available')
  +(rows||hwEmpty('Nothing is down or checked out.'))+hwMore(list.length-show.length),
  'equipment/eqtab=status');
}
function hwMgrInv(){
 if(typeof INVENTORY==='undefined')return;
 var low=lowList(),show=low.slice(0,hwRows('inv'));
 var rows=show.map(function(it,i){
   return hwRow(hwName(it.name,(it.ai||it.loc)+' · reorder at '+it.thr+' '+it.unit),
     hwPill(fmt(invQty(it))+' '+it.unit,'#fdeceb','#c0392b'),i===show.length-1,'item:'+it.id);
 }).join('');
 hwFill('hw-m-inv',hwHead('Low stock','Reorder list')
  +hwSub(low.length+' of '+INVENTORY.length+' items at or below reorder point')
  +(rows||hwEmpty('Nothing is low right now.'))+hwMore(low.length-show.length),
  'lowstock');
}
function hwMgrField(){
 if(typeof FIELDLOG==='undefined')return;
 var recent=FIELDLOG.slice().sort(function(a,b){return b.ord-a.ord;}).slice(0,hwRows('field'));
 var rows=recent.map(function(a,i){var t=FL_TYPES[a.type]||FL_TYPES.misc;
   return hwRow(hwName(a.title,flRowPlot(a.plot)+' · '+a.detail),
     '<div style="text-align:right;flex:none">'+hwPill(t.label,t.bg,t.fg)
      +'<div class="rs" style="margin-top:4px">'+a.date+'</div></div>',i===recent.length-1,'flog:'+a.id);
 }).join('');
 hwFill('hw-m-field',hwHead('Field log','All entries')
  +(rows||hwEmpty('Nothing logged yet.')),'fieldlog/flplots=');
}
function hwMgrTrials(){
 if(typeof TRIALS==='undefined')return;
 var act=TRIALS.filter(function(t){return t.stage==='active';});
 var res=trAllLiveRestrictions(),show=act.slice(0,hwRows('trials'));
 var rows=show.map(function(t,i){var n=trLiveRes(t).length;
   return hwRow(hwName(t.title,t.lab+' lab · '+(trPlots(t).join(', ')||'no plot set')),
     n?hwPill(n+(n===1?' hold':' holds'),'#fdf0dd','#9a5b00'):hwPill('Clear','#eafaef','#2f7d3a'),
     i===show.length-1,'trial:'+t.id);
 }).join('');
 hwFill('hw-m-trials',hwHead('Trials','All studies')
  +hwSub(act.length+' active · '+res.length+(res.length===1?' live restriction':' live restrictions'))
  +(rows||hwEmpty('No studies are active.'))+hwMore(act.length-show.length),
  'trial/trlab=all');
}
function hwMgrMap(){
 if(typeof TRIALS==='undefined')return;
 var byPlot={};
 trAllLiveRestrictions().forEach(function(x){(byPlot[x.r.scope]=byPlot[x.r.scope]||[]).push(x);});
 var plots=Object.keys(byPlot),show=plots.slice(0,hwRows('map'));
 var rows=show.map(function(p,i){var l=byPlot[p];
   return hwRow(hwName(flRowPlot(p),l.map(function(x){return x.r.type;}).join(' · ')+' · '+l[0].study.lab+' lab'),
     hwPill(l.length+(l.length===1?' hold':' holds'),'#fdeceb','#c0392b'),i===show.length-1,'plot:'+p);
 }).join('');
 hwFill('hw-m-map',hwHead('Restricted plots','Open map')
  +hwSub(plots.length+(plots.length===1?' plot is':' plots are')+' on hold today')
  +(rows||hwEmpty('No plots are restricted — the whole farm is open.'))+hwMore(plots.length-show.length),
  'map');
}
/* ---- shared renderers ---------------------------------------------------
   Most pages want the same card in every role — what changes is the scope of
   the data and what the person is allowed to do with it. So these take the
   target element plus a mode, rather than being written out five times.
   Access rules follow Access-and-Roles.html §4.                          */
function hwLabOf(role){return (typeof ROLE_LAB!=='undefined'&&ROLE_LAB[role])||'';}
/* The roster id of the person a home widget is being drawn for. Was their
   display name, which is what taskIsFor() then string-matched on. */
function hwMe(role){return (typeof USERS!=='undefined'&&USERS[role]&&USERS[role].pid)||null;}
/* Plots this role has a stake in — its lab's study plots. */
function hwMyPlots(role){
 var lab=hwLabOf(role),out=[];
 if(typeof TRIALS==='undefined')return out;
 TRIALS.forEach(function(t){ if(t.lab===lab) trPlots(t).forEach(function(p){ if(out.indexOf(p)<0)out.push(p); }); });
 return out;
}

function hwWx(id,mode){
 if(typeof WXDAYS==='undefined')return;
 var d=WXDAYS[0],spray=parseInt(d.precip,10)<=20&&parseInt(d.wind,10)<=10;
 /* slice(1,3) drops today, so the forecast index is the loop index + 1. */
 var rows=WXDAYS.slice(1,3).map(function(x,i){
   return hwRow(hwName(x.day,x.cond),'<span style="font:800 13px \'Archivo\';color:var(--ink);flex:none">'+x.hi+'° / '+x.lo+'°</span>',i===1,'wx:'+(i+1));
 }).join('');
 hwFill(id,hwHead(mode==='spray'?'Spray window':'Weather','Forecast')
  +'<div class="tap" data-open="wx:0" style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px">'
   +'<span style="font:800 22px \'Archivo\';color:var(--ink)">'+d.hi+'°</span>'
   +'<span style="font-size:26px;line-height:1;flex:none" title="'+d.cond+'">'+d.ico+'</span></div>'
  +(mode==='spray'
    ? '<div class="tap" data-open="wx:0" style="margin:6px 0 8px">'+(spray?hwPill('Good to spray','#eafaef','#2f7d3a'):hwPill('Hold — wind or rain','#fdeceb','#c0392b'))+'</div>'
    : '<div class="tap" data-open="wx:0" style="margin:6px 0 8px">'+(spray?hwPill('Fine for outside work','#eafaef','#2f7d3a'):hwPill('Dress for weather','#fdf0dd','#9a5b00'))+'</div>')
  +rows,'weather');
}
function hwCal(id,role,mode){
 if(typeof eventsOnDate!=='function')return;
 var evs=[],d=new Date(CAL_TODAY_DT);
 for(var k=0;k<7&&evs.length<6;k++){
   eventsOnDate(d).forEach(function(e){ evs.push({e:e,off:k}); });
   d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
 }
 var when=function(off){return off===0?'Today':(off===1?'Tomorrow':'+'+off+'d');};
 /* "My schedule" is the person's own shift pattern plus anything they've been
    put down for — farm-wide events are noise to an hourly worker. */
 if(mode==='me'){
   var me=hwMe(role),DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
   var shifts=(typeof tcNextShifts==='function'?tcNextShifts(me,3):[]);
   var mineE=evs.filter(function(x){return isMe(x.e.person);});
   /* A shift is not a calendar record, so it has nowhere of its own to open —
      it goes to the person's own time sheet instead. */
   var srows=shifts.map(function(s,i){
     return hwRow(hwName(DOW[s.dow]+(s.off===0?' · today':(s.off===1?' · tomorrow':'')),s.span),
       s.noshow?hwPill('No-show','#fdeceb','#c0392b'):hwPill(when(s.off),'#eef1f4','#7b828d'),
       i===shifts.length-1&&!mineE.length,'person:'+me);
   }).join('');
   var erows=mineE.slice(0,2).map(function(x,i,a){
     return hwRow(hwName(x.e.title,(x.e.sub||'')+' · '+(x.e.time||'all day')),
       hwPill(when(x.off),'#fdf0dd','#9a5b00'),i===a.length-1,'cal:'+x.e.id);
   }).join('');
   hwFill(id,hwHead('My schedule','Crew schedule')
    +hwSub(shifts.length?'Your next '+shifts.length+(shifts.length===1?' shift':' shifts'):'No usual days set')
    +(srows+erows||hwEmpty('No shifts on your pattern yet — set your usual days.'))
    +'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">Changes and call-outs go straight to Bill.</div>','calendar');
   return;
 }
 var show=evs.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(x,i){
   var c=(CTYPES2[x.e.type]||{}).label||'Event';
   return hwRow(hwName(x.e.title,(x.e.sub||c)+' · '+(x.e.time||'all day')),
     hwPill(when(x.off),'#eef1f4','#7b828d'),i===show.length-1,'cal:'+x.e.id);
 }).join('');
 hwFill(id,hwHead('This week','Calendar')
  +hwSub(evs.length?evs.length+(evs.length===1?' item':' items')+' in the next 7 days':'Next 7 days')
  +(rows||hwEmpty('Nothing on the calendar this week.'))
  +hwMore(evs.length-show.length),'calendar');
}
function hwMapRes(id,role,mode){
 if(typeof TRIALS==='undefined')return;
 var mine=hwMyPlots(role),byPlot={};
 trAllLiveRestrictions().forEach(function(x){
   if(mode==='lab'&&mine.indexOf(x.r.scope)<0)return;
   (byPlot[x.r.scope]=byPlot[x.r.scope]||[]).push(x);
 });
 var plots=Object.keys(byPlot),show=plots.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(p,i){var l=byPlot[p];
   return hwRow(hwName(flRowPlot(p),l.map(function(x){return x.r.type;}).join(' · ')+' · '+l[0].study.lab+' lab'),
     hwPill(l.length+(l.length===1?' hold':' holds'),'#fdeceb','#c0392b'),i===show.length-1,'plot:'+p);
 }).join('');
 hwFill(id,hwHead(mode==='lab'?'My plots':'Restrictions','Open map')
  +hwSub(mode==='lab'
    ? mine.length+(mine.length===1?' plot':' plots')+' in the '+hwLabOf(role)+' lab · '+plots.length+' restricted'
    : plots.length+(plots.length===1?' plot is':' plots are')+' on hold today')
  +(rows||hwEmpty(mode==='lab'?'Nothing restricted on your plots.':'No plots are restricted — the whole farm is open.'))
  +hwMore(plots.length-show.length)
  +(mode==='view'?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">Check the map before you start. Only Bill and the person who set a hold can lift it.</div>':''),
  'map');
}
function hwEquipCard(id,mode){
 if(typeof EQUIP==='undefined')return;
 var live=EQUIP.filter(function(e){return e.active;});
 var down=live.filter(function(e){return e.status==='down';});
 var use=live.filter(function(e){return e.status==='in_use';});
 var flag=live.filter(function(e){return e.flagged&&e.status!=='down';});
 var list=down.concat(flag,use),show=list.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(e,i){var s=eqStat(e.status);
   return hwRow(hwName(e.name,e.type+(e.holder?' · '+e.holder:'')),
     e.flagged&&e.status!=='down'?hwPill('Flagged','#fdf0dd','#9a5b00'):hwPill(s.lbl,s.bg,s.fg),i===show.length-1,'equip:'+e.id);
 }).join('');
 var foot={report:'Spot a problem? Report it and Bill gets a repair task straight away.',
           confirm:'You and Bill are the only ones who can confirm a machine down.',
           view:'Report equipment problems through Bill.'}[mode];
 hwFill(id,hwHead('Equipment','All equipment')
  +hwSub(down.length+' down · '+use.length+' in use · '+(live.length-down.length-use.length)+' available')
  +(rows||hwEmpty('Nothing is down or checked out.'))+hwMore(list.length-show.length)
  +(foot?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">'+foot+'</div>':''),
  'equipment/eqtab=status');
}
function hwInvCard(id,mode){
 if(typeof INVENTORY==='undefined')return;
 var low=lowList(),show=low.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(it,i){
   return hwRow(hwName(it.name,(it.ai||it.loc)+' · reorder at '+it.thr+' '+it.unit),
     hwPill(fmt(invQty(it))+' '+it.unit,'#fdeceb','#c0392b'),i===show.length-1,'item:'+it.id);
 }).join('');
 /* The card counts what is low, so the page opens on the reorder list rather
    than the full shelf — same numbers either side of the tap. */
 hwFill(id,hwHead(mode==='log'?'Low stock':'Inventory',mode==='log'?'Log usage':'Browse stock')
  +hwSub(low.length+' of '+INVENTORY.length+' items at or below reorder point')
  +(rows||hwEmpty('Nothing is low right now.'))+hwMore(low.length-show.length)
  +(mode==='view'?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">View only — Bill can grant you usage and restock logging.</div>':''),
  'lowstock');
}
function hwTrialsCard(id,role,mode){
 if(typeof TRIALS==='undefined')return;
 var lab=hwLabOf(role);
 var act=TRIALS.filter(function(t){return t.stage==='active';});
 var list=mode==='lab'?act.filter(function(t){return t.lab===lab;}):act;
 var show=list.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(t,i){var n=trLiveRes(t).length;
   return hwRow(hwName(t.title,(mode==='lab'?(nameOf(t.owner)||nameOf(t.pi)||'—'):t.lab+' lab')+' · '+(trPlots(t).join(', ')||'no plot set')),
     n?hwPill(n+(n===1?' hold':' holds'),'#fdf0dd','#9a5b00'):hwPill('Clear','#eafaef','#2f7d3a'),i===show.length-1,'trial:'+t.id);
 }).join('');
 var title=mode==='lab'?'My trials':'Protocols';
 hwFill(id,hwHead(title,'All studies')
  +hwSub(mode==='lab'?list.length+' active in the '+lab+' lab':list.length+' studies active farm-wide')
  +(rows||hwEmpty(mode==='lab'?'No active studies in your lab.':'No studies are active.'))
  +hwMore(list.length-show.length)
  +(mode==='view'?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">Everyone can read the protocols. Restrictions are set by the lab that owns the plot.</div>':''),
  'trial/trlab='+(mode==='lab'?lab:'all'));
}
function hwFieldCard(id,role,mode){
 if(typeof FIELDLOG==='undefined')return;
 var me=hwMe(role),mine=hwMyPlots(role);
 var all=FIELDLOG.slice().sort(function(a,b){return b.ord-a.ord;}),list=all,fell=false;
 if(mode==='me')  list=all.filter(function(a){return (a.detail||'').indexOf(me)>=0;});
 if(mode==='lab'){
   list=all.filter(function(a){return mine.indexOf(a.plot)>=0||mine.indexOf('B'+a.plot)>=0;});
   /* A lab with quiet plots would otherwise get a dead card — show the farm
      feed instead and say so, rather than an empty box. */
   if(!list.length){list=all;fell=true;}
 }
 var show=list.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(a,i){var t=FL_TYPES[a.type]||FL_TYPES.misc;
   return hwRow(hwName(a.title,flRowPlot(a.plot)+' · '+a.detail),
     '<div style="text-align:right;flex:none">'+hwPill(t.label,t.bg,t.fg)
      +'<div class="rs" style="margin-top:4px">'+a.date+'</div></div>',i===show.length-1,'flog:'+a.id);
 }).join('');
 var sub=fell?'Nothing on your plots yet — latest farm-wide'
   :{me:'Work logged under your name',lab:'Recent operations on your plots',all:'Latest entries farm-wide'}[mode];
 /* A lab card opens the log already narrowed to that lab's plots; the fallback
    feed is farm-wide, so it must not carry a filter it did not honour. */
 var scope=(mode==='lab'&&!fell&&mine.length)?'fieldlog/flplots='+mine.join(','):'fieldlog/flplots=';
 hwFill(id,hwHead('Field log','All entries')+hwSub(sub)
  +(rows||hwEmpty(mode==='me'?'Nothing logged under your name yet.':'Nothing logged yet.'))
  +(mode==='me'?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">Finishing a mow task logs itself. Chemical logging needs Bill’s OK.</div>':'')
  +(mode==='lab'&&role==='faculty'?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">View only — techs, grads and Bill log field operations.</div>':''),
  scope);
}
function hwTasksCard(id,role,mode){
 if(typeof TASKS==='undefined')return;
 var me=hwMe(role);
 var open=TASKS.filter(function(t){return t.kind!=='request'&&t.status!=='done';});
 var mineT=open.filter(function(t){return taskIsFor(t,me);});
 var reqs=TASKS.filter(function(t){return t.kind==='request'&&t.status!=='done';});
 var list=mode==='me'?mineT.concat(open.filter(function(t){return !t.assignee;})):open;
 var show=list.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(t,i){
   return hwRow(hwName(t.title,(t.area&&t.area!=='—'?t.area+' · ':'')+(nameOf(t.assignee)||'unassigned')),
     isMe(t.assignee)?hwPill('Mine','#e8eff5','#42688a')
      :(t.assignee?(t.status==='doing'?hwPill('In progress','#eafaef','#2f7d3a'):hwPill('Assigned','#eef1f4','#7b828d')):hwPill('Open','#fdf0dd','#9a5b00')),
     i===show.length-1,'task:'+t.id);
 }).join('');
 hwFill(id,hwHead(mode==='me'?'Tasks':'Tasks farm-wide','Task board')
  +hwSub(mode==='me'
    ? mineT.length+' assigned to you · '+reqs.length+' request'+(reqs.length===1?'':'s')+' waiting on Bill'
    : open.length+' open farm-wide · '+reqs.length+' request'+(reqs.length===1?'':'s')+' for an undergrad')
  +(rows||hwEmpty('Nothing open.'))+hwMore(list.length-show.length)
  +(mode==='me'?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">You can create tasks and take them yourself. Only Bill assigns an undergrad.</div>':'')
  +(mode==='all'?'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">You can assign within your own lab. Only Bill assigns an undergrad.</div>':''),
  'taskboard/board='+(mode==='me'?'mine':'board'));
}
/* Faculty see the tally and the totals — not individual punch cards. */
function hwClockCard(id,role,mode){
 if(typeof tcSummary!=='function')return;
 var s=tcSummary(),me=hwMe(role);
 if(mode==='me'){
   var p=s.people.filter(function(x){return x.name===me;})[0]||{hours:0,days:0,noshow:0,onClock:false};
   hwFill(id,hwHead('My hours','Time sheet')+hwSub(s.label)
    +'<div style="display:flex;align-items:baseline;gap:8px;margin:2px 0 8px">'
     +'<span style="font:800 22px \'Archivo\';color:var(--ink)">'+p.hours.toFixed(1)+' h</span>'
     +'<span style="font:700 12px \'Public Sans\';color:var(--muted)">across '+p.days+(p.days===1?' day':' days')+'</span></div>'
    +(p.onClock?hwPill('On the clock now','#eafaef','#2f7d3a'):hwPill('Clocked out','#eef1f4','#7b828d'))
    +'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:9px">Presence only — payroll is separate. Clock-in works at the farm.</div>','timeclock');
   return;
 }
 var board=s.people.slice().sort(function(a,b){return b.noshow-a.noshow||b.hours-a.hours;});
 var total=s.people.reduce(function(a,x){return a+x.hours;},0);
 var ns=s.people.reduce(function(a,x){return a+x.noshow;},0);
 var lt=s.people.reduce(function(a,x){return a+(x.late||0);},0);
 var show=board.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(p,i){
   return hwRow(hwName(p.name,p.hours.toFixed(1)+' h · '+p.ytd.toFixed(1)+' h in '+s.year),
     p.noshow?hwPill(p.noshow+(p.noshow===1?' no-show':' no-shows'),'#fdeceb','#c0392b')
       :(p.late?hwPill(p.late+' late','#fff5ec','#b26a00')
                :hwPill('None','#eafaef','#2f7d3a')),i===show.length-1,'person:'+p.name);
 }).join('');
 hwFill(id,hwHead('Crew hours','Time clock')
  +hwSub(s.label+' · '+total.toFixed(1)+' h total · '+ns+(ns===1?' no-show':' no-shows')+' · '+lt+' late')
  /* The calendar-year total is what gets reported off the farm, so it rides
     along on the home card instead of living only on the Time Clock page. */
  +'<div style="display:flex;align-items:baseline;gap:7px;background:#fff1e0;border:1px solid #ffcf9e;border-radius:11px;padding:8px 11px;margin:2px 0 9px">'
   +'<span style="font:800 9px \'Public Sans\';color:#9a5b00;text-transform:uppercase;letter-spacing:.7px;flex:1">Undergrad hours · '+s.year+'</span>'
   +'<span style="font:800 17px \'Archivo\';color:var(--acc)">'+s.ytdTotal.toFixed(1)+' h</span></div>'
  +(rows||hwEmpty('No hourly crew on the roster.'))
  +'<div style="font:600 11px \'Public Sans\';color:var(--muted);padding-top:8px">Totals and the no-show tally only — Bill edits punches.</div>','timeclock');
}

/* ---- the last of the static cards, now live -------------------------- */
function hwInits(n){return (n||'').split(/\s+/).map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase();}
function hwAvatar(n,c){
 return '<span style="width:30px;height:30px;border-radius:50%;background:'+(c||'#98a0aa')+';color:#fff;font:800 10px \'Public Sans\';display:flex;align-items:center;justify-content:center;flex:none">'+hwInits(n)+'</span>';
}
/* A KPI is a count, not a thing — so each tile opens its page, scoped to the
   slice it is counting. */
function hwKpis(id,cells){
 hwFill(id,cells.map(function(c){
   return '<div class="kpi'+(c.g?' tap':'')+'"'+(c.g?' data-open="page:'+c.g+'"':'')
    +'><div class="n"'+(c.c?' style="color:'+c.c+'"':'')+'>'+c.n+'</div><div class="l">'+c.l+'</div></div>';
 }).join(''));
}
function hwOpenTasks(){return typeof TASKS==='undefined'?[]:TASKS.filter(function(t){return t.kind!=='request'&&t.status!=='done';});}
function hwMyTasks(role){var me=hwMe(role);return hwOpenTasks().filter(function(t){return taskIsFor(t,me);});}
function hwDownCount(){return typeof EQUIP==='undefined'?0:EQUIP.filter(function(e){return e.active&&e.status==='down';}).length;}
function hwResCount(){return typeof TRIALS==='undefined'?0:trAllLiveRestrictions().length;}
function hwLogsToday(){
 if(typeof FIELDLOG==='undefined'||!FIELDLOG.length)return 0;
 var top=FIELDLOG.reduce(function(a,b){return b.ord>a.ord?b:a;}).ord;
 return FIELDLOG.filter(function(a){return a.ord===top;}).length;
}
/* Weather strip (manager) — same .wx shell, real numbers. */
function hwWxStrip(id){
 if(typeof WXDAYS==='undefined')return;
 var d=WXDAYS[0],ok=parseInt(d.precip,10)<=20&&parseInt(d.wind,10)<=10;
 hwFill(id,'<div><div class="t">'+d.hi+'° · '+d.cond+'</div>'
  +'<div class="s">Spray window '+(ok?'GOOD':'HOLD')+' · wind '+d.wind+'</div></div>'
  +'<div style="font-size:30px;line-height:1;flex:none" title="'+d.cond+'">'+d.ico+'</div>');
}
/* Who is in today, off the crew pattern, plus visitors from the calendar. */
function hwMgrCal(id){
 if(typeof tcSummary!=='function')return;
 var working=[];
 tcSummary().people.forEach(function(p){
   var s=(typeof tcNextShifts==='function'?tcNextShifts(p.name,1):[])[0];
   if(s&&s.off===0)working.push({name:p.name,span:s.span,noshow:s.noshow,on:p.onClock});
 });
 var vis=(typeof eventsOnDate==='function'?eventsOnDate(CAL_TODAY_DT):[]).filter(function(e){return e.type==='event';});
 /* Shift time sits on the right where the status pill used to; status is carried
    by its colour, with the words moved under the name. */
 var rows=working.map(function(p,i){
   var st=p.noshow?{t:'No-show',c:'#c0392b'}:(p.on?{t:'On the clock',c:'#2f7d3a'}:{t:'Expected',c:'var(--muted)'});
   return hwRow(hwName(p.name,'<span style="color:'+st.c+'">'+st.t+'</span>'),
     '<span style="font:800 13px \'Archivo\';color:'+st.c+';flex:none;white-space:nowrap">'+(p.span||'—')+'</span>',
     i===working.length-1,'person:'+p.name);
 }).join('');
 var vrows=vis.slice(0,2).map(function(e,i,a){
   return hwRow(hwName(e.title,e.sub||'Visitor'),hwPill(e.time||'today','#eef4ff','#2456b8'),i===a.length-1,'cal:'+e.id);
 }).join('');
 hwFill(id,hwHead('Working today','This week')
  +hwSub(working.length+(working.length===1?' person':' people')+' scheduled'+(vis.length?' · '+vis.length+' visiting':''))
  +(rows||hwEmpty('Nobody is scheduled today.'))
  +(vrows?'<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin:10px 0 2px">Visitors</div>'+vrows:''),
  'calendar');
}
function hwMgrClock(id){
 if(typeof tcSummary!=='function')return;
 var s=tcSummary(),tot=s.people.reduce(function(a,x){return a+x.hours;},0);
 var rows=s.people.map(function(p,i){
   return hwRow(hwName(p.name,p.days+(p.days===1?' day':' days')+(p.unverified?' · punch to verify':'')),
     '<span style="font:800 13px \'Archivo\';color:var(--ink);flex:none">'+p.hours.toFixed(1)+' h</span>',i===s.people.length-1,'person:'+p.name);
 }).join('');
 hwFill(id,hwHead('Time clock','Review')+hwSub(s.label+' · '+tot.toFixed(1)+' h total')
  +(rows||hwEmpty('No hourly crew on the roster.')),'timeclock');
}
/* Who is on what right now — assigned open tasks, newest first. */
/* One row per person with work in front of them, showing the job at the top of
   their board. Rank is the priority system — whatever Bill put first is what
   they should be on — so the first task in their list is the one to show. */
function hwOnTask(id){
 var open=hwOpenTasks().filter(function(t){return t.assignee;});
 /* Per-person avatar colours, keyed by roster id. */
 var C={p18:'#489FDF',p20:'#00746F',p21:'#ff8200',p22:'#98a0aa',p05:'#58595b'};
 /* Walking TASKS in order means the first hit per person is their rank-1 job,
    and the people come out ordered by whose top job leads the board. */
 var seen={},crew=[];
 open.forEach(function(t){
   if(seen[t.assignee]){ seen[t.assignee].n++; return; }
   seen[t.assignee]={top:t,n:1}; crew.push(t.assignee);   /* ids, resolved by nameOf at render */
 });
 /* Anyone who has cleared their board still belongs here — Bill wants to see
    that they finished, not have them vanish. They land after the working crew
    with their last job and a Done pill. */
 var doneAll=(typeof TASKS==='undefined'?[]:TASKS.filter(function(t){return t.assignee&&t.status==='done';}));
 doneAll.forEach(function(t){
   if(seen[t.assignee])return;
   seen[t.assignee]={top:t,n:0,done:true}; crew.push(t.assignee);
 });
 var show=crew.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(nm,i){
   var e=seen[nm], t=e.top;
   var pill=e.done?hwPill('Done ✓','#eafaef','#2f7d3a')
          :(t.status==='doing'?hwPill('In progress','#fff4e0','#9a5b00')
                              :hwPill('Assigned','#eef1f4','#7b828d'));
   return '<div class="tap" data-open="task:'+t.id+'" style="display:flex;align-items:center;gap:11px;padding:8px 0'
    +(i===show.length-1?'':';border-bottom:1px solid var(--line)')+'">'
    +hwAvatar(nameOf(nm),C[nm])+hwName(nameOf(nm),t.title)+pill+'</div>';
 }).join('');
 var working=crew.filter(function(n){return !seen[n].done;}).length;
 hwFill(id,hwHead('On task now','Board')
  +hwSub(working+(working===1?' person':' people')+' working · '+open.length+(open.length===1?' job':' jobs')+' out')
  +(rows||hwEmpty('Nobody has a job in front of them.'))+hwMore(crew.length-show.length),
  'taskboard/board=board');
}
/* Undergrad shift banner — punches in place, no trip to the Time Clock page. */
function hwShift(id){
 var el=document.getElementById(id); if(!el||typeof tcShift!=='function')return;
 var s=tcShift(SESSION.pid||hwMe('undergrad'));
 el.style.background=s.on?'linear-gradient(135deg,#2f9e4f,#39b95e)':'var(--acc)';
 el.style.boxShadow=s.on?'0 8px 18px rgba(47,158,79,.3)':'0 8px 18px rgba(255,130,0,.3)';
 el.innerHTML='<div style="min-width:0">'
   +'<div style="font:800 16px \'Archivo\'">'+(s.on?'On the clock':(s.scheduledToday?'Start your shift':'Not scheduled today'))+'</div></div>'
  +'<div class="tap" id="hw-u-punch" style="flex:none;margin-left:auto;background:#fff;color:'+(s.on?'#1a7a37':'var(--acc)')
   +';border-radius:10px;padding:10px 16px;font:800 13px \'Archivo\';box-shadow:0 2px 6px rgba(0,0,0,.16)">'
   +(s.on?'Clock Out':'Clock In')+'</div>';
}
/* The first three jobs Bill assigned, in the order he set them — same order the
   board works them in. Priority came off the entry form, so the right-hand slot
   carries a Start button on the job that is up next instead. */
function hwMyTaskList(id,role){
 var me=hwMe(role);
 var mine=(typeof TASKS==='undefined'?[]:TASKS.filter(function(t){
   return taskIsFor(t,me)&&t.status==='todo'&&t.kind!=='request';
 }));
 var show=mine.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(t,i){
   var right=i===0?'<span class="startbtn tap hw-start" data-start="'+t.id+'" style="padding:8px 13px;font-size:11.5px">Start ›</span>':'';
   return '<div class="tap" data-open="task:'+t.id+'" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0'
    +(i===show.length-1?'':';border-bottom:1px solid var(--line)')+'">'
    +'<span style="width:21px;height:21px;border-radius:7px;background:#2f3133;color:#fff;font:800 11px \'Archivo\';display:flex;align-items:center;justify-content:center;flex:none">'+(i+1)+'</span>'
    +hwName(t.title,(t.area&&t.area!=='—'?t.area+' · ':'')+dueLabel(t))+right+'</div>';
 }).join('');
 hwFill(id,hwHead('My tasks today','Task board')
  +hwSub(mine.length+(mine.length===1?' task':' tasks')+' assigned to you · work them in order')
  +(rows||hwEmpty('Nothing assigned to you right now.'))+hwMore(mine.length-show.length),
  'taskboard/board=mine');
}
/* Start goes straight into the job — map view when the work is plot-based,
   otherwise the task detail. stopPropagation keeps the card's own tap-through
   to the board from firing underneath it. */
['s-home-undergrad','s-home-tech'].forEach(function(sid){
 var scr=document.getElementById(sid); if(!scr)return;
 scr.addEventListener('click',function(e){
  var st=e.target.closest('.hw-start'); if(!st)return;
  e.stopPropagation(); e.preventDefault();
  var tid=st.getAttribute('data-start');
  var t=(typeof TASKS==='undefined')?null:TASKS.find(function(x){return x.id===tid;});
  if(!t)return;
  if(typeof worksOnMap==='function'&&worksOnMap(t.type,t.title)&&typeof openTaskWork==='function')openTaskWork(tid);
  else if(typeof openTask==='function')openTask(tid);
 },true);
});
/* Faculty banner — the single thing most worth their attention, from live data. */
function hwFacAlert(id){
 if(typeof TRIALS==='undefined')return;
 var lab=hwLabOf('faculty');
 var mine=TRIALS.filter(function(t){return t.lab===lab;});
 var drafts=mine.filter(function(t){return t.stage==='planned';});
 var res=[]; mine.forEach(function(t){trLiveRes(t).forEach(function(r){res.push({t:t,r:r});});});
 var head,sub,act;
 if(drafts.length){head=drafts.length+(drafts.length===1?' protocol draft':' protocol drafts')+' to review';sub=drafts[0].title+' · '+(nameOf(drafts[0].owner)||nameOf(drafts[0].pi)||'—');act='Review';}
 else if(res.length){head=res.length+(res.length===1?' restriction live':' restrictions live');sub=res[0].r.type+' · '+flRowPlot(res[0].r.scope)+' · until '+(res[0].r.end||'lifted');act='Open';}
 else {head='Nothing needs you today';sub=mine.length+' studies in the '+lab+' lab';act='Trials';}
 hwFill(id,'<div style="min-width:0"><div style="font:800 16px \'Archivo\'">'+head+'</div>'
  +'<div style="font:700 11px \'Public Sans\';opacity:.92;margin-top:3px">'+sub+'</div></div>'
  +'<div style="flex:none;margin-left:auto;background:#fff;color:#00746F;border-radius:10px;padding:10px 15px;font:800 13px \'Archivo\'">'+act+'</div>');
}

var HW_RENDER={
 manager:function(){
  hwWxStrip('hw-m-wx');
  hwKpis('hw-m-kpis',[{n:hwOpenTasks().length,l:'Open',g:'taskboard/board=board'},
    {n:hwResCount(),l:'Restrict',c:'#c0392b',g:'map'},
    {n:(typeof INVENTORY!=='undefined'?lowList().length:0),l:'Low',c:'#c0392b',g:'lowstock'},
    {n:hwDownCount(),l:'Down',c:'#58595b',g:'equipment/eqtab=status'}]);
  hwMgrCal('hw-m-cal'); hwMgrClock('hw-m-clock'); hwOnTask('hw-m-tasks');
  hwMgrEquip();hwMgrInv();hwMgrField();hwMgrTrials();hwMgrMap();},
 /* Undergrad: does the work, reads everything else. §5 — no logging, no admin. */
 undergrad:function(){
  var me=SESSION.pid||hwMe('undergrad'),sh=(typeof tcShift==='function'?tcShift(me):{hours:0});
  var mine=hwMyTasks('undergrad');
  var done=(typeof TASKS==='undefined'?[]:TASKS.filter(function(t){return taskIsFor(t,me)&&t.status==='done';}));
  hwShift('hw-u-shift');
  hwKpis('hw-u-kpis',[{n:mine.length,l:'Assigned',g:'taskboard/board=mine'},{n:done.length,l:'Done',c:'#2f9e4f',g:'taskboard/board=mine'},{n:sh.hours.toFixed(1),l:'Hours',g:'timeclock'}]);
  hwMyTaskList('hw-u-mytasks','undergrad');
  hwClockCard('hw-u-clock','undergrad','me');
  hwCal('hw-u-cal','undergrad','me');
  hwWx('hw-u-wx','work');
  hwMapRes('hw-u-map','undergrad','view');
  hwEquipCard('hw-u-equip','view');
  hwTrialsCard('hw-u-trials','undergrad','view');
  hwFieldCard('hw-u-field','undergrad','me');
  hwInvCard('hw-u-inv','log');
 },
 /* Grad: runs studies, logs ops, self-assigns work. */
 grad:function(){
  var lab=hwLabOf('grad');
  var act=(typeof TRIALS==='undefined'?[]:TRIALS.filter(function(t){return t.lab===lab&&t.stage==='active';}));
  var res=0; act.forEach(function(t){res+=trLiveRes(t).length;});
  hwKpis('hw-g-kpis',[{n:act.length,l:'Trials',g:'trial/trlab='+lab},{n:res,l:'Restrictions',c:res?'#9a5b00':'',g:'map'},{n:hwMyPlots('grad').length,l:'Plots',g:'map'}]);
  hwTrialsCard('hw-g-trials','grad','lab');
  hwTasksCard('hw-g-tasks','grad','me');
  hwMapRes('hw-g-map','grad','lab');
  hwFieldCard('hw-g-field','grad','lab');
  hwInvCard('hw-g-inv','log');
  hwEquipCard('hw-g-equip','report');
  hwCal('hw-g-cal','grad','all');
  hwWx('hw-g-wx','spray');
 },
 /* Faculty: sees everything, acts through their own lab. */
 faculty:function(){
  var lab=hwLabOf('faculty');
  var act=(typeof TRIALS==='undefined'?[]:TRIALS.filter(function(t){return t.lab===lab&&t.stage==='active';}));
  var owners=[]; act.forEach(function(t){var o=nameOf(t.owner)||nameOf(t.pi); if(o&&owners.indexOf(o)<0)owners.push(o);});
  hwKpis('hw-f-kpis',[{n:act.length,l:'Active trials',g:'trial/trlab='+lab},{n:hwMyPlots('faculty').length,l:'Plots',g:'map'},{n:owners.length,l:'People',g:'timeclock'}]);
  hwTrialsCard('hw-f-trials','faculty','lab');
  hwTasksCard('hw-f-tasks','faculty','all');
  hwMapRes('hw-f-map','faculty','lab');
  hwFieldCard('hw-f-field','faculty','lab');
  hwClockCard('hw-f-clock','faculty','board');
  hwInvCard('hw-f-inv','log');
  hwEquipCard('hw-f-equip','view');
  hwCal('hw-f-cal','faculty','all');
  hwWx('hw-f-wx','spray');
 },
 /* Tech: the shop and the spray rig. */
 tech:function(){
  hwKpis('hw-t-kpis',[{n:hwMyTasks('tech').length,l:'Tasks',g:'taskboard/board=mine'},
    {n:hwDownCount(),l:'Equip down',c:hwDownCount()?'#c0392b':'',g:'equipment/eqtab=status'},
    {n:hwLogsToday(),l:'Apps today',g:'fieldlog/flplots='}]);
  hwMyTaskList('hw-t-jobs','tech');
  hwEquipCard('hw-t-equip','confirm');
  hwFieldCard('hw-t-field','tech','all');
  hwTrialsCard('hw-t-trials','tech','view');
  hwMapRes('hw-t-map','tech','view');
  hwInvCard('hw-t-inv','log');
  hwCal('hw-t-cal','tech','all');
  hwWx('hw-t-wx','spray');
 }
};
/* Applied on every entry to a home screen — the screens are static markup, so
   this is what makes the saved choices stick after a reload or role switch. */
function hwApply(role){
 var scr=document.getElementById('s-'+(HOME_DEST[role]||'')); if(!scr)return;
 /* The greeting and avatar in the home header were static demo markup
    ('Hey, Tyler', a hardcoded initials chip) that nothing ever repainted.
    me() already builds the right card for whoever is actually signed in
    (see sessionPerson/meCard) -- this is the one place every home screen
    passes through, so it is the one place that needs to set it. Wrapped in
    its own try/catch, same as the HW_RENDER call below: this runs before the
    roster/session are necessarily ready (boot, tests), and a failure here
    must not stop the widgets underneath from rendering. */
 try{
   var _u=me(),_p=sessionPerson();
   var _greet=scr.querySelector('.hh .title');
   if(_greet)_greet.textContent='Hey, '+((_p&&_p.first)||(_u.n||'').split(' ')[0]||_u.n||'');
   var _av=scr.querySelector('.hh-av');
   if(_av){ _av.textContent=_u.i; _av.style.background=_u.c; }
 }catch(e){}
 try{ if(HW_RENDER[role])HW_RENDER[role](); }catch(e){}
 var wrap=scr.querySelector('.app.field'); if(!wrap)return;
 /* Re-seat the cards in the saved order. Everything that isn't a widget — the
    header, the alerts strip, the run-out — keeps its relative position, so the
    widgets simply land as one block above the run-out. */
 var runout=wrap.querySelector('.hw-runout'),by={};
 wrap.querySelectorAll('[data-w]').forEach(function(el){by[el.getAttribute('data-w')]=el;});
 hwOrder(role).forEach(function(id){
   var el=by[id]; if(!el)return;
   /* Remember the card's own display (some, like the shift banner, are flex)
      so hiding and re-showing doesn't wipe it back to block. */
   if(el.getAttribute('data-wdisp')===null)el.setAttribute('data-wdisp',el.style.display||'');
   el.style.display=hwOn(role,id)?el.getAttribute('data-wdisp'):'none';
   if(runout)wrap.insertBefore(el,runout); else wrap.appendChild(el);
 });
}
/* Rows are listed in home-screen order, so the list doubles as a preview: the
   arrows move a card, the switch shows or hides it. Arrows beat drag-and-drop
   here — this list lives inside a scrolling phone frame, and a drag gesture
   fights the scroll. */
function hwArrow(id,dir,dead){
 return '<span class="'+(dead?'':'tap hws-mv')+'" data-w="'+id+'" data-d="'+dir+'" '
  +'style="width:30px;height:21px;border-radius:7px;border:1px solid var(--line);background:'
  +(dead?'transparent':'#eef1f4')+';color:'+(dead?'#d3d7db':'#6b7280')
  +';font:700 9px \'Public Sans\';display:flex;align-items:center;justify-content:center;flex:none">'
  +(dir<0?'▲':'▼')+'</span>';
}
/* Row count sits under the widget's own description rather than behind another
   screen: it is one number, and burying a one-number setting one tap deeper is
   how settings screens turn into mazes. Cards with nothing to count — the
   weather strip, the KPI tiles, the shift banner — render no stepper at all. */
function hwRowStepper(id,isOn){
 var sp=hwRowSpec(id); if(!sp||!isOn)return '';
 var n=hwRows(id);
 function btn(d,dead){
   return '<span class="'+(dead?'':'tap hws-rows')+'" data-w="'+id+'" data-d="'+d+'" '
    +'style="width:24px;height:20px;border-radius:6px;border:1px solid var(--line);background:'
    +(dead?'transparent':'#eef1f4')+';color:'+(dead?'#d3d7db':'#6b7280')
    +';font:800 12px \'Public Sans\';display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:1">'
    +(d<0?'−':'+')+'</span>';
 }
 return '<div style="display:flex;align-items:center;gap:6px;margin-top:6px">'
   +btn(-1,n<=sp.min)+btn(1,n>=sp.max)
   +'<span style="font:700 11px \'Public Sans\';color:var(--muted)">'+n+' row'+(n===1?'':'s')+'</span></div>';
}
function renderHomeSettings(){
 var role=currentRole,defs=HOME_WIDGETS[role]||[],order=hwOrder(role);
 var byId={}; defs.forEach(function(w){byId[w.id]=w;});
 var on=defs.filter(function(w){return hwOn(role,w.id);}).length;
 var rows=order.map(function(id,i){
   var w=byId[id]; if(!w)return '';
   var isOn=hwOn(role,id),bb=i===order.length-1?'':';border-bottom:1px solid var(--line)';
   return '<div style="display:flex;align-items:center;gap:11px;padding:9px 14px 9px 12px'+bb+'">'
     +'<div style="display:flex;flex-direction:column;gap:3px;flex:none">'
       +hwArrow(id,-1,i===0)+hwArrow(id,1,i===order.length-1)+'</div>'
     +'<div style="flex:1;min-width:0;opacity:'+(isOn?'1':'.45')+'">'
       +'<div style="font:700 13px \'Public Sans\';color:var(--ink)">'+w.t+'</div>'
       +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px">'+w.d+'</div>'
       +hwRowStepper(id,isOn)+'</div>'
     +'<span class="tgl hws-tgl'+(isOn?' on':'')+'" data-w="'+id+'"></span></div>';
 }).join('');
 document.getElementById('hws-body').innerHTML=
   '<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 18px 6px">Widgets · '+on+' of '+defs.length+' on</div>'
  +'<div style="margin:0 16px 10px;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.4">Top to bottom, this is the order your home screen uses. Arrows move a card, the switch shows or hides it. Nothing is deleted — every page is still reachable from the bottom bar or More, and alerts always show at the top.</div>'
  +'<div class="list">'+rows+'</div>'
  +'<div class="list" style="margin-top:12px"><div class="row tap" id="hws-reset" style="justify-content:center;padding:12px 15px">'
    +'<div style="font:700 13px \'Public Sans\';color:var(--acc)">Reset to the default order</div></div></div>'
  +'<div style="margin:12px 16px;font:600 11px \'Public Sans\';color:var(--muted)">These choices are yours alone and do not change anyone else\'s home screen.</div>'
  +'<div style="height:16px"></div>';
}
/* Punch straight from the home banner. stopPropagation keeps the tap off any
   navigation handler — clocking in should never move you off the page. */
document.getElementById('s-home-undergrad').addEventListener('click',function(e){
 if(!e.target.closest('#hw-u-punch'))return;
 e.stopPropagation(); e.preventDefault();
 if(typeof tcToggleClock==='function')tcToggleClock(hwMe('undergrad'));
 hwApply('undergrad');
},true);
document.getElementById('s-homescreen').addEventListener('click',function(e){
 var rw=e.target.closest('.hws-rows');
 if(rw){ e.stopPropagation();
   var wid=rw.getAttribute('data-w');
   if(hwSetRows(wid,hwRows(wid)+(+rw.getAttribute('data-d')))){
     renderHomeSettings(); hwApply(currentRole);
   }
   return; }
 var mv=e.target.closest('.hws-mv');
 if(mv){ e.stopPropagation();
   if(hwMove(currentRole,mv.getAttribute('data-w'),+mv.getAttribute('data-d'))){
     renderHomeSettings(); hwApply(currentRole);
   }
   return; }
 var rs=e.target.closest('#hws-reset');
 if(rs){ e.stopPropagation(); hwResetOrder(currentRole); renderHomeSettings(); hwApply(currentRole);
   toast('Default order restored'); return; }
 var t=e.target.closest('.hws-tgl'); if(!t)return;
 e.stopPropagation();
 hwToggle(currentRole,t.getAttribute('data-w'));
 renderHomeSettings(); hwApply(currentRole);
});

/* ===================== Theme: banner color + color-blind mode =====================
   Banner colors are CSS vars on <body>, so one setProperty repaints every screen.
   Color-blind mode is harder: most status colors in this app are inline hex on the
   element, which no stylesheet can override. So cbApply() rewrites those inline hexes
   through CB_MAP, stashing the original in data-cb0 so toggling off restores exactly.
   Shapes are applied alongside the recolor so color is never the only signal.      */
var BANNERS=[
 {id:'charcoal',n:'Charcoal',hex:'#2f3133',ink:'#ffffff',dark:1},
 {id:'orange',  n:'UT Orange',hex:'#ff8200',ink:'#ffffff',dark:1},
 {id:'smokey',  n:'Smokey Gray',hex:'#58595b',ink:'#ffffff',dark:1},
 {id:'summit',  n:'Summitt Blue',hex:'#489FDF',ink:'#ffffff',dark:1,sub:'rgba(255,255,255,.78)'},
 {id:'black',   n:'Black',hex:'#000000',ink:'#ffffff',dark:1,sub:'rgba(255,255,255,.66)'}
];
/* Okabe-Ito safe palette. Targets are deliberately disjoint from the keys so the
   remap is idempotent — re-running it can never double-map a color. */
var CB_MAP={
 '#c0392b':'#d55e00','#e8341f':'#d55e00','#ff5a48':'#d55e00',
 '#2f9e4f':'#009e73','#2f7d3a':'#007d63','#227a3a':'#006b55','#6f8a5f':'#5b8c7e',
 '#489fdf':'#56b4e9','#2456b8':'#0072b2',
 '#9a5b00':'#8c6d00','#b26a00':'#8c6d00','#ff8200':'#e69f00',
 '#fdeceb':'#fdf0e6','#eafaef':'#e6f5f1','#fef1dc':'#fbf3d9',
 '#eef4ff':'#e8f4fc','#cfe0ff':'#bfe0f5','#ffcf9e':'#f5dca8',
 '#517c96':'#56849e','#22a5c4':'#56b4e9','#0f8a78':'#009e73','#b07d3e':'#a07c2e',
 '#d17a00':'#e69f00','#7c5cbf':'#cc79a7','#3cbf5a':'#3fbfae','#d55e00':'#d55e00'
};
/* which shape a status dot gets, keyed off its ORIGINAL color */
var CB_SHAPE={'#c0392b':'cb-sq','#e8341f':'cb-sq','#9a5b00':'cb-di','#b26a00':'cb-di','#ff8200':'cb-di',
 '#2f9e4f':'cb-ci','#2f7d3a':'cb-ci','#227a3a':'cb-ci','#00746f':'cb-ci','#6f8a5f':'cb-ci',
 '#489fdf':'cb-ri','#2456b8':'cb-ri','#517c96':'cb-ri','#22a5c4':'cb-ri','#0f8a78':'cb-ci','#b07d3e':'cb-di',
 '#d17a00':'cb-di','#7c5cbf':'cb-tr','#3cbf5a':'cb-ci','#d55e00':'cb-sq','#009e73':'cb-ci','#56b4e9':'cb-ri',
 '#58595b':'cb-ba','#7b828d':'cb-ba','#8a8f98':'cb-ba','#8a94a0':'cb-ba','#c2c7cd':'cb-ba'};
var CB_SHAPE_NAME={'cb-sq':'Square · urgent or down','cb-di':'Diamond · needs attention','cb-ci':'Circle · good or complete','cb-ri':'Ring · informational','cb-tr':'Triangle · scheduled event','cb-ba':'Bar · neutral or logged'};
/* Text size steps. z is the zoom multiplier fed to --ts; keep 'md' at exactly 1 so
   the default renders pixel-for-pixel identical to how every screen was designed. */
var TEXT_SIZES=[
 {id:'sm',n:'Small',   z:0.90,sub:'Fits more on screen'},
 {id:'md',n:'Default', z:1.00,sub:'How the app was designed'},
 {id:'lg',n:'Large',   z:1.12,sub:'Easier to read in the field'},
 {id:'xl',n:'Extra large',z:1.25,sub:'Largest — gloves and bright sun'}
];
/* Power settings sit beside the theme because they are the same kind of thing:
   a per-device preference nobody else needs to see. Loaded early so geoSaver()
   has an answer before the first watch is ever opened. */
var POWER={saver:false};
function powerLoad(){try{var r=JSON.parse(localStorage.getItem('ut_power')||'null');if(r)POWER.saver=!!r.saver;}catch(e){}}
function powerSave(){try{localStorage.setItem('ut_power',JSON.stringify(POWER));}catch(e){}}
powerLoad();

var THEME={banner:'charcoal',cb:false,size:'md'};
/* Banner, text size and the color-blind palette describe a person, not a device:
   eyesight does not change when someone hands over the tablet. Read from their
   bucket, falling back to the old device-wide key so an existing install keeps
   the look it had. */
function themeLoad(){var r=prefsGet('theme',null);
 if(!r){try{r=JSON.parse(localStorage.getItem('ut_theme')||'null');}catch(e){}}
 if(r){if(r.banner)THEME.banner=r.banner;THEME.cb=!!r.cb;if(r.size)THEME.size=r.size;}
 /* a previously saved 'white' theme no longer exists — fall back to the default */
 if(!BANNERS.some(function(b){return b.id===THEME.banner;}))THEME.banner=BANNERS[0].id;
 if(!TEXT_SIZES.some(function(s){return s.id===THEME.size;}))THEME.size='md';}
function sizeOf(){for(var i=0;i<TEXT_SIZES.length;i++){if(TEXT_SIZES[i].id===THEME.size)return TEXT_SIZES[i];}return TEXT_SIZES[1];}
function applyTextSize(){
 document.body.style.setProperty('--ts',String(sizeOf().z));
 /* Leaflet caches its container size, so every live map has to be told the box moved */
 setTimeout(function(){
   var maps=[_appmap,_trpMap];
   try{ Object.keys(JOBMAP).forEach(function(k){ if(JOBMAP[k]&&JOBMAP[k].map)maps.push(JOBMAP[k].map); }); }catch(e){}
   maps.forEach(function(m){ if(m&&m.invalidateSize)try{m.invalidateSize()}catch(e){} });
 },0);
}
function themeSave(){prefsSet('theme',{banner:THEME.banner,cb:THEME.cb,size:THEME.size});}
function bannerOf(){for(var i=0;i<BANNERS.length;i++){if(BANNERS[i].id===THEME.banner)return BANNERS[i];}return BANNERS[0];}
function applyBanner(){
 var b=bannerOf(),st=document.body.style;
 var hex=THEME.cb?cbColor(b.hex):b.hex;
 st.setProperty('--banner',hex);
 st.setProperty('--banner-ink',b.ink);
 st.setProperty('--banner-sub',b.sub||(b.dark?'rgba(255,255,255,.60)':'#8a929c'));
 st.setProperty('--banner-chip',b.dark?'rgba(255,255,255,.16)':'rgba(0,0,0,.06)');
 st.setProperty('--banner-chipline',b.dark?'rgba(255,255,255,.26)':'rgba(0,0,0,.13)');
}
/* ---- colour conversion ----------------------------------------------------------
   CB_MAP hand-tunes the colours that carry meaning app-wide. Everything else — one-off
   category colours, map layer fills, chart tints — runs through cbShift(), which rotates
   hue onto the blue/yellow axis that red-green colour blindness can still separate,
   keeping saturation and lightness so light tints stay light. Between them, every
   colour in the app is converted, with nothing left to maintain by hand.            */
function cbHueMap(h){
 if(h>=330)h-=360;                       // treat magenta-reds as negative so reds group
 if(h<20)  return 18+(h+30)*0.24;        // reds        -> warm orange
 if(h<70)  return 30+(h-20)*0.40;        // oranges     -> orange/amber
 if(h<165) return 168+(h-70)*0.253;      // greens      -> teal
 if(h<255) return 198+(h-165)*0.20;      // blues       -> blue
 return 288+(h-255)*0.36;                // purples     -> magenta
}
function cbShift(hex){
 var r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
 var mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;
 if(d<0.05)return hex;                   // neutral grey — nothing to confuse
 var sat=d/(1-Math.abs(2*l-1)),h;
 if(mx===r)h=60*(((g-b)/d)%6); else if(mx===g)h=60*((b-r)/d+2); else h=60*((r-g)/d+4);
 if(h<0)h+=360;
 h=cbHueMap(h)%360; if(h<0)h+=360;
 var c=(1-Math.abs(2*l-1))*sat,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2,t;
 if(h<60)t=[c,x,0];else if(h<120)t=[x,c,0];else if(h<180)t=[0,c,x];
 else if(h<240)t=[0,x,c];else if(h<300)t=[x,0,c];else t=[c,0,x];
 return '#'+t.map(function(v){return ('0'+Math.round((v+m)*255).toString(16)).slice(-2);}).join('');
}
var _cbCache={};
function cbColor(hex){
 hex=hex.toLowerCase();
 if(CB_MAP[hex])return CB_MAP[hex];
 if(_cbCache[hex])return _cbCache[hex];
 return (_cbCache[hex]=cbShift(hex));
}
/* Rewrite every colour in a blob of CSS/style text: 6-digit hex, 3-digit hex, and the
   rgb()/rgba() forms the stylesheet uses for shadows and tints. */
function cbText(t){
 return t.replace(/#[0-9a-fA-F]{6}\b/g,function(m){return cbColor(m);})
   .replace(/#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])\b/g,function(m,a,b2,c){
     var full='#'+a+a+b2+b2+c+c,out=cbColor(full);
     return out===full?m:out;          // leave #fff and friends alone
   })
   .replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g,function(m,r,g,b){
     var v=cbColor('#'+[r,g,b].map(function(n){return ('0'+(+n).toString(16)).slice(-2);}).join(''));
     return m.replace(/\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/,
       '('+parseInt(v.slice(1,3),16)+','+parseInt(v.slice(3,5),16)+','+parseInt(v.slice(5,7),16));
   });
}
/* Colours that live in the stylesheet (calendar pills, plot chips, status classes)
   can't be reached by walking elements. So clone every <style> block with the colours
   remapped and append the clone as the document's LAST stylesheet — identical
   selectors, so source order makes the clone win. Removing it undoes everything. */
var CB_CSS_ID='cb-css';
function cbCss(on){
 var ex=document.getElementById(CB_CSS_ID);
 if(!on){ if(ex&&ex.parentNode)ex.parentNode.removeChild(ex); return; }
 if(ex)return;
 var txt='';
 document.querySelectorAll('style').forEach(function(st){
   if(st.id===CB_CSS_ID)return;
   txt+=cbText(st.textContent)+'\n';
 });
 var el=document.createElement('style');
 el.id=CB_CSS_ID; el.textContent=txt;
 document.body.appendChild(el);        // body, not head — style blocks live in body too
}
/* Leaflet paints map layers as SVG presentation attributes rather than inline style,
   so those need their own pass. Originals are stashed as JSON in data-cb1. */
var CB_ATTRS=['fill','stroke','stop-color','flood-color','color','bgcolor'];
var cbBusy=false;
function cbApply(){
 if(cbBusy)return; cbBusy=true;
 var on=THEME.cb;
 document.body.classList.toggle('cb',on);
 cbCss(on);
 document.querySelectorAll('[style]').forEach(function(el){
   var orig=el.getAttribute('data-cb0');
   if(on){
     if(orig!=null)return;                       // already converted
     var cur=el.getAttribute('style'),out=cbText(cur);
     if(out!==cur){ el.setAttribute('data-cb0',cur); el.setAttribute('style',out); }
   } else if(orig!=null){ el.setAttribute('style',orig); el.removeAttribute('data-cb0'); }
 });
 document.querySelectorAll('[fill],[stroke],[stop-color],[flood-color],[bgcolor],[data-cb1]').forEach(function(el){
   var raw=el.getAttribute('data-cb1');
   if(on){
     if(raw!=null)return;
     var keep={},changed=false;
     CB_ATTRS.forEach(function(a){
       var v=el.getAttribute(a); if(v==null)return;
       var out=cbText(v);
       if(out!==v){ keep[a]=v; el.setAttribute(a,out); changed=true; }
     });
     if(changed)el.setAttribute('data-cb1',JSON.stringify(keep));
   } else if(raw!=null){
     try{ var o=JSON.parse(raw); Object.keys(o).forEach(function(a){el.setAttribute(a,o[a]);}); }catch(e){}
     el.removeAttribute('data-cb1');
   }
 });
 document.querySelectorAll('.dot,.ev-dot,.dotsm').forEach(function(d){
   if(d.closest('.cblg'))return;                 // legend swatches set their own shape
   Object.keys(CB_SHAPE_NAME).forEach(function(c){d.classList.remove(c);});
   if(!on)return;
   var src=d.getAttribute('data-cb0')||d.getAttribute('style')||'';
   var m=src.match(/#[0-9a-fA-F]{6}/);
   var sh=m?CB_SHAPE[m[0].toLowerCase()]:null;
   if(sh)d.classList.add(sh);
 });
 applyBanner();
 cbBusy=false;
}
/* Screens render their contents lazily, so re-run the recolor whenever the DOM
   changes. The cbBusy guard keeps our own writes from re-triggering the observer. */
function cbWatch(){
 if(!window.MutationObserver)return;
 var pend=false;
 new MutationObserver(function(){
   if(cbBusy||!THEME.cb||pend)return;
   pend=true; requestAnimationFrame(function(){pend=false;cbApply();});
 }).observe(document.body,{childList:true,subtree:true,attributes:true,
   attributeFilter:['style','fill','stroke','class']});
}
themeLoad();
hwLoad(); hwoLoad(); hwApply(currentRole);
function renderTheme(){
 var body=document.getElementById('thm-body'); if(!body)return;
 var sw=BANNERS.map(function(b){
   var shown=THEME.cb?(CB_MAP[b.hex.toLowerCase()]||b.hex):b.hex;
   return '<div><div class="thsw thm-sw'+(THEME.banner===b.id?' on':'')+'" data-b="'+b.id+'" style="background:'+shown+'"><span class="ck" style="color:'+(b.dark?'#fff':'#17181a')+'">✓</span></div><div class="thname">'+b.n+'</div></div>';
 }).join('');
 var legend=Object.keys(CB_SHAPE_NAME).map(function(c){
   return '<div class="cblg"><span class="dot '+c+'" style="background:'+({'cb-sq':'#d55e00','cb-di':'#e69f00','cb-ci':'#009e73','cb-ri':'#56b4e9','cb-tr':'#cc79a7','cb-ba':'#58595b'}[c])+'"></span>'+CB_SHAPE_NAME[c]+'</div>';
 }).join('');
 var tsz=TEXT_SIZES.map(function(s,i){
   var on=THEME.size===s.id,bb=i===TEXT_SIZES.length-1?'':';border-bottom:1px solid var(--line)';
   return '<div class="row tap thm-ts" data-ts="'+s.id+'" style="padding:11px 15px'+bb+'">'
     +'<span style="width:34px;flex:none;text-align:center;font:800 '+Math.round(15*s.z)+'px \'Archivo\';color:'+(on?'var(--acc)':'var(--muted)')+';line-height:1">Aa</span>'
     +'<div style="flex:1;padding-right:12px"><div class="rt">'+s.n+'</div>'
     +'<div class="rs">'+esc(s.sub)+'</div></div>'
     +'<span style="flex:none;font:900 15px \'Archivo\';color:'+(on?'var(--acc)':'transparent')+'">✓</span></div>';
 }).join('');
 body.innerHTML=
   '<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 18px 6px">Banner color</div>'
  +'<div style="margin:0 16px 10px;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.4">Sets the header bar and the bottom tab bar on every page.</div>'
  +'<div class="list"><div class="thgrid">'+sw+'</div></div>'
  +'<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:18px 18px 6px">Text size</div>'
  +'<div style="margin:0 16px 10px;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.4">Scales text and everything around it on every page, so buttons and rows stay easy to hit.</div>'
  +'<div class="list">'+tsz+'</div>'
  +'<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:18px 18px 6px">Accessibility</div>'
  +'<div class="list"><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px">'
  +'<div style="padding-right:12px"><div style="font:700 13px \'Public Sans\';color:var(--ink)">Color-blind friendly palette</div>'
  +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px" id="thm-cb-sub">'+(THEME.cb?'On · every page uses the safe palette and shape cues':'Off · standard palette')+'</div></div>'
  +'<span class="tgl'+(THEME.cb?' on':'')+'" id="thm-cb-tgl"></span></div></div>'
  +'<div style="margin:9px 16px 0;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.45">Swaps red/green signals for an Okabe-Ito safe palette across every page, and gives each status a shape so color is never the only cue.</div>'
  +(THEME.cb?'<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:16px 18px 6px">What the shapes mean</div><div class="list" style="padding:5px 0">'+legend+'</div>':'')
  +'<div style="height:16px"></div>';
}
document.getElementById('s-theme').addEventListener('click',function(e){
 var sw=e.target.closest('.thm-sw');
 if(sw){ e.stopPropagation(); THEME.banner=sw.getAttribute('data-b'); themeSave(); applyBanner(); renderTheme(); return; }
 var ts=e.target.closest('.thm-ts');
 if(ts){ e.stopPropagation(); THEME.size=ts.getAttribute('data-ts'); themeSave(); applyTextSize(); renderTheme(); toast('Text size · '+sizeOf().n); return; }
 var tg=e.target.closest('#thm-cb-tgl');
 if(tg){ e.stopPropagation(); THEME.cb=!THEME.cb; themeSave(); cbApply(); renderTheme(); toast(THEME.cb?'Color-blind palette on':'Standard palette restored'); return; }
});
/* nvs-body is rebuilt on every toggle, so keep only nav rows in it. */
function renderNavSettings(){
 var role=currentRole,opts=NAV_OPTIONS[role]||[],chosen=navChosen(role);
 var rows=opts.map(function(l,i){
   var on=chosen.indexOf(l)>=0,bb=i===opts.length-1?'':';border-bottom:1px solid var(--line)';
   var sub=on?'On the bottom bar':'In the More menu';
   return '<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 15px'+bb+'">'
     +'<div style="padding-right:12px"><div style="font:700 13px \'Public Sans\';color:var(--ink)">'+(TAB_EMOJI[l]||'•')+' '+(PAGE_LABEL[l]||l)+'</div>'
     +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px">'+sub+'</div></div>'
     +'<span class="tgl nvs-tgl'+(on?' on':'')+'" data-l="'+l+'"></span></div>';
 }).join('');
 document.getElementById('nvs-body').innerHTML=
   '<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 18px 6px">Bottom navigation · '+chosen.length+' of 3</div>'
  +'<div style="margin:0 16px 10px;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.4">These are all the pages your role can open. Home always shows first and More always shows last — pick up to 3 to sit between them. Everything you leave off is still one tap away under More.</div>'
  +'<div class="list">'+rows+'</div>';
}
document.getElementById('s-navtabs').addEventListener('click',function(e){
 var t=e.target.closest('.nvs-tgl'); if(!t)return;
 e.stopPropagation();
 var role=currentRole,l=t.getAttribute('data-l');
 var arr=navChosen(role).slice(),idx=arr.indexOf(l);
 if(idx>=0){ arr.splice(idx,1); }
 else{ if(arr.length>=3){ toast('You can only choose 3 — turn one off first'); return; } arr.push(l); }
 navSetChosen(arr);
 renderNavSettings();
});
const hubMap={'Tasks':'taskboard','Farm Map':'map','Inventory':'inventory','Equipment':'equipment','Field Log':'fieldlog','Time Sheet':'timeclock','Time Clock':'timeclock'};
function show(id,push){ const el=document.getElementById('s-'+id); if(!el)return;
  const cur=document.querySelector('.screen.active');
  if(cur){ if(push!==false && cur.id!=='s-'+id) stack.push(cur.id.slice(2)); cur.classList.remove('active');
    /* leaving the work screen tears the GPS session down — no point holding a
       watch open, or a claim on ground nobody is standing in */
    if(cur.id==='s-taskwork' && id!=='taskwork' && typeof twStop==='function') twStop();
    /* Same rule for the farm map: walking away from the screen hands the watch
       back rather than leaving it running behind whatever you opened next. */
    if(cur.id==='s-map' && id!=='map' && typeof mapLocateLeave==='function') mapLocateLeave(); }
  el.classList.add('active'); const r=el.getAttribute('data-role');
  /* `data-role` used to SET currentRole: opening the manager home made you
     the manager. That was how role switching worked, and it is exactly what
     SESSION replaces — your role comes from who signed in, so a screen can no
     longer promote you by being opened. The attribute stays as a label, used
     below to pick which home layout to paint. */
  if(id==='profile')fillProfile(); if(id==='profedit')renderProfEdit(); if(id==='roster')rstRender(); if(id==='rosteredit')rstEditRender(); if(id==='adminxfer')axfRender(); if(id==='spraysettings')sprRender(); if(id==='farmsettings')fstRender(); if(id==='bugreport')bugRender(); if(id==='bugsettings')bgsRender(); if(id==='sharedb')sdbRender(); if(id==='admin')admRender(); if(id==='flfix')flxRender(); if(id==='mowersettings')mwsRender(); if(id==='labsettings')lbsRender(); if(id==='semsettings')smsRender(); if(id==='roles')authRenderAccount();
  if(id==='login')authRenderLogin(); if(id==='notifications'){setSeen(Date.now());setTimeout(updateBellBadges,0);} if(id==='home-manager')renderHomeNotif(); if(id==='weather')wxEnter(); if(id==='map')mapEnter(); if(id==='taskboard')boardEnter(); if(id==='templates')renderTemplates(); if(id==='assign')assignEnter(); if(id==='plotpick')renderPlotPick(); if(id==='taskwork')renderTaskWork(); if(id==='inventory')invEnter(); if(id==='lowstock')renderLowStock(); if(id==='additem')renderAddItem(); if(id==='invlog')renderInvLog(); if(id==='itemdetail')0; if(id==='equipment')equipEnter(); if(id==='eqreport')renderEqReport(); if(id==='eqmaint')renderEqMaint(); if(id==='eqedit')renderEqEdit(); if(id==='eqsched')renderEqSched(); if(id==='calendar')calEnter(); if(id==='caladd')renderCalAdd(); if(id==='timeclock')tcEnter(); if(id==='tcperson')tcRenderPerson(); if(id==='fieldlog')fieldlogEnter(); if(id==='flexport')renderFlExport(); if(id==='flnew')renderFlNew(); if(id==='fldetail')renderFlDetail(); if(id==='more')moreEnter(); if(id==='trial')trialsEnter(); if(id==='trialdetail')trRenderDetail(); if(id==='trialedit')trRenderEdit(); if(id==='trialres')trRenderRes(); if(id==='trialpin')trRenderPin(); if(id==='navsettings')renderPrefsHub(); if(id==='notifsettings')renderNotifSettings(); if(id==='powersettings')renderPowerSettings(); if(id==='navtabs')renderNavSettings(); if(id==='homescreen')renderHomeSettings(); if(id==='theme')renderTheme(); if(id.indexOf('home-')===0)hwApply(r||currentRole); renderTabs();
  try{updateBellBadges();}catch(e){}
  try{syncBack(el);}catch(e){}
  try{navSyncHistory();}catch(e){}
  const sc=el.querySelector('.app'); if(sc)sc.scrollTop=0; }
function go(id){ if(id) show(id,true); }

/* The desktop master-detail split lived here. It only ever ran in the 'desktop'
   band, and that band has been merged into 'tablet' — one large-screen layout
   instead of two — so a detail screen now replaces its list at every width, the
   way it always has on a phone. */

/* Bottom-bar tabs are root navigation, not history: hopping Home -> Map -> Tasks
   should not leave three screens piled up behind you. Clearing here is what lets
   the header arrow mean "you drilled in from somewhere" rather than "you have
   tapped around a bit". */
function goRoot(id){ if(!id) return; stack.length=0; show(id,false); }
function back(){ const p=stack.pop(); if(p) show(p,false); }
/* Android's back button and the edge-swipe should walk the same stack the header
   arrow does. Rather than mirroring every screen into history - which desyncs the
   moment a tab clears the stack - keep exactly one spare entry parked behind us
   whenever there is somewhere to go back to, and re-park it after each pop. */
var _navSpare=false;
function navSyncHistory(){
  try{ if(stack.length>0 && !_navSpare){ history.pushState({tf:1},''); _navSpare=true; } }catch(e){}
}
window.addEventListener('popstate',function(){
  _navSpare=false;
  /* Nothing left to unwind means this is a real exit - let it through. */
  if(stack.length>0){ back(); navSyncHistory(); }
});
/* One place that decides whether this screen shows an arrow, so a screen added
   later gets the behaviour for free instead of needing its own chevron. */
function syncBack(el){
  if(!el) return;
  const hdr=el.querySelector('.hdr'); if(!hdr) return;
  /* Home is the bottom of every stack. Even if something upstream leaves a
     stray entry behind, an arrow on the home banner points at nothing the user
     asked for - so home never gets one, and any leftover one is cleared. */
  if(/^s-home-/.test(el.id||'')){
    const old=hdr.querySelector('.backbtn[data-autoback]'); if(old) old.remove();
    return;
  }
  const want=stack.length>0;
  let bb=hdr.querySelector('.backbtn');
  const owned=bb&&bb.hasAttribute('data-autoback');
  /* A hand-written chevron keeps its own markup, but it still has to obey the
     stack - a screen like Field Log is a drill-in from More for one role and a
     bottom tab for another, and an arrow that points nowhere is the bug we are
     here to fix. */
  if(bb&&!owned){ bb.style.display=want?'':'none'; return; }
  if(want&&!bb){
    bb=document.createElement('div');
    bb.className='backbtn tap';
    bb.setAttribute('data-autoback','1');
    bb.setAttribute('role','button');
    bb.setAttribute('aria-label','Back');
    bb.textContent='‹';
    hdr.insertBefore(bb,hdr.firstChild);
    /* Headers that push their action button to the right use space-between,
       which would fling the new arrow away from the title. */
    if(/space-between/.test(hdr.getAttribute('style')||'')){
      hdr.setAttribute('data-hdrjust',hdr.style.justifyContent||'');
      hdr.style.justifyContent='flex-start';
      const ttl=hdr.querySelector('.title'); if(ttl&&!ttl.style.flex){ ttl.setAttribute('data-hdrflex','1'); ttl.style.flex='1'; }
    }
  } else if(!want&&bb&&owned){
    bb.remove();
    if(hdr.hasAttribute('data-hdrjust')){ hdr.style.justifyContent=hdr.getAttribute('data-hdrjust')||'space-between'; hdr.removeAttribute('data-hdrjust'); }
    const ttl=hdr.querySelector('[data-hdrflex]'); if(ttl){ ttl.style.flex=''; ttl.removeAttribute('data-hdrflex'); }
  }
}
function toast(m){ let d=document.getElementById('toast'); if(!d){d=document.createElement('div');d.id='toast';app.appendChild(d);} d.textContent=m; d.className='show'; clearTimeout(window._tt); window._tt=setTimeout(()=>d.className='',1400); }
function btn(scope,sub,dest,tm){ document.querySelectorAll('#s-'+scope+' *').forEach(el=>{ if(el.children.length===0 && el.textContent.trim().includes(sub)){ el.classList.add('tap'); if(dest)el.setAttribute('data-go',dest); if(tm)el.setAttribute('data-toast',tm);} }); }
function heroNth(scope,dest){ const h=document.querySelector('#s-'+scope+' .app.field > div:nth-of-type(2)'); if(h){h.classList.add('tap');h.setAttribute('data-go',dest);} }
function rowsGo(scope,dest){ document.querySelectorAll('#s-'+scope+' .row').forEach(r=>{r.classList.add('tap');r.setAttribute('data-go',dest);}); }
/* The sign-in button is a real form submit now, not a nav link. */
heroNth('home-grad','trial'); rowsGo('home-grad','trial');
heroNth('home-faculty','trial'); rowsGo('home-faculty','trial');
heroNth('home-tech','equipment');
document.querySelectorAll('#s-home-tech .row').forEach(r=>{ const x=r.textContent; r.classList.add('tap'); r.setAttribute('data-go', x.includes('Fungicide')?'fieldlog': x.includes('Fix reel')?'equipment':'taskboard'); });
const wx=document.querySelector('#s-home-manager .wx'); if(wx){wx.setAttribute('data-go','weather');wx.classList.add('tap');}
btn('home-undergrad','Clock In','timeclock');
btn('taskboard','New Task','tasknew');
document.querySelectorAll('#s-taskboard .pill').forEach(p=>{ if(p.textContent.trim()==='Claim'){p.classList.add('tap');p.setAttribute('data-toast','Claimed ✓');}});
btn('tasknew','Create Task','taskboard','Task created ✓');
