/**
 * The handle a test holds on a repository (`World` in `place/memory/world.ts`), over real git: what a session and a person do to a
 * repository, each a git command or a few, in an environment with no configuration read and one identity (`GIT_ENV`). For the git side
 * of the place's contract (`git-place.boundary.test.ts`): the test place has its own, over what it holds in memory.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { World } from '../place/memory/index.ts';

/** The environment git runs in: this process's, without its git variables, with no configuration read and one identity. */
export const GIT_ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'place',
  GIT_AUTHOR_EMAIL: 'place@example.test',
  GIT_COMMITTER_NAME: 'place',
  GIT_COMMITTER_EMAIL: 'place@example.test',
};

/** Git run in `dir` with `args`, its stdout trimmed; it throws with git's words when git fails. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Each of `files` written under `dir`, or taken away where null. */
function written(dir: string, files: Readonly<Record<string, string | null>>): void {
  for (const [file, text] of Object.entries(files)) {
    const at = path.join(dir, file);
    if (text === null) fs.rmSync(at, { force: true });
    else {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, text);
    }
  }
}

/** A commit on `name` that changes `files`, made in `root`'s own checkout, which is put back on the branch it was on. */
function branch(root: string, name: string, files: Readonly<Record<string, string | null>>, from: string): string {
  const was = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  const there = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { cwd: root, env: GIT_ENV }).status === 0;
  if (was !== name) git(root, 'checkout', '-q', ...(there ? [name] : ['-b', name, from]));
  written(root, files);
  git(root, 'add', '-A', '--', ...Object.keys(files));
  git(root, 'commit', '-q', '-m', `on ${name}`);
  const made = git(root, 'rev-parse', 'HEAD');
  if (was !== name) git(root, 'checkout', '-q', was);
  return made;
}

/** The merge of `name` staged in `checkout` and not committed: git's exit 1 is a merge left in conflict, any other failure thrown. */
function stage(checkout: string, name: string): void {
  const ran = spawnSync('git', ['merge', '--no-ff', '--no-commit', name], { cwd: checkout, env: GIT_ENV, encoding: 'utf8' });
  if (ran.status !== 0 && ran.status !== 1) throw new Error(`git merge ${name} in ${checkout}: ${ran.stderr}`);
}

/** The handle, over git. */
export const gitWorld: World = {
  repository: (root, files) => {
    git(root, 'init', '-q', '-b', 'main');
    written(root, files);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'base');
    return git(root, 'rev-parse', 'HEAD');
  },
  commit: (checkout, message) => {
    git(checkout, 'add', '-A');
    git(checkout, 'commit', '-q', '--allow-empty', '-m', message);
    return git(checkout, 'rev-parse', 'HEAD');
  },
  branch: (root, name, files, from = 'main') => branch(root, name, files, from),
  stage,
  resolve: (checkout, file) => void git(checkout, 'add', '-A', '--', file),
  tag: (root, tag, rev) => void git(root, 'tag', tag, rev),
  head: (checkout) => git(checkout, 'rev-parse', 'HEAD'),
  read: (root, rev) => ({
    parents: git(root, 'log', '-1', '--format=%P', rev).split(' ').filter(Boolean),
    message: git(root, 'log', '-1', '--format=%B', rev),
  }),
  tip: (root, name) => {
    const ran = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { cwd: root, env: GIT_ENV, encoding: 'utf8' });
    return ran.status === 0 ? ran.stdout.trim() : null;
  },
  changes: (checkout) =>
    execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: checkout, env: GIT_ENV, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))
      .sort(),
  staged: (checkout) => {
    const ran = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], { cwd: checkout, env: GIT_ENV, encoding: 'utf8' });
    return ran.status === 0 ? ran.stdout.trim() : null;
  },
  takeBack: (checkout) => {
    if (gitWorld.staged(checkout) !== null) git(checkout, 'merge', '--abort');
  },
  putBack: (checkout, rev) => void git(checkout, 'reset', '-q', '--hard', rev),
};
