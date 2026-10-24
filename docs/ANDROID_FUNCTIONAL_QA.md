# Recette fonctionnelle Android

Recette du 24 octobre 2026. Le moteur, les règles, les modèles 3D et les ressources du dépôt d’origine sont conservés dans la copie Android. La même application React est embarquée localement dans l’APK Capacitor.

## Périmètre et niveaux de preuve

La recette distingue les tests du moteur et du protocole, les interactions tactiles dans Chromium à taille de téléphone, puis les vérifications propres à l’APK. Une fenêtre de navigateur redimensionnée ne représente ni un téléphone physique ni les services Android. La recette visuelle détaillée est dans [ANDROID_VISUAL_QA.md](ANDROID_VISUAL_QA.md) ; les essais de vrais canaux WebRTC sont dans [ANDROID_NETWORK_QA.md](ANDROID_NETWORK_QA.md).

Le contrôle initial a passé **933 tests dans 92 fichiers**, avec une couverture du moteur de **97,34 % des lignes, 93,60 % des branches, 96,50 % des instructions et 99,36 % des fonctions**. Ces tests incluent les parties simulées, les règles historiques, les tirages et les échanges réseau en mémoire. Les tests de l’intégration native ajoutés pendant la conversion sont vérifiés séparément par le contrôle final du dépôt.

## Résultat de la recette navigateur

**52 cas uniques acceptés : 26 scénarios sur deux formats, zéro exception JavaScript et aucun cas restant à valider.** Le reçu consolidé est `artifacts/android-qa/functional-summary.json`, dans les preuves jointes à la préversion. Il associe chaque scénario à son rapport et à ses captures.

La série principale de 50 cas a produit 46 réussites immédiates et quatre échecs en portrait : achat, construction, rachat et sélection du Festival. Ces quatre cas ont ensuite été rejoués avec succès ; deux scénarios supplémentaires ont contrôlé le journal public en portrait et en paysage. Les rapports d’échec initiaux restent disponibles : le reçu est une consolidation après correction, et ne présente pas la première série comme entièrement réussie.

Le contrôle a révélé que le chargement initial du plateau pouvait consommer le délai de décision local. Le chrono et les bots attendent maintenant le plateau prêt ; des tests de chargement retardé de plus de 60 secondes et un nouveau parcours d’achat ont vérifié ce correctif. Pour les interactions chronométrées, le script vérifie le prix affiché avant confirmation et prend sa capture après l’action, afin que le coût de la capture logicielle ne remplace pas le temps du joueur. La sélection tactile attend aussi la stabilisation des projections du plateau.

| Lot de preuve                         | Résultat retenu                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `functional/results.json`             | 50 cas : 46 réussis au premier passage, quatre rejoués ensuite                 |
| `cold-load-regression/results.json`   | Achat et construction après correctif de chargement ; journal portrait : 3/3   |
| `decision-regression/results.json`    | Festival portrait réussi ; premier nouvel essai du rachat conservé comme échec |
| `buyout-regression/results.json`      | Rachat portrait avec devis vérifié et transfert exact : 1/1                    |
| `landscape-regression/results.json`   | Rachat et journal paysage : 2/2                                                |
| `board-touch-regression/results.json` | Festival paysage, vrai toucher sur la case ciblée : 1/1                        |

## Reproduire les contrôles

Prérequis : Node.js 22.12+, Corepack/pnpm de la version épinglée dans `package.json`, Java 21 et les outils Android documentés dans le [guide Android](ANDROID.md).

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
node scripts/qa-android-functional.mjs
```

Le script utilise Chromium installé à `/usr/bin/chromium` s’il existe, sinon le navigateur Playwright. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permet de sélectionner un autre exécutable. Installation du navigateur Playwright si nécessaire :

```sh
corepack pnpm exec playwright install chromium
```

La recette démarre son propre serveur local, utilise le véritable rendu WebGL logiciel et envoie des entrées tactiles. Les scénarios de décision chargent des sauvegardes conformes aux règles de production via le bouton habituel « Reprendre ma partie ». Aucun point d’entrée de débogage ne déclenche les actions : achats, offres, ventes, duels et destinations passent par l’interface normale. Les tests vérifient ensuite la sauvegarde produite par le jeu.

Tous les services externes sont bloqués dans cette recette locale. Le serveur local reste accessible pour servir les ressources qu’un APK embarque. Ce contrôle vérifie l’absence de dépendance distante pour jouer en local ; le mode avion réel de l’APK relève du contrôle Android.

Options utiles :

```sh
ANDROID_QA_CASES=purchase,duel,debt node scripts/qa-android-functional.mjs
ANDROID_QA_SCREENS=393x851,851x393 node scripts/qa-android-functional.mjs
ANDROID_QA_URL=http://127.0.0.1:4173 node scripts/qa-android-functional.mjs
```

Les captures et les résultats JSON sont enregistrés dans `artifacts/android-qa/functional/`. Un échec de scénario ou une exception de l’application fait échouer la commande. Les essais initiaux utilisés pour régler les sélecteurs du script ne constituent pas la recette finale.

## Inventaire des fonctions

| Fonction                              | Vérification automatisée                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Accueil, Entre amis, Solo & bots, 2v2 | Ordre et sélection des modes, nombre de sièges, équipes ; création réelle de chaque mode local                              |
| Noms et durée                         | Modification du nom, durée personnalisée, valeurs invalides bloquées, durée et joueurs conservés à la revanche              |
| Sauvegarde locale                     | Retour à l’accueil, actualisation, reprise et conservation des joueurs et du mode                                           |
| Réglages                              | Texte agrandi, zoom, persistance après redémarrage ; son et préférences couverts aussi par les tests unitaires              |
| Tutoriel                              | 27 leçons accessibles, vrai lancer de dés, sortie, aucune création/modification de sauvegarde                               |
| Déplacement et dés                    | Interaction dans le tutoriel ; moteur : doubles, triple double, Départ, destinations et limites                             |
| Achat                                 | Terrain et deux maisons en une transaction, montant exact ; hôtel verrouillé avant deux tours                               |
| Solde insuffisant                     | Achat bloqué avec explication ; passer termine la décision sans débit                                                       |
| Construction                          | Passage de trois maisons à l’hôtel après déblocage, paiement des seuls nouveaux bâtiments, une opération par visite         |
| Rachat                                | Choix des bâtiments, transfert exact au vendeur et coût séparé du nouveau chantier                                          |
| Fraude fiscale                        | Achat à prix réduit, carte consommée une fois, dette fiscale conservée                                                      |
| Festival                              | Destination par vrai toucher sur une case légale, frais exacts ; moteur : durée, renouvellement, alliés                     |
| Voyage                                | Choix tactile d’une ville libre sur le plateau, déplacement et prélèvement exacts                                           |
| Assurance                             | Pose sur un bien légal ; moteur : usage unique contre rachat, attaque et séisme                                             |
| Roulette et machine à sous            | Action tactile, résultat enregistré, sortie de la phase casino ; moteur : gains et probabilités                             |
| Île perdue                            | Sortie payante tactile ; moteur : double, carte de sortie et maximum de tentatives                                          |
| Alliance                              | Choix d’adversaire enregistré ; moteur : partage et expiration                                                              |
| Attaque                               | Cible légale et résolution ; moteur : expropriation, cafards et équipes                                                     |
| Loyer et Squatteur                    | Carte conservée utilisée pour éviter un loyer ; moteur : calculs, transferts et bonus                                       |
| Dette                                 | Réduire et rouvrir la vente, ventes réelles successives, solde final exact et dette soldée                                  |
| Duel                                  | Offre, acceptation, deux choix secrets, révélation automatique, transfert exact du pot                                      |
| Appel d’offres                        | Montant secret saisi, engagement, refus de l’autre joueur, dépouillement automatique, adjudication et débit exacts          |
| Profils et objectifs                  | Profil, règle spéciale, afficher/masquer un objectif, consultation d’un bien sans mutation de propriété                     |
| Pause                                 | Chrono réellement figé puis repris                                                                                          |
| Journal public                        | Déplier/replier le résumé, trois actions récentes, ouvrir les 80 entrées, défilement interne et fermeture                   |
| Victoire et revanche                  | Bilan lisible, nouveau jeu sans victoire résiduelle, mêmes joueurs et même durée                                            |
| Invitation invalide                   | Message explicite, aucune fausse entrée en salon                                                                            |
| 23 cartes Chance et événements        | Tests du moteur : paquet sans remise, effets, assurances, séisme, crise et rétrocompatibilité                               |
| Bots, faillite et victoires           | Tests et simulations du moteur, choix légaux, bilan financier, collections, monopole, équipes et chrono                     |
| Réseau                                | Tests du protocole : sérialisation, intentions signées, tirages partagés, offres secrètes, reconnexion, reprise et revanche |

Les captures de la recette sont prises en portrait 360 × 640 et en paysage 851 × 393. Les fenêtres sont contrôlées pour leur titre accessible, leurs limites et l’absence de débordement horizontal. La recette visuelle ajoute d’autres tailles, les gestes du plateau, les zones tactiles et les menus.

## Parcours à refaire sur le téléphone de test

1. Installer l’APK proposé dans la release du dépôt Android, puis ouvrir Money Tour. Le premier lancement doit ouvrir le menu sans réseau et sans permission superflue.
2. Couper Wi-Fi et données mobiles. Créer une partie Solo & bots, lancer les dés, acheter une ville avec des maisons, ouvrir les réglages et le profil. Les modèles et les sons doivent être disponibles sans téléchargement.
3. Tourner le téléphone en paysage puis revenir en portrait. Pincer le plateau, glisser la vue, toucher une case et utiliser le recentrage. Les commandes et la fenêtre d’achat doivent rester accessibles hors des barres système.
4. Appuyer sur Retour dans un menu, une fiche de propriété et une décision. Une décision ne doit jamais être validée accidentellement ; la partie doit pouvoir continuer après fermeture et réouverture.
5. Envoyer l’application en arrière-plan pendant une minute. Vérifier l’arrêt du son et la reprise explicite de la partie locale. Forcer l’arrêt, rouvrir et reprendre la sauvegarde.
6. Créer une partie à deux humains, puis à quatre en 2v2. Vérifier les noms, l’ordre des joueurs, l’absence de loyer entre coéquipiers et la conservation des équipes à la revanche.
7. Réactiver Internet. Créer un salon, copier et partager son invitation, rejoindre depuis un autre appareil. Jouer un tour, suspendre brièvement une connexion puis reprendre le siège. Refaire ce parcours sur deux réseaux distincts, dont une connexion 4G/5G.
8. Tester le volume, le silence persistant, le clavier numérique, la taille de police système, le partage et le retour système sur le modèle de téléphone utilisé.

## Limites restantes

Le jeu en ligne utilise les relais de signalisation et WebRTC du jeu d’origine. Un serveur TURN n’est pas inclus et aucun identifiant TURN durable n’est ajouté au dépôt. Certains réseaux mobiles ou d’entreprise exigent un TURN fonctionnel. Les tests en mémoire ne prouvent pas la connectivité entre plusieurs réseaux physiques.

La température, la batterie, la mémoire, les performances GPU, les lecteurs d’écran Android et les variantes constructeur demandent une vérification sur appareil physique. Le statut des essais natifs réellement exécutés et de l’APK livré est consigné dans le guide de livraison Android ; il ne doit pas être déduit des seuls tests Chromium ci-dessus.
