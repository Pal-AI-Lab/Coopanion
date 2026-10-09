import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const fr: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} veut utiliser votre ordinateur : regarder l'écran et utiliser la souris et le clavier. D'accord pour cette fois ?`,
    once: (who: string, minutes: number) => `${who} veut utiliser votre souris et votre clavier. D'accord pour les ${minutes} prochaines minutes ?`,
    acting: (who: string) => `${who} veut utiliser votre souris et votre clavier. D'accord pour cette fois ?`,
    caption: "Contrôle de l'ordinateur",
    yes: 'Oui',
    no: 'Non',
  },

  preflight: {
    noDisplay: "Le World de contrôle de l'ordinateur nécessite X11 sous Linux (ou XWayland sous Wayland) : DISPLAY n'est pas défini.",
    unsupported: "Le World de contrôle de l'ordinateur ne fonctionne que sous Windows, macOS et Linux.",
  },

  console: {
    label: "Contrôle de l'ordinateur",
    engine: "Moteur d'entrée",
    screen: (w: number, h: number) => `Écran ${w}×${h}`,
    onDemand: 'Démarre au besoin',
    exited: (code: number | null) => `Le processus du moteur s'est arrêté (code de sortie ${code})`,
    control: 'Contrôle',
    allowed: 'Autorisé',
    viewOnly: 'Regarder seulement',
    asking: 'Demande',
    levels: { 'ask-each-turn': 'À chaque tour', 'ask-before-acting': "Avant d'agir", 'ask-once': (minutes: number) => `Une fois par ${minutes} min`, 'never-ask': 'Jamais' },
    envPrompt: { title: "Environnement de contrôle de l'ordinateur", description: "Coordonnées des captures d'écran, règles pour ne pas gêner la personne, et ce qui est permis." },
    vars: {
      'cua.os': 'Le système de cet ordinateur : Windows ou Mac',
      'cua.keys': 'Raccourcis courants sur ce système',
      'cua.shot': "Taille des captures d'écran",
      'cua.control': 'Si la souris et le clavier peuvent être utilisés',
      'cua.idle': 'Combien de temps laisser la main (secondes)',
      'cua.permission': "Quand demander d'abord à la personne (d'après le réglage permission)",
    },
  },

  config: {
    group: "Contrôle de l'ordinateur",
    control: { title: 'Autoriser la souris et le clavier', description: "Désactivé : seulement les captures d'écran et la liste des fenêtres." },
    permission: { title: "Quand vous demander d'abord", description: "ask-each-turn : demande avant de regarder l'écran ou d'agir, à chaque tour ; ask-before-acting : regarder est libre, demande avant d'utiliser la souris et le clavier à chaque tour ; ask-once : regarder est libre, demande une fois avant d'utiliser la souris et le clavier, et un oui vaut pendant « Durée d'un oui » ; never-ask : ne demande jamais." },
    grantMinutes: { title: "Durée d'un oui", suffix: 'min', description: 'Pour ask-once uniquement.' },
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
