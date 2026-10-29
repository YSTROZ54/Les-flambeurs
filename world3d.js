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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07050c);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80);

    this.rooms = {}; this.room = null; this.roomIds = opts.rooms || [];
    this.player = { x: 0, z: 9, yaw: 0, pitch: -0.04 };
    this.keys = {}; this.stick = { x: 0, y: 0 }; this.mouse = { nx: 0, ny: 0, inside: false };
    this.mode = 'room'; this.blend = 0; this.seatRoom = null; this.near = null;
    this.remote = {}; this.full = false; this.trans = false;
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

  // changement de salle avec fondu au noir
  World.prototype.goRoom = function (id, from) {
    var self = this;
    if (this.trans || !this.hasRoom(id)) return;
    this.trans = true; this.elFade.classList.add('on');
    setTimeout(function () {
      if (self.dead) return;
      self.enterRoom(id, { from: from || (self.room && self.room.id) });
      setTimeout(function () { self.elFade.classList.remove('on'); self.trans = false; }, 120);
    }, 380);
  };
  // sortie vers un autre jeu du site (menu classique ou jeu 2D / poker 3D)
  World.prototype.exitGame = function (key, door) {
    var self = this;
    if (this.trans) return;
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
    // lueur derrière les battants : « l'autre salle »
    var gc = mkCanvas(64, 128), gx = gc.getContext('2d'), gg = gx.createLinearGradient(0, 0, 0, 128);
    var c3 = new THREE.Color(col);
    var cs = 'rgb(' + Math.round(c3.r * 255) + ',' + Math.round(c3.g * 255) + ',' + Math.round(c3.b * 255) + ')';
    gg.addColorStop(0, '#fff6d8'); gg.addColorStop(0.45, cs); gg.addColorStop(1, '#1a0d05');
    gx.fillStyle = gg; gx.fillRect(0, 0, 64, 128);
    var portal = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: mkTex(gc) }));
    portal.position.set(0, h / 2, 0.04); g.add(portal);
    function box(bw, bh, bd, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), gold); m.position.set(x, y, z); g.add(m); }
    box(0.14, h + 0.22, 0.22, -(w / 2 + 0.07), (h + 0.22) / 2, 0.1); box(0.14, h + 0.22, 0.22, w / 2 + 0.07, (h + 0.22) / 2, 0.1);
    box(w + 0.28, 0.18, 0.22, 0, h + 0.1, 0.1);
    var wood = new THREE.MeshStandardMaterial({ color: 0x4a1220, roughness: 0.55, metalness: 0.15 });
    var leafGeo = new THREE.BoxGeometry(w / 2 - 0.02, h - 0.04, 0.07);
    function leaf(sx) {
      var piv = new THREE.Group(); piv.position.set(sx * (w / 2), 0, 0.14); g.add(piv);
      var m = new THREE.Mesh(leafGeo, wood); m.position.set(-sx * (w / 4), h / 2, 0); piv.add(m);
      var trim = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.3, h - 0.5, 0.02), gold); trim.position.set(-sx * (w / 4), h / 2, 0.045); piv.add(trim);
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gold); knob.position.set(-sx * (w / 2 - 0.12), h * 0.45, 0.07); piv.add(knob);
      return piv;
    }
    var L = leaf(-1), R = leaf(1);   // L : charnière à gauche (x=-w/2), R : à droite
    // enseigne au-dessus
    var sc = mkCanvas(512, 128), sx = sc.getContext('2d');
    sx.fillStyle = '#12080f'; sx.fillRect(0, 0, 512, 128); sx.strokeStyle = '#c9a227'; sx.lineWidth = 6; sx.strokeRect(4, 4, 504, 120);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#f3cf62'; sx.shadowColor = '#ffb300'; sx.shadowBlur = 10;
    sx.font = '800 46px ' + SERIF; sx.fillText(spec.label || '', 256, spec.sub ? 48 : 66, 480);
    if (spec.sub) { sx.shadowBlur = 0; sx.fillStyle = '#d9c88f'; sx.font = '600 24px ' + MONO; sx.fillText(spec.sub, 256, 96, 480); }
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: mkTex(sc) }));
    sign.position.set(0, h + 0.62, 0.2); g.add(sign);
    room.group.add(g);
    var d = { spec: spec, g: g, L: L, R: R, open: 0 };
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
      '<div class="s3d-top"><div class="s3d-bal">💰 <span data-s3d="bal">0</span></div>' +
      '<div class="s3d-btns">' +
      (this.opts.menu ? '<button class="s3d-cam" data-s3d="menu">📋 Menu classique</button>' : '') +
      '<button class="s3d-cam" data-s3d="qual">⚙ Qualité</button>' +
      '<button class="s3d-cam s3d-full-btn" data-s3d="full"></button><span data-s3d="roomtop" style="display:contents"></span></div></div>' +
      '<div class="s3d-hint s3d-room-only" data-s3d="hint"></div>' +
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
    if (this.touch) this.elStick.style.display = '';
    this.elFull.addEventListener('click', function () { self.setFull(!self.full); });
    this.elQual.addEventListener('click', function () { Q.cycle(); self._applyQuality(); self.syncHud(); });
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
    this.elHint.textContent = t; this.elHint.style.display = ''; this.hintShown = this.clock || 0;
  };
  World.prototype.flash = function (msg) {
    this.elHint.textContent = msg; this.elHint.style.display = ''; this.hintShown = this.clock;
    var self = this; clearTimeout(this._flashT); this._flashT = setTimeout(function () { if (!self.dead) self._setHint(); }, 3500);
  };
  World.prototype._paintFullBtn = function () {
    var enter = '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit = '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>';
    this.elFull.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + (this.full ? exit : enter) + '</svg><span>' + (this.full ? 'Quitter le grand écran' : 'Grand écran') + '</span>';
    this.elFull.classList.toggle('on', this.full);
  };
  World.prototype.setFull = function (on) {
    on = !!on; if (on === this.full) return;
    this.full = on; this.mouse.inside = false;
    this.container.classList.toggle('s3d-full', on);
    document.body.classList.toggle('s3d-full-on', on);
    this._paintFullBtn();
    Object.keys(this.rooms).forEach(function (k) { var r = this.rooms[k]; if (r.onFull) r.onFull(on); }, this);
    this.w = 0; this._setHint();
  };
  World.prototype._applyQuality = function () { this.renderer.setPixelRatio(Q.pixelRatio()); this.w = 0; Q.resetGrace(); };
  World.prototype.syncHud = function () {
    try { if (typeof state !== 'undefined' && state && typeof state.balance === 'number') this.elBal.textContent = fmtN(state.balance); } catch (e) { /* solde pas encore chargé */ }
    this.elQual.textContent = '⚙ ' + Q.label();
    this.hud.setAttribute('data-mode', this.blend > 0.5 ? 'seat' : 'room');
    if (this.room && this.room.syncHud) this.room.syncHud(this);
  };

  /* ---------- clavier / souris / doigt ---------- */
  World.prototype._bindKeys = function () {
    var self = this, map = { KeyW: 'f', KeyZ: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyQ: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run' };
    function ok(e) {
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return false;
      return self.running && !self.dead && self.container.clientWidth > 0 && self.mode === 'room' && !self.trans && !e.ctrlKey && !e.metaKey && !e.altKey;
    }
    this._kd = function (e) {
      if (!ok(e)) return;
      if (map[e.code]) { self.keys[map[e.code]] = true; e.preventDefault(); }
      else if ((e.code === 'KeyE' || e.code === 'Enter') && self.near && self.blend === 0) { self.near.use(self); e.preventDefault(); }
    };
    this._ku = function (e) { if (map[e.code]) self.keys[map[e.code]] = false; };
    this._blur = function () { self.keys = {}; };
    this._esc = function (e) { if (e.code === 'Escape' && self.full) self.setFull(false); };
    this._ph = function () { if (self.room && self.room.onPageHide) self.room.onPageHide(self); self._rtBye(); };
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku); window.addEventListener('blur', this._blur);
    window.addEventListener('keydown', this._esc); window.addEventListener('pagehide', this._ph);
  };

  World.prototype._bindPointer = function () {
    var self = this, dom = this.dom, drag = null;
    dom.addEventListener('pointerdown', function (e) {
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
    this.ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    if (this.mode === 'room') {
      if (this.blend > 0 || !this.room) return;
      var its = this.room.interactables.filter(function (i) { return i.hit; });
      var hits = this.ray.intersectObjects(its.map(function (i) { return i.hit; }), false);
      if (hits[0]) for (var k = 0; k < its.length; k++) if (its[k].hit === hits[0].object) { its[k].use(this, e); break; }
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
      if (mouseLook) {   // curseur vers les bords = on tourne la tête, haut/bas = on regarde en l'air / au sol
        this.player.yaw += dz(ms.nx, 0.12) * 3.4 * dt;
        this.player.pitch = Math.max(-0.7, Math.min(0.6, -0.04 - dz(ms.ny, 0.12) * 0.9));
      }
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
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);
  };

  /* ---------- s'asseoir / se lever (la salle gère son siège, le monde gère la caméra) ---------- */
  World.prototype.sitDown = function (room) { this.mode = 'seat'; this.seatRoom = room; this.keys = {}; this.stick.x = this.stick.y = 0; this.near = null; this.elSit.style.display = 'none'; };
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
      r = this.remote[k] = { name: name || k, person: F.createPerson(name || k, avatar), tx: x, tz: z, tyaw: yaw, lastFx: null, fresh: true, vx: 0, vz: 0, recv: performance.now(), jmp: 0, jt: -1, seat: -1 };
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
    if (ev === 'bye') { this.removeRemote(m.k); return; }
    if (ev === 'hello') { this._rtSend(true); return; }
    if (ev === 'pos') {
      var x = Number(m.x), z = Number(m.z);
      if (!isFinite(x) || !isFinite(z)) return;
      var r = this.ensureRemote(m.k, String(m.name || m.k).slice(0, 20), String(m.avatar || '').slice(0, 12), x, z, Number(m.yaw) || 0);
      r.tx = x; r.tz = z; r.tyaw = Number(m.yaw) || 0; r.vx = Number(m.vx) || 0; r.vz = Number(m.vz) || 0;
      r.recv = performance.now(); r.rtT = r.recv;
      if (typeof m.seat === 'number') r.seat = m.seat;
      if ((m.jmp || 0) !== r.jmp) { if (!r.fresh) r.jt = 0; r.jmp = m.jmp || 0; }
      r.fresh = false;
    } else if (room.onRtMsg) room.onRtMsg(ev, m, this.remote[m.k], this);
  };
  // envoie ma position/vitesse aux autres : ~15 fois par seconde en mouvement, 1 fois par seconde à l'arrêt
  World.prototype._rtSend = function (force, dt) {
    var me = this._me(), room = this.room;
    if (!me || !this.rt || !this.rt.ready || !room) return;
    var p = this.player, pv = this.pv, seated = this.mode === 'seat' && room.seatPos ? room.seatPos() : null;
    var seatNow = seated ? seated.seat : -1;
    if (this.mode === 'seat' && room.hideSelf) return;           // assis à une table dont la salle montre déjà le joueur : on n'envoie plus de position
    var moving = !seated && (Math.hypot(pv.x, pv.z) > 0.15 || p.air || Math.abs(p.yaw - (this._rtYaw || 0)) > 0.01);
    this._rtYaw = p.yaw;
    this._rtT = (this._rtT || 0) - (dt || 0);
    if (moving && this._rtT > 0.066) this._rtT = 0.066;          // on se met à bouger : on n'attend pas la prochaine seconde
    if (!force && this._rtT > 0 && seatNow === this._rtSeat) return;
    this._rtT = moving ? 0.066 : 1.0; this._rtSeat = seatNow;
    var nm = '', av = '';
    try { nm = state.username || ''; av = state.avatarEmoji || '🎭'; } catch (er) { /* pas connecté */ }
    var r3 = function (v) { return Math.round(v * 1000) / 1000; };
    this.rt.send('pos', {
      k: me, name: nm, avatar: av, seat: seatNow,
      x: r3(seated ? seated.x : p.x), z: r3(seated ? seated.z : p.z), yaw: r3(seated ? seated.yaw : p.yaw),
      vx: seated ? 0 : r3(this.pv.x), vz: seated ? 0 : r3(this.pv.z), run: !!this.running2, jmp: p.jmp || 0
    });
  };
  World.prototype._updateRemotes = function (dt) {
    var self = this, room = this.room, kk = 1 - Math.exp(-dt * 11), nowT = performance.now();
    Object.keys(this.remote).forEach(function (k) {
      var r = self.remote[k], g = r.person.group, tx = r.tx, tz = r.tz, yaw = r.tyaw;
      var sp0 = r.seat >= 0 && room.remotePose ? room.remotePose(r) : null;
      var age = Math.min(0.6, (nowT - r.recv) / 1000 + (r.rtT && nowT - r.rtT < 1500 ? 0.03 : 0.1));   // on prolonge le mouvement connu : pas de saccade
      if (sp0) { tx = sp0.x; tz = sp0.z; yaw = sp0.yaw; r.person.setSeated(true); }
      else { tx += r.vx * age; tz += r.vz * age; r.person.setSeated(false); }
      var ox = g.position.x, oz = g.position.z;
      g.position.x += (tx - ox) * kk; g.position.z += (tz - oz) * kk;
      var sp = sp0 ? 0 : Math.max(Math.hypot(r.vx, r.vz), Math.hypot(g.position.x - ox, g.position.z - oz) / Math.max(dt, 0.001) * 0.5);
      if (r.jt >= 0) { r.jt += dt; var u = r.jt / 0.66; if (u >= 1) { r.jt = -1; } else g.position.y = 4 * 0.6 * u * (1 - u); }
      else if (!r.person.seated) g.position.y = 0;
      var ty = Math.PI - yaw, dy = ((ty - g.rotation.y + Math.PI * 3) % TAU) - Math.PI;
      g.rotation.y += dy * Math.min(1, dt * 6);
      if (sp > 0.12 && !r.person.seated) r.person.walk(dt, sp); else r.person.stopWalk();
    });
  };

  /* ---------- cycle de vie ---------- */
  World.prototype.pause = function () {
    this.running = false; this.keys = {}; this.setFull(false); this._netStop();
    if (this.room && this.room.onPause) this.room.onPause(this);
  };
  World.prototype.resume = function () {
    this.running = true; this.last = 0; this.w = 0; this.trans = false; this.elFade.classList.remove('on');
    Q.resetGrace();
    this._netStart(); this.syncHud(); this._setHint();
    if (this.room && this.room.onResume) this.room.onResume(this);
  };
  World.prototype.dispose = function () {
    this.dead = true; cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); window.removeEventListener('blur', this._blur);
    window.removeEventListener('keydown', this._esc); window.removeEventListener('pagehide', this._ph);
    this.setFull(false); this._netStop(); this._clearRemotes();
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
          rooms: ['hall', 'slots', 'horses', 'pokerroom', 'shop3d'], start: place || 'hall', hall: true, menu: true,
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
