import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Chat',
  title: 'Chat',
  trace: 'Rastro de execução',
  traceHint: 'O rastro de execução completo no modo avançado: contexto, chamadas de ferramentas e eventos brutos',
  placeholder: (bot: string) => `Diga algo para ${bot}…`,
  connecting: 'Conectando…',
  empty: (bot: string) => `Nada foi dito para ${bot} ainda.`,
  older: 'Anteriores',
  voice: 'Voz',
  idle: 'Livre',
  thinking: (bot: string) => `${bot} está pensando…`,
  doing: (what: string) => `Agora: ${what}`,
  retry: (at: string) => `O modelo não respondeu; nova tentativa às ${at}`,
  handoff: 'Organizando a conversa anterior',
  paused: 'Em pausa · as mensagens chegam ao retomar',
  queued: (bot: string) => `Na fila; ${bot} lê depois desta etapa`,
  queuedPaused: 'Em pausa; entregue ao retomar',
  sendNow: 'Enviar agora',
  sendNowHint: (bot: string) => `Interromper o que ${bot} está fazendo e entregar agora`,
  withdraw: 'Retirar',
  withdrawHint: 'De volta para a caixa de texto',
  discarded: 'Não entregue: a fila foi esvaziada',
  imageCount: (n: number) => `[${n} ${n === 1 ? 'imagem' : 'imagens'}]`,
  ownAnswer: 'Sua própria resposta…',
  send: 'Enviar',
  computer: 'Usando o computador',
  steps: (n: number) => `${n} ${n === 1 ? 'etapa' : 'etapas'}`,
  things: (n: number) => `${n} ${n === 1 ? 'coisa feita' : 'coisas feitas'}`,
  seconds: (s: number) => `${s} s`,
  imagesUnseen: (bot: string) => `O modelo atual não consegue ver imagens; ${bot} só fica sabendo quantas você enviou.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `, e ${b} ficou com tontura por um tempo` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `Você cutucou ${b} até acordar` : t.count > 1 ? `Você cutucou ${b} ${t.count} vezes` : `Você cutucou ${b}`;
      case 'pet': return t.count > 1 ? `Você fez carinho em ${b} várias vezes` : `Você fez carinho em ${b}`;
      case 'throw': return `Você pegou e arremessou ${b}${out}`;
      case 'drop': return `Você levou ${b} para outro lugar${out}`;
      default: return `${b} caiu com tudo no chão e ficou com tontura por um tempo`;
    }
  },
};

export const STEP: Partial<typeof stepEn> = {
  cua_screenshot: 'Captura de tela', cua_click: 'Clicar', cua_move: 'Mover o mouse', cua_drag: 'Arrastar', cua_scroll: 'Rolar', cua_type: 'Digitar',
  cua_key: 'Pressionar teclas', cua_windows: 'Listar janelas', cua_focus: 'Trocar de janela', cua_wait: 'Esperar',
  pet_walk_to: 'Andar', pet_act: 'Se mexer', pet_set: 'Se ajustar', pet_quiet: 'Fazer silêncio',
};
