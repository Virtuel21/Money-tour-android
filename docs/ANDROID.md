# Compilation et recette Android native

## Architecture

Le monorepo d’origine est conservé : moteur TypeScript pur dans `packages/engine`, client React/Vite/Three.js dans `apps/web`. Capacitor 8.5.3 embarque `apps/web/dist` dans l’APK ; aucune page distante n’est chargée pour jouer. Les plugins App, Clipboard et Share sont utilisés uniquement sur la plateforme native, avec le comportement navigateur existant comme repli.

Identifiant : `com.moneytour.android`. Version : `0.1.0`. SDK minimum 24 ; compilation et cible 36. JDK 21, AGP 8.13.0 et Gradle 8.14.3. L’APK utilise le WebView fourni par Android et ne contient pas de bibliothèque native propre à un processeur.

La WebView s’exécute sur l’origine sécurisée `https://localhost` pour les API cryptographiques et WebRTC. Les requêtes en clair sont désactivées. Seule l’autorisation Internet est déclarée par le jeu. La sauvegarde Android vers le cloud est désactivée pour ne pas copier l’identité privée des salons. Les barres système, découpes d’écran et le clavier sont pris en compte nativement ; le champ de texte actif est recentré s’il est masqué après redimensionnement ; l’HTML embarqué déclare `viewport-fit=contain` avant le premier affichage.

Le lien public d’invitation reste `https://virtuel21.github.io/money-tour/#room=…`, compatible avec le navigateur existant. L’APK n’annonce pas de liens HTTPS vérifiés : aucun domaine et fichier `assetlinks.json` n’est associé à sa signature. Les liens `moneytour://room/<32 caractères hexadécimaux>` sont acceptés. Le code et les options réseau sont extraits sans naviguer la WebView vers une page arbitraire.

## Construire

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm android:build
```

Configurer `JAVA_HOME` vers un JDK complet et `ANDROID_HOME` vers le SDK. Installer `platform-tools`, `platforms;android-36`, `build-tools;35.0.0` et `build-tools;36.0.0` via Android Studio ou `sdkmanager`. Le wrapper Gradle vérifie l’empreinte de sa distribution. La synchronisation modifie uniquement l’HTML copié dans Android ; le build navigateur conserve son réglage de viewport.

Sortie : `artifacts/android/Money-Tour-Android-0.1.0-debug.apk` et `SHA256SUMS.txt`. Vérifier et installer :

```sh
apksigner verify --verbose --print-certs artifacts/android/Money-Tour-Android-0.1.0-debug.apk
adb install -r artifacts/android/Money-Tour-Android-0.1.0-debug.apk
```

## Firebase Analytics

Le module Android utilise le plugin Google Services 4.5.0 et Firebase Analytics avec la BoM 35.1.0. La configuration fournie est versionnée dans `android/app/google-services.json` : projet Firebase `money-tour-45c5d`, application `com.moneytour.android`. Le plugin est appliqué explicitement ; un fichier manquant ou incompatible doit faire échouer le build.

Cette intégration suit la [configuration Android officielle Firebase](https://firebase.google.com/docs/android/setup). Elle ajoute le SDK natif et sa collecte automatique. Les événements des actions du jeu dans la WebView Capacitor ne sont pas encore transmis au SDK natif. Aucun conteneur Google Tag Manager n’est inclus à ce stade ; la liaison du projet Firebase à la propriété GA4 doit être vérifiée dans la console Firebase.

Pour vérifier la réception dans DebugView avec un appareil ou émulateur connecté :

```sh
adb shell setprop debug.firebase.analytics.app com.moneytour.android
```

Relancer ensuite l’application et ouvrir Analytics → DebugView dans Firebase. Désactiver ce mode après le contrôle avec `adb shell setprop debug.firebase.analytics.app .none.`. Une compilation réussie ne prouve pas la réception des événements dans GA4.

## Signature et mises à jour

Le build debug utilise la clé du poste (`~/.android/debug.keystore`). Le workflow peut restaurer la même clé via le secret `ANDROID_DEBUG_KEYSTORE_BASE64`, pour permettre les mises à jour sans désinstallation. Cette clé de test n’est pas destinée à Google Play. Les fichiers de clés sont exclus de Git.

Une copie privée de la clé de test est conservée hors du dépôt dans `/workspace/shared/money-tour-android-signing/`. La connexion GitHub utilisée pour cette livraison ne permet pas de créer des secrets Actions (erreur 403). La première APK est donc signée avec la clé locale conservée dans l’environnement de travail. Les builds Actions sans ce secret produisent des APK de contrôle avec une autre clé temporaire ; leur publication automatique est désactivée. Pour automatiser les mises à jour de cette APK, il faudra ajouter sa clé de test au secret du dépôt depuis un accès GitHub autorisé. Aucune clé n’a été mise dans le dépôt public.

`ANDROID_VERSION_CODE` peut fournir un entier positif aux builds suivants. Sur GitHub Actions, il prend le numéro d’exécution du workflow. Une publication de production nécessitera un numéro croissant et une clé de production distincte.

## Rejouer les recettes

```sh
corepack pnpm test:coverage
node scripts/qa-android-functional.mjs
```

La recette navigateur utilise Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE` sélectionne son exécutable), le vrai plateau WebGL et des entrées tactiles émulées. Les scénarios locaux bloquent les services externes. Elle conserve captures et `results.json` dans `artifacts/android-qa/functional`.

La recette native nécessite **un appareil ou émulateur dédié au test**. Elle efface les données de l’application de test, installe l’APK, coupe temporairement le réseau, puis vérifie le cycle de vie via ADB et la vraie WebView :

```sh
ANDROID_QA_ALLOW_RESET=1 node scripts/qa-android-device.mjs
```

`ANDROID_SERIAL` sélectionne l’appareil, `ANDROID_QA_APK` un autre APK et `ANDROID_DEVICE_QA_OUT` le dossier des preuves. L’APK doit être debuggable. Les captures ADB incluent les barres système ; le rapport JSON enregistre l’API Android, la taille et la densité de l’écran.

## Portée de validation

Les résultats exécutés pour cette livraison sont consignés dans `ANDROID_FUNCTIONAL_QA.md`, `ANDROID_VISUAL_QA.md` et les rapports JSON joints à la préversion. Un résultat antérieur dans la documentation d’origine ne constitue pas un nouvel essai Android.

Restent à vérifier sur le téléphone de destination : fluidité et consommation sur son GPU, gestes et clavier du constructeur, audio physique, installation/mise à jour, partage vers ses applications et connexions avec d’autres appareils/opérateurs. Aucun téléphone physique ni service TURN de production n’est fourni par l’environnement. Si un endpoint automatique TURN est configuré, il doit accepter l’origine CORS `https://localhost` de l’application.
