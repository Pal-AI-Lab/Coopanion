import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Chat',
  title: 'Chat',
  trace: 'Console',
  traceHint: 'A página Console do modo avançado: contexto, chamadas de ferramentas e eventos brutos',
  placeholder: (bot: string) => `Mensagem para ${bot}…`,
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
  things: (n: number) => `${n} ${n === 1 ? 'etapa concluída' : 'etapas concluídas'}`,
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
  figure: (kind: string, name: string, b: string): string => (kind === 'figure' ? `Você mudou ${b} para ${name}` : kind === 'dress' ? `Você trocou a roupa de ${b}` : `Falha ao exibir ${name}; trocado para Coo`),
};

export const STEP: Partial<typeof stepEn> = {
  pet_cua_screenshot: 'Captura de tela', pet_cua_click: 'Clicar', pet_cua_move: 'Mover o mouse', pet_cua_drag: 'Arrastar', pet_cua_scroll: 'Rolar', pet_cua_type: 'Digitar',
  pet_cua_key: 'Pressionar teclas', pet_cua_windows: 'Listar janelas', pet_cua_focus: 'Trocar de janela', pet_cua_wait: 'Esperar',
  pet_move_to: 'Andar', pet_act: 'Se mexer', pet_set: 'Se ajustar', pet_quiet: 'Fazer silêncio',
};
