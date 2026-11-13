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
    { x: -HX, z: -5, nx: 1, nz: 0, label: '🎵 SALLE DE MUSIQUE', sub: 'SOL DE VERRE · LUMIÈRES', color: 0xb98cff, target: 'musique', theme: 'music' },
    { x: -HX, z: 0, nx: 1, nz: 0, label: '🛍️ TROPI SHOP', sub: '6 VENDEURS · SKINS', color: 0xffd24a, target: 'shop3d', theme: 'shop' },
    { x: -HX, z: 5, nx: 1, nz: 0, label: '🎮 MINI JEUX', sub: 'UNO · P4 · LUDO · PMU · COFFRES…', color: 0xffd400, target: 'minijeux', theme: 'minijeux' },   // salle d'UNO et de Puissance 4 (l'ancienne porte du grattage : ce jeu reste dans le menu 2D)
    // mur de droite (regarde vers -x)
    { x: HX, z: 0, nx: -1, nz: 0, label: '🎬 CINÉMA PREMIUM', sub: 'ÉCRAN GÉANT · FAUTEUILS CLUB', color: 0xffd36a, target: 'cinemapremium', theme: 'cinemapremium', noSign: true }   // la banque est maintenant l'appli Tropi Bank du téléphone
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
      return mat;
    }

    // bannière du casino, en haut des trois murs qui ont des portes de jeu (au-dessus des enseignes de portes) : chacune annonce les jeux de son mur
    [['fond', 'hall-fond.jpg']].forEach(function (k) { neon(WALL[k[0]], 0, 5.75, 'assets/bannieres/' + k[1] + '?v=4', 8.1, 2.7, 0xffb300); });
    (function () {                                       // mur de gauche : même bannière, mais elle annonce Mini jeux · Tropi Shop · Salle de musique
      var bc = mkCanvas(1620, 540), bmat = neon(WALL.gauche, 0, 5.75, '', 8.1, 2.7, 0xffb300, bc), bim = new Image();
      bim.onload = function () {
        var W = bim.naturalWidth, H = bim.naturalHeight; bc.width = W; bc.height = H; var x = bc.getContext('2d'); x.drawImage(bim, 0, 0);
        // couleur du fond de la plaque : moyenne des pixels sombres autour des deux lignes de texte
        var x0 = W * 0.3, x1 = W * 0.7, y0 = H * 0.468, y1 = H * 0.645, dd = x.getImageData(Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)).data, sr = 0, sgc = 0, sb = 0, nn = 0;
        for (var qi = 0; qi < dd.length; qi += 16) { if (dd[qi] + dd[qi + 1] + dd[qi + 2] < 150) { sr += dd[qi]; sgc += dd[qi + 1]; sb += dd[qi + 2]; nn++; } }
        var base = nn ? 'rgb(' + Math.round(sr / nn) + ',' + Math.round(sgc / nn) + ',' + Math.round(sb / nn) + ')' : '#3d0108';
        x.save(); x.shadowColor = base; x.shadowBlur = 28; x.fillStyle = base; x.fillRect(x0 + 14, y0 + 6, x1 - x0 - 28, y1 - y0 - 12); x.fillRect(x0 + 14, y0 + 6, x1 - x0 - 28, y1 - y0 - 12); x.restore();
        x.textAlign = 'center'; x.textBaseline = 'middle';
        var g1 = x.createLinearGradient(0, H * 0.48, 0, H * 0.54); g1.addColorStop(0, '#fff7e2'); g1.addColorStop(1, '#ead6a8'); x.fillStyle = g1; x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 6;
        x.font = '600 ' + Math.round(H * 0.06) + 'px ' + SERIF; x.fillText('JOUE, ACHÈTE, ÉCOUTE', W / 2, H * 0.512, x1 - x0 - 60);
        var gg = x.createLinearGradient(0, H * 0.59, 0, H * 0.63); gg.addColorStop(0, '#f6dc8a'); gg.addColorStop(1, '#c79a2a'); x.fillStyle = gg; x.shadowBlur = 3;
        x.font = '700 ' + Math.round(H * 0.034) + 'px ' + MONO; x.fillText('MINI JEUX  ·  TROPI SHOP  ·  SALLE DE MUSIQUE', W / 2, H * 0.61, x1 - x0 - 60);
        if (bmat.map) bmat.map.needsUpdate = true;
      };
      bim.src = 'assets/bannieres/hall-gauche.jpg?v=4';
    })();

    // mur d'entrée (derrière le joueur au départ) : au milieu la double porte du cinéma de Tropi Stream (cinema3d.js), à gauche (en regardant le mur)
    // la bannière Tropi Stream, à droite l'affiche de la séance (dessinée ici, pas d'image à charger)
    neon(WALL.entree, -4.75, 4.2, 'assets/promo/tropistream.webp?v=1', 4.95, 2.786, 0xff7a1a);   // bannière Tropi Stream (16/9, image complète)
    // touche « Rejoindre le Discord » sous une bannière : une plaque cliquable (ou F à côté) qui ouvre l'invitation dans un nouvel onglet
    function discordPlaque(mur, along, ay, nom, url, hex) {
      var cv = mkCanvas(640, 120), cx = cv.getContext('2d'), rr = 26;
      cx.fillStyle = '#5865f2'; cx.beginPath(); cx.moveTo(rr, 4); cx.lineTo(636 - rr, 4); cx.quadraticCurveTo(636, 4, 636, 4 + rr); cx.lineTo(636, 116 - rr); cx.quadraticCurveTo(636, 116, 636 - rr, 116); cx.lineTo(rr, 116); cx.quadraticCurveTo(4, 116, 4, 116 - rr); cx.lineTo(4, 4 + rr); cx.quadraticCurveTo(4, 4, rr, 4); cx.fill();
      cx.lineWidth = 6; cx.strokeStyle = '#f3d98a'; cx.stroke();
      cx.fillStyle = '#ffffff'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.shadowColor = 'rgba(0,0,0,0.4)'; cx.shadowBlur = 4;
      cx.font = '800 34px ' + MONO; cx.fillText('REJOINDRE LE DISCORD', 320, 44);
      cx.font = '900 40px ' + SERIF; cx.fillText(nom.toUpperCase(), 320, 86);
      var th = Math.atan2(mur.nx, mur.nz), pw2 = new THREE.Group(); pw2.position.set(mur.x, 0, mur.z); pw2.rotation.y = th; g.add(pw2);
      var pm = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.506), new THREE.MeshBasicMaterial({ map: mkTex(cv) })); pm.position.set(along, ay, 0.07); pw2.add(pm);
      room.interactables.push({
        x: mur.x + mur.nx * 1.8 + along * Math.cos(th), z: mur.z + mur.nz * 1.8 - along * Math.sin(th), radius: 3.2, hit: pm,
        prompt: function () { return '💬 Rejoindre le Discord ' + nom + '  [F]'; },
        use: function (w) { if (w && (w.mode !== 'room' || w.blend > 0 || w.trans)) return; try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { /* bloqué */ } }
      });
    }
    discordPlaque(WALL.entree, -4.75, 2.2, 'Tropistream', 'https://discord.gg/gAPZuCn579', 0xff7a1a);
    // bannière Tropico, à gauche de la porte du cinéma premium (en face de l'affiche du programme)
    neon(WALL.droite, -4.3, 3.3, 'assets/promo/tropico.webp?v=1', 4.4, 2.475, 0xff9a3c);
    discordPlaque(WALL.droite, -4.3, 1.6, 'Tropico', 'https://discord.gg/wZYb9RBYN7', 0xff9a3c);
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.8, h: 3.2, label: '🎬 CINÉMA', sub: 'TROPI STREAM · OUVERT', color: 0xff7a1a, target: 'cinema', theme: 'cinema' });
    // affiche du cinéma premium : un vrai cadre de musée (moulure dorée en relief, rosaces, couronne au sommet, halo chaud sur le mur)
    function luxFrame(mur, along, ay, bw, bh, canvas) {
      var pg = new THREE.Group(); pg.position.set(mur.x, 0, mur.z); pg.rotation.y = Math.atan2(mur.nx, mur.nz); g.add(pg);
      var goldL = new THREE.MeshStandardMaterial({ color: 0xe0b84c, roughness: 0.22, metalness: 0.9, emissive: 0x4a3308 });
      var goldD = new THREE.MeshStandardMaterial({ color: 0x8a6a1c, roughness: 0.35, metalness: 0.85, emissive: 0x1e1504 });
      function bx(w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(along + x, ay + y, z); pg.add(o); return o; }
      // halo doré très doux autour du cadre
      var mg = 1.4, tw2 = bw + mg * 2, th2 = bh + mg * 2, GW = 512, GH = Math.round(GW * th2 / tw2), sc2 = GW / tw2, hc = mkCanvas(GW, GH), hx2 = hc.getContext('2d');
      hx2.shadowColor = 'rgba(255,205,120,1)'; hx2.shadowBlur = 70; hx2.fillStyle = 'rgba(255,205,120,0.9)'; hx2.fillRect(mg * sc2, mg * sc2, bw * sc2, bh * sc2);
      var halo = new THREE.Mesh(new THREE.PlaneGeometry(tw2, th2), new THREE.MeshBasicMaterial({ map: mkTex(hc), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); halo.position.set(along, ay, 0.02); pg.add(halo);
      bx(bw + 0.7, bh + 0.7, 0.04, new THREE.MeshStandardMaterial({ color: 0x0d0709, roughness: 0.85 }), 0, 0, 0.04);    // fond de velours noir
      var T = 0.17, hw = bw / 2 + T / 2, hh = bh / 2 + T / 2;                                                              // la moulure principale
      bx(bw + T * 2, T, 0.13, goldL, 0, hh, 0.11); bx(bw + T * 2, T, 0.13, goldL, 0, -hh, 0.11); bx(T, bh, 0.13, goldL, hw, 0, 0.11); bx(T, bh, 0.13, goldL, -hw, 0, 0.11);
      var t3 = 0.035;                                                                                                      // filet sombre côté image
      bx(bw, t3, 0.05, goldD, 0, bh / 2 - t3 / 2, 0.1); bx(bw, t3, 0.05, goldD, 0, -bh / 2 + t3 / 2, 0.1); bx(t3, bh, 0.05, goldD, bw / 2 - t3 / 2, 0, 0.1); bx(t3, bh, 0.05, goldD, -bw / 2 + t3 / 2, 0, 0.1);
      var o2 = bw / 2 + T + 0.12, v2 = bh / 2 + T + 0.12, t4 = 0.04;                                                       // second filet doré, à l'extérieur
      bx(o2 * 2 + t4, t4, 0.05, goldL, 0, v2, 0.08); bx(o2 * 2 + t4, t4, 0.05, goldL, 0, -v2, 0.08); bx(t4, v2 * 2, 0.05, goldL, o2, 0, 0.08); bx(t4, v2 * 2, 0.05, goldL, -o2, 0, 0.08);
      var rosG = new THREE.SphereGeometry(0.13, 18, 12);                                                                    // rosaces aux quatre coins
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { var r = new THREE.Mesh(rosG, goldL); r.scale.z = 0.55; r.position.set(along + c[0] * hw, ay + c[1] * hh, 0.18); pg.add(r); });
      var cs = new THREE.Shape(); cs.moveTo(-0.42, 0); cs.lineTo(0.42, 0); cs.lineTo(0.5, 0.4); cs.lineTo(0.24, 0.18); cs.lineTo(0, 0.5); cs.lineTo(-0.24, 0.18); cs.lineTo(-0.5, 0.4); cs.closePath();   // couronne au sommet
      var crown = new THREE.Mesh(new THREE.ExtrudeGeometry(cs, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }), goldL);
      crown.position.set(along, ay + bh / 2 + T + 0.04, 0.08); pg.add(crown);
      var pearl = new THREE.SphereGeometry(0.045, 12, 8);
      [[-0.5, 0.4], [0, 0.5], [0.5, 0.4]].forEach(function (p) { var m = new THREE.Mesh(pearl, goldL); m.position.set(along + p[0], ay + bh / 2 + T + 0.04 + p[1] + 0.03, 0.12); pg.add(m); });
      var jewel = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), new THREE.MeshStandardMaterial({ color: 0xc0142e, emissive: 0x5a0614, roughness: 0.15, metalness: 0.3 }));
      jewel.position.set(along, ay + bh / 2 + T + 0.04 + 0.12, 0.16); pg.add(jewel);
      var mat = new THREE.MeshBasicMaterial({ map: mkTex(canvas) }), pic = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), mat); pic.position.set(along, ay, 0.07); pg.add(pic);
      return mat;
    }
    // un panneau « à l'affiche » par cinéma : celui de Tropi Stream (mur d'entrée) et celui du cinéma premium (à droite de sa porte, en noir et or)
    function makeCinemaBoard(P2) {
    var soon = mkCanvas(1280, 720), sn = soon.getContext('2d');
    sn.fillStyle = '#12080f'; sn.fillRect(0, 0, 1280, 720);
    sn.textAlign = 'center'; sn.textBaseline = 'middle'; sn.shadowColor = P2.c1; sn.shadowBlur = 30; sn.fillStyle = P2.c2;
    sn.font = '900 130px ' + SERIF; sn.fillText(P2.head, 640, 270, 1200);
    sn.shadowBlur = 0; sn.fillStyle = '#f8e7d0'; sn.font = '700 52px ' + MONO; sn.fillText(P2.name, 640, 440);
    sn.fillStyle = '#c98a55'; sn.font = '600 30px ' + MONO; sn.fillText('SALLE OUVERTE · ENTRE PAR LA PORTE', 640, 520);
    var cinPosterMat = P2.lux ? luxFrame(P2.mur, P2.along, P2.ay, P2.bw, P2.bw * 9 / 16, soon) : neon(P2.mur, P2.along, P2.ay, '', 4.4, 2.475, P2.hex, soon);

    // panneau « à l'affiche » tenu à jour : séance en cours (avec l'heure de début) et prochaines séances programmées depuis la régie (cinema3d.js),
    // affiches des films chargées depuis la playlist / la programmation, logo Tropi Stream en en-tête
    function fmtHeureBoard(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    function fmtJourBoard(d) { var n = new Date(); return d.toDateString() === n.toDateString() ? 'Aujourd\'hui' : (('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2)); }
    // petit cache d'images (logo + affiches) : on redessine dès qu'une image arrive, les suivantes sont déjà prêtes.
    // Les affiches TMDB (image.tmdb.org) n'envoient aucun en-tête CORS : chargées telles quelles, elles « taintent » le
    // canvas (plus utilisable comme texture) ; on les fait donc transiter par notre propre relais (api/poster.js), qui
    // les sert depuis notre domaine — même origine, donc aucun souci de CORS.
    var TMDB_RE = /^https?:\/\/image\.tmdb\.org\//i;
    function boardSrc(url) { return TMDB_RE.test(url) ? ('/api/poster?u=' + encodeURIComponent(url)) : url; }
    var boardImg = {};
    function getImg(url) {
      if (!url) return null;
      var im = boardImg[url];
      if (im === 'error') return null;
      if (im) return im.complete && im.naturalWidth ? im : null;
      im = boardImg[url] = new Image();
      im.onload = function () { if (lastCinSt !== undefined) paintCinemaBoard(lastCinSt); };
      im.onerror = function () { boardImg[url] = 'error'; };
      im.src = boardSrc(url);
      return null;
    }
    // affiche avec coins arrondis, ombre portée et liteau doré ; un rectangle sombre tant qu'elle n'est pas chargée
    function poster(img, x, y, w, h, r) {
      r = r || 10;
      sn.save(); sn.shadowColor = 'rgba(0,0,0,0.6)'; sn.shadowBlur = 16; sn.shadowOffsetY = 6;
      F.roundRectPath(sn, x, y, w, h, r); sn.fillStyle = '#000'; sn.fill(); sn.restore();
      sn.save(); F.roundRectPath(sn, x, y, w, h, r); sn.clip();
      if (img) sn.drawImage(img, x, y, w, h); else {
        var g = sn.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#2a1520'); g.addColorStop(1, '#120a10');
        sn.fillStyle = g; sn.fillRect(x, y, w, h);
      }
      sn.restore();
      sn.strokeStyle = 'rgba(201,162,39,0.75)'; sn.lineWidth = 2; F.roundRectPath(sn, x, y, w, h, r); sn.stroke();
    }
    // texte sur plusieurs lignes (retour à la ligne par mot, ellipse sur la dernière si ça déborde)
    function wrapLines(x, text, maxWidth, maxLines) {
      var words = String(text).split(' '), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (x.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = words[i]; if (lines.length === maxLines) break; }
        else cur = test;
      }
      if (lines.length < maxLines && cur) lines.push(cur);
      var consumed = lines.join(' ').split(' ').length;
      if (consumed < words.length || (cur && lines.length === maxLines && lines[lines.length - 1] !== cur)) {
        var last = lines[lines.length - 1] || '';
        while (last.length > 1 && x.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
        lines[lines.length - 1] = last + '…';
      }
      return lines;
    }
    function truncate(x, text, maxWidth) {
      text = String(text); if (x.measureText(text).width <= maxWidth) return text;
      var t = text; while (t.length > 1 && x.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
      return t + '…';
    }
    // filet façon pellicule 35 mm (perforations) : décor le long du haut et du bas du panneau
    function filmstrip(y) {
      sn.fillStyle = '#060305'; sn.fillRect(0, y, 1280, 16);
      sn.fillStyle = 'rgba(201,162,39,0.55)';
      for (var x = 14; x < 1280; x += 36) sn.fillRect(x, y + 4, 16, 8);
    }
    var hallPlaylist = null, hallPlaylistLoading = false;
    function ensureHallPlaylist() {
      if (hallPlaylist || hallPlaylistLoading) return;
      hallPlaylistLoading = true;
      fetch('assets/cinema/playlist.json', { cache: 'default' }).then(function (r) { return r.json(); })
        .then(function (d) { hallPlaylist = Array.isArray(d) ? d : []; if (lastCinSt !== undefined) paintCinemaBoard(lastCinSt); })
        .catch(function () { hallPlaylist = []; });
    }
    var lastCinSt;
    // ---- le dessin de l'affiche premium : velours noir, rayons art déco, lettres d'or, couronne, programme en cartes ----
    function goldG(y0, y1) { var gq = sn.createLinearGradient(0, y0, 0, y1); gq.addColorStop(0, '#fff4c8'); gq.addColorStop(0.45, '#e6bf55'); gq.addColorStop(0.55, '#b98a28'); gq.addColorStop(1, '#f1d37a'); return gq; }
    function spaced(t, x, y, sp) {                       // texte aux lettres écartées, centré sur x ; renvoie sa largeur
      var ch = String(t).split(''), w = 0; ch.forEach(function (c) { w += sn.measureText(c).width + sp; }); w -= sp;
      var cx = x - w / 2; sn.textAlign = 'left'; ch.forEach(function (c) { sn.fillText(c, cx, y); cx += sn.measureText(c).width + sp; }); sn.textAlign = 'center'; return w;
    }
    function crownIcon(cx, cy, s) {
      sn.save(); sn.translate(cx, cy); sn.scale(s, s); sn.fillStyle = goldG(-26, 22);
      sn.beginPath(); sn.moveTo(-30, 14); sn.lineTo(30, 14); sn.lineTo(34, -14); sn.lineTo(16, 0); sn.lineTo(0, -22); sn.lineTo(-16, 0); sn.lineTo(-34, -14); sn.closePath(); sn.fill();
      sn.fillRect(-30, 17, 60, 5);
      [[-34, -14], [0, -22], [34, -14]].forEach(function (p) { sn.beginPath(); sn.arc(p[0], p[1] - 4, 4.5, 0, TAU); sn.fill(); });
      sn.fillStyle = '#c0142e'; sn.beginPath(); sn.arc(0, 6, 4.5, 0, TAU); sn.fill();
      sn.restore();
    }
    function decoCorner(x, y, sx, sy) {                  // coin art déco : éventail de rayons, deux arcs, équerres dorées
      sn.save(); sn.translate(x, y); sn.scale(sx, sy); sn.strokeStyle = '#d4af37'; sn.lineWidth = 2;
      sn.globalAlpha = 0.5; for (var k = 0; k <= 6; k++) { var a = k / 6 * Math.PI / 2; sn.beginPath(); sn.moveTo(0, 0); sn.lineTo(Math.cos(a) * 56, Math.sin(a) * 56); sn.stroke(); }
      sn.globalAlpha = 1; sn.beginPath(); sn.arc(0, 0, 56, 0, Math.PI / 2); sn.stroke(); sn.beginPath(); sn.arc(0, 0, 32, 0, Math.PI / 2); sn.stroke();
      sn.fillStyle = '#d4af37'; sn.fillRect(0, 0, 84, 4); sn.fillRect(0, 0, 4, 84); sn.fillRect(0, 12, 64, 2); sn.fillRect(12, 0, 2, 64);
      sn.restore();
    }
    function diamond(x, y, r) { sn.save(); sn.translate(x, y); sn.rotate(Math.PI / 4); sn.fillRect(-r, -r, r * 2, r * 2); sn.restore(); }
    var JOURS_C = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
    function jourCourt(d) { var n = new Date(); return d.toDateString() === n.toDateString() ? 'AUJOURD\'HUI' : JOURS_C[d.getDay()] + ' ' + d.getDate(); }
    function paintLux(st) {
      var W = 1280, H = 720, k;
      var bg = sn.createRadialGradient(640, 300, 60, 640, 360, 820); bg.addColorStop(0, '#1f161b'); bg.addColorStop(0.6, '#0d080b'); bg.addColorStop(1, '#030203'); sn.fillStyle = bg; sn.fillRect(0, 0, W, H);
      sn.save(); sn.globalAlpha = 0.06; sn.fillStyle = '#e6bf55';                                   // rayons de soleil art déco, depuis le haut
      for (k = 0; k < 18; k++) { var a0 = Math.PI * k / 18, a1 = a0 + Math.PI / 36; sn.beginPath(); sn.moveTo(640, -60); sn.lineTo(640 + Math.cos(a0) * 1500, -60 + Math.sin(a0) * 1500); sn.lineTo(640 + Math.cos(a1) * 1500, -60 + Math.sin(a1) * 1500); sn.closePath(); sn.fill(); }
      sn.restore();
      sn.strokeStyle = goldG(0, H); sn.lineWidth = 8; sn.strokeRect(20, 20, W - 40, H - 40);
      sn.strokeStyle = 'rgba(212,175,55,0.6)'; sn.lineWidth = 2; sn.strokeRect(36, 36, W - 72, H - 72);
      decoCorner(36, 36, 1, 1); decoCorner(W - 36, 36, -1, 1); decoCorner(36, H - 36, 1, -1); decoCorner(W - 36, H - 36, -1, -1);
      // en-tête : couronne, CINÉMA PREMIUM en lettres d'or espacées, « à l'affiche » entre deux filets
      crownIcon(640, 70, 1.1);
      sn.textAlign = 'center'; sn.textBaseline = 'middle';
      sn.font = '700 62px ' + SERIF; sn.fillStyle = goldG(108, 168); sn.shadowColor = 'rgba(230,190,90,0.55)'; sn.shadowBlur = 18;
      spaced('CINÉMA PREMIUM', 640, 138, 12); sn.shadowBlur = 0;
      sn.font = '600 27px ' + MONO; sn.fillStyle = '#e2cb92'; var hw3 = spaced(P2.head, 640, 190, 8) / 2 + 30;
      sn.fillStyle = '#d4af37'; sn.fillRect(170, 189, 640 - hw3 - 170, 1.5); sn.fillRect(640 + hw3, 189, W - 170 - 640 - hw3, 1.5); diamond(640 - hw3 + 12, 190, 4); diamond(640 + hw3 - 12, 190, 4);
      // au milieu : le film en cours, ou la salle qui attend (et la prochaine séance)
      var playing = st && st.status === 'playing' && st.title, now = Date.now();
      var sched = ((st && st.schedule) || []).filter(function (it) { return it && isFinite(it.at) && it.at > now - 60000; }).sort(function (a, b) { return a.at - b.at; });
      ensureHallPlaylist();
      if (playing) {
        var titre = String(st.title).replace(/\s*\[(VF|VO)\]\s*$/, ''), startD = new Date(now - (st.position || 0) * 1000), f = hallPlaylist && hallPlaylist.find(function (x) { return x.nom === titre; });
        var PX = 130, PY = 226, PW = 150, PH = 225;
        sn.strokeStyle = '#d4af37'; sn.lineWidth = 3; sn.strokeRect(PX - 9, PY - 9, PW + 18, PH + 18);
        poster(getImg(f && f.poster), PX, PY, PW, PH, 3);
        var tx = PX + PW + 54; sn.textAlign = 'left'; sn.textBaseline = 'alphabetic';
        sn.fillStyle = '#e9cf86'; sn.font = '700 22px ' + MONO; sn.fillText('✦  EN CE MOMENT DANS LA SALLE', tx, 262);
        sn.fillStyle = '#fbf3e0'; sn.font = 'italic 700 54px ' + SERIF; var ls = wrapLines(sn, titre, 1140 - tx, 2); ls.forEach(function (ln, i) { sn.fillText(ln, tx, 328 + i * 58); });
        sn.fillStyle = '#c9ad6a'; sn.font = '600 22px ' + MONO; sn.fillText('Depuis ' + fmtHeureBoard(startD) + (f && f.annee ? '  ·  ' + f.annee : '') + (f && f.genres && f.genres[0] ? '  ·  ' + f.genres[0] : ''), tx, 328 + ls.length * 58 + 6);
      } else {
        sn.textAlign = 'center'; sn.textBaseline = 'middle';
        sn.fillStyle = '#fbf3e0'; sn.font = 'italic 600 60px ' + SERIF; sn.shadowColor = 'rgba(0,0,0,0.6)'; sn.shadowBlur = 10; sn.fillText('La salle vous attend', 640, 290); sn.shadowBlur = 0;
        var nx = sched[0];
        sn.font = '600 30px ' + MONO; sn.fillStyle = '#d9c189';
        sn.fillText(nx ? 'PROCHAINE SÉANCE  ·  ' + jourCourt(new Date(nx.at)) + ' À ' + fmtHeureBoard(new Date(nx.at)) : 'La séance commence dès que la régie lance un film', 640, 364, 1000);
        if (nx) { sn.fillStyle = '#fbf3e0'; sn.font = '700 34px ' + SERIF; sn.fillText(truncate(sn, String(nx.title || '').replace(/\s*\[(VF|VO)\]\s*$/, ''), 1000), 640, 414); }
      }
      // en bas : le programme, en cartes (affiche, jour, heure, titre)
      sn.textAlign = 'center'; sn.textBaseline = 'middle'; sn.font = '700 24px ' + MONO; sn.fillStyle = '#d4af37';
      var pw2 = spaced('PROGRAMME', 640, 484, 10) / 2 + 26; sn.fillRect(130, 483, 640 - pw2 - 130, 1.5); sn.fillRect(640 + pw2, 483, W - 130 - 640 - pw2, 1.5); diamond(640 - pw2 + 10, 484, 3.5); diamond(640 + pw2 - 10, 484, 3.5);
      var list = sched.slice(0, 4), CW2 = 240, GAP = 20, tot = list.length * CW2 + Math.max(0, list.length - 1) * GAP, x0 = 640 - tot / 2, CY = 508, CH = 160;
      if (!list.length) { sn.fillStyle = 'rgba(217,193,137,0.8)'; sn.font = 'italic 600 42px ' + SERIF; sn.fillText('Programme bientôt annoncé', 640, 590); }
      list.forEach(function (it, i) {
        var cx = x0 + i * (CW2 + GAP), d = new Date(it.at);
        var cg = sn.createLinearGradient(0, CY, 0, CY + CH); cg.addColorStop(0, 'rgba(212,175,55,0.14)'); cg.addColorStop(1, 'rgba(212,175,55,0.03)'); sn.fillStyle = cg; F.roundRectPath(sn, cx, CY, CW2, CH, 6); sn.fill();
        sn.strokeStyle = 'rgba(212,175,55,0.7)'; sn.lineWidth = 1.5; F.roundRectPath(sn, cx, CY, CW2, CH, 6); sn.stroke();
        poster(getImg(it.poster), cx + 12, CY + 12, 90, CH - 24, 3);
        var tx2 = cx + 116; sn.textAlign = 'left'; sn.textBaseline = 'alphabetic';
        sn.fillStyle = '#d4af37'; sn.font = '700 18px ' + MONO; sn.fillText(jourCourt(d), tx2, CY + 40, CW2 - 124);
        sn.fillStyle = '#fbf3e0'; sn.font = '800 40px ' + SERIF; sn.fillText(fmtHeureBoard(d), tx2, CY + 86);
        sn.fillStyle = '#d9c189'; sn.font = '600 16px ' + MONO; wrapLines(sn, String(it.title || '').replace(/\s*\[(VF|VO)\]\s*$/, ''), CW2 - 126, 2).forEach(function (ln, k2) { sn.fillText(ln, tx2, CY + 116 + k2 * 20); });
      });
      if (cinPosterMat.map) cinPosterMat.map.needsUpdate = true;
    }
    function paintCinemaBoard(st) {
      lastCinSt = st;
      if (P2.lux) { paintLux(st); return; }
      // fond : dégradé sombre façon salle obscure + vignette, plutôt qu'un aplat
      var bg = sn.createRadialGradient(640, 320, 80, 640, 360, 760);
      if (P2.lux) { bg.addColorStop(0, '#16131a'); bg.addColorStop(1, '#040305'); } else { bg.addColorStop(0, '#1c0f16'); bg.addColorStop(1, '#0a0509'); }
      sn.fillStyle = bg; sn.fillRect(0, 0, 1280, 720);
      if (P2.lux) {                                    // cadre art déco : double filet doré, coins à gradins, petits losanges
        sn.strokeStyle = '#d4af37'; sn.lineWidth = 6; sn.strokeRect(14, 14, 1252, 692); sn.lineWidth = 2; sn.strokeRect(28, 28, 1224, 664);
        [[28, 28, 1, 1], [1252, 28, -1, 1], [28, 692, 1, -1], [1252, 692, -1, -1]].forEach(function (q) {
          sn.fillStyle = '#d4af37'; for (var st = 0; st < 3; st++) sn.fillRect(q[0] + (q[2] < 0 ? -(46 - st * 14) : 0), q[1] + (q[3] < 0 ? -(4 + st * 10) - 4 : st * 10), 46 - st * 14, 4);
          sn.save(); sn.translate(q[0] + q[2] * 64, q[1] + q[3] * 36); sn.rotate(Math.PI / 4); sn.fillRect(-6, -6, 12, 12); sn.restore();
        });
      } else { filmstrip(0); filmstrip(704); }

      // en-tête : titre du panneau, médaillon Tropi Stream à droite du texte, double filet doré en dessous
      var logo = getImg('assets/cinema/tropistream-serveur.png'), LY = 86, LR = 46;
      [150, 1130].forEach(function (LX) {                                      // le logo de chaque côté du titre
        sn.save(); sn.beginPath(); sn.arc(LX, LY, LR, 0, TAU); sn.clip();
        if (logo) sn.drawImage(logo, LX - LR, LY - LR, LR * 2, LR * 2); else { sn.fillStyle = '#2a1208'; sn.fillRect(LX - LR, LY - LR, LR * 2, LR * 2); }
        sn.restore();
        sn.strokeStyle = 'rgba(' + P2.rgb + ',0.85)'; sn.lineWidth = 3; sn.beginPath(); sn.arc(LX, LY, LR, 0, TAU); sn.stroke();
      });
      sn.textAlign = 'center'; sn.textBaseline = 'middle'; sn.shadowColor = P2.c1; sn.shadowBlur = 26; sn.fillStyle = P2.c2;
      if (P2.lux) { var tg2 = sn.createLinearGradient(0, 50, 0, 130); tg2.addColorStop(0, '#fff3c4'); tg2.addColorStop(0.5, '#e6c35c'); tg2.addColorStop(1, '#a8781d'); sn.fillStyle = tg2; sn.shadowColor = 'rgba(212,175,55,0.8)'; }
      sn.font = '900 80px ' + SERIF; sn.fillText(P2.head, 640, 92, 860);
      sn.shadowBlur = 0;
      sn.fillStyle = 'rgba(' + P2.rgb + ',0.45)'; sn.fillRect(70, 146, 1140, 2);
      sn.fillStyle = 'rgba(' + P2.rgb + ',0.2)'; sn.fillRect(70, 151, 1140, 1);

      // en haut : la séance en cours de lecture (ou « ouvert » quand rien ne passe)
      var BX = 70, BY = 164, BW = 104, BH = 152, tx = BX + BW + 28;
      var playing = st && st.status === 'playing' && st.title;
      sn.textAlign = 'left'; sn.textBaseline = 'alphabetic';
      if (playing) {
        ensureHallPlaylist();
        var titre = String(st.title).replace(/\s*\[(VF|VO)\]\s*$/, ''), startD = new Date(Date.now() - st.position * 1000);
        var f = hallPlaylist && hallPlaylist.find(function (x) { return x.nom === titre; });
        poster(getImg(f && f.poster), BX, BY, BW, BH, 10);
        sn.fillStyle = 'rgba(74,222,128,0.14)'; sn.fillRect(tx - 2, BY + 6, 360, 34);
        sn.fillStyle = '#4ade80'; sn.font = '800 23px ' + MONO; sn.fillText('●  EN COURS DE LECTURE', tx + 10, BY + 30);
        sn.fillStyle = '#f8e7d0'; sn.font = '800 44px ' + SERIF;
        wrapLines(sn, titre, 1040, 1).forEach(function (ln) { sn.fillText(ln, tx, BY + 92); });
        sn.fillStyle = P2.c2; sn.font = '700 23px ' + MONO; sn.fillText('🕐  Depuis ' + fmtHeureBoard(startD) + (f && f.annee ? '   ·   ' + f.annee : '') + (f && f.genres && f.genres[0] ? '   ·   ' + f.genres[0] : ''), tx, BY + 136);
      } else {
        var ban = getImg('assets/promo/tropistream.webp?v=1'), BWI = 304;      // la nouvelle bannière (2 pour 1) à gauche
        poster(ban, BX, BY, BWI, BH, 10);
        var tx4 = BX + BWI + 28;
        sn.textAlign = 'left'; sn.textBaseline = 'alphabetic';
        sn.fillStyle = 'rgba(' + P2.rgb + ',0.14)'; sn.fillRect(tx4 - 2, BY + 6, 160, 34);
        sn.fillStyle = '#ff9a4a'; sn.font = '800 23px ' + MONO; sn.fillText('●  OUVERT', tx4 + 10, BY + 30);
        sn.fillStyle = '#f8e7d0'; sn.font = '800 42px ' + SERIF; sn.fillText(P2.name, tx4, BY + 88, 840);
        sn.fillStyle = '#c98a55'; sn.font = '600 22px ' + MONO; sn.fillText('Aucune séance en cours.', tx4, BY + 124, 840); sn.fillText('La prochaine commence dès que la régie lance un film.', tx4, BY + 150, 840);
      }

      // en bas : le calendrier de la semaine, du lundi au dimanche ; chaque film programmé est posé à son jour, empilés en hauteur (affiche + heure)
      var sched = ((st && st.schedule) || []).filter(function (it) { return it && isFinite(it.at); }).sort(function (a, b) { return a.at - b.at; });
      var today0 = new Date(); today0.setHours(0, 0, 0, 0);
      var weekOf = function (t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
      var mon = weekOf(today0.getTime()), monEnd = new Date(mon.getTime()); monEnd.setDate(monEnd.getDate() + 7);
      if (!sched.some(function (it) { return it.at >= mon.getTime() && it.at < monEnd.getTime(); })) {      // rien cette semaine : on montre la semaine de la prochaine séance
        var nxt = sched.filter(function (it) { return it.at >= monEnd.getTime(); })[0];
        if (nxt) mon = weekOf(nxt.at);
      }
      sn.fillStyle = 'rgba(' + P2.rgb + ',0.45)'; sn.fillRect(70, 328, 1140, 2);
      var JRS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'], CG = 8, CW = (1140 - CG * 6) / 7, HY = 338, HH = 42, CBY = HY + HH + 6, CBH = 698 - CBY, PAD = 6;
      for (var di = 0; di < 7; di++) {
        var day = new Date(mon.getTime()); day.setDate(day.getDate() + di);
        var dayEnd = new Date(day.getTime()); dayEnd.setDate(dayEnd.getDate() + 1);
        var cx0 = 70 + di * (CW + CG), isToday = day.getTime() === today0.getTime(), isPast = day.getTime() < today0.getTime();
        sn.fillStyle = isToday ? P2.c1 : 'rgba(255,255,255,0.07)'; F.roundRectPath(sn, cx0, HY, CW, HH, 9); sn.fill();
        sn.textAlign = 'center'; sn.textBaseline = 'middle'; sn.font = '800 23px ' + MONO;
        sn.fillStyle = isToday ? '#1a0a04' : (isPast ? '#7a6446' : P2.c2); sn.fillText(JRS[di] + ' ' + day.getDate(), cx0 + CW / 2, HY + HH / 2 + 1, CW - 10);
        sn.fillStyle = 'rgba(255,255,255,0.035)'; F.roundRectPath(sn, cx0, CBY, CW, CBH, 9); sn.fill();
        sn.strokeStyle = isToday ? 'rgba(' + P2.rgb + ',0.8)' : 'rgba(201,162,39,0.18)'; sn.lineWidth = isToday ? 2.5 : 1.5; F.roundRectPath(sn, cx0, CBY, CW, CBH, 9); sn.stroke();
        var items = sched.filter(function (it) { return it.at >= day.getTime() && it.at < dayEnd.getTime(); });
        var MAXC = 5, shown = items.slice(0, MAXC), extra = items.length - shown.length;
        if (!shown.length) continue;
        var G2 = 6, availH = CBH - PAD * 2 - (extra > 0 ? 24 : 0), ch = Math.min(150, (availH - G2 * (shown.length - 1)) / shown.length);
        shown.forEach(function (it, k) {
          var cy0 = CBY + PAD + k * (ch + G2), cxx = cx0 + PAD, cww = CW - PAD * 2, im = getImg(it.poster), dd = new Date(it.at), over = it.at < Date.now();
          sn.save(); F.roundRectPath(sn, cxx, cy0, cww, ch, 8); sn.clip();
          if (im) {                                                    // affiche remplie sans déformation (rognée au centre)
            var sr = im.naturalWidth / im.naturalHeight, dr = cww / ch, sw = sr > dr ? im.naturalHeight * dr : im.naturalWidth, sh = sr > dr ? im.naturalHeight : im.naturalWidth / dr;
            sn.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, cxx, cy0, cww, ch);
          } else { var gg = sn.createLinearGradient(cxx, cy0, cxx, cy0 + ch); gg.addColorStop(0, '#2a1520'); gg.addColorStop(1, '#120a10'); sn.fillStyle = gg; sn.fillRect(cxx, cy0, cww, ch); }
          var sh2 = sn.createLinearGradient(0, cy0 + ch * 0.45, 0, cy0 + ch); sh2.addColorStop(0, 'rgba(6,2,4,0)'); sh2.addColorStop(1, 'rgba(6,2,4,0.92)');
          sn.fillStyle = sh2; sn.fillRect(cxx, cy0, cww, ch);
          if (over) { sn.fillStyle = 'rgba(6,2,4,0.45)'; sn.fillRect(cxx, cy0, cww, ch); }
          sn.restore();
          sn.strokeStyle = 'rgba(201,162,39,0.7)'; sn.lineWidth = 1.5; F.roundRectPath(sn, cxx, cy0, cww, ch, 8); sn.stroke();
          sn.textAlign = 'left'; sn.textBaseline = 'alphabetic';
          var big = ch >= 90;
          sn.fillStyle = '#fff3e0'; sn.font = '800 ' + (big ? 30 : 22) + 'px ' + MONO; sn.shadowColor = 'rgba(0,0,0,0.9)'; sn.shadowBlur = 6;
          sn.fillText(fmtHeureBoard(dd), cxx + 8, cy0 + ch - 9);
          if (big) { sn.font = '700 15px ' + MONO; sn.fillStyle = '#ffd9a8'; sn.fillText(truncate(sn, String(it.title).replace(/\s*\[(VF|VO)\]\s*$/, ''), cww - 14), cxx + 8, cy0 + ch - 42); }
          sn.shadowBlur = 0;
        });
        if (extra > 0) { sn.fillStyle = P2.c2; sn.font = '800 18px ' + MONO; sn.textAlign = 'center'; sn.textBaseline = 'middle'; sn.fillText('+' + extra + ' autre' + (extra > 1 ? 's' : ''), cx0 + CW / 2, CBY + CBH - 16); }
      }
      if (cinPosterMat.map) cinPosterMat.map.needsUpdate = true;
    }
    var cinBoardBusy = false;
    function pollCinemaBoard() {
      if (cinBoardBusy) return;
      cinBoardBusy = true;
      fetch(P2.api, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (st) { cinBoardBusy = false; paintCinemaBoard(st); }).catch(function () { cinBoardBusy = false; });
    }

      if (P2.lux) paintCinemaBoard(null);              // l'affiche de luxe est dessinée tout de suite (avant la première réponse du serveur)
      return { poll: pollCinemaBoard };
    }
    var boards = [
      makeCinemaBoard({ mur: WALL.entree, along: 4.5, ay: 4.2, hex: 0xff7a1a, c1: '#ff7a1a', c2: '#ffb066', rgb: '255,122,26', name: 'CINÉMA TROPI STREAM', head: 'À L\'AFFICHE', api: '/api/cinema' }),
      makeCinemaBoard({ mur: WALL.droite, along: 4.3, ay: 2.9, bw: 4.4, hex: 0xd4af37, c1: '#d4af37', c2: '#f3d98a', rgb: '212,175,55', name: 'CINÉMA PREMIUM', head: "À L'AFFICHE", api: '/api/cinema?room=premium', lux: true })
    ];

    // guirlandes de néons qui s'enroulent autour des colonnes (même LED lumineuses que la table des chevaux)
    var ledTex = (function () {
      var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.38, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c);
    })();
    var garlands = [], wireMat = new THREE.MeshBasicMaterial({ color: 0x2a1a30 });
    function garland(cx, cz) {
      var turns = 4, y0 = 0.3, y1 = 7.7, R = 0.55, strands = 2, step = low ? 0.13 : 0.07, s;   // part des anneaux dorés : le fil sort de l'anneau et y rentre
      for (s = 0; s < strands; s++) {
        var ph = s * Math.PI, pts = [], k, n = turns * 40;
        for (k = 0; k <= n; k++) { var f = k / n, a = ph + f * turns * TAU; var e = Math.min(1, Math.min(f, 1 - f) / 0.09), rr = 0.44 + (R - 0.44) * e * e * (3 - 2 * e); pts.push(new THREE.Vector3(cx + Math.cos(a) * rr, y0 + f * (y1 - y0), cz + Math.sin(a) * rr)); }
        var curve = new THREE.CatmullRomCurve3(pts), len = curve.getLength(), cnt = Math.round(len / step), pos = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), geo = new THREE.BufferGeometry(), v;
        for (k = 0; k < cnt; k++) { v = curve.getPoint(k / cnt); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
        var pts3 = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.27, map: ledTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        pts3.frustumCulled = false; g.add(pts3);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, n, 0.012, 4, false), wireMat));
        garlands.push({ geo: geo, col: col, cnt: cnt, dir: s ? -1 : 1 });
      }
    }
    var ledC = new THREE.Color(), ledT = 0;
    function garlandsUpdate(dt) {
      ledT += dt;
      garlands.forEach(function (row) {
        var k, h, wv, v;
        for (k = 0; k < row.cnt; k++) {
          wv = 0.5 + 0.5 * Math.sin(k / row.cnt * TAU * 14 - ledT * 6 * row.dir);
          h = (k / row.cnt * 2 + ledT * 0.07) % 1; v = 0.12 + 0.88 * wv * wv;
          ledC.setHSL(h, 1, 0.5); row.col[k * 3] = ledC.r * v; row.col[k * 3 + 1] = ledC.g * v; row.col[k * 3 + 2] = ledC.b * v;
        }
        row.geo.attributes.color.needsUpdate = true;
      });
    }

    // colonnes aux coins
    var colMat = new THREE.MeshStandardMaterial({ color: 0x1a0f18, roughness: 0.55, metalness: 0.2 });
    [[-9.7, -7.6], [9.7, -7.6], [-9.7, 7.6], [9.7, 7.6]].forEach(function (p) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 8, 18), colMat); c.position.set(p[0], 4, p[1]); g.add(c);
      [0.3, 7.7].forEach(function (y) { var r = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), gold); r.rotation.x = Math.PI / 2; r.position.set(p[0], y, p[1]); g.add(r); });
      room.colliders.push({ x: p[0], z: p[1], r: 0.9 });
      garland(p[0], p[1]);
    });

    // fontaine centrale
    var marble = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.25, metalness: 0.1 });
    var base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.56, 32), marble);   // dessus à 0,56 : à 0,60 (niveau de l'eau) il scintillait en rayons blancs (z-fighting)
    base.position.y = 0.28; g.add(base);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.07, 8, 40), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; g.add(rim);
    var waterT = { value: 0 };
    // vraies vagues : une grille 2D simule l'eau du grand bassin (équation des ondes). Les rideaux d'eau y font tomber des gouttes
    // en continu, chaque goutte lance un rond qui s'étale, rebondit sur le bord et se croise avec les autres. La grille est envoyée
    // au shader comme une petite image (pente des vagues en rouge/vert) : elle plie les reflets et le fond.
    var SN = low ? 48 : 64, SR = 1.66, simH = new Float32Array(SN * SN), simV = new Float32Array(SN * SN), simW = new Float32Array(SN * SN), simD = new Uint8Array(SN * SN * 4);
    var simTex = new THREE.DataTexture(simD, SN, SN, THREE.RGBAFormat);
    simTex.minFilter = simTex.magFilter = THREE.LinearFilter; simTex.generateMipmaps = false; simTex.needsUpdate = true;
    (function () {
      for (var j = 0; j < SN; j++) for (var i = 0; i < SN; i++) {
        var rx = (i + 0.5) / SN * 2 - 1, ry = (j + 0.5) / SN * 2 - 1, r = Math.sqrt(rx * rx + ry * ry) * SR;
        simW[j * SN + i] = r > 1.55 ? 0.88 : 1;
        simD[(j * SN + i) * 4] = simD[(j * SN + i) * 4 + 1] = simD[(j * SN + i) * 4 + 2] = 128; simD[(j * SN + i) * 4 + 3] = 255;
      }
    })();
    function simSplat(x, y, amp) {
      var cx = (x / SR * 0.5 + 0.5) * SN - 0.5, cy = (y / SR * 0.5 + 0.5) * SN - 0.5, i, j, d, w;
      for (j = Math.floor(cy) - 2; j <= Math.ceil(cy) + 2; j++) for (i = Math.floor(cx) - 2; i <= Math.ceil(cx) + 2; i++) {
        if (i < 1 || j < 1 || i > SN - 2 || j > SN - 2) continue;
        d = Math.sqrt((i - cx) * (i - cx) + (j - cy) * (j - cy)); w = Math.max(0, 1 - d / 2.2);
        simH[j * SN + i] += amp * w * w;
      }
    }
    function simStep(dt) {
      var n = Math.max(1, Math.min(3, Math.round(dt * 60))), st, i, j, id, avg, a, r;
      for (st = 0; st < n; st++) {
        for (j = 1; j < SN - 1; j++) for (i = 1; i < SN - 1; i++) {
          id = j * SN + i; avg = (simH[id - 1] + simH[id + 1] + simH[id - SN] + simH[id + SN]) * 0.25;
          simV[id] = (simV[id] + (avg - simH[id]) * 0.05) * 0.985 * simW[id];
        }
        for (j = 1; j < SN - 1; j++) for (i = 1; i < SN - 1; i++) { id = j * SN + i; simH[id] += simV[id]; }
        if (Math.random() < 0.015) { a = Math.random() * TAU; r = 0.6 + Math.random() * 0.15; simSplat(Math.cos(a) * r, Math.sin(a) * r, -0.3); }
      }
      for (j = 1; j < SN - 1; j++) for (i = 1; i < SN - 1; i++) {
        id = j * SN + i;
        simD[id * 4] = Math.max(-1, Math.min(1, (simH[id + 1] - simH[id - 1]) * 0.8)) * 127.5 + 127.5;
        simD[id * 4 + 1] = Math.max(-1, Math.min(1, (simH[id + SN] - simH[id - SN]) * 0.8)) * 127.5 + 127.5;
        simD[id * 4 + 2] = Math.max(-1, Math.min(1, simH[id] * 0.5)) * 127.5 + 127.5;
      }
      simTex.needsUpdate = true;
    }
    var WATER_VS = 'varying vec3 vW; varying vec2 vUv; void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }';
    var WATER_HGT = [
      'float hgt(vec2 p) { float t = uT * 0.3; vec2 q = p + 0.10 * vec2(sin(p.y * 2.3 + t * 0.5), cos(p.x * 2.1 - t * 0.45));',
      '  return sin(q.x * 5.0 + t * 1.1) * 0.30 + sin(q.y * 6.1 - t * 0.9) * 0.28 + sin((q.x + q.y) * 9.0 + t * 1.5) * 0.16 + sin((q.x - q.y) * 13.0 - t * 1.4) * 0.10 + sin(length(p) * 11.0 - t * 1.6) * 0.10; }',
      'float hgt2(vec2 p) { float t = uT * 0.3; return sin(p.x * 31.0 + t * 2.1 + sin(p.y * 17.0)) + sin(p.y * 37.0 - t * 1.9 + sin(p.x * 23.0)) + sin((p.x + p.y) * 47.0 + t * 2.7); }'].join(' ');
    // eau « mer claire » : on voit le fond à travers (plus ou moins selon la profondeur), l'eau prend une teinte turquoise qui s'assombrit au centre,
    // le fond reçoit des réseaux de lumière (caustiques) déformés par les vagues, la surface reflète le plafond et scintille au soleil
    var WATER_FS = [
      'uniform float uT; uniform float uRad; uniform float uK; uniform float uSimK; uniform sampler2D uSim; varying vec3 vW; varying vec2 vUv;',
      WATER_HGT,
      'void main() {',
      '  vec2 p = vW.xz; float e = 0.02;',
      '  float dx = (hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0))) / (2.0 * e), dz = (hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e))) / (2.0 * e);',
      '  vec2 sg = (texture2D(uSim, vUv).rg - 0.5) * 2.0 * uSimK;',
      '  vec3 n = normalize(vec3(-dx * 0.04 - sg.x * 1.0, 1.0, -dz * 0.04 + sg.y * 1.0));',
      '  float gx = (hgt2(p + vec2(0.01, 0.0)) - hgt2(p - vec2(0.01, 0.0))) / 0.02, gz = (hgt2(p + vec2(0.0, 0.01)) - hgt2(p - vec2(0.0, 0.01))) / 0.02;',
      '  vec3 n2 = normalize(vec3(n.x - gx * 0.003, 1.0, n.z - gz * 0.003));',
      '  vec3 v = normalize(cameraPosition - vW);',
      '  float rr = length(vUv - 0.5) * 2.0;',
      '  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);',
      '  vec3 r = reflect(-v, n);',
      '  vec3 sky = mix(vec3(0.35, 0.45, 0.55), vec3(0.75, 0.68, 0.55), smoothstep(0.3, 1.0, r.y));',
      '  float deep = smoothstep(1.0, 0.1, rr);',
      '  vec3 tint = mix(vec3(0.03, 0.55, 0.62), vec3(0.0, 0.24, 0.40), deep);',
      '  float a = 1.0 - exp(-uK * mix(0.2, 0.6, deep));',
      '  vec3 L0 = normalize(vec3(0.35, 1.0, 0.45)); vec3 col = mix(tint * (0.75 + 1.2 * (dot(n, L0) - dot(vec3(0.0, 1.0, 0.0), L0))), sky, fres);',
      '  a = clamp(a + fres * (1.0 - a), 0.0, 1.0);',
      '  vec3 L = normalize(vec3(0.35, 1.0, 0.45));',
      '  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(reflect(-L, n2), v), 0.0), 300.0) * 3.0;',
      '  col += vec3(1.0, 0.85, 0.6) * pow(max(dot(reflect(-normalize(vec3(-0.5, 0.8, -0.2)), n2), v), 0.0), 200.0) * 1.5;',
      '  gl_FragColor = vec4(col, a);',
      '}'].join(' ');
    var BED_FS = [
      'uniform float uT; uniform sampler2D uSim; varying vec3 vW; varying vec2 vUv;',
      WATER_HGT,
      'void main() {',
      '  vec2 p = vW.xz; vec2 q = p + vec2(hgt(p), hgt(p * 1.3 + 4.0)) * 0.05 + (texture2D(uSim, vUv).rg - 0.5) * vec2(0.5, -0.5);',
      '  float c1 = 1.0 - abs(sin(q.x * 5.0 + sin(q.y * 3.4 + uT * 0.2)) * sin(q.y * 5.0 + sin(q.x * 2.9 - uT * 0.15)));',
      '  float c2 = 1.0 - abs(sin(q.x * 8.0 - uT * 0.12 + sin(q.y * 5.0)) * sin(q.y * 8.0 + uT * 0.15));',
      '  float cc = pow(c1, 6.0) * 0.8 + pow(c2, 8.0) * 0.5;',
      '  vec3 sand = vec3(0.80, 0.74, 0.60) * (0.9 + 0.1 * sin(p.x * 23.0) * sin(p.y * 19.0));',
      '  gl_FragColor = vec4(sand * vec3(0.12, 0.30, 0.36) + vec3(0.4, 0.9, 1.0) * cc * 0.9, 1.0);',
      '}'].join(' ');
    function waterMat(rad, k, simK) {
      return new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: { uT: waterT, uRad: { value: rad }, uK: { value: k }, uSimK: { value: simK }, uSim: { value: simTex } } });
    }
    var bed = new THREE.Mesh(new THREE.CircleGeometry(1.66, 48), new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: BED_FS, uniforms: { uT: waterT, uSim: { value: simTex } } }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = 0.42; g.add(bed);
    var water = new THREE.Mesh(new THREE.CircleGeometry(1.66, 64), waterMat(1.66, 2.2, 1));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.62; g.add(water);   // 2 cm au-dessus du rebord de marbre : plus aucune surface au même niveau
    // fontaine à trois étages : colonne tournée en marbre, deux vasques, 
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
    [[0.84, 1.72, 1.4], [0.38, 2.14, 1.4]].forEach(function (v) {
      var w2 = new THREE.Mesh(new THREE.CircleGeometry(v[0], 40), waterMat(v[0], v[2], 0)); w2.rotation.x = -Math.PI / 2; w2.position.y = v[1]; g.add(w2);
    });
    if (!low) { var fl = new THREE.PointLight(0x58c8ff, 0.7, 7); fl.position.set(0, 1.1, 0); g.add(fl); }
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
    function isStaff() { try { return (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin()) || (typeof isCurrentUserCoFounder === 'function' && isCurrentUserCoFounder()); } catch (e) { return false; } }
    DOORS.forEach(function (d) {
      var spec = { x: d.x, z: d.z, nx: d.nx, nz: d.nz, w: 1.8, h: 2.9, label: d.label, sub: d.sub, color: d.color, target: d.target, theme: d.theme, noSign: !!d.noSign };
      if (d.staffOnly) {                               // salle de musique : seuls le Patron et le Co Fondateur peuvent pousser la porte, et elle n'est pas encore ouverte
        spec.enabled = isStaff;
        spec.go = function (w) { w.flash('🎵 Salle de musique', 'Bientôt disponible'); w.player.x = d.x + d.nx * 2.2; w.player.z = d.z + d.nz * 2.2; };
      }
      world.addDoor(room, spec);
    });

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
    var hallT = 0, cinBoardT = 999;   // 999 : on interroge /api/cinema dès l'entrée dans le hall, pas seulement 20 s après
    room.update = function (dt) {
      cinBoardT += dt; if (cinBoardT > 20) { cinBoardT = 0; boards.forEach(function (bd) { bd.poll(); }); }
      garlandsUpdate(dt);
      arm.rotation.y += dt * 0.6; arm.rotation.x += dt * 0.2;
      hallT += dt; waterT.value = hallT; simStep(dt);
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
