/* タクシー施設マップ：オフライン用のサービスワーカー
   ・ページ本体と events.json：通信優先（つながらないときは保存分）
   ・地図ライブラリ：保存優先（バージョン固定のため）
   ・地図データ（OpenFreeMap）：保存優先、なければ取得して保存
   ・経路計算・Overpassなどは保存しない */
const SHELL="tm-shell-v1",LIB="tm-lib-v1",TILES="tm-tiles-v1";
const KEEP=[SHELL,LIB,TILES];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(SHELL).then(c=>c.addAll(["./","./index.html"])).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("tm-")&&!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
function networkFirst(req,cacheName,ms){
  return new Promise(resolve=>{
    let done=false;
    const fromCache=()=>caches.open(cacheName).then(c=>c.match(req,{ignoreSearch:true})).then(r=>r||caches.match("./index.html"));
    const t=setTimeout(()=>{fromCache().then(r=>{if(r&&!done){done=true;resolve(r)}})},ms);
    fetch(req).then(res=>{
      if(res&&res.ok){const copy=res.clone();caches.open(cacheName).then(c=>c.put(req,copy)).catch(()=>{})}
      if(!done){done=true;clearTimeout(t);resolve(res)}
    }).catch(()=>{clearTimeout(t);if(!done)fromCache().then(r=>{done=true;resolve(r||new Response("オフラインです",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}))})});
  });
}
let putCount=0;
async function trim(){ // 保存しすぎないよう、地図データは最大6000件まで（古いものから削除）
  const c=await caches.open(TILES);const ks=await c.keys();
  if(ks.length>6000)for(const k of ks.slice(0,ks.length-6000))await c.delete(k);
}
async function cacheFirst(req,cacheName){
  const c=await caches.open(cacheName);const hit=await c.match(req);if(hit)return hit;
  const res=await fetch(req);
  if(res&&res.ok){c.put(req,res.clone()).catch(()=>{});if(cacheName===TILES&&++putCount%200===0)trim()}
  return res;
}
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const u=new URL(req.url);
  if(u.origin===self.location.origin){
    if(req.mode==="navigate"||/\/(index\.html|events\.json)?$/.test(u.pathname)||u.pathname.endsWith("events.json"))
      e.respondWith(networkFirst(req,SHELL,3500));
    return;
  }
  if(u.hostname==="unpkg.com"&&u.pathname.startsWith("/maplibre-gl@")){e.respondWith(cacheFirst(req,LIB));return}
  if(u.hostname==="tiles.openfreemap.org"){e.respondWith(cacheFirst(req,TILES).catch(()=>new Response("",{status:504})));return}
});
