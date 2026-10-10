import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: '對話',
  title: '對話',
  trace: '執行軌跡',
  traceHint: '進階模式裡的完整執行軌跡：上下文、工具呼叫與原始事件',
  placeholder: (bot: string) => `和 ${bot} 說點什麼…`,
  connecting: '正在連線…',
  empty: (bot: string) => `還沒有和 ${bot} 說過話。`,
  older: '更早的對話',
  voice: '語音',
  idle: '閒置',
  thinking: (bot: string) => `${bot} 在想…`,
  doing: (what: string) => `正在${what}`,
  retry: (at: string) => `模型沒有回應，${at} 重試`,
  handoff: '在整理之前的對話',
  paused: '已暫停 · 訊息在繼續後送達',
  queued: (bot: string) => `排隊中，${bot} 做完這一步就看`,
  queuedPaused: '已暫停，繼續後送達',
  sendNow: '立即傳送',
  sendNowHint: (bot: string) => `打斷 ${bot} 正在做的這一步，馬上送達`,
  withdraw: '收回',
  withdrawHint: '退回輸入框',
  discarded: '沒有送達：排隊的訊息被清空了',
  imageCount: (n: number) => `[${n} 張圖]`,
  ownAnswer: '自己回答…',
  send: '傳送',
  computer: '操作電腦',
  steps: (n: number) => `${n} 步`,
  things: (n: number) => `做了 ${n} 件事`,
  seconds: (s: number) => `${s} 秒`,
  imagesUnseen: (bot: string) => `目前的模型看不到圖片，${bot} 只會知道你傳了幾張圖。`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `，${b} 摔暈了一會兒` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `你把睡著的 ${b} 戳醒了` : t.count > 1 ? `你戳了 ${b} ${t.count} 下` : `你戳了 ${b} 一下`;
      case 'pet': return t.count > 1 ? `你摸了 ${b} 好幾下` : `你摸了摸 ${b}`;
      case 'throw': return `你把 ${b} 拎起來甩了出去${out}`;
      case 'drop': return `你把 ${b} 拎起來換了個地方${out}`;
      default: return `${b} 重重落地，摔暈了一會兒`;
    }
  },
  figure: (change: string, name: string, b: string): string => (change === 'figure' ? `你把 ${b} 換成了「${name}」` : change === 'dress' ? `你幫 ${b} 換了一身打扮` : `「${name}」沒能顯示出來，換成了 Coo`),
};

export const STEP: Partial<typeof stepEn> = {
  cua_screenshot: '截圖', cua_click: '點擊', cua_move: '移動滑鼠', cua_drag: '拖曳', cua_scroll: '捲動', cua_type: '打字',
  cua_key: '按鍵', cua_windows: '查看視窗', cua_focus: '切換視窗', cua_wait: '等待',
  pet_walk_to: '走動', pet_act: '做動作', pet_set: '調整自己', pet_quiet: '安靜一會兒',
};
