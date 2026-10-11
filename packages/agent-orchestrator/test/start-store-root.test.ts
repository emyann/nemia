/**
 * `nemia start` in a store whose path a permission rule cannot carry: `WF_ROOT` holds a space, which a rule carries, and a `*`, which
 * widens it. A step filed a rule naming a path under the store is refused once, in the store's words, before anything is written and
 * before the runtime's words about a rule or a mount the person never wrote (`storeRootRefusal`, asked by `stepsToStart`); a step that
 * names nothing under the store starts. `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest } from './placed.ts';

const stand = eachTest(testPlace);
const ROOT = scratch('wf-store root*-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/start/start.verb.ts');

/** A workflow folder `name` of `files`, each a step's file by its name. */
function folder(name: string, files: Record<string, string>): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [step, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  return dir;
}

/** A repository with one commit, so a run has a base to record. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
}

const runsWritten = (): string[] =>
  fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')) : [];

/** `startRun` of `workflowDir` in a repository of its own, given `inputs`: the run's id, or the refusal it failed with. */
function started(workflowDir: string, inputs?: string[]): string {
  const exit = Effect.runSyncExit(
    startRun({ brief: 'add a flag', repo: aRepo(), workflowDir, ...(inputs ? { inputs } : {}) }).pipe(Effect.provide(stand().layer)),
  );
  if (exit._tag === 'Success') return exit.value.id;
  throw Effect.runSync(Effect.flip(Effect.failCause(exit.cause)));
}

const ALONE = folder('alone', { ship: '---\nplace: git\nworkspace: main\n---\nShip it.\n' });
const AFTER = folder('after', {
  implement: '---\nplace: git\n---\nBuild it.\n',
  ship: '---\nafter: implement\nplace: git\nworkspace: main\n---\nShip it.\n',
});
const PLAIN = folder('plain', { implement: '---\nplace: git\n---\nBuild it.\n' });

/** The store's words for `step`, given `what` by a rule under the store. */
const storeWords = (step: string, what: string) =>
  `${step}: its harness would be given ${what} by a permission rule naming a path under the store, WF_ROOT=${ROOT} ` +
  `(~/.agent-workflows when WF_ROOT is unset), and such a rule cannot carry the "*" in it: it would name another folder, or none.\n` +
  `Set WF_ROOT to a directory whose path holds only letters, digits, \`-\`, \`_\`, \`.\` and \`/\`, like WF_ROOT=/srv/wf, and move the store's folder there first to keep its runs.`;

test("REFUSED at `nemia start`: a lone step in the checkout, filed a read of its run's artifacts under a root with a `*`, fails as Invalid with exit 2 in the store's words, and no run is written", () => {
  const before = runsWritten();
  assert.throws(
    () => started(ALONE),
    (err: Error & { _tag?: string; exitCode?: number }) =>
      err._tag === 'Invalid' && err.exitCode === 2 && err.message === storeWords('ship', "a read of its run's artifacts folder"),
  );
  assert.deepEqual(runsWritten(), before);
});

test("REFUSED at `nemia start`: a step in the checkout after another is refused in the store's words, never the runtime's about a mount or a rule list", () => {
  const before = runsWritten();
  assert.throws(
    () => started(AFTER),
    (err: Error & { _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.message === storeWords('ship', "a read of its run's artifacts folder") &&
      !/Mount a folder|is not a list of permission rules/.test(err.message),
  );
  assert.deepEqual(runsWritten(), before);
});

test('a step filed no rule naming a path under the store starts in the same root: the refusal is asked of the steps, not of the root alone', () => {
  const id = started(PLAIN);
  assert.ok(runsWritten().includes(`${id}.json`));
});

test("REFUSED at `nemia start --input`: the same lone step, filed its run's inputs folder read-only, is refused in the store's words, and no run is written", () => {
  const given = path.join(ROOT, 'notes.md');
  fs.writeFileSync(given, 'notes\n');
  const before = runsWritten();
  assert.throws(
    () => started(PLAIN, [given]),
    (err: Error & { _tag?: string }) => err._tag === 'Invalid' && err.message === storeWords('implement', "the run's inputs folder"),
  );
  assert.deepEqual(runsWritten(), before);
});
