# Musiques d'ambiance du casino 3D

Un dossier par salle. Dépose-y **plusieurs** fichiers (.mp3, .ogg, .m4a ou .wav) : le jeu en choisit un au hasard à chaque entrée dans la salle
(jamais le même deux fois de suite) et enchaîne avec un autre à la fin du titre.

| Dossier | Salle | Style conseillé |
|---|---|---|
| `hall/` | Hall d'accueil | lounge, jazz doux, piano |
| `machines-a-sous/` | Machines à sous | arcade, électro joyeuse, retro |
| `poker/` | Salle de poker | jazz enfumé, blues, piano bar |
| `tropi-shop/` | Tropi Shop | bossa nova, acoustique, chill |
| `pmu/` | PMU | folk joyeux, marimba, café |
| `blackjack/` | Blackjack | jazz chic, swing, piano |
| `blind-test/` | Blind test | jeu-concours entraînant, percussions légères |
| `crash/` | Crash (fusée) | électro tendue, synthwave |
| `mini-jeux/` | Mini jeux (UNO, Puissance 4) | pop légère, chiptune |
| `loup-garou/` | Loup-garou | ambiance sombre, cordes, mystère |
| `salle-musique/` | Salle de musique (le sol de verre et les lumières suivent le son) | électro, house, pop rythmée |
| `cinema/` | Cinéma | bande-annonce, orchestral (se tait pendant le film) |

Sans fichier, le hall, les machines, le poker, les courses, le Tropi Shop, le PMU, le blind test et le cinéma jouent une musique synthétisée ; les autres salles restent silencieuses.

Ensuite, depuis le dossier du projet :

```
npm run playlist
```

Cela écrit `playlist.json` (la liste des titres). Envoie le dossier `assets/musique/` (fichiers + `playlist.json`) sur l'hébergeur.

## Où trouver des musiques

- **Pixabay Musique** (https://pixabay.com/fr/music/) : téléchargement à la main, gratuit, usage commercial permis sans attribution
  (vérifie la licence affichée sur chaque titre). L'API Pixabay ne propose que des images et des vidéos : pas de musique, et les
  téléchargements automatiques en masse y sont interdits.
- Autres sources libres : Free Music Archive, Jamendo, YouTube Audio Library (vérifie chaque licence).

Garde des titres de 2 à 4 minutes, en .mp3 de 128 à 192 kb/s : c'est léger et suffisant en fond sonore.

Le hall est un cas particulier : ses titres sont joués en même temps chez tous les joueurs (le titre en cours se déduit de l horloge, durées dans la clé _sync de playlist.json). Après un ajout de titre, relance bien `npm run playlist`.
