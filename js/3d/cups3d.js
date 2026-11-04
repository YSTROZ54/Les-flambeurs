/* =====================================================================
   cups3d.js — La salle des gobelets (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « GOBELETS » du hall (hall3d.js) et on en ressort vers le hall.
   Trois tables, chacune avec un tabouret : on s'assoit (F ou clic), on règle sa mise (10 à 250 €), on lance la partie.
   La bille est cachée sous l'un des trois gobelets, les gobelets sont mélangés devant toi, puis on clique sur celui qu'on croit le bon.
   Le serveur décide de tout, comme dans le jeu du menu (api/_games.js : cups_start / cups_pick) : il choisit où est la bille, prélève la mise
   et paie le gain (x1,25) ; le navigateur ne fait que montrer le mélange et envoyer le gobelet choisi.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), api/_games.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 12, HZ = 9, H = 5.2;
  var MIN_BET = 10, MAX_BET = 250, MULT = 1.25, CHIPS = [10, 25, 50, 100, 250];
  var TABLES = [{ x: -8.25, z: -3 }, { x: -2.75, z: -3 }, { x: 2.75, z: -3 }, { x: 8.25, z: -3 }];
  var SLOT = [-0.45, 0, 0.45];           // les trois emplacements des gobelets sur la table
  var TOP_Y = 0.86, CUP_Z = -0.45, T_R = 1.35, T_CUT = 0.9;         // les gobelets sont posés vers le bord du fond de la table

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function sg(payload) {
    try { if (typeof serverGame === 'function') return Promise.resolve(serverGame(payload)).catch(function () { return { ok: false, error: 'Réseau indisponible.' }; }); } catch (e) { /* ok */ }
    return Promise.resolve({ ok: false, error: 'Serveur indisponible.' });
  }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function createCupsRoom(world) {
    var low = world.low;
    var room = { title: '🥤 GOBELETS', subtitle: 'TROUVE LA BILLE', topic: 'flambeurs-cups-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- salle : parquet en bois, boiseries bleu nuit à lattes et filets de laiton, tapis de jeu vert sous les tables --- */
    // parquet remplacé par un sol de marbre sombre à grands carreaux, veiné, avec des joints et des losanges dorés
    var fc = mkCanvas(1024, 1024), fx = fc.getContext('2d'), tx, ty, vi;
    for (ty = 0; ty < 2; ty++) for (tx = 0; tx < 2; tx++) {
      var ox = tx * 512, oy = ty * 512;
      fx.fillStyle = (tx + ty) % 2 ? '#1d2a38' : '#16212d'; fx.fillRect(ox, oy, 512, 512);
      var tg = fx.createLinearGradient(ox, oy, ox + 512, oy + 512); tg.addColorStop(0, 'rgba(255,255,255,0.07)'); tg.addColorStop(0.5, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(0,0,0,0.12)');
      fx.fillStyle = tg; fx.fillRect(ox, oy, 512, 512);
      for (vi = 0; vi < 16; vi++) {
        var vx = ox + Math.random() * 512, vy = oy + Math.random() * 512;
        fx.strokeStyle = vi % 5 === 0 ? 'rgba(201,162,39,0.10)' : 'rgba(255,255,255,' + (0.04 + Math.random() * 0.08) + ')'; fx.lineWidth = 0.8 + Math.random() * 1.4;
        fx.beginPath(); fx.moveTo(vx, vy); fx.bezierCurveTo(vx + 80 - Math.random() * 160, vy + 40 + Math.random() * 120, vx + 80 - Math.random() * 160, vy + 120 + Math.random() * 160, vx + 120 - Math.random() * 240, vy + 200 + Math.random() * 200); fx.stroke();
      }
    }
    fx.fillStyle = '#c9a227';
    for (ty = 0; ty < 3; ty++) fx.fillRect(0, ty * 512 - 3, 1024, 6);
    for (tx = 0; tx < 3; tx++) fx.fillRect(tx * 512 - 3, 0, 6, 1024);
    for (ty = 0; ty < 3; ty++) for (tx = 0; tx < 3; tx++) { fx.save(); fx.translate(tx * 512, ty * 512); fx.rotate(Math.PI / 4); fx.fillStyle = '#e8c75a'; fx.fillRect(-11, -11, 22, 22); fx.fillStyle = '#16212d'; fx.fillRect(-6, -6, 12, 12); fx.restore(); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 4, HZ * 2 / 4); ft.anisotropy = 16;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'); wx.fillStyle = '#10222e'; wx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 4; i++) {
      var lx = i * 64, lg = wx.createLinearGradient(lx, 0, lx + 64, 0); lg.addColorStop(0, '#0b1821'); lg.addColorStop(0.5, '#183746'); lg.addColorStop(1, '#0b1821'); wx.fillStyle = lg; wx.fillRect(lx + 3, 0, 58, 256);
      wx.strokeStyle = 'rgba(224,186,92,0.55)'; wx.lineWidth = 2; wx.beginPath(); wx.moveTo(lx + 1.5, 0); wx.lineTo(lx + 1.5, 256); wx.stroke();
    }
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 16;
    function wall(len, px, pz, ry) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.0, H / 2.4); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.1 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    // lambris de noyer le long des murs
    [[HX * 2, 0, -HZ + 0.04, 0], [HX - 1.35, -(HX + 1.35) / 2, HZ - 0.04, Math.PI], [HX - 1.35, (HX + 1.35) / 2, HZ - 0.04, Math.PI], [HZ * 2, -HX + 0.04, 0, Math.PI / 2], [HZ * 2, HX - 0.04, 0, -Math.PI / 2]].forEach(function (d) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(d[0], 1.2), new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.5, metalness: 0.15 })); m.position.set(d[1], 0.6, d[2]); m.rotation.y = d[3]; g.add(m);
    });
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }), woodM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.55, metalness: 0.2 });
    [[HX * 2, 0.12, 0.1, 0, 1.2, -HZ + 0.05], [HX - 1.35, 0.12, 0.1, -(HX + 1.35) / 2, 1.2, HZ - 0.05], [HX - 1.35, 0.12, 0.1, (HX + 1.35) / 2, 1.2, HZ - 0.05], [0.1, 0.12, HZ * 2, -HX + 0.05, 1.2, 0], [0.1, 0.12, HZ * 2, HX - 0.05, 1.2, 0], [HX * 2, 0.2, 0.2, 0, H - 0.1, -HZ + 0.1], [HX * 2, 0.2, 0.2, 0, H - 0.1, HZ - 0.1], [0.2, 0.2, HZ * 2, -HX + 0.1, H - 0.1, 0], [0.2, 0.2, HZ * 2, HX - 0.1, H - 0.1, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x080d12 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    // enseigne
    var sc0 = mkCanvas(1024, 256), sx = sc0.getContext('2d'); sx.fillStyle = '#0a1820'; sx.fillRect(0, 0, 1024, 256); sx.strokeStyle = '#ffe08a'; sx.lineWidth = 10; sx.strokeRect(10, 10, 1004, 236);
    sx.shadowColor = '#ffb347'; sx.shadowBlur = 26; sx.fillStyle = '#ffe9b0'; sx.font = '900 140px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('GOBELETS', 512, 134, 960);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: mkTex(sc0) })); sign.position.set(0, 3.5, -HZ + 0.07); g.add(sign);
    var tip = mkCanvas(1024, 150), tx2 = tip.getContext('2d'); tx2.fillStyle = '#0a1820'; tx2.fillRect(0, 0, 1024, 150); tx2.strokeStyle = '#ffe08a'; tx2.lineWidth = 6; tx2.strokeRect(6, 6, 1012, 138);
    tx2.fillStyle = '#ffe9b0'; tx2.font = '800 52px ' + SERIF; tx2.textAlign = 'center'; tx2.textBaseline = 'middle'; tx2.fillText('Trouve la bille : gain x1,25 · mise de 10 à 250 €', 512, 80, 960);
    var tipM = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.94), new THREE.MeshBasicMaterial({ map: mkTex(tip) })); tipM.position.set(0, 2.0, -HZ + 0.07); g.add(tipM);

    /* --- tables, fauteuils, gobelets --- */
    var cupM = new THREE.MeshStandardMaterial({ color: 0xd4202a, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide }), rimM = new THREE.MeshStandardMaterial({ color: 0xf6f0e0, roughness: 0.3 });
    var ballM = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.2, metalness: 0.9, emissive: 0x553300 });
    var velvetM = new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.75, side: THREE.DoubleSide }), velvetD = new THREE.MeshStandardMaterial({ color: 0x5c0a16, roughness: 0.8, side: THREE.DoubleSide });
    var leatherM = new THREE.MeshStandardMaterial({ color: 0x6b1020, roughness: 0.45, metalness: 0.1 });
    // gobelet retourné : coque évasée vers le bas, bord crème, deux filets dorés (centré sur sa mi-hauteur)
    var cupGeo = new THREE.LatheGeometry([[0.150, -0.12], [0.147, -0.10], [0.140, -0.07], [0.126, 0.0], [0.112, 0.07], [0.102, 0.105], [0.098, 0.118], [0.08, 0.124], [0.04, 0.126], [0.001, 0.126]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 28);
    var cupBand1 = new THREE.TorusGeometry(0.136, 0.008, 6, 28), cupBand2 = new THREE.TorusGeometry(0.109, 0.006, 6, 28), cupLip = new THREE.TorusGeometry(0.148, 0.009, 6, 28), ballGeo = new THREE.SphereGeometry(0.05, 16, 12);
    var tables = [], seats = [], timers = [], clockT = 0;
    function later(sec, fn) { timers.push({ t: sec, fn: fn }); }
    function cyl(p, rt, rb, h, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), m); o.position.set(x, y, z); p.add(o); return o; }
    function lathe(p, pts, m, seg) { var o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), seg || 32), m); p.add(o); return o; }
    // tapis rond sous chaque table : bleu nuit, deux filets dorés
    var rc = mkCanvas(512, 512), rx = rc.getContext('2d'), rg = rx.createRadialGradient(256, 256, 20, 256, 256, 256);
    rg.addColorStop(0, '#173f52'); rg.addColorStop(0.8, '#0c2230'); rg.addColorStop(1, '#091823'); rx.fillStyle = rg; rx.fillRect(0, 0, 512, 512);
    rx.strokeStyle = '#d9b441'; rx.lineWidth = 7; rx.beginPath(); rx.arc(256, 256, 236, 0, TAU); rx.stroke(); rx.lineWidth = 3; rx.beginPath(); rx.arc(256, 256, 222, 0, TAU); rx.stroke();
    rx.strokeStyle = 'rgba(217,180,65,0.45)'; rx.lineWidth = 2; rx.setLineDash([10, 10]); rx.beginPath(); rx.arc(256, 256, 190, 0, TAU); rx.stroke(); rx.setLineDash([]);
    var rugMat = new THREE.MeshStandardMaterial({ map: mkTex(rc), roughness: 0.9 });
    // feutre du plateau : filets dorés qui suivent le bord, trois cercles à l'emplacement des gobelets, inscription lisible côté joueur
    function feltTexture() {
      var S = 1024, cv = mkCanvas(S, S), c = cv.getContext('2d'), k = S / (T_R * 2), h = S / 2, n;
      var gr = c.createRadialGradient(h, h, 40, h, h, S * 0.5); gr.addColorStop(0, '#18804f'); gr.addColorStop(1, '#0b4a30'); c.fillStyle = gr; c.fillRect(0, 0, S, S);
      for (n = 0; n < 9000; n++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; c.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
      function loop(r, cutY) { var a = Math.asin(cutY / r); c.beginPath(); c.arc(h, h, r * k, -a, Math.PI + a, false); c.closePath(); c.stroke(); }
      c.strokeStyle = '#e8c75a'; c.lineWidth = 6; loop(T_R - 0.1, T_CUT - 0.1); c.lineWidth = 2.5; loop(T_R - 0.17, T_CUT - 0.17);
      c.strokeStyle = 'rgba(232,199,90,0.8)'; c.lineWidth = 3;
      for (n = 0; n < 3; n++) { c.beginPath(); c.arc(h + SLOT[n] * k, h + CUP_Z * k, 0.175 * k, 0, TAU); c.stroke(); }
      c.fillStyle = 'rgba(232,199,90,0.9)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 54px ' + SERIF; c.fillText('GOBELETS', h, h + 0.82 * k);
      c.font = '700 40px ' + SERIF; c.fillText('♠    ♦    ♥    ♣', h, h + 0.5 * k);
      var t = new THREE.CanvasTexture(cv); t.flipY = false; t.anisotropy = 16; t.repeat.set(1 / (T_R * 2), 1 / (T_R * 2)); t.offset.set(0.5, 0.5); return t;
    }
    var feltTop = new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.92, metalness: 0 });
    // fauteuil capitonné (même modèle que le blackjack) : pied doré, assise de velours, dossier enveloppant dont l'arc doré suit le dos
    function makeChair(parent, x, z, ry) {
      var q = new THREE.Group(); q.position.set(x, 0, z); q.rotation.y = ry; parent.add(q);
      var seatY = 0.6, bh = 0.52, by = seatY + 0.06 + bh / 2;
      cyl(q, 0.27, 0.3, 0.035, gold, 0, 0.0175, 0, 24); cyl(q, 0.045, 0.06, seatY - 0.12, gold, 0, (seatY - 0.12) / 2 + 0.035, 0, 12);
      cyl(q, 0.25, 0.25, 0.11, velvetM, 0, seatY, 0, 28);
      var back = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, bh, 28, 1, true, Math.PI - 1.15, 2.3), velvetM); back.position.set(0, by, 0); q.add(back);
      var back2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, bh + 0.04, 28, 1, true, Math.PI - 1.17, 2.34), velvetD); back2.position.set(0, by, 0); q.add(back2);
      [-1, 1].forEach(function (sd) { cyl(q, 0.016, 0.016, bh + 0.06, gold, sd * Math.sin(1.15) * 0.3, by, Math.cos(Math.PI - 1.15) * 0.3, 8); });
      var top = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.014, 8, 28, 2.3), gold); top.rotation.x = Math.PI / 2; top.rotation.z = -Math.PI / 2 - 1.15; top.position.y = by + bh / 2 + 0.02; q.add(top);
      return q;
    }
    var xc = Math.sqrt(T_R * T_R - T_CUT * T_CUT), a0 = Math.asin(T_CUT / T_R);
    TABLES.forEach(function (td, ti) {
      var grp = new THREE.Group(); grp.position.set(td.x, 0, td.z); g.add(grp);
      var rug = new THREE.Mesh(new THREE.CircleGeometry(2.7, 48), rugMat); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, 0.3); grp.add(rug);
      // plateau rond dont le dos est coupé droit : le croupier se tient derrière ce bord, jamais dans la table
      var dS = new THREE.Shape(); dS.moveTo(-xc, -T_CUT); dS.lineTo(xc, -T_CUT); dS.absarc(0, 0, T_R, -a0, Math.PI + a0, false); dS.lineTo(-xc, -T_CUT);
      var top = new THREE.Mesh(new THREE.ExtrudeGeometry(dS, { depth: 0.12, bevelEnabled: false, curveSegments: 48 }), [feltTop, woodM]); top.rotation.x = Math.PI / 2; top.position.y = TOP_Y; grp.add(top);
      var outline = [], u;
      for (u = 0; u <= 64; u++) { var an = -a0 + u / 64 * (Math.PI + 2 * a0); outline.push(new THREE.Vector3(Math.cos(an) * T_R, 0, Math.sin(an) * T_R)); }
      for (u = 1; u < 12; u++) outline.push(new THREE.Vector3(-xc + u / 12 * xc * 2, 0, -T_CUT));
      function tube(y, rad, m) { var path = new THREE.CatmullRomCurve3(outline.map(function (v) { return v.clone().setY(y); }), true, 'centripetal'); var o = new THREE.Mesh(new THREE.TubeGeometry(path, 240, rad, 10, true), m); grp.add(o); return o; }
      tube(TOP_Y + 0.01, 0.07, leatherM); tube(TOP_Y + 0.072, 0.011, gold); tube(TOP_Y - 0.1, 0.014, gold);
      // pied tourné en bois sombre, bagues dorées, large socle
      lathe(grp, [[0.001, 0.0], [0.5, 0.0], [0.52, 0.03], [0.46, 0.07], [0.3, 0.12], [0.2, 0.22], [0.16, 0.4], [0.2, 0.55], [0.27, 0.66], [0.3, 0.72], [0.001, 0.74]], woodM, 36).material.side = THREE.DoubleSide;
      [[0.5, 0.03, 0.03], [0.2, 0.22, 0.025], [0.28, 0.66, 0.025]].forEach(function (d) { var t = new THREE.Mesh(new THREE.TorusGeometry(d[0], d[2], 8, 36), gold); t.rotation.x = Math.PI / 2; t.position.y = d[1]; grp.add(t); });
      // lampe suspendue
      var lamp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.36, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide })); lamp.position.set(0, H - 1.5, 0); grp.add(lamp);
      var lrim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 6, 28), gold); lrim.rotation.x = Math.PI / 2; lrim.position.set(0, H - 1.68, 0); grp.add(lrim);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe9b0 })); bulb.position.set(0, H - 1.62, 0); grp.add(bulb);
      cyl(grp, 0.012, 0.012, 1.4, new THREE.MeshBasicMaterial({ color: 0x222222 }), 0, H - 0.7, 0, 6);
      var T = { i: ti, x: td.x, z: td.z, group: grp, cups: [], pos: [0, 1, 2], phase: 'idle', ballCup: 0, cupMeshes: [] };
      for (var c = 0; c < 3; c++) {
        var cg = new THREE.Group(); cg.position.set(SLOT[c], TOP_Y, CUP_Z); grp.add(cg);
        var mesh = new THREE.Mesh(cupGeo, cupM); mesh.position.y = 0.12; cg.add(mesh); mesh.userData.cup = { t: ti, id: c };
        var b1 = new THREE.Mesh(cupBand1, gold); b1.rotation.x = Math.PI / 2; b1.position.y = -0.03; mesh.add(b1);
        var b2 = new THREE.Mesh(cupBand2, gold); b2.rotation.x = Math.PI / 2; b2.position.y = 0.085; mesh.add(b2);
        var lip = new THREE.Mesh(cupLip, rimM); lip.rotation.x = Math.PI / 2; lip.position.y = -0.112; mesh.add(lip);      // les filets et le bord suivent le gobelet quand il se lève
        var ball = new THREE.Mesh(ballGeo, ballM); ball.position.set(0, 0.05, 0); ball.visible = false; cg.add(ball);
        T.cups.push({ g: cg, mesh: mesh, ball: ball, lift: 0, liftTo: 0, id: c });
        T.cupMeshes.push(mesh);
      }
      tables.push(T);
      room.colliders.push({ x: td.x, z: td.z, r: 1.45 });
      T.auto = true; T.demoWait = 2 + ti * 1.7;                  // pas de croupier visible : des mains invisibles font bouger les gobelets
      room.colliders.push({ x: td.x, z: td.z - 1.1, r: 0.4 });     // personne ne se glisse derrière la table
      // fauteuil face à la table, assez loin du bord pour que le joueur ne rentre pas dedans
      var sx0 = td.x, sz0 = td.z + 1.9, s = { n: ti, x: sx0, z: sz0, yaw: 0, tx: td.x, tz: td.z, table: T, sx: td.x, sz: td.z + 2.9 };
      seats.push(s);
      makeChair(g, sx0, sz0, Math.PI);
      room.colliders.push({ x: sx0, z: sz0, r: 0.3 });
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sx0, 0.7, sz0); g.add(hit);
      room.interactables.push({ hit: hit, x: sx0, z: sz0, radius: 1.5, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🪑 S\'asseoir — Table ' + (ti + 1); }, use: function (w) { sit(w, s); } });
    });
    var lampLight = low ? null : [-8.25, -2.75, 2.75, 8.25].forEach(function (x) { var pl = new THREE.PointLight(0xffd9a0, 0.8, 9); pl.position.set(x, 3.2, -2.4); g.add(pl); });

    /* --- la partie --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, bet = 50, hover = -1;
    var R = { busy: false, msg: '' };
    function seatTaken(s) { var now = performance.now(); return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; }); }
    function slotX(T, c) { return SLOT[T.pos[c]]; }
    function setMsg(t, col) { R.msg = t; if (ui) { var m = ui.el.querySelector('.cp-msg'); m.textContent = t || ''; m.style.color = col || ''; } }
    function refreshUi() {
      if (!ui || !seat) return;
      var T = seat.table, idle = T.phase === 'idle' && !R.busy;
      ui.el.querySelector('.cp-bal b').textContent = fmtN(balance()) + ' 🪙'; ui.el.querySelector('.cp-bet b').textContent = fmtN(bet) + ' 🪙 → ' + fmtN(Math.floor(bet * MULT)) + ' 🪙';
      ui.el.querySelector('.cp-chips').style.display = idle ? '' : 'none'; ui.el.querySelector('[data-a=go]').style.display = idle ? '' : 'none';
    }
    function liftAll(T, on) { T.cups.forEach(function (c) { c.liftTo = on ? 0.34 : 0; }); }
    function startGame() {
      var T = seat && seat.table; if (!T || T.phase !== 'idle' || R.busy) return;
      if (!loggedIn()) { setMsg('Connecte-toi pour jouer aux gobelets.', '#ff8a80'); return; }
      if (bet < MIN_BET || bet > MAX_BET) { setMsg('Mise entre ' + MIN_BET + ' et ' + MAX_BET + ' 🪙.', '#ff8a80'); return; }
      if (bet > balance()) { setMsg('Solde insuffisant pour cette mise.', '#ff8a80'); return; }
      R.busy = true; setMsg('Mise en place…'); refreshUi();
      sg({ action: 'cups_start', bet: bet }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Impossible de lancer la partie.', '#ff8a80'); refreshUi(); return; }
        T.pos = [0, 1, 2]; T.cups.forEach(function (c, k) { c.g.position.x = SLOT[k]; c.ball.visible = false; });
        T.ballCup = r.ballCup; T.cups[r.ballCup].ball.visible = true; T.phase = 'show';
        setMsg('Regarde bien où est la bille…'); refreshUi();
        liftAll(T, true);
        later(1.6, function () { liftAll(T, false); later(0.6, function () { shuffle(T); }); });
      });
    }
    // mélange : une trentaine de permutations rapides, la dernière position de chaque gobelet est ce que le joueur voit
    function shuffle(T) {
      T.phase = 'shuffle'; setMsg('Ça mélange…'); refreshUi();
      var swaps = 15, k;
      T.sw = [];
      for (k = 0; k < swaps; k++) { var a = Math.floor(Math.random() * 3), b; do { b = Math.floor(Math.random() * 3); } while (b === a); T.sw.push([a, b]); }
      T.swI = -1; T.swT = 0; T.swDur = 0.2; T.cur = null;
    }
    function stepSwap(T, dt) {
      if (T.phase !== 'shuffle' && T.phase !== 'demo') return;
      if (!T.cur) {
        T.swI++; if (T.swI >= T.sw.length) { if (T.phase === 'demo') { T.phase = 'idle'; T.demoWait = 3 + Math.random() * 4; return; } T.phase = 'pick'; setMsg('Clique sur le gobelet qui cache la bille.'); refreshUi(); return; }
        var pa = T.sw[T.swI][0], pb = T.sw[T.swI][1], ca = T.pos.indexOf(pa), cb = T.pos.indexOf(pb);           // gobelets qui occupent les emplacements pa et pb
        T.cur = { ca: ca, cb: cb, pa: pa, pb: pb, t: 0 };
      }
      var s = T.cur; s.t += dt; var u = Math.min(1, s.t / T.swDur), e = u * u * (3 - 2 * u), arc = Math.sin(u * Math.PI) * 0.2;
      T.cups[s.ca].g.position.x = SLOT[s.pa] + (SLOT[s.pb] - SLOT[s.pa]) * e; T.cups[s.ca].g.position.z = CUP_Z + arc;
      T.cups[s.cb].g.position.x = SLOT[s.pb] + (SLOT[s.pa] - SLOT[s.pb]) * e; T.cups[s.cb].g.position.z = CUP_Z - arc;
      if (u >= 1) { T.pos[s.ca] = s.pb; T.pos[s.cb] = s.pa; T.cups[s.ca].g.position.z = CUP_Z; T.cups[s.cb].g.position.z = CUP_Z; T.cur = null; }
    }
    function pick(T, id) {
      if (T.phase !== 'pick' || R.busy) return;
      R.busy = true; T.phase = 'result'; setMsg('…'); refreshUi();
      sg({ action: 'cups_pick', cup: id }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { T.phase = 'pick'; setMsg((r && r.error) || 'Choix impossible.', '#ff8a80'); refreshUi(); return; }
        liftAll(T, true); T.cups[r.ballCup !== undefined ? r.ballCup : T.ballCup].ball.visible = true;
        if (r.correct) setMsg('🏆 Trouvé ! +' + fmtN(r.win) + ' 🪙', '#7ee0a0'); else setMsg('Raté… la bille était sous un autre gobelet.', '#ff8a80');
        refreshUi();
        later(3.5, function () { liftAll(T, false); T.cups.forEach(function (c) { c.ball.visible = false; }); later(0.5, function () { T.phase = 'idle'; T.pos = [0, 1, 2]; T.cups.forEach(function (c, k) { c.g.position.x = SLOT[k]; }); setMsg('Place ta mise puis lance la partie.'); refreshUi(); }); });
      });
    }

    /* --- s'asseoir / se lever, interface --- */
    function injectCss() {
      if (document.getElementById('cp3d-css')) return;
      var s = document.createElement('style'); s.id = 'cp3d-css';
      s.textContent = '.cp3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(520px,92%);background:rgba(8,5,12,.9);border:1px solid rgba(255,224,138,.6);border-radius:16px;padding:12px 14px;color:#ffe9b0;pointer-events:auto;display:flex;flex-direction:column;gap:8px;z-index:5}' +
        '.cp3d .cp-top{display:flex;justify-content:space-between;font-weight:800;font-size:13px}.cp3d .cp-msg{min-height:20px;text-align:center;font-weight:800;font-size:15px}' +
        '.cp3d .cp-chips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.cp3d .cp-chip{padding:6px 11px;border-radius:999px;border:2px solid #ffe08a;background:#241218;color:#ffe08a;font-weight:900;font-size:13px;cursor:pointer}' +
        '.cp3d .cp-chip.minus{border-color:#ff8a80;color:#ff8a80}.cp3d .cp-b{padding:10px 22px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00);align-self:center}' +
        '.cp3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.cp3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(255,224,138,.6);background:rgba(8,5,12,.85);color:#ffe9b0;font-weight:800;cursor:pointer}';
      s.textContent += '@media (max-height:520px){.cp3d{bottom:62px;width:min(520px,66%);padding:5px 8px}.cp3d .cp-msg{font-size:12px;min-height:14px}.cp3d .cp-chip{padding:3px 8px;font-size:11px}.cp3d .cp-b{padding:6px 14px;font-size:12px}.cp3d-stand{bottom:auto;top:64px}}';
      document.head.appendChild(s);
    }
    var standEl = null;
    function onSeatKey(e) { if (seat && (e.code === 'Escape' || e.code === 'KeyF')) { e.stopImmediatePropagation(); e.preventDefault(); stand(); } }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0; R.busy = false; s.table.phase = 'idle'; s.table.cur = null; s.table.demoWait = 3; s.table.pos = [0, 1, 2]; s.table.cups.forEach(function (c, k) { c.g.position.set(SLOT[k], TOP_Y, CUP_Z); });
      injectCss();
      var el = document.createElement('div'); el.className = 'cp3d';
      el.innerHTML = '<div class="cp-top"><span class="cp-bal">Solde : <b></b></span><span class="cp-bet">Mise : <b></b></span></div><div class="cp-msg"></div>' +
        '<div class="cp-chips">' + CHIPS.map(function (c) { return '<button class="cp-chip" data-c="' + c + '">+' + c + '</button>'; }).join('') + '<button class="cp-chip minus" data-c="-1">Effacer</button></div><button class="cp-b" data-a="go">Lancer la partie</button>';
      w.container.appendChild(el); ui = { el: el };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.c) { if (seat.table.phase !== 'idle' || R.busy) return; bet = b.dataset.c === '-1' ? MIN_BET : bet + parseInt(b.dataset.c, 10); bet = Math.max(MIN_BET, Math.min(MAX_BET, bet)); refreshUi(); return; }
        if (b.dataset.a === 'go') startGame();
      });
      standEl = document.createElement('div'); standEl.className = 'cp3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
      setMsg(loggedIn() ? 'Place ta mise puis lance la partie.' : 'Connecte-toi pour jouer.'); refreshUi();
    }
    function stand() {
      if (!seat) return;
      var s = seat; seat = null; timers = [];
      var T = s.table; T.phase = 'idle'; T.demoWait = 3; T.cur = null; T.pos = [0, 1, 2]; T.cups.forEach(function (c, k) { c.g.position.set(SLOT[k], TOP_Y, CUP_Z); c.liftTo = 0; c.lift = 0; c.mesh.position.y = 0.12; c.ball.visible = false; });
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.tables = tables;
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.155, z: 0.28 };
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-0.6, Math.min(0.6, drag.seat.yaw - dx * 0.005)); if (drag.mouse) view.pitch = Math.max(-0.3, Math.min(0.3, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.5; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.2; }
      var ex = s.x, ey = 1.55, ez = s.z - 0.3, a = view.yaw, p = Math.atan2(TOP_Y + 0.1 - ey, 1.5) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 55 };
    };
    // clic sur un gobelet pendant la phase de choix
    room.seatClick = function (ray) {
      if (!seat) return;
      var hit = ray.intersectObjects(seat.table.cupMeshes, false)[0];
      if (hit && hit.object.userData.cup) pick(seat.table, hit.object.userData.cup.id);
    };
    room.syncHud = function () { refreshUi(); };

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffe08a, target: 'hall', theme: 'exitCups' });
    g.add(new THREE.AmbientLight(0xfff0dc, 0.9));
    var key = new THREE.DirectionalLight(0xfff0e0, 0.4); key.position.set(3, 8, 5); g.add(key);
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un tabouret pour t\'asseoir' : 'ZQSD / flèches : marcher · Maj : courir · avance vers un tabouret (F ou clic) · assis : mise, Lancer, puis clique sur un gobelet · F : se lever'; };
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      clockT += dt;
      for (i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { if (window.console) console.warn('[cups3d]', e); } } }
      tables.forEach(function (T) {
        if (T.phase === 'idle' && !(seat && seat.table === T) && T.auto) {
          T.demoWait -= dt;
          if (T.demoWait <= 0) {
            T.sw = []; for (var q = 0; q < 6; q++) { var a1 = Math.floor(Math.random() * 3), b1; do { b1 = Math.floor(Math.random() * 3); } while (b1 === a1); T.sw.push([a1, b1]); }
            T.phase = 'demo'; T.swI = -1; T.swT = 0; T.swDur = 0.28; T.cur = null; T.demoWait = 99;
          }
        }
        stepSwap(T, dt);
        T.cups.forEach(function (c) { c.lift += (c.liftTo - c.lift) * Math.min(1, dt * 9); c.mesh.position.y = 0.12 + c.lift; });
      });
    };
    room.dispose = function () { stand(); };
    return room;
  }

  F.registerRoom('cups', createCupsRoom);
})();
