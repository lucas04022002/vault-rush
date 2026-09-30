# Diamond Drop « premium » — cristal, chrome, ombres, caméra de cinéma, son (spec + plan, 30/09/2026)

Lucas, 30/09/2026, après la première 3D (PR #4) : « c'est pas ouf, pas possible de faire de la vraie 3D comme les sites casino ? ». Il a choisi, dans la liste proposée, ces cinq points :

1. un diamant en vrai cristal, qui réfracte la lumière et fait des reflets irisés en tournant ;
2. des clous chromés qui reflètent la salle et vibrent quand le diamant les touche ;
3. de vraies ombres, et un plateau en métal brossé au lieu d'un fond violet uni ;
4. une caméra de cinéma : flou de profondeur, ralenti et zoom sur les gros gains ;
5. le son : un tintement à chaque clou, qui monte vers l'arrivée.

La règle ne change pas : **le serveur tire, la 3D rejoue**. Le ralenti ne modifie que la durée des dernières rangées ; il ne décide de rien. Aucun changement serveur.

## Choix techniques

- **Éclairage de studio sans fichier à télécharger** : `RoomEnvironment` (addon de Three.js) passé au `PMREMGenerator` donne une carte d'environnement pour les reflets (chrome, cristal, métal). Aucun HDRI externe : pas de téléchargement, pas de poids, la CSP ne bouge pas.
- **Rendu physique** : `ACESFilmicToneMapping` (appliqué par l'`OutputPass`), ombres douces `PCFSoftShadowMap`.
- **Deux niveaux de qualité**, choisis une fois par `support.ts` (sans `three`) : `haute` sur un appareil à pointeur fin (ordinateur) ; `normale` sinon (téléphone). En `normale` : pas de flou de profondeur, ombres en 1024 au lieu de 2048. Le cristal reste dans les deux (un seul objet).
- **Cristal** : `LatheGeometry` à 8 facettes (taille brillant : couronne, rondiste, pavillon), `MeshPhysicalMaterial` avec `transmission`, `ior` 2,42 (diamant), `dispersion` (arc-en-ciel), `iridescence`.
- **Clous** : `InstancedMesh` chromé (`metalness` 1). Le clou touché grossit et s'illumine en améthyste pendant 260 ms (`setMatrixAt` + `setColorAt`). Le clou touché à la rangée `i` est l'indice `nombre de « à droite » parmi les i premiers pas`, le même que dessine `pinPosition`.
- **Plateau** : `MeshPhysicalMaterial` sombre, métallique, `anisotropy` (reflet de métal brossé sans texture), qui reçoit les ombres.
- **Ralenti** : fonction pure `dureeRangee(rangee, total, multiplicateur)` dans `games/diamond3d/rythme.ts` (sans `three`) : 140 ms, et ×2,5 sur les 3 dernières rangées quand la case tirée vaut ×5 ou plus. L'écran l'utilise pour son minuteur, et passe la durée courante à la scène (`rowMs`), qui reste synchrone.
- **Zoom et secousse** : sur un gros gain, la caméra resserre son cadre (4,5 cases au lieu de 7) pendant le ralenti, puis tremble 350 ms à l'arrivée (oscillation amortie, déterministe).
- **Flou de profondeur** (`haute` seulement) : `BokehPass` avant le halo ; la mise au point suit le diamant.
- **Son** : `playPeg(rangee, total)` dans `lib/sound.ts`, tintement de synthèse dont la hauteur monte avec la rangée. Il est appelé par l'écran à chaque rangée franchie, en 2D comme en 3D, et reste soumis au réglage son du compte (coupé par défaut).

## Tâches

1. `rythme.ts` + tests ; branchement dans l'écran (le minuteur utilise la durée de la rangée courante en 3D ; la 2D reste à 90 ms) ; test d'écran : un gros gain ralentit les 3 dernières rangées.
2. `playPeg` + tests (hauteur croissante, rien si le son est coupé) ; appel par l'écran à chaque rangée.
3. `qualiteRendu()` dans `support.ts` + tests.
4. `stage.ts` : environnement, tone mapping, ombres, `BokehPass` en qualité haute, `setFocus(distance)` sur le `Stage`.
5. `DiamondScene` : cristal, clous chromés qui vibrent, plateau brossé, lumière qui projette les ombres, zoom et secousse ; tests de scène (clou touché = bon indice, vibration qui s'éteint, zoom seulement sur gros gain, boucle qui s'arrête au repos).
6. Réglage à l'œil dans le navigateur (bureau et 375 px), vérification du poids et de la garde, captures, PR.
