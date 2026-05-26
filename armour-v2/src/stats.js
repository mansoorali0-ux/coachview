import { ROSTER, HALF, GAME } from "./constants";

function gameHalfMinutes(game) {
  const n = parseInt(game?.halfLength, 10);
  if (Number.isFinite(n) && n >= 20 && n <= 50) return n;
  return HALF;
}

function gameFullMinutes(game) {
  return gameHalfMinutes(game) * 2 || GAME;
}

export function calcStats(games) {
  const stats = {};

  const ensure = id => {
    const k = String(id);
    if (!stats[k]) stats[k] = { id:k, goals:0, assists:0, gf:0, ga:0, mins:0, played:0 };
    return k;
  };

  games.forEach(g => {
    const allP = g.allPlayers || ROSTER;
    allP.forEach(p => ensure(p.id));

    const halfLen = gameHalfMinutes(g);
    const fullLen = gameFullMinutes(g);
    const on = {}, mins = {};

    (g.starting || []).forEach(id => { on[String(id)] = 0; });

    const sorted = [...(g.events || [])].sort((a,b) => {
      const am = Number(a.minute) || 0;
      const bm = Number(b.minute) || 0;
      return am - bm;
    });

    let htDone = false;

    const doHalfReset = () => {
      if (htDone || !g.secondHalfStarting) return;
      htDone = true;

      Object.keys(on).forEach(k => {
        const start = Number(on[k]) || 0;
        mins[k] = (mins[k] || 0) + Math.max(0, halfLen - start);
      });

      Object.keys(on).forEach(k => delete on[k]);

      (g.secondHalfStarting || []).forEach(id => {
        const k = ensure(id);
        on[k] = halfLen;
      });
    };

    sorted.forEach(ev => {
      const minute = Math.max(0, Math.min(fullLen, Number(ev.minute) || 0));

      if (!htDone && g.secondHalfStarting && (ev.half === 2 || minute >= halfLen)) {
        doHalfReset();
      }

      if (ev.type === "sub") {
        const off = String(ev.playerOff);
        const inn = String(ev.playerOn);

        if (on[off] !== undefined) {
          const start = Number(on[off]) || 0;
          mins[off] = (mins[off] || 0) + Math.max(0, minute - start);
          delete on[off];
        }

        ensure(inn);
        if (on[inn] === undefined) {
          on[inn] = minute;
        }
      }

      if (ev.type === "goal_for") {
        if (ev.scorer) { const k = ensure(ev.scorer); stats[k].goals++; }
        if (ev.assist) { const k = ensure(ev.assist); stats[k].assists++; }
        Object.keys(on).forEach(k => { ensure(k); stats[k].gf++; });
      }

      if (ev.type === "goal_against") {
        Object.keys(on).forEach(k => { ensure(k); stats[k].ga++; });
      }
    });

    if (!htDone && g.secondHalfStarting) {
      doHalfReset();
    }

    Object.keys(on).forEach(k => {
      const start = Number(on[k]) || 0;
      mins[k] = (mins[k] || 0) + Math.max(0, fullLen - start);
    });

    Object.keys(mins).forEach(k => {
      if (mins[k] > 0) {
        ensure(k);
        stats[k].mins += Math.min(mins[k], fullLen);
        stats[k].played++;
      }
    });
  });

  Object.values(stats).forEach(s => {
    s.avgMins = s.played > 0 ? Math.round(s.mins / s.played) : 0;
    s.net80   = s.mins > 0 ? ((s.gf - s.ga) / s.mins * 80) : null;
    s.net80s  = s.net80 !== null ? (s.net80 >= 0 ? "+" : "") + s.net80.toFixed(2) : "-";
  });

  return stats;
}

export function makeLVURush() {
  const avail = Object.fromEntries(ROSTER.map(p => [p.id, "available"]));
  return {
    id: "lvu-rush-5-9-2026",
    opponent: "LVU Rush 11G Aspire",
    venue: "Away", type: "regular", date: "5/9/2026", status: "completed",
    starting: [1,16,2,8,17,3,5,22,12,19,13],
    secondHalfStarting: [11,5,3,7,8,12,13,16,17,19,22],
    positions: {1:"GK",16:"DEF",2:"DEF",8:"MID",17:"DEF",3:"DEF",5:"MID",22:"DEF",12:"FWD",19:"FWD",13:"DEF"},
    avail, guests:[], allPlayers:ROSTER, scoreFor:3, scoreAgainst:2,
    events:[
      {type:"sub",         minute:15, playerOff:13, playerOn:7,  subType:"tactical", pos:"MID", half:1, id:uid()},
      {type:"sub",         minute:22, playerOff:5,  playerOn:14, subType:"tactical", pos:"FWD", half:1, id:uid()},
      {type:"goal_for",    minute:25, scorer:12, assist:8,    ownGoal:false, score:"1-0", half:1, id:uid()},
      {type:"goal_against",minute:49, score:"1-1", half:2, id:uid()},
      {type:"goal_for",    minute:57, scorer:12, assist:null, ownGoal:false, score:"2-1", half:2, id:uid()},
      {type:"goal_for",    minute:62, scorer:12, assist:2,    ownGoal:false, score:"3-1", half:2, id:uid()},
      {type:"sub",         minute:60, playerOff:13, playerOn:2,  subType:"tactical", pos:"DEF", half:2, id:uid()},
      {type:"sub",         minute:65, playerOff:5,  playerOn:14, subType:"tactical", pos:"FWD", half:2, id:uid()},
      {type:"sub",         minute:74, playerOff:14, playerOn:5,  subType:"tactical", pos:"MID", half:2, id:uid()},
      {type:"goal_against",minute:76, score:"3-2", half:2, id:uid()},
    ],
  };
}

export function makeCoppermine() {
  const avail = Object.fromEntries(ROSTER.map(p => [p.id, "available"]));
  const michaela = { id:"M1", num:"G", name:"Michaela", pos:"MID", isGuest:true };
  return {
    id: "coppermine-5-10-2026",
    opponent: "Coppermine Soccer Club 11G Aspire",
    venue: "Away", type: "regular", date: "5/10/2026", status: "completed",
    starting: [1,17,16,7,22,5,13,2,3,12,19],
    secondHalfStarting: [1,17,16,7,22,14,13,2,3,12,19],
    positions: {1:"GK",17:"DEF",16:"DEF",7:"MID",22:"DEF",5:"MID",13:"DEF",2:"DEF",3:"DEF",12:"FWD",19:"FWD"},
    avail, guests:[michaela], allPlayers:[...ROSTER,michaela], scoreFor:6, scoreAgainst:0,
    events:[
      {type:"sub",      minute:21, playerOff:5,  playerOn:14,  subType:"tactical", pos:"MID", half:1, id:uid()},
      {type:"sub",      minute:21, playerOff:19, playerOn:"M1",subType:"tactical", pos:"MID", half:1, id:uid()},
      {type:"goal_for", minute:11, scorer:2,  assist:null, ownGoal:false, score:"1-0", half:1, id:uid()},
      {type:"goal_for", minute:24, scorer:13, assist:12,   ownGoal:false, score:"2-0", half:1, id:uid()},
      {type:"goal_for", minute:34, scorer:2,  assist:12,   ownGoal:false, score:"3-0", half:1, id:uid()},
      {type:"sub",      minute:51, playerOff:13, playerOn:"M1",subType:"tactical", pos:"MID", half:2, id:uid()},
      {type:"goal_for", minute:56, scorer:19, assist:12,   ownGoal:false, score:"4-0", half:2, id:uid()},
      {type:"sub",      minute:60, playerOff:14, playerOn:5,  subType:"tactical", pos:"MID", half:2, id:uid()},
      {type:"sub",      minute:61, playerOff:12, playerOn:13, subType:"tactical", pos:"FWD", half:2, id:uid()},
      {type:"goal_for", minute:69, scorer:19, assist:5,    ownGoal:false, score:"5-0", half:2, id:uid()},
      {type:"sub",      minute:67, playerOff:7,  playerOn:12, subType:"tactical", pos:"FWD", half:2, id:uid()},
      {type:"goal_for", minute:75, scorer:2,  assist:3,    ownGoal:false, score:"6-0", half:2, id:uid()},
    ],
  };
}

function uid() { return Math.random().toString(36).slice(2,9); }
