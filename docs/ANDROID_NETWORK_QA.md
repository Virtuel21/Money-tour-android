# Recette réseau Android — 24 octobre 2026

Le protocole de jeu et le moteur restent ceux du dépôt d’origine : Trystero 0.26.0,
espace `virtuel21-money-tour-v21`, canal `game-v1`. Le wrapper Android utilise
`https://localhost` pour WebCrypto et WebRTC ; ses invitations utilisent
`https://virtuel21.github.io/money-tour/#room=…`, jamais l’origine locale du WebView.
Les liens Android `moneytour://room/<code>` et `moneytour://room/#room=…` sont
normalisés en données d’invitation ; leur URL ne remplace jamais le contenu du WebView.
Les liens web peuvent être collés dans « Rejoindre un salon » dans l’application.

## Résultats observés

| Recette                                                | Résultat                                                                                                      | Portée                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Salon public, arrivée après 65 secondes, sans TURN     | Création, annulation, nouvelle invitation et attente de 65 010 ms réussies ; arrivée du second joueur bloquée | Chromium de l’environnement interdit les candidats UDP directs                        |
| Protocole réel, Nostr public, sans TURN                | Offre/réponse SDP, aucun candidat ICE et aucune connexion                                                     | Aucun défaut JavaScript observé ; même restriction du navigateur                      |
| Signalisation Nostr locale, sans TURN                  | Offre/réponse SDP échangées ; ICE terminé sans candidat                                                       | Isole la restriction de transport de la disponibilité des relais publics              |
| Signalisation Nostr locale + TURN/TCP temporaire local | **6 contrôles réussis**                                                                                       | Vrais canaux WebRTC, classes de production, deux contextes Chromium                   |
| Nostr public + TURN/TCP temporaire local               | **6 contrôles réussis**                                                                                       | Relais publics réellement joints, vrais canaux WebRTC et même protocole de production |

Les deux dernières recettes ont vérifié : deux pairs authentifiés ; même démarrage
signé et même preuve du premier joueur avec deux contributeurs ; libération après
les deux confirmations signées ; lancer de dés signé et preuve de tirage identiques ;
rechargement de l’invité avec récupération de son identité et de l’historique validé ;
réaction signée de ce joueur à nouveau reçue par l’hôte. Les candidats ICE étaient
de type `relay`, les connexions étaient établies et aucun incident de protocole ni
défaut JavaScript n’a été enregistré.

Le navigateur de cette machine est Chromium 154.0.8037.57. Sa politique administrée
`WebRtcIPHandling=disable_non_proxied_udp` interdit les candidats UDP directs. Un
test indépendant de deux `RTCPeerConnection` sans Trystero ni STUN a reproduit
l’absence de candidats. Cette politique n’a pas été modifiée.

Le TURN de recette était un processus coturn temporaire, authentifié avec des
identifiants aléatoires, avec écoute et adresses de relais limitées à `127.0.0.1`.
Il a été arrêté après chaque recette. Aucun service TURN n’a été déployé pour les
joueurs et aucun identifiant de recette n’est livré dans l’APK ou le dépôt.
Le relais autorise uniquement les pairs `127.0.0.1`, utilise un port d’écoute TCP
éphémère et la plage de relais 60000–60031, sans écoute UDP, TLS, DTLS ou console.
Ces paramètres sont générés par le script, avec un fichier temporaire de mode `0600`.
Les rapports exportés ne contiennent ni clés privées d’identité ni identifiants TURN.
Les éventuels liens visibles dans les captures appartiennent uniquement à des salons
de recette fermés après les tests.

**Ces résultats ne certifient pas Android natif, un téléphone physique, des réseaux
distincts, la 4G/5G ou un fournisseur TURN de production.** L’APK et les fonctions
du système Android relèvent de la recette Android distincte.

## Reproduire

Les scripts produisent un `results.json` et conservent séparément les échecs et les
réussites dans `artifacts/android-qa/`.

```sh
# Salon et invitation réels avec arrivée différée ; sans TURN.
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  LOBBY_QA_OUT=artifacts/android-qa/network-public \
  node scripts/qa-lobby-delay.mjs

# Protocole de production sur Nostr public et WebRTC réel.
node scripts/qa-android-network.mjs

# Même protocole avec coturn installé ou extrait localement.
# Le script génère les identifiants et arrête le processus automatiquement.
ANDROID_NETWORK_TURNSERVER_BIN=/usr/bin/turnserver \
  ANDROID_NETWORK_OUT=artifacts/android-qa/network-turn-public \
  node scripts/qa-android-network.mjs

# Variante avec signalisation Nostr déterministe locale.
ANDROID_NETWORK_TURNSERVER_BIN=/usr/bin/turnserver \
  ANDROID_NETWORK_LOCAL_SIGNALING=1 \
  ANDROID_NETWORK_OUT=artifacts/android-qa/network-turn-local \
  node scripts/qa-android-network.mjs
```

Dans cet environnement, coturn Debian `4.6.1-2` et ses bibliothèques manquantes
ont été extraits sous `/tmp`, sans installation système. Commande exécutée pour
la recette publique réussie :

```sh
LD_LIBRARY_PATH=/tmp/moneytour-turn/root/usr/lib/x86_64-linux-gnu \
  ANDROID_NETWORK_TURNSERVER_BIN=/tmp/moneytour-turn/root/usr/bin/turnserver \
  ANDROID_NETWORK_OUT=artifacts/android-qa/network-turn-public \
  node scripts/qa-android-network.mjs
```

Le script réseau importe les vrais modules de production dans deux contextes de
navigateur. Il suspend uniquement les horloges automatiques de session pour comparer
les trames signées stables. Il ne remplace ni le moteur, ni les signatures, ni les
canaux de données WebRTC par un transport en mémoire. La variante locale substitue
un relais Nostr à la frontière WebSocket ; la variante publique utilise les relais
Nostr par défaut. Le proxy HTTP de l’environnement est utilisé pour les accès publics.
Il peut être précisé avec `LOBBY_QA_PROXY_SERVER`, ou désactivé avec une valeur vide.
