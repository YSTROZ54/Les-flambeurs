// Salle « Tableau dessin » : chaque semaine, les joueurs paient (300, puis 800, puis 1500 pièces pour leur 1er, 2e et 3e tableau) pour accrocher un tableau au mur, tout le monde vote
// pour son préféré, et à la fin de la semaine (lundi 00h00, heure de Paris) toutes les pièces récoltées sont redistribuées
// aux auteurs des trois tableaux les plus votés. Tout se passe ici, côté serveur : le navigateur ne fait que dessiner et demander.
//   GET  /api/tableaux            → l'état de la semaine (tableaux, votes, podium de la semaine passée, cagnotte)
//   GET  /api/tableaux?img=<id>   → l'image d'un tableau (mise en cache : un identifiant ne change jamais d'image)
//   POST { action: 'create', title, img, rid } → paie 300 / 800 / 1500 🪙 selon le nombre de tableaux déjà accrochés et accroche le tableau (3 maximum par joueur)
//   POST { action: 'withdraw', id }        → l'auteur retire son tableau : il récupère 90 % de ce qu'il a payé, les 10 % restent dans la cagnotte
//   POST { action: 'vote', id }            → un seul vote par semaine, modifiable ; id vide = retirer son vote ; pas pour son propre tableau
//   POST { action: 'remove', id }          → Patron / Co Fondateur / Staff : retire un tableau (l'auteur est remboursé)
// L'état est dans la ligne __tableaux__ (écriture « si personne n'a modifié entre-temps »), chaque image dans sa propre ligne __tabimg_<id>.
import { Buffer } from 'node:buffer';
import { actorOf } from './_auth.js';
import { getRow, getRowExact, putRow, deleteRow, updateAccount, GameError } from './_store.js';
import { walletCharge, walletPay } from './_wallet.js';
import { isStaffActor } from './_roles.js';

const ROW = '__tableaux__';
const IMG_ROW = (id) => '__tabimg_' + id;
export const PRICES = [300, 800, 1500, 1500, 1500];  // prix du 1er, 2e, 3e, 4e et 5e tableau d un joueur (pièces)
export const REFUND_PCT = 90;            // part rendue quand l'auteur retire son tableau (le reste va dans la cagnotte)
const LEGACY_PRICE = 100;                // les tableaux accrochés avant les prix progressifs avaient coûté 100
export const MAX_PER_PLAYER = 5;         // tableaux par joueur et par semaine
export const MAX_ITEMS = 24;             // tableaux accrochés en même temps (autant que de cadres sur les murs de la salle)
export const MAX_IMG_CHARS = 160000;     // taille maximale de l'image (texte base64)
export const SHARES = { 1: [100], 2: [60, 40], 3: [50, 30, 20] };   // partage de la cagnotte selon le nombre de gagnants

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/* ---------- la semaine : du lundi 00h00 au lundi suivant, à l'heure de Paris ---------- */
const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function parisParts(ms) {
  const o = {};
  PARIS.formatToParts(new Date(ms)).forEach((p) => { if (p.type !== 'literal') o[p.type] = Number(p.value); });
  return o;
}
function parisOffset(ms) { const p = parisParts(ms); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; }
// { key: '2026-11-09', endsAt: ms } : le lundi qui ouvre la semaine, et l'instant où elle se termine
export function weekOf(ms) {
  const p = parisParts(ms);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const back = (day.getUTCDay() + 6) % 7;                       // 0 = lundi
  const mon = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
  const next = Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + 7);
  let end = next - parisOffset(next);
  end = next - parisOffset(end);                               // 2e passe : l'heure d'été/hiver peut changer pendant la semaine
  return { key: mon.toISOString().slice(0, 10), endsAt: end };
}

/* ---------- classement et partage de la cagnotte ---------- */
export function rank(items) {
  return items.map((it) => ({ ...it, votes: it.votes || 0, ts: it.ts || 0 })).sort((a, b) => b.votes - a.votes || a.ts - b.ts);
}
// renvoie [{ item, prize }] : seuls les tableaux qui ont au moins un vote gagnent ; personne n'a voté → null (on rembourse tout le monde)
export function payouts(items, pot) {
  const top = rank(items).filter((it) => it.votes > 0).slice(0, 3);
  if (!top.length) return null;
  const sh = SHARES[top.length];
  const out = top.map((item, i) => ({ item, prize: Math.floor(pot * sh[i] / 100) }));
  out[0].prize += pot - out.reduce((s, o) => s + o.prize, 0);   // les pièces restantes de l'arrondi vont au premier
  return out;
}

/* ---------- état ---------- */
const emptyState = (week) => ({ week, items: [], votes: {}, podium: null, kept: 0 });
const paidOf = (it) => (Number.isFinite(it.paid) ? it.paid : LEGACY_PRICE);
const potOf = (t) => t.items.reduce((s, it) => s + paidOf(it), 0) + (Number.isFinite(t.kept) ? t.kept : 0);   // mises + 10 % gardés des tableaux retirés
const mineOf = (t, who) => t.items.filter((it) => it.author.toLowerCase() === who);

async function ensureRow() {
  const r = await getRowExact(ROW);
  if (!r || !r.data || !r.data.t) await putRow({ username: ROW, password: 'sys', avatar: '🎨', balance: 0, data: { t: emptyState(weekOf(Date.now()).key) } });
}
async function readState() {
  await ensureRow();
  const r = await getRowExact(ROW);
  const t = r && r.data && r.data.t && typeof r.data.t === 'object' ? r.data.t : emptyState(weekOf(Date.now()).key);
  if (!Array.isArray(t.items)) t.items = [];
  if (!t.votes || typeof t.votes !== 'object') t.votes = {};
  if (!Number.isFinite(t.kept)) t.kept = 0;
  return t;
}
async function mutate(fn) {
  await ensureRow();
  const { result } = await updateAccount(ROW, (d) => {
    const t = d.data.t && typeof d.data.t === 'object' ? d.data.t : emptyState(weekOf(Date.now()).key);
    if (!Array.isArray(t.items)) t.items = [];
    if (!t.votes || typeof t.votes !== 'object') t.votes = {};
    if (!Number.isFinite(t.kept)) t.kept = 0;
    const out = fn(t);
    d.data.t = t;
    return out;
  });
  return result;
}

function tally(t) {
  const n = {};
  Object.keys(t.votes).forEach((v) => { const id = t.votes[v]; n[id] = (n[id] || 0) + 1; });
  return t.items.map((it) => ({ ...it, votes: n[it.id] || 0 }));
}

// la semaine est finie : on paie les trois premiers (chaque paiement porte une clé unique, donc rejouable sans danger),
// puis on ouvre la nouvelle semaine. Plusieurs requêtes peuvent le faire en même temps : seule la première change l'état.
async function settle(t, now) {
  const wk = weekOf(now).key;
  if (t.week === wk) return t;
  const items = tally(t);
  const pot = potOf(t);
  const pay = payouts(items, pot);
  let podium = null;
  if (pay) {
    for (const p of pay) await walletPay(p.item.author, 'tab-' + t.week + '-' + p.item.id, p.prize);
    podium = { week: t.week, pot, entries: pay.map((p) => ({ id: p.item.id, title: p.item.title, author: p.item.author, avatar: p.item.avatar, votes: p.item.votes, prize: p.prize })) };
  } else if (items.length) {
    for (const it of items) await walletPay(it.author, 'tab-' + t.week + '-' + it.id + '-refund', paidOf(it));   // aucun vote : chacun récupère sa mise (les 10 % gardés passent à la semaine suivante)
    // aucun vote : on rembourse, mais on ne touche PAS au podium affiché (il reste jusqu'au prochain vrai podium)
  }
  let old = [];
  const res = await mutate((cur) => {
    if (cur.week === wk) return { done: true };
    const prevPodium = cur.podium;
    const keep = new Set((podium ? podium.entries : []).map((e) => e.id));
    old = cur.items.filter((it) => !keep.has(it.id)).map((it) => it.id).concat(podium && prevPodium ? prevPodium.entries.map((e) => e.id) : []);
    cur.week = wk; cur.items = []; cur.votes = {}; cur.kept = pay ? 0 : (cur.kept || 0); cur.podium = podium || prevPodium || null;   // une semaine vide garde le podium précédent affiché
    return { done: false };
  });
  if (!res.done) { for (const id of old) { try { await deleteRow(IMG_ROW(id)); } catch (e) { /* ok */ } } }   // les images du podium précédent et des perdants ne servent plus
  return readState();
}

function publicView(t, actor, now) {
  const w = weekOf(now);
  const items = tally(t);
  const mine = actor || '';
  const mineCount = mine ? mineOf(t, mine).length : 0;
  return {
    ok: true, serverNow: now, week: t.week, endsAt: w.endsAt, price: mineCount < MAX_PER_PLAYER ? PRICES[mineCount] : 0, prices: PRICES, maxPerPlayer: MAX_PER_PLAYER, refundPct: REFUND_PCT,
    pot: potOf(t),
    items: rank(items).map((it) => { const m = it.author.toLowerCase() === mine; return { id: it.id, title: it.title, author: it.author, avatar: it.avatar, votes: it.votes, ts: it.ts, mine: m, ...(m ? { refund: Math.floor(paidOf(it) * REFUND_PCT / 100) } : {}) }; }),
    myVote: mine && t.votes[mine] ? t.votes[mine] : '',
    podium: t.podium || null
  };
}

function checkImage(img) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(typeof img === 'string' ? img : '');
  if (!m || img.length > MAX_IMG_CHARS) return null;
  const bin = Buffer.from(m[2], 'base64');
  const sig = bin.subarray(0, 12);
  const ok = (m[1] === 'image/jpeg' && sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) ||
    (m[1] === 'image/png' && sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) ||
    (m[1] === 'image/webp' && sig.toString('latin1', 0, 4) === 'RIFF' && sig.toString('latin1', 8, 12) === 'WEBP');
  return ok ? { mime: m[1], b64: m[2] } : null;
}

const fail = (res, code, error, extra) => res.status(code).json({ ok: false, error, ...(extra || {}) });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.img) {
        const id = String(q.img).replace(/[^a-z0-9]/gi, '').slice(0, 40);
        const r = id ? await getRowExact(IMG_ROW(id)) : null;
        const d = r && r.data;
        if (!d || !d.b64) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).end('Introuvable'); }
        res.setHeader('Content-Type', d.mime || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.status(200).end(Buffer.from(d.b64, 'base64'));   // end() et non send() : le serveur local n'a pas send()
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const now = Date.now();
      const t = await settle(await readState(), now);
      return res.status(200).json(publicView(t, actorOf(req, null), now));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};
    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    const now = Date.now();
    let t = await settle(await readState(), now);
    const action = body.action;

    if (action === 'state') return res.status(200).json(publicView(t, actor, now));

    if (action === 'create') {
      const title = str(body.title, 30);
      if (!title) return fail(res, 400, 'Donne un titre à ton tableau.');
      // « rid » : identifiant choisi par le navigateur pour cette création. Si la réponse s'est perdue et qu'il réessaie, le tableau existe déjà : on le renvoie, sans payer une 2e fois.
      let rid = /^[a-z0-9]{8,24}$/.test(String(body.rid || '')) ? String(body.rid) : '';
      if (rid) {
        const dup = t.items.find((it) => it.id === rid);
        if (dup && dup.author.toLowerCase() === actor) { const row = await getRow(actor); return res.status(200).json({ ...publicView(t, actor, Date.now()), balance: row ? row.balance : 0, created: rid }); }
        if (dup) rid = '';
      }
      const img = checkImage(body.img);
      if (!img) return fail(res, 400, 'Image invalide ou trop lourde.');
      if (t.items.length >= MAX_ITEMS) return fail(res, 409, 'Le mur est plein pour cette semaine.');
      const mineCount = mineOf(t, actor).length;
      if (mineCount >= MAX_PER_PLAYER) return fail(res, 409, 'Tu as déjà accroché ' + MAX_PER_PLAYER + ' tableaux cette semaine.');
      const price = PRICES[mineCount];
      const id = rid || (now.toString(36) + Math.random().toString(36).slice(2, 7));
      const paid = await walletCharge(actor, 'tab-new-' + id, price);     // prélevé d'abord, remboursé si l'accrochage échoue
      try {
        await putRow({ username: IMG_ROW(id), password: 'sys', avatar: '🖼️', balance: 0, data: { mime: img.mime, b64: img.b64 } });
        const r = await mutate((cur) => {
          if (cur.week !== t.week) throw new GameError(409, 'La semaine vient de se terminer, réessaie.');
          if (cur.items.length >= MAX_ITEMS) throw new GameError(409, 'Le mur est plein pour cette semaine.');
          if (mineOf(cur, actor).length !== mineCount) throw new GameError(409, 'Ton nombre de tableaux vient de changer, réessaie.');   // le prix dépendait de ce nombre
          cur.items.push({ id, title, author: paid.username || actor, avatar: str(body.avatar, 12) || '🧑', ts: now, paid: price });
          return { ok: true };
        });
        void r;
      } catch (e) {
        await walletPay(actor, 'tab-new-' + id + '-refund', price).catch(() => { /* ok */ });
        try { await deleteRow(IMG_ROW(id)); } catch (e2) { /* ok */ }
        throw e;
      }
      t = await readState();
      return res.status(200).json({ ...publicView(t, actor, Date.now()), balance: paid.balance, created: id });
    }

    if (action === 'vote') {
      const id = str(body.id, 40);
      await mutate((cur) => {
        if (!id) { delete cur.votes[actor]; return {}; }
        const it = cur.items.find((x) => x.id === id);
        if (!it) throw new GameError(404, 'Ce tableau n\'existe plus.');
        if (it.author.toLowerCase() === actor) throw new GameError(400, 'Tu ne peux pas voter pour ton propre tableau.');
        cur.votes[actor] = id;
        return {};
      });
      t = await readState();
      return res.status(200).json(publicView(t, actor, Date.now()));
    }

    if (action === 'withdraw') {
      const id = str(body.id, 40);
      let gone = null, back = 0;
      await mutate((cur) => {
        const i = cur.items.findIndex((x) => x.id === id && x.author.toLowerCase() === actor);
        if (i < 0) throw new GameError(404, 'Tableau introuvable.');
        gone = cur.items.splice(i, 1)[0];
        Object.keys(cur.votes).forEach((v) => { if (cur.votes[v] === id) delete cur.votes[v]; });
        back = Math.floor(paidOf(gone) * REFUND_PCT / 100);
        cur.kept = (cur.kept || 0) + paidOf(gone) - back;               // les 10 % restent dans la cagnotte
        return {};
      });
      const w = await walletPay(actor, 'tab-' + t.week + '-' + gone.id + '-withdraw', back);
      try { await deleteRow(IMG_ROW(gone.id)); } catch (e) { /* ok */ }
      t = await readState();
      return res.status(200).json({ ...publicView(t, actor, Date.now()), balance: w.balance, refunded: back });
    }

    if (action === 'remove') {
      if (!(await isStaffActor(actor))) return fail(res, 403, 'Réservé au staff.');
      const id = str(body.id, 40);
      let gone = null;
      await mutate((cur) => {
        const i = cur.items.findIndex((x) => x.id === id);
        if (i < 0) throw new GameError(404, 'Tableau introuvable.');
        gone = cur.items.splice(i, 1)[0];
        Object.keys(cur.votes).forEach((v) => { if (cur.votes[v] === id) delete cur.votes[v]; });
        return {};
      });
      if (gone) { await walletPay(gone.author, 'tab-' + t.week + '-' + gone.id + '-removed', paidOf(gone)); try { await deleteRow(IMG_ROW(gone.id)); } catch (e) { /* ok */ } }
      t = await readState();
      return res.status(200).json(publicView(t, actor, Date.now()));
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('tableaux:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
