/* タクシー施設マップ：データ作成の共通処理
   ページ（index.html）と、GitHub Actions のデータ作成（scripts/build-data.mjs）の両方で使う。
   ここを直すと、ページ側とデータ作成側の両方の結果が同じように変わる。 */
"use strict";
function km(a,b){const r=Math.PI/180,dLa=(b.lat-a.lat)*r,dLo=(b.lng-a.lng)*r;const h=Math.sin(dLa/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2;return 12742*Math.asin(Math.sqrt(h))}
function buildICs(els){
  const raw=[];
  els.forEach(e=>{
    const t=e.tags||{};let n=(t["name:ja"]||t.name||"").trim();if(!n)return;
    const lat=e.lat!=null?e.lat:(e.center&&e.center.lat),lng=e.lon!=null?e.lon:(e.center&&e.center.lon);if(lat==null)return;
    if(/JCT|ジャンクション|本線料金所|バスストップ|PA$|SA$|パーキング/.test(n))return;
    let kind=null;
    if(/入口/.test(n))kind="in";else if(/出口/.test(n))kind="out";
    else if(t.barrier==="toll_booth")kind="in";
    else if(t.highway==="motorway_junction")kind="out";
    if(!kind)return;
    n=n.replace(/\s*[\(（].*?[\)）]\s*/g,"").replace(/(入口|出口|料金所|IC|インターチェンジ)$/,"").trim();
    if(!n)return;
    raw.push({n,kind,lat:+lat.toFixed(6),lng:+lng.toFixed(6)});
  });
  // 同じ名前・同じ種類で400m以内は1つにまとめる。入口と出口が近い同名は「both」
  const out=[];
  raw.forEach(r=>{
    const same=out.find(o=>o.n===r.n&&km(o,r)<0.4);
    if(!same){out.push(r);return}
    if(same.kind!==r.kind)same.kind="both";
  });
  return out;
}
const lineBase=n=>n.replace(/[（(][^）)]*[）)]/g,"").split(/[:：]|→|⇒|-{2,}/)[0].replace(/\s+/g," ").trim().slice(0,30);
const okColor=c=>typeof c==="string"&&/^#?[0-9a-fA-F]{6}$|^#?[0-9a-fA-F]{3}$/.test(c)?(c[0]==="#"?c:"#"+c):"";
function buildRail(els){
  const nodes=new Map();els.forEach(e=>{if(e.type==="node")nodes.set(e.id,e)});
  const lines=[],lineIdx=new Map(),stations=[];
  els.forEach(e=>{
    if(e.type!=="relation")return;const t=e.tags||{};const nm=t["name:ja"]||t.name;if(!nm)return;
    const base=lineBase(nm);if(!base)return;
    let li=lineIdx.get(base);if(li==null){li=lines.length;lines.push({n:base,c:okColor(t.colour)});lineIdx.set(base,li)}
    else if(!lines[li].c&&okColor(t.colour))lines[li].c=okColor(t.colour);
    (e.members||[]).forEach(m=>{
      if(m.type!=="node"||!/^stop/.test(m.role||""))return;const nd=nodes.get(m.ref);if(!nd)return;
      const sn=((nd.tags&&(nd.tags["name:ja"]||nd.tags.name))||"").replace(/駅$/,"").trim();if(!sn)return;
      let st=stations.find(x=>x.n===sn&&km(x,{lat:nd.lat,lng:nd.lon})<0.6);
      if(!st){st={n:sn.slice(0,30),lat:+nd.lat.toFixed(6),lng:+nd.lon.toFixed(6),l:[]};stations.push(st)}
      if(!st.l.includes(li))st.l.push(li);
    });
  });
  // 駅のない路線は除く
  const used=new Set(stations.flatMap(s=>s.l));
  const keep=lines.map((L,i)=>used.has(i)?i:-1).filter(i=>i>=0);const remap=new Map(keep.map((o,n)=>[o,n]));
  return {lines:keep.map(i=>lines[i]),stations:stations.map(s=>({...s,l:s.l.map(i=>remap.get(i))}))};
}
const ZONE_COL="#64748b";
const AREA_LIST=[["千代田区","#e11d48"],["中央区","#ea580c"],["港区","#2563eb"],["新宿区","#16a34a"],["渋谷区","#9333ea"],["練馬区","#0891b2"],["杉並区","#ca8a04"],["武蔵野市","#db2777"],
  ...["文京区","台東区","墨田区","江東区","品川区","目黒区","大田区","世田谷区","中野区","豊島区","北区","荒川区","板橋区","足立区","葛飾区","江戸川区","三鷹市"].map(n=>[n,null])];
function ringify(ways){
  const segs=ways.map(w=>w.map(p=>[p.lon,p.lat])).filter(w=>w.length>1);const rings=[];
  const same=(a,b)=>Math.abs(a[0]-b[0])<1e-7&&Math.abs(a[1]-b[1])<1e-7;
  while(segs.length){
    let ring=segs.shift();let guard=0;
    while(!same(ring[0],ring[ring.length-1])&&guard++<5000){
      const end=ring[ring.length-1];let k=segs.findIndex(s=>same(s[0],end)||same(s[s.length-1],end));
      if(k<0)break;let sg=segs.splice(k,1)[0];if(!same(sg[0],end))sg=sg.slice().reverse();ring=ring.concat(sg.slice(1));
    }
    if(ring.length>=4&&same(ring[0],ring[ring.length-1]))rings.push(ring);
  }
  return rings;
}
function ringArea(r){let a=0;for(let i=0;i<r.length-1;i++)a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return Math.abs(a/2)}
function centroid(r){let x=0,y=0,a=0;for(let i=0;i<r.length-1;i++){const f=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];x+=(r[i][0]+r[i+1][0])*f;y+=(r[i][1]+r[i+1][1])*f;a+=f}
  if(!a)return r[0];return [x/(3*a),y/(3*a)]}
function buildAreas(els){
  const out=[];
  els.forEach(e=>{
    if(e.type!=="relation")return;const n=(e.tags&&(e.tags["name:ja"]||e.tags.name))||"";const def=AREA_LIST.find(a=>a[0]===n);if(!def)return;
    const ways=(e.members||[]).filter(m=>m.type==="way"&&m.role!=="inner"&&Array.isArray(m.geometry)).map(m=>m.geometry.filter(p=>isFinite(p.lat)&&isFinite(p.lon)));
    const rings=ringify(ways).map(r=>r.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)]));if(!rings.length)return;
    const big=rings.slice().sort((a,b)=>ringArea(b)-ringArea(a))[0];
    out.push({n,col:def[1]||ZONE_COL,main:def[1]?1:0,rings,c:centroid(big).map(v=>+v.toFixed(5))});
  });
  return out;
}
const SAI_CITIES=["川越市","所沢市","狭山市","富士見市","ふじみ野市","朝霞市","新座市","鶴ヶ島市","坂戸市"];
function saiCat(t){
  const n=t.name||"";
  if(t.railway==="station")return "駅";
  if(t.amenity==="hospital")return "病院";
  if(t.amenity==="townhall")return /市役所|市庁舎|役場/.test(n)?"市役所":null;
  if(t.amenity==="police")return /警察署$/.test(n)?"警察署":null;
  if(t.amenity==="fire_station")return /消防署$|消防本部/.test(n)?"消防":null;
  if(t.amenity==="university"||t.amenity==="college")return "大学";
  if(t.tourism==="hotel")return "ホテル";
  if(t.tourism==="museum")return "美術館・博物館";
  if(t.shop==="mall"||t.shop==="department_store")return "商業施設";
  if(t.leisure==="stadium")return "スポーツ";
  if(t.amenity==="theatre"||t.amenity==="arts_centre")return "劇場・ホール";
  return null;
}

/* トイレ：公開されていないもの・有料のものを除いて、表示用の形にする */
function cleanToilet(e){
  const t=e.tags||{};const lat=e.lat!=null?e.lat:(e.center&&e.center.lat),lng=e.lon!=null?e.lon:(e.center&&e.center.lon);if(lat==null)return null;
  if(/^(private|customers|no|delivery)$/.test(t.access||""))return null;
  if(t.fee==="yes"||t.charge)return null;
  return {id:e.type+e.id,lat:+(+lat).toFixed(6),lng:+(+lng).toFixed(6),free:t.fee==="no"?1:0,n:String(t["name:ja"]||t.name||"公衆トイレ").slice(0,30),
    hours:String(t.opening_hours||"").slice(0,60),wheel:String(t.wheelchair||"").slice(0,10),diaper:String(t.changing_table||t.diaper||"").slice(0,10)};
}
/* 埼玉西部の施設：Overpassの結果を表示用の形にする */
function buildSai(els){
  return (els||[]).map(e=>{const t=e.tags||{};const c=saiCat(t);if(!c)return null;
    const lat=e.lat!=null?e.lat:(e.center&&e.center.lat),lng=e.lon!=null?e.lon:(e.center&&e.center.lon);if(lat==null)return null;
    const a=[t["addr:city"],t["addr:quarter"]||t["addr:neighbourhood"],t["addr:block_number"]].filter(Boolean).join("");
    return {n:t["name:ja"]||t.name,c,lat:+(+lat).toFixed(6),lng:+(+lng).toFixed(6),a}}).filter(Boolean);
}
/* Overpass API の問い合わせ文（ページとデータ作成で共通） */
const TOILET_BB=[35.50,139.30,36.02,139.95]; // 南,西,北,東（営業区域＋埼玉西部）
const QUERIES={
  ics:`[out:json][timeout:60];(way[highway=motorway_link][name~"入口|出口"](35.40,139.35,35.95,140.05);node[highway=motorway_junction][name](35.40,139.35,35.95,140.05);node[barrier=toll_booth][name](35.40,139.35,35.95,140.05););out tags center;`,
  rail:`[out:json][timeout:120];rel[route~"^(train|subway|light_rail|monorail)$"](35.40,139.35,35.95,140.05)->.r;.r out body;node(r.r)(35.40,139.35,35.95,140.05);out;`,
  areas:()=>`[out:json][timeout:120];rel[boundary=administrative][admin_level=7][name~"^(${AREA_LIST.map(a=>a[0]).join("|")})$"](35.50,139.50,35.83,139.93);out geom;`,
  sai:()=>`[out:json][timeout:120];area["admin_level"="7"]["name"~"^(${SAI_CITIES.join("|")})$"]->.a;(
nwr(area.a)[amenity~"^(hospital|townhall|police|fire_station|university|college|theatre|arts_centre)$"][name];
node(area.a)[railway=station][name];
nwr(area.a)[tourism~"^(hotel|museum)$"][name];
nwr(area.a)[shop~"^(mall|department_store)$"][name];
nwr(area.a)[leisure=stadium][name];
);out center tags;`,
  toilets:`[out:json][timeout:120];(node[amenity=toilets](${TOILET_BB.join(",")});way[amenity=toilets](${TOILET_BB.join(",")}););out center tags;`,
};
if(typeof module!=="undefined")module.exports={km,buildICs,buildRail,buildAreas,buildSai,cleanToilet,saiCat,AREA_LIST,SAI_CITIES,QUERIES,TOILET_BB};
