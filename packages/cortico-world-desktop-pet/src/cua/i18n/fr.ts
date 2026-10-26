import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const fr: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} veut utiliser votre ordinateur : regarder l'écran et utiliser la souris et le clavier. D'accord pour cette fois ?`,
    once: (who: string, minutes: number) => `${who} veut utiliser votre souris et votre clavier. D'accord pour les ${minutes} prochaines minutes ?`,
    acting: (who: string) => `${who} veut utiliser votre souris et votre clavier. D'accord pour cette fois ?`,
    caption: "Contrôle de l'ordinateur",
    yes: 'Oui',
    no: 'Pas cette fois',
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} veut saisir dans la fenêtre de terminal « ${window} » :\n${text}\nCe texte peut être exécuté comme une commande. Après un oui, la saisie et les touches dans un terminal ainsi que win+r ne sont plus demandées pendant ${minutes} min. D'accord ?`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} veut appuyer sur ${keys} dans la fenêtre de terminal « ${window} ». Après un oui, la saisie et les touches dans un terminal ainsi que win+r ne sont plus demandées pendant ${minutes} min. D'accord ?`,
      runBox: (who: string, keys: string, minutes: number) => `${who} veut appuyer sur ${keys} pour ouvrir la boîte Exécuter, qui peut lancer des programmes ou des commandes. Après un oui, la saisie et les touches dans un terminal ainsi que win+r ne sont plus demandées pendant ${minutes} min. D'accord ?`,
    },
  },

  preflight: {
    noDisplay: "Le contrôle de l'ordinateur nécessite X11 sous Linux (ou XWayland sous Wayland) : DISPLAY n'est pas défini.",
    unsupported: "Le contrôle de l'ordinateur ne fonctionne que sous Windows, macOS et Linux.",
  },

  console: {
    engine: "Moteur d'entrée",
    screen: (w: number, h: number) => `Écran ${w}×${h}`,
    onDemand: 'Démarre au besoin',
    exited: (code: number | null) => `Le processus du moteur s'est arrêté (code de sortie ${code})`,
    allowed: 'Autorisé',
    viewOnly: 'Regarder seulement',
    asking: 'Demande',
    levels: { 'ask-each-turn': 'À chaque tour', 'ask-before-acting': "Avant d'agir", 'ask-once': (minutes: number) => `Une fois par ${minutes} min`, 'never-ask': 'Jamais' },
  },

  config: {
    group: "Contrôle de l'ordinateur",
    enabled: { title: "Activer le contrôle de l'ordinateur" },
    control: { title: 'Autoriser la souris et le clavier', description: "Désactivé : seulement les captures d'écran et la liste des fenêtres." },
    permission: { title: 'Quand vous demander', description: "ask-each-turn : demande avant de regarder l'écran ou d'agir, à chaque tour ; ask-before-acting : regarder est libre, demande avant d'utiliser la souris et le clavier à chaque tour ; ask-once : regarder est libre, demande une fois avant d'utiliser la souris et le clavier, et un oui vaut pendant « Un oui vaut » ; never-ask : ne demande jamais. Sauf si « Désactiver la question avant le terminal et Exécuter » est activé, quel que soit le réglage, une saisie ou une touche dans un terminal et win+r sont demandées une fois à part, et un oui vaut pendant « Un oui vaut »." },
    grantMinutes: { title: 'Un oui vaut', suffix: 'min', description: 'Pour ask-once et pour la question à part sur les terminaux.' },
    skipTerminalAsk: { title: 'Désactiver la question avant le terminal et Exécuter', description: "Activé, la saisie ou les touches dans un terminal et win+r n'ont plus de question à part et suivent « Quand vous demander » comme toute autre action. Avec never-ask, Coo peut alors lancer des commandes sans vous demander." },
    userIdleMs: { title: 'Vous laisser la main pendant', description: "Après que vous avez utilisé la souris ou le clavier, attend qu'ils soient restés immobiles aussi longtemps." },
    maxYieldWaitMs: { title: 'Attente maximale pour vous' },
    maxWidth: { title: 'Largeur max. des captures' },
    maxHeight: { title: 'Hauteur max. des captures' },
    quality: { title: 'Qualité des captures' },
    afterAction: { title: 'Capture après chaque action' },
    settleMs: { title: 'Attente avant la capture' },
  },
};

export default fr;
