/** What sessions consumed, in `wf decide`'s words: a step's, several steps' together, and what a run's sessions read. */
import { consumption, dollars, peakMark, readWords, sumUsage, usedLines } from 'agent-workflows';
import type { Workflow } from 'agent-workflows/workflow';

/** What a session consumed as the engine's `Usage` carries it: a count nobody measured is absent, never 0. */
export type Usage = NonNullable<ReturnType<typeof consumption>[string]>;

/**
 * What a step consumed, summed over the attempts of its current try (`consumption`), and in the words `wf decide`
 * prints beside its check (`usedLines`) — `used` and `cost`, each `not measured` where nobody counted, never `0`.
 * `costUsd`, `apiMs` and `toolMs` are the engine's, off the same usage — what the harness priced the session at, and the
 * time it counted waiting on the model and running tools — each null where nobody measured it.
 */
export type StepUsed = {
  usage: Usage | null; used: string; cost: string; costUsd: number | null; apiMs: number | null; toolMs: number | null;
  /**
   * What the sessions read, by price, as `wf decide` says it beside the cost (`readWords`): `read 21.4M · wrote 412k · peak 167k`, the peak
   * against the step's `context:` cap, and a resumed session that rebuilt its cache. Null where the runner measured none of it.
   */
  read: string | null;
  /**
   * Where the peak stands (`peakMark`): `cap` once the session reached the step's `context:` cap — it compacted, or its peak got there —
   * `large` past 200k on a step with none; null otherwise.
   */
  peak: 'cap' | 'large' | null;
  /** How many resumed sessions wrote their context to the cache again instead of reading it (`rebuiltCache`); 0 where none did, or nobody could tell. */
  rebuilt: number;
};

/** What a run's sessions read, as `StepUsed` has it: the words, where the peak stands, and how many resumed sessions rebuilt their cache. */
export type RunRead = { said: string; peak: StepUsed['peak']; rebuilt: number };

/**
 * A usage in `wf decide`'s words: `usedLines`, each line without the label it starts with — the cost alone, since what the sessions read
 * is `read` — and the peak against `cap`, the `context:` of the step whose peak it is. `read` is the usage the words and the mark are of,
 * where that is not all of `usage`.
 */
export function usedOf(usage: Usage | undefined, cap?: number, read: Usage | undefined = usage): StepUsed {
  const [used = ''] = usedLines(usage);
  return {
    usage: usage ?? null, used: used.replace(/^used\s+/, ''), cost: usage?.costUsd !== undefined ? dollars(usage.costUsd) : 'not measured',
    costUsd: usage?.costUsd ?? null, apiMs: usage?.apiMs ?? null, toolMs: usage?.toolMs ?? null,
    read: readWords(read, cap) || null, peak: peakMark(read, cap), rebuilt: read?.rebuiltCaches ?? 0,
  };
}

/**
 * Several steps' usage as one (`sumUsage`), each usage with the name of the step it is of, its peak read against the cap of the step it
 * is the peak of: two steps' caps are not one cap, and the largest peak was reached under its own. So are its compactions: that step's
 * own say whether it reached its cap, and another's, under another cap or none, would say it of a step that did not.
 */
export function totalOf(steps: readonly Workflow[], usages: ReadonlyArray<readonly [name: string, usage: Usage | undefined]>): StepUsed {
  const total = sumUsage(usages.map(([, u]) => u));
  const peakOf = usages.find(([, u]) => total?.peakContextTokens !== undefined && u?.peakContextTokens === total.peakContextTokens)?.[0];
  const compactions = sumUsage(usages.filter(([name]) => name === peakOf).map(([, u]) => u))?.compactions;
  const { compactions: _all, ...rest } = total ?? {};
  return usedOf(total, steps.find((s) => s.name === peakOf)?.context, total && { ...rest, ...(compactions ? { compactions } : {}) });
}

export const readOf = (u: StepUsed): RunRead | null => (u.read === null ? null : { said: u.read, peak: u.peak, rebuilt: u.rebuilt });
