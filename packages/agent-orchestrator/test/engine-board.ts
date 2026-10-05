/**
 * An engine board a test settles by hand, as the runtime's `Engine` service in a layer (`layer`), which a test hands the client's
 * `engineOf` to get the engine the controllers take: what each task was filed with, every filing, each task stopped, and each task's own
 * session (`native-<id>`). A settled task carries the closeout it is given. A verb the board does not keep dies naming itself.
 */
import { Effect, Layer } from 'effect';
import { Engine, type TaskView } from 'agent-runtime';
import type { TaskPhase } from '../src/run.ts';

/** A task as it was filed: its id and brief, the closeout schema it asks for, its brief's parts, and every other field of its spec. */
type Filed = { id: string; brief: string; closeoutSchema?: object; briefParts?: string[] } & Record<string, unknown>;

/** A task on the board: its spec, its phase, and what its one attempt ended with. */
type BoardTask = { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number };

/** What a task looks like to `view`: pending until filed, then as `settle` left it, with one attempt once it is no longer pending. */
const viewOf = (id: string, t: BoardTask | undefined): TaskView => {
  const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
  return {
    id,
    phase: t?.phase ?? 'pending',
    sessionId: t ? 's' : null,
    state: {
      brief: t?.spec.brief ?? '',
      closeoutSchema: t?.spec.closeoutSchema,
      settled,
      stopRequested: false,
      said: [],
      attempts:
        !t || t.phase === 'pending'
          ? []
          : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: null }],
    },
  } as unknown as TaskView;
};

/** A verb the board does not keep: a test that reaches it has outgrown the board. */
const unkept = (verb: string) => () => Effect.die(new Error(`the engine board keeps no \`${verb}\`: add it to test/engine-board.ts`));

/** A board with no task on it, and the layer that serves it. */
export const board = () => {
  const tasks = new Map<string, BoardTask>();
  const filings: string[] = [];
  const specs: Filed[] = [];
  const stopped: string[] = [];
  const layer = Layer.succeed(Engine)(
    Engine.of({
      file: (spec) =>
        Effect.sync(() => {
          const filed = spec as Filed;
          filings.push(filed.id);
          specs.push(filed);
          tasks.set(filed.id, { spec: filed, phase: 'pending' });
          return filed.id;
        }),
      view: (id) => Effect.sync(() => viewOf(id, tasks.get(id))),
      stop: (id) =>
        Effect.sync(() => {
          stopped.push(id);
        }),
      logs: () => Effect.succeed('(no output yet)'),
      feed: () => Effect.succeed({ entries: [], cursor: 0 }),
      tick: unkept('tick'),
      admit: unkept('admit'),
      list: unkept('list'),
      transcript: unkept('transcript'),
      output: () => Effect.succeed(undefined),
      path: unkept('path'),
      say: unkept('say'),
      quota: unkept('quota'),
      answer: unkept('answer'),
      close: unkept('close'),
      watch: unkept('watch'),
      io: unkept('io'),
      start: unkept('start'),
      sweep: unkept('sweep'),
      removeBody: unkept('removeBody'),
      forget: unkept('forget'),
    }),
  );
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
  return { layer, tasks, filings, specs, stopped, settle };
};
