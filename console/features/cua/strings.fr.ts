import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: "Contrôle de l'ordinateur",
  enabled: 'Laisser Coo utiliser cet ordinateur',
  enabledHint: "Désactivé, Coo ne peut ni voir l'écran ni toucher la souris et le clavier.",
  control: 'Autoriser la souris et le clavier',
  controlHint: "Désactivé, Coo peut seulement faire des captures d'écran et lister les fenêtres.",
  permission: 'Quand vous demander',
  levels: { 'ask-each-turn': 'À chaque tour', 'ask-before-acting': "Avant d'agir", 'ask-once': 'Une fois', 'never-ask': 'Jamais' },
  levelHints: {
    'ask-each-turn': "À chaque tour, Coo demande dans sa bulle avant de regarder l'écran ou d'utiliser la souris et le clavier pour la première fois.",
    'ask-before-acting': "Regarder se fait sans demander ; à chaque tour, Coo demande avant d'utiliser la souris et le clavier pour la première fois.",
    'ask-once': "Regarder se fait sans demander ; Coo demande une fois avant d'utiliser la souris et le clavier, puis, après un oui, plus pendant la durée réglée ci-dessous.",
    'never-ask': 'Coo ne demande jamais, ni pour regarder ni pour agir.',
  },
  grant: 'Un oui vaut',
  grantSuffix: 'minutes',
  grantBad: (min: number, max: number) => `Saisissez un nombre entier de ${min} à ${max}`,
  more: "Le délai pour vous laisser la main, la taille des captures et les autres réglages se trouvent sur la page World Contrôle de l'ordinateur, en mode avancé.",
  saved: 'Enregistré',
  turnedOn: "Contrôle de l'ordinateur activé",
  turnedOff: "Contrôle de l'ordinateur désactivé",
  saveFailed: (why: string) => `Non enregistré : ${why}`,
  enabledLabel: "Utiliser l'ordinateur",
  controlLabel: 'Souris et clavier',
};
