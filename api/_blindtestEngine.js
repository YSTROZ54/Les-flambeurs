// Blind test : règles de réponse et tirage des images (fonctions pures, testées dans tests/blindtestEngine.test.mjs).
import { randomInt } from 'node:crypto';

// « Spider-Man 3 », « spider man » et « SPIDERMAN » donnent la même clé : casse, accents, ponctuation,
// espaces et numéros de suite sont ignorés. « Le Roi Lion » reste différent de « Roi Lion » (les mots comptent).
export function norm(s) {
  const tokens = String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const words = tokens.filter((t) => !/^\p{N}+$/u.test(t)); // « 3 », « 117 » : numéro de suite
  let key = (words.length ? words : tokens).join('');
  const noTail = key.replace(/\d+$/, ''); // « terminator2 » = « terminator »
  if (noTail) key = noTail;
  return key;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export const MIN_HINT_LEN = 4;

// { ok: true } si la réponse est exacte, sinon { ok: false, hint } avec un message sans jamais révéler la réponse
export function judge(guess, answers) {
  const g = norm(guess);
  if (!g) return { ok: false, hint: 'Écris le nom du film, du dessin animé ou de la série.' };
  const keys = answers.map(norm).filter(Boolean);
  if (keys.includes(g)) return { ok: true };
  if (g.length >= MIN_HINT_LEN) {
    let near = null;
    for (const a of keys) {
      if (a.length >= MIN_HINT_LEN && a.startsWith(g) || (g.length >= 5 && a.includes(g))) { near = near || 'missing'; continue; }
      if (g.length > a.length && a.length >= MIN_HINT_LEN && g.includes(a)) { near = near || 'extra'; continue; }
      const tol = Math.min(4, Math.max(1, Math.floor(a.length * 0.28)));
      if (Math.abs(a.length - g.length) <= tol && levenshtein(g, a) <= tol) near = 'close';
    }
    if (near === 'close') return { ok: false, hint: 'Tu n\'es pas loin ! Vérifie l\'orthographe.', near: true };
    if (near === 'missing') return { ok: false, hint: 'Tu n\'es pas loin… il te manque quelques lettres !', near: true };
    if (near === 'extra') return { ok: false, hint: 'Tu es tout près : il y a un peu trop de lettres !', near: true };
  }
  return { ok: false, hint: 'Ce n\'est pas ça.' };
}

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const CATS = ['film', 'dessin', 'serie'];
export const DIFFS = ['f', 'm', 'd'];

// choisit au hasard une image par titre parmi celles qui correspondent aux réglages
export function availableTitles(bank, cat, diff) {
  const byKey = new Map();
  for (const b of bank) {
    if (cat !== 'all' && b.cat !== cat) continue;
    if (diff !== 'all' && b.diff !== diff) continue;
    if (!byKey.has(b.key)) byKey.set(b.key, []);
    byKey.get(b.key).push(b);
  }
  return byKey;
}

export function pickRounds(bank, { cat = 'all', diff = 'all', rounds = 15 } = {}) {
  const byKey = availableTitles(bank, cat, diff);
  const keys = shuffle([...byKey.keys()]).slice(0, rounds);
  return keys.map((k) => { const list = byKey.get(k); return list[randomInt(0, list.length)].id; });
}
