# Money Tour Android — téléchargement de test

**[Télécharger Money Tour Android 0.1.1](https://raw.githubusercontent.com/Virtuel21/Money-tour-android/android-downloads/Money-Tour-Android-latest.apk)** — 25 octobre 2026, version Android `0.1.1`, code `2`.

Cette APK comprend l’accueil **Entre amis / En ligne / Solo & bots**, la configuration locale dans une fenêtre, les salons publics et la recherche de parties, ainsi que Firebase Analytics et Google Tag Manager. Le code source correspond au commit [`d2ace76`](https://github.com/Virtuel21/Money-tour-android/commit/d2ace76e115bd13eda9d9aa3ef75e37142058376) et au jeu web `b8a1720`.

**Si la version 0.1.0 est installée, il faut la désinstaller avant d’installer la 0.1.1 : la clé de signature a changé et cette désinstallation efface les sauvegardes locales.** La publication avec cette nouvelle clé a été explicitement choisie. Les futures mises à jour doivent conserver la clé de la 0.1.1.

Ouvrir le fichier téléchargé sur Android et autoriser son installation si le système le demande. Android 7.0+, WebView/Chrome 111+ et WebGL 2 requis. Application `com.moneytour.android`, hors Google Play.

- Fichier versionné : [Money-Tour-Android-0.1.1-debug.apk](https://raw.githubusercontent.com/Virtuel21/Money-tour-android/android-downloads/Money-Tour-Android-0.1.1-debug.apk).
- Taille : 26 254 965 octets.
- SHA-256 : `455ec2329d9a4d0ffecdfbcd859077480dfc32085989c602432a0d7480cfd2dd`.
- Certificat de signature SHA-256 : `a1ba3cc19d8fdb59d4bdc71c722bc5ade1e203fa562bc2de013073f2e5ba8b8c`.
- [Rapport de validation et limites](https://github.com/Virtuel21/Money-tour-android/blob/main/docs/ANDROID_WEB_SYNC.md).

La compilation, le manifeste 0.1.1/code2, la signature et les ressources embarquées ont été vérifiés. Les contrôles automatisés du jeu ont réussi ; cette APK doit encore être essayée sur téléphone et entre réseaux distincts. Aucun test de réception Firebase/GA4 ni de conteneur GTM sur appareil n’est revendiqué. Aucune clé privée n’est présente dans cette branche.

Le lien `Money-Tour-Android-latest.apk` désigne la dernière APK publiée dans cette branche. Pousser uniquement le code sur `main` ne remplace pas le binaire : chaque livraison doit construire, vérifier et publier la nouvelle APK et son empreinte.

## Archive du 24 octobre 2026

L’ancienne [APK 0.1.0](https://raw.githubusercontent.com/Virtuel21/Money-tour-android/android-downloads/Money-Tour-Android-0.1.0-debug.apk), code1, reste inchangée : SHA-256 `39d4c86205cdfc172763381607ba9f8786811789355e22aeefadbb8d4d8939f4`. Elle provient de la base web `a56b9b1` et du correctif natif `6d94b1c`.

L’archive `Money-Tour-Android-0.1.0-recette.zip` contient les rapports, journaux et captures de cette livraison historique. Après extraction, ouvrir `index.html` pour parcourir les preuves hors connexion. Le fichier `android-ui-overview.png` appartient aussi à cette recette historique.

Le [code source et les crédits](https://github.com/Virtuel21/Money-tour-android/tree/main) sont sous licence MIT.
