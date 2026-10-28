# 🎭 LES FLAMBEURS — Le Casino Anonyme

Application web complète de casino virtuel entre potes, conçue avec une interface moderne, sombre et dynamique.

## 🎰 Jeux inclus
- **♠️ Poker Texas Hold'em :** Mode solo contre les bots, ou salons multijoueur par type (Duel, Table de 4, Table de 6 : « Salon 1, 2, 3 », mêmes blindes 50/100 et même mise de départ pour tous).
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
- `api/poker.js` : API (`GET` = état de la table, `POST` = actions). Chaque joueur est reconnu par son **jeton de connexion** ; les cartes adverses ne sont jamais envoyées. La mise de départ est **prélevée par le serveur** à l'assise, et les jetons rendus (départ, déconnexion, élimination) sont **versés par le serveur** sur le solde (registre `__poker_cashouts`, clés uniques anti double-paiement).
- `poker-multi.js` : lobby en deux étapes (choix du type de salon, puis Salon 1/2/3 ; mêmes blindes pour tous, réglables dans `api/_pokerEngine.js`) et adaptateur qui affiche l'état serveur dans la scène 3D de `poker3d.js`.
- Si un joueur ferme son onglet, le serveur lui rend ses jetons tout seul (au plus tard quand le croupier le détecte absent).
- Le **poker solo** (contre les bots, `poker3d.js`) se joue avec des **jetons d'entraînement** : il ne touche jamais au vrai solde.
- Tests : `node --test tests/pokerEngine.test.mjs tests/pokerApi.test.mjs`.
- `server.ps1` contient l'**ancien** poker : il n'est plus utilisé, préférez `serveur-local.mjs`.

## 🔐 Comptes et sécurité
Le navigateur ne parle plus directement à Supabase : tout passe par `api/accounts.js` (mots de passe hachés avec scrypt, jetons signés, règles d'écriture par champ, bannissements réservés au Patron).

Variables d'environnement à définir sur Vercel (Settings → Environment Variables) :
- `SUPABASE_SERVICE_KEY` : clé « service_role » de Supabase (jamais dans le navigateur).
- `AUTH_SECRET` : longue chaîne aléatoire qui signe les jetons de connexion.
- `ADMIN_PASSWORD` : mot de passe du Patron.

Ensuite, dans Supabase (SQL Editor), retirer l'accès public à la table `accounts` :
```sql
alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
```
Sans ces étapes le site fonctionne, mais la clé publique reste exploitable.

## 🛡️ Anti-triche : portefeuille entièrement géré par le serveur
Le navigateur **ne peut plus écrire un solde**. Toute mise, tout gain et tout virement passe par le serveur, qui tire lui-même les résultats :

- `api/_store.js` : accès aux comptes et `updateAccount()` = écriture atomique (numéro de version `data._ver`) : deux requêtes simultanées ne peuvent pas dépenser deux fois le même argent.
- `api/_wallet.js` : `walletCharge` / `walletPay` avec **clé unique** par opération (une opération rejouée ne s'applique jamais deux fois).
- `api/_games.js` : machine à sous, grattage, mines, gobelets, coffre, boutique, **blackjack solo** (le serveur garde le paquet et la carte cachée du croupier).
- `api/_bank.js` : virements (boîte de réception, historique, expiration 30 min, compte neuf bloqué 24 h pour limiter la création de faux comptes).
- `api/blackjack.js` : tables multijoueur ; mises prélevées au départ de la manche, gains versés à la fin ou mises remboursées si la manche est interrompue ; le paquet n'est jamais envoyé aux navigateurs.
- `api/crash.js` : le point de crash est tiré par le serveur et reste **secret jusqu'à l'explosion** ; le multiplicateur est calculé avec l'horloge du serveur.
- `api/accounts.js` : connexion, inscription, changement de pseudo (50 000 €), outils du Patron (`admin_credit`, `admin_set_balance`, `admin_reset`).
- Toutes les lignes `__poker_*`, `__crash_game__`, `__blackjack_game__` sont illisibles depuis le navigateur.
- Variable `WALLET_STRICT=0` (Vercel) : désactive le mode strict en cas d'urgence (déconseillé).

Tests : `ACCOUNTS_STORAGE=memory POKER_STORAGE=memory node --test tests/` (serveur, 61 tests) ; navigateur (serveur local lancé avec `E2E_TEST_HOOKS=1`, `BASE=http://localhost:8080`) : `node tests/auth-e2e.cjs`, `games-e2e.cjs`, `wallet-e2e.cjs` ; `node tests/e2e.cjs` avec `PORT=8099`.

## ⚠️ Limites connues
- **Plusieurs comptes pour un même joueur** : le serveur limite surtout les virements (blocage 24 h des comptes neufs), mais ne peut pas empêcher quelqu'un d'ouvrir plusieurs comptes.
- **Jeu des gobelets** : jeu d'adresse, un robot peut le jouer ; la mise est donc plafonnée (250 €).
- **Un mur d'écriture « si personne n'a modifié »** (`data->>_ver`) n'a pas pu être testé contre le vrai Supabase hors ligne : si la base le refuse, le serveur retombe sur une écriture simple (un avertissement apparaît dans les logs Vercel).
- Poker/blackjack/crash multijoueurs gardent leurs tables dans Supabase (écriture « dernier arrivé gagne » sur la table de jeu, pas sur l'argent, qui lui est protégé par des clés uniques).
