/**
 * The git `.claude/settings.json` allows every session in this checkout — a person's own among them: git's read-only verbs, and nothing
 * that writes, runs a program or moves a ref.
 *
 * An allow rule matches by prefix, so the fence is the list itself: a `Bash(git …)` allow that is not a line of the read set sdlc's
 * read-only agents allow themselves (`READS`, read from the template's fence file, where each line's reason is written) fails, and a
 * verb that writes, runs a program or reaches past the step's own directory (`NEVER`) is refused even there.
 *
 * The agents' set is wider than the settings may be: `grep` stays off the settings for the reason `NEVER` gives — an allow here reaches
 * every session in the checkout, including a person's own in a shell they did not fence, and this list has no deny beside it. The
 * agents allow it and deny the pager option in every spelling git takes, which is why they may.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const SETTINGS = path.join(REPO, '.claude', 'settings.json');

/**
 * The read set sdlc's read-only agents allow themselves, as its fence file writes it: every git allow the settings may hold is one of
 * its lines, word for word, or one's command alone (`Bash(git status)` beside `Bash(git status:*)`), so the settings name no read the
 * agents' own set does not. `git merge-tree --write-tree` writes tree objects into the object store and moves no ref, index or file.
 */
const READS = (
  yaml.load(fs.readFileSync(path.join(REPO, 'packages', 'templates', 'sdlc', 'fences', 'read-only.allow.yaml'), 'utf8')) as string[]
).filter((rule) => rule.startsWith('Bash(git'));

/** Whether `rule` is a line of the read set, or the command alone of one that also takes what follows it. */
const onTheReadSet = (rule: string): boolean => READS.includes(rule) || READS.includes(rule.replace(/\)$/, ':*)'));

/**
 * What no allow may name: every verb that writes a file, the index, a ref or the config, or goes to the network; `grep`, whose
 * `-O<cmd>` runs a program; and `fetch`. Any option before the verb is refused apart from these — `git -C <dir>` above all, since
 * `Bash(git -C:*)` would admit `git -C <dir> push`, which the deny `Bash(git push:*)` does not match.
 *
 * `grep` is on this list and on the team's read-only agents' allow both: an allow here is answered by no deny, while each of those
 * agents denies the pager option in every spelling — a capital `O` after `git grep`, and `--op` with every longer spelling of
 * `--open-files-in-pager` — beside the allow (`agent-fences.test.ts`, `GIT_RUNS_A_PROGRAM`). A deny is what makes the verb allowable,
 * and the settings carry none.
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
  if (!onTheReadSet(rule)) return `${rule}: not on the read set of sdlc's read-only agents`;
  return undefined;
}

const refusals = (allow: string[]) => allow.map(refusalOf).filter((r): r is string => r !== undefined);
const shipped = () => (JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) as { permissions: { allow: string[]; deny?: string[] } }).permissions;

test('every git allow in the shipped settings is a read on the named list, and the list names no verb that writes', () => {
  const { allow } = shipped();
  assert.deepEqual(refusals(allow), []);
  const unheld = READS.filter((rule) => refusalOf(rule) !== undefined);
  assert.deepEqual(
    unheld,
    ['Bash(git grep:*)', 'Bash(git branch --contains:*)', 'Bash(git worktree list:*)'],
    "the read set's lines the settings may not hold: each answered on the agents by its denies or by its narrow form",
  );
  for (const rule of ['Bash(git merge-tree:*)', 'Bash(git merge-base:*)', 'Bash(git ls-tree:*)'])
    assert.ok(
      allow.includes(rule),
      `${rule}: a read the steps' recorded denials asked for, word for word: whether the branch still merges, and where`,
    );
  assert.deepEqual(
    (shipped().deny ?? []).filter((r) => r.startsWith('Bash(git')),
    [],
    "no git deny: a push and a forced branch delete are refused by each step's own fence (agent-fences.test.ts), and a person's session may push",
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
  READS.push('Bash(git -C:*)', 'Bash(git commit:*)');
  try {
    assert.match(refusalOf('Bash(git -C:*)')!, /option before the verb/, 'for what it is: on the list, a write is still refused');
    assert.match(refusalOf('Bash(git commit:*)')!, /writes/);
  } finally {
    READS.splice(-2);
  }
  assert.notEqual(refusalOf('Bash(git count-objects:*)'), undefined, 'a read off the set too: it is named, not inferred');
  assert.equal(refusalOf('Bash(git status)'), undefined, 'a command alone, whose rule with what follows is on the set');
  assert.equal(refusalOf('Bash(npm test)'), undefined, 'not a git rule');
});
