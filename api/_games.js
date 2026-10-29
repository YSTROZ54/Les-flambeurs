// Logique des jeux et du portefeuille, exécutée côté serveur.
// Le navigateur n'envoie que des demandes (« je mise X », « je retourne la case 4 ») :
// le serveur tire les résultats, calcule les gains et modifie le solde.
import { randomInt, randomBytes } from 'node:crypto';
import { updateAccount, GameError } from './_store.js';
import { createShuffledDeck, calcScore } from './blackjack.js';

export const SLOT_SYMS = ['🔥', '👑', '7️⃣', '💎', '🔔', '🍋', '🍒'];
export const SLOT_PAY_3 = { '🔥': 200, '👑': 100, '7️⃣': 50, '💎': 30, '🔔': 12, '🍋': 5, '🍒': 3 };
export const SLOT_PAY_2 = { '🔥': 2.5, '👑': 2.0, '7️⃣': 1.8, '💎': 1.5, '🔔': 1.1, '🍋': 0.8, '🍒': 0.4 };
export const SLOT_MAX_BET = 100000;
export const SCRATCH_PRICE = 50;
export const MINES_COUNTS = [3, 5, 8, 12];
export const MINES_MIN_BET = 1;
export const CUPS_MIN_BET = 10;
export const CUPS_MAX_BET = 250;
export const CUPS_MULT = 1.25;
export const CUPS_MIN_MS = 3500; // le jeu ne peut pas être terminé avant la fin du mélange
export const CHEST_COOLDOWN_MS = 6 * 3600 * 1000;
export const SHOP_PRICES = {"veh_rocket": 0, "veh_plane": 5000, "veh_car": 5000, "veh_carpet": 10000, "veh_genie": 12000, "veh_duck": 15000, "veh_chicken": 20000, "felt_green": 0, "cards_classic": 0, "cards_black": 5000, "felt_crimson": 8000, "felt_midnight": 12000, "ball_gold": 0, "ball_ruby": 2500, "ball_sapphire": 4000, "ball_emerald": 6000, "ball_neon": 18000, "bj_classic": 0, "bj_black_gold": 5000, "bj_neon_cyber": 9000, "bj_emerald_imp": 14000, "bj_blood_gold": 20000, "cab_classic": 0, "cab_neon": 12000, "cab_emerald": 22000, "cab_gold": 45000, "av_default": 0, "av_chicken": 1500, "av_whisky": 2500, "av_duck": 4000, "av_boss": 6000, "av_fox": 8000, "av_crown": 10000};

const pct = () => randomInt(0, 1000000) / 10000; // 0 <= x < 100
const pick = (arr) => arr[randomInt(0, arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const clampPct = (v, d) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : d));
const intBet = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const srv = (draft) => { if (!draft.data._srv || typeof draft.data._srv !== 'object') draft.data._srv = {}; return draft.data._srv; };

/* ------------------------------ Machine à sous ------------------------------ */
export function spinSlots(bet, chance) {
  const winChance = clampPct(chance, 35);
  const isWin = pct() < winChance;
  let finals;
  if (!isWin) {
    const s = shuffle(SLOT_SYMS);
    finals = [s[0], s[1], s[2]];
  } else {
    const isTriplet = pct() < 4.5;
    const winPool = ['🍒', '🍒', '🍒', '🍋', '🍋', '🍋', '🔔', '🔔', '💎', '7️⃣', '👑', '🔥'];
    const winSym = pick(winPool);
    if (isTriplet) finals = [winSym, winSym, winSym];
    else {
      const third = pick(SLOT_SYMS.filter((s) => s !== winSym));
      finals = [winSym, winSym, winSym];
      finals[randomInt(0, 3)] = third;
    }
  }
  let mult = 0;
  if (finals[0] === finals[1] && finals[1] === finals[2]) mult = SLOT_PAY_3[finals[0]] || 5;
  else if (finals[0] === finals[1] || finals[1] === finals[2] || finals[0] === finals[2]) {
    const pairSym = (finals[0] === finals[1] || finals[0] === finals[2]) ? finals[0] : finals[1];
    mult = SLOT_PAY_2[pairSym] || 0;
  }
  return { finals, mult, win: Math.round(bet * mult) };
}

export function drawScratch(chance) {
  const winChance = clampPct(chance, 35);
  if (!(pct() < winChance)) return 0;
  const roll = pct();
  if (roll < 90.02) return 100;
  if (roll < 97.02) return 200;
  if (roll < 99.02) return 500;
  if (roll < 99.77) return 1000;
  if (roll < 99.97) return 5000;
  return 20000;
}

/* ------------------------- Cartes à gratter du PMU (monde 3D) ------------------------- */
// Le tirage est fait ici, à l'achat, et reste secret : le navigateur ne reçoit que l'identifiant de la carte.
// Gains espérés : 75 % de la mise en moyenne (la maison garde 25 %).
export const PMU_CARD_PRICE = 100;
export const PMU_MAX_CARDS = 4;
export const PMU_HERE_MS = 45000; // il faut avoir signalé sa présence au PMU depuis moins de 45 s pour acheter ou gratter
export const PMU_PRIZES = [[20000, 0.0003], [5000, 0.002], [1000, 0.01], [500, 0.03], [200, 0.08], [100, 0.18]];
export const PMU_CELLS = [100, 200, 500, 1000, 5000, 20000];

export function drawPmu() {
  const r = randomInt(0, 1000000) / 1000000;
  let acc = 0;
  for (const [value, p] of PMU_PRIZES) { acc += p; if (r < acc) return value; }
  return 0;
}

// les 6 cases de la carte : trois montants identiques = gagné ; sinon jamais trois pareils
export function pmuCells(prize) {
  const cells = [];
  if (prize > 0) {
    cells.push(prize, prize, prize);
    shuffle(PMU_CELLS.filter((v) => v !== prize)).slice(0, 3).forEach((v) => cells.push(v));
  } else {
    const count = {};
    while (cells.length < 6) {
      const v = pick(PMU_CELLS);
      if ((count[v] || 0) >= 2) continue;
      count[v] = (count[v] || 0) + 1;
      cells.push(v);
    }
  }
  return shuffle(cells);
}

const pmuState = (d) => { const s = srv(d); if (!s.pmu || typeof s.pmu !== 'object') s.pmu = {}; if (!Array.isArray(s.pmu.cards)) s.pmu.cards = []; return s.pmu; };
const pmuIds = (p) => p.cards.map((c) => c.id);
const pmuHere = (p) => Date.now() - (Number(p.here) || 0) < PMU_HERE_MS;

/* ---------------------------------- Mines ---------------------------------- */
export function minesMult(count, revealedCount) {
  let m = 1;
  for (let i = 0; i < revealedCount; i++) m *= (20 - i) / (20 - count - i);
  return Math.max(1, m * 0.97);
}

function minesPublic(g) {
  return { active: !!g.active, bet: g.bet, count: g.count, revealed: g.revealed, mult: Math.round(minesMult(g.count, g.revealed.length) * 10000) / 10000 };
}


/* -------------------------------- Blackjack solo -------------------------------- */
export const BJ_MIN_BET = 10;
export const BJ_MAX_BET = 50000;
const BJ_BACK = { r: '?', v: 0, s: '♠', color: 'text-slate-900', type: 'suit-black' };
const isTen = (c) => ['10', 'J', 'Q', 'K'].includes(c.r);
const cardPts = (c, ace) => (isTen(c) ? 10 : (c.r === 'A' ? ace : parseInt(c.r, 10)));
const takeCard = (deck, card) => { const i = deck.indexOf(card); if (i !== -1) deck.splice(i, 1); return card; };
const bjLuck = (luck) => Math.max(1, Math.min(99, Number.isFinite(luck.blackjack) ? luck.blackjack : 50));

function bjView(g) {
  return {
    active: !!g.active, bet: g.bet,
    player: g.player,
    dealer: g.active ? g.dealer.map((c, i) => (i === 0 ? c : BJ_BACK)) : g.dealer
  };
}

function bjDeal(g, L) {
  g.deck = createShuffledDeck();
  g.player = []; g.dealer = [];
  if (L > 55 && pct() < ((L - 45) * 1.5)) {
    const ace = g.deck.find((c) => c.r === 'A');
    const ten = g.deck.find(isTen);
    if (ace && ten) { g.player = [takeCard(g.deck, ace), takeCard(g.deck, ten)]; }
  } else if (L < 45 && pct() < ((50 - L) * 1.5)) {
    const tens = g.deck.filter(isTen);
    const weak = g.deck.find((c) => ['5', '6'].includes(c.r));
    if (tens.length >= 2 && weak) {
      const p1 = takeCard(g.deck, tens[0]); const p2 = takeCard(g.deck, weak); const d1 = takeCard(g.deck, tens[1]);
      const strong = g.deck.find((c) => ['8', '9', '10'].includes(c.r));
      const d2 = strong ? takeCard(g.deck, strong) : g.deck.pop();
      g.player = [p1, p2]; g.dealer = [d1, d2];
    }
  }
  if (g.player.length < 2) g.player = [g.deck.pop(), g.deck.pop()];
  if (g.dealer.length < 2) g.dealer = [g.deck.pop(), g.deck.pop()];
}

function bjHitCard(g, L) {
  const cur = calcScore(g.player);
  let drawn = null;
  if (cur >= 12 && cur <= 20) {
    const maxSafe = 21 - cur;
    if (L > 50 && pct() < ((L - 45) * 1.6)) drawn = g.deck.find((c) => cardPts(c, 1) <= maxSafe);
    else if (L < 50 && pct() < ((50 - L) * 1.5)) drawn = g.deck.find((c) => cardPts(c, 11) > maxSafe);
  }
  g.player.push(drawn ? takeCard(g.deck, drawn) : g.deck.pop());
}

// le croupier joue, la manche est soldée
function bjFinish(d, g, L) {
  const p = calcScore(g.player);
  let out;
  if (p > 21) {
    out = { result: 'bust', payout: 0 };
  } else {
    while (calcScore(g.dealer) < 17) {
      if (L > 55 && calcScore(g.dealer) >= 12 && pct() < ((L - 45) * 1.5)) {
        const sc = calcScore(g.dealer);
        const bust = g.deck.find((c) => sc + cardPts(c, 11) > 21);
        if (bust) { g.dealer.push(takeCard(g.deck, bust)); continue; }
      }
      g.dealer.push(g.deck.pop());
    }
    const dl = calcScore(g.dealer);
    if (dl > 21 || p > dl) out = { result: 'win', payout: g.bet * 2 };
    else if (p === dl) out = { result: 'push', payout: g.bet };
    else out = { result: 'lose', payout: 0 };
  }
  g.active = false;
  d.balance += out.payout;
  return { ...out, pScore: p, dScore: calcScore(g.dealer) };
}

/* --------------------------------- Actions --------------------------------- */
// Renvoie { ...données pour le navigateur, balance }.
export async function runGameAction(action, body, ctx) {
  const { actor, luck } = ctx;
  if (!actor) throw new GameError(401, 'Connexion requise.');

  const wrap = async (fn) => {
    const { result, row } = await updateAccount(actor, fn);
    return { ok: true, ...result, balance: row.balance };
  };

  switch (action) {
    case 'slots_spin':
      return wrap((d) => {
        const bet = intBet(body.bet);
        if (bet <= 0) throw new GameError(400, 'Mise invalide.');
        if (bet > SLOT_MAX_BET) throw new GameError(400, 'La mise maximale sur la machine est de 100 000 €.');
        if (bet > d.balance) throw new GameError(400, 'Solde insuffisant pour miser ce montant.', { balance: d.balance });
        const r = spinSlots(bet, luck.slots);
        d.balance = d.balance - bet + r.win;
        return { finals: r.finals, mult: r.mult, win: r.win };
      });

    case 'scratch_buy':
      return wrap((d) => {
        const s = srv(d);
        const prev = s.scratch;
        if (prev && !prev.claimed && prev.win > 0) d.balance += prev.win; // ticket jamais gratté : crédité
        s.scratch = undefined;
        if (d.balance < SCRATCH_PRICE) throw new GameError(400, 'Solde insuffisant ! Un ticket coûte 50 pièces.', { balance: d.balance });
        d.balance -= SCRATCH_PRICE;
        const win = drawScratch(luck.scratch);
        const id = randomBytes(8).toString('hex');
        s.scratch = { id, win, claimed: false };
        return { ticketId: id, win };
      });

    case 'scratch_claim':
      return wrap((d) => {
        const t = srv(d).scratch;
        if (!t || t.id !== body.ticketId) throw new GameError(400, 'Ticket introuvable.', { balance: d.balance });
        if (!t.claimed) { t.claimed = true; d.balance += t.win; }
        return { win: t.win };
      });

    case 'mines_start':
      return wrap((d) => {
        const s = srv(d);
        const bet = intBet(body.bet);
        const count = MINES_COUNTS.includes(Number(body.count)) ? Number(body.count) : 3;
        // une partie laissée ouverte est soldée au gain actuel (équivalent à un retrait)
        const old = s.mines;
        if (old && old.active) d.balance += Math.floor(old.bet * (old.revealed.length ? minesMult(old.count, old.revealed.length) : 1));
        if (bet < MINES_MIN_BET) throw new GameError(400, 'Mise invalide.');
        if (bet > d.balance) throw new GameError(400, 'Mise invalide ou solde insuffisant.', { balance: d.balance });
        d.balance -= bet;
        const bombs = [];
        while (bombs.length < count) { const r = randomInt(0, 20); if (!bombs.includes(r)) bombs.push(r); }
        s.mines = { active: true, bet, count, bombs, revealed: [] };
        return { game: minesPublic(s.mines) };
      });

    case 'mines_pick':
      return wrap((d) => {
        const g = srv(d).mines;
        const idx = Math.floor(Number(body.idx));
        if (!g || !g.active) throw new GameError(400, 'Aucune partie en cours.');
        if (!(idx >= 0 && idx < 20)) throw new GameError(400, 'Case invalide.');
        if (g.revealed.includes(idx)) throw new GameError(400, 'Case déjà retournée.');
        const minesLuck = Math.max(1, Math.min(99, Number.isFinite(luck.mines) ? luck.mines : 50));
        if (g.bombs.includes(idx)) {
          if (minesLuck > 50 && pct() < ((minesLuck - 50) * 1.6)) {
            const free = Array.from({ length: 20 }, (_, k) => k).find((k) => !g.bombs.includes(k) && !g.revealed.includes(k) && k !== idx);
            if (free !== undefined) g.bombs = g.bombs.map((b) => (b === idx ? free : b));
          }
        } else if (minesLuck < 50 && pct() < ((50 - minesLuck) * 1.5)) {
          const bi = g.bombs.findIndex((b) => !g.revealed.includes(b));
          if (bi !== -1) g.bombs[bi] = idx;
        }
        if (g.bombs.includes(idx)) {
          g.active = false;
          return { boom: true, bombs: g.bombs, game: minesPublic(g) };
        }
        g.revealed.push(idx);
        return { boom: false, game: minesPublic(g) };
      });

    case 'mines_cashout':
      return wrap((d) => {
        const g = srv(d).mines;
        if (!g || !g.active) throw new GameError(400, 'Aucune partie en cours.');
        if (!g.revealed.length) throw new GameError(400, 'Retourne au moins une case avant de retirer.');
        const win = Math.floor(g.bet * minesMult(g.count, g.revealed.length));
        g.active = false;
        d.balance += win;
        return { win, bombs: g.bombs, game: minesPublic(g) };
      });

    case 'cups_start':
      return wrap((d) => {
        const s = srv(d);
        const bet = Math.max(CUPS_MIN_BET, Math.min(CUPS_MAX_BET, intBet(body.bet) || 100));
        if (s.cups && s.cups.open) { /* manche abandonnée : la mise est perdue */ }
        if (bet > d.balance) throw new GameError(400, 'Solde insuffisant.', { balance: d.balance });
        d.balance -= bet;
        const ballCup = randomInt(0, 3);
        s.cups = { open: true, bet, ballCup, t0: Date.now() };
        return { ballCup, bet };
      });

    case 'cups_pick':
      return wrap((d) => {
        const g = srv(d).cups;
        if (!g || !g.open) throw new GameError(400, 'Aucune manche en cours.');
        if (Date.now() - g.t0 < CUPS_MIN_MS) throw new GameError(400, 'Le mélange n\'est pas terminé.');
        const cup = Math.floor(Number(body.cup));
        if (!(cup >= 0 && cup < 3)) throw new GameError(400, 'Gobelet invalide.');
        g.open = false;
        const correct = cup === g.ballCup;
        const win = correct ? Math.floor(g.bet * CUPS_MULT) : 0;
        d.balance += win;
        return { correct, win, ballCup: g.ballCup };
      });


    case 'bj_start':
      return wrap((d) => {
        const s = srv(d);
        const bet = intBet(body.bet);
        if (bet < BJ_MIN_BET || bet > BJ_MAX_BET) throw new GameError(400, 'La mise doit être comprise entre 10 € et 50 000 €.');
        if (bet > d.balance) throw new GameError(400, 'Solde insuffisant pour cette mise !', { balance: d.balance });
        d.balance -= bet; // une manche laissée ouverte avant est perdue (mise déjà payée)
        const L = bjLuck(luck);
        const g = { active: true, bet };
        bjDeal(g, L);
        s.bj = g;
        if (calcScore(g.player) === 21) {
          const r = bjFinish(d, g, L);
          return { ...bjView(g), done: true, result: r.result, win: r.payout, pScore: r.pScore, dScore: r.dScore };
        }
        return { ...bjView(g), done: false };
      });

    case 'bj_hit':
      return wrap((d) => {
        const g = srv(d).bj;
        if (!g || !g.active) throw new GameError(400, 'Aucune manche en cours.');
        const L = bjLuck(luck);
        bjHitCard(g, L);
        const sc = calcScore(g.player);
        if (sc >= 21) {
          const r = bjFinish(d, g, L);
          return { ...bjView(g), done: true, result: r.result, win: r.payout, pScore: r.pScore, dScore: r.dScore };
        }
        return { ...bjView(g), done: false };
      });

    case 'bj_stand':
      return wrap((d) => {
        const g = srv(d).bj;
        if (!g || !g.active) throw new GameError(400, 'Aucune manche en cours.');
        const r = bjFinish(d, g, bjLuck(luck));
        return { ...bjView(g), done: true, result: r.result, win: r.payout, pScore: r.pScore, dScore: r.dScore };
      });

    case 'bj_double':
      return wrap((d) => {
        const g = srv(d).bj;
        if (!g || !g.active) throw new GameError(400, 'Aucune manche en cours.');
        if (g.player.length !== 2) throw new GameError(400, 'Tu ne peux doubler qu\'avec tes deux premières cartes.');
        if (d.balance < g.bet) throw new GameError(400, 'Solde insuffisant pour doubler.', { balance: d.balance });
        d.balance -= g.bet; g.bet *= 2;
        g.player.push(g.deck.pop());
        const r = bjFinish(d, g, bjLuck(luck));
        return { ...bjView(g), done: true, result: r.result, win: r.payout, pScore: r.pScore, dScore: r.dScore };
      });

    case 'pmu_cards':
      return wrap((d) => ({ cards: pmuIds(pmuState(d)), price: PMU_CARD_PRICE, max: PMU_MAX_CARDS }));

    case 'pmu_here':
      return wrap((d) => { const p = pmuState(d); p.here = Date.now(); return { cards: pmuIds(p), price: PMU_CARD_PRICE, max: PMU_MAX_CARDS }; });

    case 'pmu_buy':
      return wrap((d) => {
        const p = pmuState(d);
        if (!pmuHere(p)) throw new GameError(400, 'Les cartes à gratter se vendent au PMU.', { cards: pmuIds(p) });
        if (p.cards.length >= PMU_MAX_CARDS) throw new GameError(400, 'Tu as déjà ' + PMU_MAX_CARDS + ' cartes : gratte-en une d\'abord.', { cards: pmuIds(p), balance: d.balance });
        if (d.balance < PMU_CARD_PRICE) throw new GameError(400, 'Solde insuffisant : une carte coûte ' + PMU_CARD_PRICE + ' pièces.', { cards: pmuIds(p), balance: d.balance });
        d.balance -= PMU_CARD_PRICE;
        const card = { id: randomBytes(8).toString('hex'), prize: drawPmu() };
        p.cards.push(card);
        return { card: card.id, cards: pmuIds(p) };
      });

    case 'pmu_scratch':
      return wrap((d) => {
        const p = pmuState(d);
        if (!pmuHere(p)) throw new GameError(400, 'On ne gratte qu\'au PMU.', { cards: pmuIds(p) });
        const i = p.cards.findIndex((c) => c.id === String(body.id || ''));
        if (i < 0) throw new GameError(400, 'Carte introuvable (déjà grattée ?).', { cards: pmuIds(p) });
        const [card] = p.cards.splice(i, 1);   // la carte disparaît et le gain est payé dans la même écriture : impossible de gratter deux fois
        d.balance += card.prize;
        return { id: card.id, prize: card.prize, cells: pmuCells(card.prize), cards: pmuIds(p) };
      });

    case 'wallet_balance':
      return wrap((d) => ({ }));

    case 'chest_claim':
      return wrap((d) => {
        const s = srv(d);
        const now = Date.now();
        let c = s.chest;
        if (!c) c = { last: 0, streak: Math.max(1, Math.min(5, Math.floor(Number(d.data.chestStreak)) || 1)) };
        if (c.last && (now - c.last) / 3600000 > 30) c.streak = 1; // série perdue après 30 h
        const wait = CHEST_COOLDOWN_MS - (now - (c.last || 0));
        if (wait > 0) throw new GameError(400, 'Coffre déjà récupéré.', { waitMs: wait, lastChestTime: c.last, chestStreak: c.streak });
        const reward = (c.streak || 1) >= 5 ? 350 : 250;
        d.balance += reward;
        c = { last: now, streak: (c.streak || 1) + 1 };
        s.chest = c;
        return { reward, lastChestTime: c.last, chestStreak: c.streak };
      });

    case 'shop_buy':
      return wrap((d) => {
        const id = String(body.id || '');
        if (!Object.prototype.hasOwnProperty.call(SHOP_PRICES, id)) throw new GameError(400, 'Article inconnu.');
        const price = SHOP_PRICES[id];
        const owned = Array.isArray(d.data.ownedSkins) ? d.data.ownedSkins : [];
        if (!owned.includes(id)) {
          if (price > d.balance) throw new GameError(400, 'Pas assez de pièces pour acheter cet article !', { balance: d.balance });
          d.balance -= price;
          d.data.ownedSkins = [...owned, id];
        }
        return { id, price };
      });

    default:
      throw new GameError(400, 'Action inconnue.');
  }
}

export const GAME_ACTIONS = ['slots_spin', 'scratch_buy', 'scratch_claim', 'mines_start', 'mines_pick', 'mines_cashout', 'cups_start', 'cups_pick', 'chest_claim', 'shop_buy', 'bj_start', 'bj_hit', 'bj_stand', 'bj_double', 'pmu_cards', 'pmu_here', 'pmu_buy', 'pmu_scratch', 'wallet_balance'];
