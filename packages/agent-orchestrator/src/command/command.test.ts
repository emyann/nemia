/**
 * The command table's parser, help and rules: `objects`' parser (its rows in `packages/objects/test/command.test.ts`) refusing as the
 * package's own `Invalid`, the table's command lines read and refused in their own words, the line a refusal shows, the help the table
 * prints, where a table breaks its rules (one table, `BREAKS`), and what each command of the CLI refuses
 * of its command line before anything is read (one table, `REFUSALS`), matched by the command, flag and fix each names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { COMMAND_WORDS, CommandRefused, dollarsOf as dollarsOfObjects, parseArgv as parseArgvOf } from 'objects';
import { dollarsOf } from '../keys/keys.ts';
import { amountOf, commandBreaks, helpOf, leftOut, parseArgv, RENAMED, renamedIn, renamedValues, type Spec, toolsOf } from './command.ts';
import { TABLE } from './commands.verb.ts';

const SPEC: Spec = {
  positionals: [
    { key: 'runId', takes: 'required', kind: 'name' },
    { key: 'step', takes: 'optional', kind: 'name' },
  ],
  flags: [
    { flag: '--fast', kind: 'switch', sets: { mode: 'fast' }, way: true },
    { flag: '--slow', kind: 'switch', sets: { mode: 'slow' }, way: true },
    { flag: '--note', kind: 'text', key: 'note', takes: 'NOTE TAKES', twice: 'NOTE TWICE' },
    { flag: '--who', kind: 'name', key: 'who', takes: 'WHO TAKES' },
    { flag: '--budget', kind: 'amount', key: 'budget', takes: 'the cap', form: 'x <runId> --budget <amount>' },
  ],
  defaults: { mode: 'fast' },
  unknown: (arg) => `UNKNOWN ${arg}`,
  oneWay: 'ONE WAY',
  apart: (flag) => `APART ${flag}`,
};

/** The refusal's words `parseArgv` throws on `argv`, or none. */
function refusalOf(argv: readonly string[], spec: Spec = SPEC): string | undefined {
  try {
    parseArgv(spec, argv);
    return undefined;
  } catch (err) {
    assert.equal((err as { _tag?: string })._tag, 'Invalid');
    assert.equal((err as { exitCode?: number }).exitCode, 2);
    return (err as Error).message;
  }
}

/** That `words` are a refusal, and name each of `fixes`: the command, the flag, the value or the form its fix turns on. */
function names(words: string | null | undefined, ...fixes: string[]): void {
  assert.ok(words, 'refused');
  for (const fix of fixes) assert.ok(words.includes(fix), `${words} names ${fix}`);
}

/** A handler, as `commandBreaks` asks only whether an entry has one. */
const handler = (): undefined => undefined;

const entry = (name: string) => TABLE.find((c) => c.name === name)!;

/** What `command` refuses of `argv` before anything is read, its parser's words or its check's; null where it takes it. */
function refusedBy(command: (typeof TABLE)[number], argv: readonly string[]): string | null {
  try {
    const args = parseArgv(command.spec, argv);
    assert.ok(args, `nemia ${command.name} ${argv.join(' ')} is given too little`);
    return command.check?.(args) ?? null;
  } catch (err) {
    assert.equal((err as { _tag?: string })._tag, 'Invalid');
    assert.equal((err as { exitCode?: number }).exitCode, 2);
    return (err as Error).message;
  }
}

test("objects' refusal of a command line is the package's own: Invalid, exit 2", () => {
  assert.throws(() => parseArgvOf(SPEC, ['r-1', '--fast', '--slow']), CommandRefused);
  assert.equal(refusalOf(['r-1', '--fast', '--slow']), 'ONE WAY', 'parseArgv: throw asInvalid(err)');
  assert.throws(
    () => amountOf('0', 'the cap', 'x'),
    (err) => (err as { _tag?: string })._tag === 'Invalid',
  );
  assert.equal(parseArgv(SPEC, ['r-1'])?.runId, 'r-1', 'what is read is returned as it is');
});

test('no command the client holds is named by a former name', () => {
  for (const command of COMMAND_WORDS) assert.equal(RENAMED.has(command.name), false, `${command.name} is a key of RENAMED`);
});

test("a text flag's value left out — empty, or a word starting -- — is refused in its own takes", () => {
  const spec = SPEC;
  assert.equal(leftOut(spec, { runId: 'r-1', note: '' }), 'NOTE TAKES');
  assert.equal(leftOut(spec, { runId: 'r-1', note: '--slow' }), 'NOTE TAKES');
  assert.equal(leftOut(spec, { runId: 'r-1', note: ['hi', '--x'] }), 'NOTE TAKES');
  assert.equal(leftOut(spec, { runId: 'r-1', note: 'hi -- there' }), null);
  assert.equal(leftOut(spec, { runId: 'r-1', who: '' }), null, 'a name flag is refused by the reader, not here');
});

test("the help of the commands this CLI still serves — the machine's and those it keeps — is today's, word for word", () => {
  const moved: readonly string[] = COMMAND_WORDS.map((w) => w.name);
  assert.equal(
    helpOf(TABLE.filter((c) => c.only?.side !== 'api' && !moved.includes(c.name))),
    [
      '  nemia template lint <folder|archive>',
      "                               check a template's folder or archive: every problem at once, each at its",
      '                               file and line',
      '  nemia template export <folder> --from <repo> [--factory <name>]',
      '                               write a template from a repository and a factory, and say where each',
      '                               part came from',
      '  nemia template pack <folder> [--out <file>]',
      "                               pack a template's folder that passes its check into one archive, and print",
      '                               the digest of its content',
      '  nemia template unpack <archive> <dir>',
      "                               write the folder a template's archive holds at <dir>/<name>, each file's",
      '                               bytes and mode as packed',
      '  nemia service install [--env KEY=VALUE ...] [--size auto] [--bind <addr> [--public]] [--name <name>] [--take-over <pid>]',
      '                               install the daemon as a login service: a systemd user unit on Linux,',
      '                               a launchd agent on macOS. It runs the api of this checkout with this',
      '                               node, WF_ROOT and PATH, and each --env, written once; it restarts on',
      '                               failure and starts at login. Started now unless another daemon holds',
      '                               the store; --take-over <pid> pauses the store, waits for the calls',
      '                               in flight of its sessions, stops that pid and starts the service',
      '                               (checks and jobs run on, as nemia service restart --help says).',
      "                               --size auto: the sessions at once and each one's memory limit, read",
      '                               off this machine (WF_MAX_CONCURRENT, WF_MEMORY_LIMIT; no limit on',
      '                               macOS), each but one --env gives. --bind <addr>: the address the',
      '                               daemon listens on (NEMIA_BIND), and the store marked exposed',
      '                               (WF_EXPOSED=1), so every caller presents a token: nemia pairings',
      '                               approve and nemia board link hand out the first. A public or',
      '                               wildcard address is refused unless --public acknowledges it',
      "                               (NEMIA_BIND_PUBLIC=1); nemia service addresses lists this machine's.",
      '                               --name: the service name (nemia; required for a store that is not',
      '                               the default)',
      '  nemia service uninstall [--name <name>]',
      '                               stop the login service, disable it and remove its file; a daemon',
      '                               started by hand is left alone',
      '  nemia service status [--name <name>]',
      '                               the login service and the lease: whether it is installed and runs,',
      '                               the checkout it runs, who holds the store, and lingering',
      '  nemia service restart [--name <name>] [--timeout <d>]',
      "                               restart the service's daemon on the code it runs: pause the store, give",
      "                               the daemon's sessions up to the timeout to end their tool calls",
      '                               (--timeout <d>, else nemia pause-timeout, 10m by default), stop it (up to',
      '                               90s, and until the unit has ended its process), start the service (up to',
      '                               60s), and resume once the new daemon has completed its first pass;',
      '                               refused, naming the log, when that pass fails, and naming the command',
      '                               that starts the service when it is not running.',
      '                               Jobs and checks, a landing waiting on CI among them, run on and are not',
      '                               waited for; each session parks and resumes as the same try. Each wait is',
      "                               said on stderr as it waits. A pause a person put stands; the restart's",
      '                               own ends with the command: killed, the next pass of the daemon lifts it.',
      '                               Starts the service where nothing ticks; a daemon started by hand is',
      "                               named with --take-over's line",
      '  nemia service addresses [--json]',
      "                               this machine's addresses, loopback first, one a line: the address, its",
      '                               interface and its kind (loopback, private, shared, link-local,',
      '                               unique-local, public), so --bind takes a private one; --json prints',
      '                               {"addresses":[{"address","interface","family","kind"}]}',
      '  nemia doctor [--json]',
      '                               every piece this server needs before a run: each harness installed and',
      '                               signed in, the service and its linger, the bind, the machine, the git',
      "                               identity, each factory's workflows' and repository's needs, a factory, a",
      '                               newer release — each in place or missing, with the command or fix that',
      '                               puts it there. --json: the whole read',
      '  nemia doctor fix <need> [--factory <factory> [--workflow <workflow>]] [--index <n>] [--answer <name>=<value>]... [--detach]',
      "                               start a need's fix on this server, as nemia doctor lists it: a place's",
      "                               or a harness's need by its name, a workflow's with its --factory and",
      "                               --workflow, a repository's with its --factory alone; --index picks",
      '                               among its fixes, --answer gives each answer it asks. Follows what it',
      '                               prints to its end, a code it shows set apart; --detach starts it and',
      '                               returns',
      '  nemia doctor carry',
      "                               install, at this release's pins, each harness the store has activated",
      '                               or a release of it carries: what nemia upgrade runs of the new release',
      '                               before it switches',
      '  nemia readiness',
      '                               retired: nemia doctor reads what it read',
      '  nemia token add <name>',
      '                               mint a token of yours under a name, printed this once: the store keeps',
      '                               only its digest. A request presenting it, as Authorization: Bearer',
      '                               <token>, is you, on the api and on the MCP port (<api>/mcp, the',
      '                               header an MCP client sends). Refused of a name already used: nemia',
      '                               token rm frees it',
      '  nemia token ls',
      '                               your tokens, by name, with when each was minted: never a token itself',
      '  nemia token rm <name>',
      '                               remove your token named <name>: a request presenting it is refused',
      '                               from then on',
      '  nemia claude-token set',
      '                               keep your subscription token, the one claude setup-token prints, in the',
      "                               store's claude-token file, readable by you alone (0600): typed at the",
      '                               terminal without being shown, or piped in (nemia claude-token set <',
      '                               token.txt). The daemon loads it into CLAUDE_CODE_OAUTH_TOKEN where that',
      '                               is unset, at its next start: nemia service restart. Never printed',
      '  nemia claude-token status',
      '                               whether your subscription token is kept, its file and its mode, when it',
      '                               was set and the days left of its year, warned of a month before it ends:',
      '                               never the token',
      '  nemia claude-token rm',
      '                               remove your subscription token file; the daemon keeps the token it',
      '                               loaded until its next start',
      '  nemia upgrade [<tag>] [--repo <path>] [--name <name>] [--timeout <d>]',
      "                               on an archive install, download the tag's archive (the newest where",
      '                               none is named), check it against its SHA256SUMS and run its nemia',
      "                               version, into the store's releases/<tag>; on a release built from a",
      '                               repository, build the tag from a clean export into releases/<tag>:',
      '                               npm ci, npm run build and npm run release:check there, on a trial',
      '                               store; then point releases/current at it and restart the daemon onto',
      '                               it where the login service runs the pointer: jobs run on, and the',
      "                               daemon's sessions are given up to the timeout to end their tool calls",
      '                               (--timeout <d>, else nemia pause-timeout), park, and resume as the same try on',
      '                               the new release. A tag built already is switched to without a',
      '                               rebuild, so an older tag rolls back. --repo:',
      "                               the repository the tag is in (the running release's source);",
      '                               --name: the service (nemia). Then it removes each release that is',
      '                               not current, not among the two newest, and that no session or',
      '                               running nemia runs on, the folder of each build whose upgrade died,',
      '                               and each build log older than 30 days, as the daemon does every five',
      '                               minutes. A tag older than the oldest release that can read the store',
      '                               (store.json) is refused before anything is fetched or built',
      '  nemia version [--json]',
      "                               this nemia's release, an install's tag or a checkout, and its folder;",
      "                               the release the store's releases/current names; and the release the",
      '                               daemon runs, from its lease, and whether it promises to keep a running',
      '                               session on its files; and the sessions at work by release and harness',
      "                               version, off their records; and a newer release, where the daemon's",
      '                               release check read one. --json: the whole answer',
      '  nemia daemon [--json]',
      "                               the store's daemon, started where none ticks it (as any command that",
      '                               ticks starts it, unless NEMIA_DAEMON_START=off): its state, its pid and',
      '                               the url the api serves at, from its lease. --json: the whole answer',
      '  nemia frontmatter rewrite [<folder>...] [--check]',
      "                               rewrite as YAML each markdown file's frontmatter still in the former",
      "                               line form, under the folders given or the store's own. --check: write",
      '                               nothing, and exit 1 where a rewrite is due',
      '  nemia tick [--stats]',
      '                               one pass: tick the engine, file what became ready — refused while a',
      '                               daemon (the api, or a nemia up) ticks the store, since it runs the same',
      '                               pass (daemon.json);',
      '                               --stats says after it what the pass cost, phase by phase',
      '  nemia up [ms]',
      '                               the headless daemon, where no board is served: the same pass on a',
      '                               timer (4000 unless given; whole ms, 1 to 2147483647), holding the',
      "                               store. The api's process (npm start in apps/api) is the daemon where",
      '                               one is: one store takes one, and each is refused while the other',
      "                               ticks. It takes the store over once its holder's process is gone or",
      '                               it has been silent for 10 intervals, at least 15 minutes; it writes',
      '                               WF_ROOT/daemon.json — who holds it, pid, start, last pass, and a beat',
      '                               each interval;',
      '                               once a minute, a line of what its passes cost (tick-stats.json); the',
      "                               store's pause once it is put, again each time it says another thing",
      '                               (Pausing: N finishing, then Paused), and once it is resumed.',
      '                               nemia up --stats: what the last pass cost, phase by phase — read, not',
      '                               run, so it fits while a daemon holds the store; where none does,',
      '                               nemia tick --stats',
      '  nemia admit [--at-least <level>] [--auto <agent>]',
      "                               a call's admission: the call a session is about to make, on stdin, answered",
      '                               ask where it answers what waits on you;',
      '                               --at-least: deny a call acting on a run or a factory below the level;',
      "                               --auto: let through, for a run of a factory at auto, an answer the agent's",
      '                               rules you confirmed allow in the run as it stands (nemia policy <agent>)',
    ].join('\n'),
  );
});

/** A spec that takes a card's `name`, and a file the CLI alone reads. */
const CARD: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [{ flag: '--file', kind: 'text', key: 'file', only: { side: 'cli', why: 'the api is sent the words' } }],
  unknown: (arg) => `UNKNOWN ${arg}`,
};

type Table = Parameters<typeof commandBreaks>[0];

/** An entry's typed keys, which the api calls it by. */
const input = Schema.Struct({ name: Schema.String });
const API = { side: 'api', why: 'w' } as const;
const CLI_ALONE = { side: 'cli', why: 'w' } as const;
/** The one endpoint of `objects`' Api that serves an entry, its tool the entry's name. */
const LINK = [{ endpoint: 'runs.show' }] as const;
const SAID_NOTHING: Spec = { ...CARD, flags: [{ flag: '--file', kind: 'text', key: 'file', only: { side: 'cli', why: '' } }] };

/**
 * Each table `commandBreaks` reads, the CLI's verbs and runners beside it, and what it breaks: one list of fragments per break, in
 * order, each naming the entry and the fix; none for a table that keeps its rules.
 */
const BREAKS: ReadonlyArray<readonly [string, Table, readonly string[], readonly string[], ReadonlyArray<readonly string[]>]> = [
  ['an entry that ticks and writes', [{ name: 'x', input, handler, writes: true, ticks: true, served: LINK }], [], [], []],
  [
    'REFUSED: an entry that ticks and writes nothing, since nothing it does waits on a pass',
    [{ name: 'x', input, handler, writes: false, ticks: true, served: LINK }],
    [],
    [],
    [['x ticks and writes nothing', 'writes: true']],
  ],
  ['an entry served on both sides, typed, beside a verb of another name', [{ name: 'a', input, handler, served: LINK }], ['b'], [], []],
  ['an entry the CLI alone serves', [{ name: 'a', only: CLI_ALONE, handler }], [], [], []],
  ['an entry the api alone serves', [{ name: 'a', only: API, handler, served: LINK }], [], [], []],
  [
    'a name twice',
    [
      { name: 'a', input, handler, served: LINK },
      { name: 'a', only: CLI_ALONE, handler },
    ],
    [],
    [],
    [['a is defined twice']],
  ],
  [
    'REFUSED: an entry served on both sides with no input, which the api has no keys to call it by',
    [{ name: 'a', handler, served: LINK }],
    [],
    [],
    [['a has no input and no only', 'give it its input', 'which side alone serves it']],
  ],
  [
    'a command that is also a verb of the CLI',
    [{ name: 'a', input, handler, served: LINK }],
    ['a'],
    [],
    [['a is a command', 'out of VERBS']],
  ],
  [
    'an entry named by a former spelling, which the line it names would never reach',
    [{ name: 'agents remove', input, handler, served: LINK }],
    [],
    [],
    [['agents remove', 'RENAMED']],
  ],
  ['a verb of the CLI beside an entry the api alone serves', [{ name: 'decide', only: API, handler, served: LINK }], ['decide'], [], []],
  [
    'a verb of the CLI beside an entry the CLI serves',
    [{ name: 'decide', only: CLI_ALONE, handler }],
    ['decide'],
    [],
    [['decide is', 'take it out of VERBS']],
  ],
  ['an entry the CLI alone serves with a runner and no handler', [{ name: 'a', only: CLI_ALONE }], [], ['a'], []],
  [
    'an entry the api serves with no handler',
    [{ name: 'a', input, served: LINK }],
    [],
    ['a'],
    [['a has no handler and is served on the api', 'give it a handler']],
  ],
  [
    'an entry the CLI serves alone with no handler nor runner',
    [{ name: 'a', only: CLI_ALONE }],
    [],
    [],
    [['a has no handler and no runner', "the CLI's RUNS"]],
  ],
  [
    'a runner of the CLI that runs no entry the CLI serves',
    [{ name: 'a', only: API, handler, served: LINK }],
    [],
    ['a', 'b'],
    [
      ['a has a runner', 'its entry in the table', 'take it out of RUNS'],
      ['b has a runner', 'its entry in the table', 'take it out of RUNS'],
    ],
  ],
  ['a flag the CLI alone takes, saying why', [{ name: 'a', input, spec: CARD, handler, served: LINK }], [], [], []],
  [
    'a why left empty, of a side alone',
    [{ name: 'a', only: { side: 'cli', why: '' }, handler }],
    [],
    [],
    [['served on the cli alone and says no why']],
  ],
  [
    'a why left empty, of a flag the CLI alone takes',
    [{ name: 'a', input, spec: SAID_NOTHING, handler, served: LINK }],
    [],
    [],
    [["a's --file is taken on the cli alone", 'says no why']],
  ],
  [
    'REFUSED: an entry served on both sides that links no endpoint, which no tool of the port would call',
    [{ name: 'a', input, handler }],
    [],
    [],
    [['a links no endpoint', 'served', "only: { side: 'cli'"]],
  ],
  [
    'REFUSED: an entry the api alone serves that links no endpoint',
    [{ name: 'a', only: API, handler }],
    [],
    [],
    [['a links no endpoint', 'served']],
  ],
  [
    'an entry the CLI alone serves that links the endpoint the api serves it on',
    [{ name: 'a', only: CLI_ALONE, handler, served: LINK }],
    [],
    [],
    [],
  ],
  [
    'an entry with a second link that names its tool',
    [
      {
        name: 'a b',
        input,
        handler,
        served: [{ endpoint: 'runs.hold' }, { endpoint: 'runs.unhold', as: 'un_a_b' }],
      },
    ],
    [],
    [],
    [],
  ],
  [
    'REFUSED: a second link that names no tool, which would take the name of the first',
    [{ name: 'a', input, handler, served: [{ endpoint: 'runs.hold' }, { endpoint: 'runs.unhold' }] }],
    [],
    [],
    [["a's link to runs.unhold names no tool", 'as']],
  ],
  [
    'REFUSED: one tool name on two links, the first of one entry and the second of another',
    [
      { name: 'a b', input, handler, served: LINK },
      {
        name: 'c',
        input,
        handler,
        served: [{ endpoint: 'runs.hold' }, { endpoint: 'runs.unhold', as: 'a_b' }],
      },
    ],
    [],
    [],
    [['a_b is the tool of a b and of c', 'another as']],
  ],
  [
    'an entry of several links, each after the first naming its tool',
    [
      {
        name: 'a',
        input,
        handler,
        served: [{ endpoint: 'runs.hold' }, { endpoint: 'runs.unhold', as: 'un_a' }, { endpoint: 'runs.cancel', as: 'cancel_a' }],
      },
    ],
    [],
    [],
    [],
  ],
  [
    'REFUSED: a command the client holds (COMMAND_WORDS) that links no endpoint, which the MCP port would have no tool for',
    [{ name: 'workflows write', only: CLI_ALONE, handler }],
    [],
    [],
    [['workflows write', 'links no endpoint', 'served']],
  ],
  [
    'a stream the client holds (STREAM_COMMANDS), which links none: its form on the port is wait',
    [{ name: 'watch', only: CLI_ALONE, handler }],
    [],
    [],
    [],
  ],
];

test('a table breaks its rules, each break named with its fix, and a table that keeps them breaks none', async (t) => {
  for (const [row, table, verbs, runners, broken] of BREAKS)
    await t.test(row, () => {
      const breaks = commandBreaks(table, verbs, runners);
      assert.equal(breaks.length, broken.length, breaks.join('\n'));
      broken.forEach((fixes, i) => names(breaks[i], ...fixes));
    });
});

test("a tool of a CLI verb the api serves counts against the table's tools, and one of its own name breaks none", () => {
  const decide = { name: 'decide', served: [{ endpoint: 'runs.decision' }] } as const;
  names(
    commandBreaks(
      [
        {
          name: 'a',
          input,
          handler,
          served: [{ endpoint: 'runs.hold' }, { endpoint: 'runs.unhold', as: 'decide' }],
        },
      ],
      [],
      [],
      [decide],
    ).join('\n'),
    'decide is the tool of a and of decide',
    'another as',
  );
  assert.deepEqual(commandBreaks([{ name: 'a', input, handler, served: LINK }], [], [], [decide]), []);
});

test('REFUSED: a store verb the CLI still serves, whose words the client does not hold; a verb about this machine and one kept by name break nothing', () => {
  const stray = { name: 'held stray', input, handler, served: LINK };
  names(commandBreaks([stray], [], [], [], []).join('\n'), 'held stray', 'COMMAND_WORDS', 'apps/cli');
  assert.deepEqual(commandBreaks([stray], [], [], [], ['held stray']), []);
  assert.deepEqual(commandBreaks([{ ...stray, name: 'template stray' }], [], [], [], []), []);
});

/**
 * A command of the table, a command line, and what it refuses of it before anything is read: the fragments it names — the command,
 * the flag, the value and the fix — and those it must not; null where it takes the line.
 */
type Refused = readonly [row: string, command: string, argv: readonly string[], said: readonly string[] | null, not?: readonly string[]];

const REFUSALS: readonly Refused[] = [
  ['tick, a flag it does not take', 'tick', ['--bogus'], ['nemia tick takes no --bogus', 'nemia tick --stats']],
  ['tick, --stats', 'tick', ['--stats'], null],
  ...[
    ['--stats', '20'],
    ['20', '--stats'],
  ].map((argv): Refused => [
    `up, --stats with an interval: ${argv.join(' ')}`,
    'up',
    argv,
    ['nemia up --stats', 'takes no 20', 'nemia up --stats alone', 'nemia up 20 to tick'],
  ]),
  ...['soon', '--x'].map((given): Refused => [
    `up, an interval that is none: ${given}`,
    'up',
    [given],
    ['nemia up takes', 'whole milliseconds', `"${given}" is not one`, 'from 1 to '],
  ]),
  ['up, two intervals', 'up', ['10', '20'], ['one pass interval at most', 'given 20', 'nemia up [ms]']],
  ['up, an interval', 'up', ['10'], null],
];

test('REFUSED at shipped defaults: what each command refuses of its command line, before anything is read, Invalid with exit 2', async (t) => {
  for (const [row, command, argv, said, not = []] of REFUSALS)
    await t.test(row, () => {
      const words = refusedBy(entry(command), argv);
      if (said === null) return assert.equal(words, null);
      names(words, ...said);
      for (const word of not) assert.ok(!words!.includes(word), `${words} names ${word}`);
    });
});

test('a former word or flag is run as what it became, with a hint, and a line in the new words is left as given', async (t) => {
  const rows: Array<[string, readonly string[], readonly string[] | undefined]> = [
    ['a group renamed', ['auto', 'show', 'grace'], ['policy', 'show', 'grace']],
    [
      'round, absorbed by retry with --round',
      ['round', 'r1', 'review', '--budget', '5'],
      ['retry', 'r1', 'review', '--round', '--budget', '5'],
    ],
    ['merge, absorbed by refresh with --base', ['merge', 'r1'], ['refresh', 'r1', '--base']],
    ['accept, absorbed by approve', ['accept', 'r1', 'review', '--message', 'x'], ['approve', 'r1', 'review', '--message', 'x']],
    ["retry's --nudge, now --continue", ['retry', 'r1', 'implement', '--nudge'], ['retry', 'r1', 'implement', '--continue']],
    [
      "a message that says a flag's name stays the message",
      ['accept', 'r1', '--message', '--round'],
      ['approve', 'r1', '--message', '--round'],
    ],
    ['a former name of two words', ['agents', 'remove', 'x'], ['agents', 'rm', 'x']],
    ['a renamed group and its renamed verb, put to the name it became at last', ['auto', 'drop', 'r1', '3'], ['policy', 'rm', 'r1', '3']],
    ['plan, now start with its folder', ['plan', './f', '--repo', '.'], ['start', './f', '--repo', '.']],
    ['a line in the new words', ['retry', 'r1', '--round'], undefined],
    ['a two-word line in the new words', ['agents', 'rm', 'x'], undefined],
    ['--nudge on another command is not renamed', ['say', 'r1', 's', '--nudge'], undefined],
  ];
  for (const [name, typed, now] of rows)
    await t.test(name, () => {
      const renamed = renamedIn(typed);
      assert.deepEqual(renamed.words, now ?? typed);
      assert.equal(renamed.hint !== undefined, now !== undefined, 'a hint is said exactly when a former spelling was typed');
      if (now !== undefined) assert.ok(renamed.hint!.includes(['nemia', ...now].join(' ')), 'the hint names the line to type now');
    });
  await t.test('the hint of a line renamed twice names what was typed', () => {
    assert.ok(renamedIn(['auto', 'drop', 'r1', '3']).hint!.includes('nemia auto drop'));
  });
});

test("a body's former value is read as what it became, with a hint naming what to send now, and a body in the new words is left as given", async (t) => {
  const rows: Array<[string, string, unknown, unknown]> = [
    ["retry's mode nudge, now continue", 'retry', { mode: 'nudge', message: 'go' }, { mode: 'continue', message: 'go' }],
    ['a mode in the new words', 'retry', { mode: 'continue' }, undefined],
    ['a mode nudge on another command is not renamed', 'say', { mode: 'nudge' }, undefined],
    ['a body that is no object is left for its schema', 'retry', ['nudge'], undefined],
  ];
  for (const [name, command, body, now] of rows)
    await t.test(name, () => {
      const renamed = renamedValues(command, body);
      assert.deepEqual(renamed.body, now ?? body);
      assert.equal(renamed.hint !== undefined, now !== undefined, 'a hint is said exactly when a former value was sent');
      if (now !== undefined) assert.ok(renamed.hint!.includes('"mode": "continue"'), 'the hint names the value to send now');
    });
});

test("a link's tool carries the query values its link sends where a call gives none, and none where the link names none", () => {
  assert.deepEqual(
    toolsOf({
      name: 'inbox',
      served: [
        { endpoint: 'cards.listAll', query: { fieldSelector: 'status.inPlay=true' } },
        { endpoint: 'cards.getAll', as: 'inbox_card' },
      ],
    }).map((t) => [t.tool, t.query]),
    [
      ['inbox', { fieldSelector: 'status.inPlay=true' }],
      ['inbox_card', {}],
    ],
  );
});

test("a budget's dollars read as the command line's parser reads an amount: keys' dollarsOf and objects' agree", () => {
  for (const written of ['5', '2.50', ' 3 ', '0', '0.0', '-1', '1e3', '$5', '5 USD', '', '.5', '5.', '007'])
    assert.equal(dollarsOf(written), dollarsOfObjects(written), written);
});
