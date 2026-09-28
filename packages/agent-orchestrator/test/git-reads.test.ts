/**
 * The git `.claude/settings.json` allows every session in this checkout, and so the whole of the git a `dontAsk` planner or reviewer
 * may run: git's read-only verbs, and nothing that writes, runs a program or moves a ref (the owner, 2026-09-25;
 * `workflows/dev/README.md`, *What git a fenced step may run*).
 *
 * An allow rule matches by prefix, so the fence is the list itself: a `Bash(git …)` allow that is not on `READS` fails, and `READS` is held
 * against the verbs that write, run a program or reach past the step's own directory, so the list cannot grow one either.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const SETTINGS = path.join(REPO, '.claude', 'settings.json');

/** Every git allow the settings may hold, word for word. `git merge-tree --write-tree` writes tree objects into the object store and moves no ref, index or file. */
const READS = [
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git status)',
  'Bash(git status:*)',
  'Bash(git branch)',
  'Bash(git branch --list:*)',
  'Bash(git merge-tree:*)',
  'Bash(git merge-base:*)',
  'Bash(git ls-tree:*)',
  'Bash(git ls-files:*)',
  'Bash(git rev-parse:*)',
  'Bash(git rev-list:*)',
  'Bash(git blame:*)',
  'Bash(git shortlog:*)',
  'Bash(git describe:*)',
];

/**
 * What no allow may name: every verb that writes a file, the index, a ref or the config, or goes to the network; `grep`, whose
 * `-O<cmd>` runs a program; and `fetch`. Any option before the verb is refused apart from these — `git -C <dir>` above all, since
 * `Bash(git -C:*)` would admit `git -C <dir> push`, which the deny `Bash(git push:*)` does not match.
 */
const NEVER = [
  'commit',
  'merge',
  'push',
  'pull',
  'checkout',
  'switch',
  'reset',
  'rebase',
  'cherry-pick',
  'revert',
  'tag',
  'stash',
  'add',
  'rm',
  'mv',
  'restore',
  'clean',
  'worktree',
  'update-ref',
  'config',
  'remote',
  'am',
  'apply',
  'gc',
  'prune',
  'notes',
  'replace',
  'filter-branch',
  'grep',
  'fetch',
];

/** Why a `Bash(git …)` allow is refused, or undefined for one on `READS` that names no verb on `NEVER`. Not a git rule: undefined. */
function refusalOf(rule: string): string | undefined {
  const body = /^Bash\((git(?:\s.*)?)\)$/.exec(rule)?.[1];
  if (body === undefined) return rule.startsWith('Bash(git') ? `${rule}: not one Bash rule` : undefined;
  const [, verb = '', ...rest] = body.replace(/:\*$/, '').split(/\s+/);
  if (verb === '') return `${rule}: every git command, by prefix`;
  if (verb.startsWith('-'))
    return `${rule}: an option before the verb (${verb}) reaches every verb after it, \`git -C <dir> push\` included`;
  if (NEVER.includes(verb)) return `${rule}: git ${verb} writes, runs a program or moves a ref`;
  if (verb === 'branch' && !(rest.length === 0 || (rest.length === 1 && rest[0] === '--list')))
    return `${rule}: git branch other than --list moves refs`;
  if (!READS.includes(rule)) return `${rule}: not on the named list of git reads`;
  return undefined;
}

const refusals = (allow: string[]) => allow.map(refusalOf).filter((r): r is string => r !== undefined);
const shipped = () => (JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) as { permissions: { allow: string[]; deny: string[] } }).permissions;

test('every git allow in the shipped settings is a read on the named list, and the list names no verb that writes', () => {
  const { allow } = shipped();
  assert.deepEqual(refusals(allow), []);
  assert.deepEqual(refusals(READS), [], 'the list itself holds no verb that writes, runs a program or moves a ref');
  // The reads the steps' recorded denials asked for are there, word for word: whether the branch still merges, and where.
  for (const rule of ['Bash(git merge-tree:*)', 'Bash(git merge-base:*)', 'Bash(git ls-tree:*)']) assert.ok(allow.includes(rule), rule);
  // And the deny list is the one it was: a push, and a branch deleted by force.
  assert.deepEqual(
    shipped().deny.filter((r) => r.startsWith('Bash(git')),
    ['Bash(git push)', 'Bash(git push:*)', 'Bash(git branch -D:*)', 'Bash(git branch --delete --force:*)'],
  );
});

test('REFUSED: a git allow for -C, grep, fetch, a verb that writes, a bare git, or a branch that is not --list, beside the shipped rules', () => {
  const { allow } = shipped();
  const refused = [
    'Bash(git -C:*)',
    'Bash(git -c:*)',
    'Bash(git --git-dir:*)',
    'Bash(git:*)',
    'Bash(git)',
    'Bash(git branch -m:*)',
    'Bash(git branch:*)',
    ...NEVER.map((verb) => `Bash(git ${verb}:*)`),
    ...NEVER.map((verb) => `Bash(git ${verb})`),
  ];
  for (const rule of refused) {
    const said = refusals([...allow, rule]);
    assert.equal(said.length, 1, `${rule} is refused: ${said.join('; ')}`);
    assert.ok(said[0].startsWith(`${rule}: `), said[0]);
  }
  // Refused for what it is, not only for being off the list: put on the list, a rule that writes is refused all the same.
  READS.push('Bash(git -C:*)', 'Bash(git commit:*)');
  try {
    assert.match(refusalOf('Bash(git -C:*)')!, /option before the verb/);
    assert.match(refusalOf('Bash(git commit:*)')!, /writes/);
  } finally {
    READS.splice(-2);
  }
  // A read off the list is refused too: the list is named, not inferred.
  assert.match(refusalOf('Bash(git cat-file:*)')!, /not on the named list/);
  assert.equal(refusalOf('Bash(npm test)'), undefined, 'not a git rule');
});
