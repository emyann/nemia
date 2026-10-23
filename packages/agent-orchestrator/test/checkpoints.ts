/**
 * A story told as one test: a person's walk, its checkpoints named subtests that share the state the walk built.
 *
 *     test('a gated run waits for its approval, then goes on', async (t) => {
 *       const s = story(t);
 *       await s.test('start freezes the gate', async () => { … });
 *       await s.test('the tick holds the gated step', async () => { … });
 *     });
 *
 * Once a checkpoint fails, every later one is filed skipped, naming the one that failed: what comes after a broken step reads a state
 * the story never meant, so its failures would be noise. A checkpoint is declared by a call named `test`, which is how a citation of
 * its name resolves (`tools/guards/test/claude-md-cites.test.ts`).
 *
 * It imports nothing, so each workspace keeps a copy of it, byte for byte, held equal to the original in
 * `packages/agent-orchestrator/test/checkpoints.ts` by that package's `test/scratch.test.ts`: a change is made there and copied.
 */

/** What a checkpoint's body is handed: the subtest's own context. */
type Body<T> = (t: T) => unknown;

/** The part of a test's context a story files its checkpoints on: node's `TestContext` is one. */
export type Teller<T> = {
  test(name: string, fn: (t: T) => void | Promise<void>): Promise<unknown>;
  test(name: string, options: { skip: string }): Promise<unknown>;
};

/** A story's checkpoints: `test(name, body)` files one, skipped once an earlier one failed. */
export type Story<T> = {
  test: (name: string, body: Body<T>) => Promise<void>;
  /** The checkpoint that failed, if one did. */
  failed: () => string | undefined;
};

/**
 * The checkpoints of the story told in `t`. Each body runs as a subtest of `t`; its error is rethrown there, so the report shows the
 * one failure at the step it happened, and the checkpoints after it are filed skipped with that step's name as the reason.
 */
export function story<T>(t: Teller<T>): Story<T> {
  let failed: string | undefined;
  return {
    test: async (name, body) => {
      if (failed !== undefined) {
        await t.test(name, { skip: `after "${failed}" failed` });
        return;
      }
      await t.test(name, async (sub: T) => {
        try {
          await body(sub);
        } catch (error) {
          failed = name;
          throw error;
        }
      });
    },
    failed: () => failed,
  };
}
