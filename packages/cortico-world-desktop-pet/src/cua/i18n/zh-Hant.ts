import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const zhHant: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} 想使用你的電腦：查看螢幕、操作滑鼠和鍵盤。這一次可以嗎？`,
    once: (who: string, minutes: number) => `${who} 想操作你的滑鼠和鍵盤。接下來 ${minutes} 分鐘內都可以嗎？`,
    acting: (who: string) => `${who} 想操作你的滑鼠和鍵盤。這一次可以嗎？`,
    caption: '電腦操作',
    yes: '可以',
    no: '這次不行',
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} 想在命令列視窗「${window}」裡輸入：\n${text}\n輸入的內容可能作為命令執行。同意後 ${minutes} 分鐘內，在命令列視窗裡輸入、按鍵和按 win+r 不再詢問。可以嗎？`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} 想在命令列視窗「${window}」裡按 ${keys}。同意後 ${minutes} 分鐘內，在命令列視窗裡輸入、按鍵和按 win+r 不再詢問。可以嗎？`,
      runBox: (who: string, keys: string, minutes: number) => `${who} 想按 ${keys} 開啟執行視窗，執行視窗能啟動程式或執行命令。同意後 ${minutes} 分鐘內，在命令列視窗裡輸入、按鍵和按 win+r 不再詢問。可以嗎？`,
    },
  },

  preflight: {
    noDisplay: '電腦操作在 Linux 上需要 X11（或 Wayland 下的 XWayland）：沒有設定 DISPLAY。',
    unsupported: '電腦操作只支援 Windows、macOS 和 Linux。',
  },

  console: {
    engine: '操作引擎',
    screen: (w: number, h: number) => `螢幕 ${w}×${h}`,
    onDemand: '需要時啟動',
    exited: (code: number | null) => `引擎處理程序結束（結束代碼 ${code}）`,
    allowed: '允許',
    viewOnly: '只查看',
    asking: '詢問',
    levels: { 'ask-each-turn': '每輪', 'ask-before-acting': '動手前', 'ask-once': (minutes: number) => `每 ${minutes} 分鐘一次`, 'never-ask': '不詢問' },
  },

  config: {
    group: '電腦操作',
    enabled: { title: '啟用電腦操作' },
    control: { title: '允許操作滑鼠和鍵盤', description: '關閉後只能截圖和列出視窗。' },
    permission: { title: '詢問時機', description: 'ask-each-turn：每輪查看螢幕或操作前都詢問；ask-before-acting：查看螢幕不詢問，每輪操作滑鼠鍵盤前詢問；ask-once：查看螢幕不詢問，操作前詢問一次，同意後在「同意有效期」內不再詢問；never-ask：從不詢問。沒有開啟「關閉使用終端和執行前的詢問」時，無論選哪一檔，在命令列視窗裡輸入或按鍵、按 win+r 之前，都會單獨詢問一次，同意後在「同意有效期」內不再詢問。' },
    grantMinutes: { title: '同意有效期', suffix: '分鐘', description: '對 ask-once 和命令列視窗的單獨詢問有效。' },
    skipTerminalAsk: { title: '關閉使用命令列視窗和執行前的詢問', description: '開啟後，在命令列視窗裡輸入或按鍵、按 win+r 之前不再單獨詢問，和其他操作一樣按「詢問時機」詢問。詢問時機是 never-ask 時，Coo 能不經詢問執行命令。' },
    userIdleMs: { title: '讓位時長', description: '你操作滑鼠或鍵盤後，需靜止這麼久才繼續操作。' },
    maxYieldWaitMs: { title: '讓位最多等待' },
    maxWidth: { title: '截圖最大寬度' },
    maxHeight: { title: '截圖最大高度' },
    quality: { title: '截圖品質' },
    afterAction: { title: '操作後附上截圖' },
    settleMs: { title: '截圖前等待' },
  },
};

export default zhHant;
