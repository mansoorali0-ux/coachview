import { useState, useEffect, useRef } from "react";
import { listenToGames, saveGame, deleteGame } from "./firebase";
import { calcStats, makeLVURush, makeCoppermine } from "./stats";
import {
  ADMIN_PIN, HALF, GAME, CUP_HALF, CUP_GAME, ROSTER, DEFAULT_POS,
  UPCOMING, LEAGUE_TEAMS, TOURNAMENT_TEAMS, POSITIONS, POS_COLOR,
  uid, findPlayer
} from "./constants";

// ─── FORMATIONS ───────────────────────────────────────────────────────────────
const FORMATIONS = [
  { id:"4-4-2",  label:"4-4-2",  desc:"Classic, balanced" },
  { id:"4-3-3",  label:"4-3-3",  desc:"Attack minded" },
  { id:"3-5-2",  label:"3-5-2",  desc:"Midfield control" },
  { id:"4-2-3-1",label:"4-2-3-1",desc:"Double pivot" },
  { id:"3-4-3",  label:"3-4-3",  desc:"Attacking wingbacks" },
  { id:"4-1-4-1",label:"4-1-4-1",desc:"Defensive anchor" },
  { id:"5-3-2",  label:"5-3-2",  desc:"Defensive solidity" },
  { id:"4-5-1",  label:"4-5-1",  desc:"Counter attack" },
];


// ─── THEME ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#050b16",
  card:"#111c2e",
  card2:"#0d1727",
  border:"#223653",
  blue:"#246BFD",
  blue2:"#1B4FD8",
  text:"#eef5ff",
  muted:"#8aa0bd",
  green:"#16a34a",
  red:"#dc2626",
  amber:"#f59e0b",
  purple:"#7c3aed",
};
const T   = { fontFamily:"Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" };
const card = { background:"linear-gradient(180deg,#111c2e,#0d1727)", border:`1px solid ${C.border}`, borderRadius:16, padding:"13px 15px", marginBottom:10, boxShadow:"0 10px 24px rgba(0,0,0,0.18)" };
const btn  = (bg, color="#fff", extra={}) => ({ background:bg, border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, color, fontWeight:800, cursor:"pointer", padding:"14px 16px", fontSize:14, boxShadow:"0 8px 18px rgba(0,0,0,0.18)", ...extra });
const inp  = { width:"100%", padding:14, borderRadius:14, background:"#0b1627", border:`1px solid ${C.border}`, color:C.text, fontSize:16, boxSizing:"border-box", outline:"none" };

// ─── PERSISTENT GAME STATE (localStorage survives navigation & refresh) ───────
const LS_GAME_KEY = "ps_live_game_v2";
function saveGameState(state) {
  try { localStorage.setItem(LS_GAME_KEY, JSON.stringify({ ...state, savedAt: Date.now() })); } catch(e) {}
}
function loadGameState() {
  try {
    const raw = localStorage.getItem(LS_GAME_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Only restore if saved within last 4 hours
    if (Date.now() - s.savedAt > 4 * 60 * 60 * 1000) { localStorage.removeItem(LS_GAME_KEY); return null; }
    return s;
  } catch(e) { return null; }
}
function clearGameState() { try { localStorage.removeItem(LS_GAME_KEY); } catch(e) {} }


// ─── NORMALIZATION HELPERS ───────────────────────────────────────────────────
function normText(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normName(v) {
  return normText(v).replace(/\s+/g, " ");
}
function normOpponent(v) {
  return normText(v)
    .replace(/\b11g\b/g, "")
    .replace(/\baspire\b/g, "")
    .replace(/\bgirls\b/g, "")
    .replace(/\belite\b/g, "")
    .replace(/\bsoccer\b/g, "")
    .replace(/\bclub\b/g, "")
    .replace(/\bfc\b/g, "")
    .replace(/\bblue\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function sameOpponent(a, b) {
  const na = normOpponent(a), nb = normOpponent(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const aTokens = new Set(na.split(" ").filter(t => t.length > 2));
  const bTokens = new Set(nb.split(" ").filter(t => t.length > 2));
  let hits = 0;
  aTokens.forEach(t => { if (bTokens.has(t)) hits++; });
  return hits >= Math.min(2, aTokens.size, bTokens.size);
}
function stableGuestId(name) {
  const key = normName(name).replace(/\s+/g, "_");
  return key ? `G_${key}` : `G_${uid()}`;
}
function uniqueGuestsFromGames(games) {
  const byName = new Map();
  games.flatMap(g => g.guests || []).forEach(g => {
    const key = normName(g.name);
    if (!key) return;
    if (!byName.has(key)) byName.set(key, { ...g, id: stableGuestId(g.name), isGuest: true, num: g.num || "G", pos: g.pos || "MID" });
  });
  return Array.from(byName.values()).sort((a,b)=>a.name.localeCompare(b.name));
}
function canonicalizeGuestPlayers(game) {
  if (!game || !(game.guests || game.allPlayers)) return { game, changed:false };
  const rosterIds = new Set(ROSTER.map(p => String(p.id)));
  const idMap = {};
  const canonicalByName = new Map();
  const guests = [];
  (game.guests || []).forEach(g => {
    const key = normName(g.name);
    if (!key) return;
    const canonicalId = stableGuestId(g.name);
    idMap[String(g.id)] = canonicalId;
    if (!canonicalByName.has(key)) {
      const cg = { ...g, id: canonicalId, num: g.num || "G", pos: g.pos || "MID", isGuest: true };
      canonicalByName.set(key, cg);
      guests.push(cg);
    }
  });
  const mapId = id => idMap[String(id)] || id;
  const events = (game.events || []).map(ev => ({
    ...ev,
    playerOn: ev.playerOn !== undefined ? mapId(ev.playerOn) : ev.playerOn,
    playerOff: ev.playerOff !== undefined ? mapId(ev.playerOff) : ev.playerOff,
    scorer: ev.scorer !== undefined && ev.scorer !== null ? mapId(ev.scorer) : ev.scorer,
    assist: ev.assist !== undefined && ev.assist !== null ? mapId(ev.assist) : ev.assist,
  }));
  const allPlayersById = new Map();
  ROSTER.forEach(p => allPlayersById.set(String(p.id), p));
  (game.allPlayers || []).forEach(p => {
    const id = rosterIds.has(String(p.id)) ? String(p.id) : stableGuestId(p.name);
    if (!allPlayersById.has(id)) allPlayersById.set(id, { ...p, id, num: p.num || "G", pos: p.pos || "MID", isGuest: !rosterIds.has(String(p.id)) });
  });
  guests.forEach(g => allPlayersById.set(String(g.id), g));
  const positions = {};
  Object.entries(game.positions || {}).forEach(([k,v]) => { positions[mapId(k)] = v; });
  const updated = {
    ...game,
    guests,
    allPlayers: Array.from(allPlayersById.values()),
    starting: (game.starting || []).map(mapId),
    secondHalfStarting: game.secondHalfStarting ? game.secondHalfStarting.map(mapId) : game.secondHalfStarting,
    events,
    positions,
  };
  const changed = JSON.stringify(updated.guests) !== JSON.stringify(game.guests || []) ||
    JSON.stringify(updated.events) !== JSON.stringify(game.events || []) ||
    JSON.stringify(updated.starting) !== JSON.stringify(game.starting || []) ||
    JSON.stringify(updated.secondHalfStarting || null) !== JSON.stringify(game.secondHalfStarting || null);
  return { game: updated, changed };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function Lbl({ children, mt }) {
  return <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1, marginBottom:6, marginTop:mt||0, textTransform:"uppercase" }}>{children}</div>;
}
function WinBadge({ gf, ga }) {
  const r = gf>ga?"W":gf<ga?"L":"D";
  const bg = r==="W"?"#059669":r==="L"?C.red:"#d97706";
  return <span style={{ background:bg, color:"#fff", borderRadius:6, padding:"3px 10px", fontSize:13, fontWeight:800 }}>{r}</span>;
}
function Modal({ title, onClose, children }) {
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:C.bg, borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480, maxHeight:"88vh", overflowY:"auto", border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, background:C.bg }}>
          <span style={{ fontWeight:800, fontSize:16, color:C.text }}>{title}</span>
          <button onClick={onClose} style={{ background:C.border, border:"none", color:C.muted, borderRadius:12, width:32, height:32, cursor:"pointer", fontSize:14 }}>✕</button>
        </div>
        <div style={{ padding:"16px 20px" }}>{children}</div>
      </div>
    </div>
  );
}


// ─── UI COMPONENTS ───────────────────────────────────────────────────────────
function PlayerBubble({ player, pos, size=34 }) {
  const label = player?.num || (player?.name ? player.name.slice(0,2).toUpperCase() : "?");
  return (
    <span style={{ width:size, height:size, borderRadius:"50%", background:POS_COLOR[pos]||C.border, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:size>36?13:11, color:"#fff", flexShrink:0, boxShadow:"0 6px 16px rgba(0,0,0,.25)", border:"1px solid rgba(255,255,255,.16)" }}>{label}</span>
  );
}

function FormationField({ players, positions, title, compact=false }) {
  const byPos = { FWD:[], MID:[], DEF:[], GK:[] };
  (players || []).forEach(p => {
    const pos = positions?.[p.id] || positions?.[String(p.id)] || p.pos || "MID";
    (byPos[pos] || byPos.MID).push({ ...p, _pos:pos });
  });
  const rows = [byPos.FWD, byPos.MID, byPos.DEF, byPos.GK];
  return (
    <div style={{ background:"linear-gradient(180deg,#06351f,#052915)", border:"1px solid #14532d", borderRadius:18, padding:compact?10:14, minHeight:compact?260:360, position:"relative", overflow:"hidden", boxShadow:"inset 0 0 0 1px rgba(255,255,255,.04)" }}>
      <div style={{ position:"absolute", inset:12, border:"1px solid rgba(255,255,255,.14)", borderRadius:12, pointerEvents:"none" }} />
      <div style={{ position:"absolute", left:"25%", right:"25%", top:"43%", height:"14%", border:"1px solid rgba(255,255,255,.12)", borderRadius:999, pointerEvents:"none" }} />
      {title && <div style={{ position:"relative", textAlign:"center", fontSize:11, color:"#bbf7d0", fontWeight:800, letterSpacing:1, marginBottom:compact?8:14 }}>{title}</div>}
      <div style={{ position:"relative", display:"flex", flexDirection:"column", justifyContent:"space-between", height:compact?220:300 }}>
        {rows.map((row, idx) => (
          <div key={idx} style={{ display:"flex", justifyContent:"center", gap:row.length>4?8:14, minHeight:46, alignItems:"center", flexWrap:"wrap" }}>
            {row.map(p => (
              <div key={p.id} style={{ textAlign:"center", minWidth:compact?42:48 }}>
                <PlayerBubble player={p} pos={p._pos} size={compact?30:36} />
                <div style={{ fontSize:compact?8:9, color:"#d1fae5", marginTop:3, fontWeight:700, maxWidth:60, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name?.split(" ")[0]}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}


function MomentumTimeline({ game, title="Momentum Timeline", compact=false }) {
  const events = (game?.events || [])
    .filter(e => ["goal_for","goal_against","sub"].includes(e.type))
    .sort((a,b)=>(a.minute||0)-(b.minute||0));
  const maxMin = game?.type === "tournament" ? CUP_GAME : GAME;
  const allPlayers = game?.allPlayers || ROSTER;
  const pName = (id) => {
    const p = allPlayers.find(p => String(p.id) === String(id));
    return p ? p.name.split(" ")[0] : "?";
  };
  const eventMeta = (e) => {
    if (e.type === "goal_for") return { icon:"⚽", bg:C.green, label:e.ownGoal ? "Own Goal" : `Goal · ${pName(e.scorer)}` };
    if (e.type === "goal_against") return { icon:"●", bg:C.red, label:"Conceded" };
    return { icon:"↔", bg:C.blue, label:`Sub · ${pName(e.playerOn)} on` };
  };
  return (
    <div style={{ ...card, padding:compact?12:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div>
          <div style={{ fontSize:12, color:C.muted, fontWeight:800, letterSpacing:1, textTransform:"uppercase" }}>{title}</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Goals, subs, and conceded goals by minute</div>
        </div>
        {game && <div style={{ fontSize:13, fontWeight:900, color:"#fff" }}>{game.scoreFor}-{game.scoreAgainst}</div>}
      </div>
      <div style={{ position:"relative", height:74, margin:"8px 4px 10px" }}>
        <div style={{ position:"absolute", left:0, right:0, top:34, height:3, borderRadius:99, background:"linear-gradient(90deg,#1e3a5f,#246BFD,#1e3a5f)" }} />
        {[0, maxMin/2, maxMin].map((m,i)=>(
          <div key={i} style={{ position:"absolute", left:`${(m/maxMin)*100}%`, top:22, transform:"translateX(-50%)", textAlign:"center" }}>
            <div style={{ width:1, height:24, background:"rgba(255,255,255,.16)", margin:"0 auto" }} />
            <div style={{ fontSize:9, color:C.muted, marginTop:4 }}>{i===1?"HT":`${Math.round(m)}'`}</div>
          </div>
        ))}
        {events.map((e,i)=>{
          const meta = eventMeta(e);
          const left = Math.max(1, Math.min(99, ((e.minute || 0) / maxMin) * 100));
          const top = e.type === "sub" ? 8 : e.type === "goal_against" ? 48 : 20;
          return (
            <div key={e.id || i} title={meta.label} style={{ position:"absolute", left:`${left}%`, top, transform:"translateX(-50%)", textAlign:"center" }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background:meta.bg, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, border:"2px solid rgba(255,255,255,.25)", boxShadow:"0 8px 18px rgba(0,0,0,.35)" }}>{meta.icon}</div>
              <div style={{ fontSize:8, color:C.muted, marginTop:2, whiteSpace:"nowrap" }}>{e.minute}'</div>
            </div>
          );
        })}
      </div>
      {events.length === 0 ? (
        <div style={{ color:C.muted, fontSize:12, textAlign:"center", padding:"8px 0" }}>No goals or substitutions logged</div>
      ) : (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {events.slice(0,10).map((e,i)=>{ const meta=eventMeta(e); return (
            <div key={e.id || i} style={{ display:"flex", alignItems:"center", gap:5, background:"#0a1222", border:`1px solid ${C.border}`, borderRadius:999, padding:"5px 8px" }}>
              <span style={{ width:16, height:16, borderRadius:"50%", background:meta.bg, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9 }}>{meta.icon}</span>
              <span style={{ fontSize:10, color:C.text, fontWeight:700 }}>{e.minute}'</span>
              <span style={{ fontSize:10, color:C.muted }}>{meta.label}</span>
            </div>
          );})}
          {events.length > 10 && <span style={{ fontSize:10, color:C.muted, padding:"5px 0" }}>+{events.length-10} more</span>}
        </div>
      )}
    </div>
  );
}

// ─── LIVE OPTIMUM XI ──────────────────────────────────────────────────────────
function LiveOptimumXI({ events, onField, allPlayers, positions, gf, ga, half, secs }) {
  const goalEvents = events.filter(e=>e.type==="goal_for"&&!e.ownGoal);
  const subEvents  = events.filter(e=>e.type==="sub");
  const curMin = Math.floor(secs/60);
  const playerMins = {};
  allPlayers.forEach(p=>{
    const pid=String(p.id);
    const inStart=onField.map(String).includes(pid);
    let onTime=inStart?0:null, offTime=null;
    subEvents.forEach(ev=>{ if(String(ev.playerOn)===pid)onTime=ev.minute; if(String(ev.playerOff)===pid)offTime=ev.minute; });
    playerMins[pid]=onTime!==null?Math.max(0,(offTime!==null?offTime:curMin)-onTime):0;
  });
  const playerGoals={}, playerAssists={};
  goalEvents.forEach(ev=>{ if(ev.scorer)playerGoals[String(ev.scorer)]=(playerGoals[String(ev.scorer)]||0)+1; if(ev.assist)playerAssists[String(ev.assist)]=(playerAssists[String(ev.assist)]||0)+1; });
  const playerConceded={};
  allPlayers.forEach(p=>{
    const pid=String(p.id);
    let count=0;
    events.filter(e=>e.type==="goal_against").forEach(ev=>{
      const min=ev.minute;
      const inStartXI=onField.map(String).includes(pid);
      let wasOn=inStartXI;
      subEvents.forEach(sub=>{ if(String(sub.playerOn)===pid&&sub.minute<=min)wasOn=true; if(String(sub.playerOff)===pid&&sub.minute<=min)wasOn=false; });
      if(wasOn)count++;
    });
    playerConceded[pid]=count;
  });
  const scored=allPlayers.map(p=>{
    const pid=String(p.id);
    const mins=playerMins[pid]||0, goals=playerGoals[pid]||0, assists=playerAssists[pid]||0, concede=playerConceded[pid]||0;
    return {...p,lMins:mins,lGoals:goals,lAssists:assists,lConcede:concede,lScore:goals*3+assists*2-concede*0.5+mins*0.01};
  }).filter(p=>playerMins[String(p.id)]>0||onField.map(String).includes(String(p.id)));
  const sorted=[...scored].sort((a,b)=>b.lScore-a.lScore);
  const top11=sorted.slice(0,11), rest=sorted.slice(11);
  const byPos={GK:[],DEF:[],MID:[],FWD:[]};
  top11.forEach(p=>{ const pos=positions[p.id]||p.pos||"MID"; (byPos[pos]||byPos["MID"]).push(p); });
  const currentlyOnField=new Set(onField.map(String));
  return (
    <div>
      <div style={{ background:"linear-gradient(135deg,#1a2744,#0f1f3d)", border:`1px solid ${C.amber}`, borderRadius:16, padding:"10px 14px", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>⭐</span>
          <div><div style={{ fontSize:13, fontWeight:800, color:C.amber }}>Live Optimum XI</div><div style={{ fontSize:10, color:C.muted }}>Best 11 right now · updates live</div></div>
          <div style={{ marginLeft:"auto", textAlign:"right" }}><div style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{gf}<span style={{ color:C.muted, margin:"0 4px" }}>-</span>{ga}</div><div style={{ fontSize:9, color:C.muted }}>{half===1?"1st":"2nd"} Half</div></div>
        </div>
      </div>
      {["GK","DEF","MID","FWD"].map(pos=>byPos[pos].length>0&&(
        <div key={pos} style={{ marginBottom:10 }}>
          <div style={{ fontSize:10, fontWeight:800, color:POS_COLOR[pos], letterSpacing:1, marginBottom:5 }}>{pos}</div>
          {byPos[pos].map(p=>{
            const isOn=currentlyOnField.has(String(p.id));
            return (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, background:isOn?"#0d2137":"#0a1628", border:`1px solid ${isOn?C.blue:"#1e293b"}`, borderRadius:14, padding:"9px 12px", marginBottom:5, opacity:isOn?1:0.65 }}>
                <span style={{ width:28, height:28, borderRadius:"50%", background:POS_COLOR[pos], display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:10, color:"#fff", flexShrink:0 }}>{p.num}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name.split(" ")[0]}{!isOn&&<span style={{ fontSize:9, color:C.amber, marginLeft:5 }}>BENCH</span>}</div>
                  <div style={{ fontSize:9, color:C.muted }}>{p.lMins}' played</div>
                </div>
                <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                  {p.lGoals>0&&<div style={{ background:"#1e3a5f", borderRadius:6, padding:"3px 7px", textAlign:"center" }}><div style={{ fontSize:13, fontWeight:800, color:"#60a5fa" }}>{p.lGoals}</div><div style={{ fontSize:7, color:C.muted }}>G</div></div>}
                  {p.lAssists>0&&<div style={{ background:"#064e3b", borderRadius:6, padding:"3px 7px", textAlign:"center" }}><div style={{ fontSize:13, fontWeight:800, color:C.green }}>{p.lAssists}</div><div style={{ fontSize:7, color:C.muted }}>A</div></div>}
                  <div style={{ background:C.border, borderRadius:6, padding:"3px 7px", textAlign:"center", minWidth:30 }}><div style={{ fontSize:12, fontWeight:800, color:C.amber }}>{p.lScore.toFixed(1)}</div><div style={{ fontSize:7, color:C.muted }}>RTG</div></div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {rest.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1, marginBottom: 5, marginTop: 8 }}>OUTSIDE XI</div>
          {rest.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#080f1c", border: "1px solid #0f1e35", borderRadius: 12, padding: "7px 12px", marginBottom: 4, opacity: 0.6 }}>
              <span style={{ fontSize: 11, color: C.muted, width: 18 }}>{i + 12}.</span>
              <span style={{ flex: 1, fontSize: 12, color: "#94a3b8" }}>{p.name.split(" ")[0]}</span>
              <span style={{ fontSize: 10, color: POS_COLOR[p.pos] || C.muted, fontWeight: 700, marginRight: 6 }}>{p.pos}</span>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{p.lScore.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
      {scored.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, marginTop:40 }}>Start the clock to see live ratings</div>}
    </div>
  );
}

// ─── FORMATION PICKER ─────────────────────────────────────────────────────────
function FormationPicker({ value, onChange, label }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Lbl>{label || "Formation"}</Lbl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {FORMATIONS.map(f => (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            style={{
              padding: "8px 12px",
              borderRadius: 14,
              border: value === f.id ? "2px solid #60a5fa" : "1px solid #334155",
              background: value === f.id ? C.blue : C.border,
              color: value === f.id ? "#fff" : "#94a3b8",
              fontWeight: value === f.id ? 800 : 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {f.label}
            <div style={{ fontSize: 9, color: value === f.id ? "#bfdbfe" : C.muted, marginTop: 2 }}>{f.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}


// ─── PIN SCREEN ───────────────────────────────────────────────────────────────
function PinScreen({ onAdmin, onViewer }) {
  const [pin,setPin]=useState(""); const [err,setErr]=useState(false);
  const check=()=>{ if(pin===ADMIN_PIN){onAdmin();}else{setErr(true);setPin("");setTimeout(()=>setErr(false),2000);} };
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, ...T }}>
      <div style={{ fontSize:13, fontWeight:800, color:"#60a5fa", letterSpacing:3, marginBottom:4 }}>PITCHSIDE</div>
      <div style={{ fontSize:24, fontWeight:900, color:"#fff", marginBottom:4 }}>Baltimore Armour</div>
      <div style={{ fontSize:11, color:"#93c5fd", letterSpacing:2, marginBottom:40 }}>11G ASPIRE</div>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:28, width:"100%", maxWidth:320, textAlign:"center" }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:20 }}>Admin Login</div>
        <input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()} placeholder="Enter PIN" maxLength={6}
          style={{ ...inp, fontSize:28, fontWeight:700, textAlign:"center", letterSpacing:8, marginBottom:8, border:err?`2px solid ${C.red}`:`1px solid #334155` }}/>
        {err&&<div style={{ color:C.red, fontSize:13, marginBottom:8 }}>Incorrect PIN</div>}
        <button onClick={check} style={{ ...btn(C.blue), width:"100%", padding:16, fontSize:16, marginBottom:16 }}>Enter</button>
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
          <button onClick={onViewer} style={{ ...btn("transparent",C.muted), width:"100%", border:`1px solid ${C.border}`, padding:12, fontSize:13 }}>View Only (Coach / Parent)</button>
        </div>
      </div>
    </div>
  );
}

// ─── GAME DETAIL ──────────────────────────────────────────────────────────────
function GameDetail({ game, onClose, onUpdate, onDelete, isAdmin }) {
  const [events,setEvents]=useState(game.events||[]);
  const [editing,setEditing]=useState(null);
  const [eMin,setEMin]=useState(""); const [eScorer,setEScorer]=useState(null); const [eAssist,setEAssist]=useState(null);
  const [eSubOff,setESubOff]=useState(null); const [eSubOn,setESubOn]=useState(null); const [eSubPos,setESubPos]=useState(null);
  const [saving,setSaving]=useState(false);
  const allP=game.allPlayers||ROSTER;
  const stats=calcStats([{...game,events}]);
  const pName=id=>findPlayer(id,allP)?.name||"?";
  const pNum=id=>findPlayer(id,allP)?.num||"?";
  const result=game.scoreFor>game.scoreAgainst?"WIN":game.scoreFor<game.scoreAgainst?"LOSS":"DRAW";
  const rc=result==="WIN"?"#059669":result==="LOSS"?C.red:"#d97706";
  const goalEvs=events.filter(e=>e.type==="goal_for"||e.type==="goal_against").sort((a,b)=>a.minute-b.minute);
  const subEvs=events.filter(e=>e.type==="sub").sort((a,b)=>a.minute-b.minute);
  const playerList=allP.filter(p=>(stats[String(p.id)]?.played||0)>0).sort((a,b)=>(stats[String(b.id)]?.mins||0)-(stats[String(a.id)]?.mins||0));
  const openEdit=ev=>{
    if(!isAdmin)return;
    setEditing(ev);
    setEMin(String(ev.minute));
    setEScorer(ev.scorer?String(ev.scorer):null);
    setEAssist(ev.assist?String(ev.assist):null);
    setESubOff(ev.playerOff?String(ev.playerOff):null);
    setESubOn(ev.playerOn?String(ev.playerOn):null);
    setESubPos(ev.pos || (ev.playerOn ? (findPlayer(ev.playerOn, allP)?.pos || "MID") : null));
  };
  const doSave=async()=>{
    const updated=events.map(e=>{
      if(e.id!==editing.id) return e;
      if(editing.type==="sub") return {...e, minute:parseInt(eMin)||0, playerOff:eSubOff, playerOn:eSubOn, pos:eSubPos};
      if(editing.type==="goal_for") return {...e, minute:parseInt(eMin)||0, scorer:eScorer, assist:eAssist};
      return {...e, minute:parseInt(eMin)||0};
    });
    setEvents(updated);setSaving(true); const g={...game,events:updated}; await saveGame(g);onUpdate(g);setSaving(false);setEditing(null);
  };
  const doDel=async()=>{ const updated=events.filter(e=>e.id!==editing.id); const g={...game,events:updated,scoreFor:game.scoreFor-(editing.type==="goal_for"?1:0),scoreAgainst:game.scoreAgainst-(editing.type==="goal_against"?1:0)}; setEvents(updated);setSaving(true);await saveGame(g);onUpdate(g);setSaving(false);setEditing(null); };
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:40 }}>
      <div style={{ background:"linear-gradient(135deg,#10243f,#071222 60%,#0b1d36)", padding:16, borderBottom:`3px solid ${C.blue}` }}>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:14, fontWeight:700, cursor:"pointer", padding:0, marginBottom:8 }}>{"< Back"}</button>
        <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>{game.date} · {game.venue} · {game.type==="tournament"?"Cup":"League"}</div>
        <div style={{ fontSize:15, fontWeight:800, color:"#60a5fa", marginBottom:8 }}>vs {game.opponent.split(" ").slice(0,4).join(" ")}</div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:48, fontWeight:900, color:"#fff", lineHeight:1 }}>{game.scoreFor}<span style={{ color:"#334155", margin:"0 10px" }}>-</span>{game.scoreAgainst}</span>
          <span style={{ background:rc, color:"#fff", borderRadius:12, padding:"6px 16px", fontWeight:800, fontSize:16 }}>{result}</span>
        </div>
        {saving&&<div style={{ fontSize:11, color:C.green, marginTop:6 }}>Saving…</div>}
        {(game.formation1H || game.formation2H) && (
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            {game.formation1H && <div style={{ background:C.border, borderRadius:12, padding:"4px 10px" }}><div style={{ fontSize:10, color:C.muted }}>1ST HALF</div><div style={{ fontSize:14, fontWeight:800, color:"#60a5fa" }}>{game.formation1H}</div></div>}
            {game.formation2H && <div style={{ background:C.border, borderRadius:12, padding:"4px 10px" }}><div style={{ fontSize:10, color:C.muted }}>2ND HALF</div><div style={{ fontSize:14, fontWeight:800, color:"#60a5fa" }}>{game.formation2H}</div></div>}
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}>
          <div style={{ fontSize:11, color:C.muted }}>{isAdmin?"Tap any event to edit":"View only"}</div>
          {isAdmin&&<button onClick={()=>onDelete(game)} style={{ background:"#7f1d1d", border:"none", borderRadius:12, padding:"5px 12px", color:"#fca5a5", fontWeight:700, fontSize:11, cursor:"pointer" }}>Delete Game</button>}
        </div>
      </div>
      <div style={{ padding:14, maxWidth:480, margin:"0 auto" }}>
        <Lbl>Starting Lineup</Lbl>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:12 }}>
          {(game.starting || []).map(id => {
            const p = findPlayer(id, allP);
            if (!p) return null;
            const pos = (game.positions || {})[id] || p.pos;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(180deg,#111c2e,#0d1727)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "7px 10px" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: POS_COLOR[pos] || C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9, color: "#fff", flexShrink: 0 }}>{p.num}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.split(" ")[0]}</div>
                  <div style={{ fontSize: 9, color: POS_COLOR[pos] }}>{pos}</div>
                </div>
              </div>
            );
          })}
        </div>
        {game.secondHalfStarting && (
          <div>
            <Lbl>2nd Half Lineup</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
              {game.secondHalfStarting.map(id => {
                const p = findPlayer(id, allP);
                if (!p) return null;
                const pos = DEFAULT_POS[id] || p.pos;
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(180deg,#111c2e,#0d1727)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "7px 10px" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: POS_COLOR[pos] || C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9, color: "#fff", flexShrink: 0 }}>{p.num}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.split(" ")[0]}</div>
                      <div style={{ fontSize: 9, color: POS_COLOR[pos] }}>{pos}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <Lbl mt={8}>Goals</Lbl>
        {goalEvs.length===0&&<div style={{ color:C.muted, fontSize:13, marginBottom:12 }}>No goals logged</div>}
        {goalEvs.map(ev=>(
          <div key={ev.id} onClick={()=>openEdit(ev)} style={{ display:"flex", alignItems:"center", gap:10, ...card, cursor:isAdmin?"pointer":"default", marginBottom:6 }}>
            <span style={{ fontSize:13, fontWeight:800, color:ev.type==="goal_for"?"#60a5fa":"#f87171", minWidth:32 }}>{ev.minute}'</span>
            <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700, color:C.text }}>{ev.type==="goal_for"?(ev.ownGoal?"Own Goal (opp)":pName(ev.scorer)):"Goal Conceded"}</div>{ev.type==="goal_for"&&!ev.ownGoal&&ev.assist&&<div style={{ fontSize:11, color:C.green }}>Assist: {pName(ev.assist)}</div>}{ev.type==="goal_for"&&!ev.ownGoal&&!ev.assist&&<div style={{ fontSize:11, color:C.muted }}>No assist logged</div>}</div>
            <span style={{ fontSize:11, color:C.muted, fontWeight:700 }}>{ev.score}</span>
            {isAdmin&&<span style={{ fontSize:10, color:C.blue }}>edit</span>}
          </div>
        ))}
        <Lbl mt={12}>Substitutions</Lbl>
        {subEvs.length===0&&<div style={{ color:C.muted, fontSize:13, marginBottom:12 }}>None logged</div>}
        {subEvs.map(ev=>(
          <div key={ev.id} onClick={()=>openEdit(ev)} style={{ display:"flex", alignItems:"center", gap:10, ...card, cursor:isAdmin?"pointer":"default", marginBottom:6 }}>
            <span style={{ fontSize:13, fontWeight:800, color:C.amber, minWidth:32 }}>{ev.minute}'</span>
            <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700, color:C.text }}>#{pNum(ev.playerOn)} {pName(ev.playerOn)} on</div><div style={{ fontSize:11, color:C.muted }}>#{pNum(ev.playerOff)} {pName(ev.playerOff)} off</div></div>
            {isAdmin&&<span style={{ fontSize:10, color:C.blue }}>edit</span>}
          </div>
        ))}
        <Lbl mt={12}>Optimum Team This Game</Lbl>
        {(() => {
          const gStats = calcStats([{ ...game, events }]);
          const allPlayers = game.allPlayers || ROSTER;
          // Impact for this game only
          const gameImpact = (p) => {
            const s = gStats[String(p.id)] || {};
            if (!s.mins || s.mins < 5) return null;
            const pos = p.pos;
            const maxBonus = pos==="GK"||pos==="DEF" ? 0.5 : pos==="MID" ? 0.25 : 0;
            let csBonus = 0;
            if(maxBonus > 0) {
              const concedes = events.filter(e=>e.type==="goal_against").map(e=>e.minute).sort((a,b)=>a-b);
              const pid = String(p.id);
              const subs = events.filter(e=>e.type==="sub");
              const HALF=40; let intervals=[], onField=false, entry=0;
              if((game.starting||[]).map(String).includes(pid)){onField=true;entry=0;}
              subs.filter(s=>s.half===1).sort((a,b)=>a.minute-b.minute).forEach(s=>{
                if(String(s.playerOff)===pid&&onField){intervals.push([entry,s.minute]);onField=false;}
                if(String(s.playerOn)===pid&&!onField){onField=true;entry=s.minute;}
              });
              if(onField)intervals.push([entry,HALF]);
              onField=false;entry=HALF;
              if((game.secondHalfStarting||[]).map(String).includes(pid)){onField=true;}
              subs.filter(s=>s.half===2).sort((a,b)=>a.minute-b.minute).forEach(s=>{
                if(String(s.playerOff)===pid&&onField){intervals.push([entry,s.minute]);onField=false;}
                if(String(s.playerOn)===pid&&!onField){onField=true;entry=s.minute;}
              });
              if(onField)intervals.push([entry,HALF*2]);
              let totalM=0,cleanM=0;
              intervals.forEach(([st,en])=>{
                totalM+=en-st;
                const cc=concedes.filter(m=>m>st&&m<=en);
                if(cc.length===0){cleanM+=en-st;}
                else{cleanM+=cc[0]-st;}
              });
              if(totalM>0)csBonus=maxBonus*(cleanM/totalM);
            }
            const net80=s.net80||0, g80=(s.goals||0)/s.mins*80, a80=(s.assists||0)/s.mins*80;
            return net80+g80*0.5+a80*0.25+csBonus;
          };
          const fmtI = (v) => v === null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(2);
          const rIds = new Set(ROSTER.map(p=>String(p.id)));
          const eligibleRoster = allPlayers.filter(p=>rIds.has(String(p.id))).map(p => ({ ...p, ...(gStats[String(p.id)] || {}), impact: gameImpact(p) })).filter(p => (gStats[String(p.id)]||{}).mins > 0);
          const eligibleGuests = allPlayers.filter(p=>!rIds.has(String(p.id))).map(p => ({ ...p, ...(gStats[String(p.id)] || {}), impact: gameImpact(p) })).filter(p => (gStats[String(p.id)]||{}).mins > 0);
          const eligible = [...eligibleRoster, ...eligibleGuests];
          const sortedRosterE = eligibleRoster.sort((a, b) => { const d = (b.net80||0)-(a.net80||0); return d!==0?d:(b.mins||0)-(a.mins||0); });
          const sortedGuestE = eligibleGuests.sort((a, b) => { const d = (b.net80||0)-(a.net80||0); return d!==0?d:(b.mins||0)-(a.mins||0); });
          const gkOpt = sortedRosterE.find(p => p.pos === "GK");
          const outOpt = sortedRosterE.filter(p => p.pos !== "GK").slice(0, 10);
          const optXI = gkOpt ? [gkOpt, ...outOpt] : sortedRosterE.slice(0, 11);
          const optRest = sortedRosterE.filter(p=>!optXI.find(x=>String(x.id)===String(p.id)));
          if (optXI.length === 0) return null;
          return (
            <div style={{ ...card, border: `1px solid ${C.amber}`, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.amber, fontWeight: 800, marginBottom: 8 }}>Best XI · Rostered Players · Net/80 highest first</div>
              {optXI.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < optXI.length-1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 11, color: C.muted, width: 18 }}>{i+1}.</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: POS_COLOR[p.pos] || C.muted, fontWeight: 700, marginRight: 4 }}>{p.pos}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: parseFloat(p.net80) >= 0 ? C.green : C.red }}>{p.net80s}</div>
                      <div style={{ fontSize: 8, color: C.muted }}>NET/80</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: p.impact > 0 ? C.amber : p.impact < 0 ? C.red : "#94a3b8" }}>{fmtI(p.impact)}</div>
                      <div style={{ fontSize: 8, color: C.muted }}>IMPACT</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#60a5fa" }}>{p.mins}'</div>
                      <div style={{ fontSize: 8, color: C.muted }}>MINS</div>
                    </div>
                    <div style={{ background:C.border, borderRadius:12, padding:"6px 8px", textAlign:"center", minWidth:46 }}>
                      <div style={{ fontSize:13, fontWeight:900, color:"#94a3b8" }}>{p.played>0?Math.round(p.mins/p.played):"0"}'</div>
                      <div style={{ fontSize: 8, color: C.muted }}>AVG</div>
                    </div>
                  </div>
                </div>
              ))}
              {optRest.length > 0 && (
                <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:10, color:C.muted, fontWeight:800, letterSpacing:1, marginBottom:6 }}>OTHERS — Close to XI</div>
                  {optRest.map((p, i) => (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:i<optRest.length-1?`1px solid ${C.border}`:"none", opacity:0.7 }}>
                      <span style={{ fontSize:11, color:C.muted, width:18 }}>{optXI.length+i+1}.</span>
                      <span style={{ flex:1, fontSize:12, color:"#94a3b8" }}>{p.name}</span>
                      <span style={{ fontSize:9, color:POS_COLOR[p.pos]||C.muted, fontWeight:700, marginRight:4 }}>{p.pos}</span>
                      <div style={{ display:"flex", gap:4 }}>
                        <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:7, color:C.muted }}>NET/80</div></div>
                        <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:p.impact>0?C.amber:"#94a3b8" }}>{fmtI(p.impact)}</div><div style={{ fontSize:7, color:C.muted }}>IMPACT</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sortedGuestE.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 6 }}>GUEST PLAYERS</div>
                  {sortedGuestE.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < sortedGuestE.length-1 ? `1px solid ${C.border}` : "none", opacity: 0.75 }}>
                      <span style={{ fontSize: 11, color: C.muted, width: 18 }}>G</span>
                      <span style={{ flex: 1, fontSize: 13, color: "#94a3b8" }}>{p.name}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 800, color: parseFloat(p.net80) >= 0 ? C.green : C.red }}>{p.net80s}</div><div style={{ fontSize: 8, color: C.muted }}>NET/80</div></div>
                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 800, color: p.impact > 0 ? C.amber : "#94a3b8" }}>{fmtI(p.impact)}</div><div style={{ fontSize: 8, color: C.muted }}>IMPACT</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        <Lbl mt={12}>Minutes Played</Lbl>
        {playerList.map(p => {
          const s = stats[String(p.id)];
          if (!s) return null;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, ...card, border: `1px solid ${C.border}`, marginBottom: 5 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, color: "#93c5fd", flexShrink: 0 }}>#{p.num}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: C.text }}>{p.name}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa" }}>{s.mins}'</span>
              {s.goals > 0 && <div style={{ background: C.border, borderRadius: 6, padding: "3px 8px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 800, color: "#60a5fa" }}>{s.goals}</div><div style={{ fontSize: 8, color: C.muted }}>G</div></div>}
              {s.assists > 0 && <div style={{ background: C.border, borderRadius: 6, padding: "3px 8px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{s.assists}</div><div style={{ fontSize: 8, color: C.muted }}>A</div></div>}
            </div>
          );
        })}
      </div>
      {editing && (
        <Modal title="Edit Event" onClose={() => setEditing(null)}>
          <Lbl>Minute</Lbl>
          <input
            value={eMin}
            onChange={e => setEMin(e.target.value)}
            type="number"
            style={{ ...inp, fontSize: 22, fontWeight: 700, marginBottom: 12 }}
          />
          {editing.type === "goal_for" && (
            <div>
              <Lbl>Scorer</Lbl>
              {allP.map(p => (
                <button
                  key={p.id}
                  onClick={() => setEScorer(String(p.id))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: eScorer === String(p.id) ? C.blue : C.border, border: eScorer === String(p.id) ? "2px solid #60a5fa" : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
                >
                  #{p.num} {p.name}
                </button>
              ))}
              <Lbl mt={8}>Assist</Lbl>
              <button
                onClick={() => setEAssist(null)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: eAssist === null ? "#475569" : C.border, border: "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
              >
                No Assist
              </button>
              {allP.filter(p => String(p.id) !== eScorer).map(p => (
                <button
                  key={p.id}
                  onClick={() => setEAssist(eAssist === String(p.id) ? null : String(p.id))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: eAssist === String(p.id) ? "#065f46" : C.border, border: eAssist === String(p.id) ? `2px solid ${C.green}` : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
                >
                  #{p.num} {p.name}
                </button>
              ))}
            </div>
          )}
          {editing.type === "sub" && (
            <div>
              <Lbl>Player Off</Lbl>
              {allP.map(p => (
                <button
                  key={p.id}
                  onClick={() => setESubOff(String(p.id))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: eSubOff === String(p.id) ? C.red : C.border, border: eSubOff === String(p.id) ? "2px solid #f87171" : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
                >
                  #{p.num} {p.name}
                </button>
              ))}
              <Lbl mt={8}>Player On</Lbl>
              {allP.map(p => (
                <button
                  key={p.id}
                  onClick={() => setESubOn(String(p.id))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: eSubOn === String(p.id) ? "#059669" : C.border, border: eSubOn === String(p.id) ? `2px solid ${C.green}` : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
                >
                  #{p.num} {p.name}
                </button>
              ))}
              <Lbl mt={8}>Position</Lbl>
              <div style={{ display: "flex", gap: 8 }}>
                {POSITIONS.map(pos => (
                  <button key={pos} onClick={() => setESubPos(pos)} style={{ flex: 1, padding: "14px 4px", borderRadius: 14, border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer", background: eSubPos === pos ? POS_COLOR[pos] : C.border, color: eSubPos === pos ? "#fff" : C.muted }}>{pos}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={doDel} style={{ ...btn("#7f1d1d", "#fca5a5"), flex: 1 }}>Delete</button>
            <button onClick={doSave} style={{ ...btn(C.blue), flex: 2 }}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({ games, onStart, onStats, onView, isAdmin, resumeState, onResume, onDiscardResume, onSchedule, onEditScheduled, onDeleteScheduled }) {
  const [showNew,setShowNew]=useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  const [schedOpp, setSchedOpp] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedType, setSchedType] = useState("regular");
  const [schedVenue, setSchedVenue] = useState("Away");
  const [type,setType]=useState("regular"); const [opp,setOpp]=useState(""); const [customOpp,setCustomOpp]=useState(""); const [venue,setVenue]=useState("Home");
  const played=new Set(games.map(g=>g.opponent.toLowerCase().trim()));
  // Match upcoming games - filter out completed/in-progress games
  const completedGamesForSchedule = games.filter(g=>g.status!=="scheduled" && g.status!=="in_progress");
  const hardcodedRemaining = UPCOMING.filter(upg=>{
    return !completedGamesForSchedule.some(g=>sameOpponent(g.opponent, upg.opp));
  });
  // Also include Firebase-scheduled games
  const firebaseScheduled = games.filter(g=>g.status==="scheduled").map(g=>({
    opp:g.opponent, date:g.date, time:g.time||"" , venue:g.venue, type:g.type, id:g.id
  }));
  const remaining = [
    ...hardcodedRemaining,
    ...firebaseScheduled.filter(fs=>!hardcodedRemaining.some(h=>h.opp.toLowerCase()===fs.opp.toLowerCase()))
  ].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const teams=type==="regular"?LEAGUE_TEAMS:TOURNAMENT_TEAMS;
  const go=()=>{ const opponent=opp==="__custom__"?customOpp.trim():opp; if(!opponent)return; onStart({type,opponent,venue}); setShowNew(false); };
  const completedGames=games.filter(g=>g.status==="completed"||(g.scoreFor!==undefined&&g.status!=="scheduled"&&g.status!=="in_progress"));
  const record={W:completedGames.filter(g=>g.scoreFor>g.scoreAgainst).length,D:completedGames.filter(g=>g.scoreFor===g.scoreAgainst).length,L:completedGames.filter(g=>g.scoreFor<g.scoreAgainst).length};
  const totalGF=completedGames.reduce((a,g)=>a+g.scoreFor,0), totalGA=completedGames.reduce((a,g)=>a+g.scoreAgainst,0);
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      <div style={{ background:"linear-gradient(135deg,#10243f,#071222 60%,#0b1d36)", padding:"28px 16px 18px", borderBottom:`3px solid ${C.blue}`, textAlign:"center" }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#60a5fa", letterSpacing:3, marginBottom:6, opacity:0.8 }}>PITCHSIDE</div>
        <div style={{ fontSize:22, fontWeight:900, color:"#fff", letterSpacing:1 }}>Baltimore Armour</div>
        <div style={{ fontSize:12, color:"#93c5fd", letterSpacing:2, marginTop:2 }}>11G ASPIRE - 2025/26</div>
        {games.length>0&&(()=>{
          const sorted=games.filter(g=>g.status==="completed"||(g.status!=="scheduled"&&(g.scoreFor>0||g.scoreAgainst>0||((g.events||[]).length>0)))).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
          let streak=0;
          for(let i=sorted.length-1;i>=0;i--){if(sorted[i].scoreFor>=sorted[i].scoreAgainst)streak++;else break;}
          return(<div style={{ marginTop:14 }}>
            <div style={{ display:"flex", justifyContent:"center", gap:20, marginBottom:10 }}>
              {[["W",record.W,"#059669"],["D",record.D,"#d97706"],["L",record.L,C.red]].map(([l,v,c])=><div key={l} style={{ textAlign:"center" }}><div style={{ fontSize:30, fontWeight:900, color:c }}>{v}</div><div style={{ fontSize:10, color:C.muted }}>{l==="W"?"Wins":l==="D"?"Draws":"Losses"}</div></div>)}
            </div>
            <div style={{ display:"flex", justifyContent:"center", gap:24, marginBottom:8 }}>
              <div style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:900, color:"#60a5fa" }}>{totalGF}</div><div style={{ fontSize:9, color:C.muted, letterSpacing:1 }}>GOALS FOR</div></div>
              <div style={{ width:1, background:C.border, margin:"4px 0" }}/>
              <div style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:900, color:"#f87171" }}>{totalGA}</div><div style={{ fontSize:9, color:C.muted, letterSpacing:1 }}>GOALS AGAINST</div></div>
            </div>
            {streak>=2&&<div style={{ marginTop:6, background:"linear-gradient(90deg,#065f46,#047857)", borderRadius:14, padding:"5px 14px", display:"inline-block" }}><span style={{ fontSize:12, fontWeight:800, color:"#6ee7b7" }}>Unbeaten: {streak} games</span></div>}
          </div>);
        })()}
      </div>
      <div style={{ padding:16, maxWidth:480, margin:"0 auto" }}>

        {/* ── RESUME BANNER ── */}
        {resumeState&&(
          <div style={{ background:"linear-gradient(135deg,#1a3a1a,#0d2d0d)", border:`2px solid ${C.green}`, borderRadius:14, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:800, color:C.green, marginBottom:4 }}>🔴 GAME IN PROGRESS</div>
            <div style={{ fontSize:15, fontWeight:800, color:"#fff", marginBottom:2 }}>vs {resumeState.gameInfo.opponent}</div>
            <div style={{ fontSize:13, color:"#6ee7b7", marginBottom:10 }}>Score: {resumeState.gf} - {resumeState.ga} · {resumeState.half===1?"1st Half":"2nd Half"}</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={onResume} style={{ ...btn(C.green), flex:2, fontSize:13 }}>▶ Resume Game</button>
              <button onClick={onDiscardResume} style={{ ...btn("#7f1d1d","#fca5a5"), flex:1, fontSize:12 }}>Discard</button>
            </div>
          </div>
        )}

        {games.filter(g=>g.status==="completed"||(!g.status&&g.scoreFor!==undefined)).length > 0 && (
          <div>
            <Lbl>Recent Results</Lbl>
            {games.filter(g=>g.status==="completed"||(!g.status&&g.scoreFor!==undefined)).slice().reverse().map((g, i) => (
              <button key={i} onClick={() => onView(g)} style={{ background: "linear-gradient(180deg,#111f35,#0b1627)", border: "1px solid #065f46", borderRadius: 16, padding: 14, marginBottom: 8, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>vs {g.opponent.split(" ").slice(0, 3).join(" ")}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{g.date} · {g.venue} · {g.type === "tournament" ? "Cup" : "League"}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{g.scoreFor}-{g.scoreAgainst}</span>
                  <WinBadge gf={g.scoreFor} ga={g.scoreAgainst} />
                </div>
              </button>
            ))}
            <div style={{ height: 8 }} />
          </div>
        )}
        {remaining.length > 0 && (
          <div>
            <Lbl>Upcoming</Lbl>
            {remaining.map((g, i) => (
              <div key={i} style={{ background: "linear-gradient(180deg,#111c2e,#0d1727)", border: `1px solid ${C.border}`, borderRadius: 16, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>vs {g.opp.split(" ").slice(0,3).join(" ")}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{g.date}{g.time?" · "+g.time:""} · {g.venue}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, flexShrink:0, marginLeft:8 }}>
                  <span style={{ background: g.type==="tournament"?C.purple:C.blue, color:"#fff", borderRadius:6, padding:"3px 8px", fontSize:10, fontWeight:700 }}>{g.type==="tournament"?"CUP":"LEAGUE"}</span>
                  {isAdmin && (
                    <div style={{ display:"flex", gap:5 }}>
                      <button
                        onClick={async()=>{
                          if(g.id){
                            setEditingGame({...g, rawDate:""});
                          } else {
                            // Hardcoded game - save to Firebase first so it gets an id
                            const newId = "scheduled-"+Date.now();
                            await onSchedule({ opp:g.opp, date:g.date||"", time:g.time||"", type:g.type, venue:g.venue, id:newId });
                            setEditingGame({ opp:g.opp, date:g.date||"", time:g.time||"", type:g.type, venue:g.venue, id:newId, rawDate:"" });
                          }
                        }}
                        style={{ background:"#0f4c81", border:"none", borderRadius:6, padding:"4px 8px", color:"#93c5fd", fontSize:10, fontWeight:700, cursor:"pointer" }}
                      >EDIT</button>
                      <button onClick={()=>onStart({ type:g.type, opponent:g.opp, venue:g.venue, scheduledId:g.id })} style={{ background:C.green, border:"none", borderRadius:6, padding:"4px 8px", color:"#fff", fontSize:10, fontWeight:700, cursor:"pointer" }}>▶ START</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div style={{ height: 8 }} />
          </div>
        )}
        <div style={{ display:"flex", gap:10, marginBottom:8 }}>
          {isAdmin&&<button onClick={()=>{ setOpp("");setShowNew(true); }} style={{ ...btn(C.blue), flex:1 }}>▶ Start Game</button>}
          {isAdmin&&<button onClick={()=>setShowSchedule(true)} style={{ ...btn("#1d4ed8","#bfdbfe"), flex:1 }}>+ Schedule</button>}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onStats} style={{ ...btn(C.border,"#93c5fd"), flex:1 }}>Season Stats</button>
        </div>
        {!isAdmin&&<div style={{ textAlign:"center", marginTop:12, fontSize:11, color:C.muted }}>View only - data updates live as games are tracked</div>}
      </div>
      {showNew&&(
        <Modal title="New Game" onClose={()=>setShowNew(false)}>
          <Lbl>Type</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>{["regular","tournament"].map(t=><button key={t} onClick={()=>{ setType(t);setOpp(""); }} style={{ ...btn(type===t?C.blue:C.border,type===t?"#fff":C.muted), flex:1 }}>{t==="regular"?"League":"Cup"}</button>)}</div>
          <Lbl>Venue</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>{["Home","Away"].map(v=><button key={v} onClick={()=>setVenue(v)} style={{ ...btn(venue===v?C.blue:C.border,venue===v?"#fff":C.muted), flex:1 }}>{v}</button>)}</div>
          <Lbl>Opponent</Lbl>
          {teams.map(t=><button key={t} onClick={()=>setOpp(t)} style={{ width:"100%", padding:"11px 14px", borderRadius:14, marginBottom:5, textAlign:"left", cursor:"pointer", fontWeight:600, fontSize:13, background:opp===t?"#1d4ed8":C.border, border:opp===t?`2px solid #60a5fa`:`1px solid ${C.border}`, color:opp===t?"#fff":"#94a3b8" }}>{t}</button>)}
          <button onClick={()=>setOpp("__custom__")} style={{ width:"100%", padding:"11px 14px", borderRadius:14, marginBottom:8, textAlign:"left", cursor:"pointer", fontWeight:600, fontSize:13, background:opp==="__custom__"?"#1d4ed8":C.border, border:`1px dashed #334155`, color:"#94a3b8" }}>+ Other / Tournament Final</button>
          {opp==="__custom__"&&<input value={customOpp} onChange={e=>setCustomOpp(e.target.value)} placeholder="Opponent name..." style={{ ...inp, marginBottom:10 }}/>}
          <button onClick={go} style={{ ...btn(C.blue), width:"100%", padding:16, fontSize:15 }}>Continue to Lineup</button>
        </Modal>
      )}

      {showSchedule && (
        <Modal title="Schedule a Game" onClose={() => setShowSchedule(false)}>
          <Lbl>Opponent Name</Lbl>
          <input
            value={schedOpp}
            onChange={e => setSchedOpp(e.target.value)}
            placeholder="e.g. Keystone FC 11G Aspire"
            style={{ ...inp, marginBottom: 12 }}
          />
          <Lbl>Date</Lbl>
          <input
            type="date"
            value={schedDate}
            onChange={e => setSchedDate(e.target.value)}
            style={{ ...inp, marginBottom: 12 }}
          />
          <Lbl>Kick-off Time (optional)</Lbl>
          <input
            type="time"
            value={schedTime}
            onChange={e => setSchedTime(e.target.value)}
            style={{ ...inp, marginBottom: 12 }}
          />
          <Lbl>Competition</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            {[["regular","⚽ League"],["tournament","🏆 Cup"]].map(([k,l])=>(
              <button key={k} onClick={()=>setSchedType(k)} style={{ ...btn(schedType===k?C.blue:C.border, schedType===k?"#fff":C.muted), flex:1 }}>{l}</button>
            ))}
          </div>
          <Lbl>Venue</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {["Home","Away"].map(v=>(
              <button key={v} onClick={()=>setSchedVenue(v)} style={{ ...btn(schedVenue===v?C.blue:C.border, schedVenue===v?"#fff":C.muted), flex:1 }}>{v}</button>
            ))}
          </div>
          <button
            onClick={()=>{
              if(!schedOpp.trim()||!schedDate)return;
              onSchedule({ opp:schedOpp.trim(), date:schedDate, time:schedTime, type:schedType, venue:schedVenue });
              setSchedOpp(""); setSchedDate(""); setSchedTime(""); setSchedType("regular"); setSchedVenue("Away");
              setShowSchedule(false);
            }}
            disabled={!schedOpp.trim()||!schedDate}
            style={{ ...btn(!schedOpp.trim()||!schedDate?C.border:C.green, !schedOpp.trim()||!schedDate?C.muted:"#fff"), width:"100%", padding:16, fontSize:15 }}
          >
            Save to Schedule
          </button>
        </Modal>
      )}

      {editingGame && (
        <Modal title="Edit Scheduled Game" onClose={() => setEditingGame(null)}>
          <Lbl>Opponent Name</Lbl>
          <input
            value={editingGame.opp}
            onChange={e => setEditingGame(g => ({...g, opp: e.target.value}))}
            placeholder="Opponent name"
            style={{ ...inp, marginBottom: 12 }}
          />
          <Lbl>Date</Lbl>
          <input
            type="date"
            value={editingGame.rawDate || ""}
            onChange={e => setEditingGame(g => ({...g, rawDate: e.target.value}))}
            style={{ ...inp, marginBottom: 12 }}
          />
          <Lbl>Kick-off Time (optional)</Lbl>
          <input
            type="time"
            value={editingGame.time || ""}
            onChange={e => setEditingGame(g => ({...g, time: e.target.value}))}
            style={{ ...inp, marginBottom: 12 }}
          />
          <Lbl>Competition</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            {[["regular","⚽ League"],["tournament","🏆 Cup"]].map(([k,l])=>(
              <button key={k} onClick={()=>setEditingGame(g=>({...g,type:k}))} style={{ ...btn(editingGame.type===k?C.blue:C.border, editingGame.type===k?"#fff":C.muted), flex:1 }}>{l}</button>
            ))}
          </div>
          <Lbl>Venue</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {["Home","Away"].map(v=>(
              <button key={v} onClick={()=>setEditingGame(g=>({...g,venue:v}))} style={{ ...btn(editingGame.venue===v?C.blue:C.border, editingGame.venue===v?"#fff":C.muted), flex:1 }}>{v}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={()=>{ onDeleteScheduled(editingGame.id); setEditingGame(null); }}
              style={{ ...btn("#7f1d1d","#fca5a5"), flex:1 }}
            >Delete</button>
            <button
              onClick={()=>{
                onEditScheduled({
                  ...editingGame,
                  date: editingGame.rawDate
                    ? new Date(editingGame.rawDate).toLocaleDateString("en-US")
                    : editingGame.date,
                });
                setEditingGame(null);
              }}
              style={{ ...btn(C.green), flex:2, fontSize:15 }}
            >Save Changes</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── LINEUP ───────────────────────────────────────────────────────────────────
function Lineup({ gameInfo, onKickoff, onBack, pastGames=[] }) {
  const [selected,setSelected]=useState([]); const [overrides,setOverrides]=useState({});
  const [avail,setAvail]=useState(Object.fromEntries(ROSTER.map(p=>[p.id,true])));
  const [posModal,setPosModal]=useState(null); const [guestName,setGuestName]=useState(""); const [guests,setGuests]=useState(()=>uniqueGuestsFromGames(pastGames)); const [showGuest,setShowGuest]=useState(false);
  // NEW: start 2nd half only mode
  const [halfMode,setHalfMode]=useState("full"); // "full" or "second_only"
  const allP=[...ROSTER,...guests];
  const [formation1H, setFormation1H] = useState("4-3-3");
  const available=allP.filter(p=>avail[p.id]!==false&&avail[p.id]!=="injured"&&avail[p.id]!=="absent");
  const posFor=id=>overrides[id]||DEFAULT_POS[id]||"MID";
  const toggle=id=>{ if(selected.includes(id))setSelected(s=>s.filter(x=>x!==id)); else if(selected.length<11)setSelected(s=>[...s,id]); };
  const cycleAvail=(id,e)=>{ e.stopPropagation(); const isAvail=avail[id]!==false&&avail[id]!=="injured"&&avail[id]!=="absent"; setAvail(a=>({...a,[id]:!isAvail})); setSelected(s=>s.filter(x=>x!==id)); };
  const addGuest=()=>{
    const name = guestName.trim();
    if(!name)return;
    const existing = guests.find(g=>normName(g.name)===normName(name));
    const g = existing || {id:stableGuestId(name),num:"G",name,pos:"MID",isGuest:true};
    if(!existing) setGuests(gs=>[...gs,g]);
    setAvail(a=>({...a,[g.id]:true}));
    setGuestName("");setShowGuest(false);
  };
  const kickoff=()=>{
    if(selected.length!==11)return;
    const positions=Object.fromEntries(selected.map(id=>[id,posFor(id)]));
    onKickoff({...gameInfo,starting:selected,positions,avail,guests,allPlayers:[...ROSTER,...guests],startFromSecondHalf:halfMode==="second_only", formation1H});
  };
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:100 }}>
      <div style={{ background:"linear-gradient(135deg,#10243f,#071222 60%,#0b1d36)", padding:16, borderBottom:`3px solid ${C.blue}` }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:14, fontWeight:700, cursor:"pointer", padding:0, marginBottom:8 }}>{"< Back"}</button>
        <div style={{ fontSize:16, fontWeight:800, color:"#60a5fa" }}>vs {gameInfo.opponent?.split(" ").slice(0,4).join(" ")}</div>
        {/* Half selector */}
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          {[["full","Full Game"],["second_only","2nd Half Only"]].map(([k,l])=>(
            <button key={k} onClick={()=>setHalfMode(k)} style={{ flex:1, padding:"8px 4px", borderRadius:12, border:"none", fontWeight:700, fontSize:11, cursor:"pointer", background:halfMode===k?C.amber:C.border, color:halfMode===k?"#000":C.muted }}>{l}</button>
          ))}
        </div>
        {halfMode==="second_only"&&<div style={{ fontSize:10, color:C.amber, marginTop:6 }}>⚡ Clock starts at halftime. 1st half stats skipped — 2nd half tracked only.</div>}
        <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #1e3a5f" }}>
          <Lbl>1st Half Formation</Lbl>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {FORMATIONS.map(f=>(
              <button key={f.id} onClick={()=>setFormation1H(f.id)}
                style={{ padding:"7px 11px", borderRadius:14, border:formation1H===f.id?"2px solid #60a5fa":"1px solid #334155", background:formation1H===f.id?C.blue:C.border, color:formation1H===f.id?"#fff":"#94a3b8", fontWeight:formation1H===f.id?800:600, fontSize:12, cursor:"pointer" }}>
                {f.label}
                <div style={{ fontSize:8, color:formation1H===f.id?"#bfdbfe":C.muted }}>{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
          <div style={{ fontSize:12, color:"#94a3b8" }}>Tap to select · tap badge to mark unavailable</div>
          <div style={{ fontSize:22, fontWeight:900, color:selected.length===11?C.green:C.amber }}>{selected.length}<span style={{ fontSize:13, color:C.muted }}>/11</span></div>
        </div>
      </div>
      <div style={{ padding:"12px 14px", maxWidth:480, margin:"0 auto" }}>
        {available.map(p=>{
          const isSel=selected.includes(p.id); const pos=posFor(p.id);
          return(
            <div key={p.id} onClick={()=>toggle(p.id)} style={{ display:"flex", alignItems:"center", gap:10, background:isSel?"#0d2137":C.card, border:isSel?`2px solid ${C.blue}`:`1px solid ${C.border}`, borderRadius:16, padding:"12px", marginBottom:6, cursor:"pointer" }}>
              <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:isSel?C.blue:C.border, border:isSel?`2px solid #60a5fa`:`1px solid #334155` }}>{isSel?<span style={{ fontSize:16, fontWeight:900, color:"#fff", lineHeight:1 }}>✓</span>:<span style={{ fontSize:10, fontWeight:700, color:C.muted }}>{p.num}</span>}</div>
              <span style={{ flex:1, fontWeight:700, fontSize:14, color:isSel?C.text:"#94a3b8" }}>{p.name}</span>
              {isSel&&<button onClick={e=>{ e.stopPropagation();setPosModal(p.id); }} style={{ background:POS_COLOR[pos], border:"none", borderRadius:6, padding:"5px 10px", color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer" }}>{pos}</button>}
              <button title="Tap to mark unavailable" aria-label="Tap to mark unavailable" onClick={e=>cycleAvail(p.id,e)} style={{ background:(avail[p.id]!==false&&avail[p.id]!=="injured"&&avail[p.id]!=="absent")?"transparent":"#450a0a", border:(avail[p.id]!==false&&avail[p.id]!=="injured"&&avail[p.id]!=="absent")?"1px solid transparent":"none", borderRadius:12, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:800, color:(avail[p.id]!==false&&avail[p.id]!=="injured"&&avail[p.id]!=="absent")?"transparent":C.red, minWidth:38 }}>{(avail[p.id]!==false&&avail[p.id]!=="injured"&&avail[p.id]!=="absent")?"":"Out"}</button>
            </div>
          );
        })}
        {!showGuest ? (
          <button onClick={() => setShowGuest(true)} style={{ width: "100%", padding: 12, borderRadius: 16, background: "linear-gradient(180deg,#111c2e,#0d1727)", border: "1px dashed #334155", color: C.purple, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
            + Add / Reuse Guest Player
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Guest name... existing guests are listed above" style={{ ...inp, flex: 1 }} />
            <button onClick={addGuest} style={{ ...btn(C.purple), padding: "12px 16px" }}>Add</button>
          </div>
        )}
      </div>
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#081321", borderTop:`2px solid ${C.border}`, padding:"12px 16px" }}>
        {selected.length>0&&selected.length<11&&<div style={{ textAlign:"center", fontSize:12, color:C.amber, marginBottom:6 }}>Select {11-selected.length} more</div>}
        <button onClick={kickoff} disabled={selected.length!==11} style={{ ...btn(selected.length===11?C.blue:C.border,selected.length===11?"#fff":C.muted), width:"100%", padding:18, fontSize:16, borderRadius:16, cursor:selected.length===11?"pointer":"not-allowed" }}>
          {selected.length===11?(halfMode==="second_only"?"Start 2nd Half Tracking!":"Kick Off!"):"Tap "+( 11-selected.length>0?11-selected.length+" more players":"11 players")}
        </button>
      </div>
      {posModal && (
        <Modal title="Set Position" onClose={() => setPosModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {POSITIONS.map(pos => (
              <button
                key={pos}
                onClick={() => { setOverrides(o => ({ ...o, [posModal]: pos })); setPosModal(null); }}
                style={{ padding: 24, borderRadius: 14, background: posFor(posModal) === pos ? POS_COLOR[pos] : C.border, border: posFor(posModal) === pos ? "3px solid #fff" : "3px solid transparent", color: "#fff", fontWeight: 800, fontSize: 20, cursor: "pointer" }}
              >
                {pos}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── GAME SCREEN ──────────────────────────────────────────────────────────────
function Game({ gameInfo, onEnd, onBack }) {
  const halfLength = gameInfo.type === "tournament" ? CUP_HALF : HALF;
  const gameLength = gameInfo.type === "tournament" ? CUP_GAME : GAME;
  // If starting from 2nd half only, begin at half=2 and secs=halfLength*60
  // If resuming, restore all previous state
  const isResume = !!gameInfo._resumeEvents;
  const initHalf   = isResume ? gameInfo._resumeHalf   : gameInfo.startFromSecondHalf ? 2 : 1;
  const initSecs   = isResume ? gameInfo._resumeSecs   : gameInfo.startFromSecondHalf ? halfLength*60 : 0;
  const initEvents = isResume ? gameInfo._resumeEvents : [];
  const initGf     = isResume ? gameInfo._resumeGf     : 0;
  const initGa     = isResume ? gameInfo._resumeGa     : 0;
  const initField  = isResume ? gameInfo._resumeOnField: gameInfo.starting;

  const [onField,setOnField]     = useState(initField);
  const [positions,setPositions] = useState(gameInfo.positions);
  const [half,setHalf]           = useState(initHalf);
  const [htMode,setHtMode]       = useState(false);
  const [secs,setSecs]           = useState(initSecs);
  const [running,setRunning]     = useState(false);
  const [events,setEvents]       = useState(initEvents);
  const [gf,setGf]               = useState(initGf);
  const [ga,setGa]               = useState(initGa);
  const [modal,setModal]         = useState(null);
  const [tab,setTab]             = useState("field");
  const [showBack,setShowBack]   = useState(false);
  const [showEnd,setShowEnd]     = useState(false);
  const [editEv,setEditEv]       = useState(null);
  const [goalMin,setGoalMin]     = useState("0");
  const [scorer,setScorer]       = useState(null);
  const [assist,setAssist]       = useState(null);
  const [ownGoal,setOwnGoal]     = useState(false);
  const [subOff,setSubOff]       = useState(null);
  const [subOn,setSubOn]         = useState(null);
  const [subMin,setSubMin]       = useState("0");
  const [subPos,setSubPos]       = useState(null);
  const [formation2H,setFormation2H] = useState(gameInfo.formation2H || gameInfo.formation1H || "4-3-3");
  const timerRef=useRef(null), startRef=useRef(null), pauseRef=useRef(initSecs);

  const gameId = useRef(
    gameInfo.id || (new Date().toLocaleDateString("en-US").replace(/\//g,"-")+"-"+gameInfo.opponent.slice(0,10).replace(/\s/g,"-")).toLowerCase()
  );
  const gameDate = useRef(new Date().toLocaleDateString("en-US"));

  // ── buildSnap defined early so all useEffects can use it ─────────────────
  const buildSnap=(evs,gfV,gaV,status="in_progress")=>({
    ...gameInfo,
    events:evs,
    scoreFor:gfV,
    scoreAgainst:gaV,
    date:gameDate.current,
    secondHalfStarting:half===2 || htMode ? [...onField] : gameInfo.secondHalfStarting,
    formation1H: gameInfo.formation1H || "4-3-3",
    formation2H,
    id:gameId.current,
    status
  });

  // ── Refs to hold latest values for stale-closure-safe auto-save ──────────
  const eventsRef  = useRef([]); eventsRef.current  = events;
  const gfRef      = useRef(0);  gfRef.current      = gf;
  const gaRef      = useRef(0);  gaRef.current      = ga;
  const halfRef    = useRef(initHalf); halfRef.current = half;
  const onFieldRef = useRef(gameInfo.starting); onFieldRef.current = onField;

  // ── Save full game state to localStorage on every change ──────────────────
  const persistState = (evs, gfV, gaV, halfV, fieldV, secsV) => {
    saveGameState({ gameInfo:{...gameInfo, formation2H}, events:evs, gf:gfV, ga:gaV, half:halfV, onField:fieldV, secs:secsV, gameId:gameId.current, gameDate:gameDate.current });
  };

  // ── Restore from localStorage if available (page refresh recovery) ─────────
  useEffect(()=>{
    // Clock restore
    const clockRunning = localStorage.getItem("ps_clock_running")==="1";
    const clockStart   = localStorage.getItem("ps_clock_start");
    if(clockRunning&&clockStart){
      const elapsed=Math.floor((Date.now()-Number(clockStart))/1000);
      pauseRef.current=elapsed; setSecs(elapsed); setRunning(true);
    } else {
      const savedSecs=localStorage.getItem("ps_clock_secs");
      if(savedSecs){ const s=Number(savedSecs); pauseRef.current=s; setSecs(s); }
    }
  },[]);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(running){
      const wallStart=Date.now()-pauseRef.current*1000;
      startRef.current=wallStart;
      localStorage.setItem("ps_clock_start",String(wallStart));
      localStorage.setItem("ps_clock_running","1");
      timerRef.current=setInterval(()=>setSecs(Math.floor((Date.now()-startRef.current)/1000)),500);
    } else {
      clearInterval(timerRef.current);
      pauseRef.current=secs;
      localStorage.setItem("ps_clock_running","0");
      localStorage.setItem("ps_clock_secs",String(secs));
    }
    return ()=>clearInterval(timerRef.current);
  },[running]);

  // ── Auto-persist to localStorage on every change ─────────────────────────
  useEffect(()=>{
    persistState(events,gf,ga,half,onField,secs);
  },[events,gf,ga,half,onField,secs]);

  // ── Auto-save to Firebase every 5 minutes while game is running ───────────
  const autoSaveRef = useRef(null);
  useEffect(()=>{
    if(running){
      autoSaveRef.current = setInterval(()=>{
        // Use refs so we always get latest values, not stale closure
        const snap = {
          ...gameInfo,
          events: eventsRef.current,
          scoreFor: gfRef.current,
          scoreAgainst: gaRef.current,
          secondHalfStarting: halfRef.current===2 ? [...onFieldRef.current] : undefined,
          id: gameId.current,
          date: gameDate.current,
          status: "in_progress",
          formation1H: gameInfo.formation1H || "4-3-3",
          formation2H
        };
        saveGame(snap).catch(()=>{});
      }, 5 * 60 * 1000);
    } else {
      clearInterval(autoSaveRef.current);
    }
    return ()=>clearInterval(autoSaveRef.current);
  },[running]);

  const curMin=Math.floor(secs/60);
  const timeStr=String(Math.floor(secs/60)).padStart(2,"0")+":"+String(secs%60).padStart(2,"0");
  const allP=gameInfo.allPlayers;
  const onFieldP=allP.filter(p=>onField.map(String).includes(String(p.id)));
  const benchP=allP.filter(p=>gameInfo.avail&&gameInfo.avail[p.id]!==false&&gameInfo.avail[p.id]!=="injured"&&gameInfo.avail[p.id]!=="absent"&&!onField.map(String).includes(String(p.id)));
  const openGoal=type=>{ setGoalMin(String(curMin));setSubMin(String(curMin));setScorer(null);setAssist(null);setOwnGoal(false);setSubOff(null);setSubOn(null);setSubPos(null);setModal(type); };
  const pName=id=>allP.find(p=>String(p.id)===String(id))?.name?.split(" ")[0]||"?";

  const logGoalFor=()=>{
    const ngf=gf+1; setGf(ngf);
    const ev={type:"goal_for",minute:parseInt(goalMin)||0,scorer:ownGoal?null:scorer,assist:ownGoal?null:assist,ownGoal,score:ngf+"-"+ga,half,id:uid()};
    const newEvents=[...events,ev]; setEvents(()=>newEvents);
    saveGame(buildSnap(newEvents,ngf,ga)).catch(()=>{});
    setModal(null);
  };
  const logGoalAgainst=()=>{
    const nga=ga+1; setGa(nga);
    const ev={type:"goal_against",minute:parseInt(goalMin)||0,ownGoal,score:gf+"-"+nga,half,id:uid()};
    const newEvents=[...events,ev]; setEvents(()=>newEvents);
    saveGame(buildSnap(newEvents,gf,nga)).catch(()=>{});
    setModal(null);
  };
  const logSub=()=>{
    if(!subOff||!subOn||!subPos)return;
    const newField=onField.map(id=>String(id)===String(subOff)?subOn:id);
    setOnField(newField);
    setPositions(p=>{ const n={...p};n[subOn]=subPos;delete n[subOff];return n; });
    const ev={type:"sub",minute:parseInt(subMin)||0,playerOff:subOff,playerOn:subOn,subType:"tactical",pos:subPos,half,id:uid()};
    const newEvents=[...events,ev]; setEvents(()=>newEvents);
    saveGame(buildSnap(newEvents,gf,ga)).catch(()=>{});
    setModal(null);
  };
  const recalcFieldFromSubs = (evs) => {
    let field = [...(gameInfo.starting || [])].map(String);
    evs
      .filter(e => e.type === "sub")
      .slice()
      .sort((a,b) => (parseInt(a.minute)||0) - (parseInt(b.minute)||0))
      .forEach(e => {
        const off = String(e.playerOff);
        const on = String(e.playerOn);
        field = field.map(id => String(id) === off ? on : String(id));
      });
    return field;
  };
  const openEditEv=ev=>{
    setEditEv(ev);
    setGoalMin(String(ev.minute));
    setScorer(ev.scorer?String(ev.scorer):null);
    setAssist(ev.assist?String(ev.assist):null);
    setSubMin(String(ev.minute));
    setSubOff(ev.playerOff?String(ev.playerOff):null);
    setSubOn(ev.playerOn?String(ev.playerOn):null);
    setSubPos(ev.pos || (ev.playerOn ? (positions[ev.playerOn] || findPlayer(ev.playerOn, allP)?.pos || "MID") : null));
    setModal("edit");
  };
  const saveEditEv=()=>{
    const updatedEvents = events.map(e=>{
      if(e.id!==editEv.id) return e;
      if(editEv.type==="sub") return {...e, minute:parseInt(subMin)||0, playerOff:subOff, playerOn:subOn, pos:subPos};
      if(editEv.type==="goal_for") return {...e, minute:parseInt(goalMin)||0, scorer, assist};
      return {...e, minute:parseInt(goalMin)||0};
    });
    setEvents(updatedEvents);
    if(editEv.type==="sub") {
      const newField = recalcFieldFromSubs(updatedEvents);
      setOnField(newField);
      if(subOn && subPos) setPositions(p=>({...p,[subOn]:subPos}));
    }
    saveGame(buildSnap(updatedEvents,gf,ga)).catch(()=>{});
    setEditEv(null);setModal(null);
  };
  const delEditEv=()=>{
    if(editEv.type==="goal_for")setGf(g=>Math.max(0,g-1)); else if(editEv.type==="goal_against")setGa(g=>Math.max(0,g-1));
    const updatedEvents = events.filter(e=>e.id!==editEv.id);
    setEvents(updatedEvents);
    if(editEv.type==="sub") setOnField(recalcFieldFromSubs(updatedEvents));
    saveGame(buildSnap(updatedEvents, editEv.type==="goal_for"?Math.max(0,gf-1):gf, editEv.type==="goal_against"?Math.max(0,ga-1):ga)).catch(()=>{});
    setEditEv(null);setModal(null);
  };
  const endHalf=()=>{ setRunning(false);setHtMode(true);pauseRef.current=halfLength*60;setSecs(halfLength*60);setModal("halftime"); };
  const start2H=()=>{ setHalf(2);setHtMode(false);setSecs(halfLength*60);pauseRef.current=halfLength*60;setRunning(false);setModal(null); };
  const liveGame={ ...gameInfo,events,scoreFor:gf,scoreAgainst:ga,date:gameDate.current,secondHalfStarting:(half===2||htMode)?[...onField]:gameInfo.secondHalfStarting,formation1H:gameInfo.formation1H||"4-3-3",formation2H,id:gameId.current };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      <div style={{ background:"linear-gradient(135deg,#10243f,#071222 60%,#0b1d36)", padding:"12px 16px", borderBottom:`3px solid ${C.blue}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          {/* Exit now just goes home - game state is saved and restorable */}
          <button onClick={()=>setShowBack(true)} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:13, fontWeight:700, cursor:"pointer", padding:0 }}>{"< Home"}</button>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <button onClick={()=>setRunning(r=>!r)} style={{ background:running?"linear-gradient(135deg,#991b1b,#dc2626)":"linear-gradient(135deg,#15803d,#16a34a)", border:"none", borderRadius:12, padding:"6px 14px", color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer", minWidth:56 }}>{running?"PAUSE":"START"}</button>
            <button onClick={()=>{ setRunning(false);pauseRef.current=initSecs;setSecs(initSecs); }} style={{ background:"#475569", border:"none", borderRadius:12, padding:"6px 10px", color:"#fff", fontWeight:700, fontSize:11, cursor:"pointer" }}>RESET</button>
            <span style={{ fontSize:17, fontWeight:800, color:running?"#60a5fa":"#475569", minWidth:46, textAlign:"center" }}>{timeStr}</span>
          </div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>{htMode?"HALF TIME":half===1?"1st Half":"2nd Half"} · vs {gameInfo.opponent?.split(" ").slice(0,3).join(" ")} {running&&<span style={{ background:"#dc2626", color:"#fff", borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:800, marginLeft:4 }}>LIVE</span>}</div>
          <div style={{ fontSize:56, fontWeight:950, color:"#fff", lineHeight:1, letterSpacing:-2 }}><span style={{ color:"#60a5fa" }}>{gf}</span><span style={{ color:"#334155", margin:"0 10px" }}>-</span><span style={{ color:"#f87171" }}>{ga}</span></div>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(37,99,235,.16)", border:"1px solid rgba(96,165,250,.25)", borderRadius:999, padding:"4px 10px", marginTop:6, fontSize:10, color:"#bfdbfe", fontWeight:800 }}>
            <span>{half===1 ? (gameInfo.formation1H || "4-3-3") : formation2H}</span>
            <span style={{ color:C.muted }}>·</span>
            <span>{onField.length} on field</span>
          </div>
          {!running&&secs===initSecs&&<div style={{ fontSize:10, color:C.amber, marginTop:4 }}>Tap START to begin</div>}
          {!running&&secs>initSecs&&!htMode&&<div style={{ fontSize:10, color:C.amber, marginTop:4 }}>PAUSED — tap START to continue</div>}
          {/* Auto-save indicator */}
          <div style={{ fontSize:9, color:"#064e3b", marginTop:2 }}>💾 Auto-saving — safe to exit and return</div>
        </div>
      </div>

      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:"#081321" }}>
        {[["field","On Field"],["xi","Live XI"],["events","Events"],["bench","Bench"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"12px 4px", background:"none", border:"none", borderBottom:tab===t?`3px solid ${t==="xi"?C.amber:C.blue}`:"3px solid transparent", color:tab===t?(t==="xi"?C.amber:"#60a5fa"):C.muted, fontWeight:700, fontSize:11, cursor:"pointer" }}>{l}</button>
        ))}
      </div>

      <div style={{ padding:12, maxWidth:480, margin:"0 auto" }}>
        {tab==="field"&&<div>
          <FormationField players={onFieldP} positions={positions} title={(half===1 ? (gameInfo.formation1H || "4-3-3") : formation2H) + " LIVE FORMATION"} />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:10 }}>
            {onFieldP.map(p=>(
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:6, background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"8px 10px" }}>
                <PlayerBubble player={p} pos={positions[p.id]} size={28} />
                <div style={{ minWidth:0 }}><div style={{ fontSize:11, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name.split(" ")[0]}</div><div style={{ fontSize:9, color:POS_COLOR[positions[p.id]] }}>{positions[p.id]}</div></div>
              </div>
            ))}
          </div>
        </div>}
        {tab==="xi"&&<LiveOptimumXI events={events} onField={onField} allPlayers={allP} positions={positions} gf={gf} ga={ga} half={half} secs={secs}/>}
        {tab==="events"&&<div>
          <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Tap to edit</div>
          {events.length===0&&<div style={{ color:C.muted, fontSize:13, textAlign:"center", marginTop:30 }}>No events yet</div>}
          {events.slice().reverse().map(ev=>(
            <div key={ev.id} onClick={()=>openEditEv(ev)} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 12px", marginBottom:5, display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
              <span style={{ fontSize:10, fontWeight:800, color:ev.type==="goal_for"?"#60a5fa":ev.type==="goal_against"?"#f87171":C.amber, minWidth:28 }}>{ev.type==="goal_for"?"FOR":ev.type==="goal_against"?"VS":"SUB"}</span>
              <span style={{ fontSize:11, color:"#94a3b8", fontWeight:700, minWidth:24 }}>{ev.minute}'</span>
              <span style={{ fontSize:12, color:C.text, flex:1 }}>{ev.type==="goal_for"?pName(ev.scorer)+(ev.assist?" / "+pName(ev.assist):" (no ast)"):ev.type==="goal_against"?"Goal conceded":pName(ev.playerOff)+" off / "+pName(ev.playerOn)+" on"}</span>
              {ev.score&&<span style={{ fontSize:11, color:C.muted, fontWeight:700 }}>{ev.score}</span>}
            </div>
          ))}
        </div>}
        {tab==="bench"&&<div>
          {benchP.length===0&&<div style={{ color:C.muted, fontSize:13, textAlign:"center", marginTop:30 }}>No players available</div>}
          {benchP.map(p=>(
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, ...card, marginBottom:6 }}>
              <span style={{ width:28, height:28, borderRadius:"50%", background:C.border, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:11, color:"#93c5fd", flexShrink:0 }}>{p.num}</span>
              <span style={{ flex:1, fontWeight:600, fontSize:14, color:C.text }}>{p.name}</span>
              <span style={{ fontSize:11, color:POS_COLOR[p.pos], fontWeight:600 }}>{p.pos}</span>
            </div>
          ))}
        </div>}
      </div>

      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(5,11,22,0.96)", borderTop:`1px solid ${C.border}`, padding:"10px 10px 12px", backdropFilter:"blur(12px)", boxShadow:"0 -12px 30px rgba(0,0,0,0.35)" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, maxWidth:480, margin:"0 auto" }}>
          <button onClick={()=>openGoal("goal_for")} style={{ background:"linear-gradient(135deg,#15803d,#16a34a)", border:"none", borderRadius:18, padding:"20px 8px", color:"#fff", cursor:"pointer", fontSize:15, fontWeight:950, letterSpacing:.3, boxShadow:"0 10px 24px rgba(22,163,74,.22)" }}>⚽ GOAL</button>
          <button onClick={()=>openGoal("goal_against")} style={{ background:"linear-gradient(135deg,#991b1b,#dc2626)", border:"none", borderRadius:18, padding:"20px 8px", color:"#fff", cursor:"pointer", fontSize:15, fontWeight:950, letterSpacing:.3, boxShadow:"0 10px 24px rgba(220,38,38,.18)" }}>⚽ CONCEDE</button>
          <button onClick={()=>openGoal("sub")} style={{ gridColumn:"1 / span 2", background:"linear-gradient(135deg,#1d4ed8,#246BFD)", border:"none", borderRadius:18, padding:"17px 8px", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:950, letterSpacing:.3, boxShadow:"0 10px 24px rgba(37,99,235,.22)" }}>↔ SUBSTITUTION</button>
          {half===1?<button onClick={endHalf} style={{ background:"#111827", border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 8px", color:"#c4b5fd", cursor:"pointer", fontSize:12, fontWeight:900, letterSpacing:.3 }}>⏱ END HALF</button>:<button onClick={()=>setShowEnd(true)} style={{ background:"#111827", border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 8px", color:"#c4b5fd", cursor:"pointer", fontSize:12, fontWeight:900, letterSpacing:.3 }}>■ FULL TIME</button>}
          <button onClick={()=>setRunning(r=>!r)} style={{ background:running?"#7f1d1d":"#064e3b", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, padding:"14px 8px", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:900, letterSpacing:.3 }}>{running?"PAUSE CLOCK":"START CLOCK"}</button>
        </div>
      </div>

      {/* Exit confirmation - now explains game is saved */}
      {showBack&&<Modal title="Leave Game?" onClose={()=>setShowBack(false)}>
        <div style={{ background:"#0d2137", border:`1px solid ${C.green}`, borderRadius:14, padding:12, marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:800, color:C.green, marginBottom:4 }}>✅ Your data is safe!</div>
          <div style={{ fontSize:12, color:"#94a3b8" }}>All goals, subs and the score are saved. When you come back to the home screen you'll see a green <strong>"Resume Game"</strong> banner to pick up where you left off.</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowBack(false)} style={{ ...btn(C.border), flex:1 }}>Stay</button>
          <button onClick={onBack} style={{ ...btn(C.blue), flex:1 }}>Go Home</button>
        </div>
      </Modal>}

      {showEnd&&<Modal title="Full Time?" onClose={()=>setShowEnd(false)}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:48, fontWeight:900, color:"#fff" }}><span style={{ color:"#60a5fa" }}>{gf}</span> - <span style={{ color:"#f87171" }}>{ga}</span></div>
          <div style={{ fontSize:13, color:C.muted }}>vs {gameInfo.opponent?.split(" ").slice(0,3).join(" ")}</div>
        </div>
        <p style={{ color:"#94a3b8", fontSize:13 }}>Saves permanently to Firebase. Editable afterwards.</p>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowEnd(false)} style={{ ...btn(C.border), flex:1 }}>Keep Playing</button>
          <button onClick={()=>{
            setRunning(false);
            clearGameState();
            localStorage.removeItem("ps_clock_running");
            localStorage.removeItem("ps_clock_start");
            localStorage.removeItem("ps_clock_secs");
            onEnd({...liveGame,status:"completed"});
          }} style={{ ...btn(C.blue), flex:2, fontSize:15, fontWeight:800 }}>Save Final Score</button>
        </div>
      </Modal>}

      {modal==="goal_for"&&<Modal title="Goal For!" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl><input value={goalMin} onChange={e=>setGoalMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:12 }}/>
        <button onClick={()=>setOwnGoal(o=>!o)} style={{ padding:"8px 14px", borderRadius:12, background:ownGoal?C.amber:C.border, border:"none", color:ownGoal?"#000":"#94a3b8", fontWeight:700, fontSize:12, cursor:"pointer", marginBottom:12 }}>Own Goal by opponent</button>
        {!ownGoal && (
        <div>
          <Lbl>Scorer</Lbl>
          {onFieldP.map(p => (
            <button
              key={p.id}
              onClick={() => setScorer(String(p.id))}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 14, marginBottom: 5, background: scorer === String(p.id) ? C.blue : C.border, border: scorer === String(p.id) ? "2px solid #60a5fa" : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
            >
              #{p.num} {p.name}
            </button>
          ))}
          <Lbl mt={8}>Assist (optional)</Lbl>
          <button
            onClick={() => setAssist(null)}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: assist === null ? "#475569" : C.border, border: "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
          >
            No Assist / Unknown
          </button>
          {onFieldP.filter(p => String(p.id) !== scorer).map(p => (
            <button
              key={p.id}
              onClick={() => setAssist(assist === String(p.id) ? null : String(p.id))}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: assist === String(p.id) ? "#065f46" : C.border, border: assist === String(p.id) ? `2px solid ${C.green}` : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
            >
              #{p.num} {p.name}
            </button>
          ))}
        </div>
      )}
              <button onClick={logGoalFor} disabled={!ownGoal&&!scorer} style={{ ...btn(!ownGoal&&!scorer?C.border:C.blue,!ownGoal&&!scorer?C.muted:"#fff"), width:"100%", padding:16, fontSize:15, marginTop:8 }}>Log Goal</button>
      </Modal>}

      {modal==="goal_against"&&<Modal title="Goal Against" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl><input value={goalMin} onChange={e=>setGoalMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:16 }}/>
        <button onClick={logGoalAgainst} style={{ ...btn(C.red), width:"100%", padding:16, fontSize:15 }}>Log Goal Against</button>
      </Modal>}

      {modal==="sub"&&<Modal title="Substitution" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl><input value={subMin} onChange={e=>setSubMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:12 }}/>
        <Lbl>Player Off</Lbl>{onFieldP.map(p=><button key={p.id} onClick={()=>setSubOff(String(p.id))} style={{ width:"100%", padding:"11px 14px", borderRadius:14, marginBottom:5, background:subOff===String(p.id)?C.red:C.border, border:subOff===String(p.id)?`2px solid #f87171`:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>#{p.num} {p.name} <span style={{ color:POS_COLOR[positions[p.id]], fontSize:11 }}>- {positions[p.id]}</span></button>)}
        <Lbl mt={8}>Player On</Lbl>
        {benchP.length === 0 && <div style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>No players on bench</div>}
        {benchP.map(p => (
          <button
            key={p.id}
            onClick={() => setSubOn(String(p.id))}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 14, marginBottom: 5, background: subOn === String(p.id) ? "#059669" : C.border, border: subOn === String(p.id) ? `2px solid ${C.green}` : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
          >
            #{p.num} {p.name}
          </button>
        ))}
        {subOn && (
          <div>
            <Lbl mt={8}>Position</Lbl>
            <div style={{ display: "flex", gap: 8 }}>
              {POSITIONS.map(pos => (
                <button key={pos} onClick={() => setSubPos(pos)} style={{ flex: 1, padding: "14px 4px", borderRadius: 14, border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer", background: subPos === pos ? POS_COLOR[pos] : C.border, color: subPos === pos ? "#fff" : C.muted }}>{pos}</button>
              ))}
            </div>
          </div>
        )}
        <button onClick={logSub} disabled={!subOff||!subOn||!subPos} style={{ ...btn(!subOff||!subOn||!subPos?C.border:"#059669",!subOff||!subOn||!subPos?C.muted:"#fff"), width:"100%", padding:16, fontSize:15, marginTop:12 }}>Log Sub</button>
      </Modal>}

      {modal==="edit"&&editEv&&<Modal title="Edit Event" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl><input value={goalMin} onChange={e=>setGoalMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:12 }}/>
        {editEv.type === "goal_for" && (
          <div>
            <Lbl>Scorer</Lbl>
            {allP.map(p => (
              <button
                key={p.id}
                onClick={() => setScorer(String(p.id))}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: scorer === String(p.id) ? C.blue : C.border, border: scorer === String(p.id) ? "2px solid #60a5fa" : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
              >
                #{p.num} {p.name}
              </button>
            ))}
            <Lbl mt={8}>Assist</Lbl>
            <button
              onClick={() => setAssist(null)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: "#475569", border: "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
            >
              No Assist
            </button>
            {allP.filter(p => String(p.id) !== scorer).map(p => (
              <button
                key={p.id}
                onClick={() => setAssist(assist === String(p.id) ? null : String(p.id))}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 14, marginBottom: 5, background: assist === String(p.id) ? "#065f46" : C.border, border: assist === String(p.id) ? `2px solid ${C.green}` : "1px solid #334155", color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}
              >
                #{p.num} {p.name}
              </button>
            ))}
          </div>
        )}
        {editEv.type === "sub" && (
          <div>
            <Lbl>Minute</Lbl>
            <input value={subMin} onChange={e=>setSubMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:12 }}/>
            <Lbl>Player Off</Lbl>
            {allP.map(p => (
              <button
                key={p.id}
                onClick={() => setSubOff(String(p.id))}
                style={{ width:"100%", padding:"10px 14px", borderRadius:14, marginBottom:5, background:subOff===String(p.id)?C.red:C.border, border:subOff===String(p.id)?`2px solid #f87171`:"1px solid #334155", color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}
              >
                #{p.num} {p.name}
              </button>
            ))}
            <Lbl mt={8}>Player On</Lbl>
            {allP.map(p => (
              <button
                key={p.id}
                onClick={() => setSubOn(String(p.id))}
                style={{ width:"100%", padding:"10px 14px", borderRadius:14, marginBottom:5, background:subOn===String(p.id)?"#059669":C.border, border:subOn===String(p.id)?`2px solid ${C.green}`:"1px solid #334155", color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}
              >
                #{p.num} {p.name}
              </button>
            ))}
            <Lbl mt={8}>Position</Lbl>
            <div style={{ display:"flex", gap:8 }}>
              {POSITIONS.map(pos => (
                <button key={pos} onClick={() => setSubPos(pos)} style={{ flex:1, padding:"14px 4px", borderRadius:14, border:"none", fontWeight:800, fontSize:14, cursor:"pointer", background:subPos===pos?POS_COLOR[pos]:C.border, color:subPos===pos?"#fff":C.muted }}>{pos}</button>
              ))}
            </div>
          </div>
        )}
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button onClick={delEditEv} style={{ ...btn("#7f1d1d","#fca5a5"), flex:1 }}>Delete</button>
          <button onClick={saveEditEv} style={{ ...btn(C.blue), flex:2 }}>Save</button>
        </div>
      </Modal>}

      {modal==="halftime"&&<Modal title="Half Time" onClose={()=>setModal(null)}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:56, fontWeight:950, color:"#fff", lineHeight:1, letterSpacing:-2 }}><span style={{ color:"#60a5fa" }}>{gf}</span><span style={{ color:"#334155", margin:"0 12px" }}>-</span><span style={{ color:"#f87171" }}>{ga}</span></div>
          <div style={{ fontSize:12, color:C.green, fontWeight:700, marginTop:6 }}>End of First Half</div>
        </div>
        <Lbl>2nd Half Lineup</Lbl>
        <p style={{ color:"#94a3b8", fontSize:12, marginTop:0, marginBottom:10 }}>Make subs to change who starts.</p>
        {onFieldP.map(p=>(
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#0d2137", border:`1px solid ${C.blue}`, borderRadius:14, padding:"10px 12px", marginBottom:5 }}>
            <span style={{ width:26, height:26, borderRadius:"50%", background:POS_COLOR[positions[p.id]]||C.muted, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:10, color:"#fff", flexShrink:0 }}>{p.num}</span>
            <span style={{ flex:1, fontSize:13, fontWeight:700, color:C.text }}>{p.name}</span>
            <span style={{ fontSize:11, color:POS_COLOR[positions[p.id]], fontWeight:700 }}>{positions[p.id]}</span>
          </div>
        ))}
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
        <div style={{ marginTop:10, marginBottom:12 }}>
          <Lbl>2nd Half Formation</Lbl>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {FORMATIONS.map(f=>(
              <button key={f.id} onClick={()=>setFormation2H(f.id)}
                style={{ padding:"7px 11px", borderRadius:14, border:formation2H===f.id?"2px solid #60a5fa":"1px solid #334155", background:formation2H===f.id?C.blue:C.border, color:formation2H===f.id?"#fff":"#94a3b8", fontWeight:formation2H===f.id?800:600, fontSize:12, cursor:"pointer" }}>
                {f.label}
                <div style={{ fontSize:8, color:formation2H===f.id?"#bfdbfe":C.muted }}>{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
          <button onClick={()=>setModal("sub")} style={{ ...btn("#059669"), flex:1 }}>Make Sub</button>
          <button onClick={start2H} style={{ ...btn(C.blue), flex:2, fontSize:15, fontWeight:800 }}>Start 2nd Half</button>
        </div>
      </Modal>}
    </div>
  );
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function Stats({ games, onBack, onView, isAdmin, defaultTab }) {
  const [view, setView]       = useState(defaultTab || "overview");
  const [compFilter, setCompFilter] = useState("all");
  const [sortBy, setSortBy]   = useState("net80");
  const [sortDir, setSortDir] = useState(-1);
  const [scout, setScout]     = useState(null);
  const [scoutOptSort, setScoutOptSort] = useState("net80");

  // Never include scheduled games in stats
  const playedGames = games.filter(g => g.status !== "scheduled");
  const filteredGames = compFilter === "all" ? playedGames : playedGames.filter(g => g.type === compFilter);
  const allGuests = uniqueGuestsFromGames(games);
  const allP   = [...ROSTER, ...allGuests];
  const allSt  = calcStats(filteredGames);
  const allGF  = filteredGames.flatMap(g => (g.events || []).filter(e => e.type === "goal_for"));
  const allGA  = filteredGames.flatMap(g => (g.events || []).filter(e => e.type === "goal_against"));
  const opps   = [...new Set(filteredGames.map(g => g.opponent))];
  const gf1H   = allGF.filter(e => e.half === 1).length;
  const gf2H   = allGF.filter(e => e.half === 2).length;
  const ga1H   = allGA.filter(e => e.half === 1).length;
  const ga2H   = allGA.filter(e => e.half === 2).length;
  const totalGF = filteredGames.reduce((a, g) => a + g.scoreFor, 0);
  const totalGA = filteredGames.reduce((a, g) => a + g.scoreAgainst, 0);
  const compLabel = compFilter === "all" ? "All Games" : compFilter === "regular" ? "League" : "Cup";

  // ── Clean Sheet Bonus calculation ────────────────────────────────────────
  // For each player, sum up minutes they were on field without a goal conceded
  // Bonus: GK/DEF = 0.5 per full clean game, MID = 0.25, FWD = 0
  // Partial credit: proportional to clean time / total time
  const calcCSBonus = (p) => {
    const pos = p.pos;
    if (pos === "FWD") return 0;
    const maxBonus = pos === "GK" || pos === "DEF" ? 0.5 : 0.25;
    let totalBonus = 0;
    filteredGames.forEach(game => {
      const allEvs = game.events || [];
      const concedes = allEvs.filter(e => e.type === "goal_against").map(e => e.minute).sort((a,b)=>a-b);
      // Build this player's time segments on field
      const pid = String(p.id);
      const s1H = (game.starting || []).map(String);
      const s2H = (game.secondHalfStarting || []).map(String);
      const subs = allEvs.filter(e => e.type === "sub");
      const HALF = 40;
      // Track player time intervals
      let intervals = [];
      let onField = false;
      let entryMin = 0;
      // 1st half
      if (s1H.includes(pid)) { onField = true; entryMin = 0; }
      subs.filter(s=>s.half===1).sort((a,b)=>a.minute-b.minute).forEach(s=>{
        if(String(s.playerOff)===pid && onField){ intervals.push([entryMin,s.minute]); onField=false; }
        if(String(s.playerOn)===pid && !onField){ onField=true; entryMin=s.minute; }
      });
      if(onField) intervals.push([entryMin, HALF]);
      onField = false;
      // 2nd half
      if (s2H.includes(pid)) { onField = true; entryMin = HALF; }
      subs.filter(s=>s.half===2).sort((a,b)=>a.minute-b.minute).forEach(s=>{
        if(String(s.playerOff)===pid && onField){ intervals.push([entryMin,s.minute]); onField=false; }
        if(String(s.playerOn)===pid && !onField){ onField=true; entryMin=s.minute; }
      });
      if(onField) intervals.push([entryMin, HALF*2]);
      if(intervals.length === 0) return;
      // For each interval, calculate clean minutes (no concede during that time)
      let totalMins = 0, cleanMins = 0;
      intervals.forEach(([start, end]) => {
        const dur = end - start;
        totalMins += dur;
        const concedesInInterval = concedes.filter(m => m > start && m <= end).length;
        if(concedesInInterval === 0) { cleanMins += dur; }
        else {
          // Partial: time before first concede in this interval
          const firstConcede = concedes.find(m => m > start && m <= end);
          cleanMins += (firstConcede - start);
        }
      });
      if(totalMins > 0) {
        totalBonus += maxBonus * (cleanMins / totalMins);
      }
    });
    return totalBonus;
  };

  const calcImpact = (p) => {
    const s = allSt[String(p.id)] || {};
    if (!s.mins || s.mins < 80) return null;
    const net80 = s.net80 || 0;
    const goalsPer80 = (s.goals || 0) / s.mins * 80;
    const assistsPer80 = (s.assists || 0) / s.mins * 80;
    const csBonus = calcCSBonus(p);
    return net80 + (goalsPer80 * 0.5) + (assistsPer80 * 0.25) + csBonus;
  };
  const fmtImpact = (v) => v === null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(2);

  const rIds = new Set(ROSTER.map(p => String(p.id)));
  const sortFn = (a, b) => {
    const av = sortBy === "net80" ? (a.net80||0) : sortBy === "impact" ? (a.impact??-999) : (a[sortBy]||0);
    const bv = sortBy === "net80" ? (b.net80||0) : sortBy === "impact" ? (b.impact??-999) : (b[sortBy]||0);
    return sortDir * (bv - av);
  };
  const allWithStats = allP.map(p => ({ ...p, ...(allSt[String(p.id)] || {}), impact: calcImpact(p) })).filter(p => p.played > 0);
  const rosterList = allWithStats.filter(p => rIds.has(String(p.id))).sort(sortFn);
  const guestList  = allWithStats.filter(p => !rIds.has(String(p.id))).sort(sortFn);
  const pList = [...rosterList, ...guestList];
  const toggleSort = k => { if (sortBy === k) setSortDir(d => d*-1); else { setSortBy(k); setSortDir(-1); } };
  const sb = (k, l) => (
    <button key={k} onClick={() => toggleSort(k)} style={{ flex:1, padding:"7px 2px", borderRadius:12, border:"none", fontWeight:700, fontSize:10, cursor:"pointer", background:sortBy===k?C.blue:C.border, color:sortBy===k?"#fff":C.muted }}>
      {l}{sortBy===k?(sortDir===-1?" ▼":" ▲"):""}
    </button>
  );

  const topG = allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.goals>0).sort((a,b)=>b.goals-a.goals);
  const topA = allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.assists>0).sort((a,b)=>b.assists-a.assists);
  const buckets = [{l:"0-10",min:0,max:10},{l:"11-20",min:11,max:20},{l:"21-30",min:21,max:30},{l:"31-40",min:31,max:40},{l:"41-50",min:41,max:50},{l:"51-60",min:51,max:60},{l:"61-70",min:61,max:70},{l:"71-80",min:71,max:80}];

  if (!games || games.length === 0) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:32 }}>
        <div style={{ fontSize:20, fontWeight:700, color:"#60a5fa" }}>No Games Yet</div>
        <button onClick={onBack} style={{ ...btn(C.blue), padding:"14px 28px" }}>Back</button>
      </div>
    );
  }

  const renderOverview = () => (
    <div>
      <div style={card}>
        <Lbl>Season Record — {compLabel}</Lbl>
        <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
          {["W","D","L"].map(r => {
            const c = filteredGames.filter(g=>r==="W"?g.scoreFor>g.scoreAgainst:r==="D"?g.scoreFor===g.scoreAgainst:g.scoreFor<g.scoreAgainst).length;
            return <div key={r}><div style={{ fontSize:36, fontWeight:900, color:r==="W"?"#059669":r==="D"?"#d97706":C.red }}>{c}</div><div style={{ fontSize:11, color:C.muted }}>{r==="W"?"Wins":r==="D"?"Draws":"Losses"}</div></div>;
          })}
          <div><div style={{ fontSize:36, fontWeight:900, color:"#60a5fa" }}>{totalGF}-{totalGA}</div><div style={{ fontSize:11, color:C.muted }}>Goals</div></div>
        </div>
      </div>
      <div style={card}>
        <Lbl>Top Scorers</Lbl>
        {topG.length===0&&<div style={{ color:C.muted, fontSize:13 }}>No goals yet</div>}
        {topG.slice(0,8).map((p,i)=>(
          <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:i<Math.min(7,topG.length-1)?`1px solid ${C.border}`:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:13, color:C.muted, fontWeight:800, width:18 }}>{i+1}</span><span style={{ fontWeight:700, fontSize:14, color:C.text }}>{p.name}</span></div>
            <span style={{ fontSize:22, fontWeight:900, color:"#60a5fa" }}>{p.goals}</span>
          </div>
        ))}
      </div>
      <div style={card}>
        <Lbl>Top Assists</Lbl>
        {topA.length===0&&<div style={{ color:C.muted, fontSize:13 }}>No assists yet</div>}
        {topA.slice(0,8).map((p,i)=>(
          <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:i<Math.min(7,topA.length-1)?`1px solid ${C.border}`:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:13, color:C.muted, fontWeight:800, width:18 }}>{i+1}</span><span style={{ fontWeight:700, fontSize:14, color:C.text }}>{p.name}</span></div>
            <span style={{ fontSize:22, fontWeight:900, color:C.green }}>{p.assists}</span>
          </div>
        ))}
      </div>
      <div style={card}>
        <Lbl>Goals by Half</Lbl>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center" }}>
          {[
            { label:"TOTAL",    gf:totalGF, ga:totalGA, border:`1px solid ${C.border}` },
            { label:"1ST HALF", gf:gf1H,    ga:ga1H,    border:"1px solid #1e3a5f" },
            { label:"2ND HALF", gf:gf2H,    ga:ga2H,    border:"1px solid #1e3a5f" },
          ].map(col => (
            <div key={col.label} style={{ background:"#081321", borderRadius:14, padding:"10px 6px", border:col.border }}>
              <div style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:1, marginBottom:8 }}>{col.label}</div>
              <div style={{ marginBottom:6 }}>
                <div style={{ fontSize:col.label==="TOTAL"?24:20, fontWeight:900, color:"#60a5fa" }}>{col.gf}</div>
                <div style={{ fontSize:9, color:"#60a5fa", opacity:0.7 }}>SCORED</div>
              </div>
              <div style={{ width:"100%", height:1, background:C.border, marginBottom:6 }} />
              <div>
                <div style={{ fontSize:col.label==="TOTAL"?24:20, fontWeight:900, color:"#f87171" }}>{col.ga}</div>
                <div style={{ fontSize:9, color:"#f87171", opacity:0.7 }}>CONCEDED</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={card}>
        <Lbl>Goal Timing (10-min intervals)</Lbl>
        {buckets.map(b=>{
          const gfC=allGF.filter(g=>g.minute>=b.min&&g.minute<=b.max).length;
          const gaC=allGA.filter(g=>g.minute>=b.min&&g.minute<=b.max).length;
          const mx=Math.max(gfC,gaC,1);
          return <div key={b.l} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:11, color:"#94a3b8" }}>{b.l}</span>
              <span style={{ fontSize:11 }}>
                <span style={{ color:"#60a5fa", fontWeight:700 }}>For: {gfC}</span>{"  "}
                <span style={{ color:"#f87171", fontWeight:700 }}>Against: {gaC}</span>
              </span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
              <span style={{ fontSize:9, color:"#60a5fa", width:16 }}>F</span>
              <div style={{ flex:1, background:"#1e293b", borderRadius:3, height:6 }}>
                <div style={{ width:(gfC/mx*100)+"%", background:C.blue, borderRadius:3, height:"100%" }}/>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:9, color:"#f87171", width:16 }}>A</span>
              <div style={{ flex:1, background:"#1e293b", borderRadius:3, height:6 }}>
                <div style={{ width:(gaC/mx*100)+"%", background:C.red, borderRadius:3, height:"100%" }}/>
              </div>
            </div>
          </div>;
        })}
      </div>
      {(() => {
        const gamesWithF = filteredGames.filter(g=>g.formation1H);
        if (gamesWithF.length===0) return null;
        const fStats = {};
        gamesWithF.forEach(g=>{ const f=g.formation1H; if(!fStats[f])fStats[f]={played:0,won:0,drawn:0,lost:0,gf:0,ga:0}; fStats[f].played++; if(g.scoreFor>g.scoreAgainst)fStats[f].won++; else if(g.scoreFor===g.scoreAgainst)fStats[f].drawn++; else fStats[f].lost++; fStats[f].gf+=g.scoreFor; fStats[f].ga+=g.scoreAgainst; });
        return (
          <div style={card}>
            <Lbl>Formations</Lbl>
            {Object.entries(fStats).map(([f,s])=>(
              <div key={f} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #1e3a5f" }}>
                <div><div style={{ fontSize:16, fontWeight:800, color:"#60a5fa" }}>{f}</div><div style={{ fontSize:11, color:C.muted }}>{s.played} games</div></div>
                <div style={{ display:"flex", gap:8 }}>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:"#059669" }}>{s.won}</div><div style={{ fontSize:8, color:C.muted }}>W</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:"#d97706" }}>{s.drawn}</div><div style={{ fontSize:8, color:C.muted }}>D</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:C.red }}>{s.lost}</div><div style={{ fontSize:8, color:C.muted }}>L</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:13, fontWeight:700, color:"#94a3b8" }}>{s.gf}-{s.ga}</div><div style={{ fontSize:8, color:C.muted }}>GF-GA</div></div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
      <Lbl>All Results</Lbl>
      {filteredGames.slice().reverse().map((g,i)=>(
        <button key={i} onClick={()=>onView(g)} style={{ ...card, width:"100%", textAlign:"left", cursor:"pointer", marginBottom:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div><div style={{ fontSize:13, fontWeight:700, color:C.text }}>vs {g.opponent.split(" ").slice(0,3).join(" ")}</div><div style={{ fontSize:11, color:C.muted }}>{g.date} · {g.venue}{g.formation1H?" · "+g.formation1H:""}</div></div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{g.scoreFor}-{g.scoreAgainst}</span><WinBadge gf={g.scoreFor} ga={g.scoreAgainst}/></div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderPlayers = () => (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:8, flexWrap:"wrap" }}>
        {sb("goals","Goals")}{sb("assists","Asst")}{sb("gf","GF")}{sb("ga","GA")}{sb("net80","Net/80")}{sb("impact","Impact")}
      </div>
      <p style={{ color:C.muted, fontSize:11, marginTop:0, marginBottom:12 }}>Primary numbers are Net/80 and Impact. Supporting stats stay smaller so coaches can scan faster. Min 80 total mins.</p>
      {pList.map((p, idx)=>{
        const s=allSt[String(p.id)]||{};
        const impact=calcImpact(p);
        const ic=impact===null?"#94a3b8":impact>0?C.green:impact<0?C.red:"#94a3b8";
        const netVal=parseFloat(s.net80);
        const netColor=netVal>0?C.green:netVal<0?C.red:"#94a3b8";
        const isFirstGuest = !rIds.has(String(p.id)) && (idx===0 || rIds.has(String(pList[idx-1]?.id)));
        return <div key={p.id}>
        {isFirstGuest && guestList.length>0 && <div style={{ fontSize:11, fontWeight:800, color:C.muted, letterSpacing:1, marginTop:12, marginBottom:6 }}>GUEST PLAYERS</div>}
        <div style={{ ...card, border:`1px solid ${C.border}`, opacity: rIds.has(String(p.id))?1:0.78, padding:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <PlayerBubble player={p} pos={p.pos} size={44} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:900, fontSize:16, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
              <div style={{ fontSize:11, color:POS_COLOR[p.pos]||C.muted, fontWeight:800, marginTop:2 }}>{p.pos}</div>
            </div>
            <div style={{ display:"flex", gap:8, flex:1.25 }}>
              <div style={{ flex:1, background:"linear-gradient(180deg,#0d2137,#081321)", border:`1px solid ${C.border}`, borderRadius:14, padding:"9px 8px", textAlign:"center" }}>
                <div style={{ fontSize:28, lineHeight:1, fontWeight:950, color:netColor }}>{s.net80s||"-"}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:5, fontWeight:800, letterSpacing:.5 }}>NET / 80</div>
              </div>
              <div style={{ flex:1, background:"linear-gradient(180deg,#0d2137,#081321)", border:`1px solid ${C.border}`, borderRadius:14, padding:"9px 8px", textAlign:"center" }}>
                <div style={{ fontSize:28, lineHeight:1, fontWeight:950, color:ic }}>{fmtImpact(impact)}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:5, fontWeight:800, letterSpacing:.5 }}>IMPACT</div>
              </div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:1, background:"#1e293b", border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
            {[["GOALS",s.goals,"#60a5fa"],["ASSISTS",s.assists,C.green],["MINS",s.mins,"#e2e8f0"],["AVG",s.avgMins,"#e2e8f0"],["GAMES",s.played,"#e2e8f0"]].map(([l,v,co])=>(
              <div key={l} style={{ background:"#0a1222", padding:"8px 3px", textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:900, color:co }}>{v||0}{l==="MINS"||l==="AVG"?"'":""}</div>
                <div style={{ fontSize:8, color:C.muted, fontWeight:700 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        </div>;
      })}
    </div>
  );

  const [optimumSort, setOptimumSort] = useState("net80");
  const renderOptimum = () => {
    const rosterIds = new Set(ROSTER.map(p=>String(p.id)));
    // Separate rostered players from guests
    const rosterEl = allP.filter(p=>rosterIds.has(String(p.id))).map(p=>({...p,...(allSt[String(p.id)]||{}),impact:calcImpact(p)})).filter(p=>(allSt[String(p.id)]||{}).mins>0);
    const guestEl  = allP.filter(p=>!rosterIds.has(String(p.id))).map(p=>({...p,...(allSt[String(p.id)]||{}),impact:calcImpact(p)})).filter(p=>(allSt[String(p.id)]||{}).mins>0);
    const el = [...rosterEl, ...guestEl];
    // Sort by Net/80 desc, tiebreak by minutes played desc
    const sortedEl=[...el].sort((a,b)=>{ const aV=optimumSort==="impact"?(a.impact??-999):(a.net80||0); const bV=optimumSort==="impact"?(b.impact??-999):(b.net80||0); const d=bV-aV; return d!==0?d:(b.mins||0)-(a.mins||0); });
    // Enforce exactly 1 GK in top 11
    // Build Optimum XI from ROSTERED players only
    const sortedRoster = rosterEl.sort((a,b)=>{ const aV=optimumSort==="impact"?(a.impact??-999):(a.net80||0); const bV=optimumSort==="impact"?(b.impact??-999):(b.net80||0); const d=bV-aV; return d!==0?d:(b.mins||0)-(a.mins||0); });
    const sortedGuests = guestEl.sort((a,b)=>{ const aV=optimumSort==="impact"?(a.impact??-999):(a.net80||0); const bV=optimumSort==="impact"?(b.impact??-999):(b.net80||0); const d=bV-aV; return d!==0?d:(b.mins||0)-(a.mins||0); });
    const bestGK=sortedRoster.find(p=>p.pos==="GK");
    const topOutfield=sortedRoster.filter(p=>p.pos!=="GK").slice(0,10);
    // Fallback: if we don't have 11, pull from all roster players with any mins
    const top11=(bestGK && topOutfield.length>=10)
      ? [bestGK,...topOutfield]
      : sortedEl.filter(p=>rosterIds.has(String(p.id))).slice(0,11);
    const top11ids=new Set(top11.map(p=>String(p.id)));
    const restRoster=sortedRoster.filter(p=>!top11ids.has(String(p.id)));
    const rest=[...restRoster, ...sortedGuests];
    const byPos={GK:[],DEF:[],MID:[],FWD:[]};
    top11.forEach(p=>{ if(byPos[p.pos])byPos[p.pos].push(p); });
    return <div>
      <div style={{ ...card, border:`2px solid ${C.amber}`, marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:800, color:C.amber, marginBottom:8 }}>Season Optimum XI — {compLabel}</div>
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          <button onClick={()=>setOptimumSort("net80")} style={{ flex:1, padding:"8px 4px", borderRadius:12, border:"none", fontWeight:700, fontSize:11, cursor:"pointer", background:optimumSort==="net80"?C.blue:C.border, color:optimumSort==="net80"?"#fff":C.muted }}>Net/80 ▼</button>
          <button onClick={()=>setOptimumSort("impact")} style={{ flex:1, padding:"8px 4px", borderRadius:12, border:"none", fontWeight:700, fontSize:11, cursor:"pointer", background:optimumSort==="impact"?C.amber:C.border, color:optimumSort==="impact"?"#000":C.muted }}>Impact ▼</button>
        </div>
        <div style={{ fontSize:10, color:C.muted }}>1 GK guaranteed · tiebreak by minutes</div>
      </div>
      {["GK","DEF","MID","FWD"].map(pos=>byPos[pos].length>0&&<div key={pos} style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:800, color:POS_COLOR[pos], letterSpacing:1, marginBottom:6 }}>{pos}</div>
        {byPos[pos].map(p=><div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, ...card, border:`1px solid ${C.border}`, marginBottom:5 }}>
          <span style={{ width:28, height:28, borderRadius:"50%", background:POS_COLOR[pos], display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:11, color:"#fff", flexShrink:0 }}>{p.num}</span>
          <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:14, color:C.text }}>{p.name}</div><div style={{ fontSize:10, color:C.muted }}>{p.played} games · {p.mins} mins</div></div>
          <div style={{ display:"flex", gap:6 }}>
            <div style={{ textAlign:"right" }}><div style={{ fontSize:14, fontWeight:900, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:8, color:C.muted }}>NET/80</div></div>
            <div style={{ textAlign:"right" }}><div style={{ fontSize:14, fontWeight:900, color:p.impact>0?C.amber:p.impact<0?C.red:"#94a3b8" }}>{fmtImpact(p.impact)}</div><div style={{ fontSize:8, color:C.muted }}>IMPACT</div></div>
          </div>
        </div>)}
      </div>)}
      {rest.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:800, color:C.muted, letterSpacing:1, marginTop:14, marginBottom:8 }}>OTHERS — Close to XI</div>
          {rest.map((p,i) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#0a1222", border:"1px solid #1e293b", borderRadius:14, padding:"9px 14px", marginBottom:4, opacity:0.75 }}>
              <span style={{ fontSize:12, color:C.muted, width:20 }}>{i+12}.</span>
              <span style={{ flex:1, fontSize:13, color:"#94a3b8" }}>{p.name}</span>
              <span style={{ fontSize:12, fontWeight:700, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</span>
              <span style={{ fontSize:11, color:C.amber, fontWeight:700, marginLeft:6 }}>{fmtImpact(p.impact)}</span>
              <span style={{ fontSize:10, color:C.muted, marginLeft:4 }}>{p.mins}m</span>
            </div>
          ))}
        </div>
      )}
    </div>;
  };

  const renderScoutList = () => (
    <div>
      <p style={{ color:C.muted, fontSize:12, marginTop:0 }}>Tap opponent for full report</p>
      {opps.map(opp=>{
        const og=filteredGames.filter(g=>g.opponent===opp);
        const w=og.filter(g=>g.scoreFor>g.scoreAgainst).length,d=og.filter(g=>g.scoreFor===g.scoreAgainst).length,l=og.filter(g=>g.scoreFor<g.scoreAgainst).length;
        const tf=og.reduce((a,g)=>a+g.scoreFor,0),ta=og.reduce((a,g)=>a+g.scoreAgainst,0);
        return <button key={opp} onClick={()=>setScout(opp)} style={{ ...card, width:"100%", textAlign:"left", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div><div style={{ fontSize:13, fontWeight:700, color:C.text }}>{opp.split(" ").slice(0,4).join(" ")}</div><div style={{ fontSize:11, color:C.muted, marginTop:2 }}>GF: {tf} GA: {ta}</div></div>
          <div style={{ display:"flex", gap:4 }}>
            {w>0&&<span style={{ background:"#059669", color:"#fff", borderRadius:6, padding:"3px 8px", fontSize:12, fontWeight:700 }}>{w}W</span>}
            {d>0&&<span style={{ background:"#d97706", color:"#fff", borderRadius:6, padding:"3px 8px", fontSize:12, fontWeight:700 }}>{d}D</span>}
            {l>0&&<span style={{ background:C.red, color:"#fff", borderRadius:6, padding:"3px 8px", fontSize:12, fontWeight:700 }}>{l}L</span>}
          </div>
        </button>;
      })}
    </div>
  );

  const renderScoutDetail = () => {
    const og=filteredGames.filter(g=>g.opponent===scout);
    const ss=calcStats(og);
    const tf=og.reduce((a,g)=>a+g.scoreFor,0),ta=og.reduce((a,g)=>a+g.scoreAgainst,0);
    const sc=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.goals>0).sort((a,b)=>b.goals-a.goals);
    const sa=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.assists>0).sort((a,b)=>b.assists-a.assists);
    const sm=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.played>0).sort((a,b)=>b.mins-a.mins);
      const optSorted=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.played>0&&p.net80!==null).sort((a,b)=>{ const d=(b.net80||0)-(a.net80||0); return d!==0?d:(b.mins||0)-(a.mins||0); });
      const optGK=optSorted.find(p=>p.pos==="GK");
      const optOutfield=optSorted.filter(p=>p.pos!=="GK").slice(0,10);
      const opt=optGK?[optGK,...optOutfield]:optSorted.slice(0,11);
    const gamesWithF=og.filter(g=>g.formation1H);
    const fStats={};
    gamesWithF.forEach(g=>{ const f=g.formation1H; if(!fStats[f])fStats[f]={played:0,won:0,gf:0,ga:0}; fStats[f].played++; if(g.scoreFor>g.scoreAgainst)fStats[f].won++; fStats[f].gf+=g.scoreFor; fStats[f].ga+=g.scoreAgainst; });
    const bestF=Object.entries(fStats).sort((a,b)=>(b[1].won/b[1].played)-(a[1].won/a[1].played))[0];
    return <div>
      <button onClick={()=>setScout(null)} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:14, fontWeight:700, cursor:"pointer", padding:0, marginBottom:12 }}>{"< All Opponents"}</button>
      <div style={{ fontSize:16, fontWeight:800, color:"#60a5fa", marginBottom:10 }}>{scout.split(" ").slice(0,4).join(" ")}</div>
      <div style={{ ...card, marginBottom:12 }}><div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>{[["Played",og.length,"#94a3b8"],["GF",tf,"#60a5fa"],["GA",ta,"#f87171"],["GD",tf-ta>=0?"+"+String(tf-ta):String(tf-ta),C.green]].map(([l,v,co])=><div key={l}><div style={{ fontSize:28, fontWeight:900, color:co }}>{v}</div><div style={{ fontSize:10, color:C.muted }}>{l}</div></div>)}</div></div>
      {gamesWithF.length>0&&<div style={{ ...card, border:"1px solid #f59e0b", marginBottom:12 }}>
        <Lbl>Formation vs {scout.split(" ")[0]}</Lbl>
        {Object.entries(fStats).map(([f,s])=><div key={f} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #1e3a5f" }}><span style={{ fontSize:15, fontWeight:800, color:"#60a5fa" }}>{f}</span><div style={{ display:"flex", gap:12 }}><span style={{ fontSize:12, color:"#6ee7b7" }}>{s.won}W/{s.played}P</span><span style={{ fontSize:12, color:"#94a3b8" }}>{s.gf}-{s.ga}</span></div></div>)}
        {bestF&&<div style={{ marginTop:8, padding:"6px 10px", background:"linear-gradient(135deg,#064e3b,#065f46)", borderRadius:12 }}><div style={{ fontSize:10, color:"#6ee7b7" }}>BEST FORMATION vs {scout.split(" ")[0]}</div><div style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{bestF[0]}</div></div>}
      </div>}
      {sc.length > 0 && (
        <div style={card}>
          <Lbl>Scorers & Assists</Lbl>
          {sc.map((p,i) => (
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:i<sc.length-1?`1px solid ${C.border}`:"none" }}>
              <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{p.name}</span>
              <div style={{ display:"flex", gap:8 }}>
                {p.goals > 0 && <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:"#60a5fa" }}>{p.goals}</div><div style={{ fontSize:8, color:C.muted }}>G</div></div>}
                {p.assists > 0 && <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:C.green }}>{p.assists}</div><div style={{ fontSize:8, color:C.muted }}>A</div></div>}
              </div>
            </div>
          ))}
          {sa.filter(p=>!sc.find(s=>String(s.id)===String(p.id))).map((p,i) => (
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{p.name}</span>
              <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:C.green }}>{p.assists}</div><div style={{ fontSize:8, color:C.muted }}>A</div></div>
            </div>
          ))}
        </div>
      )}
      <div style={card}><Lbl>Minutes Played</Lbl>{sm.map((p,i)=>{ const avgM = og.length ? Math.round((p.mins||0)/og.length) : (p.mins||0); return <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:i<sm.length-1?`1px solid ${C.border}`:"none" }}><span style={{ fontSize:13, fontWeight:600, color:C.text }}>{p.name}</span><span style={{ fontSize:13, color:C.amber, fontWeight:700 }}>{p.mins}' <span style={{ color:C.muted, fontWeight:600, marginLeft:6 }}>· {avgM}' avg</span></span></div>})}</div>
      {opt.length > 0 && (
        <div style={card}>
          <Lbl>Optimum Team vs {scout.split(" ")[0]}</Lbl>
          <p style={{ fontSize:11, color:C.muted, marginTop:0, marginBottom:8 }}>{og.length} game{og.length!==1?"s":""} · 1 GK · tiebreak by minutes</p>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <button onClick={()=>setScoutOptSort("net80")} style={{ flex:1, padding:"7px 4px", borderRadius:12, border:"none", fontWeight:700, fontSize:10, cursor:"pointer", background:(scoutOptSort||"net80")==="net80"?C.blue:C.border, color:(scoutOptSort||"net80")==="net80"?"#fff":C.muted }}>Net/80 ▼</button>
            <button onClick={()=>setScoutOptSort("impact")} style={{ flex:1, padding:"7px 4px", borderRadius:12, border:"none", fontWeight:700, fontSize:10, cursor:"pointer", background:scoutOptSort==="impact"?C.amber:C.border, color:scoutOptSort==="impact"?"#000":C.muted }}>Impact ▼</button>
          </div>
          {(() => {
            const scImpact = (p) => {
              const s = ss[String(p.id)] || {};
              if(!s.mins || s.mins < 5) return null;
              const pos=p.pos, maxB=pos==="GK"||pos==="DEF"?0.5:pos==="MID"?0.25:0;
              let csB=0;
              if(maxB>0){
                og.forEach(game=>{
                  const concedes=(game.events||[]).filter(e=>e.type==="goal_against").map(e=>e.minute).sort((a,b)=>a-b);
                  const pid=String(p.id), subs=(game.events||[]).filter(e=>e.type==="sub");
                  const HALF=40; let ivs=[],on=false,en=0;
                  if((game.starting||[]).map(String).includes(pid)){on=true;en=0;}
                  subs.filter(s=>s.half===1).sort((a,b)=>a.minute-b.minute).forEach(s=>{if(String(s.playerOff)===pid&&on){ivs.push([en,s.minute]);on=false;}if(String(s.playerOn)===pid&&!on){on=true;en=s.minute;}});
                  if(on)ivs.push([en,HALF]);on=false;en=HALF;
                  if((game.secondHalfStarting||[]).map(String).includes(pid)){on=true;}
                  subs.filter(s=>s.half===2).sort((a,b)=>a.minute-b.minute).forEach(s=>{if(String(s.playerOff)===pid&&on){ivs.push([en,s.minute]);on=false;}if(String(s.playerOn)===pid&&!on){on=true;en=s.minute;}});
                  if(on)ivs.push([en,HALF*2]);
                  let tM=0,cM=0;ivs.forEach(([st,e])=>{tM+=e-st;const cc=concedes.filter(m=>m>st&&m<=e);if(cc.length===0){cM+=e-st;}else{cM+=cc[0]-st;}});
                  if(tM>0)csB+=maxB*(cM/tM);
                });
              }
              return (s.net80||0)+(s.goals||0)/s.mins*80*0.5+(s.assists||0)/s.mins*80*0.25+csB;
            };
            const fmtSI = (v) => v===null?"-":(v>=0?"+":"")+v.toFixed(2);
            const scRosterIds = new Set(ROSTER.map(p=>String(p.id)));
            const optFull = allP.map(p=>({...p,...(ss[String(p.id)]||{}),impact:scImpact(p)})).filter(p=>(ss[String(p.id)]||{}).mins>0&&scRosterIds.has(String(p.id)));
            const sortedFull = [...optFull].sort((a,b)=>{ const av=(scoutOptSort||"net80")==="impact"?(a.impact??-999):(a.net80||0); const bv=(scoutOptSort||"net80")==="impact"?(b.impact??-999):(b.net80||0); const d=bv-av; return d!==0?d:(b.mins||0)-(a.mins||0); });
            const sGK=sortedFull.find(p=>p.pos==="GK");
            const sOut=sortedFull.filter(p=>p.pos!=="GK").slice(0,10);
            const sXI=sGK?[sGK,...sOut]:sortedFull.slice(0,11);
            return sXI.map((p,i)=>(
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:i<sXI.length-1?`1px solid ${C.border}`:"none" }}>
                <span style={{ fontSize:12, color:C.muted, width:18 }}>{i+1}.</span>
                <span style={{ flex:1, fontSize:13, fontWeight:700, color:C.text }}>{p.name}</span>
                <span style={{ fontSize:10, color:POS_COLOR[p.pos]||C.muted, fontWeight:700, marginRight:4 }}>{p.pos}</span>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:12, fontWeight:800, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:8, color:C.muted }}>NET/80</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:12, fontWeight:800, color:p.impact>0?C.amber:p.impact<0?C.red:"#94a3b8" }}>{fmtSI(p.impact)}</div><div style={{ fontSize:8, color:C.muted }}>IMPACT</div></div>
                </div>
              </div>
            ));
          })()}
          {(() => {
            // Show players who didn't make XI
            const scRosterIds2 = new Set(ROSTER.map(p=>String(p.id)));
            const scImpact2 = (p) => { const s=ss[String(p.id)]||{}; if(!s.mins||s.mins<5)return null; return (s.net80||0)+(s.goals||0)/s.mins*80*0.5+(s.assists||0)/s.mins*80*0.25; };
            const fmtSI2 = (v) => v===null?"-":(v>=0?"+":"")+v.toFixed(2);
            const allScout = allP.map(p=>({...p,...(ss[String(p.id)]||{}),impact:scImpact2(p)})).filter(p=>(ss[String(p.id)]||{}).mins>0&&scRosterIds2.has(String(p.id)));
            const sortedAll = [...allScout].sort((a,b)=>{ const av=(scoutOptSort||"net80")==="impact"?(a.impact??-999):(a.net80||0); const bv=(scoutOptSort||"net80")==="impact"?(b.impact??-999):(b.net80||0); const d=bv-av; return d!==0?d:(b.mins||0)-(a.mins||0); });
            const sGK2=sortedAll.find(p=>p.pos==="GK");
            const sOut2=sortedAll.filter(p=>p.pos!=="GK").slice(0,10);
            const sXI2ids=new Set((sGK2?[sGK2,...sOut2]:sortedAll.slice(0,11)).map(p=>String(p.id)));
            const scOthers=sortedAll.filter(p=>!sXI2ids.has(String(p.id)));
            if(scOthers.length===0) return null;
            return (
              <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:800, letterSpacing:1, marginBottom:6 }}>OTHERS — Close to XI</div>
                {scOthers.map((p,i)=>(
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:i<scOthers.length-1?`1px solid ${C.border}`:"none", opacity:0.7 }}>
                    <span style={{ fontSize:11, color:C.muted, width:18 }}>{sXI2ids.size+i+1}.</span>
                    <span style={{ flex:1, fontSize:12, color:"#94a3b8" }}>{p.name}</span>
                    <span style={{ fontSize:9, color:POS_COLOR[p.pos]||C.muted, fontWeight:700, marginRight:4 }}>{p.pos}</span>
                    <div style={{ display:"flex", gap:4 }}>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:7, color:C.muted }}>NET/80</div></div>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:p.impact>0?C.amber:"#94a3b8" }}>{fmtSI2(p.impact)}</div><div style={{ fontSize:7, color:C.muted }}>IMPACT</div></div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
      {og.map((g,gi)=><MomentumTimeline key={g.id || gi} game={g} title={`Match Flow · ${g.date}`} compact />)}
      <Lbl>Goal Timeline</Lbl>
      {og.map((g,gi) => {
        const gEvs = (g.events||[]).filter(e=>e.type==="goal_for"||e.type==="goal_against").sort((a,b)=>a.minute-b.minute);
        if(gEvs.length===0) return null;
        const allPlayers = g.allPlayers || ROSTER;
        const pName = (id) => { const p=allPlayers.find(p=>String(p.id)===String(id)); return p?p.name.split(" ")[0]:"?"; };
        return (
          <div key={gi} style={{ ...card, marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{g.date} — {g.venue}</span>
              <WinBadge gf={g.scoreFor} ga={g.scoreAgainst}/>
            </div>
            {gEvs.map((e,ei) => (
              <div key={ei} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:ei<gEvs.length-1?`1px solid ${C.border}`:"none" }}>
                <span style={{ fontSize:12, fontWeight:800, color:e.type==="goal_for"?"#60a5fa":"#f87171", minWidth:30 }}>{e.minute}'</span>
                {e.type==="goal_for"
                  ? <span style={{ fontSize:12, color:C.text }}>{pName(e.scorer)}<span style={{ color:C.green }}> ⚽</span>{e.assist?<span style={{ fontSize:11, color:C.muted }}> · Ast: {pName(e.assist)}</span>:null}</span>
                  : <span style={{ fontSize:12, color:"#f87171" }}>Goal conceded</span>
                }
              </div>
            ))}
          </div>
        );
      })}
      <Lbl>Results</Lbl>
      {og.map((g,i) => (
        <button key={i} onClick={() => onView(g)} style={{ ...card, width:"100%", textAlign:"left", cursor:"pointer", marginBottom:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, color:C.muted }}>{g.date} · {g.venue}</span>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{g.scoreFor}-{g.scoreAgainst}</span>
              <WinBadge gf={g.scoreFor} ga={g.scoreAgainst} />
            </div>
          </div>
        </button>
      ))}
    </div>;
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:32 }}>
      <div style={{ background:"linear-gradient(135deg,#10243f,#071222 60%,#0b1d36)", padding:16, borderBottom:`3px solid ${C.blue}`, display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:20, cursor:"pointer", padding:0, fontWeight:800 }}>{"<"}</button>
        <div><div style={{ fontSize:18, fontWeight:800, color:"#60a5fa" }}>Season Stats</div><div style={{ fontSize:11, color:C.muted }}>{filteredGames.length} games · {compLabel}</div></div>
      </div>
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:"#081321" }}>
        {[["overview","Overview"],["players","Players"],["optimum","Optimum"],["scouting","Scouting"]].map(([t,l])=>(
          <button key={t} onClick={()=>{ setView(t);setScout(null); }} style={{ flex:1, padding:"13px 2px", background:"none", border:"none", borderBottom:view===t?`3px solid ${C.blue}`:"3px solid transparent", color:view===t?"#60a5fa":C.muted, fontWeight:700, fontSize:11, cursor:"pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ display:"flex", background:"#060e1a", borderBottom:"1px solid #0f172a" }}>
        {[["all","All"],["regular","⚽ League"],["tournament","🏆 Cup"]].map(([k,l])=>(
          <button key={k} onClick={()=>{ setCompFilter(k);setScout(null); }} style={{ flex:1, padding:"9px 2px", background:"none", border:"none", borderBottom:compFilter===k?(k==="tournament"?`3px solid ${C.purple}`:k==="regular"?`3px solid ${C.green}`:`3px solid ${C.blue}`):"3px solid transparent", color:compFilter===k?(k==="tournament"?"#a78bfa":k==="regular"?"#6ee7b7":"#60a5fa"):C.muted, fontWeight:700, fontSize:11, cursor:"pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ padding:14, maxWidth:480, margin:"0 auto" }}>
        {filteredGames.length===0
          ? <div style={{ textAlign:"center", color:C.muted, fontSize:14, marginTop:40 }}>No {compLabel} games yet</div>
          : <div>
              {view==="overview"  && renderOverview()}
              {view==="players"   && renderPlayers()}
              {view==="optimum"   && renderOptimum()}
              {view==="scouting"  && (scout ? renderScoutDetail() : renderScoutList())}
            </div>
        }
      </div>
    </div>
  );
}

// ─── PLAYERS ──────────────────────────────────────────────────────────────────
function Players({ games, onBack, isAdmin }) {
  const [selected,setSelected]=useState(null);
  const allGuests=uniqueGuestsFromGames(games);
  const allP=[...ROSTER,...allGuests]; const allSt=calcStats(games);
  const playerList=allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.played>0).sort((a,b)=>(b.net80||0)-(a.net80||0));
  const metricColor = v => parseFloat(v)>0 ? C.green : parseFloat(v)<0 ? C.red : "#94a3b8";
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      <div style={{ background:"linear-gradient(135deg,#10243f,#071222 60%,#0b1d36)", padding:16, borderBottom:`3px solid ${C.blue}` }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:13, fontWeight:800, cursor:"pointer", padding:0, marginBottom:8 }}>{"< Back"}</button>
        <div style={{ fontSize:13, fontWeight:800, color:"#60a5fa", letterSpacing:3, marginBottom:4 }}>PITCHSIDE</div>
        <div style={{ fontSize:22, fontWeight:950, color:"#fff" }}>Player Cards</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{playerList.length} players with match data · sorted by Net/80</div>
      </div>
      <div style={{ padding:14, maxWidth:480, margin:"0 auto" }}>
        {playerList.map((p,i)=>{ const s=allSt[String(p.id)]||{}; return(
          <div key={p.id} onClick={()=>setSelected(p)} style={{ background:"linear-gradient(135deg,#0f1b2d,#0a1322)", border:`1px solid ${C.border}`, borderRadius:18, padding:14, marginBottom:10, cursor:"pointer", boxShadow:"0 10px 24px rgba(0,0,0,.18)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <PlayerBubble player={p} pos={p.pos} size={44} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ fontWeight:900, fontSize:15, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span><span style={{ background:POS_COLOR[p.pos]||C.border, color:"#fff", borderRadius:999, padding:"2px 7px", fontSize:9, fontWeight:900 }}>{p.pos}</span></div>
                <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{s.played} games · {s.mins}' total · {s.avgMins||0}' avg</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:28, fontWeight:950, color:metricColor(s.net80), lineHeight:1 }}>{s.net80s||"-"}</div>
                <div style={{ fontSize:9, color:C.muted, fontWeight:800 }}>NET / 80</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:14 }}>
              {[["Impact", s.impactS || (s.impact!==undefined ? (s.impact>=0?"+":"")+s.impact.toFixed(2) : "-"), C.amber],["Goals", s.goals||0, "#60a5fa"],["Assists", s.assists||0, C.green],["Mins", s.mins||0, "#cbd5e1"]].map(([l,v,c])=>(
                <div key={l} style={{ background:"rgba(15,23,42,.75)", border:`1px solid ${C.border}`, borderRadius:12, padding:"9px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:15, fontWeight:950, color:c }}>{v}</div>
                  <div style={{ fontSize:8, color:C.muted, fontWeight:800, letterSpacing:.5 }}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        );})}
        {playerList.length===0&&<div style={{ color:C.muted, fontSize:14, textAlign:"center", marginTop:40 }}>Play some games first to see player stats</div>}
      </div>
      {selected&&(
        <Modal title={selected.name} onClose={()=>setSelected(null)}>
          {(() => { const s=allSt[String(selected.id)]||{}; return <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <PlayerBubble player={selected} pos={selected.pos} size={54} />
              <div><div style={{ fontSize:18, fontWeight:950, color:"#fff" }}>{selected.name}</div><div style={{ fontSize:11, color:POS_COLOR[selected.pos]||C.muted, fontWeight:800 }}>{selected.pos} · #{selected.num}</div></div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              {[["Net/80", s.net80s||"-", metricColor(s.net80)],["Impact", s.impactS || (s.impact!==undefined ? (s.impact>=0?"+":"")+s.impact.toFixed(2) : "-"), C.amber],["Total Minutes", (s.mins||0)+"'", "#cbd5e1"],["Avg Minutes", (s.avgMins||0)+"'", "#94a3b8"],["Goals", s.goals||0, "#60a5fa"],["Assists", s.assists||0, C.green]].map(([l,v,c])=>(
                <div key={l} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:12, textAlign:"center" }}><div style={{ fontSize:24, fontWeight:950, color:c }}>{v}</div><div style={{ fontSize:10, color:C.muted, fontWeight:800 }}>{l}</div></div>
              ))}
            </div>
          </div>; })()}
        </Modal>
      )}
    </div>
  );
}


// ─── KEYSTONE FC GAME BUILDER ─────────────────────────────────────────────────
function makeKeystoneGame(roster) {
  const pid = (first, lastInit) => {
    const f = first.toLowerCase();
    let match;
    if (lastInit) {
      match = roster.find(p => p.name.split(" ")[0].toLowerCase() === f && (p.name.split(" ")[1] || "").toLowerCase().startsWith(lastInit.toLowerCase()));
    }
    if (!match) match = roster.find(p => p.name.split(" ")[0].toLowerCase() === f);
    return match ? String(match.id) : null;
  };
  // Use direct IDs from roster - guaranteed correct
  const emilyId    = "1";   // Emily Gandel GK
  const lilyKId    = "17";  // Lily Kaye DEF
  const lilyNId    = "13";  // Lilly Nipper DEF
  const avaId      = "16";  // Avah Scott DEF
  const aureliaId  = "15";  // Aurelia Berkowicz DEF
  const juliaId    = "7";   // Julia Flory MID
  const brookeId   = "14";  // Brooke Schuyler MID
  const laineyId   = "22";  // Lainey Pearson-Moore MID
  const abbyId     = "19";  // Abigail Yun FWD
  const caitDId    = "2";   // Caitlyn Dunkelberger FWD
  const maariyahId = "5";   // Maariyah Ali MID
  const ashleyId   = "3";   // Ashley Ellis FWD
  const sadieId    = "6";   // Sadie Feldman MID
  const emmaId     = "11";  // Emma Young GK

  // 1st half starting XI: Emily, Lily K, Ava, Aurelia, Julia, Brooke, Lainey, Abby, Caitlin D, Lily N, Ashley
  // 1st half XI (11 unique players confirmed):
  // Emily(1), LilyK(17), Avah(16), Aurelia(15), Julia(7), Brooke(14), Lainey(22), Abigail(19), CaitlynD(2), LillyN(13), Ashley(3)
  const starting = ["1","17","16","15","7","14","22","19","2","13","3"];

  const events = [];
  // 1st half subs
  events.push({ type:"sub", minute:14, playerOff:aureliaId, playerOn:maariyahId, half:1, id:uid() });
  events.push({ type:"sub", minute:22, playerOff:brookeId,  playerOn:sadieId,    half:1, id:uid() });
  // 2nd half subs @12min (=52 total)
  events.push({ type:"sub", minute:52, playerOff:lilyNId,    playerOn:sadieId,    half:2, id:uid() });
  events.push({ type:"sub", minute:52, playerOff:maariyahId, playerOn:brookeId,   half:2, id:uid() });
  // 2nd half subs @19min (=59 total)
  events.push({ type:"sub", minute:59, playerOff:emilyId,    playerOn:emmaId,     half:2, id:uid() });
  events.push({ type:"sub", minute:59, playerOff:laineyId,   playerOn:maariyahId, half:2, id:uid() });
  events.push({ type:"sub", minute:59, playerOff:abbyId,     playerOn:lilyNId,    half:2, id:uid() });
  // 2nd half subs @27min (=67 total)
  events.push({ type:"sub", minute:67, playerOff:maariyahId, playerOn:laineyId,   half:2, id:uid() });
  events.push({ type:"sub", minute:67, playerOff:sadieId,    playerOn:abbyId,     half:2, id:uid() });
  // Goals: they score @71, we score @72 (Caitlin D, assist Lainey)
  events.push({ type:"goal_against", minute:71, score:"0-1", half:2, id:uid() });
  events.push({ type:"goal_for", minute:72, scorer:caitDId, assist:laineyId, score:"1-1", half:2, id:uid() });

  // 2nd half XI (11 unique players confirmed):
  // Ashley(3), LilyK(17), Abigail(19), CaitlynD(2), Lainey(22), Maariyah(5), Avah(16), LillyN(13), Aurelia(15), Emily(1), Julia(7)
  const secondHalfStarting = ["3","17","19","2","22","5","16","13","15","1","7"];

  return {
    id: "5-16-2026-keystone-fc",
    opponent: "Keystone FC",
    date: "5/16/2026",
    venue: "Away",
    type: "regular",
    scoreFor: 1,
    scoreAgainst: 1,
    formation1H: "4-4-2",
    formation2H: "4-4-2",
    starting,
    secondHalfStarting,
    positions: Object.fromEntries(starting.map(id => [id, roster.find(p => String(p.id) === String(id))?.pos || "MID"])),
    events,
    allPlayers: roster,
    status: "completed",
  };
}


// ─── ALL NEW SEASON GAMES ────────────────────────────────────────────────────
function makeAllNewGames() {
  const u = () => Math.random().toString(36).slice(2,9);
  const sub = (min, on, off, half) => ({ type:"sub", minute:min, playerOn:String(on), playerOff:String(off), half, id:u() });
  const gf  = (min, sc, ast, score, half) => ({ type:"goal_for", minute:min, scorer:String(sc), assist:ast?String(ast):null, score, half, id:u() });
  const ga  = (min, score, half) => ({ type:"goal_against", minute:min, score, half, id:u() });
  const ALLP = [
    {id:1,num:"1",name:"Emily Gandel",pos:"GK"},{id:2,num:"2",name:"Caitlyn Dunkelberger",pos:"FWD"},
    {id:3,num:"3",name:"Ashley Ellis",pos:"FWD"},{id:4,num:"4",name:"Hailey Ferguson",pos:"DEF"},
    {id:5,num:"5",name:"Maariyah Ali",pos:"MID"},{id:6,num:"6",name:"Sadie Feldman",pos:"MID"},
    {id:7,num:"7",name:"Julia Flory",pos:"MID"},{id:8,num:"8",name:"Katelyn Hannan",pos:"MID"},
    {id:11,num:"11",name:"Emma Young",pos:"GK"},{id:12,num:"12",name:"Sloane Pietryka",pos:"FWD"},
    {id:13,num:"13",name:"Lilly Nipper",pos:"DEF"},{id:14,num:"14",name:"Brooke Schuyler",pos:"MID"},
    {id:15,num:"15",name:"Aurelia Berkowicz",pos:"DEF"},{id:16,num:"16",name:"Avah Scott",pos:"DEF"},
    {id:17,num:"17",name:"Lily Kaye",pos:"DEF"},{id:18,num:"18",name:"Emerson Yonker",pos:"MID"},
    {id:19,num:"19",name:"Abigail Yun",pos:"FWD"},{id:22,num:"22",name:"Lainey Pearson-Moore",pos:"MID"}
  ];
  return [
    // Game 1: Keystone GA, Nov 23 2025, Away, 0-0 D
    { id:"2025-11-23-keystone-ga", opponent:"Keystone FC 11G Aspire", date:"11/23/2025", venue:"Away", type:"regular", scoreFor:0, scoreAgainst:0, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["1","2","8","17","4","7","19","18","3","13","16"],
      secondHalfStarting:["1","16","8","17","4","2","7","19","18","14","22"],
      events:[sub(19,5,4,1),sub(25,14,2,1),sub(25,22,19,1),sub(48,13,8,2),sub(48,5,22,2),sub(65,22,14,2)]
    },
    // Game 2: PPA, Dec 13 2025, Home, 2-0 W
    { id:"2025-12-13-ppa", opponent:"The Player Progression Academy 11G Aspire", date:"12/13/2025", venue:"Home", type:"regular", scoreFor:2, scoreAgainst:0, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["1","16","17","22","14","2","12","13","3","7","18"],
      secondHalfStarting:["1","16","17","22","14","2","12","13","3","7","18"],
      events:[sub(21,5,14,1),sub(21,8,16,1),sub(21,19,3,1),sub(26,15,18,1),sub(26,6,13,1),sub(57,5,14,2),sub(57,6,2,2),sub(57,15,12,2),sub(57,8,16,2),sub(57,19,18,2),sub(71,16,3,2),sub(71,2,13,2),sub(71,14,6,2),sub(71,18,22,2),gf(41,18,3,"1-0",2),gf(53,3,12,"2-0",2)]
    },
    // Game 3: Coppermine, Feb 21 2026, Home, 4-1 W
    { id:"2026-02-21-coppermine", opponent:"Coppermine Soccer Club 11G Aspire", date:"2/21/2026", venue:"Home", type:"regular", scoreFor:4, scoreAgainst:1, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["19","22","6","14","7","1","17","12","3","18","13"],
      secondHalfStarting:["19","22","6","14","7","11","17","12","3","2","13"],
      events:[sub(24,8,22,1),sub(59,13,6,2),sub(59,18,12,2),sub(68,12,3,2),gf(16,3,null,"1-0",1),gf(23,12,18,"2-0",1),gf(52,2,null,"3-0",2),ga(55,"3-1",2),gf(72,18,2,"4-1",2)]
    },
    // Game 4: PPA, Feb 28 2026, Home, 2-2 D
    { id:"2026-02-28-ppa", opponent:"The Player Progression Academy 11G Aspire", date:"2/28/2026", venue:"Home", type:"regular", scoreFor:2, scoreAgainst:2, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["12","18","19","14","13","16","1","4","7","22","3"],
      secondHalfStarting:["4","22","6","2","19","16","1","12","3","7","13"],
      events:[sub(10,2,19,1),sub(10,8,4,1),sub(24,6,13,1),sub(24,15,22,1),sub(30,4,8,1),sub(55,14,6,2),sub(71,15,22,2),sub(71,8,4,2),ga(7,"0-1",1),gf(75,8,null,"1-1",2),ga(82,"1-2",2),gf(83,12,3,"2-2",2)]
    },
    // Game 5: Baltimore Celtic, Mar 28 2026, Away, 5-0 W
    { id:"2026-03-28-baltimore-celtic", opponent:"Baltimore Celtic Soccer Club 11G Aspire", date:"3/28/2026", venue:"Away", type:"regular", scoreFor:5, scoreAgainst:0, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["2","12","5","13","3","1","16","17","22","8","18"],
      secondHalfStarting:["19","6","5","16","22","17","11","14","2","15","13"],
      events:[sub(20,14,5,1),sub(25,5,2,1),sub(25,15,18,1),sub(25,19,13,1),sub(25,6,8,1),sub(57,8,22,2),sub(57,3,6,2),sub(61,22,8,2),sub(61,12,19,2),sub(74,2,3,2),gf(2,13,null,"1-0",1),gf(13,2,12,"2-0",1),gf(23,18,null,"3-0",1),gf(65,18,12,"4-0",2),gf(75,2,12,"5-0",2)]
    },
    // Game 6: Huntingdon Valley, Mar 29 2026, Away, 0-2 L (Emily outfield, Emma GK)
    { id:"2026-03-29-huntingdon-valley", opponent:"Huntingdon Valley AA 11G Aspire", date:"3/29/2026", venue:"Away", type:"regular", scoreFor:0, scoreAgainst:2, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["2","14","22","16","3","1","11","15","17","12","13"],
      secondHalfStarting:["2","14","22","16","3","1","11","15","17","12","13"],
      events:[ga(56,"0-1",2),ga(72,"0-2",2)]
    },
    // Game 7: Huntingdon Valley, Apr 11 2026, Home, 3-1 W
    { id:"2026-04-11-huntingdon-valley", opponent:"Huntingdon Valley AA 11G Aspire", date:"4/11/2026", venue:"Home", type:"regular", scoreFor:3, scoreAgainst:1, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["12","18","2","22","13","5","3","17","1","8","16"],
      secondHalfStarting:["5","19","16","8","2","11","3","18","13","17","12"],
      events:[sub(17,19,2,1),sub(17,7,8,1),sub(24,15,5,1),sub(24,14,13,1),sub(24,6,18,1),sub(50,22,12,2),sub(63,14,5,2),sub(63,6,18,2),ga(16,"0-1",1),gf(18,19,18,"1-1",1),gf(39,19,12,"2-1",1),gf(49,18,12,"3-1",2)]
    },
    // Game 8: LVU Rush, Apr 12 2026, Home, 1-1 D
    { id:"2026-04-12-lvu-rush", opponent:"LVU Rush 11G Aspire", date:"4/12/2026", venue:"Home", type:"regular", scoreFor:1, scoreAgainst:1, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["1","12","13","18","2","19","17","16","3","22","7"],
      secondHalfStarting:["11","2","18","14","17","7","12","16","22","8","13"],
      events:[sub(15,5,2,1),sub(15,14,13,1),sub(28,15,7,1),sub(28,13,22,1),sub(28,6,18,1),sub(59,19,8,2),sub(66,5,14,2),sub(66,15,13,2),sub(66,6,2,2),gf(12,19,12,"1-0",1),ga(35,"1-1",1)]
    },
    // Game 9: Potomac, Apr 26 2026, Home, 0-3 L
    { id:"2026-04-26-potomac", opponent:"Potomac Soccer Association 11G Aspire", date:"4/26/2026", venue:"Home", type:"regular", scoreFor:0, scoreAgainst:3, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["12","2","13","3","22","16","1","8","14","17","7"],
      secondHalfStarting:["19","3","12","5","2","14","16","7","8","17","11"],
      events:[sub(24,5,14,1),sub(24,19,2,1),sub(61,15,7,2),sub(67,22,8,2),sub(67,7,14,2),sub(73,14,22,2),ga(34,"0-1",1),ga(37,"0-2",1),ga(51,"0-3",2)]
    },
    // Game 10: Potomac, May 2 2026, Home, 2-1 W
    { id:"2026-05-02-potomac", opponent:"Potomac Soccer Association 11G Aspire", date:"5/2/2026", venue:"Home", type:"regular", scoreFor:2, scoreAgainst:1, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["12","19","2","14","3","22","8","17","16","7","1"],
      secondHalfStarting:["11","3","8","17","16","2","14","12","19","22","7"],
      events:[sub(12,15,19,1),sub(23,5,22,1),sub(23,13,14,1),sub(46,15,8,2),sub(46,13,22,2),sub(51,5,14,2),gf(13,12,8,"1-0",1),gf(59,2,12,"2-0",2),ga(66,"2-1",2)]
    },
    // Game 11: Baltimore Celtic, May 3 2026, Home, 2-0 W
    { id:"2026-05-03-baltimore-celtic", opponent:"Baltimore Celtic Soccer Club 11G Aspire", date:"5/3/2026", venue:"Home", type:"regular", scoreFor:2, scoreAgainst:0, status:"completed", formation1H:"4-4-2", formation2H:"4-4-2", allPlayers:ALLP,
      starting:["19","2","12","3","5","14","15","17","1","7","8"],
      secondHalfStarting:["12","3","19","2","13","8","14","7","1","15","17"],
      events:[sub(13,22,5,1),sub(21,13,14,1),sub(59,22,13,2),sub(64,5,14,2),sub(64,13,19,2),gf(19,2,12,"1-0",2),gf(71,12,13,"2-0",2)]
    },
  ];
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]       = useState("home");
  const [gameInfo,setGameInfo]   = useState(null);
  const [games,setGames]         = useState([]);
  const [loading,setLoading]     = useState(true);
  const [viewing,setViewing]     = useState(null);
  const [isAdmin,setIsAdmin]     = useState(()=>localStorage.getItem("ps_admin")==="1");
  const [showPin,setShowPin]     = useState(false);
  const [prevScreen,setPrevScreen]=useState("home");
  const [statsTab,setStatsTab]   = useState("overview");
  // Resume state loaded from localStorage
  const [resumeState,setResumeState] = useState(()=>loadGameState());
  const seeded = useRef(false);

  useEffect(()=>{
    let cancelled = false;
    const safeSetLoaded = (nextGames) => {
      if (cancelled) return;
      setGames((nextGames || []).map(g => canonicalizeGuestPlayers(g).game));
      setLoading(false);
    };

    const runBackgroundMaintenance = async (fbGames) => {
      try {
        if (!fbGames || fbGames.length === 0 || seeded.current) return;
        seeded.current = true;

        // Seed only if Firebase is truly empty. Do this in the background so the app never hangs on the loading screen.
        if (fbGames.length === 0) {
          await saveGame(makeLVURush());
          await saveGame(makeCoppermine());
          await saveGame(makeKeystoneGame(ROSTER));
          for (const g of makeAllNewGames()) await saveGame(g);
          return;
        }

        // Lightweight formation backfill only. Never block the app from loading.
        if(!localStorage.getItem("ps_patched_formations")) {
          const needsPatch = fbGames.filter(g =>
            !g.formation1H &&
            g.status !== "scheduled" &&
            g.status !== "in_progress"
          ).slice(0, 5);
          for(const g of needsPatch) {
            await saveGame({...g, formation1H:"4-4-2", formation2H:"4-4-2"});
          }
          localStorage.setItem("ps_patched_formations", "1");
        }
      } catch(e) {
        console.error("PitchSide background maintenance skipped:", e);
      }
    };

    try {
      const unsub = listenToGames((fbGames=[]) => {
        safeSetLoaded(fbGames);
        runBackgroundMaintenance(fbGames);
      });
      return () => { cancelled = true; if (typeof unsub === "function") unsub(); };
    } catch(e) {
      console.error("PitchSide failed to connect to Firebase:", e);
      safeSetLoaded([]);
      return () => { cancelled = true; };
    }
  },[]);

  const updateGame=g=>{ setViewing(g);setGames(prev=>prev.map(x=>x.id===g.id?g:x)); };
  const handleDelete=async g=>{ if(window.confirm("Delete "+g.opponent+"? This cannot be undone.")){ await deleteGame(g.id);setGames(prev=>prev.filter(x=>x.id!==g.id));setViewing(null); } };
  const handleEnd=async g=>{ clearGameState();setResumeState(null);await saveGame(g);setScreen("stats"); };
  const handleSchedule=async({opp,date,time,type,venue,id})=>{
    const scheduled={
      id: id || "scheduled-"+Date.now(),
      opponent:opp,
      date: date ? (date.includes("/") ? date : new Date(date).toLocaleDateString("en-US")) : "",
      time: time || "",
      type, venue,
      status:"scheduled",
      scoreFor:0, scoreAgainst:0,
      events:[], starting:[], allPlayers:ROSTER,
    };
    await saveGame(scheduled);
    return scheduled.id;
  };

  const handleEditScheduled=async(g)=>{
    if(g.id) {
      const existing = games.find(x=>x.id===g.id) || {};
      await saveGame({
        ...existing, id:g.id,
        opponent:g.opp, date:g.date, time:g.time||"",
        type:g.type, venue:g.venue, status:"scheduled",
        scoreFor:0, scoreAgainst:0,
        events:existing.events||[], starting:existing.starting||[], allPlayers:existing.allPlayers||ROSTER,
      });
    } else {
      await saveGame({
        id:"scheduled-"+Date.now(),
        opponent:g.opp, date:g.date, time:g.time||"",
        type:g.type, venue:g.venue, status:"scheduled",
        scoreFor:0, scoreAgainst:0,
        events:[], starting:[], allPlayers:ROSTER,
      });
    }
  };
  const handleDeleteScheduled=async(id)=>{
    await deleteGame(id);
    setGames(prev=>prev.filter(x=>x.id!==id));
  };
  // Resume a saved game - pass full state back into gameInfo so Game can restore it
  const handleResume=()=>{
    if(!resumeState)return;
    // Merge saved events/score/half back into gameInfo so Game component picks them up
    setGameInfo({
      ...resumeState.gameInfo,
      _resumeEvents: resumeState.events,
      _resumeGf:     resumeState.gf,
      _resumeGa:     resumeState.ga,
      _resumeHalf:   resumeState.half,
      _resumeOnField:resumeState.onField,
      _resumeSecs:   resumeState.secs,
    });
    setScreen("game");
  };
  const handleDiscardResume=()=>{ clearGameState();setResumeState(null); };

  if(loading)return(
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, ...T }}>
      <div style={{ fontSize:28, fontWeight:900, color:"#60a5fa", letterSpacing:2 }}>PitchSide</div>
      <div style={{ fontSize:11, color:"#93c5fd", letterSpacing:2 }}>Baltimore Armour 11G Aspire</div>
      <div style={{ marginTop:20, width:36, height:36, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.blue}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );

  if(viewing)return <GameDetail game={viewing} onClose={()=>setViewing(null)} onUpdate={updateGame} onDelete={handleDelete} isAdmin={isAdmin}/>;
  if(showPin)return <PinScreen onAdmin={()=>{ setIsAdmin(true);localStorage.setItem("ps_admin","1");setShowPin(false); }} onViewer={()=>setShowPin(false)}/>;

  return (
    <>
      {screen==="home" && (
        <Home
          games={games}
          onStart={i=>{ if(!isAdmin){setShowPin(true);return;} setGameInfo(i);setScreen("lineup"); if(i.scheduledId){deleteGame(i.scheduledId).catch(()=>{}); }}}
          onStats={()=>setScreen("stats_view")}
          onView={g=>{ setViewing(g);setPrevScreen("home"); }}
          isAdmin={isAdmin}
          resumeState={resumeState}
          onResume={handleResume}
          onDiscardResume={handleDiscardResume}
          onSchedule={handleSchedule}
          onEditScheduled={handleEditScheduled}
          onDeleteScheduled={handleDeleteScheduled}
        />
      )}
      {screen==="lineup"&&gameInfo&&<Lineup gameInfo={gameInfo} pastGames={games} onKickoff={i=>{ setGameInfo(i);setScreen("game"); }} onBack={()=>setScreen("home")}/>}
      {screen==="game"&&gameInfo&&<Game gameInfo={gameInfo} onEnd={handleEnd} onBack={()=>{ setResumeState(loadGameState());setScreen("home"); }}/>}
      {(screen==="stats"||screen==="games_view"||screen==="stats_view")&&<Stats key={screen+statsTab} games={games} onBack={()=>setScreen("home")} onView={g=>{ setViewing(g);setPrevScreen("stats"); }} isAdmin={isAdmin} defaultTab={screen==="games_view"?"scouting":statsTab}/>}
      {screen==="players"&&<Players games={games} onBack={()=>setScreen("home")} isAdmin={isAdmin}/>}

      {screen!=="game"&&screen!=="lineup"&&!viewing&&(
        <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#081321", borderTop:`1px solid ${C.border}`, display:"flex", zIndex:100, paddingBottom:"env(safe-area-inset-bottom)" }}>
          {[
            {key:"home",    label:"Home",    icon:"M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"},
            {key:"games",   label:"Games",   icon:"M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"},
            {key:"analytics",label:"Stats",  icon:"M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"},
            {key:"players", label:"Players", icon:"M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"},
          ].map(({key,label,icon})=>(
            <button
              key={label}
              onClick={() => {
                if (key === "games") { setStatsTab("scouting"); setScreen("games_view"); }
                else if (key === "analytics") { setStatsTab("overview"); setScreen("stats_view"); }
                else if (key === "players") { setStatsTab("players"); setScreen("stats_view"); }
                else setScreen(key);
              }}
              style={{ flex: 1, padding: "10px 0 8px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, borderTop: (
                (key === "home" && screen === "home") ||
                (key === "games" && screen === "games_view") ||
                (key === "analytics" && screen === "stats" && statsTab !== "scouting") ||
                (key === "players" && screen === "stats_view" && statsTab === "players")
              ) ? `2px solid ${C.blue}` : "2px solid transparent" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={(key==="home"&&screen==="home")||(key==="games"&&screen==="games_view")||(key==="analytics"&&screen==="stats_view")||(key==="players"&&screen==="players")?"#60a5fa":C.muted}><path d={icon}/></svg>
              <span style={{ fontSize:10, color:(key==="home"&&screen==="home")||(key==="games"&&screen==="games_view")||(key==="analytics"&&screen==="stats_view")||(key==="players"&&screen==="players")?"#60a5fa":C.muted, fontWeight:(key==="home"&&screen==="home")||(key==="games"&&screen==="games_view")||(key==="analytics"&&screen==="stats_view")||(key==="players"&&screen==="players")?700:400 }}>{label}</span>
            </button>
          ))}
        {/* Admin Login / Logout as nav tab */}
          {!isAdmin && (
            <button onClick={()=>setShowPin(true)} style={{ flex:1, padding:"10px 0 8px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderTop:"2px solid transparent" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={C.muted}><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4a3 3 0 110 6 3 3 0 010-6zm0 14c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z"/></svg>
              <span style={{ fontSize:9, color:C.muted }}>Login</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={()=>{setIsAdmin(false);localStorage.removeItem("ps_admin");}} style={{ flex:1, padding:"10px 0 8px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderTop:"2px solid transparent" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f87171"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
              <span style={{ fontSize:9, color:"#f87171" }}>Logout</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
