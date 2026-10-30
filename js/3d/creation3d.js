/* =====================================================================
   creation3d.js — Création du personnage 3D (monde 3D, PC)
   ---------------------------------------------------------------------
   Quand un joueur connecté n'a pas encore de personnage, un écran lui demande de le choisir : sexe, teint, coiffure, couleur des cheveux
   et barbe (hommes), avec un aperçu animé. Le choix est envoyé au serveur (api/accounts.js, action « set_look ») et il est DÉFINITIF :
   le serveur refuse toute modification ensuite. Le code de 5 caractères obtenu (voir persona3d.js) est celui que les autres joueurs voient.
   F3D.persona.ensureLook() : à appeler après la connexion et à l'ouverture du monde 3D ; ne fait rien si le personnage existe déjà.
   Fichiers liés : persona3d.js (le personnage et son aperçu), api/accounts.js (le serveur), index.html (appel après la connexion).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.persona || !F.createPlayer) return;
  var P = F.persona, busy = false;

  function api(body) {
    return fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': F.token() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); })
      .catch(function () { return { ok: false, error: 'Serveur injoignable. Vérifie ta connexion.' }; });
  }
  function hasLook() { try { return !!P.parseLook(state.look); } catch (e) { return false; } }
  function toast(m) { try { if (typeof showToast === 'function') showToast(m); } catch (e) { /* ok */ } }

  P.ensureLook = function () {
    if (busy || !F.canWorld() || !F.token() || !F.me() || hasLook()) return;
    busy = true;
    api({ action: 'get_look' }).then(function (r) {
      if (r && r.ok && r.look && P.parseLook(r.look)) { try { state.look = r.look; } catch (e) { /* ok */ } busy = false; return; }
      if (r && r.ok) openCreation(); else busy = false;       // erreur réseau : on réessaiera à la prochaine ouverture
    });
  };

  var CSS = '#crea3d{position:fixed;inset:0;z-index:100000;background:rgba(6,4,10,.9);display:flex;align-items:center;justify-content:center;padding:12px;font-family:inherit}' +
    '#crea3d .cr-box{display:flex;gap:22px;flex-wrap:wrap;justify-content:center;max-width:860px;width:100%;max-height:96vh;overflow:auto;padding:22px;border-radius:20px;background:linear-gradient(160deg,#1a1020,#0d0912);border:1px solid rgba(201,162,39,.55);box-shadow:0 20px 80px #000}' +
    '#crea3d .cr-prev{width:300px;max-width:100%;display:flex;flex-direction:column;align-items:center}' +
    '#crea3d canvas{width:300px;height:400px;max-width:100%;border-radius:14px;background:radial-gradient(circle at 50% 35%,#3a2438,#120b18);cursor:grab}' +
    '#crea3d .cr-opts{flex:1;min-width:280px;color:#f4e3b0}' +
    '#crea3d h2{font-size:24px;font-weight:800;color:#f3cf62;margin:0 0 4px}' +
    '#crea3d .cr-warn{font-size:13px;color:#ffb4a8;margin:0 0 14px}' +
    '#crea3d .cr-t{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c9b27a;margin:12px 0 6px}' +
    '#crea3d .cr-row{display:flex;gap:6px;flex-wrap:wrap}' +
    '#crea3d .cr-b{padding:7px 13px;border-radius:10px;border:1px solid rgba(201,162,39,.35);background:rgba(255,255,255,.05);color:#f4e3b0;font-weight:700;font-size:14px;cursor:pointer}' +
    '#crea3d .cr-b.on{background:#f3cf62;color:#1a1208;border-color:#f3cf62}' +
    '#crea3d .cr-b:disabled{opacity:.35;cursor:not-allowed}' +
    '#crea3d .cr-sw{width:34px;height:34px;border-radius:50%;border:3px solid transparent;cursor:pointer}' +
    '#crea3d .cr-sw.on{border-color:#fff}' +
    '#crea3d .cr-ok{margin-top:20px;width:100%;padding:13px;border-radius:12px;border:0;background:linear-gradient(90deg,#f5a623,#e07b00);color:#1a1208;font-size:16px;font-weight:800;cursor:pointer}' +
    '#crea3d .cr-ok:disabled{opacity:.5;cursor:wait}' +
    '#crea3d .cr-err{color:#ff8a80;font-size:13px;margin-top:8px;min-height:18px}';

  function openCreation() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ok */ }
    var look = P.lookFromName(F.me()); look.beard = 0;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var ov = document.createElement('div'); ov.id = 'crea3d';
    ov.innerHTML = '<div class="cr-box"><div class="cr-prev"><canvas width="600" height="800"></canvas><div style="color:#c9b27a;font-size:12px;margin-top:8px">Glisse pour tourner le personnage</div></div>' +
      '<div class="cr-opts"><h2>Crée ton personnage</h2><p class="cr-warn">⚠️ Ce choix est définitif : tu ne pourras plus le modifier ensuite.</p>' +
      '<div class="cr-t">Sexe</div><div class="cr-row" data-g="sex"></div>' +
      '<div class="cr-t">Teint</div><div class="cr-row" data-g="tone"></div>' +
      '<div class="cr-t">Coiffure</div><div class="cr-row" data-g="hair"></div>' +
      '<div class="cr-t">Couleur des cheveux</div><div class="cr-row" data-g="color"></div>' +
      '<div class="cr-t">Barbe</div><div class="cr-row" data-g="beard"></div>' +
      '<div class="cr-err"></div><button class="cr-ok">Valider mon personnage</button></div></div>';
    document.body.appendChild(ov);

    // aperçu : le vrai personnage, dans une petite scène à part
    var cv = ov.querySelector('canvas'), rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    rd.setPixelRatio(1); rd.setSize(600, 800, false);
    var sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 600 / 800, 0.1, 30); cam.position.set(0, 1.05, 5.2); cam.lookAt(0, 0.92, 0);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x554466, 1.15)); var dl = new THREE.DirectionalLight(0xfff0dc, 0.9); dl.position.set(2, 4, 5); sc.add(dl);
    var person = F.createPlayer('', '', P.lookCode(look)); person.tag.visible = false; sc.add(person.group);
    var rot = 0.4, drag = null, dead = false, raf = 0, last = performance.now();
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, r: rot }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) { if (drag) rot = drag.r + (e.clientX - drag.x) * 0.012; });
    cv.addEventListener('pointerup', function () { drag = null; });
    function frame(now) {
      if (dead) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!drag) rot += dt * 0.35;
      person.group.rotation.y = rot; person.group.visible = !!person._rig;
      person.stopWalk(); person.applyHold(dt);
      rd.render(sc, cam); raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    var rows = {};
    ['sex', 'tone', 'hair', 'color', 'beard'].forEach(function (k) { rows[k] = ov.querySelector('[data-g="' + k + '"]'); });
    function refresh() {
      person.setLook(P.lookCode(look));
      Array.prototype.forEach.call(ov.querySelectorAll('[data-k]'), function (b) { b.classList.toggle('on', String(look[b.dataset.k]) === b.dataset.v || (b.dataset.k === 'sex' && look.sex === b.dataset.v)); });
      Array.prototype.forEach.call(ov.querySelectorAll('[data-k="beard"]'), function (b) { b.disabled = look.sex === 'f'; });
    }
    function add(row, k, v, label, sw) {
      var b = document.createElement(sw ? 'div' : 'button'); b.dataset.k = k; b.dataset.v = String(v);
      if (sw) { b.className = 'cr-sw'; b.style.background = '#' + ('000000' + sw.toString(16)).slice(-6); b.title = label; } else { b.className = 'cr-b'; b.textContent = label; }
      b.addEventListener('click', function () { if (b.disabled) return; look[k] = k === 'sex' ? v : +v; if (k === 'sex' && v === 'f') look.beard = 0; refresh(); });
      rows[row].appendChild(b);
    }
    add('sex', 'sex', 'h', 'Homme'); add('sex', 'sex', 'f', 'Femme');
    add('tone', 'tone', 0, 'Foncé'); add('tone', 'tone', 1, 'Clair');
    P.HAIR_STYLE_NAMES.forEach(function (n, i) { add('hair', 'hair', i, n); });
    P.HAIR_COLORS.forEach(function (c, i) { add('color', 'color', i, P.HAIR_COLOR_NAMES[i], c); });
    add('beard', 'beard', 0, 'Aucune'); add('beard', 'beard', 1, 'Barbe');
    refresh();

    function close() { dead = true; cancelAnimationFrame(raf); try { person.dispose(); rd.dispose(); } catch (e) { /* ok */ } ov.remove(); st.remove(); busy = false; }
    var ok = ov.querySelector('.cr-ok'), err = ov.querySelector('.cr-err');
    ok.addEventListener('click', function () {
      if (!window.confirm('Valider ce personnage ? Tu ne pourras plus le changer.')) return;
      ok.disabled = true; err.textContent = '';
      api({ action: 'set_look', look: P.lookCode(look) }).then(function (r) {
        if (r && (r.ok || r.look)) {
          try { state.look = r.look || P.lookCode(look); } catch (e) { /* ok */ }
          close(); toast('🧍 Ton personnage est créé !'); return;
        }
        ok.disabled = false; err.textContent = (r && r.error) || 'Impossible de valider, réessaie.';
      });
    });
  }
})();
