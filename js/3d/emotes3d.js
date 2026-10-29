/* =====================================================================
   emotes3d.js — Danses et emotes des Flambeurs (monde 3D, PC)
   ---------------------------------------------------------------------
   Le catalogue (F.EMOTES) et la façon dont le petit personnage bouge pour chacune.
   Une danse tourne en boucle jusqu'à ce que le joueur marche ou la relance ; une emote dure quelques secondes.
   Une pose est une fonction du temps : elle renvoie des angles (en radians) que F3D.createPerson applique.
     y : saut (m) · yaw : tour sur soi-même · lx : penché en avant · lz : penché de côté
     h0 h1 : cuisses (+ = vers l'arrière) · k0 k1 : genoux (pliés) · hz0 hz1 : jambes écartées
     a0 a1 : bras [écart sur le côté, élan vers l'avant, rentré vers le centre]
     (écart ≈ 1,57 : bras à l'horizontale ; ≈ 3,1 : bras tendu au-dessus de la tête)
   Les deux joueurs voient la même chose : seul l'identifiant circule sur le canal temps réel (world3d.js).
   Fichiers liés : f3d-core.js (applique la pose), world3d.js (caméra, réseau), hud3d.js (roue et téléphone).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D = window.F3D || {};
  var S = Math.sin, C = Math.cos, PI = Math.PI;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  // cloche : 0 au début et à la fin, 1 au milieu
  function bell(t, dur) { return ease(t / 0.35) * ease((dur - t) / 0.35); }
  // saut parabolique : u va de 0 à 1 pour un saut complet
  function hop(u) { u = u - Math.floor(u); return 4 * u * (1 - u); }

  var DANCES = [
    {
      id: 'disco', name: 'Disco', icon: 'fa-compact-disc', color: '232,121,249',
      pose: function (t) {
        var s = S(t * 3.2), b = Math.abs(S(t * 3.2));
        return {
          y: b * 0.05, lz: 0.09 * s, lx: 0.04, yaw: 0.25 * s,
          a0: [1.55 - 1.15 * s, 0, 0], a1: [1.55 + 1.15 * s, 0, 0],
          h0: -0.4 * Math.max(0, s), h1: -0.4 * Math.max(0, -s), k0: 0.6 * Math.max(0, s), k1: 0.6 * Math.max(0, -s)
        };
      }
    },
    {
      id: 'robot', name: 'Robot', icon: 'fa-robot', color: '148,163,184',
      pose: function (t) {
        var T = [   // quatre poses raides, on passe de l'une à l'autre d'un coup sec
          { a0: [0, 1.55, 0], a1: [0.25, 0, 0], yaw: 0.45, h: 0.25 },
          { a0: [1.57, 0, 0], a1: [1.57, 0, 0], yaw: 0, h: 0 },
          { a0: [0.25, 0, 0], a1: [0, 1.55, 0], yaw: -0.45, h: -0.25 },
          { a0: [2.7, 0, 0], a1: [0.1, 0, 0], yaw: 0, h: 0 }
        ];
        var n = t * 2.4, i = Math.floor(n) % 4, p = T[(i + 3) % 4], q = T[i], k = ease((n - Math.floor(n)) / 0.22);
        function mix(a, b) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
        var h = p.h + (q.h - p.h) * k;
        return { a0: mix(p.a0, q.a0), a1: mix(p.a1, q.a1), yaw: p.yaw + (q.yaw - p.yaw) * k, h0: h, h1: -h, k0: h > 0 ? 0.3 : 0, k1: h < 0 ? 0.3 : 0 };
      }
    },
    {
      id: 'floss', name: 'Floss', icon: 'fa-bolt', color: '251,191,36',
      pose: function (t) {
        var s = S(t * 7.5);
        return {
          y: Math.abs(S(t * 3.75)) * 0.03, lz: -0.1 * s, yaw: 0.35 * s,
          a0: [0.25, 1.1 * s, 0.6 * s], a1: [0.25, -1.1 * s, -0.6 * s],
          h0: 0.2 * s, h1: -0.2 * s, k0: 0.35, k1: 0.35
        };
      }
    },
    {
      id: 'twist', name: 'Tourbillon', icon: 'fa-rotate', color: '56,189,248',
      pose: function (t) {
        return { yaw: t * 5, y: Math.abs(S(t * 5)) * 0.04, a0: [1.45, 0, 0], a1: [1.45, 0, 0], h0: 0.15 * S(t * 10), h1: -0.15 * S(t * 10), k0: 0.25, k1: 0.25 };
      }
    },
    {
      id: 'poulet', name: 'Poulet', icon: 'fa-egg', color: '251,146,60',
      pose: function (t) {
        var f = S(t * 13), hp = hop(t * 3);
        return {
          y: -0.1 + hp * 0.05, lx: 0.12 + 0.1 * S(t * 6.5),
          a0: [0.95 + 0.5 * f, 0, 0], a1: [0.95 - 0.5 * f, 0, 0],
          h0: -0.4, h1: -0.4, k0: 0.8, k1: 0.8, hz0: 0.25, hz1: 0.25
        };
      }
    },
    {
      id: 'vague', name: 'La vague', icon: 'fa-water', color: '45,212,191',
      pose: function (t) {
        var s = S(t * 4);
        return {
          y: Math.abs(S(t * 2)) * 0.03, lz: 0.12 * S(t * 2),
          a0: [1.5, 0.75 * s, 0], a1: [1.5, 0.75 * S(t * 4 - 1.3), 0],
          h0: 0.12 * S(t * 4), h1: -0.12 * S(t * 4), k0: 0.2, k1: 0.2
        };
      }
    },
    {
      id: 'joie', name: 'Saut de joie', icon: 'fa-champagne-glasses', color: '250,204,21',
      pose: function (t) {
        var u = t * 1.7, hp = hop(u), crouch = 1 - hp;
        return { y: hp * 0.5, a0: [2.65 + 0.2 * S(t * 11), 0, 0], a1: [2.65 + 0.2 * S(t * 11 + 1), 0, 0], h0: -0.5 * crouch, h1: -0.5 * crouch, k0: 0.9 * crouch, k1: 0.9 * crouch, lx: -0.06 };
      }
    },
    {
      id: 'charleston', name: 'Charleston', icon: 'fa-shoe-prints', color: '163,230,53',
      pose: function (t) {
        var s = S(t * 6);
        return {
          y: Math.abs(s) * 0.04, yaw: 0.2 * s,
          a0: [0.5, 0.9 * s, 0.3], a1: [0.5, -0.9 * s, 0.3],
          h0: 0.1, h1: 0.1, k0: 0.35 + 0.3 * s, k1: 0.35 - 0.3 * s, hz0: 0.28 * (0.5 + 0.5 * s), hz1: 0.28 * (0.5 - 0.5 * s)
        };
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
