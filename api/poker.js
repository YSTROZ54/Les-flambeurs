// Vercel Serverless Function pour l'API /api/poker reliée à Supabase Cloud
// Moteur de Poker Texas Hold'em Multijoueur avec Croupier / Dealer Bot Automatique
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gyjyncljhlatomnbmwxa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee';

const SUITS = [
  { s: '♠', color: 'text-slate-900', type: 'suit-black' },
  { s: '♣', color: 'text-slate-900', type: 'suit-black' },
  { s: '♥', color: 'text-red-500', type: 'suit-red' },
  { s: '♦', color: 'text-red-500', type: 'suit-red' }
];

const RANKS = [
  { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 }, { r: '5', v: 5 },
  { r: '6', v: 6 }, { r: '7', v: 7 }, { r: '8', v: 8 }, { r: '9', v: 9 },
  { r: '10', v: 10 }, { r: 'J', v: 11 }, { r: 'Q', v: 12 }, { r: 'K', v: 13 },
  { r: 'A', v: 14 }
];

function createShuffledDeck() {
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
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Évaluateur de combinaisons Texas Hold'em à 7 cartes
function evaluateBestHand(cards) {
  if (!cards || cards.length < 2) return { score: 0, name: 'Carte Haute' };
  const counts = {}, suits = {}, vals = cards.map(c => c.v).sort((a, b) => b - a);
  cards.forEach(c => {
    counts[c.v] = (counts[c.v] || 0) + 1;
    suits[c.s] = (suits[c.s] || 0) + 1;
  });

  const isFlush = Object.values(suits).some(n => n >= 5);
  const uniq = [...new Set(vals)];
  let isStraight = false, sHigh = 0;
  // Cas classique de quinte
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i] - uniq[i + 4] === 4) {
      isStraight = true;
      sHigh = uniq[i];
      break;
    }
  }
  // Cas as-low straight (A, 5, 4, 3, 2)
  if (!isStraight && uniq.includes(14) && uniq.includes(2) && uniq.includes(3) && uniq.includes(4) && uniq.includes(5)) {
    isStraight = true;
    sHigh = 5;
  }

  const groups = Object.entries(counts).map(([v, c]) => ({ v: +v, c })).sort((a, b) => b.c - a.c || b.v - a.v);

  if (isFlush && isStraight) return { score: 800 + sHigh, name: 'Quinte Flush 🔥' };
  if (groups[0].c === 4) return { score: 700 + groups[0].v, name: 'Carré 💣' };
  if (groups[0].c === 3 && groups[1] && groups[1].c >= 2) return { score: 600 + groups[0].v, name: 'Full House 👑' };
  if (isFlush) return { score: 500 + vals[0], name: 'Couleur ♦️' };
  if (isStraight) return { score: 400 + sHigh, name: 'Suite ⚡' };
  if (groups[0].c === 3) return { score: 300 + groups[0].v, name: 'Brelan 🎯' };
  if (groups[0].c === 2 && groups[1] && groups[1].c === 2) return { score: 200 + groups[0].v, name: 'Double Paire ✨' };
  if (groups[0].c === 2) return { score: 100 + groups[0].v, name: 'Paire' };
  return { score: vals[0], name: 'Carte Haute' };
}

const PUBLIC_TABLE_CONFIGS = {
  'poker_1v1_1': { id: 'poker_1v1_1', name: 'Table 1 • Duel des As', maxSeats: 2, blind: 100, category: '1v1' },
  'poker_1v1_2': { id: 'poker_1v1_2', name: 'Table 2 • Heads-Up Flambeur', maxSeats: 2, blind: 100, category: '1v1' },
  'poker_1v1_3': { id: 'poker_1v1_3', name: 'Table 3 • Showdown VIP', maxSeats: 2, blind: 100, category: '1v1' },
  'poker_4max_1': { id: 'poker_4max_1', name: 'Table 4 • Texas Flambeur', maxSeats: 4, blind: 100, category: '4max' },
  'poker_4max_2': { id: 'poker_4max_2', name: 'Table 5 • Vegas VIP Club', maxSeats: 4, blind: 100, category: '4max' },
  'poker_4max_3': { id: 'poker_4max_3', name: 'Table 6 • Cercle Privilège', maxSeats: 4, blind: 100, category: '4max' },
  'poker_6max_1': { id: 'poker_6max_1', name: 'Table 7 • 6-Max Royale', maxSeats: 6, blind: 100, category: '6max' },
  'poker_6max_2': { id: 'poker_6max_2', name: 'Table 8 • Grand Tournoi Cash', maxSeats: 6, blind: 100, category: '6max' },
  'poker_6max_3': { id: 'poker_6max_3', name: 'Table 9 • Table des Maîtres', maxSeats: 6, blind: 100, category: '6max' }
};

function getDefaultTable(tableId) {
  const cfg = PUBLIC_TABLE_CONFIGS[tableId] || PUBLIC_TABLE_CONFIGS['poker_4max_1'];
  return {
    tableId: cfg.id,
    name: cfg.name,
    maxSeats: cfg.maxSeats,
    blind: 100,
    roundId: 0,
    status: 'waiting', // 'waiting' | 'countdown' | 'preflop' | 'flop' | 'turn' | 'river' | 'finished'
    countdownEndsAt: 0,
    pot: 0,
    currentBet: 100,
    community: [],
    deck: [],
    dealerIndex: 0,
    turn: null,
    turnEndsAt: 0,
    actionCount: 0,
    lastAggressor: null,
    players: {}, // usernameKey -> player object
    playerOrder: [], // array of usernameKey
    winner: null,
    finishedAt: 0,
    nextRoundAt: 0,
    announcement: '🤖 Croupier : En attente d\'au moins 2 joueurs assis...',
    updatedAt: Date.now()
  };
}

let memoryTables = {};
let lastSupabaseFetchTime = 0;
const SUPABASE_CACHE_TTL = 700; // ms

async function fetchSupabaseTables() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts?username=eq.__poker_game__`, {
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
    console.warn('Erreur GET Supabase Poker:', e);
  }
  return null;
}

async function saveSupabaseTables(tables) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !tables) return;
  try {
    const row = {
      username: '__poker_game__',
      password: 'sys',
      avatar: '♠️',
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
    console.warn('Erreur POST Supabase Poker:', e);
  }
}

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

// Active players in current hand (non-folded)
function getActivePlayers(table) {
  return (table.playerOrder || []).filter(k => table.players[k] && !table.players[k].folded);
}

// Next active player in circular order
function getNextActiveTurnKey(table, fromKey) {
  const order = table.playerOrder || [];
  if (order.length === 0) return null;
  const startIdx = order.indexOf(fromKey);
  for (let i = 1; i <= order.length; i++) {
    const idx = (startIdx + i) % order.length;
    const k = order[idx];
    const p = table.players[k];
    if (p && !p.folded && !p.allIn) {
      return k;
    }
  }
  return null;
}

// Terminer le tour ou passer à la phase suivante
function advancePokerPhaseOrTurn(table, now) {
  const activeKeys = getActivePlayers(table);

  // 1. Un seul joueur restant -> Victoire immédiate
  if (activeKeys.length <= 1) {
    const winnerKey = activeKeys[0] || (table.playerOrder && table.playerOrder[0]);
    const winner = table.players[winnerKey];
    if (winner) {
      winner.stack = (winner.stack || 0) + table.pot;
      table.winner = {
        username: winner.username,
        pot: table.pot,
        handName: 'Tous les adversaires se sont couchés'
      };
      table.announcement = `🏆 ${winner.username} remporte le pot de ${table.pot} € (adversaires couchés) !`;
    }
    table.status = 'finished';
    table.finishedAt = now;
    table.nextRoundAt = now + 5000;
    table.updatedAt = now;
    return;
  }

  // 2. Vérifier si tous les joueurs actifs (non all-in) ont égalisé la mise
  const nonAllInActive = activeKeys.filter(k => !table.players[k].allIn);
  const allMatched = nonAllInActive.every(k => (table.players[k].roundBet || 0) === table.currentBet);
  const minActionsRequired = nonAllInActive.length;
  const roundSettled = (table.actionCount >= minActionsRequired && allMatched) || nonAllInActive.length <= 1;

  if (!roundSettled) {
    // Passer la main au joueur suivant
    const nextTurn = getNextActiveTurnKey(table, table.turn);
    if (nextTurn) {
      table.turn = nextTurn;
      table.turnEndsAt = now + 120000; // 2 minutes (120s)
      table.announcement = `Au tour de ${table.players[nextTurn].username} (2 min).`;
      table.updatedAt = now;
      return;
    }
  }

  // 3. Tour de mise bouclé -> Passer à la phase suivante
  table.actionCount = 0;
  table.currentBet = 0;
  table.lastAggressor = null;
  Object.values(table.players).forEach(p => { p.roundBet = 0; });

  if (table.status === 'preflop') {
    // Distribuer le FLOP (3 cartes)
    table.status = 'flop';
    table.community.push(table.deck.pop(), table.deck.pop(), table.deck.pop());
    table.turn = getNextActiveTurnKey(table, table.playerOrder[table.dealerIndex] || activeKeys[0]);
    table.turnEndsAt = now + 120000;
    table.announcement = `🃏 Flop dévoilé ! Au tour de ${table.players[table.turn]?.username || 'joueur'} (2 min).`;
  } else if (table.status === 'flop') {
    // Distribuer la TURN (1 carte)
    table.status = 'turn';
    table.community.push(table.deck.pop());
    table.turn = getNextActiveTurnKey(table, table.playerOrder[table.dealerIndex] || activeKeys[0]);
    table.turnEndsAt = now + 120000;
    table.announcement = `⚡ Turn dévoilée ! Au tour de ${table.players[table.turn]?.username || 'joueur'} (2 min).`;
  } else if (table.status === 'turn') {
    // Distribuer la RIVER (1 carte)
    table.status = 'river';
    table.community.push(table.deck.pop());
    table.turn = getNextActiveTurnKey(table, table.playerOrder[table.dealerIndex] || activeKeys[0]);
    table.turnEndsAt = now + 120000;
    table.announcement = `🌊 River dévoilée ! Dernier tour, au tour de ${table.players[table.turn]?.username || 'joueur'} (2 min).`;
  } else if (table.status === 'river') {
    // SHOWDOWN !
    table.status = 'finished';
    table.finishedAt = now;
    table.nextRoundAt = now + 5000; // Relance automatique dans 5 secondes

    let bestScore = -1;
    let winners = [];
    activeKeys.forEach(k => {
      const p = table.players[k];
      const ev = evaluateBestHand([...p.cards, ...table.community]);
      p.status = ev.name;
      p.handRank = ev.name;
      p.score = ev.score;
      if (ev.score > bestScore) {
        bestScore = ev.score;
        winners = [p];
      } else if (ev.score === bestScore) {
        winners.push(p);
      }
    });

    const splitPot = Math.floor(table.pot / winners.length);
    winners.forEach(w => {
      w.stack = (w.stack || 0) + splitPot;
    });

    const winNames = winners.map(w => w.username).join(' & ');
    table.winner = {
      username: winNames,
      pot: table.pot,
      handName: winners[0]?.handRank || 'Meilleure main',
      split: winners.length > 1
    };
    table.announcement = winners.length > 1
      ? `🤝 Égalité (${winners[0].handRank}) ! Pot partagé entre ${winNames} (+${splitPot} € chacun).`
      : `🏆 ${winNames} remporte le pot de ${table.pot} € avec ${winners[0].handRank} !`;
  }

  table.updatedAt = now;
}

// Lancement automatique d'une donne par le Croupier
function startDealerDeal(table, now) {
  const pKeys = table.playerOrder.filter(k => Boolean(table.players[k]));
  if (pKeys.length < 2) {
    table.status = 'waiting';
    table.announcement = '🤖 Croupier : En attente d\'au moins 2 joueurs assis...';
    table.updatedAt = now;
    return;
  }

  table.roundId = now;
  table.deck = createShuffledDeck();
  table.community = [];
  table.blind = 100;
  table.pot = 100 * pKeys.length;
  table.currentBet = 100;
  table.winner = null;
  table.actionCount = 0;
  table.lastAggressor = null;
  table.dealerIndex = (table.dealerIndex + 1) % pKeys.length;

  pKeys.forEach((k) => {
    const p = table.players[k];
    p.waitingNextRound = false;
    p.ready = true;
    if (p.stack < 100) p.stack = 5000;
    p.stack -= 100;
    p.bet = 100;
    p.roundBet = 100;
    p.cards = [table.deck.pop(), table.deck.pop()];
    p.folded = false;
    p.allIn = false;
    p.status = 'Blind 100 €';
    p.updatedAt = now;
  });

  // Premier joueur à parler
  const firstTurnIdx = (pKeys.length === 2) ? table.dealerIndex : ((table.dealerIndex + 1) % pKeys.length);
  table.turn = pKeys[firstTurnIdx];
  table.turnEndsAt = now + 120000; // 2 minutes (120s)
  table.status = 'preflop';
  table.announcement = `🤖 Croupier : Cartes distribuées ! Au tour de ${table.players[table.turn].username} (2 min).`;
  table.updatedAt = now;
}

// Bot Croupier : Gestion de cycle de vie automatique
function stepDealerBot(table, now) {
  let changed = false;

  // 1. Nettoyer les joueurs réellement déconnectés (> 180s / 3 minutes sans heartbeat)
  const order = table.playerOrder || [];
  order.forEach(k => {
    const p = table.players[k];
    if (p && p.updatedAt && (now - p.updatedAt > 180000)) {
      if (['preflop', 'flop', 'turn', 'river'].includes(table.status)) {
        p.folded = true;
        p.status = 'A quitté';
      }
      delete table.players[k];
      table.playerOrder = table.playerOrder.filter(x => x !== k);
      changed = true;
    }
  });

  if (table.playerOrder.length === 0 && table.status !== 'waiting') {
    table.status = 'waiting';
    table.community = [];
    table.pot = 0;
    table.winner = null;
    table.announcement = "🤖 Croupier : En attente d'au moins 2 joueurs assis...";
    changed = true;
  }

  const activeSeated = table.playerOrder.filter(k => Boolean(table.players[k]));

  // 2. Gestion de l'état WAITING -> COUNTDOWN (Tous les joueurs assis doivent être prêts, min 2)
  if (table.status === 'waiting') {
    const readyPlayers = activeSeated.filter(k => table.players[k]?.ready === true);
    if (activeSeated.length >= 2 && readyPlayers.length === activeSeated.length) {
      table.status = 'countdown';
      table.countdownEndsAt = now + 4000;
      table.announcement = `🤖 Croupier : Tous les joueurs sont prêts (${activeSeated.length} joueurs) ! La donne commence dans 4s...`;
      table.updatedAt = now;
      changed = true;
    } else if (activeSeated.length >= 2) {
      table.announcement = `🤖 Croupier : ${readyPlayers.length}/${activeSeated.length} joueurs prêts. Clique sur "JE SUIS PRÊT" pour lancer !`;
    }
  }

  // 3. Gestion COUNTDOWN -> PREFLOP (Lancement automatique)
  else if (table.status === 'countdown') {
    const readyPlayers = activeSeated.filter(k => table.players[k]?.ready === true);
    if (activeSeated.length < 2 || readyPlayers.length < activeSeated.length) {
      table.status = 'waiting';
      table.announcement = '🤖 Croupier : Un joueur n\'est plus prêt ou a quitté la table.';
      table.updatedAt = now;
      changed = true;
    } else if (now >= (table.countdownEndsAt || 0)) {
      startDealerDeal(table, now);
      changed = true;
    }
  }

  // 4. Gestion du temps de tour expiré (120s / 2 minutes)
  else if (['preflop', 'flop', 'turn', 'river'].includes(table.status)) {
    if (table.turn && table.turnEndsAt && (now > table.turnEndsAt)) {
      const turnPlayer = table.players[table.turn];
      if (turnPlayer) {
        const toCall = Math.max(0, table.currentBet - (turnPlayer.roundBet || 0));
        if (toCall === 0) {
          turnPlayer.status = 'Parole (Auto)';
          turnPlayer.lastAction = 'check';
        } else {
          turnPlayer.folded = true;
          turnPlayer.status = 'Couché (Temps)';
          turnPlayer.lastAction = 'fold';
        }
        table.actionCount = (table.actionCount || 0) + 1;
        advancePokerPhaseOrTurn(table, now);
        changed = true;
      }
    }
  }

  // 5. Gestion de la relance automatique après fin de manche (5 secondes)
  else if (table.status === 'finished') {
    if (table.nextRoundAt && now >= table.nextRoundAt) {
      if (activeSeated.length >= 2) {
        // Relance automatique directe : pas besoin de recliquer sur prêt, tous les joueurs assis participent
        activeSeated.forEach(k => {
          if (table.players[k]) {
            table.players[k].ready = true;
            table.players[k].waitingNextRound = false;
          }
        });
        startDealerDeal(table, now);
      } else {
        table.status = 'waiting';
        table.announcement = '🤖 Croupier : En attente d\'autres flambeurs pour la prochaine main...';
        table.community = [];
        table.pot = 0;
        table.winner = null;
      }
      table.updatedAt = now;
      changed = true;
    }
  }

  return changed;
}

// Obscurcir les cartes privées des adversaires pour sécuriser la table
function sanitizeTableForUser(table, username) {
  const myKey = (username || '').toLowerCase().trim();
  const copy = JSON.parse(JSON.stringify(table));
  const isFinished = copy.status === 'finished';

  if (!isFinished && copy.players) {
    Object.keys(copy.players).forEach(k => {
      if (k !== myKey) {
        // Remplacer les cartes de l'adversaire par des cartes cachées
        const p = copy.players[k];
        if (Array.isArray(p.cards)) {
          p.cards = p.cards.map(() => ({ hidden: true }));
        }
      }
    });
  }
  // Ne pas exposer le sabot restant
  delete copy.deck;
  return copy;
}

function buildTablesSummary(allTables) {
  const summary = {};
  Object.keys(PUBLIC_TABLE_CONFIGS).forEach(tId => {
    const t = allTables[tId];
    if (!t || !t.players) {
      summary[tId] = { count: 0, players: [] };
    } else {
      const seated = (t.playerOrder || []).filter(k => Boolean(t.players[k])).map(k => ({
        username: t.players[k].username,
        avatar: t.players[k].avatar || '👤'
      }));
      summary[tId] = { count: seated.length, players: seated };
    }
  });
  return summary;
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

  const tables = await getFreshTables(false);
  const now = Date.now();

  // GET
  if (req.method === 'GET') {
    const uKey = (req.query.user || '').toLowerCase().trim();
    let rawTableId = (req.query.table || req.query.tableId || 'poker_4max_1').toLowerCase().trim();
    if (!PUBLIC_TABLE_CONFIGS[rawTableId]) rawTableId = 'poker_4max_1';
    const tableId = rawTableId;

    let table = tables[tableId];
    if (!table) {
      table = getDefaultTable(tableId);
      tables[tableId] = table;
    }

    // Refresh heartbeat pour éviter qu'un joueur assis soit éjecté pour inactivité
    if (uKey && table.players[uKey]) {
      table.players[uKey].updatedAt = now;
    }

    const changed = stepDealerBot(table, now);
    if (changed) {
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});
    }

    const clientView = sanitizeTableForUser(table, req.query.user || '');
    clientView.tablesSummary = buildTablesSummary(tables);
    return res.status(200).json(clientView);
  }

  // POST
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    let rawTableId = (body.tableId || 'poker_4max_1').toLowerCase().trim();
    if (!PUBLIC_TABLE_CONFIGS[rawTableId]) rawTableId = 'poker_4max_1';
    const tableId = rawTableId;

    let table = tables[tableId];
    if (!table) {
      table = getDefaultTable(tableId);
      tables[tableId] = table;
    }

    const action = body.action;
    const user = (body.username || '').trim();
    const uKey = user.toLowerCase();

    let modified = stepDealerBot(table, now);

    // ACTION : S'ASSEOIR (JOIN)
    if (action === 'join' && user) {
      if (!table.players[uKey]) {
        if (table.playerOrder.length < table.maxSeats) {
          const seatIdx = table.playerOrder.length;
          const isMidHand = ['countdown', 'preflop', 'flop', 'turn', 'river'].includes(table.status);
          table.players[uKey] = {
            username: user,
            avatar: body.avatar || '👤',
            seatIndex: seatIdx,
            stack: Math.max(100, parseInt(body.balance) || 5500),
            bet: 0,
            roundBet: 0,
            cards: [],
            folded: isMidHand,
            allIn: false,
            ready: false,
            waitingNextRound: isMidHand,
            status: isMidHand ? 'Attend la prochaine main' : 'Assis (Non prêt)',
            updatedAt: now
          };
          table.playerOrder.push(uKey);
          table.announcement = isMidHand
            ? `👤 ${user} a rejoint la table en observateur (jouera la prochaine main) !`
            : `👤 ${user} s'est assis à la table !`;
          table.updatedAt = now;
          modified = true;
          stepDealerBot(table, now);
        }
      } else {
        table.players[uKey].updatedAt = now;
        if (body.avatar) table.players[uKey].avatar = body.avatar;
      }
    }

    // ACTION : SE DÉCLARER PRÊT (READY)
    else if (action === 'ready' && user) {
      if (table.players[uKey]) {
        table.players[uKey].ready = true;
        table.players[uKey].status = 'Prêt';
        table.players[uKey].updatedAt = now;
        table.announcement = `👍 ${user} est prêt !`;
        table.updatedAt = now;
        modified = true;
        stepDealerBot(table, now);
      }
    }

    // ACTION : QUITTER (LEAVE)
    else if (action === 'leave' && user) {
      if (table.players[uKey]) {
        if (['preflop', 'flop', 'turn', 'river'].includes(table.status)) {
          table.players[uKey].folded = true;
          table.players[uKey].status = 'A quitté';
        }
        delete table.players[uKey];
        table.playerOrder = table.playerOrder.filter(k => k !== uKey);
        table.announcement = `🚪 ${user} a quitté la table.`;
        if (table.playerOrder.length === 0) {
          table.status = 'waiting';
          table.community = [];
          table.pot = 0;
          table.winner = null;
          table.announcement = "🤖 Croupier : En attente d'au moins 2 joueurs assis...";
        }
        table.updatedAt = now;
        modified = true;
        advancePokerPhaseOrTurn(table, now);
        stepDealerBot(table, now);
      }
    }

    // ACTION : HEARTBEAT (PING)
    else if (action === 'ping' && user) {
      if (table.players[uKey]) {
        table.players[uKey].updatedAt = now;
      }
    }

    // ACTIONS DE JEU (Tour actif requis)
    else if (['fold', 'check', 'call', 'raise', 'allin'].includes(action) && user) {
      const isMyTurn = table.turn === uKey;
      const isPlaying = ['preflop', 'flop', 'turn', 'river'].includes(table.status);

      if (isPlaying && isMyTurn && table.players[uKey] && !table.players[uKey].folded) {
        const p = table.players[uKey];
        const toCall = Math.max(0, table.currentBet - (p.roundBet || 0));

        if (action === 'fold') {
          p.folded = true;
          p.status = 'Couché';
          p.lastAction = 'fold';
        } else if (action === 'check') {
          if (toCall === 0) {
            p.status = 'Parole';
            p.lastAction = 'check';
          } else {
            // Si une mise est requise et check demandé -> force fold
            p.folded = true;
            p.status = 'Couché';
            p.lastAction = 'fold';
          }
        } else if (action === 'call') {
          const pay = Math.min(p.stack, toCall);
          p.stack -= pay;
          p.bet += pay;
          p.roundBet += pay;
          table.pot += pay;
          p.status = `Suit (${p.roundBet})`;
          p.lastAction = 'call';
          if (p.stack <= 0) p.allIn = true;
        } else if (action === 'raise') {
          const addRaise = Math.max(100, parseInt(body.amount) || 200);
          const pay = Math.min(p.stack, toCall + addRaise);
          p.stack -= pay;
          p.bet += pay;
          p.roundBet += pay;
          table.currentBet = p.roundBet;
          table.pot += pay;
          table.lastAggressor = uKey;
          p.status = `Relance ${table.currentBet}`;
          p.lastAction = 'raise';
          if (p.stack <= 0) p.allIn = true;
        } else if (action === 'allin') {
          const pay = p.stack;
          p.stack = 0;
          p.bet += pay;
          p.roundBet += pay;
          table.pot += pay;
          if (p.roundBet > table.currentBet) {
            table.currentBet = p.roundBet;
            table.lastAggressor = uKey;
          }
          p.allIn = true;
          p.status = 'Tapis ! 🔥';
          p.lastAction = 'allin';
        }

        p.updatedAt = now;
        table.actionCount = (table.actionCount || 0) + 1;
        advancePokerPhaseOrTurn(table, now);
        modified = true;
      }
    }

    if (modified) {
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});
    }

    const clientView = sanitizeTableForUser(table, user);
    clientView.tablesSummary = buildTablesSummary(tables);
    return res.status(200).json(clientView);
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
