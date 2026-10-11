/**
 * What the git place declares of itself: the tools a landing session is denied, and the sentences the code prints that name git's own
 * commands, as templates with `{name}` holes (`SAY_HOLES`).
 */
import type { PlaceDeclared } from '../../src/place/place.ts';

/** The git place's declaration. */
export const declared: PlaceDeclared = {
  denyWhileLanding: ['Bash(git commit:*)', 'Bash(git merge --continue:*)'],
  say: {
    look: ['git diff {baseRef}', 'git status'],
    readResult: 'git -C {repo} diff {baseRef}...{branch}',
    ship: 'git -C {repo} merge --no-ff {branch}',
    drop: 'git -C {repo} branch -D {branches}',
    conflicts: '`git status` shows them.',
    unlock: 'git -C {repo} worktree unlock {path}',
    stage: 'git -C {repo} merge --no-ff --no-commit {branches}',
    attach: 'git -C {path} switch -c <branch>',
    commit: 'git -C {path} commit',
    inspect: 'git -C {path} status',
    orphans: 'git worktree list in their repository, and git worktree remove each',
    results: ['git log --oneline {base}..{branch}', 'git diff {base}...{branch}'],
    merge: 'git merge {sha}',
    mergeUncommitted: 'git merge --no-ff --no-commit {sha}',
    showMerge: 'git show --remerge-diff',
    lastMerge: 'git log --merges -1',
  },
};
