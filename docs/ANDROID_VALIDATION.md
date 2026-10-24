# Livraison Android 0.1.0 — recette du 24 octobre 2026

## Installer

[Télécharger l’APK signée](https://raw.githubusercontent.com/Virtuel21/Money-tour-android/b65c078e021fcc9fbed7c255d2d31063f2e63f5f/Money-Tour-Android-0.1.0-debug.apk), puis ouvrir le fichier sur le téléphone et autoriser son installation si Android le demande. Aucun compte supplémentaire n’est nécessaire. Les parties locales et le tutoriel utilisent les ressources incluses dans l’APK.

| Élément                | Valeur                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| Application            | `com.moneytour.android`                                                |
| Version livrée         | `0.1.0`, code `1`, signature de développement                          |
| Android déclaré        | API 24 minimum ; cible et compilation API 36                           |
| WebView                | Chrome/Android System WebView 111 minimum ; WebGL 2 pour le plateau 3D |
| Taille de l’APK        | 21 038 686 octets                                                      |
| SHA-256                | `39d4c86205cdfc172763381607ba9f8786811789355e22aeefadbb8d4d8939f4`     |
| Signature              | Vérifiée par `apksigner`, schéma APK v2                                |
| Code d’origine copié   | `Virtuel21/money-tour`, commit `a56b9b1`                               |
| Implémentation Android | Base `ced7802` ; correction native du clavier dans `6d94b1c`           |

Le fichier public a été téléchargé de nouveau et son empreinte correspond à l’APK compilée. Le code et l’historique du jeu d’origine sont conservés sur `main`. Les APK de livraison sont archivées sur la branche `android-downloads` ; aucune clé privée n’y est présente.

Les rapports, journaux et captures sont regroupés dans l’archive `Money-Tour-Android-0.1.0-recette.zip`, liée à la [préversion Android](https://github.com/Virtuel21/Money-tour-android/releases/tag/android-v0.1.0). Après extraction, ouvrir `index.html` pour consulter la galerie hors connexion.

## Résultats vérifiés

| Niveau de contrôle               | Résultat                                                                                                                                                   | Preuve                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Types, ESLint, format, build web | Réussis localement et dans GitHub Actions                                                                                                                  | Workflow CI et journal de contrôle                                                                                        |
| Tests automatisés                | 973 tests dans 95 fichiers, tous réussis                                                                                                                   | `final-product-check.log` ; CI                                                                                            |
| Couverture du moteur             | 97,34 % des lignes ; 93,60 % des branches                                                                                                                  | Rapport de couverture du contrôle complet                                                                                 |
| Recette fonctionnelle tactile    | 52/52 scénarios uniques acceptés, aucune exception JavaScript                                                                                              | `functional-summary.json` et [rapport fonctionnel](ANDROID_FUNCTIONAL_QA.md)                                              |
| Recette visuelle                 | 68/68 scénarios, quatre formats, 147 captures                                                                                                              | `visual-summary.json` et [rapport visuel](ANDROID_VISUAL_QA.md)                                                           |
| Audits Axe                       | 8 audits uniques, aucune violation détectée                                                                                                                | Rapports visuels ; ce n’est pas une certification d’accessibilité                                                         |
| Réseau réel                      | 6 contrôles avec Nostr public et WebRTC via TURN/TCP local temporaire                                                                                      | [Rapport réseau](ANDROID_NETWORK_QA.md) et `network-turn-public/results.json`                                             |
| Compilation Android              | APK compilée localement et sur GitHub Actions ; Android Lint sans erreur                                                                                   | Rapports Android Lint et `native-build/`                                                                                  |
| Recette du système Android       | 7/7 contrôles réussis sur Android 15/API 35 : hors connexion, Retour, clavier, vrai WebGL, sauvegarde, pause, restauration et lancer tactile après reprise | [GitHub Actions](https://github.com/Virtuel21/Money-tour-android/actions/runs/40141458383) et `native-final/results.json` |

La recette système utilise une APK compilée dans GitHub Actions. Ses 76 fichiers du jeu, le code natif et les ressources sont identiques octet par octet à l’APK livrée ; seuls le numéro de compilation et la signature de test diffèrent. Le reçu `native-build/ci-apk-comparison.json` conserve cette comparaison. La capture native `06-restored-home.png` correspond encore à une image de transition du compositeur logiciel ; elle ne sert pas de preuve visuelle de l’accueil restauré. La capture `07-restored-roll.png` montre la partie reprise et sa décision après le vrai lancer tactile. Les images brutes et le journal sont conservés.

Les quatre échecs initiaux de la recette fonctionnelle ont été rejoués avec succès ; le reçu consolidé conserve leurs résultats et la provenance des reprises. Le défaut découvert pendant le chargement lent est corrigé : le chrono et les bots attendent le plateau utilisable. Le champ de saisie natif est recentré après l’apparition du clavier si son cadre sort de la zone visible. Les captures visuelles contrôlent le délai uniquement pour stabiliser la composition ; les actions et les montants sont vérifiés séparément sans modifier les règles.

## Essais restant propres au téléphone de destination

La recette doit être complétée sur le téléphone utilisé : installation, fluidité et consommation du GPU, audio physique, clavier et gestes du constructeur, partage vers ses applications et parties entre réseaux Wi-Fi/4G/5G distincts. Le protocole et l’intégration TURN sont testés ; aucun service TURN de production n’est fourni. La politique réseau du Chromium de développement empêche les candidats UDP directs, et n’a pas été modifiée pour les tests.

Cette version est destinée aux essais directs par APK. Elle n’est pas publiée sur Google Play. Les sauvegardes du navigateur restent distinctes de celles de l’application. Une désinstallation supprime les données locales ; une mise à jour doit garder la signature pour les conserver. Le [guide Android](ANDROID.md) décrit la signature, la compilation, les commandes de recette et les limites de l’automatisation.
