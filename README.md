# Money Tour

Un jeu de plateau original dans un archipel ensoleillé : acheter des villes, construire, réunir des collections et faire fortune. Objectif : 2 à 4 joueurs, solo contre bots, hot-seat et salons WebRTC, avec mode 2v2.

**[Jouer à Money Tour](https://virtuel21.github.io/money-tour/)** — version bêta, solo/bots, hot-seat et salons WebRTC, équipes 2v2. La recette sur quatre réseaux différents reste ouverte.

Prérequis : Node.js 22.12 ou supérieur et pnpm 10.32.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm simulate 1000
```

Les nouvelles parties utilisent des montants simples : compte initial 1 500, prime Départ 300, terrains de 100 à 475. Le journal affiche les actions publiques ; les bonus et malus sont consultables à côté des propriétés sur PC, dans le carnet sur mobile.

Le premier joueur est tiré au sort à chaque nouvelle partie et revanche, en local comme en ligne. Chaque siège, humain ou bot, a la même chance de commencer. En ligne, le tirage partagé est vérifiable par tous les participants. L’ordre des sièges et les équipes sont conservés ; un tour de table commence avec le joueur tiré au sort.

Sur mobile, le pincement permet de zoomer jusqu’à 400 %. Le réglage est mémorisé sur l’appareil et reste accessible dans les réglages. Glissez avec un doigt pour parcourir la vue agrandie, puis utilisez « Recentrer mon pion » pour retrouver le suivi automatique.

Chaque ville possédée peut recevoir jusqu’à trois maisons sans réunir la rue complète. L’hôtel se débloque après deux tours complets du plateau du propriétaire. La durée se choisit parmi les préréglages ou de 1 à 180 minutes personnalisées. Les destinations et championnats se choisissent directement sur les cases dorées du plateau.

Un Mondial coûte 50 et double le loyer de la ville pendant quatre retours du propriétaire : les doubles ne consomment pas de durée et un nouveau Mondial renouvelle les quatre tours sans cumuler le bonus. Un trophée, un ruban et des confettis signalent la ville hôte ; le badge indique les tours restants. Fermer l’offre d’achat ne termine pas le tour : cliquez de nouveau sur votre case ou sur Acheter pour la rouvrir. « Non merci, je passe » termine la décision. Les taxes sont annoncées par une fenêtre humoristique avant l’animation du prélèvement.

La crise économique est active : 4 % de chances à partir du sixième tour de table, avec huit tours de table entre deux déclenchements et deux crises au maximum par partie, loyers divisés par deux jusqu’à ce que chacun ait terminé un tour. Les autres [événements proposés](docs/EVENT_IDEAS.md) restent des pistes.

Après achat, le loyer actuel s’affiche en gros et en gras directement sur la case. Il est recalculé avec les constructions, festivals, Mondial et le nombre d’îles détenues.

Dans l’offre d’achat, chaque carte affiche le loyer du niveau correspondant. Sélectionner des maisons ou un hôtel puis acheter paie le terrain et tous les bâtiments en une seule opération, au prix total affiché. L’hôtel nécessite deux tours complets du plateau et un compte insuffisant bloque tout l’achat. Après validation, aucun nouveau chantier n’est possible pendant cette visite. Revenir sur sa ville rouvre la même fenêtre et ne facture que les bâtiments manquants. Les anciennes sauvegardes conservent leurs règles.

Le moteur couvre les 32 cases, les 23 cartes Chance, les constructions, la dette/faillite, les victoires et les équipes. Les règles sont dans `packages/engine/src/game.config.json`. L'API pure exporte `createGame`, `reduceGame`, `createRng`, `chooseBotAction`, `getLegalActions` et les fonctions de calcul/validation. `pnpm build` produit le site statique dans `apps/web/dist`. Les parties locales se sauvegardent sur cet appareil. Le bouton « Explorer les cases » permet de consulter les villes sur petit écran, et les animations peuvent être réduites dans les réglages.

- [Plan et critères de livraison](PLAN.md)
- [Règles, hypothèses et limites du protocole](DECISIONS.md)
- [Direction artistique et inventaire prévu](ART_DIRECTION.md)
- [Crédits](CREDITS.md)

Architecture : monorepo pnpm, moteur TypeScript pur, React/Vite, scène Three.js avec modèles Blender/glTF et Trystero pour WebRTC. Le site est statique, sans serveur de jeu à maintenir. Les réseaux restrictifs peuvent nécessiter un TURN facultatif ; les relais publics de signalisation restent des dépendances externes.

Le commit-reveal rend les tirages acceptés vérifiables mais n'empêche pas un participant de refuser sa révélation. La recette sur quatre réseaux distincts dont un smartphone en 4G restera explicitement séparée des tests locaux et simulés.

Code sous [licence MIT](LICENSE). Modèles originaux créés dans Blender, textures générées avec ChatGPT, musiques fournies par Julien et bruitages Kenney CC0 ; détails dans CREDITS.md. Aucun asset du jeu de référence. Les réglages séparent musique, effets et volume ; le silence est conservé après actualisation. Passer le navigateur ou l’onglet en arrière-plan coupe la musique et annule les effets programmés ; au retour, la musique reprend seulement si elle était activée.

## Déploiement et développement

Le workflow `Deploy Pages` vérifie format, types, lint, tests, couverture, build et poids des assets avant de publier `apps/web/dist` sur GitHub Pages à chaque push sur `main`. Dans les réglages Pages, la source doit être « GitHub Actions ». Aucun secret applicatif n’est nécessaire. Les salons utilisent un fragment `#room=…`, compatible avec le rechargement d’un site statique.

`pnpm assets:generate` régénère la carte de partage depuis sa composition SVG originale. Les assets statiques incluent les modèles glTF, les atlas WebP et les quatre musiques MP3 (limite automatisée : 20 Mo). Le rendu hybride utilise un plateau, des dés et des pièces spéciales Blender, et des sprites détaillés pour les voyageurs, bâtiments et îles ; reproduction : `blender --background --factory-startup --python scripts/build_models.py`. Voir [les scènes Blender et leurs contrôles](docs/MODELS.md). `pnpm check` exécute les contrôles complets, y compris 1 000 parties simulées et la vérification des seize racines 3D exportées. Le réseau est chargé dans un module distinct pour alléger le démarrage du client local.

## Jouer en ligne

Un lien d'invitation ouvre directement le formulaire « Votre nom → Rejoindre le salon ». L'écran de connexion reste affiché jusqu'à l'arrivée de l'hôte, avec une nouvelle tentative et une aide réseau. Le menu **Comment jouer** propose une partie guidée de 27 escales : commandes mises en lumière, vrais achats, constructions, enchères et duels simulés, navigation libre et aucune modification de la partie sauvegardée.

Les offres secrètes restent affichées pendant les synchronisations réseau. Les cartes tirées apparaissent sous forme de cartes animées ; après **J'ai lu · continuer**, elles s’envolent hors de l’écran. Le joueur qui tire une carte peut utiliser ce bouton également en ligne ; les autres écrans gardent leur lecture automatique. Le réglage de réduction des animations reste respecté. Le délai de décision en ligne commence après les animations partagées.

Sur l’accueil, les modes sont présentés dans l’ordre **Entre amis**, **2v2**, **Solo & bots**, avec **Entre amis** sélectionné au départ. Dans Entre amis et 2v2, « Créer un salon en ligne » est le bouton principal jaune ; le jeu sur cet appareil reste disponible juste dessous. Dans Solo & bots, le jeu local est le bouton principal. L’hôte choisit la durée, les sièges et le mode 2v2 ; les places libres deviennent des bots.

Une fois le salon créé, utilisez « Copier le lien d’invitation » et envoyez ce lien à vos amis. « Rejoindre un salon » permet de coller le lien complet ; ouvrir directement ce lien prépare aussi l’invitation. Le salon renouvelle sa présence pour permettre une arrivée tardive tant que la fenêtre de l’hôte reste ouverte. Après une coupure, le siège reste réservé pendant 90 secondes et le chrono des décisions attend la reconnexion. Un tirage interrompu réserve aussi ce délai au lieu de passer immédiatement le joueur en bot. Le délai habituel de 30 secondes pour une décision avec une connexion active reste applicable. Après fermeture accidentelle, rouvrez le jeu et cliquez sur « Reprendre ma partie en ligne », ou rouvrez le lien du salon : l’historique est vérifié et le contrôle humain est rétabli après synchronisation. « Reprendre mon siège » reste disponible pour une reprise manuelle.

Le lien contient un secret aléatoire de 128 bits dans son fragment, non envoyé au serveur statique. Trystero 0.26.0 utilise Nostr pour la signalisation, WebRTC pour le jeu et un mot de passe dérivé pour le salon. Les données du jeu sont échangées entre pairs. La clé, l’identifiant du salon, l’historique signé et les choix secrets en cours sont conservés dans le stockage local du navigateur pendant 24 h ; le cache d’onglet des anciennes versions reste lisible. L’effacement du stockage ou un autre navigateur ne permet pas de reprendre automatiquement le même siège. Ne jouez pas simultanément le même siège dans plusieurs onglets. Le retour arrière et le bouton d’accueil en jeu ouvrent une confirmation ; fermer ou recharger l’onglet utilise aussi la protection native du navigateur lorsqu’il l’autorise. Sur mobile, pincez le plateau à deux doigts pour modifier son zoom, puis glissez avec un doigt pour explorer la vue agrandie. « Recentrer mon pion » rétablit le cadrage automatique. La page défile en dehors du plateau, ou sur la vue complète non agrandie.

## Limites réseau et de confiance

Pour les réseaux mobiles restrictifs, le déploiement peut fournir automatiquement des identifiants TURN temporaires via `VITE_TURN_CREDENTIALS_URL`. Voir le [diagnostic 4G/5G et la configuration du relais](docs/NETWORK_MOBILE.md). Aucun serveur TURN n'est inclus ; la recette sur réseaux physiques distincts reste nécessaire.

- Sans TURN, certains NAT, réseaux d’entreprise et connexions 4G bloquent WebRTC. Le salon affiche un diagnostic et propose des paramètres TURN facultatifs. Fournissez vos propres paramètres ; ne publiez jamais des identifiants TURN durables dans le dépôt ou le site.
- Gardez les onglets au premier plan sur mobile. Les relais Nostr publics et STUN peuvent être indisponibles. Aucun service public gratuit n’offre une garantie de disponibilité.
- Après 15 secondes sans hôte, le pair suivant dans l’ordre d’arrivée reprend le dernier historique validé. Une partition contradictoire suspend la partie ; aucun consensus distribué ou quorum n’est revendiqué.
- Les intentions humaines sont signées. Chaque action aléatoire est figée avant le commit-reveal ; les pairs signent aussi la preuve complète. Les reprises rejouent l’historique et vérifient signatures, preuves, règles et hashes. Les horloges, exclusions pour absence et bascules en bot restent une politique de l’hôte : ce jeu entre amis n’est pas un système de compétition résistant à tout hôte malveillant.
- Une révélation manquante annule le tirage et exclut temporairement le contributeur. Cela n’élimine pas l’abandon sélectif ni le déni de service. Avec un seul contributeur, l’interface indique explicitement « aléa local : hôte seul ».
- Tests en mémoire et test WebRTC réel entre deux origines sur un ordinateur réalisés. **Quatre réseaux distincts, dont un smartphone physique en 4G : non vérifié.** Voir [journal de validation](docs/VALIDATION.md).

## Historique — édition Îles

Sept rues de deux villes, quatre îles achetables, quatre cases cartes, deux taxes et quatre coins spéciaux. Les quatre îles réunies donnent un loyer de 500 k au lieu d’une victoire immédiate. Trois rues complètes, la faillite des adversaires ou le meilleur patrimoine au chrono permettent de gagner. Le loyer est prélevé automatiquement et le transfert est visible avec des pièces d’or. Les cartes d’attaque prennent un montant plafonné aux réserves des adversaires ; les coéquipiers sont épargnés.

Vue en trois-quarts, noms seuls sur les cases, comptes à gauche et fiche de propriété/commandes à droite. Les personnages et constructions occupées peuvent devenir translucides. Avion, coupe et palmier détaillés dans Blender. Le joueur actif est annoncé et les cartes adverses restent en lecture seule. La pause reste solo/local ; revenir à l’accueil arrête les animations et sons en attente. Le réseau v4 sépare les versions et le stockage local v4 préserve l’ancienne sauvegarde de 32 cases dans son emplacement d’origine. Voir [direction artistique](ART_DIRECTION.md) et [contrôle visuel](docs/VISUAL_QA.md).

## Plateau carré, événements et réserves

Chaque nouvelle partie mélange huit rues complètes (six paires et deux triplets, uniquement entre rues de même taille), avec des prix croissants attachés aux emplacements : de 100 à 475 dans le sens horaire depuis Départ. Le carré comporte 32 cases, 9 par bord coins inclus. Deux côtés possèdent cinq villes, une île et une case spéciale ; les deux autres possèdent quatre villes, une île et deux cases spéciales en plus du coin. Casino, Chance et Duel ne se touchent pas. La Taxe reste juste avant Départ. La disposition fait partie de l’état partagé : tous les joueurs voient le même plateau. Les sauvegardes des éditions précédentes conservent leur plateau de 26 ou 28 cases.

Les tuiles rectangulaires séparent constructions et loyers. Les bâtiments prennent la couleur du propriétaire ; les plages ont une bordure d’eau. Les liasses et lingots autour du plateau suivent le compte de chaque joueur. Le temps restant figure sur les boutons de décision et dans les fenêtres ; pause et animations suspendent le décompte. Trois musiques alternent pendant la partie.

Un casino (roulette ou machine à sous aléatoire), gains d’au moins 50 et jackpot progressif à 10 % du solde, assurance, Duel, Squatteur, Expropriation, Cafards et Fraude fiscale complètent le jeu. Alliance partage les gains jusqu’à la fin du prochain tour du joueur ciblé ; Duel affiche les soldes, propose des mises égales acceptées et des choix secrets ; une égalité relance la manche sans nouveau débit. Posséder toutes les villes et l’île d’un côté donne une victoire Monopole. [Règles détaillées et durées](docs/FORTUNE_RULES.md). [Inventaire complet des 23 cartes, mécaniques et probabilités](docs/MECANIQUES_ET_PROBABILITES.md).

Les dés 3D roulent dans un écrin séparé du décor. Les icônes conservent des proportions carrées sur les tuiles rectangulaires. Les nouvelles pièces sont dans models/fortune.glb, source scripts/casino_models.py. [Provenance et prompt de l’atlas](docs/FORTUNE_ART.md).

## Édition 8 — des parties différentes

Une règle tirée au sort par partie (villes jumelles, festivals, héritage, marché flottant ou capitale cachée), un objectif personnel à 100 k et un appel d’offres à enveloppes scellées. Le HUD affiche la règle, les propriétés miniatures et les bonus. Le Mondial éclaire les villes éligibles et offre un sélecteur latéral ; les annonces durent cinq secondes de plus.

[Règles détaillées et limites de confidentialité](docs/ADVENTURE_RULES.md). Les sauvegardes des anciennes éditions conservent leurs règles ; commencer une nouvelle partie pour activer ces mécaniques. Les offres et objectifs sont masqués dans l’interface ; l’état et les révélations vérifiables restent inspectables dans le protocole pair-à-pair. Les soldes publics permettent de déduire l’offre gagnante.

### Correction des collections et des enchères (v16)

Les quatre îles comptent ensemble comme une rue complète pour le triple monopole : deux rues de villes + les quatre îles suffisent. Les avertissements de victoire et le mode équipes suivent cette règle. Les anciennes sauvegardes restent lisibles et bénéficient de la correction.

La ville mise aux enchères est surlignée avant l'ouverture de la fenêtre et le reste jusqu'au résultat. On peut fermer puis rouvrir les offres ; une seule validation suffit, le dépouillement est automatique. Les propriétés assurées reçoivent un contour en pointillé à la couleur du propriétaire, sans bouclier. Voir la recette dans `docs/MOBILE_QA.md`.
