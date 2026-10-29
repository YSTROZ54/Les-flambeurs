import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../api/_pokerEngine.js';

const mk = () => E.createTable({ id: 't1', name: 'Test', category: '6max', maxSeats: 6, smallBlind: 50, bigBlind: 100, minBuyIn: 1000, maxBuyIn: 20000 }, 1000);
const sit = (t, name, seat) => E.seatPlayer(t, { username: name, avatar: '🙂', buyIn: 1000, secretHash: 'h' + name, seat }, 1000);

test('chaise choisie : le joueur prend exactement la place demandée', () => {
  const t = mk();
  assert.equal(sit(t, 'Alice', 3).player.seat, 3);
  assert.equal(sit(t, 'Bob', 0).player.seat, 0);
  const sum = E.tableSummary(t);
  assert.deepEqual(sum.players.map((p) => [p.username, p.seat]).sort(), [['Alice', 3], ['Bob', 0]]);
});

test('chaise choisie : place prise ou invalide', () => {
  const t = mk();
  sit(t, 'Alice', 2);
  const r = sit(t, 'Bob', 2);
  assert.equal(r.ok, false);
  assert.match(r.error, /prise/);
  assert.equal(sit(t, 'Carl', undefined).player.seat, 0);   // sans choix : première place libre
  assert.equal(sit(t, 'Dina', 99).player.seat, 1);          // hors table : première place libre
});
