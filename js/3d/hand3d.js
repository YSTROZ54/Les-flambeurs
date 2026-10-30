/* =====================================================================
   hand3d.js — La main du joueur et l'objet qu'il tient (monde 3D, Three.js r128)
   ---------------------------------------------------------------------
   - F.buildHeld(id) : fabrique l'objet tenu (« phone », « card »), tourné écran vers +z. Sert à la main du personnage (f3d-core.js) et à la vue à la première personne.
   - F.createViewModel(name) : ta main en vue à la première personne, en bas à droite de l'écran, de la couleur de ton skin. Elle respire, balance en marchant,
     se lève et se referme quand tu prends un objet (téléphone, carte à gratter…) et s'abaisse quand tu ne tiens rien.
     Elle est dessinée dans une 2e scène, après la 3D du casino (profondeur effacée), pour ne jamais traverser un mur.
   Ce que tu tiens (world.setHeld) part avec ta position : les autres joueurs voient ton personnage lever le bras avec l'objet, ou le laisser baisser (voir world3d.js).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F) return;

  F.HELD = { phone: 1, card: 1 };                                      // objets qu'on peut avoir en main

  var cache = {};
  function geoOf(k, make) { return cache[k] || (cache[k] = make()); }
  function mat(c) { var k = 'm' + c; return cache[k] || (cache[k] = new THREE.MeshLambertMaterial({ color: c })); }
  function basic(c) { var k = 'b' + c; return cache[k] || (cache[k] = new THREE.MeshBasicMaterial({ color: c })); }

  function screenTex() {
    return cache.screenTex || (cache.screenTex = (function () {
      var c = F.mkCanvas(64, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#43102a'); g.addColorStop(1, '#0a0614');
      x.fillStyle = g; x.fillRect(0, 0, 64, 128);
      x.fillStyle = '#f59e0b'; x.beginPath(); x.arc(32, 52, 15, 0, Math.PI * 2); x.fill();     // petite flamme du casino
      x.fillStyle = '#fef3c7'; x.fillRect(14, 84, 36, 6); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(18, 98, 28, 5);
      return F.mkTex(c);
    })());
  }

  // objet tenu : l'écran / la face regarde vers +z, centré à l'origine
  F.buildHeld = function (id) {
    var g = new THREE.Group(), m;
    if (id === 'phone') {
      m = new THREE.Mesh(geoOf('phoneBody', function () { return new THREE.BoxGeometry(0.078, 0.155, 0.012); }), mat(0x15131c)); g.add(m);
      m = new THREE.Mesh(geoOf('phoneScr', function () { return new THREE.PlaneGeometry(0.068, 0.142); }), cache.scrMat || (cache.scrMat = new THREE.MeshBasicMaterial({ map: screenTex() })));
      m.position.z = 0.0066; g.add(m);
    } else if (id === 'card') {
      m = new THREE.Mesh(geoOf('cardBody', function () { return new THREE.BoxGeometry(0.1, 0.14, 0.005); }), mat(0xf2c14e)); g.add(m);
      m = new THREE.Mesh(geoOf('cardPatch', function () { return new THREE.PlaneGeometry(0.07, 0.05); }), mat(0xc4c8d0));
      m.position.set(0, -0.012, 0.0028); g.add(m);
    } else return null;
    return g;
  };

  F.personColors = function (name) { return F.personColorsOf ? F.personColorsOf(String(name || '')) : { skin: 0xe0ac82, shirt: 0x7c1d2e }; };

  /* ---------- ta main, vue à la première personne ---------- */
  F.createViewModel = function (name) {
    var scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    var sun = new THREE.DirectionalLight(0xfff3dc, 0.55); sun.position.set(-0.4, 1, 0.8); scene.add(sun);
    var root = new THREE.Group(); root.matrixAutoUpdate = false; scene.add(root);
    var arm = new THREE.Group(); arm.rotation.order = 'YXZ'; root.add(arm);          // l'épaule est hors de l'écran, l'avant-bras part vers -z
    var cols = F.personColors(name), skin = new THREE.MeshLambertMaterial({ color: cols.skin }), shirt = new THREE.MeshLambertMaterial({ color: cols.shirt });
    function box(w, h, d, mt, parent, x, y, z) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.position.set(x, y, z); parent.add(b); return b; }
    var sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.5, 12), shirt); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = -0.25; arm.add(sleeve);
    var wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), skin); wrist.rotation.x = Math.PI / 2; wrist.position.z = -0.52; arm.add(wrist);
    var hand = new THREE.Group(); hand.position.z = -0.55; arm.add(hand);
    box(0.088, 0.034, 0.09, skin, hand, 0, 0, -0.045);                  // paume
    var fingers = [];
    [-0.033, -0.011, 0.011, 0.033].forEach(function (fx, i) {
      var piv = new THREE.Group(); piv.position.set(fx, 0, -0.092); hand.add(piv);
      box(0.02, 0.022, 0.034 + (i === 1 || i === 2 ? 0.006 : 0), skin, piv, 0, 0, -0.02 - (i === 1 || i === 2 ? 0.003 : 0));
      var tip = new THREE.Group(); tip.position.z = -0.04; piv.add(tip); box(0.018, 0.02, 0.03, skin, tip, 0, 0, -0.012);
      fingers.push({ piv: piv, tip: tip });
    });
    var thumb = new THREE.Group(); thumb.position.set(-0.05, 0.004, -0.03); thumb.rotation.y = 0.5; hand.add(thumb);
    box(0.026, 0.024, 0.055, skin, thumb, 0, 0, -0.025);
    var itemSlot = new THREE.Group(); itemSlot.position.set(0, 0.075, -0.07); hand.add(itemSlot);   // l'objet tenu, posé au-dessus de la paume

    var held = '', itemId = '', item = null, k = 0, tt = 0, bob = 0, tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.22), curName = String(name || '');
    // le vrai bras du personnage (persona3d.js) remplace la main en boîtes dès qu'il est chargé ; les boîtes servent de secours
    var va = F.persona && F.persona.createViewArm ? F.persona.createViewArm(F.myLookCode ? F.myLookCode() : '') : null, vtmp = new THREE.Vector3(), vup = new THREE.Vector3(), vnr = new THREE.Vector3(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vm4 = new THREE.Matrix4();
    if (va) root.add(va.group);
    function setItem(id) {
      if (id === itemId) return;
      itemId = id; if (item) { if (item.parent) item.parent.remove(item); item = null; }
      if (id && F.buildHeld) { item = F.buildHeld(id); if (item) itemSlot.add(item); }
    }
    return {
      group: { visible: true }, arm: va,
      update: function (dt, o) {
        if (o.name !== curName) { curName = o.name; var c = F.personColors(curName); skin.color.setHex(c.skin); shirt.color.setHex(c.shirt); }
        held = o.held || ''; if (held) setItem(held);
        k += ((held ? 1 : 0) - k) * Math.min(1, dt * 8);
        if (!held && k < 0.02 && item) setItem('');
        tt += dt; bob += dt * (2 + o.speed * 2.4);
        var walk = Math.min(1, o.speed / 3), sway = Math.sin(tt * 1.5) * 0.004, step = Math.sin(bob * 2.2) * 0.011 * walk, side = Math.cos(bob * 1.1) * 0.008 * walk;
        var jump = o.air ? 0.03 : 0;
        if (va && va.ready) {
          arm.visible = false;
          if (F.myLookCode) va.setLook(F.myLookCode());
          va.update(k, side, sway + step * (1 - 0.5 * k) - jump);
          if (item) {                                                    // l'objet est tenu devant la paume (qui regarde vers toi), doigts vers le haut
            if (item.parent !== va.group) { if (item.parent) item.parent.remove(item); va.group.add(item); }
            va.handFrame(vtmp, vup, vnr);
            item.position.copy(vtmp).addScaledVector(vup, 0.035).addScaledVector(vnr, 0.042); item.scale.setScalar(0.9);
            vx.crossVectors(vup, vnr).normalize(); vy.crossVectors(vnr, vx);
            vm4.makeBasis(vx, vy, vnr); item.quaternion.setFromRotationMatrix(vm4); item.visible = k > 0.25;
          }
          return;
        }
        arm.visible = true;
        // repos : la main dépasse en bas à droite ; objet en main : elle se lève au centre, doigts refermés
        arm.position.set(0.28 - 0.1 * k + side, -0.47 + 0.05 * k + sway + step * (1 - 0.5 * k) - jump, -0.12 - 0.08 * k);
        arm.rotation.x = 0.5 + 0.28 * k; arm.rotation.y = 0.04 + 0.25 * k; arm.rotation.z = -0.1 * (1 - k);
        fingers.forEach(function (f, i) { f.piv.rotation.x = -(0.25 + 0.95 * k) + Math.sin(tt * 1.3 + i) * 0.02; f.tip.rotation.x = -(0.2 + 0.7 * k); });
        thumb.rotation.x = -0.2 * k; thumb.rotation.y = 0.5 - 0.35 * k;
        if (item) {                                                      // l'objet reste debout, face à la caméra, quelle que soit l'inclinaison du bras
          item.visible = k > 0.25;
          item.quaternion.copy(arm.quaternion).invert().multiply(tiltQ);
        }
      },
      render: function (renderer, camera) {
        camera.updateMatrixWorld();
        root.matrix.copy(camera.matrixWorld); root.matrixWorldNeedsUpdate = true;
        renderer.render(scene, camera);
      }
    };
  };
})();
