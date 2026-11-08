// Jukebox de la salle de musique : une file d'attente de clips YouTube partagée par tous les joueurs de la salle.
// Le serveur fait l'horloge (comme le cinéma) : chaque navigateur se cale sur « startedAt » pour être synchro avec les autres.
// L'état est enregistré dans la ligne __musique_state__ ; le passage au titre suivant se déduit du temps (aucune tâche de fond).
import { actorOf } from './_auth.js';
import { getRowExact, getRow, putRow, updateAccount, GameError } from './_store.js';

const ROW = '__musique_state__';
const PATRONS = ['ystroz', 'alex'];
const CO_FONDATEURS = ['yohan81'];
const MAX_QUEUE = 30;            // titres en attente (hors titre en cours)
const MAX_PER_USER = 3;          // titres qu'un même joueur peut avoir dans la file en même temps
const MIN_DUR = 5, MAX_DUR = 1200;
const GAP = 1500;                // petit silence entre deux titres (ms)

const initialState = () => ({ cur: null, queue: [], seq: 0 });

// le Patron, le Co Fondateur et le Staff peuvent passer / retirer n'importe quel titre
async function canModerate(actor) {
  if (PATRONS.includes(actor) || CO_FONDATEURS.includes(actor)) return true;
  try {
    const row = await getRow(actor);
    if (!row) return false;
    if (row.role === 'patron' || row.role === 'co_fondateur') return true;
    const extra = row.data && Array.isArray(row.data.roles) ? row.data.roles : [];
    return extra.includes('staff');
  } catch (e) { return false; }
}

// fait avancer la file selon l'heure : tant que le titre en cours est fini, le suivant démarre pile à la fin du précédent
function advance(st, now) {
  while (st.cur) {
    const end = st.cur.startedAt + st.cur.dur * 1000 + GAP;
    if (now < end) break;
    const next = st.queue.shift();
    if (next) { next.startedAt = end; st.cur = next; } else st.cur = null;
  }
  return st;
}

const pub = (it) => ({ id: it.id, videoId: it.videoId, title: it.title, by: it.by, dur: it.dur, startedAt: it.startedAt || 0 });
const publicState = (st, now) => ({ ok: true, serverNow: now, cur: st.cur ? pub(st.cur) : null, queue: st.queue.map(pub) });

async function ensureRow() {
  const r = await getRowExact(ROW);
  if (!r || !r.data || !r.data.musique) {
    const st = initialState();
    await putRow({ username: ROW, password: 'sys', avatar: '🎵', balance: 0, data: { musique: st } });
    return st;
  }
  return r.data.musique;
}

async function mutateState(mutate) {
  await ensureRow();
  const { result } = await updateAccount(ROW, (d) => {
    const st = d.data.musique;
    advance(st, Date.now());
    const out = mutate(st, Date.now());
    d.data.musique = st;
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
      const now = Date.now();
      return res.status(200).json(publicState(advance(JSON.parse(JSON.stringify(st)), now), now));   // lecture seule : on calcule l'avance sans l'écrire
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};
    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    const display = String(body.name || '').trim().slice(0, 20);
    const by = display && display.toLowerCase() === actor ? display : actor;
    const action = body.action;

    // ---- AJOUTER UN CLIP À LA FILE ----
    if (action === 'add') {
      const videoId = String(body.videoId || '').trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return fail(res, 400, 'Lien YouTube invalide.');
      const dur = Math.floor(Number(body.dur));
      if (!(dur >= MIN_DUR)) return fail(res, 400, 'Durée du clip introuvable (les directs ne sont pas acceptés).');
      if (dur > MAX_DUR) return fail(res, 400, 'Clip trop long (20 minutes maximum).');
      const title = String(body.title || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 110) || 'Sans titre';
      const out = await mutateState((s, now) => {
        const all = (s.cur ? [s.cur] : []).concat(s.queue);
        if (all.some((it) => it.videoId === videoId)) throw new GameError(409, 'Ce clip est déjà dans la file.');
        if (s.queue.length >= MAX_QUEUE) throw new GameError(409, 'La file est pleine (' + MAX_QUEUE + ' titres).');
        if (all.filter((it) => it.actor === actor).length >= MAX_PER_USER) throw new GameError(409, 'Tu as déjà ' + MAX_PER_USER + ' titres dans la file : attends qu\'un passe.');
        s.seq = (Number(s.seq) || 0) + 1;
        const it = { id: 'm' + s.seq, videoId, title, dur, by, actor, startedAt: 0 };
        if (!s.cur) { it.startedAt = now; s.cur = it; return { playing: true }; }
        s.queue.push(it);
        return { playing: false, position: s.queue.length };
      });
      const st = (await getRowExact(ROW)).data.musique, now = Date.now();
      return res.status(200).json(Object.assign(publicState(advance(st, now), now), out));
    }

    // ---- PASSER LE TITRE EN COURS (celui qui l'a demandé, ou la modération) ----
    if (action === 'skip') {
      const mod = await canModerate(actor);
      await mutateState((s, now) => {
        if (!s.cur) throw new GameError(400, 'Aucun titre en cours.');
        if (body.id && s.cur.id !== String(body.id)) throw new GameError(409, 'Ce titre est déjà fini.');
        if (s.cur.actor !== actor && !mod) throw new GameError(403, 'Seul celui qui l\'a demandé (ou le staff) peut passer ce titre.');
        const next = s.queue.shift();
        if (next) { next.startedAt = now; s.cur = next; } else s.cur = null;
      });
      const st = (await getRowExact(ROW)).data.musique, now = Date.now();
      return res.status(200).json(publicState(advance(st, now), now));
    }

    // ---- RETIRER UN TITRE EN ATTENTE ----
    if (action === 'remove') {
      const id = String(body.id || '');
      const mod = await canModerate(actor);
      await mutateState((s) => {
        const i = s.queue.findIndex((it) => it.id === id);
        if (i < 0) throw new GameError(404, 'Ce titre n\'est plus dans la file.');
        if (s.queue[i].actor !== actor && !mod) throw new GameError(403, 'Tu ne peux retirer que tes propres titres.');
        s.queue.splice(i, 1);
      });
      const st = (await getRowExact(ROW)).data.musique, now = Date.now();
      return res.status(200).json(publicState(advance(st, now), now));
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message);
    console.warn('musique:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
