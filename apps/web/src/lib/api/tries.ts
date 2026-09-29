/**
 * A step's tries, as a run's detail carries them (apps/api/src/detail/tries.ts), with the files a closeout named (agent-orchestrator's
 * artifacts/artifacts.store.ts) and its check's logs (logs.ts).
 */

/**
 * Mirrors `StepArtifact` in apps/api/src/steps/artifacts.ts: a file a closeout named. One the api serves from the step's files
 * directory has its name, the `url` to read it by, its kind and size; one that directory held until `wf prune --artifacts`
 * removed it has the words that say so, `pruned`, and that moment, `prunedAt`; anything else is the path alone.
 */
export type StepArtifact =
  | { path: string }
  | { path: string; name: string; url: string; kind: 'image' | 'text' | 'other'; size: number }
  | { path: string; pruned: string; prunedAt: string };

/** Mirrors `StepReply` in apps/api/src/detail/tries.ts: a loop's target's answer to one finding. */
export type StepReply = { finding: string; answer: string; why: string };

/**
 * Mirrors `StepCloseout` in apps/api/src/detail/tries.ts: with what it gave of its declared output, what it did not, and its `replies`;
 * each declared field's JSON Schema off the workflow the run froze, and the statement as the engine recorded it (`raw`).
 */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: StepArtifact[];
  output: Record<string, unknown>;
  missing: string[];
  replies: StepReply[] | null;
  schema: Record<string, unknown>;
  raw: unknown;
};

/**
 * Mirrors `StepCheck` in apps/api/src/steps/logs.ts: the command a step is judged by, from the workflow the run
 * froze, its task and verdict — `passed`, `exit 1`, `unfinished`, `checking` — and once its check refused, the
 * exit in `wf ls`'s words and the end of each stream. `stdout` is null on an earlier try's check, whose output the api does not read.
 */
export type StepCheck = {
  command: string;
  taskId: string | null;
  verdict: string | null;
  refused: { exit: string; stdout: StepLog | null; stderr: StepLog; unreadable: string | null } | null;
};

/**
 * Mirrors `StepUnreadable` in apps/api/src/detail/tries.ts: a closing statement the api could not read, its words for why, and the
 * statement as it came.
 */
export type StepUnreadable = { error: string; raw: unknown };

/**
 * Mirrors `StepTry` in apps/api/src/detail/tries.ts: one try of a step, earliest first. `then` is what replaced it, null on the current
 * try, which `current` marks; `note` how it was reached, in `wf ls`'s words. `status` is the step's word on the current try, and
 * the engine's word for the task on an earlier one.
 */
export type StepTry = {
  try: number;
  round: number;
  then: 'retries' | 'nudge' | 'fresh' | 'recheck' | 'round' | 'signoff' | 'back' | null;
  current: boolean;
  taskId: string | null;
  note: string | null;
  status: string;
  attempts: StepAttempts;
  check: StepCheck | null;
  closeout: StepCloseout | null;
  /** A statement it gave that could not be read: why, and the statement as it came. `closeout` is null then. */
  unreadable: StepUnreadable | null;
  /** What a person said to this try when they asked for it — `wf decide`'s `your answer` — or null. */
  answer: string | null;
};

/**
 * Mirrors `StepAttempts` in apps/api/src/detail/tries.ts. `endedAt` is when the latest attempt ended — the
 * engine's `Attempt.endedAt` — and null while it runs, or where the engine's record has none.
 */
export type StepAttempts = {
  count: number;
  latest: { startedAt: string; ended: string | null; endedAt: string | null; reason: string | null } | null;
};

/** Mirrors `StepLog` in apps/api/src/steps/logs.ts. */
export type StepLog = { lines: string[]; truncated: boolean };
