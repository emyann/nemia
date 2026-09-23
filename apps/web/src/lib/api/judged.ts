/** What a run established, as the api judges it (apps/api/src/judged.ts): where it stands, who it waits on, what it cost, what to decide. */

/** Mirrors `RunStatus` in apps/api/src/judged.ts: where `assess` puts the run. */
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * Mirrors `RunToDecide` in apps/api/src/judged.ts: what a person has to decide about a run's result, the fifth reason a run waits on one —
 * `approve`, the gate on its last step, with `step` and `says`, what that step would do in the folder's own words (null for a gated step
 * that has signed off, whose closeout is what to read); or `git`, result branches ahead of the base that nothing in the workflow merges.
 *
 * `said` is the whole of what `wf ls` prints after `→ to decide:`, and `command` the command at the end of it. The board runs neither.
 */
export type RunToDecide =
  /**
   * `back` are the steps a send-back goes to (`sendBackTo`): the step itself once it has a task, the work an ending waits on before it
   * is filed. `onto` is the base branch the run's result is on its way to. What the Factory's card answers the gate with, off the list.
   */
  | { kind: 'approve'; step: string; says: string | null; back: string[]; onto: string | null; said: string; command: string }
  | { kind: 'git'; branches: string[]; said: string; command: string };

/**
 * Mirrors `Spent` in apps/api/src/judged.ts: what sessions cost, as the package adds it up — the dollars of the attempts that ended with a cost on
 * them, how many did and how many ended with none — and `said`, its word for it: `$4.20`, or `≥$4.20` where an ended attempt has no cost on it.
 */
export type Spent = { usd: number; measured: number; unmeasured: number; said: string };

/**
 * Mirrors `RunWaiting` in apps/api/src/judged.ts: what a run started `--after` still waits on, in the package's words. `runs` are each run
 * not shipped, and why one never will without a person (`missing`, `cancelledAt`, `gone`); `word` is what `wf ls` prints on its roots —
 * `waiting on a-1x2y (cancelled)` — and `advice` the line `wf decide` prints under it; `onYou` whether a person has to act.
 */
export type RunWaiting = {
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[] }>;
  word: string;
  advice: string;
  onYou: boolean;
};

/**
 * Mirrors `StepNeeds` in apps/api/src/judged.ts. `needs`: the closeout's, for a step whose current try signed off blocked. `blockedByHarness`:
 * whether the harness marked its session blocked while it gave no closeout — the engine's `needs-human`. `waitingFor`: what that harness
 * says the session waits for, in the package's words — `words` the wait, `advice` what a person does about it — null where the harness said
 * nothing, and on the list as on the detail, since it costs no read of its own. What that session said last is on a run's detail alone
 * (`lastLine`): the list reads no conversation. `approve`: what `wf ls` asks of you for a step waiting at its gate, `approve plan`; null for
 * any other step, and for one already sent back.
 */
export type StepNeeds = { needs: string | null; blockedByHarness: boolean; waitingFor: { words: string; advice: string } | null; approve: string | null };
