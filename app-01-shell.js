/* ============================================================
   THE SHELL — what the app looks like before it holds any farm data.

   Per-person preferences, the adaptive shell (phone / roomy layout), the
   notification list, the home-screen widgets, and the theme: banner color,
   text size, and color-blind mode.

   ONE THING TO KNOW. Color-blind mode works by reading the text of every
   <style> block in the page and rewriting the colors it finds (see cbCss()).
   That is why the app's CSS has to stay written inside UT-TurfFarm-App.html.
   Move the CSS out to a .css file and color-blind mode stops working with no
   error at all -- nothing to see, just wrong colors for the people who need
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
  try{ ntfLoad(); }catch(e){}
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
 'taskboard':'taskboard','taskdetail':'taskboard','tasknew':'taskboard','taskwork':'taskboard','taskprep':'taskboard','eqpick':'taskboard','gradreq':'taskboard','templates':'taskboard','assign':'taskboard','plotpick':'taskboard',
 'map':'map','indoor':'map',
 'inventory':'inventory','itemdetail':'inventory','invlog':'inventory','additem':'inventory','lowstock':'inventory','cntpick':'inventory','cntcount':'inventory','cntdone':'inventory',
 'trial':'trial','trialdetail':'trial','trialedit':'trial','trialres':'trial',
 'equipment':'equipment','eqdetail':'equipment','eqreport':'equipment','eqmaint':'equipment','eqedit':'equipment','eqsched':'equipment',
 'fieldlog':'fieldlog','flnew':'fieldlog','fldetail':'fieldlog','flexport':'fieldlog',
 'timeclock':'timeclock','tcperson':'timeclock',
 'calendar':'calendar','calevent':'calendar','caladd':'calendar',
 'weather':'weather','wxday':'weather','wxradar':'weather',
 'more':'more','bugreport':'more'
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
   return '<div class="tab'+(on?' on':'')+(d&&csLocked(d)?' cs-soon':'')+'"><span class="te">'+(TAB_EMOJI[l]||'•')+'</span>'+l+'</div>';
 }).join('');
}

/* ================= adaptive shell =================
   Tablet and desktop swap the bottom tab bar for a persistent left rail, built
   from the same navMap and TAB_EMOJI the bar uses — a page added to
   PAGE_DEST/NAV_OPTIONS shows up in both places with no extra wiring, wearing
   the same icon in both. The difference is how much fits: the bar has five
   slots, so it shows the three chosen favourites. The rail has a whole column,
   so it shows every page the role can reach, plus More.

   More is on the rail even though every page already is, because More is not
   only a page list. It is the ONLY door in the app to Report a technical bug.
   Leaving it off — on the reasoning that a monitor has room for every page, so
   nothing needs hiding behind More — made that unreachable on every iPad and
   laptop, with nothing on screen to say so. The rule this restores: the rail is
   navMap, whole. See docs/DECISIONS.md.

   It used to be the only door to Farm settings and Admin as well. Both now hang
   off the Profile page instead (2026-09-30), which is reached from the avatar in
   every home banner at BOTH widths — so the same trap does not reopen. If you
   move either of them again, check the door exists narrow and wide before you
   push. */

/* The rail's account block belonged to the retired desktop band. Profile,
   notifications, roster, preferences and log out are reached the same way they
   always have been on phone and tablet — behind More, the bell and the avatar. */

/* SCREEN_DEST rolls the page screens up to their tab; the account screens need
   the same treatment so the rail stays lit while you're three levels into
   Preferences or editing a roster entry.

   The farm-settings screens roll up to farmsettings, which rolls up to profile,
   for the same reason Preferences does: they hang off the Profile page, and
   Profile is not a rail item, so nothing lights while you are in one. That is
   right — they are not pages. They belong HERE and not in SCREEN_DEST —
   SCREEN_DEST is shared with the phone's bottom bar, and adding them there
   would change what lights up on the crew's phones. */
var RAIL_ROLLUP={profedit:'profile',rosteredit:'roster',adminxfer:'roster',
  navtabs:'navsettings',homescreen:'navsettings',notifsettings:'navsettings',theme:'navsettings',
  powersettings:'navsettings',
  farmsettings:'profile',spraysettings:'farmsettings',mowersettings:'farmsettings',
  labsettings:'farmsettings',catsettings:'farmsettings',ressettings:'farmsettings',
  semsettings:'farmsettings',clocksettings:'farmsettings',sharedb:'farmsettings',
  bugsettings:'farmsettings'};

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
    return '<div class="rl-item'+(o.on?' on':'')+(o.bell?' bellwrap':'')+(o.dest&&csLocked(o.dest)?' cs-soon':'')+'"'
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

  /* More, below the divider, wearing the same ••• and the same word it wears on
     the phone's bottom bar — a page must not change its face between the two.
     It carries the utility rows (Report a technical bug, Farm settings, Admin,
     Log out), and it is the only thing that reaches them. Built through the
     same item() as the pages above, so it needs no wiring of its own: the rail
     click handler already routes data-dest through goRoot(), and show('more')
     already calls moreEnter() to decide which rows that role may see.

     Adding it here rather than three separate rail rows is deliberate. More
     builds its own list, so anything added to it in future turns up on a big
     screen too, instead of quietly existing only on phones.

     82px still can't carry the whole account block, and it doesn't have to:
     Profile, notifications, preferences, roster and log out are behind the
     avatar and the bell. The "Switch" slot (switch-role/switch-user) was
     demo-only and was removed 2026-08-25 -- nothing replaces it. */
  if(nm.More) h+=item({k:'More',ic:railIcon('More'),dest:nm.More,
                       on:nm.More===dest,label:'More'});

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
  try{csPlace(document.querySelector('.screen.active'));}catch(e){}
  if(!APP_SIZE_APPLY()) return;
  renderRail();
  /* moreEnter() decides which More rows to show by size band (see moreEnter),
     so a size flip while already on that screen needs it re-run, or a phone
     turned sideways into tablet width would keep showing pages twice. */
  if(document.getElementById('s-more')&&document.getElementById('s-more').classList.contains('active'))moreEnter();
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
var MORE_ALWAYS={roles:1,login:1,bugreport:1};
function moreEnter(){ var role=currentRole,nav=navMap[role]||{},chosen=navChosen(role);
  var onNav={};
  /* On the phone's bottom bar only the 3 chosen favourites sit outside More, so
     everything else reachable still needs a row here. From tablet width up the
     rail replaces that bar and shows EVERY reachable page (see renderRail()),
     so listing them again here would just be the same page twice on one
     screen. Treat every reachable page as already "on nav" there instead,
     leaving More to do the one job the rail can't: Report a bug. */
  if((typeof APP_SIZE==='function')&&APP_SIZE()!=='phone'){
    (NAV_OPTIONS[role]||[]).forEach(function(l){ if(PAGE_DEST[l]) onNav[PAGE_DEST[l]]=1; });
  } else {
    chosen.forEach(function(l){ if(nav[l]) onNav[nav[l]]=1; });
  }
  var reachable={}; (NAV_OPTIONS[role]||[]).forEach(function(l){ if(PAGE_DEST[l]) reachable[PAGE_DEST[l]]=1; });
  var scr=document.getElementById('s-more'); if(!scr)return;
  scr.querySelectorAll('.row[data-go]').forEach(function(r){
    var d=r.getAttribute('data-go');
    if(MORE_ALWAYS[d]){ r.style.display=''; return; }
    r.style.display=(reachable[d]&&!onNav[d])?'':'none';
    r.classList.toggle('cs-soon',csLocked(d));
  });
  /* Farm settings and Admin used to be the two rows on this screen that were
     decided by something other than the role's page list - one by the App
     Manager hat, one by farmCanSee(). Both moved to the Profile page on
     2026-09-30 and fillProfile() makes that decision now. */
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
/* `live` marks the ones that actually send something today. The rest are the
   screen's original rows, kept because the farm wants them, and they are
   labelled on the screen as not sending yet -- a toggle that quietly does
   nothing is worse than one that says so. Take the label off by adding
   live:1 in the same change that wires the alert up. */
/* `g` is the heading a switch sits under, and it is the PAGE OF THE APP the
   alert comes from. One flat list of eleven switches gave no clue which part
   of the app any of them was about, and six of them are now the Task Board's
   alone. Grouping by page means somebody looking for "why am I being told
   about this" starts from the screen they saw it on.

   The screen builds its headings from this column, in the order the rows are
   written, so a new alert is still one row and a brand new page's heading
   appears on its own. Nothing has a list of headings to keep in step. */
var NOTIF_ALERTS=[
 {g:'Task board', k:'tasks',  t:'Work assigned to me', d:1, live:1,
  sub:'Off means nobody tells you when a job lands on your list'},
 {g:'Task board', k:'done',   t:'A job I handed out is finished', d:1, live:1},
 {g:'Task board', k:'partial',t:'A job came back part-finished',  d:1, live:1,
  sub:'Somebody did what they could and left the rest for you to hand on'},
 /* The three stages of a labor request, each with its own switch because
    they are three different things to be interrupted about. Kept together and
    in order -- asked, accepted, finished -- so the screen reads as the story
    it is. Who gets which is worked out in ntfScan(); in short, the first goes
    to whoever is being asked and the other two go back to whoever asked. */
 {g:'Task board', k:'reqnew', t:'A labor request lands on me', d:1, live:1,
  sub:'Bill asking you to take a job on, or a grad or technician asking you for help'},
 {g:'Task board', k:'reqok',  t:'A labor request I sent is accepted', d:1, live:1},
 {g:'Task board', k:'reqdone',t:'A job I asked for is finished', d:1, live:1},
 /* Wired up on 2026-10-01; before that these three saved their setting and
    nothing read it. WHO HEARS WHICH is Dillon's call and is written out in
    full over ntfScanEquip() further down -- the short version is that a
    machine going down reaches everybody, because anybody might walk out to
    it, while an issue report and a low shelf only reach the people who would
    act on them.

    TWO ROWS FOR EQUIPMENT, not one. "Equipment down" covering an issue report
    as well would be this screen telling a small lie about what it does, which
    is the exact thing the "Not sending yet" labels exist to stop. */
 {g:'Equipment',  k:'equip',  t:'A machine goes down',   d:1, live:1,
  sub:'And when it is back in service \u00b7 everybody is told'},
 {g:'Equipment',  k:'eqflag', t:'An issue is reported on a machine', d:1, live:1,
  sub:'Bill, the technicians and faculty \u00b7 whoever would fix it'},
 {g:'Inventory',  k:'low',    t:'A product reaches its reorder point', d:1, live:1,
  sub:'Bill and faculty \u00b7 the people who order'},
 /* Still the only unwired row, and deliberately so: Dillon's call on
    2026-10-01 was that a spray window you only hear about when you happen to
    open the app is worth little, so weather waits for real phone push. */
 {g:'Weather',    k:'wx',     t:'Weather & spray window',d:1},
 /* Default ON, where the day it was written it was off. Closed ground is the
    one thing on this list that can put somebody on a trial with a mower. */
 {g:'Trials',     k:'trials', t:'Ground closes, or opens again', d:1, live:1,
  sub:'A restriction starting, ending or being lifted, named by plot'},
 /* The clock's four. The first two are for whoever runs the crew -- they only
    ever raise on a phone that can edit a timesheet -- and the last two are
    for the student whose shift it is. Everybody sees all four switches,
    because preferences follow the person and not the role; a switch that can
    never fire for you simply never fires. */
 {g:'Time clock', k:'clockin', t:'Somebody clocks in',  d:1, live:1},
 {g:'Time clock', k:'clockout',t:'Somebody clocks out', d:1, live:1},
 {g:'Time clock', k:'shiftauto',t:'My shift was closed for me', d:1, live:1,
  sub:'You forgot to clock out and the app closed it at your scheduled finish'},
 {g:'Time clock', k:'shiftask', t:'I forgot to clock out', d:1, live:1,
  sub:'Only when the app has no scheduled finish to use, so it asks you instead'}
];
/* "Push notifications" used to be a row here and is not any more, as of
   2026-10-02. Buzzing is granted by the BROWSER, per device -- somebody with a
   phone and an iPad says yes on each -- so a single switch that followed the
   person around could only ever disagree with what their phones were actually
   doing. The real control is the "Buzz this phone" row at the top of the
   screen (ntsPushRow), which reads the true state off the browser every time
   it is drawn. The saved `d_push` setting is simply left alone on phones that
   have one; nothing reads it. */
var NOTIF_DELIVERY=[
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
 /* Read off the browser rather than off a saved setting, because whether this
    phone buzzes is the browser's answer to give, not ours. */
 var st=''; try{ st=pushState(); }catch(e){}
 if(st==='on') bits.push('buzzes this phone');
 else if(st==='needs-install') bits.push('add to home screen to buzz');
 else if(st==='blocked') bits.push('buzzing blocked');
 else if(st==='off') bits.push('not buzzing this phone');
 return bits.join(' · ');
}
function ntsToggle(k,label,sub,last){
 var bb=last?'':';border-bottom:1px solid var(--line)';
 return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px'+bb+'">'
  +'<div style="padding-right:12px"><div style="font:700 13px \'Public Sans\';color:var(--ink)">'+label+'</div>'
  +(sub?'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px">'+sub+'</div>':'')+'</div>'
  +'<span class="tgl nts-tgl'+(NOTIF[k]?' on':'')+'" data-k="'+k+'"></span></div>';
}
/* This note used to say that buzzing was "still to be built", which was true
   until 2026-10-02 and is the reason it was written: a settings screen that
   quietly promises something it cannot do is worse than one that admits it.
   It now says the other true thing -- that the switches below decide WHAT you
   are told, and the row above decides whether this particular phone buzzes
   about it. Those are two different questions and people reasonably confuse
   them. */
var NTS_NOTE='<div style="margin:12px 16px 0;padding:11px 13px;background:var(--card);'
 +'border:1px solid var(--line);border-radius:12px;font:600 11.5px \'Public Sans\';'
 +'color:var(--muted);line-height:1.5">The switches below decide <b style="color:var(--ink)">'
 +'what you are told about</b>, on the bell and on your phone alike. Whether this '
 +'phone buzzes with the app shut is the row above, and you set that on each '
 +'phone or tablet you use.</div>';
function ntsSec(t){
  return '<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;'
    +'letter-spacing:.5px;margin:16px 18px 6px">'+t+'</div>';
}
/* One heading per page, in the order the rows are written in NOTIF_ALERTS.
   Built from the rows themselves rather than from a list of headings kept
   beside them -- a second list is a list that eventually disagrees, and the
   way it fails is a switch that quietly stops being drawn. */
function ntsAlertGroups(){
  var order=[], by={};
  NOTIF_ALERTS.forEach(function(a){
    var g=a.g||'Alerts';
    if(!by[g]){ by[g]=[]; order.push(g); }
    by[g].push(a);
  });
  return order.map(function(g){
    var rows=by[g];
    return ntsSec(g)+'<div class="list">'+rows.map(function(a,i){
      return ntsToggle('a_'+a.k,a.t,a.live?(a.sub||''):'Not sending yet',i===rows.length-1);
    }).join('')+'</div>';
  }).join('');
}
/* The one row on this screen that is about THIS PHONE rather than about the
   person. Notifications are granted by the browser, per device, so somebody
   with a phone and an iPad has to say yes on both -- and an iPhone will not
   even offer until the app has been added to the home screen, which is
   Apple's rule and cannot be worked around in code. So the row says which of
   those situations you are in, in words, rather than failing silently. */
function ntsPushRow(){
  var st=pushState(), head='Buzz this phone', sub='', btn='', hint='';
  if(st==='nosender'){
    sub='Not set up yet \u2014 nothing can reach a phone with the app shut';
  } else if(st==='needs-install'){
    sub='Add the app to your home screen first, then come back here';
    hint='On an iPhone: the Share button at the bottom of Safari, then '
       + '<b>Add to Home Screen</b>. Apple does not allow notifications until '
       + 'you do, and there is nothing the app can do about that.';
  } else if(st==='unsupported'){
    sub='This browser cannot do it. The bell inside the app still works.';
  } else if(st==='blocked'){
    sub='Your phone is blocking them';
    hint='Turn them back on in your phone\u2019s own settings for this app, '
       + 'then come back. The app cannot ask again once it has been refused.';
  } else if(st==='on'){
    sub='On \u2014 this phone buzzes even with the app closed';
    btn='<span class="pill tap nts-push" data-push="off" '
      + 'style="background:var(--card);border:1px solid var(--line);color:var(--muted)">Turn off</span>';
  } else {
    sub='Off \u2014 alerts only appear when you open the app';
    btn='<span class="pill tap nts-push" data-push="on" '
      + 'style="background:var(--acc);color:#fff">Turn on</span>';
  }
  if(PUSH.err) sub=PUSH.err;
  return '<div class="list" style="margin-top:12px">'
   +'<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px">'
   +'<div style="padding-right:12px"><div style="font:700 13px \'Public Sans\';color:var(--ink)">'+head+'</div>'
   +'<div style="font:600 11px \'Public Sans\';color:var(--muted);margin-top:2px">'+sub+'</div></div>'
   +(btn||'')+'</div>'
   +(hint?('<div style="padding:0 15px 12px;font:600 11px \'Public Sans\';color:var(--muted);line-height:1.5">'+hint+'</div>'):'')
   +'</div>';
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
 var sec=ntsSec;
 body.innerHTML=
   ntsPushRow()
  +NTS_NOTE
  +sec('Push notification hours')
  +'<div class="list">'
   +ntsToggle('quiet','Limit delivery hours',
      NOTIF.quiet?'On · push notifications only arrive in this window'
                 :'Off · push notifications come through any time',!NOTIF.quiet)
   +quietExtra
  +'</div>'
  +ntsAlertGroups()
  +sec('Delivery')
  +'<div class="list">'+NOTIF_DELIVERY.map(function(a,i){
      return ntsToggle('d_'+a.k,a.t,a.live?'':'Not sending yet',i===NOTIF_DELIVERY.length-1);
    }).join('')+'</div>'
  +'<div style="margin:12px 16px;font:600 11px \'Public Sans\';color:var(--muted)">These settings are yours alone — they follow you, not your role.</div>'
  +'<div style="height:16px"></div>';
}
document.getElementById('s-notifsettings').addEventListener('click',function(e){
 var pb=e.target.closest('.nts-push');
 if(pb){
   e.stopPropagation();
   var want=pb.getAttribute('data-push')==='on';
   /* Asking the browser has to happen on the tap itself -- a browser refuses
      the question if it did not come straight from somebody's finger. */
   var job=want?pushAsk():pushStop();
   renderNotifSettings();
   job.then(function(){ renderNotifSettings(); });
   return;
 }
 var t=e.target.closest('.nts-tgl'); if(!t)return;
 e.stopPropagation();
 var k=t.getAttribute('data-k');
 NOTIF[k]=!NOTIF[k];
 /* Turning the window off takes the morning summary with it — a recap of what
    was held back makes no sense when nothing is being held back. */
 if(k==='quiet'&&!NOTIF.quiet)NOTIF.summary=false;
 notifSave(); renderNotifSettings();
 /* The sender keeps its own copy of these, because it is the one that has to
    decide not to send -- see the note over pushPrefs(). Failing quietly is
    right: the switch is already saved, and the bell obeys it either way. */
 try{ pushPrefsChanged(); }catch(_e){}
},true);
document.getElementById('s-notifsettings').addEventListener('change',function(e){
 var t=e.target.closest&&e.target.closest('.nts-time'); if(!t)return;
 NOTIF[t.getAttribute('data-k')]=t.value||'07:00';
 notifSave();
 try{ pushPrefsChanged(); }catch(_e){}
});
notifLoad();

/* ===================== The notification feed =====================
   What the bell actually counts, and what the Notifications screen actually
   shows. Until now both were pretending: the list behind them held six
   hand-typed examples, the same on every phone, and nothing in the app ever
   added to it or took anything away.

   THE ONE DECISION THAT SHAPES ALL OF THIS: a notification is not a record.
   Nothing here is stored in the shared database and nothing here is sent
   anywhere. Every phone already holds every task, so "a job landed on me" is
   just this phone noticing that a task it already had now has my name on it.
   Working it out costs one walk down the task list; storing it would cost a
   new drawer, a new set of permission rules, a record per person per event
   piling up forever, and a fresh chance to build the send-it-back-and-forth
   loop that spent 4.4 million reads in an afternoon on 2026-08-31. See
   CLAUDE.md. Derived beats stored here, and it is not close.

   WHAT THAT COSTS, so nobody is surprised later. A phone can only tell you
   about a change it has seen. Sign in on a brand new phone and its first look
   at the task list is a baseline, not a pile of catching-up -- otherwise
   everyone's first sign-in would open onto two hundred alerts about jobs from
   last season. And this reaches somebody when they OPEN the app; making a
   phone buzz with the app shut is a separate job, needing each person to add
   the app to their home screen and something outside the phones to do the
   sending. Nothing here has to be rewritten when that is built: these events
   are what it will send.

   WHAT EACH PHONE REMEMBERS, under the signed-in person like every other
   preference, so two people sharing a phone do not read each other's alerts:
     seen   -- the last state this phone acted on, one small entry per task,
               thrown away with the task itself so it cannot grow forever
     list   -- the events themselves, newest first, capped both ways
     readAt -- when this person last opened the screen
     base   -- when this phone started watching; 0 means it never has

   and since 2026-10-01 three more of the same kind, one per thing the farm
   watches besides jobs and punches: eseen (machines that are down or flagged),
   iseen (products at or below their reorder point) and rseen (restrictions
   standing on ground right now), each with its own baseline. They are short
   lists of ids rather than an entry per record -- see the long note over
   ntfScanEquip().                                                          */
var NTF_MAX=120;           /* events kept per person */
var NTF_KEEP_DAYS=30;      /* and for how long, whichever runs out first */
/* `seen` is jobs and `pseen` is time-clock punches, with a baseline each.
   Two maps rather than one because each walk REPLACES its own map to throw
   away records that have gone -- one shared map would have the job walk
   quietly delete every punch. Two baselines because the two lists arrive at
   different moments: a phone can easily know about the farm's jobs a minute
   before the first punch reaches it, and counting that as "I have now seen
   the time clock" would make every historical shift look like news. */
var NTF={v:2,seen:{},pseen:{},list:[],readAt:0,base:0,pbase:0,
         eseen:{},iseen:{},rseen:{},ebase:0,ibase:0,rbase:0};
function ntfLoad(){
  var s=prefsGet('ntfeed',null)||{};
  /* A map that is missing reads as empty and a baseline that is missing reads
     as 0, which is what makes adding one safe for a phone whose ledger was
     written by an older build: it simply takes a fresh silent baseline for
     the new thing and tells nobody about the farm's history. */
  function map(x){ return (x&&typeof x==='object')?x:{}; }
  /* THE LEDGER'S SHAPE CHANGED ON 2026-10-02 and a phone cannot be allowed to
     read the old one. It used to record "is this job MINE" as a yes or no;
     it now records WHOSE it is, because the same walk has to answer that for
     everybody before it can ask the sender to buzz them. Compare the two
     shapes and a phone upgrading would read "it was mine (1), now it is
     p18's" as p18 having just been given every job on the farm -- and buzz
     them about all of it.

     So an old ledger is dropped and the next walk is a silent baseline, the
     same as a phone that has never had the app. The person's own read alerts
     (`list` and `readAt`) are kept, because those are still perfectly good --
     it is only the "what did the farm look like last time" half that cannot
     be understood any more. */
  var fresh=(+s.v||0)<2;
  if(fresh) s={list:s.list, readAt:s.readAt};
  NTF={v:2, seen:map(s.seen), pseen:map(s.pseen),
       eseen:map(s.eseen), iseen:map(s.iseen), rseen:map(s.rseen),
       list:Array.isArray(s.list)?s.list:[],
       readAt:+s.readAt||0, base:+s.base||0, pbase:+s.pbase||0,
       ebase:+s.ebase||0, ibase:+s.ibase||0, rbase:+s.rbase||0};
}
function ntfSave(){ prefsSet('ntfeed',{v:2,seen:NTF.seen,pseen:NTF.pseen,list:NTF.list,
                                       readAt:NTF.readAt,base:NTF.base,pbase:NTF.pbase,
                                       eseen:NTF.eseen,iseen:NTF.iseen,rseen:NTF.rseen,
                                       ebase:NTF.ebase,ibase:NTF.ibase,rbase:NTF.rbase}); }
/* WHICH SWITCH GOVERNS WHICH ALERT, and they are not all the same word.
   Five of the sixteen alerts are governed by a switch with a different name --
   "work assigned to me" is one row on the settings screen but the event is
   called `assigned`, a machine going down and coming back are one switch
   between them, and so are ground closing and opening. Anything not named here
   is governed by a switch of its own name.

   Written down as a table on 2026-10-02 because it had been an accident until
   then: each branch used to pass the switch name by hand, and when the walks
   were rebuilt to ask "who hears this" the hand-written names went with them.
   Muting "work assigned to me" then did nothing at all -- the switch said off,
   the row still appeared, and nothing anywhere said why. The test caught it;
   a person would have reported it as "the app ignores me". */
var NTF_SWITCH={ assigned:'tasks', eqdown:'equip', equp:'equip',
                 resclose:'trials', resopen:'trials' };
function ntfSwitchOf(kind){ return NTF_SWITCH[kind]||kind; }
function ntfOn(k){ try{ return NOTIF['a_'+ntfSwitchOf(k)]!==false; }catch(e){ return true; } }

/* Whose plate the job is on. Just the assignee: a labor request that has not
   been taken on yet is NOT on anybody's plate, it is a question, and it has
   its own three alerts below. */
function ntfPlate(t){ return t.assignee||null; }
/* Who handed it out. Three fields because three routes make a job: the assign
   wizard stamps assignedBy, a request stamps requestedBy, and anything older
   or self-made only carries createdBy. */
function ntfFrom(t){ return t.assignedBy||t.requestedBy||t.createdBy||null; }
/* Part-finished and still nobody's problem. restAssigned is stamped the moment
   Bill hands the rest on or writes it off, which is what ends the alert. */
function ntfPart(t){
  return t.status==='done'&&!!t.partial&&((t.leftPlots||[]).length>0)&&!t.restAssigned;
}

/* ---- labor requests ----
   A request is a job somebody is ASKING for rather than handing out, and it
   goes two ways. Both end up as the same record, which is why one set of
   helpers covers both:

     Bill (or whoever holds his job) -> a grad student or technician.
       origin 'manager', target is the person being asked. Made either from
       the request form (openCrewReq, app-05) or from the Assign wizard, which
       quietly turns into a request the moment Bill picks somebody who is not
       an undergrad -- see the isCrew() line in commitTask(). They ACCEPT it
       (acceptCrewReq, app-03), which sets assignee to themselves.

     A grad student or technician -> whoever hands work to undergraduates.
       origin 'crew', no target, students is how many people they need. It is
       ACCEPTED by that person picking an undergrad on the task sheet (the
       data-assign handler in app-04), which sets assignee to the undergrad.

   So "accepted" is the same moment in both: it stops being a request and
   starts being somebody's task. Nothing in the record says WHO accepted it,
   and nothing needs to -- see the note over the reqok branch in ntfScan(). */
function ntfIsReq(t){ return t.kind==='request'||!!t.requestedBy||!!t.origin; }
function ntfReqOpen(t){ return t.kind==='request'&&!t.assignee; }
/* Is this open request MY question to answer. For Bill's kind, the person he
   asked. For the crew's kind, whoever can hand work to undergraduates -- read
   off the roster through assignsUndergrads() rather than hardcoding Bill, so
   it still reaches the right person the week he is away, and in 2030. */
function ntfReqFor(t,me){
  if(!ntfReqOpen(t)) return 0;
  if(t.origin==='manager') return (t.target===me)?1:0;
  try{ return (typeof assignsUndergrads==='function'&&assignsUndergrads(me))?1:0; }
  catch(e){ return 0; }
}
/* The five facts about a task this feed reacts to, as 1s and 0s, from the
   point of view of one person. Small on purpose: it is stored once per task.
   A missing field reads as 0, which is what makes adding one here safe for
   phones that already have a ledger written under the old shape. */
function ntfWatch(t){
  return { a:String(ntfPlate(t)||''), s:(t.status==='done')?1:0,
           p:ntfPart(t)?1:0, q:ntfReqOpen(t)?1:0 };
}

/* ===== WHO HEARS A THING, as opposed to whether I do =====
   Added 2026-10-02, when phones started being able to buzz with the app shut.

   Everything above this line was written from ONE point of view: "is this mine
   to hear". That is all a bell needs, because the phone showing the bell
   belongs to the person asking. It is no use at all for buzzing, and the
   reason is worth understanding before changing any of it.

   A phone can only raise an alert it is awake for. The whole point of buzzing
   is to reach a phone that is ASLEEP, with the app shut -- so the phone that
   notices has to work out who else should be told and ask the sender to tell
   them. "Is it mine" cannot answer that. "Whose is it" can, and "is it mine"
   then falls out of it: I hear a thing when I am in its audience.

   So every walk below now decides the AUDIENCE of each change, and my own feed
   is what is left after asking whether I am in it. One rule, read two ways,
   which is the only arrangement where the bell and the buzz cannot disagree --
   and tools/test-notifications.js section 23 sweeps every person against every
   event to prove they never do.                                            */

/* Tidy a list of maybe-people into real, active roster ids, with duplicates
   and blanks dropped. Everything below hands its answer through here. */
function ntfWho2(list){
  var out=[], seen={};
  (list||[]).forEach(function(x){
    var id=null;
    try{ id=(typeof pidOf==='function')?pidOf(x):x; }catch(e){ id=x; }
    if(!id) return;
    id=String(id);
    if(seen[id]) return;
    try{ if(typeof personActive==='function'&&!personActive(id)) return; }catch(e){}
    seen[id]=1; out.push(id);
  });
  return out;
}
/* Everybody on the farm today. Used by the two alerts that genuinely are
   everybody's business: a machine going out of service, and ground closing. */
function ntfEveryone(){
  var all=[];
  try{ all=(typeof rstActive==='function')?rstActive():[]; }catch(e){ all=[]; }
  return ntfWho2(all.map(function(p){ return p&&p.id; }));
}
/* Everybody holding one of these roster roles, plus whoever holds the App
   Manager post -- who answers yes to everything, so he hears everything.
   APP_ADMIN is this phone's copy of who that is; it is the best any phone can
   do, because the real answer is a claim on a sign-in token that only that
   person's own phone can read. Getting it wrong costs one alert too many or
   one too few, never a wrong permission. */
function ntfRoles(roles){
  var all=[];
  try{ all=(typeof rstActive==='function')?rstActive():[]; }catch(e){ all=[]; }
  var out=all.filter(function(p){
    try{ return p&&roles.indexOf(personRole(p.id))>=0; }catch(e){ return false; }
  }).map(function(p){ return p.id; });
  try{ if(APP_ADMIN&&APP_ADMIN.pid) out.push(APP_ADMIN.pid); }catch(e){}
  return ntfWho2(out);
}
/* Whoever hands work to undergraduates -- read off the roster rather than
   hardcoding Bill, so it still reaches the right person the week he is away.
   The same question tcCanEditPunches() asks about one phone. */
function ntfAssigners(){
  var all=[];
  try{ all=(typeof rstActive==='function')?rstActive():[]; }catch(e){ all=[]; }
  var out=all.filter(function(p){
    try{ return p&&(typeof assignsUndergrads==='function')&&assignsUndergrads(p.id); }catch(e){ return false; }
  }).map(function(p){ return p.id; });
  try{ if(APP_ADMIN&&APP_ADMIN.pid) out.push(APP_ADMIN.pid); }catch(e){}
  return ntfWho2(out);
}
/* Take people OUT of an audience -- the person who did the thing, almost
   always. Nobody needs telling about what they just did themselves. */
function ntfNot(list,drop){
  var bad={};
  (drop||[]).forEach(function(d){ if(d) bad[String(d)]=1; });
  return (list||[]).filter(function(x){ return !bad[String(x)]; });
}

/* The events one walk produced, with their audiences, for the sender to read.
   Emptied at the start of every scan: it is this look's news, not a history. */
var NTF_EVENTS=[];
function ntfEmit(kind,to,fill){
  to=ntfWho2(to);
  if(!to.length) return null;
  var ev={ k:kind, to:to };
  if(fill) for(var key in fill) if(fill.hasOwnProperty(key)) ev[key]=fill[key];
  NTF_EVENTS.push(ev);
  return ev;
}
/* Do I show this one on my own bell. Two questions, both of which have to be
   yes: is it addressed to me, and have I left that switch on. */
function ntfForMe(ev,me){ return !!ev && ev.to.indexOf(me)>=0 && ntfOn(ev.k); }

/* Walk the task list, and for anything that changed since the last walk, add
   the event to this person's feed. Returns how many were added, which is only
   used by the tests -- nothing in the app cares.

   Cheap by design: no database, no network, and it writes to the phone only
   when something actually changed. It is safe to call from a snapshot handler
   for the same reason -- it touches prefs, never storeScan() or storeTouch().
   See CLAUDE.md, the two traps. */
function ntfScan(){
  var me=null;
  try{ me=(typeof SESSION!=='undefined'&&SESSION)?SESSION.pid:null; }catch(e){}
  if(!me) return 0;                              /* nobody signed in yet */
  var now=Date.now();
  /* FIVE walks, each with its own guard, and NONE of them may be able to stop
     another running. They were one function for about an hour and the time
     clock sat behind the job walk's "no jobs, nothing to do" line -- so on a
     farm with an empty task list the clock alerts silently did not exist.
     Nothing on screen said so; the test caught it. Written out one per line,
     with the result of each kept, for the same reason: a chain of && here
     would make an empty equipment list silence the ground alerts. */
  NTF_EVENTS=[];                                 /* this look's news, not a history */
  var jobs=ntfScanTasks(me,now);
  var punches=ntfScanPunches(me,now);
  var machines=ntfScanEquip(me,now);
  var shelf=ntfScanInv(me,now);
  var ground=ntfScanRes(me,now);
  if(jobs.changed||punches.changed||machines.changed||shelf.changed||ground.changed){
    ntfTrim(); ntfSave();
  }
  return jobs.made+punches.made+machines.made+shelf.made+ground.made;
}
function ntfScanTasks(me,now){
  var all=null; try{ all=TASKS; }catch(e){}
  if(!all||!all.length) return {made:0,changed:false};
  var first=!NTF.base, fresh={}, made=0;
  all.forEach(function(t){
    if(!t||!t.id) return;
    var id=String(t.id), is=ntfWatch(t);
    fresh[id]=is;
    if(first) return;                            /* the baseline walk tells nobody anything */
    var was=NTF.seen[id]||{a:'',s:0,p:0,q:0};
    var from=ntfFrom(t);                         /* who handed it out, or asked for it */
    var req=ntfIsReq(t);

    /* ONE CHANGE CAN BE TWO PIECES OF NEWS, and that is the thing this list
       exists to handle. Bill putting an undergraduate onto a technician's
       request is, in the same instant, "your request was picked up" to the
       technician and "here is a job" to the undergraduate. Two sentences, two
       audiences, one tap.

       So the branches below are CANDIDATES rather than a chain, written in
       lifecycle order, LATEST FIRST -- and the collapse underneath is what
       keeps the old promise of one row per job per look. It just keeps it per
       PERSON, which is what it always really meant: a phone out of signal all
       morning comes back to a job that was requested, accepted and finished,
       and hears only the last of the three that was addressed to it. */
    var cands=[];
    /* Finished, and came back with plots nobody has been given. Ahead of plain
       "finished" on purpose: a part-finished job IS a finished one, and two
       rows about one job reads as a bug and buries the ask. */
    if(is.p&&!was.p)
      cands.push({k:'partial',to:[from],who:t.completedBy||t.assignee||null});
    /* Finished. The job somebody ASKED for and the job somebody HANDED OUT are
       two different alerts with two different switches, because they are two
       different relationships. Neither tells whoever just finished it. */
    if(is.s&&!was.s&&req&&t.requestedBy)
      cands.push({k:'reqdone',to:ntfNot([t.requestedBy],[t.completedBy]),
                  who:t.completedBy||t.assignee||null});
    if(is.s&&!was.s&&!req)
      cands.push({k:'done',to:ntfNot([from],[t.completedBy]),
                  who:t.completedBy||t.assignee||null});
    /* Accepted -- it has stopped being a question and become somebody's job.
       Only the person who ASKED is told, and the record never says who
       accepted it because it never has to: in both directions the person who
       accepts is somebody other than the person who asked. */
    if(was.q&&!is.q&&req&&t.requestedBy)
      cands.push({k:'reqok',to:ntfNot([t.requestedBy],[t.assignee]),who:t.assignee||null});
    /* Work landed on somebody. Not on a job they gave themselves -- they were
       there. Not on a request they were asked about and then accepted either:
       they already heard about that one as a request, and they are the one who
       said yes. */
    if(is.a&&is.a!==was.a)
      cands.push({k:'assigned',to:ntfNot([is.a],[from,t.target]),who:from});
    /* Somebody is asking. Last because it is the earliest stage, and it goes
       to whoever the question is actually FOR: the one person Bill named, or
       everybody who hands work to undergraduates. */
    if(is.q&&!was.q)
      cands.push({k:'reqnew',to:ntfNot((t.origin==='manager')?[t.target]:ntfAssigners(),
                                       [t.requestedBy]),who:t.requestedBy||null});

    /* The collapse. Somebody covered by an earlier candidate is taken off
       every later one, so each person ends up in at most one. Done BEFORE
       anybody's switches are consulted, deliberately: muting "part-finished"
       should make that job silent, not quietly demote it to "finished". */
    var taken={}, mineEv=null;
    cands.forEach(function(c){
      var to=ntfWho2(c.to).filter(function(x){ return !taken[x]; });
      if(!to.length) return;
      to.forEach(function(x){ taken[x]=1; });
      var ev=ntfEmit(c.k,to,{task:t,who:c.who});
      if(!mineEv&&ntfForMe(ev,me)) mineEv=ev;
    });
    if(mineEv){ ntfPush(mineEv.k,t,mineEv.who,now); made++; }
  });
  /* Replacing the whole thing rather than merging is what keeps `seen` from
     growing forever: a task that has been deleted is simply not in `fresh`. */
  var changed=first||made>0||ntfSeenDiff(NTF.seen,fresh);
  NTF.seen=fresh;
  if(first) NTF.base=now;
  return {made:made,changed:changed};
}

/* Scan, then show it: the one call every hook uses, so a new alert reaching
   the bell and a new alert reaching the SCREEN somebody is looking at can
   never come apart. The hooks are the places where the things this feed
   watches actually change -- a task arriving (tsyncRepaint in the page), a
   machine, a product or a study arriving (the three drawers in app-02), and
   the half-hourly timer, which is there because closed ground changes with the
   DATE and not because anybody tapped anything. */
function ntfTick(){
  var made=0;
  try{ made=ntfScan(); }catch(e){}
  /* What this look noticed goes to the sender as well as to my own bell --
     ALL of it, not only the part addressed to me, because the people who need
     buzzing are exactly the ones whose phones are shut and noticed nothing.
     Queued rather than sent, so a dead spot at the far end of the farm delays
     it rather than losing it. */
  try{ if(NTF_EVENTS.length) pushQueue(NTF_EVENTS,Date.now()); }catch(e){}
  try{ pushFlush(); }catch(e){}
  try{ if(made&&typeof updateBellBadges==='function') updateBellBadges(); }catch(e){}
  try{
    var n=document.getElementById('s-notifications');
    if(n&&n.classList.contains('active')){ renderNotifFeed(); ntfMarkRead(); }
  }catch(e){}
  return made;
}

/* ---- the time clock ----
   The same idea as the walk above, over punches instead of jobs, and with the
   same two rules: notice CHANGE, and take a silent baseline the first time.

   WHO HEARS WHAT. Clocking in and clocking out are for whoever runs the crew,
   and they only ever raise on a phone that is allowed to correct a timesheet
   -- the same tcCanEditPunches() test the database makes. The other two are
   for the student whose shift it is, and raise on their phone alone.

   THE ONE DELIBERATE SILENCE. A shift closed automatically does NOT tell the
   manager. Dillon, 2026-09-24: "just do it silently". The student is told,
   because it is their pay and their chance to say the time is wrong before
   payroll. If that ever needs turning back on it is one branch here plus one
   row in NOTIF_ALERTS -- nothing else. */
function ntfPunchWatch(p,ask){
  return { o:p.out?1:0,
           a:(p.out&&p.auto)?1:0,
           k:ask[String(p.id)]?1:0 };
}
function ntfScanPunches(me,now){
  var all=null;
  try{ all=(typeof tcPunchDocs==='function')?tcPunchDocs():null; }catch(e){}
  if(!all||!all.length) return {made:0,changed:false};
  /* The shifts the app refused to close because it had no honest finish time
     -- exactly the ones whose owner has to be asked. tcOpenPunches() is the
     time clock's own answer, borrowed rather than worked out a second time
     here, so the alert and the thing that closes shifts can never disagree. */
  var ask={};
  try{
    if(typeof tcOpenPunches==='function')
      tcOpenPunches().forEach(function(r){ if(!r.end&&r.punch&&r.punch.id) ask[String(r.punch.id)]=1; });
  }catch(e){}
  /* Clocking in and out is news for whoever runs the crew -- the same people
     tcCanEditPunches() lets correct a timesheet, asked of the roster rather
     than of this one phone, because this walk now decides for everybody. */
  var crew=ntfAssigners();

  var first=!NTF.pbase, fresh={}, made=0;
  all.forEach(function(p){
    if(!p||!p.id) return;
    var id=String(p.id), is=ntfPunchWatch(p,ask), prev=NTF.pseen[id];
    fresh[id]=is;
    var ev=null, baselineExempt=false;

    /* THE ONE ALERT THE BASELINE DOES NOT SWALLOW. "You never clocked out and
       the app has no scheduled finish to use" is a standing CONDITION, not a
       moment: it is just as true on a phone that has only just started
       watching. Baselining it the way everything else is baselined meant a
       student who got a new phone, or cleared their browser, was never asked
       again about a shift still sitting open -- and this is the only clock
       alert with something for them to actually do about it.

       Safe to raise on a first look precisely because it only ever goes to the
       one person whose shift it is, of which there are a handful, never the
       farm's whole history. */
    if(is.k&&!(prev&&prev.k)){
      ev=ntfEmit('shiftask',[p.pid],{punch:p}); baselineExempt=true;
    }
    else if(first){ /* the baseline walk tells nobody anything else */ }
    else if(prev===undefined){
      /* Brand new to this phone. A punch that arrives already CLOSED is
         history, not news -- otherwise a phone catching up on a season of
         timesheets would announce every shift the farm has ever worked. */
      if(!is.o) ev=ntfEmit('clockin',ntfNot(crew,[p.pid]),{punch:p});
    }
    else if(!prev.o&&is.o){
      /* THE ONE DELIBERATE SILENCE. A shift closed automatically does NOT tell
         the manager. Dillon, 2026-09-24: "just do it silently". The student is
         told, because it is their pay and their chance to say the time is
         wrong before payroll. */
      if(is.a) ev=ntfEmit('shiftauto',[p.pid],{punch:p});
      else ev=ntfEmit('clockout',ntfNot(crew,[p.pid]),{punch:p});
    }

    if(ev&&(baselineExempt||!first)&&ntfForMe(ev,me)){ ntfPushPunch(ev.k,p,now); made++; }
  });
  var changed=first||made>0||ntfSeenDiff(NTF.pseen,fresh);
  NTF.pseen=fresh;
  if(first) NTF.pbase=now;
  return {made:made,changed:changed};
}
/* Same shape of record as a job's event, with the punch's own facts copied in
   so a row still reads as a sentence after the punch has been corrected or
   removed. `at` is the time the row is about; `hrs` only means anything on a
   clock-out. */
function ntfPushPunch(kind,p,now){ NTF.list.unshift(ntfRecPunch(kind,p,now)); }
function ntfRecPunch(kind,p,now){
  var d=null; try{ d=String(p.date||''); }catch(e){ d=''; }
  return { id:ntfNewId(now),
    k:kind, punch:String(p.id), t:now,
    who:String(p.pid||''), d:d,
    at:String((kind==='clockin'||kind==='shiftask')?(p.in||''):(p.out||'')),
    inAt:String(p.in||''),
    off:(p.locOk===false)?1:0,
    hrs:ntfHrs(p.in,p.out) };
}
function ntfHrs(a,b){
  if(!a||!b) return 0;
  function m(t){ var x=String(t).split(':'); return (+x[0])*60+(+x[1]); }
  return Math.round(Math.max(0,m(b)-m(a))/6)/10;
}

/* ===== THE FARM'S OWN THINGS: MACHINES, THE SHELF, AND CLOSED GROUND =====
   Three more walks, wired up 2026-10-01. The switches for these existed from
   the day the Notifications screen was written and did nothing at all, which
   is why they carried the words "Not sending yet" until today.

   They are the same shape as the two walks above: notice what CHANGED, take a
   silent baseline the first time this phone looks, and tell only the people
   who can do something about it.

   WHO HEARS WHAT -- Dillon's calls, 2026-10-01, and they are not guesses:

     a machine goes down, or comes back      EVERYBODY. Anybody might walk out
       to that mower, and the crew are the people most likely to. This is the
       one of the four that deliberately reaches an undergraduate.
     an issue is reported on a machine       Bill, the technicians and faculty
       -- whoever would fix it. "It still runs but something is wrong" is not
       an interruption for somebody who cannot act on it.
     a product reaches its reorder point     Bill and faculty. They are the
       people who order. (Worth knowing: the Inventory page is still behind
       the Coming Soon cover for faculty, so they hear it but cannot yet go
       and look. Releasing that page is Dillon's call, not this file's.)
     ground closes, or opens again           EVERYBODY, named by PLOT and never
       by study. That is the same rule the farm map already follows: closed
       ground is drawn for every phone, but another lab's study name is held
       back. An undergraduate on a mower has to know CAFS14 is shut whoever
       owns it. See trLiveRes() and trResStudyName() in the page.

   WHY THESE LEDGERS ARE SHORTER THAN THE JOB ONE. The job walk keeps an entry
   per task because it asks five questions about each one. These three only ask
   "is this true right now", so they keep only the ids for which it IS -- the
   machines that are down, the products that are low, the restrictions standing.
   An id APPEARING is one alert and an id DISAPPEARING is the other. On a normal
   day all three maps are empty or nearly so.

   AND THE ONE TRAP IN THAT. A record that is gone altogether must say nothing.
   Each walk therefore only ever decides about records it can still SEE: it
   loops over the farm's list, so a machine or a study that has been removed is
   simply never examined, and its stale entry drops out of the map on the way
   past. Deleting a study does open its ground, but "CAFS14 is open again" from
   a record nobody can look at any more is a sentence with no answer behind it.

   ALL THREE ARE SAFE TO CALL FROM A SNAPSHOT HANDLER, for the same reason the
   two above are: they read lists this phone already holds and write to this
   phone only. storeSaveLocal()'s side of the line, never storeTouch()'s. See
   CLAUDE.md, the two traps.                                               */

/* Is the signed-in person one of these roles, read off the ROSTER -- never
   currentRole, which is only about which screen is showing and which the
   database cannot see. Same shape as eqRoleIs() in app-02, reached through a
   typeof guard because this file runs before that one is loaded. */
function ntfRoleIs(roles){
  /* The App Manager has no restrictions, so he hears what Bill hears. Being
     left off an alert is not strictly a refusal, but the person who can do
     everything Bill can do should be told the same things. */
  try{ if(appAdminAll()) return true; }catch(e){}
  var me=null;
  try{ me=(typeof SESSION!=='undefined'&&SESSION)?SESSION.pid:null; }catch(e){}
  if(!me) return false;
  try{
    if(typeof personActive==='function'&&!personActive(me)) return false;
    if(typeof personRole!=='function') return false;
    return roles.indexOf(personRole(me))>=0;
  }catch(e){ return false; }
}
/* Did this walk's map come out different from last time. ntfSeenDiff() above
   compares the three fields a JOB entry has and is left alone on purpose;
   these entries are single values, and a diff that quietly ignored them would
   simply stop saving them. It only decides whether to write to the phone --
   never whether to raise an alert. */
function ntfFlagDiff(a,b){
  a=a||{}; b=b||{};
  var ka=Object.keys(a), kb=Object.keys(b);
  if(ka.length!==kb.length) return true;
  for(var i=0;i<kb.length;i++) if(a[kb[i]]!==b[kb[i]]) return true;
  return false;
}
/* A short number for a row: 2.5, 12, 0 -- never 2.4999999999. fmt() in app-04
   does the same job for the Inventory screens and is not reached from here, so
   the bell has its own two lines rather than a cross-file call it would have
   to guard anyway. */
function ntfQty(n){ n=+n; if(!isFinite(n)) n=0; return String(Math.round(n*100)/100); }
/* The newest open problem report on a machine, which is where the name and the
   description of what is wrong actually live. EQPROBLEMS travels with the
   equipment drawer, so this reads the same on every phone. */
function ntfEqProblem(id){
  var all=null; try{ all=EQPROBLEMS; }catch(e){}
  if(!all) return null;
  for(var i=0;i<all.length;i++){
    var q=all[i];
    if(q&&String(q.eq)===String(id)&&q.status!=='closed') return q;
  }
  return null;
}
/* Long enough to be useful on a two-line row, short enough not to push the
   time off the end of it. */
function ntfClip(txt,n){
  txt=String(txt||'').replace(/\s+/g,' ').trim();
  return (txt.length>n)?(txt.slice(0,n-1)+'…'):txt;
}

/* ---- machines ---- */
function ntfScanEquip(me,now){
  var all=null; try{ all=EQUIP; }catch(e){}
  if(!all||!all.length) return {made:0,changed:false};
  /* Everybody hears a machine go down, because anybody might walk out to it.
     An issue report goes only to whoever would fix it -- the same roles the
     Edit machine form itself asks for. */
  var farm=ntfEveryone(), fixers=ntfRoles(['Farm Manager','Technician','Faculty']);
  var first=!NTF.ebase, fresh={}, made=0;
  all.forEach(function(m){
    if(!m||!m.id) return;
    var id=String(m.id);
    /* Down wins over flagged: a machine that is out of service is out of
       service, and saying both about one mower reads as a bug. */
    var st=(m.status==='down')?'down':(m.flagged?'flag':'');
    if(st) fresh[id]=st;
    if(first) return;                            /* the baseline walk tells nobody anything */
    var was=NTF.eseen[id]||'', ev=null, q=null;
    if(st==='down'&&was!=='down'){
      q=ntfEqProblem(id);
      ev=ntfEmit('eqdown',farm,{eq:m,who:(q&&(q.downBy||q.by))||null,note:q?q.desc:'',
                                prob:(q&&q.id)||''});
    }
    /* It was out of service and it is not any more. Covers both ways back:
       Bill setting it available, and the repair being signed off. */
    else if(was==='down'&&st!=='down'){
      ev=ntfEmit('equp',farm,{eq:m,who:null,note:''});
    }
    /* Reported, but still running. Only from nothing -- a machine that goes
       from flagged to down has already said the louder of the two things, and
       a flag CLEARING says nothing at all, because nobody wants "the issue on
       the 3235C has gone away" when what happened is somebody tidied up. */
    else if(st==='flag'&&was===''){
      q=ntfEqProblem(id);
      ev=ntfEmit('eqflag',fixers,{eq:m,who:(q&&q.by)||null,note:q?q.desc:'',
                                  prob:(q&&q.id)||''});
    }
    if(ntfForMe(ev,me)){ ntfPushEq(ev.k,m,now,ev.who,ev.note); made++; }
  });
  var changed=first||made>0||ntfFlagDiff(NTF.eseen,fresh);
  NTF.eseen=fresh;
  if(first) NTF.ebase=now;
  return {made:made,changed:changed};
}

/* ---- the shelf ---- */
function ntfScanInv(me,now){
  var all=null; try{ all=INVENTORY; }catch(e){}
  if(!all||!all.length) return {made:0,changed:false};
  /* Bill and faculty, because they are the people who order. Deliberately NOT
     technicians -- Dillon, 2026-10-01 -- which is the line most likely to be
     "tidied" into matching the equipment one above. */
  var buyers=ntfRoles(['Farm Manager','Faculty']);
  var first=!NTF.ibase, fresh={}, made=0;
  all.forEach(function(it){
    if(!it||!it.id) return;
    var low=false;
    /* isLow() is the Inventory screen's own answer -- at or below the reorder
       point -- borrowed rather than worked out a second time here, so the bell
       and the Low chip can never disagree about which products are low. */
    try{ low=(typeof isLow==='function')&&isLow(it); }catch(e){}
    if(!low) return;
    var id=String(it.id);
    fresh[id]=1;
    if(first) return;
    /* Only the moment it DROPS to the reorder point. A product sitting low for
       a fortnight says it once, which is what the map keeps it for; coming
       back up says nothing, because a delivery is not news to the person who
       booked it in. */
    if(!NTF.iseen[id]){
      var ev=ntfEmit('low',buyers,{item:it});
      if(ntfForMe(ev,me)){ ntfPushLow(it,now); made++; }
    }
  });
  var changed=first||made>0||ntfFlagDiff(NTF.iseen,fresh);
  NTF.iseen=fresh;
  if(first) NTF.ibase=now;
  return {made:made,changed:changed};
}

/* ---- closed ground ----
   The one of the three whose answer changes WITH THE DATE rather than because
   somebody tapped something: a restriction standing from the 6th starts
   closing ground at midnight on the 6th with no record changing at all. So
   this walk also hangs off the half-hourly timer that moves studies along in
   the page, not only off a record arriving. */
function ntfScanRes(me,now){
  var all=null; try{ all=TRIALS; }catch(e){}
  if(!all||!all.length) return {made:0,changed:false};
  /* Everybody, named by PLOT and never by study. An undergraduate on a mower
     has to know CAFS14 is shut whoever owns it; whose trial it is, is not the
     farm's business. Same rule the map already follows -- see trLiveRes(). */
  var farm=ntfEveryone();
  var first=!NTF.rbase, fresh={}, made=0;
  all.forEach(function(t){
    if(!t) return;
    var list=t.restrictions||[];
    list.forEach(function(r,i){
      if(!r) return;
      /* A restriction saved before ids were stamped on them falls back to its
         place in the study's list, which is stable enough for a ledger that
         only has to recognise the same restriction on the next walk. */
      var key=String(t.id)+'/'+String(r.id||('#'+i));
      var live=false;
      try{ live=(typeof trResState==='function')&&trResState(r)==='active'; }catch(e){}
      if(live) fresh[key]=1;
      if(first) return;
      var was=!!NTF.rseen[key], ev=null;
      /* The person who PLACED it is told as well, unlike a job you gave
         yourself. Two reasons, and the second is the real one: seeing the row
         appear is how they know it took, and the record only carries the
         placer's NAME (r.by), not their id -- so leaving them out would mean
         matching on a name, and the price of getting that wrong is somebody
         not being told that ground is closed. That is the one thing this alert
         must never do. */
      if(live&&!was) ev=ntfEmit('resclose',farm,{study:t,res:r,key:key});
      else if(was&&!live) ev=ntfEmit('resopen',farm,{study:t,res:r,key:key});
      if(ntfForMe(ev,me)){ ntfPushRes(ev.k,t,r,now); made++; }
    });
  });
  var changed=first||made>0||ntfFlagDiff(NTF.rseen,fresh);
  NTF.rseen=fresh;
  if(first) NTF.rbase=now;
  return {made:made,changed:changed};
}

/* The three push functions, one per source, each copying in the facts its own
   row needs -- the same reason ntfPush() copies a job's title: the machine may
   be retired, the product renamed and the study finished by the time somebody
   scrolls back, and a row has to still read as a sentence. */
function ntfPushEq(kind,m,now,who,note){ NTF.list.unshift(ntfRecEq(kind,m,now,who,note)); }
function ntfRecEq(kind,m,now,who,note){
  return { id:ntfNewId(now), k:kind, t:now, eq:String(m.id),
    ttl:String(m.name||'A machine'), area:String(m.location||''),
    who:who||null, note:ntfClip(note,64) };
}
function ntfPushLow(it,now){ NTF.list.unshift(ntfRecLow(it,now)); }
function ntfRecLow(it,now){
  var q=0; try{ q=(typeof invQty==='function')?invQty(it):(+it.qty||0); }catch(e){}
  return { id:ntfNewId(now), k:'low', t:now,
    item:String(it.id), ttl:String(it.name||'A product'),
    q:q, thr:(+it.thr||0), u:String(it.unit||'') };
}
function ntfPushRes(kind,t,r,now){ NTF.list.unshift(ntfRecRes(kind,t,r,now)); }
function ntfRecRes(kind,t,r,now){
  var ty='Restricted', endTxt='';
  try{ if(typeof trRType==='function') ty=trRType(r.type).label||ty; }catch(e){}
  try{ if(typeof trResEndText==='function') endTxt=trResEndText(r); }catch(e){}
  return { id:ntfNewId(now), k:kind, t:now,
    /* The plot, and deliberately NOT the study's name or its lab -- see the
       note at the top of this section. */
    plot:String(r.scope||''), ttl:String(ty),
    endTxt:String(endTxt), why:(r.lifted?'lifted':'ended') };
}
/* One id generator, so the three above and the two older pushes cannot drift
   into making ids of different shapes. */
function ntfNewId(now){ return 'n'+now.toString(36)+Math.random().toString(36).slice(2,7); }

function ntfSeenDiff(a,b){
  var ka=Object.keys(a),kb=Object.keys(b);
  if(ka.length!==kb.length) return true;
  for(var i=0;i<kb.length;i++){
    var x=a[kb[i]],y=b[kb[i]];
    if(!x||x.a!==y.a||x.s!==y.s||x.p!==y.p) return true;
  }
  return false;
}
/* The event as it is kept. The title, the area and the count are copied in
   rather than looked up later, so a job that is deleted next week still reads
   as a sentence instead of a blank row. `who` is the OTHER person in the
   sentence and differs by kind, so the caller says who rather than this
   working it out twice.

     n  the number that belongs in the sentence: plots still to hand out on a
        part-finished job, people asked for on a new labor request
     o  which way a labor request was going, so the row can say "is asking
        you to take this on" or "is asking for help" -- the record's own
        `origin` is unreliable to read later because the request has by then
        become an ordinary task                                            */
function ntfPush(kind,t,who,now){ NTF.list.unshift(ntfRecTask(kind,t,who,now)); }
function ntfRecTask(kind,t,who,now){
  return { id:ntfNewId(now),
    k:kind, task:String(t.id), t:now,
    ttl:String(t.title||'A job'),
    who:who||null,
    area:String(t.area||''),
    o:(t.origin||''),
    n:(kind==='partial'?(t.leftPlots||[]).length
      :kind==='reqnew'?(+t.students||0):0) };
}
function ntfTrim(){
  var cut=Date.now()-NTF_KEEP_DAYS*86400000;
  NTF.list=NTF.list.filter(function(e){ return e&&e.t>cut; }).slice(0,NTF_MAX);
}
function ntfUnread(){
  var r=NTF.readAt||0, n=0;
  for(var i=0;i<NTF.list.length;i++) if(NTF.list[i].t>r) n++;
  return n;
}
function ntfMarkRead(){ NTF.readAt=Date.now(); ntfSave(); }

/* ===================== MAKING THE PHONE BUZZ =====================
   Added 2026-10-02. Everything above works out alerts and shows them on the
   bell; this is the half that reaches a phone with the app SHUT.

   HOW IT HANGS TOGETHER, because no one file contains all of it:

     this file          notices what changed and WHO should hear it, and asks
                        the sender to tell them (ntfEmit / pushSend below)
     worker/            the sender. Outside the farm, on Cloudflare's free
     ut-turf-push.js    plan, no card on anybody's account. It checks the
                        caller is really signed in to this farm, refuses to
                        send the same thing twice, and skips anybody whose own
                        switches say no.
     sw.js              receives the message on the phone and shows it. Written
                        by tools/build-sw.js -- never edited by hand.
     docs/SET-UP-        the twenty minutes somebody does once, by hand, to
     NOTIFICATIONS.md   make the sender exist at all.

   THE ONE THING THAT IS NOT OBVIOUS. A phone only notices events while it is
   awake, so the phone that reports a thing is almost never the phone that
   needs telling about it. That is the whole reason the walks above work out an
   audience rather than just "is this mine": my phone, awake in my hand, is what
   tells the sender to buzz somebody else's phone, asleep in their pocket. Every
   awake phone reports the same event and the sender keeps only the first.

   AND THE ONE THING THAT WOULD BE EASY TO BREAK. The switches a person sets
   are checked by the SENDER, not here and not on the receiving phone. That is
   not where you would put it, and the reason is a browser quirk: a phone that
   receives a message and then decides to show nothing gets Chrome's own "this
   site was updated in the background" notice instead. So a muted alert must
   never be sent at all, which means the sender has to know -- and it is told,
   by each phone uploading its own owner's switches. It looks up a yes or no it
   was handed; it never decides anything.                                    */

/* WHERE THE SENDER LIVES. Changing this is a change to the app, the same as
   the Firebase settings in the page are -- it is plumbing, not a farm figure,
   and the address only ever changes if the whole thing is rebuilt. When that
   happens: docs/SET-UP-NOTIFICATIONS.md is the sheet, and this is the line. */
var PUSH_URL='https://ut-turf-push.turffarmutk.workers.dev';

var PUSH_KEY_KEY='ut_push_key';          /* the sender's public key, once fetched */
var PUSH_OUT_KEY='ut_push_out';          /* things noticed but not yet handed over */
var PUSH_OUT_MAX=60;
var PUSH_TRIES_MAX=5;                    /* before a message is given up on */
var PUSH={on:false,endpoint:'',busy:false,sending:false,err:''};

/* ---- can this phone do it at all ---- */
function pushSupported(){
  try{ return !!(navigator.serviceWorker&&window.PushManager&&window.Notification); }
  catch(e){ return false; }
}
/* An iPhone refuses notifications to a web app outright until it has been
   added to the home screen -- Apple's rule, not ours, and there is no way
   around it in code. Worth detecting precisely, because the honest answer
   ("add it to your home screen first") is useful and "your phone cannot do
   this" is not. An iPad reports itself as a Mac, hence the touch test. */
function pushIsApple(){
  try{
    var ua=navigator.userAgent||'';
    /* Asked first, and it is not belt and braces. An iPad reports itself as a
       Mac, so the only way to tell one from a laptop is that it has a
       touchscreen -- and that same test says yes to an Android phone being
       emulated on a Mac, which is exactly how this app gets tested. Without
       this line the Notifications screen tells a tester to add the app to
       their iPhone home screen while they are looking at an Android. */
    if(/android/i.test(ua)) return false;
    return /iphone|ipad|ipod/i.test(ua)
        || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  }catch(e){ return false; }
}
function pushInstalled(){
  try{
    return !!(window.navigator.standalone
      ||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches));
  }catch(e){ return false; }
}
/* One word for what this phone's situation is, so the screen and the tests
   both ask the same question. */
function pushState(){
  if(!PUSH_URL) return 'nosender';
  if(pushIsApple()&&!pushInstalled()) return 'needs-install';
  if(!pushSupported()) return 'unsupported';
  var perm=''; try{ perm=Notification.permission; }catch(e){}
  if(perm==='denied') return 'blocked';
  return PUSH.on?'on':'off';
}

/* ---- talking to the sender ---- */
/* Proof that whoever is calling is really signed in to this farm. The sender
   checks it against Google's own public keys, which is what stops a stranger
   who finds the address buzzing twenty-three phones at three in the morning. */
function pushToken(){
  try{
    var a=(typeof fbAuth==='function')?fbAuth():null;
    if(a&&a.currentUser&&a.currentUser.getIdToken) return a.currentUser.getIdToken();
  }catch(e){}
  return Promise.reject(new Error('not signed in'));
}
function pushFetch(path,body){
  return pushToken().then(function(tok){
    return fetch(PUSH_URL+path,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body:JSON.stringify(body||{})
    });
  }).then(function(r){
    if(!r.ok){
      /* The number comes along, because what to do next depends on it: a
         refusal is permanent and a dead spot is not. */
      var err=new Error('sender said '+r.status); err.status=r.status; throw err;
    }
    return r.json();
  });
}
/* Fetched rather than written into the app, so the farm's sending key can be
   replaced without pushing a new app to twenty-three phones. */
function pushServerKey(){
  var c=null; try{ c=localStorage.getItem(PUSH_KEY_KEY); }catch(e){}
  if(c) return Promise.resolve(c);
  return fetch(PUSH_URL+'/key').then(function(r){ return r.json(); }).then(function(j){
    if(!j||!j.key) throw new Error('the sender has no key set up');
    try{ localStorage.setItem(PUSH_KEY_KEY,j.key); }catch(e){}
    return j.key;
  });
}
function pushB64ToBytes(b64){
  var s=String(b64).replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4) s+='=';
  var bin=atob(s), out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}

/* This person's own switches, as the sender needs them: a plain list of what
   they left on, their delivery hours, and where in the world they are -- the
   sender runs in UTC and "nine at night" is a local idea. Nothing about WHO
   hears WHAT is in here; that is worked out on the phone that notices. */
function pushPrefs(){
  var alerts={};
  try{
    NOTIF_ALERTS.forEach(function(a){ alerts['a_'+a.k]=(NOTIF['a_'+a.k]!==false); });
  }catch(e){}
  var tz='UTC';
  try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(e){}
  return { alerts:alerts, quiet:!!NOTIF.quiet, start:String(NOTIF.start||''),
           end:String(NOTIF.end||''), tz:tz };
}

/* ---- turning it on and off for THIS phone ---- */
function pushRefresh(){
  if(!pushSupported()) return Promise.resolve(null);
  return navigator.serviceWorker.ready
    .then(function(reg){ return reg.pushManager.getSubscription(); })
    .then(function(sub){
      PUSH.on=!!sub; PUSH.endpoint=sub?sub.endpoint:'';
      return sub;
    })
    .catch(function(){ PUSH.on=false; PUSH.endpoint=''; return null; });
}
function pushAsk(){
  if(PUSH.busy) return Promise.resolve(false);
  PUSH.busy=true; PUSH.err='';
  return Notification.requestPermission().then(function(perm){
    if(perm!=='granted') throw new Error(perm==='denied'
      ? 'Your phone is set to block notifications from this app.'
      : 'Notifications were not turned on.');
    return Promise.all([navigator.serviceWorker.ready,pushServerKey()]);
  }).then(function(both){
    return both[0].pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:pushB64ToBytes(both[1])
    });
  }).then(function(sub){
    var j=sub.toJSON();
    return pushFetch('/subscribe',{ pid:SESSION.pid, prefs:pushPrefs(),
      sub:{endpoint:j.endpoint,keys:j.keys} }).then(function(){ return sub; });
  }).then(function(sub){
    PUSH.on=true; PUSH.endpoint=sub.endpoint;
    return true;
  }).catch(function(e){
    PUSH.err=(e&&e.message)||'Could not turn notifications on.';
    return false;
  }).then(function(r){ PUSH.busy=false; return r; });
}
function pushStop(){
  if(PUSH.busy) return Promise.resolve(false);
  PUSH.busy=true; PUSH.err='';
  var ep=PUSH.endpoint;
  return pushRefresh().then(function(sub){
    if(!sub) return null;
    ep=sub.endpoint;
    return sub.unsubscribe();
  }).then(function(){
    /* Told to forget it as well as unsubscribing: an address nobody clears up
       sits in the sender's list forever, and every message to that person then
       costs a pointless round trip to a push service that will refuse it. */
    return ep?pushFetch('/forget',{endpoint:ep}):null;
  }).then(function(){
    PUSH.on=false; PUSH.endpoint='';
    return true;
  }).catch(function(e){
    PUSH.err=(e&&e.message)||'Could not turn notifications off.';
    return false;
  }).then(function(r){ PUSH.busy=false; return r; });
}
/* A switch moved. The sender keeps its own copy of these because it is the one
   that has to decide not to send; this is what keeps that copy honest. Failing
   quietly is right: the switch has already been saved on the phone, and the
   bell obeys it either way. */
function pushPrefsChanged(){
  if(!PUSH.on||!PUSH.endpoint) return Promise.resolve(false);
  return pushFetch('/prefs',{pid:SESSION.pid,endpoint:PUSH.endpoint,prefs:pushPrefs()})
    .then(function(){ return true; }).catch(function(){ return false; });
}

/* ---- handing the sender what the walks noticed ---- */
/* The same name on every phone that notices the same thing, so the sender can
   keep the first and ignore the rest. Built out of the records themselves --
   never out of the time, which every phone would answer differently. */
function ntfEventId(ev){
  try{
    if(ev.task){
      var extra=(ev.k==='assigned'||ev.k==='reqok')?String(ev.task.assignee||''):'';
      return ev.k+':'+ev.task.id+(extra?(':'+extra):'');
    }
    if(ev.punch) return ev.k+':'+ev.punch.id;
    /* The problem report is in here so a mower that breaks twice in a day is
       two pieces of news rather than one. */
    if(ev.eq) return ev.k+':'+ev.eq.id+(ev.prob?(':'+ev.prob):'');
    if(ev.item) return 'low:'+ev.item.id;
    if(ev.key) return ev.k+':'+ev.key;
  }catch(e){}
  return '';
}
/* ntfLine() writes for a web page, so it escapes the handful of characters
   that mean something in one. A notification is plain text and shows them
   back raw, so "Smith & Sons" arrives as "Smith &amp; Sons" unless this
   undoes it. Same sentence, one costume off. */
function ntfPlain(txt){
  return String(txt==null?'':txt)
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'").replace(/&middot;/g,'·').replace(/&amp;/g,'&');
}
/* The sentence the buzz carries is the sentence the bell shows, because it is
   built by the same function from the same record. They cannot drift. */
function ntfEventText(ev,now){
  var rec=null;
  try{
    if(ev.task) rec=ntfRecTask(ev.k,ev.task,ev.who,now);
    else if(ev.punch) rec=ntfRecPunch(ev.k,ev.punch,now);
    else if(ev.eq) rec=ntfRecEq(ev.k,ev.eq,now,ev.who,ev.note);
    else if(ev.item) rec=ntfRecLow(ev.item,now);
    else if(ev.res) rec=ntfRecRes(ev.k,ev.study,ev.res,now);
  }catch(e){ rec=null; }
  if(!rec) return null;
  var l=null; try{ l=ntfLine(rec); }catch(e){ return null; }
  if(!l) return null;
  return { title:ntfPlain(l.t), body:ntfPlain(l.s) };
}

function pushOutRead(){
  try{ var r=JSON.parse(localStorage.getItem(PUSH_OUT_KEY)||'[]'); return Array.isArray(r)?r:[]; }
  catch(e){ return []; }
}
function pushOutWrite(list){
  try{ localStorage.setItem(PUSH_OUT_KEY,JSON.stringify(list.slice(0,PUSH_OUT_MAX))); }catch(e){}
}
/* Queued rather than sent on the spot, because the phone that notices may be
   the one standing in a dead spot at the far end of the farm. It goes up on
   the next tick that has signal. Nothing here ever blocks a screen. */
function pushQueue(events,now){
  if(!PUSH_URL||!events||!events.length) return 0;
  var out=pushOutRead(), added=0;
  events.forEach(function(ev){
    var id=ntfEventId(ev); if(!id) return;
    var text=ntfEventText(ev,now); if(!text) return;
    if(out.some(function(x){ return x.id===id; })) return;
    out.unshift({ id:id, to:ev.to, kind:ev.k, sw:ntfSwitchOf(ev.k),
                  title:text.title, body:text.body, at:now });
    added++;
  });
  if(added) pushOutWrite(out);
  return added;
}
/* Hand over whatever is queued, oldest first.

   THE THING THIS HAS TO GET RIGHT is a message that can never be sent. A
   refused message left at the front of the queue is retried for ever, and
   every alert behind it waits -- so ONE bad message would silence the whole
   farm, with nothing on any screen to say why. That is the shape of the
   stuck-record problem sdbMaySend() exists for on the database side.

   So a failure is read rather than just repeated. A refusal that names a
   problem with the message itself is permanent and the message is dropped; a
   dead spot, an expired sign-in or being told to slow down are all temporary
   and it stays. Anything that merely keeps failing is given up on after a few
   goes, because the alternative is a queue that never empties again. */
function pushFlush(){
  if(PUSH.sending||!PUSH_URL) return Promise.resolve(0);
  var out=pushOutRead();
  if(!out.length) return Promise.resolve(0);
  /* No point offering anything if this phone cannot prove who it is -- which
     is the normal state of a copy of the app being tested on a laptop. */
  var live=false;
  try{ live=(typeof dbConfigured!=='function')||dbConfigured(); }catch(e){ live=false; }
  if(!live) return Promise.resolve(0);

  PUSH.sending=true;
  var done=0;
  function step(){
    var list=pushOutRead();
    if(!list.length) return Promise.resolve();
    var m=list[list.length-1];                   /* oldest first */
    return pushFetch('/tell',{ id:m.id, to:m.to, kind:m.kind, sw:m.sw,
                               title:m.title, body:m.body })
      .then(function(){
        var now=pushOutRead().filter(function(x){ return x.id!==m.id; });
        pushOutWrite(now); done++;
        return step();
      });
  }
  return step().catch(function(e){
    PUSH.err=(e&&e.message)||'';
    var st=(e&&e.status)||0;
    var list=pushOutRead();
    var m=list[list.length-1];
    if(m){
      m.tries=(+m.tries||0)+1;
      /* 401 is "this phone is not signed in yet", 429 is "slow down", and no
         number at all is no signal. All three are worth another go. */
      var hopeless=(st>=400&&st<500&&st!==401&&st!==429);
      if(hopeless||m.tries>=PUSH_TRIES_MAX) list.pop();
      pushOutWrite(list);
    }
  }).then(function(){ PUSH.sending=false; return done; });
}

/* ---- the screen ---- */
/* Short enough to sit on the right of a row without wrapping. */
function ntfAgo(ms){
  var d=Date.now()-ms;
  if(d<60000) return 'now';
  if(d<3600000) return Math.floor(d/60000)+'m';
  if(d<86400000) return Math.floor(d/3600000)+'h';
  if(d<604800000) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ms).getDay()];
  var dt=new Date(ms);
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]+' '+dt.getDate();
}
/* Every one of these is a key in CB_MAP, and they map to six DIFFERENT
   color-blind-safe colors with six different dot shapes. Pick a color that is
   not in that table and the row still draws, but in color-blind mode it falls
   through to the generic shift and loses its SHAPE, which is the half of the
   signal that does not depend on seeing color at all. See CB_MAP and CB_SHAPE
   further down this file. */
var NTF_KIND={
  assigned:{c:'#489FDF'},   /* ring     - informational */
  done:    {c:'#2f9e4f'},   /* circle   - complete */
  partial: {c:'#d17a00'},   /* diamond  - needs attention */
  reqnew:  {c:'#7c5cbf'},   /* triangle - somebody is asking */
  reqok:   {c:'#2456b8'},   /* ring     - informational */
  reqdone: {c:'#2f9e4f'},   /* circle   - complete, same as done on purpose */
  clockin: {c:'#2f7d3a'},   /* circle   - somebody is on the farm */
  clockout:{c:'#517c96'},   /* ring     - informational, the day is done */
  shiftauto:{c:'#9a5b00'},  /* diamond  - check this, it is your pay */
  shiftask:{c:'#c0392b'},   /* square   - urgent, only you can answer it */
  /* The farm's own three, added 2026-10-01. Every one of these REUSES a color
     already above rather than introducing a new one, and that is the safe
     choice on purpose: a color that is not in CB_MAP keeps its row but loses
     its SHAPE in color-blind mode, which is the half of the signal that does
     not depend on seeing color at all. Reusing means the meaning carries over
     too -- red square is "deal with this", green circle is "that is done". */
  eqdown:  {c:'#c0392b'},   /* square   - urgent, do not walk out to it */
  equp:    {c:'#2f9e4f'},   /* circle   - complete, same as done on purpose */
  eqflag:  {c:'#d17a00'},   /* diamond  - needs attention, still running */
  low:     {c:'#9a5b00'},   /* diamond  - check this, order something */
  resclose:{c:'#7c5cbf'},   /* triangle - ground is shut, stay off it */
  resopen: {c:'#2f9e4f'}    /* circle   - complete, the ground is yours again */
};
/* 24-hour "07:02" as the farm reads it. The time clock has its own t12()
   inside its closure; this is the same answer where the bell can reach it. */
function ntfT12(t){
  if(!t) return '—';
  var a=String(t).split(':'), h=+a[0], m=a[1]||'00';
  return (h%12||12)+':'+m+(h<12?'am':'pm');
}
/* " · Tuesday" on anything older than today, and nothing at all on today --
   the row already says "now" down the right-hand side. */
function ntfDay(di){
  if(!di) return '';
  var p=String(di).split('-'); if(p.length!==3) return '';
  var d=new Date(+p[0],+p[1]-1,+p[2]), n=new Date();
  if(d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate()) return '';
  return ' · '+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}
function ntfWho(pid){
  var n=null; try{ n=(typeof nameOf==='function')?nameOf(pid):null; }catch(e){}
  return n||'Somebody';
}
function ntfLine(e){
  var esq=(typeof esc==='function')?esc:function(x){return x==null?'':String(x);};
  var where=e.area?' · '+esq(e.area):'';
  if(e.k==='assigned') return { t:esq(e.ttl), s:ntfWho(e.who)+' gave you this job'+where };
  if(e.k==='done')     return { t:esq(e.ttl)+' is done', s:ntfWho(e.who)+' finished it'+where };
  if(e.k==='reqnew'){
    /* Bill asking a technician to take a job on reads differently from a
       technician asking for help, and the row has to say which, because what
       you do next is not the same: one you accept, the other you put somebody
       on. */
    var how=(e.o==='manager')
      ? ntfWho(e.who)+' is asking you to take this on'
      : ntfWho(e.who)+' is asking for help'+(e.n?' · '+e.n+' student'+(e.n===1?'':'s'):'');
    return { t:esq(e.ttl), s:how+where };
  }
  /* The time clock's four. These carry no job title -- the sentence is the
     person, the day and the time -- so they build their own line rather than
     leaning on e.ttl, which is blank for them. */
  if(e.k==='clockin')  return { t:ntfWho(e.who)+' clocked in',
    s:ntfT12(e.at)+(e.off?' · off-site':'')+ntfDay(e.d) };
  if(e.k==='clockout') return { t:ntfWho(e.who)+' clocked out',
    s:ntfT12(e.inAt)+'–'+ntfT12(e.at)+' · '+e.hrs+' h'+ntfDay(e.d) };
  if(e.k==='shiftauto')return { t:'Your shift was closed for you',
    s:'Clocked out at '+ntfT12(e.at)+', your scheduled finish'+ntfDay(e.d)
      +' · tell Bill if that is wrong' };
  if(e.k==='shiftask') return { t:'You did not clock out',
    s:'Clocked in at '+ntfT12(e.inAt)+ntfDay(e.d)+' · tap to say when you left' };
  /* The farm's own three. Like the clock's rows these build their own
     sentence, because the facts in them are a machine, a shelf or a plot
     rather than a job. */
  if(e.k==='eqdown')  return { t:esq(e.ttl)+' is out of service',
    s:(e.who?(ntfWho(e.who)+' marked it down'):'Marked down')
      +(e.note?' \u00b7 '+esq(e.note):'')+where };
  if(e.k==='equp')    return { t:esq(e.ttl)+' is back in service',
    s:'Ready to use again'+where };
  if(e.k==='eqflag')  return { t:'Something is wrong with '+esq(e.ttl),
    s:ntfWho(e.who)+' reported it'+(e.note?' \u00b7 '+esq(e.note):'')
      +' \u00b7 still running'+where };
  if(e.k==='low')     return { t:esq(e.ttl)+' is low',
    s:ntfQty(e.q)+' '+esq(e.u)+' left \u00b7 reorder at '+ntfQty(e.thr)+' '+esq(e.u) };
  /* Named by plot, never by study. The ground is everybody's business; whose
     trial it is, is not. */
  if(e.k==='resclose')return { t:(e.plot?esq(e.plot):'Ground')+' is closed',
    s:esq(e.ttl)+(e.endTxt?(' \u00b7 '+esq(e.endTxt)):'') };
  if(e.k==='resopen') return { t:(e.plot?esq(e.plot):'Ground')+' is open again',
    s:esq(e.ttl)+(e.why==='lifted'?' was lifted':' has ended') };
  if(e.k==='reqok')   return { t:esq(e.ttl)+' was accepted', s:ntfWho(e.who)+' has taken it on'+where };
  if(e.k==='reqdone') return { t:esq(e.ttl)+' is done', s:ntfWho(e.who)+' finished the job you asked for'+where };
  return { t:esq(e.ttl)+' came back part-finished',
           s:ntfWho(e.who)+' did what they could · '+e.n+' plot'+(e.n===1?'':'s')+' left to hand out' };
}
function ntfRow(e,last){
  var l=ntfLine(e), k=NTF_KIND[e.k]||{c:'#58595b'};
  var isNew=e.t>(NTF.readAt||0);
  return '<div class="row tap" data-ntf="'+e.id+'"'+(last?'':'')+'>'
    +'<span class="dot" style="background:'+k.c+'"></span>'
    +'<div style="flex:1;min-width:0">'
      +'<div class="rt">'+l.t+(isNew?' <span style="color:var(--acc);font-size:15px;line-height:0">•</span>':'')+'</div>'
      +'<div class="rs">'+l.s+'</div></div>'
    +'<span class="rs" style="flex:none">'+ntfAgo(e.t)+'</span></div>';
}
function renderNotifFeed(){
  var body=document.getElementById('ntf-body'); if(!body)return;
  ntfTrim();
  if(!NTF.list.length){
    /* Capped rather than left to fill the window: on a laptop the rail hands
       this 1,200px and one sentence stretched across all of it. */
    body.innerHTML='<div style="padding:44px 26px;text-align:center;max-width:380px;margin:0 auto">'
      +'<div style="font:800 15px \'Archivo\';color:var(--ink)">Nothing yet</div>'
      +'<div style="font:600 12px \'Public Sans\';color:var(--muted);margin-top:6px;line-height:1.5">'
      +'You\'ll hear here when a job is given to you, when a job you handed out is finished, '
      +'when a machine goes down, and when ground on the farm closes or opens again.</div></div>';
    return;
  }
  var now=Date.now(), buckets=[['Today',86400000],['This week',604800000],['Previous',Infinity]];
  var used=0, html='';
  buckets.forEach(function(b){
    var rows=NTF.list.filter(function(e){ var age=now-e.t; return age<b[1]&&age>=used; });
    used=(b[1]===Infinity)?used:b[1];
    if(!rows.length) return;
    html+='<div style="font:700 10px \'Public Sans\';color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 18px 6px">'+b[0]+'</div>'
      +'<div class="list">'+rows.map(function(e,i){ return ntfRow(e,i===rows.length-1); }).join('')+'</div>';
  });
  body.innerHTML=html+'<div style="height:16px"></div>';
}
/* Tapping a row takes you to the thing the alert is asking you to DO, which
   is not always the same screen:

     part-finished  -> straight to the sheet that hands the rest on
     somebody is asking YOU to take a job on -> the Requests tab, because the
       Accept button lives there and nowhere else. The task sheet would be
       actively wrong here: for any unaccepted request it offers "Assign to
       undergrad", which is Bill's answer to a request, not a technician's.
     anything else  -> the job itself

   Each one re-checks the situation rather than trusting the alert, because
   somebody may well have dealt with it between the alert and the tap. */
document.getElementById('s-notifications').addEventListener('click',function(e){
  var r=e.target.closest('[data-ntf]'); if(!r)return;
  var ev=null, id=r.getAttribute('data-ntf');
  for(var i=0;i<NTF.list.length;i++) if(NTF.list[i].id===id) ev=NTF.list[i];
  if(!ev) return;
  /* A time-clock row is about a punch, not a job. "You did not clock out" is
     the only one with something to do, and it opens the sheet that asks. The
     other three are news: tapping them does nothing rather than dropping
     somebody on a screen they cannot even reach (the Time Clock page is
     behind the Coming Soon cover for everybody but Bill). */
  if(ev.punch){
    if(ev.k==='shiftask'&&typeof tcAskOutSheet==='function') tcAskOutSheet(ev.punch);
    return;
  }
  /* A machine or a product row opens the thing itself -- but ONLY if that page
     is open to whoever is reading. Equipment and Inventory are both still
     behind the Coming Soon cover for most of the farm, and dropping somebody
     on a covered screen is worse than the tap doing nothing: it looks like the
     app is broken rather than like the page is not ready. Same reasoning as
     the clock rows above. */
  if(ev.eq){
    try{ if(!csLocked('equipment')&&typeof openMachine==='function') openMachine(ev.eq); }catch(_q){}
    return;
  }
  if(ev.item){
    try{ if(!csLocked('inventory')&&typeof openItem==='function') openItem(ev.item); }catch(_q){}
    return;
  }
  /* Ground opens the farm map at that plot, which every phone can reach --
     and seeing where the closed plot IS is the whole point of the alert. */
  if(ev.plot){
    try{ if(typeof trGoPlot==='function') trGoPlot(ev.plot); }catch(_q){}
    return;
  }
  var t=null; try{ t=TASKS.find(function(x){return x.id===ev.task;}); }catch(_e){}
  if(!t){ toast('That job is no longer on the farm’s list'); return; }
  if(ev.k==='partial'&&ntfPart(t)&&typeof openRestSheet==='function'){ openRestSheet(t.id); return; }
  if(ev.k==='reqnew'&&t.origin==='manager'&&ntfReqOpen(t)){
    /* Tab AFTER the go(), never before: boardEnter() sets tbTab itself every
       time the board is opened, so anything set first is thrown away. Same
       order submitGradReq() uses in app-03 for the same reason. */
    go('taskboard');
    try{ tbTab='requests'; renderBoard(); }catch(_e){}
    return;
  }
  if(typeof openTask==='function') openTask(t.id);
});
ntfLoad();
/* Late on purpose: the offline copy has to be running before the browser can
   say whether this phone is registered, and none of it matters in the first
   seconds of opening the app. Also the moment anything queued from last time
   gets another go. */
try{ setTimeout(function(){
  try{ pushRefresh().then(function(){ return pushFlush(); }); }catch(e){}
}, 3000); }catch(e){}

/* Tapping a notification with the app already open: the offline copy focuses
   this window and says which alert it was, and the app opens the right screen
   rather than leaving somebody looking at whatever was last on it. */
try{
  if(navigator.serviceWorker&&navigator.serviceWorker.addEventListener){
    navigator.serviceWorker.addEventListener('message',function(e){
      if(!e||!e.data||e.data.ntf!=='open') return;
      try{ go('notifications'); }catch(_e){}
    });
  }
}catch(e){}

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
  else if(k==='flplots'&&typeof flState!=='undefined'){ flState.types=[]; flState.plots=v?v.split(','):[]; if(typeof flSyncPlotUI==='function')flSyncPlotUI(); if(typeof flRender==='function')flRender(); }
  /* Comma-separated, because the Field Log's category tiles are a multi-select
     since 2026-09-29 -- one name still works and means just that one. */
  else if(k==='fltype'&&typeof flState!=='undefined'){ flState.types=v?v.split(','):[]; flState.plots=[]; if(typeof flSyncPlotUI==='function')flSyncPlotUI(); if(typeof flRender==='function')flRender(); }
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

/* A machine is "in use" when a student ticked it on the Start checklist, and
   that is worked out from the tasks by eqStatusOf() in app-04. The guard is
   for load order: this file runs first, and a widget painted before app-04 is
   read falls back to the machine's own status rather than throwing. */
function hwEqStatus(e){ return (typeof eqStatusOf==='function')?eqStatusOf(e):e.status; }
function hwEqWho(e){ var h=(typeof eqHolder==='function')?eqHolder(e.id):null; return h?(nameOf(h.pid)||h.pid):(e.holder||''); }
function hwMgrEquip(){
 if(typeof EQUIP==='undefined')return;
 var live=EQUIP.filter(function(e){return e.active;});
 var down=live.filter(function(e){return e.status==='down';});
 var use=live.filter(function(e){return hwEqStatus(e)==='in_use';});
 var list=down.concat(use),show=list.slice(0,hwRows('equip'));
 var rows=show.map(function(e,i){var s=eqStat(hwEqStatus(e));
   return hwRow(hwName(e.name,e.type+(hwEqStatus(e)==='in_use'?' · '+hwEqWho(e):'')),hwPill(s.lbl,s.bg,s.fg),i===show.length-1,'equip:'+e.id);
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
   return hwRow(hwName(a.title,flPlotsLabel(a)+' · '+a.detail),
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

/* ---- may we give a spray answer at all? ---------------------------------
   THE ONE RULE THIS FILE MUST NOT GET WRONG. These widgets tell somebody
   whether to take the sprayer out. Until 2026-08-30 they answered from five
   forecast days typed into the source, so the answer was the same in January
   as in July and had nothing to do with the sky. Now they answer from the
   National Weather Service -- and when the phone has NOT heard from it
   recently, they must say so rather than answer from an old reading.

   A stale GOOD is worse than no answer, because no answer sends somebody to
   look out of the window and a stale GOOD does not. Returns null when we do
   not know, which every caller must handle. */
function hwSprayOK(){
  if(typeof WX==='undefined'||!WX.days||!WX.days.length) return null;
  if(typeof wxIsFresh==='function'&&!wxIsFresh()) return null;
  var h=(typeof wxHours==='function')?wxHours():[];
  var lim=(typeof WX_SPRAY_WIND==='number')?WX_SPRAY_WIND:10;
  var pl=(typeof WX_SPRAY_PRECIP==='number')?WX_SPRAY_PRECIP:20;
  /* The next few hours, not the whole day: somebody spraying now cares about
     now. The day card's single wind figure hid a windy morning behind a calm
     afternoon average. */
  var soon=h.slice(0,4);
  if(!soon.length) return null;
  return soon.every(function(x){ return x.wind<=lim&&x.precip<=pl; });
}
/* How old the reading is, for the widgets to admit to. */
function hwWxAge(){ return (typeof wxAgeText==='function')?wxAgeText():''; }
/* A degree figure, or a dash where the service sent nothing. Printing the
   number straight out put the word "null" on the home screen every afternoon:
   once the daytime period has passed, the forecast stops carrying a high for
   today and hands back nothing at all. */
function hwDeg(v){ return (v===null||v===undefined||v==='')?'—':(v+'°'); }
/* The headline temperature on the weather card, and whether it is a forecast
   high or a reading taken just now.

   Today's high disappears from the forecast in the middle of the afternoon,
   and a dash on the biggest number on the card for the rest of every day is
   not much use to somebody deciding whether to go out. The current reading is
   a better answer and the app already has it — it is what the Weather screen
   leads with. It is labelled "now" so nobody reads it as the day's high, and
   it falls back to a dash when there is no reading either. */
function hwWxTemp(d){
  if(d&&d.hi!==null&&d.hi!==undefined&&d.hi!=='') return {t:hwDeg(d.hi),now:false};
  var n=(typeof WX!=='undefined'&&WX)?WX.now:null;
  if(n&&n.temp!==null&&n.temp!==undefined&&n.temp!=='') return {t:hwDeg(n.temp),now:true};
  return {t:'—',now:false};
}

function hwWx(id,mode){
 if(typeof WXDAYS==='undefined')return;
 if(!WXDAYS.length){
   hwFill(id,hwHead(mode==='spray'?'Spray window':'Weather','Forecast')
    +'<div class="rs" style="padding:6px 0">No forecast on this phone yet. Open Weather when you have signal.</div>','weather');
   return;
 }
 var d=WXDAYS[0], spray=hwSprayOK(), tp=hwWxTemp(d);
 /* slice(1,3) drops today, so the forecast index is the loop index + 1. */
 var rows=WXDAYS.slice(1,3).map(function(x,i){
   return hwRow(hwName(x.day,x.cond),'<span style="font:800 13px \'Archivo\';color:var(--ink);flex:none">'+hwDeg(x.hi)+' / '+hwDeg(x.lo)+'</span>',i===1,'wx:'+(i+1));
 }).join('');
 hwFill(id,hwHead(mode==='spray'?'Spray window':'Weather','Forecast')
  +'<div class="tap" data-open="wx:0" style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px">'
   +'<span style="font:800 22px \'Archivo\';color:var(--ink)">'+tp.t
    +(tp.now?'<span style="font:800 11px \'Public Sans\';color:var(--muted);margin-left:5px">now</span>':'')+'</span>'
   +'<span style="font-size:26px;line-height:1;flex:none" title="'+d.cond+'">'+d.ico+'</span></div>'
  /* spray===null means the forecast is missing or too old to judge by. Say
     that, rather than guessing in either direction. */
  +(mode==='spray'
    ? '<div class="tap" data-open="wx:0" style="margin:6px 0 8px">'
      +(spray===null?hwPill('No current forecast','#eef1f4','#5b6470')
       :spray?hwPill('Good to spray','#eafaef','#2f7d3a')
             :hwPill('Hold — wind or rain','#fdeceb','#c0392b'))+'</div>'
    : '<div class="tap" data-open="wx:0" style="margin:6px 0 8px">'
      +(spray===null?hwPill('No current forecast','#eef1f4','#5b6470')
       :spray?hwPill('Fine for outside work','#eafaef','#2f7d3a')
             :hwPill('Dress for weather','#fdf0dd','#9a5b00'))+'</div>')
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
 var use=live.filter(function(e){return hwEqStatus(e)==='in_use';});
 var flag=live.filter(function(e){return e.flagged&&e.status!=='down';});
 var list=down.concat(flag,use),show=list.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(e,i){var s=eqStat(hwEqStatus(e));
   return hwRow(hwName(e.name,e.type+(hwEqStatus(e)==='in_use'?' · '+hwEqWho(e):'')),
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
   list=all.filter(function(a){return flEntryPlots(a).some(function(p){return mine.indexOf(p)>=0||mine.indexOf('B'+p)>=0;});});
   /* A lab with quiet plots would otherwise get a dead card — show the farm
      feed instead and say so, rather than an empty box. */
   if(!list.length){list=all;fell=true;}
 }
 var show=list.slice(0,hwRows(hwWid(id)));
 var rows=show.map(function(a,i){var t=FL_TYPES[a.type]||FL_TYPES.misc;
   return hwRow(hwName(a.title,flPlotsLabel(a)+' · '+a.detail),
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
/* In running order (taskInOrder, app-03), so "next up" on a home card is the
   job Bill put next -- the guard is for load order, this file runs first. */
function hwInOrder(list){ return (typeof taskInOrder==='function')?taskInOrder(list):list; }
function hwOpenTasks(){return typeof TASKS==='undefined'?[]:hwInOrder(TASKS.filter(function(t){return t.kind!=='request'&&t.status!=='done';}));}
function hwMyTasks(role){var me=hwMe(role);return hwOpenTasks().filter(function(t){return taskIsFor(t,me);});}
function hwDownCount(){return typeof EQUIP==='undefined'?0:EQUIP.filter(function(e){return e.active&&e.status==='down';}).length;}
function hwResCount(){return typeof TRIALS==='undefined'?0:trAllLiveRestrictions().length;}
function hwLogsToday(){
 if(typeof FIELDLOG==='undefined'||!FIELDLOG.length)return 0;
 var top=FIELDLOG.reduce(function(a,b){return b.ord>a.ord?b:a;}).ord;
 return FIELDLOG.filter(function(a){return a.ord===top;}).length;
}
/* Weather strip (manager). The comment here used to say "real numbers" while
   every one of them was typed into the source; they are real now. */
function hwWxStrip(id){
 if(typeof WXDAYS==='undefined')return;
 if(!WXDAYS.length){
   hwFill(id,'<div><div class="t">No forecast yet</div>'
    +'<div class="s">Open Weather when you have signal</div></div>'
    +'<div style="font-size:30px;line-height:1;flex:none">🌡️</div>');
   return;
 }
 var d=WXDAYS[0], ok=hwSprayOK(), tp=hwWxTemp(d);
 var line = ok===null ? ('Spray window — no current forecast · last '+hwWxAge())
                      : ('Spray window '+(ok?'GOOD':'HOLD')+' · wind '+d.wind);
 /* Same as the weather card: today's high is gone from the forecast by the
    middle of the afternoon, so this falls back to the reading taken now
    rather than showing a dash for the rest of the day. */
 hwFill(id,'<div><div class="t">'+tp.t+(tp.now?' now':'')+' · '+esc(d.cond)+'</div>'
  +'<div class="s">'+esc(line)+'</div></div>'
  +'<div style="font-size:30px;line-height:1;flex:none" title="'+esc(d.cond)+'">'+d.ico+'</div>');
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
    by its color, with the words moved under the name. */
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
 /* Per-person avatar colors, keyed by roster id. */
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
 var mine=(typeof TASKS==='undefined'?[]:hwInOrder(TASKS.filter(function(t){
   return taskIsFor(t,me)&&t.status==='todo'&&t.kind!=='request';
 })));
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
/* Start goes through startTask() — the notes and equipment checklist first
   when there are any, then the map or the task detail. stopPropagation keeps the card's own tap-through
   to the board from firing underneath it. */
['s-home-undergrad','s-home-tech'].forEach(function(sid){
 var scr=document.getElementById(sid); if(!scr)return;
 scr.addEventListener('click',function(e){
  var st=e.target.closest('.hw-start'); if(!st)return;
  e.stopPropagation(); e.preventDefault();
  var tid=st.getAttribute('data-start');
  var t=(typeof TASKS==='undefined')?null:TASKS.find(function(x){return x.id===tid;});
  if(!t)return;
  if(typeof startTask==='function')startTask(tid);
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
   /* Their picture if they have set one, their initials if not. photoPaintChip
      lives in app-03-people.js, which has NOT been read yet while this file is
      still loading -- so it is asked for by name rather than called outright,
      and the initials remain the answer if it is not there. Calling across
      files at load time is what took the app down the day they were split. */
   if(_av){
     if(typeof photoPaintChip==='function') photoPaintChip(_av,(_p&&_p.id)||null,_u.i,_u.c);
     else { _av.textContent=_u.i; _av.style.background=_u.c; }
   }
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
 '#d17a00':'#e69f00','#7c5cbf':'#cc79a7','#3cbf5a':'#3fbfae','#d55e00':'#d55e00',
 /* Already color-blind safe, and chosen by hand for the task board's name
    colors (see .tbp-* in the page), so they must come through unchanged. */
 '#e69f00':'#e69f00','#0072b2':'#0072b2','#8c6d00':'#8c6d00',
 '#fbf3d9':'#fbf3d9','#e8f4fc':'#e8f4fc','#fdf0e6':'#fdf0e6',
 /* The palette the app hands out to a restriction type somebody adds on the
    Restriction types screen (TR_RES_PALETTE, in the page). Already safe, so
    they have to come through untouched -- without these lines the generic
    shift would move a color that was picked precisely because it did not need
    moving. Add a color there, add it here. */
 '#009e73':'#009e73','#56b4e9':'#56b4e9','#cc79a7':'#cc79a7'
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
/* ---- color conversion ----------------------------------------------------------
   CB_MAP hand-tunes the colors that carry meaning app-wide. Everything else — one-off
   category colors, map layer fills, chart tints — runs through cbShift(), which rotates
   hue onto the blue/yellow axis that red-green color blindness can still separate,
   keeping saturation and lightness so light tints stay light. Between them, every
   color in the app is converted, with nothing left to maintain by hand.            */
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
/* Rewrite every color in a blob of CSS/style text: 6-digit hex, 3-digit hex, and the
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
/* Colors that live in the stylesheet (calendar pills, plot chips, status classes)
   can't be reached by walking elements. So clone every <style> block with the colors
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
/* ================= Coming Soon =================
   Dillon, 2026-09-18: Home, Tasks and the Farm Map are ready for the crew.
   Every other page still needs serious refining, so for everyone except Bill
   and Dillon those pages open faded, under a "Coming Soon" card. The page is
   still drawn underneath, so the crew can see what is on the way; the cover
   just stops them tapping into half-finished work. The header and the bottom
   bar stay live on top of it, so nobody is trapped on a covered page.

   "Bill" and "Dillon" are asked as JOBS, not names: whoever the roster says is
   the Farm Manager, and whoever holds the App Manager post. A successor in
   either chair sees everything without anyone editing this.

   Releasing a page is taking its screen name off CS_LOCKED. Every screen
   inside a page rolls up to it through SCREEN_DEST, so one word covers the
   whole page, detail screens and all. When the list is empty, delete this
   block and the csApply() call in show(). See docs/DECISIONS.md. */
/* Time Clock came off this list on 2026-09-28: Dillon said it was ready, so the
   crew now open the full Time Clock page and their own timesheet, not just the
   clock button on Home. Who may EDIT a punch has not changed -- that is
   tcCanEditPunches() and canPunchFor() in firestore.rules, and it is still
   "you, or Bill". Taking a page off this list only uncovers the screen. */
/* ============================================================
   THE APP MANAGER HAS NO RESTRICTIONS      (Dillon, 2026-09-29)
   ------------------------------------------------------------
   Whoever holds the App Manager post answers YES to every permission in the
   app. Not "most of them", not "the ones somebody remembered": every one. The
   post is the person who has to be able to fix anything, from any phone,
   without asking the farm's chain of command for a key -- writing a study for
   a lab that is not theirs, correcting somebody else's record, changing a
   setting that is normally Bill's. Dillon asked for it in those words.

   TWO THINGS MAKE THIS SAFE TO WRITE ONCE AND TRUST.

   First, IT IS THE TOKEN, NEVER THE ROSTER. rstIsAdmin() reads the `app_admin`
   claim off the sign-in token, stamped by tools/create-accounts.js on a
   laptop. `appAdmin()` in firestore.rules reads THE SAME CLAIM, so the app and
   the database answer this question identically and there is no way to be told
   yes by one and no by the other. That matters more here than anywhere: a
   permission the app grants and the database refuses is a tap that quietly
   undoes itself a second later, which is the third trap in CLAUDE.md and it
   went unnoticed on this farm for a month.

   Second, IT ONLY EVER LIFTS A RESTRICTION FOR THE PERSON WEARING THE HAT.
   Most permission functions take the actor as an argument, and plenty of
   places ask them about OTHER people -- the roster screen does, and
   tools/test-rules.js runs every person against every person. So pass the
   actor in: appAdminAll(someoneElse) is false even for the App Manager. Only
   appAdminAll() with nothing, or with their own id, is true.

   WHAT IT DOES NOT TOUCH, and neither should you:

   - The handful of places the database refuses a hard delete from EVERYBODY:
     the stock movement ledger (a correction is another movement), the
     maintenance log, and anything removed by tombstone rather than deleted.
     Those are not permission checks, they are the shape of the record -- a
     genuinely deleted document comes straight back off the next phone that
     reconnects still holding its own copy. Dillon's call, 2026-09-29.
   - Which home screen he lands on. The post is a hat worn on top of a farm
     job (see the note over rstIsAdmin() in app-03), and taking that back would
     undo 2026-08-25: he holds the post AND is a technician in the Sorochan
     lab, and being sent to Bill's home screen is exactly what left him unable
     to reach his own work last time.

   ADDING A NEW PERMISSION FUNCTION? Its first line is
   `if(appAdminAll(...))return true;`. tools/test-app-admin.js walks the source
   and FAILS if a function named like a permission does not have one, so this
   cannot be forgotten quietly -- which is the only way it would ever be
   forgotten. See docs/DECISIONS.md, 2026-09-29.
   ============================================================ */
function appAdminAll(pid){
  var on=false;
  try{ on=(typeof rstIsAdmin==='function')&&rstIsAdmin()===true; }catch(e){}
  if(!on) return false;
  /* Asking about nobody in particular means asking about whoever is signed in,
     which is the App Manager, so yes. */
  if(pid===undefined||pid===null||pid==='') return true;
  var who=pid;
  try{ if(typeof pidOf==='function') who=pidOf(pid)||pid; }catch(e){}
  return who===SESSION.pid;
}
/* The manager's VIEW of a screen, as opposed to permission to change
   something: Bill's tabs on the Task Board, his Assign screen, his Time Clock.
   Dillon asked for Bill's task board specifically, and the rest follows from
   "no restrictions". Deliberately NOT used for which home screen anybody
   lands on -- see the note above. */
function actsAsManager(){ return currentRole==='manager'||appAdminAll(); }

var CS_LOCKED={inventory:1,trial:1,equipment:1,fieldlog:1,calendar:1,weather:1};
/* trialpin is a Trials screen that SCREEN_DEST never listed, so it would slip
   past the cover without this. */
var CS_EXTRA={trialpin:'trial'};
function csExempt(){
  if(currentRole==='manager') return true;
  try{ if(typeof rstIsAdmin==='function'&&rstIsAdmin()) return true; }catch(e){}
  try{ if(SESSION.pid&&APP_ADMIN.pid&&SESSION.pid===APP_ADMIN.pid) return true; }catch(e){}
  return false;
}
/* Is this page (a screen id or a page's home screen) covered for whoever is
   signed in right now. */
function csLocked(id){
  var page=SCREEN_DEST[id]||CS_EXTRA[id]||id;
  return !!CS_LOCKED[page]&&!csExempt();
}
/* Put the cover on the screen being opened, or take it off. It sits between
   the header and the bottom bar, measured each time because headers differ
   in height and the text-size setting changes them. */
function csApply(el,id){
  var cov=el.querySelector(':scope > .cs-cover');
  if(!csLocked(id)){ if(cov) cov.remove(); el.classList.remove('cs-lock'); return; }
  if(!cov){
    cov=document.createElement('div'); cov.className='cs-cover';
    cov.innerHTML='<div class="cs-card"><div class="cs-ic">🚧</div>'
      +'<div class="cs-t">Coming Soon</div>'
      +'<div class="cs-s">This page is still being worked on. It will open for everyone once it is ready.</div></div>';
    el.appendChild(cov);
  }
  el.classList.add('cs-lock');
  csPlace(el);
}
function csPlace(el){
  var cov=el&&el.querySelector(':scope > .cs-cover'); if(!cov) return;
  var box=el.getBoundingClientRect();
  var hd=el.querySelector('.hdr'), tb=el.querySelector('.tabs');
  var top=hd?Math.max(0,Math.round(hd.getBoundingClientRect().bottom-box.top)):0;
  var bot=(tb&&tb.offsetHeight)?Math.max(0,Math.round(box.bottom-tb.getBoundingClientRect().top)):0;
  cov.style.top=top+'px'; cov.style.bottom=bot+'px';
}
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
  if(id==='profile')fillProfile(); if(id==='profedit')renderProfEdit(); if(id==='roster')rstRender(); if(id==='rosteredit')rstEditRender(); if(id==='adminxfer')axfRender(); if(id==='spraysettings')sprRender(); if(id==='farmsettings')fstRender(); if(id==='bugreport')bugRender(); if(id==='bugsettings')bgsRender(); if(id==='clocksettings')clkRender(); if(id==='sharedb')sdbRender(); if(id==='flfix')flxRender(); if(id==='mowersettings')mwsRender(); if(id==='labsettings')lbsRender(); if(id==='catsettings')scsRender(); if(id==='ressettings')rtsRender(); if(id==='semsettings')smsRender(); if(id==='roles')authRenderAccount();
  if(id==='login')authRenderLogin(); if(id==='notifications'){try{ntfScan();renderNotifFeed();}catch(e){}setSeen(Date.now());try{ntfMarkRead();}catch(e){}setTimeout(updateBellBadges,0);} if(id==='home-manager')renderHomeNotif(); if(id==='weather')wxEnter(); if(id==='map')mapEnter(); if(id==='taskboard')boardEnter(); if(id==='templates')renderTemplates(); if(id==='assign')assignEnter(); if(id==='plotpick')renderPlotPick(); if(id==='taskwork')renderTaskWork(); if(id==='taskprep')renderTaskPrep(); if(id==='eqpick')renderEqPick(); if(id==='inventory')invEnter(); if(id==='lowstock')renderLowStock(); if(id==='additem')renderAddItem(); if(id==='invlog')renderInvLog(); if(id==='cntpick')renderCntPick(); if(id==='cntcount')renderCntCount(); if(id==='cntdone')renderCntDone(); if(id==='itemdetail')0; if(id==='equipment')equipEnter(); if(id==='eqreport')renderEqReport(); if(id==='eqmaint')renderEqMaint(); if(id==='eqedit')renderEqEdit(); if(id==='eqsched')renderEqSched(); if(id==='calendar')calEnter(); if(id==='caladd')renderCalAdd(); if(id==='timeclock')tcEnter(); if(id==='tcperson')tcRenderPerson(); if(id==='fieldlog')fieldlogEnter(); if(id==='flexport')renderFlExport(); if(id==='flnew')renderFlNew(); if(id==='fldetail')renderFlDetail(); if(id==='more')moreEnter(); if(id==='trial')trialsEnter(); if(id==='trialdetail')trRenderDetail(); if(id==='trialedit')trRenderEdit(); if(id==='trialres')trRenderRes(); if(id==='trialpin')trRenderPin(); if(id==='navsettings')renderPrefsHub(); if(id==='notifsettings')renderNotifSettings(); if(id==='powersettings')renderPowerSettings(); if(id==='navtabs')renderNavSettings(); if(id==='homescreen')renderHomeSettings(); if(id==='theme')renderTheme(); if(id.indexOf('home-')===0)hwApply(r||currentRole); renderTabs();
  try{csApply(el,id);}catch(e){}
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
