/* =====================================================================
   statue3d.js — La salle de la statue (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « LA STATUE » du hall (hall3d.js, l'ancienne porte de la chambre forte : ce jeu reste
   dans le menu 2D) et on en ressort vers le hall.
   Au milieu : un tyrannosaure (assets/3d/trex.glb, chargé avec THREE.GLTFLoader) sur un socle rond, entouré de
   poteaux dorés et d'une corde rouge, éclairé par un projecteur et un anneau lumineux au plafond.
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 26, HZ = 20, H = 9;                  // demi-largeur, demi-profondeur, hauteur de la salle (mètres)
  var PLINTH_TOP = 0.5, REX_LEN = 6.4;         // hauteur du dessus du socle ; longueur voulue du dinosaure

  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }

  function createStatueRoom(world) {
    var low = world.low;
    var room = { title: '🦖 LA STATUE', subtitle: 'SALLE D\'EXPOSITION', topic: 'flambeurs-statue-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7, emissive: 0x2a1d00 });
    var goldBas = new THREE.MeshBasicMaterial({ color: 0xffd36a });

    /* --- sol : pierre sombre en grandes dalles, fins joints dorés --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'), fgr = fx.createLinearGradient(0, 0, 256, 256);
    fgr.addColorStop(0, '#1b2226'); fgr.addColorStop(1, '#12181b'); fx.fillStyle = fgr; fx.fillRect(0, 0, 256, 256);
    fx.fillStyle = 'rgba(255,255,255,0.025)'; fx.fillRect(0, 0, 128, 128); fx.fillRect(128, 128, 128, 128);
    fx.strokeStyle = 'rgba(201,162,39,0.5)'; fx.lineWidth = 3; fx.strokeRect(1.5, 1.5, 253, 253);
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6, metalness: 0.12 }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* --- murs : panneaux vert profond, plinthe sombre, moulures dorées --- */
    var wc = mkCanvas(512, 512), wx = wc.getContext('2d'), wgr = wx.createLinearGradient(0, 0, 0, 512);
    wgr.addColorStop(0, '#16302d'); wgr.addColorStop(1, '#0d1c1b'); wx.fillStyle = wgr; wx.fillRect(0, 0, 512, 512);
    for (i = 0; i < 2; i++) {
      wx.strokeStyle = 'rgba(201,162,39,0.55)'; wx.lineWidth = 4; wx.strokeRect(i * 256 + 24, 40, 208, 432);
      wx.strokeStyle = 'rgba(201,162,39,0.25)'; wx.lineWidth = 2; wx.strokeRect(i * 256 + 38, 54, 180, 404);
    }
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 4;
    function wall(w, px, pz, ry) {
      var wt = wallTex.clone(); wt.needsUpdate = true; wt.repeat.set(w / 4, 1);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.8, metalness: 0.05 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m);
    }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    [[HX * 2, 0.12, 0.12, 0, 1.1, -HZ + 0.06], [HX * 2, 0.12, 0.12, 0, 1.1, HZ - 0.06], [0.12, 0.12, HZ * 2, -HX + 0.06, 1.1, 0], [0.12, 0.12, HZ * 2, HX - 0.06, 1.1, 0],
     [HX * 2, 0.16, 0.16, 0, H - 0.1, -HZ + 0.08], [HX * 2, 0.16, 0.16, 0, H - 0.1, HZ - 0.08], [0.16, 0.16, HZ * 2, -HX + 0.08, H - 0.1, 0], [0.16, 0.16, HZ * 2, HX - 0.08, H - 0.1, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    [[HX * 2, 1.1, 0.1, 0, 0.55, -HZ + 0.05], [HX * 2, 1.1, 0.1, 0, 0.55, HZ - 0.05], [0.1, 1.1, HZ * 2, -HX + 0.05, 0.55, 0], [0.1, 1.1, HZ * 2, HX - 0.05, 0.55, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], new THREE.MeshStandardMaterial({ color: 0x0a1514, roughness: 0.5, metalness: 0.4 }), d[3], d[4], d[5]); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x07100f })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* --- plafond : anneau lumineux au-dessus de la statue --- */
    var ringMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
    [4.6, 6.2].forEach(function (r) { var t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 72), ringMat); t.rotation.x = Math.PI / 2; t.position.y = H - 0.05; g.add(t); });
    var halo = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.1, depthWrite: false })); halo.rotation.x = Math.PI / 2; halo.position.y = H - 0.03; g.add(halo);

    /* --- socle rond à deux marches, bord doré, anneau lumineux au sol --- */
    var stone = new THREE.MeshStandardMaterial({ color: 0x2a3135, roughness: 0.45, metalness: 0.3 });
    var step1 = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.2, 0.24, 48), stone); step1.position.y = 0.12; g.add(step1);
    var step2 = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.8, 0.26, 48), stone); step2.position.y = 0.37; g.add(step2);
    [[4.14, 0.25], [3.74, PLINTH_TOP]].forEach(function (d) { var t = new THREE.Mesh(new THREE.TorusGeometry(d[0], 0.035, 6, 72), gold); t.rotation.x = Math.PI / 2; t.position.y = d[1]; g.add(t); });
    var glowRing = new THREE.Mesh(new THREE.RingGeometry(4.35, 4.6, 72), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 0.015; g.add(glowRing);

    /* --- poteaux dorés et corde rouge autour du socle --- */
    var N = 14, RR = 5.0, ropeM = new THREE.MeshStandardMaterial({ color: 0x8a0f24, roughness: 0.7 });
    var rope = new THREE.Mesh(new THREE.TorusGeometry(RR, 0.03, 6, 80), ropeM); rope.rotation.x = Math.PI / 2; rope.position.y = 0.78; g.add(rope);
    for (i = 0; i < N; i++) {
      var a = i / N * TAU, px = Math.cos(a) * RR, pz = Math.sin(a) * RR;
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 8), gold); post.position.set(px, 0.45, pz); g.add(post);
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), gold); knob.position.set(px, 0.93, pz); g.add(knob);
      room.colliders.push({ x: px, z: pz, r: 0.35 });
    }
    for (i = 0; i < 9; i++) { var b = i / 9 * TAU; room.colliders.push({ x: Math.cos(b) * 3.3, z: Math.sin(b) * 3.3, r: 1.7 }); }   // le socle : on ne marche pas dessus
    room.colliders.push({ x: 0, z: 0, r: 2.6 });

    /* --- le tyrannosaure --- */
    var rexHolder = new THREE.Group(); rexHolder.position.set(0, PLINTH_TOP, 0); g.add(rexHolder);
    var rexGeos = [], rexTex = [];
    if (THREE.GLTFLoader) {
      new THREE.GLTFLoader().load('assets/3d/trex.glb', function (gl) {
        var m = gl.scene, box3 = new THREE.Box3().setFromObject(m), size = new THREE.Vector3(), ctr = new THREE.Vector3();
        box3.getSize(size); box3.getCenter(ctr);
        var s = REX_LEN / Math.max(size.x, size.z);
        m.scale.setScalar(s);
        box3.setFromObject(m); box3.getCenter(ctr);
        m.position.set(-ctr.x, -box3.min.y, -ctr.z);
        m.traverse(function (o) {
          if (!o.isMesh) return;
          rexGeos.push(o.geometry);
          if (o.material) { var mm = o.material; [mm.map, mm.metalnessMap, mm.roughnessMap, mm.normalMap].forEach(function (t) { if (t) rexTex.push(t); }); if (mm.metalness > 0.3) mm.metalness = 0.3; }
        });
        rexHolder.add(m);
      }, undefined, function () {});
    }

    /* --- plaque d'information devant le socle --- */
    var pc = mkCanvas(512, 256), px2 = pc.getContext('2d');
    px2.fillStyle = '#0d1c1b'; px2.fillRect(0, 0, 512, 256); px2.strokeStyle = '#c9a227'; px2.lineWidth = 8; px2.strokeRect(8, 8, 496, 240);
    px2.textAlign = 'center'; px2.textBaseline = 'middle'; px2.fillStyle = '#f3cf62'; px2.font = '900 46px ' + SERIF; px2.fillText('TYRANNOSAURUS REX', 256, 84, 460);
    px2.fillStyle = '#e8dcc0'; px2.font = '600 26px ' + MONO; px2.fillText('Le roi des tyrans', 256, 142); px2.fillText('Statue d\'exposition des Flambeurs', 256, 184, 470);
    var PQX = 3.6, PQZ = 5.4, PQR = Math.atan2(PQX, PQZ), plaque = new THREE.Group(); plaque.position.set(PQX, 0, PQZ); plaque.rotation.y = PQR; g.add(plaque);   // sur le côté, tournée vers les visiteurs
    box(plaque, 0.1, 0.9, 0.1, gold, -0.9, 0.45, 0); box(plaque, 0.1, 0.9, 0.1, gold, 0.9, 0.45, 0);
    var pl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshBasicMaterial({ map: mkTex(pc) })); pl.position.set(0, 1.1, 0); pl.rotation.x = -0.35; plaque.add(pl);
    room.colliders.push({ x: PQX - 0.9 * Math.cos(PQR), z: PQZ + 0.9 * Math.sin(PQR), r: 0.3 }, { x: PQX + 0.9 * Math.cos(PQR), z: PQZ - 0.9 * Math.sin(PQR), r: 0.3 });

    /* --- appliques murales (chaudes, jamais derrière un objet) --- */
    var sconceM = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    function sconce(x, z, ry) {
      var s = new THREE.Group(); s.position.set(x, 4.2, z); s.rotation.y = ry; g.add(s);
      box(s, 0.3, 0.5, 0.08, gold, 0, 0, 0); var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), sconceM); lamp.position.set(0, 0, 0.14); s.add(lamp);
    }
    for (i = -HZ + 4; i < HZ - 2; i += 6) { sconce(-HX + 0.05, i, Math.PI / 2); sconce(HX - 0.05, i, -Math.PI / 2); }
    for (i = -HX + 5; i < HX - 2; i += 7) { sconce(i, -HZ + 0.05, 0); sconce(i, HZ - 0.05, Math.PI); }

    /* --- lumières --- */
    g.add(new THREE.AmbientLight(0xcfd8d4, 0.9));
    var key = new THREE.DirectionalLight(0xffffff, 0.35); key.position.set(3, 8, 5); g.add(key);
    var spot = new THREE.SpotLight(0xfff0d0, low ? 1.1 : 1.6, 18, 0.62, 0.45); spot.position.set(0, H - 0.4, 0.5); spot.target.position.set(0, 1.2, 0); g.add(spot); g.add(spot.target);
    if (!low) [[-14, -8], [14, -8], [-14, 8], [14, 8]].forEach(function (q) { var side = new THREE.PointLight(0xffd9a0, 0.5, 22); side.position.set(q[0], 5, q[1]); g.add(side); });

    /* --- porte de retour vers le hall --- */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });

    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };   // la salle est très grande : il y aura la place d'y ajouter d'autres statues
    room.hint = function (w) {
      return w.touch ? 'Joystick : marcher · la porte du fond ramène au hall'
        : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter' + (w.full ? ' · la souris tourne la vue · Échap : quitter' : ' · clique-glisse : regarder');
    };
    var t0 = 0;
    room.update = function (dt) {
      t0 += dt;
      rexHolder.rotation.y += dt * 0.12;                                     // il tourne très lentement sur son socle
      glowRing.material.opacity = 0.45 + 0.15 * Math.sin(t0 * 1.4);
    };
    room.dispose = function () { rexGeos.forEach(function (gm) { gm.dispose(); }); rexTex.forEach(function (t) { t.dispose(); }); };
    return room;
  }

  F.registerRoom('statue', createStatueRoom);
})();
