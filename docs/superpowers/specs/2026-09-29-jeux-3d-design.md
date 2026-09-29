# Vault Rush Arcade — les jeux en 3D, socle commun et pilote Diamond Drop (spec, 29/09/2026)

Lucas, 29/09/2026 : « et pourquoi pas tous les jeux en 3D ». Décisions prises avec lui le même jour :

- **un socle 3D commun**, construit une fois, puis les jeux convertis **un par un**, chacun validé par Lucas sur son téléphone avant le suivant ;
- **la 2D actuelle reste en secours**, intacte ;
- **pilote : Diamond Drop**, parce que la 3D y change le plus et que le serveur envoie déjà le chemin exact de la chute.

Ordre prévu ensuite (une spec courte par jeu, sur ce socle) : Vault Rush, Laser Grid, Getaway, Bomb Squad, Vault Code, Blackjack Express. Cette spec-ci ne couvre que **le socle et Diamond Drop**.

## 1. Règle qui ne bouge pas

Le serveur décide, la 3D rejoue. Aucune physique, aucun hasard, aucun calcul côté client ne choisit une case, une porte ou une carte : la scène reçoit le résultat déjà tiré (`path`, `slot`) et l'anime. Les taux de retour calibrés (Diamond Drop 97,6 / 95,2 / 93,6 %) restent donc exacts, et rien ne change côté serveur ni dans l'API.

## 2. Le socle 3D (`client/src/three/`)

| Fichier | Rôle | Dépend de |
|---|---|---|
| `support.ts` | `webglAvailable()` (essai de contexte sur un canvas jetable), `prefersReducedMotion()` (déplacé depuis `DiamondDropScreen`), `loadRenderPreference()` / `setRenderPreference("3d" \| "2d")` sur `localStorage` clé `vaultrush_render`, lecture et écriture sous `try/catch` (même recette que `lib/sound.ts`) ; `shouldRender3D()` = WebGL disponible ET pas de mouvement réduit ET préférence ≠ `"2d"`. | rien (pas de `three`) |
| `useRenderMode.ts` | hook React : `{ mode: "3d" \| "2d", toggle() }`, initialisé par `shouldRender3D()`. | `support.ts` |
| `RenderToggle.tsx` | petit bouton « Passer en 2D » / « Passer en 3D », affiché dans l'en-tête du plateau, **seulement si la 3D est possible** sur l'appareil. Préférence commune à tous les jeux. | `useRenderMode` |
| `palette.ts` | les couleurs « Néon arcade » en `THREE.Color` : fond `#0F0A1E`, magenta `#FF3D8A`, cyan `#35E5FF`, jaune `#FFD23F`, plus les teintes de chaleur des cases (reprises de `heat.ts`). | `three` |
| `stage.ts` | `createStage(canvas)` → `{ scene, camera, requestRender(), animate(durationMs, onFrame) → Promise, resize(), dispose() }`. Rendu : `WebGLRenderer` (antialias), `pixelRatio = min(devicePixelRatio, 2)`, halo néon par `EffectComposer` + `UnrealBloomPass` (addons de `three`, pas de dépendance en plus). **Aucune boucle permanente** : une image est calculée seulement pendant `animate` ou sur `requestRender` (redimensionnement, changement d'état). `ResizeObserver` sur le conteneur. `dispose()` libère géométries, matériaux, cibles de rendu et contexte. | `three`, `palette.ts` |
| `Stage3D.tsx` | composant React : crée le canvas (`aria-hidden="true"`), appelle `createStage` au montage, `dispose` au démontage, et passe la scène au jeu par une fonction `build(stage)`. | `stage.ts` |
| `Fallback.tsx` | frontière d'erreur : si la création du contexte WebGL ou la scène échoue en cours de route, elle affiche le plateau 2D passé en `fallback`, sans message d'erreur au joueur. | React |

`three` est la **seule** dépendance ajoutée. Elle n'est importée que par `client/src/three/` (sauf `support.ts`, `useRenderMode.ts`, `RenderToggle.tsx`, qui n'en ont pas besoin) et par les dossiers `client/src/games/*3d/`. Les plateaux 3D sont chargés par `React.lazy` : `three` part dans un morceau séparé, téléchargé seulement à l'ouverture d'un jeu en mode 3D. Pendant ce téléchargement, `Suspense` affiche le plateau 2D (jamais d'écran vide).

La CSP par défaut de `helmet` ne change pas : `three` n'utilise ni `eval`, ni worker, ni ressource externe ; les textures de texte sont dessinées sur un canvas local.

## 3. Le pilote : Diamond Drop (`client/src/games/diamond3d/`)

### Ce que voit le joueur

- Un plateau de clous néon cyan, **légèrement incliné vers le joueur** (≈ 20°), sur fond violet nuit ; les cases en bas, colorées par leur chaleur, le multiplicateur écrit dessus.
- Un **diamant facetté** (octaèdre allongé, matériau brillant, reflet magenta) qui tombe de clou en clou avec un petit rebond à chaque rangée et tourne légèrement sur lui-même.
- **Caméra** : au repos, elle cadre tout le plateau ; pendant la chute, elle suit le diamant en se rapprochant un peu (sur un téléphone, 17 cases dans 375 px seraient illisibles) ; à l'arrivée, elle se pose sur la case d'arrivée.
- **Arrivée** : la case s'allume, son multiplicateur grossit ; si ce multiplicateur vaut 2× ou plus, une gerbe d'éclats de la couleur de la case jaillit au-dessus. Le son reste celui d'aujourd'hui (`playOutcome("cashout")` au moment où le diamant est posé).

### Découpage

| Fichier | Rôle |
|---|---|
| `trajectory.ts` | **pur, sans `three`**. `gemPosition(path, rows, t)` → `{ x, y, hop }` pour `t` réel entre 0 et `path.length` : `x` interpole `offsetAt(path, ⌊t⌋)` → `offsetAt(path, ⌊t⌋ + 1)`, `y` suit la rangée, `hop` = arc de rebond `4·h·u·(1−u)` sur la fraction `u`. `slotCenter(slot, rows)` = `slot − rows/2`. `cameraTarget(...)` pour le suivi. |
| `DiamondScene.ts` | construit clous, cases (texte dessiné sur canvas), diamant, éclats ; expose `update(path, rowFloat, landedSlot)` et `celebrate(slot)`. |
| `DiamondBoard3D.tsx` | **mêmes props que `DiamondBoard`** (`rows`, `slots`, `path`, `row`, `landedSlot`). Entre deux changements de `row`, il anime le diamant de la rangée précédente à la nouvelle sur la durée d'une rangée. |

### Ce qui change dans `DiamondDropScreen.tsx`

Le minuteur rangée par rangée reste le seul maître du temps. Seuls changent :

- le choix du plateau : `mode === "3d"` → `<Fallback fallback={plateau2D}><Suspense fallback={plateau2D}><DiamondBoard3D …/></Suspense></Fallback>`, sinon `DiamondBoard` comme aujourd'hui ;
- la durée d'une rangée : **90 ms en 2D (inchangé), 140 ms en 3D** (16 rangées ≈ 2,2 s, le temps de voir les rebonds) ;
- `prefersReducedMotion` vient de `three/support.ts`.

Les repères, la liste complète des cases (`ToutesLesCases`), le bilan et les boutons restent en HTML sous le plateau : ce qu'un lecteur d'écran annonce ne change pas.

## 4. Erreurs et cas limites

- **Pas de WebGL, ou mouvement réduit** : 2D d'office, bouton 3D masqué.
- **Contexte WebGL perdu** (téléphone qui récupère la mémoire) : `Fallback` bascule en 2D pour la partie en cours ; la partie elle-même n'est pas touchée (elle vit sur le serveur).
- **Reprise d'une partie après rechargement** : même comportement qu'en 2D (le plateau se dessine dans l'état reçu).
- **Changement 3D ↔ 2D en pleine chute** : le plateau choisi reprend à la rangée courante ; aucun appel serveur.
- **Onglet masqué** : pas de boucle permanente, donc rien ne tourne ; `animate` se termine au retour.

## 5. Vérification

- **Tests unitaires (vitest, sans WebGL)** sur `trajectory.ts` : départ au centre ; à `t` entier, le diamant est exactement entre les clous attendus ; **à `t = path.length`, `x = slotCenter(slot)` pour des chemins tirés au hasard avec une graine fixe** (tous les modes, 8 à 16 rangées) ; le rebond est nul aux rangées entières. Sur `support.ts` : préférence absente → 3D si possible, `"2d"` → 2D, stockage qui lève → valeur par défaut sans planter, mouvement réduit → 2D.
- **Tests d'écran** : jsdom n'a pas WebGL, donc l'écran rend la 2D ; les 219 tests client existants passent sans modification. Un test vérifie que le bouton 3D est absent quand WebGL manque.
- **Garde d'import** : un test parcourt `client/src` et échoue si un fichier hors de `three/` et `games/*3d/` importe `three`.
- **Garde de poids** : après `vite build`, le morceau principal ne contient pas `three` (vérifié sur la sortie du build dans la CI).
- **Rendu réel** : captures du plateau en navigateur à plusieurs instants de la chute (départ, milieu, arrivée) en avançant le temps virtuel — une animation capturée trop tôt ment (leçon du compteur de RushPlay). Vérification que la case éclairée en 3D est bien celle du bilan.
- **Lucas sur son téléphone** : fluidité, lisibilité des multiplicateurs, bascule 2D. Le jeu suivant ne commence qu'après son accord.

## 6. Hors périmètre

Les six autres jeux, une refonte de l'accueil de l'arcade en 3D, des sons nouveaux, tout changement serveur.
