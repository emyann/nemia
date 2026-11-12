/**
 * The inbox's writes and the labels as their words read a command line (`INBOX_WORDS`): what each takes, and what it refuses before
 * anything is asked — by its spec, a `CommandRefused`, or by its `check`, the words the client says — each naming the command, the flag
 * or the form to type, never its whole sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type Args,
  CommandRefused,
  INBOX_ADD_WORDS,
  INBOX_FROM_WORDS,
  INBOX_QUEUE_WORDS,
  INBOX_RM_WORDS,
  INBOX_WORDS,
  LABEL_INBOX_WORDS,
  LABEL_RUN_WORDS,
  parseArgv,
  type CommandWords,
} from 'objects';

/** What `words` read of `argv`, its `check` run on it: the arguments, or the refusal's words where it refused. */
const read = (words: CommandWords, argv: readonly string[]): Args | string => {
  try {
    const args = parseArgv(words.spec, argv);
    if (args === undefined) return `too little: ${words.name}`;
    return words.check?.(args) ?? args;
  } catch (err) {
    if (err instanceof CommandRefused) return err.message;
    throw err;
  }
};

/** Refused, naming each of `named`. */
const refuses = (words: CommandWords, argv: readonly string[], ...named: string[]): void => {
  const said = read(words, argv);
  assert.equal(typeof said, 'string', `${words.name} ${argv.join(' ')} was taken: ${JSON.stringify(said)}`);
  for (const n of named) assert.ok(String(said).includes(n), `${n} is not named in: ${String(said)}`);
};

test('the group is the six writes, in the order the help lists them, each linking the endpoint its runner calls', () => {
  assert.deepEqual(
    INBOX_WORDS.map((w) => [w.name, w.served.map((l) => l.endpoint)]),
    [
      ['inbox add', ['cards.create']],
      ['inbox queue', ['cards.queue', 'cards.unqueue']],
      ['inbox from', ['cards.update']],
      ['inbox rm', ['cards.delete']],
      ['label run', ['runs.labels']],
      ['label inbox', ['cards.labels']],
    ],
  );
  assert.deepEqual(
    INBOX_WORDS.map((w) => [w.class, w.writes, 'ticks' in w]),
    [
      ['act', true, false],
      ['act', true, true],
      ['act', true, false],
      ['ask', true, false],
      ['act', true, false],
      ['act', true, false],
    ],
    'who answers for each, and that each writes: what admission and the MCP port read',
  );
});

test('`nemia inbox add` takes the idea, then --workflow, --repo and --factory once each, and --label once per label', () => {
  assert.deepEqual(
    read(INBOX_ADD_WORDS, ['an idea', '--workflow', 'dev', '--repo', 'r', '--factory', 'f', '--label', 'a=b', '--label', 'c-']),
    { idea: 'an idea', workflow: 'dev', repo: 'r', factory: 'f', label: ['a=b', 'c-'] },
  );
});

test('REFUSED by `nemia inbox add`: no idea, two, a flag it does not take, one given twice or with no value', () => {
  refuses(INBOX_ADD_WORDS, [], 'takes the idea, first', 'nemia inbox add "<idea>"', '[--factory <name>]', 'nemia inbox add ./idea.md');
  refuses(INBOX_ADD_WORDS, ['--workflow', 'dev'], 'takes the idea, first', 'nemia inbox add "<idea>"');
  refuses(INBOX_ADD_WORDS, ['an idea', '--workflow'], 'nemia inbox add "<idea>" --workflow <name>');
  refuses(INBOX_ADD_WORDS, ['an idea', '--workflow='], 'nemia inbox add "<idea>" --workflow <name>');
  refuses(INBOX_ADD_WORDS, ['an idea', '--repo', 'a', '--repo', 'b'], 'nemia inbox add takes --repo once');
  refuses(INBOX_ADD_WORDS, ['an idea', '--factory', 'a', '--factory', 'b'], 'nemia inbox add takes --factory once');
  refuses(INBOX_ADD_WORDS, ['an idea', '--workflows', 'dev'], 'does not take --workflows', '--workflow <name>', '--repo <path>');
  refuses(INBOX_ADD_WORDS, ['an', 'idea'], 'idea is a second', 'nemia inbox add "<idea>"');
});

test('`nemia inbox queue` takes the card, then --workflow <name> or --off, never both', () => {
  assert.deepEqual(read(INBOX_QUEUE_WORDS, ['card', '--workflow', 'dev']), { name: 'card', workflow: 'dev' });
  assert.deepEqual(read(INBOX_QUEUE_WORDS, ['card', '--off']), { name: 'card', off: true });
  refuses(INBOX_QUEUE_WORDS, ['card', '--workflow', 'dev', '--off'], '--off', '--workflow');
  refuses(INBOX_QUEUE_WORDS, ['card', 'another'], 'another is a second', 'nemia inbox queue <name>');
  refuses(INBOX_QUEUE_WORDS, ['card', '--workflow'], '--workflow <name>');
  refuses(INBOX_QUEUE_WORDS, [], 'nemia inbox queue <name>');
});

test('`nemia inbox from` takes the card and the runs, or --off; refused with neither, or both', () => {
  assert.deepEqual(read(INBOX_FROM_WORDS, ['card', 'r-1', 'r-2']), { name: 'card', runs: ['r-1', 'r-2'] });
  assert.deepEqual(read(INBOX_FROM_WORDS, ['card', '--off']), { name: 'card', off: true });
  refuses(INBOX_FROM_WORDS, ['card'], 'nemia inbox from <name> <run>...', '--off');
  refuses(INBOX_FROM_WORDS, ['card', 'r-1', '--off'], '--off');
});

test('`nemia inbox rm` takes one card', () => {
  assert.deepEqual(read(INBOX_RM_WORDS, ['card']), { name: 'card' });
  refuses(INBOX_RM_WORDS, [], 'nemia inbox rm <name>');
  refuses(INBOX_RM_WORDS, ['card', 'another'], 'another is a second', 'nemia inbox rm <name>, once per card');
});

test('`nemia label run` and `label inbox` take the run or card, then its edits, and --overwrite; refused with no edit', () => {
  assert.deepEqual(read(LABEL_RUN_WORDS, ['r-1', 'team=core', 'x-', '--overwrite']), {
    runId: 'r-1',
    labels: ['team=core', 'x-'],
    overwrite: true,
  });
  assert.deepEqual(read(LABEL_INBOX_WORDS, ['card', 'team=core']), { name: 'card', labels: ['team=core'] });
  refuses(LABEL_RUN_WORDS, ['r-1'], 'nemia label run', 'key=value');
  refuses(LABEL_INBOX_WORDS, ['card'], 'nemia label inbox', 'key=value');
  refuses(LABEL_INBOX_WORDS, [], 'nemia label inbox <name> team=core');
});
