// Salle des machines à sous partagée : qui est présent, où, sur quelle borne, et ce qu'il vient de tirer.
// Purement visuel : aucun solde ni gain n'est touché ici (les tirages restent gérés par api/accounts.js).
// L'état est dans la ligne __slots_room__ (écriture « si personne n'a modifié entre-temps », comme le Crash).
import { actorOf } from './_auth.js';
import { getRowExact, putRow, updateAccount, GameError } from './_store.js';

const ROW = '__slots_room__';
export const SEATS = 6;
export const TTL_MS = 7000;            // sans signe de vie depuis 7 s : le joueur a quitté la salle
const SYMS = ['🔥', '👑', '7️⃣', '💎', '🔔', '🍋', '🍒'];

const num = (v, min, max, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, max) : '');

function prune(room, now) {
  Object.keys(room.players).forEach((k) => { if (!room.players[k] || now - (room.players[k].ts || 0) > TTL_MS) delete room.players[k]; });
}

export function publicRoom(room, now) {
  const players = {};
  Object.keys(room.players || {}).forEach((k) => {
    const p = room.players[k];
    if (!p || now - p.ts > TTL_MS) return;
    players[k] = { name: p.name, avatar: p.avatar, x: p.x, z: p.z, yaw: p.yaw, seat: p.seat, fx: p.fx || null };
  });
  return { serverNow: now, players };
}

async function ensureRow() {
  const r = await getRowExact(ROW);
  if (!r || !r.data || !r.data.room) await putRow({ username: ROW, password: 'sys', avatar: '🎰', balance: 0, data: { room: { players: {} } } });
}

async function mutate(fn) {
  await ensureRow();
  const { result } = await updateAccount(ROW, (d) => {
    const room = d.data.room && typeof d.data.room === 'object' ? d.data.room : { players: {} };
    if (!room.players || typeof room.players !== 'object') room.players = {};
    const now = Date.now();
    prune(room, now);
    const out = fn(room, now);
    d.data.room = room;
    return { out, pub: publicRoom(room, now) };
  });
  return result;
}

const fail = (res, code, error, extra) => res.status(code).json({ ok: false, error, ...(extra || {}) });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const r = await getRowExact(ROW);
      const room = r && r.data && r.data.room ? r.data.room : { players: {} };
      return res.status(200).json({ ok: true, ...publicRoom(room, Date.now()) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    const action = body.action;

    const mine = (room, now) => {
      const p = room.players[actor] || { seat: -1, x: 0, z: 10, yaw: 0, fx: null };
      p.ts = now;
      p.name = str(body.name, 20) || p.name || actor;
      if (p.name.toLowerCase() !== actor) p.name = actor;      // le nom affiché ne peut être que le sien
      p.avatar = str(body.avatar, 12) || p.avatar || '🧑';
      room.players[actor] = p;
      return p;
    };

    if (action === 'presence') {
      const r = await mutate((room, now) => {
        const p = mine(room, now);
        p.x = num(body.x, -10, 10, p.x); p.z = num(body.z, -4, 12, p.z); p.yaw = num(body.yaw, -100, 100, p.yaw);
        return { seat: p.seat };
      });
      return res.status(200).json({ ok: true, seat: r.out.seat, ...r.pub });
    }

    if (action === 'sit') {
      const seat = Math.floor(Number(body.seat));
      if (!(seat >= 0 && seat < SEATS)) return fail(res, 400, 'Borne inconnue.');
      const r = await mutate((room, now) => {
        const other = Object.keys(room.players).find((k) => k !== actor && room.players[k].seat === seat);
        if (other) throw new GameError(409, 'Cette borne est occupée par ' + room.players[other].name + '.', { by: room.players[other].name });
        const p = mine(room, now);
        p.seat = seat; p.fx = null;
        return { seat };
      });
      return res.status(200).json({ ok: true, seat: r.out.seat, ...r.pub });
    }

    if (action === 'stand') {
      const r = await mutate((room, now) => { const p = mine(room, now); p.seat = -1; p.fx = null; return {}; });
      return res.status(200).json({ ok: true, seat: -1, ...r.pub });
    }

    if (action === 'leave') {
      const r = await mutate((room) => { delete room.players[actor]; return {}; });
      return res.status(200).json({ ok: true, ...r.pub });
    }

    // « je lance les rouleaux » / « voici mon résultat » : sert uniquement à animer la borne chez les autres
    if (action === 'fx') {
      const phase = body.phase === 'result' ? 'result' : 'start';
      const finals = Array.isArray(body.finals) ? body.finals.slice(0, 3).map((s) => (SYMS.includes(s) ? s : SYMS[0])) : null;
      const r = await mutate((room, now) => {
        const p = mine(room, now);
        if (p.seat < 0) throw new GameError(400, 'Assieds-toi à une borne d\'abord.');
        p.fx = { id: str(body.id, 24) || String(now), phase, t: now };
        if (phase === 'result' && finals && finals.length === 3) {
          p.fx.finals = finals; p.fx.mult = num(body.mult, 0, 1000, 0); p.fx.win = Math.floor(num(body.win, 0, 1e9, 0)); p.fx.bet = Math.floor(num(body.bet, 0, 1e9, 0));
        }
        return {};
      });
      return res.status(200).json({ ok: true, ...r.pub });
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('slots:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
