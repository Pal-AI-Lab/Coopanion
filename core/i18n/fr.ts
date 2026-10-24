import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const fr: Translation<CoreText> = {
  settings: {
    language: { title: 'Langue', description: "L'interface et Coo utilisent cette langue. Prend effet immédiatement." },
    telemetry: { title: "Statistiques d'utilisation anonymes", description: "Envoie des comptages d'utilisation et les réglages, jamais les conversations, pour aider à améliorer Coopanion. Les champs sont listés dans docs/TELEMETRY.md." },
    contextRing: { title: 'Anneau de contexte', description: 'Affiche dans la zone de saisie de la page Discussion un anneau indiquant combien il reste avant la mise en ordre de la conversation précédente.' },
    roundsSoft: { title: 'Rappel de conclusion', suffix: 'requêtes', description: "Après ce nombre de requêtes au modèle dans un même réveil, un rappel demande à Coo de conclure ce qui est en cours et de terminer le tour." },
    roundsHard: { title: 'Requêtes par réveil', suffix: 'requêtes', description: 'Le maximum de requêtes au modèle dans un même réveil ; le tour se termine quand il est atteint.' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `Mes ${n} dernières requêtes au modèle ont échoué. Erreur${status ? ` ${status}` : ''} : ${reason}. Vérifiez le nom du modèle et l'API Key sur la page Accueil des paramètres, où vous pouvez tester la connexion.`,
    reasoningReplay: (n: number) => `Mes ${n} dernières requêtes au modèle ont échoué : ce service exige que la réflexion soit renvoyée avant chaque appel d'outil, et Coopanion a désactivé cela pour lui. Merci de le signaler aux développeurs : https://github.com/Pal-AI-Lab/Coopanion/issues`,
    open: 'Ouvrir les paramètres',
    ok: 'OK',
  },

  update: {
    downloading: (v: string) => `La version ${v} est sortie et se télécharge en arrière-plan ; je vous préviens quand elle est prête.`,
    ready: (v: string) => `La version ${v} est téléchargée. Redémarrer pour mettre à jour maintenant ? Sinon, elle s'installera la prochaine fois que vous quitterez l'application.`,
    failed: (v: string, why: string) => `La version ${v} ne s'est pas téléchargée : ${why}. Vous pouvez la récupérer vous-même sur GitHub.`,
    ok: 'OK', github: 'Télécharger sur GitHub', install: 'Redémarrer et mettre à jour', later: 'Plus tard', gotIt: 'OK',
    trouble: 'Un problème ?', githubByHand: 'Télécharger manuellement sur GitHub',
  },

  quit: "Quitter l'application",

  noticeLabel: "Notifications de l'app",

  status: {
    read: 'Lit', browse: 'Parcourt', memory: 'mémoire', find: 'Cherche', search: 'Recherche', write: 'Écrit', edit: 'Modifie', append: 'Complète',
    delete: 'Supprime', moveFile: 'Déplace', save: 'Enregistre', screen: "Regarde l'écran", windows: 'Regarde les fenêtres ouvertes', rightClick: 'Fait un clic droit', doubleClick: 'Double-clique', click: 'Clique',
    move: 'Déplace la souris', drag: 'Fait glisser', scroll: 'Fait défiler', focus: 'Change de fenêtre', type: 'Tape', key: 'Appuie sur', wait: 'Attend',
    alarmSet: 'Règle une alarme', alarmList: 'Consulte les alarmes', alarmCancel: 'Annule une alarme',
    quoted: (text: string) => `« ${text} »`,
    seconds: (n: number) => `${n} s`,
    minutesLater: (n: number) => `dans ${n} min`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `Appliqué quand le compagnon passe à « ${preset} » de ${figure}`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['Un ami', 'friend'], ['Ailleurs', 'other'], ['Je préfère ne pas le dire', 'skip']],
    hello: "Salut ! Moi c'est Coo, et j'habite en bas de ton écran maintenant. Coo...",
    helloReply: 'Salut, Coo !',
    askName: "Je t'appelle comment ?",
    nameSend: 'Va pour ce nom',
    gotName: (name: string) => `${name}, c'est noté !`,
    askSource: 'Où est-ce que tu as entendu parler de moi ?',
    sourceThanks: 'Ah, je vois. Coo...',
    askPersona: 'À ton avis, je devrais être...',
    personas: {
      coo: { label: 'Petit et curieux', line: "Qu'est-ce que c'est ? Je vais jeter un œil. Coo..." },
      grail: { label: 'Collant et gourmand', line: "Tu manges quoi ? Donne-m'en une bouchée, allez. Coo..." },
      forge: { label: 'Fiable et efficace', line: "Qu'est-ce qu'il y a à faire ? Laisse-moi faire, j'en ai pour une minute. Coo." },
      heart: { label: 'Enjoué, toujours là', line: 'Me voilà ! Je reste avec toi toute la journée. Coo !' },
      winter: { label: 'Calme et taciturne', line: '...Mm. Coo.' },
      whale: { label: 'DeepSeek Chan', line: "Bon retour ! Qu'est-ce que c'est ? Fais voir. Coo..." },
    },
    dressHint: { text: 'Tu peux changer les couleurs dans Habillage', dress: 'Habillage' },
    askRoam: "D'habitude, tu préfères que je reste tranquille ou que je bouge beaucoup ? Clique sur une carte pour voir ce que je fais.",
    roam: {
      off: { label: 'Reste sur place', level: 'Faible', line: "Alors je reste bien sage et je bouge quand tu m'appelles." },
      calm: { label: 'De temps en temps', level: 'Moyen', line: 'Je ferai un petit tour de temps en temps et je resterai tranquille le reste du temps.' },
      free: { label: 'Souvent', level: 'Élevé', line: 'Je peux courir partout. Coo... !' },
    },
    roamOk: 'Comme ça',
    roamDone: "D'accord, je ferai comme ça.",
    wakeTitle: 'Mode de réponse',
    askWake: 'Mode de réponse : quand tu me donnes un petit coup, me caresses ou me soulèves, quand est-ce que je te réponds ?',
    wake: {
      none: { label: 'Calme', note: 'Les contacts sont notés et reçoivent une réponse groupée la prochaine fois que tu parles' },
      poke: { label: 'Par défaut', note: "Ne répond qu'aux petits coups" },
      all: { label: 'Réactif', note: 'Répond à tous les contacts' },
    },

    askVendor: (first: string) => `Pour discuter avec toi, je dois me connecter à un modèle. On utilise quel service ? Si tu hésites, prends ${first}.`,
    vendorOk: 'Utiliser celui-ci',
    moreVendors: 'Plus…',
    pickModel: (model: string) => `Par défaut, j'utilise ${model} : il n'est pas cher et sait lire les images. Si tu veux un autre modèle, mets son nom à la place.`,
    modelOk: 'Utiliser celui-ci',
    askKey: (name: string) => `Colle ton API Key ${name} ici. C'est facturé à l'usage, alors fais attention aux tokens.`,
    keySend: 'Connecter',
    keyLink: (name: string) => `Pas encore de clé ? Obtiens-en une chez ${name}`,
    keyLater: 'Plus tard',
    connecting: 'Connexion…',
    keyOk: (name: string, model: string) => `Connecté à ${name}${model ? ` (${model})` : ''} ! Maintenant je peux parler. Coo...`,
    keyFail: (why: string) => `Ça ne s'est pas connecté : ${why}. Vérifie si la clé est complète et s'il reste du crédit sur le compte, puis réessaie de la coller.`,
    chatgptAsk: 'Appuie sur le bouton ci-dessous et connecte-toi à ton compte ChatGPT dans le navigateur. Ce que je dis compte dans ton forfait ChatGPT, alors pense à surveiller ton quota.',
    chatgptGo: 'Continuer avec ChatGPT',
    chatgptWaiting: "Finis de te connecter dans le navigateur et reviens, je t'attends ici.",
    chatgptFail: (why: string) => `La connexion n'a pas marché : ${why}. On réessaie ?`,
    keyAlready: (connection: string) => `Un modèle est déjà connecté (${connection}). Pratique. Coo...`,
    keySkipped: "Pas de souci, je parlerai quand tu l'auras mise. Je te redemanderai plus tard.",

    askModel: (name: string, mb: number) => `Pour comprendre ce que tu dis, je dois télécharger un modèle de reconnaissance vocale (${name}, environ ${mb} Mo). On le télécharge maintenant ?`,
    download: 'Télécharger',
    notNow: 'Pas maintenant',
    downloading: 'Je télécharge le modèle vocal. Coo...',
    downloaded: "C'est bon ! Maintenant je comprends ce que tu dis.",
    downloadFail: (why: string) => `Le téléchargement a échoué : ${why}. Tu pourras réessayer sur la page Saisie vocale des paramètres.`,
    modelLater: "D'accord. Un clic sur la page Saisie vocale des paramètres suffira pour le télécharger plus tard.",
    talk: (hint: string) => `Pour me parler : ${hint}. `,
    talkOff: "La saisie vocale est désactivée ; tu peux l'activer sur la page Saisie vocale des paramètres. ",
    talkType: "Tu peux aussi poser le pointeur sur moi et cliquer sur le bouton bulle à côté pour m'écrire.",
    gotIt: 'Compris',
    buttons: 'Pose le pointeur sur moi et quelques boutons apparaissent à côté ; fais un clic droit sur moi pour ouvrir le menu, avec pause, paramètres et quitter.',
    ok: 'OK',
    persona: 'Mon caractère et ma façon de parler sont écrits sur la page Prompt système des paramètres. Pour me changer, modifie-la là-bas, ou dis-le-moi directement et je le ferai moi-même.',
    personaMark: 'Prompt système',
    personaOk: 'Entendu',
    finish: MAC
      ? "Tout est prêt ! Mon icône est aussi dans la barre des menus ; clique dessus si tu veux changer les réglages."
      : process.platform === 'linux'
        ? 'Tout est prêt ! Pour changer les réglages, fais un clic droit sur moi pour ouvrir le menu ; si mon icône est dans la zone de notification, tu peux aussi cliquer dessus.'
        : 'Tout est prêt ! Mon icône est aussi dans la zone de notification, en bas à droite de la barre des tâches ; clique dessus si tu veux changer les réglages.',
    go: "C'est parti",
    dress: "Habille-moi d'abord",
    closed: "D'accord, on s'arrête là pour l'instant. Pour réentendre ma présentation, ouvre les paramètres et clique sur « Guide » dans la page Accueil.",

    askFirst: "Je ne suis pas encore connecté à un modèle ; ajoute une API Key pour que je puisse te parler. On utilise quel service ?",
    askAgain: 'Toujours pas de modèle connecté ; ajoute une API Key et je pourrai te tenir compagnie. On utilise quel service ?',
    askLater: 'Plus tard',
    noModel: "Aucun modèle n'est connecté. On en connecte un maintenant ?",
    noModelGo: 'Connecter',
    noModelLater: 'Plus tard',
  },
};

export default fr;
