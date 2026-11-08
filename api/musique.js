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


// ---------------------------------------------------------------------------
// Recherche : par nom (YouTube, sans clé d'API : on lit la page de résultats) et liens Spotify.
// Spotify ne laisse pas écouter un titre en entier hors de son application : on lit le titre et l'artiste du lien
// (page d'intégration publique) puis on joue la version YouTube correspondante, avec le même son pour tout le monde.
// ---------------------------------------------------------------------------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function fetchText(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }, headers || {}), signal: controller.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; } finally { clearTimeout(timer); }
}
const toSec = (txt) => String(txt || '').split(':').reduce((a, n) => a * 60 + (parseInt(n, 10) || 0), 0);
function collectVideos(o, out, depth) {
  if (!o || typeof o !== 'object' || depth > 14 || out.length >= 30) return;
  if (o.videoRenderer && o.videoRenderer.videoId) out.push(o.videoRenderer);
  for (const k of Object.keys(o)) collectVideos(o[k], out, depth + 1);
}
async function ytSearch(q) {
  const html = await fetchText('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAQ%253D%253D', { Cookie: 'CONSENT=YES+1; SOCS=CAI' });
  const m = html && html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return null;
  let data; try { data = JSON.parse(m[1]); } catch (e) { return null; }
  const vids = []; collectVideos(data, vids, 0);
  const seen = new Set(), out = [];
  for (const v of vids) {
    if (seen.has(v.videoId)) continue; seen.add(v.videoId);
    const dur = toSec(v.lengthText && v.lengthText.simpleText);
    if (dur < MIN_DUR || dur > MAX_DUR) continue;                       // pas de directs (sans durée) ni de clips de plus de 20 minutes
    out.push({
      videoId: v.videoId,
      title: String((v.title && v.title.runs && v.title.runs.map((r) => r.text).join('')) || 'Sans titre').slice(0, 110),
      by: String((v.ownerText && v.ownerText.runs && v.ownerText.runs[0] && v.ownerText.runs[0].text) || '').slice(0, 40),
      dur
    });
    if (out.length >= 8) break;
  }
  return out;
}
function parseSpotify(q) {
  const m = String(q).match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist)\/([A-Za-z0-9]{22})/) || String(q).match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]{22})$/);
  return m ? { type: m[1], id: m[2] } : null;
}
async function spotifyEntity(sp) {
  const html = await fetchText('https://open.spotify.com/embed/' + sp.type + '/' + sp.id);
  const m = html && html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) return null;
  try {
    const ent = JSON.parse(m[1]).props.pageProps.state.data.entity;
    if (!ent) return null;
    if (sp.type === 'track') return { type: 'track', title: String(ent.name || '').slice(0, 100), artist: (ent.artists || []).map((a) => a.name).join(', ').slice(0, 100) };
    const tracks = (ent.trackList || []).slice(0, 50).map((t) => ({ title: String(t.title || '').slice(0, 100), artist: String(t.subtitle || '').slice(0, 100) })).filter((t) => t.title);
    return tracks.length ? { type: sp.type, name: String(ent.name || '').slice(0, 100), tracks } : null;
  } catch (e) { return null; }
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

    // ---- CHERCHER (par nom, ou à partir d'un lien Spotify) : renvoie des clips YouTube à choisir ----
    if (action === 'search') {
      const q = String(body.q || '').trim().slice(0, 200);
      if (q.length < 2) return fail(res, 400, 'Écris au moins 2 lettres.');
      const sp = parseSpotify(q);
      if (sp) {
        const info = await spotifyEntity(sp);
        if (!info) return fail(res, 422, 'Lien Spotify introuvable (ou liste privée).');
        if (info.type === 'track') {
          const results = await ytSearch(info.artist + ' ' + info.title);
          if (!results) return fail(res, 502, 'La recherche YouTube ne répond pas, réessaie dans un instant.');
          return res.status(200).json({ ok: true, spotify: { type: 'track', title: info.title, artist: info.artist }, results });
        }
        return res.status(200).json({ ok: true, spotify: { type: info.type, name: info.name }, tracks: info.tracks });
      }
      const results = await ytSearch(q);
      if (!results) return fail(res, 502, 'La recherche YouTube ne répond pas, réessaie dans un instant.');
      return res.status(200).json({ ok: true, results });
    }

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
