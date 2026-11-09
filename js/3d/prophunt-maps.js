/* =====================================================================
   prophunt-maps.js — PROP HUNT : le décor des six cartes (sols, murs, plafonds, tableaux, fenêtres, néons, lumières, ciel, pluie)
   ---------------------------------------------------------------------
   F3D.propMaps.build(map) → { group, fog, update(dt, camera), dispose() } ; map vient de F3D.propSim.makeMap(id) : murs, pièces, portes, blocs, objets.
   Les objets eux-mêmes (chaises, machines à sous, conteneurs…) sont posés par prophunt3d.js avec F3D.propModels.
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D; if (!F || !window.THREE || !F.propTex || !F.propModels) return;
  var THREE = window.THREE, TAU = Math.PI * 2, PT = F.propTex, PM = F.propModels, T = PT.T, rng = PT.rng, cv = PT.cv, tex = PT.tex;

  var MC = {};
  function mat(key, o) { return MC[key] || (MC[key] = new THREE.MeshStandardMaterial(o)); }
  function glowMat(key, color, power, extra) { var o = { color: color, emissive: color, emissiveIntensity: power || 1.5, roughness: 0.4 }; if (extra) for (var k in extra) o[k] = extra[k]; return mat('G' + key, o); }

  // une boîte dont la texture se répète tous les ts mètres
  function boxT(w, h, d, m, ts) {
    var g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, s = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], f, k, i;
    for (f = 0; f < 6; f++) for (k = 0; k < 4; k++) { i = f * 4 + k; uv.setXY(i, uv.getX(i) * s[f][0] / ts, uv.getY(i) * s[f][1] / ts); }
    return new THREE.Mesh(g, m);
  }
  function floorPlane(x0, z0, x1, z1, m, ts, y) {
    var w = x1 - x0, d = z1 - z0, g = new THREE.PlaneGeometry(w, d), uv = g.attributes.uv, i;
    for (i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / ts, uv.getY(i) * d / ts);
    var p = new THREE.Mesh(g, m); p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, y || 0, (z0 + z1) / 2); return p;
  }
  function pl(g, w, h, m, x, y, z, ry) { var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry || 0; g.add(p); return p; }

  /* ------------------------------ tableaux, fenêtres, enseignes (textures dessinées) ------------------------------ */
  var ART = [];
  function artMat(i) {
    i = i % 6; if (ART[i]) return ART[i];
    var c = cv(256, 320), x = c.getContext('2d'), r = rng(100 + i), g;
    if (i === 0) { g = x.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, '#f0b070'); g.addColorStop(0.55, '#e8805a'); g.addColorStop(0.56, '#2a3a5a'); g.addColorStop(1, '#101a2a'); x.fillStyle = g; x.fillRect(0, 0, 256, 320); x.fillStyle = '#ffe9a0'; x.beginPath(); x.arc(128, 150, 40, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,0.2)'; for (var k = 0; k < 8; k++) x.fillRect(60 + r() * 130, 180 + k * 16, 40 + r() * 60, 3); }
    else if (i === 1) { g = x.createLinearGradient(0, 0, 256, 320); g.addColorStop(0, '#2a3f2a'); g.addColorStop(1, '#0e1a12'); x.fillStyle = g; x.fillRect(0, 0, 256, 320); x.fillStyle = '#d8b48a'; x.beginPath(); x.ellipse(128, 120, 46, 58, 0, 0, TAU); x.fill(); x.fillStyle = '#2a1a10'; x.beginPath(); x.ellipse(128, 80, 52, 36, 0, Math.PI, TAU); x.fill(); x.fillStyle = '#7a1a2a'; x.fillRect(70, 190, 116, 130); x.fillStyle = '#111'; x.fillRect(112, 108, 8, 6); x.fillRect(138, 108, 8, 6); }
    else if (i === 2) { g = x.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, '#7aa0c8'); g.addColorStop(1, '#c8d8a8'); x.fillStyle = g; x.fillRect(0, 0, 256, 320); x.fillStyle = '#4a7a3a'; x.beginPath(); x.moveTo(0, 230); x.quadraticCurveTo(80, 150, 160, 220); x.quadraticCurveTo(220, 170, 256, 210); x.lineTo(256, 320); x.lineTo(0, 320); x.fill(); x.fillStyle = '#2a5a2a'; x.beginPath(); x.moveTo(0, 270); x.quadraticCurveTo(100, 230, 256, 280); x.lineTo(256, 320); x.lineTo(0, 320); x.fill(); x.fillStyle = '#fff'; for (k = 0; k < 4; k++) { x.beginPath(); x.ellipse(40 + r() * 170, 50 + r() * 40, 30, 10, 0, 0, TAU); x.fill(); } }
    else if (i === 3) { x.fillStyle = '#12121e'; x.fillRect(0, 0, 256, 320); for (k = 0; k < 14; k++) { x.fillStyle = ['#e03a5a', '#f0c040', '#3ab0e0', '#fff', '#8a3ae0'][k % 5]; x.globalAlpha = 0.75; x.beginPath(); x.ellipse(r() * 256, r() * 320, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, TAU); x.fill(); } x.globalAlpha = 1; }
    else if (i === 4) { x.fillStyle = '#d8cfae'; x.fillRect(0, 0, 256, 320); x.fillStyle = '#3a2a1a'; x.fillRect(0, 230, 256, 90); x.fillStyle = '#a02a2a'; x.beginPath(); x.ellipse(90, 215, 26, 22, 0, 0, TAU); x.fill(); x.fillStyle = '#e0a020'; x.beginPath(); x.ellipse(140, 218, 22, 20, 0, 0, TAU); x.fill(); x.fillStyle = '#5a7ab0'; x.fillRect(165, 130, 44, 100); x.beginPath(); x.ellipse(187, 130, 22, 12, 0, 0, TAU); x.fill(); }
    else { g = x.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, '#0a2a4a'); g.addColorStop(1, '#2a1a5a'); x.fillStyle = g; x.fillRect(0, 0, 256, 320); x.strokeStyle = '#f0e0a0'; x.lineWidth = 3; for (k = 0; k < 7; k++) { x.beginPath(); x.arc(128, 320, 40 + k * 28, Math.PI, TAU); x.stroke(); } }
    var t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; ART[i] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }); return ART[i];
  }
  function paintingMesh(w, h, i, frameMat) {
    var g = new THREE.Group(), f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, h + 0.18, 0.07), frameMat); g.add(f);
    var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat(i)); p.position.z = 0.037; g.add(p); return g;
  }
  var WIN = {};
  function windowMat(kind) {
    if (WIN[kind]) return WIN[kind];
    var c = cv(256, 320), x = c.getContext('2d'), r = rng(7), g;
    if (kind === 'space') { x.fillStyle = '#02030a'; x.fillRect(0, 0, 256, 320); for (var i = 0; i < 160; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.3 + r() * 0.7) + ')'; x.fillRect(r() * 256, r() * 320, 1 + r() * 1.5, 1 + r() * 1.5); } g = x.createRadialGradient(170, 220, 10, 170, 220, 130); g.addColorStop(0, '#6aa8ff'); g.addColorStop(0.7, '#1a3a8a'); g.addColorStop(1, 'rgba(10,20,60,0)'); x.fillStyle = g; x.beginPath(); x.arc(170, 240, 130, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.ellipse(150, 200, 40, 10, -0.4, 0, TAU); x.fill(); }
    else { g = x.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, '#0a1230'); g.addColorStop(1, '#1d2a52'); x.fillStyle = g; x.fillRect(0, 0, 256, 320); x.fillStyle = '#e8eefc'; x.beginPath(); x.arc(170, 80, 30, 0, TAU); x.fill(); x.fillStyle = '#0a1230'; x.beginPath(); x.arc(182, 74, 26, 0, TAU); x.fill(); for (i = 0; i < 60; i++) { x.fillStyle = 'rgba(255,255,255,' + r() * 0.8 + ')'; x.fillRect(r() * 256, r() * 220, 1.5, 1.5); } x.fillStyle = '#05081a'; x.beginPath(); x.moveTo(0, 320); for (i = 0; i <= 8; i++) x.lineTo(i * 32, 250 + r() * 40); x.lineTo(256, 320); x.fill(); }
    x.strokeStyle = '#2a2018'; x.lineWidth = 8; x.strokeRect(4, 4, 248, 312); x.lineWidth = 5; x.beginPath(); x.moveTo(128, 4); x.lineTo(128, 316); x.moveTo(4, 130); x.lineTo(252, 130); x.stroke();
    var t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; WIN[kind] = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: kind === 'space' ? 0.9 : 0.7, roughness: 0.5 }); return WIN[kind];
  }
  var SIGNS = {};
  function signMat(text, c1, c2) {
    var key = text + c1 + c2; if (SIGNS[key]) return SIGNS[key];
    var c = cv(512, 128), x = c.getContext('2d'); x.fillStyle = 'rgba(8,4,16,0.92)'; x.fillRect(0, 0, 512, 128); x.strokeStyle = c1; x.lineWidth = 6; x.shadowColor = c1; x.shadowBlur = 18; x.strokeRect(10, 10, 492, 108); x.fillStyle = c2; x.font = '900 78px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = c2; x.shadowBlur = 22; x.fillText(text, 256, 68, 470); x.fillText(text, 256, 68, 470);
    var t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; SIGNS[key] = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.3, roughness: 0.5 }); return SIGNS[key];
  }

  /* ------------------------------ ciel ------------------------------ */
  function skyDome(style) {
    var c = cv(1024, 512), x = c.getContext('2d'), r = rng(31), g, i;
    if (style === 'port') { g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#0e1034'); g.addColorStop(0.35, '#4a2a6a'); g.addColorStop(0.46, '#d8587a'); g.addColorStop(0.5, '#ffb060'); g.addColorStop(0.5001, '#3a2a30'); g.addColorStop(1, '#14100e'); }
    else { g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#04041a'); g.addColorStop(0.3, '#161040'); g.addColorStop(0.47, '#5a2a6a'); g.addColorStop(0.5, '#a04a7a'); g.addColorStop(0.5001, '#1a1020'); g.addColorStop(1, '#0a0810'); }
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    for (i = 0; i < 260; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.7) + ')'; x.fillRect(r() * 1024, r() * 200, 1 + r() * 1.5, 1 + r() * 1.5); }
    if (style === 'port') { var sg = x.createRadialGradient(512, 246, 4, 512, 246, 90); sg.addColorStop(0, 'rgba(255,245,200,1)'); sg.addColorStop(0.2, 'rgba(255,190,100,0.9)'); sg.addColorStop(1, 'rgba(255,120,60,0)'); x.fillStyle = sg; x.fillRect(380, 130, 270, 130); }
    else { x.fillStyle = '#f2ecd8'; x.beginPath(); x.arc(700, 110, 34, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,240,200,0.12)'; x.beginPath(); x.arc(700, 110, 80, 0, TAU); x.fill(); }
    // la ligne d'horizon : la ville au loin (néons) ou le port (grues, bateau)
    x.fillStyle = '#07060d'; var px = 0;
    if (style === 'port') {
      while (px < 1024) { var bw = 18 + r() * 40, bh = 6 + r() * 26; x.fillRect(px, 256 - bh, bw, bh + 4); px += bw + 3; }
      for (i = 0; i < 4; i++) { var cx = 90 + i * 250 + r() * 60; x.fillRect(cx, 140, 5, 120); x.fillRect(cx - 60, 140, 140, 6); x.fillRect(cx + 60, 146, 3, 40); x.fillRect(cx - 40, 146, 3, 60); }
      x.fillRect(560, 214, 220, 44); x.fillRect(620, 190, 70, 26); x.fillRect(640, 170, 12, 24);
    } else {
      while (px < 1024) { var bw2 = 14 + r() * 36, bh2 = 14 + r() * 70; x.fillStyle = '#08060f'; x.fillRect(px, 256 - bh2, bw2, bh2 + 4); for (var wy = 0; wy < bh2 - 6; wy += 7) for (var wx = 3; wx < bw2 - 4; wx += 6) if (r() < 0.35) { x.fillStyle = ['#ffd070', '#ff6aa0', '#6ad0ff', '#fff'][Math.floor(r() * 4)]; x.globalAlpha = 0.8; x.fillRect(px + wx, 256 - bh2 + 4 + wy, 3, 3); x.globalAlpha = 1; } px += bw2 + 2; }
    }
    var t = tex(c); t.wrapS = THREE.RepeatWrapping;
    var m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false })); m.rotation.y = 0.6; return m;
  }

  /* ------------------------------ les styles ------------------------------ */
  var STYLE = {
    manoir: { wall: function () { return mat('w_manoir', { map: T('damask', 0x1d3a2c, 0x56805a, 1, 1, 2), roughness: 0.9 }); }, base: 'wood', crown: 0x6a4a2a, ceil: function () { return mat('c_manoir', { map: T('plaster', 0xd6cdb8, 0, 1, 1, 3), roughness: 1 }); }, hemi: [0xffe6c8, 0x3a2a20, 0.95], bg: 0x0a0806, fog: [0x14100c, 0.008] },
    casino: { wall: function () { return mat('w_casino', { map: T('damask', 0x1a0a26, 0x7a2a8a, 1, 1, 4), roughness: 0.8 }); }, base: 'gold', crown: 0xd4af37, ceil: function () { return mat('c_casino', { color: 0x120818, roughness: 0.6, metalness: 0.2 }); }, hemi: [0xffd9ff, 0x2a1030, 0.9], bg: 0x05020a, fog: [0x0c0414, 0.007] },
    station: { wall: function () { return mat('w_station', { map: T('panel', 0x4a5664, 0x39d6ff, 1, 1, 5), roughness: 0.5, metalness: 0.4 }); }, base: 'dark', crown: 0x2a303a, ceil: function () { return mat('c_station', { map: T('metal', 0x39424e, 0, 3, 3, 6), roughness: 0.5, metalness: 0.5 }); }, hemi: [0xc8e8ff, 0x20303a, 1.0], bg: 0x02060a, fog: [0x061018, 0.007] },
    musee: { wall: function () { return mat('w_musee', { map: T('plaster', 0xe6e0d2, 0, 1, 1, 7), roughness: 0.95 }); }, base: 'marble', crown: 0xcbb98a, ceil: function () { return mat('c_musee', { map: T('plaster', 0xf0ece2, 0, 1, 1, 8), roughness: 1 }); }, hemi: [0xfff4e0, 0x504a42, 1.05], bg: 0x0a0908, fog: [0x1a1814, 0.004] }
  };

  // quel sol pour quelle pièce
  function floorFor(style, kind) {
    var M2 = function (k, o) { return mat(k, o); };
    var tbl = {
      bibliotheque: ['parquet', 0x5a3a22], grandhall: ['checker', 0xf0ece4, 0x1a1a22], salon: ['parquet', 0x8a5a30], salle: ['planks', 0x7a4a26], cuisine: ['tile', 0x9a9a8e], chambre: ['planks', 0x9a7040],
      slots: ['carpet', 0x5a0a1c, 0xd4af37], vip: ['marble', 0x16161c], poker: ['carpet', 0x0e3a2a, 0xd4af37], bar: ['checker', 0xf0ece4, 0x14141a],
      cryo: ['panel', 0x34404c, 0x39d6ff], labo: ['tile', 0xc5d0d8], reacteur: ['grating', 0x6a7886], hangar: ['concrete', 0x6a7078], quartiers: ['carpet', 0x2a3a4a, 0x39d6ff],
      egypte: ['tile', 0xc9a56a], antique: ['marble', 0xeeeae2], rotonde: ['checker', 0xf0ece4, 0x2a2a30], art: ['parquet', 0x9a6a3a], dino: ['concrete', 0x8a8478]
    };
    var d = tbl[kind] || ['planks', 0x7a4a26], key = 'f_' + kind;
    var o = { map: T(d[0], d[1], d[2], 1, 1, kind.length * 7), roughness: d[0] === 'marble' || d[0] === 'checker' ? 0.25 : 0.7, metalness: d[0] === 'grating' ? 0.5 : 0 };
    return M2(key, o);
  }
  var FLOOR_TS = { parquet: 3, checker: 3.2, planks: 3, tile: 3, carpet: 5, marble: 4, panel: 4, grating: 3, concrete: 4 };
  function tsFor(kind) {
    var m = { bibliotheque: 3, grandhall: 3.2, salon: 3, salle: 3, cuisine: 3, chambre: 3, slots: 5, vip: 4, poker: 5, bar: 3.2, cryo: 4, labo: 3, reacteur: 3, hangar: 4, quartiers: 5, egypte: 3, antique: 4, rotonde: 3.2, art: 3, dino: 4 };
    return m[kind] || 3;
  }
  // lumière de chaque pièce : couleur, intensité
  var ROOMLIGHT = { bibliotheque: 0xffc88a, grandhall: 0xffe0b0, salon: 0xffc890, salle: 0xffd9a0, cuisine: 0xffe8c0, chambre: 0xffb878, slots: 0xff7ad0, vip: 0xffd070, poker: 0x7af0b0, bar: 0xff5ad0, cryo: 0x7ad8ff, labo: 0xe8f4ff, reacteur: 0x5affd0, hangar: 0xffe0a0, quartiers: 0xa8c8ff, egypte: 0xffd890, antique: 0xfff0d8, rotonde: 0xfff4e0, art: 0xffecd0, dino: 0xe8f0ff };

  /* ------------------------------ construction ------------------------------ */
  function build(map) {
    var grp = new THREE.Group(), st = map.style, S = STYLE[st], anim = [], lights = [], r = rng(map.W * 13 + map.D), H = map.H, hw = map.W / 2, hd = map.D / 2, i, j;
    var API = { group: grp, fog: null, update: function (dt, cam) { for (var k = 0; k < anim.length; k++) anim[k](dt, cam); }, dispose: function () { grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); } };
    var frameGold = PM.gold();

    if (map.indoor) {
      // ----- sols
      map.rooms.forEach(function (rm) { grp.add(floorPlane(rm.x0, rm.z0, rm.x1, rm.z1, floorFor(st, rm.kind), tsFor(rm.kind), 0.002)); });
      // ----- plafond + poutres / tuyaux / caissons
      var ceil = S.ceil(), cp = floorPlane(-hw, -hd, hw, hd, ceil, st === 'station' ? 4 : 5, H); cp.rotation.x = Math.PI / 2; cp.material = ceil; grp.add(cp);
      if (st === 'manoir') { var bw = PM.darkwood(); for (i = -hw + 3; i < hw; i += 3.5) { var bm = boxT(0.28, 0.3, map.D, bw, 2); bm.position.set(i, H - 0.15, 0); grp.add(bm); } }
      if (st === 'musee') { var sk = glowMat('sky', 0xfff6e0, 1.0); map.rooms.forEach(function (rm) { var w = Math.min(8, rm.x1 - rm.x0 - 4), d = Math.min(8, rm.z1 - rm.z0 - 4); var p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sk); p.rotation.x = Math.PI / 2; p.position.set((rm.x0 + rm.x1) / 2, H - 0.02, (rm.z0 + rm.z1) / 2); grp.add(p); var fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.12, d + 0.3), mat('skyfr', { color: 0xcbb98a, roughness: 0.4, metalness: 0.6 })); fr.position.set(p.position.x, H - 0.06, p.position.z); grp.add(fr); }); }
      if (st === 'station') { var pm = mat('pipe', { color: 0x8a96a2, roughness: 0.4, metalness: 0.8 }); for (i = 0; i < 9; i++) { var pp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, map.W, 10), pm); pp.rotation.z = Math.PI / 2; pp.position.set(0, H - 0.3 - (i % 3) * 0.28, -hd + 3 + i * (map.D - 6) / 8); grp.add(pp); } var strip = glowMat('strip', 0xe8f6ff, 1.2); map.rooms.forEach(function (rm) { var n = Math.max(1, Math.floor((rm.x1 - rm.x0) / 8)); for (var k = 0; k < n; k++) { var sx = rm.x0 + (k + 0.5) * (rm.x1 - rm.x0) / n; var lp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.5), strip); lp.position.set(sx, H - 0.05, (rm.z0 + rm.z1) / 2); grp.add(lp); } }); }
      if (st === 'casino') { var neon = [glowMat('n1', 0xff3bd0, 1.8), glowMat('n2', 0x39d6ff, 1.8), glowMat('n3', 0xffd23f, 1.8)]; map.rooms.forEach(function (rm, k) { var cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2, rr = Math.min(rm.x1 - rm.x0, rm.z1 - rm.z0) * 0.32; for (var q = 0; q < 3; q++) { var t = new THREE.Mesh(new THREE.TorusGeometry(rr - q * 1.3, 0.07, 6, 48), neon[(k + q) % 3]); t.rotation.x = Math.PI / 2; t.position.set(cx, H - 0.1, cz); grp.add(t); } }); }
      // ----- murs : face texturée, plinthe, corniche, lambris
      var wallM = S.wall(), baseM = st === 'musee' ? PM.marble() : (st === 'casino' ? PM.gold() : (st === 'station' ? PM.dsteel() : PM.darkwood()));
      map.walls.forEach(function (w) {
        var lx = w.x1 - w.x0, lz = w.z1 - w.z0, m = boxT(lx, w.y1, lz, wallM, 2.6); m.position.set((w.x0 + w.x1) / 2, w.y1 / 2, (w.z0 + w.z1) / 2); grp.add(m);
        var b = new THREE.Mesh(new THREE.BoxGeometry(lx + (lx > lz ? 0 : 0.08), 0.24, lz + (lx > lz ? 0.08 : 0)), baseM); b.position.set(m.position.x, 0.12, m.position.z); grp.add(b);
        var cr = new THREE.Mesh(new THREE.BoxGeometry(lx + (lx > lz ? 0 : 0.14), 0.18, lz + (lx > lz ? 0.14 : 0)), mat('crown' + S.crown, { color: S.crown, roughness: 0.5, metalness: st === 'casino' ? 0.8 : 0.1 })); cr.position.set(m.position.x, w.y1 - 0.09, m.position.z); grp.add(cr);
        if (st === 'manoir' || st === 'musee') { var wt = boxT(lx + (lx > lz ? 0 : 0.06), 1.05, lz + (lx > lz ? 0.06 : 0), st === 'musee' ? PM.marble() : PM.darkwood(), 1.6); wt.position.set(m.position.x, 0.62, m.position.z); grp.add(wt); var ch = new THREE.Mesh(new THREE.BoxGeometry(lx + (lx > lz ? 0 : 0.1), 0.06, lz + (lx > lz ? 0.1 : 0)), frameGold); ch.position.set(m.position.x, 1.17, m.position.z); grp.add(ch); }
        if (st === 'station') { var hz = glowMat('wstrip' + (lx > lz ? 'a' : 'b'), 0x39d6ff, 1.2), s1 = new THREE.Mesh(new THREE.BoxGeometry(lx + (lx > lz ? 0 : 0.1), 0.05, lz + (lx > lz ? 0.1 : 0)), hz); s1.position.set(m.position.x, 2.35, m.position.z); grp.add(s1); }
        if (st === 'casino') { var gl = new THREE.Mesh(new THREE.BoxGeometry(lx + (lx > lz ? 0 : 0.1), 0.06, lz + (lx > lz ? 0.1 : 0)), glowMat('nbase', 0xff3bd0, 1.6)); gl.position.set(m.position.x, 0.5, m.position.z); grp.add(gl); }
      });
      // ----- encadrements de portes
      var frameM = st === 'casino' ? PM.gold() : (st === 'station' ? PM.dsteel() : (st === 'musee' ? PM.marble() : PM.darkwood()));
      map.doors.forEach(function (d) {
        var alongX = d.axis === 'z';                          // porte dans un mur horizontal (le long de x)
        var f1 = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.2 : 0.46, H, alongX ? 0.46 : 0.2), frameM), f2 = f1.clone(), lin = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 2.6 : 0.46, 0.9, alongX ? 0.46 : 2.6), frameM);
        f1.position.set(d.x + (alongX ? -1.2 : 0), H / 2, d.z + (alongX ? 0 : -1.2)); f2.position.set(d.x + (alongX ? 1.2 : 0), H / 2, d.z + (alongX ? 0 : 1.2)); lin.position.set(d.x, H - 0.45, d.z); grp.add(f1, f2, lin);
        if (st === 'station') { var lamp = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.9 : 0.1, 0.08, alongX ? 0.1 : 0.9), glowMat('doorl', 0x3bff6a, 1.8)); lamp.position.set(d.x + (alongX ? 0 : 0.26), H - 0.95, d.z + (alongX ? 0.26 : 0)); grp.add(lamp); }
      });
      // ----- décor des murs : tableaux, fenêtres, enseignes
      function nearProp(x, z, rad) { for (var q = 0; q < map.props.length; q++) { var p = map.props[q], e = Math.max(p.hx, p.hz); if (Math.hypot(p.x - x, p.z - z) < e + rad) return true; } return false; }
      function nearDoor(x, z) { for (var q = 0; q < map.doors.length; q++) if (Math.hypot(map.doors[q].x - x, map.doors[q].z - z) < 2.3) return true; return false; }
      var artK = 0, signTexts = [['JACKPOT', '#ff3bd0', '#ffd23f'], ['7 7 7', '#39d6ff', '#ffffff'], ['BAR', '#ffd23f', '#ff5a3b'], ['VIP', '#ff3bd0', '#ffffff'], ['LUCKY', '#3bff6a', '#ffffff'], ['♠ ♥ ♦ ♣', '#ffd23f', '#ffffff'], ['CASINO', '#39d6ff', '#ff3bd0'], ['FLAMBEURS', '#ff3b3b', '#ffd23f']];
      var stationSigns = [['SECTEUR A-3', '#39d6ff', '#ffffff'], ['DANGER', '#ffb020', '#ff3b3b'], ['SAS 04', '#3bff6a', '#ffffff'], ['O2 · NIVEAU 2', '#39d6ff', '#ffffff'], ['ACCÈS RESTREINT', '#ff3b3b', '#ffffff']];
      map.walls.forEach(function (w, wi) {
        var lx = w.x1 - w.x0, lz = w.z1 - w.z0, horiz = lx > lz, len = horiz ? lx : lz, n = Math.floor(len / 4.6);
        for (var k = 0; k < n; k++) for (var side = -1; side <= 1; side += 2) {
          if (r() < 0.38) continue;
          var along = (k + 0.5 + (r() - 0.5) * 0.3) * len / n, px = horiz ? w.x0 + along : (side < 0 ? w.x0 - 0.01 : w.x1 + 0.01), pz = horiz ? (side < 0 ? w.z0 - 0.01 : w.z1 + 0.01) : w.z0 + along;
          if (nearDoor(px, pz)) continue;
          var inx = horiz ? px : px + side * 0.9, inz = horiz ? pz + side * 0.9 : pz;
          if (nearProp(inx, inz, 0.75)) continue;
          var ry = horiz ? (side < 0 ? Math.PI : 0) : (side < 0 ? -Math.PI / 2 : Math.PI / 2);
          if (wi < 4 && (st === 'manoir' || st === 'station' || st === 'casino') && r() < 0.7) {   // fenêtre sur les murs extérieurs
            if (!(side === (wi === 0 ? 1 : wi === 1 ? -1 : wi === 2 ? 1 : -1))) continue;
            var wm = windowMat(st === 'station' ? 'space' : 'night'), ww = st === 'station' ? 2.6 : 1.5, wh = st === 'station' ? 1.9 : 2.2, wy = st === 'station' ? 2.0 : 2.3;
            var win = pl(grp, ww, wh, wm, px, wy, pz, ry); win.position.x += horiz ? 0 : side * 0.005; win.position.z += horiz ? side * 0.005 : 0;
            if (st !== 'station') { var cu = new THREE.Mesh(new THREE.BoxGeometry(0.34, wh + 0.5, 0.12), mat('curtain', { color: st === 'casino' ? 0x6a1a5a : 0x7a1a24, roughness: 0.95 })); [-1, 1].forEach(function (cs) { var c2 = cu.clone(); c2.position.set(px + (horiz ? cs * (ww / 2 + 0.2) : side * 0.07), wy, pz + (horiz ? side * 0.07 : cs * (ww / 2 + 0.2))); c2.rotation.y = horiz ? 0 : Math.PI / 2; grp.add(c2); }); }
            if (st === 'manoir') { var mb = new THREE.PointLight(0x6a8ad8, 0.28, 8, 1.5); mb.position.set(inx, wy - 0.3, inz); grp.add(mb); lights.push(mb); }
            continue;
          }
          if (st === 'casino' && r() < 0.5) { var sg = signTexts[Math.floor(r() * signTexts.length)], sm = signMat(sg[0], sg[1], sg[2]); var sp = pl(grp, 2.4, 0.6, sm, px, 3.0, pz, ry); sp.position.x += horiz ? 0 : side * 0.006; sp.position.z += horiz ? side * 0.006 : 0; continue; }
          if (st === 'station') { var ss = stationSigns[Math.floor(r() * stationSigns.length)], sm2 = signMat(ss[0], ss[1], ss[2]); var sp2 = pl(grp, 1.8, 0.45, sm2, px, 2.9, pz, ry); sp2.position.x += horiz ? 0 : side * 0.006; sp2.position.z += horiz ? side * 0.006 : 0; continue; }
          var big = st === 'musee' && r() < 0.5, pw = big ? 1.9 : 1.0, ph = big ? 1.4 : 1.25, pa = paintingMesh(pw, ph, artK++, frameGold); pa.position.set(px + (horiz ? 0 : side * 0.04), st === 'musee' ? 2.7 : 2.3, pz + (horiz ? side * 0.04 : 0)); pa.rotation.y = ry; grp.add(pa);
          if (st === 'musee') { var spt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.1), mat('spotb', { color: 0x2a2a2a, roughness: 0.4, metalness: 0.7 })); spt.position.set(pa.position.x + (horiz ? 0 : side * 0.3), 4.0, pa.position.z + (horiz ? side * 0.3 : 0)); grp.add(spt); var beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide })); beam.position.set(pa.position.x + (horiz ? 0 : side * 0.4), 3.2, pa.position.z + (horiz ? side * 0.4 : 0)); beam.rotation.x = horiz ? side * 0.4 : 0; beam.rotation.z = horiz ? 0 : -side * 0.4; grp.add(beam); }
        }
      });
      // ----- lumières de chaque pièce + luminaires
      map.rooms.forEach(function (rm, k) {
        var cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2, col = ROOMLIGHT[rm.kind] || 0xffe0b0, big = Math.max(rm.x1 - rm.x0, rm.z1 - rm.z0);
        var pl0 = new THREE.PointLight(col, st === 'casino' ? 1.15 : (st === 'station' ? 1.0 : 1.05), big * 1.15, 1.6); pl0.position.set(cx, H - 0.9, cz); grp.add(pl0); lights.push(pl0);
        if (st === 'manoir' || (st === 'casino' && (rm.kind === 'vip' || rm.kind === 'salle'))) {   // lustre
          var lg = new THREE.Group(), gm = PM.gold(); lg.add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 28), gm)); lg.children[0].rotation.x = Math.PI / 2;
          var ch = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), gm); ch.position.y = 0.6; lg.add(ch);
          for (var q = 0; q < 8; q++) { var a = q / 8 * TAU, fl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), glowMat('lflame', 0xffc070, 3)); fl.position.set(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7); fl.scale.y = 1.6; lg.add(fl); var cd = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), mat('wax', { color: 0xf4ecd8, roughness: 0.8 })); cd.position.set(Math.cos(a) * 0.7, 0.02, Math.sin(a) * 0.7); lg.add(cd); }
          var crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat('cryst', { color: 0xe8f0ff, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6, emissive: 0x88a0d0, emissiveIntensity: 0.3 })); crystal.position.y = -0.2; lg.add(crystal);
          lg.position.set(cx, H - 1.35, cz); grp.add(lg);
        }
        if (st === 'station' || st === 'musee') { var disk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 18), glowMat('disk' + st, st === 'station' ? 0xe8f6ff : 0xfff6e0, 1.3)); disk.position.set(cx, H - 0.04, cz + 3); grp.add(disk); }
        if (st === 'station' && rm.kind === 'reacteur') { var red = new THREE.PointLight(0xff3b3b, 0.0, 30, 1.5); red.position.set(cx, H - 1.2, cz); grp.add(red); var ph0 = 0; anim.push(function (dt) { ph0 += dt; red.intensity = Math.max(0, Math.sin(ph0 * 3)) * 1.4; }); var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), glowMat('beacon', 0xff3b3b, 2.5)); beacon.position.set(cx, H - 0.3, cz); grp.add(beacon); }
        if (st === 'manoir' && rm.kind === 'bibliotheque') { var rug = floorPlane(cx - 3.5, cz - 2.5, cx + 3.5, cz + 2.5, mat('rug', { map: T('carpet', 0x7a1a2a, 0xd4af37, 1, 1, 3), roughness: 1 }), 7, 0.012); grp.add(rug); }
        if (st === 'manoir' && rm.kind === 'salon') { var rug2 = floorPlane(cx - 3, cz - 3, cx + 3, cz + 3, mat('rug2', { map: T('carpet', 0x1d3a5a, 0xd4af37, 1, 1, 4), roughness: 1 }), 6, 0.012); grp.add(rug2); }
        if (st === 'casino' && rm.kind === 'salle') { var med = new THREE.Mesh(new THREE.CircleGeometry(7, 48), mat('medal', { map: (function () { var c = cv(256, 256), x = c.getContext('2d'); x.fillStyle = '#1a0a24'; x.fillRect(0, 0, 256, 256); for (var i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#d4af37' : '#b01818'; x.beginPath(); x.moveTo(128, 128); x.arc(128, 128, 124, i / 12 * TAU, (i + 1) / 12 * TAU); x.fill(); } x.fillStyle = '#12081a'; x.beginPath(); x.arc(128, 128, 40, 0, TAU); x.fill(); x.fillStyle = '#d4af37'; x.font = '900 38px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('777', 128, 130); return tex(c); })(), roughness: 0.4, metalness: 0.2 })); med.rotation.x = -Math.PI / 2; med.position.set(cx, 0.015, cz); grp.add(med); }
      });
      // ----- éclairage de base + ambiance
      var hemi = new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]); grp.add(hemi);
      API.fog = { color: S.fog[0], density: S.fog[1] }; API.bg = S.bg;
    } else {
      /* ============ plein air ============ */
      var sky = skyDome(st); grp.add(sky); API.sky = sky;
      var gm = st === 'marche' ? mat('g_marche', { map: T('cobble', 0x6a6672, 0, 1, 1, 12), roughness: 0.35, metalness: 0.15 }) : mat('g_port', { map: T('concrete', 0x76726c, 0, 1, 1, 13), roughness: 0.85 });
      grp.add(floorPlane(-hw, -hd, hw, hd, gm, st === 'marche' ? 2.6 : 6, 0));
      // flaques qui brillent / marques au sol
      if (st === 'marche') { var pud = mat('pud', { color: 0x1a1830, roughness: 0.03, metalness: 0.9, transparent: true, opacity: 0.78 }); for (i = 0; i < 26; i++) { var pu = new THREE.Mesh(new THREE.CircleGeometry(0.8 + r() * 1.8, 20), pud); pu.rotation.x = -Math.PI / 2; pu.scale.y = 0.6 + r() * 0.8; pu.position.set(-hw + 4 + r() * (map.W - 8), 0.012, -hd + 4 + r() * (map.D - 8)); grp.add(pu); } }
      else { var ym = mat('ymark', { color: 0xf0c020, roughness: 0.9 }), wm2 = mat('wmark', { color: 0xe8e8e8, roughness: 0.9 }); for (i = 0; i < 14; i++) { var ln = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 6 + r() * 8), i % 3 ? wm2 : ym); ln.rotation.x = -Math.PI / 2; ln.position.set(-hw + 4 + i * (map.W - 8) / 13, 0.01, 0); grp.add(ln); } for (i = 0; i < 5; i++) { var hz = new THREE.Mesh(new THREE.PlaneGeometry(map.W - 6, 0.25), ym); hz.rotation.x = -Math.PI / 2; hz.position.set(0, 0.011, -hd + 6 + i * (map.D - 12) / 4); grp.add(hz); } }
      // façades : textures dessinées
      var FAC = {};
      function facadeMat(kind, seed) {
        var key = kind + seed; if (FAC[key]) return FAC[key];
        var c = cv(512, 512), x = c.getContext('2d'), rr = rng(seed * 17 + 3), cols = [0x5a4a44, 0x4a4e5a, 0x6a5a48, 0x3e4a44, 0x58404a], base = cols[seed % cols.length];
        if (kind === 'boutique' || kind === 'immeuble') { x.fillStyle = hex(base); x.fillRect(0, 0, 512, 512); for (var q = 0; q < 1800; q++) { x.fillStyle = 'rgba(' + (rr() < 0.5 ? '255,255,255' : '0,0,0') + ',' + rr() * 0.05 + ')'; x.fillRect(rr() * 512, rr() * 512, 3, 3); }
          var sx = 4, sy = 5; for (var wy = 0; wy < sy; wy++) for (var wx = 0; wx < sx; wx++) { var px = 28 + wx * 122, py = 40 + wy * 72; var on = rr() < 0.55; x.fillStyle = '#16141c'; x.fillRect(px - 4, py - 4, 82, 58); x.fillStyle = on ? ['#ffd890', '#ffb060', '#9fe0ff', '#ffa0c8'][Math.floor(rr() * 4)] : '#0e1018'; x.fillRect(px, py, 74, 50); if (on) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px + 34, py, 4, 50); x.fillRect(px, py + 22, 74, 4); if (rr() < 0.4) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(px + 10, py + 22, 24, 28); } } else { x.fillStyle = 'rgba(120,150,200,0.2)'; x.fillRect(px, py, 74, 18); } }
          x.fillStyle = '#0c0a12'; x.fillRect(0, 398, 512, 114); var gl = x.createLinearGradient(0, 410, 0, 512); gl.addColorStop(0, '#ffcf80'); gl.addColorStop(1, '#a05a2a'); x.fillStyle = gl; for (var k2 = 0; k2 < 3; k2++) x.fillRect(16 + k2 * 168, 418, 150, 94); x.fillStyle = '#16100c'; for (k2 = 0; k2 < 3; k2++) { x.fillRect(16 + k2 * 168, 418, 6, 94); x.fillRect(160 + k2 * 168, 418, 6, 94); x.fillRect(16 + k2 * 168, 462, 150, 5); }
          var aw = ['#c0242c', '#e0a020', '#2a8a5a', '#2a5ac0'][seed % 4]; x.fillStyle = aw; x.fillRect(0, 392, 512, 18); for (k2 = 0; k2 < 16; k2++) { x.fillStyle = k2 % 2 ? 'rgba(255,255,255,0.8)' : aw; x.fillRect(k2 * 32, 392, 32, 18); } }
        var t = tex(c); FAC[key] = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.9 }); return FAC[key];
      }
      function hex(n) { return PT.hex(n); }
      var CORR = {};
      function corrM(col) { return CORR[col] || (CORR[col] = new THREE.MeshStandardMaterial({ map: T('corrug', col, 0, 1, 1, col % 97), roughness: 0.55, metalness: 0.35 })); }
      var cont = [0xa8322d, 0x1f5aa8, 0xd98a1a, 0x2a7a4a, 0x7a7a82, 0x6a2a8a, 0x2aa0a8, 0xe0e0e0];
      var neonCols = [['#ff3bd0', '#ffffff'], ['#39d6ff', '#ffffff'], ['#ffd23f', '#ff3b3b'], ['#3bff6a', '#ffffff'], ['#ff5a3b', '#ffe9a0']], mkSigns = ['夜市', 'RAMEN', '麺', 'HOTEL', 'BAR', '24H', '飯', 'KARAOKE', 'TEA', '酒'];
      // murs d'enceinte (les 4 premiers) et blocs
      map.walls.forEach(function (w, wi) {
        var lx = w.x1 - w.x0, lz = w.z1 - w.z0, hh = w.y1, m;
        if (wi < 4) {
          if (st === 'marche') { m = boxT(lx, hh, lz, facadeMat('immeuble', wi + 1), 8); } else { m = boxT(lx, hh, lz, corrM(cont[(wi * 2) % cont.length]), 2.5); }
          m.position.set((w.x0 + w.x1) / 2, hh / 2, (w.z0 + w.z1) / 2); grp.add(m); return;
        }
        var bl = map.blocks[wi - 4] || null;                    // les blocs sont dans le même ordre que leurs murs (après les 4 murs d'enceinte)
        var cxm = (w.x0 + w.x1) / 2, czm = (w.z0 + w.z1) / 2;
        if (st === 'marche') {
          m = boxT(lx, hh, lz, facadeMat(bl && bl.kind, wi), 8); m.position.set(cxm, hh / 2, czm); grp.add(m);
          var roof = new THREE.Mesh(new THREE.BoxGeometry(lx + 0.5, 0.35, lz + 0.5), mat('roofm', { color: 0x1a1820, roughness: 0.8 })); roof.position.set(cxm, hh + 0.17, czm); grp.add(roof);
          var ns = neonCols[wi % neonCols.length], sg2 = signMat(mkSigns[wi % mkSigns.length], ns[0], ns[1]); var sgp = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), sg2); sgp.position.set(cxm, 3.9, w.z1 + 0.06); grp.add(sgp); var sgp2 = sgp.clone(); sgp2.position.set(cxm, 3.9, w.z0 - 0.06); sgp2.rotation.y = Math.PI; grp.add(sgp2);
          var pt = new THREE.PointLight(new THREE.Color(ns[0]), 0.9, 15, 1.6); pt.position.set(cxm, 3.6, w.z1 + 1.5); grp.add(pt); lights.push(pt);
        } else if (bl && bl.kind === 'conteneurs') {
          var levels = Math.max(1, Math.round(hh / 2.65)), ncol = Math.max(1, Math.floor(lx / 2.5)), cw = lx / ncol;
          for (var lv = 0; lv < levels; lv++) for (var c2 = 0; c2 < ncol; c2++) { var cb = boxT(cw - 0.04, 2.58, lz - 0.04, corrM(cont[(wi * 3 + lv * 5 + c2 * 7) % cont.length]), 2.5); cb.position.set(w.x0 + cw * (c2 + 0.5), 1.3 + lv * 2.62, czm); grp.add(cb); }
        } else {
          m = boxT(lx, hh, lz, corrM(0x58606a), 2.5); m.position.set(cxm, hh / 2, czm); grp.add(m);
          var door = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(5, lx * 0.5), Math.min(4.2, hh - 0.6)), mat('rolld', { color: 0x8a9096, roughness: 0.5, metalness: 0.6, map: T('corrug', 0x9aa0a8, 0, 1, 1, 77) })); door.position.set(cxm, Math.min(4.2, hh - 0.6) / 2, w.z1 + 0.04); grp.add(door);
          var roof2 = new THREE.Mesh(new THREE.BoxGeometry(lx + 0.4, 0.3, lz + 0.4), mat('roofp', { color: 0x30343a, roughness: 0.8 })); roof2.position.set(cxm, hh + 0.15, czm); grp.add(roof2);
          var lt = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.2), glowMat('whl', 0xfff0c0, 2)); lt.position.set(cxm, Math.min(4.2, hh - 0.6) + 0.5, w.z1 + 0.15); grp.add(lt);
        }
      });
      // guirlandes de lanternes (marché)
      if (st === 'marche') {
        var cols2 = [0xff3a2a, 0xffb02e, 0xff5ac8, 0xffe08a], bulbG = new THREE.SphereGeometry(0.15, 10, 8), nB = 0;
        function stringLights(x0, z0, x1, z1, y0, sag) {
          var n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 1.1), lm = mat('cord', { color: 0x15120e, roughness: 0.9 }), pts = [];
          for (var q = 0; q <= n; q++) { var t = q / n, y = y0 - Math.sin(t * Math.PI) * sag; pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t)); if (q < n) { var b = new THREE.Mesh(bulbG, glowMat('bulb' + (q % 4), cols2[q % 4], 2.0)); b.position.set(pts[q].x, y - 0.12, pts[q].z); b.scale.set(1, 1.3, 1); grp.add(b); nB++; } }
          var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x15120e })); grp.add(ln);
        }
        for (i = 0; i < 5; i++) stringLights(-hw + 1, -hd + 8 + i * (map.D - 16) / 4, hw - 1, -hd + 8 + i * (map.D - 16) / 4 + (i % 2 ? 2 : -2), 4.6, 0.9);
        for (i = 0; i < 4; i++) stringLights(-hw + 8 + i * (map.W - 16) / 3, -hd + 1, -hw + 8 + i * (map.W - 16) / 3 + (i % 2 ? 2 : -2), hd - 1, 4.9, 0.9);
        // pluie
        var N = 1800, pos = new Float32Array(N * 3), rp = rng(9); for (i = 0; i < N; i++) { pos[i * 3] = -hw + rp() * map.W; pos[i * 3 + 1] = rp() * 14; pos[i * 3 + 2] = -hd + rp() * map.D; }
        var rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); var rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xb8c8ff, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false })); rain.frustumCulled = false; grp.add(rain);
        anim.push(function (dt) { var p = rg.attributes.position.array; for (var q = 0; q < N; q++) { p[q * 3 + 1] -= dt * 14; if (p[q * 3 + 1] < 0) p[q * 3 + 1] = 14; } rg.attributes.position.needsUpdate = true; });
        // éclairages de la place
        [[0xff3bd0, -18, -8], [0x39d6ff, 18, 8], [0xffb02e, 0, 0], [0xff5a3b, -20, 16], [0x7a5aff, 22, -14], [0xffd070, 6, -20]].forEach(function (L) { var pl1 = new THREE.PointLight(L[0], 1.05, 26, 1.6); pl1.position.set(L[1], 4, L[2]); grp.add(pl1); lights.push(pl1); });
        var moon = new THREE.DirectionalLight(0x8a9ad8, 0.55); moon.position.set(-30, 60, 20); grp.add(moon); grp.add(new THREE.HemisphereLight(0x6a78b8, 0x2a1a30, 0.8));
        API.fog = { color: 0x120e24, density: 0.011 }; API.bg = 0x0a0818;
      } else {
        // grues au loin, projecteurs
        var crM = mat('crane', { color: 0xd0402a, roughness: 0.6, metalness: 0.3 });
        [[-hw - 14, -14], [-hw - 14, 14], [hw + 14, 0]].forEach(function (c0) { var cr = new THREE.Group(), lg = 20; [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(function (q) { var leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, lg, 0.7), crM); leg.position.set(q[0], lg / 2, q[1]); cr.add(leg); }); var bm = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 2.6), crM); bm.position.set(c0[0] < 0 ? 12 : -12, lg + 1, 0); cr.add(bm); var top = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 6), crM); top.position.set(0, lg + 1, 0); cr.add(top); cr.position.set(c0[0], 0, c0[1]); cr.rotation.y = c0[0] < 0 ? 0 : 0; grp.add(cr); var rl = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), glowMat('crl', 0xff2a2a, 2.5)); rl.position.set(c0[0], lg + 3.4, c0[1]); grp.add(rl); });
        var fm = mat('fpole', { color: 0x3a4048, roughness: 0.5, metalness: 0.6 });
        [[-24, -18], [0, -22], [24, -18], [-24, 18], [0, 22], [24, 18]].forEach(function (p0) { var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 10, 8), fm); pole.position.set(p0[0], 5, p0[1]); grp.add(pole); var head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.8), glowMat('flood', 0xfff4d0, 2.2)); head.position.set(p0[0], 10.2, p0[1]); grp.add(head); var pl2 = new THREE.PointLight(0xffe6b0, 1.0, 30, 1.5); pl2.position.set(p0[0], 9.5, p0[1]); grp.add(pl2); lights.push(pl2); });
        var sun = new THREE.DirectionalLight(0xff9a60, 0.85); sun.position.set(0, 18, 70); grp.add(sun); grp.add(new THREE.HemisphereLight(0xffb38a, 0x3a3040, 0.95));
        API.fog = { color: 0x4a2a40, density: 0.0075 }; API.bg = 0x4a2a40;
      }
      if (sky) anim.push(function (dt, cam) { if (cam) sky.position.copy(cam.position); });
    }
    return API;
  }
  F.propMaps = { build: build, ROOMLIGHT: ROOMLIGHT };
})();
