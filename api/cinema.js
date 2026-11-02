// Cinéma partagé : le Patron et le Co Fondateur choisissent le lien et lancent/coupent la séance,
// tout le monde voit exactement la même chose (le serveur fait l'horloge, pas chaque navigateur).
// L'état est enregistré dans la ligne __cinema_state__, comme le fait api/crash.js pour sa partie.
import { actorOf } from './_auth.js';
import { getRowExact, putRow, updateAccount, GameError } from './_store.js';

// Vercel : l'extraction (appel à tropistream.fr, parfois lente côté Puppeteer la première fois) peut dépasser
// la limite par défaut ; sans effet sur un plan qui ne l'autorise pas.
export const config = { maxDuration: 60 };

const ROW = '__cinema_state__';
const PATRONS = ['ystroz', 'alex'];
const CO_FONDATEURS = ['yohan81'];
const CAN_CONTROL = PATRONS.concat(CO_FONDATEURS);
const DEFAULT_URL = 'video/tropistream-presentation.mp4';
const TROPISTREAM = 'https://tropistream.fr';

const initialState = () => ({ url: DEFAULT_URL, type: 'mp4', status: 'idle', position: 0, updatedAt: Date.now(), updatedBy: '' });

function positionAt(st, now) {
  if (st.status === 'playing') return Math.max(0, st.position + (now - st.updatedAt) / 1000);
  return Math.max(0, st.position || 0);
}

// ce que les navigateurs ont le droit de voir
export function publicState(st, now) {
  return { url: st.url || '', type: st.type || 'mp4', status: st.status || 'idle', position: positionAt(st, now), serverNow: now, updatedBy: st.updatedBy || '' };
}

// Fsvid / Uqload / Vidzy : la page collée est l'embed du lecteur (pas un flux jouable tel quel).
const EMBED_HOST_RE = /fsvid\.(io|lol)|fs\d+\.(io|lol)|uqload\.[a-z0-9.-]+|vidzy\.[a-z0-9.-]+/i;
function looksLikeEmbedPage(u) { return EMBED_HOST_RE.test(u) && !/\.(mp4|m3u8)(\?|#|$)/i.test(u); }

// Demande à tropistream.fr d'extraire le flux réel de ce lien embed (mode « Watch Party » du site :
// &wp=1 force l'extraction même sans compte premium). Un appel navigateur direct est refusé par leur
// liste blanche CORS ; un appel serveur à serveur (sans en-tête Origin) passe — vérifié en direct.
async function extractFromTropistream(embedUrl) {
  const api = `${TROPISTREAM}/api/proxy?url=${encodeURIComponent(embedUrl)}&wp=1&json=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const r = await fetch(api, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    if (!data || !data.success || !data.src) return null;
    return { url: `/api/cinema-video?u=${encodeURIComponent(TROPISTREAM + data.src)}`, type: data.type === 'hls' ? 'hls' : 'mp4' };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
      const raw = String(body.url || '').trim().slice(0, 500);
      if (!raw) return fail(res, 400, 'Donne un lien valide.');

      let finalUrl = raw, finalType = /\.m3u8(\?|#|$)/i.test(raw) ? 'hls' : 'mp4';
      if (looksLikeEmbedPage(raw)) {
        const extracted = await extractFromTropistream(raw);
        if (!extracted) return fail(res, 422, "Impossible d'extraire ce lien pour l'instant. Réessaie dans un instant, ou utilise un lien direct.");
        finalUrl = extracted.url; finalType = extracted.type;
      }

      await mutateState((s, now) => { s.url = finalUrl; s.type = finalType; s.status = 'idle'; s.position = 0; s.updatedAt = now; s.updatedBy = actor; });
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
