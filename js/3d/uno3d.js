/* =====================================================================
   uno3d.js — La salle des MINI JEUX (monde 3D, PC) : 3 tables d'UNO et 3 tables de PUISSANCE 4
   ---------------------------------------------------------------------
   On y entre par la porte « MINI JEUX » du hall (hall3d.js, thème « minijeux » de portes3d.js) et on en ressort vers le hall.
   La salle est faite pour du MULTIJOUEUR uniquement : aucun bot. On s'assoit à un fauteuil (F ou clic) et on joue avec les autres :
   à gauche 3 tables rondes d'UNO (2 à 4 joueurs), à droite 3 tables de PUISSANCE 4 (2 joueurs, grille bleue debout avec ses trous).
   Les règles sont dans minijeux-regles.js ; l'état de chaque table est partagé en temps réel avec les autres joueurs de la salle.
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
  function faceSym(c, kind, x, y, s, col) {                  // symboles des cartes « passe » et « sens »
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.16; c.lineCap = 'round';
    if (kind === 'S') { c.beginPath(); c.arc(0, 0, s * 0.62, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(-s * 0.44, s * 0.44); c.lineTo(s * 0.44, -s * 0.44); c.stroke(); }
    else { c.beginPath(); c.moveTo(-s * 0.6, -s * 0.3); c.lineTo(s * 0.2, -s * 0.3); c.stroke(); c.beginPath(); c.moveTo(s * 0.72, -s * 0.3); c.lineTo(s * 0.15, -s * 0.7); c.lineTo(s * 0.15, s * 0.1); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(s * 0.6, s * 0.3); c.lineTo(-s * 0.2, s * 0.3); c.stroke(); c.beginPath(); c.moveTo(-s * 0.72, s * 0.3); c.lineTo(-s * 0.15, -s * 0.1); c.lineTo(-s * 0.15, s * 0.7); c.closePath(); c.fill(); }
    c.restore();
  }
  // face d'une carte du jeu : couleur + chiffre ou symbole ; les jokers sont noirs avec un ovale aux quatre couleurs
  function unoFaceCanvas(card) {
    var ci = +card.charAt(0), v = card.slice(1), wild = ci === 4, col = wild ? '#15151a' : COLORS[ci];
    var cv = mkCanvas(320, 480), c = cv.getContext('2d');
    rr(c, 8, 8, 304, 464, 36); c.fillStyle = '#fff'; c.fill(); rr(c, 24, 24, 272, 432, 24); c.fillStyle = col; c.fill();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.beginPath(); c.ellipse(0, 0, 80, 168, 0, 0, TAU);
    if (wild) { c.clip(); COLORS.forEach(function (q, k) { c.fillStyle = q; c.fillRect(k % 2 ? 0 : -90, k < 2 ? -180 : 0, 90, 180); }); } else { c.fillStyle = '#fff'; c.fill(); }
    c.restore();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (v === 'S' || v === 'R') { faceSym(c, v, 160, 240, 74, col); faceSym(c, v, 72, 80, 26, '#fff'); faceSym(c, v, 248, 408, 26, '#fff'); }
    else if (v === 'D' || v === 'F') {
      var t = v === 'D' ? '+2' : '+4'; c.font = '900 120px ' + SERIF;
      if (wild) { c.strokeStyle = '#111'; c.lineWidth = 14; c.strokeText(t, 160, 244); c.fillStyle = '#fff'; } else c.fillStyle = col;
      c.fillText(t, 160, 244); c.fillStyle = '#fff'; c.font = '800 50px ' + SERIF; c.fillText(t, 76, 80); c.fillText(t, 244, 408);
    } else if (v !== 'W') { c.fillStyle = col; c.font = '900 184px ' + SERIF; c.fillText(v, 160, 248); c.fillStyle = '#fff'; c.font = '800 68px ' + SERIF; c.fillText(v, 72, 80); c.fillText(v, 248, 408); }
    return cv;
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

    /* --- cartes UNO du jeu : une texture par carte (créée à la demande), une miniature nette pour la main du joueur --- */
    var faceTexCache = {}, faceMatCache = {}, imgCache = {};
    function faceMat(card) { return faceMatCache[card] || (faceMatCache[card] = new THREE.MeshBasicMaterial({ map: mkTex(unoFaceCanvas(card)) })); }
    function faceImg(card) {
      if (imgCache[card]) return imgCache[card];
      var cv = mkCanvas(160, 240), x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(unoFaceCanvas(card), 0, 0, 160, 240);
      return (imgCache[card] = cv.toDataURL());
    }
    function labelTex(text, sub, active, col) {
      var cv = mkCanvas(320, 96), c = cv.getContext('2d'); rr(c, 4, 4, 312, 88, 26); c.fillStyle = 'rgba(8,5,12,0.86)'; c.fill(); c.strokeStyle = active ? '#ffe35a' : (col || 'rgba(201,162,39,0.8)'); c.lineWidth = active ? 9 : 5; c.stroke();
      c.fillStyle = active ? '#ffe35a' : '#f4e3b0'; c.font = '900 34px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 160, sub ? 38 : 50, 290);
      if (sub) { c.fillStyle = '#c9b88a'; c.font = '700 26px ' + SERIF; c.fillText(sub, 160, 70, 290); }
      return mkTex(cv);
    }
    function mkLabel() { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('', ''), transparent: true, depthWrite: false })); sp.scale.set(0.66, 0.2, 1); sp.visible = false; return sp; }
    function setLabel(sp, text, sub, active, col) { if (sp.material.map) sp.material.map.dispose(); sp.material.map = labelTex(text, sub, active, col); sp.material.needsUpdate = true; }

    /* --- 3 tables d'UNO : plateau rond de feutre vert, bord de cuir, pioche, défausse, 4 fauteuils (les cartes posées viennent de la partie) --- */
    var fe = mkCanvas(512, 512), fxx = fe.getContext('2d'), fg = fxx.createRadialGradient(256, 256, 20, 256, 256, 256); fg.addColorStop(0, '#1b8552'); fg.addColorStop(1, '#0b4a30'); fxx.fillStyle = fg; fxx.fillRect(0, 0, 512, 512);
    fxx.strokeStyle = '#e8c75a'; fxx.lineWidth = 8; fxx.beginPath(); fxx.arc(256, 256, 236, 0, TAU); fxx.stroke(); fxx.lineWidth = 3; fxx.beginPath(); fxx.arc(256, 256, 218, 0, TAU); fxx.stroke();
    COLORS.forEach(function (col, k) { fxx.fillStyle = col; fxx.globalAlpha = 0.85; var a = k / 4 * TAU + TAU / 8; fxx.beginPath(); fxx.arc(256 + Math.cos(a) * 186, 256 + Math.sin(a) * 186, 13, 0, TAU); fxx.fill(); }); fxx.globalAlpha = 1;
    var unoFelt = new THREE.MeshStandardMaterial({ map: mkTex(fe), roughness: 0.92 }), leatherM = new THREE.MeshStandardMaterial({ color: 0x6b1020, roughness: 0.45, metalness: 0.1 }), edgeM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5 });
    var cardGeo = new THREE.PlaneGeometry(0.24, 0.36), backM = new THREE.MeshBasicMaterial({ map: unoBackTex() });
    var chairs = [], TV = {}, ringGeo = new THREE.CircleGeometry(0.3, 32);
    function addChair(ch) {                                          // une place : le fauteuil, la zone cliquable pour s'asseoir et ses repères
      ch.yaw = Math.atan2(ch.tx - ch.x, -(ch.tz - ch.z)); ch.sx = ch.x + (ch.x - ch.tx) * 0.45; ch.sz = ch.z + (ch.z - ch.tz) * 0.45; chairs.push(ch);
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(ch.x, 0.7, ch.z); g.add(hit);
      room.interactables.push({ hit: hit, x: ch.x, z: ch.z, radius: 1.5, enabled: function () { return !seat && !chairTaken(ch); }, prompt: function () { return '🪑 S\'asseoir — ' + (ch.tid.charAt(0) === 'u' ? 'UNO' : 'Puissance 4') + ' · table ' + (ch.ti + 1); }, use: function (w) { sit(w, ch); } });
    }
    TBL_Z.forEach(function (tz, ti) {
      var t = new THREE.Group(), tid = 'u' + ti; t.position.set(UNO_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(2.9, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      cyl(t, 1.25, 1.25, 0.1, [edgeM, unoFelt, edgeM], 0, 0.8, 0, 48);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.065, 10, 48), leatherM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.85; t.add(rim);
      var inl = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.012, 6, 48), gold); inl.rotation.x = Math.PI / 2; inl.position.y = 0.915; t.add(inl);
      lathe(t, [[0.001, 0.0], [0.5, 0.0], [0.52, 0.03], [0.44, 0.07], [0.28, 0.12], [0.18, 0.22], [0.15, 0.4], [0.19, 0.55], [0.26, 0.68], [0.001, 0.75]], woodM, 32);
      [[0.5, 0.03, 0.028], [0.18, 0.22, 0.022]].forEach(function (d) { var r = new THREE.Mesh(new THREE.TorusGeometry(d[0], d[2], 8, 32), gold); r.rotation.x = Math.PI / 2; r.position.y = d[1]; t.add(r); });
      var pile = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.36), new THREE.MeshBasicMaterial({ color: 0x15151a })); pile.position.set(-0.18, 0.885, 0); pile.rotation.y = 0.2; t.add(pile);
      var pt = new THREE.Mesh(cardGeo, backM); pt.rotation.x = -Math.PI / 2; pt.rotation.z = 0.2; pt.position.set(-0.18, 0.922, 0); t.add(pt);
      var tv = TV[tid] = { kind: 'u', hands: [], labels: [] };
      tv.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x888888 })); tv.ring.rotation.x = -Math.PI / 2; tv.ring.position.set(0.2, 0.861, 0); tv.ring.visible = false; t.add(tv.ring);
      tv.top = new THREE.Mesh(cardGeo, backM); tv.top.rotation.x = -Math.PI / 2; tv.top.rotation.z = -0.25; tv.top.position.set(0.2, 0.868, 0); tv.top.visible = false; t.add(tv.top);
      for (var s = 0; s < 4; s++) {
        var sa = s / 4 * TAU + Math.PI / 4, hg = [];
        for (var k = 0; k < 9; k++) { var hc = new THREE.Mesh(cardGeo, backM); hc.rotation.x = -Math.PI / 2; hc.visible = false; t.add(hc); hg.push(hc); }
        tv.hands.push({ cards: hg, sa: sa });
        var lb = mkLabel(); lb.position.set(Math.cos(sa) * 1.0, 1.02, Math.sin(sa) * 1.0); t.add(lb); tv.labels.push(lb);
        var cx = UNO_X + Math.cos(sa) * 1.95, cz = tz + Math.sin(sa) * 1.95;
        makeChair(cx, cz, Math.atan2(-Math.cos(sa), -Math.sin(sa)));
        addChair({ tid: tid, ti: ti, local: s, n: ti * 4 + s, x: cx, z: cz, tx: UNO_X, tz: tz });
      }
      pendant(g, UNO_X, tz);
      room.colliders.push({ x: UNO_X, z: tz, r: 1.45 });
    });

    /* --- 3 tables de PUISSANCE 4 : grille bleue debout avec ses vrais trous, deux piles de jetons, un fauteuil de chaque côté --- */
    var redM = new THREE.MeshStandardMaterial({ color: 0xd02a2a, roughness: 0.3, metalness: 0.05 }), yelM = new THREE.MeshStandardMaterial({ color: 0xe8c71a, roughness: 0.3, metalness: 0.05 }), blueM = new THREE.MeshStandardMaterial({ color: 0x4a57d6, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide });
    var redG = new THREE.MeshStandardMaterial({ color: 0xff4a4a, emissive: 0xc01818, roughness: 0.3 }), yelG = new THREE.MeshStandardMaterial({ color: 0xfff06a, emissive: 0xb88a00, roughness: 0.3 });
    var bShape = new THREE.Shape(), hx = C4_W / 2; bShape.moveTo(-hx, 0); bShape.lineTo(hx, 0); bShape.lineTo(hx, C4_H); bShape.lineTo(-hx, C4_H); bShape.closePath();
    for (var cc = 0; cc < 7; cc++) for (var rw = 0; rw < 6; rw++) { var hole = new THREE.Path(); hole.absarc((cc - 3) * C4_PITCH, 0.14 + rw * C4_PITCH, C4_R, 0, TAU, true); bShape.holes.push(hole); }
    var boardGeo = new THREE.ExtrudeGeometry(bShape, { depth: 0.06, bevelEnabled: false, curveSegments: 14 });
    var discGeo = new THREE.CylinderGeometry(0.057, 0.057, 0.045, 20), footGeo = new THREE.BoxGeometry(0.09, 0.1, 0.26);
    var sk = mkCanvas(8, 84), skx = sk.getContext('2d'); for (i = 0; i < 21; i++) { skx.fillStyle = i % 2 ? '#ffffff' : '#c8c8c8'; skx.fillRect(0, i * 4, 8, 4); }
    function stackMat(col) { var tx = new THREE.CanvasTexture(sk); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return [new THREE.MeshStandardMaterial({ color: col, map: tx, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })]; }
    var stackR = stackMat(0xd02a2a), stackY = stackMat(0xe8c71a);
    var TT = 0.8;                                                   // hauteur du dessus de table
    TBL_Z.forEach(function (tz, ti) {
      var t = new THREE.Group(), tid = 'c' + ti; t.position.set(C4_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(2.7, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      box(t, 2.0, 0.08, 1.2, new THREE.MeshStandardMaterial({ color: 0x14583a, roughness: 0.9 }), 0, TT - 0.04, 0);
      box(t, 2.08, 0.05, 0.05, leatherM, 0, TT + 0.005, 0.6); box(t, 2.08, 0.05, 0.05, leatherM, 0, TT + 0.005, -0.6); box(t, 0.05, 0.05, 1.2, leatherM, 1.0, TT + 0.005, 0); box(t, 0.05, 0.05, 1.2, leatherM, -1.0, TT + 0.005, 0);
      box(t, 1.92, 0.12, 1.12, edgeM, 0, TT - 0.14, 0); box(t, 2.04, 0.02, 1.24, gold, 0, TT - 0.075, 0);
      [[0.88, 0.48], [-0.88, 0.48], [0.88, -0.48], [-0.88, -0.48]].forEach(function (c) { cyl(t, 0.032, 0.04, TT - 0.2, gold, c[0], (TT - 0.2) / 2, c[1], 10); });
      var bd = new THREE.Mesh(boardGeo, blueM); bd.position.set(0, TT + 0.1, -0.03); t.add(bd);
      [-1, 1].forEach(function (sd) { var f = new THREE.Mesh(footGeo, blueM); f.position.set(sd * (hx - 0.1), TT + 0.05, 0); t.add(f); });
      [[-1, stackR], [1, stackY]].forEach(function (sp) { var sm = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.3, 20), sp[1]); sm.position.set(sp[0] * 0.8, TT + 0.15, 0.3); t.add(sm); });
      var tv = TV[tid] = { kind: 'c', group: t, discs: {}, labels: [mkLabel(), mkLabel()] };
      tv.labels[0].position.set(0, TT + 0.3, 0.5); tv.labels[1].position.set(0, TT + 0.3, -0.5); t.add(tv.labels[0]); t.add(tv.labels[1]);
      makeChair(C4_X, tz + 1.25, Math.PI); makeChair(C4_X, tz - 1.25, 0);
      addChair({ tid: tid, ti: ti, local: 0, n: 12 + ti * 2, x: C4_X, z: tz + 1.25, tx: C4_X, tz: tz }); addChair({ tid: tid, ti: ti, local: 1, n: 13 + ti * 2, x: C4_X, z: tz - 1.25, tx: C4_X, tz: tz });
      pendant(g, C4_X, tz);
      room.colliders.push({ x: C4_X - 0.7, z: tz, r: 0.8 }, { x: C4_X, z: tz, r: 0.8 }, { x: C4_X + 0.7, z: tz, r: 0.8 });
    });

    /* =====================================================================
       LA PARTIE : l'état de chaque table est partagé entre les joueurs (canal temps réel de la salle).
       Chaque table a un « état » (voir minijeux-regles.js) avec un numéro de version. Celui qui joue modifie l'état, le numéro augmente
       et l'état complet est envoyé à tous ; chacun garde la version la plus récente. Quelqu'un qui arrive demande l'état des tables.
       ===================================================================== */
    var MJ = F.mj, TIDS = Object.keys(TV), G = {}, seat = null, ui = null, view = { yaw: 0, pitch: 0 }, pendingWild = -1, errMsg = '', errT = 0, standEl = null, missing = {}, anims = [], pruneT = 0;
    var CARD_RE = /^[0-4][0-9SRDWF]$/;
    function me() { return F.me(); }
    function myName() { try { return String(state.username || '').slice(0, 20); } catch (e) { return ''; } }
    function loggedIn() { try { return !!me() && (typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn()); } catch (e) { return false; } }
    function kindOf(tid) { return tid.charAt(0); }
    function getSt(tid) { return G[tid] || (G[tid] = kindOf(tid) === 'u' ? MJ.unoNew() : MJ.c4New()); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function chairN(tid, local) { for (var k = 0; k < chairs.length; k++) if (chairs[k].tid === tid && chairs[k].local === local) return chairs[k].n; return -1; }
    function chairTaken(ch) {
      var now = performance.now(), st = G[ch.tid], e = st && st.seats[ch.local];
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === ch.n && now - (r.recv || 0) < 4000; }) || !!(e && e.k !== me() && present(ch.tid, ch.local, e));
    }
    function present(tid, local, e) { var r = world.remote[e.k]; return !!(r && r.seat === chairN(tid, local) && performance.now() - (r.recv || 0) < 4000); }
    function okState(tid, st) {
      try {
        if (!st || typeof st.ver !== 'number' || !st.seats || typeof st.seats !== 'object') return false;
        var u = kindOf(tid) === 'u', lim = u ? 3 : 1, ok = true;
        Object.keys(st.seats).forEach(function (n) { var e = st.seats[n]; if (!(+n >= 0 && +n <= lim) || !e || typeof e.k !== 'string' || typeof e.name !== 'string') ok = false; else e.name = e.name.slice(0, 20); });
        if (!ok) return false;
        if (u) {
          var cards = function (a) { return Array.isArray(a) && a.length <= 120 && a.every(function (c) { return typeof c === 'string' && CARD_RE.test(c); }); };
          if (!cards(st.deck) || !cards(st.disc) || !st.hands || typeof st.hands !== 'object') return false;
          Object.keys(st.hands).forEach(function (n) { if (!(+n >= 0 && +n <= 3) || !cards(st.hands[n])) ok = false; });
          return ok && typeof st.turn === 'number' && typeof st.col === 'number' && (st.drawn === '' || (typeof st.drawn === 'string' && CARD_RE.test(st.drawn)));
        }
        return Array.isArray(st.g) && st.g.length === 7 && st.g.every(function (c) { return Array.isArray(c) && c.length <= 6 && c.every(function (v) { return v === 1 || v === 2; }); }) && typeof st.turn === 'number';
      } catch (e) { return false; }
    }
    function bcast(tid) { if (world.rt && world.rt.ready && G[tid]) { try { world.rt.send('gs', { k: me(), tid: tid, st: G[tid] }); } catch (e) { /* ok */ } } }
    // modifie l'état d'une table (fn renvoie un texte d'erreur si la règle refuse), puis l'envoie aux autres
    function mutate(tid, fn) {
      var st = clone(getSt(tid)), err = fn(st);
      if (err) return err;
      st.ver = (st.ver | 0) + 1; st.org = me(); G[tid] = st; bcast(tid); renderTable(tid);
      if (seat && seat.tid === tid) refreshUi();
      return '';
    }
    function adopt(tid, st) {
      var cur = G[tid];
      if (cur && (st.ver < cur.ver || (st.ver === cur.ver && String(st.org || '') <= String(cur.org || '')))) return;
      G[tid] = st; renderTable(tid);
      if (seat && seat.tid === tid) { reconcile(); refreshUi(); }
    }
    function joinFn(ch) { return function (st) { return (ch.tid.charAt(0) === 'u' ? MJ.unoJoin : MJ.c4Join)(st, ch.local, me(), myName()); }; }
    function reconcile() {              // si l'état reçu ne me connaît pas (deux joueurs arrivés en même temps), je me réinscris ; si ma place est prise, je me lève
      if (!seat) return;
      var e = getSt(seat.tid).seats[seat.local];
      if (e && e.k === me()) return;
      if (e) { world.flash('Cette place est prise.'); stand(true); return; }
      mutate(seat.tid, joinFn(seat));
    }

    /* --- dessin des tables à partir de l'état --- */
    function renderTable(tid) {
      var tv = TV[tid], st = G[tid]; if (!tv || !st) return;
      if (tv.kind === 'u') renderUno(tv, st, tid); else renderC4(tv, st, tid);
    }
    function renderUno(tv, st, tid) {
      var top = st.disc[st.disc.length - 1];
      tv.top.visible = tv.ring.visible = !!top;
      if (top) { tv.top.material = faceMat(top); tv.ring.material.color.set(st.col >= 0 && st.col < 4 ? COLORS[st.col] : '#888888'); }
      for (var s = 0; s < 4; s++) {
        var e = st.seats[s], hand = st.hands[s], n = hand ? hand.length : 0, h = tv.hands[s], vis = Math.min(n, 9), sa = h.sa, lb = tv.labels[s];
        for (var k = 0; k < 9; k++) {
          var cm = h.cards[k]; cm.visible = k < vis; if (k >= vis) continue;
          var off = k - (vis - 1) / 2;
          cm.rotation.z = -sa - Math.PI / 2 + off * 0.2;
          cm.position.set(Math.cos(sa) * 0.78 + Math.cos(sa + Math.PI / 2) * off * 0.075, 0.872 + k * 0.003, Math.sin(sa) * 0.78 + Math.sin(sa + Math.PI / 2) * off * 0.075);
        }
        lb.visible = !!e && !(seat && seat.tid === tid && seat.local === s);        // mon propre nom ne cache pas la table
        if (e) { var act = st.ph === 'play' && st.turn === s; var key = e.name + '|' + n + '|' + act + '|' + (st.win === s); if (lb.userData.key !== key) { lb.userData.key = key; setLabel(lb, (st.win === s ? '🏆 ' : act ? '▶ ' : '') + e.name, hand ? n + ' carte' + (n > 1 ? 's' : '') : (st.ph === 'play' ? 'spectateur' : 'prêt'), act || st.win === s); } }
      }
    }
    function renderC4(tv, st, tid) {
      var c, r, key, want = {};
      for (c = 0; c < 7; c++) for (r = 0; r < st.g[c].length; r++) {
        var p = st.g[c][r], inLine = !!(st.line && st.line.some(function (q) { return q[0] === c && q[1] === r; }));
        key = c + ',' + r; want[key] = true;
        var d = tv.discs[key], y1 = TT + 0.1 + 0.14 + r * C4_PITCH;
        if (d && d.p !== p) { tv.group.remove(d.m); delete tv.discs[key]; d = null; }
        if (!d) {
          var m = new THREE.Mesh(discGeo, p === 1 ? redM : yelM); m.rotation.x = Math.PI / 2; m.position.set((c - 3) * C4_PITCH, y1 + 0.9, 0); tv.group.add(m);
          d = tv.discs[key] = { m: m, p: p }; anims.push({ m: m, y0: y1 + 0.9, y1: y1, t: 0 });
        }
        d.m.material = inLine ? (p === 1 ? redG : yelG) : (p === 1 ? redM : yelM);
      }
      Object.keys(tv.discs).forEach(function (k) { if (!want[k]) { tv.group.remove(tv.discs[k].m); delete tv.discs[k]; } });
      for (var s = 0; s < 2; s++) {
        var e = st.seats[s], lb = tv.labels[s]; lb.visible = !!e && !(seat && seat.tid === tid && seat.local === s);
        if (e) { var act = st.ph === 'play' && st.turn === s, k2 = e.name + '|' + act + '|' + (st.win === s); if (lb.userData.key !== k2) { lb.userData.key = k2; setLabel(lb, (st.win === s ? '🏆 ' : act ? '▶ ' : '') + e.name, s === 0 ? 'jetons rouges' : 'jetons jaunes', act || st.win === s, s === 0 ? '#ff6a6a' : '#ffe35a'); } }
      }
    }

    /* --- interface --- */
    function injectCss() {
      if (document.getElementById('mj3d-css')) return;
      var s = document.createElement('style'); s.id = 'mj3d-css';
      s.textContent = '.mj3d{position:absolute;left:50%;bottom:62px;transform:translateX(-50%);width:min(700px,94%);background:rgba(8,5,12,.9);border:1px solid rgba(201,162,39,.6);border-radius:14px;padding:8px 12px;color:#f4e3b0;pointer-events:auto;display:flex;flex-direction:column;gap:6px;font-family:inherit;z-index:5}' +
        '.mj3d .mj-msg{min-height:18px;text-align:center;font-weight:800;font-size:14px}.mj3d .mj-pl{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-weight:800;font-size:12px;color:#c9b88a}.mj3d .mj-pl b{color:#ffe35a}' +
        '.mj3d .mj-hand{display:flex;gap:4px;justify-content:center;overflow-x:auto;padding:2px 0}.mj3d .mj-hand button{flex:none;border:2px solid transparent;border-radius:8px;padding:0;background:none;cursor:pointer;opacity:.45}.mj3d .mj-hand button.ok{opacity:1;border-color:#ffe35a}.mj3d .mj-hand img{display:block;width:58px;height:auto;border-radius:6px}' +
        '.mj3d .mj-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.mj3d .mj-b{padding:8px 16px;border-radius:12px;border:0;font-weight:900;font-size:14px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00)}.mj3d .mj-b:disabled{opacity:.4;cursor:not-allowed}.mj3d .mj-b.alt{background:#2a3b57;color:#e8f0ff}' +
        '.mj3d .mj-col{width:54px;padding:8px 0;border-radius:10px;border:2px solid #6a7bff;background:#1c2556;color:#fff;font-weight:900;font-size:15px;cursor:pointer}.mj3d .mj-col:disabled{opacity:.35;cursor:not-allowed}' +
        '.mj3d .mj-clr{width:64px;height:40px;border-radius:10px;border:3px solid #fff;cursor:pointer}' +
        '.mj3d-stand{position:absolute;left:14px;bottom:70px;z-index:5;pointer-events:auto}.mj3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(201,162,39,.6);background:rgba(8,5,12,.85);color:#f4e3b0;font-weight:800;cursor:pointer}';
      document.head.appendChild(s);
    }
    function setHtml(el, h) { if (el && el.__h !== h) { el.__h = h; el.innerHTML = h; } }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function buildUi(w) {
      injectCss();
      var el = document.createElement('div'); el.className = 'mj3d'; el.innerHTML = '<div class="mj-msg"></div><div class="mj-pl"></div><div class="mj-body"></div>';
      w.container.appendChild(el);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled || !seat) return;
        var a = b.dataset.a, tid = seat.tid, loc = seat.local, err = '';
        if (a === 'start') err = mutate(tid, function (st) { return kindOf(tid) === 'u' ? MJ.unoStart(st) : MJ.c4Start(st); });
        else if (a === 'draw') err = mutate(tid, function (st) { return MJ.unoDrawTurn(st, loc); });
        else if (a === 'pass') err = mutate(tid, function (st) { return MJ.unoPass(st, loc); });
        else if (a === 'card') playCard(+b.dataset.i);
        else if (a === 'color') { var i = pendingWild; pendingWild = -1; err = mutate(tid, function (st) { return MJ.unoPlay(st, loc, i, +b.dataset.c); }); }
        else if (a === 'nocolor') { pendingWild = -1; refreshUi(); }
        else if (a === 'col') err = dropCol(+b.dataset.c);
        if (err) { errMsg = err; errT = 3; refreshUi(); }
      });
      return { el: el };
    }
    function playCard(i) {
      var st = getSt(seat.tid), hand = st.hands[seat.local]; if (!hand || !hand[i]) return;
      if (st.turn !== seat.local || st.ph !== 'play') { errMsg = 'Ce n\'est pas ton tour.'; errT = 3; refreshUi(); return; }
      if (MJ.cardColor(hand[i]) === 4) { if (st.drawn && hand[i] !== st.drawn) { errMsg = 'Tu peux seulement poser la carte piochée, ou passer.'; errT = 3; } else pendingWild = i; refreshUi(); return; }
      var e = mutate(seat.tid, function (s2) { return MJ.unoPlay(s2, seat.local, i, -1); });
      if (e) { errMsg = e; errT = 3; refreshUi(); }
    }
    function dropCol(c) { var tid = seat.tid, loc = seat.local; return mutate(tid, function (st) { return MJ.c4Drop(st, loc, c); }); }
    function refreshUi() {
      if (!ui || !seat) return;
      var st = getSt(seat.tid), u = kindOf(seat.tid) === 'u', mine = st.ph === 'play' && st.turn === seat.local;
      var msg = errT > 0 ? errMsg : (st.msg || (Object.keys(st.seats).length < 2 ? 'En attente d\'un autre joueur…' : 'Tout le monde est là : lance la partie !'));
      if (st.ph === 'play' && mine && errT <= 0) msg = '👉 À toi de jouer ! ' + (st.msg && st.msg.indexOf('Au tour') !== 0 ? '— ' + st.msg : '');
      var m = ui.el.querySelector('.mj-msg'); if (m.textContent !== msg) m.textContent = msg; m.style.color = errT > 0 ? '#ff8a80' : (st.ph === 'over' && st.win === seat.local ? '#7ee0a0' : '');
      var pl = Object.keys(st.seats).map(Number).sort().map(function (n) {
        var e = st.seats[n], cnt = u && st.hands[n] ? ' · ' + st.hands[n].length + ' 🂠' : '', dot = u ? '' : (n === 0 ? '🔴 ' : '🟡 ');
        return (st.ph === 'play' && st.turn === n ? '<b>▶ ' : '<span>') + dot + esc(e.name) + cnt + (st.ph === 'play' && st.turn === n ? '</b>' : '</span>');
      }).join('') + (u && st.ph === 'play' ? '<span>Couleur : <b style="color:' + COLORS[st.col] + '">' + MJ.COLOR_NAMES[st.col] + '</b></span>' : '');
      setHtml(ui.el.querySelector('.mj-pl'), pl);
      var body = '', startTxt = st.ph === 'over' ? '🔁 Rejouer' : '▶ Lancer la partie', canStart = u ? Object.keys(st.seats).length >= 2 : !!(st.seats[0] && st.seats[1]);
      if (u) {
        var hand = st.hands[seat.local] || [];
        if (pendingWild >= 0) body = '<div class="mj-row">' + COLORS.map(function (c, k) { return '<button class="mj-clr" data-a="color" data-c="' + k + '" style="background:' + c + '"></button>'; }).join('') + '<button class="mj-b alt" data-a="nocolor">Annuler</button></div>';
        else {
          if (hand.length) body += '<div class="mj-hand">' + hand.map(function (c, i) { return '<button data-a="card" data-i="' + i + '" class="' + (mine && MJ.unoCanPlay(st, c) && (!st.drawn || st.drawn === c) ? 'ok' : '') + '"><img src="' + faceImg(c) + '" alt=""></button>'; }).join('') + '</div>';
          body += '<div class="mj-row">';
          if (st.ph === 'play' && hand.length) body += '<button class="mj-b" data-a="draw"' + (mine && !st.drawn ? '' : ' disabled') + '>🂠 Piocher</button>' + (st.drawn && mine ? '<button class="mj-b alt" data-a="pass">Passer</button>' : '');
          else body += '<button class="mj-b" data-a="start"' + (canStart ? '' : ' disabled') + '>' + startTxt + '</button>';
          body += '</div>';
        }
      } else {
        var mir = seat.local === 1, cols = [0, 1, 2, 3, 4, 5, 6].map(function (v) { return mir ? 6 - v : v; });      // le joueur du côté opposé voit la grille à l'envers
        if (st.ph === 'play') body = '<div class="mj-row">' + cols.map(function (c) { return '<button class="mj-col" data-a="col" data-c="' + c + '"' + (mine && st.g[c].length < 6 ? '' : ' disabled') + '>▼ ' + (c + 1) + '</button>'; }).join('') + '</div>';
        else body = '<div class="mj-row"><button class="mj-b" data-a="start"' + (canStart ? '' : ' disabled') + '>' + startTxt + '</button></div>';
      }
      setHtml(ui.el.querySelector('.mj-body'), body);
    }

    /* --- s'asseoir / se lever --- */
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if (kindOf(seat.tid) === 'c' && /^(Digit|Numpad)[1-7]$/.test(e.code)) {
        e.stopImmediatePropagation(); e.preventDefault();
        var v = +e.code.slice(-1) - 1, err = dropCol(seat.local === 1 ? 6 - v : v); if (err) { errMsg = err; errT = 3; refreshUi(); }
      }
    }
    function sit(w, ch) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (!loggedIn()) { w.flash('Connecte-toi pour jouer aux mini jeux.'); return; }
      if (chairTaken(ch)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = ch; view.yaw = view.pitch = 0; pendingWild = -1; errT = 0;
      ui = buildUi(w);
      standEl = document.createElement('div'); standEl.className = 'mj3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.firstChild.addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl);
      window.addEventListener('keydown', onSeatKey, true);
      if (world.rt && world.rt.ready) { try { world.rt.send('gq', { k: me(), tid: ch.tid }); } catch (e) { /* ok */ } }
      mutate(ch.tid, joinFn(ch)); refreshUi();
    }
    function stand(silent) {
      if (!seat) return;
      var s = seat; seat = null; pendingWild = -1;
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      if (G[s.tid] && G[s.tid].seats[s.local] && G[s.tid].seats[s.local].k === me()) mutate(s.tid, function (st) { return (kindOf(s.tid) === 'u' ? MJ.unoLeave : MJ.c4Leave)(st, s.local); });
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.standKey = false;
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.12, z: 0.28 };
    room.remotePose = function (r) { for (var k = 0; k < chairs.length; k++) if (chairs[k].n === r.seat) return { x: chairs[k].x, z: chairs[k].z, yaw: chairs[k].yaw }; return null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) {
      if (!seat) return;
      view.yaw = Math.max(-1.2, Math.min(1.2, drag.seat.yaw - dx * 0.006));
      if (drag.mouse) view.pitch = Math.max(-0.45, Math.min(0.35, drag.seat.pitch - dy * 0.004));
    };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.8; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      var u = kindOf(s.tid) === 'u', ex = s.x + (s.tx - s.x) * (u ? 0.14 : -0.35), ey = u ? 1.6 : 1.55, ez = s.z + (s.tz - s.z) * (u ? 0.14 : -0.35), ty = u ? 0.86 : 1.2;
      var a = Math.atan2(s.tx - ex, -(s.tz - ez)) + view.yaw, p = Math.atan2(ty - ey, Math.hypot(s.tx - ex, s.tz - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 62 };
    };
    room.syncHud = function () { refreshUi(); };

    /* --- réseau : on envoie l'état quand il change, on le redemande en arrivant --- */
    room.onRtMsg = function (ev, m) {
      if (ev === 'gs') { if (TIDS.indexOf(m.tid) >= 0 && okState(m.tid, m.st)) adopt(m.tid, m.st); }
      else if (ev === 'gq') { (m.tid === '*' ? TIDS : [m.tid]).forEach(function (tid) { var st = G[tid]; if (st && Object.keys(st.seats).length) bcast(tid); }); }
    };
    room.netStart = function (w) {
      if (!w.rt) return;
      var old = w.rt.onReady, ask = function () { try { w.rt.send('gq', { k: me(), tid: '*' }); } catch (e) { /* ok */ } };
      w.rt.onReady = function () { if (old) old(); ask(); };
      if (w.rt.ready) ask();
    };
    // quelqu'un qui n'envoie plus rien (parti sans se lever) est retiré de sa table au bout de 7 s, par le joueur assis le plus à gauche
    function prune() {
      var now = performance.now();
      TIDS.forEach(function (tid) {
        var st = G[tid]; if (!st) return;
        Object.keys(st.seats).forEach(function (ns) {
          var n = +ns, e = st.seats[n], mk = tid + ':' + n;
          if (e.k === me() || present(tid, n, e)) { delete missing[mk]; return; }
          if (!missing[mk]) { missing[mk] = now; return; }
          if (now - missing[mk] < 7000) return;
          delete missing[mk];
          var leave = kindOf(tid) === 'u' ? MJ.unoLeave : MJ.c4Leave;
          if (seat && seat.tid === tid) { var lowest = Object.keys(st.seats).map(Number).sort()[0]; if (st.seats[lowest] && (st.seats[lowest].k === me() || present(tid, lowest, st.seats[lowest]))) mutate(tid, function (s2) { return leave(s2, n); }); }
          else if (!seat || seat.tid !== tid) { var c2 = clone(st); leave(c2, n); G[tid] = c2; renderTable(tid); }
        });
      });
    }

    // lumières
    g.add(new THREE.AmbientLight(0xf0e0e8, 1.2));
    if (!low) [[UNO_X, -2.75], [UNO_X, 2.75], [C4_X, -2.75], [C4_X, 2.75]].forEach(function (p) { var l = new THREE.PointLight(0xffd9a0, 0.8, 11); l.position.set(p[0], 4.2, p[1]); g.add(l); });
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall', theme: 'exitUno' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un fauteuil pour jouer' : 'ZQSD / flèches : marcher · Maj : courir · à gauche : UNO (2 à 4 joueurs), à droite : Puissance 4 (2 joueurs) · avance vers un fauteuil (F ou clic) pour t\'asseoir et jouer avec les autres · F : se lever' + (w.full ? ' · Échap : quitter' : ''); };
    room.onLeave = function () { stand(); };
    room._etat = function () { return G; };
    room.dispose = function () { stand(); };
    room.update = function (dt) {
      if (errT > 0) { errT -= dt; if (errT <= 0 && ui) refreshUi(); }
      pruneT += dt; if (pruneT > 1.5) { pruneT = 0; prune(); }
      for (var k = anims.length - 1; k >= 0; k--) {
        var a = anims[k]; a.t += dt / 0.42; var u = Math.min(1, a.t), y = a.y1 + (a.y0 - a.y1) * (1 - u) * (1 - u);
        if (u >= 0.85) y += Math.sin((u - 0.85) / 0.15 * Math.PI) * 0.012;
        a.m.position.y = y; if (u >= 1) { a.m.position.y = a.y1; anims.splice(k, 1); }
      }
    };
    return room;
  }

  F.registerRoom('uno', createUnoRoom);
})();
