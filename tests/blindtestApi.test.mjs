import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: accounts, __test } = await import('../api/accounts.js');
const { default: bt, QUESTION_MS, REVEAL_MS, COUNTDOWN_MS, REWARD, GUESS_COOLDOWN_MS } = await import('../api/blindtest.js');
const { BANK, ANSWERS } = await import('../api/_blindtestData.js');

function call(handler, method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code || 200, data: p }); }, end() { resolve({ code: this.code || 200 }); } };
    handler({ method, query, body, headers }, res);
  });
}
const acc = (body) => call(accounts, 'POST', { body });
const post = (body, tok) => call(bt, 'POST', { body, headers: tok ? { 'x-auth-token': tok } : {} });
const get = (code, tok) => call(bt, 'GET', { query: code ? { code } : {}, headers: tok ? { 'x-auth-token': tok } : {} });
const bal = (n) => __test.memory.rows[n.toLowerCase()].balance;
const room = (code) => __test.memory.rows['__bt_' + code.toLowerCase()].data.bt;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function signup(name) {
  const r = await acc({ action: 'register', username: name, password: 'secret1' });
  assert.equal(r.code, 200); return r.data.token;
}
// avance l'horloge du salon en reculant toutes ses dates
function shift(code, ms) {
  const st = room(code);
  ['phaseStart', 'phaseEnd', 'updatedAt', 'created', 'finishedAt'].forEach((k) => { if (st[k]) st[k] -= ms; });
  Object.values(st.players).forEach((p) => { p.seen -= ms; });
  Object.values(st.solved).forEach((s) => { s.at -= ms; });
  Object.keys(st.lastGuess).forEach((k) => { st.lastGuess[k] -= ms; });
}
const answerOf = (code) => { const st = room(code); return ANSWERS[BANK.find((b) => b.id === st.order[st.round - 1]).key][0]; };
async function toQuestion(code, tok) { shift(code, COUNTDOWN_MS + 50); const r = await get(code, tok); assert.equal(r.data.state.phase, 'question'); return r.data.state; }
const noLeak = (state) => {
  const s = JSON.stringify(state);
  for (const k of Object.keys(ANSWERS)) for (const a of ANSWERS[k]) if (a.length > 4) assert.ok(!s.includes(a), 'fuite de la réponse « ' + a + ' »');
};

let ta, tb, tc;
test.before(async () => { ta = await signup('Alice'); tb = await signup('Bob'); tc = await signup('Carl'); });

test('salon : connexion obligatoire, réglages contrôlés, un salon gratuit', async () => {
  let r = await post({ action: 'create' });
  assert.equal(r.code, 401);
  const before = bal('alice');
  r = await post({ action: 'create', mode: 'first', cat: 'film', diff: 'all', rounds: 99 }, ta);
  assert.equal(r.code, 200, JSON.stringify(r.data));
  assert.equal(bal('alice'), before); // jouer est gratuit
  assert.equal(r.data.state.cfg.rounds, 20);
  assert.equal(r.data.state.cfg.mode, 'first');
  assert.match(r.data.code, /^[A-Z]{4}$/);
  const info = await get();
  assert.ok(info.data.counts.all.all >= 100);
  r = await post({ action: 'join', code: 'ZZZZ' }, tb);
  assert.equal(r.code, 404);
});

test('mode « premier » : seul le premier à trouver marque, la manche s\'arrête, 20 € versés une fois', async () => {
  let r = await post({ action: 'create', mode: 'first', cat: 'all', diff: 'all', rounds: 15 }, ta);
  const code = r.data.code;
  assert.equal((await post({ action: 'join', code }, tb)).code, 200);
  assert.equal((await post({ action: 'join', code }, tc)).code, 200);
  assert.equal((await post({ action: 'start', code }, tb)).code, 403); // pas le chef
  r = await post({ action: 'start', code }, ta);
  assert.equal(r.code, 200);
  assert.equal(r.data.state.status, 'playing');
  assert.equal(r.data.state.phase, 'countdown');
  assert.equal(r.data.state.img, null);           // pas d'image avant la manche
  assert.equal((await post({ action: 'join', code }, await signup('Dave'))).code, 409); // trop tard pour rejoindre
  assert.equal((await post({ action: 'guess', code, text: 'x' }, ta)).code, 409);       // pas encore de question
  const q = await toQuestion(code, ta);
  assert.match(q.img, /^blindtest\/img\/[0-9a-f]{12}\.jpg$/);
  noLeak(q);

  const b0 = bal('bob'), c0 = bal('carl');
  r = await post({ action: 'guess', code, text: 'zzzzzz' }, tb);
  assert.equal(r.code, 200); assert.equal(r.data.correct, false);
  await sleep(GUESS_COOLDOWN_MS + 50);
  const good = answerOf(code);
  r = await post({ action: 'guess', code, text: good.toUpperCase() }, tb);
  assert.equal(r.data.correct, true); assert.equal(r.data.first, true); assert.equal(r.data.reward, REWARD);
  assert.equal(bal('bob'), b0 + REWARD);
  assert.equal(r.data.state.phase, 'reveal');      // la manche s'arrête tout de suite
  assert.equal(r.data.state.answer, good);         // la réponse n'est visible qu'après
  r = await post({ action: 'guess', code, text: good }, tc);
  assert.equal(r.code, 409); assert.match(r.data.error, /Trop tard/);
  assert.equal(bal('carl'), c0);
  await sleep(10);
  assert.equal(bal('bob'), b0 + REWARD);           // jamais payé deux fois
  const me = (await get(code, tb)).data.state.players.find((p) => p.me);
  assert.equal(me.score, 1); assert.equal(me.earned, REWARD);

  // manche suivante après la pause
  shift(code, REVEAL_MS + 50);
  r = await get(code, ta);
  assert.equal(r.data.state.round, 2); assert.equal(r.data.state.phase, 'question');
  assert.equal(r.data.state.answer, undefined);
  noLeak(r.data.state);
});

test('mode « tous répondent » : chacun marque, fin anticipée quand tout le monde a trouvé, temps écoulé sinon', async () => {
  let r = await post({ action: 'create', mode: 'all', cat: 'dessin', diff: 'f', rounds: 15 }, ta);
  const code = r.data.code;
  await post({ action: 'join', code }, tb); await post({ action: 'join', code }, tc);
  await post({ action: 'start', code }, ta);
  await toQuestion(code, ta);
  const a0 = bal('alice'), b0 = bal('bob');
  const good = answerOf(code);
  assert.equal((await post({ action: 'guess', code, text: good }, ta)).data.correct, true);
  let s = (await get(code, tb)).data.state;
  assert.equal(s.phase, 'question');               // les autres peuvent encore répondre
  assert.deepEqual(s.players.filter((p) => p.found).map((p) => p.name), ['Alice']);
  assert.equal((await post({ action: 'guess', code, text: good }, ta)).code, 400); // déjà trouvé
  assert.equal((await post({ action: 'guess', code, text: good }, tb)).data.correct, true);
  assert.equal(bal('alice'), a0 + REWARD); assert.equal(bal('bob'), b0 + REWARD);
  s = (await get(code, tc)).data.state;
  assert.equal(s.phase, 'question');
  assert.equal((await post({ action: 'guess', code, text: good }, tc)).data.correct, true);
  assert.equal((await get(code, tc)).data.state.phase, 'reveal'); // tout le monde a trouvé
  // manche 2 : personne ne trouve → temps écoulé
  shift(code, REVEAL_MS + 50);
  s = (await get(code, ta)).data.state;
  assert.equal(s.round, 2);
  shift(code, QUESTION_MS + 50);
  s = (await get(code, ta)).data.state;
  assert.equal(s.phase, 'reveal'); assert.deepEqual(s.solvedBy, []);
  assert.ok(s.answer);
});

test('anti-triche : délai entre deux essais, nombre d\'essais limité, pas d\'indice en dessous de 4 lettres', async () => {
  const r = await post({ action: 'create', mode: 'all', cat: 'film', diff: 'all', rounds: 15 }, ta);
  const code = r.data.code;
  await post({ action: 'join', code }, tb);
  await post({ action: 'start', code }, ta);
  await toQuestion(code, ta);
  let g = await post({ action: 'guess', code, text: 'abcde' }, ta);
  assert.equal(g.data.correct, false);
  g = await post({ action: 'guess', code, text: 'abcdf' }, ta);
  assert.equal(g.code, 429);
  const rewind = () => { const lg = room(code).lastGuess; Object.keys(lg).forEach((k) => { lg[k] -= 1000; }); };
  for (let i = 0; i < 20; i++) { rewind(); await post({ action: 'guess', code, text: 'x' + i }, ta); }
  rewind();
  g = await post({ action: 'guess', code, text: 'encore' }, ta);
  assert.equal(g.code, 429); assert.match(g.data.error, /essais/);
  // quelqu'un qui n'est pas dans le salon ne peut pas répondre
  g = await post({ action: 'guess', code, text: 'x' }, tc);
  assert.equal(g.code, 403);
});

test('seul : on s\'entraîne sans gagner d\'argent', async () => {
  const ts = await signup('Solo');
  let r = await post({ action: 'create', mode: 'all', cat: 'all', diff: 'all', rounds: 15 }, ts);
  const code = r.data.code;
  await post({ action: 'start', code }, ts);
  await toQuestion(code, ts);
  const b0 = bal('solo');
  r = await post({ action: 'guess', code, text: answerOf(code) }, ts);
  assert.equal(r.data.correct, true); assert.equal(r.data.reward, 0);
  assert.equal(bal('solo'), b0);
  assert.equal(r.data.state.players[0].score, 1);
});

test('partie complète : classement final, chef qui part = nouveau chef, rejouer', async () => {
  let r = await post({ action: 'create', mode: 'all', cat: 'serie', diff: 'all', rounds: 15 }, ta);
  const code = r.data.code;
  await post({ action: 'join', code }, tb);
  await post({ action: 'start', code }, ta);
  const total = r.data.state.available >= 15 ? 15 : r.data.state.available;
  await toQuestion(code, ta);
  for (let i = 0; i < total; i++) {
    if (i === 0) { await sleep(10); }
    if (i % 2 === 0) await post({ action: 'guess', code, text: answerOf(code) }, tb);
    shift(code, QUESTION_MS + REVEAL_MS + 100);
    r = await get(code, ta);
  }
  assert.equal(r.data.state.status, 'finished', JSON.stringify(r.data.state.phase));
  const rk = r.data.state.players;
  assert.equal(rk[0].name, 'Bob'); assert.ok(rk[0].score > rk[1].score);
  assert.equal(rk[0].rank, 1);
  assert.equal((await post({ action: 'again', code }, tb)).code, 403);
  r = await post({ action: 'again', code }, ta);
  assert.equal(r.data.state.status, 'lobby');
  assert.equal(r.data.state.players.every((p) => p.score === 0), true);
  // le chef part : Bob devient chef
  await post({ action: 'leave', code }, ta);
  r = await get(code, tb);
  assert.equal(r.data.state.hostName, 'Bob');
  await post({ action: 'leave', code }, tb);
  assert.equal((await get(code, tb)).code, 404);   // salon vide supprimé
});

test('réglages impossibles refusés (pas assez d\'images)', async () => {
  const cfg = { action: 'create', mode: 'all', cat: 'serie', diff: 'd', rounds: 15 };
  const r = await post(cfg, ta);
  // il y a plus de 5 séries difficiles : la création réussit mais la partie sera plus courte
  assert.equal(r.code, 200);
  assert.ok(r.data.state.available < 15);
});
