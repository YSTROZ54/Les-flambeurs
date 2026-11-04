/* =====================================================================
   uno3d.js — La salle des MINI JEUX (monde 3D, PC) : 3 tables d'UNO et 3 tables de PUISSANCE 4
   ---------------------------------------------------------------------
   On y entre par la porte « MINI JEUX » du hall (hall3d.js, thème « minijeux » de portes3d.js) et on en ressort vers le hall.
   La salle est faite pour du MULTIJOUEUR uniquement : aucun bot. On s'assoit à un fauteuil (F ou clic) et on joue avec les autres :
   à gauche 3 tables rondes d'UNO (2 à 4 joueurs), à droite 3 tables de PUISSANCE 4 (2 joueurs, grille bleue debout avec ses trous).
   Les règles sont dans minijeux-regles.js ; l'état de chaque table est partagé en temps réel avec les autres joueurs de la salle.
   (L'identifiant interne de la salle reste « uno » : il est listé dans world3d.js et dans hall3d.js.)
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), portes3d.js (thèmes de porte).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;
  var HX = 15, HZ = 11, H = 5.6;
  var COLORS = ['#d6221e', '#f2c200', '#1f9d4a', '#1b63c9'];
  var TBL_Z = [-6.6, 0, 6.6], UNO_X = -8.5, C4_X = 8.5;                    // tables bien espacées : les tapis ne se touchent plus
  var C4_PITCH = 0.0935, C4_W = 0.75, C4_H = 0.69, C4_R = 0.0355, C4_Y0 = 0.105;       // grille de 7 colonnes x 6 lignes

  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function cyl(p, rt, rb, h, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- cartes UNO : face (couleur + chiffre) et dos ---------- */
  function faceSym(c, kind, x, y, s, col) {                  // symboles des cartes « passe » et « sens »
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.16; c.lineCap = 'round';
    if (kind === 'S') { c.beginPath(); c.arc(0, 0, s * 0.62, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(-s * 0.44, s * 0.44); c.lineTo(s * 0.44, -s * 0.44); c.stroke(); }
    else { c.beginPath(); c.moveTo(-s * 0.6, -s * 0.3); c.lineTo(s * 0.2, -s * 0.3); c.stroke(); c.beginPath(); c.moveTo(s * 0.72, -s * 0.3); c.lineTo(s * 0.15, -s * 0.7); c.lineTo(s * 0.15, s * 0.1); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(s * 0.6, s * 0.3); c.lineTo(-s * 0.2, s * 0.3); c.stroke(); c.beginPath(); c.moveTo(-s * 0.72, s * 0.3); c.lineTo(-s * 0.15, -s * 0.1); c.lineTo(-s * 0.15, s * 0.7); c.closePath(); c.fill(); }
    c.restore();
  }
  // face d'une carte du jeu : couleur + chiffre ou symbole ; les jokers sont noirs avec un ovale aux quatre couleurs
  function unoFaceCanvas(card) {
    var ci = +card.charAt(0), v = card.slice(1), wild = ci === 4, col = wild ? '#15151a' : COLORS[ci];
    var cv = mkCanvas(640, 960), c = cv.getContext('2d'); c.scale(2, 2);
    rr(c, 8, 8, 304, 464, 36); c.fillStyle = '#fff'; c.fill(); rr(c, 24, 24, 272, 432, 24); c.fillStyle = col; c.fill();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.beginPath(); c.ellipse(0, 0, 80, 168, 0, 0, TAU);
    if (wild) { c.clip(); COLORS.forEach(function (q, k) { c.fillStyle = q; c.fillRect(k % 2 ? 0 : -90, k < 2 ? -180 : 0, 90, 180); }); } else { c.fillStyle = '#fff'; c.fill(); }
    c.restore();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (v === 'S' || v === 'R') { faceSym(c, v, 160, 240, 74, col); faceSym(c, v, 72, 80, 26, '#fff'); faceSym(c, v, 248, 408, 26, '#fff'); }
    else if (v === 'D' || v === 'F') {
      var t = v === 'D' ? '+2' : '+4'; c.font = '900 120px ' + SERIF;
      if (wild) { c.strokeStyle = '#111'; c.lineWidth = 14; c.strokeText(t, 160, 244); c.fillStyle = '#fff'; } else c.fillStyle = col;
      c.fillText(t, 160, 244); c.fillStyle = '#fff'; c.font = '800 50px ' + SERIF; c.fillText(t, 76, 80); c.fillText(t, 244, 408);
    } else if (v !== 'W') { c.fillStyle = col; c.font = '900 184px ' + SERIF; c.fillText(v, 160, 248); c.fillStyle = '#fff'; c.font = '800 68px ' + SERIF; c.fillText(v, 72, 80); c.fillText(v, 248, 408); }
    return cv;
  }
  function unoBackTex() {
    var cv = mkCanvas(640, 960), c = cv.getContext('2d'); c.scale(2, 2);
    rr(c, 8, 8, 304, 464, 36); c.fillStyle = '#fff'; c.fill(); rr(c, 24, 24, 272, 432, 24); c.fillStyle = '#15151a'; c.fill();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.fillStyle = '#d6221e'; c.beginPath(); c.ellipse(0, 0, 100, 190, 0, 0, TAU); c.fill(); c.restore();
    c.save(); c.translate(160, 240); c.rotate(-0.5); c.fillStyle = '#f2c200'; c.strokeStyle = '#111'; c.lineWidth = 10; c.font = '900 84px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('UNO', 0, 4); c.fillText('UNO', 0, 4); c.restore();
    return mkTex(cv);
  }

  function createUnoRoom(world) {
    var low = world.low;
    var room = { title: '🎮 MINI JEUX', subtitle: 'UNO · PUISSANCE 4', topic: 'flambeurs-uno-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- sol : grandes dalles sombres aux quatre couleurs d'UNO, joints dorés --- */
    var fc = mkCanvas(512, 512), fx = fc.getContext('2d'); fx.fillStyle = '#14101a'; fx.fillRect(0, 0, 512, 512);
    COLORS.forEach(function (col, k) { fx.fillStyle = col; fx.globalAlpha = 0.09; fx.fillRect((k % 2) * 256, Math.floor(k / 2) * 256, 256, 256); }); fx.globalAlpha = 1;
    for (i = 0; i < 40; i++) { fx.strokeStyle = 'rgba(255,255,255,' + (0.03 + Math.random() * 0.05) + ')'; fx.lineWidth = 1.2; fx.beginPath(); var vx = Math.random() * 512, vy = Math.random() * 512; fx.moveTo(vx, vy); fx.bezierCurveTo(vx + 60, vy + 40, vx - 40, vy + 120, vx + 30, vy + 200); fx.stroke(); }
    fx.fillStyle = '#c9a227'; fx.fillRect(0, 0, 512, 5); fx.fillRect(0, 0, 5, 512); fx.fillRect(0, 254, 512, 4); fx.fillRect(254, 0, 4, 512);
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 4, HZ * 2 / 4); ft.anisotropy = 16;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* --- murs : papier peint bordeaux à losanges, lambris de noyer, filets dorés (le mur de la porte est coupé à l'ouverture) --- */
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'); wx.fillStyle = '#4a1422'; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(224,186,92,0.28)'; wx.lineWidth = 2; for (i = -1; i < 5; i++) { wx.beginPath(); wx.moveTo(i * 64, 0); wx.lineTo(i * 64 + 256, 256); wx.moveTo(i * 64 + 256, 0); wx.lineTo(i * 64, 256); wx.stroke(); }
    wx.fillStyle = 'rgba(224,186,92,0.3)'; for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { wx.beginPath(); wx.arc(i * 64 + 32, j * 64, 3, 0, TAU); wx.fill(); }
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 16;
    var LO_A = 2.5, LO_B = 5.5, LOH = 3.3;                          // 2e ouverture du fond (vers le Ludo) : de x = 2,5 à 5,5 ; hauteur 3,3
    var OG = 1.9, OPH = 3.5;                                       // demi-largeur et hauteur de l'ouverture du fond
    function wall(len, px, pz, ry) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.2, H / 2.2); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX - OG, -(HX + OG) / 2, -HZ, 0); wall(LO_A - OG, (OG + LO_A) / 2, -HZ, 0); wall(HX - LO_B, (HX + LO_B) / 2, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI);    // le mur du fond est ouvert au milieu (passage vers la Chambre Forte) wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }), woodM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
    var DG = 1.5;                                                  // demi-ouverture laissée libre devant la porte
    [[HX - OG, -(HX + OG) / 2, -HZ + 0.04, 0], [LO_A - OG, (OG + LO_A) / 2, -HZ + 0.04, 0], [HX - LO_B, (HX + LO_B) / 2, -HZ + 0.04, 0], [HX - DG, -(HX + DG) / 2, HZ - 0.04, Math.PI], [HX - DG, (HX + DG) / 2, HZ - 0.04, Math.PI], [HZ * 2, -HX + 0.04, 0, Math.PI / 2], [HZ * 2, HX - 0.04, 0, -Math.PI / 2]].forEach(function (d) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(d[0], 1.2), new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.5, metalness: 0.15 })); m.position.set(d[1], 0.6, d[2]); m.rotation.y = d[3]; g.add(m);
    });
    [[HX - OG, 0.12, 0.1, -(HX + OG) / 2, 1.2, -HZ + 0.05], [LO_A - OG, 0.12, 0.1, (OG + LO_A) / 2, 1.2, -HZ + 0.05], [HX - LO_B, 0.12, 0.1, (HX + LO_B) / 2, 1.2, -HZ + 0.05], [HX - DG, 0.12, 0.1, -(HX + DG) / 2, 1.2, HZ - 0.05], [HX - DG, 0.12, 0.1, (HX + DG) / 2, 1.2, HZ - 0.05], [0.1, 0.12, HZ * 2, -HX + 0.05, 1.2, 0], [0.1, 0.12, HZ * 2, HX - 0.05, 1.2, 0],
      [HX * 2, 0.2, 0.2, 0, H - 0.1, -HZ + 0.1], [HX * 2, 0.2, 0.2, 0, H - 0.1, HZ - 0.1], [0.2, 0.2, HZ * 2, -HX + 0.1, H - 0.1, 0], [0.2, 0.2, HZ * 2, HX - 0.1, H - 0.1, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    /* --- ouverture du fond : un passage (sans porte) vers la salle de la Chambre Forte, avec couloir d'acier, néons verts et grande porte de coffre au bout --- */
    (function () {
      var lt = wallTex.clone(); lt.needsUpdate = true; lt.repeat.set(OG * 2 / 2.2, (H - OPH) / 2.2);
      var lin = new THREE.Mesh(new THREE.PlaneGeometry(OG * 2, H - OPH), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.85, metalness: 0.05 })); lin.position.set(0, OPH + (H - OPH) / 2, -HZ); g.add(lin);
      var steel = new THREE.MeshStandardMaterial({ color: 0x59606e, roughness: 0.4, metalness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.6, metalness: 0.6 }), neon = new THREE.MeshBasicMaterial({ color: 0x3dff9a });
      [-1, 1].forEach(function (sd) { box(g, 0.34, OPH + 0.1, 0.3, steel, sd * (OG + 0.17), (OPH + 0.1) / 2, -HZ + 0.12); box(g, 0.04, OPH, 0.04, neon, sd * (OG - 0.02), OPH / 2, -HZ + 0.3); });
      box(g, OG * 2 + 0.7, 0.3, 0.34, steel, 0, OPH + 0.1, -HZ + 0.14); box(g, OG * 2, 0.04, 0.04, neon, 0, OPH - 0.02, -HZ + 0.3);
      // enseigne
      var sc = mkCanvas(1536, 384), sx2 = sc.getContext('2d'); sx2.scale(2, 2); sx2.fillStyle = '#0c1410'; sx2.fillRect(0, 0, 768, 192); sx2.strokeStyle = '#c9a227'; sx2.lineWidth = 8; sx2.strokeRect(6, 6, 756, 180);
      sx2.textAlign = 'center'; sx2.textBaseline = 'middle'; sx2.shadowColor = '#3dff9a'; sx2.shadowBlur = 16; sx2.fillStyle = '#d8ffe9'; sx2.font = '900 76px ' + SERIF; sx2.fillText('🔐 LA CHAMBRE FORTE', 384, 84, 720); sx2.shadowBlur = 0; sx2.fillStyle = '#f3cf62'; sx2.font = '700 30px ' + F.MONO; sx2.fillText('MINES · ENTRÉE LIBRE', 384, 150, 720);
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: mkTex(sc), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); sign.position.set(0, OPH + 0.72, -HZ + 0.4); g.add(sign);
      box(g, 3.8, 1.06, 0.1, dark, 0, OPH + 0.72, -HZ + 0.27); box(g, 3.9, 0.05, 0.12, gold, 0, OPH + 1.27, -HZ + 0.28); box(g, 3.9, 0.05, 0.12, gold, 0, OPH + 0.17, -HZ + 0.28);
      // couloir derrière l'ouverture (décor : on n'y entre pas, on passe par le fondu)
      var CL = 3.2, floorM = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.35, metalness: 0.8 });
      var cf = new THREE.Mesh(new THREE.PlaneGeometry(OG * 2, CL), floorM); cf.rotation.x = -Math.PI / 2; cf.position.set(0, 0.01, -HZ - CL / 2); g.add(cf);
      var cc2 = new THREE.Mesh(new THREE.PlaneGeometry(OG * 2, CL), dark); cc2.rotation.x = Math.PI / 2; cc2.position.set(0, OPH, -HZ - CL / 2); g.add(cc2);
      [-1, 1].forEach(function (sd) { var cw = new THREE.Mesh(new THREE.PlaneGeometry(CL, OPH), steel); cw.rotation.y = -sd * Math.PI / 2; cw.position.set(sd * OG, OPH / 2, -HZ - CL / 2); g.add(cw); box(g, 0.05, 0.05, CL, neon, sd * (OG - 0.03), 0.9, -HZ - CL / 2); box(g, 0.05, 0.05, CL, neon, sd * (OG - 0.03), OPH - 0.2, -HZ - CL / 2); });
      for (var rb = 0; rb < 3; rb++) { box(g, OG * 2, 0.06, 0.06, neon, 0, OPH - 0.05, -HZ - 0.5 - rb * 1.0); }
      // la grande porte ronde du coffre, au bout du couloir
      var dc = mkCanvas(512, 512), dx2 = dc.getContext('2d'), dg = dx2.createRadialGradient(256, 256, 20, 256, 256, 250); dg.addColorStop(0, '#7b8496'); dg.addColorStop(0.7, '#454c5a'); dg.addColorStop(1, '#262b34');
      dx2.fillStyle = '#0a0d12'; dx2.fillRect(0, 0, 512, 512); dx2.fillStyle = dg; dx2.beginPath(); dx2.arc(256, 256, 244, 0, TAU); dx2.fill();
      dx2.strokeStyle = '#c9a227'; dx2.lineWidth = 12; dx2.beginPath(); dx2.arc(256, 256, 236, 0, TAU); dx2.stroke(); dx2.lineWidth = 6; dx2.beginPath(); dx2.arc(256, 256, 190, 0, TAU); dx2.stroke();
      for (var bl = 0; bl < 12; bl++) { var ba = bl / 12 * TAU; dx2.fillStyle = '#c9a227'; dx2.beginPath(); dx2.arc(256 + Math.cos(ba) * 213, 256 + Math.sin(ba) * 213, 9, 0, TAU); dx2.fill(); }
      dx2.strokeStyle = '#d9dfec'; dx2.lineWidth = 16; dx2.lineCap = 'round'; for (var sp = 0; sp < 3; sp++) { var sa = sp / 3 * TAU - Math.PI / 2; dx2.beginPath(); dx2.moveTo(256, 256); dx2.lineTo(256 + Math.cos(sa) * 140, 256 + Math.sin(sa) * 140); dx2.stroke(); }
      dx2.fillStyle = '#c9a227'; dx2.beginPath(); dx2.arc(256, 256, 38, 0, TAU); dx2.fill(); dx2.fillStyle = '#3a2c08'; dx2.beginPath(); dx2.arc(256, 256, 20, 0, TAU); dx2.fill();
      var vd = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ map: mkTex(dc) })); vd.position.set(0, 1.75, -HZ - CL + 0.02); g.add(vd);
      if (!low) { var vl = new THREE.PointLight(0x3dff9a, 0.9, 7); vl.position.set(0, 2.6, -HZ - 1.2); g.add(vl); }
    })();
    /* --- deuxième ouverture du fond (à droite de la Chambre Forte) : le passage vers la salle du Ludo (petits chevaux), couloir de bois et de laiton --- */
    (function () {
      var wood = new THREE.MeshStandardMaterial({ color: 0x5a3416, roughness: 0.6, metalness: 0.1 }), woodD = new THREE.MeshStandardMaterial({ color: 0x2f1b0b, roughness: 0.7 }), brass = new THREE.MeshStandardMaterial({ color: 0xd9a830, roughness: 0.3, metalness: 0.8 });
      var cx = (LO_A + LO_B) / 2, hw = (LO_B - LO_A) / 2, lt2 = wallTex.clone(); lt2.needsUpdate = true; lt2.repeat.set(hw * 2 / 2.2, (H - LOH) / 2.2);
      var lin2 = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, H - LOH), new THREE.MeshStandardMaterial({ map: lt2, roughness: 0.85, metalness: 0.05 })); lin2.position.set(cx, LOH + (H - LOH) / 2, -HZ); g.add(lin2);
      [-1, 1].forEach(function (sd) { box(g, 0.3, LOH + 0.1, 0.28, wood, cx + sd * (hw + 0.15), (LOH + 0.1) / 2, -HZ + 0.12); box(g, 0.34, 0.12, 0.32, brass, cx + sd * (hw + 0.15), 0.06, -HZ + 0.12); box(g, 0.34, 0.12, 0.32, brass, cx + sd * (hw + 0.15), LOH + 0.04, -HZ + 0.12); });
      box(g, hw * 2 + 0.6, 0.3, 0.32, wood, cx, LOH + 0.1, -HZ + 0.14); box(g, hw * 2 + 0.7, 0.05, 0.36, brass, cx, LOH + 0.28, -HZ + 0.14);
      // enseigne
      var sc3 = mkCanvas(1536, 384), sx3 = sc3.getContext('2d'); sx3.scale(2, 2); sx3.fillStyle = '#1c1008'; sx3.fillRect(0, 0, 768, 192); sx3.strokeStyle = '#d9a830'; sx3.lineWidth = 8; sx3.strokeRect(6, 6, 756, 180);
      sx3.textAlign = 'center'; sx3.textBaseline = 'middle'; sx3.shadowColor = '#ffb300'; sx3.shadowBlur = 14; sx3.fillStyle = '#fff1b8'; sx3.font = '900 70px ' + SERIF; sx3.fillText('🎲 LUDO', 384, 74, 720); sx3.shadowBlur = 0; sx3.fillStyle = '#e0c585'; sx3.font = '700 28px ' + F.MONO; sx3.fillText('PETITS CHEVAUX · 2 À 4 JOUEURS', 384, 142, 720);
      box(g, 3.5, 0.98, 0.1, woodD, cx, LOH + 0.9, -HZ + 0.27);
      var sgn = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: mkTex(sc3), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); sgn.position.set(cx, LOH + 0.9, -HZ + 0.4); g.add(sgn);
      // couloir : parquet, murs de bois, plafond sombre, lampes
      var CL2 = 3.2, fl2 = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, CL2), new THREE.MeshStandardMaterial({ color: 0x6a4020, roughness: 0.55 })); fl2.rotation.x = -Math.PI / 2; fl2.position.set(cx, 0.01, -HZ - CL2 / 2); g.add(fl2);
      var ce2 = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, CL2), woodD); ce2.rotation.x = Math.PI / 2; ce2.position.set(cx, LOH, -HZ - CL2 / 2); g.add(ce2);
      [-1, 1].forEach(function (sd) {
        var cw3 = new THREE.Mesh(new THREE.PlaneGeometry(CL2, LOH), wood); cw3.rotation.y = -sd * Math.PI / 2; cw3.position.set(cx + sd * hw, LOH / 2, -HZ - CL2 / 2); g.add(cw3);
        for (var lp = 0; lp < 2; lp++) { var lm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })); lm.position.set(cx + sd * (hw - 0.12), 2.2, -HZ - 0.9 - lp * 1.5); g.add(lm); }
      });
      // fond du couloir : le plateau de Ludo vu de dessus
      var bc = mkCanvas(768, 768), bx = bc.getContext('2d'), cell = 768 / 15, cols = ['#e53935', '#43a047', '#fdd835', '#1e88e5'];
      bx.fillStyle = '#f6f1e4'; bx.fillRect(0, 0, 768, 768);
      [[0, 0], [0, 9], [9, 9], [9, 0]].forEach(function (o, k) { bx.fillStyle = cols[k]; bx.fillRect(o[1] * cell, o[0] * cell, cell * 6, cell * 6); bx.fillStyle = 'rgba(255,255,255,0.9)'; bx.fillRect((o[1] + 1) * cell, (o[0] + 1) * cell, cell * 4, cell * 4); bx.fillStyle = cols[k]; [[1.7, 1.7], [1.7, 3.3], [3.3, 1.7], [3.3, 3.3]].forEach(function (q) { bx.beginPath(); bx.arc((o[1] + q[1] + 0.5) * cell, (o[0] + q[0] + 0.5) * cell, cell * 0.55, 0, TAU); bx.fill(); }); });
      bx.strokeStyle = '#8a8478'; bx.lineWidth = 1.5; for (var gi = 0; gi < 15; gi++) for (var gj = 0; gj < 15; gj++) { if ((gi < 6 || gi > 8) && (gj < 6 || gj > 8)) continue; bx.strokeRect(gj * cell, gi * cell, cell, cell); }
      bx.fillStyle = cols[0]; for (var h1 = 1; h1 <= 5; h1++) bx.fillRect(h1 * cell + 1, 7 * cell + 1, cell - 2, cell - 2); bx.fillStyle = cols[1]; for (var h2 = 1; h2 <= 5; h2++) bx.fillRect(7 * cell + 1, h2 * cell + 1, cell - 2, cell - 2);
      bx.fillStyle = cols[2]; for (var h3 = 9; h3 <= 13; h3++) bx.fillRect(h3 * cell + 1, 7 * cell + 1, cell - 2, cell - 2); bx.fillStyle = cols[3]; for (var h4 = 9; h4 <= 13; h4++) bx.fillRect(7 * cell + 1, h4 * cell + 1, cell - 2, cell - 2);
      bx.fillStyle = '#ffffff'; bx.fillRect(6 * cell, 6 * cell, cell * 3, cell * 3);
      var pan = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: mkTex(bc) })); pan.position.set(cx, 1.75, -HZ - CL2 + 0.03); g.add(pan);
      box(g, 2.4, 2.4, 0.06, brass, cx, 1.75, -HZ - CL2 - 0.03);
      if (!low) { var ll = new THREE.PointLight(0xffd9a0, 0.8, 6); ll.position.set(cx, 2.8, -HZ - 1.4); g.add(ll); }
    })();
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* --- fauteuils capitonnés (le même modèle que le blackjack et les gobelets) --- */
    var velvetM = new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.75, side: THREE.DoubleSide }), velvetD = new THREE.MeshStandardMaterial({ color: 0x5c0a16, roughness: 0.8, side: THREE.DoubleSide });
    function vm(col) { return new THREE.MeshStandardMaterial({ color: col, roughness: 0.72, side: THREE.DoubleSide }); }
    var chairU = vm(0x0f6a45), chairUD = vm(0x083d29), chairC = vm(0x2347b8), chairCD = vm(0x132a70);
    // fauteuil club : quatre pieds dorés effilés, assise épaisse, dossier incliné capitonné de boutons dorés, accoudoirs ; il regarde vers +z, le dos est à -z
    function makeChair(x, z, ry, mat, matD) {
      var q = new THREE.Group(); q.position.set(x, 0, z); q.rotation.y = ry; g.add(q);
      [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]].forEach(function (l) { cyl(q, 0.032, 0.02, 0.46, gold, l[0], 0.23, l[1], 10); });
      box(q, 0.58, 0.05, 0.54, matD, 0, 0.47, 0);
      var seatB = box(q, 0.58, 0.14, 0.54, mat, 0, 0.54, 0.01);
      box(q, 0.6, 0.015, 0.56, gold, 0, 0.465, 0);
      var back = box(q, 0.58, 0.7, 0.11, mat, 0, 0.98, -0.26); back.rotation.x = -0.12;
      var back2 = box(q, 0.62, 0.74, 0.05, matD, 0, 0.99, -0.32); back2.rotation.x = -0.12;
      var rail = box(q, 0.64, 0.045, 0.14, gold, 0, 1.36, -0.285); rail.rotation.x = -0.12;
      for (var bx = -1; bx <= 1; bx++) for (var by = 0; by < 3; by++) { var btn = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), gold); btn.position.set(bx * 0.17, 0.82 + by * 0.19, -0.2 - by * 0.0227); q.add(btn); }
      [-1, 1].forEach(function (sd) {
        box(q, 0.07, 0.06, 0.46, matD, sd * 0.325, 0.78, -0.03); cyl(q, 0.016, 0.016, 0.2, gold, sd * 0.325, 0.68, 0.15, 8); box(q, 0.075, 0.015, 0.47, gold, sd * 0.325, 0.815, -0.03);
      });
      room.colliders.push({ x: x, z: z, r: 0.32 });
    }
    function lathe(p, pts, m, seg) { var o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), seg || 32), m); p.add(o); return o; }
    var lampM = new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }), bulbM = new THREE.MeshBasicMaterial({ color: 0xffe9b0 }), cordM = new THREE.MeshBasicMaterial({ color: 0x222222 });
    function pendant(p, x, z) {                                    // lampe suspendue au-dessus d'une table
      var lamp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.36, 24, 1, true), lampM); lamp.position.set(x, H - 1.5, z); p.add(lamp);
      var lrim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 6, 28), gold); lrim.rotation.x = Math.PI / 2; lrim.position.set(x, H - 1.68, z); p.add(lrim);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), bulbM); bulb.position.set(x, H - 1.62, z); p.add(bulb);
      cyl(p, 0.012, 0.012, 1.4, cordM, x, H - 0.7, z, 6);
    }

    /* --- tapis ronds sous les tables --- */
    var rc = mkCanvas(512, 512), rx = rc.getContext('2d'), rg = rx.createRadialGradient(256, 256, 20, 256, 256, 256);
    rg.addColorStop(0, '#5a1424'); rg.addColorStop(0.8, '#34101a'); rg.addColorStop(1, '#240b12'); rx.fillStyle = rg; rx.fillRect(0, 0, 512, 512);
    rx.strokeStyle = '#d9b441'; rx.lineWidth = 7; rx.beginPath(); rx.arc(256, 256, 236, 0, TAU); rx.stroke(); rx.lineWidth = 3; rx.beginPath(); rx.arc(256, 256, 222, 0, TAU); rx.stroke();
    var rugMat = new THREE.MeshStandardMaterial({ map: mkTex(rc), roughness: 0.9 });

    /* --- cartes UNO du jeu : une texture par carte (créée à la demande), une miniature nette pour la main du joueur --- */
    var faceTexCache = {}, faceMatCache = {}, imgCache = {};
    function faceMat(card) { return faceMatCache[card] || (faceMatCache[card] = new THREE.MeshBasicMaterial({ map: (function (t) { t.anisotropy = 16; return t; })(mkTex(unoFaceCanvas(card))) })); }
    function faceImg(card) {
      if (imgCache[card]) return imgCache[card];
      var cv = mkCanvas(160, 240), x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(unoFaceCanvas(card), 0, 0, 160, 240);
      return (imgCache[card] = cv.toDataURL());
    }
    function labelTex(text, sub, active, col) {
      var cv = mkCanvas(320, 96), c = cv.getContext('2d'); rr(c, 4, 4, 312, 88, 26); c.fillStyle = 'rgba(8,5,12,0.86)'; c.fill(); c.strokeStyle = active ? '#ffe35a' : (col || 'rgba(201,162,39,0.8)'); c.lineWidth = active ? 9 : 5; c.stroke();
      c.fillStyle = active ? '#ffe35a' : '#f4e3b0'; c.font = '900 34px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 160, sub ? 38 : 50, 290);
      if (sub) { c.fillStyle = '#c9b88a'; c.font = '700 26px ' + SERIF; c.fillText(sub, 160, 70, 290); }
      return mkTex(cv);
    }
    function mkLabel() { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('', ''), transparent: true, depthWrite: false })); sp.scale.set(0.66, 0.2, 1); sp.visible = false; return sp; }
    function setLabel(sp, text, sub, active, col) { if (sp.material.map) sp.material.map.dispose(); sp.material.map = labelTex(text, sub, active, col); sp.material.needsUpdate = true; }

    /* --- 3 tables d'UNO : plateau rond de feutre vert, bord de cuir, pioche, défausse, 4 fauteuils (les cartes posées viennent de la partie) --- */
    var fe = mkCanvas(512, 512), fxx = fe.getContext('2d'), fg = fxx.createRadialGradient(256, 256, 20, 256, 256, 256); fg.addColorStop(0, '#1b8552'); fg.addColorStop(1, '#0b4a30'); fxx.fillStyle = fg; fxx.fillRect(0, 0, 512, 512);
    fxx.strokeStyle = '#e8c75a'; fxx.lineWidth = 8; fxx.beginPath(); fxx.arc(256, 256, 236, 0, TAU); fxx.stroke(); fxx.lineWidth = 3; fxx.beginPath(); fxx.arc(256, 256, 218, 0, TAU); fxx.stroke();
    fxx.fillStyle = 'rgba(232,199,90,0.14)'; fxx.font = '900 130px ' + SERIF; fxx.textAlign = 'center'; fxx.textBaseline = 'middle'; fxx.fillText('UNO', 256, 256);
    COLORS.forEach(function (col, k) { fxx.fillStyle = col; fxx.globalAlpha = 0.85; var a = k / 4 * TAU + TAU / 8; fxx.beginPath(); fxx.arc(256 + Math.cos(a) * 186, 256 + Math.sin(a) * 186, 13, 0, TAU); fxx.fill(); }); fxx.globalAlpha = 1;
    var unoFelt = new THREE.MeshStandardMaterial({ map: mkTex(fe), roughness: 0.92 }), leatherM = new THREE.MeshStandardMaterial({ color: 0x6b1020, roughness: 0.45, metalness: 0.1 }), edgeM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5 });
    var UR = 1.7, USEAT = 2.62, UHR = 1.2, UARR = 1.28;                       // table d'UNO : rayon, rayon des fauteuils, rayon des mains posées, rayon des flèches
    var arrowShape = new THREE.Shape(); arrowShape.moveTo(-0.26, -0.065); arrowShape.lineTo(0.05, -0.065); arrowShape.lineTo(0.05, -0.17); arrowShape.lineTo(0.28, 0); arrowShape.lineTo(0.05, 0.17); arrowShape.lineTo(0.05, 0.065); arrowShape.lineTo(-0.26, 0.065); arrowShape.closePath();
    var arrowGeo = new THREE.ShapeGeometry(arrowShape), arrowM = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    var arrowOutM = new THREE.MeshBasicMaterial({ color: 0x1a1208, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    var headArrowGeo = new THREE.ConeGeometry(0.13, 0.3, 18); headArrowGeo.rotateX(Math.PI); var headArrowM = new THREE.MeshBasicMaterial({ color: 0xffe35a });
    var cardGeo = new THREE.PlaneGeometry(0.29, 0.435), bigCardGeo = new THREE.PlaneGeometry(0.37, 0.555), backM = new THREE.MeshBasicMaterial({ map: unoBackTex() });
    var chairs = [], TV = {}, ringGeo = new THREE.CircleGeometry(0.36, 40);
    function addChair(ch) {                                          // une place : le fauteuil, la zone cliquable pour s'asseoir et ses repères
      ch.yaw = Math.atan2(ch.tx - ch.x, -(ch.tz - ch.z)); ch.sx = ch.x + (ch.x - ch.tx) * 0.45; ch.sz = ch.z + (ch.z - ch.tz) * 0.45; chairs.push(ch);
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(ch.x, 0.7, ch.z); g.add(hit);
      room.interactables.push({ hit: hit, x: ch.x, z: ch.z, radius: 1.5, enabled: function () { return !seat && !chairTaken(ch); }, prompt: function () { return '🪑 S\'asseoir — ' + (ch.tid.charAt(0) === 'u' ? 'UNO' : 'Puissance 4') + ' · table ' + (ch.ti + 1); }, use: function (w) { sit(w, ch); } });
    }
    TBL_Z.forEach(function (tz, ti) {
      var t = new THREE.Group(), tid = 'u' + ti; t.position.set(UNO_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(3.15, 56), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      cyl(t, UR, UR, 0.1, [edgeM, unoFelt, edgeM], 0, 0.8, 0, 64);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(UR, 0.105, 12, 80), leatherM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.86; t.add(rim);
      cyl(t, UR - 0.05, UR - 0.05, 0.13, edgeM, 0, 0.72, 0, 64); var skirt = new THREE.Mesh(new THREE.TorusGeometry(UR - 0.05, 0.024, 8, 80), gold); skirt.rotation.x = Math.PI / 2; skirt.position.y = 0.655; t.add(skirt);
      var inl = new THREE.Mesh(new THREE.TorusGeometry(UR, 0.013, 6, 64), gold); inl.rotation.x = Math.PI / 2; inl.position.y = 0.915; t.add(inl);
      lathe(t, [[0.001, 0.0], [0.5, 0.0], [0.52, 0.03], [0.44, 0.07], [0.28, 0.12], [0.18, 0.22], [0.15, 0.4], [0.19, 0.55], [0.26, 0.68], [0.001, 0.75]].map(function (q) { return [q[0] * 1.35, q[1]]; }), woodM, 32);
      [[0.5 * 1.35, 0.03, 0.03], [0.18 * 1.35, 0.22, 0.024]].forEach(function (d) { var r = new THREE.Mesh(new THREE.TorusGeometry(d[0], d[2], 8, 32), gold); r.rotation.x = Math.PI / 2; r.position.y = d[1]; t.add(r); });
      var pile = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.1, 0.555), new THREE.MeshBasicMaterial({ color: 0x15151a })); pile.position.set(-0.5, 0.9, 0); pile.rotation.y = 0.15; t.add(pile);
      var pt = new THREE.Mesh(bigCardGeo, backM); pt.rotation.x = -Math.PI / 2; pt.rotation.z = 0.15; pt.position.set(-0.5, 0.952, 0); t.add(pt);
      var tv = TV[tid] = { kind: 'u', group: t, hands: [], labels: [], heads: [], arrows: [] };
      for (var aq = 0; aq < 4; aq++) {                                       // flèches de sens de jeu, dans les espaces entre les mains
        var am = (aq + 0.5) / 4 * TAU + Math.PI / 4, ag = new THREE.Group(); ag.position.set(Math.cos(am) * UARR, 0.884, Math.sin(am) * UARR);
        var ash0 = new THREE.Mesh(arrowGeo, arrowOutM); ash0.rotation.x = -Math.PI / 2; ash0.scale.set(1.3, 1.35, 1); ash0.renderOrder = 5; ag.add(ash0); var ash = new THREE.Mesh(arrowGeo, arrowM); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.002; ash.renderOrder = 6; ag.add(ash); ag.visible = false; t.add(ag); tv.arrows.push({ g: ag, am: am, phi: am + Math.PI / 2 });
      }
      tv.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x888888 })); tv.ring.rotation.x = -Math.PI / 2; tv.ring.position.set(0.5, 0.861, 0); tv.ring.visible = false; t.add(tv.ring);
      tv.top2 = new THREE.Mesh(bigCardGeo, backM); tv.top2.rotation.x = -Math.PI / 2; tv.top2.rotation.z = 0.5; tv.top2.position.set(0.47, 0.866, 0.06); tv.top2.visible = false; t.add(tv.top2);
      tv.top = new THREE.Mesh(bigCardGeo, backM); tv.top.rotation.x = -Math.PI / 2; tv.top.rotation.z = -0.2; tv.top.position.set(0.5, 0.873, 0); tv.top.visible = false; t.add(tv.top);
      for (var s = 0; s < 4; s++) {
        var sa = s / 4 * TAU + Math.PI / 4, hg = [];
        for (var k = 0; k < 9; k++) { var hc = new THREE.Mesh(cardGeo, backM); hc.rotation.x = -Math.PI / 2; hc.visible = false; t.add(hc); hg.push(hc); }
        tv.hands.push({ cards: hg, sa: sa });
        var lb = mkLabel(); lb.position.set(Math.cos(sa) * (UR + 0.12), 1.02, Math.sin(sa) * (UR + 0.12)); t.add(lb); tv.labels.push(lb);
        var hd = new THREE.Mesh(headArrowGeo, headArrowM); hd.position.set(Math.cos(sa) * USEAT, 1.95, Math.sin(sa) * USEAT); hd.visible = false; hd.renderOrder = 15; t.add(hd); tv.heads.push(hd);
        var cx = UNO_X + Math.cos(sa) * USEAT, cz = tz + Math.sin(sa) * USEAT;
        makeChair(cx, cz, Math.atan2(-Math.cos(sa), -Math.sin(sa)), chairU, chairUD);
        addChair({ tid: tid, ti: ti, local: s, n: ti * 4 + s, x: cx, z: cz, tx: UNO_X, tz: tz });
      }
      pendant(g, UNO_X, tz);
      room.colliders.push({ x: UNO_X, z: tz, r: UR + 0.2 });
    });

    /* --- 3 tables de PUISSANCE 4 : grille bleue brillante aux vrais trous, jetons qui tombent, et on clique directement sur la colonne voulue --- */
    var redM = new THREE.MeshStandardMaterial({ color: 0xd8262b, roughness: 0.22, metalness: 0.1 }), yelM = new THREE.MeshStandardMaterial({ color: 0xf0cb14, roughness: 0.22, metalness: 0.1 }), blueM = new THREE.MeshStandardMaterial({ color: 0x2b4fe0, roughness: 0.2, metalness: 0.3 }), navyM = new THREE.MeshStandardMaterial({ color: 0x14217a, roughness: 0.35, metalness: 0.3 });
    var redG = new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xd01818, roughness: 0.3 }), yelG = new THREE.MeshStandardMaterial({ color: 0xfff27a, emissive: 0xc89a00, roughness: 0.3 });
    var c4Felt = new THREE.MeshStandardMaterial({ color: 0x14583a, roughness: 0.92 }), hx = C4_W / 2;
    var bShape = new THREE.Shape(); bShape.moveTo(-hx, 0); bShape.lineTo(hx, 0); bShape.lineTo(hx, C4_H); bShape.lineTo(-hx, C4_H); bShape.closePath();
    for (var cc = 0; cc < 7; cc++) for (var rw = 0; rw < 6; rw++) { var hole = new THREE.Path(); hole.absarc((cc - 3) * C4_PITCH, C4_Y0 + rw * C4_PITCH, C4_R, 0, TAU, true); bShape.holes.push(hole); }
    var boardGeo = new THREE.ExtrudeGeometry(bShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 20 });
    var discGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.07, 28), footGeo = new THREE.BoxGeometry(0.07, 0.1, 0.28);
    var sk = mkCanvas(8, 84), skx = sk.getContext('2d'); for (i = 0; i < 21; i++) { skx.fillStyle = i % 2 ? '#ffffff' : '#c8c8c8'; skx.fillRect(0, i * 4, 8, 4); }
    function stackMat(col) { var tx = new THREE.CanvasTexture(sk); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return [new THREE.MeshStandardMaterial({ color: col, map: tx, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })]; }
    var stackR = stackMat(0xd8262b), stackY = stackMat(0xf0cb14);
    var TT = 0.8;                                                   // hauteur du dessus de table
    TBL_Z.forEach(function (tz, ti) {
      var t = new THREE.Group(), tid = 'c' + ti; t.position.set(C4_X, 0, tz); g.add(t);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(2.5, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; t.add(rug);
      // table ovale : plateau de feutre, rebord de cuir et filet doré, jupe de bois, piètement tourné
      var top = cyl(t, 1, 1, 0.1, [edgeM, c4Felt, edgeM], 0, TT - 0.05, 0, 56); top.scale.set(1.4, 1, 0.9);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 12, 72), leatherM); rim.rotation.x = Math.PI / 2; rim.scale.set(1.4, 0.9, 1); rim.position.y = TT; t.add(rim);
      var inl = new THREE.Mesh(new THREE.TorusGeometry(1, 0.014, 6, 72), gold); inl.rotation.x = Math.PI / 2; inl.scale.set(1.4, 0.9, 1); inl.position.y = TT + 0.07; t.add(inl);
      var apron = cyl(t, 0.96, 0.96, 0.12, edgeM, 0, TT - 0.16, 0, 56); apron.scale.set(1.4, 1, 0.9);
      var aband = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.018, 6, 72), gold); aband.rotation.x = Math.PI / 2; aband.scale.set(1.4, 0.9, 1); aband.position.y = TT - 0.22; t.add(aband);
      lathe(t, [[0.001, 0.0], [0.5, 0.0], [0.52, 0.03], [0.44, 0.07], [0.28, 0.12], [0.18, 0.22], [0.15, 0.4], [0.19, 0.55], [0.26, 0.68], [0.001, 0.72]], woodM, 32);
      [[0.5, 0.03, 0.028], [0.18, 0.22, 0.022]].forEach(function (d) { var r = new THREE.Mesh(new THREE.TorusGeometry(d[0], d[2], 8, 32), gold); r.rotation.x = Math.PI / 2; r.position.y = d[1]; t.add(r); });
      // la grille : plaque bleue brillante épaisse percée de 42 trous, deux pieds, liserés dorés en haut
      var bd = new THREE.Mesh(boardGeo, blueM); bd.position.set(0, TT + 0.1, -0.035); t.add(bd);
      [-1, 1].forEach(function (sd) { var f = new THREE.Mesh(footGeo, navyM); f.position.set(sd * (hx - 0.06), TT + 0.05, 0); t.add(f); var fc = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.015, 0.29), gold); fc.position.set(sd * (hx - 0.06), TT + 0.102, 0); t.add(fc); });
      box(t, C4_W + 0.03, 0.018, 0.1, gold, 0, TT + 0.1 + C4_H + 0.002, 0);
      [[-1, stackR], [1, stackY]].forEach(function (sp) { var sm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 24), sp[1]); sm.position.set(sp[0] * 0.9, TT + 0.11, 0); t.add(sm); });
      var tv = TV[tid] = { kind: 'c', group: t, discs: {}, labels: [mkLabel(), mkLabel()], hits: [], bars: [] };
      tv.labels[0].position.set(0, TT + 0.3, 0.6); tv.labels[1].position.set(0, TT + 0.3, -0.6); t.add(tv.labels[0]); t.add(tv.labels[1]);
      // une barre cliquable par colonne (invisible) + un repère lumineux qui n'apparaît que quand c'est à moi de jouer
      for (var c4 = 0; c4 < 7; c4++) {
        var bx0 = (c4 - 3) * C4_PITCH, by0 = TT + 0.1 + C4_H / 2 + 0.05;
        var hitC = new THREE.Mesh(new THREE.BoxGeometry(C4_PITCH * 0.98, C4_H + 0.3, 0.3), new THREE.MeshBasicMaterial({ visible: false })); hitC.position.set(bx0, by0, 0); hitC.userData.col = c4; t.add(hitC); tv.hits.push(hitC);
        var bg = new THREE.Group(); bg.visible = false; t.add(bg);
        var bar = new THREE.Mesh(new THREE.BoxGeometry(C4_PITCH * 0.92, C4_H + 0.04, 0.14), new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); bar.position.set(bx0, TT + 0.1 + C4_H / 2, 0); bg.add(bar);
        var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), new THREE.MeshBasicMaterial({ color: 0xffe35a })); arrow.rotation.x = Math.PI; arrow.position.set(bx0, TT + 0.1 + C4_H + 0.1, 0); arrow.userData.y0 = arrow.position.y; bg.add(arrow);
        tv.bars.push(bg);
      }
      makeChair(C4_X, tz + 1.3, Math.PI, chairC, chairCD); makeChair(C4_X, tz - 1.3, 0, chairC, chairCD);
      addChair({ tid: tid, ti: ti, local: 0, n: 12 + ti * 2, x: C4_X, z: tz + 1.3, tx: C4_X, tz: tz }); addChair({ tid: tid, ti: ti, local: 1, n: 13 + ti * 2, x: C4_X, z: tz - 1.3, tx: C4_X, tz: tz });
      pendant(g, C4_X, tz);
      room.colliders.push({ x: C4_X - 0.9, z: tz, r: 0.75 }, { x: C4_X, z: tz, r: 0.8 }, { x: C4_X + 0.9, z: tz, r: 0.75 });
    });

    /* =====================================================================
       LA PARTIE : l'état de chaque table est partagé entre les joueurs (canal temps réel de la salle).
       Chaque table a un « état » (voir minijeux-regles.js) avec un numéro de version. Celui qui joue modifie l'état, le numéro augmente
       et l'état complet est envoyé à tous ; chacun garde la version la plus récente. Quelqu'un qui arrive demande l'état des tables.
       ===================================================================== */
    var MJ = F.mj, TIDS = Object.keys(TV), G = {}, seat = null, ui = null, view = { yaw: 0, pitch: 0 }, pendingWild = -1, errMsg = '', errT = 0, standEl = null, missing = {}, anims = [], pruneT = 0;
    var CARD_RE = /^[0-4][0-9SRDWF]$/;
    function me() { return F.me(); }
    function myName() { try { return String(state.username || '').slice(0, 20); } catch (e) { return ''; } }
    function loggedIn() { try { return !!me() && (typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn()); } catch (e) { return false; } }
    function kindOf(tid) { return tid.charAt(0); }
    function getSt(tid) { return G[tid] || (G[tid] = kindOf(tid) === 'u' ? MJ.unoNew() : MJ.c4New()); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function chairN(tid, local) { for (var k = 0; k < chairs.length; k++) if (chairs[k].tid === tid && chairs[k].local === local) return chairs[k].n; return -1; }
    function chairTaken(ch) {
      var now = performance.now(), st = G[ch.tid], e = st && st.seats[ch.local];
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === ch.n && now - (r.recv || 0) < 4000; }) || !!(e && e.k !== me() && present(ch.tid, ch.local, e));
    }
    function present(tid, local, e) { var r = world.remote[e.k]; return !!(r && r.seat === chairN(tid, local) && performance.now() - (r.recv || 0) < 4000); }
    function okState(tid, st) {
      try {
        if (!st || typeof st.ver !== 'number' || !st.seats || typeof st.seats !== 'object') return false;
        var u = kindOf(tid) === 'u', lim = u ? 3 : 1, ok = true;
        Object.keys(st.seats).forEach(function (n) { var e = st.seats[n]; if (!(+n >= 0 && +n <= lim) || !e || typeof e.k !== 'string' || typeof e.name !== 'string') ok = false; else e.name = e.name.slice(0, 20); });
        if (!ok) return false;
        if (u) {
          var cards = function (a) { return Array.isArray(a) && a.length <= 120 && a.every(function (c) { return typeof c === 'string' && CARD_RE.test(c); }); };
          if (!cards(st.deck) || !cards(st.disc) || !st.hands || typeof st.hands !== 'object') return false;
          Object.keys(st.hands).forEach(function (n) { if (!(+n >= 0 && +n <= 3) || !cards(st.hands[n])) ok = false; });
          return ok && typeof st.turn === 'number' && typeof st.col === 'number' && (st.drawn === '' || (typeof st.drawn === 'string' && CARD_RE.test(st.drawn)));
        }
        return Array.isArray(st.g) && st.g.length === 7 && st.g.every(function (c) { return Array.isArray(c) && c.length <= 6 && c.every(function (v) { return v === 1 || v === 2; }); }) && typeof st.turn === 'number';
      } catch (e) { return false; }
    }
    function bcast(tid) { if (world.rt && world.rt.ready && G[tid]) { try { world.rt.send('gs', { k: me(), tid: tid, st: G[tid] }); } catch (e) { /* ok */ } } }
    // modifie l'état d'une table (fn renvoie un texte d'erreur si la règle refuse), puis l'envoie aux autres
    function mutate(tid, fn) {
      var before = G[tid], st = clone(getSt(tid)), err = fn(st);
      if (err) return err;
      st.ver = (st.ver | 0) + 1; st.org = me(); G[tid] = st; bcast(tid); renderTable(tid); announce(tid, before, st); fx3d(tid, before, st); schedAdvance(tid, st);
      if (seat && seat.tid === tid) refreshUi();
      return '';
    }
    function adopt(tid, st) {
      var cur = G[tid];
      if (cur && (st.ver < cur.ver || (st.ver === cur.ver && String(st.org || '') <= String(cur.org || '')))) return;
      G[tid] = st; renderTable(tid); announce(tid, cur, st); fx3d(tid, cur, st); schedAdvance(tid, st);
      if (seat && seat.tid === tid) { reconcile(); refreshUi(); }
    }
    // celui qui vient de piocher laisse les cartes arriver (1,7 s), puis le tour passe au suivant ; si son navigateur ne le fait pas, un autre joueur de la table s'en charge (4,5 s)
    function schedAdvance(tid, st) {
      if (kindOf(tid) !== 'u' || !(st.wait >= 0)) return;
      var v = st.ver, go = function (onlyDrawer) { setTimeout(function () { var cur = G[tid]; if (!cur || cur.ver !== v || !(cur.wait >= 0) || !seat || seat.tid !== tid || (onlyDrawer && seat.local !== cur.turn)) return; mutate(tid, function (s2) { return MJ.unoAdvance(s2); }); }, onlyDrawer ? 1700 : 4500); };
      go(true); go(false);
    }
    function joinFn(ch) { return function (st) { return (ch.tid.charAt(0) === 'u' ? MJ.unoJoin : MJ.c4Join)(st, ch.local, me(), myName()); }; }
    function reconcile() {              // si l'état reçu ne me connaît pas (deux joueurs arrivés en même temps), je me réinscris ; si ma place est prise, je me lève
      if (!seat) return;
      var e = getSt(seat.tid).seats[seat.local];
      if (e && e.k === me()) return;
      if (e) { world.flash('Cette place est prise.'); stand(true); return; }
      mutate(seat.tid, joinFn(seat));
    }

    /* --- dessin des tables à partir de l'état --- */
    function renderTable(tid) {
      var tv = TV[tid], st = G[tid]; if (!tv || !st) return;
      if (tv.kind === 'u') renderUno(tv, st, tid); else renderC4(tv, st, tid);
    }
    function renderUno(tv, st, tid) {
      var top = st.disc[st.disc.length - 1];
      tv.top.visible = tv.ring.visible = !!top;
      var prev = st.disc[st.disc.length - 2]; tv.top2.visible = !!prev; if (prev) tv.top2.material = faceMat(prev);
      if (top) { tv.top.material = faceMat(top); tv.ring.material.color.set(st.col >= 0 && st.col < 4 ? COLORS[st.col] : '#888888'); }
      for (var s = 0; s < 4; s++) {
        var e = st.seats[s], hand = st.hands[s], n = hand ? hand.length : 0, h = tv.hands[s], vis = Math.min(n, 9), sa = h.sa, lb = tv.labels[s];
        for (var k = 0; k < 9; k++) {
          var cm = h.cards[k]; cm.visible = k < vis; if (k >= vis) continue;
          var off = k - (vis - 1) / 2;
          cm.rotation.z = -sa - Math.PI / 2 + off * 0.2;
          cm.position.set(Math.cos(sa) * UHR + Math.cos(sa + Math.PI / 2) * off * 0.1, 0.872 + k * 0.003, Math.sin(sa) * UHR + Math.sin(sa + Math.PI / 2) * off * 0.1);
        }
        lb.visible = !!e && !(seat && seat.tid === tid && seat.local === s);        // mon propre nom ne cache pas la table
        if (e) { var act = st.ph === 'play' && st.turn === s; var key = e.name + '|' + n + '|' + act + '|' + (st.win === s); if (lb.userData.key !== key) { lb.userData.key = key; setLabel(lb, (st.win === s ? '🏆 ' : act ? '▶ ' : '') + e.name, hand ? n + ' carte' + (n > 1 ? 's' : '') : (st.ph === 'play' ? 'spectateur' : 'prêt'), act || st.win === s); } }
      }
    }
    function renderC4(tv, st, tid) {
      var c, r, key, want = {};
      for (c = 0; c < 7; c++) for (r = 0; r < st.g[c].length; r++) {
        var p = st.g[c][r], inLine = !!(st.line && st.line.some(function (q) { return q[0] === c && q[1] === r; }));
        key = c + ',' + r; want[key] = true;
        var d = tv.discs[key], y1 = TT + 0.1 + C4_Y0 + r * C4_PITCH;
        if (d && d.p !== p) { tv.group.remove(d.m); delete tv.discs[key]; d = null; }
        if (!d) {
          var m = new THREE.Mesh(discGeo, p === 1 ? redM : yelM); m.rotation.x = Math.PI / 2; m.position.set((c - 3) * C4_PITCH, y1 + 0.6, 0); tv.group.add(m);
          d = tv.discs[key] = { m: m, p: p }; anims.push({ m: m, y0: y1 + 0.6, y1: y1, t: 0 });
        }
        d.m.material = inLine ? (p === 1 ? redG : yelG) : (p === 1 ? redM : yelM);
      }
      Object.keys(tv.discs).forEach(function (k) { if (!want[k]) { tv.group.remove(tv.discs[k].m); delete tv.discs[k]; } });
      var myTurn = !!seat && seat.tid === tid && st.ph === 'play' && st.turn === seat.local;
      tv.bars.forEach(function (b, c3) { b.visible = myTurn && st.g[c3].length < 6; });
      for (var s = 0; s < 2; s++) {
        var e = st.seats[s], lb = tv.labels[s]; lb.visible = !!e && !(seat && seat.tid === tid && seat.local === s);
        if (e) { var act = st.ph === 'play' && st.turn === s, k2 = e.name + '|' + act + '|' + (st.win === s); if (lb.userData.key !== k2) { lb.userData.key = k2; setLabel(lb, (st.win === s ? '🏆 ' : act ? '▶ ' : '') + e.name, s === 0 ? 'jetons rouges' : 'jetons jaunes', act || st.win === s, s === 0 ? '#ff6a6a' : '#ffe35a'); } }
      }
    }

    /* --- interface --- */
    function injectCss() {
      if (document.getElementById('mj3d-css')) return;
      var s = document.createElement('style'); s.id = 'mj3d-css';
      s.textContent = '.mj3d{position:absolute;left:50%;bottom:62px;transform:translateX(-50%);width:min(700px,94%);background:rgba(8,5,12,.9);border:1px solid rgba(201,162,39,.6);border-radius:14px;padding:8px 12px;color:#f4e3b0;pointer-events:auto;display:flex;flex-direction:column;gap:6px;font-family:inherit;z-index:5}' +
        '.mj3d .mj-msg{min-height:18px;text-align:center;font-weight:800;font-size:14px}.mj3d .mj-pl{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-weight:800;font-size:12px;color:#c9b88a}.mj3d .mj-pl b{color:#ffe35a}' +
        '.mj3d .mj-hand{display:flex;justify-content:center;padding:12px 0 2px}.mj3d .mj-hand button{flex:none;position:relative;border:2px solid transparent;border-radius:8px;padding:0;background:none;cursor:pointer;opacity:.55;transition:transform .12s,opacity .12s;box-shadow:-3px 0 7px rgba(0,0,0,.55)}.mj3d .mj-hand button:hover{transform:translateY(-14px);z-index:30!important;opacity:1}.mj3d .mj-hand button.ok{opacity:1;border-color:#ffe35a;transform:translateY(-8px)}.mj3d .mj-hand button.ok:hover{transform:translateY(-18px)}.mj3d .mj-hand img{display:block;width:64px;height:auto;border-radius:6px}' +
        '.mj3d .mj-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.mj3d .mj-b{padding:8px 16px;border-radius:12px;border:0;font-weight:900;font-size:14px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00)}.mj3d .mj-b:disabled{opacity:.4;cursor:not-allowed}.mj3d .mj-b.alt{background:#2a3b57;color:#e8f0ff}.mj3d .mj-b.uno{background:linear-gradient(90deg,#ff5a5a,#d6221e);color:#fff}.mj3d .mj-b.red{background:linear-gradient(90deg,#7c3aed,#c026d3);color:#fff;animation:mjGlow .5s ease-in-out infinite alternate}.mj3d kbd{opacity:.75;font-size:11px;margin-left:4px}' +
        '.mj3d .mj-col{width:54px;padding:8px 0;border-radius:10px;border:2px solid #6a7bff;background:#1c2556;color:#fff;font-weight:900;font-size:15px;cursor:pointer}.mj3d .mj-col:disabled{opacity:.35;cursor:not-allowed}' +
        '.mj3d .mj-clr{width:64px;height:40px;border-radius:10px;border:3px solid #fff;cursor:pointer}' +
        '.mj3d.myturn{border-color:#ffe35a;animation:mjGlow 1s ease-in-out infinite alternate}@keyframes mjGlow{from{box-shadow:0 0 0 rgba(255,227,90,0)}to{box-shadow:0 0 26px rgba(255,227,90,.85)}}' +
        '.mj-toast{position:absolute;left:50%;top:16%;transform:translateX(-50%) scale(.6);opacity:0;padding:16px 34px;border-radius:20px;text-align:center;pointer-events:none;z-index:9;font-weight:900;font-size:30px;color:#fff;border:3px solid #fff;transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1);max-width:90%}.mj-toast small{display:block;margin-top:4px;font-size:14px;font-weight:700;opacity:.92}.mj-toast.in{opacity:1;transform:translateX(-50%) scale(1)}' +
        '.mj-toast.turn{background:linear-gradient(90deg,#16a34a,#0f7a37);border-color:#ffe35a;box-shadow:0 0 22px rgba(255,227,90,.6);top:7%;padding:7px 20px;font-size:19px;border-width:2px;border-radius:14px}.mj-toast.hit{background:linear-gradient(90deg,#dc2626,#9b1111);border-color:#ffb3b3;box-shadow:0 0 36px rgba(255,60,60,.7);animation:mjShake .5s}.mj-toast.skip{background:linear-gradient(90deg,#f59e0b,#c2410c)}.mj-toast.win{background:linear-gradient(90deg,#f5c542,#d98a00);color:#2a1800}.mj-toast.info{background:linear-gradient(90deg,#2563eb,#1e3a8a)}@keyframes mjShake{20%{margin-left:-14px}40%{margin-left:12px}60%{margin-left:-8px}80%{margin-left:5px}}' +
        '.mj3d-stand{position:absolute;left:14px;bottom:70px;z-index:5;pointer-events:auto}.mj3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(201,162,39,.6);background:rgba(8,5,12,.85);color:#f4e3b0;font-weight:800;cursor:pointer}';
      s.textContent += '.mj-badge{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:4;pointer-events:none;padding:4px 14px;border-radius:999px;background:rgba(8,5,12,.55);border:1px solid rgba(255,227,90,.55);color:#ffe9a0;font-weight:800;font-size:12px;letter-spacing:.04em;opacity:0;transition:opacity .35s}.mj-badge.on{opacity:.85}';
      s.textContent += '.mj-fxpop{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);z-index:9;pointer-events:none;font-weight:900;font-size:clamp(54px,10vw,120px);color:#fff;text-shadow:0 5px 0 #000,0 0 34px currentColor;animation:mjFx 1.5s ease-out forwards}@keyframes mjFx{0%{opacity:0;transform:translate(-50%,-50%) scale(.2) rotate(-12deg)}18%{opacity:1;transform:translate(-50%,-50%) scale(1.25) rotate(4deg)}35%{transform:translate(-50%,-50%) scale(1) rotate(0)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-80%) scale(1.1)}}';
      s.textContent += '@media (max-height:520px){.mj3d{bottom:62px;width:min(560px,66%);padding:5px 8px;gap:3px}.mj3d .mj-msg{font-size:12px;min-height:14px}.mj3d .mj-hand img{width:36px}.mj3d .mj-b{padding:5px 10px;font-size:12px}.mj3d .mj-col{padding:5px 0}.mj3d-stand{bottom:auto;top:64px}.mj-toast{font-size:20px;padding:8px 18px}}';
      document.head.appendChild(s);
    }
    var AC = null;
    function ding(seq) {                                            // petits sons (sans fichier) pour attirer l'attention
      try {
        var A = F.audio, vol = A && typeof A.sfxVol === 'number' ? A.sfxVol : 0.7; AC = AC || new (window.AudioContext || window.webkitAudioContext)(); var t0 = AC.currentTime;
        seq.forEach(function (f, k) { var o = AC.createOscillator(), gn = AC.createGain(); o.type = 'sine'; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t0 + k * 0.14); gn.gain.exponentialRampToValueAtTime(0.05 * vol + 0.0001, t0 + k * 0.14 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.14 + 0.26); o.connect(gn); gn.connect(AC.destination); o.start(t0 + k * 0.14); o.stop(t0 + k * 0.14 + 0.3); });
      } catch (e) { /* pas de son */ }
    }
    var toastEl = null, toastT = 0, badgeEl = null;
    function toast(title, kind, sub) {
      if (!ui) return;
      if (!toastEl) { toastEl = document.createElement('div'); ui.el.parentNode.appendChild(toastEl); }
      toastEl.className = 'mj-toast ' + kind; toastEl.innerHTML = '<div>' + esc(title) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : ''); void toastEl.offsetWidth; toastEl.classList.add('in'); toastT = kind === 'hit' || kind === 'skip' ? 4.2 : kind === 'turn' ? 1.3 : 3.2;
      ding(kind === 'turn' ? [660, 880] : kind === 'hit' ? [330, 220] : kind === 'skip' ? [440, 330] : kind === 'win' ? [660, 880, 1100] : [520]);
    }
    function announce(tid, old, st) {
      if (!seat || seat.tid !== tid || !st || st.ph === 'wait') return;
      old = old || {}; var loc = seat.local, msg = st.msg || '', nm0 = myName(), mine = st.turn === loc;
      if (st.ph === 'over') { if (old.ph !== 'over') { if (st.win === loc) toast('🏆 Tu as gagné !', 'win'); else if (kindOf(tid) === 'c' && st.win === 2) toast('🤝 Match nul', 'info'); else toast('😵 Perdu…', 'hit', msg); } return; }
      if (st.ph !== 'play') return;
      if (kindOf(tid) === 'u') {
        var oh = old.hands && old.hands[loc], nh = st.hands && st.hands[loc];
        if (st.org !== me() && mine && st.pend > 0 && old.pend !== st.pend) { toast('⚠️ +' + st.pend + ' !', 'hit', 'Réponds avec un ' + (st.pk === 'F' ? '+4' : '+2') + ' ou pioche ' + st.pend + ' cartes'); return; }
        if (st.org !== me() && old.vuln === loc && st.vuln === -1 && oh && nh && nh.length >= oh.length + 2) { toast('😱 Contre UNO !', 'hit', 'Tu avais oublié de dire UNO : +2 cartes'); return; }
        if (st.org !== me() && st.hands && st.hands[loc] && st.vuln >= 0 && st.vuln !== loc && old.vuln !== st.vuln) { toast('⚠️ ' + ((st.seats[st.vuln] || {}).name || 'Un joueur') + " n'a pas dit UNO !", 'skip', 'Vite : appuie sur CONTRE UNO (C)'); return; }
        if (st.org !== me() && /crie UNO|: UNO !/.test(msg) && old.msg !== msg && !mine) toast('📣 UNO !', 'info', msg);
        if (st.org !== me() && oh && nh && nh.length >= oh.length + 2 && /pioche (2|4) cartes/.test(msg) && msg.indexOf(nm0 + ' pioche') >= 0) { toast('💥 +' + (nh.length - oh.length) + ' ! Tu pioches ' + (nh.length - oh.length) + ' cartes', 'hit', 'Ton tour est passé'); return; }
        if (st.org !== me() && msg.indexOf(nm0 + ' passe son tour') >= 0) { toast('⛔ Ton tour est passé !', 'skip', msg); return; }
        if (st.org !== me() && /Le sens change|Sens inversé/.test(msg) && !mine) toast('🔄 Le sens du jeu change', 'info');
      }
      if (mine && (old.ph !== 'play' || old.turn !== loc)) toast('👉 À toi de jouer', 'turn');
    }
    /* --- animations des cartes spéciales : +2, +4, UNO (visibles de toute la salle, dessinées sur la table) --- */
    var fxs = [];
    function fxAdd(o) { o.t = 0; fxs.push(o); }
    function fxText(tv, text, col, x, z) {
      var cv = mkCanvas(512, 256), c = cv.getContext('2d'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 170px ' + SERIF; c.lineJoin = 'round'; c.lineWidth = 26; c.strokeStyle = '#000'; c.strokeText(text, 256, 130, 480); c.fillStyle = col; c.fillText(text, 256, 130, 480);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(cv), transparent: true, depthTest: false })); sp.position.set(x, 1.3, z); sp.scale.set(0.01, 0.005, 1); sp.renderOrder = 20; tv.group.add(sp);
      fxAdd({ dur: 1.9, upd: function (u) { var k = u < 0.2 ? 1.25 * Math.sin(u / 0.2 * Math.PI / 2) : 1.25 - Math.min(0.25, (u - 0.2) * 0.4); sp.scale.set(1.05 * k, 0.525 * k, 1); sp.position.y = 1.25 + u * 0.4; sp.material.opacity = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1; }, end: function () { tv.group.remove(sp); sp.material.map.dispose(); sp.material.dispose(); } });
    }
    function fxRing(tv, col, x, z) {
      var m = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.9, z); tv.group.add(m);
      fxAdd({ dur: 1.0, upd: function (u) { m.scale.setScalar(1 + u * 7); m.material.opacity = 0.9 * (1 - u); }, end: function () { tv.group.remove(m); m.geometry.dispose(); m.material.dispose(); } });
    }
    function fxFlyers(tv, seatLocal, n) {                          // des cartes volent de la pioche vers la main de celui qui pioche
      var h = tv.hands[seatLocal]; if (!h) return;
      for (var q = 0; q < Math.min(n, 8); q++) (function (q) {
        var m = new THREE.Mesh(cardGeo, backM); m.rotation.x = -Math.PI / 2; m.visible = false; tv.group.add(m);
        var tx = Math.cos(h.sa) * UHR, tz = Math.sin(h.sa) * UHR;
        fxAdd({ dur: 0.85 + q * 0.16, upd: function (u, t) { var d = q * 0.16; if (t < d) { m.visible = false; return; } var v = Math.min(1, (t - d) / 0.85); m.visible = true; var e = v * v * (3 - 2 * v); m.position.set(-0.5 + (tx + 0.5) * e, 0.95 + Math.sin(v * Math.PI) * 0.6, (tz) * e); m.rotation.z = v * 9; }, end: function () { tv.group.remove(m); } });
      })(q);
    }
    var lastFxVer = {}, lastVoice = { f: '', t: 0 }, vq = [], vNow = null, COLOR_VOICE = ['rouge', 'jaune', 'vert', 'bleu'];
    function masterVol() { try { return typeof getMasterVolume === 'function' ? getMasterVolume() : 0.5; } catch (e) { return 0.5; } }
    function vPump() {
      if (vNow || !vq.length) return;
      var o = vq.shift(); if (performance.now() - o.t > 9000) { vPump(); return; }
      var vol = Math.min(1, masterVol() * 0.45);      // voix du jeu : très basses if (vol <= 0) { vPump(); return; }
      try {
        var a = new Audio('assets/sons/' + (o.f.indexOf('/') >= 0 ? o.f : 'uno/' + o.f) + '.mp3'); a.volume = vol; vNow = a;
        var done = function () { if (vNow === a) { vNow = null; vPump(); } };
        a.onended = done; a.onerror = done; setTimeout(done, 8000);
        var pr = a.play(); if (pr && pr.catch) pr.catch(done);
      } catch (e) { vNow = null; }
    }
    function hash(n) { n = (n * 2654435761) >>> 0; n ^= n >>> 15; n = (n * 2246822519) >>> 0; n ^= n >>> 13; return n >>> 0; }
    function fx3d(tid, old, st) {
      try {
        if (kindOf(tid) === 'c') {                                    // Puissance 4 : la voix « perdu » n'est entendue que par celui qui perd (pas en cas de match nul)
          if (old && old.ph === 'play' && st.ph === 'over' && (lastFxVer[tid] || 0) < st.ver && seat && seat.tid === tid && st.win >= 0 && st.win < 2 && st.win !== seat.local) { lastFxVer[tid] = st.ver; vq.push({ f: 'puissance4/perdu', t: performance.now() }); vPump(); }
          return;
        }
        var tv = TV[tid]; if (!tv || tv.kind !== 'u' || !old || !old.hands || !st || (st.ph !== 'play' && st.ph !== 'over') || old.ph !== 'play' || old.ver >= st.ver) return;
        if ((lastFxVer[tid] || 0) >= st.ver) return; lastFxVer[tid] = st.ver;                 // chaque changement d'état n'est traité qu'une fois : jamais deux sons d'affilée
        var seatNow = seat && seat.tid === tid, said = {};
        // voix du jeu : entendues seulement par ceux qui sont assis à cette table (pas par les gens autour) ; celle du gagnant n'est entendue que par lui
        function voice(file) { var now = performance.now(); if (!seatNow || (lastVoice.f === file && now - lastVoice.t < 1500)) return; lastVoice = { f: file, t: now }; vq.push({ f: file, t: now }); vPump(); }
        var chance = function (k, pct) { return hash(st.ver * 31 + k) % 100 < pct; };                // tirage identique pour tous les joueurs de la table
        // voix des +2 / +4 / +6 / +8 : parfois aucune, et deux enregistrements pour chaque +2, +4, +6, +8 (le nouveau plus souvent). Le tirage vient du numéro de l'état : tous les joueurs de la table entendent la même chose.
        function plusVoice(n) { var r = hash(st.ver) % 100; if (r < 25) return; voice('plus' + n + (hash(st.ver + 7) % 3 !== 0 ? 'b' : '')); }
        if (st.ph === 'over') { if (st.win === (seat && seat.local) && seatNow) voice(chance(5, 50) ? 'victoire' : 'gagner'); return; }
        if (old.dir !== undefined && st.dir !== old.dir) voice('sens');                  // le sens du jeu change : la voix le dit (les flèches de la table se retournent)
        if (st.disc.length > old.disc.length) {
          var top = st.disc[st.disc.length - 1], v = top.slice(1);
          if (v === 'D' || v === 'F') {
            var col = v === 'D' ? '#ff6a4a' : '#d946ef';
            fxText(tv, v === 'D' ? '+2' : '+4', col, 0.5, 0); fxRing(tv, v === 'D' ? 0xff6a4a : 0xd946ef, 0.5, 0);
            var pn = Math.max(2, Math.min(8, Math.round((st.pend > 0 ? st.pend : (v === 'D' ? 2 : 4)) / 2) * 2)); plusVoice(pn);
            if (old.pend > 0 && st.pend > old.pend && (v === 'D' || v === 'F')) voice('quipioche');       // un +2 sur un +2, un +4 sur un +4 : qui va devoir piocher ?
            if (seatNow) { ding([330, 220, 165]); if (st.turn !== seat.local && st.org !== me()) toast('💥 ' + ((st.seats[old.turn] || {}).name || 'Un joueur') + ' joue un ' + (v === 'D' ? '+2' : '+4') + ' !', 'info'); }
          } else if (v === 'S' || v === 'R') fxText(tv, v === 'S' ? '⛔' : '🔄', '#ffd24a', 0.5, 0);
          if (v === 'W' || v === 'F') {                                                  // changement de couleur : la même qu'avant -> Cléa ; sinon, parfois, « changement de couleur » puis la couleur choisie
            if (st.col === old.col) voice('clea'); else if (chance(2, 65)) { voice('changement'); voice(COLOR_VOICE[st.col]); }
          }
        }
        for (var s = 0; s < 4; s++) {
          var oh = old.hands[s], nh = st.hands[s]; if (!oh || !nh) continue;
          if (nh.length >= oh.length + 1) fxFlyers(tv, s, nh.length - oh.length);
          if (old.pend > 0 && st.pend === 0 && nh.length >= oh.length + 2 && seat && seat.local === s) voice('tupioche');      // celui qui paie la pénalité : « tu pioches »
          if (st.said && st.said[s] && !(old.said && old.said[s])) voice('uno');
          if ((nh.length === 1 && oh.length !== 1) || (st.said && st.said[s] && !(old.said && old.said[s]))) {
            if (said[s]) continue; said[s] = 1; var hh = tv.hands[s];
            fxText(tv, 'UNO !', '#ffe35a', Math.cos(hh.sa) * (UHR + 0.1), Math.sin(hh.sa) * (UHR + 0.1)); fxRing(tv, 0xffe35a, Math.cos(hh.sa) * UHR, Math.sin(hh.sa) * UHR);
            if (seatNow) ding([660, 880, 1100]);
          }
        }
      } catch (e) { /* animation seulement */ }
    }
    function setHtml(el, h) { if (el && el.__h !== h) { el.__h = h; el.innerHTML = h; } }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function buildUi(w) {
      injectCss();
      var el = document.createElement('div'); el.className = 'mj3d'; el.innerHTML = '<div class="mj-msg"></div><div class="mj-pl"></div><div class="mj-body"></div>';
      w.container.appendChild(el);
      badgeEl = document.createElement('div'); badgeEl.className = 'mj-badge'; badgeEl.textContent = '👉 À toi de jouer'; w.container.appendChild(badgeEl);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled || !seat) return;
        var a = b.dataset.a, tid = seat.tid, loc = seat.local, err = '';
        if (a === 'start') err = mutate(tid, function (st) { return kindOf(tid) === 'u' ? MJ.unoStart(st) : MJ.c4Start(st); });
        else if (a === 'draw') err = mutate(tid, function (st) { return MJ.unoDrawTurn(st, loc); });
        else if (a === 'pass') err = mutate(tid, function (st) { return MJ.unoPass(st, loc); });
        else if (a === 'uno') err = mutate(tid, function (st) { return MJ.unoSayUno(st, loc); });
        else if (a === 'counter') err = mutate(tid, function (st) { return MJ.unoCounter(st, loc); });
        else if (a === 'card') playCard(+b.dataset.i);
        else if (a === 'color') { var i = pendingWild; pendingWild = -1; err = mutate(tid, function (st) { return MJ.unoPlay(st, loc, i, +b.dataset.c); }); }
        else if (a === 'nocolor') { pendingWild = -1; refreshUi(); }
        else if (a === 'col') err = dropCol(+b.dataset.c);
        if (err) { errMsg = err; errT = 3; refreshUi(); }
      });
      return { el: el };
    }
    function playCard(i) {
      var st = getSt(seat.tid), hand = st.hands[seat.local]; if (!hand || !hand[i]) return;
      if (st.turn !== seat.local || st.ph !== 'play') { errMsg = 'Ce n\'est pas ton tour.'; errT = 3; refreshUi(); return; }
      if (!MJ.unoCanPlay(st, hand[i])) { errMsg = st.pend > 0 ? 'Il y a un +' + st.pend + ' en attente : réponds avec un ' + (st.pk === 'F' ? '+4' : '+2') + ' ou pioche.' : 'Cette carte ne va pas.'; errT = 3; refreshUi(); return; }
      if (MJ.cardColor(hand[i]) === 4) { if (st.drawn && hand[i] !== st.drawn) { errMsg = 'Tu peux seulement poser la carte piochée, ou passer.'; errT = 3; } else pendingWild = i; refreshUi(); return; }
      var e = mutate(seat.tid, function (s2) { return MJ.unoPlay(s2, seat.local, i, -1); });
      if (e) { errMsg = e; errT = 3; refreshUi(); }
    }
    function dropCol(c) { var tid = seat.tid, loc = seat.local; return mutate(tid, function (st) { return MJ.c4Drop(st, loc, c); }); }
    function refreshUi() {
      if (!ui || !seat) return;
      var st = getSt(seat.tid), u = kindOf(seat.tid) === 'u', mine = st.ph === 'play' && st.turn === seat.local && !(st.wait >= 0);
      var msg = errT > 0 ? errMsg : (st.msg || (Object.keys(st.seats).length < 2 ? 'En attente d\'un autre joueur…' : 'Tout le monde est là : lance la partie !'));
      ui.el.classList.toggle('myturn', mine);
      if (badgeEl) badgeEl.classList.toggle('on', mine);
      if (st.ph === 'play' && mine && errT <= 0) msg = '👉 À toi de jouer ! ' + (st.msg && st.msg.indexOf('Au tour') !== 0 ? '— ' + st.msg : '');
      var m = ui.el.querySelector('.mj-msg'); if (m.textContent !== msg) m.textContent = msg; m.style.color = errT > 0 ? '#ff8a80' : (st.ph === 'over' && st.win === seat.local ? '#7ee0a0' : '');
      var pl = Object.keys(st.seats).map(Number).sort().map(function (n) {
        var e = st.seats[n], cnt = u && st.hands[n] ? ' · ' + st.hands[n].length + ' 🂠' : '', dot = u ? '' : (n === 0 ? '🔴 ' : '🟡 ');
        return (st.ph === 'play' && st.turn === n ? '<b>▶ ' : '<span>') + dot + esc(e.name) + cnt + (st.ph === 'play' && st.turn === n ? '</b>' : '</span>');
      }).join('') + (u && st.ph === 'play' ? '<span>Couleur : <b style="color:' + COLORS[st.col] + '">' + MJ.COLOR_NAMES[st.col] + '</b></span>' : '');
      setHtml(ui.el.querySelector('.mj-pl'), pl);
      var body = '', startTxt = st.ph === 'over' ? '🔁 Rejouer' : '▶ Lancer la partie', canStart = u ? Object.keys(st.seats).length >= 2 : !!(st.seats[0] && st.seats[1]);
      if (u) {
        var hand = st.hands[seat.local] || [];
        if (pendingWild >= 0) body = '<div class="mj-row">' + COLORS.map(function (c, k) { return '<button class="mj-clr" data-a="color" data-c="' + k + '" style="background:' + c + '"></button>'; }).join('') + '<button class="mj-b alt" data-a="nocolor">Annuler</button></div>';
        else {
          if (hand.length) {                                  // toute la main tient sur la largeur : plus il y a de cartes, plus elles se chevauchent
            var bw = (window.matchMedia && window.matchMedia('(max-height:520px)').matches ? 36 : 64) + 4, availW = Math.max(240, ui.el.clientWidth - 30), step = hand.length > 1 ? Math.min(bw + 6, (availW - bw) / (hand.length - 1)) : 0;
            body += '<div class="mj-hand">' + hand.map(function (c, i) { return '<button data-a="card" data-i="' + i + '" style="' + (i ? 'margin-left:' + Math.round(step - bw) + 'px;' : '') + 'z-index:' + i + '" class="' + (mine && MJ.unoCanPlay(st, c) && (!st.drawn || st.drawn === c) ? 'ok' : '') + '"><img src="' + faceImg(c) + '" alt=""></button>'; }).join('') + '</div>';
          }
          body += '<div class="mj-row">';
          if (st.ph === 'play' && hand.length) body += '<button class="mj-b" data-a="draw"' + (mine && !st.drawn ? '' : ' disabled') + '>🂠 Piocher' + (st.pend > 0 ? ' ' + st.pend : '') + '</button>' + (st.drawn && mine ? '<button class="mj-b alt" data-a="pass">Passer</button>' : '')
            + ((st.vuln === seat.local || (mine && hand.length === 2 && !(st.said && st.said[seat.local]) && hand.some(function (c) { return MJ.unoCanPlay(st, c); }))) ? '<button class="mj-b uno" data-a="uno">📣 UNO ! <kbd>U</kbd></button>' : '')
            + (st.vuln >= 0 && st.vuln !== seat.local ? '<button class="mj-b red" data-a="counter">⚡ CONTRE UNO ! <kbd>C</kbd></button>' : '');
          else if (st.ph === 'play') body += '<div style="font-weight:800;font-size:13px;color:#c9b88a;text-align:center">👀 Une partie est en cours : tu joueras à la prochaine manche, quand elle sera finie.</div>';
          else body += '<button class="mj-b" data-a="start"' + (canStart ? '' : ' disabled') + '>' + startTxt + '</button>';
          body += '</div>';
        }
      } else {
        var mir = seat.local === 1, cols = [0, 1, 2, 3, 4, 5, 6].map(function (v) { return mir ? 6 - v : v; });      // le joueur du côté opposé voit la grille à l'envers
        if (st.ph === 'play') body = '<div class="mj-row" style="font-weight:800;font-size:13px;color:' + (mine ? '#ffe35a' : '#c9b88a') + '">' + (mine ? '👆 Clique sur la colonne de la grille où tu veux poser ton jeton (ou touches 1 à 7)' : 'Ton adversaire réfléchit…') + '</div>';
        else body = '<div class="mj-row"><button class="mj-b" data-a="start"' + (canStart ? '' : ' disabled') + '>' + startTxt + '</button></div>';
      }
      setHtml(ui.el.querySelector('.mj-body'), body);
    }

    /* --- s'asseoir / se lever --- */
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if (kindOf(seat.tid) === 'u' && (e.code === 'KeyU' || e.code === 'KeyC')) {
        e.stopImmediatePropagation(); e.preventDefault();
        var loc0 = seat.local, err0 = mutate(seat.tid, function (st) { return e.code === 'KeyU' ? MJ.unoSayUno(st, loc0) : MJ.unoCounter(st, loc0); }); if (err0) { errMsg = err0; errT = 3; refreshUi(); }
      }
      else if (kindOf(seat.tid) === 'c' && /^(Digit|Numpad)[1-7]$/.test(e.code)) {
        e.stopImmediatePropagation(); e.preventDefault();
        var v = +e.code.slice(-1) - 1, err = dropCol(seat.local === 1 ? 6 - v : v); if (err) { errMsg = err; errT = 3; refreshUi(); }
      }
    }
    function sit(w, ch) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (!loggedIn()) { w.flash('Connecte-toi pour jouer aux mini jeux.'); return; }
      if (chairTaken(ch)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = ch; view.yaw = view.pitch = 0; pendingWild = -1; errT = 0;
      ui = buildUi(w);
      standEl = document.createElement('div'); standEl.className = 'mj3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.firstChild.addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl);
      window.addEventListener('keydown', onSeatKey, true);
      if (world.rt && world.rt.ready) { try { world.rt.send('gq', { k: me(), tid: ch.tid }); } catch (e) { /* ok */ } }
      mutate(ch.tid, joinFn(ch)); renderTable(ch.tid); refreshUi();
    }
    function stand(silent) {
      if (!seat) return;
      var s = seat; seat = null; pendingWild = -1; if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl); toastEl = null; if (badgeEl && badgeEl.parentNode) badgeEl.parentNode.removeChild(badgeEl); badgeEl = null; renderTable(s.tid);
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      if (G[s.tid] && G[s.tid].seats[s.local] && G[s.tid].seats[s.local].k === me()) mutate(s.tid, function (st) { return (kindOf(s.tid) === 'u' ? MJ.unoLeave : MJ.c4Leave)(st, s.local); });
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.standKey = false;
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.11, z: 0.28 };
    room.remotePose = function (r) { for (var k = 0; k < chairs.length; k++) if (chairs[k].n === r.seat) return { x: chairs[k].x, z: chairs[k].z, yaw: chairs[k].yaw }; return null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) {
      if (!seat) return;
      view.yaw = Math.max(-1.2, Math.min(1.2, drag.seat.yaw - dx * 0.006));
      if (drag.mouse) view.pitch = Math.max(-0.45, Math.min(0.35, drag.seat.pitch - dy * 0.004));
    };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.8; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      var u = kindOf(s.tid) === 'u', tc = world.touch && !u, ex = s.x + (s.tx - s.x) * (u ? 0.12 : tc ? 0.1 : -0.35), ey = u ? 1.7 : tc ? 1.75 : 1.85, ez = s.z + (s.tz - s.z) * (u ? 0.12 : tc ? 0.1 : -0.35), ty = u ? 0.86 : tc ? 0.9 : 1.3;
      var a = Math.atan2(s.tx - ex, -(s.tz - ez)) + view.yaw, p = Math.atan2(ty - ey, Math.hypot(s.tx - ex, s.tz - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 62 };
    };
    room.seatClick = function (ray) {
      if (!seat || kindOf(seat.tid) !== 'c') return;
      var hit = ray.intersectObjects(TV[seat.tid].hits, false)[0];
      if (!hit) return;
      var err = dropCol(hit.object.userData.col); if (err) { errMsg = err; errT = 3; refreshUi(); }
    };
    room.syncHud = function () { refreshUi(); };

    /* --- réseau : on envoie l'état quand il change, on le redemande en arrivant --- */
    room.onRtMsg = function (ev, m) {
      if (ev === 'gs') { if (TIDS.indexOf(m.tid) >= 0 && okState(m.tid, m.st)) adopt(m.tid, m.st); }
      else if (ev === 'gq') { (m.tid === '*' ? TIDS : [m.tid]).forEach(function (tid) { var st = G[tid]; if (st && Object.keys(st.seats).length) bcast(tid); }); }
    };
    room.netStart = function (w) {
      if (!w.rt) return;
      var old = w.rt.onReady, ask = function () { try { w.rt.send('gq', { k: me(), tid: '*' }); } catch (e) { /* ok */ } };
      w.rt.onReady = function () { if (old) old(); ask(); };
      if (w.rt.ready) ask();
    };
    // quelqu'un qui n'envoie plus rien (parti sans se lever) est retiré de sa table au bout de 7 s, par le joueur assis le plus à gauche
    function prune() {
      var now = performance.now();
      TIDS.forEach(function (tid) {
        var st = G[tid]; if (!st) return;
        Object.keys(st.seats).forEach(function (ns) {
          var n = +ns, e = st.seats[n], mk = tid + ':' + n;
          if (e.k === me() || present(tid, n, e)) { delete missing[mk]; return; }
          if (!missing[mk]) { missing[mk] = now; return; }
          if (now - missing[mk] < 7000) return;
          delete missing[mk];
          var leave = kindOf(tid) === 'u' ? MJ.unoLeave : MJ.c4Leave;
          if (seat && seat.tid === tid) { var lowest = Object.keys(st.seats).map(Number).sort()[0]; if (st.seats[lowest] && (st.seats[lowest].k === me() || present(tid, lowest, st.seats[lowest]))) mutate(tid, function (s2) { return leave(s2, n); }); }
          else if (!seat || seat.tid !== tid) { var c2 = clone(st); leave(c2, n); G[tid] = c2; renderTable(tid); }
        });
      });
    }

    // lumières
    g.add(new THREE.AmbientLight(0xf0e0e8, 1.2));
    if (!low) [[UNO_X, -2.75], [UNO_X, 2.75], [C4_X, -2.75], [C4_X, 2.75]].forEach(function (p) { var l = new THREE.PointLight(0xffd9a0, 0.8, 11); l.position.set(p[0], 4.2, p[1]); g.add(l); });
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall', theme: 'exitUno' });
    room.spawn = function (from) { return from === 'vault' ? { x: 0, z: -HZ + 2.8, yaw: Math.PI } : from === 'ludo' ? { x: (LO_A + LO_B) / 2, z: -HZ + 2.8, yaw: Math.PI } : { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un fauteuil pour jouer' : 'ZQSD / flèches : marcher · Maj : courir · à gauche : UNO (2 à 4 joueurs), à droite : Puissance 4 (2 joueurs) · avance vers un fauteuil (F ou clic) pour t\'asseoir et jouer avec les autres · F : se lever' + (w.full ? ' · Échap : quitter' : ''); };
    room.onLeave = function () { stand(); };
    room._etat = function () { return G; };
    room._dbg = { adopt: adopt, toast: toast, renderTable: renderTable, seatOf: function () { return seat; } };
    room.dispose = function () { stand(); };
    var slow = { key: '', t: 0, done: false };
    var arrowClock = 0;
    room.update = function (dt) {
      arrowClock += dt;
      TIDS.forEach(function (tid) {
        var tv = TV[tid], st = G[tid]; if (!tv || tv.kind !== 'u') return;
        var on = !!st && st.ph === 'play', dir = st && st.dir < 0 ? -1 : 1, pulse = 1 + 0.1 * Math.sin(arrowClock * 3.2);
        tv.arrows.forEach(function (a) {
          a.g.visible = on; if (!on) return;
          var target = a.am + dir * Math.PI / 2, d = target - a.phi; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          a.phi += d * Math.min(1, dt * 5); a.g.rotation.y = -a.phi; a.g.scale.setScalar(pulse);
        });
        tv.heads.forEach(function (h, s2) { var act = on && st.turn === s2 && st.hands[s2] && !(st.wait >= 0 && false); h.visible = act; if (act) { h.position.y = 1.95 + 0.09 * Math.sin(arrowClock * 5); h.rotation.y += dt * 2; } });
      });
      if (seat && kindOf(seat.tid) === 'u') {                                              // quelqu'un met trop de temps à jouer : la voix le rappelle à l'ordre (une fois par tour)
        var sst = G[seat.tid], skey = sst && sst.ph === 'play' && Object.keys(sst.hands).length > 1 ? sst.turn + '|' + sst.disc.length + '|' + (sst.pend | 0) + '|' + (sst.drawn || '') : '';
        if (skey !== slow.key) { slow.key = skey; slow.t = 0; slow.done = false; } else if (skey && !slow.done && (slow.t += dt) > 22) { slow.done = true; lastVoice = { f: 'trop-long', t: performance.now() }; vq.push({ f: 'trop-long', t: performance.now() }); vPump(); }
      }
      if (seat && kindOf(seat.tid) === 'c') {                                              // Puissance 4 : si on met du temps à jouer, une voix le dit (un seul seuil tiré au hasard par tour : 30, 40, 50 ou 60 s, parfois aucun)
        var cst = G[seat.tid], ckey = cst && cst.ph === 'play' ? cst.turn + '|' + cst.g.reduce(function (a, c) { return a + c.length; }, 0) : '';
        if (ckey !== slow.key) { slow.key = ckey; slow.t = 0; slow.done = false; slow.thr = ckey && hash(cst.ver * 17 + 3) % 100 >= 20 ? [30, 40, 50, 60][hash(cst.ver * 13 + 1) % 4] : 0; }
        else if (ckey && slow.thr && !slow.done && (slow.t += dt) > slow.thr) { slow.done = true; vq.push({ f: 'puissance4/temps', t: performance.now() }); vPump(); }
      }
      for (var fi = fxs.length - 1; fi >= 0; fi--) { var fo = fxs[fi]; fo.t += dt; var fu = Math.min(1, fo.t / fo.dur); fo.upd(fu, fo.t); if (fu >= 1) { fo.end(); fxs.splice(fi, 1); } }
      if (world.mode === 'room' && !world.trans && world.blend === 0 && world.hasRoom('ludo') && world.player.z < -HZ + 1.15 && Math.abs(world.player.x - (LO_A + LO_B) / 2) < (LO_B - LO_A) / 2 - 0.2) world.goRoom('ludo', 'uno');     // 2e ouverture : le Ludo
      if (world.mode === 'room' && !world.trans && world.blend === 0 && world.hasRoom('vault') && world.player.z < -HZ + 1.15 && Math.abs(world.player.x) < OG - 0.2) world.goRoom('vault', 'uno');     // on franchit l'ouverture : fondu vers la Chambre Forte
      else if (world.touch && world.mode === 'room' && !world.hasRoom('vault') && world.player.z < -HZ + 1.15 && Math.abs(world.player.x) < OG - 0.2 && performance.now() - (room._vf || 0) > 4000) { room._vf = performance.now(); world.flash('🔐 Chambre Forte', 'Bientôt sur téléphone'); }
      if (errT > 0) { errT -= dt; if (errT <= 0 && ui) refreshUi(); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && toastEl) toastEl.classList.remove('in'); }
      var tnow = performance.now() / 1000;
      TIDS.forEach(function (tid2) { var tv2 = TV[tid2]; if (tv2.kind !== 'c') return; tv2.bars.forEach(function (b) { if (!b.visible) return; b.children[0].material.opacity = 0.16 + 0.12 * Math.sin(tnow * 5); b.children[1].position.y = b.children[1].userData.y0 + 0.035 * Math.sin(tnow * 6); }); });
      pruneT += dt; if (pruneT > 1.5) { pruneT = 0; prune(); }
      for (var k = anims.length - 1; k >= 0; k--) {
        var a = anims[k]; a.t += dt / 0.42; var u = Math.min(1, a.t), y = a.y1 + (a.y0 - a.y1) * (1 - u) * (1 - u);
        if (u >= 0.85) y += Math.sin((u - 0.85) / 0.15 * Math.PI) * 0.012;
        a.m.position.y = y; if (u >= 1) { a.m.position.y = a.y1; anims.splice(k, 1); }
      }
    };
    return room;
  }

  F.registerRoom('uno', createUnoRoom);
})();
