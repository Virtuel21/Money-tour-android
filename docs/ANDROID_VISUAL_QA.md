# Recette visuelle Android — 24 octobre 2026

La recette combine inspection des captures, mesures DOM, vrais gestes tactiles Chromium et audits automatisés Axe. Le plateau utilise le vrai moteur WebGL et les règles de production. Les sauvegardes de recette sont validées par le moteur ; aucun scénario de développement n’est nécessaire dans l’APK.

## Résultats exécutés

68 scénarios visuels validés sur les quatre formats : 60 cas de la matrice principale, quatre parcours de réactions depuis une fiche joueur et quatre démarrages d’aventure. Les 147 captures finales sont accompagnées des mesures. Huit audits Axe distincts ne signalent aucune violation ; aucune erreur JavaScript non interceptée n’est relevée.

La synthèse est dans `artifacts/android-qa/visual-summary.json`, les rapports détaillés dans `visual/results.json`, `profile-reaction/results.json` et `welcome/results.json`. La planche `android-ui-overview.png` présente l’accueil, le tutoriel, la fiche joueur et le suivi du plateau. Les preuves sont jointes à la préversion Android.

## Adaptations réalisées

- Accueil Android plus court : titre et texte resserrés, suppression du plateau 3D décoratif avant le lancement d’une partie. Le rendu 3D reste disponible dans le jeu et le tutoriel.
- Boutons d’accueil et réglages avec des cibles de 48 px. Le sélecteur de langue reste horizontal sur petit écran.
- Historique : commande de 44 px, indicateur d’ouverture explicite et accès au journal complet de 44 px. Le panneau conserve son défilement sur écran court.
- Tutoriel : boutons et champs de 48 px, instructions Android de 14 px, textes longs et actions accessibles par défilement.
- Réactions : une commande « Réagir » de 52 px est disponible dans le pied de la fiche d’un joueur. Elle ouvre le même sélecteur que le pion, avec le même destinataire et les mêmes règles. Elle évite de devoir viser un petit pion en vue globale. La commande disparaît lorsque les réactions sont indisponibles ou le joueur éliminé.

Les barres système et découpes sont traitées par le conteneur natif, avec `viewport-fit=contain`. Le client ne cumule pas une seconde marge de barres système. Voir [l’architecture Android](ANDROID.md).

## Périmètre reproductible

| Format CSS du contenu WebView | Orientation    |
| ----------------------------- | -------------- |
| 360 × 640                     | Portrait court |
| 393 × 851                     | Portrait       |
| 412 × 915                     | Portrait large |
| 851 × 393                     | Paysage        |

Le script parcourt l’accueil, les réglages, la saisie d’invitation avec erreur et espace réduit pour le clavier, le démarrage d’une aventure, les 27 leçons du tutoriel, les fiches et réactions, puis les décisions d’achat, dette, duel, roulette, machine à sous, voyage, Festival, assurance, île, alliance, loyer et attaque. Les 27 leçons sont capturées à 393 × 851 ; un échantillon des leçons est contrôlé dans chacun des autres formats.

Contrôles : absence de débordement horizontal du document et des dialogues, maintien des fenêtres dans le viewport, taille des commandes, accès aux actions, fermeture et retour au jeu. Le zoom est changé dans les réglages, puis de véritables événements tactiles CDP vérifient le déplacement, le recentrage et le pincement du plateau. Les audits Axe concernent l’accueil, les réglages, les invitations, les décisions complexes et la fiche joueur.

Le harnais suspend les intervalles d’une seconde pendant les captures de décisions et les gestes du plateau, pour isoler la composition d’écran du délai de décision de 30 secondes. Les images d’animation et l’horloge de rendu continuent normalement : le plateau reste en mode jeu, avec le suivi et le déplacement disponibles. Les délais, transitions et achats effectifs sont testés séparément par la [recette fonctionnelle](ANDROID_FUNCTIONAL_QA.md) ; ces captures ne constituent pas un test de chronomètre.

## Rejouer

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm qa:android:visual
```

Chromium doit être installé. `CHROMIUM_EXECUTABLE_PATH` change son chemin (défaut `/usr/bin/chromium`). `ANDROID_VISUAL_URL` permet de viser une version compilée servie localement. `ANDROID_VISUAL_OUT` choisit le répertoire des preuves ; `ANDROID_VISUAL_SCREENS` et `ANDROID_VISUAL_CASES` limitent les scénarios.

Les captures et `results.json` sont placés dans `artifacts/android-qa/visual`. `ANDROID_VISUAL_APPEND=1` permet de remplacer les résultats des seuls scénarios rejoués, une fois la première exécution terminée. Il ne faut pas lancer deux écritures concurrentes dans le même répertoire de rapport.

## Portée et limites

L’environnement est Chromium 154 sous Linux, avec rendu WebGL logiciel et viewport tactile émulé. Un pont Capacitor minimal sélectionne le vrai chemin d’interface Android et répond aux appels de cycle de vie sans effet natif. Cette matrice ne simule pas un téléphone physique, ses applications de partage, ses barres système ni son clavier constructeur. La réduction du viewport vérifie l’espace disponible lorsque le clavier est ouvert, pas le clavier lui-même.

Les audits Axe ne constituent pas une certification d’accessibilité ni une recette avec lecteur d’écran. Les petites cases du plateau restent consultables par le zoom et leurs fiches. La fluidité, le son, la consommation et les réseaux mobiles distincts nécessitent le téléphone de destination. Les résultats d’installation et de cycle de vie Android sont distincts de cette recette navigateur.
