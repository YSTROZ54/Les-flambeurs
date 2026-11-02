// Cinéma partagé : le Patron et le Co Fondateur choisissent le lien et lancent/coupent la séance,
// tout le monde voit exactement la même chose (le serveur fait l'horloge, pas chaque navigateur).
// L'état est enregistré dans la ligne __cinema_state__, comme le fait api/crash.js pour sa partie.
import { actorOf } from './_auth.js';
import { getRowExact, putRow, updateAccount, GameError } from './_store.js';

const ROW = '__cinema_state__';
const PATRONS = ['ystroz', 'alex'];
const CO_FONDATEURS = ['yohan81'];
const CAN_CONTROL = PATRONS.concat(CO_FONDATEURS);
const DEFAULT_URL = 'video/tropistream-presentation.mp4';

const initialState = () => ({ url: DEFAULT_URL, status: 'idle', position: 0, updatedAt: Date.now(), updatedBy: '' });

function positionAt(st, now) {
  if (st.status === 'playing') return Math.max(0, st.position + (now - st.updatedAt) / 1000);
  return Math.max(0, st.position || 0);
}

// ce que les navigateurs ont le droit de voir
export function publicState(st, now) {
  return { url: st.url || '', status: st.status || 'idle', position: positionAt(st, now), serverNow: now, updatedBy: st.updatedBy || '' };
}

async function ensureRow() {
  const r = await getRowExact(ROW);
  if (!r || !r.data || !r.data.cinema) {
    const st = initialState();
    await putRow({ username: ROW, password: 'sys', avatar: '🎬', balance: 0, data: { cinema: st } });
    return st;
  }
  return r.data.cinema;
}

// modifie l'état de façon atomique ; mutate(st, now) peut lancer GameError
async function mutateState(mutate) {
  await ensureRow();
  const { result } = await updateAccount(ROW, (d) => {
    const st = d.data.cinema;
    const out = mutate(st, Date.now());
    d.data.cinema = st;
    return out;
  });
  return result;
}

const fail = (res, code, error) => res.status(code).json({ ok: false, error });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const st = await ensureRow();
      return res.status(200).json(publicState(st, Date.now()));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    if (!CAN_CONTROL.includes(actor)) return fail(res, 403, 'Réservé au Patron et au Co Fondateur.');

    const action = body.action;

    // ---- CHARGER UN LIEN ----
    if (action === 'set') {
      const url = String(body.url || '').trim().slice(0, 500);
      if (!url) return fail(res, 400, 'Donne un lien valide.');
      await mutateState((s, now) => { s.url = url; s.status = 'idle'; s.position = 0; s.updatedAt = now; s.updatedBy = actor; });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- LANCER LA SÉANCE ----
    if (action === 'play') {
      await mutateState((s, now) => {
        if (!s.url) throw new GameError(400, 'Charge un lien avant de lancer la séance.');
        if (s.status !== 'playing') { s.status = 'playing'; s.updatedAt = now; s.updatedBy = actor; }
      });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- METTRE EN PAUSE ----
    if (action === 'pause') {
      await mutateState((s, now) => {
        if (s.status === 'playing') s.position = positionAt(s, now);
        s.status = 'paused'; s.updatedAt = now; s.updatedBy = actor;
      });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- COUPER LA SÉANCE ----
    if (action === 'stop') {
      await mutateState((s, now) => { s.status = 'idle'; s.position = 0; s.updatedAt = now; s.updatedBy = actor; });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message);
    console.warn('cinema:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
