import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.ACCOUNTS_STORAGE = 'memory';
process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-les-tests-1234567890';
const { default: accounts, __test } = await import('../api/accounts.js');
const { default: bt, ROOM_IDS, QUESTION_MS, REVEAL_MS, COUNTDOWN_MS, REWARD, GUESS_COOLDOWN_MS, MAX_PLAYERS, GONE_MS } = await import('../api/blindtest.js');
const { BANK, ANSWERS } = await import('../api/_blindtestData.js');

function call(handler, method, { query = {}, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { resolve({ code: this.code || 200, data: p }); }, end() { resolve({ code: this.code || 200 }); } };
    handler({ method, query, body, headers }, res);
  });
}
const acc = (body) => call(accounts, 'POST', { body });
const post = (body, tok) => call(bt, 'POST', { body, headers: tok ? { 'x-auth-token': tok } : {} });
const get = (code, tok) => call(bt, 'GET', { query: code === undefined ? {} : { code }, headers: tok ? { 'x-auth-token': tok } : {} });
const bal = (n) => __test.memory.rows[n.toLowerCase()].balance;
const room = (code) => __test.memory.rows['__bt_salon_' + code].data.bt;
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
// fait « vieillir » le dernier signe de vie d'un joueur seulement
const silence = (code, name, ms) => { room(code).players[name.toLowerCase()].seen -= ms; };
const answerOf = (code) => { const st = room(code); return ANSWERS[BANK.find((b) => b.id === st.order[st.round - 1]).key][0]; };
async function toQuestion(code, tok) { shift(code, COUNTDOWN_MS + 50); const r = await get(code, tok); assert.equal(r.data.state.phase, 'question'); return r.data.state; }
const noLeak = (state) => {
  const s = JSON.stringify(state);
  for (const k of Object.keys(ANSWERS)) for (const a of ANSWERS[k]) if (a.length > 4) assert.ok(!s.includes(a), 'fuite de la réponse « ' + a + ' »');
};
const join = (code, tok) => post({ action: 'join', code }, tok);

let T = {}; // jetons : alice, bob, carl, dave, eve, fay, gus
test.before(async () => { for (const n of ['Alice', 'Bob', 'Carl', 'Dave', 'Eve', 'Fay', 'Gus']) T[n.toLowerCase()] = await signup(n); });
beforeEach(() => { ROOM_IDS.forEach((id) => { delete __test.memory.rows['__bt_salon_' + id]; }); });

test('trois salons publics identiques, vides au départ, sans salon privé', async () => {
  const r = await get();
  assert.equal(r.code, 200);
  assert.deepEqual(r.data.rooms.map((x) => x.name), ['Salon 1', 'Salon 2', 'Salon 3']);
  r.data.rooms.forEach((x) => { assert.equal(x.players, 0); assert.equal(x.max, 6); assert.equal(x.status, 'lobby'); });
  assert.ok(r.data.counts.all.all >= 100);
  assert.equal((await post({ action: 'create' }, T.alice)).code, 400);        // plus de création de salon
  assert.equal((await join('ABCD', T.alice)).code, 400);                      // plus de code privé
  assert.equal((await join('9', T.alice)).code, 400);
  assert.equal((await get('7')).code, 404);
  assert.equal((await join('1')).code, 401);                                  // connexion obligatoire
  // les trois salons ont exactement les mêmes réglages par défaut
  const states = [];
  for (const id of ROOM_IDS) { const s = (await get(id)).data.state; states.push({ ...s, code: 0, name: 0, id: 0, serverNow: 0, updatedAt: 0 }); }
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[1], states[2]);
  assert.deepEqual(states[0].cfg, { mode: 'all', cat: 'all', diff: 'all', rounds: 15 });
});

test('entrer : le premier est chef, jouer est gratuit, 6 joueurs maximum, pas de réglage par un non-chef', async () => {
  const before = bal('alice');
  let r = await join('1', T.alice);
  assert.equal(r.code, 200, JSON.stringify(r.data));
  assert.equal(bal('alice'), before);
  assert.equal(r.data.state.hostName, 'Alice'); assert.equal(r.data.state.you.host, true);
  for (const n of ['bob', 'carl', 'dave', 'eve', 'fay']) assert.equal((await join('1', T[n])).code, 200);
  r = await join('1', T.gus);
  assert.equal(r.code, 409); assert.match(r.data.error, /complet/);
  assert.equal(room('1').host, 'alice');
  assert.equal((await post({ action: 'config', code: '1', mode: 'first' }, T.bob)).code, 403);
  r = await post({ action: 'config', code: '1', mode: 'first', cat: 'film', diff: 'd', rounds: 99 }, T.alice);
  assert.deepEqual(r.data.state.cfg, { mode: 'first', cat: 'film', diff: 'd', rounds: 20 });
  const list = (await get()).data.rooms;
  assert.equal(list[0].players, 6); assert.equal(list[1].players, 0);
  // le salon 2 n'est pas touché par les réglages du salon 1
  assert.deepEqual((await get('2')).data.state.cfg, { mode: 'all', cat: 'all', diff: 'all', rounds: 15 });
  assert.equal((await join('1', T.alice)).code, 200); // on peut revenir dans son propre salon
});

test('mode « premier » : seul le premier à trouver marque, la manche s\'arrête, 20 € versés une fois', async () => {
  await join('1', T.alice); await join('1', T.bob); await join('1', T.carl);
  await post({ action: 'config', code: '1', mode: 'first' }, T.alice);
  assert.equal((await post({ action: 'start', code: '1' }, T.bob)).code, 403); // pas le chef
  let r = await post({ action: 'start', code: '1' }, T.alice);
  assert.equal(r.code, 200);
  assert.equal(r.data.state.status, 'playing'); assert.equal(r.data.state.phase, 'countdown'); assert.equal(r.data.state.img, null);
  assert.equal((await join('1', T.dave)).code, 409);                            // la partie a commencé
  assert.equal((await post({ action: 'guess', code: '1', text: 'x' }, T.alice)).code, 409);
  const q = await toQuestion('1', T.alice);
  assert.match(q.img, /^blindtest\/img\/[0-9a-f]{12}\.jpg$/);
  noLeak(q);
  const b0 = bal('bob'), c0 = bal('carl');
  r = await post({ action: 'guess', code: '1', text: 'zzzzzz' }, T.bob);
  assert.equal(r.code, 200); assert.equal(r.data.correct, false);
  await sleep(GUESS_COOLDOWN_MS + 50);
  const good = answerOf('1');
  r = await post({ action: 'guess', code: '1', text: good.toUpperCase() }, T.bob);
  assert.equal(r.data.correct, true); assert.equal(r.data.first, true); assert.equal(r.data.reward, REWARD);
  assert.equal(bal('bob'), b0 + REWARD);
  assert.equal(r.data.state.phase, 'reveal'); assert.equal(r.data.state.answer, good);
  r = await post({ action: 'guess', code: '1', text: good }, T.carl);
  assert.equal(r.code, 409); assert.match(r.data.error, /Trop tard/);
  assert.equal(bal('carl'), c0);
  await sleep(10);
  assert.equal(bal('bob'), b0 + REWARD);
  const me = (await get('1', T.bob)).data.state.players.find((p) => p.me);
  assert.equal(me.score, 1); assert.equal(me.earned, REWARD);
  shift('1', REVEAL_MS + 50);
  r = await get('1', T.alice);
  assert.equal(r.data.state.round, 2); assert.equal(r.data.state.phase, 'question'); assert.equal(r.data.state.answer, undefined);
  noLeak(r.data.state);
});

test('mode « tous répondent » : chacun marque, fin anticipée quand tout le monde a trouvé, temps écoulé sinon', async () => {
  await join('2', T.alice); await join('2', T.bob); await join('2', T.carl);
  await post({ action: 'config', code: '2', mode: 'all', cat: 'dessin', diff: 'f' }, T.alice);
  await post({ action: 'start', code: '2' }, T.alice);
  await toQuestion('2', T.alice);
  const a0 = bal('alice'), b0 = bal('bob');
  const good = answerOf('2');
  assert.equal((await post({ action: 'guess', code: '2', text: good }, T.alice)).data.correct, true);
  let s = (await get('2', T.bob)).data.state;
  assert.equal(s.phase, 'question');
  assert.deepEqual(s.players.filter((p) => p.found).map((p) => p.name), ['Alice']);
  assert.equal((await post({ action: 'guess', code: '2', text: good }, T.alice)).code, 400);
  assert.equal((await post({ action: 'guess', code: '2', text: good }, T.bob)).data.correct, true);
  assert.equal(bal('alice'), a0 + REWARD); assert.equal(bal('bob'), b0 + REWARD);
  assert.equal((await get('2', T.carl)).data.state.phase, 'question');
  assert.equal((await post({ action: 'guess', code: '2', text: good }, T.carl)).data.correct, true);
  assert.equal((await get('2', T.carl)).data.state.phase, 'reveal');
  shift('2', REVEAL_MS + 50);
  assert.equal((await get('2', T.alice)).data.state.round, 2);
  shift('2', QUESTION_MS + 50);
  s = (await get('2', T.alice)).data.state;
  assert.equal(s.phase, 'reveal'); assert.deepEqual(s.solvedBy, []); assert.ok(s.answer);
});

test('anti-triche : délai entre deux essais, nombre d\'essais limité, hors salon = refusé', async () => {
  await join('3', T.alice); await join('3', T.bob);
  await post({ action: 'start', code: '3' }, T.alice);
  await toQuestion('3', T.alice);
  assert.equal((await post({ action: 'guess', code: '3', text: 'abcde' }, T.alice)).data.correct, false);
  assert.equal((await post({ action: 'guess', code: '3', text: 'abcdf' }, T.alice)).code, 429);
  const rewind = () => { const lg = room('3').lastGuess; Object.keys(lg).forEach((k) => { lg[k] -= 1000; }); };
  for (let i = 0; i < 20; i++) { rewind(); await post({ action: 'guess', code: '3', text: 'x' + i }, T.alice); }
  rewind();
  const g = await post({ action: 'guess', code: '3', text: 'encore' }, T.alice);
  assert.equal(g.code, 429); assert.match(g.data.error, /essais/);
  assert.equal((await post({ action: 'guess', code: '3', text: 'x' }, T.carl)).code, 403);
});

test('seul : on s\'entraîne sans gagner d\'argent', async () => {
  await join('1', T.dave);
  await post({ action: 'start', code: '1' }, T.dave);
  await toQuestion('1', T.dave);
  const b0 = bal('dave');
  const r = await post({ action: 'guess', code: '1', text: answerOf('1') }, T.dave);
  assert.equal(r.data.correct, true); assert.equal(r.data.reward, 0);
  assert.equal(bal('dave'), b0);
  assert.equal(r.data.state.players[0].score, 1);
});

test('partie complète : classement, rejouer, le chef part = nouveau chef, salon vide = remis à zéro', async () => {
  await join('1', T.alice); await join('1', T.bob);
  await post({ action: 'config', code: '1', cat: 'serie', mode: 'all' }, T.alice);
  let r = await post({ action: 'start', code: '1' }, T.alice);
  const total = Math.min(15, r.data.state.available);
  await toQuestion('1', T.alice);
  for (let i = 0; i < total; i++) {
    if (i % 2 === 0) await post({ action: 'guess', code: '1', text: answerOf('1') }, T.bob);
    shift('1', QUESTION_MS + REVEAL_MS + 100);
    await get('1', T.bob);
    r = await get('1', T.alice);
  }
  assert.equal(r.data.state.status, 'finished');
  const rk = r.data.state.players;
  assert.equal(rk[0].name, 'Bob'); assert.ok(rk[0].score > rk[1].score); assert.equal(rk[0].rank, 1);
  assert.equal((await post({ action: 'again', code: '1' }, T.bob)).code, 403);
  r = await post({ action: 'again', code: '1' }, T.alice);
  assert.equal(r.data.state.status, 'lobby'); assert.equal(r.data.state.players.every((p) => p.score === 0), true);
  await post({ action: 'leave', code: '1' }, T.alice);
  r = await get('1', T.bob);
  assert.equal(r.data.state.hostName, 'Bob');
  await post({ action: 'leave', code: '1' }, T.bob);
  const list = (await get()).data.rooms;
  assert.equal(list[0].players, 0);
  assert.deepEqual((await get('1')).data.state.cfg, { mode: 'all', cat: 'all', diff: 'all', rounds: 15 }); // salon vide : réglages par défaut
});

test('quitter : le bouton retire le joueur, en partie le salon se vide puis se remet à zéro', async () => {
  await join('2', T.alice); await join('2', T.bob);
  await post({ action: 'start', code: '2' }, T.alice);
  await toQuestion('2', T.alice);
  assert.equal((await post({ action: 'leave', code: '2' }, T.bob)).code, 200);
  let s = (await get('2', T.alice)).data.state;
  assert.equal(s.players.find((p) => p.name === 'Bob').left, true);
  assert.equal((await get()).data.rooms[1].players, 1);
  assert.equal((await post({ action: 'guess', code: '2', text: 'x' }, T.bob)).code, 403);
  await post({ action: 'leave', code: '2' }, T.alice);
  s = (await get('2', T.alice)).data.state;
  assert.equal(s.status, 'lobby'); assert.equal(s.players.length, 0);
  assert.equal((await get()).data.rooms[1].status, 'lobby');
});

test('page fermée / téléphone verrouillé : sans signe de vie, le joueur est retiré tout seul', async () => {
  // salon d'attente : le chef disparaît, un autre devient chef
  await join('3', T.alice); await join('3', T.bob);
  silence('3', 'Alice', GONE_MS + 1000);
  let s = (await get('3', T.bob)).data.state;
  assert.deepEqual(s.players.map((p) => p.name), ['Bob']); assert.equal(s.hostName, 'Bob');
  assert.equal((await get()).data.rooms[2].players, 1);
  // celui qui revient dans le salon d'attente s'y réinscrit
  assert.equal((await join('3', T.alice)).code, 200);
  // partie en cours : le joueur silencieux est marqué parti, et la manche ne l'attend plus
  await post({ action: 'start', code: '3' }, T.bob);
  await toQuestion('3', T.bob);
  silence('3', 'Alice', GONE_MS + 1000);
  s = (await get('3', T.bob)).data.state;
  assert.equal(s.players.find((p) => p.name === 'Alice').left, true);
  assert.equal((await get()).data.rooms[2].players, 1);
  assert.equal((await post({ action: 'guess', code: '3', text: answerOf('3') }, T.bob)).data.correct, true);
  assert.equal((await get('3', T.bob)).data.state.phase, 'reveal'); // Bob seul présent : fin de manche anticipée
  // il revient (la page s'est réveillée) : il est de nouveau dans la partie
  s = (await get('3', T.alice)).data.state;
  assert.equal(s.players.find((p) => p.name === 'Alice').left, false);
  // tout le monde disparaît : le salon est libre et remis à zéro
  silence('3', 'Alice', GONE_MS + 1000); silence('3', 'Bob', GONE_MS + 1000);
  assert.equal((await get()).data.rooms[2].players, 0);
  s = (await get('3')).data.state;
  assert.equal(s.status, 'lobby'); assert.equal(s.players.length, 0);
  assert.equal((await join('3', T.carl)).data.state.hostName, 'Carl');
});
