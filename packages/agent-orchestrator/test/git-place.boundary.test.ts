/**
 * The git side of the place's contract, at git's boundary: every walk of `WALKS` (`place-walks.ts`) asked of the git place over real
 * git, in scratch repositories. It gives the answers the test place is held to, which `place-contract.test.ts` runs the same walks on.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { gitPlace } from '../place/git/place.ts';
import { GIT_ENV, gitWorld } from './git-world.ts';
import { walksOn } from './place-walks.ts';
import { scratch } from 'test-kit/scratch';

for (const [name, walk] of walksOn(() => ({ place: gitPlace({ env: GIT_ENV }), world: gitWorld }))) test(name, walk);

/** Runs git with `args` in `cwd`, under the tests' own identity, a local path allowed as a submodule's source. */
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

test('root: a repository whose git folder is kept apart answers its checkout, never the git folder; a bare one answers itself', () => {
  const area = fs.realpathSync(scratch('wf-root-apart-'));
  const at = (...parts: string[]) => path.join(area, ...parts);
  const rootOf = (dir: string) => gitPlace({ env: GIT_ENV }).askNow('root', { dir });
  for (const name of ['lib', 'super']) {
    fs.mkdirSync(at(name));
    git(at(name), 'init', '-q', '-b', 'main');
    git(at(name), 'commit', '-q', '--allow-empty', '-m', 'first');
  }
  git(at('super'), 'submodule', 'add', '-q', at('lib'), 'sub');
  git(at('super', 'sub'), 'worktree', 'add', '-q', at('sub-cut'), '-b', 'cut');
  fs.mkdirSync(at('apart'));
  git(at('apart'), 'init', '-q', '-b', 'main', '--separate-git-dir', at('kept'));
  git(at('apart'), 'commit', '-q', '--allow-empty', '-m', 'first');
  git(at('apart'), 'worktree', 'add', '-q', at('apart-cut'), '-b', 'cut');
  fs.mkdirSync(at('apart', 'deep'));
  git(area, 'init', '-q', '--bare', at('bare.git'));
  assert.deepEqual(
    {
      submodule: rootOf(at('super', 'sub')),
      submoduleCut: rootOf(at('sub-cut')),
      superproject: rootOf(at('super')),
      apart: rootOf(at('apart')),
      insideApart: rootOf(at('apart', 'deep')),
      apartCut: rootOf(at('apart-cut')),
      bare: rootOf(at('bare.git')),
    },
    {
      submodule: { answer: { root: at('super', 'sub') } },
      submoduleCut: { answer: { root: at('super', 'sub') } },
      superproject: { answer: { root: at('super') } },
      apart: { answer: { root: at('apart') } },
      insideApart: { answer: { root: at('apart') } },
      apartCut: { answer: { root: at('apart-cut') } },
      bare: { answer: { root: at('bare.git') } },
    },
  );
});

test('REFUSED init: with no identity git will use, the folder is made a repository with no commit, and the refusal names git config', () => {
  const area = fs.realpathSync(scratch('wf-init-no-identity-'));
  const config = path.join(area, 'gitconfig');
  fs.writeFileSync(config, '[user]\n\tuseConfigOnly = true\n');
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(Object.entries(GIT_ENV).filter(([key]) => !/^GIT_(AUTHOR|COMMITTER)_/.test(key))),
    GIT_CONFIG_GLOBAL: config,
    HOME: area,
  };
  const dir = path.join(area, 'work');
  const outcome = gitPlace({ env }).askNow('init', { dir });
  const head = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: dir, env: GIT_ENV, encoding: 'utf8' });
  assert.deepEqual(
    { refused: 'refused' in outcome, repository: fs.existsSync(path.join(dir, '.git')), commit: head.status === 0 },
    { refused: true, repository: true, commit: false },
  );
  assert.match('refused' in outcome ? outcome.refused : '', /git config --global user\.email/);
});
