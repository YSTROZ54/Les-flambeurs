/**
 * =============================================================================
 * POKER 3D — MODULE THREE.JS & MOTEUR TEXAS HOLD'EM COMPLET
 * Direction Artistique : Casino Underground (Type "Prominence Poker")
 * Ambiance : Scène sombre, lumière dramatique suspendue, feutre texturé,
 *            cartes texturées (face/dos), adversaires 3D, IA et moteur complet.
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
  // Encodage en base 15 garantissant un score entier unique et un classement strict
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
      return { tier: 1, score: high, name: `Hauteur ${RANK_NAMES[high]}` };
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
  // Algorithme de Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/* ------------------------------------------------------------------------- */
/* C. MOTEUR DE JEU TEXAS HOLD'EM (LOGIQUE, TOURS, IA, BLINDS & SHOWDOWN)    */
/* ------------------------------------------------------------------------- */
class TexasHoldemGame {
  constructor(experience) {
    this.exp = experience;
    this.dealerIndex = 0;
    this.smallBlind = 50;
    this.bigBlind = 100;

    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.phase = 'preflop'; // 'preflop', 'flop', 'turn', 'river', 'showdown', 'finished'
    this.currentTurn = 0;
    this.currentMaxBet = 100;
    this.lastRaiseSize = 100;
    this.isHeroTurn = false;
    this.botTimer = null;
    this.nextHandTimer = null;
    this.countdownInterval = null;
    this.actedThisRound = new Set();

    // 6 Sièges : Joueur principal (0) + 5 Bots (1 à 5)
    this.players = [
      { id: 0, name: 'Flambeur (Toi)', avatar: '😎', stack: 25400, isHero: true, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 1, name: 'Viper (Bot)', avatar: '🐍', stack: 6000, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 2, name: 'Le Baron (Bot)', avatar: '🎩', stack: 8500, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 3, name: 'Roxy (Bot)', avatar: '🦊', stack: 5200, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 4, name: 'Montana (Bot)', avatar: '🤠', stack: 7100, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null },
      { id: 5, name: 'Kaiser (Bot)', avatar: '👑', stack: 12000, isHero: false, currentBet: 0, folded: false, allIn: false, hand: [], status: '🟢 Prêt', bestHand: null }
    ];
  }

  /* ------------------------------------------------------------------------- */
  /* NOUVELLE MAIN                                                             */
  /* ------------------------------------------------------------------------- */
  startNewHand() {
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    // Cacher la bannière de fin
    const modal = document.getElementById('winnerBannerModal');
    if (modal) modal.classList.add('hidden');

    // Recharges automatiques des stacks vides
    if (this.players[0].stack <= 0) this.players[0].stack = 10000;
    for (let i = 1; i < this.players.length; i++) {
      if (this.players[i].stack <= 0) this.players[i].stack = 5000;
    }

    // Mélange d'un nouveau paquet
    this.deck = createShuffledDeck();
    this.communityCards = [];
    this.pot = 0;
    this.phase = 'preflop';
    this.actedThisRound.clear();

    // Distribution de 2 cartes à chaque joueur actif
    this.players.forEach(p => {
      p.folded = false;
      p.allIn = false;
      p.currentBet = 0;
      p.status = '🟢 Prêt';
      p.bestHand = null;
      p.hand = [this.deck.pop(), this.deck.pop()];
    });

    // Rotation du bouton Dealer
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;

    // Prélèvement des Blinds
    const sbSeat = this.getNextActiveSeat(this.dealerIndex);
    const bbSeat = this.getNextActiveSeat(sbSeat);

    const sbPlayer = this.players[sbSeat];
    const bbPlayer = this.players[bbSeat];

    const sbAmount = Math.min(this.smallBlind, sbPlayer.stack);
    sbPlayer.stack -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    if (sbPlayer.stack === 0) sbPlayer.allIn = true;

    const bbAmount = Math.min(this.bigBlind, bbPlayer.stack);
    bbPlayer.stack -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    if (bbPlayer.stack === 0) bbPlayer.allIn = true;

    this.pot = sbAmount + bbAmount;
    this.currentMaxBet = Math.max(sbAmount, bbAmount);
    this.lastRaiseSize = this.bigBlind;

    // En Pré-Flop, le premier à parler est le joueur suivant la Big Blind (UTG)
    this.currentTurn = this.getNextActiveSeat(bbSeat);

    this.exp.syncTable3D();
    this.startTurn();
  }

  getNextActiveSeat(fromSeat) {
    let seat = (fromSeat + 1) % this.players.length;
    let attempts = 0;
    while (attempts < this.players.length) {
      const p = this.players[seat];
      if (!p.folded && p.stack > 0) return seat;
      seat = (seat + 1) % this.players.length;
      attempts++;
    }
    return fromSeat;
  }

  getActivePlayers() {
    return this.players.filter(p => !p.folded);
  }

  getPlayersWithChips() {
    return this.players.filter(p => !p.folded && p.stack > 0);
  }

  /* ------------------------------------------------------------------------- */
  /* GESTION DES TOURS ET ENCHAÎNEMENT DES ACTIONS                             */
  /* ------------------------------------------------------------------------- */
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

      // Délai de réflexion réaliste du bot (850ms à 1350ms)
      const thinkDelay = 850 + Math.floor(Math.random() * 500);
      this.botTimer = setTimeout(() => {
        this.executeBotAI(player);
      }, thinkDelay);
    }
  }

  advanceTurn() {
    this.actedThisRound.add(this.currentTurn);

    // Vérifier si un seul joueur reste en lice
    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.finishHandWithSoleWinner(active[0] || this.players[0]);
      return;
    }

    // Vérifier si le tour d'enchères en cours est achevé
    const playersWithChips = this.getPlayersWithChips();
    const allChipsActed = playersWithChips.every(p => this.actedThisRound.has(p.id) && p.currentBet === this.currentMaxBet);

    if (playersWithChips.length <= 1 || allChipsActed) {
      // Passer à la phase suivante
      this.advancePhase();
      return;
    }

    // Joueur suivant
    this.currentTurn = this.getNextActiveSeat(this.currentTurn);
    this.startTurn();
  }

  advancePhase() {
    // Ramasser les mises du tour dans le pot principal
    this.players.forEach(p => { p.currentBet = 0; });
    this.currentMaxBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.actedThisRound.clear();

    const active = this.getActivePlayers();
    if (active.length <= 1) {
      this.finishHandWithSoleWinner(active[0] || this.players[0]);
      return;
    }

    if (this.phase === 'preflop') {
      // Distribuer le Flop (3 cartes)
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.phase = 'flop';
    } else if (this.phase === 'flop') {
      // Distribuer le Turn (4e carte)
      this.communityCards.push(this.deck.pop());
      this.phase = 'turn';
    } else if (this.phase === 'turn') {
      // Distribuer la River (5e carte)
      this.communityCards.push(this.deck.pop());
      this.phase = 'river';
    } else if (this.phase === 'river') {
      // Abattage (Showdown)
      this.phase = 'showdown';
      this.executeShowdown();
      return;
    }

    // Si tous les joueurs (ou tous sauf un) sont à tapis, enchaîner sans enchères
    const canBet = this.getPlayersWithChips();
    if (canBet.length <= 1) {
      this.exp.syncTable3D();
      setTimeout(() => {
        this.advancePhase();
      }, 1000);
      return;
    }

    // Le premier à parler après le flop est le premier joueur actif après le dealer
    this.currentTurn = this.getNextActiveSeat(this.dealerIndex);
    this.startTurn();
  }

  /* ------------------------------------------------------------------------- */
  /* IA DES BOTS : ANALYSE DE MAIN, POT-ODDS ET PRISE DE DÉCISION              */
  /* ------------------------------------------------------------------------- */
  executeBotAI(bot) {
    if (bot.folded || bot.stack <= 0) {
      this.advanceTurn();
      return;
    }

    const toCall = this.currentMaxBet - bot.currentBet;
    const cards = [...bot.hand, ...this.communityCards];
    const evaluated = evaluateBestHand(cards);

    // Calcul de la force relative (0.1 à 1.0)
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
      if (evaluated.tier >= 7) strength = 0.98; // Full, Carré, Quinte Flush
      else if (evaluated.tier >= 5) strength = 0.88; // Quinte, Couleur
      else if (evaluated.tier === 4) strength = 0.80; // Brelan
      else if (evaluated.tier === 3) strength = 0.68; // Double Paire
      else if (evaluated.tier === 2) strength = evaluated.score > 10 ? 0.55 : 0.40; // Paire
      else strength = 0.20; // Hauteur
    }

    // Choix de l'action
    if (toCall <= 0) {
      // Parole (Check) ou Relance
      if (strength >= 0.75 && Math.random() < 0.45) {
        this.processRaise(bot.id, this.currentMaxBet + this.bigBlind * 2);
      } else if (strength >= 0.50 && Math.random() < 0.20) {
        this.processRaise(bot.id, this.currentMaxBet + this.bigBlind);
      } else {
        this.processCheck(bot.id);
      }
    } else {
      // Suivre (Call), Relancer ou Se coucher (Fold)
      const callRatio = toCall / (bot.stack + toCall);

      if (strength >= 0.80) {
        // Main forte : Relance dans 35% des cas, sinon suit
        if (Math.random() < 0.35 && bot.stack > toCall + this.bigBlind) {
          this.processRaise(bot.id, this.currentMaxBet + this.bigBlind * 2);
        } else {
          this.processCall(bot.id, toCall);
        }
      } else if (strength >= 0.50) {
        // Main moyenne : Suit si la mise n'est pas disproportionnée
        if (callRatio <= 0.35 || toCall <= this.bigBlind * 3) {
          this.processCall(bot.id, toCall);
        } else {
          this.processFold(bot.id);
        }
      } else if (strength >= 0.30) {
        // Main faible : Suit seulement les petites mises
        if (toCall <= this.bigBlind) {
          this.processCall(bot.id, toCall);
        } else {
          this.processFold(bot.id);
        }
      } else {
        // Poubelle : Se couche sauf parole gratuite
        if (toCall <= this.bigBlind && Math.random() < 0.25) {
          this.processCall(bot.id, toCall);
        } else {
          this.processFold(bot.id);
        }
      }
    }
  }

  /* ------------------------------------------------------------------------- */
  /* ACTIONS DES JOUEURS & MISE À JOUR DU POT                                  */
  /* ------------------------------------------------------------------------- */
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
    this.pot += amount;
    if (p.stack === 0) p.allIn = true;
    p.status = p.allIn ? '🔥 Tapis' : `🟡 Suit (${p.currentBet} €)`;
    this.advanceTurn();
  }

  processRaise(playerId, targetBet) {
    const p = this.players[playerId];
    const needed = targetBet - p.currentBet;
    const amount = Math.min(needed, p.stack);
    p.stack -= amount;
    p.currentBet += amount;
    this.pot += amount;

    if (p.currentBet > this.currentMaxBet) {
      this.lastRaiseSize = p.currentBet - this.currentMaxBet;
      this.currentMaxBet = p.currentBet;
    }
    if (p.stack === 0) p.allIn = true;
    p.status = p.allIn ? '🔥 Tapis' : `🔵 Relance (${p.currentBet} €)`;

    // Les autres joueurs doivent reparler face à la relance
    this.actedThisRound.clear();
    this.actedThisRound.add(playerId);
    this.advanceTurn();
  }

  processFold(playerId) {
    const p = this.players[playerId];
    p.folded = true;
    p.status = '🔴 Couché';
    this.advanceTurn();
  }

  /* ------------------------------------------------------------------------- */
  /* ABATTAGE (SHOWDOWN) & ATTRIBUTION DU POT                                  */
  /* ------------------------------------------------------------------------- */
  executeShowdown() {
    this.isHeroTurn = false;
    const remaining = this.getActivePlayers();

    remaining.forEach(p => {
      const cards = [...p.hand, ...this.communityCards];
      p.bestHand = evaluateBestHand(cards);
    });

    const maxScore = Math.max(...remaining.map(p => p.bestHand.score));
    const winners = remaining.filter(p => p.bestHand.score === maxScore);

    const share = Math.floor(this.pot / winners.length);
    const remainder = this.pot - (share * winners.length);

    winners.forEach((w, idx) => {
      w.stack += share + (idx === 0 ? remainder : 0);
      w.status = '👑 Vainqueur !';
    });

    this.exp.syncTable3D();

    // Affichage de la bannière de fin de main
    this.showWinnerBanner(winners);
  }

  finishHandWithSoleWinner(soleWinner) {
    this.phase = 'finished';
    this.isHeroTurn = false;
    soleWinner.stack += this.pot;
    soleWinner.status = '👑 Vainqueur !';

    this.exp.syncTable3D();

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
      if (details) details.innerHTML = `<div class="text-stone-300">${soleWinner.name} remporte le pot sans abattage.</div>`;
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
      if (potWon) potWon.textContent = `+ ${this.pot.toLocaleString('fr-FR')} €`;
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

  /* ------------------------------------------------------------------------- */
  /* COMMANDES HERO (BOUTONS HUD)                                              */
  /* ------------------------------------------------------------------------- */
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
    const hero = this.players[0];
    const minRaise = Math.min(hero.stack, this.currentMaxBet + Math.max(this.bigBlind, this.lastRaiseSize));
    let val = minRaise;

    if (type === 'min') val = minRaise;
    else if (type === 'allin') val = hero.stack;
    else if (typeof type === 'number') val = Math.min(hero.stack, Math.max(minRaise, type));

    const slider = document.getElementById('demoRaiseSlider');
    if (slider) slider.value = val;
    this.onSliderInput(val);
  }
}

/* ------------------------------------------------------------------------- */
/* D. CLASSE PRINCIPALE THREE.JS (SCÈNE 3D & SYNCHRONISATION)               */
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
      feltColor: 0x0a3821,     // Vert feutre sombre casino underground
      railColor: 0x121013,     // Cuir noir / bordeaux très sombre
      woodColor: 0x1e1108,     // Bois acajou foncé
      tableWidth: 6.6,         // Longueur de la table ovale
      tableDepth: 3.3,         // Largeur de la table ovale
    }, options);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.spotLight = null;
    this.animationFrameId = null;
    this.tableGroup = null;

    // Cache pour textures de cartes et jetons
    this.textureCache = {};

    // Données fixes des 5 bots
    this.thetas = [
      Math.PI - 0.55,       // Bot 1 : Viper (Gauche bas ~148°)
      -Math.PI + 1.05,      // Bot 2 : Le Baron (Gauche haut ~220°)
      -Math.PI / 2,         // Bot 3 : Roxy (Top centre / En face 270°)
      -1.05,                // Bot 4 : Montana (Droite haut ~320°)
      0.55                  // Bot 5 : Kaiser (Droite bas ~32°)
    ];

    // Références vers les objets 3D interactifs
    this.heroCards = [];
    this.communityCardMeshes = [];
    this.botCards = []; // [ [c1, c2], [c1, c2], ... ]
    this.botNameplates = [];
    this.botChipGroups = [];
    this.heroChipGroup = null;
    this.centerPotGroup = null;

    this.game = null;

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
    this.setupEventListeners();
    this.handleResize();
    this.startRenderLoop();

    // Démarrage du moteur de poker
    this.game = new TexasHoldemGame(this);
    this.game.startNewHand();

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

    // Spot puissant suspendu au-dessus du centre de la table
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

    // A. Forme 2D ovale du tapis
    const ovalShape = new THREE.Shape();
    ovalShape.moveTo(-straightLen / 2, r);
    ovalShape.lineTo(straightLen / 2, r);
    ovalShape.absarc(straightLen / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
    ovalShape.lineTo(-straightLen / 2, -r);
    ovalShape.absarc(-straightLen / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);

    // B. Tapis en Feutre Véritable
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

    // C. Ligne de mise dorée
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

    // D. Piste intérieure en bois verni
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

    // E. Accoudoir en Cuir Noir Rembourré
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

    // F. Pieds de la table
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
    const frontMat = new THREE.MeshBasicMaterial({ map: frontTexture });
    const backMat = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.35, metalness: 0.08 });

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
    cardMesh.material[4] = new THREE.MeshBasicMaterial({ map: frontTexture });
    cardMesh.material[4].needsUpdate = true;
    cardMesh.userData = { rank, suit, isFaceDown: false };
  }

  setCardBack(cardMesh) {
    if (!cardMesh) return;
    const backTexture = this.getCardBackTexture();
    cardMesh.material[4] = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.35, metalness: 0.08 });
    cardMesh.material[4].needsUpdate = true;
    cardMesh.userData = { isFaceDown: true };
  }

  setCardOpacity(cardMesh, opacity) {
    if (!cardMesh) return;
    cardMesh.material.forEach(m => {
      m.transparent = true;
      m.opacity = opacity;
      m.needsUpdate = true;
    });
  }

  /* ------------------------------------------------------------------------- */
  /* CARTES DU JOUEUR PRINCIPAL (REDESCENDUES EN BAS DU TAPIS À Z = Rz*0.62)   */
  /* ------------------------------------------------------------------------- */
  buildHeroCards() {
    const TABLE_Y = 0;
    const Rz = 1.35;
    const heroZ = Rz * 0.62; // ~0.84

    // Carte 1
    const card1 = this.createCardObject('A', '♠', false, 0.75);
    card1.position.set(-0.22, TABLE_Y + 0.015, heroZ);
    card1.rotation.set(-Math.PI / 2, 0, 0.08);
    this.scene.add(card1);

    // Carte 2
    const card2 = this.createCardObject('K', '♠', false, 0.75);
    card2.position.set(0.22, TABLE_Y + 0.016, heroZ);
    card2.rotation.set(-Math.PI / 2, 0, -0.08);
    this.scene.add(card2);

    this.heroCards = [card1, card2];

    // Groupe pour les jetons du joueur en bas à gauche
    this.heroChipGroup = new THREE.Group();
    this.scene.add(this.heroChipGroup);
  }

  /* ------------------------------------------------------------------------- */
  /* CARTES COMMUNES (FLOP, TURN, RIVER) - POSITIONNÉES AU CENTRE Z = 0.05     */
  /* ------------------------------------------------------------------------- */
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

  /* ------------------------------------------------------------------------- */
  /* PLACEMENT RADIAL DES BOTS (CARTES RAYON 0.84, JETONS DEVANT 0.68)         */
  /* ------------------------------------------------------------------------- */
  buildOpponentsSeats() {
    const TABLE_Y = 0;
    const Rx = 2.60;
    const Rz = 1.35;

    this.botCards = [];
    this.botNameplates = [];
    this.botChipGroups = [];

    this.thetas.forEach((theta, i) => {
      // 1. Nameplate
      const npX = Math.cos(theta) * Rx * 1.05;
      const npZ = Math.sin(theta) * Rz * 1.05;
      const sprite = this.create3DNameplate(`Bot ${i + 1}`, 5000, '👤', '🟢 Prêt');
      sprite.position.set(npX, TABLE_Y + 0.05, npZ);
      this.scene.add(sprite);
      this.botNameplates.push(sprite);

      // 2. Les 2 cartes du bot
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

      // 3. Groupe pour les jetons du bot
      const chipGrp = new THREE.Group();
      this.scene.add(chipGrp);
      this.botChipGroups.push(chipGrp);
    });
  }

  /* ------------------------------------------------------------------------- */
  /* JETONS DU POT AU CENTRE (ALIGNÉS HORIZONTALEMENT À Z = -Rz * 0.28)        */
  /* ------------------------------------------------------------------------- */
  buildCenterPotChips() {
    this.centerPotGroup = new THREE.Group();
    this.scene.add(this.centerPotGroup);
  }

  /* ------------------------------------------------------------------------- */
  /* SYNCHRONISATION DYNAMIQUE DES JETONS 3D                                   */
  /* ------------------------------------------------------------------------- */
  syncChips3D(potAmount, players) {
    const chipRadius = 0.08;
    const chipHeight = 0.015;
    const chipGeo = new THREE.CylinderGeometry(chipRadius, chipRadius, chipHeight, 24);
    const Rz = 1.35;
    const potZ = -Rz * 0.28;

    // 1. Vider et recréer les piles du pot central
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

    // 2. Vider et recréer les jetons du joueur Hero
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

    // 3. Vider et recréer les jetons des Bots
    for (let i = 1; i < players.length; i++) {
      const bot = players[i];
      const grp = this.botChipGroups[i - 1];
      if (!grp) continue;
      while (grp.children.length > 0) {
        grp.remove(grp.children[0]);
      }
      if (bot && bot.currentBet > 0) {
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
  /* SYNCHRONISATION GLOBALE 3D & HUD (`syncTable3D`)                          */
  /* ------------------------------------------------------------------------- */
  syncTable3D() {
    const g = this.game;
    if (!g) return;

    // 1. Cartes communes du centre
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

    // 2. Cartes du joueur principal
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
    }

    // 3. Cartes des Bots
    for (let i = 1; i <= 5; i++) {
      const bot = g.players[i];
      const cards = this.botCards[i - 1];
      if (!cards) continue;
      if (bot.folded) {
        this.setCardOpacity(cards[0], 0.20);
        this.setCardOpacity(cards[1], 0.20);
      } else if (g.phase === 'showdown' && bot.hand && bot.hand.length === 2) {
        // Révélation à l'abattage
        this.setCardFace(cards[0], bot.hand[0].rank, bot.hand[0].suit);
        this.setCardFace(cards[1], bot.hand[1].rank, bot.hand[1].suit);
        this.setCardOpacity(cards[0], 1.0);
        this.setCardOpacity(cards[1], 1.0);
      } else {
        // Face cachée
        this.setCardBack(cards[0]);
        this.setCardBack(cards[1]);
        this.setCardOpacity(cards[0], 1.0);
        this.setCardOpacity(cards[1], 1.0);
      }
    }

    // 4. Nameplates 3D des Bots
    for (let i = 1; i <= 5; i++) {
      const bot = g.players[i];
      const isTurn = (g.currentTurn === i && g.phase !== 'showdown' && g.phase !== 'finished');
      this.update3DNameplate(i - 1, bot.name, bot.stack, bot.avatar, bot.status, isTurn);
    }

    // 5. Jetons 3D
    this.syncChips3D(g.pot, g.players);

    // 6. HUD HTML
    this.syncHUD();
  }

  syncHUD() {
    const g = this.game;
    if (!g) return;
    const hero = g.players[0];

    // Pot au centre
    const potEl = document.getElementById('potCenterDisplay');
    if (potEl) potEl.textContent = `${g.pot.toLocaleString('fr-FR')} €`;

    // Statut Tour / Phase
    const phaseEl = document.getElementById('tablePhaseDisplay');
    if (phaseEl) {
      if (g.phase === 'showdown' || g.phase === 'finished') {
        phaseEl.textContent = 'Abattage';
        phaseEl.className = 'text-xs font-extrabold text-amber-300';
      } else if (g.isHeroTurn) {
        phaseEl.textContent = 'À toi de jouer';
        phaseEl.className = 'text-xs font-extrabold text-emerald-400';
      } else {
        const activeBot = g.players[g.currentTurn];
        phaseEl.textContent = activeBot ? `${activeBot.name} réfléchit...` : 'En attente...';
        phaseEl.className = 'text-xs font-extrabold text-stone-300';
      }
    }

    // Encart Hero : Stack et Mise
    const stackEl = document.getElementById('playerTotalStack');
    if (stackEl) stackEl.textContent = `${hero.stack.toLocaleString('fr-FR')} €`;

    const betEl = document.getElementById('heroCurrentBetDisplay');
    if (betEl) betEl.textContent = `${hero.currentBet.toLocaleString('fr-FR')} €`;

    // Encart Hero : Indicateur et texte de tour
    const dotEl = document.getElementById('heroTurnDot');
    const textEl = document.getElementById('heroTurnText');
    if (dotEl && textEl) {
      if (hero.folded) {
        dotEl.className = 'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-black';
        textEl.innerHTML = '<span class="text-rose-400">● Couché</span>';
      } else if (g.isHeroTurn) {
        dotEl.className = 'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-black animate-pulse';
        textEl.innerHTML = '<span class="text-emerald-400">● À toi de jouer</span>';
      } else {
        dotEl.className = 'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-stone-500 border-2 border-black';
        textEl.innerHTML = '<span class="text-stone-400">⏳ En attente...</span>';
      }
    }

    // Surbrillance encart Hero
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

    // Boutons tactiles et contrôles de relance
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

      const minRaise = Math.min(hero.stack, g.currentMaxBet + Math.max(g.bigBlind, g.lastRaiseSize));
      const maxRaise = hero.stack;

      if (raiseSlider) {
        raiseSlider.min = minRaise;
        raiseSlider.max = maxRaise;
        if (parseInt(raiseSlider.value, 10) < minRaise || parseInt(raiseSlider.value, 10) > maxRaise) {
          raiseSlider.value = minRaise;
        }
        if (raiseDisplay) raiseDisplay.textContent = `${parseInt(raiseSlider.value, 10).toLocaleString('fr-FR')} €`;
        if (btnRaiseAmount) btnRaiseAmount.textContent = `${parseInt(raiseSlider.value, 10).toLocaleString('fr-FR')} €`;
      }

      if (hero.stack <= toCall) {
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
  /* CRÉATION & MISE À JOUR DES NAMEPLATES 3D                                  */
  /* ------------------------------------------------------------------------- */
  create3DNameplate(name, stack, avatar = '👤', status = '🟢 Prêt') {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.center.set(0.5, 0.0);
    sprite.scale.set(0.68, 0.17, 1);
    sprite.userData = { canvas, ctx, texture, name, avatar };

    this.drawNameplateCanvas(ctx, name, stack, avatar, status, false);
    texture.needsUpdate = true;
    return sprite;
  }

  update3DNameplate(botIdx, name, stack, avatar, status, isTurn) {
    const sprite = this.botNameplates[botIdx];
    if (!sprite || !sprite.userData || !sprite.userData.ctx) return;
    const { ctx, texture } = sprite.userData;
    ctx.clearRect(0, 0, 384, 96);
    this.drawNameplateCanvas(ctx, name, stack, avatar, status, isTurn);
    texture.needsUpdate = true;
  }

  drawNameplateCanvas(ctx, name, stack, avatar, status, isTurn) {
    if (isTurn) {
      ctx.fillStyle = 'rgba(28, 25, 23, 0.96)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
    } else if (status && status.includes('Couché')) {
      ctx.fillStyle = 'rgba(15, 10, 10, 0.88)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
    } else {
      ctx.fillStyle = 'rgba(10, 10, 16, 0.90)';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
    }

    const r = 16;
    ctx.beginPath();
    ctx.moveTo(6 + r, 6);
    ctx.lineTo(378 - r, 6);
    ctx.arcTo(378, 6, 378, 90, r);
    ctx.lineTo(378, 90 - r);
    ctx.arcTo(378, 90, 6, 90, r);
    ctx.lineTo(6 + r, 90);
    ctx.arcTo(6, 90, 6, 6, r);
    ctx.lineTo(6, 6 + r);
    ctx.arcTo(6, 6, 378, 6, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isTurn ? '#78350f' : '#1e293b';
    ctx.beginPath();
    ctx.arc(42, 48, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isTurn ? '#fbbf24' : '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar, 42, 50);

    ctx.textAlign = 'left';
    ctx.font = 'bold 21px "Georgia", "Times New Roman", serif';
    ctx.fillStyle = isTurn ? '#fef08a' : '#ffffff';
    ctx.fillText(name, 78, 36);

    ctx.font = 'bold 18px "Georgia", "Times New Roman", serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🪙 ${stack.toLocaleString('fr-FR')} €`, 78, 68);

    ctx.font = 'bold 14px "Georgia", sans-serif';
    ctx.textAlign = 'right';
    if (status && status.includes('Couché')) {
      ctx.fillStyle = '#ef4444';
    } else if (isTurn) {
      ctx.fillStyle = '#fbbf24';
    } else if (status && status.includes('Vainqueur')) {
      ctx.fillStyle = '#10b981';
    } else {
      ctx.fillStyle = '#34d399';
    }
    ctx.fillText(status, 368, 36);
  }

  /* ------------------------------------------------------------------------- */
  /* TEXTURES DE CARTES & JETONS                                               */
  /* ------------------------------------------------------------------------- */
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
    this.textureCache['card_back'] = tex;
    return tex;
  }

  getCardFrontTexture(rank, suit) {
    const key = `card_${rank}_${suit}`;
    if (this.textureCache[key]) return this.textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(0, 0, 512, 720);

    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 504, 712);

    const isRed = (suit === '♥' || suit === '♦');
    const color = isRed ? '#d32f2f' : '#111827';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 64px "Georgia", "Times New Roman", serif';
    ctx.fillText(rank, 56, 62);
    ctx.font = '46px "Georgia", "Times New Roman", serif';
    ctx.fillText(suit, 56, 120);

    ctx.save();
    ctx.translate(456, 658);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 64px "Georgia", "Times New Roman", serif';
    ctx.fillText(rank, 0, 0);
    ctx.font = '46px "Georgia", "Times New Roman", serif';
    ctx.fillText(suit, 0, 58);
    ctx.restore();

    if (['J', 'Q', 'K'].includes(rank)) {
      ctx.strokeStyle = 'rgba(204, 204, 204, 0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(108, 148, 296, 424);

      ctx.font = '150px "Georgia", "Times New Roman", serif';
      ctx.fillText(suit, 256, 360);

      ctx.font = 'bold 52px "Georgia", "Times New Roman", serif';
      ctx.fillText(rank, 256, 240);
    } else if (rank === 'A') {
      ctx.font = '185px "Georgia", "Times New Roman", serif';
      ctx.fillText(suit, 256, 360);
    } else {
      ctx.font = '165px "Georgia", "Times New Roman", serif';
      ctx.fillText(suit, 256, 360);
    }

    const tex = new THREE.CanvasTexture(canvas);
    this.textureCache[key] = tex;
    return tex;
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
  /* CAMÉRA, RESPONSIVE & BOUCLE DE RENDU                                      */
  /* ------------------------------------------------------------------------- */
  updateCameraForDevice(width, height) {
    if (!this.camera) return;

    const isPortrait = height > width;
    this.camera.aspect = width / height;

    if (isPortrait) {
      this.camera.fov = 68;
      this.camera.position.set(0, 5.1, 4.6);
      this.camera.lookAt(0, 0.1, 0.2);
    } else {
      this.camera.fov = 46;
      this.camera.position.set(0, 3.2, 3.5);
      this.camera.lookAt(0, 0.25, 0.15);
    }

    this.camera.updateProjectionMatrix();
  }

  handleResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.updateCameraForDevice(width, height);
    if (this.renderer) {
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.handleResize(), { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 150);
    }, { passive: true });
  }

  startRenderLoop() {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      const time = performance.now() * 0.001;
      if (this.spotLight) {
        this.spotLight.intensity = 3.8 + Math.sin(time * 1.5) * 0.08;
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  destroy() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}

// Export global
window.Poker3DExperience = Poker3DExperience;
window.TexasHoldemGame = TexasHoldemGame;
window.evaluateBestHand = evaluateBestHand;
