import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const zhHant: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} 想用你的電腦：看螢幕、動滑鼠和鍵盤。這一次可以嗎？`,
    once: (who: string, minutes: number) => `${who} 想動你的滑鼠和鍵盤。接下來 ${minutes} 分鐘內都可以嗎？`,
    acting: (who: string) => `${who} 想動你的滑鼠和鍵盤。這一次可以嗎？`,
    caption: '電腦操作',
    yes: '可以',
    no: '不行',
  },

  preflight: {
    noDisplay: '電腦操作 World 在 Linux 上需要 X11（或 Wayland 下的 XWayland）：沒有設定 DISPLAY。',
    unsupported: '電腦操作 World 只支援 Windows、macOS 和 Linux。',
  },

  console: {
    label: '電腦操作',
    engine: '操作引擎',
    screen: (w: number, h: number) => `螢幕 ${w}×${h}`,
    onDemand: '需要時啟動',
    exited: (code: number | null) => `引擎處理程序結束（結束代碼 ${code}）`,
    control: '操作',
    allowed: '允許',
    viewOnly: '只看',
    asking: '詢問',
    levels: { 'ask-each-turn': '每輪', 'ask-before-acting': '動手前', 'ask-once': (minutes: number) => `每 ${minutes} 分鐘一次`, 'never-ask': '不問' },
    envPrompt: { title: '電腦操作環境', description: '截圖座標、讓位規則與操作界限。' },
    vars: {
      'cua.os': '這台電腦的系統：Windows 或 Mac',
      'cua.keys': '這個系統常用的快速鍵',
      'cua.shot': '截圖尺寸',
      'cua.control': '是否允許操作滑鼠鍵盤',
      'cua.idle': '讓位時長（秒）',
      'cua.permission': '什麼時候先問使用者（依 permission 設定）',
    },
  },

  config: {
    group: '電腦操作',
    control: { title: '允許操作滑鼠鍵盤', description: '關閉後只能截圖和列出視窗。' },
    permission: { title: '什麼時候先問你', description: 'ask-each-turn：每一輪看螢幕或動手前都問；ask-before-acting：看螢幕不問，每一輪動滑鼠鍵盤前問；ask-once：看螢幕不問，動滑鼠鍵盤前問一次，同意後在「同意多久有效」內不再問；never-ask：都不問。' },
    grantMinutes: { title: '同意多久有效', suffix: '分鐘', description: '只對 ask-once 有效。' },
    userIdleMs: { title: '讓位時長', description: '你動過滑鼠或鍵盤後，要靜止這麼久才繼續操作。' },
    maxYieldWaitMs: { title: '讓位最多等待' },
    maxWidth: { title: '截圖最大寬度' },
    maxHeight: { title: '截圖最大高度' },
    quality: { title: '截圖品質' },
    afterAction: { title: '操作後附上截圖' },
    settleMs: { title: '截圖前等待' },
  },
};

export default zhHant;
