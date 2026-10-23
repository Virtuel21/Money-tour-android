# Connexions mobiles et invitations

## Diagnostic du 27 septembre 2026

Le client utilisait alors Trystero 0.25.4 : relais Nostr pour trouver les pairs, puis WebRTC pour les données. La configuration initiale n'ajoutait un TURN que lorsqu'un joueur le saisissait manuellement. Une invitation correcte et des relais de signalisation accessibles ne garantissent donc pas une connexion directe entre deux réseaux.

Une 4G/5G avec NAT restrictif, notamment CGNAT, est une cause plausible du blocage rapporté. Ce diagnostic vient du chemin de connexion dans le code et des contraintes WebRTC ; il ne prouve pas quel opérateur ou appareil a échoué. Voir [WebRTC : serveurs TURN](https://webrtc.org/getting-started/turn-server) et [configuration Trystero](https://github.com/dmotz/trystero#api).

Autres constats corrigés : l'attente de l'hôte affichait prématurément un salon vide, aucun bouton ne relançait la connexion et le même avertissement était ajouté quatre fois par seconde après 25 secondes. Le formulaire d'invitation mélangeait création et saisie du code déjà présent dans le lien.

## Invitations et attente du salon — 23 octobre 2026

Les salons se partagent avec leur lien complet. Le code technique n'est plus affiché ni proposé à la copie. Un lien ouvert directement demande seulement le nom ; l'entrée « Rejoindre un salon » accepte également le lien collé. Les réglages de mode TURN restent transmis dans le fragment du lien, sans identifiants TURN.

Trystero est fixé à la version 0.26.0 pour corriger les offres WebRTC périmées des hôtes restés seuls. Avec la version 0.25.4, après environ 57 secondes, la recréation d'une offre pouvait perdre son canal de données et ses candidats ICE : les nouveaux invités restaient alors bloqués. La correction amont crée les offres à la demande et réessaie les échanges de signalisation. Voir [le diagnostic amont et sa résolution](https://github.com/dmotz/trystero/issues/204) et [la version 0.26.0](https://github.com/dmotz/trystero/releases/tag/0.26.0).

Cette version modifie le format réseau interne. Le namespace d'application passe à `virtuel21-money-tour-v20` pour isoler les anciens clients ; hôte et invités doivent charger la nouvelle version du jeu. Le lien de salon garde le même format et la reprise d'identité reste disponible.

Le salon n'a aucun délai d'expiration applicatif : fermer sa boîte de dialogue conserve la session tant que le jeu reste ouvert ; « Quitter ce salon » ou fermer la page ferme la connexion. Un navigateur suspendu par le système ou un réseau coupé peut nécessiter le retour au premier plan ou une reconnexion. Aucun minuteur ne déconnecte périodiquement les joueurs pour rafraîchir le salon.

Régression exécutée dans Chromium le 23 octobre : deux contextes navigateur par version, hôte choisi comme initiateur et laissé seul 65 secondes avant l'arrivée de l'invité. Avec le cœur Trystero 0.25.4, aucun des deux pairs ne s'est connecté ; avec 0.26.0, les deux pairs se sont connectés et ont échangé un message dans chaque sens, sans erreur de page. Ce test utilisait de vraies connexions WebRTC et une signalisation WebSocket locale déterministe ; il ne valide pas les relais publics Nostr ou la 4G/5G.

Pour la recette du jeu, laisser un hôte seul au moins 65 secondes, ouvrir ensuite le lien dans un second contexte navigateur, rejoindre et vérifier les mêmes noms puis le même état après lancement. Répéter après fermeture de la boîte de dialogue du salon. Le test de session en mémoire couvre séparément une attente simulée de trente minutes.

Le script réutilisable `node scripts/qa-lobby-delay.mjs` démarre Vite sur 4186, crée un hôte `HoteQA`, ferme sa boîte de dialogue pendant 65 secondes, la rouvre, puis fait rejoindre `InviteQA` depuis le lien dans un second contexte Chromium neuf. Il vérifie les noms des deux côtés et compare le premier état signé après lancement, avec deux contributeurs humains. Il utilise le Trystero de l'application et les relais Nostr publics, sans configurer de TURN. Les résultats, diagnostics de relais et captures sont enregistrés dans `artifacts/lobby-delay/`.

Cette recette a réussi le 23 octobre sur le serveur Vite local avec Chromium 156.0.8078.12 : boîte de dialogue fermée pendant 65014 ms, invitation conservée, invité tardif connecté, mêmes deux noms et premier frame signé identique avec deux contributeurs. Aucun événement `pageerror` n'a été reçu. Certains relais Nostr publics ont refusé leur connexion WebSocket, mais les autres ont permis la découverte et la synchronisation. Ce résultat porte sur l'application locale utilisant les relais publics ; la vérification du site déployé est distincte.

Pour réutiliser un serveur existant ou le site déployé, définir `LOBBY_QA_URL` ; `LOBBY_QA_DELAY_MS` ajuste l'attente (65000 par défaut) et `LOBBY_QA_OUT` change le dossier des preuves. Le script retourne un échec si la connexion ou la synchronisation ne se fait pas et conserve les statuts pour distinguer un blocage de signalisation d'une réussite. Cette recette ne remplace pas les essais entre appareils et opérateurs distincts.

## Relais automatique facultatif

Définir `VITE_TURN_CREDENTIALS_URL` dans `apps/web/.env.local` ou la variable de dépôt GitHub du même nom avant le build Pages. Chaque joueur récupère ses identifiants au moment de rejoindre. Sans cette variable, le fonctionnement direct et les paramètres manuels restent disponibles. Le délai de récupération est limité à dix secondes et une nouvelle tentative ferme l'ancienne session.

Le service doit répondre en HTTPS, autoriser par CORS l'origine exacte du jeu et retourner :

```json
{
  "iceServers": [
    {
      "urls": ["turn:relay.example:3478", "turns:relay.example:443?transport=tcp"],
      "username": "identifiant-temporaire",
      "credential": "mot-de-passe-temporaire"
    }
  ]
}
```

Le serveur émet des identifiants à durée limitée et applique ses propres quotas/limites d'abus. La clé API du fournisseur reste côté serveur. L'URL du service est publique ; elle ne doit contenir aucun secret. Le code du salon, l'identité de reprise et les données de partie ne sont pas envoyés à ce service. Trystero conserve ses STUN par défaut lorsqu'on lui passe `turnConfig`.

Aucun fournisseur ni serveur TURN n'est provisionné par cette modification. L'option manuelle accepte plusieurs URL séparées par des virgules. Un transport TLS/TCP sur 443 peut aider là où UDP est filtré ; il faut que le fournisseur le propose réellement.

## Recette terrain restant à effectuer

1. Hôte Wi-Fi et invité sur téléphone physique en 5G, puis rôles inversés ; conserver opérateur, OS et navigateur dans le compte rendu.
2. Ouvrir un lien neuf : saisir seulement un nom, rejoindre, vérifier les deux noms et le même état chez les deux pairs.
3. Comparer sans TURN puis avec identifiants temporaires valides ; vérifier dans les diagnostics WebRTC qu'une paire de candidats `relay` est sélectionnée lors du test du relais.
4. Tester une coupure Wi-Fi/5G et le retour au premier plan. Vérifier la reprise du même siège et la nouvelle tentative sans doublon.
5. Avec réseau indisponible, hôte fermé et endpoint TURN expiré : vérifier les messages et la possibilité de réessayer.
6. Jouer l'enchère à deux réseaux : conserver le focus pendant la saisie, sceller et révéler, comparer le gagnant et les soldes.

Les tests de transport simulé et de viewport mobile ne valident pas un opérateur 5G. La recette multi-réseaux de l'issue #10 reste ouverte.

## Saisie de votre serveur TURN dans le jeu

Sous « Créer un salon en ligne », « Configurer le serveur TURN » ouvre les champs **Adresse TURN**, **Nom d’utilisateur TURN** et **Mot de passe TURN**. Saisir les paramètres du serveur existant, choisir si toutes les connexions doivent passer par le relais, puis « Créer le salon avec TURN ». Le bouton de test vérifie une allocation WebRTC `relay` ; il ne remplace pas une partie entre plusieurs réseaux.

Plusieurs adresses peuvent être séparées par des virgules, par exemple `turn:relay.example:3478?transport=udp, turns:relay.example:5349?transport=tcp`. L’adresse, le nom d’utilisateur, le mot de passe et l’option de relais obligatoire sont enregistrés automatiquement dans le stockage local de ce navigateur (`money-tour.turn-settings.v1`). Ils sont restaurés après actualisation, fermeture de l’onglet ou du navigateur, et pour les nouveaux salons comme les reprises. Le bouton « Effacer les paramètres TURN enregistrés » les supprime. Si le navigateur refuse le stockage, un message le signale et la saisie reste utilisable dans l’onglet courant. Des identifiants temporaires expirés doivent être remplacés.

Les identifiants ne figurent pas dans l’invitation. En mode manuel, chaque invité utilise ses paramètres enregistrés ou les renseigne ; le lien complet transmet le mode réseau et la demande de relais obligatoire, qui prime sur l’option locale pour cette connexion. Un code de salon seul ne transmet pas ces réglages. Le service automatique facultatif configuré au déploiement reste pris en charge.
