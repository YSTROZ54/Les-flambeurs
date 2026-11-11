/* =====================================================================
   golf-sim.js — La physique et les parcours du mini golf (aucun dessin, aucun réseau)
   ---------------------------------------------------------------------
   Utilisé par le navigateur (golf3d.js / golf-scene.js, pour dessiner les parcours) ET par le serveur (api/_golfSim.js, copie
   générée par scripts/sync-sims.mjs) : c'est le serveur qui fait rouler TOUTES les balles en même temps (chocs entre balles),
   le navigateur ne fait que dessiner ce qu'il reçoit.
   Un trou est décrit par une suite de « pièces » (ligne droite, virage, pente, saut, boucle, obstacle…) : voir walk().
   Les 5 parcours (20 trous chacun) sont générés et vérifiés par scripts/golf-gen.mjs, qui les écrit plus bas (COURSE_DATA).
   ===================================================================== */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var R = 0.075, CUP = 0.14, VMAX = 13, GRAV = 9.8, MAXSHOTS = 23, WAIT_S = 60, WALL_H = 0.17, GROUND = -0.16, WATER_Y = -0.34;
  var LOOP_R = 0.6, LOOP_SHIFT = 0.5, LOOP_W = 0.56;

  /* ------------------------------------------------------------------ les cartes (titre, style) ------------------------------------------------------------------ */
  var MAPS = {
    kraken: { name: 'Le Repaire du Kraken', emoji: '🐙', sub: 'Un voyage de pirates : ponton, mâchoire de requin, cale, canons et pieuvre géante', water: true, col: '#2f9fb0' }
  };
  var MAP_IDS = ['kraken'];
  var POWERS = ['jump', 'glue', 'ice'];
  var DEFAULT_OPTS = { dice: true, jump: true, glue: true, ice: true, collide: true, holes: 20 };

  /* ------------------------------------------------------------------ le tracé d'un trou ------------------------------------------------------------------
     Pièces : ['s', longueur, dénivelé] · ['l'|'r', degrés, rayon, dénivelé] · ['w', largeur] · ['gap', longueur, 'water'|'void', dénivelé]
              ['loop'] · ['o', type, {fw, lat, ...}] · ['z', 'sand'|'ice', longueur] · ['nw', longueur] (sans bordure) · ['tun', longueur] (tunnel) */
  function walk(spec) {
    var x = 0, z = 0, a = 0, h = 0, w = spec.w || 1.4, s = 0, wFrom = w, wTo = w, wLeft = 0, WT = 1.4;
    var S = [], obs = [], loops = [], zoneKind = null, zoneEnd = -1, nwEnd = -1, nwKind = 'void', tunEnd = -1;
    function push(joint, seg) { S.push({ x: x, z: z, h: h, w: w, s: s, a: a, joint: !!joint, seg: seg || {} }); }
    function segProps(extra) {
      var o = { zone: s <= zoneEnd ? zoneKind : null, nw: s <= nwEnd ? nwKind : null, tun: s <= tunEnd };
      for (var k in extra) o[k] = extra[k];
      return o;
    }
    function stepW(dl) { if (wLeft > 0) { var k = Math.min(1, dl / wLeft); w = w + (wTo - w) * k; wLeft -= dl; if (wLeft <= 0) w = wTo; } }
    push(true);
    (spec.pcs || []).forEach(function (p) {
      var t = p[0], i, n;
      if (t === 's' || t === 'gap') {
        var len = p[1], dh = (t === 's' ? p[2] : p[3]) || 0; n = Math.max(1, Math.ceil(len / 0.5));
        for (i = 0; i < n; i++) {
          x += Math.sin(a) * len / n; z -= Math.cos(a) * len / n; h += dh / n; s += len / n; stepW(len / n);
          push(i === n - 1, segProps(t === 'gap' ? { gap: p[2] || 'void' } : {}));
        }
      } else if (t === 'l' || t === 'r') {
        var ang = p[1] * Math.PI / 180, rad = p[2], dh2 = p[3] || 0, arc = ang * rad; n = Math.max(2, Math.ceil(arc / 0.3));
        var da = (t === 'r' ? 1 : -1) * ang / n, ch = 2 * rad * Math.sin(ang / n / 2);
        for (i = 0; i < n; i++) { var am = a + da / 2; x += Math.sin(am) * ch; z -= Math.cos(am) * ch; a += da; h += dh2 / n; s += arc / n; stepW(arc / n); push(i === n - 1, segProps({})); }
      } else if (t === 'w') { wFrom = w; wTo = p[1]; wLeft = p[2] || WT; }
      else if (t === 'z') { zoneKind = p[1]; zoneEnd = s + p[2]; }
      else if (t === 'nw') { nwEnd = s + p[1]; nwKind = p[2] || 'void'; }
      else if (t === 'tun') { tunEnd = s + p[1]; }
      else if (t === 'loop') {
        var ex = x, ez = z, sx = Math.cos(a), sz = Math.sin(a), side = p[1] === 'l' ? -1 : 1;
        loops.push({ x: ex, z: ez, h: h, dx: Math.sin(a), dz: -Math.cos(a), sx: sx * side, sz: sz * side, r: LOOP_R, shift: LOOP_SHIFT, w: w, s: s, a: a });
        x += sx * side * LOOP_SHIFT + Math.sin(a) * 0.14; z += sz * side * LOOP_SHIFT - Math.cos(a) * 0.14; s += 0.14 + Math.PI * 2 * LOOP_R;
        push(true, { skip: true, cap: true });
      } else if (t === 'o') {
        var o = {}, q = p[2] || {}; for (var k in q) o[k] = q[k]; o.t = p[1];
        var fw = o.fw || 0, lat = o.lat || 0;
        o.x = x + Math.sin(a) * fw + Math.cos(a) * lat; o.z = z - Math.cos(a) * fw + Math.sin(a) * lat; o.a = a; o.s = s + fw; o.w0 = w;
        obs.push(o);
      }
    });
    return { S: S, obs: obs, loops: loops };
  }

  /* ------------------------------------------------------------------ données physiques d'un trou ------------------------------------------------------------------ */
  function buildHole(spec, ox, oz) {
    var Wk = walk(spec), S = Wk.S, n = S.length, i;
    S.forEach(function (p) { p.x += ox; p.z += oz; });
    Wk.obs.forEach(function (o) { o.x += ox; o.z += oz; });
    Wk.loops.forEach(function (l) { l.x += ox; l.z += oz; });
    // bords gauche / droite de chaque point (le côté droit d'une direction a est (cos a, sin a))
    var L = [], Rr = [];
    for (i = 0; i < n; i++) {
      var p = S[i], prevOk = i > 0 && !S[i].seg.skip, nextOk = i < n - 1 && !S[i + 1].seg.skip, rx = 0, rz = 0, c = 0;
      if (prevOk) { var d0 = norm(p.x - S[i - 1].x, p.z - S[i - 1].z); rx += -d0.z; rz += d0.x; c++; }
      if (nextOk) { var d1 = norm(S[i + 1].x - p.x, S[i + 1].z - p.z); rx += -d1.z; rz += d1.x; c++; }
      if (!c) { rx = Math.cos(p.a); rz = Math.sin(p.a); }
      var rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      var k = 1; if (prevOk && nextOk) { var dA = norm(p.x - S[i - 1].x, p.z - S[i - 1].z), dB = norm(S[i + 1].x - p.x, S[i + 1].z - p.z), cs = -dA.z * rx + dA.x * rz; k = 1 / Math.max(0.6, cs); }
      // attention : (-dz, dx) est le côté GAUCHE quand on regarde vers d=(dx,dz) avec z vers le bas de l'écran… on garde la convention : L = point + n * w/2
      L.push([p.x + rx * p.w / 2 * k, p.z + rz * p.w / 2 * k, p.h]); Rr.push([p.x - rx * p.w / 2 * k, p.z - rz * p.w / 2 * k, p.h]);
    }
    var floors = [], walls = [], gaps = [], minH = 0, maxH = 0;
    for (i = 1; i < n; i++) {
      var A = S[i - 1], B = S[i], sg = B.seg;
      minH = Math.min(minH, A.h, B.h); maxH = Math.max(maxH, A.h, B.h);
      if (sg.skip) continue;
      var dd = norm(B.x - A.x, B.z - A.z), ln = Math.hypot(B.x - A.x, B.z - A.z) || 1e-6;
      var poly = [L[i - 1], L[i], Rr[i], Rr[i - 1]];
      if (sg.gap) { gaps.push({ poly: poly, kind: sg.gap, i: i }); continue; }
      floors.push({ poly: poly, ax: A.x, az: A.z, dx: dd.x, dz: dd.z, len: ln, h0: A.h, h1: B.h, gx: (B.h - A.h) / ln * dd.x, gz: (B.h - A.h) / ln * dd.z, zone: sg.zone || null, i: i, s0: A.s, s1: B.s, w0: A.w, w1: B.w });
      if (!sg.nw) walls.push(seg3(L[i - 1], L[i]), seg3(Rr[i - 1], Rr[i]));
      else { var ox1 = (L[i - 1][0] - Rr[i - 1][0]) * 1.6, oz1 = (L[i - 1][1] - Rr[i - 1][1]) * 1.6, ox2 = (L[i][0] - Rr[i][0]) * 1.6, oz2 = (L[i][1] - Rr[i][1]) * 1.6; gaps.push({ poly: [[L[i - 1][0] + ox1, L[i - 1][1] + oz1], [L[i][0] + ox2, L[i][1] + oz2], [Rr[i][0] - ox2, Rr[i][1] - oz2], [Rr[i - 1][0] - ox1, Rr[i - 1][1] - oz1]], kind: sg.nw, i: i, side: true }); }
    }
    walls.push(seg3(Rr[0], L[0]));                                    // fond du départ
    walls.push(seg3(L[n - 1], Rr[n - 1]));                            // fond du trou
    for (i = 1; i < n; i++) if (S[i].seg.cap) walls.push(seg3(Rr[i], L[i]));   // juste après une boucle (on ne repart pas en arrière)
    var dEnd = norm(S[n - 1].x - S[n - 2].x, S[n - 1].z - S[n - 2].z), dSt = norm(S[1].x - S[0].x, S[1].z - S[0].z);
    var tee = [S[0].x + dSt.x * 0.7, S[0].z + dSt.z * 0.7], cup = [S[n - 1].x - dEnd.x * 0.85, S[n - 1].z - dEnd.z * 0.85];
    var bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    L.concat(Rr).forEach(function (q) { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); bz0 = Math.min(bz0, q[1]); bz1 = Math.max(bz1, q[1]); });
    var H = { spec: spec, name: spec.n, par: spec.p, S: S, L: L, Rr: Rr, floors: floors, walls: walls, gaps: gaps, circles: [], dyn: [], loops: Wk.loops, obs: Wk.obs, tee: tee, cup: cup, minH: minH, maxH: maxH, box: [bx0, bz0, bx1, bz1], len: S[n - 1].s, dice: [], patches: [] };
    H.teeYaw = Math.atan2(dSt.x, -dSt.z);
    H.cupH = S[n - 1].h; H.teeH = S[0].h;
    buildGrid(H);
    Wk.obs.forEach(function (o) {
      var fh = floorH(H, o.x, o.z); o.h = fh;
      if (o.t === 'post' || o.t === 'bump' || o.t === 'rock') H.circles.push({ x: o.x, z: o.z, r: o.r || 0.14, y0: fh - 0.4, y1: fh + (o.t === 'rock' ? 0.8 : 0.35), e: o.t === 'bump' ? 1.2 : 0.6, bump: o.t === 'bump', o: o, h: fh, flash: 0 });
      else if (o.t === 'block') { boxWalls(o, o.x, o.z, o.a, o.bw || 0.6, o.bd || 0.25, fh, H.walls); }
      else if (o.t === 'patch' || o.t === 'cannon' || o.t === 'portal') H.patches.push({ x: o.x, z: o.z, r: o.r || (o.t === 'patch' ? 0.4 : 0.3), kind: o.t === 'patch' ? o.kind : o.t, o: o, h: fh, a: o.a });
      else if (o.t === 'exit' || o.t === 'arch' || o.t === 'deco') { /* arrivée d'un canon / portail, ou décor au-dessus de la piste : rien à heurter */ }
      else H.dyn.push({ o: o, x: o.x, z: o.z, h: fh });
    });
    H.patches.forEach(function (p) {                       // un canon ou un portail envoie la balle vers la sortie qui porte le même numéro
      if (p.kind !== 'cannon' && p.kind !== 'portal') return;
      Wk.obs.forEach(function (o) { if (o.t === 'exit' && o.id === p.o.id) { p.tx = o.x; p.tz = o.z; p.th = o.h; p.ta = o.a; } });
    });
    buildGrid(H);
    // les dés : à 30 %, 55 % et 80 % du trou, au milieu de la piste (jamais sur un saut, une boucle, du sable ou de la glace)
    H.diceMax = H.len > 30 ? 2 : 1;                      // un seul cube sur les petites pistes, deux sur les grandes
    (H.diceMax === 2 ? [0.35, 0.7, 0.5, 0.25, 0.6, 0.8] : [0.5, 0.4, 0.6, 0.3, 0.7, 0.8]).forEach(function (f) {
      if (H.dice.length >= H.diceMax) return;
      var target = H.len * f, best = null;
      floors.forEach(function (fl) { if (fl.zone || best) return; if (fl.s0 <= target && fl.s1 >= target) best = fl; });
      if (!best) return;
      var k = (target - best.s0) / Math.max(1e-6, best.s1 - best.s0), dx = best.ax + best.dx * best.len * k, dz = best.az + best.dz * best.len * k;
      var near = !spotFree(H, dx, dz) || Math.hypot(dx - H.cup[0], dz - H.cup[1]) < 1.5 || Math.hypot(dx - H.tee[0], dz - H.tee[1]) < 1.2;
      if (!near) H.dice.push({ x: dx, z: dz, h: fH(best, dx, dz) });
    });
    return H;
    function seg3(a, b) { return { ax: a[0], az: a[1], bx: b[0], bz: b[1], y0: Math.min(a[2], b[2]) - 0.4, y1: Math.max(a[2], b[2]) + WALL_H, e: 0.62, ha: a[2], hb: b[2], rail: true }; }
  }
  // un endroit où un cube bonus peut flotter : loin de toute bordure, bloc, poteau et moulin (pas de cube dans un mur)
  function spotFree(H, x, z) {
    var i, fl = floorAt(H, x, z, 99); if (!fl || fl.f.zone) return false;
    for (i = 0; i < H.walls.length; i++) { var w = H.walls[i], ex = w.bx - w.ax, ez = w.bz - w.az, L2 = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((x - w.ax) * ex + (z - w.az) * ez) / L2)); if (Math.hypot(x - (w.ax + ex * t), z - (w.az + ez * t)) < 0.34 && Math.abs(fl.h - (w.y0 + 0.4)) < 1.5) return false; }
    for (i = 0; i < H.circles.length; i++) if (Math.hypot(H.circles[i].x - x, H.circles[i].z - z) < (H.circles[i].r || 0.15) + 0.4) return false;
    for (i = 0; i < H.patches.length; i++) if (Math.hypot(H.patches[i].x - x, H.patches[i].z - z) < H.patches[i].r + 0.45) return false;
    for (i = 0; i < H.dyn.length; i++) { var o = H.dyn[i].o, rr = o.t === 'mill' || o.t === 'spinner' ? (o.len || 0.7) + 0.35 : o.t === 'logs' ? (o.len || 2.4) + 0.9 : o.t === 'swing' ? (o.len || (o.w0 || 1.4) + 0.15) + 0.5 : 0.9; if (Math.hypot(H.dyn[i].x - x, H.dyn[i].z - z) < rr) return false; }
    return true;
  }
  function boxWalls(o, x, z, a, bw, bd, fh, out) {
    var c = Math.cos(a), s = Math.sin(a), hw = bw / 2, hd = bd / 2;
    // bw : en travers de la piste (côté droit = (cos a, sin a)), bd : dans le sens de la piste (d = (sin a, -cos a))
    var P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function (q) { return [x + c * q[0] + s * q[1], z + s * q[0] - c * q[1]]; });
    for (var k = 0; k < 4; k++) { var A = P[k], B = P[(k + 1) % 4]; out.push({ ax: A[0], az: A[1], bx: B[0], bz: B[1], y0: fh - 0.4, y1: fh + (o.bh || 0.24), e: 0.6 }); }
    o.corners = P;
  }
  function norm(x, z) { var l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; }
  // grille : pour chaque case de 1 m, les sols et les bordures qui la touchent (bien plus rapide que de tout tester)
  var CELL = 1;
  function buildGrid(H) {
    var G = {};
    function add(key, kind, it) { var c = G[key] || (G[key] = { f: [], w: [] }); if (c[kind].indexOf(it) < 0) c[kind].push(it); }
    function cover(x0, z0, x1, z1, kind, it) { for (var ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (var iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) add(ix + ',' + iz, kind, it); }
    H.floors.forEach(function (f) { var xs = f.poly.map(function (q) { return q[0]; }), zs = f.poly.map(function (q) { return q[1]; }); cover(Math.min.apply(0, xs), Math.min.apply(0, zs), Math.max.apply(0, xs), Math.max.apply(0, zs), 'f', f); });
    var m = R + 0.05;
    H.walls.forEach(function (w) { cover(Math.min(w.ax, w.bx) - m, Math.min(w.az, w.bz) - m, Math.max(w.ax, w.bx) + m, Math.max(w.az, w.bz) + m, 'w', w); });
    H.grid = G;
  }
  var EMPTY = { f: [], w: [] };
  function cellAt(H, x, z) { return H.grid[Math.floor(x / CELL) + ',' + Math.floor(z / CELL)] || EMPTY; }
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
    var best = null, bh = -1e9, fl = cellAt(H, x, z).f;
    for (var i = 0; i < fl.length; i++) { var f = fl[i]; if (!inPoly(f.poly, x, z)) continue; var h = fH(f, x, z); if (h <= yMax && h > bh) { bh = h; best = f; } }
    return best ? { f: best, h: bh } : null;
  }
  function floorH(H, x, z) { var r = floorAt(H, x, z, 99); return r ? r.h : 0; }
  function patchAt(H, x, z, h) { for (var i = 0; i < H.patches.length; i++) { var p = H.patches[i]; if (Math.abs(h - p.h) < 0.3 && Math.hypot(x - p.x, z - p.z) < p.r) return p; } return null; }
  function overGap(H, x, z) { for (var i = 0; i < H.gaps.length; i++) if (inPoly(H.gaps[i].poly, x, z)) return H.gaps[i]; return null; }

  /* ------------------------------------------------------------------ obstacles qui bougent (même heure pour tout le monde) ------------------------------------------------------------------ */
  function dynSegs(H, t, out) {
    out.length = 0;
    for (var di = 0; di < H.dyn.length; di++) {
      var d = H.dyn[di], o = d.o, k, c = Math.cos(o.a), s = Math.sin(o.a);
      if (o.t === 'mill' || o.t === 'spinner') {
        var n = o.n || (o.t === 'spinner' ? 2 : 4), len = o.len || 0.7, th = (o.speed || 1.4) * t;
        for (k = 0; k < n; k++) { var ang = th + k * TAU / n; out.push({ ax: d.x, az: d.z, bx: d.x + Math.cos(ang) * len, bz: d.z + Math.sin(ang) * len, y0: d.h - 0.3, y1: d.h + 0.22, e: 0.6, spin: o.speed || 1.4, cx: d.x, cz: d.z }); }
      } else if (o.t === 'slide') {
        var amp = o.amp || 0.45, sp = o.speed || 1.4, sv = Math.sin(sp * t) * amp, vv = Math.cos(sp * t) * amp * sp;
        var cx = d.x + c * sv, cz = d.z + s * sv, vx = c * vv, vz = s * vv, hw = (o.bw || 0.5) / 2, hd = (o.bd || 0.3) / 2;
        var P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function (q) { return [cx + c * q[0] + s * q[1], cz + s * q[0] - c * q[1]]; });
        for (k = 0; k < 4; k++) { var A = P[k], B = P[(k + 1) % 4]; out.push({ ax: A[0], az: A[1], bx: B[0], bz: B[1], y0: d.h - 0.3, y1: d.h + 0.24, e: 0.65, vx: vx, vz: vz }); }
      } else if (o.t === 'swing') {
        var sw = swingDir(o, t), sl = o.len || ((o.w0 || 1.4) + 0.15);
        out.push({ ax: d.x, az: d.z, bx: d.x + sw.dx * sl, bz: d.z + sw.dz * sl, y0: d.h - 0.3, y1: d.h + 0.3, e: 0.6, spin: sw.spin, cx: d.x, cz: d.z });
      } else if (o.t === 'logs') {
        var LG = logsAt(H, d, t, LOGS); for (k = 0; k < LG.length; k++) {
          var lg = LG[k]; if (lg.sc < 0.6) continue;
          var hw2 = (o.bw || 0.6) / 2, hd2 = (o.bd || 0.3) / 2, lP = [[-hw2, -hd2], [hw2, -hd2], [hw2, hd2], [-hw2, hd2]].map(function (q) { return [lg.x + c * q[0] + s * q[1], lg.z + s * q[0] - c * q[1]]; });
          for (var kk = 0; kk < 4; kk++) { var lA = lP[kk], lB = lP[(kk + 1) % 4]; out.push({ ax: lA[0], az: lA[1], bx: lB[0], bz: lB[1], y0: lg.h - 0.3, y1: lg.h + (o.bh || 0.3), e: 0.7, vx: lg.vx, vz: lg.vz }); }
        }
      } else if (o.t === 'gate') {
        var open = gateOpen(o, t); if (open > 0.6) continue;
        var gw = (o.w0 || 1.4) / 2 + 0.05;
        out.push({ ax: d.x - c * gw, az: d.z - s * gw, bx: d.x + c * gw, bz: d.z + s * gw, y0: d.h - 0.3 + open * 0.5, y1: d.h + 0.4, e: 0.5 });
      }
    }
    return out;
  }
  // le pendule : un bras fixé sur le bord de la piste qui balaie d'avant en arrière (la piste est barrée quand il est en travers)
  //   o : { lat (côté du pivot, + ou -), len, amp (radians), speed, ph }
  function swingDir(o, t) {
    var side = (o.lat || 1) > 0 ? 1 : -1, amp = o.amp || 1.25, sp = o.speed || 1.0, th = amp * Math.sin(sp * t + (o.ph || 0) * TAU), e = 0.01, th2 = amp * Math.sin(sp * (t + e) + (o.ph || 0) * TAU);
    function dir(q) { var rx = -side * Math.cos(o.a), rz = -side * Math.sin(o.a), fx = Math.sin(o.a), fz = -Math.cos(o.a); return [rx * Math.cos(q) + fx * Math.sin(q), rz * Math.cos(q) + fz * Math.sin(q)]; }
    var d1 = dir(th), d2 = dir(th2), a1 = Math.atan2(d1[1], d1[0]), a2 = Math.atan2(d2[1], d2[0]), da = a2 - a1; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU;
    return { dx: d1[0], dz: d1[1], spin: da / e, th: th };
  }
  // les rondins (tonneaux, rochers) qui dévalent une pente : même position pour le serveur et pour le dessin
  //   o : { fw, len (longueur de la pente), dir (-1 = ils descendent vers le départ), n, v (m/s), bw, bd, ph }
  var LOGS = [];
  function logsAt(H, d, t, out) {
    var o = d.o, n = o.n || 2, len = o.len || 2.4, v = o.v || 1.3, dir = o.dir < 0 ? -1 : 1, bw = o.bw || 0.6, c = Math.cos(o.a), s = Math.sin(o.a), T = len / v;
    out.length = 0;
    for (var k = 0; k < n; k++) {
      var ph = (((t / T) + k / n + (o.ph || 0)) % 1 + 1) % 1, along = dir > 0 ? ph * len : (1 - ph) * len, lat = (k % 2 ? 1 : -1) * Math.max(0, ((o.w0 || 1.4) - bw) / 2 - 0.03);
      var x = d.x + s * along + c * lat, z = d.z - c * along + s * lat, fl = floorAt(H, x, z, 99), sc = Math.max(0, Math.min(1, Math.min(ph, 1 - ph) / 0.12));
      out.push({ x: x, z: z, h: fl ? fl.h : d.h, sc: sc, vx: s * v * dir, vz: -c * v * dir, ph: ph, k: k, along: along, v: v * dir });
    }
    return out;
  }
  var DYN2 = [];
  function dynTouch(H, b, t) {
    if (!H.dyn.length) return false;
    dynSegs(H, t, DYN2);
    for (var i = 0; i < DYN2.length; i++) {
      var q = DYN2[i]; if (b.y > q.y1 + R * 0.4 || b.y < q.y0 || !(q.vx || q.vz || q.spin)) continue;   // seulement ce qui bouge (pas une herse fermée)
      var ex = q.bx - q.ax, ez = q.bz - q.az, L2 = ex * ex + ez * ez || 1e-9, u = Math.max(0, Math.min(1, ((b.x - q.ax) * ex + (b.z - q.az) * ez) / L2));
      if (Math.hypot(b.x - (q.ax + ex * u), b.z - (q.az + ez * u)) < R + 0.015) return true;
    }
    return false;
  }
  // la porte qui monte et descend : 0 = fermée, 1 = grande ouverte
  function gateOpen(o, t) { var ph = ((t * (o.speed || 0.5) + (o.ph || 0)) % 1 + 1) % 1; return ph < 0.4 ? 1 : ph < 0.5 ? 1 - (ph - 0.4) * 10 : ph < 0.85 ? 0 : (ph - 0.85) / 0.15; }

  /* ------------------------------------------------------------------ physique de la balle ------------------------------------------------------------------ */
  var DYN = [];
  function hitSeg(b, s, ev) {
    if (b.y > s.y1 + R * 0.4 || b.y < s.y0) return false;
    var ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez; if (L2 < 1e-9) return false;
    var t = ((b.x - s.ax) * ex + (b.z - s.az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    var cx = s.ax + ex * t, cz = s.az + ez * t, dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz);
    if (d >= R || d < 1e-7) return false;
    var nx = dx / d, nz = dz / d; b.x = cx + nx * R; b.z = cz + nz * R;
    var svx = s.vx || 0, svz = s.vz || 0;
    if (s.spin) { svx = -s.spin * (cz - s.cz); svz = s.spin * (cx - s.cx); }
    var rvx = b.vx - svx, rvz = b.vz - svz, vn = rvx * nx + rvz * nz;
    if (vn < 0) { var e = s.e || 0.62; rvx -= (1 + e) * vn * nx; rvz -= (1 + e) * vn * nz; rvx *= 0.97; rvz *= 0.97; if (ev && -vn > 0.25) ev('wall', -vn); }
    else if (s.spin || s.vx || s.vz) { rvx += nx * 0.4; rvz += nz * 0.4; }
    b.vx = rvx + svx; b.vz = rvz + svz;
    return true;
  }
  function hitCircle(b, c, ev) {
    if (b.y > c.y1 || b.y < c.y0) return false;
    var dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz), rr = R + c.r;
    if (d >= rr || d < 1e-7) return false;
    var nx = dx / d, nz = dz / d; b.x = c.x + nx * rr; b.z = c.z + nz * rr;
    var vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      var e = c.e || 0.6; b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz;
      if (c.bump) { var sp = Math.hypot(b.vx, b.vz); if (sp < 2.4) { b.vx += nx * 1.3; b.vz += nz * 1.3; } c.flash = 1; }
      if (ev) ev(c.bump ? 'bump' : 'wall', -vn);
    }
    return true;
  }
  // la boucle : la balle suit le cercle tant qu'elle va assez vite, sinon elle retombe (puis roule en arrière)
  function railStep(b, H, dt, ev) {
    var rl = b.rail, Lp = rl.L, th = rl.th, v = rl.v;
    var acc = -GRAV * Math.sin(th) * 0.71 - (v > 0 ? 1 : -1) * (0.35 + 0.03 * v * v);
    v += acc * dt; th += v * dt / Lp.r;
    var nrm = v * v / Lp.r + GRAV * Math.cos(th);
    if (th > 0.6 && th < TAU - 0.6 && nrm < 0) {                // plus assez de vitesse : elle décroche et tombe
      var ct = Math.cos(th), st = Math.sin(th), k = v;
      b.vx = Lp.dx * ct * k; b.vz = Lp.dz * ct * k; b.vy = st * k;
      setRailPos(b, Lp, th); b.rail = null; b.air = true; if (ev) ev('fall', 1);
      return;
    }
    if (th >= TAU) { b.rail = null; b.x = Lp.x + Lp.sx * Lp.shift + Lp.dx * 0.16; b.z = Lp.z + Lp.sz * Lp.shift + Lp.dz * 0.16; b.y = Lp.h; b.vx = Lp.dx * v; b.vz = Lp.dz * v; b.vy = 0; b.air = false; if (ev) ev('loop', v); return; }
    if (th <= 0 && v <= 0) { b.rail = null; b.x = Lp.x - Lp.dx * 0.02; b.z = Lp.z - Lp.dz * 0.02; b.y = Lp.h; b.vx = Lp.dx * v; b.vz = Lp.dz * v; b.vy = 0; b.air = false; return; }
    rl.th = th; rl.v = v; setRailPos(b, Lp, th);
  }
  function setRailPos(b, Lp, th) {
    var f = Math.max(0, Math.min(1, (th - Math.PI) / Math.PI));          // le décalage de côté ne se fait que dans la 2e moitié du tour
    b.x = Lp.x + Lp.dx * Lp.r * Math.sin(th) + Lp.sx * Lp.shift * f; b.z = Lp.z + Lp.dz * Lp.r * Math.sin(th) + Lp.sz * Lp.shift * f; b.y = Lp.h + Lp.r * (1 - Math.cos(th));
  }
  /* un petit pas de simulation ; renvoie 'cup' (dans le trou), 'water' (dans l'eau), 'out' (dans le vide ou hors de la piste) ou ''
     ctx : { glue: [{x,z,r}], magnet: bool, ev: function(type, force) } */
  function simStep(b, H, dt, t, ctx) {
    var ev = ctx && ctx.ev, fl;
    if (b.rail) { railStep(b, H, dt, ev); return ''; }
    var px = b.x, pz = b.z;
    if (!b.air) {
      var gx = 0, gz = 0, fric = 0.9, k, Z = null, zdx = 0, zdz = 0;
      fl = floorAt(H, b.x, b.z, b.y + 0.12);
      if (fl) { gx = fl.f.gx; gz = fl.f.gz; Z = fl.f.zone; zdx = fl.f.dx; zdz = fl.f.dz; }
      var pt = fl && H.patches.length ? patchAt(H, b.x, b.z, fl.h) : null;
      if (pt) {
        if (pt.kind === 'pit') return H.water === false ? 'out' : 'water';                 // fosse d'eau ou de lave au milieu de la piste
        if ((pt.kind === 'cannon' || pt.kind === 'portal') && pt.tx !== undefined) {
          var sp0 = Math.hypot(b.vx, b.vz);
          if (pt.kind === 'portal') { var vo = Math.max(1.6, sp0); b.x = pt.tx + Math.sin(pt.ta) * 0.3; b.z = pt.tz - Math.cos(pt.ta) * 0.3; b.y = pt.th; b.vx = Math.sin(pt.ta) * vo; b.vz = -Math.cos(pt.ta) * vo; b.vy = 0; }
          else {                                                                              // le canon : un tir en cloche jusqu'à la cible
            var cdx0 = pt.tx - pt.x, cdz0 = pt.tz - pt.z, cT = Math.max(0.9, Math.hypot(cdx0, cdz0) / 7);
            b.x = pt.x; b.z = pt.z; b.y = pt.h + 0.4; b.vx = cdx0 / cT; b.vz = cdz0 / cT; b.vy = (pt.th - b.y) / cT + GRAV * cT / 2; b.air = true; b.fly = true;
          }
          if (ev) ev(pt.kind, 1);
          return '';
        }
        Z = pt.kind; zdx = Math.sin(pt.a); zdz = -Math.cos(pt.a);
      }
      if (Z === 'sand') fric = 4.2; else if (Z === 'ice') fric = 0.12;
      var sp = Math.hypot(b.vx, b.vz);
      var dec = fric + (Z === 'ice' ? 0.05 : 0.3) * sp;
      if (ctx && ctx.glue) for (k = 0; k < ctx.glue.length; k++) { var gq = ctx.glue[k]; if (Math.hypot(b.x - gq.x, b.z - gq.z) < gq.r) { dec += 26 + 5 * sp; if (!b.inGlue && ev) ev('glue', sp); b.inGlue = true; break; } }
      if (ctx && ctx.glue && k === ctx.glue.length) b.inGlue = false;
      if (sp > 0) { var dd = Math.min(sp, dec * dt); b.vx -= b.vx / sp * dd; b.vz -= b.vz / sp * dd; }
      b.vx += -GRAV * gx * 0.71 * dt; b.vz += -GRAV * gz * 0.71 * dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      // entrée dans une boucle : on franchit la ligne d'entrée en avançant
      for (k = 0; k < H.loops.length; k++) {
        var Lp = H.loops[k], a0 = (px - Lp.x) * Lp.dx + (pz - Lp.z) * Lp.dz, a1 = (b.x - Lp.x) * Lp.dx + (b.z - Lp.z) * Lp.dz, lat = (b.x - Lp.x) * Lp.sx + (b.z - Lp.z) * Lp.sz, vd = b.vx * Lp.dx + b.vz * Lp.dz;
        if (a0 < 0 && a1 >= 0 && Math.abs(lat) < Lp.w / 2 + 0.06 && vd > 0 && Math.abs(b.y - Lp.h) < 0.2) { b.rail = { L: Lp, th: 0, v: vd }; setRailPos(b, Lp, 0); return ''; }
      }
      // accélérateur (il lance vraiment la balle), tapis roulant (avant / arrière)
      if (Z === 'boost') { if (sp < 12) { b.vx += zdx * 36 * dt; b.vz += zdz * 36 * dt; } if (!b.inBoost && ev) ev('boost', sp); b.inBoost = true; }
      else {
        b.inBoost = false;
        if (Z === 'belt' || Z === 'beltb') { var vdb = b.vx * zdx + b.vz * zdz, dv = ((Z === 'belt' ? 1.8 : -1.8) - vdb) * Math.min(1, 1.1 * dt); b.vx += zdx * dv; b.vz += zdz * dv; }
      }
      var f2 = floorAt(H, b.x, b.z, b.y + 0.12);
      var vyg = fl ? fl.f.gx * b.vx + fl.f.gz * b.vz : 0, vy2 = f2 ? f2.f.gx * b.vx + f2.f.gz * b.vz : 0;
      if (!f2 || b.y - f2.h > 0.02 + Math.abs(vyg) * dt * 2.5) { b.air = true; b.vy = vyg; }
      else if (vyg > 0.9 && vyg - vy2 > 1.1) { b.air = true; b.vy = vyg; b.y = Math.max(b.y, f2.h) + 0.005; }   // en haut d'une montée prise vite : la balle décolle
      else {
        b.y = f2.h; b.vy = vy2;
        if ((Z === 'bounce' || f2.f.zone === 'bounce') && sp > 0.6) { b.vy = 3.8; b.air = true; b.y = f2.h + 0.02; if (ev) ev('bounce', 1); }          // trampoline
      }
    }
    if (b.air) {
      b.vy -= GRAV * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
      fl = floorAt(H, b.x, b.z, b.y + 0.06 + Math.max(0, -b.vy * dt));
      if (fl && b.y <= fl.h) {
        b.y = fl.h;
        if (b.fly) { b.fly = false; b.vx *= 0.3; b.vz *= 0.3; }                     // tir de canon : la balle s'écrase et roule doucement
        if (b.vy < -2.0) { b.vy = -b.vy * 0.3; b.vx *= 0.92; b.vz *= 0.92; if (ev) ev('land', 1); }
        else { b.vy = 0; b.air = false; b.vx *= 0.95; b.vz *= 0.95; }
      }
    }
    var i, cell = cellAt(H, b.x, b.z);
    for (i = 0; i < cell.w.length; i++) hitSeg(b, cell.w[i], ev);
    dynSegs(H, t, DYN); for (i = 0; i < DYN.length; i++) hitSeg(b, DYN[i], ev);
    for (i = 0; i < H.circles.length; i++) hitCircle(b, H.circles[i], ev);
    // tombé : dans l'eau, dans le vide, ou sur l'herbe à côté de la piste
    if (b.air) {
      var gp = overGap(H, b.x, b.z);
      if (!gp && b.y < GROUND + 0.01 && !floorAt(H, b.x, b.z, b.y + 0.3)) return 'out';            // sur l'herbe, à côté de la piste
      if (gp && b.y < (gp.kind === 'water' ? WATER_Y : -1.4)) return gp.kind === 'water' ? 'water' : 'out';
      if (b.y < -3) return 'out';
    }
    // le trou : la balle lente tombe dedans ; à peine plus rapide, le bord l'attire un peu (beaucoup avec l'aimant)
    if (!b.air) {
      var cdx = H.cup[0] - b.x, cdz = H.cup[1] - b.z, cd = Math.hypot(cdx, cdz), spd = Math.hypot(b.vx, b.vz);
      if (cd < CUP - R * 0.25 && Math.abs(b.y - H.cupH) < 0.1) {
        if (spd < 2.9) return 'cup';
        if (!b.lip) {
          b.lip = true;
          var sd = (cdx * b.vz - cdz * b.vx) >= 0 ? 1 : -1, la = sd * (0.3 + Math.min(0.55, cd / CUP * 0.7)), lc = Math.cos(la), ls = Math.sin(la), lvx = b.vx * lc - b.vz * ls, lvz = b.vx * ls + b.vz * lc;
          b.vx = lvx * 0.8; b.vz = lvz * 0.8; b.vy = Math.min(2.8, 0.9 + spd * 0.17); b.air = true; if (ev) ev('lip', spd);
          return '';
        }
      } else if (cd > CUP + R) b.lip = false;
      if (ctx && ctx.magnet && cd < 1.1 && cd > 1e-4) { b.vx += cdx / cd * 4.5 * dt; b.vz += cdz / cd * 4.5 * dt; }
      else if (cd < CUP + R && spd < 1.6 && cd > 1e-4) { b.vx += cdx / cd * 2.4 * dt; b.vz += cdz / cd * 2.4 * dt; }
    }
    return '';
  }
  // fait avancer une balle de dt (en petits pas pour ne jamais traverser une bordure)
  function advance(b, H, dt, t, ctx) {
    var spd = b.rail ? Math.abs(b.rail.v) : Math.hypot(b.vx, b.vz, b.vy || 0), n = Math.min(60, Math.max(1, Math.ceil(spd * dt / 0.02))), sub = dt / n, r = '';
    for (var i = 0; i < n && !r; i++) r = simStep(b, H, sub, t + i * sub, ctx);
    return r;
  }
  function atRest(b, H) {
    if (b.rail || b.air) return false;
    var fl = floorAt(H, b.x, b.z, b.y + 0.12), steep = fl ? Math.hypot(fl.f.gx, fl.f.gz) : 0, ice = fl && fl.f.zone === 'ice';
    return Math.hypot(b.vx, b.vz) < (ice ? 0.03 : 0.07) && steep < 0.02;
  }

  /* ------------------------------------------------------------------ un parcours complet : les 20 trous posés côte à côte ------------------------------------------------------------------ */
  var CACHE = {};
  function buildCourse(mapId) {
    if (CACHE[mapId]) return CACHE[mapId];
    var specs = (COURSE_DATA[mapId] || []), holes = [];
    // on range les trous en serpentin : 5 par rangée, chacun dans sa case (taille de la plus grande boîte + marge)
    var boxes = specs.map(function (sp) { var H0 = buildHole(sp, 0, 0); return H0.box; });
    var GAP = specs.length <= 10 ? 15 : 6, perRow = 5, cw = 0, chs = [];
    boxes.forEach(function (bx) { cw = Math.max(cw, bx[2] - bx[0]); });
    for (var r = 0; r * perRow < boxes.length; r++) { var mh = 0; for (var c = 0; c < perRow && r * perRow + c < boxes.length; c++) { var bb = boxes[r * perRow + c]; mh = Math.max(mh, bb[3] - bb[1]); } chs.push(mh); }
    var zc = 0;
    for (r = 0; r < chs.length; r++) {
      for (c = 0; c < perRow && r * perRow + c < boxes.length; c++) {
        var idx = r * perRow + c, col = r % 2 ? perRow - 1 - c : c, b2 = boxes[idx];
        var ox = col * (cw + GAP) - b2[0] + (cw - (b2[2] - b2[0])) / 2, oz = zc - b2[1] + (chs[r] - (b2[3] - b2[1])) / 2;
        var H = buildHole(specs[idx], ox, oz); H.index = idx; H.water = !!MAPS[mapId].water; holes.push(H);
      }
      zc += chs[r] + GAP;
    }
    var box = [1e9, 1e9, -1e9, -1e9]; holes.forEach(function (H) { box[0] = Math.min(box[0], H.box[0]); box[1] = Math.min(box[1], H.box[1]); box[2] = Math.max(box[2], H.box[2]); box[3] = Math.max(box[3], H.box[3]); });
    return (CACHE[mapId] = { id: mapId, holes: holes, box: box });
  }
  // les trous joués selon l'option « 10 ou 20 trous » (10 : un sur deux, du plus court au plus long)
  function holeList(n, mapId) { var out = [], cnt = ((COURSE_DATA[mapId] || [])).length || 20; for (var i = 0; i < cnt; i++) if (cnt <= 10 || n >= 20 || i % 2 === 1) out.push(i); return out; }
  function nowS() { return Date.now() / 1000; }

  /* ------------------------------------------------------------------ LES PARCOURS (générés par scripts/golf-gen.mjs) ------------------------------------------------------------------ */
  var COURSE_DATA = /*GOLF-DATA*/{"kraken":[{"n":"Le ponton","skin":"deck","p":2,"w":1.5,"pcs":[["s",2.4],["o","deco",{"fw":3,"lat":-9,"m":"voilier","sz":11,"rot":80}],["o","deco",{"fw":1,"lat":4.5,"m":"palmier","sz":4}],["o","deco",{"fw":4,"lat":3.2,"m":"canon","sz":1.1,"rot":200}],["o","deco",{"fw":3.6,"lat":2.6,"m":"caisse","sz":0.7}],["o","arch",{"fw":1.2,"lat":0,"hgt":2.6}],["r",50,2.6],["s",1.2],["l",50,2.6],["w",3,0.8],["s",0.8],["o","post",{"fw":1.7,"lat":0,"r":0.11}],["s",3.4]]},{"n":"Le chapeau du Kraken","skin":"purple","p":3,"w":1.5,"pcs":[["s",2.2],["l",60,2.4],["o","deco",{"fw":2.5,"lat":5,"m":"pieuvre","sz":5.4,"hat":true,"rot":200}],["s",1.3],["o","swing",{"fw":0,"lat":0.85,"amp":1.25,"speed":1,"ph":0.3}],["s",1.8],["r",60,2.4],["s",1.3],["o","swing",{"fw":0,"lat":0.85,"amp":1.25,"speed":1,"ph":0.8}],["s",1.8],["o","deco",{"fw":3,"lat":-4,"m":"tentacule","sz":4.4,"anim":"Idle|Poke"}],["w",3,0.8],["s",0.8],["o","bump",{"fw":1.6,"lat":-0.9,"r":0.18}],["o","bump",{"fw":1.6,"lat":0.9,"r":0.18}],["s",3.2]]},{"n":"La mâchoire du requin","skin":"bone","p":2,"w":1.5,"pcs":[["s",2.2],["o","deco",{"fw":1,"lat":0,"m":"jaw","sz":2.9}],["z","boost",1.2],["s",1.2],["s",1.4,0.35],["o","deco",{"fw":1.6,"lat":0,"m":"requin","sz":3,"lit":2.6,"circle":0.8,"anim":"Swimming_Normal","y":-0.4}],["o","deco",{"fw":1.8,"lat":0,"m":"requin","sz":2.4,"lit":2.6,"circle":0.6,"anim":"Swimming_Fast","y":-0.4,"rev":true}],["gap",3.2,"water",-0.35],["w",2.6,0.5],["s",3.2],["w",1.5,1],["l",70,2.2],["s",2.2],["o","deco",{"fw":1,"lat":5,"m":"raie","sz":4,"fly":5.5,"anim":"Swim","y":3}]]},{"n":"La boucle du tentacule","skin":"purple","p":3,"w":1.5,"pcs":[["s",2],["o","deco",{"fw":1,"lat":-3.2,"m":"tentacule","sz":5.4,"anim":"Idle|Poke|Attack"}],["o","deco",{"fw":5,"lat":3.4,"m":"tentacule","sz":4.6,"anim":"Idle|Poke|Attack"}],["z","boost",1.2],["s",1.2],["s",0.6],["w",0.54,1.8],["s",2.6],["loop","l"],["s",1.6],["w",1.5,1.4],["s",1],["r",80,2.2],["w",2.8,0.8],["s",0.8],["s",2.6]]},{"n":"La cale","skin":"hold","p":4,"w":1.5,"pcs":[["s",2.2],["o","deco",{"fw":0.4,"lat":0,"m":"beams","sz":6}],["o","slide",{"barrel":true,"boulder":false,"bw":0.5,"bd":0.55,"amp":0.47,"speed":1.2,"ph":0}],["s",2.2],["r",90,2.3],["s",1.4],["o","slide",{"barrel":true,"boulder":false,"bw":0.5,"bd":0.55,"amp":0.47,"speed":1.5,"ph":0.5}],["s",1.6],["o","deco",{"fw":-0.4,"lat":0,"m":"beams","sz":5}],["o","deco",{"fw":1.2,"lat":2.3,"m":"caisse","sz":0.8}],["o","deco",{"fw":2.2,"lat":-2.3,"m":"caisse","sz":0.8}],["o","deco",{"fw":3.4,"lat":-2.4,"m":"canon","sz":1.1,"rot":90}],["w",3,0.8],["s",0.8],["o","block",{"fw":1.4,"lat":-1.425,"bw":0.15,"bd":0.16,"bh":0.26}],["o","block",{"fw":1.4,"lat":0.525,"bw":1.95,"bd":0.16,"bh":0.26}],["o","block",{"fw":3,"lat":-0.525,"bw":1.95,"bd":0.16,"bh":0.26}],["o","block",{"fw":3,"lat":1.425,"bw":0.15,"bd":0.16,"bh":0.26}],["s",4.4]]},{"n":"Le canon du capitaine","skin":"deck","p":3,"w":1.5,"pcs":[["s",2.4],["l",40,2.4],["w",0.8,1],["s",1.2],["o","cannon",{"id":1,"fw":0.9,"lat":0,"r":0.36}],["s",1.3],["gap",6.5,"water",0.6],["o","exit",{"id":1,"fw":1.6,"lat":0}],["o","deco",{"fw":-3.4,"lat":-5.5,"m":"epave","sz":7,"rot":20}],["o","deco",{"fw":-3,"lat":0,"m":"requin","sz":3.2,"lit":2.6,"circle":1.2,"anim":"Swimming_Normal","y":-0.4}],["w",3.2,0.8],["s",0.8],["s",4.2]]},{"n":"Le bateau fantôme","skin":"wreck","p":3,"w":1.5,"pcs":[["s",2.4],["r",60,2.4],["o","deco",{"fw":1.5,"lat":-4.8,"m":"epave","sz":7.5,"rot":100}],["o","deco",{"fw":5,"lat":3.5,"m":"crane","sz":2,"fly":0,"anim":"Flying_Idle","y":1.8}],["w",2.6,0.8],["s",0.8],["o","portal",{"id":1,"fw":1.2,"lat":0,"r":0.34}],["o","block",{"fw":2,"lat":0,"bw":2.66,"bd":0.2,"bh":0.7}],["s",3],["w",1.5,0.8],["s",0.8],["l",90,2.2,0.8],["s",0.8],["o","exit",{"id":1,"fw":0.3,"lat":0}],["s",1.6],["r",200,2.6,-0.8],["s",2.4]]},{"n":"La montée de l'abîme","skin":"stone","p":3,"w":1.5,"pcs":[["s",2],["s",2,0.45],["s",1.3],["s",2,0.45],["s",1.3],["s",2,0.45],["s",1.3],["s",0.6],["o","deco",{"fw":0,"lat":4.5,"m":"lanterne","sz":1.8,"circle":1.4,"anim":"Swimming_Normal","y":3.2}],["r",180,2.6,-0.75],["s",1],["o","slide",{"barrel":true,"boulder":true,"bw":0.5,"bd":0.5,"amp":0.47,"speed":1.3,"ph":0.1}],["s",1.4,-0.6],["s",2]]},{"n":"La porte du crâne","skin":"bone","p":4,"w":1.5,"pcs":[["s",2],["o","deco",{"fw":1,"lat":0,"m":"skullgate","sz":2.5}],["w",1.1,0.6],["s",0.6],["nw",5,"water"],["z","belt",5],["s",5],["w",1.5,0.6],["s",0.8],["r",100,2.2],["s",1.4],["o","swing",{"fw":0,"lat":0.85,"amp":1.25,"speed":1,"ph":0.2}],["s",2.2],["w",2.8,0.8],["s",0.8],["o","patch",{"kind":"pit","fw":1.2,"lat":0.8,"r":0.42}],["o","patch",{"kind":"pit","fw":1.2,"lat":-0.8,"r":0.42}],["s",3]]},{"n":"Le Repaire du Kraken","skin":"purple","p":5,"w":1.5,"pcs":[["s",2],["o","arch",{"fw":1,"lat":0,"hgt":3}],["z","beltb",2.4],["s",2.4],["s",1],["l",150,1.4],["s",1.2],["o","swing",{"fw":0,"lat":0.85,"amp":1.25,"speed":1.1,"ph":0.1}],["s",1.8],["w",2.6,0.8],["s",0.8],["o","portal",{"id":1,"fw":1.1,"lat":0,"r":0.34}],["o","block",{"fw":1.9,"lat":0,"bw":2.66,"bd":0.2,"bh":0.7}],["s",3],["w",1.5,0.8],["s",0.8],["r",90,2.2,0.6],["s",0.8],["o","exit",{"id":1,"fw":0.3,"lat":0}],["s",1.6],["w",0.8,1],["s",1.2],["o","cannon",{"id":2,"fw":0.9,"lat":0,"r":0.36}],["s",1.3],["gap",5.5,"water",-0.6],["o","exit",{"id":2,"fw":1.5,"lat":0}],["w",4,0.8],["s",0.8],["o","patch",{"kind":"pit","fw":3.2,"lat":-0.8,"r":0.42}],["o","patch",{"kind":"pit","fw":3.2,"lat":0.8,"r":0.42}],["o","bump",{"fw":2.2,"lat":-1.5,"r":0.18}],["o","bump",{"fw":2.2,"lat":1.5,"r":0.18}],["s",5],["o","deco",{"fw":4.2,"lat":0,"m":"pieuvre","sz":9,"hat":true,"rot":180}]]}]}/*FIN-GOLF-DATA*/;

  var API = { R: R, CUP: CUP, VMAX: VMAX, GRAV: GRAV, MAXSHOTS: MAXSHOTS, WAIT_S: WAIT_S, WALL_H: WALL_H, GROUND: GROUND, WATER_Y: WATER_Y, LOOP_W: LOOP_W, MAPS: MAPS, MAP_IDS: MAP_IDS, POWERS: POWERS, DEFAULT_OPTS: DEFAULT_OPTS,
    walk: walk, buildHole: buildHole, buildCourse: buildCourse, holeList: holeList, spotFree: spotFree, logsAt: logsAt, swingDir: swingDir, dynTouch: dynTouch, patchAt: patchAt, inPoly: inPoly, floorAt: floorAt, floorH: floorH, fH: fH, dynSegs: dynSegs, gateOpen: gateOpen, simStep: simStep, advance: advance, atRest: atRest, setRailPos: setRailPos, nowS: nowS, COURSE_DATA: COURSE_DATA };
  if (typeof window !== 'undefined') { window.F3D = window.F3D || {}; window.F3D.golfSim = API; }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
