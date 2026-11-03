/**
 * What the tests of a template share: its folder, the orchestrator's CLI spawned on a scratch store (`nemia`), a scratch copy of a
 * template (`copyOf`), and a template applied and rendered as a factory's tree (`rendered`): filed by `nemia factory apply`, then
 * rendered by the factory controller of a `nemia up` stopped as soon as each tree is seeded, since only the daemon renders a tree.
 *
 * Every spawn runs on a scratch store and a scratch home (`WF_ROOT`, `AE_ROOT`, `HOME`), so nothing of the person's is read or written.
 * The orchestrator is reached by its CLI alone, resolved by its entry (`BIN`): this file and the client (`apps/cli/src/local.ts`) are
 * the two that may name it (`packages/agent-orchestrator/test/contract.test.ts`), and nothing here takes a path into the package.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.ts';

/** This workspace: the folder each template is a folder of. */
export const TEMPLATES = path.join(import.meta.dirname, '..');

/** The template this workspace ships. */
export const SDLC = path.join(TEMPLATES, 'sdlc');

/** The orchestrator's CLI, `nemia`, at the entry its package exports for a spawn (`agent-orchestrator/bin`). */
export const BIN = fileURLToPath(import.meta.resolve('agent-orchestrator/bin'));

/** An environment on its own scratch store and home, with nothing of the test runner's. */
export function storeEnv(root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WF_ROOT: path.join(root, 'store'),
    AE_ROOT: path.join(root, 'engine'),
    HOME: path.join(root, 'home'),
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
    WF_MAX_CONCURRENT: '2',
    WF_MAX_RUNS: '2',
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.OTEL_EXPORTER_OTLP_ENDPOINT;
  fs.mkdirSync(env.HOME!, { recursive: true });
  return env;
}

/** `nemia <args>` on the store of `env`, bounded: its exit and its streams. */
export function nemia(env: NodeJS.ProcessEnv, ...args: string[]): { code: number | null; out: string; err: string } {
  const ran = spawnSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8', timeout: 120_000 });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

/** A scratch copy of the template `from`, as a folder of its own name, each file of it then changed by `edit`, which must change it. */
export function copyOf(from: string, edit: Record<string, (text: string) => string> = {}): string {
  const folder = path.join(scratch('nemia-template-'), path.basename(from));
  fs.cpSync(from, folder, { recursive: true });
  for (const [file, change] of Object.entries(edit)) {
    const at = path.join(folder, file);
    const text = fs.readFileSync(at, 'utf8');
    if (change(text) === text) throw new Error(`${file} does not hold what the fixture changes: change the fixture`);
    fs.writeFileSync(at, change(text));
  }
  return folder;
}

/** A factory to apply: its name, the template's folder, and its `--set` words, each `<key>=<value>`. */
export type Applied = { name: string; template: string; sets?: string[] };

/** A factory as the controller left it: its tree's folder where it was seeded, the conditions of its status, and the store it is in. */
export type Tree = { tree: string | undefined; conditions: Array<{ type: string; status: string; reason: string }>; store: string };

/**
 * Each of `factories` applied on one scratch store, each over a scratch repository of its own, then rendered by `nemia up`, stopped once
 * each factory has its status written: by name, its tree and its conditions. Throws where `nemia factory apply` refuses one.
 */
export async function rendered(factories: readonly Applied[]): Promise<Record<string, Tree>> {
  const root = scratch('nemia-applied-');
  const env = storeEnv(root);
  for (const { name, template, sets = [] } of factories) {
    const repo = path.join(root, 'repos', name);
    fs.mkdirSync(repo, { recursive: true });
    spawnSync('git', ['init', '-q'], { cwd: repo, env });
    const applied = nemia(
      env,
      'factory',
      'apply',
      name,
      '--template',
      template,
      '--repo',
      repo,
      '--no-trust',
      ...sets.flatMap((s) => ['--set', s]),
    );
    if (applied.code !== 0) throw new Error(`nemia factory apply ${name} exited ${applied.code}: ${applied.err}`);
  }
  const folderOf = (name: string): string => path.join(env.WF_ROOT!, 'factories', name);
  const statusOf = (name: string): Pick<Tree, 'conditions'> | undefined => {
    const file = path.join(folderOf(name), 'status.json');
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Pick<Tree, 'conditions'>) : undefined;
  };
  const appliedOf = (name: string): boolean => statusOf(name)?.conditions.some((c) => c.type === 'Applied' && c.status === 'True') ?? false;
  const treeOf = (name: string): string => path.join(folderOf(name), 'tree');
  const settled = (): boolean =>
    factories.every(
      ({ name }) => statusOf(name) !== undefined && (!appliedOf(name) || fs.existsSync(path.join(treeOf(name), 'factory.json'))),
    );
  const up = spawn(process.execPath, [BIN, 'up'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let said = '';
  up.stderr.on('data', (chunk: Buffer) => (said += chunk.toString()));
  const exited = new Promise((resolve) => up.once('exit', resolve));
  try {
    for (let polls = 0; !settled(); polls++) {
      if (polls > 600 || up.exitCode !== null) throw new Error(`nemia up wrote no status for every factory: ${said}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    up.kill('SIGTERM');
    await exited;
  }
  return Object.fromEntries(
    factories.map(({ name }) => [
      name,
      { tree: appliedOf(name) ? treeOf(name) : undefined, conditions: statusOf(name)?.conditions ?? [], store: env.WF_ROOT! },
    ]),
  );
}

/** sdlc as one factory gets it, a copy applied with `sets` and rendered (`rendered`): its tree, and the scratch store it is in. */
export async function renderedSdlc(sets: readonly string[] = []): Promise<{ tree: string; store: string }> {
  const { sdlc } = await rendered([{ name: 'sdlc', template: copyOf(SDLC), sets: [...sets] }]);
  if (sdlc?.tree === undefined) throw new Error(`nemia up did not apply sdlc: ${JSON.stringify(sdlc?.conditions)}`);
  return { tree: sdlc.tree, store: sdlc.store };
}

/** Every file under `dir`, by its path from it, in order. */
export const filesUnder = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => fs.statSync(path.join(dir, file)).isFile())
    .map((file) => file.split(path.sep).join('/'))
    .sort();
