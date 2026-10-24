import { config, createGame, createRng, reduceGame, type GameState } from '@money-tour/engine';

export const lessons = [
  {
    id: 'welcome',
    title: 'Bienvenue à bord',
    text: 'Faites une partie guidée avec Sacha. Chaque escale vous laisse essayer une fonction du vrai jeu. Vos parties et votre argent restent intacts. Vous pouvez revenir en arrière, choisir une leçon ou quitter à tout moment.',
    task: 'Touchez votre compte en surbrillance.',
    target: 'accounts',
  },
  {
    id: 'roll',
    title: 'À vous de lancer',
    text: 'Le bandeau indique qui joue. Lancez deux dés et avancez de leur somme. Un double donne un nouveau lancer à la fin de votre tour de jeu ; trois doubles successifs vous envoient sur l’Île perdue. Ici, les dés sont préparés pour vous faire découvrir Madrid.',
    task: 'Lancez les dés.',
    target: 'action',
  },
  {
    id: 'buy',
    title: 'Votre première ville',
    text: `Chaque option indique son loyer. Dans une partie, choisissez le terrain seul ou des maisons : Acheter acquiert tout en une fois au prix total affiché. L’hôtel attend ${config.hotelUnlockLaps ?? 0} tours complets du plateau. Ici, commencez par le terrain ; la leçon Construire vous fera ajouter une maison. Fermer permet de regarder le plateau ; Acheter rouvre l’offre et Passer termine la décision.`,
    task: 'Achetez Madrid ou essayez de passer.',
    target: 'action',
  },
  {
    id: 'rent',
    title: 'Vos villes travaillent pour vous',
    text: 'Sacha arrive sur votre ville : le loyer vous est versé automatiquement. Le montant sur la case suit les bâtiments et les bonus. Après paiement, un adversaire peut racheter une ville, même avec un hôtel, ou une île pour deux fois sa valeur foncière. Une assurance bloque ce rachat une fois.',
    task: 'Simulez la visite de Sacha et regardez les comptes.',
    target: 'action',
  },
  {
    id: 'build',
    title: 'Construire dès votre premier achat',
    text: `Vous pouvez construire sur Madrid sans posséder Barcelone. À chaque visite, la fenêtre vous laisse choisir le niveau final, jusqu’à trois maisons. Validez une seule fois : seuls les bâtiments manquants sont facturés. Il faut revenir sur la ville pour construire à nouveau. L’hôtel se débloque après ${config.hotelUnlockLaps ?? 0} tours complets du plateau. Les rues complètes servent toujours à gagner la partie.`,
    task: 'Construisez une maison à Madrid.',
    target: 'action',
  },
  {
    id: 'start',
    title: 'La prime de Départ',
    text: 'Chaque passage en avant par Départ rapporte 300. Les comptes se mettent à jour pendant le déplacement. Gardez du cash pour payer les loyers et les taxes : votre patrimoine comprend aussi vos biens, mais il ne remplace pas l’argent disponible.',
    task: 'Franchissez Départ et observez votre compte.',
    target: 'action',
  },
  {
    id: 'resorts',
    title: 'Les îles privées',
    text: 'Les îles s’achètent mais ne se construisent pas. Une, deux, trois ou quatre îles rapportent respectivement 50, 100, 200 ou 500 à chaque visite adverse. Posséder les quatre compte comme une rue complète pour la victoire par trois rues.',
    task: 'Achetez Bali.',
    target: 'action',
  },
  {
    id: 'card',
    title: 'Une carte, une surprise',
    text: 'Les cases Chance tirent une carte pour le joueur qui vient d’arriver. Lisez son effet puis touchez « J’ai lu · continuer ». Les cartes gardées, comme Squatteur ou Fraude fiscale, se retrouvent dans votre carnet.',
    task: 'Tirez puis fermez votre carte.',
    target: 'action',
  },
  {
    id: 'auction',
    title: 'Une offre vraiment secrète',
    text: 'Lors d’un appel d’offres, chacun choisit à son tour un montant dans la limite de son cash. Envoyez votre offre une seule fois : le dépouillement est automatique quand tous ont choisi. Seul le gagnant paie ; une égalité est départagée au hasard. Les montants ne figurent pas dans l’annonce publique.',
    task: 'Saisissez une offre et envoyez-la. Sacha participe automatiquement.',
    target: 'action',
  },
  {
    id: 'duel',
    title: 'Défier un adversaire',
    text: 'La case Duel remplace le Karma ; cette rencontre ne vient plus des cartes Chance. Proposez une mise à Sacha : chacun doit pouvoir payer la même somme. Après acceptation, choisissez secrètement pierre, feuille ou ciseaux, puis révélez. Le gagnant prend le pot ; une égalité relance les choix sans nouvelle mise jusqu’à un vainqueur. Refuser avant de miser ne coûte rien.',
    task: 'Proposez un duel et choisissez une main. La révélation est automatique.',
    target: 'action',
  },
  {
    id: 'casino',
    title: 'Une pause au casino',
    text: 'La roulette et la machine à sous se jouent sans mise. Choisissez rouge ou noir, ou lancez les rouleaux. Chaque gain vaut au moins 50. Le jackpot vaut 10 % de votre solde (minimum 50) et ses chances augmentent avec les visites. Vous pouvez aussi passer.',
    task: 'Essayez la roulette.',
    target: 'action',
  },
  {
    id: 'slots',
    title: 'Les rouleaux de la fortune',
    text: 'Le casino propose aussi une machine à sous, choisie au hasard à chaque visite. Son résultat et votre gain sont annoncés avant la reprise du tour. Les dés, cartes et casinos utilisent les mêmes règles en solo et entre amis.',
    task: 'Lancez les rouleaux.',
    target: 'action',
  },
  {
    id: 'insurance',
    title: 'Protéger une propriété',
    text: 'La case Assurance donne un jeton. Posez-le une seule fois sur un de vos biens. Il reste lié à ce bien et bloque une destruction (y compris un séisme), une expropriation ou un rachat hostile, puis disparaît. Il ne protège pas des cafards.',
    task: 'Choisissez Madrid parmi les cases éclairées.',
    target: 'board',
  },
  {
    id: 'attack',
    title: 'Les cartes offensives',
    text: 'Expropriation rend une ville adverse à la banque. Les cafards divisent le loyer d’un hôtel par deux pendant deux tours de jeu du propriétaire. Les cartes d’attaque financière prélèvent de l’argent ; seules les cibles autorisées sont éclairées.',
    task: 'Jouez Expropriation sur Rome.',
    target: 'board',
  },
  {
    id: 'squatter',
    title: 'Éviter un loyer',
    text: 'Avec Squatteur en réserve, le prélèvement attend votre décision. Utilisez la carte pour éviter ce loyer, ou payez et gardez-la pour une visite plus chère.',
    task: 'Utilisez Squatteur chez Sacha.',
    target: 'action',
  },
  {
    id: 'fraud',
    title: 'Acheter moins cher, avec un risque',
    text: 'Fraude fiscale permet d’acheter une ville à moitié prix. Jusqu’au prochain passage Départ, tomber sur Taxe vous coûte deux fois le prix normal de cette ville. Le risque restant est visible dans votre carnet.',
    task: 'Essayez l’achat avec Fraude fiscale.',
    target: 'action',
  },
  {
    id: 'tax',
    title: 'Taxes et manque de cash',
    text: 'Une case Taxe prélève 50 plus 10 % du patrimoine immobilier, avec le risque fiscal éventuel en supplément. La fenêtre annonce le prélèvement. Si le cash manque, vendez des propriétés à la banque pour la moitié de leur valeur.',
    task: 'Simulez un passage sur Taxe.',
    target: 'action',
  },
  {
    id: 'debt',
    title: 'Régler une dette',
    text: 'Le jeu vous laisse choisir les biens à vendre. La vente rembourse la dette dès que le compte suffit. La faillite intervient si votre cash et la valeur totale de revente ne couvrent pas le paiement.',
    task: 'Vendez Madrid pour rembourser les 100 dus.',
    target: 'board',
  },
  {
    id: 'island',
    title: 'Quitter l’Île perdue',
    text: 'Ce coin vous retient jusqu’à trois tentatives. Essayez un double, payez 200 ou utilisez un billet de sortie si vous en avez un. Le choix se fait dans les commandes de votre tour.',
    task: 'Payez le retour pour quitter l’île.',
    target: 'action',
  },
  {
    id: 'travel',
    title: 'Choisir votre destination',
    text: 'Le Tour du monde propose un voyage au prochain tour, ou dès votre action supplémentaire sur un double : 50 à la place des dés. Touchez une destination parmi les cases éclairées, même chez un adversaire pour tenter un rachat après le loyer. Vous pouvez aussi rester et lancer normalement.',
    task: 'Choisissez Madrid sur le plateau ou dans la liste.',
    target: 'board',
  },
  {
    id: 'championship',
    title: 'Organiser un Festival',
    text: 'Sur le coin Festival, choisissez une de vos villes ou îles et payez 50. Son loyer double pendant quatre retours de votre tour. Les doubles ne raccourcissent pas la durée. Un nouveau Festival renouvelle la durée sans cumuler le bonus.',
    task: 'Organisez le Festival à Madrid.',
    target: 'board',
  },
  {
    id: 'alliance',
    title: 'Une alliance temporaire',
    text: 'La carte Alliance vous donne 50 % des gains du joueur choisi jusqu’à la fin de son prochain tour de jeu. Cette part est prélevée sur ses gains. Elle est distincte des équipes 2v2 choisies avant la partie.',
    task: 'Choisissez Sacha comme allié temporaire.',
    target: 'action',
  },
  {
    id: 'carnet',
    title: 'Votre carnet et votre objectif secret',
    text: 'Le carnet regroupe vos villes, bonus, objectif secret et règle spéciale. Sur téléphone, utilisez ses onglets. Réaliser votre objectif secret rapporte 100. Vous pouvez le révéler puis le masquer ; les autres joueurs ne le voient pas sur leur écran.',
    task: 'Ouvrez Objectif puis révélez et masquez votre objectif.',
    target: 'action',
  },
  {
    id: 'adventure',
    title: 'Chaque voyage a sa règle',
    text: 'Une règle spéciale est tirée : villes jumelles aux loyers doublés, festivals, héritage de départ, marché aux enchères au tour de table 10 ou capitale mystère rapportant 200 en fin de partie. Une crise rare peut diviser les loyers par deux pendant un tour de table : jamais avant le sixième, au plus deux par partie et espacées de huit tours de table.',
    task: 'Consultez la règle de cette simulation.',
    target: 'action',
  },
  {
    id: 'controls',
    title: 'Se repérer pendant la partie',
    text: 'Touchez un compte pour repérer les biens de ce joueur et une case du plateau pour la lire. Vue globale se trouve dans la barre du haut. Le chrono laisse 30 secondes par décision, après les animations. En ligne, un bot peut prendre le relais ; Reprendre mon siège rend la main dans le même navigateur. Les réglages contrôlent son et animations ; la pause est réservée au local.',
    task: 'Essayez Vue globale ou touchez une case du plateau.',
    target: 'action',
  },
  {
    id: 'teams',
    title: 'Jouer ensemble ou chacun pour soi',
    text: 'En solo, les bots jouent les autres sièges. En local, passez l’appareil au joueur indiqué. En 2v2, les sièges 1 et 3 affrontent 2 et 4 : aucun loyer entre alliés, collections communes pour la victoire, cash individuel. En ligne, l’hôte partage un lien ; les invités entrent leur nom puis rejoignent le salon.',
    task: 'Repérez les deux équipes.',
    target: 'accounts',
  },
  {
    id: 'victory',
    title: 'Prêt pour votre vrai voyage',
    text: 'Gagnez en réunissant trois rues complètes (les quatre îles comptent comme une rue), toutes les propriétés achetables d’un côté (île comprise), ou en restant le dernier joueur solvable. À la fin du chrono, le plus grand patrimoine gagne ; une égalité est partagée. Vous pouvez relancer ce tutoriel depuis Comment jouer.',
    task: 'Consultez les patrimoines, puis terminez le tutoriel.',
    target: 'accounts',
  },
] as const;
export type LessonId = (typeof lessons)[number]['id'];
/** Five real actions; the complete reference remains available at any time. */
export const quickLessons = (['roll', 'buy', 'build', 'rent', 'victory'] as const).map((id) =>
  lessons.find((lesson) => lesson.id === id)!,
);

/** Deliberately staged practice scenes, isolated from persistence and networking. */
export function tutorialScene(id: LessonId): GameState {
  const state = createGame({
    config: { ...config, shuffleStreets: false },
    players: [
      { id: 'p1', name: 'Vous' },
      { id: 'p2', name: 'Sacha' },
      ...(id === 'teams'
        ? [
            { id: 'p3', name: 'Lou' },
            { id: 'p4', name: 'Noa' },
          ]
        : []),
    ],
    seed: 'guided-tour',
  });
  for (const property of Object.values(state.properties)) property.ownerId = null;
  state.adventure = { twist: 'inheritance', round: 1, tenderRound: 5, tenderDone: true };
  state.festivals = [];
  const player = state.players[0]!;
  player.laps = 1;
  const own = (tile: number, ownerId = 'p1', level = 0) => {
    state.properties[tile] = { ownerId, level, championships: 0 };
  };
  const hold = (card: string) => {
    state.deck = state.deck.filter((c) => c !== card);
    player.heldCards = [card];
  };
  const land = (target: number) => {
    const result = reduceGame(state, { type: 'roll', playerId: 'p1' }, createRng('lesson-roll'));
    const dice = result.events.find((event) => event.type === 'dice')!.dice!;
    player.position =
      (target - dice.reduce((a, b) => a + b, 0) + state.config.board.length) %
      state.config.board.length;
  };
  if (['buy', 'build', 'resorts', 'fraud'].includes(id)) {
    state.phase = 'property';
    player.position = id === 'resorts' ? 4 : 5;
  }
  if (
    [
      'build',
      'rent',
      'insurance',
      'debt',
      'championship',
      'carnet',
      'controls',
      'victory',
    ].includes(id)
  ) {
    own(5);
    own(6);
  }
  if (id === 'build') state.properties[6]!.ownerId = null;
  if (id === 'roll') land(5);
  if (id === 'start') land(2);
  if (id === 'rent') {
    state.currentPlayer = 1;
    // Both players use the same deterministic dice stream.
    const probe = reduceGame(state, { type: 'roll', playerId: 'p2' }, createRng('lesson-roll'));
    state.players[1]!.position =
      (5 - probe.events.find((e) => e.type === 'dice')!.dice!.reduce((a, b) => a + b, 0) + 32) % 32;
  }
  if (id === 'card') {
    state.deck = ['chance-01', ...state.deck.filter((c) => c !== 'chance-01')];
    land(15);
  }
  if (id === 'auction') {
    state.phase = 'auction';
    state.auction = {
      id: 'tutorial-auction',
      tile: 5,
      kind: 'tender',
      resume: 'roll',
      participants: ['p1', 'p2'],
      stage: 'commit',
      commitments: {},
      bids: {},
      passed: [],
    };
  }
  if (id === 'duel') {
    state.phase = 'duel';
    state.duel = {
      id: 'tutorial-duel',
      challengerId: 'p1',
      amount: 0,
      stage: 'offer',
      commitments: {},
      reveals: {},
      escrow: false,
    };
  }
  if (id === 'casino' || id === 'slots') {
    state.phase = 'casino';
    player.position = 7;
    state.casino = {
      tile: player.position,
      game: id === 'casino' ? 'roulette' : 'slots',
      chance: 50,
    };
  }
  if (id === 'insurance') {
    state.phase = 'end';
    player.insurance = { tile: null };
  }
  if (id === 'attack') {
    state.phase = 'attack';
    own(9, 'p2');
    state.pendingAttack = 'chance-20';
    state.deck = state.deck.filter((c) => c !== 'chance-20');
    state.discard.push('chance-20');
  }
  if (id === 'squatter') {
    own(9, 'p2');
    player.position = 9;
    state.phase = 'rent';
    state.pendingRent = { tile: 9, amount: 20, creditorId: 'p2' };
    hold('chance-19');
  }
  if (id === 'fraud') hold('chance-22');
  if (id === 'tax') land(31);
  if (id === 'debt') {
    player.cash = 5000;
    state.phase = 'debt';
    state.properties[5]!.level = 2;
    state.debt = {
      playerId: 'p1',
      creditorId: 'p2',
      amount: 100,
      reason: 'rent',
      continuation: 'property',
    };
  }
  if (id === 'island') {
    state.phase = 'island';
    player.position = 8;
    player.islandTurns = 0;
  }
  if (id === 'travel') {
    state.phase = 'travel';
    player.position = 24;
    player.travelPending = true;
  }
  if (id === 'championship') {
    state.phase = 'championship';
    player.position = 16;
  }
  if (id === 'alliance') state.phase = 'alliance';
  if (id === 'teams') {
    state.mode = 'teams';
    state.players.forEach((p, i) => {
      p.team = i % 2;
    });
  }
  return state;
}
