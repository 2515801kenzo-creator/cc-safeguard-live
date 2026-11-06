/* CC SafeGuard Live offline shell and notification worker. Never cache report or medical data. */
const CACHE="ccsl-shell-v11-20261106";
const SHELL=["./","./index.html","./internal.html","./manifest.webmanifest","./ui-v2.css","./features-v2.js","./operations-v3.js","./vendor/qrcode-generator.js","./vendor/jsQR.js","./assets/safeguard-icon.svg","./assets/kolese-kanisius-logo.svg"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("ccsl-shell-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("push",event=>{
 let payload={};
 try{if(event.data)payload=event.data.json()}catch(_){payload={body:event.data?event.data.text():""}}
 const title=payload.title||"CC SafeGuard Live";
 const options={
  body:payload.body||"Ada pembaruan pada laporan yang perlu diperhatikan.",
  icon:"./assets/safeguard-icon.svg",
  badge:"./assets/safeguard-icon.svg",
  tag:payload.tag||"ccsg-push",
  silent:false,
  vibrate:[160,90,160],
  renotify:false,
  data:{url:payload.url||"./internal.html"}
 };
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||"./internal.html",self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
  const existing=list.find(client=>client.url.startsWith(self.registration.scope));
  if(existing){existing.navigate(target);return existing.focus();}
  return self.clients.openWindow(target);
 }));
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
 if(req.mode==="navigate"){
  event.respondWith(fetch(req).then(res=>{if(res.ok){const clone=res.clone();caches.open(CACHE).then(cache=>cache.put("./index.html",clone))}return res}).catch(()=>caches.match("./index.html")));
 }else{
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{
   if(res.ok){const clone=res.clone();caches.open(CACHE).then(cache=>cache.put(req,clone))}
   return res;
  })));
 }
});
