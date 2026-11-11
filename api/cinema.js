// Cinéma partagé : le Patron et le Co Fondateur choisissent le lien et lancent/coupent la séance,
// tout le monde voit exactement la même chose (le serveur fait l'horloge, pas chaque navigateur).
// L'état est enregistré dans la ligne __cinema_state__, comme le fait api/crash.js pour sa partie.
import { actorOf } from './_auth.js';
import { getRowExact, getRow, putRow, updateAccount, GameError } from './_store.js';

// Vercel : l'extraction (appel à tropistream.fr, parfois lente côté Puppeteer la première fois) peut dépasser
// la limite par défaut ; sans effet sur un plan qui ne l'autorise pas.
export const config = { maxDuration: 60 };

const ROW0 = '__cinema_state__';
const rowOf = (room) => (room === 'premium' ? '__cinema_premium_state__' : ROW0);      // le cinéma premium a sa propre séance, indépendante du cinéma classique
const PATRONS = ['ystroz', 'alex'];
const CO_FONDATEURS = ['yohan81'];
const CAN_CONTROL = PATRONS.concat(CO_FONDATEURS);
const SEEN_TTL = 30000;            // un spectateur est « dans la salle » tant que son navigateur a donné signe de vie il y a moins de 30 s
const MAX_CAPACITY = 500;
// rôles : colonne "role" (patron / co_fondateur) + liste "roles" dans les données du compte (staff, premium), voir api/accounts.js (set_roles)
async function rolesOf(actor) {
  const out = { control: CAN_CONTROL.includes(actor), staff: false, premium: false };
  try {
    const row = await getRow(actor);
    if (row) {
      if (row.role === 'patron' || row.role === 'co_fondateur') out.control = true;
      const extra = row.data && Array.isArray(row.data.roles) ? row.data.roles : [];
      out.staff = extra.includes('staff'); out.premium = extra.includes('premium');
    }
  } catch (e) { /* compte illisible : aucun rôle */ }
  return out;
}
const DEFAULT_URL = 'video/tropistream-presentation.mp4';
const TROPISTREAM = 'https://tropistream.fr';

const initialState = () => ({ capacity: 0, seen: {}, url: DEFAULT_URL, type: 'mp4', status: 'idle', position: 0, updatedAt: Date.now(), updatedBy: '', title: '', schedule: [] });
const MAX_SCHEDULE = 20;

// Pubs du cinéma classique (gratuit) : une des deux, tirée au hasard, passe avant chaque film lancé depuis le début.
// Découpées en HLS (morceaux de 6 s) : Cloudflare refuse les fichiers de plus de 25 Mo, et la pub Tropi Site en fait 44.
// dur = durée exacte en secondes (ffprobe), sert d'horloge : pendant la pub la position de la séance est négative (-dur → 0).
const ADS = [
  { url: 'video/pub/tropi-site/index.m3u8', type: 'hls', dur: 58.233 },
  { url: 'video/pub/tropi-backup-hd/index.m3u8', type: 'hls', dur: 44.133 }
];

function positionAt(st, now) {
  const p = st.status === 'playing' ? st.position + (now - st.updatedAt) / 1000 : (st.position || 0);
  return st.ad ? p : Math.max(0, p);                  // avec une pub en cours, la position peut être négative
}

// séances programmées : on garde les futures, et celles de moins de 3h (encore utile à afficher comme « en cours » / tout juste passées)
function visibleSchedule(st, now) {
  return (st.schedule || []).filter((it) => it.at > now - 3 * 3600 * 1000).sort((a, b) => a.at - b.at).slice(0, MAX_SCHEDULE);
}

// ce que les navigateurs ont le droit de voir
export function publicState(st, now) {
  const position = positionAt(st, now);
  const present = Object.keys(st.seen || {}).filter((u) => now - st.seen[u] < SEEN_TTL).length;
  return {
    capacity: Math.max(0, Math.floor(Number(st.capacity)) || 0), present,
    url: st.url || '', type: st.type || 'mp4', status: st.status || 'idle', position, serverNow: now, updatedBy: st.updatedBy || '', title: st.title || '',
    ad: st.ad && position < 0 ? { url: st.ad.url, type: st.ad.type, dur: st.ad.dur } : null,
    schedule: visibleSchedule(st, now).map((it) => ({ id: it.id, title: it.title, poster: it.poster || '', at: it.at }))
  };
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

async function ensureRow(ROW = ROW0) {
  const r = await getRowExact(ROW);
  if (!r || !r.data || !r.data.cinema) {
    const st = initialState();
    await putRow({ username: ROW, password: 'sys', avatar: '🎬', balance: 0, data: { cinema: st } });
    return st;
  }
  return r.data.cinema;
}

// modifie l'état de façon atomique ; mutate(st, now) peut lancer GameError
async function mutateState(mutate, ROW = ROW0) {
  await ensureRow(ROW);
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
      const st = await ensureRow(rowOf(String((req.query && req.query.room) || '')));
      return res.status(200).json(publicState(st, Date.now()));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    const roles = await rolesOf(actor);

    // ---- ENTRER DANS LA SALLE (et rester compté : le navigateur répète toutes les 10 s) / EN SORTIR ----
    // Cinéma premium : réservé au Patron, au Co Fondateur et aux rôles Staff et Premium. Les deux cinémas : nombre de places fixé par la direction (0 = illimité) ;
    // une fois atteint, personne d'autre n'entre (le Patron et le Co Fondateur, qui lancent la séance, passent toujours).
    if (body.action === 'enter' || body.action === 'leave') {
      const ROWE = rowOf(String(body.room || ''));
      if (body.action === 'leave') {
        await mutateState((s) => { if (s.seen) delete s.seen[actor]; }, ROWE);
        return res.status(200).json({ ok: true });
      }
      if (ROWE !== ROW0 && !(roles.control || roles.staff || roles.premium)) return fail(res, 403, 'Le cinéma premium est réservé aux membres Premium, Staff, Co Fondateur et Patron.');
      const out = await mutateState((s, now) => {
        const seen = s.seen && typeof s.seen === 'object' ? s.seen : {};
        Object.keys(seen).forEach((u) => { if (now - seen[u] >= SEEN_TTL) delete seen[u]; });
        const cap = Math.max(0, Math.floor(Number(s.capacity)) || 0);
        const inside = Object.keys(seen).length;
        if (!seen[actor] && cap > 0 && inside >= cap && !roles.control) throw new GameError(409, 'Salle complète (' + inside + '/' + cap + ') : reviens quand une place se libère.');
        seen[actor] = now; s.seen = seen;
        return { present: Object.keys(seen).length, capacity: cap };
      }, ROWE);
      return res.status(200).json(Object.assign({ ok: true }, out));
    }

    const action = body.action;
    const ROW = rowOf(String(body.room || ''));
    // cinéma premium : le Staff peut aussi lancer, mettre en pause, choisir le film et programmer (console du téléphone) ; le cinéma classique reste au Patron et au Co Fondateur
    if (!(roles.control || (roles.staff && ROW !== ROW0))) return fail(res, 403, ROW !== ROW0 ? 'Réservé au Staff, au Co Fondateur et au Patron.' : 'Réservé au Patron et au Co Fondateur.');
    const mutate = (fn) => mutateState(fn, ROW);

    // ---- NOMBRE DE PERSONNES AUTORISÉES DANS LA SALLE (0 = illimité) ----
    if (action === 'set_capacity') {
      const cap = Math.max(0, Math.min(MAX_CAPACITY, Math.floor(Number(body.capacity)) || 0));
      await mutate((s) => { s.capacity = cap; });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- CHARGER UN LIEN ----
    if (action === 'set') {
      const raw = String(body.url || '').trim().slice(0, 500);
      const title = String(body.title || '').trim().slice(0, 200);
      if (!raw) return fail(res, 400, 'Donne un lien valide.');

      let finalUrl = raw, finalType = /\.m3u8(\?|#|$)/i.test(raw) ? 'hls' : 'mp4';
      if (looksLikeEmbedPage(raw)) {
        const extracted = await extractFromTropistream(raw);
        if (!extracted) return fail(res, 422, "Impossible d'extraire ce lien pour l'instant. Réessaie dans un instant, ou utilise un lien direct.");
        finalUrl = extracted.url; finalType = extracted.type;
      }

      await mutate((s, now) => { s.url = finalUrl; s.type = finalType; s.status = 'idle'; s.position = 0; s.ad = null; s.updatedAt = now; s.updatedBy = actor; s.title = title; });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- LANCER LA SÉANCE ----
    if (action === 'play') {
      await mutate((s, now) => {
        if (!s.url) throw new GameError(400, 'Charge un lien avant de lancer la séance.');
        if (s.status !== 'playing') {
          // cinéma gratuit, film lancé depuis le début (pas une reprise après pause) : une pub au hasard d'abord
          if (ROW === ROW0 && s.status === 'idle' && !(s.position > 0)) {
            const ad = ADS[Math.floor(Math.random() * ADS.length)];
            s.ad = { url: ad.url, type: ad.type, dur: ad.dur }; s.position = -ad.dur;
          }
          s.status = 'playing'; s.updatedAt = now; s.updatedBy = actor;
        }
      });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- ALLER À UN MOMENT PRÉCIS (heures / minutes / secondes), avec ou sans lancer la lecture ----
    if (action === 'seek') {
      const pos = Math.max(0, Math.min(86400, Math.floor(Number(body.position) || 0)));
      await mutate((s, now) => {
        if (!s.url) throw new GameError(400, 'Charge un film avant de choisir le moment.');
        s.position = pos; s.ad = null;                      // en lecture, l'horloge repart de cette position à l'instant présent (updatedAt) ; un saut passe la pub
        if (body.play === true) s.status = 'playing';
        s.updatedAt = now; s.updatedBy = actor;
      });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- METTRE EN PAUSE ----
    if (action === 'pause') {
      await mutate((s, now) => {
        if (s.status === 'playing') s.position = positionAt(s, now);
        s.status = 'paused'; s.updatedAt = now; s.updatedBy = actor;
      });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- COUPER LA SÉANCE ----
    if (action === 'stop') {
      await mutate((s, now) => { s.status = 'idle'; s.position = 0; s.ad = null; s.updatedAt = now; s.updatedBy = actor; });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- PROGRAMMER UNE SÉANCE (panneau « à l'affiche » du hall) ----
    if (action === 'schedule-add') {
      const title = String(body.title || '').trim().slice(0, 200);
      const url = String(body.url || '').trim().slice(0, 500);
      const poster = String(body.poster || '').trim().slice(0, 300);
      const type = body.type === 'hls' ? 'hls' : 'mp4';
      const at = Number(body.at);
      if (!title || !url) return fail(res, 400, 'Choisis un film.');
      if (!isFinite(at) || at <= Date.now()) return fail(res, 400, 'Choisis une date dans le futur.');

      await mutate((s) => {
        if (!Array.isArray(s.schedule)) s.schedule = [];
        s.schedule.push({ id: String(Date.now()) + Math.random().toString(36).slice(2, 7), title, url, type, poster, at, addedBy: actor });
        s.schedule.sort((a, b) => a.at - b.at);
        if (s.schedule.length > MAX_SCHEDULE) s.schedule.length = MAX_SCHEDULE;
      });
      const st = (await getRowExact(ROW)).data.cinema;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- RETIRER UNE SÉANCE PROGRAMMÉE ----
    if (action === 'schedule-remove') {
      const id = String(body.id || '');
      if (!id) return fail(res, 400, 'Séance introuvable.');
      await mutate((s) => { s.schedule = (s.schedule || []).filter((it) => it.id !== id); });
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
