import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Discussion',
  title: 'Discussion',
  trace: "Trace d'exécution",
  traceHint: "La trace d'exécution complète en mode avancé : contexte, appels d'outils et événements bruts",
  placeholder: (bot: string) => `Dites quelque chose à ${bot}…`,
  connecting: 'Connexion…',
  empty: (bot: string) => `Rien n'a encore été dit à ${bot}.`,
  older: 'Plus ancien',
  voice: 'Voix',
  idle: 'Inactif',
  thinking: (bot: string) => `${bot} réfléchit…`,
  doing: (what: string) => `Occupé : ${what}`,
  retry: (at: string) => `Le modèle n'a pas répondu ; nouvel essai à ${at}`,
  handoff: 'Mise en ordre de la conversation précédente',
  paused: 'En pause · les messages arrivent à la reprise',
  queued: (bot: string) => `En file d'attente ; ${bot} le lit après cette étape`,
  queuedPaused: 'En pause ; remis à la reprise',
  sendNow: 'Envoyer maintenant',
  sendNowHint: (bot: string) => `Interrompre ce que fait ${bot} et le remettre maintenant`,
  withdraw: 'Reprendre',
  withdrawHint: 'Retour dans la zone de saisie',
  discarded: "Non remis : la file d'attente a été vidée",
  imageCount: (n: number) => `[${n} image${n > 1 ? 's' : ''}]`,
  ownAnswer: 'Votre propre réponse…',
  send: 'Envoyer',
  computer: "Utilise l'ordinateur",
  steps: (n: number) => `${n} étape${n > 1 ? 's' : ''}`,
  things: (n: number) => `${n} action${n > 1 ? 's' : ''} effectuée${n > 1 ? 's' : ''}`,
  seconds: (s: number) => `${s} s`,
  imagesUnseen: (bot: string) => `Le modèle actuel ne voit pas les images ; ${bot} apprend seulement combien vous en avez envoyé.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `, et ${b} en a eu le tournis un moment` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `Vous avez réveillé ${b} d'un petit coup` : t.count > 1 ? `Vous avez donné ${t.count} petits coups à ${b}` : `Vous avez donné un petit coup à ${b}`;
      case 'pet': return t.count > 1 ? `Vous avez caressé ${b} plusieurs fois` : `Vous avez caressé ${b}`;
      case 'throw': return `Vous avez soulevé et lancé ${b}${out}`;
      case 'drop': return `Vous avez porté ${b} ailleurs${out}`;
      default: return `${b} a durement touché le sol et en a eu le tournis un moment`;
    }
  },
  figure: (change: string, name: string, b: string): string => (change === 'figure' ? `Vous avez transformé ${b} en ${name}` : change === 'dress' ? `Vous avez changé la tenue de ${b}` : `${name} n’a pas pu s’afficher ; Coo s’affiche à la place`),
};

export const STEP: Partial<typeof stepEn> = {
  cua_screenshot: "Capture d'écran", cua_click: 'Clic', cua_move: 'Déplacer la souris', cua_drag: 'Glisser', cua_scroll: 'Défiler', cua_type: 'Saisir du texte',
  cua_key: 'Appuyer sur des touches', cua_windows: 'Lister les fenêtres', cua_focus: 'Changer de fenêtre', cua_wait: 'Attendre',
  pet_walk_to: 'Marcher', pet_act: 'Bouger', pet_set: "S'ajuster", pet_quiet: 'Rester tranquille',
};
