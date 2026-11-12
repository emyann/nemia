/**
 * The command-line parser of `src/command.ts` on hand-written specs: a command line read into its arguments, refused as a
 * `CommandRefused` in the spec's own words, the line a refusal shows and the help a table prints. Each assertion names, as its message,
 * the line of `parseArgv` (or of the function it calls) it guards (`LINES`). The words of the commands the client holds
 * (`COMMAND_WORDS`) are held here too: each name once, and each endpoint they link one the `Api` declares.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Api, COMMAND_WORDS, CommandRefused, commandLine, helpOf, parseArgv, type Spec } from 'objects';

/** The line of the parser each assertion guards, said as its message. */
const LINES = {
  read: 'parseArgv: return readWords(spec, words, required.length, given, argv)',
  defaults: 'readWords: return { ...spec.defaults, ...args }',
  help: "parseArgv: if (words.some((w) => w.is === 'help')) return undefined",
  short: 'parseArgv: if (short || required.some(...)) return spec.missing === undefined ? undefined : usage(spec.missing)',
  stray: 'parseArgv: if (stray !== undefined) return usage(short && spec.missing !== undefined && !spec.flagFirst ? ... )',
  placed: 'readWords: if (!placed(spec, word.arg, word.operand, args)) usage(spec.unknown(word.arg))',
  joined: "flagOf: !(joined && (f.kind === 'switch' || f.kind === 'name'))",
  takes: "valueOf: if (value === undefined || (flag.kind === 'name' && ...)) return usage(flag.takes ?? '')",
  amount: "valueOf: if (flag.kind === 'amount') return amountOf(...)",
  twice: 'readFlag: if (once(flag) && ...) usage(flag.twice ?? spec.unknown(word.arg))',
  oneWay: 'readWords: if (ways > 1) usage(spec.oneWay ?? spec.unknown(argv.join(" ")))',
  apart: 'valueOf: if (!joined && spec.apart && ...) usage(spec.apart(value, flag.flag))',
  many: 'put: args[key] = flag.many ? [...before, String(value)] : value',
  switch: 'readFlag: if (flag.key !== undefined) args[flag.key] = true',
  unfilled: 'unfilledBy: (!word.arg && (spec.missing === undefined || p.kind !== "text"))',
  operand: "wordsOf: if (arg === '--') return [...words, ...operands]",
  rest: 'parseArgv: if (rest) return parseRest(spec, rest, argv)',
} as const;

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

const HOLDING: Spec = {
  positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
  flags: [
    { flag: '--until', kind: 'text', key: 'until', takes: 'UNTIL TAKES', many: true },
    { flag: '--off', kind: 'switch', key: 'off' },
  ],
  unknown: (arg) => `UNKNOWN ${arg}`,
  missing: 'MISSING',
};

/** A spec that takes a card's `name`, and a file the CLI alone reads. */
const CARD: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [{ flag: '--file', kind: 'text', key: 'file', only: { side: 'cli', why: 'the api is sent the words' } }],
  unknown: (arg) => `UNKNOWN ${arg}`,
};

/** The words `parseArgv` refuses `argv` in, a `CommandRefused`, or none. */
function refusalOf(argv: readonly string[], spec: Spec = SPEC): string | undefined {
  try {
    parseArgv(spec, argv);
    return undefined;
  } catch (err) {
    assert.ok(err instanceof CommandRefused, `${String(err)} is a CommandRefused`);
    return err.message;
  }
}

/** That `words` are a refusal, and name each of `fixes`: the flag, the value or the form its fix turns on. */
function names(words: string | undefined, line: string, ...fixes: string[]): void {
  assert.ok(words, line);
  for (const fix of fixes) assert.ok(words.includes(fix), `${line}: ${words} names ${fix}`);
}

test('a command line is read into its arguments, the defaults under what it gives', () => {
  assert.deepEqual(parseArgv(SPEC, ['r-1']), { mode: 'fast', runId: 'r-1' }, LINES.defaults);
  assert.deepEqual(
    parseArgv(SPEC, ['r-1', 'impl', '--slow', '--note', 'hi', '--budget', '2.50', '--who', 'shipper']),
    { mode: 'slow', runId: 'r-1', step: 'impl', note: 'hi', budget: 2.5, who: 'shipper' },
    LINES.read,
  );
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--note=--slow']), { mode: 'fast', runId: 'r-1', note: '--slow' }, LINES.read);
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--note', '']), { mode: 'fast', runId: 'r-1', note: '' }, LINES.read);
});

test('a command line given too little is no refusal: the CLI prints its help', () => {
  assert.equal(parseArgv(SPEC, []), undefined, LINES.short);
  assert.equal(parseArgv(SPEC, ['']), undefined, LINES.short);
  assert.equal(parseArgv(SPEC, ['--fast']), undefined, LINES.short);
});

test('a flag the command has none of, given where a required argument stands, is refused in its words; --help and its own print the help', () => {
  assert.equal(refusalOf(['--nope']), 'UNKNOWN --nope', LINES.stray);
  assert.equal(refusalOf(['--nope=r-1']), 'UNKNOWN --nope=r-1', LINES.stray);
  assert.equal(parseArgv(SPEC, ['--help']), undefined, LINES.help);
  assert.equal(parseArgv(SPEC, ['--note=hi']), undefined, LINES.short);
  assert.equal(refusalOf(['--nope'], { ...SPEC, missing: 'MISSING' }), 'MISSING', LINES.stray);
  assert.equal(refusalOf(['-n'], { ...SPEC, missing: 'MISSING' }), 'MISSING', LINES.short);
});

test('an argument the command does not take is refused in its words', () => {
  assert.equal(refusalOf(['r-1', '--loud']), 'UNKNOWN --loud', LINES.stray);
  assert.equal(refusalOf(['r-1', 'impl', 'extra']), 'UNKNOWN extra', LINES.placed);
  assert.equal(refusalOf(['r-1', '--fast=yes']), 'UNKNOWN --fast=yes', LINES.joined);
  assert.equal(refusalOf(['r-1', '--who=shipper']), 'UNKNOWN --who=shipper', LINES.joined);
});

test('a value flag with no value is refused, saying what it takes', () => {
  assert.equal(refusalOf(['r-1', '--note']), 'NOTE TAKES', LINES.takes);
  assert.equal(refusalOf(['r-1', '--who']), 'WHO TAKES', LINES.takes);
  assert.equal(refusalOf(['r-1', '--who', '--fast']), 'WHO TAKES', LINES.takes);
  names(refusalOf(['r-1', '--budget', '0']), LINES.amount, '--budget takes the cap', '0 is not one', 'x <runId> --budget <amount>');
});

test('a value flag given twice is refused, in its own words or as an argument not taken', () => {
  assert.equal(refusalOf(['r-1', '--note', 'a', '--note', 'b']), 'NOTE TWICE', LINES.twice);
  assert.equal(refusalOf(['r-1', '--who', 'a', '--who', 'b']), 'UNKNOWN --who', LINES.twice);
});

test('two ways are refused, and one way given twice counts as two', () => {
  assert.equal(refusalOf(['r-1', '--fast', '--slow']), 'ONE WAY', LINES.oneWay);
  assert.equal(refusalOf(['r-1', '--slow', '--slow']), 'ONE WAY', LINES.oneWay);
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--slow']), { mode: 'slow', runId: 'r-1' }, LINES.oneWay);
  const { oneWay: _, ...said } = SPEC;
  assert.equal(refusalOf(['r-1', '--fast', '--slow'], said), 'UNKNOWN r-1 --fast --slow', LINES.oneWay);
});

test("a text flag's value given apart that is one of the command's flags is refused; joined, it is the value", () => {
  assert.equal(refusalOf(['r-1', '--note', '--slow']), 'APART --slow', LINES.apart);
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--note=--slow']), { mode: 'fast', runId: 'r-1', note: '--slow' }, LINES.apart);
});

test('a flag given once for each value collects them in order, never refused as given twice', () => {
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--until', 'a', '--until=b']), { runId: 'r-1', until: ['a', 'b'] }, LINES.many);
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--until', 'a']), { runId: 'r-1', until: ['a'] }, LINES.many);
  assert.equal(refusalOf(['r-1', '--until'], HOLDING), 'UNTIL TAKES', LINES.takes);
});

test('a switch with a key sets it to true, given once or more', () => {
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--off']), { runId: 'r-1', off: true }, LINES.switch);
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--off', '--off']), { runId: 'r-1', off: true }, LINES.switch);
  assert.equal(refusalOf(['r-1', '--off=yes'], HOLDING), 'UNKNOWN --off=yes', LINES.joined);
});

test('a spec that says its refusal of a required argument left out says it where the CLI would print its help', () => {
  assert.equal(refusalOf([], HOLDING), 'MISSING', LINES.short);
  assert.equal(refusalOf([''], HOLDING), 'MISSING', LINES.short);
  assert.equal(refusalOf(['--off'], HOLDING), 'MISSING', LINES.short);
  assert.equal(refusalOf(['-x'], HOLDING), 'MISSING', LINES.short);
  assert.equal(parseArgv(SPEC, ['-x'])?.runId, '-x', LINES.short);
});

test('an empty text where a spec says its refusal is given to the handler, which refuses it in its own words; an empty name is not', () => {
  const idea: Spec = { ...HOLDING, positionals: [{ key: 'idea', takes: 'required', kind: 'text' }] };
  assert.deepEqual(parseArgv(idea, ['']), { idea: '' }, LINES.unfilled);
  assert.equal(refusalOf(['-x'], idea), 'MISSING', LINES.unfilled);
  assert.equal(refusalOf([''], HOLDING), 'MISSING', LINES.unfilled);
  assert.equal(parseArgv({ ...idea, missing: undefined }, ['']), undefined, LINES.unfilled);
});

test('a flag is read wherever it stands among the positionals: a switch, a valued flag and a repeated flag, before them as after', async (t) => {
  const rows: readonly (readonly [row: string, spec: Spec, after: readonly string[], before: readonly string[]])[] = [
    ['a switch', HOLDING, ['r-1', '--off'], ['--off', 'r-1']],
    ['a valued flag', SPEC, ['r-1', 'impl', '--who', 'bo'], ['--who', 'bo', 'r-1', 'impl']],
    ['a valued flag between the positionals', SPEC, ['r-1', 'impl', '--note=hi'], ['r-1', '--note=hi', 'impl']],
    ['a repeated flag', HOLDING, ['r-1', '--until', 'a', '--until', 'b'], ['--until', 'a', 'r-1', '--until', 'b']],
  ];
  for (const [row, spec, after, before] of rows)
    await t.test(row, () => {
      const read = parseArgv(spec, after);
      assert.ok(read, `${after.join(' ')} is read`);
      assert.deepEqual(parseArgv(spec, before), read, LINES.read);
    });
});

test('-- ends the flags: each word after it is a positional, whatever it starts with', () => {
  assert.deepEqual(parseArgv(SPEC, ['--who', 'bo', '--', '--slow']), { mode: 'fast', runId: '--slow', who: 'bo' }, LINES.operand);
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--', '--slow']), { mode: 'fast', runId: 'r-1', step: '--slow' }, LINES.operand);
  assert.deepEqual(parseArgv(HOLDING, ['--', '-x']), { runId: '-x' }, `${LINES.unfilled}: an operand is no argument left out`);
  assert.equal(refusalOf(['r-1', 'impl', '--', 'extra']), 'UNKNOWN extra', LINES.placed);
});

test('a flag the command has none of, or a positional past those it takes, is refused before its arguments as after them', () => {
  assert.equal(refusalOf(['--loud', 'r-1']), 'UNKNOWN --loud', LINES.stray);
  assert.equal(refusalOf(['--fast=yes', 'r-1']), 'UNKNOWN --fast=yes', LINES.stray);
  assert.equal(refusalOf(['--nope', 'r-1'], HOLDING), 'UNKNOWN --nope', `${LINES.stray}: its run given, the flag is what it does not take`);
  assert.equal(refusalOf(['--who', 'bo', 'r-1', 'impl', 'extra']), 'UNKNOWN extra', LINES.placed);
});

test('a command line refuses a flag its spec does not have, as one the command does not take, and reads one the CLI alone takes', () => {
  assert.equal(refusalOf(['x', '--words', 'hi'], CARD), 'UNKNOWN --words', LINES.stray);
  assert.equal(refusalOf(['x', '--words=hi'], CARD), 'UNKNOWN --words=hi', LINES.stray);
  assert.deepEqual(parseArgv(CARD, ['x', '--file', 'f.md']), { name: 'x', file: 'f.md' }, LINES.read);
});

test("a rest takes the command's own flags given between its required arguments and its words, and every word after them as said", () => {
  const spec: Spec = {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'text', takes: 'rest', kind: 'text' },
    ],
    flags: [{ flag: '--as', kind: 'name', key: 'as' }],
    unknown: (arg) => `no ${arg}`,
  };
  assert.deepEqual(parseArgv(spec, ['r-1', '--as', 'operator', 'cut', 'it']), { runId: 'r-1', as: 'operator', text: 'cut it' }, LINES.rest);
  assert.deepEqual(parseArgv(spec, ['r-1', 'cut', '--as', 'operator']), { runId: 'r-1', text: 'cut --as operator' }, LINES.rest);
  assert.deepEqual(parseArgv(spec, ['r-1', '--other', 'x']), { runId: 'r-1', text: '--other x' }, LINES.rest);
  assert.equal(parseArgv(spec, ['r-1'])?.text, '', LINES.rest);
});

test('the command line a refusal shows names what was given and the usage of what was not', () => {
  assert.equal(commandLine({ name: 'x', spec: SPEC }, { runId: 'r-1' }), 'nemia x r-1 [<step>]');
  assert.equal(commandLine({ name: 'x', spec: SPEC }, {}), 'nemia x <runId> [<step>]');
});

test('a command line says the flags it is given after its positionals, in the order its spec lists them', () => {
  const two: Spec = {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--repo', kind: 'text', key: 'repos', many: true },
      { flag: '--fresh', kind: 'switch', key: 'fresh' },
      { flag: '--model', kind: 'name', key: 'model' },
    ],
    unknown: (arg) => arg,
  };
  const x = { name: 'x', spec: two };
  assert.equal(
    commandLine(x, { runId: 'r-1' }, { model: 'm', repos: ['a', 'b'], fresh: true }),
    'nemia x r-1 --repo a --repo b --fresh --model m',
  );
  assert.equal(commandLine(x, {}, { repos: '<path>' }), 'nemia x <runId> --repo <path>');
  assert.equal(commandLine(x, { runId: 'r-1' }, { fresh: false, other: 'y' }), 'nemia x r-1');
});

test('the help prints no command the CLI does not serve', () => {
  const entry = (name: string, only?: { side: 'cli' | 'api'; why: string }) => ({
    name,
    usage: '<runId>',
    help: ['h'],
    ...(only ? { only } : {}),
  });
  assert.equal(
    helpOf([entry('a'), entry('b', { side: 'api', why: 'w' }), entry('c', { side: 'cli', why: 'w' })]),
    ['  nemia a <runId>', `${' '.repeat(31)}h`, '  nemia c <runId>', `${' '.repeat(31)}h`].join('\n'),
  );
});

test('each command the client holds is named once', () => {
  const named = COMMAND_WORDS.map((c) => c.name);
  assert.ok(named.length > 0, 'the client holds a command');
  assert.deepEqual([...new Set(named)], named);
});

/**
 * The one command the client holds that links no endpoint: `nemia watch` follows the feed's stream, which no tool of the port can call,
 * so it has none to link.
 */
const LINKS_NONE: readonly string[] = ['watch'];

test('each endpoint a command the client holds links is one the Api declares, and every command but a stream links one', () => {
  const declared = new Set(
    Object.values(Api.groups).flatMap((group) =>
      Object.values(group.endpoints).map((endpoint) => `${group.identifier}.${endpoint.identifier}`),
    ),
  );
  assert.ok(declared.has('workflows.create'), 'the Api is read by `<group>.<endpoint>`');
  for (const command of COMMAND_WORDS) {
    if (LINKS_NONE.includes(command.name)) {
      assert.equal(command.served, undefined, `${command.name} follows a stream, and links no endpoint`);
      continue;
    }
    assert.ok(command.served, `${command.name} links an endpoint`);
    for (const link of command.served)
      assert.ok(declared.has(link.endpoint), `${command.name} links ${link.endpoint}, which the Api declares`);
  }
});
