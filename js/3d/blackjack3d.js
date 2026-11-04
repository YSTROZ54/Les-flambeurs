/* =====================================================================
   blackjack3d.js — La salle de blackjack (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « BLACKJACK » du hall (hall3d.js) et on en ressort vers le hall.
   Cinq tables en demi-cercle (quatre le long des murs, une au milieu), chacune avec son croupier assis en face et deux places de jeu (F ou clic pour s'asseoir) : on peut jouer seul.
   Manche partagée, gérée entièrement par le serveur (api/blackjack.js, tables bj_pub_1 à bj_pub_5, une par table 3D) : dès qu'un joueur mise, les autres ont
   BJ_BET_COUNTDOWN_MS (10 s) pour miser à leur tour et rejoindre la MÊME manche (même croupier, même résultat) ; passé ce délai elle démarre quand même, seul si besoin.
   « Prêt » n'attend plus le délai. Le client sonde l'état de la table environ 1x/s (world.post / fetch), avec un petit ping temps réel pour sonder plus tôt dès qu'un
   adversaire joue. Chaque joueur ne voit QUE sa propre place et celle d'en face (2 places par table) ; les cartes et pastilles sont posées à partir de cet état, jamais simulées localement.
   Fichiers liés : f3d-core.js, world3d.js, persona3d.js (personnages), hall3d.js (la porte), api/blackjack.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 14, HZ = 11, H = 5.4;
  var TABLE_R = 1.9, SEAT_R = 2.5, TOP_Y = 0.86;
  var TABLES = [{ x: -6.5, z: -4.6, bots: [] }, { x: 6.5, z: -4.6, bots: [] }, { x: -6.5, z: 2.6, bots: [] }, { x: 6.5, z: 2.6, bots: [] }, { x: 0, z: -1.0, bots: [] }];
  var PHI = [-0.55, 0.55];                                  // angle des deux places de jeu, autour de la table (le croupier est assis en face)
  var DEALER_NAMES = ['Margaux', 'Lucien', 'Joséphine', 'Armand', 'Céleste'];   // un par table : femme aux tables 1, 3, 5, homme aux tables 2 et 4
  var BOT_NAMES = ['Léo', 'Nina', 'Karim', 'Zoé', 'Yann', 'Lola', 'Max', 'Inès', 'Hugo', 'Maya', 'Sam', 'Éva'];
  var SUIT_COL = { '♥': '#c8202f', '♦': '#c8202f', '♠': '#15151a', '♣': '#15151a' };
  var CHIPS = [10, 50, 100, 500, 1000, 5000];
  var MIN_BET = 10;   // pas de mise maximale : seul le solde limite

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  var cache = {};
  function lam(c) { var k = 'l' + c; return cache[k] || (cache[k] = new THREE.MeshLambertMaterial({ color: c })); }
  function std(c, r, m) { var k = 's' + c + r + m; return cache[k] || (cache[k] = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })); }
  function bas(c) { var k = 'b' + c; return cache[k] || (cache[k] = new THREE.MeshBasicMaterial({ color: c })); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- cartes ---------- */
  function score(cards) {
    var t = 0, a = 0;
    cards.forEach(function (c) { if (!c || c.r === '?') return; if (c.r === 'A') { a++; t += 11; } else if (c.r === 'K' || c.r === 'Q' || c.r === 'J') t += 10; else t += parseInt(c.r, 10) || 0; });
    while (t > 21 && a > 0) { t -= 10; a--; }
    return t;
  }
  var texCache = {};
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function cardTex(c) {
    var key = c.r === '?' ? 'back' : c.r + c.s;
    if (texCache[key]) return texCache[key];
    var CS = F.isMobile() ? 4 : 6, cv = mkCanvas(160 * CS, 224 * CS), x = cv.getContext('2d'); x.scale(CS, CS);   // texture très fine (6x sur PC, 4x sur téléphone) : les cartes se lisent sans les agrandir
    roundRect(x, 3, 3, 154, 218, 14);
    if (key === 'back') {
      var g = x.createLinearGradient(0, 0, 160, 224); g.addColorStop(0, '#7a0f1c'); g.addColorStop(1, '#3d0610'); x.fillStyle = g; x.fill(); x.lineWidth = 6; x.strokeStyle = '#f3cf62'; x.stroke();
      x.strokeStyle = 'rgba(243,207,98,0.55)'; x.lineWidth = 2; roundRect(x, 16, 16, 128, 192, 8); x.stroke();
      x.fillStyle = '#f3cf62'; x.font = '900 70px ' + SERIF; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♠', 80, 112);
    } else {
      x.fillStyle = '#fbf7ec'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#b9b19a'; x.stroke();
      x.fillStyle = SUIT_COL[c.s] || '#15151a'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '900 52px ' + SERIF; x.fillText(c.r, 31, 36); x.font = '700 42px ' + SERIF; x.fillText(c.s, 31, 78);
      x.save(); x.translate(129, 188); x.rotate(Math.PI); x.font = '900 52px ' + SERIF; x.fillText(c.r, 0, 0); x.font = '700 42px ' + SERIF; x.fillText(c.s, 0, 42); x.restore();
      x.font = '900 100px ' + SERIF; x.fillText(c.s, 80, 116);
    }
    var t = new THREE.CanvasTexture(cv); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 16; return (texCache[key] = t);   // mipmaps : net de loin comme de près, sans scintillement
  }
  var cardGeo = null;
  function makeCard(c) {
    if (!cardGeo) cardGeo = new THREE.PlaneGeometry(0.25, 0.35);
    var m = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardTex(c) })); m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2;   // les cartes sont posées à plat sur le feutre
     m.userData.card = c; return m;
  }

  function createBlackjackRoom(world) {
    var low = world.low;
    var room = { title: '🃏 BLACKJACK', subtitle: 'JOUE CONTRE LE CROUPIER', topic: 'flambeurs-blackjack-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- salle : moquette verte à motif, murs bordeaux et dorures, plafond sombre --- */
    // sol : dalles de marbre vert sombre veinées d'or, polies, avec joints dorés (une image = 2 x 2 dalles de 1,5 m)
    var fc = mkCanvas(512, 512), fx = fc.getContext('2d');
    [['#0f3a2a', '#0a281e'], ['#0a2a1f', '#07180f'], ['#0a2a1f', '#07180f'], ['#0f3a2a', '#0a281e']].forEach(function (cc, q) {
      var qx = (q % 2) * 256, qy = Math.floor(q / 2) * 256, gr = fx.createLinearGradient(qx, qy, qx + 256, qy + 256);
      gr.addColorStop(0, cc[0]); gr.addColorStop(1, cc[1]); fx.fillStyle = gr; fx.fillRect(qx, qy, 256, 256);
      fx.save(); fx.beginPath(); fx.rect(qx, qy, 256, 256); fx.clip();
      for (var v = 0; v < 7; v++) {
        fx.strokeStyle = 'rgba(' + (v % 2 ? '233,208,130' : '210,235,220') + ',' + (0.05 + Math.random() * 0.1) + ')'; fx.lineWidth = 0.8 + Math.random() * 1.6; fx.beginPath();
        var vx = qx + Math.random() * 256, vy = qy + Math.random() * 256; fx.moveTo(vx, vy);
        for (var k = 0; k < 4; k++) { vx += (Math.random() - 0.3) * 90; vy += (Math.random() - 0.3) * 90; fx.quadraticCurveTo(vx + (Math.random() - 0.5) * 60, vy + (Math.random() - 0.5) * 60, vx, vy); }
        fx.stroke();
      }
      fx.restore();
    });
    fx.strokeStyle = 'rgba(214,176,70,0.85)'; fx.lineWidth = 5; fx.strokeRect(0, 0, 512, 512); fx.beginPath(); fx.moveTo(256, 0); fx.lineTo(256, 512); fx.moveTo(0, 256); fx.lineTo(512, 256); fx.lineWidth = 3; fx.stroke();
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 3, HZ * 2 / 3); ft.anisotropy = 16;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.3, metalness: 0.18 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    // grands tapis ronds bordeaux et or sous chaque table
    var rc = mkCanvas(512, 512), rx = rc.getContext('2d'), rg = rx.createRadialGradient(256, 256, 20, 256, 256, 250);
    rg.addColorStop(0, '#5a1424'); rg.addColorStop(0.7, '#430c1a'); rg.addColorStop(1, '#2d0711'); rx.fillStyle = rg; rx.beginPath(); rx.arc(256, 256, 250, 0, TAU); rx.fill();
    [[240, 5, 0.95], [226, 2, 0.7], [160, 2, 0.5], [120, 3, 0.55]].forEach(function (rr) { rx.strokeStyle = 'rgba(232,196,96,' + rr[2] + ')'; rx.lineWidth = rr[1]; rx.beginPath(); rx.arc(256, 256, rr[0], 0, TAU); rx.stroke(); });
    for (i = 0; i < 24; i++) { var an = i / 24 * TAU; rx.fillStyle = 'rgba(232,196,96,0.55)'; rx.beginPath(); rx.moveTo(256 + Math.cos(an) * 200, 256 + Math.sin(an) * 200); rx.lineTo(256 + Math.cos(an + 0.07) * 168, 256 + Math.sin(an + 0.07) * 168); rx.lineTo(256 + Math.cos(an - 0.07) * 168, 256 + Math.sin(an - 0.07) * 168); rx.closePath(); rx.fill(); }
    var rugMat = new THREE.MeshStandardMaterial({ map: mkTex(rc), roughness: 0.95, metalness: 0, transparent: true });
    // murs : papier peint damassé bordeaux, lambris de bois sombre, pilastres, corniche dorée et appliques
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'), wgr = wx.createLinearGradient(0, 0, 256, 0);
    wgr.addColorStop(0, '#3a0a16'); wgr.addColorStop(0.5, '#4d1020'); wgr.addColorStop(1, '#3a0a16'); wx.fillStyle = wgr; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(201,162,39,0.2)'; wx.lineWidth = 2;
    for (i = -256; i <= 256; i += 64) { wx.beginPath(); wx.moveTo(i, 0); wx.lineTo(i + 256, 256); wx.stroke(); wx.beginPath(); wx.moveTo(i + 256, 0); wx.lineTo(i, 256); wx.stroke(); }
    [[64, 0], [192, 0], [0, 64], [128, 64], [256, 64], [64, 128], [192, 128], [0, 192], [128, 192], [256, 192], [64, 256], [192, 256]].forEach(function (q) {
      wx.fillStyle = 'rgba(201,162,39,0.38)'; wx.beginPath(); wx.arc(q[0], q[1], 5, 0, TAU); wx.fill();
      [[0, -11], [11, 0], [0, 11], [-11, 0]].forEach(function (o) { wx.beginPath(); wx.arc(q[0] + o[0], q[1] + o[1], 3.2, 0, TAU); wx.fill(); });
    });
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 16;
    var wdc = mkCanvas(256, 256), wdx = wdc.getContext('2d'); wdx.fillStyle = '#2b150d'; wdx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 40; i++) { wdx.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.08) + ')'; wdx.fillRect(Math.random() * 256, 0, 1 + Math.random() * 2, 256); }
    wdx.strokeStyle = 'rgba(201,162,39,0.55)'; wdx.lineWidth = 3; wdx.strokeRect(22, 22, 212, 212); wdx.strokeStyle = 'rgba(0,0,0,0.5)'; wdx.lineWidth = 6; wdx.strokeRect(34, 34, 188, 188);
    var panelTex = new THREE.CanvasTexture(wdc); panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping; panelTex.anisotropy = 16;
    var wood = std(0x2b150d, 0.55, 0.25), gold = std(0xc9a227, 0.35, 0.7);
    // une paroi : le papier peint au-dessus, le lambris en bas (len : longueur, c : centre x/z, ry : orientation)
    function wall(len, px, pz, ry, doorGap) {
      var wt = wallTex.clone(); wt.needsUpdate = true; wt.repeat.set(len / 2.2, (H - 1.3) / 2.2);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.85 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m);
      // lambris : en une ou deux pièces (on laisse la porte dégagée)
      var spans = doorGap ? [[-len / 2, -doorGap / 2], [doorGap / 2, len / 2]] : [[-len / 2, len / 2]];
      spans.forEach(function (sp) {
        var l = sp[1] - sp[0], c0 = (sp[0] + sp[1]) / 2, pt = panelTex.clone(); pt.needsUpdate = true; pt.repeat.set(l / 1.4, 1);
        var lam0 = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.2), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.6, metalness: 0.15 }));
        lam0.position.set(px + Math.cos(ry) * c0 + Math.sin(ry) * 0.04, 0.6, pz - Math.sin(ry) * c0 + Math.cos(ry) * 0.04); lam0.rotation.y = ry; g.add(lam0);
      });
    }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI, 3.0); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    // moulures : plinthe, main courante dorée, corniche
    var DG = 3.0, HB = (HX * 2 - DG) / 2;     // largeur laissée libre devant la porte, et longueur de chaque morceau de mur de part et d'autre
    [[HX * 2, 0.12, 0.1, 0, 0.06, -HZ + 0.05], [HB, 0.12, 0.1, -(DG / 2 + HB / 2), 0.06, HZ - 0.05], [HB, 0.12, 0.1, DG / 2 + HB / 2, 0.06, HZ - 0.05], [0.1, 0.12, HZ * 2, -HX + 0.05, 0.06, 0], [0.1, 0.12, HZ * 2, HX - 0.05, 0.06, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], wood, d[3], d[4], d[5]); });
    [[HX * 2, 0.07, 0.12, 0, 1.22, -HZ + 0.06], [HB, 0.07, 0.12, -(DG / 2 + HB / 2), 1.22, HZ - 0.06], [HB, 0.07, 0.12, DG / 2 + HB / 2, 1.22, HZ - 0.06], [0.12, 0.07, HZ * 2, -HX + 0.06, 1.22, 0], [0.12, 0.07, HZ * 2, HX - 0.06, 1.22, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    [[HX * 2, 0.3, 0.3, 0, H - 0.15, -HZ + 0.15], [HX * 2, 0.3, 0.3, 0, H - 0.15, HZ - 0.15], [0.3, 0.3, HZ * 2, -HX + 0.15, H - 0.15, 0], [0.3, 0.3, HZ * 2, HX - 0.15, H - 0.15, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], wood, d[3], d[4], d[5]); });
    [[HX * 2, 0.06, 0.06, 0, H - 0.33, -HZ + 0.34], [HX * 2, 0.06, 0.06, 0, H - 0.33, HZ - 0.34], [0.06, 0.06, HZ * 2, -HX + 0.34, H - 0.33, 0], [0.06, 0.06, HZ * 2, HX - 0.34, H - 0.33, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    // pilastres de bois avec base et chapiteau dorés, et une applique entre chaque
    // appliques : tulipe de verre dépoli sur un bras doré, halo chaud et grande tache de lumière douce sur le mur
    var haloC = mkCanvas(128, 128), hx = haloC.getContext('2d'), hg = hx.createRadialGradient(64, 64, 2, 64, 64, 62);
    hg.addColorStop(0, 'rgba(255,235,190,1)'); hg.addColorStop(0.3, 'rgba(255,200,120,0.45)'); hg.addColorStop(1, 'rgba(255,170,80,0)'); hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
    var haloTex = mkTex(haloC), haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
    var washC = mkCanvas(128, 256), wsx = washC.getContext('2d'); wsx.save(); wsx.translate(64, 128); wsx.scale(1, 2); var wg = wsx.createRadialGradient(0, 0, 4, 0, 0, 62); wg.addColorStop(0, 'rgba(255,205,130,0.85)'); wg.addColorStop(0.5, 'rgba(255,170,90,0.28)'); wg.addColorStop(1, 'rgba(255,150,70,0)'); wsx.fillStyle = wg; wsx.fillRect(-64, -64, 128, 128); wsx.restore();
    var washMat = new THREE.MeshBasicMaterial({ map: mkTex(washC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    var shadeGeo = new THREE.LatheGeometry([[0.015, 0], [0.05, 0.03], [0.085, 0.11], [0.1, 0.2], [0.09, 0.25]].map(function (a) { return new THREE.Vector2(a[0], a[1]); }), 18);
    var shadeMat = new THREE.MeshBasicMaterial({ color: 0xffe3b5, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    function pilaster(x, z, ry) {
      var q = new THREE.Group(); q.position.set(x, 0, z); q.rotation.y = ry; g.add(q);
      box(q, 0.5, H - 0.3, 0.22, wood, 0, (H - 0.3) / 2, 0.11); box(q, 0.64, 0.16, 0.3, gold, 0, 0.08, 0.15); box(q, 0.64, 0.16, 0.3, gold, 0, H - 0.4, 0.15);
    }
    function sconce(x, z, ry) {
      var q = new THREE.Group(); q.position.set(x, 2.45, z); q.rotation.y = ry; g.add(q);
      box(q, 0.12, 0.36, 0.05, gold, 0, 0.02, 0.025);
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), gold); arm.rotation.x = Math.PI / 2; arm.position.set(0, -0.05, 0.13); q.add(arm);
      var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.05, 12), gold); cup.position.set(0, -0.05, 0.23); q.add(cup);
      var sh = new THREE.Mesh(shadeGeo, shadeMat); sh.position.set(0, -0.03, 0.23); q.add(sh);
      var halo = new THREE.Sprite(haloMat); halo.scale.set(0.75, 0.75, 1); halo.position.set(0, 0.12, 0.24); q.add(halo);
      var wash = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.0), washMat); wash.position.set(0, 0.1, 0.012); q.add(wash);
    }
    [-10, -4.8, 4.8, 10].forEach(function (x) { pilaster(x, -HZ, 0); pilaster(x, HZ, Math.PI); });
    [-7, 0, 7].forEach(function (z) { pilaster(-HX, z, Math.PI / 2); pilaster(HX, z, -Math.PI / 2); });
    [-7.4, 7.4].forEach(function (x) { sconce(x, -HZ, 0); });
    [-7, 7].forEach(function (x) { sconce(x, HZ, Math.PI); });
    [-3.5, 3.5].forEach(function (z) { sconce(-HX, z, Math.PI / 2); sconce(HX, z, -Math.PI / 2); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    // enseigne néon au fond
    var sc0 = mkCanvas(1024, 256), sx = sc0.getContext('2d'); sx.fillStyle = '#12060a'; sx.fillRect(0, 0, 1024, 256); sx.strokeStyle = '#ff5a6a'; sx.lineWidth = 10; sx.strokeRect(10, 10, 1004, 236);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.shadowColor = '#ff3b4f'; sx.shadowBlur = 30; sx.fillStyle = '#ffd7dc'; sx.font = '900 150px ' + SERIF; sx.fillText('♠ BLACKJACK ♥', 512, 138, 960);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.9), new THREE.MeshBasicMaterial({ map: mkTex(sc0) })); sign.position.set(0, 3.7, -HZ + 0.07); g.add(sign);

    // tableaux muraux (affiches Art Déco, déjà encadrées dans l'image) : au-dessus de la main courante, sous la corniche
    function poster(fichier, px, py, pz, ry, w, h) {
      var mat = new THREE.MeshBasicMaterial({ color: 0x1c0810 });   // sombre le temps que l'image arrive
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); plane.position.set(px, py, pz); plane.rotation.y = ry; g.add(plane);
      new THREE.TextureLoader().load(fichier, function (t) {
        t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
        mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true;
      }, undefined, function () { /* pas d'image : fond sombre */ });
    }
    poster('assets/bannieres/blackjack-cartes.jpg?v=1', 3.15, 2.6, HZ - 0.08, Math.PI, 1.6, 2.4);     // mur de la porte, à droite
    poster('assets/bannieres/blackjack-roulette.jpg?v=1', -3.15, 2.6, HZ - 0.08, Math.PI, 1.6, 2.4);  // mur de la porte, à gauche
    poster('assets/bannieres/blackjack-croupiere.jpg?v=1', -HX + 0.08, 2.6, 9, Math.PI / 2, 1.6, 2.4); // mur de gauche, coin du fond

    /* --- tables, croupiers, tabourets, robots --- */
    var felt = std(0x0e6b3f, 0.95, 0), woodM = std(0x2a140c, 0.5, 0.2), feltD = new THREE.MeshStandardMaterial({ color: 0x0e6b3f, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }), woodD = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }), seatM = std(0x8f0f20, 0.6, 0.1), chromeM = std(0xc9ced6, 0.35, 0.8);
    var tables = [], seats = [], people = [], anims = [], timers = [], clockT = 0;
    var leatherM = new THREE.MeshStandardMaterial({ color: 0x4a1019, roughness: 0.42, metalness: 0.15 }), velvetM = new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.75, metalness: 0.02, side: THREE.DoubleSide }), velvetD = new THREE.MeshStandardMaterial({ color: 0x4a0812, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide });
    // feutre : image posée à plat sur le plateau en D (coin haut = bord du croupier), cercles de mise, zone du croupier, inscriptions dorées
    function feltTexture() {
      var W = 2048, Hh = 1024, cv = mkCanvas(W, Hh), c = cv.getContext('2d'), sc = W / (TABLE_R * 2), k;
      var gr = c.createRadialGradient(W / 2, Hh * 0.45, 60, W / 2, Hh * 0.45, W * 0.6); gr.addColorStop(0, '#12814a'); gr.addColorStop(1, '#09432a'); c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      for (k = 0; k < 14000; k++) { c.fillStyle = 'rgba(' + (k % 2 ? '255,255,255' : '0,0,0') + ',' + (Math.random() * 0.04) + ')'; c.fillRect(Math.random() * W, Math.random() * Hh, 2, 2); }
      c.strokeStyle = 'rgba(232,196,96,0.85)'; c.lineWidth = 7; c.beginPath(); c.arc(W / 2, 0, (TABLE_R - 0.13) * sc, 0, Math.PI); c.stroke();
      c.lineWidth = 3; c.beginPath(); c.arc(W / 2, 0, (TABLE_R - 0.2) * sc, 0, Math.PI); c.stroke();
      PHI.forEach(function (ph) {
        var px = W / 2 + Math.sin(ph) * 1.1 * sc, py = Math.cos(ph) * 1.1 * sc;
        c.lineWidth = 5; c.beginPath(); c.arc(px, py, 0.24 * sc, 0, TAU); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(px, py, 0.29 * sc, 0, TAU); c.stroke();
      });
      c.lineWidth = 4; roundRect(c, W / 2 - 0.85 * sc, 0.24 * sc, 1.7 * sc, 0.52 * sc, 28); c.stroke();
      c.fillStyle = 'rgba(232,196,96,0.9)'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 56px ' + SERIF; if ('letterSpacing' in c) c.letterSpacing = '6px'; c.fillText('BLACKJACK PAIE 3 POUR 2', W / 2, 1.4 * sc, 1.9 * sc);
      c.font = '700 38px ' + SERIF; c.fillText('ASSURANCE 2 POUR 1', W / 2, 1.58 * sc, 1.4 * sc);
      c.font = '700 34px ' + SERIF; c.fillStyle = 'rgba(232,196,96,0.65)'; c.fillText('CROUPIER', W / 2, 0.16 * sc, 1.0 * sc);
      c.font = '900 120px ' + SERIF; c.fillStyle = 'rgba(232,196,96,0.18)'; c.fillText('♠', W / 2, 0.98 * sc);
      var t = new THREE.CanvasTexture(cv); t.flipY = false; t.anisotropy = 16; t.repeat.set(1 / (TABLE_R * 2), 1 / TABLE_R); t.offset.set(0.5, 0); return t;
    }
    var feltTop = new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    // fauteuil capitonné : pied doré, assise de velours, dossier enveloppant (le dos est derrière, à -z ; le fauteuil regarde vers +z)
    function makeChair(parent, x, z, ry, seatY, tall) {
      var q = new THREE.Group(); q.position.set(x, 0, z); q.rotation.y = ry; parent.add(q);
      cyl(q, 0.27, 0.3, 0.035, gold, 0, 0.0175, 0, 24); cyl(q, 0.045, 0.06, seatY - 0.12, gold, 0, (seatY - 0.12) / 2 + 0.035, 0, 12);
      cyl(q, 0.25, 0.25, 0.11, velvetM, 0, seatY, 0, 28);
      var bh = tall ? 0.78 : 0.52, by = seatY + 0.06 + bh / 2;
      var back = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, bh, 28, 1, true, Math.PI - 1.15, 2.3), velvetM); back.position.set(0, by, 0); q.add(back);
      var back2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, bh + 0.04, 28, 1, true, Math.PI - 1.17, 2.34), velvetD); back2.position.set(0, by, 0); q.add(back2);
      [-1, 1].forEach(function (sd) { cyl(q, 0.016, 0.016, bh + 0.06, gold, sd * Math.sin(1.15) * 0.3, by, Math.cos(Math.PI - 1.15) * 0.3, 8); });
      var top = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.014, 8, 28, 2.3), gold); top.rotation.x = Math.PI / 2; top.rotation.z = -Math.PI / 2 - 1.15; top.position.y = by + bh / 2 + 0.02; q.add(top);
      return q;
    }
    function later(sec, fn) { timers.push({ t: sec, fn: fn }); }
    // personnage : le vrai personnage animé s'il est actif, sinon le personnage en boîtes (persona3d.js désactive F.createPlayer)
    var dressGeo = null;
    function dressCroupier(p, female) {
      var gp = p.group, torso = gp.children[1];
      if (!dressGeo) dressGeo = {
        vest: new THREE.CylinderGeometry(0.208, 0.178, 0.5, 14, 1, true, 0.5, TAU - 1.0),
        bow: new THREE.ConeGeometry(0.035, 0.07, 4), knot: new THREE.SphereGeometry(0.018, 8, 6),
        cap: new THREE.SphereGeometry(0.155, 16, 10, 0, TAU, 0, Math.PI * 0.58), long: new THREE.BoxGeometry(0.27, 0.38, 0.07)
      };
      if (torso && torso.material && torso.material.color) torso.material.color.set(0xf4f1ea);   // chemise blanche (manches comprises)
      var vest = new THREE.Mesh(dressGeo.vest, new THREE.MeshLambertMaterial({ color: 0x15151a, side: THREE.DoubleSide })); vest.position.set(0, 1.3, 0); gp.add(vest);
      [-1, 1].forEach(function (sd) { var b = new THREE.Mesh(dressGeo.bow, lam(0x9a1022)); b.rotation.z = sd * Math.PI / 2; b.position.set(sd * 0.035, 1.53, 0.19); gp.add(b); });
      var kn = new THREE.Mesh(dressGeo.knot, lam(0x9a1022)); kn.position.set(0, 1.53, 0.195); gp.add(kn);
      if (female) {
        var hm = lam(0x3b2314);
        var cap = new THREE.Mesh(dressGeo.cap, hm); cap.position.set(0, 1.76, -0.005); gp.add(cap);
        var lg = new THREE.Mesh(dressGeo.long, hm); lg.position.set(0, 1.6, -0.1); gp.add(lg);
      }
    }
    function makeNpc(name, look, croupier) {
      var role = croupier ? ['', look.charAt(0) === 'f' ? 'Croupière' : 'Croupier', ''] : undefined;   // affiché en doré sous le prénom
      if (F.createPlayer) return F.createPlayer(name, '', look, role);
      if (!F.createPerson) return null;
      var p = F.createPerson(name, '', look, role);
      if (croupier) dressCroupier(p, look.charAt(0) === 'f');
      return p;
    }
    TABLES.forEach(function (td, ti) {
      var grp = new THREE.Group(); grp.position.set(td.x, 0, td.z); g.add(grp);
      // plateau en « D » : une seule pièce épaisse (feutre dessus, bois sur la tranche) et un rail rembourré qui suit exactement son contour
      var dS = new THREE.Shape(); dS.moveTo(-TABLE_R, 0); dS.lineTo(TABLE_R, 0); dS.absarc(0, 0, TABLE_R, 0, Math.PI, false);
      var top = new THREE.Mesh(new THREE.ExtrudeGeometry(dS, { depth: 0.14, bevelEnabled: false, curveSegments: 48 }), [feltTop, woodD]); top.rotation.x = Math.PI / 2; top.position.y = TOP_Y; grp.add(top);
      var outline = [], u;
      for (u = 0; u < 64; u++) { var ang = u / 64 * Math.PI; outline.push(new THREE.Vector3(Math.cos(ang) * TABLE_R, 0, Math.sin(ang) * TABLE_R)); }
      for (u = 0; u <= 16; u++) outline.push(new THREE.Vector3(TABLE_R - u / 16 * TABLE_R * 2, 0, 0));
      var railPath = new THREE.CatmullRomCurve3(outline.map(function (v) { return v.clone().setY(TOP_Y + 0.01); }), true, 'centripetal');
      var rail = new THREE.Mesh(new THREE.TubeGeometry(railPath, 240, 0.085, 12, true), leatherM); grp.add(rail);
      var inlayPath = new THREE.CatmullRomCurve3(outline.map(function (v) { return v.clone().setY(TOP_Y + 0.098); }), true, 'centripetal');
      var inlay = new THREE.Mesh(new THREE.TubeGeometry(inlayPath, 240, 0.012, 6, true), gold); grp.add(inlay);
      var trimPath = new THREE.CatmullRomCurve3(outline.map(function (v) { return v.clone().setY(TOP_Y - 0.1); }), true, 'centripetal');
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(trimPath, 240, 0.014, 6, true), gold));      // filet doré au bas de la tranche
      var rug = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, 0.35); grp.add(rug);   // filet doré posé sur le dessus du rail
      var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, TOP_Y - 0.1, 16), woodM); ped.position.set(0, (TOP_Y - 0.1) / 2, 0.45); grp.add(ped);
      cyl(grp, 0.62, 0.66, 0.05, gold, 0, 0.025, 0.45, 32); cyl(grp, 0.5, 0.58, 0.07, woodM, 0, 0.085, 0.45, 32); cyl(grp, 0.34, 0.34, 0.03, gold, 0, TOP_Y - 0.12, 0.45, 24);
      // lampe suspendue
      var lamp = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide })); lamp.position.set(0, H - 1.4, 0.9); grp.add(lamp);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), bas(0xffe9b0)); bulb.position.set(0, H - 1.5, 0.9); grp.add(bulb);
      var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6), bas(0x222222)); cord.position.set(0, H - 0.65, 0.9); grp.add(cord);
      if (!low) { var pl = new THREE.PointLight(0xffe0b0, 0.8, 9); pl.position.set(td.x, H - 1.6, td.z + 0.9); g.add(pl); }
      room.colliders.push({ x: td.x, z: td.z + 0.2, r: 0.95 }, { x: td.x - 1.3, z: td.z + 0.6, r: 0.6 }, { x: td.x + 1.3, z: td.z + 0.6, r: 0.6 }, { x: td.x, z: td.z + 1.35, r: 0.7 }, { x: td.x, z: td.z - 0.55, r: 0.5 });
      // mur invisible tout le long du plateau en D (arrondi et bord droit) : impossible de se glisser sur les côtés de la table
      for (var ck = 0; ck <= 12; ck++) { var ca = ck / 12 * Math.PI; room.colliders.push({ x: td.x + Math.cos(ca) * (TABLE_R + 0.15), z: td.z + Math.sin(ca) * (TABLE_R + 0.15), r: 0.38 }); }
      for (var ce = -3; ce <= 3; ce++) room.colliders.push({ x: td.x + ce * 0.55, z: td.z - 0.2, r: 0.38 });

      var T = { i: ti, x: td.x, z: td.z, group: grp, hands: {}, dealerCards: [], spots: [] };
      tables.push(T);
      // croupier
      var dl = makeNpc(DEALER_NAMES[ti], ti % 2 ? 'h1010' : 'f1230', true);
      if (dl) {
        dl.group.position.set(td.x, 0, td.z - 0.75); dl.group.rotation.y = 0; dl.tag.scale.multiplyScalar(1.1); dl.setSeated(true, { y: 0.0, z: 0.28 }); g.add(dl.group); T.dealerO = { p: dl, kind: 'dealer', t: T, awake: 0, settled: false }; people.push(T.dealerO); T.dealer = dl;
        // la chaise du croupier : assise capitonnée et dossier, derrière la table
        makeChair(grp, 0, -0.75, 0, 0.5, true);
        room.colliders.push({ x: td.x, z: td.z - 0.8, r: 0.5 });
      }
      // places
      PHI.forEach(function (phi, k) {
        var sx0 = td.x + Math.sin(phi) * SEAT_R, sz0 = td.z + Math.cos(phi) * SEAT_R, dx = td.x - sx0, dz = td.z + 0.25 - sz0;
        var s = { n: ti * 2 + k, x: sx0, z: sz0, yaw: Math.atan2(dx, -dz), tx: td.x, tz: td.z, table: T, i: k, phi: phi, bot: td.bots.indexOf(k) >= 0, sx: td.x + Math.sin(phi) * (SEAT_R + 0.9), sz: td.z + Math.cos(phi) * (SEAT_R + 0.9) };
        seats.push(s); T.spots.push(s);
        // tabouret
        makeChair(grp, sx0 - td.x, sz0 - td.z, Math.atan2(dx, dz), 0.6, false);
        room.colliders.push({ x: sx0, z: sz0, r: 0.3 });
        if (s.bot) {
          var nm = BOT_NAMES[(ti * 3 + k * 5 + 1) % BOT_NAMES.length], bp = makeNpc(nm, F.persona ? F.persona.lookCode(F.persona.lookFromName(nm)) : '', false);
          if (bp) { bp.group.position.set(sx0, 0, sz0); bp.group.rotation.y = Math.atan2(dx, dz); bp.setSeated(true, { y: 0.12, z: 0.28 }); g.add(bp.group); people.push({ p: bp, kind: 'bot', s: s }); s.bp = bp; s.name = nm; }
        } else {
          var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sx0, 0.7, sz0); g.add(hit);
          room.interactables.push({ hit: hit, x: sx0, z: sz0, radius: 1.5, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🪑 S\'asseoir — Table ' + (ti + 1); }, use: function (w) { sit(w, s); } });
        }
      });
    });
    function cyl(p, rt, rb, h, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), m); o.position.set(x, y, z); p.add(o); return o; }

    /* --- la manche (affichage + serveur) --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, bet = 100, view3 = false, meRig = null;
    // manche partagée : l'état vient du serveur (api/blackjack.js, une table par 'bj_pub_N'), identique pour les 2 joueurs assis à la table
    var TBL = null, tblOff = 0, polling = false, pollT = 0, busy = false;
    var autoRebet = null;   // { amount, deadline } : remise automatiquement la même mise après une manche, comme avant (plus besoin de recliquer à chaque fois)
    var AUTO_REBET_MS = 8000;
    function tableIdOf(T) { return 'bj_pub_' + (T.i + 1); }
    function otherSeat(T) { return T.spots[0] === seat ? T.spots[1] : T.spots[0]; }
    function bjNow() { return Date.now() + tblOff; }
    function seatTaken(s) {
      var now = performance.now();
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; });
    }
    function spotPos(T, s, ci, n) {      // carte n°ci du joueur assis à la place s
      var ph = s.phi, bx = T.x + Math.sin(ph) * 1.1, bz = T.z + Math.cos(ph) * 1.1, tx0 = Math.cos(ph), tz0 = -Math.sin(ph);
      var off = (ci - (n - 1) / 2) * 0.2;
      return { x: bx + tx0 * off, z: bz + tz0 * off, y: TOP_Y + 0.012 + ci * 0.004, ry: ph + 0.03 * ((ci % 2) ? 1 : -1) };   // le haut de la carte regarde vers le centre de la table
    }
    function dealerPos(T, ci, n) { return { x: T.x + (ci - (n - 1) / 2) * 0.34, z: T.z + 0.5, y: TOP_Y + 0.012 + ci * 0.004, ry: 0 }; }
    // taille des cartes : plus grandes en vue 3e personne (la caméra est plus loin et plus haute)
    function cardScale(owner) { return owner === 'd' ? 1.0 : 0.62; }
    function placeCard(owner, key, T, card, pos, sec) {
      var m = makeCard(card); m.userData.own = owner; m.scale.setScalar(cardScale(owner)); m.position.set(T.x + 0.55, TOP_Y + 0.45, T.z - 0.1); m.rotation.y = pos.ry; g.add(m);
      T.cards = T.cards || []; T.cards.push(m);
      anims.push({ m: m, t: 0, dur: 0.38, from: m.position.clone(), to: new THREE.Vector3(pos.x, pos.y, pos.z), delay: sec || 0 });
      return m;
    }
    function clearCards(T) {
      (T.cards || []).forEach(function (m) { g.remove(m); m.material.dispose(); }); T.cards = []; T.dealerMeshes = []; T.handMeshes = {};
      (T.labels || []).forEach(function (l) { if (l.parent) l.parent.remove(l); if (l.material.map) l.material.map.dispose(); l.material.dispose(); }); T.labels = [];
      Object.keys(T.scoreLabels || {}).forEach(function (k) { var o = T.scoreLabels[k]; g.remove(o.sp); o.sp.material.map.dispose(); o.sp.material.dispose(); }); T.scoreLabels = {};
      anims = anims.filter(function (a) { return a.m.parent; });
    }
    function label(T, x, z, text, col) {
      var cv = mkCanvas(256, 80), c = cv.getContext('2d'); roundRect(c, 4, 4, 248, 72, 24); c.fillStyle = 'rgba(8,5,12,0.85)'; c.fill(); c.strokeStyle = col; c.lineWidth = 5; c.stroke();
      c.fillStyle = col; c.font = '900 38px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 42, 230);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(cv), transparent: true, depthWrite: false })); sp.scale.set(0.46, 0.15, 1); sp.position.set(x, TOP_Y + 0.32, z); g.add(sp); T.labels = T.labels || []; T.labels.push(sp);
    }
    // pastille du total, posée juste devant la main (sous les cartes, côté joueur) ; se redessine seulement si le total ou la couleur change
    function scoreLabel(T, key, x, z, n, sc) {
      T.scoreLabels = T.scoreLabels || {};
      var cur = T.scoreLabels[key];
      if (!n) { if (cur) { g.remove(cur.sp); cur.sp.material.map.dispose(); cur.sp.material.dispose(); delete T.scoreLabels[key]; } return; }
      var col = sc > 21 ? '#ff8a80' : sc === 21 ? '#f3cf62' : '#f4e3b0';
      if (cur) { cur.sp.position.set(x, TOP_Y + 0.16, z); if (cur.sc === sc) return; g.remove(cur.sp); cur.sp.material.map.dispose(); cur.sp.material.dispose(); }
      var cv = mkCanvas(112, 72), c = cv.getContext('2d'); roundRect(c, 3, 3, 106, 66, 16); c.fillStyle = 'rgba(8,5,12,0.88)'; c.fill(); c.strokeStyle = col; c.lineWidth = 4; c.stroke();
      c.fillStyle = col; c.font = '900 40px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(sc), 56, 38);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(cv), transparent: true, depthWrite: false })); sp.scale.set(0.2, 0.13, 1); sp.position.set(x, TOP_Y + 0.16, z); g.add(sp);
      T.scoreLabels[key] = { sp: sp, sc: sc };
    }
    function wake(T, tx, tz) { if (T && T.dealerO) { T.dealerO.awake = 1.1; T.dealerO.aimX = (tx === undefined ? T.x : tx) - T.x; T.dealerO.aimZ = (tz === undefined ? T.z + 0.7 : tz) - T.z; } }
    // le croupier de la table annonce « Lancez vos paris ! » (bulle + son) dès que la table se remplit
    function dealerSay(T, text) {
      if (T.dealer && T.dealer.say) T.dealer.say(text);
      if (F.audio && F.audio.playFile) F.audio.playFile('assets/sons/lancez-vos-paris.mp3', 1.4);
    }
    function tableHasPlayer(T) { return T.spots.some(function (s) { return !s.bot && (s === seat || seatTaken(s)); }); }
    function showHand(T, s, cards, keep) {
      wake(T, s.x, s.z);
      T.handMeshes = T.handMeshes || {};
      var have = (T.handMeshes[s.n] = T.handMeshes[s.n] || []);
      for (var k = have.length; k < cards.length; k++) have.push(placeCard('p', s.n, T, cards[k], spotPos(T, s, k, cards.length), 0));
      // recentre les cartes déjà posées
      have.forEach(function (m, k2) { var p = spotPos(T, s, k2, cards.length); var a = anims.filter(function (x) { return x.m === m; })[0]; if (a) a.to.set(p.x, p.y, p.z); else { m.position.set(p.x, p.y, p.z); } });
      // le total, juste devant la main : un peu plus loin du centre que les cartes, côté joueur
      var ph = s.phi, lx = T.x + Math.sin(ph) * 1.42, lz = T.z + Math.cos(ph) * 1.42;
      scoreLabel(T, 's' + s.n, lx, lz, cards.length, score(cards));
    }
    function showDealer(T, cards) {
      wake(T);
      T.dealerMeshes = T.dealerMeshes || [];
      for (var k = T.dealerMeshes.length; k < cards.length; k++) T.dealerMeshes.push(placeCard('d', 0, T, cards[k], dealerPos(T, k, cards.length), 0));
      T.dealerMeshes.forEach(function (m, k2) { var p = dealerPos(T, k2, cards.length); var a = anims.filter(function (x) { return x.m === m; })[0]; if (a) a.to.set(p.x, p.y, p.z); else m.position.set(p.x, p.y, p.z); });
      // la pastille montre toujours le total connu (la carte cachée du croupier compte pour 0 dans score(), elle n'est jamais incluse)
      var c0 = dealerPos(T, (cards.length - 1) / 2, cards.length);
      scoreLabel(T, 'd', c0.x, c0.z + 0.42, cards.length, score(cards));
    }
    function reveal(T, cards) {
      T.dealerMeshes = T.dealerMeshes || [];
      cards.forEach(function (c, k) { if (T.dealerMeshes[k]) { T.dealerMeshes[k].material.map = cardTex(c); T.dealerMeshes[k].material.needsUpdate = true; } });
      showDealer(T, cards);
    }
    // ping temps réel : « quelqu'un vient de jouer à cette salle », pour sonder tout de suite plutôt que d'attendre le prochain tour (poll de secours)
    room.onRtMsg = function (ev, m) { if (ev === 'bj' && seat && m && m.k !== F.me()) pollT = 999; };
    function bjNudge() { if (world.rt && world.rt.ready) { try { world.rt.send('bj', { k: F.me() }); } catch (e) { /* ok */ } } }

    function setMsg(t, col) { if (ui) { var m = ui.el.querySelector('.bj-msg'); m.textContent = t || ''; m.style.color = col || ''; } }
    var SUIT_CLASS = { '♥': 'fl-suit-h', '♦': 'fl-suit-d', '♣': 'fl-suit-c', '♠': 'fl-suit-s' };
    // une petite pastille par carte : rang + logo du symbole (au lieu du caractère ♥♦♣♠ brut, qui rend mal selon la police)
    function handHtml(cards) { return cards.map(function (c) { var red = c.s === '♥' || c.s === '♦'; return c.r === '?' ? '<span class="pip n">🂠</span>' : '<span class="pip ' + (red ? 'r' : 'n') + '">' + c.r + '<i class="fl-suit ' + SUIT_CLASS[c.s] + '"></i></span>'; }).join(''); }
    function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
    function setHtml(el, h) { if (el && el.__h !== h) { el.__h = h; el.innerHTML = h; } }
    var cardImgCache = {}, cardsEl = null;
    function cardImg(c) {      // vignette nette d'une carte (copie réduite de la texture 3D)
      var key = c.r === '?' ? 'back' : c.r + c.s;
      if (cardImgCache[key]) return cardImgCache[key];
      var cv = mkCanvas(256, 358), x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cardTex(c).image, 0, 0, 256, 358);
      return (cardImgCache[key] = cv.toDataURL());
    }
    // 3e personne : mes cartes en bas à gauche, celles du croupier juste au-dessus, en grand et bien lisibles
    function refreshCards() {
      if (!ui) return;
      var mineP = TBL && TBL.players && TBL.players[F.me()];
      var show = view3 && mineP && mineP.cards && mineP.cards.length;
      if (!cardsEl) { cardsEl = document.createElement('div'); cardsEl.className = 'bj3d-cards'; ui.el.parentNode.appendChild(cardsEl); }
      cardsEl.style.display = show ? 'flex' : 'none';
      if (!show) return;
      var dCards = (TBL.dealer && TBL.dealer.cards) || [], dHidden = !!(TBL.dealer && TBL.dealer.hidden);
      function row(cards) { return '<div class="bj-cr">' + cards.map(function (c) { return '<img src="' + cardImg(c) + '" alt="">'; }).join('') + '</div>'; }
      setHtml(cardsEl, '<div class="bj-cl">Croupier' + (dHidden ? '' : ' · ' + score(dCards)) + '</div>' + row(dCards) + '<div class="bj-cl">Toi · ' + mineP.score + '</div>' + row(mineP.cards));
    }
    function refreshUi() {
      if (!ui) return;
      var me = F.me(), hd = ui.el.querySelector('.bj-hands'), mineP = TBL && TBL.players && TBL.players[me];
      if (mineP) {
        var dCards = (TBL.dealer && TBL.dealer.cards) || [], dHidden = !!(TBL.dealer && TBL.dealer.hidden);
        var html = '<div>Croupier : ' + handHtml(dCards) + (dHidden ? '' : '<span class="tot">' + score(dCards) + '</span>') + '</div><div>Toi : ' + handHtml(mineP.cards) + '<span class="tot">' + mineP.score + '</span></div>';
        var otherKey = Object.keys(TBL.players).filter(function (k) { return k !== me; })[0];
        if (otherKey) {
          var oP = TBL.players[otherKey], oName = (TBL.knownPlayers && TBL.knownPlayers[otherKey] && TBL.knownPlayers[otherKey].username) || otherKey;
          html += '<div>' + esc(oName) + ' : ' + handHtml(oP.cards) + '<span class="tot">' + oP.score + '</span></div>';
        }
        setHtml(hd, html);
      } else setHtml(hd, '');
      refreshCards();
      var q = function (s) { return ui.el.querySelector(s); };
      setText(q('.bj-bal b'), fmtN(balance()) + ' 🪙'); setText(q('.bj-bet b'), fmtN(bet) + ' 🪙');   // on ne réécrit le texte que s'il change : sinon l'émoji clignote
      var waiting = !TBL || TBL.status === 'waiting';
      q('.bj-chips').style.display = waiting ? '' : 'none';
      if (!waiting) { var cb = q('.bj-custom-bet'); if (cb) cb.hidden = true; }   // la manche a démarré : plus question de changer sa mise
      var rdy = q('[data-a=ready]'); if (rdy) rdy.style.display = waiting && TBL && TBL.readyBets && TBL.readyBets[me] ? '' : 'none';
      var mine = !busy && TBL && TBL.status === 'playing' && TBL.turn === me && mineP && mineP.status === 'playing';
      ui.el.querySelectorAll('[data-a=hit],[data-a=stand],[data-a=double]').forEach(function (b) { b.style.display = (TBL && TBL.status === 'playing') ? '' : 'none'; b.disabled = !mine; });
      var dbl = q('[data-a=double]'); if (dbl) dbl.disabled = !mine || !mineP || mineP.cards.length !== 2;
      var cnt = q('.bj-count');
      if (cnt) {
        if (waiting && TBL && TBL.bettingStartTime) setText(cnt, 'Manche dans ' + Math.max(0, Math.ceil((TBL.bettingStartTime + (TBL.bettingDuration || 10000) - bjNow()) / 1000)) + ' s');
        else if (waiting && autoRebet) setText(cnt, 'Prochaine manche dans ' + Math.max(0, Math.ceil((autoRebet.deadline - Date.now()) / 1000)) + ' s');
        else setText(cnt, '');
      }
    }

    // nouvel état de la table (reçu d'un POST ou d'un sondage) : place les cartes, affiche le résultat, met à jour les boutons
    function applyTable(t) {
      if (!t) return;
      tblOff = (typeof t.serverNow === 'number' ? t.serverNow : Date.now()) - Date.now();
      TBL = t;
      if (!seat) { refreshUi(); return; }
      var T = seat.table, me = F.me();
      if (t.roundId && t.roundId !== T._roundId) { T._roundId = t.roundId; clearCards(T); T._dealerHidden = true; T._resultShown = -1; wake(T); }
      // mes cartes, et celles de l'autre joueur assis à cette table (2 places : l'autre place = pas la mienne)
      Object.keys(t.players || {}).forEach(function (pKey) {
        var p = t.players[pKey]; if (!p || !Array.isArray(p.cards) || !p.cards.length) return;
        var s = pKey === me ? seat : otherSeat(T);
        if (s) showHand(T, s, p.cards);
      });
      // le croupier : cartes masquées pendant qu'on joue, révélées (et complétées) d'un coup à la fin du tour
      var dc = (t.dealer && t.dealer.cards) || [];
      if (dc.length) {
        if (!t.dealer.hidden && T._dealerHidden !== false) reveal(T, dc); else showDealer(T, dc);
        T._dealerHidden = !!t.dealer.hidden;
      }
      // bannières de résultat (une seule fois par manche)
      if (t.status === 'finished' && T._resultShown !== t.roundId) {
        T._resultShown = t.roundId;
        Object.keys(t.players || {}).forEach(function (pKey) {
          var p = t.players[pKey], s = pKey === me ? seat : otherSeat(T); if (!s || !p || !p.result) return;
          var txt = (p.result === 'win' || p.result === 'forfeit_win') ? 'GAGNÉ' : p.result === 'push' ? 'ÉGALITÉ' : p.status === 'busted' ? 'SAUTÉ' : 'PERDU';
          var col = txt === 'GAGNÉ' ? '#7ee0a0' : txt === 'ÉGALITÉ' ? '#f3cf62' : '#ff8a80';
          var pp = spotPos(T, s, (p.cards.length - 1) / 2, p.cards.length);
          label(T, pp.x, pp.z, txt, col);
        });
        var mine = t.players[me];
        if (mine) {
          if (mine.result === 'forfeit_win') setMsg('🏆 L\'autre joueur est parti : tu gagnes la cagnotte, +' + fmtN(mine.payout) + ' 🪙', '#7ee0a0');
          else if (mine.result === 'win') setMsg('🏆 Gagné ! ' + mine.score + ' contre ' + (t.dealer ? t.dealer.score : 0) + ' : +' + fmtN(mine.payout) + ' 🪙', '#7ee0a0');
          else if (mine.result === 'push') setMsg('🤝 Égalité : mise remboursée.', '#f3cf62');
          else if (mine.status === 'busted') setMsg('💥 Tu as dépassé 21.', '#ff8a80');
          else setMsg('Perdu : ' + mine.score + ' contre ' + (t.dealer ? t.dealer.score : 0) + '.', '#ff8a80');
          autoRebet = { amount: mine.bet, deadline: Date.now() + AUTO_REBET_MS };   // la manche suivante reprend la même mise, toute seule
        }
      } else if (t.status === 'waiting') {
        if (!(t.readyBets && Object.keys(t.readyBets).length)) setMsg(loggedIn() ? 'Place ta mise : la manche démarre toute seule.' : 'Connecte-toi pour jouer.', '');
        else if (t.readyBets[me]) setMsg('Mise prise en compte : la manche démarre toute seule.', '');
        else setMsg('Un autre joueur mise : rejoins avant la fin du compte à rebours !', '#f3cf62');
      } else if (t.status === 'playing') {
        autoRebet = null;   // la manche a démarré (par mon auto-remise ou celle de l'autre joueur) : plus rien à armer
        var mineP = t.players && t.players[me];
        if (t.turn === me) setMsg('À toi de jouer : ' + (mineP ? mineP.score : '') + '.', '');
        else if (mineP && mineP.status !== 'playing') setMsg('Tu as ' + mineP.score + '. En attente…', '');
        else setMsg('Distribution…', '');
      } else if (t.status === 'dealer_turn') {
        setMsg('Le croupier joue…', '');
      }
      refreshUi();
    }

    function bjPost(action, extra) {
      if (!seat) return Promise.resolve(null);
      var body = { action: action, tableId: tableIdOf(seat.table) };
      if (extra) for (var k in extra) body[k] = extra[k];
      return world.post('/api/blackjack', body).then(function (r) {
        if (!r) { setMsg('Connecte-toi pour jouer.', '#ff8a80'); refreshUi(); return null; }
        if (r.table) applyTable(r.table);
        if (r.ok === false) { setMsg(r.error || 'Action impossible.', '#ff8a80'); refreshUi(); } else bjNudge();
        return r;
      });
    }
    function pollNow() {
      if (polling || !seat) return;
      polling = true;
      fetch('/api/blackjack?table=' + encodeURIComponent(tableIdOf(seat.table)), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (t) { polling = false; if (seat) applyTable(t); })
        .catch(function () { polling = false; });
    }
    // mise : chaque clic envoie tout de suite la nouvelle mise au serveur (les autres la voient monter en direct)
    function setBet(v) {
      bet = Math.max(MIN_BET, Math.min(Math.floor(v), Math.max(MIN_BET, Math.floor(balance()))));
      refreshUi();
      bjPost('set_bet', { bet: bet });
    }
    function clearBet() { bet = MIN_BET; refreshUi(); bjPost('unset_bet', {}); }
    function readyNow() {
      if (!TBL || TBL.status !== 'waiting' || !(TBL.readyBets && TBL.readyBets[F.me()])) return;
      bjPost('set_ready', { ready: true });
    }
    function act(action) {
      if (busy || !TBL || TBL.status !== 'playing' || TBL.turn !== F.me()) return;
      var mine = TBL.players && TBL.players[F.me()]; if (!mine || mine.status !== 'playing') return;
      busy = true; refreshUi();
      bjPost(action, {}).then(function () { busy = false; refreshUi(); });
    }

    /* --- s'asseoir / se lever --- */
    function injectCss() {
      if (document.getElementById('bj3d-css')) return;
      var s = document.createElement('style'); s.id = 'bj3d-css';
      s.textContent = '.bj3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(560px,92%);background:rgba(8,5,12,.9);border:1px solid rgba(201,162,39,.6);border-radius:16px;padding:12px 14px;color:#f4e3b0;pointer-events:auto;display:flex;flex-direction:column;gap:8px;font-family:inherit;z-index:5}' +
        '.bj3d .bj-hands{display:flex;justify-content:space-around;gap:10px;font-weight:800;font-size:15px;flex-wrap:wrap;align-items:center}' +
        '.bj3d .bj-hands .pip{display:inline-flex;align-items:center;gap:3px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:7px;padding:2px 7px 2px 8px;margin:0 2px;font-size:14px}' +
        '.bj3d .bj-hands .pip.r{color:#ff7a86}.bj3d .bj-hands .pip.n{color:#fff}.bj3d .bj-hands .pip .fl-suit{width:.78em;height:.78em;vertical-align:-.08em}' +
        '.bj3d .bj-hands .tot{color:#f3cf62;font-weight:900;margin-left:4px}' +
        '.bj3d .bj-top{display:flex;justify-content:space-between;font-weight:800;font-size:13px}.bj3d .bj-msg{min-height:20px;text-align:center;font-weight:800;font-size:15px}' +
        '.bj3d .bj-chips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.bj3d .bj-chip{padding:6px 10px;border-radius:999px;border:2px solid #f3cf62;background:#241218;color:#f3cf62;font-weight:900;font-size:13px;cursor:pointer}' +
        '.bj3d .bj-chip.minus{border-color:#ff8a80;color:#ff8a80}.bj3d .bj-chip.custom{border-color:#9aa5c9;color:#c7cdea}.bj3d .bj-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
        '.bj3d .bj-custom-bet{display:flex;gap:6px;justify-content:center}.bj3d .bj-custom-bet input{width:140px;background:#1a1208;border:2px solid #f3cf62;border-radius:999px;padding:6px 12px;color:#f4e3b0;font-weight:800;font-family:inherit;text-align:center}' +
        '.bj3d .bj-custom-bet input:focus{outline:none}.bj3d .bj-custom-bet button{padding:6px 14px;border-radius:999px;border:0;background:#f3cf62;color:#1a1208;font-weight:900;cursor:pointer}' +
        '.bj3d button.bj-b{padding:10px 18px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00)}.bj3d button.bj-b:disabled{opacity:.4;cursor:not-allowed}' +
        '.bj3d button.bj-b.alt{background:#2a3b57;color:#e8f0ff}.bj3d button.bj-b.red{background:#8a1f2b;color:#ffe9ea}' +
        '.bj3d-cards{position:absolute;left:14px;bottom:182px;z-index:5;pointer-events:none;display:none;flex-direction:column;gap:5px;padding:8px 10px;border-radius:12px;background:rgba(8,5,12,.8);border:1px solid rgba(201,162,39,.5);color:#f4e3b0;font-weight:800;font-size:12px}.bj3d-cards .bj-cr{display:flex;gap:5px}.bj3d-cards img{width:68px;height:auto;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.55)}' +
        '.bj3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.bj3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(201,162,39,.6);background:rgba(8,5,12,.85);color:#f4e3b0;font-weight:800;cursor:pointer}';
      s.textContent += '@media (max-height:520px){.bj3d{bottom:62px;width:min(560px,64%);padding:5px 8px;gap:3px}.bj3d .bj-msg,.bj3d .bj-hands{font-size:12px;min-height:14px}.bj3d .bj-top{font-size:11px}.bj3d .bj-chip{padding:3px 8px;font-size:11px}.bj3d button.bj-b{padding:6px 12px;font-size:12px}.bj3d-stand{bottom:auto;top:64px;display:flex;flex-direction:column;gap:4px}.bj3d-stand button{padding:5px 9px;font-size:12px}.bj3d-cards{display:none!important}}';
      document.head.appendChild(s);
    }
    function buildUi(w) {
      injectCss();
      var el = document.createElement('div'); el.className = 'bj3d';
      el.innerHTML = '<div class="bj-top"><span class="bj-bal">Solde : <b></b></span><span class="bj-count" style="color:#f3cf62"></span><span class="bj-bet">Mise : <b></b></span></div><div class="bj-hands"></div><div class="bj-msg"></div>' +
        '<div class="bj-chips">' + CHIPS.map(function (c) { return '<button class="bj-chip" data-c="' + c + '">+' + fmtN(c) + '</button>'; }).join('') + '<button class="bj-chip minus" data-c="-1">Effacer</button><button class="bj-chip" data-c="max">Tout</button><button class="bj-chip custom" data-c="custom">✏️ Perso</button></div>' +
        '<div class="bj-custom-bet" hidden><input type="number" min="10" step="10" placeholder="Montant…"><button data-c="custom-ok">✓ Valider</button></div>' +
        '<div class="bj-row"><button class="bj-b" data-a="hit">Tirer</button><button class="bj-b alt" data-a="stand">Rester</button><button class="bj-b red" data-a="double">Doubler</button><button class="bj-b" data-a="ready">✅ Prêt</button></div>';
      w.container.appendChild(el);
      var customRow = el.querySelector('.bj-custom-bet'), customInput = customRow.querySelector('input');
      function toggleCustomBet(open) {
        customRow.hidden = !open;
        if (open) { customInput.value = bet; customInput.focus(); customInput.select(); }
      }
      function applyCustomBet() {
        var v = Math.floor(parseFloat(customInput.value));
        toggleCustomBet(false);
        if (isFinite(v) && v > 0) setBet(v);
      }
      customInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyCustomBet(); } else if (e.key === 'Escape') { e.preventDefault(); toggleCustomBet(false); } });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.c === 'custom-ok') { applyCustomBet(); return; }
        if (b.dataset.c) {
          if (!TBL || TBL.status !== 'waiting') return;
          autoRebet = null;   // on touche sa mise à la main : on n'écrase plus avec la remise automatique
          if (b.dataset.c === '-1') { toggleCustomBet(false); clearBet(); return; }
          if (b.dataset.c === 'max') { toggleCustomBet(false); setBet(Math.max(MIN_BET, Math.floor(balance()))); return; }
          if (b.dataset.c === 'custom') { toggleCustomBet(!customRow.hidden); return; }
          toggleCustomBet(false); setBet(bet + parseInt(b.dataset.c, 10)); return;
        }
        var a = b.dataset.a;
        if (a === 'ready') { readyNow(); return; }
        if (a === 'hit' || a === 'stand' || a === 'double') act(a);
      });
      return { el: el };
    }
    var standEl = null;
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if (e.code === 'KeyV') { e.stopImmediatePropagation(); e.preventDefault(); toggleView(); }
    }
    function toggleView() {
      view3 = !view3; view.yaw = view.pitch = 0;
      if (meRig) meRig.group.visible = view3;
      refreshUi();
      if (standEl) { var b = standEl.querySelector('[data-b=cam]'); if (b) b.innerHTML = (view3 ? '👁 Vue 1re personne' : '👁 Vue 3e personne') + ' <kbd>V</kbd>'; }
    }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0; view3 = false;
      if ((F.createPlayer || F.createPerson) && !meRig) {                                   // mon personnage, montré seulement en vue 3e personne
        var nm0 = ''; try { nm0 = st().username || ''; } catch (e) { /* ok */ }
        meRig = (F.createPlayer || F.createPerson)(nm0 || 'Moi', '', F.myLookCode ? F.myLookCode() : ''); meRig.tag.visible = false; meRig.setSeated(true, { y: 0.12, z: 0.28 });
        g.add(meRig.group);
      }
      if (meRig) { meRig.group.position.set(s.x, 0, s.z); meRig.group.rotation.y = Math.atan2(s.tx - s.x, s.tz + 0.25 - s.z); meRig.group.visible = false; }
      TBL = null; busy = false; autoRebet = null;
      ui = buildUi(w);
      standEl = document.createElement('div'); standEl.className = 'bj3d-stand'; standEl.innerHTML = '<button data-b="stand">🪑 Se lever <kbd>F</kbd></button> <button data-b="cam">👁 Vue 3e personne <kbd>V</kbd></button>'; standEl.querySelector('[data-b=stand]').addEventListener('click', function () { stand(); }); standEl.querySelector('[data-b=cam]').addEventListener('click', function () { toggleView(); });
      w.container.appendChild(standEl);
      window.addEventListener('keydown', onSeatKey, true);
      setMsg(loggedIn() ? 'Connexion à la table…' : 'Connecte-toi pour jouer.', '');
      refreshUi();
      pollT = 999;   // on sonde tout de suite, sans attendre le prochain tour
    }
    function stand() {
      if (!seat) return;
      var s = seat;
      bjPost('leave', {});   // retire ma mise si je n'avais pas encore joué, ou abandonne proprement (l'autre joueur gagne la cagnotte) si la manche est en cours
      seat = null; TBL = null; busy = false; autoRebet = null;
      timers = []; anims.forEach(function (a) { a.t = a.dur; }); clearCards(s.table);
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      if (cardsEl && cardsEl.parentNode) cardsEl.parentNode.removeChild(cardsEl); cardsEl = null;
      if (meRig) meRig.group.visible = false; view3 = false;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.standKey = false;
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.12, z: 0.28 };      // tabouret à 0,62 m (persona3d.js)
    room.remotePose = function (r) { var s = seats[r.seat]; return s && !s.bot ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) {
      if (!seat || !view3) return;                                     // vue assise (1re personne) : regard fixe sur le croupier, pas de souris
      view.yaw = Math.max(-1.2, Math.min(1.2, drag.seat.yaw - dx * 0.006));
      if (drag.mouse) view.pitch = Math.max(-0.45, Math.min(0.35, drag.seat.pitch - dy * 0.004));
    };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (view3) {                                                      // 3e personne : au-dessus et derrière mon épaule, on voit toute la table
        var ox = s.x - s.tx, oz = s.z - s.tz, L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L;
        var cs = Math.cos(view.yaw * 0.8), sn = Math.sin(view.yaw * 0.8), rx = ox * cs - oz * sn, rz = ox * sn + oz * cs;
        var sx = -rz * 0.55, sz = rx * 0.55;                           // un peu de côté (par-dessus l'épaule) : ma tête ne cache plus mes cartes
        return { cx: s.x + rx * 1.2 + sx, cy: 2.5, cz: s.z + rz * 1.2 + sz, tx: s.tx + ox * 0.62, ty: 0.8, tz: s.tz + oz * 0.62, fov: 55 };
      }
      // vue assise : regard fixe sur le croupier et mes cartes, la souris ne bouge plus la caméra (seule la vue 3e personne tourne)
      // caméra plus haute et visée moins piquée vers le bas, pour garder le visage du croupier dans le cadre (pas seulement les cartes)
      var cx0 = s.tx, cz0 = s.tz + 0.25, ex = s.x + (cx0 - s.x) * 0.12, ey = 1.74, ez = s.z + (cz0 - s.z) * 0.12;
      var px = cx0 + (s.x - cx0) * 0.5, pz = cz0 + (s.z - cz0) * 0.5;
      var a = Math.atan2(px - ex, -(pz - ez)), p = Math.atan2(1.22 - ey, Math.hypot(px - ex, pz - ez));
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 64 };
    };
    room.syncHud = function () { refreshUi(); };

    /* --- porte de retour, lumières --- */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xff8a8a, target: 'hall', theme: 'exitBlackjack' });
    g.add(new THREE.AmbientLight(0xe8d8d0, 0.75));
    var key = new THREE.DirectionalLight(0xfff0e0, 0.35); key.position.set(3, 8, 5); g.add(key);

    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) {
      return w.touch ? 'Joystick : marcher · touche une place libre d\'une table pour t\'asseoir'
        : 'ZQSD / flèches : marcher · Maj : courir · avance vers un tabouret (F ou clic) pour jouer au blackjack · assis : ta mise, puis la manche démarre toute seule · Tirer, Rester, Doubler · F : se lever';
    };
    // le croupier tend le bras vers la place qui reçoit la carte (bras gauche pour les places à sa gauche, droit sinon), le glisse sur le feutre puis le ramène
    function dealGesture(o) {
      var root = o.p._rig && o.p._rig.root; if (!root) return;
      var left = o.aimX > 0, sd = left ? -1 : 1, u = Math.max(0, Math.min(1, 1 - o.awake / 1.1)), k = Math.sin(Math.PI * u), k2 = Math.sin(Math.PI * Math.min(1, u * 1.6));
      var ua = root.getObjectByName(left ? 'upperarm_l' : 'upperarm_r'), la = root.getObjectByName(left ? 'lowerarm_l' : 'lowerarm_r');
      var side = Math.max(-1, Math.min(1, Math.abs(o.aimX) / 1.6));
      if (ua) { ua.rotateZ(sd * -0.95 * k); ua.rotateY(sd * (0.25 + 0.55 * side) * k); }
      if (la) la.rotateY(sd * (0.35 + 0.7 * (1 - side)) * k2);
      var hd = root.getObjectByName('spine_03') || root.getObjectByName('spine_02');
      if (hd) hd.rotateX(0.18 * k);                                                    // il se penche légèrement vers la table
    }
    room.onLeave = function () { stand(); };
    room._wake = wake; room._tables = tables;
    room.update = function (dt) {
      clockT += dt;
      pollT += dt; if (seat && pollT > 1.1) { pollT = 0; pollNow(); }     // l'état de la table vient du serveur (api/blackjack.js) : sondé environ une fois par seconde
      // le croupier annonce la manche dès qu'un premier vrai joueur s'assoit à une table vide
      tables.forEach(function (T) {
        var occ = tableHasPlayer(T);
        if (occ && !T._hadPlayer) { T._hadPlayer = true; dealerSay(T, '🎲 Lancez vos paris !'); }
        else if (!occ) T._hadPlayer = false;
      });
      if (autoRebet && seat && TBL && TBL.status === 'waiting') {
        if (Date.now() >= autoRebet.deadline) { var amt = autoRebet.amount; autoRebet = null; setBet(amt); }
        else if (ui) { var cnt0 = ui.el.querySelector('.bj-count'); setText(cnt0, 'Prochaine manche dans ' + Math.max(0, Math.ceil((autoRebet.deadline - Date.now()) / 1000)) + ' s'); }
      }
      // animations des personnages
      people.forEach(function (o) {
        if (!o.p._rig) return;
        if (!o.settled) { o.p.stopWalk(); o.p.applyHold(0.05); o.settled = true; return; }   // une première image pour prendre la pose assise, puis plus rien
        if (o.awake > 0) { o.awake -= dt; o.p.stopWalk(); o.p.applyHold(dt); if (o.kind === 'dealer') dealGesture(o); }                  // le croupier ne bouge que pendant qu'il donne les cartes
      });
      if (meRig && meRig.group.visible) { meRig.stopWalk(); meRig.applyHold(dt); }
      // minuteries
      for (i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { if (window.console) console.warn('[blackjack3d]', e); } } }
      // cartes qui glissent jusqu'à leur place
      for (i = anims.length - 1; i >= 0; i--) {
        var a = anims[i]; if (!a.m.parent) { anims.splice(i, 1); continue; }
        if (a.delay > 0) { a.delay -= dt; continue; }
        a.t += dt; var k = Math.min(1, a.t / a.dur), e2 = k * k * (3 - 2 * k);
        a.m.position.set(a.from.x + (a.to.x - a.from.x) * e2, a.from.y + (a.to.y - a.from.y) * e2 + Math.sin(k * Math.PI) * 0.12, a.from.z + (a.to.z - a.from.z) * e2);
        if (k >= 1) { a.m.position.copy(a.to); anims.splice(i, 1); }
      }
    };
    room.dispose = function () {
      stand(); people.forEach(function (o) { o.p.dispose(); }); if (meRig) meRig.dispose();
      Object.keys(texCache).forEach(function (k) { texCache[k].dispose(); delete texCache[k]; });
    };
    return room;
  }

  F.registerRoom('blackjack', createBlackjackRoom);
})();
