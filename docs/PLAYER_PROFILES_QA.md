# Recette des profils et de l’archipel

Les profils reprennent les concepts PC et mobile fournis : médaillons ronds, contours colorés, surfaces crème, chiffres contrastés et fiche de détails. La composition réserve des emplacements distincts aux profils, au plateau et aux commandes. La partie s’ouvre en vue globale ; le suivi du pion, le zoom et le déplacement restent disponibles.

## Relancer la recette

```powershell
corepack pnpm check
corepack pnpm format:check
corepack pnpm qa:profiles
corepack pnpm qa:scene
```

`qa:profiles` charge de vraies sauvegardes validées par le moteur et les règles courantes, puis ouvre la partie par « Reprendre ma partie ». La matrice couvre 20 scénarios en français et en anglais : 2 ou 4 joueurs, équipes, bot, faillite, assurance, taxe, noms longs, gros soldes, nombreuses propriétés, texte agrandi et mouvement réduit. Les fenêtres vont de 320 × 740 à 1920 × 1080, avec deux paysages mobiles, tablettes et petites fenêtres PC.

Les captures initiales montrent la partie en cours. Pour les contrôles détaillés de focus et d’accessibilité, le script utilise ensuite le bouton Pause local : le délai normal de décision ne peut pas provoquer un lancer automatique pendant l’audit. Les gestes réactivent la partie par le bouton Reprendre.

Vérifications automatiques : profils hors du plateau, géométrie des cases entièrement visible au lancement, portraits centrés dans leurs médaillons, chargement de la variante de décor appropriée, absence de débordement horizontal, commandes visibles d’au moins 44 px, toutes les propriétés accessibles dans la fiche, fermeture par Échap/bouton/fond, maintien et restitution du focus. Les audits axe ciblent les nouveaux profils et leurs fiches.

`qa:scene` vérifie aussi l’aperçu 3D d’accueil, la sélection de propriétés et de bonus, le filtre des biens, le clavier, le suivi/vue globale, le zoom à 400 %, le pincement et le déplacement via de véritables événements tactiles Chromium, le recentrage et un lancer qui fait avancer le moteur.

## Rejouer sur GitHub Pages

```powershell
$env:PROFILE_QA_URL='https://virtuel21.github.io/money-tour/'
$env:PROFILE_QA_PROFILE='public'
$env:PROFILE_QA_OUT='../../outputs/recette-profils/public'
corepack pnpm qa:profiles
$env:SCENE_QA_URL='https://virtuel21.github.io/money-tour/'
$env:SCENE_QA_OUT='../../outputs/recette-profils/public-interactions'
corepack pnpm qa:scene
```

Le profil public sélectionne neuf scénarios représentatifs. Les résultats JSON, captures et rapport visuel sont livrés dans `outputs/recette-profils`. Les décors PNG natifs et [prompts exacts](ARCHIPELAGO_ART.md) sont conservés pour permettre de futures variantes.

Cette recette utilise Chromium avec fenêtres et événements tactiles simulés. Elle ne constitue pas un essai sur un téléphone Android/iOS physique, ni une validation Safari ou de plusieurs réseaux Internet.
