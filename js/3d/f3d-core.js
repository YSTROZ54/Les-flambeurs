/* =====================================================================
   f3d-core.js — Moteur 3D commun « Les Flambeurs » (Three.js r128)
   ---------------------------------------------------------------------
   Contient ce qui sert à TOUTES les salles 3D : outils de dessin, personnages, canal temps réel,
   styles de l'interface, réglage automatique de la qualité (images par seconde).
   Seul window.F3D est exposé ; tout le reste est privé (IIFE) pour ne jamais écraser les
   fonctions du gros script de la page.
   Fichiers qui s'en servent : world3d.js (le monde), hall3d.js (le hall), slots3d.js (machines à sous).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D = window.F3D || {};
  var EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  var SERIF = '"Cinzel",Georgia,serif';
  var MONO = '"Orbitron","JetBrains Mono",monospace';
  var TAU = Math.PI * 2;

  function fmtN(n) { return Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' '); }
  function isMobile() {
    try { return window.matchMedia('(max-width: 767px)').matches || /Mobi|Android|iPhone/i.test(navigator.userAgent); } catch (e) { return false; }
  }
  function isTouch() { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return ('ontouchstart' in window); } }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function mkTex(c) {
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  F.EMOJI_FONT = EMOJI_FONT; F.SERIF = SERIF; F.MONO = MONO; F.TAU = TAU;
  F.fmtN = fmtN; F.isMobile = isMobile; F.isTouch = isTouch; F.mkCanvas = mkCanvas; F.mkTex = mkTex; F.roundRectPath = roundRectPath;

  /* ---------- registre des salles : chaque fichier de salle s'y inscrit ---------- */
  var ROOMS = {};
  F.registerRoom = function (id, factory) { ROOMS[id] = factory; };
  F.roomFactory = function (id) { return ROOMS[id]; };

  /* ---------- le joueur et son compte (lus dans la page, jamais modifiés ici) ---------- */
  F.me = function () { try { return (typeof state !== 'undefined' && state && state.username ? state.username : '').toLowerCase().trim(); } catch (e) { return ''; } };
  F.token = function () { try { return typeof getAuthToken === 'function' ? getAuthToken() : ''; } catch (e) { return ''; } };

  /* ---------- réglage de la qualité ---------- */
  // 4 niveaux de netteté (0 = meilleur). En « Auto » on descend d'un cran quand ça rame (moins de 40 images/s deux fois de suite).
  var QKEY = 'f3d_quality';
  var Q = F.quality = { mode: 'auto', level: 0, fps: 0 };
  try { var qs = localStorage.getItem(QKEY); if (qs === 'high' || qs === 'medium' || qs === 'low' || qs === 'auto') Q.mode = qs; } catch (e) { /* ok */ }
  Q.start = function (low) { Q.level = Q.mode === 'high' ? 0 : Q.mode === 'medium' ? 1 : Q.mode === 'low' ? 3 : (low ? 1 : 0); };
  Q.pixelRatio = function () {
    var d = window.devicePixelRatio || 1;
    return [Math.min(d, 2), Math.min(d, 1.5), 1, 0.75][Q.level];
  };
  Q.cycle = function () {
    var order = ['auto', 'high', 'medium', 'low'];
    Q.mode = order[(order.indexOf(Q.mode) + 1) % order.length];
    try { localStorage.setItem(QKEY, Q.mode); } catch (e) { /* ok */ }
    Q.start(F.isMobile());
    return Q.mode;
  };
  Q.label = function () { return { auto: 'Auto', high: 'Haute', medium: 'Moyenne', low: 'Basse' }[Q.mode] + (Q.fps ? ' · ' + Q.fps + ' fps' : ''); };
  // à appeler à chaque image avec le vrai temps écoulé ; renvoie true si le niveau a changé
  var qAcc = 0, qFrames = 0, qLow = 0, qGrace = 2;
  Q.frame = function (realDt) {
    qAcc += realDt; qFrames++;
    if (qAcc < 1.5) return false;
    var fps = qFrames / qAcc; Q.fps = Math.round(fps); qAcc = 0; qFrames = 0;
    if (qGrace > 0) { qGrace--; return false; }
    if (Q.mode !== 'auto' || document.hidden) return false;
    if (fps < 40 && Q.level < 3) { qLow++; if (qLow >= 2) { qLow = 0; Q.level++; return true; } }
    else qLow = 0;
    return false;
  };
  Q.resetGrace = function () { qGrace = 2; qAcc = 0; qFrames = 0; qLow = 0; };

  /* ---------- petits personnages (comme au poker, en plus basique) ---------- */
  var SKIN_TONES = [0xf1c9a5, 0xe0ac82, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
  var SHIRTS = [0x7c1d2e, 0x1f4e79, 0x2d6a4f, 0x6b3fa0, 0xb8860b, 0x374151, 0xa13d63, 0x0f766e];
  var HAIRS = [0x1a1210, 0x3b2314, 0x6b4423, 0xb8863b, 0x222222, 0x8a2b1c];
  function nameHash(n) { var h = 7; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return h; }
  // couleurs du personnage d'après le pseudo (la main à la première personne reprend les mêmes)
  F.personColorsOf = function (name) { var h = nameHash(String(name || '')); return { skin: SKIN_TONES[h % SKIN_TONES.length], shirt: SHIRTS[(h >> 3) % SHIRTS.length] }; };
  var personGeo = null;
  function geo() {
    if (!personGeo) personGeo = {
      torso: new THREE.CylinderGeometry(0.2, 0.17, 0.55, 14), hips: new THREE.CylinderGeometry(0.18, 0.18, 0.18, 14),
      head: new THREE.SphereGeometry(0.14, 16, 12), hair: new THREE.SphereGeometry(0.152, 16, 10, 0, TAU, 0, Math.PI * 0.55),
      neck: new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), eye: new THREE.SphereGeometry(0.016, 6, 5),
      thigh: new THREE.CylinderGeometry(0.085, 0.07, 0.46, 10), shin: new THREE.CylinderGeometry(0.068, 0.058, 0.46, 10),
      arm: new THREE.CylinderGeometry(0.058, 0.048, 0.56, 8), foot: new THREE.BoxGeometry(0.1, 0.06, 0.2), hand: new THREE.SphereGeometry(0.05, 8, 6)
    };
    return personGeo;
  }

  // Petit personnage tout simple (comme au poker, en plus basique) : debout ou assis sur le tabouret
  function createPerson(name, avatar) {
    if (/^[?\s]*$|^(null|undefined)$/.test(String(avatar == null ? '' : avatar))) avatar = '';   // avatar abîmé (« ?? » venu d'un mauvais encodage) : on n'affiche que le pseudo
    var h = nameHash(name), G = geo();
    var skin = new THREE.MeshLambertMaterial({ color: SKIN_TONES[h % SKIN_TONES.length] });
    var shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[(h >> 3) % SHIRTS.length] });
    var pants = new THREE.MeshLambertMaterial({ color: 0x171a24 });
    var hairM = new THREE.MeshLambertMaterial({ color: HAIRS[(h >> 6) % HAIRS.length] });
    var dark = new THREE.MeshBasicMaterial({ color: 0x111111 });
    var mats = [skin, shirt, pants, hairM, dark];
    var g = new THREE.Group();
    function add(geom, mat, x, y, z, parent) { var m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); (parent || g).add(m); return m; }
    add(G.hips, pants, 0, 0.98, 0); add(G.torso, shirt, 0, 1.3, 0); add(G.neck, skin, 0, 1.62, 0);
    var head = add(G.head, skin, 0, 1.75, 0);
    if ((h >> 9) % 5 !== 0) add(G.hair, hairM, 0, 1.76, -0.005);          // 1 personne sur 5 est chauve
    add(G.eye, dark, -0.05, 1.77, 0.125); add(G.eye, dark, 0.05, 1.77, 0.125);
    var hips = [], knees = [], arms = [];
    [-1, 1].forEach(function (s) {
      var hip = new THREE.Group(); hip.position.set(s * 0.09, 0.92, 0); g.add(hip); hips.push(hip);
      add(G.thigh, pants, 0, -0.23, 0, hip);
      var knee = new THREE.Group(); knee.position.set(0, -0.46, 0); hip.add(knee); knees.push(knee);
      add(G.shin, pants, 0, -0.23, 0, knee); add(G.foot, dark, 0, -0.49, 0.04, knee);
      var sh = new THREE.Group(); sh.position.set(s * 0.26, 1.5, 0); g.add(sh); arms.push(sh);
      add(G.arm, shirt, 0, -0.28, 0, sh); add(G.hand, skin, 0, -0.58, 0, sh);
    });
    // étiquette au-dessus de la tête : avatar + pseudo
    var cv = mkCanvas(320, 72), c = cv.getContext('2d');
    roundRectPath(c, 4, 4, 312, 64, 22); c.fillStyle = 'rgba(8,5,12,0.82)'; c.fill(); c.strokeStyle = 'rgba(201,162,39,0.8)'; c.lineWidth = 3; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f4e3b0'; c.font = '700 32px ' + MONO;
    c.fillText(((avatar ? avatar + ' ' : '') + name).slice(0, 16), 160, 38, 292);
    var tex = mkTex(cv);
    var tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    tag.scale.set(0.9, 0.2, 1); tag.position.set(0, 2.1, 0); g.add(tag);
    // bulle de dialogue au-dessus de l'étiquette : un message (say) ou trois points qui bougent (typing)
    var bub = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    bub.visible = false; g.add(bub);
    var bubFont = '600 30px "Plus Jakarta Sans",system-ui,sans-serif', bubTimer = 0, dotsTimer = 0, safeTimer = 0, dotsPhase = 0, sayOn = false;
    function bubWrap(c, text) {
      var lines = [], cur = '', MAXW = 470;
      String(text).split(' ').forEach(function (word) {
        while (c.measureText(word).width > MAXW) {                      // mot trop long : coupé en deux
          var n = word.length; while (n > 1 && c.measureText(word.slice(0, n)).width > MAXW) n--;
          if (cur) { lines.push(cur); cur = ''; }
          lines.push(word.slice(0, n)); word = word.slice(n);
        }
        var t = cur ? cur + ' ' + word : word;
        if (cur && c.measureText(t).width > MAXW) { lines.push(cur); cur = word; } else cur = t;
      });
      if (cur) lines.push(cur);
      if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].slice(0, -1) + '…'; }
      return lines;
    }
    function bubDraw(text, dots) {
      var meas = mkCanvas(8, 8).getContext('2d'), lines = [], W, H;
      if (dots) { W = 150; H = 80; }
      else {
        meas.font = bubFont; lines = bubWrap(meas, text);
        var mw = 0; lines.forEach(function (l) { mw = Math.max(mw, meas.measureText(l).width); });
        W = Math.min(540, Math.ceil(mw) + 52); H = lines.length * 38 + 30;
      }
      var TAIL = 20, bc = mkCanvas(W, H + TAIL), x = bc.getContext('2d');
      x.fillStyle = '#f8f3e6'; x.strokeStyle = '#c9a227'; x.lineWidth = 3;
      roundRectPath(x, 3, 3, W - 6, H - 6, 24); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(W / 2 - 15, H - 5); x.lineTo(W / 2, H + TAIL - 2); x.lineTo(W / 2 + 15, H - 5); x.closePath(); x.fill();
      x.fillStyle = '#f8f3e6'; x.fillRect(W / 2 - 13, H - 7, 26, 5);   // efface le trait du bas sous la pointe
      if (dots) {
        for (var i = 0; i < 3; i++) { x.fillStyle = i === dotsPhase ? '#1a1208' : '#9a8f78'; x.beginPath(); x.arc(W / 2 + (i - 1) * 32, H / 2 + (i === dotsPhase ? -3 : 0), 9, 0, TAU); x.fill(); }
      } else {
        x.fillStyle = '#1a1208'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = bubFont;
        lines.forEach(function (l, i) { x.fillText(l, W / 2, 15 + 19 + i * 38 + 1); });
      }
      var old = bub.material.map; bub.material.map = mkTex(bc); bub.material.needsUpdate = true; if (old) old.dispose();
      var ws = W * 0.0026, hs = (H + TAIL) * 0.0026;
      bub.scale.set(ws, hs, 1); bub.position.set(0, 2.3 + hs / 2, 0); bub.visible = true;
    }
    function bubHide() { bub.visible = false; sayOn = false; }
    function bubStopDots() { clearInterval(dotsTimer); dotsTimer = 0; clearTimeout(safeTimer); safeTimer = 0; }
    g.rotation.order = 'YXZ';                                          // cap, puis penché en avant, puis de côté (danses)
    arms.forEach(function (a) { a.rotation.order = 'YXZ'; });          // bras : écart sur le côté, puis élan, puis rentré
    // objet en main : le bras droit se lève devant le personnage avec l'objet ; sans objet il reste le long du corps (les autres joueurs voient la différence)
    var heldId = '', heldItem = null, heldK = 0, heldQ = new THREE.Quaternion(), heldUp = new THREE.Vector3();
    function ease01(v) { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }
    return {
      // say : affiche un message au-dessus de la tête quelques secondes ; typing : trois points tant que la personne écrit
      say: function (text) {
        bubStopDots(); clearTimeout(bubTimer);
        text = String(text || '').trim(); if (!text) { bubHide(); return; }
        bubDraw(text, false); sayOn = true;
        bubTimer = setTimeout(bubHide, Math.min(10, 3.5 + text.length * 0.07) * 1000);
      },
      typing: function (on) {
        if (!on) { bubStopDots(); if (!sayOn) bubHide(); return; }
        clearTimeout(safeTimer); safeTimer = setTimeout(function () { bubStopDots(); if (!sayOn) bubHide(); }, 7000);   // plus de nouvelles : on arrête
        if (dotsTimer) return;
        clearTimeout(bubTimer); sayOn = false; dotsPhase = 0; bubDraw('', true);
        dotsTimer = setInterval(function () { dotsPhase = (dotsPhase + 1) % 3; bubDraw('', true); }, 320);
      },
      held: '',
      setHeld: function (id) {
        id = id && F.HELD && F.HELD[id] ? id : '';
        if (id === heldId) return;
        heldId = id; this.held = id;
        if (heldItem) { arms[1].remove(heldItem); heldItem = null; }
        if (id && F.buildHeld) { var it = F.buildHeld(id); if (it) { var wr = new THREE.Group(); wr.add(it); it.rotation.y = Math.PI; heldItem = wr; arms[1].add(wr); wr.visible = false; } }   // écran tourné vers celui qui tient
      },
      // à appeler après walk / stopWalk, à chaque image : mélange la pose « objet en main » avec la pose de marche
      applyHold: function (dt) {
        var want = heldId && !this.seated && !this.emoId ? 1 : 0;
        heldK += (want - heldK) * Math.min(1, dt * 9);
        if (heldK < 0.005) { heldK = 0; if (heldItem) heldItem.visible = false; return; }
        var ar = arms[1], bob = Math.sin(performance.now() / 650) * 0.035;
        ar.rotation.x += (-1.4 + bob - ar.rotation.x) * heldK;
        ar.rotation.y += (-0.18 - ar.rotation.y) * heldK;
        if (heldItem) {
          heldItem.visible = heldK > 0.4;
          heldQ.copy(ar.quaternion).invert(); heldItem.quaternion.copy(heldQ);                 // l'objet reste debout, quelle que soit l'inclinaison du bras
          heldUp.set(0, 0.06, 0).applyQuaternion(heldQ); heldItem.position.set(heldUp.x, -0.6 + heldUp.y, heldUp.z);
        }
      },
      group: g, hips: hips, knees: knees, arms: arms, tag: tag, phase: 0, seated: false, emoId: '', emoT: 0, emoYaw: 0,
      // Danses et emotes (catalogue dans emotes3d.js). L'appelant fixe d'abord la position et le cap, puis appelle playEmote à chaque image.
      startEmote: function (id) { this.emoT = 0; if (F.emoteById && F.emoteById(id)) this.emoId = id; else this.clearEmote(); },
      clearEmote: function () {
        if (!this.emoId && !this.emoYaw && !g.rotation.x && !g.rotation.z) return;
        this.emoId = ''; this.emoT = 0;
        g.rotation.y -= this.emoYaw; this.emoYaw = 0; g.rotation.x = 0; g.rotation.z = 0;
        hips.forEach(function (hp) { hp.rotation.set(0, 0, 0); }); knees.forEach(function (kn) { kn.rotation.set(0, 0, 0); }); arms.forEach(function (ar) { ar.rotation.set(0, 0, 0); });
      },
      playEmote: function (dt) {
        var e = this.emoId && F.emoteById ? F.emoteById(this.emoId) : null;
        if (!e || this.seated) return false;
        this.emoT += dt;
        if (e.dur && this.emoT > e.dur) { this.clearEmote(); return false; }
        var p = e.pose(this.emoT, e.dur), k = ease01(this.emoT / 0.25), Z = [0, 0, 0];   // k : on entre dans la pose en douceur
        var a0 = p.a0 || Z, a1 = p.a1 || Z;
        g.position.y += (p.y || 0) * k;
        g.rotation.y += (p.yaw || 0) * k - this.emoYaw; this.emoYaw = (p.yaw || 0) * k;
        g.rotation.x = (p.lx || 0) * k; g.rotation.z = (p.lz || 0) * k;
        hips[0].rotation.set((p.h0 || 0) * k, 0, -(p.hz0 || 0) * k); hips[1].rotation.set((p.h1 || 0) * k, 0, (p.hz1 || 0) * k);
        knees[0].rotation.x = (p.k0 || 0) * k; knees[1].rotation.x = (p.k1 || 0) * k;
        arms[0].rotation.set(-a0[1] * k, a0[2] * k, -a0[0] * k); arms[1].rotation.set(-a1[1] * k, -a1[2] * k, a1[0] * k);
        return true;
      },
      setSeated: function (on) {
        if (on === this.seated) return; this.seated = on;
        g.position.y = on ? -0.3 : 0;                                   // hanches posées sur le tabouret
        hips.forEach(function (hp) { hp.rotation.x = on ? -Math.PI / 2 : 0; });
        knees.forEach(function (k) { k.rotation.x = on ? Math.PI / 2 : 0; });
        arms.forEach(function (a) { a.rotation.x = on ? -1.05 : 0; });
      },
      walk: function (dt, speed) {
        if (this.seated) return;
        this.phase += dt * (3 + speed * 2.5);
        var sw = Math.min(1, speed / 1.2) * 0.65 * Math.sin(this.phase);
        hips[0].rotation.x = sw; hips[1].rotation.x = -sw; arms[0].rotation.x = -sw * 0.8; arms[1].rotation.x = sw * 0.8;
      },
      stopWalk: function () { if (!this.seated) { hips.forEach(function (hp) { hp.rotation.x = 0; }); arms.forEach(function (a) { a.rotation.x = 0; }); } },
      dispose: function () {
        clearTimeout(bubTimer); bubStopDots();
        mats.forEach(function (m) { m.dispose(); }); tex.dispose(); tag.material.dispose();
        if (bub.material.map) bub.material.map.dispose(); bub.material.dispose();
      }
    };
  }

  /* ---------- canal temps réel : les navigateurs se parlent directement (Supabase Realtime, sans base de données) ---------- */
  var RT_URL = 'wss://gyjyncljhlatomnbmwxa.supabase.co/realtime/v1/websocket?apikey=sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee&vsn=1.0.0';
  function createRealtime(topicName, onMsg) {
    var RT_TOPIC = 'realtime:' + topicName;
    var o = { ready: false, ws: null, dead: false, ref: 1, hbT: null, retry: 0, onReady: null };
    function later() { if (o.dead) return; o.retry++; setTimeout(open, Math.min(8000, 800 * o.retry)); }
    function open() {
      if (o.dead) return;
      var ws;
      try { ws = new WebSocket(RT_URL); } catch (e) { later(); return; }
      o.ws = ws;
      ws.onopen = function () {
        ws.send(JSON.stringify({ topic: RT_TOPIC, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' } } }, ref: '1', join_ref: '1' }));
      };
      ws.onmessage = function (m) {
        var d; try { d = JSON.parse(m.data); } catch (e) { return; }
        if (d.event === 'phx_reply' && d.ref === '1') { if (d.payload && d.payload.status === 'ok') { o.ready = true; o.retry = 0; if (o.onReady) o.onReady(); } }
        else if (d.event === 'broadcast' && d.payload && d.payload.payload) onMsg(d.payload.event, d.payload.payload);
      };
      ws.onclose = function () { o.ready = false; clearInterval(o.hbT); later(); };
      ws.onerror = function () { try { ws.close(); } catch (e) { /* ok */ } };
      clearInterval(o.hbT);
      o.hbT = setInterval(function () { if (ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++o.ref) })); }, 25000);
    }
    o.send = function (event, payload) {
      if (!o.ready || !o.ws || o.ws.readyState !== 1) return false;
      o.ws.send(JSON.stringify({ topic: RT_TOPIC, event: 'broadcast', payload: { type: 'broadcast', event: event, payload: payload }, ref: String(++o.ref) }));
      return true;
    };
    o.close = function () { o.dead = true; o.ready = false; clearInterval(o.hbT); try { if (o.ws) o.ws.close(); } catch (e) { /* ok */ } };
    open();
    return o;
  }

  /* ---------- présence : tous les joueurs connectés, toutes salles confondues (compteur « en ligne ») ---------- */
  // Un canal commun à tout le casino : chaque navigateur connecté y signale sa présence toutes les 4 s (avec la salle où il est) et
  // note celle des autres ; quelqu'un qu'on n'a pas entendu depuis 11 s est parti. Ça marche aussi pour qui est dans le menu 2D.
  // Il sert aussi au chat : un message envoyé ici arrive à tous les joueurs connectés, dans n'importe quelle salle (F.presence.send / F.presence.on).
  var PRES = { rt: null, seen: {}, info: {}, handlers: {}, me: '', room: '', timer: 0 };
  function presSend() {
    var nm = '', av = '', ap = '';
    try { nm = state.username || ''; } catch (e) { /* pas connecté */ }
    try { ap = F.myLookCode ? F.myLookCode() : ''; } catch (e) { /* personnages pas chargés */ }
    try { av = typeof getAvatarDisplay === 'function' ? getAvatarDisplay() : ''; } catch (e) { /* page pas prête */ }
    if (PRES.rt && PRES.rt.ready && PRES.me) PRES.rt.send('p', { k: PRES.me, name: String(nm).slice(0, 20), av: String(av || '').slice(0, 12), ap: ap, room: PRES.room });
  }
  function presBye() { if (PRES.rt && PRES.rt.ready && PRES.me) PRES.rt.send('bye', { k: PRES.me }); }
  F.presence = {
    ensure: function () {
      var me = F.me();
      if (!me) { if (PRES.rt) F.presence.stop(); return; }                // déconnecté : on n'est plus « en ligne »
      if (PRES.rt && PRES.me === me) return;
      F.presence.stop();
      PRES.me = me; PRES.seen = {};
      PRES.rt = createRealtime('flambeurs-presence', function (ev, m) {
        if (!m || typeof m.k !== 'string' || !m.k || m.k === PRES.me) return;
        if (ev === 'bye') { delete PRES.seen[m.k]; return; }
        PRES.seen[m.k] = Date.now();
        if (m.av || m.name) PRES.info[m.k] = { av: m.av || (PRES.info[m.k] && PRES.info[m.k].av) || '', name: m.name || '', ap: typeof m.ap === 'string' ? m.ap : ((PRES.info[m.k] && PRES.info[m.k].ap) || '') };   // pseudo et avatar de chacun (photos du chat)
        if (ev === 'hello') presSend();                                    // un nouvel arrivant demande qui est là : on répond tout de suite
        else if (PRES.handlers[ev]) { try { PRES.handlers[ev](m); } catch (e) { /* un abonné en panne ne bloque pas la présence */ } }
      });
      PRES.rt.onReady = function () { presSend(); PRES.rt.send('hello', { k: PRES.me }); };
      PRES.timer = setInterval(presSend, 4000);
      window.addEventListener('pagehide', presBye);
    },
    stop: function () {
      presBye(); clearInterval(PRES.timer); window.removeEventListener('pagehide', presBye);
      var old = PRES.rt; PRES.rt = null; PRES.me = ''; PRES.seen = {};
      if (old) setTimeout(function () { old.close(); }, 150);
    },
    setRoom: function (r) { PRES.room = r || ''; },
    // on(« chat », fonction) : reçoit les messages de ce genre venus de tous les joueurs ; fonction nulle = on arrête d'écouter
    on: function (ev, fn) { if (fn) PRES.handlers[ev] = fn; else delete PRES.handlers[ev]; },
    // envoie à tous les joueurs connectés ; renvoie false si le canal n'est pas prêt
    send: function (ev, payload) { return !!(PRES.rt && PRES.rt.ready && PRES.me && PRES.rt.send(ev, payload)); },
    avatarOf: function (k) { var i = PRES.info[k]; return i ? i.av : ''; },
    lookOf: function (k) { var i = PRES.info[k]; return i ? i.ap : ''; },       // code du personnage 3D (persona3d.js)
    // nombre de joueurs en ligne (toi compris), ou 0 tant que le canal n'est pas prêt
    count: function () {
      if (!PRES.rt || !PRES.rt.ready) return 0;
      var n = 1, now = Date.now(), k;
      for (k in PRES.seen) { if (now - PRES.seen[k] < 11000) n++; else delete PRES.seen[k]; }
      return n;
    }
  };

  F.createPerson = createPerson;
  F.createRealtime = createRealtime;

  /* ---------- styles de l'interface 3D (injectés une seule fois) ---------- */
  var CSS_ID = 's3d-style';
  F.injectCss = function () {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style'); st.id = CSS_ID;
    st.textContent =
      '.s3d-hud{position:absolute;inset:0;pointer-events:none;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#f4e3b0;overflow:hidden}' +
      '.s3d-hud button{pointer-events:auto;cursor:pointer;touch-action:manipulation;font-family:inherit}' +
      '.s3d-hud[data-mode=room] .s3d-seat-only,.s3d-hud[data-mode=seat] .s3d-room-only{display:none!important}' +
      '.s3d-top{position:absolute;top:8px;left:8px;right:8px;display:flex;gap:8px;align-items:flex-start;justify-content:space-between}' +
      '.s3d-btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}' +
      '.s3d-bal{background:rgba(8,5,12,.78);border:1px solid rgba(201,162,39,.5);border-radius:12px;padding:6px 10px;font-weight:800;font-size:13px;white-space:nowrap}' +
      '.s3d-cam{background:rgba(8,5,12,.78);border:1px solid rgba(201,162,39,.5);border-radius:12px;padding:8px 12px;min-height:40px;color:#f3cf62;font-weight:800;font-size:12px}' +
      '.s3d-cam[disabled]{opacity:.45}' +
      '.s3d-hud .s3d-full-btn{display:flex;align-items:center;gap:8px;background:rgba(14,9,6,.88);color:#f3cf62;border:1.5px solid #c9a227;border-radius:999px;padding:8px 16px;letter-spacing:.06em;text-transform:uppercase;font-size:11.5px;box-shadow:0 0 16px rgba(255,200,60,.28);transition:box-shadow .15s,background .15s}' +
      '.s3d-hud .s3d-full-btn:hover{background:rgba(40,26,10,.95);box-shadow:0 0 22px rgba(255,200,60,.55)}' +
      '.s3d-hud .s3d-full-btn.on{color:#ff9a9a;border-color:#d65a5a;box-shadow:0 0 16px rgba(255,90,90,.35)}' +
      '.s3d-full-btn svg{width:16px;height:16px;flex:none}' +
      '.s3d-full{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;min-height:0!important;z-index:60!important;border-radius:0!important;border:0!important}' +
      'body.s3d-full-on #smartHeader{display:none!important}' +
      '.s3d-hint{position:absolute;top:56px;left:8px;right:8px;text-align:center;font-size:11px;font-weight:700;color:#d9c88f;text-shadow:0 1px 4px #000}' +
      '.s3d-title{position:absolute;left:0;right:0;top:34%;text-align:center;font-family:"Cinzel",Georgia,serif;font-weight:900;font-size:clamp(22px,4.2vw,54px);letter-spacing:.14em;color:#f3cf62;text-shadow:0 0 24px rgba(255,180,40,.7),0 2px 6px #000;opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;pointer-events:none}' +
      '.s3d-title.on{opacity:1;transform:none}' +
      '.s3d-title small{display:block;font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:.3em;letter-spacing:.2em;color:#d9c88f;font-weight:700;margin-top:6px}' +
      '.s3d-fade{position:absolute;inset:0;background:#05030a;opacity:0;pointer-events:none;transition:opacity .35s ease}' +
      '.s3d-fade.on{opacity:1;pointer-events:auto}' +
      '.s3d-sit{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);min-height:52px;padding:0 22px;border-radius:14px;border:2px solid #ffe08a;background:linear-gradient(180deg,#d8a928,#8a6410);color:#1a1000;font-weight:900;font-size:15px;box-shadow:0 0 18px rgba(255,200,60,.5);white-space:nowrap}' +
      '.s3d-stick{position:absolute;left:18px;bottom:22px;width:112px;height:112px;border-radius:50%;background:rgba(8,5,12,.55);border:2px solid rgba(201,162,39,.5);pointer-events:auto;touch-action:none}' +
      '.s3d-stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(243,207,98,.85);box-shadow:0 0 12px rgba(255,200,60,.5)}' +
      '.s3d-bottom{position:absolute;left:8px;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px;align-items:stretch}' +
      '.s3d-chips{display:flex;gap:6px;justify-content:center}' +
      '.s3d-chips button{flex:1;max-width:72px;min-height:36px;border-radius:10px;border:1px solid rgba(201,162,39,.45);background:rgba(8,5,12,.78);color:#f4e3b0;font-weight:800;font-size:12px}' +
      '.s3d-row{display:flex;gap:8px;align-items:stretch}' +
      '.s3d-step{width:52px;min-height:52px;border-radius:14px;border:1px solid rgba(201,162,39,.55);background:rgba(8,5,12,.82);color:#f3cf62;font-size:24px;font-weight:900}' +
      '.s3d-bet{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,5,12,.82);border:1px solid rgba(201,162,39,.45);border-radius:14px;font-size:11px;color:#9a8a58;font-weight:700;letter-spacing:.08em}' +
      '.s3d-bet b{color:#ffd24a;font-size:19px;letter-spacing:0;font-family:"Orbitron",monospace}' +
      '.s3d-spin{flex:1.3;min-height:52px;border-radius:14px;border:2px solid #ffb3ba;background:linear-gradient(180deg,#ff4a5a,#b3101f);color:#fff;font-weight:900;font-size:17px;letter-spacing:.06em;box-shadow:0 0 18px rgba(255,60,80,.5)}' +
      '.s3d-spin[disabled]{filter:grayscale(.7) brightness(.6);box-shadow:none}' +
      '@media (min-width:768px){.s3d-bottom{left:50%;right:auto;transform:translateX(-50%);width:430px}}';
    document.head.appendChild(st);
  };
})();
