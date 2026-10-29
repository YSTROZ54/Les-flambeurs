/* =====================================================================
   shop3d.js — La Boutique 3D des Flambeurs (PC seulement, dans le monde 3D)
   ---------------------------------------------------------------------
   Une grande galerie de luxe avec SIX vendeurs. Chaque vendeur a son stand et sa propre catégorie :
     Neil (fusées du Crash) · Victor (poker) · Merlin (gobelets) · Rosa (blackjack) · Max (machines à sous) · Cléo (avatars).
   On marche jusqu'à un vendeur, on appuie sur E (ou on clique dessus) : la caméra se tourne vers lui et un panneau
   montre SES articles. Les achats passent par les fonctions déjà présentes dans la page (buySkin / equipSkin) :
   mêmes prix, même vérification par le serveur. Cette salle ne s'occupe que de ce qu'on voit et du bon bouton.
   Les autres joueurs sont visibles dans la boutique (canal temps réel de f3d-core.js) et on voit passer
   un message quand quelqu'un achète quelque chose.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte « Boutique »).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, EMOJI = F.EMOJI_FONT, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 12, HZ = 11;   // demi-largeur et demi-profondeur de la galerie (mètres)

  /* ---------- petits outils ---------- */
  var matCache = {};
  function lam(c) { var k = 'l' + c; return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial({ color: c })); }
  function bas(c) { var k = 'b' + c; return matCache[k] || (matCache[k] = new THREE.MeshBasicMaterial({ color: c })); }
  function std(c, rough, metal, emi) { var k = 's' + c + '_' + rough + '_' + metal + '_' + (emi || 0); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, emissive: emi || 0 })); }
  var GOLD = function () { return std(0xc9a227, 0.3, 0.6, 0x2a1d00); };
  function box(parent, w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
  function cyl(parent, rt, rb, h, mat, x, y, z, seg) { var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), mat); m.position.set(x, y, z); parent.add(m); return m; }
  function sph(parent, r, mat, x, y, z, sx, sy, sz) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); m.position.set(x, y, z); if (sx) m.scale.set(sx, sy, sz); parent.add(m); return m; }
  function cssHex(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- le catalogue vient de la page (SHOP_CATALOG) ---------- */
  function catalog() { try { return (typeof SHOP_CATALOG !== 'undefined' && SHOP_CATALOG) || []; } catch (e) { return []; } }
  function itemsOf(key) { return catalog().filter(function (i) { return i.group === key; }); }
  function findItem(id) { return catalog().filter(function (i) { return i.id === id; })[0] || null; }
  var EMO_RE = null;
  try { EMO_RE = new RegExp('^\\s*((?:\\p{Extended_Pictographic}|\\uFE0F|\\u200D)+)\\s*', 'u'); } catch (e) { EMO_RE = null; }
  function splitName(n) {
    var m = EMO_RE && EMO_RE.exec(n || '');
    return m ? { icon: m[1], text: String(n).slice(m[0].length) } : { icon: '🛍️', text: String(n || '') };
  }
  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function owned(id) { var s = st(); return !!(s && s.ownedSkins && s.ownedSkins.indexOf(id) >= 0); }
  function equipped(it) { var s = st(); return !!(s && s.equipped && s.equipped[it.category] === it.id); }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }

  /* ---------- les six vendeurs : emplacement sur le mur, tenue et accessoires ---------- */
  // x, z : place sur le mur ; nx, nz : direction vers l'intérieur de la salle
  var SELLERS = [
    {
      key: 'crashVehicle', name: 'Neil', avatar: '🚀', role: 'l\'astronaute', icon: '🚀', title: 'FUSÉES & VÉHICULES', sub: 'RAYON FUSÉE CRASH', color: 0x9ab8ff,
      x: -4.5, z: -HZ, nx: 0, nz: 1, skin: 0xf1c9a5, shirt: 0xdfe5ee, pants: 0xdfe5ee, hair: 0x3b2314,
      hello: ['Houston, on a un client ! Regarde mes véhicules pour le Crash.', 'Prêt au décollage ? Choisis ta monture !'], thanks: ['Décollage réussi ! Bon vol.', 'Excellent choix, ça va monter haut !'],
      dress: function (g) {
        var glass = new THREE.MeshPhongMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.3, shininess: 90, depthWrite: false });
        sph(g, 0.215, glass, 0, 1.76, 0);
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20), lam(0xffffff)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.6; g.add(ring);
        box(g, 0.34, 0.5, 0.16, lam(0x9aa3b5), 0, 1.3, -0.25);
        box(g, 0.18, 0.12, 0.02, bas(0x4aa8ff), 0, 1.38, 0.2);
        cyl(g, 0.205, 0.205, 0.06, lam(0xff7a1a), 0, 1.05, 0);
      },
      prop: function (p) {
        cyl(p, 0.07, 0.07, 0.34, lam(0xffffff), 0, 0.17, 0); cyl(p, 0.0, 0.07, 0.16, lam(0xe03030), 0, 0.42, 0);
        [0, 1, 2].forEach(function (i) { var a = i * TAU / 3; box(p, 0.02, 0.14, 0.09, lam(0xe03030), Math.cos(a) * 0.09, 0.07, Math.sin(a) * 0.09).rotation.y = -a; });
      }
    },
    {
      key: 'poker', name: 'Victor', avatar: '♠️', role: 'le croupier de poker', icon: '♠️', title: 'POKER', sub: 'TAPIS & CARTES', color: 0x7ee0a0,
      x: 4.5, z: -HZ, nx: 0, nz: 1, skin: 0xc68642, shirt: 0xf4f4f4, pants: 0x14161e, hair: 0x1a1210,
      hello: ['Bienvenue à ma table. Des tapis et des cartes pour tous les styles.', 'Fais tes jeux ! Je te montre mes plus beaux tapis.'], thanks: ['Rien ne va plus… et c\'est à toi !', 'Élégant. Les autres joueurs vont être jaloux.'],
      dress: function (g) {
        cyl(g, 0.215, 0.185, 0.46, lam(0x12301f), 0, 1.28, 0);
        box(g, 0.05, 0.04, 0.02, lam(0xd02a2a), -0.045, 1.54, 0.205).rotation.z = 0.35; box(g, 0.05, 0.04, 0.02, lam(0xd02a2a), 0.045, 1.54, 0.205).rotation.z = -0.35;
        cyl(g, 0.15, 0.15, 0.04, lam(0x1d8a4e), 0, 1.87, 0);
        box(g, 0.3, 0.015, 0.15, new THREE.MeshLambertMaterial({ color: 0x2fcf7a, transparent: true, opacity: 0.8 }), 0, 1.86, 0.15);
      },
      prop: function (p) {
        [[-0.12, 0xd02a2a, 5], [0, 0x1f4e9e, 4], [0.12, 0x111111, 6]].forEach(function (c) {
          for (var i = 0; i < c[2]; i++) cyl(p, 0.045, 0.045, 0.02, lam(c[1]), c[0], 0.01 + i * 0.022, 0, 16);
        });
        for (var k = 0; k < 4; k++) { var cd = box(p, 0.07, 0.003, 0.1, lam(0xf4f4f4), 0.28 + k * 0.05, 0.003 + k * 0.001, 0.02); cd.rotation.y = -0.5 + k * 0.28; }
      }
    },
    {
      key: 'cupBall', name: 'Merlin', avatar: '🎩', role: 'le magicien', icon: '🥤', title: 'GOBELETS', sub: 'BILLES MAGIQUES', color: 0xffe08a,
      x: -HX, z: -3, nx: 1, nz: 0, skin: 0xe0ac82, shirt: 0x5b2a9a, pants: 0x14101c, hair: 0xcfcfcf,
      hello: ['Abracadabra ! Quelle bille se cache sous quel gobelet ?', 'Approche… mes billes brillent d\'un éclat magique.'], thanks: ['Tada ! Elle est à toi.', 'Tu as l\'œil. La magie fera le reste.'],
      dress: function (g, p) {
        box(g, 0.46, 0.9, 0.03, lam(0x2a0f4a), 0, 1.25, -0.22);
        cyl(g, 0.12, 0.12, 0.3, lam(0x0e0a14), 0, 2.03, 0); cyl(g, 0.21, 0.21, 0.02, lam(0x0e0a14), 0, 1.89, 0); cyl(g, 0.123, 0.123, 0.04, std(0xc9a227, 0.3, 0.6, 0x2a1d00), 0, 1.95, 0);
        var wand = cyl(p.arms[1], 0.012, 0.012, 0.4, lam(0x111111), 0, -0.6, 0.12, 8); wand.rotation.x = Math.PI / 2;
        sph(p.arms[1], 0.025, bas(0xfff3a0), 0, -0.6, 0.33);
      },
      tagY: 2.4,
      prop: function (p) {
        [-0.14, 0, 0.14].forEach(function (x) { cyl(p, 0.05, 0.08, 0.12, lam(0xd02a2a), x, 0.06, 0, 14); });
        sph(p, 0.025, std(0xf3cf62, 0.2, 0.8, 0x6a4500), 0.27, 0.025, 0.04);
      }
    },
    {
      key: 'bjCardSkin', name: 'Rosa', avatar: '🃏', role: 'la croupière de blackjack', icon: '🃏', title: 'BLACKJACK', sub: 'STYLES DE CARTES', color: 0xff8a8a,
      x: HX, z: -3, nx: -1, nz: 0, skin: 0x8d5524, shirt: 0xf4f4f4, pants: 0x4a0f1a, hair: 0x3b1a14,
      hello: ['21 ? Pas de souci… avec le bon paquet, tout est plus classe.', 'Mes cartes sont les plus stylées de la ville.'], thanks: ['Une belle main t\'attend !', 'Superbe. Que la chance soit avec toi.'],
      dress: function (g) {
        cyl(g, 0.215, 0.185, 0.46, lam(0x9c1428), 0, 1.28, 0);
        box(g, 0.05, 0.04, 0.02, lam(0x111111), -0.045, 1.54, 0.205).rotation.z = 0.35; box(g, 0.05, 0.04, 0.02, lam(0x111111), 0.045, 1.54, 0.205).rotation.z = -0.35;
        sph(g, 0.16, lam(0x3b1a14), 0, 1.74, -0.03, 1, 1.05, 1); sph(g, 0.09, lam(0x3b1a14), 0, 1.58, -0.14, 1, 2.2, 1);
      },
      prop: function (p) {
        for (var k = 0; k < 5; k++) { var c = box(p, 0.08, 0.003, 0.115, lam(k % 2 ? 0xf4f4f4 : 0xe9e1d0), -0.1 + k * 0.05, 0.003 + k * 0.001, 0); c.rotation.y = -0.6 + k * 0.3; }
        for (var s = 0; s < 6; s++) box(p, 0.08, 0.004, 0.115, lam(0xf4f4f4), 0.32, 0.003 + s * 0.004, 0.02);
      }
    },
    {
      key: 'slotCabinet', name: 'Max', avatar: '🎰', role: 'le technicien', icon: '🎰', title: 'MACHINES À SOUS', sub: 'HABILLAGES DE BORNES', color: 0xffb347,
      x: -HX, z: 4, nx: 1, nz: 0, skin: 0xffdbac, shirt: 0x1d4ed8, pants: 0x1d4ed8, hair: 0x6b4423,
      hello: ['Je relooke les bornes ! Une machine neuve, ça porte chance.', 'Regarde ces habillages : du classique au lingot d\'or.'], thanks: ['Je te l\'installe tout de suite !', 'Ta borne va faire des envieux.'],
      dress: function (g) {
        var hat = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 10, 0, TAU, 0, Math.PI / 2), lam(0xffd21a)); hat.position.set(0, 1.78, 0); g.add(hat);
        cyl(g, 0.21, 0.21, 0.02, lam(0xffd21a), 0, 1.79, 0.03, 18);
        cyl(g, 0.205, 0.205, 0.05, lam(0x6b4423), 0, 1.05, 0); box(g, 0.05, 0.12, 0.05, lam(0x9aa3b5), 0.2, 0.98, 0.1);
      },
      prop: function (p) {
        box(p, 0.2, 0.3, 0.14, lam(0x6a2bb0), 0, 0.15, 0); box(p, 0.15, 0.1, 0.01, bas(0xffd24a), 0, 0.22, 0.075);
        cyl(p, 0.012, 0.012, 0.16, lam(0xcccccc), 0.12, 0.2, 0, 8); sph(p, 0.025, lam(0xe03030), 0.12, 0.3, 0);
      }
    },
    {
      key: 'avatar', name: 'Cléo', avatar: '📸', role: 'la photographe', icon: '👤', title: 'AVATARS & PROFIL', sub: 'TON PORTRAIT', color: 0xffc0e0,
      x: HX, z: 4, nx: -1, nz: 0, skin: 0xd9a066, shirt: 0xc2185b, pants: 0x1a1020, hair: 0x1a1210,
      hello: ['Souris ! Je t\'offre un nouveau visage pour ton profil.', 'Un avatar, c\'est ta signature dans tout le casino.'], thanks: ['Clic ! Superbe photo.', 'Tu vas faire sensation à la table.'],
      dress: function (g) {
        sph(g, 0.15, lam(0x7c1d3a), 0.02, 1.9, 0, 1, 0.4, 1); cyl(g, 0.012, 0.012, 0.05, lam(0x7c1d3a), 0.02, 1.96, 0, 6);
        box(g, 0.2, 0.13, 0.1, lam(0x1a1a1a), 0, 1.38, 0.23); cyl(g, 0.05, 0.05, 0.08, lam(0xc8ced8), 0, 1.38, 0.3, 14).rotation.x = Math.PI / 2;
        box(g, 0.04, 0.02, 0.02, bas(0xffffff), 0.07, 1.46, 0.23);
      },
      prop: function (p) {
        [-0.06, 0.06, 0].forEach(function (x, i) { var l = cyl(p, 0.008, 0.008, 0.42, lam(0x222222), x, 0.2, i === 2 ? -0.07 : 0.04, 6); l.rotation.z = x * 2.4; });
        box(p, 0.14, 0.09, 0.08, lam(0x1a1a1a), 0, 0.46, 0); cyl(p, 0.035, 0.035, 0.06, lam(0xc8ced8), 0, 0.46, 0.07, 12).rotation.x = Math.PI / 2;
      }
    }
  ];

  /* ---------- panneaux (canvas) ---------- */
  function signTexture(def, n, w, h) {
    var c = mkCanvas(w, h), x = c.getContext('2d'), col = cssHex(def.color);
    x.fillStyle = '#120a14'; x.fillRect(0, 0, w, h);
    var gr = x.createRadialGradient(w * 0.2, h / 2, 10, w * 0.2, h / 2, w * 0.6); gr.addColorStop(0, col + '55'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#c9a227'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12); x.lineWidth = 2; x.strokeRect(20, 20, w - 40, h - 40);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = Math.round(h * 0.52) + 'px ' + EMOJI; x.fillStyle = '#fff'; x.fillText(def.icon, h * 0.62, h * 0.52);
    x.fillStyle = '#f3cf62'; x.shadowColor = col; x.shadowBlur = 16; x.font = '900 ' + Math.round(h * 0.25) + 'px ' + SERIF;
    x.fillText(def.title, w * 0.56, h * 0.38, w - h * 1.3);
    x.shadowBlur = 0; x.fillStyle = '#d9c88f'; x.font = '600 ' + Math.round(h * 0.13) + 'px ' + MONO;
    x.fillText(def.sub + ' · ' + n + ' ARTICLES', w * 0.56, h * 0.7, w - h * 1.3);
    return mkTex(c);
  }
  function medalTexture(icon) {
    var c = mkCanvas(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 6, 64, 64, 62); g.addColorStop(0, '#2a1a30'); g.addColorStop(1, '#0d0712');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, TAU); x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '68px ' + EMOJI; x.fillStyle = '#fff'; x.fillText(icon, 64, 70);
    return mkTex(c);
  }

  /* ---------- styles du panneau d'achat (injectés une seule fois) ---------- */
  function injectCss() {
    if (document.getElementById('shp-style')) return;
    var s = document.createElement('style'); s.id = 'shp-style';
    s.textContent =
      '.shp{position:absolute;inset:0;pointer-events:none;z-index:5;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#f4e3b0}' +
      '.shp-panel{position:absolute;top:56px;bottom:12px;right:12px;width:min(480px,48%);min-width:340px;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;pointer-events:auto;' +
      'background:linear-gradient(180deg,rgba(24,14,26,.95),rgba(10,6,14,.96));border:1.5px solid #c9a227;box-shadow:0 0 30px rgba(0,0,0,.6),0 0 24px rgba(255,200,60,.18)}' +
      '.shp-head{display:flex;align-items:center;gap:10px}' +
      '.shp-ava{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;background:#1a0f1e;border:2px solid var(--shp-c,#c9a227);flex:none}' +
      '.shp-who{flex:1;min-width:0}.shp-who b{display:block;font-family:"Cinzel",Georgia,serif;font-size:17px;color:#f3cf62;line-height:1.1}' +
      '.shp-who small{color:#bfae78;font-size:11.5px;font-weight:700}' +
      '.shp-x{pointer-events:auto;cursor:pointer;background:rgba(8,5,12,.85);color:#f3cf62;border:1px solid rgba(201,162,39,.6);border-radius:10px;font-weight:800;font-size:12px;padding:8px 10px;white-space:nowrap}' +
      '.shp-x:hover{background:rgba(60,40,10,.95)}' +
      '.shp-say{background:rgba(255,255,255,.06);border-left:3px solid var(--shp-c,#c9a227);border-radius:8px;padding:8px 10px;font-size:12.5px;font-style:italic;color:#eadcb0;line-height:1.35}' +
      '.shp-bal{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;color:#bfae78}.shp-bal b{color:#ffd24a;font-family:"Orbitron",monospace;font-size:15px}' +
      '.shp-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:7px;padding-right:3px;scrollbar-width:thin;scrollbar-color:#6a5314 transparent}' +
      '.shp-card{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14)}' +
      '.shp-card.eq{border-color:#34d399;background:rgba(16,185,129,.1)}' +
      '.shp-ic{width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;font-size:28px;border-radius:12px;background:rgba(0,0,0,.35)}' +
      '.shp-info{flex:1;min-width:0}.shp-info b{display:block;font-size:13px;color:#fff;line-height:1.2}.shp-info span{display:block;font-size:11px;color:#a89d80;line-height:1.25;margin-top:2px}' +
      '.shp-act{display:flex;flex-direction:column;align-items:stretch;gap:4px;flex:none;width:112px}' +
      '.shp-act em{font-style:normal;font-family:"Orbitron",monospace;font-size:11px;font-weight:800;color:#ffd24a;text-align:center}.shp-act em.free{color:#34d399}' +
      '.shp-act button{cursor:pointer;border-radius:9px;font-weight:900;font-size:11.5px;padding:7px 4px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff}' +
      '.shp-act button:hover{background:rgba(255,255,255,.2)}' +
      '.shp-act button.buy{background:linear-gradient(180deg,#e2b533,#9a6f10);color:#1a1000;border-color:#ffe08a}.shp-act button.buy:hover{filter:brightness(1.12)}' +
      '.shp-act button.no{filter:grayscale(.8) brightness(.65);cursor:not-allowed}' +
      '.shp-act button:disabled{opacity:.7;cursor:default}' +
      '.shp-act .on{color:#34d399;text-align:center;font-weight:900;font-size:11.5px;padding:7px 0}' +
      '.shp-msg{min-height:18px;text-align:center;font-size:12.5px;font-weight:800;color:#ffe08a}' +
      '@media (max-width:900px){.shp-panel{width:calc(100% - 24px)}}';
    document.head.appendChild(s);
  }

  /* ===================== LA SALLE ===================== */
  function createShopRoom(world) {
    var low = world.low;
    var room = { title: '🛍️ BOUTIQUE', subtitle: 'SIX VENDEURS · SIX UNIVERS', topic: 'flambeurs-shop-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.8, xMax: HX - 0.8, zMin: -HZ + 0.8, zMax: HZ - 0.8 };
    var gold = GOLD();
    var clockT = 0, medals = [], sellers = [], talk = null, camSeller = null, overlay = null, busy = false, msgT = null;
    var coin = null;

    /* --- sol : marbre ivoire et lignes dorées --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d');
    fx.fillStyle = '#e6dfd0'; fx.fillRect(0, 0, 256, 256);
    fx.fillStyle = '#d3c9b4'; fx.fillRect(0, 0, 128, 128); fx.fillRect(128, 128, 128, 128);
    fx.globalAlpha = 0.08; for (var i = 0; i < 120; i++) { fx.fillStyle = i % 2 ? '#fff' : '#5a4a30'; fx.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 30, 1); }
    fx.globalAlpha = 1; fx.strokeStyle = 'rgba(201,162,39,0.8)'; fx.lineWidth = 3; fx.strokeRect(1, 1, 254, 254);
    fx.beginPath(); fx.moveTo(128, 0); fx.lineTo(128, 256); fx.moveTo(0, 128); fx.lineTo(256, 128); fx.lineWidth = 1.5; fx.stroke();
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, color: 0xb9b1a2, roughness: 0.28, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* --- tapis rouge royal de la porte jusqu'au centre --- */
    var cc = mkCanvas(128, 512), cx = cc.getContext('2d');
    cx.fillStyle = '#6e0f22'; cx.fillRect(0, 0, 128, 512);
    cx.strokeStyle = '#c9a227'; cx.lineWidth = 6; cx.strokeRect(8, 0, 112, 512); cx.lineWidth = 2; cx.strokeRect(18, 0, 92, 512);
    cx.fillStyle = 'rgba(201,162,39,0.55)'; for (var d = 0; d < 8; d++) { cx.save(); cx.translate(64, 32 + d * 64); cx.rotate(Math.PI / 4); cx.fillRect(-9, -9, 18, 18); cx.restore(); }
    var carpet = new THREE.Mesh(new THREE.PlaneGeometry(3, HZ - 1.6), new THREE.MeshLambertMaterial({ map: mkTex(cc) }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.012, (HZ + 1.6) / 2); g.add(carpet);

    /* --- murs sombres à panneaux dorés, plafond à caissons --- */
    function wallTex(len) {
      var c = mkCanvas(256, 512), x = c.getContext('2d');
      x.fillStyle = '#1b1424'; x.fillRect(0, 0, 256, 512);
      x.fillStyle = '#241a30'; x.fillRect(16, 90, 224, 340);
      x.strokeStyle = 'rgba(201,162,39,0.75)'; x.lineWidth = 3; x.strokeRect(16, 90, 224, 340); x.lineWidth = 1.5; x.strokeRect(26, 100, 204, 320);
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 4, 1); t.anisotropy = 4; return t;
    }
    var H = 8;
    function wall(len, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshLambertMaterial({ map: wallTex(len) })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    [0.1, 7.9].forEach(function (y) {
      [[HX * 2, 0.12, 0.12, 0, y, -HZ + 0.06], [HX * 2, 0.12, 0.12, 0, y, HZ - 0.06], [0.12, 0.12, HZ * 2, -HX + 0.06, y, 0], [0.12, 0.12, HZ * 2, HX - 0.06, y, 0]].forEach(function (b) { box(g, b[0], b[1], b[2], gold, b[3], b[4], b[5]); });
    });
    var cl = mkCanvas(256, 256), clx = cl.getContext('2d');
    clx.fillStyle = '#0d0810'; clx.fillRect(0, 0, 256, 256); clx.strokeStyle = 'rgba(201,162,39,0.6)'; clx.lineWidth = 4; clx.strokeRect(2, 2, 252, 252); clx.lineWidth = 1.5; clx.strokeRect(24, 24, 208, 208);
    var ct = new THREE.CanvasTexture(cl); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(HX / 2, HZ / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ map: ct }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* --- grande enseigne au centre du mur du fond --- */
    var sg = mkCanvas(1024, 256), sx = sg.getContext('2d');
    sx.fillStyle = '#12080f'; sx.fillRect(0, 0, 1024, 256); sx.strokeStyle = '#c9a227'; sx.lineWidth = 8; sx.strokeRect(8, 8, 1008, 240);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#f3cf62'; sx.shadowColor = '#ffb300'; sx.shadowBlur = 20;
    sx.font = '900 84px ' + SERIF; sx.fillText('LA BOUTIQUE', 512, 96, 960);
    sx.shadowBlur = 0; sx.fillStyle = '#d9c88f'; sx.font = '600 32px ' + MONO; sx.fillText('✦  SIX VENDEURS · SIX UNIVERS  ✦', 512, 188, 960);
    var bigSign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: mkTex(sg) }));
    bigSign.position.set(0, 5.6, -HZ + 0.06); g.add(bigSign);

    /* --- colonnes aux quatre coins --- */
    var colMat = std(0x1a0f18, 0.55, 0.2);
    [[-HX + 1.1, -HZ + 1.1], [HX - 1.1, -HZ + 1.1], [-HX + 1.1, HZ - 1.1], [HX - 1.1, HZ - 1.1]].forEach(function (p) {
      cyl(g, 0.42, 0.46, H, colMat, p[0], H / 2, p[1], 18);
      [0.3, H - 0.3].forEach(function (y) { var r = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), gold); r.rotation.x = Math.PI / 2; r.position.set(p[0], y, p[1]); g.add(r); });
      room.colliders.push({ x: p[0], z: p[1], r: 0.9 });
    });

    /* --- pièce maîtresse au centre : grande pièce d'or qui tourne sur un piédestal de marbre --- */
    var marble = std(0xe8e0d0, 0.25, 0.1);
    cyl(g, 1.3, 1.45, 0.5, marble, 0, 0.25, 0, 32); var rimR = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.06, 8, 40), gold); rimR.rotation.x = Math.PI / 2; rimR.position.y = 0.5; g.add(rimR);
    cyl(g, 0.22, 0.34, 1.3, gold, 0, 1.15, 0, 16);
    var coinC = mkCanvas(256, 256), coinX = coinC.getContext('2d');
    var cg = coinX.createRadialGradient(128, 128, 20, 128, 128, 126); cg.addColorStop(0, '#ffe9a0'); cg.addColorStop(1, '#b8860b');
    coinX.fillStyle = cg; coinX.fillRect(0, 0, 256, 256); coinX.strokeStyle = '#7a5a08'; coinX.lineWidth = 8; coinX.beginPath(); coinX.arc(128, 128, 112, 0, TAU); coinX.stroke();
    coinX.fillStyle = '#7a5a08'; coinX.font = '900 120px ' + SERIF; coinX.textAlign = 'center'; coinX.textBaseline = 'middle'; coinX.fillText('F', 128, 138);
    var coinMat = [std(0xd9a826, 0.25, 0.85, 0x3a2800), new THREE.MeshStandardMaterial({ map: mkTex(coinC), roughness: 0.3, metalness: 0.7 }), new THREE.MeshStandardMaterial({ map: mkTex(coinC), roughness: 0.3, metalness: 0.7 })];
    coin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 40), coinMat); coin.rotation.x = Math.PI / 2; coin.position.y = 2.5;
    var coinPivot = new THREE.Group(); coinPivot.position.y = 0; coinPivot.add(coin); g.add(coinPivot);
    room.colliders.push({ x: 0, z: 0, r: 1.8 });

    /* --- lustres --- */
    function chandelier(x, z, r, y) {
      var c = new THREE.Group(); c.position.set(x, y, z); g.add(c);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 40), gold); ring.rotation.x = Math.PI / 2; c.add(ring);
      cyl(c, 0.02, 0.02, H - y, gold, 0, (H - y) / 2, 0, 6);
      var nb = low ? 10 : 18, bm = bas(0xffe3a8), bg = new THREE.SphereGeometry(0.07, 8, 6);
      for (var b = 0; b < nb; b++) { var m = new THREE.Mesh(bg, bm); var an = b / nb * TAU; m.position.set(Math.cos(an) * r, 0.1, Math.sin(an) * r); c.add(m); }
    }
    chandelier(0, 0, 2.4, 6.4); chandelier(-7, 2, 1.4, 6.6); chandelier(7, 2, 1.4, 6.6); chandelier(0, 7.5, 1.4, 6.6);

    /* --- lumières --- */
    g.add(new THREE.AmbientLight(0xb8a8d8, 0.95));
    var key = new THREE.DirectionalLight(0xfff0d0, 0.5); key.position.set(3, 8, 5); g.add(key);
    var pl = new THREE.PointLight(0xffd9a0, 1.0, 28); pl.position.set(0, 6, 0); g.add(pl);
    if (!low) { var p2 = new THREE.PointLight(0xffb070, 0.55, 22); p2.position.set(0, 3, -7); g.add(p2); }

    /* --- porte de retour vers le hall --- */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.2, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });

    /* --- les six stands --- */
    function toWorld(def, lx, lz) {   // repère du stand (x = à droite en regardant le vendeur, z = vers la salle) -> repère du monde
      var th = Math.atan2(def.nx, def.nz);
      return { x: def.x + lx * Math.cos(th) + lz * Math.sin(th), z: def.z - lx * Math.sin(th) + lz * Math.cos(th) };
    }

    SELLERS.forEach(function (def) {
      var items = itemsOf(def.key), n = items.length;
      var th = Math.atan2(def.nx, def.nz);
      var st0 = new THREE.Group(); st0.position.set(def.x, 0, def.z); st0.rotation.y = th; g.add(st0);

      // fond de velours teinté + cadre doré + enseigne
      var velvet = new THREE.Color(def.color).multiplyScalar(0.2);
      box(st0, 4.4, 3, 0.1, lam(velvet.getHex()), 0, 1.5, 0.06);
      box(st0, 4.6, 0.12, 0.16, gold, 0, 3.04, 0.1); box(st0, 4.6, 0.12, 0.16, gold, 0, 0.0, 0.1);
      box(st0, 0.12, 3.1, 0.16, gold, -2.3, 1.55, 0.1); box(st0, 0.12, 3.1, 0.16, gold, 2.3, 1.55, 0.1);
      [-1.7, 1.7].forEach(function (x) { sph(st0, 0.09, bas(0xfff0c0), x, 2.6, 0.2); });
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: signTexture(def, n, 1024, 256) }));
      sign.position.set(0, 3.75, 0.1); st0.add(sign);

      // comptoir en bois sombre, plateau doré, néon à la couleur du rayon
      box(st0, 2.8, 0.96, 0.8, lam(0x2a1210), 0, 0.48, 2.0);
      box(st0, 2.92, 0.06, 0.92, gold, 0, 0.99, 2.0);
      box(st0, 2.8, 0.05, 0.02, bas(def.color), 0, 0.2, 2.41);
      box(st0, 2.4, 0.5, 0.01, lam(0x180a0c), 0, 0.55, 2.405);
      // petit tapis lumineux au sol
      var pool = new THREE.Mesh(new THREE.CircleGeometry(2.3, 28), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.16, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.016, 2.4); st0.add(pool);
      // poteaux dorés et cordes de velours sur les côtés (ils ferment l'espace derrière le comptoir)
      [-1, 1].forEach(function (s) {
        [0.3, 1.2, 2.1].forEach(function (z) {
          cyl(st0, 0.035, 0.05, 0.9, gold, s * 1.95, 0.45, z, 8); sph(st0, 0.06, gold, s * 1.95, 0.93, z);
          var l = toWorld(def, s * 1.95, z); room.colliders.push({ x: l.x, z: l.z, r: 0.5 });
        });
        [0.75, 1.65].forEach(function (z) { var rope = cyl(st0, 0.018, 0.018, 0.9, lam(0x8a0f24), s * 1.95, 0.78, z, 6); rope.rotation.x = Math.PI / 2; });
      });
      [-1.2, -0.4, 0.4, 1.2].forEach(function (x) { var l = toWorld(def, x, 2.0); room.colliders.push({ x: l.x, z: l.z, r: 0.6 }); });

      // accessoire sur le comptoir
      var prop = new THREE.Group(); prop.position.set(1.0, 1.02, 2.0); st0.add(prop); def.prop(prop);

      // vitrine : un médaillon tournant par article du rayon, au-dessus du comptoir
      var step = Math.min(0.34, 2.0 / Math.max(1, n));
      items.forEach(function (it, k) {
        var m = new THREE.Group(); m.position.set(-0.25 + (k - (n - 1) / 2) * step, 1.3, 2.0); st0.add(m);
        var ringM = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.017, 8, 24), gold); m.add(ringM);
        var disc = new THREE.Mesh(new THREE.CircleGeometry(0.122, 24), new THREE.MeshBasicMaterial({ map: medalTexture(splitName(it.name).icon), side: THREE.DoubleSide })); m.add(disc);
        medals.push({ g: m, y: 1.3, ph: k * 0.9 });
      });

      // le vendeur (derrière le comptoir, tourné vers la salle)
      var person = F.createPerson(def.name, def.avatar), pg = person.group, wp = toWorld(def, 0, 0.95);
      pg.position.set(wp.x, 0, wp.z); pg.rotation.y = th;
      var kids = pg.children;
      kids[0].material.color.setHex(def.pants); kids[1].material.color.setHex(def.shirt); kids[3].material.color.setHex(def.skin);
      kids.forEach(function (c) { if (c.geometry && c.geometry.parameters && c.geometry.parameters.radius === 0.152) c.material.color.setHex(def.hair); });
      var tag = kids[kids.length - 1]; tag.position.y = def.tagY || 2.25; tag.scale.set(1.15, 0.255, 1);   // l'étiquette est le dernier élément créé : à lire avant les accessoires
      def.dress(pg, person);
      g.add(pg);
      // zone invisible pour cliquer sur le vendeur
      var hit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.set(wp.x, 1.1, wp.z); g.add(hit);

      var S = { def: def, person: person, group: pg, x: wp.x, z: wp.z, baseYaw: th, yaw: th, cheer: 0, wave: 0, say: '' };
      sellers.push(S);
      var spot = toWorld(def, 0, 3.4);
      room.interactables.push({
        x: spot.x, z: spot.z, radius: 2.3, hit: hit,
        prompt: function () { return '🛍️ Parler à ' + def.name + ' — ' + def.title + '  [E]'; },
        use: function (w) {
          if (w.mode !== 'room' || w.blend > 0 || w.trans) return;
          if (Math.hypot(w.player.x - S.x, w.player.z - S.z) > 6.5) { w.flash('Approche-toi de ' + def.name + ' pour voir ses articles.'); return; }
          openTalk(w, S);
        }
      });
    });

    /* --- panneau d'achat --- */
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function setMsg(t) {
      if (!overlay) return;
      var el = overlay.querySelector('.shp-msg'); if (!el) return;
      el.textContent = t || ''; clearTimeout(msgT); if (t) msgT = setTimeout(function () { if (el) el.textContent = ''; }, 4500);
    }
    function render() {
      if (!overlay || !talk) return;
      var S = talk.s, def = S.def, items = itemsOf(def.key), list = overlay.querySelector('.shp-list');
      overlay.querySelector('.shp-say').textContent = '« ' + S.say + ' »';
      overlay.querySelector('.shp-bal b').textContent = fmtN(balance()) + ' 🪙';
      list.innerHTML = items.map(function (it) {
        var nm = splitName(it.name), eq = equipped(it), own = owned(it.id), act;
        if (eq) act = '<div class="on">✔ Équipé</div>';
        else if (own) act = '<button data-act="equip" data-id="' + esc(it.id) + '"' + (busy ? ' disabled' : '') + '>Équiper</button>';
        else act = '<button class="buy' + (balance() < it.price ? ' no' : '') + '" data-act="buy" data-id="' + esc(it.id) + '"' + (busy ? ' disabled' : '') + '>Acheter</button>';
        return '<div class="shp-card' + (eq ? ' eq' : '') + '"><div class="shp-ic">' + nm.icon + '</div>' +
          '<div class="shp-info"><b>' + esc(nm.text) + '</b><span>' + esc(it.desc || '') + '</span></div>' +
          '<div class="shp-act"><em class="' + (it.price === 0 ? 'free' : '') + '">' + (it.price === 0 ? 'De base' : fmtN(it.price) + ' 🪙') + '</em>' + act + '</div></div>';
      }).join('') || '<div class="shp-say">Rien à vendre ici pour le moment.</div>';
    }
    function buildOverlay(w, S) {
      injectCss();
      var o = document.createElement('div'); o.className = 'shp'; o.style.setProperty('--shp-c', cssHex(S.def.color));
      o.innerHTML =
        '<div class="shp-panel"><div class="shp-head"><div class="shp-ava">' + S.def.avatar + '</div>' +
        '<div class="shp-who"><b>' + esc(S.def.name) + ', ' + esc(S.def.role) + '</b><small>Rayon · ' + esc(S.def.title) + '</small></div>' +
        '<button class="shp-x" data-act="close">✕ Fermer</button></div>' +
        '<div class="shp-say"></div><div class="shp-bal"><span>Ton solde</span><b></b></div>' +
        '<div class="shp-list"></div><div class="shp-msg"></div></div>';
      o.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-act]') : null; if (!b || b.disabled) return;
        var a = b.getAttribute('data-act'), id = b.getAttribute('data-id');
        if (a === 'close') closeTalk(); else if (a === 'buy') doBuy(w, id); else if (a === 'equip') doEquip(id);
      });
      w.container.appendChild(o);
      return o;
    }
    function needLogin(w) {
      var ok = true;
      try { ok = typeof isUserLoggedIn !== 'function' || isUserLoggedIn(); } catch (e) { ok = false; }
      if (ok) return false;
      setMsg('🔒 Connecte-toi pour acheter.');
      try { w.setFull(false); if (typeof openAuthModal === 'function') openAuthModal('login'); } catch (e) { /* ok */ }
      return true;
    }
    function doBuy(w, id) {
      var it = findItem(id), S = talk && talk.s;
      if (!it || !S || busy || owned(id) || needLogin(w)) return;
      if (balance() < it.price) { setMsg('❌ Il te manque ' + fmtN(it.price - balance()) + ' 🪙 pour cet article.'); return; }
      if (typeof buySkin !== 'function') { setMsg('❌ Achat indisponible.'); return; }
      busy = true; render();
      var done = function () {
        busy = false;
        if (owned(id)) {
          S.say = pick(S.def.thanks); S.cheer = 1.6;
          setMsg('✨ « ' + splitName(it.name).text + ' » acheté et équipé !');
          var s = st();
          try { if (w.rt) w.rt.send('sale', { k: F.me(), name: String((s && s.username) || '').slice(0, 20), item: splitName(it.name).text.slice(0, 40), g: it.group }); } catch (e) { /* ok */ }
        } else setMsg('❌ Achat impossible. Réessaie.');
        render();
      };
      try { Promise.resolve(buySkin(id)).then(done, done); } catch (e) { done(); }
    }
    function doEquip(id) {
      var it = findItem(id);
      if (!it || busy || !owned(id) || needLogin(world)) return;
      try { if (typeof equipSkin === 'function') equipSkin(id); } catch (e) { /* ok */ }
      if (talk) { talk.s.cheer = 0.8; }
      setMsg('✔ « ' + splitName(it.name).text + ' » équipé !');
      render();
    }
    function onEsc(e) { if (e.code === 'Escape' && talk) { e.stopImmediatePropagation(); closeTalk(); } }
    function openTalk(w, S) {
      if (talk) return;
      w.sitDown(room); talk = { s: S }; camSeller = S; S.say = pick(S.def.hello);
      overlay = buildOverlay(w, S); render();
      window.addEventListener('keydown', onEsc, true);
    }
    function closeTalk(instant) {
      if (!talk) return;
      talk = null; busy = false;
      window.removeEventListener('keydown', onEsc, true);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      world.mode = 'room';           // la caméra revient doucement (seatRoom reste le temps du fondu)
      if (instant) { world.blend = 0; world.seatRoom = null; }
    }

    // caméra pendant la discussion : en face du vendeur, un peu décalée pour qu'il reste à gauche du panneau
    room.seatPose = function () {
      var S = camSeller; if (!S) return null;
      var d = S.def, cam = toWorld(d, 0, 5.3), tgt = toWorld(d, 1.0, 0.95);   // un peu en hauteur : les médaillons du comptoir ne cachent pas le vendeur
      return { cx: cam.x, cy: 2.2, cz: cam.z, tx: tgt.x, ty: 1.4, tz: tgt.z, fov: 46 };
    };

    /* --- cycle de vie, interface, réseau --- */
    room.hudTop = '<button class="s3d-cam" data-shp="classic">🛒 Boutique classique</button>';
    room.bindHud = function (hud) {
      var b = hud.querySelector('[data-shp="classic"]');
      if (b) b.addEventListener('click', function () {
        closeTalk(true);
        try { window.__shopClassic = true; if (typeof switchRoom === 'function') switchRoom('shop'); } catch (e) { /* ok */ }
      });
    };
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) {
      return 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · approche-toi d\'un vendeur puis E (ou clique sur lui) pour voir ses articles' + (w.full ? ' · Échap : quitter' : '');
    };
    room.syncHud = function () {
      if (overlay && talk) { var b = overlay.querySelector('.shp-bal b'); if (b) b.textContent = fmtN(balance()) + ' 🪙'; }
    };
    room.onLeave = function () { closeTalk(true); };
    room.onPause = function () { closeTalk(true); };
    room.onRtMsg = function (ev, m, remote, w) {
      if (ev !== 'sale') return;
      var who = String(m.name || m.k || '').slice(0, 20), item = String(m.item || '').slice(0, 40);
      w.flash('🛍️ ' + who + ' vient d\'acheter « ' + item + ' » !');
      for (var i = 0; i < sellers.length; i++) if (sellers[i].def.key === m.g) sellers[i].cheer = 1.6;
    };

    room.update = function (dt, w) {
      clockT += dt;
      var t = clockT, p = w.player;
      coinPivot.rotation.y = t * 0.9; coin.position.y = 2.5 + Math.sin(t * 1.4) * 0.08;
      for (var i = 0; i < medals.length; i++) { var m = medals[i]; m.g.rotation.y = t * 0.9 + m.ph; m.g.position.y = m.y + Math.sin(t * 1.6 + m.ph) * 0.03; }
      sellers.forEach(function (S, idx) {
        var dx = p.x - S.x, dz = p.z - S.z, d = Math.hypot(dx, dz), talking = talk && talk.s === S;
        var look = d < 8 ? Math.atan2(dx, dz) : S.baseYaw;
        // on ne tourne jamais le dos au comptoir : le regard reste dans un demi-cercle devant le vendeur
        var rel = ((look - S.baseYaw + Math.PI * 3) % TAU) - Math.PI; rel = Math.max(-1.2, Math.min(1.2, rel));
        var target = S.baseYaw + rel, dy = ((target - S.yaw + Math.PI * 3) % TAU) - Math.PI;
        S.yaw += dy * Math.min(1, dt * 5); S.group.rotation.y = S.yaw;
        var arms = S.person.arms, k = Math.min(1, dt * 8);
        var l0 = Math.sin(t * 1.3 + idx) * 0.05, r0 = Math.sin(t * 1.1 + idx * 2) * 0.05, rz = 0;
        if (S.cheer > 0) { S.cheer -= dt; l0 = -2.7 + Math.sin(t * 12) * 0.25; r0 = -2.7 + Math.sin(t * 12 + 1) * 0.25; }
        else if (talking) { r0 = -0.9 + Math.sin(t * 2.2) * 0.12; }
        else if (d < 5 && w.mode === 'room') { r0 = -2.6 + Math.sin(t * 7) * 0.22; rz = -0.15; }
        arms[0].rotation.x = lerp(arms[0].rotation.x, l0, k); arms[1].rotation.x = lerp(arms[1].rotation.x, r0, k); arms[1].rotation.z = lerp(arms[1].rotation.z, rz, k);
      });
    };
    room.dispose = function () { closeTalk(true); sellers.forEach(function (S) { S.person.dispose(); }); };

    return room;
  }

  F.registerRoom('shop3d', createShopRoom);
})();
