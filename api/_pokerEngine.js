// =============================================================================
// MOTEUR DE POKER TEXAS HOLD'EM MULTIJOUEUR (logique pure, sans réseau)
// -----------------------------------------------------------------------------
// - Le serveur est l'unique source de vérité : cartes, mises, pots, gagnants.
// - Vraies blindes (SB/BB), bouton du donneur, relances minimum, tapis,
//   pots annexes (side pots) et départage des égalités avec kickers.
// - Le fichier commence par "_" : Vercel ne l'expose donc pas comme route.
// =============================================================================
import { randomInt } from 'node:crypto';

export const PROTOCOL = 2;

export const TURN_MS = 120000;       // 2 minutes pour jouer son tour
export const COUNTDOWN_MS = 4000;    // décompte avant la première donne
export const SHOWDOWN_MS = 7000;     // durée d'affichage du résultat
export const STALE_MS = 60000;       // joueur sans signe de vie => éjecté
export const TAKEOVER_MS = 20000;    // un siège « fantôme » peut être repris
export const MAX_MISSED_TURNS = 2;   // 2 tours sautés d'affilée => éjecté

// Tables publiques : 3 formats x 3 salons, tous identiques (mêmes blindes, même mise de départ)
const SALON_BB = 100;
const SALON_MIN_BUYIN = 1000;
const SALON_MAX_BUYIN = 20000;
const SEATS = { '1v1': 2, '4max': 4, '6max': 6 };

export const PUBLIC_TABLES = {};
['1v1', '4max', '6max'].forEach((cat) => {
  [1, 2, 3].forEach((n) => {
    const id = `poker_${cat}_${n}`;
    PUBLIC_TABLES[id] = {
      id,
      name: `Salon ${n}`,
      category: cat,
      maxSeats: SEATS[cat],
      smallBlind: SALON_BB / 2,
      bigBlind: SALON_BB,
      minBuyIn: SALON_MIN_BUYIN,
      maxBuyIn: SALON_MAX_BUYIN,
      isPrivate: false
    };
  });
});

export const PRIVATE_ID_RE = /^priv_[a-z0-9]{4,8}$/;
export const PRIVATE_BLINDS = [100, 500, 1000];

export function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

export function cleanUsername(name) {
  // pas de caractères de contrôle, 1 à 24 caractères
  return String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
}

export function cleanAvatar(av) {
  const s = String(av || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return Array.from(s).slice(0, 4).join('') || '👤';
}

/* ------------------------------------------------------------------------- */
/* PAQUET ET ÉVALUATION DES MAINS                                            */
/* ------------------------------------------------------------------------- */
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [
  ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9],
  ['10', 10], ['J', 11], ['Q', 12], ['K', 13], ['A', 14]
];

export function createShuffledDeck() {
  const deck = [];
  for (const s of SUITS) for (const [r, v] of RANKS) deck.push({ rank: r, suit: s, value: v });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // aléa cryptographique (équité)
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const RANK_NAMES = { 14: 'As', 13: 'Roi', 12: 'Dame', 11: 'Valet', 10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };
const RANK_PLURALS = { 14: 'As', 13: 'Rois', 12: 'Dames', 11: 'Valets', 10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };

function pack(tier, a = 0, b = 0, c = 0, d = 0, e = 0) {
  return tier * 759375 + a * 50625 + b * 3375 + c * 225 + d * 15 + e;
}

export function evaluate5(cards) {
  const sorted = [...cards].sort((x, y) => y.value - x.value);
  const v = sorted.map((c) => c.value);
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);
  const std = v[0] - 1 === v[1] && v[1] - 1 === v[2] && v[2] - 1 === v[3] && v[3] - 1 === v[4];
  const wheel = v[0] === 14 && v[1] === 5 && v[2] === 4 && v[3] === 3 && v[4] === 2;
  const isStraight = std || wheel;
  const sHigh = wheel ? 5 : v[0];

  const counts = {};
  v.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
  const groups = Object.entries(counts)
    .map(([val, count]) => ({ value: +val, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (isFlush && isStraight) {
    if (sHigh === 14) return { tier: 10, score: pack(10, 14), name: 'Quinte Flush Royale 👑' };
    return { tier: 9, score: pack(9, sHigh), name: `Quinte Flush au ${RANK_NAMES[sHigh]} 🔥` };
  }
  if (groups[0].count === 4) {
    return { tier: 8, score: pack(8, groups[0].value, groups[1].value), name: `Carré de ${RANK_PLURALS[groups[0].value]} 💣` };
  }
  if (groups[0].count === 3 && groups[1].count >= 2) {
    return { tier: 7, score: pack(7, groups[0].value, groups[1].value), name: `Full aux ${RANK_PLURALS[groups[0].value]} par les ${RANK_PLURALS[groups[1].value]} 👑` };
  }
  if (isFlush) {
    return { tier: 6, score: pack(6, v[0], v[1], v[2], v[3], v[4]), name: `Couleur à l'${RANK_NAMES[v[0]]} ♦️` };
  }
  if (isStraight) {
    return { tier: 5, score: pack(5, sHigh), name: `Quinte au ${RANK_NAMES[sHigh]} ⚡` };
  }
  if (groups[0].count === 3) {
    return { tier: 4, score: pack(4, groups[0].value, groups[1].value, groups[2].value), name: `Brelan de ${RANK_PLURALS[groups[0].value]} 🎯` };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const hp = Math.max(groups[0].value, groups[1].value);
    const lp = Math.min(groups[0].value, groups[1].value);
    return { tier: 3, score: pack(3, hp, lp, groups[2].value), name: `Double Paire ${RANK_PLURALS[hp]} et ${RANK_PLURALS[lp]} ✨` };
  }
  if (groups[0].count === 2) {
    return { tier: 2, score: pack(2, groups[0].value, groups[1].value, groups[2].value, groups[3].value), name: `Paire de ${RANK_PLURALS[groups[0].value]}` };
  }
  return { tier: 1, score: pack(1, v[0], v[1], v[2], v[3], v[4]), name: `Hauteur ${RANK_NAMES[v[0]]}` };
}

function combinations(arr, k) {
  const out = [];
  const rec = (start, combo) => {
    if (combo.length === k) { out.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); rec(i + 1, combo); combo.pop(); }
  };
  rec(0, []);
  return out;
}

export function evaluateBest(cards) {
  if (!cards || cards.length < 5) return { tier: 0, score: 0, name: '—' };
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const ev = evaluate5(combo);
    if (!best || ev.score > best.score) best = ev;
  }
  return best;
}

/* ------------------------------------------------------------------------- */
/* POTS ANNEXES (SIDE POTS)                                                  */
/* ------------------------------------------------------------------------- */
// entries : [{ key, total, folded }]  =>  [{ amount, eligible:[keys] }]
export function buildPots(entries) {
  const levels = [...new Set(entries.filter((e) => e.total > 0).map((e) => e.total))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const e of entries) amount += Math.max(0, Math.min(e.total, level) - Math.min(e.total, prev));
    const eligible = entries.filter((e) => !e.folded && e.total >= level).map((e) => e.key);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (eligible.length === 0 && last) last.amount += amount; // mise abandonnée
      else if (last && last.eligible.join('|') === eligible.join('|')) last.amount += amount; // même ayants droit
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  return pots;
}

/* ------------------------------------------------------------------------- */
/* TABLE                                                                     */
/* ------------------------------------------------------------------------- */
export function createTable(cfg, now) {
  return {
    v: PROTOCOL,
    tableId: cfg.id,
    name: cfg.name,
    category: cfg.category || null,
    isPrivate: !!cfg.isPrivate,
    maxSeats: cfg.maxSeats,
    smallBlind: cfg.smallBlind,
    bigBlind: cfg.bigBlind,
    minBuyIn: cfg.minBuyIn,
    maxBuyIn: cfg.maxBuyIn,
    handId: 0,
    status: 'waiting', // waiting | countdown | playing | showdown
    phase: null,       // preflop | flop | turn | river | showdown
    countdownEndsAt: 0,
    nextHandAt: 0,
    pot: 0,
    community: [],
    deck: [],
    dealerSeat: -1,
    sbSeat: -1,
    bbSeat: -1,
    seats: new Array(cfg.maxSeats).fill(null),
    players: {},
    turn: null,
    turnEndsAt: 0,
    currentBet: 0,
    minRaise: cfg.bigBlind,
    toAct: [],
    result: null,
    removed: [],
    announcement: "🤖 Croupier : en attente d'au moins 2 joueurs…",
    seq: 0,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now
  };
}

export function privateConfig(id, maxSeats, bigBlind) {
  const bb = PRIVATE_BLINDS.includes(bigBlind) ? bigBlind : 100;
  const seats = Math.min(6, Math.max(2, parseInt(maxSeats, 10) || 4));
  return {
    id,
    name: `Salon privé ${id.slice(5).toUpperCase()}`,
    category: 'private',
    maxSeats: seats,
    smallBlind: bb / 2,
    bigBlind: bb,
    minBuyIn: bb * 10,
    maxBuyIn: Math.min(50000, bb * 200),
    isPrivate: true
  };
}

const HAND_ON = (t) => t.status === 'playing';

function touch(table, now) {
  table.seq = (table.seq || 0) + 1;
  table.updatedAt = now;
  table.lastActivityAt = now;
}

function seatedKeys(table) {
  return table.seats.filter((k) => k && table.players[k] && !table.players[k].left);
}

// clés occupées en partant du siège suivant `fromSeat` (dans le sens des sièges)
function orderAfter(table, fromSeat) {
  const n = table.maxSeats;
  const out = [];
  for (let i = 1; i <= n; i++) {
    const k = table.seats[(fromSeat + i + n) % n];
    if (k && table.players[k] && !table.players[k].left) out.push(k);
  }
  return out;
}

function aliveKeys(table) {
  return Object.keys(table.players).filter((k) => {
    const p = table.players[k];
    return p.inHand && !p.folded;
  });
}

function canActKey(table, k) {
  const p = table.players[k];
  return p && p.inHand && !p.folded && !p.allIn && !p.left;
}

function log(table, msg) {
  table.announcement = msg;
}

function addRemoved(table, key, username, reason, now) {
  table.removed = (table.removed || []).filter((r) => now - r.at < 60000);
  table.removed.push({ key, username, reason, at: now });
}

/* ------------------------------------------------------------------------- */
/* ASSIS / DÉPART                                                            */
/* ------------------------------------------------------------------------- */
// Retourne { ok, error, player }
export function seatPlayer(table, opts, now) {
  const username = cleanUsername(opts.username);
  const key = normalizeKey(username);
  if (!key) return { ok: false, error: 'Pseudo invalide.' };
  if (!opts.secretHash) return { ok: false, error: 'Appareil non identifié.' };

  const existing = table.players[key];
  if (existing && !existing.left) {
    if (existing.secretHash === opts.secretHash) {
      existing.lastSeen = now;
      if (opts.avatar) existing.avatar = cleanAvatar(opts.avatar);
      return { ok: true, key, player: existing, already: true };
    }
    if (now - existing.lastSeen > TAKEOVER_MS) {
      // l'ancien appareil ne donne plus signe de vie : on reprend le siège
      existing.secretHash = opts.secretHash;
      existing.lastSeen = now;
      return { ok: true, key, player: existing, already: true };
    }
    return { ok: false, error: 'Ce pseudo est déjà assis à cette table depuis un autre appareil.' };
  }
  if (existing && existing.left) {
    return { ok: false, error: 'Ta main précédente se termine, réessaie dans quelques secondes.' };
  }

  const buyIn = Math.floor(Number(opts.buyIn));
  if (!Number.isFinite(buyIn) || buyIn < table.minBuyIn) {
    return { ok: false, error: `Mise de départ minimum : ${table.minBuyIn} €.` };
  }
  if (buyIn > table.maxBuyIn) {
    return { ok: false, error: `Mise de départ maximum : ${table.maxBuyIn} €.` };
  }
  // place demandée (chaise choisie dans la salle 3D) ; sinon la première libre
  const want = opts.seat === undefined || opts.seat === null || opts.seat === '' ? -1 : Math.floor(Number(opts.seat));
  let seat;
  if (want >= 0 && want < table.seats.length) {
    if (table.seats[want]) return { ok: false, error: 'Cette place vient d’être prise.' };
    seat = want;
  } else seat = table.seats.findIndex((k) => !k);
  if (seat < 0) return { ok: false, error: 'Table complète.' };

  const midHand = table.status === 'playing' || table.status === 'showdown' || table.status === 'countdown';
  const player = {
    username,
    avatar: cleanAvatar(opts.avatar),
    seat,
    stack: buyIn,
    bet: 0,
    total: 0,
    cards: [],
    inHand: false,
    folded: false,
    allIn: false,
    ready: false,
    sittingOut: midHand,
    left: false,
    missed: 0,
    status: midHand ? 'Attend la prochaine main' : 'Assis',
    lastAction: null,
    secretHash: opts.secretHash,
    joinedAt: now,
    lastSeen: now
  };
  table.players[key] = player;
  table.seats[seat] = key;
  log(table, `👤 ${username} s'est assis à la table.`);
  touch(table, now);
  return { ok: true, key, player };
}

// Retire un joueur. Retourne les jetons à lui rendre (cashout).
export function removePlayer(table, key, reason, now) {
  const p = table.players[key];
  if (!p || p.left) return 0;
  const cash = Math.max(0, Math.floor(p.stack || 0));
  const wasTurn = table.turn === key;

  addRemoved(table, key, p.username, reason, now);
  if (p.seat >= 0 && table.seats[p.seat] === key) table.seats[p.seat] = null;

  if (p.inHand && HAND_ON(table)) {
    // ses mises restent dans le pot, il est couché d'office
    p.folded = true;
    p.left = true;
    p.stack = 0;
    p.seat = -1;
    table.toAct = table.toAct.filter((k) => k !== key);
    log(table, `🚪 ${p.username} a quitté la table (${reason === 'timeout' ? 'déconnexion' : reason === 'afk' ? 'inactivité' : 'départ'}).`);
    touch(table, now);
    if (aliveKeys(table).length <= 1) {
      awardUncontested(table, now);
    } else if (wasTurn || !table.toAct.includes(table.turn)) {
      proceed(table, now);
    }
  } else if (p.inHand && table.status === 'showdown') {
    // main déjà jouée : on garde l'objet jusqu'au nettoyage (résultat affiché)
    p.left = true;
    p.stack = 0;
    p.seat = -1;
    touch(table, now);
  } else {
    delete table.players[key];
    log(table, `🚪 ${p.username} a quitté la table.`);
    touch(table, now);
  }
  return cash;
}

export function setReady(table, key, now) {
  const p = table.players[key];
  if (!p || p.left) return { ok: false, error: 'Tu n\'es pas assis à cette table.' };
  p.ready = true;
  p.status = 'Prêt';
  p.lastSeen = now;
  log(table, `👍 ${p.username} est prêt !`);
  touch(table, now);
  return { ok: true };
}

/* ------------------------------------------------------------------------- */
/* DÉROULEMENT D'UNE MAIN                                                    */
/* ------------------------------------------------------------------------- */
function cleanupAfterHand(table, now) {
  Object.keys(table.players).forEach((k) => {
    const p = table.players[k];
    if (p.left) {
      delete table.players[k];
      return;
    }
    if (p.stack <= 0) {
      // ruiné : quitte la table (rien à rendre)
      addRemoved(table, k, p.username, 'bust', now);
      if (p.seat >= 0 && table.seats[p.seat] === k) table.seats[p.seat] = null;
      delete table.players[k];
    }
  });
}

function postBlind(table, key, amount) {
  const p = table.players[key];
  const pay = Math.min(p.stack, amount);
  p.stack -= pay;
  p.bet += pay;
  p.total += pay;
  table.pot += pay;
  if (p.stack === 0) p.allIn = true;
  return pay;
}

function buildToAct(table, firstKey) {
  // joueurs pouvant encore agir, en partant de firstKey, dans l'ordre des sièges
  const startSeat = table.players[firstKey].seat;
  const n = table.maxSeats;
  const list = [];
  for (let i = 0; i < n; i++) {
    const k = table.seats[(startSeat + i) % n];
    if (k && canActKey(table, k)) list.push(k);
  }
  return list;
}

export function startHand(table, now) {
  cleanupAfterHand(table, now);
  const funded = seatedKeys(table).filter((k) => table.players[k].stack > 0);
  if (funded.length < 2) {
    table.status = 'waiting';
    table.phase = null;
    table.community = [];
    table.pot = 0;
    table.result = null;
    table.turn = null;
    table.toAct = [];
    Object.values(table.players).forEach((p) => {
      p.inHand = false; p.cards = []; p.bet = 0; p.total = 0; p.folded = false; p.allIn = false;
      p.sittingOut = false; p.status = p.ready ? 'Prêt' : 'Assis'; p.lastAction = null;
    });
    log(table, "🤖 Croupier : en attente d'au moins 2 joueurs…");
    touch(table, now);
    return false;
  }

  table.handId += 1;
  table.deck = createShuffledDeck();
  table.community = [];
  table.pot = 0;
  table.result = null;
  table.phase = 'preflop';
  table.status = 'playing';

  Object.values(table.players).forEach((p) => {
    p.inHand = false; p.cards = []; p.bet = 0; p.total = 0; p.folded = false; p.allIn = false;
    p.lastAction = null; p.handName = null; p.won = 0; p.status = '';
  });

  // bouton du donneur : prochain siège occupé après l'ancien
  const order = orderAfter(table, table.dealerSeat < 0 ? table.maxSeats - 1 : table.dealerSeat).filter((k) => funded.includes(k));
  const dealerKey = order[0];
  table.dealerSeat = table.players[dealerKey].seat;

  // positions autour de la table à partir du donneur
  const around = orderAfter(table, table.dealerSeat).filter((k) => funded.includes(k)); // sb, bb, ..., dealer (dernier)
  const headsUp = funded.length === 2;
  const sbKey = headsUp ? dealerKey : around[0];
  const bbKey = headsUp ? around[0] : around[1];
  table.sbSeat = table.players[sbKey].seat;
  table.bbSeat = table.players[bbKey].seat;

  funded.forEach((k) => {
    const p = table.players[k];
    p.inHand = true;
    p.sittingOut = false;
    p.ready = true;
    p.status = '';
  });

  // distribution (2 cartes chacune, en partant de la petite blinde)
  const dealOrder = [sbKey, ...around.filter((k) => k !== sbKey)];
  if (!dealOrder.includes(dealerKey)) dealOrder.push(dealerKey);
  for (let r = 0; r < 2; r++) {
    dealOrder.forEach((k) => table.players[k].cards.push(table.deck.pop()));
  }

  postBlind(table, sbKey, table.smallBlind);
  postBlind(table, bbKey, table.bigBlind);
  table.players[sbKey].status = `Petite blinde ${table.players[sbKey].bet} €`;
  table.players[bbKey].status = `Grosse blinde ${table.players[bbKey].bet} €`;

  table.currentBet = Math.max(table.players[sbKey].bet, table.players[bbKey].bet);
  table.minRaise = table.bigBlind;

  // premier à parler : après la grosse blinde (en duel : le donneur / petite blinde)
  const firstKey = headsUp ? sbKey : (around[2] || sbKey);
  const toAct = buildToAct(table, firstKey);
  table.toAct = toAct;
  if (toAct.length === 1 && table.players[toAct[0]].bet >= table.currentBet) table.toAct = [];

  log(table, `🃏 Main n°${table.handId} : cartes distribuées !`);
  touch(table, now);

  if (table.toAct.length === 0) {
    // blindes all-in : on déroule directement
    advanceStreet(table, now);
  } else {
    table.turn = table.toAct[0];
    table.turnEndsAt = now + TURN_MS;
  }
  return true;
}

function nextStreetCards(table) {
  table.deck.pop(); // carte brûlée
  if (table.phase === 'preflop') { table.phase = 'flop'; table.community.push(table.deck.pop(), table.deck.pop(), table.deck.pop()); }
  else if (table.phase === 'flop') { table.phase = 'turn'; table.community.push(table.deck.pop()); }
  else if (table.phase === 'turn') { table.phase = 'river'; table.community.push(table.deck.pop()); }
}

function advanceStreet(table, now) {
  for (let guard = 0; guard < 6; guard++) {
    Object.values(table.players).forEach((p) => { p.bet = 0; });
    table.currentBet = 0;
    table.minRaise = table.bigBlind;

    if (table.phase === 'river') {
      showdown(table, now);
      return;
    }
    nextStreetCards(table);

    // premier à parler : premier joueur actif après le donneur
    const after = orderAfter(table, table.dealerSeat);
    const first = after.find((k) => canActKey(table, k));
    const toAct = first ? buildToAct(table, first) : [];
    // moins de 2 joueurs capables de miser => on déroule les cartes sans enchères
    if (toAct.length >= 2) {
      table.toAct = toAct;
      table.turn = toAct[0];
      table.turnEndsAt = now + TURN_MS;
      const label = table.phase === 'flop' ? '🃏 Flop' : table.phase === 'turn' ? '⚡ Turn' : '🌊 River';
      log(table, `${label} dévoilé !`);
      touch(table, now);
      return;
    }
    table.toAct = [];
    table.allInRunout = true;
  }
}

// Après chaque action : prochaine personne, fin du tour d'enchères ou de la main
function proceed(table, now) {
  if (aliveKeys(table).length <= 1) {
    awardUncontested(table, now);
    return;
  }
  // retire ceux qui ne peuvent plus agir
  table.toAct = table.toAct.filter((k) => canActKey(table, k));
  if (table.toAct.length > 0) {
    table.turn = table.toAct[0];
    table.turnEndsAt = now + TURN_MS;
    touch(table, now);
    return;
  }
  advanceStreet(table, now);
}

function payPots(table, now, contested) {
  const entries = Object.keys(table.players)
    .filter((k) => table.players[k].inHand)
    .map((k) => ({ key: k, total: table.players[k].total, folded: table.players[k].folded }));
  const pots = buildPots(entries);

  const scores = {};
  if (contested) {
    aliveKeys(table).forEach((k) => {
      const p = table.players[k];
      const ev = evaluateBest([...p.cards, ...table.community]);
      scores[k] = ev;
      p.handName = ev.name;
    });
  }

  const resultPots = [];
  const order = orderAfter(table, table.dealerSeat >= 0 ? table.dealerSeat : 0);
  pots.forEach((pot, idx) => {
    let winners;
    if (!contested) {
      winners = pot.eligible.slice(0, 1);
    } else {
      let best = -1;
      winners = [];
      pot.eligible.forEach((k) => {
        const s = scores[k] ? scores[k].score : -1;
        if (s > best) { best = s; winners = [k]; } else if (s === best) winners.push(k);
      });
    }
    // jetons impairs au premier gagnant à gauche du donneur
    winners.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let rest = pot.amount - share * winners.length;
    winners.forEach((k) => {
      const gain = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      const p = table.players[k];
      p.stack += gain;
      p.won = (p.won || 0) + gain;
    });
    resultPots.push({
      index: idx,
      amount: pot.amount,
      winners: winners.map((k) => ({ key: k, username: table.players[k].username, handName: contested && scores[k] ? scores[k].name : null })),
      main: idx === 0
    });
  });
  return resultPots;
}

function showdown(table, now) {
  const resultPots = payPots(table, now, true);
  const revealed = aliveKeys(table);
  const winnersSet = new Set();
  resultPots.forEach((p) => p.winners.forEach((w) => winnersSet.add(w.key)));
  Object.keys(table.players).forEach((k) => {
    const p = table.players[k];
    if (!p.inHand) return;
    p.status = winnersSet.has(k) ? '👑 Vainqueur !' : (p.folded ? 'Couché' : 'Perdu');
  });
  const main = resultPots[0];
  const names = main ? main.winners.map((w) => w.username).join(' & ') : '';
  const total = resultPots.reduce((s, p) => s + p.amount, 0);
  table.result = { uncontested: false, pots: resultPots, revealed, total };
  table.status = 'showdown';
  table.phase = 'showdown';
  table.turn = null;
  table.toAct = [];
  table.turnEndsAt = 0;
  table.nextHandAt = now + SHOWDOWN_MS;
  table.allInRunout = false;
  log(table, main && main.winners.length > 1
    ? `🤝 Égalité ! Pot partagé entre ${names} (${main.winners[0].handName}).`
    : `🏆 ${names} remporte le pot avec ${main && main.winners[0].handName} !`);
  touch(table, now);
}

function awardUncontested(table, now) {
  const resultPots = payPots(table, now, false);
  const alive = aliveKeys(table);
  const winner = alive[0] ? table.players[alive[0]] : null;
  Object.keys(table.players).forEach((k) => {
    const p = table.players[k];
    if (!p.inHand) return;
    p.status = k === alive[0] ? '👑 Vainqueur !' : 'Couché';
  });
  const total = resultPots.reduce((s, p) => s + p.amount, 0);
  table.result = { uncontested: true, pots: resultPots, revealed: [], total };
  table.status = 'showdown';
  table.phase = 'showdown';
  table.turn = null;
  table.toAct = [];
  table.turnEndsAt = 0;
  table.nextHandAt = now + Math.min(SHOWDOWN_MS, 5000);
  table.allInRunout = false;
  log(table, winner ? `🏆 ${winner.username} remporte le pot de ${total} € (tous couchés).` : 'Main terminée.');
  touch(table, now);
}

/* ------------------------------------------------------------------------- */
/* ACTIONS DES JOUEURS                                                       */
/* ------------------------------------------------------------------------- */
export function act(table, key, action, amount, now) {
  if (!HAND_ON(table)) return { ok: false, error: "Aucune main en cours." };
  const p = table.players[key];
  if (!p || p.left || !p.inHand || p.folded) return { ok: false, error: "Tu n'es pas dans cette main." };
  if (table.turn !== key) return { ok: false, error: "Ce n'est pas ton tour." };

  const toCall = Math.max(0, table.currentBet - p.bet);
  p.lastSeen = now;
  p.missed = 0;

  const queueOthersAfter = () => {
    const after = orderAfter(table, p.seat);
    table.toAct = after.filter((k) => k !== key && canActKey(table, k) && table.players[k].bet < table.currentBet);
  };

  if (action === 'fold') {
    p.folded = true;
    p.status = 'Couché';
    p.lastAction = 'fold';
    table.toAct = table.toAct.filter((k) => k !== key);
    log(table, `${p.username} se couche.`);
  } else if (action === 'check') {
    if (toCall > 0) return { ok: false, error: `Tu dois suivre (${toCall} €) ou te coucher.` };
    p.status = 'Parole';
    p.lastAction = 'check';
    table.toAct = table.toAct.filter((k) => k !== key);
    log(table, `${p.username} parle.`);
  } else if (action === 'call') {
    if (toCall === 0) {
      p.status = 'Parole';
      p.lastAction = 'check';
    } else {
      const pay = Math.min(p.stack, toCall);
      p.stack -= pay; p.bet += pay; p.total += pay; table.pot += pay;
      if (p.stack === 0) p.allIn = true;
      p.status = p.allIn ? `Tapis (${p.bet} €)` : `Suit (${p.bet} €)`;
      p.lastAction = p.allIn ? 'allin' : 'call';
    }
    table.toAct = table.toAct.filter((k) => k !== key);
    log(table, `${p.username} ${p.allIn ? 'est à tapis' : toCall === 0 ? 'parle' : 'suit'}.`);
  } else if (action === 'raise' || action === 'allin') {
    const maxTo = p.bet + p.stack;
    let target = action === 'allin' ? maxTo : Math.floor(Number(amount));
    if (!Number.isFinite(target)) return { ok: false, error: 'Montant invalide.' };
    if (target > maxTo) target = maxTo;
    if (action === 'raise' && target <= table.currentBet && target < maxTo) {
      return { ok: false, error: `Relance minimum : ${table.currentBet + table.minRaise} €.` };
    }
    const minTo = table.currentBet + table.minRaise;
    if (target < minTo && target < maxTo && target > table.currentBet) {
      return { ok: false, error: `Relance minimum : ${Math.min(minTo, maxTo)} €.` };
    }
    const pay = target - p.bet;
    if (pay <= 0) return { ok: false, error: 'Montant invalide.' };
    p.stack -= pay; p.bet += pay; p.total += pay; table.pot += pay;
    if (p.stack === 0) p.allIn = true;

    if (p.bet > table.currentBet) {
      const size = p.bet - table.currentBet;
      if (size >= table.minRaise) table.minRaise = size; // relance complète
      table.currentBet = p.bet;
      queueOthersAfter();
      p.status = p.allIn ? `Tapis (${p.bet} €) 🔥` : `Relance ${p.bet} €`;
      p.lastAction = p.allIn ? 'allin' : 'raise';
      log(table, p.allIn ? `🔥 ${p.username} est à tapis (${p.bet} €) !` : `${p.username} relance à ${p.bet} €.`);
    } else {
      // tapis trop court pour relancer = simple « suivre »
      table.toAct = table.toAct.filter((k) => k !== key);
      p.status = `Tapis (${p.bet} €)`;
      p.lastAction = 'allin';
      log(table, `🔥 ${p.username} est à tapis (${p.bet} €).`);
    }
  } else {
    return { ok: false, error: 'Action inconnue.' };
  }

  touch(table, now);
  proceed(table, now);
  return { ok: true };
}

/* ------------------------------------------------------------------------- */
/* CROUPIER AUTOMATIQUE (appelé à chaque requête)                            */
/* ------------------------------------------------------------------------- */
// Retourne { changed, cashouts:[{key, username, amount, secretHash}] }
export function step(table, now) {
  let changed = false;
  const cashouts = [];

  for (let guard = 0; guard < 8; guard++) {
    let did = false;

    // 1. joueurs déconnectés
    Object.keys(table.players).forEach((k) => {
      const p = table.players[k];
      if (!p.left && now - p.lastSeen > STALE_MS) {
        const secretHash = p.secretHash;
        const username = p.username;
        const amount = removePlayer(table, k, 'timeout', now);
        cashouts.push({ key: k, username, amount, secretHash });
        did = true;
      }
    });

    // 2. états
    if (table.status === 'waiting') {
      const seated = seatedKeys(table).filter((k) => table.players[k].stack > 0);
      const ready = seated.filter((k) => table.players[k].ready);
      if (seated.length >= 2 && ready.length === seated.length) {
        table.status = 'countdown';
        table.countdownEndsAt = now + COUNTDOWN_MS;
        log(table, `🤖 Tous les joueurs sont prêts ! La donne commence dans ${COUNTDOWN_MS / 1000}s…`);
        touch(table, now);
        did = true;
      } else if (seated.length >= 2) {
        const msg = `🤖 ${ready.length}/${seated.length} joueurs prêts. Clique sur « JE SUIS PRÊT » !`;
        if (table.announcement !== msg) { table.announcement = msg; did = true; table.updatedAt = now; table.seq++; }
      }
    } else if (table.status === 'countdown') {
      const seated = seatedKeys(table).filter((k) => table.players[k].stack > 0);
      const ready = seated.filter((k) => table.players[k].ready);
      if (seated.length < 2 || ready.length < seated.length) {
        table.status = 'waiting';
        log(table, "🤖 Un joueur n'est plus prêt ou a quitté la table.");
        touch(table, now);
        did = true;
      } else if (now >= table.countdownEndsAt) {
        startHand(table, now);
        did = true;
      }
    } else if (table.status === 'playing') {
      if (table.turn && table.turnEndsAt && now > table.turnEndsAt) {
        const key = table.turn;
        const p = table.players[key];
        if (p) {
          const toCall = Math.max(0, table.currentBet - p.bet);
          p.missed = (p.missed || 0) + 1;
          const missed = p.missed;
          const username = p.username;
          const secretHash = p.secretHash;
          table.turnEndsAt = now; // évite une boucle
          if (toCall === 0) {
            p.status = 'Parole (temps)';
            p.lastAction = 'check';
            table.toAct = table.toAct.filter((k) => k !== key);
            log(table, `⏱️ ${username} a dépassé son temps : parole automatique.`);
            touch(table, now);
            proceed(table, now);
          } else {
            p.folded = true;
            p.status = 'Couché (temps)';
            p.lastAction = 'fold';
            table.toAct = table.toAct.filter((k) => k !== key);
            log(table, `⏱️ ${username} a dépassé son temps : il se couche.`);
            touch(table, now);
            proceed(table, now);
          }
          if (missed >= MAX_MISSED_TURNS && table.players[key]) {
            const amount = removePlayer(table, key, 'afk', now);
            cashouts.push({ key, username, amount, secretHash });
          }
          did = true;
        }
      }
    } else if (table.status === 'showdown') {
      if (now >= table.nextHandAt) {
        startHand(table, now);
        did = true;
      }
    }

    if (!did) break;
    changed = true;
  }

  return { changed, cashouts };
}

/* ------------------------------------------------------------------------- */
/* VUES PUBLIQUES (cartes adverses masquées)                                 */
/* ------------------------------------------------------------------------- */
const HIDDEN = () => ({ hidden: true });

export function publicView(table, viewerKey, authed, now) {
  const revealed = new Set(table.result && !table.result.uncontested ? table.result.revealed : []);
  const showCards = table.status === 'showdown';

  const seats = table.seats.map((k, i) => {
    if (!k || !table.players[k]) return null;
    const p = table.players[k];
    let cards = [];
    if (p.inHand && p.cards.length) {
      if (authed && k === viewerKey) cards = p.cards;
      else if (showCards && revealed.has(k)) cards = p.cards;
      else if (!p.folded) cards = p.cards.map(HIDDEN);
    }
    return {
      seat: i,
      key: k,
      username: p.username,
      avatar: p.avatar,
      stack: p.stack,
      bet: p.bet,
      total: p.total,
      cards,
      inHand: p.inHand,
      folded: p.folded,
      allIn: p.allIn,
      ready: p.ready,
      sittingOut: p.sittingOut,
      status: p.status,
      lastAction: p.lastAction,
      handName: showCards && revealed.has(k) ? p.handName : null,
      won: p.won || 0,
      idleMs: Math.max(0, now - p.lastSeen)
    };
  });

  const me = viewerKey && authed && table.players[viewerKey] && !table.players[viewerKey].left
    ? table.players[viewerKey]
    : null;
  let meInfo = null;
  if (me) {
    const toCall = Math.max(0, table.currentBet - me.bet);
    meInfo = {
      key: viewerKey,
      seat: me.seat,
      stack: me.stack,
      toCall: Math.min(toCall, me.stack),
      canCheck: toCall === 0,
      isTurn: table.turn === viewerKey && table.status === 'playing',
      minRaiseTo: Math.min(me.bet + me.stack, table.currentBet + table.minRaise),
      maxRaiseTo: me.bet + me.stack,
      ready: me.ready
    };
  }

  const removedMe = viewerKey && authed
    ? (table.removed || []).filter((r) => r.key === viewerKey && now - r.at < 60000).slice(-1)[0] || null
    : null;

  return {
    v: PROTOCOL,
    tableId: table.tableId,
    name: table.name,
    category: table.category,
    isPrivate: table.isPrivate,
    maxSeats: table.maxSeats,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    minBuyIn: table.minBuyIn,
    maxBuyIn: table.maxBuyIn,
    handId: table.handId,
    status: table.status,
    phase: table.phase,
    pot: table.pot,
    community: table.community,
    currentBet: table.currentBet,
    minRaise: table.minRaise,
    turn: table.turn,
    turnEndsAt: table.turnEndsAt,
    countdownEndsAt: table.countdownEndsAt,
    nextHandAt: table.nextHandAt,
    dealerSeat: table.dealerSeat,
    sbSeat: table.sbSeat,
    bbSeat: table.bbSeat,
    allInRunout: !!table.allInRunout,
    announcement: table.announcement,
    result: table.result
      ? { uncontested: table.result.uncontested, total: table.result.total, pots: table.result.pots, revealed: table.result.revealed }
      : null,
    seats,
    me: meInfo,
    removedMe,
    seq: table.seq,
    serverTime: now
  };
}

export function tableSummary(table) {
  const seated = seatedKeys(table).map((k) => ({ username: table.players[k].username, avatar: table.players[k].avatar, seat: table.players[k].seat }));
  return {
    id: table.tableId,
    name: table.name,
    category: table.category,
    maxSeats: table.maxSeats,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    minBuyIn: table.minBuyIn,
    maxBuyIn: table.maxBuyIn,
    status: table.status,
    count: seated.length,
    players: seated
  };
}
