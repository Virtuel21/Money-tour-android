# Plateau Blender — recette du 16 octobre 2026

## Périmètre réalisé

Le plateau est désormais chargé depuis `models/board-layout.glb`, créé dans Blender 5.2.2 via le MCP connecté. Le socle, les corps des cases, les surfaces UV, la mer, les vaguelettes, les quais de loyer, les liserés de propriétaire, les volumes de sélection, le décalque de l’Île perdue et les quatre plans illustrés centraux sont des objets Blender.

Les coordonnées, dimensions, hauteurs et orientations reprennent les fonctions `boardShape`, `tileFrame`, `tileLabelRegions` et la disposition de la lagune. Les quatre formats 26/28/30/32 cases sont exportés. Dix-huit motifs de sol sont capturés sans perte depuis les canvas d’origine et embarqués en PNG dans le GLB. Les illustrations existantes sont réutilisées, avec conversion des conventions UV verticales et conservation de leurs espaces colorimétriques.

Le moteur attribue les textures selon la partie, y compris les rues mélangées. Les palettes personnalisées du mode debug et des sauvegardes anciennes ont un repli vers leur motif canvas. Les noms, loyers, commandes accessibles, pions et constructions variables restent des éléments dynamiques du jeu. Les dioramas centraux conservent leur illustration d’origine sur des plans 3D : ce changement ne transforme pas ces illustrations en sculptures volumétriques.

Le GLB de jeu contient les quatre variantes et les références de matériaux. Il est destiné au chargeur du jeu. Le GLB de présentation livré séparément montre une seule variante 32 cases, avec ses illustrations déjà affectées. Le `.blend` conserve une scène d’inspection et une scène source.

## Dimensions et intégrité

Neuf nouveaux contrôles lisent le vrai fichier GLB et comparent les surfaces et les quais aux zones cliquables des quatre plateaux. Les positions des quatre dioramas sont aussi contrôlées. L’export de présentation compte 7 510 triangles et aucune face dégénérée parmi les maillages visibles. Les maillages conservent leurs UV et leurs normales ; les accessoires existants restent regroupés par matériau à l’exécution.

`board-layout.glb` : 400 452 octets. Les UV inutilisées de `fortune.glb`, qui utilise uniquement des matériaux unis, sont supprimées sans changement de positions, normales ou indices : 3 720 940 → 2 824 464 octets. Les assets publics totalisent 19 263 861 octets pour une limite de 20 000 000.

## Validation logicielle

`pnpm check` : typage, lint, 717 tests dans 69 fichiers, couverture, build et contrôles des assets réussis. Couverture finale moteur : lignes 97,20 %, branches 93,19 %, fonctions 99,36 %. `pnpm format:check` est vérifié séparément.

Le chargement attend la compilation des shaders et une image rendue. Le bandeau de changement de tour est retiré après 2,8 secondes même lorsque le système désactive les animations ; il ne reste plus superposé au plateau en mouvement réduit.

## Recette visuelle et interactions

Comparaison de captures Chromium entre le composant d’origine de `HEAD` et le composant final : 320×740, 390×844, 844×390, 768×1024, 1024×768, 1440×1000, 1920×1080, 2560×1440. L’interception de référence vérifie que l’ancien composant ne charge pas le nouveau GLB. Les différences numériques résiduelles sont conservées dans le rapport de livraison ; ce contrôle ne revendique pas une identité mathématique de tous les pixels.

Chrome 155, Edge 155 et Firefox 153 : matrice de onze résolutions, de 320×740 à 3840×2160, sans erreur JavaScript ni débordement horizontal ; présence du rendu contrôlée dans les captures. Scènes supplémentaires : achat, voyage, Mondial, personnages regroupés, architecture, assurance et enchère.

Interactions jouées dans Chrome, Firefox et WebKit : ouverture d’une propriété à la souris, passage à la vue globale mobile, présence des 32 noms et ouverture d’une propriété. Les taps sont émulés dans Chrome et WebKit ; Firefox utilise la souris. Chrome : pincement jusqu’à 160 %, déplacement tactile puis recentrage validés. Les gestes utilisent des événements de navigateur, sans téléphone physique.

## Réserve empêchant la publication

Le WebKit 26.5 automatisé sous Windows affiche le plateau à taille fixe, mais peut perdre la composition du canvas après un changement de taille : rotation simulée, changement de viewport ou fermeture du conseil modifiant la place du plateau. Le défaut se reproduit aussi avec le composant d’origine de `HEAD`, sans le nouveau GLB. Les noms HTML et les commandes restent visibles ; l’absence de rendu WebGL est donc relevée comme un échec visuel, même lorsque les contrôles DOM passent.

Les essais de conservation du buffer, de désactivation MSAA, de remise à zéro de l’état WebGL et de recréation de la couche CSS n’ont pas résolu cette limite du banc automatisé. Aucun de ces contournements expérimentaux n’est ajouté au produit. Les vues fixes et interactions WebKit ne constituent pas une validation Safari/iOS.

Téléphones Android et iPhone, Safari réel, rotations et retour d’arrière-plan sur ces appareils : **non testés**. La recette « tous les appareils et écrans » n’est donc pas entièrement validée. **Aucun push ni déploiement de cette modification.**

## Reproduction

1. Démarrer le jeu avec `pnpm dev --port 4173`.
2. Au besoin, régénérer les mesures et motifs : `node scripts/bake-board-source.mjs`. Playwright doit être installé ou fourni par `PLAYWRIGHT_MODULE` pointant vers son module `index.mjs`.
3. Dans le MCP Blender, exécuter `scripts/build_board.py` en fournissant son chemin comme `__file__`. Il crée ses propres scènes et préserve les scènes utilisateur. Une nouvelle exécution remplace uniquement les scènes portant son marqueur de génération.
4. Le GLB de jeu est écrit dans `apps/web/public/models/board-layout.glb`, et le `.blend` dans `artifacts/money-tour-board.blend`. `MONEY_TOUR_BOARD_BLEND_OUT` permet de choisir le chemin du `.blend`.
5. Après reconstruction de la bibliothèque Fortune : `node scripts/prune-model-uvs.mjs apps/web/public/models/fortune.glb`.
6. Exécuter `pnpm format:check` et `pnpm check`, puis refaire la comparaison visuelle et la recette physique avant toute publication.
