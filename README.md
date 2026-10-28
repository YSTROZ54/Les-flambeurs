# 🎭 LES FLAMBEURS — Le Casino Anonyme

Application web complète de casino virtuel entre potes, conçue avec une interface moderne, sombre et dynamique.

## 🎰 Jeux inclus
- **♠️ Poker Texas Hold'em :** Mode solo contre les bots, ou salon multijoueur (table publique / table privée par code) avec option pour combler les places vides par des bots.
- **🃏 Blackjack :** Solo contre le croupier ou table multijoueur.
- **🥤 Jeu des Gobelets :** Trouvez la bille cachée sous les gobelets avec animation et choix de vitesse.
- **🎡 Roulette Française :** Tapis complet de mises (numéros pleins, rouge/noir, pair/impair, manqué/passé, douzaines, colonnes).
- **🚀 Fusée Crash :** Encaissez avant que le multiplicateur n'explose en vol.
- **🍒 Machine à Sous (Slots) :** Machine à rouleaux avec jackpot x500 et bonus.
- **💣 La Chambre Forte (Mines) :** Grille 5x5 avec choix du nombre de bombes et cashout sécurisé.

## 🏢 Économie & Fonctionnalités
- **La Banque du Club :** Système de virements entre vrais joueurs enregistrés et historique des transactions.
- **Boutique & Bâtiments :** Achetez des propriétés générant des revenus passifs réguliers (Night Club, Hôtel de Luxe, Casino Flambeur).
- **Leaderboard Dynamique :** Classement en temps réel entre vous et vos amis.
- **Panneau Admin (Le Patron) :** Ajustez les probabilités de la maison et gérez les comptes.

## 🚀 Lancement rapide
Pour le **multijoueur**, lancez le serveur local (Node.js 18+ requis) :

```
node serveur-local.mjs
```

puis ouvrez http://localhost:8080 . Les tables de poker sont alors gardées en mémoire. En ligne (Vercel), elles sont stockées dans Supabase.
Sans serveur, ouvrir `index.html` fonctionne toujours pour le mode solo.

## ♠️ Poker multijoueur (architecture)
- `api/_pokerEngine.js` : moteur de poker pur, **autoritaire côté serveur** (blindes, relances minimales, pots annexes, mélange cryptographique, chrono de 120 s).
- `api/poker.js` : API (`GET` = état de la table, `POST` = actions). Chaque joueur est reconnu par un secret d'appareil ; les cartes adverses ne sont jamais envoyées.
- `poker-multi.js` : lobby (9 tables publiques + salons privés par code) et adaptateur qui affiche l'état serveur dans la scène 3D de `poker3d.js`.
- Si un joueur ferme son onglet, sa mise reste en attente côté serveur et lui est rendue à sa prochaine ouverture du poker.
- Tests : `node --test tests/pokerEngine.test.mjs tests/pokerApi.test.mjs`.
- `server.ps1` contient l'**ancien** poker : il n'est plus utilisé, préférez `serveur-local.mjs`.

## ⚠️ Limites de sécurité connues
Les soldes sont conservés côté navigateur et la clé Supabase publique est visible : un joueur technique pourrait donc modifier son solde. Pour un vrai anti-triche il faudrait des comptes avec mot de passe haché et des règles RLS Supabase.
