// Screens, sheets and event handlers, moved from the claude.ai artifact
// (reference/worm-bin-logbook-artifact.html). Logic lives in domain.js, data access in store.js.
import * as D from "./domain.js";
import { put as storePut, del as storeDel } from "./store.js";
import { signOut } from "./auth.js";

const {DEF,dayKey,daysBetween,ago,bName,bShort}=D;
const EMOJIS=["🪣","🪱","🍌","🥬","🍂","🌿","🍅","🥕","🍉","🍍","🥚","☕","📦","🌱","🍄","🌻","🌳","🏺","🧺","🟤","⭐","💧","🔥","🐛"];
const COLORS=["#e9d8bf","#d6e6c6","#c9dcea","#f2d4c4","#e8cfe6","#f3e7a8","#d9d1c7","#bfe0d6"];
const STATUS_LABEL={filling:"Filling",resting:"Resting",ready:"Ready",feeding:"Feeding",used:"Used"};
const SCRAP_CHIPS=["Fruit peels","Veg scraps","Banana peels","Rice","Coffee grounds","Eggshells","Cardboard","Paper","Dry leaves","Sawdust"];
const BROWNS=["Cardboard","Paper","Dry leaves","Sawdust"];
const LINE_COLORS=["#b9751f","#3e6a8a","#7a3f80","#4c7a39","#b0412c"];

const freshState=()=>({batches:{},events:{},settings:{...DEF},bin:{name:"Worm bin",avatar:{emoji:"🪱",color:"#d6e6c6"}}});
let S=freshState();
let mode="loading", online=navigator.onLine, signedIn=false, userEmail="", tab="home", note="";
let histFilter="all", pendingDel=null, chartRange=30;

// ---------- utils ----------
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fmtWhen=ts=>new Date(ts).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const localInput=d=>{d=d?new Date(d):new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16)};
const num=v=>{if(v===""||v==null)return null;const n=parseFloat(v);return isNaN(n)?null:n};
let toastT;
function toast(msg){clearTimeout(toastT);let t=$(".toast");if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t)}t.textContent=msg;toastT=setTimeout(()=>t.remove(),2600)}
const set=()=>D.settingsOf(S);

// ---------- data access ----------
// Update local state and screen at once; Firestore syncs in the background (also offline).
function handleErr(e){
  const c=e&&e.code;
  if(c==="resource-exhausted")toast("Storage is full — delete some old entries.");
  else if(c==="permission-denied")toast("Not allowed — sign out and back in.");
  else toast("Couldn't save. Try again in a moment.");
}
function put(coll,id,obj){
  if(coll==="batches")S.batches[id]={...obj,id};
  else if(coll==="events")S.events[id]={...obj,id};
  else if(coll==="config"&&id==="settings")S.settings=obj;
  else if(coll==="config"&&id==="bin")S.bin=obj;
  render();
  storePut(coll,id,obj).catch(handleErr);
  return Promise.resolve();
}
function del(coll,id){
  if(coll==="batches")delete S.batches[id];else if(coll==="events")delete S.events[id];
  render();
  storeDel(coll,id).catch(handleErr);
  return Promise.resolve();
}
const strip=o=>{const c={...o};delete c.id;return c};
function logEvent(ev){const id=uid();return put("events",id,{...ev,ts:ev.ts||new Date().toISOString(),day:dayKey(ev.ts||new Date())})}

// ---------- domain, bound to the current state ----------
const batches=()=>D.batches(S), events=()=>D.events(S), active=()=>D.active(S);
const lastStir=b=>D.lastStir(S,b), readiness=b=>D.readiness(S,b), alerts=()=>D.alerts(S);

function avatarHtml(a,cls){
  a=a||{};const bg=a.color||"#e9d8bf";
  if(a.mode==="photo"&&a.photo)return `<div class="av ${cls||""}" style="background:${esc(bg)}"><img alt="" src="${esc(a.photo)}"></div>`;
  return `<div class="av ${cls||""}" style="background:${esc(bg)}">${esc(a.emoji||"🪣")}</div>`;
}

// ---------- render ----------
let renderPending=false;
const editing=()=>{const a=document.activeElement;return !!(a&&a.closest&&a.closest("#app form"))};
function softRender(){if(!signedIn)return;if(editing()){renderPending=true;return}render()}
document.addEventListener("focusout",()=>setTimeout(()=>{if(renderPending&&!editing()){renderPending=false;render()}},0));
function render(){
  renderPending=false;
  const app=$("#app");
  let h=`<div class="wrap"><header class="top">${avatarHtml(S.bin.avatar)}<div class="grow"><h1>${esc(S.bin.name||"Worm bin")}</h1><div class="sub">Worm Bin Logbook</div></div></header>`;
  if(mode==="loading")h+=`<div class="banner">Loading your logbook…</div>`;
  if(!online)h+=`<div class="banner">Offline — changes will sync</div>`;
  if(note)h+=`<div class="banner">${esc(note)}</div>`;
  h+=({home:viewHome,log:viewLog,batches:viewBatches,history:viewHistory,settings:viewSettings}[tab]||viewHome)();
  h+=`</div><nav class="tabs"><div class="in">${[["home","🏠","Home"],["log","➕","Log"],["batches","🪣","Batches"],["history","📈","History"],["settings","⚙️","Settings"]].map(([k,e,l])=>`<button data-tab="${k}" class="${tab===k?"on":""}"><span class="e">${e}</span>${l}</button>`).join("")}</div></nav>`;
  app.innerHTML=h;
  if(tab==="history")drawChart();
}

function quickButtons(){
  return `<div class="quick">
  <button data-act="check"><span class="e">🌡️</span><b>Daily check</b><span>Temps, moisture, stir</span></button>
  <button data-act="scraps"><span class="e">🍌</span><b>Add scraps</b><span>To a filling batch</span></button>
  <button data-act="feed"><span class="e">🪱</span><b>Feed worms</b><span>From a ready batch</span></button>
  <button data-act="harvest"><span class="e">🧺</span><b>Harvest</b><span>Castings / worm weight</span></button>
  <button data-act="newbatch"><span class="e">🪣</span><b>New batch</b><span>Start a bucket</span></button>
  <button data-act="note"><span class="e">📝</span><b>Note</b><span>Anything else</span></button></div>`;
}

function viewHome(){
  const checks=events().filter(e=>e.type==="check");
  const lastBin=checks.find(e=>e.binTemp!=null);
  const lastFeed=events().find(e=>e.type==="feed");
  const lastH=events().find(e=>e.type==="harvest"&&e.wormKg!=null);
  let h=`<div class="stats">
    <div class="stat"><div class="v">${lastBin?lastBin.binTemp+"°":"—"}</div><div class="l">Bin temp${lastBin?" · "+ago(lastBin.ts):""}</div></div>
    <div class="stat"><div class="v">${lastFeed?(daysBetween(lastFeed.ts,new Date())+"d"):"—"}</div><div class="l">Since last feed</div></div>
    <div class="stat"><div class="v">${lastH?lastH.wormKg+"kg":"—"}</div><div class="l">Worms${lastH?" · "+ago(lastH.ts):""}</div></div></div>`;
  const al=alerts();
  h+=`<h2>Needs attention</h2>`;
  if(!al.length)h+=`<div class="alert good"><span class="ic">🌿</span><div><b>All good</b>Nothing needs you right now.</div></div>`;
  for(const a of al){
    let btn="";
    if(a.act==="check")btn=`<button class="btn sm" data-act="check">Log check</button>`;
    else if(a.act==="newbatch")btn=`<button class="btn sm" data-act="newbatch">New batch</button>`;
    else if(a.act&&a.act.startsWith("ready:"))btn=`<button class="btn sm leaf" data-status="ready" data-id="${a.act.slice(6)}">Confirm ready</button>`;
    h+=`<div class="alert ${a.k}">${a.av?avatarHtml(a.av,"xs"):`<span class="ic">${a.ic}</span>`}<div class="grow"><b>${esc(a.t)}</b>${esc(a.d)}${btn?`<div>${btn}</div>`:""}</div></div>`;
  }
  h+=`<h2>Quick log</h2>`+quickButtons();
  const act=active();
  h+=`<h2>Active batches</h2>`;
  if(!act.length)h+=`<div class="card empty"><div class="e">🪣</div>No batches yet.<div class="actions" style="justify-content:center"><button class="btn" data-act="newbatch">Start your first batch</button></div></div>`;
  else h+=act.map(batchCard).join("");
  return h;
}

function batchCard(b){
  let extra="";
  if(b.status==="resting"){
    const r=readiness(b);
    extra=`<div class="small" style="margin-top:6px">${r.ready?"<b style='color:var(--leaf)'>Looks ready</b>":`Readiness ${r.count}/${r.need}`}${r.latest?` · last ${r.latest.temp}°C${r.latest.bin!=null?" (bin "+r.latest.bin+"°C)":""}`:""}</div>
    <div class="progress"><i style="width:${Math.round(r.count/r.need*100)}%"></i></div>${r.reason?`<div class="small muted" style="margin-top:4px">${esc(r.reason)}</div>`:""}`;
  }else if(b.status==="filling"){
    const n=events().filter(e=>e.type==="scraps"&&e.batchId===b.id).length;
    extra=`<div class="small muted" style="margin-top:4px">${n} addition${n===1?"":"s"} · last added ${ago(b.lastAddedAt)} · stirred ${ago(lastStir(b))}</div>`;
  }else if(b.status==="feeding"){
    extra=`<div class="small muted" style="margin-top:4px">Feeding since ${ago(b.feedStartAt)}</div>`;
  }else if(b.status==="ready"){
    extra=`<div class="small muted" style="margin-top:4px">Ready since ${ago(b.readyAt)}</div>`;
  }
  return `<div class="card" data-open="${b.id}" style="cursor:pointer"><div class="row">${avatarHtml(b.avatar)}<div class="grow"><div class="row" style="gap:8px"><h3 class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(bName(b))}</h3><span class="pill ${b.status}">${STATUS_LABEL[b.status]}</span></div><div class="small muted">${esc(b.container||"Container not set")} · started ${ago(b.createdAt)}</div></div></div>${extra}</div>`;
}

function viewLog(){return `<h2>What did you do?</h2>`+quickButtons()+`<h2>Recent</h2>`+timeline(events().slice(0,8))}

function viewBatches(){
  const all=batches();
  let h=`<div class="row" style="margin-top:12px"><h2 class="grow" style="margin:0">Batches</h2><button class="btn sm" data-act="newbatch">+ New batch</button></div><div style="height:10px"></div>`;
  if(!all.length)return h+`<div class="card empty"><div class="e">🪣</div>No batches yet.</div>`;
  const order=["filling","resting","ready","feeding","used"];
  for(const s of order){const list=all.filter(b=>b.status===s);if(!list.length)continue;h+=`<div class="small muted" style="margin:14px 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">${STATUS_LABEL[s]}</div>`+list.map(batchCard).join("")}
  return h;
}

function describe(e){
  const b=S.batches[e.batchId];
  switch(e.type){
    case"scraps":return `🍌 Added scraps to <b>${esc(bShort(b))}</b>${e.items?": "+esc(e.items):""}${e.browns?" · + browns":""}${e.mixed?" · mixed in":""}`;
    case"check":{
      let s=`🌡️ Check${e.binTemp!=null?" · bin <b>"+e.binTemp+"°C</b>":""}${e.moisture?" · "+esc(e.moisture):""}${e.activity?" · worms "+esc(e.activity):""}`;
      if(Array.isArray(e.batches))for(const r of e.batches){const bb=S.batches[r.id];if(r.temp==null&&!r.smell&&!r.stirred)continue;s+=`<br><span class="small">${esc(bShort(bb))}: ${r.temp!=null?r.temp+"°C ":""}${r.smell?esc(r.smell)+" ":""}${r.stirred?"· stirred":""}</span>`}
      return s}
    case"feed":return `🪱 Fed worms from <b>${esc(bShort(b))}</b>${e.finished?" · batch finished":""}`;
    case"harvest":return `🧺 Harvest${e.castingsKg!=null?" · castings "+e.castingsKg+" kg":""}${e.wormKg!=null?" · worms "+e.wormKg+" kg":""}`;
    case"status":return `🔁 <b>${esc(bShort(b))}</b> → ${STATUS_LABEL[e.to]||esc(e.to)}`;
    case"created":return `🪣 Started <b>${esc(bShort(b))}</b>${e.container?" in "+esc(e.container):""}`;
    default:return `📝 Note`;
  }
}
function timeline(list){
  if(!list.length)return `<div class="card empty"><div class="e">📓</div>Nothing logged yet.</div>`;
  return `<div class="card"><div class="tl">${list.map(e=>`<div class="it"><button class="del" data-del="${e.id}">${pendingDel===e.id?"Tap again to delete":"Delete"}</button><div class="when">${fmtWhen(e.ts)}</div><div>${describe(e)}</div>${e.notes?`<div class="small muted">${esc(e.notes)}</div>`:""}</div>`).join("")}</div></div>`;
}

function viewHistory(){
  const bs=batches();
  let h=`<h2>Temperatures</h2><div class="card"><div class="seg" style="margin-bottom:10px">${[14,30,90].map(n=>`<button data-range="${n}" class="${chartRange===n?"on":""}">${n} days</button>`).join("")}</div><div id="chart"></div></div>`;
  h+=`<h2>Timeline</h2><div class="filters"><button class="chip ${histFilter==="all"?"on":""}" data-hf="all">All</button>${["check","scraps","feed","harvest","status","note"].map(t=>`<button class="chip ${histFilter===t?"on":""}" data-hf="${t}">${{check:"Checks",scraps:"Scraps",feed:"Feeding",harvest:"Harvests",status:"Status",note:"Notes"}[t]}</button>`).join("")}${bs.map(b=>`<button class="chip ${histFilter==="b:"+b.id?"on":""}" data-hf="b:${b.id}">${esc(bShort(b))}</button>`).join("")}</div>`;
  let list=events();
  if(histFilter.startsWith("b:")){const id=histFilter.slice(2);list=list.filter(e=>e.batchId===id||(e.type==="check"&&Array.isArray(e.batches)&&e.batches.some(r=>r.id===id&&(r.temp!=null||r.smell||r.stirred))))}
  else if(histFilter!=="all")list=list.filter(e=>histFilter==="status"?(e.type==="status"||e.type==="created"):e.type===histFilter);
  return h+timeline(list.slice(0,200));
}

function drawChart(){
  const el=$("#chart");if(!el)return;
  const from=new Date();from.setDate(from.getDate()-chartRange+1);const fromKey=dayKey(from);
  const checks=events().filter(e=>e.type==="check"&&(e.day||dayKey(e.ts))>=fromKey).reverse();
  const series=[];
  const bin=checks.filter(e=>e.binTemp!=null).map(e=>({t:new Date(e.ts),v:e.binTemp}));
  series.push({name:esc(S.bin.name||"Worm bin"),color:"#4c7a39",pts:bin,w:3});
  const byB={};
  for(const e of checks)if(Array.isArray(e.batches))for(const r of e.batches)if(r.temp!=null)(byB[r.id]=byB[r.id]||[]).push({t:new Date(e.ts),v:r.temp});
  Object.keys(byB).slice(0,5).forEach((id,i)=>series.push({name:esc(bShort(S.batches[id])),color:LINE_COLORS[i%LINE_COLORS.length],pts:byB[id],w:2}));
  const all=series.flatMap(s=>s.pts);
  if(!all.length){el.innerHTML=`<div class="empty small">No temperature readings in this range yet.</div>`;return}
  const W=380,H=220,P={l:32,r:8,t:10,b:24};
  const t0=new Date(fromKey+"T00:00").getTime(),t1=Date.now();
  const st=set();
  let vmin=Math.min(...all.map(p=>p.v),st.maxTemp-6),vmax=Math.max(...all.map(p=>p.v),st.maxTemp+2);
  vmin=Math.floor(vmin/2)*2;vmax=Math.ceil(vmax/2)*2;
  const x=t=>P.l+(t-t0)/(t1-t0||1)*(W-P.l-P.r),y=v=>P.t+(vmax-v)/(vmax-vmin||1)*(H-P.t-P.b);
  let g="";
  for(let v=vmin;v<=vmax;v+=Math.max(2,Math.round((vmax-vmin)/5/2)*2)){g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e6dccb"/><text x="${P.l-6}" y="${y(v)+4}" font-size="11" text-anchor="end" fill="#7a6a58">${v}°</text>`}
  g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(st.maxTemp)}" y2="${y(st.maxTemp)}" stroke="#b0412c" stroke-dasharray="4 4"/><text x="${W-P.r}" y="${y(st.maxTemp)-4}" font-size="10" text-anchor="end" fill="#b0412c">${st.maxTemp}°C limit</text>`;
  const ticks=4;for(let i=0;i<=ticks;i++){const t=t0+(t1-t0)*i/ticks;g+=`<text x="${x(t)}" y="${H-6}" font-size="10" text-anchor="${i===0?"start":i===ticks?"end":"middle"}" fill="#7a6a58">${new Date(t).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</text>`}
  for(const s of series){if(!s.pts.length)continue;
    if(s.pts.length>1)g+=`<polyline fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-linejoin="round" points="${s.pts.map(p=>x(p.t)+","+y(p.v)).join(" ")}"/>`;
    g+=s.pts.map(p=>`<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3" fill="${s.color}"><title>${s.name}: ${p.v}°C · ${p.t.toLocaleDateString()}</title></circle>`).join("")}
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Temperature chart">${g}</svg><div class="legend">${series.filter(s=>s.pts.length).map(s=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`;
}

function viewSettings(){
  const st=set();
  return `<h2>Worm bin</h2><div class="card"><div class="row">${avatarHtml(S.bin.avatar)}<div class="grow"><b>${esc(S.bin.name||"Worm bin")}</b><div class="small muted">Your ANC bin</div></div><button class="btn sm ghost" data-act="editbin">Edit</button></div></div>
  <h2>Ready rule</h2><form class="card" data-form="settings">
  <div class="small muted">A resting batch "looks ready" when its last N daily readings are each at or below the limit, within the spread of the worm bin temp, steady, and not sour.</div>
  <div class="two"><div><label class="f">Readings needed</label><input type="number" name="readings" min="1" max="10" value="${st.readings}"></div>
  <div><label class="f">Spread (°C)</label><input type="number" step="0.5" name="spread" min="0.5" value="${st.spread}"></div>
  <div><label class="f">Temp limit (°C)</label><input type="number" step="0.5" name="maxTemp" value="${st.maxTemp}"></div>
  <div><label class="f">Stir every (days)</label><input type="number" name="stirDays" min="1" value="${st.stirDays}"></div>
  <div><label class="f">Check-in reminder (days)</label><input type="number" name="checkinDays" min="1" value="${st.checkinDays}"></div></div>
  <div class="actions"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-act="resetsettings">Reset defaults</button></div></form>
  <h2>Your data</h2><div class="card"><div class="small muted">${Object.keys(S.batches).length} batches · ${Object.keys(S.events).length} log entries · synced to your account</div><div class="actions"><button class="btn ghost sm" data-act="copyjson">Copy all data (JSON)</button></div></div>
  <h2>Account</h2><div class="card"><div class="row"><div class="grow small">Signed in as <b>${esc(userEmail)}</b></div><button class="btn ghost sm" data-act="signout">Sign out</button></div></div>`;
}

// ---------- sheets / forms ----------
function openSheet(title,body){
  $("#sheet-root").innerHTML=`<div class="sheet-bg" data-close="1"><div class="sheet" role="dialog" aria-label="${esc(title)}"><header><h2 style="margin:0">${title}</h2><button class="x" data-close="1" aria-label="Close">×</button></header>${body}</div></div>`;
}
function closeSheet(){$("#sheet-root").innerHTML="";avatarDraft=null}
const whenField=()=>`<label class="f">When</label><input type="datetime-local" name="when" value="${localInput()}">`;
const opts=(list,sel)=>list.map(([v,l])=>`<option value="${esc(v)}" ${v===sel?"selected":""}>${esc(l)}</option>`).join("");

function sheetCheck(){
  const bs=active().filter(b=>b.status==="filling"||b.status==="resting"||b.status==="ready");
  openSheet("🌡️ Daily check",`<form data-form="check">
  <div class="sub-card"><div class="row">${avatarHtml(S.bin.avatar,"xs")}<b>${esc(S.bin.name||"Worm bin")}</b></div>
  <label class="f">Bin temp (°C)</label><input type="number" step="0.1" inputmode="decimal" name="binTemp" placeholder="e.g. 27">
  <label class="f">Moisture</label><div class="seg" data-seg="moisture">${["dry","good","wet"].map(v=>`<button type="button" data-v="${v}">${v}</button>`).join("")}</div>
  <label class="f">Worm activity</label><div class="seg" data-seg="activity">${["lively","normal","sluggish","escaping"].map(v=>`<button type="button" data-v="${v}">${v}</button>`).join("")}</div></div>
  ${bs.map(b=>`<div class="sub-card" data-bid="${b.id}"><div class="row">${avatarHtml(b.avatar,"xs")}<b class="grow">${esc(bName(b))}</b><span class="pill ${b.status}">${STATUS_LABEL[b.status]}</span></div>
  <label class="f">Temp (°C)</label><input type="number" step="0.1" inputmode="decimal" name="t_${b.id}" placeholder="Middle of the batch">
  <label class="f">Smell</label><div class="seg" data-seg="s_${b.id}">${["earthy","mild","sour","ammonia"].map(v=>`<button type="button" data-v="${v}">${v}</button>`).join("")}</div>
  <label class="chk"><input type="checkbox" name="st_${b.id}"> Stirred it</label></div>`).join("")}
  ${whenField()}<label class="f">Notes</label><textarea name="notes" placeholder="Optional"></textarea>
  <div class="actions"><button class="btn" type="submit">Save check</button></div></form>`);
}
function sheetScraps(){
  const fill=active().filter(b=>b.status==="filling");
  if(!fill.length){openSheet("🍌 Add scraps",`<div class="empty">No batch is filling.<div class="actions" style="justify-content:center"><button class="btn" data-act="newbatch">Start a new batch</button></div></div>`);return}
  openSheet("🍌 Add scraps",`<form data-form="scraps"><label class="f">Batch</label><select name="batchId">${opts(fill.map(b=>[b.id,bName(b)]))}</select>
  <label class="f">What went in</label><div class="chips" data-chips="items">${SCRAP_CHIPS.map(c=>`<button type="button" class="chip" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>
  <input type="text" name="itemsExtra" placeholder="Other (comma separated)" style="margin-top:8px">
  <label class="chk"><input type="checkbox" name="browns"> Added browns (cardboard, paper, dry leaves)</label>
  <label class="chk"><input type="checkbox" name="mixed"> Mixed it in (counts as a stir)</label>
  ${whenField()}<label class="f">Notes</label><textarea name="notes" placeholder="Optional"></textarea>
  <div class="actions"><button class="btn" type="submit">Save</button></div></form>`);
}
function sheetFeed(){
  const list=active().filter(b=>b.status==="ready"||b.status==="feeding");
  if(!list.length){openSheet("🪱 Feed worms",`<div class="empty">No batch is ready yet.<br><span class="small">Confirm a resting batch as ready first.</span></div>`);return}
  openSheet("🪱 Feed worms",`<form data-form="feed"><label class="f">From batch</label><select name="batchId">${opts(list.map(b=>[b.id,bName(b)+" · "+STATUS_LABEL[b.status]]))}</select>
  <label class="chk"><input type="checkbox" name="finished"> This batch is now used up</label>
  ${whenField()}<label class="f">Notes</label><textarea name="notes" placeholder="Optional"></textarea>
  <div class="actions"><button class="btn" type="submit">Save</button></div></form>`);
}
function sheetHarvest(){
  openSheet("🧺 Harvest",`<form data-form="harvest"><div class="two"><div><label class="f">Castings (kg)</label><input type="number" step="0.01" inputmode="decimal" name="castingsKg"></div><div><label class="f">Worm weight (kg)</label><input type="number" step="0.01" inputmode="decimal" name="wormKg"></div></div>
  ${whenField()}<label class="f">Notes</label><textarea name="notes" placeholder="Optional"></textarea><div class="actions"><button class="btn" type="submit">Save</button></div></form>`);
}
function sheetNote(){openSheet("📝 Note",`<form data-form="note"><textarea name="notes" required placeholder="What happened?"></textarea>${whenField()}<div class="actions"><button class="btn" type="submit">Save</button></div></form>`)}

// avatar editor
let avatarDraft=null;
function avatarEditor(a){
  avatarDraft={mode:"emoji",emoji:"🪣",color:COLORS[0],...(a||{})};
  return `<label class="f">Avatar</label><div class="row" style="align-items:flex-start"><div id="av-preview">${avatarHtml(avatarDraft,"lg")}</div><div class="grow"><div class="seg" data-avmode>${["emoji","photo"].map(m=>`<button type="button" data-m="${m}" class="${avatarDraft.mode===m?"on":""}">${m==="emoji"?"Emoji":"Photo"}</button>`).join("")}</div>
  <div style="margin-top:8px" class="actions"><label class="btn ghost sm" style="display:inline-block">📷 Choose photo<input type="file" accept="image/*" data-photo hidden></label>${avatarDraft.photo?`<button type="button" class="btn ghost sm" data-rmphoto>Remove photo</button>`:""}</div></div></div>
  <label class="f">Emoji</label><div class="emoji-grid">${EMOJIS.map(e=>`<button type="button" data-emoji="${e}" class="${avatarDraft.emoji===e?"on":""}">${e}</button>`).join("")}</div>
  <label class="f">Color</label><div class="colors">${COLORS.map(c=>`<button type="button" data-color="${c}" style="background:${c}" class="${avatarDraft.color===c?"on":""}" aria-label="color"></button>`).join("")}</div>`;
}
function refreshAvatarUI(){
  const p=$("#av-preview");if(p)p.innerHTML=avatarHtml(avatarDraft,"lg");
  document.querySelectorAll("[data-avmode] button").forEach(b=>b.classList.toggle("on",b.dataset.m===avatarDraft.mode));
  document.querySelectorAll("[data-emoji]").forEach(b=>b.classList.toggle("on",b.dataset.emoji===avatarDraft.emoji));
  document.querySelectorAll("[data-color]").forEach(b=>b.classList.toggle("on",b.dataset.color===avatarDraft.color));
}
function shrinkPhoto(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{const S2=192,c=document.createElement("canvas");c.width=c.height=S2;const k=c.getContext("2d");
      const s=Math.min(img.width,img.height);k.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,S2,S2);
      URL.revokeObjectURL(url);res(c.toDataURL("image/jpeg",.78))};
    img.onerror=()=>{URL.revokeObjectURL(url);rej()};img.src=url;
  });
}

function sheetNewBatch(b){
  const containers=[...new Set(batches().map(x=>x.container).filter(Boolean))];
  const from=batches().filter(x=>x.status==="used"||x.status==="feeding"||x.status==="ready");
  const editing=!!b;
  openSheet(editing?"Edit "+esc(bName(b)):"🪣 New batch",`<form data-form="${editing?"editbatch":"newbatch"}" ${editing?`data-id="${b.id}"`:""}>
  ${avatarEditor(b&&b.avatar)}
  <label class="f">Nickname (optional)</label><input type="text" name="nickname" value="${esc(b&&b.nickname||"")}" placeholder="e.g. Blue Pail">
  <label class="f">Container</label><input type="text" name="container" list="containers" value="${esc(b&&b.container||"")}" placeholder="e.g. 3-gal bucket with holes"><datalist id="containers">${containers.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
  ${editing?"":`<label class="f">Started with precompost from (optional)</label><select name="startedFrom"><option value="">— none —</option>${opts(from.map(x=>[x.id,bName(x)]))}</select>${whenField()}`}
  <label class="f">Notes</label><textarea name="notes">${esc(b&&b.notes||"")}</textarea>
  <div class="actions"><button class="btn" type="submit">${editing?"Save":"Start batch"}</button></div></form>`);
}
function sheetEditBin(){
  openSheet("Edit worm bin",`<form data-form="bin">${avatarEditor(S.bin.avatar)}<label class="f">Name</label><input type="text" name="name" value="${esc(S.bin.name||"Worm bin")}"><div class="actions"><button class="btn" type="submit">Save</button></div></form>`);
}
function sheetBatch(id){
  const b=S.batches[id];if(!b)return;
  const next={filling:[["resting","Mark full → Resting"]],resting:[["ready","Confirm ready"],["filling","Back to filling"]],ready:[["feeding","Start feeding"],["resting","Back to resting"]],feeding:[["used","Mark used up"]],used:[["feeding","Back to feeding"]]}[b.status]||[];
  let info="";
  if(b.status==="resting"){const r=readiness(b);info=`<div class="sub-card"><b>Readiness ${r.count}/${r.need}</b><div class="progress"><i style="width:${r.count/r.need*100}%"></i></div><div class="small muted" style="margin-top:6px">${r.ready?"Steady and safe — check it smells earthy, then confirm.":esc(r.reason)}</div></div>`}
  const from=b.startedFrom&&S.batches[b.startedFrom];
  const evs=events().filter(e=>e.batchId===id||(e.type==="check"&&Array.isArray(e.batches)&&e.batches.some(r=>r.id===id&&(r.temp!=null||r.smell||r.stirred))));
  openSheet(esc(bName(b)),`<div class="row">${avatarHtml(b.avatar,"lg")}<div class="grow"><span class="pill ${b.status}">${STATUS_LABEL[b.status]}</span><div class="small muted" style="margin-top:4px">${esc(b.container||"Container not set")}<br>Started ${fmtWhen(b.createdAt)}${from?"<br>From "+esc(bName(from)):""}</div></div></div>
  ${info}${b.notes?`<div class="small" style="margin-top:10px">${esc(b.notes)}</div>`:""}
  <div class="actions">${next.map(([s,l],i)=>`<button class="btn ${i===0?"":"ghost"} sm" data-status="${s}" data-id="${id}">${l}</button>`).join("")}<button class="btn ghost sm" data-editbatch="${id}">Edit / avatar</button><button class="btn danger sm" data-delbatch="${id}">${pendingDel==="b"+id?"Tap again to delete":"Delete"}</button></div>
  <h3 style="margin:18px 0 8px">History</h3>${timeline(evs)}`);
}

async function setStatus(id,to){
  const b=S.batches[id];if(!b||b.status===to)return;
  const now=new Date().toISOString(),u={...strip(b),status:to};
  if(to==="resting")u.restStartedAt=now;
  if(to==="ready")u.readyAt=now;
  if(to==="feeding"&&!u.feedStartAt)u.feedStartAt=now;
  if(to==="used")u.usedAt=now;
  await put("batches",id,u);
  await logEvent({type:"status",batchId:id,from:b.status,to});
  toast(bShort(b)+" → "+STATUS_LABEL[to]);
}

function segVal(form,name){const b=form.querySelector(`[data-seg="${name}"] button.on`);return b?b.dataset.v:null}
function whenTs(form){const v=form.when&&form.when.value;return v?new Date(v).toISOString():new Date().toISOString()}

async function submit(form){
  const k=form.dataset.form,fd=new FormData(form),ts=whenTs(form),notes=(fd.get("notes")||"").toString().trim();
  if(k==="check"){
    const rows=[];form.querySelectorAll("[data-bid]").forEach(el=>{const id=el.dataset.bid;const t=num(fd.get("t_"+id)),sm=segVal(form,"s_"+id),stv=!!fd.get("st_"+id);if(t!=null||sm||stv)rows.push({id,temp:t,smell:sm,stirred:stv})});
    const ev={type:"check",ts,binTemp:num(fd.get("binTemp")),moisture:segVal(form,"moisture"),activity:segVal(form,"activity"),batches:rows,notes};
    if(ev.binTemp==null&&!ev.moisture&&!ev.activity&&!rows.length&&!notes){toast("Fill in at least one thing.");return}
    closeSheet();await logEvent(ev);toast("Check saved");
  }else if(k==="scraps"){
    const items=[...form.querySelectorAll('[data-chips="items"] .chip.on')].map(b=>b.dataset.v);
    const extra=(fd.get("itemsExtra")||"").toString().split(",").map(s=>s.trim()).filter(Boolean);
    const all=[...items,...extra];
    const browns=!!fd.get("browns")||all.some(i=>BROWNS.includes(i));
    const id=fd.get("batchId");
    closeSheet();
    await logEvent({type:"scraps",ts,batchId:id,items:all.join(", "),browns,mixed:!!fd.get("mixed"),notes});
    const b=S.batches[id];if(b&&(!b.lastAddedAt||ts>b.lastAddedAt))await put("batches",id,{...strip(b),lastAddedAt:ts});
    toast("Scraps logged");
  }else if(k==="feed"){
    const id=fd.get("batchId"),fin=!!fd.get("finished");closeSheet();
    await logEvent({type:"feed",ts,batchId:id,finished:fin,notes});
    const b=S.batches[id];
    if(b){const u={...strip(b),status:fin?"used":"feeding"};if(!u.feedStartAt)u.feedStartAt=ts;if(fin)u.usedAt=ts;await put("batches",id,u)}
    toast("Feeding logged");
  }else if(k==="harvest"){
    const c=num(fd.get("castingsKg")),w=num(fd.get("wormKg"));if(c==null&&w==null&&!notes){toast("Add castings or worm weight.");return}
    closeSheet();await logEvent({type:"harvest",ts,castingsKg:c,wormKg:w,notes});toast("Harvest logged");
  }else if(k==="note"){closeSheet();await logEvent({type:"note",ts,notes});toast("Note saved")}
  else if(k==="newbatch"){
    const n=Math.max(0,...batches().map(b=>b.num||0))+1,id=uid();
    const b={num:n,nickname:(fd.get("nickname")||"").toString().trim(),container:(fd.get("container")||"").toString().trim(),startedFrom:fd.get("startedFrom")||"",notes,status:"filling",createdAt:ts,avatar:{...avatarDraft}};
    closeSheet();await put("batches",id,b);await logEvent({type:"created",ts,batchId:id,container:b.container});toast("Batch #"+n+" started");
  }else if(k==="editbatch"){
    const id=form.dataset.id,b=S.batches[id];if(!b)return;
    const u={...strip(b),nickname:(fd.get("nickname")||"").toString().trim(),container:(fd.get("container")||"").toString().trim(),notes,avatar:{...avatarDraft}};
    closeSheet();await put("batches",id,u);toast("Saved");
  }else if(k==="bin"){
    const u={name:(fd.get("name")||"").toString().trim()||"Worm bin",avatar:{...avatarDraft}};closeSheet();await put("config","bin",u);toast("Saved");
  }else if(k==="settings"){
    const o={};for(const key of Object.keys(DEF)){const v=num(fd.get(key));o[key]=v!=null&&v>0?v:DEF[key]}
    await put("config","settings",o);toast("Settings saved");
  }
}

// ---------- events ----------
document.addEventListener("click",async ev=>{
  const t=ev.target.closest("button,[data-open],[data-close],label");if(!t)return;
  if(t.dataset.close&&ev.target===t){closeSheet();return}
  if(t.dataset.tab){tab=t.dataset.tab;pendingDel=null;render();window.scrollTo(0,0);return}
  const act=t.dataset.act;
  if(act){({check:sheetCheck,scraps:sheetScraps,feed:sheetFeed,harvest:sheetHarvest,note:sheetNote,newbatch:()=>{if(mode==="loading"){toast("Still loading your logbook — try again in a moment.");return}sheetNewBatch()},editbin:sheetEditBin,
    resetsettings:()=>put("config","settings",{...DEF}).then(()=>toast("Defaults restored")),
    signout:()=>{if(!navigator.onLine&&!confirm("You're offline. You won't be able to sign back in until you're online. Sign out anyway?"))return;signOut()},
    copyjson:async()=>{try{await navigator.clipboard.writeText(JSON.stringify({bin:S.bin,settings:set(),batches:Object.values(S.batches),events:events()},null,2));toast("Copied")}catch(e){toast("Copy not allowed here")}}}[act]||(()=>{}))();return}
  if(t.dataset.open){sheetBatch(t.dataset.open);return}
  if(t.dataset.status){const id=t.dataset.id;await setStatus(id,t.dataset.status);if($(".sheet"))sheetBatch(id);return}
  if(t.dataset.editbatch){sheetNewBatch(S.batches[t.dataset.editbatch]);return}
  if(t.dataset.delbatch){const id=t.dataset.delbatch;if(pendingDel==="b"+id){pendingDel=null;closeSheet();await del("batches",id);toast("Batch deleted")}else{pendingDel="b"+id;sheetBatch(id)}return}
  if(t.dataset.del){const id=t.dataset.del;if(pendingDel===id){pendingDel=null;await del("events",id);toast("Deleted");const sh=$(".sheet [data-delbatch]");if(sh)sheetBatch(sh.dataset.delbatch)}else{pendingDel=id;const sh=$(".sheet [data-delbatch]");if(sh)sheetBatch(sh.dataset.delbatch);else render()}return}
  if(t.dataset.hf){histFilter=t.dataset.hf;render();return}
  if(t.dataset.range){chartRange=+t.dataset.range;render();return}
  if(t.parentElement&&t.parentElement.dataset.seg!=null){const on=t.classList.contains("on");t.parentElement.querySelectorAll("button").forEach(b=>b.classList.remove("on"));if(!on)t.classList.add("on");return}
  if(t.parentElement&&t.parentElement.dataset.chips!=null){t.classList.toggle("on");return}
  if(t.dataset.m&&avatarDraft){if(t.dataset.m==="photo"&&!avatarDraft.photo){const inp=$("[data-photo]");if(inp)inp.click();return}avatarDraft.mode=t.dataset.m;refreshAvatarUI();return}
  if(t.dataset.emoji&&avatarDraft){avatarDraft.emoji=t.dataset.emoji;avatarDraft.mode="emoji";refreshAvatarUI();return}
  if(t.dataset.color&&avatarDraft){avatarDraft.color=t.dataset.color;refreshAvatarUI();return}
  if(t.hasAttribute&&t.hasAttribute("data-rmphoto")&&avatarDraft){delete avatarDraft.photo;avatarDraft.mode="emoji";refreshAvatarUI();t.remove();return}
});
document.addEventListener("change",async ev=>{
  const inp=ev.target;if(!inp.matches("[data-photo]")||!inp.files||!inp.files[0]||!avatarDraft)return;
  try{avatarDraft.photo=await shrinkPhoto(inp.files[0]);avatarDraft.mode="photo";refreshAvatarUI()}catch(e){toast("Couldn't read that photo")}
});
document.addEventListener("submit",ev=>{const f=ev.target.closest("[data-form]");if(!f)return;ev.preventDefault();submit(f)});
document.addEventListener("keydown",ev=>{if(ev.key==="Escape")closeSheet()});

// ---------- used by main.js ----------
export function showSignIn(err="",email="",busy=false){
  signedIn=false;
  $("#sheet-root").innerHTML="";
  $("#app").innerHTML=`<div class="wrap"><header class="top">${avatarHtml({emoji:"🪱",color:"#d6e6c6"})}<div class="grow"><h1>Worm Bin Logbook</h1><div class="sub">Sign in to sync your logbook</div></div></header>
  <form id="signin" class="card"><label class="f">Email</label><input type="email" name="email" autocomplete="username" required value="${esc(email)}">
  <label class="f">Password</label><input type="password" name="password" autocomplete="current-password" required>
  ${err?`<div class="alert bad" style="margin-top:12px">${esc(err)}</div>`:""}
  <div class="actions"><button class="btn" type="submit" ${busy?"disabled":""}>${busy?"Signing in…":"Sign in"}</button></div></form></div>`;
}
export function showApp(email){signedIn=true;userEmail=email;tab="home";note="";mode="loading";render()}
export function applyData(kind,data){
  if(kind==="batches")S.batches=data;else if(kind==="events")S.events=data;
  else if(kind==="settings")S.settings=data;else if(kind==="bin")S.bin=data;
  if(kind==="batches"||kind==="events")mode="ready";
  softRender();
}
export function setNote(msg){if(note===msg)return;note=msg;softRender()}
export function setOnline(v){online=v;softRender()}
export function clearData(){S=freshState();closeSheet()}
