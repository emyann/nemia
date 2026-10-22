/**
 * Whether a push or a pull request is due the guards' suite: whether it changed a path the `guards#test` task's turbo `inputs` name,
 * or a path under the folder of a workspace package the guards depend on (followed through their own dependencies).
 *
 * `dueOf` is the decision, pure. Run as a program from the repository's root, it reads `turbo.json`, the root `package.json`'s
 * `workspaces` and `tools/guards/package.json`, asks git which paths the event's range changed, and appends `due=true` or `due=false`
 * to the file `GITHUB_OUTPUT` names, saying which and why on stdout. It reads, as the gitleaks job of `.github/workflows/ci.yml` does:
 *
 * - `GITHUB_EVENT_NAME`: `pull_request` or `push`; any other event is due;
 * - `BASE` and `HEAD_SHA` on a pull request: `git diff --name-only BASE...HEAD_SHA`;
 * - `BEFORE` and `GITHUB_SHA` on a push: `git diff --name-only BEFORE..GITHUB_SHA`;
 * - `GITHUB_OUTPUT`: the file the answer is appended to; unset, the answer is only printed.
 *
 * It fails closed: a missing or malformed sha, an all-zero `BEFORE` (a branch's first push) and a range git cannot resolve are due.
 * An input of a shape it does not read is refused, and the process exits 1: it never guesses what a pattern covers.
 *
 * The inputs read as turbo reads them: `$TURBO_DEFAULT$` is the package's own folder, `$TURBO_ROOT$/x` the repository's path `x`, any
 * other input a path under the package's folder, and a leading `!` takes a path out, whatever positive input names it. A pattern is
 * made of `/`-separated segments, each a name, a name with `*` in it (any characters but `/`), or a last `**` (anything below).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The guards' own folder, from the repository's root: what `$TURBO_DEFAULT$` stands for. */
export const GUARDS = 'tools/guards';

/** The task whose inputs say what the guards read. */
export const TASK = 'guards#test';

/** Whether a range is due, and why: the path that made it so and what named it, or that nothing did. */
export type Due = { due: true; why: string } | { due: false; why: string };

type Pattern = { input: string; negated: boolean; matches: (file: string) => boolean };

const escape = (text: string): string => text.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/** A segment's regular expression, or `undefined` for a shape this file does not read. */
const segmentOf = (segment: string, last: boolean): string | undefined => {
  if (segment === '**') return last ? '.+' : undefined;
  if (segment === '' || segment === '.' || segment === '..' || /[?[\]{}!]/.test(segment) || segment.includes('**')) return undefined;
  return segment.split('*').map(escape).join('[^/]*');
};

/** An input as a pattern over the repository's paths; throws when its shape is one this file does not read. */
export const patternOf = (input: string, folder = GUARDS): Pattern => {
  const negated = input.startsWith('!');
  const body = negated ? input.slice(1) : input;
  const refused = (): Error =>
    new Error(
      `${TASK}'s input ${JSON.stringify(input)} in turbo.json has a shape tools/guards/due.ts does not read. Rewrite it as ` +
        'a folder ending in /** (dir/**), a plain file, or with * inside one segment (apps/*/src/**); list two inputs instead of {a,b}.',
    );
  const repoPath = body === '$TURBO_DEFAULT$' ? `${folder}/**` : body.startsWith('$TURBO_ROOT$/') ? body.slice(13) : `${folder}/${body}`;
  if (repoPath.includes('$')) throw refused();
  const segments = repoPath.split('/');
  const parts = segments.map((segment, i) => segmentOf(segment, i === segments.length - 1));
  if (parts.some((part) => part === undefined)) throw refused();
  const last = segments[segments.length - 1] === '**';
  const regex = last ? new RegExp(`^${parts.slice(0, -1).join('/')}${parts.length > 1 ? '/' : ''}.+$`) : new RegExp(`^${parts.join('/')}$`);
  return { input, negated, matches: (file) => regex.test(file) };
};

/**
 * Whether `changed` is due the guards' suite: a path some positive input names and no negated one, or a path under one of `folders`
 * (the dependencies' folders, from the root). Throws on an input of a shape it does not read, before reading any path.
 */
export const dueOf = (changed: readonly string[], inputs: readonly string[], folders: readonly string[], folder = GUARDS): Due => {
  const patterns = inputs.map((input) => patternOf(input, folder));
  const positives = patterns.filter((p) => !p.negated);
  const negatives = patterns.filter((p) => p.negated);
  for (const file of changed) {
    const under = folders.find((dir) => file.startsWith(`${dir.replace(/\/$/, '')}/`));
    if (under !== undefined) return { due: true, why: `${file} is under ${under}, a workspace the guards depend on` };
    const named = positives.find((p) => p.matches(file));
    if (named !== undefined && !negatives.some((p) => p.matches(file)))
      return { due: true, why: `${file} is named by ${TASK}'s input ${named.input}` };
  }
  return {
    due: false,
    why: `none of the ${changed.length} changed paths is named by ${TASK}'s inputs or under a workspace the guards depend on`,
  };
};

type Manifest = { name?: string; workspaces?: string[]; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** The folders a root `package.json` workspace names: each folder of `dir` for `dir/*`, else the folder itself. */
const foldersOf = (root: string, glob: string): string[] => {
  const dir = glob.endsWith('/*') ? glob.slice(0, -2) : glob;
  if (/[*?[{]/.test(dir))
    throw new Error(`The root package.json's workspace ${JSON.stringify(glob)} is not a dir/* or a folder: write it as one.`);
  if (dir === glob) return [glob];
  return fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`) : [];
};

/** Each workspace package's folder by its name, from the root `package.json`'s `workspaces` (each `dir/*`). */
const workspacesOf = (root: string): Map<string, string> => {
  const folders = new Map<string, string>();
  for (const glob of readJson<Manifest>(path.join(root, 'package.json')).workspaces ?? []) {
    for (const candidate of foldersOf(root, glob)) {
      const manifest = path.join(root, candidate, 'package.json');
      const name = fs.existsSync(manifest) ? readJson<Manifest>(manifest).name : undefined;
      if (name !== undefined) folders.set(name, candidate);
    }
  }
  return folders;
};

/** The folders of the workspace packages `tools/guards` depends on, followed through their own dependencies. */
export const dependencyFolders = (root: string): string[] => {
  const workspaces = workspacesOf(root);
  const namesOf = (manifest: Manifest): string[] =>
    [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})].filter((n) => workspaces.has(n));
  const seen = new Set<string>();
  const queue = namesOf(readJson<Manifest>(path.join(root, GUARDS, 'package.json')));
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    queue.push(...namesOf(readJson<Manifest>(path.join(root, workspaces.get(name) as string, 'package.json'))));
  }
  return [...seen].map((name) => workspaces.get(name) as string).sort();
};

const SHA = /^[0-9a-f]{7,64}$/;

/** The range the event names, or why it names none this file can trust (which makes it due). */
export const rangeOf = (env: NodeJS.ProcessEnv): { range: string } | { none: string } => {
  const event = env.GITHUB_EVENT_NAME ?? '';
  if (event === 'pull_request') {
    const base = env.BASE ?? '';
    const head = env.HEAD_SHA ?? '';
    if (!SHA.test(base) || !SHA.test(head)) return { none: 'a pull request with no BASE or HEAD_SHA sha' };
    return { range: `${base}...${head}` };
  }
  if (event === 'push') {
    const before = env.BEFORE ?? '';
    const after = env.GITHUB_SHA ?? '';
    if (/^0+$/.test(before)) return { none: 'a first push, whose BEFORE is all zeros' };
    if (!SHA.test(before) || !SHA.test(after)) return { none: 'a push with no BEFORE or GITHUB_SHA sha' };
    return { range: `${before}..${after}` };
  }
  return { none: `the event ${JSON.stringify(event)}, which names no range` };
};

/** Throws on an input of a shape this file does not read, before any range is read: refused whatever the range is. */
const refuseUnread = (inputs: readonly string[]): void => {
  for (const input of inputs) patternOf(input);
};

/** The answer for the repository at `root` under `env`: what git says changed, read against the guards' inputs. */
const decide = (root: string, env: NodeJS.ProcessEnv): Due => {
  const tasks = readJson<{ tasks?: Record<string, { inputs?: string[] }> }>(path.join(root, 'turbo.json')).tasks ?? {};
  const inputs = tasks[TASK]?.inputs;
  if (inputs === undefined)
    throw new Error(`turbo.json has no tasks["${TASK}"].inputs: list there the paths the guards read, $TURBO_DEFAULT$ first.`);
  const folders = dependencyFolders(root);
  refuseUnread(inputs);
  const range = rangeOf(env);
  if ('none' in range) return { due: true, why: `${range.none}: running the guards` };
  let out: string;
  try {
    out = execFileSync('git', ['diff', '--name-only', range.range], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return {
      due: true,
      why: `git could not resolve ${range.range} in this checkout (a force-push, or a shallow clone): running the guards`,
    };
  }
  const changed = out.split('\n').filter((line) => line !== '');
  return dueOf(changed, inputs, folders);
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  let answer: Due;
  try {
    answer = decide(root, process.env);
  } catch (error) {
    process.stderr.write(`due: ${(error as Error).message}\n`);
    process.exit(1);
  }
  const line = `due=${answer.due}`;
  const output = process.env.GITHUB_OUTPUT;
  if (output !== undefined && output !== '') fs.appendFileSync(output, `${line}\n`);
  process.stdout.write(`due: ${line}: ${answer.why}\n`);
}
