import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: accounts, __test } = await import('../api/accounts.js');
const H = await import('../api/horses.js');
const horses = H.default;

function call(handler, method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code || 200, data: p }); }, end() { resolve({ code: this.code || 200 }); } };
    handler({ method, query, body, headers }, res);
  });
}
const acc = (body, tok) => call(accounts, 'POST', { body, headers: tok ? { 'x-auth-token': tok } : {} });
const hs = (body, tok) => call(horses, 'POST', { body, headers: tok ? { 'x-auth-token': tok } : {} });
const hsGet = () => call(horses, 'GET', {});
const bal = (n) => __test.memory.rows[n.toLowerCase()].balance;
const raw = () => __test.memory.rows.__horses_game__.data.horses;
async function signup(name) {
  const r = await acc({ action: 'register', username: name, password: 'secret1' });
  assert.equal(r.code, 200); return r.data.token;
}
// avance l'horloge de la course en reculant son départ
const shift = (ms) => { raw().t0 -= ms; };
// repart d'une course toute neuve (les tests ne doivent pas dépendre les uns des autres)
const fresh = () => { delete __test.memory.rows.__horses_game__; };

test('cotes : un cheval moyen paie x2 en groupe, les favoris moins et les outsiders plus', () => {
  const { group, place, chance } = H.ODDS;
  assert.equal(group.length, 8);
  assert.ok(Math.abs(group[4] - 2) < 0.25, 'le 5 (moyen) paie à peu près x2, il paie x' + group[4]);
  assert.ok(group[2] < group[4] && group[4] < group[5], 'le favori (3) paie moins que le 5, l\'outsider (6) plus');
  chance.group.forEach((c, i) => assert.ok(c > 0.15 && c < 0.88, 'chance du cheval ' + (i + 1) + ' : ' + c));
  chance.group.forEach((c, i) => assert.ok(group[i] * c < 1, 'le pari groupe du cheval ' + (i + 1) + ' ne doit pas être gagnant à coup sûr'));
  // la somme des chances d'être dans les 4 premiers vaut 4
  assert.ok(Math.abs(chance.group.reduce((a, b) => a + b, 0) - 4) < 0.01);
  place.forEach((row) => row.forEach((m) => assert.ok(m >= 2 && m <= 60)));
});

test('tirage : 8 durées entre 17 et 26,5 s, toutes différentes', () => {
  for (let k = 0; k < 50; k++) {
    const f = H.drawFinish();
    assert.equal(f.length, 8);
    f.forEach((t) => assert.ok(t >= 17 && t <= 26.501));
    assert.equal(new Set(f).size, 8);
    assert.deepEqual(H.orderOf(f).slice().sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  }
});

test('horses : connexion obligatoire, paris contrôlés, classement secret pendant les paris', async () => {
  fresh();
  const ta = await signup('Alice');
  let r = await hs({ action: 'bet', horse: 5, kind: 'group', amount: 100 });
  assert.equal(r.code, 401);
  r = await hs({ action: 'bet', horse: 9, kind: 'group', amount: 100 }, ta);
  assert.equal(r.code, 400);
  r = await hs({ action: 'bet', horse: 5, kind: 'place', place: 0, amount: 100 }, ta);
  assert.equal(r.code, 400);
  r = await hs({ action: 'bet', horse: 5, kind: 'group', amount: 5 }, ta);
  assert.equal(r.code, 400);
  r = await hs({ action: 'bet', horse: 5, kind: 'group', amount: 999999999 }, ta);
  assert.equal(r.code, 400);
  __test.memory.rows.alice.balance = 50;
  r = await hs({ action: 'bet', horse: 5, kind: 'group', amount: 100 }, ta);
  assert.equal(r.code, 400);
  assert.equal(bal('alice'), 50);

  __test.memory.rows.alice.balance = 5000;
  r = await hs({ action: 'bet', horse: 5, kind: 'group', amount: 100 }, ta);
  assert.equal(r.code, 200, JSON.stringify(r.data));
  assert.equal(bal('alice'), 4900);
  assert.equal(r.data.mult, H.ODDS.group[4]);
  assert.equal(r.data.state.finish, undefined, 'le classement ne doit pas fuiter');
  assert.ok(!JSON.stringify(r.data).includes(JSON.stringify(raw().finish)), 'les durées ne doivent apparaître nulle part');
  r = await hs({ action: 'bet', horse: 5, kind: 'group', amount: 100 }, ta);
  assert.equal(r.code, 400); // même pari deux fois
  assert.equal((await hs({ action: 'bet', horse: 5, kind: 'place', place: 1, amount: 100 }, ta)).code, 200);
  assert.equal((await hs({ action: 'bet', horse: 1, kind: 'place', place: 3, amount: 100 }, ta)).code, 200);
  r = await hs({ action: 'bet', horse: 2, kind: 'group', amount: 100 }, ta);
  assert.equal(r.code, 400); // 3 paris au maximum
  assert.equal(bal('alice'), 4700);

  // annulation = remboursement
  r = await hs({ action: 'mine' }, ta);
  assert.equal(r.data.mine.length, 3);
  r = await hs({ action: 'cancel', at: r.data.mine[0].at }, ta);
  assert.equal(r.code, 200);
  assert.equal(bal('alice'), 4800);
  assert.equal((await hs({ action: 'mine' }, ta)).data.mine.length, 2);
});

test('horses : les paris ferment 2 s avant le départ et le classement apparaît', async () => {
  fresh();
  const ta = await signup('Bob');
  __test.memory.rows.bob.balance = 1000;
  assert.equal((await hs({ action: 'bet', horse: 1, kind: 'group', amount: 100 }, ta)).code, 200);   // le premier pari lance le compte à rebours
  shift(H.BET_MS - H.CLOSE_MS + 500);
  const g = await hsGet();
  assert.ok(Array.isArray(g.data.finish) && g.data.finish.length === 8, 'le classement est révélé une fois les paris fermés');
  const r = await hs({ action: 'bet', horse: 3, kind: 'group', amount: 100 }, ta);
  assert.equal(r.code, 400);
  assert.equal(bal('bob'), 900);
});

test('horses : gains versés une seule fois à la fin de la course, perdants non payés', async () => {
  fresh();
  const ta = await signup('Carol'), tb = await signup('Dave');
  __test.memory.rows.carol.balance = 10000; __test.memory.rows.dave.balance = 10000;
  await hsGet();
  const st0 = raw();
  // classement imposé pour le test : le cheval 4 (index 3) gagne, le 6 (index 5) finit 8ᵉ
  const finish = [22, 23, 24, 19.5, 21, 26, 21.5, 25];
  st0.finish = finish;
  const order = H.orderOf(finish);
  assert.equal(order[0], 3);
  assert.equal((await hs({ action: 'bet', horse: 4, kind: 'place', place: 1, amount: 100 }, ta)).code, 200);   // gagnant
  assert.equal((await hs({ action: 'bet', horse: 4, kind: 'group', amount: 200 }, ta)).code, 200);            // gagnant
  assert.equal((await hs({ action: 'bet', horse: 6, kind: 'group', amount: 300 }, ta)).code, 200);            // perdant
  assert.equal((await hs({ action: 'bet', horse: 4, kind: 'place', place: 2, amount: 100 }, tb)).code, 200);  // perdant (le 4 est 1er)
  const multPlace = H.ODDS.place[3][0], multGroup = H.ODDS.group[3];
  assert.equal(bal('carol'), 9400);

  shift(H.BET_MS + H.RACE_MS + 500);   // course terminée
  const r = await hs({ action: 'mine' }, ta);
  assert.equal(r.code, 200);
  const expected = 9400 + Math.floor(100 * multPlace) + Math.floor(200 * multGroup);
  assert.equal(r.data.balance, expected);
  assert.equal(bal('dave'), 9900);
  // un deuxième appel ne repaye rien
  await hs({ action: 'mine' }, ta); await hsGet();
  assert.equal(bal('carol'), expected);
  assert.equal(raw().history[0].order[0], 4, 'le numéro 4 gagne');
  const g = await hsGet();
  assert.ok(g.data.bets.every((b) => typeof b.win === 'number'));
  // plus de pari pendant les résultats
  assert.equal((await hs({ action: 'bet', horse: 1, kind: 'group', amount: 100 }, ta)).code, 400);
});

test('horses : la course suivante démarre à l\'heure, avec de nouvelles mises à zéro', async () => {
  fresh();
  const ta = await signup('Erin');
  __test.memory.rows.erin.balance = 1000;
  assert.equal((await hs({ action: 'bet', horse: 1, kind: 'group', amount: 100 }, ta)).code, 200);
  const round = raw().round;
  shift(H.CYCLE_MS + 1000);
  const g = await hsGet();
  assert.equal(g.data.round, round + 1);
  assert.equal(g.data.bets.length, 0);
  assert.equal(g.data.finish, undefined);
  assert.equal(g.data.t0, 0, 'rien ne démarre tant que personne ne parie');
  assert.equal((await hs({ action: 'bet', horse: 2, kind: 'group', amount: 100 }, ta)).code, 200);
});

test('horses : aucune course ne démarre sans pari, et le premier pari lance 10 s de paris', async () => {
  fresh();
  const ta = await signup('Fred');
  __test.memory.rows.fred.balance = 1000;
  let g = await hsGet();
  assert.equal(g.data.t0, 0);
  assert.equal(g.data.finish, undefined);
  assert.equal(H.BET_MS - H.CLOSE_MS, 10000, '10 s pour parier');
  await new Promise((r) => setTimeout(r, 30));
  g = await hsGet();
  assert.equal(g.data.t0, 0, 'toujours en attente');
  const t = Date.now();
  let r = await hs({ action: 'bet', horse: 3, kind: 'group', amount: 100 }, ta);
  assert.equal(r.code, 200);
  assert.ok(r.data.state.t0 >= t && r.data.state.t0 <= Date.now(), 'le compte à rebours part au premier pari');
  // un deuxième pari ne relance pas l'horloge
  const t0 = raw().t0;
  assert.equal((await hs({ action: 'bet', horse: 4, kind: 'group', amount: 100 }, ta)).code, 200);
  assert.equal(raw().t0, t0);
  // si tous les paris sont annulés avant le départ, la course repasse en attente
  const mine = (await hs({ action: 'mine' }, ta)).data.mine;
  for (const b of mine) assert.equal((await hs({ action: 'cancel', at: b.at }, ta)).code, 200);
  assert.equal(raw().t0, 0);
  assert.equal(bal('fred'), 1000);
});
