/**
 * The board's agent library entries (`AGENTS_WRITE`, `AGENTS_REMOVE`, `AGENTS_READ`), served on the api alone: an agent written from
 * its form, renamed from the name on its path, read back for its page, and removed; and a stale version refused by each write in the
 * package's words whole. `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-library-root-');
process.env.WF_ROOT = ROOT;
const { AGENTS_READ, AGENTS_REMOVE, AGENTS_WRITE } = await import('./library.verb.ts');
const { runWith: runEngine, engine } = await import('../runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

const e = engine();
const repo = scratch('wf-library-repo-');
const dir = path.join(ROOT, 'workflows', 'agents');

/** The form of an agent named `name`, as the board sends it. */
const form = (name: string, effort = 'low') =>
  JSON.stringify({ name, description: 'Use this when a change needs its notes written.', keys: { effort }, body: 'Write the notes.' });

/** The agent `name` of yours as the entry reads it for its page, or null. */
const read = async (name: string) => (await runWith(e, AGENTS_READ.handler({ from: 'yours', name, dir, repo }, undefined, ROOT))).agent;

test('an agent written from its form reads back for its page, renamed from the name on its path, and removed', async () => {
  const made = await runWith(e, AGENTS_WRITE.handler({ from: 'yours', dir, repo, draft: form('scribe'), schema: 'null' }, undefined, ROOT));
  assert.deepEqual(made.written, ['scribe.md']);
  assert.equal((await read('scribe'))?.version, made.version);
  const renamed = await runWith(
    e,
    AGENTS_WRITE.handler(
      { from: 'yours', name: 'scribe', dir, repo, draft: form('clerk'), schema: 'null', version: made.version },
      undefined,
      ROOT,
    ),
  );
  assert.deepEqual([renamed.written, renamed.removed], [['clerk.md'], ['scribe.md']]);
  assert.equal(await read('scribe'), null, 'the name it was renamed from is gone');
  const removed = await runWith(
    e,
    AGENTS_REMOVE.handler({ from: 'yours', name: 'clerk', dir, repo, version: renamed.version }, undefined, ROOT),
  );
  assert.deepEqual(removed.removed, ['clerk.md']);
  assert.equal(fs.existsSync(path.join(dir, 'clerk.md')), false);
});

test("REFUSED: a write and a removal of an agent changed since it was read, in the package's words whole, and the agent kept", async () => {
  const made = await runWith(
    e,
    AGENTS_WRITE.handler({ from: 'yours', dir, repo, draft: form('archivist'), schema: 'null' }, undefined, ROOT),
  );
  const edited = await runWith(
    e,
    AGENTS_WRITE.handler(
      { from: 'yours', name: 'archivist', dir, repo, draft: form('archivist', 'high'), schema: 'null', version: made.version },
      undefined,
      ROOT,
    ),
  );
  const stale = `agents/archivist.md changed since it was read (version ${made.version}, now ${edited.version}), and writing it would lose what changed. Read it again, and make the change on what it holds now.`;
  await assert.rejects(
    runWith(
      e,
      AGENTS_WRITE.handler(
        { from: 'yours', name: 'archivist', dir, repo, draft: form('archivist'), schema: 'null', version: made.version },
        undefined,
        ROOT,
      ),
    ),
    (err: Error) => (assert.equal(err.message, stale), true),
  );
  await assert.rejects(
    runWith(e, AGENTS_REMOVE.handler({ from: 'yours', name: 'archivist', dir, repo, version: made.version }, undefined, ROOT)),
    (err: Error) => (
      assert.equal(
        err.message,
        `agents/archivist.md changed since it was read (version ${made.version}, now ${edited.version}). Read it again before removing it.`,
      ),
      true
    ),
  );
  assert.equal((await read('archivist'))?.version, edited.version);
});
