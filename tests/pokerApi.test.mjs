import test from 'node:test';
import assert from 'node:assert/strict';
process.env.POKER_STORAGE = 'memory';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: handler, __test } = await import('../api/poker.js');
const { default: accounts, __test: acc } = await import('../api/accounts.js');

function callH(h, method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { resolve({ code: this.code, data: payload }); }, end() { resolve({ code: this.code }); } };
    h({ method, query, body, headers }, res);
  });
}
const tokens = {};
async function user(name, balance = 50000) {
  const key = name.toLowerCase();
  if (!tokens[key]) {
    const r = await callH(accounts, 'POST', { body: { action: 'register', username: name, password: 'secret1' } });
    assert.equal(r.code, 200, JSON.stringify(r.data));
    tokens[key] = r.data.token;
  }
  acc.memory.rows[key].balance = balance;
  return tokens[key];
}
const hdr = (name) => (tokens[String(name).toLowerCase()] ? { 'x-auth-token': tokens[String(name).toLowerCase()] } : {});
const get = (q, as) => callH(handler, 'GET', { query: q, headers: as ? hdr(as) : {} });
const post = (b, as) => callH(handler, 'POST', { body: b, headers: hdr(as || b.username) });
const bal = (n) => acc.memory.rows[n.toLowerCase()].balance;

test('lobby : 9 tables publiques, sans fuite de cartes', async () => {
  __test.reset();
  const r = await get({});
  assert.equal(r.code, 200);
  assert.equal(r.data.v, 2);
  assert.equal(r.data.tables.length, 9);
  assert.ok(r.data.tables.every((t) => t.minBuyIn > 0 && t.maxSeats >= 2));
});

test('connexion obligatoire, identité prise du jeton (impossible d\'agir au nom d\'un autre)', async () => {
  __test.reset();
  await user('Alice'); await user('Mallory');
  const T = 'poker_1v1_1';
  let r = await callH(handler, 'POST', { body: { action: 'join', tableId: T, username: 'Alice', buyIn: 5000 } });
  assert.equal(r.data.ok, false);
  assert.equal(bal('alice'), 50000);
  // Mallory prétend être Alice : elle s'assoit sous SON nom et paie avec SON argent
  r = await post({ action: 'join', tableId: T, username: 'Alice', buyIn: 5000 }, 'Mallory');
  assert.ok(r.data.ok, r.data.error);
  assert.equal(bal('alice'), 50000);
  assert.equal(bal('mallory'), 45000);
  assert.ok(__test.store.tables[T].players.mallory);
  assert.equal(__test.store.tables[T].players.alice, undefined);
});

test('rejoindre, jouer, partir : la mise est prélevée puis rendue par le serveur', async () => {
  __test.reset();
  await user('Alice'); await user('Bob');
  const T = 'poker_1v1_1';
  let r = await post({ action: 'join', tableId: T, username: 'Alice', avatar: '🦊', buyIn: 5000 });
  assert.ok(r.data.ok, r.data.error);
  assert.equal(bal('alice'), 45000);
  assert.equal(r.data.balance, 45000);
  r = await post({ action: 'join', tableId: T, username: 'Bob', buyIn: 10 });
  assert.equal(r.data.ok, false);
  assert.equal(bal('bob'), 50000);
  r = await post({ action: 'join', tableId: T, username: 'Bob', buyIn: 5000 });
  assert.ok(r.data.ok);
  // se rasseoir ne repaie pas
  r = await post({ action: 'join', tableId: T, username: 'Bob', buyIn: 5000 });
  assert.ok(r.data.ok);
  assert.equal(bal('bob'), 45000);
  await post({ action: 'ready', tableId: T, username: 'Alice' });
  r = await post({ action: 'ready', tableId: T, username: 'Bob' });
  assert.equal(r.data.table.status, 'countdown');
  __test.store.tables[T].countdownEndsAt = Date.now() - 1;
  r = await get({ table: T, user: 'Alice' }, 'Alice');
  assert.equal(r.data.table.status, 'playing');
  const mine = r.data.table.seats.find((s) => s && s.key === 'alice');
  const theirs = r.data.table.seats.find((s) => s && s.key === 'bob');
  assert.ok(mine.cards[0].rank);
  assert.ok(theirs.cards[0].hidden);
  const spy = await get({ table: T, user: 'Alice' }, 'Mallory');
  assert.ok(spy.data.table.seats.find((s) => s && s.key === 'alice').cards[0].hidden);
  assert.equal(JSON.stringify(r.data).includes('"deck"'), false);
  const turn = r.data.table.turn;
  const who = turn === 'alice' ? 'Alice' : 'Bob';
  r = await post({ action: 'fold', tableId: T, username: who });
  assert.ok(r.data.ok, r.data.error);
  assert.equal(r.data.table.status, 'showdown');
  const a = await post({ action: 'leave', tableId: T, username: 'Alice' });
  const b = await post({ action: 'leave', tableId: T, username: 'Bob' });
  assert.equal(a.data.cashout + b.data.cashout, 10000);
  assert.equal(bal('alice') + bal('bob'), 100000);   // aucun jeton créé ni perdu
  // rien à réclamer deux fois
  const again = await post({ action: 'claim', username: 'Alice' });
  assert.equal(again.data.cashout || 0, 0);
  assert.equal(bal('alice') + bal('bob'), 100000);
});

test('solde insuffisant : on ne s\'assoit pas', async () => {
  __test.reset();
  await user('Pauvre', 1500);
  const r = await post({ action: 'join', tableId: 'poker_1v1_1', username: 'Pauvre', buyIn: 5000 });
  assert.equal(r.data.ok, false);
  assert.equal(bal('pauvre'), 1500);
  assert.equal(__test.store.tables.poker_1v1_1.players.pauvre, undefined);
});

test('départ par balise ou déconnexion : le serveur rend les jetons tout seul', async () => {
  __test.reset();
  await user('Bea'); await user('Zed'); await user('Quentin');
  await post({ action: 'join', tableId: 'poker_1v1_1', username: 'Bea', buyIn: 3000 });
  assert.equal(bal('bea'), 47000);
  await post({ action: 'leave', tableId: 'poker_1v1_1', username: 'Bea', beacon: true });
  assert.equal(bal('bea'), 50000);
  const T = 'poker_4max_1';
  await post({ action: 'join', tableId: T, username: 'Zed', buyIn: 3000 });
  assert.equal(bal('zed'), 47000);
  __test.store.tables[T].players.zed.lastSeen = Date.now() - 120000; // déconnecté
  await get({ table: T, user: 'Quentin' }, 'Quentin'); // quelqu'un d'autre fait avancer le croupier
  assert.equal(bal('zed'), 50000);
});

test('salons : mêmes blindes et même mise partout, plus de salon privé', async () => {
  __test.reset();
  await user('Anna'); await user('Boris');
  const r = await get({});
  assert.ok(r.data.tables.every((t) => t.bigBlind === 100 && t.minBuyIn === 1000 && t.maxBuyIn === 20000));
  assert.deepEqual(r.data.tables.filter((t) => t.category === '1v1').map((t) => t.name), ['Salon 1', 'Salon 2', 'Salon 3']);
  let j = await post({ action: 'join', tableId: 'priv_ab12cd', username: 'Anna', buyIn: 1000, create: true, maxSeats: 3, bigBlind: 100 });
  assert.equal(j.data.ok, false);
  j = await post({ action: 'join', tableId: '../etc/passwd', username: 'Boris', buyIn: 1000 });
  assert.equal(j.data.ok, false);
  assert.equal(bal('anna'), 50000);
});

test('un seul siège par joueur : déplacement entre tables', async () => {
  __test.reset();
  await user('Marc');
  await post({ action: 'join', tableId: 'poker_1v1_1', username: 'Marc', buyIn: 2000 });
  const r = await post({ action: 'join', tableId: 'poker_4max_1', username: 'Marc', buyIn: 2000 });
  assert.ok(r.data.ok, r.data.error);
  assert.equal(Object.keys(__test.store.tables.poker_1v1_1.players).length, 0);
  assert.equal(bal('marc'), 48000);           // 2000 rendus de l'ancienne table, 2000 pris pour la nouvelle
});

test('actions invalides : message d\'erreur clair', async () => {
  __test.reset();
  await user('Anna'); await user('Boris');
  const T = 'poker_1v1_2';
  await post({ action: 'join', tableId: T, username: 'Anna', buyIn: 10000 });
  await post({ action: 'join', tableId: T, username: 'Boris', buyIn: 10000 });
  await post({ action: 'ready', tableId: T, username: 'Anna' });
  await post({ action: 'ready', tableId: T, username: 'Boris' });
  __test.store.tables[T].countdownEndsAt = Date.now() - 1;
  const g = await get({ table: T, user: 'Anna' }, 'Anna');
  const turn = g.data.table.turn;
  const other = turn === 'anna' ? 'Boris' : 'Anna';
  const mover = turn === 'anna' ? 'Anna' : 'Boris';
  let r = await post({ action: 'fold', tableId: T, username: other });
  assert.equal(r.data.ok, false);
  assert.match(r.data.error, /tour/);
  r = await post({ action: 'check', tableId: T, username: mover });
  assert.equal(r.data.ok, false);
  r = await post({ action: 'raise', tableId: T, username: mover, amount: 150 });
  assert.equal(r.data.ok, false);
  r = await post({ action: 'raise', tableId: T, username: mover, amount: 400 });
  assert.ok(r.data.ok, r.data.error);
});

test('doubles requêtes simultanées : une seule mise prélevée', async () => {
  __test.reset();
  await user('Dup');
  const rs = await Promise.all([1, 2, 3].map(() => post({ action: 'join', tableId: 'poker_1v1_3', username: 'Dup', buyIn: 4000 })));
  rs.forEach((r) => assert.ok(r.data.ok, r.data.error));
  assert.equal(bal('dup'), 46000);
});
