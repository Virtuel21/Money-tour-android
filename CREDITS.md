# Crédits de Money Tour

Code original sous licence MIT, voir LICENSE. Le projet n’est pas affilié à un autre éditeur et ne reprend aucun asset du jeu de référence.

## Modèles et interface originaux

Créations originales pour Julien, MIT : scripts/art_*.py et scripts/build_models.py, apps/web/public/models/money-tour.glb (export courant : plateau, tuiles, dés, jardins, palmiers et pièces spéciales ; personnages, architecture et îles conservés dans les sources Blender), apps/web/src/board/Board3D.tsx (mise en scène), App.tsx, styles.css, favicon.svg et social-card.svg/png. Modélisation effectuée dans Blender 5.2.2 via son MCP connecté. Les trois artworks fournis par Julien servent de références de direction artistique ; leurs fichiers source ne sont pas redistribués dans le dépôt. Polices système Trebuchet MS/Arial, sans fichier de police redistribué.

## Images générées

`apps/web/public/textures/special-tiles-v1.webp` : atlas original Chance/Taxe généré avec l’outil d’images intégré de ChatGPT le 26 septembre 2026, puis encodé en WebP qualité 90. Aucun asset tiers incorporé dans cet atlas. Prompt exact dans `docs/IMAGE_PROMPTS.md`.

Créations originales avec le générateur d’images intégré de ChatGPT : apps/web/public/textures/ocean.webp (ancienne mer, conservée mais inutilisée depuis la reprise des artworks), chance.webp (carte), travelers-v3.webp (quatre personnages détaillés), architecture-v3.webp (maison, hôtel et quatre dioramas). Les illustrations en scène sont des sprites, pas des maillages 3D. Prompts et provenance dans docs/IMAGE_PROMPTS.md.

## Audio fourni par Julien

Les vingt taunts (`apps/web/public/taunts/*.webp`) sont des créations originales générées avec l’outil imagegen intégré à partir des visages de `travelers-v3.webp`, puis encodées en WebP transparent 320 × 320. Cinq expressions par personnage, aucune illustration extraite d’un autre jeu. Prompts exacts : [TAUNTS_ART.md](docs/TAUNTS_ART.md).

- apps/web/public/audio/menu.mp3 : « Property Party - main menu.mp3 ».
- apps/web/public/audio/game.mp3 : « Property Party - Party running song.mp3 ».
- apps/web/public/audio/game-2.mp3 : « Property Party - party running song 2.mp3 ».
- apps/web/public/audio/game-3.mp3 : « Property Party - party running song 3.mp3 ».

Les deux nouvelles pistes sont intégrales, encodées en MP3 stéréo 64 kb/s pour le téléchargement. La playlist alterne les trois morceaux en partie ; un seul fichier est chargé à la fois, sans préchargement de la playlist.

`models/wealth.glb` et `scripts/wealth_models.py` : liasses à huit couches, bande de papier, lingots biseautés et poinçons, créés dans Blender via MCP pour les réserves de chaque joueur. Créations originales, MIT.

Sources : dossier local Money tour assets/songs, fourni pour intégration au jeu. Ces enregistrements sont distincts de la licence MIT du code ; aucune licence CC0 ne leur est attribuée.

## Bruitages de bibliothèque

Auteur : Kenney. Pack [Interface Sounds](https://kenney.nl/assets/interface-sounds), licence [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), attribution non obligatoire. Fichiers redistribués : apps/web/public/audio/switch_001.ogg (dés), drop_001.ogg (pas), select_001.ogg (carte), confirmation_001.ogg (construction). Notice conservée dans audio/Kenney-LICENSE.txt. Les effets d’achat, loyer, victoire et faillite restent des synthèses originales Web Audio, MIT.

## Décor d’archipel

`textures/archipelago-bokeh.webp` et `textures/archipelago-mobile-bokeh.webp` : décors générés avec l’outil imagegen intégré à partir des concepts fournis pour les profils joueurs, puis encodés en WebP (1536 × 1024 et 1024 × 1536, 282 708 octets au total). [Prompts exacts et provenance](docs/ARCHIPELAGO_ART.md).

## Bibliothèques

React, Three.js, Vite, Vitest, Trystero et Zod : MIT. TypeScript et Sharp : Apache-2.0. Leurs notices restent dans les distributions des dépendances. Blender est l’outil de création des modèles, pas une dépendance exécutée dans le navigateur.

## Fortune, alliance et duel

models/fortune.glb et scripts/casino_models.py : roulette, machine à sous, bouclier/maison et balance Karma, quatre racines et 117 objets réalisés dans Blender 5.2.2 via MCP. Créations originales, MIT. Scène éditable livrée : money-tour-fortune.blend ; scènes préexistantes conservées.

textures/expansion-v1.webp : atlas original généré avec l’outil d’images intégré de ChatGPT, 1254 × 1254 natifs, WebP qualité 95. [Prompt exact et provenance](docs/FORTUNE_ART.md). Aucun asset tiers incorporé.

[@noble/hashes](https://github.com/paulmillr/noble-hashes), version 2.4.0, MIT, vérifie les engagements SHA-256 des choix de duel.

## Cases spéciales et Festival (v15)

`textures/travel-plane-v1.webp` : avion original en vue isométrique généré avec l’outil imagegen intégré le 24 octobre 2026. Source PNG RGBA 1536 × 1024, livraison WebP 1024 × 683, qualité 86 avec transparence conservée. [Prompt exact et provenance](docs/TRAVEL_ART.md).

Cinq illustrations originales générées avec l’outil imagegen intégré : `lost-island-v1.webp`, `festival-stage-v1.webp`, `chance-tile-v2.webp`, `tax-tile-v2.webp`, `insurance-tile-v2.webp`. Référence de style : notre atlas `architecture-v3.webp`. Aucun nouvel asset tiers. Dioramas natifs 1254 × 1254, textures natives 1024 × 1536 ; livraison WebP 768 × 768 et 768 × 1152. [Prompts exacts, provenance et intégration](docs/SPECIAL_TILES_ART.md).
