/* =====================================================================
   portes3d.js — Thèmes des portes du casino 3D : un logo dessiné au-dessus de chaque porte et un décor propre à chaque jeu
   ---------------------------------------------------------------------
   world3d.js (World.prototype.addDoor) regarde spec.theme : si un thème existe ici, il remplace l'enseigne classique (emoji + texte)
   par une enseigne à logo, peint les battants aux couleurs du jeu, colore le cadre et ajoute le décor 3D du thème.
   Sans thème, la porte reste comme avant (portes de retour, PMU…).
   Un thème = {
     frame : couleur du cadre (et des poignées), leaf : couleur du bois des battants, rgb : couleur du logo « R, G, B »,
     logo  : nom de l'icône (voir ICONS), image : fichier à la place de l'icône (logo rond, ex. photo du serveur Tropi Stream),
     paint(c, W, H) : peint un battant (canvas), deco(g, w, h, H3) : ajoute des objets 3D autour de la porte
   }
   Chargé AVANT world3d.js.
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D = window.F3D || {};
  var TAU = Math.PI * 2;
  var SERIF = '"Cinzel",Georgia,serif', MONO = '"Orbitron","JetBrains Mono",monospace';

  /* ---------- icônes : dessinées dans un carré de 24 unités, avec la couleur du jeu (col) sur le fond de la pastille (bg) ---------- */
  var P = {
    spade: 'M12 2.5C10 6 3.5 9 3.5 13.6c0 2.8 2.1 4.6 4.4 4.6 1.5 0 2.7-.8 3.3-1.8-.2 2.2-1.1 3.8-2.6 5.1h6.8c-1.5-1.3-2.4-2.9-2.6-5.1.6 1 1.8 1.8 3.3 1.8 2.3 0 4.4-1.8 4.4-4.6C20.5 9 14 6 12 2.5z',
    slotTop: 'M6.3 2.6h7.4a1.3 1.3 0 0 1 0 2.6H6.3a1.3 1.3 0 0 1 0-2.6z',
    slotBody: 'M5 6h10a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 15 21H5a2.5 2.5 0 0 1-2.5-2.5v-10A2.5 2.5 0 0 1 5 6zm-.4 3h3v6h-3zm3.9 0h3v6h-3zm3.9 0h3v6h-3zM7 17.6h6v1.3H7z',
    slotLever: 'M17.5 13h2.1V6.5h1.2v7.9h-3.3z',
    cupL: 'M2.30 11h3.8q.5 0 .6.5L7.70 20H0.70L1.70 11.5q.1-.5.6-.5z', cupR: 'M17.90 11h3.8q.5 0 .6.5L23.30 20H16.30L17.30 11.5q.1-.5.6-.5z', cupM: 'M10.10 4h3.8q.5 0 .6.5L15.50 13H8.50L9.50 4.5q.1-.5.6-.5z'
  };
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  var ICONS = {
    slots: function (c, col) { c.fillStyle = col; c.fill(new Path2D(P.slotTop)); c.fill(new Path2D(P.slotBody), 'evenodd'); c.fill(new Path2D(P.slotLever)); c.beginPath(); c.arc(20.2, 5, 1.9, 0, TAU); c.fill(); },
    poker: function (c, col) { c.fillStyle = col; c.fill(new Path2D(P.spade)); },
    blackjack: function (c, col, bg) {
      c.save(); c.translate(8.5, 13.25); c.rotate(-0.21); c.fillStyle = col; rr(c, -5.5, -7.75, 11, 15.5, 2); c.fill(); c.restore();
      c.save(); c.translate(15, 10.25); c.rotate(0.21); c.fillStyle = bg; rr(c, -6.6, -8.85, 13.2, 17.7, 2.6); c.fill(); c.fillStyle = col; rr(c, -5.5, -7.75, 11, 15.5, 2); c.fill();
      c.fillStyle = bg; c.beginPath(); c.moveTo(0, 3.1); c.bezierCurveTo(-3.4, 0.6, -3.4, -2.6, -1.4, -2.6); c.bezierCurveTo(-0.6, -2.6, 0, -2, 0, -1.4); c.bezierCurveTo(0, -2, 0.6, -2.6, 1.4, -2.6); c.bezierCurveTo(3.4, -2.6, 3.4, 0.6, 0, 3.1); c.fill(); c.restore();
    },
    crash: function (c, col, bg) {
      c.fillStyle = col; c.beginPath(); c.moveTo(12, 1.5); c.bezierCurveTo(17, 6, 17.5, 11, 16.2, 16.5); c.lineTo(7.8, 16.5); c.bezierCurveTo(6.5, 11, 7, 6, 12, 1.5); c.fill();
      c.beginPath(); c.moveTo(7.8, 12.5); c.lineTo(3.5, 18); c.lineTo(8.2, 17); c.fill(); c.beginPath(); c.moveTo(16.2, 12.5); c.lineTo(20.5, 18); c.lineTo(15.8, 17); c.fill();
      c.beginPath(); c.moveTo(9.8, 17.6); c.lineTo(12, 22.5); c.lineTo(14.2, 17.6); c.fill();
      c.fillStyle = bg; c.beginPath(); c.arc(12, 9, 2.2, 0, TAU); c.fill();
    },
    mines: function (c, col, bg) {
      c.fillStyle = col; rr(c, 2.5, 3, 19, 17, 2.4); c.fill(); c.fillRect(5, 20, 3, 2); c.fillRect(16, 20, 3, 2);
      c.strokeStyle = bg; c.lineWidth = 1.5; c.beginPath(); c.arc(12, 11.5, 5.2, 0, TAU); c.stroke();
      c.lineWidth = 1.3; for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2 + 0.4; c.beginPath(); c.moveTo(12 + Math.cos(a) * 2, 11.5 + Math.sin(a) * 2); c.lineTo(12 + Math.cos(a) * 7, 11.5 + Math.sin(a) * 7); c.stroke(); }
      c.fillStyle = bg; c.beginPath(); c.arc(12, 11.5, 1.5, 0, TAU); c.fill();
    },
    cups: function (c, col) { c.fillStyle = col; [P.cupL, P.cupR, P.cupM].forEach(function (d) { c.fill(new Path2D(d)); }); c.fillRect(0.3, 20.5, 7.8, 1.5); c.fillRect(15.9, 20.5, 7.8, 1.5); c.fillRect(8.1, 13.5, 7.8, 1.5); c.beginPath(); c.arc(12, 19.6, 2.3, 0, TAU); c.fill(); },
    scratch: function (c, col, bg) {
      c.fillStyle = col; rr(c, 1.5, 5, 21, 14, 1.6); c.fill();
      c.fillStyle = bg; c.beginPath(); c.arc(1.5, 12, 2.2, 0, TAU); c.fill(); c.beginPath(); c.arc(22.5, 12, 2.2, 0, TAU); c.fill();
      c.strokeStyle = bg; c.lineWidth = 1; c.setLineDash([1.6, 1.4]); c.beginPath(); c.moveTo(16, 6.5); c.lineTo(16, 17.5); c.stroke(); c.setLineDash([]);
      c.fillStyle = bg; c.beginPath(); for (var i = 0; i < 10; i++) { var r = i % 2 ? 1.5 : 3.4, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(8.8 + Math.cos(a) * r, 12 + Math.sin(a) * r); } c.closePath(); c.fill();
    },
    blindtest: function (c, col) {
      c.fillStyle = col; c.beginPath(); c.ellipse(7.5, 18, 4, 3.2, -0.3, 0, TAU); c.fill(); c.beginPath(); c.ellipse(17.5, 16, 4, 3.2, -0.3, 0, TAU); c.fill();
      c.fillRect(10.6, 4.5, 1.8, 13); c.fillRect(20.6, 2.5, 1.8, 12.6); c.beginPath(); c.moveTo(10.6, 4.5); c.lineTo(22.4, 2.5); c.lineTo(22.4, 6); c.lineTo(10.6, 8); c.fill();
    },
    shop: function (c, col, bg) {
      c.fillStyle = col; c.beginPath(); c.moveTo(4, 8); c.lineTo(20, 8); c.lineTo(21.3, 21.5); c.lineTo(2.7, 21.5); c.closePath(); c.fill();
      c.strokeStyle = col; c.lineWidth = 1.9; c.beginPath(); c.arc(12, 8, 4.2, Math.PI, 0); c.stroke();
      c.fillStyle = bg; c.beginPath(); c.arc(8.6, 12.5, 1.1, 0, TAU); c.fill(); c.beginPath(); c.arc(15.4, 12.5, 1.1, 0, TAU); c.fill();
    },
    bank: function (c, col) {
      c.fillStyle = col; c.beginPath(); c.moveTo(1.5, 9); c.lineTo(12, 2.5); c.lineTo(22.5, 9); c.closePath(); c.fill();
      [3.6, 8.2, 12.8, 17.4].forEach(function (x) { c.fillRect(x, 10.5, 3, 7.5); }); c.fillRect(2, 19, 20, 2.2); c.fillRect(0.8, 21.4, 22.4, 1.6);
    },
    horses: function (c, col) {
      c.strokeStyle = col; c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath(); c.arc(12, 12.5, 6.6, -Math.PI / 3, Math.PI + Math.PI / 3); c.stroke();
      c.fillStyle = col; [[5.6, 17.6], [18.4, 17.6], [4.8, 11.5], [19.2, 11.5]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 0.01, 0, TAU); c.fill(); });
    },
    cinema: function (c, col, bg) {                       // secours si la photo du serveur n'est pas chargée : un clap
      c.fillStyle = col; rr(c, 2.5, 9, 19, 12, 1.5); c.fill(); c.save(); c.translate(3, 8); c.rotate(-0.2); rr(c, 0, -4, 19, 4.2, 1); c.fill(); c.restore();
      c.fillStyle = bg; for (var i = 0; i < 4; i++) c.fillRect(5 + i * 4.4, 4.8 - i * 0.2, 2, 2);
    }
  };

  var imgs = {};
  function loadImg(src, done) {
    var im = imgs[src];
    if (im) { if (im.complete && im.naturalWidth) done(); else im.addEventListener('load', done); return im; }
    im = imgs[src] = new Image(); im.addEventListener('load', done); im.src = src; return im;
  }

  /* ---------- l'enseigne : pastille du logo à gauche, nom et sous-titre à droite ---------- */
  F.paintDoorSign = function (cv, spec, th, onLoad) {
    var W = cv.width, H = cv.height, c = cv.getContext('2d'), rgb = th.rgb;
    function draw() {
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#12080f'; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgb(' + rgb + ')'; c.lineWidth = 7; c.strokeRect(5, 5, W - 10, H - 10);
      var S = H - 44, x = 26, y = 22, bg = '#1b0e16';
      if (th.image) {                                      // logo rond : photo du serveur
        c.save(); c.beginPath(); if (th.square) rr(c, x, y, S, S, 26); else c.arc(x + S / 2, y + S / 2, S / 2, 0, TAU); c.clip(); c.fillStyle = bg; c.fillRect(x, y, S, S);
        var im = imgs[th.image]; if (im && im.complete && im.naturalWidth) c.drawImage(im, x, y, S, S); c.restore();
        c.strokeStyle = 'rgb(' + rgb + ')'; c.lineWidth = 5; if (th.square) { rr(c, x, y, S, S, 26); } else { c.beginPath(); c.arc(x + S / 2, y + S / 2, S / 2 - 1, 0, TAU); } c.stroke();
      } else {                                             // pastille façon .fl-logo : fond teinté, bord teinté, icône pleine
        c.fillStyle = 'rgba(' + rgb + ',0.2)'; rr(c, x, y, S, S, 22); c.fill(); c.strokeStyle = 'rgba(' + rgb + ',0.6)'; c.lineWidth = 4; rr(c, x, y, S, S, 22); c.stroke();
        c.save(); c.translate(x + S * 0.17, y + S * 0.17); c.scale(S * 0.66 / 24, S * 0.66 / 24); c.lineCap = 'round';
        (ICONS[th.logo] || ICONS.poker)(c, 'rgb(' + rgb + ')', '#1b0e16'); c.restore();
      }
      var label = String(spec.label || '').replace(/^[^\p{L}\p{N}]+/u, '');                 // l'emoji de tête devient le logo : on l'enlève du texte
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(' + rgb + ',0.7)'; c.shadowBlur = 10; c.fillStyle = '#fff3d6';
      c.font = '800 54px ' + SERIF; c.fillText(label, x + S + 26, spec.sub ? H * 0.42 : H / 2, W - x - S - 56);
      if (spec.sub) { c.shadowBlur = 0; c.fillStyle = 'rgb(' + rgb + ')'; c.font = '700 24px ' + MONO; c.fillText(spec.sub, x + S + 26, H * 0.74, W - x - S - 56); }
      if (onLoad) onLoad();
    }
    draw();
    if (th.image) loadImg(th.image, draw);
  };

  /* ---------- peinture des battants (un battant : W × H pixels) ---------- */
  function noise(c, W, H, n, col) { c.fillStyle = col; for (var i = 0; i < n; i++) c.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  function border(c, W, H, col, w) { c.strokeStyle = col; c.lineWidth = w; c.strokeRect(w, w, W - w * 2, H - w * 2); }
  function bulbRing(g, w, h, mats) {                      // ampoules de chapiteau autour de la porte
    var n = 0;
    function bulb(x, y) { var m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats[n++ % mats.length]); m.position.set(x, y, 0.23); g.add(m); }
    for (var x = -w / 2 - 0.07; x <= w / 2 + 0.08; x += 0.22) bulb(x, h + 0.1);
    for (var y = 0.2; y < h; y += 0.24) { bulb(-w / 2 - 0.07, y); bulb(w / 2 + 0.07, y); }
  }
  function chips(g, x, z, cols) {                          // piles de jetons posées au sol
    cols.forEach(function (col, k) { for (var i = 0; i < 5 + k; i++) { var m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), new THREE.MeshLambertMaterial({ color: col })); m.position.set(x + k * 0.23, 0.02 + i * 0.033, z); g.add(m); } });
  }

  var T = F.DOOR_THEMES = {
    slots: {
      frame: 0xd8dbe4, leaf: 0xa8102a, rgb: '255, 179, 71', logo: 'slots', image: 'assets/icones/jeux/machines-a-sous.png', square: true,
      paint: function (c, W, H) {
        var g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#8a0c20'); g.addColorStop(0.5, '#d41a3a'); g.addColorStop(1, '#8a0c20'); c.fillStyle = g; c.fillRect(0, 0, W, H);
        border(c, W, H, '#ffd24a', 8);
        [['7', '#d41a3a'], ['BAR', '#111'], ['7', '#d41a3a']].forEach(function (s, i) { var y = H * 0.1 + i * H * 0.27; c.fillStyle = '#fff8e0'; rr(c, W * 0.14, y, W * 0.72, H * 0.23, 14); c.fill(); c.fillStyle = s[1]; c.font = '900 ' + (s[0] === '7' ? 110 : 62) + 'px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s[0], W / 2, y + H * 0.12); });
        c.fillStyle = '#ffd24a'; for (var i = 0; i < 6; i++) { c.beginPath(); c.arc(W * (0.2 + i * 0.12), H * 0.93, 7, 0, TAU); c.fill(); }
      },
      deco: function (g, w, h) { bulbRing(g, w, h, [new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), new THREE.MeshBasicMaterial({ color: 0xff5a5a })]); }
    },
    poker: {
      frame: 0xc9a227, leaf: 0x0f5a33, rgb: '126, 224, 160', logo: 'poker', image: 'assets/icones/jeux/poker.png', square: true,
      paint: function (c, W, H) {
        c.fillStyle = '#0f5a33'; c.fillRect(0, 0, W, H); noise(c, W, H, 700, 'rgba(255,255,255,0.05)'); border(c, W, H, '#e6c458', 8); border(c, W, H, 'rgba(230,196,88,0.5)', 22);
        c.save(); c.translate(W / 2 - 150 * 0.0, H * 0.4); c.scale(8.5, 8.5); c.translate(-12, -12); c.fillStyle = 'rgba(230,196,88,0.33)'; c.fill(new Path2D(P.spade)); c.restore();
        c.fillStyle = '#e6c458'; c.font = '900 70px ' + SERIF; c.textAlign = 'center'; c.fillText('♠', W * 0.22, H * 0.1); c.fillStyle = '#ef4444'; c.fillText('♥', W * 0.78, H * 0.92);
      },
      deco: function (g, w, h) { chips(g, -w / 2 - 0.6, 0.6, [0xd02a2a, 0x1f4e9e]); chips(g, w / 2 + 0.3, 0.6, [0x111111, 0x1d8a4e]); }
    },
    blackjack: {
      frame: 0xc9a227, leaf: 0x6a0f1c, rgb: '255, 138, 138', logo: 'blackjack', image: 'assets/icones/jeux/blackjack.png', square: true,
      paint: function (c, W, H) {
        c.fillStyle = '#6a0f1c'; c.fillRect(0, 0, W, H); noise(c, W, H, 700, 'rgba(255,255,255,0.05)'); border(c, W, H, '#e6c458', 8); border(c, W, H, 'rgba(230,196,88,0.5)', 22);
        c.fillStyle = '#f4e3b0'; c.font = '900 190px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('21', W / 2, H * 0.5);
        c.font = '900 64px ' + SERIF; c.fillStyle = '#e6c458'; c.fillText('♦', W * 0.22, H * 0.1); c.fillText('♣', W * 0.78, H * 0.92);
      }
    },
    crash: {
      frame: 0x8a96b8, leaf: 0x0e1840, rgb: '154, 184, 255', logo: 'crash', image: 'assets/icones/jeux/fusee-crash.png', square: true,
      paint: function (c, W, H) {
        var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060a22'); g.addColorStop(1, '#1f3a8a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
        for (var i = 0; i < 70; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.7) + ')'; c.fillRect(Math.random() * W, Math.random() * H * 0.85, 2, 2); }
        c.save(); c.translate(W * 0.5, H * 0.4); c.rotate(0.35); c.scale(9, 9); c.translate(-12, -12); c.fillStyle = '#e8eefc'; ICONS.crash(c, '#e8eefc', '#2a4ab0'); c.restore();
        for (var k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#111' : '#ffd24a'; c.beginPath(); c.moveTo(k * W / 8 - 20, H); c.lineTo(k * W / 8 + 20, H - 70); c.lineTo(k * W / 8 + W / 8 + 20, H - 70); c.lineTo(k * W / 8 + W / 8 - 20, H); c.fill(); }
        border(c, W, H, '#9ab8ff', 6);
      }
    },
    mines: {
      frame: 0x7d8888, leaf: 0x5b6b6b, rgb: '138, 230, 200', logo: 'mines', image: 'assets/icones/jeux/chambre-forte.png', square: true,
      paint: function (c, W, H) {
        var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#8a9a9a'); g.addColorStop(0.5, '#5b6b6b'); g.addColorStop(1, '#7d8d8d'); c.fillStyle = g; c.fillRect(0, 0, W, H);
        border(c, W, H, '#3a4646', 10); c.fillStyle = '#c9d4d4'; for (var x = 30; x < W - 20; x += 40) { c.beginPath(); c.arc(x, 30, 6, 0, TAU); c.fill(); c.beginPath(); c.arc(x, H - 30, 6, 0, TAU); c.fill(); }
        c.strokeStyle = '#2f3a3a'; c.lineWidth = 12; c.beginPath(); c.arc(W / 2, H * 0.5, 100, 0, TAU); c.stroke(); c.strokeStyle = '#d6e0e0'; c.lineWidth = 8;
        for (var i = 0; i < 6; i++) { var a = i * TAU / 6; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * 22, H * 0.5 + Math.sin(a) * 22); c.lineTo(W / 2 + Math.cos(a) * 118, H * 0.5 + Math.sin(a) * 118); c.stroke(); }
        c.fillStyle = '#d6e0e0'; c.beginPath(); c.arc(W / 2, H * 0.5, 26, 0, TAU); c.fill();
      }
    },
    cups: {
      frame: 0xc9a227, leaf: 0x4b1d7a, rgb: '255, 224, 138', logo: 'cups', image: 'assets/icones/jeux/gobelets.png', square: true,
      paint: function (c, W, H) {
        c.fillStyle = '#4b1d7a'; c.fillRect(0, 0, W, H); border(c, W, H, '#ffd24a', 8);
        for (var i = 0; i < 26; i++) { var x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60), r = 6 + Math.random() * 12; c.fillStyle = 'rgba(255,224,138,' + (0.35 + Math.random() * 0.5) + ')'; c.beginPath(); for (var k = 0; k < 10; k++) { var rr2 = k % 2 ? r * 0.45 : r, a = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } c.closePath(); c.fill(); }
        c.save(); c.translate(W / 2, H * 0.5); c.scale(7, 7); c.translate(-12, -12); ICONS.cups(c, '#ffe08a'); c.restore();
      },
      deco: function (g, w) { [-0.5, 0.5].forEach(function (s) { var m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.26, 14), new THREE.MeshLambertMaterial({ color: 0xd02a2a })); m.position.set(s * (w / 2 + 0.55), 0.13, 0.5); g.add(m); }); }
    },
    scratch: {
      frame: 0xffd0e8, leaf: 0xff9fcf, rgb: '255, 192, 224', logo: 'scratch', image: 'assets/icones/jeux/grattage.png', square: true,
      paint: function (c, W, H) {
        c.fillStyle = '#ff9fcf'; c.fillRect(0, 0, W, H); c.strokeStyle = '#fff'; c.lineWidth = 6; c.setLineDash([14, 10]); c.strokeRect(14, 14, W - 28, H - 28); c.setLineDash([]);
        for (var i = 0; i < 10; i++) { c.fillStyle = 'rgba(192,192,204,' + (0.65 + Math.random() * 0.3) + ')'; rr(c, 24 + Math.random() * (W - 110), 40 + Math.random() * (H - 120), 50 + Math.random() * 50, 34 + Math.random() * 30, 8); c.fill(); }
        c.fillStyle = '#7a1a4a'; c.font = '900 120px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('€', W / 2, H * 0.5);
      }
    },
    blindtest: {
      frame: 0x7a3fd0, leaf: 0x0e0716, rgb: '217, 160, 255', logo: 'blindtest', image: 'assets/icones/jeux/blind-test.png', square: true,
      paint: function (c, W, H) {
        c.fillStyle = '#0e0716'; c.fillRect(0, 0, W, H); border(c, W, H, '#b06cff', 6);
        var n = 7, bw = (W - 60) / n; for (var i = 0; i < n; i++) { var bh = H * (0.25 + Math.random() * 0.55), g = c.createLinearGradient(0, H, 0, H - bh); g.addColorStop(0, '#6d28d9'); g.addColorStop(1, '#f472b6'); c.fillStyle = g; c.fillRect(30 + i * bw + 4, H - 40 - bh, bw - 8, bh); }
        c.fillStyle = '#f4e9ff'; c.font = '900 90px ' + SERIF; c.textAlign = 'center'; c.fillText('♪', W / 2, H * 0.18);
      }
    },
    shop: {
      frame: 0x8a5a2a, leaf: 0x6b3d1a, rgb: '255, 210, 74', logo: 'shop', image: 'assets/icones/services/tropi-shop-petit.png', square: true,
      paint: function (c, W, H) {
        c.fillStyle = '#7a4a22'; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 3; for (var x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
        noise(c, W, H, 500, 'rgba(0,0,0,0.12)'); border(c, W, H, '#ffd24a', 7);
        c.fillStyle = '#ffd24a'; rr(c, W * 0.15, H * 0.4, W * 0.7, H * 0.2, 12); c.fill(); c.fillStyle = '#3a1d0a'; c.font = '900 56px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OPEN', W / 2, H * 0.5);
      },
      deco: function (g, w, h) {                         // auvent rayé rouge et blanc au-dessus de la porte
        var n = 8, aw = (w + 0.9) / n;
        for (var i = 0; i < n; i++) { var m = new THREE.Mesh(new THREE.BoxGeometry(aw, 0.04, 0.55), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xf6f6f6 : 0xc41e2a })); m.position.set(-(w + 0.9) / 2 + aw * (i + 0.5), h + 0.32, 0.4); m.rotation.x = 0.35; g.add(m); }
      }
    },
    bank: {
      frame: 0xe8dfc8, leaf: 0xe8dfc8, rgb: '160, 216, 255', logo: 'bank',
      paint: function (c, W, H) {
        c.fillStyle = '#ece4d0'; c.fillRect(0, 0, W, H); noise(c, W, H, 500, 'rgba(120,110,90,0.12)'); border(c, W, H, '#1e3a8a', 9); border(c, W, H, 'rgba(30,58,138,0.45)', 24);
        c.fillStyle = '#1e3a8a'; c.font = '900 150px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('€', W / 2, H * 0.5);
      },
      deco: function (g, w, h) { [-1, 1].forEach(function (s) { var m = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, h + 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.4 })); m.position.set(s * (w / 2 + 0.55), (h + 0.1) / 2, 0.35); g.add(m); }); }
    },
    horses: {
      frame: 0xf2f2f2, leaf: 0x1f6b2a, rgb: '127, 209, 255', logo: 'horses', image: 'assets/icones/jeux/courses.png', square: true,
      paint: function (c, W, H) {
        c.fillStyle = '#1f6b2a'; c.fillRect(0, 0, W, H); noise(c, W, H, 900, 'rgba(255,255,255,0.07)');
        c.fillStyle = '#f2f2f2'; [0.5, 0.64, 0.78].forEach(function (y) { c.fillRect(0, H * y, W, 14); }); [0.12, 0.88].forEach(function (x) { c.fillRect(W * x - 8, H * 0.46, 16, H * 0.46); });
        var s = 30; for (var i = 0; i < Math.ceil(W / s); i++) for (var j = 0; j < 3; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * s, 20 + j * s, s, s); }
        border(c, W, H, '#f2f2f2', 6);
      }
    },
    cinema: {
      frame: 0xc9a227, leaf: 0x8c1a26, rgb: '255, 122, 26', logo: 'cinema', image: 'assets/cinema/tropistream-serveur.png',
      paint: function (c, W, H) {
        for (var x = 0; x < W; x++) { var sh = 0.6 + 0.4 * Math.abs(Math.sin(x / W * TAU * 4)); c.fillStyle = 'rgb(' + Math.round(150 * sh) + ',' + Math.round(24 * sh) + ',' + Math.round(38 * sh) + ')'; c.fillRect(x, 0, 1, H); }
        c.fillStyle = '#0d0508'; [10, W - 34].forEach(function (x) { c.fillRect(x - 6, 0, 30, H); c.fillStyle = '#f4e3b0'; for (var y = 18; y < H; y += 36) { rr(c, x, y, 18, 18, 4); c.fill(); } c.fillStyle = '#0d0508'; });   // pellicule le long des bords
        c.strokeStyle = '#ffb066'; c.lineWidth = 5; c.strokeRect(46, 14, W - 92, H - 28);
        c.fillStyle = '#ffd9a0'; c.font = '900 64px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', W / 2, H * 0.3); c.fillText('★', W / 2, H * 0.7);
      },
      deco: function (g, w, h) {
        bulbRing(g, w, h, [new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), new THREE.MeshBasicMaterial({ color: 0xffa040 })]);
        var tapis = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, 2.4), new THREE.MeshLambertMaterial({ color: 0x9a1424 })); tapis.rotation.x = -Math.PI / 2; tapis.position.set(0, 0.015, 1.3); g.add(tapis);   // tapis rouge devant la porte
      }
    }
  };
  // les fichiers images des thèmes sont chargés à l'avance
  Object.keys(T).forEach(function (k) { if (T[k].image) loadImg(T[k].image, function () { /* le dessin se refait dans paintDoorSign */ }); });
})();
