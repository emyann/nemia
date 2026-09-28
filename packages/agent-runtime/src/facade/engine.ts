/**
 * `createEngine`: the engine without Effect, built over the adapters and refusals of `consumer.ts`.
 */
import { Effect, Exit, Layer } from 'effect';
import path from 'node:path';
import os from 'node:os';
import { fold, nameFor, type Said, type Sighting, type State } from '../core/domain.ts';
import { isLive, phaseWordOf, waitsOnPerson } from '../core/session.ts';
import { argsRefusalOf } from '../harness/args.ts';
import { Journal } from '../core/engine/journal.ts';
import { Runner, RunnerError, type ExpectedSession, type RunnerOps } from '../harness/seam.ts';
import { claudeSayRefuses } from '../harness/claude/inbox.ts';
import { isClaudeJob } from '../harness/claude/code.ts';
import { isTranscriptCursor, noTranscript } from '../harness/transcript.ts';
import { codex } from '../harness/codex/codex.ts';
import { claudeDetached } from '../harness/claude/code.ts';
import { composite } from '../harness/seam.ts';
import { a2aOps, type SeamOps } from '../a2a/client.ts';
import { ioCounts } from '../core/engine/tally.ts';
import { tickMemoLayer } from '../core/engine/memo.ts';
import { admit, answer, answerRefusalOf, close, file, filingOf, refusalOf, requestStop } from '../core/engine/filing.ts';
import { everyView, tick, tickRefusalOf, viewOfState, viewsOf } from '../core/engine/engine.ts';
import {
  journalOf,
  handleOf,
  isSpec,
  isRemote,
  isClaude,
  runnersOf,
  optionsRefusalOf,
  harnessRefusalOf,
  type EngineOptions,
  type ObserveCount,
  type Engine,
} from './consumer.ts';

/**
 * An engine over `options`: the file-backed store under `root` (`~/.agent-engine` by default) or the `journal` given, and the
 * `harnesses` given — by default `claude`, `codex` and `claude-detached`. The default harness, `defaultHarness` or else the
 * first, takes a task that names none, and answers `logs`, `transcript` and `say` for a task whose harness this engine does not
 * have, whose `view` asks no harness. Refused — throws an `Error` whose `exitCode` is 2 — for what `optionsRefusalOf` refuses.
 *
 * Built once, and shared by every call as services are shared inside one Effect program, each method an Effect provided and run:
 *
 * - the store, and for the file store its `subscribe`, which pushes to `watch`;
 * - each harness behind its A2A agent, reached through the SDK's client in this process (`a2a/client.ts`): the agent holds
 *   nothing, and answers a task it never started off the harness and this journal, so a restart loses no session. A remote
 *   agent is A2A already, spoken to by the SDK's client over HTTP, and wrapped in no seam of ours;
 * - every observe of a harness — a pass's, a view's, and an `observeFor`, an observe told what to look for — made through its
 *   runner and counted on the way (`ObserveCount`, `io`), where `spawned` says whether it asked a registry;
 * - one memo of the settled tasks its passes may skip (`core/engine/memo.ts`), which lives as long as this engine, so a new engine
 *   folds every task on its first pass.
 */
export function createEngine(options: EngineOptions = {}): Engine {
  const refused = optionsRefusalOf(options);
  if (refused) throw Object.assign(new Error(`createEngine: ${refused}`), { exitCode: 2 });
  const root = options.root ?? path.join(os.homedir(), '.agent-engine');
  const harnesses = options.harnesses ?? {
    claude: 'claude',
    codex,
    'claude-detached': claudeDetached,
  };
  const fallback = options.defaultHarness ?? Object.keys(harnesses)[0] ?? 'claude';

  const journalOps = options.journal ? undefined : Journal.filesOps(root);
  const journal = options.journal ? journalOf(options.journal) : Journal.layer(journalOps!);
  const events = (taskId: string) => Effect.runPromise(Effect.flatMap(Journal, (j) => j.read(taskId)).pipe(Effect.provide(journal)));
  const observed: Record<string, ObserveCount> = {};
  const counted = <R extends RunnerOps>(name: string, ops: R): R => {
    const count = <A>(look: Effect.Effect<A, RunnerError>, read: (a: A) => { listed: number; unread: boolean }) =>
      Effect.suspend(() => {
        const t0 = performance.now();
        const spawned = ioCounts().spawned;
        return Effect.onExit(look, (exit) =>
          Effect.sync(() => {
            const o = (observed[name] ??= { calls: 0, ms: 0, listed: 0, spawned: 0, unread: 0 });
            o.calls++;
            o.ms += performance.now() - t0;
            o.spawned += ioCounts().spawned - spawned;
            const r = Exit.isSuccess(exit) ? read(exit.value) : { listed: 0, unread: true };
            o.listed += r.listed;
            if (r.unread) o.unread++;
          }),
        );
      });
    const observeFor = ops.observeFor;
    return {
      ...ops,
      observe: count(ops.observe, (m) => ({ listed: m.size, unread: false })),
      ...(observeFor
        ? {
            observeFor: (expected: readonly ExpectedSession[]) =>
              count(observeFor(expected), (o) => ({ listed: o.seen.size, unread: o.unread.size > 0 })),
          }
        : {}),
    };
  };
  const observedNow = (): Record<string, ObserveCount> => Object.fromEntries(Object.entries(observed).map(([name, o]) => [name, { ...o }]));
  const runners = Object.fromEntries(
    Object.entries(runnersOf(harnesses, root, options.credentials, options.missingCredential)).map(([name, ops]): [string, SeamOps] => [
      name,
      counted(name, isRemote(harnesses[name]) ? ops : a2aOps(name, ops, events)),
    ]),
  );
  const layer = Layer.mergeAll(journal, Runner.layer(composite(runners, fallback)), tickMemoLayer());
  const go = <A, E>(e: Effect.Effect<A, E, Journal | Runner>): Promise<A> => Effect.runPromise(e.pipe(Effect.provide(layer)));

  const harnessOf = (state: State) => {
    const asked = state.harness ?? fallback;
    return Object.hasOwn(runners, asked) ? asked : fallback;
  };

  const viewOf = (taskId: string) =>
    Effect.gen(function* () {
      const events = yield* Effect.flatMap(Journal, (j) => j.read(taskId));
      const state = fold(taskId, events);
      const last = state.attempts.at(-1);
      const { find, observe, observeFor } = runners[harnessOf(state)];
      const look = observeFor
        ? observeFor(state.attempts.map((a) => ({ name: nameFor(taskId, a.n), harness: state.harness }))).pipe(Effect.map((o) => o.seen))
        : observe;
      const observed = look.pipe(
        Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())),
        Effect.map((o) => viewOfState(state, o)),
      );
      const recorded = Effect.sync(() => viewOfState(state, new Map()));
      if (!Object.hasOwn(runners, state.harness ?? fallback)) return yield* recorded;
      if (!state.settled && (!find || last?.ended === null)) return yield* observed;
      if (!last || (find && last.nativeId)) return yield* recorded;
      const found = find ? yield* find(nameFor(taskId, last.n)).pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined;
      if (found) return { ...(yield* recorded), sessionId: found.sessionId };
      if (!state.settled) return yield* observed;
      const v = yield* recorded;
      return { ...v, sessionId: handleOf(events, last.n) ?? v.sessionId };
    });

  const engine: Engine = {
    file: async (spec) => {
      const task = { ...spec, harness: spec.harness ?? fallback };
      const refused = refusalOf(task) ?? argsRefusalOf(task) ?? harnessRefusalOf(task, harnesses);
      if (refused) throw Object.assign(new Error(`file: ${refused}`), { exitCode: 2 });
      return go(file(task));
    },
    tick: async (...args: unknown[]) => {
      const refused = tickRefusalOf(args);
      if (refused) throw Object.assign(new Error(`tick: ${refused}`), { exitCode: 2 });
      const t0 = performance.now();
      const before = observedNow();
      const report = await go(tick());
      const during = Object.fromEntries(
        Object.entries(observedNow()).flatMap(([name, o]): Array<[string, ObserveCount]> => {
          const b = before[name] ?? { calls: 0, ms: 0, listed: 0, spawned: 0, unread: 0 };
          return o.calls > b.calls
            ? [
                [
                  name,
                  {
                    calls: o.calls - b.calls,
                    ms: o.ms - b.ms,
                    listed: o.listed - b.listed,
                    spawned: o.spawned - b.spawned,
                    unread: o.unread - b.unread,
                  },
                ],
              ]
            : [];
        }),
      );
      return { ...report, ms: performance.now() - t0, observed: during };
    },
    admit: async (taskIds) => {
      const refuse = (why: string) => Object.assign(new Error(`admit: ${why}`), { exitCode: 2 });
      return go(admit(taskIds).pipe(Effect.catchTag('AdmitRefused', (e) => Effect.fail(refuse(e.message)))));
    },
    io: () => ({ ...ioCounts(), observed: observedNow() }),
    view: (taskId) => go(viewOf(taskId)),
    list: (...args: unknown[]) => {
      const [taskIds] = args;
      if (args.length > 1 || (taskIds !== undefined && (!Array.isArray(taskIds) || !taskIds.every((id) => typeof id === 'string')))) {
        throw Object.assign(
          new Error(
            `list: takes the task ids to view, a list of strings, or nothing for every task; it was handed ${args.map((a) => JSON.stringify(a)).join(', ')}.`,
          ),
          { exitCode: 2 },
        );
      }
      return go(taskIds === undefined ? everyView() : viewsOf(taskIds));
    },
    stop: (taskId) => go(requestStop(taskId)),
    logs: (taskId) =>
      go(
        Effect.gen(function* () {
          const v = yield* viewOf(taskId);
          if (!v.sessionId) return '(no session yet)';
          return yield* runners[harnessOf(v.state)].logs(v.sessionId);
        }),
      ),
    transcript: async (taskId, after) => {
      const refuse = (why: string) => Object.assign(new Error(`transcript: ${why}`), { exitCode: 2 });
      const events = await go(Effect.flatMap(Journal, (j) => j.read(taskId)));
      if (!events.length) throw refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      const harness = harnessOf(state);
      const runner = runners[harness];
      const read = runner.transcriptOf;
      if (!read)
        throw refuse(`the \`${harness}\` harness keeps no conversation this engine can read. \`logs\` gives what its session printed.`);
      const h = harnesses[harness];
      if (after !== undefined && (isClaude(h) || isSpec(h)) && !isTranscriptCursor(after)) {
        throw refuse(
          `\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`,
        );
      }
      const start = noTranscript().cursor;
      const nothing = { events: [], cursor: after ?? start };
      const last = state.attempts.at(-1);
      if (!last) return nothing;
      return (await go(read(nameFor(taskId, last.n), after === start ? undefined : after))) ?? nothing;
    },
    say: async (taskId, text) => {
      const refuse = (why: string) => Object.assign(new Error(`say: ${why}`), { exitCode: 2 });
      const resume = 'Continue its session with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.';
      if (typeof text !== 'string' || !text.trim()) throw refuse('`text` is empty. Give the words the session should hear.');
      const events = await go(Effect.flatMap(Journal, (j) => j.read(taskId)));
      if (!events.length) throw refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      const harness = harnessOf(state);
      const runner = runners[harness];
      const h = harnesses[harness];
      const deliver = runner.say;
      const last = state.attempts.at(-1);
      if (!deliver) {
        throw refuse(
          (isSpec(h) ? h.noChannel : undefined) ?? `the \`${harness}\` harness has no channel into a running session. ${resume}`,
        );
      }
      const bgRefuses = () => claudeSayRefuses(state.config ?? {}, text);
      const cannot = h === 'claude-bg' || (h === 'claude' && state.config?.background) ? bgRefuses() : undefined;
      if (cannot) throw refuse(cannot);
      if (state.settled)
        throw refuse(`\`${taskId}\` has settled (${state.settled}): no session of it is running to hear anything. ${resume}`);
      if (state.stopRequested) throw refuse(`\`${taskId}\` has been asked to stop: its session is being stopped, not steered. ${resume}`);
      if (!last)
        throw refuse(
          `\`${taskId}\` has not started an attempt yet, so there is no session to hear anything. Ask again once \`ae ls\` shows it running.`,
        );
      if (last.ended !== null) throw refuse(`\`${taskId}\` has no attempt running: attempt ${last.n} ended \`${last.ended}\`. ${resume}`);
      const name = nameFor(taskId, last.n);
      let observed: Map<string, Sighting>;
      try {
        observed = await go(runner.observe);
      } catch (e) {
        throw new Error(
          `say: the \`${harness}\` registry could not be read (${e instanceof Error ? e.message : String(e)}), so ${name} could not be found. Nothing was said; ask again.`,
          { cause: e },
        );
      }
      const sighting = observed.get(name);
      if (!sighting && isClaude(h) && runner.find) {
        const registered = await go(runner.find(name)).catch(() => undefined);
        if (registered)
          throw new Error(
            `say: the \`${harness}\` registry could not be read, or did not list ${name}, which Claude Code has registered. Nothing was said; ask again.`,
          );
      }
      if (!sighting)
        throw refuse(
          `\`${taskId}\`'s attempt ${last.n} is not running yet: its harness lists no \`${name}\`. Ask again once \`ae ls\` shows it running.`,
        );
      const cannotBg = h === 'claude' && !isClaudeJob(sighting.sessionId) ? bgRefuses() : undefined;
      if (cannotBg) throw refuse(cannotBg);
      if (!isLive(sighting.state)) {
        throw refuse(
          `\`${taskId}\`'s session is \`${phaseWordOf(sighting.state)}\` on its harness, not running: the next pass writes its end. ${resume}`,
        );
      }
      if (isRemote(h) && !waitsOnPerson(sighting.state)) {
        throw refuse(
          `\`${taskId}\` runs on the \`${harness}\` remote A2A agent, whose Task takes words only once it asks for input, and it is at work. Say them when \`ae ls\` shows it waiting, or ${resume.charAt(0).toLowerCase()}${resume.slice(1)}`,
        );
      }
      try {
        await go(deliver({ name, sessionId: sighting.sessionId }, text));
      } catch (e) {
        throw new Error(`say: ${name} was not given the words (${e instanceof Error ? e.message : String(e)}). Nothing was journalled.`, {
          cause: e,
        });
      }
      const said: Said = { at: new Date().toISOString(), attempt: last.n, text };
      try {
        await go(Effect.flatMap(Journal, (j) => j.append(taskId, { kind: 'said', ...said })));
      } catch (e) {
        throw new Error(
          `say: ${name} was given the words, but they could not be journalled (${e instanceof Error ? e.message : String(e)}): the record does not show them.`,
          { cause: e },
        );
      }
      return said;
    },
    answer: async (taskId, text, options = {}) => {
      const refuse = (why: string) => Object.assign(new Error(`answer: ${why}`), { exitCode: 2 });
      if (Object.hasOwn(options, 'budgetUsd')) {
        throw refuse(
          "`budgetUsd` is the harness's configuration: give it under `config`, as `answer(id, text, { config: { budgetUsd: … } })`.",
        );
      }
      const { config } = options;
      const events = await go(Effect.flatMap(Journal, (j) => j.read(taskId)));
      const state = events.length ? fold(taskId, events) : undefined;
      const refused =
        answerRefusalOf(taskId, state, text, config) ??
        (state && config ? harnessRefusalOf({ ...filingOf(state, config), harness: harnessOf(state) }, harnesses) : undefined);
      if (refused) throw refuse(refused);
      return go(answer(taskId, text, config).pipe(Effect.catchTag('InputRefused', (e) => Effect.fail(refuse(e.message)))));
    },
    close: async (taskId) => {
      const refuse = (why: string) => Object.assign(new Error(`close: ${why}`), { exitCode: 2 });
      return go(close(taskId).pipe(Effect.catchTag('InputRefused', (e) => Effect.fail(refuse(e.message)))));
    },
    feed: (after = 0) => go(Effect.flatMap(Journal, (j) => j.feed(after))),

    watch: ({ onEntry, from = 0, intervalMs = 1_000, onError }) => {
      let cursor = from;
      let stopped = false;
      let draining = false;

      const drain = async () => {
        if (stopped || draining) return;
        draining = true;
        try {
          for (;;) {
            const got = await engine.feed(cursor);
            if (!got.entries.length && !got.refused?.length) break;
            cursor = got.cursor;
            for (const r of got.refused ?? []) onError?.(new Error(r.why));
            for (const entry of got.entries) {
              if (stopped) return;
              await onEntry(entry);
            }
          }
        } catch (e) {
          onError?.(e);
        } finally {
          draining = false;
        }
      };

      const unsubscribe = journalOps?.subscribe?.(() => void drain());
      const timer = setInterval(() => void drain(), intervalMs);
      void drain();

      return {
        stop: () => {
          stopped = true;
          clearInterval(timer);
          unsubscribe?.();
        },
      };
    },

    start: (o = {}) => {
      const every = o.intervalMs ?? 3_000;
      let running = false;
      let stopped = false;
      const timer = setInterval(async () => {
        if (running || stopped) return;
        running = true;
        try {
          o.onTick?.(await engine.tick());
        } catch (e) {
          o.onError?.(e);
        } finally {
          running = false;
        }
      }, every);
      return {
        stop: () => {
          stopped = true;
          clearInterval(timer);
        },
      };
    },
  };

  return engine;
}
