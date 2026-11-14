// 地図データを前もって作る（GitHub Actions から月1回実行）
// 使い方: node scripts/build-data.mjs
// OpenStreetMap（Overpass API）から取得し、js/builders.js（ページと同じ処理）で整えて data/*.json に保存する。
// 取得に失敗したデータは、前回のファイルをそのまま残す。
import {createRequire} from "node:module";
import {writeFileSync,mkdirSync,existsSync,readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const B=require("../js/builders.js");
const ENDPOINTS=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
const UA="taxi-map-data-builder (GitHub Actions; monthly)";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function overpass(q){
  let last;
  for(let round=0;round<3;round++){
    for(const url of ENDPOINTS){
      try{
        const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":UA},body:"data="+encodeURIComponent(q),signal:AbortSignal.timeout(180000)});
        if(!r.ok)throw new Error(url+" HTTP "+r.status);
        const j=await r.json();
        if(!Array.isArray(j.elements))throw new Error(url+" 形式が違います");
        return j.elements;
      }catch(e){last=e;console.warn("  再試行:",e.message);await sleep(20000)}
    }
  }
  throw last;
}
mkdirSync("data",{recursive:true});
const save=(name,obj)=>{writeFileSync("data/"+name+".json",JSON.stringify(obj));console.log("  保存: data/"+name+".json");};
const counts={};let ok=0;
const jobs=[
  ["ics",  async()=>{ // ランプのつながりから正確な出入口を作る（範囲が広いので4つに分けて取得してからまとめる）
    const [S,W,N,E]=B.RAMP_BB,my=(S+N)/2,mx=(W+E)/2;const m=new Map();
    for(const bb of [[S,W,my,mx],[S,mx,my,E],[my,W,N,mx],[my,mx,N,E]]){(await overpass(B.rampQuery(bb))).forEach(e=>m.set(e.type+e.id,e));await sleep(10000)}
    const d=B.buildRamps([...m.values()]);if(d.length>80)return {v:2,d};
    console.warn("  ランプからの作成が少ないため、従来の方法で作ります");
    const d1=B.buildICs(await overpass(B.QUERIES.ics));return d1.length>20?{d:d1}:null}],
  ["rail", async()=>{const d=B.buildRail(await overpass(B.QUERIES.rail));return d.stations.length>200?d:null}],
  ["areas",async()=>{const d=B.buildAreas(await overpass(B.QUERIES.areas()));return d.length===B.AREA_LIST.length?{d}:null}],
  ["sai",  async()=>{const d=B.buildSai(await overpass(B.QUERIES.sai()));return d.length>20?{d}:null}],
  ["fuel", async()=>{const d=B.buildPoi(await overpass(B.QUERIES.fuel),"fuel");return d.length>20?{d}:null}],
  ["taxi", async()=>{const d=B.buildPoi(await overpass(B.QUERIES.taxi),"taxi");return d.length>20?{d}:null}],
  ["spots",async()=>{const d=B.buildSpots(await overpass(B.QUERIES.spots));return d.length>100?{d}:null}],
  ["corp", async()=>{const d=B.buildCorp(await overpass(B.QUERIES.corp));return d.length>200?{d}:null}],
  ["xing", async()=>{ // 範囲が広いので4つに分けて取得し、最後にまとめて整える
    const [S,W,N,E]=B.XING_BB,my=(S+N)/2,mx=(W+E)/2;let els=[];
    for(const bb of [[S,W,my,mx],[S,mx,my,E],[my,W,N,mx],[my,mx,N,E]]){els=els.concat(await overpass(B.xingQuery(bb,170)));await sleep(10000)}
    const d=B.buildXing(els);return d.length>1000?{d}:null}],
  ["toilets",async()=>{const d=(await overpass(B.QUERIES.toilets)).map(B.cleanToilet).filter(Boolean);return d.length>100?{bb:B.TOILET_BB,d}:null}],
];
for(const [name,fn] of jobs){
  console.log("取得中:",name);
  try{
    const obj=await fn();
    if(!obj){console.warn("  件数が少なすぎるため保存しません（前回のファイルを残します）");continue}
    save(name,obj);ok++;
    counts[name]=Array.isArray(obj.d)?obj.d.length:obj.stations?obj.stations.length:0;
  }catch(e){console.warn("  失敗（前回のファイルを残します）:",e.message)}
  await sleep(10000); // Overpass API に負担をかけないよう間をあける
}
if(ok){
  const jst=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  const prev=existsSync("data/meta.json")?JSON.parse(readFileSync("data/meta.json","utf8")):{};
  save("meta",{updated:jst,counts:{...(prev.counts||{}),...counts},source:"© OpenStreetMap contributors (ODbL)"});
}
console.log("完了:",ok,"/",jobs.length);
if(!ok)process.exit(1);
