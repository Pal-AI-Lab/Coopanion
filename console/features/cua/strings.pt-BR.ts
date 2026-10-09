import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Uso do computador',
  title: 'Uso do computador',
  enabled: 'Deixar o Coo usar este computador',
  enabledHint: 'Desligado, o Coo não vê a tela nem toca no mouse e no teclado.',
  control: 'Permitir o mouse e o teclado',
  controlHint: 'Desligado, o Coo só pode tirar capturas de tela e listar janelas.',
  permission: 'Quando perguntar a você',
  levels: { 'ask-each-turn': 'Todo turno', 'ask-before-acting': 'Antes de agir', 'ask-once': 'Uma vez', 'never-ask': 'Nunca' },
  levelHints: {
    'ask-each-turn': 'A cada turno, o Coo pergunta no balão antes de olhar a tela ou usar o mouse e o teclado pela primeira vez.',
    'ask-before-acting': 'Para olhar não pergunta; a cada turno, o Coo pergunta antes de usar o mouse e o teclado pela primeira vez.',
    'ask-once': 'Para olhar não pergunta; o Coo pergunta uma vez antes de usar o mouse e o teclado e, depois de um sim, não pergunta de novo pelo tempo definido abaixo.',
    'never-ask': 'O Coo nunca pergunta, nem para olhar nem para agir.',
  },
  grant: 'Um sim dura',
  grantSuffix: 'minutos',
  grantBad: (min: number, max: number) => `Digite um número inteiro de ${min} a ${max}`,
  more: 'Quanto tempo ele espera por você, os tamanhos das capturas e as demais configurações ficam na página do World Uso do computador, no modo avançado.',
  saved: 'Salvo',
  turnedOn: 'O uso do computador está ligado',
  turnedOff: 'O uso do computador está desligado',
  saveFailed: (why: string) => `Não foi salvo: ${why}`,
};
