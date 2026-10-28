// Blind test d'images (films, dessins animés, séries), entièrement géré par le serveur :
//  - les réponses acceptées ne quittent jamais le serveur (le navigateur ne voit que l'image de la manche) ;
//  - le chrono, l'ordre des réponses et les points sont décidés ici, avec l'horloge du serveur ;
//  - les gains (20 € par image trouvée) sont versés par le serveur avec une clé unique (jamais deux fois).
// Un salon = une ligne __bt_<CODE> (invisible depuis le navigateur), modifiée avec contrôle de version
// comme __crash_game__, donc deux joueurs qui répondent en même temps ne s'écrasent pas.
// Deux modes : « all » (tout le monde répond pendant 20 s) et « first » (le premier qui trouve gagne le point).
import { randomInt, randomBytes } from 'node:crypto';
import { actorOf } from './_auth.js';
import { getRow, getRowExact, putRow, deleteRow, updateAccount, GameError } from './_store.js';
import { walletPay } from './_wallet.js';
import { BANK, ANSWERS, IMG_DIR } from './_blindtestData.js';
import { judge, pickRounds, availableTitles, CATS, DIFFS } from './_blindtestEngine.js';

const PREFIX = '__bt_';
const NOOP = Symbol('noop');
export const QUESTION_MS = 20000;
export const REVEAL_MS = 5000;
export const COUNTDOWN_MS = 4000;
export const REWARD = 20;              // € versés pour une image trouvée
export const MIN_REWARD_PLAYERS = 2;   // seul, on s'entraîne sans gagner d'argent (évite de fabriquer des pièces en solo)
export const MAX_PLAYERS = 12;
export const MIN_ROUNDS = 5;
export const GUESS_COOLDOWN_MS = 500;
export const MAX_ATTEMPTS = 15;
const SEEN_REFRESH_MS = 20000;
const GONE_MS = 60000;
const EXPIRE = { lobby: 30 * 60000, playing: 20 * 60000, finished: 20 * 60000 };
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const bankById = new Map(BANK.map((b) => [b.id, b]));
const rowName = (code) => PREFIX + code;
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const cleanAvatar = (a) => (typeof a === 'string' && a.length > 0 && a.length <= 12 ? a : '🧑‍🎤');
const fail = (res, code, error, extra) => res.status(code).json({ ok: false, error, ...(extra || {}) });
const imgOf = (id) => (id ? IMG_DIR + id + '.jpg' : null);

export function sanitizeCfg(c) {
  c = c || {};
  const rounds = Math.floor(Number(c.rounds));
  return {
    mode: c.mode === 'first' ? 'first' : 'all',
    cat: CATS.includes(c.cat) ? c.cat : 'all',
    diff: DIFFS.includes(c.diff) ? c.diff : 'all',
    rounds: Number.isFinite(rounds) ? Math.min(20, Math.max(15, rounds)) : 15
  };
}

export const availableCount = (cfg) => availableTitles(BANK, cfg.cat, cfg.diff).size;

function newState(host, hostName, avatar, cfg, code) {
  const now = Date.now();
  return {
    code, id: randomBytes(6).toString('hex'), status: 'lobby', host, cfg, created: now, updatedAt: now,
    players: { [host]: { name: hostName, avatar, score: 0, earned: 0, totalMs: 0, joinedAt: now, seen: now, left: false } },
    order: [], round: 0, phase: '', phaseStart: 0, phaseEnd: 0, solved: {}, attempts: {}, lastGuess: {},
    reward: false, owed: [], finishedAt: 0
  };
}

const isHere = (st, now, k) => { const p = st.players[k]; return p && !p.left && now - (p.seen || 0) < GONE_MS; };
const activeKeys = (st, now) => Object.keys(st.players).filter((k) => isHere(st, now, k));

function startRound(st, at) {
  st.phase = 'question'; st.phaseStart = at; st.phaseEnd = at + QUESTION_MS;
  st.solved = {}; st.attempts = {}; st.lastGuess = {};
}

function pickHost(st) {
  const left = Object.keys(st.players).filter((k) => !st.players[k].left).sort((a, b) => st.players[a].joinedAt - st.players[b].joinedAt);
  st.host = left[0] || '';
}

// fait avancer la partie avec l'horloge ; renvoie true si quelque chose a changé
export function progress(st, now) {
  let changed = false;
  if (st.status === 'lobby') {
    // un joueur qui a fermé son onglet disparaît du salon d'attente
    Object.keys(st.players).forEach((k) => {
      if (k !== st.host && now - (st.players[k].seen || 0) > GONE_MS * 2) { delete st.players[k]; changed = true; }
    });
    return changed;
  }
  for (let guard = 0; guard < 200 && st.status === 'playing'; guard++) {
    if (st.phase === 'countdown' && now >= st.phaseEnd) {
      st.round = 1; startRound(st, st.phaseEnd); changed = true; continue;
    }
    if (st.phase === 'question') {
      const solvers = Object.keys(st.solved);
      const act = activeKeys(st, st.phaseStart + 1).filter((k) => !st.players[k].left);
      const early = (st.cfg.mode === 'first' && solvers.length > 0)
        || (st.cfg.mode === 'all' && act.length > 0 && act.every((k) => st.solved[k]));
      if (!early && now < st.phaseEnd) break;
      const endAt = early ? Math.min(st.phaseEnd, Math.max(...solvers.map((k) => st.solved[k].at))) : st.phaseEnd;
      st.phase = 'reveal'; st.phaseStart = endAt; st.phaseEnd = endAt + REVEAL_MS; changed = true; continue;
    }
    if (st.phase === 'reveal' && now >= st.phaseEnd) {
      if (st.round >= st.order.length) { st.status = 'finished'; st.finishedAt = st.phaseEnd; st.phase = ''; }
      else { st.round += 1; startRound(st, st.phaseEnd); }
      changed = true; continue;
    }
    break;
  }
  return changed;
}

const isExpired = (st, now) => (now - (st.status === 'finished' ? (st.finishedAt || st.updatedAt) : st.updatedAt)) > (EXPIRE[st.status] || EXPIRE.lobby);

const ranking = (st) => Object.keys(st.players).map((k) => ({ k, ...st.players[k] }))
  .sort((a, b) => b.score - a.score || a.totalMs - b.totalMs || a.joinedAt - b.joinedAt);

// ce que les navigateurs ont le droit de voir : jamais la bonne réponse avant la fin de la manche
export function publicState(st, now, actor) {
  const cur = st.round >= 1 ? bankById.get(st.order[st.round - 1]) : null;
  const nextId = st.status === 'playing' ? (st.phase === 'countdown' ? st.order[0] : st.order[st.round]) : null;
  const inRound = st.status === 'playing' && (st.phase === 'question' || st.phase === 'reveal');
  const out = {
    code: st.code, id: st.id, status: st.status, serverNow: now, cfg: st.cfg, available: availableCount(st.cfg),
    host: st.host, hostName: st.players[st.host] ? st.players[st.host].name : '',
    round: st.round, total: st.order.length, phase: st.phase, phaseStart: st.phaseStart, phaseEnd: st.phaseEnd,
    questionMs: QUESTION_MS, reward: st.reward ? REWARD : 0, rewardMinPlayers: MIN_REWARD_PLAYERS,
    img: inRound && cur ? imgOf(cur.id) : null, nextImg: imgOf(nextId),
    players: ranking(st).map((p, i) => ({
      name: p.name, avatar: p.avatar, score: p.score, earned: p.earned, left: !!p.left, rank: i + 1,
      found: inRound && !!st.solved[p.k], me: p.k === actor, host: p.k === st.host
    })),
    updatedAt: st.updatedAt
  };
  if (st.status === 'playing' && st.phase === 'reveal' && cur) {
    out.answer = ANSWERS[cur.key][0];
    out.solvedBy = Object.keys(st.solved).sort((a, b) => st.solved[a].at - st.solved[b].at)
      .map((k, i) => ({ name: st.players[k].name, ms: st.solved[k].ms, first: i === 0 }));
  }
  const me = actor && st.players[actor];
  if (me) out.you = { name: me.name, host: actor === st.host, found: inRound && !!st.solved[actor], attemptsLeft: Math.max(0, MAX_ATTEMPTS - (st.attempts[actor] || 0)) };
  return out;
}

async function loadRoom(code) {
  const row = await getRowExact(rowName(code));
  return row && row.data && row.data.bt ? row.data.bt : null;
}

// modifie le salon de façon atomique ; mutate(st, now) peut lancer GameError ou renvoyer NOOP
async function mutateRoom(code, mutate) {
  try {
    const { result } = await updateAccount(rowName(code), (d) => {
      const st = d.data && d.data.bt;
      if (!st) throw new GameError(404, 'Salon introuvable.');
      const now = Date.now();
      if (isExpired(st, now)) throw new GameError(410, 'Ce salon a expiré.');
      if (!st.owed) st.owed = [];
      progress(st, now);
      const out = mutate(st, now);
      if (out === NOOP) throw new GameError(0, 'noop');
      d.data.bt = st;
      return out;
    });
    return result;
  } catch (e) {
    if (e instanceof GameError && e.code === 0) return NOOP;
    throw e;
  }
}

// verse les gains en attente (sans danger si répété : chaque paiement a sa clé unique)
async function settleOwed(code) {
  const st = await loadRoom(code);
  const owed = (st && st.owed) || [];
  if (!owed.length) return;
  const done = [];
  for (const o of owed) {
    try { await walletPay(o.name, o.key, o.amount); done.push(o.key); }
    catch (e) { if (e && e.code === 404) done.push(o.key); }
  }
  if (done.length) await mutateRoom(code, (s) => { s.owed = (s.owed || []).filter((x) => !done.includes(x.key)); }).catch(() => {});
}

// état à jour d'un salon (l'avancement de l'horloge est enregistré une seule fois grâce au contrôle de version)
async function currentState(code, actor) {
  let st = await loadRoom(code);
  if (!st) throw new GameError(404, 'Salon introuvable.');
  const now = Date.now();
  if (isExpired(st, now)) { await deleteRow(rowName(code)).catch(() => {}); throw new GameError(410, 'Ce salon a expiré.'); }
  const probe = JSON.parse(JSON.stringify(st));
  const me = actor && probe.players[actor];
  const stale = me && !me.left && now - (me.seen || 0) > SEEN_REFRESH_MS;
  if (progress(probe, now) || stale) {
    await mutateRoom(code, (s, n) => { if (s.players[actor] && !s.players[actor].left) s.players[actor].seen = n; return undefined; }).catch(() => {});
    st = await loadRoom(code) || probe;
  }
  if (st.owed && st.owed.length) settleOwed(code).catch(() => {});
  return publicState(st, now, actor);
}

const counts = () => {
  const out = {};
  for (const c of ['all', ...CATS]) { out[c] = {}; for (const d of ['all', ...DIFFS]) out[c][d] = availableTitles(BANK, c, d).size; }
  return out;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, X-Auth-Token');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const code = cleanCode(req.query && req.query.code);
      if (!code) return res.status(200).json({ ok: true, counts: counts(), questionMs: QUESTION_MS, reward: REWARD, rewardMinPlayers: MIN_REWARD_PLAYERS, minRounds: MIN_ROUNDS });
      const actor = actorOf(req, {});
      return res.status(200).json({ ok: true, state: await currentState(code, actor) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const actor = actorOf(req, body);
    if (!actor) return fail(res, 401, 'Connexion requise.');
    const action = body.action;
    const account = await getRow(actor);
    if (!account) return fail(res, 404, 'Compte introuvable.');
    const avatar = cleanAvatar(body.avatar);
    const reply = async (code, extra) => {
      const state = await currentState(code, actor);
      const row = await getRowExact(account.username);
      return res.status(200).json({ ok: true, state, balance: row ? row.balance : undefined, ...(extra || {}) });
    };

    // ---- CRÉER un salon (gratuit) ----
    if (action === 'create') {
      const cfg = sanitizeCfg(body);
      if (availableCount(cfg) < MIN_ROUNDS) return fail(res, 400, 'Pas assez d\'images pour ces réglages, élargis la catégorie ou la difficulté.');
      for (let i = 0; i < 12; i++) {
        const code = Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(0, CODE_LETTERS.length)]).join('');
        if (await getRowExact(rowName(code))) continue;
        await putRow({ username: rowName(code), password: 'sys', avatar: '🎬', balance: 0, data: { bt: newState(actor, account.username, avatar, cfg, code) } });
        return reply(code, { code });
      }
      return fail(res, 503, 'Impossible de créer le salon, réessaie.');
    }

    const code = cleanCode(body.code);
    if (code.length !== 4) return fail(res, 400, 'Code du salon invalide.');

    // ---- REJOINDRE ----
    if (action === 'join') {
      await mutateRoom(code, (st, now) => {
        const p = st.players[actor];
        if (p) { p.left = false; p.seen = now; p.avatar = avatar; return undefined; }
        if (st.status !== 'lobby') throw new GameError(409, 'La partie a déjà commencé.');
        if (Object.keys(st.players).length >= MAX_PLAYERS) throw new GameError(409, 'Le salon est plein.');
        st.players[actor] = { name: account.username, avatar, score: 0, earned: 0, totalMs: 0, joinedAt: now, seen: now, left: false };
        st.updatedAt = now;
      });
      return reply(code);
    }

    // ---- RÉGLAGES (chef du salon, avant le départ) ----
    if (action === 'config') {
      await mutateRoom(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, 'Seul le chef du salon peut changer les réglages.');
        if (st.status !== 'lobby') throw new GameError(409, 'La partie a déjà commencé.');
        st.cfg = sanitizeCfg({ ...st.cfg, ...body });
        st.updatedAt = now;
      });
      return reply(code);
    }

    // ---- DÉMARRER ----
    if (action === 'start') {
      await mutateRoom(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, 'Seul le chef du salon peut lancer la partie.');
        if (st.status !== 'lobby') throw new GameError(409, 'La partie a déjà commencé.');
        const here = activeKeys(st, now);
        Object.keys(st.players).forEach((k) => { if (!here.includes(k) && k !== actor) delete st.players[k]; });
        if (availableCount(st.cfg) < MIN_ROUNDS) throw new GameError(400, 'Pas assez d\'images pour ces réglages.');
        st.order = pickRounds(BANK, st.cfg);
        st.reward = Object.keys(st.players).length >= MIN_REWARD_PLAYERS;
        st.id = randomBytes(6).toString('hex');
        Object.values(st.players).forEach((p) => { p.score = 0; p.earned = 0; p.totalMs = 0; });
        st.status = 'playing'; st.round = 0; st.phase = 'countdown'; st.phaseStart = now; st.phaseEnd = now + COUNTDOWN_MS;
        st.solved = {}; st.attempts = {}; st.lastGuess = {}; st.updatedAt = now;
      });
      return reply(code);
    }

    // ---- RÉPONDRE ----
    if (action === 'guess') {
      const text = String(body.text == null ? '' : body.text).slice(0, 120);
      const out = await mutateRoom(code, (st, now) => {
        const p = st.players[actor];
        if (!p || p.left) throw new GameError(403, 'Tu n\'es pas dans ce salon.');
        if (st.status !== 'playing' || st.phase !== 'question') {
          const lost = st.status === 'playing' && st.phase === 'reveal' && st.cfg.mode === 'first' && Object.keys(st.solved).length > 0;
          throw new GameError(409, lost ? 'Trop tard, quelqu\'un a trouvé avant toi !' : 'Il n\'y a pas de question en cours.');
        }
        if (now >= st.phaseEnd) throw new GameError(409, 'Le temps est écoulé.');
        if (st.solved[actor]) throw new GameError(400, 'Tu as déjà trouvé celle-ci !');
        if (now - (st.lastGuess[actor] || 0) < GUESS_COOLDOWN_MS) throw new GameError(429, 'Doucement, réessaie dans un instant.');
        const used = st.attempts[actor] || 0;
        if (used >= MAX_ATTEMPTS) throw new GameError(429, 'Plus d\'essais pour cette image.');
        st.lastGuess[actor] = now; st.attempts[actor] = used + 1; p.seen = now;
        const cur = bankById.get(st.order[st.round - 1]);
        const j = judge(text, ANSWERS[cur.key]);
        if (!j.ok) return { correct: false, hint: j.hint, near: !!j.near };
        const ms = now - st.phaseStart;
        st.solved[actor] = { at: now, ms };
        const first = Object.keys(st.solved).length === 1;
        p.score += 1; p.totalMs += ms;
        const paid = st.reward && (st.cfg.mode === 'all' || first);
        if (paid) { p.earned += REWARD; st.owed.push({ key: `bt:${st.id}:${st.round}:${actor}`, name: actor, amount: REWARD }); }
        st.updatedAt = now;
        progress(st, now);
        return { correct: true, ms, first, reward: paid ? REWARD : 0 };
      });
      await settleOwed(code).catch(() => {});
      return reply(code, out);
    }

    // ---- QUITTER ----
    if (action === 'leave') {
      let gone = false;
      await mutateRoom(code, (st, now) => {
        const p = st.players[actor];
        if (!p) return NOOP;
        if (st.status === 'lobby' || st.status === 'finished') delete st.players[actor]; else { p.left = true; p.seen = now; }
        if (st.host === actor) pickHost(st);
        gone = !Object.values(st.players).some((x) => !x.left);
        st.updatedAt = now;
      }).catch((e) => { if (!(e instanceof GameError)) throw e; });
      if (gone) await deleteRow(rowName(code)).catch(() => {});
      return res.status(200).json({ ok: true, left: true });
    }

    // ---- REJOUER (chef du salon, partie terminée) ----
    if (action === 'again') {
      await mutateRoom(code, (st, now) => {
        if (st.host !== actor) throw new GameError(403, 'Seul le chef du salon peut relancer.');
        if (st.status !== 'finished') throw new GameError(409, 'La partie n\'est pas terminée.');
        Object.keys(st.players).forEach((k) => { if (st.players[k].left) delete st.players[k]; else { Object.assign(st.players[k], { score: 0, earned: 0, totalMs: 0 }); } });
        st.status = 'lobby'; st.order = []; st.round = 0; st.phase = ''; st.solved = {}; st.attempts = {}; st.reward = false; st.finishedAt = 0; st.updatedAt = now;
      });
      return reply(code);
    }

    return fail(res, 400, 'Action inconnue.');
  } catch (e) {
    if (e instanceof GameError) return fail(res, e.code || 400, e.message, e.extra);
    console.warn('blindtest:', e);
    return fail(res, 500, 'Erreur serveur.');
  }
}
