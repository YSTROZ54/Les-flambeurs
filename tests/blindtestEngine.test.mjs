import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { norm, judge, levenshtein, pickRounds, availableTitles } from '../api/_blindtestEngine.js';
import { BANK, ANSWERS, IMG_DIR } from '../api/_blindtestData.js';

test('norm : casse, accents, tirets, ponctuation et numéros de suite sont ignorés', () => {
  assert.equal(norm('Spider-Man 3'), norm('spider man'));
  assert.equal(norm('SPIDERMAN'), norm('Spider-Man'));
  assert.equal(norm('Terminator 2'), norm('terminator'));
  assert.equal(norm('terminator2'), norm('Terminator'));
  assert.equal(norm('OSS 117'), norm('oss'));
  assert.equal(norm('Léon'), norm('LEON'));
  assert.equal(norm('WALL·E'), norm('wall-e'));
  assert.equal(norm('L\'Âge de glace'), norm('lage de glace'));
  assert.equal(norm('300'), '300');      // un titre qui n'est qu'un nombre est gardé
  assert.notEqual(norm('Se7en'), norm('Seven'));
});

test('judge : le titre complet est exigé, pas de « presque »', () => {
  const lion = ['Le Roi lion', 'The Lion King'];
  assert.equal(judge('le roi lion', lion).ok, true);
  assert.equal(judge('The Lion King', lion).ok, true);
  assert.equal(judge('Roi lion', lion).ok, false);
  assert.equal(judge('Lion', lion).ok, false);
  assert.equal(judge('', lion).ok, false);
  assert.equal(judge('Matrix 3', ['Matrix']).ok, true);
  assert.equal(judge('Seven', ['Seven', 'Se7en']).ok, true);
  assert.equal(judge('se7en', ['Seven', 'Se7en']).ok, true);
});

test('judge : messages « pas loin » sans jamais révéler la réponse', () => {
  const m = ['Matrix'];
  assert.match(judge('Matrx', m).hint, /pas loin/);
  assert.match(judge('Matri', m).hint, /manque quelques lettres/);
  assert.match(judge('Matrixx', m).hint, /pas loin|trop de lettres/);
  const far = judge('Titanic', m);
  assert.equal(far.ok, false); assert.ok(!far.near);
  const long = ['Le Seigneur des anneaux'];
  assert.match(judge('Le Seigneur des anneau', long).hint, /pas loin|manque/);
  for (const g of ['Matrx', 'Matri', 'Matrixx', 'xx', 'abc']) assert.ok(!/matrix/i.test(judge(g, m).hint));
  // une lettre ou deux ne donnent aucun indice (pas de jeu de devinettes lettre par lettre)
  assert.ok(!judge('ma', m).near);
  assert.ok(!judge('a', m).near);
});

test('levenshtein', () => {
  assert.equal(levenshtein('chat', 'chats'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('banque : chaque image a ses réponses et son fichier, sous un nom qui ne révèle rien', () => {
  assert.ok(BANK.length >= 200);
  const root = fileURLToPath(new URL('..', import.meta.url));
  const ids = new Set();
  for (const b of BANK) {
    assert.ok(!ids.has(b.id), 'id en double ' + b.id); ids.add(b.id);
    assert.match(b.id, /^[0-9a-f]{12}$/);
    assert.ok(['film', 'dessin', 'serie'].includes(b.cat), b.id);
    assert.ok(['f', 'm', 'd'].includes(b.diff), b.id);
    assert.ok(ANSWERS[b.key] && ANSWERS[b.key].length && ANSWERS[b.key].every((a) => norm(a)), 'réponses pour ' + b.key);
    assert.ok(existsSync(root + IMG_DIR + b.id + '.jpg'), 'image manquante ' + b.id);
  }
});

test('pickRounds : un seul tirage par titre, réglages respectés', () => {
  for (const cfg of [{ cat: 'all', diff: 'all', rounds: 20 }, { cat: 'film', diff: 'd', rounds: 15 }, { cat: 'dessin', diff: 'f', rounds: 18 }, { cat: 'serie', diff: 'm', rounds: 15 }]) {
    const ids = pickRounds(BANK, cfg);
    const imgs = ids.map((id) => BANK.find((b) => b.id === id));
    assert.equal(ids.length, Math.min(cfg.rounds, availableTitles(BANK, cfg.cat, cfg.diff).size));
    assert.equal(new Set(imgs.map((b) => b.key)).size, imgs.length, 'deux images du même titre');
    imgs.forEach((b) => { if (cfg.cat !== 'all') assert.equal(b.cat, cfg.cat); if (cfg.diff !== 'all') assert.equal(b.diff, cfg.diff); });
  }
  // deux tirages différents (aléatoire)
  assert.notDeepEqual(pickRounds(BANK, { rounds: 20 }), pickRounds(BANK, { rounds: 20 }));
});
