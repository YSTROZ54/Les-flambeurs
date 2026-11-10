// Vérifie un tracé de circuit : longueur, rayon de courbure minimal, distance minimale entre deux parties éloignées de la piste.
// Usage : node scripts/kart-check.mjs  (teste tous les circuits de kart-sim.js)
import KS from '../api/_kartSim.js';
for (const id of Object.keys(KS.TRACKS)) {
  const T = KS.TRACKS[id].trk, N = T.N; let minR = 1e9, minAt = 0, bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let i = 0; i < N; i++) {
    const a = (i + N - 3) % N, b = (i + 3) % N, ax = T.PX[a], az = T.PZ[a], bx = T.PX[b], bz = T.PZ[b], cx = T.PX[i], cz = T.PZ[i];
    const A = Math.hypot(bx - cx, bz - cz), B = Math.hypot(cx - ax, cz - az), C = Math.hypot(bx - ax, bz - az), ar = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
    const R = ar < 1e-6 ? 1e9 : A * B * C / (4 * ar); if (R < minR) { minR = R; minAt = i; }
    bx0 = Math.min(bx0, T.PX[i]); bx1 = Math.max(bx1, T.PX[i]); bz0 = Math.min(bz0, T.PZ[i]); bz1 = Math.max(bz1, T.PZ[i]);
  }
  let minD = 1e9, at = [0, 0];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const sep = Math.min(j - i, N - (j - i)) * T.DS; if (sep < 80) continue; const d = Math.hypot(T.PX[i] - T.PX[j], T.PZ[i] - T.PZ[j]); if (d < minD) { minD = d; at = [i, j]; } }
  console.log(id.padEnd(8), 'longueur', T.L.toFixed(0), 'm · rayon min', minR.toFixed(1), 'm (pt', minAt, ') · écart min entre 2 parties', minD.toFixed(1), 'm', at.join('/'), '· boîte', bx0.toFixed(0), bx1.toFixed(0), bz0.toFixed(0), bz1.toFixed(0));
}
