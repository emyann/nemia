/**
 * A step's `check:` runs its scripts from the run's frozen workflow files (`$WF_WORKFLOW_FILES`), the copy of its own workflow's folder
 * the run takes when it begins, and of no other: so each `$WF_WORKFLOW_FILES/<name>` (or `${WF_WORKFLOW_FILES:-<fallback>}/<name>`) a
 * step of sdlc's checks names is a file of that step's own workflow folder. Held first on a scratch copy of sdlc with a step planted
 * that names a script its folder does not hold, then on sdlc as it ships, each workflow that runs a script read for the names it must
 * hold, so a check moved or emptied cannot make the guard pass by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { scratch } from 'test-kit/scratch';
import { SDLC } from './template.ts';

/** A file named under the frozen folder: `$WF_WORKFLOW_FILES/<name>` or `${WF_WORKFLOW_FILES:-<fallback>}/<name>`. */
const FROZEN = /\$(?:WF_WORKFLOW_FILES|\{WF_WORKFLOW_FILES:-[^}]*\})\/([\w.-]+)/g;

type Manifest = { spec?: { steps?: Array<{ name?: unknown; check?: unknown }> } };

/** Each step of the template `root` that has a check: its workflow, its name, and the scripts its check names under the frozen folder. */
function checksOf(root: string): Array<{ workflow: string; step: string; scripts: string[] }> {
  const workflows = path.join(root, 'workflows');
  return fs
    .readdirSync(workflows)
    .filter((name) => fs.existsSync(path.join(workflows, name, 'workflow.yaml')))
    .sort()
    .flatMap((workflow) => {
      const manifest = yaml.load(fs.readFileSync(path.join(workflows, workflow, 'workflow.yaml'), 'utf8')) as Manifest | null;
      return (manifest?.spec?.steps ?? []).flatMap((step) =>
        typeof step.check === 'string'
          ? [{ workflow, step: String(step.name), scripts: [...step.check.matchAll(FROZEN)].map(([, name]) => name ?? '') }]
          : [],
      );
    });
}

/** Each script a check of the template `root` names that its step's own workflow folder does not hold: `<workflow>/<step>: <name>`. */
function strays(root: string): string[] {
  return checksOf(root).flatMap(({ workflow, step, scripts }) =>
    scripts.filter((name) => !fs.existsSync(path.join(root, 'workflows', workflow, name))).map((name) => `${workflow}/${step}: ${name}`),
  );
}

test("REFUSED: a step whose check names a frozen script its own workflow's folder does not hold", () => {
  const root = path.join(scratch('nemia-check-scripts-'), 'sdlc');
  fs.cpSync(SDLC, root, { recursive: true });
  const file = path.join(root, 'workflows', 'janitor', 'workflow.yaml');
  const manifest = yaml.load(fs.readFileSync(file, 'utf8')) as Manifest;
  manifest.spec?.steps?.push({ name: 'planted', check: 'node "$WF_WORKFLOW_FILES/landing.ts" receipt' });
  fs.writeFileSync(file, yaml.dump(manifest));
  assert.deepEqual(strays(root), ['janitor/planted: landing.ts']);
});

test("sdlc's checks run only scripts of their own workflow's folder", () => {
  const named = (workflow: string): string[] =>
    [
      ...new Set(
        checksOf(SDLC)
          .filter((check) => check.workflow === workflow)
          .flatMap((check) => check.scripts),
      ),
    ].sort();
  assert.deepEqual(named('build'), ['landing.ts', 'parts.ts', 'probe.ts', 'pull-request.ts']);
  assert.deepEqual(named('quick'), ['change.ts', 'landing.ts', 'parts.ts', 'probe.ts', 'pull-request.ts']);
  assert.deepEqual(named('janitor'), ['cards.ts']);
  assert.deepEqual(strays(SDLC), []);
});
