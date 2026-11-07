/* =====================================================================
   musique3d.js — La salle de musique du casino 3D (Three.js r128)
   ---------------------------------------------------------------------
   On y entre par la porte violette du hall (mur de gauche). Le sol reprend le damier de marbre du hall, mais en verre :
   chaque dalle s'allume de la couleur du son qui joue (graves au centre, aigus vers les murs). Un mur d'égaliseur et deux enceintes
   répondent à la même musique. Sans musique, le sol respire doucement.
   La musique vient de audio3d.js (F.audio.levels) : dépose des titres dans assets/musique/salle-musique/ puis « npm run playlist ».
   Fichiers liés : f3d-core.js, world3d.js, audio3d.js, hall3d.js (la porte), portes3d.js (le thème de la porte).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 12, HZ = 12, H = 8;             // demi-largeur, demi-profondeur et hauteur de la salle (mètres)
  var NB = 16;                              // bandes de fréquences suivies (graves -> aigus)

  function createMusicRoom(world) {
    var low = world.low;
    var room = { title: 'SALLE DE MUSIQUE', subtitle: 'LE SOL VIBRE AU RYTHME DU SON', topic: 'flambeurs-musique-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.8, xMax: HX - 0.8, zMin: -HZ + 0.8, zMax: HZ - 0.8 };

    /* ---------- le sol : dalles LED en verre, une dalle lumineuse sur deux et l'autre en miroir infini ---------- */
    var TILE = low ? 1.5 : 1, NX = Math.round(HX * 2 / TILE), NZ = Math.round(HZ * 2 / TILE), N = NX * NZ;
    var base = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x05030a }));
    base.rotation.x = -Math.PI / 2; base.position.y = -0.34; g.add(base);
    function tileTex(kind) {
      var c = mkCanvas(128, 128), x = c.getContext('2d'), q, d;
      x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
      if (kind === 0) {                                      // dalle pleine : cadre clair, cœur qui rayonne
        var gr = x.createRadialGradient(64, 64, 4, 64, 64, 90); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#a8a8a8'); gr.addColorStop(1, '#383838');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#ffffff'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120);
      } else {                                               // miroir infini : des cadres qui s'enfoncent dans la dalle, points lumineux sur les bords
        for (q = 0; q < 9; q++) { var m = 5 + q * 6.5; x.strokeStyle = 'rgba(255,255,255,' + Math.pow(0.78, q).toFixed(2) + ')'; x.lineWidth = Math.max(1, 3.4 - q * 0.28); x.strokeRect(m, m, 128 - 2 * m, 128 - 2 * m); }
        x.fillStyle = 'rgba(255,255,255,0.95)';
        for (d = 0; d < 15; d++) { x.fillRect(9 + d * 7.5, 7, 3, 3); x.fillRect(9 + d * 7.5, 118, 3, 3); x.fillRect(7, 9 + d * 7.5, 3, 3); x.fillRect(118, 9 + d * 7.5, 3, 3); }
      }
      var t = mkTex(c); t.anisotropy = 4; return t;
    }
    var glowGeo = new THREE.PlaneGeometry(TILE - 0.07, TILE - 0.07); glowGeo.rotateX(-Math.PI / 2);
    var cnt = [0, 0], i, j, k = 0, dmax = Math.hypot(HX, HZ);
    for (i = 0; i < NX; i++) for (j = 0; j < NZ; j++) cnt[(i + j) % 2]++;
    function glowMesh(kind) { return new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ map: tileTex(kind), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), cnt[kind]); }
    var glowA = glowMesh(0), glowB = glowMesh(1);
    var glassGeo = new THREE.BoxGeometry(TILE - 0.04, 0.07, TILE - 0.04);
    var glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }), N);
    var dm = new THREE.Object3D(), tiles = [], kk = [0, 0];
    for (i = 0; i < NX; i++) for (j = 0; j < NZ; j++) {
      var tx = -HX + (i + 0.5) * TILE, tz = -HZ + (j + 0.5) * TILE, kind = (i + j) % 2, d = Math.hypot(tx, tz), gm = kind ? glowB : glowA;
      dm.position.set(tx, -0.18, tz); dm.updateMatrix(); gm.setMatrixAt(kk[kind], dm.matrix);
      dm.position.set(tx, -0.035, tz); dm.updateMatrix(); glass.setMatrixAt(k, dm.matrix);
      tiles.push({ kind: kind, k2: kk[kind], band: Math.min(NB - 1, Math.floor(Math.pow(d / dmax, 0.85) * NB)), d: d, ang: Math.atan2(tz, tx) });
      gm.setColorAt(kk[kind], new THREE.Color(0x000000)); glass.setColorAt(k, new THREE.Color(0x111111));
      kk[kind]++; k++;
    }
    [glowA, glowB, glass].forEach(function (m) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; g.add(m); });

    /* ---------- murs, moulures, plafond ---------- */
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x1d1038, roughness: 0.85 });
    var panelMat = new THREE.MeshStandardMaterial({ color: 0x120a24, roughness: 0.7 });
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.6, emissive: 0x2a1d00 });
    function wall(w, h, px, py, pz, ry, mat) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || wallMat); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, H, 0, H / 2, -HZ, 0); wall(HX * 2, H, 0, H / 2, HZ, Math.PI);
    wall(HZ * 2, H, -HX, H / 2, 0, Math.PI / 2); wall(HZ * 2, H, HX, H / 2, 0, -Math.PI / 2);
    wall(HX * 2, 1.1, 0, 0.55, -HZ + 0.02, 0, panelMat); wall(HX * 2, 1.1, 0, 0.55, HZ - 0.02, Math.PI, panelMat);
    wall(HZ * 2, 1.1, -HX + 0.02, 0.55, 0, Math.PI / 2, panelMat); wall(HZ * 2, 1.1, HX - 0.02, 0.55, 0, -Math.PI / 2, panelMat);
    [1.1, H - 0.2].forEach(function (y) {
      [[HX * 2, 0.08, 0.08, 0, y, -HZ + 0.05], [HX * 2, 0.08, 0.08, 0, y, HZ - 0.05], [0.08, 0.08, HZ * 2, -HX + 0.05, y, 0], [0.08, 0.08, HZ * 2, HX - 0.05, y, 0]].forEach(function (d) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), gold); m.position.set(d[3], d[4], d[5]); g.add(m);
      });
    });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x08050f }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* ---------- mur du fond : égaliseur géant au-dessus de la cabine du DJ ---------- */
    var NBAR = 24, bars = [], barMat = [];
    var frame = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 - 3.4, 5.3, 0.1), gold); frame.position.set(0, 4.6, -HZ + 0.06); g.add(frame);
    var back = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 - 3.6, 5.1), new THREE.MeshBasicMaterial({ color: 0x06030c })); back.position.set(0, 4.6, -HZ + 0.12); g.add(back);
    var bw = (HX * 2 - 4.2) / NBAR;
    for (i = 0; i < NBAR; i++) {
      var mat = new THREE.MeshBasicMaterial({ color: 0xb98cff }); barMat.push(mat);
      var bar = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, 1, 0.08), mat);
      bar.position.set(-HX + 2.1 + (i + 0.5) * bw, 2.2, -HZ + 0.2); g.add(bar); bars.push(bar);
    }
    // enseigne
    var sc = mkCanvas(1024, 128), sx = sc.getContext('2d');
    sx.fillStyle = '#0c0618'; sx.fillRect(0, 0, 1024, 128); sx.strokeStyle = '#b98cff'; sx.lineWidth = 8; sx.shadowColor = '#b98cff'; sx.shadowBlur = 24; sx.strokeRect(8, 8, 1008, 112);
    sx.shadowBlur = 16; sx.fillStyle = '#f4e8ff'; sx.font = '900 66px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('♪  SALLE DE MUSIQUE  ♪', 512, 68, 940);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: mkTex(sc) })); sign.position.set(0, 7.0, -HZ + 0.1); g.add(sign);

    /* ---------- cabine du DJ : table, deux platines qui tournent, deux enceintes qui battent ---------- */
    var dark = new THREE.MeshStandardMaterial({ color: 0x15111c, roughness: 0.45, metalness: 0.35 });
    var DZ = -HZ + 2.0;
    var desk = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 1.3), dark); desk.position.set(0, 0.5, DZ); g.add(desk);
    var trim = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.06, 1.4), gold); trim.position.set(0, 1.02, DZ); g.add(trim);
    var discs = [];
    [-1.4, 1.4].forEach(function (x) {
      var pl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), new THREE.MeshStandardMaterial({ color: 0x090909, roughness: 0.3, metalness: 0.6 })); pl.position.set(x, 1.08, DZ); g.add(pl);
      var lab = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 18), new THREE.MeshBasicMaterial({ color: 0xb98cff })); lab.position.set(x, 1.1, DZ); g.add(lab);
      var tick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff })); tick.position.set(x, 1.115, DZ); g.add(tick);
      discs.push([pl, lab, tick]);
    });
    var mixer = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.9), dark); mixer.position.set(0, 1.07, DZ); g.add(mixer);
    var knobs = [];
    for (i = 0; i < 4; i++) { var kn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: 0xffd36a })); kn.position.set(-0.24 + i * 0.16, 1.15, DZ); g.add(kn); knobs.push(kn); }
    var woofers = [];
    [-4.6, 4.6].forEach(function (x) {
      var sp = new THREE.Mesh(new THREE.BoxGeometry(1.3, 3.0, 1.2), dark); sp.position.set(x, 1.5, DZ); g.add(sp);
      [[0.95, 0.45], [2.15, 0.3]].forEach(function (c) {
        var w = new THREE.Mesh(new THREE.CylinderGeometry(c[1], c[1], 0.1, 24), new THREE.MeshStandardMaterial({ color: 0x1b1822, roughness: 0.5, metalness: 0.5 })); w.rotation.x = Math.PI / 2; w.position.set(x, c[0] + 0.1, DZ + 0.63); g.add(w);
        var cone = new THREE.Mesh(new THREE.SphereGeometry(c[1] * 0.7, 14, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a2e80 })); cone.rotation.x = Math.PI / 2; cone.position.set(x, c[0] + 0.1, DZ + 0.69); g.add(cone);
        woofers.push({ m: cone, z: DZ + 0.69, big: c[1] > 0.4 });
      });
    });

    /* ---------- boule à facettes et bandeaux lumineux aux murs ---------- */
    var ballTex = (function () {
      var c = mkCanvas(256, 128), x = c.getContext('2d'), a, b;
      for (a = 0; a < 16; a++) for (b = 0; b < 8; b++) { var v = 140 + ((a * 37 + b * 91) % 100); x.fillStyle = 'rgb(' + v + ',' + v + ',' + Math.min(255, v + 25) + ')'; x.fillRect(a * 16, b * 16, 15, 15); }
      return mkTex(c);
    })();
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.2, metalness: 0.9 })); ball.position.set(0, H - 1.6, 0); g.add(ball);
    var chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), gold); chain.position.set(0, H - 0.6, 0); g.add(chain);
    // faisceaux : de longs cônes de lumière qui partent de la boule, tournent avec elle et changent de couleur
    var bgc = mkCanvas(4, 64), bgx = bgc.getContext('2d'), bgg = bgx.createLinearGradient(0, 0, 0, 64);
    bgg.addColorStop(0, 'rgba(255,255,255,0.75)'); bgg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); bgg.addColorStop(1, 'rgba(255,255,255,0)'); bgx.fillStyle = bgg; bgx.fillRect(0, 0, 4, 64);
    var beamTex = mkTex(bgc), beams = new THREE.Group(), beamMats = [], NBEAM = low ? 8 : 16;
    beams.position.set(0, H - 1.6, 0); g.add(beams);
    for (i = 0; i < NBEAM; i++) {
      var bg = new THREE.CylinderGeometry(0.03, 0.9, 14, 12, 1, true); bg.translate(0, -7, 0);
      var bm = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xb98cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.5 });
      var piv = new THREE.Group(), bmesh = new THREE.Mesh(bg, bm);
      piv.rotation.y = i / NBEAM * TAU; bmesh.rotation.z = 0.35 + (i % 4) * 0.28; piv.add(bmesh); beams.add(piv); beamMats.push(bm);
    }
    var wallLeds = [];
    [-1, 1].forEach(function (sd) {
      for (i = 0; i < 6; i++) {
        var m = new THREE.MeshBasicMaterial({ color: 0xb98cff }), led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.6, 0.5), m);
        led.position.set(sd * (HX - 0.1), 3.6, -HZ + 3.4 + i * 3.7); g.add(led); wallLeds.push({ m: m, i: i });
      }
    });
    var ceilRing = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.07, 8, 64), new THREE.MeshBasicMaterial({ color: 0xb98cff })); ceilRing.rotation.x = Math.PI / 2; ceilRing.position.y = H - 0.15; g.add(ceilRing);

    /* ---------- éclairage ---------- */
    g.add(new THREE.AmbientLight(0x8f7fc0, 0.75));
    var key = new THREE.DirectionalLight(0xf0e6ff, 0.35); key.position.set(3, 7, 6); g.add(key);
    var spotA = null, spotB = null;
    if (!low) {
      spotA = new THREE.PointLight(0xb98cff, 1.1, 16); spotA.position.set(-6, 5, 0); g.add(spotA);
      spotB = new THREE.PointLight(0x6ad0ff, 1.1, 16); spotB.position.set(6, 5, 0); g.add(spotB);
    }

    // porte de retour vers le hall
    world.addDoor(room, { x: 0, z: HZ - 0.02, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xb98cff, target: 'hall', theme: 'exitMusique' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) {
      return w.touch ? 'Joystick : marcher · le sol s\'allume au rythme de la musique'
        : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · le sol et les lumières suivent la musique' + (w.full ? ' · Échap : quitter' : ' · clique-glisse : regarder');
    };

    /* ---------- vie de la salle : tout suit les niveaux de la musique ---------- */
    var bands = new Array(NB), sm = new Array(NB), pk = 0.05, sil = 1, clock = 0, frame2 = 0, bass = 0;
    for (i = 0; i < NB; i++) { bands[i] = 0; sm[i] = 0; }
    var c1 = new THREE.Color(), c2 = new THREE.Color(), cLight = new THREE.Color(0xd9d2c5), cDark = new THREE.Color(0x25202a);
    function neon(h, l, out) { return out.setHSL(((h % 1) + 1) % 1, 1, l); }
    room.update = function (dt) {
      clock += dt; var hue0 = clock * 0.05;
      // niveaux : lus sur la musique (F.audio.levels) ; sans son, une vague lente qui garde le sol vivant
      var raw = F.audio && F.audio.levels ? F.audio.levels(bands, NB) : 0, mx = 0;
      for (i = 0; i < NB; i++) if (bands[i] > mx) mx = bands[i];
      pk = Math.max(pk * 0.997, mx, 0.03);                                 // réglage automatique : le volume du joueur ne change pas l'effet
      var playing = raw > 0.012;
      sil += ((playing ? 0 : 1) - sil) * Math.min(1, dt * 1.5);
      for (i = 0; i < NB; i++) {
        var tgt = playing ? Math.min(1, bands[i] / pk) : 0;
        var idle = 0.16 + 0.12 * Math.sin(clock * 1.2 - i * 0.55);
        var v = tgt * (1 - sil) + idle * sil;
        sm[i] += (v - sm[i]) * Math.min(1, dt * (v > sm[i] ? 18 : 6));      // montée vive, descente douce
      }
      bass = (sm[0] + sm[1] + sm[2]) / 3;
      // une image sur deux : le sol (jusqu'à 576 dalles) n'a pas besoin d'être plus fluide
      frame2++;
      if (frame2 % 2 === 0) {
        for (k = 0; k < N; k++) {
          var t = tiles[k], lv = sm[t.band] * (0.8 + 0.35 * Math.sin(clock * 2.1 + t.d * 0.7 - t.ang * 2));   // petite onde qui part du centre
          lv = Math.max(0, Math.min(1, lv));
          neon(hue0 + t.band / NB * 0.85 + t.d * 0.02 + (t.kind ? 0.08 : 0), 0.5, c1);
          (t.kind ? glowB : glowA).setColorAt(t.k2, c2.copy(c1).multiplyScalar((t.kind ? 0.45 : 0.55) + lv * 1.0));
          glass.setColorAt(k, c2.copy(c1).multiplyScalar(0.1 + lv * 0.3));
        }
        glowA.instanceColor.needsUpdate = true; glowB.instanceColor.needsUpdate = true; glass.instanceColor.needsUpdate = true;
      }
      // mur d'égaliseur
      for (i = 0; i < NBAR; i++) {
        var b = sm[Math.min(NB - 1, Math.floor(i / NBAR * NB))], hh = 0.12 + b * 4.7;
        bars[i].scale.y = hh; bars[i].position.y = 2.05 + hh / 2;
        neon(hue0b(i), 0.45 + b * 0.2, barMat[i].color);
      }
      function hue0b(n) { return clock * 0.05 + n / NBAR * 0.85; }
      // enceintes, platines, boule, bandeaux
      var pulse = 1 + bass * 0.22;
      woofers.forEach(function (w) { w.m.scale.set(1, 1, 1 + (w.big ? bass : sm[8]) * 0.8); w.m.position.z = w.z + (w.big ? bass : sm[8]) * 0.03; });
      discs.forEach(function (d, n) { d[0].rotation.y += dt * 2.4 * (n ? -1 : 1); d[1].rotation.y = d[0].rotation.y; d[2].rotation.y = d[0].rotation.y; neon(hue0b(n * 12) , 0.55, d[1].material.color); });
      knobs.forEach(function (kb, n) { kb.position.y = 1.15 + sm[2 + n * 3] * 0.05; });
      ball.rotation.y += dt * 0.5; ball.scale.setScalar(pulse * 0.97);
      beams.rotation.y += dt * 0.45;
      beamMats.forEach(function (bm, n) { neon(hue0b(n * 2), 0.55, bm.color); bm.opacity = 0.28 + bass * 0.5 + 0.12 * Math.sin(clock * 3 + n); });
      wallLeds.forEach(function (l) { neon(hue0b(l.i * 3), 0.25 + sm[(l.i * 2) % NB] * 0.4, l.m.color); });
      neon(hue0b(0), 0.4 + bass * 0.25, ceilRing.material.color); ceilRing.scale.setScalar(1 + bass * 0.05);
      if (spotA) {
        spotA.color.setHSL((hue0 + 0.0) % 1, 1, 0.55); spotB.color.setHSL((hue0 + 0.5) % 1, 1, 0.55);
        spotA.position.set(-6 * Math.cos(clock * 0.6), 5, 6 * Math.sin(clock * 0.6)); spotB.position.set(6 * Math.cos(clock * 0.6), 5, -6 * Math.sin(clock * 0.6));
        spotA.intensity = 0.7 + bass * 1.4; spotB.intensity = 0.7 + bass * 1.4;
      }
    };
    room.dispose = function () { glowGeo.dispose(); glassGeo.dispose(); glowA.dispose(); glowB.dispose(); glass.dispose(); };
    return room;
  }
  F.registerRoom('musique', createMusicRoom);
})();
