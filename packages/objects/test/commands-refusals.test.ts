/**
 * What the commands the client holds (`COMMAND_WORDS`) refuse of a command line before anything is asked, read by their own words here
 * (`parseArgv` and each command's `check`), and what they read of one: `retry`'s and `say`'s lines, a flag read wherever it stands, the
 * line a refusal shows, and, one table (`REFUSALS`), each refusal matched by the command, flag and fix it names, never by its whole
 * sentence. Moved from the orchestrator's `src/command/command.test.ts` with the words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Args, COMMAND_WORDS, CommandRefused, commandLine, parseArgv, type Spec } from 'objects';

/** The words of the command the client holds named `name`. */
const words = (name: string) => COMMAND_WORDS.find((w) => w.name === name) ?? assert.fail(`${name} is a command the client holds`);

const RETRY = words('retry');
const SAY = words('say');

/** The refusal's words `parseArgv` throws on `argv` as a `CommandRefused`, or none. */
function refusalOf(argv: readonly string[], spec: Spec): string | undefined {
  try {
    parseArgv(spec, argv);
    return undefined;
  } catch (err) {
    assert.ok(err instanceof CommandRefused, String(err));
    return err.message;
  }
}

/** That `said` is a refusal, and names each of `fixes`: the command, the flag, the value or the form its fix turns on. */
function names(said: string | null | undefined, ...fixes: string[]): void {
  assert.ok(said, 'refused');
  for (const fix of fixes) assert.ok(said.includes(fix), `${said} names ${fix}`);
}

/** What the command `name` refuses of `argv` before anything is asked, its parser's words or its check's; null where it takes it. */
function refusedBy(name: string, argv: readonly string[]): string | null {
  const command = words(name);
  try {
    const args: Args | undefined = parseArgv(command.spec, argv);
    assert.ok(args, `nemia ${name} ${argv.join(' ')} is given too little`);
    return command.check?.(args) ?? null;
  } catch (err) {
    assert.ok(err instanceof CommandRefused, String(err));
    return err.message;
  }
}

test("retry's command line keeps today's refusals", () => {
  names(refusalOf(['r-1', 'impl', '--fresh', '--recheck'], RETRY.spec), 'nemia retry', '--continue, --fresh, --model <m>, --recheck');
  names(
    refusalOf(['r-1', 'impl', '--message', '--fresh'], RETRY.spec),
    '--message takes',
    'nemia retry <runId> <step> --message "<answer>"',
    '--message=--fresh',
  );
  assert.deepEqual(parseArgv(RETRY.spec, ['r-1', 'impl', '--message=--fresh']), {
    mode: 'continue',
    runId: 'r-1',
    step: 'impl',
    message: '--fresh',
  });
  assert.deepEqual(parseArgv(RETRY.spec, ['r-1', 'impl', '--model', 'm']), {
    mode: 'fresh',
    runId: 'r-1',
    step: 'impl',
    model: 'm',
  });
});

test("say's words are every argument after its step, joined", () => {
  assert.deepEqual(parseArgv(SAY.spec, ['r-1', 'impl', 'look', '--at', 'this']), { runId: 'r-1', step: 'impl', text: 'look --at this' });
  assert.equal(parseArgv(SAY.spec, ['r-1']), undefined);
});

test("a table command's flag is read wherever it stands among the positionals, before them as after", async (t) => {
  const rows: readonly (readonly [row: string, spec: Spec, after: readonly string[], before: readonly string[]])[] = [
    ['retry --budget', RETRY.spec, ['r-1', '--budget', '5'], ['--budget', '5', 'r-1']],
  ];
  for (const [row, spec, after, before] of rows)
    await t.test(row, () => {
      const read = parseArgv(spec, after);
      assert.ok(read, `${after.join(' ')} is read`);
      assert.deepEqual(parseArgv(spec, before), read);
    });
});

test('the command line a table command shows names what was given', () => {
  assert.equal(commandLine(RETRY, { runId: 'r-1', step: 'impl' }), 'nemia retry r-1 impl');
  assert.equal(commandLine(SAY, { runId: 'r-1', step: 'impl', text: 'hi' }), 'nemia say r-1 impl');
  const add = words('factory add');
  assert.equal(commandLine(add, {}, { repos: '<path>' }), 'nemia factory add <name> --repo <path>');
});

/** What each flag `nemia stats` takes, as its refusal of one it does not take lists them. */
const STATS_FLAGS = ['--from', '--to', '--by', '--agent', '--step', '--factory', '--workflow', '--repo', '--line', '--json'];

/**
 * The commands a flag none of them takes was typed to, the words that fill their required arguments, and whether, typed where those
 * stand, it is refused as the argument left out (the command says its refusal of one, `missing`) or as the flag (`flagFirst`).
 */
const STRAY: ReadonlyArray<readonly [string, readonly string[], 'missing' | 'flag']> = [
  ['start', ['build it'], 'flag'],
  ['inbox', [], 'flag'],
  ['inbox add', ['an idea'], 'missing'],
  ['inbox queue', ['card'], 'missing'],
  ['inbox rm', ['card'], 'missing'],
  ['factory', [], 'flag'],
  ['factory ls', [], 'flag'],
  ['factory add', ['f'], 'missing'],
  ['factory attach', ['f', 'w'], 'flag'],
  ['factory detach', ['f', 'w'], 'flag'],
  ['factory hire', ['f', 'a'], 'missing'],
  ['factory fire', ['f'], 'missing'],
  ['factory rules', ['f'], 'missing'],
  ['factory instruction', ['f'], 'missing'],
  ['factory instruct', ['f'], 'missing'],
  ['factory rm', ['f'], 'missing'],
  ['agents custom', ['scribe'], 'flag'],
  ['pause', [], 'flag'],
  ['resume', [], 'flag'],
];

/**
 * A command the client holds, a command line, and what it refuses of it before anything is asked: the fragments it names — the command,
 * the flag, the value and the fix — and those it must not; null where it takes the line.
 */
type Refused = readonly [row: string, command: string, argv: readonly string[], said: readonly string[] | null, not?: readonly string[]];

const REFUSALS: readonly Refused[] = [
  ...[[], ['--until', 'a'], ['-x', '--off']].map((argv): Refused => [
    `hold, the run left out: ${argv.join(' ')}`,
    'hold',
    argv,
    ['nemia hold takes the run first', '--off'],
  ]),
  ...[['--until'], ['--until', '--off'], ['--until', '-a'], ['--until=']].map((argv): Refused => [
    `hold, --until given no run: ${argv.join(' ')}`,
    'hold',
    ['r-x', ...argv],
    ['--until takes the run to wait on'],
  ]),
  ['hold, --until and --off', 'hold', ['r-x', '--until', 'a', '--off'], ['takes --until or --off, not both', 'lift the hold first']],
  ['hold, --off with --why', 'hold', ['r-x', '--off', '--why', 'w'], ['nemia hold --off', 'takes no --why or --by']],
  ['hold, a flag it does not take', 'hold', ['r-x', '--after', 'a'], ['nemia hold does not take --after']],
  ['hold, --why given a flag', 'hold', ['r-x', '--until', 'a', '--why', '--x'], ['--why takes the words for why the run is held']],
  ['hold, --by only blanks', 'hold', ['r-x', '--until', 'a', '--by', ' '], ['--by takes', 'only blanks', 'leave --by out']],
  ['hold, --by twice', 'hold', ['r-x', '--until', 'a', '--by', 'a', '--by', 'b'], ['nemia hold takes --by once']],
  ['hold, --until twice with --why', 'hold', ['r-x', '--until', 'a', '--until', 'b', '--why', 'w'], null],
  ['hold, --off twice', 'hold', ['r-x', '--off', '--off'], null],

  ['pause, --why given a flag', 'pause', ['--why', '--by'], ['--why takes the words for why the store is paused']],
  ['pause, --why given a word starting -', 'pause', ['--why', '--x'], ['--why takes the words for why the store is paused']],
  ['pause, --by given nothing', 'pause', ['--by'], ['--by takes who pauses it']],
  ['pause, --why only blanks', 'pause', ['--why', ' \n '], ['--why takes', 'only blanks', 'leave --why out']],
  ['pause, --by too long', 'pause', ['--by', 'b'.repeat(65)], ['--by takes at most 64', 'given 65', 'shorter']],
  ['pause, --by twice', 'pause', ['--by', 'a', '--by', 'b'], ['nemia pause takes --by once']],
  ['pause, a word', 'pause', ['now'], ['nemia pause does not take now']],
  ['pause, --now given a value', 'pause', ['--now', '--now=yes'], ['nemia pause does not take --now=yes']],
  ['pause, --timeout with --now', 'pause', ['--timeout', '10m', '--now'], ['--timeout', '--now']],
  ['pause, --timeout out of its form', 'pause', ['--timeout', 'ten'], ['--timeout', '1s to 23h']],
  ['pause, --timeout', 'pause', ['--timeout', '90s'], null],
  ['pause, why and by', 'pause', ['--why', 'merging by hand', '--by=ann'], null],
  ['pause, nothing', 'pause', [], null],
  ['pause, now with yes', 'pause', ['--now', '--yes', '--why', 'the bill'], null],
  ['resume, a flag', 'resume', ['--all'], ['nemia resume takes no --all', 'whoever paused it']],
  ['resume, nothing', 'resume', [], null],

  ...[
    [['a', '--bad'], '--bad'],
    [['-x'], '-x'],
    [['a', '-x', 'b'], '-x'],
    [['a', '--delete-branches=yes'], '--delete-branches=yes'],
  ].map(([argv, arg]): Refused => [
    `rm, a flag it does not take: ${(argv as string[]).join(' ')}`,
    'rm',
    argv as string[],
    [`nemia rm does not take ${arg as string}.`, '--delete-branches', '--force-unmerged'],
  ]),
  ...[['a', '--force-unmerged'], ['--force-unmerged']].map((argv): Refused => [
    `rm, --force-unmerged alone: ${argv.join(' ')}`,
    'rm',
    argv,
    ['--force-unmerged forces --delete-branches', 'alone deletes nothing'],
  ]),
  ['rm, --delete-branches naming no run', 'rm', ['--delete-branches'], ['nemia rm <runId> [<runId> ...]', 'nemia ls']],
  ['rm, nothing: its runner prints the help', 'rm', [], null],
  ['rm, a run with both switches', 'rm', ['a', '--delete-branches', '--force-unmerged'], null],
  ...[
    [['--artifact'], '--artifact'],
    [['a', '-x'], '-x'],
    [['--yes=1'], '--yes=1'],
  ].map(([argv, arg]): Refused => [
    `prune, a flag it does not take: ${(argv as string[]).join(' ')}`,
    'prune',
    argv as string[],
    [`nemia prune does not take ${arg as string}.`, '--unmerged, --artifacts and --yes'],
  ]),
  ['prune, a run with every switch', 'prune', ['a', '--unmerged', '--artifacts', '--yes'], null],

  ['logs, a run and a step', 'logs', ['r', 's'], null],
  ['logs, a word more', 'logs', ['r', 's', 'extra'], ['nemia logs', "one run's id and one step's name", 'not extra.']],
  ['logs, a flag more', 'logs', ['r', 's', '--tail'], ['nemia logs', "one run's id and one step's name", 'not --tail.']],

  ...[['--from'], ['--from', '--to'], ['--from', '--to', '2026-09-30'], ['--from', '']].map((argv): Refused => [
    `stats, --from given no day: ${JSON.stringify(argv)}`,
    'stats',
    argv,
    ['--from takes a day', 'YYYY-MM-DD'],
  ]),
  ['stats, --agent given nothing', 'stats', ['--agent='], ["--agent takes an agent's name"]],
  ['stats, --by given a flag', 'stats', ['--by=--line'], ['--by', 'agent, step, factory, workflow, repo']],
  ['stats, --by twice', 'stats', ['--by', 'agent', '--by', 'step'], ['nemia stats takes --by once']],
  ['stats, --line twice', 'stats', ['--line', '--line'], null],
  ['stats, a flag it does not take', 'stats', ['--nope'], ['nemia stats does not take --nope.', ...STATS_FLAGS]],
  ['stats, a word', 'stats', ['stray'], ['nemia stats does not take stray.', ...STATS_FLAGS]],
  [
    'stats, --by a key the query does not take',
    'stats',
    ['--by', 'colour'],
    ['--by', 'agent, step, factory, workflow, repo', 'not "colour"'],
  ],
  ['stats, --to a day that is none', 'stats', ['--to', '2026-13-40'], ['--to', 'YYYY-MM-DD', 'UTC', 'not "2026-13-40"']],
  [
    'stats, days out of order',
    'stats',
    ['--from', '2026-09-30', '--to', '2026-09-01'],
    ['--from 2026-09-30', '--to 2026-09-01', 'earlier day first'],
  ],
  ['stats, a whole query', 'stats', ['--from', '2026-09-01', '--to', '2026-09-30', '--by', 'agent', '--repo', '/r'], null],

  ...STRAY.flatMap(([command, required, where]): Refused[] => [
    [`${command}, a flag it does not take after its arguments`, command, [...required, '--nope'], [`nemia ${command}`, '--nope']],
    ...(required.length > 0
      ? [
          where === 'missing'
            ? ([
                `${command}, a flag where its arguments stand: the argument left out`,
                command,
                ['--nope'],
                [`nemia ${command} takes`],
                ['--nope'],
              ] as const)
            : ([`${command}, a flag where its arguments stand: the flag`, command, ['--nope'], [`nemia ${command}`, '--nope']] as const),
        ]
      : []),
  ]),
  ['factory, a word it has no command of', 'factory', ['frob'], ['nemia factory does not take frob', 'nemia factory --help']],
  ['factory move, no --to', 'factory move', ['f'], ['--to <context>', 'nemia config get-contexts']],
  ['factory move, --repo with no =', 'factory move', ['f', '--to', 'b', '--repo', '/src/a'], ['--repo <source>=<url|path>', '/src/a']],
  ['factory move, --volume with no path', 'factory move', ['f', '--to', 'b', '--volume', 'data='], ['--volume <name>=<path>']],
  ['factory move, --from as --to', 'factory move', ['f', '--to', 'b', '--from', 'b'], ['--from', '--to', 'nemia config get-contexts']],
  ['factory move, --cards neither word', 'factory move', ['f', '--to', 'b', '--cards', 'some'], ['--cards follow|stay']],
  [
    'factory move, every flag',
    'factory move',
    ['f', '--to', 'b', '--from', 'a', '--repo', '/a=https://h/o/r.git', '--volume', 'v=/x', '--cards', 'stay'],
    null,
  ],
];

test('REFUSED: what each command the client holds refuses of its command line, before anything is asked', async (t) => {
  for (const [row, command, argv, said, not = []] of REFUSALS)
    await t.test(row, () => {
      const refused = refusedBy(command, argv);
      if (said === null) return assert.equal(refused, null);
      names(refused, ...said);
      for (const word of not) assert.ok(!refused?.includes(word), `${refused} names ${word}`);
    });
});
