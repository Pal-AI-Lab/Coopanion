import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const es419: Translation<CoreText> = {
  settings: {
    language: { title: 'Idioma', description: 'La ventana de configuración y las burbujas y el menú de la mascota usan este idioma, y Coo te habla en él. Se aplica al instante.' },
    telemetry: { title: 'Estadísticas de uso anónimas', description: 'Envía conteos de uso y la configuración, nunca conversaciones, para ayudar a mejorar Coopanion. Los campos se listan en docs/TELEMETRY.md.' },
    roundsSoft: { title: 'Recordatorio para cerrar', suffix: 'solicitudes', description: 'Tras esta cantidad de solicitudes al modelo en un mismo despertar, se le recuerda a Coo que termine lo que está haciendo y cierre el turno.' },
    roundsHard: { title: 'Solicitudes por despertar', suffix: 'solicitudes', description: 'El máximo de solicitudes al modelo en un despertar; al llegar a él, el turno termina.' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `Mis últimas ${n} solicitudes al modelo fallaron. Error${status ? ` ${status}` : ''}: ${reason}. Revisa el nombre del modelo y la API Key en la página Inicio de la configuración, donde puedes probar la conexión.`,
    open: 'Abrir configuración',
    ok: 'De acuerdo',
  },

  update: {
    downloading: (v: string) => `Salió la versión ${v} y se está descargando en segundo plano; te aviso cuando esté lista. Si la descarga se atasca, puedes bajarla tú desde GitHub.`,
    ready: (v: string) => `La versión ${v} ya se descargó. ¿Reinicio para actualizar ahora? Si no, se instala la próxima vez que cierres la app.`,
    failed: (v: string, why: string) => `La versión ${v} no se descargó: ${why}. Puedes bajarla tú desde GitHub.`,
    ok: 'De acuerdo', github: 'Descargar de GitHub', install: 'Reiniciar y actualizar', later: 'Más tarde', gotIt: 'Entendido',
  },

  quit: 'Salir de la app',
  cuaYes: 'Sí',
  cuaNo: 'Esta vez no',

  status: {
    read: 'Leyendo', browse: 'Revisando', memory: 'memoria', find: 'Localizando', search: 'Buscando', write: 'Escribiendo', edit: 'Editando', append: 'Agregando a',
    delete: 'Borrando', save: 'Guardando', screen: 'Mirando la pantalla', windows: 'Mirando las ventanas abiertas', rightClick: 'Haciendo clic derecho', doubleClick: 'Haciendo doble clic', click: 'Haciendo clic',
    move: 'Moviendo el mouse', drag: 'Arrastrando', scroll: 'Desplazando', focus: 'Cambiando de ventana', type: 'Tecleando', key: 'Presionando', wait: 'Esperando',
    alarmSet: 'Poniendo una alarma', alarmList: 'Revisando las alarmas', alarmCancel: 'Cancelando una alarma',
    quoted: (text: string) => `“${text}”`,
    seconds: (n: number) => `${n} s`,
    minutesLater: (n: number) => `en ${n} min`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `Se aplica cuando la mascota cambia a “${preset}” de ${figure}`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['Un amigo', 'friend'], ['En otro lugar', 'other'], ['Prefiero no decirlo', 'skip']],
    hello: '¡Hola! Soy Coo, y ahora vivo en el borde de abajo de tu pantalla. Coo...',
    helloReply: '¡Hola, Coo!',
    askName: '¿Cómo te llamo?',
    nameSend: 'Llámame así',
    gotName: (name: string) => `¡${name}, anotado!`,
    askSource: '¿Dónde supiste de mí?',
    sourceThanks: 'Ah, ya veo. Coo...',
    askRoam: '¿La mayor parte del tiempo me quedo en calma o me muevo mucho? Haz clic en una opción para ver qué haría.',
    roam: {
      off: { label: 'Sin moverse', level: 'Bajo', line: 'Entonces me quedo en mi lugar y me muevo cuando me llames.' },
      calm: { label: 'De vez en cuando', level: 'Medio', line: 'Daré un paseo de vez en cuando y la mayor parte del tiempo me quedaré en mi lugar.' },
      free: { label: 'A menudo', level: 'Alto', line: 'Puedo correr por todos lados. ¡Coo...!' },
    },
    roamOk: 'Así',
    roamDone: 'Listo, así lo haré.',
    wakeTitle: 'Modo de respuesta',
    askWake: 'Modo de respuesta: cuando me das un toque, me acaricias o me levantas, ¿cuándo debo responder?',
    wake: {
      none: { label: 'Tranquilo', note: 'Los toques se guardan y responde a todos cuando le hablas' },
      poke: { label: 'Predeterminado', note: 'Solo responde cuando le das un toque' },
      all: { label: 'Activo', note: 'Responde a todos los toques' },
    },

    askVendor: (first: string) => `Para conversar contigo necesito conectarme a un modelo. ¿Qué servicio uso? Si tienes dudas, elige ${first}.`,
    vendorOk: 'Usar este',
    moreVendors: 'Más…',
    pickModel: (model: string) => `Por defecto usaré ${model}: es barato y puede leer imágenes. Para usar otro modelo, escribe su nombre en su lugar.`,
    modelOk: 'Usar este',
    askKey: (name: string) => `Pega aquí tu API Key de ${name}. Se cobra por uso, así que vigila los tokens.`,
    keySend: 'Conectar',
    keyLink: (name: string) => `¿Aún no tienes API Key? Consíguela en ${name}`,
    keyLater: 'Más tarde',
    connecting: 'Conectando…',
    keyOk: (name: string, model: string) => `¡Conectado a ${name}${model ? ` (${model})` : ''}! Ahora puedo hablar. Coo...`,
    keyFail: (why: string) => `No se conectó: ${why}. ¿La API Key está completa y queda saldo en la cuenta? Intenta pegarla de nuevo.`,
    keyAlready: (connection: string) => `Ya hay un modelo conectado (${connection}). Fácil. Coo...`,
    keySkipped: 'No pasa nada; hablaré cuando la agregues. Te lo vuelvo a preguntar más tarde.',

    askModel: (name: string, mb: number) => `Para entender lo que dices, necesito descargar un modelo de reconocimiento de voz (${name}, unos ${mb} MB). ¿Lo descargo ahora?`,
    download: 'Descargar',
    notNow: 'Ahora no',
    downloading: 'Descargando el modelo de voz. Coo...',
    downloaded: '¡Listo! Ahora entiendo lo que dices.',
    downloadFail: (why: string) => `La descarga falló: ${why}. Puedes volver a intentarlo en la página Entrada de voz de la configuración.`,
    modelLater: 'De acuerdo. Con un clic en la página Entrada de voz de la configuración lo descargas más tarde.',
    talk: (hint: string) => `Para hablarme: ${hint}. `,
    talkOff: 'La entrada de voz está desactivada; puedes activarla en la página Entrada de voz de la configuración. ',
    talkType: 'También puedes dejar el puntero sobre mí y hacer clic en el botón de burbuja a mi lado para escribir.',
    gotIt: 'Entendido',
    buttons: 'Deja el puntero sobre mí y aparecen unos botones a mi lado; haz clic derecho sobre mí para abrir el menú, con pausa, configuración y salir.',
    ok: 'De acuerdo',
    persona: 'Cómo soy y cómo hablo está escrito en la página Prompt del sistema de la ventana de configuración. Para cambiarme, edítalo ahí, o simplemente dímelo y lo cambio yo.',
    personaMark: 'Prompt del sistema',
    personaOk: 'Comprendido',
    finish: MAC
      ? '¡Todo listo! Mi ícono también está en la barra de menús; haz clic en él para cambiar la configuración.'
      : process.platform === 'linux'
        ? '¡Todo listo! Para cambiar la configuración, haz clic derecho sobre mí para abrir el menú; si mi ícono está en la bandeja, hacer clic en él también funciona.'
        : '¡Todo listo! Mi ícono también está en la bandeja, abajo a la derecha de la barra de tareas; haz clic en él para cambiar la configuración.',
    go: '¡Vamos!',
    dress: 'Primero vísteme',
    closed: 'Bueno, lo dejamos aquí. Para volver a escuchar mi presentación, abre la configuración y haz clic en “Guía” en la página Inicio.',

    askFirst: 'Todavía no tengo un modelo conectado; podré hablar cuando agregues una API Key. ¿Qué servicio uso?',
    askAgain: 'Sigo sin modelo conectado; agrega una API Key y podré hacerte compañía. ¿Qué servicio uso?',
    askLater: 'Más tarde',
    noModel: 'No hay ningún modelo conectado. ¿Conectamos uno ahora?',
    noModelGo: 'Conectar',
    noModelLater: 'Más tarde',
  },
};

export default es419;
