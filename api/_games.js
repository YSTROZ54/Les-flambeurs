// Logique de jeu exécutée côté serveur (le navigateur ne décide plus des résultats).
import { randomInt } from 'node:crypto';

export const SLOT_SYMS = ['🔥', '👑', '7️⃣', '💎', '🔔', '🍋', '🍒'];
export const SLOT_PAY_3 = { '🔥': 200, '👑': 100, '7️⃣': 50, '💎': 30, '🔔': 12, '🍋': 5, '🍒': 3 };
export const SLOT_PAY_2 = { '🔥': 2.5, '👑': 2.0, '7️⃣': 1.8, '💎': 1.5, '🔔': 1.1, '🍋': 0.8, '🍒': 0.4 };
export const SLOT_MAX_BET = 100000;
export const SCRATCH_PRICE = 50;

const pct = () => randomInt(0, 1000000) / 10000; // 0 <= x < 100
const pick = (arr) => arr[randomInt(0, arr.length)];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// chance : pourcentage de victoire réglé par le Patron (0-100)
export function spinSlots(bet, chance) {
  const winChance = Math.max(0, Math.min(100, Number.isFinite(chance) ? chance : 35));
  const isWin = pct() < winChance;
  let finals;
  if (!isWin) {
    const s = shuffle(SLOT_SYMS);
    finals = [s[0], s[1], s[2]];
  } else {
    const isTriplet = pct() < 4.5;
    const winPool = ['🍒', '🍒', '🍒', '🍋', '🍋', '🍋', '🔔', '🔔', '💎', '7️⃣', '👑', '🔥'];
    const winSym = pick(winPool);
    if (isTriplet) finals = [winSym, winSym, winSym];
    else {
      const third = pick(SLOT_SYMS.filter((s) => s !== winSym));
      finals = [winSym, winSym, winSym];
      finals[randomInt(0, 3)] = third;
    }
  }
  let mult = 0;
  if (finals[0] === finals[1] && finals[1] === finals[2]) mult = SLOT_PAY_3[finals[0]] || 5;
  else if (finals[0] === finals[1] || finals[1] === finals[2] || finals[0] === finals[2]) {
    const pairSym = (finals[0] === finals[1] || finals[0] === finals[2]) ? finals[0] : finals[1];
    mult = SLOT_PAY_2[pairSym] || 0;
  }
  return { finals, mult, win: Math.round(bet * mult) };
}

export function drawScratch(chance) {
  const winChance = Math.max(0, Math.min(100, Number.isFinite(chance) ? chance : 35));
  if (!(pct() < winChance)) return 0;
  const roll = pct();
  if (roll < 90.02) return 100;
  if (roll < 97.02) return 200;
  if (roll < 99.02) return 500;
  if (roll < 99.77) return 1000;
  if (roll < 99.97) return 5000;
  return 20000;
}
