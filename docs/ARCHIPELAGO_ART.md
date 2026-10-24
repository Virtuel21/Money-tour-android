# Décor d’archipel et profils joueurs

Le décor `apps/web/public/textures/archipelago-bokeh.webp` a été généré le 24 octobre 2026 avec l’outil **imagegen intégré**, à partir des deux concepts fournis pour cette refonte. Ce fond ne contient ni plateau, ni interface, ni texte : les cartes joueurs et le plateau restent des éléments interactifs distincts.

- Image native : 1536 × 1024 pixels.
- Livraison navigateur : WebP, qualité 76, effort 6, **129 036 octets**.
- Variante portrait : `archipelago-mobile-bokeh.webp`, 1024 × 1536 pixels, **153 672 octets**. Un élément `picture` sélectionne cette version en portrait jusqu’à 999 px ; le navigateur ne télécharge que la version utile.
- Les portraits réutilisent `travelers-v3.webp`, avec un cadrage individuel du visage dans chaque médaillon. Aucune nouvelle planche de personnages n’est nécessaire.
- Les ombres du plateau sont conservées sur un sol transparent. Le bokeh est dans l’image : aucun flou animé supplémentaire n’est calculé pendant la partie.
- Les profils PC occupent des colonnes réservées ; les écrans plus étroits utilisent une rangée compacte, puis une fiche de détails native. Le paysage mobile réserve une colonne aux profils.

## Prompt exact du décor

```text
Use case: stylized-concept. Asset type: production full-screen background artwork for a browser board game, landscape 3:2 composition. The attached images are STYLE AND ENVIRONMENT COMPOSITION REFERENCES only. Generate a new background scene only, inspired very faithfully by the bright turquoise tropical archipelago environment surrounding the board in those references. Remove all game board, all player cards, all people, UI, coins, cash, typography and game objects. Beautiful polished rounded stylized 3D toy-world islands in a luminous turquoise sea, sandy rims, palm trees and tiny colorful Mediterranean buildings, lighthouse on a distant island, lush palms and soft beige rocks at the bottom left and bottom right edges. Wide expansive open turquoise sea in the entire middle 70% for the interactive board to overlay. Islands stay along left and right edges and far upper background, leave the bottom center open too. Pronounced photographic depth of field and soft circular light bokeh over the far blue sea and distant islands, dreamy hazy horizon, sunny cyan sky, softly blurred foreground vegetation at edges. Keep color saturation and art direction very close to references; rich inviting aquamarine, cream sand, rounded green foliage, sunny yellow highlights. Background itself has clearly pronounced bokeh, but the sea center is calm with subtle caustics. No board, no diamond platform, no readable text, no UI, no letters, no people, no grid, no watermark. The interactive board and UI will be rendered separately over this artwork.
```

Les images d’entrée servent uniquement de références de style et de composition : `interface-cartes-joueurs.png` et `interface-mobile-cartes-joueurs.png`. Le PNG natif et la recette avec les captures du jeu sont conservés dans les livrables locaux `outputs/recette-profils`.

## Prompt exact de la variante mobile

```text
Use case: stylized-concept. Asset type: vertical PORTRAIT 2:3 mobile game background, no interface. Input image1 is STYLE reference and continuity reference: its bright turquoise stylized 3D tropical archipelago sea setting. Input image2 is mobile COMPOSITION reference only, ignore all its UI, characters and game board. Generate a new portrait tropical archipelago backdrop very faithful to this environment. Deep turquoise and aquamarine ocean with a luminous cyan sky, softly rounded tropical islands with palms and tiny colorful Mediterranean buildings on BOTH left and right edges, a lighthouse on one distant edge island, and soft beige rocks and lush palms framing bottom corners. Mid-distance island clusters must remain visible beside the open middle of the sea even when a game board will be overlaid in center. Keep the entire middle 65 percent wide and middle vertical area as open calm turquoise water for a separately rendered interactive board. The very top 20 percent should be mostly soft sky/water, as UI will sit over it. Pronounced photographic depth of field and soft circular bokeh in the far sea and distant islands, hazy sunny horizon, blurred foreground vegetation only at extreme edges. Rich inviting aquamarine water and subtle caustics, cream sand, rounded green foliage and warm sunny highlights, polished 3D toy world aesthetic identical to reference1. No board, no square or diamond platform, no grid, no cash, no text, no typography, no UI, no people, no characters, no watermark.
```

La première entrée est le PNG natif du décor PC ; la seconde est le concept mobile fourni. Les deux PNG sources restent dans les livrables locaux pour permettre de futures variantes.
