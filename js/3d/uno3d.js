/* =====================================================================
   uno3d.js — La salle des MINI JEUX (monde 3D, PC) : 3 tables d'UNO et 3 tables de PUISSANCE 4
   ---------------------------------------------------------------------
   On y entre par la porte « MINI JEUX » du hall (hall3d.js, thème « minijeux » de portes3d.js) et on en ressort vers le hall.
   La salle est faite pour du MULTIJOUEUR uniquement : aucun bot. Pour l'instant c'est le décor prêt à accueillir les parties :
   à gauche 3 tables rondes d'UNO (4 fauteuils chacune, pioche et défausse posées), à droite 3 tables de PUISSANCE 4 (grille bleue debout
   avec ses trous, jetons rouges et jaunes posés dans la grille, deux piles de jetons, un fauteuil de chaque côté).
   (L'identifiant interne de la salle reste « uno » : il est listé dans world3d.js et dans hall3d.js.)
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), portes3d.js (thèmes de porte).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;
  var HX = 15, HZ = 11, H = 5.6;
  var COLORS = ['#d6221e', '#f2c200', '#1f9d4a', '#1b63c9'];
  var TBL_Z = [-5.5, 0, 5.5], UNO_X = -8.5, C4_X = 8.5;
  var C4_PITCH = 0.14, C4_W = 1.12, C4_H = 0.98, C4_R = 0.052;       // grille de 7 colonnes x 6 lignes

  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function cyl(p, rt, rb, h, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- cartes UNO : face (couleur + chiffre) et dos ---------- */
  function unoCardTex(col, label) {
    var cv = mkCanvas(320, 480), c = cv.getContext('2d');
    rr(c, 8, 8, 304, 464, 36); c.fillStyle = '#fff'; c.fill(); rr(c, 24, 24, 272, 432, 24); c.fillStyle = col; c.fill();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, 80, 168, 0, 0, TAU); c.fill(); c.restore();
    c.fillStyle = col; c.font = '900 184px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 160, 248);
    c.fillStyle = '#fff'; c.font = '800 68px ' + SERIF; c.fillText(label, 72, 80); c.fillText(label, 248, 408);
    return mkTex(cv);
  }
  function unoBackTex() {
    var cv = mkCanvas(320, 480), c = cv.getContext('2d');
    rr(c, 8, 8, 304, 464, 36); c.fillStyle = '#fff'; c.fill(); rr(c, 24, 24, 272, 432, 24); c.fillStyle = '#15151a'; c.fill();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.fillStyle = '#d6221e'; c.beginPath(); c.ellipse(0, 0, 100, 190, 0, 0, TAU); c.fill(); c.restore();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.fillStyle = '#f2c200'; c.strokeStyle = '#111'; c.lineWidth = 10; c.font = '900 84px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('UNO', 0, 4); c.fillText('UNO', 0, 4); c.restore();
    return mkTex(cv);
  }

  function createUnoRoom(world) {
    var low = world.low;
    var room = { title: '🎮 MINI JEUX', subtitle: 'UNO · PUISSANCE 4', topic: 'flambeurs-uno-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- sol : grandes dalles sombres aux quatre couleurs d'UNO, joints dorés --- */
    var fc = mkCanvas(512, 512), fx = fc.getContext('2d'); fx.fillStyle = '#14101a'; fx.fillRect(0, 0, 512, 512);
    COLORS.forEach(function (col, k) { fx.fillStyle = col; fx.globalAlpha = 0.09; fx.fillRect((k % 2) * 256, Math.floor(k / 2) * 256, 256, 256); }); fx.globalAlpha = 1;
    for (i = 0; i < 40; i++) { fx.strokeStyle = 'rgba(255,255,255,' + (0.03 + Math.random() * 0.05) + ')'; fx.lineWidth = 1.2; fx.beginPath(); var vx = Math.random() * 512, vy = Math.random() * 512; fx.moveTo(vx, vy); fx.bezierCurveTo(vx + 60, vy + 40, vx - 40, vy + 120, vx + 30, vy + 200); fx.stroke(); }
    fx.fillStyle = '#c9a227'; fx.fillRect(0, 0, 512, 5); fx.fillRect(0, 0, 5, 512); fx.fillRect(0, 254, 512, 4); fx.fillRect(254, 0, 4, 512);
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 4, HZ * 2 / 4); ft.anisotropy = 16;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* --- murs : papier peint bordeaux à losanges, lambris de noyer, filets dorés (le mur de la porte est coupé à l'ouverture) --- */
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'); wx.fillStyle = '#4a1422'; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(224,186,92,0.28)'; wx.lineWidth = 2; for (i = -1; i < 5; i++) { wx.beginPath(); wx.moveTo(i * 64, 0); wx.lineTo(i * 64 + 256, 256); wx.moveTo(i * 64 + 256, 0); wx.lineTo(i * 64, 256); wx.stroke(); }
    wx.fillStyle = 'rgba(224,186,92,0.3)'; for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { wx.beginPath(); wx.arc(i * 64 + 32, j * 64, 3, 0, TAU); wx.fill(); }
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 16;
    function wall(len, px, pz, ry) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.2, H / 2.2); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }), woodM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
    var DG = 1.5;                                                  // demi-ouverture laissée libre devant la porte
    [[HX * 2, 0, -HZ + 0.04, 0], [HX - DG, -(HX + DG) / 2, HZ - 0.04, Math.PI], [HX - DG, (HX + DG) / 2, HZ - 0.04, Math.PI], [HZ * 2, -HX + 0.04, 0, Math.PI / 2], [HZ * 2, HX - 0.04, 0, -Math.PI / 2]].forEach(function (d) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(d[0], 1.2), new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.5, metalness: 0.15 })); m.position.set(d[1], 0.6, d[2]); m.rotation.y = d[3]; g.add(m);
    });
    [[HX * 2, 0.12, 0.1, 0, 1.2, -HZ + 0.05], [HX - DG, 0.12, 0.1, -(HX + DG) / 2, 1.2, HZ - 0.05], [HX - DG, 0.12, 0.1, (HX + DG) / 2, 1.2, HZ - 0.05], [0.1, 0.12, HZ * 2, -HX + 0.05, 1.2, 0], [0.1, 0.12, HZ * 2, HX - 0.05, 1.2, 0],
      [HX * 2, 0.2, 0.2, 0, H - 0.1, -HZ + 0.1], [HX * 2, 0.2, 0.2, 0, H - 0.1, HZ - 0.1], [0.2, 0.2, HZ * 2, -HX + 0.1, H - 0.1, 0], [0.2, 0.2, HZ * 2, HX - 0.1, H - 0.1, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* --- fauteuils capitonnés (le même modèle que le blackjack et les gobelets) --- */
    var velvetM = new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.75, side: THREE.DoubleSide }), velvetD = new THREE.MeshStandardMaterial({ color: 0x5c0a16, roughness: 0.8, side: THREE.DoubleSide });
    function makeChair(x, z, ry) {
      var q = new THREE.Group(); q.position.set(x, 0, z); q.rotation.y = ry; g.add(q);
      var seatY = 0.6, bh = 0.52, by = seatY + 0.06 + bh / 2;
      cyl(q, 0.27, 0.3, 0.035, gold, 0, 0.0175, 0, 24); cyl(q, 0.045, 0.06, seatY - 0.12, gold, 0, (seatY - 0.12) / 2 + 0.035, 0, 12);
      cyl(q, 0.25, 0.25, 0.11, velvetM, 0, seatY, 0, 28);
      var back = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, bh, 28, 1, true, Math.PI - 1.15, 2.3), velvetM); back.position.set(0, by, 0); q.add(back);
      var back2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, bh + 0.04, 28, 1, true, Math.PI - 1.17, 2.34), velvetD); back2.position.set(0, by, 0); q.add(back2);
      [-1, 1].forEach(function (sd) { cyl(q, 0.016, 0.016, bh + 0.06, gold, sd * Math.sin(1.15) * 0.3, by, Math.cos(Math.PI - 1.15) * 0.3, 8); });
      var top = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.014, 8, 28, 2.3), gold); top.rotation.x = Math.PI / 2; top.rotation.z = -Math.PI / 2 - 1.15; top.position.y = by + bh / 2 + 0.02; q.add(top);
      room.colliders.push({ x: x, z: z, r: 0.3 });
    }
    function lathe(p, pts, m, seg) { var o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), seg || 32), m); p.add(o); return o; }
    var lampM = new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }), bulbM = new THREE.MeshBasicMaterial({ color: 0xffe9b0 }), cordM = new THREE.MeshBasicMaterial({ color: 0x222222 });
    function pendant(p, x, z) {                                    // lampe suspendue au-dessus d'une table
      var lamp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.36, 24, 1, true), lampM); lamp.position.set(x, H - 1.5, z); p.add(lamp);
      var lrim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 6, 28), gold); lrim.rotation.x = Math.PI / 2; lrim.position.set(x, H - 1.68, z); p.add(lrim);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), bulbM); bulb.position.set(x, H - 1.62, z); p.add(bulb);
      cyl(p, 0.012, 0.012, 1.4, cordM, x, H - 0.7, z, 6);
    }

    /* --- tapis ronds sous les tables --- */
    var rc = mkCanvas(512, 512), rx = rc.getContext('2d'), rg = rx.createRadialGradient(256, 256, 20, 256, 256, 256);
    rg.addColorStop(0, '#5a1424'); rg.addColorStop(0.8, '#34101a'); rg.addColorStop(1, '#240b12'); rx.fillStyle = rg; rx.fillRect(0, 0, 512, 512);
    rx.strokeStyle = '#d9b441'; rx.lineWidth = 7; rx.beginPath(); rx.arc(256, 256, 236, 0, TAU); rx.stroke(); rx.lineWidth = 3; rx.beginPath(); rx.arc(256, 256, 222, 0, TAU); rx.stroke();
    var rugMat = new THREE.MeshStandardMaterial({ map: mkTex(rc), roughness: 0.9 });

    /* --- 3 tables d'UNO : plateau rond de feutre vert, bord de cuir, pioche, défausse, cartes devant chaque place, 4 fauteuils --- */
    var fe = mkCanvas(512, 512), fxx = fe.getContext('2d'), fg = fxx.createRadialGradient(256, 256, 20, 256, 256, 256); fg.addColorStop(0, '#1b8552'); fg.addColorStop(1, '#0b4a30'); fxx.fillStyle = fg; fxx.fillRect(0, 0, 512, 512);
    fxx.strokeStyle = '#e8c75a'; fxx.lineWidth = 8; fxx.beginPath(); fxx.arc(256, 256, 236, 0, TAU); fxx.stroke(); fxx.lineWidth = 3; fxx.beginPath(); fxx.arc(256, 256, 218, 0, TAU); fxx.stroke();
    COLORS.forEach(function (col, k) { fxx.fillStyle = col; fxx.globalAlpha = 0.85; var a = k / 4 * TAU + TAU / 8; fxx.beginPath(); fxx.arc(256 + Math.cos(a) * 186, 256 + Math.sin(a) * 186, 13, 0, TAU); fxx.fill(); }); fxx.globalAlpha = 1;
    var unoFelt = new THREE.MeshStandardMaterial({ map: mkTex(fe), roughness: 0.92 }), leatherM = new THREE.MeshStandardMaterial({ color: 0x6b1020, roughness: 0.45, metalness: 0.1 }), edgeM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5 });
    var cardGeo = new THREE.PlaneGeometry(0.24, 0.36), backM = new THREE.MeshBasicMaterial({ map: unoBackTex() }), faceM = COLORS.map(function (col, k) { return new THREE.MeshBasicMaterial({ map: unoCardTex(col, ['7', '2', '9', '5'][k]) }); });
    TBL_Z.forEach(function (tz, ti) {
      var t = new THREE.Group(); t.position.set(UNO_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(2.9, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      cyl(t, 1.25, 1.25, 0.1, [edgeM, unoFelt, edgeM], 0, 0.8, 0, 48);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.065, 10, 48), leatherM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.85; t.add(rim);
      var inl = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.012, 6, 48), gold); inl.rotation.x = Math.PI / 2; inl.position.y = 0.915; t.add(inl);
      lathe(t, [[0.001, 0.0], [0.5, 0.0], [0.52, 0.03], [0.44, 0.07], [0.28, 0.12], [0.18, 0.22], [0.15, 0.4], [0.19, 0.55], [0.26, 0.68], [0.001, 0.75]], woodM, 32);
      [[0.5, 0.03, 0.028], [0.18, 0.22, 0.022]].forEach(function (d) { var r = new THREE.Mesh(new THREE.TorusGeometry(d[0], d[2], 8, 32), gold); r.rotation.x = Math.PI / 2; r.position.y = d[1]; t.add(r); });
      var pile = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.36), new THREE.MeshBasicMaterial({ color: 0x15151a })); pile.position.set(-0.18, 0.885, 0); pile.rotation.y = 0.2; t.add(pile);
      var pt = new THREE.Mesh(cardGeo, backM); pt.rotation.x = -Math.PI / 2; pt.rotation.z = 0.2; pt.position.set(-0.18, 0.922, 0); t.add(pt);
      for (i = 0; i < 4; i++) { var dc = new THREE.Mesh(cardGeo, faceM[(i + ti) % 4]); dc.rotation.x = -Math.PI / 2; dc.rotation.z = -0.3 + i * 0.35; dc.position.set(0.2 + i * 0.01, 0.862 + i * 0.004, (i - 1.5) * 0.02); t.add(dc); }
      for (var s = 0; s < 4; s++) {                                // trois cartes cachées, en éventail, devant chaque place
        var sa = s / 4 * TAU + Math.PI / 4;
        for (var k = 0; k < 3; k++) { var hc = new THREE.Mesh(cardGeo, backM); hc.rotation.x = -Math.PI / 2; hc.rotation.z = -sa - Math.PI / 2 + (k - 1) * 0.22; hc.position.set(Math.cos(sa) * 0.82 + Math.cos(sa + Math.PI / 2) * (k - 1) * 0.1, 0.862 + k * 0.003, Math.sin(sa) * 0.82 + Math.sin(sa + Math.PI / 2) * (k - 1) * 0.1); t.add(hc); }
        var cx = UNO_X + Math.cos(sa) * 1.95, cz = tz + Math.sin(sa) * 1.95;
        makeChair(cx, cz, Math.atan2(-Math.cos(sa), -Math.sin(sa)));
      }
      pendant(g, UNO_X, tz);
      room.colliders.push({ x: UNO_X, z: tz, r: 1.45 });
    });

    /* --- 3 tables de PUISSANCE 4 : grille bleue debout avec ses vrais trous, jetons dans la grille, deux piles de jetons --- */
    var redM = new THREE.MeshStandardMaterial({ color: 0xd02a2a, roughness: 0.3, metalness: 0.05 }), yelM = new THREE.MeshStandardMaterial({ color: 0xe8c71a, roughness: 0.3, metalness: 0.05 }), blueM = new THREE.MeshStandardMaterial({ color: 0x4a57d6, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide });
    var bShape = new THREE.Shape(), hx = C4_W / 2; bShape.moveTo(-hx, 0); bShape.lineTo(hx, 0); bShape.lineTo(hx, C4_H); bShape.lineTo(-hx, C4_H); bShape.closePath();
    for (var cc = 0; cc < 7; cc++) for (var rw = 0; rw < 6; rw++) { var hole = new THREE.Path(); hole.absarc((cc - 3) * C4_PITCH, 0.14 + rw * C4_PITCH, C4_R, 0, TAU, true); bShape.holes.push(hole); }
    var boardGeo = new THREE.ExtrudeGeometry(bShape, { depth: 0.06, bevelEnabled: false, curveSegments: 14 });
    var discGeo = new THREE.CylinderGeometry(0.057, 0.057, 0.045, 20), footGeo = new THREE.BoxGeometry(0.09, 0.1, 0.26);
    var sk = mkCanvas(8, 84), skx = sk.getContext('2d'); for (i = 0; i < 21; i++) { skx.fillStyle = i % 2 ? '#ffffff' : '#c8c8c8'; skx.fillRect(0, i * 4, 8, 4); }
    function stackMat(col) { var tx = new THREE.CanvasTexture(sk); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return [new THREE.MeshStandardMaterial({ color: col, map: tx, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })]; }
    var stackR = stackMat(0xd02a2a), stackY = stackMat(0xe8c71a);
    var TT = 0.8;                                                   // hauteur du dessus de table
    TBL_Z.forEach(function (tz, ti) {
      var t = new THREE.Group(); t.position.set(C4_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(2.7, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      box(t, 2.0, 0.08, 1.2, new THREE.MeshStandardMaterial({ color: 0x14583a, roughness: 0.9 }), 0, TT - 0.04, 0);
      box(t, 2.08, 0.05, 0.05, leatherM, 0, TT + 0.005, 0.6); box(t, 2.08, 0.05, 0.05, leatherM, 0, TT + 0.005, -0.6); box(t, 0.05, 0.05, 1.2, leatherM, 1.0, TT + 0.005, 0); box(t, 0.05, 0.05, 1.2, leatherM, -1.0, TT + 0.005, 0);
      box(t, 1.92, 0.12, 1.12, edgeM, 0, TT - 0.14, 0); box(t, 2.04, 0.02, 1.24, gold, 0, TT - 0.075, 0);
      [[0.88, 0.48], [-0.88, 0.48], [0.88, -0.48], [-0.88, -0.48]].forEach(function (c) { cyl(t, 0.032, 0.04, TT - 0.2, gold, c[0], (TT - 0.2) / 2, c[1], 10); });
      var bd = new THREE.Mesh(boardGeo, blueM); bd.position.set(0, TT + 0.1, -0.03); t.add(bd);
      [-1, 1].forEach(function (sd) { var f = new THREE.Mesh(footGeo, blueM); f.position.set(sd * (hx - 0.1), TT + 0.05, 0); t.add(f); });
      var heights = [0, 0, 0, 0, 0, 0, 0], moves = 12 + ((ti * 3) % 5), mv;                    // une partie en cours : les jetons tombent colonne par colonne
      for (mv = 0; mv < moves; mv++) {
        var col = (mv * 3 + ti * 2 + (mv % 3)) % 7, tries = 0; while (heights[col] >= 6 && tries++ < 7) col = (col + 1) % 7; if (heights[col] >= 6) continue;
        var d = new THREE.Mesh(discGeo, mv % 2 ? yelM : redM); d.rotation.x = Math.PI / 2; d.position.set((col - 3) * C4_PITCH, TT + 0.1 + 0.14 + heights[col] * C4_PITCH, 0); t.add(d); heights[col]++;
      }
      [[-1, stackR], [1, stackY]].forEach(function (sp) { var sm = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.3, 20), sp[1]); sm.position.set(sp[0] * 0.8, TT + 0.15, 0.3); t.add(sm); });
      makeChair(C4_X, tz + 1.25, Math.PI); makeChair(C4_X, tz - 1.25, 0);
      pendant(g, C4_X, tz);
      room.colliders.push({ x: C4_X - 0.7, z: tz, r: 0.8 }, { x: C4_X, z: tz, r: 0.8 }, { x: C4_X + 0.7, z: tz, r: 0.8 });
    });

    // lumières
    g.add(new THREE.AmbientLight(0xf0e0e8, 1.2));
    if (!low) [[UNO_X, -2.75], [UNO_X, 2.75], [C4_X, -2.75], [C4_X, 2.75]].forEach(function (p) { var l = new THREE.PointLight(0xffd9a0, 0.8, 11); l.position.set(p[0], 4.2, p[1]); g.add(l); });
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall', theme: 'exitUno' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · la porte du fond ramène au hall' : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · à gauche : UNO, à droite : Puissance 4 · les parties multijoueur arrivent bientôt' + (w.full ? ' · Échap : quitter' : ''); };
    room.update = function () { };
    return room;
  }

  F.registerRoom('uno', createUnoRoom);
})();
