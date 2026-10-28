// Crash multijoueur, entièrement géré par le serveur :
//  - le point de crash est tiré ici et reste secret jusqu'à l'explosion,
//  - le multiplicateur se calcule avec l'horloge du serveur,
//  - mises prélevées et gains versés par le serveur (jamais par le navigateur).
// L'état de la partie est enregistré dans la ligne __crash_game__ avec une écriture « si personne
// n'a modifié entre-temps », donc deux joueurs qui misent en même temps ne s'écrasent pas.
import { randomInt } from 'node:crypto';
import { actorOf } from './_auth.js';
import { getRowExact, putRow, updateAccount, GameError } from './_store.js';
import { walletCharge, walletPay } from './_wallet.js';

const ROW = '__crash_game__';
const CONFIG_ROW = '__casino_config__';
export const COUNTDOWN_MS = 7000;
export const CRASHED_MS = 4000;
export const CRASH_MIN_BET = 10;
export const CRASH_MAX_BET = 100000;
const GROWTH = 0.15; // multiplicateur = e^(0,15 × secondes)
const NOOP = Symbol('noop');

const initialState = () => ({
  id: Date.now(), round: 1, status: 'waiting',
  countdownStartTime: 0, countdownDuration: COUNTDOWN_MS, launchTime: 0,
  crashPoint: 2.0, crashedAtTime: 0, bets: {}, owed: [],
  history: [2.45, 1.35, 4.10, 1.15, 3.20, 1.80], updatedAt: Date.now()
});

export const multAt = (st, now) => (st.launchTime && now >= st.launchTime ? Math.exp(GROWTH * (now - st.launchTime) / 1000) : 1);
const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;

// tirage équitable : P(crash ≥ x) = RTP / x ; le curseur du Patron règle le rendement (5 % → 80 %, 95 % → 110 %)
export function drawCrashPoint(luckPct) {
  const luck = Math.max(5, Math.min(95, Number.isFinite(luckPct) ? luckPct : 50));
  const rtp = 0.80 + ((luck - 5) / 90) * 0.30;
  const u = randomInt(0, 1000000000) / 1000000000; // 0 <= u < 1
  return Math.min(500, Math.max(1, Math.floor(rtp / (1 - u) * 100) / 100));
}

// fait avancer la partie avec l'horloge ; renvoie true si quelque chose a changé
export function progress(st, now) {
  let changed = false;
  for (let guard = 0; guard < 4; guard++) {
    if (st.status === 'countdown' && st.launchTime > 0 && now >= st.launchTime) {
      st.status = 'flying'; st.updatedAt = now; changed = true; continue;
    }
    if (st.status === 'flying' && multAt(st, now) >= st.crashPoint) {
      st.status = 'crashed';
      st.crashedAtTime = Math.round(st.launchTime + Math.log(st.crashPoint) / GROWTH * 1000);
      st.updatedAt = now;
      if (!Array.isArray(st.history)) st.history = [];
      st.history.unshift(parseFloat(st.crashPoint.toFixed(2)));
      if (st.history.length > 8) st.history.pop();
      changed = true; continue;
    }
    if (st.status === 'crashed' && st.crashedAtTime > 0 && now - st.crashedAtTime >= CRASHED_MS) {
      st.status = 'waiting'; st.launchTime = 0; st.countdownStartTime = 0; st.crashedAtTime = 0;
      st.bets = {}; st.round = (st.round || 1) + 1; st.updatedAt = now; changed = true; continue;
    }
    break;
  }
  return changed;
}

// ce que les navigateurs ont le droit de voir
export function publicState(st, now) {
  const out = {
    id: st.id, status: st.status, countdownStartTime: st.countdownStartTime, countdownDuration: st.countdownDuration,
    launchTime: st.launchTime, crashedAtTime: st.crashedAtTime, history: st.history, updatedAt: st.updatedAt, serverNow: now,
    bets: {}
  };
  if (st.status === 'crashed') out.crashPoint = st.crashPoint; // révélé seulement une fois la fusée explosée
  Object.keys(st.bets || {}).forEach((k) => {
    const b = st.bets[k];
    if (!b || !b.paid) return;
    out.bets[b.name] = { name: b.name, bet: b.bet, cashedOut: !!b.cashedOut, cashMult: b.cashMult || null, win: b.win || 0, avatar: b.avatar };
  });
  return out;
}

async function ensureRow() {
  const r = await getRowExact(ROW);
  if (!r || !r.data || !r.data.crash) {
    const st = initialState();
    await putRow({ username: ROW, password: 'sys', avatar: '🚀', balance: 0, data: { crash: st } });
    return st;
  }
  return r.data.crash;
}

// modifie l'état de façon atomique ; mutate(st, now) peut lancer GameError ou renvoyer NOOP
async function mutateState(mutate) {
  await ensureRow();
  try {
    const { result } = await updateAccount(ROW, (d) => {
      const st = d.data.crash;
      if (!st.owed) st.owed = [];
      if (!st.round) st.round = 1;
      if (!st.bets || typeof st.bets !== 'object') st.bets = {};
      const now = Date.now();
      progress(st, now);
      const out = mutate(st, now);
      if (out === NOOP) throw new GameError(0, 'noop');
      d.data.crash = st;
      return out;
    });
    return result;
  } catch (e) {
    if (e instanceof GameError && e.code === 0) return NOOP;
    throw e;
  }
}

// verse les gains/remboursements en attente (sans danger si répété)
async function settleOwed() {
  const row = await getRowExact(ROW);
  const owed = (row && row.data && row.data.crash && row.data.crash.owed) || [];
  if (!owed.length) return;
  const done = [];
  for (const o of owed) {
    try { await walletPay(o.name, o.key, o.amount); done.push(o.key); }
    catch (e) { if (e && e.code === 404) done.push(o.key); }
  }
  if (done.length) {
    await mutateState((st) => { st.owed = (st.owed || []).filter((x) => !done.includes(x.key)); });
  }
}

async function readLuck() {
  try {
    const r = await getRowExact(CONFIG_ROW);
    const n = r && r.data && r.data.luck && Number(r.data.luck.crash);
    return Number.isFinite(n) ? n : 50;
  } catch (e) { return 50; }
}

const cleanAvatar = (a) => (typeof a === 'string' && a.length > 0 && a.length <= 12 ? a : '🧑‍🚀');
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

    // ---- MISER (prélevé tout de suite par le serveur) ----
    if (action === 'bet') {
      const amount = Math.floor(Number(body.amount));
      if (!(amount >= CRASH_MIN_BET)) return fail(res, 400, 'Précise une mise valide (minimum 10 pièces).');
      if (amount > CRASH_MAX_BET) return fail(res, 400, 'La mise maximale au Crash est de 100 000 €.');
      const reserved = await mutateState((st, now) => {
        if (st.status !== 'waiting' && st.status !== 'countdown') throw new GameError(400, 'Le vol est déjà parti, attends le prochain.');
        if (st.bets[actor]) throw new GameError(400, 'Tu as déjà une mise dans ce vol.');
        // chaque mise a sa propre clé (se retirer puis remiser dans le même vol = 2 prélèvements, 2 remboursements)
        const at = now * 1000 + randomInt(0, 1000);
        st.bets[actor] = { name: actor, bet: amount, paid: false, cashedOut: false, cashMult: null, win: 0, avatar: cleanAvatar(body.avatar), at };
        st.updatedAt = now;
        return { round: st.round, at };
      });
      let charged;
      try {
        charged = await walletCharge(actor, `cb:${reserved.round}:${actor}:${reserved.at}`, amount);
      } catch (e) {
        await mutateState((st) => { if (st.round === reserved.round && st.bets[actor] && st.bets[actor].at === reserved.at && !st.bets[actor].paid) delete st.bets[actor]; else return NOOP; }).catch(() => {});
        throw e;
      }
      const confirmed = await mutateState((st, now) => {
        const b = st.bets[actor];
        if (st.round !== reserved.round || !b || b.at !== reserved.at) {
          // le vol a changé entre-temps : on rembourse
          st.owed.push({ key: `cbr:${reserved.round}:${actor}:${reserved.at}`, name: actor, amount });
          return { refunded: true };
        }
        b.paid = true; b.name = charged.username || actor; st.updatedAt = now;
        return { refunded: false };
      });
      if (confirmed.refunded) { await settleOwed().catch(() => {}); return fail(res, 409, 'Le vol a changé, ta mise est remboursée.'); }
      const st = (await getRowExact(ROW)).data.crash;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()), balance: charged.balance });
    }

    // ---- SE RETIRER avant le décollage (remboursé) ----
    if (action === 'cancel') {
      const out = await mutateState((st, now) => {
        if (st.status !== 'waiting' && st.status !== 'countdown') throw new GameError(400, 'Impossible de se retirer une fois le vol décollé !');
        const b = st.bets[actor];
        if (!b) throw new GameError(400, 'Tu n\'as pas de mise dans ce vol.');
        delete st.bets[actor];
        if (b.paid) st.owed.push({ key: `cc:${st.round}:${actor}:${b.at}`, name: actor, amount: b.bet });
        st.updatedAt = now;
        return { refund: b.paid ? b.bet : 0 };
      });
      await settleOwed().catch(() => {});
      const st = (await getRowExact(ROW)).data.crash;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()), ...out });
    }

    // ---- DÉCOLLER : compte à rebours de 7 s, point de crash tiré ici ----
    if (action === 'launch') {
      const luck = await readLuck();
      await mutateState((st, now) => {
        if (st.status !== 'waiting') throw new GameError(400, 'Un vol est déjà en cours.');
        const b = st.bets[actor];
        if (!b || !b.paid) throw new GameError(400, 'Tu dois miser d\'abord avant de faire décoller la fusée !');
        st.id = now;
        st.status = 'countdown';
        st.countdownStartTime = now;
        st.countdownDuration = COUNTDOWN_MS;
        st.launchTime = now + COUNTDOWN_MS;
        st.crashPoint = drawCrashPoint(luck);
        st.crashedAtTime = 0;
        st.updatedAt = now;
      });
      const st = (await getRowExact(ROW)).data.crash;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()) });
    }

    // ---- S'ÉJECTER : le multiplicateur est celui de l'horloge du serveur ----
    if (action === 'cashout') {
      const out = await mutateState((st, now) => {
        if (st.status !== 'flying') {
          throw new GameError(400, st.status === 'crashed' ? 'Trop tard, la fusée a explosé !' : 'Le vol n\'a pas encore décollé.');
        }
        const b = st.bets[actor];
        if (!b || !b.paid) throw new GameError(400, 'Tu n\'as pas de mise dans ce vol.');
        if (b.cashedOut) throw new GameError(400, 'Déjà encaissé.');
        const mult = floor2(multAt(st, now));
        const win = Math.floor(b.bet * mult);
        b.cashedOut = true; b.cashMult = mult; b.win = win;
        st.owed.push({ key: `cw:${st.round}:${actor}:${b.at}`, name: actor, amount: win });
        st.updatedAt = now;
        return { mult, win };
      });
      await settleOwed().catch(() => {});
      const row = await getRowExact(actor);
      const st = (await getRowExact(ROW)).data.crash;
      return res.status(200).json({ ok: true, state: publicState(st, Date.now()), ...out, balance: row ? row.balance : undefined });
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('crash:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
