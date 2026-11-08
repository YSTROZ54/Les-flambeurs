/* =====================================================================
   emotes3d.js — Danses et emotes des Flambeurs (monde 3D, PC)
   ---------------------------------------------------------------------
   Le catalogue (F.DANCES, F.EMOTES) et la façon dont le petit personnage bouge pour chacune.
   Une danse tourne en boucle jusqu'à ce que le joueur marche ou la relance ; une emote dure quelques secondes.
   Une pose est une fonction du temps : elle renvoie des angles (en radians) que F3D.createPerson applique.
     y : saut (m) · yaw : tour sur soi-même · lx : tout le corps penché en avant · lz : penché de côté
     ux uy uz : haut du corps (penché en avant, tourné, penché de côté) — pivot aux hanches, les jambes restent en place
     nx ny nz : tête (hoche, tourne, penche)
     h0 h1 : cuisses (+ = vers l'arrière) · k0 k1 : genoux (pliés) · hz0 hz1 : jambes écartées (négatif : croisées)
     a0 a1 : bras [écart sur le côté, élan vers l'avant, rentré vers le centre] (0 = bras droit du personnage, 1 = bras gauche)
     (écart ≈ 1,57 : bras à l'horizontale ; ≈ 3,1 : bras tendu au-dessus de la tête)
     e0 e1 : coudes [plié vers l'avant, replié dans le plan du corps : vers la tête quand le bras est levé]
   Les danses sont réglées sur un tempo (bpm) : des poses clés, une par temps, enchaînées sèchement ou en douceur (seq),
   plus un rebond des genoux sur le temps (squat : les pieds restent posés au sol).
   Les deux joueurs voient la même chose : seul l'identifiant circule sur le canal temps réel (world3d.js).
   La roue (hud3d.js) a 8 cases : 8 danses au plus.
   Fichiers liés : f3d-core.js (applique la pose), world3d.js (caméra, réseau), hud3d.js (roue et téléphone).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D = window.F3D || {};
  var S = Math.sin, C = Math.cos, PI = Math.PI, TAU = PI * 2, Z = [0, 0, 0];

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  // cloche : 0 au début et à la fin, 1 au milieu
  function bell(t, dur) { return ease(t / 0.35) * ease((dur - t) / 0.35); }
  // saut parabolique : u va de 0 à 1 pour un saut complet
  function hop(u) { u = u - Math.floor(u); return 4 * u * (1 - u); }
  function pos(v) { return v > 0 ? v : 0; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  // mélange de deux poses (k = 0 : p, 1 : q)
  function mix(p, q, k) {
    var o = {}, key;
    for (key in p) o[key] = p[key];
    for (key in q) o[key] = q[key];
    for (key in o) {
      var a = p[key], b = q[key];
      if (Array.isArray(o[key])) { a = a || Z; b = b || Z; o[key] = [lerp(a[0] || 0, b[0] || 0, k), lerp(a[1] || 0, b[1] || 0, k), lerp(a[2] || 0, b[2] || 0, k)]; }
      else o[key] = lerp(a || 0, b || 0, k);
    }
    return o;
  }
  // somme de deux poses (une base + un rebond, une variation…)
  function add(p, q) {
    var o = {}, key;
    for (key in p) o[key] = p[key];
    for (key in q) {
      if (Array.isArray(q[key])) { var a = o[key] || Z; o[key] = [(a[0] || 0) + (q[key][0] || 0), (a[1] || 0) + (q[key][1] || 0), (a[2] || 0) + (q[key][2] || 0)]; }
      else o[key] = (o[key] || 0) + q[key];
    }
    return o;
  }
  // genoux pliés de x, pieds à plat au sol (le corps descend d'autant)
  function squat(x) { return { h0: -x, h1: -x, k0: 2 * x, k1: 2 * x, y: -0.92 * (1 - C(x)) }; }
  // poses clés, une par temps : à chaque temps on passe à la suivante en « snap » fraction de temps (0,15 : sec ; 1 : fluide)
  function seq(b, frames, snap) {
    var n = frames.length, i = Math.floor(b), f = b - i, cur = ((i % n) + n) % n;
    return mix(frames[(cur + n - 1) % n], frames[cur], ease(f / (snap || 0.3)));
  }
  // rebond sur le temps : 1 pile sur le temps, 0 entre deux
  function onBeat(b, sharp) { return Math.pow(0.5 + 0.5 * C(TAU * b), sharp || 2); }

  var DANCES = [
    /* ---- Shuffle (running man) : un genou monte pendant que l'autre pied glisse en arrière, bras qui pompent ; mains en l'air toutes les 4 mesures ---- */
    {
      id: 'shuffle', name: 'Shuffle', icon: 'fa-shoe-prints', color: '56,189,248',
      pose: function (t) {
        var b = t * 128 / 60, s = S(PI * b), up = pos(s), dn = pos(-s), m = b % 16;
        var p = add(squat(0.18 + 0.1 * onBeat(b)), {
          y: 0.07 * Math.abs(s), ux: 0.16, uy: 0.18 * s, nx: 0.12 * onBeat(b, 4),
          h0: -1.0 * up + 0.38 * dn + 0.18, h1: -1.0 * dn + 0.38 * up + 0.18, k0: 1.3 * up + 0.2 * dn - 0.36, k1: 1.3 * dn + 0.2 * up - 0.36,
          a0: [0.25, -0.75 * s + 0.35, 0.1], a1: [0.25, 0.75 * s + 0.35, 0.1], e0: [1.55, 0], e1: [1.55, 0]
        });
        var hands = ease((m - 12) / 0.5) * ease((16 - m) / 0.5);           // « hands up » sur la fin de la phrase
        if (hands > 0) p = mix(p, add(p, { a0: [2.4 - p.a0[0], -p.a0[1] + 0.2 * s, 0], a1: [2.4 - p.a1[0], -p.a1[1] - 0.2 * s, 0], e0: [-1.4, 0.3 * up], e1: [-1.4, 0.3 * dn], ux: -0.1 }), hands);
        return p;
      }
    },
    /* ---- Gangnam Style : le cheval (petits sauts d'un pied sur l'autre, poignets croisés devant), puis le lasso au-dessus de la tête ---- */
    {
      id: 'gangnam', name: 'Gangnam Style', icon: 'fa-horse-head', color: '250,204,21',
      pose: function (t) {
        var b = t * 132 / 60, s = S(PI * b), m = b % 16, beat = onBeat(b, 3);
        var horse = add(squat(0.3), {
          y: 0.09 * hop(b), hz0: 0.16, hz1: 0.16, ux: 0.12, uz: 0.07 * s, nx: 0.15 * beat,
          h0: -0.45 * pos(s), h1: -0.45 * pos(-s), k0: 0.8 * pos(s), k1: 0.8 * pos(-s),
          a0: [0.15, 0.95 + 0.15 * beat, 0.55], a1: [0.15, 0.95 + 0.15 * beat, 0.55], e0: [1.25, 0], e1: [1.25, 0]
        });
        var lasso = add(squat(0.22 + 0.1 * beat), {
          y: 0.04 * hop(b), hz0: 0.22 * pos(s), hz1: 0.22 * pos(-s), uz: -0.1, ny: 0.3 * S(PI * b * 0.5),
          a0: [2.75, 0.35 * S(TAU * b), 0.4 * C(TAU * b)], e0: [0.2, 0.35], a1: [0.25, 0.9, 0.45], e1: [1.3, 0]
        });
        return mix(horse, lasso, ease((m - 8) / 0.4) * ease((16 - m) / 0.4));
      }
    },
    /* ---- Floss : hanches d'un côté, bras tendus de l'autre, un devant un derrière, qui changent à chaque temps ---- */
    {
      id: 'floss', name: 'Floss', icon: 'fa-bolt', color: '251,146,60',
      pose: function (t) {
        var b = t * 150 / 60, x = S(PI * b), xs = (x < 0 ? -1 : 1) * Math.pow(Math.abs(x), 0.6);
        return add(squat(0.12), {
          lz: -0.07 * xs, uz: 0.16 * xs, uy: -0.12 * xs, nz: -0.08 * xs, y: 0.02 * Math.abs(xs),
          a0: [0.25 + 0.4 * pos(xs) - 0.55 * pos(-xs), -0.55 * xs, 0], a1: [0.25 + 0.4 * pos(-xs) - 0.55 * pos(xs), 0.55 * xs, 0],
          hz0: 0.08 * xs, hz1: -0.08 * xs
        });
      }
    },
    /* ---- YMCA : les quatre lettres avec les bras (Y, M, C, A), puis quatre temps à taper dans les mains au-dessus de la tête ---- */
    {
      id: 'ymca', name: 'YMCA', icon: 'fa-y', color: '167,139,250',
      pose: function (t) {
        var b = t * 126 / 60, m = b % 8, s = S(PI * b);
        var Y = { a0: [2.55, 0, 0], a1: [2.55, 0, 0], nx: -0.15 },
          M = { a0: [2.25, 0.1, 0], a1: [2.25, 0.1, 0], e0: [0, 1.75], e1: [0, 1.75], nx: 0.1 },
          Cl = { a0: [2.45, 0, 0], e0: [0, 0.95], a1: [0.75, 0, 0], e1: [0, -1.1], uz: -0.22, lz: 0.05, ny: -0.2 },
          A = { a0: [2.8, 0, 0], a1: [2.8, 0, 0], e0: [0, 0.45], e1: [0, 0.45], nx: -0.2 },
          clap = { a0: [2.5, 0.25, 0], a1: [2.5, 0.25, 0], e0: [0, 0.55], e1: [0, 0.55] };
        var arms = m < 4 ? seq(b, [Y, M, Cl, A, Y, M, Cl, A], 0.18) : mix(clap, { a0: [2.6, 0.2, 0], a1: [2.6, 0.2, 0], e0: [0, 0.95], e1: [0, 0.95] }, onBeat(b, 4));
        if (m >= 4 && m < 4.2) arms = mix(A, arms, ease((m - 4) / 0.2));
        return add(add(squat(0.08 + 0.17 * onBeat(b, 3)), arms), { hz0: m >= 4 ? 0.18 * pos(s) : 0.12, hz1: m >= 4 ? 0.18 * pos(-s) : 0.12, uz: m >= 4 ? 0.08 * s : 0, y: m < 4 ? 0.05 * hop(b) : 0 });
      }
    },
    /* ---- Macarena : les huit gestes des bras (un par temps), roulement des hanches, petit saut avec quart de tour ---- */
    {
      id: 'macarena', name: 'Macarena', icon: 'fa-music', color: '244,114,182',
      pose: function (t) {
        var b = t * 104 / 60, turn = Math.floor(b / 16), m = b - turn * 16;
        var OUT = { a: [0.05, 1.55, 0.05], e: [0, 0] }, UP = { a: [0.2, 1.45, 0.1], e: [0.3, 0] }, SH = { a: [0.0, 1.3, 0.9], e: [2.0, 0] },
          HEAD = { a: [2.3, 0.45, 0], e: [0, 1.85] }, HIP = { a: [-0.2, 0.35, 0.35], e: [1.25, 0] }, BACK = { a: [0.3, -0.5, 0], e: [0.3, 0] }, REST = { a: [0, 0, 0], e: [0, 0] };
        var R = [OUT, UP, SH, HEAD, HIP, BACK], seqR = [], seqL = [];
        for (var i = 0; i < 16; i++) { var mv = Math.min(5, Math.floor(i / 2)); seqR.push(i < 12 ? R[mv] : BACK); seqL.push(i < 12 ? R[Math.max(0, Math.min(5, Math.floor((i - 1) / 2)))] : BACK); }
        seqL[0] = BACK;
        function arm(list) { var j = Math.floor(m), f = ease((m - j) / 0.3), a = list[(j + 15) % 16], c = list[j]; return { a: [lerp(a.a[0], c.a[0], f), lerp(a.a[1], c.a[1], f), lerp(a.a[2], c.a[2], f)], e: [lerp(a.e[0], c.e[0], f), lerp(a.e[1], c.e[1], f)] }; }
        var r = arm(seqR), l = arm(seqL), roll = m >= 12 && m < 15 ? ease((m - 12) / 0.3) * ease((15 - m) / 0.3) : 0, jump = m >= 15 ? m - 15 : 0;
        var p = add(squat(0.1 + 0.08 * onBeat(b, 3) + 0.1 * roll), {
          a0: r.a, e0: [r.e[0], r.e[1]], a1: l.a, e1: [l.e[0], l.e[1]],
          lz: 0.09 * roll * S(TAU * b * 0.5), lx: 0.05 * roll * C(TAU * b * 0.5), uz: -0.1 * roll * S(TAU * b * 0.5), nz: 0.05 * S(PI * b),
          y: jump ? 0.28 * hop(jump) : 0, yaw: (turn + ease(jump)) * PI / 2
        });
        if (jump) { var cr = 1 - hop(jump); p = add(p, { h0: -0.3 * cr, h1: -0.3 * cr, k0: 0.6 * cr, k1: 0.6 * cr }); }
        return p;
      }
    },
    /* ---- Griddy : talons qui tapent devant à tour de rôle, buste penché, bras qui balancent ; les « lunettes » avec les mains en fin de phrase ---- */
    {
      id: 'griddy', name: 'Griddy', icon: 'fa-glasses', color: '52,211,153',
      pose: function (t) {
        var b = t * 112 / 60, s = S(PI * b), m = b % 8, a = pos(s), c = pos(-s);
        var p = add(squat(0.22), {
          y: 0.06 * Math.abs(s), ux: 0.3, uy: 0.15 * s, nx: -0.15,
          h0: -0.42 * a + 0.3 * c, h1: -0.42 * c + 0.3 * a, k0: -0.3 * a + 0.75 * c, k1: -0.3 * c + 0.75 * a,
          a0: [0.25, 1.05 * s, 0], a1: [0.25, -1.05 * s, 0], e0: [0.55 + 0.6 * a, 0], e1: [0.55 + 0.6 * c, 0]
        });
        var gog = ease((m - 6) / 0.25) * ease((8 - m) / 0.25);
        if (gog > 0) p = mix(p, add(squat(0.25), { ux: 0.15, nx: 0.1 * onBeat(b, 4), a0: [0.35, 1.3, 0.8], a1: [0.35, 1.3, 0.8], e0: [2.45, 0], e1: [2.45, 0], h0: -0.3 * a, h1: -0.3 * c, k0: 0.4 * a, k1: 0.4 * c }), gog);
        return p;
      }
    },
    /* ---- Robot : poses raides, coudes à angle droit, coups de tête secs ; on passe de l'une à l'autre d'un coup ---- */
    {
      id: 'robot', name: 'Robot', icon: 'fa-robot', color: '148,163,184',
      pose: function (t) {
        var b = t * 100 / 60, P = [
          { a0: [1.57, 0, 0], e0: [0, 1.57], a1: [0, 0, 0], e1: [1.57, 0], uy: 0.4, ny: -0.35 },
          { a0: [0, 0, 0], e0: [1.57, 0], a1: [1.57, 0, 0], e1: [0, 1.57], uy: -0.4, ny: 0.35 },
          { a0: [0, 1.57, 0], a1: [0, 1.57, 0], nx: 0.25, h0: -0.25, h1: -0.25, k0: 0.5, k1: 0.5, y: -0.03 },
          { a0: [1.57, 0, 0], e0: [0, -1.4], a1: [1.57, 0, 0], e1: [0, 1.57], uz: 0.12, nz: -0.25 },
          { a0: [1.57, 0, 0], e0: [0, 1.57], a1: [1.57, 0, 0], e1: [0, -1.4], uz: -0.12, nz: 0.25 },
          { a0: [0, 0.6, 0.2], e0: [1.0, 0], a1: [0, 0.6, 0.2], e1: [1.0, 0], ny: 0.5, uy: 0.15 },
          { a0: [1.57, 0, 0], e0: [0, 1.57], a1: [1.57, 0, 0], e1: [0, 1.57], nx: -0.2 },
          { a0: [0.2, 0, 0], e0: [1.57, 0], a1: [0.2, 0, 0], e1: [1.57, 0], ny: -0.5, uy: -0.15 }
        ];
        var p = seq(b, P, 0.12), f = b - Math.floor(b), pop = f < 0.12 ? S(f / 0.12 * PI) * 0.02 : 0;     // petit « pop » à chaque changement
        return add(p, { y: pop });
      }
    },
    /* ---- Breakdance : toprock (pas croisés, bras qui s'ouvrent), puis on plonge sur la tête et on tourne (headspin), jambes en V ---- */
    {
      id: 'breakdance', name: 'Breakdance', icon: 'fa-arrows-spin', color: '239,68,68',
      pose: function (t) {
        var b = t * 116 / 60, L = 16, cyc = Math.floor(b / L), m = b - cyc * L, s = S(PI * b), SPIN = 9, spinLen = 8 * 60 / 116;
        var spun = Math.max(0, Math.min(spinLen, (m - 7) * 60 / 116));
        var yaw = (cyc * spinLen + spun) * SPIN;
        var top = add(squat(0.2 + 0.1 * onBeat(b)), {
          hz0: -0.25 * pos(s) + 0.1, hz1: -0.25 * pos(-s) + 0.1, h0: -0.5 * pos(s), h1: -0.5 * pos(-s), k0: 0.6 * pos(s), k1: 0.6 * pos(-s),
          uy: 0.3 * s, ux: 0.12, nx: 0.12 * onBeat(b, 3),
          a0: [1.1 + 0.5 * C(PI * b), 0.5, 0.2], a1: [1.1 - 0.5 * C(PI * b), 0.5, 0.2], e0: [0.9, 0], e1: [0.9, 0]
        });
        var sc = S(t * 7);
        var spin = { lx: PI, y: 1.93, hz0: 0.65, hz1: 0.65, h0: 0.25 * sc, h1: -0.25 * sc, k0: 0.1, k1: 0.1, a0: [2.45, 0.45, 0], a1: [2.45, 0.45, 0], e0: [0.6, 0], e1: [0.6, 0] };
        var down = m < 6 ? 0 : m < 7 ? ease(m - 6) : m < 15 ? 1 : 1 - ease(m - 15);
        var p = mix(top, spin, down);
        p.yaw = yaw + (1 - down) * 0.15 * s;
        return p;
      }
    }
  ];

  var EMOTES = [
    {
      id: 'salut', name: 'Salut', icon: 'fa-hand', color: '56,189,248', dur: 2.8,
      pose: function (t, d) { var e = bell(t, d); return { a1: [(2.55 + 0.3 * S(t * 11)) * e, 0, 0], lz: 0.03 * e }; }
    },
    {
      id: 'applaudir', name: 'Applaudir', icon: 'fa-hands-clapping', color: '251,191,36', dur: 3.2,
      pose: function (t, d) {
        var e = bell(t, d), c = 0.55 + 0.25 * S(t * 17);
        return { y: Math.abs(S(t * 8.5)) * 0.03 * e, a0: [0, 1.3 * e, c * e], a1: [0, 1.3 * e, c * e], k0: 0.1 * e, k1: 0.1 * e };
      }
    },
    {
      id: 'victoire', name: 'Victoire', icon: 'fa-trophy', color: '250,204,21', dur: 2.8,
      pose: function (t, d) {
        var e = bell(t, d), hp = hop(t * 1.5), cr = 1 - hp;
        return { y: hp * 0.4 * e, lx: -0.08 * e, a0: [(2.6 + 0.15 * S(t * 9)) * e, 0, 0], a1: [(2.6 + 0.15 * S(t * 9 + 1)) * e, 0, 0], h0: -0.35 * cr * e, h1: -0.35 * cr * e, k0: 0.7 * cr * e, k1: 0.7 * cr * e };
      }
    },
    {
      id: 'coeur', name: 'Cœur', icon: 'fa-heart', color: '251,113,133', dur: 3,
      pose: function (t, d) { var e = bell(t, d); return { lz: 0.06 * S(t * 4) * e, y: Math.abs(S(t * 4)) * 0.02 * e, a0: [(PI + 0.4 + 0.08 * S(t * 6)) * e, 0, 0], a1: [(PI + 0.4 + 0.08 * S(t * 6)) * e, 0, 0] }; }
    },
    {
      id: 'epaules', name: 'Aucune idée', icon: 'fa-circle-question', color: '167,139,250', dur: 2.4,
      pose: function (t, d) { var e = bell(t, d), up = ease((t - 0.3) / 0.25) * ease((1.9 - t) / 0.25); return { lz: 0.07 * S(t * 3) * e, lx: -0.05 * e, a0: [(0.25 + 0.7 * up) * e, 0.3 * up, 0], a1: [(0.25 + 0.7 * up) * e, 0.3 * up, 0] }; }
    },
    {
      id: 'reverence', name: 'Révérence', icon: 'fa-crown', color: '245,158,11', dur: 2.6,
      pose: function (t, d) {
        var b = ease(t / 0.7) * ease((d - 0.4 - t) / 0.7);
        return { lx: 0.65 * b, h0: -0.1 * b, h1: 0.1 * b, k0: 0.1 * b, a1: [0, 1.1 * b, 0.8 * b], a0: [0.4 * b, -0.5 * b, 0] };
      }
    },
    {
      id: 'rire', name: 'Éclat de rire', icon: 'fa-face-laugh-beam', color: '52,211,153', dur: 2.8,
      pose: function (t, d) {
        var e = bell(t, d);
        return { lx: -0.18 * e, y: Math.abs(S(t * 18)) * 0.04 * e, lz: 0.05 * S(t * 20) * e, a0: [0, 0.8 * e, 0.45 * e], a1: [0, 0.8 * e, 0.45 * e] };
      }
    },
    {
      id: 'pointer', name: 'Toi !', icon: 'fa-hand-point-right', color: '239,68,68', dur: 2.4,
      pose: function (t, d) { var e = bell(t, d), jab = 1 + 0.12 * S(t * 9); return { yaw: -0.25 * e, a1: [0.05 * e, 1.55 * e * jab, 0], a0: [0.3 * e, -0.25 * e, 0], lx: 0.05 * e }; }
    }
  ];

  DANCES.forEach(function (d) { d.kind = 'dance'; d.dur = 0; });          // dur 0 : en boucle
  EMOTES.forEach(function (d) { d.kind = 'emote'; });

  F.DANCES = DANCES; F.EMOTES = EMOTES;
  F.EMOTE_LIST = DANCES.concat(EMOTES);
  var byId = {};
  F.EMOTE_LIST.forEach(function (e) { byId[e.id] = e; });
  F.emoteById = function (id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null; };
})();
