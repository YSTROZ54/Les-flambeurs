// Loup-Garou multijoueur (3 salons publics), entièrement géré par le serveur :
//  - les rôles sont tirés ici et restent secrets : chaque joueur ne reçoit que le sien (les loups connaissent leurs semblables) ;
//  - les phases (annonce du rôle, nuit, aube, discussion, vote) et leurs chronos suivent l'horloge du serveur ;
//  - les gains sont versés par le serveur avec une clé unique (jamais deux fois).
// Un salon = une ligne __lg_salon_<n> (invisible depuis le navigateur), modifiée avec contrôle de version comme le Blind Test.
// Le chef (premier arrivé) règle les rôles et lance la partie ; s'il part, un autre le devient.
// Rôles : villageois, loup-garou, voyante, sorcière, chasseur, cupidon, petite fille, idiot du village.
// Nuit : (1re nuit : cupidon) → voyante → loups (la petite fille peut espionner) → sorcière. Puis aube, discussion, vote.
import { randomInt, randomBytes } from 'node:crypto';
import { actorOf } from './_auth.js';
import { getRow, getRowExact, putRow, updateAccount, GameError } from './_store.js';
import { walletPay } from './_wallet.js';

const PREFIX = '__lg_salon_';
const NOOP = Symbol('noop');
export const ROOM_IDS = ['1', '2', '3'];
export const MAX_PLAYERS = 12;
export const MIN_PLAYERS = 4;
export const MIN_REWARD_PLAYERS = 6;
export const REWARD = 100;                 // € versés à chaque gagnant d'une partie d'au moins MIN_REWARD_PLAYERS joueurs
export const GONE_MS = 45000;
export const SEEN_REFRESH_MS = 20000;
const T = { reveal: 9000, cupidon: 22000, voyante: 18000, loups: 30000, sorciere: 24000, dawn: 7000, chasseur: 16000, vote: 28000, result: 7000, early: 1800 };
export const ROLES = ['villageois', 'loup', 'voyante', 'sorciere', 'chasseur', 'cupidon', 'petitefille', 'idiot'];
const UNIQUE = ['voyante', 'sorciere', 'chasseur', 'cupidon', 'petitefille', 'idiot'];
export const ROLE_NAMES = { villageois: 'Villageois', loup: 'Loup-Garou', voyante: 'Voyante', sorciere: 'Sorcière', chasseur: 'Chasseur', cupidon: 'Cupidon', petitefille: 'Petite Fille', idiot: 'Idiot du village' };
const SPY_CAUGHT = 1 / 3;

const rowName = (code) => PREFIX + code;
const cleanCode = (c) => { const s = String(c == null ? '' : c).trim(); return ROOM_IDS.includes(s) ? s : ''; };
const cleanAvatar = (a) => (typeof a === 'string' && a.length > 0 && a.length <= 12 ? a : '🧑‍🎤');
const fail = (res, code, error, extra) => res.status(code).json({ ok: false, error, ...(extra || {}) });
const pick = (a) => a[randomInt(0, a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ------------------------------ réglages ------------------------------ */
// répartition conseillée selon le nombre de joueurs
export function autoRoles(n) {
  const loups = n <= 5 ? 1 : n <= 9 ? 2 : 3;
  const r = { villageois: 0, loup: loups, voyante: n >= 5 ? 1 : 0, sorciere: n >= 6 ? 1 : 0, chasseur: n >= 7 ? 1 : 0, cupidon: n >= 8 ? 1 : 0, petitefille: n >= 9 ? 1 : 0, idiot: n >= 10 ? 1 : 0 };
  r.villageois = Math.max(0, n - ROLES.filter((k) => k !== 'villageois').reduce((s, k) => s + r[k], 0));
  return r;
}
export function sanitizeCfg(c, n) {
  const roles = {};
  const src = (c && c.roles) || {};
  ROLES.forEach((k) => {
    let v = Math.floor(Number(src[k]));
    if (!Number.isFinite(v) || v < 0) v = 0;
    roles[k] = UNIQUE.includes(k) ? Math.min(1, v) : Math.min(MAX_PLAYERS, v);
  });
  let disc = Math.floor(Number(c && c.discMs));
  disc = Number.isFinite(disc) ? Math.min(180000, Math.max(20000, disc)) : 60000;
  return { roles, discMs: disc };
}
const defaultCfg = () => ({ roles: autoRoles(8), discMs: 60000 });
const totalRoles = (cfg) => ROLES.reduce((s, k) => s + (cfg.roles[k] || 0), 0);

/* ------------------------------ état ------------------------------ */
function freshState(code, now, owed) {
  return {
    code, id: randomBytes(6).toString('hex'), status: 'lobby', host: '', cfg: defaultCfg(), created: now, updatedAt: now,
    players: {}, phase: '', phaseStart: 0, phaseEnd: 0, night: 0, acts: {}, votes: {}, log: [], potions: { heal: true, kill: true },
    lovers: [], victims: [], hunter: '', after: '', winner: '', winners: [], reward: false, owed: owed || [], finishedAt: 0, lastVoteResult: null
  };
}
function resetRoom(st, now) { Object.assign(st, freshState(st.code, now, st.owed)); }
const present = (p, now) => !!p && !p.left && now - (p.seen || 0) <= GONE_MS;
const stayingKeys = (st) => Object.keys(st.players).filter((k) => !st.players[k].left);
const aliveKeys = (st) => Object.keys(st.players).filter((k) => st.players[k].alive);
const aliveWith = (st, role) => aliveKeys(st).filter((k) => st.players[k].role === role);
const isWolf = (st, k) => st.players[k] && st.players[k].role === 'loup';
function say(st, text, kind) { st.log.push({ t: text, k: kind || '', at: st.phaseStart || Date.now() }); if (st.log.length > 40) st.log.shift(); }
function pickHost(st) {
  const ks = stayingKeys(st).sort((a, b) => st.players[a].joinedAt - st.players[b].joinedAt);
  st.host = ks[0] || '';
}
function freeSeat(st) {
  const used = new Set(Object.values(st.players).filter((p) => !p.left).map((p) => p.seat));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

/* ------------------------------ mécanique de jeu ------------------------------ */
function setPhase(st, phase, at, dur) { st.phase = phase; st.phaseStart = at; st.phaseEnd = at + dur; }

function startGame(st, now) {
  const keys = shuffle(Object.keys(st.players));
  const pool = [];
  ROLES.forEach((r) => { for (let i = 0; i < st.cfg.roles[r]; i++) pool.push(r); });
  const roles = shuffle(pool);
  keys.forEach((k, i) => {
    Object.assign(st.players[k], { role: roles[i], alive: true, lover: '', deathRole: '', knownWolves: [], seenLog: [], idiotSpared: false, left: false });
  });
  st.id = randomBytes(6).toString('hex');
  st.status = 'playing'; st.night = 0; st.acts = {}; st.votes = {}; st.log = []; st.potions = { heal: true, kill: true };
  st.lovers = []; st.victims = []; st.hunter = ''; st.after = ''; st.winner = ''; st.winners = []; st.lastVoteResult = null;
  st.reward = keys.length >= MIN_REWARD_PLAYERS;
  setPhase(st, 'reveal', now, T.reveal);
  say(st, 'La partie commence : découvre ton rôle !', 'info');
}

// prochaine étape de la nuit (en sautant les rôles absents ou morts)
function nextNightStep(st, at) {
  const order = st.night === 1 ? ['cupidon', 'voyante', 'loups', 'sorciere'] : ['voyante', 'loups', 'sorciere'];
  const idx = order.indexOf(st.phase);
  for (let i = idx + 1; i < order.length; i++) {
    const ph = order[i];
    if (ph === 'cupidon' && aliveWith(st, 'cupidon').length) { setPhase(st, 'cupidon', at, T.cupidon); st.acts.cupidon = null; return; }
    if (ph === 'voyante' && aliveWith(st, 'voyante').length) { setPhase(st, 'voyante', at, T.voyante); st.acts.voyante = null; return; }
    if (ph === 'loups' && aliveWith(st, 'loup').length) { setPhase(st, 'loups', at, T.loups); st.acts.wolfVotes = {}; st.acts.spyDone = {}; st.acts.pfCaught = ''; return; }
    if (ph === 'sorciere' && aliveWith(st, 'sorciere').length) { resolveWolves(st); setPhase(st, 'sorciere', at, T.sorciere); st.acts.witchHeal = false; st.acts.witchKill = ''; st.acts.witchDone = false; return; }
  }
  dawn(st, at);
}
function startNight(st, at) {
  st.night += 1; st.acts = { victim: '' }; st.victims = []; st.votes = {};
  st.phase = 'start';
  nextNightStep(st, at);
  if (st.phase !== 'dawn') say(st, 'La nuit tombe sur le village…', 'night');
}

function resolveWolves(st) {
  if (st.acts.resolved) return;
  st.acts.resolved = true;
  const votes = Object.values(st.acts.wolfVotes || {}).filter(Boolean);
  let victim = '';
  if (votes.length) {
    const tally = {}; votes.forEach((v) => { tally[v] = (tally[v] || 0) + 1; });
    const best = Math.max(...Object.values(tally));
    victim = pick(Object.keys(tally).filter((k) => tally[k] === best));
  }
  if (st.acts.pfCaught && st.players[st.acts.pfCaught] && st.players[st.acts.pfCaught].alive) victim = st.acts.pfCaught;   // la petite fille a été repérée
  st.acts.victim = victim;
}

// mort d'un joueur (avec les amoureux) ; renvoie la liste des morts
function kill(st, k, why, out) {
  const p = st.players[k];
  if (!p || !p.alive) return;
  p.alive = false; p.deathRole = p.role;
  out.push(k);
  say(st, p.name + ' ' + why + ' : il était ' + ROLE_NAMES[p.role] + '.', 'death');
  if (st.lovers.includes(k)) { const o = st.lovers.find((x) => x !== k); if (o) kill(st, o, 'meurt de chagrin', out); }
}

function winCheck(st, at) {
  const alive = aliveKeys(st);
  const wolves = alive.filter((k) => isWolf(st, k));
  const others = alive.length - wolves.length;
  let w = '';
  if (!alive.length) w = 'personne';
  else if (!wolves.length) w = 'village';
  else if (alive.length === 2 && st.lovers.length === 2 && st.lovers.every((k) => alive.includes(k)) && wolves.length === 1) w = 'amoureux';
  else if (wolves.length >= others) w = 'loups';
  if (!w) return false;
  st.status = 'finished'; st.winner = w; st.phase = ''; st.finishedAt = at;
  const all = Object.keys(st.players);
  st.winners = all.filter((k) => w === 'personne' ? false : w === 'amoureux' ? st.lovers.includes(k) : w === 'loups' ? isWolf(st, k) : !isWolf(st, k) && !(st.lovers.length === 2 && st.lovers.includes(k) && st.lovers.some((x) => isWolf(st, x))));
  say(st, w === 'village' ? 'Le village a gagné : tous les loups sont éliminés !' : w === 'loups' ? 'Les loups-garous ont dévoré le village !' : w === 'amoureux' ? 'Les amoureux gagnent seuls contre tous !' : 'Plus personne n\'est en vie…', 'win');
  if (st.reward) st.winners.forEach((k) => { if (st.players[k].left) return; st.owed.push({ key: `lg:${st.id}:${k}`, name: k, amount: REWARD }); });
  return true;
}

// après un ou plusieurs morts : le chasseur tire-t-il ? puis la suite
function afterDeaths(st, at, dead, next) {
  const hunter = dead.find((k) => st.players[k].role === 'chasseur' && !st.players[k].left);
  if (hunter && aliveKeys(st).length) { st.hunter = hunter; st.after = next; setPhase(st, 'chasseur', at, T.chasseur); st.acts.shot = null; return; }
  proceed(st, at, next);
}
function proceed(st, at, next) {
  if (winCheck(st, at)) return;
  if (next === 'day') { setPhase(st, 'discussion', at, st.cfg.discMs); st.votes = {}; say(st, 'Le jour se lève : discutez, puis votez !', 'day'); }
  else startNight(st, at);
}

function dawn(st, at) {
  resolveWolves(st);
  const deaths = [];
  let victim = st.acts.victim;
  if (victim && st.acts.witchHeal) { st.potions.heal = false; victim = ''; }
  if (victim) kill(st, victim, 'a été dévoré cette nuit', deaths);
  const pk = st.acts.witchKill;
  if (pk && st.players[pk] && st.players[pk].alive) { st.potions.kill = false; kill(st, pk, 'a été empoisonné cette nuit', deaths); }
  if (!deaths.length) say(st, 'Aucune victime cette nuit : le village se réveille sain et sauf.', 'day');
  setPhase(st, 'dawn', at, T.dawn);
  st.victims = deaths;
  st.after = 'day-after-dawn';
}

function resolveVote(st, at) {
  const tally = {};
  Object.keys(st.votes).forEach((v) => { const t = st.votes[v]; if (t && st.players[t] && st.players[t].alive && st.players[v] && st.players[v].alive && !st.players[v].idiotSpared) tally[t] = (tally[t] || 0) + 1; });
  const best = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((k) => tally[k] === best);
  const deaths = [];
  let msg = null;
  if (!best || top.length !== 1) { say(st, 'Égalité ou aucun vote : personne n\'est éliminé.', 'day'); msg = { name: '', tally }; }
  else {
    const k = top[0], p = st.players[k];
    if (p.role === 'idiot' && !p.idiotSpared) { p.idiotSpared = true; say(st, p.name + ' est l\'Idiot du village : le village l\'épargne, mais il ne votera plus !', 'day'); msg = { name: p.name, spared: true, tally }; }
    else { kill(st, k, 'est éliminé par le village', deaths); msg = { name: p.name, tally }; }
  }
  st.lastVoteResult = msg;
  setPhase(st, 'result', at, T.result);
  st.victims = deaths; st.after = 'night-after-result';
}

// fait avancer le salon avec l'horloge ; renvoie true si quelque chose a changé
export function progress(st, now) {
  let changed = false;
  for (const k of Object.keys(st.players)) {
    const p = st.players[k];
    if (now - (p.seen || 0) <= GONE_MS) continue;
    if (st.status === 'playing') { if (!p.left) { p.left = true; p.gone = true; changed = true; if (p.alive) { const d = []; kill(st, k, 'a quitté le village', d); if (d.length) afterDeathsFromLeave(st, now, d); } } }
    else if (!p.left) { delete st.players[k]; changed = true; }
  }
  if (stayingKeys(st).length === 0 && (st.status !== 'lobby' || st.host || JSON.stringify(st.cfg) !== JSON.stringify(defaultCfg()))) { resetRoom(st, now); return true; }
  if (st.host && !(st.players[st.host] && !st.players[st.host].left)) { pickHost(st); changed = true; }
  if (st.status !== 'playing') return changed;

  for (let guard = 0; guard < 60 && st.status === 'playing'; guard++) {
    const early = earlyDone(st);
    const dueAt = early ? Math.min(st.phaseEnd, Math.max(st.phaseStart + 1500, early + 1200)) : st.phaseEnd;       // tout le monde a joué : on enchaîne vite
    if (now < dueAt) break;
    if (!advance(st, dueAt)) break;
    changed = true;
  }
  return changed;
}
function afterDeathsFromLeave(st, now, d) { if (!winCheck(st, now)) { /* la partie continue, le chasseur parti ne tire pas */ } }

// vrai si tous les acteurs de la phase ont joué (renvoie l'instant où le dernier a joué, ou 0)
function earlyDone(st) {
  const ph = st.phase, a = st.acts || {};
  if (ph === 'cupidon') return a.cupidon ? (a.cupidonAt || 1) : 0;
  if (ph === 'voyante') return a.voyante ? (a.voyanteAt || 1) : 0;
  if (ph === 'loups') { const w = aliveWith(st, 'loup'); return w.length && w.every((k) => a.wolfVotes && a.wolfVotes[k]) ? (a.wolfAt || 1) : 0; }
  if (ph === 'sorciere') return a.witchDone ? (a.witchAt || 1) : 0;
  if (ph === 'chasseur') return a.shot !== null && a.shot !== undefined ? (a.shotAt || 1) : 0;
  if (ph === 'vote') { const v = aliveKeys(st).filter((k) => !st.players[k].idiotSpared); return v.length && v.every((k) => k in st.votes) ? (st.votesAt || 1) : 0; }
  return 0;
}
function advance(st, at) {
  const ph = st.phase;
  if (ph === 'reveal') { startNight(st, at); return true; }
  if (ph === 'cupidon') {
    let pair = st.acts.cupidon;
    if (!pair) { const al = aliveKeys(st); pair = shuffle(al).slice(0, 2); }
    if (pair.length === 2 && pair[0] !== pair[1]) { st.lovers = pair; }
    nextNightStep(st, at); return true;
  }
  if (ph === 'voyante') { nextNightStep(st, at); return true; }
  if (ph === 'loups') { nextNightStep(st, at); return true; }
  if (ph === 'sorciere') { nextNightStep(st, at); return true; }
  if (ph === 'dawn') {
    const dead = st.victims || [];
    st.victims = [];
    afterDeaths(st, at, dead, 'day'); return true;
  }
  if (ph === 'chasseur') {
    const h = st.hunter, tgt = st.acts.shot;
    const out = [];
    if (tgt && st.players[tgt] && st.players[tgt].alive) kill(st, tgt, 'est abattu par le Chasseur', out);
    else say(st, 'Le Chasseur ne tire sur personne.', 'day');
    st.hunter = '';
    proceed(st, at, st.after === 'night' ? 'night' : 'day');
    return true;
  }
  if (ph === 'discussion') { setPhase(st, 'vote', at, T.vote); st.votes = {}; st.votesAt = 0; say(st, 'Place au vote : désignez un suspect.', 'day'); return true; }
  if (ph === 'vote') { resolveVote(st, at); return true; }
  if (ph === 'result') {
    const dead = st.victims || [];
    st.victims = [];
    afterDeaths(st, at, dead, 'night'); return true;
  }
  return false;
}

/* ------------------------------ ce que voit chaque navigateur ------------------------------ */
export function publicState(st, now, actor) {
  const me = actor && st.players[actor];
  const over = st.status === 'finished';
  const meWolf = !!me && me.role === 'loup';
  const out = {
    code: st.code, name: 'Salon ' + st.code, id: st.id, status: st.status, serverNow: now, cfg: st.cfg, max: MAX_PLAYERS, min: MIN_PLAYERS,
    host: st.host, hostName: st.players[st.host] ? st.players[st.host].name : '', phase: st.phase, phaseStart: st.phaseStart, phaseEnd: st.phaseEnd, night: st.night,
    reward: st.reward ? REWARD : 0, rewardMinPlayers: MIN_REWARD_PLAYERS, winner: st.winner, log: st.log.slice(-14), updatedAt: st.updatedAt,
    isNight: ['cupidon', 'voyante', 'loups', 'sorciere'].includes(st.phase), roleNames: ROLE_NAMES, total: totalRoles(st.cfg),
    players: Object.keys(st.players).sort((a, b) => st.players[a].seat - st.players[b].seat).map((k) => {
      const p = st.players[k];
      const showRole = over || !p.alive && st.status === 'playing' || k === actor || (meWolf && p.role === 'loup');
      return { name: p.name, avatar: p.avatar, seat: p.seat, alive: st.status === 'lobby' ? true : !!p.alive, left: !!p.left, host: k === st.host, me: k === actor,
        role: st.status !== 'lobby' && showRole ? p.role : undefined, idiot: !!p.idiotSpared, winner: over && st.winners.includes(k),
        voted: st.phase === 'vote' && k in st.votes ? (st.votes[k] ? st.players[st.votes[k]].name : '—') : undefined };
    }),
    lastVoteResult: st.lastVoteResult && (st.phase === 'result') ? st.lastVoteResult : null
  };
  if (me) {
    const you = { name: me.name, host: actor === st.host, seat: me.seat, alive: st.status === 'lobby' ? true : !!me.alive };
    if (st.status !== 'lobby') {
      you.role = me.role; you.lover = '';
      if (st.lovers.includes(actor)) { const o = st.lovers.find((x) => x !== actor); you.lover = o && st.players[o] ? st.players[o].name : ''; }
      you.seenLog = me.seenLog || []; you.knownWolves = me.knownWolves || [];
      let act = '';
      if (me.alive || (st.phase === 'chasseur' && st.hunter === actor)) {
        const ph = st.phase, a = st.acts || {};
        if (ph === 'cupidon' && me.role === 'cupidon' && !a.cupidon) act = 'cupidon';
        else if (ph === 'voyante' && me.role === 'voyante' && !a.voyante) act = 'voyante';
        else if (ph === 'loups' && me.role === 'loup') act = 'loups';
        else if (ph === 'loups' && me.role === 'petitefille') act = 'spy';
        else if (ph === 'sorciere' && me.role === 'sorciere' && !a.witchDone) act = 'sorciere';
        else if (ph === 'vote' && !me.idiotSpared) act = 'vote';
      }
      if (st.phase === 'chasseur' && st.hunter === actor && !(st.acts.shot !== null && st.acts.shot !== undefined)) act = 'chasseur';
      you.act = act;
      if (act === 'loups') { you.wolfVotes = {}; Object.keys(st.acts.wolfVotes || {}).forEach((k) => { const t = st.acts.wolfVotes[k]; if (t && st.players[k] && st.players[t]) you.wolfVotes[st.players[k].name] = st.players[t].name; }); }
      if (act === 'sorciere') {
        const v = st.acts.victim;
        you.witch = { victim: v && st.players[v] ? st.players[v].name : '', heal: !!st.potions.heal, kill: !!st.potions.kill };
      }
      if (st.phase === 'loups' && me.role === 'petitefille') you.spied = !!(st.acts.spyDone && st.acts.spyDone[actor]);
      if (me.role === 'loup' && st.phase === 'loups') you.mateVotes = you.wolfVotes || {};
      you.potions = me.role === 'sorciere' ? { ...st.potions } : undefined;
    }
    out.you = you;
  }
  if (over) { out.roles = Object.keys(st.players).map((k) => ({ name: st.players[k].name, role: st.players[k].role })); }
  return out;
}

/* ------------------------------ stockage et API ------------------------------ */
async function loadRoom(code) {
  const row = await getRowExact(rowName(code));
  return row && row.data && row.data.lg ? row.data.lg : null;
}
async function ensureRoom(code) {
  if (await loadRoom(code)) return;
  await putRow({ username: rowName(code), password: 'sys', avatar: '🐺', balance: 0, data: { lg: freshState(code, Date.now()) } });
}
async function mutateRoom(code, mutate) {
  try {
    const { result } = await updateAccount(rowName(code), (d) => {
      const st = d.data && d.data.lg;
      if (!st) throw new GameError(404, 'Salon introuvable.');
      const now = Date.now();
      if (!st.owed) st.owed = [];
      progress(st, now);
      const out = mutate(st, now);
      if (out === NOOP) throw new GameError(0, 'noop');
      d.data.lg = st;
      return out;
    });
    return result;
  } catch (e) {
    if (e instanceof GameError && e.code === 0) return NOOP;
    throw e;
  }
}
async function settleOwed(code) {
  const st = await loadRoom(code);
  const owed = (st && st.owed) || [];
  if (!owed.length) return;
  const done = [];
  for (const o of owed) {
    try { await walletPay(o.name, o.key, o.amount); done.push(o.key); }
    catch (e) { if (e && e.code === 404) done.push(o.key); }
  }
  if (done.length) await mutateRoom(code, (s) => { s.owed = (s.owed || []).filter((x) => !done.includes(x.key)); }).catch(() => {});
}
async function currentState(code, actor) {
  let st = await loadRoom(code);
  const now = Date.now();
  if (!st) return publicState(freshState(code, now), now, actor);
  const probe = JSON.parse(JSON.stringify(st));
  const me = actor && probe.players[actor];
  const stale = me && now - (me.seen || 0) > SEEN_REFRESH_MS;
  if (progress(probe, now) || stale) {
    await mutateRoom(code, (s, n) => { const p = s.players[actor]; if (p) { p.seen = n; if (p.gone) { p.left = false; p.gone = false; } } return undefined; }).catch(() => {});
    st = await loadRoom(code) || probe;
  }
  if (st.owed && st.owed.length) settleOwed(code).catch(() => {});
  return publicState(st, now, actor);
}
async function listRooms() {
  const now = Date.now();
  return Promise.all(ROOM_IDS.map(async (id) => {
    const st = await loadRoom(id);
    let status = 'lobby', n = 0, night = false;
    if (st) {
      const probe = JSON.parse(JSON.stringify(st)); progress(probe, now);
      n = stayingKeys(probe).length; status = n ? probe.status : 'lobby';
      night = ['cupidon', 'voyante', 'loups', 'sorciere'].includes(probe.phase);
    }
    return { id, name: 'Salon ' + id, players: n, max: MAX_PLAYERS, status, night };
  }));
}

const livingTarget = (st, k) => !!st.players[k] && st.players[k].alive;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const raw = req.query && req.query.code;
      if (raw === undefined || raw === '') return res.status(200).json({ ok: true, rooms: await listRooms(), max: MAX_PLAYERS, min: MIN_PLAYERS, reward: REWARD, rewardMinPlayers: MIN_REWARD_PLAYERS, roleNames: ROLE_NAMES });
      const code = cleanCode(raw);
      if (!code) return fail(res, 404, 'Salon introuvable.');
      return res.status(200).json({ ok: true, state: await currentState(code, actorOf(req, {})) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    const action = body.action;
    const code = cleanCode(body.code);
    if (!code) return fail(res, 400, 'Salon invalide.');
    const account = await getRow(actor);
    if (!account) return fail(res, 404, 'Compte introuvable.');
    const avatar = cleanAvatar(body.avatar);
    const reply = async (extra) => {
      const state = await currentState(code, actor);
      const row = await getRowExact(account.username);
      return res.status(200).json({ ok: true, state, balance: row ? row.balance : undefined, ...(extra || {}) });
    };
    const name = (k) => k;                         // les clés des joueurs sont leurs pseudos de compte
    const keyOfName = (st, n) => Object.keys(st.players).find((k) => st.players[k].name === n) || '';

    if (action === 'join') {
      await ensureRoom(code);
      const wantSeat = Math.floor(Number(body.seat));
      await mutateRoom(code, (st, now) => {
        const p = st.players[actor];
        if (p) { p.left = false; p.gone = false; p.seen = now; p.avatar = avatar; if (!st.host) st.host = actor; st.updatedAt = now; return undefined; }
        if (st.status === 'playing') throw new GameError(409, 'Une partie est en cours dans ce salon, essaie un autre salon.');
        if (stayingKeys(st).length >= MAX_PLAYERS) throw new GameError(409, 'Ce salon est complet.');
        const used = new Set(Object.values(st.players).filter((q) => !q.left).map((q) => q.seat));
        let seat = Number.isFinite(wantSeat) && wantSeat >= 0 && wantSeat < MAX_PLAYERS && !used.has(wantSeat) ? wantSeat : freeSeat(st);
        if (seat < 0) throw new GameError(409, 'Ce salon est complet.');
        st.players[actor] = { name: account.username, avatar, seat, joinedAt: now, seen: now, left: false, alive: true, role: '' };
        if (!st.host) st.host = actor;
        st.updatedAt = now;
      });
      return reply();
    }

    if (action === 'config') {
      await mutateRoom(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, 'Seul le chef du salon peut changer les réglages.');
        if (st.status !== 'lobby') throw new GameError(409, 'La partie a déjà commencé.');
        if (body.auto) { st.cfg = { roles: autoRoles(Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, stayingKeys(st).length))), discMs: st.cfg.discMs }; }
        else st.cfg = sanitizeCfg({ roles: { ...st.cfg.roles, ...(body.roles || {}) }, discMs: body.discMs !== undefined ? body.discMs : st.cfg.discMs });
        st.updatedAt = now;
      });
      return reply();
    }

    if (action === 'start') {
      await mutateRoom(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, 'Seul le chef du salon peut lancer la partie.');
        if (st.status !== 'lobby') throw new GameError(409, 'La partie a déjà commencé.');
        Object.keys(st.players).forEach((k) => { if (!present(st.players[k], now) && k !== actor) delete st.players[k]; });
        const n = Object.keys(st.players).length;
        if (n < MIN_PLAYERS) throw new GameError(400, 'Il faut au moins ' + MIN_PLAYERS + ' joueurs.');
        if (totalRoles(st.cfg) !== n) throw new GameError(400, 'Il y a ' + n + ' joueurs mais ' + totalRoles(st.cfg) + ' rôles : ajuste les rôles (ou touche « Auto »).');
        if (st.cfg.roles.loup < 1) throw new GameError(400, 'Il faut au moins un Loup-Garou.');
        if (st.cfg.roles.loup >= n - st.cfg.roles.loup) throw new GameError(400, 'Il y a trop de loups pour ce nombre de joueurs.');
        startGame(st, now); st.updatedAt = now;
      });
      return reply();
    }

    if (action === 'leave') {
      await mutateRoom(code, (st, now) => {
        const p = st.players[actor];
        if (!p) return NOOP;
        if (st.status === 'playing') { p.seen = 0; }
        else delete st.players[actor];
        if (st.host === actor) pickHost(st);
        if (stayingKeys(st).length === 0) resetRoom(st, now);
        st.updatedAt = now;
      }).catch((e) => { if (!(e instanceof GameError)) throw e; });
      return res.status(200).json({ ok: true, left: true });
    }

    if (action === 'again') {
      await mutateRoom(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, "Seul le chef du salon peut relancer.");
        if (st.status !== 'finished') throw new GameError(409, "La partie n'est pas terminée.");
        Object.keys(st.players).forEach((k) => { if (st.players[k].left) delete st.players[k]; else Object.assign(st.players[k], { alive: true, role: '', idiotSpared: false, seenLog: [], knownWolves: [] }); });
        Object.assign(st, { status: 'lobby', phase: '', phaseStart: 0, phaseEnd: 0, night: 0, acts: {}, votes: {}, log: [], potions: { heal: true, kill: true }, lovers: [], victims: [], hunter: '', after: '', winner: '', winners: [], reward: false, finishedAt: 0, lastVoteResult: null, updatedAt: now });
      });
      return reply();
    }

    // ---- ACTIONS DE JEU ----
    if (['cupidon', 'see', 'wolfvote', 'spy', 'witch', 'shoot', 'vote'].includes(action)) {
      const out = await mutateRoom(code, (st, now) => {
        const p = st.players[actor];
        if (!p || p.left) throw new GameError(403, 'Tu n\'es pas dans ce salon.');
        if (st.status !== 'playing') throw new GameError(409, 'Pas de partie en cours.');
        p.seen = now;
        const tName = String(body.target == null ? '' : body.target);
        const tk = tName ? keyOfName(st, tName) : '';
        const a = st.acts;
        if (action === 'cupidon') {
          if (st.phase !== 'cupidon' || p.role !== 'cupidon' || !p.alive || a.cupidon) throw new GameError(409, 'Ce n\'est pas ton moment.');
          const names = Array.isArray(body.targets) ? body.targets.slice(0, 2) : [];
          const ks = names.map((n) => keyOfName(st, String(n)));
          if (ks.length !== 2 || ks[0] === ks[1] || !ks.every((k) => livingTarget(st, k))) throw new GameError(400, 'Choisis deux joueurs différents.');
          a.cupidon = ks; a.cupidonAt = now;
          return { ok: true };
        }
        if (action === 'see') {
          if (st.phase !== 'voyante' || p.role !== 'voyante' || !p.alive || a.voyante) throw new GameError(409, 'Ce n\'est pas ton moment.');
          if (!tk || !livingTarget(st, tk) || tk === actor) throw new GameError(400, 'Choisis un autre joueur en vie.');
          a.voyante = tk; a.voyanteAt = now;
          const entry = { night: st.night, name: st.players[tk].name, role: st.players[tk].role };
          p.seenLog = [...(p.seenLog || []), entry];
          return { seen: entry };
        }
        if (action === 'wolfvote') {
          if (st.phase !== 'loups' || p.role !== 'loup' || !p.alive) throw new GameError(409, 'Ce n\'est pas ton moment.');
          if (!tk || !livingTarget(st, tk) || isWolf(st, tk)) throw new GameError(400, 'Choisis un villageois en vie.');
          a.wolfVotes = a.wolfVotes || {}; a.wolfVotes[actor] = tk; a.wolfAt = now;
          return { ok: true };
        }
        if (action === 'spy') {
          if (st.phase !== 'loups' || p.role !== 'petitefille' || !p.alive) throw new GameError(409, 'Ce n\'est pas ton moment.');
          a.spyDone = a.spyDone || {};
          if (a.spyDone[actor]) throw new GameError(409, 'Tu as déjà espionné cette nuit.');
          a.spyDone[actor] = true;
          const wolves = aliveWith(st, 'loup');
          if (!wolves.length) return { spy: 'rien' };
          if (Math.random() < SPY_CAUGHT) { a.pfCaught = actor; return { spy: 'repere' }; }
          const w = pick(wolves);
          p.knownWolves = Array.from(new Set([...(p.knownWolves || []), st.players[w].name]));
          return { spy: 'ok', wolf: st.players[w].name };
        }
        if (action === 'witch') {
          if (st.phase !== 'sorciere' || p.role !== 'sorciere' || !p.alive || a.witchDone) throw new GameError(409, 'Ce n\'est pas ton moment.');
          if (body.heal) {
            if (!st.potions.heal) throw new GameError(400, 'Tu n\'as plus de potion de vie.');
            if (!a.victim) throw new GameError(400, 'Personne à sauver cette nuit.');
            a.witchHeal = true;
          }
          if (tk) {
            if (!st.potions.kill) throw new GameError(400, 'Tu n\'as plus de potion de poison.');
            if (!livingTarget(st, tk) || tk === actor) throw new GameError(400, 'Cible invalide.');
            a.witchKill = tk;
          }
          a.witchDone = true; a.witchAt = now;
          return { ok: true };
        }
        if (action === 'shoot') {
          if (st.phase !== 'chasseur' || st.hunter !== actor) throw new GameError(409, 'Ce n\'est pas ton moment.');
          if (a.shot !== null && a.shot !== undefined) throw new GameError(409, 'Déjà tiré.');
          if (tk && !livingTarget(st, tk)) throw new GameError(400, 'Cible invalide.');
          a.shot = tk; a.shotAt = now;
          return { ok: true };
        }
        if (action === 'vote') {
          if (st.phase !== 'vote' || !p.alive || p.idiotSpared) throw new GameError(409, 'Tu ne peux pas voter maintenant.');
          if (tk && (!livingTarget(st, tk) || tk === actor)) throw new GameError(400, 'Choisis un autre joueur en vie.');
          st.votes[actor] = tk; st.votesAt = now;
          return { ok: true };
        }
        return undefined;
      });
      const r = await reply(out && out !== NOOP ? out : {});
      return r;
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('loupgarou:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
export const __t = { startGame, freshState, T, kill };
