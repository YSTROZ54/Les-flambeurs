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
  var TBL_Z = [-6.6, 0, 6.6], UNO_Z = [-5.7, 5.7], UNO_X = -8.5, C4_X = 8.5;                    // tables bien espacées : les tapis ne se touchent plus
  var C4_PITCH = 0.0935, C4_W = 0.75, C4_H = 0.69, C4_R = 0.0355, C4_Y0 = 0.105;       // grille de 7 colonnes x 6 lignes

  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function cyl(p, rt, rb, h, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- cartes UNO : celles du modèle « Uno Cards 3D » (alifwicaksana, Sketchfab, licence CC BY 4.0) ----------
     Une seule image (assets/uno/cartes-uno.png) contient toutes les faces, rangées en grille ; chaque case y est retournée
     verticalement (convention des modèles 3D), on la remet à l'endroit en la dessinant. Tant que l'image n'est pas chargée,
     les anciennes cartes dessinées servent de secours. */
  var UNO_ATLAS = new Image(), atlasOk = false, atlasWait = [];
  UNO_ATLAS.onload = function () { atlasOk = true; var wl = atlasWait; atlasWait = []; wl.forEach(function (f) { try { f(); } catch (e) { /* ok */ } }); };
  UNO_ATLAS.src = 'assets/uno/cartes-uno.png?v=1';
  // case [ligne, colonne] de chaque carte, par couleur du jeu (0 rouge, 1 jaune, 2 vert, 3 bleu) ; n1 = la carte « 1 », les 2 à 9 suivent
  var ATL = [
    { n1: [3, 1], z: [3, 10], D: [3, 11], S: [2, 0], R: [2, 1] },
    { n1: [4, 0], z: [4, 9], D: [4, 10], S: [4, 11], R: [3, 0] },
    { n1: [1, 3], z: [0, 0], D: [0, 1], S: [0, 2], R: [0, 3] },
    { n1: [2, 2], z: [2, 11], D: [1, 0], S: [1, 1], R: [1, 2] }
  ];
  function atlasCell(card, col) {
    var ci = +card.charAt(0), v = card.slice(1);
    if (ci === 4) {                                          // joker / +4 : noir en main, sur la table au fond de la couleur choisie
      var base = v === 'F' ? 6 : 1;
      return [5, typeof col === 'number' && col >= 0 && col < 4 ? base + [2, 1, 4, 3][col] : base];
    }
    var a = ATL[ci]; if (!a) return null;
    if (v === '0') return a.z;
    if (/^[1-9]$/.test(v)) return [a.n1[0], a.n1[1] + (+v) - 1];
    return a[v] || null;
  }
  function drawCell(c, rc, W, H) {                          // une case de l'image, remise à l'endroit, aux coins arrondis
    c.save(); rr(c, 0, 0, W, H, W * 0.075); c.clip(); c.translate(0, H); c.scale(1, -1);
    c.drawImage(UNO_ATLAS, rc[1] * 167.5 + 1, 499 + rc[0] * 258.6 + 1, 163, 254, 0, 0, W, H); c.restore();
  }

  /* ---------- anciennes cartes dessinées (secours) : face (couleur + chiffre) et dos ---------- */
  function faceSym(c, kind, x, y, s, col) {                  // symboles des cartes « passe » et « sens »
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.16; c.lineCap = 'round';
    if (kind === 'S') { c.beginPath(); c.arc(0, 0, s * 0.62, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(-s * 0.44, s * 0.44); c.lineTo(s * 0.44, -s * 0.44); c.stroke(); }
    else { c.beginPath(); c.moveTo(-s * 0.6, -s * 0.3); c.lineTo(s * 0.2, -s * 0.3); c.stroke(); c.beginPath(); c.moveTo(s * 0.72, -s * 0.3); c.lineTo(s * 0.15, -s * 0.7); c.lineTo(s * 0.15, s * 0.1); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(s * 0.6, s * 0.3); c.lineTo(-s * 0.2, s * 0.3); c.stroke(); c.beginPath(); c.moveTo(-s * 0.72, s * 0.3); c.lineTo(-s * 0.15, -s * 0.1); c.lineTo(-s * 0.15, s * 0.7); c.closePath(); c.fill(); }
    c.restore();
  }
  // face d'une carte du jeu : couleur + chiffre ou symbole ; les jokers sont noirs avec un ovale aux quatre couleurs
  function unoFaceCanvas(card, chosen) {
    var cell = atlasOk ? atlasCell(card, chosen) : null;
    if (cell) { var cva = mkCanvas(330, 495); drawCell(cva.getContext('2d'), cell, 330, 495); return cva; }
    var ci = +card.charAt(0), v = card.slice(1), wild = ci === 4, col = wild ? '#15151a' : COLORS[ci];
    var cv = mkCanvas(640, 960), c = cv.getContext('2d'); c.scale(2, 2);
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
    var cv = mkCanvas(640, 960), c = cv.getContext('2d'), tex = null;
    function paintAtlas() { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 640, 960); drawCell(c, [5, 0], 640, 960); if (tex) tex.needsUpdate = true; }   // le dos « UNO » du modèle
    if (atlasOk) { paintAtlas(); return (tex = mkTex(cv)); }
    atlasWait.push(paintAtlas); c.scale(2, 2);
    rr(c, 8, 8, 304, 464, 36); c.fillStyle = '#fff'; c.fill(); rr(c, 24, 24, 272, 432, 24); c.fillStyle = '#15151a'; c.fill();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.fillStyle = '#d6221e'; c.beginPath(); c.ellipse(0, 0, 100, 190, 0, 0, TAU); c.fill(); c.restore();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.fillStyle = '#f2c200'; c.strokeStyle = '#111'; c.lineWidth = 10; c.font = '900 84px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('UNO', 0, 4); c.fillText('UNO', 0, 4); c.restore();
    return (tex = mkTex(cv));
  }

  function createUnoRoom(world, kind) {
    var low = world.low, isC4 = kind === 'c4';
    var UNO_P = isC4 ? [] : [[-6.5, -5.4], [6.5, -5.4], [-6.5, 5.2], [6.5, 5.2]], C4_P = isC4 ? [[-9, -5], [0, -5], [9, -5], [-9, 3.6], [0, 3.6], [9, 3.6]] : [];     // positions des tables de chaque salle
    var room = { title: isC4 ? '🔴 PUISSANCE 4' : '🃏 UNO', subtitle: isC4 ? 'SIX TABLES · 2 JOUEURS' : 'QUATRE TABLES · 2 À 4 JOUEURS', topic: isC4 ? 'flambeurs-puissance4-room' : 'flambeurs-uno-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
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
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'); wx.fillStyle = '#14305c'; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(224,186,92,0.28)'; wx.lineWidth = 2; for (i = -1; i < 5; i++) { wx.beginPath(); wx.moveTo(i * 64, 0); wx.lineTo(i * 64 + 256, 256); wx.moveTo(i * 64 + 256, 0); wx.lineTo(i * 64, 256); wx.stroke(); }
    wx.fillStyle = 'rgba(224,186,92,0.3)'; for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { wx.beginPath(); wx.arc(i * 64 + 32, j * 64, 3, 0, TAU); wx.fill(); }
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 16;
    function wall(len, px, pz, ry) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.2, H / 2.2); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }), woodM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
    var DG = 1.5;                                                  // demi-ouverture laissée libre devant la porte de sortie
    // (plus de lambris ni de bandes dorées : les murs sont seulement tapissés)
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* --- fauteuils capitonnés (le même modèle que le blackjack et les gobelets) --- */
    var velvetM = new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.75, side: THREE.DoubleSide }), velvetD = new THREE.MeshStandardMaterial({ color: 0x5c0a16, roughness: 0.8, side: THREE.DoubleSide });
    function vm(col) { return new THREE.MeshStandardMaterial({ color: col, roughness: 0.72, side: THREE.DoubleSide }); }
    var chairU = vm(0x0f6a45), chairUD = vm(0x083d29), chairC = vm(0x2347b8), chairCD = vm(0x132a70);
    // fauteuil club : quatre pieds dorés effilés, assise épaisse, dossier incliné capitonné de boutons dorés, accoudoirs ; il regarde vers +z, le dos est à -z
    function makeChair(x, z, ry, mat, matD) {
      var q = new THREE.Group(); q.position.set(x, 0, z); q.rotation.y = ry; g.add(q);
      [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]].forEach(function (l) { cyl(q, 0.032, 0.02, 0.46, gold, l[0], 0.23, l[1], 10); });
      box(q, 0.58, 0.05, 0.54, matD, 0, 0.47, 0);
      var seatB = box(q, 0.58, 0.14, 0.54, mat, 0, 0.54, 0.01);
      box(q, 0.6, 0.015, 0.56, gold, 0, 0.465, 0);
      var back = box(q, 0.58, 0.7, 0.11, mat, 0, 0.98, -0.26); back.rotation.x = -0.12;
      var back2 = box(q, 0.62, 0.74, 0.05, matD, 0, 0.99, -0.32); back2.rotation.x = -0.12;
      var rail = box(q, 0.64, 0.045, 0.14, gold, 0, 1.36, -0.285); rail.rotation.x = -0.12;
      for (var bx = -1; bx <= 1; bx++) for (var by = 0; by < 3; by++) { var btn = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), gold); btn.position.set(bx * 0.17, 0.82 + by * 0.19, -0.2 - by * 0.0227); q.add(btn); }
      [-1, 1].forEach(function (sd) {
        box(q, 0.07, 0.06, 0.46, matD, sd * 0.325, 0.78, -0.03); cyl(q, 0.016, 0.016, 0.2, gold, sd * 0.325, 0.68, 0.15, 8); box(q, 0.075, 0.015, 0.47, gold, sd * 0.325, 0.815, -0.03);
      });
      room.colliders.push({ x: x, z: z, r: 0.32 });
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
    function faceMat(card, col) {
      var wc = card.charAt(0) === '4' && typeof col === 'number' && col >= 0 && col < 4 ? col : -1, key = card + (wc >= 0 ? '|' + wc : '');
      if (faceMatCache[key]) return faceMatCache[key];
      var t = mkTex(unoFaceCanvas(card, wc)); t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipMapLinearFilter;
      if (!atlasOk) atlasWait.push(function () { t.image = unoFaceCanvas(card, wc); t.needsUpdate = true; });
      return (faceMatCache[key] = new THREE.MeshBasicMaterial({ map: t }));
    }
    atlasWait.push(function () { imgCache = {}; });          // les miniatures de la main sont refaites avec les nouvelles cartes
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
    function badgeTex(n) {                                          // petite carte avec le nombre de cartes du joueur, posée à côté de lui
      var cv = mkCanvas(128, 192), c = cv.getContext('2d'); rr(c, 8, 8, 112, 176, 16); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#15151a'; c.stroke(); rr(c, 18, 18, 92, 156, 10); c.fillStyle = '#d6221e'; c.fill();
      c.fillStyle = '#fff'; c.font = '900 ' + (n > 9 ? 64 : 84) + 'px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), 64, 100, 84); return mkTex(cv);
    }
    function mkLabel() { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('', ''), transparent: true, depthWrite: false })); sp.scale.set(0.66, 0.2, 1); sp.visible = false; return sp; }
    function setLabel(sp, text, sub, active, col) { if (sp.material.map) sp.material.map.dispose(); sp.material.map = labelTex(text, sub, active, col); sp.material.needsUpdate = true; }

    /* --- 3 tables d'UNO : plateau rond de feutre vert, bord de cuir, pioche, défausse, 4 fauteuils (les cartes posées viennent de la partie) --- */
    var fe = mkCanvas(512, 512), fxx = fe.getContext('2d'), fg = fxx.createRadialGradient(256, 256, 20, 256, 256, 256); fg.addColorStop(0, '#1b8552'); fg.addColorStop(1, '#0b4a30'); fxx.fillStyle = fg; fxx.fillRect(0, 0, 512, 512);
    fxx.strokeStyle = '#e8c75a'; fxx.lineWidth = 8; fxx.beginPath(); fxx.arc(256, 256, 236, 0, TAU); fxx.stroke(); fxx.lineWidth = 3; fxx.beginPath(); fxx.arc(256, 256, 218, 0, TAU); fxx.stroke();
    fxx.fillStyle = 'rgba(232,199,90,0.14)'; fxx.font = '900 130px ' + SERIF; fxx.textAlign = 'center'; fxx.textBaseline = 'middle'; fxx.fillText('UNO', 256, 256);
    COLORS.forEach(function (col, k) { fxx.fillStyle = col; fxx.globalAlpha = 0.85; var a = k / 4 * TAU + TAU / 8; fxx.beginPath(); fxx.arc(256 + Math.cos(a) * 186, 256 + Math.sin(a) * 186, 13, 0, TAU); fxx.fill(); }); fxx.globalAlpha = 1;
    var unoFelt = new THREE.MeshStandardMaterial({ map: mkTex(fe), roughness: 0.92 }), leatherM = new THREE.MeshStandardMaterial({ color: 0x6b1020, roughness: 0.45, metalness: 0.1 }), edgeM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5 });
    var UR = 2.25, USEAT = 3.3, UHR = 1.62, UARR = 1.74;                       // table d'UNO : rayon, rayon des fauteuils, rayon des mains posées, rayon des flèches
    var arrowShape = new THREE.Shape(); arrowShape.moveTo(-0.26, -0.065); arrowShape.lineTo(0.05, -0.065); arrowShape.lineTo(0.05, -0.17); arrowShape.lineTo(0.28, 0); arrowShape.lineTo(0.05, 0.17); arrowShape.lineTo(0.05, 0.065); arrowShape.lineTo(-0.26, 0.065); arrowShape.closePath();
    function curvedArrow(w2, hw, a0, a1, tipA) {    // flèche courbe (arc de cercle + pointe) qui suit le bord de la table : bien plus jolie que l'ancien trait droit
      var sh2 = new THREE.Shape(), R0 = UARR, N2 = 20, k2, an;
      function P2(r, a) { return [Math.sin(a) * r, R0 - Math.cos(a) * r]; }       // repère local de la flèche (le centre de la table est en (0, R0))
      var st0 = P2(R0 - w2, a0); sh2.moveTo(st0[0], st0[1]);
      for (k2 = 1; k2 <= N2; k2++) { an = a0 + (a1 - a0) * k2 / N2; var q2 = P2(R0 - w2, an); sh2.lineTo(q2[0], q2[1]); }
      var b1 = P2(R0 - hw, a1), tip = P2(R0, a1 + tipA), b2 = P2(R0 + hw, a1); sh2.lineTo(b1[0], b1[1]); sh2.lineTo(tip[0], tip[1]); sh2.lineTo(b2[0], b2[1]);
      for (k2 = N2; k2 >= 0; k2--) { an = a0 + (a1 - a0) * k2 / N2; var q3 = P2(R0 + w2, an); sh2.lineTo(q3[0], q3[1]); }
      sh2.closePath(); return sh2;
    }
    arrowShape = curvedArrow(0.07, 0.17, -0.32, 0.2, 0.16);
    var arrowGeoOut = new THREE.ShapeGeometry(curvedArrow(0.105, 0.225, -0.345, 0.19, 0.205), 24);       // liseré sombre autour
    var arrowGeo = new THREE.ShapeGeometry(arrowShape, 24), arrowM = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffd34d, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    var arrowOutM = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x1a1208, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    var headArrowGeo = new THREE.ConeGeometry(0.13, 0.3, 18); headArrowGeo.rotateX(Math.PI); var headArrowM = new THREE.MeshBasicMaterial({ color: 0xffe35a });
    var cardGeo = new THREE.PlaneGeometry(0.29, 0.435), bigCardGeo = new THREE.PlaneGeometry(0.48, 0.72), pileCardGeo = new THREE.PlaneGeometry(0.24, 0.36), backM = new THREE.MeshBasicMaterial({ map: unoBackTex() });
    var chairs = [], TV = {}, ringGeo = new THREE.CircleGeometry(0.5, 48);
    function addChair(ch) {                                          // une place : le fauteuil, la zone cliquable pour s'asseoir et ses repères
      ch.yaw = Math.atan2(ch.tx - ch.x, -(ch.tz - ch.z)); ch.sx = ch.x + (ch.x - ch.tx) * 0.45; ch.sz = ch.z + (ch.z - ch.tz) * 0.45; chairs.push(ch);
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(ch.x, 0.7, ch.z); g.add(hit);
      room.interactables.push({ hit: hit, x: ch.x, z: ch.z, radius: 1.5, enabled: function () { return !seat && !chairTaken(ch); }, prompt: function () { return '🪑 S\'asseoir — ' + (ch.tid.charAt(0) === 'u' ? 'UNO' : 'Puissance 4') + ' · table ' + (ch.ti + 1); }, use: function (w) { sit(w, ch); } });
    }
    var creditMat = (function () {
      var cv = mkCanvas(2048, 2048), c = cv.getContext('2d'), R = 840, txt = '✦  CARTES « UNO CARDS 3D » PAR ALIFWICAKSANA · SKETCHFAB · LICENCE CC BY 4.0  ', fs0 = 60;
      c.font = '700 ' + fs0 + 'px ' + SERIF; var fs1 = Math.min(50, fs0 * TAU * R * 0.97 / (c.measureText(txt).width * 2));
      c.translate(1024, 1024); c.font = '700 ' + fs1.toFixed(1) + 'px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e6c766';
      var a = -Math.PI / 2, chars = (txt + txt).split('');
      chars.forEach(function (ch) { var w = c.measureText(ch).width; a -= w / 2 / R; c.save(); c.rotate(a + Math.PI / 2); c.translate(0, -R); c.rotate(Math.PI); c.fillText(ch, 0, 0); c.restore(); a -= w / 2 / R; });   // haut des lettres vers la table : lisible quand on est autour
      c.strokeStyle = 'rgba(230,199,102,0.55)'; c.lineWidth = 5; [R - fs1 * 0.85, R + fs1 * 0.85].forEach(function (r) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); });
      return new THREE.MeshBasicMaterial({ map: mkTex(cv), transparent: true, depthWrite: false });
    })(), creditGeo = new THREE.PlaneGeometry(2.44, 2.44);   // l'anneau de texte passe à 1 m du centre : caché sous le plateau, autour du pied
    var DECK_X = -0.36, DISC_X = 0.3;                      // la pioche et la défausse, côte à côte au centre de la table
    UNO_P.forEach(function (pp, ti) {
      var tz = pp[1], UNO_X = pp[0];
      var t = new THREE.Group(), tid = 'u' + ti; t.position.set(UNO_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(4.15, 64), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      var credit = new THREE.Mesh(creditGeo, creditMat); credit.rotation.x = -Math.PI / 2; credit.position.y = 0.016; t.add(credit);   // crédit de l'auteur des cartes, caché sous la table
      cyl(t, UR, UR, 0.1, [edgeM, unoFelt, edgeM], 0, 0.8, 0, 64);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(UR, 0.105, 12, 80), leatherM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.86; t.add(rim);
      cyl(t, UR - 0.05, UR - 0.05, 0.13, edgeM, 0, 0.72, 0, 64); var skirt = new THREE.Mesh(new THREE.TorusGeometry(UR - 0.05, 0.024, 8, 80), gold); skirt.rotation.x = Math.PI / 2; skirt.position.y = 0.655; t.add(skirt);
      var inl = new THREE.Mesh(new THREE.TorusGeometry(UR, 0.013, 6, 64), gold); inl.rotation.x = Math.PI / 2; inl.position.y = 0.915; t.add(inl);
      lathe(t, [[0.001, 0.0], [0.5, 0.0], [0.52, 0.03], [0.44, 0.07], [0.28, 0.12], [0.18, 0.22], [0.15, 0.4], [0.19, 0.55], [0.26, 0.68], [0.001, 0.75]].map(function (q) { return [q[0] * 1.35, q[1]]; }), woodM, 32);
      [[0.5 * 1.35, 0.03, 0.03], [0.18 * 1.35, 0.22, 0.024]].forEach(function (d) { var r = new THREE.Mesh(new THREE.TorusGeometry(d[0], d[2], 8, 32), gold); r.rotation.x = Math.PI / 2; r.position.y = d[1]; t.add(r); });
      var pile = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.07, 0.375), new THREE.MeshBasicMaterial({ color: 0x15151a })); pile.position.set(DECK_X, 0.885, 0); pile.rotation.y = 0.15; t.add(pile);
      var pt = new THREE.Mesh(pileCardGeo, backM); pt.rotation.x = -Math.PI / 2; pt.rotation.z = 0.15; pt.position.set(DECK_X, 0.922, 0); t.add(pt);
      var tv = TV[tid] = { kind: 'u', group: t, hands: [], labels: [], heads: [], arrows: [], badges: [] };
      tv.deckHit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.62), new THREE.MeshBasicMaterial({ visible: false })); tv.deckHit.position.set(DECK_X, 0.95, 0); t.add(tv.deckHit);   // on pioche en cliquant sur le paquet
      tv.deckArrow = new THREE.Group(); tv.deckArrow.position.set(DECK_X, 1.2, 0); tv.deckArrow.visible = false; t.add(tv.deckArrow);                                                        // petite flèche : « pioche ici »
      (function () { var am2 = new THREE.MeshBasicMaterial({ color: 0xffe35a }), cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 20), am2); cone.rotation.x = Math.PI; tv.deckArrow.add(cone); var st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 12), am2); st2.position.y = 0.12; tv.deckArrow.add(st2); })();
      for (var aq = 0; aq < 4; aq++) {                                       // flèches de sens de jeu, dans les espaces entre les mains
        var am = (aq + 0.5) / 4 * TAU + Math.PI / 4, ag = new THREE.Group(); ag.position.set(Math.cos(am) * UARR, 0.884, Math.sin(am) * UARR);
        var ash0 = new THREE.Mesh(arrowGeoOut, arrowOutM); ash0.rotation.x = -Math.PI / 2; ash0.renderOrder = 5; ag.add(ash0); var ash = new THREE.Mesh(arrowGeo, arrowM); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.002; ash.renderOrder = 6; ag.add(ash); ag.visible = false; t.add(ag); tv.arrows.push({ g: ag, am: am, phi: am + Math.PI / 2 });
      }
      tv.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x888888 })); tv.ring.rotation.x = -Math.PI / 2; tv.ring.position.set(DISC_X, 0.861, 0); tv.ring.visible = false; t.add(tv.ring);
      tv.top2 = new THREE.Mesh(bigCardGeo, backM); tv.top2.rotation.x = -Math.PI / 2; tv.top2.rotation.z = 0.5; tv.top2.position.set(DISC_X - 0.06, 0.866, 0.08); tv.top2.visible = false; t.add(tv.top2);
      tv.top = new THREE.Mesh(bigCardGeo, backM); tv.top.rotation.x = -Math.PI / 2; tv.top.rotation.z = -0.2; tv.top.position.set(DISC_X, 0.873, 0); tv.top.visible = false; t.add(tv.top);
      for (var s = 0; s < 4; s++) {
        var sa = s / 4 * TAU + Math.PI / 4, hg = [];
        for (var k = 0; k < 9; k++) { var hc = new THREE.Mesh(cardGeo, backM); hc.rotation.x = -Math.PI / 2; hc.visible = false; t.add(hc); hg.push(hc); }
        tv.hands.push({ cards: hg, sa: sa });
        var lb = mkLabel(); lb.position.set(Math.cos(sa) * (UR + 0.12), 1.02, Math.sin(sa) * (UR + 0.12)); t.add(lb); tv.labels.push(lb);
        var bgd = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex(0), transparent: true, depthWrite: false })); bgd.scale.set(0.3, 0.44, 1); bgd.visible = false; bgd.userData.n = -1; bgd.renderOrder = 12;
        bgd.position.set(Math.cos(sa) * USEAT - Math.sin(sa) * 0.8, 2.12, Math.sin(sa) * USEAT + Math.cos(sa) * 0.8); t.add(bgd); tv.badges.push(bgd);
        var hd = new THREE.Mesh(headArrowGeo, headArrowM); hd.position.set(Math.cos(sa) * USEAT, 2.8, Math.sin(sa) * USEAT); hd.visible = false; hd.renderOrder = 15; t.add(hd); tv.heads.push(hd);
        var cx = UNO_X + Math.cos(sa) * USEAT, cz = tz + Math.sin(sa) * USEAT;
        makeChair(cx, cz, Math.atan2(-Math.cos(sa), -Math.sin(sa)), chairU, chairUD);
        addChair({ tid: tid, ti: ti, local: s, n: ti * 4 + s, x: cx, z: cz, tx: UNO_X, tz: tz });
      }
      pendant(g, UNO_X, tz);
      room.colliders.push({ x: UNO_X, z: tz, r: UR + 0.2 });
    });

    /* --- 3 tables de PUISSANCE 4 : grille bleue brillante aux vrais trous, jetons qui tombent, et on clique directement sur la colonne voulue --- */
    var redM = new THREE.MeshStandardMaterial({ color: 0xd8262b, roughness: 0.22, metalness: 0.1 }), yelM = new THREE.MeshStandardMaterial({ color: 0xf0cb14, roughness: 0.22, metalness: 0.1 }), blueM = new THREE.MeshStandardMaterial({ color: 0x2b4fe0, roughness: 0.2, metalness: 0.3 }), navyM = new THREE.MeshStandardMaterial({ color: 0x14217a, roughness: 0.35, metalness: 0.3 });
    var redG = new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xd01818, roughness: 0.3 }), yelG = new THREE.MeshStandardMaterial({ color: 0xfff27a, emissive: 0xc89a00, roughness: 0.3 });
    var c4Felt = new THREE.MeshStandardMaterial({ color: 0x14583a, roughness: 0.92 }), hx = C4_W / 2;
    var bShape = new THREE.Shape(); bShape.moveTo(-hx, 0); bShape.lineTo(hx, 0); bShape.lineTo(hx, C4_H); bShape.lineTo(-hx, C4_H); bShape.closePath();
    for (var cc = 0; cc < 7; cc++) for (var rw = 0; rw < 6; rw++) { var hole = new THREE.Path(); hole.absarc((cc - 3) * C4_PITCH, C4_Y0 + rw * C4_PITCH, C4_R, 0, TAU, true); bShape.holes.push(hole); }
    var boardGeo = new THREE.ExtrudeGeometry(bShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 20 });
    var discGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.07, 28), footGeo = new THREE.BoxGeometry(0.07, 0.1, 0.28);
    var sk = mkCanvas(8, 84), skx = sk.getContext('2d'); for (i = 0; i < 21; i++) { skx.fillStyle = i % 2 ? '#ffffff' : '#c8c8c8'; skx.fillRect(0, i * 4, 8, 4); }
    function stackMat(col) { var tx = new THREE.CanvasTexture(sk); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return [new THREE.MeshStandardMaterial({ color: col, map: tx, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })]; }
    var stackR = stackMat(0xd8262b), stackY = stackMat(0xf0cb14);
    var TT = 0.8;                                                   // hauteur du dessus de table
    C4_P.forEach(function (pp, ti) {
      var tz = pp[1], C4_X = pp[0];
      var t = new THREE.Group(), tid = 'c' + ti; t.position.set(C4_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(2.5, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      // table ovale : plateau de feutre, rebord de cuir et filet doré, jupe de bois, piètement tourné
      var top = cyl(t, 1, 1, 0.1, [edgeM, c4Felt, edgeM], 0, TT - 0.05, 0, 56); top.scale.set(1.4, 1, 0.9);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 12, 72), leatherM); rim.rotation.x = Math.PI / 2; rim.scale.set(1.4, 0.9, 1); rim.position.y = TT; t.add(rim);
      var inl = new THREE.Mesh(new THREE.TorusGeometry(1, 0.014, 6, 72), gold); inl.rotation.x = Math.PI / 2; inl.scale.set(1.4, 0.9, 1); inl.position.y = TT + 0.07; t.add(inl);
      var apron = cyl(t, 0.96, 0.96, 0.12, edgeM, 0, TT - 0.16, 0, 56); apron.scale.set(1.4, 1, 0.9);
      var aband = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.018, 6, 72), gold); aband.rotation.x = Math.PI / 2; aband.scale.set(1.4, 0.9, 1); aband.position.y = TT - 0.22; t.add(aband);
      lathe(t, [[0.001, 0.0], [0.5, 0.0], [0.52, 0.03], [0.44, 0.07], [0.28, 0.12], [0.18, 0.22], [0.15, 0.4], [0.19, 0.55], [0.26, 0.68], [0.001, 0.72]], woodM, 32);
      [[0.5, 0.03, 0.028], [0.18, 0.22, 0.022]].forEach(function (d) { var r = new THREE.Mesh(new THREE.TorusGeometry(d[0], d[2], 8, 32), gold); r.rotation.x = Math.PI / 2; r.position.y = d[1]; t.add(r); });
      // la grille : plaque bleue brillante épaisse percée de 42 trous, deux pieds, liserés dorés en haut
      var bd = new THREE.Mesh(boardGeo, blueM); bd.position.set(0, TT + 0.1, -0.035); t.add(bd);
      [-1, 1].forEach(function (sd) { var f = new THREE.Mesh(footGeo, navyM); f.position.set(sd * (hx - 0.06), TT + 0.05, 0); t.add(f); var fc = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.015, 0.29), gold); fc.position.set(sd * (hx - 0.06), TT + 0.102, 0); t.add(fc); });
      box(t, C4_W + 0.03, 0.018, 0.1, gold, 0, TT + 0.1 + C4_H + 0.002, 0);
      [[-1, stackR], [1, stackY]].forEach(function (sp) { var sm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 24), sp[1]); sm.position.set(sp[0] * 0.9, TT + 0.11, 0); t.add(sm); });
      var tv = TV[tid] = { kind: 'c', group: t, discs: {}, labels: [mkLabel(), mkLabel()], hits: [], bars: [] };
      tv.labels[0].position.set(0, TT + 0.3, 0.6); tv.labels[1].position.set(0, TT + 0.3, -0.6); t.add(tv.labels[0]); t.add(tv.labels[1]);
      // une barre cliquable par colonne (invisible) + un repère lumineux qui n'apparaît que quand c'est à moi de jouer
      for (var c4 = 0; c4 < 7; c4++) {
        var bx0 = (c4 - 3) * C4_PITCH, by0 = TT + 0.1 + C4_H / 2 + 0.05;
        var hitC = new THREE.Mesh(new THREE.BoxGeometry(C4_PITCH * 0.98, C4_H + 0.3, 0.3), new THREE.MeshBasicMaterial({ visible: false })); hitC.position.set(bx0, by0, 0); hitC.userData.col = c4; t.add(hitC); tv.hits.push(hitC);
        var bg = new THREE.Group(); bg.visible = false; t.add(bg);
        var bar = new THREE.Mesh(new THREE.BoxGeometry(C4_PITCH * 0.92, C4_H + 0.04, 0.14), new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); bar.position.set(bx0, TT + 0.1 + C4_H / 2, 0); 
        var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), new THREE.MeshBasicMaterial({ color: 0xffe35a })); arrow.rotation.x = Math.PI; arrow.position.set(bx0, TT + 0.1 + C4_H + 0.1, 0); arrow.userData.y0 = arrow.position.y; bg.add(arrow);
        tv.bars.push(bg);
      }
      makeChair(C4_X, tz + 1.3, Math.PI, chairC, chairCD); makeChair(C4_X, tz - 1.3, 0, chairC, chairCD);
      addChair({ tid: tid, ti: ti, local: 0, n: 12 + ti * 2, x: C4_X, z: tz + 1.3, tx: C4_X, tz: tz }); addChair({ tid: tid, ti: ti, local: 1, n: 13 + ti * 2, x: C4_X, z: tz - 1.3, tx: C4_X, tz: tz });
      pendant(g, C4_X, tz);
      room.colliders.push({ x: C4_X - 0.9, z: tz, r: 0.75 }, { x: C4_X, z: tz, r: 0.8 }, { x: C4_X + 0.9, z: tz, r: 0.75 });
    });

    /* =====================================================================
       LA PARTIE : l'état de chaque table est partagé entre les joueurs (canal temps réel de la salle).
       Chaque table a un « état » (voir minijeux-regles.js) avec un numéro de version. Celui qui joue modifie l'état, le numéro augmente
       et l'état complet est envoyé à tous ; chacun garde la version la plus récente. Quelqu'un qui arrive demande l'état des tables.
       ===================================================================== */
    var MJ = F.mj, TIDS = Object.keys(TV), G = {}, seat = null, ui = null, showAll = false, autoKey = '', autoAt = 0, view = { yaw: 0, pitch: 0 }, pendingWild = -1, errMsg = '', errT = 0, standEl = null, anims = [], pollT = 0, polling = false, busyN = 0, seatSure = false;
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
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === ch.n && now - (r.recv || 0) < 4000; }) || !!(e && e.k !== me());
    }
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
    /* --- le serveur (api/minijeux.js) tient les tables : il mélange, distribue (chacun ne reçoit que SA main), vérifie chaque coup et fait avancer la partie.
       Le navigateur envoie ses actions (s'asseoir, jouer, piocher…) et redemande l'état de la salle ~2 fois par seconde. --- */
    var ROOM_KEY = isC4 ? 'c4' : 'uno';
    function applyTables(r) {
      if (!r || !r.tables) return;
      Object.keys(r.tables).forEach(function (tid) { if (TIDS.indexOf(tid) >= 0 && okState(tid, r.tables[tid])) adopt(tid, r.tables[tid]); });
    }
    function api(body) {
      busyN++;
      return world.post('/api/minijeux', body).then(function (r) { busyN--; if (!r) return { ok: false, error: 'Connecte-toi pour jouer aux mini jeux.' }; if (r.ok) applyTables(r); return r; }, function () { busyN--; return { ok: false, error: 'Connexion perdue.' }; });
    }
    // une action du joueur assis ; si le serveur la refuse, on affiche pourquoi
    function srv(action, extra) {
      if (!seat) return Promise.resolve(null);
      return api(Object.assign({ action: action, tid: seat.tid, seat: seat.local }, extra || {})).then(function (r) { if (r && !r.ok && seat) { errMsg = r.error || 'Action refusée.'; errT = 3; refreshUi(); } return r; });
    }
    function poll() {
      if (polling || busyN > 0) return; polling = true;
      fetch('/api/minijeux?room=' + ROOM_KEY, { cache: 'no-store', headers: { 'X-Auth-Token': F.token() || '' } }).then(function (r) { return r.json(); }).then(function (d) { polling = false; if (d && d.ok) applyTables(d); }).catch(function () { polling = false; });
    }
    function adopt(tid, st) {
      var cur = G[tid];
      if (cur && st.ver < cur.ver) return;
      if (cur && st.ver === cur.ver) { checkSeat(tid, st); return; }
      G[tid] = st; renderTable(tid); announce(tid, cur, st); fx3d(tid, cur, st);
      if (seat && seat.tid === tid) { checkSeat(tid, st); refreshUi(); }
    }
    // si le serveur ne me connaît plus à ma place (retiré pour inactivité, ou place prise par quelqu'un d'autre), je me lève
    function checkSeat(tid, st) {
      if (!seat || seat.tid !== tid) return;
      var e = st.seats[seat.local];
      if (e && e.k === me()) { seatSure = true; return; }
      if (e) { world.flash('Cette place est prise.'); stand(true); return; }
      if (seatSure) { world.flash('Tu as été retiré de la table (inactif).'); stand(true); }
    }

    /* --- dessin des tables à partir de l'état --- */
    function renderTable(tid) {
      var tv = TV[tid], st = G[tid]; if (!tv || !st) return;
      if (tv.kind === 'u') renderUno(tv, st, tid); else renderC4(tv, st, tid);
    }
    function topRot(tid) { var hh = seat && seat.tid === tid && TV[tid] && TV[tid].hands[seat.local]; return hh ? Math.PI / 2 - hh.sa - 0.2 : -0.2; }
    function renderUno(tv, st, tid) {
      var di = tv.pendingTop ? st.disc.length - 2 : st.disc.length - 1, top = st.disc[di];
      tv.top.visible = tv.ring.visible = !!top;
      var prev = st.disc[di - 1]; tv.top2.visible = !!prev; if (prev) tv.top2.material = faceMat(prev);
      var rz0 = topRot(tid); tv.top.rotation.z = rz0; tv.top2.rotation.z = rz0 + 0.7;
      if (top) { tv.top.material = faceMat(top, st.col); tv.ring.material.color.set(st.col >= 0 && st.col < 4 ? COLORS[st.col] : '#888888'); }
      for (var s = 0; s < 4; s++) {
        var e = st.seats[s], hand = st.hands[s], n = hand ? hand.length : 0, h = tv.hands[s], vis = (seat && seat.tid === tid && seat.local === s) ? 0 : Math.min(n, 9), sa = h.sa, lb = tv.labels[s];
        for (var k = 0; k < 9; k++) {
          var cm = h.cards[k]; cm.visible = k < vis; if (k >= vis) continue;
          var off = k - (vis - 1) / 2;
          cm.rotation.z = -sa - Math.PI / 2 + off * 0.2;
          cm.position.set(Math.cos(sa) * UHR + Math.cos(sa + Math.PI / 2) * off * 0.1, 0.872 + k * 0.003, Math.sin(sa) * UHR + Math.sin(sa + Math.PI / 2) * off * 0.1);
        }
        lb.visible = false;                                                          // plus de nom ni de nombre de cartes sur la table : ils sont au-dessus du joueur
        var bgd = tv.badges[s], showB = !!e && !!hand && st.ph === 'play' && !(seat && seat.tid === tid && seat.local === s); bgd.visible = showB;
        if (showB && bgd.userData.n !== n) { bgd.userData.n = n; if (bgd.material.map) bgd.material.map.dispose(); bgd.material.map = badgeTex(n); bgd.material.needsUpdate = true; }
        if (e) { var act = st.ph === 'play' && st.turn === s; var key = e.name + '|' + n + '|' + act + '|' + (st.win === s); if (lb.userData.key !== key) { lb.userData.key = key; setLabel(lb, (st.win === s ? '🏆 ' : act ? '▶ ' : '') + e.name, hand ? n + ' carte' + (n > 1 ? 's' : '') : (st.ph === 'play' ? 'spectateur' : 'prêt'), act || st.win === s); } }
      }
    }
    function renderC4(tv, st, tid) {
      var c, r, key, want = {};
      for (c = 0; c < 7; c++) for (r = 0; r < st.g[c].length; r++) {
        var p = st.g[c][r], inLine = !!(st.line && st.line.some(function (q) { return q[0] === c && q[1] === r; }));
        key = c + ',' + r; want[key] = true;
        var d = tv.discs[key], y1 = TT + 0.1 + C4_Y0 + r * C4_PITCH;
        if (d && d.p !== p) { tv.group.remove(d.m); delete tv.discs[key]; d = null; }
        if (!d) {
          var m = new THREE.Mesh(discGeo, p === 1 ? redM : yelM); m.rotation.x = Math.PI / 2; m.position.set((c - 3) * C4_PITCH, y1 + 0.6, 0); tv.group.add(m);
          d = tv.discs[key] = { m: m, p: p }; anims.push({ m: m, y0: y1 + 0.6, y1: y1, t: 0 });
        }
        d.m.material = inLine ? (p === 1 ? redG : yelG) : (p === 1 ? redM : yelM);
      }
      Object.keys(tv.discs).forEach(function (k) { if (!want[k]) { tv.group.remove(tv.discs[k].m); delete tv.discs[k]; } });
      var myTurn = !!seat && seat.tid === tid && st.ph === 'play' && st.turn === seat.local;
      tv.bars.forEach(function (b, c3) { b.visible = myTurn && st.g[c3].length < 6 && !world.touch; });       // téléphone : plus de flèches
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
        '.mj3d .mj-hand{display:flex;justify-content:center;padding:12px 0 2px}.mj3d .mj-hand button{flex:none;position:relative;border:2px solid transparent;border-radius:8px;padding:0;background:none;cursor:pointer;opacity:.55;transition:transform .12s,opacity .12s;box-shadow:-3px 0 7px rgba(0,0,0,.55)}.mj3d .mj-hand button:hover{transform:translateY(-14px);z-index:30!important;opacity:1}.mj3d .mj-hand button.ok{opacity:1;border-color:#ffe35a;transform:translateY(-8px)}.mj3d .mj-hand button.ok:hover{transform:translateY(-18px)}.mj3d .mj-hand img{display:block;width:64px;height:auto;border-radius:6px}' +
        '.mj3d .mj-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.mj3d .mj-b{padding:8px 16px;border-radius:12px;border:0;font-weight:900;font-size:14px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00)}.mj3d .mj-b:disabled{opacity:.4;cursor:not-allowed}.mj3d .mj-b.alt{background:#2a3b57;color:#e8f0ff}.mj3d .mj-b.uno{background:linear-gradient(90deg,#ff5a5a,#d6221e);color:#fff}.mj3d .mj-b.red{background:linear-gradient(90deg,#7c3aed,#c026d3);color:#fff;animation:mjGlow .5s ease-in-out infinite alternate}.mj3d kbd{opacity:.75;font-size:11px;margin-left:4px}' +
        '.mj3d .mj-col{width:54px;padding:8px 0;border-radius:10px;border:2px solid #6a7bff;background:#1c2556;color:#fff;font-weight:900;font-size:15px;cursor:pointer}.mj3d .mj-col:disabled{opacity:.35;cursor:not-allowed}' +
        '.mj3d .mj-clr{width:64px;height:40px;border-radius:10px;border:3px solid #fff;cursor:pointer}' +
        '.mj3d.myturn{border-color:#ffe35a;animation:mjGlow 1s ease-in-out infinite alternate}@keyframes mjGlow{from{box-shadow:0 0 0 rgba(255,227,90,0)}to{box-shadow:0 0 26px rgba(255,227,90,.85)}}' +
        '.mj-toast{position:absolute;left:50%;top:16%;transform:translateX(-50%) scale(.6);opacity:0;padding:16px 34px;border-radius:20px;text-align:center;pointer-events:none;z-index:9;font-weight:900;font-size:30px;color:#fff;border:3px solid #fff;transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1);max-width:90%}.mj-toast small{display:block;margin-top:4px;font-size:14px;font-weight:700;opacity:.92}.mj-toast.in{opacity:1;transform:translateX(-50%) scale(1)}' +
        '.mj-toast.turn{background:linear-gradient(90deg,#16a34a,#0f7a37);border-color:#ffe35a;box-shadow:0 0 22px rgba(255,227,90,.6);top:7%;padding:7px 20px;font-size:19px;border-width:2px;border-radius:14px}.mj-toast.hit{background:linear-gradient(90deg,#dc2626,#9b1111);border-color:#ffb3b3;box-shadow:0 0 36px rgba(255,60,60,.7);animation:mjShake .5s}.mj-toast.skip{background:linear-gradient(90deg,#f59e0b,#c2410c)}.mj-toast.win{background:linear-gradient(90deg,#f5c542,#d98a00);color:#2a1800}.mj-toast.info{background:linear-gradient(90deg,#2563eb,#1e3a8a)}@keyframes mjShake{20%{margin-left:-14px}40%{margin-left:12px}60%{margin-left:-8px}80%{margin-left:5px}}' +
        '.mj3d-stand{position:absolute;left:14px;bottom:70px;z-index:5;pointer-events:auto}.mj3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(201,162,39,.6);background:rgba(8,5,12,.85);color:#f4e3b0;font-weight:800;cursor:pointer}';
      s.textContent += '.mj3d.uno{background:transparent;border:0;box-shadow:none;width:min(1000px,98%);bottom:52px;animation:none}.mj3d.uno .mj-msg,.mj3d.uno .mj-pl{align-self:center;background:rgba(8,5,12,.62);border-radius:999px;padding:3px 16px;text-shadow:0 1px 3px #000}.mj3d.uno .mj-hand{padding-top:26px}.mj3d.uno .mj-hand img{width:min(86px,13vh);box-shadow:0 8px 18px rgba(0,0,0,.55)}.mj3d.uno .mj-hand button.ok{transform:translateY(-16px)}.mj3d.uno .mj-hand button:hover{transform:translateY(-24px)}';
      s.textContent += '.mj-badge{position:absolute;left:50%;top:min(52px,6vh);transform:translateX(-50%) scale(.9);z-index:4;pointer-events:none;padding:min(4px,.9vh) min(14px,2.8vh);border-radius:999px;background:linear-gradient(180deg,rgba(255,214,77,.96),rgba(214,150,20,.96));border:2px solid #fff3b0;color:#2a1a00;font-weight:900;font-size:min(13px,2.6vh);letter-spacing:.04em;text-transform:uppercase;box-shadow:0 0 0 rgba(255,214,77,0);opacity:0;transition:opacity .3s,transform .3s}.mj-badge.on{opacity:1;transform:translateX(-50%) scale(1);animation:mjTurn 1.1s ease-in-out infinite alternate}@keyframes mjTurn{from{box-shadow:0 0 12px rgba(255,214,77,.5)}to{box-shadow:0 0 40px rgba(255,214,77,1),0 0 90px rgba(255,180,40,.55)}}.mj3d .mj-pl:empty{display:none}.mj3d .mj-hint{font-size:13px}.mj3d .mj-msg:empty{display:none}.mj3d.uno .mj-pl{display:none!important}' +
        '.mj3d .mj-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-height:58vh;overflow-y:auto;padding:12px;background:rgba(8,5,12,.93);border:1px solid rgba(201,162,39,.6);border-radius:14px}.mj3d .mj-grid button{border:2px solid transparent;border-radius:8px;padding:0;background:none;cursor:pointer;opacity:.5}.mj3d .mj-grid button.ok{opacity:1;border-color:#ffe35a}.mj3d .mj-grid img{display:block;width:78px;height:auto;border-radius:6px}@media (max-height:520px){.mj3d .mj-grid{max-height:62vh;gap:5px;padding:8px}.mj3d .mj-grid img{width:50px}}';
      s.textContent += '.mj-fxpop{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);z-index:9;pointer-events:none;font-weight:900;font-size:clamp(54px,10vw,120px);color:#fff;text-shadow:0 5px 0 #000,0 0 34px currentColor;animation:mjFx 1.5s ease-out forwards}@keyframes mjFx{0%{opacity:0;transform:translate(-50%,-50%) scale(.2) rotate(-12deg)}18%{opacity:1;transform:translate(-50%,-50%) scale(1.25) rotate(4deg)}35%{transform:translate(-50%,-50%) scale(1) rotate(0)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-80%) scale(1.1)}}';
      s.textContent += '@media (max-height:520px){.mj3d{bottom:62px;width:min(560px,66%);padding:5px 8px;gap:3px}.mj3d .mj-msg{font-size:12px;min-height:14px}.mj3d .mj-hint{font-size:11px}.mj3d .mj-hand img{width:36px}.mj3d .mj-b{padding:5px 10px;font-size:12px}.mj3d .mj-col{padding:5px 0}.mj3d-stand{bottom:auto;top:64px}.mj-toast{font-size:20px;padding:8px 18px}' +
        '.mj3d.uno{bottom:34px;width:min(760px,78%);gap:2px}.mj3d.uno .mj-hand{padding-top:12px}.mj3d.uno .mj-hand img{width:min(44px,13vh);box-shadow:0 4px 10px rgba(0,0,0,.55)}.mj3d.uno .mj-hand button.ok{transform:translateY(-8px)}.mj3d.uno .mj-hand button:hover{transform:translateY(-12px)}.mj3d.uno .mj-grid img{width:44px}.mj3d.uno .mj-clr{width:54px;height:34px}}';
      document.head.appendChild(s);
    }
    var AC = null;
    function ding(seq) {                                            // petits sons (sans fichier) pour attirer l'attention
      try {
        var A = F.audio, vol = A && typeof A.sfxVol === 'number' ? A.sfxVol : 0.7; AC = AC || new (window.AudioContext || window.webkitAudioContext)(); var t0 = AC.currentTime;
        seq.forEach(function (f, k) { var o = AC.createOscillator(), gn = AC.createGain(); o.type = 'sine'; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t0 + k * 0.14); gn.gain.exponentialRampToValueAtTime(0.05 * vol + 0.0001, t0 + k * 0.14 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.14 + 0.26); o.connect(gn); gn.connect(AC.destination); o.start(t0 + k * 0.14); o.stop(t0 + k * 0.14 + 0.3); });
      } catch (e) { /* pas de son */ }
    }
    var toastEl = null, toastT = 0, badgeEl = null;
    function toast(title, kind, sub) {
      if (!ui) return;
      if (!toastEl) { toastEl = document.createElement('div'); ui.el.parentNode.appendChild(toastEl); }
      toastEl.className = 'mj-toast ' + kind; toastEl.innerHTML = '<div>' + esc(title) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : ''); void toastEl.offsetWidth; toastEl.classList.add('in'); toastT = kind === 'hit' || kind === 'skip' ? 4.2 : kind === 'turn' ? 1.3 : 3.2;
      ding(kind === 'turn' ? [660, 880] : kind === 'hit' ? [330, 220] : kind === 'skip' ? [440, 330] : kind === 'win' ? [660, 880, 1100] : [520]);
    }
    function announce(tid, old, st) {
      if (!seat || seat.tid !== tid || !st || st.ph === 'wait') return;
      old = old || {}; var loc = seat.local, msg = st.msg || '', nm0 = myName(), mine = st.turn === loc;
      if (st.ph === 'over') { if (old.ph !== 'over') { if (st.win === loc) toast('🏆 Tu as gagné !', 'win'); else if (kindOf(tid) === 'c' && st.win === 2) toast('🤝 Match nul', 'info'); else toast('😵 Perdu…', 'hit', msg); } return; }
      if (st.ph !== 'play') return;
      if (kindOf(tid) === 'u') {
        var oh = old.hands && old.hands[loc], nh = st.hands && st.hands[loc];
        if (st.org !== me() && mine && st.pend > 0 && old.pend !== st.pend) { var canSt = (st.hands[loc] || []).some(function (c) { return MJ.unoCanPlay(st, c); }); toast('⚠️ +' + st.pend + ' !', 'hit', canSt ? 'Réponds avec un ' + (st.pk === 'F' ? '+4' : '+2') + ' ou touche le paquet pour piocher ' + st.pend + ' cartes' : 'Tu pioches ' + st.pend + ' cartes'); return; }
        if (st.org !== me() && old.vuln === loc && st.vuln === -1 && oh && nh && nh.length >= oh.length + 2) { toast('😱 Contre UNO !', 'hit', 'Tu avais oublié de dire UNO : +2 cartes'); return; }
        if (st.org !== me() && st.hands && st.hands[loc] && st.vuln >= 0 && st.vuln !== loc && old.vuln !== st.vuln) { toast('⚠️ ' + ((st.seats[st.vuln] || {}).name || 'Un joueur') + " n'a pas dit UNO !", 'skip', 'Vite : appuie sur CONTRE UNO (C)'); return; }
        if (st.org !== me() && /crie UNO|: UNO !/.test(msg) && old.msg !== msg && !mine) toast('📣 UNO !', 'info', msg);
        if (st.org !== me() && oh && nh && nh.length >= oh.length + 2 && /pioche (2|4) cartes/.test(msg) && msg.indexOf(nm0 + ' pioche') >= 0) { toast('💥 +' + (nh.length - oh.length) + ' ! Tu pioches ' + (nh.length - oh.length) + ' cartes', 'hit', 'Ton tour est passé'); return; }
        if (st.org !== me() && msg.indexOf(nm0 + ' passe son tour') >= 0) { toast('⛔ Ton tour est passé !', 'skip', msg); return; }
        if (st.org !== me() && /Le sens change|Sens inversé/.test(msg) && !mine) toast('🔄 Le sens du jeu change', 'info');
      }
      if (mine && (old.ph !== 'play' || old.turn !== loc)) ding([660, 880]);          // le grand bandeau jaune suffit : plus de petit bandeau vert
    }
    /* --- animations des cartes spéciales : +2, +4, UNO (visibles de toute la salle, dessinées sur la table) --- */
    var fxs = [];
    function fxAdd(o) { o.t = 0; fxs.push(o); }
    function fxText(tv, text, col, x, z) {
      var cv = mkCanvas(512, 256), c = cv.getContext('2d'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 170px ' + SERIF; c.lineJoin = 'round'; c.lineWidth = 26; c.strokeStyle = '#000'; c.strokeText(text, 256, 130, 480); c.fillStyle = col; c.fillText(text, 256, 130, 480);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(cv), transparent: true, depthTest: false })); sp.position.set(x, 1.3, z); sp.scale.set(0.01, 0.005, 1); sp.renderOrder = 20; tv.group.add(sp);
      fxAdd({ dur: 1.9, upd: function (u) { var k = u < 0.2 ? 1.25 * Math.sin(u / 0.2 * Math.PI / 2) : 1.25 - Math.min(0.25, (u - 0.2) * 0.4); sp.scale.set(1.05 * k, 0.525 * k, 1); sp.position.y = 1.25 + u * 0.4; sp.material.opacity = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1; }, end: function () { tv.group.remove(sp); sp.material.map.dispose(); sp.material.dispose(); } });
    }
    function fxRing(tv, col, x, z) {
      var m = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.9, z); tv.group.add(m);
      fxAdd({ dur: 1.0, upd: function (u) { m.scale.setScalar(1 + u * 7); m.material.opacity = 0.9 * (1 - u); }, end: function () { tv.group.remove(m); m.geometry.dispose(); m.material.dispose(); } });
    }
    function fxFlyers(tv, seatLocal, n) {                          // des cartes volent de la pioche vers la main de celui qui pioche
      var h = tv.hands[seatLocal]; if (!h) return;
      for (var q = 0; q < Math.min(n, 8); q++) (function (q) {
        var m = new THREE.Mesh(cardGeo, backM); m.rotation.x = -Math.PI / 2; m.visible = false; tv.group.add(m);
        var tx = Math.cos(h.sa) * UHR, tz = Math.sin(h.sa) * UHR;
        fxAdd({ dur: 0.85 + q * 0.16, upd: function (u, t) { var d = q * 0.16; if (t < d) { m.visible = false; return; } var v = Math.min(1, (t - d) / 0.85); m.visible = true; var e = v * v * (3 - 2 * v); m.position.set(DECK_X + (tx - DECK_X) * e, 0.95 + Math.sin(v * Math.PI) * 0.6, (tz) * e); m.rotation.z = v * 9; }, end: function () { tv.group.remove(m); } });
      })(q);
    }
    var lastFxVer = {}, lastVoice = { f: '', t: 0 }, vq = [], vNow = null, COLOR_VOICE = ['rouge', 'jaune', 'vert', 'bleu'];
    function masterVol() { try { return typeof getMasterVolume === 'function' ? getMasterVolume() : 0.5; } catch (e) { return 0.5; } }
    function vPump() {
      if (vNow || !vq.length) return;
      var o = vq.shift(); if (performance.now() - o.t > 9000) { vPump(); return; }
      var vol = Math.min(1, masterVol() * 0.2);      // voix du jeu : très basses if (vol <= 0) { vPump(); return; }
      try {
        var a = new Audio('assets/sons/' + (o.f.indexOf('/') >= 0 ? o.f : 'uno/' + o.f) + '.mp3'); a.volume = vol; vNow = a;
        var done = function () { if (vNow === a) { vNow = null; vPump(); } };
        a.onended = done; a.onerror = done; setTimeout(done, 8000);
        var pr = a.play(); if (pr && pr.catch) pr.catch(done);
      } catch (e) { vNow = null; }
    }
    function hash(n) { n = (n * 2654435761) >>> 0; n ^= n >>> 15; n = (n * 2246822519) >>> 0; n ^= n >>> 13; return n >>> 0; }
    function seatFxPos(tv, s) { var hh = tv.hands[s]; return [Math.cos(hh.sa) * (UHR + 0.3), Math.sin(hh.sa) * (UHR + 0.3)]; }
    function fxCardFly(tid, tv, who, card) {                      // la carte quitte la main de celui qui joue, vole en arc et se pose sur la défausse
      var hh = tv.hands[who]; if (!hh) return;
      var m = new THREE.Mesh(bigCardGeo, faceMat(card)); m.rotation.x = -Math.PI / 2; m.visible = false; tv.group.add(m);
      var x0 = Math.cos(hh.sa) * (UHR + 0.5), z0 = Math.sin(hh.sa) * (UHR + 0.5), r0 = -hh.sa - Math.PI / 2;
      tv.pendingTop = true; renderTable(tid);
      fxAdd({ dur: 0.55, upd: function (u) { m.visible = true; var e = u * u * (3 - 2 * u); m.position.set(x0 + (DISC_X - x0) * e, 0.95 + Math.sin(u * Math.PI) * 0.5, z0 + (0 - z0) * e); m.rotation.z = r0 + (topRot(tid) - r0) * e + (1 - e) * 2.2; var k = 1.25 - 0.25 * e; m.scale.set(k, k, 1); },
        end: function () { tv.group.remove(m); tv.pendingTop = false; renderTable(tid); fxRing(tv, 0xffffff, DISC_X, 0); } });
    }
    function fx3d(tid, old, st) {
      try {
        if (kindOf(tid) === 'c') {                                    // Puissance 4 : la voix « perdu » n'est entendue que par celui qui perd (pas en cas de match nul)
          if (old && old.ph === 'play' && st.ph === 'over' && (lastFxVer[tid] || 0) < st.ver && seat && seat.tid === tid && st.win >= 0 && st.win < 2 && st.win !== seat.local) { lastFxVer[tid] = st.ver; vq.push({ f: 'puissance4/perdu', t: performance.now() }); vPump(); }
          return;
        }
        var tv = TV[tid]; if (!tv || tv.kind !== 'u' || !old || !old.hands || !st || (st.ph !== 'play' && st.ph !== 'over') || old.ph !== 'play' || old.ver >= st.ver) return;
        if ((lastFxVer[tid] || 0) >= st.ver) return; lastFxVer[tid] = st.ver;                 // chaque changement d'état n'est traité qu'une fois : jamais deux sons d'affilée
        var seatNow = seat && seat.tid === tid, said = {};
        // voix du jeu : entendues seulement par ceux qui sont assis à cette table (pas par les gens autour) ; celle du gagnant n'est entendue que par lui
        function voice(file) { var now = performance.now(); if (!seatNow || (lastVoice.f === file && now - lastVoice.t < 6000) || vq.some(function (q) { return q.f === file; })) return; lastVoice = { f: file, t: now }; vq.push({ f: file, t: now }); vPump(); }
        var chance = function (k, pct) { return hash(st.ver * 31 + k) % 100 < pct; };                // tirage identique pour tous les joueurs de la table
        // voix des +2 / +4 / +6 / +8 : parfois aucune, et deux enregistrements pour chaque +2, +4, +6, +8 (le nouveau plus souvent). Le tirage vient du numéro de l'état : tous les joueurs de la table entendent la même chose.
        function plusVoice(n) { var r = hash(st.ver) % 100; if (r < 25) return; voice('plus' + n + (hash(st.ver + 7) % 3 !== 0 ? 'b' : '')); }
        if (st.ph === 'over') { if (st.win === (seat && seat.local) && seatNow) voice(chance(5, 50) ? 'victoire' : 'gagner'); return; }
        if (old.dir !== undefined && st.dir !== old.dir) voice('sens');                  // le sens du jeu change : la voix le dit (les flèches de la table se retournent)
        if (st.disc.length > old.disc.length) {
          var top = st.disc[st.disc.length - 1], v = top.slice(1);
          var ordr = MJ.unoOrder(old), who = old.turn, vict = ordr.length ? ordr[(ordr.indexOf(who) + (old.dir < 0 ? -1 : 1) + ordr.length) % ordr.length] : -1;
          if (who >= 0 && old.hands[who]) fxCardFly(tid, tv, who, top);
          if (vict >= 0 && tv.hands[vict]) { var vp = seatFxPos(tv, vict); if (v === 'S') fxText(tv, '⛔', '#ffd24a', vp[0], vp[1]); else if (v === 'D' || v === 'F') fxText(tv, v === 'D' ? '+2' : '+4', v === 'D' ? '#ff6a4a' : '#d946ef', vp[0], vp[1]); }
          if (v === 'D' || v === 'F') {
            var col = v === 'D' ? '#ff6a4a' : '#d946ef';
            fxText(tv, v === 'D' ? '+2' : '+4', col, DISC_X, 0); fxRing(tv, v === 'D' ? 0xff6a4a : 0xd946ef, DISC_X, 0);
            var pn = Math.max(2, Math.min(8, Math.round((st.pend > 0 ? st.pend : (v === 'D' ? 2 : 4)) / 2) * 2)); plusVoice(pn);
            if (old.pend > 0 && st.pend > old.pend && (v === 'D' || v === 'F')) voice('quipioche');       // un +2 sur un +2, un +4 sur un +4 : qui va devoir piocher ?
            if (seatNow) { ding([330, 220, 165]); if (st.turn !== seat.local && st.org !== me()) toast('💥 ' + ((st.seats[old.turn] || {}).name || 'Un joueur') + ' joue un ' + (v === 'D' ? '+2' : '+4') + ' !', 'info'); }
          } else if (v === 'S' || v === 'R') fxText(tv, v === 'S' ? '⛔' : '🔄', '#ffd24a', DISC_X, 0);
          if ((v === 'W' || v === 'F') && st.col >= 0 && st.col < 4) fxRing(tv, new THREE.Color(COLORS[st.col]).getHex(), DISC_X, 0);
          if (v === 'W' || v === 'F') {                                                  // changement de couleur : la même qu'avant -> Cléa ; sinon, parfois, « changement de couleur » puis la couleur choisie
            if (st.col === old.col) voice('clea'); else if (chance(2, 65)) { voice('changement'); voice(COLOR_VOICE[st.col]); }
          }
        }
        for (var s = 0; s < 4; s++) {
          var oh = old.hands[s], nh = st.hands[s]; if (!oh || !nh) continue;
          if (nh.length >= oh.length + 1) fxFlyers(tv, s, nh.length - oh.length);
          if (old.pend > 0 && st.pend === 0 && nh.length >= oh.length + 2 && seat && seat.local === s) voice('tupioche');      // celui qui paie la pénalité : « tu pioches »
          if (st.said && st.said[s] && !(old.said && old.said[s])) voice('uno');
          if (st.said && st.said[s] && !(old.said && old.said[s])) {                  // seulement quand le joueur dit UNO (plus une deuxième fois en posant l'avant-dernière carte)
            if (said[s]) continue; said[s] = 1; var hh = tv.hands[s];
            fxText(tv, 'UNO !', '#ffe35a', Math.cos(hh.sa) * (UHR + 0.1), Math.sin(hh.sa) * (UHR + 0.1)); fxRing(tv, 0xffe35a, Math.cos(hh.sa) * UHR, Math.sin(hh.sa) * UHR);
            if (seatNow) ding([660, 880, 1100]);
          }
        }
      } catch (e) { /* animation seulement */ }
    }
    function setHtml(el, h) { if (el && el.__h !== h) { el.__h = h; el.innerHTML = h; } }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function buildUi(w) {
      injectCss();
      var el = document.createElement('div'); el.className = 'mj3d'; el.innerHTML = '<div class="mj-msg"></div><div class="mj-pl"></div><div class="mj-body"></div>';
      w.container.appendChild(el);
      badgeEl = document.createElement('div'); badgeEl.className = 'mj-badge'; badgeEl.textContent = '★ À toi de jouer ★'; w.container.appendChild(badgeEl);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled || !seat) return;
        var a = b.dataset.a, tid = seat.tid, loc = seat.local, err = '';
        if (a === 'start') srv('start');
        else if (a === 'all') { showAll = !showAll; refreshUi(); }
        else if (a === 'pass') srv('pass');
        else if (a === 'uno') srv('uno');
        else if (a === 'counter') srv('counter');
        else if (a === 'card') playCard(+b.dataset.i);
        else if (a === 'color') { var i = pendingWild; pendingWild = -1; showAll = false; srv('play', { idx: i, color: +b.dataset.c }); }
        else if (a === 'nocolor') { pendingWild = -1; refreshUi(); }
        else if (a === 'col') err = dropCol(+b.dataset.c);
        if (err) { errMsg = err; errT = 3; refreshUi(); }
      });
      return { el: el };
    }
    function playCard(i) {
      var st = getSt(seat.tid), hand = st.hands[seat.local]; if (!hand || !hand[i]) return;
      if (st.turn !== seat.local || st.ph !== 'play') { errMsg = 'Ce n\'est pas ton tour.'; errT = 3; refreshUi(); return; }
      if (!MJ.unoCanPlay(st, hand[i])) { errMsg = st.pend > 0 ? 'Il y a un +' + st.pend + ' en attente : réponds avec un ' + (st.pk === 'F' ? '+4' : '+2') + ' ou pioche.' : 'Cette carte ne va pas.'; errT = 3; refreshUi(); return; }
      if (MJ.cardColor(hand[i]) === 4) { if (st.drawn && hand[i] !== st.drawn) { errMsg = 'Tu peux seulement poser la carte piochée, ou passer.'; errT = 3; } else pendingWild = i; refreshUi(); return; }
      srv('play', { idx: i, color: -1 }); if (showAll) { showAll = false; refreshUi(); }
    }
    // piocher : on clique sur le paquet au centre de la table, quand on veut pendant son tour (la flèche s'affiche quand on ne peut rien poser, ou pour payer un +2 / +4)
    function mustDraw(st) {
      if (!seat || !st || st.ph !== 'play' || st.turn !== seat.local || st.wait >= 0 || st.drawn) return false;
      var hd = st.hands[seat.local]; if (!hd) return false;
      return st.pend > 0 || !hd.some(function (c) { return MJ.unoCanPlay(st, c); });
    }
    function drawFromDeck() {
      if (!seat || kindOf(seat.tid) !== 'u') return;
      var st = getSt(seat.tid), loc = seat.local, err = '';
      if (st.ph !== 'play' || !st.hands[loc]) return;
      if (st.turn !== loc || st.wait >= 0) err = 'Ce n\'est pas ton tour.';
      else if (st.drawn) err = 'Pose la carte piochée ou passe.';
      else srv('draw');
      if (err) { errMsg = err; errT = 3; refreshUi(); }
    }
    function dropCol(c) {
      var st = getSt(seat.tid);
      if (st.ph !== 'play') return 'La partie n\'a pas commencé.';
      if (st.turn !== seat.local) return 'Ce n\'est pas ton tour.';
      if (!(c >= 0 && c <= 6) || st.g[c].length >= 6) return 'Colonne pleine.';
      srv('drop', { col: c }); return '';
    }
    function refreshUi() {
      if (!ui || !seat) return;
      var st = getSt(seat.tid), u = kindOf(seat.tid) === 'u', mine = st.ph === 'play' && st.turn === seat.local && !(st.wait >= 0);
      var msg = errT > 0 ? errMsg : ((st.ph !== 'wait' && st.msg) || (Object.keys(st.seats).length < 2 ? 'En attente d\'un autre joueur…' : 'Tout le monde est là : lance la partie !'));
      ui.el.classList.toggle('myturn', mine);
      if (badgeEl) badgeEl.classList.toggle('on', mine);
      if (st.ph === 'play' && errT <= 0) msg = '';                     // pendant la partie, plus de phrase au-dessus des joueurs (le gros bandeau dit quand c'est à toi)
      var m = ui.el.querySelector('.mj-msg'); if (m.textContent !== msg) m.textContent = msg; m.style.color = errT > 0 ? '#ff8a80' : (st.ph === 'over' && st.win === seat.local ? '#7ee0a0' : '');
      var pl = Object.keys(st.seats).map(Number).sort().map(function (n) {
        var e = st.seats[n], cnt = u && st.hands[n] ? ' · ' + st.hands[n].length + ' 🂠' : '', dot = u ? '' : (n === 0 ? '🔴 ' : '🟡 ');
        return (st.ph === 'play' && st.turn === n ? '<b>▶ ' : '<span>') + dot + esc(e.name) + cnt + (st.ph === 'play' && st.turn === n ? '</b>' : '</span>');
      }).join('') + (u && st.ph === 'play' ? '<span>Couleur : <b style="color:' + COLORS[st.col] + '">' + MJ.COLOR_NAMES[st.col] + '</b></span>' : '');
      setHtml(ui.el.querySelector('.mj-pl'), u || st.ph !== 'play' ? pl : '');       // Puissance 4 en partie : plus de noms ni de « Au tour de… »
      var body = '', startTxt = st.ph === 'over' ? '🔁 Rejouer' : '▶ Lancer la partie', canStart = u ? Object.keys(st.seats).length >= 2 : !!(st.seats[0] && st.seats[1]);
      if (u) {
        var hand = st.hands[seat.local] || [];
        if (pendingWild >= 0) body = '<div class="mj-row">' + COLORS.map(function (c, k) { return '<button class="mj-clr" data-a="color" data-c="' + k + '" style="background:' + c + '"></button>'; }).join('') + '<button class="mj-b alt" data-a="nocolor">Annuler</button></div>';
        else {
          if (hand.length && showAll) body += '<div class="mj-grid">' + hand.map(function (c, i) { return '<button data-a="card" data-i="' + i + '" class="' + (mine && MJ.unoCanPlay(st, c) && (!st.drawn || st.drawn === c) ? 'ok' : '') + '"><img src="' + faceImg(c) + '" alt=""></button>'; }).join('') + '</div>';   // toutes mes cartes, en grand, sans chevauchement
          else if (hand.length) {                                  // toute la main tient sur la largeur : plus il y a de cartes, plus elles se chevauchent
            var bw = Math.min(86, Math.round(window.innerHeight * 0.13)) + 4, availW = Math.max(240, ui.el.clientWidth - 30), step = hand.length > 1 ? Math.min(bw + 6, (availW - bw) / (hand.length - 1)) : 0;
            body += '<div class="mj-hand">' + hand.map(function (c, i) { return '<button data-a="card" data-i="' + i + '" style="' + (i ? 'margin-left:' + Math.round(step - bw) + 'px;' : '') + 'z-index:' + i + '" class="' + (mine && MJ.unoCanPlay(st, c) && (!st.drawn || st.drawn === c) ? 'ok' : '') + '"><img src="' + faceImg(c) + '" alt=""></button>'; }).join('') + '</div>';
          }
          body += '<div class="mj-row">';
          if (st.ph === 'play' && hand.length) body += '<button class="mj-b alt" data-a="all">' + (showAll ? '✖ Fermer' : '🃏 Mes cartes (' + hand.length + ')') + '</button>' + (st.drawn && mine ? '<button class="mj-b alt" data-a="pass">Passer</button>' : '')
            + ((st.vuln === seat.local || (mine && hand.length === 2 && !(st.said && st.said[seat.local]) && hand.some(function (c) { return MJ.unoCanPlay(st, c); }))) ? '<button class="mj-b uno" data-a="uno">📣 UNO ! <kbd>U</kbd></button>' : '')
            + (st.vuln >= 0 && st.vuln !== seat.local ? '<button class="mj-b red" data-a="counter">⚡ CONTRE UNO ! <kbd>C</kbd></button>' : '');
          else if (st.ph === 'play') body += '<div style="font-weight:800;font-size:13px;color:#c9b88a;text-align:center">👀 Une partie est en cours : tu joueras à la prochaine manche, quand elle sera finie.</div>';
          else body += '<button class="mj-b" data-a="start"' + (canStart ? '' : ' disabled') + '>' + startTxt + '</button>';
          body += '</div>';
        }
      } else {
        var mir = seat.local === 1, cols = [0, 1, 2, 3, 4, 5, 6].map(function (v) { return mir ? 6 - v : v; });      // le joueur du côté opposé voit la grille à l'envers
        if (st.ph === 'play') body = '<div class="mj-row mj-hint" style="font-weight:800;color:' + (mine ? '#ffe35a' : '#c9b88a') + '">' + (mine ? 'Clique sur la colonne de la grille où tu veux poser ton jeton' : 'Ton adversaire réfléchit…') + '</div>';
        else body = '<div class="mj-row"><button class="mj-b" data-a="start"' + (canStart ? '' : ' disabled') + '>' + startTxt + '</button></div>';
      }
      setHtml(ui.el.querySelector('.mj-body'), body);
    }

    /* --- s'asseoir / se lever --- */
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if (kindOf(seat.tid) === 'u' && (e.code === 'KeyU' || e.code === 'KeyC')) {
        e.stopImmediatePropagation(); e.preventDefault();
        srv(e.code === 'KeyU' ? 'uno' : 'counter');
      }
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
      ui = buildUi(w); ui.el.classList.toggle('uno', kindOf(ch.tid) === 'u');
      standEl = document.createElement('div'); standEl.className = 'mj3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.firstChild.addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl);
      window.addEventListener('keydown', onSeatKey, true);
      seatSure = false; refreshUi();
      api({ action: 'join', tid: ch.tid, seat: ch.local }).then(function (r) { if (r && !r.ok && seat === ch) { world.flash(r.error || 'Impossible de s\'asseoir.'); stand(true); } else if (seat === ch) { seatSure = true; refreshUi(); } });
    }
    function stand(silent) {
      if (!seat) return;
      var s = seat; seat = null; pendingWild = -1; showAll = false; if (TV[s.tid] && TV[s.tid].deckArrow) TV[s.tid].deckArrow.visible = false; if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl); toastEl = null; if (badgeEl && badgeEl.parentNode) badgeEl.parentNode.removeChild(badgeEl); badgeEl = null; renderTable(s.tid);
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      if (!silent) { try { world.post('/api/minijeux', { action: 'leave', tid: s.tid, seat: s.local }).then(function (r) { if (r && r.ok) applyTables(r); }); } catch (e) { /* ok */ } }
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.standKey = false;
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.11, z: 0.28 };
    room.remotePose = function (r) { for (var k = 0; k < chairs.length; k++) if (chairs[k].n === r.seat) return { x: chairs[k].x, z: chairs[k].z, yaw: chairs[k].yaw }; return null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) {
      if (!seat) return;
      view.yaw = Math.max(-1.2, Math.min(1.2, drag.seat.yaw - dx * 0.006));
      if (drag.mouse) view.pitch = Math.max(-0.45, Math.min(0.35, drag.seat.pitch - dy * 0.004));
      else view.pitch = Math.max(-0.5, Math.min(0.4, drag.seat.pitch + dy * 0.004));        // doigt : on attrape la scène, glisser vers le bas fait regarder plus haut
    };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.8; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      var u = kindOf(s.tid) === 'u', tc = world.touch && !u, ex = s.x + (s.tx - s.x) * (u ? -0.08 : tc ? -0.2 : -0.35), ey = u ? 2.25 : tc ? 1.55 : 1.85, ez = s.z + (s.tz - s.z) * (u ? -0.08 : tc ? -0.2 : -0.35), ty = u ? 0.86 : tc ? 1.15 : 1.3;
      var a = Math.atan2(s.tx - ex, -(s.tz - ez)) + view.yaw, p = Math.atan2(ty - ey, Math.hypot(s.tx - ex, s.tz - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: u ? 72 : 62 };
    };
    room.seatClick = function (ray) {
      if (seat && kindOf(seat.tid) === 'u') { var tvd = TV[seat.tid]; if (tvd && tvd.deckHit && ray.intersectObject(tvd.deckHit, false)[0]) drawFromDeck(); return; }
      if (!seat || kindOf(seat.tid) !== 'c') return;
      var hit = ray.intersectObjects(TV[seat.tid].hits, false)[0];
      if (!hit) return;
      var err = dropCol(hit.object.userData.col); if (err) { errMsg = err; errT = 3; refreshUi(); }
    };
    room.syncHud = function () { refreshUi(); };

    room.onEnter = function () { pollT = 99; };

    // lumières
    g.add(new THREE.AmbientLight(0xf0e0e8, 1.2));
    if (!low) (isC4 ? C4_P : UNO_P).forEach(function (p) { var l = new THREE.PointLight(0xffd9a0, 0.8, 11); l.position.set(p[0], 4.2, p[1]); g.add(l); });
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🎮 MINI JEUX', sub: 'RETOUR', color: 0xffd24a, target: 'minijeux', theme: 'exitUno' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un fauteuil pour jouer' : 'ZQSD / flèches : marcher · Maj : courir · deux tables : ' + (isC4 ? 'Puissance 4 (2 joueurs)' : 'UNO (2 à 4 joueurs)') + ' · avance vers un fauteuil (F ou clic) pour t\'asseoir et jouer avec les autres · F : se lever' + (w.full ? ' · Échap : quitter' : ''); };
    room.onLeave = function () { stand(); };
    room._etat = function () { return G; };
    room._dbg = { adopt: adopt, toast: toast, renderTable: renderTable, seatOf: function () { return seat; } };
    room.dispose = function () { stand(); };
    var slow = { key: '', t: 0, done: false };
    var arrowClock = 0;
    room.update = function (dt) {
      arrowClock += dt;
      TIDS.forEach(function (tid) {
        var tv = TV[tid], st = G[tid]; if (!tv || tv.kind !== 'u') return;
        var on = !!st && st.ph === 'play', dir = st && st.dir < 0 ? -1 : 1, pulse = 1 + 0.1 * Math.sin(arrowClock * 3.2);
        tv.arrows.forEach(function (a) {
          a.g.visible = on; if (!on) return;
          var target = a.am + dir * Math.PI / 2, d = target - a.phi; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          a.phi += d * Math.min(1, dt * 5); a.g.rotation.y = -a.phi; a.g.scale.setScalar(pulse * 0.6);
          a.g.children.forEach(function (m) { m.scale.y = dir > 0 ? -1 : 1; });          // la flèche courbe se plie toujours autour de la table
        });
        tv.heads.forEach(function (h, s2) { var act = on && st.turn === s2 && st.hands[s2] && !(st.wait >= 0 && false); h.visible = act; if (act) { h.position.y = 2.8 + 0.09 * Math.sin(arrowClock * 5); h.rotation.y += dt * 2; } });
      });
      TIDS.forEach(function (tid3) { var tv3 = TV[tid3]; if (!tv3 || tv3.kind !== 'u' || !tv3.deckArrow) return; var on3 = !!seat && seat.tid === tid3 && mustDraw(G[tid3]); tv3.deckArrow.visible = on3; if (on3) { tv3.deckArrow.position.y = 1.2 + 0.06 * Math.sin(arrowClock * 5); tv3.deckArrow.rotation.y += dt * 2; } });
      if (seat && kindOf(seat.tid) === 'u') {                                              // +2 / +4 reçu et rien pour répondre : les cartes sont piochées toutes seules (1,3 s plus tard)
        var ast = G[seat.tid], aloc = seat.local, ahd = ast && ast.hands[aloc];
        if (ast && ahd && ast.ph === 'play' && ast.turn === aloc && ast.pend > 0 && !(ast.wait >= 0) && !ast.drawn && !ahd.some(function (c) { return MJ.unoCanPlay(ast, c); })) {
          var akey = seat.tid + '|' + ast.ver;
          if (autoKey !== akey) { autoKey = akey; autoAt = performance.now() + 1300; }
          else if (autoAt && performance.now() >= autoAt) { autoAt = 0; srv('draw'); }
        }
      }
      if (seat && kindOf(seat.tid) === 'u') {                                              // quelqu'un met trop de temps à jouer : la voix le rappelle à l'ordre (une fois par tour)
        var sst = G[seat.tid], skey = sst && sst.ph === 'play' && Object.keys(sst.hands).length > 1 ? sst.turn + '|' + sst.disc.length + '|' + (sst.pend | 0) + '|' + (sst.drawn || '') : '';
        if (skey !== slow.key) { slow.key = skey; slow.t = 0; slow.done = false; } else if (skey && !slow.done && (slow.t += dt) > 22) { slow.done = true; lastVoice = { f: 'trop-long', t: performance.now() }; vq.push({ f: 'trop-long', t: performance.now() }); vPump(); }
      }
      if (seat && kindOf(seat.tid) === 'c') {                                              // Puissance 4 : si on met du temps à jouer, une voix le dit (un seul seuil tiré au hasard par tour : 30, 40, 50 ou 60 s, parfois aucun)
        var cst = G[seat.tid], ckey = cst && cst.ph === 'play' ? cst.turn + '|' + cst.g.reduce(function (a, c) { return a + c.length; }, 0) : '';
        if (ckey !== slow.key) { slow.key = ckey; slow.t = 0; slow.done = false; slow.thr = ckey && hash(cst.ver * 17 + 3) % 100 >= 20 ? [30, 40, 50, 60][hash(cst.ver * 13 + 1) % 4] : 0; }
        else if (ckey && slow.thr && !slow.done && (slow.t += dt) > slow.thr) { slow.done = true; vq.push({ f: 'puissance4/temps', t: performance.now() }); vPump(); }
      }
      for (var fi = fxs.length - 1; fi >= 0; fi--) { var fo = fxs[fi]; fo.t += dt; var fu = Math.min(1, fo.t / fo.dur); fo.upd(fu, fo.t); if (fu >= 1) { fo.end(); fxs.splice(fi, 1); } }
      if (errT > 0) { errT -= dt; if (errT <= 0 && ui) refreshUi(); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && toastEl) toastEl.classList.remove('in'); }
      var tnow = performance.now() / 1000;
      TIDS.forEach(function (tid2) { var tv2 = TV[tid2]; if (tv2.kind !== 'c') return; tv2.bars.forEach(function (b) { if (!b.visible) return; var ar = b.children[0]; if (ar) ar.position.y = ar.userData.y0 + 0.035 * Math.sin(tnow * 6); }); });
      pollT += dt; if (pollT > (seat ? 0.6 : 2)) { pollT = 0; poll(); }
      for (var k = anims.length - 1; k >= 0; k--) {
        var a = anims[k]; a.t += dt / 0.42; var u = Math.min(1, a.t), y = a.y1 + (a.y0 - a.y1) * (1 - u) * (1 - u);
        if (u >= 0.85) y += Math.sin((u - 0.85) / 0.15 * Math.PI) * 0.012;
        a.m.position.y = y; if (u >= 1) { a.m.position.y = a.y1; anims.splice(k, 1); }
      }
    };
    return room;
  }

  F.registerRoom('uno', function (w) { return createUnoRoom(w, 'uno'); });
  F.registerRoom('puissance4', function (w) { return createUnoRoom(w, 'c4'); });
})();
