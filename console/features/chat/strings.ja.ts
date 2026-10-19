import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'チャット',
  title: 'チャット',
  trace: 'コンソール',
  traceHint: '詳細モードの「コンソール」ページ：コンテキスト、ツール呼び出し、生のイベント',
  placeholder: (bot: string) => `${bot} にメッセージを送信…`,
  connecting: '接続しています…',
  empty: (bot: string) => `${bot} とはまだ話していません。`,
  older: '以前の会話',
  voice: '音声',
  idle: '待機中',
  thinking: (bot: string) => `${bot} が考えています…`,
  doing: (what: string) => `作業中：${what}`,
  retry: (at: string) => `モデルが応答しませんでした。${at} に再試行します`,
  handoff: '以前の会話を整理しています',
  paused: '一時停止中 · メッセージは再開後に届きます',
  queued: (bot: string) => `順番待ち。${bot} はこのステップのあとに読みます`,
  queuedPaused: '一時停止中。再開後に届きます',
  sendNow: '今すぐ送信',
  sendNowHint: (bot: string) => `${bot} の今の作業を止めて、すぐに届けます`,
  withdraw: '取り消す',
  withdrawHint: '入力欄に戻す',
  discarded: '届きませんでした：待ち行列がクリアされました',
  imageCount: (n: number) => `[画像 ${n} 枚]`,
  ownAnswer: '自分で答える…',
  send: '送信',
  computer: 'コンピューターを操作中',
  steps: (n: number) => `${n} ステップ`,
  things: (n: number) => `${n} 件の操作を完了`,
  seconds: (s: number) => `${s} 秒`,
  imagesUnseen: (bot: string) => `現在のモデルは画像を見られません。${bot} には送った枚数だけが伝わります。`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `。${b} はしばらく目を回していました` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `${b} をつついて起こしました` : t.count > 1 ? `${b} を ${t.count} 回つつきました` : `${b} をつつきました`;
      case 'pet': return t.count > 1 ? `${b} を何度かなでました` : `${b} をなでました`;
      case 'throw': return `${b} を持ち上げて放り投げました${out}`;
      case 'drop': return `${b} を別の場所へ運びました${out}`;
      default: return `${b} は地面に強く落ちて、しばらく目を回していました`;
    }
  },
  figure: (kind: string, name: string, b: string): string => (kind === 'figure' ? `${b} を「${name}」に変更しました` : kind === 'dress' ? `${b} の着せ替えを変更しました` : `「${name}」を表示できなかったため、Coo に切り替えました`),
};

export const STEP: Partial<typeof stepEn> = {
  pet_cua_screenshot: 'スクリーンショット', pet_cua_click: 'クリック', pet_cua_move: 'マウス移動', pet_cua_drag: 'ドラッグ', pet_cua_scroll: 'スクロール', pet_cua_type: '入力',
  pet_cua_key: 'キー入力', pet_cua_windows: 'ウィンドウ一覧', pet_cua_focus: 'ウィンドウ切り替え', pet_cua_wait: '待機',
  pet_move_to: '歩く', pet_act: '動作', pet_set: '自分を調整', pet_quiet: 'しばらく静かにする',
};
