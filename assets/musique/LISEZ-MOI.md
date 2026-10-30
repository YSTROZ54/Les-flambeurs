# Musiques d'ambiance du casino 3D

Un dossier par salle. Dépose-y **plusieurs** fichiers (.mp3, .ogg, .m4a ou .wav) : le jeu en choisit un au hasard à chaque entrée dans la salle
(jamais le même deux fois de suite) et enchaîne avec un autre à la fin du titre.

| Dossier | Salle | Style conseillé |
|---|---|---|
| `hall/` | Hall d'accueil | lounge, jazz doux, piano |
| `machines-a-sous/` | Machines à sous | arcade, électro joyeuse, retro |
| `poker/` | Salle de poker | jazz enfumé, blues, piano bar |
| `courses/` | Courses de chevaux | fanfare, orchestral dynamique, épique |
| `tropi-shop/` | Tropi Shop | bossa nova, acoustique, chill |
| `pmu/` | PMU | folk joyeux, marimba, café |

Le cinéma garde sa propre musique.

Ensuite, depuis le dossier du projet :

```
npm run playlist
```

Cela écrit `playlist.json` (la liste des titres). Envoie le dossier `assets/musique/` (fichiers + `playlist.json`) sur l'hébergeur.
Tant qu'une salle n'a aucun fichier, le jeu joue sa musique synthétisée de secours.

## Où trouver des musiques

- **Pixabay Musique** (https://pixabay.com/fr/music/) : téléchargement à la main, gratuit, usage commercial permis sans attribution
  (vérifie la licence affichée sur chaque titre). L'API Pixabay ne propose que des images et des vidéos : pas de musique, et les
  téléchargements automatiques en masse y sont interdits.
- Autres sources libres : Free Music Archive, Jamendo, YouTube Audio Library (vérifie chaque licence).

Garde des titres de 2 à 4 minutes, en .mp3 de 128 à 192 kb/s : c'est léger et suffisant en fond sonore.
