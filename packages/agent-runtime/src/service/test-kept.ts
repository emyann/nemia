/** The stand-in's `kept` (`testEngine`), in a file of its own: `test-engine.ts` is at its length. */
import { Effect } from 'effect';
import { JournalError } from '../core/engine/index.ts';
import type { EngineShape } from './engine.ts';
import { KeptRefused, type KeptReport } from './kept.ts';
/** What `kept` reads of a task the stand-in holds: the harness it was filed on. */
type Held = ReadonlyMap<string, { readonly spec: { readonly harness?: string } }>;

/** What a test plants of a task for `kept` to answer, in bytes: a part left out is 0, and `records` left out is no record kept. */
export type TestKeeps = {
  readonly journal?: number;
  readonly bodies?: number;
  readonly output?: number;
  readonly files?: number;
  readonly records?: number;
};

/**
 * `kept` over the tasks a stand-in holds and the sizes planted: refuses an argument as the engine does, fails while `failures` has
 * any left, as the engine fails over a store that does not list, then names each task held once, in the order filed, with what was
 * planted of it, 0 where nothing was, and no `records` where none was.
 */
export const keptVerbOf = (tasks: Held, sizes: Map<string, TestKeeps>, failures: { left: number }): EngineShape['kept'] =>
  function () {
    if (arguments.length > 0) {
      return Effect.fail(
        new KeptRefused({
          message: `takes nothing, and measures every task the store lists; it was handed ${[...arguments].map((a) => JSON.stringify(a)).join(', ')}: nothing was measured.`,
        }),
      );
    }
    if (failures.left > 0) {
      failures.left -= 1;
      return Effect.fail(new JournalError({ taskId: '*', message: 'the test engine was told to fail this kept: its store does not list' }));
    }
    const of = (taskId: string): KeptReport['tasks'][number] => {
      const { journal = 0, bodies = 0, output = 0, files = 0, records } = sizes.get(taskId) ?? {};
      return {
        taskId,
        harness: tasks.get(taskId)?.spec.harness ?? 'test',
        journal,
        bodies,
        output,
        files,
        ...(records === undefined ? {} : { records }),
      };
    };
    return Effect.sync(() => ({ tasks: [...tasks.keys()].map(of) }));
  };
