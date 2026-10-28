// Vercel Serverless Function : /api/poker  (protocole v2)
// Poker Texas Hold'em multijoueur, serveur autoritaire.
// Toute la logique de jeu est dans _pokerEngine.js ; ce fichier ne fait que :
//   - charger / sauvegarder les tables (Supabase ou mémoire),
//   - authentifier les joueurs (secret d'appareil),
//   - exposer l'API HTTP.
import { createHash } from 'node:crypto';
import * as E from './_pokerEngine.js';
import { actorOf } from './_auth.js';
import { getRow, GameError } from './_store.js';
import { walletCharge, walletPay } from './_wallet.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gyjyncljhlatomnbmwxa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee';
const MEMORY_ONLY = process.env.POKER_STORAGE === 'memory';

const TABLE_ROW_PREFIX = '__poker_t_';
const CASHOUT_ROW = '__poker_cashouts';
const CACHE_TTL = 600;           // ms : fraîcheur du cache pour les lectures
const HEARTBEAT_SAVE_MS = 15000; // un « signe de vie » est sauvegardé au plus toutes les 15 s
const PRIVATE_TTL_MS = 15 * 60 * 1000;

/* ------------------------------------------------------------------------- */
/* STOCKAGE                                                                  */
/* ------------------------------------------------------------------------- */
const store = {
  tables: {},              // tableId -> table
  cashouts: { items: {}, seq: 0 },
  fetchedAt: 0,
  lastSaved: {},           // tableId -> timestamp de dernière sauvegarde
  dirty: new Set()
};

function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    ...extra
  };
}

async function loadRemote() {
  if (MEMORY_ONLY || !SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/accounts?username=like.__poker_*&select=username,data`;
    const res = await fetch(url, { headers: sbHeaders(), cache: 'no-store' });
    if (!res.ok) return;
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || !row.username || !row.data) continue;
      if (row.username === CASHOUT_ROW) {
        const remote = row.data.cashouts;
        if (remote && (remote.seq || 0) >= (store.cashouts.seq || 0)) store.cashouts = remote;
      } else if (row.username.startsWith(TABLE_ROW_PREFIX) && row.data.table && row.data.table.v === E.PROTOCOL) {
        const t = row.data.table;
        const local = store.tables[t.tableId];
        if (!local || (t.seq || 0) >= (local.seq || 0)) store.tables[t.tableId] = t;
        else store.dirty.add(t.tableId);
      }
    }
  } catch (e) {
    console.warn('poker: lecture Supabase impossible', e && e.message);
  }
}

async function saveRow(username, data) {
  if (MEMORY_ONLY || !SUPABASE_URL || !SUPABASE_KEY) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({
        username,
        password: 'sys',
        avatar: '♠️',
        balance: 0,
        data,
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (e) {
    console.warn('poker: écriture Supabase impossible', e && e.message);
    return false;
  }
}

async function deleteRow(username) {
  if (MEMORY_ONLY || !SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/accounts?username=eq.${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: sbHeaders()
    });
  } catch (e) { /* sans importance */ }
}

async function ensureLoaded(force) {
  const now = Date.now();
  if (!force && now - store.fetchedAt < CACHE_TTL) return;
  await loadRemote();
  store.fetchedAt = Date.now();
}

async function persist(changedIds, cashoutsChanged) {
  const jobs = [];
  for (const id of changedIds) {
    const t = store.tables[id];
    if (!t) continue;
    store.lastSaved[id] = Date.now();
    store.dirty.delete(id);
    jobs.push(saveRow(TABLE_ROW_PREFIX + id, { table: t }).then((ok) => { if (!ok) store.dirty.add(id); }));
  }
  if (cashoutsChanged) {
    store.cashouts.seq = (store.cashouts.seq || 0) + 1;
    jobs.push(saveRow(CASHOUT_ROW, { cashouts: store.cashouts }));
  }
  await Promise.all(jobs); // important sur Vercel : on attend avant de répondre
}

// Une seule requête à la fois par instance (évite les écritures entrelacées)
let chain = Promise.resolve();
function withLock(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/* ------------------------------------------------------------------------- */
/* OUTILS                                                                    */
/* ------------------------------------------------------------------------- */
const hashDevice = (d) => (typeof d === 'string' && d.length >= 16 && d.length <= 128)
  ? createHash('sha256').update('flambeurs:' + d).digest('hex')
  : null;

function getTable(id, now, create) {
  if (store.tables[id]) return store.tables[id];
  if (E.PUBLIC_TABLES[id]) {
    store.tables[id] = E.createTable(E.PUBLIC_TABLES[id], now);
    return store.tables[id];
  }
  // les salons privés ont été retirés : seules les tables publiques existent
  return null;
}

// Jetons à rendre à un joueur : inscrits dans un registre durable, puis versés sur son solde par le serveur
function addCashout(secretHash, username, key, amount) {
  if (!amount || amount <= 0) return false;
  store.cashouts.seq = (store.cashouts.seq || 0) + 1;
  const id = `${key}#${Date.now().toString(36)}${store.cashouts.seq}${Math.random().toString(36).slice(2, 6)}`;
  store.cashouts.items[id] = { username, key, amount: Math.floor(amount), at: Date.now() };
  return true;
}

// verse tout ce qui est dû (clé unique par ligne : jamais deux fois). Renvoie le total versé par joueur.
async function settleCashouts() {
  const paid = {};
  let changed = false;
  for (const id of Object.keys(store.cashouts.items)) {
    const c = store.cashouts.items[id];
    if (!c || !c.username) { delete store.cashouts.items[id]; changed = true; continue; }
    try {
      await walletPay(c.username, 'pco:' + id, c.amount);
      const k = String(c.key || c.username).toLowerCase();
      paid[k] = (paid[k] || 0) + c.amount;
      delete store.cashouts.items[id];
      changed = true;
    } catch (e) {
      if (e && e.code === 404) { delete store.cashouts.items[id]; changed = true; } // compte supprimé
      else console.warn('poker: versement reporté', e && e.message);
    }
  }
  return { paid, changed };
}

function pendingFor(key) {
  let total = 0;
  Object.values(store.cashouts.items).forEach((c) => { if (c && String(c.key || '').toLowerCase() === key) total += Math.floor(c.amount || 0); });
  return total;
}

function findSeat(key, secretHash) {
  for (const t of Object.values(store.tables)) {
    const p = t.players[key];
    if (p && !p.left && p.secretHash === secretHash) return { tableId: t.tableId, name: t.name, isPrivate: t.isPrivate };
  }
  return null;
}

function summaries(now) {
  const list = Object.keys(E.PUBLIC_TABLES).map((id) => {
    const t = getTable(id, now);
    const s = E.tableSummary(t);
    s.players = s.players.slice(0, t.maxSeats);
    return s;
  });
  return list;
}

function runStep(table, now, changedIds) {
  const out = E.step(table, now);
  if (out.changed) changedIds.add(table.tableId);
  let cashChanged = false;
  out.cashouts.forEach((c) => {
    if (addCashout(c.secretHash, c.username, c.key, c.amount)) cashChanged = true;
  });
  return cashChanged;
}

async function cleanupPrivate(now, changedIds) {
  for (const id of Object.keys(store.tables)) {
    const t = store.tables[id];
    if (t.isPrivate && Object.keys(t.players).length === 0 && now - t.lastActivityAt > PRIVATE_TTL_MS) {
      delete store.tables[id];
      changedIds.delete(id);
      await deleteRow(TABLE_ROW_PREFIX + id);
    }
  }
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body && typeof body === 'object' ? body : {};
}

function respond(res, status, payload) {
  res.status(status).json(payload);
}

/* ------------------------------------------------------------------------- */
/* HANDLER                                                                   */
/* ------------------------------------------------------------------------- */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return respond(res, 405, { ok: false, error: 'Méthode non autorisée' });

  return withLock(async () => {
    const isPost = req.method === 'POST';
    const body = isPost ? parseBody(req) : {};
    const q = req.query || {};

    await ensureLoaded(isPost);
    const now = Date.now();
    const changedIds = new Set(store.dirty);
    let cashChanged = false;

    // l'identité vient du jeton de connexion, jamais du navigateur
    const actor = actorOf(req, body);
    const rawUser = isPost ? body.username : q.user;
    let username = E.cleanUsername(rawUser);
    if (!actor) username = '';
    else if (E.normalizeKey(username) !== actor) username = E.cleanUsername(actor);
    const userKey = actor ? E.normalizeKey(username) : '';
    const secretHash = actor ? hashDevice('flambeurs-user|' + actor) : null;
    const rawTableId = String((isPost ? body.tableId : (q.table || q.tableId)) || '').toLowerCase().trim();

    let error = null;
    let cashout = 0;
    let joined = false;
    let table = null;

    if (isPost) {
      const action = String(body.action || '');

      if (action === 'claim') {
        if (!userKey || !secretHash) error = 'Connexion requise.';
        // (les jetons dus sont versés plus bas par le serveur)
      } else {
        table = rawTableId ? getTable(rawTableId, now) : null;
        if (!table) {
          error = 'Table inconnue.';
        } else if (!userKey || !secretHash) {
          error = 'Connexion requise.';
        } else {
          cashChanged = runStep(table, now, changedIds) || cashChanged;
          const me = table.players[userKey];
          const authed = me && !me.left && me.secretHash === secretHash;

          if (action === 'join') {
            // un joueur ne peut être assis qu'à une seule table
            let blocked = null;
            for (const t of Object.values(store.tables)) {
              if (t.tableId === table.tableId) continue;
              const o = t.players[userKey];
              if (!o || o.left) continue;
              if (o.secretHash === secretHash || now - o.lastSeen > E.TAKEOVER_MS) {
                // même appareil (ou ancien siège fantôme) : on le déplace proprement
                const amount = E.removePlayer(t, userKey, 'leave', now);
                if (addCashout(o.secretHash, o.username, userKey, amount)) cashChanged = true;
                changedIds.add(t.tableId);
              } else {
                blocked = t;
              }
            }
            if (blocked) {
              error = `Ce pseudo est déjà assis à « ${blocked.name} » sur un autre appareil.`;
            } else {
              // la mise de départ est prélevée par le serveur avant de s'asseoir
              const existing = table.players[userKey];
              const buyIn = Math.floor(Number(body.buyIn));
              const chargeKey = `pj:${table.tableId}:${userKey}:${now}`;
              let charged = false;
              if (!existing) {
                if (!Number.isFinite(buyIn) || buyIn < table.minBuyIn) error = `Mise de départ minimum : ${table.minBuyIn} €.`;
                else if (buyIn > table.maxBuyIn) error = `Mise de départ maximum : ${table.maxBuyIn} €.`;
                else if (!table.seats.some((k) => !k)) error = 'Table complète.';
                else {
                  try { await walletCharge(userKey, chargeKey, buyIn); charged = true; }
                  catch (e) { error = e instanceof GameError ? e.message : 'Paiement impossible, réessaie.'; }
                }
              }
              if (!error) {
                const r = E.seatPlayer(table, { username, avatar: body.avatar, buyIn, secretHash }, now);
                if (!r.ok) {
                  error = r.error;
                  if (charged) await walletPay(userKey, 'pjr:' + chargeKey, buyIn).catch(() => {});
                } else { changedIds.add(table.tableId); joined = !r.already; }
              }
            }
          } else if (action === 'ping') {
            if (authed) me.lastSeen = now;
          } else if (!authed) {
            error = "Tu n'es pas assis à cette table.";
          } else if (action === 'ready') {
            const r = E.setReady(table, userKey, now);
            if (!r.ok) error = r.error; else changedIds.add(table.tableId);
            cashChanged = runStep(table, now, changedIds) || cashChanged;
          } else if (action === 'leave') {
            const amount = E.removePlayer(table, userKey, 'leave', now);
            if (addCashout(secretHash, username, userKey, amount)) cashChanged = true;
            changedIds.add(table.tableId);
            cashChanged = runStep(table, now, changedIds) || cashChanged;
          } else if (['fold', 'check', 'call', 'raise', 'allin'].includes(action)) {
            const r = E.act(table, userKey, action, body.amount, now);
            if (!r.ok) error = r.error; else changedIds.add(table.tableId);
          } else {
            error = 'Action inconnue.';
          }
        }
      }
    } else {
      // GET : on fait avancer le croupier sur toutes les tables en cours puis on lit
      for (const id of Object.keys(store.tables)) {
        const t = store.tables[id];
        if (Object.keys(t.players).length || t.status !== 'waiting') {
          cashChanged = runStep(t, now, changedIds) || cashChanged;
        }
      }
      if (rawTableId) table = getTable(rawTableId, now, null);
      if (table && userKey && secretHash) {
        const me = table.players[userKey];
        if (me && !me.left && me.secretHash === secretHash) {
          me.lastSeen = now;
          if (now - (store.lastSaved[table.tableId] || 0) > HEARTBEAT_SAVE_MS) changedIds.add(table.tableId);
        }
      }
    }

    await cleanupPrivate(now, changedIds);
    if (changedIds.size || cashChanged) await persist(changedIds, cashChanged);

    // le serveur verse lui-même les jetons rendus (départs, éliminations, déconnexions)
    let balance;
    if (Object.keys(store.cashouts.items).length) {
      const st = await settleCashouts();
      if (userKey && st.paid[userKey]) cashout = st.paid[userKey];
      if (st.changed) await persist(new Set(), true);
    }
    if (userKey && isPost) {
      try { const row = await getRow(username); if (row) balance = row.balance; } catch (e) { /* facultatif */ }
    }

    const authed = !!(table && userKey && secretHash && table.players[userKey]
      && !table.players[userKey].left && table.players[userKey].secretHash === secretHash);
    const payload = {
      ok: !error,
      v: E.PROTOCOL,
      serverTime: now,
      tables: summaries(now),
      table: table ? E.publicView(table, userKey, authed, now) : null,
      pendingCashout: userKey ? pendingFor(userKey) : 0,
      mySeat: userKey && secretHash ? findSeat(userKey, secretHash) : null
    };
    if (error) payload.error = error;
    if (cashout) payload.cashout = cashout;
    if (typeof balance === 'number') payload.balance = balance;
    if (joined) payload.joined = true;
    return respond(res, 200, payload);
  });
}

// Utilitaires exposés pour les tests (ignorés par Vercel)
export const __test = {
  reset() {
    store.tables = {}; store.cashouts = { items: {}, seq: 0 }; store.fetchedAt = 0; store.lastSaved = {}; store.dirty = new Set();
  },
  store
};
