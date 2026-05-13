import { useState, useEffect, useRef } from "react";
import { listenToGames, saveGame, deleteGame } from "./firebase";
import { calcStats, makeLVURush, makeCoppermine } from "./stats";
import {
  ADMIN_PIN, FEATURED_ID, HALF, GAME, ROSTER, DEFAULT_POS,
  UPCOMING, LEAGUE_TEAMS, TOURNAMENT_TEAMS, POSITIONS, POS_COLOR,
  uid, findPlayer
} from "./constants";

//  THEME 
const C = {
  bg:     "#060e1a",
  card:   "#0f172a",
  border: "#1e3a5f",
  blue:   "#2563eb",
  text:   "#e2e8f0",
  muted:  "#64748b",
  green:  "#10b981",
  red:    "#ef4444",
  amber:  "#f59e0b",
  purple: "#7c3aed",
};
const T = { fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" };
const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 };
const btn = (bg, color = "#fff", extra = {}) => ({ background: bg, border: "none", borderRadius: 10, color, fontWeight: 700, cursor: "pointer", padding: "13px 16px", fontSize: 14, ...extra });
const inp = { width: "100%", padding: 14, borderRadius: 10, background: C.border, border: `1px solid #334155`, color: C.text, fontSize: 16, boxSizing: "border-box" };

//  HELPERS 
function Lbl({ children, mt }) {
  return <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 6, marginTop: mt || 0, textTransform: "uppercase" }}>{children}</div>;
}
function WinBadge({ gf, ga }) {
  const r = gf > ga ? "W" : gf < ga ? "L" : "D";
  const bg = r === "W" ? "#059669" : r === "L" ? C.red : "#d97706";
  return <span style={{ background: bg, color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 13, fontWeight: 800 }}>{r}</span>;
}
function Modal({ title, onClose, children }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.bg }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{title}</span>
          <button onClick={onClose} style={{ background: C.border, border: "none", color: C.muted, borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 14 }}>X</button>
        </div>
        <div style={{ padding: "16px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

//  PIN SCREEN 
function PinScreen({ onAdmin, onViewer }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const check = () => {
    if (pin === ADMIN_PIN) { onAdmin(); }
    else { setErr(true); setPin(""); setTimeout(() => setErr(false), 2000); }
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, ...T }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#60a5fa", letterSpacing: 3, marginBottom: 4 }}>PITCHSIDE</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Baltimore Armour</div>
      <div style={{ fontSize: 11, color: "#93c5fd", letterSpacing: 2, marginBottom: 40 }}>11G ASPIRE</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 320, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 20 }}>Admin Login</div>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && check()}
          placeholder="Enter PIN" maxLength={6}
          style={{ ...inp, fontSize: 28, fontWeight: 700, textAlign: "center", letterSpacing: 8, marginBottom: 8, border: err ? `2px solid ${C.red}` : `1px solid #334155` }} />
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>Incorrect PIN</div>}
        <button onClick={check} style={{ ...btn(C.blue), width: "100%", padding: 16, fontSize: 16, marginBottom: 16 }}>Enter</button>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <button onClick={onViewer} style={{ ...btn("transparent", C.muted), width: "100%", border: `1px solid ${C.border}`, padding: 12, fontSize: 13 }}>View Only (Coach / Parent)</button>
        </div>
      </div>
    </div>
  );
}

//  GAME DETAIL 
function GameDetail({ game, onClose, onUpdate, onDelete, isAdmin, backLabel }) {
  const [events, setEvents] = useState(game.events || []);
  const [editing, setEditing] = useState(null);
  const [eMin, setEMin] = useState("");
  const [eScorer, setEScorer] = useState(null);
  const [eAssist, setEAssist] = useState(null);
  const [saving, setSaving] = useState(false);
  const allP = game.allPlayers || ROSTER;
  const stats = calcStats([{ ...game, events }]);
  const pName = id => findPlayer(id, allP)?.name || "?";
  const pNum  = id => findPlayer(id, allP)?.num || "?";
  const result = game.scoreFor > game.scoreAgainst ? "WIN" : game.scoreFor < game.scoreAgainst ? "LOSS" : "DRAW";
  const rc = result === "WIN" ? "#059669" : result === "LOSS" ? C.red : "#d97706";
  const goalEvs = events.filter(e => e.type === "goal_for" || e.type === "goal_against").sort((a,b) => a.minute - b.minute);
  const subEvs  = events.filter(e => e.type === "sub").sort((a,b) => a.minute - b.minute);
  const playerList = allP.filter(p => (stats[String(p.id)]?.played || 0) > 0).sort((a,b) => (stats[String(b.id)]?.mins || 0) - (stats[String(a.id)]?.mins || 0));

  const openEdit = ev => { if (!isAdmin) return; setEditing(ev); setEMin(String(ev.minute)); setEScorer(ev.scorer ? String(ev.scorer) : null); setEAssist(ev.assist ? String(ev.assist) : null); };
  const doSave = async () => {
    const updated = events.map(e => e.id === editing.id ? { ...e, minute: parseInt(eMin) || 0, scorer: eScorer, assist: eAssist } : e);
    setEvents(updated); setSaving(true);
    const g = { ...game, events: updated };
    await saveGame(g); onUpdate(g); setSaving(false); setEditing(null);
  };
  const doDel = async () => {
    const updated = events.filter(e => e.id !== editing.id);
    const g = { ...game, events: updated, scoreFor: game.scoreFor - (editing.type === "goal_for" ? 1 : 0), scoreAgainst: game.scoreAgainst - (editing.type === "goal_against" ? 1 : 0) };
    setEvents(updated); setSaving(true); await saveGame(g); onUpdate(g); setSaving(false); setEditing(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, ...T, paddingBottom: 40 }}>
      <div style={{ background: "linear-gradient(135deg,#1e3a5f,#0f2544)", padding: 16, borderBottom: `3px solid ${C.blue}` }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 8 }}>{"< Back"}</button>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{game.date} - {game.venue} - {game.type === "tournament" ? "Cup" : "League"}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#60a5fa", marginBottom: 8 }}>vs {game.opponent.split(" ").slice(0,4).join(" ")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 48, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{game.scoreFor}<span style={{ color: "#334155", margin: "0 10px" }}>-</span>{game.scoreAgainst}</span>
          <span style={{ background: rc, color: "#fff", borderRadius: 8, padding: "6px 16px", fontWeight: 800, fontSize: 16 }}>{result}</span>
        </div>
        {saving && <div style={{ fontSize: 11, color: C.green, marginTop: 6 }}>Saving...</div>}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}>
          <div style={{ fontSize: 11, color: C.muted }}>{isAdmin ? "Tap any event to edit" : "View only"}</div>
          {isAdmin && <button onClick={()=>onDelete(game)} style={{ background:"#7f1d1d", border:"none", borderRadius:8, padding:"5px 12px", color:"#fca5a5", fontWeight:700, fontSize:11, cursor:"pointer" }}>Delete Game</button>}
        </div>
      </div>

      <div style={{ padding: 14, maxWidth: 480, margin: "0 auto" }}>
        {/* Starting lineups */}
        <Lbl>Starting Lineup</Lbl>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
          {(game.starting || []).map(id => {
            const p = findPlayer(id, allP); if (!p) return null;
            const pos = (game.positions || {})[id] || p.pos;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: String(id) === String(FEATURED_ID) ? `2px solid #60a5fa` : `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: POS_COLOR[pos] || C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9, color: "#fff", flexShrink: 0 }}>{p.num}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: String(id) === String(FEATURED_ID) ? "#93c5fd" : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.split(" ")[0]}</div>
                  <div style={{ fontSize: 9, color: POS_COLOR[pos] }}>{pos}</div>
                </div>
              </div>
            );
          })}
        </div>

        {game.secondHalfStarting && <>
          <Lbl>2nd Half Lineup</Lbl>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
            {game.secondHalfStarting.map(id => {
              const p = findPlayer(id, allP); if (!p) return null;
              const pos = DEFAULT_POS[id] || p.pos;
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: String(id) === String(FEATURED_ID) ? `2px solid #60a5fa` : `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px" }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: POS_COLOR[pos] || C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9, color: "#fff", flexShrink: 0 }}>{p.num}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: String(id) === String(FEATURED_ID) ? "#93c5fd" : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.split(" ")[0]}</div>
                    <div style={{ fontSize: 9, color: POS_COLOR[pos] }}>{pos}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* Goals */}
        <Lbl mt={8}>Goals</Lbl>
        {goalEvs.length === 0 && <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>No goals logged</div>}
        {goalEvs.map(ev => (
          <div key={ev.id} onClick={() => openEdit(ev)} style={{ display: "flex", alignItems: "center", gap: 10, ...card, cursor: isAdmin ? "pointer" : "default", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: ev.type === "goal_for" ? "#60a5fa" : "#f87171", minWidth: 32 }}>{ev.minute}'</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{ev.type === "goal_for" ? (ev.ownGoal ? "Own Goal (opp)" : pName(ev.scorer)) : "Goal Conceded"}</div>
              {ev.type === "goal_for" && !ev.ownGoal && ev.assist && <div style={{ fontSize: 11, color: C.green }}>Assist: {pName(ev.assist)}</div>}
              {ev.type === "goal_for" && !ev.ownGoal && !ev.assist && <div style={{ fontSize: 11, color: C.muted }}>No assist logged</div>}
            </div>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{ev.score}</span>
            {isAdmin && <span style={{ fontSize: 10, color: C.blue }}>edit</span>}
          </div>
        ))}

        {/* Subs */}
        <Lbl mt={12}>Substitutions</Lbl>
        {subEvs.length === 0 && <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>None logged</div>}
        {subEvs.map(ev => (
          <div key={ev.id} onClick={() => openEdit(ev)} style={{ display: "flex", alignItems: "center", gap: 10, ...card, cursor: isAdmin ? "pointer" : "default", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.amber, minWidth: 32 }}>{ev.minute}'</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>#{pNum(ev.playerOn)} {pName(ev.playerOn)} on</div>
              <div style={{ fontSize: 11, color: C.muted }}>#{pNum(ev.playerOff)} {pName(ev.playerOff)} off</div>
            </div>
            {isAdmin && <span style={{ fontSize: 10, color: C.blue }}>edit</span>}
          </div>
        ))}

        {/* Minutes */}
        <Lbl mt={12}>Minutes Played</Lbl>
        {playerList.map(p => {
          const s = stats[String(p.id)]; if (!s) return null;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, ...card, border: String(p.id) === String(FEATURED_ID) ? `2px solid #60a5fa` : `1px solid ${C.border}`, marginBottom: 5 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, color: "#93c5fd", flexShrink: 0 }}>#{p.num}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: String(p.id) === String(FEATURED_ID) ? "#93c5fd" : C.text }}>{p.name}{String(p.id) === String(FEATURED_ID) ? " *" : ""}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa" }}>{s.mins}'</span>
              {s.goals > 0 && <div style={{ background: C.border, borderRadius: 6, padding: "3px 8px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 800, color: "#60a5fa" }}>{s.goals}</div><div style={{ fontSize: 8, color: C.muted }}>G</div></div>}
              {s.assists > 0 && <div style={{ background: C.border, borderRadius: 6, padding: "3px 8px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{s.assists}</div><div style={{ fontSize: 8, color: C.muted }}>A</div></div>}
            </div>
          );
        })}
      </div>

      {/* Edit Modal - admin only */}
      {editing && (
        <Modal title="Edit Event" onClose={() => setEditing(null)}>
          <Lbl>Minute</Lbl>
          <input value={eMin} onChange={e => setEMin(e.target.value)} type="number" style={{ ...inp, fontSize: 22, fontWeight: 700, marginBottom: 12 }} />
          {editing.type === "goal_for" && <>
            <Lbl>Scorer</Lbl>
            {allP.map(p => <button key={p.id} onClick={() => setEScorer(String(p.id))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, marginBottom: 5, background: eScorer === String(p.id) ? C.blue : C.border, border: eScorer === String(p.id) ? `2px solid #60a5fa` : `1px solid #334155`, color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}>#{p.num} {p.name}</button>)}
            <Lbl mt={8}>Assist</Lbl>
            <button onClick={() => setEAssist(null)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, marginBottom: 5, background: eAssist === null ? "#475569" : C.border, border: `1px solid #334155`, color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}>No Assist</button>
            {allP.filter(p => String(p.id) !== eScorer).map(p => <button key={p.id} onClick={() => setEAssist(eAssist === String(p.id) ? null : String(p.id))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, marginBottom: 5, background: eAssist === String(p.id) ? "#065f46" : C.border, border: eAssist === String(p.id) ? `2px solid ${C.green}` : `1px solid #334155`, color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}>#{p.num} {p.name}</button>)}
          </>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={doDel}  style={{ ...btn("#7f1d1d", "#fca5a5"), flex: 1 }}>Delete</button>
            <button onClick={doSave} style={{ ...btn(C.blue), flex: 2 }}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

//  HOME 
function Home({ games, onStart, onStats, onView, isAdmin }) {
  const [showNew, setShowNew] = useState(false);
  const [type, setType]       = useState("regular");
  const [opp, setOpp]         = useState("");
  const [customOpp, setCustomOpp] = useState("");
  const [venue, setVenue]     = useState("Home");
  const played = new Set(games.map(g => g.opponent));
  const remaining = UPCOMING.filter(g => !played.has(g.opp));
  const teams = type === "regular" ? LEAGUE_TEAMS : TOURNAMENT_TEAMS;
  const go = () => {
    const opponent = opp === "__custom__" ? customOpp.trim() : opp;
    if (!opponent) return;
    onStart({ type, opponent, venue });
    setShowNew(false);
  };
  const record = { W: games.filter(g=>g.scoreFor>g.scoreAgainst).length, D: games.filter(g=>g.scoreFor===g.scoreAgainst).length, L: games.filter(g=>g.scoreFor<g.scoreAgainst).length };
  const totalGF = games.reduce((a,g)=>a+g.scoreFor,0), totalGA = games.reduce((a,g)=>a+g.scoreAgainst,0);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, ...T, paddingBottom: 80 }}>
      <div style={{ background: "linear-gradient(135deg,#1e3a5f,#0f2544)", padding: "28px 16px 18px", borderBottom: `3px solid ${C.blue}`, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#60a5fa", letterSpacing: 3, marginBottom: 6, opacity: 0.8 }}>PITCHSIDE</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>Baltimore Armour</div>
        <div style={{ fontSize: 12, color: "#93c5fd", letterSpacing: 2, marginTop: 2 }}>11G ASPIRE - 2025/26</div>
        {games.length > 0 && (()=>{
          const sorted = games.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
          let streak = 0;
          for (let i=sorted.length-1;i>=0;i--) { if(sorted[i].scoreFor>=sorted[i].scoreAgainst) streak++; else break; }
          return (
            <div style={{ marginTop:14 }}>
              <div style={{ display:"flex", justifyContent:"center", gap:14 }}>
                {[["W",record.W,"#059669"],["D",record.D,"#d97706"],["L",record.L,C.red]].map(([l,v,c])=>(
                  <div key={l} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:28, fontWeight:900, color:c }}>{v}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{l==="W"?"Wins":l==="D"?"Draws":"Losses"}</div>
                  </div>
                ))}
                <div style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:900, color:"#60a5fa" }}>{totalGF}</div><div style={{ fontSize:9, color:C.muted }}>GF</div></div>
                <div style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:900, color:"#f87171" }}>{totalGA}</div><div style={{ fontSize:9, color:C.muted }}>GA</div></div>
              </div>
              {streak>=2&&<div style={{ marginTop:8, background:"linear-gradient(90deg,#065f46,#047857)", borderRadius:10, padding:"5px 14px", display:"inline-block" }}>
                <span style={{ fontSize:12, fontWeight:800, color:"#6ee7b7" }}>Unbeaten: {streak} games</span>
              </div>}
            </div>
          );
        })()}
      </div>

      <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
        {/* Results */}
        {games.length > 0 && <>
          <Lbl>Recent Results</Lbl>
          {games.slice().reverse().map((g, i) => (
            <button key={i} onClick={() => onView(g)} style={{ background: "#0d2137", border: `1px solid #065f46`, borderRadius: 12, padding: 14, marginBottom: 8, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>vs {g.opponent.split(" ").slice(0,3).join(" ")}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{g.date} - {g.venue} - {g.type === "tournament" ? "Cup" : "League"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{g.scoreFor}-{g.scoreAgainst}</span>
                <WinBadge gf={g.scoreFor} ga={g.scoreAgainst} />
              </div>
            </button>
          ))}
          <div style={{ height: 8 }} />
        </>}

        {/* Upcoming */}
        {remaining.length > 0 && <>
          <Lbl>Upcoming</Lbl>
          {remaining.map((g, i) => (
            <button key={i} onClick={() => { if (!isAdmin) return; setType(g.type); setOpp(g.opp); setVenue(g.venue); setShowNew(true); }}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, width: "100%", textAlign: "left", cursor: isAdmin ? "pointer" : "default", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: isAdmin ? 1 : 0.8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>vs {g.opp.split(" ").slice(0,3).join(" ")}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{g.date} - {g.venue}</div>
              </div>
              <span style={{ background: g.type === "tournament" ? C.purple : C.blue, color: "#fff", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700 }}>{g.type === "tournament" ? "CUP" : "LEAGUE"}</span>
            </button>
          ))}
          <div style={{ height: 8 }} />
        </>}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {isAdmin && <button onClick={() => { setOpp(""); setShowNew(true); }} style={{ ...btn(C.blue), flex: 1 }}>+ New Game</button>}
          <button onClick={onStats} style={{ ...btn(C.border, "#93c5fd"), flex: 1 }}>Season Stats</button>
        </div>
        {!isAdmin && <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: C.muted }}>View only - data updates live as games are tracked</div>}
      </div>

      {showNew && (
        <Modal title="New Game" onClose={() => setShowNew(false)}>
          <Lbl>Type</Lbl>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["regular", "tournament"].map(t => <button key={t} onClick={() => { setType(t); setOpp(""); }} style={{ ...btn(type === t ? C.blue : C.border, type === t ? "#fff" : C.muted), flex: 1 }}>{t === "regular" ? "League" : "Cup"}</button>)}
          </div>
          <Lbl>Venue</Lbl>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["Home","Away"].map(v => <button key={v} onClick={() => setVenue(v)} style={{ ...btn(venue === v ? C.blue : C.border, venue === v ? "#fff" : C.muted), flex: 1 }}>{v}</button>)}
          </div>
          <Lbl>Opponent</Lbl>
          {teams.map(t => <button key={t} onClick={() => setOpp(t)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, marginBottom: 5, textAlign: "left", cursor: "pointer", fontWeight: 600, fontSize: 13, background: opp === t ? "#1d4ed8" : C.border, border: opp === t ? `2px solid #60a5fa` : `1px solid ${C.border}`, color: opp === t ? "#fff" : "#94a3b8" }}>{t}</button>)}
          <button onClick={() => setOpp("__custom__")} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, marginBottom: 8, textAlign: "left", cursor: "pointer", fontWeight: 600, fontSize: 13, background: opp === "__custom__" ? "#1d4ed8" : C.border, border: `1px dashed #334155`, color: "#94a3b8" }}>+ Other / Tournament Final</button>
          {opp === "__custom__" && <input value={customOpp} onChange={e => setCustomOpp(e.target.value)} placeholder="Opponent name..." style={{ ...inp, marginBottom: 10 }} />}
          <button onClick={go} style={{ ...btn(C.blue), width: "100%", padding: 16, fontSize: 15 }}>Continue to Lineup</button>
        </Modal>
      )}
    </div>
  );
}

//  LINEUP 
function Lineup({ gameInfo, onKickoff, onBack }) {
  const [selected, setSelected] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [avail, setAvail]       = useState(Object.fromEntries(ROSTER.map(p => [p.id, true])));
  const [posModal, setPosModal] = useState(null);
  const [guestName, setGuestName] = useState("");
  const [guests, setGuests]     = useState([]);
  const [showGuest, setShowGuest] = useState(false);
  const allP = [...ROSTER, ...guests];
  const available = allP.filter(p => avail[p.id] !== false && avail[p.id] !== "injured" && avail[p.id] !== "absent");
  const posFor = id => overrides[id] || DEFAULT_POS[id] || "MID";
  const toggle = id => { if (selected.includes(id)) setSelected(s => s.filter(x => x !== id)); else if (selected.length < 11) setSelected(s => [...s, id]); };
  const cycleAvail = (id, e) => { e.stopPropagation(); const cur = avail[id]; const isAvail = cur !== false && cur !== "injured" && cur !== "absent"; setAvail(a => ({ ...a, [id]: !isAvail })); setSelected(s => s.filter(x => x !== id)); };
  const addGuest = () => { if (!guestName.trim()) return; const g = { id: "G_"+uid(), num:"G", name: guestName.trim(), pos:"MID", isGuest:true }; setGuests(gs => [...gs,g]); setAvail(a => ({...a,[g.id]:true})); setGuestName(""); setShowGuest(false); };
  const kickoff = () => {
    if (selected.length !== 11) return;
    const positions = Object.fromEntries(selected.map(id => [id, posFor(id)]));
    onKickoff({ ...gameInfo, starting: selected, positions, avail, guests, allPlayers: [...ROSTER, ...guests] });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, ...T, paddingBottom: 100 }}>
      <div style={{ background: "linear-gradient(135deg,#1e3a5f,#0f2544)", padding: 16, borderBottom: `3px solid ${C.blue}` }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 8 }}>{"< Back"}</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa" }}>vs {gameInfo.opponent?.split(" ").slice(0,4).join(" ")}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Tap to select - tap badge to mark unavailable</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: selected.length === 11 ? C.green : C.amber }}>{selected.length}<span style={{ fontSize: 13, color: C.muted }}>/11</span></div>
        </div>
      </div>
      <div style={{ padding: "12px 14px", maxWidth: 480, margin: "0 auto" }}>
        {available.map(p => {
          const isSel = selected.includes(p.id);
          const pos = posFor(p.id);
          return (
            <div key={p.id} onClick={() => toggle(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: isSel ? "#0d2137" : C.card, border: isSel ? `2px solid ${C.blue}` : `1px solid ${C.border}`, borderRadius: 12, padding: "12px", marginBottom: 6, cursor: "pointer" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isSel ? C.blue : C.border, border: isSel ? `2px solid #60a5fa` : `1px solid #334155` }}>
                {isSel ? <span style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>OK</span> : <span style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>{p.num}</span>}
              </div>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: isSel ? C.text : String(p.id) === String(FEATURED_ID) ? "#93c5fd" : "#94a3b8" }}>{p.name}{String(p.id) === String(FEATURED_ID) ? " *" : ""}</span>
              {isSel && <button onClick={e => { e.stopPropagation(); setPosModal(p.id); }} style={{ background: POS_COLOR[pos], border: "none", borderRadius: 6, padding: "5px 10px", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{pos}</button>}
              <button onClick={e => cycleAvail(p.id, e)} style={{ background: (avail[p.id] !== false && avail[p.id] !== "injured" && avail[p.id] !== "absent") ? "#064e3b" : "#450a0a", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 800, color: (avail[p.id] !== false && avail[p.id] !== "injured" && avail[p.id] !== "absent") ? C.green : C.red }}>
                {(avail[p.id] !== false && avail[p.id] !== "injured" && avail[p.id] !== "absent") ? "OK" : "Out"}
              </button>
            </div>
          );
        })}
        {!showGuest
          ? <button onClick={() => setShowGuest(true)} style={{ width: "100%", padding: 12, borderRadius: 12, background: C.card, border: `1px dashed #334155`, color: C.purple, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>+ Add Guest Player</button>
          : <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Guest name..." style={{ ...inp, flex: 1 }} />
              <button onClick={addGuest} style={{ ...btn(C.purple), padding: "12px 16px" }}>Add</button>
            </div>
        }
      </div>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0a1628", borderTop: `2px solid ${C.border}`, padding: "12px 16px" }}>
        {selected.length > 0 && selected.length < 11 && <div style={{ textAlign: "center", fontSize: 12, color: C.amber, marginBottom: 6 }}>Select {11 - selected.length} more</div>}
        <button onClick={kickoff} disabled={selected.length !== 11} style={{ ...btn(selected.length === 11 ? C.blue : C.border, selected.length === 11 ? "#fff" : C.muted), width: "100%", padding: 18, fontSize: 16, borderRadius: 12, cursor: selected.length === 11 ? "pointer" : "not-allowed" }}>
          {selected.length === 11 ? "Kick Off!" : selected.length === 0 ? "Tap 11 players" : selected.length + "/11 selected"}
        </button>
      </div>
      {posModal && (
        <Modal title="Set Position" onClose={() => setPosModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {POSITIONS.map(pos => <button key={pos} onClick={() => { setOverrides(o => ({...o,[posModal]:pos})); setPosModal(null); }} style={{ padding: 24, borderRadius: 14, background: posFor(posModal) === pos ? POS_COLOR[pos] : C.border, border: posFor(posModal) === pos ? "3px solid #fff" : "3px solid transparent", color: "#fff", fontWeight: 800, fontSize: 20, cursor: "pointer" }}>{pos}</button>)}
          </div>
        </Modal>
      )}
    </div>
  );
}

//  GAME SCREEN 
function Game({ gameInfo, onEnd, onBack }) {
  const [onField,   setOnField]   = useState(gameInfo.starting);
  const [positions, setPositions] = useState(gameInfo.positions);
  const [half,      setHalf]      = useState(1);
  const [htMode,    setHtMode]    = useState(false);
  const [secs,      setSecs]      = useState(0);
  const [running,   setRunning]   = useState(false);
  const [events,    setEvents]    = useState([]);
  const [gf,        setGf]        = useState(0);
  const [ga,        setGa]        = useState(0);
  const [modal,     setModal]     = useState(null);
  const [tab,       setTab]       = useState("field");
  const [showBack,  setShowBack]  = useState(false);
  const [showEnd,   setShowEnd]   = useState(false);
  const [editEv,    setEditEv]    = useState(null);
  const [goalMin,   setGoalMin]   = useState("0");
  const [scorer,    setScorer]    = useState(null);
  const [assist,    setAssist]    = useState(null);
  const [ownGoal,   setOwnGoal]   = useState(false);
  const [subOff,    setSubOff]    = useState(null);
  const [subOn,     setSubOn]     = useState(null);
  const [subMin,    setSubMin]    = useState("0");
  const [subPos,    setSubPos]    = useState(null);
  const timerRef = useRef(null), startRef = useRef(null), pauseRef = useRef(0);

  useEffect(() => {
    if (running) {
      const wallStart = Date.now() - pauseRef.current * 1000;
      startRef.current = wallStart;
      sessionStorage.setItem("ps_clock_start", String(wallStart));
      sessionStorage.setItem("ps_clock_running", "1");
      timerRef.current = setInterval(() => setSecs(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    } else {
      clearInterval(timerRef.current);
      pauseRef.current = secs;
      sessionStorage.setItem("ps_clock_running", "0");
      sessionStorage.setItem("ps_clock_secs", String(secs));
    }
    return () => clearInterval(timerRef.current);
  }, [running]);

  // Restore clock if page was refreshed during a game
  useEffect(() => {
    const wasRunning = sessionStorage.getItem("ps_clock_running") === "1";
    const savedStart = sessionStorage.getItem("ps_clock_start");
    if (wasRunning && savedStart) {
      const elapsed = Math.floor((Date.now() - Number(savedStart)) / 1000);
      pauseRef.current = elapsed;
      setSecs(elapsed);
      setRunning(true);
    } else {
      const savedSecs = sessionStorage.getItem("ps_clock_secs");
      if (savedSecs) { const s = Number(savedSecs); pauseRef.current = s; setSecs(s); }
    }
  }, []);

  const curMin = Math.floor(secs / 60);
  const timeStr = String(Math.floor(secs/60)).padStart(2,"0") + ":" + String(secs%60).padStart(2,"0");
  const allP = gameInfo.allPlayers;
  const onFieldP = allP.filter(p => onField.map(String).includes(String(p.id)));
  const benchP   = allP.filter(p => gameInfo.avail && gameInfo.avail[p.id] !== false && gameInfo.avail[p.id] !== "injured" && gameInfo.avail[p.id] !== "absent" && !onField.map(String).includes(String(p.id)));

  const openGoal = type => { setGoalMin(String(curMin)); setSubMin(String(curMin)); setScorer(null); setAssist(null); setOwnGoal(false); setSubOff(null); setSubOn(null); setSubPos(null); setModal(type); };
  const pName = id => allP.find(p => String(p.id) === String(id))?.name?.split(" ")[0] || "?";

  const logGoalFor = () => { const ngf=gf+1; setGf(ngf); setEvents(ev=>[...ev,{type:"goal_for",minute:parseInt(goalMin)||0,scorer:ownGoal?null:scorer,assist:ownGoal?null:assist,ownGoal,score:ngf+"-"+ga,half,id:uid()}]); setModal(null); };
  const logGoalAgainst = () => { const nga=ga+1; setGa(nga); setEvents(ev=>[...ev,{type:"goal_against",minute:parseInt(goalMin)||0,ownGoal,score:gf+"-"+nga,half,id:uid()}]); setModal(null); };
  const logSub = () => {
    if (!subOff||!subOn||!subPos) return;
    setOnField(f=>f.map(id=>String(id)===String(subOff)?subOn:id));
    setPositions(p=>{const n={...p};n[subOn]=subPos;delete n[subOff];return n;});
    setEvents(ev=>[...ev,{type:"sub",minute:parseInt(subMin)||0,playerOff:subOff,playerOn:subOn,subType:"tactical",pos:subPos,half,id:uid()}]);
    setModal(null);
  };
  const openEditEv = ev => { setEditEv(ev); setGoalMin(String(ev.minute)); setScorer(ev.scorer?String(ev.scorer):null); setAssist(ev.assist?String(ev.assist):null); setModal("edit"); };
  const saveEditEv = () => { setEvents(evs=>evs.map(e=>e.id===editEv.id?{...e,minute:parseInt(goalMin)||0,scorer,assist}:e)); setEditEv(null); setModal(null); };
  const delEditEv  = () => { if(editEv.type==="goal_for")setGf(g=>Math.max(0,g-1)); else if(editEv.type==="goal_against")setGa(g=>Math.max(0,g-1)); setEvents(evs=>evs.filter(e=>e.id!==editEv.id)); setEditEv(null); setModal(null); };
  const endHalf = () => { setRunning(false); setHtMode(true); pauseRef.current=HALF*60; setSecs(HALF*60); setModal("halftime"); };
  const start2H = () => { setHalf(2); setHtMode(false); setSecs(HALF*60); pauseRef.current=HALF*60; setRunning(false); setModal(null); };

  const liveGame = { ...gameInfo, events, scoreFor:gf, scoreAgainst:ga, date:new Date().toLocaleDateString("en-US"), secondHalfStarting:half===2?[...onField]:undefined, id:gameInfo.id||uid() };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      {/* Clock */}
      <div style={{ background:"linear-gradient(135deg,#1e3a5f,#0f2544)", padding:"12px 16px", borderBottom:`3px solid ${C.blue}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <button onClick={()=>setShowBack(true)} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:13, fontWeight:700, cursor:"pointer", padding:0 }}>{"< Exit"}</button>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <button onClick={()=>setRunning(r=>!r)} style={{ background:running?C.red:C.green, border:"none", borderRadius:8, padding:"6px 14px", color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer", minWidth:56 }}>{running?"PAUSE":"START"}</button>
            <button onClick={()=>{setRunning(false);pauseRef.current=0;setSecs(0);}} style={{ background:"#475569", border:"none", borderRadius:8, padding:"6px 10px", color:"#fff", fontWeight:700, fontSize:11, cursor:"pointer" }}>RESET</button>
            <span style={{ fontSize:17, fontWeight:800, color:running?"#60a5fa":"#475569", minWidth:46, textAlign:"center" }}>{timeStr}</span>
          </div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>{htMode?"HALF TIME":half===1?"1st Half":"2nd Half"} - vs {gameInfo.opponent?.split(" ").slice(0,3).join(" ")} {running && <span style={{background:"#dc2626",color:"#fff",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:800,marginLeft:4,animation:"pulse 1s infinite"}}>LIVE</span>}</div>
          <div style={{ fontSize:52, fontWeight:900, color:"#fff", lineHeight:1 }}><span style={{color:"#60a5fa"}}>{gf}</span><span style={{color:"#334155",margin:"0 10px"}}>-</span><span style={{color:"#f87171"}}>{ga}</span></div>
          {!running&&secs===0&&<div style={{fontSize:10,color:C.amber,marginTop:4}}>Tap START to begin</div>}
          {!running&&secs>0&&!htMode&&<div style={{fontSize:10,color:C.amber,marginTop:4}}>PAUSED</div>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:"#0a1628" }}>
        {[["field","On Field"],["events","Events"],["bench","Bench"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"12px 4px", background:"none", border:"none", borderBottom:tab===t?`3px solid ${C.blue}`:"3px solid transparent", color:tab===t?"#60a5fa":C.muted, fontWeight:700, fontSize:12, cursor:"pointer" }}>{l}</button>
        ))}
      </div>

      <div style={{ padding:12, maxWidth:480, margin:"0 auto" }}>
        {tab==="field" && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {onFieldP.map(p=>(
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:6, background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 10px" }}>
              <span style={{ width:26, height:26, borderRadius:"50%", background:POS_COLOR[positions[p.id]]||C.muted, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:10, color:"#fff", flexShrink:0 }}>{p.num}</span>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name.split(" ")[0]}</div>
                <div style={{ fontSize:9, color:POS_COLOR[positions[p.id]] }}>{positions[p.id]}</div>
              </div>
            </div>
          ))}
        </div>}

        {tab==="events" && <div>
          <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Tap to edit</div>
          {events.length===0&&<div style={{ color:C.muted, fontSize:13, textAlign:"center", marginTop:30 }}>No events yet</div>}
          {events.slice().reverse().map(ev=>(
            <div key={ev.id} onClick={()=>openEditEv(ev)} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", marginBottom:5, display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
              <span style={{ fontSize:10, fontWeight:800, color:ev.type==="goal_for"?"#60a5fa":ev.type==="goal_against"?"#f87171":C.amber, minWidth:28 }}>{ev.type==="goal_for"?"FOR":ev.type==="goal_against"?"VS":"SUB"}</span>
              <span style={{ fontSize:11, color:"#94a3b8", fontWeight:700, minWidth:24 }}>{ev.minute}'</span>
              <span style={{ fontSize:12, color:C.text, flex:1 }}>
                {ev.type==="goal_for"?pName(ev.scorer)+(ev.assist?" / "+pName(ev.assist):" (no ast)"):ev.type==="goal_against"?"Goal conceded":pName(ev.playerOff)+" off / "+pName(ev.playerOn)+" on"}
              </span>
              {ev.score&&<span style={{ fontSize:11, color:C.muted, fontWeight:700 }}>{ev.score}</span>}
            </div>
          ))}
        </div>}

        {tab==="bench" && <div>
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

      {/* Action buttons */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#0a1628", borderTop:`2px solid ${C.border}`, padding:"10px 10px" }}>
        <div style={{ display:"flex", gap:5, maxWidth:480, margin:"0 auto" }}>
          <button onClick={()=>openGoal("goal_for")}     style={{ flex:1, background:"#1d4ed8", border:"none", borderRadius:10, padding:"14px 2px", color:"#fff", cursor:"pointer", fontSize:10, fontWeight:800 }}>GOAL FOR</button>
          <button onClick={()=>openGoal("goal_against")} style={{ flex:1, background:C.red,     border:"none", borderRadius:10, padding:"14px 2px", color:"#fff", cursor:"pointer", fontSize:10, fontWeight:800 }}>GOAL VS</button>
          <button onClick={()=>openGoal("sub")}          style={{ flex:1, background:"#059669", border:"none", borderRadius:10, padding:"14px 2px", color:"#fff", cursor:"pointer", fontSize:10, fontWeight:800 }}>SUB</button>
          {half===1
            ?<button onClick={endHalf}             style={{ flex:1, background:C.purple, border:"none", borderRadius:10, padding:"14px 2px", color:"#fff", cursor:"pointer", fontSize:10, fontWeight:800 }}>END HALF</button>
            :<button onClick={()=>setShowEnd(true)} style={{ flex:1, background:C.purple, border:"none", borderRadius:10, padding:"14px 2px", color:"#fff", cursor:"pointer", fontSize:10, fontWeight:800 }}>FULL TIME</button>
          }
        </div>
      </div>

      {/* Modals */}
      {showBack&&<Modal title="Leave game?" onClose={()=>setShowBack(false)}>
        <p style={{ color:"#94a3b8", fontSize:14 }}>Clock stops. Return any time - nothing is lost.</p>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowBack(false)} style={{ ...btn(C.border), flex:1 }}>Stay</button>
          <button onClick={onBack}                  style={{ ...btn(C.red),    flex:1 }}>Leave</button>
        </div>
      </Modal>}

      {showEnd&&<Modal title="Full Time?" onClose={()=>setShowEnd(false)}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:48, fontWeight:900, color:"#fff" }}><span style={{color:"#60a5fa"}}>{gf}</span> - <span style={{color:"#f87171"}}>{ga}</span></div>
          <div style={{ fontSize:13, color:C.muted }}>vs {gameInfo.opponent?.split(" ").slice(0,3).join(" ")}</div>
        </div>
        <p style={{ color:"#94a3b8", fontSize:13 }}>Saves permanently to Firebase. Editable afterwards.</p>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowEnd(false)}                          style={{ ...btn(C.border), flex:1 }}>Keep Playing</button>
          <button onClick={()=>onEnd({...liveGame,status:"completed"})}    style={{ ...btn(C.blue),   flex:2, fontSize:15, fontWeight:800 }}>Save Game</button>
        </div>
      </Modal>}

      {modal==="goal_for"&&<Modal title="Goal For!" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl>
        <input value={goalMin} onChange={e=>setGoalMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:12 }} />
        <button onClick={()=>setOwnGoal(o=>!o)} style={{ padding:"8px 14px", borderRadius:8, background:ownGoal?C.amber:C.border, border:"none", color:ownGoal?"#000":"#94a3b8", fontWeight:700, fontSize:12, cursor:"pointer", marginBottom:12 }}>Own Goal by opponent</button>
        {!ownGoal&&<>
          <Lbl>Scorer</Lbl>
          {onFieldP.map(p=><button key={p.id} onClick={()=>setScorer(String(p.id))} style={{ width:"100%", padding:"11px 14px", borderRadius:10, marginBottom:5, background:scorer===String(p.id)?C.blue:C.border, border:scorer===String(p.id)?`2px solid #60a5fa`:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>#{p.num} {p.name}</button>)}
          <Lbl mt={8}>Assist (optional)</Lbl>
          <button onClick={()=>setAssist(null)} style={{ width:"100%", padding:"10px 14px", borderRadius:10, marginBottom:5, background:assist===null?"#475569":C.border, border:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>No Assist / Unknown</button>
          {onFieldP.filter(p=>String(p.id)!==scorer).map(p=><button key={p.id} onClick={()=>setAssist(assist===String(p.id)?null:String(p.id))} style={{ width:"100%", padding:"10px 14px", borderRadius:10, marginBottom:5, background:assist===String(p.id)?"#065f46":C.border, border:assist===String(p.id)?`2px solid ${C.green}`:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>#{p.num} {p.name}</button>)}
        </>}
        <button onClick={logGoalFor} disabled={!ownGoal&&!scorer} style={{ ...btn(!ownGoal&&!scorer?C.border:C.blue,!ownGoal&&!scorer?C.muted:"#fff"), width:"100%", padding:16, fontSize:15, marginTop:8, cursor:!ownGoal&&!scorer?"not-allowed":"pointer" }}>Log Goal</button>
      </Modal>}

      {modal==="goal_against"&&<Modal title="Goal Against" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl>
        <input value={goalMin} onChange={e=>setGoalMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:16 }} />
        <button onClick={logGoalAgainst} style={{ ...btn(C.red), width:"100%", padding:16, fontSize:15 }}>Log Goal Against</button>
      </Modal>}

      {modal==="sub"&&<Modal title="Substitution" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl>
        <input value={subMin} onChange={e=>setSubMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:12 }} />
        <Lbl>Player Off</Lbl>
        {onFieldP.map(p=><button key={p.id} onClick={()=>setSubOff(String(p.id))} style={{ width:"100%", padding:"11px 14px", borderRadius:10, marginBottom:5, background:subOff===String(p.id)?C.red:C.border, border:subOff===String(p.id)?`2px solid #f87171`:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>#{p.num} {p.name} <span style={{color:POS_COLOR[positions[p.id]],fontSize:11}}>- {positions[p.id]}</span></button>)}
        <Lbl mt={8}>Player On</Lbl>
        {benchP.length===0&&<div style={{ color:C.muted, fontSize:13, marginBottom:8 }}>No players on bench</div>}
        {benchP.map(p=><button key={p.id} onClick={()=>setSubOn(String(p.id))} style={{ width:"100%", padding:"11px 14px", borderRadius:10, marginBottom:5, background:subOn===String(p.id)?"#059669":C.border, border:subOn===String(p.id)?`2px solid ${C.green}`:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>#{p.num} {p.name}</button>)}
        {subOn&&<><Lbl mt={8}>Position</Lbl><div style={{ display:"flex", gap:8 }}>{POSITIONS.map(pos=><button key={pos} onClick={()=>setSubPos(pos)} style={{ flex:1, padding:"14px 4px", borderRadius:10, border:"none", fontWeight:800, fontSize:14, cursor:"pointer", background:subPos===pos?POS_COLOR[pos]:C.border, color:subPos===pos?"#fff":C.muted }}>{pos}</button>)}</div></>}
        <button onClick={logSub} disabled={!subOff||!subOn||!subPos} style={{ ...btn(!subOff||!subOn||!subPos?C.border:"#059669",!subOff||!subOn||!subPos?C.muted:"#fff"), width:"100%", padding:16, fontSize:15, marginTop:12, cursor:!subOff||!subOn||!subPos?"not-allowed":"pointer" }}>Log Sub</button>
      </Modal>}

      {modal==="edit"&&editEv&&<Modal title="Edit Event" onClose={()=>setModal(null)}>
        <Lbl>Minute</Lbl>
        <input value={goalMin} onChange={e=>setGoalMin(e.target.value)} type="number" style={{ ...inp, fontSize:22, fontWeight:700, marginBottom:12 }} />
        {editEv.type==="goal_for"&&<>
          <Lbl>Scorer</Lbl>
          {allP.map(p=><button key={p.id} onClick={()=>setScorer(String(p.id))} style={{ width:"100%", padding:"10px 14px", borderRadius:10, marginBottom:5, background:scorer===String(p.id)?C.blue:C.border, border:scorer===String(p.id)?`2px solid #60a5fa`:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>#{p.num} {p.name}</button>)}
          <Lbl mt={8}>Assist</Lbl>
          <button onClick={()=>setEAssist(null)} style={{ width:"100%", padding:"10px 14px", borderRadius:10, marginBottom:5, background:"#475569", border:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>No Assist</button>
          {allP.filter(p=>String(p.id)!==eScorer).map(p=><button key={p.id} onClick={()=>setEAssist(eAssist===String(p.id)?null:String(p.id))} style={{ width:"100%", padding:"10px 14px", borderRadius:10, marginBottom:5, background:eAssist===String(p.id)?"#065f46":C.border, border:eAssist===String(p.id)?`2px solid ${C.green}`:`1px solid #334155`, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", textAlign:"left" }}>#{p.num} {p.name}</button>)}
        </>}
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button onClick={delEditEv}  style={{ ...btn("#7f1d1d","#fca5a5"), flex:1 }}>Delete</button>
          <button onClick={saveEditEv} style={{ ...btn(C.blue), flex:2 }}>Save</button>
        </div>
      </Modal>}

      {modal==="halftime"&&<Modal title="Half Time" onClose={()=>setModal(null)}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:52, fontWeight:900, color:"#fff", lineHeight:1 }}><span style={{color:"#60a5fa"}}>{gf}</span><span style={{color:"#334155",margin:"0 12px"}}>-</span><span style={{color:"#f87171"}}>{ga}</span></div>
          <div style={{ fontSize:12, color:C.green, fontWeight:700, marginTop:6 }}>End of First Half</div>
        </div>
        <Lbl>2nd Half Lineup</Lbl>
        <p style={{ color:"#94a3b8", fontSize:12, marginTop:0, marginBottom:10 }}>Make subs to change who starts.</p>
        {onFieldP.map(p=>(
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#0d2137", border:`1px solid ${C.blue}`, borderRadius:10, padding:"10px 12px", marginBottom:5 }}>
            <span style={{ width:26, height:26, borderRadius:"50%", background:POS_COLOR[positions[p.id]]||C.muted, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:10, color:"#fff", flexShrink:0 }}>{p.num}</span>
            <span style={{ flex:1, fontSize:13, fontWeight:700, color:C.text }}>{p.name}</span>
            <span style={{ fontSize:11, color:POS_COLOR[positions[p.id]], fontWeight:700 }}>{positions[p.id]}</span>
          </div>
        ))}
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button onClick={()=>setModal("sub")} style={{ ...btn("#059669"), flex:1 }}>Make Sub</button>
          <button onClick={start2H}              style={{ ...btn(C.blue), flex:2, fontSize:15, fontWeight:800 }}>Start 2nd Half</button>
        </div>
      </Modal>}
    </div>
  );
}

//  STATS 
function Stats({ games, onBack, onView, isAdmin }) {
  const [view,    setView]    = useState("overview");
  const [sortBy,  setSortBy]  = useState("net80");
  const [sortDir, setSortDir] = useState(-1);
  const [scout,   setScout]   = useState(null);

  const allGuests = games.flatMap(g=>g.guests||[]).filter((g,i,a)=>a.findIndex(x=>String(x.id)===String(g.id))===i);
  const allP   = [...ROSTER,...allGuests];
  const allSt  = calcStats(games);
  const allGF  = games.flatMap(g=>(g.events||[]).filter(e=>e.type==="goal_for"));
  const allGA  = games.flatMap(g=>(g.events||[]).filter(e=>e.type==="goal_against"));
  const opps   = [...new Set(games.map(g=>g.opponent))];

  const skeys = {net80:"net80",goals:"goals",assists:"assists",gf:"gf",ga:"ga"};
  const pList = allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.played>0).sort((a,b)=>{
    const k=skeys[sortBy]; const av=k==="net80"?(a.net80||0):(a[k]||0); const bv=k==="net80"?(b.net80||0):(b[k]||0);
    return sortDir*(bv-av);
  });
  const toggleSort = k => { if(sortBy===k)setSortDir(d=>d*-1); else{setSortBy(k);setSortDir(-1);}};
  const sb = (k,l) => <button onClick={()=>toggleSort(k)} style={{ flex:1, padding:"8px 2px", borderRadius:8, border:"none", fontWeight:700, fontSize:10, cursor:"pointer", background:sortBy===k?C.blue:C.border, color:sortBy===k?"#fff":C.muted }}>{l}{sortBy===k?(sortDir===-1?" v":" ^"):""}</button>;

  const topG = allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.goals>0).sort((a,b)=>b.goals-a.goals);
  const topA = allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.assists>0).sort((a,b)=>b.assists-a.assists);
  const buckets = [{l:"0-10",min:0,max:10},{l:"11-20",min:11,max:20},{l:"21-30",min:21,max:30},{l:"31-40",min:31,max:40},{l:"41-50",min:41,max:50},{l:"51-60",min:51,max:60},{l:"61-70",min:61,max:70},{l:"71-80",min:71,max:80}];

  if (!games||games.length===0) return <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:32 }}><div style={{ fontSize:20, fontWeight:700, color:"#60a5fa" }}>No Games Yet</div><button onClick={onBack} style={{ ...btn(C.blue), padding:"14px 28px" }}>Back</button></div>;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:32 }}>
      <div style={{ background:"linear-gradient(135deg,#1e3a5f,#0f2544)", padding:16, borderBottom:`3px solid ${C.blue}`, display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:20, cursor:"pointer", padding:0, fontWeight:800 }}>{"<"}</button>
        <div><div style={{ fontSize:18, fontWeight:800, color:"#60a5fa" }}>Season Stats</div><div style={{ fontSize:11, color:C.muted }}>{games.length} games played</div></div>
      </div>
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:"#0a1628" }}>
        {[["overview","Overview"],["players","Players"],["optimum","Optimum"],["scouting","Scouting"]].map(([t,l])=>(
          <button key={t} onClick={()=>setView(t)} style={{ flex:1, padding:"13px 2px", background:"none", border:"none", borderBottom:view===t?`3px solid ${C.blue}`:"3px solid transparent", color:view===t?"#60a5fa":C.muted, fontWeight:700, fontSize:11, cursor:"pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ padding:14, maxWidth:480, margin:"0 auto" }}>

        {view==="overview"&&<>
          <div style={card}>
            <Lbl>Season Record</Lbl>
            <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
              {["W","D","L"].map(r=>{const c=games.filter(g=>r==="W"?g.scoreFor>g.scoreAgainst:r==="D"?g.scoreFor===g.scoreAgainst:g.scoreFor<g.scoreAgainst).length;return <div key={r}><div style={{ fontSize:36, fontWeight:900, color:r==="W"?"#059669":r==="D"?"#d97706":C.red }}>{c}</div><div style={{ fontSize:11, color:C.muted }}>{r==="W"?"Wins":r==="D"?"Draws":"Losses"}</div></div>;})}
              <div><div style={{ fontSize:36, fontWeight:900, color:"#60a5fa" }}>{games.reduce((a,g)=>a+g.scoreFor,0)}-{games.reduce((a,g)=>a+g.scoreAgainst,0)}</div><div style={{ fontSize:11, color:C.muted }}>Goals</div></div>
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
            <Lbl>Goal Timing (10-min intervals)</Lbl>
            {buckets.map(b=>{
              const gfC=allGF.filter(g=>g.minute>=b.min&&g.minute<=b.max).length;
              const gaC=allGA.filter(g=>g.minute>=b.min&&g.minute<=b.max).length;
              const mx=Math.max(gfC,gaC,1);
              return <div key={b.l} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}><span style={{ fontSize:11, color:"#94a3b8" }}>{b.l}</span><span style={{ fontSize:11 }}><span style={{ color:"#60a5fa", fontWeight:700 }}>For: {gfC}</span>  <span style={{ color:"#f87171", fontWeight:700 }}>vs: {gaC}</span></span></div>
                <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}><span style={{ fontSize:9, color:"#60a5fa", width:16 }}>F</span><div style={{ flex:1, background:"#1e293b", borderRadius:3, height:6 }}><div style={{ width:(gfC/mx*100)+"%", background:C.blue, borderRadius:3, height:"100%" }}/></div></div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ fontSize:9, color:"#f87171", width:16 }}>V</span><div style={{ flex:1, background:"#1e293b", borderRadius:3, height:6 }}><div style={{ width:(gaC/mx*100)+"%", background:C.red, borderRadius:3, height:"100%" }}/></div></div>
              </div>;
            })}
          </div>
          <Lbl>All Results</Lbl>
          {games.slice().reverse().map((g,i)=>(
            <button key={i} onClick={()=>onView(g)} style={{ ...card, width:"100%", textAlign:"left", cursor:"pointer", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div><div style={{ fontSize:13, fontWeight:700, color:C.text }}>vs {g.opponent.split(" ").slice(0,3).join(" ")}</div><div style={{ fontSize:11, color:C.muted }}>{g.date} - {g.venue}</div></div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{g.scoreFor}-{g.scoreAgainst}</span><WinBadge gf={g.scoreFor} ga={g.scoreAgainst}/></div>
              </div>
            </button>
          ))}
        </>}

        {view==="players"&&<>
          <div style={{ display:"flex", gap:5, marginBottom:12 }}>
            {sb("goals","Goals")}{sb("assists","Assists")}{sb("gf","GF")}{sb("ga","GA")}{sb("net80","Net/80")}
          </div>
          <p style={{ color:C.muted, fontSize:11, marginTop:0, marginBottom:12 }}>Net/80: goals scored minus conceded per 80 mins on field. * = Maariyah</p>
          {pList.map(p=>{
            const s=allSt[String(p.id)]||{};
            return <div key={p.id} style={{ ...card, border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div><div style={{ fontWeight:800, fontSize:15, color:C.text }}>{p.name}</div><div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s.played} games - {s.mins} mins - avg {s.avgMins} min/game</div></div>
                <div style={{ background:parseFloat(s.net80)>0?"#064e3b":parseFloat(s.net80)<0?"#450a0a":C.border, borderRadius:8, padding:"6px 10px", textAlign:"center", minWidth:54 }}>
                  <div style={{ fontSize:16, fontWeight:900, color:parseFloat(s.net80)>0?C.green:parseFloat(s.net80)<0?C.red:"#94a3b8" }}>{s.net80s||"-"}</div>
                  <div style={{ fontSize:9, color:C.muted }}>NET/80</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:5 }}>
                {[["G",s.goals,"#60a5fa"],["A",s.assists,C.green],["GF",s.gf,"#3b82f6"],["GA",s.ga,"#f87171"]].map(([l,v,co])=>(
                  <div key={l} style={{ flex:1, background:C.border, borderRadius:8, padding:"7px 4px", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:800, color:co }}>{v||0}</div>
                    <div style={{ fontSize:8, color:C.muted }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>;
          })}
        </>}

        {view==="optimum"&&<>
          <div style={{ ...card, border:`2px solid ${C.amber}`, marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:800, color:C.amber, marginBottom:4 }}>Season Optimum XI</div>
            <div style={{ fontSize:11, color:C.muted }}>Best 11 by Net/80 across all games. Play more games for better accuracy.</div>
          </div>
          {(()=>{
            const el=allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.played>0&&p.net80!==null);
            const top11=[...el].sort((a,b)=>(b.net80||0)-(a.net80||0)).slice(0,11);
            const rest=[...el].sort((a,b)=>(b.net80||0)-(a.net80||0)).slice(11);
            const byPos={GK:[],DEF:[],MID:[],FWD:[]};
            top11.forEach(p=>{if(byPos[p.pos])byPos[p.pos].push(p);});
            return <>
              {["GK","DEF","MID","FWD"].map(pos=>byPos[pos].length>0&&<div key={pos} style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:800, color:POS_COLOR[pos], letterSpacing:1, marginBottom:6 }}>{pos}</div>
                {byPos[pos].map(p=><div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, ...card, border:`1px solid ${C.border}`, marginBottom:5 }}>
                  <span style={{ width:28, height:28, borderRadius:"50%", background:POS_COLOR[pos], display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:11, color:"#fff", flexShrink:0 }}>{p.num}</span>
                  <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:14, color:C.text }}>{p.name}</div><div style={{ fontSize:10, color:C.muted }}>{p.played} games - {p.mins} mins</div></div>
                  <div style={{ textAlign:"right" }}><div style={{ fontSize:16, fontWeight:900, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:9, color:C.muted }}>NET/80</div></div>
                </div>)}
              </div>)}
              {rest.length>0&&<><Lbl>Others</Lbl>{rest.map((p,i)=><div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#0a1222", border:`1px solid #1e293b`, borderRadius:10, padding:"9px 14px", marginBottom:4, opacity:0.75 }}><span style={{ fontSize:12, color:C.muted, width:20 }}>{i+12}.</span><span style={{ flex:1, fontSize:13, color:"#94a3b8" }}>{p.name}</span><span style={{ fontSize:13, fontWeight:700, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</span><span style={{ fontSize:10, color:C.muted }}>{p.mins}m</span></div>)}</>}
            </>;
          })()}
        </>}

        {view==="scouting"&&<>
          {!scout?<>
            <p style={{ color:C.muted, fontSize:12, marginTop:0 }}>Tap opponent for full report</p>
            {opps.map(opp=>{
              const og=games.filter(g=>g.opponent===opp);
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
          </>:(()=>{
            const og=games.filter(g=>g.opponent===scout);
            const ss=calcStats(og);
            const tf=og.reduce((a,g)=>a+g.scoreFor,0),ta=og.reduce((a,g)=>a+g.scoreAgainst,0);
            const sc=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.goals>0).sort((a,b)=>b.goals-a.goals);
            const sa=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.assists>0).sort((a,b)=>b.assists-a.assists);
            const sm=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.played>0).sort((a,b)=>b.mins-a.mins);
            return <>
              <button onClick={()=>setScout(null)} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:14, fontWeight:700, cursor:"pointer", padding:0, marginBottom:12 }}>{"< All Opponents"}</button>
              <div style={{ fontSize:16, fontWeight:800, color:"#60a5fa", marginBottom:10 }}>{scout.split(" ").slice(0,4).join(" ")}</div>
              <div style={{ ...card, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
                  {[["Played",og.length,"#94a3b8"],["GF",tf,"#60a5fa"],["GA",ta,"#f87171"],["GD",tf-ta>=0?"+"+String(tf-ta):String(tf-ta),C.green]].map(([l,v,co])=><div key={l}><div style={{ fontSize:28, fontWeight:900, color:co }}>{v}</div><div style={{ fontSize:10, color:C.muted }}>{l}</div></div>)}
                </div>
              </div>
              {sc.length>0&&<div style={card}><Lbl>Scorers & Assists</Lbl>{sc.map((p,i)=><div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:i<sc.length-1?`1px solid ${C.border}`:"none" }}><span style={{ fontSize:13, fontWeight:600, color:C.text }}>{p.name}</span><div style={{ display:"flex", gap:8 }}>{p.goals>0&&<div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:"#60a5fa" }}>{p.goals}</div><div style={{ fontSize:8, color:C.muted }}>G</div></div>}{p.assists>0&&<div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:C.green }}>{p.assists}</div><div style={{ fontSize:8, color:C.muted }}>A</div></div>}</div></div>)}
              {sa.length>0&&sa.filter(p=>!sc.find(s=>String(s.id)===String(p.id))).map((p,i)=><div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${C.border}` }}><span style={{ fontSize:13, fontWeight:600, color:C.text }}>{p.name}</span><div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:800, color:C.green }}>{p.assists}</div><div style={{ fontSize:8, color:C.muted }}>A</div></div></div>)}</div>}
              <div style={card}><Lbl>Minutes Played</Lbl>{sm.map((p,i)=><div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:i<sm.length-1?`1px solid ${C.border}`:"none" }}><span style={{ fontSize:13, fontWeight:600, color:C.text }}>{p.name}</span><span style={{ fontSize:13, color:C.amber, fontWeight:700 }}>{p.mins}' <span style={{ fontSize:10, color:C.muted }}>avg {p.avgMins}'</span></span></div>)}</div>
              {(()=>{
                const opt=allP.map(p=>({...p,...(ss[String(p.id)]||{})})).filter(p=>p.played>0&&p.net80!==null).sort((a,b)=>(b.net80||0)-(a.net80||0)).slice(0,11);
                return opt.length>0&&<div style={card}>
                  <Lbl>Optimum Team vs {scout.split(" ")[0]}</Lbl>
                  <p style={{fontSize:11,color:C.muted,marginTop:0,marginBottom:8}}>{og.length} game{og.length!==1?"s":""} of data - Best XI by Net/80</p>
                  {opt.map((p,i)=>(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:i<opt.length-1?`1px solid ${C.border}`:"none"}}>
                      <span style={{fontSize:12,color:C.muted,width:20}}>{i+1}.</span>
                      <span style={{flex:1,fontSize:13,fontWeight:700,color:C.text}}>{p.name}</span>
                      <span style={{fontSize:10,color:POS_COLOR[p.pos]||C.muted,fontWeight:700,marginRight:6}}>{p.pos}</span>
                      <div style={{display:"flex",gap:6}}>
                        {p.goals>0&&<span style={{fontSize:11,color:"#60a5fa",fontWeight:700}}>{p.goals}G</span>}
                        {p.assists>0&&<span style={{fontSize:11,color:C.green,fontWeight:700}}>{p.assists}A</span>}
                        <span style={{fontSize:11,color:"#94a3b8"}}>{p.net80s}</span>
                      </div>
                    </div>
                  ))}
                </div>;
              })()}
              <Lbl>Results</Lbl>
              {og.map((g,i)=><button key={i} onClick={()=>onView(g)} style={{ ...card, width:"100%", textAlign:"left", cursor:"pointer", marginBottom:8 }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><span style={{ fontSize:12, color:C.muted }}>{g.date} - {g.venue}</span><div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{g.scoreFor}-{g.scoreAgainst}</span><WinBadge gf={g.scoreFor} ga={g.scoreAgainst}/></div></div></button>)}
            </>;
          })()}
        </>}
      </div>
    </div>
  );
}

//  APP ROOT 

// PLAYERS SCREEN
function Players({ games, onBack, isAdmin }) {
  const [selected, setSelected] = useState(null);
  const [note, setNote]         = useState("");
  const [notes, setNotes]       = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("ps_notes")||"{}"); } catch(e) { return {}; }
  });
  const allGuests = games.flatMap(g=>g.guests||[]).filter((g,i,a)=>a.findIndex(x=>String(x.id)===String(g.id))===i);
  const allP   = [...ROSTER,...allGuests];
  const allSt  = calcStats(games);

  const saveNote = () => {
    const updated = {...notes, [selected.id]: note};
    setNotes(updated);
    sessionStorage.setItem("ps_notes", JSON.stringify(updated));
    setSelected(null);
  };

  const playerList = allP.map(p=>({...p,...(allSt[String(p.id)]||{})})).filter(p=>p.played>0).sort((a,b)=>(b.net80||0)-(a.net80||0));

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      <div style={{ background:"linear-gradient(135deg,#1e3a5f,#0f2544)", padding:16, borderBottom:`3px solid ${C.blue}` }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#60a5fa", letterSpacing:3, marginBottom:4 }}>PITCHSIDE</div>
        <div style={{ fontSize:20, fontWeight:900, color:"#fff" }}>Players</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{playerList.length} players with data</div>
      </div>
      <div style={{ padding:14, maxWidth:480, margin:"0 auto" }}>
        <p style={{ fontSize:11, color:C.muted, marginTop:0 }}>Sorted by Net/80  - tap for details{isAdmin?" and notes":""}</p>
        {playerList.map((p,i) => {
          const s = allSt[String(p.id)]||{};
          const hasNote = notes[p.id];
          return (
            <div key={p.id} onClick={()=>{setSelected(p);setNote(notes[p.id]||"");}}
              style={{ ...card, cursor:"pointer", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ width:32, height:32, borderRadius:"50%", background:POS_COLOR[p.pos]||C.border, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, color:"#fff", flexShrink:0 }}>{p.num}</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14, color:C.text }}>{p.name}</div>
                    <div style={{ fontSize:10, color:POS_COLOR[p.pos]||C.muted, fontWeight:600 }}>{p.pos}  - {s.played} games  - {s.mins} mins</div>
                    {hasNote && <div style={{ fontSize:10, color:"#a78bfa", marginTop:2 }}>"{notes[p.id].slice(0,40)}{notes[p.id].length>40?"...":""}"</div>}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                  <div style={{ background:parseFloat(s.net80)>0?"#064e3b":parseFloat(s.net80)<0?"#450a0a":C.border, borderRadius:8, padding:"4px 8px", textAlign:"center", minWidth:48 }}>
                    <div style={{ fontSize:14, fontWeight:900, color:parseFloat(s.net80)>0?C.green:parseFloat(s.net80)<0?C.red:"#94a3b8" }}>{s.net80s||"-"}</div>
                    <div style={{ fontSize:8, color:C.muted }}>NET/80</div>
                  </div>
                  <div style={{ display:"flex", gap:5 }}>
                    {s.goals>0&&<span style={{ fontSize:12, color:"#60a5fa", fontWeight:700 }}>{s.goals}G</span>}
                    {s.assists>0&&<span style={{ fontSize:12, color:C.green, fontWeight:700 }}>{s.assists}A</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {playerList.length===0 && <div style={{ color:C.muted, fontSize:14, textAlign:"center", marginTop:40 }}>Play some games first to see player stats</div>}
      </div>

      {selected && (
        <Modal title={selected.name} onClose={()=>setSelected(null)}>
          <div style={{ ...card, marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
              {[["Goals",(allSt[String(selected.id)]||{}).goals||0,"#60a5fa"],["Assists",(allSt[String(selected.id)]||{}).assists||0,C.green],["GF",(allSt[String(selected.id)]||{}).gf||0,"#3b82f6"],["GA",(allSt[String(selected.id)]||{}).ga||0,"#f87171"]].map(([l,v,c])=>(
                <div key={l}><div style={{ fontSize:24, fontWeight:900, color:c }}>{v}</div><div style={{ fontSize:10, color:C.muted }}>{l}</div></div>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ textAlign:"center" }}><div style={{ fontSize:20, fontWeight:900, color:C.amber }}>{(allSt[String(selected.id)]||{}).mins||0}'</div><div style={{ fontSize:10, color:C.muted }}>Total Mins</div></div>
            <div style={{ textAlign:"center" }}><div style={{ fontSize:20, fontWeight:900, color:"#94a3b8" }}>{(allSt[String(selected.id)]||{}).avgMins||0}'</div><div style={{ fontSize:10, color:C.muted }}>Avg/Game</div></div>
            <div style={{ textAlign:"center" }}><div style={{ fontSize:20, fontWeight:900, color:parseFloat((allSt[String(selected.id)]||{}).net80)>=0?C.green:C.red }}>{(allSt[String(selected.id)]||{}).net80s||"-"}</div><div style={{ fontSize:10, color:C.muted }}>Net/80</div></div>
          </div>
          {isAdmin && <>
            <Lbl>Coach Notes</Lbl>
            <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={"Add a private note about "+selected.name.split(" ")[0]+"..."}
              style={{ width:"100%", padding:12, borderRadius:10, background:C.border, border:`1px solid #334155`, color:C.text, fontSize:13, resize:"none", minHeight:80, boxSizing:"border-box", fontFamily:"-apple-system,sans-serif" }}/>
            <button onClick={saveNote} style={{ ...btn(C.blue), width:"100%", padding:14, marginTop:8 }}>Save Note</button>
          </>}
          {!isAdmin && notes[selected.id] && <>
            <Lbl>Coach Note</Lbl>
            <div style={{ background:C.border, borderRadius:10, padding:12, fontSize:13, color:"#a78bfa", fontStyle:"italic" }}>"{notes[selected.id]}"</div>
          </>}
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  const [screen,   setScreen]   = useState("home");
  const [gameInfo, setGameInfo] = useState(null);
  const [games,    setGames]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [viewing,  setViewing]  = useState(null);
  const [isAdmin,    setIsAdmin]    = useState(() => sessionStorage.getItem("ps_admin") === "1");
  const [showPin,    setShowPin]    = useState(false);
  const [prevScreen, setPrevScreen] = useState("home");
  const seeded = useRef(false);

  useEffect(() => {
    const unsub = listenToGames(async fbGames => {
      if (fbGames.length === 0 && !seeded.current) {
        seeded.current = true;
        await saveGame(makeLVURush());
        await saveGame(makeCoppermine());
      } else {
        setGames(fbGames);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const updateGame = g => { setViewing(g); setGames(prev => prev.map(x => x.id === g.id ? g : x)); };
  const handleDelete = async g => {
    if (window.confirm("Delete " + g.opponent + "? This cannot be undone.")) {
      await deleteGame(g.id);
      setGames(prev => prev.filter(x => x.id !== g.id));
      setViewing(null);
    }
  };
  const handleEnd  = async g => { await saveGame(g); setScreen("stats"); };

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, ...T }}>
      <div style={{ fontSize:28, fontWeight:900, color:"#60a5fa", letterSpacing:2 }}>PitchSide</div>
      <div style={{ fontSize:11, color:"#93c5fd", letterSpacing:2 }}>Baltimore Armour 11G Aspire</div>
      <div style={{ marginTop:20, width:36, height:36, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.blue}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );

  if (viewing) return <GameDetail game={viewing} onClose={()=>setViewing(null)} onUpdate={updateGame} onDelete={handleDelete} isAdmin={isAdmin} backLabel={prevScreen==="stats"?"Back to Games":"Back to Home"}/>;
  if (showPin) return <PinScreen onAdmin={()=>{setIsAdmin(true);sessionStorage.setItem("ps_admin","1");setShowPin(false);}} onViewer={()=>setShowPin(false)}/>;

  return (
    <>
      {screen==="home"    && <Home    games={games} onStart={i=>{if(!isAdmin){setShowPin(true);return;}setGameInfo(i);setScreen("lineup");}} onStats={()=>setScreen("stats")} onView={g=>{setViewing(g);setPrevScreen("home");}} isAdmin={isAdmin}/>}
      {screen==="lineup"  && gameInfo && <Lineup  gameInfo={gameInfo} onKickoff={i=>{setGameInfo(i);setScreen("game");}} onBack={()=>setScreen("home")}/>}
      {screen==="game"    && gameInfo && <Game    gameInfo={gameInfo} onEnd={handleEnd} onBack={()=>setScreen("home")}/>}
      {screen==="stats"   && <Stats   games={games} onBack={()=>setScreen("home")} onView={g=>{setViewing(g);setPrevScreen("stats");}} isAdmin={isAdmin}/>}
      {screen==="players" && <Players games={games} onBack={()=>setScreen("home")} isAdmin={isAdmin}/>}

      {/* Bottom Nav Bar - hidden during game and lineup */}
      {screen!=="game" && screen!=="lineup" && !viewing && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#0a1628", borderTop:`1px solid ${C.border}`, display:"flex", zIndex:100, paddingBottom:"env(safe-area-inset-bottom)" }}>
          {[
            {key:"home",    label:"Home",    icon:"M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"},
            {key:"stats",   label:"Games",   icon:"M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"},
            {key:"stats",   label:"Stats",   icon:"M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"},
            {key:"players", label:"Players", icon:"M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"},
          ].map(({key, label, icon}) => (
            <button key={label} onClick={()=>setScreen(key)} style={{ flex:1, padding:"10px 0 8px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderTop:screen===key?`2px solid ${C.blue}`:"2px solid transparent" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={screen===key?"#60a5fa":C.muted}><path d={icon}/></svg>
              <span style={{ fontSize:10, color:screen===key?"#60a5fa":C.muted, fontWeight:screen===key?700:400 }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Admin / Logout button */}
      <div style={{ position:"fixed", bottom:screen!=="game"&&screen!=="lineup"&&!viewing?70:16, right:16, display:"flex", gap:8, zIndex:101 }}>
        {!isAdmin && <div onClick={()=>setShowPin(true)} style={{ background:C.border, border:`1px solid #334155`, borderRadius:10, padding:"7px 12px", cursor:"pointer", fontSize:11, color:C.muted, fontWeight:700 }}>Admin Login</div>}
        {isAdmin && <div onClick={()=>{setIsAdmin(false);sessionStorage.removeItem("ps_admin");}} style={{ background:"#7f1d1d", border:"none", borderRadius:10, padding:"7px 12px", cursor:"pointer", fontSize:11, color:"#fca5a5", fontWeight:700 }}>Logout</div>}
      </div>
    </>
  );
}
