from pathlib import Path

APP = Path("armour-v2/src/App.js")
text = APP.read_text()

# Add Coach Decisions derived rows after Sub IS summary setup.
needle = "const subISByPlayer = Object.fromEntries(subISSummary.map(r => [String(r.playerId), r]));"
insert = '''const subISByPlayer = Object.fromEntries(subISSummary.map(r => [String(r.playerId), r]));
  const coachBestSub = subISSummary[0] || null;
  const coachCloser = subISSummary.slice().filter(r=>r.leads>0).sort((a,b)=>(b.leadProtectPct-a.leadProtectPct) || (b.subIS-a.subIS))[0] || null;
  const coachMomentum = subISSummary.slice().sort((a,b)=>(b.immediateNet-a.immediateNet) || (b.subIS-a.subIS))[0] || null;
  const coachPositive = subISSummary.slice().sort((a,b)=>(b.positivePct-a.positivePct) || (b.subIS-a.subIS))[0] || null;'''
if needle in text and "const coachBestSub" not in text:
    text = text.replace(needle, insert)

# Add Coach Decisions card immediately before Sub IS Overview.
sub_card_marker = '''      <div style={card}>
        <Lbl>Sub IS Overview</Lbl>'''
coach_card = '''      <div style={card}>
        <Lbl>Coach Decisions</Lbl>
        <div style={{ color:C.muted, fontSize:11, lineHeight:1.35, marginBottom:10 }}>
          Quick coaching intelligence from substitution patterns: who changes games, who protects leads, and who is most useful from the bench.
        </div>
        {subISSummary.length===0&&<div style={{ color:C.muted, fontSize:13 }}>No substitution intelligence yet</div>}
        {[
          ["Best Substitute", coachBestSub, "subIS"],
          ["Best Closer", coachCloser, "leadProtectPct"],
          ["Momentum Changer", coachMomentum, "immediateNet"],
          ["Positive Swing Leader", coachPositive, "positivePct"]
        ].filter(x=>x[1]).map(([label,row,key],i)=>{
          const p = row.player || {};
          const value = key==="subIS" ? row.subIS : key==="leadProtectPct" ? `${row.leadProtectPct}%` : key==="immediateNet" ? fmtSigned(row.immediateNet) : `${row.positivePct}%`;
          return (
            <div key={label} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:10, alignItems:"center", padding:"10px 0", borderTop:i?`1px solid ${C.border}`:"none" }}>
              <PlayerBubble player={p} pos={p.pos || "MID"} size={38} photo />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:10, color:C.blue, fontWeight:900, textTransform:"uppercase", letterSpacing:.8 }}>{label}</div>
                <div style={{ fontSize:13, color:C.text, fontWeight:900, whiteSpace:"normal" }}>{p.name || "Unknown"}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{row.tier} · {row.apps} apps · NET {fmtSigned(row.netAfter)}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:22, fontWeight:950, color:key==="subIS"?scoreColor(row.subIS):C.amber }}>{value}</div>
                <div style={{ fontSize:8, color:C.muted, fontWeight:900 }}>{key==="subIS"?"SUB IS":key==="leadProtectPct"?"CLOSE":key==="immediateNet"?"15M":"POS"}</div>
              </div>
            </div>
          );
        })}
      </div>

'''
if "<Lbl>Coach Decisions</Lbl>" not in text and sub_card_marker in text:
    text = text.replace(sub_card_marker, coach_card + sub_card_marker)

APP.write_text(text)
print("Coach Decisions patch applied")
