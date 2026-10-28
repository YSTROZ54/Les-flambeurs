import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test';
const { default: handler, __test } = await import('../api/accounts.js');
const { spinSlots, drawScratch } = await import('../api/_games.js');

function call(method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code, data: p }); }, end() { resolve({ code: this.code }); } };
    handler({ method, query, body, headers }, res);
  });
}
const post = (body, headers) => call('POST', { body, headers });
const auth = (t) => ({ 'x-auth-token': t });
const reset = () => { Object.keys(__test.memory.rows).forEach((k) => delete __test.memory.rows[k]); };
const rowBal = (n) => __test.memory.rows[n.toLowerCase()].balance;
async function signup(n) { const r = await post({ action: 'register', username: n, password: 'secret1' }); return r.data.token; }

test('machine à sous : rendement proche de 94 % avec la chance par défaut', () => {
  let bet = 0, back = 0;
  for (let i = 0; i < 300000; i++) { bet += 100; back += spinSlots(100, 35).win; }
  const rtp = back / bet;
  assert.ok(rtp > 0.88 && rtp < 1.0, 'rendement ' + rtp);
});

test('grattage : rendement proche de 96 %', () => {
  let back = 0; const N = 400000;
  for (let i = 0; i < N; i++) back += drawScratch(35);
  const rtp = back / (N * 50);
  assert.ok(rtp > 0.88 && rtp < 1.05, 'rendement ' + rtp);
});

test('machine à sous : débit, gain et solde calculés par le serveur', async () => {
  reset();
  const tok = await signup('Alice');
  let r = await post({ action: 'slots_spin', bet: 100 });
  assert.equal(r.code, 401);
  let expected = 5500;
  for (let i = 0; i < 30; i++) {
    r = await post({ action: 'slots_spin', bet: 100 }, auth(tok));
    assert.equal(r.code, 200);
    assert.equal(r.data.finals.length, 3);
    expected = expected - 100 + r.data.win;
    assert.equal(r.data.balance, expected);
    assert.equal(rowBal('Alice'), expected);
  }
});

test('machine à sous : mise invalide, trop haute ou supérieure au solde du serveur', async () => {
  reset();
  const tok = await signup('Bob');
  for (const bet of [0, -5, 'abc', 100001, 999999999]) {
    const r = await post({ action: 'slots_spin', bet }, auth(tok));
    assert.equal(r.code, 400, 'mise ' + bet);
  }
  assert.equal(rowBal('Bob'), 5500);
});

test('grattage : ticket débité, gain crédité une seule fois', async () => {
  reset();
  const tok = await signup('Carl');
  let r = await post({ action: 'scratch_buy' }, auth(tok));
  assert.equal(r.code, 200);
  assert.equal(r.data.balance, 5450);
  const { ticketId, win } = r.data;
  let c = await post({ action: 'scratch_claim', ticketId: 'faux' }, auth(tok));
  assert.equal(c.code, 400);
  c = await post({ action: 'scratch_claim', ticketId }, auth(tok));
  assert.equal(c.data.balance, 5450 + win);
  c = await post({ action: 'scratch_claim', ticketId }, auth(tok));
  assert.equal(c.data.balance, 5450 + win, 'pas de double crédit');
  assert.equal(rowBal('Carl'), 5450 + win);
});

test('grattage : ticket jamais gratté crédité à l\'achat suivant, et protégé contre les envois du navigateur', async () => {
  reset();
  const tok = await signup('Dana');
  const b1 = await post({ action: 'scratch_buy' }, auth(tok));
  const win1 = b1.data.win;
  // le navigateur renvoie son compte : le ticket du serveur doit survivre
  await post({ username: 'Dana', avatarEmoji: '🦊', balance: b1.data.balance }, auth(tok));
  const claim = await post({ action: 'scratch_claim', ticketId: b1.data.ticketId }, auth(tok));
  assert.equal(claim.code, 200);
  assert.equal(claim.data.balance, 5450 + win1);
  const b2 = await post({ action: 'scratch_buy' }, auth(tok));
  const b3 = await post({ action: 'scratch_buy' }, auth(tok)); // b2 non gratté : crédité ici
  assert.equal(b3.data.balance, b2.data.balance + b2.data.win - 50);
});

test('grattage : solde insuffisant refusé', async () => {
  reset();
  const tok = await signup('Eve');
  await post({ username: 'Eve', avatarEmoji: '🦊', balance: 20 }, auth(tok));
  const r = await post({ action: 'scratch_buy' }, auth(tok));
  assert.equal(r.code, 400);
  assert.equal(rowBal('Eve'), 20);
});
