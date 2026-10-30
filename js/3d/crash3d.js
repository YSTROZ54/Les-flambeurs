/* =====================================================================
   crash3d.js — La salle de la Fusée Crash (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « FUSÉE CRASH » du hall (hall3d.js) et on en ressort vers le hall.
   Un centre de contrôle : cinq postes face à une tour de lancement vitrée où monte la fusée, et un grand écran avec le décompte, le
   multiplicateur, la courbe, l'historique et les mises des joueurs. Les postes sont à nous (F ou clic pour s'asseoir).
   Le jeu est le même que le Crash du menu et il est partagé avec tous les joueurs (api/crash.js) : le serveur tire le point de crash,
   calcule le multiplicateur avec son horloge, prélève les mises et paie les gains. Ici on ne fait que miser, annuler avant le décollage
   et s'éjecter ; dès que quelqu'un a misé, le décollage se lance tout seul (compte à rebours de 7 s pour laisser les autres miser).
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), api/crash.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 14, HZ = 10, H = 6.4;
  var GROWTH = 0.15, MIN_BET = 10, MAX_BET = 100000, CHIPS = [10, 100, 500, 1000, 5000];
  var SILO = { x: -11.2, z: -5.2, h: 5.6 }, SILO2 = { x: 11.2, z: -5.2 };      // les deux tours encadrent l'écran : plus rien ne le cache
  var SEATS_X = [-5.6, -2.8, 0, 2.8, 5.6];

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function myName() { try { return (st().username || '').toLowerCase().trim(); } catch (e) { return ''; } }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function setBalance(b) {
    if (typeof b !== 'number') return;
    try { var s = st(); s.balance = b; s.lastBalanceChange = Date.now(); if (typeof saveState === 'function') saveState(); if (typeof updateGlobalUI === 'function') updateGlobalUI(); } catch (e) { /* ok */ }
  }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function createCrashRoom(world) {
    var low = world.low;
    var room = { title: '🚀 FUSÉE CRASH', subtitle: 'ÉJECTE-TOI À TEMPS', topic: 'flambeurs-crash-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- salle : sol métallique quadrillé, murs bleu nuit à bandes lumineuses --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'), fg = fx.createLinearGradient(0, 0, 256, 256); fg.addColorStop(0, '#141b30'); fg.addColorStop(1, '#0c1222'); fx.fillStyle = fg; fx.fillRect(0, 0, 256, 256);
    fx.strokeStyle = 'rgba(110,160,255,0.35)'; fx.lineWidth = 3; fx.strokeRect(2, 2, 252, 252); fx.strokeStyle = 'rgba(110,160,255,0.12)'; fx.beginPath(); fx.moveTo(128, 0); fx.lineTo(128, 256); fx.moveTo(0, 128); fx.lineTo(256, 128); fx.stroke();
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.35, metalness: 0.6 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'), wg = wx.createLinearGradient(0, 0, 0, 256); wg.addColorStop(0, '#0b1430'); wg.addColorStop(1, '#16224a'); wx.fillStyle = wg; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(120,170,255,0.3)'; wx.lineWidth = 3; wx.strokeRect(16, 20, 224, 216); wx.strokeStyle = 'rgba(120,170,255,0.12)'; wx.strokeRect(30, 34, 196, 188);
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 4;
    function wall(len, px, pz, ry) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 3, H / 3); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.2 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var glow = new THREE.MeshBasicMaterial({ color: 0x4d8bff });
    var YB = 0.05, YT = H - 0.05, DX = 1.8, DT = 4.4;                      // néon du bas (sol/mur) et du haut (plafond/mur) ; DX, DT : tour de la porte
    function rail(x, y, z, lx, ly, lz) { box(g, lx, ly, lz, glow, x, y, z); }
    [YB, YT].forEach(function (y) { rail(0, y, -HZ + 0.04, HX * 2, 0.07, 0.07); rail(-HX + 0.04, y, 0, 0.07, 0.07, HZ * 2); rail(HX - 0.04, y, 0, 0.07, 0.07, HZ * 2); });
    rail(0, YT, HZ - 0.04, HX * 2, 0.07, 0.07);
    rail(-(HX + DX) / 2, YB, HZ - 0.04, HX - DX, 0.07, 0.07); rail((HX + DX) / 2, YB, HZ - 0.04, HX - DX, 0.07, 0.07);   // mur de la porte : le néon du bas monte le long du cadre, passe au-dessus et redescend
    [-DX, DX].forEach(function (x) { rail(x, DT / 2, HZ - 0.04, 0.07, DT, 0.07); }); rail(0, DT, HZ - 0.04, DX * 2, 0.07, 0.07);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x050812 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    for (i = -3; i <= 3; i++) box(g, 0.2, 0.08, HZ * 2 - 2, new THREE.MeshBasicMaterial({ color: 0xbfd7ff }), i * 4.2, H - 0.04, 0);

    /* --- tour de lancement vitrée et fusée --- */
    var steel = new THREE.MeshStandardMaterial({ color: 0x8c96ac, roughness: 0.35, metalness: 0.85 });
    function buildTower(cx, cz) {
    var pad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 0.2, 32), steel); pad.position.set(cx, 0.1, cz); g.add(pad);
    var glass = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, SILO.h, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set(cx, SILO.h / 2 + 0.2, cz); g.add(glass);
    for (i = 0; i <= 5; i++) { var ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.035, 8, 40), steel); ring.rotation.x = Math.PI / 2; ring.position.set(cx, 0.25 + i * (SILO.h / 5), cz); g.add(ring); }
    for (i = 0; i < 6; i++) { var a = i / 6 * TAU, bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, SILO.h, 6), steel); bar.position.set(cx + Math.cos(a) * 1.15, SILO.h / 2 + 0.2, cz + Math.sin(a) * 1.15); g.add(bar); }
    }
    buildTower(SILO.x, SILO.z); buildTower(SILO2.x, SILO2.z);
    function buildRocket(rocket) {
      var white = new THREE.MeshStandardMaterial({ color: 0xf2f4fa, roughness: 0.3, metalness: 0.5 }), red = new THREE.MeshStandardMaterial({ color: 0xd9262c, roughness: 0.4, metalness: 0.3 });
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.0, 20), white); body.position.y = 0.7; rocket.add(body);
      var nose = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 20), red); nose.position.y = 1.45; rocket.add(nose);
      var win = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ color: 0x4aa3ff, emissive: 0x16406e, roughness: 0.2 })); win.position.set(0, 0.95, 0.22); rocket.add(win);
      for (var k = 0; k < 3; k++) { var an = k / 3 * TAU, fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.32), red); fin.position.set(Math.cos(an) * 0.3, 0.38, Math.sin(an) * 0.3); fin.rotation.y = -an; rocket.add(fin); }
      var flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 14), new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); flame.rotation.x = Math.PI; flame.position.y = -0.05; rocket.add(flame); rocket.userData.flame = flame;
    }
    var rocket = new THREE.Group(); g.add(rocket); buildRocket(rocket);
    var rocket2 = new THREE.Group(); g.add(rocket2); buildRocket(rocket2);      // la fusée de la tour de droite suit exactement celle de gauche
    rocket.position.set(SILO.x, 0.2, SILO.z); rocket2.position.set(SILO2.x, 0.2, SILO2.z);
    var boom = null, debris = [];
    var haloC = mkCanvas(128, 128), hx = haloC.getContext('2d'), hg = hx.createRadialGradient(64, 64, 2, 64, 64, 62); hg.addColorStop(0, 'rgba(255,255,220,1)'); hg.addColorStop(0.3, 'rgba(255,170,60,0.8)'); hg.addColorStop(1, 'rgba(255,90,20,0)'); hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
    boom = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(haloC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); boom.visible = false; g.add(boom);
    var boom2 = new THREE.Sprite(boom.material.clone()); boom2.visible = false; g.add(boom2);
    var debMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
    for (i = 0; i < 16; i++) { var d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), debMat); d.visible = false; g.add(d); debris.push({ m: d, v: new THREE.Vector3() }); }
    var pl = low ? null : new THREE.PointLight(0xffa850, 0, 10); if (pl) { pl.position.set(SILO.x, 1.5, SILO.z); g.add(pl); }

    /* --- grand écran sur le mur du fond --- */
    var scr = mkCanvas(1920, 640), sctx = scr.getContext('2d'), scrTex = mkTex(scr);
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), new THREE.MeshBasicMaterial({ map: scrTex })); screen.position.set(0, 3.3, -HZ + 0.16); g.add(screen);
    box(g, 18.3, 6.3, 0.12, new THREE.MeshStandardMaterial({ color: 0x10162a, roughness: 0.4, metalness: 0.6 }), 0, 3.3, -HZ + 0.05);

    /* --- postes de contrôle --- */
    var deskM = new THREE.MeshStandardMaterial({ color: 0x1b2440, roughness: 0.4, metalness: 0.6 }), seatM = new THREE.MeshStandardMaterial({ color: 0x1d3a8a, roughness: 0.6 }), chromeM = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.35, metalness: 0.8 });
    var seats = [], timers = [];
    function later(sec, fn) { timers.push({ t: sec, fn: fn }); }
    SEATS_X.forEach(function (sx0, k) {
      var dz = 0.9, dsk = new THREE.Group(); dsk.position.set(sx0, 0, dz); g.add(dsk);
      box(dsk, 1.9, 0.9, 0.7, deskM, 0, 0.45, 0); var tp = box(dsk, 2.0, 0.06, 0.8, chromeM, 0, 0.92, 0);
      var mon = box(dsk, 0.9, 0.04, 0.4, new THREE.MeshBasicMaterial({ color: 0x1a4cff }), 0, 0.96, 0.08); mon.rotation.x = 0.18;      // tablette de commande à plat, pour ne pas cacher la tour
      room.colliders.push({ x: sx0, z: dz, r: 0.95 });
      var seatZ = dz + 1.25, s = { n: k, x: sx0, z: seatZ, yaw: 0, tx: sx0, tz: dz, sx: sx0, sz: seatZ + 1.1 };
      seats.push(s);
      var sc = new THREE.Group(); sc.position.set(sx0, 0, seatZ); g.add(sc);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), chromeM); stem.position.y = 0.28; sc.add(stem);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 14), chromeM); base.position.y = 0.02; sc.add(base);
      var cush = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.1, 16), seatM); cush.position.y = 0.58; sc.add(cush);
      var back = box(sc, 0.5, 0.45, 0.07, seatM, 0, 0.9, 0.2);
      room.colliders.push({ x: sx0, z: seatZ, r: 0.3 });
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sx0, 0.7, seatZ); g.add(hit);
      room.interactables.push({ hit: hit, x: sx0, z: seatZ, radius: 1.5, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🪑 S\'asseoir — Poste ' + (k + 1); }, use: function (w) { sit(w, s); } });
    });

    /* --- état de la partie (lu sur le serveur) --- */
    var S = { status: 'waiting', launchTime: 0, countdownStartTime: 0, countdownDuration: 7000, crashedAtTime: 0, crashPoint: 0, history: [], bets: {}, off: 0 };
    var pollT = 0, polling = false, lastStatus = '', histPts = [];
    function nowS() { return Date.now() + S.off; }
    function multNow() { return S.status === 'flying' && S.launchTime ? Math.exp(GROWTH * Math.max(0, nowS() - S.launchTime) / 1000) : (S.status === 'crashed' ? S.crashPoint : 1); }
    function applyState(s) {
      if (!s) return;
      S.status = s.status; S.launchTime = s.launchTime || 0; S.countdownStartTime = s.countdownStartTime || 0; S.countdownDuration = s.countdownDuration || 7000; S.crashedAtTime = s.crashedAtTime || 0;
      S.crashPoint = s.crashPoint || (s.status === 'crashed' ? S.crashPoint : 0); S.history = s.history || []; S.bets = s.bets || {};
      if (typeof s.serverNow === 'number') S.off = s.serverNow - Date.now();
    }
    function poll() {
      if (polling) return; polling = true;
      fetch('/api/crash', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) { applyState(s); polling = false; }).catch(function () { polling = false; });
    }
    function api(body) {
      return world.post('/api/crash', body).then(function (r) { if (!r) return { ok: false, error: 'Connecte-toi pour jouer.' }; if (r.state) applyState(r.state); if (typeof r.balance === 'number') setBalance(r.balance); return r; });
    }
    function myBet() { var me = myName(), k = Object.keys(S.bets).filter(function (n) { return n.toLowerCase().trim() === me; })[0]; return k ? S.bets[k] : null; }

    /* --- interface --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, bet = 100, msg = '', msgCol = '', busy = false, ejecting = false;
    function seatTaken(s) { var now = performance.now(); return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; }); }
    function setMsg(t, c) { msg = t || ''; msgCol = c || ''; if (ui) { var m = ui.el.querySelector('.cr-msg'); m.textContent = msg; m.style.color = msgCol; } }
    function refreshUi() {
      if (!ui || !seat) return;
      var q = function (s) { return ui.el.querySelector(s); }, mb = myBet(), pre = S.status === 'waiting' || S.status === 'countdown', flying = S.status === 'flying';
      q('.cr-bal b').textContent = fmtN(balance()) + ' 🪙'; q('.cr-bet b').textContent = mb ? fmtN(mb.bet) + ' 🪙 misés' + (mb.cashedOut ? ' · encaissé x' + mb.cashMult : '') : fmtN(bet) + ' 🪙';
      q('.cr-chips').style.display = pre && !mb ? '' : 'none'; q('[data-a=bet]').style.display = pre && !mb ? '' : 'none';
      q('[data-a=cancel]').style.display = pre && mb ? '' : 'none';
      var eb = q('[data-a=eject]'); eb.style.display = flying && mb && !mb.cashedOut ? '' : 'none'; if (mb) eb.textContent = 'S\'ÉJECTER (+' + fmtN(Math.floor(mb.bet * multNow())) + ' 🪙)';
    }
    function injectCss() {
      if (document.getElementById('cr3d-css')) return;
      var s = document.createElement('style'); s.id = 'cr3d-css';
      s.textContent = '.cr3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(540px,92%);background:rgba(6,9,20,.92);border:1px solid rgba(110,160,255,.7);border-radius:16px;padding:12px 14px;color:#d9e6ff;pointer-events:auto;display:flex;flex-direction:column;gap:8px;z-index:5}' +
        '.cr3d .cr-top{display:flex;justify-content:space-between;font-weight:800;font-size:13px}.cr3d .cr-msg{min-height:20px;text-align:center;font-weight:800;font-size:15px}' +
        '.cr3d .cr-chips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.cr3d .cr-chip{padding:6px 11px;border-radius:999px;border:2px solid #6ea0ff;background:#0f1630;color:#9fc2ff;font-weight:900;font-size:13px;cursor:pointer}' +
        '.cr3d .cr-chip.minus{border-color:#ff8a80;color:#ff8a80}.cr3d .cr-b{padding:11px 22px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#06101e;background:linear-gradient(90deg,#4dd0ff,#3b82f6);align-self:center}' +
        '.cr3d .cr-b.red{background:linear-gradient(90deg,#ff8a50,#ef3b3b);color:#fff}.cr3d .cr-b.alt{background:#27324f;color:#d9e6ff}.cr3d .cr-b:disabled{opacity:.4}' +
        '.cr3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.cr3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(110,160,255,.6);background:rgba(6,9,20,.85);color:#d9e6ff;font-weight:800;cursor:pointer}';
      document.head.appendChild(s);
    }
    var standEl = null;
    // s'éjecter : l'écran réagit tout de suite (le gain est affiché au clic), la demande part en même temps au serveur qui confirme
    function doEject() {
      var mb = myBet();
      if (!seat || ejecting || !mb || mb.cashedOut || S.status !== 'flying') return;
      var m = multNow(); ejecting = true; mb.cashedOut = true; mb.cashMult = Math.floor(m * 100) / 100;
      setMsg('🏆 Éjecté à x' + m.toFixed(2) + ' : +' + fmtN(Math.floor(mb.bet * m)) + ' 🪙', '#7ee0a0'); refreshUi();
      api({ action: 'cashout' }).then(function (r) {
        ejecting = false;
        if (r && r.ok) setMsg('🏆 Éjecté à x' + r.mult + ' : +' + fmtN(r.win) + ' 🪙', '#7ee0a0');
        else { var m2 = myBet(); if (m2 && m2.cashedOut && !(r && r.state)) { m2.cashedOut = false; delete m2.cashMult; } setMsg((r && r.error) || 'Trop tard !', '#ff8a80'); }
        refreshUi();
      });
    }
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if ((e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') && S.status === 'flying' && myBet() && !myBet().cashedOut) { e.stopImmediatePropagation(); e.preventDefault(); doEject(); }
    }
    function placeBet() {
      if (busy) return;
      if (!loggedIn()) { setMsg('Connecte-toi pour jouer.', '#ff8a80'); return; }
      if (bet < MIN_BET || bet > MAX_BET) { setMsg('Mise entre 10 et 100 000 🪙.', '#ff8a80'); return; }
      if (bet > balance()) { setMsg('Solde insuffisant pour cette mise.', '#ff8a80'); return; }
      busy = true; setMsg('Mise en cours…');
      api({ action: 'bet', amount: bet }).then(function (r) {
        busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Mise refusée.', '#ff8a80'); refreshUi(); return; }
        setMsg('Mise enregistrée : décollage imminent.', '#7ee0a0');
        if (S.status === 'waiting') api({ action: 'launch' }).then(function (l) { if (l && !l.ok && l.error) setMsg(l.error, '#ff8a80'); refreshUi(); });   // le décollage se lance tout seul
        refreshUi();
      });
    }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (seatTaken(s)) { w.flash('Ce poste est occupé.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0; busy = false;
      injectCss();
      var el = document.createElement('div'); el.className = 'cr3d';
      el.innerHTML = '<div class="cr-top"><span class="cr-bal">Solde : <b></b></span><span class="cr-bet">Mise : <b></b></span></div><div class="cr-msg"></div>' +
        '<div class="cr-chips">' + CHIPS.map(function (c) { return '<button class="cr-chip" data-c="' + c + '">+' + fmtN(c) + '</button>'; }).join('') + '<button class="cr-chip" data-c="max">Tout</button><button class="cr-chip minus" data-c="-1">Effacer</button></div>' +
        '<button class="cr-b" data-a="bet">Miser</button><button class="cr-b alt" data-a="cancel">Annuler ma mise (remboursée)</button><button class="cr-b red" data-a="eject">S\'ÉJECTER</button>';
      w.container.appendChild(el); ui = { el: el };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.c) { if (myBet()) return; bet = b.dataset.c === '-1' ? MIN_BET : b.dataset.c === 'max' ? Math.floor(balance()) : bet + parseInt(b.dataset.c, 10); bet = Math.max(MIN_BET, Math.min(MAX_BET, bet)); refreshUi(); return; }
        var a = b.dataset.a;
        if (a === 'bet') placeBet();
        else if (a === 'cancel' && !busy) { busy = true; api({ action: 'cancel' }).then(function (r) { busy = false; setMsg(r && r.ok ? 'Mise annulée et remboursée.' : ((r && r.error) || 'Impossible d\'annuler.'), r && r.ok ? '#7ee0a0' : '#ff8a80'); refreshUi(); }); }
        else if (a === 'eject') doEject();
      });
      standEl = document.createElement('div'); standEl.className = 'cr3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
      setMsg(loggedIn() ? 'Place ta mise : le vol décolle tout seul.' : 'Connecte-toi pour jouer.'); refreshUi(); poll();
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
    room.sitSpec = { y: 0.06, z: 0.28 };
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-0.9, Math.min(0.9, drag.seat.yaw - dx * 0.006)); if (drag.mouse) view.pitch = Math.max(-0.3, Math.min(0.4, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 2, tz: -5, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.8; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      var ex = s.x, ey = 1.45, ez = s.z, a = view.yaw, p = Math.atan2(3.2 - ey, 10) + view.pitch;           // on regarde le grand écran
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 8 - (s.x * 0.1), ty: ey + Math.sin(p) * 8, tz: ez - Math.cos(a) * Math.cos(p) * 8, fov: 62 };
    };
    room.syncHud = function () { refreshUi(); };

    /* --- dessin de l'écran --- */
    var drawT = 0;
    function drawScreen() {
      var w = 1920, h = 640, c = sctx, mult = multNow(), now = nowS(), k;
      var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#060b1c'); gr.addColorStop(1, '#0d1a3d'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(110,160,255,0.12)'; c.lineWidth = 1; for (k = 0; k < 30; k++) { c.beginPath(); c.moveTo(k * 64, 0); c.lineTo(k * 64, h); c.stroke(); } for (k = 0; k < 10; k++) { c.beginPath(); c.moveTo(0, k * 64); c.lineTo(w, k * 64); c.stroke(); }
      // courbe de vol
      if (S.status === 'flying' || S.status === 'crashed') {
        var T = (S.status === 'crashed' ? Math.log(Math.max(1.01, S.crashPoint)) / GROWTH : Math.max(0.1, (now - S.launchTime) / 1000)), top = Math.max(2, mult * 1.15);
        c.beginPath(); for (k = 0; k <= 60; k++) { var tt = T * k / 60, m2 = Math.exp(GROWTH * tt), x = 80 + (tt / Math.max(T, 6)) * 1100, y = h - 90 - (Math.log(m2) / Math.log(top)) * 360; if (k === 0) c.moveTo(x, y); else c.lineTo(x, y); }
        c.strokeStyle = S.status === 'crashed' ? '#ff5a5a' : '#4dd0ff'; c.lineWidth = 8; c.stroke();
      }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (S.status === 'flying') { c.fillStyle = '#6ef0a8'; c.font = '900 210px ' + MONO; c.fillText('x' + mult.toFixed(2), 700, 230, 1300); c.fillStyle = '#9fc2ff'; c.font = '700 38px ' + MONO; c.fillText('EN VOL', 700, 380, 1300); }
      else if (S.status === 'crashed') { c.fillStyle = '#ff5a5a'; c.font = '900 190px ' + MONO; c.fillText('x' + S.crashPoint.toFixed(2), 700, 230, 1300); c.font = '900 56px ' + MONO; c.fillText('CRASH !', 700, 380, 1300); }
      else if (S.status === 'countdown') { var left = Math.max(0, Math.ceil((S.launchTime - now) / 1000)); c.fillStyle = '#ffd24a'; c.font = '900 200px ' + MONO; c.fillText(String(left), 700, 220, 1300); c.fillStyle = '#d9e6ff'; c.font = '800 48px ' + MONO; c.fillText('DÉCOLLAGE DANS…', 700, 380, 1300); }
      else { c.fillStyle = '#d9e6ff'; c.font = '900 76px ' + MONO; c.fillText('EN ATTENTE DE MISES', 700, 220, 1300); c.fillStyle = '#9fc2ff'; c.font = '600 38px ' + MONO; c.fillText('Mise : le vol part tout seul', 700, 330, 1300); }
      // historique
      c.textAlign = 'left'; c.font = '800 32px ' + MONO; c.fillStyle = '#9fc2ff'; c.fillText('DERNIERS VOLS', 40, 520);
      (S.history || []).slice(0, 8).forEach(function (v, j) { var col = v >= 2 ? '#6ef0a8' : v >= 1.5 ? '#ffd24a' : '#ff8a80'; rr(c, 40 + j * 100, 545, 92, 54, 12); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(); c.fillStyle = col; c.font = '800 26px ' + MONO; c.textAlign = 'center'; c.fillText(v.toFixed(2), 86 + j * 100, 573); });
      // mises
      c.fillStyle = 'rgba(255,255,255,0.06)'; rr(c, 1450, 30, 430, 580, 22); c.fill(); c.textAlign = 'left'; c.fillStyle = '#9fc2ff'; c.font = '800 32px ' + MONO; c.fillText('JOUEURS', 1480, 76);
      Object.keys(S.bets || {}).slice(0, 9).forEach(function (n, j) {
        var b = S.bets[n], y = 130 + j * 54; c.font = '700 26px ' + MONO; c.fillStyle = '#d9e6ff'; c.fillText(String(b.name || n).slice(0, 14), 1480, y, 250);
        c.textAlign = 'right'; c.fillStyle = b.cashedOut ? '#6ef0a8' : '#ffd24a'; c.fillText(b.cashedOut ? 'x' + b.cashMult : fmtN(b.bet), 1850, y, 150); c.textAlign = 'left';
      });
      scrTex.needsUpdate = true;
    }

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0x4d8bff, target: 'hall', theme: 'exitCrash' });
    g.add(new THREE.AmbientLight(0xaec4ff, 0.8));
    var key = new THREE.DirectionalLight(0xe0ecff, 0.45); key.position.set(3, 8, 5); g.add(key);
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un poste pour t\'asseoir' : 'ZQSD / flèches : marcher · Maj : courir · avance vers un poste (F ou clic) · assis : mise, le vol part tout seul, puis S\'ÉJECTER avant le crash · F : se lever'; };
    room.onEnter = function () { poll(); };
    room.onLeave = function () { stand(); };

    var crashAnim = 0, lastRocketY = 0.2, shake = 0;
    room.update = function (dt) {
      pollT += dt; if (pollT > (seat && (S.status === 'flying' || S.status === 'countdown') ? 0.2 : 0.45)) { pollT = 0; poll(); }
      for (i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { /* ok */ } } }
      var mult = multNow();
      // fusée : monte avec le multiplicateur (échelle logarithmique)
      if (S.status === 'flying') {
        var fr = Math.min(1, Math.log(mult) / Math.log(25)), y = 0.2 + fr * (SILO.h - 2.0);
        rocket.visible = true; rocket.position.set(SILO.x + (Math.random() - 0.5) * 0.03 * (1 + mult * 0.1), y, SILO.z + (Math.random() - 0.5) * 0.03 * (1 + mult * 0.1));
        rocket.userData.flame.scale.set(1, 0.8 + Math.random() * 0.6, 1); rocket.userData.flame.visible = true; if (pl) { pl.intensity = 1.2; pl.position.y = y; }
        boom.visible = false;
      } else if (S.status === 'crashed') {
        if (lastStatus !== 'crashed') { crashAnim = 1.4; boom.position.set(rocket.position.x, rocket.position.y + 0.8, rocket.position.z); debris.forEach(function (d) { d.m.visible = true; d.m.position.copy(boom.position); d.v.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5); }); rocket.visible = false; }
        if (crashAnim > 0) {
          crashAnim -= dt; var u = 1 - crashAnim / 1.4; boom.visible = true; boom.scale.setScalar(0.6 + u * 4.2); boom.material.opacity = Math.max(0, 1 - u); if (pl) pl.intensity = 2 * (1 - u);
          debris.forEach(function (d) { d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += dt * 6; d.m.rotation.y += dt * 5; if (d.m.position.y < 0.15) { d.m.position.y = 0.15; d.v.multiplyScalar(0.3); } });
        } else { boom.visible = false; debris.forEach(function (d) { d.m.visible = false; }); if (pl) pl.intensity = 0; }
      } else {
        rocket.visible = true; rocket.position.set(SILO.x, 0.2, SILO.z); rocket.userData.flame.visible = S.status === 'countdown' && (S.launchTime - nowS()) < 1500; boom.visible = false; debris.forEach(function (d) { d.m.visible = false; }); if (pl) pl.intensity = 0;
        if (S.status === 'countdown') rocket.position.x += (Math.random() - 0.5) * 0.012;
      }
      rocket2.visible = rocket.visible; rocket2.position.set(SILO2.x + (rocket.position.x - SILO.x), rocket.position.y, SILO2.z + (rocket.position.z - SILO.z));
      rocket2.userData.flame.visible = rocket.userData.flame.visible; rocket2.userData.flame.scale.copy(rocket.userData.flame.scale);
      boom2.visible = boom.visible; boom2.position.set(boom.position.x - SILO.x + SILO2.x, boom.position.y, boom.position.z - SILO.z + SILO2.z); boom2.scale.copy(boom.scale); boom2.material.opacity = boom.material.opacity;
      if (S.status !== lastStatus) {
        if (S.status === 'crashed' && seat) { var mb = myBet(); if (mb && !mb.cashedOut) setMsg('💥 Crash à x' + (S.crashPoint || 0).toFixed(2) + ' : mise perdue.', '#ff8a80'); else if (!mb) setMsg('Crash à x' + (S.crashPoint || 0).toFixed(2), ''); }
        if (S.status === 'waiting' && seat && lastStatus === 'crashed') setMsg('Place ta mise : le vol décolle tout seul.');
        lastStatus = S.status; refreshUi();
      }
      drawT += dt; if (drawT > 0.08) { drawT = 0; drawScreen(); if (ui && S.status === 'flying') refreshUi(); }
    };
    room.dispose = function () { stand(); };
    return room;
  }

  F.registerRoom('crash', createCrashRoom);
})();
