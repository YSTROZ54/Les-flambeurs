/**
 * =============================================================================
 * POKER 3D — MODULE D'INITIALISATION ET DE RENDU THREE.JS ÉTENDU
 * Direction Artistique : Casino Underground (Type "Prominence Poker")
 * Ambiance : Scène sombre, lumière dramatique suspendue, feutre texturé,
 *            cartes texturées (face/dos), adversaires 3D et nameplates.
 * =============================================================================
 */

class Poker3DExperience {
  constructor(containerElement, options = {}) {
    this.container = typeof containerElement === 'string' 
      ? document.getElementById(containerElement) 
      : containerElement;

    if (!this.container) {
      console.error('[Poker3D] Conteneur introuvable.');
      return;
    }

    this.options = Object.assign({
      feltColor: 0x0a3821,     // Vert feutre sombre casino underground
      railColor: 0x121013,     // Cuir noir / bordeaux très sombre
      woodColor: 0x1e1108,     // Bois acajou foncé
      tableWidth: 6.6,         // Longueur de la table ovale
      tableDepth: 3.3,         // Largeur de la table ovale
    }, options);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.spotLight = null;
    this.animationFrameId = null;
    this.tableGroup = null;

    // Cache pour les textures procédurales (pour ne pas régénérer en boucle)
    this.textureCache = {};

    // Données des adversaires pour la table de 6
    this.opponentsData = [
      { id: 1, name: 'Viper (Bot)', avatar: '🐍', stack: 6000, status: '🟢 Prêt', isHero: false },
      { id: 2, name: 'Le Baron (Bot)', avatar: '🎩', stack: 8500, status: '🟢 Prêt', isHero: false },
      { id: 3, name: 'Roxy (Bot)', avatar: '🦊', stack: 5200, status: '🟢 Prêt', isHero: false },
      { id: 4, name: 'Montana (Bot)', avatar: '🤠', stack: 7100, status: '🟢 Prêt', isHero: false },
      { id: 5, name: 'Kaiser (Bot)', avatar: '👑', stack: 12000, status: '🟢 Prêt', isHero: false },
    ];

    // Objets 3D de jeu
    this.cards = { hero: [], community: [], opponents: [] };
    this.opponents3D = [];
    this.chipStacks = [];

    this.init();
  }

  /* ------------------------------------------------------------------------- */
  /* 1. INITIALISATION GLOBALE                                                  */
  /* ------------------------------------------------------------------------- */
  init() {
    if (typeof THREE === 'undefined') {
      console.error('[Poker3D] Three.js n\'est pas chargé.');
      return;
    }

    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLighting();
    this.buildPokerTable();
    this.buildHeroCards();
    this.buildCommunityCards();
    this.buildOpponentsSeats();
    this.buildCenterPotChips();
    this.setupEventListeners();
    this.handleResize();
    this.startRenderLoop();

    console.log('♠️ [Poker3D] Scène texturée et sièges 3D initialisés avec succès.');
  }

  /* ------------------------------------------------------------------------- */
  /* 2. SCÈNE & AMBIANCE SOMBRE                                                */
  /* ------------------------------------------------------------------------- */
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060608);
    this.scene.fog = new THREE.FogExp2(0x060608, 0.04);
  }

  /* ------------------------------------------------------------------------- */
  /* 3. CAMÉRA PREMIÈRE PERSONNE                                               */
  /* ------------------------------------------------------------------------- */
  setupCamera() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 50);
    this.updateCameraForDevice(width, height);
  }

  /* ------------------------------------------------------------------------- */
  /* 4. RENDERER OPTIMISÉ POUR MOBILE                                          */
  /* ------------------------------------------------------------------------- */
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height);
    // Limite stricte à 2.0 pour éviter la surchauffe mobile
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.renderer.domElement.id = 'poker3dCanvas';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.zIndex = '1';
    this.renderer.domElement.style.pointerEvents = 'none';

    this.container.style.position = 'relative';
    this.container.appendChild(this.renderer.domElement);
  }

  /* ------------------------------------------------------------------------- */
  /* 5. ÉCLAIRAGE DRAMATIQUE UNDERGROUND (Spot conique + ambiance tamisée)      */
  /* ------------------------------------------------------------------------- */
  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x10131a, 0.35);
    this.scene.add(ambientLight);

    // Spot puissant suspendu au-dessus du centre de la table
    this.spotLight = new THREE.SpotLight(0xffeed1, 3.8);
    this.spotLight.position.set(0, 6.8, 0.2);
    this.spotLight.angle = Math.PI / 4.1;
    this.spotLight.penumbra = 0.58;
    this.spotLight.decay = 1.35;
    this.spotLight.distance = 18;

    // Ombres nettes limitées à 1024x1024
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 1024;
    this.spotLight.shadow.mapSize.height = 1024;
    this.spotLight.shadow.camera.near = 1;
    this.spotLight.shadow.camera.far = 12;
    this.spotLight.shadow.bias = -0.00012;

    this.scene.add(this.spotLight);
    this.scene.add(this.spotLight.target);
    this.spotLight.target.position.set(0, 0, 0);

    // Lumière de contre-jour discrète
    const rimLight = new THREE.DirectionalLight(0x334460, 0.45);
    rimLight.position.set(0, 3, -6);
    this.scene.add(rimLight);

    // Sol récepteur d'ombres
    const floorGeo = new THREE.PlaneGeometry(32, 32);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x070709, roughness: 0.95 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.8;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  /* ------------------------------------------------------------------------- */
  /* 6. TABLE OVALE DE POKER AVEC MATÉRIAUX RÉALISTES                          */
  /* ------------------------------------------------------------------------- */
  buildPokerTable() {
    this.tableGroup = new THREE.Group();

    const w = this.options.tableWidth;
    const d = this.options.tableDepth;
    const r = d / 2;
    const straightLen = w - d;

    // A. Forme 2D ovale du tapis
    const ovalShape = new THREE.Shape();
    ovalShape.moveTo(-straightLen / 2, r);
    ovalShape.lineTo(straightLen / 2, r);
    ovalShape.absarc(straightLen / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
    ovalShape.lineTo(-straightLen / 2, -r);
    ovalShape.absarc(-straightLen / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);

    // B. Tapis en Feutre Véritable (Haute Rugosité 0.94, Zéro Plastique)
    const feltTexture = this.generateRealisticFeltTexture();
    const feltBumpMap = this.generateFeltBumpMap();
    const feltMat = new THREE.MeshStandardMaterial({
      color: this.options.feltColor,
      map: feltTexture,
      bumpMap: feltBumpMap,
      bumpScale: 0.003,
      roughness: 0.94,        // Très mat, absorbe la lumière comme de la laine
      metalness: 0.01
    });

    const feltMesh = new THREE.Mesh(new THREE.ShapeGeometry(ovalShape, 48), feltMat);
    feltMesh.rotation.x = -Math.PI / 2;
    feltMesh.receiveShadow = true;
    this.tableGroup.add(feltMesh);

    // C. Ligne de mise ovale dorée
    const ringShape = new THREE.Shape();
    const rw = w * 0.72, rd = d * 0.68, rr = rd / 2, rsl = rw - rd;
    ringShape.moveTo(-rsl / 2, rr);
    ringShape.lineTo(rsl / 2, rr);
    ringShape.absarc(rsl / 2, 0, rr, Math.PI / 2, -Math.PI / 2, true);
    ringShape.lineTo(-rsl / 2, -rr);
    ringShape.absarc(-rsl / 2, 0, rr, -Math.PI / 2, Math.PI / 2, true);

    const ringLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringShape.getPoints(64)),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.4 })
    );
    ringLine.rotation.x = -Math.PI / 2;
    ringLine.position.y = 0.002;
    this.tableGroup.add(ringLine);

    // D. Piste intérieure en bois précieux verni (Racetrack)
    const woodRailShape = new THREE.Shape();
    const wrThickness = 0.18;
    const wrR = r + wrThickness;
    woodRailShape.moveTo(-straightLen / 2, wrR);
    woodRailShape.lineTo(straightLen / 2, wrR);
    woodRailShape.absarc(straightLen / 2, 0, wrR, Math.PI / 2, -Math.PI / 2, true);
    woodRailShape.lineTo(-straightLen / 2, -wrR);
    woodRailShape.absarc(-straightLen / 2, 0, wrR, -Math.PI / 2, Math.PI / 2, true);

    const wrHole = new THREE.Path();
    wrHole.moveTo(-straightLen / 2, r);
    wrHole.lineTo(straightLen / 2, r);
    wrHole.absarc(straightLen / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
    wrHole.lineTo(-straightLen / 2, -r);
    wrHole.absarc(-straightLen / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);
    woodRailShape.holes.push(wrHole);

    const woodRailMat = new THREE.MeshStandardMaterial({
      color: this.options.woodColor,
      roughness: 0.38,
      metalness: 0.12
    });
    const woodRailMesh = new THREE.Mesh(new THREE.ShapeGeometry(woodRailShape, 48), woodRailMat);
    woodRailMesh.rotation.x = -Math.PI / 2;
    woodRailMesh.position.y = 0.001;
    woodRailMesh.receiveShadow = true;
    this.tableGroup.add(woodRailMesh);

    // E. Accoudoir surélevé en Cuir Noir Rembourré (Padded Leather Armrest)
    const railOuterShape = new THREE.Shape();
    const railThickness = 0.38;
    const roR = wrR + railThickness;
    railOuterShape.moveTo(-straightLen / 2, roR);
    railOuterShape.lineTo(straightLen / 2, roR);
    railOuterShape.absarc(straightLen / 2, 0, roR, Math.PI / 2, -Math.PI / 2, true);
    railOuterShape.lineTo(-straightLen / 2, -roR);
    railOuterShape.absarc(-straightLen / 2, 0, roR, -Math.PI / 2, Math.PI / 2, true);

    const railHole = new THREE.Path();
    railHole.moveTo(-straightLen / 2, wrR);
    railHole.lineTo(straightLen / 2, wrR);
    railHole.absarc(straightLen / 2, 0, wrR, Math.PI / 2, -Math.PI / 2, true);
    railHole.lineTo(-straightLen / 2, -wrR);
    railHole.absarc(-straightLen / 2, 0, wrR, -Math.PI / 2, Math.PI / 2, true);
    railOuterShape.holes.push(railHole);

    const railMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(railOuterShape, { depth: 0.14, bevelEnabled: true, bevelSegments: 4, bevelSize: 0.08, bevelThickness: 0.08 }),
      new THREE.MeshStandardMaterial({ color: this.options.railColor, roughness: 0.35, metalness: 0.14 })
    );
    railMesh.rotation.x = -Math.PI / 2;
    railMesh.position.y = -0.04;
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    this.tableGroup.add(railMesh);

    // F. Pieds de la table
    const legGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.6, 24);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x110b06, roughness: 0.7 });
    const leg1 = new THREE.Mesh(legGeo, legMat);
    leg1.position.set(-1.5, -0.9, 0);
    leg1.castShadow = true;
    this.tableGroup.add(leg1);

    const leg2 = new THREE.Mesh(legGeo, legMat);
    leg2.position.set(1.5, -0.9, 0);
    leg2.castShadow = true;
    this.tableGroup.add(leg2);

    this.scene.add(this.tableGroup);
  }

  /* ------------------------------------------------------------------------- */
  /* 7. CRÉATION D'OBJET CARTE 3D (AVEC DOS & FACE DISTINCTS)                  */
  /* ------------------------------------------------------------------------- */
  createCardObject(rank = 'A', suit = '♠', isFaceDown = false) {
    const cardWidth = 0.50;
    const cardHeight = 0.005;
    const cardDepth = 0.72;

    const geo = new THREE.BoxGeometry(cardWidth, cardHeight, cardDepth);

    const frontTexture = this.getCardFrontTexture(rank, suit);
    const backTexture = this.getCardBackTexture();

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.32, metalness: 0.04 });
    const backMat = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.32, metalness: 0.08 });

    // BoxGeometry Face +Y (Index 2) est la face du haut sur le tapis XZ
    // BoxGeometry Face -Y (Index 3) est la face du bas
    const materials = [
      edgeMat, // +X
      edgeMat, // -X
      isFaceDown ? backMat : frontMat,  // +Y (Vers le haut)
      isFaceDown ? frontMat : backMat,  // -Y (Vers le bas)
      edgeMat, // +Z
      edgeMat  // -Z
    ];

    const cardMesh = new THREE.Mesh(geo, materials);
    cardMesh.castShadow = true;
    cardMesh.receiveShadow = true;
    return cardMesh;
  }

  /* ------------------------------------------------------------------------- */
  /* 8. CARTES DU JOUEUR HERO (INCLINÉES VERS LA CAMÉRA)                       */
  /* ------------------------------------------------------------------------- */
  buildHeroCards() {
    // Carte 1 : As de Pique (A♠)
    const card1 = this.createCardObject('A', '♠', false);
    card1.position.set(-0.25, 0.08, 1.08);
    // Légère inclinaison vers la caméra pour une lisibilité optimale
    card1.rotation.x = -Math.PI / 7.2; // ~ -25°
    card1.rotation.y = 0.08;
    card1.rotation.z = -0.05;
    this.scene.add(card1);
    this.cards.hero.push(card1);

    // Carte 2 : Roi de Pique (K♠)
    const card2 = this.createCardObject('K', '♠', false);
    card2.position.set(0.25, 0.09, 1.08);
    card2.rotation.x = -Math.PI / 7.2;
    card2.rotation.y = -0.08;
    card2.rotation.z = 0.05;
    this.scene.add(card2);
    this.cards.hero.push(card2);

    // Jetons du joueur (Hero)
    this.createRealisticChipStack(-0.95, 0.85, [
      { color: '#d97706', count: 12 }, // Or
      { color: '#dc2626', count: 8 }   // Rouge
    ]);
  }

  /* ------------------------------------------------------------------------- */
  /* 9. CARTES COMMUNES (FLOP, TURN, RIVER) AU CENTRE DU TAPIS                 */
  /* ------------------------------------------------------------------------- */
  buildCommunityCards() {
    const communitySetup = [
      { rank: '10', suit: '♠' },
      { rank: 'J', suit: '♥' },
      { rank: 'Q', suit: '♦' },
      { rank: 'K', suit: '♣' },
      { rank: 'A', suit: '♦' }
    ];

    const startX = -1.15;
    const spacing = 0.58;

    communitySetup.forEach((c, i) => {
      const card = this.createCardObject(c.rank, c.suit, false);
      card.position.set(startX + i * spacing, 0.005, -0.06);
      card.rotation.y = (Math.random() - 0.5) * 0.03; // Petit décalage réaliste
      this.scene.add(card);
      this.cards.community.push(card);
    });
  }

  /* ------------------------------------------------------------------------- */
  /* 10. PLACEMENT DES ADVERSAIRES (SIÈGES 3D, CARTES FACE CACHÉE & NAMEPLATES)*/
  /* ------------------------------------------------------------------------- */
  buildOpponentsSeats() {
    // Calcul des positions en arc de cercle autour de la table ovale (Table de 6)
    const seatCoords = [
      { x: -2.15, z: 0.85, angle: 0.45 },   // Siège 1 (Gauche bas)
      { x: -2.35, z: -0.65, angle: 1.15 },  // Siège 2 (Gauche haut)
      { x: 0.0,   z: -1.35, angle: Math.PI },// Siège 3 (En face / Top centre)
      { x: 2.35,  z: -0.65, angle: -1.15 }, // Siège 4 (Droite haut)
      { x: 2.15,  z: 0.85, angle: -0.45 }   // Siège 5 (Droite bas)
    ];

    this.opponentsData.forEach((opp, i) => {
      const seat = seatCoords[i];
      if (!seat) return;

      const oppGroup = new THREE.Group();
      oppGroup.position.set(seat.x, 0, seat.z);

      // A. Deux cartes 3D face cachée (dos texturé vers le haut)
      const c1 = this.createCardObject('?', '?', true);
      c1.position.set(-0.16, 0.005, 0);
      c1.rotation.y = seat.angle - 0.08;
      oppGroup.add(c1);

      const c2 = this.createCardObject('?', '?', true);
      c2.position.set(0.16, 0.006, 0);
      c2.rotation.y = seat.angle + 0.08;
      oppGroup.add(c2);

      // B. Pile de jetons de l'adversaire
      const chipColor = i % 2 === 0 ? '#16a34a' : '#2563eb';
      const chipSubGroup = this.createRealisticChipStack(
        Math.cos(seat.angle) * 0.45,
        Math.sin(seat.angle) * 0.45,
        [{ color: chipColor, count: 10 }]
      );
      oppGroup.add(chipSubGroup);

      // C. Étiquette Nameplate 3D flottante (Sprite toujours face caméra)
      const nameplate = this.create3DNameplate(opp.name, opp.stack, opp.avatar, opp.status);
      nameplate.position.set(0, 0.55, 0);
      oppGroup.add(nameplate);

      this.scene.add(oppGroup);
      this.opponents3D.push(oppGroup);
    });
  }

  /* ------------------------------------------------------------------------- */
  /* 11. JETONS DU POT AU CENTRE DE LA TABLE                                   */
  /* ------------------------------------------------------------------------- */
  buildCenterPotChips() {
    this.createRealisticChipStack(-0.35, -0.6, [
      { color: '#d97706', count: 15 },
      { color: '#dc2626', count: 12 }
    ]);
    this.createRealisticChipStack(0.35, -0.62, [
      { color: '#16a34a', count: 18 },
      { color: '#2563eb', count: 10 }
    ]);
  }

  /* ------------------------------------------------------------------------- */
  /* 12. PILE DE JETONS DE CASINO RAFFINÉE (AVEC TRANCHE STRIÉE & BICOLORE)   */
  /* ------------------------------------------------------------------------- */
  createRealisticChipStack(x, z, layers = [{ color: '#d97706', count: 10 }]) {
    const stackGroup = new THREE.Group();
    stackGroup.position.set(x, 0, z);

    let currentY = 0.015;

    layers.forEach(layer => {
      const chipMatArray = this.getChipMaterials(layer.color);
      const chipGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.036, 32);

      for (let i = 0; i < layer.count; i++) {
        const chip = new THREE.Mesh(chipGeo, chipMatArray);
        chip.position.set(
          (Math.random() - 0.5) * 0.005,
          currentY,
          (Math.random() - 0.5) * 0.005
        );
        chip.rotation.y = Math.random() * Math.PI;
        chip.castShadow = true;
        chip.receiveShadow = true;
        stackGroup.add(chip);

        currentY += 0.037;
      }
    });

    this.scene.add(stackGroup);
    this.chipStacks.push(stackGroup);
    return stackGroup;
  }

  getChipMaterials(baseHex) {
    const key = 'chip_' + baseHex;
    if (this.textureCache[key]) return this.textureCache[key];

    // Texture de tranche bicolore striée (Signature des jetons casino en argile)
    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = 256;
    edgeCanvas.height = 32;
    const eCtx = edgeCanvas.getContext('2d');
    eCtx.fillStyle = baseHex;
    eCtx.fillRect(0, 0, 256, 32);

    // 8 bandes blanches intercalées sur la tranche
    eCtx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      eCtx.fillRect(i * 32 + 6, 0, 10, 32);
    }
    const edgeTex = new THREE.CanvasTexture(edgeCanvas);

    // Texture face supérieure du jeton
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 256;
    faceCanvas.height = 256;
    const fCtx = faceCanvas.getContext('2d');
    fCtx.fillStyle = baseHex;
    fCtx.beginPath();
    fCtx.arc(128, 128, 126, 0, Math.PI * 2);
    fCtx.fill();

    // Couronne d'inserts blancs
    fCtx.strokeStyle = '#ffffff';
    fCtx.lineWidth = 10;
    fCtx.setLineDash([14, 18]);
    fCtx.beginPath();
    fCtx.arc(128, 128, 110, 0, Math.PI * 2);
    fCtx.stroke();

    // Anneau intérieur doré
    fCtx.setLineDash([]);
    fCtx.strokeStyle = '#fef08a';
    fCtx.lineWidth = 4;
    fCtx.beginPath();
    fCtx.arc(128, 128, 70, 0, Math.PI * 2);
    fCtx.stroke();

    // Cœur sombre
    fCtx.fillStyle = '#0f172a';
    fCtx.beginPath();
    fCtx.arc(128, 128, 64, 0, Math.PI * 2);
    fCtx.fill();

    fCtx.font = 'bold 36px sans-serif';
    fCtx.fillStyle = '#fef08a';
    fCtx.textAlign = 'center';
    fCtx.textBaseline = 'middle';
    fCtx.fillText('♠', 128, 128);

    const faceTex = new THREE.CanvasTexture(faceCanvas);

    const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.35, metalness: 0.2 });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, metalness: 0.2 });

    const mats = [edgeMat, faceMat, faceMat];
    this.textureCache[key] = mats;
    return mats;
  }

  /* ------------------------------------------------------------------------- */
  /* 13. ÉTIQUETTE NAMEPLATE 3D FLOTTANTE (SPRITE TOUJOURS FACE CAMÉRA)        */
  /* ------------------------------------------------------------------------- */
  create3DNameplate(name, stack, avatar = '👤', status = '🟢 Prêt') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');

    // Fond capsule arrondi sombre type Prominence Poker
    ctx.fillStyle = 'rgba(10, 10, 16, 0.88)';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 6;
    
    // Dessin rectangle arrondi
    const r = 28;
    ctx.beginPath();
    ctx.moveTo(10 + r, 10);
    ctx.lineTo(502 - r, 10);
    ctx.arcTo(502, 10, 502, 130, r);
    ctx.lineTo(502, 130 - r);
    ctx.arcTo(502, 130, 10, 130, r);
    ctx.lineTo(10 + r, 130);
    ctx.arcTo(10, 130, 10, 10, r);
    ctx.lineTo(10, 10 + r);
    ctx.arcTo(10, 10, 502, 10, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Badge Avatar
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(68, 70, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar, 68, 72);

    // Nom du joueur
    ctx.textAlign = 'left';
    ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, 130, 52);

    // Stack en or avec jeton
    ctx.font = 'bold 32px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🪙 ${stack.toLocaleString('fr-FR')} €`, 130, 98);

    // Statut vert
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'right';
    ctx.fillText(status, 480, 52);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.4, 0.40, 1);
    return sprite;
  }

  /* ------------------------------------------------------------------------- */
  /* 14. TEXTURES DES CARTES (DOS ORNÉ + FACES HAUTE DÉFINITION)               */
  /* ------------------------------------------------------------------------- */
  getCardBackTexture() {
    if (this.textureCache['card_back']) return this.textureCache['card_back'];

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Fond bordeaux royal / cramoisi sombre
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, 0, 512, 720);

    // Bordure blanche extérieure
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, 492, 700);

    // Filet doré intérieur
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 26, 460, 668);

    // Motifs de guilloché / losanges géométriques dorés
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
    ctx.lineWidth = 2;
    for (let x = -720; x < 1200; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 720, 720);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, 720);
      ctx.lineTo(x + 720, 0);
      ctx.stroke();
    }

    // Écusson central "Les Flambeurs"
    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.arc(256, 360, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.font = 'bold 75px serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♠', 256, 355);

    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('FLAMBEURS', 256, 415);

    const tex = new THREE.CanvasTexture(canvas);
    this.textureCache['card_back'] = tex;
    return tex;
  }

  getCardFrontTexture(rank, suit) {
    const key = `card_${rank}_${suit}`;
    if (this.textureCache[key]) return this.textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Fond blanc ivoire feutré
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(0, 0, 512, 720);

    // Bordure fine
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 708);

    const isRed = suit === '♥' || suit === '♦';
    const color = isRed ? '#dc2626' : '#0f172a';

    // Rangs et symboles dans les coins (Haut-Gauche et Bas-Droite inversé)
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Coin Haut Gauche
    ctx.font = 'bold 56px "Cinzel", "Plus Jakarta Sans", serif';
    ctx.fillText(rank, 65, 75);
    ctx.font = 'bold 44px serif';
    ctx.fillText(suit, 65, 130);

    // Coin Bas Droite (Inversé 180°)
    ctx.save();
    ctx.translate(447, 645);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 56px "Cinzel", "Plus Jakarta Sans", serif';
    ctx.fillText(rank, 0, 0);
    ctx.font = 'bold 44px serif';
    ctx.fillText(suit, 0, 55);
    ctx.restore();

    // Grand symbole central orné
    ctx.font = 'bold 190px serif';
    ctx.fillText(suit, 256, 360);

    // Décoration royale si carte à figure (A, K, Q, J)
    if (['A', 'K', 'Q', 'J'].includes(rank)) {
      ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = isRed ? '#f87171' : '#64748b';
      ctx.fillText(`★ VIP ${rank} ★`, 256, 210);
      ctx.fillText(`★ VIP ${rank} ★`, 256, 510);
    }

    const tex = new THREE.CanvasTexture(canvas);
    this.textureCache[key] = tex;
    return tex;
  }

  /* ------------------------------------------------------------------------- */
  /* 15. TEXTURE ULTRA-RÉALISTE DU TAPIS VERT FEUTRÉ                           */
  /* ------------------------------------------------------------------------- */
  generateRealisticFeltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base vert forêt profond casino
    ctx.fillStyle = '#0a361e';
    ctx.fillRect(0, 0, 512, 512);

    // Micro-trame textile feutrée
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 14;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }

  generateFeltBumpMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(256, 256);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 45;
      d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    return tex;
  }

  /* ------------------------------------------------------------------------- */
  /* 16. CADRAGE RESPONSIVE & MOBILE-FIRST                                     */
  /* ------------------------------------------------------------------------- */
  updateCameraForDevice(width, height) {
    if (!this.camera) return;

    const isPortrait = height > width;
    this.camera.aspect = width / height;

    if (isPortrait) {
      // Mode Portrait (Mobile vertical) : Recul caméra + FOV large
      this.camera.fov = 68;
      this.camera.position.set(0, 5.1, 4.6);
      this.camera.lookAt(0, 0.1, 0.2);
    } else {
      // Mode Paysage (PC / Écrans larges) : Première personne plongeante
      this.camera.fov = 46;
      this.camera.position.set(0, 3.2, 3.5);
      this.camera.lookAt(0, 0.25, 0.15);
    }

    this.camera.updateProjectionMatrix();
  }

  handleResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.updateCameraForDevice(width, height);
    if (this.renderer) {
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.handleResize(), { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 150);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------------- */
  /* 17. BOUCLE DE RENDU FLUIDE 60 FPS                                         */
  /* ------------------------------------------------------------------------- */
  startRenderLoop() {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      // Micro-respiration de la lampe suspendue
      const time = performance.now() * 0.001;
      if (this.spotLight) {
        this.spotLight.intensity = 3.8 + Math.sin(time * 1.5) * 0.08;
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  destroy() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}

// Export global
window.Poker3DExperience = Poker3DExperience;
