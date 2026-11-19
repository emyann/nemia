/**
 * A harness's check turn, started and read back: `startTurn` files one tiny real turn through an installed, signed-in harness as an
 * ordinary job of it — its smallest declared model (`turnModel`), its held fence with no allow rule, a spend cap and a deadline, asked for
 * a one-word statement — or answers the one of that harness still running; `turnOf` reads it back through the engine and judges it
 * (`turnCheckOf`), in the harness's own words where it failed. A controller, reaching the runtime through the client, as a fix is.
 */
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Effect } from 'effect';
import { HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import type { HarnessCheck, HarnessTurn, Need, NeedState, ReadinessFix, TurnStart } from 'objects';
import { asked, EngineService, type TaskView } from '../runtime-client.ts';
import { StoreRoot } from '../config/root.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { MOMENTUM } from '../status/status.ts';
import { signInNeedOf } from '../needs/index.ts';
import { checkKey, harnessCheckOf, needsMemo, NeedsMemory, needsOnce } from '../needs/needs.verb.ts';
import { TURN_BUDGET_USD, TURN_DEADLINE_SECONDS, TURN_PROMPT, TURN_SCHEMA, turnCheckOf, type TurnSeen } from './harness-turn.ts';
import { latestTurnRecord, readTurnRecord, turnsDir, writeTurnRecord, type TurnRecord } from './harness-turn.store.ts';

/** How much of the end of a turn's stderr and stdout a failed check reads its harness's words from. */
const TAIL_BYTES = 4096;

/** The longest the harness's words a failed check quotes are, in characters. */
const WORDS_MOST = 300;

/**
 * The harnesses a check turn runs through: each that runs a brief as an agent session and declares the model a check turn runs on
 * (`turnModel`), which it declares only where it ends a session at a spend cap.
 */
export const turnHarnesses = (): string[] =>
  Object.entries(HARNESS_DECLARATIONS).flatMap(([name, d]) => (d.needs?.turnModel !== undefined && d.runsBrief ? [name] : []));

/** A fix a person types: its words and its command. */
const typed = (message: string, command: string): ReadinessFix => ({ message, command, startable: false, kind: 'typed' });

/**
 * The fixes of a failed turn of `harness`: its sign-in's, each typed, since a refusal in the harness's own words is most often a lapsed
 * sign-in.
 */
const turnFixes = (harness: string, needs: readonly Need[]): ReadinessFix[] =>
  (needs.find((n) => n.name === signInNeedOf(harness))?.fixes ?? []).map((f) => typed(f.message, f.command));

/** The statement `closeout` carries as its answer: the `answer` it was asked for, or the text it gave. */
const answerOf = (closeout: unknown): string | undefined => {
  if (typeof closeout === 'string') return closeout;
  if (typeof closeout === 'object' && closeout !== null && 'answer' in closeout && typeof closeout.answer === 'string')
    return closeout.answer;
  return undefined;
};

/** What `view` says of the turn, as `turnCheckOf` reads it. */
const seenOf = (view: TaskView): TurnSeen => {
  const last = view.state.attempts.at(-1);
  const answer = answerOf(last?.closeout);
  return {
    settled: view.state.settled !== null,
    ...(last?.reason === null || last?.reason === undefined ? {} : { end: last.reason }),
    budget: last?.limit === 'budget',
    ...(answer === undefined ? {} : { answer }),
  };
};

/** The last line `text` says, cut to `WORDS_MOST`, or undefined where it says none. */
const lastLine = (text: string): string | undefined => {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .at(-1);
  return line === undefined ? undefined : line.length > WORDS_MOST ? `${line.slice(0, WORDS_MOST)}…` : line;
};

/** What each failure says, before the harness's own words. */
const FAILURE_WORDS = {
  deadline: `it ran past its ${TURN_DEADLINE_SECONDS} seconds`,
  budget: `it reached its cap of $${TURN_BUDGET_USD}`,
  unstarted: 'it never started',
  stopped: 'it was stopped',
  unanswered: 'it answered nothing',
} as const;

/** `n` dollars, as a sentence says a turn's cost. */
const costWords = (n: number): string => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

/**
 * The turn `record` as it stands: its check over its task's view, the cost its last attempt counted, and, where it failed, why in the
 * harness's own words (the last line of its stderr, else of its stdout).
 */
const turnRead = Effect.fnUntraced(function* (record: TurnRecord) {
  const e = yield* EngineService;
  const view = yield* asked('view', e.view(record.taskId));
  const seen = seenOf(view);
  const verdict = turnCheckOf(seen);
  const title = HARNESS_DECLARATIONS[record.harness]?.needs?.title ?? record.harness;
  const costUsd = view.state.attempts.at(-1)?.usage?.costUsd;
  const cost = costUsd === undefined ? '' : `, for ${costWords(costUsd)}`;
  const base = {
    name: 'turn' as const,
    capUsd: TURN_BUDGET_USD,
    turn: record.id,
    at: record.startedAt,
    ...(costUsd === undefined ? {} : { costUsd }),
  };
  const check = yield* Effect.gen(function* (): Effect.fn.Return<HarnessCheck, never, EngineService | StoreRoot> {
    if (verdict.state === 'running')
      return {
        ...base,
        state: 'running',
        message: `a check turn runs through ${title}, capped at ${costWords(TURN_BUDGET_USD)}`,
        fixes: [],
      };
    if (verdict.state === 'passed')
      return {
        ...base,
        state: 'passed',
        message: `${title} answered a check turn${cost}`,
        fixes: [],
        ...(seen.answer === undefined ? {} : { answer: seen.answer }),
      };
    const failure = verdict.failure ?? 'unanswered';
    const err = (yield* asked('output', e.output(record.taskId, 'stderr', TAIL_BYTES))) ?? '';
    const out = (yield* asked('output', e.output(record.taskId, 'stdout', TAIL_BYTES))) ?? '';
    const words = lastLine(err) ?? lastLine(out);
    const needs = (yield* NeedsMemory)?.harnessNeeds ?? needsMemo(yield* StoreRoot).harnessNeeds;
    return {
      ...base,
      state: 'failed',
      failure,
      message: `${title}'s check turn failed: ${FAILURE_WORDS[failure]}${cost}${words === undefined ? '' : `: ${words}`}`,
      fixes: turnFixes(record.harness, needs),
    };
  });
  return { id: record.id, harness: record.harness, check } satisfies HarnessTurn;
});

/**
 * The reading of a harness's need by its name, off this process's memory where it keeps one that has swept, else off a memory read now.
 */
const readingsOf = Effect.fnUntraced(function* (home: string) {
  const kept = yield* NeedsMemory;
  const memo = kept ?? needsMemo(home);
  if (kept === undefined || (memo.version === 0 && memo.readings.size === 0)) yield* needsOnce(memo);
  return (name: string): NeedState | undefined => {
    const need = memo.harnessNeeds.find((n) => n.name === name);
    return need === undefined ? undefined : memo.readings.get(checkKey(harnessCheckOf(need)));
  };
});

/**
 * Starts a check turn through the harness `start` names, and answers it as a `HarnessTurn`, its check `running`: refused (`Missing`)
 * for a harness that runs no check turn (`turnHarnesses`) — none of the runtime's, or one that runs no brief or declares no
 * `turnModel` — and (`Invalid`,
 * naming the fix) while its install or its sign-in is not met; the turn of that harness still running answered in place of a second,
 * unless it was started more than twice its deadline ago, which a task the engine no longer holds reads as.
 * Otherwise filed on the runtime as a job of the harness under `TURN_DEADLINE_SECONDS`, in `<home>/turns`, told `TURN_PROMPT`, asked for
 * a one-word statement (`TURN_SCHEMA`), on its declared `turnModel`, in its held fence with no allow rule, capped at `TURN_BUDGET_USD`;
 * its record kept under `<home>/turns/<id>.json`.
 */
export const startTurn = Effect.fn('startTurn')(function* (start: TurnStart) {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const declaration = HARNESS_DECLARATIONS[start.harness];
  const needs = declaration?.needs;
  const model = needs?.turnModel;
  if (declaration === undefined || needs === undefined || model === undefined || !declaration.runsBrief)
    return yield* Effect.fail(
      new Missing({
        message: `${start.harness} runs no check turn: name one of ${turnHarnesses().join(', ')} (nemia doctor lists the harnesses).`,
      }),
    );
  const reading = yield* readingsOf(home);
  if (reading(start.harness) !== 'met')
    return yield* Effect.fail(
      new Invalid({
        message: `${needs.title} is not installed: nemia doctor fix ${start.harness} installs it, then start the check turn again.`,
      }),
    );
  if (reading(signInNeedOf(start.harness)) !== 'met')
    return yield* Effect.fail(
      new Invalid({
        message: `${needs.title} is not signed in: type ${needs.signIn.fixes[0]?.command ?? `nemia doctor fix ${signInNeedOf(start.harness)}`} on the server as the user the daemon runs as, then start the check turn again.`,
      }),
    );
  const latest = latestTurnRecord(home, start.harness);
  if (latest !== undefined && Date.now() - Date.parse(latest.startedAt) < 2 * TURN_DEADLINE_SECONDS * 1000) {
    const running = yield* turnRead(latest);
    if (running.check.state === 'running') return running;
  }
  const id = `turn-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const held = declaration.reach?.(model).held;
  const fence = declaration.knobs?.fence.key;
  fs.mkdirSync(turnsDir(home), { recursive: true });
  yield* asked(
    'file',
    e.file({
      id,
      harness: start.harness,
      priority: MOMENTUM,
      brief: TURN_PROMPT,
      cwd: turnsDir(home),
      deadlineSeconds: TURN_DEADLINE_SECONDS,
      closeoutSchema: TURN_SCHEMA,
      config: {
        model,
        ...(held === undefined || fence === undefined ? {} : { [fence]: held }),
        budgetUsd: TURN_BUDGET_USD,
      },
    }),
  );
  const record: TurnRecord = { id, harness: start.harness, taskId: id, startedAt: new Date().toISOString() };
  writeTurnRecord(home, record);
  return yield* turnRead(record);
});

/**
 * The check turn `id` as it stands, read through the engine (`turnCheckOf`). Refused (`Missing`) for an id no turn was started under.
 * @param id The turn's id.
 */
export const turnOf = Effect.fn('turnOf')(function* (id: string) {
  const home = yield* StoreRoot;
  const record = readTurnRecord(home, id);
  if (record === undefined)
    return yield* Effect.fail(
      new Missing({ message: `no check turn ${id} was started here: POST /api/readiness/turns starts one, and answers its id.` }),
    );
  return yield* turnRead(record);
});

/**
 * The turn check of the harness `harness`, for its install piece of the readiness read: its latest turn as it stands, or `unrun`, saying
 * how one is run, where none was started.
 * @param home The store's root folder.
 * @param harness The harness's name.
 */
export const latestTurnCheck = Effect.fnUntraced(function* (home: string, harness: string) {
  const latest = latestTurnRecord(home, harness);
  if (latest !== undefined) return (yield* turnRead(latest)).check;
  const title = HARNESS_DECLARATIONS[harness]?.needs?.title ?? harness;
  return {
    name: 'turn',
    state: 'unrun',
    message: `no check turn has run through ${title}: run one from the board's Setup, capped at ${costWords(TURN_BUDGET_USD)}`,
    fixes: [],
    capUsd: TURN_BUDGET_USD,
  } satisfies HarnessCheck;
});
