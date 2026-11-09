/* =====================================================================
   kart-sim.js — La physique, le circuit et les règles de la course (aucun dessin, aucun réseau)
   ---------------------------------------------------------------------
   Utilisé par le navigateur (kart3d.js : dessin du circuit et prédiction de ma voiture) ET par le serveur (api/_kartSim.js, copie générée par
   scripts/sync-sims.mjs) : le serveur fait avancer toutes les voitures avec ce code, à partir des touches que chaque joueur envoie.
   ===================================================================== */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
  var LAPS = 3, NCP = 8, ROAD_HALF = 8, CURB_W = 1.4, WALL_OFF = 9.9, CAR_R = 1.0;
  var GRID_MS = 20000, COUNT_MS = 3000, RACE_MS = 165000, CYC_MS = 203000;
  var VMAX = 52, ACC = 25, BRK = 38;
  var CTRL = [[0, 0], [110, 0], [190, 0], [238, -28], [250, -88], [218, -135], [160, -142], [120, -112], [88, -120], [70, -158], [20, -176], [-35, -160], [-82, -132], [-86, -82], [-122, -48], [-168, -60], [-198, -18], [-186, 36], [-130, 56], [-74, 44], [-38, 12]];


  var TRK = (function () {
    function cr(p0, p1, p2, p3, t) { var t2 = t * t, t3 = t2 * t; return [0, 1].map(function (i) { return 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3); }); }
    var n = CTRL.length, dense = [], i, j;
    for (i = 0; i < n; i++) { var a = CTRL[(i - 1 + n) % n], b = CTRL[i], c = CTRL[(i + 1) % n], d = CTRL[(i + 2) % n]; for (j = 0; j < 40; j++) dense.push(cr(a, b, c, d, j / 40)); }
    var L = 0, cum = [0]; for (i = 1; i <= dense.length; i++) { var p = dense[i - 1], q = dense[i % dense.length]; L += Math.hypot(q[0] - p[0], q[1] - p[1]); cum.push(L); }
    var DS = 2, N = Math.round(L / DS), PX = new Float32Array(N), PZ = new Float32Array(N), k = 0;
    for (i = 0; i < N; i++) { var s = i * L / N; while (cum[k + 1] < s) k++; var f = (s - cum[k]) / (cum[k + 1] - cum[k]), a2 = dense[k], b2 = dense[(k + 1) % dense.length]; PX[i] = a2[0] + (b2[0] - a2[0]) * f; PZ[i] = a2[1] + (b2[1] - a2[1]) * f; }
    var TXa = new Float32Array(N), TZa = new Float32Array(N);
    for (i = 0; i < N; i++) { var nx = PX[(i + 1) % N] - PX[(i - 1 + N) % N], nz = PZ[(i + 1) % N] - PZ[(i - 1 + N) % N], ln = Math.hypot(nx, nz); TXa[i] = nx / ln; TZa[i] = nz / ln; }
    var T = { N: N, L: L, DS: L / N, PX: PX, PZ: PZ, TX: TXa, TZ: TZa };
    var pr = { s: 0, d: 0, qx: 0, qz: 0, tx: 0, tz: 0, dist: 0 };
    T.project = function (x, z) {
      var best = 1e18, bi = 0, i2;
      for (i2 = 0; i2 < N; i2++) { var dx = PX[i2] - x, dz = PZ[i2] - z, dd = dx * dx + dz * dz; if (dd < best) { best = dd; bi = i2; } }
      var bd = 1e18, bs = 0, bq = null, sg;
      for (sg = -1; sg <= 0; sg++) {
        var ia = (bi + sg + N) % N, ib = (ia + 1) % N, ex = PX[ib] - PX[ia], ez = PZ[ib] - PZ[ia], l2 = ex * ex + ez * ez, t = ((x - PX[ia]) * ex + (z - PZ[ia]) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        var qx = PX[ia] + ex * t, qz = PZ[ia] + ez * t, d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
        if (d2 < bd) { bd = d2; bs = bi + sg + t; var ln2 = Math.sqrt(l2); bq = [qx, qz, ex / ln2, ez / ln2]; }
      }
      pr.s = ((bs % N) + N) % N; pr.qx = bq[0]; pr.qz = bq[1]; pr.tx = bq[2]; pr.tz = bq[3];
      pr.d = (x - bq[0]) * (-bq[3]) + (z - bq[1]) * bq[2];            // + : à droite du sens de la course
      pr.dist = Math.sqrt(bd); return pr;
    };
    T.at = function (s, out) {                                      // point de la piste à l'abscisse s (en points, fractionnaire, avec retour)
      s = ((s % N) + N) % N; var i1 = Math.floor(s), f = s - i1, i2 = (i1 + 1) % N;
      out.x = PX[i1] + (PX[i2] - PX[i1]) * f; out.z = PZ[i1] + (PZ[i2] - PZ[i1]) * f;
      var tx = TXa[i1] + (TXa[i2] - TXa[i1]) * f, tz = TZa[i1] + (TZa[i2] - TZa[i1]) * f, ln = Math.hypot(tx, tz); out.tx = tx / ln; out.tz = tz / ln; out.yaw = Math.atan2(out.tx, -out.tz); return out;
    };
    return T;
  })();
  var CA = [[0, 1.2], [0, -1.2]];

  function phaseInfo(t) {
    var cyc = Math.floor(t / CYC_MS), ph = t - cyc * CYC_MS, start = cyc * CYC_MS + GRID_MS + COUNT_MS;
    var p = ph < GRID_MS ? 'grid' : ph < GRID_MS + COUNT_MS ? 'count' : ph < GRID_MS + COUNT_MS + RACE_MS ? 'race' : 'results';
    return { cyc: cyc, ph: ph, p: p, raceStart: start, left: p === 'grid' ? GRID_MS - ph : p === 'count' ? GRID_MS + COUNT_MS - ph : p === 'race' ? GRID_MS + COUNT_MS + RACE_MS - ph : CYC_MS - ph };
  }
  // phase d'une course qui a commencé à l'instant cs (ms, horloge du serveur) ; cs < 0 : personne ne court, on attend (salle d'attente)
  var RES_MS = CYC_MS - GRID_MS - COUNT_MS - RACE_MS;
  function phaseAt(t, cs, cyc, cut) {                      // cut : si tous les pilotes sont arrivés, instant (ms après cs) où les résultats commencent
    if (!(cs >= 0)) return { cyc: cyc | 0, ph: 0, p: 'wait', raceStart: 0, left: 0 };
    var ph = t - cs, p = ph < GRID_MS ? 'grid' : ph < GRID_MS + COUNT_MS ? 'count' : ph < GRID_MS + COUNT_MS + RACE_MS ? 'race' : 'results';
    if (cut > 0 && ph >= cut) { return { cyc: cyc | 0, ph: ph, p: 'results', raceStart: cs + GRID_MS + COUNT_MS, left: RES_MS - (ph - cut), end: ph - cut >= RES_MS }; }
    return { cyc: cyc | 0, ph: ph, p: p, raceStart: cs + GRID_MS + COUNT_MS, left: p === 'grid' ? GRID_MS - ph : p === 'count' ? GRID_MS + COUNT_MS - ph : p === 'race' ? GRID_MS + COUNT_MS + RACE_MS - ph : CYC_MS - ph, end: ph >= CYC_MS };
  }
  function newCar() {
    return { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, st: 0, boost: 0, driftT: 0, prog: 0, lastFrac: 0, lap: 0, cp: 0, fin: 0, best: 0, lapStart: 0, spd: 0, wrong: 0, shake: 0, ev: [] };
  }
  var tmp = {};
  // pose la voiture sur la piste : s en points de piste (négatif = derrière la ligne), lat = décalage à droite (m)
  function placeAtS(c, s, lat) {
    var N = TRK.N, p = TRK.at(s, tmp); c.x = p.x - p.tz * lat; c.z = p.z + p.tx * lat; c.yaw = p.yaw; c.vx = c.vz = 0; c.st = 0; c.boost = 0; c.driftT = 0; c.spd = 0;
    var fr = (((s % N) + N) % N) / N; c.lastFrac = fr; c.prog = s < 0 ? s / N : fr; if (c.prog > 0.5 && s >= 0) c.prog = fr; c.shake = 0;
  }
  function placeOnGrid(c, slot) { var row = Math.floor(slot / 2), side = slot % 2 ? 3.6 : -3.6; placeAtS(c, -(7 + row * 7.5) / TRK.DS, side); }
  function placeAtCheckpoint(c) { var cpf = Math.max(0, Math.floor(Math.max(0, c.prog) * NCP)) / NCP; placeAtS(c, (cpf % 1) * TRK.N, 0); c.prog = cpf; }

  // un pas de simulation de la voiture c avec les touches inp = { th, br, steer, hand } ; les événements (turbo, choc, fumée) sont déposés dans c.ev pour que le navigateur les montre
  function stepCar(c, inp, dt, locked) {
    var sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), fx2 = sy, fz2 = -cy, rx2 = cy, rz2 = sy;
    var vf = c.vx * fx2 + c.vz * fz2, vl = c.vx * rx2 + c.vz * rz2;
    if (locked) { c.vx = c.vz = 0; c.spd = 0; return; }
    var maxV = VMAX * (c.boost > 0 ? 1.28 : 1), th = inp.th, br = inp.br;
    if (th > 0) vf += (ACC * (c.boost > 0 ? 1.8 : 1) * th * (1 - Math.max(0, vf) / maxV) + (vf < 0 ? BRK * th : 0)) * dt;
    if (br > 0) { if (vf > 0.6) vf -= BRK * br * dt; else vf -= ACC * 0.55 * br * (1 - (-vf) / (VMAX * 0.3)) * dt; }
    vf -= vf * 0.1 * dt + Math.sign(vf) * Math.min(Math.abs(vf), 1.4 * dt);
    c.vx = fx2 * vf + rx2 * vl; c.vz = fz2 * vf + rz2 * vl;
    c.st += (inp.steer - c.st) * Math.min(1, dt * 9);
    var sgn = vf >= 0 ? 1 : -1, grip = inp.hand ? 1.7 : 8.2, vv = Math.abs(vf);
    var yr = c.st * 2.15 / (1 + Math.pow(vv / 30, 2)) * Math.min(1, vv / 5) * sgn * (inp.hand ? 1.45 : 1);
    c.yaw += yr * dt;
    var nx = Math.sin(c.yaw), nz = -Math.cos(c.yaw), nrx = Math.cos(c.yaw), nrz = Math.sin(c.yaw);
    vf = c.vx * nx + c.vz * nz; vl = c.vx * nrx + c.vz * nrz;
    vl *= Math.exp(-grip * dt); if (inp.hand) vf -= vf * 0.12 * dt;
    c.vx = nx * vf + nrx * vl; c.vz = nz * vf + nrz * vl;
    if (inp.hand && vv > 14 && Math.abs(c.st) > 0.25) c.driftT += dt;
    else { if (c.driftT > 0.7 && !inp.hand) { c.boost = c.driftT > 1.6 ? 1.5 : 0.9; c.ev.push({ k: 'turbo' }); } if (!inp.hand) c.driftT = 0; }
    if (c.boost > 0) c.boost -= dt;
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.spd = Math.hypot(c.vx, c.vz);
    if (((inp.hand && c.spd > 10) || (Math.abs(vl) > 4.5 && c.spd > 12)) && c.ev.length < 8) c.ev.push({ k: 'smoke', x: c.x - nx * 1.6 + nrx * (c.spd % 2 < 1 ? 0.8 : -0.8), z: c.z - nz * 1.6 + nrz * (c.spd % 2 < 1 ? 0.8 : -0.8), vx: -c.vx * 0.1, vz: -c.vz * 0.1 });
    // barrière : on rebondit contre elle
    var pr = TRK.project(c.x, c.z), lim = WALL_OFF - CAR_R * 0.9;
    if (Math.abs(pr.d) > lim) {
      var sd = pr.d > 0 ? 1 : -1, rnx = -pr.tz * sd, rnz = pr.tx * sd;
      c.x = pr.qx + (-pr.tz) * sd * lim; c.z = pr.qz + pr.tx * sd * lim;
      var vn = c.vx * rnx + c.vz * rnz;
      if (vn > 0) { c.vx -= 1.35 * vn * rnx; c.vz -= 1.35 * vn * rnz; c.vx *= 0.93; c.vz *= 0.93; c.shake = Math.min(1, vn / 18); if (vn > 3 && c.ev.length < 8) c.ev.push({ k: 'wall', vn: vn, x: c.x + rnx * 0.8, z: c.z + rnz * 0.8 }); }
      var dyaw = angDiff(Math.atan2(pr.tx, -pr.tz), c.yaw); c.yaw += dyaw * Math.min(1, dt * 3);
    }
  }
  // choc entre deux voitures (chacune reçoit la moitié de l'impulsion)
  function pairCollide(a, b) {
    var d0x = b.x - a.x, d0z = b.z - a.z; if (d0x * d0x + d0z * d0z > 36) return;
    var asy = Math.sin(a.yaw), acy = Math.cos(a.yaw), bsy = Math.sin(b.yaw), bcy = Math.cos(b.yaw), sx = 0, sz = 0, ovm = 0, i, j;
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
      var ax = a.x + asy * CA[i][1], az = a.z - acy * CA[i][1], bx = b.x + bsy * CA[j][1], bz = b.z - bcy * CA[j][1], dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz);
      if (d < CAR_R * 2 && d > 1e-4) { var ov = CAR_R * 2 - d; sx += dx / d * ov; sz += dz / d * ov; ovm = Math.max(ovm, ov); }
    }
    if (ovm <= 0) return;
    var sl = Math.hypot(sx, sz) || 1, nx = sx / sl, nz = sz / sl;
    a.x += nx * ovm * 0.5; a.z += nz * ovm * 0.5; b.x -= nx * ovm * 0.5; b.z -= nz * ovm * 0.5;
    var rvx = a.vx - b.vx, rvz = a.vz - b.vz, vn = rvx * nx + rvz * nz;
    if (vn < 0) {
      a.vx -= 0.65 * vn * nx; a.vz -= 0.65 * vn * nz; b.vx += 0.65 * vn * nx; b.vz += 0.65 * vn * nz;
      a.shake = Math.max(a.shake, Math.min(0.8, -vn / 20)); b.shake = Math.max(b.shake, Math.min(0.8, -vn / 20));
      if (-vn > 3) { a.ev.push({ k: 'car', vn: -vn }); b.ev.push({ k: 'car', vn: -vn }); }
    }
  }
  // tours, points de contrôle, arrivée : met à jour c et renvoie la liste des événements { k: 'lap' | 'finish' | 'cp', ... }
  function trackProgress(c, pi, now) {
    var out = [], pr = TRK.project(c.x, c.z), frac = pr.s / TRK.N, dl = frac - c.lastFrac;
    if (dl > 0.5) dl -= 1; else if (dl < -0.5) dl += 1;
    if (Math.abs(dl) < 0.15) c.prog += dl; c.lastFrac = frac;
    var lapNow = Math.floor(c.prog), cpNow = Math.floor(c.prog * NCP);
    if (pi.p === 'race' && !c.fin) {
      if (lapNow > c.lap && lapNow >= 1) {
        var lt = now - c.lapStart; c.lap = lapNow; c.lapStart = now;
        if (!c.best || lt < c.best) c.best = Math.round(lt);
        if (lapNow < LAPS) out.push({ k: 'lap', lap: lapNow, time: Math.round(lt) });
        else { c.fin = Math.max(1, Math.round(now - pi.raceStart)); out.push({ k: 'finish', time: c.fin }); }
      }
      if (cpNow > c.cp && c.prog > 0 && cpNow % NCP !== 0) { c.cp = cpNow; out.push({ k: 'cp', cp: cpNow % NCP }); }
      else if (cpNow % NCP === 0) c.cp = cpNow;
    }
    var vt = c.vx * pr.tx + c.vz * pr.tz; c.wrong = (vt < -4 && pi.p === 'race') ? c.wrong + 1 / 60 : Math.max(0, c.wrong - 0.05);
    return out;
  }

  // pilote automatique d'un bot : b = { skill (0.8 à 0.97), lat (décalage voulu sur la piste, m), stuck }. Renvoie les touches { th, br, steer, hand }.
  var bt1 = {}, bt2 = {};
  function botInput(c, b, dt) {
    var pr = TRK.project(c.x, c.z), spd = c.spd, DSx = TRK.DS;
    var look = 8 + spd * 0.55, p1 = TRK.at(pr.s + look / DSx, bt1), lat = b.lat;
    var tx = p1.x - p1.tz * lat, tz = p1.z + p1.tx * lat, desired = Math.atan2(tx - c.x, -(tz - c.z)), err = angDiff(desired, c.yaw);
    var steer = Math.max(-1, Math.min(1, err * 2.4));
    var a0 = TRK.at(pr.s + (6 + spd * 0.3) / DSx, bt1).yaw, a1 = TRK.at(pr.s + (26 + spd * 1.1) / DSx, bt2).yaw, dh = Math.abs(angDiff(a1, a0));
    var tv = VMAX * b.skill / (1 + dh * 1.5); if (tv < 18) tv = 18; if (Math.abs(err) > 0.7) tv = Math.min(tv, 14);
    var th = spd < tv ? 1 : 0, br = spd > tv + 3 ? Math.min(1, (spd - tv) / 14) : 0;
    if (spd < 2.5) { b.stuck = (b.stuck || 0) + dt; } else b.stuck = 0;
    return { th: th, br: br, steer: steer, hand: false };
  }
  var API = { phaseAt: phaseAt, botInput: botInput, LAPS: LAPS, NCP: NCP, ROAD_HALF: ROAD_HALF, CURB_W: CURB_W, WALL_OFF: WALL_OFF, CAR_R: CAR_R, GRID_MS: GRID_MS, COUNT_MS: COUNT_MS, RACE_MS: RACE_MS, CYC_MS: CYC_MS, VMAX: VMAX, ACC: ACC, BRK: BRK, CTRL: CTRL, TRK: TRK, angDiff: angDiff, phaseInfo: phaseInfo, newCar: newCar, placeAtS: placeAtS, placeOnGrid: placeOnGrid, placeAtCheckpoint: placeAtCheckpoint, stepCar: stepCar, pairCollide: pairCollide, trackProgress: trackProgress };
  if (typeof window !== 'undefined') { window.F3D = window.F3D || {}; window.F3D.kartSim = API; }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
