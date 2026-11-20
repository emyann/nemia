/**
 * `nemia quota [--json]` (`server.quota`): the subscription's quota as the api reads it, a line a window with its used share and when it
 * resets, or the api's own sentence why there is none, followed by the last reading that had windows where the api keeps one. The api
 * answers every state with a 200, so the runner exits 0 for each.
 */
import { type Args, type Quota, QUOTA_WORDS, type QuotaWindow } from 'objects';
import { asked } from '../../objects.ts';
import { said, switchArg } from '../requests.ts';

/**
 * A window as a line says it: its label, its used share whole, when it resets, and the mark where it is past the board's.
 * @param w The window, as the api answers it.
 * @param markAt The percent of a window at which the board marks it.
 */
const windowLine = (w: QuotaWindow, markAt: number) =>
  `  ${w.label}: ${Math.round(w.usedPercentage)}% used, ` +
  (w.resetsAt === null ? 'no reset given' : `${w.reset ? 'reset' : 'resets'} ${w.resetsAt}`) +
  (w.marked ? `, past ${markAt}%` : '');

/**
 * `nemia quota`'s lines: fresh, when it was read and a line a window; else the api's sentence, then the last reading's windows under
 * the time it was asked, where the api keeps one.
 * @param read The quota the api answers.
 */
export const quotaLines = (read: Quota) => {
  if (read.state === 'fresh')
    return [
      `the quota${read.subscription === null ? '' : ` of ${read.subscription}`}, read at ${read.askedAt ?? 'an unknown time'}:`,
      ...read.windows.map((w) => windowLine(w, read.markAt)),
    ];
  return [
    read.said ?? read.state,
    ...(read.last === null
      ? []
      : [`the last reading, at ${read.last.askedAt}:`, ...read.last.windows.map((w) => windowLine(w, read.markAt))]),
  ];
};

/**
 * `nemia quota`'s runner: the quota, in lines or, with `--json`, whole.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function quota(args: Args) {
  const read = await asked(QUOTA_WORDS.name, (c) => c.server.quota());
  said(switchArg(args, 'json') ? [JSON.stringify(read, null, 2)] : quotaLines(read));
  return 0;
}
