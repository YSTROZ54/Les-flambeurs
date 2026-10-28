import test from 'node:test';
import assert from 'node:assert/strict';
process.env.POKER_STORAGE = 'memory';
const { default: handler, __test } = await import('../api/poker.js');

function call(method, { query = {}, body } = {}) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; },
      json(payload) { resolve({ code: this.code, data: payload }); },
      end() { resolve({ code: this.code }); }
    };
    handler({ method, query, body }, res);
  });
}
const get = (q) => call('GET', { query: q });
const post = (b) => call('POST', { body: b });
const dev = (n) => 'device-secret-' + n.repeat(10);

test('lobby : 9 tables publiques, sans fuite de cartes', async () => {
  __test.reset();
  const r = await get({});
  assert.equal(r.code, 200);
  assert.equal(r.data.v, 2);
  assert.equal(r.data.tables.length, 9);
  assert.ok(r.data.tables.every((t) => t.minBuyIn > 0 && t.maxSeats >= 2));
});

test('rejoindre, jouer, partir : les jetons reviennent', async () => {
  __test.reset();
  const T = 'poker_1v1_1';
  let r = await post({ action: 'join', tableId: T, username: 'Alice', avatar: '🦊', device: dev('a'), buyIn: 5000 });
  assert.ok(r.data.ok, r.data.error);
  assert.equal(r.data.table.seats.filter(Boolean).length, 1);
  // mauvaise mise de départ
  r = await post({ action: 'join', tableId: T, username: 'Bob', device: dev('b'), buyIn: 10 });
  assert.equal(r.data.ok, false);
  r = await post({ action: 'join', tableId: T, username: 'Bob', device: dev('b'), buyIn: 5000 });
  assert.ok(r.data.ok);
  // un tiers ne peut ni agir à la place d'Alice ni voir ses cartes
  r = await post({ action: 'ready', tableId: T, username: 'Alice', device: dev('x') });
  assert.equal(r.data.ok, false);
  await post({ action: 'ready', tableId: T, username: 'Alice', device: dev('a') });
  r = await post({ action: 'ready', tableId: T, username: 'Bob', device: dev('b') });
  assert.equal(r.data.table.status, 'countdown');
  // avance le temps : on triche sur l'horloge de la table
  const t = __test.store.tables[T];
  t.countdownEndsAt = Date.now() - 1;
  r = await get({ table: T, user: 'Alice', device: dev('a') });
  assert.equal(r.data.table.status, 'playing');
  const mine = r.data.table.seats.find((s) => s && s.key === 'alice');
  const theirs = r.data.table.seats.find((s) => s && s.key === 'bob');
  assert.ok(mine.cards[0].rank);
  assert.ok(theirs.cards[0].hidden);
  const spy = await get({ table: T, user: 'Alice', device: dev('z') });
  assert.ok(spy.data.table.seats.find((s) => s && s.key === 'alice').cards[0].hidden);
  assert.equal(JSON.stringify(r.data).includes('"deck"'), false);

  // quelqu'un se couche, l'autre part : tout l'argent est récupéré
  const turn = r.data.table.turn;
  const who = turn === 'alice' ? ['Alice', 'a'] : ['Bob', 'b'];
  r = await post({ action: 'fold', tableId: T, username: who[0], device: dev(who[1]) });
  assert.ok(r.data.ok, r.data.error);
  assert.equal(r.data.table.status, 'showdown');
  const a = await post({ action: 'leave', tableId: T, username: 'Alice', device: dev('a') });
  const b = await post({ action: 'leave', tableId: T, username: 'Bob', device: dev('b') });
  assert.equal(a.data.cashout + b.data.cashout, 10000);
});

test('départ par balise (réponse perdue) : récupération via claim', async () => {
  __test.reset();
  const T = 'poker_4max_1';
  await post({ action: 'join', tableId: T, username: 'Zed', device: dev('z'), buyIn: 3000 });
  // l'état disparaît côté client mais le serveur garde l'argent en attente
  const store = __test.store;
  store.tables[T].players.zed.lastSeen = Date.now() - 120000; // déconnecté
  await get({ table: T, user: 'Zed', device: dev('q') }); // quelqu'un d'autre fait avancer le croupier
  const pending = await get({ user: 'Zed', device: dev('z') });
  assert.equal(pending.data.pendingCashout, 3000);
  const stolen = await post({ action: 'claim', username: 'Zed', device: dev('y') });
  assert.equal(stolen.data.cashout || 0, 0);
  const ok = await post({ action: 'claim', username: 'Zed', device: dev('z') });
  assert.equal(ok.data.cashout, 3000);
  const again = await post({ action: 'claim', username: 'Zed', device: dev('z') });
  assert.equal(again.data.cashout || 0, 0);
});

test('salons : mêmes blindes et même mise partout, plus de salon privé', async () => {
  __test.reset();
  const r = await get({});
  assert.ok(r.data.tables.every((t) => t.bigBlind === 100 && t.minBuyIn === 1000 && t.maxBuyIn === 20000));
  assert.deepEqual(r.data.tables.filter((t) => t.category === '1v1').map((t) => t.name), ['Salon 1', 'Salon 2', 'Salon 3']);
  let j = await post({ action: 'join', tableId: 'priv_ab12cd', username: 'A', device: dev('a'), buyIn: 1000, create: true, maxSeats: 3, bigBlind: 100 });
  assert.equal(j.data.ok, false);
  j = await post({ action: 'join', tableId: '../etc/passwd', username: 'B', device: dev('b'), buyIn: 1000 });
  assert.equal(j.data.ok, false);
});

test('un seul siège par joueur : déplacement entre tables', async () => {
  __test.reset();
  await post({ action: 'join', tableId: 'poker_1v1_1', username: 'M', device: dev('m'), buyIn: 2000 });
  const r = await post({ action: 'join', tableId: 'poker_4max_1', username: 'M', device: dev('m'), buyIn: 2000 });
  assert.ok(r.data.ok, r.data.error);
  assert.equal(Object.keys(__test.store.tables.poker_1v1_1.players).length, 0);
  const claim = await post({ action: 'claim', username: 'M', device: dev('m') });
  assert.equal(claim.data.cashout, 2000);
});

test('actions invalides : message d\'erreur clair', async () => {
  __test.reset();
  const T = 'poker_1v1_2'; // gros blinde 100
  await post({ action: 'join', tableId: T, username: 'A', device: dev('a'), buyIn: 10000 });
  await post({ action: 'join', tableId: T, username: 'B', device: dev('b'), buyIn: 10000 });
  await post({ action: 'ready', tableId: T, username: 'A', device: dev('a') });
  await post({ action: 'ready', tableId: T, username: 'B', device: dev('b') });
  __test.store.tables[T].countdownEndsAt = Date.now() - 1;
  const g = await get({ table: T, user: 'A', device: dev('a') });
  const turn = g.data.table.turn;
  const other = turn === 'a' ? ['B', 'b'] : ['A', 'a'];
  const mover = turn === 'a' ? ['A', 'a'] : ['B', 'b'];
  let r = await post({ action: 'fold', tableId: T, username: other[0], device: dev(other[1]) });
  assert.equal(r.data.ok, false);
  assert.match(r.data.error, /tour/);
  r = await post({ action: 'check', tableId: T, username: mover[0], device: dev(mover[1]) });
  assert.equal(r.data.ok, false); // il reste 50 € à suivre
  r = await post({ action: 'raise', tableId: T, username: mover[0], device: dev(mover[1]), amount: 150 });
  assert.equal(r.data.ok, false);
  r = await post({ action: 'raise', tableId: T, username: mover[0], device: dev(mover[1]), amount: 400 });
  assert.ok(r.data.ok, r.data.error);
});

test('départ par balise : l\'argent reste en attente jusqu\'au claim', async () => {
  __test.reset();
  const T = 'poker_1v1_1';
  await post({ action: 'join', tableId: T, username: 'Bea', device: dev('e'), buyIn: 3000 });
  const r = await post({ action: 'leave', tableId: T, username: 'Bea', device: dev('e'), beacon: true });
  assert.equal(r.data.cashout || 0, 0);
  const c = await post({ action: 'claim', username: 'Bea', device: dev('e') });
  assert.equal(c.data.cashout, 3000);
});
