// Vercel Serverless Function pour l'API /api/blackjack reliée à Supabase Cloud
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
  { r: '10', v: 10 }, { r: 'J', v: 10 }, { r: 'Q', v: 10 }, { r: 'K', v: 10 },
  { r: 'A', v: 11 }
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

function calcScore(hand) {
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
    readyPlayers: {},
    knownPlayers: {},
    host: null,
    hasPlayedRound: false,
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

function advanceTurnOrFinish(table) {
  const activeKeys = table.playerOrder || Object.keys(table.players);
  let nextPlayer = null;

  for (const k of activeKeys) {
    const p = table.players[k];
    if (p && p.status === 'playing') {
      nextPlayer = k;
      break;
    }
  }

  if (nextPlayer) {
    table.turn = nextPlayer;
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
    table.knownPlayers[pKey] = { username: p.username, avatar: p.avatar || '👤' };
    const hand = [table.deck.pop(), table.deck.pop()];
    const sc = calcScore(hand);
    const isBJ = sc === 21;

    const recordedBet = (table.readyBets && table.readyBets[pKey]) ? table.readyBets[pKey] : null;
    const playerBet = Math.min(50000, Math.max(10, parseInt(p.bet) || recordedBet || 100));

    table.players[pKey] = {
      username: p.username,
      avatar: p.avatar || '👤',
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

  advanceTurnOrFinish(table);
  table.updatedAt = now;
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

    // 1. Auto-nettoyage d'une manche finie depuis plus de 3.2 secondes -> retour table propre en attente sans relance automatique
    if (table.status === 'finished' && table.finishedAt && (now - table.finishedAt > 3200)) {
      const prevBets = table.readyBets || {};
      const prevHost = table.host || null;
      const prevKnown = table.knownPlayers || {};
      table = getDefaultTable(tableId);
      table.readyBets = prevBets;
      table.host = prevHost;
      table.knownPlayers = prevKnown;
      table.readyPlayers = {}; // Pas de relance automatique : chacun change sa mise et confirme
      table.hasPlayedRound = true;
      tables[tableId] = table;
      modified = true;
    }

    // 2. Détection d'abandon / inactivité en cours de partie ('playing' ou 'dealer_turn') - Limite de 30s par tour
    if (table.status === 'playing' || table.status === 'dealer_turn') {
      const timeSinceUpdate = now - (table.updatedAt || table.roundId || now);
      if (timeSinceUpdate > 30000) {
        const activeKeys = (table.playerOrder || Object.keys(table.players || {})).filter(k => table.players && table.players[k]);
        const turnKey = (table.turn || '').toLowerCase().trim();
        const otherKeys = activeKeys.filter(k => k !== turnKey);

        if (otherKeys.length === 1 && table.players[turnKey]) {
          // Le joueur dont c'était le tour n'a pas répondu sous 30s -> Forfait automatique, l'adversaire gagne la mise !
          const winnerKey = otherKeys[0];
          const winner = table.players[winnerKey];
          let totalPot = 0;
          Object.values(table.players).forEach(pl => { totalPot += (pl.bet || 0); });

          winner.result = 'forfeit_win';
          winner.payout = totalPot;
          table.status = 'finished';
          table.forfeit = {
            loser: table.players[turnKey].username || turnKey,
            winner: winner.username || winnerKey,
            pot: totalPot
          };
          table.finishedAt = now;
          table.updatedAt = now;
          modified = true;
        } else {
          // Aucun adversaire ou table abandonnée depuis plus de 45s -> Fermeture et remise à zéro totale
          table = getDefaultTable(tableId);
          tables[tableId] = table;
          modified = true;
        }
      }
    }

    if (modified) {
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});
    }

    return res.status(200).json(table);
  }

  // POST
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    let modified = cleanInactiveTables(tables, now);

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
 
    // S. ENREGISTRER MA MISE (SET_BET)
    if (action === 'set_bet' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const betVal = Math.min(50000, Math.max(10, parseInt(body.bet) || 100));
      if (!table.readyBets || typeof table.readyBets !== 'object') table.readyBets = {};
      table.readyBets[pKey] = betVal;
      if (!table.knownPlayers) table.knownPlayers = {};
      table.knownPlayers[pKey] = { username: body.username, avatar: body.avatar || '👤' };
      if (body.host && !table.host) table.host = body.host.toLowerCase().trim();
      table.updatedAt = now;
      memoryTables = tables;
      return res.status(200).json({ ok: true, readyBets: table.readyBets, table });
    }

    // R. ÉTAT PRÊT JOUEUR & RELANCE AUTO (SET_READY)
    if (action === 'set_ready' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const betVal = Math.min(50000, Math.max(10, parseInt(body.bet) || 100));

      if (body.host && !table.host) {
        table.host = body.host.toLowerCase().trim();
      }

      if (!table.readyBets) table.readyBets = {};
      table.readyBets[pKey] = betVal;

      if (!table.knownPlayers) table.knownPlayers = {};
      table.knownPlayers[pKey] = { username: body.username, avatar: body.avatar || '👤' };

      if (!table.readyPlayers) table.readyPlayers = {};
      const isReady = body.ready !== false;
      if (isReady) {
        table.readyPlayers[pKey] = {
          username: body.username,
          avatar: body.avatar || '👤',
          bet: betVal,
          ready: true,
          updatedAt: now
        };
      } else {
        delete table.readyPlayers[pKey];
      }

      // Si une partie est déjà active, on ne relance pas
      if (table.status === 'playing' || table.status === 'dealer_turn') {
        table.updatedAt = now;
        memoryTables = tables;
        return res.status(200).json({ ok: true, table });
      }

      // Vérifier si les 2 vrais joueurs invités sont prêts (AUCUN BOT EN MULTI)
      const readyKeys = Object.keys(table.readyPlayers).filter(k => {
        const rp = table.readyPlayers[k];
        if (!rp || !rp.ready) return false;
        const name = (rp.username || '').toLowerCase();
        return !name.includes('bot') && !name.includes('roxy');
      });
      const isMultiReady = readyKeys.length >= 2;

      if (isMultiReady) {
        const participants = readyKeys.map(k => {
          const rp = table.readyPlayers[k];
          return {
            username: rp.username,
            avatar: rp.avatar || '👤',
            bet: rp.bet || (table.readyBets && table.readyBets[k]) || 100
          };
        });

        startServerDeal(table, participants, now);
        memoryTables = tables;
        saveSupabaseTables(tables).catch(() => {});
        return res.status(200).json({ ok: true, started: true, table });
      }

      table.updatedAt = now;
      memoryTables = tables;
      return res.status(200).json({ ok: true, readyPlayers: table.readyPlayers, table });
    }

    // A. DISTRIBUER (DEAL)
    if (action === 'deal') {
      if (table.status === 'playing' || table.status === 'dealer_turn') {
        return res.status(200).json({ ok: false, error: 'Une partie est déjà en cours', table });
      }

      const pKey = (body.username || '').toLowerCase().trim();

      // Enregistrer l'hôte si transmis ou premier joueur
      if (body.host && !table.host) {
        table.host = body.host.toLowerCase().trim();
      } else if (!table.host && pKey) {
        table.host = pKey;
      }

      let participants = Array.isArray(body.participants) && body.participants.length > 0
        ? body.participants.filter(p => !((p.username || '').toLowerCase().includes('bot') || (p.username || '').toLowerCase().includes('roxy')))
        : [{ username: body.username || 'Joueur 1', avatar: body.avatar || '👤', bet: Math.min(50000, Math.max(10, parseInt(body.bet) || 100)) }];

      if (participants.length < 2) {
        return res.status(200).json({ ok: false, error: "En multijoueur, tu ne peux jouer qu'avec une personne invitée (aucun bot autorisé) !", table });
      }

      startServerDeal(table, participants, now);
      memoryTables = tables;
      saveSupabaseTables(tables).catch(() => {});
      return res.status(200).json({ ok: true, table });
    }

    // B. TIRER (HIT)
    else if (action === 'hit' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];
      const curTurn = (table.turn || '').toLowerCase().trim();
      if (table.status === 'playing' && curTurn === pKey && p && p.status === 'playing') {
        if (!Array.isArray(table.deck) || table.deck.length === 0) table.deck = createShuffledDeck();
        const card = table.deck.pop();
        p.cards.push(card);
        p.score = calcScore(p.cards);

        if (p.score > 21) {
          p.status = 'busted';
          advanceTurnOrFinish(table);
        } else if (p.score === 21) {
          p.status = 'stand';
          advanceTurnOrFinish(table);
        }
        table.updatedAt = now;
      }
    }

    // C. RESTER (STAND)
    else if (action === 'stand' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];
      const curTurn = (table.turn || '').toLowerCase().trim();
      if (table.status === 'playing' && curTurn === pKey && p && p.status === 'playing') {
        p.status = 'stand';
        advanceTurnOrFinish(table);
        table.updatedAt = now;
      }
    }

    // D. DOUBLER (DOUBLE)
    else if (action === 'double' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];
      const curTurn = (table.turn || '').toLowerCase().trim();
      if (table.status === 'playing' && curTurn === pKey && p && p.status === 'playing') {
        p.bet *= 2;
        p.double = true;
        if (!Array.isArray(table.deck) || table.deck.length === 0) table.deck = createShuffledDeck();
        const card = table.deck.pop();
        p.cards.push(card);
        p.score = calcScore(p.cards);

        p.status = p.score > 21 ? 'busted' : 'stand';
        advanceTurnOrFinish(table);
        table.updatedAt = now;
      }
    }

    // E. ABANDON / QUITTER LA TABLE (FORFEIT & FERMETURE DU LOBBY)
    else if (action === 'leave' && body.username) {
      const pKey = body.username.toLowerCase().trim();
      const p = table.players && table.players[pKey];

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
          delete table.players[pKey];
          table.playerOrder = [winnerKey];
          table.finishedAt = now;
          table.updatedAt = now;
        } else {
          // Si plus personne ou partie abandonnée -> le lobby se ferme et se réinitialise
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
      table = getDefaultTable(tableId);
      tables[tableId] = table;
    }

    // G. FUSION COMPLETE ENVOYEE PAR UN CLIENT
    else if (body.tableState && typeof body.tableState === 'object') {
      table = { ...table, ...body.tableState, updatedAt: now };
      tables[tableId] = table;
    }

    memoryTables = tables;
    saveSupabaseTables(tables).catch(() => {});

    return res.status(200).json({ ok: true, table });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
