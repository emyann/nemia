/**
 * What the git place declares of itself: the tools a landing session is denied, the sentences the code prints that name git's own commands,
 * as templates with `{name}` holes (`SAY_HOLES`), and its needs: the git identity a commit is made under (`git-identity`), with the fix
 * that sets it from a name and an email the person gives; mise, installed by its own installer into the tools folder's `bin/` at `MISE_PIN`
 * (`mise`); and the toolchain a repository declares in mise's own files, `.tool-versions` or `mise.toml`, checked and installed by mise in
 * each factory's checkout (`repository-toolchain`, scope `repository`). Nemia names no language: a repository whose checkout mise reads no
 * tool from has its need met. mise keeps what it installs, and the shims that run it, under the tools folder (`toolsEnv`, `toolsPath`).
 *
 * From mise's documentation: the installer `curl -fsSL https://mise.run | sh` takes `MISE_INSTALL_PATH`, the executable's path, and
 * `MISE_VERSION`, the release (https://mise.jdx.dev/installing-mise.html); `MISE_DATA_DIR` holds tool installations, plugins and shims, the
 * shims in its `shims/` (https://mise.jdx.dev/directories.html); `mise install --dry-run-code` exits 1 when anything the config requests
 * needs installing, and 0 where the config requests nothing (its source at `v2026.11.5`, `src/cli/install.rs`), and `mise install` with no
 * arguments installs each one (https://mise.jdx.dev/cli/install.html), trusting its active
 * config itself (https://mise.jdx.dev/cli/trust.html); `.tool-versions` loads without trust outside paranoid mode
 * (https://mise.jdx.dev/paranoid.html). Each is read, none measured: `packages/agent-runtime/docs/harness.md`, *mise*, says how to confirm
 * them on a machine with mise.
 */
import type { PlaceDeclared } from '../../src/place/place.ts';

/** The mise release the `mise` need installs: its tag (https://github.com/jdx/mise/releases/tag/v2026.11.5). */
export const MISE_PIN = 'v2026.11.5';

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
    {
      name: 'mise',
      message: 'mise, which installs the toolchain a repository declares in .tool-versions or mise.toml, is found on the PATH',
      check: 'command -v mise >/dev/null',
      fixes: [
        {
          message: `install mise ${MISE_PIN} into the tools folder, by its own installer`,
          command: `curl -fsSL https://mise.run | MISE_INSTALL_PATH="$NEMIA_TOOLS/bin/mise" MISE_VERSION=${MISE_PIN} sh`,
        },
      ],
    },
    {
      name: 'repository-toolchain',
      message:
        "every tool mise reads in the repository's checkout is installed; where mise reads no version file there it is met, and a .tool-versions is the file to add if the repository needs a toolchain",
      check: 'mise install --dry-run-code >/dev/null 2>&1',
      scope: 'repository',
      fixes: [{ message: "install the tools mise reads in the repository's checkout", command: 'mise install' }],
    },
  ],
  toolsEnv: { MISE_DATA_DIR: 'mise' },
  toolsPath: ['mise/shims'],
};
