/**
 * A step's `check:` runs its scripts from what the run froze when it began, and from nothing else: its own workflow's folder
 * (`$WF_WORKFLOW_FILES`, for a script only that workflow runs) or the template's carried folder (`$WF_CARRIED_FILES`, for the scripts
 * several workflows run, kept there once). So each `<variable>/<name>` a step of sdlc's checks names, bare or as `${<variable>:?…}`, is a
 * file of the folder that variable names. Held first on a scratch copy of sdlc with a step planted that names a script the carried folder
 * does not hold, then on sdlc as it ships: every script of either folder is run by a check or imported by one that is, so the lists are
 * the folders' own and a check moved or emptied cannot make the guard pass by reading nothing. A workflow's machine need (`spec.needs`)
 * is read as a check too, its own check and each fix's command, since the daemon runs them with the same two variables.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { scratch } from 'test-kit/scratch';
import { SDLC } from './template.ts';

/** A file named under a frozen folder: `$<variable>/<name>` or `${<variable>:?<why>}/<name>` (`:-` too), the variable one of the two. */
const FROZEN = /\$(?:(WF_WORKFLOW_FILES|WF_CARRIED_FILES)|\{(WF_WORKFLOW_FILES|WF_CARRIED_FILES):[?-][^}]*\})\/([\w.-]+)/g;

type Manifest = {
  spec?: {
    steps?: Array<{ name?: unknown; check?: unknown }>;
    needs?: Array<{ name?: unknown; check?: unknown; fixes?: Array<{ command?: unknown }> }>;
  };
};

/** The commands of a manifest that run with the frozen folders: each step's check, and each need's check and its fixes' commands. */
const commandsOf = (manifest: Manifest | null): Array<{ step: string; check: unknown }> => [
  ...(manifest?.spec?.steps ?? []).map((step) => ({ step: String(step.name), check: step.check })),
  ...(manifest?.spec?.needs ?? []).flatMap((need) =>
    [need.check, ...(need.fixes ?? []).map((fix) => fix.command)].map((check) => ({ step: `needs/${String(need.name)}`, check })),
  ),
];

/** A script a check names: the folder its variable names, relative to the template's root, and its file there. */
type Named = { folder: string; name: string };

/**
 * Each step of the template `root` that has a check, and each command of a need (`needs/<need>`): its workflow, its name, and the
 * scripts its check names under a frozen folder.
 */
function checksOf(root: string): Array<{ workflow: string; step: string; scripts: Named[] }> {
  const workflows = path.join(root, 'workflows');
  return fs
    .readdirSync(workflows)
    .filter((name) => fs.existsSync(path.join(workflows, name, 'workflow.yaml')))
    .sort()
    .flatMap((workflow) => {
      const manifest = yaml.load(fs.readFileSync(path.join(workflows, workflow, 'workflow.yaml'), 'utf8')) as Manifest | null;
      return commandsOf(manifest).flatMap((step) =>
        typeof step.check === 'string'
          ? [
              {
                workflow,
                step: step.step,
                scripts: [...step.check.matchAll(FROZEN)].map(([, bare, braced, name]) => ({
                  folder: (bare ?? braced) === 'WF_CARRIED_FILES' ? 'carried' : `workflows/${workflow}`,
                  name: name ?? '',
                })),
              },
            ]
          : [],
      );
    });
}

/** Each script a check of the template `root` names that its folder does not hold: `<workflow>/<step>: <folder>/<name>`. */
function strays(root: string): string[] {
  return checksOf(root).flatMap(({ workflow, step, scripts }) =>
    scripts
      .filter(({ folder, name }) => !fs.existsSync(path.join(root, folder, name)))
      .map(({ folder, name }) => `${workflow}/${step}: ${folder}/${name}`),
  );
}

/** The sibling scripts `file` imports (`from './<name>.ts'`), as files of its own folder. */
const siblingsOf = (file: string): string[] =>
  [...fs.readFileSync(file, 'utf8').matchAll(/from '\.\/([\w.-]+\.ts)'/g)].map(([, name]) => path.join(path.dirname(file), name ?? ''));

/** Every file a check of `root` reaches: each script it names, and each sibling those import, followed through. */
function reached(root: string): Set<string> {
  const seen = new Set<string>();
  const next = checksOf(root).flatMap(({ scripts }) => scripts.map(({ folder, name }) => path.join(root, folder, name)));
  for (let file = next.pop(); file !== undefined; file = next.pop()) {
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    next.push(...siblingsOf(file));
  }
  return seen;
}

/** The scripts of the folders of `root` a check may read from: the carried folder and each workflow's, every `.ts` directly in it. */
function scriptsOf(root: string): string[] {
  const folders = ['carried', ...fs.readdirSync(path.join(root, 'workflows')).map((workflow) => path.join('workflows', workflow))];
  return folders
    .map((folder) => path.join(root, folder))
    .filter((folder) => fs.existsSync(folder))
    .flatMap((folder) =>
      fs
        .readdirSync(folder)
        .filter((name) => name.endsWith('.ts'))
        .map((name) => path.join(folder, name)),
    )
    .sort();
}

test('REFUSED: a step whose check names a script the folder its variable names does not hold', () => {
  const root = path.join(scratch('nemia-check-scripts-'), 'sdlc');
  fs.cpSync(SDLC, root, { recursive: true });
  const file = path.join(root, 'workflows', 'janitor', 'workflow.yaml');
  const manifest = yaml.load(fs.readFileSync(file, 'utf8')) as Manifest;
  manifest.spec?.steps?.push({ name: 'planted', check: 'node "${WF_CARRIED_FILES:?run it in a run}/missing.ts" receipt' });
  manifest.spec?.steps?.push({ name: 'own', check: 'node "$WF_WORKFLOW_FILES/landing.ts" receipt' });
  fs.writeFileSync(file, yaml.dump(manifest));
  assert.deepEqual(strays(root), ['janitor/planted: carried/missing.ts', 'janitor/own: workflows/janitor/landing.ts']);
});

test('REFUSED: a script of the carried folder that no check runs and no script a check runs imports', () => {
  const root = path.join(scratch('nemia-check-scripts-'), 'sdlc');
  fs.cpSync(SDLC, root, { recursive: true });
  fs.writeFileSync(path.join(root, 'carried', 'stray.ts'), 'export {};\n');
  const reach = reached(root);
  assert.deepEqual(
    scriptsOf(root).filter((file) => !reach.has(file)),
    [path.join(root, 'carried', 'stray.ts')],
  );
});

test("sdlc's checks run only scripts their folders hold, and every script there is run, or imported by one that is", () => {
  const checks = checksOf(SDLC);
  const named = (carried: boolean): boolean =>
    checks.some(({ scripts }) => scripts.some(({ folder }) => (folder === 'carried') === carried));
  assert.ok(named(true) && named(false), "sdlc's checks name scripts of both frozen folders: a guard that reads none holds nothing");
  assert.deepEqual(strays(SDLC), []);
  const reach = reached(SDLC);
  assert.deepEqual(
    scriptsOf(SDLC).filter((file) => !reach.has(file)),
    [],
  );
});
