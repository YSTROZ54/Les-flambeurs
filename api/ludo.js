// Ludo (petits chevaux) multijoueur, 2 tables de 2 à 4 joueurs, entièrement géré par le serveur, SANS argent ni mise :
//  - le dé est tiré ici (jamais par le navigateur), les coups sont vérifiés et appliqués ici ;
//  - le chrono et l'ordre de jeu suivent l'horloge du serveur (un joueur absent ou trop lent est joué automatiquement).
// Une table = une ligne __ludo_table_<n> (invisible depuis le navigateur), modifiée avec contrôle de version comme le Blind Test.
//
// RÈGLES (petits chevaux classiques) :
//  - 4 couleurs, 4 pions chacune ; la couleur est celle de la chaise (0 rouge, 1 vert, 2 jaune, 3 bleu, dans le sens des aiguilles d'une montre).
//  - Un pion sort de l'écurie sur un 6 OU sur un 1 et se pose sur la case de départ de sa couleur. Tant qu'on n'a aucun pion en jeu, on a 3 essais par tour.
//    Si un de nos pions est déjà sur la case de départ, on ne peut pas en sortir un autre (on joue les pions libres). Un pion qui sort mange l'adversaire
//    qui se trouve sur notre case de départ.
//  - Un 6 fait rejouer, manger un pion fait rejouer aussi, et rentrer un pion à la maison aussi ; trois 6 d'affilée font perdre le tour (le troisième coup n'est pas joué).
//  - On avance d'exactement la valeur du dé. Après un tour complet (51 cases), le pion monte son escalier de 5 cases puis rejoint la case
//    centrale ; il faut le nombre EXACT pour y arriver (sinon le pion ne peut pas bouger).
//  - Un pion qui s'arrête sur un adversaire le renvoie à l'écurie, sauf sur une case protégée (les 4 cases de départ et les 4 étoiles).
//  - Un pion qui n'a pas encore quitté sa case de départ ne peut pas être mangé, et on ne peut pas s'arrêter sur lui : un pas de 1 juste derrière lui
//    est donc impossible (on joue un autre pion, ou on passe) ; avec un pas plus grand, on le saute simplement.
//  - Plusieurs pions de la même couleur peuvent partager une case.
//  - Un joueur qui a rentré ses 4 pions a fini : la partie continue pour les autres, et s'arrête quand tous sauf un ont fini
//    (2 joueurs : 1 a fini ; 3 joueurs : 2 ont fini ; 4 joueurs : 3 ont fini). Le premier à finir est le gagnant.
import { randomInt, randomBytes } from 'node:crypto';
import { actorOf } from './_auth.js';
import { getRow, getRowExact, putRow, updateAccount, GameError } from './_store.js';

const PREFIX = '__ludo_table_';
const NOOP = Symbol('noop');
export const TABLE_IDS = ['1', '2'];
export const MIN_PLAYERS = 2;
export const GONE_MS = 45000;
export const SEEN_REFRESH_MS = 20000;
export const ROLL_MS = 25000;        // temps pour lancer le dé
export const MOVE_MS = 25000;        // temps pour choisir un pion
export const AUTO_MS = 1100;         // un joueur parti est joué automatiquement après ce délai
export const SINGLE_MS = 1500;       // un seul coup possible : joué tout seul après l'animation du dé
export const COLORS = ['rouge', 'vert', 'jaune', 'bleu'];
export const START = [0, 13, 26, 39];                     // case de départ de chaque couleur sur la boucle de 52 cases
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];       // cases protégées
export const HOME = 56;                                    // progression d'un pion arrivé (0..50 : boucle, 51..55 : escalier, 56 : arrivée)

const rowName = (code) => PREFIX + code;
const cleanCode = (c) => { const s = String(c == null ? '' : c).trim(); return TABLE_IDS.includes(s) ? s : ''; };
const cleanAvatar = (a) => (typeof a === 'string' && a.length > 0 && a.length <= 12 ? a : '🧑‍🎤');
const fail = (res, code, error, extra) => res.status(code).json({ ok: false, error, ...(extra || {}) });

function freshState(code, now) {
  return {
    code, id: randomBytes(6).toString('hex'), status: 'lobby', host: '', created: now, updatedAt: now,
    players: {},                                   // clé = pseudo en minuscules : { name, avatar, color, joinedAt, seen, left }
    pawns: [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],   // -1 écurie, 0..55 en jeu, 56 arrivé
    turn: -1, phase: '', phaseStart: 0, phaseEnd: 0, dice: 0, rollAt: 0, sixes: 0, tries: 0, legal: [], last: null, winner: -1, rank: [], done: [], log: [], moves: 0
  };
}
function resetTable(st, now) { Object.assign(st, freshState(st.code, now)); }

const present = (p, now) => !!p && !p.left && now - (p.seen || 0) <= GONE_MS;
const stayingKeys = (st) => Object.keys(st.players).filter((k) => !st.players[k].left);
const colorKey = (st, c) => Object.keys(st.players).find((k) => st.players[k].color === c) || '';
const colorsInGame = (st) => [0, 1, 2, 3].filter((c) => colorKey(st, c));
function say(st, text) { st.log.push({ t: text }); if (st.log.length > 30) st.log.shift(); }
function pickHost(st) {
  const ks = stayingKeys(st).sort((a, b) => st.players[a].joinedAt - st.players[b].joinedAt);
  st.host = ks[0] || '';
}

/* ------------------------------ règles ------------------------------ */
// case de la boucle (0..51) d'un pion de progression p (0..50), sinon -1
export const loopIndex = (c, p) => (p >= 0 && p <= 50 ? (START[c] + p) % 52 : -1);

// un pion peut sortir de l'écurie avec un 6 ou un 1, si la case de départ n'est pas déjà prise par un de nos pions
export const exitDice = (dice) => dice === 6 || dice === 1;
export const canExit = (st, c, dice) => exitDice(dice) && !st.pawns[c].some((p) => p === 0);

// coups possibles pour la couleur c avec ce dé : liste de numéros de pions
export function legalMoves(st, c, dice) {
  const out = [];
  st.pawns[c].forEach((p, i) => {
    if (p === HOME) return;
    if (p === -1) { if (canExit(st, c, dice)) out.push(i); return; }
    if (p + dice <= HOME && !landsOnGuarded(st, c, p + dice)) out.push(i);
  });
  return out;
}
// la case d'arrivée est-elle la case de départ d'un adversaire dont le pion n'a pas encore bougé ? (alors on ne peut pas s'y arrêter)
export function landsOnGuarded(st, c, to) {
  const idx = loopIndex(c, to);
  if (idx < 0) return false;
  return [0, 1, 2, 3].some((o) => o !== c && START[o] === idx && st.pawns[o].some((q) => q === 0));
}

// applique le coup ; renvoie { from, to, captured:[{c,i}] }
function applyMove(st, c, i, dice) {
  const from = st.pawns[c][i];
  const to = from === -1 ? 0 : from + dice;
  st.pawns[c][i] = to;
  const captured = [];
  const idx = loopIndex(c, to);
  if (idx >= 0 && (!SAFE.includes(idx) || from === -1)) {      // en sortant, on mange celui qui est sur notre case de départ (même protégée)
    for (let o = 0; o < 4; o++) {
      if (o === c) continue;
      st.pawns[o].forEach((q, j) => { if (q >= 0 && q <= 50 && loopIndex(o, q) === idx) { st.pawns[o][j] = -1; captured.push({ c: o, i: j }); } });
    }
  }
  return { from, to, captured };
}

// choix automatique (joueur absent ou trop lent) : arriver > capturer > sortir > faire avancer le pion le plus avancé
function botChoice(st, c, legal, dice) {
  let best = legal[0], bestScore = -1;
  legal.forEach((i) => {
    const p = st.pawns[c][i], to = p === -1 ? 0 : p + dice, idx = loopIndex(c, to);
    let s = to;
    if (to === HOME) s += 1000;
    else if (p === -1 && [0, 1, 2, 3].some((o) => o !== c && st.pawns[o].some((q) => q === (START[c] - START[o] + 52) % 52))) s += 500;
    else if (idx >= 0 && !SAFE.includes(idx) && [0, 1, 2, 3].some((o) => o !== c && st.pawns[o].some((q) => q >= 0 && q <= 50 && loopIndex(o, q) === idx))) s += 500;
    else if (p === -1) s += 300;
    else if (idx >= 0 && SAFE.includes(idx)) s += 100;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

function nextTurnColor(st, from) {
  const cs = colorsInGame(st).filter((c) => !(st.done || []).includes(c));      // ceux qui ont fini ne jouent plus
  for (let k = 1; k <= 4; k++) { const c = (from + k) % 4; if (cs.includes(c)) return c; }
  return from;
}
function setPhase(st, phase, at, dur) { st.phase = phase; st.phaseStart = at; st.phaseEnd = at + dur; }
function startTurn(st, c, at) { st.turn = c; st.sixes = 0; st.tries = 0; st.legal = []; st.dice = 0; setPhase(st, 'roll', at, ROLL_MS); }

function startGame(st, now) {
  st.pawns = [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
  st.status = 'playing'; st.winner = -1; st.rank = []; st.done = []; st.last = null; st.log = []; st.moves = 0; st.id = randomBytes(6).toString('hex');
  const cs = colorsInGame(st);
  startTurn(st, cs[randomInt(0, cs.length)], now);
  say(st, 'La partie commence ! Il faut un 6 ou un 1 pour sortir un pion.');
}

function finishGame(st, c, at) {
  st.status = 'finished'; st.winner = c; st.phase = ''; st.phaseEnd = 0;
  const done = st.done || [], homeOf = (o) => st.pawns[o].filter((p) => p === HOME).length;
  st.rank = done.map((o) => ({ c: o, home: 4 })).concat(colorsInGame(st).filter((o) => !done.includes(o)).map((o) => ({ c: o, home: homeOf(o) })).sort((a, b) => b.home - a.home));
  say(st, (st.players[colorKey(st, c)] || {}).name + ' (' + COLORS[c] + ') gagne la partie !');
}

// lance le dé pour la couleur dont c'est le tour
function doRoll(st, at) {
  const c = st.turn, dice = randomInt(1, 7);
  st.dice = dice; st.rollAt = at; st.last = null;
  st.sixes = dice === 6 ? st.sixes + 1 : 0;
  const nm = (st.players[colorKey(st, c)] || {}).name || COLORS[c];
  if (st.sixes >= 3) { say(st, nm + ' fait trois 6 de suite : son tour est perdu.'); startTurn(st, nextTurnColor(st, c), at + 1400); return; }
  const legal = legalMoves(st, c, dice);
  if (!legal.length) {
    const onBoard = st.pawns[c].some((p) => p >= 0 && p < HOME);
    if (!onBoard && st.pawns[c].some((p) => p === -1) && !exitDice(dice)) {     // aucun pion en jeu : trois essais pour sortir un 6 ou un 1
      st.tries += 1;
      if (st.tries < 3) { st.legal = []; setPhase(st, 'roll', at + 1400, ROLL_MS); say(st, nm + ' n\'a ni 6 ni 1 (essai ' + st.tries + '/3).'); return; }
    }
    say(st, nm + ' fait ' + dice + ' : aucun pion ne peut jouer.');
    startTurn(st, nextTurnColor(st, c), at + 1400); return;
  }
  st.legal = legal;
  setPhase(st, 'move', at + 1000, legal.length === 1 ? SINGLE_MS : MOVE_MS);
}

function doMove(st, i, at) {
  const c = st.turn, dice = st.dice;
  const r = applyMove(st, c, i, dice);
  st.moves += 1;
  st.last = { c, i, from: r.from, to: r.to, captured: r.captured, at, dice };
  const nm = (st.players[colorKey(st, c)] || {}).name || COLORS[c];
  if (r.to === HOME) say(st, nm + ' rentre un pion à la maison !');
  r.captured.forEach((k) => say(st, nm + ' renvoie un pion ' + COLORS[k.c] + ' à l\'écurie !'));
  st.legal = [];
  if (st.pawns[c].every((p) => p === HOME)) {                                   // ce joueur a fini : il ne joue plus, les autres continuent
    if (!st.done) st.done = [];
    st.done.push(c); say(st, nm + ' a rentré ses 4 pions : ' + (st.done.length === 1 ? '1er' : st.done.length + 'e') + ' !');
    if (st.done.length >= colorsInGame(st).length - 1) { finishGame(st, st.done[0], at); return; }
    startTurn(st, nextTurnColor(st, c), at + 900); return;
  }
  if (dice === 6 || r.captured.length || r.to === HOME) { st.dice = 0; setPhase(st, 'roll', at + 900, ROLL_MS); st.tries = 0; return; }   // un 6, une capture ou un pion rentré à la maison font rejouer (st.sixes reste compté)
  startTurn(st, nextTurnColor(st, c), at + 900);
}

// fait avancer la table avec l'horloge ; renvoie true si quelque chose a changé
export function progress(st, now) {
  let changed = false;
  for (const k of Object.keys(st.players)) {
    const p = st.players[k];
    if (now - (p.seen || 0) <= GONE_MS) continue;
    if (st.status === 'playing') { if (!p.left) { p.left = true; p.gone = true; changed = true; say(st, p.name + ' a quitté la table : un robot joue à sa place.'); } }
    else if (!p.left) { delete st.players[k]; changed = true; }
  }
  if (stayingKeys(st).length === 0 && (st.status !== 'lobby' || st.host)) { resetTable(st, now); return true; }
  if (st.host && !(st.players[st.host] && !st.players[st.host].left)) { pickHost(st); changed = true; }
  if (st.status !== 'playing') return changed;
  // plus qu'un seul joueur présent : la partie s'arrête et le dernier joueur gagne
  if (stayingKeys(st).length <= 1 && colorsInGame(st).length > 1) {
    const last = stayingKeys(st)[0];
    if (last) { finishGame(st, st.players[last].color, now); return true; }
  }
  for (let guard = 0; guard < 40 && st.status === 'playing'; guard++) {
    const owner = st.players[colorKey(st, st.turn)];
    const away = !owner || owner.left;
    const dueAt = away ? Math.min(st.phaseEnd, st.phaseStart + AUTO_MS) : st.phaseEnd;
    if (now < dueAt) break;
    if (st.phase === 'roll') doRoll(st, dueAt);
    else if (st.phase === 'move') doMove(st, botChoice(st, st.turn, st.legal, st.dice), dueAt);
    else break;
    changed = true;
  }
  return changed;
}

/* ------------------------------ ce que voit chaque navigateur ------------------------------ */
export function publicState(st, now, actor) {
  const me = actor && st.players[actor];
  const out = {
    code: st.code, name: 'Table ' + st.code, id: st.id, status: st.status, serverNow: now, min: MIN_PLAYERS, colors: COLORS,
    host: st.host, hostName: st.players[st.host] ? st.players[st.host].name : '', turn: st.turn, phase: st.phase, phaseStart: st.phaseStart, phaseEnd: st.phaseEnd,
    dice: st.dice, rollAt: st.rollAt, pawns: st.pawns, last: st.last, winner: st.winner, rank: st.rank, done: st.done || [], log: st.log.slice(-8), moves: st.moves, updatedAt: st.updatedAt,
    players: Object.keys(st.players).map((k) => { const p = st.players[k]; return { name: p.name, avatar: p.avatar, color: p.color, left: !!p.left, host: k === st.host, me: k === actor }; }).sort((a, b) => a.color - b.color)
  };
  if (me) {
    const mine = st.status === 'playing' && st.turn === me.color && !me.left;
    out.you = { name: me.name, color: me.color, host: actor === st.host, canRoll: mine && st.phase === 'roll', canMove: mine && st.phase === 'move', legal: mine && st.phase === 'move' ? st.legal : [] };
  }
  return out;
}

/* ------------------------------ stockage et API ------------------------------ */
async function loadTable(code) {
  const row = await getRowExact(rowName(code));
  return row && row.data && row.data.ludo ? row.data.ludo : null;
}
async function ensureTable(code) {
  if (await loadTable(code)) return;
  await putRow({ username: rowName(code), password: 'sys', avatar: '🎲', balance: 0, data: { ludo: freshState(code, Date.now()) } });
}
async function mutateTable(code, mutate) {
  try {
    const { result } = await updateAccount(rowName(code), (d) => {
      const st = d.data && d.data.ludo;
      if (!st) throw new GameError(404, 'Table introuvable.');
      const now = Date.now();
      progress(st, now);
      const out = mutate(st, now);
      if (out === NOOP) throw new GameError(0, 'noop');
      d.data.ludo = st;
      return out;
    });
    return result;
  } catch (e) {
    if (e instanceof GameError && e.code === 0) return NOOP;
    throw e;
  }
}
async function currentState(code, actor) {
  let st = await loadTable(code);
  const now = Date.now();
  if (!st) return publicState(freshState(code, now), now, actor);
  const probe = JSON.parse(JSON.stringify(st));
  const me = actor && probe.players[actor];
  const stale = me && now - (me.seen || 0) > SEEN_REFRESH_MS;
  if (progress(probe, now) || stale) {
    await mutateTable(code, (s, n) => { const p = s.players[actor]; if (p) { p.seen = n; if (p.gone) { p.left = false; p.gone = false; } } return undefined; }).catch(() => {});
    st = await loadTable(code) || probe;
  }
  return publicState(st, now, actor);
}
async function listTables() {
  const now = Date.now();
  return Promise.all(TABLE_IDS.map(async (id) => {
    const st = await loadTable(id);
    let status = 'lobby', n = 0, colors = [];
    if (st) {
      const probe = JSON.parse(JSON.stringify(st)); progress(probe, now);
      n = stayingKeys(probe).length; status = n ? probe.status : 'lobby';
      colors = stayingKeys(probe).map((k) => probe.players[k].color);
    }
    return { id, name: 'Table ' + id, players: n, max: 4, status, colors };
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const raw = req.query && req.query.code;
      if (raw === undefined || raw === '') return res.status(200).json({ ok: true, tables: await listTables(), min: MIN_PLAYERS, colors: COLORS });
      const code = cleanCode(raw);
      if (!code) return fail(res, 404, 'Table introuvable.');
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
    if (!code) return fail(res, 400, 'Table invalide.');
    const account = await getRow(actor);
    if (!account) return fail(res, 404, 'Compte introuvable.');
    const reply = async (extra) => res.status(200).json({ ok: true, state: await currentState(code, actor), ...(extra || {}) });

    if (action === 'join') {
      await ensureTable(code);
      const want = Math.floor(Number(body.seat));
      await mutateTable(code, (st, now) => {
        const p = st.players[actor];
        if (p) { p.left = false; p.gone = false; p.seen = now; p.avatar = cleanAvatar(body.avatar); if (!st.host) st.host = actor; st.updatedAt = now; return undefined; }
        if (st.status === 'playing') throw new GameError(409, 'Une partie est en cours à cette table, essaie l\'autre table.');
        const used = new Set(Object.values(st.players).filter((q) => !q.left).map((q) => q.color));
        let color = want >= 0 && want < 4 && !used.has(want) ? want : [0, 1, 2, 3].find((c) => !used.has(c));
        if (color === undefined) throw new GameError(409, 'Cette table est complète.');
        if (want >= 0 && want < 4 && used.has(want)) throw new GameError(409, 'Cette place est prise.');
        st.players[actor] = { name: account.username, avatar: cleanAvatar(body.avatar), color, joinedAt: now, seen: now, left: false };
        if (!st.host) st.host = actor;
        st.updatedAt = now;
      });
      return reply();
    }

    if (action === 'start') {
      await mutateTable(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, 'Seul le chef de la table peut lancer la partie.');
        if (st.status !== 'lobby') throw new GameError(409, 'La partie a déjà commencé.');
        Object.keys(st.players).forEach((k) => { if (!present(st.players[k], now) && k !== actor) delete st.players[k]; });
        if (colorsInGame(st).length < MIN_PLAYERS) throw new GameError(400, 'Il faut au moins ' + MIN_PLAYERS + ' joueurs.');
        startGame(st, now); st.updatedAt = now;
      });
      return reply();
    }

    if (action === 'roll') {
      await mutateTable(code, (st, now) => {
        const p = st.players[actor];
        if (!p || p.left) throw new GameError(403, 'Tu n\'es pas à cette table.');
        if (st.status !== 'playing' || st.phase !== 'roll' || st.turn !== p.color) throw new GameError(409, 'Ce n\'est pas ton tour de lancer le dé.');
        if (now < st.phaseStart) throw new GameError(409, 'Un instant…');
        p.seen = now; doRoll(st, now); st.updatedAt = now;
      });
      return reply();
    }

    if (action === 'move') {
      const i = Math.floor(Number(body.pawn));
      await mutateTable(code, (st, now) => {
        const p = st.players[actor];
        if (!p || p.left) throw new GameError(403, 'Tu n\'es pas à cette table.');
        if (st.status !== 'playing' || st.phase !== 'move' || st.turn !== p.color) throw new GameError(409, 'Ce n\'est pas ton tour de jouer un pion.');
        if (!st.legal.includes(i)) throw new GameError(400, 'Ce pion ne peut pas jouer avec ce dé.');
        p.seen = now; doMove(st, i, Math.max(now, st.phaseStart)); st.updatedAt = now;
      });
      return reply();
    }

    if (action === 'leave') {
      await mutateTable(code, (st, now) => {
        const p = st.players[actor];
        if (!p) return NOOP;
        if (st.status === 'playing') { p.left = true; p.gone = false; p.seen = now; say(st, p.name + ' a quitté la table : un robot joue à sa place.'); }
        else delete st.players[actor];
        if (st.host === actor) pickHost(st);
        if (stayingKeys(st).length === 0) resetTable(st, now);
        st.updatedAt = now;
      }).catch((e) => { if (!(e instanceof GameError)) throw e; });
      return res.status(200).json({ ok: true, left: true });
    }

    if (action === 'again') {
      await mutateTable(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, 'Seul le chef de la table peut relancer.');
        if (st.status !== 'finished') throw new GameError(409, 'La partie n\'est pas terminée.');
        Object.keys(st.players).forEach((k) => { if (st.players[k].left) delete st.players[k]; });
        Object.assign(st, { status: 'lobby', turn: -1, phase: '', phaseStart: 0, phaseEnd: 0, dice: 0, legal: [], last: null, winner: -1, rank: [], done: [], log: [], moves: 0, updatedAt: now });
        st.pawns = [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
      });
      return reply();
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('ludo:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}

export const __t = { freshState, startGame, doRoll, doMove, applyMove, legalMoves, botChoice, canExit, landsOnGuarded };
