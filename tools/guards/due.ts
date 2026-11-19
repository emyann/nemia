/**
 * Whether a push or a pull request is due a job of `.github/workflows/ci.yml`: whether it changed a path that job reads. Each job, or
 * each leg of a matrix job, is a key (`test <workspace>`, `contracts <leg>`, `guards`, `lint`, …), and each key holds claims: a claim
 * names paths by inputs as turbo reads them, and the folders of the workspaces its own workspace depends on.
 *
 * Where a job runs a turbo task, its claims are turbo's own (`claimsOf`): the task's `inputs` in `turbo.json` (`<workspace>#<task>`,
 * else `<task>`, else `$TURBO_DEFAULT$`) and the folders of the workspaces its workspace depends on, followed through `dependencies`
 * and `devDependencies` as `^transit` and `^build` follow them. So turbo's cache and CI's filter are one list. Where a job runs no turbo
 * task (`lint`, `e2e`, `e2e-look`, `contracts <leg>`), its claims are written below (`LINT_SKIPS`, `LINT_CONFIGS`, `LINT_READS`,
 * `WRITTEN`), each held by `test/due.test.ts` to what it is read off. A typecheck reads its workspace's tests too (`TURBO_JOBS`).
 *
 * `jobDueOf` is the decision, pure, and `dueOf` the decision of one claim. It fails closed: a path in `EVERYWHERE`, or a path no
 * job's claim names, makes every job due. Run as a program from the repository's root, `node tools/guards/due.ts <job>` reads
 * `turbo.json`, the root `package.json`'s `workspaces` and every workspace's manifest, asks git which paths the event's range changed,
 * and appends `due=true` or `due=false` to the file `GITHUB_OUTPUT` names and one line saying which and why to the file
 * `GITHUB_STEP_SUMMARY` names, which GitHub shows on the run's summary page. It reads, as the gitleaks job of `ci.yml` does:
 *
 * - its first argument, the job, and `LEG`, the leg of a matrix job, when set: the key is `<job> <leg>`;
 * - `GITHUB_EVENT_NAME`: `pull_request` or `push`; any other event is due;
 * - `BASE` and `HEAD_SHA` on a pull request: `git diff --name-only BASE...HEAD_SHA`;
 * - `BEFORE` and `GITHUB_SHA` on a push: `git diff --name-only BEFORE..GITHUB_SHA`;
 * - `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY`: the files the answer is appended to; unset, the answer is only printed.
 *
 * A missing or malformed sha, an all-zero `BEFORE` (a branch's first push) and a range git cannot resolve are due. No job, a key no
 * claim holds, and an input of a shape it does not read are refused, and the process exits 1 having appended nothing: it never guesses
 * what a pattern covers. It imports Node's built-ins alone, so a job runs it before `npm ci`.
 *
 * The inputs read as turbo reads them: `$TURBO_DEFAULT$` is the workspace's own folder, `$TURBO_ROOT$/x` the repository's path `x`,
 * any other input a path under the workspace's folder, and a leading `!` takes a path out of its own claim, whatever positive input of
 * that claim names it. A pattern is made of `/`-separated segments, each a name, a name with `*` in it (any characters but `/`), or
 * `**`: any folders, none included, before another segment, and anything below when last.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The guards' own folder, from the repository's root: what `$TURBO_DEFAULT$` stands for in `dueOf` unless told another. */
export const GUARDS = 'tools/guards';

/** The task whose inputs say what the guards read. */
export const TASK = 'guards#test';

/** Whether a range is due, and why: the path that made it so and what named it, or that nothing did. */
export type Due = { due: true; why: string } | { due: false; why: string };

/** What a key reads: inputs as turbo reads them, the workspace folder `$TURBO_DEFAULT$` stands for, and its dependencies' folders. */
export type Claim = { inputs: readonly string[]; folder: string; folders: readonly string[] };

/** Every key a job of `ci.yml` asks, with the claims that make it due. */
export type Claims = Readonly<Record<string, readonly Claim[]>>;

/** The paths every job runs on: the install, turbo's graph, git's ignores, the workflow and this decision itself. */
export const EVERYWHERE: readonly string[] = [
  'package.json',
  'package-lock.json',
  'turbo.json',
  '.gitignore',
  '.github/workflows/ci.yml',
  'tools/guards/due.ts',
];

/** The extensions `npm run lint` reads none of: oxlint lints none of them, and `.oxfmtrc.json`'s `ignorePatterns` skips each. */
export const LINT_SKIPS: readonly string[] = ['md', 'json', 'jsonc', 'yaml', 'yml', 'html'];

/** The files that configure `npm run lint`, read whatever their extension. */
export const LINT_CONFIGS: readonly string[] = ['.oxlintrc.json', '.oxlintrc.fast.json', '.oxfmtrc.json'];

/**
 * The JSON `npm run lint` reads wherever it lies, as inputs: its type-aware rules (`typeAware` in `.oxlintrc.json`) resolve types
 * through each workspace's tsconfig, and resolve an import of a workspace through its manifest.
 */
export const LINT_READS: readonly string[] = ['$TURBO_ROOT$/**/tsconfig*.json', '$TURBO_ROOT$/**/package.json'];

/** What every contracts leg reads besides its workspaces: the prover and its legs. */
export const CONTRACTS_TOOL = '$TURBO_ROOT$/tools/contracts/**';

/**
 * The jobs that run no turbo task, by the workspaces they reach, each with the workspaces those depend on. `e2e` (asked by `e2e-bound`
 * too) visits the board, served by the api it spawns (`apps/web/test/e2e/served.ts`), whose orchestrator finds the builtin templates by
 * path; `e2e-look` draws the board's stories; each contracts leg proves the files `tools/contracts/legs.ts` gives it, which lie in
 * these workspaces (`test/due.test.ts` holds it).
 */
export const WRITTEN: Readonly<Record<string, readonly string[]>> = {
  e2e: ['web', 'api', 'templates'],
  'e2e-look': ['web'],
  'contracts observe': ['agent-runtime'],
  'contracts approval-refusal': ['agent-orchestrator'],
  'contracts rest': ['agent-runtime', 'agent-orchestrator', 'objects', 'api', 'cli', 'web', 'templates'],
};

type Pattern = { input: string; negated: boolean; matches: (file: string) => boolean };

const escape = (text: string): string => text.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/** A segment's regular expression, `/` included where another segment follows, or `undefined` for a shape this file does not read. */
const segmentOf = (segment: string, last: boolean): string | undefined => {
  if (segment === '**') return last ? '.+' : '(?:[^/]+/)*';
  if (segment === '' || segment === '.' || segment === '..' || /[?[\]{}!]/.test(segment) || segment.includes('**')) return undefined;
  return segment.split('*').map(escape).join('[^/]*') + (last ? '' : '/');
};

/**
 * An input as a pattern over the repository's paths; throws when its shape is one this file does not read.
 *
 * @param input the input, as `turbo.json` or this file's own table writes it.
 * @param folder the workspace's folder from the root, what `$TURBO_DEFAULT$` and a bare input stand under.
 * @param owner what lists the input, named in the refusal: a turbo task or a key of this file's.
 */
export const patternOf = (input: string, folder = GUARDS, owner = TASK): Pattern => {
  const negated = input.startsWith('!');
  const body = negated ? input.slice(1) : input;
  const refused = (): Error =>
    new Error(
      `${owner}'s input ${JSON.stringify(input)} has a shape tools/guards/due.ts does not read. Rewrite it, in turbo.json or in ` +
        "due.ts's own table, as a folder ending in /** (dir/**), a plain file, with * inside one segment (apps/*/src/**) or ** as a " +
        'whole segment (tools/**/*.ts); list two inputs instead of {a,b}.',
    );
  const repoPath = body === '$TURBO_DEFAULT$' ? `${folder}/**` : body.startsWith('$TURBO_ROOT$/') ? body.slice(13) : `${folder}/${body}`;
  if (repoPath.includes('$')) throw refused();
  const segments = repoPath.split('/');
  const parts = segments.map((segment, i) => segmentOf(segment, i === segments.length - 1));
  if (parts.some((part) => part === undefined)) throw refused();
  const regex = new RegExp(`^${parts.join('')}$`);
  return { input, negated, matches: (file) => regex.test(file) };
};

/** A claim compiled: why a path is due by it, or `undefined` where it names the path not. */
type Matcher = (file: string) => string | undefined;

const matcherOf = (claim: Claim, owner: string): Matcher => {
  const patterns = claim.inputs.map((input) => patternOf(input, claim.folder, owner));
  const positives = patterns.filter((p) => !p.negated);
  const negatives = patterns.filter((p) => p.negated);
  return (file) => {
    const under = claim.folders.find((dir) => file.startsWith(`${dir.replace(/\/$/, '')}/`));
    if (under !== undefined) return `${file} is under ${under}, a workspace ${owner} depends on`;
    const named = positives.find((p) => p.matches(file));
    if (named !== undefined && !negatives.some((p) => p.matches(file))) return `${file} is named by ${owner}'s input ${named.input}`;
    return undefined;
  };
};

/**
 * Whether `changed` is due one claim: a path some positive input names and no negated one, or a path under one of `folders`. Throws on
 * an input of a shape it does not read, before reading any path.
 *
 * @param changed the paths the range changed, from the root.
 * @param inputs the claim's inputs, as turbo reads them.
 * @param folders the folders of the workspaces the claim's workspace depends on, from the root.
 * @param folder the claim's own workspace folder, what `$TURBO_DEFAULT$` stands for.
 */
export const dueOf = (changed: readonly string[], inputs: readonly string[], folders: readonly string[], folder = GUARDS): Due => {
  const matches = matcherOf({ inputs, folder, folders }, TASK);
  for (const file of changed) {
    const why = matches(file);
    if (why !== undefined) return { due: true, why };
  }
  return {
    due: false,
    why: `none of the ${changed.length} changed paths is named by ${TASK}'s inputs or under a workspace the guards depend on`,
  };
};

/** Every claim compiled, by key; throws on an input of a shape this file does not read. */
const compiled = (claims: Claims): Map<string, Matcher[]> =>
  new Map(Object.entries(claims).map(([key, list]) => [key, list.map((claim) => matcherOf(claim, key))]));

/**
 * Whether `changed` is due the job `job`: due when a path is in `everywhere`, when a path no claim of any job names, and when a claim
 * of `job`'s names a path; not due otherwise, and not when nothing changed. Throws, before reading any path, on an input of a shape it
 * does not read and on a `job` no claim holds.
 *
 * @param job the key asked: a job, or `<job> <leg>` for a leg of a matrix job.
 * @param changed the paths the range changed, from the root.
 * @param claims every key's claims, as `claimsOf` reads them.
 * @param everywhere the paths every job runs on.
 */
export const jobDueOf = (job: string, changed: readonly string[], claims: Claims, everywhere: readonly string[] = EVERYWHERE): Due => {
  const matchers = compiled(claims);
  const own = matchers.get(job);
  if (own === undefined)
    throw new Error(
      `tools/guards/due.ts knows no job ${JSON.stringify(job)}: ask one of ${[...matchers.keys()].join(', ')}, or give it claims in due.ts's claimsOf`,
    );
  const every = [...matchers.values()].flat();
  for (const file of changed) {
    if (everywhere.includes(file)) return { due: true, why: `${file} is a path every job runs on` };
    for (const matches of own) {
      const why = matches(file);
      if (why !== undefined) return { due: true, why };
    }
    if (!every.some((matches) => matches(file) !== undefined)) return { due: true, why: `${file} is claimed by no job, so every job runs` };
  }
  return { due: false, why: `none of the ${changed.length} changed paths reaches ${job}` };
};

type Manifest = {
  name?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** The folders a root `package.json` workspace names: each folder of `dir` for `dir/*`, else the folder itself. */
const foldersOf = (root: string, glob: string): string[] => {
  const dir = glob.endsWith('/*') ? glob.slice(0, -2) : glob;
  if (/[*?[{]/.test(dir))
    throw new Error(`The root package.json's workspace ${JSON.stringify(glob)} is not a dir/* or a folder: write it as one.`);
  if (dir === glob) return [glob];
  return fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`) : [];
};

/** Each workspace package's folder by its name, from the root `package.json`'s `workspaces`. */
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

/**
 * The folders of the workspace packages the workspace at `folder` depends on, followed through their own dependencies.
 *
 * @param root the repository's root.
 * @param folder the workspace's folder, from the root.
 */
export const dependencyFolders = (root: string, folder = GUARDS): string[] => {
  const workspaces = workspacesOf(root);
  const namesOf = (manifest: Manifest): string[] =>
    [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})].filter((n) => workspaces.has(n));
  const seen = new Set<string>();
  const queue = namesOf(readJson<Manifest>(path.join(root, folder, 'package.json')));
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    queue.push(...namesOf(readJson<Manifest>(path.join(root, workspaces.get(name) as string, 'package.json'))));
  }
  return [...seen]
    .map((name) => workspaces.get(name) as string)
    .filter((each) => each !== folder)
    .sort();
};

/**
 * Every key a job of `ci.yml` asks, with its claims, read off the repository at `root`: `test <name>` for each workspace with a `test`
 * script but the guards, `guards`, `typecheck` and `build` from turbo's tasks; `lint`, `e2e`, `e2e-look` and `contracts <leg>` from
 * this file's table. Throws on a workspace the table names that the repository has not.
 *
 * @param root the repository's root.
 */
export const claimsOf = (root: string): Claims => {
  const workspaces = workspacesOf(root);
  const claims: Record<string, Claim[]> = {};
  for (const [key, claim] of [...turboClaims(root, workspaces), ...writtenClaims(root, workspaces)])
    claims[key] = [...(claims[key] ?? []), claim];
  return claims;
};

/**
 * Which turbo task's inputs make which job due, each needing the scripts it names. A workspace's typecheck reads its `test/` too, whose
 * files import what the tests read outside the workspace (`tools/release`, `tools/observe`, …), so the typecheck claims the `test`
 * task's inputs as well as its own.
 */
const TURBO_JOBS: readonly { job: 'test' | 'typecheck' | 'build'; task: string; scripts: readonly string[] }[] = [
  { job: 'test', task: 'test', scripts: ['test'] },
  { job: 'typecheck', task: 'typecheck', scripts: ['typecheck'] },
  { job: 'typecheck', task: 'test', scripts: ['typecheck', 'test'] },
  { job: 'build', task: 'build', scripts: ['build'] },
];

/** The claims of the jobs that run a turbo task, each beside its key, read off `turbo.json` and each workspace's scripts. */
const turboClaims = (root: string, workspaces: Map<string, string>): [string, Claim][] => {
  const tasks = readJson<{ tasks?: Record<string, { inputs?: string[] }> }>(path.join(root, 'turbo.json')).tasks ?? {};
  const keyOf = (job: string, name: string, folder: string): string => {
    if (job !== 'test') return job;
    return folder === GUARDS ? 'guards' : `test ${name}`;
  };
  return [...workspaces]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([name, folder]) => {
      const scripts = readJson<Manifest>(path.join(root, folder, 'package.json')).scripts ?? {};
      return TURBO_JOBS.filter((each) => each.scripts.every((script) => scripts[script] !== undefined)).map(
        ({ job, task }): [string, Claim] => [
          keyOf(job, name, folder),
          {
            inputs: tasks[`${name}#${task}`]?.inputs ?? tasks[task]?.inputs ?? ['$TURBO_DEFAULT$'],
            folder,
            folders: dependencyFolders(root, folder),
          },
        ],
      );
    });
};

/** The claims of the jobs that run no turbo task, each beside its key, from this file's table. */
const writtenClaims = (root: string, workspaces: Map<string, string>): [string, Claim][] => [
  ['lint', { inputs: ['$TURBO_ROOT$/**', ...LINT_SKIPS.map((ext) => `!$TURBO_ROOT$/**/*.${ext}`)], folder: '.', folders: [] }],
  ['lint', { inputs: [...LINT_CONFIGS.map((file) => `$TURBO_ROOT$/${file}`), ...LINT_READS], folder: '.', folders: [] }],
  ...Object.entries(WRITTEN).flatMap(([key, names]) => [
    ...names.map((name): [string, Claim] => {
      const folder = workspaces.get(name);
      if (folder === undefined)
        throw new Error(
          `tools/guards/due.ts's WRITTEN gives ${key} the workspace ${name}, which the root package.json's workspaces do not hold: name the workspace by its package name, or take it off`,
        );
      return [key, { inputs: ['$TURBO_DEFAULT$'], folder, folders: dependencyFolders(root, folder) }];
    }),
    ...(key.startsWith('contracts ') ? [[key, { inputs: [CONTRACTS_TOOL], folder: '.', folders: [] }] as [string, Claim]] : []),
  ]),
];

const SHA = /^[0-9a-f]{7,64}$/;

/**
 * The range the event names, or why it names none this file can trust (which makes it due).
 *
 * @param env the environment GitHub gives the step.
 */
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

/** The answer for `key` in the repository at `root` under `env`: what git says changed, read against every key's claims. */
const decide = (root: string, env: NodeJS.ProcessEnv, key: string): Due => {
  const claims = claimsOf(root);
  jobDueOf(key, [], claims);
  const range = rangeOf(env);
  if ('none' in range) return { due: true, why: `${range.none}: running every job` };
  let out: string;
  try {
    out = execFileSync('git', ['diff', '--name-only', range.range], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return {
      due: true,
      why: `git could not resolve ${range.range} in this checkout (a force-push, or a shallow clone): running every job`,
    };
  }
  return jobDueOf(
    key,
    out.split('\n').filter((line) => line !== ''),
    claims,
  );
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const job = process.argv[2] ?? '';
  const leg = process.env.LEG ?? '';
  const key = leg === '' ? job : `${job} ${leg}`;
  let answer: Due;
  try {
    if (job === '') throw new Error('name the job: run `node tools/guards/due.ts <job>`, with env LEG set to the leg of a matrix job');
    answer = decide(process.cwd(), process.env, key);
  } catch (error) {
    process.stderr.write(`due: ${(error as Error).message}\n`);
    process.exit(1);
  }
  const line = `due=${answer.due}`;
  const output = process.env.GITHUB_OUTPUT;
  if (output !== undefined && output !== '') fs.appendFileSync(output, `${line}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  const said = answer.due ? 'due' : 'not due, its work skipped';
  if (summary !== undefined && summary !== '') fs.appendFileSync(summary, `- \`${key}\`: ${said} — ${answer.why}\n`);
  process.stdout.write(`due: ${key}: ${line}: ${answer.why}\n`);
}
