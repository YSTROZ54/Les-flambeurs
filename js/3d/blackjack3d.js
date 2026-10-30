/* =====================================================================
   blackjack3d.js — La salle de blackjack (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « BLACKJACK » du hall (hall3d.js) et on en ressort vers le hall.
   Cinq tables en demi-cercle (quatre le long des murs, une au milieu), chacune avec son croupier assis en face et deux places de jeu (F ou clic pour s'asseoir) : on peut jouer seul.
   Assis, on règle sa mise : la manche démarre toute seule à la fin du compte à rebours et est jouée contre le croupier EXACTEMENT comme le blackjack solo du menu
   (api/_games.js : bj_start / bj_hit / bj_stand / bj_double — le serveur tire les cartes, prélève la mise et paie les gains).
   Fichiers liés : f3d-core.js, world3d.js, persona3d.js (personnages), hall3d.js (la porte), api/_games.js (serveur).
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
  var BOT_NAMES = ['Léo', 'Nina', 'Karim', 'Zoé', 'Yann', 'Lola', 'Max', 'Inès', 'Hugo', 'Maya', 'Sam', 'Éva'];
  var SUIT_COL = { '♥': '#c8202f', '♦': '#c8202f', '♠': '#15151a', '♣': '#15151a' };
  var CHIPS = [10, 50, 100, 500, 1000, 5000];
  var MIN_BET = 10, MAX_BET = 50000;

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function sg(payload) {
    try { if (typeof serverGame === 'function') return Promise.resolve(serverGame(payload)).catch(function () { return { ok: false, error: 'Réseau indisponible.' }; }); } catch (e) { /* ok */ }
    return Promise.resolve({ ok: false, error: 'Serveur indisponible.' });
  }
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
  function isSoft(cards) { var t = 0, a = 0; cards.forEach(function (c) { if (c.r === 'A') { a++; t += 11; } else if (c.r === 'K' || c.r === 'Q' || c.r === 'J') t += 10; else t += parseInt(c.r, 10) || 0; }); return a > 0 && t <= 21; }
  function newDeck() {
    var d = [], r, s;
    ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].forEach(function (rk) { ['♠', '♥', '♦', '♣'].forEach(function (su) { d.push({ r: rk, s: su }); }); });
    for (var i = d.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); r = d[i]; d[i] = d[j]; d[j] = r; }
    return d;
  }
  // les robots jouent la stratégie de base simplifiée
  function botWantsCard(cards, up) {
    var sc = score(cards), u = up ? score([up]) : 7;
    if (sc >= 18) return false;
    if (isSoft(cards)) return sc <= 17;
    if (sc >= 17) return false;
    if (sc >= 13) return u >= 7;
    if (sc === 12) return !(u >= 4 && u <= 6);
    return true;
  }
  var texCache = {};
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function cardTex(c) {
    var key = c.r === '?' ? 'back' : c.r + c.s;
    if (texCache[key]) return texCache[key];
    var cv = mkCanvas(640, 896), x = cv.getContext('2d'); x.scale(4, 4);   // texture 4x plus fine : les cartes se lisent sans les agrandir
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
    var t = mkTex(cv); t.anisotropy = 16; return (texCache[key] = t);
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
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 3, HZ * 2 / 3); ft.anisotropy = 8;
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
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 4;
    var wdc = mkCanvas(256, 256), wdx = wdc.getContext('2d'); wdx.fillStyle = '#2b150d'; wdx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 40; i++) { wdx.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.08) + ')'; wdx.fillRect(Math.random() * 256, 0, 1 + Math.random() * 2, 256); }
    wdx.strokeStyle = 'rgba(201,162,39,0.55)'; wdx.lineWidth = 3; wdx.strokeRect(22, 22, 212, 212); wdx.strokeStyle = 'rgba(0,0,0,0.5)'; wdx.lineWidth = 6; wdx.strokeRect(34, 34, 188, 188);
    var panelTex = new THREE.CanvasTexture(wdc); panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping; panelTex.anisotropy = 4;
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
      var t = new THREE.CanvasTexture(cv); t.flipY = false; t.anisotropy = 8; t.repeat.set(1 / (TABLE_R * 2), 1 / TABLE_R); t.offset.set(0.5, 0); return t;
    }
    var feltTop = new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    // fauteuil capitonné : pied doré, assise de velours, dossier enveloppant (le dos est derrière, à -z ; le fauteuil regarde vers +z)
    function makeChair(parent, x, z, ry, seatY, tall) {
      var q = new THREE.Group(); q.position.set(x, 0, z); q.rotation.y = ry; parent.add(q);
      cyl(q, 0.27, 0.3, 0.035, gold, 0, 0.0175, 0, 24); cyl(q, 0.045, 0.06, seatY - 0.12, gold, 0, (seatY - 0.12) / 2 + 0.035, 0, 12);
      cyl(q, 0.25, 0.25, 0.11, velvetM, 0, seatY, 0, 28);
      var r1 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.013, 8, 36), gold); r1.rotation.x = Math.PI / 2; r1.position.y = seatY + 0.055; q.add(r1);
      var r2 = r1.clone(); r2.position.y = seatY - 0.055; q.add(r2);
      var bh = tall ? 0.78 : 0.52, by = seatY + 0.06 + bh / 2;
      var back = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, bh, 28, 1, true, Math.PI - 1.15, 2.3), velvetM); back.position.set(0, by, 0); q.add(back);
      var back2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, bh + 0.04, 28, 1, true, Math.PI - 1.17, 2.34), velvetD); back2.position.set(0, by, 0); q.add(back2);
      [-1, 1].forEach(function (sd) { cyl(q, 0.016, 0.016, bh + 0.06, gold, sd * Math.sin(1.15) * 0.3, by, Math.cos(Math.PI - 1.15) * 0.3, 8); });
      var top = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.014, 8, 28, 2.3), gold); top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2 + 1.15 - Math.PI; top.position.y = by + bh / 2 + 0.02; q.add(top);
      return q;
    }
    function later(sec, fn) { timers.push({ t: sec, fn: fn }); }
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

      var T = { i: ti, x: td.x, z: td.z, group: grp, hands: {}, dealerCards: [], spots: [] };
      tables.push(T);
      // croupier
      var dl = F.createPlayer ? F.createPlayer('Croupier', '', ti % 2 ? 'h1010' : 'f1230') : null;
      if (dl) {
        dl.group.position.set(td.x, 0, td.z - 0.75); dl.group.rotation.y = 0; dl.tag.scale.set(1.0, 0.22, 1); dl.setSeated(true, { y: 0.0, z: 0.28 }); g.add(dl.group); T.dealerO = { p: dl, kind: 'dealer', t: T, awake: 0, settled: false }; people.push(T.dealerO); T.dealer = dl;
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
          var nm = BOT_NAMES[(ti * 3 + k * 5 + 1) % BOT_NAMES.length], bp = F.createPlayer ? F.createPlayer(nm, '', F.persona ? F.persona.lookCode(F.persona.lookFromName(nm)) : '') : null;
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
    var R = { phase: 'idle', table: null, me: [], dealer: [], botHands: {}, deck: [], up: null, final: null, busy: false, msg: '' };
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
      anims = anims.filter(function (a) { return a.m.parent; });
    }
    function label(T, x, z, text, col) {
      var cv = mkCanvas(256, 80), c = cv.getContext('2d'); roundRect(c, 4, 4, 248, 72, 24); c.fillStyle = 'rgba(8,5,12,0.85)'; c.fill(); c.strokeStyle = col; c.lineWidth = 5; c.stroke();
      c.fillStyle = col; c.font = '900 38px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 42, 230);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(cv), transparent: true, depthWrite: false })); sp.scale.set(0.46, 0.15, 1); sp.position.set(x, TOP_Y + 0.32, z); g.add(sp); T.labels = T.labels || []; T.labels.push(sp);
    }
    function wake(T) { if (T && T.dealerO) T.dealerO.awake = 1.1; }
    function showHand(T, s, cards, keep) {
      wake(T);
      T.handMeshes = T.handMeshes || {};
      var have = (T.handMeshes[s.n] = T.handMeshes[s.n] || []);
      for (var k = have.length; k < cards.length; k++) have.push(placeCard('p', s.n, T, cards[k], spotPos(T, s, k, cards.length), 0));
      // recentre les cartes déjà posées
      have.forEach(function (m, k2) { var p = spotPos(T, s, k2, cards.length); var a = anims.filter(function (x) { return x.m === m; })[0]; if (a) a.to.set(p.x, p.y, p.z); else { m.position.set(p.x, p.y, p.z); } });
    }
    function showDealer(T, cards) {
      wake(T);
      T.dealerMeshes = T.dealerMeshes || [];
      for (var k = T.dealerMeshes.length; k < cards.length; k++) T.dealerMeshes.push(placeCard('d', 0, T, cards[k], dealerPos(T, k, cards.length), 0));
      T.dealerMeshes.forEach(function (m, k2) { var p = dealerPos(T, k2, cards.length); var a = anims.filter(function (x) { return x.m === m; })[0]; if (a) a.to.set(p.x, p.y, p.z); else m.position.set(p.x, p.y, p.z); });
    }
    function reveal(T, cards) {
      T.dealerMeshes = T.dealerMeshes || [];
      cards.forEach(function (c, k) { if (T.dealerMeshes[k]) { T.dealerMeshes[k].material.map = cardTex(c); T.dealerMeshes[k].material.needsUpdate = true; } });
      showDealer(T, cards);
    }
    function botSeats(T) { return T.spots.filter(function (s) { return s.bot; }); }

    function setMsg(t, col) { R.msg = t; if (ui) { var m = ui.el.querySelector('.bj-msg'); m.textContent = t || ''; m.style.color = col || ''; } }
    function handHtml(cards) { return cards.map(function (c) { var red = c.s === '♥' || c.s === '♦'; return c.r === '?' ? '<span class="n">🂠</span>' : '<span class="' + (red ? 'r' : 'n') + '">' + c.r + c.s + '</span>'; }).join(' '); }
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
      var show = view3 && R.phase !== 'idle' && R.me.length;
      if (!cardsEl) { cardsEl = document.createElement('div'); cardsEl.className = 'bj3d-cards'; ui.el.parentNode.appendChild(cardsEl); }
      cardsEl.style.display = show ? 'flex' : 'none';
      if (!show) return;
      var hidden = R.dealer.some(function (c) { return c.r === '?'; });
      function row(cards) { return '<div class="bj-cr">' + cards.map(function (c) { return '<img src="' + cardImg(c) + '" alt="">'; }).join('') + '</div>'; }
      setHtml(cardsEl, '<div class="bj-cl">Croupier' + (hidden ? '' : ' · ' + score(R.dealer)) + '</div>' + row(R.dealer) + '<div class="bj-cl">Toi · ' + score(R.me) + '</div>' + row(R.me));
    }
    function refreshUi() {
      if (!ui) return;
      var hd = ui.el.querySelector('.bj-hands');
      if (R.phase !== 'idle' && R.me.length) {
        var hidden = R.dealer.some(function (c) { return c.r === '?'; });
        setHtml(hd, '<div>Croupier : ' + handHtml(R.dealer) + (hidden ? '' : ' (' + score(R.dealer) + ')') + '</div><div>Toi : ' + handHtml(R.me) + ' (' + score(R.me) + ')</div>');
      } else setHtml(hd, '');
      refreshCards();
      var q = function (s) { return ui.el.querySelector(s); };
      setText(q('.bj-bal b'), fmtN(balance()) + ' 🪙'); setText(q('.bj-bet b'), fmtN(bet) + ' 🪙');   // on ne réécrit le texte que s'il change : sinon l'émoji clignote
      var idle = R.phase === 'idle' && !R.busy, mine = R.phase === 'me' && !R.busy;
      q('.bj-chips').style.display = idle ? '' : 'none';
      var rdy = q('[data-a=ready]'); if (rdy) rdy.style.display = idle && seat ? '' : 'none';
      ui.el.querySelectorAll('[data-a=hit],[data-a=stand],[data-a=double]').forEach(function (b) { b.style.display = R.phase === 'me' ? '' : 'none'; b.disabled = !mine; });
      var dbl = q('[data-a=double]'); if (dbl) dbl.disabled = !mine || R.me.length !== 2;
    }

    // la manche démarre toute seule quand le compte à rebours de mise arrive à zéro
    function startRound() {
      if (!seat || R.busy || R.phase !== 'idle') return;
      if (!loggedIn()) { setMsg('Connecte-toi pour jouer au blackjack.', '#ff8a80'); R.count = 6; return; }
      if (bet < MIN_BET || bet > MAX_BET) { setMsg('Mise entre ' + MIN_BET + ' et ' + fmtN(MAX_BET) + ' 🪙.', '#ff8a80'); R.count = 6; return; }
      if (bet > balance()) { setMsg('Solde insuffisant : baisse ta mise.', '#ff8a80'); R.count = 6; return; }
      R.busy = true; setMsg('Distribution…'); refreshUi();
      sg({ action: 'bj_start', bet: bet }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Impossible de distribuer.', '#ff8a80'); R.count = 6; refreshUi(); return; }
        var T = seat.table; clearCards(T);
        R.table = T; R.me = r.player || []; R.dealer = r.dealer || []; R.up = R.dealer[0] || null; R.final = null; R.botHands = {}; R.deck = newDeck(); R.done = false; R.res = null; R.bet = r.bet;
        R.phase = 'dealing'; setMsg('');
        var delay = 0.15;
        // distribution : une carte à chacun, puis la deuxième
        var order = T.spots.filter(function (s) { return s.bot || s === seat; });
        for (var round = 0; round < 2; round++) {
          order.forEach(function (s) {
            later(delay, (function (s, round) { return function () {
              if (s === seat) showHand(T, s, R.me.slice(0, round + 1)); else { var h = (R.botHands[s.n] = R.botHands[s.n] || { cards: [], done: false }); h.cards.push(R.deck.pop()); showHand(T, s, h.cards); }
            }; })(s, round)); delay += 0.3;
          });
          later(delay, (function (round) { return function () { showDealer(T, R.dealer.slice(0, round + 1)); }; })(round)); delay += 0.3;
        }
        later(delay + 0.3, function () { startTurns(r); });
        refreshUi();
      });
    }
    // ordre de jeu : les places d'indice plus petit que la mienne jouent d'abord (à ma droite), puis moi, puis les autres
    function botTurn(list, then) {
      if (!list.length) { then(); return; }
      var s = list[0], h = R.botHands[s.n];
      (function step() {
        if (!seat) return;
        if (h.cards.length < 5 && botWantsCard(h.cards, R.up)) {
          later(0.9, function () { h.cards.push(R.deck.pop()); showHand(R.table, s, h.cards); if (score(h.cards) > 21) { h.busted = true; label(R.table, spotPos(R.table, s, 0, 1).x, spotPos(R.table, s, 0, 1).z, 'SAUTÉ', '#ff8a80'); later(0.7, function () { botTurn(list.slice(1), then); }); } else step(); });
        } else later(0.8, function () { botTurn(list.slice(1), then); });
      })();
    }
    function startTurns(r) {
      var T = R.table, before = botSeats(T).filter(function (s) { return s.i < seat.i; }), after = botSeats(T).filter(function (s) { return s.i > seat.i; });
      R.after = after;
      botTurn(before, function () {
        if (r.done) { finish(r); return; }
        R.phase = 'me'; setMsg('À toi de jouer : ' + score(R.me) + (isSoft(R.me) && R.me.length ? '' : ''), ''); refreshUi();
      });
    }
    function act(kind) {
      if (!seat || R.phase !== 'me' || R.busy) return;
      R.busy = true; refreshUi();
      sg({ action: kind }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Action impossible.', '#ff8a80'); refreshUi(); return; }
        R.me = r.player || R.me; R.dealer = r.dealer || R.dealer; showHand(R.table, seat, R.me);
        if (r.done) { finish(r); } else { setMsg('Tu as ' + score(R.me) + '.'); refreshUi(); }
      });
    }
    function finish(r) {
      var T = R.table; R.phase = 'bots'; R.busy = false; refreshUi();
      R.me = r.player || R.me; showHand(T, seat, R.me);
      var after = R.after || [];
      botTurn(after, function () {
        // le croupier retourne sa carte et tire (les cartes viennent du serveur)
        later(0.5, function () {
          reveal(T, r.dealer || R.dealer);
          later(0.9, function () {
            var dl = score(r.dealer || R.dealer);
            // verdict des robots contre la main finale du croupier
            botSeats(T).forEach(function (s) {
              var h = R.botHands[s.n]; if (!h) return; var sc = score(h.cards), p = spotPos(T, s, 0, 1);
              if (h.busted) return;
              if (dl > 21 || sc > dl) label(T, p.x, p.z, 'GAGNÉ', '#7ee0a0'); else if (sc === dl) label(T, p.x, p.z, 'ÉGALITÉ', '#f3cf62'); else label(T, p.x, p.z, 'PERDU', '#ff8a80');
            });
            var mine = spotPos(T, seat, 0, 1), txt, col;
            if (r.result === 'win') { txt = 'GAGNÉ'; col = '#7ee0a0'; setMsg('🏆 Gagné ! ' + r.pScore + ' contre ' + r.dScore + ' : +' + fmtN(r.win) + ' 🪙', '#7ee0a0'); }
            else if (r.result === 'push') { txt = 'ÉGALITÉ'; col = '#f3cf62'; setMsg('🤝 Égalité : mise remboursée.', '#f3cf62'); }
            else if (r.result === 'bust') { txt = 'SAUTÉ'; col = '#ff8a80'; setMsg('💥 Tu as dépassé 21.', '#ff8a80'); }
            else { txt = 'PERDU'; col = '#ff8a80'; setMsg('Perdu : ' + r.pScore + ' contre ' + r.dScore + '.', '#ff8a80'); }
            label(T, mine.x, mine.z, txt, col);
            R.phase = 'result'; refreshUi();
            later(4.5, function () { if (R.phase === 'result') { clearCards(T); R.phase = 'idle'; R.count = 9; setMsg('Place ta mise : la manche suivante démarre toute seule.'); refreshUi(); } });
          });
        });
      });
    }

    /* --- s'asseoir / se lever --- */
    function injectCss() {
      if (document.getElementById('bj3d-css')) return;
      var s = document.createElement('style'); s.id = 'bj3d-css';
      s.textContent = '.bj3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(560px,92%);background:rgba(8,5,12,.9);border:1px solid rgba(201,162,39,.6);border-radius:16px;padding:12px 14px;color:#f4e3b0;pointer-events:auto;display:flex;flex-direction:column;gap:8px;font-family:inherit;z-index:5}' +
        '.bj3d .bj-hands{display:flex;justify-content:space-around;gap:10px;font-weight:800;font-size:15px;flex-wrap:wrap}.bj3d .bj-hands span.r{color:#ff7a86}.bj3d .bj-hands span.n{color:#fff}.bj3d .bj-top{display:flex;justify-content:space-between;font-weight:800;font-size:13px}.bj3d .bj-msg{min-height:20px;text-align:center;font-weight:800;font-size:15px}' +
        '.bj3d .bj-chips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.bj3d .bj-chip{padding:6px 10px;border-radius:999px;border:2px solid #f3cf62;background:#241218;color:#f3cf62;font-weight:900;font-size:13px;cursor:pointer}' +
        '.bj3d .bj-chip.minus{border-color:#ff8a80;color:#ff8a80}.bj3d .bj-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
        '.bj3d button.bj-b{padding:10px 18px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00)}.bj3d button.bj-b:disabled{opacity:.4;cursor:not-allowed}' +
        '.bj3d button.bj-b.alt{background:#2a3b57;color:#e8f0ff}.bj3d button.bj-b.red{background:#8a1f2b;color:#ffe9ea}' +
        '.bj3d-cards{position:absolute;left:14px;bottom:182px;z-index:5;pointer-events:none;display:none;flex-direction:column;gap:5px;padding:8px 10px;border-radius:12px;background:rgba(8,5,12,.8);border:1px solid rgba(201,162,39,.5);color:#f4e3b0;font-weight:800;font-size:12px}.bj3d-cards .bj-cr{display:flex;gap:5px}.bj3d-cards img{width:68px;height:auto;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.55)}' +
        '.bj3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.bj3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(201,162,39,.6);background:rgba(8,5,12,.85);color:#f4e3b0;font-weight:800;cursor:pointer}';
      document.head.appendChild(s);
    }
    function buildUi(w) {
      injectCss();
      var el = document.createElement('div'); el.className = 'bj3d';
      el.innerHTML = '<div class="bj-top"><span class="bj-bal">Solde : <b></b></span><span class="bj-count" style="color:#f3cf62"></span><span class="bj-bet">Mise : <b></b></span></div><div class="bj-hands"></div><div class="bj-msg"></div>' +
        '<div class="bj-chips">' + CHIPS.map(function (c) { return '<button class="bj-chip" data-c="' + c + '">+' + fmtN(c) + '</button>'; }).join('') + '<button class="bj-chip minus" data-c="-1">Effacer</button><button class="bj-chip" data-c="max">Tout</button></div>' +
        '<div class="bj-row"><button class="bj-b" data-a="hit">Tirer</button><button class="bj-b alt" data-a="stand">Rester</button><button class="bj-b red" data-a="double">Doubler</button><button class="bj-b" data-a="ready">✅ Prêt</button></div>';
      w.container.appendChild(el);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.c) {
          if (R.phase !== 'idle') return;
          if (b.dataset.c === '-1') bet = MIN_BET; else if (b.dataset.c === 'max') bet = Math.min(MAX_BET, Math.floor(balance())); else bet = bet + parseInt(b.dataset.c, 10);
          bet = Math.max(MIN_BET, Math.min(MAX_BET, bet)); refreshUi(); return;
        }
        var a = b.dataset.a;
        if (a === 'ready') { if (R.phase === 'idle' && !R.busy) R.count = 0; return; }
        if (a === 'hit') act('bj_hit'); else if (a === 'stand') act('bj_stand'); else if (a === 'double') act('bj_double');
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
      if (F.createPlayer && !meRig) {                                   // mon personnage, montré seulement en vue 3e personne
        var nm0 = ''; try { nm0 = st().username || ''; } catch (e) { /* ok */ }
        meRig = F.createPlayer(nm0 || 'Moi', '', F.myLookCode ? F.myLookCode() : ''); meRig.tag.visible = false; meRig.setSeated(true, { y: 0.12, z: 0.28 });
        g.add(meRig.group);
      }
      if (meRig) { meRig.group.position.set(s.x, 0, s.z); meRig.group.rotation.y = Math.atan2(s.tx - s.x, s.tz + 0.25 - s.z); meRig.group.visible = false; } R.phase = 'idle'; R.busy = false; R.count = 12;
      ui = buildUi(w);
      standEl = document.createElement('div'); standEl.className = 'bj3d-stand'; standEl.innerHTML = '<button data-b="stand">🪑 Se lever <kbd>F</kbd></button> <button data-b="cam">👁 Vue 3e personne <kbd>V</kbd></button>'; standEl.querySelector('[data-b=stand]').addEventListener('click', function () { stand(); }); standEl.querySelector('[data-b=cam]').addEventListener('click', function () { toggleView(); });
      w.container.appendChild(standEl);
      window.addEventListener('keydown', onSeatKey, true);
      R.count = 12; setMsg(loggedIn() ? 'Place ta mise : la manche démarre toute seule.' : 'Connecte-toi pour jouer.'); refreshUi();
    }
    function stand() {
      if (!seat) return;
      var s = seat, was = R.phase;
      if (was === 'me' && !R.busy) { sg({ action: 'bj_stand' }); }      // on ne laisse pas une manche ouverte : on reste et le serveur règle la mise
      seat = null; R.phase = 'idle';
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
      if (!seat) return;
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
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.8; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      // vue assis : la tête est un peu avancée au-dessus de la table et regarde vers le bas, entre mes cartes et celles du croupier
      var cx0 = s.tx, cz0 = s.tz + 0.25, ex = s.x + (cx0 - s.x) * 0.12, ey = 1.62, ez = s.z + (cz0 - s.z) * 0.12;
      var px = cx0 + (s.x - cx0) * 0.5, pz = cz0 + (s.z - cz0) * 0.5;
      var a = Math.atan2(px - ex, -(pz - ez)) + view.yaw, p = Math.atan2(0.86 - ey, Math.hypot(px - ex, pz - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 60 };
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
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      clockT += dt;
      if (seat && R.phase === 'idle' && !R.busy) {
        R.count = (R.count === undefined ? 10 : R.count) - dt;
        if (ui) { var tm = ui.el.querySelector('.bj-count'); setText(tm, 'Manche dans ' + Math.max(0, Math.ceil(R.count)) + ' s'); }
        if (R.count <= 0) startRound();
      } else if (ui) { var tm2 = ui.el.querySelector('.bj-count'); setText(tm2, ''); }
      // animations des personnages
      people.forEach(function (o) {
        if (!o.p._rig) return;
        if (!o.settled) { o.p.stopWalk(); o.p.applyHold(0.05); o.settled = true; return; }   // une première image pour prendre la pose assise, puis plus rien
        if (o.awake > 0) { o.awake -= dt; o.p.stopWalk(); o.p.applyHold(dt); }                  // le croupier ne bouge que pendant qu'il donne les cartes
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
