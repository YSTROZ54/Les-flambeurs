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
    { x: -7.5, z: -HZ, nx: 0, nz: 1, label: '🎰 MACHINES', sub: 'À SOUS', color: 0xffb347, target: 'slots', theme: 'slots' },
    { x: -2.5, z: -HZ, nx: 0, nz: 1, label: '♠️ POKER', sub: 'TEXAS HOLD\'EM', color: 0x7ee0a0, target: 'pokerroom', theme: 'poker' },
    { x: 2.5, z: -HZ, nx: 0, nz: 1, label: '🃏 BLACKJACK', sub: 'CONTRE LE CROUPIER', color: 0xff8a8a, target: 'blackjack', theme: 'blackjack' },
    { x: 7.5, z: -HZ, nx: 0, nz: 1, label: '🚀 FUSÉE CRASH', sub: 'ÉJECTE-TOI À TEMPS', color: 0x9ab8ff, target: 'crash', theme: 'crash' },
    // mur de gauche (regarde vers +x)
    { x: -HX, z: -5, nx: 1, nz: 0, label: '💎 CHAMBRE FORTE', sub: 'ÉVITE LES BOMBES', color: 0x8ae6c8, target: 'mines', theme: 'mines' },
    { x: -HX, z: 0, nx: 1, nz: 0, label: '🥤 GOBELETS', sub: 'TROUVE LA BILLE', color: 0xffe08a, target: 'cups', theme: 'cups' },
    { x: -HX, z: 5, nx: 1, nz: 0, label: '🎟️ GRATTAGE', sub: 'TICKETS GAGNANTS', color: 0xffc0e0, target: 'scratch', theme: 'scratch' },
    // mur de droite (regarde vers -x)
    { x: HX, z: -5, nx: -1, nz: 0, label: '🎵 BLIND TEST', sub: 'DEVINE LA MUSIQUE', color: 0xd9a0ff, target: 'blindtest', theme: 'blindtest' },
    { x: HX, z: 0, nx: -1, nz: 0, label: '🛍️ BOUTIQUE', sub: '6 VENDEURS · SKINS', color: 0xffd24a, target: 'shop3d', theme: 'shop' },
    { x: HX, z: 5, nx: -1, nz: 0, label: '🏦 BANQUE', sub: 'VIREMENTS & COFFRE', color: 0xa0d8ff, target: 'bank', theme: 'bank' },
    // mur d'entrée (regarde vers -z), à côté de l'enseigne
    { x: 8.4, z: HZ, nx: 0, nz: -1, label: '🏇 COURSES', sub: 'PARIE SUR TON CHEVAL', color: 0x7fd1ff, target: 'horses', theme: 'horses' }
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

    // Affiches lumineuses : chacune est dans un tube néon (filament presque blanc, lueur colorée qui s'étale autour sur le mur),
    // devant un panneau sombre. Un panneau se pose sur un mur par son vecteur « vers l'intérieur » (nx, nz) ; along = position le long du mur
    // (x local : à droite quand on regarde le mur), ay = hauteur du centre. placeholder : dessin affiché tant que l'image n'existe pas.
    var WALL = { fond: { x: 0, z: -HZ, nx: 0, nz: 1 }, gauche: { x: -HX, z: 0, nx: 1, nz: 0 }, droite: { x: HX, z: 0, nx: -1, nz: 0 }, entree: { x: 0, z: HZ, nx: 0, nz: -1 } };
    function neon(mur, along, ay, fichier, bw, bh, hex, placeholder) {
      var col = new THREE.Color(hex), rgb = 'rgb(' + Math.round(col.r * 255) + ',' + Math.round(col.g * 255) + ',' + Math.round(col.b * 255) + ')';
      var chaud = col.clone().lerp(new THREE.Color(0xffffff), 0.6);          // le cœur du tube est presque blanc
      var pad = 0.3, pw = bw + pad * 2, ph = bh + pad * 2, inset = 0.09, tw = 0.06;
      var pg = new THREE.Group(); pg.position.set(mur.x, 0, mur.z); pg.rotation.y = Math.atan2(mur.nx, mur.nz); g.add(pg);   // z local = vers l'intérieur
      function plan(w, h, mat, z, x) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x === undefined ? along : x, ay, z); pg.add(m); return m; }
      plan(pw, ph, new THREE.MeshBasicMaterial({ color: 0x0c0508 }), 0.054);
      // lueur : on dessine seulement le contour du tube, avec plusieurs flous de plus en plus serrés (rien dans le rectangle)
      var m = 1.0, tot = pw + m * 2, tot2 = ph + m * 2, W = 1024, H = Math.round(W * tot2 / tot), sc = W / tot;
      var gc = mkCanvas(W, H), gx = gc.getContext('2d');
      function tour() {
        var x = (m + inset) * sc, y = (m + inset) * sc, w2 = (pw - inset * 2) * sc, h2 = (ph - inset * 2) * sc, r = 0.1 * sc;
        gx.beginPath(); gx.moveTo(x + r, y); gx.lineTo(x + w2 - r, y); gx.quadraticCurveTo(x + w2, y, x + w2, y + r);
        gx.lineTo(x + w2, y + h2 - r); gx.quadraticCurveTo(x + w2, y + h2, x + w2 - r, y + h2); gx.lineTo(x + r, y + h2);
        gx.quadraticCurveTo(x, y + h2, x, y + h2 - r); gx.lineTo(x, y + r); gx.quadraticCurveTo(x, y, x + r, y); gx.closePath();
      }
      gx.shadowColor = rgb; gx.strokeStyle = rgb; gx.lineJoin = 'round';
      [[100, 0.5, 1.6], [45, 0.7, 1.4], [18, 0.9, 1.2], [7, 1, 1]].forEach(function (p) {   // flou, opacité, épaisseur (en tubes)
        gx.globalAlpha = p[1]; gx.shadowBlur = p[0]; gx.lineWidth = tw * sc * p[2]; tour(); gx.stroke();
      });
      gx.globalAlpha = 1; gx.shadowBlur = 0;
      plan(tot, tot2, new THREE.MeshBasicMaterial({ map: mkTex(gc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.056);
      // le tube lui-même : quatre bandes nettes presque blanches, posées sur la lueur
      var tube = new THREE.MeshBasicMaterial({ color: chaud }), ox = pw / 2 - inset, oy = ph / 2 - inset;
      [[pw - inset * 2 + tw, tw, 0, oy], [pw - inset * 2 + tw, tw, 0, -oy], [tw, ph - inset * 2 + tw, ox, 0], [tw, ph - inset * 2 + tw, -ox, 0]].forEach(function (d) {
        var b = new THREE.Mesh(new THREE.PlaneGeometry(d[0], d[1]), tube); b.position.set(along + d[2], ay + d[3], 0.058); pg.add(b);
      });
      var mat = new THREE.MeshBasicMaterial(placeholder ? { map: mkTex(placeholder) } : { color: 0x24090f });   // sombre (ou le dessin provisoire) le temps que l'image arrive
      plan(bw, bh, mat, 0.062);
      if (fichier) new THREE.TextureLoader().load(fichier, function (t) {   // sans nom de fichier, le dessin reste l'affiche définitive
        t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
        mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true;
      }, undefined, function () { /* pas d'image : on garde le dessin provisoire */ });
    }

    // bannière du casino, en haut des trois murs qui ont des portes de jeu (au-dessus des enseignes de portes) : chacune annonce les jeux de son mur
    [['fond', 'banniere.jpg'], ['gauche', 'banniere-gauche.jpg'], ['droite', 'banniere-droite.jpg']].forEach(function (k) { neon(WALL[k[0]], 0, 5.75, 'icon/' + k[1] + '?v=2', 8.1, 2.7, 0xffb300); });

    // mur d'entrée (derrière le joueur au départ) : au milieu la double porte du cinéma de Tropi Stream (cinema3d.js), à gauche (en regardant le mur)
    // la bannière Tropi Stream, à droite l'affiche de la séance (dessinée ici, pas d'image à charger)
    neon(WALL.entree, -4.5, 4.2, 'icon/banniere-tropistream.jpg', 4.4, 2.475, 0xff7a1a);
    var soon = mkCanvas(1280, 720), sn = soon.getContext('2d');
    sn.fillStyle = '#12080f'; sn.fillRect(0, 0, 1280, 720);
    sn.textAlign = 'center'; sn.textBaseline = 'middle'; sn.shadowColor = '#ff7a1a'; sn.shadowBlur = 30; sn.fillStyle = '#ffb066';
    sn.font = '900 130px ' + SERIF; sn.fillText('À L\'AFFICHE', 640, 270, 1200);
    sn.shadowBlur = 0; sn.fillStyle = '#f8e7d0'; sn.font = '700 52px ' + MONO; sn.fillText('CINÉMA TROPI STREAM', 640, 440);
    sn.fillStyle = '#c98a55'; sn.font = '600 30px ' + MONO; sn.fillText('SALLE OUVERTE · ENTRE PAR LA PORTE', 640, 520);
    neon(WALL.entree, 4.5, 4.2, '', 4.4, 2.475, 0xff7a1a, soon);
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.8, h: 3.2, label: '🎬 CINÉMA', sub: 'TROPI STREAM · OUVERT', color: 0xff7a1a, target: 'cinema', theme: 'cinema' });

    // colonnes aux coins
    var colMat = new THREE.MeshStandardMaterial({ color: 0x1a0f18, roughness: 0.55, metalness: 0.2 });
    [[-9.7, -7.6], [9.7, -7.6], [-9.7, 7.6], [9.7, 7.6]].forEach(function (p) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 8, 18), colMat); c.position.set(p[0], 4, p[1]); g.add(c);
      [0.3, 7.7].forEach(function (y) { var r = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), gold); r.rotation.x = Math.PI / 2; r.position.set(p[0], y, p[1]); g.add(r); });
      room.colliders.push({ x: p[0], z: p[1], r: 0.9 });
    });

    // fontaine centrale
    var marble = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.25, metalness: 0.1 });
    var base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.56, 32), marble);   // dessus à 0,56 : à 0,60 (niveau de l'eau) il scintillait en rayons blancs (z-fighting)
    base.position.y = 0.28; g.add(base);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.07, 8, 40), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; g.add(rim);
    // vraie eau : shader animé (vagues qui bougent, reflet du ciel plus fort en rasant, éclats de lumière, caustiques au fond,
    // eau plus claire près du bord et plus profonde au centre, écume là où les rideaux d'eau retombent). Un seul temps partagé.
    var waterT = { value: 0 };
    var WATER_VS = 'varying vec3 vW; varying vec2 vUv; void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }';
    var WATER_FS = [
      'uniform float uT; uniform float uRad; uniform float uFoam; varying vec3 vW; varying vec2 vUv;',
      'float hgt(vec2 p) { float t = uT;',
      '  return sin(p.x * 3.1 + t * 1.3) * 0.5 + sin(p.y * 2.7 - t * 1.1) * 0.5 + sin((p.x + p.y) * 4.3 + t * 1.9) * 0.35 + sin((p.x - p.y) * 5.7 - t * 1.6) * 0.25 + sin(length(p) * 9.0 - t * 2.4) * 0.3; }',
      'void main() {',
      '  vec2 p = vW.xz; float e = 0.03;',
      '  float dx = hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0)), dz = hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e));',
      '  vec3 n = normalize(vec3(-dx * 0.55, 1.0, -dz * 0.55));',
      '  vec3 v = normalize(cameraPosition - vW);',
      '  float rr = length(vUv - 0.5) * 2.0, dist = rr * uRad;',
      '  vec3 deep = vec3(0.02, 0.22, 0.42), shallow = vec3(0.18, 0.72, 0.82);',
      '  vec3 col = mix(shallow, deep, smoothstep(1.0, 0.15, rr));',
      '  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);',
      '  col = mix(col, vec3(0.66, 0.86, 1.0), fres * 0.7);',
      '  float cs = abs(sin(p.x * 8.0 + hgt(p) * 1.6 + uT * 0.9) * sin(p.y * 8.0 + hgt(p * 1.3) * 1.6 - uT * 0.7));',
      '  col += vec3(0.5, 0.95, 1.0) * pow(cs, 7.0) * 0.45 * (1.0 - fres);',
      '  vec3 L = normalize(vec3(0.35, 1.0, 0.45));',
      '  col += vec3(1.0, 0.97, 0.88) * pow(max(dot(reflect(-L, n), v), 0.0), 120.0) * 1.4;',
      '  col += vec3(1.0, 0.8, 0.5) * pow(max(dot(reflect(-normalize(vec3(-0.5, 0.8, -0.2)), n), v), 0.0), 80.0) * 0.6;',
      '  if (uFoam > 0.0) { float f = smoothstep(0.1, 0.0, abs(dist - uFoam)) * (0.55 + 0.45 * sin(uT * 4.0 + atan(vUv.y - 0.5, vUv.x - 0.5) * 14.0)); col = mix(col, vec3(0.95, 0.99, 1.0), f * 0.8); }',
      '  gl_FragColor = vec4(col, 0.94);',
      '}'].join('\n');
    function waterMat(rad, foamR) {
      return new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: { uT: waterT, uRad: { value: rad }, uFoam: { value: foamR } } });
    }
    var bed = new THREE.Mesh(new THREE.CircleGeometry(1.66, 48), new THREE.MeshBasicMaterial({ color: 0x062a44 }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = 0.42; g.add(bed);
    var water = new THREE.Mesh(new THREE.CircleGeometry(1.66, 64), waterMat(1.66, 1.06));      // l'écume marque la chute du rideau d'eau (rayon ≈ 1,06)
    water.rotation.x = -Math.PI / 2; water.position.y = 0.62; g.add(water);   // 2 cm au-dessus du rebord de marbre : plus aucune surface au même niveau
    var ripples = [0, 1, 2].map(function (k) {
      var rp = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 48), new THREE.MeshBasicMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      rp.rotation.x = -Math.PI / 2; rp.position.y = 0.645; g.add(rp); return rp;
    });
    // fontaine à trois étages : colonne tournée en marbre, deux vasques, rideaux d'eau qui tombent d'une vasque à l'autre, jets et gouttes
    var marbleD = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide });
    function lathe(pts, mat) {
      var m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 40), mat); g.add(m); return m;
    }
    function ringAt(r, y, tube) { var t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 40), gold); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
    var step = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.25, 0.16, 40), marble); step.position.y = 0.08; g.add(step);
    lathe([[0.001, 0.6], [0.46, 0.6], [0.5, 0.68], [0.36, 0.8], [0.22, 0.92], [0.17, 1.06], [0.28, 1.16], [0.32, 1.26], [0.2, 1.38], [0.14, 1.48], [0.001, 1.5]], marbleD);   // pied de la colonne
    lathe([[0.001, 1.42], [0.3, 1.44], [0.62, 1.52], [0.9, 1.66], [1.0, 1.8], [0.94, 1.8], [0.84, 1.72], [0.5, 1.62], [0.001, 1.6]], marbleD);                              // vasque du milieu
    lathe([[0.001, 1.58], [0.17, 1.62], [0.22, 1.72], [0.13, 1.84], [0.17, 1.94], [0.11, 2.02], [0.001, 2.04]], marbleD);                                                     // tige
    lathe([[0.001, 1.98], [0.16, 2.0], [0.36, 2.06], [0.52, 2.2], [0.47, 2.2], [0.38, 2.13], [0.001, 2.08]], marbleD);                                                        // vasque du haut
    ringAt(0.97, 1.8, 0.03); ringAt(0.5, 2.2, 0.025); ringAt(0.2, 1.0, 0.035); ringAt(0.3, 1.3, 0.03); ringAt(0.17, 1.9, 0.03);
    [[0.84, 1.72, 0.53], [0.38, 2.14, 0]].forEach(function (v) {
      var w2 = new THREE.Mesh(new THREE.CircleGeometry(v[0], 40), waterMat(v[0], v[2])); w2.rotation.x = -Math.PI / 2; w2.position.y = v[1]; g.add(w2);
    });
    var fc2 = mkCanvas(64, 128), fx2 = fc2.getContext('2d'), fi;
    fx2.clearRect(0, 0, 64, 128);
    for (fi = 0; fi < 20; fi++) {
      var fxp = Math.random() * 64, fg = fx2.createLinearGradient(0, 0, 0, 128);
      fg.addColorStop(0, 'rgba(255,255,255,0)'); fg.addColorStop(0.3, 'rgba(255,255,255,' + (0.4 + Math.random() * 0.6) + ')'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      fx2.fillStyle = fg; fx2.fillRect(fxp, 0, 1 + Math.random() * 2.5, 128);
    }
    var falls = [];
    function fall(rTop, rBot, yTop, yBot, op) {          // rideau d'eau : cylindre ouvert, rayures qui défilent vers le bas
      var tx = new THREE.CanvasTexture(fc2); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(Math.round(rTop * 9), 1);
      var m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, yTop - yBot, 40, 1, true), new THREE.MeshBasicMaterial({ map: tx, color: 0xcdeeff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = (yTop + yBot) / 2; g.add(m); falls.push(tx);
    }
    fall(0.5, 0.56, 2.2, 1.74, 0.6); fall(1.0, 1.12, 1.8, 0.64, 0.5);
    if (!low) { var fl = new THREE.PointLight(0x58c8ff, 0.7, 7); fl.position.set(0, 1.1, 0); g.add(fl); }
    var DROPS = low ? 12 : 28, dropG = new THREE.SphereGeometry(0.035, 6, 5), dropM = new THREE.MeshBasicMaterial({ color: 0xd9f6ff, transparent: true, opacity: 0.85 });
    var drops = [], dk;
    for (dk = 0; dk < DROPS; dk++) { var dm = new THREE.Mesh(dropG, dropM); g.add(dm); drops.push({ m: dm, a: dk / DROPS * TAU * 3.1, ph: (dk * 0.37) % 1, sp: 0.8 + (dk % 5) * 0.12, up: dk % 2 === 0 }); }
    var arm = new THREE.Group(); arm.position.y = 3.15; g.add(arm);
    var ringMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.2, metalness: 0.8, emissive: 0x6a4500 });
    [0, 1, 2].forEach(function (k) { var r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 32), ringMat); r.rotation.set(k * 1.05, k * 0.7, 0); arm.add(r); });
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); arm.add(core);
    room.colliders.push({ x: 0, z: 0, r: 2.1 });

    // lustres : corps tourné en laiton, deux étages de bras courbes avec bougies, pampilles de cristal, chaîne jusqu'à la rosace du plafond
    var crystalMat = new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.78, emissive: 0x6a8aa0 });
    var candleMat = new THREE.MeshStandardMaterial({ color: 0xf6ecd2, roughness: 0.6 });
    var flameMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    var gl2 = mkCanvas(64, 64), gx2 = gl2.getContext('2d'), gg2 = gx2.createRadialGradient(32, 32, 0, 32, 32, 32);   // lueur ronde des flammes
    gg2.addColorStop(0, 'rgba(255,200,110,0.85)'); gg2.addColorStop(0.35, 'rgba(255,160,60,0.3)'); gg2.addColorStop(1, 'rgba(255,140,40,0)');
    gx2.fillStyle = gg2; gx2.fillRect(0, 0, 64, 64);
    var glowTex = new THREE.CanvasTexture(gl2);
    function armCurve(pts) {
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], 0); })), 18, 0.026, 6, false);
    }
    var armLowGeo = armCurve([[0.18, -0.2], [0.55, -0.44], [1.0, -0.4], [1.36, -0.06], [1.5, 0.1]]);
    var armHighGeo = armCurve([[0.1, 0.18], [0.38, 0.08], [0.7, 0.16], [0.92, 0.38]]);
    var cupGeo = new THREE.CylinderGeometry(0.075, 0.04, 0.07, 10), candleGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.17, 8);
    var flameGeo = new THREE.SphereGeometry(0.035, 8, 6), crystalGeo = new THREE.OctahedronGeometry(0.05, 0);
    var bodyGeo = new THREE.LatheGeometry([[0.001, -0.6], [0.07, -0.55], [0.13, -0.45], [0.08, -0.34], [0.17, -0.22], [0.21, -0.08], [0.16, 0.06], [0.08, 0.16], [0.1, 0.26], [0.05, 0.36], [0.001, 0.4]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 20);
    var crownGeo = new THREE.TorusGeometry(0.8, 0.018, 6, 40);
    function inst(geo, mat, n) { var m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; return m; }
    var chandeliers = [];
    function chandelier(x, z, s, y) {
      var c = new THREE.Group(), top = (8 - y) / s, dummy = new THREE.Object3D(), nA = low ? 6 : 8, k, a, tips = [];
      c.position.set(x, y, z); c.scale.set(s, s, s); g.add(c);
      c.add(new THREE.Mesh(bodyGeo, gold));
      var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8), gold); neck.position.y = 0.6; c.add(neck);
      var chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, top - 0.85, 6), gold); chain.position.y = 0.85 + (top - 0.85) / 2; c.add(chain);
      var rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.14, 24), gold); rosette.position.y = top - 0.05; c.add(rosette);
      var rcap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 24), gold); rcap.rotation.x = Math.PI / 2; rcap.position.y = top - 0.12; c.add(rcap);
      var armsL = inst(armLowGeo, gold, nA), armsH = inst(armHighGeo, gold, nA);
      var nT = nA * 2, cups = inst(cupGeo, gold, nT), candles = inst(candleGeo, candleMat, nT), flames = inst(flameGeo, flameMat, nT);
      for (k = 0; k < nA; k++) {
        a = k / nA * TAU;
        dummy.position.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, a, 0); dummy.updateMatrix(); armsL.setMatrixAt(k, dummy.matrix);
        dummy.rotation.set(0, a + TAU / nA / 2, 0); dummy.updateMatrix(); armsH.setMatrixAt(k, dummy.matrix);
        tips.push([1.5 * Math.cos(a), 0.1, -1.5 * Math.sin(a)]);                                  // bout du bras bas (rotation y : x -> (cos, -sin))
        tips.push([0.92 * Math.cos(a + TAU / nA / 2), 0.38, -0.92 * Math.sin(a + TAU / nA / 2)]);   // bout du bras haut
      }
      tips.forEach(function (t, i) {
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.position.set(t[0], t[1] + 0.02, t[2]); dummy.updateMatrix(); cups.setMatrixAt(i, dummy.matrix);
        dummy.position.set(t[0], t[1] + 0.135, t[2]); dummy.updateMatrix(); candles.setMatrixAt(i, dummy.matrix);
        dummy.position.set(t[0], t[1] + 0.265, t[2]); dummy.scale.set(1, 1.7, 1); dummy.updateMatrix(); flames.setMatrixAt(i, dummy.matrix);
      });
      [armsL, armsH, cups, candles, flames].forEach(function (m) { m.instanceMatrix.needsUpdate = true; c.add(m); });
      var gp = new Float32Array(tips.length * 3);                  // une lueur ronde autour de chaque flamme (points ronds, pas des sphères)
      tips.forEach(function (t, i) { gp[i * 3] = t[0]; gp[i * 3 + 1] = t[1] + 0.27; gp[i * 3 + 2] = t[2]; });
      var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      var glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 0.55 * s, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.frustumCulled = false; c.add(glow);
      var crown = new THREE.Mesh(crownGeo, gold); crown.rotation.x = Math.PI / 2; crown.position.y = -0.42; c.add(crown);
      if (!low) {                                                  // pampilles : une couronne autour de l'anneau, une sous chaque bras, une goutte sous le corps
        var cr = inst(crystalGeo, crystalMat, 16 + nA + 1), ci = 0;
        for (k = 0; k < 16; k++) { a = k / 16 * TAU; dummy.position.set(0.8 * Math.cos(a), -0.55, -0.8 * Math.sin(a)); dummy.rotation.set(0, a, 0); dummy.scale.set(1, 2.8, 1); dummy.updateMatrix(); cr.setMatrixAt(ci++, dummy.matrix); }
        for (k = 0; k < nA; k++) { a = k / nA * TAU; dummy.position.set(1.0 * Math.cos(a), -0.54, -1.0 * Math.sin(a)); dummy.rotation.set(0, a, 0); dummy.scale.set(1.3, 3.4, 1.3); dummy.updateMatrix(); cr.setMatrixAt(ci++, dummy.matrix); }
        dummy.position.set(0, -0.8, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(2.2, 5, 2.2); dummy.updateMatrix(); cr.setMatrixAt(ci++, dummy.matrix);
        cr.instanceMatrix.needsUpdate = true; c.add(cr);
      }
      chandeliers.push({ flames: flames, tips: tips, dummy: dummy });
    }
    chandelier(0, 0, 1.73, 6.2); chandelier(-6.5, 0, 1, 6.6); chandelier(6.5, 0, 1, 6.6);

    // éclairage
    g.add(new THREE.AmbientLight(0xa89cc8, 0.9));
    var key = new THREE.DirectionalLight(0xfff0d0, 0.5); key.position.set(3, 7, 6); g.add(key);
    var pl = new THREE.PointLight(0xffd9a0, 1.0, 26); pl.position.set(0, 6, 0); g.add(pl);
    if (!low) { var p2 = new THREE.PointLight(0xffb070, 0.6, 20); p2.position.set(0, 3, -7); g.add(p2); }

    // les portes
    DOORS.forEach(function (d) { world.addDoor(room, { x: d.x, z: d.z, nx: d.nx, nz: d.nz, w: 1.8, h: 2.9, label: d.label, sub: d.sub, color: d.color, target: d.target, theme: d.theme }); });

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
      hallT += dt; waterT.value = hallT;
      ripples.forEach(function (rp, k) { var f = (hallT * 0.3 + k / 3) % 1, rr = 0.25 + f * 1.4; rp.scale.set(rr, rr, 1); rp.material.opacity = 0.55 * (1 - f); });
      falls.forEach(function (tx) { tx.offset.y += dt * 1.1; });
      drops.forEach(function (d) {          // gouttes : du haut vers la vasque du milieu, puis de la vasque du milieu vers le bassin
        var f = (hallT * d.sp * 0.5 + d.ph) % 1, out, h, lo;
        if (d.up) { out = 0.08 + f * 0.72; h = 2.25 + 0.6 * 4 * f * (1 - f) - f * 0.55; lo = 1.72; }
        else { out = 1.0 + f * 0.5; h = 1.78 + 0.25 * 4 * f * (1 - f) - f * 1.16; lo = 0.64; }
        d.m.position.set(Math.cos(d.a) * out, Math.max(lo, h), Math.sin(d.a) * out);
      });
      if (!low) chandeliers.forEach(function (c, ci) {          // les flammes vacillent
        var dm = c.dummy, nf = c.tips.length, i;
        dm.rotation.set(0, 0, 0);
        for (i = 0; i < nf; i++) {
          var t = c.tips[i];
          dm.position.set(t[0], t[1] + 0.265, t[2]); dm.scale.set(1, 1.5 + 0.35 * Math.sin(hallT * 9 + i * 1.7 + ci), 1); dm.updateMatrix(); c.flames.setMatrixAt(i, dm.matrix);
        }
        c.flames.instanceMatrix.needsUpdate = true;
      });
    };
    return room;
  }
  F.registerRoom('hall', createHallRoom);
})();
