/* =====================================================================
   minijeux-regles.js — Les règles de l'UNO et du Puissance 4 (sans aucun dessin, sans réseau)
   ---------------------------------------------------------------------
   Utilisé par uno3d.js (la salle des mini jeux). Ici on ne fait que des calculs sur un « état de table » : un objet simple qui se copie et
   s'envoie tel quel aux autres joueurs. Chaque fonction modifie l'état qu'on lui donne et renvoie '' (tout va bien) ou le texte d'une erreur.
   Une carte UNO est un petit texte : le chiffre de la couleur (0 rouge, 1 jaune, 2 vert, 3 bleu, 4 sans couleur) puis sa valeur
   ('0'..'9', 'S' = passe ton tour, 'R' = changement de sens, 'D' = +2, 'W' = joker, 'F' = +4). Exemple : '17' = 7 jaune, '4F' = +4.
   ===================================================================== */
(function () {
  'use strict';
  var COLOR_NAMES = ['rouge', 'jaune', 'vert', 'bleu'];

  function cc(card) { return +card.charAt(0); }
  function cv(card) { return card.slice(1); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------------------------- UNO ---------------------------------- */
  function unoDeck() {
    var d = [], c, n;
    for (c = 0; c < 4; c++) {
      d.push(c + '0');
      for (n = 1; n <= 9; n++) d.push(c + '' + n, c + '' + n);
      ['S', 'R', 'D'].forEach(function (v) { d.push(c + v, c + v); });
    }
    for (n = 0; n < 4; n++) d.push('4W', '4F');
    return d;
  }
  function unoNew() { return { ver: 0, org: '', ph: 'wait', seats: {}, hands: {}, deck: [], disc: [], turn: -1, dir: 1, col: 0, win: -1, drawn: '', msg: '', said: {}, vuln: -1, pend: 0, pk: '' }; }
  function unoOrder(st) { return Object.keys(st.hands).map(Number).sort(function (a, b) { return a - b; }); }
  function unoNext(st, from, dir) {
    var o = unoOrder(st), i = o.indexOf(from);
    if (i < 0) return o[0];
    return o[(i + (dir || st.dir) + o.length) % o.length];
  }
  function unoCanPlay(st, card) {
    if (st.pend > 0) return cv(card) === (st.pk === 'F' ? 'F' : 'D');            // un +2 / +4 est en attente : on ne peut que l'augmenter (un +4 seulement sur un +4, un +2 seulement sur un +2)
    var top = st.disc[st.disc.length - 1];
    if (!top) return true;
    return cc(card) === 4 || cc(card) === st.col || cv(card) === cv(top);
  }
  function unoDraw(st, n, count) {                         // pioche `count` cartes pour le joueur n (la défausse est remélangée si la pioche est vide)
    var got = [];
    if (st.said) delete st.said[n];                         // une main qui grossit annule un « UNO » déjà dit
    for (var i = 0; i < count; i++) {
      if (!st.deck.length && st.disc.length > 1) { var top = st.disc.pop(); st.deck = shuffle(st.disc); st.disc = [top]; }
      if (!st.deck.length) break;
      var c = st.deck.pop(); st.hands[n].push(c); got.push(c);
    }
    return got;
  }
  function nm(st, n) { return (st.seats[n] && st.seats[n].name) || ('Joueur ' + (n + 1)); }

  function unoStart(st) {
    if (st.ph === 'play') return 'Une partie est déjà en cours : attends sa fin pour jouer.';
    var o = Object.keys(st.seats).map(Number).sort(function (a, b) { return a - b; });
    if (o.length < 2) return 'Il faut au moins 2 joueurs.';
    st.deck = shuffle(unoDeck()); st.disc = []; st.hands = {}; st.win = -1; st.drawn = ''; st.dir = 1; st.said = {}; st.vuln = -1; st.pend = 0; st.pk = '';
    o.forEach(function (n) { st.hands[n] = []; });
    o.forEach(function (n) { unoDraw(st, n, 7); });
    var first, guard = 0;
    do { first = st.deck.pop(); if (cc(first) === 4) { st.deck.unshift(first); first = null; } } while (!first && guard++ < 50);
    st.disc.push(first); st.col = cc(first);
    st.turn = o[(st.starter = ((st.starter | 0) + 1) % o.length)]; st.ph = 'play';
    st.msg = 'La partie commence ! Au tour de ' + nm(st, st.turn) + '.';
    return '';
  }

  // le joueur n pose la carte numéro idx de sa main ; `color` (0-3) est obligatoire pour un joker
  function unoPlay(st, n, idx, color) {
    if (st.ph !== 'play') return 'La partie n\'a pas commencé.';
    if (st.turn !== n) return 'Ce n\'est pas ton tour.';
    var hand = st.hands[n], card = hand && hand[idx];
    if (!card) return 'Carte inconnue.';
    if (st.drawn && card !== st.drawn) return 'Tu peux seulement poser la carte piochée, ou passer.';
    if (!unoCanPlay(st, card)) return st.pend > 0 ? 'Il y a un +' + st.pend + ' en attente : réponds avec un ' + (st.pk === 'F' ? '+4' : '+2') + ' ou pioche ' + st.pend + ' cartes.' : 'Cette carte ne va pas.';
    if (cc(card) === 4 && !(color >= 0 && color <= 3)) return 'Choisis une couleur.';
    st.vuln = -1;                                          // le coup suivant ferme la fenêtre du « Contre UNO »
    hand.splice(idx, 1); st.disc.push(card); st.drawn = '';
    st.col = cc(card) === 4 ? color : cc(card);
    var v = cv(card), who = nm(st, n), txt = who + ' pose ' + cardName(card, st.col) + '.';
    if (!hand.length) { st.ph = 'over'; st.win = n; st.msg = '🏆 ' + who + ' a gagné la partie !'; return ''; }
    var nxt = unoNext(st, n);
    if (v === 'R') {
      st.dir = -st.dir;
      if (unoOrder(st).length === 2) { st.turn = n; txt += ' Sens inversé : ' + who + ' rejoue.'; } else { st.turn = unoNext(st, n); txt += ' Le sens change.'; }
    } else if (v === 'S') { st.turn = unoNext(st, nxt); txt += ' ' + nm(st, nxt) + ' passe son tour.'; }
    else if (v === 'D' || v === 'F') {                     // +2 / +4 : la pénalité s'empile ; le suivant l'augmente avec le même type de carte ou pioche tout d'un coup
      st.pend += v === 'D' ? 2 : 4; st.pk = v; st.turn = nxt;
      txt += ' ' + nm(st, nxt) + ' doit piocher ' + st.pend + ' cartes ou répondre par un ' + (v === 'D' ? '+2' : '+4') + '.';
    }
    else st.turn = nxt;
    if (hand.length === 1) {
      if (st.said && st.said[n]) txt += ' ' + who + ' : UNO !';
      else { st.vuln = n; txt += ' ⚠️ ' + who + " n'a pas dit UNO !"; }          // oublié : n'importe qui peut le contrer
    }
    if (st.said) delete st.said[n];
    st.msg = txt;
    return '';
  }

  // le joueur n pioche une carte : si elle va, il peut la poser (ou passer) ; sinon c'est au suivant
  function unoDrawTurn(st, n) {
    if (st.ph !== 'play') return 'La partie n\'a pas commencé.';
    if (st.turn !== n) return 'Ce n\'est pas ton tour.';
    if (st.drawn) return 'Pose la carte piochée ou passe.';
    st.vuln = -1;
    if (st.pend > 0) {                                    // pénalité de +2 / +4 empilés : on pioche tout et on passe son tour
      var k = st.pend; unoDraw(st, n, k); st.pend = 0; st.pk = ''; st.turn = unoNext(st, n);
      st.msg = nm(st, n) + ' pioche ' + k + ' cartes (pénalité) et passe son tour.'; return '';
    }
    var before = st.hands[n].length, found = '';
    for (var guard = 0; guard < 120 && !found; guard++) { var g = unoDraw(st, n, 1); if (!g.length) break; if (unoCanPlay(st, g[0])) found = g[0]; }     // on pioche jusqu'à avoir une carte jouable
    var cnt = st.hands[n].length - before;
    if (found) { st.drawn = found; st.msg = nm(st, n) + ' a pioché ' + cnt + ' carte' + (cnt > 1 ? 's' : '') + ' pour en avoir une jouable.'; }
    else { st.turn = unoNext(st, n); st.msg = 'Plus de cartes à piocher : ' + nm(st, n) + ' passe.'; }
    return '';
  }
  function unoPass(st, n) {
    if (st.ph !== 'play' || st.turn !== n || !st.drawn) return 'Tu ne peux pas passer maintenant.';
    st.vuln = -1; st.drawn = ''; st.turn = unoNext(st, n); st.msg = nm(st, n) + ' passe son tour.';
    return '';
  }
  // « UNO ! » : à dire quand il ne reste que 2 cartes (avant de poser l'avant-dernière) ; encore possible de justesse s'il vient d'être oublié
  function unoSayUno(st, n) {
    if (st.ph !== 'play' || !st.hands[n]) return 'Tu ne joues pas cette manche.';
    if (st.vuln !== n) {
      if (st.hands[n].length > 2) return 'Tu as encore trop de cartes pour dire UNO.';
      if (st.hands[n].length < 2) return 'Pas besoin de dire UNO maintenant.';
      if (!st.hands[n].some(function (c) { return unoCanPlay(st, c); })) return 'Tu ne peux poser aucune carte : pas de UNO.';
    }
    if (st.vuln === n) { st.vuln = -1; st.msg = '📣 ' + nm(st, n) + ' crie UNO juste à temps !'; return ''; }
    if (st.said && st.said[n]) return 'Tu as déjà dit UNO.';
    st.said = st.said || {}; st.said[n] = true; st.msg = '📣 ' + nm(st, n) + ' : UNO !';
    return '';
  }
  // « Contre UNO ! » : le joueur qui n'a pas dit UNO pioche 2 cartes
  function unoCounter(st, n) {
    if (st.ph !== 'play' || !st.hands[n]) return 'Tu ne joues pas cette manche.';
    var v = st.vuln;
    if (!(v >= 0) || !st.hands[v] || st.hands[v].length !== 1) return 'Trop tard : personne à contrer.';
    if (v === n) return 'Tu ne peux pas te contrer toi-même.';
    unoDraw(st, v, 2); st.vuln = -1;
    st.msg = '⚡ ' + nm(st, n) + ' fait un Contre UNO ! ' + nm(st, v) + ' pioche 2 cartes.';
    return '';
  }
  function unoJoin(st, n, key, name) {
    if (st.seats[n] && st.seats[n].k !== key) return 'Place prise.';
    st.seats[n] = { k: key, name: name };
    return '';
  }
  function unoLeave(st, n) {
    if (!st.seats[n]) return '';
    if (st.vuln === n) st.vuln = -1; if (st.said) delete st.said[n];
    var was = st.turn, nxt = (st.ph === 'play' && st.hands[n]) ? unoNext(st, n) : -1;
    if (st.hands[n]) { st.deck = shuffle(st.deck.concat(st.hands[n])); delete st.hands[n]; }
    delete st.seats[n];
    if (st.ph === 'play') {
      if (unoOrder(st).length < 2) { st.ph = 'wait'; st.hands = {}; st.drawn = ''; st.turn = -1; st.msg = 'Un joueur est parti : la partie s\'arrête.'; }
      else if (was === n) { st.turn = nxt; st.drawn = ''; st.msg = 'Un joueur est parti. Au tour de ' + nm(st, st.turn) + '.'; }
    } else if (st.ph === 'over' && !Object.keys(st.seats).length) { st.ph = 'wait'; st.msg = ''; }
    return '';
  }
  function cardName(card, col) {
    var v = cv(card), c = cc(card);
    if (v === 'W') return 'un joker (' + COLOR_NAMES[col] + ')';
    if (v === 'F') return 'un +4 (' + COLOR_NAMES[col] + ')';
    return (v === 'S' ? 'un « passe »' : v === 'R' ? 'un « sens »' : v === 'D' ? 'un +2' : 'un ' + v) + ' ' + COLOR_NAMES[c];
  }

  /* ------------------------------- PUISSANCE 4 ------------------------------ */
  // grille : st.g[colonne][rangée] avec la rangée 0 en bas ; 0 vide, 1 rouge (place 0), 2 jaune (place 1)
  function c4New() { return { ver: 0, org: '', ph: 'wait', seats: {}, g: [[], [], [], [], [], [], []], turn: 0, win: -1, line: null, starter: 1, msg: '' }; }
  function c4Start(st) {
    if (!st.seats[0] || !st.seats[1]) return 'Il faut 2 joueurs.';
    st.g = [[], [], [], [], [], [], []]; st.win = -1; st.line = null; st.starter = 1 - (st.starter | 0); st.turn = st.starter; st.ph = 'play';
    st.msg = 'La partie commence ! ' + nm(st, st.turn) + ' joue les ' + (st.turn === 0 ? 'rouges' : 'jaunes') + '.';
    return '';
  }
  function c4Line(g, c, r, p) {
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]], d, k, out;
    for (d = 0; d < dirs.length; d++) {
      out = [[c, r]];
      for (k = 1; k < 4; k++) { var x = c + dirs[d][0] * k, y = r + dirs[d][1] * k; if (x < 0 || x > 6 || y < 0 || y > 5 || g[x][y] !== p) break; out.push([x, y]); }
      for (k = 1; k < 4; k++) { var x2 = c - dirs[d][0] * k, y2 = r - dirs[d][1] * k; if (x2 < 0 || x2 > 6 || y2 < 0 || y2 > 5 || g[x2][y2] !== p) break; out.push([x2, y2]); }
      if (out.length >= 4) return out;
    }
    return null;
  }
  function c4Drop(st, seat, col) {
    if (st.ph !== 'play') return 'La partie n\'a pas commencé.';
    if (st.turn !== seat) return 'Ce n\'est pas ton tour.';
    if (!(col >= 0 && col <= 6) || st.g[col].length >= 6) return 'Colonne pleine.';
    var p = seat + 1, r = st.g[col].length; st.g[col].push(p);
    var line = c4Line(st.g, col, r, p);
    if (line) { st.ph = 'over'; st.win = seat; st.line = line; st.msg = '🏆 ' + nm(st, seat) + ' a aligné 4 jetons !'; return ''; }
    if (st.g.every(function (c) { return c.length >= 6; })) { st.ph = 'over'; st.win = 2; st.msg = 'Match nul : la grille est pleine.'; return ''; }
    st.turn = 1 - seat; st.msg = 'Au tour de ' + nm(st, st.turn) + '.';
    return '';
  }
  function c4Join(st, n, key, name) {
    if (st.seats[n] && st.seats[n].k !== key) return 'Place prise.';
    st.seats[n] = { k: key, name: name };
    return '';
  }
  function c4Leave(st, n) {
    if (!st.seats[n]) return '';
    delete st.seats[n];
    if (st.ph === 'play') { st.ph = 'wait'; st.g = [[], [], [], [], [], [], []]; st.msg = 'Ton adversaire est parti : la partie s\'arrête.'; }
    else if (st.ph === 'over' && !Object.keys(st.seats).length) { st.ph = 'wait'; st.g = [[], [], [], [], [], [], []]; st.line = null; st.win = -1; st.msg = ''; }
    return '';
  }

  var API = {
    COLOR_NAMES: COLOR_NAMES, cardColor: cc, cardValue: cv,
    unoNew: unoNew, unoStart: unoStart, unoPlay: unoPlay, unoDrawTurn: unoDrawTurn, unoPass: unoPass, unoJoin: unoJoin, unoLeave: unoLeave, unoSayUno: unoSayUno, unoCounter: unoCounter, unoCanPlay: unoCanPlay, unoDeck: unoDeck, unoOrder: unoOrder,
    c4New: c4New, c4Start: c4Start, c4Drop: c4Drop, c4Join: c4Join, c4Leave: c4Leave
  };
  if (typeof window !== 'undefined') { window.F3D = window.F3D || {}; window.F3D.mj = API; }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
