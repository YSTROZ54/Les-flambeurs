/* =====================================================================
   logos.js — Les emojis classiques sont remplacés par les logos du site (Font Awesome + dessins maison fl-coin, fl-slot, fl-cards, fl-spade, fl-cups)
   ---------------------------------------------------------------------
   Rien à changer dans les jeux : le remplacement se fait à l'affichage.
   - Page : chaque emoji d'un texte devient <span class="fl-e" data-e="🎲">🎲<i class="fa-solid fa-dice"></i></span>. L'emoji reste dans le texte (invisible) :
     textContent, copier-coller et comparaisons des scripts ne changent pas ; seul le dessin change. Un observateur traite tout ce qui s'affiche après coup
     (notifications, listes, boutique, avatars…).
   - Canvas (étiquettes des joueurs, enseignes de portes, écrans 3D) : fillText dessine le glyphe Font Awesome à la place de l'emoji, dans sa couleur.
   - alert / confirm / prompt, title, placeholder, <option> : pas de logo possible, l'emoji est simplement retiré.
   - Les symboles de cartes ♠ ♥ ♦ ♣ (texte, pas emoji) ne sont pas touchés : les jeux de cartes s'en servent ; seul « ♠️ » en emoji devient le pique du site.
   Ajouter un logo : une ligne dans MAP (« emoji » : [ icône, couleur ]). Une icône « @fl-xxx » est un des dessins maison. Emoji inconnu : étoile.
   ===================================================================== */
(function () {
  'use strict';
  if (window.FL_LOGOS) return;

  var MAP = {
    '❌': ['fa-circle-xmark', '#ef4444'], '✅': ['fa-circle-check', '#22c55e'], '✔': ['fa-check', '#22c55e'], '✓': ['fa-check', '#22c55e'], '✕': ['fa-xmark', '#9ca3af'], '✖': ['fa-xmark', '#9ca3af'],
    '⚠': ['fa-triangle-exclamation', '#f59e0b'], '⛔': ['fa-ban', '#ef4444'], '🚫': ['fa-ban', '#ef4444'], 'ℹ': ['fa-circle-info', '#38bdf8'], '❓': ['fa-circle-question', '#38bdf8'],
    '➕': ['fa-plus', '#22c55e'], '➔': ['fa-arrow-right', '#cbd5e1'], '↩': ['fa-rotate-left', '#cbd5e1'], '🔄': ['fa-rotate', '#38bdf8'], '🌀': ['fa-hurricane', '#38bdf8'],
    '👑': ['fa-crown', '#facc15'], '🪙': ['@fl-coin', ''], '💰': ['fa-sack-dollar', '#facc15'], '💸': ['fa-money-bill-transfer', '#22c55e'], '💎': ['fa-gem', '#22d3ee'],
    '🏆': ['fa-trophy', '#facc15'], '🥇': ['fa-medal', '#facc15'], '🥈': ['fa-medal', '#cbd5e1'], '🥉': ['fa-medal', '#d97706'], '⭐': ['fa-star', '#facc15'], '🌟': ['fa-star', '#facc15'],
    '★': ['fa-star', '#facc15'], '✦': ['fa-star', '#fde68a'], '✨': ['fa-wand-magic-sparkles', '#fde68a'], '🎉': ['fa-champagne-glasses', '#f9a8d4'], '🎁': ['fa-gift', '#f472b6'],
    '🔥': ['fa-fire', '#f97316'], '⚡': ['fa-bolt', '#facc15'], '💥': ['fa-burst', '#f97316'], '☄': ['fa-meteor', '#f97316'], '💣': ['fa-bomb', '#9ca3af'], '🩸': ['fa-droplet', '#ef4444'],
    '⏳': ['fa-hourglass-half', '#fbbf24'], '⏱': ['fa-stopwatch', '#fbbf24'], '⏰': ['fa-clock', '#fbbf24'], '⏸': ['fa-pause', '#cbd5e1'], '⏭': ['fa-forward-step', '#cbd5e1'], '⏯': ['fa-play', '#cbd5e1'],
    '🔒': ['fa-lock', '#fbbf24'], '🔐': ['fa-lock', '#fbbf24'], '🔑': ['fa-key', '#fbbf24'], '🚪': ['fa-door-open', '#d6d3d1'], '🪑': ['fa-chair', '#d6a066'], '🛋': ['fa-couch', '#c08457'],
    '🟢': ['fa-circle', '#22c55e'], '🔴': ['fa-circle', '#ef4444'], '🟡': ['fa-circle', '#facc15'], '🔵': ['fa-circle', '#3b82f6'], '🟠': ['fa-circle', '#f97316'],
    '👤': ['fa-user', '#cbd5e1'], '🧑': ['fa-user', '#cbd5e1'], '👥': ['fa-users', '#93c5fd'], '🤝': ['fa-handshake', '#fbbf24'], '🤖': ['fa-robot', '#94a3b8'], '👍': ['fa-thumbs-up', '#fbbf24'],
    '👋': ['fa-hand', '#fbbf24'], '👉': ['fa-hand-point-right', '#fbbf24'], '👇': ['fa-hand-point-down', '#fbbf24'], '👀': ['fa-eye', '#93c5fd'], '👁': ['fa-eye', '#93c5fd'], '🙈': ['fa-eye-slash', '#9ca3af'],
    '🎰': ['@fl-slot', '#f59e0b'], '🃏': ['@fl-cards', '#f87171'], '♠️': ['@fl-spade', '#e5e7eb'], '🥤': ['@fl-cups', '#38bdf8'], '🎲': ['fa-dice', '#f59e0b'], '🎯': ['fa-bullseye', '#ef4444'],
    '🎟': ['fa-ticket', '#f472b6'], '🎮': ['fa-gamepad', '#a78bfa'], '🏇': ['fa-horse', '#a16207'], '🏁': ['fa-flag-checkered', '#e5e7eb'], '🎬': ['fa-clapperboard', '#fb923c'], '🎵': ['fa-music', '#e879f9'], '♪': ['fa-music', '#e879f9'],
    '🍒': ['fa-apple-whole', '#ef4444'], '🍋': ['fa-lemon', '#fde047'], '🔔': ['fa-bell', '#fbbf24'], '🍀': ['fa-clover', '#22c55e'], '🥃': ['fa-whiskey-glass', '#f59e0b'],
    '🚀': ['fa-rocket', '#38bdf8'], '🪂': ['fa-parachute-box', '#f87171'], '✈': ['fa-plane', '#38bdf8'], '🏎': ['fa-car-side', '#ef4444'], '🪐': ['fa-globe', '#a78bfa'], '🌐': ['fa-globe', '#38bdf8'],
    '☁': ['fa-cloud', '#cbd5e1'], '🌲': ['fa-tree', '#22c55e'], '🌊': ['fa-water', '#38bdf8'], '🔭': ['fa-binoculars', '#94a3b8'], '📡': ['fa-tower-broadcast', '#38bdf8'],
    '🔊': ['fa-volume-high', '#38bdf8'], '🔉': ['fa-volume-low', '#38bdf8'], '🔇': ['fa-volume-xmark', '#9ca3af'], '⚙': ['fa-gear', '#9ca3af'],
    '🛍': ['fa-bag-shopping', '#f472b6'], '🛒': ['fa-cart-shopping', '#f472b6'], '🗑': ['fa-trash', '#9ca3af'], '📋': ['fa-clipboard', '#cbd5e1'], '📨': ['fa-envelope', '#38bdf8'], '📭': ['fa-inbox', '#9ca3af'],
    '📸': ['fa-camera', '#cbd5e1'], '✏': ['fa-pen', '#fbbf24'], '✍': ['fa-pen', '#fbbf24'], '🔤': ['fa-font', '#cbd5e1'], '🎓': ['fa-graduation-cap', '#cbd5e1'], '🧪': ['fa-flask', '#34d399'],
    '🏦': ['fa-building-columns', '#34d399'], '🏛': ['fa-landmark', '#e5e7eb'], '🏢': ['fa-building', '#9ca3af'], '🔮': ['fa-hat-wizard', '#c084fc'], '⚔': ['fa-hand-fist', '#f87171'], '🚶': ['fa-person-walking', '#cbd5e1'],
    '💚': ['fa-heart', '#22c55e'], '🖤': ['fa-heart', '#6b7280'], '💔': ['fa-heart-crack', '#f87171'], '😎': ['fa-face-smile-beam', '#fbbf24'], '😅': ['fa-face-grin-beam-sweat', '#fbbf24'], '😢': ['fa-face-sad-tear', '#60a5fa'],
    // avatars de la boutique et de l'inscription
    '🎭': ['fa-masks-theater', '#c084fc'], '🕶': ['fa-glasses', '#e5e7eb'], '🦁': ['fa-cat', '#fbbf24'], '🦊': ['fa-paw', '#f97316'], '🐺': ['fa-paw', '#9ca3af'], '🦆': ['fa-dove', '#facc15'],
    '🐔': ['fa-kiwi-bird', '#fb923c'], '🦅': ['fa-crow', '#a16207'], '🦇': ['fa-ghost', '#a78bfa'], '🦩': ['fa-feather', '#f472b6'], '🐍': ['fa-staff-snake', '#22c55e'], '🎩': ['fa-user-tie', '#e5e7eb'],
    '🤠': ['fa-hat-cowboy', '#b45309'], '🧞‍♂': ['fa-wand-magic-sparkles', '#a78bfa'], '🧑‍🚀': ['fa-user-astronaut', '#e5e7eb'], '🧑‍🎤': ['fa-microphone-lines', '#e879f9'], '🧶': ['fa-ribbon', '#f472b6']
  };
  // avatars illustrés (avatars.js) : l'emoji de l'avatar devient son dessin
  if (window.FL_AVATARS) FL_AVATARS.list.forEach(function (a) { MAP[a.emoji] = ['svg:' + a.id, '']; });
  // mêmes emojis écrits avec ou sans le sélecteur d'emoji (U+FE0F) : on ignore ce sélecteur, sauf pour « ♠️ »
  var KEY = {};
  Object.keys(MAP).forEach(function (k) { KEY[k] = MAP[k]; if (k.indexOf('️') >= 0 && k !== '♠️') KEY[k.replace(/️/g, '')] = MAP[k]; });

  // emoji = pictogrammes (sans les symboles de cartes ♠♥♦♣ U+2660-2667) ; « ♠️ » avec sélecteur d'emoji est pris à part
  var ONE = '[\\u{1F300}-\\u{1FAFF}\\u2600-\\u265F\\u2668-\\u27BF\\u2B50\\u2B06\\u2B07\\u2B05\\u23E9-\\u23FA\\u2139\\u21A9\\u231A\\u231B]';
  var SRC = '\\u2660\\ufe0f|' + ONE + '(?:\\ufe0f|\\u200d' + ONE + '\\ufe0f?)*';
  var RX_TEST = new RegExp(SRC, 'u'), RX_ALL = new RegExp(SRC, 'gu');

  function lookup(e) { return KEY[e] || KEY[e.replace(/️/g, '')] || ['fa-star', '#fde68a']; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // <i> d'un logo (pour les scripts qui fabriquent du HTML)
  function iconHtml(e) {
    var d = lookup(e);
    if (d[0].indexOf('svg:') === 0) return '<i class="fl-avi" style="background-image:url(&quot;' + FL_AVATARS.url(e) + '&quot;)"></i>';
    if (d[0].charAt(0) === '@') return '<i class="' + d[0].slice(1) + '"' + (d[1] ? ' style="color:' + d[1] + '"' : '') + '></i>';
    return '<i class="fa-solid ' + d[0] + '"></i>';
  }
  function makeSpan(e) {
    var d = lookup(e), s = document.createElement('span');
    s.className = 'fl-e'; s.setAttribute('data-e', e); if (d[1]) s.style.setProperty('--c', d[1]);
    s.appendChild(document.createTextNode(e));
    var ic = document.createElement('i');
    if (d[0].indexOf('svg:') === 0) { ic.className = 'fl-avi'; ic.style.backgroundImage = 'url("' + FL_AVATARS.url(e) + '")'; }
    else if (d[0].charAt(0) === '@') ic.className = d[0].slice(1); else ic.className = 'fa-solid ' + d[0];
    s.appendChild(ic);
    return s;
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, NOSCRIPT: 1, TITLE: 1, CANVAS: 1 };
  function wrapText(node) {
    var t = node.nodeValue;
    if (!t || !RX_TEST.test(t)) return;
    var p = node.parentNode;
    if (!p || SKIP[p.nodeName] || (p.closest && (p.closest('.fl-e') || p.closest('svg') || p.closest('[data-emoji-keep]')))) return;
    var frag = document.createDocumentFragment(), last = 0, m;
    RX_ALL.lastIndex = 0;
    while ((m = RX_ALL.exec(t))) {
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      frag.appendChild(makeSpan(m[0]));
      last = m.index + m[0].length;
    }
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    p.replaceChild(frag, node);
  }
  function strip(s) { return String(s).replace(RX_ALL, '').replace(/^\s+/, '').replace(/ {2,}/g, ' '); }
  function stripAttrs(el) {
    ['title', 'placeholder', 'aria-label', 'alt'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      if (v && RX_TEST.test(v)) el.setAttribute(a, strip(v));
    });
    if (el.nodeName === 'OPTION' && RX_TEST.test(el.textContent)) el.textContent = strip(el.textContent);
  }
  function scan(n) {
    if (n.nodeType === 3) { wrapText(n); return; }
    if (n.nodeType !== 1 || SKIP[n.nodeName]) return;
    if (n.closest && n.closest('.fl-e')) return;
    var tw = document.createTreeWalker(n, 4 | 1, {
      acceptNode: function (x) { return x.nodeType === 1 && SKIP[x.nodeName] && x.nodeName !== 'OPTION' ? 2 : 1; }
    }), cur, texts = [];
    stripAttrs(n);
    while ((cur = tw.nextNode())) { if (cur.nodeType === 3) texts.push(cur); else stripAttrs(cur); }
    texts.forEach(wrapText);
  }

  var pend = new Set(), raf = 0;
  function flush() {
    raf = 0;
    var list = Array.from(pend); pend.clear();
    list.forEach(function (n) { if (n.isConnected) scan(n); });
  }
  function queue(n) { pend.add(n); if (!raf) raf = requestAnimationFrame(flush); }
  var mo = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'childList') m.addedNodes.forEach(function (n) { if (n.nodeType === 3 || n.nodeType === 1) queue(n); });
      else if (m.type === 'characterData') queue(m.target);
    });
  });
  function start() {
    scan(document.body);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // alert / confirm / prompt : du texte brut, on retire les emojis
  ['alert', 'confirm', 'prompt'].forEach(function (fn) {
    var o = window[fn];
    window[fn] = function (msg, def) { return o.call(window, strip(msg), def); };
  });

  /* ---------- canvas : le glyphe Font Awesome à la place de l'emoji ---------- */
  var probe = null, codes = {};
  function glyphOf(cls) {
    if (codes[cls]) return codes[cls];
    if (!document.body) return '';
    if (!probe) { probe = document.createElement('i'); probe.style.cssText = 'position:absolute;left:-99px;top:-99px;visibility:hidden'; document.body.appendChild(probe); }
    probe.className = 'fa-solid ' + cls;
    var c = '';
    try { c = getComputedStyle(probe, '::before').content; } catch (e) { /* ok */ }
    c = String(c || '').replace(/^["']|["']$/g, '');
    if (c && c !== 'none' && c !== 'normal') codes[cls] = c;
    return c;
  }
  // icônes maison (@fl-xxx) sans glyphe : on prend une icône voisine dans les canvas
  var CANVAS_ALT = { 'fl-coin': ['fa-coins', '#fbbf24'], 'fl-slot': ['fa-dice', '#f59e0b'], 'fl-cards': ['fa-clone', '#f87171'], 'fl-spade': ['fa-star', '#e5e7eb'], 'fl-cups': ['fa-glass-water', '#38bdf8'] };
  function canvasIcon(e) {
    var d = lookup(e), cls = d[0], col = d[1];
    if (cls.indexOf('svg:') === 0) { var im = FL_AVATARS.image(e); if (im) return { img: im }; cls = 'fa-user'; col = '#fde68a'; }
    if (cls.charAt(0) === '@') { var a = CANVAS_ALT[cls.slice(1)]; cls = a[0]; col = col || a[1]; }
    return { g: glyphOf(cls), col: col };
  }
  if (window.CanvasRenderingContext2D) {
    var ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxW) {
      var s = String(text);
      if (!RX_TEST.test(s)) return ft.call(this, text, x, y, maxW);
      var parts = [], last = 0, m, self = this, font = this.font, fill = this.fillStyle, al = this.textAlign;
      var px = /(\d+(?:\.\d+)?)px/.exec(font), size = px ? parseFloat(px[1]) : 16, fa = '900 ' + size * 0.92 + 'px "Font Awesome 6 Free"';
      RX_ALL.lastIndex = 0;
      while ((m = RX_ALL.exec(s))) {
        if (m.index > last) parts.push({ t: s.slice(last, m.index) });
        parts.push({ e: m[0] });
        last = m.index + m[0].length;
      }
      if (last < s.length) parts.push({ t: s.slice(last) });
      var total = 0;
      parts.forEach(function (p) {
        if (p.e) { var ic = canvasIcon(p.e); p.g = ic.g; p.col = ic.col; p.img = ic.img; p.w = size * 1.1; }
        else p.w = self.measureText(p.t).width;
        total += p.w;
      });
      this.save();
      this.textAlign = 'left';
      var cx = al === 'center' ? x - total / 2 : (al === 'right' || al === 'end') ? x - total : x;
      if (maxW && total > maxW) { var f = maxW / total; this.translate(x, 0); this.scale(f, 1); this.translate(-x, 0); }
      parts.forEach(function (p) {
        if (p.e) {
          if (p.img) {                                                 // avatar illustré : on pose l'image sur la ligne de texte
            var bl = self.textBaseline, top = bl === 'middle' ? y - size * 0.55 : bl === 'top' ? y : bl === 'bottom' ? y - size * 1.1 : y - size * 0.9;
            self.drawImage(p.img, cx, top, size * 1.1, size * 1.1);
          } else if (p.g) { self.font = fa; self.fillStyle = p.col || fill; ft.call(self, p.g, cx + size * 0.05, y); self.font = font; self.fillStyle = fill; }
        } else ft.call(self, p.t, cx, y);
        cx += p.w;
      });
      this.restore();
    };
    if (document.fonts && document.fonts.load) document.fonts.load('900 16px "Font Awesome 6 Free"').catch(function () { /* ok */ });
  }

  window.FL_LOGOS = { icon: iconHtml, strip: strip, scan: scan, map: MAP };
})();
