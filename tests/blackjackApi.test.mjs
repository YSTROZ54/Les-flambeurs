import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: handler } = await import('../api/blackjack.js');
const { __test } = await import('../api/accounts.js');

function call(method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code, data: p }); }, end() { resolve({ code: this.code }); } };
    handler({ method, query, body, headers }, res);
  });
}

test('blackjack : action sans connexion refusée', async () => {
  const r = await call('POST', { body: { action: 'set_bet', username: 'Alice', bet: 100 } });
  assert.equal(r.code, 401);
});

test('blackjack : on ne peut pas jouer à la place de quelqu\'un d\'autre', async () => {
  const token = __test.userToken('Alice');
  const r = await call('POST', { body: { action: 'hit', username: 'Bob' }, headers: { 'x-auth-token': token } });
  assert.equal(r.code, 403);
});

test('blackjack : joueur connecté accepté, jeton dans le corps (beacon) accepté', async () => {
  const token = __test.userToken('Alice');
  let r = await call('POST', { body: { action: 'set_bet', username: 'alice', bet: 100, tableId: 'bj_pub_1' }, headers: { 'x-auth-token': token } });
  assert.equal(r.code, 200);
  r = await call('POST', { body: { action: 'leave', username: 'Alice', token, tableId: 'bj_pub_1' } });
  assert.equal(r.code, 200);
});

test('blackjack : la liste des tables reste publique, la fusion d\'état client est supprimée', async () => {
  let r = await call('POST', { body: { action: 'list_tables' } });
  assert.equal(r.code, 200);
  const token = __test.userToken('Alice');
  r = await call('POST', { body: { tableId: 'bj_pub_2', tableState: { status: 'playing', turn: 'alice' } }, headers: { 'x-auth-token': token } });
  assert.notEqual(r.data.table && r.data.table.status, 'playing');
});
