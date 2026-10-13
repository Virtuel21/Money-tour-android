# Reprise de partie et gestes mobiles — 13 octobre 2026

## Comportement

- Le code du salon, la clé de signature, le nom et l’historique vérifiable restent dans le stockage local pendant 24 h. La reprise depuis l’accueil ou le lien du salon conserve le même siège. Les enchères et choix de duel engagés restent récupérables sur le même appareil.
- Une absence détectée réserve le siège pendant 90 secondes. Pendant cette attente, les ticks et le délai de décision sont suspendus. L’élection d’un autre hôte conserve son délai de 15 secondes. Un bot déjà installé rend le siège au joueur authentifié après synchronisation de son historique.
- Retour arrière et bouton d’accueil : confirmation avec « Continuer la partie » et « Accueil et sauvegarde ». Fermeture/rechargement : protection native `beforeunload`, selon la prise en charge du navigateur.
- Deux doigts sur le plateau : zoom personnel de 70 à 160 %, conservé dans les réglages. Sur une vue agrandie, un doigt déplace le plateau ; un tap reste une sélection. « Recentrer mon pion », un nouveau tour ou une vue de sélection rétablit le cadrage automatique. La vue complète non agrandie laisse défiler la page ; un geste de déplacement ou de pincement ne sélectionne pas une ville à son relâchement.
- Fanions de festival à leur taille et position d’origine, rendus dans une couche transparente au-dessus des noms et loyers. Cette couche suit la même caméra et le même zoom que le plateau, sans intercepter les gestes ni les clics.

## Vérifications

- `pnpm check` : 68 fichiers et 708 tests réussis, types/lint/build et contrôle des assets réussis. Couverture moteur : 97,2 % des lignes, 93,19 % des branches.
- `pnpm format:check` réussi.
- Tests de réseau en mémoire : interruption brève, grâce à 90 secondes, chrono suspendu, tirage interrompu puis nouvelle tentative, migration, reprise authentifiée et retour automatique du contrôle humain après passage en bot.
- Stockage : fermeture simulée en effaçant `sessionStorage`, même clé et même historique vérifié au retour, expiration à 24 h, cache malformé, conservation des choix secrets.
- Chrome avec gestes tactiles CDP : pincement de 100 à 150 %, aucune sélection accidentelle ; retour arrière annulé puis confirmé.
- Déplacement mobile : projection écran vérifiée à plusieurs zooms, limites du plateau, distinction tap/glissement, transition pincement/glissement et annulation testées. Gestes Chrome en 390 × 844, 844 × 390 et 320 × 740 : déplacement de 40 px reproduit à moins de 1 px, vue conservée après relâchement, recentrage et tap sur une ville fonctionnels, aucune erreur JavaScript.
- Chrome 1 440 × 900, 390 × 844, 844 × 390 et 320 × 740 : captures inspectées, aucune largeur de document supérieure à celle de l’écran.
- Correction des fanions : taille et position d’origine rétablies ; contrôle des pixels de fanion dans les zones des noms et des loyers, couche au-dessus des textes et sans capture des clics. Captures aux zooms 70 et 160 %, redimensionnement et retrait de la couche à la sortie de partie vérifiés dans Chrome.
- Deux sessions Chrome distinctes, connexion WebRTC réelle : création du salon, démarrage, fermeture de l’onglet invité, retour depuis l’accueil et reprise du même siège avec état synchronisé. Le retour arrière annulé conserve le lien du salon.
- Fermeture de l’onglet hôte : relève réelle par le joueur invité, puis retour de l’ancien hôte dans la même époque et sous le nouvel hôte, sans création d’un salon concurrent.

Les tests Chrome sur ordinateur ne valident pas Safari/iOS, un téléphone physique ou plusieurs réseaux 4G/5G.
