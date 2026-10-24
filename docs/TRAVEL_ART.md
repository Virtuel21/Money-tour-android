# Illustration de la case Voyage

## Avion en vue isométrique

Création originale du 24 octobre 2026 avec l’outil imagegen intégré. À la demande du joueur, un avion seul remplace l’aéroport, dont le panneau vertical déformait l’illustration en perspective. Aucun nouvel asset tiers.

- Fichier du jeu : `apps/web/public/textures/travel-plane-v1.webp`.
- Source PNG RGBA : 1536 × 1024. Export WebP : 1024 × 683, qualité 86, alpha 100, 89 464 octets. L’ancien atlas d’aéroport a été retiré du jeu.
- Le sprite conserve les proportions exactes de l’image et mesure 3 unités de large. Il fait toujours face à la caméra : la vue isométrique est peinte dans l’image, sans rotation supplémentaire autour d’un axe du monde.
- L’avion occupe la partie arrière de la case, avec le même retrait que la scène de concert. Le titre Voyage et la voie de passage des pions restent devant l’illustration. Le sol doré d’origine est conservé.
- Les pixels hors silhouette ont un alpha nul ; les couleurs RGB présentes sous cette transparence ne constituent pas un fond visible.

## Recette visuelle

`node scripts/qa-travel-plane.mjs` contrôle le nouvel asset chargé et capture le plateau ainsi qu’un gros plan de la case Voyage : case vide, un pion, quatre pions regroupés, suivi mobile et zoom 200 %. Chrome et WebKit couvrent les formats bureau, petit téléphone, portrait et paysage. Les captures doivent être inspectées : avion entier, proportions intactes, aucune déformation en panneau, titre Voyage lisible et pions devant l’illustration. Les assertions techniques sur le canvas et les libellés ne suffisent pas à elles seules à valider le dessin.

`PLANE_QA_URL` permet de refaire la même recette sur la version publique et `PLANE_QA_OUT` choisit le dossier des captures. Les formats mobiles et les gestes sont simulés sur ordinateur.

## Prompt exact

Use case: stylized-concept. Asset type: production transparent isometric airplane sprite for Money Tour, a colorful premium browser board game. Generate ONE beautiful intact compact passenger airplane ONLY, isolated on genuine transparent alpha. A charming toy-like commercial jet with rounded bevelled volumes and polished hand-painted 3D miniature materials: ivory fuselage, lagoon-teal lower body and engines, coral-orange vertical tail and restrained warm-gold trim, large dark turquoise cockpit and clean readable cabin windows. Two symmetrical swept main wings, exactly two under-wing engines, one vertical tail fin and a small balanced horizontal tail. Small landing wheels tucked close to the body. Whole aircraft clearly visible from an orthographic three-quarter isometric camera above, about 35-40 degrees elevation; nose points diagonally toward the lower left and tail toward the upper right, with both main wings and the top of the fuselage visible. Warm upper-left light, subtle ambient occlusion ON the aircraft, clean crisp silhouette readable at very small game-tile size. Render the perspective correctly in the image itself, with no added rotation of the image frame. Center the entire airplane in a landscape 3:2 frame with 10 percent transparent margin on every side; no clipped wings, nose or tail. No airport, terminal, control tower, runway, pedestal, plinth, ground plane, scenery, people, motion trails, surrounding shadows, lettering, logos, branding, watermark, frame or background. One aircraft, no extra pieces. Final production game asset, not a concept sheet, mockup or screenshot.
