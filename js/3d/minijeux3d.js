/* =====================================================================
   minijeux3d.js — Le SALON DES MINI JEUX (monde 3D) : une grande salle avec une porte par jeu
   ---------------------------------------------------------------------
   On y entre par la porte « MINI JEUX » du hall. Chaque jeu a sa porte, bien séparée des autres (pas de couloir, pas de portes collées) :
     mur du fond : UNO · PUISSANCE 4 · LUDO · CHAMBRE FORTE
     mur de gauche : LOUP-GAROU · BLIND TEST          mur de droite : PROP HUNT · PMU · TABLEAU DESSIN   mur d'entrée : GOLF (+ la sortie)
     (Prop Hunt et Tableau dessin : salles vides pour le moment, voir bientot3d.js ; le golf est dans golf3d.js)
   La porte de sortie (devant) ramène au hall. Les jeux eux-mêmes sont dans uno3d.js (UNO et Puissance 4), ludo3d.js, vault3d.js,
   loupgarou3d.js, blindtest3d.js et pmu3d.js : chacun renvoie vers cette salle quand on ressort.
   Identifiant interne de la salle : « minijeux » (listé dans world3d.js et hall3d.js).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, TAU = F.TAU;
  var HX = 14, HZ = 9, H = 5.2;

  // les portes : nx/nz = direction dans laquelle la porte regarde (vers l'intérieur de la salle)
  var DOORS = [
    { id: 'uno', x: -9, z: -HZ, nx: 0, nz: 1, label: '🃏 UNO', sub: '2 À 4 JOUEURS', color: 0xffd400, target: 'uno', theme: 'uno' },
    { id: 'puissance4', x: -3, z: -HZ, nx: 0, nz: 1, label: '🔴 PUISSANCE 4', sub: '2 JOUEURS', color: 0x2b6cff, target: 'puissance4', theme: 'puissance4' },
    { id: 'ludo', x: 3, z: -HZ, nx: 0, nz: 1, label: '🎲 LUDO', sub: 'PETITS CHEVAUX', color: 0xffb300, target: 'ludo', theme: 'ludo' },
    { id: 'vault', x: 9, z: -HZ, nx: 0, nz: 1, label: '🔐 CHAMBRE FORTE', sub: 'MINES', color: 0x3dff9a, target: 'vault', theme: 'mines' },
    { id: 'loupgarou', x: -HX, z: -3, nx: 1, nz: 0, label: '🐺 LOUP GAROU', sub: 'PARTIES DE 4 À 12 JOUEURS', color: 0xc8b8ff, target: 'loupgarou', theme: 'loupgarou' },
    { id: 'blindtest', x: -HX, z: 3, nx: 1, nz: 0, label: '🎵 BLIND TEST', sub: 'DEVINE LE TITRE', color: 0xd9a0ff, target: 'blindtest', theme: 'blindtest' },
    { id: 'pmu', x: HX, z: 0, nx: -1, nz: 0, label: '🏇 PMU', sub: 'ESPACE SOCIAL', color: 0xff4a4a, target: 'pmu', theme: 'pmu' },
    // salles vides pour l'instant (bientot3d.js) : les jeux arrivent plus tard
    { id: 'prophunt', x: HX, z: -5.5, nx: -1, nz: 0, label: '🕵️ PROP HUNT', sub: 'BIENTÔT', color: 0xff7a3d, target: 'prophunt', theme: 'prophunt' },
    { id: 'dessin', x: HX, z: 5.5, nx: -1, nz: 0, label: '🎨 TABLEAU DESSIN', sub: 'BIENTÔT', color: 0x4ad0ff, target: 'dessin', theme: 'dessin' },
    { id: 'golf', x: 9, z: HZ, nx: 0, nz: -1, label: '⛳ MINI GOLF', sub: 'ENTRE AMIS · 2 PARCOURS', color: 0x5dff8a, target: 'golf', theme: 'golf' }
  ];

  function createMiniJeuxRoom(world) {
    var low = world.low, i;
    var room = { title: '🎮 MINI JEUX', subtitle: 'CHOISIS TON JEU', topic: 'flambeurs-minijeux-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };
    var COLORS = ['#d6221e', '#f2c200', '#1f9d4a', '#1b63c9'];

    /* sol : dalles sombres aux quatre couleurs d'UNO, joints dorés */
    var fc = mkCanvas(512, 512), fx = fc.getContext('2d'); fx.fillStyle = '#14101a'; fx.fillRect(0, 0, 512, 512);
    COLORS.forEach(function (col, k) { fx.fillStyle = col; fx.globalAlpha = 0.09; fx.fillRect((k % 2) * 256, Math.floor(k / 2) * 256, 256, 256); }); fx.globalAlpha = 1;
    fx.fillStyle = '#c9a227'; fx.fillRect(0, 0, 512, 5); fx.fillRect(0, 0, 5, 512); fx.fillRect(0, 254, 512, 4); fx.fillRect(254, 0, 4, 512);
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 4, HZ * 2 / 4); ft.anisotropy = 16;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* grand tapis rond au centre, avec les symboles des jeux */
    var rc = mkCanvas(512, 512), rx = rc.getContext('2d'), rg = rx.createRadialGradient(256, 256, 20, 256, 256, 256);
    rg.addColorStop(0, '#5a1424'); rg.addColorStop(0.8, '#34101a'); rg.addColorStop(1, '#240b12'); rx.fillStyle = rg; rx.fillRect(0, 0, 512, 512);
    rx.strokeStyle = '#d9b441'; rx.lineWidth = 7; rx.beginPath(); rx.arc(256, 256, 236, 0, TAU); rx.stroke(); rx.lineWidth = 3; rx.beginPath(); rx.arc(256, 256, 222, 0, TAU); rx.stroke();
    rx.textAlign = 'center'; rx.textBaseline = 'middle'; rx.fillStyle = '#f4e3b0'; rx.font = '900 70px ' + SERIF; rx.fillText('MINI', 256, 214); rx.fillText('JEUX', 256, 298);
    var rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.MeshStandardMaterial({ map: mkTex(rc), roughness: 0.9 })); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; g.add(rug);

    /* murs : tenture bleu nuit à fines rayures verticales et reflet de velours, sans lambris ni filet qui traverse les portes */
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'), wg = wx.createLinearGradient(0, 0, 0, 256); wg.addColorStop(0, '#1d2347'); wg.addColorStop(0.5, '#232b55'); wg.addColorStop(1, '#1a1f3e'); wx.fillStyle = wg; wx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 8; i++) { wx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)'; wx.fillRect(i * 32, 0, 32, 256); wx.fillStyle = 'rgba(214,180,255,0.16)'; wx.fillRect(i * 32, 0, 2, 256); }
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 16;
    function wall(len, px, pz, ry) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.2, H / 2.2); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }), wood = new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.5, metalness: 0.15 });
    function box(w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; }
    box(HX * 2, 0.2, 0.2, gold, 0, H - 0.1, -HZ + 0.1); box(HX * 2, 0.2, 0.2, gold, 0, H - 0.1, HZ - 0.1); box(0.2, 0.2, HZ * 2, gold, -HX + 0.1, H - 0.1, 0); box(0.2, 0.2, HZ * 2, gold, HX - 0.1, H - 0.1, 0);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* deux banquettes de velours au milieu (décor, on peut les contourner) */
    var velvet = new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.75 });
    [-1, 1].forEach(function (sd) {
      box(3.2, 0.45, 0.8, velvet, sd * 6, 0.25, 1.2); box(3.2, 0.5, 0.18, velvet, sd * 6, 0.65, 1.6); box(3.3, 0.06, 0.88, gold, sd * 6, 0.02, 1.2);
      room.colliders.push({ x: sd * 6 - 1.0, z: 1.2, r: 0.6 }, { x: sd * 6, z: 1.2, r: 0.6 }, { x: sd * 6 + 1.0, z: 1.2, r: 0.6 });
    });

    /* lumières */
    g.add(new THREE.AmbientLight(0xf0e0e8, 1.25));
    if (!low) [[-8, -4], [0, -4], [8, -4], [-7, 4], [7, 4], [0, 3]].forEach(function (p) { var l = new THREE.PointLight(0xffd9a0, 0.7, 11); l.position.set(p[0], 4.2, p[1]); g.add(l); });

    /* portes */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall', theme: 'exitUno' });
    DOORS.forEach(function (d) {
      var spec = { x: d.x, z: d.z, nx: d.nx, nz: d.nz, w: 2.2, h: 3.2, label: d.label, sub: d.sub, color: d.color, target: d.target };
      if (d.theme) spec.theme = d.theme;
      world.addDoor(room, spec);
    });
    // on arrive devant la porte par laquelle on vient de ressortir ; depuis le hall : devant la porte de sortie
    room.spawn = function (from) {
      for (var k = 0; k < DOORS.length; k++) if (DOORS[k].id === from) return { x: DOORS[k].x + DOORS[k].nx * 2.8, z: DOORS[k].z + DOORS[k].nz * 2.8, yaw: F.yawFor(DOORS[k].nx, DOORS[k].nz) };
      return { x: 0, z: HZ - 3, yaw: 0 };
    };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · avance vers une porte pour entrer' : 'ZQSD / flèches : marcher · Maj : courir · avance vers la porte du jeu que tu veux' + (w.full ? ' · Échap : quitter' : ''); };
    room.update = function () { };
    return room;
  }

  F.registerRoom('minijeux', createMiniJeuxRoom);
})();
