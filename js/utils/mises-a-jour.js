// Fiches « Quoi de neuf ? » : une par mise en ligne, la plus récente en premier (comme patchnotes.js de Tropi Site).
// La première s'annonce une fois en bas à droite chez chaque joueur, puis toutes restent dans Notifications › Mises à jour.
// La version doit être unique : elle sert de repère « déjà lue ». À chaque nouvelle fiche, change aussi le ?v= de ce
// fichier dans index.html et Les_Flambeurs.html.
window.MISES_A_JOUR = [
  {
    version: '1.5',
    date: '30 octobre 2026',
    title: 'Ton téléphone, tes avatars, le Tropi Shop',
    notes: [
      { icon: 'fa-mobile-screen-button', color: '#38bdf8', text: 'Le téléphone devient une vraie appli : Mon Profil, Tropi Bank (envoyer, encaisser, historique), bouton retour en bas et petit son à chaque clic.' },
      { icon: 'fa-wand-magic-sparkles', color: '#fbbf24', text: 'Nouveaux avatars illustrés, dessinés à la main : renard, canard, lion, poulet, parrain… Choisis-les dans Mon Profil, ceux du Tropi Shop sont grisés tant que tu ne les as pas achetés.' },
      { icon: 'fa-hand', color: '#34d399', text: 'Ta main s\'affiche à l\'écran et les autres joueurs voient ton personnage tenir un téléphone ou une carte à gratter.' },
      { icon: 'fa-layer-group', color: '#f472b6', text: 'Barre du bas simplifiée à 5 cases, inventaire sur la touche Tab, et la roue des danses se pilote à la molette, sans curseur.' },
      { icon: 'fa-cart-shopping', color: '#c084fc', text: 'La boutique devient le Tropi Shop, avec son nouveau logo. Tous les jeux ont aussi leur logo sur l\'accueil, le menu et les portes du hall 3D.' },
      { icon: 'fa-expand', color: '#fb923c', text: 'Le hall 3D s\'ouvre en plein écran, l\'aide en bas de l\'écran est plus claire, et les flèches gauche/droite te font faire un pas sur le côté.' },
    ],
  },
  {
    version: '1.4',
    date: '29 octobre 2026',
    title: 'Roue des emotes plus grande',
    notes: [
      { icon: 'fa-expand', color: '#e879f9', text: 'La roue des danses et des emotes est bien plus grande : les icônes et les noms se lisent d\'un coup d\'œil.' },
      { icon: 'fa-face-smile', color: '#fbbf24', text: 'Nouvelle touche A pour ouvrir directement la roue des emotes, comme E pour les danses.' },
      { icon: 'fa-horse', color: '#34d399', text: 'Courses : le bord de la table est propre, plus de dents ni de bande qui dépasse.' },
    ],
  },
  {
    version: '1.3',
    date: '29 octobre 2026',
    title: 'Optimisation & rangement',
    notes: [
      { icon: 'fa-folder-tree', color: '#a78bfa', text: 'Le projet est maintenant organisé en dossiers : CSS, scripts 3D, poker, mini-jeux et utilitaires, pour des chargements plus propres.' },
      { icon: 'fa-users', color: '#38bdf8', text: 'Un compteur de joueurs en ligne s\'affiche en haut à droite, à côté des FPS.' },
      { icon: 'fa-palette', color: '#fb7185', text: 'Le dégradé animé des rôles (Flambeur, Patron) est maintenant fluide et sans coupure.' },
      { icon: 'fa-arrows-rotate', color: '#34d399', text: 'Meilleure synchronisation des positions des joueurs quand ils changent de salle : plus de personnage fantôme qui court dans le vide.' },
    ],
  },
  {
    version: '1.2',
    date: '29 octobre 2026',
    title: 'Les nouveautés en direct',
    notes: [
      { icon: 'fa-bell', color: '#fb7185', text: 'Une cloche dans l\'en-tête, à gauche de ton profil : elle ouvre tes notifications et affiche combien t\'attendent.' },
      { icon: 'fa-user', color: '#fbbf24', text: 'Nouveau profil en haut : ton pseudo, ton rang (Flambeur ou Patron) et ton avatar, avec la déconnexion juste à côté. Ton avatar s\'affiche aussi dans la fenêtre Profil.' },
      { icon: 'fa-crosshairs', color: '#34d399', text: 'Casino 3D en grand écran : clique pour piloter la vue à la souris, comme dans un jeu (Échap libère la souris). Plus de rotation folle quand le curseur touche le bord, plus de menu de côté par-dessus, et un bouton « Accueil » pour revenir. Les logos du casino remplacent aussi les emojis de l\'interface 3D.' },
      { icon: 'fa-computer-mouse', color: '#f59e0b', text: 'Réglage « Sensi » en haut de la 3D pour choisir la vitesse de la souris, gardé pour tes prochaines visites. Et si ton navigateur n\'utilise pas ta carte graphique (3D lente), un bandeau t\'explique comment l\'activer.' },
      { icon: 'fa-rocket', color: '#38bdf8', text: 'Fiches de mise à jour : à chaque nouveauté, une notification s\'affiche en bas à droite. Clique dessus pour lire la fiche.' },
      { icon: 'fa-newspaper', color: '#38bdf8', text: 'Onglet « Mises à jour » dans les notifications : toutes les fiches y restent, de la plus récente à la plus ancienne.' },
      { icon: 'fa-hashtag', color: '#a78bfa', text: 'Les onglets des notifications (Toutes, Jeux, Amis, Banque) affichent enfin le bon nombre de demandes.' },
    ],
  },
  {
    version: '1.1',
    date: '29 octobre 2026',
    title: 'Un menu plus simple',
    notes: [
      { icon: 'fa-table-columns', color: '#fbbf24', text: 'Menu de côté : ouvert à l\'accueil, à côté de la page, et rangé en icônes dans les jeux pour leur laisser toute la place.' },
      { icon: 'fa-ellipsis', color: '#f59e0b', text: '« Plus » en bas du menu : profil, amis, notifications, succès, classement et paramètres s\'ouvrent juste à côté.' },
      { icon: 'fa-broom', color: '#34d399', text: 'Plus de barre de liens en haut : l\'en-tête ne garde que ton solde et ton profil.' },
      { icon: 'fa-image', color: '#e879f9', text: 'Le logo du casino en haut du menu et de l\'en-tête.' },
    ],
  },
  {
    version: '1.0',
    date: '29 octobre 2026',
    title: 'Nouveaux logos',
    notes: [
      { icon: 'fa-icons', color: '#38bdf8', text: 'Des logos pour tous les jeux et les menus à la place des emojis : pique pour le Poker, cartes pour le Blackjack, gobelets, machine à sous…' },
      { icon: 'fa-coins', color: '#fbbf24', text: 'Une vraie pièce en or pour ton solde et tous les montants.' },
      { icon: 'fa-screwdriver-wrench', color: '#94a3b8', text: 'Le bouton Grattage du menu ne se décale plus quand tu changes de salle.' },
    ],
  },
];
