import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: accounts, __test } = await import('../api/accounts.js');
const G = await import('../api/_games.js');

function call(handler, body, tok) {
  return new Promise((resolve) => {
    const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code || 200, data: p }); }, end() { resolve({ code: this.code || 200 }); } };
    handler({ method: 'POST', query: {}, body, headers: tok ? { 'x-auth-token': tok } : {} }, res);
  });
}
const acc = (body, tok) => call(accounts, body, tok);
const bal = (n) => __test.memory.rows[n.toLowerCase()].balance;
async function signup(name) {
  const r = await acc({ action: 'register', username: name, password: 'secret1' });
  assert.equal(r.code, 200); return r.data.token;
}
const give = (n, v) => { __test.memory.rows[n.toLowerCase()].balance = v; };

test('cartes du PMU : gains espérés sous 100 % et cases cohérentes', () => {
  const ev = G.PMU_PRIZES.reduce((s, [v, p]) => s + v * p, 0);
  assert.ok(ev < G.PMU_CARD_PRICE, 'le gain moyen doit rester sous le prix');
  for (const prize of [0, 100, 200, 500, 1000, 5000, 20000]) {
    for (let i = 0; i < 50; i++) {
      const cells = G.pmuCells(prize);
      assert.equal(cells.length, 6);
      const count = {}; cells.forEach((c) => { count[c] = (count[c] || 0) + 1; });
      const triples = Object.keys(count).filter((k) => count[k] >= 3).map(Number);
      assert.deepEqual(triples, prize > 0 ? [prize] : []);
    }
  }
});

test('cartes du PMU : il faut être au PMU pour acheter et gratter', async () => {
  const t = await signup('Pmu1'); give('Pmu1', 1000);
  let r = await acc({ action: 'pmu_buy' }, t);
  assert.equal(r.code, 400);
  assert.equal(bal('Pmu1'), 1000);
  r = await acc({ action: 'pmu_here' }, t);
  assert.equal(r.code, 200);
  r = await acc({ action: 'pmu_buy' }, t);
  assert.equal(r.code, 200);
  assert.equal(r.data.cards.length, 1);
  assert.equal(r.data.balance, 900);
  assert.equal(r.data.prize, undefined, 'le résultat reste secret avant le grattage');
  // on quitte le PMU (présence périmée) : plus de grattage
  __test.memory.rows.pmu1.data._srv.pmu.here -= 120000;
  r = await acc({ action: 'pmu_scratch', id: r.data.card }, t);
  assert.equal(r.code, 400);
});

test('cartes du PMU : 4 cartes au maximum, gain payé une seule fois, solde contrôlé par le serveur', async () => {
  const t = await signup('Pmu2'); give('Pmu2', 10000);
  await acc({ action: 'pmu_here' }, t);
  const ids = [];
  for (let i = 0; i < 4; i++) { const r = await acc({ action: 'pmu_buy' }, t); assert.equal(r.code, 200); ids.push(r.data.card); }
  assert.equal(bal('Pmu2'), 10000 - 400);
  let r = await acc({ action: 'pmu_buy' }, t);
  assert.equal(r.code, 400);
  assert.equal(bal('Pmu2'), 9600);
  // on force le gain pour vérifier le paiement
  __test.memory.rows.pmu2.data._srv.pmu.cards[0].prize = 500;
  r = await acc({ action: 'pmu_scratch', id: ids[0] }, t);
  assert.equal(r.code, 200);
  assert.equal(r.data.prize, 500);
  assert.equal(r.data.balance, 10100);
  assert.equal(r.data.cells.filter((c) => c === 500).length, 3);
  r = await acc({ action: 'pmu_scratch', id: ids[0] }, t);   // même carte, deuxième fois
  assert.equal(r.code, 400);
  assert.equal(bal('Pmu2'), 10100);
  r = await acc({ action: 'pmu_scratch', id: 'nimporte-quoi' }, t);
  assert.equal(r.code, 400);
  r = await acc({ action: 'pmu_cards' }, t);
  assert.equal(r.data.cards.length, 3);
});

test('cartes du PMU : solde insuffisant et connexion obligatoire', async () => {
  const t = await signup('Pmu3'); give('Pmu3', 50);
  await acc({ action: 'pmu_here' }, t);
  let r = await acc({ action: 'pmu_buy' }, t);
  assert.equal(r.code, 400);
  assert.equal(bal('Pmu3'), 50);
  r = await acc({ action: 'pmu_buy' });
  assert.ok(r.code === 401 || r.code === 400);
});
