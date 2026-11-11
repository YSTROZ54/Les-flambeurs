// Les 20 trous « dessinés à la main » du Repaire du Kraken (le générateur ne les invente pas : il vérifie seulement qu'ils sont jouables
// et calcule le par avec le robot). Style « Golf With Your Friends » : tapis roulants, accélérateurs, trampolines au-dessus de l'eau,
// tentacules pendules, tonneaux qui roulent en travers, passerelles, spirales, boucles, épingles à cheveux.
// Pièces : voir walk() dans js/3d/golf-sim.js. Un tapis / accélérateur / trampoline = ['z', type, longueur] suivi d'une ligne droite de même longueur.
const W = 1.5;
const s = (l, dh) => (dh ? ['s', +l.toFixed(2), +dh.toFixed(2)] : ['s', +l.toFixed(2)]);
const L = (a, r, dh) => (dh ? ['l', a, r, dh] : ['l', a, r]);
const R = (a, r, dh) => (dh ? ['r', a, r, dh] : ['r', a, r]);
const w = (width, t) => ['w', width, t || 0.8];
const zone = (kind, len) => [['z', kind, len], s(len)];                       // zone spéciale + la piste qui la porte
const hump = (h = 0.3) => [s(1.6, h), s(1.4, -h)];
const jump = (gl, kind = 'water') => [s(1.3, 0.24), ['gap', gl, kind, -0.24], w(W + 0.35, 0.6), s(2.4), w(W, 1.2), s(0.8)];
const pad = (gl) => [['gap', gl, 'water', 0], w(W + 0.4, 0.6), s(2.4), w(W, 1.2), s(0.8)];     // saut depuis un trampoline (sans rampe)
const swing = (lat, ph = 0, speed = 1.0) => ['o', 'swing', { fw: 0, lat, amp: 1.25, speed, ph }];
const barrel = (ph, speed = 1.2, bw = 0.5) => ['o', 'slide', { barrel: true, bw, bd: 0.55, amp: +(W / 2 - bw / 2 - 0.03).toFixed(2), speed, ph }];
const loop = (side) => [w(0.54, 1.8), s(2.6), ['loop', side], s(1.6), w(W, 1.4), s(1.0)];
const spiral = (side, up) => [s(3.0, up), [side, 200, 2.8, -up], s(2.2)];
const gate = (speed, ph) => ['o', 'gate', { speed, ph }];
const bump = (fw, lat) => ['o', 'bump', { fw, lat, r: 0.17 }];
const post = (fw, lat) => ['o', 'post', { fw, lat, r: 0.1 }];
const flat = (a) => a.flat();
const hole = (n, ...parts) => ({ n, p: 0, w: W, pcs: flat(parts.map((q) => (Array.isArray(q[0]) ? q : [q]))) });

export const KRAKEN = [
  hole('Le ponton', s(2.6), R(60, 2.4), s(1.6), L(120, 2.0), s(2.4)),
  hole('Sous les voiles', s(2), hump(0.3), L(100, 2.0), s(1.6), R(100, 2.0), s(1.4), hump(0.3), s(2)),
  hole('Le tremplin', s(2.4), zone('boost', 1.4), s(1.0), jump(1.3), R(70, 2.2), s(2.4)),
  hole('Les tonneaux', s(2.2), barrel(0), s(2.4), R(90, 2.3), s(1.8), barrel(0.5, 1.5), s(2.4), L(60, 2.3), s(2.4)),
  hole('Le trampoline', s(2.4), zone('bounce', 1.0), pad(1.8), L(80, 2.0), s(2.6)),
  hole('La planche', s(2), s(2.4, 0.5), w(0.95, 0.6), ['nw', 3.6, 'water'], s(3.6), w(W, 0.6), s(1.2), s(2.4, -0.5), L(70, 2.2), s(2.4)),
  hole('Le grand huit', s(2.2), R(70, 2.4), loop('l'), L(90, 2.3), s(1.8), R(60, 2.3), s(2.2)),
  hole('Le tapis à l\'envers', s(2.0), zone('beltb', 3.0), s(1.0), R(80, 2.4), s(2.2), L(70, 2.4), s(2.4)),
  hole('Le hamac', s(2.2), spiral('l', 0.9), R(70, 2.2), s(2.4)),
  hole('La tentacule', s(2.2), swing(0.85), s(2.6), R(100, 2.4), s(2.0), swing(-0.85, 0.5), s(2.4), L(60, 2.4), s(2.2)),
  hole('Le pont-levis', s(2), gate(0.38, 0.1), s(2.0), hump(0.3), L(90, 2.2), s(1.8), gate(0.4, 0.55), s(2.4), R(60, 2.2), s(2.2)),
  hole('La cale', s(2.0), L(160, 1.3), s(3.2), R(160, 1.3), s(2.0), swing(0.85, 0.3), s(1.4), L(160, 1.3), s(3.2), R(160, 1.3), s(2.6)),
  hole('Les canons', s(2.0), zone('boost', 1.4), s(1.0), bump(0.4, 0.3), bump(1.4, -0.3), bump(2.4, 0.2), s(3.6), R(80, 2.2), s(2.0), zone('boost', 1.4), jump(1.4), L(60, 2.2), s(1.6), loop('r'), L(80, 2.2), s(2.4)),
  hole('Le maelström', s(2.2), spiral('r', 1.0), s(1.0), spiral('l', 0.9), R(60, 2.2), s(2.4)),
  hole('Les récifs', s(2.0), w(2.6, 0.8), s(1.2), post(0.5, -0.8), post(1.6, 0.8), post(2.7, -0.8), post(3.8, 0.8), s(4.4), [['z', 'sand', 2.0], s(2.0)], w(W, 1.0), s(1.0), L(100, 2.2), s(2.4), R(100, 2.2), s(2.0), barrel(0.4, 1.4), s(2.4)),
  hole('L\'abordage', s(2.2), zone('bounce', 1.0), pad(1.7), zone('bounce', 1.0), pad(1.9), L(160, 1.4), s(2.0), barrel(0.1, 1.5, 0.55), s(2.0), R(160, 1.4), s(2.0), swing(0.85, 0.6), s(2.4)),
  hole('Le bateau fantôme', s(2.0), zone('belt', 3.4), s(1.0), swing(0.85, 0.2), s(2.4), R(90, 2.3), s(1.8), barrel(0.2, 1.4, 0.55), s(2.2), L(160, 1.4), s(2.4), zone('boost', 1.4), s(1.0), R(160, 1.4), s(2.4)),
  hole('L\'œil du kraken', s(2.0), zone('boost', 1.4), s(1.0), loop('r'), swing(-0.85, 0.3, 1.2), s(2.0), L(100, 2.2), s(1.4), hump(0.3), R(70, 2.2), spiral('l', 0.9), s(1.6)),
  hole('La gueule du monstre', s(2.0), s(3.4, 1.0), s(1.6), swing(0.85, 0.0), s(1.2), [['z', 'boost', 1.6], s(1.6, -0.4)], s(3.0, -0.6), R(120, 2.0), s(1.4), barrel(0.3, 1.3), s(2.2), L(160, 1.3), s(2.4), zone('beltb', 2.4), s(1.0), R(160, 1.3), s(2.6), swing(-0.85, 0.7, 1.2), s(2.4)),
  hole('Le Repaire du Kraken', s(2.0), zone('beltb', 2.6), s(1.0), L(150, 1.4), s(2.8), swing(0.85, 0.1, 1.1), s(2.0), R(150, 1.4), zone('bounce', 1.0), pad(1.8), s(1.0), swing(0.85, 0.2), s(1.6), barrel(0.6, 1.6, 0.55), s(2.0), spiral('r', 0.9), s(1.6)),
];
