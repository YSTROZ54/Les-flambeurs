// FICHIER GÉNÉRÉ par scripts/sync-sims.mjs à partir de js/3d/golf-sim.js : ne pas modifier à la main.
const SIM = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  function yawFor(dx, dz) { return Math.atan2(dx, -dz); }
  var R = 0.075, CUP = 0.13, VMAX = 9.5, GRAV = 9.8, MAXSHOTS = 10, WAIT_S = 60, WALL_H = 0.16;
  /* ------------------------------------------------------------------
     LES PARCOURS. Un trou = un couloir (pts : [x, z, hauteur]) de largeur w ; gaps = numéros des tronçons sans sol (le vide ou l'eau) ;
     obs = obstacles : post (poteau), bump (bumper qui renvoie fort), mill (tourniquet), slide (bloc qui va et vient), block (bloc fixe).
     ox, oz : où le trou est posé dans la salle. Le départ est au début du couloir, le trou à la fin.
     ------------------------------------------------------------------ */
  var COURSES = {
    golfjardin: {
      title: '🌳 LE JARDIN', name: 'Le Jardin', style: 'jardin', sub: 'PARCOURS EN PLEIN AIR',
      holes: [
        { name: 'Premier pas', par: 2, ox: -10, oz: 6, pts: [[0, 0, 0], [0, -2.5, 0], [0, -4, 0.25], [0, -7.5, 0.25]] },
        { name: 'Le virage', par: 3, ox: 0, oz: 6, pts: [[0, 0, 0], [0, -6, 0], [4.5, -6, 0]], obs: [{ t: 'bump', x: -0.38, z: -6.38, r: 0.22 }, { t: 'post', x: 2.2, z: -6.25, r: 0.12 }] },
        { name: 'Le plateau', par: 3, ox: 10, oz: 6, pts: [[0, 0, 0], [0, -3, 0], [0, -5.5, 0.6], [0, -9, 0.6]], obs: [{ t: 'post', x: -0.35, z: -7.2, r: 0.12 }, { t: 'post', x: 0.35, z: -7.2, r: 0.12 }] },
        { name: 'Le moulin', par: 3, ox: -10, oz: -10, w: 1.6, pts: [[0, 0, 0], [0, -10, 0]], obs: [{ t: 'mill', x: 0, z: -5, len: 0.74, speed: 1.3, n: 4, house: true }] },
        { name: 'Le saut de l\'étang', par: 3, ox: 0, oz: -10, pts: [[0, 0, 0], [0, -3, 0], [0, -4.6, 0.45], [0, -6.1, 0], [0, -10, 0]], gaps: [2], water: true },
        { name: 'Le zigzag', par: 4, ox: 9, oz: -10, pts: [[0, 0, 0], [0, -4, 0], [3, -4, 0], [3, -8, 0], [0, -8, 0], [0, -11, 0]], obs: [{ t: 'slide', x: 3, z: -6, w: 0.5, d: 0.3, ax: 'x', amp: 0.5, speed: 1.4 }, { t: 'post', x: 0.4, z: -9.6, r: 0.12 }] }
      ]
    },
    golfneon: {
      title: '🌌 NÉON', name: 'Néon', style: 'neon', sub: 'PARCOURS EN LUMIÈRE NOIRE',
      holes: [
        { name: 'Lueur', par: 2, ox: -10, oz: 6, pts: [[0, 0, 0], [0, -8, 0]], w: 1.7, obs: [{ t: 'bump', x: 0, z: -4.2, r: 0.2 }, { t: 'bump', x: -0.45, z: -5.2, r: 0.18 }, { t: 'bump', x: 0.45, z: -5.2, r: 0.18 }] },
        { name: 'Le S', par: 3, ox: 0, oz: 6, pts: [[0, 0, 0], [0, -3, 0], [2.5, -5, 0], [2.5, -8, 0], [0, -10, 0], [0, -12, 0]] },
        { name: 'Le flipper', par: 3, ox: 10, oz: 6, w: 3.2, pts: [[0, 0, 0], [0, -9, 0]], obs: [{ t: 'bump', x: -0.8, z: -3, r: 0.22 }, { t: 'bump', x: 0.8, z: -3, r: 0.22 }, { t: 'bump', x: 0, z: -4.6, r: 0.26 }, { t: 'bump', x: -1.0, z: -6.2, r: 0.2 }, { t: 'bump', x: 1.0, z: -6.2, r: 0.2 }, { t: 'block', x: 0, z: -7.4, w: 1.4, d: 0.12 }] },
        { name: 'Tourniquets', par: 3, ox: -10, oz: -10, w: 1.6, pts: [[0, 0, 0], [0, -11, 0]], obs: [{ t: 'mill', x: 0, z: -3.6, len: 0.74, speed: 1.6, n: 3 }, { t: 'mill', x: 0, z: -7.6, len: 0.74, speed: -2.0, n: 4 }] },
        { name: 'La rampe cosmique', par: 3, ox: 0, oz: -10, pts: [[0, 0, 0], [0, -2, 0], [0, -4.5, 0.7], [0, -6.5, 0.7], [3, -6.5, 0.7], [3, -9, 0], [3, -11, 0]] },
        { name: 'Le grand final', par: 4, ox: 10, oz: -10, pts: [[0, 0, 0], [0, -3, 0], [0, -4.5, 0.4], [0, -6, 0], [0, -9, 0], [-3, -9, 0], [-3, -12, 0]], gaps: [2], obs: [{ t: 'slide', x: -1.5, z: -9, w: 0.3, d: 0.5, ax: 'z', amp: 0.5, speed: 1.8 }, { t: 'bump', x: -3.4, z: -10.6, r: 0.18 }] }
      ]
    }
  };

  /* ------------------------------------------------------------------ géométrie d'un trou (sol, bordures, obstacles) ------------------------------------------------------------------ */
  function buildHoleData(spec) {
    var ox = spec.ox, oz = spec.oz, w = spec.w || 1.5, hw = w / 2, gaps = spec.gaps || [];
    var P = spec.pts.map(function (p) { return [p[0] + ox, p[1] + oz, p[2] || 0]; }), n = P.length, D = [], i;
    for (i = 0; i < n - 1; i++) { var dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dz); D.push({ x: dx / l, z: dz / l, len: l }); }
    function nrm(d) { return { x: -d.z, z: d.x }; }
    var L = [], Rr = [];
    for (i = 0; i < n; i++) {
      var mx, mz;
      if (i === 0) { var a0 = nrm(D[0]); mx = a0.x * hw; mz = a0.z * hw; }
      else if (i === n - 1) { var a1 = nrm(D[n - 2]); mx = a1.x * hw; mz = a1.z * hw; }
      else { var n0 = nrm(D[i - 1]), n1 = nrm(D[i]), sx = n0.x + n1.x, sz = n0.z + n1.z, sl = Math.hypot(sx, sz); sx /= sl; sz /= sl; var k = hw / (sx * n1.x + sz * n1.z); mx = sx * k; mz = sz * k; }
      L.push([P[i][0] + mx, P[i][1] + mz, P[i][2]]); Rr.push([P[i][0] - mx, P[i][1] - mz, P[i][2]]);
    }
    var floors = [], walls = [], minH = 1e9, maxH = -1e9;
    for (i = 0; i < n - 1; i++) {
      minH = Math.min(minH, P[i][2], P[i + 1][2]); maxH = Math.max(maxH, P[i][2], P[i + 1][2]);
      if (gaps.indexOf(i) >= 0) continue;
      var d = D[i], h0 = P[i][2], h1 = P[i + 1][2];
      floors.push({ poly: [L[i], L[i + 1], Rr[i + 1], Rr[i]], ax: P[i][0], az: P[i][1], dx: d.x, dz: d.z, len: d.len, h0: h0, h1: h1, gx: (h1 - h0) / d.len * d.x, gz: (h1 - h0) / d.len * d.z, seg: i });
      walls.push(seg3(L[i], L[i + 1]), seg3(Rr[i], Rr[i + 1]));
    }
    if (gaps.indexOf(0) < 0) walls.push(seg3(Rr[0], L[0]));
    if (gaps.indexOf(n - 2) < 0) walls.push(seg3(L[n - 1], Rr[n - 1]));
    var dl = D[n - 2], d0 = D[0];
    var tee = [P[0][0] + d0.x * 0.6, P[0][1] + d0.z * 0.6], cup = [P[n - 1][0] - dl.x * 0.75, P[n - 1][1] - dl.z * 0.75];
    var bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    L.concat(Rr).forEach(function (q) { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); bz0 = Math.min(bz0, q[1]); bz1 = Math.max(bz1, q[1]); });
    var H = { spec: spec, P: P, D: D, L: L, Rr: Rr, w: w, floors: floors, walls: walls, circles: [], dyn: [], tee: tee, cup: cup, minH: minH, maxH: maxH, box: [bx0, bz0, bx1, bz1], par: spec.par, name: spec.name };
    H.teeYaw = yawFor(d0.x, d0.z);
    (spec.obs || []).forEach(function (o) {
      var x = o.x + ox, z = o.z + oz, fh = floorH(H, x, z);
      if (o.t === 'post' || o.t === 'bump') H.circles.push({ x: x, z: z, r: o.r, y0: fh - 0.3, y1: fh + 0.3, e: o.t === 'bump' ? 1.25 : 0.7, bump: o.t === 'bump', o: o, h: fh, flash: 0 });
      else if (o.t === 'block') { var hw2 = o.w / 2, hd = o.d / 2; [[[-hw2, -hd], [hw2, -hd]], [[hw2, -hd], [hw2, hd]], [[hw2, hd], [-hw2, hd]], [[-hw2, hd], [-hw2, -hd]]].forEach(function (e) { H.walls.push({ ax: x + e[0][0], az: z + e[0][1], bx: x + e[1][0], bz: z + e[1][1], y0: fh - 0.3, y1: fh + WALL_H, e: 0.7 }); }); o.h = fh; o.wx = x; o.wz = z; }
      else if (o.t === 'mill' || o.t === 'slide') H.dyn.push({ o: o, x: x, z: z, h: fh });
    });
    return H;
    function seg3(a, b) { return { ax: a[0], az: a[1], bx: b[0], bz: b[1], y0: Math.min(a[2], b[2]) - 0.35, y1: Math.max(a[2], b[2]) + WALL_H, e: 0.7, ha: a[2], hb: b[2] }; }
  }
  function inPoly(poly, x, z) {
    var pos = false, neg = false;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c > 1e-9) pos = true; else if (c < -1e-9) neg = true;
      if (pos && neg) return false;
    }
    return true;
  }
  function fH(f, x, z) { var t = ((x - f.ax) * f.dx + (z - f.az) * f.dz) / f.len; t = t < 0 ? 0 : t > 1 ? 1 : t; return f.h0 + (f.h1 - f.h0) * t; }
  function floorAt(H, x, z, yMax) {
    var best = null, bh = -1e9;
    for (var i = 0; i < H.floors.length; i++) { var f = H.floors[i]; if (!inPoly(f.poly, x, z)) continue; var h = fH(f, x, z); if (h <= yMax && h > bh) { bh = h; best = f; } }
    return best ? { f: best, h: bh } : null;
  }
  function floorH(H, x, z) { var r = floorAt(H, x, z, 99); return r ? r.h : 0; }
  function nowS() { return Date.now() / 1000; }
  // segments des obstacles qui bougent, à l'instant t (même heure pour tout le monde) ; vx/vz : vitesse de l'obstacle (pour le renvoi)
  function dynSegs(H, t, out) {
    out.length = 0;
    H.dyn.forEach(function (d) {
      var o = d.o;
      if (o.t === 'mill') {
        var th = o.speed * t;
        for (var k = 0; k < o.n; k++) { var a = th + k * TAU / o.n; out.push({ ax: d.x, az: d.z, bx: d.x + Math.cos(a) * o.len, bz: d.z + Math.sin(a) * o.len, y0: d.h - 0.3, y1: d.h + 0.2, e: 0.6, spin: o.speed, cx: d.x, cz: d.z }); }
      } else if (o.t === 'slide') {
        var s = Math.sin(o.speed * t) * o.amp, v = Math.cos(o.speed * t) * o.amp * o.speed, cx = d.x + (o.ax === 'x' ? s : 0), cz = d.z + (o.ax === 'z' ? s : 0), vx = o.ax === 'x' ? v : 0, vz = o.ax === 'z' ? v : 0, hw = o.w / 2, hd = o.d / 2;
        [[[-hw, -hd], [hw, -hd]], [[hw, -hd], [hw, hd]], [[hw, hd], [-hw, hd]], [[-hw, hd], [-hw, -hd]]].forEach(function (e) { out.push({ ax: cx + e[0][0], az: cz + e[0][1], bx: cx + e[1][0], bz: cz + e[1][1], y0: d.h - 0.3, y1: d.h + 0.22, e: 0.7, vx: vx, vz: vz }); });
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ physique de la balle ------------------------------------------------------------------ */
  var DYN = [];
  function hitSeg(b, s, sound) {
    if (b.y > s.y1 + R * 0.4 || b.y < s.y0) return false;
    var ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez; if (L2 < 1e-9) return false;
    var t = ((b.x - s.ax) * ex + (b.z - s.az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    var cx = s.ax + ex * t, cz = s.az + ez * t, dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz);
    if (d >= R || d < 1e-7) return false;
    var nx = dx / d, nz = dz / d; b.x = cx + nx * R; b.z = cz + nz * R;
    var svx = s.vx || 0, svz = s.vz || 0;
    if (s.spin) { svx = -s.spin * (cz - s.cz); svz = s.spin * (cx - s.cx); }
    var rvx = b.vx - svx, rvz = b.vz - svz, vn = rvx * nx + rvz * nz;
    if (vn < 0) { var e = s.e || 0.7; rvx -= (1 + e) * vn * nx; rvz -= (1 + e) * vn * nz; rvx *= 0.97; rvz *= 0.97; if (sound) sound(-vn, 'wall'); }
    else if (s.spin || s.vx || s.vz) { rvx += nx * 0.4; rvz += nz * 0.4; }
    b.vx = rvx + svx; b.vz = rvz + svz;
    return true;
  }
  function hitCircle(b, c, sound) {
    if (b.y > c.y1 || b.y < c.y0) return false;
    var dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz), rr = R + c.r;
    if (d >= rr || d < 1e-7) return false;
    var nx = dx / d, nz = dz / d; b.x = c.x + nx * rr; b.z = c.z + nz * rr;
    var vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      var e = c.e || 0.7; b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz;
      if (c.bump) { var sp = Math.hypot(b.vx, b.vz); if (sp < 2.2) { b.vx += nx * 1.2; b.vz += nz * 1.2; } c.flash = 1; }
      if (sound) sound(-vn, c.bump ? 'bump' : 'wall');
    }
    return true;
  }
  // un petit pas de simulation ; renvoie 'cup' (dans le trou), 'out' (tombé dans l'eau ou le vide) ou ''
  function simStep(b, H, dt, t, others, sound) {
    var fl;
    if (!b.air) {
      var gx = 0, gz = 0;
      fl = floorAt(H, b.x, b.z, b.y + 0.12);
      if (fl) { gx = fl.f.gx; gz = fl.f.gz; }
      var sp = Math.hypot(b.vx, b.vz);
      var dec = (H.fric || 0.95) + 0.32 * sp;
      if (sp > 0) { var dd = Math.min(sp, dec * dt); b.vx -= b.vx / sp * dd; b.vz -= b.vz / sp * dd; }
      b.vx += -GRAV * gx * 0.71 * dt; b.vz += -GRAV * gz * 0.71 * dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      var f2 = floorAt(H, b.x, b.z, b.y + 0.12);
      var vyg = fl ? fl.f.gx * b.vx + fl.f.gz * b.vz : 0;
      if (!f2 || b.y - f2.h > 0.02 + Math.abs(vyg) * dt * 2.5) { b.air = true; b.vy = vyg; }
      else { b.y = f2.h; b.vy = f2.f.gx * b.vx + f2.f.gz * b.vz; }
    }
    if (b.air) {
      b.vy -= GRAV * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
      fl = floorAt(H, b.x, b.z, b.y + 0.06 + Math.max(0, -b.vy * dt));
      if (fl && b.y <= fl.h) {
        b.y = fl.h;
        if (b.vy < -2.2) { b.vy = -b.vy * 0.28; b.vx *= 0.92; b.vz *= 0.92; if (sound) sound(1.2, 'land'); }
        else { b.vy = 0; b.air = false; b.vx *= 0.94; b.vz *= 0.94; }
      }
    }
    var i;
    for (i = 0; i < H.walls.length; i++) hitSeg(b, H.walls[i], sound);
    dynSegs(H, t, DYN); for (i = 0; i < DYN.length; i++) hitSeg(b, DYN[i], sound);
    for (i = 0; i < H.circles.length; i++) hitCircle(b, H.circles[i], sound);
    if (others) for (i = 0; i < others.length; i++) hitCircle(b, others[i], sound);
    if (b.y < H.minH - 0.28) return 'out';
    // le trou : la balle lente tombe dedans ; à peine plus rapide, le bord l'attire un peu
    if (!b.air) {
      var cdx = H.cup[0] - b.x, cdz = H.cup[1] - b.z, cd = Math.hypot(cdx, cdz), spd = Math.hypot(b.vx, b.vz);
      if (cd < CUP - R * 0.25 && spd < 3.4) return 'cup';
      if (cd < CUP + R && spd < 1.6 && cd > 1e-4) { b.vx += cdx / cd * 2.4 * dt; b.vz += cdz / cd * 2.4 * dt; }
    }
    return '';
  }

  var API = { R: R, CUP: CUP, VMAX: VMAX, GRAV: GRAV, MAXSHOTS: MAXSHOTS, WAIT_S: WAIT_S, WALL_H: WALL_H, COURSES: COURSES, buildHoleData: buildHoleData, inPoly: inPoly, floorAt: floorAt, floorH: floorH, dynSegs: dynSegs, simStep: simStep, nowS: nowS };
  return API;
})();
export default SIM;
