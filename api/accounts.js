// =============================================================================
// API /api/accounts : « porte unique » vers la table des comptes (Supabase).
// -----------------------------------------------------------------------------
// - Les mots de passe ne quittent JAMAIS le serveur (stockés chiffrés avec scrypt).
// - Connexion / inscription / changement de mot de passe vérifiés ici.
// - Chaque requête d'écriture doit porter un jeton signé (en-tête X-Auth-Token) :
//     * on peut modifier son PROPRE compte ;
//     * sur le compte des autres, seules les « boîtes aux lettres » (virements en
//       attente, demandes d'amis, invitations) sont modifiables, jamais le solde ;
//     * le Patron (jeton X-Admin-Token) peut tout faire, sauf lire les mots de passe.
// - Les lignes réservées (« __... » : tables de poker, crash, etc.) sont invisibles
//   et non modifiables depuis un navigateur.
// - Le navigateur appelle cette API avec la même forme que l'API Supabase
//   (?sb=accounts?select=*), pour que le reste du site fonctionne sans changement.
//
// Variables d'environnement à définir sur Vercel (voir README) :
//   SUPABASE_SERVICE_KEY  clé « service_role » de Supabase (jamais dans le navigateur)
//   AUTH_SECRET           longue chaîne aléatoire qui signe les jetons de connexion
//   ADMIN_PASSWORD        mot de passe du menu Patron
// =============================================================================
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gyjyncljhlatomnbmwxa.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_KEY = SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee';
const MEMORY_ONLY = process.env.ACCOUNTS_STORAGE === 'memory';

const ADMINS = ['ystroz', 'alex'];
const START_BALANCE = 5500;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const ADMIN_TTL_MS = 12 * 3600 * 1000;
const CONFIG_ROW = '__casino_config__';
const READABLE_RESERVED = ['__poker_game__', '__crash_game__', '__blackjack_game__'];
const FAKE_NAMES = ['maxime', 'lucas', 'théo', 'theo', 'don corleone', 'don_corleone', 'karim'];
// champs de la « boîte aux lettres » : modifiables par un autre joueur (virements, amis, invitations)
const MAILBOX_FIELDS = ['friends', 'friendBalances', 'bankTransfers', 'pendingTransfers', 'pendingFriendRequests', 'outgoingFriendRequests', 'pendingGameInvites'];
const DEFAULT_LUCK = { crash: 50, mines: 50, blackjack: 50, slots: 35, scratch: 35 };
const LUCK_LIMITS = { crash: [5, 95], mines: [1, 99], blackjack: [1, 99], slots: [0, 100], scratch: [1, 95] };

const memory = { rows: {} }; // clé = pseudo en minuscules

/* ------------------------------------------------------------------------- */
/* Secrets                                                                   */
/* ------------------------------------------------------------------------- */
function authSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (SERVICE_KEY) return 'flambeurs-auth|' + SERVICE_KEY;
  return 'flambeurs-secret-par-defaut-A-CHANGER'; // dev uniquement : définir AUTH_SECRET en production
}
const secretIsSafe = () => Boolean(process.env.AUTH_SECRET || SERVICE_KEY);
const adminPassword = () => process.env.ADMIN_PASSWORD || 'BATMAN';
const adminPasswordIsSafe = () => Boolean(process.env.ADMIN_PASSWORD);

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }

function signToken(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', authSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(token) {
  if (!token || typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = createHmac('sha256', authSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p || typeof p.u !== 'string' || !(p.e > Date.now())) return null;
    return p;
  } catch (e) { return null; }
}

const userToken = (username) => signToken({ u: String(username).toLowerCase(), e: Date.now() + TOKEN_TTL_MS, k: 'user' });
const adminToken = (username) => signToken({ u: String(username).toLowerCase(), e: Date.now() + ADMIN_TTL_MS, k: 'admin' });

/* ------------------------------------------------------------------------- */
/* Mots de passe                                                             */
/* ------------------------------------------------------------------------- */
function hashPassword(pw) {
  const salt = randomBytes(16);
  const h = scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}

const sha = (s) => createHash('sha256').update(String(s)).digest();

function checkPassword(stored, given) {
  if (!stored) return { ok: false, legacy: false };
  if (stored.startsWith('scrypt$')) {
    try {
      const [, saltB64, hashB64] = stored.split('$');
      const h = scryptSync(String(given), Buffer.from(saltB64, 'base64'), 32, { N: 16384, r: 8, p: 1 });
      const ref = Buffer.from(hashB64, 'base64');
      return { ok: h.length === ref.length && timingSafeEqual(h, ref), legacy: false };
    } catch (e) { return { ok: false, legacy: false }; }
  }
  // ancien format : mot de passe en clair (converti en hash à la première connexion réussie)
  return { ok: timingSafeEqual(sha(stored), sha(given)), legacy: true };
}

/* ------------------------------------------------------------------------- */
/* Stockage (Supabase ou mémoire)                                            */
/* ------------------------------------------------------------------------- */
async function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
}

async function listRows() {
  if (MEMORY_ONLY) return Object.values(memory.rows).map((r) => ({ ...r }));
  const res = await sb('accounts?select=*');
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function getRowExact(username) {
  if (MEMORY_ONLY) { const r = memory.rows[String(username).toLowerCase()]; return r ? { ...r } : null; }
  const res = await sb(`accounts?username=eq.${encodeURIComponent(username)}&select=*`);
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// recherche insensible à la casse : essai direct, puis balayage de la table
async function getRow(username) {
  const name = String(username || '').trim();
  if (!name) return null;
  if (MEMORY_ONLY) return getRowExact(name);
  let r = await getRowExact(name);
  if (r) return r;
  const lower = name.toLowerCase();
  if (lower !== name) { r = await getRowExact(lower); if (r) return r; }
  const all = await listRows();
  return all.find((x) => String(x.username || '').toLowerCase() === lower) || null;
}

async function putRow(row) {
  const clean = {
    username: row.username,
    password: row.password || '',
    avatar: row.avatar || '🎭',
    balance: Number.isFinite(Number(row.balance)) ? Math.floor(Number(row.balance)) : 0,
    data: row.data && typeof row.data === 'object' ? row.data : {},
    updated_at: new Date().toISOString()
  };
  if (MEMORY_ONLY) { memory.rows[clean.username.toLowerCase()] = clean; return true; }
  const res = await sb('accounts', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(clean) });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return true;
}

async function deleteRow(username) {
  if (MEMORY_ONLY) { delete memory.rows[String(username).toLowerCase()]; return; }
  const row = await getRow(username);
  if (!row) return;
  await sb(`accounts?username=eq.${encodeURIComponent(row.username)}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------------- */
/* Utilitaires                                                               */
/* ------------------------------------------------------------------------- */
const isReserved = (name) => String(name || '').trim().startsWith('__');
const lc = (s) => String(s || '').trim().toLowerCase();

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
}

function publicRow(r) {
  const data = r.data && typeof r.data === 'object' ? r.data : {};
  return { username: r.username, password: '', avatar: r.avatar || '🎭', balance: r.balance, data, updated_at: r.updated_at };
}

function toFlat(r) {
  const p = publicRow(r);
  return { ...p.data, username: p.username, password: '', avatarEmoji: p.avatar, balance: typeof p.balance === 'number' ? p.balance : parseInt(p.balance) || START_BALANCE };
}

function parseBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

async function getBanned() {
  try {
    const out = new Set();
    for (const a of ADMINS) {
      const r = await getRow(a);
      const list = r && r.data && Array.isArray(r.data.bannedUsers) ? r.data.bannedUsers : [];
      list.forEach((n) => out.add(lc(n)));
    }
    return out;
  } catch (e) { return new Set(); }
}

// limitation des essais de mot de passe (par pseudo) : 8 échecs / 10 minutes
const fails = new Map();
function tooManyFails(key) {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() - f.first > 600000) { fails.delete(key); return false; }
  return f.n >= 8;
}
function addFail(key) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first > 600000) fails.set(key, { n: 1, first: Date.now() });
  else f.n++;
}

function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 3 && pw.length <= 100;
}

async function getConfig() {
  try {
    const r = await getRowExact(CONFIG_ROW);
    const luck = r && r.data && r.data.luck && typeof r.data.luck === 'object' ? r.data.luck : {};
    return { ...DEFAULT_LUCK, ...luck };
  } catch (e) { return { ...DEFAULT_LUCK }; }
}

/* ------------------------------------------------------------------------- */
/* Règles d'écriture d'un compte                                             */
/* ------------------------------------------------------------------------- */
function cleanBalance(v, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 1e12);
}

function cleanAvatar(v, fallback) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return s ? Array.from(s).slice(0, 4).join('') : fallback;
}

async function applyUpsert(incoming, actor, isAdmin) {
  const name = cleanName(incoming && incoming.username);
  if (name.length < 2) return { code: 400, error: 'Pseudo invalide.' };
  if (isReserved(name)) return { code: 403, error: 'Nom réservé.' };
  if (!actor && !isAdmin) return { code: 401, error: 'Connexion requise.' };

  const inData = incoming.data && typeof incoming.data === 'object' ? incoming.data : {};
  if (JSON.stringify(inData).length > 400000) return { code: 413, error: 'Données trop volumineuses.' };

  const existing = await getRow(name);

  if (!existing) {
    // compte « fantôme » créé pour recevoir un virement : la personne le réclamera en s'inscrivant
    const data = {};
    MAILBOX_FIELDS.forEach((f) => { if (inData[f] !== undefined) data[f] = inData[f]; });
    await putRow({ username: name, password: '', avatar: '🎭', balance: START_BALANCE, data });
    return { code: 200, ok: true };
  }

  const self = actor && lc(existing.username) === actor;
  const oldData = existing.data && typeof existing.data === 'object' ? existing.data : {};

  if (self || isAdmin) {
    const data = { ...inData };
    // la liste des bannis ne peut être modifiée que par le Patron
    if (!isAdmin) {
      if (oldData.bannedUsers !== undefined) data.bannedUsers = oldData.bannedUsers; else delete data.bannedUsers;
    }
    await putRow({
      username: existing.username,
      password: existing.password,                           // jamais modifié ici
      avatar: cleanAvatar(incoming.avatar, existing.avatar),
      balance: cleanBalance(incoming.balance, existing.balance),
      data
    });
    return { code: 200, ok: true };
  }

  // compte d'un autre joueur : seulement la boîte aux lettres
  const data = { ...oldData };
  let changed = false;
  MAILBOX_FIELDS.forEach((f) => { if (inData[f] !== undefined) { data[f] = inData[f]; changed = true; } });
  if (changed) await putRow({ ...existing, data });
  return { code: 200, ok: true };
}

/* ------------------------------------------------------------------------- */
/* Gestionnaire                                                              */
/* ------------------------------------------------------------------------- */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Admin-Token');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const headers = req.headers || {};
    const tok = readToken(headers['x-auth-token']);
    const actor = tok && tok.k === 'user' ? tok.u : null;
    const atok = readToken(headers['x-admin-token']);
    const isAdmin = Boolean(atok && atok.k === 'admin' && ADMINS.includes(atok.u));
    const query = req.query || {};
    const sbPath = typeof query.sb === 'string' ? query.sb : '';

    /* ----------------------------- LECTURE ----------------------------- */
    if (req.method === 'GET') {
      if (query.config) return res.status(200).json({ ok: true, luck: await getConfig(), secure: secretIsSafe() && adminPasswordIsSafe() });

      if (sbPath) {
        const m = sbPath.match(/^accounts\?username=eq\.(.+)$/);
        if (m) {
          const name = decodeURIComponent(m[1]);
          if (isReserved(name)) {
            if (!READABLE_RESERVED.includes(name)) return res.status(200).json([]);
            const r = await getRowExact(name);
            return res.status(200).json(r ? [r] : []);
          }
          const r = await getRow(name);
          return res.status(200).json(r ? [publicRow(r)] : []);
        }
        if (/^accounts\?select=\*$/.test(sbPath) || sbPath === 'accounts') {
          const rows = await listRows();
          return res.status(200).json(rows.filter((r) => r && r.username && !isReserved(r.username)).map(publicRow));
        }
        return res.status(400).json({ ok: false, error: 'Requête non autorisée.' });
      }

      // format historique : { pseudo: compte }
      const rows = await listRows();
      const map = {};
      rows.forEach((r) => { if (r && r.username && !isReserved(r.username)) map[lc(r.username)] = toFlat(r); });
      return res.status(200).json(map);
    }

    /* ----------------------------- SUPPRESSION ------------------------- */
    if (req.method === 'DELETE') {
      let target = typeof query.username === 'string' ? query.username : '';
      if (!target && sbPath) {
        const m = sbPath.match(/^accounts\?username=(?:eq|ilike)\.(.+)$/);
        if (m) target = decodeURIComponent(m[1]);
      }
      target = String(target || '').trim();
      if (!target || /[%*]/.test(target)) return res.status(400).json({ ok: false, error: 'Pseudo invalide.' });
      if (isReserved(target)) return res.status(403).json({ ok: false, error: 'Nom réservé.' });
      if (!isAdmin && lc(target) !== actor) return res.status(403).json({ ok: false, error: 'Interdit.' });
      await deleteRow(target);
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });

    /* ----------------------------- ÉCRITURE ---------------------------- */
    const body = parseBody(req);
    const action = typeof body.action === 'string' ? body.action : '';

    // --- inscription ---
    if (action === 'register') {
      const username = cleanName(body.username);
      const password = body.password;
      if (username.length < 2) return res.status(400).json({ ok: false, error: 'Le blase doit comporter au moins 2 caractères.' });
      if (isReserved(username)) return res.status(400).json({ ok: false, error: 'Ce blase n\'est pas autorisé.' });
      if (FAKE_NAMES.includes(lc(username))) return res.status(400).json({ ok: false, error: 'Ce blase de test n\'est pas autorisé.' });
      if (ADMINS.includes(lc(username))) return res.status(403).json({ ok: false, error: 'Ce blase est réservé.' });
      if (!validPassword(password)) return res.status(400).json({ ok: false, error: 'Le mot de passe doit faire au moins 3 caractères.' });
      if ((await getBanned()).has(lc(username))) return res.status(403).json({ ok: false, error: 'Ce blase a été banni par le Patron.' });
      const existing = await getRow(username);
      if (existing && existing.password) return res.status(409).json({ ok: false, error: 'Ce blase est déjà pris ! Choisis un autre pseudo ou connecte-toi.' });
      const row = existing
        ? { ...existing, password: hashPassword(password), avatar: cleanAvatar(body.avatar, existing.avatar) }   // compte fantôme réclamé
        : { username, password: hashPassword(password), avatar: cleanAvatar(body.avatar, '🎭'), balance: START_BALANCE, data: {} };
      await putRow(row);
      return res.status(200).json({ ok: true, token: userToken(row.username), row: publicRow(row) });
    }

    // --- connexion ---
    if (action === 'login') {
      const username = cleanName(body.username);
      const failKey = lc(username);
      if (tooManyFails(failKey)) return res.status(429).json({ ok: false, error: 'Trop d\'essais. Réessaie dans quelques minutes.' });
      if ((await getBanned()).has(failKey)) return res.status(403).json({ ok: false, error: 'Ce compte a été banni / supprimé par le Patron.' });
      const row = username ? await getRow(username) : null;
      if (!row || isReserved(row.username)) return res.status(404).json({ ok: false, error: `Aucun compte « ${username} » trouvé. Crée ton profil via l'onglet Inscription.` });
      if (!row.password) return res.status(403).json({ ok: false, error: 'Ce compte n\'a pas encore de mot de passe : inscris-toi avec ce blase pour le réclamer.' });
      const chk = checkPassword(row.password, String(body.password || ''));
      if (!chk.ok) { addFail(failKey); return res.status(401).json({ ok: false, error: 'Mot de passe incorrect pour ce joueur.' }); }
      fails.delete(failKey);
      if (chk.legacy) { row.password = hashPassword(body.password); await putRow(row); } // migration silencieuse
      return res.status(200).json({ ok: true, token: userToken(row.username), row: publicRow(row) });
    }

    // --- connexion du Patron ---
    if (action === 'admin_login') {
      const who = lc(body.username);
      if (!actor || actor !== who || !ADMINS.includes(who)) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
      const failKey = 'admin|' + who;
      if (tooManyFails(failKey)) return res.status(429).json({ ok: false, error: 'Trop d\'essais.' });
      const given = String(body.password || '').trim().toUpperCase();
      const real = adminPassword().trim().toUpperCase();
      if (!timingSafeEqual(sha(given), sha(real))) { addFail(failKey); return res.status(403).json({ ok: false, error: 'Accès refusé.' }); }
      fails.delete(failKey);
      return res.status(200).json({ ok: true, adminToken: adminToken(who), secure: secretIsSafe() && adminPasswordIsSafe() });
    }

    // --- changement de mot de passe (soi-même, ou n'importe qui pour le Patron) ---
    if (action === 'set_password') {
      const target = cleanName(body.username);
      if (!isAdmin && lc(target) !== actor) return res.status(403).json({ ok: false, error: 'Interdit.' });
      if (!validPassword(body.password)) return res.status(400).json({ ok: false, error: 'Le mot de passe doit faire au moins 3 caractères.' });
      const row = await getRow(target);
      if (!row || isReserved(row.username)) return res.status(404).json({ ok: false, error: 'Compte introuvable.' });
      row.password = hashPassword(body.password);
      await putRow(row);
      return res.status(200).json({ ok: true });
    }

    // --- changement de pseudo (le compte est déplacé sous le nouveau nom) ---
    if (action === 'rename') {
      if (!actor) return res.status(401).json({ ok: false, error: 'Connexion requise.' });
      const newName = cleanName(body.newName);
      if (newName.length < 2 || isReserved(newName)) return res.status(400).json({ ok: false, error: 'Pseudo invalide.' });
      if (FAKE_NAMES.includes(lc(newName))) return res.status(400).json({ ok: false, error: 'Ce blase n\'est pas autorisé.' });
      if (ADMINS.includes(lc(newName)) && !ADMINS.includes(actor)) return res.status(403).json({ ok: false, error: 'Ce blase est réservé.' });
      if ((await getBanned()).has(lc(newName))) return res.status(403).json({ ok: false, error: 'Ce blase est banni par le Patron.' });
      const clash = await getRow(newName);
      if (clash && lc(clash.username) !== actor) return res.status(409).json({ ok: false, error: 'Ce blase est déjà pris par un autre joueur.' });
      const row = await getRow(actor);
      if (!row) return res.status(404).json({ ok: false, error: 'Compte introuvable.' });
      const moved = { ...row, username: newName };
      await putRow(moved);
      if (lc(row.username) !== lc(newName)) await deleteRow(row.username);
      return res.status(200).json({ ok: true, token: userToken(newName), row: publicRow(moved) });
    }

    // --- réglages de chance du Patron (valables pour tous les joueurs) ---
    if (action === 'set_config') {
      if (!isAdmin) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
      const luck = {};
      const given = body.luck && typeof body.luck === 'object' ? body.luck : {};
      Object.keys(DEFAULT_LUCK).forEach((k) => {
        const [lo, hi] = LUCK_LIMITS[k];
        const v = Math.round(Number(given[k]));
        luck[k] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : DEFAULT_LUCK[k];
      });
      await putRow({ username: CONFIG_ROW, password: '', avatar: '⚙️', balance: 0, data: { luck } });
      return res.status(200).json({ ok: true, luck });
    }

    // --- écriture d'un compte (forme Supabase : ?sb=accounts, ligne ou tableau de lignes) ---
    if (sbPath === 'accounts' || (!action && !sbPath && body.username)) {
      const raw = Array.isArray(body) ? body[0] : body;
      let incoming = raw && typeof raw === 'object' ? raw : {};
      if (!sbPath) {
        // ancien format « à plat » : on le convertit en ligne
        incoming = { username: incoming.username, avatar: incoming.avatarEmoji, balance: incoming.balance, data: incoming };
      }
      const out = await applyUpsert(incoming, actor, isAdmin);
      return res.status(out.code).json(out.ok ? { ok: true } : { ok: false, error: out.error });
    }

    return res.status(400).json({ ok: false, error: 'Requête non reconnue.' });
  } catch (e) {
    console.warn('Erreur /api/accounts:', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

export const __test = { memory, hashPassword, checkPassword, readToken, userToken, adminToken };
