/* =====================================================================
   persona3d.js — Les vrais personnages 3D des joueurs (monde 3D, PC)
   ---------------------------------------------------------------------
   Remplace les petits personnages en boîtes (f3d-core.js) par un corps animé « Universal Base Characters » + « Universal Animation
   Library » (Quaternius, licence CC0). Fichiers allégés dans assets/3d/persona/ (≈ 1,9 Mo en tout) :
     personnage.glb  le corps (squelette de 65 os), les yeux, les sourcils
     animations.glb  14 animations (marche, course, saut, assis, danse…), même squelette
     mask.png        zones du corps : rouge = haut, vert = pantalon, bleu = chaussures
     hair_*.glb      4 coiffures/barbes, collées à l'os de la tête
   Les habits ne sont pas dans le modèle : un petit shader repeint les zones du masque avec les couleurs du joueur (haut, pantalon,
   chaussures) en gardant les ombres du corps, et change la teinte de la peau. Les couleurs viennent du pseudo (comme avant).
   F3D.createPlayer(nom, avatar) renvoie le même objet que F3D.createPerson (mêmes méthodes : walk, setSeated, startEmote…) :
   les boîtes restent le temps du chargement, ou si le chargement échoue. Les vendeurs des boutiques gardent leurs boîtes.
   Fichiers liés : f3d-core.js (l'objet de base), world3d.js (joueurs), emotes3d.js (catalogue des danses).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.createPerson || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;

  var BASE = 'assets/3d/persona/';
  var SKIN_TONES = [0xf1c9a5, 0xe0ac82, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
  var SHIRTS = [0x7c1d2e, 0x1f4e79, 0x2d6a4f, 0x6b3fa0, 0xb8860b, 0x374151, 0xa13d63, 0x0f766e];
  var PANTS = [0x171a24, 0x23283a, 0x3a2f26, 0x1f3a52, 0x2c2c2c];
  var SHOES = [0x111111, 0x2b1d14, 0xe8e8e8];
  var HAIRS = [0x1a1210, 0x3b2314, 0x6b4423, 0xb8863b, 0x222222, 0x8a2b1c];
  var HAIR_STYLES = ['', 'hair_buzzed', 'hair_simpleparted', 'hair_long', 'hair_simpleparted+hair_beard', 'hair_buzzed+hair_beard'];

  // danse / emote -> animation et vitesse (la bibliothèque n'a qu'une danse : on la varie par la vitesse et par les mouvements du corps entier de emotes3d.js)
  var EMOTE_CLIP = {
    disco: ['Dance_Loop', 1], robot: ['Dance_Loop', 0.55], floss: ['Dance_Loop', 1.5], twist: ['Dance_Loop', 1.25], poulet: ['Dance_Loop', 1.7],
    vague: ['Dance_Loop', 0.8], joie: ['Dance_Loop', 1.9], charleston: ['Dance_Loop', 1.15],
    salut: ['Interact', 1], applaudir: ['Hit_Chest', 2.2], victoire: ['Dance_Loop', 1.8], coeur: ['Idle_Talking_Loop', 1.2], epaules: ['Idle_Talking_Loop', 1],
    reverence: ['Interact', 0.8], rire: ['Hit_Chest', 2.5], pointer: ['Spell_Simple_Shoot', 0.6]
  };
  var SIT_Y = 0.1;           // le corps assis est déjà abaissé par l'animation : on le pose sur le siège

  function nameHash(n) { var h = 7; n = String(n || ''); for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return h; }
  function ease01(v) { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }

  /* ---------- chargement (une seule fois, au premier joueur) ---------- */
  var T = { state: 'idle', waiters: [], char: null, clips: {}, hairs: {}, mask: null, baseAvg: [0.7, 0.5, 0.38], invHead: null, hairMats: {} };
  function load(url) { return new Promise(function (ok, ko) { new THREE.GLTFLoader().load(BASE + url, ok, undefined, ko); }); }
  function ensure(cb) {
    if (T.state === 'ready') { cb(); return; }
    if (T.state === 'failed') return;
    T.waiters.push(cb);
    if (T.state === 'loading') return;
    T.state = 'loading';
    var names = ['hair_buzzed', 'hair_simpleparted', 'hair_long', 'hair_beard'];
    Promise.all([load('personnage.glb'), load('animations.glb')].concat(names.map(function (n) { return load(n + '.glb'); }))).then(function (r) {
      T.char = r[0].scene;
      r[1].animations.forEach(function (c) { T.clips[c.name] = c; });
      names.forEach(function (n, i) { T.hairs[n] = r[2 + i].scene; });
      T.char.updateMatrixWorld(true);
      var head = T.char.getObjectByName('Head');
      T.invHead = new THREE.Matrix4().copy(head.matrixWorld).invert();
      var body = null; T.char.traverse(function (o) { if (o.isSkinnedMesh && o.name === 'SuperHero_Male') body = o; });
      if (body && body.material.map && body.material.map.image) {            // teinte moyenne du corps, pour changer la couleur de peau
        try {
          var c = document.createElement('canvas'); c.width = c.height = 8; var x = c.getContext('2d');
          x.drawImage(body.material.map.image, 0, 0, 8, 8); var d = x.getImageData(0, 0, 8, 8).data, s = [0, 0, 0], k;
          for (k = 0; k < 64; k++) { s[0] += d[k * 4]; s[1] += d[k * 4 + 1]; s[2] += d[k * 4 + 2]; }
          T.baseAvg = [s[0] / 64 / 255, s[1] / 64 / 255, s[2] / 64 / 255];
        } catch (e) { /* on garde la valeur par défaut */ }
      }
      new THREE.TextureLoader().load(BASE + 'mask.png', function (tx) {
        tx.flipY = false; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter; tx.magFilter = THREE.LinearFilter;
        T.mask = tx; T.state = 'ready';
        var w = T.waiters; T.waiters = []; w.forEach(function (f) { try { f(); } catch (e) { if (window.console) console.warn('[persona]', e); } });
      }, undefined, function () { T.state = 'failed'; });
    }).catch(function (e) { T.state = 'failed'; if (window.console) console.warn('[persona] chargement impossible, les petits personnages restent', e); });
  }

  function hairMat(hex) { return T.hairMats[hex] || (T.hairMats[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, side: THREE.DoubleSide })); }

  // repeint le corps : zones du masque aux couleurs du joueur, peau teintée, ombres du corps conservées
  function dressMaterial(mat, skin, shirt, pants, shoes) {
    var m = mat.clone(), sk = new THREE.Color(skin), st = new THREE.Color(shirt), pn = new THREE.Color(pants), sh = new THREE.Color(shoes);
    var f = [Math.min(1.8, Math.max(0.35, sk.r / T.baseAvg[0])), Math.min(1.8, Math.max(0.35, sk.g / T.baseAvg[1])), Math.min(1.8, Math.max(0.35, sk.b / T.baseAvg[2]))];
    m.onBeforeCompile = function (sd) {
      sd.uniforms.uMask = { value: T.mask }; sd.uniforms.uSkin = { value: new THREE.Vector3(f[0], f[1], f[2]) };
      sd.uniforms.uShirt = { value: st }; sd.uniforms.uPants = { value: pn }; sd.uniforms.uShoes = { value: sh };
      sd.fragmentShader = 'uniform sampler2D uMask; uniform vec3 uSkin; uniform vec3 uShirt; uniform vec3 uPants; uniform vec3 uShoes;\n' + sd.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n' +
        'vec3 zm = texture2D( uMask, vUv ).rgb;\n' +
        'float lum = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) );\n' +
        'vec3 cloth = ( uShirt * zm.r + uPants * zm.g + uShoes * zm.b ) * ( 0.55 + lum * 1.6 );\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb * uSkin, cloth, clamp( zm.r + zm.g + zm.b, 0.0, 1.0 ) );');
    };
    m.customProgramCacheKey = function () { return 'persona-dress'; };
    return m;
  }

  /* ---------- le personnage animé, branché sur l'objet de createPerson ---------- */
  function upgrade(p, name) {
    if (p._dead || p._rig) return;
    var h = nameHash(name), g = p.group, root = THREE.SkeletonUtils.clone(T.char), mats = [];
    var skin = SKIN_TONES[h % SKIN_TONES.length], shirt = SHIRTS[(h >> 3) % SHIRTS.length], hairHex = HAIRS[(h >> 6) % HAIRS.length];
    var pants = PANTS[(h >> 11) % PANTS.length], shoes = SHOES[(h >> 14) % SHOES.length], style = HAIR_STYLES[(h >> 9) % HAIR_STYLES.length];
    root.traverse(function (o) {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false;
      if (o.name === 'SuperHero_Male') { o.material = dressMaterial(o.material, skin, shirt, pants, shoes); mats.push(o.material); }
      else if (o.name === 'Eyebrows') { o.material = o.material.clone(); o.material.color.setHex(hairHex); mats.push(o.material); }
    });
    var head = root.getObjectByName('Head');
    if (style) style.split('+').forEach(function (hn) {
      var src = T.hairs[hn]; if (!src || !head) return;
      var w = new THREE.Group(); w.matrixAutoUpdate = false; w.matrix.copy(T.invHead);
      var hs = src.clone(); hs.traverse(function (o) { if (o.isMesh) o.material = hairMat(hn === 'hair_beard' ? hairHex : hairHex); });
      w.add(hs); head.add(w);
    });
    // les boîtes disparaissent (on garde l'étiquette et la bulle, qui sont des sprites)
    g.children.forEach(function (c) { if (!c.isSprite) c.visible = false; });
    g.add(root);

    var mixer = new THREE.AnimationMixer(root), acts = {};
    Object.keys(T.clips).forEach(function (n) {
      var a = mixer.clipAction(T.clips[n]);
      if (/^Jump_(Start|Land)$/.test(n)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      acts[n] = a;
    });
    var rig = p._rig = { root: root, mixer: mixer, acts: acts, cur: null, mats: mats, lastT: 0, heldK: 0, heldWrap: null, heldId: '', air: false, emoPlaying: '' };
    play(rig, 'Idle_Loop', 1, 0);
    if (p.seated) { play(rig, 'Sitting_Idle_Loop', 1, 0); g.position.y = SIT_Y; }
    if (p.heldWanted) p.setHeld(p.heldWanted);
  }

  function play(rig, name, ts, fade) {
    var a = rig.acts[name]; if (!a) return;
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

  F.createPlayer = function (name, avatar) {
    var p = F.createPerson(name, avatar);
    var walk0 = p.walk, stop0 = p.stopWalk, seat0 = p.setSeated, start0 = p.startEmote, clear0 = p.clearEmote, play0 = p.playEmote, hold0 = p.applyHold, held0 = p.setHeld, dispose0 = p.dispose;
    p._rig = null; p._dead = false; p.heldWanted = '';

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
      if (!p.seated) { if (p.group.position.y > 0.06) play(r, 'Jump_Loop', 1, 0.12); else play(r, 'Idle_Loop', 1, 0.25); }
      tick(r, 1 / 60);
    };
    p.setSeated = function (on) {
      var r = p._rig;
      if (!r) { seat0.call(p, on); return; }
      if (on === p.seated) return; p.seated = on;
      p.group.position.y = on ? SIT_Y : 0;
      play(r, on ? 'Sitting_Idle_Loop' : 'Idle_Loop', 1, 0.25);
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
      play(r, 'Idle_Loop', 1, 0.25);
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
        if (it) { var wr = new THREE.Group(); wr.add(it); it.rotation.set(0, Math.PI, 0); wr.position.set(0.02, 0.07, 0.03); wr.scale.setScalar(1); wr.visible = false; hand.add(wr); r.heldWrap = wr; }
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
        ua.rotateY(0.5 * r.heldK); la.rotateZ(-1.35 * r.heldK);
      }
      if (r.heldWrap) r.heldWrap.visible = r.heldK > 0.4;
    };
    p.dispose = function () {
      p._dead = true;
      var r = p._rig; if (r) { r.mixer.stopAllAction(); r.mats.forEach(function (m) { m.dispose(); }); }
      dispose0.call(p);
    };
    ensure(function () { upgrade(p, name); });
    return p;
  };
})();
