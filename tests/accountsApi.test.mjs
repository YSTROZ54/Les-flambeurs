import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test';
process.env.ADMIN_PASSWORD = 'MOTDEPASSEPATRON';
const { default: handler, __test } = await import('../api/accounts.js');

function call(method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      headers: {}, code: 200,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(p) { resolve({ code: this.code, data: p }); },
      end() { resolve({ code: this.code }); }
    };
    handler({ method, query, body, headers }, res);
  });
}
const post = (body, headers, query) => call('POST', { body, headers, query });
const auth = (tok) => ({ 'x-auth-token': tok });
const reset = () => { Object.keys(__test.memory.rows).forEach((k) => delete __test.memory.rows[k]); };

async function signup(name, pw = 'secret1') {
  const r = await post({ action: 'register', username: name, password: pw, avatar: '🦊' });
  assert.equal(r.code, 200, JSON.stringify(r.data));
  return r.data.token;
}

test('inscription, connexion et mots de passe jamais renvoyés', async () => {
  reset();
  const tok = await signup('Alice');
  assert.ok(tok);
  let r = await post({ action: 'register', username: 'alice', password: 'x12' });
  assert.equal(r.code, 409);
  r = await post({ action: 'login', username: 'ALICE', password: 'faux' });
  assert.equal(r.code, 401);
  r = await post({ action: 'login', username: 'alice', password: 'secret1' });
  assert.equal(r.code, 200);
  assert.equal(r.data.row.balance, 5500);
  assert.equal(r.data.row.password, '');
  // la liste publique et la lecture directe n'exposent aucun mot de passe
  const list = await call('GET', { query: { sb: 'accounts?select=*' } });
  assert.equal(JSON.stringify(list.data).includes('scrypt'), false);
  const flat = await call('GET', {});
  assert.equal(JSON.stringify(flat.data).includes('scrypt'), false);
  assert.equal(__test.memory.rows.alice.password.startsWith('scrypt$'), true);
});

test('ancien mot de passe en clair : accepté puis converti en hash', async () => {
  reset();
  __test.memory.rows.vieux = { username: 'Vieux', password: 'abc', avatar: '🎭', balance: 100, data: {} };
  const r = await post({ action: 'login', username: 'vieux', password: 'abc' });
  assert.equal(r.code, 200);
  assert.equal(__test.memory.rows.vieux.password.startsWith('scrypt$'), true);
  const again = await post({ action: 'login', username: 'vieux', password: 'abc' });
  assert.equal(again.code, 200);
  __test.memory.rows.vide = { username: 'Vide', password: '', avatar: '🎭', balance: 5500, data: {} };
  const empty = await post({ action: 'login', username: 'vide', password: 'nimporte' });
  assert.equal(empty.code, 403); // plus de connexion sans mot de passe
});

test('écritures : jeton obligatoire, on ne modifie que son propre solde', async () => {
  reset();
  const ta = await signup('Alice');
  const tb = await signup('Bob');
  // sans jeton
  let r = await post({ username: 'Alice', balance: 999999999, data: {} }, {}, { sb: 'accounts' });
  assert.equal(r.code, 401);
  // propre compte
  r = await post({ username: 'Alice', avatar: '🐱', balance: 6000, data: { friends: ['bob'] } }, auth(ta), { sb: 'accounts' });
  assert.equal(r.code, 200);
  assert.equal(__test.memory.rows.alice.balance, 5500);   // mode strict : le navigateur ne peut plus écrire un solde
  // Bob essaie de modifier le solde et le mot de passe d'Alice
  const before = __test.memory.rows.alice.password;
  r = await post({ username: 'Alice', password: 'pirate', balance: 1, avatar: '💀', data: { pendingTransfers: [{ id: 'tx1', from: 'Bob', amount: 50 }], bannedUsers: ['alice'] } }, auth(tb), { sb: 'accounts' });
  assert.equal(r.code, 200);
  const a = __test.memory.rows.alice;
  assert.equal(a.balance, 5500);
  assert.equal(a.password, before);
  assert.equal(a.avatar, '🐱');
  assert.equal(a.data.pendingTransfers, undefined);  // la boîte aux lettres n'est plus modifiable depuis le navigateur
  assert.equal(a.data.bannedUsers, undefined);       // les bannissements, non
  // personne ne peut écrire une ligne réservée
  r = await post({ username: '__crash_game__', balance: 0, data: {} }, auth(ta), { sb: 'accounts' });
  assert.equal(r.code, 403);
  // un joueur ne peut pas bannir via son propre compte
  await post({ username: 'Bob', balance: 5500, data: { bannedUsers: ['alice'] } }, auth(tb), { sb: 'accounts' });
  assert.equal(__test.memory.rows.bob.data.bannedUsers, undefined);
});

test('suppression, mot de passe et pseudo', async () => {
  reset();
  const ta = await signup('Alice');
  const tb = await signup('Bob');
  let r = await call('DELETE', { query: { sb: 'accounts?username=eq.Alice' }, headers: auth(tb) });
  assert.equal(r.code, 403);
  r = await post({ action: 'set_password', username: 'Alice', password: 'nouveau' }, auth(tb));
  assert.equal(r.code, 403);
  r = await post({ action: 'set_password', username: 'Alice', password: 'nouveau' }, auth(ta));
  assert.equal(r.code, 200);
  r = await post({ action: 'login', username: 'alice', password: 'nouveau' });
  assert.equal(r.code, 200);
  r = await post({ action: 'rename', newName: 'Bob' }, auth(ta));
  assert.equal(r.code, 409);
  r = await post({ action: 'rename', newName: 'Alicia' }, auth(ta));
  assert.equal(r.code, 400);                          // changer de pseudo coûte 50 000 €
  __test.memory.rows.alice.balance = 60000;
  r = await post({ action: 'rename', newName: 'Alicia' }, auth(ta));
  assert.equal(r.code, 200);
  assert.equal(__test.memory.rows.alicia.balance, 10000);
  assert.ok(__test.memory.rows.alicia && !__test.memory.rows.alice);
  r = await call('DELETE', { query: { username: 'Alicia' }, headers: auth(r.data.token) });
  assert.equal(r.code, 200);
  assert.ok(!__test.memory.rows.alicia);
});

test('Patron : mot de passe vérifié côté serveur, réglages de chance globaux', async () => {
  reset();
  // le compte patron existe (créé avant, comme en production)
  __test.memory.rows.ystroz = { username: 'YSTROZ', password: __test.hashPassword('pw-patron'), avatar: '🎭', balance: 100, data: {} };
  const l = await post({ action: 'login', username: 'YSTROZ', password: 'pw-patron' });
  const t = l.data.token;
  let r = await post({ action: 'admin_login', username: 'YSTROZ', password: 'BATMAN' }, auth(t));
  assert.equal(r.code, 403); // l'ancien mot de passe public ne marche plus
  r = await post({ action: 'admin_login', username: 'YSTROZ', password: 'motdepassepatron' }, auth(t));
  assert.equal(r.code, 200);
  const at = r.data.adminToken;
  // un joueur normal ne peut pas devenir Patron
  const tb = await signup('Bob');
  r = await post({ action: 'admin_login', username: 'Bob', password: 'MOTDEPASSEPATRON' }, auth(tb));
  assert.equal(r.code, 403);
  r = await post({ action: 'set_config', luck: { slots: 95 } }, auth(tb));
  assert.equal(r.code, 403);
  r = await post({ action: 'set_config', luck: { slots: 20, crash: 999 } }, { ...auth(t), 'x-admin-token': at });
  assert.equal(r.code, 200);
  const cfg = await call('GET', { query: { config: '1' } });
  assert.equal(cfg.data.luck.slots, 20);
  assert.equal(cfg.data.luck.crash, 95);
  // le Patron peut créditer un joueur, mais pas lire de mot de passe
  r = await post({ action: 'admin_set_balance', username: 'Bob', balance: 12345 }, { ...auth(t), 'x-admin-token': at });
  assert.equal(r.code, 200);
  assert.equal(__test.memory.rows.bob.balance, 12345);
  r = await post({ action: 'admin_set_balance', username: 'Bob', balance: 1 }, auth(tb));
  assert.equal(r.code, 403);
  // le Patron fixe la liste des bannis ; un banni ne peut ni se connecter ni s'inscrire
  await post({ username: 'YSTROZ', balance: 100, data: { bannedUsers: ['bob', 'troll'] } }, { ...auth(t), 'x-admin-token': at }, { sb: 'accounts' });
  r = await post({ action: 'login', username: 'Bob', password: 'secret1' });
  assert.equal(r.code, 403);
  r = await post({ action: 'register', username: 'Troll', password: 'abc123' });
  assert.equal(r.code, 403);
  // nom du Patron réservé à l'inscription
  r = await post({ action: 'register', username: 'alex', password: 'abc123' });
  assert.equal(r.code, 403);
});

test('compte fantôme : créé pour un virement puis réclamé par inscription', async () => {
  reset();
  const ta = await signup('Alice');
  __test.memory.rows.alice.data._srv = { createdAt: Date.now() - 48 * 3600 * 1000 };
  let r = await post({ username: 'Zoe', avatar: '🎭', balance: 999999, data: {} }, auth(ta), { sb: 'accounts' });
  assert.equal(r.code, 200);
  assert.equal(__test.memory.rows.zoe.balance, 5500);   // le solde n'est pas choisi par l'expéditeur
  assert.equal(__test.memory.rows.zoe.password, '');
  r = await post({ action: 'bank_send', to: 'Zoe', amount: 200 }, auth(ta));
  assert.equal(r.code, 200, JSON.stringify(r.data));
  r = await post({ action: 'register', username: 'Zoe', password: 'zoezoe' });
  assert.equal(r.code, 200);
  assert.equal(__test.memory.rows.zoe.data._srv.inbox.length, 1); // le virement l'attend
  const zt = r.data.token;
  const bs = await post({ action: 'bank_state' }, auth(zt));
  assert.equal(bs.data.inbox.length, 1);
  assert.equal(JSON.stringify(r.data.row.data).includes('_srv'), false);
});

test('lignes réservées : toutes invisibles (cartes et points de crash secrets)', async () => {
  reset();
  __test.memory.rows.__poker_t_x = { username: '__poker_t_x', password: '', balance: 0, data: { deck: [1, 2, 3] } };
  __test.memory.rows.__crash_game__ = { username: '__crash_game__', password: 'sys', balance: 0, data: { crash: { status: 'waiting' } } };
  const list = await call('GET', { query: { sb: 'accounts?select=*' } });
  assert.equal(list.data.length, 0);
  let r = await call('GET', { query: { sb: 'accounts?username=eq.__poker_t_x' } });
  assert.deepEqual(r.data, []);
  r = await call('GET', { query: { sb: 'accounts?username=eq.__crash_game__' } });
  assert.deepEqual(r.data, []);   // le point de crash est secret : plus de lecture directe
});
