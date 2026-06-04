from pathlib import Path
import re

p = Path('armour-v2/src/App.js')
text = p.read_text()

text = text.replace('AVATAR SUB IMPACT OVERVIEW INCLUDED', 'AVATAR SUB IS OVERVIEW INCLUDED')
text = text.replace('season-level Sub Impact overview', 'season-level Sub IS overview')
text = text.replace('Sub Impact include short explanation + expandable formula/details', 'Sub IS includes short explanation + expandable formula/details')
text = text.replace('SUB IMPACT FINAL INCLUDED', 'SUB IS FINAL INCLUDED')
text = text.replace('Individual sub impact rows plus game-level Sub +/- summary', 'Individual Sub IS rows plus game-level Sub IS summary')

marker = 'function fmtImpactScore(v) { return v === null || v === undefined ? "-" : String(Math.round(v)); }'
helpers = r'''
function fmtSigned(v, digits=0) {
  const n = Number(v || 0);
  const shown = digits ? n.toFixed(digits) : String(Math.round(n));
  return n > 0 ? `+${shown}` : shown;
}
function scoreColor(v) {
  const n = Number(v || 0);
  return n >= 80 ? C.green : n >= 65 ? C.amber : n >= 50 ? C.blue : C.red;
}
function subISTier(row) {
  if (!row || row.apps < 2) return "Limited Sample";
  if (row.leadProtectPct >= 75 && row.gaAfter <= 1) return "Closer";
  if (row.subIS >= 82 && row.avgSwing >= 0.35) return "Game Changer";
  if (row.gaPerApp <= 0.25 && row.apps >= 3) return "Stabilizer";
  if (row.immediateNet > 0) return "Spark";
  return "Neutral";
}
function scoreStateAt(game, minute) {
  let gf = 0, ga = 0;
  (game?.events || []).forEach(e => {
    const m = Number(e.minute) || 0;
    if (m < minute) {
      if (e.type === "goal_for") gf += 1;
      if (e.type === "goal_against") ga += 1;
    }
  });
  return { gf, ga, diff: gf - ga };
}
function calcSubISRowsForGame(game, providedEvents) {
  const allPlayers = game?.allPlayers || ROSTER;
  const fullLen = gameFullMinutes(game);
  const evs = [...(providedEvents || game?.events || [])].sort((a,b)=>(Number(a.minute)||0)-(Number(b.minute)||0));
  const subs = evs.filter(e=>e.type === "sub" && e.playerOn);
  const goals = evs.filter(e=>e.type === "goal_for" || e.type === "goal_against");
  const nextOffMinute = (playerId, startMinute) => {
    const pid = String(playerId);
    const off = subs.find(s => String(s.playerOff) === pid && (Number(s.minute)||0) > startMinute);
    return off ? Number(off.minute)||startMinute : fullLen;
  };
  return subs.map((s, i) => {
    const start = Math.max(0, Math.min(fullLen, Number(s.minute)||0));
    const end = Math.max(start, nextOffMinute(s.playerOn, start));
    const windowGoals = goals.filter(g => { const m = Number(g.minute)||0; return m >= start && m <= end; });
    const immediateGoals = goals.filter(g => { const m = Number(g.minute)||0; return m >= start && m <= Math.min(fullLen, start + 15); });
    const gfAfter = windowGoals.filter(g=>g.type === "goal_for").length;
    const gaAfter = windowGoals.filter(g=>g.type === "goal_against").length;
    const gf15 = immediateGoals.filter(g=>g.type === "goal_for").length;
    const ga15 = immediateGoals.filter(g=>g.type === "goal_against").length;
    const state = scoreStateAt({...game, events: evs}, start);
    const wasWinning = state.diff > 0;
    const wasDrawing = state.diff === 0;
    const wasLosing = state.diff < 0;
    const mins = Math.max(0, end - start);
    const netAfter = gfAfter - gaAfter;
    const net15 = gf15 - ga15;
    const player = findPlayer(s.playerOn, allPlayers) || {};
    const contextBonus = wasLosing && netAfter > 0 ? 8 : wasDrawing && netAfter > 0 ? 6 : wasWinning && gaAfter === 0 && mins >= 10 ? 7 : 0;
    const scoreSwingScore = clamp(50 + netAfter * 16, 20, 95);
    const immediateScore = clamp(50 + net15 * 18, 20, 95);
    const protectionScore = wasWinning ? (gaAfter === 0 ? 85 : Math.max(35, 70 - gaAfter * 18)) : 55;
    const subIS = Math.round(clamp((scoreSwingScore * 0.45) + (immediateScore * 0.25) + (protectionScore * 0.15) + (50 + contextBonus) * 0.15, 25, 99));
    return { key:s.id || `${s.minute}-${s.playerOn}-${i}`, playerId:String(s.playerOn), player, sub:s, start, end, mins, gfAfter, gaAfter, netAfter, gf15, ga15, net15, wasWinning, wasDrawing, wasLosing, leadProtected:wasWinning && gaAfter === 0, positiveSwing:netAfter>0, neutralSwing:netAfter===0, negativeSwing:netAfter<0, scoreBefore:`${state.gf}-${state.ga}`, subIS };
  });
}
function summarizeSubIS(games) {
  const map = {};
  (games || []).filter(g => g && g.status !== "scheduled").forEach(game => {
    calcSubISRowsForGame(game).forEach(r => {
      const k = String(r.playerId);
      if (!map[k]) map[k] = { playerId:k, player:r.player, apps:0, mins:0, gfAfter:0, gaAfter:0, netAfter:0, gf15:0, ga15:0, immediateNet:0, positive:0, neutral:0, negative:0, leads:0, leadsProtected:0, totalScore:0 };
      map[k].apps += 1; map[k].mins += r.mins; map[k].gfAfter += r.gfAfter; map[k].gaAfter += r.gaAfter; map[k].netAfter += r.netAfter; map[k].gf15 += r.gf15; map[k].ga15 += r.ga15; map[k].immediateNet += r.net15;
      if (r.positiveSwing) map[k].positive += 1; else if (r.negativeSwing) map[k].negative += 1; else map[k].neutral += 1;
      if (r.wasWinning) { map[k].leads += 1; if (r.leadProtected) map[k].leadsProtected += 1; }
      map[k].totalScore += r.subIS;
    });
  });
  return Object.values(map).map(r => {
    const avgSwing = r.apps ? r.netAfter / r.apps : 0;
    const positivePct = r.apps ? Math.round((r.positive / r.apps) * 100) : 0;
    const leadProtectPct = r.leads ? Math.round((r.leadsProtected / r.leads) * 100) : 0;
    const gaPerApp = r.apps ? r.gaAfter / r.apps : 0;
    const raw = r.apps ? r.totalScore / r.apps : 0;
    const consistency = r.apps >= 5 ? 6 : r.apps >= 3 ? 3 : r.apps === 1 ? -8 : 0;
    const subIS = Math.round(clamp(raw + consistency, 25, 99));
    const row = { ...r, avgSwing, positivePct, leadProtectPct, gaPerApp, subIS };
    return { ...row, tier: subISTier(row) };
  }).sort((a,b)=>(b.subIS-a.subIS) || (b.netAfter-a.netAfter) || (b.apps-a.apps));
}
'''
if 'function summarizeSubIS(games)' not in text:
    text = text.replace(marker, marker + helpers)

# Upgrade game detail Sub Impact component to Sub IS.
sub_component = r'''
// ─── SUB IS ───────────────────────────────────────────────────────────
function SubImpact({ game, events }) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState("subIS");
  const rows = calcSubISRowsForGame(game, events);
  if (!rows.length) return null;
  const sortedRows = rows.slice().sort((a,b)=>{
    const av = sort === "minute" ? a.start : sort === "net" ? a.netAfter : sort === "immediate" ? a.net15 : a.subIS;
    const bv = sort === "minute" ? b.start : sort === "net" ? b.netAfter : sort === "immediate" ? b.net15 : b.subIS;
    return sort === "minute" ? av - bv : bv - av;
  });
  const avgSubIS = Math.round(rows.reduce((a,r)=>a+r.subIS,0)/rows.length);
  const totalNet = rows.reduce((a,r)=>a+r.netAfter,0);
  const positive = rows.filter(r=>r.positiveSwing).length;
  const protectedLeads = rows.filter(r=>r.leadProtected).length;
  const leadChances = rows.filter(r=>r.wasWinning).length;
  const sortBtn = (k,l) => <button onClick={()=>setSort(k)} style={{ flex:1, background:sort===k?C.blue:"rgba(15,23,42,.9)", color:sort===k?"#fff":C.muted, border:`1px solid ${sort===k?C.blue:C.border}`, borderRadius:12, padding:"7px 5px", fontSize:9, fontWeight:900, cursor:"pointer" }}>{l}</button>;
  return (
    <div style={{ ...card, border:`1px solid ${C.border2}`, marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10 }}>
        <div style={{ minWidth:0 }}><div style={{ fontSize:11, color:C.blue, fontWeight:900, letterSpacing:1.2, textTransform:"uppercase" }}>Sub IS</div><div style={{ fontSize:11, color:C.muted, marginTop:3, lineHeight:1.35 }}>Substitution Intelligence Score: rating and sortable stats for each substitution.</div><button onClick={()=>setOpen(!open)} style={{ marginTop:8, background:"rgba(56,189,248,0.12)", color:C.blue, border:`1px solid ${C.border2}`, borderRadius:12, padding:"7px 9px", fontSize:10, fontWeight:900, cursor:"pointer" }}>{open ? "Hide details" : "What is Sub IS?"}</button></div>
        <div style={{ textAlign:"right", flexShrink:0 }}><div style={{ fontSize:24, fontWeight:950, color:scoreColor(avgSubIS) }}>{avgSubIS}</div><div style={{ fontSize:9, color:C.muted, fontWeight:800 }}>GAME SUB IS</div></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7, marginBottom:10 }}>{[["NET", fmtSigned(totalNet), totalNet>0?C.green:totalNet<0?C.red:C.muted],["POS", `${positive}/${rows.length}`, C.green],["15M", fmtSigned(rows.reduce((a,r)=>a+r.net15,0)), C.amber],["CLOSE", leadChances?`${protectedLeads}/${leadChances}`:"-", C.blue]].map(([l,v,c])=><div key={l} style={{ background:"rgba(2,6,23,.55)", border:`1px solid ${C.border}`, borderRadius:13, padding:"8px 5px", textAlign:"center" }}><div style={{ fontSize:15, fontWeight:950, color:c }}>{v}</div><div style={{ fontSize:8, color:C.muted, fontWeight:900 }}>{l}</div></div>)}</div>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>{sortBtn("subIS","Sub IS")}{sortBtn("net","Net")}{sortBtn("immediate","15m")}{sortBtn("minute","Min")}</div>
      {open && <div style={{ marginBottom:10, padding:10, borderRadius:14, background:"rgba(2,6,23,0.55)", border:`1px solid ${C.border}`, color:C.text, fontSize:11, lineHeight:1.45 }}>Sub IS blends score swing after entry, 15-minute swing, game state, and lead protection. It evaluates the substitution window, not individual blame.</div>}
      {sortedRows.map(r => { const p = r.player || {}; const tier = subISTier({ ...r, apps:1, positivePct:r.positiveSwing?100:0, avgSwing:r.netAfter, gaAfter:r.gaAfter, gaPerApp:r.gaAfter, leadProtectPct:r.leadProtected?100:0 }); return <div key={r.key} style={{ display:"grid", gridTemplateColumns:"44px 1fr auto", gap:10, alignItems:"center", padding:"11px 0", borderTop:`1px solid ${C.border}` }}><div style={{ textAlign:"center" }}><div style={{ fontSize:15, fontWeight:950, color:C.amber }}>{r.start}'</div><div style={{ fontSize:8, color:C.muted }}>MIN</div></div><div style={{ minWidth:0 }}><div style={{ fontSize:13, fontWeight:900, color:C.text, lineHeight:1.2, whiteSpace:"normal" }}>#{p.num || "?"} {p.name || "Unknown"}</div><div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Before {r.scoreBefore} · {r.mins}' window · GF {r.gfAfter} / GA {r.gaAfter}</div><div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:5 }}><span style={{ fontSize:9, color:C.blue, border:`1px solid ${C.border2}`, borderRadius:999, padding:"3px 7px", fontWeight:900 }}>{tier}</span><span style={{ fontSize:9, color:r.netAfter>0?C.green:r.netAfter<0?C.red:C.muted, border:`1px solid ${C.border}`, borderRadius:999, padding:"3px 7px", fontWeight:900 }}>NET {fmtSigned(r.netAfter)}</span><span style={{ fontSize:9, color:C.amber, border:`1px solid ${C.border}`, borderRadius:999, padding:"3px 7px", fontWeight:900 }}>15M {fmtSigned(r.net15)}</span></div></div><div style={{ textAlign:"right", minWidth:60 }}><div style={{ fontSize:22, fontWeight:950, color:scoreColor(r.subIS) }}>{r.subIS}</div><div style={{ fontSize:9, color:C.muted, fontWeight:900 }}>SUB IS</div></div></div>; })}
    </div>
  );
}

// ─── GAME DETAIL ──────────────────────────────────────────────────────────────'''
text, n = re.subn(r'// ─── SUB IMPACT ─+\nfunction SubImpact\(\{ game, events \}\) \{.*?\n\}\n\n// ─── GAME DETAIL ─+', sub_component, text, count=1, flags=re.S)
if n != 1 and '// ─── SUB IS ─' not in text:
    raise SystemExit(f'SubImpact replacement failed: {n}')

# Replace season sub helper section with Sub IS summary objects.
stats_helpers = '\n  const subISSummary = summarizeSubIS(filteredGames);\n  const subISByPlayer = Object.fromEntries(subISSummary.map(r => [String(r.playerId), r]));\n  const subISSortBtn = (k,l) => (\n    <button onClick={() => setSortBy(k)} style={{ flex:1, padding:"7px 2px", borderRadius:12, border:"none", fontWeight:700, fontSize:10, cursor:"pointer", background:sortBy===k?C.blue:C.border, color:sortBy===k?"#fff":C.muted }}>{l}{sortBy===k?" ▼":""}</button>\n  );\n\n  const renderOverview = () => ('
text, n = re.subn(r'\n\s*const calcSubImpactRowsForGame = \(game\) => \{.*?\n\s*const renderOverview = \(\) => \(', stats_helpers, text, count=1, flags=re.S)
if n != 1 and 'const subISSummary = summarizeSubIS(filteredGames);' not in text:
    raise SystemExit(f'Season helper replacement failed: {n}')

new_card = r'''      <div style={card}>
        <Lbl>Sub IS Overview</Lbl>
        <div style={{ color:C.muted, fontSize:11, lineHeight:1.35, marginBottom:10 }}>Sub IS is a 0-100 Substitution Intelligence Score. It measures how effective a player is after entering: score swing, 15-minute impact, game state, and lead protection.</div>
        {subISSummary.length===0&&<div style={{ color:C.muted, fontSize:13 }}>No substitutions logged yet</div>}
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>{subISSortBtn("subIS","Sub IS")}{subISSortBtn("netAfter","Net")}{subISSortBtn("positivePct","Pos %")}{subISSortBtn("apps","Apps")}</div>
        {subISSummary.slice().sort((a,b)=>{ const key = ["subIS","netAfter","positivePct","apps"].includes(sortBy) ? sortBy : "subIS"; return (b[key]||0)-(a[key]||0); }).slice(0,10).map((r,i)=> { const pl = r.player || {}; const pos = pl.pos || "MID"; return <div key={r.playerId} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:10, alignItems:"center", padding:"10px 0", borderTop:i?`1px solid ${C.border}`:"none" }}><PlayerBubble player={pl} pos={pos} size={40} photo /><div style={{ minWidth:0 }}><div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}><span style={{ fontSize:13, fontWeight:900, color:C.text, lineHeight:1.15, whiteSpace:"normal" }}>{pl.name || "Unknown"}</span><span style={{ fontSize:8, color:C.blue, border:`1px solid ${C.border2}`, borderRadius:999, padding:"2px 6px", fontWeight:900 }}>{r.tier}</span></div><div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{r.apps} apps · {r.mins}' · GF {r.gfAfter} / GA {r.gaAfter} · POS {r.positivePct}%</div><div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:5 }}><span style={{ fontSize:9, color:r.netAfter>0?C.green:r.netAfter<0?C.red:C.muted, fontWeight:900 }}>NET {fmtSigned(r.netAfter)}</span><span style={{ fontSize:9, color:C.amber, fontWeight:900 }}>AVG {fmtSigned(r.avgSwing,2)}</span><span style={{ fontSize:9, color:C.blue, fontWeight:900 }}>15M {fmtSigned(r.immediateNet)}</span>{r.leads>0&&<span style={{ fontSize:9, color:C.green, fontWeight:900 }}>CLOSE {r.leadProtectPct}%</span>}</div></div><div style={{ textAlign:"right" }}><div style={{ fontSize:24, fontWeight:950, color:scoreColor(r.subIS) }}>{r.subIS}</div><div style={{ fontSize:9, color:C.muted, fontWeight:900 }}>SUB IS</div></div></div>; })}
      </div>
'''
text, n = re.subn(r'      <div style=\{card\}>\n        <Lbl>Sub Impact Overview</Lbl>.*?      </div>\n      <div style=\{card\}>\n        <Lbl>Top Scorers</Lbl>', new_card + '      <div style={card}>\n        <Lbl>Top Scorers</Lbl>', text, count=1, flags=re.S)
if n != 1 and '<Lbl>Sub IS Overview</Lbl>' not in text:
    raise SystemExit(f'Overview card replacement failed: {n}')

# Add Sub IS to Players section sortable data and visible cards.
old = 'const allWithStats = allP.map(p => ({ ...p, ...(allSt[String(p.id)] || {}), impact: calcImpact(p) })).filter(p => p.played > 0);'
new = 'const allWithStats = allP.map(p => { const sub = subISByPlayer[String(p.id)] || {}; return { ...p, ...(allSt[String(p.id)] || {}), impact: calcImpact(p), subIS: sub.subIS ?? null, subApps: sub.apps || 0, subNet: sub.netAfter || 0, subTier: sub.tier || "-", subPositivePct: sub.positivePct || 0 }; }).filter(p => p.played > 0);'
text = text.replace(old, new)
text = text.replace('const av = sortBy === "net80" ? (a.net80||0) : sortBy === "impact" ? (a.impact??-999) : (a[sortBy]||0);\n    const bv = sortBy === "net80" ? (b.net80||0) : sortBy === "impact" ? (b.impact??-999) : (b[sortBy]||0);', 'const av = sortBy === "net80" ? (a.net80||0) : sortBy === "impact" ? (a.impact??-999) : sortBy === "subIS" ? (a.subIS??-999) : (a[sortBy]||0);\n    const bv = sortBy === "net80" ? (b.net80||0) : sortBy === "impact" ? (b.impact??-999) : sortBy === "subIS" ? (b.subIS??-999) : (b[sortBy]||0);')
text = text.replace('{sb("impact","Impact")}', '{sb("impact","Impact")}{sb("subIS","Sub IS")}')
text = text.replace('{sb("impact", "Impact")}', '{sb("impact", "Impact")}{sb("subIS", "Sub IS")}')
text = text.replace('["Impact Score", fmtImpactScore(s.impact), s.impact>=75?C.green:s.impact>=50?C.amber:C.red],["Goals"', '["Impact Score", fmtImpactScore(s.impact), s.impact>=75?C.green:s.impact>=50?C.amber:C.red],["Sub IS", p.subIS ? p.subIS : "-", p.subIS ? scoreColor(p.subIS) : C.muted],["Goals"')
text = text.replace('["Net/80", s.net80s||"-", metricColor(s.net80)],["Impact Score", fmtImpactScore(s.impact), s.impact>=75?C.green:s.impact>=50?C.amber:C.red],["Total Minutes"', '["Net/80", s.net80s||"-", metricColor(s.net80)],["Impact Score", fmtImpactScore(s.impact), s.impact>=75?C.green:s.impact>=50?C.amber:C.red],["Sub IS", selected.subIS ? selected.subIS : "-", selected.subIS ? scoreColor(selected.subIS) : C.muted],["Total Minutes"')

if Path('chatgpt-write-test.txt').exists():
    Path('chatgpt-write-test.txt').unlink()

p.write_text(text)
print('Sub IS patch applied')
