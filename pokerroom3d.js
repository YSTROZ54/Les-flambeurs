/* =====================================================================
   pokerroom3d.js — Salle de poker 3D des Flambeurs (PC, dans le monde 3D)
   ---------------------------------------------------------------------
   On entre par la porte du hall, on marche dans le salon de poker (le même décor, la même table et
   le même croupier que la partie), on choisit sa chaise et on s'assoit : la partie (poker3d.js +
   poker-multi.js) prend alors le relais. En quittant la table on revient debout dans cette salle.
   La salle ne fait QUE montrer l'état des tables (qui est assis où) : l'argent et les règles restent
   côté serveur (api/poker.js) ; la place choisie est envoyée avec la mise de départ.
   Table affichée = type (Duel / Table de 4 / Table de 6) + Salon 1, 2 ou 3, choisis en bas à gauche.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), poker3d.js + poker3d-scene.js (décor).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom || typeof Poker3DExperience === 'undefined') return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO;

  var SC = 0.66;                 // le décor du poker est dessiné en « unités de table » : on le réduit à l'échelle d'une salle
  var FLOOR = 1.2;               // hauteur du sol sous le tapis de la table (unités de table)
  var WALL_R = 12 * SC;          // rayon du salon
  var OUTER = 3.3 / 2 + 0.44;    // distance table → chaise (comme poker3d.js)
  var HALF_STRAIGHT = (6.6 - 3.3) / 2;

  // places autour de la table, dans l'ordre du tour : 0 = en bas (face à la porte), puis dans le sens des aiguilles de la partie
  // (mêmes angles que la partie : poker3d.js `thetas`). SLOTS[n] = quelles places existent pour une table de n joueurs.
  var THETAS = [Math.PI / 2, Math.PI - 0.55, Math.PI + 0.15, Math.PI + 0.85, -0.95, 0.55];
  var SLOTS = { 2: [0, 3], 4: [0, 1, 3, 5], 6: [0, 1, 2, 3, 4, 5] };
  var CATS = [['1v1', '⚔️ Duel'], ['4max', '👥 Table de 4'], ['6max', '👑 Table de 6']];

  function createPokerRoom(world, cfg) {
    var low = world.low;
    var room = { title: 'SALLE DE POKER', subtitle: 'CHOISIS TA CHAISE', topic: 'flambeurs-poker-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -WALL_R + 0.5, xMax: WALL_R - 0.5, zMin: -WALL_R + 0.5, zMax: WALL_R - 0.5 };

    /* ----- le décor de la partie, posé dans un groupe réduit ----- */
    var stage = new THREE.Group();
    stage.scale.setScalar(SC); stage.position.y = FLOOR * SC;
    g.add(stage);
    var ctx = Object.create(Poker3DExperience.prototype);
    ctx.scene = stage; ctx.textureCache = {};
    ctx.options = { feltColor: 0x0a3821, railColor: 0x121013, woodColor: 0x1e1108, tableWidth: 6.6, tableDepth: 3.3 };
    ctx.thetas = THETAS.slice(1); ctx.tableFormat = '6max'; ctx.activeBotIndices = [0, 1, 2, 3, 4];
    ctx.buildPokerTable();
    ctx.buildRoom();
    ctx.buildDealer();      // le croupier reste assis à côté de la table
    // les halos « spot » de la partie sont dessinés pour son éclairage ACES : ici on éclaire à la main
    g.add(new THREE.AmbientLight(0xffe2c4, 0.55));
    var lamp = new THREE.PointLight(0xffe9c8, 1.15, 11); lamp.position.set(0, 3.6, 0); g.add(lamp);
    var lamp2 = new THREE.PointLight(0xffb98a, 0.5, 9); lamp2.position.set(0, 2.2, 3.2); g.add(lamp2);

    /* ----- les chaises / les joueurs assis ----- */
    var looks = Poker3DExperience.PLAYER_LOOKS;
    var CHAIR_PARTS = 18;   // dans createSeatedPlayer, les 18 premiers éléments sont la chaise (assise, dossier, accoudoirs, pied, roulettes)
    room.slots = [];
    THETAS.forEach(function (theta, i) {
      var sc, pos, rotY, fit;
      if (i === 0) {
        sc = 0.72; fit = ctx.figureFit(sc);
        pos = { x: 0, z: OUTER + 0.62 * sc + 0.12 }; rotY = Math.PI;
      } else {
        var p = { x: Math.cos(theta) * 4.2, z: Math.sin(theta) * 3 };
        var cx = Math.max(-HALF_STRAIGHT, Math.min(HALF_STRAIGHT, p.x));
        sc = p.z > 0 ? 0.76 : 0.9; fit = ctx.figureFit(sc);
        var dx = p.x - cx, dz = p.z, dl = Math.hypot(dx, dz), d = OUTER + 0.62 * sc + 0.12;
        pos = { x: cx + dx / dl * d, z: dz / dl * d }; rotY = Math.atan2(cx - pos.x, 0 - pos.z);
      }
      var look = i === 0 ? Poker3DExperience.HERO_LOOK : looks[(i - 1) % looks.length];
      function put(obj) { obj.scale.setScalar(sc); obj.position.set(pos.x, fit.seatY, pos.z); obj.rotation.y = rotY; stage.add(obj); return obj; }
      var person = put(ctx.createSeatedPlayer(look, fit.floorLocal));
      var chair = put(ctx.createSeatedPlayer(look, fit.floorLocal));
      chair.children.slice(CHAIR_PARTS).forEach(function (c) { chair.remove(c); });   // on ne garde que la chaise vide
      person.visible = false;
      // zone de clic invisible autour de la chaise
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 10), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(pos.x * SC, 0.7, pos.z * SC); g.add(hit);
      var slot = { i: i, x: pos.x * SC, z: pos.z * SC, yaw: F.yawFor(-pos.x, -pos.z), person: person, chair: chair, hit: hit, name: '', seatIdx: -1, plate: null };
      room.slots.push(slot);
      room.colliders.push({ x: slot.x, z: slot.z, r: 0.42 });
    });
    // table, croupier : on ne les traverse pas
    for (var k = -2; k <= 2; k++) room.colliders.push({ x: k * HALF_STRAIGHT * SC / 2, z: 0, r: 1.42 });
    room.colliders.push({ x: 0, z: -(OUTER + 0.62 * 0.9 + 0.12) * SC, r: 0.5 });

    /* ----- plaque flottante au-dessus de la table ----- */
    var sc2 = mkCanvas(512, 160), sx = sc2.getContext('2d');
    var signTex = mkTex(sc2);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    sign.position.set(0, 2.45, 0); g.add(sign);
    function drawSign(t) {
      sx.clearRect(0, 0, 512, 160);
      sx.fillStyle = 'rgba(12,7,12,0.82)'; F.roundRectPath(sx, 4, 4, 504, 152, 22); sx.fill();
      sx.strokeStyle = '#c9a227'; sx.lineWidth = 5; sx.stroke();
      sx.textAlign = 'center'; sx.textBaseline = 'middle';
      sx.fillStyle = '#f3cf62'; sx.font = '800 46px ' + SERIF; sx.fillText(t ? t.title : 'Chargement…', 256, 56, 480);
      sx.fillStyle = '#e9ddb4'; sx.font = '700 28px ' + MONO; sx.fillText(t ? t.line : '', 256, 112, 480);
      signTex.needsUpdate = true;
    }
    drawSign(null);

    // plaque de nom au-dessus d'un joueur assis
    function makePlate() {
      var c = mkCanvas(256, 64), x = c.getContext('2d'), tex = mkTex(c);
      var m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.scale.set(0.9, 0.225, 1); m.userData = { c: c, x: x, tex: tex };
      return m;
    }
    function paintPlate(sp, text) {
      var x = sp.userData.x;
      x.clearRect(0, 0, 256, 64); x.fillStyle = 'rgba(8,5,12,0.78)'; F.roundRectPath(x, 2, 8, 252, 48, 16); x.fill();
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f3e7c0'; x.font = '700 26px "Plus Jakarta Sans",system-ui,"Segoe UI Emoji",sans-serif';
      x.fillText(text, 128, 34, 236); sp.userData.tex.needsUpdate = true;
    }

    // la porte de sortie (derrière la chaise du bas) vers le hall
    world.addDoor(room, { x: 0, z: WALL_R - 0.06, nx: 0, nz: -1, w: 1.8, h: 2.9, label: 'HALL', sub: 'Sortie', color: 0xffe9b0, target: 'hall' });

    /* ----- les tables du serveur ----- */
    room.tables = []; room.sel = { cat: '6max', salon: 0 };
    try { var sv = JSON.parse(localStorage.getItem('f3d_pokerroom_sel') || 'null'); if (sv && CATS.some(function (c) { return c[0] === sv.cat; })) room.sel = { cat: sv.cat, salon: Math.max(0, Math.min(2, sv.salon | 0)) }; } catch (e) { /* ok */ }
    room.table = function () {
      var list = room.tables.filter(function (t) { return t.category === room.sel.cat; });
      return list[room.sel.salon] || null;
    };
    var shownKey = '';
    // le serveur donne la liste des joueurs avec leur place (seat) ; sinon, dans l'ordre
    function bySeat(t) { var a = []; if (t) t.players.forEach(function (p, i) { a[p && p.seat != null ? p.seat : i] = p; }); return a; }
    function refreshSeats() {
      var t = room.table(), n = t ? t.maxSeats : (room.sel.cat === '1v1' ? 2 : room.sel.cat === '4max' ? 4 : 6), idxs = SLOTS[n] || SLOTS[6];
      var seatsNow = bySeat(t), key = JSON.stringify([t && t.id, n, seatsNow.map(function (p) { return p ? p.username + p.avatar : ''; }), t && t.status, t && t.count]);
      if (key === shownKey) return;
      shownKey = key;
      room.slots.forEach(function (s) { s.seatIdx = -1; s.name = ''; });
      idxs.forEach(function (slotIdx, seatIdx) { room.slots[slotIdx].seatIdx = seatIdx; });
      room.slots.forEach(function (s) {
        var exists = s.seatIdx >= 0, p = exists && t ? seatsNow[s.seatIdx] : null;
        s.name = p ? p.username : '';
        s.person.visible = !!p; s.chair.visible = exists && !p; s.hit.visible = true;
        if (p) {
          if (!s.plate) { s.plate = makePlate(); s.plate.position.set(s.x, 1.95, s.z); g.add(s.plate); }
          paintPlate(s.plate, (p.avatar || '') + ' ' + p.username); s.plate.visible = true;
        } else if (s.plate) s.plate.visible = false;
      });
      drawSign(t ? { title: t.name, line: t.count + '/' + t.maxSeats + ' joueurs · blindes ' + (t.smallBlind || 0).toLocaleString('fr-FR') + '/' + (t.bigBlind || 0).toLocaleString('fr-FR') } : null);
      syncHud();
    }
    // on ne montre que les places qui existent (les autres sont des chaises « fantômes » retirées du jeu)
    room.slots.forEach(function (s) {
      room.interactables.push({
        hit: s.hit, x: s.x, z: s.z, radius: 1.7,
        enabled: function () { return s.seatIdx >= 0 && !s.name && !!room.table(); },
        prompt: function () { return '🪑 S\'asseoir — place ' + (s.seatIdx + 1); },
        use: function () { room.sit(s); }
      });
    });

    room.sit = function (s) {
      var t = room.table();
      if (world.trans || world.mode !== 'room') return;
      if (!F.token()) { world.flash('Connecte-toi pour jouer au poker.'); return; }
      if (!t || !window.PokerMulti) { world.flash('Table indisponible pour le moment.'); return; }
      if (s.name) { world.flash('Place occupée par ' + s.name); return; }
      if (t.count >= t.maxSeats) { world.flash('Table complète.'); return; }
      window.PokerMulti.worldIntent = { tableId: t.id, seat: s.seatIdx };
      world.exitGame('poker');
    };
    room.playSolo = function () {
      if (world.trans || !window.PokerMulti) return;
      window.PokerMulti.worldIntent = { solo: true };
      world.exitGame('poker');
    };

    /* ----- interface : choix de la table ----- */
    injectCss();
    room.hudBottom =
      '<div class="prm"><div class="prm-t">♠️ Choisis ta table</div>' +
      '<div class="prm-row" data-s3d="prcat">' + CATS.map(function (c) { return '<button data-c="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="prm-row" data-s3d="prsalon">' + [0, 1, 2].map(function (i) { return '<button data-s="' + i + '">Salon ' + (i + 1) + '</button>'; }).join('') + '</div>' +
      '<div class="prm-info" data-s3d="prinfo">Chargement des tables…</div>' +
      '<button class="prm-solo" data-s3d="prsolo">🤖 Jouer seul contre les bots</button></div>';
    room.bindHud = function (hud) {
      room.elHud = hud;
      function q(k) { return hud.querySelector('[data-s3d="' + k + '"]'); }
      room.elInfo = q('prinfo');
      hud.querySelectorAll('[data-c]').forEach(function (b) { b.addEventListener('click', function () { room.sel.cat = b.getAttribute('data-c'); save(); shownKey = ''; refreshSeats(); }); });
      hud.querySelectorAll('[data-s]').forEach(function (b) { b.addEventListener('click', function () { room.sel.salon = +b.getAttribute('data-s'); save(); shownKey = ''; refreshSeats(); }); });
      q('prsolo').addEventListener('click', function () { room.playSolo(); });
      syncHud();
    };
    function save() { try { localStorage.setItem('f3d_pokerroom_sel', JSON.stringify(room.sel)); } catch (e) { /* ok */ } }
    function syncHud() {
      if (!room.elHud) return;
      room.elHud.querySelectorAll('[data-c]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-c') === room.sel.cat); });
      room.elHud.querySelectorAll('[data-s]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-s') === room.sel.salon); });
      var t = room.table();
      if (room.elInfo) room.elInfo.innerHTML = !room.tables.length ? (room.offline ? 'Serveur de poker injoignable : la partie solo reste possible.' : 'Chargement des tables…') :
        t ? 'Mise de départ ' + t.minBuyIn.toLocaleString('fr-FR') + ' – ' + t.maxBuyIn.toLocaleString('fr-FR') + ' € · avance vers une chaise libre et appuie sur <b>E</b> (ou clique dessus)' : 'Cette table n\'existe pas.';
    }
    room.syncHud = syncHud;

    /* ----- liste des tables (qui est assis où), interrogée tant qu'on est dans la salle ----- */
    function poll() {
      if (!room.netOn || world.dead) return;
      var I = window.PokerMultiInternals, me = '';
      try { me = state.username || ''; } catch (e) { /* pas connecté */ }
      var p = I && I.api ? I.api('GET', { user: me || 'invité', device: I.deviceId() }) : Promise.reject(new Error('poker-multi absent'));
      p.then(function (d) { room.tables = d.tables || []; room.offline = false; shownKey = ''; refreshSeats(); })
        .catch(function () { room.offline = true; syncHud(); })
        .then(function () { if (room.netOn && !world.dead) room.pollT = setTimeout(poll, 1800); });
    }
    room.netStart = function () { room.netOn = true; clearTimeout(room.pollT); poll(); };
    room.netStop = function () { room.netOn = false; clearTimeout(room.pollT); };

    room.hint = function (w) {
      return 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · clique-glisse : regarder · approche-toi d\'une chaise libre pour t\'asseoir (E ou clic)' + (w.full ? ' · Échap : quitter' : '');
    };
    room.spawn = function () { return { x: 0, z: WALL_R - 2.4, yaw: 0 }; };
    room.update = function (dt) {
      var p = world.player, d = Math.hypot(p.x, p.z), lim = WALL_R - 0.55;
      if (d > lim) { p.x *= lim / d; p.z *= lim / d; }                // salon rond : on ne sort pas des murs
      sign.rotation.y = Math.atan2(world.camera.position.x - sign.position.x, world.camera.position.z - sign.position.z);
      sign.position.y = 2.45 + Math.sin(world.clock * 1.4) * 0.03;
      room.slots.forEach(function (s) { if (s.plate && s.plate.visible) s.plate.position.y = 1.95; });
    };
    room.dispose = function () { signTex.dispose(); };
    return room;
  }

  function injectCss() {
    if (document.getElementById('prm-css')) return;
    var st = document.createElement('style'); st.id = 'prm-css';
    st.textContent =
      '.prm{position:absolute;left:14px;bottom:14px;width:270px;background:rgba(8,5,12,.86);border:1px solid rgba(201,162,39,.55);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;pointer-events:auto;color:#f4e3b0}' +
      '.s3d-hud[data-mode=seat] .prm{display:none}' +
      '.prm-t{font-weight:900;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#f3cf62}' +
      '.prm-row{display:flex;gap:5px}.prm-row button{flex:1;padding:6px 4px;font-size:11px;font-weight:800;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#e9ddb4}' +
      '.prm-row button.on{border-color:#fbbf24;background:rgba(245,158,11,.22);color:#fcd34d}' +
      '.prm-info{font-size:11px;line-height:1.35;color:#d9c88f}.prm-info b{color:#fcd34d}' +
      '.prm-solo{padding:7px;font-size:11px;font-weight:800;border-radius:9px;border:1px solid rgba(56,189,248,.5);background:rgba(14,60,90,.5);color:#bae6fd}';
    document.head.appendChild(st);
  }

  F.registerRoom('pokerroom', createPokerRoom);
})();
