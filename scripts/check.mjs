// ページが壊れていないかの自動チェック（GitHub Actions でファイル更新のたびに実行）
// 使い方: node scripts/check.mjs
// 1) index.html のプログラムを、地図ライブラリの代わりを使って動かし、読み込み時のエラーがないか
// 2) 地図の描き方の設定が MapLibre の決まり（zoomは一番外側だけ）に合っているか
// 3) sw.js・js/builders.js の書き間違い、JSONファイルの形式
import {readFileSync,existsSync,readdirSync} from "node:fs";
import vm from "node:vm";
const errors=[];const fail=m=>{errors.push(m);console.error("NG: "+m)};const ok=m=>console.log("OK: "+m);

// --- 3) 書き間違い・JSON
for(const f of ["sw.js","js/builders.js"]){try{new vm.Script(readFileSync(f,"utf8"),{filename:f});ok(f+" の書き方")}catch(e){fail(f+": "+e.message)}}
const jsons=["manifest.webmanifest","events.json","gaiku/towns.json",...(existsSync("data")?readdirSync("data").filter(f=>f.endsWith(".json")).map(f=>"data/"+f):[])];
for(const f of jsons){if(!existsSync(f))continue;try{JSON.parse(readFileSync(f,"utf8"));ok(f+" の形式")}catch(e){fail(f+": "+e.message)}}

// --- 1) 2) ページのプログラム
const html=readFileSync("index.html","utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(!scripts.length)fail("index.html にプログラムが見つかりません");
const main=scripts.reduce((a,b)=>b.length>a.length?b:a,"");
const src=readFileSync("js/builders.js","utf8")+"\n"+main;
const any=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?(()=>""):k==="length"?0:k==="then"?undefined:k===Symbol.iterator?function*(){}:any(),apply:()=>any(),construct:()=>any(),set:()=>true});
const H={};const BAD=[];
const hasZoom=v=>Array.isArray(v)&&(v[0]==="zoom"||v.some(hasZoom));
function checkExpr(id,prop,v){
  if(!Array.isArray(v))return;
  if(/^interpolate/.test(v[0])&&Array.isArray(v[2])&&v[2][0]==="zoom"){if(v.slice(3).some(hasZoom))BAD.push(id+"."+prop);return}
  if(v[0]==="step"&&Array.isArray(v[1])&&v[1][0]==="zoom"){if(v.slice(2).some(hasZoom))BAD.push(id+"."+prop);return}
  if(hasZoom(v))BAD.push(id+"."+prop);
}
const mapObj=new Proxy({},{get:(t,k)=>{
  if(k==="addLayer")return l=>{["paint","layout"].forEach(g=>Object.entries(l[g]||{}).forEach(([p,v])=>checkExpr(l.id,p,v)))};
  if(k==="setPaintProperty"||k==="setLayoutProperty")return (id,p,v)=>checkExpr(id,p,v);
  if(k==="on")return (ev,a,b)=>{(H[ev]=H[ev]||[]).push(b||a)};
  if(k==="getStyle")return ()=>({layers:[{id:"a",type:"symbol",layout:{"text-font":["Noto Sans Regular"]}},{id:"r",type:"line","source-layer":"transportation"}],sources:{}});
  if(k==="getZoom")return ()=>13;if(k==="getLayoutProperty")return ()=>"{name}";if(k==="getLayer")return ()=>true;
  if(k==="getBounds")return ()=>({getSouth:()=>35.6,getNorth:()=>35.65,getWest:()=>139.7,getEast:()=>139.75});
  return any()}});
const el=()=>new Proxy({style:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},dataset:{}},{get:(t,k)=>k in t?t[k]:(["append","appendChild","setAttribute","addEventListener","querySelectorAll","prepend","after"].includes(k)?(()=>[]):any()),set:(t,k,v)=>{t[k]=v;return true}});
const ctx={window:any(),navigator:{clipboard:any()},localStorage:{getItem:()=>null,setItem(){}},fetch:()=>Promise.reject(new Error("offline")),
  maplibregl:{Map:function(){return mapObj},GeolocateControl:function(){return any()},NavigationControl:function(){return any()},Popup:function(){return any()},LngLatBounds:function(){return any()}},
  document:{createElement:()=>el(),getElementById:()=>el(),body:el(),documentElement:el(),querySelectorAll:()=>[]},location:{hash:"",protocol:"http:"},
  console,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},Promise,URL,Blob:function(){},Event:function(){},Date,Math,JSON};
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{filename:"index.html"});ok("ページを開いたとき")}catch(e){fail("ページを開いたとき: "+e.message)}
try{(H.load||[]).forEach(f=>f());ok("地図の準備ができたとき")}catch(e){fail("地図の準備ができたとき: "+e.message)}
if(BAD.length)fail("地図の描き方の設定がMapLibreの決まりに合っていません: "+BAD.join(", "));else ok("地図の描き方の設定");
if(errors.length){console.error("\n"+errors.length+"件の問題があります");process.exit(1)}
console.log("\nすべて問題ありません");
