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
    return {
      group: g, hips: hips, knees: knees, arms: arms, phase: 0, seated: false,
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
      dispose: function () { mats.forEach(function (m) { m.dispose(); }); tex.dispose(); tag.material.dispose(); }
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
