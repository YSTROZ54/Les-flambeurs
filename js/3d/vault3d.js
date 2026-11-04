/* =====================================================================
   vault3d.js — La Chambre Forte en 3D (jeu des Mines, monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par l'ouverture au fond de la salle des mini jeux (uno3d.js) et on en ressort par l'ouverture derrière soi.
   Une salle de banque : au fond, un grand mur de 20 coffres (4 colonnes x 5 rangées). On s'assoit à l'un des quatre postes (F ou clic),
   on règle sa mise et le nombre de bombes (3, 5, 8 ou 12), puis on lance la partie et on clique sur les coffres : le volet d'un coffre
   remonte sur un diamant (le multiplicateur monte) ou sur une bombe (la mise est perdue). On encaisse quand on veut.
   Le serveur décide de tout, comme dans le jeu du menu (api/_games.js : mines_start / mines_pick / mines_cashout) : il place les bombes,
   prélève la mise et paie le gain ; le navigateur ne connaît que les coffres déjà ouverts. Chaque poste montre sa propre partie.
   À droite du mur : le classement des plus gros gains encaissés (api/_games.js garde le top 5, lu par GET /api/crash?vault=1).
   Fichiers liés : f3d-core.js, world3d.js, uno3d.js (l'ouverture d'entrée), api/_games.js + api/crash.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 10, HZ = 9, H = 6.6, OG = 1.9, OPH = 3.5;                   // salle, demi-largeur et hauteur de l'ouverture d'entrée
  var COLS = 4, ROWS = 5, PX = 1.15, PY = 0.9, Y0 = 1.05, CN = 20;       // mur de coffres
  var BETS = [10, 100, 500, 1000, 5000], BOMBS = [3, 5, 8, 12];
  var STOOLS = [-3.6, -1.2, 1.2, 3.6], STOOL_Z = -2.4;

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function sg(payload) {
    try { if (typeof serverGame === 'function') return Promise.resolve(serverGame(payload)).catch(function () { return { ok: false, error: 'Réseau indisponible.' }; }); } catch (e) { /* ok */ }
    return Promise.resolve({ ok: false, error: 'Serveur indisponible.' });
  }
  function minesMult(count, n) { var m = 1, i; for (i = 0; i < n; i++) m *= (CN - i) / (CN - count - i); return Math.max(1, m * 0.97); }     // la même formule que le serveur
  function fx2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function sfx(name) { try { if (typeof window[name] === 'function') window[name](); } catch (e) { /* pas de son */ } }
  // matériau d'affiche (texte, logo) : décalé en profondeur pour ne jamais « clignoter » contre ce qui est derrière
  function decal(tex, transparent) { return new THREE.MeshBasicMaterial({ map: tex, transparent: !!transparent, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }
  function sharp(tex) { tex.anisotropy = 16; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.needsUpdate = true; return tex; }

  function createVaultRoom(world) {
    var low = world.low;
    var room = { title: '🔐 LA CHAMBRE FORTE', subtitle: 'TROUVE LES DIAMANTS, ÉVITE LES BOMBES', topic: 'flambeurs-vault-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- matériaux et textures : acier brossé, rivets, sol de dalles --- */
    var steel = new THREE.MeshStandardMaterial({ color: 0x626b7a, roughness: 0.38, metalness: 0.8 }), darkM = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.6, metalness: 0.5 });
    var neonM = new THREE.MeshBasicMaterial({ color: 0x3dff9a }), goldM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.75 });
    var wc = mkCanvas(512, 512), wx = wc.getContext('2d'), wg = wx.createLinearGradient(0, 0, 0, 512); wg.addColorStop(0, '#2d3441'); wg.addColorStop(1, '#1d212b'); wx.fillStyle = wg; wx.fillRect(0, 0, 512, 512);
    for (i = 0; i < 160; i++) { wx.fillStyle = 'rgba(255,255,255,' + (0.012 + Math.random() * 0.03) + ')'; wx.fillRect(0, Math.random() * 512, 512, 1 + Math.random() * 2); }
    wx.strokeStyle = 'rgba(0,0,0,0.6)'; wx.lineWidth = 8; wx.strokeRect(0, 0, 512, 512); wx.strokeStyle = 'rgba(255,255,255,0.09)'; wx.lineWidth = 3; wx.strokeRect(9, 9, 494, 494);
    [[32, 32], [480, 32], [32, 480], [480, 480]].forEach(function (p) { var rg = wx.createRadialGradient(p[0] - 2, p[1] - 2, 1, p[0], p[1], 8); rg.addColorStop(0, '#c4ccda'); rg.addColorStop(1, '#5d6676'); wx.fillStyle = rg; wx.beginPath(); wx.arc(p[0], p[1], 8, 0, TAU); wx.fill(); });
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; sharp(wallTex);
    function wallMat(len, hh) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.4, (hh || H) / 2.4); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.45 }); }
    function wall(len, px, pz, ry, hh, py) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, hh || H), wallMat(len, hh)); m.position.set(px, py || H / 2, pz); m.rotation.y = ry; g.add(m); return m; }
    wall(HX * 2, 0, -HZ, 0); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    wall(HX * 2, 0, HZ, Math.PI);     // mur de la porte de sortie
    // casiers de dépôt sur les deux murs de côté : 14 x 3, dessinés en haute définition
    var LW = 2560, LH = 480, dc = mkCanvas(LW, LH), dx = dc.getContext('2d'); dx.fillStyle = '#0f1218'; dx.fillRect(0, 0, LW, LH);
    for (var dy = 0; dy < 3; dy++) for (var dxi = 0; dxi < 14; dxi++) {
      var cw = LW / 14, ch = LH / 3, bx = dxi * cw + 6, by = dy * ch + 6, bw = cw - 12, bh = ch - 12;
      var bgr = dx.createLinearGradient(0, by, 0, by + bh); bgr.addColorStop(0, '#6a7282'); bgr.addColorStop(0.5, '#4d5462'); bgr.addColorStop(1, '#3a404c');
      dx.fillStyle = bgr; rr(dx, bx, by, bw, bh, 10); dx.fill(); dx.strokeStyle = 'rgba(255,255,255,0.28)'; dx.lineWidth = 3; dx.beginPath(); dx.moveTo(bx + 10, by + 3); dx.lineTo(bx + bw - 10, by + 3); dx.stroke();
      dx.strokeStyle = '#272c36'; dx.lineWidth = 3; rr(dx, bx, by, bw, bh, 10); dx.stroke();
      var kg = dx.createRadialGradient(bx + bw / 2 - 5, by + bh * 0.42 - 5, 2, bx + bw / 2, by + bh * 0.42, 26); kg.addColorStop(0, '#f3d878'); kg.addColorStop(1, '#a8841a'); dx.fillStyle = kg; dx.beginPath(); dx.arc(bx + bw / 2, by + bh * 0.42, 24, 0, TAU); dx.fill();
      dx.fillStyle = '#2b2208'; dx.fillRect(bx + bw / 2 - 3, by + bh * 0.42 - 11, 6, 22); dx.beginPath(); dx.arc(bx + bw / 2, by + bh * 0.42 - 11, 5, 0, TAU); dx.fill();
      dx.fillStyle = '#0a0d11'; rr(dx, bx + bw / 2 - 34, by + bh - 34, 68, 22, 4); dx.fill(); dx.fillStyle = '#7ee0a0'; dx.font = '800 17px ' + MONO; dx.textAlign = 'center'; dx.textBaseline = 'middle'; dx.fillText(String(dy * 14 + dxi + 1).padStart(3, '0'), bx + bw / 2, by + bh - 22);
    }
    var dtex = sharp(mkTex(dc));
    [-1, 1].forEach(function (sd) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14 * LH / LW), decal(dtex)); m.position.set(sd * (HX - 0.06), 1.95, -1.2); m.rotation.y = -sd * Math.PI / 2; g.add(m);
      box(g, 0.1, 0.12, 14.2, steel, sd * (HX - 0.05), 1.95 + 7 * LH / LW + 0.07, -1.2); box(g, 0.1, 0.12, 14.2, steel, sd * (HX - 0.05), 1.95 - 7 * LH / LW - 0.07, -1.2);
    });
    // sol : grandes dalles d'acier sombre ; bande jaune de sécurité devant le mur de coffres
    var fc = mkCanvas(1024, 1024), fxx = fc.getContext('2d'); fxx.fillStyle = '#181b22'; fxx.fillRect(0, 0, 1024, 1024);
    for (i = 0; i < 600; i++) { fxx.fillStyle = 'rgba(255,255,255,' + (0.008 + Math.random() * 0.02) + ')'; fxx.fillRect(Math.random() * 1024, Math.random() * 1024, 40 + Math.random() * 160, 1.5); }
    fxx.strokeStyle = '#05070a'; fxx.lineWidth = 8; fxx.strokeRect(0, 0, 1024, 1024); fxx.strokeRect(0, 0, 512, 512); fxx.strokeRect(512, 512, 512, 512);
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 6, HZ * 2 / 6); sharp(ft);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.35, metalness: 0.6 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var hz = mkCanvas(512, 64), hzx = hz.getContext('2d'); hzx.fillStyle = '#e8b800'; hzx.fillRect(0, 0, 512, 64); hzx.fillStyle = '#15171c';
    for (i = -2; i < 14; i++) { hzx.beginPath(); hzx.moveTo(i * 48, 64); hzx.lineTo(i * 48 + 24, 64); hzx.lineTo(i * 48 + 56, 0); hzx.lineTo(i * 48 + 32, 0); hzx.fill(); }
    var hzt = sharp(mkTex(hz)); hzt.wrapS = THREE.RepeatWrapping; hzt.repeat.set(5, 1);
    var strip = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.5), decal(hzt)); strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.02, -HZ + 3.1); g.add(strip);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0c10 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    for (i = -2; i <= 2; i++) box(g, 0.25, 0.05, HZ * 2 - 1, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xdfe9ff : 0x9affc8 }), i * 3.2, H - 0.04, 0);

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.2, label: '🎮 MINI JEUX', sub: 'RETOUR', color: 0xffd24a, target: 'minijeux', theme: 'exitUno' });

    /* --- le mur de 20 coffres, dans un grand cadre d'acier à liseré vert --- */
    var WZ = -HZ;                                                  // plan du mur du fond
    var frameW = COLS * PX + 0.5, frameH = ROWS * PY + 0.5, frameY = Y0 + (ROWS - 1) * PY / 2;
    box(g, frameW + 0.3, frameH + 0.3, 0.12, darkM, 0, frameY, WZ + 0.08);
    box(g, frameW + 0.4, 0.12, 0.2, steel, 0, frameY + frameH / 2 + 0.2, WZ + 0.1); box(g, frameW + 0.4, 0.12, 0.2, steel, 0, frameY - frameH / 2 - 0.2, WZ + 0.1);
    box(g, 0.12, frameH + 0.4, 0.2, steel, -frameW / 2 - 0.2, frameY, WZ + 0.1); box(g, 0.12, frameH + 0.4, 0.2, steel, frameW / 2 + 0.2, frameY, WZ + 0.1);
    box(g, frameW + 0.14, 0.03, 0.04, neonM, 0, frameY + frameH / 2 + 0.11, WZ + 0.22); box(g, frameW + 0.14, 0.03, 0.04, neonM, 0, frameY - frameH / 2 - 0.11, WZ + 0.22);
    box(g, 0.03, frameH + 0.14, 0.04, neonM, -frameW / 2 - 0.11, frameY, WZ + 0.22); box(g, 0.03, frameH + 0.14, 0.04, neonM, frameW / 2 + 0.11, frameY, WZ + 0.22);
    var tc = mkCanvas(2048, 320), tx = tc.getContext('2d'); tx.fillStyle = '#0c1410'; tx.fillRect(0, 0, 2048, 320); tx.strokeStyle = '#3dff9a'; tx.lineWidth = 10; tx.strokeRect(8, 8, 2032, 304);
    tx.textAlign = 'center'; tx.textBaseline = 'middle'; tx.shadowColor = '#3dff9a'; tx.shadowBlur = 30; tx.fillStyle = '#d8ffe9'; tx.font = '900 190px ' + SERIF; tx.fillText('🔐 LA CHAMBRE FORTE', 1024, 165, 1960);
    var titleY = frameY + frameH / 2 + 0.78;
    box(g, 5.7, 0.95, 0.08, darkM, 0, titleY, WZ + 0.2);
    var title = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.875), decal(sharp(mkTex(tc)))); title.position.set(0, titleY, WZ + 0.27); g.add(title);
    var safes = [], hits = [];
    var doorGeo = new THREE.BoxGeometry(1.0, 0.8, 0.07), gemGeo = new THREE.OctahedronGeometry(0.2, 0), bombGeo = new THREE.SphereGeometry(0.19, 20, 14);
    var gemMat = new THREE.MeshStandardMaterial({ color: 0x5dffd0, emissive: 0x18c9a0, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.3 }), bombMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.35, metalness: 0.5 });
    var fuseMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a }), cavM = new THREE.MeshBasicMaterial({ color: 0x07090c });
    function makeSafe(idx) {
      var c = idx % COLS, r = Math.floor(idx / COLS), cx = (c - (COLS - 1) / 2) * PX, cy = Y0 + (ROWS - 1 - r) * PY;
      var sf = new THREE.Group(); sf.position.set(cx, cy, WZ); g.add(sf);
      box(sf, 1.06, 0.86, 0.14, darkM, 0, 0, 0.06);
      var cav = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.76), cavM); cav.position.set(0, 0, 0.16); sf.add(cav);
      var glow = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.76), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })); glow.position.set(0, 0, 0.17); sf.add(glow);
      var gem = new THREE.Mesh(gemGeo, gemMat); gem.position.set(0, 0, 0.3); gem.visible = false; sf.add(gem);
      var bomb = new THREE.Group(); bomb.position.set(0, -0.04, 0.3); bomb.visible = false; sf.add(bomb);
      bomb.add(new THREE.Mesh(bombGeo, bombMat)); var fz = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), fuseMat); fz.position.set(0.04, 0.22, 0); fz.rotation.z = -0.4; bomb.add(fz);
      var spark = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), fuseMat); spark.position.set(0.09, 0.29, 0); bomb.add(spark);
      // le volet : il remonte dans le haut de sa case (il ne cache donc jamais les coffres voisins)
      var piv = new THREE.Group(); piv.position.set(0, 0.4, 0.42); sf.add(piv);
      var dg = new THREE.Group(); dg.position.set(0, -0.4, 0); piv.add(dg);
      var dmat = new THREE.MeshStandardMaterial({ color: 0x7d8696, roughness: 0.4, metalness: 0.55, emissive: 0x000000 });
      var door = new THREE.Mesh(doorGeo, dmat); door.userData.idx = idx; dg.add(door); hits.push(door);
      var dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 28), goldM); dial.rotation.x = Math.PI / 2; dial.position.set(0, 0.02, 0.055); dg.add(dial);
      var dial2 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 18), darkM); dial2.rotation.x = Math.PI / 2; dial2.position.set(0, 0.02, 0.07); dg.add(dial2);
      box(dg, 0.04, 0.2, 0.04, goldM, 0, 0.02, 0.095).rotation.z = 0.6;
      var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0x57b8ff })); lamp.position.set(0.35, 0.3, 0.045); dg.add(lamp);
      var no = mkCanvas(128, 64), nx = no.getContext('2d'); nx.fillStyle = '#c9d2e0'; nx.font = '800 44px ' + MONO; nx.textAlign = 'center'; nx.textBaseline = 'middle'; nx.fillText(String(idx + 1), 64, 34);
      var num = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), decal(sharp(mkTex(no)), true)); num.position.set(-0.33, -0.3, 0.05); dg.add(num);
      var s = { idx: idx, piv: piv, door: door, dmat: dmat, lamp: lamp, glow: glow, gem: gem, bomb: bomb, open: 0, want: 0, kind: '', t: Math.random() * 6 };
      safes.push(s); return s;
    }
    for (i = 0; i < CN; i++) makeSafe(i);

    /* --- les deux grands panneaux du mur : à gauche multiplicateur + tableau des gains, à droite le classement --- */
    var BW = 3.8, BH = 4.4, BCW = 1536, BCH = Math.round(BCW * BH / BW), BY = 3.3;
    function mkBoard(x) {
      var cv = mkCanvas(BCW, BCH), tex = sharp(new THREE.CanvasTexture(cv));
      var m = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), decal(tex)); m.position.set(x, BY, WZ + 0.2); g.add(m);
      box(g, BW + 0.2, BH + 0.2, 0.1, darkM, x, BY, WZ + 0.1);
      box(g, BW + 0.3, 0.1, 0.16, steel, x, BY + BH / 2 + 0.15, WZ + 0.12); box(g, BW + 0.3, 0.1, 0.16, steel, x, BY - BH / 2 - 0.15, WZ + 0.12);
      box(g, 0.1, BH + 0.3, 0.16, steel, x - BW / 2 - 0.15, BY, WZ + 0.12); box(g, 0.1, BH + 0.3, 0.16, steel, x + BW / 2 + 0.15, BY, WZ + 0.12);
      return { cv: cv, c: cv.getContext('2d'), tex: tex, sig: '', w: BCW, h: BCH };
    }
    var scrL = mkBoard(-5.3), scrR = mkBoard(5.3), top = [], topT = 0, topBusy = false;
    function loadTop() {
      if (topBusy) return; topBusy = true;
      fetch('/api/crash?vault=1', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { topBusy = false; if (d && d.ok && Array.isArray(d.top)) top = d.top; }).catch(function () { topBusy = false; });
    }

    /* --- les quatre postes : tabouret rembourré et pupitre lumineux --- */
    var seats = [], seat = null, view = { yaw: 0, pitch: 0 }, ui = null, standEl = null;
    var vel = new THREE.MeshStandardMaterial({ color: 0x0f5a3a, roughness: 0.7 });
    STOOLS.forEach(function (sx0, n) {
      var s = { n: n, x: sx0, z: STOOL_Z, yaw: 0, sx: sx0, sz: STOOL_Z + 1.1 };
      seats.push(s);
      var ch = new THREE.Group(); ch.position.set(sx0, 0, STOOL_Z); g.add(ch);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.46, 12), steel); stem.position.y = 0.23; ch.add(stem);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.04, 24), steel); base.position.y = 0.02; ch.add(base);
      var cush = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 24), vel); cush.position.y = 0.5; ch.add(cush);
      var bk = box(ch, 0.5, 0.42, 0.08, vel, 0, 0.82, 0.24); bk.rotation.x = -0.1;
      var desk = new THREE.Group(); desk.position.set(sx0, 0, STOOL_Z - 0.95); g.add(desk);
      box(desk, 0.9, 0.6, 0.5, darkM, 0, 0.3, 0);
      box(desk, 0.9, 0.04, 0.52, steel, 0, 0.62, 0);
      box(desk, 0.8, 0.012, 0.4, new THREE.MeshBasicMaterial({ color: 0x0f2a1c }), 0, 0.646, 0); box(desk, 0.8, 0.02, 0.02, neonM, 0, 0.64, 0.25);
      var kbc = mkCanvas(512, 192), kbx = kbc.getContext('2d'); kbx.fillStyle = '#0a1a12'; kbx.fillRect(0, 0, 512, 192);
      for (var kr = 0; kr < 3; kr++) for (var kc = 0; kc < 4; kc++) { kbx.fillStyle = kr === 2 && kc === 3 ? '#7ee0a0' : '#1f6b4a'; rr(kbx, 28 + kc * 120, 16 + kr * 56, 104, 44, 10); kbx.fill(); }
      var pad = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), decal(sharp(mkTex(kbc)))); pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.66, 0.02); desk.add(pad);
      room.colliders.push({ x: sx0, z: STOOL_Z, r: 0.3 }, { x: sx0, z: STOOL_Z - 0.95, r: 0.5 });
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sx0, 0.7, STOOL_Z); g.add(hit);
      room.interactables.push({ hit: hit, x: sx0, z: STOOL_Z, radius: 1.5, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🔐 S\'asseoir — Poste ' + (n + 1); }, use: function (w) { sit(w, s); } });
    });
    var alarm = null;
    g.add(new THREE.AmbientLight(0xcfe0ff, 1.25));
    if (!low) { alarm = new THREE.PointLight(0xff2a2a, 0, 12); alarm.position.set(0, 4.6, -4); g.add(alarm); }

    /* --- la partie --- */
    var G = { active: false, bet: 0, count: 3, revealed: [], mult: 1, pending: -1, bombs: [], over: false, win: 0 };
    var R = { busy: false, msg: '' }, bet = 100, count = 3, clockT = 0, alarmT = 0;
    function seatTaken(s) { var now = performance.now(); return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; }); }
    function setMsg(t, col) { R.msg = t; if (ui) { var m = ui.el.querySelector('.vt-msg'); m.textContent = t || ''; m.style.color = col || ''; } }
    function canCash() { return G.active && !R.busy && G.revealed.length > 0; }
    function refreshUi() {
      if (!ui || !seat) return;
      var idle = !G.active && !R.busy, e = ui.el;
      e.querySelector('.vt-bal b').textContent = fmtN(balance()) + ' 🪙'; e.querySelector('.vt-bet b').textContent = fmtN(G.active ? G.bet : bet) + ' 🪙';
      e.querySelector('.vt-setup').style.display = idle ? '' : 'none';
      [].forEach.call(e.querySelectorAll('[data-n]'), function (b) { b.classList.toggle('on', +b.dataset.n === count); });
      var go = e.querySelector('[data-a=go]'), cash = e.querySelector('[data-a=cash]');
      go.style.display = idle ? '' : 'none';
      cash.style.display = G.active ? '' : 'none'; cash.disabled = !canCash();
      cash.innerHTML = '💰 Encaisser ' + (G.revealed.length ? fmtN(Math.floor(G.bet * G.mult)) + ' 🪙' : '') + ' <kbd>Entrée</kbd>';
    }
    function drawBoards() {
      var W = BCW, Hh = BCH, c, d;
      var sigL = [G.active, G.over, G.mult, G.revealed.length, G.bet, G.win, bet, count].join('|');
      if (scrL.sig !== sigL) {
        scrL.sig = sigL; c = scrL.c; c.fillStyle = '#07100c'; c.fillRect(0, 0, W, Hh); c.strokeStyle = 'rgba(61,255,154,0.45)'; c.lineWidth = 8; c.strokeRect(12, 12, W - 24, Hh - 24);
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#7ee0a0'; c.font = '800 66px ' + SERIF; c.fillText(G.active ? 'MULTIPLICATEUR' : (G.over ? (G.win > 0 ? 'GAIN ENCAISSÉ' : 'PERDU') : 'PRÊT À JOUER'), W / 2, 100, W - 100);
        c.shadowColor = G.over && !G.win ? '#ff4a4a' : '#3dff9a'; c.shadowBlur = 36; c.fillStyle = G.over && !G.win ? '#ff8a80' : '#e8fff1'; c.font = '900 270px ' + MONO;
        c.fillText(G.over && !G.win ? '💥' : '×' + fx2(G.active || G.over ? G.mult : 1), W / 2, 330, W - 100); c.shadowBlur = 0;
        c.fillStyle = '#f3cf62'; c.font = '800 72px ' + SERIF;
        c.fillText(G.active ? 'Gain : ' + fmtN(Math.floor(G.bet * G.mult)) + ' 🪙' : (G.over && G.win > 0 ? '+' + fmtN(G.win) + ' 🪙' : 'Mise : ' + fmtN(bet) + ' 🪙'), W / 2, 520, W - 100);
        var cnt = G.active || G.over ? G.count : count;
        c.fillStyle = '#9fb6a8'; c.font = '700 46px ' + SERIF; c.fillText(cnt + ' 💣 · ' + (CN - cnt) + ' 💎 cachés', W / 2, 600, W - 100);
        c.strokeStyle = 'rgba(243,207,98,0.5)'; c.lineWidth = 4; c.beginPath(); c.moveTo(80, 660); c.lineTo(W - 80, 660); c.stroke();
        c.fillStyle = '#f3cf62'; c.font = '800 56px ' + SERIF; c.fillText('TABLEAU DES GAINS', W / 2, 725, W - 100);
        var rows = 6, y0 = 780, rh = (Hh - y0 - 50) / rows, n0 = G.active ? Math.max(0, Math.min(G.revealed.length, CN - cnt - rows)) : 0;
        for (var q = 0; q < rows; q++) {
          var nn = n0 + q + 1, yy = y0 + q * rh, reached = G.active && G.revealed.length >= nn, nextOne = G.active && G.revealed.length + 1 === nn;
          c.fillStyle = reached ? 'rgba(61,255,154,0.28)' : nextOne ? 'rgba(243,207,98,0.3)' : 'rgba(255,255,255,0.06)'; rr(c, 60, yy, W - 120, rh - 10, 14); c.fill();
          c.textAlign = 'left'; c.fillStyle = reached ? '#9affc8' : '#cfd9d3'; c.font = '800 52px ' + SERIF; c.fillText(nn + ' 💎', 100, yy + rh / 2 - 4);
          c.textAlign = 'right'; c.font = '900 56px ' + MONO; c.fillStyle = reached ? '#9affc8' : nextOne ? '#ffe08a' : '#e8fff1'; c.fillText('×' + fx2(minesMult(cnt, nn)), W - 100, yy + rh / 2 - 4);
        }
        scrL.tex.needsUpdate = true;
      }
      var sigR = JSON.stringify(top);
      if (scrR.sig !== sigR) {
        scrR.sig = sigR; d = scrR.c; d.fillStyle = '#07100c'; d.fillRect(0, 0, W, Hh); d.strokeStyle = 'rgba(243,207,98,0.55)'; d.lineWidth = 8; d.strokeRect(12, 12, W - 24, Hh - 24);
        d.textAlign = 'center'; d.textBaseline = 'middle'; d.fillStyle = '#ffe08a'; d.shadowColor = '#ffb300'; d.shadowBlur = 24; d.font = '900 78px ' + SERIF; d.fillText('🏆 CLASSEMENT', W / 2, 105, W - 100); d.shadowBlur = 0;
        d.fillStyle = '#9fb6a8'; d.font = '700 44px ' + SERIF; d.fillText('Plus gros gains encaissés', W / 2, 185, W - 100);
        var rh2 = (Hh - 270) / 5;
        for (var k2 = 0; k2 < 5; k2++) {
          var e = top[k2], yy2 = 235 + k2 * rh2, ml = ['🥇', '🥈', '🥉'][k2] || '#' + (k2 + 1);
          d.fillStyle = e ? (k2 === 0 ? 'rgba(243,207,98,0.25)' : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.04)'; rr(d, 50, yy2, W - 100, rh2 - 14, 18); d.fill();
          d.strokeStyle = k2 === 0 && e ? '#f3cf62' : 'rgba(255,255,255,0.12)'; d.lineWidth = 4; rr(d, 50, yy2, W - 100, rh2 - 14, 18); d.stroke();
          d.textAlign = 'center'; d.font = '800 74px ' + F.EMOJI_FONT; d.fillStyle = '#fff'; d.fillText(ml, 135, yy2 + (rh2 - 14) / 2 + 4);
          if (!e) { d.textAlign = 'left'; d.fillStyle = '#6f8478'; d.font = '700 52px ' + SERIF; d.fillText('Place libre', 230, yy2 + (rh2 - 14) / 2 + 4); continue; }
          d.textAlign = 'left'; d.fillStyle = '#fff'; d.font = '800 56px ' + SERIF; d.fillText(e.name, 230, yy2 + (rh2 - 14) * 0.34, 760);
          d.fillStyle = '#9fb6a8'; d.font = '600 38px ' + MONO; d.fillText('mise ' + fmtN(e.bet) + ' · ×' + fx2(e.mult), 230, yy2 + (rh2 - 14) * 0.74, 760);
          d.textAlign = 'right'; d.fillStyle = '#7ee0a0'; d.font = '900 60px ' + MONO; d.fillText('+' + fmtN(e.win), W - 90, yy2 + (rh2 - 14) / 2 + 4, 520);
        }
        scrR.tex.needsUpdate = true;
      }
    }
    function resetSafes() { safes.forEach(function (s) { s.want = 0; s.kind = ''; s.dmat.emissive.setHex(0x000000); s.lamp.material.color.setHex(0x57b8ff); s.glow.material.opacity = 0; }); }
    function openSafe(s, kind) {
      s.want = 1; s.kind = kind;
      if (kind === 'gem') { s.lamp.material.color.setHex(0x3dff9a); s.dmat.emissive.setHex(0x0a5a30); s.glow.material.color.setHex(0x18c9a0); s.glow.material.opacity = 0.45; }
      else { s.lamp.material.color.setHex(0xff3a3a); s.dmat.emissive.setHex(0x5a0a0a); s.glow.material.color.setHex(0xff2a2a); s.glow.material.opacity = 0.45; }
    }
    function startGame() {
      if (G.active || R.busy) return;
      if (!loggedIn()) { setMsg('Connecte-toi pour jouer à la Chambre Forte.', '#ff8a80'); return; }
      if (bet < 1 || bet > balance()) { setMsg(bet > balance() ? 'Solde insuffisant pour cette mise.' : 'Mise invalide.', '#ff8a80'); return; }
      R.busy = true; setMsg('Ouverture de la chambre…'); refreshUi();
      sg({ action: 'mines_start', bet: bet, count: count }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Impossible de lancer la partie.', '#ff8a80'); refreshUi(); return; }
        resetSafes(); G = { active: true, bet: r.game.bet, count: r.game.count, revealed: [], mult: 1, pending: -1, bombs: [], over: false, win: 0 };
        setMsg('Clique sur un coffre pour l\'ouvrir.'); refreshUi();
      });
    }
    function pick(idx) {
      if (!G.active || R.busy || G.revealed.indexOf(idx) >= 0) return;
      R.busy = true; G.pending = idx; safes[idx].lamp.material.color.setHex(0xffb020); setMsg('…'); refreshUi();
      sg({ action: 'mines_pick', idx: idx }).then(function (r) {
        R.busy = false; G.pending = -1;
        if (!r || !r.ok) { safes[idx].lamp.material.color.setHex(0x57b8ff); setMsg((r && r.error) || 'Action impossible.', '#ff8a80'); refreshUi(); return; }
        if (r.boom) {
          G.active = false; G.over = true; G.win = 0; G.bombs = r.bombs || [];
          G.bombs.forEach(function (b) { if (safes[b] && safes[b].kind !== 'gem') openSafe(safes[b], 'bomb'); });
          alarmT = 3; sfx('playBoomSound'); setMsg('💥 BOOM ! Bombe… la mise est perdue.', '#ff8a80');
        } else {
          G.revealed = r.game.revealed; G.mult = r.game.mult; openSafe(safes[idx], 'gem'); sfx('playCoinWinSound');
          setMsg('💎 Diamant ! ×' + fx2(G.mult) + ' — continue ou encaisse.', '#7ee0a0');
        }
        refreshUi();
      });
    }
    function cashout() {
      if (!canCash()) return;
      R.busy = true; setMsg('Retrait en cours…'); refreshUi();
      sg({ action: 'mines_cashout' }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Retrait impossible.', '#ff8a80'); refreshUi(); return; }
        G.active = false; G.over = true; G.win = r.win || 0; G.bombs = r.bombs || [];
        G.bombs.forEach(function (b) { if (safes[b] && safes[b].kind !== 'gem') { openSafe(safes[b], 'bomb'); safes[b].glow.material.opacity = 0.2; } });
        sfx('playCoinWinSound'); setMsg('💰 +' + fmtN(G.win) + ' 🪙 encaissés !', '#7ee0a0'); refreshUi();
        setTimeout(loadTop, 700);                                       // le classement vient d'être mis à jour par le serveur
      });
    }

    /* --- s'asseoir / se lever, interface --- */
    function injectCss() {
      if (document.getElementById('vt3d-css')) return;
      var s = document.createElement('style'); s.id = 'vt3d-css';
      s.textContent = '.vt3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(560px,94%);background:rgba(6,12,10,.92);border:1px solid rgba(126,224,160,.6);border-radius:16px;padding:12px 14px;color:#d8ffe9;pointer-events:auto;display:flex;flex-direction:column;gap:8px;z-index:5;font-size:13px}' +
        '.vt3d .vt-top{display:flex;justify-content:space-between;font-weight:800}.vt3d .vt-msg{min-height:20px;text-align:center;font-weight:800;font-size:15px}.vt3d .vt-row{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;align-items:center}.vt3d .vt-setup{display:flex;flex-direction:column;gap:8px}' +
        '.vt3d .vt-chip{padding:6px 11px;border-radius:999px;border:2px solid #f3cf62;background:#1c1a0c;color:#f3cf62;font-weight:900;font-size:13px;cursor:pointer}.vt3d .vt-chip.minus{border-color:#ff8a80;color:#ff8a80}' +
        '.vt3d .vt-n{padding:6px 12px;border-radius:10px;border:2px solid #3b6b52;background:#0f1d16;color:#d8ffe9;font-weight:900;cursor:pointer}.vt3d .vt-n.on{border-color:#3dff9a;background:#14503a}' +
        '.vt3d .vt-b{padding:10px 22px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#06140c;background:linear-gradient(90deg,#3dff9a,#17c06a);align-self:center}.vt3d .vt-b.cash{background:linear-gradient(90deg,#ffd24a,#f08a00)}.vt3d .vt-b:disabled{opacity:.4;cursor:not-allowed}.vt3d kbd{opacity:.7;font-size:11px;margin-left:4px}' +
        '.vt3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.vt3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(126,224,160,.6);background:rgba(6,12,10,.85);color:#d8ffe9;font-weight:800;cursor:pointer}';
      s.textContent += '@media (max-height:520px){.vt3d{bottom:62px;width:min(560px,66%);padding:5px 8px;gap:3px}.vt3d .vt-msg{font-size:12px;min-height:14px}.vt3d .vt-top{font-size:11px}.vt3d .vt-chip{padding:3px 8px;font-size:11px}.vt3d .vt-n{padding:3px 9px}.vt3d .vt-b{padding:6px 14px;font-size:12px}.vt3d-stand{bottom:auto;top:64px}}';
      document.head.appendChild(s);
    }
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.stopImmediatePropagation(); e.preventDefault(); if (G.active) cashout(); else startGame(); }
    }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0; R.busy = false;
      injectCss();
      var el = document.createElement('div'); el.className = 'vt3d';
      el.innerHTML = '<div class="vt-top"><span class="vt-bal">Solde : <b></b></span><span class="vt-bet">Mise : <b></b></span></div><div class="vt-msg"></div>' +
        '<div class="vt-setup"><div class="vt-row">' + BETS.map(function (c) { return '<button class="vt-chip" data-c="' + c + '">+' + fmtN(c) + '</button>'; }).join('') + '<button class="vt-chip minus" data-c="-1">Effacer</button></div>' +
        '<div class="vt-row">💣 Bombes : ' + BOMBS.map(function (n) { return '<button class="vt-n" data-n="' + n + '">' + n + '</button>'; }).join('') + '</div></div>' +
        '<button class="vt-b" data-a="go">🔐 Lancer la partie <kbd>Entrée</kbd></button><button class="vt-b cash" data-a="cash"></button>';
      w.container.appendChild(el); ui = { el: el };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.c) { if (G.active || R.busy) return; bet = b.dataset.c === '-1' ? 10 : Math.min(bet + parseInt(b.dataset.c, 10), 1000000); if (G.over) { G.over = false; resetSafes(); } refreshUi(); return; }
        if (b.dataset.n) { if (G.active || R.busy) return; count = +b.dataset.n; if (G.over) { G.over = false; resetSafes(); } refreshUi(); return; }
        if (b.dataset.a === 'go') startGame(); else if (b.dataset.a === 'cash') cashout();
      });
      standEl = document.createElement('div'); standEl.className = 'vt3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
      setMsg(G.active ? 'Partie en cours : clique sur un coffre.' : (loggedIn() ? 'Règle ta mise et les bombes, puis lance la partie.' : 'Connecte-toi pour jouer.')); refreshUi();
    }
    function stand() {
      if (!seat) return;
      var s = seat; seat = null;
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.05, z: 0.28 };      // assise à 0,55 m
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-0.5, Math.min(0.5, drag.seat.yaw - dx * 0.005)); if (drag.mouse) view.pitch = Math.max(-0.3, Math.min(0.3, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.5; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.2; }
      var ex = s.x, ey = 1.65, ez = s.z - 0.2, tx2 = 0, ty2 = 3.0, tz2 = -HZ;
      var a = Math.atan2(tx2 - ex, -(tz2 - ez)) + view.yaw, p = Math.atan2(ty2 - ey, Math.hypot(tx2 - ex, tz2 - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 8, ty: ey + Math.sin(p) * 8, tz: ez - Math.cos(a) * Math.cos(p) * 8, fov: 62 };
    };
    room.seatClick = function (ray) {
      if (!seat) return;
      var hit = ray.intersectObjects(hits, false)[0];
      if (hit && hit.object.userData.idx !== undefined) pick(hit.object.userData.idx);
    };
    room.syncHud = function () { refreshUi(); };
    room.spawn = function () { return { x: 0, z: HZ - 2.6, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? "Joystick : marcher · touche un poste pour t'asseoir · touche les coffres pour les ouvrir · derrière toi : retour aux mini jeux" : 'ZQSD / flèches : marcher · Maj : courir · avance vers un poste (F ou clic) · assis : mise, bombes, Lancer, puis clique sur les coffres · Entrée : lancer / encaisser · F : se lever · derrière toi : retour aux mini jeux'; };
    room.onEnter = function () { loadTop(); };
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      clockT += dt; topT += dt; if (topT > 20) { topT = 0; loadTop(); }
      var spd = Math.min(1, dt * 7);
      safes.forEach(function (s) {
        s.open += (s.want - s.open) * spd; s.piv.scale.y = 1 - 0.97 * s.open;
        s.gem.visible = s.kind === 'gem' && s.open > 0.05; s.bomb.visible = s.kind === 'bomb' && s.open > 0.05;
        if (s.open > 0.02) { s.gem.rotation.y += dt * 1.8; s.gem.position.y = Math.sin(clockT * 2.2 + s.t) * 0.03; s.bomb.rotation.y += dt * 0.6; }
        if (G.active && s.want === 0 && s.lamp.material.color.getHex() === 0x57b8ff) s.lamp.visible = Math.sin(clockT * 3 + s.t) > -0.6; else s.lamp.visible = true;
      });
      if (alarm) { alarmT = Math.max(0, alarmT - dt); alarm.intensity = alarmT > 0 ? 1.6 * (0.5 + 0.5 * Math.sin(clockT * 14)) : 0; }
      drawBoards();
    };
    room.dispose = function () { stand(); };
    return room;
  }

  F.registerRoom('vault', createVaultRoom);
})();
