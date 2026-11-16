/** Feedback shared by the settings window and its independently bundled panels. */
import { listProblem as readProblem, problemPopover as popup, actionProblem as action } from '../../../shared/ui/problem.ts';
import { S } from './strings.ts';
import { LANGUAGE } from '../language.ts';
export { problemAnchorVisible, scrollerOf, wheelInto, type ProblemAnchor, type ProblemPopover } from '../../../shared/ui/problem.ts';
export const actionProblem: typeof action = (ui, doc, signal) => action(ui, doc, signal, LANGUAGE);
export const problemPopover: typeof popup = (doc, signal) => popup(doc, signal, LANGUAGE);
export const listProblem: typeof readProblem = (doc, text, label = S.retry, retry) => readProblem(doc, text, label, retry);
