/**
 * The tests' own team (`fixtures/team/`): one workflow, `dev` — implement ⇄ review → ship — the three agents its steps name, and a skill
 * for each. Nemia ships no team, so a test of the machinery that needs a folder a person could have written reads this one; a guard over
 * what ships reads `shippedFolders()`, which finds this repository's own team in its `workflows/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { workflowsIn } from '../src/folder/folder.store.ts';
import type { Places } from '../src/skills/read.store.ts';
import { stepFiles } from '../src/folder/folder.ts';
import { scratch } from './scratch.ts';

/** The team's folder, laid out as a `workflows/` is: `agents/`, `skills/` and `dev/`. */
export const TEAM = path.join(import.meta.dirname, 'fixtures', 'team');

/** The team's one workflow. */
export const TEAM_DEV = path.join(TEAM, 'dev');

/** A copy of the team in a folder of its own, for a test that changes a file of it: the copy, holding `agents/`, `skills/` and `dev/`. */
export function teamCopy(prefix = 'wf-team-'): string {
  const root = scratch(prefix);
  fs.cpSync(TEAM, root, { recursive: true });
  return root;
}

/** Where a workflow is shipped from: the repository's `workflows/`, and the package's own. */
export const SHIPPED_HOLDERS = [
  path.join(import.meta.dirname, '..', '..', '..', 'workflows'),
  path.join(import.meta.dirname, '..', 'workflows'),
];

/** The repository this package is checked out in: where a start of a shipped folder finds its harness's skills (`.claude/skills`). */
export const REPO = path.join(import.meta.dirname, '..', '..', '..');

/**
 * Where a start of the folder `dir` looks for its agents and skills beyond the folder's own: the repository, for a shipped folder, as a
 * start in this checkout gives it; nothing more for any other, such as the tests' team, which holds all it names.
 */
export const placesOf = (dir: string): Places =>
  SHIPPED_HOLDERS.some(
    (holder) => path.resolve(dir).startsWith(path.resolve(holder) + path.sep) || path.resolve(dir) === path.resolve(holder),
  )
    ? { repo: REPO }
    : {};

/** Every workflow folder shipped, read off the disk: a holder that holds steps itself, and each folder of steps in one. */
export const shippedFolders = (): string[] =>
  SHIPPED_HOLDERS.flatMap((holder) => [
    ...(fs.existsSync(holder) && stepFiles(fs.readdirSync(holder)).length > 0 ? [holder] : []),
    ...workflowsIn(holder).map((name) => path.join(holder, name)),
  ]);
