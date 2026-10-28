// Virements entre joueurs gérés par le serveur (plus aucune boîte aux lettres falsifiable).
// Un virement est « en attente » dans la boîte du destinataire jusqu'à acceptation, refus
// ou expiration (30 min) ; dans les deux derniers cas l'expéditeur est remboursé.
import { randomBytes } from 'node:crypto';
import { updateAccount, getRow, putRow, GameError } from './_store.js';

export const BANK_MIN = 5;
export const BANK_MAX = 1e9;
export const BANK_EXPIRY_MS = 30 * 60 * 1000;
export const NEW_ACCOUNT_LOCK_MS = 24 * 3600 * 1000; // un compte tout neuf ne peut pas encore envoyer d'argent
export const START_BALANCE = 5500;
const HISTORY_MAX = 15;
const INBOX_MAX = 20;

const lc = (s) => String(s || '').trim().toLowerCase();
const cleanText = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);

function srv(d) { if (!d.data._srv || typeof d.data._srv !== 'object') d.data._srv = {}; return d.data._srv; }
function pushHistory(d, entry) {
  const s = srv(d);
  s.history = [entry, ...(Array.isArray(s.history) ? s.history : [])].slice(0, HISTORY_MAX);
}
function setStatus(d, id, status) {
  const s = srv(d);
  if (!Array.isArray(s.history)) return false;
  const h = s.history.find((x) => x && x.id === id);
  if (h) { h.status = status; return true; }
  return false;
}

async function refundSender(from, entry, status) {
  try {
    await updateAccount(from, (d) => {
      d.balance += entry.amount;
      if (!setStatus(d, entry.id, status)) pushHistory(d, { ...entry, status });
    });
  } catch (e) { /* expéditeur supprimé : rien à rembourser */ }
}

async function markSender(from, entry, status) {
  try { await updateAccount(from, (d) => { if (!setStatus(d, entry.id, status)) pushHistory(d, { ...entry, status }); }); } catch (e) {}
}

// retire un virement de la boîte du destinataire ; renvoie l'entrée retirée ou null
async function takeFromInbox(to, id, historyStatus) {
  try {
    const { result } = await updateAccount(to, (d) => {
      const s = srv(d);
      const inbox = Array.isArray(s.inbox) ? s.inbox : [];
      const i = inbox.findIndex((x) => x && x.id === id);
      if (i < 0) return null;
      const [entry] = inbox.splice(i, 1);
      s.inbox = inbox;
      if (historyStatus) pushHistory(d, { ...entry, to: d.username, status: historyStatus });
      return entry;
    });
    return result;
  } catch (e) { return null; }
}

async function expireEntry(entry) {
  const taken = await takeFromInbox(entry.to, entry.id, 'Expiré (Non réclamé)');
  if (taken) await refundSender(taken.from, taken, 'Expiré (Remboursé)');
}

function view(row) {
  const s = (row.data && row.data._srv) || {};
  return {
    inbox: (Array.isArray(s.inbox) ? s.inbox : []).map((t) => ({ id: t.id, from: t.from, to: t.to, amount: t.amount, note: t.note, status: 'En attente', timestamp: t.timestamp })),
    history: Array.isArray(s.history) ? s.history : []
  };
}

export const BANK_ACTIONS = ['bank_send', 'bank_accept', 'bank_decline', 'bank_decline_all', 'bank_state'];

export async function runBankAction(action, body, ctx) {
  const { actor } = ctx;
  if (!actor) throw new GameError(401, 'Connexion requise.');
  const now = Date.now();

  if (action === 'bank_state') {
    let row = await getRow(actor);
    if (!row) throw new GameError(404, 'Compte introuvable.');
    // règlement des virements expirés (reçus puis envoyés)
    const v0 = view(row);
    const expiredIn = v0.inbox.filter((t) => now - (Number(t.timestamp) || now) > BANK_EXPIRY_MS);
    const expiredOut = v0.history.filter((h) => h && h.status === 'En attente' && lc(h.from) === lc(row.username) && now - (Number(h.timestamp) || now) > BANK_EXPIRY_MS);
    for (const t of expiredIn) await expireEntry({ ...t, to: row.username });
    for (const h of expiredOut) await expireEntry({ id: h.id, from: row.username, to: h.to, amount: h.amount, note: h.note, timestamp: h.timestamp });
    if (expiredIn.length || expiredOut.length) row = await getRow(actor);
    return { ok: true, balance: row.balance, ...view(row) };
  }

  if (action === 'bank_send') {
    const to = cleanText(body.to, 24);
    const amount = Math.floor(Number(body.amount));
    const note = cleanText(body.note, 60) || 'Bon jeu !';
    if (!to || to.startsWith('__')) throw new GameError(400, 'Choisis le blase du destinataire.');
    if (lc(to) === lc(actor)) throw new GameError(400, 'Tu ne peux pas te faire de don à toi-même !');
    if (!Number.isFinite(amount) || amount < BANK_MIN) throw new GameError(400, 'Le don minimum est de 5 pièces.');
    if (amount > BANK_MAX) throw new GameError(400, 'Montant trop élevé.');
    const id = 'tx_' + now + '_' + randomBytes(4).toString('hex');
    let entry;
    // 1. débit de l'expéditeur (atomique)
    const { row: after } = await updateAccount(actor, (d) => {
      const s = srv(d);
      if (s.createdAt && now - s.createdAt < NEW_ACCOUNT_LOCK_MS) throw new GameError(403, 'Un compte tout neuf ne peut pas encore envoyer d\'argent (24 h d\'attente).');
      if (amount > d.balance) throw new GameError(400, 'Tu n\'as pas assez de pièces sur ton compte.', { balance: d.balance });
      d.balance -= amount;
      entry = { id, from: d.username, to, amount, note, status: 'En attente', timestamp: now };
      pushHistory(d, entry);
    });
    // 2. dépôt dans la boîte du destinataire (compte fantôme créé s'il n'existe pas encore)
    try {
      const rec = await getRow(to);
      if (!rec) {
        await putRow({ username: to, password: '', avatar: '🎭', balance: START_BALANCE, data: { _srv: { inbox: [{ ...entry, to }] }, _ver: 1 } });
      } else {
        entry.to = rec.username;
        await updateAccount(rec.username, (d) => {
          const s = srv(d);
          const inbox = Array.isArray(s.inbox) ? s.inbox : [];
          if (inbox.length >= INBOX_MAX) throw new GameError(400, 'Ce joueur a déjà trop de virements en attente.');
          s.inbox = [...inbox, { id, from: entry.from, to: rec.username, amount, note, timestamp: now }];
        });
      }
    } catch (e) {
      await refundSender(actor, { ...entry }, 'Annulé (Remboursé)');
      throw e instanceof GameError ? e : new GameError(503, 'Virement impossible, réessaie.');
    }
    const fresh = await getRow(actor);
    return { ok: true, id, balance: fresh ? fresh.balance : after.balance, ...view(fresh || after) };
  }

  if (action === 'bank_accept') {
    const id = String(body.id || '');
    const entry = await takeFromInbox(actor, id, null);
    if (!entry) throw new GameError(404, 'Ce virement n\'existe plus (expiré ou déjà traité).');
    if (now - (Number(entry.timestamp) || now) > BANK_EXPIRY_MS) {
      // expiré entre-temps : remboursé à l'expéditeur
      await refundSender(entry.from, entry, 'Expiré (Remboursé)');
      throw new GameError(410, 'Ce virement a expiré et a été remboursé à l\'expéditeur.');
    }
    const { row } = await updateAccount(actor, (d) => {
      d.balance += entry.amount;
      pushHistory(d, { ...entry, to: d.username, status: 'Accepté' });
    });
    await markSender(entry.from, entry, 'Accepté');
    return { ok: true, amount: entry.amount, balance: row.balance, ...view(row) };
  }

  if (action === 'bank_decline' || action === 'bank_decline_all') {
    const rowNow = await getRow(actor);
    if (!rowNow) throw new GameError(404, 'Compte introuvable.');
    const ids = action === 'bank_decline_all' ? view(rowNow).inbox.map((t) => t.id) : [String(body.id || '')];
    let refunded = 0;
    for (const id of ids) {
      const entry = await takeFromInbox(actor, id, null);
      if (entry) { await refundSender(entry.from, entry, 'Refusé & Remboursé'); refunded += entry.amount; }
    }
    const row = await getRow(actor);
    return { ok: true, refunded, balance: row.balance, ...view(row) };
  }

  throw new GameError(400, 'Action inconnue.');
}
