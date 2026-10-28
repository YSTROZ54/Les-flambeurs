import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: accounts, __test } = await import('../api/accounts.js');
const { default: crash, drawCrashPoint } = await import('../api/crash.js');

function call(handler, method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code || 200, data: p }); }, end() { resolve({ code: this.code || 200 }); } };
    handler({ method, query, body, headers }, res);
  });
}
const acc = (body, tok) => call(accounts, 'POST', { body, headers: tok ? { 'x-auth-token': tok } : {} });
const cr = (body, tok) => call(crash, 'POST', { body, headers: tok ? { 'x-auth-token': tok } : {} });
const crGet = () => call(crash, 'GET', {});
const bal = (n) => __test.memory.rows[n.toLowerCase()].balance;
const raw = () => __test.memory.rows.__crash_game__.data.crash;
async function signup(name) {
  const r = await acc({ action: 'register', username: name, password: 'secret1' });
  assert.equal(r.code, 200); return r.data.token;
}
// avance l'horloge de la partie en reculant ses dates
function shift(ms) {
  const st = raw();
  ['countdownStartTime', 'launchTime', 'crashedAtTime'].forEach((k) => { if (st[k]) st[k] -= ms; });
}

test('crash : connexion obligatoire, mises contrôlées, rien de secret n\'est visible', async () => {
  const ta = await signup('Alice');
  let r = await cr({ action: 'bet', amount: 100 });
  assert.equal(r.code, 401);
  r = await cr({ action: 'bet', amount: 5 }, ta);
  assert.equal(r.code, 400);
  r = await cr({ action: 'bet', amount: 999999999 }, ta);
  assert.equal(r.code, 400);
  __test.memory.rows.alice.balance = 50;
  r = await cr({ action: 'bet', amount: 100 }, ta);
  assert.equal(r.code, 400);
  assert.equal(bal('alice'), 50);
  assert.equal(Object.keys(raw().bets).length, 0);
  __test.memory.rows.alice.balance = 5500;
  r = await cr({ action: 'bet', amount: 100 }, ta);
  assert.equal(r.code, 200, JSON.stringify(r.data));
  assert.equal(bal('alice'), 5400);
  r = await cr({ action: 'bet', amount: 100 }, ta);
  assert.equal(r.code, 400); // une seule mise par vol
  // annulation = remboursement
  r = await cr({ action: 'cancel' }, ta);
  assert.equal(r.code, 200);
  assert.equal(bal('alice'), 5500);
  // lancer sans mise : refusé
  r = await cr({ action: 'launch' }, ta);
  assert.equal(r.code, 400);
});

test('crash : vol complet, gains au multiplicateur du serveur, une seule fois', async () => {
  const ta = await signup('Bob');
  const tb = await signup('Cleo');
  const [r1, r2] = await Promise.all([cr({ action: 'bet', amount: 1000 }, ta), cr({ action: 'bet', amount: 2000 }, tb)]);
  assert.equal(r1.code, 200); assert.equal(r2.code, 200);
  assert.equal(Object.keys(raw().bets).length, 2); // deux mises simultanées, aucune écrasée
  assert.equal(bal('bob'), 4500); assert.equal(bal('cleo'), 3500);
  let r = await cr({ action: 'launch' }, ta);
  assert.equal(r.code, 200);
  let g = (await crGet()).data;
  assert.equal(g.status, 'countdown');
  assert.equal(g.crashPoint, undefined);
  assert.equal(JSON.stringify(g).includes('crashPoint'), false);
  r = await cr({ action: 'cashout' }, ta);           // pas encore décollé
  assert.equal(r.code, 400);
  raw().crashPoint = 3.0;                            // le test fixe le secret
  shift(7000 + 4000);                                 // 4 s de vol -> ×1,82
  g = (await crGet()).data;
  assert.equal(g.status, 'flying');
  assert.equal(g.crashPoint, undefined);
  // le navigateur a beau annoncer ce qu'il veut, seul le serveur calcule
  const forged = await cr({ action: 'cashout', cashMult: 500, win: 99999999 }, ta);
  assert.equal(forged.code, 200);
  assert.ok(forged.data.mult >= 1.8 && forged.data.mult <= 1.83, String(forged.data.mult));
  assert.equal(forged.data.win, Math.floor(1000 * forged.data.mult));
  assert.equal(bal('bob'), 4500 + forged.data.win);
  // double encaissement, y compris simultané : refusé
  const again = await Promise.all([cr({ action: 'cashout' }, ta), cr({ action: 'cashout' }, ta), cr({ action: 'cashout' }, ta)]);
  again.forEach((x) => assert.equal(x.code, 400));
  assert.equal(bal('bob'), 4500 + forged.data.win);
  // Cleo attend trop : crash
  shift(4000);                                        // 8 s -> ×3,3 > 3,0
  g = (await crGet()).data;
  assert.equal(g.status, 'crashed');
  assert.equal(g.crashPoint, 3);
  r = await cr({ action: 'cashout' }, tb);
  assert.equal(r.code, 400);
  assert.equal(bal('cleo'), 3500);                    // mise perdue
  // nouveau tour après 4 s
  shift(5000);
  g = (await crGet()).data;
  assert.equal(g.status, 'waiting');
  assert.equal(Object.keys(g.bets).length, 0);
  r = await cr({ action: 'bet', amount: 100 }, tb);
  assert.equal(r.code, 200);
  assert.equal(bal('cleo'), 3400);
});

test('crash : on ne peut pas miser en plein vol ni se retirer après le décollage', async () => {
  const ta = await signup('Dan');
  const tb = await signup('Eve');
  await cr({ action: 'bet', amount: 100 }, ta);
  await cr({ action: 'launch' }, ta);
  shift(7000 + 1000);
  let r = await cr({ action: 'bet', amount: 100 }, tb);
  assert.equal(r.code, 400);
  r = await cr({ action: 'cancel' }, ta);
  assert.equal(r.code, 400);
  assert.equal(bal('eve'), 5500);
});

test('crash : tirage équitable (retour au joueur ≈ réglage) et jamais en dessous de ×1', () => {
  let n = 20000, sum = 0;
  for (let i = 0; i < n; i++) {
    const c = drawCrashPoint(50);
    assert.ok(c >= 1 && c <= 500);
    sum += 1 >= c ? 0 : 0; // le joueur qui vise ×2 encaisse seulement si c >= 2
  }
  let wins = 0;
  for (let i = 0; i < n; i++) if (drawCrashPoint(50) >= 2) wins++;
  const rtp = (wins / n) * 2;
  assert.ok(rtp > 0.85 && rtp < 1.05, 'rtp ' + rtp);
});

test('crash : se retirer puis remiser dans le même vol = nouveau prélèvement à chaque fois (pas de mise gratuite)', async () => {
  delete __test.memory.rows.__crash_game__; // partie neuve
  const ta = await signup('Zoe');
  __test.memory.rows.zoe.balance = 5000;
  for (let i = 0; i < 4; i++) {
    let r = await cr({ action: 'bet', amount: 300 }, ta);
    assert.equal(r.code, 200, JSON.stringify(r.data));
    assert.equal(bal('zoe'), 4700, 'mise ' + i + ' prélevée');
    r = await cr({ action: 'cancel' }, ta);
    assert.equal(r.code, 200);
    assert.equal(bal('zoe'), 5000, 'mise ' + i + ' remboursée');
  }
  // une mise reprise puis encaissée : bilan exact
  await cr({ action: 'bet', amount: 300 }, ta);
  await cr({ action: 'launch' }, ta);
  raw().crashPoint = 50;
  shift(7000 + 6000);
  const c = await cr({ action: 'cashout' }, ta);
  assert.equal(c.code, 200);
  assert.equal(bal('zoe'), 5000 - 300 + c.data.win);
});
