# Annuaire public Money Tour

Ce package conserve dans le dépôt du jeu le cœur du service qui trouve les salons publics et réserve leurs places. Il fonctionne côté serveur avec Cloudflare D1 ; il n'est pas importé dans le client web. Les parties et l'hébergement du jeu restent en WebRTC entre joueurs.

- Origine déployée : `https://money-tour-matchmaking.frostyshark128.chatgpt.site`.
- Projet Sites enregistré : `appgprj_6ade06465400819189f163426ba310a3`.
- Commit source du déploiement de référence : `908e74a1b4f9386efd10061971a6c0b630203d14`.

Ce miroir reprend le code et les migrations de cette version. Le formatage suit les conventions du dépôt Money Tour ; il ne change pas la logique du service. Le wrapper Vinext, sa route `app/v1/[...path]/route.ts`, les scripts de construction et le manifeste Sites restent dans le projet de service enregistré.

## Fichiers maintenus ici

- `db/directory.ts` : validation HTTP, choix d'un salon, réservation atomique, capacités, présence et admission.
- `db/schema.ts` : tables Drizzle `rooms`, `reservations` et `request_limits`.
- `db/directory.test.mjs` : contrôles exécutés contre SQLite réel avec `node:sqlite`.
- `drizzle/` : migrations SQL et métadonnées Drizzle à conserver ensemble.

Les règles côté jeu et l'utilisation de l'annuaire sont décrites dans [PUBLIC_NETWORK.md](../../docs/PUBLIC_NETWORK.md).

## Vérifier le package

Depuis la racine du dépôt, utiliser Node 22.16 ou supérieur et le pnpm déclaré par le projet :

```sh
pnpm install --frozen-lockfile
pnpm --filter @money-tour/directory build
pnpm --filter @money-tour/directory test
```

`build` vérifie les types sans produire de bundle de déploiement. `test` vérifie les courses sur la dernière place, les sièges IA distincts, les capacités et identités, le comptage après admission, les expirations, la migration de l'hôte, les filtres, CORS et les bornes de requêtes. Ces tests ne prouvent pas une connexion entre téléphones physiques.

## Reproduire une mise à jour du service

1. Modifier et vérifier le cœur dans ce package.
2. Récupérer le projet Sites enregistré ci-dessus, puis copier `db/directory.ts` et `db/schema.ts` vers les mêmes chemins dans sa source Vinext. Copier aussi le test et l'ensemble de `drizzle/`, sans perdre les migrations déjà publiées. Ne pas écraser le projet par une nouvelle identité Sites.
3. En cas de changement du schéma, générer une migration avec le `drizzle-kit` du projet de service, puis reporter le SQL et ses métadonnées dans ce dépôt. Les noms et numéros existants restent stables.
4. Conserver le binding `DB` du manifeste `.openai/hosting.json` du service : `d1` vaut `DB`, `r2` vaut `null`, et `project_id` conserve l'identité ci-dessus.
5. Le wrapper serveur doit appeler `handleDirectory(request, env.DB)` et exporter les méthodes HTTP `GET`, `POST`, `PUT`, `DELETE` et `OPTIONS` sur `/v1/[...path]`. Les routes publiques n'appellent pas les helpers de connexion ChatGPT.
6. Exécuter les tests, le typecheck et la construction Vinext du service, puis vérifier le Worker construit et les migrations sur D1 local. Publier la nouvelle version par le flux Sites natif du projet existant ; le déploiement applique les migrations de production.
7. Vérifier `/v1/health`, les réponses CORS et une vraie recherche depuis le client publié. Reporter ici le nouveau commit source de référence après publication.

Ce package ne lance pas `wrangler deploy`, ne crée pas de projet Sites et ne provisionne pas lui-même une base. Le déploiement GitHub Pages du jeu et celui de l'annuaire sont deux opérations distinctes. Aucun secret fournisseur ou identifiant TURN permanent n'est nécessaire dans ce miroir.

## Comportement du service

Le protocole `4` et la version de règles `18` sont obligatoires. La recherche privilégie les salons en attente ; les parties démarrées doivent avoir au moins trois minutes restantes et moins de 75 % de leur durée écoulée. La même langue est recherchée d'abord, puis le client élargit après quatre secondes. Le nombre d'humains et la présence la plus récente départagent les salons.

Les hôtes envoient un heartbeat toutes les dix secondes. Leur présence expire après trente-cinq secondes et une réservation dure quarante-cinq secondes. L'allocation utilise une seule instruction SQLite `INSERT ... SELECT ... RETURNING` pour éviter les courses sur une place. Une réservation admise reste comptée jusqu'à ce qu'un heartbeat inclue son identité dans les membres du salon. Les réservations en attente restent protégées pendant les mises à jour normales.

Les capacités d'hôte et de réservation sont aléatoires ; seules leurs empreintes sont stockées. Le service limite les corps JSON à 8 Kio, valide les entrées et applique des limites de débit avec des empreintes d'IP à courte durée. Il autorise CORS depuis le site Money Tour, sa propre origine et les origines locales utilisées par Capacitor et la recette. Il ne publie aucune liste complète de salons et ne certifie pas qu'un hôte inconnu est honnête : la validation du jeu reste dans le protocole des pairs.
