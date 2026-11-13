/**
 * The landing refresh, which `landing.ts merge` runs where the factory names a command that derives files of its own (`--refresh
 * <cmd>`, the paths it owns `--derives <paths>`) and the run's pull request lacks the base: two runs that change one derived file side
 * by side (a version, a digest) would otherwise meet at the landing as a conflict no review can answer, since what the second must
 * write depends on what the first landed. So the base is merged into the run's branch here, in the worktree that has the branch checked
 * out (a scratch one, removed after, where none has), the factory's command is run in it by `sh -c` to derive its files again from the
 * merged tree, and the result is pushed for CI to judge; the land step's check (`landing.ts receipt`) merges it once CI is green there.
 * A file of its own, beside `landing.ts`, since the refresh is a concept of its own and the landing is near the 800 lines a file stops
 * at; it imports `exec.ts` alone, as a carried script may import a sibling the run froze with it.
 *
 * The bound is mechanical, since the review read a head that no longer lands as is: the head pushed is git's plain merge of the
 * reviewed head and the base (`git merge-tree --write-tree`), differing from it only in the paths `--derives` names. A command that
 * exits non-zero (its stderr quoted), a path left unmerged, a change it left out of the index, and a difference from the plain merge
 * outside those paths each take the merge back (`git merge --abort`) and refuse, nothing pushed. A merge that went clean and that the
 * command changed nothing of is taken back too and the landing merges as it did before the refresh. Otherwise the merge is committed,
 * pushed to the branch with no force (`git push origin <sha>:refs/heads/<branch>`), and recorded for the check in `refreshed.json` in
 * the step's files folder (`$WF_STEP_FILES`, which the check is given as `WF_ARTIFACTS`), the merge commit's body copied in whole so
 * the check's merge reads what the session wrote even where its file has since changed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Refusal, git, run } from './exec.ts';

/** The record the refresh leaves for the land step's check, in the step's files folder. */
export const RECORD = 'refreshed.json';

/**
 * A refresh as the check reads it: the pull request, the head pushed, the head the review read, and the merge commit's subject and
 * body as the session gave them, with the file the body was read from.
 */
export type Refreshed = { pr: number; head: string; reviewed: string; subject: string; bodyFile: string; body: string };

/** What the merge verb hands the refresh: the pull request at the reviewed tip of `branch`, the base, the factory's command and paths. */
export type Asked = {
  pr: number;
  branch: string;
  tip: string;
  onto: string;
  command: string;
  derives: string;
  subject: string;
  bodyFile: string;
  /** The line a person types to run the land step again, which a refusal ends with. */
  retry: string;
};

/**
 * How long the factory's command may run, in milliseconds: the session that types the merge has ten minutes a call, and the merge's
 * reads of GitHub take some of them.
 */
const COMMAND_BOUND = 300_000;

/** The most bytes the command may print before it is cut off. */
const OUTPUT_BYTES = 16 * 1024 * 1024;

/** `git -C at args`, trimmed; refuses, saying what could not be told, when it fails. */
const gitAt = (at: string, what: string, ...args: string[]): string => git(what, '-C', at, ...args);

/** Whether a merge is in progress in the worktree `at`. */
const merging = (at: string): boolean => run('git', ['-C', at, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0;

/**
 * Whether the reviewed tip lacks the base as the remote has it now, after a `git fetch origin`; refuses a fetch that fails, since a
 * landing that read a stale base would refresh against the wrong one.
 */
export function lacksBase(onto: string, tip: string, retry: string): boolean {
  const fetched = run('git', ['fetch', 'origin']);
  if (fetched.status !== 0)
    throw new Refusal(`\`git fetch origin\` failed, so the base this landing merges onto is unknown: ${fetched.err}\n${retry}`);
  return run('git', ['merge-base', '--is-ancestor', `origin/${onto}`, tip]).status !== 0;
}

/** The worktree of this repository with `branch` checked out, or none: read from `git worktree list --porcelain`. */
function checkedOut(branch: string): string | undefined {
  const blocks = git('the worktrees of this repository', 'worktree', 'list', '--porcelain').split('\n\n');
  const block = blocks.find((it) => it.split('\n').includes(`branch refs/heads/${branch}`));
  return block
    ?.split('\n')
    .find((line) => line.startsWith('worktree '))
    ?.slice('worktree '.length);
}

/** The worktree `at` read as a refresh needs it: clean, with no merge in progress. Refuses one a person is working in, naming it. */
function quiet(at: string, branch: string, retry: string): void {
  const dirty = gitAt(at, `whether ${at} is clean`, 'status', '--porcelain', '--untracked-files=no');
  if (dirty || merging(at))
    throw new Refusal(
      `\`${at}\` has \`${branch}\` checked out with ${dirty ? `uncommitted changes:\n${dirty}\n ` : 'a merge in progress, and'} the ` +
        'landing merges the base into it there: a person commits or puts the changes aside (or `git merge --abort`s), then the step ' +
        `is retried. Nothing is merged or pushed.\n${retry}`,
    );
}

/** The paths `derives` names, each as a git pathspec left out of a diff: `:(exclude,glob)<path>`. */
const excluded = (derives: string): string[] =>
  derives
    .split(/\s+/)
    .filter(Boolean)
    .map((it) => `:(exclude,glob)${it}`);

/**
 * The trial in the worktree `at`, a merge of the base in progress there: the factory's command run, and the index it left read
 * against git's plain merge. Refuses where the command failed, left a path unmerged or a change out of the index, or changed anything
 * outside the derived paths. True where the result is the plain merge and that went clean: there is nothing to refresh.
 */
function tried(at: string, a: Asked): boolean {
  const ran = spawnSync('sh', ['-c', a.command], {
    cwd: at,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: COMMAND_BOUND,
    maxBuffer: OUTPUT_BYTES,
  });
  if (ran.status !== 0)
    throw new Refusal(
      `the factory's refresh (\`${a.command}\`) ${ran.status === null ? 'did not finish' : `exited ${ran.status}`} on the base merged ` +
        `into \`${a.branch}\`, so the landing took the merge back and pushed nothing. It said:\n${(ran.stderr || ran.error?.message || '').trim()}\n` +
        `  Fix what it names on the branch, or run it by hand in \`${at}\` after \`git merge --no-ff --no-commit origin/${a.onto}\`.\n${a.retry}`,
    );
  const unmerged = gitAt(at, 'the paths left unmerged', 'diff', '--name-only', '--diff-filter=U');
  if (unmerged)
    throw new Refusal(
      `merging \`${a.onto}\` into \`${a.branch}\` leaves ${unmerged.split('\n').join(', ')} unmerged after the factory's refresh, which ` +
        `resolves only the paths it derives (${a.derives || 'none'}): the work merges its base and goes round again, the review ` +
        `sending it back. Nothing is pushed.\n${a.retry}`,
    );
  const unstaged = gitAt(at, 'what the refresh left out of the index', 'diff', '--name-only');
  if (unstaged)
    throw new Refusal(
      `the factory's refresh changed ${unstaged.split('\n').join(', ')} and left ${unstaged.includes('\n') ? 'them' : 'it'} out of the ` +
        `index: a refresh \`git add\`s each file it derives. Fix the command, then the step is retried. Nothing is pushed.\n${a.retry}`,
    );
  const index = gitAt(at, 'the tree the refresh made', 'write-tree');
  const plain = run('git', ['-C', at, 'merge-tree', '--write-tree', a.tip, `origin/${a.onto}`]);
  if (plain.status !== 0 && plain.status !== 1)
    throw new Refusal(`\`git merge-tree --write-tree\` failed, so the refresh cannot be bounded: ${plain.err}\n${a.retry}`);
  const tree = plain.out.split('\n')[0].trim();
  const outside = gitAt(at, 'what the refresh changed', 'diff', '--name-only', tree, index, '--', '.', ...excluded(a.derives));
  if (outside)
    throw new Refusal(
      `the base merged into \`${a.branch}\` and refreshed differs from git's plain merge in ${outside.split('\n').join(', ')}, outside the ` +
        `paths the factory derives (${a.derives || 'none'}), and a landing lands nothing the review did not read but those: fix the ` +
        `factory's refresh or its \`landingDerives\`, or merge the base into the branch and send it round. Nothing is pushed.\n${a.retry}`,
    );
  return plain.status === 0 && tree === index;
}

/** The merge in `at` committed and pushed to the branch, never forced: the head pushed. Takes the commit back where the push failed. */
function pushed(at: string, a: Asked): string {
  gitAt(at, 'the refreshed merge', 'commit', '-q', '--no-verify', '-m', `Merge ${a.onto} into ${a.branch} at the landing`);
  const head = gitAt(at, 'the refreshed head', 'rev-parse', 'HEAD');
  const push = run('git', ['push', 'origin', `${head}:refs/heads/${a.branch}`]);
  if (push.status !== 0) {
    gitAt(at, 'the branch put back on its reviewed tip', 'reset', '-q', '--hard', a.tip);
    throw new Refusal(
      `\`git push origin ${head.slice(0, 12)}:refs/heads/${a.branch}\` was declined, so the refreshed merge was taken back and ` +
        `\`${a.branch}\` is at the reviewed tip again: ${push.err}\n${a.retry}`,
    );
  }
  return head;
}

/**
 * The refresh of `a`'s branch, which lacks the base: the lines it says where it pushed a refreshed head, or none where the trial went
 * clean and changed nothing, the landing then merging as before. Refuses as `tried` does, and a worktree a person is working in.
 */
export function refresh(a: Asked): string[] | undefined {
  const files = process.env.WF_STEP_FILES;
  if (!files || !fs.existsSync(files))
    throw new Refusal(
      `\`WF_STEP_FILES\` names no folder, and a refresh leaves its record there for the land step's check: run the merge from the ` +
        `land step's session, which is given it.\n${a.retry}`,
    );
  const body = fs.readFileSync(a.bodyFile, 'utf8');
  const held = checkedOut(a.branch);
  if (held) quiet(held, a.branch, a.retry);
  const at = held ?? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-refresh-')), 'tree');
  if (!held) git('a scratch worktree of the branch', 'worktree', 'add', '-q', at, a.branch);
  try {
    const merged = run('git', ['-C', at, 'merge', '-q', '--no-ff', '--no-commit', `origin/${a.onto}`]);
    if (!merging(at)) throw new Refusal(`\`git merge origin/${a.onto}\` did not start in \`${at}\`: ${merged.err}\n${a.retry}`);
    let same: boolean;
    try {
      same = tried(at, a);
    } catch (err) {
      run('git', ['-C', at, 'merge', '--abort']);
      throw err;
    }
    if (same) {
      run('git', ['-C', at, 'merge', '--abort']);
      return undefined;
    }
    const head = pushed(at, a);
    const record: Refreshed = { pr: a.pr, head, reviewed: a.tip, subject: a.subject, bodyFile: a.bodyFile, body };
    fs.writeFileSync(path.join(files, RECORD), `${JSON.stringify(record, null, 2)}\n`);
    return [
      `\`${a.branch}\` lacked \`${a.onto}\`: the base is merged into it and the factory's refresh (\`${a.command}\`) derived again ` +
        `what it owns (${a.derives || 'nothing'}), the rest git's plain merge`,
      `${head.slice(0, 12)} is pushed to \`${a.branch}\`, and #${a.pr} is not merged yet: this step's check merges it once CI is ` +
        `green at ${head.slice(0, 12)} (recorded in ${path.join(files, RECORD)}). Sign off done.`,
    ];
  } finally {
    if (!held) {
      run('git', ['worktree', 'remove', '--force', at]);
      fs.rmSync(path.dirname(at), { recursive: true, force: true });
    }
  }
}

/** The refresh recorded in `dir` (the check's `WF_ARTIFACTS`), or none where there is no record or it does not parse as one. */
export function recorded(dir: string | undefined): Refreshed | undefined {
  if (!dir) return undefined;
  const file = path.join(dir, RECORD);
  if (!fs.existsSync(file)) return undefined;
  try {
    const it = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Refreshed>;
    return typeof it.pr === 'number' && typeof it.head === 'string' && typeof it.subject === 'string' && typeof it.body === 'string'
      ? (it as Refreshed)
      : undefined;
  } catch {
    return undefined;
  }
}

/** `body` written to a file of a scratch folder, for `gh pr merge --body-file`: its path, and the removal of the folder. */
export function bodyFileOf(body: string): { file: string; done: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-land-body-'));
  const file = path.join(dir, 'merge-body.md');
  fs.writeFileSync(file, body);
  return { file, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
