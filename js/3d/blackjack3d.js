/* =====================================================================
   blackjack3d.js — La salle de blackjack (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « BLACKJACK » du hall (hall3d.js) et on en ressort vers le hall.
   Quatre tables en demi-cercle, chacune avec son croupier debout et cinq tabourets ; des robots (vrais personnages 3D, persona3d.js)
   sont déjà assis à chaque table, il reste deux places libres où s'asseoir (F ou clic).
   Assis, on mise puis on clique « Distribuer » : la manche est jouée contre le croupier EXACTEMENT comme le blackjack solo du menu
   (api/_games.js : bj_start / bj_hit / bj_stand / bj_double — le serveur tire les cartes, prélève la mise et paie les gains).
   Les robots, eux, ne jouent que pour le décor : ils tirent leurs cartes dans un paquet local, jouent selon la stratégie de base
   (ceux à ta droite avant toi, ceux à ta gauche après) et sont comparés à la main finale du croupier. Aucun argent ne leur est lié.
   Fichiers liés : f3d-core.js, world3d.js, persona3d.js (personnages), hall3d.js (la porte), api/_games.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 14, HZ = 11, H = 5.4;
  var TABLE_R = 1.9, SEAT_R = 2.5, TOP_Y = 0.86;
  var TABLES = [{ x: -6.5, z: -4.6, bots: [0, 2, 4] }, { x: 6.5, z: -4.6, bots: [1, 3, 4] }, { x: -6.5, z: 2.6, bots: [0, 1, 3] }, { x: 6.5, z: 2.6, bots: [2, 3, 4] }];
  var PHI = [-1.14, -0.57, 0, 0.57, 1.14];                 // angle des cinq places, autour de la table
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
    var cv = mkCanvas(160, 224), x = cv.getContext('2d');
    roundRect(x, 3, 3, 154, 218, 14);
    if (key === 'back') {
      var g = x.createLinearGradient(0, 0, 160, 224); g.addColorStop(0, '#7a0f1c'); g.addColorStop(1, '#3d0610'); x.fillStyle = g; x.fill(); x.lineWidth = 6; x.strokeStyle = '#f3cf62'; x.stroke();
      x.strokeStyle = 'rgba(243,207,98,0.55)'; x.lineWidth = 2; roundRect(x, 16, 16, 128, 192, 8); x.stroke();
      x.fillStyle = '#f3cf62'; x.font = '900 70px ' + SERIF; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♠', 80, 112);
    } else {
      x.fillStyle = '#fbf7ec'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#b9b19a'; x.stroke();
      x.fillStyle = SUIT_COL[c.s] || '#15151a'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '900 40px ' + SERIF; x.fillText(c.r, 30, 34); x.font = '700 34px ' + SERIF; x.fillText(c.s, 30, 70);
      x.save(); x.translate(130, 190); x.rotate(Math.PI); x.font = '900 40px ' + SERIF; x.fillText(c.r, 0, 0); x.font = '700 34px ' + SERIF; x.fillText(c.s, 0, 36); x.restore();
      x.font = '900 86px ' + SERIF; x.fillText(c.s, 80, 116);
    }
    var t = mkTex(cv); t.anisotropy = 4; return (texCache[key] = t);
  }
  var cardGeo = null;
  function makeCard(c) {
    if (!cardGeo) cardGeo = new THREE.PlaneGeometry(0.2, 0.28);
    var m = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardTex(c) })); m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2; m.userData.card = c; return m;
  }

  function createBlackjackRoom(world) {
    var low = world.low;
    var room = { title: '🃏 BLACKJACK', subtitle: 'JOUE CONTRE LE CROUPIER', topic: 'flambeurs-blackjack-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- salle : moquette verte à motif, murs bordeaux et dorures, plafond sombre --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'), fgr = fx.createLinearGradient(0, 0, 256, 256);
    fgr.addColorStop(0, '#0f3a2c'); fgr.addColorStop(1, '#0a281e'); fx.fillStyle = fgr; fx.fillRect(0, 0, 256, 256);
    fx.strokeStyle = 'rgba(201,162,39,0.4)'; fx.lineWidth = 3; fx.beginPath(); fx.moveTo(128, 8); fx.lineTo(248, 128); fx.lineTo(128, 248); fx.lineTo(8, 128); fx.closePath(); fx.stroke();
    fx.fillStyle = 'rgba(201,162,39,0.3)'; [[0, 0], [256, 0], [0, 256], [256, 256], [128, 128]].forEach(function (p) { fx.beginPath(); fx.arc(p[0], p[1], 8, 0, TAU); fx.fill(); });
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.9, metalness: 0.02 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'), wgr = wx.createLinearGradient(0, 0, 0, 256);
    wgr.addColorStop(0, '#4a0f1c'); wgr.addColorStop(1, '#2c0810'); wx.fillStyle = wgr; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(201,162,39,0.45)'; wx.lineWidth = 3; wx.strokeRect(14, 22, 228, 212); wx.strokeStyle = 'rgba(201,162,39,0.2)'; wx.strokeRect(24, 32, 208, 192);
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 4;
    function wall(w, px, pz, ry) {
      var wt = wallTex.clone(); wt.needsUpdate = true; wt.repeat.set(w / 3.5, 1);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.85 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m);
    }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var gold = std(0xc9a227, 0.35, 0.7);
    [[HX * 2, 0.12, 0.12, 0, 1.1, -HZ + 0.06], [HX * 2, 0.12, 0.12, 0, 1.1, HZ - 0.06], [0.12, 0.12, HZ * 2, -HX + 0.06, 1.1, 0], [0.12, 0.12, HZ * 2, HX - 0.06, 1.1, 0],
      [HX * 2, 0.16, 0.16, 0, H - 0.1, -HZ + 0.08], [HX * 2, 0.16, 0.16, 0, H - 0.1, HZ - 0.08], [0.16, 0.16, HZ * 2, -HX + 0.08, H - 0.1, 0], [0.16, 0.16, HZ * 2, HX - 0.08, H - 0.1, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a0608 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    // enseigne néon au fond
    var sc0 = mkCanvas(1024, 256), sx = sc0.getContext('2d'); sx.fillStyle = '#12060a'; sx.fillRect(0, 0, 1024, 256); sx.strokeStyle = '#ff5a6a'; sx.lineWidth = 10; sx.strokeRect(10, 10, 1004, 236);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.shadowColor = '#ff3b4f'; sx.shadowBlur = 30; sx.fillStyle = '#ffd7dc'; sx.font = '900 150px ' + SERIF; sx.fillText('♠ BLACKJACK ♥', 512, 138, 960);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.9), new THREE.MeshBasicMaterial({ map: mkTex(sc0) })); sign.position.set(0, 3.7, -HZ + 0.07); g.add(sign);

    /* --- tables, croupiers, tabourets, robots --- */
    var felt = std(0x0e6b3f, 0.95, 0), woodM = std(0x2a140c, 0.5, 0.2), seatM = std(0x8f0f20, 0.6, 0.1), chromeM = std(0xc9ced6, 0.35, 0.8);
    var tables = [], seats = [], people = [], anims = [], timers = [], clockT = 0;
    function later(sec, fn) { timers.push({ t: sec, fn: fn }); }
    TABLES.forEach(function (td, ti) {
      var grp = new THREE.Group(); grp.position.set(td.x, 0, td.z); g.add(grp);
      // plateau en demi-disque : feutre vert dessus, bord en bois, pied central
      var top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.1, 48, 1, false, Math.PI / 2, Math.PI), [woodM, felt, woodM]); top.position.y = TOP_Y - 0.05; grp.add(top);
      box(grp, TABLE_R * 2, 0.1, 0.02, woodM, 0, TOP_Y - 0.05, 0);                             // le côté plat (côté croupier)
      var rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.05, 8, 48, Math.PI), woodM); rim.rotation.x = Math.PI / 2; rim.rotation.z = 0; rim.position.y = TOP_Y; grp.add(rim);
      var rimG = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R - 0.06, 0.012, 6, 48, Math.PI), gold); rimG.rotation.x = Math.PI / 2; rimG.position.y = TOP_Y + 0.045; grp.add(rimG);
      var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, TOP_Y - 0.1, 16), woodM); ped.position.set(0, (TOP_Y - 0.1) / 2, 0.45); grp.add(ped);
      // marquages : arc de cercle des mises et texte
      var tcv = mkCanvas(512, 256), tx = tcv.getContext('2d'); tx.strokeStyle = 'rgba(243,207,98,0.8)'; tx.lineWidth = 4; tx.fillStyle = 'rgba(243,207,98,0.9)'; tx.textAlign = 'center'; tx.textBaseline = 'middle';
      tx.beginPath(); tx.arc(256, 8, 200, 0.18, Math.PI - 0.18); tx.stroke(); tx.font = '800 26px ' + SERIF; tx.fillText('BLACKJACK PAYE 3 POUR 2', 256, 120, 380); tx.font = '700 20px ' + MONO; tx.fillText('LE CROUPIER TIRE JUSQU\'À 17', 256, 160, 380);
      var mark = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_R * 1.5, TABLE_R * 0.75), new THREE.MeshBasicMaterial({ map: mkTex(tcv), transparent: true, depthWrite: false })); mark.rotation.x = -Math.PI / 2; mark.position.set(0, TOP_Y + 0.003, 0.95); grp.add(mark);
      // lampe suspendue
      var lamp = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide })); lamp.position.set(0, H - 1.4, 0.9); grp.add(lamp);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), bas(0xffe9b0)); bulb.position.set(0, H - 1.5, 0.9); grp.add(bulb);
      var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6), bas(0x222222)); cord.position.set(0, H - 0.65, 0.9); grp.add(cord);
      if (!low) { var pl = new THREE.PointLight(0xffe0b0, 0.8, 9); pl.position.set(td.x, H - 1.6, td.z + 0.9); g.add(pl); }
      room.colliders.push({ x: td.x, z: td.z + 0.2, r: 0.95 }, { x: td.x - 1.3, z: td.z + 0.6, r: 0.6 }, { x: td.x + 1.3, z: td.z + 0.6, r: 0.6 }, { x: td.x, z: td.z + 1.35, r: 0.7 }, { x: td.x, z: td.z - 0.55, r: 0.5 });

      var T = { i: ti, x: td.x, z: td.z, group: grp, hands: {}, dealerCards: [], spots: [] };
      tables.push(T);
      // croupier
      var dl = F.createPlayer ? F.createPlayer('Croupier ' + (ti + 1), '', ti % 2 ? 'h1010' : 'f1230') : null;
      if (dl) { dl.group.position.set(td.x, 0, td.z - 0.6); dl.group.rotation.y = 0; dl.tag.scale.set(1.0, 0.22, 1); g.add(dl.group); people.push({ p: dl, kind: 'dealer', t: T }); T.dealer = dl; }
      // places
      PHI.forEach(function (phi, k) {
        var sx0 = td.x + Math.sin(phi) * SEAT_R, sz0 = td.z + Math.cos(phi) * SEAT_R, dx = td.x - sx0, dz = td.z + 0.25 - sz0;
        var s = { n: ti * 5 + k, x: sx0, z: sz0, yaw: Math.atan2(dx, -dz), tx: td.x, tz: td.z, table: T, i: k, phi: phi, bot: td.bots.indexOf(k) >= 0, sx: td.x + Math.sin(phi) * (SEAT_R + 0.9), sz: td.z + Math.cos(phi) * (SEAT_R + 0.9) };
        seats.push(s); T.spots.push(s);
        // tabouret
        cyl(grp, 0.03, 0.03, 0.55, chromeM, sx0 - td.x, 0.3, sz0 - td.z, 8); cyl(grp, 0.2, 0.22, 0.03, chromeM, sx0 - td.x, 0.02, sz0 - td.z, 14);
        cyl(grp, 0.2, 0.2, 0.1, seatM, sx0 - td.x, 0.6, sz0 - td.z, 16);
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
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, bet = 100;
    var R = { phase: 'idle', table: null, me: [], dealer: [], botHands: {}, deck: [], up: null, final: null, busy: false, msg: '' };
    function seatTaken(s) {
      var now = performance.now();
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; });
    }
    function spotPos(T, s, ci, n) {      // carte n°ci du joueur assis à la place s
      var ph = s.phi, bx = T.x + Math.sin(ph) * 1.2, bz = T.z + Math.cos(ph) * 1.2, tx0 = Math.cos(ph), tz0 = -Math.sin(ph);
      var off = (ci - (n - 1) / 2) * 0.16;
      return { x: bx + tx0 * off, z: bz + tz0 * off, y: TOP_Y + 0.006 + ci * 0.003, ry: ph + 0.05 * ((ci % 2) ? 1 : -1) };   // le haut de la carte regarde vers le centre de la table
    }
    function dealerPos(T, ci, n) { return { x: T.x + (ci - (n - 1) / 2) * 0.23, z: T.z + 0.42, y: TOP_Y + 0.006 + ci * 0.003, ry: 0 }; }
    function placeCard(owner, key, T, card, pos, sec) {
      var m = makeCard(card); m.position.set(T.x + 0.55, TOP_Y + 0.45, T.z - 0.1); m.rotation.y = pos.ry; g.add(m);
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
    function showHand(T, s, cards, keep) {
      T.handMeshes = T.handMeshes || {};
      var have = (T.handMeshes[s.n] = T.handMeshes[s.n] || []);
      for (var k = have.length; k < cards.length; k++) have.push(placeCard('p', s.n, T, cards[k], spotPos(T, s, k, cards.length), 0));
      // recentre les cartes déjà posées
      have.forEach(function (m, k2) { var p = spotPos(T, s, k2, cards.length); var a = anims.filter(function (x) { return x.m === m; })[0]; if (a) a.to.set(p.x, p.y, p.z); else { m.position.set(p.x, p.y, p.z); } });
    }
    function showDealer(T, cards) {
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
    function refreshUi() {
      if (!ui) return;
      var q = function (s) { return ui.el.querySelector(s); };
      q('.bj-bal b').textContent = fmtN(balance()) + ' 🪙'; q('.bj-bet b').textContent = fmtN(bet) + ' 🪙';
      var idle = R.phase === 'idle' && !R.busy, mine = R.phase === 'me' && !R.busy;
      q('[data-a=deal]').style.display = idle ? '' : 'none'; q('.bj-chips').style.display = idle ? '' : 'none';
      ui.el.querySelectorAll('[data-a=hit],[data-a=stand],[data-a=double]').forEach(function (b) { b.style.display = R.phase === 'me' ? '' : 'none'; b.disabled = !mine; });
      var dbl = q('[data-a=double]'); if (dbl) dbl.disabled = !mine || R.me.length !== 2;
    }

    function startRound() {
      if (!seat || R.busy || R.phase !== 'idle') return;
      if (!loggedIn()) { world.flash('Connecte-toi pour jouer au blackjack.'); return; }
      if (bet < MIN_BET || bet > MAX_BET) { setMsg('Mise entre ' + MIN_BET + ' et ' + fmtN(MAX_BET) + ' 🪙.', '#ff8a80'); return; }
      if (bet > balance()) { setMsg('Solde insuffisant pour cette mise.', '#ff8a80'); return; }
      R.busy = true; setMsg('Distribution…'); refreshUi();
      sg({ action: 'bj_start', bet: bet }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Impossible de distribuer.', '#ff8a80'); refreshUi(); return; }
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
            if (T.dealer && r.result === 'win') T.dealer.startEmote && T.dealer.startEmote('salut');
            R.phase = 'result'; refreshUi();
            later(4.5, function () { if (R.phase === 'result') { clearCards(T); R.phase = 'idle'; setMsg('Choisis ta mise puis distribue.'); refreshUi(); } });
          });
        });
      });
    }

    /* --- s'asseoir / se lever --- */
    function injectCss() {
      if (document.getElementById('bj3d-css')) return;
      var s = document.createElement('style'); s.id = 'bj3d-css';
      s.textContent = '.bj3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(560px,92%);background:rgba(8,5,12,.9);border:1px solid rgba(201,162,39,.6);border-radius:16px;padding:12px 14px;color:#f4e3b0;pointer-events:auto;display:flex;flex-direction:column;gap:8px;font-family:inherit;z-index:5}' +
        '.bj3d .bj-top{display:flex;justify-content:space-between;font-weight:800;font-size:13px}.bj3d .bj-msg{min-height:20px;text-align:center;font-weight:800;font-size:15px}' +
        '.bj3d .bj-chips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.bj3d .bj-chip{padding:6px 10px;border-radius:999px;border:2px solid #f3cf62;background:#241218;color:#f3cf62;font-weight:900;font-size:13px;cursor:pointer}' +
        '.bj3d .bj-chip.minus{border-color:#ff8a80;color:#ff8a80}.bj3d .bj-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
        '.bj3d button.bj-b{padding:10px 18px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00)}.bj3d button.bj-b:disabled{opacity:.4;cursor:not-allowed}' +
        '.bj3d button.bj-b.alt{background:#2a3b57;color:#e8f0ff}.bj3d button.bj-b.red{background:#8a1f2b;color:#ffe9ea}' +
        '.bj3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.bj3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(201,162,39,.6);background:rgba(8,5,12,.85);color:#f4e3b0;font-weight:800;cursor:pointer}';
      document.head.appendChild(s);
    }
    function buildUi(w) {
      injectCss();
      var el = document.createElement('div'); el.className = 'bj3d';
      el.innerHTML = '<div class="bj-top"><span class="bj-bal">Solde : <b></b></span><span class="bj-bet">Mise : <b></b></span></div><div class="bj-msg"></div>' +
        '<div class="bj-chips">' + CHIPS.map(function (c) { return '<button class="bj-chip" data-c="' + c + '">+' + fmtN(c) + '</button>'; }).join('') + '<button class="bj-chip minus" data-c="-1">Effacer</button><button class="bj-chip" data-c="max">Tout</button></div>' +
        '<div class="bj-row"><button class="bj-b" data-a="deal">Distribuer</button><button class="bj-b" data-a="hit">Tirer</button><button class="bj-b alt" data-a="stand">Rester</button><button class="bj-b red" data-a="double">Doubler</button></div>';
      w.container.appendChild(el);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.c) {
          if (R.phase !== 'idle') return;
          if (b.dataset.c === '-1') bet = MIN_BET; else if (b.dataset.c === 'max') bet = Math.min(MAX_BET, Math.floor(balance())); else bet = bet + parseInt(b.dataset.c, 10);
          bet = Math.max(MIN_BET, Math.min(MAX_BET, bet)); refreshUi(); return;
        }
        var a = b.dataset.a;
        if (a === 'deal') startRound(); else if (a === 'hit') act('bj_hit'); else if (a === 'stand') act('bj_stand'); else if (a === 'double') act('bj_double');
      });
      return { el: el };
    }
    var standEl = null;
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
    }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0; R.phase = 'idle'; R.busy = false;
      ui = buildUi(w);
      standEl = document.createElement('div'); standEl.className = 'bj3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl);
      window.addEventListener('keydown', onSeatKey, true);
      setMsg(loggedIn() ? 'Choisis ta mise puis distribue.' : 'Connecte-toi pour jouer.'); refreshUi();
      if (s.table.dealer && s.table.dealer.startEmote) s.table.dealer.startEmote('salut');
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
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.8; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      var ex = s.x, ey = 1.28, ez = s.z, a = Math.atan2(s.tx - ex, -(s.tz + 0.25 - ez)) + view.yaw, p = Math.atan2(0.8 - ey, Math.hypot(s.tx - ex, s.tz - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 60 };
    };
    room.syncHud = function () { refreshUi(); };

    /* --- porte de retour, lumières --- */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });
    g.add(new THREE.AmbientLight(0xe8d8d0, 0.75));
    var key = new THREE.DirectionalLight(0xfff0e0, 0.35); key.position.set(3, 8, 5); g.add(key);

    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) {
      return w.touch ? 'Joystick : marcher · touche une place libre d\'une table pour t\'asseoir'
        : 'ZQSD / flèches : marcher · Maj : courir · avance vers un tabouret libre (F ou clic) pour jouer au blackjack · assis : mise, Distribuer, Tirer, Rester, Doubler · F : se lever';
    };
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      clockT += dt;
      // animations des personnages
      people.forEach(function (o) { var p = o.p; if (o.kind === 'dealer') { if (p.emoId) { if (!p.playEmote(dt)) p.stopWalk(); } else p.stopWalk(); p.applyHold(dt); } else { p.stopWalk(); p.applyHold(dt); } });
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
      stand(); people.forEach(function (o) { o.p.dispose(); });
      Object.keys(texCache).forEach(function (k) { texCache[k].dispose(); delete texCache[k]; });
    };
    return room;
  }

  F.registerRoom('blackjack', createBlackjackRoom);
})();
