/**
 * The words of the moved reads (`src/commands-reads.ts`): `show`, `closeout`, `ls`, the inbox's bare read and `watch`, each line read
 * by its own spec and refused, a `CommandRefused`, by it or by its `check`, naming what to type. A label query the grammar refuses is the
 * api's to refuse, in the grammar's words: `apps/api/src/gauges/feed.test.ts` holds the stream's 422 of `message=hi`, `no/pe=x` and an
 * empty one, which the old command line refused itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSEOUT_WORDS,
  CommandRefused,
  INBOX_READ_WORDS,
  LS_WORDS,
  parseArgv,
  READ_WORDS,
  selectorFlag,
  SHOW_WORDS,
  WATCH_WORDS,
  type Args,
  type CommandWords,
} from 'objects';

/** The key `-l` fills, as its builder names it. */
const QUERY = selectorFlag('nemia ls').key ?? '';

/** What `words` make of `argv`: the arguments, or what refused them, by the spec or by the check, and `help` for a line it helps. */
function readOf(words: CommandWords, argv: readonly string[]): { args: Args } | { refused: string } | 'help' {
  try {
    const args = parseArgv(words.spec, argv);
    if (args === undefined) return 'help';
    const wrong = words.check?.(args);
    return wrong ? { refused: wrong } : { args };
  } catch (err) {
    assert.ok(err instanceof CommandRefused, `${String(err)} is a CommandRefused`);
    return { refused: err.message };
  }
}

/** The words `words` refuse `argv` in, which must name each of `fixes`. */
function refused(words: CommandWords, argv: readonly string[], ...fixes: string[]): void {
  const read = readOf(words, argv);
  assert.ok(typeof read === 'object' && 'refused' in read, `${words.name} ${argv.join(' ')} is refused: ${JSON.stringify(read)}`);
  for (const fix of fixes) assert.ok(read.refused.includes(fix), `${read.refused} names ${fix}`);
}

/** The arguments `words` read of `argv`, refused by neither the spec nor the check. */
function argsOf(words: CommandWords, argv: readonly string[]): Args {
  const read = readOf(words, argv);
  assert.ok(typeof read === 'object' && 'args' in read, `${words.name} ${argv.join(' ')} is read: ${JSON.stringify(read)}`);
  return read.args;
}

test('the group lists each read once, in the order the help lists them', () => {
  assert.deepEqual(
    READ_WORDS.map((w) => w.name),
    ['inbox', 'ls', 'show', 'closeout', 'watch'],
  );
});

test('a read takes its flag wherever it stands among its positionals, before them as after', async (t) => {
  const rows: ReadonlyArray<readonly [string, CommandWords, readonly string[], readonly string[]]> = [
    ['show --raw', SHOW_WORDS, ['r-1', '--raw'], ['--raw', 'r-1']],
    ['closeout --try', CLOSEOUT_WORDS, ['r-1', 'impl', '--try', '1'], ['--try', '1', 'r-1', 'impl']],
    ['ls -o wide', LS_WORDS, ['r-1', '-o', 'wide'], ['-o', 'wide', 'r-1']],
  ];
  for (const [row, words, after, before] of rows) await t.test(row, () => assert.deepEqual(argsOf(words, before), argsOf(words, after)));
});

test('show and closeout: a run, a step and a try read; REFUSED: a word or a flag more, naming what each takes', async (t) => {
  await t.test('show, a run raw', () => assert.deepEqual(argsOf(SHOW_WORDS, ['r', '--raw']), { runId: 'r', raw: true }));
  await t.test('show, a flag where the run stands', () => refused(SHOW_WORDS, ['--x'], "nemia show takes one run's id", 'not --x.'));
  await t.test('show, a word more', () => refused(SHOW_WORDS, ['r', 'extra'], "nemia show takes one run's id", 'not extra.'));
  await t.test('show, a second run behind its flag', () => refused(SHOW_WORDS, ['--raw', 'r-1', 'r-2'], 'nemia show', 'not r-2.'));
  await t.test('closeout, a try', () =>
    assert.deepEqual(argsOf(CLOSEOUT_WORDS, ['r', 's', '--try', '2']), { runId: 'r', step: 's', try: '2' }),
  );
  await t.test('closeout, a word more', () => refused(CLOSEOUT_WORDS, ['r', 's', 'extra'], 'nemia closeout', 'not extra.'));
  await t.test('closeout, --try twice', () =>
    refused(CLOSEOUT_WORDS, ['r', 's', '--try', '1', '--try', '2'], 'nemia closeout takes --try once'),
  );
});

test('ls: one run, or the runs a label query takes; REFUSED: a run beside -l, an output it does not print, a flag it does not take', async (t) => {
  await t.test('a run', () => assert.deepEqual(argsOf(LS_WORDS, ['r-1']), { runId: 'r-1' }));
  await t.test('-l twice, -L and --show-labels', () =>
    assert.deepEqual(argsOf(LS_WORDS, ['-l', 'team=core', '-l', 'tier=gold', '--show-labels', '-L', 'team']), {
      [QUERY]: ['team=core', 'tier=gold'],
      showLabels: true,
      labelColumns: ['team'],
    }),
  );
  await t.test('a run beside -l', () => refused(LS_WORDS, ['r-1', '-l', 'team=core'], 'nemia ls r-1', 'nemia ls -l team=core'));
  await t.test('an output other than wide', () => refused(LS_WORDS, ['-o', 'yaml'], 'not as yaml', 'nemia ls -o wide'));
  await t.test('a flag it does not take', () => refused(LS_WORDS, ['--nope'], 'nemia ls takes', 'not --nope.'));
});

test("the inbox's bare read: its flags read; REFUSED: a word it has no command of, naming the inbox's commands; --help, its manual", async (t) => {
  await t.test('every flag', () =>
    assert.deepEqual(argsOf(INBOX_READ_WORDS, ['--all', '-l', 'team=core', '--show-labels', '-L', 'team', '-o', 'wide']), {
      all: true,
      [QUERY]: ['team=core'],
      showLabels: true,
      labelColumns: ['team'],
      output: 'wide',
    }),
  );
  await t.test('a word it has no command of', () =>
    refused(INBOX_READ_WORDS, ['frob'], 'nemia inbox does not take frob', 'nemia inbox add', 'nemia inbox queue', 'nemia inbox --help'),
  );
  await t.test('-L given no key', () => refused(INBOX_READ_WORDS, ['-L'], 'nemia inbox -L takes', 'nemia inbox -L team'));
  await t.test('an output other than wide', () => refused(INBOX_READ_WORDS, ['-o', 'json'], 'not as json', 'nemia inbox -o wide'));
  await t.test('--help, its manual', () => {
    assert.equal(readOf(INBOX_READ_WORDS, ['--help']), 'help');
    assert.ok(INBOX_READ_WORDS.manual.includes('nemia inbox add'), 'the manual says every form of the inbox');
  });
});

test('watch: a cursor and every flag read; REFUSED: a cursor that is none, two, a flag it does not take, a cursor beside its file', async (t) => {
  await t.test('-l given once for each label, collected in order', () =>
    assert.deepEqual(argsOf(WATCH_WORDS, ['-l', 'agent=implementer', '-l', 'kind=Step']), { [QUERY]: ['agent=implementer', 'kind=Step'] }),
  );
  await t.test('every flag', () =>
    assert.deepEqual(argsOf(WATCH_WORDS, ['--once', '12', '-l', 'factory=acme', '--json']), {
      cursor: '12',
      once: true,
      [QUERY]: ['factory=acme'],
      json: true,
    }),
  );
  await t.test('a cursor that is no number', () => refused(WATCH_WORDS, ['x'], 'nemia watch takes one cursor at most', '`cursor:` line'));
  await t.test('two cursors', () => refused(WATCH_WORDS, ['1', '2'], 'nemia watch does not take 2'));
  await t.test('a flag it does not take', () => refused(WATCH_WORDS, ['--from'], 'nemia watch does not take --from'));
  await t.test("a typo'd short flag is no cursor", () => refused(WATCH_WORDS, ['-L'], 'nemia watch does not take -L'));
  await t.test('--cursor-file given nothing', () => refused(WATCH_WORDS, ['--cursor-file'], 'nemia watch --cursor-file takes the path'));
  await t.test('--cursor-file twice', () =>
    refused(WATCH_WORDS, ['--cursor-file', 'a', '--cursor-file', 'b'], 'nemia watch takes --cursor-file once'),
  );
  await t.test('a cursor beside a cursor file', () =>
    refused(WATCH_WORDS, ['500', '--cursor-file', 'f'], 'not both', 'given 500', 'drop the 500', 'drop --cursor-file', 'delete the file'),
  );
  await t.test('a wake flag, retired: what to type for the lines that wait on a person', () =>
    refused(WATCH_WORDS, ['--wake-word=x'], 'no longer takes --wake-word', '-l waits=person'),
  );
  await t.test("-l given no label query: the forms, then every key of a feed line, in order, and a person's labels", () => {
    const read = readOf(WATCH_WORDS, ['-l', '--json']);
    assert.ok(typeof read === 'object' && 'refused' in read, JSON.stringify(read));
    for (const form of ['nemia watch -l takes', '-l <key>=<value>', '-l <key>!=<value>', '-l "<key> in (<a>,<b>)"'])
      assert.ok(read.refused.includes(form), `${read.refused} names ${form}`);
    assert.deepEqual(read.refused.split('The keys: ')[1]?.split(', '), [
      'run',
      'factory',
      'workflow',
      'step',
      'agent',
      'kind',
      'reason',
      'on',
      'via',
      'type',
      'waits',
      'source',
      'and any label a person put',
    ]);
  });
});
