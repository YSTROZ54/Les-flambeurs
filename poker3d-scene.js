/* ========================================================================== */
/*  POKER 3D — PERSONNAGES, CHAISES ET SALLE (PC)                             */
/*  Chargé après poker3d.js : remplace les méthodes de la scène du poker.     */
/* ========================================================================== */
(function () {
  'use strict';
  if (typeof Poker3DExperience === 'undefined' || typeof THREE === 'undefined') return;
  const P = Poker3DExperience.prototype;

  const mat = (color, rough = 0.7, metal = 0.02, extra) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {}));

  /* ------------------------------------------------------------------------ */
  /* Apparences des personnages (un style par joueur ; prêtes pour la boutique) */
  /* ------------------------------------------------------------------------ */
  // clothing : suit | hoodie | jacket | vest | tee      hair : short | slick | long | bald | afro
  // acc (accessoires) : cap, tophat, cowboy, beanie, glasses, sunglasses, beard, mustache, chain, earring
  Poker3DExperience.PLAYER_LOOKS = [
    { skin: 0xd9a577, clothing: 'hoodie', shirt: 0x1f6f50, hair: 'short', hairColor: 0x2b1b12, chair: 0x6b3b1d, acc: ['cap'], capColor: 0xc8102e },
    { skin: 0xf0cfb0, clothing: 'suit', shirt: 0x2a2140, tie: 0x7c3aed, hair: 'slick', hairColor: 0x8a8a92, chair: 0x6b3b1d, acc: ['glasses', 'mustache'] },
    { skin: 0x8d5a3b, clothing: 'jacket', shirt: 0x9f1239, hair: 'long', hairColor: 0x0f0f0f, chair: 0x6b3b1d, acc: ['sunglasses', 'earring'] },
    { skin: 0xd9a066, clothing: 'vest', shirt: 0x0f4c81, hair: 'short', hairColor: 0x6b4423, chair: 0x6b3b1d, acc: ['cowboy', 'beard'], hatColor: 0xc2a06a },
    { skin: 0xf0c8a0, clothing: 'suit', shirt: 0x0e0f14, tie: 0xd4a62a, hair: 'slick', hairColor: 0xc9a24a, chair: 0x6b3b1d, acc: ['sunglasses', 'chain'] }
  ];
  Poker3DExperience.DEALER_LOOK = { skin: 0xe6b996, clothing: 'dealer', shirt: 0xf5f5f4, hair: 'slick', hairColor: 0x15110e, chair: 0x2a2a30, acc: ['mustache'] };
  Poker3DExperience.HERO_LOOK = { skin: 0xd9a574, clothing: 'hoodie', shirt: 0x1d4ed8, hair: 'short', hairColor: 0x3a2514, chair: 0x6b3b1d, acc: [] };

  /* ------------------------------------------------------------------------ */
  /* Un joueur assis (face = +Z local, origine = centre de l'assise)           */
  /* ------------------------------------------------------------------------ */
  P.createSeatedPlayer = function (look, floorLocal = -2.85) {
    const acc = look.acc || [];
    const skin = mat(look.skin, 0.5, 0.0);
    const cloth = mat(look.shirt, 0.78);
    const clothDark = mat(new THREE.Color(look.shirt).multiplyScalar(0.55).getHex(), 0.75);
    const hairM = mat(look.hairColor || 0x222222, look.hair === 'slick' ? 0.3 : 0.65, 0.04);
    const dark = mat(0x0c0c10, 0.5);
    const white = mat(0xf5f5f4, 0.6);
    const gold = mat(0xd4a62a, 0.3, 0.85);
    const g = new THREE.Group();
    const add = (m, parent = g) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

    /* ---- Chaise : assise rembourrée, dossier courbe, accoudoirs, pied à roulettes ---- */
    const leather = mat(look.chair || 0x6b3b1d, 0.55, 0.05);
    const seat = add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.6, 0.16, 36), leather));
    seat.position.y = -0.02;
    const piping = add(new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.025, 8, 40), gold));
    piping.rotation.x = Math.PI / 2;
    piping.position.y = 0.05;
    const backShape = new THREE.Shape();
    const a0 = Math.PI / 2 - 1.0, a1 = Math.PI / 2 + 1.0;
    backShape.absarc(0, 0, 0.74, a0, a1, false);
    backShape.absarc(0, 0, 0.62, a1, a0, true);
    const back = add(new THREE.Mesh(new THREE.ExtrudeGeometry(backShape, { depth: 1.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), leather));
    back.rotation.x = -Math.PI / 2;
    back.position.set(0, 0.06, -0.02);
    [-1, 1].forEach((s) => {
      const arm = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.62), leather));
      arm.position.set(s * 0.68, 0.42, -0.02);
      const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), mat(0x15151a, 0.35, 0.6)));
      post.position.set(s * 0.68, 0.2, 0.18);
    });
    const metal = mat(0x15151a, 0.35, 0.6);
    const stemLen = -0.1 - floorLocal;
    const stem = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, stemLen, 14), metal));
    stem.position.y = -0.1 - stemLen / 2;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.09), metal));
      leg.position.set(Math.cos(a) * 0.31, floorLocal + 0.09, Math.sin(a) * 0.31);
      leg.rotation.y = -a;
      const wheel = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), metal));
      wheel.position.set(Math.cos(a) * 0.6, floorLocal + 0.07, Math.sin(a) * 0.6);
    }

    /* ---- Jambes (pantalon) ---- */
    const pantsColor = look.clothing === 'suit' || look.clothing === 'dealer' ? 0x0f1016 : 0x1d2230;
    const pants = mat(pantsColor, 0.8);
    const pelvis = add(new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.42, 0.34, 24), pants));
    pelvis.position.set(0, 0.14, -0.06);
    pelvis.scale.z = 0.85;
    const shinLen = 0.2 - (floorLocal + 0.14);
    [-1, 1].forEach((s) => {
      const thigh = add(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.24, 0.86), pants));
      thigh.position.set(s * 0.22, 0.17, 0.32);
      const shin = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, shinLen, 0.22), pants));
      shin.position.set(s * 0.22, 0.2 - shinLen / 2, 0.7);
      const shoe = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.44), mat(0x0a0a0d, 0.35, 0.2)));
      shoe.position.set(s * 0.22, floorLocal + 0.1, 0.8);
    });

    /* ---- Buste ---- */
    const upper = new THREE.Group();
    upper.position.set(0, 0.06, -0.08);
    g.add(upper);
    const prof = [[0.001, 0], [0.36, 0], [0.43, 0.22], [0.46, 0.5], [0.5, 0.78], [0.52, 0.96], [0.44, 1.08], [0.2, 1.16], [0.001, 1.18]]
      .map((p) => new THREE.Vector2(p[0], p[1]));
    const torsoCloth = look.clothing === 'dealer' ? white : cloth;
    const torso = add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), torsoCloth), upper);
    torso.scale.z = 0.72;
    torso.position.y = 0.02;
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 14), skin), upper);
    neck.position.y = 1.2;

    const chestZ = 0.37;
    if (look.clothing === 'suit') {
      const shirtV = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.02), white), upper);
      shirtV.position.set(0, 0.92, chestZ);
      const tieM = mat(look.tie || 0x991b1b, 0.5);
      const tie = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.02), tieM), upper);
      tie.position.set(0, 0.88, chestZ + 0.012);
      const knot = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), tieM), upper);
      knot.position.set(0, 1.1, chestZ + 0.012);
      [-1, 1].forEach((s) => {
        const lapel = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 0.03), clothDark), upper);
        lapel.position.set(s * 0.15, 0.88, chestZ + 0.005);
        lapel.rotation.z = -s * 0.28;
      });
    } else if (look.clothing === 'dealer') {
      [-1, 1].forEach((s) => {
        const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.74, 0.04), dark), upper);
        panel.position.set(s * 0.18, 0.62, chestZ - 0.005);
      });
      for (let i = 0; i < 3; i++) {
        const btn = add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), gold), upper);
        btn.position.set(0.02, 0.4 + i * 0.16, chestZ + 0.04);
      }
      const bowM = mat(0xa31621, 0.5);
      [-1, 1].forEach((s) => {
        const wing = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.03), bowM), upper);
        wing.position.set(s * 0.07, 1.1, chestZ + 0.02);
        wing.rotation.z = s * 0.35;
      });
      const bk = add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bowM), upper);
      bk.position.set(0, 1.1, chestZ + 0.025);
    } else if (look.clothing === 'hoodie') {
      const hood = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), cloth), upper);
      hood.scale.set(1.15, 0.6, 0.65);
      hood.position.set(0, 1.12, -0.2);
      [-1, 1].forEach((s) => {
        const cord = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), white), upper);
        cord.position.set(s * 0.08, 0.9, chestZ + 0.01);
      });
      const pocket = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.03), clothDark), upper);
      pocket.position.set(0, 0.3, chestZ - 0.01);
    } else if (look.clothing === 'jacket') {
      [-1, 1].forEach((s) => {
        const collar = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.1), clothDark), upper);
        collar.position.set(s * 0.14, 1.12, 0.26);
        collar.rotation.set(0.25, 0, s * 0.35);
      });
      const zip = add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.82, 0.02), mat(0xb8b8c0, 0.3, 0.9)), upper);
      zip.position.set(0, 0.6, chestZ + 0.005);
    } else if (look.clothing === 'vest') {
      [-1, 1].forEach((s) => {
        const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.74, 0.04), mat(0x5b3a1e, 0.8)), upper);
        panel.position.set(s * 0.18, 0.62, chestZ - 0.005);
      });
      const col = add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 20), white), upper);
      col.position.y = 1.14;
      col.rotation.x = Math.PI / 2;
    }
    if (acc.includes('chain')) {
      const chain = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 28), gold), upper);
      chain.position.set(0, 1.05, 0.06);
      chain.rotation.x = Math.PI / 2 - 0.35;
      const pend = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), gold), upper);
      pend.position.set(0, 0.88, 0.3);
    }

    /* ---- Tête ---- */
    const head = new THREE.Group();
    head.position.set(0, 1.52, 0.03);
    upper.add(head);
    const cranium = add(new THREE.Mesh(new THREE.SphereGeometry(0.29, 30, 22), skin), head);
    cranium.scale.set(0.93, 1.08, 1.0);
    cranium.position.y = 0.03;
    const jaw = add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 26, 16), skin), head);
    jaw.scale.set(0.88, 0.82, 0.96);
    jaw.position.set(0, -0.12, 0.04);
    const nose = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin), head);
    nose.scale.set(0.75, 1.05, 1.25);
    nose.position.set(0, -0.03, 0.29);
    [-1, 1].forEach((s) => {
      const eyeW = add(new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 10), white), head);
      eyeW.scale.set(1, 0.8, 0.55);
      eyeW.position.set(s * 0.105, 0.045, 0.262);
      const iris = add(new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), mat(0x2b1d12, 0.3)), head);
      iris.position.set(s * 0.105, 0.045, 0.283);
      const brow = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.025), hairM), head);
      brow.position.set(s * 0.105, 0.112, 0.268);
      brow.rotation.z = s * -0.1;
      const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin), head);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * 0.285, -0.01, 0.0);
      if (acc.includes('earring')) {
        const er = add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), gold), head);
        er.position.set(s * 0.29, -0.07, 0.0);
      }
    });
    const mouth = add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.02), mat(0x7a2a2a, 0.5)), head);
    mouth.position.set(0, -0.145, 0.262);

    // Cheveux
    const hs = look.hair || 'short';
    if (hs !== 'bald') {
      const phi = hs === 'afro' ? 0.7 : 0.56;
      const scalp = add(new THREE.Mesh(new THREE.SphereGeometry(hs === 'afro' ? 0.4 : 0.31, 28, 16, 0, Math.PI * 2, 0, Math.PI * phi), hairM), head);
      scalp.scale.set(hs === 'afro' ? 1.0 : 0.97, 1.1, hs === 'slick' ? 1.08 : 1.03);
      scalp.position.set(0, hs === 'afro' ? 0.08 : 0.04, hs === 'slick' ? -0.035 : -0.02);
      if (hs === 'long') {
        const mane = add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.17), hairM), head);
        mane.position.set(0, -0.22, -0.2);
        [-1, 1].forEach((s) => {
          const lock = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.12), hairM), head);
          lock.position.set(s * 0.285, -0.12, 0.0);
        });
      } else if (hs === 'short') {
        [-1, 1].forEach((s) => {
          const burn = add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.05), hairM), head);
          burn.position.set(s * 0.255, 0.01, 0.1);
        });
      }
    }

    // Accessoires
    if (acc.includes('mustache')) {
      [-1, 1].forEach((s) => {
        const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.035), hairM), head);
        m.position.set(s * 0.045, -0.105, 0.275);
        m.rotation.z = s * -0.18;
      });
    }
    if (acc.includes('beard')) {
      const beard = add(new THREE.Mesh(new THREE.SphereGeometry(0.265, 24, 14, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.5), hairM), head);
      beard.scale.set(0.93, 0.9, 1.0);
      beard.position.set(0, -0.06, 0.035);
    }
    if (acc.includes('glasses')) {
      [-1, 1].forEach((s) => {
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.011, 8, 22), dark), head);
        ring.position.set(s * 0.105, 0.045, 0.285);
        const temple = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.28), dark), head);
        temple.position.set(s * 0.175, 0.05, 0.15);
      });
      const bridge = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), dark), head);
      bridge.position.set(0, 0.055, 0.29);
    }
    if (acc.includes('sunglasses')) {
      const lens = mat(0x05050a, 0.15, 0.4);
      [-1, 1].forEach((s) => {
        const l = add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), lens), head);
        l.scale.set(1.1, 0.8, 0.28);
        l.position.set(s * 0.105, 0.045, 0.285);
        const temple = add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.28), dark), head);
        temple.position.set(s * 0.18, 0.05, 0.15);
      });
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.014), dark), head);
      bar.position.set(0, 0.06, 0.29);
    }
    if (acc.includes('cap')) {
      const capM = mat(look.capColor || 0xc8102e, 0.6);
      const crown = add(new THREE.Mesh(new THREE.SphereGeometry(0.325, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), capM), head);
      crown.scale.set(0.99, 1.02, 1.05);
      crown.position.set(0, 0.055, -0.01);
      const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), capM), head);
      brim.position.set(0, 0.13, 0.2);
      brim.rotation.x = 0.12;
    }
    if (acc.includes('tophat')) {
      const crown = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.4, 24), dark), head);
      crown.position.y = 0.43;
      const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 28), dark), head);
      brim.position.y = 0.24;
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.222, 0.07, 24), mat(0x7c3aed, 0.5)), head);
      band.position.y = 0.28;
    }
    if (acc.includes('cowboy')) {
      const hatM = mat(look.hatColor || 0xc2a06a, 0.75);
      const crown = add(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.26, 24), hatM), head);
      crown.position.y = 0.38;
      const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.025, 32), hatM), head);
      brim.position.y = 0.25;
      brim.scale.set(1.0, 1, 0.9);
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.05, 24), mat(0x4a2c14, 0.6)), head);
      band.position.y = 0.29;
    }
    if (acc.includes('beanie')) {
      const bean = add(new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(look.capColor || 0x2563eb, 0.85)), head);
      bean.position.y = 0.05;
    }

    /* ---- Bras (pivot à l'épaule pour pouvoir les animer) ---- */
    const sleeve = look.clothing === 'dealer' ? white : cloth;
    const arms = [];
    [-1, 1].forEach((s) => {
      const shoulder = new THREE.Vector3(s * 0.52, 1.02, -0.08);
      const pivot = new THREE.Group();
      pivot.position.copy(shoulder);
      g.add(pivot);
      const zero = new THREE.Vector3();
      const elbow = new THREE.Vector3(s * 0.1, -0.4, 0.38);
      const hand = new THREE.Vector3(-s * 0.18, -0.3, 0.86);
      const jt = add(new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 10), sleeve), pivot);
      jt.position.copy(zero);
      pivot.add(this.makeLimb(zero, elbow, 0.12, sleeve));
      const ej = add(new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), sleeve), pivot);
      ej.position.copy(elbow);
      pivot.add(this.makeLimb(elbow, hand, 0.095, sleeve));
      // main : paume + 4 doigts + pouce, posée à plat
      const h = new THREE.Group();
      h.position.copy(hand);
      h.rotation.y = -s * 0.2;
      pivot.add(h);
      const palm = add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.14), skin), h);
      palm.position.z = 0.05;
      for (let f = 0; f < 4; f++) {
        const len = f === 0 || f === 3 ? 0.09 : 0.11;
        const fing = add(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, len, 8), skin), h);
        fing.rotation.x = Math.PI / 2;
        fing.position.set(-0.054 + f * 0.036, -0.005, 0.12 + len / 2);
        fing.rotation.z = (f - 1.5) * 0.06;
      }
      const thumb = add(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.08, 8), skin), h);
      thumb.rotation.x = Math.PI / 2;
      thumb.rotation.z = s * 0.7;
      thumb.position.set(-s * 0.09, -0.005, 0.07);
      arms.push(pivot);
    });

    g.userData = { upper, head, arms };
    return g;
  };

  /* ------------------------------------------------------------------------ */
  /* Textures de décor                                                         */
  /* ------------------------------------------------------------------------ */
  function canvasTex(w, h, draw, repeat) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 8;
    return t;
  }

  function carpetTexture() {
    return canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#2b0b14'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(212,166,42,0.28)'; c.lineWidth = 3;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const cx = x * 256 + 128, cy = y * 256 + 128;
        c.beginPath(); c.arc(cx, cy, 70, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(cx, cy, 38, 0, Math.PI * 2); c.stroke();
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          c.beginPath(); c.moveTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38); c.lineTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70); c.stroke();
        }
      }
      c.fillStyle = 'rgba(212,166,42,0.18)';
      [[0, 0], [256, 0], [0, 256], [256, 256]].forEach((p) => { c.beginPath(); c.arc(p[0], p[1], 14, 0, Math.PI * 2); c.fill(); });
    }, [14, 14]);
  }

  function damaskTexture() {
    return canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#3a0912'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(110,26,42,0.55)';
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const cx = x * 128 + 64 + (y % 2 ? 64 : 0), cy = y * 128 + 64;
        c.beginPath(); c.ellipse(cx % 256, cy, 22, 40, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(cx % 256, cy, 7, 14, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(212,166,42,0.35)'; c.fill();
        c.fillStyle = 'rgba(110,26,42,0.55)';
      }
    }, [10, 2]);
  }

  function skylineTexture() {
    return canvasTex(2048, 512, (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#04060f'); sky.addColorStop(0.6, '#141c36'); sky.addColorStop(1, '#3b2a40');
      c.fillStyle = sky; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.random() * 0.6) + ')'; c.fillRect(Math.random() * w, Math.random() * h * 0.5, 1.5, 1.5); }
      c.fillStyle = '#f3efe0'; c.beginPath(); c.arc(1500, 90, 26, 0, Math.PI * 2); c.fill();
      for (let layer = 0; layer < 2; layer++) {
        let x = -20;
        while (x < w) {
          const bw = 40 + Math.random() * 80, bh = 90 + Math.random() * (layer ? 150 : 230);
          c.fillStyle = layer ? '#0a0e1c' : '#0f1428';
          c.fillRect(x, h - bh, bw, bh);
          for (let wy = h - bh + 10; wy < h - 8; wy += 14) for (let wx = x + 6; wx < x + bw - 6; wx += 12) {
            if (Math.random() < 0.55) { c.fillStyle = Math.random() < 0.8 ? 'rgba(255,214,130,0.85)' : 'rgba(170,200,255,0.8)'; c.fillRect(wx, wy, 5, 7); }
          }
          x += bw + 4;
        }
      }
    });
  }

  /* ------------------------------------------------------------------------ */
  /* La salle : moquette, banquette rouge, rambarde dorée, baies, lustre       */
  /* ------------------------------------------------------------------------ */
  P.buildRoom = function () {
    const room = new THREE.Group();
    const FLOOR = -1.77;
    const arc = 3.6, start = Math.PI - arc / 2;
    const goldM = mat(0xb8902f, 0.3, 0.85);
    const dbl = (m) => { m.side = THREE.DoubleSide; return m; };

    // Éclairage d'ambiance chaud
    room.add(new THREE.HemisphereLight(0xffd7b8, 0x1a0a12, 0.28));
    const warm = new THREE.PointLight(0xff9a70, 1.1, 22, 1.4);
    warm.position.set(0, 2.5, -5.5);
    room.add(warm);

    // Moquette à motifs
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), mat(0xffffff, 0.95));
    carpet.material.map = carpetTexture();
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = FLOOR + 0.005;
    carpet.receiveShadow = true;
    room.add(carpet);

    // Banquette (assise + dossier capitonné) et mur en tissu damassé
    const seatM = mat(0x4a0b17, 0.45, 0.05);
    const bench = new THREE.Mesh(new THREE.CylinderGeometry(7.3, 7.3, 0.85, 72, 1, true, start, arc), dbl(seatM));
    bench.position.y = FLOOR + 0.45;
    room.add(bench);
    const benchTop = new THREE.Mesh(new THREE.RingGeometry(6.55, 7.3, 72, 1, start - Math.PI / 2, arc), dbl(mat(0x5a0f1d, 0.45)));
    benchTop.rotation.x = -Math.PI / 2;
    benchTop.position.y = FLOOR + 0.88;
    room.add(benchTop);
    const wallM = dbl(mat(0xffffff, 0.85));
    wallM.map = damaskTexture();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(7.9, 7.9, 2.2, 72, 1, true, start, arc), wallM);
    wall.position.y = FLOOR + 1.1 + 0.8;
    room.add(wall);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(7.92, 7.92, 0.14, 72, 1, true, start, arc), dbl(goldM));
    trim.position.y = FLOOR + 3.0;
    room.add(trim);
    const baseTrim = new THREE.Mesh(new THREE.CylinderGeometry(7.92, 7.92, 0.18, 72, 1, true, start, arc), dbl(goldM));
    baseTrim.position.y = FLOOR + 0.8;
    room.add(baseTrim);

    // Rambarde dorée à barreaux
    const railY0 = FLOOR + 3.0, railH = 0.9;
    const rail = new THREE.Mesh(new THREE.TorusGeometry(7.85, 0.05, 8, 80, arc), goldM);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = Math.PI / 2 - start - arc;
    rail.position.y = railY0 + railH;
    room.add(rail);
    const bal = new THREE.CylinderGeometry(0.025, 0.025, railH, 6);
    for (let i = 0; i <= 90; i++) {
      const a = start + (i / 90) * arc;
      const b = new THREE.Mesh(bal, goldM);
      b.position.set(Math.sin(a) * 7.85, railY0 + railH / 2, Math.cos(a) * 7.85);
      room.add(b);
    }

    // Grande baie vitrée avec la ville de nuit
    const city = new THREE.Mesh(new THREE.PlaneGeometry(46, 11.5), new THREE.MeshBasicMaterial({ map: skylineTexture(), toneMapped: false, fog: false }));
    city.position.set(0, FLOOR + 8.2, -14);
    room.add(city);
    const frameM = mat(0x0d0d12, 0.5, 0.4);
    for (let i = -8; i <= 8; i++) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.09, 11.5, 0.09), frameM);
      mull.position.set(i * 2.6, FLOOR + 8.2, -13.9);
      room.add(mull);
    }
    [0, 1].forEach((k) => {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(46, 0.09, 0.09), frameM);
      tr.position.set(0, FLOOR + 5.6 + k * 4.2, -13.9);
      room.add(tr);
    });

    // Colonnes dorées + appliques lumineuses
    [-1.55, -0.85, 0.85, 1.55].forEach((ang) => {
      const a = Math.PI + ang;
      const px = Math.sin(a) * 7.55, pz = Math.cos(a) * 7.55;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5.2, 20), mat(0x3a0a14, 0.35, 0.1));
      col.position.set(px, FLOOR + 2.6, pz);
      room.add(col);
      [0.15, 5.05].forEach((yy) => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 20), goldM);
        cap.position.set(px, FLOOR + yy, pz);
        room.add(cap);
      });
      const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.34, 14), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false, fog: false }));
      lampBody.position.set(Math.sin(a) * 7.2, FLOOR + 2.7, Math.cos(a) * 7.2);
      room.add(lampBody);
    });

    // Lustre : couronne de panneaux lumineux suspendue au-dessus de la table
    const chand = new THREE.Group();
    chand.position.set(0, 5.1, -0.4);
    const panelM = new THREE.MeshBasicMaterial({ color: 0xfff1d4, toneMapped: false, fog: false });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const pn = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.05), panelM);
      pn.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
      pn.rotation.y = -a + Math.PI / 2;
      chand.add(pn);
    }
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 8, 40), goldM);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = 0.58;
    chand.add(hoop);
    const hoop2 = hoop.clone(); hoop2.position.y = -0.58; chand.add(hoop2);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 6), mat(0x111111));
    cord.position.y = 2.6;
    chand.add(cord);
    room.add(chand);

    // Plantes en pot de chaque côté
    [-1, 1].forEach((s) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.55, 18), mat(0x2a1a12, 0.6));
      pot.position.set(s * 5.4, FLOOR + 0.28, -4.6);
      room.add(pot);
      const leaves = mat(0x1d5a2c, 0.7);
      for (let i = 0; i < 9; i++) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), leaves);
        lf.scale.set(1, 1.6, 0.5);
        const a = (i / 9) * Math.PI * 2;
        lf.position.set(s * 5.4 + Math.cos(a) * 0.22, FLOOR + 1.0 + (i % 3) * 0.2, -4.6 + Math.sin(a) * 0.22);
        lf.rotation.set(Math.sin(a) * 0.4, a, Math.cos(a) * 0.4);
        room.add(lf);
      }
    });

    if (this.scene.fog) this.scene.fog.density = 0.016;
    this.roomGroup = room;
    this.scene.add(room);
  };
})();
