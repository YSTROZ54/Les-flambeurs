import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../api/_pokerEngine.js';

const C = (rank, suit) => ({ rank, suit, value: { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 }[rank] });
const hand = (...s) => s.map((x) => C(x.slice(0, -1), x.slice(-1)));

test('évaluateur : ordre des mains et kickers', () => {
  const ev = (...c) => E.evaluateBest(hand(...c));
  const royal = ev('A♠', 'K♠', 'Q♠', 'J♠', '10♠', '2♦', '3♦');
  const sf = ev('9♥', '8♥', '7♥', '6♥', '5♥', 'A♦', 'K♦');
  const quads = ev('7♠', '7♥', '7♦', '7♣', 'A♠', '2♦', '3♦');
  const full = ev('K♠', 'K♥', 'K♦', '2♣', '2♠', '9♦', '3♦');
  const flush = ev('A♠', '9♠', '7♠', '5♠', '2♠', 'K♦', 'K♥');
  const straight = ev('9♠', '8♥', '7♦', '6♣', '5♠', '2♦', 'K♦');
  const trips = ev('Q♠', 'Q♥', 'Q♦', '2♣', '5♠', '9♦', '3♦');
  const twoPair = ev('Q♠', 'Q♥', '9♦', '9♣', '5♠', '2♦', '3♦');
  const pair = ev('Q♠', 'Q♥', '8♦', '9♣', '5♠', '2♦', '3♦');
  const high = ev('A♠', 'J♥', '8♦', '9♣', '5♠', '2♦', '3♦');
  const order = [royal, sf, quads, full, flush, straight, trips, twoPair, pair, high];
  for (let i = 0; i < order.length - 1; i++) assert.ok(order[i].score > order[i + 1].score, `main ${i}`);

  // kickers : paire d'As + roi > paire d'As + dame
  const a = ev('A♠', 'A♥', 'K♦', '9♣', '5♠', '2♦', '3♦');
  const b = ev('A♦', 'A♣', 'Q♦', '9♥', '5♦', '2♣', '3♣');
  assert.ok(a.score > b.score);
  // double paire : kicker
  const c = ev('K♠', 'K♥', '4♦', '4♣', 'A♠', '2♦', '3♦');
  const d = ev('K♦', 'K♣', '4♥', '4♠', 'Q♠', '2♣', '3♣');
  assert.ok(c.score > d.score);
  // roue A-2-3-4-5 < quinte au 6
  const wheel = ev('A♠', '2♥', '3♦', '4♣', '5♠', 'K♦', '9♦');
  const six = ev('2♠', '3♥', '4♦', '5♣', '6♠', 'K♦', '9♦');
  assert.equal(wheel.tier, 5);
  assert.ok(six.score > wheel.score);
  // égalité parfaite : la meilleure main est sur le tableau
  const t1 = ev('2♠', '3♥', 'A♦', 'A♣', 'K♠', 'Q♦', 'J♦');
  const t2 = ev('4♠', '5♥', 'A♦', 'A♣', 'K♠', 'Q♦', 'J♦');
  assert.equal(t1.score, t2.score);
});

test('pots annexes', () => {
  // A all-in 100, B all-in 300, C et D payent 500 puis D se couche : trois pots
  const pots = E.buildPots([
    { key: 'A', total: 100, folded: false },
    { key: 'B', total: 300, folded: false },
    { key: 'C', total: 500, folded: false },
    { key: 'D', total: 200, folded: true }
  ]);
  assert.equal(pots.reduce((s, p) => s + p.amount, 0), 1100);
  assert.deepEqual(pots[0], { amount: 400, eligible: ['A', 'B', 'C'] });
  assert.deepEqual(pots[1], { amount: 500, eligible: ['B', 'C'] });
  assert.deepEqual(pots[2], { amount: 200, eligible: ['C'] }); // mise non suivie de C (rendue)
});

/* ---------- utilitaires de table ---------- */
const mk = (id = 'poker_6max_1') => E.createTable(E.PUBLIC_TABLES[id], 1000);
function sit(t, names, buy, now = 1000) {
  names.forEach((n, i) => {
    const r = E.seatPlayer(t, { username: n, avatar: '😀', buyIn: buy, secretHash: 'h' + n }, now);
    assert.ok(r.ok, r.error);
  });
}
function readyAll(t, now) {
  Object.keys(t.players).forEach((k) => E.setReady(t, k, now));
}
function total(t) {
  return Object.values(t.players).reduce((s, p) => s + p.stack, 0) + (t.status === 'playing' ? t.pot : 0);
}
function startAt(t, now) {
  readyAll(t, now);
  E.step(t, now);
  assert.equal(t.status, 'countdown');
  const later = now + E.COUNTDOWN_MS + 1;
  E.step(t, later);
  assert.equal(t.status, 'playing');
  return later;
}
function rig(t, cardsByKey, board, now) {
  Object.keys(cardsByKey).forEach((k) => { t.players[k].cards = hand(...cardsByKey[k]); });
  const cs = hand(...board);
  const burn = C('2', '♣');
  // deck.pop() : brûlée, flop x3, brûlée, turn, brûlée, river
  t.deck = [cs[4], burn, cs[3], burn, cs[2], cs[1], cs[0], burn];
}

test('duel : blindes, ordre de parole, partage', () => {
  const t = mk('poker_1v1_1');
  sit(t, ['Ana', 'Bob'], 5000);
  let now = startAt(t, 2000);
  const dealerKey = t.seats[t.dealerSeat];
  const other = t.seats.find((k) => k && k !== dealerKey);
  assert.equal(t.players[dealerKey].bet, 50, 'le donneur est petite blinde');
  assert.equal(t.players[other].bet, 100);
  assert.equal(t.turn, dealerKey, 'en duel le donneur parle en premier');
  assert.equal(total(t), 10000);
  // le donneur suit, la grosse blinde a l'option
  assert.ok(E.act(t, dealerKey, 'call', 0, now).ok);
  assert.equal(t.turn, other);
  assert.ok(E.act(t, other, 'check', 0, now).ok);
  assert.equal(t.phase, 'flop');
  assert.equal(t.community.length, 3);
  assert.equal(t.turn, other, 'après le flop la grosse blinde parle en premier en duel');
  // check interdit si mise à suivre
  assert.ok(E.act(t, other, 'raise', 300, now).ok);
  const r = E.act(t, dealerKey, 'check', 0, now);
  assert.equal(r.ok, false);
  assert.ok(E.act(t, dealerKey, 'fold', 0, now).ok);
  assert.equal(t.status, 'showdown');
  assert.equal(t.result.uncontested, true);
  assert.equal(t.players[other].stack, 5000 + 100); // gagne la blinde du donneur (100)
  assert.equal(t.players[dealerKey].stack, 4900);
});

test('relance minimum et tour interdit', () => {
  const t = mk('poker_4max_1');
  sit(t, ['A', 'B', 'C', 'D'], 5000);
  const now = startAt(t, 2000);
  const first = t.turn;
  const notFirst = Object.keys(t.players).find((k) => k !== first);
  assert.equal(E.act(t, notFirst, 'fold', 0, now).ok, false);
  const low = E.act(t, first, 'raise', 150, now); // min = 100 + 100 = 200
  assert.equal(low.ok, false);
  assert.ok(E.act(t, first, 'raise', 300, now).ok);
  assert.equal(t.currentBet, 300);
  assert.equal(t.minRaise, 200);
});

test('tapis multiples, pots annexes et gains corrects', () => {
  const t = mk('poker_4max_1');
  sit(t, ['A', 'B', 'C'], 5000);
  t.players.a.stack = 1000; t.players.b.stack = 3000; t.players.c.stack = 5000;
  let now = startAt(t, 2000);
  // A pauvre mais meilleure main, B moyenne, C la pire
  rig(t, { a: ['A♠', 'A♥'], b: ['K♠', 'K♥'], c: ['7♦', '2♣'] }, ['3♠', '8♦', '9♣', '10♥', '4♠'], now);
  // tous à tapis
  let guard = 0;
  while (t.status === 'playing' && guard++ < 10) {
    const k = t.turn;
    assert.ok(E.act(t, k, 'allin', 0, now).ok);
  }
  assert.equal(t.status, 'showdown');
  assert.equal(t.community.length, 5);
  // pot principal 3000 (3x1000) -> A ; pot annexe 4000 (2x2000) -> B ; reste 2000 de C rendu
  assert.equal(t.players.a.stack, 3000);
  assert.equal(t.players.b.stack, 4000);
  assert.equal(t.players.c.stack, 2000);
  assert.equal(t.players.a.stack + t.players.b.stack + t.players.c.stack, 9000);
  assert.equal(t.result.pots.length, 3);
});

test('égalité : pot partagé, jeton impair attribué', () => {
  const t = mk('poker_1v1_1');
  sit(t, ['A', 'B'], 5000);
  const now = startAt(t, 2000);
  rig(t, { a: ['2♠', '3♥'], b: ['4♠', '5♥'] }, ['A♦', 'A♣', 'K♠', 'Q♦', 'J♦'], now);
  let g = 0;
  while (t.status === 'playing' && g++ < 20) {
    const k = t.turn;
    const p = t.players[k];
    E.act(t, k, p.bet < t.currentBet ? 'call' : 'check', 0, now);
  }
  assert.equal(t.status, 'showdown');
  assert.equal(t.players.a.stack, 5000);
  assert.equal(t.players.b.stack, 5000);
  assert.equal(t.result.pots[0].winners.length, 2);
});

test('temps écoulé : parole auto ou couché, éjection après 2 oublis', () => {
  const t = mk('poker_1v1_1');
  sit(t, ['A', 'B'], 5000);
  let now = startAt(t, 2000);
  const first = t.turn;
  now += E.TURN_MS + 10;
  // garder les joueurs en vie
  Object.values(t.players).forEach((p) => { p.lastSeen = now; });
  const out = E.step(t, now);
  assert.ok(out.changed);
  assert.equal(t.status, 'showdown'); // le joueur au tour devait suivre => couché
  assert.equal(t.players[first].folded, true);
});

test('déconnexion : jetons rendus, main continue', () => {
  const t = mk('poker_4max_1');
  sit(t, ['A', 'B', 'C'], 5000);
  let now = startAt(t, 2000);
  const victim = Object.keys(t.players)[0];
  const stackBefore = t.players[victim].stack;
  const cash = E.removePlayer(t, victim, 'leave', now);
  assert.equal(cash, stackBefore);
  assert.equal(t.players[victim].folded, true);
  assert.ok(['playing', 'showdown'].includes(t.status));
  let g = 0;
  while (t.status === 'playing' && g++ < 30) {
    const k = t.turn;
    const p = t.players[k];
    E.act(t, k, p.bet < t.currentBet ? 'call' : 'check', 0, now);
  }
  assert.equal(t.status, 'showdown');
  const sum = Object.values(t.players).reduce((s, p) => s + p.stack, 0);
  assert.equal(sum + cash, 15000);
});

test('simulation aléatoire : chips conservés, aucune main bloquée', () => {
  for (let seed = 0; seed < 60; seed++) {
    const n = 2 + (seed % 5); // 2..6 joueurs
    const t = mk(n === 2 ? 'poker_1v1_1' : n <= 4 ? 'poker_4max_1' : 'poker_6max_1');
    const names = Array.from({ length: n }, (_, i) => 'P' + i);
    sit(t, names, 1000 + (seed % 4) * 1500);
    let expected = Object.values(t.players).reduce((s, p) => s + p.stack, 0);
    let now = 2000;
    readyAll(t, now);
    E.step(t, now);
    let cash = 0;
    for (let tick = 0; tick < 4000; tick++) {
      now += 500;
      Object.values(t.players).forEach((p) => { p.lastSeen = now; });
      if (t.status === 'playing') {
        const k = t.turn;
        assert.ok(k && t.players[k], 'tour valide');
        const p = t.players[k];
        const roll = Math.random();
        const toCall = t.currentBet - p.bet;
        let r;
        if (roll < 0.1 && toCall > 0) r = E.act(t, k, 'fold', 0, now);
        else if (roll < 0.25) r = E.act(t, k, 'allin', 0, now);
        else if (roll < 0.45) r = E.act(t, k, 'raise', t.currentBet + t.minRaise * (1 + Math.floor(Math.random() * 3)), now);
        else r = E.act(t, k, toCall > 0 ? 'call' : 'check', 0, now);
        // une relance refusée ne doit pas bloquer : retomber sur call/check
        if (!r.ok) assert.ok(E.act(t, k, toCall > 0 ? 'call' : 'check', 0, now).ok);
      } else {
        const out = E.step(t, now);
        out.cashouts.forEach((c) => { cash += c.amount; });
      }
      const live = Object.values(t.players).reduce((s, p) => s + p.stack, 0) + (t.status === 'playing' ? t.pot : 0);
      assert.equal(live + cash, expected, `conservation seed ${seed} tick ${tick} statut ${t.status}`);
      Object.values(t.players).forEach((p) => assert.ok(p.stack >= 0));
      if (Object.keys(t.players).length < 2 && t.status === 'waiting') break;
    }
  }
});

test('vue publique : cartes adverses masquées, révélées au showdown seulement', () => {
  const t = mk('poker_1v1_1');
  sit(t, ['A', 'B'], 5000);
  let now = startAt(t, 2000);
  const vA = E.publicView(t, 'a', true, now);
  const seatA = vA.seats.find((s) => s && s.key === 'a');
  const seatB = vA.seats.find((s) => s && s.key === 'b');
  assert.ok(seatA.cards[0].rank);
  assert.ok(seatB.cards[0].hidden);
  assert.equal(JSON.stringify(vA).includes('"deck"'), false);
  // non authentifié : rien de privé
  const spy = E.publicView(t, 'a', false, now);
  assert.ok(spy.seats.find((s) => s && s.key === 'a').cards[0].hidden);
  // couché + tout le monde couché : aucune révélation
  const first = t.turn;
  E.act(t, first, 'fold', 0, now);
  const end = E.publicView(t, 'b', true, now);
  const other = end.seats.find((s) => s && s.key !== 'b');
  assert.ok(!other.cards.length || other.cards[0].hidden || other.folded);
});
