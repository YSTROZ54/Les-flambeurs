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
  var CORR = 1.2;                // espace vide entre deux salons (chaque salon est une pièce à part, reliée par des portes)
  var D = 2 * WALL_R + CORR;     // distance entre les centres de deux salles

  // places autour de la table : 0 = en bas (face à l'entrée), puis dans l'ordre de la partie (poker3d.js `thetas`)
  var THETAS = [Math.PI / 2, Math.PI - 0.55, Math.PI + 0.15, Math.PI + 0.85, -0.95, 0.55];

  // les trois salles : thème de décor (poker3d-scene.js), ouvertures dans le mur (angle polaire, π/2 = à droite), table du serveur
  var ROOMS = [
    { name: 'Salle Rouge', emoji: '🔴', theme: 'rouge', gaps: [], felt: 0x0a3821, table: 'poker_6max_1' },
    { name: 'Salle Émeraude', emoji: '🟢', theme: 'emeraude', gaps: [], felt: 0x0c4a52, table: 'poker_6max_2' },
    { name: 'Salle Saphir', emoji: '🔵', theme: 'saphir', gaps: [], felt: 0x3a1052, table: 'poker_6max_3' }
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
      ctx.buildRoom(def.theme, def.gaps, false, r === 0 ? [0, Math.PI / 2, -Math.PI / 2] : [Math.PI / 2, -Math.PI / 2]);   // ni banquette ni tableau devant les portes
      ctx.roomColliders.forEach(function (o) { room.colliders.push({ x: cx + o.x * SC, z: o.z * SC, r: o.r * SC }); });
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

    // portes entre les salons : chaque salon a deux grandes portes dorées (à droite vers le salon suivant, à gauche vers le précédent) ;
    // on franchit la porte (fondu au noir) et on réapparaît dans l'autre salon, devant sa porte réciproque
    var goldM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.6, emissive: 0x2a1d00 });
    var DOOR_STYLE = {
      rouge:    { leaf: '#5a1224', leaf2: '#2e0911', frame: 0x3a0a14, pil: 0x6a1a2c, glow: 0xffe2a8, suit: '♠' },
      emeraude: { leaf: '#0f5a3d', leaf2: '#06281c', frame: 0x0b3a27, pil: 0xdfe8da, glow: 0xdfffe8, suit: '♣' },
      saphir:   { leaf: '#1f4596', leaf2: '#0b1a44', frame: 0x14265c, pil: 0xdbe4f6, glow: 0xdbe8ff, suit: '♦' }
    };
    function leafTexture(st) {
      var cv = mkCanvas(256, 768), x = cv.getContext('2d');
      var gr = x.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, st.leaf2); gr.addColorStop(0.5, st.leaf); gr.addColorStop(1, st.leaf2);
      x.fillStyle = gr; x.fillRect(0, 0, 256, 768);
      function panel(px, py, pw, ph) {
        x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(px, py, pw, ph);
        x.strokeStyle = 'rgba(212,166,42,0.95)'; x.lineWidth = 5; x.strokeRect(px, py, pw, ph);
        x.strokeStyle = 'rgba(212,166,42,0.5)'; x.lineWidth = 2; x.strokeRect(px + 12, py + 12, pw - 24, ph - 24);
      }
      panel(26, 28, 204, 420); panel(26, 474, 204, 266);
      x.fillStyle = 'rgba(212,166,42,0.9)'; x.beginPath(); x.moveTo(128, 160); x.lineTo(172, 238); x.lineTo(128, 316); x.lineTo(84, 238); x.closePath(); x.fill();
      x.fillStyle = st.leaf2; x.beginPath(); x.moveTo(128, 188); x.lineTo(152, 238); x.lineTo(128, 288); x.lineTo(104, 238); x.closePath(); x.fill();
      x.fillStyle = 'rgba(212,166,42,0.9)'; x.beginPath(); x.arc(128, 238, 9, 0, 7); x.fill();
      x.font = '700 84px ' + SERIF; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(st.suit, 128, 610);
      return mkTex(cv);
    }
    function boxF(gr, bw, bh, front, x, y, m) {      // boîte qui part de 0,25 m derrière l'origine (noyée dans le mur) jusqu'à `front` devant
      var b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, front + 0.25), m); b.position.set(x, y, (front - 0.25) / 2); gr.add(b); return b;
    }
    function addLuxDoor(cx, a, themeKey, label, go) {
      var st = DOOR_STYLE[themeKey], w = 2.0, h = 2.95, rad = WALL_R - 0.17;
      var spec = { x: cx + Math.sin(a) * rad, z: Math.cos(a) * rad, nx: -Math.sin(a), nz: -Math.cos(a), w: w, h: h, go: go };
      var gr = new THREE.Group(); gr.position.set(spec.x, 0, spec.z); gr.rotation.y = Math.atan2(spec.nx, spec.nz); g.add(gr);
      var frameM = new THREE.MeshStandardMaterial({ color: st.frame, roughness: 0.5, metalness: 0.1 });
      var pilM = new THREE.MeshStandardMaterial({ color: st.pil, roughness: 0.35, metalness: 0.15 });
      // lueur derrière les battants
      var gc = mkCanvas(64, 128), gx = gc.getContext('2d'), gg = gx.createLinearGradient(0, 0, 0, 128), c3 = new THREE.Color(st.glow);
      gg.addColorStop(0, '#fff6d8'); gg.addColorStop(0.5, 'rgb(' + Math.round(c3.r * 255) + ',' + Math.round(c3.g * 255) + ',' + Math.round(c3.b * 255) + ')'); gg.addColorStop(1, '#1a0d05');
      gx.fillStyle = gg; gx.fillRect(0, 0, 64, 128);
      var portal = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: mkTex(gc) })); portal.position.set(0, h / 2, -0.08); gr.add(portal);
      // cadre : montants dorés, pilastres, bases et chapiteaux, entablement, corniche, fronton avec médaillon
      [-1, 1].forEach(function (s) {
        boxF(gr, 0.06, h, 0.06, s * (w / 2 + 0.03), h / 2, goldM);
        boxF(gr, 0.3, h + 0.1, 0.14, s * (w / 2 + 0.2), (h + 0.1) / 2, pilM);
        boxF(gr, 0.42, 0.14, 0.2, s * (w / 2 + 0.2), 0.07, goldM);
        boxF(gr, 0.42, 0.12, 0.2, s * (w / 2 + 0.2), h + 0.1, goldM);
      });
      boxF(gr, w + 0.1, 0.24, 0.1, 0, h + 0.06, frameM);               // linteau : ferme l'espace entre les battants et l'entablement (plus de mur visible)
      boxF(gr, w + 0.1, 0.04, 0.12, 0, h - 0.02, goldM);
      boxF(gr, w + 1.14, 0.3, 0.16, 0, h + 0.31, frameM);
      boxF(gr, w + 1.34, 0.08, 0.24, 0, h + 0.5, goldM);
      var bw = w + 1.34, ph = 0.55, shape = new THREE.Shape();
      shape.moveTo(-bw / 2, 0); shape.lineTo(bw / 2, 0); shape.lineTo(0, ph); shape.closePath();
      var ped = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }), frameM); ped.position.set(0, h + 0.54, -0.25); gr.add(ped);
      var sl = Math.hypot(bw / 2, ph), ang = Math.atan2(ph, bw / 2);
      [-1, 1].forEach(function (s) {
        var rib = new THREE.Mesh(new THREE.BoxGeometry(sl, 0.06, 0.04), goldM);
        rib.position.set(s * bw / 4, h + 0.54 + ph / 2 + 0.02, 0.1); rib.rotation.z = -s * ang; gr.add(rib);
      });
      var mc = mkCanvas(128, 128), mx = mc.getContext('2d');
      mx.fillStyle = '#12080f'; mx.beginPath(); mx.arc(64, 64, 60, 0, 7); mx.fill(); mx.strokeStyle = '#c9a227'; mx.lineWidth = 8; mx.stroke();
      mx.fillStyle = '#f3cf62'; mx.font = '700 70px ' + SERIF; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.fillText(st.suit, 64, 70);
      var med = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), new THREE.MeshBasicMaterial({ map: mkTex(mc) })); med.position.set(0, h + 0.54 + 0.24, 0.105); gr.add(med);
      var pc = mkCanvas(512, 72), px = pc.getContext('2d');
      px.fillStyle = '#12080f'; px.fillRect(0, 0, 512, 72); px.strokeStyle = '#c9a227'; px.lineWidth = 5; px.strokeRect(3, 3, 506, 66);
      px.fillStyle = '#f3cf62'; px.font = '800 36px ' + SERIF; px.textAlign = 'center'; px.textBaseline = 'middle'; px.fillText(label, 256, 38, 480);
      var plq = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.21), new THREE.MeshBasicMaterial({ map: mkTex(pc) })); plq.position.set(0, h + 0.31, 0.165); gr.add(plq);
      // battants laqués à panneaux dorés, poignées dorées
      var leafM = new THREE.MeshStandardMaterial({ map: leafTexture(st), roughness: 0.3, metalness: 0.2 });
      function leaf(sx) {
        var piv = new THREE.Group(); piv.position.set(sx * (w / 2), 0, 0.02); gr.add(piv);
        var m = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.02, h - 0.04, 0.07), leafM); m.position.set(-sx * (w / 4), h / 2, 0); piv.add(m);
        var hd = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), goldM); hd.position.set(-sx * (w / 2 - 0.14), h * 0.47, 0.07); piv.add(hd);
        return piv;
      }
      var L = leaf(-1), R = leaf(1);
      var d = { spec: spec, g: gr, L: L, R: R, open: 0 };
      room.doors.push(d);
      return d;
    }
    function arrival(toR, a) { var rr = WALL_R - 1.9; return { x: toR * D + Math.sin(a) * rr, z: Math.cos(a) * rr, yaw: F.yawFor(-Math.sin(a), -Math.cos(a)) }; }
    ROOMS.forEach(function (def, r) {
      var next = (r + 1) % ROOMS.length, prev = (r + ROOMS.length - 1) % ROOMS.length;
      addLuxDoor(r * D, Math.PI / 2, def.theme, '→ ' + ROOMS[next].name, function (w) { var t = arrival(next, -Math.PI / 2); w.teleport(t.x, t.z, t.yaw); });
      addLuxDoor(r * D, -Math.PI / 2, def.theme, '← ' + ROOMS[prev].name, function (w) { var t = arrival(prev, Math.PI / 2); w.teleport(t.x, t.z, t.yaw); });
    });

    // on reste dans les salles rondes : jamais dans le vide derrière un mur
    function inside(px, pz) {
      for (var r = 0; r < ROOMS.length; r++) if (Math.hypot(px - r * D, pz) < WALL_R - 0.55) return true;
      return false;
    }
    room.constrain = function (p) {
      var RR = WALL_R - 0.45, best = null, bd = 1e9;
      for (var r = 0; r < ROOMS.length; r++) {
        var dx = p.x - r * D, d = Math.hypot(dx, p.z);
        if (d <= RR) return;                                  // dans une salle : rien à faire
        var qx = r * D + dx / d * RR, qz = p.z / d * RR, dd = (qx - p.x) * (qx - p.x) + (qz - p.z) * (qz - p.z);
        if (dd < bd) { bd = dd; best = { x: qx, z: qz }; }
      }
      if (best) { p.x = best.x; p.z = best.z; }
    };

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
          var mine = !!(room.seat && room.seat.slot === s && room.seat.first);   // en 1re personne seulement, je ne vois pas mon personnage (je suis dedans)
          s.person.visible = !!p && !mine; s.chair.visible = !p && !mine;
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
      var l = document.querySelector('#pokerViewBtn .pv-label'); if (l) l.textContent = '3e pers.';
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
      // 3e personne : derrière la chaise, vue d'ensemble ; 1re personne : à hauteur des yeux, juste au-dessus de la table
      var tgt = st.first ? { back: -0.12, h: 1.3, aim: 0.25, fov: 66 } : { back: Math.max(0.9, 3.2 - dl), h: 3.0, aim: 0.3, fov: 58 };
      if (!st.cam) st.cam = { back: tgt.back, h: tgt.h, aim: tgt.aim, fov: tgt.fov };
      ['back', 'h', 'aim', 'fov'].forEach(function (q) { st.cam[q] += (tgt[q] - st.cam[q]) * k; });
      var ex = st.slot.x - ux * st.cam.back, ez = st.slot.z - uz * st.cam.back, ey = st.cam.h;
      var a = Math.atan2(ux, -uz) + st.yaw, p = Math.atan2(0.75 - ey, dl + st.cam.back - st.cam.aim) + st.pitch;
      var tx = ex + Math.sin(a) * Math.cos(p) * 5, tz = ez - Math.cos(a) * Math.cos(p) * 5, ty = ey + Math.sin(p) * 5;
      return { cx: ex, cy: ey, cz: ez, tx: tx, ty: ty, tz: tz, fov: st.cam.fov };
    };
    // boutons « 1re / 3e pers. » (et touche V) du poker : on change de point de vue dans la salle
    // touche V (la scène cachée du poker n'écoute plus : on l'écoute ici, seulement quand on est assis)
    var onKeyV = function (e) {
      if ((e.key === 'v' || e.key === 'V') && room.seat && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) room.toggleView();
    };
    window.addEventListener('keydown', onKeyV);
    room.toggleView = function () {
      var st = room.seat; if (!st) return;
      st.first = !st.first; st.yawG = st.pitchG = 0; shownKey = ''; refreshSeats();
      var l = document.querySelector('#pokerViewBtn .pv-label'); if (l) l.textContent = st.first ? '1re pers.' : '3e pers.';
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
      var PM = window.PokerMulti, view = PM && PM.inWorld && PM.mode === 'multi' ? PM.lastView : null, nowMs = Date.now();
      room.salles.forEach(function (salle) {
        var mineTable = view && view.tableId === salle.def.table;
        var sp = room.views[salle.def.table];
        if (mineTable) { salle.live = true; tickGame(salle, view, PM.game); }
        else if (sp && nowMs - sp.at < 8000) { salle.live = true; tickGame(salle, sp.view, { communityCards: sp.view.community || [] }); }   // on regarde la partie des autres, sans y jouer
        else if (salle.live) { salle.live = false; clearGame(salle); }
      });
    }
    // parties des autres tables (cartes cachées, pot, mises, board) : lues sur le serveur comme un spectateur, pour les voir se jouer depuis la salle
    room.views = {};
    function spectate(I, me) {
      var PM = window.PokerMulti, mine = PM && PM.inWorld && PM.mode === 'multi' ? PM.tableId : null;
      return Promise.all(room.tables.filter(function (t) {
        return t.count > 0 && t.id !== mine && ROOMS.some(function (d) { return d.table === t.id; });
      }).map(function (t) {
        return I.api('GET', { table: t.id, user: me || 'invité', device: I.deviceId() })
          .then(function (d) { if (d && d.table) room.views[t.id] = { view: d.table, at: Date.now() }; })
          .catch(function () { /* on réessaie au prochain tour */ });
      }));
    }
    room.playSolo = function () {
      if (world.trans || !window.PokerMulti) return;
      window.PokerMulti.worldIntent = { solo: true };
      world.exitGame('poker');
    };

    /* ----- interface : l'état des trois salles + le solo ----- */
    injectCss();
    room.hudBottom =
      '<div class="prm"><div class="prm-t"><i class="fl-spade" style="color:#ef4444"></i> Salles de poker</div><div class="prm-list" data-s3d="prlist"></div>' +
      '<div class="prm-info" data-s3d="prinfo"></div>' +
      '<button class="prm-solo" data-s3d="prsolo"><i class="fa-solid fa-robot"></i> Jouer seul contre les bots</button></div>';
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
        // pastille plate de la couleur de la salle à la place de l'emoji rond
        var point = { '🔴': '#ef4444', '🟢': '#10b981', '🔵': '#3b82f6' }[d.emoji];
        var pastille = point ? '<i class="fa-solid fa-circle" style="color:' + point + ';font-size:9px"></i>' : d.emoji;
        return '<div class="prm-r' + (r === here ? ' on' : '') + '"><span>' + pastille + ' ' + d.name.replace('Salle ', '') + '</span><b>' + (t ? t.count + '/' + t.maxSeats : '–') + '</b></div>';
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
      p.then(function (d) { room.tables = d.tables || []; room.offline = false; shownKey = ''; refreshSeats(); return spectate(I, me); })
        .catch(function () { room.offline = true; syncHud(); })
        .then(function () { if (room.netOn && !world.dead) room.pollT = setTimeout(poll, 1500); });
    }
    room.netStart = function () { room.netOn = true; clearTimeout(room.pollT); poll(); };
    room.netStop = function () { room.netOn = false; clearTimeout(room.pollT); };

    room.hint = function (w) {
      return 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · clique-glisse : regarder · les grandes portes dorées mènent aux autres salons · approche-toi d\'une chaise ou d\'un canapé pour t\'asseoir (E ou clic)' + (w.full ? ' · Échap : quitter' : '');
    };
    /* ----- s'asseoir sur les canapés : on garde la vue d'une personne assise, on regarde autour à la souris, on se lève en marchant ----- */
    room.sofa = null; room.ghost = false;
    function standFromSofa() {
      var s = room.sofa, p = world.player;
      room.sofa = null; room.ghost = false; p.jy = 0;
      if (!s) return;
      var dx = s.cx - s.x, dz = -s.z, d = Math.hypot(dx, dz) || 1;
      p.x = s.x + dx / d * 1.5; p.z = s.z + dz / d * 1.5;
    }
    function sitOnSofa(s) {
      if (world.trans || world.mode !== 'room' || room.sofa) return;
      var p = world.player;
      p.x = s.x; p.z = s.z; p.yaw = F.yawFor(s.cx - s.x, -s.z); p.pitch = -0.04; p.jy = -0.55; p.air = false; p.vy = 0;
      room.sofa = s; room.ghost = true;
      world.flash('Assis sur le canapé · bouge (ZQSD) pour te lever');
    }
    room.salles.forEach(function (salle) {
      salle.ctx.roomSofas.forEach(function (a) {
        [-0.17, 0, 0.17].forEach(function (off) {
          var ang = a + off, spot = { cx: salle.cx, x: salle.cx + Math.sin(ang) * 9.75 * SC, z: Math.cos(ang) * 9.75 * SC };
          var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10), new THREE.MeshBasicMaterial({ visible: false }));
          hit.position.set(spot.x, 0.55, spot.z); g.add(hit);
          room.interactables.push({
            hit: hit, x: spot.x, z: spot.z, radius: 0.95,
            enabled: function () { return !room.sofa && world.mode === 'room'; },
            prompt: function () { return '🛋️ S\'asseoir sur le canapé'; },
            use: function () { sitOnSofa(spot); }
          });
        });
      });
    });

    room.spawn = function () { return { x: 0, z: WALL_R - 2.4, yaw: 0 }; };
    var last = { x: 0, z: WALL_R - 2.4 };
    room.update = function (dt) {
      updateGame(dt);
      var p = world.player;
      if (room.sofa) {          // assis sur un canapé : on se lève dès qu'on veut bouger
        var kk = world.keys, sk = world.stick;
        if (world.mode !== 'room' || world.trans || kk.f || kk.b || kk.l || kk.r || kk.jump || Math.abs(sk.x) > 0.3 || Math.abs(sk.y) > 0.3) standFromSofa();
        else { p.x = room.sofa.x; p.z = room.sofa.z; p.jy = -0.55; }
      }
      if (inside(p.x, p.z)) { last.x = p.x; last.z = p.z; }
      else if (inside(p.x, last.z)) p.z = last.z;                 // on glisse le long des murs plutôt que de les traverser
      else if (inside(last.x, p.z)) p.x = last.x;
      else { p.x = last.x; p.z = last.z; }
      room.salles.forEach(function (salle) {
        salle.sign.rotation.y = Math.atan2(world.camera.position.x - salle.sign.position.x, world.camera.position.z - salle.sign.position.z);
        salle.sign.position.y = 2.45 + Math.sin(world.clock * 1.4 + salle.r) * 0.03;
      });
    };
    room.onEnter = function () { room.sofa = null; room.ghost = false; world.player.jy = 0; last.x = world.player.x; last.z = world.player.z; };
    room.dispose = function () {
      window.removeEventListener('keydown', onKeyV); room.salles.forEach(function (s) { s.tex.dispose(); }); };
    return room;
  }

  function injectCss() {
    if (document.getElementById('prm-css')) return;
    var st = document.createElement('style'); st.id = 'prm-css';
    st.textContent =
      '.prm{position:absolute;right:14px;bottom:14px;width:270px;background:rgba(8,5,12,.86);border:1px solid rgba(201,162,39,.55);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;pointer-events:auto;color:#f4e3b0}' +
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
