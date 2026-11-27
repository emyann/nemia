/**
 * What the two files that drive sdlc's landing program share (`land.boundary.test.ts`, the landing itself, and
 * `refresh.boundary.test.ts`, the refresh the program makes of a branch that lacks its base): a scratch world of a checkout on the
 * base with a bare `origin` and a run's branch in its own worktree, the served runs the stub `nemia` answers with, and one pass of
 * the program (`--once`) with the stub `gh` of `origin.ts` first on the PATH. Two files and not one, since together they pass the 800
 * lines a file stops at.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { type Called, type Gh, type Rule, bareOrigin, ghIn, gitIn } from './origin.ts';

/** The program. */
export const SCRIPT = path.join(import.meta.dirname, '..', 'sdlc', 'carried', 'land.ts');

/** The stub `nemia`: `get` answers the fixture of runs, any other call is recorded. */
const NEMIA = `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[0] === 'get' && process.env.NEMIA_UNREADABLE) {
  process.stderr.write('the api is not there');
  process.exit(1);
} else if (argv[0] === 'get') {
  process.stdout.write(fs.readFileSync(process.env.NEMIA_RUNS, 'utf8'));
} else {
  fs.appendFileSync(process.env.NEMIA_LOG, JSON.stringify(argv) + '\\n');
}
`;

/** A condition as the api serves it for a try. */
export type Served = { status?: 'True' | 'False' | 'Unknown'; message?: string };

/** What a served run's land step shows: the conditions it waits on, each as served, none where the step does not wait on it. */
export type Land = { turn?: Served; ci?: Served; landed?: Served; baseCi?: Served };

/** What a pass of the program did: its exit and streams, each condition it wrote, and each call it made of `gh`. */
export type Ran = {
  code: number | null;
  out: string;
  err: string;
  written: { run: string; step: string; name: string; status: string; message: string; tried: string }[];
  calls: Called[];
};

/** A check of the land step that waits on the condition `name`, passed where the condition is served True. */
const waiting = (name: string, served?: Served) => ({
  name,
  verdict: { result: served?.status === 'True' ? 'passed' : 'running' },
  condition: { name, try: 1, status: served?.status ?? null, message: served?.message ?? null },
});

/** One served run: its review step in `workspace` on its result branch, and its land step checking on `land`. */
export function served(
  id: string,
  over: { repo: string; workspace: string | null; startedAt: string; brief?: string; github?: boolean; land?: Land; base?: string },
) {
  const land = over.land ?? {};
  const github = over.github ?? true;
  const checks = github
    ? [waiting('turn', land.turn), waiting('ci', land.ci), waiting('landed', land.landed), waiting('base-ci', land.baseCi)]
    : [waiting('landed', land.landed)];
  return {
    metadata: { name: id },
    spec: { repo: over.repo, branch: over.base ?? 'main', brief: over.brief ?? 'Add the thing\n\nWith its reasons.' },
    status: {
      startedAt: over.startedAt,
      steps: [
        {
          name: 'review',
          status: 'succeeded',
          workspace: over.workspace,
          branch: `wf/${id}/run`,
          current: { try: 1 },
          check: null,
          checks: [],
        },
        { name: 'land', status: 'checking', workspace: null, branch: null, current: { try: 1 }, check: null, checks },
      ],
    },
  };
}

/** The flags the program is started with, by their names; the ones not given are the factory's defaults. */
export type Flags = {
  github?: boolean;
  refresh?: string;
  derives?: string;
  install?: string;
  localCheck?: string;
  unreadable?: boolean;
};

/** The `gh` stub's rule for `gh repo view`, which names the base. */
export const BASE_RULE = { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'main' } }) } satisfies Rule;

/**
 * One pass of the program over `runs`, answering `rules` as `gh`, started in a folder of its own.
 * @param runs The served runs.
 * @param rules What the stub `gh` answers.
 * @param flags The factory's parameters the program is handed.
 * @param gh A stub `gh` already written, to count its calls across passes; none, a new one.
 */
export function pass(runs: unknown[], rules: readonly Rule[], flags: Flags = {}, gh?: Gh) {
  const bin = gh?.bin ?? scratch('wf-land-bin-');
  const stub = gh ?? ghIn(bin, rules);
  if (gh) gh.answers(rules);
  fs.writeFileSync(path.join(bin, 'nemia'), NEMIA, { mode: 0o755 });
  const log = path.join(bin, 'conditions.jsonl');
  const file = path.join(bin, 'runs.json');
  fs.writeFileSync(file, JSON.stringify({ items: runs }));
  fs.rmSync(log, { force: true });
  const outside = fs.realpathSync(scratch('wf-land-cwd-'));
  const github = flags.github ?? true;
  const args = [
    SCRIPT,
    '--github',
    String(github),
    '--check',
    'ci',
    '--refresh',
    flags.refresh ?? '',
    '--derives',
    flags.derives ?? '',
    '--install',
    flags.install ?? '',
    '--local-check',
    flags.localCheck ?? '',
    '--once',
  ];
  const ran = spawnSync(process.execPath, args, {
    cwd: outside,
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: bin,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
      NEMIA_RUNS: file,
      NEMIA_LOG: log,
      ...(flags.unreadable ? { NEMIA_UNREADABLE: '1' } : {}),
      ...stub.env(),
    },
    encoding: 'utf8',
    timeout: 120_000,
  });
  const written = (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []).map((line) => {
    const argv = JSON.parse(line) as string[];
    const at = (flag: string) => argv[argv.indexOf(flag) + 1] ?? '';
    return {
      run: argv[1] ?? '',
      step: argv[2] ?? '',
      name: argv[3] ?? '',
      status: at('--status'),
      message: at('--message'),
      tried: at('--try'),
    };
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, written, calls: stub.calls(), gh: stub } satisfies Ran & { gh: Gh };
}

/** The calls of the stub `gh` that begin with `words`. */
export const asked = (calls: readonly Called[], ...words: string[]) =>
  calls.filter((call) => words.every((word, i) => call.argv[i] === word)) satisfies Called[];

/** Where a checkout stands: the branch it is on, its HEAD, whether it is clean, and whether a merge is in progress. */
export const stands = (repo: string) =>
  ({
    branch: gitIn(repo, 'symbolic-ref', '--short', 'HEAD').trim(),
    head: gitIn(repo, 'rev-parse', 'HEAD').trim(),
    clean: gitIn(repo, 'status', '--porcelain', '--untracked-files=no').trim() === '',
    merging: fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD')),
  }) satisfies Record<string, unknown>;

/** The parents of `sha` in `repo`. */
export const parents = (repo: string, sha: string) => gitIn(repo, 'rev-list', '--parents', '-n', '1', sha).trim().split(' ').slice(1);

/** Commit `files` in `repo` with `subject`: its sha. */
export function commit(repo: string, files: Record<string, string>, subject: string) {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  }
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', subject);
  return gitIn(repo, 'rev-parse', 'HEAD').trim();
}

/** The file the factory's command derives, both sides of a fixture changing it apart. */
export const DERIVED = 'derived.json';

/** The result branch of the run `id`. */
export const resultOf = (id: string) => `wf/${id}/run`;

/**
 * How a fixture's base moved after the branches forked: `derived`, a change to the derived file alone that conflicts with the branches';
 * `other`, that and a conflict in a file no command derives; `clean`, a file the branches did not touch; `held`, not at all.
 */
export type Moved = 'derived' | 'other' | 'clean' | 'held';

/** A checkout on the base, its bare `origin`, and for each run the branch with one commit, in a worktree of its own. */
export type World = {
  repo: string;
  bare: string;
  base: string;
  moved: string;
  runs: Record<string, { run: string; tip: string }>;
  marker: string;
};

/** A checkout whose base moved after the branches of `ids` forked from it, as `moved` says, each branch pushed and in its worktree. */
export function world(moved: Moved, ids: string[] = ['r-1']) {
  const repo = scratch('wf-land-repo-');
  gitIn(repo, 'init', '-q', '-b', 'main');
  const base = commit(
    repo,
    {
      'a.ts': 'export const a = 1;\n',
      [DERIVED]: '{ "v": 0 }\n',
      'other.txt': 'zero\n',
      '.github/workflows/ci.yml': 'name: ci\n',
      '.gitignore': 'deps/\n',
    },
    'base',
  );
  const bare = bareOrigin(repo);
  gitIn(repo, 'push', '-q', 'origin', 'main');
  const runs: World['runs'] = {};
  for (const id of ids) {
    gitIn(repo, 'switch', '-q', '-c', resultOf(id), base);
    const tip = commit(
      repo,
      { [`${id}.ts`]: `export const x = '${id}';\n`, [DERIVED]: '{ "v": 1 }\n', 'other.txt': 'branch\n' },
      `work of ${id}`,
    );
    gitIn(repo, 'push', '-q', 'origin', resultOf(id));
    gitIn(repo, 'switch', '-q', 'main');
    runs[id] = { run: '', tip };
  }
  const changes: Record<Moved, Record<string, string>> = {
    derived: { 'c.ts': 'export const c = 3;\n', [DERIVED]: '{ "v": 2 }\n' },
    other: { [DERIVED]: '{ "v": 2 }\n', 'other.txt': 'main\n' },
    clean: { 'c.ts': 'export const c = 3;\n' },
    held: {},
  };
  const after = moved === 'held' ? base : commit(repo, changes[moved], 'another landing');
  gitIn(repo, 'push', '-q', 'origin', 'main');
  for (const id of ids) {
    const run = path.join(scratch('wf-land-run-'), 'run');
    gitIn(repo, 'worktree', 'add', '-q', run, resultOf(id));
    runs[id].run = run;
  }
  return { repo, bare, base, moved: after, runs, marker: path.join(scratch('wf-land-marker-'), 'ran') } satisfies World;
}

/** One open pull request of the run `id` at `head`, as `gh pr list --json` gives it, GitHub calling it `mergeable`. */
export const listed = (id: string, head: string, mergeable = 'MERGEABLE', more: Record<string, unknown> = {}) => ({
  number: 7,
  url: 'https://github.com/o/r/pull/7',
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  headRefName: resultOf(id),
  headRefOid: head,
  mergeable,
  mergeCommit: null,
  ...more,
});
