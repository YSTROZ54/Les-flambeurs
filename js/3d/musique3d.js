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

    /* ---------- mur du fond : l'enseigne (l'égaliseur et la cabine du DJ ont laissé la place au groupe sur scène) ---------- */
    var NBAR = 24, bars = [], barMat = [];
    // enseigne
    var sc = mkCanvas(1024, 128), sx = sc.getContext('2d');
    sx.fillStyle = '#0c0618'; sx.fillRect(0, 0, 1024, 128); sx.strokeStyle = '#b98cff'; sx.lineWidth = 8; sx.shadowColor = '#b98cff'; sx.shadowBlur = 24; sx.strokeRect(8, 8, 1008, 112);
    sx.shadowBlur = 16; sx.fillStyle = '#f4e8ff'; sx.font = '900 66px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('♪  SALLE DE MUSIQUE  ♪', 512, 68, 940);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: mkTex(sc) })); sign.position.set(0, 7.0, -HZ + 0.1); g.add(sign);
    // crédit du modèle du groupe (licence CC BY 4.0) : caché derrière l'enseigne, tourné vers le mur, donc jamais visible
    var crc = mkCanvas(1024, 64), crx = crc.getContext('2d'); crx.fillStyle = '#0c0618'; crx.fillRect(0, 0, 1024, 64); crx.fillStyle = '#d9c8ff'; crx.font = '600 26px ' + SERIF; crx.textAlign = 'center'; crx.textBaseline = 'middle';
    crx.fillText('Groupe : « Pomme Play With Marmots\'Band » par TG13730 · Sketchfab · licence CC BY 4.0', 512, 33, 1000);
    var credit = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.47), new THREE.MeshBasicMaterial({ map: mkTex(crc) })); credit.rotation.y = Math.PI; credit.position.set(0, 7.0, -HZ + 0.05); g.add(credit);

    /* ---------- sur scène : le groupe de marmottes (modèle « Pomme Play With Marmots'Band »), qui joue en boucle ---------- */
    var discs = [], knobs = [], woofers = [], band = null, bandMixer = null;
    var stageLight = new THREE.DirectionalLight(0xffffff, 0.85); stageLight.position.set(0, 6.5, -HZ + 10); stageLight.target.position.set(0, 1.5, -HZ + 1); g.add(stageLight); g.add(stageLight.target);
    if (THREE.GLTFLoader) {
      try {
        new THREE.GLTFLoader().load('assets/musique/groupe.glb?v=2', function (gl) {
          band = gl.scene;
          band.traverse(function (o) { if (o.isMesh) o.frustumCulled = false; });          // personnages animés : jamais coupés au bord de l'écran
          band.updateMatrixWorld(true);
          // taille réelle : les objets fixes + les os des personnages (la boîte d'un personnage animé est celle de sa pose de repos, trompeuse)
          var box = new THREE.Box3(), bp = new THREE.Vector3(), sz = new THREE.Vector3();
          band.traverse(function (o) { if (o.isMesh && !o.isSkinnedMesh) box.union(new THREE.Box3().setFromObject(o)); if (o.isBone) { o.getWorldPosition(bp); box.expandByPoint(bp); } });
          box.getSize(sz);
          var k = Math.min(12 / Math.max(sz.x, 0.01), 6.2 / Math.max(sz.z, 0.01), 5.2 / Math.max(sz.y, 0.01));
          band.scale.setScalar(k);
          band.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, (-HZ + 0.5) - box.min.z * k);
          g.add(band);
          if (gl.animations && gl.animations.length) { bandMixer = new THREE.AnimationMixer(band); gl.animations.forEach(function (cl) { bandMixer.clipAction(cl).play(); }); }
          // on ne traverse pas la scène : une rangée d'obstacles devant et sur les côtés
          var x0 = -sz.x * k / 2, x1 = sz.x * k / 2, zb = -HZ + 0.5, zf = zb + sz.z * k, xx, zz;
          for (xx = x0; xx <= x1 + 0.01; xx += 0.7) room.colliders.push({ x: xx, z: zf, r: 0.45 });
          for (zz = zb; zz <= zf; zz += 0.7) { room.colliders.push({ x: x0, z: zz, r: 0.45 }); room.colliders.push({ x: x1, z: zz, r: 0.45 }); }
        }, undefined, function () { /* pas de modèle : la scène reste vide */ });
      } catch (e) { /* idem */ }
    }

    /* ---------- boule à facettes et bandeaux lumineux aux murs ---------- */
    // la boule : un noyau sombre recouvert de vraies facettes (petits carrés lumineux, chacun sa couleur qui suit la musique) ;
    // de chaque facette tournée vers le bas part un faisceau, dans la direction exacte de la facette : il tourne et change de couleur avec elle
    var BR = 0.8, ball = new THREE.Group(); ball.position.set(0, H - 1.6, 0); g.add(ball);
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(BR * 0.97, 24, 16), new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.3, metalness: 0.9 })));
    var facets = [], NR = low ? 9 : 14, NSEG = low ? 14 : 22;
    for (i = 0; i < NR; i++) {
      var lat = -Math.PI / 2 + (i + 0.5) / NR * Math.PI, nseg = Math.max(4, Math.round(NSEG * Math.cos(lat)));
      for (var jj = 0; jj < nseg; jj++) {
        var lon = (jj + (i % 2) * 0.5) / nseg * TAU;
        facets.push({ n: new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)), ph: Math.random() * TAU, sz: Math.min(TAU * BR * Math.cos(lat) / nseg, Math.PI * BR / NR) * 0.88 });
      }
    }
    var facetMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), facets.length);
    var fq = new THREE.Quaternion(), fm = new THREE.Matrix4(), fpos = new THREE.Vector3(), fsc = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
    facets.forEach(function (f, k) {
      fq.setFromUnitVectors(zAxis, f.n); fpos.copy(f.n).multiplyScalar(BR); fsc.set(f.sz, f.sz, 1); fm.compose(fpos, fq, fsc); facetMesh.setMatrixAt(k, fm); facetMesh.setColorAt(k, new THREE.Color(0xffffff));
    });
    facetMesh.frustumCulled = false; ball.add(facetMesh);
    function facetHue(k) { return clock * 0.05 + ((k * 0.618034) % 1) * 0.85; }
    var BVS = 'varying float vT; varying vec3 vN; varying vec3 vV; void main() { vT = clamp(-position.y / 11.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
    var BFS = 'uniform vec3 uColor; uniform float uOp; varying float vT; varying vec3 vN; varying vec3 vV; void main() { float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float g = pow(1.0 - vT, 1.3) * smoothstep(0.0, 0.03, vT); gl_FragColor = vec4(uColor, e * g * uOp); }';
    var beamMats = [], beamFacets = [], beamGeo = new THREE.CylinderGeometry(0.015, 0.34, 11, 14, 1, true); beamGeo.translate(0, -5.5, 0);
    var down = new THREE.Vector3(0, -1, 0), cand = [];
    facets.forEach(function (f, k) { if (f.n.y < -0.05 && f.n.y > -0.85) cand.push(k); });
    var NBEAM = Math.min(cand.length, low ? 10 : 24);
    for (i = 0; i < NBEAM; i++) {
      var fk = cand[Math.floor(i * cand.length / NBEAM)], bm = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(0xb98cff) }, uOp: { value: 0.6 } }, vertexShader: BVS, fragmentShader: BFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      var bmesh = new THREE.Mesh(beamGeo, bm); bmesh.position.copy(facets[fk].n).multiplyScalar(BR); bmesh.quaternion.setFromUnitVectors(down, facets[fk].n); bmesh.frustumCulled = false;
      ball.add(bmesh); beamMats.push(bm); beamFacets.push(fk);
    }
    var chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), gold); chain.position.set(0, H - 0.6, 0); g.add(chain);
    var wallLeds = [];
    [-1, 1].forEach(function (sd) {
      for (i = 0; i < 6; i++) {
        var m = new THREE.MeshBasicMaterial({ color: 0xb98cff }), led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.6, 0.5), m);
        led.position.set(sd * (HX - 0.1), 3.6, -HZ + 3.4 + i * 3.7); g.add(led); wallLeds.push({ m: m, i: i });
      }
    });

    /* ---------- éclairage ---------- */
    g.add(new THREE.AmbientLight(0x8f7fc0, 0.75));
    var haloTex = (function () { var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c); })();
    var key = new THREE.DirectionalLight(0xf0e6ff, 0.35); key.position.set(3, 7, 6); g.add(key);
    var spotA = null, spotB = null;
    if (!low) {
      spotA = new THREE.PointLight(0xb98cff, 1.1, 16); spotA.position.set(-6, 5, 0); g.add(spotA);
      spotB = new THREE.PointLight(0x6ad0ff, 1.1, 16); spotB.position.set(6, 5, 0); g.add(spotB);
    }

    // porte de retour vers le hall
    world.addDoor(room, { x: 0, z: HZ - 0.02, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xb98cff, target: 'hall', theme: 'exitMusique', noSill: true });
    var doorLamps = [];
    [-1, 1].forEach(function (sd) {
      var lx = sd * 1.85, lz = HZ - 0.45;
      var lg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.08, 16), gold); lg.position.set(lx, 0.04, lz); g.add(lg);
      var lp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.3, 10), gold); lp.position.set(lx, 0.72, lz); g.add(lp);
      var lm = new THREE.MeshBasicMaterial({ color: 0xb98cff }), lb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), lm); lb.position.set(lx, 1.5, lz); g.add(lb);
      var lc = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.15, 16), gold); lc.position.set(lx, 1.72, lz); g.add(lc);
      var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xb98cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(1.6, 1.6, 1); halo.position.set(lx, 1.5, lz); g.add(halo);
      doorLamps.push({ m: lm, h: halo, i: sd > 0 ? 1 : 0 });
    });
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
      for (i = 0; i < bars.length; i++) {
        var b = sm[Math.min(NB - 1, Math.floor(i / NBAR * NB))], hh = 0.12 + b * 4.7;
        bars[i].scale.y = hh; bars[i].position.y = 2.05 + hh / 2;
        neon(hue0b(i), 0.45 + b * 0.2, barMat[i].color);
      }
      function hue0b(n) { return clock * 0.05 + n / NBAR * 0.85; }
      if (bandMixer) bandMixer.update(dt);                                                  // le groupe joue
      // enceintes, platines, boule, bandeaux
      var pulse = 1 + bass * 0.22;
      woofers.forEach(function (w) { w.m.scale.set(1, 1, 1 + (w.big ? bass : sm[8]) * 0.8); w.m.position.z = w.z + (w.big ? bass : sm[8]) * 0.03; });
      discs.forEach(function (d, n) { d[0].rotation.y += dt * 2.4 * (n ? -1 : 1); d[1].rotation.y = d[0].rotation.y; d[2].rotation.y = d[0].rotation.y; neon(hue0b(n * 12) , 0.55, d[1].material.color); });
      knobs.forEach(function (kb, n) { kb.position.y = 1.15 + sm[2 + n * 3] * 0.05; });
      ball.rotation.y += dt * 0.5; ball.scale.setScalar(pulse * 0.97);                         // facettes et faisceaux sont dans le même groupe : ils tournent d'un seul bloc
      var fcol = ball._fc || (ball._fc = new THREE.Color()), nf = facets.length, k2;
      for (k2 = 0; k2 < nf; k2++) { var tw = 0.5 + 0.5 * Math.sin(clock * 3.2 + facets[k2].ph); neon(facetHue(k2), 0.22 + 0.3 * Math.min(1, tw * (0.5 + bass * 0.9 + sm[(k2 * 3) % NB] * 0.8)), fcol); facetMesh.setColorAt(k2, fcol); }
      beamMats.forEach(function (bm, n) { neon(facetHue(beamFacets[n]), 0.55, bm.uniforms.uColor.value); bm.uniforms.uOp.value = 0.5 + bass * 0.9; neon(facetHue(beamFacets[n]), 0.75, fcol); facetMesh.setColorAt(beamFacets[n], fcol); });
      if (facetMesh.instanceColor) facetMesh.instanceColor.needsUpdate = true;
      wallLeds.forEach(function (l) { neon(hue0b(l.i * 3), 0.25 + sm[(l.i * 2) % NB] * 0.4, l.m.color); });
            doorLamps.forEach(function (l) {                                                   // les lampes de la porte suivent la musique, une de chaque côté
        var lv = sm[l.i ? 5 : 2], mm = hue0b(l.i * 8 + 3);
        neon(mm, 0.35 + lv * 0.3, l.m.color); l.h.material.color.copy(l.m.color); l.h.material.opacity = 0.35 + lv * 0.65; l.h.scale.setScalar(1.2 + lv * 1.3);
      });
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
