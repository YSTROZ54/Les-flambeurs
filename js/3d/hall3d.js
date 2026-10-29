/* =====================================================================
   hall3d.js — Le hall d'accueil 3D des Flambeurs (Three.js r128)
   ---------------------------------------------------------------------
   Un grand hall de casino avec une porte par jeu. On pousse une porte pour entrer :
     - « Machines à sous » mène à la salle 3D des machines (même monde, fondu au noir) ;
     - les autres portes ouvrent le jeu correspondant du site (menu classique / poker 3D…).
   Le menu classique reste toujours disponible (bouton « Menu classique » en haut).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 11, HZ = 10;   // demi-largeur et demi-profondeur du hall (mètres)

  // une porte par jeu : emplacement sur le mur, nom, lueur, destination
  var DOORS = [
    // mur du fond (regarde vers +z)
    { x: -7.5, z: -HZ, nx: 0, nz: 1, label: '🎰 MACHINES', sub: 'À SOUS', color: 0xffb347, target: 'slots' },
    { x: -2.5, z: -HZ, nx: 0, nz: 1, label: '♠️ POKER', sub: 'TEXAS HOLD\'EM', color: 0x7ee0a0, target: 'pokerroom' },
    { x: 2.5, z: -HZ, nx: 0, nz: 1, label: '🃏 BLACKJACK', sub: 'CONTRE LE CROUPIER', color: 0xff8a8a, target: 'blackjack' },
    { x: 7.5, z: -HZ, nx: 0, nz: 1, label: '🚀 FUSÉE CRASH', sub: 'ÉJECTE-TOI À TEMPS', color: 0x9ab8ff, target: 'crash' },
    // mur de gauche (regarde vers +x)
    { x: -HX, z: -5, nx: 1, nz: 0, label: '💎 CHAMBRE FORTE', sub: 'ÉVITE LES BOMBES', color: 0x8ae6c8, target: 'mines' },
    { x: -HX, z: 0, nx: 1, nz: 0, label: '🥤 GOBELETS', sub: 'TROUVE LA BILLE', color: 0xffe08a, target: 'cups' },
    { x: -HX, z: 5, nx: 1, nz: 0, label: '🎟️ GRATTAGE', sub: 'TICKETS GAGNANTS', color: 0xffc0e0, target: 'scratch' },
    // mur de droite (regarde vers -x)
    { x: HX, z: -5, nx: -1, nz: 0, label: '🎵 BLIND TEST', sub: 'DEVINE LA MUSIQUE', color: 0xd9a0ff, target: 'blindtest' },
    { x: HX, z: 0, nx: -1, nz: 0, label: '🛍️ BOUTIQUE', sub: '6 VENDEURS · SKINS', color: 0xffd24a, target: 'shop3d' },
    { x: HX, z: 5, nx: -1, nz: 0, label: '🏦 BANQUE', sub: 'VIREMENTS & COFFRE', color: 0xa0d8ff, target: 'bank' },
    // mur d'entrée (regarde vers -z), à côté de l'enseigne
    { x: 6.5, z: HZ, nx: 0, nz: -1, label: '🏇 COURSES', sub: 'PARIE SUR TON CHEVAL', color: 0x7fd1ff, target: 'horses' }
  ];

  function createHallRoom(world, cfg) {
    var low = world.low;
    var room = { title: 'HALL D\'ACCUEIL', subtitle: 'POUSSE UNE PORTE POUR JOUER', topic: 'flambeurs-hall-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.8, xMax: HX - 0.8, zMin: -HZ + 0.8, zMax: HZ - 0.8 };

    // sol : damier de marbre
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d');
    fx.fillStyle = '#d9d2c5'; fx.fillRect(0, 0, 256, 256);
    fx.fillStyle = '#25202a'; fx.fillRect(0, 0, 128, 128); fx.fillRect(128, 128, 128, 128);
    fx.strokeStyle = 'rgba(201,162,39,0.55)'; fx.lineWidth = 3; fx.strokeRect(1, 1, 254, 254);
    fx.beginPath(); fx.moveTo(128, 0); fx.lineTo(128, 256); fx.moveTo(0, 128); fx.lineTo(256, 128); fx.stroke();
    fx.globalAlpha = 0.07; for (var i = 0; i < 90; i++) { fx.fillStyle = i % 2 ? '#fff' : '#000'; fx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 18, 1); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.35, metalness: 0.25 }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);

    // grand médaillon doré au centre
    var mc = mkCanvas(512, 512), mx = mc.getContext('2d');
    mx.translate(256, 256); mx.strokeStyle = '#c9a227'; mx.fillStyle = '#500c1c';
    mx.beginPath(); mx.arc(0, 0, 250, 0, TAU); mx.fill();
    [250, 232, 150, 140].forEach(function (r, i) { mx.lineWidth = i % 2 ? 3 : 8; mx.beginPath(); mx.arc(0, 0, r, 0, TAU); mx.stroke(); });
    mx.lineWidth = 3; for (var a = 0; a < 16; a++) { mx.save(); mx.rotate(a / 16 * TAU); mx.beginPath(); mx.moveTo(150, 0); mx.lineTo(232, 0); mx.stroke(); mx.restore(); }
    var med = new THREE.Mesh(new THREE.CircleGeometry(4.4, 48), new THREE.MeshBasicMaterial({ map: mkTex(mc), transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    med.rotation.x = -Math.PI / 2; med.position.y = 0.01; g.add(med);

    // murs, moulures, plafond
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x3a1020, roughness: 0.85 });
    var panelMat = new THREE.MeshStandardMaterial({ color: 0x24090f, roughness: 0.7 });
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.6, emissive: 0x2a1d00 });
    function wall(w, h, px, py, pz, ry, mat) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || wallMat); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 8, 0, 4, -HZ, 0); wall(HX * 2, 8, 0, 4, HZ, Math.PI);
    wall(HZ * 2, 8, -HX, 4, 0, Math.PI / 2); wall(HZ * 2, 8, HX, 4, 0, -Math.PI / 2);
    // soubassement plus sombre
    wall(HX * 2, 1.1, 0, 0.55, -HZ + 0.02, 0, panelMat); wall(HX * 2, 1.1, 0, 0.55, HZ - 0.02, Math.PI, panelMat);
    wall(HZ * 2, 1.1, -HX + 0.02, 0.55, 0, Math.PI / 2, panelMat); wall(HZ * 2, 1.1, HX - 0.02, 0.55, 0, -Math.PI / 2, panelMat);
    [1.1, 7.8].forEach(function (y) {
      [[HX * 2, 0.08, 0.08, 0, y, -HZ + 0.05], [HX * 2, 0.08, 0.08, 0, y, HZ - 0.05], [0.08, 0.08, HZ * 2, -HX + 0.05, y, 0], [0.08, 0.08, HZ * 2, HX - 0.05, y, 0]].forEach(function (d) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), gold); m.position.set(d[3], d[4], d[5]); g.add(m);
      });
    });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0b060c }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 8; g.add(ceil);

    // grande enseigne sur le mur d'entrée (derrière le joueur au départ)
    var sg = mkCanvas(1024, 256), sx = sg.getContext('2d');
    sx.fillStyle = '#12080f'; sx.fillRect(0, 0, 1024, 256); sx.strokeStyle = '#c9a227'; sx.lineWidth = 8; sx.strokeRect(8, 8, 1008, 240);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#f3cf62'; sx.shadowColor = '#ffb300'; sx.shadowBlur = 20;
    sx.font = '900 96px ' + SERIF; sx.fillText('LES FLAMBEURS', 512, 100);
    sx.shadowBlur = 0; sx.fillStyle = '#d9c88f'; sx.font = '600 34px ' + MONO; sx.fillText('✦  CASINO ENTRE POTES  ✦', 512, 190);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: mkTex(sg) }));
    sign.position.set(0, 5, HZ - 0.06); sign.rotation.y = Math.PI; g.add(sign);

    // colonnes aux coins
    var colMat = new THREE.MeshStandardMaterial({ color: 0x1a0f18, roughness: 0.55, metalness: 0.2 });
    [[-9.7, -7.6], [9.7, -7.6], [-9.7, 7.6], [9.7, 7.6]].forEach(function (p) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 8, 18), colMat); c.position.set(p[0], 4, p[1]); g.add(c);
      [0.3, 7.7].forEach(function (y) { var r = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), gold); r.rotation.x = Math.PI / 2; r.position.set(p[0], y, p[1]); g.add(r); });
      room.colliders.push({ x: p[0], z: p[1], r: 0.9 });
    });

    // fontaine centrale
    var marble = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.25, metalness: 0.1 });
    var base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.6, 32), marble); base.position.y = 0.3; g.add(base);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.07, 8, 40), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; g.add(rim);
    // eau : fond sombre, surface brillante, reflets qui bougent, vaguelettes et petites gouttes
    var bed = new THREE.Mesh(new THREE.CircleGeometry(1.66, 40), new THREE.MeshStandardMaterial({ color: 0x0b3a5c, roughness: 0.6 }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = 0.42; g.add(bed);
    var water = new THREE.Mesh(new THREE.CircleGeometry(1.66, 48), new THREE.MeshStandardMaterial({ color: 0x2aa8e0, emissive: 0x06324f, roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.8 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.6; g.add(water);
    var cc = mkCanvas(128, 128), cx2 = cc.getContext('2d'), q, u;
    cx2.fillStyle = '#000'; cx2.fillRect(0, 0, 128, 128); cx2.lineCap = 'round';
    for (q = 0; q < 46; q++) {
      cx2.strokeStyle = 'rgba(190,240,255,' + (0.25 + Math.random() * 0.5) + ')'; cx2.lineWidth = 1 + Math.random() * 2;
      cx2.beginPath(); u = Math.random() * 128; cx2.moveTo(u, Math.random() * 128); cx2.bezierCurveTo(u + 30, Math.random() * 128, u - 30, Math.random() * 128, u + (Math.random() - 0.5) * 60, Math.random() * 128); cx2.stroke();
    }
    var wt = new THREE.CanvasTexture(cc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(2.2, 2.2);
    var wt2 = wt.clone(); wt2.needsUpdate = true; wt2.repeat.set(1.5, 1.5);
    [wt, wt2].forEach(function (t, k) {
      var cs = new THREE.Mesh(new THREE.CircleGeometry(1.64, 40), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
      cs.rotation.x = -Math.PI / 2; cs.position.y = 0.612 + k * 0.004; g.add(cs);
    });
    var ripples = [0, 1, 2].map(function (k) {
      var rp = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 48), new THREE.MeshBasicMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      rp.rotation.x = -Math.PI / 2; rp.position.y = 0.625; g.add(rp); return rp;
    });
    var DROPS = low ? 10 : 22, dropG = new THREE.SphereGeometry(0.035, 6, 5), dropM = new THREE.MeshBasicMaterial({ color: 0xd9f6ff, transparent: true, opacity: 0.85 });
    var drops = [], dk;
    for (dk = 0; dk < DROPS; dk++) { var dm = new THREE.Mesh(dropG, dropM); g.add(dm); drops.push({ m: dm, a: dk / DROPS * TAU, ph: (dk * 0.37) % 1, sp: 0.8 + (dk % 5) * 0.12 }); }
    var pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.6, 14), gold); pillar.position.y = 1.35; g.add(pillar);
    var cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), gold); cap.position.y = 2.18; g.add(cap);
    var arm = new THREE.Group(); arm.position.y = 3.15; g.add(arm);
    var ringMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.2, metalness: 0.8, emissive: 0x6a4500 });
    [0, 1, 2].forEach(function (k) { var r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 32), ringMat); r.rotation.set(k * 1.05, k * 0.7, 0); arm.add(r); });
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); arm.add(core);
    room.colliders.push({ x: 0, z: 0, r: 2.1 });

    // lustres
    function rod(c, a, b, rad) {
      var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz), m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 6), gold);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()); c.add(m);
    }
    function chandelier(x, z, r, y) {
      var c = new THREE.Group(), top = 8 - y, k, an; c.position.set(x, y, z); g.add(c);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 40), gold); ring.rotation.x = Math.PI / 2; c.add(ring);
      var ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.04, 8, 32), gold); ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.14; c.add(ring2);
      var hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), gold); hub.position.y = -0.14; c.add(hub);
      var drop = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 10), gold); drop.rotation.x = Math.PI; drop.position.y = -0.44; c.add(drop);
      for (k = 0; k < 4; k++) {                                   // 4 chaînes qui montent de l'anneau jusqu'à la rosace du plafond, et des rayons vers le moyeu
        an = k / 4 * TAU + Math.PI / 4;
        rod(c, [Math.cos(an) * r, 0, Math.sin(an) * r], [0, top - 0.05, 0], 0.022);
        rod(c, [Math.cos(an) * r, 0, Math.sin(an) * r], [0, -0.14, 0], 0.03);
        rod(c, [Math.cos(an) * r * 0.5, -0.14, Math.sin(an) * r * 0.5], [Math.cos(an) * r, 0, Math.sin(an) * r], 0.02);
      }
      rod(c, [0, -0.14, 0], [0, top - 0.05, 0], 0.03);
      var rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.12, 20), gold); rosette.position.y = top - 0.05; c.add(rosette);
      var rcap = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20), gold); rcap.rotation.x = Math.PI / 2; rcap.position.y = top - 0.1; c.add(rcap);
      var nb = low ? 10 : 18, bm = new THREE.MeshBasicMaterial({ color: 0xffe3a8 }), bg = new THREE.SphereGeometry(0.07, 8, 6);
      for (var b = 0; b < nb; b++) { var m = new THREE.Mesh(bg, bm); var an2 = b / nb * TAU; m.position.set(Math.cos(an2) * r, 0.1, Math.sin(an2) * r); c.add(m); }
    }
    chandelier(0, 0, 2.6, 6.2); chandelier(-6.5, 0, 1.5, 6.6); chandelier(6.5, 0, 1.5, 6.6);

    // éclairage
    g.add(new THREE.AmbientLight(0xa89cc8, 0.9));
    var key = new THREE.DirectionalLight(0xfff0d0, 0.5); key.position.set(3, 7, 6); g.add(key);
    var pl = new THREE.PointLight(0xffd9a0, 1.0, 26); pl.position.set(0, 6, 0); g.add(pl);
    if (!low) { var p2 = new THREE.PointLight(0xffb070, 0.6, 20); p2.position.set(0, 3, -7); g.add(p2); }

    // les portes
    DOORS.forEach(function (d) { world.addDoor(room, { x: d.x, z: d.z, nx: d.nx, nz: d.nz, w: 1.8, h: 2.9, label: d.label, sub: d.sub, color: d.color, target: d.target }); });

    room.spawn = function (from) {
      for (var i = 0; i < room.doors.length; i++) {
        var s = room.doors[i].spec;
        if (from && s.target === from) return { x: s.x + s.nx * 3, z: s.z + s.nz * 3, yaw: F.yawFor(s.nx, s.nz) };
      }
      return { x: 0, z: 7.4, yaw: 0 };
    };
    room.hint = function (w) {
      return w.touch ? 'Joystick : marcher · approche-toi d\'une porte pour la pousser'
        : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · avance vers une porte pour la pousser' + (w.full ? ' · la souris tourne la vue · Échap : quitter' : ' · clique-glisse : regarder');
    };
    var hallT = 0;
    room.update = function (dt) {
      arm.rotation.y += dt * 0.6; arm.rotation.x += dt * 0.2;
      wt.offset.x += dt * 0.03; wt.offset.y += dt * 0.02; wt2.offset.x -= dt * 0.025; wt2.offset.y += dt * 0.018;
      hallT += dt;
      ripples.forEach(function (rp, k) { var f = (hallT * 0.3 + k / 3) % 1, rr = 0.25 + f * 1.4; rp.scale.set(rr, rr, 1); rp.material.opacity = 0.55 * (1 - f); });
      drops.forEach(function (d) {          // gouttes qui jaillissent du pied de la sphère et retombent dans l'eau
        var f = (hallT * d.sp * 0.5 + d.ph) % 1, out = f * 1.25, h = 2.1 + 1.3 * 4 * f * (1 - f) * 0.9 - f * 1.5;
        d.m.position.set(Math.cos(d.a) * out, Math.max(0.62, h), Math.sin(d.a) * out);
      });
    };
    return room;
  }
  F.registerRoom('hall', createHallRoom);
})();
