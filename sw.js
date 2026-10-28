/* CC SafeGuard Live offline shell v3 — only static assets, no API data cache */
const CACHE="ccsl-shell-v5-20261028";
const SHELL=["./","./index.html","./ui-v2.css","./features-v2.js","./operations-v3.js","./vendor/qrcode-generator.js","./vendor/jsQR.js","./assets/safeguard-icon.svg"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("ccsl-shell-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
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
