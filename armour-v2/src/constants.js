export const ADMIN_PIN = "1981";
export const FEATURED_ID = null;
export const HALF = 40;
export const GAME = 80;
export const CUP_HALF = 30;
export const CUP_GAME = 60;

export const ROSTER = [
  { id:1,  num:"1",  name:"Emily Gandel",        pos:"GK"  },
  { id:2,  num:"2",  name:"Caitlyn Dunkelberger", pos:"FWD" },
  { id:3,  num:"3",  name:"Ashley Ellis",         pos:"FWD" },
  { id:4,  num:"4",  name:"Hailey Ferguson",      pos:"DEF" },
  { id:5,  num:"5",  name:"Maariyah Ali",         pos:"MID" },
  { id:6,  num:"6",  name:"Sadie Feldman",        pos:"MID" },
  { id:7,  num:"7",  name:"Julia Flory",          pos:"MID" },
  { id:8,  num:"8",  name:"Katelyn Hannan",       pos:"MID" },
  { id:11, num:"11", name:"Emma Young",           pos:"GK"  },
  { id:12, num:"12", name:"Sloane Pietryka",      pos:"FWD" },
  { id:13, num:"13", name:"Lilly Nipper",         pos:"DEF" },
  { id:14, num:"14", name:"Brooke Schuyler",      pos:"MID" },
  { id:15, num:"15", name:"Aurelia Berkowicz",    pos:"DEF" },
  { id:16, num:"16", name:"Avah Scott",           pos:"DEF" },
  { id:17, num:"17", name:"Lily Kaye",            pos:"DEF" },
  { id:18, num:"18", name:"Emerson Yonker",       pos:"MID" },
  { id:19, num:"19", name:"Abigail Yun",          pos:"FWD" },
  { id:22, num:"22", name:"Lainey Pearson-Moore", pos:"MID" },
];

export const DEFAULT_POS = Object.fromEntries(ROSTER.map(p => [p.id, p.pos]));

export const UPCOMING = [
  { date:"5/23/2026", opp:"Ellicott City Soccer Club CiTY 2011 Girls Elite", venue:"Away", type:"tournament" },
  { date:"5/23/2026", opp:"Olney Strikers Blue 2011",                         venue:"Away", type:"tournament" },
];

export const LEAGUE_TEAMS = [
  "LVU Rush 11G Aspire",
  "Potomac Soccer Association 11G Aspire",
  "Huntingdon Valley AA 11G Aspire",
  "Keystone FC 11G Aspire",
  "The Player Progression Academy 11G Aspire",
  "Baltimore Celtic Soccer Club 11G Aspire",
  "Coppermine Soccer Club 11G Aspire",
];

export const TOURNAMENT_TEAMS = [
  "Ellicott City Soccer Club CiTY 2011 Girls Elite",
  "Olney Strikers Blue 2011",
];

export const POSITIONS = ["GK","DEF","MID","FWD"];
export const POS_COLOR = { GK:"#f59e0b", DEF:"#3b82f6", MID:"#10b981", FWD:"#ef4444" };

export function uid() { return Math.random().toString(36).slice(2,9); }
export function pid(id) { return String(id); }
export function findPlayer(id, players) { return players.find(p => String(p.id) === String(id)); }
