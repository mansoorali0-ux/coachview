import { useState, useEffect, useRef } from "react";
import { listenToGames, saveGame, deleteGame, loginAdmin, logoutAdmin, onAuthChange } from "./firebase";
import { calcStats, makeLVURush, makeCoppermine } from "./stats";
import {
  ADMIN_PIN, HALF, GAME, CUP_HALF, CUP_GAME, ROSTER, DEFAULT_POS,
  UPCOMING, LEAGUE_TEAMS, TOURNAMENT_TEAMS, POSITIONS, POS_COLOR,
  uid, findPlayer
} from "./constants";

// ─── PROFILE-FIRST PORTRAITS INCLUDED ─────────────────────────────────────
// Portraits are used only on main player cards and overview identity areas. Lineups and Optimum XI keep clean number badges.

// ─── STATIC PLAYER PORTRAITS INCLUDED ─────────────────────────────────────
// Uses curated generated portrait assets as prototype placeholders across roster/profile/Optimum/overview surfaces.

// ─── AVATAR SUB IMPACT OVERVIEW INCLUDED ───────────────────────────────────
// Modern prototype portraits for roster players, full-name card layout, and season-level Sub Impact overview.

// ─── METRIC EXPLAINERS INCLUDED ─────────────────────────────────────────────
// Impact, Net/80, GF/GA, and Sub Impact include short explanation + expandable formula/details.

// ─── SUB IMPACT FINAL INCLUDED ──────────────────────────────────────────────
// Individual sub impact rows plus game-level Sub +/- summary. Full event visibility and full-name readability included.

// ─── PREMIUM REBRAND v1 INCLUDED ───────────────────────────────────────────\n// Matte graphite + ice-blue design system, premium cards/buttons, and player-name fit improvements.\n\n// ─── ANALYTICS ENGINE v2 INCLUDED ─────────────────────────────────────────────
// Impact Score v2 = 50% Team Impact / Net80, 25% Production, 15% Reliability, 10% Defensive Stability.
// Includes position-adjusted goal, assist, and clean sheet values plus small-sample guardrails.

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


// ─── PREMIUM DESIGN SYSTEM v1 ────────────────────────────────────────────────
const C = {
  bg:"#030712",
  bg2:"#07111f",
  surface:"#0b1220",
  card:"#0f172a",
  card2:"#111827",
  card3:"#0b1324",
  border:"rgba(148,163,184,0.18)",
  border2:"rgba(96,165,250,0.22)",
  blue:"#38bdf8",
  blue2:"#2563eb",
  cyan:"#67e8f9",
  text:"#f8fafc",
  muted:"#94a3b8",
  muted2:"#64748b",
  green:"#22c55e",
  red:"#ef4444",
  amber:"#f59e0b",
  purple:"#8b5cf6",
  black:"#020617",
};
const T = {
  fontFamily:"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  letterSpacing:"-0.01em"
};
const card = {
  background:"linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,13,25,0.98))",
  border:`1px solid ${C.border}`,
  borderRadius:22,
  padding:"15px 16px",
  marginBottom:12,
  boxShadow:"0 18px 45px rgba(0,0,0,0.28)",
  backdropFilter:"blur(16px)"
};
const btn = (bg, color="#fff", extra={}) => ({
  background:bg,
  border:"1px solid rgba(255,255,255,0.08)",
  borderRadius:16,
  color,
  fontWeight:900,
  cursor:"pointer",
  padding:"14px 16px",
  fontSize:13,
  letterSpacing:"-0.01em",
  boxShadow:"0 12px 26px rgba(0,0,0,0.24)",
  transition:"transform .15s ease, box-shadow .15s ease, opacity .15s ease",
  ...extra
});
const inp = {
  width:"100%",
  padding:14,
  borderRadius:16,
  background:"rgba(2,6,23,0.72)",
  border:`1px solid ${C.border}`,
  color:C.text,
  fontSize:16,
  boxSizing:"border-box",
  outline:"none",
  boxShadow:"inset 0 1px 0 rgba(255,255,255,0.03)"
};

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



// ─── IMPACT SCORE HELPERS ───────────────────────────────────────────────────
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function defaultHalfLength(type) { return type === "tournament" ? CUP_HALF : HALF; }
function normalizeHalfLength(value, type) {
  const n = parseInt(value, 10);
  if (Number.isFinite(n) && n >= 20 && n <= 50) return n;
  return defaultHalfLength(type);
}
function gameHalfMinutes(game) { return normalizeHalfLength(game?.halfLength, game?.type); }
function gameFullMinutes(game) { return gameHalfMinutes(game) * 2; }
function avgGameFullMinutes(games) {
  const valid = (games || []).filter(g => g && g.status !== "scheduled");
  if (!valid.length) return GAME;
  return valid.reduce((sum, g) => sum + gameFullMinutes(g), 0) / valid.length;
}
function posGoalValue(pos) {
  if (pos === "GK") return 15;
  if (pos === "DEF") return 12;
  if (pos === "MID") return 10;
  return 8;
}
function posAssistValue(pos) {
  if (pos === "GK") return 8;
  if (pos === "DEF") return 7;
  if (pos === "MID") return 6;
  return 5;
}
function posCleanSheetValue(pos) {
  if (pos === "GK") return 8;
  if (pos === "DEF") return 7;
  if (pos === "MID") return 4;
  return 2;
}
function posGAWeight(pos) {
  if (pos === "GK") return 1.15;
  if (pos === "DEF") return 1.0;
  if (pos === "MID") return 0.75;
  return 0.45;
}
function normalizeNet80(net80) {
  // Converts raw Net/80 into a stable 0-100 Team Impact score.
  // +4 or better is elite, -4 or worse is very poor. This prevents short-minute volatility.
  return Math.round(clamp(50 + (Number(net80 || 0) * 10), 10, 95));
}
function reliabilityFromMinutes(avgMins, fullMinutes) {
  const share = fullMinutes > 0 ? avgMins / fullMinutes : 0;
  if (share >= 0.90) return 100;
  if (share >= 0.75) return 85;
  if (share >= 0.50) return 65;
  if (share >= 0.25) return 40;
  return 20;
}
function playerIntervalsForGame(game, playerId) {
  const pid = String(playerId);
  const halfLen = gameHalfMinutes(game);
  const fullLen = gameFullMinutes(game);
  const events = (game?.events || []).filter(e => e.type === "sub").slice().sort((a,b) => (a.minute || 0) - (b.minute || 0));
  const starting = (game?.starting || []).map(String);
  const secondHalf = (game?.secondHalfStarting || []).map(String);
  const hasSecondHalf = secondHalf.length > 0;
  const points = events.map(e => ({ ...e, _kind:"sub", _minute: clamp(Number(e.minute) || 0, 0, fullLen) }));
  if (hasSecondHalf) points.push({ _kind:"half", _minute: halfLen });
  points.sort((a,b) => (a._minute - b._minute) || (a._kind === "half" ? -1 : 1));

  let on = starting.includes(pid);
  let start = on ? 0 : null;
  const intervals = [];
  const closeAt = (minute) => {
    if (on && start !== null && minute > start) intervals.push([start, minute]);
  };
  points.forEach(pt => {
    const m = pt._minute;
    if (pt._kind === "half") {
      closeAt(m);
      on = secondHalf.includes(pid);
      start = on ? m : null;
      return;
    }
    if (String(pt.playerOff) === pid && on) {
      closeAt(m);
      on = false;
      start = null;
    }
    if (String(pt.playerOn) === pid && !on) {
      on = true;
      start = m;
    }
  });
  closeAt(fullLen);
  return intervals;
}
function playerOnFieldCounts(games, player) {
  const pid = String(player.id);
  let mins = 0, gfOn = 0, gaOn = 0;
  (games || []).filter(g => g && g.status !== "scheduled").forEach(game => {
    const intervals = playerIntervalsForGame(game, pid);
    intervals.forEach(([st,en]) => { mins += Math.max(0, en - st); });
    const goals = (game.events || []).filter(e => e.type === "goal_for" || e.type === "goal_against");
    goals.forEach(ev => {
      const m = Number(ev.minute) || 0;
      const wasOn = intervals.some(([st,en]) => m > st && m <= en);
      if (wasOn && ev.type === "goal_for") gfOn += 1;
      if (wasOn && ev.type === "goal_against") gaOn += 1;
    });
  });
  return { mins, gfOn, gaOn, netOn: gfOn - gaOn };
}
function calcPlayerImpactBreakdown(games, player, statOverride) {
  const s = statOverride || {};
  const played = s.played || 0;
  const counts = playerOnFieldCounts(games, player);
  const mins = s.mins || counts.mins || 0;
  if (!mins || mins < 1 || played < 1) return null;

  const full = avgGameFullMinutes(games);
  const avgMins = played ? mins / played : mins;
  const pos = player.pos || "MID";
  const goals = s.goals || 0;
  const assists = s.assists || 0;
  const gfOn = Number.isFinite(s.gf) ? s.gf : counts.gfOn;
  const gaOn = Number.isFinite(s.ga) ? s.ga : counts.gaOn;
  const netOn = gfOn - gaOn;
  const rawNet80 = mins > 0 ? (netOn / mins) * full : 0;

  // 1) Team Impact: built from Net/80, but normalized so low-minute swings do not dominate.
  const teamImpact = normalizeNet80(rawNet80);

  // 2) Production: position-adjusted goals and assists. Neutral baseline of 50 so non-scorers are not crushed.
  const weightedProduction = (goals * posGoalValue(pos)) + (assists * posAssistValue(pos));
  const productionPer80 = mins > 0 ? (weightedProduction / mins) * full : 0;
  const production = Math.round(clamp(50 + (productionPer80 * 3.2), 50, 100));

  // 3) Reliability: coach-trust layer based on share of match played.
  const reliability = reliabilityFromMinutes(avgMins, full);

  // 4) Defensive Stability: rewards clean sheets and low GA while on field. Includes midfielders.
  const gaPer80 = mins > 0 ? (gaOn / mins) * full : 0;
  const cleanSheetEarned = gaOn === 0 && (avgMins / full) >= 0.25;
  const cleanSheetBoost = cleanSheetEarned ? posCleanSheetValue(pos) * 4 : 0;
  const lowGABonus = gaPer80 <= 0.75 ? 10 : gaPer80 <= 1.25 ? 5 : 0;
  const gaDrag = clamp(gaPer80 * 6 * posGAWeight(pos), 0, 28);
  const defensiveStability = Math.round(clamp(50 + cleanSheetBoost + lowGABonus - gaDrag, 20, 100));

  let impact =
    (teamImpact * 0.50) +
    (production * 0.25) +
    (reliability * 0.15) +
    (defensiveStability * 0.10);

  // Small sample guardrails:
  // A short cameo should not outrank a full-game trusted starter unless the production is truly exceptional.
  const minuteShare = avgMins / full;
  const majorProduction = weightedProduction >= 16 || goals >= 2 || (goals >= 1 && assists >= 1);
  if (minuteShare < 0.15 && !majorProduction) impact = Math.min(impact, 65);
  else if (minuteShare < 0.25 && !majorProduction) impact = Math.min(impact, 72);
  else if (minuteShare < 0.25 && majorProduction) impact = Math.min(impact, 84);

  return {
    impact: Math.round(clamp(impact, 25, 100)),
    teamImpact,
    production,
    reliability,
    defensiveStability,
    rawNet80,
    gfOn,
    gaOn,
    mins,
    avgMins,
    cleanSheetEarned,
  };
}
function calcPlayerImpactScore(games, player, statOverride) {
  const b = calcPlayerImpactBreakdown(games, player, statOverride);
  return b ? b.impact : null;
}
function fmtImpactScore(v) { return v === null || v === undefined ? "-" : String(Math.round(v)); }

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────
const PLAYER_PHOTOS = [
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wAARCACAAIADASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAABgABAwUHBAII/8QAPBAAAQMDAgMFBQcCBQUAAAAAAQIDBAAFERIhBjFBE1FhcYEUIjKh0QcjQlSRk7EV8DRicsHhMzVEU4L/xAAaAQACAwEBAAAAAAAAAAAAAAABBQADBAIG/8QAJBEAAwACAgMAAgIDAAAAAAAAAAECAxEEIRIiMRNBQpEjMqH/2gAMAwEAAhEDEQA/ANShWW2W2IiNDt8VhlAwlCGkgfxXR7HF/LM/tp+lS09VHZD7HF/LMftp+lMYUX8sz+2n6VPSqEIPYov5Zn9tP0rz7HFH/jMftp+lSvuoYZW64oJQgZJPICgK9ccpcMhENwJQz7vcVqOw8hk1VeRQWRDoMFP2lDikKTFSU88oTt8qiN3sKY63C5DwjORoAO3hisscvkudIKmV60obSUAHG5549c08e1u3G9oQpaG2o7Hva1blSs4SB8z51R+ay78UmoM3eyvhOhcQ6xkYQDn5VZNMRHEhSY7BB5ENp+lZaLNIgRg84mRkK1IU23qJPU9wHTG9XvD/ABVIbbUlxpSo6HNBJ2Iz3Z54oTnafv8ACVhTXqHHscb8sz+2n6UvY4uf8Mz+2n6UmJDUhtLjTgWhXIipq2J77Rma0RexxfyzP7afpS9ji/lmP20/SpqVQBD7HF/LM/tp+lUHFXAlk4qtbkeRCZZk6T2MltASttXQ5HMeBolpDmPOiQixT0qVAIqfkM0q5p0sQ4i5B3S0kqI8AKj6IAHHN7kzrkm0wF5Q1u4UqxlfdtudP80LOcOpUS5JlJaWfjwNlZ5jFWNofDT+qSr76UorUeoBPP1qnemmbe33z/0gtSWUdEpztSrJlbrYzxYtrRZ22yMRXipuanJ3CFJO/f5VYv2syJHaLccbBA3TzJxjJ8a8wQXWgEjT34q1YZUWQM5PdWWstP4b548T9K9ty4WxwFiUpxoAAoUM4HUDuz31fQnE3eGpJZaAxjShJSRU8a1LfbK9GQOtd8JyPCeQh1sJK9tQGBq/5/mjNV/P4V5Mca3H0prRcHrZf3or4U3HeSk4V+FXLPrtRuknG/yoa4mZjyI6ZCMaORUBlSCeox/FXcF0OxGVpVqStAOaZcev4irNP7OulSpq2mUenHxDzpqcfEPOoQjp6YU9AIqoOLZgj2SQgoKg4nSSByFX9DnF0iO1aJCH5DbJUghAWfjUN8f34VXlfqzvH/sjJUOOSbu6pasYSSEj8PdXiM2p10aEnHhXZa2+2tjslISXFlZGo45d9cbMWRnS3xCqNIPJtDYKf050scpjjFtIL7aw4lv3jg1dMJKFhJG+1A0C/XC3zhFub7L6Qd1hOhQ9KObc6ZkZx5tOdIyk1U8emalkVIKICCmKccsYrheQCspcSFIPMGgqZfry3LDKL6zA18kob1q/SiKC0+8z/wB6ckSgMlDzWlJHlz9a7vVSkiiZcttkiyYchbGvtG0p3QruP+1XdnIFtbAKjjYbdO6hfiN9yOiPLSn75LobIHXI5fKiiylpVrZLR205UkfhzvXfE6rRk5U9bLKlTgbU1NhYPTj4h501IfEPOiAjFeqanoEEThJIoC+0aMFQIEtxRSht9aXT/lKPqKPTyNCHG9tXfbXItzROQyXQAeo3/gGqsy3LRfgerTM9dQEcMs+zEJD6lFKh3Gh08HOPOuGWZa+1IIdRuB5YO1XcVDi+FW2Fq1eyuKSCBg6cAjPjiruyPAxwkn3QNwTS5XUdocxhnImqBm+25vsYmkyCplGjU5zUc5z4d2Bt61pPBgUrhMtLyQVAKPhv1oHuUtudc1tMAFLIyo55ZPSj3hZpH9I0MPJCE4OnPM0Lp19OpxzCegF4p4J7a8rBTJSwt0ONut+9gd31zRvYbDCirYcYmSittABaJ93PMkA5057hgeFe7/MjRJTMd/LalJyk6shXfVxakQ02sqZX77nPFTzql4/oDxSv8n7ODiBDCoTi3M9mlxJ251YcPxuwYfk6tXbOZG+fdAAqCXCM6KqOT7i86iBk7DbHd512QmVQJDbB2Q63uOgUOY/iucK9/IoztLHrfZcDlT0yfgHlT05XwTManHxDzpU6fiHnRAeKVIUqBBVxMtAXF1fXAxXbUZbw+lY8jQaOkZ5x9boVjitP2+GhgSXVqeCScKVgdOmxPKg9UtyHanHyoNMnILh/CBj6itb4utSLxw86wBl5B7Rod6u71FZjHeabtE23Po3XggKHJQ2IpbyV410N+Hk3Gt9golmFJQV+3NFC9lFKtQPnWh8Mrs8dlEWTNjzojgBUHQcgjpihO0RGLVM1RmwG3FZU1oC05wRnSfA9K0i1XnQ+ltmNEQVaMrbje8NPXc4zQ6f7NMw9b1/088av8N3CytpcukaMtoZY94JVkdEjr5CuLheTKXbXUrwVML7PUNgvuI9DRW5bIryfapbYkSUtlDSlpB7MEb4A2GcDlVLGfi2S1rXIWlDTOVrV3/U1RmfaSJjek0dDc5DV+DSlE6G0pUArYE5O49aIHcLdYV1BJ+VZdZ7+bleXXJOG3JDhcbUnlp/CD4Yx61qFvV28Vtaxg42B8/8AirONe28Zh5M/LO4cqVIcqVNxYPTp+IedMKdI94edEBEDT5rxmnoEPWafpXmnzUIcspsvOtp5DNYren+y4knsun4JLgSruGo7GtyUn3dXII3KjyHfmsAv7wf4hnPNklDr61pPeCdqx8npI3cTtsuoPsYUjOFOZyk52UKObW1CMlAdQApQBJzWOocdaUAlRSc5FHnDcdyaUOSZD+QMYSrFLm1PY1l+S0H0yWzHaDLR7V5ewSnoKD+NmTG4a+IKccfb1HpzOwojQw2xgNp0+e5PmaHPtCS4eGFuoBIacQpWOYGcE+maqq/KgKdIBeDre9db4uMhxQbaeJbcSfhBOCPIgZ9K0triB2Pey20grhIAbQRz22Of760G8JM/0F1LbyvvRFW6AeqsnbxwMVc2a5MOXFxCwkB9SVJPTURy+XyrmsntuTn8e1qjS477cmOh5pQUhYyCKlrjhRxHDoRshxZWB0Ga6xXoYpuU2IrST6PYpD4h502aQPvDzqw4IKVRyH2oqdbziW0nkVHGfLv9KrrhxA3EZ1NxwNshcx9ENvzy4dR9E1CFsKDOMftNs/By223UrnvrJCm4ziMt7ZGrJyM+VCPE/HzAK27jxdCZZ/KWFtUl1XgXV4SPPFZXxBxeL+wm2w7ZFgWxpztG06Q5IUrfK1undSjnfpRSA2FsPjCfxXcJ16ly30qLhaaioeUGWG8cgkHBJ6k0ludrI1HqaDOEHhBvRhvr0tSsBJPLV0/WtCVa1aVAJIUmlXK2smmN+Jpx0TG2JdDTqefUijKxFTDaQXBjqMVScMxXJ8Bxsj32jV0htcRs69tPU0tpv4MklovhIC3Njy61w3tPb21xC/hXgHPdneui2x1PREugE6t/SqPjeWqJblN6sahg+FBS6OG0ugO4idcfmxVRnCh6KyhZxzQSDv4pOcH0rqtAU4UupGlfMJ6BXPT5HmCKpOG7h/W+I25SPeaYZcbe8QBgDyOQfSirh21vMNrS5kta1aCeeAQoY9T86OWXC8H9OIpV7IOLNxb7SwhC2FLUBg6cZB8qIokxic12jC9QBwRyIPcRWaW7SZDzqlFho4UlYRqKc5zlPUgg+lF9huMN5x1bEiJPU8dQXGeSgqHQhtZBP6nlTDh57r1b2L+ThmfZIJRSHxDzqJDyVvBnJS8RqDawUrI79J3/AEqTOCM99NRcfMl++1e/Xlbot6jaIznMtLK5C/8AU8d/ROkUEO9q84qQ64p1xRyVukrUfMnemhEracS57nVOe+uhJQY+CQFd1W6K9nI4vIw42FA8iKgCWQv3VaT4muxSQAE5BAFQrQF/Eipoh77QushC1AlPJQ5itv8As/lxuM7ClhlQYvsBAEhgq2kIGweRnr0UOh35GsLTHGrIyk1Y2u5TLRPZmwn3I0lhWpt1s4Uk/wB9Kqy4ZyzqkW4s1Yq8pZ9O2m3x7aC5p0Og4WgjBPnVbxC4mQotMJxq3NUvCv2y2a8MtxOLW0QZQGkTUAhpfnjdB/UeVXS+IuAX5QUOMYQa6p1e9+uKVXwsi6jtDbHzcbflfTJrI5JXH7N1akBPuoSn+96FvtVkQ7NZ/ZH1l+7zAChkq/wzf/sXj8R5JT5k10cT/a/ZbE2uHwey3Kl40m4PDUhH+gH4j47DzrGp90eub70qXKW/IeUVuOuKytavE1q4/CUe19sy8jnO+o6QYfZYiPGVJdOzslRIGOSEnHzUflWjXGSqJc4sZtZwpACvEnGd/wD6JrFuEr8i2XlovKDbYYW2FK+EEnUM+tHyuLLRNeZlLuDDbhIUoKV8JI0n5Vh5mG/yOkn2X8XLPgk38OubcNDrUlk4SrKOe2RuPlmqC92YXBh5LY9ncwp1laee2FqwBzGMnArpiT7H7G9Fdu8XQy59ypS9ynpjyG1dcu+WFNsQsXiMt2O2pKA0sa8kadQ256SqqcGO4taT/ouzXNQ+1/YMWzjm+8OKbbal+2RVEEwpRK2wemnfUg+KSK3vhe7ovtnYlsyFyG3MkKWcrQcjU2v/ADJJ2P4klJ55r5wnyYrct3s5DLiEL+7LZ2Ukcv8Aajj7KuNbfZJ8+LNntR4zyEvJK1YBcScEeZQpQ9BXoUuhG32f/9k=",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wAARCACAAIADASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAABwABBAUGAwII/8QAOBAAAgEDAwIEBQIFAwQDAAAAAQIDAAQRBRIhBjETQVFxBxQiYYEykRVCUqGxI8HRJHLh8UNic//EABoBAAIDAQEAAAAAAAAAAAAAAAEFAgMEAAb/xAAjEQADAAIBBQACAwAAAAAAAAAAAQIDERIEISIxQRNRMnGB/9oADAMBAAIRAxEAPwAq2VjbadaR2tnBHbwRjakca7QBUjn1NKmqkmPk+p/elk+pps0s0Th848zVDr/WOi9OLnUL6NJMZEQOXPpwK89V9Qx6Dpv0NG17PlLaFm5kfyGO+M9zXzt1tJqmpa7NYrdC/MEr75o49ivIT9Z88gH6QT5KKrdd9IsU9ts2d/8AGa5nvPEtRMHQ5SJXHhEZ5UjHJx5571o5/jHp8dhaLEkk1xc8PEuFKn0J/wB6A8GmahZz7pIs4P0gnsfWr22ZJFVZWQSg5y4AAbHAz5VHi/jJ8l9QTYfjInjOyxqVJO2KRsEfcsP8Yra9P9cWOsBFE8TyNwQhPB9OfL0NfKN4z2d/LtUoNxwQc1rekNZayWa+kt1uI0VdyElQwJx5eeahSqPLZKeN+Oj6uR96ggnmvfOO5oedHdaR3Vkkk1vJZ2877VDsXVG9N38ue4B49D5UQVbcoIOQaumlSKalyx+fU0+T6mmp6kQF+TVV1H05p3VOjy6dqUCyI4+iTH1xN5Mp8iKtaXn+aKOOVKnpqBw1Q9Wvv4ZpN1e+GZfAjaQIO7YHaptYDr3WXtRem6bFhaRIBBkqbiVwSAT/AEjGCPc+VCnpEpW2ZzqjWE6cvDqVxLFe9QXVuqDBJW3XJP0kjheQMDvj70NW1+RUlWNVUnJdh9IyfP8A8VUarql3qupz3FxM0s0jfU3lgdh7f8CuFtaXN3NsjB75BHlValLvRY6b7STF1CVYJI1BywAY4GfyfKuYine1I4O8hiCfPsM+lWUHSV/DFHK4DLuBZSe9aO16Q1IRlxPABLhghx3xgce1B5sa77JLBlfwwcRN0MOniBTtYnnd96mHTxaQlYpZTbOeVVsMvOfyM1orrpq5gLubBkkbAXwzlR9wKjy2LQRgSsg2ttaNj9QHnxQdqv4skoc/yRK6S199PmWJy5tX/wBMiT+fB57enfH2o8aJr3zXhHEckFwQFkik3AHHmCAQDg+vNfOenQG36m+TE+InOV3DIUkHmtl8NtXvm1OC0eWNGJYiNwFUEEcfnniqduK7FjSuQ/DkU9QNP1H5lmhliMM8f6lJyPLsR7ip9bU99zE1ocU47j3pqcdx70QHLzpUqVA48TFlhcoMuAdoPmfKgL8XrmJZNPii3eNPGZ53IxubsBjywc0db4K9q8bEjxAVGO+TXzl8VIp36osw0m9ZYBgAdsMQR7571F92Tn0Y+whecsUQu7nn7Ctl0/p6xSL4i4J8gKg6HZJbRM5B57E/4rR6VGWuAQDS3qMj7pDXpsS7NmjgsYZAmYgOOMVbppyFFURggCudhE52krjitFpkQZxnByaVzLp6bGtUoW0ZrV+nJ3t98KkPj6cnBz5c0P8AqqJ7WOEyIY5kADFsEMvr98c0etRQuq/SMD7VkOqtMttQtxDJbxlW4Llf0n38q1S/w3r4Y7X5o39AxeSxpaJdqu5ceQwWHYgmullc+G4uMLE0JAcSAbWz557g03Utn8r87YwuQsZHY5AHGAP2qr025nJNoqcxjd4uM7SOx/8AdMrnlO0LIrjWmH3o3W57yXbOd5QpGzLhhlhkfUCQwKrnPr5Vvh2oQ/DvUIbWR9PubUwxXT+JFOqEI0gUA/UPf8UWLKUS2iEOGI+lseoq3BW1opzzqjvSHce9KkO4960Gc50qVPQOIOoBsxMgyyEsM9jx/wCaA3xXlgk6qsLlFCSdpEyMgbuMj96+gZ4/EjK4BzQL+KmlpF1WJZpAWmEHhefbIbmq7fHuXY55diHrFleqscdgkaEg5kk5C/j1qDbS9SaRMsni2N9GP5SNrVa69LdTma2t3CAHGcZxVTomh3I1qFpNRKWLoFuVJVix89oIxz9+1YZ1S76/0Y0ql+O/8CB071CNQhxLD8vKuAVzkH2q91HULvSoFeztDcSkZXJwv5NDHRbe4sOp44Wk3R78HBOMZ47/AGorda28t505L/D5DDJHGpAAJyPM8VkqVNdjZNOp8iu07X+qdZuDFcvpdhCOARlnqzEGoLctFdvBPGVyksQ2k/Zl/wBxQ56Q6e1M6zdldXlWzkU+Gocb92DgFWBUjJyc5PHHeijpNhPpuklL25W4nUfqVNo/zUs63PtMqxeL9NAB6jWW5utZkRJHjjuCsjr2QA4GfSq3S5oIrFo/mnhd3A3AfrUdwfPnP9ua1vVllFa9LaxeRb1Z7iRJFJwGLkhCB+9Y+x8e3vBYiMHx4EYu3OwEdz6Vrm+cf0ZLjhf9m40DUbjSdVs5LYtPAzGLYwIUK2CxHkDgZ/FHW2YPKksYGJU3MR/agR0X/rmR5LjFwFzE0gBVnHYMvoQcf+6L/R73A0K1+ZG1pFLRryQF3dgT6f4xUsFNVxZXnSa2jR047j3pvKnHce9bzAeMUqelQOPJ45oRfF7SZLiTTtURsCINGM8/WG3Dj0Iz+1F4jIqDfaTZatpz2V9brPAxyUbPBB4II5BHrUMk8lpFuK+FbYHcBNUWddpWZQ/PIORmtCfAFs0wVUIXO4DGKqerrSHSdelsrZPCig2iJMk4XaCBzVbc6mZtMeAvgsME+9KMsNUPsOSXB50pWvtcjkAKoZNysf5+aMsETwJHNcg7NmcrzgAedBbpzSL281W0jGoGGKLhQzYGO+MedFzRLCO6hi1GaW7E3heE8BlPhn77Ki1uuxzfj3O1nDDcXm+0k8NT32+ddtZmEMEioMkLgYPc1URIumX0ny7kxhv0Z5XNV3WWrNbdHapdo5jkigYo2cHeeF/uRVfPkuC9sNTp8/iMB8ZbkaTotppRbdPfypM2Bj6UyOPyQP3rDRTC4t4pwwgntYRE5bJ8Y5wFwO3Hcn0qk1bU9T6hvFu9TvZbu52iNWc9gOwAHbn/ADVrZ280WnWrxl2klVy3HGARxnzOOcUzWJYsan6K3leXI6+Gu0bTI7m6VbYyWUksTPjxMZfP04z5Z/zRl6X1ATR29rMTE1pApSF+GbPG8f1DyyPMmgvY3Cam/iTvHFIqlgS207lGQF9ckDj1ovadb/O67pMkasj29qbq5QfpV3G0KPTccsR24BqnE6VbLMyTk2h70h3HvXlG3IGHYjNex3HvTQWHilSpUACpDg5pqWaJxgPiTockzR6zAm5Y1Ec4HcD+V/bnB/FDXUbe3vrWKIl43Q53I20/ajf1Ym/o/VxnDfLO2fPI5H+KBsd0k0uJsIT/ADDsf+KXdROqTQz6W9xxZJ0e00yKTbe3l3Gf61kGf8UQtAg0+8j3x3l3K/A3LLtC/sOazWgpZtcbJEjY4yd3Oa3+lTaTHYeIqJEQO44rFWV+hqm1HYjppNjpF/JcQNM/jjL+LKZCT65NCr4x9VxNaJ09Ztvd3WW62/yqOQvuTz7AetFOV31e4xEGitU/m7M/t6CgV8RLYQde31xLAGtmdYVAbGSIl/xkUelSrNt/O5k6pucWl9MXZM4glaMEup4JByB9vvV7paz3cHgLM+103CMHjd2BPp7+gqu8B45EtEBQy4fEh2Bx5HPp3qx0ZLhdiwr/ANUcReEwyJATjB9O9NMr2ti3EtPRtOnNLsjb7Lu7VYhIcyYJwQOGP23Efiin07cT2kUd3Nh0RRa3Ljgp9WQT67ckZ9KHHQ+lG+i1gIRB4QJj2sWCsMjOfMHB9x+KI/Qq46fl0gwtCYgroSwbcpPJJHfJBPsaxxvmasmuJuE2mNShBUjjHIxXodx71X6Ghh0iGJlKsmc//Yk53fbOasB3HvTOXtJiylptHOmpZps0SI9KoOqazp2i24n1G8itUbhd5+pz6Ko5Y+wNCv4jfFbV9KFtHoiRWKux3G42NcMMcExHmMemefsKJxu+ruoNLtdD1WyN7BJfeAYvllcGRS4wMjyGOeaBgRmfaKi6HqM1/pskssrS3EkzvM7HLO7HO4nzOKsIZPCnUuOM0t6i91r9DTpo1O/2etPtJ57xY1kZOf6sUUdD0aCC3U+Gpf1J3GshYQJ8yr7Rzg5raWl2Iodo9qVZb2xnjjSLeNVjU45oVfEPptbu+bUvDnkiDpJMkCBnwOCQPPiidC7yADBqNrcttpejXGo3X6IEzjzZvJR9ycCuw3UUnBHLE1LVgFtiurX17fvC13aW9v4IdYRGyxnOCB23jk898HFSdKhu9GtLTXltlnjLnL7gRGwxgMD5nII9RTaUliuvWaavdNb6fJNuuVETTI/c4aMEbhk/juK3modDiSx+Y0Xbf6dvSVJbMm7t8r23AZkj4JBDqe/6q9BkxPQix5Z2VOmwS2F3Y6larcWlne3KQrGW+rYQCxLDuu44GRmiv0zG9rrV7BINkrsXdWAUFVwqlB7cny5oaxwsYLW1cfN28FwVt7Rf1LlsmN2U7sDgqccgHtROgJntdM1BrlZ9iLI7xqDvbHl5jOSP7Gscp8t/o1W/HX7NDaKUV1OM7y3ByOalA9q5xuskauvYjIr1nke9MZWkLn3ZVax1BpXT9mbrVr+Czi8vEblj6Adyfahfrnx70+Jnh0awnnxwJpGEQPsME/2oM32o3et3st7eSvLNIxfLE4GTnA9B9hUcQgr96sUkNmk1b4ja7qNzJPA8FhJIMNLAm6Yj/wDV8t+2Kx7iSSVpJZTI7HczsSWY/c9zXdrfac4JrwYn8sj8UdA2WnTuox6bqQFw221m+l2xnZ96Jh0dLm1VYTuduVZRkEHsc0Hwjjggmtn0T1rL04yWl7G9zp+eAP1w/wDb6j7ftWDq+nq/PH7GHSdRMeGT0GDSeny2kIZgEmjGGz51HE9vaalHHI2EU5YjmpDdZaHeWyOmr2YVlGN0oU4+4PIqjudY0CEvO+q2bBRuOJQxPsByaSPHfrix2ske3SN017BHF40du+wLkliBx6n0FBXrjrmbqDUPDh+nT7dv9FB/8jf1n/b969dT/EabXLQ6dZbrfThwwJw83/d6L9v39KykZiRvFkZWk8hngU56PpHj879ibq+qV+Eev2cN128niFQoAxkjOPXinikv9LuPnLTU7i0m7+JbymI/uprpPcswAV1B96r7jgd/EPp5UyFpp7T4o9TwPH8xqA1QRnj+IQpOfw5G8fhq2vTPxj02JHt9Q0s6cJSWMtoS6Kx7nYfqH4J+1B+GDxZGLkRqozgnvXa2jjMpZ+EQZwf5j6VBwn7RJU12R9b6Hrmm6zaCTTLr5qAZCygHD4xnBIGcEgGrTOMV889AdYQ9Ma1BAblFsLhljuQW+lSeBIPupPJ81yKNsHVvTkyKf49pgJ8vmk/5ocdB3s//2Q==",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,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",
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wAARCACAAIADASIAAhEBAxEB/8QAHAAAAAcBAQAAAAAAAAAAAAAAAQIDBAUGBwAI/8QAORAAAQMDAgQEBAQFAwUAAAAAAQIDBAAFERIhBjFBUQcTYYEUInGRMkKhsRUjUnLRJoLBM2JzkvD/xAAZAQACAwEAAAAAAAAAAAAAAAAABQECAwT/xAAfEQACAgIDAQEBAAAAAAAAAAAAAQIRAyEEEjFxQVH/2gAMAwEAAhEDEQA/ANR1ZrqKKGsTQGuzQV1AHZqPvV8t9ggfGXGUhhrOBncqPYAbk/Si369RrBZJNzlE+VHTq0g4KzyCR6k15n4r4vm8R3d2ZIJ+c4ba1kpaT/SnNSiC9X7xwnPKUzaYjURAWR5rv8xSk9Djknv1qpnxN4rVM89N4fzowUJSkJ/9cYqoIivSXQQQD+tWCy2xlUoNuLSScAkHp1odJWCTbol0eJfGLkpcxm4uqWsAqBSkoA/txgCrjwx4zvNLbY4iZRoUd5LScEDuUdfb7VnK7LcbK4paNLjR3wCFAe3fFHLce5RsthLLyeu2SfpUKUZeEuMo6Z6atV5g3uCmZbpbUphZwFtqzv2PUH0NSArzPwfxbO4IuusKL0V1Y+KYAGHAOoPRQ6H2r0ZarpEvNtYnwXfNjvoC0KwRkH0PKgB9XUAoaCDqDFGoMVICFCK4UNQSdRTRqI6dKCRzFAGI+NfEan7rEsrC/kjo853tqVy+w/esgWvW5hAJGfc1avEaV53Hd4BOpfn6CewSkDH6VH2K1CRl9Q2B2FRKSgrZaMHN0h5YrA7M0qOUD0q7W3hRkLSVLJ9B/mi2NlDa0gJGKt8RA6ClObPNvTHWDjwjHaIG58MCRHIQN/2rOrhZJduuISNQSTkHt6GvQNthpckJ1jUKacV8KxZjfnMthLg3042NWwzlDb8K58cZ6Xph0qCZFvLunQ+hOcp2z3BrS/BDiF12DLs0hzUI+HWUkbpSThQ+mcH3NUTiBbljmlkglpWSnI3HQpNOfCyd5HiRGCVENym3G8fVOQPuKZxkpK0KJxcXTPSFdQJOUihqxQGurq6gBEUNAKGgDqRlnTGWdtxjel6j72VqgFhs6VPZRnsMHP6be9AHlziSL5vGd0bWpRUZDi8q5qBOQfcEVMRli3MtsNx3X1gDKW05x71GRESrvxg5Kl7uOJKl7AcsDp9Me1WyRc1QQ2liMpxzlkDYeprmzStpHXhjSbF7HfLel8IkMyYqicfO3tV8husvNJLagoK5K71SLXxCbimbFuFoKRDTqXIQcgJzjVjG+55A5xvjapvhhDrt+MDVjSrA7VxZYV6qGGHJapOyxq4hiWVZ89SlKHNKE5Jo7HGX8beLcGzz1gcy4jSk+9RvGCV2V5JRHStbnypURsT9ajOD+L7vNiTHEWo5jEJKCrC15OMJBGFHmcAjGOdWxp9fCmSS7LZ3F3D7HEMJxxtpbD7ZwUOJwpJ6Z7jpms+8PVNwvEKA2/geQ6vOo8iEkfvW7L8y424OPMKZKxgoXzFYfCtsm2cdvTm0hYVKUghWRjKsEjHPar8addl+GXJx9nGvWek2FBTCDkHKRuOtK00tyEtwkpQcoBOntjO1O6YiwGhotCKAEAaMKIKMKADUzuTiGIa5K/wsJLh9gaeA1G8RtF/hycyk4LjKk59qAPP8NpxHGj3mMloSUrUgY2GoawPtVlt9qalKIcUUqzsQatXEfBki4C1Xa0hrzIzSEvNqVp1oSCQQepAJGPpVZhSQ1L9FdaX5007GnGcWSiYaYEdakrWdPL5tqb8HPf6lDhJOTkkV3EU5aLSUsglS9sjpTHhC4tx72W24zqmhpPmKTsf8e9c1NxbOttKSRqN7gRbvblB/mk/KrqKj7BbfgnfLQVqB2zqyMUtJ+Lnx5Gm3vw1trBSVKGlxPcYO2expa0SFoQCU4I70XvZFLrokbgwhtJ0kAAZNZUm3SC9LnshWFkS2cjfUFElQHbp61fuI7qmFZ5kt4nymWlLXp3OBzxVIsPH0C+8XtwYrS27e8wWkKdAClOc+XQY2xWmKLlO14Y5ZKEKfpp1kkJl2WNIACfNRrIHLJ5/rUhUPw6wYlrEbJKWnFoQSfyg7VMU1E4FDmurqAEBQ0UUagAwNJyGw9HW2oZCwRR6GgBnbcoiBhz8g8s+o6fpWO3GMq23WREWNKmXCn26H7YradIQsrG22/rWdeIcNktsXUAtuuOhhXZQ0kgn12xn/ABWGaPaJ0cefWVf0p10u7kHyw604tK+qU6sCpawcQYYdZ/hrxafASp0IORvntUOo+eAhzfG29TlmgT2GyIklLQO5TzFcD61sa49yt+F4RxJIVECl2mcBp+UoRq1dtjvRrbcf4jGEgNLZ1DJQsYUk9iKUtiJiIyfiSFqxjPSkpS0ML0t/M6vkhPMmsZy/heleiqeKl4agcFSY5WA9OIYQPfKj7AfrWM2CQ63cmnGDpcaWHU+hG/8AxU14mTZM3iyYw+9qRDKWm0DknYE+5J5+gqs2uT8Ml55J2CSM988h/wDdqZ4YdcX0U5p9svw9Z8PSWZ1jiy2VBTb7YcBHXO/75qWztWU+DPEXxFsXaXVEBB8xgk8wfxJ9jv8AQ1qma6E9HNJUw1dQA0NSQNxRqIDRqABzQg0WhzQAVwakEdxVJ8TUpHCzGMAmUnA/2qp9xTx/ZuHID2iXHm3IK8pqE06CpTh5BWPwgdSazfiTie48QJjpmpYaDOT5bGdGo8zvue1ZZWlGjXDFuVkF8S6ycp3T2qw2TiLy21Mltalnlgb1Dx43noIxk4qW4fghMtJcbPPmKWyaoawtPReoN2uEiKlKWC1t+JZ5ewp/DiiMlbi1Fx5f4lq5/SghIbTHGlOPrThax5VcrdnQeefEJCzx9c2k5AW6hee+UCq46gMpSjkArYeoFaP4mwmG+JIE1IAdeQpC/UJ5H9azp3D76xkABR9sinOCfbHH4Js8Os39Lt4dXYwLwpDRyoJD7I7lJ3T7pKh9q9HRpCJMdt5s6kOJCknuDXkzhy6psXEUOXgrZacw4OqhyI+1emeEpjEiyMiO6HWR+BQ5ac7e2K1WmYy2iwg0NAK4GrlBuKMN+VVriHje08NoWZr4QoZCQBqU4oc0oSN1EdTsB1OazG8+NM+WpTdttrDTfRUolwn/AGDCfvmpSsizXbhxRaba4WVSFSZXSNEQX3Se2lOce+KpPFXGdxjMqXcXTw3BIOGtSVznvRKBnR9Ty7VlVw8QuKpjZaXeZEdk82oqUsI+yAKq7qlSHStbhW4o5KlEkn6k1bqRYtcpjbl7kTIhfLKnvNR55BXzz82Ns5q8RXUT4zchs5S4kGqChIT8qhkHarLwhdWLbN+DnHEN5WUuHk2r19D17VhyMfaNr1G/HydZU/GWyElTEtCFJOFGrPFYXGc1aSOuaXRZRKdaAABGClSTmrK5BZRG/mbLSMGk0nY6iuoyYllYSjfen6G1rODyFQjEltm5hZQVpTsEjqannHpKGlOBpttASVFSlYCR1JNZpbLysyDxNdC79GyRpaSQB6ms2SMNqVnKvM1farJx1dTc7yqQ0vW0lWGyBjUP6veoKOwFRWXXFBKFrIJPYDpTvFBwgkxLlmpzdCMgBLukDcjV71pfhVx0q03JFumkqhujAOCS3nr9M/vWZPLDzhUBjc49BS0Ka7DWmUw4tl5pQKVoVhSTnnn61p+GZ7Bhzo09jzokhuQ3/U2oKA+uOVOBua852jxQvUR5CprMO46dvNcb8p/H/lbwo/7s1pVn8XbJOajpkFyK6twNOIe3Lec4WFAAKRkYOQkjI2NWq9mT06MHvt9cv17dnukpQshDTZOQ23n5U/8AJPUkmm5aKFYO1NPg9sa1b0/W5rSMgZxjNbUzOxNSf5eDvmmqkJGNJ0nrTsqODSRbCjneimFiOV9FZpRtRxhYyKOloCjYFFMLRcuDePn+Hy3EmBcq3jZOP+oz/b3Hp9q1qHdIl8h/FQpKJLKvzIO4PYjmD6GvOYG/KncC6zrTKEiDJcjPD8zZxn0I5EfWuPNw1k3HTOzDzHj1LaN2uD0Cyx/jJ77cdoHYqO6j2A5k/Ss44u8Q5N/aMGIlca3ZwUfne/ux0/7fvVSuF4nXWSZE6QuQ8fzrOcegHID0FNkPlvkhOT161ODiLHt7YZ+Y8mlpBJ6VhhTrhyrGw7UwQ/rQwgckf4p+84X29KgB9KaIhJQc6iRnOK6nFs5VKgrTWEZP9RH1oyQPOUnHyqH70voAQUnfJzk86BLek5O/1rNwkaKcRy40pDSlY5EAfan8OL5aVajlWwOfTp+tMDKWQ2ChOEEHHejpmOa1KO+o5+m+avGLS2UlJN6P/9k="
];

function playerPhoto(player) {
  if (!player || player.isGuest || String(player.num || "").toUpperCase() === "G") return null;
  const raw = Number(player.id ?? player.num ?? 0);
  const idx = Number.isFinite(raw) && raw > 0 ? (raw - 1) % PLAYER_PHOTOS.length : Math.abs(String(player.name || "").split("").reduce((a,c)=>a+c.charCodeAt(0),0)) % PLAYER_PHOTOS.length;
  return PLAYER_PHOTOS[idx];
}

function PlayerBubble({ player, pos, size=34, photo=false }) {
  const label = player?.num || (player?.name ? player.name.slice(0,2).toUpperCase() : "?");
  const img = photo ? playerPhoto(player) : null;
  if (img) {
    return (
      <span style={{ width:size, height:size, borderRadius:"50%", backgroundImage:`url(${img})`, backgroundSize:"cover", backgroundPosition:"center", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:11, color:"#fff", flexShrink:0, boxShadow:`0 10px 24px rgba(0,0,0,.32), 0 0 0 2px ${POS_COLOR[pos] || C.border}`, border:"2px solid rgba(255,255,255,.14)", position:"relative" }}>
        <span style={{ position:"absolute", right:-4, bottom:-4, minWidth:18, height:18, padding:"0 4px", borderRadius:999, background:POS_COLOR[pos]||C.blue, border:"2px solid #020617", color:"#fff", fontSize:9, fontWeight:950, display:"flex", alignItems:"center", justifyContent:"center" }}>#{label}</span>
      </span>
    );
  }
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
                <div style={{ fontSize:compact?8:9, color:"#d1fae5", marginTop:3, fontWeight:700, maxWidth:78, whiteSpace:"normal", lineHeight:1.1 }}>{p.name}</div>
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
  const maxMin = gameFullMinutes(game);
  const allPlayers = game?.allPlayers || ROSTER;
  const pName = (id) => {
    const p = allPlayers.find(p => String(p.id) === String(id));
    return p ? p.name : "?";
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
          {events.map((e,i)=>{ const meta=eventMeta(e); return (
            <div key={e.id || i} style={{ display:"flex", alignItems:"center", gap:5, background:"#0a1222", border:`1px solid ${C.border}`, borderRadius:999, padding:"6px 9px", maxWidth:"100%" }}>
              <span style={{ width:16, height:16, borderRadius:"50%", background:meta.bg, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9 }}>{meta.icon}</span>
              <span style={{ fontSize:10, color:C.text, fontWeight:700 }}>{e.minute}'</span>
              <span style={{ fontSize:10, color:C.muted, whiteSpace:"normal", lineHeight:1.2 }}>{meta.label}</span>
            </div>
          );})}
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
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const check=async()=>{
    if(!email.trim() || !password){ setErr("Enter email and password"); return; }
    setBusy(true); setErr("");
    try {
      await loginAdmin(email.trim(), password);
      onAdmin();
    } catch(e) {
      console.error("PitchSide login failed:", e);
      setErr("Login failed. Check the email/password created in Firebase.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, ...T }}>
      <div style={{ fontSize:13, fontWeight:800, color:"#60a5fa", letterSpacing:3, marginBottom:4 }}>PITCHSIDE</div>
      <div style={{ fontSize:24, fontWeight:900, color:"#fff", marginBottom:4 }}>Baltimore Armour</div>
      <div style={{ fontSize:11, color:"#93c5fd", letterSpacing:2, marginBottom:40 }}>ADMIN LOGIN</div>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:28, width:"100%", maxWidth:340, textAlign:"center" }}>
        <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:8 }}>Coach/Admin Login</div>
        <div style={{ fontSize:12, color:C.muted, lineHeight:1.4, marginBottom:16 }}>Use your approved Firebase email/password to unlock editing tools.</div>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()} placeholder="Email" autoComplete="email" style={{ ...inp, marginBottom:10 }}/>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()} placeholder="Password" autoComplete="current-password" style={{ ...inp, marginBottom:10 }}/>
        {err&&<div style={{ color:C.red, fontSize:13, marginBottom:10 }}>{err}</div>}
        <button onClick={check} disabled={busy} style={{ ...btn(busy?C.border:C.blue), width:"100%", padding:16, fontSize:16, marginBottom:10, opacity:busy?0.7:1 }}>{busy?"Signing in…":"Sign In"}</button>
        <button onClick={onViewer} style={{ ...btn("transparent",C.muted), width:"100%", border:`1px solid ${C.border}`, padding:12, fontSize:13, marginBottom:12 }}>Continue View Only</button>
        <div style={{ fontSize:11, color:C.muted, lineHeight:1.4 }}>Viewers can watch live data. Only signed-in admins can edit or save.</div>
      </div>
    </div>
  );
}


// ─── SUB IMPACT ───────────────────────────────────────────────────────
function SubImpact({ game, events }) {
  const [open, setOpen] = useState(false);
  const allPlayers = game?.allPlayers || ROSTER;
  const halfLen = gameHalfMinutes(game);
  const fullLen = gameFullMinutes(game);
  const sorted = [...(events || [])].sort((a,b)=>(Number(a.minute)||0)-(Number(b.minute)||0));
  const subs = sorted.filter(e=>e.type === "sub");
  const goals = sorted.filter(e=>e.type === "goal_for" || e.type === "goal_against");
  const name = id => findPlayer(id, allPlayers)?.name || "?";
  const num = id => findPlayer(id, allPlayers)?.num || "?";

  const nextOffMinute = (playerId, startMinute) => {
    const pid = String(playerId);
    const off = subs.find(s => String(s.playerOff) === pid && (Number(s.minute)||0) > startMinute);
    return off ? Number(off.minute)||startMinute : fullLen;
  };

  const rows = subs.map((s, i) => {
    const start = Math.max(0, Math.min(fullLen, Number(s.minute)||0));
    const end = nextOffMinute(s.playerOn, start);
    const windowGoals = goals.filter(g => {
      const m = Number(g.minute)||0;
      return m >= start && m <= end;
    });
    const gf = windowGoals.filter(g=>g.type === "goal_for").length;
    const ga = windowGoals.filter(g=>g.type === "goal_against").length;
    const net = gf - ga;
    const mins = Math.max(0, end - start);
    const clean = ga === 0;
    const scoredSoon = windowGoals.some(g=>g.type === "goal_for" && (Number(g.minute)||0) - start <= 10);
    const concededSoon = windowGoals.some(g=>g.type === "goal_against" && (Number(g.minute)||0) - start <= 10);
    let label = "No score change";
    let color = C.muted;
    if (net > 0) { label = scoredSoon ? "Positive sub impact" : "Positive sub impact"; color = C.green; }
    else if (net < 0) { label = concededSoon ? "Conceded while on" : "Negative sub impact"; color = C.red; }
    else if (clean && mins >= 10) { label = "Clean sub window"; color = C.blue; }
    return { ...s, start, end, mins, gf, ga, net, clean, label, color, key:s.id || `${s.minute}-${s.playerOn}-${i}` };
  });

  if (!rows.length) return null;

  const totals = rows.reduce((a,r)=>({ gf:a.gf+r.gf, ga:a.ga+r.ga, net:a.net+r.net }), { gf:0, ga:0, net:0 });

  return (
    <div style={{ ...card, border:`1px solid ${C.border2}`, marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, color:C.blue, fontWeight:900, letterSpacing:1.2, textTransform:"uppercase" }}>Sub Impact</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:3, lineHeight:1.35 }}>Team +/- after each player enters until they leave or the match ends.</div>
          <button onClick={()=>setOpen(!open)} style={{ marginTop:8, background:"rgba(56,189,248,0.12)", color:C.blue, border:`1px solid ${C.border2}`, borderRadius:12, padding:"7px 9px", fontSize:10, fontWeight:900, cursor:"pointer" }}>{open ? "Hide formula" : "How calculated"}</button>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:18, fontWeight:900, color:totals.net>0?C.green:totals.net<0?C.red:C.muted }}>{totals.net>0?`+${totals.net}`:totals.net}</div>
          <div style={{ fontSize:9, color:C.muted, fontWeight:800 }}>SUB +/-</div>
        </div>
      </div>
      {open && (
        <div style={{ marginBottom:10, padding:10, borderRadius:14, background:"rgba(2,6,23,0.55)", border:`1px solid ${C.border}`, color:C.text, fontSize:11, lineHeight:1.45 }}>
          Sub Impact = Goals For while the sub is on − Goals Against while the sub is on. It describes the match window after entry, not individual blame or credit.
        </div>
      )}

      {rows.map(r => (
        <div key={r.key} style={{ display:"grid", gridTemplateColumns:"42px 1fr auto", gap:10, alignItems:"center", padding:"11px 0", borderTop:`1px solid ${C.border}` }}>
          <div style={{ fontSize:14, fontWeight:900, color:C.amber }}>{r.start}'</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.text, lineHeight:1.2, whiteSpace:"normal" }}>#{num(r.playerOn)} {name(r.playerOn)} on</div>
            <div style={{ fontSize:11, color:C.muted, lineHeight:1.25, whiteSpace:"normal" }}>#{num(r.playerOff)} {name(r.playerOff)} off · {r.mins}' window</div>
            <div style={{ fontSize:10, color:r.color, fontWeight:800, marginTop:3 }}>{r.label}</div>
          </div>
          <div style={{ textAlign:"right", minWidth:74 }}>
            <div style={{ fontSize:16, fontWeight:900, color:r.net>0?C.green:r.net<0?C.red:C.muted }}>{r.net>0?`+${r.net}`:r.net}</div>
            <div style={{ fontSize:9, color:C.muted, fontWeight:800 }}>GF {r.gf} · GA {r.ga}</div>
          </div>
        </div>
      ))}
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
      <div style={{ background:"radial-gradient(circle at 18% 12%, rgba(56,189,248,0.22), transparent 30%), linear-gradient(135deg,#050b16,#07111f 60%,#020617)", padding:16, borderBottom:`3px solid ${C.blue}` }}>
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
            <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:13, fontWeight:800, color:C.text, whiteSpace:"normal", lineHeight:1.2 }}>#{pNum(ev.playerOn)} {pName(ev.playerOn)} on</div><div style={{ fontSize:11, color:C.muted, whiteSpace:"normal", lineHeight:1.25 }}>#{pNum(ev.playerOff)} {pName(ev.playerOff)} off</div></div>
            {isAdmin&&<span style={{ fontSize:10, color:C.blue }}>edit</span>}
          </div>
        ))}
        <SubImpact game={game} events={events} />
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
              const HALF=gameHalfMinutes(game); let intervals=[], onField=false, entry=0;
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
            return calcPlayerImpactScore([{ ...game, events }], p, gStats[String(p.id)] || {});
          };
          const fmtI = fmtImpactScore;
          const rIds = new Set(ROSTER.map(p=>String(p.id)));
          const eligibleRoster = allPlayers.filter(p=>rIds.has(String(p.id))).map(p => ({ ...p, ...(gStats[String(p.id)] || {}), impact: gameImpact(p) })).filter(p => (gStats[String(p.id)]||{}).mins > 0);
          const eligibleGuests = allPlayers.filter(p=>!rIds.has(String(p.id))).map(p => ({ ...p, ...(gStats[String(p.id)] || {}), impact: gameImpact(p) })).filter(p => (gStats[String(p.id)]||{}).mins > 0);
          const eligible = [...eligibleRoster, ...eligibleGuests];
          const sortedRosterE = eligibleRoster.sort((a, b) => { const d = (b.impact??-999)-(a.impact??-999); return d!==0?d:(b.mins||0)-(a.mins||0); });
          const sortedGuestE = eligibleGuests.sort((a, b) => { const d = (b.impact??-999)-(a.impact??-999); return d!==0?d:(b.mins||0)-(a.mins||0); });
          const gkOpt = sortedRosterE.find(p => p.pos === "GK");
          const outOpt = sortedRosterE.filter(p => p.pos !== "GK").slice(0, 10);
          const optXI = gkOpt ? [gkOpt, ...outOpt] : sortedRosterE.slice(0, 11);
          const optRest = sortedRosterE.filter(p=>!optXI.find(x=>String(x.id)===String(p.id)));
          if (optXI.length === 0) return null;
          return (
            <div style={{ ...card, border: `1px solid ${C.amber}`, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.amber, fontWeight: 800, marginBottom: 8 }}>Best XI · Rostered Players · Impact Score highest first</div>
              {optXI.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < optXI.length-1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 11, color: C.muted, width: 18 }}>{i+1}.</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: C.text, whiteSpace: "normal", lineHeight: 1.18 }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: POS_COLOR[p.pos] || C.muted, fontWeight: 700, marginRight: 4 }}>{p.pos}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: parseFloat(p.net80) >= 0 ? C.green : C.red }}>{p.net80s}</div>
                      <div style={{ fontSize: 8, color: C.muted }}>NET/80</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: p.impact >= 75 ? C.green : p.impact >= 50 ? C.amber : C.red }}>{fmtI(p.impact)}</div>
                      <div style={{ fontSize: 8, color: C.muted }}>IMPACT SCORE</div>
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
                      <span style={{ flex:1, minWidth:0, fontSize:11, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                      <span style={{ fontSize:9, color:POS_COLOR[p.pos]||C.muted, fontWeight:700, marginRight:4 }}>{p.pos}</span>
                      <div style={{ display:"flex", gap:4 }}>
                        <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:7, color:C.muted }}>NET/80</div></div>
                        <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:p.impact>=75?C.green:p.impact>=50?C.amber:C.red }}>{fmtI(p.impact)}</div><div style={{ fontSize:7, color:C.muted }}>IMPACT SCORE</div></div>
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
                      <span style={{ flex: 1, minWidth:0, fontSize: 11, color: "#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 800, color: parseFloat(p.net80) >= 0 ? C.green : C.red }}>{p.net80s}</div><div style={{ fontSize: 8, color: C.muted }}>NET/80</div></div>
                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 800, color: p.impact >= 75 ? C.green : p.impact >= 50 ? C.amber : C.red }}>{fmtI(p.impact)}</div><div style={{ fontSize: 8, color: C.muted }}>IMPACT SCORE</div></div>
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
              <span style={{ flex: 1, minWidth:0, fontWeight: 700, fontSize: 12, color: C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
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


// ─── ADMIN DATA MANAGER ──────────────────────────────────────────────────────
function AdminDataManager({ games, onBack, onOpenGame, onSaveGame, onDeleteGame }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const completed = games.filter(g => g.status === "completed" || (g.status !== "scheduled" && g.scoreFor !== undefined));
  const scheduled = games.filter(g => g.status === "scheduled");
  const issues = games.filter(g => getGameDataIssues(g).length > 0);
  const visible = games
    .filter(g => {
      const q = query.trim().toLowerCase();
      const hay = `${g.opponent || ""} ${g.date || ""} ${g.venue || ""} ${g.type || ""}`.toLowerCase();
      const filterOK = filter === "all" ||
        (filter === "completed" && (g.status === "completed" || (g.status !== "scheduled" && g.scoreFor !== undefined))) ||
        (filter === "scheduled" && g.status === "scheduled") ||
        (filter === "issues" && getGameDataIssues(g).length > 0);
      return filterOK && (!q || hay.includes(q));
    })
    .slice()
    .sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));

  const openEdit = (g) => {
    setMessage("");
    setEditing({
      ...g,
      _scoreFor: Number(g.scoreFor || 0),
      _scoreAgainst: Number(g.scoreAgainst || 0),
      _halfLength: gameHalfMinutes(g),
      _status: g.status || "completed",
      _type: g.type || "regular",
      _venue: g.venue || "Away",
      _veoLink: g.veoLink || "",
      _dateRaw: toDateInputValue(g.date),
    });
  };

  const saveEdit = async (extra={}) => {
    if (!editing) return;
    setSaving(true);
    setMessage("Saving…");
    try {
      const updated = {
        ...editing,
        ...extra,
        opponent: (editing.opponent || "").trim(),
        date: editing._dateRaw ? new Date(editing._dateRaw).toLocaleDateString("en-US") : editing.date,
        type: editing._type,
        venue: editing._venue,
        status: editing._status,
        halfLength: normalizeHalfLength(editing._halfLength, editing._type),
        scoreFor: Number(extra.scoreFor ?? editing._scoreFor ?? 0),
        scoreAgainst: Number(extra.scoreAgainst ?? editing._scoreAgainst ?? 0),
        veoLink: (editing._veoLink || "").trim(),
        updatedAt: new Date().toISOString(),
      };
      delete updated._scoreFor; delete updated._scoreAgainst; delete updated._halfLength;
      delete updated._status; delete updated._type; delete updated._venue; delete updated._veoLink; delete updated._dateRaw;
      await onSaveGame(updated);
      setEditing(updated);
      setMessage("Saved to Firebase.");
    } catch (e) {
      console.error(e);
      setMessage("Save failed. Take a screenshot and send it to me.");
    }
    setSaving(false);
  };

  const rebuildScoreFromEvents = async () => {
    if (!editing) return;
    const scoreFor = (editing.events || []).filter(e => e.type === "goal_for").length;
    const scoreAgainst = (editing.events || []).filter(e => e.type === "goal_against").length;
    setEditing(g => ({ ...g, _scoreFor: scoreFor, _scoreAgainst: scoreAgainst }));
    await saveEdit({ scoreFor, scoreAgainst });
  };

  const cleanGuests = async () => {
    if (!editing) return;
    const { game } = canonicalizeGuestPlayers(editing);
    setEditing(g => ({ ...g, ...game }));
    await onSaveGame({ ...game, updatedAt: new Date().toISOString() });
    setMessage("Guest/player IDs cleaned and saved.");
  };

  const downloadJson = (filename, data) => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setMessage("Export failed. Take a screenshot and send it to me.");
    }
  };

  const exportAllGamesBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`pitchside-games-backup-${stamp}.json`, {
      exportedAt: new Date().toISOString(),
      app: "PitchSide",
      type: "all-games-backup",
      games,
    });
  };

  const exportGameBackup = () => {
    if (!editing) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const safeOpponent = normOpponent(editing.opponent || "game").replace(/\s+/g, "-") || "game";
    downloadJson(`pitchside-${safeOpponent}-${stamp}.json`, {
      exportedAt: new Date().toISOString(),
      app: "PitchSide",
      type: "single-game-backup",
      game: editing,
      integrityReport: getGameIntegrityReport(editing),
    });
  };

  const autoRepairSafeIssues = async () => {
    if (!editing) return;
    if (!window.confirm("Run safe repair on this game? This will clean duplicate guest IDs, normalize match length, and rebuild the score from goal events.")) return;
    setSaving(true);
    setMessage("Running safe repair…");
    try {
      const { game } = canonicalizeGuestPlayers(editing);
      const scoreFor = game.status === "scheduled" ? Number(game.scoreFor || 0) : (game.events || []).filter(e => e.type === "goal_for").length;
      const scoreAgainst = game.status === "scheduled" ? Number(game.scoreAgainst || 0) : (game.events || []).filter(e => e.type === "goal_against").length;
      const repaired = {
        ...game,
        scoreFor,
        scoreAgainst,
        halfLength: normalizeHalfLength(game.halfLength || editing._halfLength, game.type || editing._type),
        updatedAt: new Date().toISOString(),
        integrityRepairAppliedAt: new Date().toISOString(),
      };
      await onSaveGame(repaired);
      setEditing({
        ...repaired,
        _scoreFor: Number(repaired.scoreFor || 0),
        _scoreAgainst: Number(repaired.scoreAgainst || 0),
        _halfLength: gameHalfMinutes(repaired),
        _status: repaired.status || "completed",
        _type: repaired.type || "regular",
        _venue: repaired.venue || "Away",
        _veoLink: repaired.veoLink || "",
        _dateRaw: toDateInputValue(repaired.date),
      });
      setMessage("Safe repair completed and saved.");
    } catch (e) {
      console.error(e);
      setMessage("Safe repair failed. Take a screenshot and send it to me.");
    }
    setSaving(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:84 }}>
      <div style={{ background:"radial-gradient(circle at 18% 12%, rgba(56,189,248,0.22), transparent 30%), linear-gradient(135deg,#050b16,#07111f 60%,#020617)", padding:"20px 16px 16px", borderBottom:`3px solid ${C.amber}` }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:14, fontWeight:800, cursor:"pointer", padding:0, marginBottom:10 }}>{"< Back"}</button>
        <div style={{ fontSize:11, color:C.amber, letterSpacing:2, fontWeight:900, textTransform:"uppercase" }}>Admin</div>
        <div style={{ fontSize:24, fontWeight:900, color:"#fff", marginTop:2 }}>Data Manager</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Fix scores, match length, metadata, guest IDs, and Firebase game records. Phase 2A + 2B adds data integrity checks, event validation, safe repair tools, and JSON backup/export.</div>
      </div>

      <div style={{ padding:16, maxWidth:520, margin:"0 auto" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          {[
            ["Games", games.length, C.blue],
            ["Completed", completed.length, C.green],
            ["Scheduled", scheduled.length, C.purple],
            ["Needs Review", issues.length, issues.length ? C.amber : C.muted],
          ].map(([label,value,color]) => (
            <div key={label} style={{ ...card, marginBottom:0, textAlign:"center", padding:"12px 8px" }}>
              <div style={{ fontSize:22, fontWeight:900, color }}>{value}</div>
              <div style={{ fontSize:9, color:C.muted, fontWeight:800, letterSpacing:1, textTransform:"uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search opponent, date, venue..." style={{ ...inp, marginBottom:10 }} />
        <div style={{ display:"flex", gap:6, marginBottom:12, overflowX:"auto" }}>
          {[["all","All"],["completed","Completed"],["scheduled","Scheduled"],["issues","Review"]].map(([k,l]) => (
            <button key={k} onClick={()=>setFilter(k)} style={{ ...btn(filter===k?C.blue:C.border, filter===k?"#fff":C.muted, { padding:"10px 12px", whiteSpace:"nowrap", fontSize:12 }) }}>{l}</button>
          ))}
        </div>

        <button onClick={exportAllGamesBackup} style={{ ...btn(C.border, "#93c5fd", { width:"100%", marginBottom:12 }) }}>Export All Games Backup</button>

        {visible.length === 0 && <div style={{ ...card, color:C.muted, fontSize:13, textAlign:"center" }}>No games found.</div>}

        {visible.map(g => {
          const ev = g.events || [];
          const report = getGameIntegrityReport(g);
          const gfEvents = report.gfEvents;
          const gaEvents = report.gaEvents;
          const issueList = getGameDataIssues(g);
          const statusColor = g.status === "scheduled" ? C.purple : g.scoreFor > g.scoreAgainst ? C.green : g.scoreFor < g.scoreAgainst ? C.red : C.amber;
          return (
            <div key={g.id || g.opponent} style={{ ...card, border:`1px solid ${issueList.length ? C.amber : C.border}` }}>
              <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:900, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>vs {g.opponent || "Unknown"}</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>{g.date || "No date"} · {g.venue || "Venue?"} · {g.type === "tournament" ? "Cup" : "League"} · {gameHalfMinutes(g)} min halves</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:7 }}>
                    <span style={{ background:statusColor, color:"#fff", borderRadius:999, padding:"3px 8px", fontSize:10, fontWeight:900 }}>{g.status === "scheduled" ? "SCHEDULED" : `${g.scoreFor || 0}-${g.scoreAgainst || 0}`}</span>
                    <span style={{ background:"#0a1222", color:C.muted, border:`1px solid ${C.border}`, borderRadius:999, padding:"3px 8px", fontSize:10, fontWeight:800 }}>{ev.length} events</span>
                    {(gfEvents !== Number(g.scoreFor || 0) || gaEvents !== Number(g.scoreAgainst || 0)) && g.status !== "scheduled" && <span style={{ background:"#422006", color:"#fbbf24", borderRadius:999, padding:"3px 8px", fontSize:10, fontWeight:900 }}>score check</span>}
                    {issueList.slice(0,2).map(x=><span key={x} style={{ background:"#1f2937", color:C.amber, borderRadius:999, padding:"3px 8px", fontSize:10, fontWeight:800 }}>{x}</span>)}
                  </div>
                </div>
                <button onClick={()=>openEdit(g)} style={{ ...btn(C.blue, "#fff", { padding:"10px 12px", fontSize:12 }) }}>Manage</button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title="Manage Game Data" onClose={()=>setEditing(null)}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>Changes here save directly to Firebase. Use this instead of editing Firestore manually.</div>
          {message && <div style={{ background:"#0a1222", border:`1px solid ${message.includes("failed") ? C.red : C.border}`, borderRadius:12, padding:10, color:message.includes("failed") ? "#fca5a5" : C.green, fontSize:12, fontWeight:800, marginBottom:10 }}>{message}</div>}

          <Lbl>Opponent</Lbl>
          <input value={editing.opponent || ""} onChange={e=>setEditing(g=>({...g, opponent:e.target.value}))} style={{ ...inp, marginBottom:10 }} />
          <Lbl>Date</Lbl>
          <input type="date" value={editing._dateRaw || ""} onChange={e=>setEditing(g=>({...g, _dateRaw:e.target.value}))} style={{ ...inp, marginBottom:10 }} />
          <Lbl>Veo Link</Lbl>
          <input value={editing._veoLink || ""} onChange={e=>setEditing(g=>({...g, _veoLink:e.target.value}))} placeholder="Paste Veo or Drive match link here" style={{ ...inp, marginBottom:10 }} />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div><Lbl>Score For</Lbl><input type="number" value={editing._scoreFor ?? 0} onChange={e=>setEditing(g=>({...g, _scoreFor:e.target.value}))} style={{ ...inp, marginBottom:10 }} /></div>
            <div><Lbl>Score Against</Lbl><input type="number" value={editing._scoreAgainst ?? 0} onChange={e=>setEditing(g=>({...g, _scoreAgainst:e.target.value}))} style={{ ...inp, marginBottom:10 }} /></div>
          </div>

          <Lbl>Status</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>{["scheduled","completed","in_progress"].map(s=>(
            <button key={s} onClick={()=>setEditing(g=>({...g,_status:s}))} style={{ ...btn(editing._status===s?C.blue:C.border, editing._status===s?"#fff":C.muted), flex:1, padding:"10px 6px", fontSize:11 }}>{s.replace("_"," ")}</button>
          ))}</div>

          <Lbl>Competition</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>{[["regular","League"],["tournament","Cup"]].map(([k,l])=>(
            <button key={k} onClick={()=>setEditing(g=>({...g,_type:k,_halfLength:normalizeHalfLength(g._halfLength,k)}))} style={{ ...btn(editing._type===k?C.blue:C.border, editing._type===k?"#fff":C.muted), flex:1 }}>{l}</button>
          ))}</div>

          <Lbl>Half Length</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>{[30,35,40].map(m=>(
            <button key={m} onClick={()=>setEditing(g=>({...g,_halfLength:m}))} style={{ ...btn(Number(editing._halfLength)===m?C.blue:C.border, Number(editing._halfLength)===m?"#fff":C.muted), flex:1 }}>{m}</button>
          ))}</div>

          <Lbl>Venue</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>{["Home","Away"].map(v=>(
            <button key={v} onClick={()=>setEditing(g=>({...g,_venue:v}))} style={{ ...btn(editing._venue===v?C.blue:C.border, editing._venue===v?"#fff":C.muted), flex:1 }}>{v}</button>
          ))}</div>

          {(() => {
            const report = getGameIntegrityReport(editing);
            return (
              <div style={{ ...card, background:"#081321", marginBottom:12, border:`1px solid ${report.issues.length ? C.red : report.warnings.length ? C.amber : C.green}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div style={{ fontSize:12, fontWeight:900, color:C.text }}>Data Integrity Checks</div>
                  <div style={{ fontSize:10, fontWeight:900, color:report.issues.length ? C.red : report.warnings.length ? C.amber : C.green }}>{report.issues.length ? "FIX NEEDED" : report.warnings.length ? "REVIEW" : "HEALTHY"}</div>
                </div>
                <div style={{ fontSize:11, color:C.muted }}>Events: {report.eventCount} · Goals from events: {report.gfEvents}-{report.gaEvents} · Max minute: {report.maxMinute}'</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>Players saved: {report.playerCount} · Guest players: {report.guestCount}</div>
                {(report.issues.length > 0 || report.warnings.length > 0) && (
                  <div style={{ marginTop:8 }}>
                    {report.issues.map(x => <div key={x} style={{ fontSize:11, color:"#fca5a5", marginTop:3 }}>● {x}</div>)}
                    {report.warnings.map(x => <div key={x} style={{ fontSize:11, color:"#fbbf24", marginTop:3 }}>● {x}</div>)}
                  </div>
                )}
                {report.suggestions.length > 0 && (
                  <div style={{ marginTop:8, padding:8, borderRadius:10, background:"#0a1222", border:`1px solid ${C.border}` }}>
                    {report.suggestions.map(x => <div key={x} style={{ fontSize:11, color:"#93c5fd", marginTop:3 }}>Suggestion: {x}</div>)}
                  </div>
                )}
              </div>
            );
          })()}

          <button disabled={saving} onClick={()=>saveEdit()} style={{ ...btn(C.green), width:"100%", marginBottom:8 }}>{saving?"Saving…":"Save Game Data"}</button>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <button disabled={saving} onClick={rebuildScoreFromEvents} style={{ ...btn(C.amber, "#111827", { fontSize:12 }) }}>Rebuild Score</button>
            <button disabled={saving} onClick={cleanGuests} style={{ ...btn(C.purple, "#fff", { fontSize:12 }) }}>Clean Guests</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <button disabled={saving} onClick={autoRepairSafeIssues} style={{ ...btn(C.green, "#fff", { fontSize:12 }) }}>Safe Auto Repair</button>
            <button disabled={saving} onClick={exportGameBackup} style={{ ...btn(C.border, "#93c5fd", { fontSize:12 }) }}>Export Game</button>
          </div>
          <button onClick={()=>{ setEditing(null); onOpenGame(editing); }} style={{ ...btn(C.border, "#93c5fd"), width:"100%", marginBottom:8 }}>Open Full Game Editor</button>
          <button onClick={async()=>{ if(window.confirm("Delete this game from Firebase? This cannot be undone. Only delete test/bad records.")){ await onDeleteGame(editing); setEditing(null); } }} style={{ ...btn("#7f1d1d", "#fca5a5"), width:"100%" }}>Delete Game</button>
        </Modal>
      )}
    </div>
  );
}

function toDateInputValue(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function getGameIntegrityReport(g) {
  const events = g.events || [];
  const allPlayers = g.allPlayers || ROSTER;
  const playerIds = new Set(allPlayers.map(p => String(p.id)));
  const rosterIds = new Set(ROSTER.map(p => String(p.id)));
  const issues = [];
  const warnings = [];
  const suggestions = [];

  if (!g.id) issues.push("missing id");
  if (!g.opponent || !String(g.opponent).trim()) issues.push("missing opponent");
  if (!g.date) issues.push("missing date");
  if (![30,35,40].includes(gameHalfMinutes(g))) issues.push("half length");

  const gfEvents = events.filter(e => e.type === "goal_for").length;
  const gaEvents = events.filter(e => e.type === "goal_against").length;
  if (g.status !== "scheduled") {
    if (Number(g.scoreFor || 0) !== gfEvents || Number(g.scoreAgainst || 0) !== gaEvents) {
      issues.push("score mismatch");
      suggestions.push("Use Rebuild Score to match the goal events.");
    }
    if (!(g.starting || []).length && events.length) issues.push("missing lineup");
  }

  const maxMinute = gameTotalMinutes(g);
  events.forEach((e, idx) => {
    const label = `${e.type || "event"} #${idx + 1}`;
    if (!["goal_for","goal_against","sub","half_start","half_end","game_end"].includes(e.type)) warnings.push(`${label}: unknown type`);
    if (e.minute === undefined || e.minute === null || Number.isNaN(Number(e.minute))) issues.push(`${label}: missing minute`);
    else if (Number(e.minute) < 0 || Number(e.minute) > maxMinute + 5) warnings.push(`${label}: minute outside match length`);
    if (e.type === "goal_for" && !e.ownGoal && e.scorer && !playerIds.has(String(e.scorer))) issues.push(`${label}: scorer not in player list`);
    if (e.type === "goal_for" && e.assist && !playerIds.has(String(e.assist))) issues.push(`${label}: assist not in player list`);
    if (e.type === "sub") {
      if (!e.playerOn || !playerIds.has(String(e.playerOn))) issues.push(`${label}: player on not found`);
      if (!e.playerOff || !playerIds.has(String(e.playerOff))) issues.push(`${label}: player off not found`);
      if (String(e.playerOn) === String(e.playerOff)) issues.push(`${label}: same player on/off`);
    }
  });

  const guestNames = new Map();
  (g.guests || []).forEach(p => {
    const key = normName(p.name);
    if (!key) warnings.push("guest missing name");
    if (key && guestNames.has(key)) issues.push("duplicate guest");
    if (key) guestNames.set(key, p);
  });

  const allPlayerNames = new Map();
  allPlayers.forEach(p => {
    const key = normName(p.name);
    if (!key) return;
    if (allPlayerNames.has(key)) warnings.push("duplicate player name");
    allPlayerNames.set(key, p);
    if (!rosterIds.has(String(p.id)) && !String(p.id).startsWith("G_")) warnings.push("guest id format");
  });

  const starting = (g.starting || []).map(String);
  const second = (g.secondHalfStarting || []).map(String);
  if (starting.length > 11) warnings.push("starting XI over 11");
  if (second.length > 11) warnings.push("2nd half XI over 11");
  [...starting, ...second].forEach(id => { if (!playerIds.has(String(id))) issues.push("lineup player not found"); });

  return {
    issues: Array.from(new Set(issues)),
    warnings: Array.from(new Set(warnings)),
    suggestions: Array.from(new Set(suggestions)),
    gfEvents,
    gaEvents,
    eventCount: events.length,
    playerCount: allPlayers.length,
    guestCount: (g.guests || []).length,
    maxMinute,
  };
}

function getGameDataIssues(g) {
  const r = getGameIntegrityReport(g);
  return [...r.issues, ...r.warnings];
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({ games, onStart, onStats, onView, onAdminManager, isAdmin, resumeState, onResume, onDiscardResume, onSchedule, onEditScheduled, onDeleteScheduled }) {
  const [showNew,setShowNew]=useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  const [schedOpp, setSchedOpp] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedType, setSchedType] = useState("regular");
  const [schedVenue, setSchedVenue] = useState("Away");
  const [schedHalfLength, setSchedHalfLength] = useState(defaultHalfLength("regular"));
  const [type,setType]=useState("regular"); const [opp,setOpp]=useState(""); const [customOpp,setCustomOpp]=useState(""); const [venue,setVenue]=useState("Home"); const [halfLengthNew,setHalfLengthNew]=useState(defaultHalfLength("regular"));
  const played=new Set(games.map(g=>g.opponent.toLowerCase().trim()));
  // Match upcoming games - filter out completed/in-progress games
  const completedGamesForSchedule = games.filter(g=>g.status!=="scheduled" && g.status!=="in_progress");
  const hardcodedRemaining = UPCOMING.filter(upg=>{
    return !completedGamesForSchedule.some(g=>sameOpponent(g.opponent, upg.opp));
  });
  // Also include Firebase-scheduled games
  const firebaseScheduled = games.filter(g=>g.status==="scheduled").map(g=>({
    opp:g.opponent, date:g.date, time:g.time||"" , venue:g.venue, type:g.type, id:g.id, halfLength:gameHalfMinutes(g)
  }));
  const remaining = [
    ...hardcodedRemaining,
    ...firebaseScheduled.filter(fs=>!hardcodedRemaining.some(h=>h.opp.toLowerCase()===fs.opp.toLowerCase()))
  ].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const teams=type==="regular"?LEAGUE_TEAMS:TOURNAMENT_TEAMS;
  const go=()=>{ const opponent=opp==="__custom__"?customOpp.trim():opp; if(!opponent)return; onStart({type,opponent,venue,halfLength:normalizeHalfLength(halfLengthNew,type)}); setShowNew(false); };
  const completedGames=games.filter(g=>g.status==="completed"||(g.scoreFor!==undefined&&g.status!=="scheduled"&&g.status!=="in_progress"));
  const record={W:completedGames.filter(g=>g.scoreFor>g.scoreAgainst).length,D:completedGames.filter(g=>g.scoreFor===g.scoreAgainst).length,L:completedGames.filter(g=>g.scoreFor<g.scoreAgainst).length};
  const totalGF=completedGames.reduce((a,g)=>a+g.scoreFor,0), totalGA=completedGames.reduce((a,g)=>a+g.scoreAgainst,0);
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      <div style={{ background:"radial-gradient(circle at 18% 12%, rgba(56,189,248,0.22), transparent 30%), linear-gradient(135deg,#050b16,#07111f 60%,#020617)", padding:"28px 16px 18px", borderBottom:`3px solid ${C.blue}`, textAlign:"center" }}>
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
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{g.date}{g.time?" · "+g.time:""} · {g.venue} · {gameHalfMinutes(g)} min halves</div>
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
                            await onSchedule({ opp:g.opp, date:g.date||"", time:g.time||"", type:g.type, venue:g.venue, id:newId, halfLength:gameHalfMinutes(g) });
                            setEditingGame({ opp:g.opp, date:g.date||"", time:g.time||"", type:g.type, venue:g.venue, id:newId, halfLength:gameHalfMinutes(g), rawDate:"" });
                          }
                        }}
                        style={{ background:"#0f4c81", border:"none", borderRadius:6, padding:"4px 8px", color:"#93c5fd", fontSize:10, fontWeight:700, cursor:"pointer" }}
                      >EDIT</button>
                      <button onClick={()=>onStart({ type:g.type, opponent:g.opp, venue:g.venue, scheduledId:g.id, halfLength:gameHalfMinutes(g) })} style={{ background:C.green, border:"none", borderRadius:6, padding:"4px 8px", color:"#fff", fontSize:10, fontWeight:700, cursor:"pointer" }}>▶ START</button>
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
          {isAdmin&&<button onClick={onAdminManager} style={{ ...btn(C.amber,"#111827"), flex:1 }}>Data Manager</button>}
        </div>
        {!isAdmin&&<div style={{ textAlign:"center", marginTop:12, fontSize:11, color:C.muted }}>View only - data updates live as games are tracked</div>}
      </div>
      {showNew&&(
        <Modal title="New Game" onClose={()=>setShowNew(false)}>
          <Lbl>Type</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>{["regular","tournament"].map(t=><button key={t} onClick={()=>{ setType(t); setOpp(""); setHalfLengthNew(defaultHalfLength(t)); }} style={{ ...btn(type===t?C.blue:C.border,type===t?"#fff":C.muted), flex:1 }}>{t==="regular"?"League":"Cup"}</button>)}</div>
          <Lbl>Half Length</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>{[30,35,40].map(m=><button key={m} onClick={()=>setHalfLengthNew(m)} style={{ ...btn(Number(halfLengthNew)===m?C.blue:C.border,Number(halfLengthNew)===m?"#fff":C.muted), flex:1 }}>{m} min</button>)}</div>
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
              <button key={k} onClick={()=>{ setSchedType(k); setSchedHalfLength(defaultHalfLength(k)); }} style={{ ...btn(schedType===k?C.blue:C.border, schedType===k?"#fff":C.muted), flex:1 }}>{l}</button>
            ))}
          </div>
          <Lbl>Half Length</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>{[30,35,40].map(m=>(
            <button key={m} onClick={()=>setSchedHalfLength(m)} style={{ ...btn(Number(schedHalfLength)===m?C.blue:C.border, Number(schedHalfLength)===m?"#fff":C.muted), flex:1 }}>{m} min</button>
          ))}</div>
          <Lbl>Venue</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {["Home","Away"].map(v=>(
              <button key={v} onClick={()=>setSchedVenue(v)} style={{ ...btn(schedVenue===v?C.blue:C.border, schedVenue===v?"#fff":C.muted), flex:1 }}>{v}</button>
            ))}
          </div>
          <button
            onClick={()=>{
              if(!schedOpp.trim()||!schedDate)return;
              onSchedule({ opp:schedOpp.trim(), date:schedDate, time:schedTime, type:schedType, venue:schedVenue, halfLength:normalizeHalfLength(schedHalfLength,schedType) });
              setSchedOpp(""); setSchedDate(""); setSchedTime(""); setSchedType("regular"); setSchedVenue("Away"); setSchedHalfLength(defaultHalfLength("regular"));
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
              <button key={k} onClick={()=>setEditingGame(g=>({...g,type:k,halfLength:defaultHalfLength(k)}))} style={{ ...btn(editingGame.type===k?C.blue:C.border, editingGame.type===k?"#fff":C.muted), flex:1 }}>{l}</button>
            ))}
          </div>
          <Lbl>Half Length</Lbl>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>{[30,35,40].map(m=>(
            <button key={m} onClick={()=>setEditingGame(g=>({...g,halfLength:m}))} style={{ ...btn(Number(normalizeHalfLength(editingGame.halfLength,editingGame.type))===m?C.blue:C.border, Number(normalizeHalfLength(editingGame.halfLength,editingGame.type))===m?"#fff":C.muted), flex:1 }}>{m} min</button>
          ))}</div>
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
                  halfLength:normalizeHalfLength(editingGame.halfLength,editingGame.type),
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
      <div style={{ background:"radial-gradient(circle at 18% 12%, rgba(56,189,248,0.22), transparent 30%), linear-gradient(135deg,#050b16,#07111f 60%,#020617)", padding:16, borderBottom:`3px solid ${C.blue}` }}>
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
  const halfLength = gameHalfMinutes(gameInfo);
  const gameLength = gameFullMinutes(gameInfo);
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
    halfLength,
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
  const liveGame={ ...gameInfo, halfLength, events,scoreFor:gf,scoreAgainst:ga,date:gameDate.current,secondHalfStarting:(half===2||htMode)?[...onField]:gameInfo.secondHalfStarting,formation1H:gameInfo.formation1H||"4-3-3",formation2H,id:gameId.current };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      <div style={{ background:"radial-gradient(circle at 18% 12%, rgba(56,189,248,0.22), transparent 30%), linear-gradient(135deg,#050b16,#07111f 60%,#020617)", padding:"12px 16px", borderBottom:`3px solid ${C.blue}` }}>
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
              <span style={{ flex:1, minWidth:0, fontWeight:700, fontSize:12, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
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
            <span style={{ flex:1, minWidth:0, fontSize:12, fontWeight:800, color:C.text, whiteSpace:"normal", lineHeight:1.18 }}>{p.name}</span>
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
  const [sortBy, setSortBy]   = useState("impact");
  const [sortDir, setSortDir] = useState(-1);
  const [scout, setScout]     = useState(null);
  const [scoutOptSort, setScoutOptSort] = useState("impact");
  const [formulaOpen, setFormulaOpen] = useState(false);

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
      const HALF = gameHalfMinutes(game);
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

  const calcImpact = (p) => calcPlayerImpactScore(filteredGames, p, allSt[String(p.id)] || {});
  const fmtImpact = fmtImpactScore;

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

  const metricCopy = {
    impact: {
      title:"Impact Score",
      short:"Impact combines team impact, production, reliability, and defensive stability.",
      detail:"Built from Net/80 influence, goals and assists, minutes reliability, and defensive stability. It rewards overall match influence, not just scoring."
    },
    net80: {
      title:"Net/80",
      short:"Net/80 shows team goal difference while the player is on the field, normalized to 80 minutes.",
      detail:"Formula: (Goals For While On − Goals Against While On) ÷ Minutes Played × 80. This shows on-field team differential, not individual blame."
    },
    goals: {
      title:"Goals",
      short:"Total goals scored by the player in the selected games.",
      detail:"Only goals logged in completed games are counted. Own goals are excluded from player scoring."
    },
    assists: {
      title:"Assists",
      short:"Total assists logged for the player in the selected games.",
      detail:"Assists come from goal events where an assisting player was selected."
    },
    gf: {
      title:"GF While On",
      short:"Goals scored by the team while the player was on the field.",
      detail:"This is an on-field team stat. It reflects team scoring during the player’s minutes."
    },
    ga: {
      title:"GA While On",
      short:"Goals conceded by the team while the player was on the field.",
      detail:"This is an on-field team stat. It reflects goals conceded during the player’s minutes."
    }
  };
  const MetricExplainer = () => {
    const m = metricCopy[sortBy] || metricCopy.impact;
    return (
      <div style={{ ...card, padding:12, marginBottom:12, border:`1px solid ${C.border2}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"flex-start" }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:11, color:C.blue, fontWeight:900, letterSpacing:1, textTransform:"uppercase" }}>{m.title}</div>
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.35, marginTop:4 }}>{m.short}</div>
          </div>
          <button onClick={()=>setFormulaOpen(!formulaOpen)} style={{ background:"rgba(56,189,248,0.12)", color:C.blue, border:`1px solid ${C.border2}`, borderRadius:12, padding:"7px 9px", fontSize:10, fontWeight:900, cursor:"pointer", flexShrink:0 }}>
            {formulaOpen ? "Hide" : "Formula"}
          </button>
        </div>
        {formulaOpen && (
          <div style={{ marginTop:10, padding:10, borderRadius:14, background:"rgba(2,6,23,0.55)", border:`1px solid ${C.border}`, color:C.text, fontSize:11, lineHeight:1.45 }}>
            {m.detail}
          </div>
        )}
      </div>
    );
  };

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


  const calcSubImpactRowsForGame = (game) => {
    const allPlayers = game?.allPlayers || ROSTER;
    const halfLen = gameHalfMinutes(game);
    const fullLen = gameFullMinutes(game);
    const evs = [...(game?.events || [])].sort((a,b)=>(Number(a.minute)||0)-(Number(b.minute)||0));
    const subs = evs.filter(e=>e.type === "sub");
    const goals = evs.filter(e=>e.type === "goal_for" || e.type === "goal_against");

    const nextOffMinute = (playerId, startMinute) => {
      const pid = String(playerId);
      const off = subs.find(s => String(s.playerOff) === pid && (Number(s.minute)||0) > startMinute);
      return off ? Number(off.minute)||startMinute : fullLen;
    };

    return subs.map((s, i) => {
      const start = Math.max(0, Math.min(fullLen, Number(s.minute)||0));
      const end = nextOffMinute(s.playerOn, start);
      const windowGoals = goals.filter(g => {
        const m = Number(g.minute)||0;
        return m >= start && m <= end;
      });
      const gf = windowGoals.filter(g=>g.type === "goal_for").length;
      const ga = windowGoals.filter(g=>g.type === "goal_against").length;
      const net = gf - ga;
      const mins = Math.max(0, end - start);
      const p = findPlayer(s.playerOn, allPlayers) || {};
      return { playerId:String(s.playerOn), player:p, gf, ga, net, mins, app:1 };
    });
  };

  const subImpactSummary = (() => {
    const map = {};
    filteredGames.forEach(g => {
      calcSubImpactRowsForGame(g).forEach(r => {
        const k = String(r.playerId);
        if (!map[k]) map[k] = { ...r, gf:0, ga:0, net:0, mins:0, app:0 };
        map[k].gf += r.gf;
        map[k].ga += r.ga;
        map[k].net += r.net;
        map[k].mins += r.mins;
        map[k].app += 1;
      });
    });
    return Object.values(map).sort((a,b)=>(b.net-a.net) || (b.app-a.app) || (b.mins-a.mins));
  })();

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
        <Lbl>Sub Impact Overview</Lbl>
        <div style={{ color:C.muted, fontSize:11, lineHeight:1.35, marginBottom:10 }}>Overall team +/- after players enter as substitutes. This tracks match windows, not individual blame or credit.</div>
        {subImpactSummary.length===0&&<div style={{ color:C.muted, fontSize:13 }}>No substitutions logged yet</div>}
        {subImpactSummary.slice(0,8).map((r,i)=> {
          const p = r.player || {};
          const pos = p.pos || "MID";
          const netColor = r.net>0?C.green:r.net<0?C.red:C.muted;
          const avg = r.app ? (r.net / r.app) : 0;
          return (
            <div key={r.playerId} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:10, alignItems:"center", padding:"9px 0", borderTop:i?`1px solid ${C.border}`:"none" }}>
              <PlayerBubble player={p} pos={pos} size={38} photo />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:900, color:C.text, lineHeight:1.15, whiteSpace:"normal" }}>{p.name || "Unknown"}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{r.app} sub app{r.app===1?"":"s"} · {r.mins}' mins · GF {r.gf} / GA {r.ga}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:20, fontWeight:950, color:netColor }}>{r.net>0?`+${r.net}`:r.net}</div>
                <div style={{ fontSize:9, color:C.muted, fontWeight:800 }}>AVG {avg>0?`+${avg.toFixed(2)}`:avg.toFixed(2)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={card}>
        <Lbl>Top Scorers</Lbl>
        {topG.length===0&&<div style={{ color:C.muted, fontSize:13 }}>No goals yet</div>}
        {topG.slice(0,8).map((p,i)=>(
          <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:i<Math.min(7,topG.length-1)?`1px solid ${C.border}`:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:13, color:C.muted, fontWeight:800, width:18 }}>{i+1}</span><span style={{ fontWeight:800, fontSize:12, color:C.text }}>{p.name}</span></div>
            <span style={{ fontSize:22, fontWeight:900, color:"#60a5fa" }}>{p.goals}</span>
          </div>
        ))}
      </div>
      <div style={card}>
        <Lbl>Top Assists</Lbl>
        {topA.length===0&&<div style={{ color:C.muted, fontSize:13 }}>No assists yet</div>}
        {topA.slice(0,8).map((p,i)=>(
          <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:i<Math.min(7,topA.length-1)?`1px solid ${C.border}`:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:13, color:C.muted, fontWeight:800, width:18 }}>{i+1}</span><span style={{ fontWeight:800, fontSize:12, color:C.text }}>{p.name}</span></div>
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
        {sb("impact","Impact")}{sb("net80","Net")}{sb("goals","Goals")}{sb("assists","Asst")}{sb("gf","GF")}{sb("ga","GA")}
      </div>
      <MetricExplainer />
      {pList.map((p, idx)=>{
        const s=allSt[String(p.id)]||{};
        const impact=calcImpact(p);
        const ic=impact===null?"#94a3b8":impact>=75?C.green:impact>=50?C.amber:C.red;
        const netVal=parseFloat(s.net80);
        const netColor=netVal>0?C.green:netVal<0?C.red:"#94a3b8";
        const isFirstGuest = !rIds.has(String(p.id)) && (idx===0 || rIds.has(String(pList[idx-1]?.id)));
        return <div key={p.id}>
        {isFirstGuest && guestList.length>0 && <div style={{ fontSize:11, fontWeight:800, color:C.muted, letterSpacing:1, marginTop:12, marginBottom:6 }}>GUEST PLAYERS</div>}
        <div style={{ ...card, border:`1px solid ${C.border}`, opacity: rIds.has(String(p.id))?1:0.78, padding:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <PlayerBubble player={p} pos={p.pos} size={56} photo />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:900, fontSize:14, color:C.text, whiteSpace:"normal", lineHeight:1.15 }}>{p.name}</div>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:5, flexWrap:"wrap" }}>
                <span style={{ fontSize:10, color:C.text, background:"rgba(255,255,255,.08)", border:`1px solid ${C.border}`, borderRadius:999, padding:"3px 7px", fontWeight:900 }}>#{p.num}</span>
                <span style={{ fontSize:10, color:POS_COLOR[p.pos]||C.muted, fontWeight:900 }}>{p.pos}</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, flex:1.25 }}>
              <div style={{ flex:1, background:"linear-gradient(180deg,#0d2137,#081321)", border:`1px solid ${C.border}`, borderRadius:14, padding:"9px 8px", textAlign:"center" }}>
                <div style={{ fontSize:28, lineHeight:1, fontWeight:950, color:netColor }}>{s.net80s||"-"}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:5, fontWeight:800, letterSpacing:.5 }}>NET/80</div>
              </div>
              <div style={{ flex:1, background:"linear-gradient(180deg,#0d2137,#081321)", border:`1px solid ${C.border}`, borderRadius:14, padding:"9px 8px", textAlign:"center" }}>
                <div style={{ fontSize:28, lineHeight:1, fontWeight:950, color:ic }}>{fmtImpact(impact)}</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:5, fontWeight:800, letterSpacing:.5 }}>IMPACT SCORE</div>
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

  const [optimumSort, setOptimumSort] = useState("impact");
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
          <button onClick={()=>setOptimumSort("impact")} style={{ flex:1, padding:"8px 4px", borderRadius:12, border:"none", fontWeight:700, fontSize:11, cursor:"pointer", background:optimumSort==="impact"?C.amber:C.border, color:optimumSort==="impact"?"#000":C.muted }}>Impact Score ▼</button>
        </div>
        <div style={{ fontSize:10, color:C.muted }}>1 GK guaranteed · tiebreak by minutes</div>
      </div>
      {["GK","DEF","MID","FWD"].map(pos=>byPos[pos].length>0&&<div key={pos} style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:800, color:POS_COLOR[pos], letterSpacing:1, marginBottom:6 }}>{pos}</div>
        {byPos[pos].map(p=><div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, ...card, border:`1px solid ${C.border}`, marginBottom:5 }}>
          <span style={{ width:28, height:28, borderRadius:"50%", background:POS_COLOR[pos], display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:11, color:"#fff", flexShrink:0 }}>{p.num}</span>
          <div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:12, color:C.text }}>{p.name}</div><div style={{ fontSize:10, color:C.muted }}>{p.played} games · {p.mins} mins</div></div>
          <div style={{ display:"flex", gap:6 }}>
            <div style={{ textAlign:"right" }}><div style={{ fontSize:14, fontWeight:900, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:8, color:C.muted }}>NET/80</div></div>
            <div style={{ textAlign:"right" }}><div style={{ fontSize:14, fontWeight:900, color:p.impact>=75?C.green:p.impact>=50?C.amber:C.red }}>{fmtImpact(p.impact)}</div><div style={{ fontSize:8, color:C.muted }}>IMPACT SCORE</div></div>
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
            <button onClick={()=>setScoutOptSort("impact")} style={{ flex:1, padding:"7px 4px", borderRadius:12, border:"none", fontWeight:700, fontSize:10, cursor:"pointer", background:scoutOptSort==="impact"?C.amber:C.border, color:scoutOptSort==="impact"?"#000":C.muted }}>Impact Score ▼</button>
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
                  const HALF=gameHalfMinutes(game); let ivs=[],on=false,en=0;
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
              return calcPlayerImpactScore(og, p, s);
            };
            const fmtSI = fmtImpactScore;
            const scRosterIds = new Set(ROSTER.map(p=>String(p.id)));
            const optFull = allP.map(p=>({...p,...(ss[String(p.id)]||{}),impact:scImpact(p)})).filter(p=>(ss[String(p.id)]||{}).mins>0&&scRosterIds.has(String(p.id)));
            const sortedFull = [...optFull].sort((a,b)=>{ const av=(scoutOptSort||"net80")==="impact"?(a.impact??-999):(a.net80||0); const bv=(scoutOptSort||"net80")==="impact"?(b.impact??-999):(b.net80||0); const d=bv-av; return d!==0?d:(b.mins||0)-(a.mins||0); });
            const sGK=sortedFull.find(p=>p.pos==="GK");
            const sOut=sortedFull.filter(p=>p.pos!=="GK").slice(0,10);
            const sXI=sGK?[sGK,...sOut]:sortedFull.slice(0,11);
            return sXI.map((p,i)=>(
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:i<sXI.length-1?`1px solid ${C.border}`:"none" }}>
                <span style={{ fontSize:12, color:C.muted, width:18 }}>{i+1}.</span>
                <span style={{ flex:1, minWidth:0, fontSize:12, fontWeight:800, color:C.text, whiteSpace:"normal", lineHeight:1.18 }}>{p.name}</span>
                <span style={{ fontSize:10, color:POS_COLOR[p.pos]||C.muted, fontWeight:700, marginRight:4 }}>{p.pos}</span>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:12, fontWeight:800, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:8, color:C.muted }}>NET/80</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:12, fontWeight:800, color:p.impact>=75?C.green:p.impact>=50?C.amber:C.red }}>{fmtSI(p.impact)}</div><div style={{ fontSize:8, color:C.muted }}>IMPACT SCORE</div></div>
                </div>
              </div>
            ));
          })()}
          {(() => {
            // Show players who didn't make XI
            const scRosterIds2 = new Set(ROSTER.map(p=>String(p.id)));
            const scImpact2 = (p) => calcPlayerImpactScore(og, p, ss[String(p.id)] || {});
            const fmtSI2 = fmtImpactScore;
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
                    <span style={{ flex:1, minWidth:0, fontSize:11, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                    <span style={{ fontSize:9, color:POS_COLOR[p.pos]||C.muted, fontWeight:700, marginRight:4 }}>{p.pos}</span>
                    <div style={{ display:"flex", gap:4 }}>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:parseFloat(p.net80)>=0?C.green:C.red }}>{p.net80s}</div><div style={{ fontSize:7, color:C.muted }}>NET/80</div></div>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:800, color:p.impact>=75?C.green:p.impact>=50?C.amber:C.red }}>{fmtSI2(p.impact)}</div><div style={{ fontSize:7, color:C.muted }}>IMPACT SCORE</div></div>
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
      <div style={{ background:"radial-gradient(circle at 18% 12%, rgba(56,189,248,0.22), transparent 30%), linear-gradient(135deg,#050b16,#07111f 60%,#020617)", padding:16, borderBottom:`3px solid ${C.blue}`, display:"flex", alignItems:"center", gap:12 }}>
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
  const playerList=allP.map(p=>({...p,...(allSt[String(p.id)]||{}),impact:calcPlayerImpactScore(games, p, allSt[String(p.id)]||{})})).filter(p=>p.played>0).sort((a,b)=>(b.impact??-999)-(a.impact??-999));
  const metricColor = v => parseFloat(v)>0 ? C.green : parseFloat(v)<0 ? C.red : "#94a3b8";
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, ...T, paddingBottom:80 }}>
      <div style={{ background:"radial-gradient(circle at 18% 12%, rgba(56,189,248,0.22), transparent 30%), linear-gradient(135deg,#050b16,#07111f 60%,#020617)", padding:16, borderBottom:`3px solid ${C.blue}` }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#60a5fa", fontSize:13, fontWeight:800, cursor:"pointer", padding:0, marginBottom:8 }}>{"< Back"}</button>
        <div style={{ fontSize:13, fontWeight:800, color:"#60a5fa", letterSpacing:3, marginBottom:4 }}>PITCHSIDE</div>
        <div style={{ fontSize:22, fontWeight:950, color:"#fff" }}>Player Cards</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{playerList.length} players with match data · sorted by Impact Score</div>
      </div>
      <div style={{ padding:14, maxWidth:480, margin:"0 auto" }}>
        {playerList.map((p,i)=>{ const s={...(allSt[String(p.id)]||{}), impact:p.impact}; return(
          <div key={p.id} onClick={()=>setSelected(p)} style={{ background:"linear-gradient(135deg,#0f1b2d,#0a1322)", border:`1px solid ${C.border}`, borderRadius:18, padding:14, marginBottom:10, cursor:"pointer", boxShadow:"0 10px 24px rgba(0,0,0,.18)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <PlayerBubble player={p} pos={p.pos} size={56} photo />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ fontWeight:900, fontSize:15, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span><span style={{ background:POS_COLOR[p.pos]||C.border, color:"#fff", borderRadius:999, padding:"2px 7px", fontSize:9, fontWeight:900 }}>{p.pos}</span></div>
                <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{s.played} games · {s.mins}' total · {s.avgMins||0}' avg</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:28, fontWeight:950, color:s.impact>=75?C.green:s.impact>=50?C.amber:C.red, lineHeight:1 }}>{fmtImpactScore(s.impact)}</div>
                <div style={{ fontSize:9, color:C.muted, fontWeight:800 }}>IMPACT SCORE</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:14 }}>
              {[["Impact Score", fmtImpactScore(s.impact), s.impact>=75?C.green:s.impact>=50?C.amber:C.red],["Goals", s.goals||0, "#60a5fa"],["Assists", s.assists||0, C.green],["Mins", s.mins||0, "#cbd5e1"]].map(([l,v,c])=>(
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
          {(() => { const s={...(allSt[String(selected.id)]||{}), impact:calcPlayerImpactScore(games, selected, allSt[String(selected.id)]||{})}; return <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <PlayerBubble player={selected} pos={selected.pos} size={54} />
              <div><div style={{ fontSize:18, fontWeight:950, color:"#fff" }}>{selected.name}</div><div style={{ fontSize:11, color:POS_COLOR[selected.pos]||C.muted, fontWeight:800 }}>{selected.pos} · #{selected.num}</div></div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              {[["Net/80", s.net80s||"-", metricColor(s.net80)],["Impact Score", fmtImpactScore(s.impact), s.impact>=75?C.green:s.impact>=50?C.amber:C.red],["Total Minutes", (s.mins||0)+"'", "#cbd5e1"],["Avg Minutes", (s.avgMins||0)+"'", "#94a3b8"],["Goals", s.goals||0, "#60a5fa"],["Assists", s.assists||0, C.green]].map(([l,v,c])=>(
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
  const [authUser,setAuthUser]   = useState(null);
  const [authReady,setAuthReady] = useState(false);
  const [isAdmin,setIsAdmin]     = useState(false);
  const [showPin,setShowPin]     = useState(false);
  const [prevScreen,setPrevScreen]=useState("home");
  const [statsTab,setStatsTab]   = useState("overview");
  // Resume state loaded from localStorage
  const [resumeState,setResumeState] = useState(()=>loadGameState());
  const seeded = useRef(false);

  useEffect(()=>{
    const unsub = onAuthChange(user => {
      setAuthUser(user || null);
      setIsAdmin(!!user);
      setAuthReady(true);
      if (!user) localStorage.removeItem("ps_admin");
      else localStorage.setItem("ps_admin", "1");
    });
    return () => { if (typeof unsub === "function") unsub(); };
  },[]);

  useEffect(()=>{
    if (!authReady) return;
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
  },[authReady, authUser]);

  const updateGame=async g=>{ setViewing(g); setGames(prev=>prev.map(x=>x.id===g.id?g:x)); await saveGame(g); };
  const handleDelete=async g=>{ if(window.confirm("Delete "+g.opponent+"? This cannot be undone.")){ await deleteGame(g.id);setGames(prev=>prev.filter(x=>x.id!==g.id));setViewing(null); } };
  const handleEnd=async g=>{ clearGameState();setResumeState(null);await saveGame(g);setScreen("stats"); };
  const handleSchedule=async({opp,date,time,type,venue,id,halfLength})=>{
    const scheduled={
      id: id || "scheduled-"+Date.now(),
      opponent:opp,
      date: date ? (date.includes("/") ? date : new Date(date).toLocaleDateString("en-US")) : "",
      time: time || "",
      type, venue,
      halfLength: normalizeHalfLength(halfLength,type),
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
        type:g.type, venue:g.venue, halfLength: normalizeHalfLength(g.halfLength,g.type), status:"scheduled",
        scoreFor:0, scoreAgainst:0,
        events:existing.events||[], starting:existing.starting||[], allPlayers:existing.allPlayers||ROSTER,
      });
    } else {
      await saveGame({
        id:"scheduled-"+Date.now(),
        opponent:g.opp, date:g.date, time:g.time||"",
        type:g.type, venue:g.venue, halfLength: normalizeHalfLength(g.halfLength,g.type), status:"scheduled",
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

  if(loading || !authReady)return(
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, ...T }}>
      <div style={{ fontSize:28, fontWeight:900, color:"#60a5fa", letterSpacing:2 }}>PitchSide</div>
      <div style={{ fontSize:11, color:"#93c5fd", letterSpacing:2 }}>Baltimore Armour 11G Aspire</div>
      <div style={{ marginTop:20, width:36, height:36, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.blue}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );


  if(viewing)return <GameDetail game={viewing} onClose={()=>setViewing(null)} onUpdate={updateGame} onDelete={handleDelete} isAdmin={isAdmin}/>;
  if(screen==="admin_manager")return <AdminDataManager games={games} onBack={()=>setScreen("home")} onOpenGame={g=>{ setViewing(g); setPrevScreen("admin_manager"); }} onSaveGame={updateGame} onDeleteGame={handleDelete}/>;
  if(showPin)return <PinScreen onAdmin={()=>setShowPin(false)} onViewer={()=>setShowPin(false)}/>;

  return (
    <>
      {screen==="home" && (
        <Home
          games={games}
          onStart={i=>{ if(!isAdmin){setShowPin(true);return;} setGameInfo(i);setScreen("lineup"); if(i.scheduledId){deleteGame(i.scheduledId).catch(()=>{}); }}}
          onStats={()=>setScreen("stats_view")}
          onAdminManager={()=>setScreen("admin_manager")}
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
            <button onClick={()=>{ logoutAdmin().catch(e=>console.error("Logout failed", e)); }} style={{ flex:1, padding:"10px 0 8px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderTop:"2px solid transparent" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f87171"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
              <span style={{ fontSize:9, color:"#f87171" }}>Logout</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
