// Courses de chevaux multijoueur, entièrement gérées par le serveur :
//  - le classement est tiré ici et reste secret jusqu'à la fermeture des paris,
//  - une course ne démarre que si quelqu'un a parié : le premier pari lance 10 s de paris, puis 30 s de course et 10 s de résultats,
//  - mises prélevées et gains versés par le serveur (jamais par le navigateur).
// Même principe que api/crash.js : l'état est enregistré dans la ligne __horses_game__ avec une écriture
// « si personne n'a modifié entre-temps », donc deux joueurs qui parient en même temps ne s'écrasent pas.
import { randomInt } from 'node:crypto';
import { actorOf } from './_auth.js';
import { getRowExact, putRow, updateAccount, GameError } from './_store.js';
import { walletCharge, walletPay } from './_wallet.js';

const ROW = '__horses_game__';
const NOOP = Symbol('noop');

export const BET_MS = 12000;      // du premier pari au départ : 10 s pour parier + 2 s de fermeture
export const CLOSE_MS = 2000;     // les paris ferment 2 s avant le départ (le classement est alors révélé aux écrans)
export const RACE_MS = 30000;     // la course (les chevaux franchissent la ligne entre 17 et 26,5 s)
export const RESULT_MS = 10000;   // affichage des résultats
export const CYCLE_MS = BET_MS + RACE_MS + RESULT_MS;
export const MIN_BET = 10;
export const MAX_BET = 100000;
export const MAX_BETS = 3;        // paris par joueur et par course
export const GROUP_SIZE = 4;      // « dans le groupe » = parmi les 4 premiers

// 8 chevaux ; plus la vitesse est grande, plus le cheval est rapide (le 5 est un cheval « moyen »)
export const HORSES = [
  { n: 1, name: 'Éclair', speed: 1.02 }, { n: 2, name: 'Tempête', speed: 0.94 }, { n: 3, name: 'Pharaon', speed: 1.06 }, { n: 4, name: 'Safran', speed: 0.98 },
  { n: 5, name: 'Orage', speed: 0.985 }, { n: 6, name: 'Mirage', speed: 0.91 }, { n: 7, name: 'Jackpot', speed: 1.04 }, { n: 8, name: 'Valkyrie', speed: 0.96 }
];
const BASE_TIME = 22;       // secondes d'un cheval de vitesse 1,00 sans aléa
const NOISE = 0.09;         // part d'aléa sur le temps de course
export const GROUP_BASE = 2;   // gain du pari « groupe » pour un cheval moyen (une chance sur deux)
export const GROUP_RTP = 0.95;   // le casino garde 5 % en moyenne sur les paris « groupe »
export const PLACE_BASE = 7;   // gain du pari « place précise » pour un cheval moyen (une chance sur huit)

// ---------- tirage ----------
// u : fonction qui renvoie un nombre dans ]0 ; 1[ (par défaut le hasard sécurisé du serveur)
const secureU = () => (randomInt(1, 1000000000) / 1000000000);
function gauss(u) { return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); }
// durées (en secondes) pour franchir la ligne, une par cheval
export function drawFinish(u = secureU) {
  return HORSES.map((h, i) => {
    const t = BASE_TIME / (h.speed * Math.exp(NOISE * gauss(u)));
    return Math.round(Math.min(26.5, Math.max(17, t)) * 1000) / 1000 + i * 1e-4;   // le petit écart évite toute égalité
  });
}
export const orderOf = (finish) => finish.map((t, i) => ({ i, t })).sort((a, b) => a.t - b.t).map((o) => o.i);

// ---------- cotes ----------
// Probabilités estimées une fois pour toutes (tirages simulés avec un générateur fixe), puis gains :
//  groupe = 2 × (0,5 / chance d'être dans les 4 premiers) ; place précise = 7 × (0,125 / chance d'arriver à cette place)
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }
export function buildOdds(sims = 40000) {
  const u = lcg(20240607), top = new Array(8).fill(0), pl = HORSES.map(() => new Array(8).fill(0));
  for (let s = 0; s < sims; s++) orderOf(drawFinish(u)).forEach((h, k) => { pl[h][k]++; if (k < GROUP_SIZE) top[h]++; });
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    group: top.map((c) => r2(Math.min(8, Math.max(1.1, GROUP_BASE * 0.5 * GROUP_RTP / Math.max(c / sims, 1e-6))))),
    place: pl.map((row) => row.map((c) => r2(Math.min(60, Math.max(2, PLACE_BASE * 0.125 / Math.max(c / sims, 1e-6)))))),
    chance: { group: top.map((c) => c / sims), place: pl.map((row) => row.map((c) => c / sims)) }
  };
}
export const ODDS = buildOdds();

// ---------- état ----------
const initialState = (now) => ({
  round: 1, id: '1', t0: 0, finish: drawFinish(), bets: {}, owed: [], settled: false, history: [], updatedAt: now
});

// fait avancer la partie avec l'horloge ; renvoie true si quelque chose a changé
export function progress(st, now) {
  let changed = false;
  for (let guard = 0; guard < 4; guard++) {
    if (st.t0 && !st.settled && now >= st.t0 + BET_MS + RACE_MS) {
      const order = orderOf(st.finish);
      Object.keys(st.bets || {}).forEach((name) => (st.bets[name] || []).forEach((b) => {
        if (!b.paid) return;
        const hit = b.kind === 'group' ? order.indexOf(b.horse) < GROUP_SIZE : order[b.place - 1] === b.horse;
        b.win = hit ? Math.floor(b.amount * b.mult) : 0;
        b.done = true;
        if (b.win > 0) st.owed.push({ key: `hw:${st.round}:${name}:${b.at}`, name, amount: b.win });
      }));
      st.settled = true; st.order = order;
      if (!Array.isArray(st.history)) st.history = [];
      st.history.unshift({ round: st.round, order: order.slice(0, 3).map((i) => HORSES[i].n) });
      if (st.history.length > 8) st.history.pop();
      st.updatedAt = now; changed = true; continue;
    }
    if (st.settled && st.t0 && now >= st.t0 + CYCLE_MS) {
      st.round = (st.round || 1) + 1; st.t0 = 0; st.id = String(st.round);   // la course suivante attend son premier pari
      st.finish = drawFinish(); st.bets = {}; st.order = undefined; st.settled = false; st.updatedAt = now; changed = true; continue;
    }
    break;
  }
  return changed;
}
// les paris sont ouverts tant que personne n'a parié (rien ne démarre) puis pendant les 10 s qui suivent le premier pari
// plus aucun pari pendant le compte à rebours : la course repasse en attente (rien ne démarre sans pari)
function stopIfEmpty(st, now) { if (st.t0 && !st.settled && now < st.t0 + BET_MS && !Object.keys(st.bets).length) st.t0 = 0; }
export const bettingOpen = (st, now) => !st.t0 || now < st.t0 + BET_MS - CLOSE_MS;

// ce que les navigateurs ont le droit de voir : le classement n'est montré qu'une fois les paris fermés
export function publicState(st, now) {
  const out = { id: st.id, round: st.round, t0: st.t0, serverNow: now, history: st.history, odds: { group: ODDS.group, place: ODDS.place }, bets: [] };
  if (st.t0 && now >= st.t0 + BET_MS - CLOSE_MS) out.finish = st.finish;
  Object.keys(st.bets || {}).forEach((name) => (st.bets[name] || []).forEach((b) => {
    if (!b.paid) return;
    out.bets.push({ name, avatar: b.avatar, horse: b.horse + 1, kind: b.kind, place: b.place || 0, amount: b.amount, mult: b.mult, win: b.done ? b.win : undefined });
  }));
  return out;
}

async function ensureRow() {
  const r = await getRowExact(ROW);
  if (!r || !r.data || !r.data.horses) {
    const st = initialState(Date.now());
    await putRow({ username: ROW, password: 'sys', avatar: '🏇', balance: 0, data: { horses: st } });
    return st;
  }
  return r.data.horses;
}

// modifie l'état de façon atomique ; mutate(st, now) peut lancer GameError ou renvoyer NOOP
async function mutateState(mutate) {
  await ensureRow();
  try {
    const { result } = await updateAccount(ROW, (d) => {
      const st = d.data.horses;
      if (!st.owed) st.owed = [];
      if (!st.bets || typeof st.bets !== 'object') st.bets = {};
      const now = Date.now();
      progress(st, now);
      const out = mutate(st, now);
      if (out === NOOP) throw new GameError(0, 'noop');
      d.data.horses = st;
      return out;
    });
    return result;
  } catch (e) {
    if (e instanceof GameError && e.code === 0) return NOOP;
    throw e;
  }
}

// verse les gains et remboursements en attente (sans danger si répété)
async function settleOwed() {
  const row = await getRowExact(ROW);
  const owed = (row && row.data && row.data.horses && row.data.horses.owed) || [];
  if (!owed.length) return;
  const done = [];
  for (const o of owed) {
    try { await walletPay(o.name, o.key, o.amount); done.push(o.key); }
    catch (e) { if (e && e.code === 404) done.push(o.key); }
  }
  if (done.length) await mutateState((st) => { st.owed = (st.owed || []).filter((x) => !done.includes(x.key)); });
}

const cleanAvatar = (a) => (typeof a === 'string' && a.length > 0 && a.length <= 12 ? a : '🎭');
const fail = (res, code, error, extra) => res.status(code).json({ ok: false, error, ...(extra || {}) });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      let st = await ensureRow();
      const now = Date.now();
      const probe = JSON.parse(JSON.stringify(st));
      if (progress(probe, now)) {
        await mutateState(() => undefined); // enregistre l'avancement (une seule fois grâce au contrôle de version)
        st = probe;
      }
      if (st.owed && st.owed.length) settleOwed().catch(() => {});
      return res.status(200).json(publicState(st, now));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    await settleOwed().catch(() => {});

    const action = body.action;

    // ---- PARIER (prélevé tout de suite par le serveur) ----
    if (action === 'bet') {
      const amount = Math.floor(Number(body.amount));
      const horse = Math.floor(Number(body.horse)) - 1;          // le navigateur parle en numéros 1 à 8
      const kind = body.kind === 'place' ? 'place' : body.kind === 'group' ? 'group' : '';
      const place = kind === 'place' ? Math.floor(Number(body.place)) : 0;
      if (!(horse >= 0 && horse < 8)) return fail(res, 400, 'Choisis un cheval de 1 à 8.');
      if (!kind) return fail(res, 400, 'Choisis un type de pari.');
      if (kind === 'place' && !(place >= 1 && place <= 8)) return fail(res, 400, 'Choisis une place de 1 à 8.');
      if (!(amount >= MIN_BET)) return fail(res, 400, `Précise une mise valide (minimum ${MIN_BET} pièces).`);
      if (amount > MAX_BET) return fail(res, 400, 'La mise maximale est de 100 000 €.');
      const mult = kind === 'group' ? ODDS.group[horse] : ODDS.place[horse][place - 1];
      const reserved = await mutateState((st, now) => {
        if (!bettingOpen(st, now)) throw new GameError(400, 'Les paris sont fermés, attends la prochaine course.');
        const mine = st.bets[actor] || [];
        if (mine.length >= MAX_BETS) throw new GameError(400, `Tu as déjà ${MAX_BETS} paris sur cette course.`);
        if (mine.some((b) => b.horse === horse && b.kind === kind && (b.place || 0) === place)) throw new GameError(400, 'Tu as déjà ce pari.');
        // chaque pari a sa propre clé (annuler puis reparier = 2 prélèvements, 2 remboursements)
        const at = now * 1000 + randomInt(0, 1000);
        mine.push({ at, horse, kind, place, amount, mult, paid: false, win: 0, done: false, avatar: cleanAvatar(body.avatar) });
        st.bets[actor] = mine; st.updatedAt = now;
        if (!st.t0) st.t0 = now;   // le premier pari lance le compte à rebours de la course
        return { round: st.round, at };
      });
      let charged;
      try {
        charged = await walletCharge(actor, `hb:${reserved.round}:${actor}:${reserved.at}`, amount);
      } catch (e) {
        await mutateState((st) => {
          const mine = st.bets[actor] || [], k = mine.findIndex((b) => b.at === reserved.at && !b.paid);
          if (st.round !== reserved.round || k < 0) return NOOP;
          mine.splice(k, 1); if (!mine.length) delete st.bets[actor];
          stopIfEmpty(st, Date.now());
        }).catch(() => {});
        throw e;
      }
      const confirmed = await mutateState((st, now) => {
        const b = st.round === reserved.round ? (st.bets[actor] || []).find((x) => x.at === reserved.at) : null;
        if (!b) {
          // la course a changé entre-temps : on rembourse
          st.owed.push({ key: `hbr:${reserved.round}:${actor}:${reserved.at}`, name: actor, amount });
          return { refunded: true };
        }
        b.paid = true; st.updatedAt = now;
        return { refunded: false };
      });
      if (confirmed.refunded) { await settleOwed().catch(() => {}); return fail(res, 409, 'La course a changé, ta mise est remboursée.'); }
      const st = (await getRowExact(ROW)).data.horses;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()), balance: charged.balance, mult });
    }

    // ---- ANNULER un pari avant la fermeture (remboursé) ----
    if (action === 'cancel') {
      const at = Number(body.at);
      const out = await mutateState((st, now) => {
        if (!bettingOpen(st, now)) throw new GameError(400, 'Les paris sont fermés, impossible d\'annuler.');
        const mine = st.bets[actor] || [], k = mine.findIndex((b) => b.at === at);
        if (k < 0) throw new GameError(400, 'Pari introuvable.');
        const b = mine.splice(k, 1)[0];
        if (!mine.length) delete st.bets[actor];
        stopIfEmpty(st, now);
        if (b.paid) st.owed.push({ key: `hc:${st.round}:${actor}:${b.at}`, name: actor, amount: b.amount });
        st.updatedAt = now;
        return { refund: b.paid ? b.amount : 0 };
      });
      await settleOwed().catch(() => {});
      const row = await getRowExact(actor);
      const st = (await getRowExact(ROW)).data.horses;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()), ...out, balance: row ? row.balance : undefined });
    }

    // ---- MES PARIS de la course en cours + mon solde (gains déjà versés une fois la course finie) ----
    if (action === 'mine') {
      await mutateState(() => undefined);
      await settleOwed().catch(() => {});
      const row = await getRowExact(actor);
      const st = (await getRowExact(ROW)).data.horses;
      const mine = (st.bets[actor] || []).filter((b) => b.paid).map((b) => ({ at: b.at, horse: b.horse + 1, kind: b.kind, place: b.place || 0, amount: b.amount, mult: b.mult, win: b.done ? b.win : undefined }));
      return res.status(200).json({ ok: true, round: st.round, mine, balance: row ? row.balance : undefined });
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('horses:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
