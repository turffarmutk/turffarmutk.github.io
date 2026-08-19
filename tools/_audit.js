const fs=require('fs');const{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('UT-TurfFarm-App.html','utf8'));
const d=dom.window.document;
const miss=[];
d.querySelectorAll('.screen').forEach(s=>{
  const id=s.id.replace(/^s-/,'');
  const hdr=s.querySelector('.hdr');
  if(s.querySelector('.backbtn'))return;
  const app=s.querySelector('.app');
  miss.push({id,cls:s.className,appcls:app?app.className:'(none)',hdrHtml:hdr?hdr.outerHTML.replace(/\s+/g,' ').slice(0,150):'(no hdr)'});
});
miss.forEach(m=>console.log(m.id.padEnd(15),'| screen:',m.cls.replace('screen','').trim().padEnd(10),'| app:',m.appcls.replace('app','').trim().padEnd(12),'\n    ',m.hdrHtml,'\n'));
