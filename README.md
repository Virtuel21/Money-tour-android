# Money Tour pour Android

Application Android issue de [Virtuel21/money-tour](https://github.com/Virtuel21/money-tour), avec le moteur, les règles, le plateau 3D, les musiques et les illustrations d’origine. Le dépôt web d’origine n’est pas modifié.

**[Télécharger la version Android de test](https://github.com/Virtuel21/Money-tour-android/releases)** · [Documentation du jeu web](README-WEB.md)

## Installer sur votre téléphone

1. Ouvrir la [page des versions](https://github.com/Virtuel21/Money-tour-android/releases) sur le téléphone et télécharger `Money-Tour-Android-0.1.0-debug.apk` dans les fichiers joints.
2. Ouvrir le fichier téléchargé. Si Android le demande, autoriser l’installation pour le navigateur ou l’application Fichiers, puis choisir **Installer**.
3. Ouvrir **Money Tour**. Choisir **Solo & bots** pour jouer seul, ou **Entre amis → Jouer sur cet appareil** pour partager le téléphone. Les salons en ligne nécessitent Internet.

L’APK est une version de test signée, installable directement ; il n’est pas distribué sur Google Play. Minimum déclaré : Android 7.0 (API 24), avec Android System WebView/Chrome 111 ou supérieur et WebGL 2. Mettre à jour Android System WebView/Chrome si l’application le demande.

Les mises à jour avec la même signature conservent les sauvegardes. Désinstaller l’application ou effacer ses données supprime les parties locales et l’identité de reprise en ligne. Les sauvegardes du navigateur ne sont pas automatiquement transférées dans l’application.

## Adaptations Android

- Jeu, modèles, textures, effets et musiques embarqués ; partie locale et tutoriel disponibles hors connexion.
- Bouton Retour : fermer la fenêtre courante, confirmer avant de quitter une partie, réduire l’application depuis l’accueil.
- Arrière-plan : sauvegarde locale immédiate, arrêt du son et pause de la partie locale. Au retour, **Reprendre** relance le chrono et les bots.
- Interface tactile adaptée au portrait et au paysage, zones tactiles agrandies, fenêtres défilantes et commandes protégées des barres système et du clavier.
- Presse-papiers et partage Android pour les invitations. Les liens partagés ouvrent la version web compatible chez les autres joueurs ; ils peuvent aussi être collés dans **Rejoindre un salon** dans l’application. Les liens `moneytour://room/<code>` ouvrent directement l’application installée.
- Icône et écran de lancement assortis au jeu. Aucun compte supplémentaire, autorisation de caméra, de microphone ou d’accès aux fichiers personnels.

En ligne, Android peut suspendre une application en arrière-plan. La partie des autres joueurs continue ; la reprise dépend des mécanismes de reconnexion du jeu. Certains réseaux mobiles nécessitent un serveur TURN : voir [Connexions mobiles](docs/NETWORK_MOBILE.md). Aucun service TURN n’est inclus dans l’APK.

## Recette et preuves

- [Recette fonctionnelle](docs/ANDROID_FUNCTIONAL_QA.md) : modes, actions du jeu, sauvegardes, tutoriel et invitations.
- [Recette visuelle et tactile](docs/ANDROID_VISUAL_QA.md) : petits écrans, paysage, textes agrandis, fenêtres et clavier.
- [Compilation et recette native](docs/ANDROID.md) : APK, signature, émulateur, bouton Retour et cycle de vie.
- [Inventaire des mécaniques](docs/MECANIQUES_ET_PROBABILITES.md), [règles](docs/FORTUNE_RULES.md) et [crédits](CREDITS.md).

Les captures et rapports JSON sont joints aux preuves de la version. Les essais sur navigateur et émulateur ne remplacent pas une partie sur téléphone physique, ni des essais entre opérateurs Wi-Fi/4G/5G distincts.

## Développer et compiler

Prérequis : Node.js 22.12+, Corepack/pnpm 10.32.1, **JDK 21 complet** (incluant `javac`), Android SDK plateforme 36 et Build Tools 35.0.0/36.0.0. Configurer `JAVA_HOME` et `ANDROID_HOME` vers ces installations. Android Studio peut les fournir.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm android:build
```

Le build reconstruit le jeu, synchronise Capacitor, compile l’APK et exécute Android Lint. Résultats dans `artifacts/android/` : APK et `SHA256SUMS.txt`. `pnpm android:open` ouvre Android Studio ; après une modification web, exécuter `pnpm android:sync` avant de lancer depuis Android Studio. `pnpm android:icons` régénère les ressources natives depuis l’icône originale.

Le workflow **Android APK** compile les changements sur `main`, les pull requests et les exécutions manuelles. Les tags `android-v*` produisent une préversion GitHub avec l’APK et son empreinte SHA-256. Une clé de test stable peut être fournie par un secret du dépôt ; aucune clé privée n’est versionnée. La publication Google Play nécessitera une signature de production et la procédure de publication correspondante.

Licence [MIT](LICENSE) ; provenance et licences des ressources dans [CREDITS.md](CREDITS.md).
