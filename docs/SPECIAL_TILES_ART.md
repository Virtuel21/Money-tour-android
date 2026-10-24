# Cases spéciales et Festival — édition v15

Génération avec l’outil imagegen intégré, à partir de `architecture-v3.webp` comme référence de style uniquement. Les décors sont des illustrations détourées comme les villes centrales, pas de nouveaux maillages 3D. Le shader anime uniquement les membranes des quatre enceintes ; mouvement réduit et pause les immobilisent. Aucun son supplémentaire ne se superpose à la musique existante.

Les textures Chance, Taxe et Assurance sont opaques, au format portrait et appliquées à toute la surface de leur tuile avec la rotation adaptée à son côté. Les titres restent des textes du jeu, sur fond crème contrasté. Le palmier reste sur les îles privées ; seule l’Île perdue reçoit l’avion ensablé. La scène rock remplace également les trophées des villes accueillant un Festival temporaire.

Les montants, probabilités et durées sont inchangés : organiser un Festival coûte 50 et double le loyer pendant quatre retours du tour du propriétaire. Les noms de propriétés/actions internes `championship` restent compatibles ; v14 et antérieures sont reconnues par le chargeur de sauvegarde.

## Prompts exacts

### lost-island-v1

Fond transparent : oui.

> Use case: stylized-concept. Asset type: transparent game diorama sprite for Money Tour. Reference image is STYLE ONLY: match its premium colorful cartoon miniature buildings, softly bevelled toy-like volumes, carefully painted detailed materials, warm lighting, orthographic three-quarter camera looking slightly down. Create ONE isolated small sandy island mound, with ONLY the tail section of a crashed small passenger airplane sticking diagonally up out of golden sand. The nose, cockpit and main wings are completely buried and invisible. Recognizable tall coral-orange vertical tail fin, ivory fuselage rear and two short turquoise horizontal tail stabilizers emerging from sand. A few rivets, gentle scratches, sand piled against the fuselage, tiny pebbles. Playful stranded adventure, no people, no injuries, no flames, no smoke, NO palm tree. Compact readable silhouette that will fit a board corner. Entire object inside image with 8 percent clear margin. Square 1024x1024, true transparent alpha background, no environment, no text, no logo, no frame. Make a new standalone asset, not an atlas.

### festival-stage-v1

Fond transparent : oui.

> Use case: stylized-concept. Asset type: transparent game diorama sprite for Money Tour. Reference image is STYLE ONLY: match its high quality colorful cartoon city miniatures, bevelled toy-like forms, richly detailed painted materials, warm soft illumination and orthographic camera. Create ONE miniature outdoor ROCK CONCERT stage on a compact cream stone plinth, seen nearly front-on from a slightly elevated three-quarter camera, so front of speakers is clearly visible. Central low wooden stage with burgundy drum kit and two electric guitars on stands; short teal overhead lighting truss with golden lamps. Two chunky charcoal loudspeaker stacks symmetrically flanking stage at far left and far right, each with two LARGE ROUND clearly visible speaker cones facing camera, warm gold trim around cones and a coral accent. Turquoise and magenta stage accents, joyful polished game artwork, detailed yet highly readable at small size. Equipment only, no performers or crowd. No trophy, no palm trees, no text, no logos, no watermark. Entire composition within image with 8 percent clear margins; square 1024x1024 true transparent alpha background. One asset, not atlas. Keep speakers visually separated from center stage so their cones can be animated in game.

### festival-stage-v2

Révision du 24 octobre 2026, générée avec l'outil ImageGen à partir de `festival-stage-v1.webp` : même scène et mêmes instruments, vue strictement de face, traverse horizontale et marches centrées. Le fond transparent est conservé. L'original est archivé à côté de la révision ; le jeu charge désormais `festival-stage-v2.webp` (768 × 768, WebP qualité 92).

> Edit the existing festival concert stage game sprite only to face exactly straight toward the viewer. Preserve the teal and magenta canopy, four golden lights, two double speaker stacks, drums, two guitars, orange timber stage, bunting, cream stone base, shrubs, gold finials and front steps. Slightly elevated camera, no left/right yaw or tilt; horizontal front edge, centered stairs, symmetric speaker alignment. Preserve the stylized materials and lighting. Full object, no text, people, new scenery or background; actual transparent RGBA.

### chance-tile-v2

Fond transparent : non.

> Use case: stylized-concept. Asset type: production texture for the Chance tile of a cartoon board game. Reference image STYLE ONLY, matching its soft bevelled toy-like volumes, high quality hand-painted materials, bright turquoise/coral/cream palette and warm lighting. NEW PORTRAIT texture 1024x1536, full-bleed rectangular surface, viewed strictly straight-on with NO tile perspective, no isometric slab, no environment. Central oversized cream envelope with a turquoise wax seal, bursting open with a chunky warm-gold question mark, three small playful stars and a few confetti pieces. Charming colorful sculpted cartoon illustration, readable bold shapes with polished subtle detail; gentle lavender to violet painted background with quiet margins. Keep the whole central motif within the middle 60 percent of image height and 85 percent width; leave top 18 percent quiet for an HTML title overlay. Flat edge-to-edge background, no border, no text except the question-mark symbol, no logo, no watermark. This artwork will be mapped directly onto a tall rectangular board tile; avoid tiny ornament and dark photorealistic textures.

### tax-tile-v2

Fond transparent : non.

> Use case: stylized-concept. Asset type: production texture for the Tax tile of a cartoon board game. Reference image STYLE ONLY, matching its soft bevelled toy-like volumes, high quality hand-painted materials, bright turquoise/coral/cream palette and warm lighting. NEW PORTRAIT texture 1024x1536, full-bleed rectangular surface, viewed strictly straight-on with NO tile perspective, no isometric slab, no environment. Central chunky cream receipt with only simple embossed horizontal line marks, a friendly oversized teal rubber stamp with a coral grip, and three small warm-gold coins stacked at its base. Charming colorful sculpted cartoon illustration, crisp soft edges and polished detail, bold readable forms; apricot coral painted background with gentle warm gradient and quiet margins. Keep central motif within middle 60 percent of height and 85 percent width; leave top 18 percent quiet for an HTML title overlay. Flat edge-to-edge background, no border, no letters, no words, no currency sign, no logo, no watermark. This will be mapped directly onto a tall rectangular board tile; avoid photorealism or ornate decoration.

### insurance-tile-v2

Fond transparent : non.

> Use case: stylized-concept. Asset type: production texture for the Insurance tile of a cartoon board game. Reference image STYLE ONLY, match its cream cartoon houses with coral tiled roofs, teal shutters, soft bevelled toy-like shapes and premium detailed warm-lit materials. NEW PORTRAIT texture 1024x1536, full-bleed rectangular surface viewed strictly straight-on with NO tile perspective, no isometric slab or outside environment. Central large rounded turquoise shield with cream edge protects ONE tiny cheerful cream house with coral tiled roof, teal front door, window, and two little leaves. Small warm-gold checkmark near shield lower right. Polished colorful sculpted cartoon look, friendly protection, bold simple readable silhouette with fine surface detail. Pale aqua/teal painted background with gentle light gradient and quiet margins. Keep motif inside middle 60 percent of image height and 85 percent width; leave top 18 percent quiet for HTML title overlay. No border, no text, no logo, no watermark, no ornate heraldry, no photorealism. Intended as a texture directly mapped to a tall rectangular board tile.

## Livraison et optimisation

Les PNG natifs sont en 1254 × 1254 pour les deux dioramas transparents et 1024 × 1536 pour les trois textures opaques. Encodage Sharp en WebP qualité 90, alpha 100 : 768 × 768 et 768 × 1152 respectivement. Les cinq images totalisent 404 206 octets. Le budget public total reste inférieur à 20 Mo. Pas de découpage automatique ni d’upscale ; la transparence des dioramas est conservée.
