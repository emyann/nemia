/**
 * What the git place declares of itself: the tools a landing session is denied, the sentences the code prints that name git's own
 * commands, as templates with `{name}` holes (`SAY_HOLES`), and its one machine need, the git identity a commit is made under
 * (`git-identity`), with the fix that sets it from a name and an email the person gives.
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
  needs: [
    {
      name: 'git-identity',
      message: 'git has a name and an email to commit under (git config --global user.name and user.email)',
      check: 'git config --global user.name >/dev/null && git config --global user.email >/dev/null',
      fixes: [
        {
          message: 'set the name and the email git commits under, for this machine',
          command: 'git config --global user.name "$NEMIA_ANSWER_NAME" && git config --global user.email "$NEMIA_ANSWER_EMAIL"',
          asks: [
            { name: 'name', message: 'the name your commits are made under' },
            { name: 'email', message: 'the email your commits are made under' },
          ],
        },
      ],
    },
  ],
};
