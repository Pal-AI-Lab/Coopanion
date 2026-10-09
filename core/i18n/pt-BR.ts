import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const ptBR: Translation<CoreText> = {
  settings: {
    language: { title: 'Idioma', description: 'A janela de configurações e os balões e o menu do pet usam este idioma, e Coo fala com você nele. Vale na hora.' },
    telemetry: { title: 'Estatísticas de uso anônimas', description: 'Envia contagens de uso e configurações, nunca conversas, para ajudar a melhorar o Coopanion. Os campos estão listados em docs/TELEMETRY.md.' },
    roundsSoft: { title: 'Lembrete para encerrar', suffix: 'solicitações', description: 'Depois dessa quantidade de solicitações ao modelo em um mesmo despertar, Coo recebe um lembrete para terminar o que está fazendo e encerrar o turno.' },
    roundsHard: { title: 'Solicitações por despertar', suffix: 'solicitações', description: 'O máximo de solicitações ao modelo em um despertar; ao chegar nele, o turno termina.' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `Minhas últimas ${n} solicitações ao modelo falharam. Erro${status ? ` ${status}` : ''}: ${reason}. Confira o nome do modelo e a API Key na página Início das configurações, onde você pode testar a conexão.`,
    open: 'Abrir configurações',
    ok: 'OK',
  },

  update: {
    downloading: (v: string) => `A versão ${v} saiu e está sendo baixada em segundo plano; eu aviso quando estiver pronta. Se o download travar, você mesmo pode baixá-la no GitHub.`,
    ready: (v: string) => `A versão ${v} foi baixada. Reiniciar para atualizar agora? Se não, ela é instalada na próxima vez que você fechar o app.`,
    failed: (v: string, why: string) => `A versão ${v} não foi baixada: ${why}. Você mesmo pode baixá-la no GitHub.`,
    ok: 'OK', github: 'Baixar do GitHub', install: 'Reiniciar e atualizar', later: 'Depois', gotIt: 'Entendi',
  },

  quit: 'Sair do app',
  cuaYes: 'Sim',
  cuaNo: 'Desta vez não',

  status: {
    read: 'Lendo', browse: 'Consultando', memory: 'memória', find: 'Procurando', search: 'Pesquisando', write: 'Escrevendo', edit: 'Editando', append: 'Acrescentando a',
    delete: 'Excluindo', save: 'Salvando', screen: 'Olhando a tela', windows: 'Olhando as janelas abertas', rightClick: 'Clicando com o botão direito', doubleClick: 'Clicando duas vezes', click: 'Clicando',
    move: 'Movendo o mouse', drag: 'Arrastando', scroll: 'Rolando', focus: 'Trocando de janela', type: 'Digitando', key: 'Pressionando', wait: 'Esperando',
    alarmSet: 'Definindo um alarme', alarmList: 'Conferindo os alarmes', alarmCancel: 'Cancelando um alarme',
    quoted: (text: string) => `“${text}”`,
    seconds: (n: number) => `${n} s`,
    minutesLater: (n: number) => `em ${n} min`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `Aplicado quando o pet muda para “${preset}” de ${figure}`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['Um amigo', 'friend'], ['Outro lugar', 'other'], ['Prefiro não dizer', 'skip']],
    hello: 'Oi! Eu sou Coo, e agora moro na parte de baixo da sua tela. Coo...',
    helloReply: 'Oi, Coo!',
    askName: 'Como devo chamar você?',
    nameSend: 'Pode me chamar assim',
    gotName: (name: string) => `${name}, anotado!`,
    askSource: 'Onde você ouviu falar de mim?',
    sourceThanks: 'Ah, entendi. Coo...',
    askRoam: 'Na maior parte do tempo eu fico na minha ou corro pra todo lado? Clique em uma opção para ver o que eu faria.',
    roam: {
      off: { label: 'Sem se mexer', level: 'Baixo', line: 'Então eu fico no meu canto e me mexo quando você me chamar.' },
      calm: { label: 'De vez em quando', level: 'Médio', line: 'Vou dar uma volta de vez em quando e ficar no meu canto na maior parte do tempo.' },
      free: { label: 'Com frequência', level: 'Alto', line: 'Posso correr pra todo lado. Coo...!' },
    },
    roamOk: 'Assim',
    roamDone: 'Certo, vou ser assim.',
    wakeTitle: 'Modo de resposta',
    askWake: 'Modo de resposta: quando você me cutuca, faz carinho ou me levanta, quando devo responder?',
    wake: {
      none: { label: 'Quieto', note: 'Os toques ficam anotados e são respondidos juntos quando você falar' },
      poke: { label: 'Padrão', note: 'Só responde quando você cutuca' },
      all: { label: 'Ativo', note: 'Responde a todos os toques' },
    },

    askVendor: (first: string) => `Para conversar com você, preciso me conectar a um modelo. Qual serviço eu uso? Se estiver em dúvida, escolha ${first}.`,
    vendorOk: 'Usar este',
    moreVendors: 'Mais…',
    pickModel: (model: string) => `Por padrão vou usar ${model}: é barato e consegue ler imagens. Para usar outro modelo, digite o nome dele no lugar.`,
    modelOk: 'Usar este',
    askKey: (name: string) => `Cole aqui sua API Key de ${name}. A cobrança é por uso, então fique de olho nos tokens.`,
    keySend: 'Conectar',
    keyLink: (name: string) => `Ainda não tem API Key? Obtenha uma no site de ${name}`,
    keyLater: 'Depois',
    connecting: 'Conectando…',
    keyOk: (name: string, model: string) => `Conectado a ${name}${model ? ` (${model})` : ''}! Agora eu posso falar. Coo...`,
    keyFail: (why: string) => `Não conectou: ${why}. A API Key está completa e ainda há saldo na conta? Tente colar de novo.`,
    keyAlready: (connection: string) => `Já tem um modelo conectado (${connection}). Moleza. Coo...`,
    keySkipped: 'Tudo bem; eu falo assim que você adicionar. Pergunto de novo mais tarde.',

    askModel: (name: string, mb: number) => `Para entender o que você diz, preciso baixar um modelo de reconhecimento de voz (${name}, cerca de ${mb} MB). Baixar agora?`,
    download: 'Baixar',
    notNow: 'Agora não',
    downloading: 'Baixando o modelo de voz. Coo...',
    downloaded: 'Pronto! Agora eu entendo o que você diz.',
    downloadFail: (why: string) => `O download falhou: ${why}. Você pode tentar de novo na página Entrada de voz das configurações.`,
    modelLater: 'Certo. Um clique na página Entrada de voz das configurações baixa ele depois.',
    talk: (hint: string) => `Para falar comigo: ${hint}. `,
    talkOff: 'A entrada de voz está desligada agora; você pode ligá-la na página Entrada de voz das configurações. ',
    talkType: 'Você também pode deixar o ponteiro sobre mim e clicar no botão de balão ao meu lado para digitar.',
    gotIt: 'Entendi',
    buttons: 'Deixe o ponteiro sobre mim e alguns botões aparecem ao meu lado; clique com o botão direito em mim para abrir o menu, com pausar, configurações e sair.',
    ok: 'OK',
    persona: 'Como eu sou e como eu falo está escrito na página Prompt de sistema da janela de configurações. Para me mudar, edite lá, ou é só me dizer e eu mudo por conta própria.',
    personaMark: 'Prompt de sistema',
    personaOk: 'Entendido',
    finish: MAC
      ? 'Tudo pronto! Meu ícone também fica na barra de menus; clique nele para mudar as configurações.'
      : process.platform === 'linux'
        ? 'Tudo pronto! Para mudar as configurações, clique com o botão direito em mim para abrir o menu; se meu ícone estiver na bandeja, clicar nele também funciona.'
        : 'Tudo pronto! Meu ícone também fica na bandeja, no canto inferior direito da barra de tarefas; clique nele para mudar as configurações.',
    go: 'Vamos lá',
    dress: 'Me vista primeiro',
    closed: 'Certo, vamos parar por aqui. Para ouvir minha apresentação de novo, abra as configurações e clique em “Guia” na página Início.',

    askFirst: 'Ainda não tenho um modelo conectado; consigo falar quando você adicionar uma API Key. Qual serviço eu uso?',
    askAgain: 'Ainda sem modelo conectado; adicione uma API Key e eu posso fazer companhia para você. Qual serviço eu uso?',
    askLater: 'Depois',
    noModel: 'Nenhum modelo conectado. Conectar um agora?',
    noModelGo: 'Conectar',
    noModelLater: 'Depois',
  },
};

export default ptBR;
