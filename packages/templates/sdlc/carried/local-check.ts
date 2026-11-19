/**
 * `node local-check.ts --runner <package manager>` — sdlc's default `localCheck`, the judge of the work where the factory lands in its
 * checkout: from the workspace's root, the repository's own `lint`, `typecheck` and `test` scripts, each run as `<runner> run <name>`, in
 * that order, each only where its `package.json` declares it, and the placeholder test a package manager's init writes (`echo "Error: no
 * test specified" && exit 1`) left out, since it fails every tree alike; it exits with the first that fails. The runner is the factory's,
 * named by the parameter's default; with none given it is refused, exit 2, before anything runs. A folder with no `package.json`, or one
 * that declares none of the three, runs nothing and passes, saying so: Nemia knows nothing of how such a repository is judged, and the
 * review reads the work. A `package.json` that does not parse is refused, exit 1, naming it. Which scripts run is `localPlan`, pure. It
 * imports Node's own modules alone: a run freezes the carried folder whole (`$WF_CARRIED_FILES`), so it runs wherever the scripts beside it
 * do.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The scripts a local check runs, in order. */
const JUDGES = ['lint', 'typecheck', 'test'] as const;

/** The test script a package manager's init writes, which fails whatever the tree holds. */
const PLACEHOLDER = /^echo "Error: no test specified" && exit 1$/;

/**
 * The scripts of `JUDGES` a `package.json` holding `manifest` declares, in order: each a non-empty string, the placeholder test a
 * package manager's init wrote left out.
 * @param manifest The parsed `package.json`, whatever it holds.
 */
export function localPlan(manifest: unknown): string[] {
  const scripts =
    typeof manifest === 'object' && manifest !== null && 'scripts' in manifest && typeof manifest.scripts === 'object'
      ? (manifest.scripts as Record<string, unknown> | null)
      : null;
  if (scripts === null) return [];
  return JUDGES.filter((name) => {
    const line = Object.hasOwn(scripts, name) ? scripts[name] : undefined;
    return typeof line === 'string' && line.trim() !== '' && !(name === 'test' && PLACEHOLDER.test(line.trim()));
  });
}

/** The runner `--runner` names in `argv`, where it names one. */
const runnerOf = (argv: readonly string[]): string | undefined => {
  const at = argv.indexOf('--runner');
  const runner = at < 0 ? undefined : argv[at + 1];
  return runner === undefined || runner.trim() === '' || runner.startsWith('--') ? undefined : runner;
};

/**
 * The check at `root`, each script run by `runner`: the exit of the first script of its plan that fails, or 0, with a line saying what
 * it ran or why nothing.
 */
function main(root: string, runner: string): number {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) {
    process.stdout.write('nemia local check: no package.json here, so nothing is run: the review judges the work\n');
    return 0;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`nemia local check: ${file} does not parse as JSON (${(err as Error).message}): fix it, then check again\n`);
    return 1;
  }
  const plan = localPlan(manifest);
  if (!plan.length) process.stdout.write('nemia local check: package.json declares no lint, typecheck or test, so nothing is run\n');
  for (const name of plan) {
    process.stdout.write(`nemia local check: ${runner} run ${name}\n`);
    const ran = spawnSync(runner, ['run', name], { cwd: root, stdio: 'inherit' });
    if (ran.status !== 0) return ran.status ?? 1;
  }
  return 0;
}

if (import.meta.main) {
  const runner = runnerOf(process.argv.slice(2));
  if (runner === undefined) {
    process.stderr.write('nemia local check: name the package manager that runs the scripts: --runner <its command>\n');
    process.exitCode = 2;
  } else process.exitCode = main(process.cwd(), runner);
}
