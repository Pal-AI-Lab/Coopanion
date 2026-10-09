/**
 * What the pet's status bubble says for the tools this app's bot has: the Persona's memory tools, cua, the alarms
 * (alarms.ts) and the terminal, in the app language (`core/i18n`). Only the arguments named here reach the page;
 * typed text, notes, window titles and coordinates never do. Wording that depends on an argument waits for the call
 * to be written out, so the bubble does not say something the call turns out not to do. A detail (a file name, a
 * pattern) is cut to 20 characters as seen for Chinese, Japanese and Korean, twice that for other languages.
 */
import { capFor, charCount, cutChars, numberArg, stringArg, type DescribeTool, type PetStatus, type ToolArgs } from 'cortico-world-desktop-pet';
import { coreText, type CoreText } from './i18n/index.ts';
import type { Language } from 'cortico/core/language.ts';

/** The longest detail, for Chinese, Japanese and Korean. */
const DETAIL_MAX = 20;

const leaf = (path: string | undefined) => path?.replace(/[\\/]+$/, '').split(/[\\/]/).pop();

/** Which click, once the arguments say so; a plain click only once they are complete. */
function clickText(s: CoreText['status'], args: ToolArgs, done: boolean): string | null {
  if (stringArg(args, 'button') === 'right') return s.rightClick;
  if (numberArg(args, 'clicks') === 2) return s.doubleClick;
  return done ? s.click : null;
}

/** The status bubble's words for a tool call, in `language()` at the time of the call. */
export function petToolDescriber(language: () => Language): DescribeTool {
  return (name, args, done) => {
    const app = language();
    const s = coreText(app).status;
    const max = capFor(DETAIL_MAX, app);
    const shorten = (text: string) => (charCount(text) > max ? cutChars(text, max) + '…' : text);
    const show = (kind: PetStatus['kind'], text: string, detail?: string): PetStatus => ({ kind, text, ...(detail ? { detail: shorten(detail) } : {}) });
    switch (name) {
      case 'read_file': return show('read', s.read, leaf(stringArg(args, 'path')));
      case 'list_files': {
        const dir = leaf(stringArg(args, 'dir'));
        return show('browse', s.browse, dir ? `${dir}/` : done ? s.memory : undefined);
      }
      case 'glob_files': return show('browse', s.find, stringArg(args, 'glob_pattern'));
      case 'grep_files': {
        const pattern = stringArg(args, 'pattern');
        return show('search', s.search, pattern ? s.quoted(pattern) : undefined);
      }
      case 'write_file': return show('write', s.write, leaf(stringArg(args, 'path')));
      case 'edit_file': return show('write', s.edit, leaf(stringArg(args, 'path')));
      case 'append_file': return show('write', s.append, leaf(stringArg(args, 'path')));
      case 'delete_file': return show('delete', s.delete, leaf(stringArg(args, 'path')));
      case 'save_blob': return show('save', s.save, leaf(stringArg(args, 'path')));
      case 'cua_screenshot': return show('look', s.screen);
      case 'cua_windows': return show('look', s.windows);
      case 'cua_click': {
        const text = clickText(s, args, done);
        return text ? show('click', text) : null;
      }
      case 'cua_move': return show('click', s.move);
      case 'cua_drag': return show('click', s.drag);
      case 'cua_scroll': return show('scroll', s.scroll);
      case 'cua_focus': return show('click', s.focus);
      case 'cua_type': return show('type', s.type);
      case 'cua_key': return show('type', s.key, stringArg(args, 'keys'));
      case 'cua_wait': {
        const seconds = numberArg(args, 'seconds');
        return show('wait', s.wait, seconds === undefined ? undefined : s.seconds(seconds));
      }
      case 'alarm_set': {
        const minutes = numberArg(args, 'in_minutes');
        return show('alarm', s.alarmSet, stringArg(args, 'at') || (minutes === undefined ? undefined : s.minutesLater(minutes)));
      }
      case 'alarm_list': return show('alarm', s.alarmList);
      case 'alarm_cancel': return show('alarm', s.alarmCancel);
      case 'terminal_send': case 'end_turn': return null;
      default: return undefined;
    }
  };
}
