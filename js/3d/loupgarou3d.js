/* =====================================================================
   loupgarou3d.js — La salle du Loup-Garou (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « LOUP GAROU » du hall (hall3d.js, l'ancienne porte de la salle de la statue) et on en ressort vers le hall.
   Pour l'instant c'est la salle d'attente des futures parties de Loup-Garou en 3D : ambiance de nuit de pleine lune, grande lune,
   forêt en silhouette, tables à bougies et panneau « bientôt ». Les parties viendront s'y brancher plus tard.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, TAU = F.TAU;
  var HX = 13, HZ = 10, H = 5.4;

  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }

  function createLoupGarouRoom(world) {
    var low = world.low;
    var room = { title: '🐺 LOUP GAROU', subtitle: 'LES PARTIES ARRIVENT BIENTÔT', topic: 'flambeurs-loupgarou-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i, flames = [];
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    // sol de terre sombre, murs en forêt de nuit (dégradé et silhouettes de sapins), grosse lune au fond
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#17141c'; fx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 900; i++) { fx.fillStyle = 'rgba(' + (30 + Math.random() * 30) + ',' + (26 + Math.random() * 24) + ',' + (40 + Math.random() * 30) + ',0.5)'; fx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX / 2, HZ / 2); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wc = mkCanvas(1024, 512), wx = wc.getContext('2d'), gr = wx.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#05060f'); gr.addColorStop(0.7, '#141636'); gr.addColorStop(1, '#241a3a'); wx.fillStyle = gr; wx.fillRect(0, 0, 1024, 512);
    for (i = 0; i < 160; i++) { wx.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.random() * 0.7) + ')'; wx.fillRect(Math.random() * 1024, Math.random() * 300, 2, 2); }
    wx.fillStyle = '#04040a';
    for (i = 0; i < 26; i++) { var tx = i * 42 + Math.random() * 20, th = 140 + Math.random() * 130; wx.beginPath(); wx.moveTo(tx, 512); wx.lineTo(tx + 24, 512 - th); wx.lineTo(tx + 48, 512); wx.closePath(); wx.fill(); wx.beginPath(); wx.moveTo(tx + 6, 512 - th * 0.55); wx.lineTo(tx + 24, 512 - th * 1.0); wx.lineTo(tx + 42, 512 - th * 0.55); wx.closePath(); wx.fill(); }
    var wt = new THREE.CanvasTexture(wc); wt.anisotropy = 4;
    var wallM = new THREE.MeshBasicMaterial({ map: wt });
    function wall(w, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallM); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x05060d })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    // la lune
    var mc = mkCanvas(512, 512), mx = mc.getContext('2d'), mg = mx.createRadialGradient(256, 256, 40, 256, 256, 250); mg.addColorStop(0, 'rgba(255,250,225,1)'); mg.addColorStop(0.55, 'rgba(250,240,200,0.95)'); mg.addColorStop(0.62, 'rgba(250,240,200,0.35)'); mg.addColorStop(1, 'rgba(250,240,200,0)');
    mx.fillStyle = mg; mx.fillRect(0, 0, 512, 512); mx.fillStyle = 'rgba(190,175,140,0.35)'; [[200, 220, 38], [300, 300, 30], [260, 170, 22], [190, 310, 18]].forEach(function (c) { mx.beginPath(); mx.arc(c[0], c[1], c[2], 0, TAU); mx.fill(); });
    var moon = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: mkTex(mc), transparent: true, depthWrite: false })); moon.position.set(0, 3.2, -HZ + 0.06); g.add(moon);
    // enseigne et panneau
    var sc0 = mkCanvas(1024, 256), sx = sc0.getContext('2d'); sx.clearRect(0, 0, 1024, 256); sx.shadowColor = '#7b6dff'; sx.shadowBlur = 36; sx.fillStyle = '#e8e2ff'; sx.font = '900 150px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('LOUP GAROU', 512, 132, 980);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: mkTex(sc0), transparent: true, depthWrite: false })); sign.position.set(0, 4.55, -HZ + 0.09); g.add(sign);
    var bn = mkCanvas(1024, 150), bx = bn.getContext('2d'); bx.fillStyle = '#0b0a18'; bx.fillRect(0, 0, 1024, 150); bx.strokeStyle = '#8b7dff'; bx.lineWidth = 8; bx.strokeRect(6, 6, 1012, 138);
    bx.fillStyle = '#d9d2ff'; bx.font = '800 58px ' + SERIF; bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillText('BIENTÔT : LES PARTIES DE LOUP-GAROU EN 3D', 512, 78, 960);
    var ban = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.96), new THREE.MeshBasicMaterial({ map: mkTex(bn) })); ban.position.set(0, 1.5, -HZ + 0.07); g.add(ban);

    // tables rondes en bois à la lueur des bougies, bancs
    var woodM = new THREE.MeshStandardMaterial({ color: 0x3a2314, roughness: 0.7 }), waxM = new THREE.MeshBasicMaterial({ color: 0xf3e9cf }), fireM = new THREE.MeshBasicMaterial({ color: 0xffb04a });
    [[-6, -2], [6, -2], [-6, 4], [6, 4], [0, 1]].forEach(function (p) {
      var t = new THREE.Group(); t.position.set(p[0], 0, p[1]); g.add(t);
      var top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 28), woodM); top.position.y = 0.8; t.add(top);
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.78, 12), woodM); leg.position.y = 0.39; t.add(leg);
      var candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), waxM); candle.position.y = 0.97; t.add(candle);
      var flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), fireM); flame.scale.y = 1.6; flame.position.y = 1.14; t.add(flame); flames.push(flame);
      for (i = 0; i < 5; i++) { var a = i / 5 * TAU, b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), woodM); b.position.set(Math.cos(a) * 1.9, 0.45, Math.sin(a) * 1.9); b.rotation.y = -a + Math.PI / 2; t.add(b); }
      if (!low) { var pl = new THREE.PointLight(0xffa850, 0.6, 7); pl.position.set(p[0], 1.4, p[1]); g.add(pl); }
      room.colliders.push({ x: p[0], z: p[1], r: 1.8 });
    });
    g.add(new THREE.AmbientLight(0x7a80c0, 0.8));
    var mlight = new THREE.PointLight(0xdde4ff, 0.8, 22); mlight.position.set(0, 4, -HZ + 3); g.add(mlight);

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · la porte du fond ramène au hall' : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · les parties de Loup-Garou arrivent bientôt dans cette salle' + (w.full ? ' · Échap : quitter' : ''); };
    var t0 = 0;
    room.update = function (dt) { t0 += dt; flames.forEach(function (f, k) { f.scale.set(1 + 0.15 * Math.sin(t0 * 9 + k), 1.6 + 0.3 * Math.sin(t0 * 7 + k * 2), 1); }); };
    return room;
  }

  F.registerRoom('loupgarou', createLoupGarouRoom);
})();
