// Génère les 5 parcours du mini golf (20 trous chacun, du plus court au plus long) et les écrit dans js/3d/golf-sim.js (COURSE_DATA).
// Chaque trou est VÉRIFIÉ : un robot le joue avec la vraie physique (celle du serveur) ; s'il n'arrive pas à le finir, le trou est refait.
// Le par de chaque trou vient du score du robot.
//   node scripts/sync-sims.mjs && node scripts/golf-gen.mjs && node scripts/sync-sims.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const GS = (await import('../api/_golfSim.js?' + Date.now())).default;
const ONLY = process.argv[2] || '';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const NAMES = {
  prairie: ['Premier pas', 'Le pré', 'Les coquelicots', 'Le petit pont', 'Le moulin', 'Coup de vent', 'La mare aux canards', 'Le chemin creux', 'Les tournesols', 'La grande boucle', 'Le ruisseau', 'Saute-mouton', 'Le verger', 'Les deux moulins', 'La colline', 'Le lavoir', 'Les champignons', 'La rivière', 'Le grand pré', 'La fête au village'],
  automne: ['Feuilles mortes', 'Le sentier', 'La souche', 'Le terrier', 'Les noisettes', 'Le ruisseau doré', 'Les écureuils', 'Le tronc couché', 'La clairière', 'Le grand chêne', 'La cascade', 'Les cèpes', 'Le sous-bois', 'La boucle des cerfs', 'Le vieux pont', 'La brume', 'Les ronces', 'La forêt profonde', 'Le grand saut', 'La forêt enchantée'],
  canyon: ['Poussière', 'Le sentier rouge', 'Les cactus', 'La crevasse', 'Le pont de corde', 'Les rochers', 'La mine', 'Le ravin', 'Le défilé', 'La grande boucle', 'Les arches', 'Le précipice', 'La tempête de sable', 'Le pont suspendu', 'Le mirage', 'La falaise', 'Le vertige', 'Le canyon interdit', 'Le grand vide', 'Le Grand Canyon'],
  neige: ['Premiers flocons', 'La piste bleue', 'Le chalet', 'La patinoire', 'Le sapin', 'La luge', 'Le glacier', 'La spirale', 'Les stalactites', 'Le lac gelé', 'La crevasse', 'Le télésiège', 'La poudreuse', 'La piste rouge', 'Le blizzard', 'La grande descente', 'La piste noire', 'L\'avalanche', 'Le sommet', 'Les neiges éternelles'],
  ile: ['Les pieds dans le sable', 'Le ponton', 'Les coquillages', 'La lagune', 'Le phare', 'La marée', 'Les palmiers', 'Le récif', 'La crique', 'Le grand plongeon', 'Les mouettes', 'L\'épave', 'La baie', 'Le saut du dauphin', 'Le coucher de soleil', 'Le banc de sable', 'La passe', 'Les vagues', 'L\'archipel', 'L\'horizon']
};
// ce que chaque carte propose (plus on avance dans le parcours, plus il y a d'éléments et plus ils sont durs)
const THEME = {
  prairie: { gap: 'water', feats: ['hill', 'climb', 'jump', 'loop', 'mill', 'bumpers', 'posts', 'sand', 'slide', 'narrow', 'gate', 'S'] },
  automne: { gap: 'water', feats: ['hill', 'climb', 'jump', 'loop', 'spinner', 'bumpers', 'logs', 'posts', 'sand', 'narrow', 'divider', 'S'] },
  canyon: { gap: 'void', feats: ['hill', 'climb', 'jump', 'loop', 'rocks', 'bridge', 'slide', 'gate', 'sand', 'narrow', 'spinner', 'S'] },
  neige: { gap: 'void', feats: ['hill', 'climb', 'jump', 'loop', 'ice', 'spiral', 'posts', 'slide', 'spinner', 'narrow', 'bumpers', 'S'] },
  ile: { gap: 'water', feats: ['hill', 'climb', 'jump', 'loop', 'bridge', 'sand', 'bumpers', 'slide', 'gate', 'rocks', 'divider', 'S'] }
};
const HARD = { jump: 1, loop: 2, bridge: 1, spiral: 1, gate: 1, slide: 1, mill: 1, spinner: 1, ice: 1, divider: 1 };

function genHole(map, i, attempt) {
  const r = rng(hash(map + ':' + i + ':' + attempt));
  const T = THEME[map], tier = Math.min(4, Math.floor(i / 4));
  const W = +(1.5 - r() * 0.15 - tier * 0.04).toFixed(2);
  const target = 7 + i * 1.55;
  const pcs = [['s', +(1.8 + r() * 1.2).toFixed(2)]];
  let len = pcs[0][1], h = 0, last = '';
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const ang = () => Math.round(55 + r() * 65), rad = () => +(1.9 + r() * 1.3).toFixed(2);
  const turn = () => { const a = ang(), rr = rad(); pcs.push([r() < 0.5 ? 'l' : 'r', a, rr]); len += a / 180 * Math.PI * rr; };
  const st = (l, dh) => { pcs.push(dh ? ['s', +l.toFixed(2), +dh.toFixed(2)] : ['s', +l.toFixed(2)]); len += l; h += dh || 0; };
  const nFeat = [1, 2, 3, 4, 5][tier] + (i % 4 === 3 ? 1 : 0);
  let pool = T.feats.filter((f) => tier >= (HARD[f] || 0) || (f === 'jump' && i >= 3));
  const used = {};
  for (let k = 0; k < nFeat; k++) {
    // entre deux éléments : un virage ou une ligne droite
    if (k > 0 || r() < 0.5) { if (r() < 0.65) turn(); else st(1.6 + r() * 1.5); }
    let f = pick(pool); let guard = 0;
    const SIG = { prairie: ['mill', 'sand'], automne: ['logs', 'spinner'], canyon: ['bridge', 'rocks'], neige: ['ice', 'spiral'], ile: ['bridge', 'sand'] }[map];
    if (k === 1 && tier >= 1) f = SIG[i % 2];
    else if (k === 0 && tier >= 2 && i % 3 !== 0) f = 'loop';
    else if (k === 0 && tier >= 1 && i % 3 === 0) f = 'jump';
    while ((f === last || (used[f] || 0) >= 2) && guard++ < 10) f = pick(pool);
    used[f] = (used[f] || 0) + 1; last = f;
    switch (f) {
      case 'S': { const a = 50 + Math.round(r() * 40), rr = rad(), d = r() < 0.5; pcs.push([d ? 'l' : 'r', a, rr], [d ? 'r' : 'l', a, rr]); len += 2 * a / 180 * Math.PI * rr; break; }
      case 'hill': st(1.5, 0.24); st(1.5, -0.24); break;
      case 'climb': { const dh = +(0.4 + r() * 0.35).toFixed(2); st(2.6, dh); st(2 + r() * 1.5); if (r() < 0.5 || h > 0.9) st(2.6, -Math.min(h, 0.4 + r() * 0.3)); break; }
      case 'jump': { const gl = +(1.0 + tier * 0.14 + r() * 0.25).toFixed(2); st(1.3, 0.24); pcs.push(['gap', gl, T.gap, -0.24 - (h > 0.4 ? 0.2 : 0)]); len += gl; h += -0.24 - (h > 0.4 ? 0.2 : 0) + 0; pcs.push(['w', W + 0.35, 0.6]); st(2.4); pcs.push(['w', W, 1.2]); st(0.8); break; }
      case 'loop': pcs.push(['w', GS.LOOP_W - 0.02, 1.8]); st(2.6); pcs.push(['loop', r() < 0.5 ? 'l' : 'r']); len += 4; st(1.6); pcs.push(['w', W, 1.4]); st(1); break;
      case 'mill': pcs.push(['w', Math.max(W, 1.5), 0.8]); st(2.2); pcs.push(['o', 'mill', { len: +(Math.max(W, 1.5) / 2 - 0.06).toFixed(2), speed: +(1.0 + r() * 0.8).toFixed(2) * (r() < 0.5 ? 1 : -1), n: 4, house: true }]); st(2.4); pcs.push(['w', W, 1]); break;
      case 'spinner': st(2.2); pcs.push(['o', 'spinner', { len: +(W / 2 - 0.08).toFixed(2), speed: +(1.3 + r() * 1.2).toFixed(2) * (r() < 0.5 ? 1 : -1), n: 2 }]); st(2.4); break;
      case 'bumpers': { st(1.2); const n = 1 + Math.floor(r() * 3); for (let q = 0; q < n; q++) pcs.push(['o', 'bump', { fw: +(0.4 + q * 0.9).toFixed(2), lat: +((r() - 0.5) * (W - 0.6)).toFixed(2), r: 0.17 }]); st(n * 0.9 + 1.2); break; }
      case 'posts': st(1.2); pcs.push(['o', 'post', { fw: 0.6, lat: +(-(W / 4)).toFixed(2), r: 0.1 }], ['o', 'post', { fw: 1.6, lat: +(W / 4).toFixed(2), r: 0.1 }]); st(2.6); break;
      case 'rocks': st(1.2); pcs.push(['o', 'rock', { fw: 0.9, lat: +((r() - 0.5) * 0.5).toFixed(2), r: 0.24 }]); st(2.6); break;
      case 'logs': st(1.2); pcs.push(['o', 'block', { fw: 0.8, lat: +(r() < 0.5 ? -W / 4 : W / 4).toFixed(2), bw: +(W / 2).toFixed(2), bd: 0.22, bh: 0.22, log: true }]); st(2.4); break;
      case 'divider': pcs.push(['w', W + 0.4, 0.8]); st(1.2); pcs.push(['o', 'block', { fw: 1.0, lat: 0, bw: 0.14, bd: 2.0, bh: 0.2 }]); st(3); pcs.push(['w', W, 1]); break;
      case 'slide': st(1.6); pcs.push(['o', 'slide', { bw: 0.42, bd: 0.32, amp: +(W / 2 - 0.3).toFixed(2), speed: +(1.1 + r() * 0.9).toFixed(2) }]); st(2.2); break;
      case 'gate': st(1.6); pcs.push(['o', 'gate', { speed: +(0.32 + r() * 0.15).toFixed(2), ph: +r().toFixed(2) }]); st(2.2); break;
      case 'sand': pcs.push(['w', W + 0.4, 0.8]); st(0.8); pcs.push(['z', 'sand', 2.2]); st(2.2); st(0.8); pcs.push(['w', W, 1]); break;
      case 'ice': pcs.push(['z', 'ice', 4.5]); st(4.5); break;
      case 'narrow': pcs.push(['w', 0.78, 1]); st(3.2); pcs.push(['w', W, 1]); st(1); break;
      case 'bridge': { const dh = 0.5; st(2.4, dh); pcs.push(['w', 0.95, 0.6]); pcs.push(['nw', 3.6, T.gap]); st(3.6); pcs.push(['w', W, 0.6]); st(1.2); st(2.4, -dh); break; }
      case 'spiral': { st(3, 1.0); const d = r() < 0.5 ? 'l' : 'r'; pcs.push([d, 200, 3.0, -1.0]); len += 200 / 180 * Math.PI * 3.0; h -= 1.0; break; }
    }
  }
  // on rallonge jusqu'à la longueur voulue, puis la ligne d'arrivée
  let guard = 0;
  while (len < target - 3 && guard++ < 8) { if (r() < 0.6) turn(); else st(1.5 + r() * 2.5); }
  if (h > 0.05) st(2.4, -h);
  st(2.8 + r() * 1.2);
  return { n: NAMES[map][i], p: 0, w: W, pcs };
}

// les morceaux du trou ne doivent pas se chevaucher, et le trou doit tenir dans une case raisonnable
function overlapOk(spec) {
  const Wk = GS.walk(spec), S = Wk.S;
  if (S.some((p) => p.h < -0.01)) return false;
  let ps = 0; S.forEach((p, k) => { if (k) ps += p.seg.skip ? 0.5 : Math.hypot(p.x - S[k - 1].x, p.z - S[k - 1].z); p.ps = ps; });   // longueur au sol (sans le tour de boucle)
  for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
    if (S[b].ps - S[a].ps < 3.2) continue;
    const d = Math.hypot(S[a].x - S[b].x, S[a].z - S[b].z);
    if (d < (S[a].w + S[b].w) / 2 + 0.9) return false;
  }
  for (const L of Wk.loops) for (const p of S) { if (Math.abs(p.s - L.s) < 9) continue; if (Math.hypot(p.x - L.x, p.z - L.z) < p.w / 2 + 1.4) return false; }
  for (const o of Wk.obs) if (o.t === 'mill' && o.house) for (const p of S) { const hx = o.x + Math.cos(o.a) * (o.w0 / 2 + 1.5), hz = o.z + Math.sin(o.a) * (o.w0 / 2 + 1.5); if (Math.hypot(p.x - hx, p.z - hz) < p.w / 2 + 0.9) return false; }
  const xs = S.map((p) => p.x), zs = S.map((p) => p.z);
  return Math.max(...xs) - Math.min(...xs) < 34 && Math.max(...zs) - Math.min(...zs) < 34;
}

// le robot : à chaque coup il essaie plusieurs cibles le long de la piste et plusieurs forces, et garde le meilleur
function progressOf(H, b) {
  let best = 1e9, bs = 0;
  for (let k = 0; k < H.S.length; k++) { const p = H.S[k]; if (Math.abs(p.h - b.y) > 0.6) continue; const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < best) { best = d; bs = p.s; } }
  return bs;
}
function pointAt(H, s) { const S = H.S; for (let k = 1; k < S.length; k++) if (S[k].s >= s) { if (S[k].seg.skip) return S[k - 1]; return S[k]; } return S[S.length - 1]; }
function simShot(H, b0, yaw, power, t0) {
  const b = { x: b0.x, y: b0.y, z: b0.z, vx: 0, vy: 0, vz: 0, air: false }, sp = Math.pow(power, 1.15) * GS.VMAX;
  b.vx = Math.sin(yaw) * sp; b.vz = -Math.cos(yaw) * sp;
  let t = t0, res = '';
  for (let k = 0; k < 60 * 25 && !res; k++) { res = GS.advance(b, H, 1 / 60, t, null); t += 1 / 60; if (!res && k > 3 && GS.atRest(b, H)) res = 'rest'; }
  return { b, res: res || 'rest', t };
}
function botPlay(H, maxShots) {
  let ball = { x: H.tee[0], z: H.tee[1], y: H.teeH }, t = 3.7, shots = 0;
  const POW = [0.16, 0.24, 0.32, 0.42, 0.52, 0.63, 0.75, 0.88, 1.0], DIST = [0.8, 1.6, 2.6, 3.8, 5.2, 7, 9.5, 13];
  while (shots < maxShots) {
    shots++;
    const p0 = progressOf(H, ball);
    let best = null;
    for (const dist of DIST) {
      let tgt = pointAt(H, p0 + dist);
      const lp = H.loops.find((L) => L.s > p0 - 0.5 && L.s < p0 + dist + 0.5);
      if (lp) tgt = { x: lp.x + lp.dx * 0.6, z: lp.z + lp.dz * 0.6 };
      if (p0 + dist >= H.len - 1) tgt = { x: H.cup[0], z: H.cup[1] };
      const yaw = Math.atan2(tgt.x - ball.x, -(tgt.z - ball.z));
      for (const yo of [0, -0.06, 0.06]) for (const pw of POW) {
        const r = simShot(H, ball, yaw + yo, pw, t);
        let score = r.res === 'cup' ? 1e6 : (r.res === 'water' || r.res === 'out') ? -1e3 : progressOf(H, r.b) - Math.abs(r.b.y - (pointAt(H, progressOf(H, r.b)).h)) * 5;
        if (r.res === 'rest' && Math.hypot(r.b.x - H.cup[0], r.b.z - H.cup[1]) < 0.6) score += 50 - Math.hypot(r.b.x - H.cup[0], r.b.z - H.cup[1]) * 30;
        if (!best || score > best.score) best = { score, r };
      }
      if (best && best.score >= 1e6) break;
    }
    t = best.r.t + 1;
    if (best.r.res === 'cup') return shots;
    if (best.r.res === 'rest') ball = { x: best.r.b.x, y: best.r.b.y, z: best.r.b.z };
  }
  return -1;
}

const DATA = {};
const P = fileURLToPath(new URL('../js/3d/golf-sim.js', import.meta.url));
const src0 = readFileSync(P, 'utf8');
const old = JSON.parse(src0.slice(src0.indexOf('/*GOLF-DATA*/') + 13, src0.indexOf('/*FIN-GOLF-DATA*/')));
for (const map of GS.MAP_IDS) {
  if (ONLY && map !== ONLY) { DATA[map] = old[map]; continue; }
  DATA[map] = [];
  for (let i = 0; i < 20; i++) {
    let ok = null, tries = 0;
    for (let attempt = 0; attempt < 400 && !ok; attempt++) {
      const spec = genHole(map, i, attempt);
      if (!overlapOk(spec)) { if (process.env.DBG) console.log('chevauche', attempt); continue; }
      tries++;
      const H = GS.buildHole(spec, 0, 0);
      const shots = botPlay(H, 8);
      if (shots < 0) { if (process.env.DBG) console.log('robot échoue', attempt, H.len.toFixed(1), spec.pcs.map(q=>q[0]).join('')); continue; }
      spec.p = Math.max(2, Math.min(7, shots + 1 + (i >= 12 ? 1 : 0)));
      ok = spec; ok._bot = shots; ok._len = H.len.toFixed(1); ok._tries = tries;
    }
    if (!ok) throw new Error('trou impossible : ' + map + ' ' + i);
    console.log(map, String(i + 1).padStart(2), ok.n.padEnd(26), 'longueur', ok._len.padStart(5), 'm · robot', ok._bot, '· par', ok.p, '·', ok.pcs.filter((q) => q[0] === 'o' || q[0] === 'loop' || q[0] === 'gap' || q[0] === 'nw' || q[0] === 'z').map((q) => q[0] === 'o' ? q[1] : q[0]).join(' '), '(essais ' + ok._tries + ')');
    delete ok._bot; delete ok._len; delete ok._tries;
    DATA[map].push(ok);
  }
}
for (const map of Object.keys(DATA)) { DATA[map].sort((a, b) => GS.buildHole(a, 0, 0).len - GS.buildHole(b, 0, 0).len); DATA[map].forEach((h, k) => { h.n = NAMES[map][k]; }); }
const json = JSON.stringify(DATA).replace(/\],\[/g, '],[');
const src = src0.slice(0, src0.indexOf('/*GOLF-DATA*/') + 13) + json + src0.slice(src0.indexOf('/*FIN-GOLF-DATA*/'));
writeFileSync(P, src);
console.log('écrit dans js/3d/golf-sim.js (' + json.length + ' octets)');
