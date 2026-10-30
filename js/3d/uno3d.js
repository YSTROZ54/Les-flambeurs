/* =====================================================================
   uno3d.js — La salle d'UNO (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « UNO » du hall (hall3d.js, l'ancienne porte du grattage : le grattage reste dans le menu 2D) et on
   en ressort vers le hall.
   Pour l'instant c'est la salle d'attente des futures parties d'UNO en 3D : décor, tables rondes avec des cartes posées, enseigne néon
   et un panneau « bientôt ». Les parties viendront s'y brancher plus tard.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;
  var HX = 13, HZ = 10, H = 5.2;
  var COLORS = ['#d6221e', '#f2c200', '#1f9d4a', '#1b63c9'];

  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function unoCardTex(col, label) {
    var cv = mkCanvas(160, 240), c = cv.getContext('2d');
    rr(c, 4, 4, 152, 232, 18); c.fillStyle = '#fff'; c.fill(); rr(c, 12, 12, 136, 216, 12); c.fillStyle = col; c.fill();
    c.save(); c.translate(80, 120); c.rotate(-0.5); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, 40, 84, 0, 0, TAU); c.fill(); c.restore();
    c.fillStyle = col; c.font = '900 92px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 80, 124);
    c.fillStyle = '#fff'; c.font = '800 34px ' + SERIF; c.fillText(label, 36, 40); c.fillText(label, 124, 204);
    return mkTex(cv);
  }

  function createUnoRoom(world) {
    var low = world.low;
    var room = { title: '🃏 UNO', subtitle: 'LES PARTIES D\'UNO ARRIVENT BIENTÔT', topic: 'flambeurs-uno-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    // sol en grandes dalles sombres, murs bordeaux, plafond noir
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#161018'; fx.fillRect(0, 0, 256, 256);
    COLORS.forEach(function (col, k) { fx.fillStyle = col; fx.globalAlpha = 0.18; fx.fillRect((k % 2) * 128, Math.floor(k / 2) * 128, 128, 128); }); fx.globalAlpha = 1;
    fx.strokeStyle = 'rgba(255,255,255,0.12)'; fx.lineWidth = 3; fx.strokeRect(1.5, 1.5, 253, 253);
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.5, metalness: 0.2 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wallM = new THREE.MeshStandardMaterial({ color: 0x5a1c28, roughness: 0.85 });
    function wall(w, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallM); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    // bandes de couleur UNO le long des murs
    COLORS.forEach(function (col, k) {
      var m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col) });
      box(g, HX * 2 / 4, 0.14, 0.1, m, -HX + HX * 2 / 8 + k * HX * 2 / 4, 1.0, -HZ + 0.05);
      box(g, HX * 2 / 4, 0.14, 0.1, m, -HX + HX * 2 / 8 + k * HX * 2 / 4, 4.3, -HZ + 0.05);
    });

    // grande enseigne
    var sc0 = mkCanvas(1024, 512), sx = sc0.getContext('2d'); sx.fillStyle = '#0d0508'; sx.fillRect(0, 0, 1024, 512);
    sx.save(); sx.translate(512, 256); sx.rotate(-0.12); sx.fillStyle = '#d6221e'; rr(sx, -380, -190, 760, 380, 60); sx.fill(); sx.fillStyle = '#fff'; sx.beginPath(); sx.ellipse(0, 0, 330, 150, -0.35, 0, TAU); sx.fill();
    sx.fillStyle = '#f2c200'; sx.strokeStyle = '#111'; sx.lineWidth = 16; sx.font = '900 250px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.strokeText('UNO', 0, 8); sx.fillText('UNO', 0, 8); sx.restore();
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshBasicMaterial({ map: mkTex(sc0) })); sign.position.set(0, 3.1, -HZ + 0.07); g.add(sign);
    var banner = mkCanvas(1024, 160), bx = banner.getContext('2d'); bx.fillStyle = '#12080f'; bx.fillRect(0, 0, 1024, 160); bx.strokeStyle = '#f2c200'; bx.lineWidth = 8; bx.strokeRect(6, 6, 1012, 148);
    bx.fillStyle = '#ffe9a0'; bx.font = '800 62px ' + SERIF; bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillText('BIENTÔT : LES PARTIES D\'UNO EN 3D', 512, 84, 960);
    var ban = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshBasicMaterial({ map: mkTex(banner) })); ban.position.set(0, 1.6, -HZ + 0.07); g.add(ban);

    // tables rondes avec des cartes posées et des tabourets
    var tabM = new THREE.MeshStandardMaterial({ color: 0x14583a, roughness: 0.9 }), woodM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5 }), seatM = new THREE.MeshStandardMaterial({ color: 0xd6221e, roughness: 0.6 });
    var cardGeo = new THREE.PlaneGeometry(0.24, 0.36), cardMats = COLORS.map(function (col, k) { return new THREE.MeshBasicMaterial({ map: unoCardTex(col, ['7', '2', '9', '5'][k]) }); });
    [[-6, -2.5], [6, -2.5], [-6, 3.5], [6, 3.5], [0, 2]].forEach(function (p, ti) {
      var t = new THREE.Group(); t.position.set(p[0], 0, p[1]); g.add(t);
      var top = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.1, 40), tabM); top.position.y = 0.8; t.add(top);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 8, 40), woodM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.82; t.add(rim);
      var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 0.78, 14), woodM); ped.position.y = 0.39; t.add(ped);
      for (i = 0; i < 6; i++) { var a = i / 6 * TAU, cm = new THREE.Mesh(cardGeo, cardMats[(i + ti) % 4]); cm.rotation.x = -Math.PI / 2; cm.rotation.z = a + 0.4; cm.position.set(Math.cos(a) * 0.62, 0.855 + i * 0.002, Math.sin(a) * 0.62); t.add(cm); }
      var pile = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.36), new THREE.MeshBasicMaterial({ color: 0x15151a })); pile.position.set(0, 0.88, 0); t.add(pile);
      for (i = 0; i < 4; i++) { var a2 = i / 4 * TAU + 0.8, st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), seatM); st.position.set(Math.cos(a2) * 1.85, 0.55, Math.sin(a2) * 1.85); t.add(st); var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.52, 8), woodM); stem.position.set(Math.cos(a2) * 1.85, 0.27, Math.sin(a2) * 1.85); t.add(stem); }
      room.colliders.push({ x: p[0], z: p[1], r: 1.7 });
    });

    // lumières : spots colorés du plafond
    g.add(new THREE.AmbientLight(0xf0e0e8, 1.25));
    if (!low) COLORS.forEach(function (col, k) { var l = new THREE.PointLight(new THREE.Color(col), 0.7, 14); l.position.set(-9 + k * 6, 4.4, 0); g.add(l); });
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · la porte du fond ramène au hall' : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · les parties d\'UNO arrivent bientôt dans cette salle' + (w.full ? ' · Échap : quitter' : ''); };
    room.update = function () { };
    return room;
  }

  F.registerRoom('uno', createUnoRoom);
})();
