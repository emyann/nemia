/**
 * How much of another party's words a log returns (agent-runtime, src/core/quote.ts, `endOf`): the end of `text`, kept within `max`
 * characters under a first line `said` that says it was cut, wherever it was — `text` longer than `max`, or something already cut
 * before it was handed over (`cut`: a part quoted, a history read only in part). Whole, and with no such line, when nothing was cut.
 * `quote` keeps a value's start, for a sentence; `endOf` keeps a log's end, where the latest of a session is: its state and its
 * last words. A remote agent's `logs` is read through it (`logsOfTask`, `src/a2a/map.ts`), so that a Task that answers with a
 * 100,000-character artifact puts its last `max` characters on `logs`, and says where the whole is.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Whether anything of `text` is cut: something was before it was handed over, or it is longer than `max`. */
const isCut = (text: string, max: number, cut: boolean): boolean => cut || text.length > max;

const endOfSpec = spec<(text: string, max: number, said: string, cut: boolean) => string>({
  requires: ({ input: [, max, said] }) => Number.isSafeInteger(max) && said.length + 1 < max,
  ensures: {
    withinMax: {
      description: 'What a log returns is never longer than its bound, whatever the other party sent',
      condition: ({ input: [, max], output }) => output.length <= max,
    },
    wholeWhenNothingIsCut: {
      description: 'Words that fit, and of which nothing was cut before, are returned whole, with no line saying a cut',
      condition: ({ input: [text, max, , cut], output }) => (isCut(text, max, cut) ? true : output === text),
    },
    saysItCut: {
      description: 'Words cut anywhere are returned under a first line that says so',
      condition: ({ input: [text, max, said, cut], output }) => (isCut(text, max, cut) ? output.startsWith(said + '\n') : true),
    },
    addsNothing: {
      description: 'What follows the line that says a cut is an end of the words, as they were said',
      condition: ({ input: [text, max, said, cut], output }) =>
        isCut(text, max, cut) ? text.endsWith(output.slice(said.length + 1)) : true,
    },
    keepsAsMuchAsFits: {
      description: 'Words cut keep as much of their end as fits under that line, all of them where they are shorter',
      condition: ({ input: [text, max, said, cut], output }) =>
        isCut(text, max, cut) ? output.length === max || output === said + '\n' + text : true,
    },
  },
});

export type EndOf = Implementation<typeof endOfSpec>;
