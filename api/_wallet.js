// Prélèvements et paiements sur le solde d'un joueur, toujours côté serveur.
// Chaque opération porte une clé unique : rejouée (nouvel essai, double clic, deux serveurs), elle
// ne s'applique jamais deux fois. Les dernières clés sont gardées dans data._srv.keys du compte.
import { updateAccount, GameError } from './_store.js';

function keysOf(d) {
  if (!d.data._srv || typeof d.data._srv !== 'object') d.data._srv = {};
  if (!d.data._srv.bjKeys || typeof d.data._srv.bjKeys !== 'object') d.data._srv.bjKeys = {};
  return d.data._srv.bjKeys;
}
function rememberKey(d, key) {
  const k = keysOf(d);
  k[key] = Date.now();
  const names = Object.keys(k);
  if (names.length > 80) names.sort((a, b) => k[a] - k[b]).slice(0, names.length - 80).forEach((n) => delete k[n]);
}

// retire `amount` du solde (une seule fois pour cette clé). Renvoie { balance, username }.
export async function walletCharge(username, key, amount) {
  const { result, row } = await updateAccount(username, (d) => {
    if (keysOf(d)[key]) return { already: true };
    if (!(amount > 0)) return {};
    if (d.balance < amount) throw new GameError(400, 'Solde insuffisant pour cette mise.', { who: String(d.username).toLowerCase(), balance: d.balance });
    d.balance -= amount;
    rememberKey(d, key);
    return {};
  });
  return { ...result, balance: row.balance, username: row.username };
}

// ajoute `amount` au solde (une seule fois pour cette clé)
export async function walletPay(username, key, amount) {
  const { result, row } = await updateAccount(username, (d) => {
    if (keysOf(d)[key]) return { already: true };
    if (!(amount > 0)) return {};
    d.balance += Math.floor(amount);
    rememberKey(d, key);
    return {};
  });
  return { ...result, balance: row.balance, username: row.username };
}
