import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: accounts, __test } = await import('../api/accounts.js');
const { default: bjHandler } = await import('../api/blackjack.js');

function call(handler, method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code || 200, data: p }); }, end() { resolve({ code: this.code || 200 }); } };
    handler({ method, query, body, headers }, res);
  });
}
const acc = (body, tok) => call(accounts, 'POST', { body, headers: tok ? { 'x-auth-token': tok } : {} });
const bj = (body, tok) => call(bjHandler, 'POST', { body, headers: { 'x-auth-token': tok } });
const bjGet = (table) => call(bjHandler, 'GET', { query: { table } });
const bal = (n) => __test.memory.rows[n.toLowerCase()].balance;

async function signup(name) {
  const r = await acc({ action: 'register', username: name, password: 'secret1' });
  assert.equal(r.code, 200, JSON.stringify(r.data));
  return r.data.token;
}

async function playRound(tableId, players) {
  // players : [{name, tok}] — les deux cliquent Prêt, puis chacun reste
  for (const p of players) {
    const r = await bj({ action: 'set_ready', tableId, username: p.name, bet: 100, ready: true }, p.tok);
    assert.equal(r.code, 200, JSON.stringify(r.data));
    p.last = r.data;
  }
  let t = (await bjGet(tableId)).data;
  for (let i = 0; i < 6 && t.status === 'playing'; i++) {
    const cur = players.find((p) => p.name.toLowerCase() === t.turn);
    const r = await bj({ action: 'stand', tableId, username: cur.name }, cur.tok);
    t = r.data.table;
  }
  return t;
}

test('multi : mises prélevées par le serveur, gains versés une seule fois, rien ne fuit', async () => {
  const A = { name: 'Alice', tok: await signup('Alice') };
  const B = { name: 'Bob', tok: await signup('Bob') };
  const start = bal('alice') + bal('bob');
  // pendant la manche : pas de paquet de cartes, carte cachée du croupier masquée
  await bj({ action: 'set_ready', tableId: 'bj_pub_1', username: 'Alice', bet: 100, ready: true }, A.tok);
  const r = await bj({ action: 'set_ready', tableId: 'bj_pub_1', username: 'Bob', bet: 100, ready: true }, B.tok);
  assert.equal(r.data.started, true);
  assert.equal(r.data.table.deck, undefined);
  assert.equal(r.data.table.charged, undefined);
  assert.equal(bal('alice') + bal('bob'), start - 200);
  if (r.data.table.status === 'playing') {
    assert.equal(r.data.table.dealer.cards[1].r, '?');
    const g = (await bjGet('bj_pub_1')).data;
    assert.equal(g.deck, undefined);
    assert.equal(g.dealer.cards[1].r, '?');
  }
  // on joue la manche jusqu'au bout
  let t = r.data.table;
  for (let i = 0; i < 6 && t.status === 'playing'; i++) {
    const cur = [A, B].find((p) => p.name.toLowerCase() === t.turn);
    t = (await bj({ action: 'stand', tableId: 'bj_pub_1', username: cur.name }, cur.tok)).data.table;
  }
  assert.equal(t.status, 'finished');
  const expectA = 5500 - 100 + (t.players.alice.payout || 0);
  const expectB = 5500 - 100 + (t.players.bob.payout || 0);
  assert.equal(bal('alice'), expectA);
  assert.equal(bal('bob'), expectB);
  // relire la table plusieurs fois ne repaie rien
  for (let i = 0; i < 4; i++) await bjGet('bj_pub_1');
  assert.equal(bal('alice'), expectA);
  assert.equal(bal('bob'), expectB);
  assert.equal(t.dealer.cards.every((c) => c.r !== '?'), true);
});

test('multi : solde insuffisant refusé, abandon = l\'autre empoche la cagnotte, personne ne gagne de l\'argent de rien', async () => {
  const A = { name: 'Cleo', tok: await signup('Cleo') };
  const B = { name: 'Dan', tok: await signup('Dan') };
  __test.memory.rows.dan.balance = 50;
  let r = await bj({ action: 'set_ready', tableId: 'bj_pub_2', username: 'Dan', bet: 100, ready: true }, B.tok);
  assert.equal(r.data.ok, false);
  assert.equal(bal('dan'), 50);
  __test.memory.rows.dan.balance = 5500;
  const start = bal('cleo') + bal('dan');
  await bj({ action: 'set_ready', tableId: 'bj_pub_2', username: 'Cleo', bet: 100, ready: true }, A.tok);
  r = await bj({ action: 'set_ready', tableId: 'bj_pub_2', username: 'Dan', bet: 100, ready: true }, B.tok);
  assert.equal(r.data.started, true);
  if (r.data.table.status === 'playing') {
    // Dan fuit : Cleo remporte les 200
    await bj({ action: 'leave', tableId: 'bj_pub_2', username: 'Dan' }, B.tok);
    assert.equal(bal('cleo'), 5500 + 100);
    assert.equal(bal('dan'), 5500 - 100);
    assert.equal(bal('cleo') + bal('dan'), start);
    await bjGet('bj_pub_2'); await bjGet('bj_pub_2');
    assert.equal(bal('cleo'), 5600);
  }
  // l'ancienne action « deal » avec participants choisis par le client ne marche plus
  const victim = await signup('Eve');
  r = await bj({ action: 'deal', tableId: 'bj_pub_3', username: 'Cleo', participants: [{ username: 'Eve', bet: 50000 }, { username: 'Cleo', bet: 10 }] }, A.tok);
  assert.equal(r.data.ok, false);
  assert.equal(bal('eve'), 5500);
});

test('multi : doubler prélève la mise une 2e fois, et seulement s\'il y a de quoi payer', async () => {
  const A = { name: 'Fred', tok: await signup('Fred') };
  const B = { name: 'Gina', tok: await signup('Gina') };
  let done = false;
  for (let tries = 0; tries < 30 && !done; tries++) {
    const a0 = bal('fred'), b0 = bal('gina');
    await bj({ action: 'set_ready', tableId: 'bj_pub_4', username: 'Fred', bet: 100, ready: true }, A.tok);
    let r = await bj({ action: 'set_ready', tableId: 'bj_pub_4', username: 'Gina', bet: 100, ready: true }, B.tok);
    let t = r.data.table;
    if (t.status !== 'playing') { await bj({ action: 'reset', tableId: 'bj_pub_4', username: 'Fred' }, A.tok); continue; }
    const cur = [A, B].find((p) => p.name.toLowerCase() === t.turn);
    const key = cur.name.toLowerCase();
    const before = bal(key);
    r = await bj({ action: 'double', tableId: 'bj_pub_4', username: cur.name }, cur.tok);
    assert.equal(bal(key), before - 100);
    assert.equal(r.data.table.players[key].bet, 200);
    // finir la manche
    t = r.data.table;
    for (let i = 0; i < 6 && t.status === 'playing'; i++) {
      const c2 = [A, B].find((p) => p.name.toLowerCase() === t.turn);
      t = (await bj({ action: 'stand', tableId: 'bj_pub_4', username: c2.name }, c2.tok)).data.table;
    }
    assert.equal(t.status, 'finished');
    assert.equal(bal('fred'), a0 - t.players.fred.bet + t.players.fred.payout);
    assert.equal(bal('gina'), b0 - t.players.gina.bet + t.players.gina.payout);
    done = true;
  }
  assert.ok(done, 'aucune manche jouable obtenue');
});

test('solo : le serveur tire, prélève et règle ; la carte cachée ne sort jamais', async () => {
  const tok = await signup('Hugo');
  let r = await acc({ action: 'bj_start', bet: 5 }, tok);
  assert.equal(r.code, 400);
  r = await acc({ action: 'bj_start', bet: 999999 }, tok);
  assert.equal(r.code, 400);
  r = await acc({ action: 'bj_hit' }, tok);
  assert.equal(r.code, 400);
  let net = 0;
  for (let i = 0; i < 150; i++) {
    __test.memory.rows.hugo.balance = 5500;
    r = await acc({ action: 'bj_start', bet: 100 }, tok);
    assert.equal(r.code, 200, JSON.stringify(r.data));
    assert.equal(r.data.deck, undefined);
    if (!r.data.done) {
      assert.equal(r.data.dealer[1].r, '?');
      assert.equal(bal('hugo'), 5400);
      let guard = 0;
      while (!r.data.done && guard++ < 10) {
        const act = (i % 3 === 0) ? 'bj_hit' : (i % 3 === 1 ? 'bj_stand' : 'bj_double');
        r = await acc({ action: act }, tok);
        assert.equal(r.code, 200, JSON.stringify(r.data));
        if (!r.data.done) assert.equal(r.data.dealer[1].r, '?');
      }
    }
    assert.equal(r.data.done, true);
    assert.equal(r.data.dealer.every((c) => c.r !== '?'), true);
    const spent = r.data.bet; // mise finale (doublée éventuellement)
    assert.equal(r.data.balance, 5500 - spent + r.data.win);
    assert.ok([0, spent, spent * 2].includes(r.data.win));
    net += r.data.win - spent;
    // une manche terminée ne peut plus être rejouée
    const again = await acc({ action: 'bj_stand' }, tok);
    assert.equal(again.code, 400);
  }
  assert.ok(Number.isFinite(net));
});

test('solo : doubler sans argent impossible, abandonner = mise perdue (jamais remboursée)', async () => {
  const tok = await signup('Ivan');
  __test.memory.rows.ivan.balance = 150;
  let r;
  for (let i = 0; i < 20; i++) {
    __test.memory.rows.ivan.balance = 150;
    r = await acc({ action: 'bj_start', bet: 100 }, tok);
    if (!r.data.done) break;
  }
  if (!r.data.done) {
    const d = await acc({ action: 'bj_double' }, tok);
    assert.equal(d.code, 400);
    assert.equal(bal('ivan'), 50);
    // relancer une manche sans finir l'ancienne : la mise de l'ancienne est perdue
    await acc({ action: 'bj_start', bet: 50 }, tok);
    assert.ok(bal('ivan') <= 100); // au mieux 0 + gain de la 2e manche (2 × 50) : la 1re mise n'est jamais rendue
  }
});

test('solo : plusieurs demandes simultanées ne paient pas deux fois', async () => {
  const tok = await signup('Jade');
  for (let i = 0; i < 20; i++) {
    __test.memory.rows.jade.balance = 5500;
    let r = await acc({ action: 'bj_start', bet: 1000 }, tok);
    if (r.data.done) continue;
    const rs = await Promise.all([acc({ action: 'bj_stand' }, tok), acc({ action: 'bj_stand' }, tok), acc({ action: 'bj_stand' }, tok)]);
    const okc = rs.filter((x) => x.code === 200);
    assert.equal(okc.length, 1);
    assert.ok(bal('jade') <= 5500 - 1000 + 2000);
  }
});
