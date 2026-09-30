# Vault Rush en 3D — portes de coffre (spec + plan, 30/09/2026)

Lucas, 30/09/2026 : « ok go Vault Rush en 3D », après Diamond Drop « premium » (PR #5). Même niveau de finition et même socle (`client/src/three/`), avec les leçons de Diamond Drop : reflets du studio posés par matière (`envMap: stage.studio`), pas de halo (bloom), caméra qui ne montre jamais de vide.

## Règles qui ne bougent pas

- **Le serveur décide, la 3D rejoue.** Une porte ne s'ouvre qu'après la réponse du serveur : sur l'or si l'étage est franchi, sur l'alarme si la partie est perdue. À la fin (perdue ou encaissée), toutes les portes montrent ce que le serveur a révélé (`revealed`).
- **Les portes restent de vrais boutons.** En 3D, une grille de `<button>` transparents est posée exactement sur les portes dessinées : mêmes libellés qu'en 2D (« Porte 2 », « Porte 2 — coffre »), même verrouillage, clavier et lecteur d'écran inchangés. La caméra est de face et les portes sont dans un plan parallèle à l'écran : la projection est linéaire, une colonne de grille = une porte.
- **La 2D reste en secours** : même bascule « Vue 3D », même repli (`Fallback`) que Diamond Drop. `boardFor("vault-rush")` renvoie toujours `VaultBoard`, qui choisit entre la 2D actuelle et la 3D.

## Ce que voit le joueur

- Un mur d'acier brossé, et une rangée de 3 à 5 portes de coffre rondes : un battant épais et chromé, un volant à 4 rayons, 8 verrous sur le pourtour, et un numéro gravé. Au-dessus, une plaque « ÉTAGE n ».
- Une porte survolée ou sélectionnée au clavier s'éclaire d'un liseré néon jaune, l'accent de Vault Rush.
- **Coffre** : le volant tourne, le battant pivote sur ses gonds (à gauche) et découvre une niche pleine de lingots d'or. Puis toute la rangée descend, comme vue d'un ascenseur, et l'étage suivant arrive avec ses portes fermées. La plaque passe à l'étage suivant.
- **Alarme** : le battant s'ouvre sur un gyrophare rouge qui tourne et baigne le mur de rouge. Les autres portes s'ouvrent ensuite l'une après l'autre sur leur contenu.
- **Encaissement** : toutes les portes s'ouvrent sur leur contenu, sans gyrophare.
- Pendant une animation (≈ 1,4 s), les boutons sont verrouillés : on ne choisit pas une porte de l'étage suivant avant de la voir.

## Découpage

| Fichier | Rôle |
|---|---|
| `games/coffre3d/portes.ts` | **pur** : `contenus(revealed, nb)` (fermée / or / alarme), `evenement(avant, apres, choix)` (montée, alarme, encaissement, ou rien), `disposition(nb, largeur, hauteur)` (centre et rayon de chaque porte, pour la scène ET la grille de boutons). |
| `games/coffre3d/VaultScene.ts` | la scène : mur, portes, niches, or, gyrophare, plaque d'étage ; `montrer(contenus, etage)` sans animation, `jouer(evenement)` animé, `survoler(i)`. Noms d'objets pour les tests. |
| `games/coffre3d/VaultBoard3D.tsx` | défaut exporté (lazy) : la frise des étages (HTML, commune avec la 2D), le canvas, la grille de boutons, le verrou d'animation. |
| `games/boards/VaultBoard.tsx` | devient l'aiguillage 2D / 3D ; l'actuel devient `VaultBoard2D` ; la frise des étages est extraite (`VaultFloors`) pour être partagée. |
| `three/palette.ts` | + `alarm` (`#FF4D4D`) et `safe` (`#41F0A5`), vérifiés contre `tokens.css`. |

## Vérification

- Tests purs (`portes.ts`) : contenus, événements (étage franchi = montée avec la porte choisie ; perdue = alarme ; encaissée = ouverture de toutes ; reprise = rien), disposition (portes dans le cadre, sans chevauchement, alignées sur une grille à N colonnes).
- Tests de scène (faux `Stage`) : nombre de portes, battants ouverts selon l'événement, rangée qui revient fermée après une montée, gyrophare seulement sur alarme, boucle qui s'arrête au repos.
- Tests d'écran : sans WebGL, la 2D d'aujourd'hui (tests existants inchangés) ; avec WebGL, plateau 3D + boutons « Porte n » cliquables qui jouent le bon coup ; verrou pendant l'animation ; bascule 2D.
- Rendu réel : bureau et 375 px, une partie gagnée d'un étage, une perdue, une encaissée ; captures.
