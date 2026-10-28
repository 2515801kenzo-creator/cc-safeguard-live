/*
 * CC SafeGuard Live — Match controls, schedule and rule decision guidance.
 * Local-mode UI: intentionally no fabricated server or background push delivery.
 */
(function(){
"use strict";
var MATCH_KEY="cc_safeguard_match_v3";
var SCHEDULE_KEY="cc_safeguard_schedule_v3";
var SOUND_KEY="cc_safeguard_sound_v3";
var VIBRATION_KEY="cc_safeguard_vibration_enabled";
var CASES_KEY="cc_safeguard_live_demo_v2";
var defaultMatch={home:"",away:"",homeScore:0,awayScore:0,state:"Belum dimulai",venue:""};
function read(key,fallback){
 try{var raw=localStorage.getItem(key);if(!raw)return fallback;var parsed=JSON.parse(raw);return parsed==null?fallback:parsed}catch(err){return fallback}
}
function write(key,val){try{localStorage.setItem(key,JSON.stringify(val));return true}catch(err){message("Penyimpanan browser tidak tersedia.");return false}}
function $ (id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(x){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]})}
function oneLine(s,limit){return String(s||"").trim().replace(/\s+/g," ").slice(0,limit||80)}
function message(txt){
 var node=$("toast");if(!node)return;
 node.textContent=txt;node.classList.add("show");clearTimeout(window._v2ToastTimer);
 window._v2ToastTimer=setTimeout(function(){node.classList.remove("show")},4000);
}
function role(){return $("role")?$("role").value:"viewer"}
function isAdmin(){return role()==="coordinator"} // Demo access control only; no server authorization.
function localMatch(){var j=read(MATCH_KEY,null);return j&&typeof j==="object"&&!Array.isArray(j)?Object.assign({},defaultMatch,j):Object.assign({},defaultMatch)}
function safeNumber(n){var v=Number(n);return Number.isFinite(v)&&v>=0&&v<=99?Math.floor(v):null}
function setText(id,value){var el=$(id);if(el)el.textContent=value}
function niceDate(value){try{return new Date(value+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}catch(err){return value}}
function getSchedule(){var raw=read(SCHEDULE_KEY,[]);return Array.isArray(raw)?raw.filter(function(x){return x&&typeof x==="object"}).slice(0,100):[]}
function dateSort(a,b){return (a.date+"T"+a.time).localeCompare(b.date+"T"+b.time)}
function renderMatch(){
 var cfg=localMatch();
 setText("match-home",cfg.home||"Tim A");
 setText("match-away",cfg.away||"Tim B");
 setText("match-home-score",safeNumber(cfg.homeScore)==null?"0":cfg.homeScore);
 setText("match-away-score",safeNumber(cfg.awayScore)==null?"0":cfg.awayScore);
 setText("match-state",cfg.state||"Belum dimulai");
 setText("match-venue",cfg.venue||"Lokasi belum diatur");
 setText("match-team-caption",cfg.home&&cfg.away?"Tim sudah ditetapkan oleh admin":"Nama tim belum ditetapkan oleh admin");
 var form=$("match-admin-form");
 if(form && document.activeElement && !form.contains(document.activeElement)){
  $("admin-home").value=cfg.home;$("admin-away").value=cfg.away;
  $("admin-score-home").value=cfg.homeScore;$("admin-score-away").value=cfg.awayScore;
  $("admin-match-state").value=cfg.state;$("admin-venue").value=cfg.venue;
 }
}
function scheduleRow(s,edit){
 var name=esc(s.home||"Tim A")+" <span style='color:#a1aeb7'>vs</span> "+esc(s.away||"Tim B");
 var text='<div class="schedule-line"><div class="date">'+esc(new Date(s.date+"T12:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short"}))+'<small>'+esc(s.time)+'</small></div><div style="flex:1;min-width:0"><b>'+name+'</b><small>'+esc(s.venue||"Lokasi menyusul")+'</small></div>';
 if(edit && isAdmin())text+='<button type="button" class="button soft" style="padding:7px 10px;min-height:32px" data-delete-schedule="'+esc(s.id)+'" aria-label="Hapus jadwal '+esc(s.home)+' versus '+esc(s.away)+'">Hapus</button>';
 return text+"</div>";
}
function renderSchedule(){
 var arr=getSchedule().slice().sort(dateSort);
 var home=$("schedule-preview");
 if(home)home.innerHTML=arr.length?arr.slice(0,3).map(function(s){return scheduleRow(s,false)}).join(""):'<div class="empty-lite"><div class="glyph">▦</div><span>Belum ada jadwal. Admin dapat menambahkan pertandingan.</span></div>';
 var list=$("schedule-list");
 if(list)list.innerHTML=arr.length?arr.map(function(s){return scheduleRow(s,true)}).join(""):'<div class="empty">Jadwal masih kosong. Tambahkan pertandingan lewat panel admin di bawah.</div>';
 setText("schedule-total",String(arr.length));
}
function renderAdmin(){
 var admin=isAdmin();
 document.querySelectorAll("[data-admin-only]").forEach(function(el){
  el.disabled=!admin;el.setAttribute("aria-disabled",admin?"false":"true");
 });
 document.querySelectorAll(".admin-zone").forEach(function(el){el.classList.toggle("admin-locked",!admin)});
 setText("admin-access-note",admin?"Mode admin lokal aktif. Perubahan hanya tersimpan di browser ini.":"Untuk mengedit, pilih peran Admin (demo) di Pengaturan. Ini belum merupakan login aman.");
 renderSchedule();
}
function announce(messageText,detail){
 var el=$("site-alert");if(!el)return;
 setText("alert-title",messageText);setText("alert-detail",detail||"Periksa laporan baru.");
 el.classList.add("show");
 clearTimeout(window._alertTimeout);
 window._alertTimeout=setTimeout(function(){el.classList.remove("show")},7500);
}
function canVibrate(){return typeof navigator.vibrate==="function"}
function vibrate(){
 if(!canVibrate()||document.visibilityState!=="visible")return false;
 try{return navigator.vibrate([200,110,200])===true}catch(err){return false}
}
function sound(){
 var Audio=window.AudioContext||window.webkitAudioContext;
 if(!Audio||document.visibilityState!=="visible")return false;
 try{
  var ctx=window._ccAudioContext;
  if(!ctx)ctx=window._ccAudioContext=new Audio();
  if(ctx.state==="suspended")ctx.resume().catch(function(){});
  var start=ctx.currentTime+0.04;
  [0,.22].forEach(function(offset){
   var osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type="sine";osc.frequency.setValueAtTime(740,start+offset);
   osc.frequency.exponentialRampToValueAtTime(530,start+offset+.14);
   gain.gain.setValueAtTime(.001,start+offset);
   gain.gain.exponentialRampToValueAtTime(.09,start+offset+.025);
   gain.gain.exponentialRampToValueAtTime(.001,start+offset+.17);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(start+offset);osc.stop(start+offset+.18);
  });return true
 }catch(err){return false}
}
function ccSignalAlert(){
 var haptic=localStorage.getItem(VIBRATION_KEY)==="1"&&vibrate();
 var audio=localStorage.getItem(SOUND_KEY)==="1"&&sound();
 announce("Peringatan insiden baru","Laporan berhasil dicatat pada perangkat ini.");
 return {haptic:haptic,audio:audio}
}
window.ccSignalAlert=ccSignalAlert;
function displayAudioSettings(){
 var checked=localStorage.getItem(SOUND_KEY)==="1";
 if($("sound-enabled"))$("sound-enabled").checked=checked;
 if($("sound-state"))$("sound-state").textContent=checked?"Suara aktif di perangkat ini":"Suara nonaktif";
 if($("vibrate-capability"))$("vibrate-capability").textContent=canVibrate()?"Browser mendukung API getaran.":"Getaran tidak didukung; gunakan suara dan peringatan layar.";
}
function makeDecision(){
 var issue=$("decision-issue").value,risk=$("decision-risk").value,confirmed=$("decision-referee").value;
 var guidance={
  collision:{title:"Kontak atau tabrakan antar pemain",action:"Perhatikan kondisi pemain; bila tampak cedera atau tidak aman, hentikan aktivitas dan minta bantuan petugas berwenang.",rule:"Kontak fisik tidak otomatis merupakan pelanggaran. Wasit menentukan keputusan berdasarkan kejadian dan aturan pertandingan."},
  aggressive:{title:"Tindakan agresif atau potensi kekerasan",action:"Utamakan jarak aman, minta bantuan petugas keamanan, dan hindari konfrontasi. Catat lokasi dan fakta yang diamati.",rule:"Jika ada dugaan perilaku kasar, serahkan penilaian dan sanksi kepada wasit/panitia sesuai SOP."},
  dissent:{title:"Protes terhadap keputusan wasit",action:"Jaga situasi tetap tertib. Arahkan pihak terkait ke jalur komunikasi atau protes resmi yang disediakan panitia.",rule:"Perdebatan dan protes harus mengikuti SOP penyelenggara; sistem tidak menentukan benar-salahnya keputusan wasit."},
  injury:{title:"Cedera atau pemain membutuhkan bantuan",action:"Segera panggil petugas medis/penanggung jawab di lokasi. Jangan menunda bantuan karena mengisi aplikasi.",rule:"Keselamatan pemain didahulukan; kelanjutan pertandingan diputuskan petugas pertandingan sesuai aturan."},
  secondyellow:{title:"Dua kartu kuning pada pemain yang sama",action:"Periksa apakah kartu tersebut benar untuk pemain yang sama dan pada pertandingan yang sama. Konfirmasikan langsung kepada perangkat pertandingan.",rule:"Secara umum kartu kuning kedua berakibat kartu merah; hanya catat setelah keputusan wasit dikonfirmasi. Aturan kelayakan pertandingan berikutnya harus dicek pada SOP kompetisi."},
  other:{title:"Situasi lain di sekitar pertandingan",action:"Pastikan lingkungan aman, laporkan apa yang diamati, lalu koordinasikan dengan petugas yang berwenang.",rule:"Gunakan SOP resmi mini soccer CC Cup untuk detail keputusan yang tidak tercantum di panduan ini."}
 };
 var selected=guidance[issue]||guidance.other;
 var steps=[];
 if(risk==="high")steps.push("URGENT: prioritaskan keselamatan, minta bantuan petugas atau layanan darurat yang sesuai di lokasi sekarang.");
 else if(risk==="medium")steps.push("Pantau situasi dan hubungi koordinator bila masalah belum terkendali.");
 else steps.push("Lakukan pengamatan singkat dan dokumentasikan hal yang relevan.");
 steps.push(selected.action);
 steps.push(confirmed==="yes"?"Catat keputusan wasit yang sudah diumumkan tanpa menambah asumsi.":"Jangan menetapkan kartu, gol, atau hukuman sebelum ada keputusan resmi wasit.");
 steps.push("Catat kronologi objektif tanpa identitas pribadi dan tanpa menyebarkan tuduhan.");
 var result=$("decision-result");
 result.hidden=false;
 result.innerHTML='<h4>'+esc(selected.title)+'</h4><ul>'+steps.map(function(x){return "<li>"+esc(x)+"</li>"}).join("")+'</ul><p><strong>Catatan aturan:</strong> '+esc(selected.rule)+'</p><p class="subtle-note">Panduan berbasis pilihan situasi, bukan AI yang menilai video atau mengeluarkan keputusan resmi. Selalu ikuti SOP terbaru.</p>';
}
function init(){
 renderMatch();renderSchedule();renderAdmin();displayAudioSettings();
 var matchForm=$("match-admin-form");
 if(matchForm)matchForm.addEventListener("submit",function(event){
  event.preventDefault();
  if(!isAdmin()){message("Ubah peran ke Admin (demo) terlebih dahulu.");return}
  var home=oneLine($("admin-home").value,48),away=oneLine($("admin-away").value,48);
  var homeScore=safeNumber($("admin-score-home").value),awayScore=safeNumber($("admin-score-away").value);
  if(homeScore==null||awayScore==null){message("Skor harus berupa angka 0–99.");return}
  if((home&&!away)||(!home&&away)){message("Isi kedua nama tim atau kosongkan keduanya.");return}
  var cfg={home:home,away:away,homeScore:homeScore,awayScore:awayScore,state:$("admin-match-state").value,venue:oneLine($("admin-venue").value,80)};
  if(write(MATCH_KEY,cfg)){renderMatch();message("Scoreboard diperbarui di browser ini.")}
 });
 var reset=$("reset-score");
 if(reset)reset.addEventListener("click",function(){
  if(!isAdmin())return;
  if(!confirm("Reset skor menjadi 0–0 dan tetap simpan nama tim?"))return;
  var cfg=localMatch();cfg.homeScore=0;cfg.awayScore=0;write(MATCH_KEY,cfg);renderMatch();message("Skor direset menjadi 0–0.");
 });
 var scheduleForm=$("schedule-form");
 if(scheduleForm)scheduleForm.addEventListener("submit",function(event){
  event.preventDefault();if(!isAdmin()){message("Pengaturan jadwal khusus Admin (demo).");return}
  var home=oneLine($("schedule-home").value,48),away=oneLine($("schedule-away").value,48),date=$("schedule-date").value,time=$("schedule-time").value,venue=oneLine($("schedule-venue").value,80);
  if(!home||!away||!date||!time){message("Lengkapi kedua tim, tanggal dan jam.");return}
  if(home.toLowerCase()===away.toLowerCase()){message("Dua tim harus berbeda.");return}
  var arr=getSchedule();
  if(arr.length>=100){message("Maksimal 100 jadwal dalam browser ini.");return}
  arr.push({id:"S-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),home:home,away:away,date:date,time:time,venue:venue});
  if(write(SCHEDULE_KEY,arr)){scheduleForm.reset();renderSchedule();message("Jadwal berhasil ditambahkan di browser ini.")}
 });
 var list=$("schedule-list");
 if(list)list.addEventListener("click",function(event){
  var btn=event.target.closest("[data-delete-schedule]");if(!btn||!isAdmin())return;
  if(!confirm("Hapus jadwal ini?"))return;
  var arr=getSchedule().filter(function(s){return s.id!==btn.dataset.deleteSchedule});
  if(write(SCHEDULE_KEY,arr)){renderSchedule();message("Jadwal dihapus.")}
 });
 var sel=$("role");
 if(sel)sel.addEventListener("change",function(){renderAdmin();setTimeout(renderMatch,0)});
 var soundToggle=$("sound-enabled");
 if(soundToggle)soundToggle.addEventListener("change",function(){localStorage.setItem(SOUND_KEY,this.checked?"1":"0");displayAudioSettings();message(this.checked?"Peringatan suara aktif.":"Peringatan suara nonaktif.");});
 var alertTest=$("alert-test");
 if(alertTest)alertTest.addEventListener("click",function(){
  var vib=localStorage.getItem(VIBRATION_KEY)==="1"&&vibrate();
  var aud=sound();announce("Tes peringatan","Indikator visual aktif. "+(vib?"Perintah getaran dikirim.":"Getaran tidak tersedia atau dimatikan.")+(aud?" Suara dicoba.":" Suara tidak tersedia."));
  message("Tes dijalankan: visual"+(vib?" + getaran":"")+(aud?" + suara":"")+".");
 });
 var issue=$("decision-issue");
 if(issue)$("decision-check").addEventListener("click",makeDecision);
 var close=$("alert-close");
 if(close)close.addEventListener("click",function(){$("site-alert").classList.remove("show")});
 window.addEventListener("storage",function(e){
  if(e.key===MATCH_KEY)renderMatch();
  if(e.key===SCHEDULE_KEY)renderSchedule();
  if(e.key===SOUND_KEY)displayAudioSettings();
 });
}
init();
})();
