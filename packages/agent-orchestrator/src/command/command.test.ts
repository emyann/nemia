/**
 * The command table's parser, help and rules: a command line read against a spec and refused in its own words, the line a refusal
 * shows, the help the table prints, and where a table breaks its rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandBreaks, commandLine, helpOf, parseArgv, type Spec } from './command.ts';
import { COMMANDS } from './commands.verb.ts';

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
    assert.equal((err as { exitCode?: number }).exitCode, 2);
    return (err as Error).message;
  }
}

/** A handler, as `commandBreaks` asks only whether an entry has one. */
const handler = (): undefined => undefined;

const RETRY = COMMANDS.find((c) => c.name === 'retry')!;
const SAY = COMMANDS.find((c) => c.name === 'say')!;

test('a command line is read into its arguments, the defaults under what it gives', () => {
  assert.deepEqual(parseArgv(SPEC, ['r-1']), { mode: 'fast', runId: 'r-1' });
  assert.deepEqual(parseArgv(SPEC, ['r-1', 'impl', '--slow', '--note', 'hi', '--budget', '2.50', '--who', 'ada']), {
    mode: 'slow',
    runId: 'r-1',
    step: 'impl',
    note: 'hi',
    budget: 2.5,
    who: 'ada',
  });
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--note=--slow']), { mode: 'fast', runId: 'r-1', note: '--slow' });
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--note', '']), { mode: 'fast', runId: 'r-1', note: '' });
});

test('a command line given too little is no refusal: the CLI prints its help', () => {
  assert.equal(parseArgv(SPEC, []), undefined);
  assert.equal(parseArgv(SPEC, ['']), undefined);
  assert.equal(parseArgv(SPEC, ['--fast']), undefined);
});

test('an argument the command does not take is refused in its words', () => {
  assert.equal(refusalOf(['r-1', '--loud']), 'UNKNOWN --loud');
  assert.equal(refusalOf(['r-1', 'impl', 'extra']), 'UNKNOWN extra');
  assert.equal(refusalOf(['r-1', '--fast=yes']), 'UNKNOWN --fast=yes');
  assert.equal(refusalOf(['r-1', '--who=ada']), 'UNKNOWN --who=ada');
});

test('a value flag with no value is refused, saying what it takes', () => {
  assert.equal(refusalOf(['r-1', '--note']), 'NOTE TAKES');
  assert.equal(refusalOf(['r-1', '--who']), 'WHO TAKES');
  assert.equal(refusalOf(['r-1', '--who', '--fast']), 'WHO TAKES');
  assert.equal(
    refusalOf(['r-1', '--budget', '0']),
    '--budget takes the cap — an amount above zero, in digits, like 5 or 2.50, and 0 is not one: x <runId> --budget <amount>',
  );
});

test('a value flag given twice is refused, in its own words or as an argument not taken', () => {
  assert.equal(refusalOf(['r-1', '--note', 'a', '--note', 'b']), 'NOTE TWICE');
  assert.equal(refusalOf(['r-1', '--who', 'a', '--who', 'b']), 'UNKNOWN --who');
});

test('two ways are refused, and one way given twice counts as two', () => {
  assert.equal(refusalOf(['r-1', '--fast', '--slow']), 'ONE WAY');
  assert.equal(refusalOf(['r-1', '--slow', '--slow']), 'ONE WAY');
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--slow']), { mode: 'slow', runId: 'r-1' });
});

test("a text flag's value given apart that is one of the command's flags is refused; joined, it is the value", () => {
  assert.equal(refusalOf(['r-1', '--note', '--slow']), 'APART --slow');
  assert.deepEqual(parseArgv(SPEC, ['r-1', '--note=--slow']), { mode: 'fast', runId: 'r-1', note: '--slow' });
});

const HOLDING: Spec = {
  positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
  flags: [
    { flag: '--until', kind: 'text', key: 'until', takes: 'UNTIL TAKES', many: true },
    { flag: '--off', kind: 'switch', key: 'off' },
  ],
  unknown: (arg) => `UNKNOWN ${arg}`,
  missing: 'MISSING',
};

test('a flag given once for each value collects them in order, never refused as given twice', () => {
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--until', 'a', '--until=b']), { runId: 'r-1', until: ['a', 'b'] });
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--until', 'a']), { runId: 'r-1', until: ['a'] });
  assert.equal(refusalOf(['r-1', '--until'], HOLDING), 'UNTIL TAKES');
});

test('a switch with a key sets it to true, given once or more', () => {
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--off']), { runId: 'r-1', off: true });
  assert.deepEqual(parseArgv(HOLDING, ['r-1', '--off', '--off']), { runId: 'r-1', off: true });
  assert.equal(refusalOf(['r-1', '--off=yes'], HOLDING), 'UNKNOWN --off=yes');
});

test('a spec that says its refusal of a required argument left out says it where the CLI would print its help', () => {
  assert.equal(refusalOf([], HOLDING), 'MISSING');
  assert.equal(refusalOf([''], HOLDING), 'MISSING');
  assert.equal(refusalOf(['--off'], HOLDING), 'MISSING');
  assert.equal(refusalOf(['-x'], HOLDING), 'MISSING');
  assert.equal(parseArgv(SPEC, ['-x'])?.runId, '-x');
});

test("retry's command line keeps today's refusals", () => {
  assert.equal(
    refusalOf(['r-1', 'impl', '--fresh', '--recheck'], RETRY.spec),
    'wf retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.',
  );
  assert.equal(
    refusalOf(['r-1', 'impl', '--message', '--fresh'], RETRY.spec),
    "--message takes what to tell the step, and --fresh is one of wf retry's own flags, so the answer was left out: " +
      'wf retry <runId> <step> --message "<answer>". If --fresh is the whole answer, give it as --message=--fresh.',
  );
  assert.deepEqual(parseArgv(RETRY.spec, ['r-1', 'impl', '--message=--fresh']), {
    mode: 'nudge',
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

test('the command line a refusal shows names what was given and the usage of what was not', () => {
  assert.equal(commandLine(RETRY, { runId: 'r-1', step: 'impl' }), 'wf retry r-1 impl');
  assert.equal(commandLine({ name: 'x', spec: SPEC }, { runId: 'r-1' }), 'wf x r-1 [<step>]');
  assert.equal(commandLine({ name: 'x', spec: SPEC }, {}), 'wf x <runId> [<step>]');
  assert.equal(commandLine(SAY, { runId: 'r-1', step: 'impl', text: 'hi' }), 'wf say r-1 impl');
});

test("the table's help is today's, word for word", () => {
  assert.equal(
    helpOf(COMMANDS),
    [
      '  wf retry <runId> <step> [--nudge | --fresh | --model <m> | --recheck] [--message "<answer>"] [--budget <amount>]',
      '                               try a step waiting on you again, once, on the next tick:',
      '                               --nudge (default) continues its session, told what happened;',
      '                               --fresh a new session on its branch; --model <m> the same, on m;',
      '                               --recheck runs its check again, and files no session;',
      '                               --message "<answer>" goes into the try\'s brief, as ## Your answer:',
      '                               for a step that signed off blocked, the answer to its needs — or',
      '                               what you have to say to any step you try again; not with --recheck.',
      '                               The next argument is the answer, whatever it starts with; an answer',
      "                               that is only one of these flags' names goes as --message=<answer>;",
      '                               --budget <amount>: for a step over budget or budget exhausted, its',
      '                               cap raised to that many dollars, above what its tries have cost',
      '  wf approve <runId> <step> [--message "<words>"]',
      '                               let a step waiting at its gate hand on: what waits on it is filed on',
      '                               the next tick, and every step after the gate is handed your words',
      '                               under ## Approved. To send it back instead, with what to change:',
      '                               wf retry <runId> <step> --message "<objection>"',
      '  wf round <runId> [<step>] [--budget <amount>]',
      '                               once more: a loop out of rounds goes round again, once, on the',
      '                               next tick — the step it loops to continued, then a new reviewer;',
      '                               --budget raises the cap of a step of the loop over its budget',
      '  wf accept <runId> [<step>] --message "<why>"',
      '                               enough: a loop out of rounds ends on your word, with its findings',
      '                               open. What waits on the looping step is filed on the next tick as',
      '                               if it had said again: false — a gated ending goes to its gate —',
      '                               and every step after the loop is handed your words and those',
      '                               findings under ## Accepted. The other answer to wf round',
      '  wf say <runId> <step> "<words>"',
      "                               tell a step's running session something, through its harness: the",
      "                               engine journals the words on the step's task, wf ls notes the step",
      '                               said to, and wf decide prints them under it. A try that continues',
      '                               the session is handed them again, as ## Said to your session',
      '  wf ls [<runId>]',
      '                               runs and their steps — a run waiting on another says waiting on <run>,',
      '                               one the cap on runs in flight holds waiting for a run slot (2 of 2 in',
      "                               flight); what each step's tries and the run have cost, where measured;",
      '                               last, whether a wf up ticks the store and when its last pass was',
      '  wf agents [--repo .]',
      "                               the agents a step may name, the repository's then yours: what each is",
      '                               for, what it says it can do (an entry for each skill, read off its',
      '                               SKILL.md), and the skills it is given (its skills:)',
      '  wf agents card <name> [--repo .] [--from repo|yours]',
      '                               that agent in the shape of an A2A Agent Card, JSON on stdout and',
      '                               nothing else — every field the protocol marks REQUIRED but',
      '                               supportedInterfaces, which is left out because nothing here serves an',
      '                               agent over A2A. The card describes; it is not an address',
    ].join('\n'),
  );
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
    ['  wf a <runId>', `${' '.repeat(31)}h`, '  wf c <runId>', `${' '.repeat(31)}h`].join('\n'),
  );
});

test('a table breaks its rules: a name twice, an entry served nowhere, a command that is also a verb of the CLI', () => {
  const route = { method: 'POST', path: '/api/x', status: 202 } as const;
  assert.deepEqual(commandBreaks([{ name: 'a', route, handler }], ['b']), []);
  assert.deepEqual(commandBreaks([{ name: 'a', only: { side: 'cli', why: 'w' }, handler }], []), []);
  assert.deepEqual(
    commandBreaks(
      [
        { name: 'a', route, handler },
        { name: 'a', route: { ...route, path: '/api/y' }, handler },
      ],
      [],
    ),
    ['a is defined twice: a command is one entry of the table'],
  );
  assert.deepEqual(commandBreaks([{ name: 'a', handler }], []), [
    'a has no route and no only: give it its route on the api, or say which side alone serves it, and why',
  ]);
  assert.deepEqual(commandBreaks([{ name: 'a', route, handler }], ['a']), [
    'a is a command of the table and a verb of the CLI: take it out of VERBS',
  ]);
});

test('a table breaks its rules: two entries routed on one method and path, of which the api serves the first alone', () => {
  const route = { method: 'GET', path: '/api/x', status: 200 } as const;
  const only = { side: 'api', why: 'w' } as const;
  assert.deepEqual(
    commandBreaks(
      [
        { name: 'a', route, handler },
        { name: 'b', route: { method: 'POST', path: '/api/x', status: 202 }, handler },
      ],
      [],
    ),
    [],
    'one path, another method',
  );
  assert.deepEqual(
    commandBreaks(
      [
        { name: 'a', route, only, handler },
        { name: 'b', route, only, handler },
      ],
      [],
    ),
    ['b is routed on GET /api/x, as a is: give it a path of its own'],
  );
});

test('a table breaks its rules: a verb of the CLI is refused only against an entry the CLI serves', () => {
  const route = { method: 'GET', path: '/api/x', status: 200 } as const;
  assert.deepEqual(commandBreaks([{ name: 'decide', route, only: { side: 'api', why: 'w' }, handler }], ['decide']), []);
  assert.deepEqual(commandBreaks([{ name: 'decide', route, only: { side: 'cli', why: 'w' }, handler }], ['decide']), [
    'decide is a command of the table and a verb of the CLI: take it out of VERBS',
  ]);
});

test('a table breaks its rules: an entry the api serves with no handler, and one the CLI serves alone with no handler nor runner', () => {
  const route = { method: 'POST', path: '/api/x', status: 202 } as const;
  const only = { side: 'cli', why: 'w' } as const;
  assert.deepEqual(commandBreaks([{ name: 'a', only }], [], ['a']), []);
  assert.deepEqual(commandBreaks([{ name: 'a', route }], [], ['a']), [
    'a has no handler and is served on the api: give it a handler, or serve it on the CLI alone and run it there',
  ]);
  assert.deepEqual(commandBreaks([{ name: 'a', only }], []), [
    "a has no handler and no runner: give it a handler, or a runner in the CLI's RUNS",
  ]);
});

test('a table breaks its rules: a runner of the CLI that runs no entry the CLI serves', () => {
  const route = { method: 'GET', path: '/api/x', status: 200 } as const;
  assert.deepEqual(commandBreaks([{ name: 'a', route, only: { side: 'api', why: 'w' }, handler }], [], ['a', 'b']), [
    'a has a runner and no entry the CLI serves: give it its entry in the table, or take it out of RUNS',
    'b has a runner and no entry the CLI serves: give it its entry in the table, or take it out of RUNS',
  ]);
});

test('a table breaks its rules: a key a route sets that no flag of its spec fills', () => {
  const route = { method: 'DELETE', path: '/api/x', status: 200, sets: { off: true, mode: 'fast' } } as const;
  assert.deepEqual(commandBreaks([{ name: 'a', route, spec: { ...HOLDING, flags: [...HOLDING.flags, ...SPEC.flags] }, handler }], []), []);
  assert.deepEqual(commandBreaks([{ name: 'a', route, spec: SPEC, handler }], []), [
    "a's route sets off, which no flag of its spec fills: name a key the command reads",
  ]);
  assert.deepEqual(commandBreaks([{ name: 'a', route, spec: HOLDING, handler }], []), [
    "a's route sets mode, which no flag of its spec fills: name a key the command reads",
  ]);
});
