/**
 * `nemia rm` and `nemia prune` as the client (`apps/cli`, `src/commands/runs/forget.ts`) runs them over the api, a run at a time on each
 * entry's handler (`RM`, `PRUNE`), for a test of what they do to the store and the engine: each run named judged on its own, a removal
 * answered as the handler's data (`forgot`, what the api answers the client to word), the prune's own lines said, and a refusal or a
 * failure said `<id>  not forgotten: …` (`not pruned`); a
 * prune of no run named judges the runs that are over, as the client lists them (`status.state=finished`), and says nothing of one with
 * nothing to prune. A prune previews each run first
 * (nothing removed), says the space they hold together, and removes them on `--yes` alone: no person answers here. Once every run has
 * had its say, the error it ends with names those left, exit 2, or 1 where one failed otherwise than by a refusal.
 */
import type { Effect } from 'effect';
import { type Args, Invalid, parseArgv, PRUNE, RM, sizeOf } from '../src/runner.ts';
import { listRuns } from '../testing.ts';
import type { Forgot } from '../src/run.ts';

/**
 * What a command typed printed, a line each; of `nemia rm`, what the handler answered of each run it forgot, in the order named
 * (`forgot`); and the error it ended with, if it did.
 */
export type Typed = { printed: string[]; forgot: Forgot[]; error: (Error & { exitCode?: number; _tag?: string }) | undefined };

/** What the two handlers need, the same of each: the store, its engine and its place, which a stage's `runWith` gives. */
type Needs = Effect.Services<ReturnType<typeof RM.handler>>;

/** An entry's handler run over the test's engine and place, as its stage runs one. */
export type Run = <A, E>(effect: Effect.Effect<A, E, Needs>) => Promise<A>;

/** The words of an error, and whether it is a refusal (exit 2) rather than a failure. */
const saidOf = (err: unknown) =>
  ({
    words: err instanceof Error ? err.message : String(err),
    refusal: (err as { exitCode?: number }).exitCode === 2,
  }) satisfies { words: string; refusal: boolean };

/** A run's line of what was refused: the words as they are where they already open with the run, else after `<id>  not <did>:`. */
const lineOf = (id: string, did: string, words: string) => (words.startsWith(`${id}  `) ? words : `${id}  not ${did}: ${words}`);

/** The end of a command that judged each run on its own: none, or the error naming those left, exit 2, or 1 where one failed. */
function ended(verb: 'rm' | 'prune', did: string, left: readonly string[], failed: boolean) {
  if (!left.length) {
    const made: Typed['error'] = undefined;
    return made;
  }
  const message = `nemia ${verb}: ${left.join(', ')} not ${did} — ${left.length > 1 ? 'each' : 'its'} line above says why, and what to do.`;
  {
    const made: Typed['error'] = Object.assign(new Error(message), { exitCode: failed ? 1 : 2 });
    return made;
  }
}

/** A command line read by `entry`'s words, as the client reads it: its arguments, or its refusal (`Invalid`, exit 2) said as the error. */
function read(entry: typeof RM | typeof PRUNE, rest: readonly string[]) {
  let read: { args: Args } | { refused: Typed };
  try {
    const args = parseArgv(entry.spec, [...rest]) ?? {};
    const wrong = entry.check?.(args);
    read = wrong ? { refused: { printed: [], forgot: [], error: new Invalid({ message: wrong }) } } : { args };
  } catch (err) {
    read = { refused: { printed: [], forgot: [], error: new Invalid({ message: err instanceof Error ? err.message : String(err) }) } };
  }
  return read;
}

/** `nemia rm <runId>... [--delete-branches [--force-unmerged]]`, a run at a time on `RM`, refusing as the api does. */
async function rmTyped(run: Run, rest: readonly string[]) {
  const typed = read(RM, rest);
  if ('refused' in typed) return typed.refused;
  const { args } = typed;
  const ids = Array.isArray(args.runId) ? args.runId : [];
  const printed: string[] = [];
  const forgot: Forgot[] = [];
  const left: string[] = [];
  let failed = false;
  for (const runId of ids) {
    try {
      const done = await run(
        RM.handler({ runId, deleteBranches: args.deleteBranches === true, forceUnmerged: args.forceUnmerged === true, refuses: true }),
      );
      forgot.push(done.forgot);
    } catch (err) {
      const { words, refusal } = saidOf(err);
      printed.push(lineOf(runId, 'forgotten', words));
      left.push(runId);
      failed ||= !refusal;
    }
  }
  {
    const made: Typed = { printed, forgot, error: ended('rm', 'forgotten', left, failed) };
    return made;
  }
}

/** `nemia prune [<runId>...] [--unmerged] [--artifacts] [--yes]`, previewed a run at a time on `PRUNE`, then removed on `--yes`. */
async function pruneTyped(run: Run, home: string, rest: readonly string[]) {
  const typed = read(PRUNE, rest);
  if ('refused' in typed) return typed.refused;
  const { args } = typed;
  const named = Array.isArray(args.runId) ? args.runId : [];
  const how = { unmerged: args.unmerged === true, artifacts: args.artifacts === true, refuses: true };
  const ids = named.length ? named : listRuns(home).map((r) => r.id);
  const printed: string[] = [];
  const left: string[] = [];
  const ready: { runId: string; bytes: number }[] = [];
  let failed = false;
  for (const runId of ids) {
    try {
      const preview = await run(PRUNE.handler({ runId, ...how, yes: false }));
      printed.push(...preview.lines);
      ready.push({ runId, bytes: preview.worktrees.reduce((sum, w) => sum + w.bytes, 0) + (preview.artifacts?.bytes ?? 0) });
    } catch (err) {
      const { words, refusal } = saidOf(err);
      const nothing = words.startsWith('Nothing to prune');
      if (nothing && named.length) printed.push(`${runId}  ${words}`);
      if (nothing || (!named.length && /\bit is not over\b/.test(words))) continue;
      printed.push(lineOf(runId, 'pruned', words));
      if (!named.length) continue;
      left.push(runId);
      failed ||= !refusal;
    }
  }
  if (!ready.length) {
    if (!left.length) printed.push(named.length ? 'nothing to prune' : 'nothing to prune: no run that is over has a worktree left');
    {
      const made: Typed = { printed, forgot: [], error: ended('prune', 'pruned', left, failed) };
      return made;
    }
  }
  printed.push(`${ready.length} run${ready.length > 1 ? 's' : ''} to prune, ${sizeOf(ready.reduce((sum, r) => sum + r.bytes, 0))} in all`);
  if (args.yes !== true) {
    const flags = [...(how.unmerged ? ['--unmerged'] : []), ...(how.artifacts ? ['--artifacts'] : []), '--yes'];
    printed.push(`nothing removed: nemia prune ${[...(named.length ? ready.map((r) => r.runId) : []), ...flags].join(' ')} removes them`);
    {
      const made: Typed = { printed, forgot: [], error: ended('prune', 'pruned', left, failed) };
      return made;
    }
  }
  for (const { runId } of ready) {
    try {
      const done = await run(PRUNE.handler({ runId, ...how, yes: true }));
      printed.push(...done.lines);
      if (!done.pruned || done.left.length) left.push(runId);
    } catch (err) {
      const { words, refusal } = saidOf(err);
      printed.push(lineOf(runId, 'pruned', words));
      left.push(runId);
      failed ||= !refusal;
    }
  }
  {
    const made: Typed = { printed, forgot: [], error: ended('prune', 'pruned', left, failed) };
    return made;
  }
}

/** `nemia rm …` or `nemia prune …` (`argv`, its verb first), as the client runs it, on the store `home` over `run`. */
export function forgetTyped(run: Run, home: string, argv: readonly string[]) {
  const [verb, ...rest] = argv;
  if (verb === 'rm') return rmTyped(run, rest) satisfies Promise<Typed>;
  if (verb === 'prune') return pruneTyped(run, home, rest) satisfies Promise<Typed>;
  throw new Error(`forgetTyped runs nemia rm and nemia prune, and was given ${verb}: run it through the stage's main`);
}
