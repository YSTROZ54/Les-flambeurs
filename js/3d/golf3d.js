/* =====================================================================
   golf3d.js — Le MINI GOLF entre joueurs (façon « Golf With Your Friends »)
   ---------------------------------------------------------------------
   • « golf » : la salle d'accueil (porte « GOLF » du salon des mini jeux) avec une porte par parcours.
   • Un parcours = une salle : « golfjardin » (dehors, ciel bleu, moulin, saut au-dessus de l'étang) et
     « golfneon » (dedans, lumière noire, tourniquets, bumpers). Six trous chacun.
   • Tout le monde joue EN MÊME TEMPS sur le même trou : chacun est une balle, on voit les balles des autres et on peut les cogner.
     Le trou suivant commence quand tout le monde a fini (les retardataires ont 60 s dès que quelqu'un a fini).
     Le moins de coups gagne. Gratuit, pour le fun : aucun jeton n'est misé.
   • Commandes — PC : clic gauche maintenu, tire la souris vers toi (puissance), relâche pour tirer ; clic droit glissé ou ← → : tourner ;
     molette : zoom ; Espace maintenu : jauge ; R : replacer ; V : voir le trou ; Tab : scores.
     Téléphone : glisse pour tourner, tire la barre de puissance vers le bas puis relâche.
   • Réseau : canal temps réel de la salle, message « gb » (ma balle, mon trou, mes coups, ma carte de score) ~10 fois/s quand ça bouge.
     Pas de serveur : chaque joueur simule sa propre balle. Les obstacles qui bougent suivent l'heure, donc tout le monde les voit pareil.
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var R = 0.075, CUP = 0.13, VMAX = 9.5, GRAV = 9.8, MAXSHOTS = 10, WAIT_S = 60, WALL_H = 0.16;
  var BALL_COLORS = ['#ff4d4d', '#ffd23f', '#3ddc84', '#3fa9ff', '#c86bff', '#ff8a3d', '#ff5fb4', '#4df0e0'];

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
    H.teeYaw = F.yawFor(d0.x, d0.z);
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

  /* ------------------------------------------------------------------ petits utilitaires de dessin ------------------------------------------------------------------ */
  function hashStr(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function quadMesh(pts, mat, uvScale) {          // un quadrilatère (4 points [x, z, y]) avec des UV pris dans le plan du sol
    var g = new THREE.BufferGeometry(), pos = [], uv = [];
    [0, 1, 2, 0, 2, 3].forEach(function (k) { var p = pts[k]; pos.push(p[0], p[2], p[1]); uv.push(p[0] * uvScale, p[1] * uvScale); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    var m = new THREE.Mesh(g, mat);
    return m;
  }
  function vertQuad(a, b, yTopA, yTopB, yBot, mat) {   // une face verticale (côté de la piste), de a à b
    var g = new THREE.BufferGeometry(), p = [a[0], yTopA, a[1], b[0], yTopB, b[1], b[0], yBot, b[1], a[0], yTopA, a[1], b[0], yBot, b[1], a[0], yBot, a[1]];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    var m = new THREE.Mesh(g, mat); return m;
  }
  function beam(a, b, ha, hb, thick, height, mat) {   // une bordure (poutre) de a à b, qui suit la pente
    var dx = b[0] - a[0], dz = b[1] - a[1], Lh = Math.hypot(dx, dz), dh = hb - ha, Ls = Math.hypot(Lh, dh);
    var m = new THREE.Mesh(new THREE.BoxGeometry(Ls + thick, height, thick), mat);
    m.rotation.order = 'YZX'; m.rotation.y = -Math.atan2(dz, dx); m.rotation.z = Math.atan2(dh, Lh);
    m.position.set((a[0] + b[0]) / 2, (ha + hb) / 2 + height / 2 - 0.01, (a[1] + b[1]) / 2);
    return m;
  }
  function textPlane(lines, w, h, opt) {
    var cw = 512, ch = Math.round(512 * h / w), c = mkCanvas(cw, ch), x = c.getContext('2d');
    x.fillStyle = opt.bg; x.fillRect(0, 0, cw, ch); x.strokeStyle = opt.edge; x.lineWidth = 10; x.strokeRect(5, 5, cw - 10, ch - 10);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach(function (l, i) { x.fillStyle = l.c || opt.fg; x.font = l.f; if (opt.glow) { x.shadowColor = l.c || opt.fg; x.shadowBlur = 18; } x.fillText(l.t, cw / 2, ch * l.y, cw - 30); x.shadowBlur = 0; });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: mkTex(c), side: THREE.DoubleSide }));
  }
  function nameSprite(name, col) {
    var c = mkCanvas(256, 64), x = c.getContext('2d');
    x.fillStyle = 'rgba(8,6,14,0.72)'; F.roundRectPath(x, 4, 8, 248, 48, 22); x.fill();
    x.fillStyle = col; x.beginPath(); x.arc(32, 32, 12, 0, TAU); x.fill();
    x.fillStyle = '#fff'; x.font = '800 28px ' + SERIF; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(String(name).slice(0, 14), 54, 33, 190);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(c), transparent: true, depthWrite: false, depthTest: false })); s.scale.set(0.7, 0.175, 1); s.renderOrder = 30; return s;
  }

  /* ------------------------------------------------------------------ sons (sans fichier) ------------------------------------------------------------------ */
  var AC = null;
  function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  function sfxVol() { try { var A = F.audio; return A && typeof A.sfxVol === 'number' ? A.sfxVol : 0.7; } catch (e) { return 0.7; } }
  function tone(f0, f1, dur, type, vol, delay) {
    var a = ac(); if (!a) return; var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sfxVol()), t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, delay) {
    var a = ac(); if (!a) return; var t0 = a.currentTime + (delay || 0), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq || 2000; g.gain.value = vol * sfxVol();
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0);
  }
  var SND = {
    hit: function (p) { noise(0.06, 0.25 + p * 0.35, 3500); tone(220 + p * 120, 90, 0.12, 'triangle', 0.18 + p * 0.2); },
    wall: function (v) { if (v < 0.35) return; tone(700 + Math.random() * 200, 500, 0.06, 'square', Math.min(0.08, 0.02 + v * 0.02)); },
    bump: function () { tone(520, 1040, 0.12, 'triangle', 0.14); },
    land: function () { noise(0.08, 0.2, 900); },
    cup: function () { tone(880, 300, 0.18, 'sine', 0.22); tone(660, 990, 0.12, 'sine', 0.14, 0.2); tone(990, 1320, 0.18, 'sine', 0.14, 0.32); },
    splash: function () { noise(0.5, 0.45, 1200); tone(400, 120, 0.3, 'sine', 0.08); },
    fall: function () { tone(500, 80, 0.5, 'sawtooth', 0.06); },
    ace: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, f, 0.22, 'triangle', 0.16, i * 0.12); }); }
  };

  /* ------------------------------------------------------------------ interface (CSS) ------------------------------------------------------------------ */
  function injectCss() {
    if (document.getElementById('golf3d-css')) return;
    var s = document.createElement('style'); s.id = 'golf3d-css';
    s.textContent =
      '.gf-hud{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:inherit;color:#fff}' +
      '.gf-info{position:absolute;left:14px;top:14px;background:rgba(8,6,16,.78);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:9px 14px;min-width:170px;box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.gf-info .c{font-size:11px;font-weight:800;letter-spacing:.12em;opacity:.75;text-transform:uppercase}.gf-info .h{font-size:20px;font-weight:900;margin-top:2px}.gf-info .h small{font-size:13px;opacity:.8;font-weight:800;margin-left:6px}.gf-info .s{font-size:15px;font-weight:800;margin-top:3px}.gf-info .t{margin-top:5px;font-size:13px;font-weight:900;color:#ffd23f}' +
      '.gf-pl{position:absolute;left:14px;top:118px;display:flex;flex-direction:column;gap:4px}.gf-pl div{background:rgba(8,6,16,.7);border-radius:999px;padding:3px 12px 3px 8px;font-size:13px;font-weight:800;display:flex;align-items:center;gap:7px}.gf-pl i{width:12px;height:12px;border-radius:50%;display:inline-block;box-shadow:0 0 6px currentColor}.gf-pl b{margin-left:auto;padding-left:10px;opacity:.9}' +
      '.gf-btns{position:absolute;right:14px;bottom:78px;display:flex;flex-direction:column;gap:7px;pointer-events:auto}.gf-btns button{padding:8px 13px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(8,6,16,.82);color:#fff;font-weight:800;font-size:13px;cursor:pointer;text-align:left}.gf-btns button:hover{background:rgba(40,30,70,.9)}.gf-btns kbd{opacity:.6;font-size:11px;margin-left:5px}' +
      '.gf-pow{position:absolute;right:22px;top:22%;height:36%;width:44px;border-radius:22px;background:rgba(8,6,16,.75);border:2px solid rgba(255,255,255,.3);pointer-events:auto;touch-action:none;cursor:ns-resize;overflow:hidden}.gf-pow .f{position:absolute;left:0;right:0;top:0;height:0;background:linear-gradient(180deg,#3ddc84,#ffd23f 55%,#ff4d4d)}.gf-pow .l{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-size:10px;font-weight:900;letter-spacing:.05em}.gf-pow.off{opacity:.35}' +
      '.gf-toast{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%) scale(.7);opacity:0;transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1);text-align:center;font-weight:900;font-size:clamp(28px,5vw,54px);text-shadow:0 4px 0 #000,0 0 26px rgba(0,0,0,.7);white-space:nowrap}.gf-toast small{display:block;font-size:.4em;margin-top:4px;opacity:.95}.gf-toast.in{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
      '.gf-help{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);background:rgba(8,6,16,.62);border-radius:999px;padding:5px 16px;font-size:12px;font-weight:700;white-space:nowrap;opacity:.9}' +
      '.gf-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(8,6,16,.94);border:2px solid rgba(255,255,255,.25);border-radius:18px;padding:16px 18px;pointer-events:auto;max-width:94vw;max-height:80vh;overflow:auto;display:none}.gf-card.on{display:block}.gf-card h3{margin:0 0 10px;text-align:center;font-size:20px}.gf-card table{border-collapse:collapse;font-size:14px;font-weight:800}.gf-card td,.gf-card th{padding:5px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,.1)}.gf-card td:first-child,.gf-card th:first-child{text-align:left}.gf-card .par{opacity:.6}.gf-card .tot{color:#ffd23f}.gf-card .u{color:#3ddc84}.gf-card .o{color:#ff8a80}.gf-card .ft{text-align:center;margin-top:10px;font-size:13px;opacity:.85}' +
      '@media (max-height:520px){.gf-info{padding:5px 10px;min-width:130px}.gf-info .h{font-size:15px}.gf-info .s{font-size:12px}.gf-pl{top:84px}.gf-pl div{font-size:11px;padding:2px 9px 2px 6px}.gf-btns{bottom:auto;top:12px;right:76px;flex-direction:row}.gf-btns button{padding:6px 9px;font-size:11px}.gf-btns kbd{display:none}.gf-pow{right:14px;top:16%;height:58%;width:50px}.gf-help{display:none}.gf-card{padding:10px}.gf-card table{font-size:11px}}';
    document.head.appendChild(s);
  }

  /* ==================================================================
     UN PARCOURS
     ================================================================== */
  function createCourse(world, cid) {
    var C = COURSES[cid], neon = C.style === 'neon', low = world.low;
    var room = { title: C.title, subtitle: C.sub + ' · ' + C.holes.length + ' TROUS', topic: 'flambeurs-' + cid + '-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [], hideSelf: true, noHand: true };
    var g = room.group, i;
    var HOLES = C.holes.map(buildHoleData), NH = HOLES.length;
    var allBox = [1e9, 1e9, -1e9, -1e9]; HOLES.forEach(function (H) { allBox[0] = Math.min(allBox[0], H.box[0]); allBox[1] = Math.min(allBox[1], H.box[1]); allBox[2] = Math.max(allBox[2], H.box[2]); allBox[3] = Math.max(allBox[3], H.box[3]); });
    var CX = (allBox[0] + allBox[2]) / 2, CZ = (allBox[1] + allBox[3]) / 2;
    room.bounds = { xMin: allBox[0] - 6, xMax: allBox[2] + 6, zMin: allBox[1] - 6, zMax: allBox[3] + 6 };

    /* ---------- décor ---------- */
    var feltTex, floorMat, sideMat, wallMat, wallTop, postMat, bumpMat, bumpGlow = [];
    if (!neon) {
      var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#2fae4a'; fx.fillRect(0, 0, 256, 256);
      for (i = 0; i < 8; i++) { fx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; fx.fillRect(0, i * 32, 256, 32); }
      for (i = 0; i < 1600; i++) { fx.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,40,0') + ',' + (Math.random() * 0.08) + ')'; fx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
      feltTex = mkTex(fc); feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping; feltTex.anisotropy = 8;
      floorMat = new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, side: THREE.DoubleSide });
      sideMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85, side: THREE.DoubleSide });
      wallMat = new THREE.MeshStandardMaterial({ color: 0x9a6232, roughness: 0.7 });
      postMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6 });
      bumpMat = new THREE.MeshStandardMaterial({ color: 0xe8392f, roughness: 0.4, emissive: 0x3a0000 });
    } else {
      var nc = mkCanvas(256, 256), nx = nc.getContext('2d'); nx.fillStyle = '#10153f'; nx.fillRect(0, 0, 256, 256);
      nx.strokeStyle = 'rgba(80,120,255,0.35)'; nx.lineWidth = 2; nx.strokeRect(1, 1, 254, 254);
      for (i = 0; i < 70; i++) { nx.fillStyle = ['rgba(120,200,255,', 'rgba(255,120,240,', 'rgba(140,255,200,'][i % 3] + (0.3 + Math.random() * 0.5) + ')'; nx.beginPath(); nx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 1.8, 0, TAU); nx.fill(); }
      feltTex = mkTex(nc); feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping; feltTex.anisotropy = 8;
      floorMat = new THREE.MeshBasicMaterial({ map: feltTex, side: THREE.DoubleSide });
      sideMat = new THREE.MeshBasicMaterial({ color: 0x0a0c26, side: THREE.DoubleSide });
      postMat = new THREE.MeshBasicMaterial({ color: 0x8cff6b });
      bumpMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    }
    var NEON_COLS = [0x22e5ff, 0xff3df0, 0x7dff5a, 0xffb02e, 0x9a6bff, 0xff4d6d];

    HOLES.forEach(function (H, hi) {
      var hg = new THREE.Group(); g.add(hg); H.group = hg;
      var wm = neon ? new THREE.MeshBasicMaterial({ color: NEON_COLS[hi % NEON_COLS.length] }) : wallMat;
      H.floors.forEach(function (f) {
        var p = f.poly, hA = f.h0, hB = f.h1;
        hg.add(quadMesh([[p[0][0], p[0][1], hA], [p[1][0], p[1][1], hB], [p[2][0], p[2][1], hB], [p[3][0], p[3][1], hA]], floorMat, 0.5));
        hg.add(vertQuad(p[0], p[1], hA, hB, -0.16, sideMat)); hg.add(vertQuad(p[2], p[3], hB, hA, -0.16, sideMat));
        hg.add(vertQuad(p[1], p[2], hB, hB, -0.16, sideMat)); hg.add(vertQuad(p[3], p[0], hA, hA, -0.16, sideMat));
      });
      H.walls.forEach(function (s) { if (s.ha === undefined) return; hg.add(beam([s.ax, s.az], [s.bx, s.bz], s.ha, s.hb, 0.08, WALL_H, wm)); });
      // le trou et son drapeau
      var ch = floorH(H, H.cup[0], H.cup[1]);
      var hole = new THREE.Mesh(new THREE.CircleGeometry(CUP, 28), new THREE.MeshBasicMaterial({ color: 0x050505 })); hole.rotation.x = -Math.PI / 2; hole.position.set(H.cup[0], ch + 0.004, H.cup[1]); hg.add(hole);
      var rim = new THREE.Mesh(new THREE.RingGeometry(CUP, CUP + 0.025, 28), new THREE.MeshBasicMaterial({ color: neon ? 0x7dff5a : 0xffffff })); rim.rotation.x = -Math.PI / 2; rim.position.set(H.cup[0], ch + 0.005, H.cup[1]); hg.add(rim);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.1, 8), new THREE.MeshBasicMaterial({ color: neon ? 0xffffff : 0xf2f2f2 })); pole.position.set(H.cup[0], ch + 0.55, H.cup[1]); hg.add(pole);
      var fcv = mkCanvas(128, 80), fcx = fcv.getContext('2d'); fcx.fillStyle = neon ? '#ff3df0' : '#e8392f'; fcx.fillRect(0, 0, 128, 80); fcx.fillStyle = '#fff'; fcx.font = '900 54px ' + SERIF; fcx.textAlign = 'center'; fcx.textBaseline = 'middle'; fcx.fillText(String(hi + 1), 64, 42);
      var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.21), new THREE.MeshBasicMaterial({ map: mkTex(fcv), side: THREE.DoubleSide }));
      var fg = new THREE.Group(); fg.position.set(H.cup[0], ch + 0.99, H.cup[1]); flag.position.x = 0.17; fg.add(flag); hg.add(fg); H.flag = fg;
      // le départ : un petit tapis et un panneau
      var th = floorH(H, H.tee[0], H.tee[1]);
      var tee = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ color: neon ? 0x2a2f7a : 0x1f7a33 })); tee.rotation.x = -Math.PI / 2; tee.rotation.z = -H.teeYaw; tee.position.set(H.tee[0], th + 0.003, H.tee[1]); hg.add(tee);
      var d0 = H.D[0], side = { x: -d0.z, z: d0.x };
      var sign = textPlane([{ t: 'TROU ' + (hi + 1), f: '900 70px ' + SERIF, y: 0.3 }, { t: H.name, f: '700 40px ' + SERIF, y: 0.6 }, { t: 'PAR ' + H.par, f: '800 40px ' + MONO, y: 0.84, c: neon ? '#7dff5a' : '#ffd23f' }], 0.72, 0.45, neon ? { bg: 'rgba(10,8,30,0.92)', edge: '#22e5ff', fg: '#ffffff', glow: true } : { bg: '#f4ead2', edge: '#7a4a22', fg: '#2a1a0c' });
      var sx = H.P[0][0] + side.x * (H.w / 2 + 0.75) + d0.x * 1.6, sz = H.P[0][1] + side.z * (H.w / 2 + 0.75) + d0.z * 1.6;
      sign.position.set(sx, 0.85, sz); sign.rotation.y = -H.teeYaw; hg.add(sign);
      var sp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.66, 8), neon ? new THREE.MeshBasicMaterial({ color: 0x22e5ff }) : new THREE.MeshStandardMaterial({ color: 0x5a3a1a })); sp2.position.set(sx, 0.33, sz); hg.add(sp2);
      // obstacles
      H.circles.forEach(function (c) {
        var m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.bump ? 0.14 : 0.32, 24), c.bump ? bumpMat.clone() : postMat); m.position.set(c.x, c.h + (c.bump ? 0.07 : 0.16), c.z); hg.add(m);
        if (c.bump) { var ring = new THREE.Mesh(new THREE.TorusGeometry(c.r, 0.025, 8, 28), new THREE.MeshBasicMaterial({ color: neon ? 0xff3df0 : 0xffffff })); ring.rotation.x = Math.PI / 2; ring.position.set(c.x, c.h + 0.145, c.z); hg.add(ring); c.mesh = m; c.ring = ring; bumpGlow.push(c); }
      });
      (H.spec.obs || []).forEach(function (o) {
        if (o.t !== 'block') return;
        var m = new THREE.Mesh(new THREE.BoxGeometry(o.w, WALL_H + 0.04, o.d), neon ? new THREE.MeshBasicMaterial({ color: 0xff3df0 }) : wallMat); m.position.set(o.wx, o.h + (WALL_H + 0.04) / 2, o.wz); hg.add(m);
      });
      H.dyn.forEach(function (d) {
        var o = d.o, grp = new THREE.Group(); grp.position.set(d.x, d.h, d.z); hg.add(grp); d.mesh = grp;
        if (o.t === 'mill') {
          var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 14), neon ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshStandardMaterial({ color: 0x5a3a1a })); hub.position.y = 0.15; grp.add(hub);
          var bm = neon ? new THREE.MeshBasicMaterial({ color: 0xff3df0 }) : new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
          for (var k = 0; k < o.n; k++) { var bl = new THREE.Mesh(new THREE.BoxGeometry(o.len, 0.12, 0.05), bm); bl.position.set(o.len / 2, 0.09, 0); var arm = new THREE.Group(); arm.rotation.y = -k * TAU / o.n; arm.add(bl); grp.add(arm); }
          if (o.house) {                                   // un petit moulin à côté de la piste, pour le décor
            var mh = new THREE.Group(); mh.position.set(d.x + 1.6, 0, d.z); hg.add(mh);
            var body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xf1e3c4, roughness: 0.8 })); body.position.y = 0.8; mh.add(body);
            var roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xb8402f, roughness: 0.7 })); roof.position.y = 1.95; mh.add(roof);
            var sails = new THREE.Group(); sails.position.set(-0.5, 1.45, 0); mh.add(sails); d.sails = sails;
            for (var q = 0; q < 4; q++) { var sl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.95, 0.22), new THREE.MeshStandardMaterial({ color: 0xffffff })); sl.position.y = 0.48; var sa = new THREE.Group(); sa.rotation.x = q * Math.PI / 2; sa.add(sl); sails.add(sa); }
          }
        } else {
          var blk = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.22, o.d), neon ? new THREE.MeshBasicMaterial({ color: 0x22e5ff }) : new THREE.MeshStandardMaterial({ color: 0x3f6fd8, roughness: 0.5 })); blk.position.y = 0.11; grp.add(blk);
        }
      });
      // l'eau (ou le vide lumineux) sous les tronçons sans sol
      (H.spec.gaps || []).forEach(function (gi) {
        var a = H.P[gi], b = H.P[gi + 1], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        var wtr = new THREE.Mesh(new THREE.PlaneGeometry(H.w + 3, len + 0.6), neon ? new THREE.MeshBasicMaterial({ color: 0x2a0a4a, transparent: true, opacity: 0.85 }) : new THREE.MeshStandardMaterial({ color: 0x2a7fd4, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.88 }));
        wtr.rotation.x = -Math.PI / 2; wtr.rotation.z = -Math.atan2(b[0] - a[0], -(b[1] - a[1])); wtr.position.set(mx, -0.14, mz); g.add(wtr); H.water = wtr;
      });
    });

    // l'environnement
    var bgOld = null, skyCol = neon ? 0x05030c : 0x9fd6ff;
    if (!neon) {
      var skc = mkCanvas(64, 256), skx = skc.getContext('2d'), sg = skx.createLinearGradient(0, 0, 0, 256); sg.addColorStop(0, '#2f7fe0'); sg.addColorStop(0.5, '#8cc8ff'); sg.addColorStop(0.62, '#dff1ff'); sg.addColorStop(1, '#cfe9c8'); skx.fillStyle = sg; skx.fillRect(0, 0, 64, 256);
      var sky = new THREE.Mesh(new THREE.SphereGeometry(74, 24, 16), new THREE.MeshBasicMaterial({ map: mkTex(skc), side: THREE.BackSide, depthWrite: false, fog: false })); sky.position.set(CX, 0, CZ); g.add(sky);
      var gc = mkCanvas(256, 256), gx2 = gc.getContext('2d'); gx2.fillStyle = '#4f8f3a'; gx2.fillRect(0, 0, 256, 256); for (i = 0; i < 2500; i++) { gx2.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '120,180,80' : '30,70,20') + ',' + (0.2 + Math.random() * 0.3) + ')'; gx2.fillRect(Math.random() * 256, Math.random() * 256, 2, 3); }
      var gt = mkTex(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(40, 40);
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(CX, -0.16, CZ); g.add(ground);
      g.add(new THREE.HemisphereLight(0xdff1ff, 0x3a5a2a, 0.85)); g.add(new THREE.AmbientLight(0xffffff, 0.25));
      var sun = new THREE.DirectionalLight(0xfff4dc, 0.95); sun.position.set(CX + 20, 30, CZ + 12); g.add(sun);
      // arbres, buissons et fleurs, loin des pistes
      var rnd = rng(hashStr(cid)), trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 }), leafMs = [0x2f7d32, 0x3f9a3a, 0x2a6b2e].map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }); });
      var clear = function (x, z, m) { return HOLES.every(function (H) { return x < H.box[0] - m || x > H.box[2] + m || z < H.box[1] - m || z > H.box[3] + m; }); };
      var nT = low ? 28 : 60, made = 0, tries = 0;
      while (made < nT && tries++ < 900) {
        var tx = CX + (rnd() - 0.5) * 70, tz = CZ + (rnd() - 0.5) * 60; if (!clear(tx, tz, 1.6)) continue; made++;
        var s = 0.7 + rnd() * 0.9, tr = new THREE.Group(); tr.position.set(tx, -0.16, tz); g.add(tr);
        var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.2 * s, 7), trunkM); trunk.position.y = 0.6 * s; tr.add(trunk);
        var lm = leafMs[Math.floor(rnd() * 3)];
        if (rnd() < 0.5) { var c1 = new THREE.Mesh(new THREE.ConeGeometry(0.8 * s, 1.8 * s, 8), lm); c1.position.y = 1.9 * s; tr.add(c1); }
        else { var b1 = new THREE.Mesh(new THREE.SphereGeometry(0.85 * s, 10, 8), lm); b1.position.y = 1.75 * s; tr.add(b1); }
      }
      var flowerCols = [0xff5fa2, 0xffd23f, 0xffffff, 0xb46bff];
      for (i = 0; i < (low ? 60 : 160); i++) { var fx2 = CX + (rnd() - 0.5) * 40, fz2 = CZ + (rnd() - 0.5) * 36; if (!clear(fx2, fz2, 0.4)) continue; var fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: flowerCols[i % 4] })); fl.position.set(fx2, -0.1, fz2); g.add(fl); }
      for (i = 0; i < 8; i++) { var cl = new THREE.Group(); cl.position.set(CX + (rnd() - 0.5) * 100, 22 + rnd() * 8, CZ - 30 - rnd() * 30); for (var q = 0; q < 4; q++) { var cs = new THREE.Mesh(new THREE.SphereGeometry(2 + rnd() * 1.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); cs.position.set(q * 2.2 - 3, rnd(), rnd()); cl.add(cs); } g.add(cl); }
    } else {
      var floorC = mkCanvas(256, 256), fl3 = floorC.getContext('2d'); fl3.fillStyle = '#05030c'; fl3.fillRect(0, 0, 256, 256); fl3.strokeStyle = 'rgba(160,60,255,0.35)'; fl3.lineWidth = 2; fl3.strokeRect(0, 0, 256, 256);
      var flt = mkTex(floorC); flt.wrapS = flt.wrapT = THREE.RepeatWrapping; flt.repeat.set(30, 30);
      var nfloor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: flt })); nfloor.rotation.x = -Math.PI / 2; nfloor.position.set(CX, -0.16, CZ); g.add(nfloor);
      var stc = mkCanvas(512, 512), stx = stc.getContext('2d'); stx.fillStyle = '#07041a'; stx.fillRect(0, 0, 512, 512);
      for (i = 0; i < 220; i++) { stx.fillStyle = ['#ffffff', '#9fd8ff', '#ff9ff3', '#b8ff9f'][i % 4]; stx.globalAlpha = 0.3 + Math.random() * 0.7; stx.beginPath(); stx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 2.2, 0, TAU); stx.fill(); }
      stx.globalAlpha = 0.5; ['#22e5ff', '#ff3df0', '#7dff5a'].forEach(function (c, k) { stx.strokeStyle = c; stx.lineWidth = 3; stx.beginPath(); for (var xx = 0; xx <= 512; xx += 8) { var yy = 120 + k * 140 + Math.sin(xx / 40 + k) * 30; if (xx === 0) stx.moveTo(xx, yy); else stx.lineTo(xx, yy); } stx.stroke(); }); stx.globalAlpha = 1;
      var stt = mkTex(stc); stt.wrapS = stt.wrapT = THREE.RepeatWrapping; stt.repeat.set(4, 1);
      var RW = 34, RD = 30, RH = 9, wallM = new THREE.MeshBasicMaterial({ map: stt });
      [[RW * 2, 0, -RD, 0], [RW * 2, 0, RD, Math.PI], [RD * 2, -RW, 0, Math.PI / 2], [RD * 2, RW, 0, -Math.PI / 2]].forEach(function (wd) { var m = new THREE.Mesh(new THREE.PlaneGeometry(wd[0], RH), wallM); m.position.set(CX + wd[1], RH / 2 - 0.16, CZ + wd[2]); m.rotation.y = wd[3]; g.add(m); });
      var ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), new THREE.MeshBasicMaterial({ color: 0x030208 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(CX, RH - 0.16, CZ); g.add(ceil);
      [0x22e5ff, 0xff3df0, 0x7dff5a, 0xffb02e].forEach(function (c, k) { var tube = new THREE.Mesh(new THREE.BoxGeometry(RW * 2 - 2, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: c })); tube.position.set(CX, 1.2 + k * 1.6, CZ - RD + 0.1); g.add(tube); var tube2 = tube.clone(); tube2.position.z = CZ + RD - 0.1; g.add(tube2); });
      g.add(new THREE.AmbientLight(0xffffff, 0.6));
    }

    /* ---------- l'état du jeu ---------- */
    var me = { gid: 0, hole: 0, card: [], strokes: 0, done: false, over: false, overT: 0, waitT: -1, name: '', col: 0 };
    var ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, air: false, moving: false, sunk: false, sinkT: 0, safe: null, shotT: 0 };
    var cam = { yaw: 0, pitch: 0.42, dist: 3.2, tx: 0, ty: 0, tz: 0, view: false, init: false };
    var aim = { power: 0, drag: null, camDrag: null, space: false, spaceT: 0, bar: false };
    var keys = {}, remotes = {}, active = false, ui = null, sendT = 0, syncT = 0, hudT = 0, toastT = 0, others = [];
    function myName() { try { return String(state.username || '').slice(0, 20) || 'Invité'; } catch (e) { return 'Invité'; } }
    function cur() { return HOLES[Math.min(me.hole, NH - 1)]; }

    var ballGeo = new THREE.SphereGeometry(R, 20, 14);
    function ballMat(col) { return neon ? new THREE.MeshBasicMaterial({ color: col }) : new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.05 }); }
    var myBall = new THREE.Mesh(ballGeo, ballMat('#ffffff')); myBall.visible = false; g.add(myBall);
    var glowC = mkCanvas(64, 64), glx = glowC.getContext('2d'), glg = glx.createRadialGradient(32, 32, 2, 32, 32, 32); glg.addColorStop(0, 'rgba(255,255,255,0.9)'); glg.addColorStop(1, 'rgba(255,255,255,0)'); glx.fillStyle = glg; glx.fillRect(0, 0, 64, 64);
    var glowTex = mkTex(glowC);
    var myGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: neon ? 0.8 : 0.35 })); myGlow.scale.set(0.45, 0.45, 1); myGlow.visible = false; g.add(myGlow);
    // ligne de visée : une flèche posée au sol, qui s'allonge et rougit avec la puissance
    var aimG = new THREE.Group(); aimG.visible = false; g.add(aimG);
    var aimMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.9, depthWrite: false });
    var aimDots = []; for (i = 0; i < 12; i++) { var dot = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), aimMat); dot.rotation.x = -Math.PI / 2; aimG.add(dot); aimDots.push(dot); }
    var aimHeadShape = new THREE.Shape(); aimHeadShape.moveTo(0, 0.12); aimHeadShape.lineTo(-0.08, -0.02); aimHeadShape.lineTo(0.08, -0.02); aimHeadShape.closePath();
    var aimHead = new THREE.Mesh(new THREE.ShapeGeometry(aimHeadShape), aimMat); aimHead.rotation.x = -Math.PI / 2; aimG.add(aimHead);

    function placeBallAt(x, z) { var H = cur(); ball.x = x; ball.z = z; ball.y = floorH(H, x, z); ball.vx = ball.vz = ball.vy = 0; ball.air = false; ball.moving = false; ball.sunk = false; ball.safe = { x: x, z: z }; }
    function startHole(h, fresh) {
      me.hole = h; me.strokes = 0; me.done = false; me.waitT = -1;
      if (h >= NH) { me.over = true; me.overT = 14; showCard(true); return; }
      me.over = false;
      var H = HOLES[h]; placeBallAt(H.tee[0], H.tee[1]);
      cam.yaw = H.teeYaw; cam.pitch = 0.42; cam.dist = 3.2; cam.view = false; cam.init = false;
      if (!fresh) toast('⛳ Trou ' + (h + 1), H.name + ' · Par ' + H.par, '#ffffff', 2.2);
      sendState(true); refreshHud();
    }
    function newGame() { me.gid = Date.now(); me.card = []; me.over = false; showCard(false); startHole(0); }

    function shoot(power) {
      if (!active || ball.moving || ball.sunk || me.done || me.over || power < 0.03) return;
      var a = cam.yaw, sp = Math.pow(power, 1.15) * VMAX;
      ball.vx = Math.sin(a) * sp; ball.vz = -Math.cos(a) * sp; ball.vy = 0; ball.moving = true; ball.shotT = 0;
      ball.safe = { x: ball.x, z: ball.z };
      ball.ghost = {}; present().forEach(function (r) { if (Math.hypot(r.x - ball.x, r.z - ball.z) < R * 2.2) ball.ghost[r.name] = 1; });   // une balle posée au même endroit (le départ) ne nous repousse pas
      me.strokes++; SND.hit(power); sendState(true); refreshHud();
    }
    function soundCb(v, kind) { if (kind === 'bump') SND.bump(); else if (kind === 'land') SND.land(); else SND.wall(v); }
    function finishHole(score, how) {
      me.done = true; me.doneAt = performance.now(); me.card[me.hole] = score; ball.moving = false;
      var H = cur(), diff = score - H.par, label;
      if (how === 'max') label = ['Coups max', 'Trou terminé : ' + score + ' coups', '#ff8a80'];
      else if (how === 'time') label = ['⏱ Temps écoulé', score + ' coups', '#ff8a80'];
      else if (score === 1) { label = ['TROU EN UN !', '🎉 Incroyable !', '#ffd23f']; SND.ace(); }
      else label = diff <= -3 ? ['ALBATROS !', '🦅 ' + score + ' coups', '#ffd23f'] : diff === -2 ? ['EAGLE !', '🦅 ' + score + ' coups', '#ffd23f'] : diff === -1 ? ['BIRDIE !', '🐦 ' + score + ' coups', '#3ddc84'] : diff === 0 ? ['PAR', '👍 ' + score + ' coups', '#ffffff'] : diff === 1 ? ['BOGEY', score + ' coups', '#ffb02e'] : diff === 2 ? ['DOUBLE BOGEY', score + ' coups', '#ff8a80'] : ['+' + diff, score + ' coups', '#ff8a80'];
      toast(label[0], label[1], label[2], 2.6);
      sendState(true); refreshHud();
    }

    /* ---------- réseau ---------- */
    function sendState(force) {
      if (!world.rt || !world.rt.ready || !F.me()) return;
      try { world.rt.send('gb', { k: F.me(), n: me.name, c: me.col, gid: me.gid, h: me.hole, s: me.strokes, d: me.done ? 1 : 0, o: me.over ? 1 : 0, card: me.card.slice(0, NH), x: +ball.x.toFixed(3), y: +ball.y.toFixed(3), z: +ball.z.toFixed(3), m: ball.moving ? 1 : 0, sk: ball.sunk ? 1 : 0 }); } catch (e) { /* ok */ }
    }
    room.onRtMsg = function (ev, m) {
      if (ev === 'gbye') { dropRemote(m.k); return; }
      if (ev !== 'gb' || !active) return;
      var x = +m.x, y = +m.y, z = +m.z; if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
      var r = remotes[m.k];
      if (!r) {
        var col = BALL_COLORS[(+m.c | 0) % BALL_COLORS.length];
        r = remotes[m.k] = { name: String(m.n || m.k).slice(0, 20), col: col, mesh: new THREE.Mesh(ballGeo, ballMat(col)), tag: nameSprite(String(m.n || m.k), col), x: x, y: y, z: z };
        g.add(r.mesh); g.add(r.tag);
      }
      r.gid = +m.gid || 0; r.h = +m.h | 0; r.s = +m.s | 0; r.d = !!m.d; r.o = !!m.o; r.sk = !!m.sk; r.card = Array.isArray(m.card) ? m.card.slice(0, NH).map(function (v) { return v == null ? null : +v; }) : [];
      r.tx = x; r.ty = y; r.tz = z; r.recv = performance.now();
    };
    function dropRemote(k) { var r = remotes[k]; if (!r) return; g.remove(r.mesh); g.remove(r.tag); r.tag.material.map.dispose(); delete remotes[k]; }
    function present() { var now = performance.now(), out = []; Object.keys(remotes).forEach(function (k) { var r = remotes[k]; if (now - r.recv > 6000) dropRemote(k); else out.push(r); }); return out; }
    // tout le monde joue la même partie : on rejoint la plus ancienne en cours, et on passe au trou suivant quand tout le monde a fini
    function syncGame() {
      var P = present();
      var older = P.filter(function (r) { return r.gid && r.gid < me.gid && !r.o && r.h < NH; });
      if (older.length) {
        var gid = Math.min.apply(null, older.map(function (r) { return r.gid; })), mates = older.filter(function (r) { return r.gid === gid; }), h = Math.max.apply(null, mates.map(function (r) { return r.h; }));
        me.gid = gid; me.card = []; showCard(false); startHole(h, true);
        toast('👋 Tu rejoins la partie', 'Trou ' + (h + 1) + ' / ' + NH, '#ffffff', 2.6);
        return;
      }
      if (me.over) return;
      var same = P.filter(function (r) { return r.gid === me.gid; });
      if (me.done) {
        var allDone = same.every(function (r) { return r.h > me.hole || (r.h === me.hole && r.d); });
        if (allDone && performance.now() - (me.doneAt || 0) > 2600) startHole(me.hole + 1);   // on laisse le temps de voir son score
      } else if (me.waitT < 0 && same.some(function (r) { return r.h > me.hole || (r.h === me.hole && r.d); })) me.waitT = WAIT_S;
    }

    /* ---------- interface ---------- */
    function buildUi() {
      injectCss();
      var el = document.createElement('div'); el.className = 'gf-hud';
      el.innerHTML = '<div class="gf-info"><div class="c"></div><div class="h"></div><div class="s"></div><div class="t"></div></div><div class="gf-pl"></div>' +
        '<div class="gf-btns"><button data-a="reset">↺ Replacer<kbd>R</kbd></button><button data-a="view">👁 Voir le trou<kbd>V</kbd></button><button data-a="card">📋 Scores<kbd>Tab</kbd></button><button data-a="quit">🚪 Quitter</button></div>' +
        '<div class="gf-pow"><div class="f"></div><div class="l">TIRE</div></div><div class="gf-toast"></div>' +
        '<div class="gf-help">' + (world.touch ? 'Glisse pour viser · tire la barre vers le bas puis relâche pour frapper' : 'Clic gauche maintenu + tire la souris vers toi, relâche pour frapper · clic droit ou ← → : viser · molette : zoom · Espace : jauge') + '</div>' +
        '<div class="gf-card"></div>';
      world.container.appendChild(el);
      el.querySelector('.gf-btns').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; var a = b.dataset.a;
        if (a === 'reset') doReset(); else if (a === 'view') cam.view = !cam.view; else if (a === 'card') showCard(!ui.card.classList.contains('on')); else if (a === 'quit') world.goRoom('golf', cid);
      });
      var pow = el.querySelector('.gf-pow');
      pow.addEventListener('pointerdown', function (e) { if (!canShoot()) return; aim.bar = { top: pow.getBoundingClientRect().top, h: pow.clientHeight }; aim.power = 0; try { pow.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } e.stopPropagation(); e.preventDefault(); });
      pow.addEventListener('pointermove', function (e) { if (!aim.bar) return; aim.power = Math.max(0, Math.min(1, (e.clientY - aim.bar.top) / aim.bar.h)); });
      var up = function () { if (!aim.bar) return; aim.bar = null; var p = aim.power; aim.power = 0; shoot(p); };
      pow.addEventListener('pointerup', up); pow.addEventListener('pointercancel', function () { aim.bar = null; aim.power = 0; });
      return { el: el, info: el.querySelector('.gf-info'), pl: el.querySelector('.gf-pl'), pow: pow, powF: pow.querySelector('.f'), toast: el.querySelector('.gf-toast'), card: el.querySelector('.gf-card') };
    }
    function toast(t, sub, col, dur) {
      if (!ui) return; var e = ui.toast; e.style.color = col || '#fff'; e.innerHTML = esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : ''); e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); toastT = dur || 2.4;
    }
    function scoreTotal(card) { var t = 0, p = 0; for (var h = 0; h < NH; h++) { if (card[h] == null) continue; t += card[h]; p += HOLES[h].par; } return { t: t, rel: t - p }; }
    function relTxt(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); }
    function refreshHud() {
      if (!ui) return;
      var H = cur(), q = ui.info;
      q.querySelector('.c').textContent = C.name;
      q.querySelector('.h').innerHTML = me.over ? 'Partie terminée' : 'Trou ' + (me.hole + 1) + '/' + NH + '<small>Par ' + H.par + '</small>';
      q.querySelector('.s').textContent = me.over ? '' : me.done ? '✅ Dans le trou · ' + me.card[me.hole] + ' coup' + (me.card[me.hole] > 1 ? 's' : '') : 'Coups : ' + me.strokes + ' / ' + MAXSHOTS;
      q.querySelector('.t').textContent = me.over ? 'Nouvelle partie dans ' + Math.ceil(me.overT) + ' s' : me.done ? '⏳ On attend les autres…' : me.waitT >= 0 ? '⏱ ' + Math.ceil(me.waitT) + ' s pour finir' : '';
      var rows = [{ name: me.name + ' (toi)', col: BALL_COLORS[me.col], card: me.card, h: me.hole, d: me.done, s: me.strokes }];
      present().forEach(function (r) { if (r.gid === me.gid) rows.push({ name: r.name, col: r.col, card: r.card, h: r.h, d: r.d, s: r.s }); });
      ui.pl.innerHTML = rows.map(function (r) { var st = scoreTotal(r.card); return '<div><i style="background:' + r.col + ';color:' + r.col + '"></i>' + esc(r.name) + '<b>' + (r.d ? '⛳ ' : r.h < NH ? r.s + ' · ' : '') + relTxt(st.rel) + '</b></div>'; }).join('');
      ui.pow.classList.toggle('off', !canShoot());
      if (ui.card.classList.contains('on')) showCard(true);
    }
    function showCard(on) {
      if (!ui) return;
      ui.card.classList.toggle('on', !!on); if (!on) return;
      var rows = [{ name: me.name, col: BALL_COLORS[me.col], card: me.card }];
      present().forEach(function (r) { if (r.gid === me.gid) rows.push({ name: r.name, col: r.col, card: r.card }); });
      if (me.over) rows.sort(function (a, b) { var A = scoreTotal(a.card), B = scoreTotal(b.card), ma = NH - a.card.filter(function (v) { return v != null; }).length, mb = NH - b.card.filter(function (v) { return v != null; }).length; return (A.t + ma * 99) - (B.t + mb * 99); });
      var html = '<h3>' + (me.over ? '🏆 Classement — ' : '📋 ') + esc(C.name) + '</h3><table><tr><th></th>' + HOLES.map(function (H, k) { return '<th>' + (k + 1) + '</th>'; }).join('') + '<th>Total</th></tr><tr class="par"><td>Par</td>' + HOLES.map(function (H) { return '<td>' + H.par + '</td>'; }).join('') + '<td>' + HOLES.reduce(function (a, H) { return a + H.par; }, 0) + '</td></tr>';
      rows.forEach(function (r, ri) {
        var st = scoreTotal(r.card);
        html += '<tr><td>' + (me.over ? ['🥇 ', '🥈 ', '🥉 '][ri] || '' : '') + '<span style="color:' + r.col + '">●</span> ' + esc(r.name) + '</td>' + HOLES.map(function (H, k) { var v = r.card[k]; return '<td class="' + (v == null ? '' : v < H.par ? 'u' : v > H.par ? 'o' : '') + '">' + (v == null ? '—' : v) + '</td>'; }).join('') + '<td class="tot">' + st.t + ' (' + relTxt(st.rel) + ')</td></tr>';
      });
      html += '</table><div class="ft">' + (me.over ? 'Nouvelle partie dans ' + Math.ceil(me.overT) + ' s' : 'Tab ou 📋 pour fermer') + '</div>';
      ui.card.innerHTML = html;
    }
    function canShoot() { return active && !ball.moving && !ball.sunk && !me.done && !me.over && world.blend > 0.95; }
    function doReset() {
      if (!active || me.done || me.over || ball.sunk) return;
      var s = ball.safe || { x: cur().tee[0], z: cur().tee[1] };
      if (!ball.moving && Math.hypot(ball.x - s.x, ball.z - s.z) < 0.05) return;
      placeBallAt(s.x, s.z); me.strokes++; toast('↺ Replacé', '+1 coup', '#ffb02e', 1.6); afterStroke(); sendState(true); refreshHud();
    }
    function afterStroke() { if (me.strokes >= MAXSHOTS && !me.done) finishHole(MAXSHOTS + 1, 'max'); }

    /* ---------- commandes ---------- */
    function onDown(e) {
      if (!active || world.mode !== 'seat') return;
      if (e.pointerType === 'mouse' && e.button === 0 && canShoot()) { aim.drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw }; aim.power = 0; }
      else if (e.pointerType !== 'mouse' || e.button === 2 || e.button === 1) aim.camDrag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
    }
    function onMove(e) {
      if (aim.drag) { var hh = Math.max(240, world.container.clientHeight * 0.32); aim.power = Math.max(0, Math.min(1, (e.clientY - aim.drag.y) / hh)); cam.yaw = aim.drag.yaw + (e.clientX - aim.drag.x) * 0.0025; }
      else if (aim.camDrag) { cam.yaw = aim.camDrag.yaw + (e.clientX - aim.camDrag.x) * 0.006; cam.pitch = Math.max(0.12, Math.min(1.35, aim.camDrag.pitch + (e.clientY - aim.camDrag.y) * 0.004)); }
    }
    function onUp() {
      if (aim.drag) { aim.drag = null; var p = aim.power; aim.power = 0; shoot(p); }
      aim.camDrag = null;
    }
    function onWheel(e) { if (!active) return; cam.dist = Math.max(1.4, Math.min(9, cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); e.preventDefault(); }
    function onCtx(e) { if (active) e.preventDefault(); }
    var GAME_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1, KeyQ: 1, KeyE: 1, Space: 1, KeyR: 1, KeyV: 1, Tab: 1 };
    function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); }
    function onKey(e) {
      if (!active || world.mode !== 'seat' || typing() || !GAME_KEYS[e.code]) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown') {
        if (e.repeat && keys[e.code]) return;
        keys[e.code] = true;
        if (e.code === 'Space' && canShoot()) { aim.space = true; aim.spaceT = 0; aim.power = 0; }
        else if (e.code === 'KeyR') doReset(); else if (e.code === 'KeyV') cam.view = !cam.view; else if (e.code === 'Tab') showCard(!ui.card.classList.contains('on'));
      } else {
        keys[e.code] = false;
        if (e.code === 'Space' && aim.space) { aim.space = false; var p = aim.power; aim.power = 0; shoot(p); }
      }
    }
    function bind(on) {
      var f = on ? 'addEventListener' : 'removeEventListener', d = world.dom;
      d[f]('pointerdown', onDown); window[f]('pointermove', onMove); window[f]('pointerup', onUp); window[f]('pointercancel', onUp);
      d[f]('wheel', onWheel, { passive: false }); d[f]('contextmenu', onCtx);
      window[f]('keydown', onKey, true); window[f]('keyup', onKey, true);
    }

    /* ---------- entrée / sortie ---------- */
    room.spawn = function () { var H = HOLES[0]; return { x: H.tee[0], z: H.tee[1] + 3, yaw: H.teeYaw }; };
    room.onEnter = function (w) {
      active = true; me.name = myName(); me.col = hashStr(me.name) % BALL_COLORS.length;
      myBall.material.dispose(); myBall.material = ballMat(BALL_COLORS[me.col]); myBall.visible = true; myGlow.material.color.set(BALL_COLORS[me.col]); myGlow.visible = true;
      bgOld = world.scene.background; world.scene.background = new THREE.Color(skyCol);
      ui = buildUi(); bind(true);
      newGame();
      w.sitDown(room);
      syncT = 1.2;                                        // on laisse le temps aux autres de se signaler avant de démarrer seul
    };
    function cleanup() {
      if (!active) return;
      active = false; bind(false); keys = {}; aim.drag = aim.camDrag = aim.bar = null; aim.space = false;
      if (world.rt && world.rt.ready && F.me()) { try { world.rt.send('gbye', { k: F.me() }); } catch (e) { /* ok */ } }
      Object.keys(remotes).forEach(dropRemote);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (bgOld) world.scene.background = bgOld;
      myBall.visible = myGlow.visible = aimG.visible = false;
    }
    room.forceStand = function () { var H = cur(); cleanup(); world.standUp(H.tee[0], H.tee[1] + 2, H.teeYaw); };
    room.onLeave = function () { cleanup(); };
    room.onPageHide = function () { cleanup(); };
    room.seatPos = function () { return null; };
    room.hint = function (w) { return w.touch ? 'Glisse pour viser · tire la barre de puissance vers le bas puis relâche' : 'Clic gauche maintenu, tire vers toi et relâche pour frapper · clic droit / ← → : viser · R : replacer · V : voir le trou · Tab : scores'; };

    room.seatPose = function (dt) {
      var H = cur(), bx = ball.x, by = ball.y, bz = ball.z;
      if (!cam.init) { cam.tx = bx; cam.ty = by; cam.tz = bz; cam.init = true; }
      var k = 1 - Math.exp(-dt * (ball.moving ? 6 : 9));
      cam.tx += (bx - cam.tx) * k; cam.ty += (by - cam.ty) * k; cam.tz += (bz - cam.tz) * k;
      if (cam.view) {                                    // vue d'ensemble du trou, de haut
        var cx0 = (H.box[0] + H.box[2]) / 2, cz0 = (H.box[1] + H.box[3]) / 2, sz = Math.max(H.box[2] - H.box[0], H.box[3] - H.box[1]);
        return { cx: cx0 - Math.sin(cam.yaw) * sz * 0.35, cy: H.maxH + sz * 0.95 + 2, cz: cz0 + Math.cos(cam.yaw) * sz * 0.35, tx: cx0, ty: H.minH, tz: cz0, fov: 60 };
      }
      var cp = Math.cos(cam.pitch), d = cam.dist;
      return { cx: cam.tx - Math.sin(cam.yaw) * cp * d, cy: cam.ty + 0.12 + Math.sin(cam.pitch) * d, cz: cam.tz + Math.cos(cam.yaw) * cp * d, tx: cam.tx + Math.sin(cam.yaw) * 0.6, ty: cam.ty + 0.1, tz: cam.tz - Math.cos(cam.yaw) * 0.6, fov: world.w / Math.max(1, world.h) < 0.9 ? 70 : 62 };
    };

    /* ---------- la boucle ---------- */
    room.update = function (dt) {
      var t = nowS(), i2;
      // obstacles qui bougent (même heure pour tout le monde), bumpers qui clignotent, drapeaux qui flottent
      HOLES.forEach(function (H) {
        H.dyn.forEach(function (d) {
          var o = d.o;
          if (o.t === 'mill') { d.mesh.rotation.y = -o.speed * t; if (d.sails) d.sails.rotation.x = t * 1.4; }
          else { var s = Math.sin(o.speed * t) * o.amp; d.mesh.position.set(d.x + (o.ax === 'x' ? s : 0), d.h, d.z + (o.ax === 'z' ? s : 0)); }
        });
        if (H.flag) H.flag.rotation.y = Math.sin(t * 2.2 + H.cup[0]) * 0.35;
      });
      bumpGlow.forEach(function (c) { if (c.flash > 0) { c.flash = Math.max(0, c.flash - dt * 3); var s = 1 + c.flash * 0.35; c.mesh.scale.set(s, 1, s); c.ring.scale.set(s, s, s); } });
      if (!active) return;
      var H = cur();
      // touches : viser et jauge à l'Espace
      var turn = (keys.ArrowLeft || keys.KeyA || keys.KeyQ ? -1 : 0) + (keys.ArrowRight || keys.KeyD || keys.KeyE ? 1 : 0);
      if (turn) cam.yaw += turn * dt * 1.5;
      var tilt = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
      if (tilt) cam.pitch = Math.max(0.12, Math.min(1.35, cam.pitch + tilt * dt * 0.9));
      if (aim.space) { aim.spaceT += dt; var ph = (aim.spaceT * 0.75) % 2; aim.power = ph < 1 ? ph : 2 - ph; }
      // ma balle
      others.length = 0;
      present().forEach(function (r) { if (r.gid === me.gid && r.h === me.hole && !r.d && !r.sk && !(ball.ghost && ball.ghost[r.name])) others.push({ x: r.x, z: r.z, r: R, y0: r.y - 0.2, y1: r.y + 0.2, e: 0.85 }); });
      if (ball.moving && !ball.sunk) {
        ball.shotT += dt;
        var sp = Math.hypot(ball.vx, ball.vz, ball.vy), n = Math.min(40, Math.max(1, Math.ceil(sp * dt / 0.02))), sub = dt / n, res = '';
        for (i2 = 0; i2 < n && !res; i2++) res = simStep(ball, H, sub, t, others, soundCb);
        if (res === 'cup') { ball.sunk = true; ball.sinkT = 0; ball.moving = false; SND.cup(); finishHole(me.strokes, ''); }
        else if (res === 'out') {
          if (H.spec.water && !neon) SND.splash(); else SND.fall();
          toast(H.spec.water && !neon ? '💦 Plouf !' : '🌌 Dans le vide !', '+1 coup', '#3fa9ff', 1.8);
          me.strokes++; placeBallAt(ball.safe.x, ball.safe.z); afterStroke(); sendState(true); refreshHud();
        } else {
          var flr = floorAt(H, ball.x, ball.z, ball.y + 0.12), steep = flr ? Math.hypot(flr.f.gx, flr.f.gz) : 0;
          if (!ball.air && Math.hypot(ball.vx, ball.vz) < 0.07 && (steep < 0.02 || ball.shotT > 20)) { ball.vx = ball.vz = ball.vy = 0; ball.moving = false; sendState(true); afterStroke(); refreshHud(); }
        }
      }
      if (ball.sunk) { ball.sinkT += dt; ball.x += (H.cup[0] - ball.x) * Math.min(1, dt * 12); ball.z += (H.cup[1] - ball.z) * Math.min(1, dt * 12); }
      var sinkY = ball.sunk ? -Math.min(0.2, ball.sinkT * 0.6) : 0;
      myBall.position.set(ball.x, ball.y + R + sinkY, ball.z); myBall.visible = !(ball.sunk && ball.sinkT > 0.4) && !me.over;
      myBall.rotation.x += ball.vz * dt / R; myBall.rotation.z -= ball.vx * dt / R;
      myGlow.position.copy(myBall.position); myGlow.visible = myBall.visible;
      // la visée
      var showAim = canShoot();
      aimG.visible = showAim;
      if (showAim) {
        var pw = aim.power, len = 0.35 + pw * 2.4, ax = Math.sin(cam.yaw), az = -Math.cos(cam.yaw);
        aimMat.color.setHSL(0.33 * (1 - pw), 0.9, 0.55);
        aimDots.forEach(function (dt2, k) { var u = (k + 1) / (aimDots.length + 1) * len, px = ball.x + ax * u, pz = ball.z + az * u; dt2.position.set(px, floorH(H, px, pz) + 0.012, pz); var s3 = 0.7 + pw * 0.6; dt2.scale.set(s3, s3, s3); });
        var hx = ball.x + ax * (len + 0.08), hz = ball.z + az * (len + 0.08); aimHead.position.set(hx, floorH(H, hx, hz) + 0.013, hz); aimHead.rotation.z = -cam.yaw; var s4 = 0.9 + pw * 0.8; aimHead.scale.set(s4, s4, s4);
      }
      if (ui) { ui.powF.style.height = Math.round(aim.power * 100) + '%'; }
      // balles des autres
      var kk = 1 - Math.exp(-dt * 12);
      Object.keys(remotes).forEach(function (k) {
        var r = remotes[k]; r.x += (r.tx - r.x) * kk; r.y += (r.ty - r.y) * kk; r.z += (r.tz - r.z) * kk;
        var vis = !r.o && !(r.sk);
        r.mesh.visible = vis; r.mesh.position.set(r.x, r.y + R, r.z);
        r.tag.visible = vis && Math.hypot(r.x - ball.x, r.z - ball.z) < 25; r.tag.position.set(r.x, r.y + 0.42, r.z);
      });
      // déroulement de la partie
      syncT -= dt; if (syncT <= 0) { syncT = 0.5; syncGame(); }
      if (me.waitT >= 0 && !me.done) { me.waitT -= dt; if (me.waitT <= 0) { me.waitT = -1; finishHole(Math.min(MAXSHOTS + 1, Math.max(me.strokes + 2, H.par + 3)), 'time'); } }
      if (me.over) { me.overT -= dt; if (me.overT <= 0) newGame(); }
      sendT -= dt; if (sendT <= 0) { sendT = ball.moving || aim.power > 0 ? 0.09 : 1.0; sendState(); }
      hudT -= dt; if (hudT <= 0) { hudT = 0.3; refreshHud(); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && ui) ui.toast.classList.remove('in'); }
    };
    return room;
  }

  /* ==================================================================
     LA SALLE D'ACCUEIL DU GOLF : une porte par parcours
     ================================================================== */
  function createLobby(world) {
    var HX = 9, HZ = 6.5, H = 4.6, low = world.low;
    var room = { title: '⛳ MINI GOLF', subtitle: 'CHOISIS TON PARCOURS', topic: 'flambeurs-golf-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#2b8f45'; fx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 8; i++) { fx.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; fx.fillRect(i * 32, 0, 32, 256); }
    var ft = mkTex(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX / 2, HZ / 2);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wm = new THREE.MeshStandardMaterial({ color: 0x163a26, roughness: 0.85 });
    function wall(len, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wm); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a120c })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    // un petit green au centre : drapeau et trou, pour le décor
    var hole = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0x050505 })); hole.rotation.x = -Math.PI / 2; hole.position.set(0, 0.006, 0.5); g.add(hole);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); pole.position.set(0, 0.75, 0.5); g.add(pole);
    var fcv = mkCanvas(128, 80), fcx = fcv.getContext('2d'); fcx.fillStyle = '#e8392f'; fcx.fillRect(0, 0, 128, 80); fcx.fillStyle = '#fff'; fcx.font = '900 50px ' + SERIF; fcx.textAlign = 'center'; fcx.textBaseline = 'middle'; fcx.fillText('⛳', 64, 42);
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshBasicMaterial({ map: mkTex(fcv), side: THREE.DoubleSide })), fg = new THREE.Group(); flag.position.x = 0.25; fg.position.set(0, 1.35, 0.5); fg.add(flag); g.add(fg);
    room.colliders.push({ x: 0, z: 0.5, r: 0.3 });
    // panneau
    var sc = mkCanvas(1024, 360), sx = sc.getContext('2d'); sx.fillStyle = 'rgba(6,14,9,0.92)'; sx.fillRect(0, 0, 1024, 360); sx.strokeStyle = '#5dff8a'; sx.lineWidth = 10; sx.strokeRect(16, 16, 992, 328);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#5dff8a'; sx.shadowColor = '#5dff8a'; sx.shadowBlur = 22; sx.font = '900 112px ' + SERIF; sx.fillText('MINI GOLF', 512, 130); sx.shadowBlur = 0;
    sx.fillStyle = '#f4ead2'; sx.font = '700 40px ' + SERIF; sx.fillText('Jouez tous en même temps · le moins de coups gagne', 512, 232, 940); sx.fillStyle = '#ffd23f'; sx.font = '800 34px ' + MONO; sx.fillText('GRATUIT · POUR LE FUN', 512, 295);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 2.11), new THREE.MeshBasicMaterial({ map: mkTex(sc) })); sign.position.set(0, 3.0, -HZ + 0.05); g.add(sign);
    g.add(new THREE.AmbientLight(0xeaf6ee, 1.15));
    if (!low) { var l = new THREE.PointLight(0xfff2d0, 0.8, 14); l.position.set(0, 3.8, 0); g.add(l); }
    world.addDoor(room, { x: -6, z: -HZ, nx: 0, nz: 1, w: 2.2, h: 3.0, label: COURSES.golfjardin.title, sub: 'DEHORS · ' + COURSES.golfjardin.holes.length + ' TROUS', color: 0x5dff8a, target: 'golfjardin' });
    world.addDoor(room, { x: 6, z: -HZ, nx: 0, nz: 1, w: 2.2, h: 3.0, label: COURSES.golfneon.title, sub: 'DEDANS · ' + COURSES.golfneon.holes.length + ' TROUS', color: 0xff3df0, target: 'golfneon' });
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🎮 MINI JEUX', sub: 'RETOUR AU SALON', color: 0xffd24a, target: 'minijeux', theme: 'exitUno' });
    room.spawn = function (from) {
      if (from === 'golfjardin') return { x: -6, z: -HZ + 2.6, yaw: F.yawFor(0, 1) };
      if (from === 'golfneon') return { x: 6, z: -HZ + 2.6, yaw: F.yawFor(0, 1) };
      return { x: 0, z: HZ - 2.6, yaw: 0 };
    };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · avance vers la porte du parcours' : 'ZQSD / flèches : marcher · avance vers la porte du parcours que tu veux' + (w.full ? ' · Échap : quitter' : ''); };
    room.update = function (dt) { fg.rotation.y = Math.sin(performance.now() / 500) * 0.3; };
    return room;
  }

  F.registerRoom('golf', createLobby);
  Object.keys(COURSES).forEach(function (cid) { F.registerRoom(cid, function (w) { return createCourse(w, cid); }); });
  F.golf = { COURSES: COURSES, buildHoleData: buildHoleData, simStep: simStep, floorAt: floorAt };   // (pour les tests)
})();
