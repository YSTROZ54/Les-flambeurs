/* =====================================================================
   kart-envs.js — les deux circuits de JOUR de la course : « Rallye du désert » et « Circuit de la prairie »
   ---------------------------------------------------------------------
   Le circuit de nuit (ville) est dans kart-decor.js. Ici : textures de route et de barrières, ciel, montagnes lointaines, sol, et un décor fait de
   vrais modèles 3D libres de droits (CC0) : Kenney « Racing Kit » (tribunes, stands, barrières, arbres, panneaux, drapeaux) et rochers du « Car Kit »,
   dans assets/kart/. Chaque modèle est posé en « instances » (un seul appel de dessin pour des centaines d'arbres, de rochers ou de barrières).
   F3D.kartEnv.textures(id, mkCanvas, rng)  → { road, wall, curbA, curbB } (canevas)
   F3D.kartEnv.build(id, groupe, { TRK, KS, mkCanvas, mkTex, rng }) → { fog, bg, hemi, sun, update(dt) }
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F) return;
  var TAU = Math.PI * 2, YAX = new THREE.Vector3(0, 1, 0);

  /* ---------- modèles : chargés une fois, normalisés à la taille voulue, posés en instances ---------- */
  var cache = {}, waiting = {};
  function loadProp(name, cb) {
    if (cache[name]) { cb(cache[name]); return; }
    (waiting[name] = waiting[name] || []).push(cb);
    if (waiting[name].length > 1 || !THREE.GLTFLoader) return;
    new THREE.GLTFLoader().load('assets/kart/' + name + '.glb?v=1', function (gl) {
      var sc = gl.scene, parts = []; sc.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(sc);
      sc.traverse(function (o) { if (o.isMesh && o.geometry) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); });
      cache[name] = { parts: parts, box: box }; var w = waiting[name]; waiting[name] = null; w.forEach(function (f) { try { f(cache[name]); } catch (e) { /* ok */ } });
    }, undefined, function () { waiting[name] = null; });
  }
  // list : [{ x, z, yaw, s, y }] ; opt : { h | w | l } = taille voulue en mètres
  function instances(g, name, list, opt) {
    if (!list.length) return;
    loadProp(name, function (P) {
      var size = new THREE.Vector3(), ctr = new THREE.Vector3(); P.box.getSize(size); P.box.getCenter(ctr);
      var k = opt.w ? opt.w / size.x : opt.h ? opt.h / size.y : opt.l / size.z;
      var norm = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -P.box.min.y, -ctr.z));
      P.parts.forEach(function (pt) {
        var im = new THREE.InstancedMesh(pt.geo, pt.mat, list.length), M = new THREE.Matrix4(), pm = new THREE.Matrix4().multiplyMatrices(norm, pt.m), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
        list.forEach(function (it, i) { q.setFromAxisAngle(YAX, it.yaw || 0); var s = it.s || 1; sc.set(s, s, s); v.set(it.x, it.y || 0, it.z); M.compose(v, q, sc); M.multiply(pm); im.setMatrixAt(i, M); });
        im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; g.add(im);
      });
    });
  }

  /* ---------- textures de route / barrières selon le circuit ---------- */
  function textures(id, mkCanvas, rng) {
    var rnd = rng(id === 'desert' ? 31 : 57), i, rc = mkCanvas(256, 512), rx = rc.getContext('2d'), wc = mkCanvas(512, 128), wx = wc.getContext('2d'), ca = mkCanvas(64, 64), cx = ca.getContext('2d');
    var base = id === 'desert' ? '#4a4540' : '#3b3f46';
    rx.fillStyle = base; rx.fillRect(0, 0, 256, 512);
    for (i = 0; i < 6000; i++) { rx.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (rnd() * 0.08) + ')'; rx.fillRect(rnd() * 256, rnd() * 512, 2, 2); }
    rx.fillStyle = 'rgba(255,255,255,0.92)'; rx.fillRect(6, 0, 5, 512); rx.fillRect(245, 0, 5, 512); rx.fillStyle = 'rgba(255,230,120,0.9)'; rx.fillRect(125, 0, 6, 128); rx.fillRect(125, 256, 6, 128);
    if (id === 'desert') { rx.fillStyle = 'rgba(210,170,110,0.18)'; for (i = 0; i < 40; i++) rx.fillRect(rnd() * 256, rnd() * 512, 30 + rnd() * 60, 3); }      // sable sur la piste
    var cols = id === 'desert' ? ['#ff8a1f', '#fff1d8'] : ['#2b6fe0', '#f5f5f5'];
    wx.fillStyle = '#e9e4da'; wx.fillRect(0, 0, 512, 128);
    cols.concat(cols).forEach(function (col, q) { wx.fillStyle = col; wx.fillRect(q * 128 + 3, 14, 122, 100); });
    wx.fillStyle = '#3a3630'; wx.fillRect(0, 0, 512, 10); wx.fillRect(0, 118, 512, 10);
    cx.fillStyle = id === 'desert' ? '#ff8a1f' : '#e62f2f'; cx.fillRect(0, 0, 64, 32); cx.fillStyle = '#f5f5f5'; cx.fillRect(0, 32, 64, 32);
    return { road: rc, wall: wc, curb: ca };
  }

  /* ---------- ciel, montagnes, sol ---------- */
  function skyTex(mkCanvas, stops) {
    var c = mkCanvas(64, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, 64, 256); return c;
  }
  function mountainRing(g, mkCanvas, rnd, cols, snow) {
    var c = mkCanvas(2048, 256), x = c.getContext('2d'), L, i;
    [[0.0, 150, 0.55], [1, 110, 0.9]].forEach(function (lay, li) {
      x.fillStyle = cols[li]; x.beginPath(); x.moveTo(0, 256);
      var h = 60 + li * 20; for (i = 0; i <= 64; i++) { var u = i / 64, hh = h + (Math.sin(u * 40 + li * 2) * 0.5 + Math.sin(u * 17 + li) * 0.5 + 1) * lay[1] * 0.45 * (0.6 + rnd() * 0.5); x.lineTo(u * 2048, 256 - hh); }
      x.lineTo(2048, 256); x.fill();
    });
    if (snow) { x.fillStyle = 'rgba(255,255,255,0.92)'; for (i = 0; i < 18; i++) { var px = rnd() * 2048, py = 256 - (150 + rnd() * 70); x.beginPath(); x.moveTo(px - 30, py + 40); x.lineTo(px, py); x.lineTo(px + 30, py + 40); x.fill(); } }
    var t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
    var m = new THREE.Mesh(new THREE.CylinderGeometry(850, 850, 260, 48, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }));
    m.position.set(60, 120, -80); g.add(m);
  }

  function along(TRK, s, off, out) {                         // point de la piste à l'abscisse s (en points) décalé de off mètres vers la droite
    var p = TRK.at(s, out || {}); p.px = p.x - p.tz * off; p.pz = p.z + p.tx * off; return p;
  }

  function build(id, g, C) {
    var TRK = C.TRK, KS = C.KS, N = TRK.N, DS = TRK.DS, rnd = C.rng(id === 'desert' ? 901 : 733), WALL = KS.WALL_OFF, mkCanvas = C.mkCanvas, mkTex = C.mkTex, i, k;
    var desert = id === 'desert', res = { upd: [] };

    // ciel
    var stops = desert ? [[0, '#3b7fd0'], [0.5, '#8fc4ee'], [0.78, '#f6dcae'], [1, '#e9c58f']] : [[0, '#3a86e0'], [0.5, '#9bd0f5'], [0.8, '#e6f3ff'], [1, '#cfe6d0']];
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), new THREE.MeshBasicMaterial({ map: mkTex(skyTex(mkCanvas, stops)), side: THREE.BackSide, depthWrite: false, fog: false })));
    var sunC = mkCanvas(128, 128), sx = sunC.getContext('2d'), sg = sx.createRadialGradient(64, 64, 4, 64, 64, 64); sg.addColorStop(0, 'rgba(255,255,235,1)'); sg.addColorStop(0.25, 'rgba(255,240,190,0.85)'); sg.addColorStop(1, 'rgba(255,220,150,0)'); sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
    var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(sunC), transparent: true, depthWrite: false, fog: false })); sun.scale.set(260, 260, 1); sun.position.set(-500, 520, -520); g.add(sun);
    mountainRing(g, mkCanvas, rnd, desert ? ['#c98650', '#a35f35'] : ['#7fa59a', '#4f7d62'], !desert);

    // sol
    var gc = mkCanvas(256, 256), gx = gc.getContext('2d'); gx.fillStyle = desert ? '#d9b172' : '#4f9a45'; gx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 2600; i++) { gx.fillStyle = desert ? (rnd() < 0.5 ? 'rgba(255,230,170,0.22)' : 'rgba(150,100,50,0.18)') : (rnd() < 0.5 ? 'rgba(160,220,110,0.2)' : 'rgba(20,80,30,0.2)'); gx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 5, 2 + rnd() * 5); }
    var gt = mkTex(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(60, 60); gt.anisotropy = 4;
    var gnd = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ map: gt })); gnd.rotation.x = -Math.PI / 2; gnd.position.set(60, -0.06, -80); g.add(gnd);

    // positions libres (loin de la piste)
    function farFromTrack(x, z, d) { return TRK.project(x, z).dist > d; }
    var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (k = 0; k < N; k++) { minx = Math.min(minx, TRK.PX[k]); maxx = Math.max(maxx, TRK.PX[k]); minz = Math.min(minz, TRK.PZ[k]); maxz = Math.max(maxz, TRK.PZ[k]); }
    function scatter(n, d0, d1, extra, mkItem) {
      var out = [], tries = 0;
      while (out.length < n && tries++ < n * 40) {
        var x = minx - extra + rnd() * (maxx - minx + 2 * extra), z = minz - extra + rnd() * (maxz - minz + 2 * extra), dd = TRK.project(x, z).dist;
        if (dd < d0 || dd > d1) continue; out.push(mkItem(x, z));
      }
      return out;
    }

    // barrières le long des deux murs (alternance de couleurs), un bloc tous les 4 m
    var bar0 = [], bar1 = [];
    for (k = 0; k < N; k += 2) [-1, 1].forEach(function (sd) {
      var p = along(TRK, k, sd * (WALL + 0.25)); (((k >> 1) % 2) ? bar0 : bar1).push({ x: p.px, z: p.pz, yaw: Math.PI / 2 - p.yaw });
    });
    instances(g, desert ? 'barrierRed' : 'barrierWhite', bar0, { h: 1.1 }); instances(g, desert ? 'barrierWhite' : 'barrierRed', bar1, { h: 1.1 });

    // tribunes, stands et banderoles autour de la ligne de départ (de chaque côté, tournées vers la piste)
    var st = [], tent = [], garage = [], flags = [], gs;
    [-1, 1].forEach(function (sd) {
      for (gs = -2; gs <= 2; gs++) {
        var p = along(TRK, gs * 7.2 + 2, sd * (WALL + 17)); st.push({ x: p.px, z: p.pz, yaw: Math.PI / 2 - p.yaw + (sd > 0 ? 0 : Math.PI) + Math.PI / 2 * 0 });
      }
      for (gs = -5; gs <= 5; gs += 2.5) { var p2 = along(TRK, gs * 8 + 2, sd * (WALL + 34)); tent.push({ x: p2.px, z: p2.pz, yaw: Math.PI / 2 - p2.yaw }); }
      for (gs = -7; gs <= 7; gs += 2) { var p3 = along(TRK, gs * 4 + 2, sd * (WALL + 3.2)); flags.push({ x: p3.px, z: p3.pz, yaw: Math.PI / 2 - p3.yaw }); }
    });
    instances(g, 'grandStandCovered', st, { w: 14 }); instances(g, 'tentLong', tent, { w: 10 });
    for (gs = 0; gs < 5; gs++) { var pg = along(TRK, N * (0.04 + gs * 0.012) , -(WALL + 14)); garage.push({ x: pg.px, z: pg.pz, yaw: Math.PI / 2 - pg.yaw + Math.PI }); }
    instances(g, 'pitsGarage', garage, { w: 11 });
    var banner = [], bs = [N * 0.02, N * 0.5];
    bs.forEach(function (s0) { [-1, 1].forEach(function (sd) { var p = along(TRK, s0, sd * (WALL + 2.5)); banner.push({ x: p.px, z: p.pz, yaw: Math.PI / 2 - p.yaw }); }); });
    instances(g, 'bannerTowerRed', banner, { h: 11 });
    instances(g, 'flagCheckers', [{ x: along(TRK, 0, WALL + 4).px, z: along(TRK, 0, WALL + 4).pz, yaw: 0 }, { x: along(TRK, 0, -(WALL + 4)).px, z: along(TRK, 0, -(WALL + 4)).pz, yaw: 0 }], { h: 8 });

    // panneaux publicitaires et pylônes dans les virages
    var bb = [];
    for (k = 12; k < N; k += 62) { var pb = along(TRK, k, (k % 2 ? 1 : -1) * (WALL + 9)); bb.push({ x: pb.px, z: pb.pz, yaw: Math.PI / 2 - pb.yaw + (k % 2 ? 0 : Math.PI) }); }
    instances(g, 'billboard', bb, { w: 11 });
    var py = [];
    for (k = 0; k < N; k += 5) { var a0 = TRK.at(k, {}).yaw, a1 = TRK.at(k + 12, {}).yaw, dh = Math.abs(KS.angDiff(a1, a0)); if (dh > 0.38) { var pp = along(TRK, k, (KS.angDiff(a1, a0) > 0 ? -1 : 1) * (KS.ROAD_HALF + KS.CURB_W + 0.4)); py.push({ x: pp.px, z: pp.pz, yaw: 0 }); } }
    instances(g, 'pylon', py, { h: 0.9 });

    // le paysage : rochers (désert) ou forêt (prairie)
    if (desert) {
      instances(g, 'rock-large', scatter(150, 24, 260, 260, function (x, z) { return { x: x, z: z, yaw: rnd() * TAU, s: 0.7 + rnd() * 1.3 }; }), { h: 9 });
      instances(g, 'rock-wide', scatter(90, 22, 240, 240, function (x, z) { return { x: x, z: z, yaw: rnd() * TAU, s: 0.7 + rnd() * 1.1 }; }), { w: 14 });
      instances(g, 'rock-small', scatter(160, 14, 140, 140, function (x, z) { return { x: x, z: z, yaw: rnd() * TAU, s: 0.6 + rnd() * 0.9 }; }), { h: 2.6 });
    } else {
      instances(g, 'treeLarge', scatter(420, 20, 300, 300, function (x, z) { return { x: x, z: z, yaw: rnd() * TAU, s: 0.8 + rnd() * 0.6 }; }), { h: 11 });
      instances(g, 'treeSmall', scatter(300, 15, 200, 200, function (x, z) { return { x: x, z: z, yaw: rnd() * TAU, s: 0.8 + rnd() * 0.6 }; }), { h: 6 });
      instances(g, 'rock-small', scatter(60, 14, 120, 120, function (x, z) { return { x: x, z: z, yaw: rnd() * TAU, s: 0.6 + rnd() * 0.8 }; }), { h: 2 });
    }

    res.fog = { color: desert ? 0xe6cfa0 : 0xcfe4f2, density: 0.0011 }; res.bg = desert ? 0xcfe2f2 : 0xbcdcf4;
    res.hemi = [desert ? 0xfff0d0 : 0xeaf4ff, desert ? 0xb99568 : 0x5f8a50, 1.55]; res.sun = [0xfff4d8, 1.3];
    res.update = function (dt) { for (var q = 0; q < res.upd.length; q++) res.upd[q](dt); };
    return res;
  }
  F.kartEnv = { textures: textures, build: build };
})();
