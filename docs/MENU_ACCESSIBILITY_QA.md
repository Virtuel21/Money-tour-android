# Recette des menus Money Tour — 16 octobre 2026

Version locale sur `feat/mobile-menu-accessibility`. **Aucun push. Validation de Julien requise.**

## Résultat et changements

La direction artistique est conservée : palette crème, lagon et or, typographie du jeu, icônes et illustrations existantes. L'accueil nomme explicitement le jeu sur cet appareil et la création d'un salon en ligne.

| Audit initial                                                 | Correction livrée                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Petits contrôles dans 24 des 58 vues de référence             | Commandes des panneaux de 48 px ; navigation compacte au moins 44 px de large et 56/64 px de haut              |
| Dialogues sans nom programmatique                             | Titres associés, fond rendu inerte par le dialogue natif, parcours Tab/Shift+Tab et retour du focus            |
| Réglages longs et peu hiérarchisés                            | Cartes Plateau/lisibilité, Son, Animations ; bouton Terminé fixe ; préférences mémorisées                      |
| En-têtes et chronomètres concurrents en paysage               | En-tête et compte à rebours séparés, fermeture toujours accessible, corps défilant                             |
| Repérage des escales et retour au carnet laborieux            | Recherche sans accents, compte de résultats, pagination nommée, conservation du joueur, de la rue et du filtre |
| Tarifs des îles coupés sur mobile                             | Grille de loyers, nombres insécables, contrôle de chaque montant sur une seule ligne                           |
| Nouvelle partie remplaçant immédiatement la sauvegarde        | Reprendre, annuler ou remplacer explicitement la partie conservée                                              |
| Champs de mise en décalage avec les règles entières du moteur | Pas de 1, bornes liées au solde et message de validation associé au champ                                      |
| Zoom personnel 400 % empêchant une vraie vue globale          | Vue globale cadrant les 32 cases, zoom personnel conservé                                                      |

Les grilles se réorganisent avec l'agrandissement du texte. Une fiche d'inspection revient au carnet ou aux escales au même endroit. Les données des parties, règles et offres privées sont conservées. Les réactions s’ouvrent en cliquant sur le personnage du plateau ; le raccourci du carnet et les nouveaux sélecteurs ont été retirés.

## Contrôles exécutés

- 764 captures de cas distincts validés, 308 analyses Axe sans violation sur les périmètres examinés ; cinq navigateurs Windows : Chromium, Chrome, Edge, Firefox et WebKit.
- 58 comparaisons avant/après sur les mêmes données, aux formats 320×740, 390×844, 844×390 et 1440×1000. Aucun contrôle de dialogue inférieur à 44×44 px dans les 58 vues après correction.
- Campagne générale également à 768×1024 ; texte racine à 200 % en 320×740 et 568×320 ; préférence système sombre ; hauteur disponible réduite à 390×460 pendant une recherche.
- Carnet (Villes/Victoire/Bonus/Objectif/Partie), propriétaires aux noms longs, journal de 80 entrées, recherche avec/sans résultat, inspection d'une propriété et retour, réglages et persistance, règles, salon et erreur de saisie, sortie de partie.
- Achat de terrain, hôtel, île, enchère, duel, dette et voyage ; bilan de fin de partie, alliance et casino également examinés dans Chrome/WebKit, en portrait/paysage et à 200 % ; sélection d'hôtel et erreurs de montant. Aucun achat, aucune offre privée et aucune réaction envoyés par ces contrôles de formulaire.
- Clic sur un personnage ouvrant les réactions, absence du raccourci et des sélecteurs, annulation/reprise/remplacement d'une sauvegarde dans des contextes de test isolés.
- 45 captures de menus de la compilation de production sur les cinq navigateurs, trois formats mobiles. Modèles chargés avec réponses HTTP 200/304 ; aucune erreur JavaScript ni requête en échec. Les scénarios de recette sont absents de la compilation de production.
- 25 captures complémentaires des îles dans la compilation de production, sur cinq navigateurs, avec vérification des nombres insécables et de leur visibilité après défilement. L’horloge du navigateur de test est figée pendant les mesures afin que l’offre n’expire pas entre deux formats.
- `pnpm check` : **741 tests / 71 fichiers**, typage, lint, couverture et build réussis. Après le dernier ajustement CSS : nouveau build et contrôle visuel. Formatage et `git diff --check` réussis.
- Régression du plateau : 79 captures Chromium/WebKit et 7 groupes d'interactions, sans échec (résultats séparés).

## Méthode et limites

Les résultats détaillés sont dans `menu-review/validated-results.json`. Une mesure plus récente du même navigateur/cas/format remplace la précédente. Les campagnes brutes sont conservées. La première campagne a lancé l'analyse Firefox de l'enchère avant l'ouverture temporisée du dialogue ; l'attente du panneau a été corrigée et tous les cas de décision ont été rejoués sur les cinq navigateurs. Le périmètre sans dialogue est la carte de décision, et non les petites cibles spatiales des pions du plateau.

Une vérification complémentaire des couleurs compositées de la fiche empilée donne 6,41:1 pour le titre, 9,11:1 pour le chronomètre et au moins 6,69:1 pour le cartouche de propriétaire sur toutes les couleurs de propriétés. La géométrie confirme que le titre et le chronomètre sont séparés (`menu-review/manual-review.json`).

Le contrôle initial de débordement du panneau ne détectait pas les nombres coupés à l’intérieur des colonnes des îles. Une assertion supplémentaire vérifie désormais que chacun des quatre montants tient sur une seule ligne et dans sa cellule. La lecture de chaque montant est aussi vérifiée par défilement : aucun bouton ne doit le recouvrir. Les actions des îles défilent avec leur contenu ; elles ne sont plus collées au bas de la fiche. Les boutons s’empilent sur les écrans étroits. Achat et rachat d’île sont rejoués sur cinq navigateurs, cinq formats standards et deux formats à 200 %.

Les sorties Axe « incomplete » (294 analyses) demandent une lecture humaine, notamment sur des dialogues natifs empilés et les fonds composités. Elles ne sont pas assimilées à des contrôles automatiquement réussis. Les captures, titres, séparations du chronomètre, corps défilants et boutons de fermeture ont été examinés visuellement. Aucun certificat global WCAG n'est revendiqué.

**Non exécuté :** téléphone/tablette physique, Safari macOS/iOS, VoiceOver/TalkBack, clavier logiciel réel et partie multijoueur sur réseaux mobiles. Le moteur WebKit sous Windows ne constitue pas un test Safari/iPhone. La réduction de hauteur simule seulement l'espace d'un clavier.

## Repères retenus

Le choix de commandes de 48 px dans les panneaux et d'au moins 44 px pour les commandes compactes s'inspire des [boutons Apple](https://developer.apple.com/design/human-interface-guidelines/buttons) et des [cibles tactiles Android](https://support.google.com/accessibility/android/answer/7101858). Leurs unités natives pt/dp ne sont pas des pixels CSS. Les [cibles minimales WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) et le [focus non masqué](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) guident les vérifications web.

## Reproduire

```sh
pnpm install --frozen-lockfile
pnpm qa:board:install
pnpm qa:menus
```

La commande lance son serveur de développement et écrit dans `artifacts/menu-qa`. Chrome et Edge doivent être installés pour les canaux Windows. `MENU_QA_URL`, `MENU_QA_OUT`, `MENU_QA_BROWSERS` et `MENU_QA_SCREENS` permettent de choisir le serveur, le dossier, les navigateurs et formats. Les options `MENU_QA_REVISIONS_ONLY`, `MENU_QA_REFLOW_ONLY`, `MENU_QA_PROPERTIES_ONLY`, `MENU_QA_REACTIONS_ONLY` et `MENU_QA_ISLANDS_ONLY` servent aux reprises ciblées ; le lancement par défaut exécute tout. Playwright reste épinglé à `1.65.0-alpha-2026-10-16` pour le correctif du compositeur WebKit documenté dans la recette du plateau.

## Validation demandée

Ouvrir `recette-menus.html` pour comparer les menus, puis essayer la version locale. Le push attend une validation explicite de Julien. Aucun envoi, fusion ou déploiement GitHub n'a été réalisé pour cette demande.
