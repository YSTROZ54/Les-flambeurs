// Test du moteur de Murder (serveur + simulation), sans réseau :  ELECTRON_RUN_AS_NODE=1 "<node>" scripts/test-murder.mjs
import assert from 'node:assert/strict';
import MS from '../api/_murderSim.js';
import { MurderRoom } from '../api/_doMurder.js';

let ok = 0; const t = (name, fn) => { try { fn(); ok++; console.log('ok   ', name); } catch (e) { console.log('ECHEC', name, '\n  ', e.message); process.exitCode = 1; } };

/* ---------- la carte ---------- */
t('les points de départ ne sont pas dans un mur ni un meuble', () => {
  for (const s of MS.MAP.spawns) for (const w of MS.MAP.solids) {
    const inside = s[0] > w.x0 - MS.RADIUS && s[0] < w.x1 + MS.RADIUS && s[1] > w.z0 - MS.RADIUS && s[1] < w.z1 + MS.RADIUS;
    assert.ok(!inside, 'départ ' + s + ' dans ' + JSON.stringify(w));
  }
});
t('aucun meuble ne traverse un mur', () => { const bad = [];
  for (const f of MS.MAP.furn) for (const w of MS.MAP.walls) {
    const ov = f.x0 < w.x1 - 0.02 && f.x1 > w.x0 + 0.02 && f.z0 < w.z1 - 0.02 && f.z1 > w.z0 + 0.02;
    if (ov) bad.push(f.t + ' (' + f.x + ',' + f.z + ')');
  }
  assert.deepEqual(bad, []);
});
t('aucun meuble ne bloque une porte', () => {
  for (const d of MS.MAP.doors) for (const f of MS.MAP.furn) {
    const m = 0.55; // zone devant et derrière la porte
    const ov = f.x0 < d.x1 + (d.axis === 'z' ? m : 0.05) && f.x1 > d.x0 - (d.axis === 'z' ? m : 0.05) && f.z0 < d.z1 + (d.axis === 'x' ? m : 0.05) && f.z1 > d.z0 - (d.axis === 'x' ? m : 0.05);
    assert.ok(!ov, f.t + ' (' + f.x + ',' + f.z + ') gêne la porte ' + d.id);
  }
});
t('on peut aller de chaque départ à chaque autre (portes ouvertes) et au jardin', () => {
  const open = MS.MAP.doors.map(() => true), cs = 0.25, W = MS.WORLD;
  const nx = Math.round((W.x1 - W.x0) / cs), nz = Math.round((W.z1 - W.z0) / cs), grid = new Uint8Array(nx * nz);
  const c = MS.newPlayer();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    c.x = W.x0 + (i + 0.5) * cs; c.z = W.z0 + (j + 0.5) * cs; const x0 = c.x, z0 = c.z;
    // libre si aucun solide ne repousse le cercle
    let free = true; for (const w of MS.MAP.solids) { const px = Math.max(w.x0, Math.min(c.x, w.x1)), pz = Math.max(w.z0, Math.min(c.z, w.z1)); if (Math.hypot(c.x - px, c.z - pz) < MS.RADIUS - 1e-6) { free = false; break; } }
    grid[i * nz + j] = free ? 1 : 0;
  }
  const idx = (x, z) => Math.floor((x - W.x0) / cs) * nz + Math.floor((z - W.z0) / cs);
  const seen = new Uint8Array(nx * nz), st = [idx(MS.MAP.spawns[0][0], MS.MAP.spawns[0][1])]; seen[st[0]] = 1;
  while (st.length) { const k = st.pop(), i = Math.floor(k / nz), j = k % nz; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, z = j + b; if (x < 0 || z < 0 || x >= nx || z >= nz) continue; const q = x * nz + z; if (grid[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
  for (const s of MS.MAP.spawns) assert.ok(seen[idx(s[0], s[1])], 'départ inaccessible ' + s);
  for (const r of MS.MAP.rooms) { if (r.id === 'jardin') continue; let any = false; for (let x = r.x0 + 0.5; x < r.x1 && !any; x += 0.25) for (let z = r.z0 + 0.5; z < r.z1; z += 0.25) if (seen[idx(x, z)]) { any = true; break; } assert.ok(any, 'pièce inaccessible : ' + r.id); }
  assert.ok(seen[idx(0, 12)] && seen[idx(18, -12)] && seen[idx(-17, 4.5)], 'jardin / cabanon inaccessibles');
});
t('une porte fermée bloque, ouverte laisse passer', () => {
  const d = MS.MAP.doors[0], c = MS.newPlayer(); c.x = d.x; c.z = d.z + 1.2; // au sud de la porte du couloir, on marche vers le nord (yaw 0)
  const open = MS.MAP.doors.map(() => false);
  for (let i = 0; i < 90; i++) MS.stepPlayer(c, { f: 1, s: 0, run: false, yaw: 0, pitch: 0 }, 1 / 30, open);
  assert.ok(c.z > d.z, 'fermée : devrait rester au sud, z=' + c.z);
  open[0] = true; for (let i = 0; i < 90; i++) MS.stepPlayer(c, { f: 1, s: 0, run: false, yaw: 0, pitch: 0 }, 1 / 30, open);
  assert.ok(c.z < d.z - 0.5, 'ouverte : devrait passer, z=' + c.z);
});
t('un tir est arrêté par un mur / une porte fermée', () => {
  const open = MS.MAP.doors.map(() => false);
  assert.ok(MS.rayWorld(0.5, 0, 0, 40, open) < 2, 'la porte fermée du bureau arrête le tir');
  open[2] = true; assert.ok(MS.rayWorld(0.5, 0, 0, 40, open) > 6, 'porte ouverte : le tir passe dans le bureau');
});

/* ---------- le serveur ---------- */
function fake() { const log = []; return { log, ws: { send: (m) => log.push(JSON.parse(m)), close() {}, addEventListener(ev, fn) { this['on' + ev] = fn; } } }; }
function mkRoom(n) {
  const room = new MurderRoom({}, {}), ps = [];
  for (let i = 0; i < n; i++) { const f = fake(); room.join(f.ws, 'u' + i, 'Joueur' + i); f.p = room.players.get('u' + i); ps.push(f); }
  clearInterval(room.timer); room.timer = null; return { room, ps };
}
const run = (room, sec) => { for (let i = 0; i < sec * 30; i++) room.step(); };
const send = (room, f, m) => room.onMessage(f.p, { data: JSON.stringify(m) });
function start(n) {
  const { room, ps } = mkRoom(n); room.tl = 0; room.step(); assert.equal(room.ph, 'intro'); run(room, MS.CFG.intro + 0.5); assert.equal(room.ph, 'play');
  const by = (r) => ps.find((f) => f.p.role === r);
  return { room, ps, m: by('m'), p: by('p'), inn: ps.filter((f) => f.p.role === 'i') };
}
const face = (a, b) => Math.atan2(b.c.x - a.c.x, -(b.c.z - a.c.z));
// met a juste devant b, dans la même pièce dégagée (le salon)
function setPos(f, x, z, yaw) { f.p.c.x = x; f.p.c.z = z; f.p.c.vx = f.p.c.vz = 0; f.p.last = { f: 0, s: 0, run: false, yaw: yaw || 0, pitch: 0 }; f.p.c.yaw = yaw || 0; }

t('le lobby attend 3 joueurs puis lance la manche : 1 meurtrier, 1 policier, le reste innocents, rôles envoyés en privé', () => {
  const { room, ps } = mkRoom(2); room.tl = 0; room.step(); assert.equal(room.ph, 'lobby', '2 joueurs : pas de manche');
  const f = fake(); room.join(f.ws, 'u2', 'J2'); clearInterval(room.timer); room.timer = null; f.p = room.players.get('u2'); ps.push(f); room.tl = 0; room.step(); assert.equal(room.ph, 'intro');
  const roles = ps.map((x) => x.p.role).sort().join(''); assert.equal(roles, 'imp');
  for (const x of ps) { const evs = x.log.filter((l) => l.e === 'role'); assert.equal(evs.length, 1); assert.equal(evs[0].r, x.p.role); }
  run(room, 0.2); const snap = ps[0].log.filter((l) => l.t === 's').pop();
  assert.ok(snap.pl.filter((q) => q.r).length === 1, 'un seul rôle visible dans un instantané (le sien)');
});
const E = Math.PI / 2;   // yaw vers l'est (+x)
t('coup de couteau : tue un innocent devant, pas derrière un mur', () => {
  const { room, m, inn } = start(4), v = inn[0];
  setPos(m, 0, 0, E); setPos(v, 1.2, 0, 0); send(room, m, { t: 'stab' });
  assert.equal(v.p.alive, false, 'touché'); assert.equal(m.p.alive, true);
  const w = inn[1]; setPos(m, 0, -0.5, 0); setPos(w, 0, -2.0, 0); run(room, 1); send(room, m, { t: 'stab' });
  assert.equal(w.p.alive, true, 'derrière un mur : épargné');
});
t('seul le meurtrier peut frapper, et pas pendant le délai', () => {
  const { room, p, inn, m } = start(5); setPos(p, -6, 0, E); setPos(inn[0], 1.2, 0, 0); send(room, p, { t: 'stab' }); assert.equal(inn[0].p.alive, true);
  setPos(m, 0, 0, E); send(room, m, { t: 'stab' }); assert.equal(inn[0].p.alive, false); setPos(inn[1], 1.2, 0, 0); send(room, m, { t: 'stab' }); assert.equal(inn[1].p.alive, true, 'délai de 0,8 s');
  run(room, 1); send(room, m, { t: 'stab' }); assert.equal(inn[1].p.alive, false);
});
t('lancer : barre de force, portée, tue en route, puis ramassage en marchant dessus', () => {
  const { room, m, inn } = start(4), v = inn[0];
  setPos(m, -10, 0, E); setPos(v, -2, 0, 0);                      // à 8 m
  send(room, m, { t: 'tc' }); run(room, 0.1); send(room, m, { t: 'tr', yaw: E });           // force minimale : portée ≈ 6,4 m, la cible à 8 m n'est pas touchée
  run(room, 1); const k = room.knife; assert.equal(k.st, 'floor'); assert.equal(v.p.alive, true);
  setPos(v, 1, 0, 0);                                              // à 11 m : hors de portée d'un lancer faible
  setPos(m, k.x, k.z, E); run(room, 0.2); assert.equal(room.knife.st, 'hand', 'ramassé en marchant dessus');
  setPos(m, -10, 0, E); send(room, m, { t: 'tc' }); run(room, 0.2); send(room, m, { t: 'tr', yaw: E }); run(room, 2);
  assert.equal(v.p.alive, true, 'force faible : n\'atteint pas 11 m'); assert.ok(room.knife.x < 0, 'tombé avant la cible : x=' + room.knife.x);
  setPos(m, room.knife.x, room.knife.z, E); run(room, 0.2); assert.equal(room.knife.st, 'hand');
  setPos(m, -10, 0, E); send(room, m, { t: 'tc' }); run(room, 1.3); send(room, m, { t: 'tr', yaw: E }); assert.equal(room.knife.st, 'air'); run(room, 1.5);
  assert.equal(v.p.alive, false, 'force max : touche à 11 m'); assert.equal(room.knife.st, 'floor');
  send(room, m, { t: 'stab' }); // plus de couteau en main : rien ne se passe, pas d'erreur
});
t('un couteau lancé est arrêté par une porte fermée', () => {
  const { room, m, inn } = start(4), v = inn[0];
  setPos(m, 0.5, -0.3, 0); setPos(v, 0.5, -4, 0);                  // la porte du bureau (x 0.5, z -1) est fermée
  send(room, m, { t: 'tc' }); run(room, 1.3); send(room, m, { t: 'tr', yaw: 0 }); run(room, 1);
  assert.equal(v.p.alive, true); assert.ok(room.knife.z > -1.1, 'le couteau reste devant la porte : z=' + room.knife.z);
});
t('le revolver : 1 balle, tue le meurtrier → les innocents gagnent ; rechargement 1,8 s', () => {
  const { room, m, p } = start(4); setPos(p, 0, 0, E); setPos(m, 6, 0, 0);
  send(room, p, { t: 'shoot', yaw: E }); assert.equal(m.p.alive, false); assert.equal(room.ph, 'results'); assert.equal(room.win, 'i');
});
t('revolver : une seule balle, rechargement obligatoire', () => {
  const { room, m, p, inn } = start(5); setPos(p, 0, 0, E); setPos(inn[0], 5, 0, 0); setPos(m, 0, 12, 0);
  send(room, p, { t: 'shoot', yaw: 0.5 }); assert.equal(p.p.ammo, 0); send(room, p, { t: 'shoot', yaw: E }); assert.equal(inn[0].p.alive, true, 'pas de 2e balle');
  send(room, p, { t: 'reload' }); run(room, 1.0); assert.equal(p.p.ammo, 0, 'pas encore rechargé'); send(room, p, { t: 'shoot', yaw: E }); assert.equal(inn[0].p.alive, true);
  run(room, 1.0); assert.equal(p.p.ammo, 1, 'rechargé après 1,8 s');
});
t('innocent tué par le policier : l\'arme tombe, interdite 15 s au tireur, ramassable par un autre', () => {
  const { room, m, p, inn } = start(4); setPos(m, 0, 12, 0); setPos(p, 0, 0, E); setPos(inn[0], 5, 0, 0); setPos(inn[1], 0, 12.5, 0);
  send(room, p, { t: 'shoot', yaw: E }); assert.equal(inn[0].p.alive, false); assert.equal(p.p.hasGun, false); assert.ok(room.gunFloor, 'arme au sol');
  run(room, 10); assert.equal(p.p.hasGun, false, 'interdit avant 15 s');
  setPos(m, 0, 0, 0); run(room, 0.2); assert.equal(m.p.hasGun, false, 'le meurtrier ne la prend jamais'); setPos(m, 0, 12, 0);
  run(room, 6); assert.equal(p.p.hasGun, true, 'après 15 s le policier la reprend');
});
t('un autre joueur ramasse l\'arme du policier mort (et la ban ne le concerne pas)', () => {
  const { room, m, p, inn } = start(4); setPos(m, 0, 0, E); setPos(p, 1.2, 0, 0); setPos(inn[0], 0, 12, 0); setPos(inn[1], 8, 0, 0);
  send(room, m, { t: 'stab' }); assert.equal(p.p.alive, false); assert.ok(room.gunFloor);
  setPos(m, -5, 0, E); setPos(inn[0], 1.2, 0, 0); run(room, 0.2); assert.equal(inn[0].p.hasGun, true); assert.equal(room.gunFloor, null);
  setPos(inn[0], 0, 0, E); setPos(m, 6, 0, 0); send(room, inn[0], { t: 'shoot', yaw: E }); assert.equal(m.p.alive, false); assert.equal(room.win, 'i');
});
t('le meurtrier gagne quand tous les autres sont morts', () => {
  const { room, m, p, inn } = start(3); setPos(m, 0, 0, E); setPos(p, 1.2, 0, 0); setPos(inn[0], -1.2, 0, 0);
  send(room, m, { t: 'stab' }); assert.equal(room.ph, 'play'); run(room, 1); m.p.c.yaw = -E; m.p.last.yaw = -E; send(room, m, { t: 'stab' });
  assert.equal(room.ph, 'results'); assert.equal(room.win, 'm');
});
t('temps écoulé → innocents ; meurtrier qui part → innocents ; fin → retour au salon avec tous vivants', () => {
  let c = start(4); c.room.tl = 0; c.room.step(); assert.equal(c.room.win, 'i'); c.room.tl = 0; c.room.step(); assert.equal(c.room.ph, 'lobby'); assert.ok([...c.room.players.values()].every((q) => q.alive && !q.hasGun));
  c = start(4); c.m.ws.onclose && c.m.ws.onclose(); assert.equal(c.room.ph, 'results'); assert.equal(c.room.win, 'i');
});
t('arrivée en cours de manche : spectateur, et vue des rôles seulement à la fin', () => {
  const c = start(3), f = fake(); c.room.join(f.ws, 'late', 'Tard'); clearInterval(c.room.timer); c.room.timer = null; const q = c.room.players.get('late'); assert.equal(q.alive, false);
  run(c.room, 0.2); assert.ok(!f.log.filter((l) => l.t === 's').pop().pl.some((x) => x.r && x.k !== 'late'));
});
t('les portes : on ouvre / ferme celle devant soi', () => {
  const { room, ps } = start(3), f = ps[0]; setPos(f, 0.5, -0.1, 0); send(room, f, { t: 'use' }); assert.equal(room.open[2], true);
  run(room, 0.5); send(room, f, { t: 'use' }); assert.equal(room.open[2], false);
});
for (const f of []) f;
console.log('\n' + ok + ' tests réussis');
setTimeout(() => process.exit(process.exitCode || 0), 50);
