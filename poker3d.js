/**
 * =============================================================================
 * POKER 3D — MODULE D'INITIALISATION DE LA SCÈNE THREE.JS
 * Direction Artistique : Casino Underground (Type "Prominence Poker")
 * Ambiance : Scène sombre, lumière dramatique suspendue, reflets feutrés & cuir
 * Optimisé : Mobile-First, Smart Framing Portrait/Paysage, 60 FPS constant
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
      feltColor: 0x0f4229,     // Vert feutre sombre casino underground
      railColor: 0x121013,     // Cuir noir / bordeaux très sombre
      woodColor: 0x1e1108,     // Bois acajou foncé
      tableWidth: 6.4,         // Longueur de la table ovale
      tableDepth: 3.2,         // Largeur de la table ovale
      showHelpers: false       // Debug helpers
    }, options);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.spotLight = null;
    this.animationFrameId = null;
    this.tableGroup = null;

    // Références vers les objets de jeu (cartes & jetons)
    this.cards = {
      hero: [],
      community: [],
      opponents: []
    };
    this.chipStacks = [];

    this.init();
  }

  /* ------------------------------------------------------------------------- */
  /* 1. INITIALISATION GLOBALE                                                  */
  /* ------------------------------------------------------------------------- */
  init() {
    if (typeof THREE === 'undefined') {
      console.error('[Poker3D] Three.js n\'est pas chargé. Ajoute le script CDN Three.js.');
      return;
    }

    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLighting();
    this.buildPokerTable();
    this.buildPlaceholders();
    this.setupEventListeners();
    this.handleResize();
    this.startRenderLoop();

    console.log('♠️ [Poker3D] Scène 3D initialisée avec succès (Prominence Poker style).');
  }

  /* ------------------------------------------------------------------------- */
  /* 2. SCÈNE, BROUILLARD & AMBIANCE SOMBRE                                     */
  /* ------------------------------------------------------------------------- */
  setupScene() {
    this.scene = new THREE.Scene();
    // Arrière-plan noir profond de tripot clandestin
    this.scene.background = new THREE.Color(0x060608);
    // Brouillard volumétrique discret pour noyer les bords de la pièce
    this.scene.fog = new THREE.FogExp2(0x060608, 0.045);
  }

  /* ------------------------------------------------------------------------- */
  /* 3. CAMÉRA À LA PREMIÈRE PERSONNE                                          */
  /* ------------------------------------------------------------------------- */
  setupCamera() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / height;

    // Caméra perspective positionnée face à la place du joueur (Hero)
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 50);
    this.updateCameraForDevice(width, height);
  }

  /* ------------------------------------------------------------------------- */
  /* 4. RENDERER WEBGL HAUTE PERFORMANCE                                       */
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
    // Limitation stricte à 2.0 pour éviter la surchauffe GPU sur mobile haute densité
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Gestion du rendu des ombres douces
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Mappage tonal cinéma pour les lumières chaudes et contrastées
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Insertion du Canvas dans le DOM
    this.renderer.domElement.id = 'poker3dCanvas';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.zIndex = '1';
    this.renderer.domElement.style.pointerEvents = 'none'; // Pas d'interférence avec l'UI HTML

    this.container.style.position = 'relative';
    this.container.appendChild(this.renderer.domElement);
  }

  /* ------------------------------------------------------------------------- */
  /* 5. ÉCLAIRAGE DRAMATIQUE UNDERGROUND (Spot suspendu + ambiance sombre)       */
  /* ------------------------------------------------------------------------- */
  setupLighting() {
    // A. Lumière d'ambiance très sombre (ombres intenses)
    const ambientLight = new THREE.AmbientLight(0x12141c, 0.35);
    this.scene.add(ambientLight);

    // B. Spot suspendu principal au centre de la table (lumière conique chaude)
    this.spotLight = new THREE.SpotLight(0xfff1d6, 3.8);
    this.spotLight.position.set(0, 6.5, 0.2);
    this.spotLight.angle = Math.PI / 4.2;
    this.spotLight.penumbra = 0.55;
    this.spotLight.decay = 1.4;
    this.spotLight.distance = 18;

    // Ombres nettes mais optimisées (1024x1024 max)
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 1024;
    this.spotLight.shadow.mapSize.height = 1024;
    this.spotLight.shadow.camera.near = 1;
    this.spotLight.shadow.camera.far = 12;
    this.spotLight.shadow.bias = -0.00015;

    this.scene.add(this.spotLight);
    this.scene.add(this.spotLight.target);
    this.spotLight.target.position.set(0, 0, 0);

    // C. Lumière de contre-jour discrète (rim light) pour souligner le bord en cuir
    const rimLight = new THREE.DirectionalLight(0x3a4b68, 0.45);
    rimLight.position.set(0, 3, -6);
    this.scene.add(rimLight);

    // D. Sol sombre sous la table pour capter les ombres portées
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.95,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.8;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  /* ------------------------------------------------------------------------- */
  /* 6. MODÉLISATION DE LA TABLE OVALE DE POKER                                 */
  /* ------------------------------------------------------------------------- */
  buildPokerTable() {
    this.tableGroup = new THREE.Group();

    const w = this.options.tableWidth;
    const d = this.options.tableDepth;
    const r = d / 2;             // Rayon des deux demi-cercles aux extrémités
    const straightLen = w - d;   // Longueur de la section rectiligne centrale

    // A. Forme 2D de la table ovale (Stadium / Capsule)
    const ovalShape = new THREE.Shape();
    ovalShape.moveTo(-straightLen / 2, r);
    ovalShape.lineTo(straightLen / 2, r);
    ovalShape.absarc(straightLen / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
    ovalShape.lineTo(-straightLen / 2, -r);
    ovalShape.absarc(-straightLen / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);

    // B. Tapis en feutrine (Felt)
    const feltTexture = this.generateFeltTexture();
    const feltMat = new THREE.MeshStandardMaterial({
      color: this.options.feltColor,
      map: feltTexture,
      roughness: 0.88,
      metalness: 0.05
    });

    const feltGeo = new THREE.ShapeGeometry(ovalShape, 48);
    const feltMesh = new THREE.Mesh(feltGeo, feltMat);
    feltMesh.rotation.x = -Math.PI / 2;
    feltMesh.position.y = 0;
    feltMesh.receiveShadow = true;
    this.tableGroup.add(feltMesh);

    // C. Ligne de mise imprimée sur le feutre (Betting Oval Ring)
    const ringShape = new THREE.Shape();
    const rw = w * 0.72;
    const rd = d * 0.68;
    const rr = rd / 2;
    const rsl = rw - rd;
    ringShape.moveTo(-rsl / 2, rr);
    ringShape.lineTo(rsl / 2, rr);
    ringShape.absarc(rsl / 2, 0, rr, Math.PI / 2, -Math.PI / 2, true);
    ringShape.lineTo(-rsl / 2, -rr);
    ringShape.absarc(-rsl / 2, 0, rr, -Math.PI / 2, Math.PI / 2, true);

    const ringPoints = ringShape.getPoints(64);
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0xefd188,
      transparent: true,
      opacity: 0.35,
      linewidth: 2
    });
    const ringLine = new THREE.LineLoop(ringGeo, ringMat);
    ringLine.rotation.x = -Math.PI / 2;
    ringLine.position.y = 0.002;
    this.tableGroup.add(ringLine);

    // D. Accoudoir rembourré en cuir noir (Padded Leather Rail)
    const railOuterShape = new THREE.Shape();
    const railThickness = 0.35;
    const roR = r + railThickness;
    railOuterShape.moveTo(-straightLen / 2, roR);
    railOuterShape.lineTo(straightLen / 2, roR);
    railOuterShape.absarc(straightLen / 2, 0, roR, Math.PI / 2, -Math.PI / 2, true);
    railOuterShape.lineTo(-straightLen / 2, -roR);
    railOuterShape.absarc(-straightLen / 2, 0, roR, -Math.PI / 2, Math.PI / 2, true);

    // Trou intérieur correspondant à la limite du feutre
    const railHole = new THREE.Path();
    railHole.moveTo(-straightLen / 2, r);
    railHole.lineTo(straightLen / 2, r);
    railHole.absarc(straightLen / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
    railHole.lineTo(-straightLen / 2, -r);
    railHole.absarc(-straightLen / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);
    railOuterShape.holes.push(railHole);

    const railExtrudeSettings = {
      depth: 0.14,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.08,
      bevelThickness: 0.08
    };

    const railGeo = new THREE.ExtrudeGeometry(railOuterShape, railExtrudeSettings);
    const railMat = new THREE.MeshStandardMaterial({
      color: this.options.railColor,
      roughness: 0.32,
      metalness: 0.15
    });

    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.rotation.x = -Math.PI / 2;
    railMesh.position.y = -0.04;
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    this.tableGroup.add(railMesh);

    // E. Bordure extérieure en bois acajou verni (Wooden Table Body)
    const woodOuterShape = new THREE.Shape();
    const woodThickness = 0.52;
    const woR = r + woodThickness;
    woodOuterShape.moveTo(-straightLen / 2, woR);
    woodOuterShape.lineTo(straightLen / 2, woR);
    woodOuterShape.absarc(straightLen / 2, 0, woR, Math.PI / 2, -Math.PI / 2, true);
    woodOuterShape.lineTo(-straightLen / 2, -woR);
    woodOuterShape.absarc(-straightLen / 2, 0, woR, -Math.PI / 2, Math.PI / 2, true);

    const woodGeo = new THREE.CylinderGeometry(r * 1.05, r * 0.9, 0.4, 48);
    const woodMat = new THREE.MeshStandardMaterial({
      color: this.options.woodColor,
      roughness: 0.5,
      metalness: 0.1
    });

    // F. Pieds centraux de la table
    const legGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.6, 24);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x110b06, roughness: 0.7 });
    
    const leg1 = new THREE.Mesh(legGeo, legMat);
    leg1.position.set(-1.4, -0.9, 0);
    leg1.castShadow = true;
    this.tableGroup.add(leg1);

    const leg2 = new THREE.Mesh(legGeo, legMat);
    leg2.position.set(1.4, -0.9, 0);
    leg2.castShadow = true;
    this.tableGroup.add(leg2);

    this.scene.add(this.tableGroup);
  }

  /* ------------------------------------------------------------------------- */
  /* 7. TEXTURE PROCÉDURALE DU FEUTRE DE CASINO (Pas besoin d'asset externe)   */
  /* ------------------------------------------------------------------------- */
  generateFeltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base verte feutrée
    ctx.fillStyle = '#0f3823';
    ctx.fillRect(0, 0, 512, 512);

    // Bruit de texture feutrine
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 16;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 6);
    return texture;
  }

  /* ------------------------------------------------------------------------- */
  /* 8. GÉOMÉTRIES SIMPLES POUR LES CARTES & JETONS (Placeholders)             */
  /* ------------------------------------------------------------------------- */
  buildPlaceholders() {
    // A. Cartes communes au centre (Flop, Turn, River)
    const cardGeo = new THREE.BoxGeometry(0.48, 0.004, 0.70);
    const cardMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.05
    });

    const startX = -1.1;
    const spacing = 0.55;
    for (let i = 0; i < 5; i++) {
      const card = new THREE.Mesh(cardGeo, cardMat);
      card.position.set(startX + i * spacing, 0.005, -0.05);
      card.rotation.y = (Math.random() - 0.5) * 0.04;
      card.castShadow = true;
      card.receiveShadow = true;
      this.scene.add(card);
      this.cards.community.push(card);
    }

    // B. Deux cartes en main du joueur (Hero Hole Cards)
    const heroCardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.05
    });

    const heroCard1 = new THREE.Mesh(cardGeo, heroCardMat);
    heroCard1.position.set(-0.24, 0.008, 1.05);
    heroCard1.rotation.y = 0.12;
    heroCard1.castShadow = true;
    heroCard1.receiveShadow = true;
    this.scene.add(heroCard1);
    this.cards.hero.push(heroCard1);

    const heroCard2 = new THREE.Mesh(cardGeo, heroCardMat);
    heroCard2.position.set(0.24, 0.012, 1.05);
    heroCard2.rotation.y = -0.08;
    heroCard2.castShadow = true;
    heroCard2.receiveShadow = true;
    this.scene.add(heroCard2);
    this.cards.hero.push(heroCard2);

    // C. Piles de jetons de casino (Chips)
    this.createChipStack(-0.9, 0.8, 12, 0xd97706); // Jetons Dorés / Ambre
    this.createChipStack(-1.15, 0.75, 8, 0xef4444); // Jetons Rouges
    this.createChipStack(0.9, 0.8, 15, 0x10b981);  // Jetons Verts
    this.createChipStack(0.0, -0.65, 20, 0xf59e0b); // Pot au centre
  }

  createChipStack(x, z, count = 10, colorHex = 0xd97706) {
    const chipGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.038, 28);
    const chipMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.4,
      metalness: 0.2
    });

    const stackGroup = new THREE.Group();
    stackGroup.position.set(x, 0, z);

    for (let i = 0; i < count; i++) {
      const chip = new THREE.Mesh(chipGeo, chipMat);
      chip.position.y = 0.02 + i * 0.039;
      // Léger décalage organique pour simuler une vraie pile humaine
      chip.rotation.y = Math.random() * Math.PI;
      chip.position.x = (Math.random() - 0.5) * 0.008;
      chip.position.z = (Math.random() - 0.5) * 0.008;
      chip.castShadow = true;
      chip.receiveShadow = true;
      stackGroup.add(chip);
    }

    this.scene.add(stackGroup);
    this.chipStacks.push(stackGroup);
    return stackGroup;
  }

  /* ------------------------------------------------------------------------- */
  /* 9. CADRAGE INTELLIGENT RESPONSIVE (PC vs MOBILE-FIRST)                     */
  /* ------------------------------------------------------------------------- */
  updateCameraForDevice(width, height) {
    if (!this.camera) return;

    const isPortrait = height > width;
    this.camera.aspect = width / height;

    if (isPortrait) {
      /**
       * MODE PORTRAIT (Smartphone / Mobile vertical) :
       * On recule la caméra plus haut et plus en arrière, avec un FOV plus large
       * pour que l'intégralité de la table ovale soit visible sans déborder.
       */
      this.camera.fov = 68;
      this.camera.position.set(0, 4.8, 4.4);
      this.camera.lookAt(0, 0.1, 0.2);
    } else {
      /**
       * MODE PAYSAGE (PC / Écrans larges / Tablette) :
       * Cadrage immersif à la première personne, légèrement plongeant.
       */
      this.camera.fov = 46;
      this.camera.position.set(0, 3.1, 3.4);
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
  /* 10. BOUCLE DE RENDU 60 FPS                                                */
  /* ------------------------------------------------------------------------- */
  startRenderLoop() {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      // Micro-respiration discrète de la lumière suspendue (ambiance underground)
      const time = performance.now() * 0.001;
      if (this.spotLight) {
        this.spotLight.intensity = 3.8 + Math.sin(time * 1.5) * 0.08;
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  /* ------------------------------------------------------------------------- */
  /* 11. NETTOYAGE MÉMOIRE (CLEANUP)                                           */
  /* ------------------------------------------------------------------------- */
  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
    console.log('[Poker3D] Scène détruite proprement.');
  }
}

// Export global pour être invoqué facilement depuis n'importe quel script
window.Poker3DExperience = Poker3DExperience;
