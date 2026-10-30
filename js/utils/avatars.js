/* =====================================================================
   avatars.js — Les avatars illustrés des Flambeurs (SVG dessinés à la main, 64 × 64)
   ---------------------------------------------------------------------
   Chaque avatar est lié à l'emoji que les comptes gardent en mémoire (state.avatarEmoji) : rien ne change dans les données, seul l'affichage est un vrai dessin.
   logos.js affiche ces dessins partout à la place de l'emoji (page, étiquettes 3D, chat) ; le profil du téléphone (hud3d.js) en fait une galerie.
   FL_AVATARS.list : [{ id, emoji, name, desc, svg }] · FL_AVATARS.url(emoji) : image « data: » de l'avatar · FL_AVATARS.byEmoji(emoji) : sa fiche.
   ===================================================================== */
(function () {
  'use strict';
  if (window.FL_AVATARS) return;

  // fond arrondi en dégradé + reflet en haut ; inner = le personnage
  function wrap(c1, c2, inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient>' +
      '<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="gold" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></radialGradient>' +
      '<radialGradient id="sk" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffe3c4"/><stop offset="1" stop-color="#e8a877"/></radialGradient></defs>' +
      '<clipPath id="cp"><rect width="64" height="64" rx="15"/></clipPath><rect width="64" height="64" rx="15" fill="url(#bg)"/><g clip-path="url(#cp)">' + inner + '</g>' +
      '<path d="M0 15a15 15 0 0 1 15-15h34a15 15 0 0 1 15 15v8C44 31 20 31 0 23z" fill="url(#gl)"/>' +
      '<rect x=".8" y=".8" width="62.4" height="62.4" rx="14.3" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.6"/></svg>';
  }
  var heart = 'M0 -3C-6 -11 -13 -1 0 9C13 -1 6 -11 0 -3Z';
  var spade = 'M0 -10C-3 -4 -12 -2 -12 4C-12 9 -6 10 -3 7C-3 10 -4 12 -6 14H6C4 12 3 10 3 7C6 10 12 9 12 4C12 -2 3 -4 0 -10Z';
  function eye(x, y) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="3" ry="3.4" fill="#1c1917"/><circle cx="' + (x + 1) + '" cy="' + (y - 1.2) + '" r="1.1" fill="#fff"/>'; }

  var list = [
    { id: 'mask', emoji: '🎭', name: 'Le Masque', desc: 'Le duo de masques du casino : un sourire, une larme.',
      svg: wrap('#7c3aed', '#1e1b4b',
        '<g transform="translate(24 36) rotate(-14)"><path d="M-14 -16H14V2C14 14 6 20 0 20C-6 20 -14 14 -14 2Z" fill="#a78bfa" stroke="#4c1d95" stroke-width="1.6"/><path d="M-9 -5Q-5 -9 -2 -4Q-5 -2 -9 -5ZM9 -5Q5 -9 2 -4Q5 -2 9 -5Z" fill="#2e1065"/><path d="M-6 12Q0 7 6 12" fill="none" stroke="#2e1065" stroke-width="2" stroke-linecap="round"/></g>' +
        '<g transform="translate(39 31) rotate(12)"><path d="M-15 -17H15V2C15 15 6 22 0 22C-6 22 -15 15 -15 2Z" fill="url(#gold)" stroke="#92400e" stroke-width="1.6"/><path d="M-10 -6Q-5 -11 -2 -5Q-6 -2 -10 -6ZM10 -6Q5 -11 2 -5Q6 -2 10 -6Z" fill="#451a03"/><path d="M-8 6Q0 15 8 6" fill="none" stroke="#451a03" stroke-width="2.2" stroke-linecap="round"/><circle cx="-8" cy="3" r="2" fill="#f97316" opacity=".5"/><circle cx="8" cy="3" r="2" fill="#f97316" opacity=".5"/></g>') },
    { id: 'joker', emoji: '🃏', name: 'Le Joker', desc: 'Deux cartes en main, un bluff dans la manche.',
      svg: wrap('#b91c1c', '#1c0a0a',
        '<g transform="translate(24 34) rotate(-16)"><rect x="-13" y="-18" width="26" height="36" rx="4" fill="#fff" stroke="#d6d3d1"/><path d="' + heart + '" transform="scale(.9)" fill="#dc2626"/><text x="-10" y="-8" font-size="8" font-weight="900" fill="#dc2626" font-family="Georgia,serif">A</text></g>' +
        '<g transform="translate(40 31) rotate(14)"><rect x="-13" y="-18" width="26" height="36" rx="4" fill="#fff" stroke="#d6d3d1"/><path d="' + spade + '" transform="scale(.95)" fill="#1c1917"/><text x="-10" y="-8" font-size="8" font-weight="900" fill="#1c1917" font-family="Georgia,serif">A</text></g>') },
    { id: 'cool', emoji: '🕶️', name: 'Le Cool', desc: 'Lunettes noires, sourire en coin : jamais de stress.',
      svg: wrap('#0ea5e9', '#1e3a8a',
        '<path d="M14 62C14 46 22 42 32 42C42 42 50 46 50 62Z" fill="#111827"/><path d="M26 42L32 52L38 42Z" fill="#f8fafc"/>' +
        '<ellipse cx="32" cy="29" rx="15" ry="17" fill="url(#sk)"/><path d="M16 28C14 12 30 8 40 12C50 15 50 24 48 29C46 22 40 18 32 19C24 19 18 22 16 28Z" fill="#1f2937"/>' +
        '<rect x="17.5" y="26" width="13" height="9" rx="3.5" fill="#0b0b0f"/><rect x="33.5" y="26" width="13" height="9" rx="3.5" fill="#0b0b0f"/><rect x="30" y="28.5" width="4" height="2" fill="#0b0b0f"/>' +
        '<path d="M20 28L25 28M36 28L41 28" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/><path d="M26 41Q33 45 40 40" fill="none" stroke="#9a3412" stroke-width="2" stroke-linecap="round"/>') },
    { id: 'lion', emoji: '🦁', name: 'Le Lion', desc: 'Le roi de la table : sa crinière se voit de loin.',
      svg: wrap('#f59e0b', '#7c2d12',
        (function () { var m = ''; for (var i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; m += '<circle cx="' + (32 + Math.cos(a) * 20).toFixed(1) + '" cy="' + (34 + Math.sin(a) * 20).toFixed(1) + '" r="8" fill="#92400e"/>'; } return m; })() +
        '<circle cx="32" cy="34" r="21" fill="#b45309"/><circle cx="19" cy="20" r="5" fill="#fbbf24"/><circle cx="45" cy="20" r="5" fill="#fbbf24"/><circle cx="19" cy="20" r="2.4" fill="#92400e"/><circle cx="45" cy="20" r="2.4" fill="#92400e"/>' +
        '<ellipse cx="32" cy="35" rx="15" ry="15.5" fill="#fcd34d"/><ellipse cx="32" cy="42" rx="8.5" ry="6.5" fill="#fff7ed"/>' + eye(25, 31) + eye(39, 31) +
        '<path d="M28 38H36L32 43Z" fill="#7c2d12"/><path d="M32 43V46M27 47Q32 50 37 47" fill="none" stroke="#7c2d12" stroke-width="1.8" stroke-linecap="round"/>') },
    { id: 'dice', emoji: '🎲', name: 'Les Dés', desc: 'Un double six dans le gobelet, et la chance tourne.',
      svg: wrap('#059669', '#022c22',
        '<g transform="translate(23 37) rotate(-14)"><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fff" stroke="#d1d5db" stroke-width="1.2"/>' + [[-7, -7], [7, -7], [0, 0], [-7, 7], [7, 7]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.8" fill="#111827"/>'; }).join('') + '</g>' +
        '<g transform="translate(43 27) rotate(16)"><rect x="-11" y="-11" width="22" height="22" rx="5" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.2"/>' + [[-5.5, -5.5], [0, 0], [5.5, 5.5]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.3" fill="#fff"/>'; }).join('') + '</g>') },
    { id: 'crown', emoji: '👑', name: 'Couronne d\'Or', desc: 'L\'avatar prestige maximum : un seul roi par table.',
      svg: wrap('#6d28d9', '#1e1b4b',
        '<circle cx="32" cy="34" r="21" fill="#fbbf24" opacity=".12"/><path d="M11 46L8 21L21 31L32 12L43 31L56 21L53 46Z" fill="url(#gold)" stroke="#92400e" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<rect x="11" y="45" width="42" height="8" rx="2.5" fill="url(#gold)" stroke="#92400e" stroke-width="1.6"/><circle cx="21" cy="49" r="2.4" fill="#ef4444"/><circle cx="32" cy="49" r="2.8" fill="#3b82f6"/><circle cx="43" cy="49" r="2.4" fill="#22c55e"/>' +
        '<circle cx="8" cy="20" r="3" fill="#fde68a"/><circle cx="32" cy="11" r="3.2" fill="#fde68a"/><circle cx="56" cy="20" r="3" fill="#fde68a"/><path d="M16 40L22 33" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>') },
    { id: 'chicken', emoji: '🐔', name: 'Poulet Flambeur', desc: 'Le poulet qui a tout perdu… sauf sa bonne humeur.',
      svg: wrap('#fbbf24', '#b91c1c',
        '<circle cx="26" cy="19" r="6" fill="#dc2626"/><circle cx="33" cy="15" r="7" fill="#ef4444"/><circle cx="40" cy="19" r="6" fill="#dc2626"/>' +
        '<ellipse cx="32" cy="36" rx="19" ry="18" fill="#fffbeb" stroke="#fde68a" stroke-width="1.5"/><ellipse cx="19" cy="40" rx="4" ry="3" fill="#fda4af" opacity=".7"/><ellipse cx="45" cy="40" rx="4" ry="3" fill="#fda4af" opacity=".7"/>' +
        eye(24, 32) + eye(40, 32) + '<path d="M26 38H38L32 47Z" fill="#f97316" stroke="#c2410c" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="32" cy="50" rx="3.4" ry="4.6" fill="#dc2626"/>') },
    { id: 'whisky', emoji: '🥃', name: 'Verre de Whisky', desc: 'La classe tranquille au comptoir, glaçons compris.',
      svg: wrap('#92400e', '#1c0f05',
        '<path d="M17 15H47L43 52Q43 54 41 54H23Q21 54 21 52Z" fill="#fff" fill-opacity=".14" stroke="#f5f5f4" stroke-opacity=".7" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<path d="M19 27H45L42 51H22Z" fill="#f59e0b"/><path d="M19 27H45L44.2 33H19.8Z" fill="#fcd34d"/>' +
        '<rect x="23" y="31" width="10" height="10" rx="2" fill="#e0f2fe" fill-opacity=".75" transform="rotate(-12 28 36)"/><rect x="33" y="36" width="9" height="9" rx="2" fill="#e0f2fe" fill-opacity=".6" transform="rotate(14 37 40)"/>' +
        '<path d="M22 18L24.5 48" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/><path d="M26 7Q28 11 26 14M32 5Q34 9 32 12" fill="none" stroke="#fde68a" stroke-opacity=".5" stroke-width="1.8" stroke-linecap="round"/>') },
    { id: 'duck', emoji: '🦆', name: 'Canard VIP', desc: 'Le canard porte-bonheur, couronne sur la tête.',
      svg: wrap('#38bdf8', '#1d4ed8',
        '<path d="M0 50Q10 46 20 50T40 50T64 50V64H0Z" fill="#fff" fill-opacity=".25"/><circle cx="32" cy="35" r="19" fill="#fde047" stroke="#ca8a04" stroke-width="1.4"/><ellipse cx="22" cy="40" rx="4" ry="3" fill="#fb923c" opacity=".35"/><ellipse cx="42" cy="40" rx="4" ry="3" fill="#fb923c" opacity=".35"/>' +
        eye(24, 31) + eye(40, 31) + '<ellipse cx="32" cy="42" rx="11" ry="6.5" fill="#fb923c" stroke="#c2410c" stroke-width="1.2"/><path d="M24 41.5Q32 44 40 41.5" fill="none" stroke="#9a3412" stroke-width="1.4" stroke-linecap="round"/>' +
        '<path d="M22 19L24 9L28 14L32 7L36 14L40 9L42 19Z" fill="url(#gold)" stroke="#92400e" stroke-width="1.2" stroke-linejoin="round"/>') },
    { id: 'boss', emoji: '🎩', name: 'Le Parrain', desc: 'Haut-de-forme, ruban rouge : il ne mise jamais en vain.',
      svg: wrap('#374151', '#0b0b0f',
        '<ellipse cx="32" cy="45" rx="24" ry="6" fill="#030712" stroke="#4b5563" stroke-width="1.2"/><path d="M19 45L21 15Q32 11 43 15L45 45Q32 49 19 45Z" fill="#111827" stroke="#4b5563" stroke-width="1.2"/>' +
        '<path d="M19.6 38L44.4 38L45 45Q32 49 19 45Z" fill="#dc2626"/><path d="M19.6 38Q32 41 44.4 38" fill="none" stroke="#7f1d1d" stroke-width="1.2"/><path d="M25 17L26.5 40" stroke="#fff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round"/>' +
        '<g transform="translate(46 40)"><circle r="3.6" fill="#ef4444"/><circle r="1.6" fill="#fecaca"/></g><path d="M44 8l1.4 3 3 1.4-3 1.4L44 17l-1.4-3.2-3-1.4 3-1.4z" fill="#fde68a"/>') },
    { id: 'fox', emoji: '🦊', name: 'Renard Rusé', desc: 'Le roi du bluff autour de la table.',
      svg: wrap('#fb923c', '#7c2d12',
        '<path d="M32 55L11 37L9 10L26 21H38L55 10L53 37Z" fill="#ea580c" stroke="#9a3412" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 16L22 23L13 30ZM51 16L42 23L51 30Z" fill="#431407"/>' +
        '<path d="M32 55L15 38Q32 33 49 38Z" fill="#fff7ed"/>' +
        '<ellipse cx="23.5" cy="33" rx="3.2" ry="3.8" fill="#1c1917" transform="rotate(14 23.5 33)"/><ellipse cx="40.5" cy="33" rx="3.2" ry="3.8" fill="#1c1917" transform="rotate(-14 40.5 33)"/><circle cx="24.6" cy="31.6" r="1.1" fill="#fff"/><circle cx="41.6" cy="31.6" r="1.1" fill="#fff"/>' +
        '<ellipse cx="32" cy="49" rx="3.6" ry="2.8" fill="#1c1917"/><path d="M32 52V54M28.5 54.5Q32 57 35.5 54.5" fill="none" stroke="#7c2d12" stroke-width="1.4" stroke-linecap="round"/>') }
  ];

  var BY = {};
  list.forEach(function (a) { BY[a.emoji] = a; BY[a.emoji.replace(/️/g, '')] = a; });
  function byEmoji(e) { return BY[e] || BY[String(e || '').replace(/️/g, '')] || null; }
  function url(e) { var a = byEmoji(e); return a ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(a.svg) : ''; }

  var imgs = {};
  // image prête pour dessiner dans un canvas (null tant qu'elle n'est pas chargée)
  function image(e) {
    var a = byEmoji(e); if (!a) return null;
    var im = imgs[a.id];
    if (!im) { im = imgs[a.id] = new Image(); im.src = url(a.emoji); }
    return im.complete && im.naturalWidth ? im : null;
  }
  window.FL_AVATARS = { list: list, byEmoji: byEmoji, url: url, image: image };
  list.forEach(function (a) { image(a.emoji); });                    // préchargés : prêts avant le premier dessin 3D
})();
