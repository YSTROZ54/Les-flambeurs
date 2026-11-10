// Test du serveur de course sans réseau : crash vers le dernier checkpoint, fin anticipée (3 premiers + 15 s), qualités des voitures, 3 circuits.
// Usage : node scripts/kart-test.mjs
import { KartRoom } from '../api/_doKart.js';
import KS from '../api/_kartSim.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'OK   ' : 'ECHEC ') + msg); if (!c) fails++; };

function mkRoom(track) {
  const room = new KartRoom({}, {}); room.trackId = track; room.T = KS.TRACKS[track].trk; room.offset = 0;
  const sent = []; const ws = { send: (m) => sent.push(JSON.parse(m)), addEventListener: () => {}, close: () => {} };
  room.join(ws, 'alice', 'Alice', 'gt3r'); clearInterval(room.timer); room.timer = null;
  return { room, sent, p: room.players.get('alice') };
}
function run(room, p, fromMs, ms, inpFn) {
  let t = fromMs, seq = 0;
  for (; t < fromMs + ms; t += 1000 / 30) { const i = inpFn(t); p.queue.push({ seq: ++seq, th: i.th, br: i.br, steer: i.steer, hand: !!i.hand }); room.step(t); }
  return t;
}

for (const tr of ['nuit', 'desert', 'prairie']) {
  const { room, sent, p } = mkRoom(tr);
  const t0 = 1e6; room.startCycle(t0, true);
  ok(room.racers().length === 6, tr + ' : 6 voitures (1 pilote + 5 bots)');
  // feu vert, puis on fonce tout droit : on doit finir dans un mur, avec un crash
  let t = run(room, p, t0, 23500, () => ({ th: 0, br: 0, steer: 0 }));
  const rc0 = p.rc; let crashed = false;
  const tc = t; t = run(room, p, t, 15000, (tt) => ({ th: 1, br: 0, steer: tt - tc < 3000 ? 0 : 1 }));
  crashed = sent.some((m) => m.t === 'ev' && m.e.k === 'crash');
  ok(crashed, tr + ' : un gros choc contre un mur provoque un crash');
  ok(p.rc > rc0, tr + ' : la voiture a été replacée au checkpoint (rc ' + rc0 + ' → ' + p.rc + ')');
  // on laisse les bots finir ; on s'arrête dès que la fin anticipée est annoncée
  let guard = 0; while (!room.top3 && guard++ < 200) t = run(room, p, t, 1000, () => ({ th: 0, br: 1, steer: 0 }));
  const fins = room.racers().filter((r) => r.car.fin).length;
  ok(fins >= 3, tr + ' : au moins 3 voitures ont fini (' + fins + ')');
  ok(room.top3 && room.cut > 0, tr + ' : la fin de course est annoncée (cut=' + Math.round(room.cut) + ' ms)');
  const first = room.racers().filter((r) => r.car.fin).sort((a, b) => a.car.fin - b.car.fin);
  if (first[2]) ok(Math.abs(room.cut - (first[2].car.fin + KS.GRID_MS + KS.COUNT_MS + 15000)) < 200, tr + ' : 15 s après le 3e (' + (room.cut - first[2].car.fin - KS.GRID_MS - KS.COUNT_MS) + ' ms)');
  console.log('   temps des arrivées :', first.map((r) => (r.car.fin / 1000).toFixed(1) + ' s').join(', '));
}
// qualités
const q1 = KS.qOf('bolide'), q2 = KS.qOf('tractor');
ok(q1.v > q2.v && q1.a > q2.a && q2.g > q1.g, 'qualités : Bolide plus rapide, tracteur plus accroché');
ok(Object.keys(KS.CARQ).length === 20, '20 voitures');
console.log(fails ? fails + ' échec(s)' : 'Tout est bon');
process.exit(fails ? 1 : 0);
