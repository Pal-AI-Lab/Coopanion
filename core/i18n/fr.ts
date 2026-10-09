import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const fr: Translation<CoreText> = {
  settings: {
    language: { title: 'Langue', description: 'La fenêtre des paramètres, les bulles et le menu du compagnon utilisent cette langue, et Coo vous parle dans cette langue. Prend effet immédiatement.' },
    telemetry: { title: "Statistiques d'utilisation anonymes", description: "Envoie des comptages d'utilisation et les réglages, jamais les conversations, pour aider à améliorer Coopanion. Les champs sont listés dans docs/TELEMETRY.md." },
    roundsSoft: { title: 'Rappel de conclusion', suffix: 'requêtes', description: "Après ce nombre de requêtes au modèle dans un même réveil, Coo est invité à finir ce qu'il fait et à terminer le tour." },
    roundsHard: { title: 'Requêtes par réveil', suffix: 'requêtes', description: 'Le maximum de requêtes au modèle dans un même réveil ; le tour se termine quand il est atteint.' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `Mes ${n} dernières requêtes au modèle ont échoué. Erreur${status ? ` ${status}` : ''} : ${reason}. Vérifiez le nom du modèle et l'API Key sur la page Accueil des paramètres, où vous pouvez tester la connexion.`,
    open: 'Ouvrir les paramètres',
    ok: 'OK',
  },

  update: {
    downloading: (v: string) => `La version ${v} est sortie et se télécharge en arrière-plan ; je vous préviens quand elle est prête. Si le téléchargement bloque, vous pouvez la récupérer vous-même sur GitHub.`,
    ready: (v: string) => `La version ${v} est téléchargée. Redémarrer pour mettre à jour maintenant ? Sinon, elle s'installera la prochaine fois que vous quitterez l'application.`,
    failed: (v: string, why: string) => `La version ${v} ne s'est pas téléchargée : ${why}. Vous pouvez la récupérer vous-même sur GitHub.`,
    ok: 'OK', github: 'Télécharger sur GitHub', install: 'Redémarrer et mettre à jour', later: 'Plus tard', gotIt: 'OK',
  },

  quit: "Quitter l'application",
  cuaYes: 'Oui',
  cuaNo: 'Pas cette fois',

  status: {
    read: 'Lit', browse: 'Parcourt', memory: 'mémoire', find: 'Cherche', search: 'Recherche', write: 'Écrit', edit: 'Modifie', append: 'Complète',
    delete: 'Supprime', save: 'Enregistre', screen: "Regarde l'écran", windows: 'Regarde les fenêtres ouvertes', rightClick: 'Fait un clic droit', doubleClick: 'Double-clique', click: 'Clique',
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
    hello: "Bonjour ! Je suis Coo, et j'habite désormais en bas de votre écran. Coo...",
    helloReply: 'Bonjour, Coo !',
    askName: 'Comment dois-je vous appeler ?',
    nameSend: 'Va pour ce nom',
    gotName: (name: string) => `${name}, c'est noté !`,
    askSource: 'Où avez-vous entendu parler de moi ?',
    sourceThanks: 'Ah, je vois. Coo...',
    askRoam: "La plupart du temps, je reste tranquille ou je bouge beaucoup ? Cliquez sur l'une des cartes pour voir ce que je ferais.",
    roam: {
      off: { label: 'Reste sur place', level: 'Faible', line: "Alors je reste immobile et je bouge quand vous m'appelez." },
      calm: { label: 'De temps en temps', level: 'Moyen', line: 'Je ferai un petit tour de temps en temps et je resterai tranquille la plupart du temps.' },
      free: { label: 'Souvent', level: 'Élevé', line: 'Je peux courir partout. Coo... !' },
    },
    roamOk: 'Comme ça',
    roamDone: "D'accord, je ferai comme ça.",

    askVendor: (first: string) => `Pour discuter avec vous, je dois me connecter à un modèle. Quel service dois-je utiliser ? Dans le doute, choisissez ${first}.`,
    vendorOk: 'Utiliser celui-ci',
    moreVendors: 'Plus…',
    pickModel: (model: string) => `Par défaut, j'utiliserai ${model} : il est bon marché et sait lire les images. Pour un autre modèle, saisissez plutôt son nom.`,
    modelOk: 'Utiliser celui-ci',
    askKey: (name: string) => `Collez ici votre API Key ${name}. C'est facturé à l'usage, alors surveillez les tokens.`,
    keySend: 'Connecter',
    keyLink: (name: string) => `Pas encore de clé ? Obtenez-en une chez ${name}`,
    keyLater: 'Plus tard',
    connecting: 'Connexion…',
    keyOk: (name: string, model: string) => `Connexion à ${name} réussie${model ? ` (${model})` : ''} ! Maintenant je peux parler. Coo...`,
    keyFail: (why: string) => `La connexion a échoué : ${why}. La clé est-elle complète, et reste-t-il du crédit sur le compte ? Essayez de la coller à nouveau.`,
    keyAlready: (connection: string) => `Un modèle est déjà connecté (${connection}). Facile. Coo...`,
    keySkipped: "Pas de souci ; je parlerai une fois que vous l'aurez ajoutée. Je vous redemanderai plus tard.",

    askModel: (name: string, mb: number) => `Pour comprendre ce que vous dites, je dois télécharger un modèle de reconnaissance vocale (${name}, environ ${mb} Mo). Le télécharger maintenant ?`,
    download: 'Télécharger',
    notNow: 'Pas maintenant',
    downloading: 'Téléchargement du modèle vocal. Coo...',
    downloaded: "C'est fait ! Maintenant je comprends ce que vous dites.",
    downloadFail: (why: string) => `Le téléchargement a échoué : ${why}. Vous pouvez réessayer sur la page Saisie vocale des paramètres.`,
    modelLater: "D'accord. Un clic sur la page Saisie vocale des paramètres suffira pour le télécharger plus tard.",
    talk: (hint: string) => `Pour me parler : ${hint}. `,
    talkOff: "La saisie vocale est désactivée ; vous pouvez l'activer sur la page Saisie vocale des paramètres. ",
    talkType: 'Vous pouvez aussi poser le pointeur sur moi et cliquer sur le bouton bulle à côté de moi pour écrire.',
    gotIt: 'Compris',
    buttons: 'Posez le pointeur sur moi et quelques boutons apparaissent à côté ; faites un clic droit sur moi pour le menu, avec pause, paramètres et quitter.',
    ok: 'OK',
    persona: 'Mon caractère et ma façon de parler sont écrits sur la page Prompt système de la fenêtre des paramètres. Pour me changer, modifiez-la, ou dites-le-moi simplement et je le changerai moi-même.',
    personaMark: 'Prompt système',
    personaOk: 'Entendu',
    finish: MAC
      ? 'Tout est prêt ! Mon icône est aussi dans la barre des menus ; cliquez dessus pour changer les réglages.'
      : process.platform === 'linux'
        ? 'Tout est prêt ! Pour changer les réglages, faites un clic droit sur moi pour le menu ; si mon icône est dans la zone de notification, cliquer dessus marche aussi.'
        : 'Tout est prêt ! Mon icône est aussi dans la zone de notification, en bas à droite de la barre des tâches ; cliquez dessus pour changer les réglages.',
    go: "C'est parti",
    dress: "Habillez-moi d'abord",
    closed: "D'accord, arrêtons-nous là. Pour réentendre mon introduction, ouvrez les paramètres et cliquez sur « Guide » dans la page Accueil.",

    askFirst: "Aucun modèle n'est encore connecté ; je pourrai parler une fois une API Key ajoutée. Quel service dois-je utiliser ?",
    askAgain: 'Toujours aucun modèle connecté ; ajoutez une API Key et je pourrai vous tenir compagnie. Quel service dois-je utiliser ?',
    askLater: 'Plus tard',
    noModel: "Aucun modèle n'est connecté. En connecter un maintenant ?",
    noModelGo: 'Connecter',
    noModelLater: 'Plus tard',
  },
};

export default fr;
