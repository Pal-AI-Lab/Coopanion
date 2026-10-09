import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const ptBR: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} quer usar seu computador: ver a tela e usar o mouse e o teclado. Pode desta vez?`,
    once: (who: string, minutes: number) => `${who} quer usar seu mouse e seu teclado. Pode pelos próximos ${minutes} minutos?`,
    acting: (who: string) => `${who} quer usar seu mouse e seu teclado. Pode desta vez?`,
    caption: 'Uso do computador',
    yes: 'Sim',
    no: 'Não',
  },

  preflight: {
    noDisplay: 'O World de uso do computador precisa do X11 no Linux (ou XWayland no Wayland): DISPLAY não está definido.',
    unsupported: 'O World de uso do computador só funciona no Windows, macOS e Linux.',
  },

  console: {
    label: 'Uso do computador',
    engine: 'Motor de entrada',
    screen: (w: number, h: number) => `Tela ${w}×${h}`,
    onDemand: 'Inicia quando necessário',
    exited: (code: number | null) => `O processo do motor foi encerrado (código de saída ${code})`,
    control: 'Controle',
    allowed: 'Permitido',
    viewOnly: 'Só olhar',
    asking: 'Pergunta',
    levels: { 'ask-each-turn': 'Todo turno', 'ask-before-acting': 'Antes de agir', 'ask-once': (minutes: number) => `Uma vez a cada ${minutes} min`, 'never-ask': 'Nunca' },
    envPrompt: { title: 'Ambiente de uso do computador', description: 'Coordenadas das capturas de tela, as regras para não atrapalhar a pessoa e o que pode ser feito.' },
    vars: {
      'cua.os': 'O sistema deste computador: Windows ou Mac',
      'cua.keys': 'Atalhos comuns neste sistema',
      'cua.shot': 'Tamanho da captura de tela',
      'cua.control': 'Se o mouse e o teclado podem ser usados',
      'cua.idle': 'Por quanto tempo não atrapalhar (segundos)',
      'cua.permission': 'Quando perguntar à pessoa primeiro (pela configuração de permissão)',
    },
  },

  config: {
    group: 'Uso do computador',
    control: { title: 'Permitir mouse e teclado', description: 'Desligado, só capturas de tela e a lista de janelas.' },
    permission: { title: 'Quando perguntar a você primeiro', description: 'ask-each-turn: antes de olhar a tela ou agir, a cada turno; ask-before-acting: olhar é livre, pergunta antes de usar o mouse e o teclado a cada turno; ask-once: olhar é livre, pergunta uma vez antes de usar o mouse e o teclado, e um sim vale por “Quanto dura um sim”; never-ask: nunca pergunta.' },
    grantMinutes: { title: 'Quanto dura um sim', suffix: 'min', description: 'Só para ask-once.' },
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
