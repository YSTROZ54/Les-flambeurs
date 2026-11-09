/* =====================================================================
   bientot3d.js — Trois salles VIDES du salon des mini jeux : PROP HUNT, TABLEAU DESSIN et GOLF
   ---------------------------------------------------------------------
   Les portes existent déjà dans le salon (minijeux3d.js) mais les jeux ne sont pas encore faits : à l'intérieur, une simple pièce
   avec une enseigne « BIENTÔT » et la porte pour revenir au salon. Pour créer le vrai jeu plus tard : remplacer la fabrique de la salle
   concernée (même identifiant : 'prophunt', 'dessin', 'golf') et garder la porte de retour vers 'minijeux'.
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, TAU = F.TAU;
  var HX = 8, HZ = 6, H = 4.4;

  var GAMES = {
    dessin: { title: '🎨 TABLEAU DESSIN', name: 'TABLEAU DESSIN', sub: 'DESSINE ET DEVINE', color: '#4ad0ff', wall: '#12222c' }
  };

  function createRoom(id, world) {
    var G = GAMES[id], low = world.low;
    var room = { title: G.title, subtitle: 'BIENTÔT DISPONIBLE', topic: 'flambeurs-' + id + '-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#15121b'; fx.fillRect(0, 0, 256, 256);
    fx.fillStyle = G.color; fx.globalAlpha = 0.12; fx.fillRect(0, 0, 128, 128); fx.fillRect(128, 128, 128, 128); fx.globalAlpha = 1;
    fx.fillStyle = '#c9a227'; fx.fillRect(0, 0, 256, 3); fx.fillRect(0, 0, 3, 256);
    var ft = mkTex(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 3, HZ * 2 / 3); ft.anisotropy = 8;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.45, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; g.add(floor);

    var wm = new THREE.MeshStandardMaterial({ color: new THREE.Color(G.wall), roughness: 0.85, metalness: 0.05 });
    function wall(len, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wm); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x08060a })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    var goldM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 });
    [[HX * 2, 0.15, 0.15, 0, H - 0.08, -HZ + 0.08], [HX * 2, 0.15, 0.15, 0, H - 0.08, HZ - 0.08], [0.15, 0.15, HZ * 2, -HX + 0.08, H - 0.08, 0], [0.15, 0.15, HZ * 2, HX - 0.08, H - 0.08, 0]].forEach(function (b) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(b[0], b[1], b[2]), goldM); m.position.set(b[3], b[4], b[5]); g.add(m);
    });

    // enseigne au mur du fond
    var sc = mkCanvas(1024, 400), sx = sc.getContext('2d');
    sx.fillStyle = 'rgba(8,6,12,0.88)'; sx.fillRect(0, 0, 1024, 400);
    sx.strokeStyle = G.color; sx.lineWidth = 10; sx.strokeRect(16, 16, 992, 368); sx.strokeStyle = '#c9a227'; sx.lineWidth = 3; sx.strokeRect(34, 34, 956, 332);
    sx.textAlign = 'center'; sx.textBaseline = 'middle';
    sx.fillStyle = G.color; sx.shadowColor = G.color; sx.shadowBlur = 24; sx.font = '900 118px ' + SERIF; sx.fillText(G.name, 512, 150);
    sx.shadowBlur = 0; sx.fillStyle = '#f4e3b0'; sx.font = '700 44px ' + SERIF; sx.fillText(G.sub, 512, 245);
    sx.fillStyle = '#c9a227'; sx.font = '800 54px ' + SERIF; sx.fillText('— BIENTÔT —', 512, 321);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.8), new THREE.MeshBasicMaterial({ map: mkTex(sc) })); sign.position.set(0, 2.5, -HZ + 0.05); g.add(sign);

    g.add(new THREE.AmbientLight(0xf0e6ee, 1.2));
    if (!low) { var l = new THREE.PointLight(0xffe2b0, 0.8, 12); l.position.set(0, 3.6, 0); g.add(l); }

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🎮 MINI JEUX', sub: 'RETOUR AU SALON', color: 0xffd24a, target: 'minijeux', theme: 'exitUno' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · avance vers la porte pour sortir' : 'ZQSD / flèches : marcher · Maj : courir · avance vers la porte pour revenir au salon' + (w.full ? ' · Échap : quitter' : ''); };
    room.update = function () { };
    return room;
  }

  Object.keys(GAMES).forEach(function (id) { F.registerRoom(id, function (w) { return createRoom(id, w); }); });
})();
