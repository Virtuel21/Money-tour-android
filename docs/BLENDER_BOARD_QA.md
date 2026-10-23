# Plateau Blender — recette du 16 octobre 2026

## Périmètre réalisé

Le plateau est désormais chargé depuis `models/board-layout.glb`, créé dans Blender 5.2.2 via le MCP connecté. Le socle, les corps des cases, les surfaces UV, la mer, les vaguelettes, les quais de loyer, les liserés de propriétaire, les volumes de sélection, le décalque de l’Île perdue et les quatre plans illustrés centraux sont des objets Blender.

Les coordonnées, dimensions, hauteurs et orientations reprennent les fonctions `boardShape`, `tileFrame`, `tileLabelRegions` et la disposition de la lagune. Les quatre formats 26/28/30/32 cases sont exportés. Dix-huit motifs de sol sont capturés sans perte depuis les canvas d’origine et embarqués en PNG dans le GLB. Les illustrations existantes sont réutilisées, avec conversion des conventions UV verticales et conservation de leurs espaces colorimétriques.

Le moteur attribue les textures selon la partie, y compris les rues mélangées. Les palettes des sauvegardes anciennes ont un repli vers leur motif canvas. Les noms, loyers, commandes accessibles, pions et constructions variables restent des éléments dynamiques du jeu. Les dioramas centraux conservent leur illustration d’origine sur des plans 3D : ce changement ne transforme pas ces illustrations en sculptures volumétriques.

Le GLB de jeu contient les quatre variantes et les références de matériaux. Il est destiné au chargeur du jeu. Le GLB de présentation livré séparément montre une seule variante 32 cases, avec ses illustrations déjà affectées. Le `.blend` conserve une scène d’inspection et une scène source.

## Dimensions et intégrité

Neuf nouveaux contrôles lisent le vrai fichier GLB et comparent les surfaces et les quais aux zones cliquables des quatre plateaux. Les positions des quatre dioramas sont aussi contrôlées. L’export de présentation compte 7 510 triangles et aucune face dégénérée parmi les maillages visibles. Les maillages conservent leurs UV et leurs normales ; les accessoires existants restent regroupés par matériau à l’exécution.

`board-layout.glb` : 400 452 octets. Les UV inutilisées de `fortune.glb`, qui utilise uniquement des matériaux unis, sont supprimées sans changement de positions, normales ou indices : 3 720 940 → 2 824 464 octets. Les assets publics totalisent 19 263 861 octets pour une limite de 20 000 000.

## Validation logicielle

`pnpm check` : typage, lint, 717 tests dans 69 fichiers, couverture, build et contrôles des assets réussis. Couverture finale moteur : lignes 97,20 %, branches 93,19 %, fonctions 99,36 %. `pnpm format:check` est vérifié séparément.

Le chargement attend la compilation des shaders et une image rendue. Le bandeau de changement de tour est retiré après 2,8 secondes même lorsque le système désactive les animations ; il ne reste plus superposé au plateau en mouvement réduit.

## Recette visuelle et interactions

Comparaison de captures Chrome entre le composant d’origine de `ebf13ab` et le composant final : 320×740, 390×844, 844×390, 768×1024, 1024×768, 1440×1000, 1920×1080, 2560×1440. Les deux composants utilisent la même interface corrigée afin d’isoler le plateau. L’interception de référence vérifie que l’ancien composant ne charge pas le nouveau GLB. Les différences numériques résiduelles sont conservées dans le rapport de livraison ; ce contrôle ne revendique pas une identité mathématique de tous les pixels.

Chromium 156, Chrome 155, Edge 155, Firefox 157 et WebKit 27.2 : matrice de onze résolutions successives, de 320×740 à 3840×2160 ; présence du rendu contrôlée dans les captures composées. Trois allers-retours portrait/paysage par navigateur à densité 2. Scènes supplémentaires en portrait et paysage : achat, voyage, Mondial, personnages regroupés, architecture, assurance et enchère. Les exceptions JavaScript, débordements horizontaux et pertes du contexte WebGL provoquent un échec.

La passe finale compte **198 captures et 18 groupes de contrôles d’interaction, sans échec**. La commande autonome `pnpm qa:board`, sans serveur préexistant, passe aussi ses 39 captures WebKit et arrête son serveur en fin d’exécution.

Interactions : ouverture d’une propriété à la souris, passage à la vue globale mobile, présence des 32 noms et ouverture d’une propriété dans les cinq navigateurs. Les taps sont émulés dans Chromium, Chrome, Edge et WebKit ; Firefox utilise la souris. Chromium, Chrome et Edge : pincement au-delà de 100 %, déplacement tactile puis recentrage validés. Les gestes utilisent des événements de navigateur, sans téléphone physique.

Le premier lancement en paysage est aussi vérifié en 568×320, 667×375 et 844×390. Le panneau de conseil débordait au-dessus de la fenêtre ; son texte défile désormais dans la place disponible avec accès clavier, et « Compris » reste visible avec une cible de 44 pixels. La hauteur minimale héritée de 250 pixels de la carte d’action est retirée en paysage : le lancer reste accessible après fermeture du conseil. Le panneau latéral peut défiler sur les écrans les plus courts et quand l’historique est ouvert.

Le build de production est ensuite ouvert dans les cinq navigateurs, avec cinq tailles successives chacun : 25 captures, les quatre GLB chargés en HTTP 200, aucun échec réseau ni exception JavaScript. WebKit signale qu’il ignore la directive optionnelle de viewport `interactive-widget` ; ce message est conservé dans les preuves et distingué des erreurs de l’application. Les sauvegardes reconnues à 26 et 28 cases ainsi qu’une partie à 32 cases avec rues mélangées sont reprises dans Chrome, Firefox et WebKit, sur bureau et en vue globale mobile : 18 captures supplémentaires avec rendu présent et nombre de noms conforme.

## Défaut WebKit résolu dans le banc de recette

Le WebKit 26.5 automatisé sous Windows perdait la composition du canvas après un changement de taille, avec l’ancien plateau comme avec le nouveau modèle. Le contenu lu directement dans le buffer WebGL restait correct tandis que la capture de la page ne montrait plus le plateau. Un canvas WebGL minimal sans Three.js reproduit le défaut.

La cause correspond au [défaut Playwright Windows #42885](https://github.com/microsoft/playwright/issues/42885), corrigé dans [WebKit #75957](https://github.com/WebKit/WebKit/pull/75957), commit `26c9d56` / `322870@main` : l’état de présentation du canvas après redimensionnement pouvait empêcher la transmission d’une nouvelle image au compositeur. Le banc utilise désormais Playwright **1.65.0-alpha-2026-10-16**, avec WebKit **27.2, révision 2376**. La version stable 1.64.1 / révision 2370 reproduisait encore le défaut lors de la contre-vérification. Cette dépendance de développement est verrouillée ; elle ne fait pas partie du bundle du jeu.

Le script pérenne `scripts/qa-board.mjs` refuse une ancienne révision WebKit Windows et exécute d’abord trois redimensionnements d’un canvas rouge minimal, puis la recette réelle du jeu. Les captures composées doivent montrer la mer du plateau ; contrôler seulement les étiquettes DOM ou le buffer WebGL masquerait le défaut. Aucun contournement expérimental de rendu n’est ajouté au produit.

## Limites et publication

Téléphones Android et iPhone, Safari réel, rotations et retour d’arrière-plan sur ces appareils : **non testés**. La recette « tous les appareils et écrans » n’est donc pas entièrement validée. **Aucun push ni déploiement de cette modification.**

## Reproduction

1. Installer les dépendances verrouillées avec `pnpm install --frozen-lockfile`, puis les moteurs avec `pnpm qa:board:install`. La version de développement épinglée est nécessaire au correctif WebKit Windows vérifié ici.
2. Lancer `pnpm qa:board`. Le script démarre et arrête son propre serveur local et conserve captures et résultats dans `artifacts/board-qa`. `BOARD_QA_URL` réutilise un serveur de développement ; `BOARD_QA_OUT` change le dossier de preuves et `BOARD_QA_BROWSERS` sélectionne les navigateurs. Sous Windows, Chrome et Edge installés sont aussi vérifiés ; ailleurs, Chromium, Firefox et WebKit sont les valeurs par défaut. Au besoin, régénérer les mesures et motifs avec `node scripts/bake-board-source.mjs` après démarrage du jeu sur le port 4173.
3. Dans le MCP Blender, exécuter `scripts/build_board.py` en fournissant son chemin comme `__file__`. Il crée ses propres scènes et préserve les scènes utilisateur. Une nouvelle exécution remplace uniquement les scènes portant son marqueur de génération.
4. Le GLB de jeu est écrit dans `apps/web/public/models/board-layout.glb`, et le `.blend` dans `artifacts/money-tour-board.blend`. `MONEY_TOUR_BOARD_BLEND_OUT` permet de choisir le chemin du `.blend`.
5. Après reconstruction de la bibliothèque Fortune : `node scripts/prune-model-uvs.mjs apps/web/public/models/fortune.glb`.
6. Exécuter `pnpm format:check` et `pnpm check`, puis refaire la comparaison visuelle et la recette physique avant toute publication.
