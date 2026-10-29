import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test';
const { default: accounts, __test } = await import('../api/accounts.js');
const { default: slots } = await import('../api/slots.js');

function call(handler, method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code, data: p }); }, end() { resolve({ code: this.code }); } };
    handler({ method, query, body, headers }, res);
  });
}
const acc = (body) => call(accounts, 'POST', { body });
const room = (body, token) => call(slots, 'POST', { body, headers: token ? { 'x-auth-token': token } : {} });
async function signup(n) { const r = await acc({ action: 'register', username: n, password: 'secret1' }); return r.data.token; }
const reset = () => { Object.keys(__test.memory.rows).forEach((k) => delete __test.memory.rows[k]); };

test('salle des machines : connexion obligatoire pour être présent', async () => {
  reset();
  const r = await room({ action: 'presence', x: 1, z: 2, yaw: 0 });
  assert.equal(r.code, 401);
});

test('salle des machines : on voit les autres, une borne ne peut avoir qu\'un joueur', async () => {
  reset();
  const a = await signup('Alice'), b = await signup('Bob');
  let r = await room({ action: 'presence', x: 1, z: 5, yaw: 0.5, name: 'Alice', avatar: '🦊' }, a);
  assert.equal(r.code, 200);
  r = await room({ action: 'presence', x: -2, z: 6, yaw: 0, name: 'Bob', avatar: '🐻' }, b);
  assert.deepEqual(Object.keys(r.data.players).sort(), ['alice', 'bob']);
  assert.equal(r.data.players.alice.x, 1);

  r = await room({ action: 'sit', seat: 2 }, a);
  assert.equal(r.code, 200);
  r = await room({ action: 'sit', seat: 2 }, b);
  assert.equal(r.code, 409);
  r = await room({ action: 'sit', seat: 3 }, b);
  assert.equal(r.code, 200);
  assert.equal(r.data.players.alice.seat, 2);
  assert.equal(r.data.players.bob.seat, 3);

  // le nom affiché ne peut pas usurper un autre joueur
  r = await room({ action: 'presence', x: 0, z: 0, yaw: 0, name: 'Alice' }, b);
  assert.equal(r.data.players.bob.name, 'bob');

  r = await room({ action: 'stand' }, a);
  assert.equal(r.data.players.alice.seat, -1);
  r = await room({ action: 'sit', seat: 2 }, b);
  assert.equal(r.code, 200);
});

test('salle des machines : le tirage d\'un joueur est visible, sans toucher au solde', async () => {
  reset();
  const a = await signup('Alice');
  await room({ action: 'sit', seat: 0 }, a);
  const before = __test.memory.rows.alice.balance;
  let r = await room({ action: 'fx', phase: 'start', id: 'x1' }, a);
  assert.equal(r.data.players.alice.fx.phase, 'start');
  r = await room({ action: 'fx', phase: 'result', id: 'x1', finals: ['🔥', '🔥', '🍒'], mult: 2.5, win: 125, bet: 50 }, a);
  assert.deepEqual(r.data.players.alice.fx.finals, ['🔥', '🔥', '🍒']);
  assert.equal(__test.memory.rows.alice.balance, before);
  // sans borne, pas d'effet
  r = await room({ action: 'stand' }, a);
  r = await room({ action: 'fx', phase: 'start', id: 'x2' }, a);
  assert.equal(r.code, 400);
});

test('salle des machines : quitter la salle efface le joueur', async () => {
  reset();
  const a = await signup('Alice');
  await room({ action: 'presence', x: 0, z: 5, yaw: 0 }, a);
  const r = await room({ action: 'leave' }, a);
  assert.equal(Object.keys(r.data.players).length, 0);
  const g = await call(slots, 'GET');
  assert.deepEqual(g.data.players, {});
});
