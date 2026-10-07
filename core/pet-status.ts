/**
 * What the pet's status bubble says for the tools this app's bot has: the Persona's memory tools, cua, the alarms
 * (alarms.ts) and the terminal. Only the arguments named here reach the page; typed text, notes, window titles and
 * coordinates never do. Wording that depends on an argument waits for the call to be written out, so the bubble does
 * not say something the call turns out not to do.
 */
import { numberArg, stringArg, type DescribeTool, type PetStatus, type ToolArgs } from 'cortico-world-desktop-pet';

const leaf = (path: string | undefined) => path?.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const shorten = (text: string) => { const chars = [...text]; return chars.length > 20 ? chars.slice(0, 20).join('') + '…' : text; };
const show = (kind: PetStatus['kind'], text: string, detail?: string): PetStatus => ({ kind, text, ...(detail ? { detail: shorten(detail) } : {}) });

/** Which click, once the arguments say so; a plain click only once they are complete. */
function clickText(args: ToolArgs, done: boolean): string | null {
  if (stringArg(args, 'button') === 'right') return '在右键';
  if (numberArg(args, 'clicks') === 2) return '在双击';
  return done ? '在点' : null;
}

export const describePetTool: DescribeTool = (name, args, done) => {
  switch (name) {
    case 'read_file': return show('read', '在看', leaf(stringArg(args, 'path')));
    case 'list_files': {
      const dir = leaf(stringArg(args, 'dir'));
      return show('browse', '在翻', dir ? `${dir}/` : done ? '记忆' : undefined);
    }
    case 'glob_files': return show('browse', '在找', stringArg(args, 'glob_pattern'));
    case 'grep_files': {
      const pattern = stringArg(args, 'pattern');
      return show('search', '在搜', pattern ? `「${pattern}」` : undefined);
    }
    case 'write_file': return show('write', '在写', leaf(stringArg(args, 'path')));
    case 'edit_file': return show('write', '在改', leaf(stringArg(args, 'path')));
    case 'append_file': return show('write', '在补记', leaf(stringArg(args, 'path')));
    case 'delete_file': return show('delete', '在删', leaf(stringArg(args, 'path')));
    case 'save_blob': return show('save', '在存', leaf(stringArg(args, 'path')));
    case 'cua_screenshot': return show('look', '在看屏幕');
    case 'cua_windows': return show('look', '在看开着的窗口');
    case 'cua_click': {
      const text = clickText(args, done);
      return text ? show('click', text) : null;
    }
    case 'cua_move': return show('click', '在挪鼠标');
    case 'cua_drag': return show('click', '在拖');
    case 'cua_scroll': return show('click', '在滚动');
    case 'cua_focus': return show('click', '在切窗口');
    case 'cua_type': return show('type', '在打字');
    case 'cua_key': return show('type', '在按', stringArg(args, 'keys'));
    case 'cua_wait': {
      const seconds = numberArg(args, 'seconds');
      return show('wait', '等', seconds === undefined ? undefined : `${seconds} 秒`);
    }
    case 'alarm_set': {
      const minutes = numberArg(args, 'in_minutes');
      return show('alarm', '在定闹钟', stringArg(args, 'at') || (minutes === undefined ? undefined : `${minutes} 分钟后`));
    }
    case 'alarm_list': return show('alarm', '在看闹钟');
    case 'alarm_cancel': return show('alarm', '在取消闹钟');
    case 'terminal_send': case 'end_turn': return null;
    default: return undefined;
  }
};
