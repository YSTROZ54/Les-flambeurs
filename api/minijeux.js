// UNO et Puissance 4 (salles 3D des mini jeux), entièrement gérés par le serveur, SANS argent ni mise :
//  - les cartes sont mélangées et distribuées ICI ; chacun ne reçoit que SA main (les autres n'ont que le nombre de cartes de chaque joueur, jamais leur contenu) ;
//  - chaque coup est vérifié ici avec les règles de api/_minijeuxRules.js (copie des règles du navigateur, voir scripts/sync-minijeux-regles.mjs) ;
//  - le serveur fait avancer la partie tout seul : un joueur absent est retiré de la table, la pioche se termine après un court délai, et un joueur trop lent
//    (60 s) est joué automatiquement.
// Une salle = une ligne __mj_room_uno (4 tables u0..u3) ou __mj_room_c4 (6 tables c0..c5), modifiée avec contrôle de version comme le Ludo.
// Chaque table garde le même état que celui qu'utilisait le navigateur (ver, org, ph, seats, hands, disc, turn…), plus des champs privés qui
// commencent par « _ » (présence des joueurs, minuteurs) et ne sont jamais envoyés.
import { actorOf } from './_auth.js';
import { getRow, getRowExact, putRow, updateAccount, GameError } from './_store.js';
import MJ from './_minijeuxRules.js';

const PREFIX = '__mj_room_';
const NOOP = Symbol('noop');
export const ROOMS = {
  uno: { kind: 'u', ids: ['u0', 'u1', 'u2', 'u3'], seats: 4 },
  c4: { kind: 'c', ids: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'], seats: 2 }
};
export const GONE_MS = 40000;        // un joueur qui n'a plus donné de nouvelles est retiré de sa table
export const SEEN_REFRESH_MS = 8000; // on ne réécrit la présence que de temps en temps
export const ADVANCE_MS = 1900;      // temps laissé aux cartes piochées pour arriver avant de passer au joueur suivant
export const TURN_MS = 60000;        // un joueur trop lent est joué automatiquement

const fail = (res, code, error, extra) => res.status(code).json({ ok: false, error, ...(extra || {}) });
const clone = (o) => JSON.parse(JSON.stringify(o));
const roomOf = (tid) => Object.keys(ROOMS).find((r) => ROOMS[r].ids.includes(tid)) || '';
const cleanRoom = (r) => (ROOMS[String(r)] ? String(r) : '');

function freshTable(kind) { const st = kind === 'u' ? MJ.unoNew() : MJ.c4New(); st._seen = {}; st._waitAt = 0; st._turnAt = 0; st._turnKey = ''; return st; }
function freshRoom(room) { const t = {}; ROOMS[room].ids.forEach((id) => { t[id] = freshTable(ROOMS[room].kind); }); return { tables: t }; }
const seatOf = (st, actor) => (actor ? Object.keys(st.seats).find((n) => st.seats[n] && st.seats[n].k === actor) : undefined);
function bump(st, org) { st.ver = (st.ver | 0) + 1; st.org = org || 'serveur'; }

/* ------------------------------ le serveur fait avancer la partie ------------------------------ */
// renvoie true si quelque chose a changé
function progressTable(st, kind, now) {
  let changed = false;
  st._seen = st._seen || {};
  // les joueurs absents quittent la table
  Object.keys(st.seats).forEach((n) => {
    if (st._seen[n] === undefined) st._seen[n] = now;
    if (now - st._seen[n] > GONE_MS) {
      (kind === 'u' ? MJ.unoLeave : MJ.c4Leave)(st, +n); delete st._seen[n]; bump(st); changed = true;
    }
  });
  if (st.ph !== 'play') { st._turnKey = ''; st._waitAt = 0; return changed; }
  if (kind === 'u') {
    const key = [st.turn, st.disc.length, st.pend | 0, st.drawn, st.wait].join('|');
    if (key !== st._turnKey) { st._turnKey = key; st._turnAt = now; }
    if (st.wait >= 0) {
      if (!st._waitAt) st._waitAt = now;
      if (now - st._waitAt >= ADVANCE_MS) { MJ.unoAdvance(st); st._waitAt = 0; bump(st); changed = true; }
    } else {
      st._waitAt = 0;
      if (st.turn >= 0 && st.hands[st.turn] && now - st._turnAt > TURN_MS) {      // trop lent : on pioche (ou on passe) à sa place
        if (st.drawn) MJ.unoPass(st, st.turn); else { MJ.unoDrawTurn(st, st.turn); if (st.drawn) MJ.unoPass(st, st.turn); }
        bump(st); changed = true;
      }
    }
  } else {
    const key = String(st.g.reduce((a, c) => a + c.length, 0)) + '|' + st.turn;
    if (key !== st._turnKey) { st._turnKey = key; st._turnAt = now; }
    if (now - st._turnAt > TURN_MS) {
      const free = st.g.map((c, i) => (c.length < 6 ? i : -1)).filter((i) => i >= 0);
      if (free.length) { MJ.c4Drop(st, st.turn, free[Math.floor(Math.random() * free.length)]); bump(st); changed = true; }
    }
  }
  return changed;
}
function progressRoom(room, data, now) {
  let changed = false;
  ROOMS[room].ids.forEach((id) => { if (data.tables[id] && progressTable(data.tables[id], ROOMS[room].kind, now)) changed = true; });
  return changed;
}
// après une action : mémorise le minuteur du coup suivant
function track(st, kind, now) {
  if (kind === 'u') {
    st._turnKey = [st.turn, st.disc.length, st.pend | 0, st.drawn, st.wait].join('|'); st._turnAt = now; st._waitAt = st.wait >= 0 ? now : 0;
  } else { st._turnKey = String(st.g.reduce((a, c) => a + c.length, 0)) + '|' + st.turn; st._turnAt = now; }
}

/* ------------------------------ ce que voit chaque navigateur ------------------------------ */
// même forme que l'ancien état partagé, mais les mains des autres sont remplacées par des cartes neutres (seul le nombre compte) et la pioche est vide
export function viewOf(st, kind, actor) {
  const v = {};
  Object.keys(st).forEach((k) => { if (k.charAt(0) !== '_') v[k] = st[k]; });
  v.seats = clone(st.seats);
  if (kind === 'u') {
    const mine = seatOf(st, actor);
    v.hands = {};
    Object.keys(st.hands || {}).forEach((n) => { v.hands[n] = n === mine ? st.hands[n].slice() : st.hands[n].map(() => '00'); });
    v.deck = [];
    if (String(st.turn) !== mine) v.drawn = '';         // la carte qu'on vient de piocher n'est connue que de celui qui joue
  } else v.g = clone(st.g);
  return v;
}
function viewRoom(room, data, actor, now) {
  const out = {};
  ROOMS[room].ids.forEach((id) => { out[id] = viewOf(data.tables[id], ROOMS[room].kind, actor); });
  return { tables: out, serverNow: now };
}

/* ------------------------------ stockage ------------------------------ */
async function loadRoom(room) {
  const row = await getRowExact(PREFIX + room);
  return row && row.data && row.data.mj ? row.data.mj : null;
}
async function ensureRoom(room) {
  if (await loadRoom(room)) return;
  await putRow({ username: PREFIX + room, password: 'sys', avatar: '🃏', balance: 0, data: { mj: freshRoom(room) } });
}
async function mutateRoom(room, mutate) {
  try {
    const { result } = await updateAccount(PREFIX + room, (d) => {
      const data = d.data && d.data.mj;
      if (!data) throw new GameError(404, 'Salle introuvable.');
      ROOMS[room].ids.forEach((id) => { if (!data.tables[id]) data.tables[id] = freshTable(ROOMS[room].kind); });
      const now = Date.now();
      progressRoom(room, data, now);
      const out = mutate(data, now);
      if (out === NOOP) throw new GameError(0, 'noop');
      d.data.mj = data;
      return out;
    });
    return result;
  } catch (e) {
    if (e instanceof GameError && e.code === 0) return NOOP;
    throw e;
  }
}
async function currentRoom(room, actor) {
  let data = await loadRoom(room);
  const now = Date.now();
  if (!data) data = freshRoom(room);
  const probe = clone(data);
  let stale = false;
  ROOMS[room].ids.forEach((id) => {
    const st = probe.tables[id]; const n = st && seatOf(st, actor);
    if (n !== undefined && now - ((st._seen || {})[n] || 0) > SEEN_REFRESH_MS) stale = true;
  });
  if (progressRoom(room, probe, now) || stale) {
    await mutateRoom(room, (d, nw) => {
      ROOMS[room].ids.forEach((id) => { const st = d.tables[id], n = st && seatOf(st, actor); if (n !== undefined) st._seen[n] = nw; });
      return undefined;
    }).catch(() => {});
    data = (await loadRoom(room)) || probe;
  }
  return viewRoom(room, data, actor, now);
}

/* ------------------------------ les actions ------------------------------ */
function doAction(st, kind, actor, name, body, now) {
  const action = body.action, seat = seatOf(st, actor);
  const L = kind === 'u';
  if (action === 'join') {
    const want = Math.floor(Number(body.seat));
    if (!(want >= 0 && want < (L ? 4 : 2))) throw new GameError(400, 'Place invalide.');
    if (seat !== undefined && +seat !== want) { (L ? MJ.unoLeave : MJ.c4Leave)(st, +seat); delete st._seen[seat]; }
    const err = (L ? MJ.unoJoin : MJ.c4Join)(st, want, actor, name);
    if (err) throw new GameError(409, err);
    st._seen[want] = now; bump(st, actor); return;
  }
  if (action === 'leave') {
    if (seat === undefined) return NOOP;
    (L ? MJ.unoLeave : MJ.c4Leave)(st, +seat); delete st._seen[seat]; bump(st, actor); track(st, kind, now); return;
  }
  if (seat === undefined) throw new GameError(403, 'Tu n\'es pas assis à cette table.');
  st._seen[seat] = now;
  let err = '';
  if (action === 'ping') return undefined;
  if (action === 'start') {
    if (L && Object.keys(st.seats).length < 2) throw new GameError(400, 'Il faut au moins 2 joueurs.');
    err = L ? MJ.unoStart(st) : MJ.c4Start(st);
  } else if (L && action === 'play') {
    const idx = Math.floor(Number(body.idx)), color = body.color === undefined ? -1 : Math.floor(Number(body.color));
    err = MJ.unoPlay(st, +seat, idx, color);
  } else if (L && action === 'draw') err = MJ.unoDrawTurn(st, +seat);
  else if (L && action === 'pass') err = MJ.unoPass(st, +seat);
  else if (L && action === 'uno') err = MJ.unoSayUno(st, +seat);
  else if (L && action === 'counter') err = MJ.unoCounter(st, +seat);
  else if (!L && action === 'drop') err = MJ.c4Drop(st, +seat, Math.floor(Number(body.col)));
  else throw new GameError(400, 'Action inconnue.');
  if (err) throw new GameError(400, err);
  bump(st, actor); track(st, kind, now);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const room = cleanRoom(req.query && req.query.room);
      if (!room) return fail(res, 404, 'Salle introuvable.');
      await ensureRoom(room);
      return res.status(200).json({ ok: true, ...(await currentRoom(room, actorOf(req, {}))) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};
    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    const tid = String(body.tid || ''), room = roomOf(tid);
    if (!room) return fail(res, 400, 'Table invalide.');
    let name = '';
    if (body.action === 'join') { const account = await getRow(actor); if (!account) return fail(res, 404, 'Compte introuvable.'); name = String(account.username).slice(0, 20); }
    await ensureRoom(room);
    await mutateRoom(room, (data, now) => doAction(data.tables[tid], ROOMS[room].kind, actor, name, body, now));
    const data = await loadRoom(room);
    return res.status(200).json({ ok: true, ...viewRoom(room, data || freshRoom(room), actor, Date.now()) });
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('minijeux:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}

export const __t = { freshTable, freshRoom, doAction, progressTable, viewOf };
