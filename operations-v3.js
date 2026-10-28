/* CC SafeGuard Live / Operations v3 — local working features and honest sync status.
 * Real authentication, token redemption, audit integrity and cross-device delivery require a trusted backend.
 */
(function(){
"use strict";
const TEAM_KEY="ccsl_teams_v3", AUDIT_KEY="ccsl_audit_v3", QUEUE_KEY="ccsl_queue_v3", ACTOR_KEY="ccsl_actor_v3";
const CASE_KEY="cc_safeguard_live_demo_v2", MATCH_KEY="cc_safeguard_match_v3", SCHEDULE_KEY="cc_safeguard_schedule_v3";
const $=id=>document.getElementById(id);
const read=(k,def)=>{try{let data=JSON.parse(localStorage.getItem(k));return data==null?def:data}catch(e){return def}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){notice("Penyimpanan tidak tersedia atau penuh.");return false}};
const clean=(v,max=80)=>String(v==null?"":v).replace(/\s+/g," ").trim().slice(0,max);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const now=()=>new Date().toISOString();
const day=date=>{const d=date instanceof Date?date:new Date(date);if(!Number.isFinite(d.getTime()))return"";return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const fmt=iso=>{let d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"};
const role=()=> $("role")?.value||"viewer";
const admin=()=>role()==="coordinator";
const actor=()=>clean($("audit-actor")?.value||localStorage.getItem(ACTOR_KEY)||"Operator lokal",50);
function notice(m){let e=$("toast");if(e){e.textContent=m;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),4000)}}
function randomHex(bytes=16){if(!crypto?.getRandomValues)throw Error("Perangkat ini tidak mendukung kode QR acak yang aman.");let x=new Uint8Array(bytes);crypto.getRandomValues(x);return [...x].map(v=>v.toString(16).padStart(2,"0")).join("")}
function stampAudit(action,entity,before,after){
 const logs=read(AUDIT_KEY,[]);const entry={id:"A-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),at:now(),actor:actor(),role:role(),action,entity,previous:before==null?null:before,current:after==null?null:after};
 logs.push(entry);if(logs.length>1500)logs.splice(0,logs.length-1500);
 write(AUDIT_KEY,logs);renderAudit();return entry;
}
window.CCSafeAudit=stampAudit;
function teams(){let data=read(TEAM_KEY,[]);return Array.isArray(data)?data:[]}
function saveTeams(data){return write(TEAM_KEY,data)}
function resetTeamReady(t){if(t.status==="ready")t.status="arrived"}
function teamStatus(t){
 if(t.status==="ready" && t.members.length && t.members.every(m=>m.checkedInAt))return "ready";
 if(t.members.some(m=>m.checkedInAt))return "arrived";
 return "absent";
}
const statusName={absent:"Belum hadir",arrived:"Sudah hadir",ready:"Siap bertanding"};
function teamCode(){return "TEAM-"+randomHex(4).toUpperCase()}
function matchExpiry(){
 let select=$("member-expiry").value;
 if(select==="match"){
  const id=$("member-match").value;const s=read(SCHEDULE_KEY,[]).find(s=>s.id===id);
  if(!s)throw Error("Pilih pertandingan yang sudah terjadwal.");
  const t=new Date(s.date+"T"+s.time+":00");if(!Number.isFinite(t.getTime())||t.getTime()<=Date.now())throw Error("Jadwal pertandingan harus di masa depan.");
  return {expiresAt:t.toISOString(),matchId:id};
 }
 if(select==="custom"){
  const v=$("member-custom").value,dt=new Date(v);
  if(!v||!Number.isFinite(dt.getTime())||dt.getTime()<=Date.now())throw Error("Pilih waktu kedaluwarsa setelah sekarang.");
  return {expiresAt:dt.toISOString(),matchId:null};
 }
 let hours=Number(select);
 if(![1,6,12,24,48,72,168].includes(hours))hours=24;
 return {expiresAt:new Date(Date.now()+hours*3600000).toISOString(),matchId:null}
}
function renderTeamOptions(){
 let all=teams(),val=$("member-team").value;
 $("member-team").innerHTML='<option value="">Pilih tim</option>'+all.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join("");
 if(all.some(t=>t.id===val))$("member-team").value=val;
 let previous=$("member-match").value,fixtures=read(SCHEDULE_KEY,[]);
 $("member-match").innerHTML='<option value="">Pilih pertandingan</option>'+fixtures.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.home)+" vs "+esc(s.away)+" · "+esc(s.date)+" "+esc(s.time)+'</option>').join("");
 if(fixtures.some(s=>s.id===previous))$("member-match").value=previous;
 $("match-expiry-box").hidden=$("member-expiry").value!=="match";
 $("custom-expiry-box").hidden=$("member-expiry").value!=="custom";
}
function teamCard(t){
 const st=teamStatus(t),count=t.members.filter(m=>m.checkedInAt).length,total=t.members.length;
 return '<article class="team-card"><div class="team-head"><div><span class="eyebrow">TEAM LOBBY</span><h3>'+esc(t.name)+'</h3><small>Kode tim: <code>'+esc(t.code)+'</code></small></div><span class="status '+(st==="ready"?"closed":st==="arrived"?"assigned":"open")+'">'+statusName[st]+'</span></div>'+
 '<div class="team-progress"><span>'+count+' dari '+total+' peserta check-in</span><div class="bar"><div style="width:'+(total?count/total*100:0)+'%"></div></div></div>'+
 (t.members.length?'<div class="team-members">'+t.members.map(m=>{
  let expired=Date.parse(m.expiresAt)<=Date.now();
  return '<div class="member-row"><div><strong>'+esc(m.alias)+'</strong><small>ID '+esc(m.id)+' · '+(m.checkedInAt?'Check-in '+esc(fmt(m.checkedInAt)):expired?'QR kedaluwarsa':'QR berlaku s.d. '+esc(fmt(m.expiresAt)))+'</small></div><div class="member-actions"><span class="status '+(m.checkedInAt?"closed":expired?"open":"assigned")+'">'+(m.checkedInAt?"Hadir":expired?"Expired":"Menunggu")+'</span><button type="button" class="button soft" data-qr="'+esc(m.id)+'">Lihat QR</button></div></div>';
 }).join("")+'</div>':'<div class="empty-lite">Belum ada anggota terdaftar.</div>')+
 '<div class="actions"><button type="button" class="button '+(st==="ready"?"soft":"dark")+'" data-ready="'+esc(t.id)+'"'+(!admin()||st==="absent"?' disabled':'')+'>'+(st==="ready"?"Batalkan status siap":"Tandai siap bertanding")+'</button><button type="button" class="button soft" data-team-copy="'+esc(t.id)+'">Salin kode tim</button></div></article>'
}
function renderTeams(){
 const all=teams();
 $("team-list").innerHTML=all.length?all.map(teamCard).join(""):'<div class="empty">Belum ada tim. Admin dapat membuat lobby tim terlebih dahulu.</div>';
 $("team-total").textContent=all.length;
 $("team-checked").textContent=all.reduce((n,t)=>n+t.members.filter(m=>m.checkedInAt).length,0);
 $("team-ready").textContent=all.filter(t=>teamStatus(t)==="ready").length;
 renderTeamOptions();
 const granted=admin();
 for(const id of ["team-name","team-create","team-ready-override"])if($(id))$(id).disabled=!granted;
 setText("team-permission",granted?"Admin (demo) dapat membuat lobby dan mengonfirmasi kesiapan.":"Pendaftaran peserta dapat dicoba secara lokal; untuk membuat tim atau menandai siap, pilih Admin (demo).");
 renderQueue();
}
function setText(id,t){if($(id))$(id).textContent=t}
function renderQR(token){
 const target=$("qr-render");target.replaceChildren();
 if(typeof qrcode!=="function"){target.textContent="Generator QR belum dimuat.";return}
 try{
  const qr=qrcode(0,"M");qr.addData("CCSL1:"+token);qr.make();
  // SVG generated by an MIT-licensed local QR library; payload is a cryptographically random opaque code.
  target.innerHTML=qr.createSvgTag({cellSize:7,margin:3,scalable:true});
 }catch(e){target.textContent="QR gagal dibuat: "+e.message}
}
let currentQR=null;
function showQR(memberId){
 const all=teams();let member,team;
 for(const t of all){let m=t.members.find(m=>m.id===memberId);if(m){member=m;team=t;break}}
 if(!member){notice("Peserta tidak ditemukan.");return}
 currentQR={teamId:team.id,memberId:member.id};
 $("qr-card").hidden=false;$("qr-empty").hidden=true;
 setText("qr-owner",team.name+" · "+member.alias);
 setText("qr-expiry","Berlaku sampai "+fmt(member.expiresAt));
 setText("qr-token","Kode manual: CCSL1:"+member.token);
 setText("qr-status",member.checkedInAt?"Sudah check-in":new Date(member.expiresAt)<=new Date()?"Sudah kedaluwarsa":"Belum digunakan");
 renderQR(member.token);
 $("qr-card").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function recordCheckIn(raw){
 if(role()==="viewer"){notice("Hanya admin atau marshal (demo) yang dapat memvalidasi check-in.");return false}
 const code=clean(raw,200).trim().toUpperCase().replace(/^CCSL1:/,"");
 if(!/^[0-9A-F]{32}$/.test(code)){notice("Format QR tidak valid.");return false}
 const all=teams();let member=null,team=null;
 for(const t of all){member=t.members.find(m=>m.token.toUpperCase()===code);if(member){team=t;break}}
 if(!member){notice("QR tidak terdaftar pada browser ini; perlu backend untuk verifikasi antarperangkat.");return false}
 if(Date.parse(member.expiresAt)<=Date.now()){notice("QR sudah kedaluwarsa. Admin perlu menerbitkan QR baru.");return false}
 if(member.checkedInAt){notice("QR sudah digunakan untuk check-in.");return false}
 const before={teamId:team.id,memberId:member.id,status:"belum hadir"};
 member.checkedInAt=now();team.status="arrived";
 saveTeams(all);stampAudit("participant_checkin","member:"+member.id,before,{teamId:team.id,memberId:member.id,status:"hadir"});
 renderTeams();if(currentQR?.memberId===member.id)showQR(member.id);
 notice("Check-in berhasil: "+member.alias+" ("+team.name+")");return true
}
window.CCSafeCheckIn=recordCheckIn;
function compareFixtures(candidate,fixtures){
 const output=[];
 const start=new Date(candidate.date+"T"+candidate.time+":00").getTime();
 const duration=Number(candidate.duration)||60;
 if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<15||duration>240)return ["Tanggal, jam, atau durasi tidak valid."];
 const end=start+duration*60000;
 for(const s of fixtures){
  if(candidate.id && s.id===candidate.id)continue;
  const priorStart=new Date(s.date+"T"+s.time+":00").getTime();
  const priorEnd=priorStart+(Number(s.duration)||60)*60000;
  if(!Number.isFinite(priorStart)||start>=priorEnd||priorStart>=end)continue;
  let samePitch=clean(candidate.venue).toLowerCase()&&clean(candidate.venue).toLowerCase()===clean(s.venue).toLowerCase();
  let teamsA=[clean(candidate.home).toLowerCase(),clean(candidate.away).toLowerCase()].filter(Boolean);
  let teamsB=[clean(s.home).toLowerCase(),clean(s.away).toLowerCase()].filter(Boolean);
  let sameTeam=teamsA.some(t=>teamsB.includes(t));
  if(samePitch)output.push("Bentrok lapangan: "+s.venue+" sudah digunakan "+s.date+" "+s.time+".");
  if(sameTeam)output.push("Bentrok tim: "+[candidate.home,candidate.away].filter(x=>teamsB.includes(clean(x).toLowerCase())).join(", ")+" dijadwalkan pada waktu yang sama.");
 }
 return output;
}
window.CCSafeConflictCheck=compareFixtures;
function candidateSchedule(){
 return {home:clean($("schedule-home")?.value,48),away:clean($("schedule-away")?.value,48),date:$("schedule-date")?.value||"",time:$("schedule-time")?.value||"",venue:clean($("schedule-venue")?.value,80),duration:Number($("schedule-duration")?.value)||60};
}
function conflictPreview(){
 const cand=candidateSchedule(),arr=read(SCHEDULE_KEY,[]);
 if(!cand.home||!cand.away||!cand.date||!cand.time||!cand.venue){
  $("conflict-preview").textContent="Isi tim, tanggal, jam, dan lapangan untuk memeriksa jadwal bentrok.";
  $("conflict-preview").classList.remove("conflict-danger");return [];
 }
 const issues=compareFixtures(cand,arr);
 $("conflict-preview").innerHTML=issues.length?'<strong>⚠ Jadwal bentrok</strong><ul>'+issues.map(t=>"<li>"+esc(t)+"</li>").join("")+'</ul>':'<span>✓ Belum ada bentrok terdeteksi untuk pilihan ini.</span>';
 $("conflict-preview").classList.toggle("conflict-danger",!!issues.length);
 return issues;
}
function originalDayKey(iso){return day(iso)}
function getCaseDate(c){
 if(c.createdAt){const d=new Date(c.createdAt);if(Number.isFinite(d.getTime()))return day(d)}
 const m=/^CC-([0-9A-Z]+)-/i.exec(c.id||"");
 if(m){const ms=parseInt(m[1],36);if(Number.isFinite(ms)&&ms>1577836800000&&ms<4102444800000)return day(ms)}
 return "";
}
function auditResponse(c){
 const items=read(AUDIT_KEY,[]);
 const initial=new Date(c.createdAt||"").getTime();
 if(!Number.isFinite(initial))return null;
 const first=items.filter(l=>l.action==="incident_status"&&l.entity==="incident:"+c.id).sort((a,b)=>a.at.localeCompare(b.at))[0];
 if(!first)return null;
 let minutes=(new Date(first.at).getTime()-initial)/60000;
 return minutes>=0&&minutes<100000?minutes:null
}
function dailyData(date){
 const cases=read(CASE_KEY,{cases:[]}).cases||[];
 const matches=read(SCHEDULE_KEY,[]).filter(s=>s.date===date);
 const today=cases.filter(c=>getCaseDate(c)===date);
 const responses=today.map(auditResponse).filter(v=>v!=null);
 const closed=today.filter(c=>c.status==="closed");
 const unresolved=today.filter(c=>c.status!=="closed");
 const backlog=cases.filter(c=>c.status!=="closed"&&getCaseDate(c)&&getCaseDate(c)<date);
 return {date,matches,today,closed,unresolved,backlog,avgResponse:responses.length?Math.round(responses.reduce((a,b)=>a+b,0)/responses.length):null,measured:responses.length};
}
function renderDaily(){
 let date=$("daily-date").value||day(new Date());
 const r=dailyData(date);
 $("daily-match-count").textContent=r.matches.length;
 $("daily-new-count").textContent=r.today.length;
 $("daily-closed-count").textContent=r.closed.length;
 $("daily-open-count").textContent=r.unresolved.length;
 $("daily-backlog-count").textContent=r.backlog.length;
 $("daily-response").textContent=r.avgResponse==null?"Belum ada data":r.avgResponse+" menit ("+r.measured+" kasus)";
 $("daily-match-list").innerHTML=r.matches.length?r.matches.map(s=>'<div class="schedule-line"><div><strong>'+esc(s.home)+" vs "+esc(s.away)+'</strong><small>'+esc(s.time)+" · "+esc(s.venue||"Lapangan menyusul")+'</small></div></div>').join(""):'<div class="empty">Tidak ada pertandingan terjadwal pada tanggal ini.</div>';
 $("daily-backlog-list").innerHTML=r.backlog.length?r.backlog.map(c=>'<div class="case"><div><strong>'+esc(c.type)+'</strong><small>'+esc(c.id)+" · "+esc(getCaseDate(c))+"</small></div><span class=\"status open\">Belum selesai</span></div>").join(""):'<div class="empty">Tidak ada tunggakan dari hari sebelumnya.</div>';
 $("daily-incident-list").innerHTML=r.today.length?r.today.map(c=>'<div class="case"><div><strong>'+esc(c.type)+'</strong><small>'+esc(c.id)+" · "+esc(c.place)+'</small></div><span class="status '+esc(c.status)+'">'+esc(c.status)+'</span></div>').join(""):'<div class="empty">Tidak ada insiden yang dicatat pada tanggal ini.</div>';
 $("daily-report-period").textContent=new Date(date+"T12:00:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
function safeCSV(value){let x=String(value==null?"":value);if(/^\s*[=+\-@\t\r\n]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'}
function downloadText(name,text,type){
 const blob=new Blob(["\ufeff",text],{type:type||"text/plain;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)
}
function downloadDaily(){
 const r=dailyData($("daily-date").value);
 const lines=[["CC SAFEGUARD DAILY REPORT"],["Tanggal",r.date],["Pertandingan",r.matches.length],["Insiden dicatat",r.today.length],["Selesai",r.closed.length],["Belum selesai",r.unresolved.length],["Tunggakan dari hari sebelumnya",r.backlog.length],["Rata-rata waktu respons (menit)",r.avgResponse==null?"N/A":r.avgResponse],[],["PERTANDINGAN"],["Tim A","Tim B","Tanggal","Jam","Lapangan","Durasi"]].concat(r.matches.map(s=>[s.home,s.away,s.date,s.time,s.venue,s.duration||60]),[[],["INSIDEN"],["ID","Jenis","Lokasi","Status","Waktu"]],r.today.map(c=>[c.id,c.type,c.place,c.status,c.time]));
 downloadText("safeguard-daily-"+r.date+".csv",lines.map(row=>row.map(safeCSV).join(",")).join("\r\n"),"text/csv;charset=utf-8")
}
function renderAudit(){
 const list=$("audit-list");if(!list)return;
 const filter=$("audit-search")?.value?.toLowerCase().trim()||"";
 const all=read(AUDIT_KEY,[]),items=all.slice().reverse().filter(l=>[l.actor,l.action,l.entity].join(" ").toLowerCase().includes(filter)).slice(0,150);
 $("audit-total").textContent=all.length;
 list.innerHTML=items.length?items.map(l=>'<article class="audit-row"><div><strong>'+esc(l.action.replaceAll("_"," "))+'</strong><small>'+esc(l.actor)+" · "+esc(l.role)+" · "+esc(fmt(l.at))+'</small><small>'+esc(l.entity)+'</small></div><details><summary>Perubahan</summary><div class="audit-diff"><div><b>Sebelum</b><pre>'+esc(JSON.stringify(l.previous,null,2))+'</pre></div><div><b>Sesudah</b><pre>'+esc(JSON.stringify(l.current,null,2))+'</pre></div></div></details></article>').join(""):'<div class="empty">Belum ada aktivitas yang cocok.</div>'
}
function queue(){const arr=read(QUEUE_KEY,[]);return Array.isArray(arr)?arr:[]}
function renderQueue(){
 const q=queue(),badge=$("sync-status");if(!badge)return;
 const online=navigator.onLine;
 badge.textContent=online?"● LOCAL · "+q.length+" menunggu server":"● OFFLINE · "+q.length+" tersimpan lokal";
 badge.className="sync-indicator "+(online?"":"offline");
 $("queue-count").textContent=q.length;
 $("queue-state").textContent=online?"Tidak ada server terhubung. Laporan disimpan lokal, belum terkirim.":"Internet terputus. Laporan bisa dicatat lokal dan belum terkirim.";
 $("queue-list").innerHTML=q.length?q.slice(-15).reverse().map(t=>'<div class="case"><div><strong>⏳ '+esc(t.eventId)+'</strong><small>Insiden '+esc(t.caseId)+" · "+esc(fmt(t.queuedAt))+'</small></div><span class="status open">Belum tersinkron</span></div>').join(""):'<div class="empty">Belum ada laporan yang menunggu sinkronisasi.</div>'
}
function queueReport(caseData){
 let arr=queue();if(arr.some(q=>q.caseId===caseData.id))return;
 arr.push({eventId:"QUEUE-"+randomHex(8),caseId:caseData.id,queuedAt:now(),status:"pending"});
 if(arr.length>5000)arr=arr.slice(-5000);
 write(QUEUE_KEY,arr);renderQueue();
}
window.CCSafeQueue=queueReport;
function startCamera(){
 if(!navigator.mediaDevices?.getUserMedia){notice("Browser tidak memberikan akses kamera. Gunakan kode manual.");return}
 let stream=null,video=$("qr-camera"),detector=null,stop=false,canvas=null,context=null;
 const btn=$("camera-start"),off=$("camera-stop");
 function stopCamera(){
  stop=true;
  if(stream)stream.getTracks().forEach(t=>t.stop());
  video.pause();video.srcObject=null;video.hidden=true;off.hidden=true;btn.hidden=false;
 }
 async function run(){
  try{
   if(typeof BarcodeDetector==="function"){
    try{
     const formats=await BarcodeDetector.getSupportedFormats();
     if(formats.includes("qr_code"))detector=new BarcodeDetector({formats:["qr_code"]});
    }catch(err){}
   }
   if(!detector && typeof jsQR!=="function")throw Error("Decoder QR tidak tersedia; gunakan kode manual.");
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
   video.srcObject=stream;video.hidden=false;off.hidden=false;btn.hidden=true;
   await video.play();
   if(!detector){canvas=document.createElement("canvas");context=canvas.getContext("2d",{willReadFrequently:true});}
   while(!stop&&stream.active){
    try{
     let raw="";
     if(detector){const codes=await detector.detect(video);if(codes.length)raw=codes[0].rawValue}
     else if(video.readyState>=2&&context){
      canvas.width=Math.max(1,Math.floor(video.videoWidth||320));
      canvas.height=Math.max(1,Math.floor(video.videoHeight||240));
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const frame=context.getImageData(0,0,canvas.width,canvas.height);
      const qr=jsQR(frame.data,frame.width,frame.height,{inversionAttempts:"dontInvert"});
      if(qr)raw=qr.data;
     }
     if(raw){recordCheckIn(raw);break}
    }catch(err){}
    await new Promise(resolve=>setTimeout(resolve,250));
   }
  }catch(err){notice("Kamera tidak dapat dijalankan: "+err.message)}
  finally{stopCamera()}
 }
 off.addEventListener("click",stopCamera,{once:true});run();
}
function init(){
 const operator=$("audit-actor");operator.value=localStorage.getItem(ACTOR_KEY)||"";
 operator.addEventListener("change",()=>{localStorage.setItem(ACTOR_KEY,clean(operator.value,50));notice("Nama operator lokal disimpan untuk log berikutnya.")});
 $("team-form").addEventListener("submit",e=>{e.preventDefault();if(!admin()){notice("Hanya admin (demo) bisa membuat tim.");return}
  const name=clean($("team-name").value,48);if(!name)return;
  const all=teams();if(all.some(t=>t.name.toLowerCase()===name.toLowerCase())){notice("Nama tim sudah terdaftar.");return}
  if(all.length>=64){notice("Maksimal 64 tim untuk demo lokal.");return}
  let t={id:"T-"+randomHex(8),code:teamCode(),name,status:"absent",members:[],createdAt:now()};
  all.push(t);if(saveTeams(all)){stampAudit("team_created","team:"+t.id,null,{teamId:t.id,name:t.name});e.target.reset();renderTeams();notice("Lobby tim berhasil dibuat.")}
 });
 $("member-form").addEventListener("submit",e=>{e.preventDefault();
  const code=clean($("join-code").value,30).toUpperCase(),alias=clean($("member-alias").value,48);
  const all=teams(),t=all.find(x=>x.code===code);
  if(!t){notice("Kode tim tidak ditemukan di browser ini. Pendaftaran antar-HP membutuhkan database.");return}
  if(!alias){notice("Isi nama panggilan atau kode peserta.");return}
  if(t.members.some(m=>m.alias.toLowerCase()===alias.toLowerCase())){notice("Nama panggilan sudah digunakan pada tim itu.");return}
  if(t.members.length>=30){notice("Maksimal 30 anggota per tim untuk demo.");return}
  let expiry;try{expiry=matchExpiry()}catch(err){notice(err.message);return}
  if(expiry.matchId){
   const match=read(SCHEDULE_KEY,[]).find(s=>s.id===expiry.matchId);
   if(!match||![match.home,match.away].some(n=>clean(n).toLowerCase()===t.name.toLowerCase())){
    notice("Pertandingan harus melibatkan tim yang dipilih.");return;
   }
  }
  let member={id:"M-"+randomHex(6),alias,token:randomHex(16),expiresAt:expiry.expiresAt,matchId:expiry.matchId,createdAt:now(),checkedInAt:null};
  t.members.push(member);resetTeamReady(t);
  if(saveTeams(all)){stampAudit("member_registered","member:"+member.id,null,{teamId:t.id,memberId:member.id,expiresAt:member.expiresAt});
   renderTeams();showQR(member.id);notice("Peserta terdaftar. QR dibuat untuk peserta ini.");}
 });
 $("member-expiry").addEventListener("change",renderTeamOptions);
 $("team-list").addEventListener("click",e=>{
  const btn=e.target.closest("button");if(!btn)return;
  if(btn.dataset.qr){showQR(btn.dataset.qr);return}
  if(btn.dataset.teamCopy){const t=teams().find(x=>x.id===btn.dataset.teamCopy);if(t && navigator.clipboard?.writeText)navigator.clipboard.writeText(t.code).then(()=>notice("Kode tim disalin")).catch(()=>notice("Gagal menyalin kode."));else notice(t?.code||"Kode tidak ditemukan");return}
  if(btn.dataset.ready){if(!admin())return;
   let all=teams(),t=all.find(t=>t.id===btn.dataset.ready);if(!t)return;
   let before=teamStatus(t);
   if(before==="ready")t.status="arrived";
   else{if(!t.members.length||!t.members.every(m=>m.checkedInAt)){notice("Semua peserta harus check-in sebelum tim siap.");return}t.status="ready"}
   saveTeams(all);stampAudit("team_readiness","team:"+t.id,{status:before},{status:teamStatus(t)});renderTeams();
  }
 });
 $("checkin-form").addEventListener("submit",e=>{e.preventDefault();recordCheckIn($("checkin-token").value);$("checkin-token").value=""});
 $("qr-regenerate").addEventListener("click",()=>{
  if(!admin()||!currentQR)return notice("Hanya admin (demo) dapat menerbitkan ulang QR.");
  const all=teams(),t=all.find(t=>t.id===currentQR.teamId),m=t?.members.find(m=>m.id===currentQR.memberId);
  if(!m)return;let expiry;
  try{expiry=matchExpiry()}catch(e){notice(e.message);return}
  if(expiry.matchId){
   const match=read(SCHEDULE_KEY,[]).find(s=>s.id===expiry.matchId);
   if(!match||![match.home,match.away].some(n=>clean(n).toLowerCase()===t.name.toLowerCase())){notice("Jadwal QR harus melibatkan tim peserta.");return}
  }
  if(!confirm("Terbitkan ulang QR? QR sebelumnya langsung tidak berlaku."))return;
  const before={expiresAt:m.expiresAt,tokenRevoked:true};m.token=randomHex(16);m.expiresAt=expiry.expiresAt;m.matchId=expiry.matchId;
  m.checkedInAt=null;resetTeamReady(t);saveTeams(all);
  stampAudit("pass_reissued","member:"+m.id,before,{expiresAt:m.expiresAt});renderTeams();showQR(m.id);notice("QR baru berhasil diterbitkan.");
 });
 $("qr-copy").addEventListener("click",()=>{
  if(!currentQR)return;const t=teams().find(t=>t.id===currentQR.teamId),m=t?.members.find(m=>m.id===currentQR.memberId);
  if(m && navigator.clipboard?.writeText)navigator.clipboard.writeText("CCSL1:"+m.token).then(()=>notice("Kode QR manual disalin")).catch(()=>notice("Salin kode manual pada kartu."));
 });
 $("camera-start").addEventListener("click",startCamera);
 ["schedule-date","schedule-time","schedule-home","schedule-away","schedule-venue","schedule-duration"].forEach(id=>$(id).addEventListener("input",conflictPreview));
 $("daily-date").value=day(new Date());$("daily-date").addEventListener("change",renderDaily);
 $("daily-download").addEventListener("click",downloadDaily);
 $("decision-check").addEventListener("click",()=>{
  stampAudit("rule_guidance_viewed","rules",null,{issue:$("decision-issue").value,risk:$("decision-risk").value,refereeConfirmed:$("decision-referee").value,disclaimer:"Advisory only"});
 });
 $("audit-search").addEventListener("input",renderAudit);
 $("audit-download").addEventListener("click",()=>downloadText("safeguard-audit-"+day(new Date())+".json",JSON.stringify(read(AUDIT_KEY,[]),null,2),"application/json;charset=utf-8"));
 $("sync-retry").addEventListener("click",()=>notice("Server belum dikonfigurasi. "+queue().length+" laporan tetap menunggu; tidak ada data yang dikirim."));
 $("role").addEventListener("change",renderTeams);
 window.addEventListener("storage",e=>{if([TEAM_KEY,SCHEDULE_KEY].includes(e.key))renderTeams();if(e.key===AUDIT_KEY)renderAudit();if(e.key===QUEUE_KEY)renderQueue();if(e.key===CASE_KEY)renderDaily()});
 window.addEventListener("online",renderQueue);window.addEventListener("offline",renderQueue);
 renderTeams();renderAudit();renderDaily();renderQueue();conflictPreview();
}
window.CCSafeRefresh=()=>{renderTeams();renderAudit();renderDaily();renderQueue()};
window.CCSafeDailyData=dailyData;
document.addEventListener("DOMContentLoaded",init);
})();
