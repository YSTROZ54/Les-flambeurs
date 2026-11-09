/* =====================================================================
   kart-decor.js — le décor du circuit de nuit : ville dense, lampadaires, panneaux de virage, portiques, tribunes, grande roue
   ---------------------------------------------------------------------
   Tout est construit en code (aucun modèle à télécharger) et FUSIONNÉ en quelques gros maillages (une dizaine d'appels de dessin pour des centaines
   de bâtiments). Les immeubles sont alignés sur la route, de chaque côté, sur plusieurs rangées : on est entouré dès le premier virage.
   F3D.kartDecor.build(groupe, { TRK, KS, mkCanvas, mkTex, rng, SERIF }) → { update(dt) }
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F) return;
  var TAU = Math.PI * 2;

  // ---------- tampons de géométrie fusionnée ----------
  function Buf(col) { return { p: [], u: col ? null : [], c: col ? [] : null, i: [] }; }
  function vtx(b, x, y, z, u, v, c) { var n = b.p.length / 3; b.p.push(x, y, z); if (b.u) b.u.push(u, v); if (b.c) b.c.push(c[0], c[1], c[2]); return n; }
  function quad(b, A, B, C, D, uv, c) {                                    // quatre coins [x,y,z] ; uv = [u0,v0,u1,v1]
    var a = vtx(b, A[0], A[1], A[2], uv ? uv[0] : 0, uv ? uv[1] : 0, c), bb = vtx(b, B[0], B[1], B[2], uv ? uv[2] : 0, uv ? uv[1] : 0, c), cc = vtx(b, C[0], C[1], C[2], uv ? uv[2] : 0, uv ? uv[3] : 0, c), d = vtx(b, D[0], D[1], D[2], uv ? uv[0] : 0, uv ? uv[3] : 0, c);
    b.i.push(a, bb, cc, a, cc, d);
  }
  function toMesh(b, mat) {
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    if (b.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); if (b.c) g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    g.setIndex(b.i); var m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
  }
  function hexRgb(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
  // pied d'un bloc tourné : renvoie les 4 coins au sol
  function corners(cx, cz, w, d, rot) {
    var cs = Math.cos(rot), sn = Math.sin(rot), L = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    return L.map(function (q) { return [cx + q[0] * cs - q[1] * sn, cz + q[0] * sn + q[1] * cs]; });
  }
  // bloc plein de couleur unie (toit, mât, néon, poteau…)
  function solidBox(b, cx, cz, w, d, rot, y0, y1, col, noTop) {
    var K = corners(cx, cz, w, d, rot), c = hexRgb(col), k;
    for (k = 0; k < 4; k++) { var A = K[k], B = K[(k + 1) % 4]; quad(b, [A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]], null, c); }
    if (!noTop) quad(b, [K[0][0], y1, K[0][1]], [K[1][0], y1, K[1][1]], [K[2][0], y1, K[2][1]], [K[3][0], y1, K[3][1]], null, c);
  }

  function build(g, C) {
    var TRK = C.TRK, KS = C.KS, N = TRK.N, WALL_OFF = KS.WALL_OFF, mkCanvas = C.mkCanvas, mkTex = C.mkTex, rng = C.rng, SERIF = C.SERIF, rnd = rng(4242), upd = [], i, k;
    var tmp = {}, tmp2 = {};

    /* ---------- les façades : 6 styles de fenêtres (une tuile = 6 travées × 4 étages = 18 m × 14,4 m) ---------- */
    var TILE_W = 18, TILE_H = 14.4;
    function winTex(seed, st) {
      var c = mkCanvas(256, 256), x = c.getContext('2d'), r = rng(seed), bays = st.bays || 6, floors = 4, bw = 256 / bays, fh = 64, f, b;
      x.fillStyle = st.bg; x.fillRect(0, 0, 256, 256);
      for (f = 0; f < floors; f++) for (b = 0; b < bays; b++) {
        var lit = r() < st.lit, col = lit ? st.pal[Math.floor(r() * st.pal.length)] : st.dark, gx = b * bw, gy = f * fh;
        if (st.band) { x.fillStyle = col; x.fillRect(gx, gy + fh * 0.16, bw + 0.5, fh * 0.58); if (lit) { x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(gx, gy + fh * 0.16, bw, fh * 0.1); } }
        else {
          x.fillStyle = col; x.fillRect(gx + bw * 0.13, gy + fh * 0.15, bw * 0.74, fh * 0.64);
          if (lit) { x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(gx + bw * 0.13, gy + fh * 0.15, bw * 0.74, fh * 0.12); }
          if (st.balcony) { x.fillStyle = st.rail; x.fillRect(gx + bw * 0.06, gy + fh * 0.8, bw * 0.88, 5); }
        }
      }
      x.fillStyle = st.line; for (f = 0; f <= floors; f++) x.fillRect(0, f * fh - 1.5, 256, 3);
      var t = mkTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
    }
    var STYLES = [
      { bg: '#161c38', dark: '#202e5a', pal: ['#ffd98a', '#fff3c4', '#ffe9a8', '#bfe4ff'], lit: 0.5, line: '#0b0f22' },
      { bg: '#0e1428', dark: '#1d3a6e', pal: ['#8fe8ff', '#e8fbff', '#ffffff'], lit: 0.55, band: true, line: '#080b1a' },
      { bg: '#2a2636', dark: '#16141f', pal: ['#ffcf80', '#ffb860', '#ffe6b0'], lit: 0.38, balcony: true, rail: '#555064', line: '#141220', bays: 6 },
      { bg: '#201f3a', dark: '#2a2850', pal: ['#ff9ad8', '#ffd0ee', '#c8a8ff'], lit: 0.5, line: '#0d0c1e' },
      { bg: '#18262e', dark: '#22404c', pal: ['#aaffd8', '#e0fff0', '#ffe9a0'], lit: 0.5, band: true, line: '#0a1418' },
      { bg: '#2c2433', dark: '#1d1624', pal: ['#ffd070', '#fff0c0', '#ff9a50'], lit: 0.6, line: '#120d18', bays: 8 }
    ];
    var winMats = STYLES.map(function (s, k) { return new THREE.MeshBasicMaterial({ map: winTex(11 + k * 7, s), side: THREE.DoubleSide }); });
    var winBuf = STYLES.map(function () { return Buf(false); }), miscBuf = Buf(true), beacons = [], placed = [];

    // un immeuble : pied (cx,cz,w,d), orientation rot, hauteur h, style de fenêtres
    function tower(cx, cz, w, d, rot, y0, y1, sty, accent) {
      var K = corners(cx, cz, w, d, rot), b = winBuf[sty], j, ou = rnd() * 4, ov = rnd();
      for (j = 0; j < 4; j++) {
        var A = K[j], B = K[(j + 1) % 4], len = Math.hypot(B[0] - A[0], B[1] - A[1]), u1 = len / TILE_W;
        quad(b, [A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]], [ou, y0 / TILE_H + ov, ou + u1, y1 / TILE_H + ov]);
      }
      solidBox(miscBuf, cx, cz, w - 0.2, d - 0.2, rot, y1, y1 + 0.5, 0x242840);                         // toit
      if (accent) solidBox(miscBuf, cx, cz, w + 0.25, d + 0.25, rot, y1 - 1.1, y1 - 0.45, accent, true);  // bande néon sous le toit
      return K;
    }
    function roofStuff(cx, cz, w, d, rot, y1, tall) {
      var cs = Math.cos(rot), sn = Math.sin(rot), n = 1 + Math.floor(rnd() * 3), j;
      for (j = 0; j < n; j++) { var lx = (rnd() - 0.5) * w * 0.6, lz = (rnd() - 0.5) * d * 0.6, bw = 1.6 + rnd() * 3; solidBox(miscBuf, cx + lx * cs - lz * sn, cz + lx * sn + lz * cs, bw, bw * 0.8, rot, y1 + 0.5, y1 + 1.4 + rnd() * 1.4, 0x3a3f58); }
      if (tall) { var h = 6 + rnd() * 22; solidBox(miscBuf, cx, cz, 0.35, 0.35, rot, y1 + 0.5, y1 + 0.5 + h, 0x6a6f8a); beacons.push(cx, y1 + 0.6 + h, cz); }
    }
    var ACC = [0x22e5ff, 0xff3df0, 0xffb02e, 0x7a5aff, 0x3dff9a, 0xff5a5a];

    /* ---------- placement : rangées de chaque côté de la route, alignées dessus ---------- */
    function free(x, z, rad) {
      if (TRK.project(x, z).dist < WALL_OFF + 5 + rad) return false;
      for (var q = 0; q < placed.length; q += 3) { var dx = placed[q] - x, dz = placed[q + 1] - z, rr = placed[q + 2] + rad + 1.5; if (dx * dx + dz * dz < rr * rr) return false; }
      return true;
    }
    var nB = 0;
    function addBuilding(x, z, rot, layer, nearRoad) {
      var w = 14 + rnd() * 20, d = 14 + rnd() * 18, rad = Math.hypot(w, d) / 2 * 0.98;
      if (z > 90 && z < 310 && x > -200 && x < 260) return;                         // la baie
      if (!free(x, z, rad)) return;
      var kind = rnd(), h, sty = Math.floor(rnd() * STYLES.length), ac = rnd() < 0.5 ? ACC[Math.floor(rnd() * ACC.length)] : 0;
      placed.push(x, z, rad); nB++;
      if (kind < 0.18) {                                                           // petit immeuble de commerces + enseigne
        h = 12 + rnd() * 14; tower(x, z, w, d, rot, 0, h, sty, ac || ACC[nB % ACC.length]); roofStuff(x, z, w, d, rot, h, false);
      } else if (kind < 0.5) {                                                     // tour simple
        h = (nearRoad ? 28 : 40) + rnd() * (nearRoad ? 45 : 110); tower(x, z, w, d, rot, 0, h, sty, ac); roofStuff(x, z, w, d, rot, h, h > 60);
      } else if (kind < 0.78) {                                                    // socle + tour en retrait
        var ph = 7 + rnd() * 6; tower(x, z, w + 6, d + 6, rot, 0, ph, (sty + 1) % STYLES.length, ac || ACC[nB % ACC.length]);
        h = ph + 25 + rnd() * 90; tower(x, z, w * 0.72, d * 0.72, rot, ph + 0.5, h, sty, ac); roofStuff(x, z, w * 0.72, d * 0.72, rot, h, h > 70);
      } else {                                                                     // tour à gradins
        var h1 = 20 + rnd() * 30, h2 = h1 + 18 + rnd() * 40, h3 = h2 + 14 + rnd() * 40;
        tower(x, z, w, d, rot, 0, h1, sty, 0); tower(x, z, w * 0.8, d * 0.8, rot, h1 + 0.5, h2, sty, ac); tower(x, z, w * 0.55, d * 0.55, rot, h2 + 0.5, h3, sty, ac || ACC[nB % ACC.length]); roofStuff(x, z, w * 0.55, d * 0.55, rot, h3, true);
      }
    }
    for (k = 0; k < N; k += 4) {
      var p = TRK.at(k, tmp), rx = -p.tz, rz = p.tx, rot = Math.atan2(p.tz, p.tx);
      for (var side = -1; side <= 1; side += 2) for (var layer = 0; layer < 3; layer++) {
        var off = WALL_OFF + 14 + layer * 26 + rnd() * 10;
        addBuilding(p.x + rx * side * off, p.z + rz * side * off, rot, layer, layer === 0);
      }
    }
    // la ville au loin : une couronne d'immeubles plus hauts
    var tries = 0, far = 0;
    while (far < 160 && tries++ < 2500) {
      var fx = -520 + rnd() * 1000, fz = -460 + rnd() * 820; if (fz > 70 && fz < 340) continue;
      var fw = 18 + rnd() * 30, fd = 18 + rnd() * 26, fr = Math.hypot(fw, fd) / 2; if (!free(fx, fz, fr)) continue;
      placed.push(fx, fz, fr); var fh2 = 45 + rnd() * (fz > 340 ? 190 : 120), fs = Math.floor(rnd() * STYLES.length); tower(fx, fz, fw, fd, rnd() * 1.5, 0, fh2, fs, rnd() < 0.5 ? ACC[far % ACC.length] : 0); roofStuff(fx, fz, fw, fd, 0, fh2, true); far++;
    }
    // le bâtiment à trois tours et son « bateau » sur le toit, au bord de la baie
    var hotelS = 0;
    [-30, 0, 30].forEach(function (dx, kk) { tower(110 + dx, 130, 20, 28, 0, 0, 110, kk % 2 ? 1 : 0, 0x22e5ff); });
    solidBox(miscBuf, 110, 130, 108, 24, 0, 110, 116, 0xcfd3e6); solidBox(miscBuf, 110, 130, 70, 10, 0, 116, 117, 0x3ad0ff); solidBox(miscBuf, 110, 130, 40, 6, 0, 117, 120, 0xe8ecf8);

    winBuf.forEach(function (b, kk) { if (b.p.length) g.add(toMesh(b, winMats[kk])); });

    /* ---------- lampadaires (de chaque côté, au ras de la barrière) + flaques de lumière sur la route ---------- */
    var glowPts = [], pools = Buf(false), headC = hexRgb(0xfff0c0), poleC = hexRgb(0x555a78);
    for (k = 0; k < N; k += 9) {
      var lp = TRK.at(k, tmp), lrx = -lp.tz, lrz = lp.tx;
      for (var sd = -1; sd <= 1; sd += 2) {
        var bx = lp.x + lrx * sd * (WALL_OFF + 2.0), bz = lp.z + lrz * sd * (WALL_OFF + 2.0), hx = bx - lrx * sd * 3.0, hz = bz - lrz * sd * 3.0, rotL = Math.atan2(lp.tz, lp.tx);
        solidBox(miscBuf, bx, bz, 0.26, 0.26, rotL, 0, 9.4, 0x555a78, true);
        solidBox(miscBuf, (bx + hx) / 2, (bz + hz) / 2, 3.1, 0.16, Math.atan2(-lrz * sd, -lrx * sd), 9.2, 9.4, 0x555a78);
        solidBox(miscBuf, hx, hz, 1.1, 0.42, rotL, 9.0, 9.2, 0xfff0c0);
        glowPts.push(hx, 9.0, hz);
        var pr2 = 8; quad(pools, [hx - pr2, 0.045, hz - pr2], [hx + pr2, 0.045, hz - pr2], [hx + pr2, 0.045, hz + pr2], [hx - pr2, 0.045, hz + pr2], [0, 0, 1, 1]);
      }
    }
    var glowC = mkCanvas(64, 64), glx = glowC.getContext('2d'), glg = glx.createRadialGradient(32, 32, 0, 32, 32, 32);
    glg.addColorStop(0, 'rgba(255,230,180,1)'); glg.addColorStop(0.3, 'rgba(255,200,120,0.45)'); glg.addColorStop(1, 'rgba(255,200,120,0)'); glx.fillStyle = glg; glx.fillRect(0, 0, 64, 64);
    var glowTex = mkTex(glowC);
    var poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    g.add(toMesh(pools, poolMat));
    var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
    g.add(new THREE.Points(gg, new THREE.PointsMaterial({ size: 24, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));

    /* ---------- panneaux de virage (chevrons jaunes) à l'extérieur des courbes ---------- */
    var chc = mkCanvas(128, 96), chx = chc.getContext('2d'); chx.fillStyle = '#15161c'; chx.fillRect(0, 0, 128, 96); chx.fillStyle = '#ffcf1f'; chx.fillRect(0, 0, 128, 6); chx.fillRect(0, 90, 128, 6);
    chx.strokeStyle = '#ffcf1f'; chx.lineWidth = 11; chx.lineJoin = 'miter'; [26, 62, 98].forEach(function (cx0) { chx.beginPath(); chx.moveTo(cx0 - 10, 20); chx.lineTo(cx0 + 12, 48); chx.lineTo(cx0 - 10, 76); chx.stroke(); });
    var chTex = mkTex(chc), chMatR = new THREE.MeshBasicMaterial({ map: chTex, side: THREE.DoubleSide }), chT2 = chTex.clone(); chT2.needsUpdate = true; chT2.wrapS = THREE.RepeatWrapping; chT2.repeat.x = -1; chT2.offset.x = 1;
    var chMatL = new THREE.MeshBasicMaterial({ map: chT2, side: THREE.DoubleSide });
    var lastCh = -99;
    for (k = 6; k < N; k += 2) {
      var ya = TRK.at(k + 14, tmp).yaw, yb = TRK.at(k - 14, tmp2).yaw, dh = KS.angDiff(ya, yb);
      if (Math.abs(dh) < 0.55 || k - lastCh < 5) continue; lastCh = k;
      var cp = TRK.at(k, tmp), turnRight = dh > 0, out = turnRight ? -1 : 1, crx = -cp.tz, crz = cp.tx, bx2 = cp.x + crx * out * (WALL_OFF + 0.7), bz2 = cp.z + crz * out * (WALL_OFF + 0.7);
      var board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.55), turnRight ? chMatR : chMatL); board.position.set(bx2, 2.4, bz2); board.rotation.y = Math.atan2(-crx * out, -crz * out);
      g.add(board); solidBox(miscBuf, bx2 + crx * out * 0.1, bz2 + crz * out * 0.1, 0.18, 0.18, 0, 0, 1.1, 0x444866, true);
    }

    /* ---------- portiques au-dessus de la route (panneaux bleus avec flèches, sans texte) ---------- */
    var gc = mkCanvas(256, 96), gx = gc.getContext('2d'); gx.fillStyle = '#0d4aa8'; gx.fillRect(0, 0, 256, 96); gx.strokeStyle = '#fff'; gx.lineWidth = 6; gx.strokeRect(5, 5, 246, 86);
    gx.fillStyle = '#fff'; gx.fillRect(122, 18, 12, 52); gx.beginPath(); gx.moveTo(100, 54); gx.lineTo(128, 82); gx.lineTo(156, 54); gx.fill();
    var gantMat = new THREE.MeshBasicMaterial({ map: mkTex(gc), side: THREE.DoubleSide });
    [70, 190, 300, 420, 530].forEach(function (gk) {
      var gp = TRK.at(gk, tmp), hw = WALL_OFF + 1.8, grp = new THREE.Group(); grp.position.set(gp.x, 0, gp.z); grp.rotation.y = -gp.yaw; g.add(grp);
      [-hw, hw].forEach(function (x) { var po = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9, 0.7), new THREE.MeshBasicMaterial({ color: 0x3a3f5c })); po.position.set(x, 4.5, 0); grp.add(po); });
      var bm = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.7, 0.9, 0.8), new THREE.MeshBasicMaterial({ color: 0x3a3f5c })); bm.position.set(0, 9, 0); grp.add(bm);
      [-6, 0, 6].forEach(function (x) { var pn = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.9), gantMat); pn.position.set(x, 7.7, 0.45); grp.add(pn); });
      var lt = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })); lt.position.set(0, 8.5, 0.45); grp.add(lt);
    });

    /* ---------- tribunes de chaque côté de la ligne droite de départ + projecteurs ---------- */
    var crc = mkCanvas(256, 64), crx = crc.getContext('2d'); crx.fillStyle = '#1a1c30'; crx.fillRect(0, 0, 256, 64);
    for (i = 0; i < 900; i++) { crx.fillStyle = ['#ff6a6a', '#ffd24a', '#6ad0ff', '#ffffff', '#b46bff', '#6aff9a'][i % 6]; crx.fillRect(rnd() * 256, rnd() * 64, 3, 4); }
    var crt = mkTex(crc); crt.wrapS = crt.wrapT = THREE.RepeatWrapping; crt.repeat.set(8, 1);
    function stand(x, z, flip) {
      var st = new THREE.Group(); st.position.set(x, 0, z); if (flip) st.rotation.y = Math.PI; g.add(st);
      for (var q = 0; q < 6; q++) { var step = new THREE.Mesh(new THREE.BoxGeometry(110, 1.6, 3), q % 2 ? new THREE.MeshBasicMaterial({ map: crt }) : new THREE.MeshBasicMaterial({ color: 0x2a2f52 })); step.position.set(0, 1 + q * 1.6, q * 3); st.add(step); }
      var rf = new THREE.Mesh(new THREE.BoxGeometry(112, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0x1c2040 })); rf.position.set(0, 13, 9); st.add(rf);
      [-54, -18, 18, 54].forEach(function (cx0) { var col = new THREE.Mesh(new THREE.BoxGeometry(0.6, 13, 0.6), new THREE.MeshBasicMaterial({ color: 0x3a3f5c })); col.position.set(cx0, 6.5, 17); st.add(col); });
      var rl = new THREE.Mesh(new THREE.BoxGeometry(110, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })); rl.position.set(0, 12.6, 18.5); st.add(rl);
    }
    stand(70, 24, false); stand(-60, -24, true);
    var flood = [];
    [[130, 40], [10, 40], [130, -40], [10, -40]].forEach(function (q) { solidBox(miscBuf, q[0], q[1], 0.9, 0.9, 0, 0, 24, 0x555a78, true); solidBox(miscBuf, q[0], q[1], 4.5, 1.2, 0, 24, 25.2, 0xfff6e0); flood.push(q[0], 24.6, q[1]); });
    var fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(flood, 3));
    g.add(new THREE.Points(fg, new THREE.PointsMaterial({ size: 90, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.8 })));

    /* ---------- la grande roue ---------- */
    var wheelG = new THREE.Group(); wheelG.position.set(-90, 52, 140); g.add(wheelG);
    var ringM = new THREE.MeshBasicMaterial({ color: 0xffd24a }), ring1 = new THREE.Mesh(new THREE.TorusGeometry(46, 0.9, 8, 64), ringM); wheelG.add(ring1);
    for (i = 0; i < 16; i++) { var sp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 92, 0.25), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); sp.rotation.z = i / 16 * Math.PI; wheelG.add(sp); }
    var pods = new THREE.Group(); wheelG.add(pods);
    for (i = 0; i < 24; i++) { var pd = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.2), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff5fa2 : 0x4de0ff })); var pa = i / 24 * TAU; pd.position.set(Math.cos(pa) * 46, Math.sin(pa) * 46, 0); pods.add(pd); }
    [-16, 16].forEach(function (dx) { var leg = new THREE.Mesh(new THREE.BoxGeometry(2, 60, 2), new THREE.MeshBasicMaterial({ color: 0xc8cbe0 })); leg.position.set(-90 + dx * 0.5, 26, 140); leg.rotation.z = dx > 0 ? -0.2 : 0.2; g.add(leg); });
    upd.push(function (dt) { wheelG.rotation.z += dt * 0.03; pods.rotation.z -= dt * 0.03; });

    // tout le petit mobilier (toits, mâts, néons, lampadaires) en un seul maillage coloré
    g.add(toMesh(miscBuf, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // feux rouges au sommet des tours (clignotent doucement)
    var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
    var bm2 = new THREE.PointsMaterial({ size: 16, color: 0xff3030, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    g.add(new THREE.Points(bg, bm2)); var bph = 0; upd.push(function (dt) { bph += dt; bm2.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(bph * 2.4)); });

    return { count: nB + far, update: function (dt) { for (var q = 0; q < upd.length; q++) upd[q](dt); } };
  }
  F.kartDecor = { build: build };
})();
