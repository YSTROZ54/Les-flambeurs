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

function getDefaultTable(tableId) {
  return {
    tableId: tableId || 'public',
    roundId: 0,
    status: 'waiting', // 'waiting', 'playing', 'dealer_turn', 'finished'
    deck: [],
    dealer: { cards: [], score: 0, hidden: true },
    players: {},
    playerOrder: [],
    turn: null,
    history: [],
    forfeit: null,
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

  // 1. Récupération des tables
  let tables = await fetchSupabaseTables();
  if (!tables) {
    tables = memoryTables;
  } else {
    memoryTables = tables;
  }

  const now = Date.now();

  // GET
  if (req.method === 'GET') {
    const tableId = (req.query.table || req.query.tableId || 'public').toLowerCase().trim();
    let table = tables[tableId];
    if (!table) {
      table = getDefaultTable(tableId);
      tables[tableId] = table;
    }

    let modified = false;

    // 1. Auto-nettoyage d'une manche finie depuis plus de 4 secondes -> retour table propre en attente
    if (table.status === 'finished' && table.finishedAt && (now - table.finishedAt > 4000)) {
      table = getDefaultTable(tableId);
      tables[tableId] = table;
      modified = true;
    }

    // 2. Détection d'abandon / inactivité en cours de partie ('playing' ou 'dealer_turn')
    if (table.status === 'playing' || table.status === 'dealer_turn') {
      const timeSinceUpdate = now - (table.updatedAt || table.roundId || now);
      if (timeSinceUpdate > 20000) {
        const activeKeys = (table.playerOrder || Object.keys(table.players || {})).filter(k => table.players && table.players[k]);
        const turnKey = (table.turn || '').toLowerCase().trim();
        const otherKeys = activeKeys.filter(k => k !== turnKey);

        if (otherKeys.length === 1 && table.players[turnKey]) {
          // Le joueur dont c'était le tour n'a pas répondu sous 20s -> Forfait automatique, l'adversaire gagne la mise !
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
          // Aucun adversaire ou table abandonnée depuis plus de 30s -> Fermeture et remise à zéro totale
          table = getDefaultTable(tableId);
          tables[tableId] = table;
          modified = true;
        }
      }
    }

    if (modified) {
      memoryTables = tables;
      await saveSupabaseTables(tables);
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

    const tableId = (body.tableId || 'public').toLowerCase().trim();
    let table = tables[tableId];
    if (!table) {
      table = getDefaultTable(tableId);
      tables[tableId] = table;
    }

    const action = body.action;

    // A. DISTRIBUER (DEAL)
    if (action === 'deal') {
      if (table.status === 'playing' || table.status === 'dealer_turn') {
        return res.status(200).json({ ok: false, error: 'Une partie est déjà en cours', table });
      }

      const participants = Array.isArray(body.participants) && body.participants.length > 0
        ? body.participants
        : [{ username: body.username || 'Joueur 1', avatar: body.avatar || '👤', bet: parseInt(body.bet) || 100 }];

      table.roundId = now;
      table.tableId = tableId;
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

      participants.forEach(p => {
        const pKey = (p.username || '').toLowerCase().trim();
        if (!pKey) return;
        const hand = [table.deck.pop(), table.deck.pop()];
        const sc = calcScore(hand);
        const isBJ = sc === 21;

        table.players[pKey] = {
          username: p.username,
          avatar: p.avatar || '👤',
          bet: parseInt(p.bet) || 100,
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
    await saveSupabaseTables(tables);

    return res.status(200).json({ ok: true, table });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
