import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const ptBR: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} quer usar seu computador: ver a tela e usar o mouse e o teclado. Pode desta vez?`,
    once: (who: string, minutes: number) => `${who} quer usar seu mouse e seu teclado. Pode pelos próximos ${minutes} minutos?`,
    acting: (who: string) => `${who} quer usar seu mouse e seu teclado. Pode desta vez?`,
    caption: 'Uso do computador',
    yes: 'Sim',
    no: 'Desta vez não',
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} quer digitar na janela de terminal “${window}”:\n${text}\nO que for digitado pode ser executado como comando. Depois de um sim, digitar ou pressionar teclas em um terminal e win+r não são perguntados de novo por ${minutes} min. Pode?`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} quer pressionar ${keys} na janela de terminal “${window}”. Depois de um sim, digitar ou pressionar teclas em um terminal e win+r não são perguntados de novo por ${minutes} min. Pode?`,
      runBox: (who: string, keys: string, minutes: number) => `${who} quer pressionar ${keys} para abrir a caixa Executar, que pode iniciar programas ou executar comandos. Depois de um sim, digitar ou pressionar teclas em um terminal e win+r não são perguntados de novo por ${minutes} min. Pode?`,
    },
  },

  preflight: {
    noDisplay: 'O uso do computador precisa do X11 no Linux (ou XWayland no Wayland): DISPLAY não está definido.',
    unsupported: 'O uso do computador só funciona no Windows, macOS e Linux.',
  },

  console: {
    engine: 'Motor de entrada',
    screen: (w: number, h: number) => `Tela ${w}×${h}`,
    onDemand: 'Inicia quando necessário',
    exited: (code: number | null) => `O processo do motor foi encerrado (código de saída ${code})`,
    allowed: 'Permitido',
    viewOnly: 'Só olhar',
    asking: 'Pergunta',
    levels: { 'ask-each-turn': 'Todo turno', 'ask-before-acting': 'Antes de agir', 'ask-once': (minutes: number) => `Uma vez a cada ${minutes} min`, 'never-ask': 'Nunca' },
  },

  config: {
    group: 'Uso do computador',
    enabled: { title: 'Ativar o uso do computador' },
    control: { title: 'Permitir o mouse e o teclado', description: 'Desligado, só capturas de tela e a lista de janelas.' },
    permission: { title: 'Quando perguntar a você', description: 'ask-each-turn: antes de olhar a tela ou agir, a cada turno; ask-before-acting: olhar é livre, pergunta antes de usar o mouse e o teclado a cada turno; ask-once: olhar é livre, pergunta uma vez antes de usar o mouse e o teclado, e um sim vale por “Um sim dura”; never-ask: nunca pergunta. Com “Desativar a pergunta antes do terminal e do Executar” desligado, em qualquer opção, antes de digitar ou pressionar teclas em um terminal e antes de win+r, pergunta uma vez à parte, e um sim vale por “Um sim dura”.' },
    grantMinutes: { title: 'Um sim dura', suffix: 'min', description: 'Para ask-once e para a pergunta à parte sobre terminais.' },
    skipTerminalAsk: { title: 'Desativar a pergunta antes do terminal e do Executar', description: 'Ligado, digitar ou pressionar teclas em um terminal e win+r não têm mais pergunta à parte e seguem “Quando perguntar a você” como qualquer outra ação. Com never-ask, Coo pode executar comandos sem perguntar a você.' },
    userIdleMs: { title: 'Não atrapalhar por', description: 'Depois que você usa o mouse ou o teclado, espera até que fiquem parados por esse tempo.' },
    maxYieldWaitMs: { title: 'Espera máxima por você' },
    maxWidth: { title: 'Largura máxima da captura' },
    maxHeight: { title: 'Altura máxima da captura' },
    quality: { title: 'Qualidade da captura' },
    afterAction: { title: 'Captura após cada ação' },
    settleMs: { title: 'Espera antes da captura' },
  },
};

export default ptBR;
