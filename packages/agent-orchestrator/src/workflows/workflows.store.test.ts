/**
 * The Workflow door's files layer: the door's walks (`test/workflow-walks.ts`) on a fresh scratch store each, what only the files can be
 * asked — a folder written byte for byte as today's writer writes it, a former spelling its files still hold read with its hint, the
 * default door's root — and the seam's debt, the code of `src` still on the stores the door is over (`test/workflow-door.baseline.ts`),
 * which only shrinks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aWorkflow, WORKFLOW_WALKS, yoursOn } from '../../test/workflow-walks.ts';
import { WorkflowDoor, workflowDoorFiles } from './workflows.store.ts';
import { writeWorkflowAt } from '../folder/write.store.ts';
import { StoreRoot } from '../config/root.store.ts';

const PKG = path.join(import.meta.dirname, '..', '..');

for (const [name, body] of walksOn(WORKFLOW_WALKS, () => {
  const root = scratch('wf-workflow-door-');
  return { door: doorFrom(WorkflowDoor, workflowDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store and its Workflow door over the files. */
const store = () => {
  const root = scratch('wf-workflow-door-');
  return { root, side: { root, door: doorFrom(WorkflowDoor, workflowDoorFiles(root)), layer: 'files' } };
};

/** Every file under `dir`, by its path from it, with its bytes. */
const bytes = (dir: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(dir)
      .sort()
      .map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')]),
  );

test("a folder written through the door is, byte for byte, the folder today's writer writes", () => {
  const { root, side } = store();
  const draft = aWorkflow(undefined, '# Dev\n\nPlans, then builds.\n');
  done(side.door.workflows.write(yoursOn(side, 'dev'), draft));
  const theirs = path.join(root, 'workflows', 'theirs');
  writeWorkflowAt(root, theirs, draft.steps, draft.readme);
  assert.deepEqual(bytes(path.join(root, 'workflows', 'dev')), bytes(theirs));
});

test('a former spelling the files still hold is read, and its hint names the fix', () => {
  const { root, side } = store();
  const dir = path.join(root, 'workflows', 'old');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'only.md'), '---\nplace: git\nworkspace: main\n---\nDo it.\n');
  assert.deepEqual(
    done(side.door.workflows.read(yoursOn(side, 'old'))).map((s) => [s.name, s.workspace]),
    [['only', 'base']],
  );
  const hints = done(side.door.workflows.hints(yoursOn(side, 'old')));
  assert.equal(hints.length, 1);
  assert.ok(hints[0]?.includes(path.join(dir, 'only.md')), hints[0]);
});

test('the default door reads the files at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, side } = store();
  done(side.door.workflows.write(yoursOn(side, 'dev'), aWorkflow()));
  const list = Effect.gen(function* () {
    return yield* (yield* WorkflowDoor).workflows.list(path.join(root, 'workflows'));
  });
  assert.deepEqual(act(Effect.provideService(list, StoreRoot, root)), ['dev']);
  assert.deepEqual(act(list), { refused: 'Invalid' });
});

/** The functions of the stores the Workflow door is over that `src`'s code still calls rather than yielding the door. */
const SEAM = ['loadWorkflows', 'writeWorkflow', 'writeWorkflowAt', 'removeWorkflow', 'removeWorkflowAt', 'formerKeyLines'];

/** The stores the door is over, and the door's own files: where the seam is defined, not a debt. */
const OWN = [
  'src/folder/folder.store.ts',
  'src/folder/write.store.ts',
  'src/workflows/workflows.store.ts',
  'src/workflows/memory.store.ts',
];

/** Every file of `src` but the tests and the stores, by its path from the package. */
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!OWN.includes(file)) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/** The seam's calls in each file, comment lines left out: what `WORKFLOW_DOOR_DEBT` counts. */
function seamUses(sources: Record<string, string>): Map<string, number> {
  const call = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`, 'g');
  const uses = new Map<string, number>();
  for (const [file, text] of Object.entries(sources)) {
    const code = text
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    const n = [...code.matchAll(call)].length;
    if (n) uses.set(file, n);
  }
  return uses;
}

/** Why the uses of `sources` break the baseline `debt`: a file it does not name, a count grown, a count fallen. */
function debtBreaks(sources: Record<string, string>, debt: Readonly<Record<string, number>>): string[] {
  const uses = seamUses(sources);
  const out: string[] = [];
  for (const [file, n] of uses) {
    const owed = debt[file] ?? 0;
    if (n > owed)
      out.push(
        `${file} calls the workflow folder's stores ${n} time(s) where test/workflow-door.baseline.ts names ${owed}: yield WorkflowDoor (src/workflows/workflows.store.ts) instead`,
      );
    if (n < owed)
      out.push(
        `${file} calls the workflow folder's stores ${n} time(s): lower its count in test/workflow-door.baseline.ts to ${n}, which only shrinks`,
      );
  }
  for (const file of Object.keys(debt))
    if (!uses.has(file))
      out.push(`${file} calls the workflow folder's stores no more: take its line out of test/workflow-door.baseline.ts`);
  return out;
}

test("no file of src calls the workflow folder's stores but as test/workflow-door.baseline.ts counts it, and the count only shrinks", async () => {
  const { WORKFLOW_DOOR_DEBT } = await import('../../test/workflow-door.baseline.ts');
  assert.deepEqual(debtBreaks(sourcesOfSrc(), WORKFLOW_DOOR_DEBT), []);
});

test('REFUSED: a converted file that calls a store again, and a count the baseline holds above what is left', async () => {
  const { WORKFLOW_DOOR_DEBT } = await import('../../test/workflow-door.baseline.ts');
  const sources = sourcesOfSrc();
  const again = {
    ...sources,
    'src/workflows/workflows.verb.ts': `${sources['src/workflows/workflows.verb.ts']}\nconst x = loadWorkflows('a');\n`,
  };
  assert.equal(debtBreaks(again, WORKFLOW_DOOR_DEBT).length, 1);
  const [first] = Object.keys(WORKFLOW_DOOR_DEBT);
  assert.equal(debtBreaks(sources, { ...WORKFLOW_DOOR_DEBT, [first]: (WORKFLOW_DOOR_DEBT[first] ?? 0) + 1 }).length, 1);
});
