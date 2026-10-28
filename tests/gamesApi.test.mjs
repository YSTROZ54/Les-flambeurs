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
const adm = () => ({ 'x-admin-token': __test.adminToken('ystroz') });
const setBal = async (n, v) => post({ action: 'admin_set_balance', username: n, balance: v }, adm());
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
  // le navigateur renvoie son compte (avec un solde truqué) : le ticket et le solde du serveur doivent survivre
  await post({ username: 'Dana', avatarEmoji: '🦊', balance: 99999999 }, auth(tok));
  assert.equal(rowBal('Dana'), b1.data.balance);
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
  await setBal('Eve', 20);
  const r = await post({ action: 'scratch_buy' }, auth(tok));
  assert.equal(r.code, 400);
  assert.equal(rowBal('Eve'), 20);
});


/* ------------------------- mode strict, mines, gobelets, coffre, boutique ------------------------- */
test('mode strict : le navigateur ne peut plus écrire son solde', async () => {
  reset();
  const tok = await signup('Fred');
  await post({ username: 'Fred', avatarEmoji: '🦊', balance: 999999999 }, auth(tok));
  assert.equal(rowBal('Fred'), 5500);
  await call('POST', { body: [{ username: 'Fred', balance: 999999999, data: {} }], query: { sb: 'accounts' }, headers: auth(tok) });
  assert.equal(rowBal('Fred'), 5500);
});

test('doubles dépenses : 30 mises simultanées ne peuvent pas dépasser le solde', async () => {
  reset();
  const tok = await signup('Gus');
  await setBal('Gus', 1000);
  const rs = await Promise.all(Array.from({ length: 30 }, () => post({ action: 'slots_spin', bet: 1000 }, auth(tok))));
  const accepted = rs.filter((r) => r.code === 200).length;
  const total = rs.reduce((t, r) => t + (r.code === 200 ? r.data.win : 0), 0);
  assert.ok(accepted >= 1);
  // le solde final = 1000 - 1000*accepted + gains, jamais négatif et cohérent avec les réponses
  assert.equal(rowBal('Gus'), 1000 - 1000 * accepted + total);
  assert.ok(rowBal('Gus') >= 0);
});

test('mines : bombes cachées, retrait au bon multiplicateur, une seule partie à la fois', async () => {
  reset();
  const tok = await signup('Hana');
  let r = await post({ action: 'mines_start', bet: 100, count: 3 }, auth(tok));
  assert.equal(r.code, 200);
  assert.equal(JSON.stringify(r.data).includes('bombs'), false, 'les bombes ne sont jamais envoyées au navigateur');
  assert.equal(r.data.balance, 5400);
  r = await post({ action: 'mines_cashout' }, auth(tok));
  assert.equal(r.code, 400, 'pas de retrait sans case retournée');
  // joue jusqu'à la fin
  let boom = false, revealed = 0;
  for (let i = 0; i < 20 && !boom; i++) {
    const p = await post({ action: 'mines_pick', idx: i }, auth(tok));
    if (p.code !== 200) break;
    if (p.data.boom) { boom = true; assert.ok(Array.isArray(p.data.bombs)); } else revealed++;
  }
  if (boom) assert.equal(rowBal('Hana'), 5400);
  else assert.ok(revealed >= 17);
  // nouvelle partie, retrait garanti si on a retourné une case sûre
  let ok = false;
  for (let t = 0; t < 40 && !ok; t++) {
    await post({ action: 'mines_start', bet: 100, count: 3 }, auth(tok));
    const p = await post({ action: 'mines_pick', idx: 7 }, auth(tok));
    if (!p.data.boom) {
      const before = rowBal('Hana');
      const c = await post({ action: 'mines_cashout' }, auth(tok));
      assert.equal(c.code, 200);
      assert.equal(rowBal('Hana'), before + c.data.win);
      assert.ok(c.data.win >= 100 && c.data.win < 130);
      const again = await post({ action: 'mines_cashout' }, auth(tok));
      assert.equal(again.code, 400, 'pas de double retrait');
      ok = true;
    }
  }
  assert.ok(ok);
});

test('mines : mise invalide ou trop grosse refusée', async () => {
  reset();
  const tok = await signup('Ivan');
  for (const bet of [0, -1, 'x', 6000]) {
    const r = await post({ action: 'mines_start', bet, count: 3 }, auth(tok));
    assert.equal(r.code, 400, 'mise ' + bet);
  }
  assert.equal(rowBal('Ivan'), 5500);
});

test('gobelets : mise plafonnée, pas de choix avant la fin du mélange, gain ×1,25', async () => {
  reset();
  const tok = await signup('Jade');
  let r = await post({ action: 'cups_start', bet: 100000 }, auth(tok));
  assert.equal(r.code, 200);
  assert.equal(r.data.bet, 250);
  assert.equal(r.data.balance, 5250);
  const early = await post({ action: 'cups_pick', cup: r.data.ballCup }, auth(tok));
  assert.equal(early.code, 400);
  // on remonte l'horloge de la manche (simulation du temps écoulé)
  __test.memory.rows['jade'].data._srv.cups.t0 -= 10000;
  const p = await post({ action: 'cups_pick', cup: r.data.ballCup }, auth(tok));
  assert.equal(p.data.correct, true);
  assert.equal(p.data.win, 312);
  assert.equal(p.data.balance, 5250 + 312);
  const twice = await post({ action: 'cups_pick', cup: r.data.ballCup }, auth(tok));
  assert.equal(twice.code, 400);
});

test('coffre du jour : toutes les 6 heures, gardé par le serveur', async () => {
  reset();
  const tok = await signup('Kim');
  let r = await post({ action: 'chest_claim' }, auth(tok));
  assert.equal(r.code, 200);
  assert.equal(r.data.reward, 250);
  r = await post({ action: 'chest_claim' }, auth(tok));
  assert.equal(r.code, 400);
  assert.ok(r.data.waitMs > 0);
  // le navigateur essaie de remettre le compteur à zéro : sans effet
  await post({ username: 'Kim', avatarEmoji: '🦊', data: { lastChestTime: 0, chestStreak: 1 } }, auth(tok));
  r = await post({ action: 'chest_claim' }, auth(tok));
  assert.equal(r.code, 400);
  __test.memory.rows['kim'].data._srv.chest.last -= 7 * 3600 * 1000;
  r = await post({ action: 'chest_claim' }, auth(tok));
  assert.equal(r.code, 200);
});

test('boutique : prix fixés par le serveur, achat unique', async () => {
  reset();
  const tok = await signup('Lea');
  let r = await post({ action: 'shop_buy', id: 'cab_gold' }, auth(tok));
  assert.equal(r.code, 400, 'trop cher');
  r = await post({ action: 'shop_buy', id: 'veh_plane' }, auth(tok));
  assert.equal(r.code, 200);
  assert.equal(r.data.balance, 500);
  r = await post({ action: 'shop_buy', id: 'veh_plane' }, auth(tok));
  assert.equal(r.data.balance, 500, 'déjà acheté : pas de second débit');
  r = await post({ action: 'shop_buy', id: 'article_inconnu' }, auth(tok));
  assert.equal(r.code, 400);
});

test('outils du Patron : seuls les soldes modifiés avec le jeton du Patron', async () => {
  reset();
  const tok = await signup('Max2');
  let r = await post({ action: 'admin_credit', username: 'Max2', amount: 1000 }, auth(tok));
  assert.equal(r.code, 403);
  r = await post({ action: 'admin_credit', username: 'Max2', amount: 1000 }, adm());
  assert.equal(r.data.balance, 6500);
  r = await post({ action: 'admin_reset', username: 'Max2' }, adm());
  assert.equal(r.data.balance, 5500);
});

test('changement de pseudo : 50 000 € prélevés par le serveur', async () => {
  reset();
  const tok = await signup('Nina');
  let r = await post({ action: 'rename', newName: 'Nina2' }, auth(tok));
  assert.equal(r.code, 400, 'solde insuffisant');
  await setBal('Nina', 60000);
  r = await post({ action: 'rename', newName: 'Nina2' }, auth(tok));
  assert.equal(r.code, 200);
  assert.equal(r.data.balance, 10000);
});

/* --------------------------------- banque --------------------------------- */
test('virement : débit, boîte du destinataire, acceptation, refus et remboursement', async () => {
  reset();
  const a = await signup('Alma');
  const b = await signup('Boris');
  // un compte neuf ne peut pas encore envoyer
  let r = await post({ action: 'bank_send', to: 'Boris', amount: 100 }, auth(a));
  assert.equal(r.code, 403);
  delete __test.memory.rows['alma'].data._srv.createdAt;
  r = await post({ action: 'bank_send', to: 'Boris', amount: 1000, note: '<b>salut</b>' }, auth(a));
  assert.equal(r.code, 200, JSON.stringify(r.data));
  assert.equal(r.data.balance, 4500);
  assert.equal(r.data.history[0].note, 'bsalut/b');
  let st = await post({ action: 'bank_state' }, auth(b));
  assert.equal(st.data.inbox.length, 1);
  assert.equal(st.data.balance, 5500, 'rien n\'est crédité avant acceptation');
  const id = st.data.inbox[0].id;
  // un autre joueur ne peut pas encaisser
  const c = await signup('Cleo');
  r = await post({ action: 'bank_accept', id }, auth(c));
  assert.equal(r.code, 404);
  r = await post({ action: 'bank_accept', id }, auth(b));
  assert.equal(r.code, 200);
  assert.equal(r.data.balance, 6500);
  r = await post({ action: 'bank_accept', id }, auth(b));
  assert.equal(r.code, 404, 'pas de double encaissement');
  st = await post({ action: 'bank_state' }, auth(a));
  assert.equal(st.data.history[0].status, 'Accepté');
  // refus : remboursé
  r = await post({ action: 'bank_send', to: 'Boris', amount: 500 }, auth(a));
  const id2 = r.data.history[0].id;
  r = await post({ action: 'bank_decline', id: id2 }, auth(b));
  assert.equal(r.code, 200);
  assert.equal(rowBal('Alma'), 4500, '4500 après les deux virements, +500 rendus = 4500+... (5500-1000-500+500)');
});

test('virement : surdépense et auto-virement refusés', async () => {
  reset();
  const a = await signup('Dora');
  await signup('Eli');
  delete __test.memory.rows['dora'].data._srv.createdAt;
  for (const amount of [0, 4, -50, 99999]) {
    const r = await post({ action: 'bank_send', to: 'Eli', amount }, auth(a));
    assert.equal(r.code, 400, 'montant ' + amount);
  }
  const self = await post({ action: 'bank_send', to: 'dora', amount: 100 }, auth(a));
  assert.equal(self.code, 400);
  assert.equal(rowBal('Dora'), 5500);
});

test('virement : expiré après 30 min, remboursé à l\'expéditeur ; faux virement dans sa propre boîte sans effet', async () => {
  reset();
  const a = await signup('Fay');
  const b = await signup('Gil');
  delete __test.memory.rows['fay'].data._srv.createdAt;
  let r = await post({ action: 'bank_send', to: 'Gil', amount: 2000 }, auth(a));
  assert.equal(rowBal('Fay'), 3500);
  // le temps passe
  __test.memory.rows['gil'].data._srv.inbox[0].timestamp -= 31 * 60000;
  __test.memory.rows['fay'].data._srv.history[0].timestamp -= 31 * 60000;
  const st = await post({ action: 'bank_state' }, auth(b));
  assert.equal(st.data.inbox.length, 0);
  assert.equal(rowBal('Fay'), 5500);
  // faux virement injecté par un tricheur dans sa propre boîte (ancienne méthode)
  await post({ username: 'Gil', avatarEmoji: '🦊', data: { pendingTransfers: [{ id: 'x', from: 'Fay', amount: 1000000, timestamp: Date.now() }] } }, auth(b));
  const st2 = await post({ action: 'bank_state' }, auth(b));
  assert.equal(st2.data.inbox.length, 0);
});

test('virement vers un joueur inconnu : compte fantôme réclamé à l\'inscription', async () => {
  reset();
  const a = await signup('Hugo');
  delete __test.memory.rows['hugo'].data._srv.createdAt;
  let r = await post({ action: 'bank_send', to: 'Futur', amount: 300 }, auth(a));
  assert.equal(r.code, 200);
  const t = await signup('Futur');
  const st = await post({ action: 'bank_state' }, auth(t));
  assert.equal(st.data.inbox.length, 1);
});
