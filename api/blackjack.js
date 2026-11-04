// Vercel Serverless Function pour l'API /api/blackjack reliée à Supabase Cloud
import { actorOf } from './_auth.js';
import { walletCharge, walletPay } from './_wallet.js';
import { randomInt } from 'node:crypto';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gyjyncljhlatomnbmwxa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee';

const SUITS = [
  { s: '♠', color: 'text-slate-900', type: 'suit-black' },
  { s: '♣', color: 'text-slate-900', type: 'suit-black' },
  { s: '♥', color: 'text-red-500', type: 'suit-red' },
  { s: '♦', color: 'text-red-500', type: 'suit-red' }
];

const RANKS = [
  { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 }, { r: '5', v: 5 },
  { r: '6', v: 6 }, { r: '7', v: 7 }, { r: '8', v: 8 }, { r: '9', v: 9 },
  { r: '10', v: 10 }, { r: 'J', v: 10 }, { r: 'Q', v: 10 }, { r: 'K', v: 10 },
  { r: 'A', v: 11 }
];

export function createShuffledDeck() {
  const deck = [];
  SUITS.forEach(st => {
    RANKS.forEach(rk => {
      deck.push({
        r: rk.r,
        v: rk.v,
        s: st.s,
        color: st.color,
        type: st.type
      });
    });
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function calcScore(hand) {
  if (!Array.isArray(hand)) return 0;
  let t = 0;
  let a = 0;
  hand.forEach(c => {
    if (!c) return;
    if (c.r === 'A') {
      a++;
      t += 11;
    } else if (['K', 'Q', 'J'].includes(c.r)) {
      t += 10;
    } else {
      t += parseInt(c.r, 10) || 0;
    }
  });
  while (t > 21 && a > 0) {
    t -= 10;
    a--;
  }
  return t;
}

let memoryTables = {};
let lastSupabaseFetchTime = 0;
const SUPABASE_CACHE_TTL = 700; // ms

async function getFreshTables(force = false) {
  const now = Date.now();
  if (!force && memoryTables && Object.keys(memoryTables).length > 0 && (now - lastSupabaseFetchTime < SUPABASE_CACHE_TTL)) {
    return memoryTables;
  }
  const remote = await fetchSupabaseTables();
  if (remote && typeof remote === 'object') {
    Object.keys(remote).forEach(k => {
      if (!memoryTables[k] || (remote[k].updatedAt || 0) >= (memoryTables[k].updatedAt || 0)) {
        memoryTables[k] = remote[k];
      }
    });
    lastSupabaseFetchTime = now;
  }
  return memoryTables;
}

const PUBLIC_TABLE_IDS = ['bj_pub_1', 'bj_pub_2', 'bj_pub_3', 'bj_pub_4', 'bj_pub_5'];

function cleanInactiveTables(tables, now) {
  let changed = false;
  Object.keys(tables).forEach(tId => {
    if (!PUBLIC_TABLE_IDS.includes(tId.toLowerCase())) {
      delete tables[tId];
      changed = true;
    }
  });
  return changed;
}

function getDefaultTable(tableId) {
  return {
    tableId: tableId || 'bj_pub_1',
    roundId: 0,
    status: 'waiting', // 'waiting', 'playing', 'dealer_turn', 'finished'
    deck: [],
    dealer: { cards: [], score: 0, hidden: true },
    players: {},
    playerOrder: [],
    turn: null,
    history: [],
    forfeit: null,
    readyBets: {},
    readyPlayers: {},   // « Prêt » : { joueur: nombre de joueurs assis annoncé à ce moment (1 ou 2) }
    turnDeadline: 0,
    knownPlayers: {},
    host: null,
    hasPlayedRound: false,
    bettingStartTime: 0,   // dès la 1re mise : les autres ont BJ_BET_COUNTDOWN_MS pour la rejoindre (même manche pour tous)
    updatedAt: Date.now()
  };
}

async function fetchSupabaseTables() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts?username=eq.__blackjack_game__`, {
      cache: 'no-store',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.data?.tables) {
        return rows[0].data.tables;
      }
    }
  } catch (e) {
    console.warn('Erreur GET Supabase Blackjack:', e);
  }
  return null;
}

async function saveSupabaseTables(tables) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !tables) return;
  try {
    const row = {
      username: '__blackjack_game__',
      password: 'sys',
      avatar: '🃏',
      balance: 0,
      data: { tables },
      updated_at: new Date().toISOString()
    };
    await fetch(`${SUPABASE_URL}/rest/v1/accounts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    });
  } catch (e) {
    console.warn('Erreur POST Supabase Blackjack:', e);
  }
}


/* ============================ PORTEFEUILLE (serveur) ============================
   Toutes les mises et tous les gains passent par ces fonctions. Chaque opération porte une
   clé unique : rejouée, elle ne s'applique jamais deux fois (pas de double paiement). */
const BJ_MIN_BET = 10;   // pas de mise maximale : seul le solde limite (walletCharge refuse si le solde est insuffisant)
export const BJ_TURN_MS = 10000;   // temps pour jouer (tous en même temps) ; chaque carte tirée relance ce délai, passé ce délai ceux qui n'ont pas joué restent automatiquement
export const BJ_BET_COUNTDOWN_MS = 10000;   // dès qu'un joueur mise, les autres ont 10 s pour miser aussi : la manche est la même pour tous ceux qui ont misé à temps
const clampBet = (v, fallback) => Math.max(BJ_MIN_BET, Math.floor(Number(v)) || fallback || 100);

export async function bjCharge(username, key, amount) { await walletCharge(username, key, amount); }
export async function bjPay(username, key, amount) { await walletPay(username, key, amount); }

// Règle la table : paie les gains d'une manche terminée, ou rembourse une manche interrompue.
// Sans danger si elle est appelée plusieurs fois (clés uniques).
export async function settleTable(table) {
  if (!table || !table.charged || table.settled) return;
  const tid = table.tableId;
  const rid = table.roundId;
  const finished = table.status === 'finished';
  for (const pKey of Object.keys(table.charged)) {
    const p = table.players && table.players[pKey];
    const name = (p && p.username) || pKey;
    if (finished) {
      const amount = p && p.payout > 0 ? p.payout : 0;
      if (amount > 0) await bjPay(name, `p:${tid}:${rid}:${pKey}`, amount);
    } else {
      const spent = table.charged[pKey] || 0;
      if (spent > 0) await bjPay(name, `rf:${tid}:${rid}:${pKey}`, spent);
    }
  }
  table.settled = true;
}

// vue envoyée aux navigateurs : jamais le paquet de cartes, jamais la carte cachée du croupier
const BACK_CARD = { r: '?', v: 0, s: '♠', color: 'text-slate-900', type: 'suit-black' };
export function publicTable(table, viewer) {
  const t = { ...table };
  delete t.deck;
  delete t.charged;
  t.bettingDuration = BJ_BET_COUNTDOWN_MS;
  t.serverNow = Date.now();   // pour que le compte à rebours s'affiche juste même si l'horloge du navigateur dérive
  t.turnDuration = BJ_TURN_MS;
  // « Prêt » : combien de joueurs sont prêts sur combien (ceux qui ont misé, ou les joueurs assis annoncés par un « Prêt »)
  const bettors = Object.keys(table.readyBets || {}).filter((k) => (table.readyBets[k] || 0) >= BJ_MIN_BET);
  const rp = table.readyPlayers || {};
  t.readyCount = bettors.filter((k) => rp[k]).length;
  t.readyTotal = Math.max(bettors.length, ...bettors.map((k) => Number(rp[k]) || 0), 0);
  // le jeu est simultané : `turn` ne désigne plus qu'un joueur encore en train de jouer (le joueur qui regarde, sinon le premier), pour l'ancien blackjack 2D
  if (t.status === 'playing' && table.players) {
    const v = String(viewer || '').toLowerCase().trim();
    const playing = Object.keys(table.players).filter((k) => table.players[k] && table.players[k].status === 'playing');
    t.turn = (v && playing.includes(v)) ? v : (playing[0] || t.turn);
  }
  if (t.dealer) {
    const hide = t.status === 'playing' || t.status === 'dealer_turn';
    t.dealer = { ...t.dealer };
    if (hide && Array.isArray(t.dealer.cards)) {
      t.dealer.cards = t.dealer.cards.map((c, i) => (i === 0 ? c : BACK_CARD));
      t.dealer.score = t.dealer.cards[0] ? calcScore([t.dealer.cards[0]]) : 0;
      t.dealer.hidden = true;
    }
  }
  return t;
}

const startingTables = new Set();
async function startRound(table, participants, now) {
  const roundId = now;
  const done = [];
  const list = participants.map((p) => ({ ...p, bet: clampBet(p.bet) }));
  try {
    for (const p of list) {
      await bjCharge(p.username, `c:${table.tableId}:${roundId}:${p.username.toLowerCase().trim()}`, p.bet);
      done.push(p);
    }
  } catch (e) {
    for (const p of done) {
      await bjPay(p.username, `cf:${table.tableId}:${roundId}:${p.username.toLowerCase().trim()}`, p.bet).catch(() => {});
    }
    throw e;
  }
  startServerDeal(table, list, now);
  table.charged = {};
  list.forEach((p) => { table.charged[p.username.toLowerCase().trim()] = p.bet; });
  table.settled = false;
}

// Démarre la manche avec tout le monde qui a misé (1 seul suffit) : appelée quand le délai de 10 s est passé
// (force=true), ou tout de suite si quelqu'un clique sur « Prêt » (force=true aussi, pour ne plus attendre).
async function tryAutoStart(tableId, table, now, force) {
  if (table.status !== 'waiting' || !table.bettingStartTime) return false;
  if (!force && now - table.bettingStartTime < BJ_BET_COUNTDOWN_MS) return false;
  const bettorKeys = Object.keys(table.readyBets || {}).filter((k) => (table.readyBets[k] || 0) >= BJ_MIN_BET);
  table.bettingStartTime = 0;
  if (!bettorKeys.length) return false;
  if (startingTables.has(tableId)) return false;
  startingTables.add(tableId);
  try {
    const participants = bettorKeys.map((k) => {
      const kp = (table.knownPlayers && table.knownPlayers[k]) || {};
      return { username: kp.username || k, avatar: kp.avatar || '👤', bet: table.readyBets[k], spot: kp.spot === 1 ? 1 : 0 };
    });
    await startRound(table, participants, now);
    return true;
  } catch (e) {
    // mise refusée (solde insuffisant entre-temps) : on retire ce joueur, les autres pourront relancer la minuterie à leur prochaine mise
    if (e && e.extra && e.extra.who && table.readyBets) delete table.readyBets[e.extra.who];
    return false;
  } finally {
    startingTables.delete(tableId);
  }
}

function advanceTurnOrFinish(table) {
  const activeKeys = table.playerOrder || Object.keys(table.players);
  const stillPlaying = activeKeys.filter((k) => table.players[k] && table.players[k].status === 'playing');

  // jeu simultané : la manche continue tant qu'au moins un joueur n'a pas fini (les autres attendent)
  if (stillPlaying.length) {
    table.turn = stillPlaying[0];
    table.status = 'playing';
    return;
  }

  // Tous les joueurs ont fini -> Tour du Croupier
  table.turn = 'dealer';
  table.status = 'dealer_turn';
  table.dealer.hidden = false;
  table.dealer.score = calcScore(table.dealer.cards);

  // Vérifier si au moins un joueur n'a pas sauté
  const anyNotBusted = activeKeys.some(k => table.players[k] && table.players[k].status !== 'busted');

  if (anyNotBusted) {
    while (table.dealer.score < 17 && table.deck.length > 0) {
      table.dealer.cards.push(table.deck.pop());
      table.dealer.score = calcScore(table.dealer.cards);
    }
  }

  const dScore = table.dealer.score;

  // Calcul des gains et résultats
  activeKeys.forEach(k => {
    const p = table.players[k];
    if (!p) return;
    const pScore = p.score;
    if (p.status === 'busted') {
      p.result = 'lose';
      p.payout = 0;
    } else if (dScore > 21 || pScore > dScore) {
      p.result = 'win';
      p.payout = p.status === 'blackjack' ? Math.floor(p.bet * 2.5) : p.bet * 2;
    } else if (pScore === dScore) {
      p.result = 'push';
      p.payout = p.bet;
    } else {
      p.result = 'lose';
      p.payout = 0;
    }
  });

  table.status = 'finished';
  table.finishedAt = Date.now();
  table.hasPlayedRound = true;
}

function startServerDeal(table, participants, now) {
  table.roundId = now;
  table.status = 'playing';
  table.deck = createShuffledDeck();
  table.dealer = {
    cards: [table.deck.pop(), table.deck.pop()],
    score: 0,
    hidden: true
  };
  table.dealer.score = calcScore([table.dealer.cards[0]]);

  table.players = {};
  table.playerOrder = [];
  table.forfeit = null;
  table.readyPlayers = {};
  table.hasPlayedRound = true;
  if (!table.knownPlayers) table.knownPlayers = {};

  participants.forEach(p => {
    const pKey = (p.username || '').toLowerCase().trim();
    if (!pKey) return;
    table.knownPlayers[pKey] = { ...(table.knownPlayers[pKey] || {}), username: p.username, avatar: p.avatar || '👤', spot: p.spot === 1 ? 1 : 0 };
    const hand = [table.deck.pop(), table.deck.pop()];
    const sc = calcScore(hand);
    const isBJ = sc === 21;

    const recordedBet = (table.readyBets && table.readyBets[pKey]) ? table.readyBets[pKey] : null;
    const playerBet = Math.max(10, parseInt(p.bet) || recordedBet || 100);

    table.players[pKey] = {
      username: p.username,
      avatar: p.avatar || '👤',
      spot: p.spot === 1 ? 1 : 0,   // place (0 ou 1) à la table 3D, pour que tout le monde pose les cartes au bon endroit
      bet: playerBet,
      cards: hand,
      score: sc,
      status: isBJ ? 'blackjack' : 'playing',
      double: false,
      result: null,
      payout: 0
    };
    table.playerOrder.push(pKey);
  });

  table.turnDeadline = now + BJ_TURN_MS;
  advanceTurnOrFinish(table);
  table.updatedAt = now;
}

// temps écoulé : ceux qui n'ont pas joué restent automatiquement, puis le croupier joue
function autoPlayTimeouts(table, now) {
  if (table.status !== 'playing' || !table.turnDeadline || now < table.turnDeadline) return false;
  Object.keys(table.players || {}).forEach((k) => {
    const p = table.players[k];
    if (p && p.status === 'playing') { p.status = 'stand'; p.auto = true; }
  });
  advanceTurnOrFinish(table);
  table.updatedAt = now;
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Récupération ultra-rapide des tables (cache mémoire prioritaire)
  let tables = await getFreshTables(false);

  const now = Date.now();

  // GET
  if (req.method === 'GET') {
    let modified = cleanInactiveTables(tables, now);

    // Endpoint list_tables
    if (req.query.action === 'list_tables' || req.query.list === 'true') {
      const publicSummaries = [1, 2, 3, 4, 5].map(num => {
        const pId = `bj_pub_${num}`;
        const tbl = tables[pId] || getDefaultTable(pId);
        const playerKeys = Object.keys(tbl.players || {});
        const knownKeys = Object.keys(tbl.knownPlayers || {});
        const activeKeys = Array.from(new Set([...playerKeys, ...knownKeys]));
        const players = activeKeys.map(k => {
          const p = tbl.players?.[k] || tbl.knownPlayers?.[k] || {};
          return { username: p.username || k, avatar: p.avatar || '👤' };
        });
        return {
          tableId: pId,
          status: tbl.status,
          playerCount: Math.min(2, players.length),
          isFull: players.length >= 2,
          players: players.slice(0, 2)
        };
      });

      if (modified) {
        memoryTables = tables;
        saveSupabaseTables(tables).catch(() => {});
      }

      return res.status(200).json({
        ok: true,
        publicTables: publicSummaries
      });
    }

    let rawTableId = (req.query.table || req.query.tableId || 'bj_pub_1').toLowerCase().trim();
    if (!PUBLIC_TABLE_IDS.includes(rawTableId)) rawTableId = 'bj_pub_1';
    const tableId = rawTableId;

    let table = tables[tableId];
    if (!table) {
      table = getDefaultTable(tableId);
      tables[tableId] = table;
    }

    // 1. Auto-nettoyage d'une manche finie depuis plus de 3.2 secondes -> retour table propre en attente
    //    (chacun remise pour la manche suivante : pas de remise automatique de l'ancienne mise)
    if (table.status === 'finished' && table.finishedAt && (now - table.finishedAt > 3200)) {
      await settleTable(table);
      const prevHost = table.host || null;
      const prevKnown = table.knownPlayers || {};
      table = getDefaultTable(tableId);
      table.host = prevHost;
      table.knownPlayers = prevKnown;
      table.hasPlayedRound = true;
      tables[tableId] = table;
      modified = true;
    }

    // 1bis. Mise posée depuis BJ_BET_COUNTDOWN_MS et personne n'a relancé entre-temps : la manche démarre quand même (seul si besoin)
    if (table.status === 'waiting' && table.bettingStartTime && now - table.bettingStartTime >= BJ_BET_COUNTDOWN_MS) {
      if (await tryAutoStart(tableId, table, now, true)) modified = true;
    }

    // 1ter. Les 10 s pour jouer sont écoulées : ceux qui n'ont pas joué restent, le croupier joue
    if (autoPlayTimeouts(table, now)) modified = true;

    // 2. Détection d'abandon / inactivité en cours de partie ('playing' ou 'dealer_turn') - Limite de 30s par tour
    if (table.status === 'playing' || table.status === 'dealer_turn') {
      const timeSinceUpdate = now - (table.updatedAt || table.roundId || now);
      if (timeSinceUpdate > 30000) {
        // table abandonnée depuis plus de 30 s (plus personne ne sonde) -> manche remboursée, puis remise à zéro totale
        await settleTable(table);
        table = getDefaultTable(tableId);
        tables[tableId] = table;
        modified = true;
      }
    }

    if (table.status === 'finished') await settleTable(table);

    if (modified) {
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});
    }

    return res.status(200).json(publicTable(table, req.query.me));
  }

  // POST
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    let modified = cleanInactiveTables(tables, now);

    // toute action autre que la simple liste exige un joueur connecté, et il ne peut agir que pour lui-même
    if (body.action !== 'list_tables') {
      const actor = actorOf(req, body);
      if (!actor) return res.status(401).json({ ok: false, error: 'Connexion requise.' });
      if (body.username && String(body.username).toLowerCase().trim() !== actor) {
        return res.status(403).json({ ok: false, error: 'Tu ne peux jouer que pour toi.' });
      }
      if (!body.username) body.username = actor;
    }

    // Endpoint list_tables en POST
    if (body.action === 'list_tables') {
      const publicSummaries = [1, 2, 3, 4, 5].map(num => {
        const pId = `bj_pub_${num}`;
        const tbl = tables[pId] || getDefaultTable(pId);
        const playerKeys = Object.keys(tbl.players || {});
        const knownKeys = Object.keys(tbl.knownPlayers || {});
        const activeKeys = Array.from(new Set([...playerKeys, ...knownKeys]));
        const players = activeKeys.map(k => {
          const p = tbl.players?.[k] || tbl.knownPlayers?.[k] || {};
          return { username: p.username || k, avatar: p.avatar || '👤' };
        });
        return {
          tableId: pId,
          status: tbl.status,
          playerCount: Math.min(2, players.length),
          isFull: players.length >= 2,
          players: players.slice(0, 2)
        };
      });

      if (modified) {
        memoryTables = tables;
        saveSupabaseTables(tables).catch(() => {});
      }

      return res.status(200).json({
        ok: true,
        publicTables: publicSummaries
      });
    }

    let rawTableId = (body.tableId || 'bj_pub_1').toLowerCase().trim();
    if (!PUBLIC_TABLE_IDS.includes(rawTableId)) rawTableId = 'bj_pub_1';
    const tableId = rawTableId;

    let table = tables[tableId];
    if (!table) {
      table = getDefaultTable(tableId);
      tables[tableId] = table;
    }

    const action = body.action;
    const viewer = body.username;
    autoPlayTimeouts(table, now);
 
    // S. ENREGISTRER MA MISE (SET_BET) : la 1re mise sur une table en attente lance les 10 s pour que les autres rejoignent
    if (action === 'set_bet' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const betVal = Math.max(10, parseInt(body.bet) || 100);
      if (table.status !== 'waiting') return res.status(200).json({ ok: false, error: 'Une manche est déjà en cours sur cette table.', table: publicTable(table, viewer) });
      if (!table.readyBets || typeof table.readyBets !== 'object') table.readyBets = {};
      // 2 places à cette table : un 3e joueur ne peut pas miser ici (mais je peux changer ma propre mise)
      if (!table.readyBets[pKey] && Object.keys(table.readyBets).length >= 2) {
        return res.status(200).json({ ok: false, error: 'Cette table est déjà complète (2 joueurs).', table: publicTable(table, viewer) });
      }
      table.readyBets[pKey] = betVal;
      if (table.readyPlayers) delete table.readyPlayers[pKey];   // la mise change : il faut confirmer « Prêt » de nouveau
      if (!table.knownPlayers) table.knownPlayers = {};
      table.knownPlayers[pKey] = { username: body.username, avatar: body.avatar || '👤', spot: body.spot === 1 ? 1 : 0 };
      if (body.host && !table.host) table.host = body.host.toLowerCase().trim();
      if (!table.bettingStartTime) table.bettingStartTime = now;   // 1re mise de la manche : le compte à rebours démarre
      await tryAutoStart(tableId, table, now, false);
      table.updatedAt = now;
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});   // pour que les autres joueurs (autre instance serveur) voient ma mise tout de suite
      return res.status(200).json({ ok: true, started: table.status === 'playing', readyBets: table.readyBets, table: publicTable(table, viewer) });
    }

    // T. RETIRER MA MISE (UNSET_BET) : seulement avant que la manche ait démarré
    if (action === 'unset_bet' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      if (table.status === 'waiting' && table.readyBets) delete table.readyBets[pKey];
      if (table.readyPlayers) delete table.readyPlayers[pKey];
      if (table.readyBets && !Object.keys(table.readyBets).length) table.bettingStartTime = 0;
      table.updatedAt = now;
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});
      return res.status(200).json({ ok: true, table: publicTable(table, viewer) });
    }

    // R. « PRÊT » : on arrête d'attendre les 10 s, la manche démarre tout de suite avec tous ceux qui ont déjà misé
    if (action === 'set_ready' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      if (body.host && !table.host) table.host = body.host.toLowerCase().trim();
      if (table.status === 'playing' || table.status === 'dealer_turn') {
        table.updatedAt = now;
        memoryTables = tables;
        return res.status(200).json({ ok: true, table: publicTable(table, viewer) });
      }
      if (table.readyBets && table.readyBets[pKey] >= BJ_MIN_BET) {
        if (!table.readyPlayers || typeof table.readyPlayers !== 'object') table.readyPlayers = {};
        if (body.ready === false) delete table.readyPlayers[pKey];
        else table.readyPlayers[pKey] = body.seated === 2 ? 2 : 1;
        // la manche part dès que tous les joueurs de la table sont prêts (seul à la table : tout de suite) ; sinon au bout des 10 s de mise
        const pub = publicTable(table, viewer);
        if (pub.readyTotal > 0 && pub.readyCount >= pub.readyTotal) {
          if (startingTables.has(tableId)) return res.status(200).json({ ok: true, table: publicTable(table, viewer) });
          await tryAutoStart(tableId, table, now, true);   // n'échoue jamais : une mise refusée (solde insuffisant) est juste retirée, sans lancer d'erreur
        }
      }
      table.updatedAt = now;
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});
      return res.status(200).json({ ok: true, started: table.status === 'playing', table: publicTable(table, viewer) });
    }

    // A. DISTRIBUER (DEAL) : la manche démarre toute seule (mise = 10 s pour les autres, ou « Prêt » pour ne plus attendre)
    if (action === 'deal') {
      return res.status(200).json({ ok: false, error: 'Place ta mise : la manche démarre toute seule.', table: publicTable(table, viewer) });
    }

    // B. TIRER (HIT)
    else if (action === 'hit' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];
      if (table.status === 'playing' && p && p.status === 'playing') {
        if (!Array.isArray(table.deck) || table.deck.length === 0) table.deck = createShuffledDeck();
        const card = table.deck.pop();
        p.cards.push(card);
        p.score = calcScore(p.cards);

        if (p.score > 21) p.status = 'busted';
        else if (p.score === 21) p.status = 'stand';
        table.turnDeadline = now + BJ_TURN_MS;   // une carte tirée relance les 10 s pour tout le monde
        advanceTurnOrFinish(table);
        table.updatedAt = now;
      }
    }

    // C. RESTER (STAND)
    else if (action === 'stand' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];
      if (table.status === 'playing' && p && p.status === 'playing') {
        p.status = 'stand';
        advanceTurnOrFinish(table);
        table.updatedAt = now;
      }
    }

    // D. DOUBLER (DOUBLE)
    else if (action === 'double' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];
      if (table.status === 'playing' && p && p.status === 'playing' && !p.double && p.cards.length === 2) {
        try {
          await bjCharge(p.username, `d:${tableId}:${table.roundId}:${pKey}`, p.bet);
        } catch (e) {
          return res.status(200).json({ ok: false, error: 'Solde insuffisant pour doubler.', table: publicTable(table, viewer) });
        }
        if (table.charged) table.charged[pKey] = (table.charged[pKey] || 0) + p.bet;
        p.bet *= 2;
        p.double = true;
        if (!Array.isArray(table.deck) || table.deck.length === 0) table.deck = createShuffledDeck();
        const card = table.deck.pop();
        p.cards.push(card);
        p.score = calcScore(p.cards);

        p.status = p.score > 21 ? 'busted' : 'stand';
        table.turnDeadline = now + BJ_TURN_MS;
        advanceTurnOrFinish(table);
        table.updatedAt = now;
      }
    }

    // E. ABANDON / QUITTER LA TABLE (FORFEIT & FERMETURE DU LOBBY)
    else if (action === 'leave' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];

      if (table.readyPlayers && table.readyPlayers[pKey]) delete table.readyPlayers[pKey];
      if (table.readyBets && table.readyBets[pKey]) delete table.readyBets[pKey];
      if (table.knownPlayers && table.knownPlayers[pKey]) delete table.knownPlayers[pKey];

      if (table.status === 'playing' || table.status === 'dealer_turn') {
        const remainingKeys = (table.playerOrder || Object.keys(table.players || {})).filter(k => k !== pKey && table.players && table.players[k]);
        if (remainingKeys.length === 1) {
          // La personne qui reste gagne directement la mise de celui qui est parti (pot total)
          const winnerKey = remainingKeys[0];
          const winner = table.players[winnerKey];
          let totalPot = 0;
          Object.values(table.players).forEach(pl => { totalPot += (pl.bet || 0); });

          winner.result = 'forfeit_win';
          winner.payout = totalPot;
          table.status = 'finished';
          table.forfeit = {
            loser: (p && p.username) ? p.username : body.username,
            winner: winner.username,
            pot: totalPot
          };
          // le joueur parti reste dans `players` jusqu'au règlement (sa mise fait partie de la cagnotte)
          table.finishedAt = now;
          table.updatedAt = now;
          await settleTable(table);
          delete table.players[pKey];
          table.playerOrder = [winnerKey];
        } else {
          // Si plus personne ou partie abandonnée -> mises remboursées, le lobby se réinitialise
          await settleTable(table);
          table = getDefaultTable(tableId);
          tables[tableId] = table;
        }
      } else {
        // En attente ou finie: retirer le joueur
        if (table.players && table.players[pKey]) {
          delete table.players[pKey];
        }
        table.playerOrder = (table.playerOrder || []).filter(k => k !== pKey);

        // Si la deuxième personne quitte ou change de jeu -> le lobby se ferme complètement
        if (!table.players || Object.keys(table.players).length === 0) {
          table = getDefaultTable(tableId);
          tables[tableId] = table;
        }
        table.updatedAt = now;
      }
    }

    // F. RESET / NOUVELLE PARTIE
    else if (action === 'reset') {
      const pk = (body.username || '').toLowerCase().trim();
      const busy = (table.status === 'playing' || table.status === 'dealer_turn');
      if (!busy || (table.players && table.players[pk])) {
        await settleTable(table);
        table = getDefaultTable(tableId);
        tables[tableId] = table;
      }
    }

    if (table.status === 'finished') await settleTable(table);
    memoryTables = tables;
    saveSupabaseTables(tables).catch(() => {});

    return res.status(200).json({ ok: true, table: publicTable(table, viewer) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
