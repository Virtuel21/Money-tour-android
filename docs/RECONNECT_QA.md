# Reprise de partie et gestes mobiles — 13 octobre 2026

## Comportement

- Le code du salon, la clé de signature, le nom et l’historique vérifiable restent dans le stockage local pendant 24 h. La reprise depuis l’accueil ou le lien du salon conserve le même siège. Les enchères et choix de duel engagés restent récupérables sur le même appareil.
- Une absence détectée réserve le siège pendant 90 secondes. Pendant cette attente, les ticks et le délai de décision sont suspendus. L’élection d’un autre hôte conserve son délai de 15 secondes. Un bot déjà installé rend le siège au joueur authentifié après synchronisation de son historique.
- Retour arrière et bouton d’accueil : confirmation avec « Continuer la partie » et « Accueil et sauvegarde ». Fermeture/rechargement : protection native `beforeunload`, selon la prise en charge du navigateur.
- Deux doigts sur le plateau : zoom personnel de 70 à 160 %, conservé dans les réglages. Le défilement à un doigt reste possible ; la fin d’un pincement ne sélectionne pas une ville.
- Fanions de festival réduits et déplacés dans la zone des bâtiments. Fonds opaques sous les noms, conditions et loyers pour préserver leur lecture.

## Vérifications

- `pnpm check` : 67 fichiers et 702 tests réussis, types/lint/build et contrôle des assets réussis. Couverture moteur : 97,2 % des lignes, 93,19 % des branches.
- `pnpm format:check` réussi.
- Tests de réseau en mémoire : interruption brève, grâce à 90 secondes, chrono suspendu, tirage interrompu puis nouvelle tentative, migration, reprise authentifiée et retour automatique du contrôle humain après passage en bot.
- Stockage : fermeture simulée en effaçant `sessionStorage`, même clé et même historique vérifié au retour, expiration à 24 h, cache malformé, conservation des choix secrets.
- Chrome avec gestes tactiles CDP : pincement de 100 à 150 %, aucune sélection accidentelle ; retour arrière annulé puis confirmé.
- Chrome 1 440 × 900, 390 × 844, 844 × 390 et 320 × 740 : captures inspectées, aucune largeur de document supérieure à celle de l’écran.
- Deux sessions Chrome distinctes, connexion WebRTC réelle : création du salon, démarrage, fermeture de l’onglet invité, retour depuis l’accueil et reprise du même siège avec état synchronisé. Le retour arrière annulé conserve le lien du salon.
- Fermeture de l’onglet hôte : relève réelle par le joueur invité, puis retour de l’ancien hôte dans la même époque et sous le nouvel hôte, sans création d’un salon concurrent.

Les tests Chrome sur ordinateur ne valident pas Safari/iOS, un téléphone physique ou plusieurs réseaux 4G/5G.
