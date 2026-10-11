/**
 * A step is filed the artifacts folder of each step it comes after, read-only (`handedMounts`), under the store's `runs/`, and a step
 * whose `reads:` names the inbox the inbox (`readsMounts`): a store whose path no permission rule can carry refuses `nemia start` of
 * either on Claude Code, in the store's words (`storeRootRefusal`), before anything is written and before the runtime's words about a
 * mount the person never wrote; so does a step in the checkout, filed a read of its run's artifacts folder, before the runtime's words
 * about a rule list. A workflow of one step, handed nothing and reading no store folder, starts there.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads; its path holds a `(`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = path.join(scratch('wf-start-handed-'), 'First (Last)');
fs.mkdirSync(ROOT);
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { startRun } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);

/** A git repository with one commit on `main`, under the store. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  return repo;
}

/** A workflow folder of steps on Claude Code, by name and frontmatter, each with a one-line body. */
function folderOf(steps: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, front] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${front}\n---\n${name} it\n`);
  return dir;
}

/** The store's words for `step`, given `what` by a rule naming a path under the store. */
const storeWords = (step: string, what: string) =>
  `${step}: its harness would be given ${what} by a permission rule naming a path under the store, WF_ROOT=${ROOT} ` +
  `(~/.agent-workflows when WF_ROOT is unset), and such a rule cannot carry the "(" in it: it would name another folder, or none.\n` +
  `Set WF_ROOT to a directory whose path holds only letters, digits, \`-\`, \`_\`, \`.\` and \`/\`, like WF_ROOT=/srv/wf, and move the store's folder there first to keep its runs.`;

/** The runs on disk, by file name. */
const runs = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).sort() : []);

test("REFUSED at shipped defaults: a store no permission rule can carry refuses a later step on Claude Code at start, in the store's words, before anything is written", async () => {
  const repo = aRepo();
  const before = runs();
  let message = '';
  try {
    await runPlaced(
      startRun({
        brief: 'build it',
        repo,
        workflowDir: folderOf({ implement: 'harness: claude', review: 'after: implement' }),
        isolate: false,
      }),
    );
  } catch (err) {
    message = (err as Error).message;
  }
  assert.equal(message, storeWords('review', 'the artifacts folders of the steps before it'));
  assert.doesNotMatch(message, /Mount a folder|is not a list of permission rules/);
  assert.deepEqual(runs(), before, 'nothing was written');
});

test('a workflow of one step, handed nothing, starts in the same store', async () => {
  const run = await runPlaced(
    startRun({ brief: 'build it', repo: aRepo(), workflowDir: folderOf({ implement: 'harness: claude' }), isolate: false }),
  );
  assert.ok(runs().includes(`${run.id}.json`), runs().join('\n'));
});

test("REFUSED at shipped defaults: a store no permission rule can carry refuses a step's `reads: inbox` at start, in the store's words, before anything is written", async () => {
  const before = runs();
  let message = '';
  try {
    await runPlaced(startRun({ brief: 'read it', repo: aRepo(), workflowDir: folderOf({ argus: 'reads: inbox' }), isolate: false }));
  } catch (err) {
    message = (err as Error).message;
  }
  assert.equal(message, storeWords('argus', 'the inbox'));
  assert.deepEqual(runs(), before, 'nothing was written');
});

test("REFUSED at shipped defaults: a step in the checkout, under a store whose path holds a `(`, is refused in the store's words, never the runtime's about a rule list or a mount", async () => {
  const before = runs();
  let failed: (Error & { _tag?: string; exitCode?: number }) | undefined;
  try {
    await runPlaced(startRun({ brief: 'ship it', repo: aRepo(), workflowDir: folderOf({ ship: 'workspace: main' }) }));
  } catch (err) {
    failed = err as Error & { _tag?: string; exitCode?: number };
  }
  assert.equal(failed?._tag, 'Invalid', failed?.message);
  assert.equal(failed?.exitCode, 2);
  assert.equal(failed?.message, storeWords('ship', "a read of its run's artifacts folder"));
  assert.doesNotMatch(failed?.message ?? '', /is not a list of permission rules|Mount a folder/);
  assert.deepEqual(runs(), before, 'nothing was written');
});
