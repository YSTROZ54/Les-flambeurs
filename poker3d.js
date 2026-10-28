/**
 * =============================================================================
 * POKER 3D — MODULE THREE.JS & MOTEUR TEXAS HOLD'EM COMPLET
 * Direction Artistique : Casino Underground (Type "Prominence Poker")
 * Ambiance : Scène sombre, lumière dramatique suspendue, feutre texturé,
 *            cartes texturées ultra-nettes (filtrage anisotrope max),
 *            Nameplates HTML nettes (coordonnées arrondies Math.round),
 *            distribution séquentielle du Flop, caméra responsive mobile,
 *            formats de table dynamiques (1v1, 4-Max, 6-Max) et sélecteur de blindes.
 * RÈGLE ABSOLUE : Coordonnées spatiales verrouillées géométriquement.
 * =============================================================================
 */

/* ------------------------------------------------------------------------- */
/* A. ÉVALUATEUR DE MAINS TEXAS HOLD'EM COMPLET & RIGOUREUX (7 CARTES)        */
/* ------------------------------------------------------------------------- */
const HAND_TIERS = {
  ROYAL_FLUSH: 10,
  STRAIGHT_FLUSH: 9,
  FOUR_OF_A_KIND: 8,
  FULL_HOUSE: 7,
  FLUSH: 6,
  STRAIGHT: 5,
  THREE_OF_A_KIND: 4,
  TWO_PAIR: 3,
  ONE_PAIR: 2,
  HIGH_CARD: 1
};

const RANK_NAMES = {
  14: 'As', 13: 'Roi', 12: 'Dame', 11: 'Valet',
  10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2'
};

const RANK_PLURALS = {
  14: 'As', 13: 'Rois', 12: 'Dames', 11: 'Valets',
  10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2'
};

function getCombinations(arr, k) {
  const result = [];
  function backtrack(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }
  backtrack(0, []);
  return result;
}

function score5Cards(tier, p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0) {
  return tier * 759375 + p0 * 50625 + p1 * 3375 + p2 * 225 + p3 * 15 + p4;
}

function evaluate5Cards(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const v = sorted.map(c => c.value);
  const s = sorted.map(c => c.suit);

  const isFlush = (s[0] === s[1] && s[1] === s[2] && s[2] === s[3] && s[3] === s[4]);

  const isStandardStraight = (v[0] - 1 === v[1] && v[1] - 1 === v[2] && v[2] - 1 === v[3] && v[3] - 1 === v[4]);
  const isAceLowStraight = (v[0] === 14 && v[1] === 5 && v[2] === 4 && v[3] === 3 && v[4] === 2);
  const isStraight = isStandardStraight || isAceLowStraight;
  const straightHigh = isAceLowStraight ? 5 : v[0];

  const counts = {};
  v.forEach(val => { counts[val] = (counts[val] || 0) + 1; });
  const groups = Object.entries(counts)
    .map(([val, count]) => ({ value: parseInt(val, 10), count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  // 1. Quinte Flush Royale & Quinte Flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { tier: 10, score: score5Cards(10, 14), name: 'Quinte Flush Royale 👑', cards: sorted };
    }
    return { tier: 9, score: score5Cards(9, straightHigh), name: `Quinte Flush au ${RANK_NAMES[straightHigh]} 🔥`, cards: sorted };
  }

  // 2. Carré (Four of a Kind)
  if (groups[0].count === 4) {
    const qVal = groups[0].value;
    const kVal = groups[1].value;
    return {
      tier: 8,
      score: score5Cards(8, qVal, kVal),
      name: `Carré de ${RANK_PLURALS[qVal]} 💣`,
      cards: sorted
    };
  }

  // 3. Full House
  if (groups[0].count === 3 && groups[1].count >= 2) {
    const tVal = groups[0].value;
    const pVal = groups[1].value;
    return {
      tier: 7,
      score: score5Cards(7, tVal, pVal),
      name: `Full aux ${RANK_PLURALS[tVal]} par les ${RANK_PLURALS[pVal]} 👑`,
      cards: sorted
    };
  }

  // 4. Couleur (Flush)
  if (isFlush) {
    return {
      tier: 6,
      score: score5Cards(6, v[0], v[1], v[2], v[3], v[4]),
      name: `Couleur à l'${RANK_NAMES[v[0]]} ♦️`,
      cards: sorted
    };
  }

  // 5. Quinte / Suite (Straight)
  if (isStraight) {
    return {
      tier: 5,
      score: score5Cards(5, straightHigh),
      name: `Quinte au ${RANK_NAMES[straightHigh]} ⚡`,
      cards: sorted
    };
  }

  // 6. Brelan (Three of a Kind)
  if (groups[0].count === 3) {
    const tVal = groups[0].value;
    const k1 = groups[1].value;
    const k2 = groups[2].value;
    return {
      tier: 4,
      score: score5Cards(4, tVal, k1, k2),
      name: `Brelan de ${RANK_PLURALS[tVal]} 🎯`,
      cards: sorted
    };
  }

  // 7. Double Paire (Two Pair)
  if (groups[0].count === 2 && groups[1].count === 2) {
    const hp = Math.max(groups[0].value, groups[1].value);
    const lp = Math.min(groups[0].value, groups[1].value);
    const k = groups[2].value;
    return {
      tier: 3,
      score: score5Cards(3, hp, lp, k),
      name: `Double Paire ${RANK_PLURALS[hp]} et ${RANK_PLURALS[lp]} ✨`,
      cards: sorted
    };
  }

  // 8. Paire (One Pair)
  if (groups[0].count === 2) {
    const pVal = groups[0].value;
    const k1 = groups[1].value;
    const k2 = groups[2].value;
    const k3 = groups[3].value;
    return {
      tier: 2,
      score: score5Cards(2, pVal, k1, k2, k3),
      name: `Paire de ${RANK_PLURALS[pVal]}`,
      cards: sorted
    };
  }

  // 9. Carte Haute (High Card)
  return {
    tier: 1,
    score: score5Cards(1, v[0], v[1], v[2], v[3], v[4]),
    name: `Hauteur ${RANK_NAMES[v[0]]}`,
    cards: sorted
  };
}

function evaluateBestHand(cards) {
  if (!cards || cards.length < 5) {
    if (cards && cards.length === 2) {
      if (cards[0].value === cards[1].value) {
        return { tier: 2, score: cards[0].value, name: `Paire de ${RANK_PLURALS[cards[0].value]}` };
      }
      const high = Math.max(cards[0].value, cards[1].value);
      return { tier: 1, score: high, name: `Carte Haute ${RANK_NAMES[high]}` };
    }
    return { tier: 0, score: 0, name: 'En cours...' };
  }

  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const evaluated = evaluate5Cards(combo);
    if (!best || evaluated.score > best.score) {
      best = evaluated;
    }
  }
  return best;
}

/* ------------------------------------------------------------------------- */
/* B. CRÉATION DU PAQUET ET MÉLANGE FISHER-YATES                             */
/* ------------------------------------------------------------------------- */
function createShuffledDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = [
    { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 }, { r: '5', v: 5 },
    { r: '6', v: 6 }, { r: '7', v: 7 }, { r: '8', v: 8 }, { r: '9', v: 9 },
    { r: '10', v: 10 }, { r: 'J', v: 11 }, { r: 'Q', v: 12 }, { r: 'K', v: 13 },
    { r: 'A', v: 14 }
  ];
  const deck = [];
  suits.forEach(s => {
    ranks.forEach(rk => {
      deck.push({ rank: rk.r, suit: s, value: rk.v });
    });
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/* ------------------------------------------------------------------------- */
/* B2. POTS ANNEXES (SIDE POTS) — partage correct quand un joueur est à tapis */
/* ------------------------------------------------------------------------- */
// entries : [{ id, total, folded }]  =>  [{ amount, eligible:[id] }]
function buildSidePots(entries) {
  const levels = [...new Set(entries.filter(e => e.total > 0).map(e => e.total))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const e of entries) amount += Math.max(0, Math.min(e.total, level) - Math.min(e.total, prev));
    const eligible = entries.filter(e => !e.folded && e.total >= level).map(e => e.id);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if ((eligible.length === 0 || (last && last.eligible.join('|') === eligible.join('|'))) && last) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  return pots;
}

/* ------------------------------------------------------------------------- */
/* C. MOTEUR DE JEU TEXAS HOLD'EM (FORMATS DYNAMIQUES & BLINDES)             */
/* ------------------------------------------------------------------------- */
class TexasHoldemGame {
  constructor(experience) {
    this.exp = experience;
    this.dealerIndex = 0;
    this.smallBlind = 50;
    this.bigBlind = 100;

    this.tableFormat = '6max';
    this.activeSeatIndices = [0, 1, 2, 3, 4, 5];

    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.phase = 'preflop';
    this.currentTurn = 0;
    this.currentMaxBet = 100;
    this.lastRaiseSize = 100;
    this.isHeroTurn = false;
    this.botTimer = null;
    this.nextHandTimer = null;
    this.countdownInterval = null;
    this.phaseTimers = [];
    this.actedThisRound = new Set();

    // 6 Sièges : Joueur principal (0) + 5 Bots (1 à 5)
    // Poker solo = entraînement : jetons fictifs, le vrai solde du joueur n'est jamais touché
    const initialHeroStack = 10000;
    const initialHeroName = (typeof state !== 'undefined' && state.username) ? state.username : 'Flambeur (Toi)';
    const initialHeroAvatar = (typeof getAvatarDisplay === 'function') ? getAvatarDisplay(state) : '😎';

    this.players = [
      { id: 0, name: initialHeroName, avatar: initialHeroAvatar, stack: initialHeroStack, isHero: true, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 1, name: 'Viper (Bot)', avatar: '🐍', stack: 6000, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 2, name: 'Le Baron (Bot)', avatar: '🎩', stack: 8500, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 3, name: 'Roxy (Bot)', avatar: '🦊', stack: 5200, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 4, name: 'Montana (Bot)', avatar: '🤠', stack: 7100, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 5, name: 'Kaiser (Bot)', avatar: '👑', stack: 12000, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null }
    ];
  }

  syncHeroBalance() {
    // jetons d'entraînement : rien à synchroniser avec le solde réel (géré uniquement par le serveur)
  }

  updateHeroIdentity() {
    const hero = this.players[0];
    if (typeof state !== 'undefined') {
      if (state.username) {
        hero.name = state.username;
      }
      if (typeof getAvatarDisplay === 'function') {
        hero.avatar = getAvatarDisplay(state);
      }
    }
    const pseudoEl = document.querySelector('#heroPlayerEncart .player-pseudo');
    if (pseudoEl && hero.name) pseudoEl.textContent = hero.name;
    const avatarEl = document.querySelector('#heroPlayerEncart .player-avatar-box > div');
    if (avatarEl && hero.avatar) avatarEl.textContent = hero.avatar;
    const stackEl = document.getElementById('playerTotalStack');
    if (stackEl) stackEl.textContent = `${hero.stack.toLocaleString('fr-FR')} €`;
  }

  setTableFormat(format) {
    this.tableFormat = format;
    if (format === '1v1') {
      this.activeSeatIndices = [0, 3]; // Hero et Roxy en face
    } else if (format === '4max') {
      this.activeSeatIndices = [0, 1, 3, 5]; // Hero + Viper, Roxy, Kaiser
    } else {
      this.activeSeatIndices = [0, 1, 2, 3, 4, 5]; // Table 6 Max
    }
    this.startNewHand();
  }

  setBigBlind(blind) {
    this.bigBlind = blind;
    this.smallBlind = Math.floor(blind / 2);
    this.startNewHand();
  }

  startNewHand() {
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.phaseTimers.forEach(t => clearTimeout(t));
    this.phaseTimers = [];

    const modal = document.getElementById('winnerBannerModal');
    if (modal) modal.classList.add('hidden');

    // Recharges de stack et synchronisation avec state.balance du site principal
    if (typeof state !== 'undefined') {
      if (this.players[0].stack <= 0) this.players[0].stack = 10000; // recharge d'entraînement
      this.players[0].name = state.username || 'Flambeur (Toi)';
      if (typeof getAvatarDisplay === 'function') {
        this.players[0].avatar = getAvatarDisplay(state);
      }
    } else {
      if (this.players[0].stack <= 0) this.players[0].stack = 10000;
    }
    for (let i = 1; i < this.players.length; i++) {
      if (this.players[i].stack <= 0) this.players[i].stack = 5000;
    }

    this.deck = createShuffledDeck();
    this.communityCards = [];
    this.pot = 0;
    this.phase = 'preflop';
    this.actedThisRound.clear();

    // Distribution des cartes fermées aux joueurs actifs
    this.players.forEach(p => {
      const isActive = this.activeSeatIndices.includes(p.id);
      p.folded = !isActive;
      p.allIn = false;
      p.currentBet = 0;
      p.handTotal = 0;
      p.empty = false;
      p.noCards = false;
      p.status = isActive ? '🟢 Prêt' : '';
      p.bestHand = null;
      p.hand = isActive ? [this.deck.pop(), this.deck.pop()] : [];
    });

    // Rotation Dealer parmi les sièges actifs
    this.dealerIndex = this.getNextActiveSeat(this.dealerIndex);

    // Prélèvement des Blinds
    const sbSeat = this.getNextActiveSeat(this.dealerIndex);
    const bbSeat = this.getNextActiveSeat(sbSeat);

    const sbPlayer = this.players[sbSeat];
    const bbPlayer = this.players[bbSeat];

    const sbAmount = Math.min(this.smallBlind, sbPlayer.stack);
    sbPlayer.stack -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    sbPlayer.handTotal = (sbPlayer.handTotal || 0) + sbAmount;
    if (sbPlayer.stack === 0) sbPlayer.allIn = true;
    if (sbPlayer.isHero) this.syncHeroBalance();

    const bbAmount = Math.min(this.bigBlind, bbPlayer.stack);
    bbPlayer.stack -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    bbPlayer.handTotal = (bbPlayer.handTotal || 0) + bbAmount;
    if (bbPlayer.stack === 0) bbPlayer.allIn = true;
    if (bbPlayer.isHero) this.syncHeroBalance();

    this.pot = sbAmount + bbAmount;
    this.currentMaxBet = Math.max(sbAmount, bbAmount);
    this.lastRaiseSize = this.bigBlind;

    // Premier de parole en Pré-Flop : UTG
    this.currentTurn = this.getNextActiveSeat(bbSeat);

    this.exp.syncTable3D();
    this.exp.updateHeroLiveHand();
    this.startTurn();
  }

  getNextActiveSeat(fromSeat) {
    let seat = (fromSeat + 1) % this.players.length;
    let attempts = 0;
    while (attempts < this.players.length) {
      const p = this.players[seat];
      if (this.activeSeatIndices.includes(seat) && !p.folded && p.stack > 0) {
        return seat;
      }
      seat = (seat + 1) % this.players.length;
      attempts++;
    }
    return fromSeat;
  }

  getActivePlayers() {
    return this.players.filter(p => this.activeSeatIndices.includes(p.id) && !p.folded);
  }

  getPlayersWithChips() {
    return this.players.filter(p => this.activeSeatIndices.includes(p.id) && !p.folded && p.stack > 0);
  }

  startTurn() {
    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.finishHandWithSoleWinner(active[0] || this.players[0]);
      return;
    }

    const player = this.players[this.currentTurn];
    if (player.folded || player.stack === 0) {
      this.advanceTurn();
      return;
    }

    if (player.isHero) {
      this.isHeroTurn = true;
      this.exp.syncTable3D();
    } else {
      this.isHeroTurn = false;
      player.status = '⏳ Réfléchit...';
      this.exp.syncTable3D();

      // Délai réaliste de réflexion entre 1400ms et 2200ms
      const thinkDelay = 1400 + Math.floor(Math.random() * 800);
      this.botTimer = setTimeout(() => {
        this.executeBotAI(player);
      }, thinkDelay);
    }
  }

  advanceTurn() {
    this.actedThisRound.add(this.currentTurn);

    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.finishHandWithSoleWinner(active[0] || this.players[0]);
      return;
    }

    const playersWithChips = this.getPlayersWithChips();
    const allChipsActed = playersWithChips.every(p => this.actedThisRound.has(p.id) && p.currentBet === this.currentMaxBet);

    if (playersWithChips.length <= 1 || allChipsActed) {
      this.advancePhase();
      return;
    }

    this.currentTurn = this.getNextActiveSeat(this.currentTurn);
    this.startTurn();
  }

  /* ------------------------------------------------------------------------- */
  /* DISTRIBUTION SÉQUENTIELLE DU FLOP, TURN ET RIVER                         */
  /* ------------------------------------------------------------------------- */
  advancePhase() {
    this.players.forEach(p => { p.currentBet = 0; });
    this.currentMaxBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.actedThisRound.clear();

    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.finishHandWithSoleWinner(active[0] || this.players[0]);
      return;
    }

    // 1. DISTRIBUTION SÉQUENTIELLE DU FLOP
    if (this.phase === 'preflop') {
      this.phase = 'dealing_flop';
      this.isHeroTurn = false;
      this.exp.syncHUD();

      const c1 = this.deck.pop();
      const c2 = this.deck.pop();
      const c3 = this.deck.pop();

      this.communityCards = [c1];
      this.exp.animateDealCommunityCard(0, c1);
      this.exp.updateHeroLiveHand();

      const t1 = setTimeout(() => {
        this.communityCards.push(c2);
        this.exp.animateDealCommunityCard(1, c2);
        this.exp.updateHeroLiveHand();

        const t2 = setTimeout(() => {
          this.communityCards.push(c3);
          this.exp.animateDealCommunityCard(2, c3);
          this.exp.updateHeroLiveHand();

          this.phase = 'flop';
          this.exp.syncTable3D();

          this.checkAllInOrStartBetting();
        }, 450);
        this.phaseTimers.push(t2);
      }, 450);
      this.phaseTimers.push(t1);
      return;
    }

    // 2. DISTRIBUTION DU TURN (Délai 600ms)
    if (this.phase === 'flop') {
      this.phase = 'dealing_turn';
      this.isHeroTurn = false;
      this.exp.syncHUD();

      const t = setTimeout(() => {
        const turnCard = this.deck.pop();
        this.communityCards.push(turnCard);
        this.exp.animateDealCommunityCard(3, turnCard);
        this.exp.updateHeroLiveHand();

        this.phase = 'turn';
        this.exp.syncTable3D();

        this.checkAllInOrStartBetting();
      }, 600);
      this.phaseTimers.push(t);
      return;
    }

    // 3. DISTRIBUTION DE LA RIVER (Délai 600ms)
    if (this.phase === 'turn') {
      this.phase = 'dealing_river';
      this.isHeroTurn = false;
      this.exp.syncHUD();

      const t = setTimeout(() => {
        const riverCard = this.deck.pop();
        this.communityCards.push(riverCard);
        this.exp.animateDealCommunityCard(4, riverCard);
        this.exp.updateHeroLiveHand();

        this.phase = 'river';
        this.exp.syncTable3D();

        this.checkAllInOrStartBetting();
      }, 600);
      this.phaseTimers.push(t);
      return;
    }

    // 4. SHOWDOWN
    if (this.phase === 'river') {
      this.phase = 'showdown';
      this.executeShowdown();
      return;
    }
  }

  checkAllInOrStartBetting() {
    const canBet = this.getPlayersWithChips();
    if (canBet.length <= 1) {
      this.exp.syncTable3D();
      const t = setTimeout(() => {
        this.advancePhase();
      }, 1000);
      this.phaseTimers.push(t);
      return;
    }
    this.currentTurn = this.getNextActiveSeat(this.dealerIndex);
    this.startTurn();
  }

  /* ------------------------------------------------------------------------- */
  /* IA DES BOTS : ANALYSE & DÉCISIONS COHÉRENTES                              */
  /* ------------------------------------------------------------------------- */
  executeBotAI(bot) {
    if (bot.folded || bot.stack <= 0) {
      this.advanceTurn();
      return;
    }

    const toCall = this.currentMaxBet - bot.currentBet;
    const cards = [...bot.hand, ...this.communityCards];
    const evaluated = evaluateBestHand(cards);

    let strength = 0.3;
    if (this.phase === 'preflop') {
      const v1 = bot.hand[0].value;
      const v2 = bot.hand[1].value;
      const isPair = (v1 === v2);
      const isSuited = (bot.hand[0].suit === bot.hand[1].suit);
      const highCard = Math.max(v1, v2);

      if (isPair && highCard >= 10) strength = 0.95;
      else if (isPair) strength = 0.75;
      else if (highCard >= 13) strength = isSuited ? 0.80 : 0.65;
      else if (highCard >= 11) strength = isSuited ? 0.60 : 0.45;
      else strength = isSuited ? 0.35 : 0.20;
    } else {
      if (evaluated.tier >= 7) strength = 0.98;
      else if (evaluated.tier >= 5) strength = 0.88;
      else if (evaluated.tier === 4) strength = 0.80;
      else if (evaluated.tier === 3) strength = 0.68;
      else if (evaluated.tier === 2) strength = evaluated.score > 10 ? 0.55 : 0.40;
      else strength = 0.20;
    }

    if (toCall <= 0) {
      if (strength >= 0.75 && Math.random() < 0.45) {
        this.processRaise(bot.id, this.currentMaxBet + this.bigBlind * 2);
      } else if (strength >= 0.50 && Math.random() < 0.20) {
        this.processRaise(bot.id, this.currentMaxBet + this.bigBlind);
      } else {
        this.processCheck(bot.id);
      }
    } else {
      const callRatio = toCall / (bot.stack + toCall);
      if (strength >= 0.80) {
        if (Math.random() < 0.35 && bot.stack > toCall + this.bigBlind) {
          this.processRaise(bot.id, this.currentMaxBet + this.bigBlind * 2);
        } else {
          this.processCall(bot.id, toCall);
        }
      } else if (strength >= 0.50) {
        if (callRatio <= 0.35 || toCall <= this.bigBlind * 3) {
          this.processCall(bot.id, toCall);
        } else {
          this.processFold(bot.id);
        }
      } else if (strength >= 0.30) {
        if (toCall <= this.bigBlind) {
          this.processCall(bot.id, toCall);
        } else {
          this.processFold(bot.id);
        }
      } else {
        if (toCall <= this.bigBlind && Math.random() < 0.25) {
          this.processCall(bot.id, toCall);
        } else {
          this.processFold(bot.id);
        }
      }
    }
  }

  processCheck(playerId) {
    const p = this.players[playerId];
    p.status = '🟢 Parole';
    this.advanceTurn();
  }

  processCall(playerId, toCall) {
    const p = this.players[playerId];
    const amount = Math.min(toCall, p.stack);
    p.stack -= amount;
    p.currentBet += amount;
    p.handTotal = (p.handTotal || 0) + amount;
    this.pot += amount;
    if (p.stack === 0) p.allIn = true;
    if (p.isHero) this.syncHeroBalance();
    p.status = p.allIn ? '🔥 Tapis' : `🟡 Suit (${p.currentBet} €)`;
    this.advanceTurn();
  }

  processRaise(playerId, targetBet) {
    const p = this.players[playerId];
    const needed = targetBet - p.currentBet;
    const amount = Math.min(needed, p.stack);
    p.stack -= amount;
    p.currentBet += amount;
    p.handTotal = (p.handTotal || 0) + amount;
    this.pot += amount;

    if (p.currentBet > this.currentMaxBet) {
      this.lastRaiseSize = p.currentBet - this.currentMaxBet;
      this.currentMaxBet = p.currentBet;
    }
    if (p.stack === 0) p.allIn = true;
    if (p.isHero) this.syncHeroBalance();
    p.status = p.allIn ? '🔥 Tapis' : `🔵 Relance (${p.currentBet} €)`;

    this.actedThisRound.clear();
    this.actedThisRound.add(playerId);
    this.advanceTurn();
  }

  processFold(playerId) {
    const p = this.players[playerId];
    p.folded = true;
    p.status = '🔴 Couché';
    if (p.isHero) {
      this.exp.updateHeroLiveHand();
    }
    this.advanceTurn();
  }

  executeShowdown() {
    this.isHeroTurn = false;
    const remaining = this.getActivePlayers();

    remaining.forEach(p => {
      const cards = [...p.hand, ...this.communityCards];
      p.bestHand = evaluateBestHand(cards);
    });

    // Répartition par pots (principal + annexes) : on ne gagne que ce qu'on a pu suivre
    const entries = this.players
      .filter(p => (p.handTotal || 0) > 0)
      .map(p => ({ id: p.id, total: p.handTotal, folded: p.folded || !this.activeSeatIndices.includes(p.id) }));
    const pots = buildSidePots(entries);
    const winnerIds = new Set();
    const won = {};
    pots.forEach(pot => {
      const contenders = pot.eligible.map(id => this.players[id]).filter(p => p && p.bestHand);
      if (!contenders.length) return;
      const best = Math.max(...contenders.map(p => p.bestHand.score));
      const potWinners = contenders.filter(p => p.bestHand.score === best);
      const share = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount - share * potWinners.length;
      potWinners.forEach((w, idx) => {
        const gain = share + (idx === 0 ? remainder : 0);
        w.stack += gain;
        won[w.id] = (won[w.id] || 0) + gain;
        winnerIds.add(w.id);
      });
    });

    const winners = remaining.filter(p => winnerIds.has(p.id));
    winners.forEach(w => {
      w.status = '👑 Vainqueur !';
      if (w.isHero) this.syncHeroBalance();
    });
    this.lastWon = won;

    this.exp.syncTable3D();
    this.exp.updateHeroLiveHand();
    this.showWinnerBanner(winners.length ? winners : remaining);
  }

  finishHandWithSoleWinner(soleWinner) {
    this.phase = 'finished';
    this.isHeroTurn = false;
    soleWinner.stack += this.pot;
    soleWinner.status = '👑 Vainqueur !';
    if (soleWinner.isHero) this.syncHeroBalance();

    this.exp.syncTable3D();
    this.exp.updateHeroLiveHand();

    const bannerTitle = document.getElementById('bannerTitle');
    const winnerName = document.getElementById('bannerWinnerName');
    const potWon = document.getElementById('bannerPotWon');
    const handDesc = document.getElementById('bannerHandDescription');
    const details = document.getElementById('bannerHandDetails');
    const modal = document.getElementById('winnerBannerModal');

    if (modal) {
      if (bannerTitle) bannerTitle.textContent = 'Tous couchés • Vainqueur';
      if (winnerName) winnerName.textContent = `${soleWinner.avatar} ${soleWinner.name}`;
      if (potWon) potWon.textContent = `+ ${this.pot.toLocaleString('fr-FR')} €`;
      if (handDesc) handDesc.textContent = 'Tous les adversaires se sont couchés';
      if (details) details.innerHTML = `<div class="text-stone-300 font-medium">${soleWinner.name} remporte le pot sans abattage.</div>`;
      modal.classList.remove('hidden');
    }

    this.startNextHandCountdown();
  }

  showWinnerBanner(winners) {
    const bannerTitle = document.getElementById('bannerTitle');
    const winnerName = document.getElementById('bannerWinnerName');
    const potWon = document.getElementById('bannerPotWon');
    const handDesc = document.getElementById('bannerHandDescription');
    const details = document.getElementById('bannerHandDetails');
    const modal = document.getElementById('winnerBannerModal');

    if (modal) {
      if (bannerTitle) bannerTitle.textContent = winners.length > 1 ? 'Partage du pot !' : 'Abattage • Vainqueur';
      if (winnerName) {
        winnerName.textContent = winners.map(w => `${w.avatar} ${w.name}`).join(' & ');
      }
      if (potWon) {
        const gained = winners.reduce((sum, w) => sum + ((this.lastWon && this.lastWon[w.id]) || 0), 0);
        potWon.textContent = `+ ${(gained || this.pot).toLocaleString('fr-FR')} €`;
      }
      if (handDesc) handDesc.textContent = winners[0].bestHand ? winners[0].bestHand.name : 'Meilleure combinaison';

      if (details) {
        const remaining = this.getActivePlayers();
        let html = '';
        remaining.forEach(p => {
          const isW = winners.includes(p);
          const hName = p.bestHand ? p.bestHand.name : 'Inconnue';
          const cardsStr = p.hand.map(c => `${c.rank}${c.suit}`).join(' ');
          html += `
            <div class="flex items-center justify-between py-1 border-b border-white/5 ${isW ? 'text-amber-300 font-black' : 'text-stone-400 font-medium'}">
              <span>${p.avatar} ${p.name} <span class="font-mono text-[10px] text-stone-500">(${cardsStr})</span></span>
              <span>${hName}</span>
            </div>
          `;
        });
        details.innerHTML = html;
      }

      modal.classList.remove('hidden');
    }

    this.startNextHandCountdown();
  }

  startNextHandCountdown() {
    let secondsLeft = 4;
    const countdownEl = document.getElementById('nextHandCountdown');
    if (countdownEl) countdownEl.textContent = `(${secondsLeft}s)`;

    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(() => {
      secondsLeft--;
      if (countdownEl) countdownEl.textContent = `(${secondsLeft}s)`;
      if (secondsLeft <= 0) {
        clearInterval(this.countdownInterval);
        this.startNewHand();
      }
    }, 1000);
  }

  // Bornes de la relance (en « mise totale visée » pour le tour en cours)
  getRaiseBounds() {
    const hero = this.players[0];
    const maxTo = hero.stack + hero.currentBet;
    const minTo = Math.min(maxTo, this.currentMaxBet + Math.max(this.bigBlind, this.lastRaiseSize));
    return { min: minTo, max: maxTo };
  }

  heroFold() {
    if (!this.isHeroTurn) return;
    this.isHeroTurn = false;
    this.processFold(0);
  }

  heroCheckOrCall() {
    if (!this.isHeroTurn) return;
    this.isHeroTurn = false;
    const hero = this.players[0];
    const toCall = this.currentMaxBet - hero.currentBet;
    if (toCall <= 0) {
      this.processCheck(0);
    } else {
      this.processCall(0, toCall);
    }
  }

  heroRaise() {
    if (!this.isHeroTurn) return;
    const hero = this.players[0];
    const slider = document.getElementById('demoRaiseSlider');
    let target = slider ? parseInt(slider.value, 10) : (this.currentMaxBet + this.bigBlind);
    target = Math.min(hero.stack + hero.currentBet, Math.max(this.currentMaxBet + this.bigBlind, target));

    this.isHeroTurn = false;
    this.processRaise(0, target);
  }

  onSliderInput(val) {
    const num = parseInt(val, 10);
    const disp = document.getElementById('demoRaiseDisplay');
    const btn = document.getElementById('btnRaiseAmount');
    if (disp) disp.textContent = `${num.toLocaleString('fr-FR')} €`;
    if (btn) btn.textContent = `${num.toLocaleString('fr-FR')} €`;
  }

  setQuickRaise(type) {
    const b = this.getRaiseBounds();
    let val = b.min;

    if (type === 'min') val = b.min;
    else if (type === 'allin') val = b.max;
    else if (typeof type === 'number') val = Math.min(b.max, Math.max(b.min, type));

    const slider = document.getElementById('demoRaiseSlider');
    if (slider) slider.value = val;
    this.onSliderInput(val);
  }
}

/* ------------------------------------------------------------------------- */
/* D. CLASSE PRINCIPALE THREE.JS, CAMÉRA RESPONSIVE & RENDU ANISOTROPE       */
/* ------------------------------------------------------------------------- */
class Poker3DExperience {
  constructor(containerElement, options = {}) {
    this.container = typeof containerElement === 'string' 
      ? document.getElementById(containerElement) 
      : containerElement;

    if (!this.container) {
      console.error('[Poker3D] Conteneur introuvable.');
      return;
    }

    this.options = Object.assign({
      feltColor: 0x0a3821,
      railColor: 0x121013,
      woodColor: 0x1e1108,
      tableWidth: 6.6,
      tableDepth: 3.3,
    }, options);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.spotLight = null;
    this.animationFrameId = null;
    this.tableGroup = null;

    this.textureCache = {};

    this.thetas = [
      Math.PI - 0.55,       // Bot 1 : Viper (Gauche bas ~148°)
      -Math.PI + 1.05,      // Bot 2 : Le Baron (Gauche haut ~220°)
      -Math.PI / 2,         // Bot 3 : Roxy (Top centre / En face 270°)
      -1.05,                // Bot 4 : Montana (Droite haut ~320°)
      0.55                  // Bot 5 : Kaiser (Droite bas ~32°)
    ];

    this.tableFormat = '6max';
    this.activeBotIndices = [0, 1, 2, 3, 4];

    this.botAnchors3D = [];
    this.htmlNameplateElements = [];

    this.heroCards = [];
    this.communityCardMeshes = [];
    this.botCards = [];
    this.botChipGroups = [];
    this.heroChipGroup = null;
    this.centerPotGroup = null;

    this.game = null;
    this.soloGame = null;

    this.init();
  }

  init() {
    if (typeof THREE === 'undefined') {
      console.error('[Poker3D] Three.js n\'est pas chargé.');
      return;
    }

    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLighting();
    this.buildPokerTable();
    this.buildHeroCards();
    this.buildCommunityCards();
    this.buildOpponentsSeats();
    this.buildCenterPotChips();
    this.setupHTMLNameplates();
    this.setupEventListeners();
    this.handleResize();
    this.startRenderLoop();

    this.game = new TexasHoldemGame(this);
    this.soloGame = this.game;
    if (this.options.autoStart !== false) {
      this.game.startNewHand();
    }

    console.log('♠️ [Poker3D] Scène texturée et moteur Texas Hold\'em initialisés.');
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060608);
    this.scene.fog = new THREE.FogExp2(0x060608, 0.04);
  }

  setupCamera() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 50);
    this.updateCameraForDevice(width, height);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.renderer.domElement.id = 'poker3dCanvas';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.zIndex = '1';
    this.renderer.domElement.style.pointerEvents = 'none';

    this.container.style.position = 'relative';
    this.container.appendChild(this.renderer.domElement);
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x10131a, 0.35);
    this.scene.add(ambientLight);

    this.spotLight = new THREE.SpotLight(0xffeed1, 3.8);
    this.spotLight.position.set(0, 6.8, 0.2);
    this.spotLight.angle = Math.PI / 4.1;
    this.spotLight.penumbra = 0.58;
    this.spotLight.decay = 1.35;
    this.spotLight.distance = 18;

    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 1024;
    this.spotLight.shadow.mapSize.height = 1024;
    this.spotLight.shadow.camera.near = 1;
    this.spotLight.shadow.camera.far = 12;
    this.spotLight.shadow.bias = -0.00012;

    this.scene.add(this.spotLight);
    this.scene.add(this.spotLight.target);
    this.spotLight.target.position.set(0, 0, 0);

    const rimLight = new THREE.DirectionalLight(0x334460, 0.45);
    rimLight.position.set(0, 3, -6);
    this.scene.add(rimLight);

    const floorGeo = new THREE.PlaneGeometry(32, 32);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x070709, roughness: 0.95 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.8;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  buildPokerTable() {
    this.tableGroup = new THREE.Group();

    const w = this.options.tableWidth;
    const d = this.options.tableDepth;
    const r = d / 2;
    const straightLen = w - d;

    const ovalShape = new THREE.Shape();
    ovalShape.moveTo(-straightLen / 2, r);
    ovalShape.lineTo(straightLen / 2, r);
    ovalShape.absarc(straightLen / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
    ovalShape.lineTo(-straightLen / 2, -r);
    ovalShape.absarc(-straightLen / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);

    const feltTexture = this.generateRealisticFeltTexture();
    const feltBumpMap = this.generateFeltBumpMap();
    const feltMat = new THREE.MeshStandardMaterial({
      color: this.options.feltColor,
      map: feltTexture,
      bumpMap: feltBumpMap,
      bumpScale: 0.003,
      roughness: 0.94,
      metalness: 0.01
    });

    const feltMesh = new THREE.Mesh(new THREE.ShapeGeometry(ovalShape, 48), feltMat);
    feltMesh.rotation.x = -Math.PI / 2;
    feltMesh.receiveShadow = true;
    this.tableGroup.add(feltMesh);

    const ringShape = new THREE.Shape();
    const rw = w * 0.72, rd = d * 0.68, rr = rd / 2, rsl = rw - rd;
    ringShape.moveTo(-rsl / 2, rr);
    ringShape.lineTo(rsl / 2, rr);
    ringShape.absarc(rsl / 2, 0, rr, Math.PI / 2, -Math.PI / 2, true);
    ringShape.lineTo(-rsl / 2, -rr);
    ringShape.absarc(-rsl / 2, 0, rr, -Math.PI / 2, Math.PI / 2, true);

    const ringLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringShape.getPoints(64)),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.4 })
    );
    ringLine.rotation.x = -Math.PI / 2;
    ringLine.position.y = 0.002;
    this.tableGroup.add(ringLine);

    const woodRailShape = new THREE.Shape();
    const wrThickness = 0.18;
    const wrR = r + wrThickness;
    woodRailShape.moveTo(-straightLen / 2, wrR);
    woodRailShape.lineTo(straightLen / 2, wrR);
    woodRailShape.absarc(straightLen / 2, 0, wrR, Math.PI / 2, -Math.PI / 2, true);
    woodRailShape.lineTo(-straightLen / 2, -wrR);
    woodRailShape.absarc(-straightLen / 2, 0, wrR, -Math.PI / 2, Math.PI / 2, true);

    const wrHole = new THREE.Path();
    wrHole.moveTo(-straightLen / 2, r);
    wrHole.lineTo(straightLen / 2, r);
    wrHole.absarc(straightLen / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
    wrHole.lineTo(-straightLen / 2, -r);
    wrHole.absarc(-straightLen / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);
    woodRailShape.holes.push(wrHole);

    const woodRailMat = new THREE.MeshStandardMaterial({
      color: this.options.woodColor,
      roughness: 0.38,
      metalness: 0.12
    });
    const woodRailMesh = new THREE.Mesh(new THREE.ShapeGeometry(woodRailShape, 48), woodRailMat);
    woodRailMesh.rotation.x = -Math.PI / 2;
    woodRailMesh.position.y = 0.001;
    woodRailMesh.receiveShadow = true;
    this.tableGroup.add(woodRailMesh);

    const railOuterShape = new THREE.Shape();
    const railThickness = 0.38;
    const roR = wrR + railThickness;
    railOuterShape.moveTo(-straightLen / 2, roR);
    railOuterShape.lineTo(straightLen / 2, roR);
    railOuterShape.absarc(straightLen / 2, 0, roR, Math.PI / 2, -Math.PI / 2, true);
    railOuterShape.lineTo(-straightLen / 2, -roR);
    railOuterShape.absarc(-straightLen / 2, 0, roR, -Math.PI / 2, Math.PI / 2, true);

    const railHole = new THREE.Path();
    railHole.moveTo(-straightLen / 2, wrR);
    railHole.lineTo(straightLen / 2, wrR);
    railHole.absarc(straightLen / 2, 0, wrR, Math.PI / 2, -Math.PI / 2, true);
    railHole.lineTo(-straightLen / 2, -wrR);
    railHole.absarc(-straightLen / 2, 0, wrR, -Math.PI / 2, Math.PI / 2, true);
    railOuterShape.holes.push(railHole);

    const railMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(railOuterShape, { depth: 0.14, bevelEnabled: true, bevelSegments: 4, bevelSize: 0.08, bevelThickness: 0.08 }),
      new THREE.MeshStandardMaterial({ color: this.options.railColor, roughness: 0.35, metalness: 0.14 })
    );
    railMesh.rotation.x = -Math.PI / 2;
    railMesh.position.y = -0.04;
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    this.tableGroup.add(railMesh);

    const legGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.6, 24);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x110b06, roughness: 0.7 });
    const leg1 = new THREE.Mesh(legGeo, legMat);
    leg1.position.set(-1.5, -0.9, 0);
    leg1.castShadow = true;
    this.tableGroup.add(leg1);

    const leg2 = new THREE.Mesh(legGeo, legMat);
    leg2.position.set(1.5, -0.9, 0);
    leg2.castShadow = true;
    this.tableGroup.add(leg2);

    this.scene.add(this.tableGroup);
  }

  createCardObject(rank = 'A', suit = '♠', isFaceDown = false, scale = 1.0) {
    const baseWidth = 0.48;
    const baseLength = 0.70;
    const cardThickness = 0.004;

    const cardWidth = baseWidth * scale;
    const cardLength = baseLength * scale;

    const geo = new THREE.BoxGeometry(cardWidth, cardLength, cardThickness);
    const frontTexture = this.getCardFrontTexture(rank, suit);
    const backTexture = this.getCardBackTexture();

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
    const frontMat = new THREE.MeshBasicMaterial({ map: frontTexture, transparent: true, opacity: 1.0 });
    const backMat = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.35, metalness: 0.08, transparent: true, opacity: 1.0 });

    const materials = [
      edgeMat, // +X
      edgeMat, // -X
      edgeMat, // +Y
      edgeMat, // -Y
      isFaceDown ? backMat : frontMat,  // +Z (Haut : visible quand posée à plat)
      isFaceDown ? frontMat : backMat   // -Z (Bas : contre le tapis)
    ];

    const cardMesh = new THREE.Mesh(geo, materials);
    cardMesh.castShadow = true;
    cardMesh.receiveShadow = true;
    cardMesh.userData = { rank, suit, isFaceDown };
    return cardMesh;
  }

  setCardFace(cardMesh, rank, suit) {
    if (!cardMesh) return;
    const frontTexture = this.getCardFrontTexture(rank, suit);
    cardMesh.material[4] = new THREE.MeshBasicMaterial({ map: frontTexture, transparent: true, opacity: 1.0 });
    cardMesh.material[4].needsUpdate = true;
    cardMesh.userData = { rank, suit, isFaceDown: false };
  }

  setCardBack(cardMesh) {
    if (!cardMesh) return;
    const backTexture = this.getCardBackTexture();
    cardMesh.material[4] = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.35, metalness: 0.08, transparent: true, opacity: 1.0 });
    cardMesh.material[4].needsUpdate = true;
    cardMesh.userData = { isFaceDown: true };
  }

  setCardOpacity(cardMesh, opacity) {
    if (!cardMesh || !cardMesh.material) return;
    cardMesh.material.forEach(m => {
      m.transparent = true;
      m.opacity = opacity;
      m.needsUpdate = true;
    });
  }

  buildHeroCards() {
    const TABLE_Y = 0;
    const Rz = 1.35;
    const heroZ = Rz * 0.62; // ~0.84

    const card1 = this.createCardObject('A', '♠', false, 0.75);
    card1.position.set(-0.22, TABLE_Y + 0.015, heroZ);
    card1.rotation.set(-Math.PI / 2, 0, 0.08);
    this.scene.add(card1);

    const card2 = this.createCardObject('K', '♠', false, 0.75);
    card2.position.set(0.22, TABLE_Y + 0.016, heroZ);
    card2.rotation.set(-Math.PI / 2, 0, -0.08);
    this.scene.add(card2);

    this.heroCards = [card1, card2];

    this.heroChipGroup = new THREE.Group();
    this.scene.add(this.heroChipGroup);
  }

  buildCommunityCards() {
    const TABLE_Y = 0;
    const spacing = 0.44;
    const startX = - (4 * spacing) / 2; // -0.88
    const boardZ = 0.05;

    this.communityCardMeshes = [];
    for (let i = 0; i < 5; i++) {
      const card = this.createCardObject('A', '♠', false, 0.75);
      card.position.set(startX + i * spacing, TABLE_Y + 0.01, boardZ);
      card.rotation.set(-Math.PI / 2, 0, 0);
      card.visible = false;
      this.scene.add(card);
      this.communityCardMeshes.push(card);
    }
  }

  animateDealCommunityCard(index, card) {
    const mesh = this.communityCardMeshes[index];
    if (!mesh) return;
    this.setCardFace(mesh, card.rank, card.suit);
    this.setCardOpacity(mesh, 1.0);
    mesh.visible = true;

    const startY = 0.065;
    const targetY = 0.01;
    mesh.position.y = startY;

    const startTime = performance.now();
    const duration = 200;

    const slideAnim = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      mesh.position.y = startY + (targetY - startY) * ease;
      if (progress < 1) {
        requestAnimationFrame(slideAnim);
      } else {
        mesh.position.y = targetY;
      }
    };
    requestAnimationFrame(slideAnim);
  }

  buildOpponentsSeats() {
    const TABLE_Y = 0;
    const Rx = 2.60;
    const Rz = 1.35;

    this.botCards = [];
    this.botChipGroups = [];
    this.botAnchors3D = [];

    this.thetas.forEach((theta, i) => {
      const npX = Math.cos(theta) * Rx * 1.05;
      const npZ = Math.sin(theta) * Rz * 1.05;
      this.botAnchors3D.push(new THREE.Vector3(npX, TABLE_Y + 0.05, npZ));

      const cardCenterX = Math.cos(theta) * Rx * 0.84;
      const cardCenterZ = Math.sin(theta) * Rz * 0.84;
      const rotZ = -theta - Math.PI / 2;
      const tanX = -Math.sin(theta);
      const tanZ = Math.cos(theta);

      const c1 = this.createCardObject('?', '?', true, 0.55);
      c1.position.set(cardCenterX - tanX * 0.06, TABLE_Y + 0.01, cardCenterZ - tanZ * 0.06);
      c1.rotation.set(-Math.PI / 2, 0, rotZ + 0.03);
      this.scene.add(c1);

      const c2 = this.createCardObject('?', '?', true, 0.55);
      c2.position.set(cardCenterX + tanX * 0.06, TABLE_Y + 0.011, cardCenterZ + tanZ * 0.06);
      c2.rotation.set(-Math.PI / 2, 0, rotZ - 0.03);
      this.scene.add(c2);

      this.botCards.push([c1, c2]);

      const chipGrp = new THREE.Group();
      this.scene.add(chipGrp);
      this.botChipGroups.push(chipGrp);
    });
  }

  buildCenterPotChips() {
    this.centerPotGroup = new THREE.Group();
    this.scene.add(this.centerPotGroup);
  }

  /* ------------------------------------------------------------------------- */
  /* GESTION DYNAMIQUE DU FORMAT DE TABLE (1v1, 4-MAX, 6-MAX)                 */
  /* ------------------------------------------------------------------------- */
  // Affichage seul du format (sièges visibles), sans toucher à la partie en cours
  applyFormat(format) {
    this.tableFormat = format;
    if (format === '1v1') {
      this.applySeatLayout([2]); // Roxy en face
    } else if (format === '4max') {
      this.applySeatLayout([0, 2, 4]); // Viper, Roxy, Kaiser
    } else {
      this.applySeatLayout([0, 1, 2, 3, 4]); // Les 5 bots
    }
  }

  // Sièges adverses visibles (indices 0 à 4 = joueurs 1 à 5)
  applySeatLayout(botIndices) {
    this.activeBotIndices = botIndices.slice();

    // Afficher ou masquer les éléments 3D et Nameplates selon le format
    for (let i = 0; i < 5; i++) {
      const isActive = this.activeBotIndices.includes(i);
      if (this.botCards[i]) {
        this.botCards[i][0].visible = isActive;
        this.botCards[i][1].visible = isActive;
      }
      if (this.botChipGroups[i]) {
        this.botChipGroups[i].visible = isActive;
      }
      if (this.htmlNameplateElements[i]) {
        this.htmlNameplateElements[i].style.display = isActive ? 'flex' : 'none';
      }
    }
  }

  setTableFormat(format) {
    this.applyFormat(format);
    if (this.game && this.game.setTableFormat) {
      this.game.setTableFormat(format);
    }
  }

  /* ------------------------------------------------------------------------- */
  /* NAMEPLATES HTML ULTRA-NETTES (PROJECTION 3D->2D SANS TRANSFORM:SCALE)      */
  /* ------------------------------------------------------------------------- */
  setupHTMLNameplates() {
    const overlay = document.getElementById('nameplatesOverlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    this.htmlNameplateElements = [];

    // Plaques compactes en portrait : deux plaques tiennent côte à côte sur 360 px
    if (!document.getElementById('pk-compact-css')) {
      const st = document.createElement('style');
      st.id = 'pk-compact-css';
      st.textContent = `
        .pk-compact { padding: 3px 7px !important; gap: 5px !important; }
        .pk-compact .bot-avatar-box { display: none !important; }
        .pk-compact .bot-name { font-size: 12px !important; max-width: 76px; overflow: hidden; text-overflow: ellipsis; }
        .pk-compact .bot-status { font-size: 10px !important; }
        .pk-compact .bot-stack { font-size: 13px !important; }`;
      document.head.appendChild(st);
    }

    const botProfiles = [
      { name: 'Viper (Bot)', avatar: '🐍' },
      { name: 'Le Baron (Bot)', avatar: '🎩' },
      { name: 'Roxy (Bot)', avatar: '🦊' },
      { name: 'Montana (Bot)', avatar: '🤠' },
      { name: 'Kaiser (Bot)', avatar: '👑' }
    ];

    botProfiles.forEach((bot, i) => {
      const el = document.createElement('div');
      el.id = `botNameplate-${i}`;
      el.className = 'absolute pointer-events-none flex items-center gap-1.5 sm:gap-2 bg-[#0c0d14]/95 border border-amber-500/40 rounded-xl px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.85)] backdrop-blur-md whitespace-nowrap transition-transform duration-75';
      el.style.transform = 'translate(-50%, -100%)';
      el.style.width = 'max-content'; // largeur indépendante de la position (pas d'écrasement près des bords)
      el.style.left = '0px';
      el.style.top = '0px';

      el.innerHTML = `
        <div class="bot-avatar-box w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800 border border-amber-500/60 flex items-center justify-center text-xs sm:text-sm shadow">
          <span class="bot-avatar">${bot.avatar}</span>
        </div>
        <div class="flex flex-col text-left leading-tight">
          <div class="flex items-center gap-1 sm:gap-1.5">
            <span class="bot-name text-white" style="font-size: 13px; font-weight: 700; letter-spacing: -0.2px;">${bot.name}</span>
            <span class="bot-status" style="font-size: 11px; font-weight: 700; color: #34d399;">🟢 Prêt</span>
          </div>
          <div class="bot-stack font-mono" style="font-size: 14px; font-weight: 700; color: #FFD700;">
            🪙 5 000 €
          </div>
        </div>
      `;

      overlay.appendChild(el);
      this.htmlNameplateElements.push(el);
    });
  }

  updateHTMLNameplatesPosition() {
    if (!this.camera || !this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    for (let i = 0; i < this.botAnchors3D.length; i++) {
      const el = this.htmlNameplateElements[i];
      if (!el) continue;

      if (!this.activeBotIndices.includes(i)) {
        el.style.display = 'none';
        continue;
      }

      let anchor = this.botAnchors3D[i];
      if (this.portraitMode) {
        // Portrait : plaques alignées au-dessus du tapis, hors des cartes communes
        // [côté gauche -1 / centre 0 / droite 1, profondeur z] : une rangée par plaque
        const slots = [[-1, -0.9], [-1, -1.4], [0, -1.9], [1, -1.4], [1, -0.9]];
        const s = slots[i] || [0, -1.9];
        anchor = new THREE.Vector3(s[0] * 1.25, 0.05, s[1]);
      }
      const v = anchor.clone().project(this.camera);
      if (v.z > 1) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'flex';
      el.classList.toggle('pk-compact', !!this.portraitMode);

      // Arrondi strict à l'entier avec Math.round pour éradiquer le flou de sous-pixel
      let screenX = Math.round((v.x * 0.5 + 0.5) * width);
      if (this.portraitMode) {
        const half = Math.ceil((el.offsetWidth || 150) / 2) + 4;
        screenX = Math.max(half, Math.min(width - half, screenX));
      }
      const screenY = Math.round((-v.y * 0.5 + 0.5) * height);

      el.style.left = `${screenX}px`;
      el.style.top = `${screenY}px`;
    }
  }

  updateHTMLNameplate(botIdx, name, stack, avatar, status, isTurn) {
    const el = this.htmlNameplateElements[botIdx];
    if (!el || !this.activeBotIndices.includes(botIdx)) return;

    const nameEl = el.querySelector('.bot-name');
    const stackEl = el.querySelector('.bot-stack');
    const statusEl = el.querySelector('.bot-status');
    const avatarEl = el.querySelector('.bot-avatar');
    const avatarBox = el.querySelector('.bot-avatar-box');

    if (nameEl) nameEl.textContent = name;
    if (stackEl) {
      if (stack === null || stack === undefined) {
        stackEl.style.display = 'none';
      } else {
        stackEl.style.display = '';
        stackEl.textContent = `🪙 ${stack.toLocaleString('fr-FR')} €`;
      }
    }
    if (avatarEl) avatarEl.textContent = avatar;

    if (statusEl) {
      statusEl.textContent = status;
      if (status && status.includes('Couché')) {
        statusEl.style.color = '#ef4444';
      } else if (isTurn) {
        statusEl.style.color = '#fbbf24';
      } else if (status && status.includes('Vainqueur')) {
        statusEl.style.color = '#10b981';
      } else {
        statusEl.style.color = '#34d399';
      }
    }

    if (isTurn) {
      el.style.borderColor = '#fbbf24';
      el.style.boxShadow = '0 0 20px rgba(251, 191, 36, 0.65), 0 4px 16px rgba(0,0,0,0.85)';
      el.style.backgroundColor = 'rgba(28, 22, 16, 0.98)';
      el.style.opacity = '1.0';
      if (avatarBox) avatarBox.style.borderColor = '#fbbf24';
    } else if (status && status.includes('Couché')) {
      el.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.7)';
      el.style.backgroundColor = 'rgba(18, 10, 10, 0.88)';
      el.style.opacity = '0.55';
      if (avatarBox) avatarBox.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    } else {
      el.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.85)';
      el.style.backgroundColor = 'rgba(12, 13, 20, 0.95)';
      el.style.opacity = '1.0';
      if (avatarBox) avatarBox.style.borderColor = 'rgba(245, 158, 11, 0.6)';
    }
  }

  /* ------------------------------------------------------------------------- */
  /* SYNCHRONISATION DES JETONS 3D                                             */
  /* ------------------------------------------------------------------------- */
  syncChips3D(potAmount, players) {
    const chipRadius = 0.08;
    const chipHeight = 0.015;
    if (!this._chipGeo) this._chipGeo = new THREE.CylinderGeometry(chipRadius, chipRadius, chipHeight, 24);
    const chipGeo = this._chipGeo;
    const Rz = 1.35;
    const potZ = -Rz * 0.28;

    while (this.centerPotGroup.children.length > 0) {
      this.centerPotGroup.remove(this.centerPotGroup.children[0]);
    }
    if (potAmount > 0) {
      const stacks = [
        { x: -0.17, color: '#d97706' },
        { x: 0.0,   color: '#dc2626' },
        { x: 0.17,  color: '#16a34a' }
      ];
      const count = Math.min(5, Math.max(1, Math.ceil(potAmount / 1500)));
      stacks.forEach(st => {
        const mats = this.getChipMaterials(st.color);
        for (let h = 0; h < count; h++) {
          const chip = new THREE.Mesh(chipGeo, mats);
          chip.position.set(
            st.x + (Math.random() - 0.5) * 0.002,
            chipHeight / 2 + h * chipHeight,
            potZ + (Math.random() - 0.5) * 0.002
          );
          chip.rotation.y = Math.random() * Math.PI;
          chip.castShadow = true;
          chip.receiveShadow = true;
          this.centerPotGroup.add(chip);
        }
      });
    }

    while (this.heroChipGroup.children.length > 0) {
      this.heroChipGroup.remove(this.heroChipGroup.children[0]);
    }
    const hero = players[0];
    if (hero && hero.currentBet > 0) {
      const heroZ = Rz * 0.62;
      const mats = this.getChipMaterials('#d97706');
      const count = Math.min(5, Math.max(1, Math.ceil(hero.currentBet / 200)));
      for (let h = 0; h < count; h++) {
        const chip = new THREE.Mesh(chipGeo, mats);
        chip.position.set(
          -0.75 + (Math.random() - 0.5) * 0.003,
          chipHeight / 2 + h * chipHeight,
          heroZ + (Math.random() - 0.5) * 0.003
        );
        chip.rotation.y = Math.random() * Math.PI;
        chip.castShadow = true;
        chip.receiveShadow = true;
        this.heroChipGroup.add(chip);
      }
    }

    for (let i = 1; i < players.length; i++) {
      const bot = players[i];
      const grp = this.botChipGroups[i - 1];
      if (!grp) continue;
      while (grp.children.length > 0) {
        grp.remove(grp.children[0]);
      }
      if (this.activeBotIndices.includes(i - 1) && bot && bot.currentBet > 0) {
        const theta = this.thetas[i - 1];
        const Rx = 2.60;
        const chipX = Math.cos(theta + 0.35) * Rx * 0.68;
        const chipZ = Math.sin(theta + 0.35) * Rz * 0.68;
        const chipColor = (i % 2 === 0) ? '#16a34a' : '#2563eb';
        const mats = this.getChipMaterials(chipColor);
        const count = Math.min(5, Math.max(1, Math.ceil(bot.currentBet / 200)));
        for (let h = 0; h < count; h++) {
          const chip = new THREE.Mesh(chipGeo, mats);
          chip.position.set(
            chipX + (Math.random() - 0.5) * 0.003,
            chipHeight / 2 + h * chipHeight,
            chipZ + (Math.random() - 0.5) * 0.003
          );
          chip.rotation.y = Math.random() * Math.PI;
          chip.castShadow = true;
          chip.receiveShadow = true;
          grp.add(chip);
        }
      }
    }
  }

  /* ------------------------------------------------------------------------- */
  /* SYNCHRONISATION 3D & ÉVALUATION EN TEMPS RÉEL                             */
  /* ------------------------------------------------------------------------- */
  syncTable3D() {
    const g = this.game;
    if (!g) return;

    const commCards = g.communityCards;
    for (let i = 0; i < 5; i++) {
      const mesh = this.communityCardMeshes[i];
      if (!mesh) continue;
      if (i < commCards.length) {
        this.setCardFace(mesh, commCards[i].rank, commCards[i].suit);
        this.setCardOpacity(mesh, 1.0);
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    }

    const hero = g.players[0];
    if (hero.hand && hero.hand.length === 2) {
      this.setCardFace(this.heroCards[0], hero.hand[0].rank, hero.hand[0].suit);
      this.setCardFace(this.heroCards[1], hero.hand[1].rank, hero.hand[1].suit);
      if (hero.folded) {
        this.setCardOpacity(this.heroCards[0], 0.25);
        this.setCardOpacity(this.heroCards[1], 0.25);
      } else {
        this.setCardOpacity(this.heroCards[0], 1.0);
        this.setCardOpacity(this.heroCards[1], 1.0);
      }
      this.heroCards[0].visible = true;
      this.heroCards[1].visible = true;
    } else {
      this.heroCards[0].visible = false;
      this.heroCards[1].visible = false;
    }

    for (let i = 1; i <= 5; i++) {
      const bot = g.players[i];
      const cards = this.botCards[i - 1];
      if (!cards) continue;
      const isActive = this.activeBotIndices.includes(i - 1);
      if (!isActive) {
        cards[0].visible = false;
        cards[1].visible = false;
        continue;
      }

      if (bot.empty || bot.noCards) {
        cards[0].visible = false;
        cards[1].visible = false;
        continue;
      }

      cards[0].visible = true;
      cards[1].visible = true;

      if (bot.folded) {
        this.setCardOpacity(cards[0], 0.20);
        this.setCardOpacity(cards[1], 0.20);
      } else if (g.phase === 'showdown' && bot.hand && bot.hand.length === 2 && !bot.hand[0].hidden) {
        this.setCardFace(cards[0], bot.hand[0].rank, bot.hand[0].suit);
        this.setCardFace(cards[1], bot.hand[1].rank, bot.hand[1].suit);
        this.setCardOpacity(cards[0], 1.0);
        this.setCardOpacity(cards[1], 1.0);
      } else {
        this.setCardBack(cards[0]);
        this.setCardBack(cards[1]);
        this.setCardOpacity(cards[0], 1.0);
        this.setCardOpacity(cards[1], 1.0);
      }
    }

    for (let i = 1; i <= 5; i++) {
      const bot = g.players[i];
      const isTurn = (g.currentTurn === i && g.phase !== 'showdown' && g.phase !== 'finished');
      this.updateHTMLNameplate(i - 1, bot.name, bot.empty ? null : bot.stack, bot.avatar, bot.status, isTurn);
    }

    this.syncChips3D(g.pot, g.players);
    this.syncHUD();
    this.updateHeroLiveHand();
  }

  updateHeroLiveHand() {
    const g = this.game;
    if (!g) return;
    const hero = g.players[0];
    const textEl = document.getElementById('heroLiveHandText');
    const badgeEl = document.getElementById('heroLiveHandBadge');
    if (!textEl || !hero) return;

    if (hero.folded) {
      textEl.textContent = 'COUCHÉ';
      if (badgeEl) {
        badgeEl.className = 'px-2 py-0.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 font-mono text-[10px] sm:text-[11px] font-black tracking-wide flex items-center gap-1 shadow-md uppercase';
      }
      return;
    }

    if (!hero.hand || hero.hand.length < 2) {
      textEl.textContent = 'DISTRIBUTION...';
      return;
    }

    const allCards = [...hero.hand, ...g.communityCards];
    let handName = '';

    if (allCards.length === 2) {
      if (allCards[0].value === allCards[1].value) {
        handName = `PAIRE DE ${RANK_PLURALS[allCards[0].value].toUpperCase()}`;
      } else {
        const high = Math.max(allCards[0].value, allCards[1].value);
        handName = `CARTE HAUTE ${RANK_NAMES[high].toUpperCase()}`;
      }
    } else {
      const best = evaluateBestHand(allCards);
      handName = best ? best.name.replace(/[👑🔥💣♦️⚡🎯✨]/g, '').trim().toUpperCase() : 'EN COURS...';
    }

    textEl.textContent = handName;
    if (badgeEl) {
      badgeEl.className = 'px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-400/50 text-amber-300 font-mono text-[10px] sm:text-[11px] font-black tracking-wide flex items-center gap-1 shadow-md uppercase';
    }
  }

  syncHUD() {
    const g = this.game;
    if (!g) return;
    const hero = g.players[0];

    const potEl = document.getElementById('potCenterDisplay');
    if (potEl) potEl.textContent = `${g.pot.toLocaleString('fr-FR')} €`;

    const phaseEl = document.getElementById('tablePhaseDisplay');
    if (phaseEl) {
      if (g.phase === 'showdown' || g.phase === 'finished') {
        phaseEl.textContent = 'Abattage';
        phaseEl.className = 'text-[11px] sm:text-xs font-extrabold text-amber-300';
      } else if (g.phaseLabel) {
        phaseEl.textContent = g.phaseLabel;
        phaseEl.className = g.isHeroTurn
          ? 'text-[11px] sm:text-xs font-extrabold text-emerald-400'
          : 'text-[11px] sm:text-xs font-extrabold text-stone-300';
      } else if (g.phase.startsWith('dealing_')) {
        phaseEl.textContent = 'Distribution...';
        phaseEl.className = 'text-[11px] sm:text-xs font-extrabold text-cyan-300';
      } else if (g.isHeroTurn) {
        phaseEl.textContent = 'À toi de jouer';
        phaseEl.className = 'text-[11px] sm:text-xs font-extrabold text-emerald-400';
      } else {
        const activeBot = g.players[g.currentTurn];
        phaseEl.textContent = activeBot ? `${activeBot.name} réfléchit...` : 'En attente...';
        phaseEl.className = 'text-[11px] sm:text-xs font-extrabold text-stone-300';
      }
    }

    const stackEl = document.getElementById('playerTotalStack');
    if (stackEl) stackEl.textContent = `${hero.stack.toLocaleString('fr-FR')} €`;

    const pseudoEl = document.querySelector('#heroPlayerEncart .player-pseudo');
    if (pseudoEl && hero.name) pseudoEl.textContent = hero.name;

    const avatarEl = document.querySelector('#heroPlayerEncart .player-avatar-box > div');
    if (avatarEl && hero.avatar) avatarEl.textContent = hero.avatar;

    const betEl = document.getElementById('heroCurrentBetDisplay');
    if (betEl) betEl.textContent = `${hero.currentBet.toLocaleString('fr-FR')} €`;

    const dotEl = document.getElementById('heroTurnDot');
    const textEl = document.getElementById('heroTurnText');
    if (dotEl && textEl) {
      if (hero.folded) {
        dotEl.className = 'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500 border-2 border-black';
        textEl.innerHTML = '<span class="text-rose-400">● Couché</span>';
      } else if (g.isHeroTurn) {
        dotEl.className = 'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-400 border-2 border-black animate-pulse';
        textEl.innerHTML = '<span class="text-emerald-400">● À toi de jouer</span>';
      } else {
        dotEl.className = 'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-stone-500 border-2 border-black';
        textEl.innerHTML = '<span class="text-stone-400">⏳ En attente...</span>';
      }
    }

    const encart = document.getElementById('heroPlayerEncart');
    if (encart) {
      if (g.isHeroTurn) {
        encart.style.borderColor = '#fbbf24';
        encart.style.boxShadow = '0 0 24px rgba(251, 191, 36, 0.45)';
      } else {
        encart.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        encart.style.boxShadow = '';
      }
    }

    const foldBtn = document.getElementById('btnActionFold');
    const checkCallBtn = document.getElementById('btnActionCheckCall');
    const raiseBtn = document.getElementById('btnActionRaise');
    const raisePanel = document.getElementById('raiseControlPanel');
    const checkCallMainText = document.getElementById('btnCheckCallMainText');
    const checkCallSubText = document.getElementById('btnCheckCallSubText');
    const raiseSlider = document.getElementById('demoRaiseSlider');
    const raiseDisplay = document.getElementById('demoRaiseDisplay');
    const btnRaiseAmount = document.getElementById('btnRaiseAmount');

    const toCall = g.currentMaxBet - hero.currentBet;

    if (g.isHeroTurn && !hero.folded) {
      [foldBtn, checkCallBtn, raiseBtn, raisePanel].forEach(el => {
        if (el) {
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
        }
      });

      if (toCall <= 0) {
        if (checkCallMainText) checkCallMainText.textContent = 'PAROLE';
        if (checkCallSubText) checkCallSubText.textContent = '0 €';
      } else {
        if (checkCallMainText) checkCallMainText.textContent = 'SUIVRE';
        if (checkCallSubText) checkCallSubText.textContent = `${Math.min(toCall, hero.stack).toLocaleString('fr-FR')} €`;
      }

      const bounds = g.getRaiseBounds();
      const minRaise = bounds.min;
      const maxRaise = bounds.max;

      if (raiseSlider) {
        raiseSlider.min = minRaise;
        raiseSlider.max = maxRaise;
        if (parseInt(raiseSlider.value, 10) < minRaise || parseInt(raiseSlider.value, 10) > maxRaise) {
          raiseSlider.value = minRaise;
        }
        if (raiseDisplay) raiseDisplay.textContent = `${parseInt(raiseSlider.value, 10).toLocaleString('fr-FR')} €`;
        if (btnRaiseAmount) btnRaiseAmount.textContent = `${parseInt(raiseSlider.value, 10).toLocaleString('fr-FR')} €`;
      }

      if (hero.stack <= toCall || maxRaise <= g.currentMaxBet) {
        if (raiseBtn) {
          raiseBtn.style.opacity = '0.35';
          raiseBtn.style.pointerEvents = 'none';
        }
        if (raisePanel) {
          raisePanel.style.opacity = '0.35';
          raisePanel.style.pointerEvents = 'none';
        }
      }
    } else {
      [foldBtn, checkCallBtn, raiseBtn, raisePanel].forEach(el => {
        if (el) {
          el.style.opacity = '0.35';
          el.style.pointerEvents = 'none';
        }
      });
    }
  }

  /* ------------------------------------------------------------------------- */
  /* TEXTURES DE CARTES ULTRA-NETTES AVEC FILTRAGE ANISOTROPE MAXIMUM          */
  /* ------------------------------------------------------------------------- */
  getCardFrontTexture(rank, suit) {
    const key = `card_${rank}_${suit}`;
    if (this.textureCache[key]) return this.textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 512, 720);

    ctx.strokeStyle = '#D1D5DB';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 712);

    const isRed = (suit === '♥' || suit === '♦');
    const color = isRed ? '#DC2626' : '#000000';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '900 84px "Georgia", "Times New Roman", serif';
    ctx.fillText(rank, 62, 72);
    ctx.font = 'bold 58px "Georgia", "Times New Roman", serif';
    ctx.fillText(suit, 62, 142);

    ctx.save();
    ctx.translate(450, 648);
    ctx.rotate(Math.PI);
    ctx.font = '900 84px "Georgia", "Times New Roman", serif';
    ctx.fillText(rank, 0, 0);
    ctx.font = 'bold 58px "Georgia", "Times New Roman", serif';
    ctx.fillText(suit, 0, 70);
    ctx.restore();

    if (['J', 'Q', 'K'].includes(rank)) {
      ctx.strokeStyle = 'rgba(209, 213, 219, 0.8)';
      ctx.lineWidth = 3;
      ctx.strokeRect(100, 140, 312, 440);

      ctx.font = 'bold 180px "Georgia", "Times New Roman", serif';
      ctx.fillText(suit, 256, 360);

      ctx.font = '900 68px "Georgia", "Times New Roman", serif';
      ctx.fillText(rank, 256, 230);
    } else if (rank === 'A') {
      ctx.font = 'bold 220px "Georgia", "Times New Roman", serif';
      ctx.fillText(suit, 256, 360);
    } else {
      ctx.font = 'bold 190px "Georgia", "Times New Roman", serif';
      ctx.fillText(suit, 256, 360);
    }

    const tex = new THREE.CanvasTexture(canvas);

    if (this.renderer && this.renderer.capabilities) {
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    } else {
      tex.anisotropy = 16;
    }
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    this.textureCache[key] = tex;
    return tex;
  }

  getCardBackTexture() {
    if (this.textureCache['card_back']) return this.textureCache['card_back'];

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, 0, 512, 720);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, 492, 700);

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 26, 460, 668);

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
    ctx.lineWidth = 2;
    for (let x = -720; x < 1200; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 720, 720);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, 720);
      ctx.lineTo(x + 720, 0);
      ctx.stroke();
    }

    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.arc(256, 360, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.font = 'bold 75px serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♠', 256, 355);

    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('FLAMBEURS', 256, 415);

    const tex = new THREE.CanvasTexture(canvas);

    if (this.renderer && this.renderer.capabilities) {
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    } else {
      tex.anisotropy = 16;
    }
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    this.textureCache['card_back'] = tex;
    return tex;
  }

  getChipMaterials(baseHex) {
    const key = 'chip_' + baseHex;
    if (this.textureCache[key]) return this.textureCache[key];

    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = 256;
    edgeCanvas.height = 32;
    const eCtx = edgeCanvas.getContext('2d');
    eCtx.fillStyle = baseHex;
    eCtx.fillRect(0, 0, 256, 32);

    eCtx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      eCtx.fillRect(i * 32 + 6, 0, 10, 32);
    }
    const edgeTex = new THREE.CanvasTexture(edgeCanvas);

    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 256;
    faceCanvas.height = 256;
    const fCtx = faceCanvas.getContext('2d');
    fCtx.fillStyle = baseHex;
    fCtx.beginPath();
    fCtx.arc(128, 128, 126, 0, Math.PI * 2);
    fCtx.fill();

    fCtx.strokeStyle = '#ffffff';
    fCtx.lineWidth = 10;
    fCtx.setLineDash([14, 18]);
    fCtx.beginPath();
    fCtx.arc(128, 128, 110, 0, Math.PI * 2);
    fCtx.stroke();

    fCtx.setLineDash([]);
    fCtx.strokeStyle = '#fef08a';
    fCtx.lineWidth = 4;
    fCtx.beginPath();
    fCtx.arc(128, 128, 70, 0, Math.PI * 2);
    fCtx.stroke();

    fCtx.fillStyle = '#0f172a';
    fCtx.beginPath();
    fCtx.arc(128, 128, 64, 0, Math.PI * 2);
    fCtx.fill();

    fCtx.font = 'bold 36px sans-serif';
    fCtx.fillStyle = '#fef08a';
    fCtx.textAlign = 'center';
    fCtx.textBaseline = 'middle';
    fCtx.fillText('♠', 128, 128);

    const faceTex = new THREE.CanvasTexture(faceCanvas);
    const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.35, metalness: 0.2 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, metalness: 0.2 });

    const mats = [edgeMat, faceMat, faceMat];
    this.textureCache[key] = mats;
    return mats;
  }

  generateRealisticFeltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a361e';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 14;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }

  generateFeltBumpMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(256, 256);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 45;
      d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    return tex;
  }

  /* ------------------------------------------------------------------------- */
  /* CAMÉRA MOBILE RESPONSIVE (LARGEUR TOTALE TABLE + NAMEPLATES COUVERTES)    */
  /* ------------------------------------------------------------------------- */
  updateCameraForDevice(width, height) {
    if (!this.camera) return;

    const aspect = width / height;
    this.camera.aspect = aspect;

    this.portraitMode = aspect < 0.85;

    if (this.portraitMode) {
      // Portrait smartphone : caméra presque à la verticale, resserrée sur les cartes
      // (cartes communes + main du joueur). Les plaques des adversaires sont ramenées
      // au-dessus du tapis (voir updateHTMLNameplatesPosition).
      const fov = 50;
      const halfW = 1.5; // demi-largeur visible au niveau du tapis
      const dist = halfW / (aspect * Math.tan((fov / 2) * Math.PI / 180));
      const tilt = 0.3;  // inclinaison depuis la verticale (rad)
      this.camera.fov = fov;
      this.camera.position.set(0, dist * Math.cos(tilt), 0.25 + dist * Math.sin(tilt));
      this.camera.lookAt(0, 0, 0.25);
    } else {
      // PC & Mode Paysage
      this.camera.fov = 46;
      this.camera.position.set(0, 3.2, 3.5);
      this.camera.lookAt(0, 0.25, 0.15);
    }

    this.applyCardLayout(this.portraitMode);
    this.camera.updateProjectionMatrix();
  }

  // Cartes de la table plus grandes en portrait (mises en page distinctes bureau / téléphone)
  applyCardLayout(portrait) {
    const key = portrait ? 'p' : 'd';
    if (this._cardLayout === key) return;
    this._cardLayout = key;
    const boardScale = portrait ? 1.3 : 1;
    const spacing = portrait ? 0.56 : 0.44;
    (this.communityCardMeshes || []).forEach((m, i) => {
      m.scale.setScalar(boardScale);
      m.position.x = (i - 2) * spacing;
    });
    const heroScale = portrait ? 1.3 : 1;
    const heroX = portrait ? 0.4 : 0.22;
    (this.heroCards || []).forEach((m, i) => {
      m.scale.setScalar(heroScale);
      m.position.x = i === 0 ? -heroX : heroX;
    });
  }

  handleResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.updateCameraForDevice(width, height);
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 768 ? 3 : 2));
      this.renderer.setSize(width, height);
    }
    this.updateHTMLNameplatesPosition();
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.handleResize(), { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 150);
    }, { passive: true });
  }

  startRenderLoop() {
    if (this.isRunning) return;
    this.isRunning = true;

    const animate = () => {
      if (!this.isRunning) return;
      this.animationFrameId = requestAnimationFrame(animate);

      const time = performance.now() * 0.001;
      if (this.spotLight) {
        this.spotLight.intensity = 3.8 + Math.sin(time * 1.5) * 0.08;
      }

      this.updateHTMLNameplatesPosition();
      this.renderer.render(this.scene, this.camera);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  pause() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.game) {
      if (this.game.botTimer) {
        clearTimeout(this.game.botTimer);
        this.game.botTimer = null;
      }
      if (this.game.nextHandTimer) {
        clearTimeout(this.game.nextHandTimer);
        this.game.nextHandTimer = null;
      }
      if (this.game.countdownInterval) {
        clearInterval(this.game.countdownInterval);
        this.game.countdownInterval = null;
      }
      if (this.game.phaseTimers && this.game.phaseTimers.length) {
        this.game.phaseTimers.forEach(t => clearTimeout(t));
        this.game.phaseTimers = [];
      }
    }
    console.log('⏸️ [Poker3D] Rendu Three.js et timers bots mis en pause.');
  }

  resume() {
    if (this.game) {
      this.game.updateHeroIdentity();
    }
    this.handleResize();
    this.startRenderLoop();
    if (this.game) {
      // Reprise intelligente de la main si un bot réfléchissait
      if (!this.game.isHeroTurn && this.game.phase !== 'showdown' && this.game.phase !== 'finished') {
        const curPlayer = this.game.players[this.game.currentTurn];
        if (curPlayer && !curPlayer.isHero && !curPlayer.folded && curPlayer.stack > 0) {
          this.game.botTimer = setTimeout(() => {
            this.game.executeBotAI(curPlayer);
          }, 1200);
        }
      }
    }
    console.log('▶️ [Poker3D] Rendu Three.js repris.');
  }

  destroy() {
    this.pause();
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}

// Fonctions d'aide globale pour les modales et formats
function openTableConfigModal() {
  const m = document.getElementById('tableConfigModal');
  if (m) m.classList.remove('hidden');
}
function closeTableConfigModal() {
  const m = document.getElementById('tableConfigModal');
  if (m) m.classList.add('hidden');
}
function openPokerRulesModal() {
  const m = document.getElementById('poker3dRulesModal') || document.getElementById('rulesModal');
  if (m) m.classList.remove('hidden');
}
function closePokerRulesModal() {
  const m = document.getElementById('poker3dRulesModal') || document.getElementById('rulesModal');
  if (m) m.classList.add('hidden');
}

function changeTableFormat(fmt) {
  if (window.pokerGame && window.pokerGame.isMulti) { closeTableConfigModal(); return; }
  if (window.pokerExp) {
    window.pokerExp.setTableFormat(fmt);
  }
  const formats = ['1v1', '4max', '6max'];
  formats.forEach(f => {
    const btn = document.getElementById('btnFormat' + f);
    if (!btn) return;
    if (f === fmt) {
      btn.className = 'py-2.5 px-1.5 rounded-xl border border-amber-400 bg-amber-500/20 font-black text-xs text-amber-300 transition flex flex-col items-center shadow-md';
    } else {
      btn.className = 'py-2.5 px-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-bold text-xs text-stone-300 transition flex flex-col items-center';
    }
  });
  const tag = document.getElementById('headerTableFormatTag');
  if (tag) {
    tag.textContent = fmt === '1v1' ? '1v1 (Duel)' : (fmt === '4max' ? 'Table de 4' : '6-Max');
  }
  closeTableConfigModal();
}

function changeBlindLevel(level) {
  if (window.pokerGame && window.pokerGame.isMulti) { closeTableConfigModal(); return; }
  if (window.pokerGame) {
    window.pokerGame.setBigBlind(level);
  }
  const levels = [100, 500, 1000];
  levels.forEach(lvl => {
    const btn = document.getElementById('btnBlind' + lvl);
    if (!btn) return;
    if (lvl === level) {
      btn.className = 'py-2 px-1 rounded-xl border border-amber-400 bg-amber-500/20 font-black text-xs text-amber-300 transition shadow-md';
    } else {
      btn.className = 'py-2 px-1 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-bold text-xs text-stone-300 transition';
    }
  });
  const tag = document.getElementById('headerBlindTag');
  if (tag) {
    tag.textContent = `${Math.floor(level / 2)}/${level} €`;
  }
  closeTableConfigModal();
}

// Export global
window.Poker3DExperience = Poker3DExperience;
window.TexasHoldemGame = TexasHoldemGame;
window.evaluateBestHand = evaluateBestHand;
window.openTableConfigModal = openTableConfigModal;
window.closeTableConfigModal = closeTableConfigModal;
window.openPokerRulesModal = openPokerRulesModal;
window.closePokerRulesModal = closePokerRulesModal;
window.changeTableFormat = changeTableFormat;
window.changeBlindLevel = changeBlindLevel;
