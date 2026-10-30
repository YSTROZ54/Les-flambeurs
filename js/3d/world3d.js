/* =====================================================================
   world3d.js — Le « monde » 3D des Flambeurs : on marche, on pousse des portes, on change de salle,
   on voit les autres joueurs en temps réel. Les salles (hall, machines à sous…) s'y branchent.
   ---------------------------------------------------------------------
   Une salle = F3D.registerRoom('id', function (world, cfg) { return room; }) avec :
     room.group, room.bounds, room.colliders, room.topic, room.title, room.spawn(from),
     room.interactables (sièges, panneaux…), room.update(dt), room.onEnter()/onLeave(),
     et éventuellement : seatPose / seatDrag / seatClick / remotePose / onRtMsg / hudTop / hudBottom …
   Ce fichier ne contient rien de propre à un jeu : l'argent et les règles restent dans la page.
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, fmtN = F.fmtN, MONO = F.MONO, SERIF = F.SERIF, TAU = F.TAU;
  var Q = F.quality;

  // direction (dx, dz) -> angle de regard du joueur (0 = vers -z)
  F.yawFor = function (dx, dz) { return Math.atan2(dx, -dz); };
  // Sensibilité de la souris verrouillée (×1 = 0,0022 rad par pixel), gardée d'une visite à l'autre
  F.sensi = function (v) {
    try {
      if (v !== undefined) localStorage.setItem('f3d_sensi', String(v));
      var n = parseFloat(localStorage.getItem('f3d_sensi'));
      return n >= 0.2 && n <= 3 ? n : 1;
    } catch (e) { return v || 1; }
  };

  /* ===================== LE MONDE ===================== */
  function World(container, opts) {
    opts = opts || {};
    var self = this;
    this.opts = opts;
    this.container = container;
    this.low = opts.low !== undefined ? !!opts.low : F.isMobile();
    this.touch = F.isTouch();
    Q.start(this.low);
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Q.pixelRatio());
    this.renderer.setClearColor(0x07050c, 1);
    var dom = this.dom = this.renderer.domElement;
    dom.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;outline:none';
    container.appendChild(dom);
    // Sans carte graphique (accélération matérielle coupée dans le navigateur), la 3D tombe vers 15-20 images/s : on prévient
    this.sansGpu = false;
    try {
      var gl = this.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.sansGpu = /swiftshader|basic render|llvmpipe|software/i.test(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '');
    } catch (e) { /* carte inconnue : on ne prévient pas */ }
    this.sensi = F.sensi();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07050c);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80);
    this.vm = F.createViewModel ? F.createViewModel('') : null; this.heldId = '';   // ta main à la première personne (hand3d.js) et l'objet que tu tiens

    this.rooms = {}; this.room = null; this.roomIds = opts.rooms || [];
    this.player = { x: 0, z: 9, yaw: 0, pitch: -0.04 };
    this.keys = {}; this.stick = { x: 0, y: 0 }; this.mouse = { nx: 0, ny: 0, inside: false };
    this.mode = 'room'; this.blend = 0; this.seatRoom = null; this.near = null;
    this.remote = {}; this.full = false; this.trans = false;
    this.emoId = ''; this.emoN = 0; this.emoK = 0; this.emoYaw0 = 0; this.selfPerson = null;   // danse / emote en cours (voir « danses et emotes » plus bas)
    this.clock = 0; this.last = 0; this.w = 0; this.h = 0; this.running = true; this.dead = false; this.hudT = 0; this.pv = { x: 0, z: 0 };
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();

    this._buildHud();
    this._bindPointer();
    this._bindKeys();
    this.enterRoom(opts.start || this.roomIds[0], { instant: true });
    this._frame = function (now) { self._loop(now); };
    this._raf = requestAnimationFrame(this._frame);
  }

  /* ---------- salles ---------- */
  World.prototype.getRoom = function (id) {
    if (this.rooms[id]) return this.rooms[id];
    var factory = F.roomFactory(id);
    if (!factory) return null;
    var room = factory(this, this.opts);
    room.id = id;
    room.doors = room.doors || []; room.interactables = room.interactables || []; room.colliders = room.colliders || [];
    room.group.visible = false;
    this.scene.add(room.group);
    this.rooms[id] = room;
    return room;
  };
  World.prototype.hasRoom = function (id) { return this.roomIds.indexOf(id) >= 0; };

  World.prototype.enterRoom = function (id, o) {
    o = o || {};
    var room = this.getRoom(id);
    if (!room) return false;
    var prev = this.room;
    if (prev === room) return true;
    if (prev) {
      if (this.mode === 'seat' && prev.forceStand) prev.forceStand();
      this._resetEmote();
      this._netStop();
      this._clearRemotes();
      if (prev.onLeave) prev.onLeave(this);
      prev.group.visible = false;
      if (prev.hudBottom || prev.hudTop) { this.elRoomTop.innerHTML = ''; this.elRoomBottom.innerHTML = ''; }
    }
    this.room = room; room.group.visible = true;
    this.mode = 'room'; this.blend = 0; this.seatRoom = null; this.near = null; this.keys = {};
    var sp = room.spawn ? room.spawn(o.from || (prev && prev.id) || null) : { x: 0, z: 0, yaw: 0 };
    this.player.x = sp.x; this.player.z = sp.z; this.player.yaw = sp.yaw || 0; this.player.pitch = -0.04; this.player.jy = 0; this.player.air = false; this.player.vy = 0;
    this.pv.x = this.pv.z = 0;
    if (room.hudTop) this.elRoomTop.innerHTML = room.hudTop;
    if (room.hudBottom) this.elRoomBottom.innerHTML = room.hudBottom;
    if (room.bindHud) room.bindHud(this.hud);
    if (room.onEnter) room.onEnter(this);
    this._netStart();
    this._setHint();
    this.w = 0; Q.resetGrace();
    this._showTitle(room.title, room.subtitle);
    return true;
  };

  // changement de salle avec fondu au noir ; at (facultatif) : { x, z, yaw } ou fonction(salle) qui le donne, pour arriver ailleurs qu'à l'entrée
  World.prototype.goRoom = function (id, from, at) {
    var self = this;
    if (this.trans || !this.hasRoom(id)) return;
    this.pv.x = 0; this.pv.z = 0;
    this._rtSend(true);
    this._rtBye();
    this.trans = true; this.elFade.classList.add('on');
    setTimeout(function () {
      if (self.dead) return;
      self.enterRoom(id, { from: from || (self.room && self.room.id) });
      var pos = typeof at === 'function' ? at(self.room) : at;
      if (pos) { var p = self.player; p.x = pos.x; p.z = pos.z; p.yaw = pos.yaw || 0; }
      setTimeout(function () { self.elFade.classList.remove('on'); self.trans = false; }, 120);
    }, 380);
  };
  // sortie vers un autre jeu du site (menu classique ou jeu 2D / poker 3D)
  World.prototype.exitGame = function (key, door) {
    var self = this;
    if (this.trans) return;
    this._libererSouris();
    this.pv.x = 0; this.pv.z = 0;
    this._rtSend(true);
    this._rtBye();
    this.trans = true; this.elFade.classList.add('on');
    if (door) {   // au retour, on se retrouve devant la porte
      this.player.x = door.spec.x + door.spec.nx * 2.8; this.player.z = door.spec.z + door.spec.nz * 2.8;
      this.player.yaw = F.yawFor(door.spec.nx, door.spec.nz);
    }
    setTimeout(function () {
      if (!self.dead && self.opts.onExitGame) self.opts.onExitGame(key);
      setTimeout(function () { self.elFade.classList.remove('on'); self.trans = false; }, 500);
    }, 380);
  };

  World.prototype._showTitle = function (t, sub) {
    var el = this.elTitle, self = this;
    if (!t) return;
    el.innerHTML = t + (sub ? '<small>' + sub + '</small>' : '');
    el.classList.add('on'); clearTimeout(this._titleT);
    this._titleT = setTimeout(function () { el.classList.remove('on'); }, 2600);
  };

  /* ---------- portes qu'on pousse ---------- */
  // spec : { x, z, nx, nz (direction vers l'intérieur de la salle), w, h, label, sub, color, target }
  World.prototype.addDoor = function (room, spec) {
    var w = spec.w || 1.7, h = spec.h || 2.7, col = spec.color || 0xffd24a;
    var g = new THREE.Group(); g.position.set(spec.x, 0, spec.z); g.rotation.y = Math.atan2(spec.nx, spec.nz);
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.6, emissive: 0x2a1d00 });
    // thème de la porte (portes3d.js) : enseigne à logo, battants peints, cadre et décor aux couleurs du jeu ; sans thème, la porte dorée d'origine
    var th = spec.theme && F.DOOR_THEMES ? F.DOOR_THEMES[spec.theme] : null;
    var frameM = th ? new THREE.MeshStandardMaterial({ color: th.frame, roughness: 0.4, metalness: 0.5 }) : gold;
    // derrière les battants : « l'autre salle », un tunnel de néons de la couleur de la porte qui file vers le fond.
    // Le plan est posé devant les moulures du mur (sinon leur barre dorée traverse l'ouverture) et n'est repeint que porte ouverte.
    var c3 = new THREE.Color(col), cr = Math.round(c3.r * 255), cg = Math.round(c3.g * 255), cb = Math.round(c3.b * 255);
    var cs = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
    var PW = 160, PH = 256, pc = mkCanvas(PW, PH), px = pc.getContext('2d'), ptex = mkTex(pc);
    function paintPortal(t) {
      px.globalAlpha = 1; px.shadowBlur = 0; px.fillStyle = '#06020a'; px.fillRect(0, 0, PW, PH);
      var gl = px.createRadialGradient(PW / 2, PH * 0.55, 4, PW / 2, PH * 0.55, PH * 0.62);
      gl.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.5 + 0.2 * Math.sin(t * 3)).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      px.fillStyle = gl; px.fillRect(0, 0, PW, PH);
      px.lineJoin = 'round'; px.shadowColor = cs;
      for (var i = 0; i < 6; i++) {                                         // six cadres néon qui rétrécissent vers le centre
        var k = (t * 0.35 + i / 6) % 1, s = 1 - k * 0.94, a = Math.sin(Math.PI * k), rw = (PW - 10) * s, rh = (PH - 10) * s;
        px.globalAlpha = a; px.shadowBlur = 14; px.strokeStyle = cs; px.lineWidth = 2 + 5 * (1 - k);
        px.strokeRect((PW - rw) / 2, (PH - rh) / 2, rw, rh);
        px.shadowBlur = 0; px.strokeStyle = '#fff'; px.lineWidth = 1 + 1.5 * (1 - k);   // filament blanc au cœur du tube
        px.strokeRect((PW - rw) / 2, (PH - rh) / 2, rw, rh);
      }
      px.globalAlpha = 1; ptex.needsUpdate = true;
    }
    paintPortal(0);
    var portal = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: ptex }));
    portal.position.set(0, h / 2, 0.097); g.add(portal);   // devant la moulure du mur (face avant à 0.09), derrière les battants (0.105)
    function box(bw, bh, bd, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), frameM); m.position.set(x, y, z); g.add(m); }
    box(0.14, h + 0.22, 0.22, -(w / 2 + 0.07), (h + 0.22) / 2, 0.1); box(0.14, h + 0.22, 0.22, w / 2 + 0.07, (h + 0.22) / 2, 0.1);
    box(w + 0.28, 0.18, 0.22, 0, h + 0.1, 0.1);
    var wood = new THREE.MeshStandardMaterial({ color: th ? th.leaf : 0x4a1220, roughness: 0.55, metalness: 0.15 });
    var leafTex = null;
    if (th) {                                                              // un seul dessin pour les deux battants
      var lc = mkCanvas(256, Math.round(256 * (h - 0.3) / (w / 2 - 0.2)));
      th.paint(lc.getContext('2d'), lc.width, lc.height); leafTex = mkTex(lc);
    }
    var leafGeo = new THREE.BoxGeometry(w / 2 + 0.01, h - 0.04, 0.07);     // les deux battants se recouvrent de 1 cm : porte fermée, aucune fente au milieu
    function leaf(sx) {
      var piv = new THREE.Group(); piv.position.set(sx * (w / 2), 0, 0.14); g.add(piv);
      var m = new THREE.Mesh(leafGeo, wood); m.position.set(-sx * (w / 4), h / 2, 0); piv.add(m);
      var trim = leafTex
        ? new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 0.2, h - 0.3), new THREE.MeshLambertMaterial({ map: leafTex, emissive: 0x666666, emissiveMap: leafTex }))
        : new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.3, h - 0.5, 0.02), gold);
      trim.position.set(-sx * (w / 4), h / 2, leafTex ? 0.037 : 0.045); piv.add(trim);
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), frameM); knob.position.set(-sx * (w / 2 - 0.12), h * 0.45, 0.07); piv.add(knob);
      return piv;
    }
    var L = leaf(-1), R = leaf(1);   // L : charnière à gauche (x=-w/2), R : à droite
    // enseigne au-dessus : avec un thème, un logo à gauche et le nom à droite
    if (th) {
      var tc = mkCanvas(640, 160), ttex = mkTex(tc);
      F.paintDoorSign(tc, spec, th, function () { ttex.needsUpdate = true; });
      var tsign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.75), new THREE.MeshBasicMaterial({ map: ttex }));
      tsign.position.set(0, h + 0.7, 0.2); g.add(tsign);
      if (th.deco) th.deco(g, w, h);
    }
    var sc = mkCanvas(512, 128), sx = sc.getContext('2d');
    sx.fillStyle = '#12080f'; sx.fillRect(0, 0, 512, 128); sx.strokeStyle = '#c9a227'; sx.lineWidth = 6; sx.strokeRect(4, 4, 504, 120);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#f3cf62'; sx.shadowColor = '#ffb300'; sx.shadowBlur = 10;
    sx.font = '800 46px ' + SERIF; sx.fillText(spec.label || '', 256, spec.sub ? 48 : 66, 480);
    if (spec.sub) { sx.shadowBlur = 0; sx.fillStyle = '#d9c88f'; sx.font = '600 24px ' + MONO; sx.fillText(spec.sub, 256, 96, 480); }
    if (!th) {
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: mkTex(sc) }));
      sign.position.set(0, h + 0.62, 0.2); g.add(sign);
    }
    room.group.add(g);
    var d = { spec: spec, g: g, L: L, R: R, open: 0, paint: paintPortal };
    room.doors.push(d);
    return d;
  };

  World.prototype._updateDoors = function (dt) {
    var room = this.room, p = this.player;
    if (!room) return;
    for (var i = 0; i < room.doors.length; i++) {
      var d = room.doors[i], s = d.spec, dx = p.x - s.x, dz = p.z - s.z;
      var dn = dx * s.nx + dz * s.nz, lat = dx * s.nz - dz * s.nx;
      var near = this.mode === 'room' && this.blend === 0 && !this.trans && Math.abs(lat) < (s.w || 1.7) / 2 + 0.5 && dn > -0.4 && dn < 2.6;
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
      if (d.open > 0.02 && d.paint) d.paint(performance.now() / 1000);       // néons animés derrière la porte, seulement tant qu'elle est entrouverte
      var a = d.open * 1.5;
      d.L.rotation.y = a; d.R.rotation.y = -a;
      if (near && d.open > 0.55 && Math.abs(lat) < (s.w || 1.7) / 2 - 0.1 && dn < 0.9) { this._useDoor(d); return; }
    }
  };
  // se déplacer dans la même salle derrière un fondu au noir (portes entre deux salons d'une même salle)
  World.prototype.teleport = function (x, z, yaw) {
    var self = this;
    if (this.trans) return;
    this.trans = true; this.elFade.classList.add('on');
    setTimeout(function () {
      if (self.dead) return;
      var p = self.player;
      p.x = x; p.z = z; p.yaw = yaw; p.pitch = -0.04; p.jy = 0; p.air = false; p.vy = 0; self.pv.x = self.pv.z = 0;
      setTimeout(function () { self.elFade.classList.remove('on'); self.trans = false; }, 120);
    }, 380);
  };
  World.prototype._useDoor = function (d) {
    if (d.spec.go) { d.spec.go(this); return; }
    var t = d.spec.target;
    if (typeof t === 'string' && this.hasRoom(t)) this.goRoom(t, this.room.id);
    else this.exitGame(typeof t === 'string' ? t : (t && t.game), d);
  };

  /* ---------- interface ---------- */
  World.prototype._buildHud = function () {
    var self = this;
    F.injectCss();
    var hud = document.createElement('div'); hud.className = 's3d-hud'; hud.setAttribute('data-mode', 'room');
    hud.innerHTML =
      '<div class="s3d-top"><div class="s3d-bal s3d-bal-top"><i class="fl-coin"></i> <span data-s3d="bal">0</span></div>' +
      '<div class="s3d-btns">' +
      (this.opts.menu ? '<button class="s3d-cam" data-s3d="menu"><i class="fa-solid fa-house"></i> Accueil</button>' : '') +
      (this.touch ? '' : '<label class="s3d-cam s3d-sensi" title="Sensibilité de la souris en grand écran"><i class="fa-solid fa-computer-mouse"></i> Sensi <input type="range" min="0.2" max="3" step="0.1" data-s3d="sensi"><b data-s3d="sensival"></b></label>') +
      '<button class="s3d-cam" data-s3d="qual"><i class="fa-solid fa-gear"></i> Qualité</button>' +
      '<button class="s3d-cam s3d-full-btn" data-s3d="full"></button><span data-s3d="roomtop" style="display:contents"></span></div></div>' +
      '<div class="s3d-hint s3d-hint-chips s3d-room-only" data-s3d="hint"></div>' +
      (this.sansGpu ? '<div class="s3d-gpu"><i class="fa-solid fa-triangle-exclamation"></i> Ta carte graphique n’est pas utilisée, la 3D est ralentie. Active « Utiliser l’accélération graphique si disponible » dans les paramètres de ton navigateur (rubrique Système), puis relance-le.</div>' : '') +
      '<div class="s3d-title" data-s3d="title"></div>' +
      '<button class="s3d-sit s3d-room-only" data-s3d="sit" style="display:none"></button>' +
      '<div class="s3d-stick s3d-room-only" data-s3d="stick" style="display:none"><i></i></div>' +
      '<div data-s3d="roombottom" style="display:contents"></div>' +
      '<div class="s3d-fade" data-s3d="fade"></div>';
    this.container.appendChild(hud);
    this.hud = hud;
    function q(k) { return hud.querySelector('[data-s3d="' + k + '"]'); }
    this.elBal = q('bal'); this.elFull = q('full'); this.elSit = q('sit'); this.elStick = q('stick'); this.elHint = q('hint');
    this.elTitle = q('title'); this.elFade = q('fade'); this.elQual = q('qual'); this.elMenu = q('menu');
    this.elRoomTop = q('roomtop'); this.elRoomBottom = q('roombottom');
    this._paintFullBtn();
    if (this.opts.hall && F.initPlayerHud) this.ph = F.initPlayerHud(this);   // HUD du joueur, roue des emotes et téléphone (hud3d.js) : monde complet seulement
    if (this.touch) this.elStick.style.display = '';
    this.elFull.addEventListener('click', function () { self.setFull(!self.full); });
    this.elQual.addEventListener('click', function () { Q.cycle(); self._applyQuality(); self.syncHud(); });
    var sensi = q('sensi'), sensiVal = q('sensival');
    if (sensi) {
      sensi.value = String(this.sensi); sensiVal.textContent = this.sensi.toFixed(1);
      sensi.addEventListener('input', function () { self.sensi = F.sensi(parseFloat(sensi.value)); sensiVal.textContent = self.sensi.toFixed(1); });
      sensi.addEventListener('change', function () { sensi.blur(); });   // ZQSD refait marcher tout de suite
    }
    if (this.elMenu) this.elMenu.addEventListener('click', function () { if (self.opts.onMenu) self.opts.onMenu(); });
    this.elSit.addEventListener('click', function () { if (self.near) self.near.use(self); });
    // joystick tactile
    var knob = this.elStick.querySelector('i'), st = this.elStick, act = false;
    function mv(e) {
      var rc = st.getBoundingClientRect(), dx = e.clientX - (rc.left + rc.width / 2), dy = e.clientY - (rc.top + rc.height / 2);
      var L = Math.hypot(dx, dy), M = rc.width / 2 - 10; if (L > M) { dx *= M / L; dy *= M / L; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      self.stick.x = dx / M; self.stick.y = -dy / M;
    }
    st.addEventListener('pointerdown', function (e) { act = true; try { st.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } mv(e); });
    st.addEventListener('pointermove', function (e) { if (act) mv(e); });
    function end() { act = false; self.stick.x = 0; self.stick.y = 0; knob.style.transform = ''; }
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  };

  World.prototype._setHint = function () {
    var r = this.room, t = r && r.hint ? r.hint(this) : null;
    if (!t) {
      t = this.touch ? 'Joystick : marcher · glisse : regarder'
        : this.full ? 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · la souris tourne la vue (bords de l\'écran) · Échap : quitter'
        : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · clique-glisse : regarder';
    }
    if (this.full && !this.touch) {
      t = t.replace(/clique-glisse : regarder|la souris tourne la vue( (bords de l'écran))?/, 'clic : la souris pilote la vue');
      if (t.indexOf('la souris pilote la vue') < 0) t += ' · clic : la souris pilote la vue';
      t = t.replace('Échap : quitter', 'Échap : libérer la souris, puis quitter');
    }
    this.elHint.innerHTML = hintHtml(t); this.elHint.style.display = ''; this.hintShown = this.clock || 0;
  };
  // Aide en bas de l'écran : « touches : action · touches : action » devient une rangée de pastilles (logo coloré, touches en keycaps, action)
  var HINT_ICONS = [
    [/marcher|joystick/, 'fa-person-walking', '52,211,153'], [/courir/, 'fa-person-running', '251,191,36'], [/sauter/, 'fa-angles-up', '56,189,248'],
    [/porte|pousser/, 'fa-door-open', '245,158,11'], [/quitter|lib[ée]rer/, 'fa-right-from-bracket', '248,113,113'], [/souris|vue|regarder|glisse/, 'fa-computer-mouse', '167,139,250'],
    [/parler|prendre place|asseoir|s'asseoir/, 'fa-hand', '251,146,60'], [/cartes|barre/, 'fa-layer-group', '244,114,182'], [/parier|pari|miser|jouer/, 'fa-coins', '250,204,21']
  ];
  function hintHtml(t) {
    var esc = function (v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    return String(t).split(' · ').map(function (clause) {
      var i = clause.indexOf(' : '), keys = i > 0 ? clause.slice(0, i) : '', label = i > 0 ? clause.slice(i + 3) : clause, low = clause.toLowerCase(), ic = ['fa-circle-info', '148,163,184'], k;
      for (k = 0; k < HINT_ICONS.length; k++) if (HINT_ICONS[k][0].test(low)) { ic = HINT_ICONS[k].slice(1); break; }
      var kb = keys ? keys.split(' / ').map(function (x) { return '<kbd>' + esc(x) + '</kbd>'; }).join('') : '';
      return '<span class="s3d-chip" style="--c:' + ic[1] + '"><i class="fa-solid ' + ic[0] + '"></i>' + kb + '<em>' + esc(label) + '</em></span>';
    }).join('');
  }
  // Annonce en grand au centre haut : pastille dorée qui rebondit, reflet qui la traverse, barre qui se vide. L'emoji du début du message devient l'icône.
  // sub : ligne en dessous (facultative).
  World.prototype.flash = function (msg, sub) {
    var self = this, el = this._toast;
    if (!el) { el = this._toast = document.createElement('div'); el.className = 's3d-toast'; this.hud.appendChild(el); }
    var m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*([\s\S]*)$/u.exec(String(msg)), ic = m ? m[1] : '', tx = m ? m[2] : String(msg);
    el.innerHTML = '<span class="s3d-toast-ic"></span><span class="s3d-toast-tx"><b></b><small></small></span><i class="s3d-toast-bar"></i>';
    el.children[0].textContent = ic; el.children[0].style.display = ic ? '' : 'none';
    el.querySelector('b').textContent = tx;
    var sm = el.querySelector('small'); sm.textContent = sub || ''; sm.style.display = sub ? '' : 'none';
    el.classList.remove('on', 'out'); void el.offsetWidth; el.classList.add('on');          // relance l'animation même si une annonce est déjà là
    clearTimeout(this._flashT); clearTimeout(this._flashT2);
    this._flashT = setTimeout(function () { el.classList.add('out'); self._flashT2 = setTimeout(function () { el.classList.remove('on', 'out'); }, 450); }, 3400);
  };
  World.prototype._paintFullBtn = function () {
    var enter = '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit = '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>';
    this.elFull.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + (this.full ? exit : enter) + '</svg><span>' + (this.full ? 'Quitter le grand écran' : 'Grand écran') + '</span>';
    this.elFull.classList.toggle('on', this.full);
  };
  World.prototype.setFull = function (on) {
    on = !!on; if (on === this.full) return;
    this.full = on; this.mouse.inside = false;
    if (!on) this._libererSouris();
    this.container.classList.toggle('s3d-full', on);
    document.body.classList.toggle('s3d-full-on', on);
    this._paintFullBtn();
    Object.keys(this.rooms).forEach(function (k) { var r = this.rooms[k]; if (r.onFull) r.onFull(on); }, this);
    this.w = 0; this._setHint();
  };
  World.prototype._applyQuality = function () { this.renderer.setPixelRatio(Q.pixelRatio()); this.w = 0; Q.resetGrace(); };
  World.prototype.syncHud = function () {
    try { if (typeof state !== 'undefined' && state && typeof state.balance === 'number') this.elBal.textContent = fmtN(state.balance); } catch (e) { /* solde pas encore chargé */ }
    this.elQual.innerHTML = '<i class="fa-solid fa-gear"></i> ' + Q.label();
    this.hud.setAttribute('data-mode', this.blend > 0.5 ? 'seat' : 'room');
    if (this.ph) this.ph.sync();
    if (this.room && this.room.syncHud) this.room.syncHud(this);
  };

  /* ---------- clavier / souris / doigt ---------- */
  World.prototype._bindKeys = function () {
    var self = this, map = { KeyW: 'f', KeyZ: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyQ: 'l', KeyD: 'r', ArrowLeft: 'l', ArrowRight: 'r', Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run' };
    function ok(e) {
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return false;
      return self.running && !self.dead && self.container.clientWidth > 0 && self.mode === 'room' && !self.trans && !e.ctrlKey && !e.metaKey && !e.altKey;
    }
    this._kd = function (e) {
      if (!ok(e)) return;
      if (e.key === 'a' || e.key === 'A') return; // Touche A réservée aux Emotes (hud3d.js)
      if (map[e.code]) { self.keys[map[e.code]] = true; e.preventDefault(); }
      else if ((e.code === 'KeyF' || e.code === 'Enter') && self.near && self.blend === 0) { self._libererSouris(); self.near.use(self); e.preventDefault(); }
    };
    this._ku = function (e) { if (map[e.code]) self.keys[map[e.code]] = false; };
    this._blur = function () { self.keys = {}; };
    this._esc = function (e) {
      if (e.code !== 'Escape' || !self.full) return;
      if (document.pointerLockElement === self.dom || Date.now() - (self._libereLe || 0) < 300) return;
      self.setFull(false);
    };
    this._ph = function () { if (self.room && self.room.onPageHide) self.room.onPageHide(self); self._rtBye(); };
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku); window.addEventListener('blur', this._blur);
    window.addEventListener('keydown', this._esc); window.addEventListener('pagehide', this._ph);
  };

  World.prototype._bindPointer = function () {
    var self = this, dom = this.dom, drag = null;
    dom.addEventListener('pointerdown', function (e) {
      // Grand écran : comme dans les jeux, un clic verrouille la souris et la vue suit ses mouvements
      if (self.full && e.pointerType === 'mouse' && self.mode === 'room' && self.blend === 0 && document.pointerLockElement !== dom && dom.requestPointerLock) {
        try { var lock = dom.requestPointerLock(); if (lock && lock.catch) lock.catch(function () { /* refusé par le navigateur */ }); } catch (er) { /* refusé */ }
        drag = null;
        return;
      }
      drag = { x: e.clientX, y: e.clientY, pyaw: self.player.yaw, ppitch: self.player.pitch, moved: 0, mouse: e.pointerType === 'mouse', seat: null };
      if (self.mode === 'seat' && self.seatRoom && self.seatRoom.seatDragStart) drag.seat = self.seatRoom.seatDragStart();
      try { dom.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
    });
    // Souris (PC) : en grand écran, la vue suit la position du curseur sans cliquer
    this.container.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var rc = dom.getBoundingClientRect();
      self.mouse.nx = ((e.clientX - rc.left) / rc.width) * 2 - 1;
      self.mouse.ny = ((e.clientY - rc.top) / rc.height) * 2 - 1;
      self.mouse.inside = true;
    });
    this.container.addEventListener('pointerleave', function () { self.mouse.inside = false; });
    var SENSIBILITE = 0.0022;   // radians par pixel de souris à « Sensi 1.0 », comme une souris de jeu
    dom.addEventListener('mousemove', function (e) {
      if (document.pointerLockElement !== dom || self.mode !== 'room' || self.blend > 0 || self.trans || self.lookLocked) return;   // lookLocked : roue des danses ouverte, la vue reste figée
      self.player.yaw += e.movementX * SENSIBILITE * self.sensi;
      self.player.pitch = Math.max(-0.7, Math.min(0.6, self.player.pitch - e.movementY * SENSIBILITE * self.sensi));
    });
    document.addEventListener('pointerlockchange', function () {
      var on = document.pointerLockElement === dom;
      self.container.classList.toggle('s3d-locked', on);
      if (!on) self._libereLe = Date.now();
    });
    dom.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved < 6 || (drag.mouse && self.full)) return;
      if (self.mode === 'room') {
        if (self.blend > 0 || self.trans) return;
        self.player.yaw = drag.pyaw + dx * 0.005;
        if (drag.mouse) self.player.pitch = Math.max(-0.6, Math.min(0.5, drag.ppitch + dy * 0.004));
        return;
      }
      if (self.seatRoom && self.seatRoom.seatDrag) self.seatRoom.seatDrag(drag, dx, dy, self);
    });
    dom.addEventListener('pointerup', function (e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.moved < 6) self._click(e);
    });
    dom.addEventListener('pointercancel', function () { drag = null; });
  };

  World.prototype._click = function (e) {
    if (this.trans) return;
    var rc = this.dom.getBoundingClientRect();
    if (document.pointerLockElement === this.dom) this.ndc.set(0, 0);
    else this.ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    if (this.mode === 'room') {
      if (this.blend > 0 || !this.room) return;
      var its = this.room.interactables.filter(function (i) { return i.hit; });
      var hits = this.ray.intersectObjects(its.map(function (i) { return i.hit; }), false);
      if (hits[0]) for (var k = 0; k < its.length; k++) if (its[k].hit === hits[0].object) { this._libererSouris(); its[k].use(this, e); break; }
      return;
    }
    if (this.blend < 1) return;
    if (this.seatRoom && this.seatRoom.seatClick) this.seatRoom.seatClick(this.ray, e, this);
  };

  World.prototype._resize = function () {
    var w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    Object.keys(this.rooms).forEach(function (k) { var r = this.rooms[k]; if (r.onResize) r.onResize(w, h); }, this);
  };

  /* ---------- déplacement ---------- */
  World.prototype._movePlayer = function (dt) {
    var k = this.keys, p = this.player, room = this.room;
    p.yaw += ((k.tr ? 1 : 0) - (k.tl ? 1 : 0)) * 1.8 * dt;
    var fwd = (k.f ? 1 : 0) - (k.b ? 1 : 0) + this.stick.y, str = (k.r ? 1 : 0) - (k.l ? 1 : 0) + this.stick.x;
    var len = Math.hypot(fwd, str);
    if (this.emoId && (len > 0.05 || k.jump)) this.stopEmote();           // marcher ou sauter arrête la danse
    if (len > 1) { fwd /= len; str /= len; }
    var run = !!k.run && (fwd !== 0 || str !== 0), sp = (run ? 5.8 : 3.2) * dt, ox = p.x, oz = p.z;
    this.running2 = run;
    if (k.jump && !p.air) { p.air = true; p.vy = 4.3; p.jmp = (p.jmp || 0) + 1; }
    if (p.air) { p.vy -= 13 * dt; p.jy = (p.jy || 0) + p.vy * dt; if (p.jy <= 0) { p.jy = 0; p.vy = 0; p.air = false; } }
    p.x += (Math.sin(p.yaw) * fwd + Math.cos(p.yaw) * str) * sp;
    p.z += (-Math.cos(p.yaw) * fwd + Math.sin(p.yaw) * str) * sp;
    var b = room.bounds;
    p.x = Math.max(b.xMin, Math.min(b.xMax, p.x)); p.z = Math.max(b.zMin, Math.min(b.zMax, p.z));
    if (!room.ghost) for (var i = 0; i < room.colliders.length; i++) {          // on ne traverse ni les bornes ni les meubles (sauf assis sur un canapé : room.ghost)
      var c = room.colliders[i], dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.r && d > 0.0001) { p.x = c.x + dx / d * c.r; p.z = c.z + dz / d * c.r; }
    }
    if (room.constrain) room.constrain(p);                       // limites non rectangulaires (salles rondes, couloirs)
    var vk = Math.min(1, dt * 12), pv = this.pv;
    pv.x += ((p.x - ox) / Math.max(dt, 0.001) - pv.x) * vk; pv.z += ((p.z - oz) / Math.max(dt, 0.001) - pv.z) * vk;
  };

  World.prototype._findNear = function () {
    var best = null, bd = 1e9, p = this.player, room = this.room;
    if (room && this.mode === 'room' && this.blend === 0 && !this.trans) {
      for (var i = 0; i < room.interactables.length; i++) {
        var it = room.interactables[i];
        if (!it.radius || (it.enabled && !it.enabled())) continue;
        var d = Math.hypot(p.x - it.x, p.z - it.z);
        if (d < it.radius && d < bd) { bd = d; best = it; }
      }
    }
    if (best !== this.near || (best && best.promptText !== this.elSit.textContent)) {
      this.near = best;
      this.elSit.style.display = best ? '' : 'none';
      if (best) { best.promptText = best.prompt(); this.elSit.textContent = best.promptText; }
    }
  };

  /* ---------- boucle ---------- */
  World.prototype._loop = function (now) {
    if (this.dead) return;
    this._raf = requestAnimationFrame(this._frame);
    if (!this.running || !this.container.clientWidth) { this.last = 0; return; }
    var raw = this.last ? (now - this.last) / 1000 : 0.016; this.last = now;
    var dt = Math.min(raw, 0.1);
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.vm) this._drawHand(dt);
    if (raw < 1 && Q.frame(raw)) this._applyQuality();
    this.hudT += dt;
    if (this.hudT > 0.25) { this.hudT = 0; this.syncHud(); }
  };

  // Fait avancer la simulation de dt secondes et place la caméra (séparé du rendu pour pouvoir tester)
  World.prototype.step = function (dt) {
    this.clock += dt;
    this._resize();
    var room = this.room;
    if (this.clock - (this.hintShown || 0) > 9 && this.elHint.style.display !== 'none') this.elHint.style.display = 'none';
    if (room.update) room.update(dt, this);
    this._updateRemotes(dt);
    this._rtSend(false, dt);

    var target = this.mode === 'seat' ? 1 : 0;
    this.blend += Math.sign(target - this.blend) * dt / 1.1;
    this.blend = Math.max(0, Math.min(1, this.blend));
    if (Math.abs(target - this.blend) < 0.004) this.blend = target;
    var ms = this.mouse, mouseLook = ms.inside && !this.touch && this.full;
    function dz(v, t) { var a = Math.abs(v); return a < t ? 0 : (v < 0 ? -1 : 1) * (a - t) / (1 - t); }   // zone morte au centre
    if (this.mode === 'room' && this.blend === 0 && !this.trans) {
      // en grand écran, la vue suit la souris verrouillée (voir _bindPointer)
      this._movePlayer(dt);
      this._updateDoors(dt);
    } else this._updateDoors(dt);
    this._findNear();
    var w = this.blend * this.blend * (3 - 2 * this.blend);   // adoucit le trajet

    // pose « marche »
    var p = this.player, cpp = Math.cos(p.pitch), aspect = this.w / Math.max(1, this.h);
    var rx = p.x, ry = 1.65 + (p.jy || 0), rz = p.z;
    var rtx = rx + Math.sin(p.yaw) * cpp, rty = ry + Math.sin(p.pitch), rtz = rz - Math.cos(p.yaw) * cpp;
    var cx = rx, cy = ry, cz = rz, tx = rtx, ty = rty, tz = rtz, fov = aspect < 0.9 ? 70 : 62;

    if (this.seatRoom && this.blend > 0 && this.seatRoom.seatPose) {
      var sp = this.seatRoom.seatPose(dt, { clock: this.clock, mouseLook: mouseLook && this.mode === 'seat' && this.blend > 0.9, ms: ms, dz: dz, aspect: aspect });
      if (sp) {
        cx = rx + (sp.cx - rx) * w; cy = ry + (sp.cy - ry) * w; cz = rz + (sp.cz - rz) * w;
        tx = rtx + (sp.tx - rtx) * w; ty = rty + (sp.ty - rty) * w; tz = rtz + (sp.tz - rtz) * w;
        fov = fov + (sp.fov - fov) * w;
      }
    }
    // danse ou emote : la caméra passe devant le joueur, qui devient visible (en vue à la première personne on ne se voit pas)
    this._updateSelfEmote(dt);
    if (this.emoK > 0) {
      var ek = this.emoK * this.emoK * (3 - 2 * this.emoK), bd = room.bounds, dd = 2.7;
      var ex = p.x + Math.sin(p.yaw) * dd, ez = p.z - Math.cos(p.yaw) * dd;
      ex = Math.max(bd.xMin + 0.3, Math.min(bd.xMax - 0.3, ex)); ez = Math.max(bd.zMin + 0.3, Math.min(bd.zMax - 0.3, ez));
      if (Math.hypot(ex - p.x, ez - p.z) < 1.4) { ex = p.x - Math.sin(p.yaw) * dd; ez = p.z + Math.cos(p.yaw) * dd; ex = Math.max(bd.xMin + 0.3, Math.min(bd.xMax - 0.3, ex)); ez = Math.max(bd.zMin + 0.3, Math.min(bd.zMax - 0.3, ez)); }   // un mur derrière : on se place de l'autre côté
      var ey2 = Math.max(0.6, Math.min(2.8, 1.55 - p.pitch * 1.8));
      cx += (ex - cx) * ek; cy += (ey2 - cy) * ek; cz += (ez - cz) * ek;
      tx += (p.x - tx) * ek; ty += (1.05 - ty) * ek; tz += (p.z - tz) * ek;
    }
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);
  };

  /* ---------- ta main et l'objet tenu ---------- */
  // La main s'affiche en vue à la première personne (pas assis, pas pendant une danse ni un changement de salle), dessinée après la salle, par-dessus.
  World.prototype._drawHand = function (dt) {
    var vm = this.vm, nm = '', ok = this.mode === 'room' && this.blend === 0 && !this.trans && this.emoK < 0.02 && !!this.room && !this.dead && this.hasHand !== false;
    if (!ok) return;
    try { nm = state.username || ''; } catch (e) { /* pas connecté */ }
    vm.update(dt, { speed: Math.hypot(this.pv.x, this.pv.z), air: !!this.player.air, held: this.heldId, name: nm });
    var r = this.renderer, ac = r.autoClear;
    r.autoClear = false; r.clearDepth(); vm.render(r, this.camera); r.autoClear = ac;
  };
  // objet en main ('' = rien) : les autres joueurs voient ton personnage le tenir (ou non) ; id : voir F.HELD dans hand3d.js
  World.prototype.setHeld = function (id) {
    id = id && F.HELD && F.HELD[id] ? id : '';
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.selfPerson) this.selfPerson.setHeld(id);
    this._rtSend(true);
  };

  /* ---------- danses et emotes (catalogue : emotes3d.js, roue et téléphone : hud3d.js) ---------- */
  // Le joueur ne se voit pas en vue à la première personne : pendant une danse son personnage apparaît et la caméra passe devant lui.
  // Les autres voient la même danse : l'identifiant (emo) et un compteur (emn, pour relancer la même) partent avec la position.
  World.prototype.canEmote = function () {
    return this.running && !this.dead && !!this.room && this.mode === 'room' && this.blend === 0 && !this.trans && this.container.clientWidth > 0;
  };
  World.prototype.emote = function (id) {
    var e = F.emoteById(id);
    if (!e || !this.canEmote()) return false;
    if (!this.selfPerson) {
      var nm = '', av = '';
      try { nm = state.username || ''; av = state.avatarEmoji || ''; } catch (er) { /* pas connecté */ }
      this.selfPerson = F.createPerson(nm || 'Moi', av);
      this.selfPerson.tag.visible = false;
      this.selfPerson.group.visible = false;
      this.scene.add(this.selfPerson.group);
      this.selfPerson.setHeld(this.heldId);
    }
    var p = this.player, sp = this.selfPerson;
    this.emoYaw0 = p.yaw;                                    // le personnage garde son cap, la caméra peut tourner autour de lui
    sp.clearEmote();
    sp.group.position.set(p.x, 0, p.z); sp.group.rotation.y = Math.PI - p.yaw;
    sp.startEmote(id);
    this.emoId = id; this.emoN++;
    this.keys = {}; this.stick.x = this.stick.y = 0;
    this._rtSend(true);
    return true;
  };
  World.prototype.stopEmote = function () {
    if (!this.emoId) return;
    this.emoId = '';
    if (this.selfPerson) this.selfPerson.clearEmote();
    this._rtSend(true);
  };
  World.prototype._resetEmote = function () {
    this.emoId = ''; this.emoK = 0;
    if (this.selfPerson) { this.selfPerson.clearEmote(); this.selfPerson.group.visible = false; }
  };
  World.prototype._updateSelfEmote = function (dt) {
    var sp = this.selfPerson, tk = this.emoId ? 1 : 0;
    if (this.emoK !== tk) this.emoK = Math.max(0, Math.min(1, this.emoK + Math.sign(tk - this.emoK) * dt * (tk ? 3.2 : 4)));
    if (!sp) return;
    if (this.emoId) {
      sp.group.position.y = 0;
      if (!sp.playEmote(dt)) this.stopEmote();               // une emote courte se termine d'elle-même
    }
    sp.group.visible = this.emoK > 0.02;
  };

  /* ---------- s'asseoir / se lever (la salle gère son siège, le monde gère la caméra) ---------- */
  World.prototype._libererSouris = function () { if (document.pointerLockElement === this.dom) { this._relache = Date.now(); document.exitPointerLock(); } };
  World.prototype.sitDown = function (room) { this._resetEmote(); this._libererSouris(); this.mode = 'seat'; this.seatRoom = room; this.keys = {}; this.stick.x = this.stick.y = 0; this.near = null; this.elSit.style.display = 'none'; };
  World.prototype.standUp = function (x, z, yaw) {
    this.player.x = x; this.player.z = z; this.player.yaw = yaw; this.player.pitch = -0.04;
    this.mode = 'room'; this.seatRoom = null;
  };

  /* ===================== MULTIJOUEUR (temps réel) ===================== */
  World.prototype._me = function () { return F.me(); };
  // appel du serveur du site (présence / places) : sans jeton on reste simple spectateur
  World.prototype.post = function (path, body) {
    var tok = F.token();
    if (!tok) return Promise.resolve(null);
    var nm = '', av = '';
    try { nm = state.username || ''; av = state.avatarEmoji || '🎭'; } catch (e) { /* pas connecté */ }
    return fetch(path, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify(Object.assign({ name: nm, avatar: av }, body)) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { if (j) j._status = r.status; return j; }); })
      .catch(function () { return null; });
  };
  World.prototype._netStart = function () {
    var self = this, room = this.room;
    if (this.netOn || this.dead || !room) return;
    this.netOn = true;
    if (room.topic) {
      this.rt = F.createRealtime(room.topic, function (ev, m) { self._rtMsg(ev, m); });
      this.rt.onReady = function () { self._rtSend(true); self.rt.send('hello', { k: self._me() }); };
    }
    if (room.netStart) room.netStart(this);
  };
  World.prototype._rtBye = function () { if (this.rt) this.rt.send('bye', { k: this._me() }); };
  World.prototype._netStop = function () {
    if (!this.netOn) return;
    this.netOn = false;
    var room = this.room;
    if (room && room.netStop) room.netStop(this);
    if (this.rt) { this._rtBye(); var old = this.rt; this.rt = null; setTimeout(function () { old.close(); }, 150); }
  };
  World.prototype._clearRemotes = function () { var self = this; Object.keys(this.remote).forEach(function (k) { self.removeRemote(k); }); };
  World.prototype.ensureRemote = function (k, name, avatar, x, z, yaw) {
    var r = this.remote[k];
    if (!r) {
      r = this.remote[k] = { name: name || k, person: F.createPerson(name || k, avatar), tx: x, tz: z, tyaw: yaw, lastFx: null, fresh: true, vx: 0, vz: 0, recv: performance.now(), jmp: 0, jt: -1, seat: -1, emo: '', emn: 0 };
      r.person.group.position.set(x, 0, z);
      this.scene.add(r.person.group);
    }
    return r;
  };
  World.prototype.removeRemote = function (k) {
    var r = this.remote[k]; if (!r) return;
    this.scene.remove(r.person.group); r.person.dispose(); delete this.remote[k];
  };
  World.prototype._rtMsg = function (ev, m) {
    var me = this._me(), room = this.room;
    if (!m || typeof m.k !== 'string' || !m.k || m.k === me || !this.netOn || !room) return;
    this.recentByes = this.recentByes || {};
    if (ev === 'bye') {
      this.recentByes[m.k] = performance.now();
      this.removeRemote(m.k);
      return;
    }
    if (ev === 'hello') { this._rtSend(true); return; }
    if (ev === 'chat') { if (this.ph && this.ph.chatIn) this.ph.chatIn(m); return; }   // message du chat (hud3d.js)
    if (ev === 'typing') { if (this.ph && this.ph.typingIn) this.ph.typingIn(m); return; }   // « est en train d'écrire… »
    if (ev === 'pos') {
      // Si ce joueur vient d'envoyer un bye récemment, ignorer tout paquet pos résiduel ou tardif
      if (this.recentByes[m.k] && (performance.now() - this.recentByes[m.k] < 4500)) return;
      // Si le paquet indique une autre salle, le joueur n'est plus ici
      if (m.room && m.room !== room.id) {
        this.removeRemote(m.k);
        return;
      }
      var x = Number(m.x), z = Number(m.z);
      if (!isFinite(x) || !isFinite(z)) return;
      var r = this.ensureRemote(m.k, String(m.name || m.k).slice(0, 20), String(m.avatar || '').slice(0, 12), x, z, Number(m.yaw) || 0);
      r.tx = x; r.tz = z; r.tyaw = Number(m.yaw) || 0; r.vx = Number(m.vx) || 0; r.vz = Number(m.vz) || 0;
      r.recv = performance.now(); r.rtT = r.recv;
      if (typeof m.seat === 'number') r.seat = m.seat;
      var eid = typeof m.emo === 'string' && F.emoteById(m.emo) ? m.emo : '', en = Number(m.emn) || 0;
      if (eid !== r.emo || en !== r.emn) { r.emo = eid; r.emn = en; r.person.startEmote(eid); }   // nouvelle danse (ou la même relancée) ; '' = il s'arrête
      r.person.setHeld(typeof m.held === 'string' ? m.held : '');                                    // objet qu'il tient en main
      if ((m.jmp || 0) !== r.jmp) { if (!r.fresh) r.jt = 0; r.jmp = m.jmp || 0; }
      r.fresh = false;
    } else if (room.onRtMsg) room.onRtMsg(ev, m, this.remote[m.k], this);
  };
  // envoie ma position/vitesse aux autres : ~15 fois par seconde en mouvement, 1 fois par seconde à l'arrêt
  World.prototype._rtSend = function (force, dt) {
    var me = this._me(), room = this.room;
    if (!me || !this.rt || !this.rt.ready || !room || (this.trans && !force)) return;
    var p = this.player, pv = this.pv, seated = this.mode === 'seat' && room.seatPos ? room.seatPos() : null;
    var seatNow = seated ? seated.seat : -1;
    if (this.mode === 'seat' && room.hideSelf) return;           // assis à une table dont la salle montre déjà le joueur : on n'envoie plus de position
    var emo = !seated && this.emoId ? this.emoId : '';
    var moving = !seated && !emo && (Math.hypot(pv.x, pv.z) > 0.15 || p.air || Math.abs(p.yaw - (this._rtYaw || 0)) > 0.01);
    this._rtYaw = p.yaw;
    this._rtT = (this._rtT || 0) - (dt || 0);
    if (moving && this._rtT > 0.066) this._rtT = 0.066;          // on se met à bouger : on n'attend pas la prochaine seconde
    if (!force && this._rtT > 0 && seatNow === this._rtSeat) return;
    this._rtT = moving ? 0.066 : 1.0; this._rtSeat = seatNow;
    var nm = '', av = '';
    try { nm = state.username || ''; av = (typeof getAvatarDisplay === 'function' && getAvatarDisplay()) || state.avatarEmoji || '🎭'; } catch (er) { /* pas connecté */ }
    var r3 = function (v) { return Math.round(v * 1000) / 1000; };
    this.rt.send('pos', {
      k: me, name: nm, avatar: av, seat: seatNow, room: room.id,
      x: r3(seated ? seated.x : p.x), z: r3(seated ? seated.z : p.z), yaw: r3(seated ? seated.yaw : emo ? this.emoYaw0 : p.yaw),   // en danse la caméra tourne, pas le personnage
      vx: seated ? 0 : r3(this.pv.x), vz: seated ? 0 : r3(this.pv.z), run: !!this.running2, jmp: p.jmp || 0, emo: emo, emn: this.emoN, held: this.heldId
    });
  };
  World.prototype._updateRemotes = function (dt) {
    var self = this, room = this.room, kk = 1 - Math.exp(-dt * 11), nowT = performance.now();
    Object.keys(this.remote).forEach(function (k) {
      var r = self.remote[k];
      if (!r || !r.person || !r.person.group) return;
      var g = r.person.group;
      var silence = nowT - (r.recv || nowT);

      // Si le joueur ne donne plus signe de vie depuis plus de 3.2s (déconnecté ou parti sans bye), on le retire
      if (silence > 3200) {
        self.removeRemote(k);
        return;
      }

      // Si pas de nouveau paquet depuis plus de 200ms, amortir la vitesse vers 0 pour ne pas continuer à glisser
      if (silence > 200) {
        var dec = Math.exp(-dt * 8);
        r.vx *= dec;
        r.vz *= dec;
        if (Math.hypot(r.vx, r.vz) < 0.04) { r.vx = 0; r.vz = 0; }
      }

      var tx = r.tx, tz = r.tz, yaw = r.tyaw;
      var sp0 = r.seat >= 0 && room.remotePose ? room.remotePose(r) : null;
      var age = Math.min(0.4, silence / 1000);   // extrapolation courte et bornée
      if (sp0) { tx = sp0.x; tz = sp0.z; yaw = sp0.yaw; r.person.setSeated(true); }
      else { tx += r.vx * age; tz += r.vz * age; r.person.setSeated(false); }

      // Empêcher strictement le personnage de traverser les murs et d'aller dans le vide
      if (room.bounds) {
        var pad = 0.25;
        tx = Math.max(room.bounds.xMin + pad, Math.min(room.bounds.xMax - pad, tx));
        tz = Math.max(room.bounds.zMin + pad, Math.min(room.bounds.zMax - pad, tz));
      }

      var ox = g.position.x, oz = g.position.z;
      // Téléportation si distance trop grande (évite de glisser sur 20m)
      if (Math.hypot(tx - ox, tz - oz) > 5.5) {
        g.position.x = tx; g.position.z = tz;
      } else {
        g.position.x += (tx - ox) * kk; g.position.z += (tz - oz) * kk;
      }

      if (room.bounds) {
        g.position.x = Math.max(room.bounds.xMin, Math.min(room.bounds.xMax, g.position.x));
        g.position.z = Math.max(room.bounds.zMin, Math.min(room.bounds.zMax, g.position.z));
      }

      var movedDist = Math.hypot(g.position.x - ox, g.position.z - oz);
      var actualSp = movedDist / Math.max(dt, 0.001);
      var sp = sp0 ? 0 : Math.max(Math.hypot(r.vx, r.vz), actualSp * 0.45);

      // Si le joueur ne bouge plus et qu'on n'a pas reçu de paquet récent, on coupe net l'animation de marche
      if (silence > 380 && actualSp < 0.12) sp = 0;

      if (r.jt >= 0) { r.jt += dt; var u = r.jt / 0.66; if (u >= 1) { r.jt = -1; } else g.position.y = 4 * 0.6 * u * (1 - u); }
      else if (!r.person.seated) g.position.y = 0;

      var ty = Math.PI - yaw, ey = r.person.emoYaw, base = g.rotation.y - ey, dy = ((ty - base + Math.PI * 3) % TAU) - Math.PI;
      g.rotation.y = base + dy * Math.min(1, dt * 6) + ey;

      if (sp > 0.12 && !r.person.seated) { r.person.clearEmote(); r.person.walk(dt, sp); }
      else if (!r.person.playEmote(dt)) r.person.stopWalk();
      r.person.applyHold(dt);
    });
  };

  /* ---------- cycle de vie ---------- */
  World.prototype.pause = function () {
    this.running = false; this.keys = {}; this.setFull(false); this._resetEmote(); this._netStop();
    if (this.ph) this.ph.close();
    if (this.room && this.room.onPause) this.room.onPause(this);
  };
  World.prototype.resume = function () {
    this.running = true; this.last = 0; this.w = 0; this.trans = false; this.elFade.classList.remove('on');
    Q.resetGrace();
    this._netStart(); this.syncHud(); this._setHint();
    if (this.room && this.room.onResume) this.room.onResume(this);
  };
  World.prototype.dispose = function () {
    this._libererSouris();
    this.dead = true; cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); window.removeEventListener('blur', this._blur);
    window.removeEventListener('keydown', this._esc); window.removeEventListener('pagehide', this._ph);
    this.setFull(false); this._netStop(); this._clearRemotes();
    if (this.ph) this.ph.dispose();
    if (this.selfPerson) { this.scene.remove(this.selfPerson.group); this.selfPerson.dispose(); this.selfPerson = null; }
    Object.keys(this.rooms).forEach(function (k) { var r = this.rooms[k]; if (r.dispose) r.dispose(); }, this);
    this.renderer.dispose();
    if (this.dom.parentNode) this.dom.parentNode.removeChild(this.dom);
    if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud);
  };

  F.World = World;

  /* ===================================================================
     OUVERTURE DEPUIS LA PAGE
       - monde complet (PC) dans #world3dStage : hall + salles, portes, temps réel
       - mode « machine à sous seule » (téléphone) dans #slot3dStage
     =================================================================== */
  var hasWebGL = null;
  function webgl() {
    if (hasWebGL === null) {
      try { var c = document.createElement('canvas'); hasWebGL = !!(window.THREE && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { hasWebGL = false; }
    }
    return hasWebGL;
  }
  // le monde complet n'est proposé que sur ordinateur
  F.canWorld = function () { return webgl() && !mainFailed && !F.isMobile() && !F.isTouch() && !!document.getElementById('world3dStage'); };
  F.wantsWorldForSlots = function () { return F.canWorld(); };

  var main = null, mainFailed = false, solo = null, soloFailed = false;
  F.active = null;

  // monde complet ; place = 'hall' | 'slots'
  F.openWorld = function (place) {
    var st = document.getElementById('world3dStage');
    if (!st || mainFailed || !webgl()) return false;
    if (!main) {
      try {
        st.classList.remove('hidden');
        main = new World(st, {
          rooms: ['hall', 'slots', 'horses', 'pokerroom', 'shop3d', 'pmu', 'cinema', 'statue'], start: place || 'hall', hall: true, menu: true,
          onMenu: function () { if (typeof switchRoom === 'function') switchRoom('hall'); },
          onExitGame: function (key) { if (typeof switchRoom === 'function') switchRoom(key); }
        });
      } catch (err) {
        mainFailed = true; main = null; st.classList.add('hidden');
        if (window.console) console.warn('[F3D] WebGL indisponible, menu classique conservé.', err);
        return false;
      }
    } else {
      st.classList.remove('hidden');
      main.resume();
      if (place && main.room && main.room.id !== place) main.enterRoom(place, { from: null });
    }
    F.active = main;
    if (!main.touch && !main.full) main.setFull(true);   // on entre toujours en plein écran (Échap ou « Quitter » pour en sortir)
    return true;
  };
  F.closeWorld = function () { if (main) main.pause(); if (F.active === main) F.active = null; };

  // téléphone : seulement la salle des machines à sous (comme avant)
  F.openSolo = function () {
    var st = document.getElementById('slot3dStage');
    if (!st || soloFailed || !webgl()) return false;
    if (!solo) {
      try {
        st.classList.remove('hidden');
        solo = new World(st, { rooms: ['slots'], start: 'slots', hall: false, menu: false });
      } catch (err) {
        soloFailed = true; solo = null; st.classList.add('hidden');
        if (window.console) console.warn('[F3D] WebGL indisponible, machine classique conservée.', err);
        return false;
      }
    } else { st.classList.remove('hidden'); solo.resume(); }
    F.active = solo;
    return true;
  };
  F.closeSolo = function () { if (solo) solo.pause(); if (F.active === solo) F.active = null; };
  F.getWorld = function () { return F.active || main || solo; };
  F.getSlotsRoom = function () { var w = F.active; return w && w.rooms && w.rooms.slots && w.room === w.rooms.slots ? w.rooms.slots : null; };
})();
