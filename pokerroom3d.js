/* =====================================================================
   pokerroom3d.js — Salles de poker 3D des Flambeurs (PC, dans le monde 3D)
   ---------------------------------------------------------------------
   On entre par la porte du hall dans le salon de poker. Ses murs s'ouvrent sur deux autres salles
   (à droite) : trois salles, chacune avec sa couleur, sa déco et SA table de 6 (même décor, même table
   et même croupier que la partie). On marche, on choisit sa chaise, on s'assoit : la partie
   (poker3d.js + poker-multi.js) prend alors le relais. En quittant la table on revient debout ici.
   Les trois tables sont les salons 1, 2 et 3 du serveur (tous identiques) ; une table se joue dès
   que deux joueurs sont prêts, même si les autres chaises restent vides.
   La salle ne fait QUE montrer l'état des tables (qui est assis où) : l'argent et les règles restent
   côté serveur (api/poker.js) ; la place choisie est envoyée avec la mise de départ.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), poker3d.js + poker3d-scene.js (décor).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom || typeof Poker3DExperience === 'undefined') return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO;

  var SC = 0.66;                 // le décor du poker est dessiné en « unités de table » : on le réduit à l'échelle d'une salle
  var FLOOR = 1.2;               // hauteur du sol sous le tapis de la table (unités de table)
  var WALL_R = 12 * SC;          // rayon d'une salle
  var OUTER = 3.3 / 2 + 0.44;    // distance table → chaise (comme poker3d.js)
  var HALF_STRAIGHT = (6.6 - 3.3) / 2;
  var CORR = 4.5;                // longueur du couloir entre deux salles
  var D = 2 * WALL_R + CORR;     // distance entre les centres de deux salles
  var GAP_W = 0.17 * 12 * SC;    // demi-largeur d'une ouverture (mètres)
  var CEIL = 2.77;               // hauteur du couloir (= dessous du linteau)

  // places autour de la table : 0 = en bas (face à l'entrée), puis dans l'ordre de la partie (poker3d.js `thetas`)
  var THETAS = [Math.PI / 2, Math.PI - 0.55, Math.PI + 0.15, Math.PI + 0.85, -0.95, 0.55];

  // les trois salles : thème de décor (poker3d-scene.js), ouvertures dans le mur (angle polaire, π/2 = à droite), table du serveur
  var ROOMS = [
    { name: 'Salle Rouge', emoji: '🔴', theme: 'rouge', gaps: [Math.PI / 2], felt: 0x0a3821, table: 'poker_6max_1' },
    { name: 'Salle Émeraude', emoji: '🟢', theme: 'emeraude', gaps: [Math.PI / 2, -Math.PI / 2], felt: 0x0c4a52, table: 'poker_6max_2' },
    { name: 'Salle Saphir', emoji: '🔵', theme: 'saphir', gaps: [-Math.PI / 2], felt: 0x3a1052, table: 'poker_6max_3' }
  ];

  // petite étiquette flottante (montant d'une mise, pot…) : sw x sh mètres, texte repeint seulement quand il change
  function makeLabel(sw, sh) {
    var cv = mkCanvas(256, Math.round(256 * sh / sw)), x = cv.getContext('2d'), tx = mkTex(cv), last = null;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
    sp.scale.set(sw, sh, 1); sp.visible = false;
    return {
      sprite: sp,
      set: function (text, color) {
        if (!text) { sp.visible = false; last = null; return; }
        sp.visible = true;
        if (text + color === last) return;
        last = text + color;
        x.clearRect(0, 0, cv.width, cv.height); x.fillStyle = 'rgba(8,5,12,0.8)'; F.roundRectPath(x, 2, 2, cv.width - 4, cv.height - 4, cv.height / 3); x.fill();
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color || '#f3cf62'; x.font = '800 ' + Math.round(cv.height * 0.5) + 'px "Plus Jakarta Sans",system-ui,"Segoe UI Emoji",sans-serif';
        x.fillText(text, cv.width / 2, cv.height / 2 + 2, cv.width - 20); tx.needsUpdate = true;
      }
    };
  }

  function createPokerRoom(world, cfg) {
    var room = { title: 'SALLES DE POKER', subtitle: 'CHOISIS TA CHAISE', topic: 'flambeurs-poker-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -WALL_R + 0.5, xMax: (ROOMS.length - 1) * D + WALL_R - 0.5, zMin: -WALL_R + 0.5, zMax: WALL_R - 0.5 };
    g.add(new THREE.AmbientLight(0xffe2c4, 0.5));
    var looks = Poker3DExperience.PLAYER_LOOKS;
    var CHAIR_PARTS = 18;   // dans createSeatedPlayer, les 18 premiers éléments sont la chaise (assise, dossier, accoudoirs, pied, roulettes)
    room.slots = [];        // toutes les chaises de toutes les salles
    room.salles = [];

    ROOMS.forEach(function (def, r) {
      var cx = r * D;
      var stage = new THREE.Group();
      stage.scale.setScalar(SC); stage.position.set(cx, FLOOR * SC, 0);
      g.add(stage);
      var ctx = Object.create(Poker3DExperience.prototype);
      ctx.scene = stage; ctx.textureCache = {};
      ctx.options = { feltColor: def.felt, railColor: 0x121013, woodColor: 0x1e1108, tableWidth: 6.6, tableDepth: 3.3 };
      ctx.thetas = THETAS.slice(1); ctx.tableFormat = '6max'; ctx.activeBotIndices = [0, 1, 2, 3, 4];
      ctx.buildPokerTable();
      ctx.buildRoom(def.theme, def.gaps, false);
      ctx.buildDealer();      // le croupier reste assis à côté de la table
      ctx.buildCommunityCards();   // 5 cartes communes + emplacements + bouton dealer (affichés quand une partie se joue à cette table)
      ctx.communityCardMeshes.forEach(function (m, i) { m.scale.setScalar(1.12); m.position.set((i - 2) * 0.5, 0.012, 0.05); m.visible = false; });
      ctx.dealerButton.visible = false;
      var lamp = new THREE.PointLight(0xffe9c8, 1.0, 12); lamp.position.set(cx, 3.4, 0); g.add(lamp);

      var salle = { r: r, def: def, cx: cx, slots: [], ctx: ctx, stage: stage, hole: [], bets: [], boardKey: '' };
      room.salles.push(salle);
      salle.pot = makeLabel(1.1, 0.34, 0.96); salle.pot.sprite.position.set(cx, 1.0, -0.62); g.add(salle.pot.sprite);

      THETAS.forEach(function (theta, i) {
        var sc, pos, rotY, fit;
        if (i === 0) {
          sc = 0.72; fit = ctx.figureFit(sc);
          pos = { x: 0, z: OUTER + 0.62 * sc + 0.12 }; rotY = Math.PI;
        } else {
          var p = { x: Math.cos(theta) * 4.2, z: Math.sin(theta) * 3 };
          var cxs = Math.max(-HALF_STRAIGHT, Math.min(HALF_STRAIGHT, p.x));
          sc = p.z > 0 ? 0.76 : 0.9; fit = ctx.figureFit(sc);
          var dx = p.x - cxs, dz = p.z, dl = Math.hypot(dx, dz), d = OUTER + 0.62 * sc + 0.12;
          pos = { x: cxs + dx / dl * d, z: dz / dl * d }; rotY = Math.atan2(cxs - pos.x, 0 - pos.z);
        }
        var look = i === 0 ? Poker3DExperience.HERO_LOOK : looks[(i - 1 + r) % looks.length];
        var put = function (obj) { obj.scale.setScalar(sc); obj.position.set(pos.x, fit.seatY, pos.z); obj.rotation.y = rotY; stage.add(obj); return obj; };
        var person = put(ctx.createSeatedPlayer(look, fit.floorLocal));
        var chair = put(ctx.createSeatedPlayer(look, fit.floorLocal));
        chair.children.slice(CHAIR_PARTS).forEach(function (c) { chair.remove(c); });   // on ne garde que la chaise vide
        person.visible = false;
        // zone de clic invisible autour de la chaise
        var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 10), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.set(cx + pos.x * SC, 0.7, pos.z * SC); g.add(hit);
        var slot = { r: r, i: i, seatIdx: i, x: cx + pos.x * SC, z: pos.z * SC, person: person, chair: chair, hit: hit, name: '', plate: null };
        room.slots.push(slot); salle.slots.push(slot);
        room.colliders.push({ x: slot.x, z: slot.z, r: 0.42 });

        // cartes de la main devant la chaise, étiquette de mise, plaque du joueur (montrées seulement pendant une partie à cette table)
        var hx = Math.cos(theta) * 2.6, hz = Math.sin(theta) * 1.35, tx = -Math.sin(theta), tz = Math.cos(theta);
        slot.hole = [0, 1].map(function () {
          var m = ctx.createCardObject('A', '♠', true, 0.75); m.visible = false; stage.add(m); return m;
        });
        slot.holeBase = { x: hx, z: hz, tx: tx, tz: tz, rotZ: Math.PI / 2 - theta };
        slot.bet = makeLabel(0.7, 0.25); slot.bet.sprite.position.set(cx + hx * 0.3 * SC, 0.9, hz * 0.3 * SC); g.add(slot.bet.sprite);
        slot.theta = theta;
      });
      // table, croupier : on ne les traverse pas
      for (var k = -2; k <= 2; k++) room.colliders.push({ x: cx + k * HALF_STRAIGHT * SC / 2, z: 0, r: 1.42 });
      room.colliders.push({ x: cx, z: -(OUTER + 0.62 * 0.9 + 0.12) * SC, r: 0.5 });

      // plaque flottante au-dessus de la table
      var cv = mkCanvas(512, 160), sx = cv.getContext('2d'), tex = mkTex(cv);
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      sign.position.set(cx, 2.45, 0); g.add(sign);
      salle.sign = sign; salle.tex = tex;
      salle.draw = function (t) {
        sx.clearRect(0, 0, 512, 160);
        sx.fillStyle = 'rgba(12,7,12,0.82)'; F.roundRectPath(sx, 4, 4, 504, 152, 22); sx.fill();
        sx.strokeStyle = '#c9a227'; sx.lineWidth = 5; sx.stroke();
        sx.textAlign = 'center'; sx.textBaseline = 'middle';
        sx.fillStyle = '#f3cf62'; sx.font = '800 46px ' + SERIF; sx.fillText(def.name, 256, 56, 480);
        sx.fillStyle = '#e9ddb4'; sx.font = '700 28px ' + MONO;
        sx.fillText(t ? t.count + '/' + t.maxSeats + ' joueurs · blindes ' + t.smallBlind + '/' + t.bigBlind : 'Chargement…', 256, 112, 480);
        tex.needsUpdate = true;
      };
      salle.draw(null);
    });

    // couloirs entre les salles + enseigne au-dessus de chaque ouverture
    var wallM = new THREE.MeshStandardMaterial({ color: 0x2a0d14, roughness: 0.85 });
    var goldM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.6, emissive: 0x2a1d00 });
    var floorM = new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: 0.4, metalness: 0.2 });
    var glowM = new THREE.MeshBasicMaterial({ color: 0xffe8c4 });
    function plate(text, sub) {
      var c = mkCanvas(512, 128), x = c.getContext('2d');
      x.fillStyle = '#12080f'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#c9a227'; x.lineWidth = 6; x.strokeRect(4, 4, 504, 120);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f3cf62'; x.shadowColor = '#ffb300'; x.shadowBlur = 10;
      x.font = '800 44px ' + SERIF; x.fillText(text, 256, sub ? 48 : 66, 480);
      if (sub) { x.shadowBlur = 0; x.fillStyle = '#d9c88f'; x.font = '600 24px ' + MONO; x.fillText(sub, 256, 96, 480); }
      return new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: mkTex(c) }));
    }
    for (var c = 0; c < ROOMS.length - 1; c++) {
      var x0 = c * D + WALL_R - 0.5, x1 = (c + 1) * D - WALL_R + 0.5, len = x1 - x0, mid = (x0 + x1) / 2, hw = GAP_W + 0.02;
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(len, hw * 2), floorM); fl.rotation.x = -Math.PI / 2; fl.position.set(mid, 0.003, 0); g.add(fl);
      var cl = new THREE.Mesh(new THREE.PlaneGeometry(len, hw * 2), new THREE.MeshBasicMaterial({ color: 0x0b060c })); cl.rotation.x = Math.PI / 2; cl.position.set(mid, CEIL, 0); g.add(cl);
      [-1, 1].forEach(function (s) {
        var w = new THREE.Mesh(new THREE.PlaneGeometry(len, CEIL), wallM); w.position.set(mid, CEIL / 2, s * hw); w.rotation.y = s > 0 ? Math.PI : 0; g.add(w);
        var tr = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.04), goldM); tr.position.set(mid, 0.9, s * (hw - 0.01)); g.add(tr);
        var st = new THREE.Mesh(new THREE.BoxGeometry(len - 0.6, 0.05, 0.05), glowM); st.position.set(mid, CEIL - 0.12, s * (hw - 0.03)); g.add(st);
      });
      var cp = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), new THREE.MeshStandardMaterial({ color: 0x5a0f1d, roughness: 0.95 })); cp.rotation.x = -Math.PI / 2; cp.position.set(mid, 0.008, 0); g.add(cp);
      var lt = new THREE.PointLight(0xffe0b0, 0.9, 7); lt.position.set(mid, CEIL - 0.3, 0); g.add(lt);
      // enseignes : côté salle de gauche (→ salle suivante) et côté salle de droite (← salle précédente)
      var sR = plate(ROOMS[c + 1].name, '▶'), sL = plate(ROOMS[c].name, '◀');
      sR.position.set(c * D + WALL_R - 0.45, CEIL + 0.45, 0); sR.rotation.y = -Math.PI / 2; g.add(sR);
      sL.position.set((c + 1) * D - WALL_R + 0.45, CEIL + 0.45, 0); sL.rotation.y = Math.PI / 2; g.add(sL);
    }
    // ces enseignes sont dans le mur : on les décale vers l'intérieur de la salle (dos au linteau)
    function inside(px, pz) {
      for (var r = 0; r < ROOMS.length; r++) if (Math.hypot(px - r * D, pz) < WALL_R - 0.55) return true;
      for (var c2 = 0; c2 < ROOMS.length - 1; c2++) if (px > c2 * D + WALL_R - 1.2 && px < (c2 + 1) * D - WALL_R + 1.2 && Math.abs(pz) < GAP_W - 0.25) return true;
      return false;
    }

    // plaque de nom au-dessus d'un joueur assis
    // nom (+ jetons et état pendant une partie) ; la couleur dorée = c'est à lui de parler
    function makePlate() {
      var cv = mkCanvas(256, 96), x = cv.getContext('2d'), tx = mkTex(cv);
      var m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
      m.scale.set(0.9, 0.34, 1); m.userData = { x: x, tex: tx, key: '' };
      return m;
    }
    function paintPlate(sp, text, sub, turn) {
      var k = text + '|' + sub + '|' + turn;
      if (sp.userData.key === k) return;
      sp.userData.key = k;
      var x = sp.userData.x;
      x.clearRect(0, 0, 256, 96); x.fillStyle = turn ? 'rgba(90,60,6,0.92)' : 'rgba(8,5,12,0.78)'; F.roundRectPath(x, 2, 4, 252, 88, 18); x.fill();
      if (turn) { x.strokeStyle = '#fbbf24'; x.lineWidth = 4; x.stroke(); }
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f3e7c0'; x.font = '700 26px "Plus Jakarta Sans",system-ui,"Segoe UI Emoji",sans-serif';
      x.fillText(text, 128, sub ? 32 : 48, 236);
      if (sub) { x.fillStyle = turn ? '#fde68a' : '#a7e3b5'; x.font = '700 22px "Plus Jakarta Sans",system-ui,sans-serif'; x.fillText(sub, 128, 68, 236); }
      sp.userData.tex.needsUpdate = true;
    }

    // la porte de sortie (derrière la chaise du bas de la première salle) vers le hall
    world.addDoor(room, { x: 0, z: WALL_R - 0.06, nx: 0, nz: -1, w: 1.8, h: 2.9, label: 'HALL', sub: 'Sortie', color: 0xffe9b0, target: 'hall' });

    /* ----- les tables du serveur ----- */
    room.tables = [];
    room.tableOf = function (r) { return room.tables.filter(function (t) { return t.id === ROOMS[r].table; })[0] || null; };
    // le serveur donne la liste des joueurs avec leur place (seat) ; sinon, dans l'ordre
    function bySeat(t) { var a = []; if (t) t.players.forEach(function (p, i) { a[p && p.seat != null ? p.seat : i] = p; }); return a; }
    var shownKey = '';
    function refreshSeats() {
      var key = JSON.stringify(ROOMS.map(function (d, r) { var t = room.tableOf(r); return t ? [t.count, bySeat(t).map(function (p) { return p ? p.username + p.avatar : ''; })] : 0; }));
      if (key === shownKey) return;
      shownKey = key;
      room.salles.forEach(function (salle) {
        var t = room.tableOf(salle.r), seatsNow = bySeat(t);
        salle.slots.forEach(function (s) {
          var p = seatsNow[s.seatIdx] || null;
          s.name = p ? p.username : '';
          var mine = !!(room.seat && room.seat.slot === s);   // ma propre chaise : je ne vois pas mon personnage (je suis dedans)
          s.person.visible = !!p && !mine; s.chair.visible = !p;
          if (p) {
            if (!s.plate) { s.plate = makePlate(); s.plate.position.set(s.x, 1.72, s.z); g.add(s.plate); }
            if (!salle.live) paintPlate(s.plate, (p.avatar || '') + ' ' + p.username, '', false);
            s.plate.visible = !mine;
          } else if (s.plate) s.plate.visible = false;
        });
        salle.draw(t);
      });
      syncHud();
    }
    room.slots.forEach(function (s) {
      room.interactables.push({
        hit: s.hit, x: s.x, z: s.z, radius: 1.7,
        enabled: function () { return !s.name && !!room.tableOf(s.r); },
        prompt: function () { return '🪑 S\'asseoir — ' + ROOMS[s.r].name + ', place ' + (s.seatIdx + 1); },
        use: function () { room.sit(s); }
      });
    });

    room.sit = function (s) {
      var t = room.tableOf(s.r);
      if (world.trans || world.mode !== 'room') return;
      if (!F.token()) { world.flash('Connecte-toi pour jouer au poker.'); return; }
      if (!t || !window.PokerMulti) { world.flash('Table indisponible pour le moment.'); return; }
      if (s.name) { world.flash('Place occupée par ' + s.name); return; }
      if (t.count >= t.maxSeats) { world.flash('Table complète.'); return; }
      // on reste dans la salle : l'interface du poker s'affiche par-dessus (mise de départ, puis la partie à cette table)
      room.pending = s;
      window.PokerMulti.openInWorld(room, t.id, s.seatIdx);
    };

    /* ----- assis à la table : la partie se joue ici, devant tout le monde ----- */
    room.hideSelf = false;
    room.takeSeat = function (tableId) {
      var salle = room.salles.filter(function (q) { return q.def.table === tableId; })[0];
      if (!salle || world.mode === 'seat') return;
      var PM = window.PokerMulti, me = PM && PM.lastView && PM.lastView.me;
      var slot = salle.slots[me ? me.seat : (room.pending ? room.pending.seatIdx : 0)] || salle.slots[0];
      room.seat = { salle: salle, slot: slot, yaw: 0, pitch: 0, yawG: 0, pitchG: 0, init: false, wasFull: world.full };
      room.hideSelf = true;
      world._rtBye();
      world.setFull(true);                       // plein écran : l'interface du poker (par-dessus) est calée sur l'écran
      world.sitDown(room);
      shownKey = ''; refreshSeats();
    };
    // on se relève (fin de partie, bouton Quitter, fermeture) : debout derrière la chaise
    room.leftTable = function () {
      var st = room.seat;
      room.hideSelf = false; room.seat = null; room.pending = null;
      if (!st) return;
      var ux = st.slot.x - st.salle.cx, uz = st.slot.z, ul = Math.hypot(ux, uz) || 1;
      if (world.mode === 'seat') world.standUp(st.slot.x + ux / ul * 1.0, st.slot.z + uz / ul * 1.0, F.yawFor(-ux, -uz));
      if (!st.wasFull) world.setFull(false);
      world._rtSend(true);
      st.salle.live = false; clearGame(st.salle);
      shownKey = ''; refreshSeats();
    };
    room.forceStand = function () { if (window.PokerMulti && window.PokerMulti.inWorld) window.PokerMulti.onLeaveRoom(); else room.leftTable(); };
    room.onPause = function () { if (window.PokerMulti && window.PokerMulti.inWorld) window.PokerMulti.onLeaveRoom(); };
    room.onPageHide = function () { if (window.PokerMulti && window.PokerMulti.inWorld) window.PokerMulti.onLeaveRoom(); };

    // caméra : sur ma chaise, un peu en retrait, tournée vers le centre de la table ; on peut tourner la tête en glissant la souris
    room.seatPose = function (dt, ctx2) {
      var st = room.seat; if (!st) return null;
      var k = 1 - Math.exp(-dt * 5), dx = st.salle.cx - st.slot.x, dz = -st.slot.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
      if (ctx2.mouseLook) { st.yawG = ctx2.dz(ctx2.ms.nx, 0.2) * 0.8; st.pitchG = ctx2.dz(ctx2.ms.ny, 0.2) * 0.3; }
      st.yaw += (st.yawG - st.yaw) * k; st.pitch += (st.pitchG - st.pitch) * k;
      var ex = st.slot.x - ux * 0.65, ez = st.slot.z - uz * 0.65, ey = 1.6;
      var a = Math.atan2(ux, -uz) + st.yaw, p = Math.atan2(0.75 - ey, dl + 0.65 - 0.5) + st.pitch;
      var tx = ex + Math.sin(a) * Math.cos(p) * 5, tz = ez - Math.cos(a) * Math.cos(p) * 5, ty = ey + Math.sin(p) * 5;
      return { cx: ex, cy: ey, cz: ez, tx: tx, ty: ty, tz: tz, fov: 62 };
    };
    room.seatDragStart = function () { var st = room.seat; return st ? { yaw: st.yawG, pitch: st.pitchG } : { yaw: 0, pitch: 0 }; };
    room.seatDrag = function (drag, dx, dy) {
      var st = room.seat; if (!st) return;
      st.yawG = Math.max(-0.9, Math.min(0.9, drag.seat.yaw - dx * 0.005));
      st.pitchG = Math.max(-0.4, Math.min(0.4, drag.seat.pitch + dy * 0.003));
    };

    /* ----- la partie en cours à MA table, dessinée sur la table 3D de la salle ----- */
    var SUITS = { '♠': 1, '♥': 1, '♦': 1, '♣': 1 };
    function showCard(ctx, m, c) {
      var key = c && c.rank && SUITS[c.suit] ? c.rank + c.suit : 'back';
      if (m.userData.key === key) return;
      m.userData.key = key;
      if (key === 'back') ctx.setCardBack(m); else ctx.setCardFace(m, c.rank, c.suit);
      m.userData.key = key;
    }
    function clearGame(salle) {
      salle.ctx.communityCardMeshes.forEach(function (m) { m.visible = false; });
      salle.ctx.dealerButton.visible = false; salle.pot.set('');
      salle.slots.forEach(function (s) { s.hole.forEach(function (m) { m.visible = false; }); s.bet.set(''); });
      salle.slots.forEach(function (s) { if (s.plate) s.plate.userData.key = ''; });
    }
    function tickGame(salle, view, game) {
      var ctx = salle.ctx, bd = ctx.communityCardMeshes, comm = (game && game.communityCards) || [];
      bd.forEach(function (m, i) { var c = comm[i]; m.visible = !!c; if (c) showCard(ctx, m, c); });
      salle.pot.set(view.pot > 0 ? 'POT ' + view.pot.toLocaleString('fr-FR') + ' €' : '');
      var dealer = view.status !== 'waiting' && view.dealerSeat != null ? salle.slots[view.dealerSeat] : null;
      ctx.dealerButton.visible = !!dealer;
      if (dealer) { var b = dealer.holeBase; ctx.dealerButton.position.set(b.x * 0.5 + b.tx * 0.5, 0.02, b.z * 0.5 + b.tz * 0.5); }
      var heroKey = view.me && view.me.key;
      salle.slots.forEach(function (s) {
        var seat = view.seats[s.seatIdx] || null;
        var mine = !!(seat && seat.key === heroKey), inHand = !!(seat && seat.inHand && !seat.folded && view.status !== 'waiting');
        var b = s.holeBase, f = mine ? 0.66 : 0.8, cs = seat && seat.cards || [];
        s.hole.forEach(function (m, i) {
          m.visible = inHand;
          if (!inHand) return;
          var side = (i === 0 ? 1 : -1) * (mine ? 0.2 : 0.09);
          m.position.set(b.x * f + b.tx * side, 0.015 + i * 0.001, b.z * f + b.tz * side);
          m.rotation.set(-Math.PI / 2, 0, b.rotZ + (i === 0 ? 0.06 : -0.06));
          m.scale.setScalar(mine ? 1.3 : 0.6);
          showCard(ctx, m, cs[i] && !cs[i].hidden ? cs[i] : null);
        });
        s.bet.set(seat && seat.bet > 0 ? '🪙 ' + seat.bet.toLocaleString('fr-FR') : '');
        if (seat && s.plate) {
          var sub = seat.sittingOut ? 'attend la main' : seat.allIn ? 'TAPIS ' + seat.stack.toLocaleString('fr-FR') + ' €' : seat.stack.toLocaleString('fr-FR') + ' €' + (seat.folded && inHandBefore(seat) ? ' · couché' : '');
          paintPlate(s.plate, (seat.avatar || '') + ' ' + seat.username, sub, view.status === 'playing' && view.turn === seat.key);
        }
      });
    }
    function inHandBefore(seat) { return !!seat.inHand; }
    var gameT = 0;
    function updateGame(dt) {
      gameT -= dt; if (gameT > 0) return; gameT = 0.12;
      var PM = window.PokerMulti, view = PM && PM.inWorld && PM.mode === 'multi' ? PM.lastView : null;
      room.salles.forEach(function (salle) {
        var mineTable = view && view.tableId === salle.def.table;
        if (mineTable) { salle.live = true; tickGame(salle, view, PM.game); }
        else if (salle.live) { salle.live = false; clearGame(salle); }
      });
    }
    room.playSolo = function () {
      if (world.trans || !window.PokerMulti) return;
      window.PokerMulti.worldIntent = { solo: true };
      world.exitGame('poker');
    };

    /* ----- interface : l'état des trois salles + le solo ----- */
    injectCss();
    room.hudBottom =
      '<div class="prm"><div class="prm-t">♠️ Salles de poker</div><div class="prm-list" data-s3d="prlist"></div>' +
      '<div class="prm-info" data-s3d="prinfo"></div>' +
      '<button class="prm-solo" data-s3d="prsolo">🤖 Jouer seul contre les bots</button></div>';
    room.bindHud = function (hud) {
      room.elHud = hud;
      room.elList = hud.querySelector('[data-s3d="prlist"]'); room.elInfo = hud.querySelector('[data-s3d="prinfo"]');
      hud.querySelector('[data-s3d="prsolo"]').addEventListener('click', function () { room.playSolo(); });
      syncHud();
    };
    function whichRoom() { var p = world.player, best = 0, bd = 1e9; ROOMS.forEach(function (d, r) { var dd = Math.abs(p.x - r * D); if (dd < bd) { bd = dd; best = r; } }); return best; }
    var hudKey = '';
    function syncHud() {
      if (!room.elList) return;
      var here = whichRoom();
      var html = ROOMS.map(function (d, r) {
        var t = room.tableOf(r);
        return '<div class="prm-r' + (r === here ? ' on' : '') + '"><span>' + d.emoji + ' ' + d.name.replace('Salle ', '') + '</span><b>' + (t ? t.count + '/' + t.maxSeats : '–') + '</b></div>';
      }).join('');
      var t0 = room.tableOf(here);
      var info = !room.tables.length ? (room.offline ? 'Serveur de poker injoignable : la partie solo reste possible.' : 'Chargement des tables…') :
        'Mise de départ ' + (t0 ? t0.minBuyIn.toLocaleString('fr-FR') + ' – ' + t0.maxBuyIn.toLocaleString('fr-FR') + ' €' : '') + ' · à 2 joueurs, ça se joue déjà · avance vers une chaise libre et appuie sur <b>E</b> (ou clique dessus)';
      var k = html + info;
      if (k === hudKey) return;
      hudKey = k; room.elList.innerHTML = html; room.elInfo.innerHTML = info;
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
      return 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · clique-glisse : regarder · les ouvertures à droite mènent aux autres salles · approche-toi d\'une chaise libre pour t\'asseoir (E ou clic)' + (w.full ? ' · Échap : quitter' : '');
    };
    room.spawn = function () { return { x: 0, z: WALL_R - 2.4, yaw: 0 }; };
    var last = { x: 0, z: WALL_R - 2.4 };
    room.update = function (dt) {
      updateGame(dt);
      var p = world.player;
      if (inside(p.x, p.z)) { last.x = p.x; last.z = p.z; }
      else if (inside(p.x, last.z)) p.z = last.z;                 // on glisse le long des murs plutôt que de les traverser
      else if (inside(last.x, p.z)) p.x = last.x;
      else { p.x = last.x; p.z = last.z; }
      room.salles.forEach(function (salle) {
        salle.sign.rotation.y = Math.atan2(world.camera.position.x - salle.sign.position.x, world.camera.position.z - salle.sign.position.z);
        salle.sign.position.y = 2.45 + Math.sin(world.clock * 1.4 + salle.r) * 0.03;
      });
    };
    room.onEnter = function () { last.x = world.player.x; last.z = world.player.z; };
    room.dispose = function () { room.salles.forEach(function (s) { s.tex.dispose(); }); };
    return room;
  }

  function injectCss() {
    if (document.getElementById('prm-css')) return;
    var st = document.createElement('style'); st.id = 'prm-css';
    st.textContent =
      '.prm{position:absolute;left:14px;bottom:14px;width:270px;background:rgba(8,5,12,.86);border:1px solid rgba(201,162,39,.55);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;pointer-events:auto;color:#f4e3b0}' +
      '.s3d-hud[data-mode=seat] .prm{display:none}' +
      '.prm-t{font-weight:900;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#f3cf62}' +
      '.prm-list{display:flex;flex-direction:column;gap:4px}' +
      '.prm-r{display:flex;justify-content:space-between;padding:5px 9px;font-size:12px;font-weight:800;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e9ddb4}' +
      '.prm-r.on{border-color:#fbbf24;background:rgba(245,158,11,.22);color:#fcd34d}' +
      '.prm-info{font-size:11px;line-height:1.35;color:#d9c88f}.prm-info b{color:#fcd34d}' +
      '.prm-solo{padding:7px;font-size:11px;font-weight:800;border-radius:9px;border:1px solid rgba(56,189,248,.5);background:rgba(14,60,90,.5);color:#bae6fd}';
    document.head.appendChild(st);
  }

  F.registerRoom('pokerroom', createPokerRoom);
})();
