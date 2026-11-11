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
  // emoji d'avatar abîmé par un mauvais encodage (« ?? », vide…) : l'initiale du pseudo à la place, comme ailleurs dans le jeu
  // (même garde que getAvatarDisplay() dans la page et cleanEmoji() de slots3d.js — à utiliser avant d'envoyer l'avatar au serveur
  // d'un salon multijoueur, sinon un avatar abîmé une fois s'affiche abîmé chez tous les autres joueurs, pas que chez soi)
  function cleanAvatar(av, name, fallback) {
    av = String(av == null ? '' : av).trim();
    if (av && !/^[?\s]*$|^(null|undefined)$/.test(av)) return av;
    var n = String(name == null ? '' : name).trim();
    return n ? n.charAt(0).toUpperCase() : (fallback || '🎭');
  }

  F.EMOJI_FONT = EMOJI_FONT; F.SERIF = SERIF; F.MONO = MONO; F.TAU = TAU;
  F.fmtN = fmtN; F.isMobile = isMobile; F.isTouch = isTouch; F.mkCanvas = mkCanvas; F.mkTex = mkTex; F.roundRectPath = roundRectPath; F.cleanAvatar = cleanAvatar;

  /* ---------- décor partagé par plusieurs salles : plante en pot et tabouret de bar ---------- */
  // plante d'intérieur touffue (feuilles qui retombent en arc dans un pot en céramique crème à bande dorée) ; ~1,9 m de haut à l'échelle 1
  var plantGeo = null, plantMats = null;
  F.makePlant = function (s) {
    var grp = new THREE.Group(); s = s || 1;
    if (!plantGeo) {
      plantGeo = new THREE.SphereGeometry(1, 8, 6);
      plantMats = [new THREE.MeshLambertMaterial({ color: 0x2f9a4c }), new THREE.MeshLambertMaterial({ color: 0x1f7a3a }), new THREE.MeshLambertMaterial({ color: 0x4cb860 })];
    }
    var cream = new THREE.MeshStandardMaterial({ color: 0xeee6d4, roughness: 0.35, metalness: 0.05 }), gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.7 });
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.56, 20), cream); pot.position.y = 0.28; grp.add(pot);
    var band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 8, 24), gold); band.rotation.x = Math.PI / 2; band.position.y = 0.52; grp.add(band);
    var soil = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 16), new THREE.MeshLambertMaterial({ color: 0x2a1a10 })); soil.position.y = 0.55; grp.add(soil);
    var N = 11, f, j;
    for (f = 0; f < N; f++) {
      var a = f / N * Math.PI * 2 + (f % 2) * 0.2, fg = new THREE.Group(); fg.rotation.y = a; grp.add(fg);
      var phi = 0.12 + (f % 3) * 0.16, len = 0.26 + (f % 4) * 0.035, x = 0.03, y = 0.56, mat = plantMats[f % 3], segs = 5 + (f % 2);
      for (j = 0; j < segs; j++) {
        var lf = new THREE.Mesh(plantGeo, mat);
        lf.scale.set(0.085 - j * 0.006, len * 0.62, 0.018); lf.position.set(x + Math.sin(phi) * len * 0.5, y + Math.cos(phi) * len * 0.5, 0); lf.rotation.z = -phi; fg.add(lf);
        x += Math.sin(phi) * len; y += Math.cos(phi) * len; phi += 0.3 + j * 0.03;
      }
    }
    grp.scale.set(s, s, s);
    return grp;
  };
  // tabouret de bar : large assise ronde rembourrée, dossier bas, pied chromé, repose-pieds et socle (hauteur d'assise ~0,68 m)
  F.makeStool = function (seatColor) {
    var grp = new THREE.Group(), chrome = new THREE.MeshStandardMaterial({ color: 0xd4d8e0, roughness: 0.25, metalness: 0.9 });
    var pad = new THREE.MeshStandardMaterial({ color: seatColor || 0x6a1226, roughness: 0.55 });
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.04, 20), chrome); base.position.y = 0.02; grp.add(base);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10), chrome); pole.position.y = 0.34; grp.add(pole);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 8, 24), chrome); ring.rotation.x = Math.PI / 2; ring.position.y = 0.22; grp.add(ring);
    [0, 1, 2].forEach(function (k) { var sp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.015, 0.015), chrome); sp.position.y = 0.22; sp.rotation.y = k * Math.PI / 3; grp.add(sp); });
    var cush = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.12, 24), pad); cush.position.y = 0.66; grp.add(cush);
    var top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.03, 24), pad); top.position.y = 0.735; grp.add(top);
    var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), chrome); plate.position.y = 0.6; grp.add(plate);
    return grp;
  };

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
    return [Math.min(Math.max(d, 1.5), 2), Math.min(d, 1.5), 1, 0.75][Q.level];   // niveau 0 : sur-échantillonné (net même sur un écran normal), l'Auto redescend si ça rame
  };
  Q.cycle = function () {
    var order = ['auto', 'high', 'medium', 'low'];
    Q.mode = order[(order.indexOf(Q.mode) + 1) % order.length];
    try { localStorage.setItem(QKEY, Q.mode); } catch (e) { /* ok */ }
    Q.start(F.isMobile());
    return Q.mode;
  };
  Q.set = function (mode) {
    if (['auto', 'high', 'medium', 'low'].indexOf(mode) < 0) return Q.mode;
    Q.mode = mode;
    try { localStorage.setItem(QKEY, Q.mode); } catch (e) { /* ok */ }
    Q.start(F.isMobile());
    return Q.mode;
  };
  // plafond d'images par seconde (téléphone › Réglages › Qualité) : 0 = pas de limite
  Q.FPS_CHOICES = [30, 60, 120, 180, 280];
  Q.fpsCap = function (v) {
    try {
      if (v !== undefined) localStorage.setItem('f3d_fpscap', String(v));
      var n = parseInt(localStorage.getItem('f3d_fpscap'), 10);
      return Q.FPS_CHOICES.indexOf(n) >= 0 ? n : 0;
    } catch (e) { return v || 0; }
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

  // Rôle affiché sous le pseudo, en dégradé (même couleurs que .role-tag dans style.css ; un sprite ne sachant pas
  // animer un dégradé CSS, celui-ci est figé, dessiné une fois sur le canvas de l'étiquette)
  var ROLE_ICON = { 'fa-crown': '👑', 'fa-gem': '💎', 'fa-fire': '🔥' };
  var ROLE_GRAD = { 'role-patron': ['#78350f', '#eab308', '#fef9c3'], 'role-cofondateur': ['#3b0764', '#a855f7', '#f5d0fe'], 'role-flambeur': ['#7f1d1d', '#ef4444', '#ffe08a'] };

  /* ---------- personnages 3D (modèles articulés, assets/personnages/) ----------
     Les danses, la marche, la position assise… s'appliquent toujours au petit bonhomme de base (son « squelette ») ; quand un joueur a choisi
     un personnage, ce bonhomme devient invisible et, à chaque image, ses articulations sont recopiées sur les os du modèle
     (même mouvement, mesuré depuis la pose en T des deux). Modèles : 100Avatars de Polygonal Mind (CC0), squelette Mixamo.
     Le choix du joueur : state.equipped.character (Tropi Shop, catégorie « Personnages ») ; il part avec la position (ch) vers les autres. */
  var CHARACTERS = F.CHARACTERS = {
    char_homme: { file: 'businessman.glb', h: 1.86 }, char_femme: { file: 'femme.glb', h: 1.74 },        // par défaut : le businessman et Erika
    char_business: { file: 'businessman.glb', h: 1.86 },   // ancien article du shop, devenu l'homme par défaut (gardé pour ceux qui l'avaient équipé)
    char_kate: { file: 'kate.glb', h: 1.74 }, char_rose: { file: 'rose.glb', h: 1.72 },
    char_olivia: { file: 'olivia.glb', h: 1.74 }, char_lydia: { file: 'lydia.glb', h: 1.84 }, char_jimmy: { file: 'jimmy.glb', h: 1.8 },
    char_robert: { file: 'robert.glb', h: 1.8 }, char_alien: { file: 'alien.glb', h: 1.8 }, char_nain: { file: 'nain.glb', h: 1.35 }
  };
  F.DEFAULT_CHARACTER = 'char_homme';
  F.myCharacter = function () {
    try { var e = typeof state !== 'undefined' && state && state.equipped && state.equipped.character; if (e === 'char_classic' || CHARACTERS[e]) return e; } catch (er) { /* pas de compte */ }
    return F.DEFAULT_CHARACTER;
  };
  var charCache = {};
  function loadCharacter(id, cb) {
    var def = CHARACTERS[id];
    if (!def || !THREE.GLTFLoader || !THREE.SkeletonUtils) { cb(null); return; }
    var c = charCache[id];
    if (c) { if (c.ok === true) cb(c); else if (c.ok === false) cb(null); else c.cbs.push(cb); return; }
    c = charCache[id] = { cbs: [cb] };
    new THREE.GLTFLoader().load('assets/personnages/' + def.file + '?v=1', function (gl) {
      var sc = gl.scene; sc.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(sc);
      c.scene = sc; c.minY = box.min.y; c.height = Math.max(0.1, box.max.y - box.min.y); c.ok = true;
      sc.traverse(function (o) {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m && m.map) { m.map.encoding = THREE.LinearEncoding; m.map.needsUpdate = true; } });   // couleurs telles que dessinées (le rendu du jeu n'est pas en sRGB)
      });
      var q = c.cbs; c.cbs = []; q.forEach(function (f) { f(c); });
    }, undefined, function () { c.ok = false; var q = c.cbs; c.cbs = []; q.forEach(function (f) { f(null); }); });
  }
  var LIVE = [];                                                        // personnes qui portent un modèle : recopiées à chaque image (F.syncPersons, appelé par world3d.js)
  F.syncPersons = function () { for (var i = 0; i < LIVE.length; i++) { try { LIVE[i](); } catch (e) { /* une personne en panne ne bloque pas les autres */ } } };

  // Petit personnage tout simple (comme au poker, en plus basique) : debout ou assis sur le tabouret
  // 3e paramètre : ignoré (réservé).
  // role (optionnel, 4e paramètre) : [icône FA, libellé, classe] comme renvoyé
  // par roleOf()/isCurrentUserAdmin() dans la page — affiché sous le pseudo. Garder cette position : world3d.js appelle
  // F.createPerson(name, avatar, '', role).
  function createPerson(name, avatar, lookInIgnored, role) {
    if (/^[?\s]*$|^(null|undefined)$/.test(String(avatar == null ? '' : avatar))) avatar = '';   // avatar abîmé (« ?? » venu d'un mauvais encodage) : on n'affiche que le pseudo
    var h = nameHash(name), G = geo();
    var skin = new THREE.MeshLambertMaterial({ color: SKIN_TONES[h % SKIN_TONES.length] });
    var shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[(h >> 3) % SHIRTS.length] });
    var pants = new THREE.MeshLambertMaterial({ color: 0x171a24 });
    var hairM = new THREE.MeshLambertMaterial({ color: HAIRS[(h >> 6) % HAIRS.length] });
    var dark = new THREE.MeshBasicMaterial({ color: 0x111111 });
    var mats = [skin, shirt, pants, hairM, dark];
    var g = new THREE.Group();
    var bodyMeshes = [];
    function add(geom, mat, x, y, z, parent) { var m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); (parent || g).add(m); bodyMeshes.push(m); return m; }
    add(G.hips, pants, 0, 0.98, 0);
    // haut du corps : pivote et se penche sur les hanches (danses) ; tête : hoche et penche sur le cou
    var upper = new THREE.Group(); upper.position.set(0, 0.98, 0); upper.rotation.order = 'YXZ'; g.add(upper);
    var torsoM = add(G.torso, shirt, 0, 0.32, 0, upper); add(G.neck, skin, 0, 0.64, 0, upper);
    var headG = new THREE.Group(); headG.position.set(0, 0.64, 0); headG.rotation.order = 'YXZ'; upper.add(headG);
    var head = add(G.head, skin, 0, 0.13, 0, headG);
    var headParts = [{ m: head, x: 0, z: 0 }];                                  // pièces qui suivent le mouvement de tête (look)
    var hairMesh = null;
    if ((h >> 9) % 5 !== 0) { hairMesh = add(G.hair, hairM, 0, 0.14, -0.005, headG); headParts.push({ m: hairMesh, x: 0, z: -0.005 }); }          // 1 personne sur 5 est chauve
    headParts.push({ m: add(G.eye, dark, -0.05, 0.15, 0.125, headG), x: -0.05, z: 0.125 }, { m: add(G.eye, dark, 0.05, 0.15, 0.125, headG), x: 0.05, z: 0.125 });
    var hips = [], knees = [], arms = [], elbows = [];
    [-1, 1].forEach(function (s) {
      var hip = new THREE.Group(); hip.position.set(s * 0.09, 0.92, 0); g.add(hip); hips.push(hip);
      add(G.thigh, pants, 0, -0.23, 0, hip);
      var knee = new THREE.Group(); knee.position.set(0, -0.46, 0); hip.add(knee); knees.push(knee);
      add(G.shin, pants, 0, -0.23, 0, knee); add(G.foot, dark, 0, -0.49, 0.04, knee);
      var sh = new THREE.Group(); sh.position.set(s * 0.26, 0.52, 0); upper.add(sh); arms.push(sh);
      add(G.arm, shirt, 0, -0.14, 0, sh).scale.y = 0.5;                                   // bras : épaule -> coude -> main
      var el = new THREE.Group(); el.position.set(0, -0.28, 0); sh.add(el); elbows.push(el);
      add(G.arm, shirt, 0, -0.15, 0, el).scale.y = 0.54; add(G.hand, skin, 0, -0.31, 0, el);
    });
    // étiquette au-dessus de la tête : avatar + pseudo, et le rôle en dégradé juste en dessous (si fourni)
    var rIcon = role && ROLE_ICON[role[0]], rLabel = role && role[1], rGrad = role && ROLE_GRAD[role[2]];
    var cvH = rLabel ? 104 : 72, cv = mkCanvas(320, cvH), c = cv.getContext('2d');
    roundRectPath(c, 4, 4, 312, cvH - 8, 22); c.fillStyle = 'rgba(8,5,12,0.82)'; c.fill(); c.strokeStyle = 'rgba(201,162,39,0.8)'; c.lineWidth = 3; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f4e3b0'; c.font = '700 32px ' + MONO;
    c.fillText(((avatar ? avatar + ' ' : '') + name).slice(0, 16), 160, rLabel ? 32 : 38, 292);
    if (rLabel) {
      var rTxt = (rIcon ? rIcon + ' ' : '') + rLabel, rFont = '800 22px ' + MONO;
      c.font = rFont;
      var rw = c.measureText(rTxt).width, rx0 = 160 - rw / 2, rx1 = 160 + rw / 2;
      if (rGrad) { var rg = c.createLinearGradient(rx0, 0, rx1, 0); rg.addColorStop(0, rGrad[0]); rg.addColorStop(0.5, rGrad[1]); rg.addColorStop(1, rGrad[2]); c.fillStyle = rg; }
      else c.fillStyle = '#d6b35a';
      c.fillText(rTxt, 160, 78, 292);
    }
    var tex = mkTex(cv);
    var tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    tag.scale.set(0.9, 0.9 * (cvH / 320), 1); tag.position.set(0, 2.1, 0); g.add(tag);
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
    // ---- modèle articulé (voir CHARACTERS plus haut) ----
    var disposed = false, charId = '', model = null, pairs = null, syncFn = null, qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), gInv = new THREE.Quaternion();
    function relQ(o, out) { o.getWorldQuaternion(out); return out.premultiply(gInv); }   // rotation dans le repère du personnage
    function dropModel() {
      if (model) { g.remove(model); model = null; }
      pairs = null;
      if (syncFn) { var i = LIVE.indexOf(syncFn); if (i >= 0) LIVE.splice(i, 1); syncFn = null; }
      bodyMeshes.forEach(function (m) { m.visible = true; });
    }
    function attachModel(c) {
      var inst = THREE.SkeletonUtils.clone(c.scene), wrap = new THREE.Group(), sc = CHARACTERS[charId].h / c.height;
      wrap.rotation.y = Math.PI;                                       // les modèles VRM regardent vers -Z, le personnage vers +Z
      wrap.scale.setScalar(sc); wrap.position.y = -c.minY * sc; wrap.add(inst); g.add(wrap); model = wrap;
      // les os portent des préfixes variés selon le modèle (« mixamorig: », « vis_char_69:mixamorig: », « AvatarsR2_0002: »…, les « : » parfois retirés au chargement) :
      // on les reconnaît à la fin de leur nom (« RightArm » ne termine pas « RightForeArm », « Spine » ne termine pas « Spine1 »)
      var boneList = [], bones = {};
      inst.traverse(function (o) { if (o.isBone) boneList.push(o); });
      ['Spine', 'Head', 'RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm', 'RightUpLeg', 'RightLeg', 'LeftUpLeg', 'LeftLeg'].forEach(function (w) {
        for (var i = 0; i < boneList.length; i++) { if (String(boneList[i].name).replace(/:/g, '').slice(-w.length) === w) { bones[w] = boneList[i]; break; } }
      });
      var MAP = [[upper, 'Spine'], [head, 'Head'], [arms[0], 'RightArm'], [elbows[0], 'RightForeArm'], [arms[1], 'LeftArm'], [elbows[1], 'LeftForeArm'],
        [hips[0], 'RightUpLeg'], [knees[0], 'RightLeg'], [hips[1], 'LeftUpLeg'], [knees[1], 'LeftLeg']];
      // calibrage : le bonhomme de base en T (bras à l'horizontale, le reste à zéro) face au modèle dans sa pose de repos (en T)
      var joints = [upper, headG, head, arms[0], arms[1], elbows[0], elbows[1], hips[0], hips[1], knees[0], knees[1]];
      var saved = joints.map(function (o) { return o.quaternion.clone(); });
      joints.forEach(function (o) { o.quaternion.set(0, 0, 0, 1); });
      arms[0].rotation.set(0, 0, -Math.PI / 2); arms[1].rotation.set(0, 0, Math.PI / 2);
      g.getWorldQuaternion(gInv).invert();
      pairs = [];
      MAP.forEach(function (m) { var b = bones[m[1]]; if (b) pairs.push({ p: m[0], b: b, pTinv: relQ(m[0], new THREE.Quaternion()).invert(), bT: relQ(b, new THREE.Quaternion()) }); });
      joints.forEach(function (o, i) { o.quaternion.copy(saved[i]); });
      bodyMeshes.forEach(function (m) { m.visible = false; });
      syncFn = function () {
        if (!pairs) return;
        g.getWorldQuaternion(gInv).invert();
        for (var i = 0; i < pairs.length; i++) {
          var pr = pairs[i];
          relQ(pr.p, qa).multiply(pr.pTinv);                             // mouvement de l'articulation depuis la pose en T
          qb.copy(qa).multiply(pr.bT);                                    // même mouvement appliqué à l'os du modèle
          relQ(pr.b.parent, qc).invert();
          pr.b.quaternion.copy(qc.multiply(qb));
        }
      };
      LIVE.push(syncFn);
    }
    g.rotation.order = 'YXZ';                                          // cap, puis penché en avant, puis de côté (danses)
    arms.forEach(function (a) { a.rotation.order = 'YXZ'; });          // bras : écart sur le côté, puis élan, puis rentré
    // objet en main : le bras droit se lève devant le personnage avec l'objet ; sans objet il reste le long du corps (les autres joueurs voient la différence)
    var heldId = '', heldItem = null, heldK = 0, heldQ = new THREE.Quaternion(), heldUp = new THREE.Vector3();
    function ease01(v) { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }
    // mouvements de table (Loup-Garou) : tête tournée vers quelqu'un, bras qui désigne, corps affalé quand on est éliminé
    var lkT = 0, lkC = 0, ptT = null, ptK = 0, ptY = 0, ptArm = 0, slT = 0, slK = 0;
    return {
      look: function (a) { lkT = Math.max(-1.1, Math.min(1.1, a || 0)); },                       // radians, positif = vers la gauche du personnage
      point: function (a) { ptT = (a === null || a === undefined) ? null : Math.max(-1.3, Math.min(1.3, a)); },
      slump: function (on) { slT = on ? 1 : 0; },
      poseStep: function (dt) {
        var k = Math.min(1, dt * 6), i, c, s;
        lkC += (lkT - lkC) * k; c = Math.cos(lkC); s = Math.sin(lkC);
        for (i = 0; i < headParts.length; i++) { var hp = headParts[i]; hp.m.rotation.y = lkC; hp.m.position.x = hp.x * c + hp.z * s; hp.m.position.z = -hp.x * s + hp.z * c; }
        if (ptT !== null) { ptY += (ptT - ptY) * k; ptArm = ptT >= 0 ? 1 : 0; }
        var want = ptT !== null && this.seated ? 1 : 0; ptK += (want - ptK) * Math.min(1, dt * 7);
        if (ptK > 0.01) { var ar = arms[ptArm], other = arms[1 - ptArm]; ar.rotation.x = -1.05 + (-1.55 + 1.05) * ptK; ar.rotation.y = ptY * ptK; other.rotation.x = -1.05; other.rotation.y = 0; }
        else if (ptK > 0) { ptK = 0; arms.forEach(function (a) { a.rotation.y = 0; a.rotation.x = this.seated ? -1.05 : 0; }, this); }
        slK += (slT - slK) * Math.min(1, dt * 4);
        if (slK > 0.01 && this.seated) g.rotation.x = 0.55 * slK; else if (slK <= 0.01 && g.rotation.x && !this.emoId) { g.rotation.x = 0; }
      },
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
      // personnage articulé : id de F.CHARACTERS ; 'classic' ou inconnu : le petit bonhomme de base
      setCharacter: function (id) {
        id = CHARACTERS[id] ? id : '';
        if (id === charId) return;
        charId = id; dropModel();
        if (!id) return;
        var want = id;
        loadCharacter(id, function (c) { if (!c || charId !== want || disposed) return; attachModel(c); });
      },
      character: function () { return charId; },
      // pièces et matériaux pour habiller un personnage (vendeurs, croupiers) : ne jamais les chercher par leur rang dans group.children
      mats: { skin: skin, shirt: shirt, pants: pants, hair: hairM }, torso: torsoM, headMesh: head, hairMesh: hairMesh,
      group: g, hips: hips, knees: knees, arms: arms, elbows: elbows, upper: upper, head: headG, tag: tag, phase: 0, seated: false, emoId: '', emoT: 0, emoYaw: 0,
      // Danses et emotes (catalogue dans emotes3d.js). L'appelant fixe d'abord la position et le cap, puis appelle playEmote à chaque image.
      startEmote: function (id) { this.emoT = 0; if (F.emoteById && F.emoteById(id)) this.emoId = id; else this.clearEmote(); },
      clearEmote: function () {
        if (!this.emoId && !this.emoYaw && !g.rotation.x && !g.rotation.z) return;
        this.emoId = ''; this.emoT = 0;
        g.rotation.y -= this.emoYaw; this.emoYaw = 0; g.rotation.x = 0; g.rotation.z = 0;
        hips.forEach(function (hp) { hp.rotation.set(0, 0, 0); }); knees.forEach(function (kn) { kn.rotation.set(0, 0, 0); }); arms.forEach(function (ar) { ar.rotation.set(0, 0, 0); });
        elbows.forEach(function (e2) { e2.rotation.set(0, 0, 0); }); upper.rotation.set(0, 0, 0); headG.rotation.set(0, 0, 0); tag.position.y = 2.1;
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
        // coudes [plié vers l'avant, replié dans le plan du corps (vers la tête quand le bras est levé)], haut du corps et tête
        var e0 = p.e0 || Z, e1 = p.e1 || Z;
        elbows[0].rotation.set(-e0[0] * k, 0, -e0[1] * k); elbows[1].rotation.set(-e1[0] * k, 0, e1[1] * k);
        upper.rotation.set((p.ux || 0) * k, (p.uy || 0) * k, (p.uz || 0) * k);
        headG.rotation.set((p.nx || 0) * k, (p.ny || 0) * k, (p.nz || 0) * k);
        var cl = Math.cos(g.rotation.x);                                   // tête en bas (breakdance) : l'étiquette du pseudo reste au-dessus, côté plafond
        tag.position.y = cl < -0.3 ? (2.2 - (p.y || 0) * k) / cl : 2.1;
        return true;
      },
      setSeated: function (on, spec) {
        // spec.y = hauteur du dessus de l'assise moins 0,50 m (comme pour le vrai personnage) : le bas des cuisses se pose pile dessus (assise = 0,835 + hauteur du corps)
        if (spec && typeof spec.y === 'number') this.sitY = spec.y;
        var sy = typeof this.sitY === 'number' ? this.sitY : 0.035, gy = sy - 0.335, ks = Math.max(1, Math.min(1.7, (sy + 0.585) / 0.52));      // ks : on allonge le bas des jambes pour que les pieds touchent le sol, quelle que soit la hauteur de la chaise
        if (on === this.seated) { if (on) { g.position.y = gy; knees.forEach(function (k) { k.scale.y = ks; }); } return; } this.seated = on;
        g.position.y = on ? gy : 0;                                     // hanches posées sur le tabouret
        knees.forEach(function (k) { k.scale.y = on ? ks : 1; });
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
        disposed = true; dropModel();
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
    var nm = '', av = '';
    try { nm = state.username || ''; } catch (e) { /* pas connecté */ }
    try { av = typeof getAvatarDisplay === 'function' ? getAvatarDisplay() : ''; } catch (e) { /* page pas prête */ }
    if (PRES.rt && PRES.rt.ready && PRES.me) PRES.rt.send('p', { k: PRES.me, name: String(nm).slice(0, 20), av: String(av || '').slice(0, 12), room: PRES.room });
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
        if (m.av || m.name) PRES.info[m.k] = { av: m.av || (PRES.info[m.k] && PRES.info[m.k].av) || '', name: m.name || '' };   // pseudo et avatar de chacun (photos du chat)
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
      '.s3d-rotate{display:none;position:absolute;inset:0;z-index:99;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:rgba(7,5,12,.96);color:#f3cf62;font-weight:800;font-size:17px;text-align:center;pointer-events:auto}' +
      '.s3d-rotate i{font-size:44px;animation:s3dRot 1.6s ease-in-out infinite}@keyframes s3dRot{0%,30%{transform:rotate(0)}70%,100%{transform:rotate(-90deg)}}' +
      '@media (orientation:portrait){.s3d-hud.s3d-touch .s3d-rotate{display:flex}}' +
      '.s3d-hud.s3d-touch .ph-fsbtn{display:none!important}' +
      '.s3d-full{height:100dvh!important}' +
      '.s3d-stick{position:absolute;left:18px;bottom:22px;width:112px;height:112px;border-radius:50%;background:rgba(8,5,12,.55);border:2px solid rgba(201,162,39,.5);pointer-events:auto;touch-action:none}' +
      '.s3d-padf{outline:3px solid #ffd24a!important;outline-offset:2px;box-shadow:0 0 14px rgba(255,210,74,.8)!important}' +
      '.s3d-tbtn{position:absolute;right:20px;width:68px;height:68px;border-radius:50%;background:rgba(8,5,12,.6);border:2px solid rgba(201,162,39,.6);color:#f3cf62;font-size:26px;touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none;z-index:6}' +
      '.s3d-tjump{bottom:26px}.s3d-trun{bottom:104px;width:56px;height:56px;font-size:22px;right:26px}.s3d-tbtn:active{background:rgba(243,207,98,.35)}.s3d-trun.on{background:rgba(243,207,98,.85);color:#1a1208}' +
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
      '@media (min-width:768px){.s3d-bottom{left:50%;right:auto;transform:translateX(-50%);width:430px}}' +
      '.s3d-voice{position:absolute;left:14px;bottom:14px;display:flex;flex-direction:column;align-items:flex-start;gap:5px}' +
      '.s3d-hud.s3d-touch .s3d-voice{bottom:150px}' +
      '.s3d-voice-row{display:flex;gap:8px}' +
      '.s3d-voice-btn{position:relative;width:50px;height:50px;border-radius:14px;background:rgba(8,5,12,.8);border:2px solid rgba(201,162,39,.55);color:#f3cf62;font-size:18px;display:flex;align-items:center;justify-content:center}' +
      '.s3d-voice-btn.off{border-color:#d65a5a;color:#ff8a8a;background:rgba(42,8,8,.8)}' +
      '.s3d-voice-btn.blocked{opacity:.5}' +
      '.s3d-voice-btn kbd{position:absolute;right:-5px;bottom:-5px;min-width:15px;text-align:center;background:#1a1208;border:1px solid rgba(201,162,39,.75);border-radius:5px;font-size:9px;font-weight:800;padding:1px 3px;color:#f3cf62;line-height:1.35}' +
      '.s3d-voice-status{font-size:10.5px;font-weight:700;color:#d9c88f;text-shadow:0 1px 4px #000;background:rgba(8,5,12,.62);border-radius:8px;padding:2px 9px;white-space:nowrap}';
    document.head.appendChild(st);
  };
})();
