// Les trous « dessinés à la main » du Repaire du Kraken et du Volcan (style « Golf With Your Friends »).
// Le générateur (golf-gen.mjs) ne les invente pas : il vérifie seulement qu'ils sont jouables (un robot les joue) et calcule le par.
// Pièces de base : voir walk() dans js/3d/golf-sim.js. Ici, des raccourcis pour composer :
//   salles larges avec murs et portes, fosses (eau / lave), zones rondes (sable, glace, accélérateur, trampoline),
//   canons (tir en cloche jusqu'à une cible), portails, tonneaux / rochers qui roulent en travers, tentacules pendules, boucles, spirales…
// Règle : un accélérateur n'est posé que s'il sert à quelque chose (grand saut, boucle, longue montée).
const W = 1.5;
const s = (l, dh) => (dh ? ['s', +l.toFixed(2), +dh.toFixed(2)] : ['s', +l.toFixed(2)]);
const L = (a, r, dh) => (dh ? ['l', a, r, dh] : ['l', a, r]);
const R = (a, r, dh) => (dh ? ['r', a, r, dh] : ['r', a, r]);
const w = (width, t) => ['w', width, t || 0.8];
const zone = (kind, len) => [['z', kind, len], s(len)];
const gap = (len, dh = 0) => ['gap', len, 'water', dh];
// obstacles (fw = distance devant le point où on les pose, lat = vers la droite)
const post = (fw, lat) => ['o', 'post', { fw, lat, r: 0.11 }];
const rock = (fw, lat, r = 0.24) => ['o', 'rock', { fw, lat, r }];
const bump = (fw, lat) => ['o', 'bump', { fw, lat, r: 0.18 }];
const pit = (fw, lat, r = 0.5) => ['o', 'patch', { kind: 'pit', fw, lat, r }];
const sand = (fw, lat, r = 0.6) => ['o', 'patch', { kind: 'sand', fw, lat, r }];
const ice = (fw, lat, r = 0.7) => ['o', 'patch', { kind: 'ice', fw, lat, r }];
const pad = (fw, lat, r = 0.42) => ['o', 'patch', { kind: 'bounce', fw, lat, r }];
const turbo = (fw, lat, r = 0.4) => ['o', 'patch', { kind: 'boost', fw, lat, r }];
const cannon = (id, fw = 0.9) => ['o', 'cannon', { id, fw, lat: 0, r: 0.36 }];
const portal = (id, fw, lat = 0) => ['o', 'portal', { id, fw, lat, r: 0.34 }];
const exit = (id, fw, lat = 0) => ['o', 'exit', { id, fw, lat }];
const arch = (fw = 1, hgt = 2.6) => ['o', 'arch', { fw, lat: 0, hgt }];
const gate = (speed, ph) => ['o', 'gate', { speed, ph }];
const swing = (lat, ph = 0, speed = 1.0) => ['o', 'swing', { fw: 0, lat, amp: 1.25, speed, ph }];
const roller = (boulder) => (ph, speed = 1.2, bw = 0.5, amp) => ['o', 'slide', { barrel: true, boulder, bw, bd: boulder ? 0.5 : 0.55, amp: amp !== undefined ? amp : +(W / 2 - bw / 2 - 0.03).toFixed(2), speed, ph }];
const barrel = roller(false), boulder = roller(true);
// un mur en travers d'une salle, avec une porte (doorLat = milieu de la porte, doorW = sa largeur)
const wall = (fw, width, doorLat, doorW, bh = 0.26) => {
  const out = [], a0 = -width / 2, a1 = doorLat - doorW / 2, b0 = doorLat + doorW / 2, b1 = width / 2;
  if (a1 - a0 > 0.08) out.push(['o', 'block', { fw, lat: +((a0 + a1) / 2).toFixed(3), bw: +(a1 - a0).toFixed(3), bd: 0.16, bh }]);
  if (b1 - b0 > 0.08) out.push(['o', 'block', { fw, lat: +((b0 + b1) / 2).toFixed(3), bw: +(b1 - b0).toFixed(3), bd: 0.16, bh }]);
  return out;
};
const wallFull = (fw, width) => [['o', 'block', { fw, lat: 0, bw: +(width + 0.06).toFixed(2), bd: 0.2, bh: 0.7 }]];        // infranchissable (portail obligatoire)
const low = (fw, width) => [['o', 'block', { fw, lat: 0, bw: +(width + 0.06).toFixed(2), bd: 0.14, bh: 0.2 }]];            // muret : on saute par-dessus avec un trampoline
// salles : room = au milieu d'un trou, endRoom = la salle du drapeau (le trou est à 0,85 m du fond, au milieu)
const room = (width, len, ...obs) => [w(width, 0.8), s(0.8), obs, s(len), w(W, 0.8), s(0.8)];
const endRoom = (width, len, ...obs) => [w(width, 0.8), s(0.8), obs, s(len)];
const loop = (side) => [w(0.54, 1.8), s(2.6), ['loop', side], s(1.6), w(W, 1.4), s(1.0)];
const stairs = (n, rise, run = 2.0, flat = 1.3) => Array.from({ length: n }, () => [s(run, rise), s(flat)]).flat();
const cannonShot = (id, len, dh, land = 1.5) => [w(0.8, 1.0), s(1.2), cannon(id), s(1.3), gap(len, dh), exit(id, land)];
const isPiece = (q) => typeof q[0] === 'string';
const flatten = (parts) => { const out = []; (function rec(a) { a.forEach((q) => { if (isPiece(q)) out.push(q); else rec(q); }); })(parts); return out; };
// décors purement visuels (rien à heurter) : m = modèle (ou 'jaw' mâchoire de requin, 'skullgate' porte du crâne, 'beams' poutres de la cale, 'lamps' lanternes), sz = taille en mètres, rot = degrés,
// y = hauteur, anim = animation, circle = rayon d'un tour en rond, hat = chapeau de pirate, fly = vole en cercle
const deco = (m, fw, lat, sz, extra = {}) => ['o', 'deco', { fw, lat, m, sz, ...extra }];
// skin = matière de la piste et des bordures : deck (pont de bateau), purple (repaire du kraken), bone (os), hold (cale), stone (pierre), wreck (épave)
const hole = (n, skin, ...parts) => ({ n, skin, p: 0, w: W, pcs: flatten(parts) });

export const KRAKEN = [
  hole('Le ponton', 'deck', s(2.4), deco('voilier', 3, -9, 11, { rot: 80 }), deco('palmier', 1, 4.5, 4), deco('canon', 4, 3.2, 1.1, { rot: 200 }), deco('caisse', 3.6, 2.6, 0.7), arch(1.2), R(50, 2.6), s(1.2), L(50, 2.6), endRoom(3.0, 3.4, post(1.7, 0))),
  hole('Le chapeau du Kraken', 'purple', s(2.2), L(60, 2.4), deco('pieuvre', 2.5, 5.0, 5.4, { hat: true, rot: 200 }), s(1.3), swing(0.85, 0.3), s(1.8), R(60, 2.4), s(1.3), swing(0.85, 0.8), s(1.8), deco('tentacule', 3, -4, 4.4, { anim: 'Idle|Poke' }), endRoom(3.0, 3.2, bump(1.6, -0.9), bump(1.6, 0.9))),
  hole('La mâchoire du requin', 'bone', s(2.2), deco('jaw', 1.0, 0, 2.9), zone('boost', 1.2), s(1.4, 0.35), deco('requin', 1.6, 0, 3.0, { lit: 2.6, circle: 0.8, anim: 'Swimming_Normal', y: -0.4 }), deco('requin', 1.8, 0, 2.4, { lit: 2.6, circle: 0.6, anim: 'Swimming_Fast', y: -0.4, rev: true }), gap(3.2, -0.35), w(2.6, 0.5), s(3.2), w(W, 1), L(70, 2.2), s(2.2), deco('raie', 1, 5, 4, { fly: 5.5, anim: 'Swim', y: 3 })),
  hole('La boucle du tentacule', 'purple', s(2.0), deco('tentacule', 1, -3.2, 5.4, { anim: 'Idle|Poke|Attack' }), deco('tentacule', 5, 3.4, 4.6, { anim: 'Idle|Poke|Attack' }), zone('boost', 1.2), s(0.6), loop('l'), R(80, 2.2), endRoom(2.8, 2.6)),
  hole('La cale', 'hold', s(2.2), deco('beams', 0.4, 0, 6.0), barrel(0), s(2.2), R(90, 2.3), s(1.4), barrel(0.5, 1.5), s(1.6), deco('beams', -0.4, 0, 5.0), deco('caisse', 1.2, 2.3, 0.8), deco('caisse', 2.2, -2.3, 0.8), deco('canon', 3.4, -2.4, 1.1, { rot: 90 }), endRoom(3.0, 4.4, wall(1.4, 3.0, -0.9, 0.9), wall(3.0, 3.0, 0.9, 0.9))),
  hole('Le canon du capitaine', 'deck', s(2.4), L(40, 2.4), cannonShot(1, 6.5, 0.6, 1.6), deco('epave', -3.4, -5.5, 7, { rot: 20 }), deco('requin', -3.0, 0, 3.2, { lit: 2.6, circle: 1.2, anim: 'Swimming_Normal', y: -0.4 }), endRoom(3.2, 4.2)),
  hole('Le bateau fantôme', 'wreck', s(2.4), R(60, 2.4), deco('epave', 1.5, -4.8, 7.5, { rot: 100 }), deco('crane', 5, 3.5, 2.0, { fly: 0, anim: 'Flying_Idle', y: 1.8 }), w(2.6, 0.8), s(0.8), portal(1, 1.2), wallFull(2.0, 2.6), s(3.0), w(W, 0.8), s(0.8), L(90, 2.2, 0.8), s(0.8), exit(1, 0.3), s(1.6), R(200, 2.6, -0.8), s(2.4)),
  hole("La montée de l'abîme", 'stone', s(2), stairs(3, 0.45), s(0.6), deco('lanterne', 0, 4.5, 1.8, { circle: 1.4, anim: 'Swimming_Normal', y: 3.2 }), R(180, 2.6, -0.75), s(1.0), boulder(0.1, 1.3), s(1.4, -0.6), s(2.0)),
  hole('La porte du crâne', 'bone', s(2.0), deco('skullgate', 1.0, 0, 2.5), w(1.1, 0.6), s(0.6), ['nw', 5.0, 'water'], ['z', 'belt', 5.0], s(5.0), w(W, 0.6), s(0.8), R(100, 2.2), s(1.4), swing(0.85, 0.2), s(2.2), endRoom(2.8, 3.0, pit(1.2, 0.8, 0.42), pit(1.2, -0.8, 0.42))),
  hole('Le Repaire du Kraken', 'purple', s(2), arch(1.0, 3.0), zone('beltb', 2.4), s(1), L(150, 1.4), s(1.2), swing(0.85, 0.1, 1.1), s(1.8), w(2.6, 0.8), s(0.8), portal(1, 1.1), wallFull(1.9, 2.6), s(3.0), w(W, 0.8), s(0.8), R(90, 2.2, 0.6), s(0.8), exit(1, 0.3), s(1.6), cannonShot(2, 5.5, -0.6, 1.5), endRoom(4.0, 5.0, pit(3.2, -0.8, 0.42), pit(3.2, 0.8, 0.42), bump(2.2, -1.5), bump(2.2, 1.5)), deco('pieuvre', 4.2, 0, 9, { hat: true, rot: 180 })),
];
