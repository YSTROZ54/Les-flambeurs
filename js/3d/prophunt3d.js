/* =====================================================================
   prophunt3d.js — PROP HUNT : cache-cache déguisé en objets (PC : clavier + souris)
   ---------------------------------------------------------------------
   • Salle « prophunt » : on y entre par la porte « PROP HUNT » du salon des mini jeux (réservée au Patron, au Co Fondateur et au Staff pour l'instant).
   • Les CACHÉS (3e personne) se transforment en un objet de la carte (clic sur l'objet visé), peuvent le figer (R), se moquer (T) pour gagner des points.
     Les CHASSEURS (1re personne) ont 4 armes (1 à 4 : pistolet, revolver, fusil d'assaut, carabine ; clic = tirer, R = recharger) ; tirer sur un objet
     ordinaire leur coûte de la vie. Un caché touché à mort rejoint les chasseurs.
   • Manches : salon (vote de la carte, touches 1-6) → cachette 30 s (les chasseurs sont aveugles et immobiles) → chasse 4 min → résultats.
   • TOUT passe par le serveur (api/_doProp.js, WebSocket /ws/prophunt) : déplacements, transformations, tirs, dégâts, manches. Ici le navigateur envoie ses
     touches 30 fois par seconde, PRÉDIT son propre déplacement et se recale sur le serveur (même code que le serveur : prophunt-sim.js).
   • Cartes : prophunt-maps.js (décor) · objets : prophunt-props.js · armes : assets/armes/*.glb · sons d'armes : synthétisés (aucun fichier).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom || !F.propSim || !F.propModels || !F.propMaps) return;
  var PS = F.propSim, PM = F.propModels, PT = F.propTex, TAU = Math.PI * 2;
  var NAMES = PM.names, WEAPONS = PS.WEAPONS, WIDS = PS.WEAPON_IDS;
  var MAPNAMES = PS.MAPS;
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  /* ------------------------------------------------------------------ sons (synthétisés) ------------------------------------------------------------------ */
  var AC = null;
  function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  function sfxVol() { try { var A = F.audio; return A && typeof A.sfxVol === 'number' ? A.sfxVol : 0.7; } catch (e) { return 0.7; } }
  function tone(f0, f1, dur, type, vol, delay) {
    var a = ac(); if (!a || vol <= 0.002) return; var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sfxVol()), t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, delay, hp) {
    var a = ac(); if (!a || vol <= 0.002) return; var t0 = a.currentTime + (delay || 0), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = freq || 2000; g.gain.value = vol * sfxVol();
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0);
  }
  // le bruit de chaque arme : claquement sec + souffle + grave de la détonation + écho
  function gunSound(w, vol) {
    vol = vol === undefined ? 1 : vol; if (vol <= 0.01) return;
    if (w === 'pistolet') { noise(0.05, 0.5 * vol, 2500, 0, true); noise(0.16, 0.5 * vol, 3200); tone(210, 70, 0.1, 'sawtooth', 0.22 * vol); noise(0.22, 0.12 * vol, 1200, 0.07); }
    else if (w === 'revolver') { noise(0.06, 0.7 * vol, 2200, 0, true); noise(0.34, 0.75 * vol, 2000); tone(120, 35, 0.3, 'sawtooth', 0.38 * vol); tone(70, 30, 0.35, 'sine', 0.35 * vol); noise(0.5, 0.2 * vol, 900, 0.12); noise(0.4, 0.1 * vol, 700, 0.3); }
    else if (w === 'lance') { tone(190, 55, 0.22, 'sine', 0.5 * vol); noise(0.16, 0.45 * vol, 1100); tone(420, 120, 0.1, 'square', 0.14 * vol); noise(0.3, 0.12 * vol, 700, 0.08); }      // « bloop » du lance-grenade
    else if (w === 'fusil') { noise(0.04, 0.45 * vol, 3000, 0, true); noise(0.11, 0.55 * vol, 4200); tone(170, 70, 0.08, 'square', 0.16 * vol); noise(0.15, 0.08 * vol, 1500, 0.05); }
    else { noise(0.05, 0.6 * vol, 2800, 0, true); noise(0.26, 0.6 * vol, 3000); tone(140, 45, 0.2, 'sawtooth', 0.3 * vol); noise(0.45, 0.16 * vol, 1000, 0.1); }
  }
  function reloadSound() { tone(900, 700, 0.04, 'square', 0.1, 0); tone(500, 300, 0.06, 'square', 0.12, 0.25); tone(1200, 800, 0.03, 'square', 0.1, 0.9); tone(700, 500, 0.05, 'square', 0.14, 1.15); }
  function dryClick() { tone(1400, 900, 0.03, 'square', 0.1); }
  function hitTick(kill) { tone(kill ? 700 : 1700, kill ? 500 : 1100, kill ? 0.18 : 0.06, 'triangle', kill ? 0.25 : 0.2); if (kill) tone(1100, 900, 0.14, 'triangle', 0.2, 0.09); }
  function hurtSound() { noise(0.2, 0.3, 700); tone(220, 90, 0.2, 'sawtooth', 0.2); }
  function tauntSound(k, vol) {
    if (vol <= 0.01) return;
    if (k === 0) { tone(180, 700, 0.4, 'sine', 0.3 * vol); tone(700, 220, 0.35, 'sine', 0.25 * vol, 0.38); }                                    // boing
    else if (k === 1) { tone(1900, 1000, 0.5, 'sine', 0.22 * vol); tone(2100, 900, 0.4, 'sine', 0.12 * vol, 0.05); }                          // sifflet
    else if (k === 2) { tone(420, 250, 0.16, 'sawtooth', 0.22 * vol); tone(420, 230, 0.2, 'sawtooth', 0.22 * vol, 0.24); noise(0.1, 0.06 * vol, 1800, 0, true); }   // coin-coin
    else if (k === 3) { tone(233, 233, 0.5, 'square', 0.14 * vol); tone(293, 293, 0.5, 'square', 0.12 * vol); tone(349, 349, 0.5, 'square', 0.1 * vol); }  // trompette
    else { for (var i = 0; i < 7; i++) tone(650 + i * 55, 600 + i * 55, 0.08, 'triangle', 0.2 * vol, i * 0.09); }                                    // rire
  }
  function boomSound(vol) { if (vol <= 0.01) return; noise(0.9, 0.9 * vol, 900); noise(0.5, 0.7 * vol, 2600); tone(90, 28, 0.8, 'sine', 0.9 * vol); tone(60, 24, 1.0, 'sawtooth', 0.35 * vol); noise(1.4, 0.25 * vol, 500, 0.15); }
  function horn() { tone(220, 220, 0.9, 'sawtooth', 0.18); tone(277, 277, 0.9, 'sawtooth', 0.14); }

  /* ------------------------------------------------------------------ armes (modèles) ------------------------------------------------------------------ */
  // le lance-grenade est dessiné par le code (pas de fichier) : canon épais, crosse et garde en bois, hausse, anneaux de laiton ; canon vers -z
  function makeLauncher() {
    var g = new THREE.Group(), steel = PM.M('lcsteel', 0x4a525c, 0.3, 0.55), dark = PM.M('lcdark', 0x20242a, 0.4, 0.45), wood = PM.M('lcwood', 0x7a4a24, 0.55, 0.05), brass = PM.brass(), red = PM.glow('lcred', 0xff3b2a, 1.6);
    function box(w, h, d, m, x, y, z, rx) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; g.add(o); return o; }
    function cyl(r0, r1, l, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, l, seg || 24), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); g.add(o); return o; }   // r0 = côté avant (-z), r1 = côté arrière
    // une pièce de bois ou de métal dessinée de profil (points [z, y]) puis épaissie
    function prof(pts, th, m, x) {
      var sh = new THREE.Shape(); pts.forEach(function (p, i) { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
      var ge = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }); ge.translate(0, 0, -th / 2); ge.rotateY(-Math.PI / 2);
      var o = new THREE.Mesh(ge, m); o.position.x = x || 0; g.add(o); return o;
    }
    cyl(0.026, 0.026, 0.52, steel, 0, 0.012, -0.16); cyl(0.04, 0.026, 0.045, dark, 0, 0.012, -0.43); cyl(0.022, 0.022, 0.012, dark, 0, 0.012, -0.455);         // canon et bouche évasée
    [-0.34, -0.22, -0.1].forEach(function (z) { cyl(0.03, 0.03, 0.012, brass, 0, 0.012, z); });                                                                  // bagues
    cyl(0.042, 0.042, 0.16, dark, 0, 0.012, 0.06); cyl(0.045, 0.045, 0.02, steel, 0, 0.012, 0.15);                                                              // boîte de culasse
    box(0.07, 0.02, 0.1, steel, 0, -0.035, 0.07); box(0.012, 0.05, 0.05, steel, 0, -0.06, 0.11);                                                                // pontet : levier de rupture
    cyl(0.04, 0.04, 0.2, wood, 0, -0.02, -0.17, 16);                                                                                                           // garde-main
    prof([[0.1, 0.035], [0.22, 0.026], [0.34, 0.0], [0.4, -0.04], [0.4, -0.12], [0.36, -0.125], [0.22, -0.085], [0.1, -0.05]], 0.044, wood);                      // crosse
    box(0.048, 0.13, 0.014, dark, 0, -0.04, 0.405);                                                                                                            // plaque de couche
    prof([[0.06, -0.04], [0.1, -0.04], [0.125, -0.15], [0.085, -0.16], [0.06, -0.07]], 0.038, wood);                                                             // poignée
    var tg = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.005, 6, 16, Math.PI), steel); tg.rotation.set(0, Math.PI / 2, Math.PI); tg.position.set(0, -0.07, 0.07); g.add(tg);   // pontet
    box(0.016, 0.05, 0.03, dark, 0, 0.06, 0.0); box(0.008, 0.06, 0.012, steel, 0, 0.1, 0.0); box(0.01, 0.022, 0.008, red, 0, 0.048, -0.44); cyl(0.004, 0.004, 0.03, steel, 0, 0.05, -0.44);   // hausse et guidon
    g.traverse(function (o) { o.frustumCulled = false; }); return g;
  }
  var WFILE = { pistolet: { f: 'assets/armes/pistolet.glb', L: 0.27, rot: Math.PI }, revolver: { f: 'assets/armes/revolver.glb', L: 0.34, rot: 0 }, fusil: { f: 'assets/armes/fusil.glb', L: 0.8, rot: Math.PI / 2 }, carabine: { f: 'assets/armes/carabine.glb', L: 0.86, rot: Math.PI / 2, strip: function (x, y) { return x > 0.2 && y < -0.42; } }, lance: { proc: makeLauncher, L: 0.82 } };
  var wCache = {}, wWait = {};
  // retire du modèle les pièces posées à côté de l'arme (chargeur de rechange, douilles) : tous les triangles dont le centre est dans la zone désignée par strip(x, y)
  function stripTris(geo, strip) {
    var idx = geo.index.array, pos = geo.attributes.position, keep = [], i;
    for (i = 0; i < idx.length; i += 3) { var a = idx[i], b = idx[i + 1], c = idx[i + 2]; if (!strip((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3)) keep.push(a, b, c); }
    geo.setIndex(keep);
  }
  // renvoie (de façon asynchrone) un groupe dont le canon pointe vers -z, centré, à la bonne longueur
  function loadWeapon(id, cb) {
    var cfg = WFILE[id]; if (!cfg) return;
    if (cfg.proc) { cb(cfg.proc()); return; }
    if (wCache[id]) { cb(wCache[id].clone(true)); return; }
    (wWait[id] = wWait[id] || []).push(cb);
    if (wWait[id].length > 1 || !THREE.GLTFLoader) return;
    new THREE.GLTFLoader().load(cfg.f + '?v=3', function (gl) {
      if (cfg.strip) gl.scene.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.index) stripTris(o.geometry, cfg.strip); });
      var inner = new THREE.Group(); inner.add(gl.scene); inner.rotation.y = cfg.rot; var root = new THREE.Group(); root.add(inner); root.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(root), s = new THREE.Vector3(), c = new THREE.Vector3(); b.getSize(s); b.getCenter(c);
      var k = cfg.L / Math.max(0.001, s.z); inner.scale.setScalar(k); inner.position.set(-c.x * k, -c.y * k, -c.z * k);
      root.traverse(function (o) { o.frustumCulled = false; });
      wCache[id] = root; var q = wWait[id]; wWait[id] = null; q.forEach(function (f) { try { f(root.clone(true)); } catch (e) { /* ok */ } });
    }, undefined, function () { wWait[id] = null; });
  }

  /* ------------------------------------------------------------------ petits dessins ------------------------------------------------------------------ */
  var glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex; var c = PT.cv(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,225,150,0.95)'); g.addColorStop(0.62, 'rgba(255,150,50,0.6)'); g.addColorStop(1, 'rgba(255,100,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
  }
  var envCache = {};
  function envFor(style) {
    if (envCache[style]) return envCache[style];
    var pal = { manoir: ['#3a3050', '#c8a888', '#2a2018'], casino: ['#40205a', '#c890d0', '#1a0a20'], station: ['#203848', '#a8c8e0', '#10202a'], musee: ['#8a8aa8', '#e8e0d0', '#403a34'], marche: ['#241848', '#8a6aa8', '#18101a'], port: ['#5a3a6a', '#ff9a60', '#2a2028'] }[style] || ['#6a78a8', '#c8bca8', '#3a3430'];
    var c = PT.cv(512, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, pal[0]); g.addColorStop(0.5, pal[1]); g.addColorStop(1, pal[2]); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    var t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; envCache[style] = t; return t;
  }
  function nameTag(name, col) {
    var c = PT.cv(256, 64), x = c.getContext('2d'); x.fillStyle = 'rgba(8,6,20,0.72)'; F.roundRectPath && F.roundRectPath(x, 4, 8, 248, 48, 22); if (!F.roundRectPath) x.fillRect(4, 8, 248, 48); x.fill();
    x.fillStyle = col || '#fff'; x.font = '800 28px ' + (F.SERIF || 'sans-serif'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(name).slice(0, 14), 128, 33, 230);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(1.9, 0.48, 1); sp.renderOrder = 30; return sp;
  }

  // un chasseur (silhouette de soldat) ; l'arme est ajoutée quand elle est chargée
  function makeSoldier(col) {
    var g = new THREE.Group(), suit = PM.M('sold' + col, col, 0.8, 0), dark = PM.M('soldd', 0x1a1d22, 0.7, 0.2), skin = PM.M('skin2', 0xcfa58a, 0.7, 0);
    var legs = [], arms = [];
    [-0.11, 0.11].forEach(function (x) { var l = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.2), suit); l.geometry.translate(0, -0.41, 0); l.position.set(x, 0.86, 0); g.add(l); legs.push(l); var bt = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.3), dark); bt.position.set(0, -0.82, 0.04); l.add(bt); });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 0.28), suit); torso.position.y = 1.2; g.add(torso);
    var vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.44, 0.32), dark); vest.position.y = 1.22; g.add(vest);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), skin); head.position.y = 1.7; g.add(head);
    var hel = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, TAU, 0, Math.PI * 0.55), dark); hel.position.y = 1.72; g.add(hel);
    var gog = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.07, 0.06), PM.glow('goggle', 0x39d6ff, 1.4)); gog.position.set(0, 1.72, 0.13); g.add(gog);
    var gunHolder = new THREE.Group(); gunHolder.position.set(0.17, 1.2, 0.5); gunHolder.rotation.y = Math.PI; g.add(gunHolder);
    [[-0.33, 1.4, 1.35, 0.35], [0.31, 1.4, 1.25, -0.25]].forEach(function (a) { var ar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.14), suit); ar.geometry.translate(0, -0.25, 0); ar.position.set(a[0], a[1], 0.02); ar.rotation.set(-a[2], 0, a[3]); g.add(ar); arms.push(ar); });
    g.userData = { legs: legs, gun: gunHolder, w: '' }; return g;
  }

  /* ------------------------------------------------------------------ interface (CSS) ------------------------------------------------------------------ */
  function injectCss() {
    if (document.getElementById('ph3d-css')) return;
    var s = document.createElement('style'); s.id = 'ph3d-css';
    s.textContent =
      '.hnt-hud{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:inherit;color:#fff;user-select:none}' +
      '.hnt-box{background:rgba(8,6,20,.74);border:1px solid rgba(255,255,255,.18);border-radius:14px;box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.hnt-top{position:absolute;left:50%;top:12px;transform:translateX(-50%);text-align:center;padding:7px 22px;min-width:230px}.hnt-top .t{font-size:28px;font-weight:900;font-family:' + (F.MONO || 'monospace') + '}.hnt-top .p{font-size:13px;font-weight:800;opacity:.9}' +
      '.hnt-role{position:absolute;left:50%;top:84px;transform:translateX(-50%);font-weight:900;font-size:17px;padding:5px 18px;border-radius:20px;white-space:nowrap}.hnt-role.h{background:rgba(40,120,255,.75)}.hnt-role.s{background:rgba(220,60,40,.8)}' +
      '.hnt-map{position:absolute;left:14px;top:14px;padding:7px 14px;font-weight:800;font-size:14px}.hnt-map small{display:block;opacity:.7;font-weight:700;font-size:12px}' +
      '.hnt-alive{position:absolute;right:14px;top:14px;padding:7px 14px;font-weight:900;font-size:15px;text-align:right}.hnt-alive small{display:block;opacity:.7;font-size:12px;font-weight:700}' +
      '.hnt-feed{position:absolute;right:14px;top:72px;display:flex;flex-direction:column;gap:5px;align-items:flex-end}.hnt-feed div{background:rgba(8,6,20,.78);border-radius:10px;padding:5px 11px;font-weight:800;font-size:13px;animation:hntfeed 6s forwards}@keyframes hntfeed{0%{opacity:0;transform:translateX(20px)}6%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}' +
      '.hnt-cross{position:absolute;left:50%;top:50%;width:0;height:0}.hnt-cross i{position:absolute;background:#fff;box-shadow:0 0 3px #000}.hnt-cross .a{left:-1px;top:-14px;width:2px;height:8px}.hnt-cross .b{left:-1px;top:6px;width:2px;height:8px}.hnt-cross .c{left:-14px;top:-1px;width:8px;height:2px}.hnt-cross .d{left:6px;top:-1px;width:8px;height:2px}.hnt-cross.dot i{display:none}.hnt-cross.dot:before{content:"";position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 4px #000}' +
      '.hnt-hit{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;opacity:0;transition:opacity .15s}.hnt-hit.on{opacity:1;transition:none}.hnt-hit:before,.hnt-hit:after{content:"";position:absolute;left:15px;top:-2px;width:4px;height:38px;background:#fff;box-shadow:0 0 4px #000;transform:rotate(45deg)}.hnt-hit:after{transform:rotate(-45deg)}.hnt-hit.kill:before,.hnt-hit.kill:after{background:#ff3b3b}' +
      '.hnt-target{position:absolute;left:50%;top:56%;transform:translateX(-50%);font-weight:900;font-size:16px;text-shadow:0 2px 0 #000,0 0 12px #000;white-space:nowrap;opacity:0;transition:opacity .12s}.hnt-target.on{opacity:1}' +
      '.hnt-stat{position:absolute;left:14px;bottom:22px;padding:8px 14px;min-width:220px}.hnt-stat .hp{height:10px;border-radius:6px;background:rgba(255,255,255,.15);overflow:hidden;margin-top:5px}.hnt-stat .hp i{display:block;height:100%;background:linear-gradient(90deg,#ff4d4d,#ffd23f,#3ddc84);transition:width .2s}.hnt-stat b{font-size:15px}.hnt-stat small{display:block;opacity:.75;font-size:12px;font-weight:700;margin-top:3px}' +
      '.hnt-ammo{position:absolute;right:16px;bottom:22px;padding:8px 16px;text-align:right}.hnt-ammo .n{font-size:40px;font-weight:900;font-family:' + (F.MONO || 'monospace') + '}.hnt-ammo .n small{font-size:18px;opacity:.65}.hnt-ammo .w{font-size:13px;font-weight:800;opacity:.9}.hnt-ammo .l{display:flex;gap:6px;margin-top:5px;justify-content:flex-end}.hnt-ammo .l span{padding:2px 8px;border-radius:7px;font-size:11px;font-weight:800;background:rgba(255,255,255,.12)}.hnt-ammo .l span.on{background:#ffd23f;color:#111}' +
      '.hnt-help{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);font-size:12px;font-weight:700;opacity:.8;background:rgba(8,6,20,.55);padding:4px 12px;border-radius:10px;white-space:nowrap}' +
      '.hnt-vote{position:absolute;left:14px;top:84px;width:262px;padding:10px 12px}.hnt-vote h4{margin:0 0 7px;font-size:14px}.hnt-vote .c{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:10px;margin-bottom:4px;background:rgba(255,255,255,.07);pointer-events:auto;cursor:pointer;font-weight:800;font-size:13px}.hnt-vote .c.me{background:rgba(255,210,63,.28);outline:1px solid #ffd23f}.hnt-vote .c i{font-style:normal;font-size:20px}.hnt-vote .c b{margin-left:auto;opacity:.85}.hnt-vote .c u{text-decoration:none;opacity:.5;font-size:11px}' +
      '.hnt-blind{position:absolute;inset:0;background:#000;display:none;align-items:center;justify-content:center;flex-direction:column;font-weight:900;text-align:center}.hnt-blind.on{display:flex}.hnt-blind .b{font-size:clamp(34px,6vw,70px)}.hnt-blind small{font-size:18px;opacity:.8;margin-top:8px;font-weight:700}' +
      '.hnt-hurt{position:absolute;inset:0;box-shadow:inset 0 0 120px 40px rgba(255,0,0,.55);opacity:0;transition:opacity .35s}.hnt-hurt.on{opacity:1;transition:none}' +
      '.hnt-toast{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%) scale(.8);opacity:0;transition:opacity .2s,transform .3s;font-weight:900;font-size:clamp(22px,4vw,40px);text-shadow:0 3px 0 #000;white-space:nowrap}.hnt-toast.in{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
      '.hnt-res,.hnt-score{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(8,6,20,.94);border:2px solid rgba(255,255,255,.25);border-radius:18px;padding:16px 20px;display:none;min-width:340px;max-width:94vw;max-height:80vh;overflow:auto}.hnt-res.on,.hnt-score.on{display:block}.hnt-res h3,.hnt-score h3{margin:0 0 10px;text-align:center;font-size:22px}.hnt-res table,.hnt-score table{width:100%;border-collapse:collapse;font-size:14px;font-weight:800}.hnt-res td,.hnt-res th,.hnt-score td,.hnt-score th{padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left}.hnt-res td:last-child,.hnt-score td:last-child{text-align:right}.hnt-res tr.me td,.hnt-score tr.me td{color:#ffd23f}' +
      '.hnt-pause{position:absolute;inset:0;background:rgba(4,3,12,.62);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;pointer-events:auto;text-align:center}.hnt-pause.on{display:flex}.hnt-pause .b{font-size:30px;font-weight:900}.hnt-pause small{opacity:.8;font-size:14px;font-weight:700;max-width:420px}.hnt-pause button{padding:10px 22px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(60,40,120,.9);color:#fff;font-weight:900;font-size:15px;cursor:pointer}';
    document.head.appendChild(s);
  }

  /* ==================================================================
     LA SALLE
     ================================================================== */
  function createRoom(world) {
    var room = { title: '🔍 PROP HUNT', subtitle: 'CACHE-CACHE DÉGUISÉ', topic: 'flambeurs-prophunt-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [], hideSelf: true, noHand: true };
    var g = room.group; room.bounds = { xMin: -600, xMax: 600, zMin: -600, zMax: 600 };

    var active = false, ui = null, keys = {}, ws = null, wsOk = false, netErr = '', reconnectT = 0, myKey = '', seq = 0, pending = [], inpAcc = 0, snap = null, hudT = 0, toastT = 0, paused = true;
    var mapId = '', map = null, mapObj = null, propRoot = null, remotes = {}, myBody = null, myBodyKey = '', myHeading = 0, curPh = '', lastRole = '', lastTl = 0, firing = false, fireT = 0, targetProp = null;
    var me = { c: PS.newPlayer(), r: 'h', type: '', vr: 0, hp: 100, ready: false, rc: -1, am: 12, mg: 12, rl: 0, st: 0, tc: 0, w: 'pistolet', sc: 0 };
    var cam = { yaw: 0, pitch: 0, x: 0, y: 0, z: 0 }, kick = 0, bob = 0, vm = null, vmW = '', vmHolder = null, muzzle = null, hurtT = 0, hitT = 0, flashT = 0, oldFog = null, oldBg = null, oldEnv = null;
    var fx = [], tracers = [], mflash = null;

    function myName() { try { return (typeof state !== 'undefined' && state && state.username) ? state.username : F.me(); } catch (e) { return F.me(); } }

    /* ---------- la carte ---------- */
    // fusionne tous les petits morceaux d'objets en un seul maillage par matériau (des centaines d'objets restent légers pour la carte graphique)
    function mergeStatic(root) {
      root.updateMatrixWorld(true); var groups = {}, order = [];
      root.traverse(function (o) { if (!o.isMesh || !o.geometry || !o.visible || Array.isArray(o.material)) return; var k = o.material.uuid; if (!groups[k]) { groups[k] = { mat: o.material, list: [] }; order.push(k); } groups[k].list.push(o); });
      var out = new THREE.Group();
      order.forEach(function (k) {
        var gr = groups[k], n = 0, parts = gr.list.map(function (m) { var geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); geo.applyMatrix4(m.matrixWorld); n += geo.attributes.position.count; return geo; });
        var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), o3 = 0, o2 = 0;
        parts.forEach(function (geo) { var p = geo.attributes.position, nm = geo.attributes.normal, u = geo.attributes.uv; pos.set(p.array, o3); if (nm) nor.set(nm.array, o3); if (u) uv.set(u.array, o2); o3 += p.count * 3; o2 += p.count * 2; geo.dispose(); });
        var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        var mesh = new THREE.Mesh(mg, gr.mat); mesh.frustumCulled = false; out.add(mesh);
      });
      root.traverse(function (o) { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      return out;
    }
    function applyMap(id) {
      if (id === mapId || !PS.MAPS[id]) return;
      if (propRoot) { g.remove(propRoot); propRoot.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); propRoot = null; }
      if (mapObj) { mapObj.dispose(); mapObj = null; }
      mapId = id; map = PS.makeMap(id); mapObj = F.propMaps.build(map); propRoot = new THREE.Group(); propRoot.add(mapObj.group);
      var raw = new THREE.Group(); map.props.forEach(function (p) { var m = PM.build(p.t, p.v); m.position.set(p.x, p.y, p.z); m.rotation.y = p.yaw; raw.add(m); }); propRoot.add(mergeStatic(raw));
      g.add(propRoot);
      world.scene.fog = new THREE.FogExp2(mapObj.fog.color, mapObj.fog.density); world.scene.background = new THREE.Color(mapObj.bg || 0x000000); world.scene.environment = envFor(map.style);
      if (world.renderer && world.renderer.setClearColor) world.renderer.setClearColor(mapObj.bg || 0x000000);
      pending = []; me.rc = -1;
    }

    /* ---------- le serveur ---------- */
    function wsSend(o) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) { /* ok */ } } }
    var everOpen = false, failCount = 0;
    function connect() {
      var tok = F.token(); if (!tok) { netErr = 'Connecte-toi pour jouer.'; return; }
      var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/prophunt?token=' + encodeURIComponent(tok) + '&name=' + encodeURIComponent(myName()) + '&room=' + encodeURIComponent((F.propJoin && F.propJoin.room) || '') + (F.propJoin && F.propJoin.create ? '&create=1&map=' + encodeURIComponent(F.propJoin.map || '') : '');
      try { ws = new WebSocket(url); } catch (e) { netErr = 'Serveur indisponible.'; return; }
      var mine = ws;
      ws.onopen = function () { if (ws !== mine) return; wsOk = true; netErr = ''; everOpen = true; failCount = 0; };
      ws.onmessage = function (ev) { if (ws !== mine) return; var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onNet(m); };
      ws.onclose = function () {
        if (ws !== mine) return; wsOk = false; me.ready = false;
        if (!active) return;
        if (!everOpen && ++failCount >= 2) { netErr = 'Salon introuvable, complet ou accès refusé…'; setTimeout(function () { if (active) world.goRoom('prophunt', 'prophuntgame'); }, 2500); return; }
        netErr = 'Connexion au serveur…'; reconnectT = 1.5;
      };
      ws.onerror = function () { /* onclose suit */ };
    }
    function distVol(x, z, ref) { var d = Math.hypot(x - me.c.x, z - me.c.z); return Math.max(0, 1 - d / (ref || 55)); }
    function onNet(m) {
      if (m.t === 's') { snap = m; applySnap(m); }
      else if (m.t === 'ev') onEvent(m);
      else if (m.t === 'end') showResults(m);
    }
    function onEvent(e) {
      if (e.e === 'shot') {
        var mine = e.k === myKey, from = remotes[e.k];
        if (!mine) { var px = from ? from.x : e.ox, pz = from ? from.z : e.oz; gunSound(e.w, 0.9 * distVol(px, pz)); }
        shotFx(e, mine);
        if (mine && e.hit > 0) { hitMarker(!!e.kill); hitTick(!!e.kill); }
      } else if (e.e === 'hurt') { hurtT = 0.5; hurtSound(); if (ui) { ui.hurt.classList.remove('on'); void ui.hurt.offsetWidth; ui.hurt.classList.add('on'); setTimeout(function () { ui && ui.hurt.classList.remove('on'); }, 60); } }
      else if (e.e === 'ouch') { toast('−4 ❤  objet ordinaire !', '#ff6a6a', 0.9); tone(180, 90, 0.18, 'square', 0.2); }
      else if (e.e === 'stun') toast('😵 Étourdi ' + e.d + ' s', '#ffd24a', 2);
      else if (e.e === 'kill') { feed('<b>' + esc(nameOf(e.by)) + '</b> a trouvé <b>' + esc(nameOf(e.k)) + '</b> 🔫'); if (e.k === myKey) { toast('🔍 Tu as été trouvé ! Tu rejoins les chasseurs', '#ffd24a', 3.2); } }
      else if (e.e === 'taunt') { var f2 = remotes[e.k], tx = f2 ? f2.x : e.x, tz = f2 ? f2.z : e.z; tauntSound(e.snd, e.k === myKey ? 0.9 : distVol(tx, tz, 40)); if (e.k !== myKey && me.r === 's') feed('♪ Un objet se moque de toi…'); }
      else if (e.e === 'round') { toast('🗺️ ' + (MAPNAMES[e.map] ? MAPNAMES[e.map].name : ''), '#fff', 2.2); }
      else if (e.e === 'hunt') { horn(); toast(me.r === 's' ? '🔫 À LA CHASSE !' : '🏃 ILS ARRIVENT !', '#ff7a3d', 2); }
      else if (e.e === 'reload') { me.rl = e.d; reloadSound(); }
    }
    function nameOf(k) { var r = remotes[k]; return k === myKey ? myName() : (r ? r.name : k); }

    /* ---------- état reçu du serveur ---------- */
    function applySnap(m) {
      if (m.m !== mapId) applyMap(m.m);
      var seen = {}, i;
      m.pl.forEach(function (p) {
        seen[p.k] = true;
        if (p.k === myKey) reconcile(p); else upsertRemote(p);
      });
      Object.keys(remotes).forEach(function (k) { if (!seen[k]) dropRemote(k); });
      if (m.ph !== curPh) { onPhase(curPh, m.ph); curPh = m.ph; }
    }
    function onPhase(from, to) {
      if (to === 'hide') { toast(me.r === 's' ? '🙈 Les cachés se cachent…' : '🏃 CACHE-TOI !', me.r === 's' ? '#fff' : '#3ddc84', 2.4); if (ui) ui.res.classList.remove('on'); }
      else if (to === 'lobby') { if (ui) ui.res.classList.remove('on'); }
    }
    function reconcile(p) {
      var c = me.c, roleChanged = p.r !== me.r, typeChanged = (p.ty || '') !== me.type || (p.vr || 0) !== me.vr;
      me.hp = p.hp; me.am = p.am; me.mg = p.mg; me.rl = p.rl; me.st = p.st; me.tc = p.tc; me.sc = p.sc; me.lk = p.lk;
      if (p.r === 's' && p.w && p.w !== me.w && roleChanged) me.w = p.w;
      if (p.r === 's' && p.w) me.w = me.w; // le choix local fait foi tant que le serveur ne dit pas autre chose
      if (roleChanged || typeChanged || !me.ready) { me.r = p.r; me.type = p.ty || ''; me.vr = p.vr || 0; PS.setShape(c, me.r === 'h' ? me.type : ''); if (me.r === 's' && p.w) me.w = p.w; if (roleChanged) { setupRoleView(); } }
      if (p.rc !== me.rc || !me.ready) {                      // placement décidé par le serveur : on s'y met tout de suite
        me.rc = p.rc; me.ready = true; c.x = p.x; c.y = p.y; c.z = p.z; c.vx = p.vx; c.vz = p.vz; c.vy = 0; c.air = p.y > 0.02; cam.yaw = p.a; cam.pitch = 0; pending = []; return;
      }
      pending = pending.filter(function (q) { return q.seq > p.ack; });
      var pc = PS.newPlayer(); pc.r = c.r; pc.h = c.h; pc.eye = c.eye; pc.x = p.x; pc.y = p.y; pc.z = p.z; pc.vx = p.vx; pc.vz = p.vz; pc.vy = c.air ? c.vy : 0; pc.air = p.y > 0.02;
      for (var k = 0; k < pending.length; k++) { var inp = pending[k].inp; if (!frozen(inp)) for (var i = 0; i < 3; i++) PS.stepPlayer(pc, inp, 1 / 90, map); }
      var err = Math.hypot(pc.x - c.x, pc.z - c.z);
      if (err > 1.6) { c.x = pc.x; c.y = pc.y; c.z = pc.z; c.vx = pc.vx; c.vz = pc.vz; }
      else { c.x += (pc.x - c.x) * 0.25; c.z += (pc.z - c.z) * 0.25; c.vx += (pc.vx - c.vx) * 0.25; c.vz += (pc.vz - c.vz) * 0.25; if (Math.abs(pc.y - c.y) > 0.4) c.y = pc.y; }
    }
    function frozen() { return (me.r === 's' && (curPh === 'hide' || me.st > 0)) || (me.r === 'h' && me.lk) || curPh === 'results'; }
    function setupRoleView() {
      if (!ui) return;
      if (me.r === 's') { ensureViewmodel(); }
      else if (vm) vm.visible = false;
      myBodyKey = '';
    }

    /* ---------- les autres joueurs ---------- */
    function upsertRemote(p) {
      var r = remotes[p.k];
      if (!r) { r = remotes[p.k] = { k: p.k, name: String(p.n || p.k).slice(0, 20), grp: new THREE.Group(), body: null, key: '', tag: nameTag(p.n || p.k, '#fff'), x: p.x, y: p.y, z: p.z, yaw: p.a || 0, heading: 0, walk: 0, tx: p.x, ty: p.y, tz: p.z, vx: 0, vz: 0, ta: 0, r: p.r, recv: performance.now() }; g.add(r.grp); g.add(r.tag); }
      r.tx = p.x; r.ty = p.y; r.tz = p.z; r.ta = p.a || 0; r.vx = p.vx || 0; r.vz = p.vz || 0; r.r = p.r; r.type = p.ty || ''; r.w = p.w || ''; r.lk = p.lk; r.sc = p.sc; r.recv = performance.now();
      var key = p.r === 'h' ? 'h:' + (p.ty || '') + ':' + (p.vr || 0) : 's';
      if (key !== r.key) {
        r.key = key; if (r.body) r.grp.remove(r.body);
        r.body = p.r === 'h' ? PM.build(p.ty || 'crate', p.vr || 0) : makeSoldier(0x3c4a3a); r.grp.add(r.body); if (p.r === 's') r.lastW = '';
      }
      if (p.r === 's' && r.lastW !== r.w) { r.lastW = r.w; var holder = r.body.userData.gun; while (holder.children.length) holder.remove(holder.children[0]); holder.position.z = 0.22 + ((WFILE[r.w] && WFILE[r.w].L) || 0.4) / 2; if (r.w) loadWeapon(r.w, function (m) { if (r.body && r.body.userData.gun === holder) holder.add(m); }); }
    }
    function dropRemote(k) { var r = remotes[k]; if (!r) return; g.remove(r.grp); g.remove(r.tag); r.tag.material.map.dispose(); delete remotes[k]; }

    /* ---------- tirs : traînées, étincelles, flash, explosions ---------- */
    var smokeTex = null;
    function smokeTexture() { if (smokeTex) return smokeTex; var c = PT.cv(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); smokeTex = new THREE.CanvasTexture(c); return smokeTex; }
    // une étincelle / une boule de feu / une volute de fumée (opts : vy = montée, grow = grossissement, smoke = fumée sombre)
    function spriteFx(x, y, z, col, size, life, opts) {
      opts = opts || {}; var s = null, i, kind = opts.smoke ? 1 : 0;
      for (i = 0; i < fx.length; i++) if (fx[i].life <= 0 && fx[i].kind === kind) { s = fx[i]; break; }
      if (!s) { var sp = new THREE.Sprite(new THREE.SpriteMaterial(kind ? { map: smokeTexture(), transparent: true, depthWrite: false } : { map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.renderOrder = kind ? 4 : 6; g.add(sp); s = { s: sp, life: 0, max: 1, size: 1, kind: kind, vy: 0, grow: 0.6, vx: 0, vz: 0 }; fx.push(s); }
      s.s.position.set(x, y, z); s.s.material.color.setHex(col); s.s.visible = true; s.life = s.max = life; s.size = size; s.vy = opts.vy || 0; s.vx = opts.vx || 0; s.vz = opts.vz || 0; s.grow = opts.grow === undefined ? 0.6 : opts.grow; s.op = opts.op || 1; s.s.scale.set(size, size, 1);
    }
    var rings = [];
    // l'explosion de la grenade : boule de feu, onde de choc, étincelles, fumée, éclair de lumière, tremblement, grondement
    function boomFx(x, y, z, R, mine) {
      var d = Math.hypot(x - me.c.x, z - me.c.z), delay = Math.min(0.5, Math.hypot(x - me.c.x, y - (me.c.y + 1.6), z - me.c.z) / 70);
      setTimeout(function () {
        if (!active) return; var q;
        spriteFx(x, y + 0.3, z, 0xffb040, R * 1.9, 0.55, { grow: 1.1 }); spriteFx(x, y + 0.5, z, 0xff6a1a, R * 1.4, 0.7, { grow: 1.4 }); spriteFx(x, y + 0.2, z, 0xfff0c0, R * 0.9, 0.3, { grow: 0.8 });
        for (q = 0; q < 14; q++) { var a = Math.random() * TAU, sp = 3 + Math.random() * 6; spriteFx(x, y + 0.3, z, 0xffc060, 0.35 + Math.random() * 0.3, 0.6 + Math.random() * 0.4, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 5, grow: -0.3 }); }
        for (q = 0; q < 9; q++) spriteFx(x + (Math.random() - 0.5) * R * 0.6, y + 0.4, z + (Math.random() - 0.5) * R * 0.6, 0x3a3835, R * (0.9 + Math.random() * 0.7), 1.6 + Math.random() * 0.8, { smoke: true, vy: 1.2 + Math.random(), grow: 1.0, op: 0.55 });
        var rg = null; for (q = 0; q < rings.length; q++) if (rings[q].life <= 0) { rg = rings[q]; break; }
        if (!rg) { var m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; g.add(m); rg = { m: m, life: 0 }; rings.push(rg); }
        rg.m.position.set(x, Math.max(0.06, y - 0.2), z); rg.m.visible = true; rg.life = rg.max = 0.5; rg.R = R;
        if (!mflash) { mflash = new THREE.PointLight(0xffa850, 0, 9, 1.6); g.add(mflash); }
        mflash.position.set(x, y + 1, z); mflash.distance = R * 4.5; mflash.intensity = 3.2; flashT = 0.3; flashBase = 3.2;
        boomSound(Math.max(0.12, 1 - d / 70)); shakeT = Math.max(shakeT, 0.7 * Math.max(0, 1 - d / 28));
      }, delay * 1000);
    }
    function shotFx(e, mine) {
      var col = e.h === 'hider' ? 0xff4040 : 0xffd070;
      if (!e.ex) {
        spriteFx(e.tx, e.ty, e.tz, col, e.h === 'hider' ? 0.7 : 0.45, 0.16);
        if (e.h === 'prop' || e.h === 'wall') for (var q = 0; q < 3; q++) spriteFx(e.tx + (Math.random() - 0.5) * 0.3, e.ty + (Math.random() - 0.5) * 0.3, e.tz + (Math.random() - 0.5) * 0.3, 0xffb060, 0.16, 0.25);
      } else boomFx(e.tx, e.ty, e.tz, e.ex, mine);
      // la traînée : de l'arme vers l'impact
      var ox = e.ox, oy = e.oy - 0.12, oz = e.oz, dx = e.tx - ox, dy = e.ty - oy, dz = e.tz - oz, L = Math.hypot(dx, dy, dz) || 1;
      ox += dx / L * 0.5; oy += dy / L * 0.5; oz += dz / L * 0.5; if (mine) { ox += Math.cos(cam.yaw) * 0.14; oz += Math.sin(cam.yaw) * 0.14; }
      var t = null, i; for (i = 0; i < tracers.length; i++) if (tracers[i].life <= 0) { t = tracers[i]; break; }
      if (!t) { var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.8 })); ln.frustumCulled = false; g.add(ln); t = { l: ln, life: 0 }; tracers.push(t); }
      var pos = t.l.geometry.attributes.position; pos.setXYZ(0, ox, oy, oz); pos.setXYZ(1, e.tx, e.ty, e.tz); pos.needsUpdate = true; t.l.visible = true; t.life = e.ex ? 0.18 : 0.07; t.max = t.life; t.l.material.opacity = 0.85;
      if (!e.ex) { if (!mflash) { mflash = new THREE.PointLight(0xffa850, 0, 9, 1.6); g.add(mflash); } mflash.distance = 9; mflash.position.set(e.ox, e.oy, e.oz); mflash.intensity = 2.4; flashT = 0.06; flashBase = 2.4; }
    }

    /* ---------- l'arme en main (chasseur, 1re personne) : dessinée dans une 2e passe, avec son propre éclairage et un champ de vision étroit,
       pour qu'elle ne soit ni déformée ni noire, et qu'elle ne traverse pas les murs ---------- */
    var vmScene = null, vmCam = null, origRender = null;
    function ensureVmScene() {
      if (vmScene) return;
      vmScene = new THREE.Scene(); vmCam = new THREE.PerspectiveCamera(42, 1.6, 0.02, 10);
      vmScene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a78, 1.25)); var d1 = new THREE.DirectionalLight(0xfff2e0, 1.5); d1.position.set(1.5, 2.5, 2); vmScene.add(d1); var d2 = new THREE.DirectionalLight(0x9fb8ff, 0.7); d2.position.set(-2, 0.5, 1); vmScene.add(d2);
      vmScene.environment = envFor('musee');
    }
    function drawVm() {
      if (!vm || !vm.visible || !active || me.r !== 's' || !vmScene) return;
      var r = world.renderer, dom = r.domElement, ac = r.autoClear; vmCam.aspect = dom.clientWidth / Math.max(1, dom.clientHeight); vmCam.updateProjectionMatrix();
      r.autoClear = false; r.clearDepth(); origRender.call(r, vmScene, vmCam); r.autoClear = ac;
    }
    function ensureViewmodel() {
      ensureVmScene();
      if (!vm) {
        vm = new THREE.Group(); vmHolder = new THREE.Group(); vm.add(vmHolder);
        muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); muzzle.scale.set(0.22, 0.22, 1); muzzle.visible = false; vm.add(muzzle); vmScene.add(vm);
      }
      if (!origRender) { var r = world.renderer; origRender = r.render; r.render = function (s, c) { origRender.call(r, s, c); if (s === world.scene) drawVm(); }; }
      vm.visible = true; setViewWeapon(me.w, true);
    }
    var VMBASE = { pistolet: { x: 0.12, y: -0.115, z: -0.4 }, revolver: { x: 0.12, y: -0.115, z: -0.42 }, fusil: { x: 0.12, y: -0.14, z: -0.64 }, carabine: { x: 0.12, y: -0.14, z: -0.66 }, lance: { x: 0.12, y: -0.12, z: -0.7 } };
    function setViewWeapon(w, force) {
      if (!vmHolder || (vmW === w && !force)) return; vmW = w;
      while (vmHolder.children.length) vmHolder.remove(vmHolder.children[0]);
      loadWeapon(w, function (m) {
        if (vmW !== w || !vmHolder) return;
        vmHolder.add(m); var b = VMBASE[w] || VMBASE.pistolet;
        vm.scale.setScalar(w === 'pistolet' || w === 'revolver' ? 0.78 : 0.88); vm.userData.base = b; vm.userData.muz = (WFILE[w] ? WFILE[w].L : 0.3) / 2; vm.userData.yaw = 0.035;
      });
    }

    /* ---------- tirer / se transformer ---------- */
    function fire() {
      if (!me.ready || paused) return;
      var now = performance.now() / 1000;
      if (me.r === 's') {
        if (curPh !== 'hunt' || me.st > 0 || me.rl > 0 || now < fireT) return;
        if (me.am <= 0) { dryClick(); fireT = now + 0.3; if (me.w === 'lance') toast('💥 Plus de grenade !', '#ffb02e', 1.2); else wsSend({ t: 'reload' }); return; }
        var W = WEAPONS[me.w]; fireT = now + W.cd * 0.95; me.am--; wsSend({ t: 'shoot', yaw: +cam.yaw.toFixed(4), pitch: +cam.pitch.toFixed(4) });
        gunSound(me.w, 0.8); kick = me.w === 'lance' ? 1.6 : 1; if (muzzle) { muzzle.visible = true; muzzle.material.rotation = Math.random() * 6; muzzle.userData.t = 0.05; }
        cam.pitch = Math.min(1.3, cam.pitch + (me.w === 'revolver' ? 0.03 : me.w === 'lance' ? 0.05 : 0.012)); cam.yaw += (Math.random() - 0.5) * 0.006;
      } else if (me.r === 'h') {
        if (!targetProp) { tone(300, 200, 0.08, 'square', 0.1); return; }
        wsSend({ t: 'morph', i: targetProp.i }); tone(500, 900, 0.12, 'triangle', 0.16); toast('✨ ' + (NAMES[targetProp.t] || 'Objet'), '#fff', 0.9);
      }
    }
    function doReload() { if (me.r === 's' && curPh === 'hunt' && me.rl <= 0 && me.am < me.mg && WEAPONS[me.w].reload > 0) wsSend({ t: 'reload' }); }
    function pickWeapon(i) { if (me.r !== 's' || i < 0 || i >= WIDS.length || me.rl > 0) return; var w = WIDS[i]; if (w === me.w) return; me.w = w; wsSend({ t: 'weapon', w: w }); setViewWeapon(w); me.mg = WEAPONS[w].mag; tone(600, 900, 0.05, 'square', 0.08); }
    var myVote = '', shakeT = 0, flashBase = 2.4;

    /* ---------- interface ---------- */
    function toast(t, col, dur) { if (!ui) return; var e = ui.toast; e.style.color = col || '#fff'; e.textContent = t; e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); toastT = dur || 1.6; }
    function feed(html) { if (!ui) return; var d = document.createElement('div'); d.innerHTML = html; ui.feed.appendChild(d); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 6000); while (ui.feed.children.length > 5) ui.feed.removeChild(ui.feed.children[0]); }
    function hitMarker(kill) { if (!ui) return; ui.hit.classList.remove('on', 'kill'); void ui.hit.offsetWidth; ui.hit.classList.add('on'); if (kill) ui.hit.classList.add('kill'); hitT = 0.14; }
    function buildUi() {
      injectCss();
      var el = document.createElement('div'); el.className = 'hnt-hud';
      el.innerHTML = '<div class="hnt-box hnt-top"><div class="t"></div><div class="p"></div></div><div class="hnt-role"></div><div class="hnt-box hnt-map"></div><div class="hnt-box hnt-alive"></div><div class="hnt-feed"></div>' +
        '<div class="hnt-cross"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i></div><div class="hnt-hit"></div><div class="hnt-target"></div>' +
        '<div class="hnt-box hnt-stat"></div><div class="hnt-box hnt-ammo"></div><div class="hnt-help"></div><div class="hnt-box hnt-vote"></div>' +
        '<div class="hnt-hurt"></div><div class="hnt-toast"></div><div class="hnt-blind"><div class="b"></div><small></small></div><div class="hnt-res"></div><div class="hnt-score"></div>' +
        '<div class="hnt-pause"><div class="b">🔍 PROP HUNT</div><small>Clique pour jouer (la souris est capturée · Échap pour la libérer)</small><button data-a="play">▶ Jouer</button><button data-a="quit">🚪 Quitter</button></div>';
      world.container.appendChild(el);
      var q = function (s) { return el.querySelector(s); };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (b) { if (b.dataset.a === 'quit') world.goRoom('prophunt', 'prophuntgame'); else if (b.dataset.a === 'start') wsSend({ t: 'start' }); else lock(); return; }
      });
      return { el: el, top: q('.hnt-top .t'), phase: q('.hnt-top .p'), role: q('.hnt-role'), map: q('.hnt-map'), alive: q('.hnt-alive'), feed: q('.hnt-feed'), cross: q('.hnt-cross'), hit: q('.hnt-hit'), target: q('.hnt-target'), stat: q('.hnt-stat'), ammo: q('.hnt-ammo'), help: q('.hnt-help'), vote: q('.hnt-vote'), hurt: q('.hnt-hurt'), toast: q('.hnt-toast'), blind: q('.hnt-blind'), blindT: q('.hnt-blind .b'), blindS: q('.hnt-blind small'), res: q('.hnt-res'), score: q('.hnt-score'), pause: q('.hnt-pause') };
    }
    function playersList() {
      var rows = [{ k: myKey, n: myName(), r: me.r, sc: me.sc, me: true }]; Object.keys(remotes).forEach(function (k) { var r = remotes[k]; rows.push({ k: k, n: r.name, r: r.r, sc: r.sc || 0 }); }); return rows.sort(function (a, b) { return b.sc - a.sc; });
    }
    function showResults(m) {
      if (!ui) return; var mineWin = (m.win === 'h') === (me.r === 'h');
      var h = '<h3>' + (m.win === 'h' ? '🎭 Les objets gagnent !' : '🔫 Les chasseurs gagnent !') + '</h3><table><tr><th>#</th><th>Joueur</th><th>Camp</th><th>Points</th></tr>';
      m.sc.forEach(function (r, i) { h += '<tr class="' + (r.k === myKey ? 'me' : '') + '"><td>' + (['🥇', '🥈', '🥉'][i] || (i + 1)) + '</td><td>' + esc(r.n) + '</td><td>' + (r.r === 'h' ? '🎭' : '🔫') + '</td><td>' + r.sc + '</td></tr>'; });
      ui.res.innerHTML = h + '</table>'; ui.res.classList.add('on');
      tone(mineWin ? 523 : 330, mineWin ? 784 : 220, 0.5, 'triangle', 0.2); if (mineWin) tone(784, 1046, 0.5, 'triangle', 0.2, 0.2);
    }
    function refreshHud() {
      if (!ui) return;
      if (!me.ready) { ui.top.textContent = '…'; ui.phase.textContent = netErr || 'Connexion au serveur…'; return; }
      var ph = curPh, tl = snap ? snap.tl : 0, n = snap ? snap.pl.length : 1, seeker = me.r === 's';
      var waitHost = ph === 'lobby' && snap && snap.pv && !snap.go;
      ui.top.textContent = ph === 'lobby' ? (n < 2 || waitHost ? '—' : fmt(tl)) : (ph === 'results' ? '' : fmt(tl));
      ui.phase.textContent = ph === 'lobby' ? (n < 2 ? 'En attente d\'un 2e joueur…' : waitHost ? 'En attente du chef de salle…' : 'Prochaine manche dans ' + Math.ceil(tl) + ' s · ' + n + ' joueurs') : ph === 'hide' ? 'CACHETTE' : ph === 'hunt' ? 'CHASSE' : 'FIN DE MANCHE';
      ui.role.className = 'hnt-role ' + (ph === 'lobby' || ph === 'results' ? '' : me.r); ui.role.style.display = ph === 'lobby' || ph === 'results' ? 'none' : '';
      ui.role.textContent = seeker ? '🔫 CHASSEUR' : '🎭 OBJET : ' + (NAMES[me.type] || '…');
      ui.map.innerHTML = (MAPNAMES[mapId] ? MAPNAMES[mapId].icon + ' ' + esc(MAPNAMES[mapId].name) : '') + '<small>' + esc(myName()) + ' · ' + me.sc + ' pts</small>';
      ui.alive.innerHTML = ph === 'lobby' ? '' : '🎭 ' + (snap ? snap.alive : 0) + '<small>cachés en vie</small>';
      // vie, munitions
      ui.stat.style.display = '';
      ui.stat.innerHTML = '<b>❤ ' + Math.max(0, Math.round(me.hp)) + '</b><div class="hp"><i style="width:' + Math.max(0, Math.min(100, me.hp)) + '%"></i></div>' + (seeker ? '' : '<small>' + (me.lk ? '🔒 Figé (R pour bouger)' : 'T : se moquer' + (me.tc > 0 ? ' (' + Math.ceil(me.tc) + ' s)' : '') + ' · R : figer') + '</small>');
      ui.ammo.style.display = seeker && ph !== 'lobby' ? '' : 'none';
      if (seeker) ui.ammo.innerHTML = '<div class="w">' + esc(WEAPONS[me.w].name) + (me.rl > 0 ? ' · rechargement…' : '') + '</div><div class="n">' + me.am + '<small> / ' + me.mg + '</small></div><div class="l">' + WIDS.map(function (w, i) { return '<span class="' + (w === me.w ? 'on' : '') + '">' + (i + 1) + '</span>'; }).join('') + '</div>';
      ui.cross.className = 'hnt-cross' + (seeker ? '' : ' dot');
      ui.help.textContent = ph === 'lobby' ? 'Entraîne-toi : clic sur un objet pour le devenir · ZQSD · espace : sauter' : seeker ? '1-5 : arme · clic : tirer · R : recharger · Tab : scores' : 'Clic : devenir l\'objet visé · R : figer · T : se moquer (points) · Tab : scores';
      // salon : code du salon privé, liste des joueurs, bouton « Lancer » pour le chef de salle
      if (ph === 'lobby') {
        var pv = snap && snap.pv, isHost = snap && snap.host === myKey, rows = playersList(), h = '<h4>' + (pv ? '🔒 Salon privé · code <b style="font-size:18px;letter-spacing:2px;color:#ffd23f">' + esc(snap.code || '') + '</b>' : '🌐 Salon public · ' + (MAPNAMES[mapId] ? esc(MAPNAMES[mapId].name) : '')) + '</h4>';
        h += '<div style="font-size:12px;opacity:.75;margin-bottom:6px">' + (pv ? 'Donne ce code à tes amis (ils le saisissent à l\'accueil du Prop Hunt).' : 'La manche démarre toute seule dès 2 joueurs.') + ' Le chasseur est tiré au hasard.</div>';
        rows.forEach(function (r) { h += '<div class="c"><i>' + (snap && snap.host === r.k && pv ? '👑' : '🎭') + '</i><span>' + esc(r.n) + '</span></div>'; });
        if (pv) h += isHost ? (n >= 2 && !(snap && snap.go) ? '<div style="margin-top:7px"><button data-a="start" style="pointer-events:auto;width:100%;padding:9px;border-radius:10px;border:0;background:#3ddc84;color:#06210f;font-weight:900;cursor:pointer">▶ Lancer la manche (G)</button></div>' : '<div style="margin-top:7px;font-size:12px;opacity:.8">' + (n < 2 ? 'Il faut au moins 2 joueurs.' : 'Départ imminent…') + '</div>') : '<div style="margin-top:7px;font-size:12px;opacity:.8">Le chef de salle (👑) lance la manche.</div>';
        ui.vote.innerHTML = h; ui.vote.style.display = '';
      } else ui.vote.style.display = 'none';
      // aveugle pendant la cachette
      var blind = seeker && ph === 'hide'; ui.blind.classList.toggle('on', blind);
      if (blind) { ui.blindT.textContent = Math.ceil(tl); ui.blindS.textContent = 'Les cachés se transforment en objets… Tu pars à leur recherche dans ' + Math.ceil(tl) + ' s'; }
      // tableau des scores (Tab)
      var sc = '<h3>Scores</h3><table><tr><th>Joueur</th><th>Camp</th><th>Points</th></tr>'; playersList().forEach(function (r) { sc += '<tr class="' + (r.me ? 'me' : '') + '"><td>' + esc(r.n) + '</td><td>' + (r.r === 'h' ? '🎭' : '🔫') + '</td><td>' + r.sc + '</td></tr>'; }); ui.score.innerHTML = sc + '</table>'; ui.score.classList.toggle('on', !!keys.Tab);
      ui.pause.classList.toggle('on', paused && me.ready); ui.pause.querySelector('small').textContent = netErr || 'Clique pour jouer (la souris est capturée · Échap pour la libérer)';
    }

    /* ---------- commandes ---------- */
    function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); }
    function codes() { var k = F.keys(); return { f: [k.f, 'ArrowUp'], b: [k.b, 'ArrowDown'], l: [k.l, 'ArrowLeft'], r: [k.r, 'ArrowRight'], jump: [k.jump], run: [k.run, 'ShiftLeft', 'ShiftRight'] }; }
    var MY_KEYS = { Digit1: 1, Digit2: 1, Digit3: 1, Digit4: 1, Digit5: 1, Digit6: 1, Numpad1: 1, Numpad2: 1, Numpad3: 1, Numpad4: 1, Numpad5: 1, Numpad6: 1, KeyR: 1, KeyT: 1, KeyG: 1, Tab: 1, Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ShiftLeft: 1, ShiftRight: 1 };
    function isMine(code) { if (MY_KEYS[code]) return true; var c = codes(), a; for (a in c) if (c[a].indexOf(code) >= 0) return true; return false; }
    function onKey(e) {
      if (!active || world.mode !== 'seat' || typing() || !isMine(e.code)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown') {
        if (e.repeat && keys[e.code]) return; keys[e.code] = true;
        var m = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
        if (m) { var i = +m[1] - 1; if (curPh !== 'lobby') pickWeapon(i); }
        else if (e.code === 'KeyR') { if (me.r === 's') doReload(); else if (me.r === 'h') wsSend({ t: 'lock' }); }
        else if (e.code === 'KeyT' && me.r === 'h') { wsSend({ t: 'taunt' }); }
        else if (e.code === 'KeyG' && snap && snap.pv && snap.host === myKey && curPh === 'lobby') wsSend({ t: 'start' });
      } else keys[e.code] = false;
    }
    function down(list) { for (var i = 0; i < list.length; i++) if (keys[list[i]]) return true; return false; }
    function readInput() {
      var c = codes();
      return { f: (down(c.f) ? 1 : 0) - (down(c.b) ? 1 : 0), s: (down(c.r) ? 1 : 0) - (down(c.l) ? 1 : 0), run: down(c.run), jump: down(c.jump), yaw: cam.yaw, pitch: cam.pitch };
    }
    function lock() { try { var l = world.dom.requestPointerLock(); if (l && l.catch) l.catch(function () { /* refusé */ }); } catch (e) { /* ok */ } paused = false; }
    function onMouseMove(e) {
      if (!active || document.pointerLockElement !== world.dom) return;
      var sens = 0.0022 * (world.sensi || (F.sensi ? F.sensi() : 1));
      cam.yaw += e.movementX * sens; var lim = me.r === 's' ? 1.45 : 1.0; cam.pitch = Math.max(me.r === 's' ? -1.45 : -0.9, Math.min(lim * (me.r === 's' ? 1 : 0.55), cam.pitch - e.movementY * sens));
    }
    function onMouseDown(e) {
      if (!active) return;
      if (document.pointerLockElement !== world.dom) { if (e.button === 0) { e.preventDefault(); lock(); } return; }
      if (e.button === 0) { e.preventDefault(); firing = true; fire(); }
    }
    function onMouseUp(e) { if (e.button === 0) firing = false; }
    function onWheel(e) { if (!active || document.pointerLockElement !== world.dom || me.r !== 's') return; e.preventDefault(); var i = WIDS.indexOf(me.w); pickWeapon((i + (e.deltaY > 0 ? 1 : -1) + WIDS.length) % WIDS.length); }
    function onLockChange() { if (!active) return; paused = document.pointerLockElement !== world.dom; if (paused) { firing = false; keys = {}; } }

    /* ---------- la vue (caméra) ---------- */
    room.seatPos = function () { return null; };
    room.hint = function () { return 'Prop Hunt : clic pour jouer · ZQSD · souris · Échap : libérer la souris'; };
    room.spawn = function () { return { x: 0, z: 0, yaw: 0 }; };
    var camSmooth = 3.4;
    room.seatPose = function (dt) {
      var c = me.c, cp = Math.cos(cam.pitch), dx = Math.sin(cam.yaw) * cp, dy = Math.sin(cam.pitch), dz = -Math.cos(cam.yaw) * cp;
      if (me.r === 's' || !me.ready || !map) {
        var ey = c.y + (me.r === 's' ? PS.EYE : 1.6) + Math.sin(bob * 9) * 0.012 * Math.min(1, Math.hypot(c.vx, c.vz) / 4);
        var sj = shakeT > 0 ? shakeT * 0.1 : 0, sx = (Math.random() - 0.5) * sj, sy = (Math.random() - 0.5) * sj;
        return { cx: c.x, cy: ey + sy, cz: c.z, tx: c.x + dx * 5 + sx, ty: ey + dy * 5 + sy * 3, tz: c.z + dz * 5, fov: 74 };
      }
      var size = Math.max(c.h, c.r * 2), pivotY = c.y + Math.max(0.7, c.h * 0.65), want = 2.8 + size * 1.4, hit = PS.raycast(map, c.x, pivotY, c.z, cam.yaw + Math.PI, -cam.pitch, want + 0.4, []), dist = Math.min(want, Math.max(0.6, hit.t - 0.35));
      camSmooth += (dist - camSmooth) * Math.min(1, dt * (dist < camSmooth ? 18 : 3)); dist = Math.min(dist, camSmooth);
      return { cx: c.x - dx * dist, cy: Math.max(0.25, pivotY - dy * dist), cz: c.z - dz * dist, tx: c.x, ty: pivotY, tz: c.z, fov: 68 };
    };

    /* ---------- entrée / sortie ---------- */
    room.onEnter = function (w) {
      active = true; keys = {}; paused = true; firing = false; me.ready = false; me.rc = -1; snap = null; curPh = ''; mapId = ''; pending = []; seq = 0; inpAcc = 0; netErr = ''; myVote = ''; lastRole = ''; myBodyKey = '';
      oldFog = world.scene.fog; oldBg = world.scene.background; oldEnv = world.scene.environment;
      ui = buildUi();
      window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
      world.dom.addEventListener('mousedown', onMouseDown, true); window.addEventListener('mouseup', onMouseUp, true); document.addEventListener('mousemove', onMouseMove); world.dom.addEventListener('wheel', onWheel, { passive: false }); document.addEventListener('pointerlockchange', onLockChange);
      if (F.isStaff && !F.isStaff()) { w.flash('🔍 Prop Hunt en test', 'Réservé au Patron, au Co Fondateur et au Staff'); setTimeout(function () { world.goRoom('minijeux', 'prophunt'); }, 300); return; }
      if (!F.propJoin || !F.propJoin.room) { setTimeout(function () { world.goRoom('prophunt', 'prophuntgame'); }, 200); return; }
      myKey = F.me(); everOpen = false; failCount = 0; connect();
      w.sitDown(room);
      if (!F.token()) setTimeout(function () { if (active) world.goRoom('prophunt', 'prophuntgame'); }, 2500);
    };
    function cleanup() {
      if (!active) return; active = false; keys = {}; firing = false;
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
      world.dom.removeEventListener('mousedown', onMouseDown, true); window.removeEventListener('mouseup', onMouseUp, true); document.removeEventListener('mousemove', onMouseMove); world.dom.removeEventListener('wheel', onWheel); document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === world.dom) { try { document.exitPointerLock(); } catch (e) { /* ok */ } }
      if (ws) { var old = ws; ws = null; wsOk = false; try { old.close(); } catch (e) { /* ok */ } }
      Object.keys(remotes).forEach(dropRemote);
      if (propRoot) { g.remove(propRoot); propRoot.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); propRoot = null; } if (mapObj) { mapObj.dispose(); mapObj = null; } mapId = ''; map = null;
      if (myBody) { g.remove(myBody); myBody = null; }
      if (vm) vm.visible = false; if (origRender) { world.renderer.render = origRender; origRender = null; }
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      world.scene.fog = oldFog; world.scene.background = oldBg; world.scene.environment = oldEnv;
    }
    room.forceStand = function () { cleanup(); world.standUp(0, 0, 0); };
    room.onLeave = function () { cleanup(); };
    room.onPageHide = function () { cleanup(); };

    /* ---------- la boucle ---------- */
    room.update = function (dt) {
      if (!active) return;
      if (reconnectT > 0) { reconnectT -= dt; if (reconnectT <= 0 && active && (!ws || ws.readyState > 1)) connect(); }
      var c = me.c;
      // mes touches partent vers le serveur 30 fois par seconde ; je me déplace tout de suite (prédiction)
      if (me.ready && map) {
        var inp = readInput(); if (paused) { inp.f = 0; inp.s = 0; inp.jump = false; }
        inpAcc += dt; var nsend = 0;
        while (inpAcc >= 1 / 30 && nsend++ < 3) { inpAcc -= 1 / 30; seq++; pending.push({ seq: seq, inp: inp }); if (pending.length > 150) pending.shift(); wsSend({ t: 'in', seq: seq, f: inp.f, s: inp.s, run: inp.run ? 1 : 0, jump: inp.jump ? 1 : 0, yaw: +inp.yaw.toFixed(4), pitch: +inp.pitch.toFixed(4) }); }
        if (inpAcc > 0.2) inpAcc = 0;
        if (frozen()) { c.vx = 0; c.vz = 0; c.yaw = inp.yaw; c.pitch = inp.pitch; }
        else { var left = Math.min(dt, 0.1), sub; while (left > 1e-5) { sub = Math.min(left, 1 / 90); PS.stepPlayer(c, inp, sub, map); left -= sub; } }
        if (firing && me.r === 's' && WEAPONS[me.w].auto) fire();
      }
      var spd = Math.hypot(c.vx, c.vz); bob += dt * Math.min(1.5, spd / 4);
      // mon corps (objet) en 3e personne
      if (me.r === 'h' && me.ready) {
        var key = 'h:' + me.type + ':' + me.vr; if (key !== myBodyKey) { myBodyKey = key; if (myBody) g.remove(myBody); myBody = PM.build(me.type || 'crate', me.vr); g.add(myBody); }
        if (spd > 0.6 && !me.lk) { var want = Math.atan2(c.vx, c.vz); myHeading += angDiff(want, myHeading) * Math.min(1, dt * 12); }
        myBody.position.set(c.x, c.y, c.z); myBody.rotation.y = myHeading; myBody.visible = true;
      } else if (myBody) myBody.visible = false;
      // les autres
      var kk = 1 - Math.exp(-dt * 12), nowP = performance.now();
      Object.keys(remotes).forEach(function (k) {
        var r = remotes[k], age = Math.min(0.25, (nowP - r.recv) / 1000), px = r.tx + r.vx * age, pz = r.tz + r.vz * age, rs = Math.hypot(r.vx, r.vz);
        r.x += (px - r.x) * kk; r.z += (pz - r.z) * kk; r.y += (r.ty - r.y) * kk; r.yaw += angDiff(r.ta, r.yaw) * kk;
        r.grp.position.set(r.x, r.y, r.z);
        if (r.r === 'h') { if (rs > 0.6 && !r.lk) r.heading += angDiff(Math.atan2(r.vx, r.vz), r.heading) * Math.min(1, dt * 12); r.grp.rotation.y = r.heading; }
        else { r.grp.rotation.y = Math.PI - r.yaw; r.walk += dt * rs * 1.6; var lg = r.body && r.body.userData.legs; if (lg) { lg[0].rotation.x = Math.sin(r.walk * 3) * 0.6 * Math.min(1, rs / 3); lg[1].rotation.x = -Math.sin(r.walk * 3) * 0.6 * Math.min(1, rs / 3); } }
        // les noms : jamais au-dessus d'un objet vu par un chasseur (ça le trahirait)
        var showTag = r.r === 's' || me.r === 'h' || curPh === 'lobby'; r.tag.visible = showTag && r.k !== myKey; r.tag.position.set(r.x, r.y + (r.r === 's' ? 2.1 : (PS.PROPS[r.type] ? PS.PROPS[r.type][1] * 2 + 0.45 : 1.6)), r.z);
      });
      // armes / effets
      if (vm && me.r === 's') {
        kick = Math.max(0, kick - dt * 9); var b = vm.userData.base || VMBASE.pistolet, Wd = WEAPONS[me.w];
        var relDown = me.rl > 0 && Wd.reload > 0 ? Math.sin(Math.min(1, Math.max(0, 1 - Math.abs(me.rl / Wd.reload * 2 - 1))) * Math.PI / 2) : 0, mv = Math.min(1, spd / 4);
        vm.position.set(b.x + Math.sin(bob * 9) * 0.004 * mv, b.y - relDown * 0.16 + Math.abs(Math.cos(bob * 9)) * 0.004 * mv, b.z + kick * 0.05);
        vm.rotation.set(0.012 + kick * 0.07 - relDown * 0.55, vm.userData.yaw || 0.03, relDown * 0.2);
        if (muzzle) { muzzle.position.set(0, 0.012, -(vm.userData.muz || 0.15) - 0.04); if (muzzle.userData.t > 0) muzzle.userData.t -= dt; else muzzle.visible = false; }
        vm.visible = curPh !== 'hide' && curPh !== 'lobby';
      }
      fx.forEach(function (q) { if (q.life <= 0) return; q.life -= dt; if (q.life <= 0) { q.s.visible = false; return; } var u = q.life / q.max, sz = q.size * (1 + (1 - u) * q.grow); q.s.position.x += q.vx * dt; q.s.position.z += q.vz * dt; q.s.position.y += q.vy * dt; q.s.scale.set(Math.max(0.02, sz), Math.max(0.02, sz), 1); q.s.material.opacity = (q.kind ? q.op * Math.min(1, (1 - u) * 3) * Math.min(1, u * 2) : u); });
      rings.forEach(function (rg) { if (rg.life <= 0) return; rg.life -= dt; if (rg.life <= 0) { rg.m.visible = false; return; } var u = 1 - rg.life / rg.max; rg.m.scale.setScalar(0.5 + u * rg.R * 1.5); rg.m.material.opacity = (1 - u) * 0.8; });
      tracers.forEach(function (t) { if (t.life <= 0) return; t.life -= dt; if (t.life <= 0) t.l.visible = false; else t.l.material.opacity = t.life / (t.max || 0.07); });
      if (mflash) { if (flashT > 0) { flashT -= dt; mflash.intensity = flashT > 0 ? flashBase * (flashT / (flashBase > 3 ? 0.3 : 0.06)) : 0; } }
      if (shakeT > 0) shakeT -= dt;
      // l'objet visé (caché) : on le montre sous le viseur
      hudT -= dt; if (hudT <= 0) {
        hudT = 0.1;
        if (me.r === 'h' && map && me.ready) {
          var cm = room.seatPose(0), hitR = PS.raycast(map, cm.cx, cm.cy, cm.cz, cam.yaw, cam.pitch, 14, []); targetProp = null;
          if (hitR.kind === 'prop' && Math.hypot(hitR.ref.x - c.x, hitR.ref.z - c.z) <= 5.2 && hitR.ref.t !== me.type) targetProp = hitR.ref;
          if (ui) { ui.target.textContent = targetProp ? '🖱 Clic : devenir « ' + (NAMES[targetProp.t] || 'objet') + ' »' : (hitR.kind === 'prop' && hitR.ref.t !== me.type ? '(trop loin — approche-toi)' : ''); ui.target.classList.toggle('on', !!(ui.target.textContent)); }
        } else { targetProp = null; if (ui) ui.target.classList.remove('on'); }
        refreshHud();
      }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && ui) ui.toast.classList.remove('in'); }
      if (hurtT > 0) hurtT -= dt;
      if (mapObj) mapObj.update(dt, world.camera);
    };
    room._dbg = { me: me, remotes: remotes, cam: cam, keys: function () { return keys; }, snap: function () { return snap; }, net: function () { return { wsOk: wsOk, pending: pending.length, netErr: netErr, map: mapId, ph: curPh }; }, fire: fire, force: function (w) { me.r = 's'; curPh = 'hunt'; if (w) me.w = w; ensureViewmodel(); setViewWeapon(me.w, true); }, boom: boomFx, ev: onEvent, setPaused: function (v) { paused = v; }, setCam: function (y, p) { cam.yaw = y; cam.pitch = p; }, key: function (c, v) { keys[c] = v; } };
    return room;
  }

  F.propDbg = { makeSoldier: makeSoldier, loadWeapon: loadWeapon, WFILE: WFILE };
  F.registerRoom('prophuntgame', createRoom);
})();
