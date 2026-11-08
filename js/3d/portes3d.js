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
    slotLever: 'M17.5 13h2.1V6.5h1.2v7.9h-3.3z'
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
    hall: function (c, col) { ICONS.bank(c, col); },
    bank: function (c, col) {
      c.fillStyle = col; c.beginPath(); c.moveTo(1.5, 9); c.lineTo(12, 2.5); c.lineTo(22.5, 9); c.closePath(); c.fill();
      [3.6, 8.2, 12.8, 17.4].forEach(function (x) { c.fillRect(x, 10.5, 3, 7.5); }); c.fillRect(2, 19, 20, 2.2); c.fillRect(0.8, 21.4, 22.4, 1.6);
    },
    stairs: function (c, col, bg) {                        // un escalier qui monte
      c.fillStyle = col; c.beginPath(); c.moveTo(2, 21); c.lineTo(2, 17); c.lineTo(7, 17); c.lineTo(7, 12.5); c.lineTo(12, 12.5); c.lineTo(12, 8); c.lineTo(17, 8); c.lineTo(17, 3.5); c.lineTo(22, 3.5); c.lineTo(22, 21); c.closePath(); c.fill();
    },
    music: function (c, col) {                             // une double croche
      c.fillStyle = col; c.beginPath(); c.ellipse(7, 18, 3.4, 2.5, -0.4, 0, TAU); c.fill(); c.beginPath(); c.ellipse(17, 16, 3.4, 2.5, -0.4, 0, TAU); c.fill();
      c.fillRect(9.4, 4, 1.6, 14); c.fillRect(19.4, 2, 1.6, 14); c.beginPath(); c.moveTo(9.4, 4); c.lineTo(21, 2); c.lineTo(21, 5.2); c.lineTo(9.4, 7.2); c.closePath(); c.fill();
    },
    connect4: function (c, col, bg) {                      // grille de Puissance 4 : trous vides et jetons
      c.fillStyle = col; rr(c, 2, 2.5, 20, 19, 3); c.fill();
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { c.fillStyle = bg; c.beginPath(); c.arc(7 + j * 5, 8 + i * 5, 1.9, 0, TAU); c.fill(); }
      c.fillStyle = col; [[7, 18], [12, 18], [12, 13]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 1.2, 0, TAU); c.fill(); });
    },
    ludo: function (c, col, bg) {                          // un dé
      c.fillStyle = col; rr(c, 3, 3, 18, 18, 4); c.fill(); c.fillStyle = bg;
      [[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 1.7, 0, TAU); c.fill(); });
    },
    pmu: function (c, col, bg) {                           // un fer à cheval
      c.strokeStyle = col; c.lineWidth = 3.6; c.lineCap = 'round'; c.beginPath(); c.arc(12, 11.5, 7, Math.PI * 0.8, Math.PI * 0.2, false); c.stroke();
      c.fillStyle = col; [[5.4, 17.2], [18.6, 17.2]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 1.4, 0, TAU); c.fill(); });
    },
    uno: function (c, col, bg) {                           // une carte penchée avec un ovale
      c.save(); c.translate(12, 12); c.rotate(-0.25); c.fillStyle = col; rr(c, -7, -10, 14, 20, 2.4); c.fill(); c.fillStyle = bg; c.beginPath(); c.ellipse(0, 0, 3.6, 7.6, 0.55, 0, TAU); c.fill(); c.restore();
    },
    minijeux: function (c, col, bg) {                      // une carte UNO penchée et quatre jetons de Puissance 4
      c.save(); c.translate(8.5, 11); c.rotate(-0.25); c.fillStyle = col; rr(c, -5.5, -8.5, 11, 17, 2.2); c.fill(); c.fillStyle = bg; c.beginPath(); c.ellipse(0, 0, 2.8, 6.4, 0.55, 0, TAU); c.fill(); c.restore();
      [[16, 14], [20.4, 14], [16, 18.4], [20.4, 18.4]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 1.8, 0, TAU); c.fill(); });
    },
    wolf: function (c, col, bg) {                          // tête de loup de face
      c.fillStyle = col; c.beginPath(); c.moveTo(3.2, 2.6); c.lineTo(8.6, 8); c.lineTo(15.4, 8); c.lineTo(20.8, 2.6); c.lineTo(21.2, 12.5);
      c.quadraticCurveTo(21, 18.2, 12, 22.6); c.quadraticCurveTo(3, 18.2, 2.8, 12.5); c.closePath(); c.fill();
      c.fillStyle = bg; c.beginPath(); c.ellipse(8.6, 12.4, 1.7, 1.2, 0.4, 0, TAU); c.fill(); c.beginPath(); c.ellipse(15.4, 12.4, 1.7, 1.2, -0.4, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(10.4, 17); c.lineTo(13.6, 17); c.lineTo(12, 19.4); c.closePath(); c.fill();
    },
    spy: function (c, col, bg) {                           // une loupe avec un point d'interrogation (on cherche qui se cache)
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(10, 10, 6.8, 0, TAU); c.stroke();
      c.lineWidth = 3.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(15, 15); c.lineTo(21, 21); c.stroke();
      c.fillStyle = col; c.font = '900 10px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 10, 10.6);
    },
    palette: function (c, col, bg) {                       // une palette de peintre
      c.fillStyle = col; c.beginPath(); c.moveTo(12, 2.6); c.bezierCurveTo(18.5, 2.6, 22, 6.6, 22, 11.2); c.bezierCurveTo(22, 15, 19, 15.4, 17, 15.2);
      c.bezierCurveTo(14.6, 15, 14.4, 17.4, 15.8, 18.6); c.bezierCurveTo(17, 20.4, 15, 21.6, 12, 21.6); c.bezierCurveTo(6, 21.6, 2, 17.4, 2, 12); c.bezierCurveTo(2, 6.4, 6.4, 2.6, 12, 2.6); c.closePath(); c.fill();
      c.fillStyle = bg; [[7, 9], [11.4, 6.4], [16.2, 8], [6.6, 14.4]].forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], 1.7, 0, TAU); c.fill(); });
    },
    golf: function (c, col, bg) {                          // un drapeau planté dans un trou, avec la balle
      c.fillStyle = col; c.fillRect(11, 2.4, 1.6, 16); c.beginPath(); c.moveTo(12.6, 2.4); c.lineTo(20.6, 5.8); c.lineTo(12.6, 9.4); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(12, 19.6, 8.6, 2.6, 0, 0, TAU); c.fill(); c.fillStyle = bg; c.beginPath(); c.ellipse(12, 19.6, 3, 1.1, 0, 0, TAU); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(5.4, 16.6, 2, 0, TAU); c.fill();
    },
    tree: function (c, col, bg) {                          // un arbre
      c.fillStyle = col; c.beginPath(); c.arc(12, 9, 6.4, 0, TAU); c.arc(6.6, 12.6, 4.4, 0, TAU); c.arc(17.4, 12.6, 4.4, 0, TAU); c.fill();
      c.fillRect(10.8, 13, 2.4, 8.4); c.fillRect(7.5, 20.2, 9, 1.8);
    },
    bolt: function (c, col, bg) {                          // un éclair (lumière noire)
      c.fillStyle = col; c.beginPath(); c.moveTo(14, 1.8); c.lineTo(4.6, 13.2); c.lineTo(10.8, 13.2); c.lineTo(9, 22.2); c.lineTo(19.4, 9.8); c.lineTo(13, 9.8); c.closePath(); c.fill();
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
      if (th.noLogo) {                                     // enseigne sans logo : nom et sous-titre centrés
        var lb = String(spec.label || '').replace(/^[^\p{L}\p{N}]+/u, '');
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(' + rgb + ',0.7)'; c.shadowBlur = 10; c.fillStyle = '#fff3d6';
        c.font = '800 58px ' + SERIF; c.fillText(lb, W / 2, spec.sub ? H * 0.42 : H / 2, W - 60);
        if (spec.sub) { c.shadowBlur = 0; c.fillStyle = 'rgb(' + rgb + ')'; c.font = '700 26px ' + MONO; c.fillText(spec.sub, W / 2, H * 0.74, W - 60); }
        if (onLoad) onLoad();
        return;
      }
      if (th.image) {                                      // logo rond : photo du serveur
        c.save(); c.beginPath(); if (th.square) rr(c, x, y, S, S, 26); else c.arc(x + S / 2, y + S / 2, S / 2, 0, TAU); c.clip(); c.fillStyle = bg; c.fillRect(x, y, S, S);
        var im = imgs[th.image];
        if (im && im.complete && im.naturalWidth) c.drawImage(im, x, y, S, S);
        else if (ICONS[th.logo]) { c.fillStyle = 'rgba(' + rgb + ',0.2)'; c.fillRect(x, y, S, S); c.save(); c.translate(x + S * 0.17, y + S * 0.17); c.scale(S * 0.66 / 24, S * 0.66 / 24); c.lineCap = 'round'; ICONS[th.logo](c, 'rgb(' + rgb + ')', bg); c.restore(); }   // pas encore d'image : l'icône
        c.restore();
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
    var halo = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    function bulb(x, y) { var m = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8), mats[n++ % mats.length]); m.position.set(x, y, 0.24); g.add(m); var o = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), halo); o.position.copy(m.position); g.add(o); }
    function row(x0, y0, x1, y1) { var len = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.round(len / 0.24)); for (var i = 0; i <= k; i++) bulb(x0 + (x1 - x0) * i / k, y0 + (y1 - y0) * i / k); }
    row(-w / 2 + 0.2, h + 0.1, w / 2 - 0.2, h + 0.1);              // rangée du haut, arrêtée avant les coins
    row(-w / 2 - 0.07, 0.6, -w / 2 - 0.07, h - 0.25);              // côtés : ni au ras du sol ni dans le coin du haut
    row(w / 2 + 0.07, 0.6, w / 2 + 0.07, h - 0.25);
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
    uno: {
      frame: 0xffd400, leaf: 0xd6221e, rgb: '255, 214, 0', logo: 'uno',
      paint: function (c, W, H) {
        c.fillStyle = '#d6221e'; c.fillRect(0, 0, W, H); border(c, W, H, '#ffd400', 8);
        c.save(); c.translate(W / 2, H * 0.5); c.rotate(-0.3); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, W * 0.34, H * 0.28, 0, 0, TAU); c.fill();
        c.fillStyle = '#ffd400'; c.strokeStyle = '#111'; c.lineWidth = 8; c.font = '900 92px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('UNO', 0, 4); c.fillText('UNO', 0, 4); c.restore();
        [['#1f9d4a', 0.14, 0.1], ['#1b63c9', 0.86, 0.1], ['#f2c200', 0.14, 0.9], ['#1f9d4a', 0.86, 0.9]].forEach(function (q) { c.fillStyle = q[0]; rr(c, W * q[1] - 22, H * q[2] - 28, 44, 56, 8); c.fill(); });
      }
    },
    cinemavip: {
      frame: 0xc9a227, leaf: 0x0c1a48, rgb: '255, 215, 120', logo: 'stairs',
      paint: function (c, W, H) {                              // battants bleu nuit et or : grand panneau mouluré avec un escalier doré
        var g0 = c.createLinearGradient(0, 0, 0, H); g0.addColorStop(0, '#13296b'); g0.addColorStop(1, '#091238'); c.fillStyle = g0; c.fillRect(0, 0, W, H);
        border(c, W, H, '#ffd24a', 6); c.strokeStyle = 'rgba(255,210,74,0.45)'; c.lineWidth = 2; c.strokeRect(22, 22, W - 44, H - 44);
        c.save(); c.translate(W / 2, H * 0.5); c.scale(W * 0.5 / 24, W * 0.5 / 24); c.translate(-12, -12); ICONS.stairs(c, '#ffd86b', '#091238'); c.restore();
      }
    },
    music: {
      frame: 0xb98cff, leaf: 0x1a0d33, rgb: '185, 140, 255', logo: 'music',
      paint: function (c, W, H) {                              // violet nuit, portées dorées et notes
        var g0 = c.createLinearGradient(0, 0, 0, H); g0.addColorStop(0, '#2a1652'); g0.addColorStop(1, '#0e0720'); c.fillStyle = g0; c.fillRect(0, 0, W, H);
        border(c, W, H, '#d4af37', 7);
        c.strokeStyle = 'rgba(212,175,55,0.55)'; c.lineWidth = 2;
        for (var st = 0; st < 2; st++) for (var l = 0; l < 5; l++) { var y = H * (0.3 + st * 0.36) + l * 12; c.beginPath(); c.moveTo(24, y); c.lineTo(W - 24, y); c.stroke(); }
        c.save(); c.translate(W / 2, H * 0.5); c.scale(W * 0.42 / 24, W * 0.42 / 24); c.translate(-12, -12); ICONS.music(c, '#f3d98a'); c.restore();
      }
    },
    puissance4: {
      frame: 0x2b6cff, leaf: 0x1646b8, rgb: '110, 160, 255', logo: 'connect4',
      paint: function (c, W, H) {                              // la grille bleue de Puissance 4, jetons rouges et jaunes pris dans les trous
        var g0 = c.createLinearGradient(0, 0, W, H); g0.addColorStop(0, '#2f7bff'); g0.addColorStop(1, '#1246b0'); c.fillStyle = g0; c.fillRect(0, 0, W, H);
        border(c, W, H, '#0b2a78', 10); border(c, W, H, '#9fc0ff', 3);
        var cols = 4, rows = Math.round(cols * (H - 40) / (W - 40)), dx = (W - 40) / cols, dy = (H - 40) / rows, r = Math.min(dx, dy) * 0.38;
        for (var i = 0; i < rows; i++) for (var j = 0; j < cols; j++) {
          var x = 20 + dx * (j + 0.5), y = 20 + dy * (i + 0.5), k = (i * 3 + j * 5) % 7, bottom = i >= rows - 3;
          c.fillStyle = '#0a1a48'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
          if (bottom && k < 5) { c.fillStyle = k % 2 ? '#ffd400' : '#e0232b'; c.beginPath(); c.arc(x, y, r * 0.88, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.stroke(); }
        }
      }
    },
    ludo: {
      frame: 0xffb300, leaf: 0x1d1530, rgb: '255, 190, 60', logo: 'ludo',
      paint: function (c, W, H) {                              // deux petits plateaux de Ludo : quatre bases de couleur et une étoile au centre
        c.fillStyle = '#1d1530'; c.fillRect(0, 0, W, H); border(c, W, H, '#ffb300', 8);
        var S = W - 56, cl = ['#e0232b', '#1f9d4a', '#1b63c9', '#f2c200'];
        [H * 0.04 + 14, H * 0.52 + 6].forEach(function (y0) {
          var x0 = 28, h = S / 2;
          c.fillStyle = '#fff6df'; rr(c, x0 - 6, y0 - 6, S + 12, S + 12, 12); c.fill();
          for (var q = 0; q < 4; q++) {
            var qx = x0 + (q % 2) * h, qy = y0 + (q >> 1) * h; c.fillStyle = cl[q]; c.fillRect(qx + 2, qy + 2, h - 4, h - 4);
            c.fillStyle = '#fff'; c.beginPath(); c.arc(qx + h / 2, qy + h / 2, h * 0.3, 0, TAU); c.fill();
            c.fillStyle = cl[q]; c.beginPath(); c.arc(qx + h / 2, qy + h / 2, h * 0.16, 0, TAU); c.fill();
          }
          c.fillStyle = '#fff6df'; c.beginPath(); for (var k = 0; k < 8; k++) { var a = -Math.PI / 2 + k * Math.PI / 4, rad = k % 2 ? h * 0.17 : h * 0.4; c.lineTo(x0 + h + Math.cos(a) * rad, y0 + h + Math.sin(a) * rad); } c.closePath(); c.fill();
          c.strokeStyle = '#1d1530'; c.lineWidth = 3; c.stroke();
        });
      }
    },
    pmu: {
      frame: 0xd8b04a, leaf: 0x0e4a2a, rgb: '255, 120, 100', logo: 'pmu', image: 'assets/icones/jeux/pmu.png', square: true,
      paint: function (c, W, H) {                              // piste verte, deux panneaux dorés avec un fer à cheval, damier d'arrivée en haut et en bas
        var g0 = c.createLinearGradient(0, 0, 0, H); g0.addColorStop(0, '#12603a'); g0.addColorStop(1, '#0a3a22'); c.fillStyle = g0; c.fillRect(0, 0, W, H);
        noise(c, W, H, 700, 'rgba(255,255,255,0.06)'); border(c, W, H, '#d8b04a', 8);
        var s = 18; for (var i = 0; i < Math.ceil((W - 32) / s); i++) for (var j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#f4f4f4' : '#161616'; c.fillRect(16 + i * s, 16 + j * s, s, s); c.fillRect(16 + i * s, H - 16 - (j + 1) * s, s, s); }
        var pw = W - 56, ph = (H - 150) / 2, px = 28;
        [60, 60 + ph + 30].forEach(function (y, n) {
          c.strokeStyle = '#d8b04a'; c.lineWidth = 4; rr(c, px, y, pw, ph, 10); c.stroke();
          c.fillStyle = 'rgba(0,0,0,0.28)'; rr(c, px + 6, y + 6, pw - 12, ph - 12, 8); c.fill();
          var cx = px + pw / 2, cy = y + ph / 2, r = Math.min(pw, ph) * 0.27;
          c.strokeStyle = '#ffd86b'; c.lineWidth = 11; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 0.22, false); c.stroke();
          c.fillStyle = '#0a3a22'; [-1, 1].forEach(function (sd) { c.beginPath(); c.arc(cx + sd * r * 0.9, cy + r * 0.45, 2.6, 0, TAU); c.fill(); });
        });
      }
    },
    minijeux: {
      frame: 0xc9a227, leaf: 0x120a0e, rgb: '255, 214, 0', logo: 'minijeux',
      paint: function (c, W, H) {                              // porte noire et or : deux grands panneaux moulurés, losange doré au centre (même dessin sur les deux battants)
        var g0 = c.createLinearGradient(0, 0, 0, H); g0.addColorStop(0, '#1b0f15'); g0.addColorStop(1, '#0b0609'); c.fillStyle = g0; c.fillRect(0, 0, W, H);
        border(c, W, H, '#ffd24a', 6); c.strokeStyle = 'rgba(255,210,74,0.45)'; c.lineWidth = 2; c.strokeRect(22, 22, W - 44, H - 44);
        var pw = W - 70, ph = H * 0.36, px = 35, py = [H * 0.07, H * 0.57];
        py.forEach(function (y) {
          c.strokeStyle = '#c9a227'; c.lineWidth = 4; rr(c, px, y, pw, ph, 10); c.stroke();
          c.strokeStyle = 'rgba(255,210,74,0.4)'; c.lineWidth = 2; rr(c, px + 12, y + 12, pw - 24, ph - 24, 6); c.stroke();
          var cx = px + pw / 2, cy = y + ph / 2, d = Math.min(pw, ph) * 0.22;
          c.fillStyle = 'rgba(255,210,74,0.9)'; c.beginPath(); c.moveTo(cx, cy - d); c.lineTo(cx + d, cy); c.lineTo(cx, cy + d); c.lineTo(cx - d, cy); c.closePath(); c.fill();
          c.fillStyle = '#120a0e'; c.beginPath(); c.moveTo(cx, cy - d * 0.5); c.lineTo(cx + d * 0.5, cy); c.lineTo(cx, cy + d * 0.5); c.lineTo(cx - d * 0.5, cy); c.closePath(); c.fill();
        });
      }
    },
    loupgarou: {
      frame: 0x7b6dff, leaf: 0x0b0a18, rgb: '200, 190, 255', logo: 'wolf',
      paint: function (c, W, H) {
        var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05060f'); g.addColorStop(1, '#1c1840'); c.fillStyle = g; c.fillRect(0, 0, W, H); border(c, W, H, '#8b7dff', 7);
        for (var i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.6) + ')'; c.fillRect(20 + Math.random() * (W - 40), 20 + Math.random() * (H * 0.5), 2, 2); }
        var mg = c.createRadialGradient(W / 2, H * 0.34, 10, W / 2, H * 0.34, W * 0.34); mg.addColorStop(0, '#fffbe6'); mg.addColorStop(0.7, '#f4e9b8'); mg.addColorStop(1, 'rgba(244,233,184,0)'); c.fillStyle = mg; c.beginPath(); c.arc(W / 2, H * 0.34, W * 0.34, 0, TAU); c.fill();
        c.fillStyle = '#04040a'; c.save(); c.translate(W / 2, H * 0.78); c.scale(6.2, 6.2); c.translate(-12, -14); ICONS.wolf(c, '#04040a', '#f4e9b8'); c.restore();
      }
    },
    prophunt: {
      frame: 0xb8641e, leaf: 0x4a2c14, rgb: '255, 122, 61', logo: 'spy', image: 'assets/icones/jeux/prop-hunt.png', square: true,
      paint: function (c, W, H) {                              // planches de bois, deux caisses marquées d'un « ? » (les objets où l'on se cache)
        c.fillStyle = '#5a361a'; c.fillRect(0, 0, W, H);
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3; for (var x = 0; x < W; x += 44) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
        noise(c, W, H, 600, 'rgba(0,0,0,0.12)'); border(c, W, H, '#ff9a4d', 8);
        [H * 0.08, H * 0.54].forEach(function (y) {
          var bx = 36, bw = W - 72, bh = H * 0.38;
          c.fillStyle = '#b9803c'; rr(c, bx, y, bw, bh, 8); c.fill(); c.strokeStyle = '#6b4219'; c.lineWidth = 8; rr(c, bx + 4, y + 4, bw - 8, bh - 8, 6); c.stroke();
          c.lineWidth = 6; c.beginPath(); c.moveTo(bx + 8, y + 8); c.lineTo(bx + bw - 8, y + bh - 8); c.moveTo(bx + bw - 8, y + 8); c.lineTo(bx + 8, y + bh - 8); c.stroke();
          c.fillStyle = '#ffe2c2'; c.beginPath(); c.arc(W / 2, y + bh / 2, bw * 0.2, 0, TAU); c.fill();
          c.fillStyle = '#5a2a0a'; c.font = '900 ' + Math.round(bw * 0.3) + 'px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', W / 2, y + bh / 2 + 3);
        });
      },
      deco: function (g, w, h) {                               // des caisses empilées à côté de la porte
        var m = new THREE.MeshStandardMaterial({ color: 0xa8742f, roughness: 0.85 }), band = new THREE.MeshStandardMaterial({ color: 0x5a3514, roughness: 0.9 });
        function crate(x, y, z, s, ry) { var b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m); b.position.set(x, y + s / 2, z); b.rotation.y = ry; g.add(b); var t = new THREE.Mesh(new THREE.BoxGeometry(s * 1.03, s * 0.12, s * 1.03), band); t.position.set(x, y + s * 0.5, z); t.rotation.y = ry; g.add(t); }
        crate(-w / 2 - 0.75, 0, 0.55, 0.6, 0.2); crate(-w / 2 - 0.7, 0.6, 0.5, 0.42, -0.3); crate(w / 2 + 0.7, 0, 0.55, 0.55, -0.15);
      }
    },
    dessin: {
      frame: 0x1c8fb8, leaf: 0xf4f1e8, rgb: '74, 208, 255', logo: 'palette', image: 'assets/icones/jeux/tableau-dessin.png', square: true,
      paint: function (c, W, H) {                              // toile blanche éclaboussée de peinture, trait de pinceau en bas
        c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, W, H); noise(c, W, H, 500, 'rgba(120,110,90,0.10)'); border(c, W, H, '#1c8fb8', 9);
        [['#ff4d6d', 0.3, 0.2, 52], ['#ffd23f', 0.7, 0.3, 44], ['#4ad0ff', 0.45, 0.5, 60], ['#7bd957', 0.75, 0.66, 40], ['#b36bff', 0.28, 0.76, 46]].forEach(function (b) {
          c.fillStyle = b[0]; c.beginPath(); c.arc(W * b[1], H * b[2], b[3], 0, TAU); c.fill();
          for (var i = 0; i < 6; i++) { var a = Math.random() * TAU, d = b[3] * (1.1 + Math.random() * 0.7); c.beginPath(); c.arc(W * b[1] + Math.cos(a) * d, H * b[2] + Math.sin(a) * d, 4 + Math.random() * 6, 0, TAU); c.fill(); }
        });
        c.strokeStyle = '#2b2b2b'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(W * 0.22, H * 0.92); c.bezierCurveTo(W * 0.4, H * 0.82, W * 0.6, H * 0.98, W * 0.8, H * 0.88); c.stroke();
      },
      deco: function (g, w, h) {                               // un chevalet avec une toile, et un pot de peinture au sol
        var wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.8 }), x = w / 2 + 0.8;
        [[-0.3, 0.18], [0.3, 0.18], [0, -0.22]].forEach(function (l, i) { var leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.05), wood); leg.position.set(x + l[0] * 0.8, 0.75, 0.5 + l[1]); leg.rotation.z = i === 2 ? 0 : l[0] * 0.25; leg.rotation.x = i === 2 ? -0.18 : 0.08; g.add(leg); });
        var cv = document.createElement('canvas'); cv.width = 128; cv.height = 160; var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 128, 160);
        cx.fillStyle = '#4ad0ff'; cx.fillRect(0, 100, 128, 60); cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.arc(95, 40, 22, 0, TAU); cx.fill(); cx.fillStyle = '#7bd957'; cx.beginPath(); cx.moveTo(0, 130); cx.lineTo(50, 80); cx.lineTo(100, 130); cx.fill();
        var board = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })); board.position.set(x, 1.05, 0.57); g.add(board);
        var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 14), new THREE.MeshLambertMaterial({ color: 0xff4d6d })); pot.position.set(x - 0.5, 0.08, 0.9); g.add(pot);
      }
    },
    golf: {
      frame: 0x2f9d52, leaf: 0x1f6b3a, rgb: '93, 255, 138', logo: 'golf', image: 'assets/icones/jeux/mini-golf.png', square: true,
      paint: function (c, W, H) {                              // green rayé, trou, drapeau et balle
        c.fillStyle = '#1f7a3f'; c.fillRect(0, 0, W, H);
        for (var y = 0; y < H; y += 56) { c.fillStyle = (y / 56) % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'; c.fillRect(0, y, W, 56); }
        border(c, W, H, '#f4f4f4', 8);
        c.fillStyle = '#0a2a14'; c.beginPath(); c.ellipse(W / 2, H * 0.78, 40, 14, 0, 0, TAU); c.fill();
        c.fillStyle = '#f4f4f4'; c.fillRect(W / 2 - 3, H * 0.2, 6, H * 0.58); c.fillStyle = '#ff4040'; c.beginPath(); c.moveTo(W / 2 + 3, H * 0.2); c.lineTo(W / 2 + 90, H * 0.29); c.lineTo(W / 2 + 3, H * 0.38); c.closePath(); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(W * 0.28, H * 0.88, 14, 0, TAU); c.fill();
      },
      deco: function (g, w, h) {                               // gazon devant la porte et un drapeau à côté
        var t = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, 2.4), new THREE.MeshLambertMaterial({ color: 0x2e8b4a })); t.rotation.x = -Math.PI / 2; t.position.set(0, 0.015, 1.3); g.add(t);
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xf4f4f4 })); pole.position.set(w / 2 + 0.7, 0.8, 0.6); g.add(pole);
        var fl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshBasicMaterial({ color: 0xff4040, side: THREE.DoubleSide })); fl.position.set(w / 2 + 0.9, 1.45, 0.6); g.add(fl);
      }
    },
    golfjardin: {
      frame: 0x8a8a80, leaf: 0x6fc2f0, rgb: '93, 255, 138', logo: 'tree', image: 'assets/icones/jeux/golf-jardin.png', square: true,
      paint: function (c, W, H) {                              // ciel bleu, colline verte et petit moulin
        var sk = c.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, '#5db6ee'); sk.addColorStop(1, '#bfe6fb'); c.fillStyle = sk; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.9)'; [[0.3, 0.14], [0.7, 0.24]].forEach(function (q) { c.beginPath(); c.arc(W * q[0], H * q[1], 22, 0, TAU); c.arc(W * q[0] + 24, H * q[1] + 4, 17, 0, TAU); c.arc(W * q[0] - 24, H * q[1] + 5, 15, 0, TAU); c.fill(); });
        c.fillStyle = '#4fae52'; c.beginPath(); c.moveTo(0, H); c.lineTo(0, H * 0.72); c.quadraticCurveTo(W * 0.5, H * 0.58, W, H * 0.74); c.lineTo(W, H); c.fill();
        var mx = W / 2, my = H * 0.74; c.fillStyle = '#f2ead8'; c.beginPath(); c.moveTo(mx - 28, my); c.lineTo(mx - 18, my - 80); c.lineTo(mx + 18, my - 80); c.lineTo(mx + 28, my); c.closePath(); c.fill();
        c.fillStyle = '#b33a2a'; c.beginPath(); c.moveTo(mx - 24, my - 78); c.lineTo(mx, my - 108); c.lineTo(mx + 24, my - 78); c.closePath(); c.fill();
        c.strokeStyle = '#8a5a2a'; c.lineWidth = 6; c.lineCap = 'round'; for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2 + 0.5; c.beginPath(); c.moveTo(mx, my - 62); c.lineTo(mx + Math.cos(a) * 58, my - 62 + Math.sin(a) * 58); c.stroke(); }
        border(c, W, H, '#8a8a80', 9);
      },
      deco: function (g, w, h) {                               // deux bacs en pierre avec un arbre stylisé
        [-1, 1].forEach(function (sd) {
          var x = sd * (w / 2 + 0.75), stone = new THREE.MeshStandardMaterial({ color: 0x9a9a90, roughness: 0.9 });
          var pot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), stone); pot.position.set(x, 0.2, 0.55); g.add(pot);
          var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0x6b4a2a })); trunk.position.set(x, 0.75, 0.55); g.add(trunk);
          var crown = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshLambertMaterial({ color: 0x3f9d4a })); crown.position.set(x, 1.3, 0.55); g.add(crown);
        });
      }
    },
    golfneon: {
      frame: 0xff3df0, leaf: 0x0a0414, rgb: '255, 61, 240', logo: 'bolt', image: 'assets/icones/jeux/golf-neon.png', square: true,
      paint: function (c, W, H) {                              // lumière noire : anneaux néon et bumpers
        c.fillStyle = '#0a0414'; c.fillRect(0, 0, W, H); border(c, W, H, '#ff3df0', 7);
        c.shadowColor = '#ff3df0'; c.shadowBlur = 18;
        [['#ff3df0', 0.5, 0.26, 62], ['#35e8ff', 0.3, 0.64, 40], ['#a8ff3d', 0.7, 0.68, 40]].forEach(function (b) {
          c.strokeStyle = b[0]; c.lineWidth = 8; c.beginPath(); c.arc(W * b[1], H * b[2], b[3], 0, TAU); c.stroke();
          c.fillStyle = b[0]; c.beginPath(); c.arc(W * b[1], H * b[2], b[3] * 0.32, 0, TAU); c.fill();
        });
        c.strokeStyle = '#35e8ff'; c.lineWidth = 5; c.beginPath(); c.moveTo(W * 0.12, H * 0.92); c.lineTo(W * 0.5, H * 0.84); c.lineTo(W * 0.88, H * 0.92); c.stroke();
        c.shadowBlur = 0;
      },
      deco: function (g, w, h) {                               // tapis sombre bordé de rose et deux tubes néon
        var lis = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.46, 2.52), new THREE.MeshBasicMaterial({ color: 0xff3df0 })); lis.rotation.x = -Math.PI / 2; lis.position.set(0, 0.012, 1.3); g.add(lis);
        var tapis = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, 2.4), new THREE.MeshBasicMaterial({ color: 0x120618 })); tapis.rotation.x = -Math.PI / 2; tapis.position.set(0, 0.015, 1.3); g.add(tapis);
        [[-1, 0x35e8ff], [1, 0xa8ff3d]].forEach(function (s) { var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), new THREE.MeshBasicMaterial({ color: s[1] })); tube.position.set(s[0] * (w / 2 + 0.7), 1.1, 0.4); g.add(tube); });
      }
    },
    cinemapremium: {
      frame: 0xe8c75a, leaf: 0x0b1233, rgb: '255, 215, 120', logo: 'cinema', image: 'assets/icones/services/cinema-premium.png', square: true,   // le logo se dépose dans assets/icones/services/cinema-premium.png (secours : le clap dessiné)
      paint: function (c, W, H) {                              // battant noir-bleu nuit et or : arche à éventail art déco, étoile, panneau « PREMIUM », fines rayures de velours
        c.fillStyle = '#0b1233'; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,215,120,0.05)'; for (var x = 14; x < W; x += 22) c.fillRect(x, 0, 3, H);
        border(c, W, H, '#e8c75a', 8); border(c, W, H, 'rgba(232,199,90,0.5)', 20);
        var px = 38, pw = W - 76, ty = H * 0.08, th2 = H * 0.4, cx = W / 2;
        c.strokeStyle = '#d4af37'; c.lineWidth = 4;                                      // arche du haut
        c.beginPath(); c.moveTo(px, ty + th2); c.lineTo(px, ty + pw / 2); c.arc(cx, ty + pw / 2, pw / 2, Math.PI, 0); c.lineTo(px + pw, ty + th2); c.closePath(); c.stroke();
        c.save(); c.translate(cx, ty + th2 - 8);                                          // éventail art déco
        for (var i = 0; i < 11; i++) { var a = Math.PI + (i + 0.5) / 11 * Math.PI; c.strokeStyle = 'rgba(232,199,90,0.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); c.lineTo(Math.cos(a) * pw * 0.44, Math.sin(a) * pw * 0.44); c.stroke(); }
        c.restore();
        c.fillStyle = '#0b1233'; c.beginPath(); c.arc(cx, ty + th2 * 0.62, W * 0.13, 0, TAU); c.fill(); c.strokeStyle = '#ffd36a'; c.lineWidth = 3; c.stroke();
        c.fillStyle = '#ffd36a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 ' + Math.round(W * 0.17) + 'px ' + SERIF; c.fillText('★', cx, ty + th2 * 0.64);
        var by = H * 0.54, bh = H * 0.38;                                                 // panneau du bas
        c.strokeStyle = '#d4af37'; c.lineWidth = 4; rr(c, px, by, pw, bh, 10); c.stroke();
        c.strokeStyle = 'rgba(232,199,90,0.4)'; c.lineWidth = 2; rr(c, px + 12, by + 12, pw - 24, bh - 24, 6); c.stroke();
        c.fillStyle = '#ffd36a'; c.font = '900 ' + Math.round(W * 0.15) + 'px ' + SERIF; c.fillText('PREMIUM', cx, by + bh * 0.42, pw - 36);
        c.fillStyle = 'rgba(232,199,90,0.7)'; c.fillRect(px + 30, by + bh * 0.62, pw - 60, 2);
        c.fillStyle = '#f4e3b0'; c.font = '700 ' + Math.round(W * 0.08) + 'px ' + SERIF; c.fillText('CINÉMA', cx, by + bh * 0.8, pw - 36);
      },
      deco: function (g, w, h) {
        bulbRing(g, w, h, [new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), new THREE.MeshBasicMaterial({ color: 0xffd36a })]);
        var tapis = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, 2.6), new THREE.MeshLambertMaterial({ color: 0x1c2a6a })); tapis.rotation.x = -Math.PI / 2; tapis.position.set(0, 0.015, 1.4); g.add(tapis);       // tapis bleu nuit bordé d'or
        var lis = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.56, 2.72), new THREE.MeshLambertMaterial({ color: 0xc9a227 })); lis.rotation.x = -Math.PI / 2; lis.position.set(0, 0.012, 1.4); g.add(lis);
        [-1, 1].forEach(function (sd) {                                                   // potelets dorés
          var x = sd * (w / 2 + 0.7), gold = new THREE.MeshStandardMaterial({ color: 0xe8c75a, roughness: 0.3, metalness: 0.7 });
          var base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 16), gold); base.position.set(x, 0.03, 0.8); g.add(base);
          var post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 10), gold); post.position.set(x, 0.55, 0.8); g.add(post);
          var ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), gold); ball.position.set(x, 1.08, 0.8); g.add(ball);
        });
      }
    },
    cinema: {
      frame: 0xc9a227, leaf: 0x8c1a26, rgb: '255, 122, 26', logo: 'cinema', noLogo: true,   // enseigne sans logo, texte centré
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
  // portes de sortie (retour au hall) : une porte élégante par salle, aux couleurs de la salle, avec un tapis et deux lanternes
  function exitTheme(leaf, rgb, accent, carpet, opts) {
    var plain = !!(opts && opts.plain);   // sans logo : texte centré (enseigne et battants)
    return {
      frame: 0xc9a227, leaf: leaf, rgb: rgb, logo: 'hall', noLogo: plain,
      paint: function (c, W, H) {
        var col = '#' + ('000000' + leaf.toString(16)).slice(-6);
        var gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, col); gr.addColorStop(1, '#0c0508'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
        noise(c, W, H, 600, 'rgba(255,255,255,0.04)'); border(c, W, H, '#e6c458', 8); border(c, W, H, 'rgba(230,196,88,0.45)', 22);
        c.strokeStyle = 'rgba(230,196,88,0.7)'; c.lineWidth = 4;                       // panneau en arche
        c.beginPath(); c.moveTo(W * 0.2, H * 0.86); c.lineTo(W * 0.2, H * 0.3); c.arc(W / 2, H * 0.3, W * 0.3, Math.PI, 0); c.lineTo(W * 0.8, H * 0.86); c.closePath(); c.stroke();
        if (!plain) { c.save(); c.translate(W / 2, H * 0.52); c.scale(W / 24 * 0.42, W / 24 * 0.42); c.translate(-12, -12); ICONS.bank(c, accent); c.restore(); }
        c.fillStyle = accent; c.font = '800 ' + Math.round(W * (plain ? 0.2 : 0.15)) + 'px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HALL', W / 2, plain ? H * 0.56 : H * 0.8);
      },
      deco: function (g, w, h) {
        if (!(opts && opts.noRug)) {
          var tapis = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, 2.6), new THREE.MeshLambertMaterial({ color: carpet })); tapis.rotation.x = -Math.PI / 2; tapis.position.set(0, 0.015, 1.4); g.add(tapis);
          var liseré = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.46, 2.72), new THREE.MeshLambertMaterial({ color: 0xc9a227 })); liseré.rotation.x = -Math.PI / 2; liseré.position.set(0, 0.012, 1.4); g.add(liseré);
        }
        if (!(opts && opts.noLamps)) [-1, 1].forEach(function (sd) {                 // lanternes dorées de part et d'autre
          var x = sd * (w / 2 + 0.75), gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.7 });
          var base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 16), gold); base.position.set(x, 0.04, 0.45); g.add(base);
          var post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 10), gold); post.position.set(x, 0.72, 0.45); g.add(post);
          var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe3a0 })); lamp.position.set(x, 1.5, 0.45); g.add(lamp);
          var cap = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.14, 14), gold); cap.position.set(x, 1.7, 0.45); g.add(cap);
        });
      }
    };
  }
  T.exitBlackjack = exitTheme(0x6a0f1c, '255, 138, 138', '#f4e3b0', 0x7a1020);
  T.exitMusique = exitTheme(0x1a0d33, '185, 140, 255', '#f4e8ff', 0x3a1a6a, { noRug: true, noLamps: true });
  T.exitBlindtest = exitTheme(0x1d0f38, '217, 160, 255', '#e6d2ff', 0x3a1a6a);
  T.exitCinemaPremium = exitTheme(0x0c1a48, '255, 215, 120', '#ffe7a8', 0x1c3a8a, { noLamps: true });
  T.exitCrash = exitTheme(0x0d1836, '110, 160, 255', '#cfe0ff', 0x1a3a86);
  T.exitSlots = exitTheme(0x0f3a3c, '255, 224, 138', '#ffe9a8', 0x0c3a3a);
  T.exitShop = exitTheme(0x4a2a12, '255, 210, 74', '#ffe9a8', 0x6b3d1a);
  T.exitUno = exitTheme(0x2a0f1c, '255, 214, 0', '#ffe9a8', 0x7a1020, { noRug: true, noLamps: true });
  T.exitCinema = exitTheme(0x4a0a16, '255, 122, 26', '#ffd9a0', 0x9a1424, { plain: true });
  // les fichiers images des thèmes sont chargés à l'avance
  Object.keys(T).forEach(function (k) { if (T[k].image) loadImg(T[k].image, function () { /* le dessin se refait dans paintDoorSign */ }); });
})();
