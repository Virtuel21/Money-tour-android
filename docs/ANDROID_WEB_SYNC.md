# Synchronisation Android avec le web — 25 octobre 2026

Le portage reprend les deux changements publiés sur `Virtuel21/money-tour` après la base commune `a56b9b13666a894f8a8ad8a4aa63e7fe0124164e` :

- `297a22d` : accueil simplifié et configuration du jeu sur cet appareil dans une fenêtre.
- `b8a17205b06504a0cb15851d81d9895c8923dafa` : salons publics, recherche de parties et reprise authentifiée d’une place IA.

L’accueil propose **Entre amis**, **En ligne** et **Solo & bots**. Les nouvelles parties sont chacun pour soi ; les sauvegardes en équipes restent utilisables. L’entrée du tutoriel et la création de nouvelles parties 2v2 sont retirées comme dans le jeu web. Les recettes Android suivent ces nouveaux parcours et refusent une sélection vide de scénarios.

Le client partage les règles, les messages signés, le protocole de session `4` et l’espace Trystero `virtuel21-money-tour-v22` du web. Les anciens clients actifs doivent être mis à jour. Le miroir de l’annuaire et ses tests SQLite sont inclus dans `services/matchmaking` ; aucun nouveau service n’est déployé par ce portage.

Les adaptations Android sont conservées : Retour et fermeture des fenêtres, liens `moneytour://`, invitations vers le site web public, partage et presse-papiers natifs, clavier, pause en arrière-plan, sauvegarde/reprise et attente du plateau 3D avant les horloges.

## Contrôles exécutés

| Contrôle                                                 | Résultat                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                             | Types, ESLint, build des trois packages et contrôles des ressources réussis                                                                                  |
| Tests Vitest avec couverture                             | 1 004 tests réussis dans 97 fichiers ; 97,34 % des lignes et 93,60 % des branches du moteur                                                                  |
| Tests de l’annuaire sur SQLite réel                      | 7 tests réussis, aucun échec                                                                                                                                 |
| Recette fonctionnelle tactile Chromium, 360 × 640        | 4 scénarios réussis : accueil/réglages, solo, partie locale depuis la fenêtre, reprise d’une sauvegarde en équipes ; aucune erreur JavaScript                |
| Recette visuelle ciblée Chromium, 360 × 640 et 851 × 393 | 4 scénarios réussis : accueil/réglages/invitation et fenêtre locale/introduction de partie dans chaque format, avec mise en page Capacitor et WebGL logiciel |
| `pnpm android:build`                                     | APK reconstruite ; Android Lint sans erreur                                                                                                                  |
| Contenu de l’APK                                         | 71 fichiers web courants vérifiés ; seul le viewport HTML est adapté à Android par le script de synchronisation                                              |
| Signature et empreinte                                   | `apksigner verify` et `sha256sum --check` réussis                                                                                                            |

Les contrôles de format et de différences Git sont exécutés séparément. Les preuves locales se trouvent dans `artifacts/android-qa/updated-functional/`, `artifacts/android-qa/updated-visual/`, `artifacts/android-qa/updated-landscape/`, `coverage/` et `android/app/build/reports/`. Vite émet un avertissement sur le paquet principal de 773 ko ; la compilation réussit et le budget des ressources statiques reste respecté.

## APK 0.1.1 publiée

Les commits Firebase Analytics `1ee5bdc` et Google Tag Manager `a80f67a`, ajoutés sur `main` pendant la préparation, sont conservés. L’APK a été recompilée après cette intégration ; Android Lint et la vérification de signature ont de nouveau réussi.

Fichier : `artifacts/android/Money-Tour-Android-0.1.1-debug.apk`.

- Taille : 26 254 965 octets.
- SHA-256 : `455ec2329d9a4d0ffecdfbcd859077480dfc32085989c602432a0d7480cfd2dd`.
- Version Android : `0.1.1`, code `2`, application `com.moneytour.android`.
- Signature : APK v2, certificat SHA-256 `a1ba3cc19d8fdb59d4bdc71c722bc5ade1e203fa562bc2de013073f2e5ba8b8c`. Cette clé debug diffère de celle de la `0.1.0` publiée. La publication avec cette nouvelle signature a été choisie explicitement : il faut désinstaller la version précédente, avec perte des sauvegardes locales, avant l’installation.

L’APK et les rapports générés restent hors de la branche du code source. La branche `android-downloads` conserve la livraison historique et distribue `Money-Tour-Android-0.1.1-debug.apk`, ses empreintes et l’alias `Money-Tour-Android-latest.apk` utilisé par le lien du README. Les versions sont aussi inscrites dans le manifeste Android, pas seulement dans le nom du fichier.

La compilation et les tâches Lint réussissent. Le journal Lint signale toutefois des métadonnées Kotlin `2.4.0` dans Firebase, supérieures à celles reconnues par son lecteur `2.2.0` ; aucun contrôle n’a été désactivé et le rapport final ne contient aucune erreur. Cela ne valide pas les événements Firebase sur un appareil réel.

## Limites de cette validation

Le proxy cloud refuse l’accès à `money-tour-matchmaking.frostyshark128.chatgpt.site` avec une réponse `403` au tunnel HTTPS. L’ajout de ce domaine est enregistré dans le brouillon de configuration de l’environnement ; cette sauvegarde n’applique pas la politique réseau à la machine courante. Les tests de réservation, d’admission et de protocole réussissent localement, mais une vraie recherche contre l’annuaire hébergé et une partie web/Android sur des réseaux distincts restent à vérifier.

Aucun émulateur ni téléphone n’a été utilisé pour cette synchronisation. Les tests natifs automatisés et les recettes dans Chromium ne remplacent pas l’installation de cette APK, le clavier système, le cycle de vie, le partage vers les applications du téléphone ou la fluidité sur le matériel de destination. La [recette du 24 octobre](ANDROID_VALIDATION.md) reste une preuve de la livraison précédente.
