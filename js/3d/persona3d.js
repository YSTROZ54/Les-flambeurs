/* =====================================================================
   persona3d.js — Les vrais personnages 3D des joueurs (monde 3D, PC)
   ---------------------------------------------------------------------
   Remplace les petits personnages en boîtes (f3d-core.js) par un corps animé « Universal Base Characters » + « Universal Animation
   Library » (Quaternius, licence CC0). Fichiers allégés dans assets/3d/persona/ :
     personnage_homme.glb / personnage_femme.glb   le corps (squelette de 65 os), les yeux, les sourcils, peau foncée
     peau_homme_clair.png / peau_femme_clair.png   la peau claire (remplace la texture de peau foncée)
     animations.glb                                14 animations (marche, course, saut, assis, danse…), même squelette
     hair_*.glb                                    coiffures et barbe, collées à l'os de la tête
   Pas de vêtements dessinés : le corps est laissé tel quel (les habits viendront plus tard).
   L'apparence (sexe, teint, coiffure, couleur des cheveux, barbe) est choisie une fois pour toutes à la création du compte ; elle se résume
   en un code de 5 caractères (ex. « h12301 »), qui voyage avec la position dans le canal temps réel (world3d.js).
   F3D.createPlayer(nom, avatar, apparence) renvoie le même objet que F3D.createPerson (mêmes méthodes : walk, setSeated, startEmote…) :
   les boîtes restent le temps du chargement, ou si le chargement échoue. Les vendeurs des boutiques gardent leurs boîtes.
   Fichiers liés : f3d-core.js (l'objet de base), world3d.js (joueurs), emotes3d.js (catalogue des danses), creation3d.js (écran de création).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.createPerson || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;

  var BASE = 'assets/3d/persona/';
  var HAIR_COLORS = [0x1a1210, 0x3b2314, 0x6b4423, 0xb8863b, 0x8a2b1c, 0x8c8c8c];            // noir, brun, châtain, blond, roux, gris
  var HAIR_COLOR_NAMES = ['Noir', 'Brun', 'Châtain', 'Blond', 'Roux', 'Gris'];
  var HAIR_STYLES = ['rase', 'court', 'raie', 'long', 'chignon'];
  var HAIR_STYLE_NAMES = ['Rasé', 'Court', 'Raie', 'Long', 'Chignon'];
  var HAIR_FILE = { court: { h: 'hair_buzzed', f: 'hair_buzzedfemale' }, raie: { h: 'hair_simpleparted', f: 'hair_simpleparted' }, long: { h: 'hair_long', f: 'hair_long' }, chignon: { h: 'hair_buns', f: 'hair_buns' } };

  // danse / emote -> animation et vitesse (la bibliothèque n'a qu'une danse : on la varie par la vitesse et par les mouvements du corps entier de emotes3d.js)
  var EMOTE_CLIP = {
    disco: ['Dance_Loop', 1], robot: ['Dance_Loop', 0.55], floss: ['Dance_Loop', 1.5], twist: ['Dance_Loop', 1.25], poulet: ['Dance_Loop', 1.7],
    vague: ['Dance_Loop', 0.8], joie: ['Dance_Loop', 1.9], charleston: ['Dance_Loop', 1.15],
    salut: ['Interact', 1], applaudir: ['Hit_Chest', 2.2], victoire: ['Dance_Loop', 1.8], coeur: ['Idle_Talking_Loop', 1.2], epaules: ['Idle_Talking_Loop', 1],
    reverence: ['Interact', 0.8], rire: ['Hit_Chest', 2.5], pointer: ['Spell_Simple_Shoot', 0.6]
  };
  var FOOT_Y = 0.055;         // les animations enfoncent un peu les pieds dans le sol : on remonte le corps
  var SIT_DEFAULT = { y: 0.07, z: 0.28 };   // hauteur et recul du corps assis ; chaque salle peut donner la sienne (room.sit)

  function nameHash(n) { var h = 7; n = String(n || ''); for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return h; }
  function ease01(v) { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }

  /* ---------- apparence : objet { sex: 'h'|'f', tone: 0|1, hair: 0-4, color: 0-5, beard: 0|1 } <-> code de 5 caractères ---------- */
  function lookCode(l) { return l.sex + l.tone + l.hair + l.color + l.beard; }
  function parseLook(c) {
    if (c && typeof c === 'object') c = lookCode(c);
    if (typeof c !== 'string' || !/^[hf][01][0-4][0-5][01]$/.test(c)) return null;
    return { sex: c[0], tone: +c[1], hair: +c[2], color: +c[3], beard: c[0] === 'h' ? +c[4] : 0 };
  }
  // sans choix (robots, joueurs d'avant la création) : tiré du pseudo
  function lookFromName(name) {
    var h = nameHash(name), sex = (h >>> 2) % 2 ? 'f' : 'h';
    return { sex: sex, tone: (h >>> 5) % 2, hair: (h >>> 7) % 5, color: (h >>> 11) % 6, beard: sex === 'h' && (h >>> 14) % 3 === 0 ? 1 : 0 };
  }
  // apparence du joueur connecté (choisie à la création du compte, voir creation3d.js) ; sans choix : tirée du pseudo
  F.myLook = function () { var c = ''; try { c = state.look || ''; } catch (e) { /* pas connecté */ } return parseLook(c) || lookFromName(F.me ? F.me() : ''); };
  F.myLookCode = function () { return lookCode(F.myLook()); };
  // personnage de n'importe quel joueur d'après son pseudo : le sien, celui annoncé par sa présence en ligne, sinon tiré du pseudo (robots)
  function lookFor(name) {
    var n = String(name || '').toLowerCase().trim();
    if (F.me && n && n === F.me()) return F.myLook();
    return parseLook(F.presence && F.presence.lookOf ? F.presence.lookOf(n) : '') || lookFromName(name);
  }
  F.persona = { lookFor: lookFor, HAIR_COLORS: HAIR_COLORS, HAIR_COLOR_NAMES: HAIR_COLOR_NAMES, HAIR_STYLES: HAIR_STYLES, HAIR_STYLE_NAMES: HAIR_STYLE_NAMES, lookCode: lookCode, parseLook: parseLook, lookFromName: lookFromName };

  /* ---------- chargement (par morceaux, au premier joueur qui en a besoin) ---------- */
  var T = { shared: 'idle', bodies: {}, skins: {}, hairs: {}, clips: {}, waiters: [], hairMats: {} };
  function loadGltf(url) { return new Promise(function (ok, ko) { new THREE.GLTFLoader().load(BASE + url, ok, undefined, ko); }); }
  function loadTex(url) { return new Promise(function (ok, ko) { new THREE.TextureLoader().load(BASE + url, function (t) { t.flipY = false; t.encoding = THREE.sRGBEncoding; ok(t); }, undefined, ko); }); }
  function when(key, fn) { return T[key] ? T[key].then(fn) : null; }
  // prépare tout ce qu'il faut pour cette apparence, puis rappelle
  function ensure(look, cb) {
    var jobs = [];
    if (!T.animP) T.animP = loadGltf('animations.glb').then(function (r) { r.animations.forEach(function (c) { T.clips[c.name] = c; }); });
    jobs.push(T.animP);
    var sx = look.sex === 'f' ? 'femme' : 'homme';
    if (!T.bodies[sx]) T.bodies[sx] = loadGltf('personnage_' + sx + '.glb').then(function (r) { r.scene.updateMatrixWorld(true); return r.scene; });
    jobs.push(T.bodies[sx]);
    if (look.tone === 1 && !T.skins[sx]) T.skins[sx] = loadTex('peau_' + sx + '_clair.png');
    if (look.tone === 1) jobs.push(T.skins[sx]);
    var hf = hairFiles(look);
    hf.forEach(function (n) { if (!T.hairs[n]) T.hairs[n] = loadGltf(n + '.glb').then(function (r) { return r.scene; }); jobs.push(T.hairs[n]); });
    Promise.all(jobs).then(function () { cb(); }).catch(function (e) { if (window.console) console.warn('[persona] chargement impossible, les petits personnages restent', e); });
  }
  function hairFiles(look) {
    var out = [], st = HAIR_STYLES[look.hair], f = HAIR_FILE[st];
    if (f) out.push(f[look.sex]);
    if (look.beard && look.sex === 'h') out.push('hair_beard');
    return out;
  }
  function hairMat(hex) { return T.hairMats[hex] || (T.hairMats[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, side: THREE.DoubleSide })); }

  // idle calme : bras le long du corps, respiration à peine visible (l'animation d'attente de la bibliothèque est une garde de boxeur)
  function idleClip(root) {
    var tracks = [], times = [0, 2, 4];
    function Q(name, ax, a0, a1) {
      var b = root.getObjectByName(name); if (!b) return;
      var q0 = b.quaternion.clone(), v = [], k, ex = new THREE.Quaternion();
      for (k = 0; k < 3; k++) {
        var ang = k === 1 ? a1 : a0;
        ex.setFromAxisAngle(new THREE.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0), ang);
        var q = q0.clone().multiply(ex); v.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, v));
    }
    Q('upperarm_r', 'z', 1.28, 1.285); Q('upperarm_l', 'z', -1.28, -1.285);
    Q('lowerarm_r', 'y', 0.2, 0.2); Q('lowerarm_l', 'y', -0.2, -0.2);
    Q('spine_02', 'x', 0, 0.012); Q('spine_03', 'x', 0, 0.01);
    return new THREE.AnimationClip('Idle_Calme', 4, tracks);
  }

  /* ---------- le personnage animé, branché sur l'objet de createPerson ---------- */
  function upgrade(p, look) {
    if (p._dead) return;
    if (p._rig) { p.group.remove(p._rig.root); p._rig.mixer.stopAllAction(); p._rig.mats.forEach(function (m) { m.dispose(); }); p._rig = null; }
    var sx = look.sex === 'f' ? 'femme' : 'homme', g = p.group, my = p._upg = (p._upg || 0) + 1;   // si le joueur change d'apparence pendant le chargement, seul le dernier appel compte
    T.bodies[sx].then(function (tpl) {
      if (p._dead || my !== p._upg) return;
      var root = THREE.SkeletonUtils.clone(tpl), mats = [], hairHex = HAIR_COLORS[look.color];
      var head = root.getObjectByName('Head');
      root.traverse(function (o) {
        if (!o.isSkinnedMesh) return;
        o.frustumCulled = false;
        if (/^SuperHero_|^Superhero_/.test(o.name)) {
          if (look.tone === 1 && T.skins[sx]) T.skins[sx].then(function (tx) { var m = o.material.clone(); m.map = tx; m.needsUpdate = true; o.material = m; mats.push(m); });
        } else if (o.name === 'Eyebrows') { o.material = o.material.clone(); o.material.color.setHex(hairHex); mats.push(o.material); }
      });
      // la coiffure et la barbe sont collées à l'os de la tête (mises à plat au repos : même place que dans le fichier d'origine)
      root.updateMatrixWorld(true);
      var inv = new THREE.Matrix4().copy(head.matrixWorld).invert();
      hairFiles(look).forEach(function (n) {
        var src = T.hairs[n]; if (!src) return;
        src.then(function (sc) {
          if (p._dead || my !== p._upg) return;
          var w = new THREE.Group(); w.matrixAutoUpdate = false; w.matrix.copy(inv);
          var hs = sc.clone(); hs.traverse(function (o) { if (o.isMesh) o.material = hairMat(hairHex); });
          w.add(hs); head.add(w);
        });
      });
      // les boîtes disparaissent (on garde l'étiquette et la bulle, qui sont des sprites)
      g.children.forEach(function (c) { if (!c.isSprite && c !== (p._rig && p._rig.root)) c.visible = false; });
      g.add(root);

      var mixer = new THREE.AnimationMixer(root), acts = {};
      Object.keys(T.clips).forEach(function (n) {
        var a = mixer.clipAction(T.clips[n]);
        if (/^Jump_(Start|Land)$/.test(n)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        acts[n] = a;
      });
      acts.Idle_Calme = mixer.clipAction(idleClip(root));
      var rig = p._rig = { root: root, mixer: mixer, acts: acts, cur: null, mats: mats, lastT: 0, heldK: 0, heldWrap: null, heldId: '', emoPlaying: '', look: look };
      play(rig, 'Idle_Calme', 1, 0);
      if (p.seated) { play(rig, 'Sitting_Idle_Loop', 1, 0); applySit(p); }
      if (p.heldWanted) { var hw = p.heldWanted; p.heldWanted = ''; p.setHeld(hw); }
    });
  }

  function applySit(p) { var s = p.sit || SIT_DEFAULT; p.group.position.y = s.y; if (p._rig) p._rig.root.position.z = s.z || 0; }

  function play(rig, name, ts, fade) {
    var a = rig.acts[name]; if (!a) return;
    rig.root.position.y = name === 'Idle_Calme' ? 0.01 : FOOT_Y;
    if (rig.cur === a) { a.setEffectiveTimeScale(ts); return; }
    a.reset(); a.enabled = true; a.setEffectiveTimeScale(ts); a.setEffectiveWeight(1); a.play();
    if (rig.cur && fade > 0) rig.cur.crossFadeTo(a, fade, false); else if (rig.cur) rig.cur.stop();
    rig.cur = a;
  }
  // fait avancer les animations une seule fois par image (walk, stopWalk, playEmote et applyHold peuvent tous être appelés)
  function tick(rig, dt) {
    var now = performance.now();
    if (now - rig.lastT < 0.5) return;
    rig.lastT = now; rig.mixer.update(Math.min(dt, 0.1));
  }

  F.createPlayer = function (name, avatar, lookIn) {
    var p = F.createPerson(name, avatar);
    var walk0 = p.walk, stop0 = p.stopWalk, seat0 = p.setSeated, start0 = p.startEmote, clear0 = p.clearEmote, play0 = p.playEmote, hold0 = p.applyHold, held0 = p.setHeld, dispose0 = p.dispose;
    var look = parseLook(lookIn) || lookFromName(name);
    p._rig = null; p._dead = false; p.heldWanted = ''; p.sit = null; p.look = look;

    p.walk = function (dt, speed) {
      var r = p._rig; if (!r) { walk0.call(p, dt, speed); return; }
      if (p.seated) return;
      if (p.group.position.y > 0.06) play(r, 'Jump_Loop', 1, 0.12);
      else if (speed > 4.4) play(r, 'Sprint_Loop', Math.min(1.3, speed / 5.8), 0.18);
      else if (speed > 2.2) play(r, 'Jog_Fwd_Loop', Math.min(1.3, speed / 3.4), 0.18);
      else play(r, 'Walk_Loop', Math.max(0.5, Math.min(1.4, speed / 1.5)), 0.18);
      tick(r, dt);
    };
    p.stopWalk = function () {
      var r = p._rig; if (!r) { stop0.call(p); return; }
      if (!p.seated) { if (p.group.position.y > 0.06) play(r, 'Jump_Loop', 1, 0.12); else play(r, 'Idle_Calme', 1, 0.3); }
      tick(r, 1 / 60);
    };
    p.setSeated = function (on, spec) {
      var r = p._rig;
      if (spec) p.sit = spec;
      if (!r) { seat0.call(p, on); return; }
      if (on === p.seated) { if (on && spec) applySit(p); return; }
      p.seated = on;
      if (on) applySit(p); else { p.group.position.y = 0; r.root.position.z = 0; }
      play(r, on ? 'Sitting_Idle_Loop' : 'Idle_Calme', 1, 0.25);
    };
    p.startEmote = function (id) {
      var r = p._rig;
      if (!r) { start0.call(p, id); return; }
      p.emoT = 0; if (F.emoteById && F.emoteById(id)) p.emoId = id; else p.clearEmote();
      r.emoPlaying = '';
    };
    p.clearEmote = function () {
      var r = p._rig;
      if (!r) { clear0.call(p); return; }
      if (!p.emoId && !p.emoYaw && !p.group.rotation.x && !p.group.rotation.z) return;
      p.emoId = ''; p.emoT = 0; r.emoPlaying = '';
      p.group.rotation.y -= p.emoYaw; p.emoYaw = 0; p.group.rotation.x = 0; p.group.rotation.z = 0;
      play(r, 'Idle_Calme', 1, 0.25);
    };
    p.playEmote = function (dt) {
      var r = p._rig;
      if (!r) return play0.call(p, dt);
      var e = p.emoId && F.emoteById ? F.emoteById(p.emoId) : null;
      if (!e || p.seated) return false;
      p.emoT += dt;
      if (e.dur && p.emoT > e.dur) { p.clearEmote(); return false; }
      var po = e.pose(p.emoT, e.dur), k = ease01(p.emoT / 0.25), g = p.group;
      if (r.emoPlaying !== p.emoId) { var ec = EMOTE_CLIP[p.emoId] || ['Dance_Loop', 1]; play(r, ec[0], ec[1], 0.25); r.emoPlaying = p.emoId; }
      g.position.y += (po.y || 0) * k;
      g.rotation.y += (po.yaw || 0) * k - p.emoYaw; p.emoYaw = (po.yaw || 0) * k;
      g.rotation.x = (po.lx || 0) * k * 0.6; g.rotation.z = (po.lz || 0) * k * 0.6;
      tick(r, dt);
      return true;
    };
    p.setHeld = function (id) {
      var r = p._rig; p.heldWanted = id || '';
      if (!r) { held0.call(p, id); return; }
      id = id && F.HELD && F.HELD[id] ? id : '';
      if (id === r.heldId) return;
      r.heldId = id; p.held = id;
      var hand = r.root.getObjectByName('hand_r');
      if (r.heldWrap && hand) { hand.remove(r.heldWrap); r.heldWrap = null; }
      if (id && F.buildHeld && hand) {
        var it = F.buildHeld(id);
        if (it) { var wr = new THREE.Group(); wr.add(it); it.rotation.set(0, Math.PI, 0); wr.position.set(0.02, 0.07, 0.03); wr.visible = false; hand.add(wr); r.heldWrap = wr; }
      }
    };
    p.applyHold = function (dt) {
      var r = p._rig;
      if (!r) { hold0.call(p, dt); return; }
      tick(r, dt);
      var want = r.heldId && !p.seated && !p.emoId ? 1 : 0;
      r.heldK += (want - r.heldK) * Math.min(1, dt * 9);
      if (r.heldK < 0.005) { r.heldK = 0; if (r.heldWrap) r.heldWrap.visible = false; return; }
      var ua = r.root.getObjectByName('upperarm_r'), la = r.root.getObjectByName('lowerarm_r');
      if (ua && la) {                                                    // le bras droit se lève devant le corps avec l'objet
        ua.rotateZ(-0.7 * r.heldK); ua.rotateY(0.5 * r.heldK); la.rotateY(1.0 * r.heldK);
      }
      if (r.heldWrap) r.heldWrap.visible = r.heldK > 0.4;
    };
    // change d'apparence (le joueur en face a un autre code que prévu)
    p.setLook = function (l) {
      l = parseLook(l); if (!l || lookCode(l) === lookCode(p.look)) return;
      p.look = l; ensure(l, function () { upgrade(p, l); });
    };
    p.dispose = function () {
      p._dead = true;
      var r = p._rig; if (r) { r.mixer.stopAllAction(); r.mats.forEach(function (m) { m.dispose(); }); }
      dispose0.call(p);
    };
    ensure(look, function () { upgrade(p, look); });
    return p;
  };
  /* ---------- ta main en vue à la première personne : le bras droit du vrai personnage (seulement les triangles du bras) ---------- */
  var ARM_RE = /(upperarm_r|lowerarm_r|hand_r|index_.._r|middle_.._r|ring_.._r|pinky_.._r|thumb_.._r)$/;
  var ARM_REST = [1.254, -0.178, 1.022, 2.022, 0.712], ARM_HOLD = [1.8, -0.188, 1.081, 1.304, 0.988];   // angles du bras au repos et quand on tient un objet
  var SH_REST = [0.2, -0.16, -0.05], SH_HOLD = [0.17, -0.19, -0.07];                                          // position de l'épaule dans le repère de la caméra
  T.armGeo = {};
  function armGeometry(sx, body) {
    if (T.armGeo[sx]) return T.armGeo[sx];
    var g = body.geometry, bones = body.skeleton.bones, isArm = bones.map(function (b) { return ARM_RE.test(b.name); });
    var ji = g.attributes.skinIndex.array, wi = g.attributes.skinWeight.array, nv = g.attributes.position.count, dom = new Array(nv), v, k, idx = g.index.array, out = [], t;
    for (v = 0; v < nv; v++) { var best = 0, bw = -1; for (k = 0; k < 4; k++) if (wi[v * 4 + k] > bw) { bw = wi[v * 4 + k]; best = ji[v * 4 + k]; } dom[v] = isArm[best]; }
    for (t = 0; t < idx.length; t += 3) if (dom[idx[t]] && dom[idx[t + 1]] && dom[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
    var ag = new THREE.BufferGeometry(); for (var a in g.attributes) ag.setAttribute(a, g.attributes[a]); ag.setIndex(out);
    return (T.armGeo[sx] = ag);
  }
  F.persona.createViewArm = function (lookIn) {
    var look = parseLook(lookIn) || lookFromName(F.me ? F.me() : ''), va = { group: new THREE.Group(), ready: false, look: lookCode(look), _id: 0 };
    var parts = null, ax = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, tmpV = new THREE.Vector3(), eq = new THREE.Quaternion();
    function build(l) {
      var my = ++va._id, sx = l.sex === 'f' ? 'femme' : 'homme';
      ensure(l, function () {
        T.bodies[sx].then(function (tpl) {
          if (my !== va._id) return;
          var go = function (skinTex) {
            if (my !== va._id) return;
            if (parts) { va.group.remove(parts.root); parts.mat.dispose(); }
            var root = THREE.SkeletonUtils.clone(tpl), mesh = null;
            root.traverse(function (o) { if (!o.isSkinnedMesh) return; if (/^SuperHero_|^Superhero_/.test(o.name)) mesh = o; else o.visible = false; });
            mesh.geometry = armGeometry(sx, mesh); mesh.frustumCulled = false; mesh.material = mesh.material.clone();
            if (skinTex) { mesh.material.map = skinTex; mesh.material.needsUpdate = true; }
            var rest = {}; ['upperarm_r', 'lowerarm_r', 'hand_r'].forEach(function (n) { var b = root.getObjectByName(n); rest[n] = { b: b, q: b.quaternion.clone() }; });
            root.rotation.y = Math.PI; va.group.add(root);
            parts = { root: root, rest: rest, mat: mesh.material, hand: root.getObjectByName('hand_r'), sh: root.getObjectByName('upperarm_r') };
            va.ready = true;
          };
          if (l.tone === 1) T.skins[sx].then(go); else go(null);
        });
      });
    }
    va.setLook = function (l) { l = parseLook(l); if (!l || lookCode(l) === va.look) return; va.look = lookCode(l); va.ready = false; build(l); };
    // k : 0 = main au repos, 1 = objet en main ; dx, dy : balancement de la marche
    va.update = function (k, dx, dy) {
      if (!parts) return;
      var i, P = [], r = parts.rest;
      for (i = 0; i < 5; i++) P[i] = ARM_REST[i] + (ARM_HOLD[i] - ARM_REST[i]) * k;
      // mêmes rotations que celles trouvées à l'essai : épaule (z, y, x) puis avant-bras (y, z), appliquées à droite de la pose de repos
      function app(rr, list) { rr.b.quaternion.copy(rr.q); list.forEach(function (it) { eq.setFromAxisAngle(ax[it[0]], it[1]); rr.b.quaternion.multiply(eq); }); }
      app(r.upperarm_r, [['z', P[0]], ['y', P[1]], ['x', P[2]]]); app(r.lowerarm_r, [['y', P[3]], ['z', P[4]]]);
      parts.root.position.set(0, 0, 0); parts.root.updateMatrixWorld(true);
      parts.sh.getWorldPosition(tmpV); parts.root.worldToLocal(tmpV);        // épaule dans le repère du corps (indépendant de la caméra)
      var sx0 = SH_REST[0] + (SH_HOLD[0] - SH_REST[0]) * k, sy0 = SH_REST[1] + (SH_HOLD[1] - SH_REST[1]) * k, sz0 = SH_REST[2] + (SH_HOLD[2] - SH_REST[2]) * k;
      parts.root.position.set(sx0 + dx + tmpV.x, sy0 + dy - tmpV.y, sz0 + tmpV.z);   // le corps est tourné d'un demi-tour : x et z changent de signe
      parts.root.updateMatrixWorld(true);
    };
    va.handPos = function (out) { if (parts) { parts.hand.getWorldPosition(out); va.group.worldToLocal(out); } return out; };   // dans le repère du groupe (la caméra)
    build(look);
    return va;
  };
})();

