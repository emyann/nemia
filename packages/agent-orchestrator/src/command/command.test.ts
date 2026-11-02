/**
 * The command table's parser, help and rules: a command line read against a spec and refused in its own words, the line a refusal
 * shows, the help the table prints, where a table breaks its rules (one table, `BREAKS`), and what each command of the CLI refuses
 * of its command line before anything is read (one table, `REFUSALS`), matched by the command, flag and fix each names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandBreaks, commandLine, helpOf, leftOut, parseArgv, renamedIn, renamedValues, type Spec } from './command.ts';
import { COMMANDS, TABLE } from './commands.verb.ts';

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

const RETRY = COMMANDS.find((c) => c.name === 'retry')!;
const SAY = COMMANDS.find((c) => c.name === 'say')!;
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

test('a flag the command has none of, given where a required argument stands, is refused in its words; --help and its own print the help', () => {
  assert.equal(refusalOf(['--nope']), 'UNKNOWN --nope');
  assert.equal(refusalOf(['--nope=r-1']), 'UNKNOWN --nope=r-1');
  assert.equal(parseArgv(SPEC, ['--help']), undefined);
  assert.equal(parseArgv(SPEC, ['--note=hi']), undefined);
  assert.equal(refusalOf(['--nope'], { ...SPEC, missing: 'MISSING' }), 'MISSING', 'a spec says its own refusal of a missing argument');
  assert.equal(refusalOf(['-n'], { ...SPEC, missing: 'MISSING' }), 'MISSING');
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
  names(refusalOf(['r-1', '--budget', '0']), '--budget takes the cap', 'above zero', '0 is not one', 'x <runId> --budget <amount>');
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
  assert.deepEqual(parseArgv(entry('watch').spec, ['-l', 'agent=ada', '-l', 'kind=Step']), { selector: ['agent=ada', 'kind=Step'] });
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

test('an empty text where a spec says its refusal is given to the handler, which refuses it in its own words; an empty name is not', () => {
  const idea: Spec = { ...HOLDING, positionals: [{ key: 'idea', takes: 'required', kind: 'text' }] };
  assert.deepEqual(parseArgv(idea, ['']), { idea: '' });
  assert.equal(refusalOf(['-x'], idea), 'MISSING');
  assert.equal(refusalOf([''], HOLDING), 'MISSING');
  assert.equal(parseArgv({ ...idea, missing: undefined }, ['']), undefined);
});

test("a text flag's value left out — empty, or a word starting -- — is refused in its own takes; one the api alone takes is not looked at", () => {
  const spec: Spec = { ...SPEC, flags: [...SPEC.flags, { flag: '--words', kind: 'text', key: 'words', only: { side: 'api', why: 'w' } }] };
  assert.equal(leftOut(spec, { runId: 'r-1', note: '' }), 'NOTE TAKES');
  assert.equal(leftOut(spec, { runId: 'r-1', note: '--slow' }), 'NOTE TAKES');
  assert.equal(leftOut(spec, { runId: 'r-1', note: ['hi', '--x'] }), 'NOTE TAKES');
  assert.equal(leftOut(spec, { runId: 'r-1', note: 'hi -- there', words: '' }), null);
  assert.equal(leftOut(spec, { runId: 'r-1', who: '' }), null, 'a name flag is refused by the reader, not here');
});

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

test('the command line a refusal shows names what was given and the usage of what was not', () => {
  assert.equal(commandLine(RETRY, { runId: 'r-1', step: 'impl' }), 'nemia retry r-1 impl');
  assert.equal(commandLine({ name: 'x', spec: SPEC }, { runId: 'r-1' }), 'nemia x r-1 [<step>]');
  assert.equal(commandLine({ name: 'x', spec: SPEC }, {}), 'nemia x <runId> [<step>]');
  assert.equal(commandLine(SAY, { runId: 'r-1', step: 'impl', text: 'hi' }), 'nemia say r-1 impl');
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
  const add = COMMANDS.find((c) => c.name === 'factory add')!;
  assert.equal(commandLine(add, {}, { repos: '<path>' }), 'nemia factory add <name> --repo <path>');
});

test("the table's help is today's, word for word", () => {
  assert.equal(
    helpOf(TABLE),
    [
      '  nemia start <brief.md|card.md|"text"|folder> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--gate <step> ...] [--factory <name>] [--brief "<brief>"]',
      '                               --after <runId>: file nothing of this run until nemia decide says that',
      '                               run has landed — finished, and its result branch on the base',
      '                               branch — and start from the base as it is then; once per run.',
      '                               --from <runId>: hand this run what that run concluded, as context,',
      '                               and wait on nothing: landed or still in flight, it is read once,',
      "                               when this run's steps are filed, and said not landed, not judged",
      '                               until it has landed; once per run.',
      "                               --gate <step>: that step's closeout waits for nemia approve before",
      "                               anything after it is filed, as a step's own gate: true does; once",
      "                               per step. An inbox card's gate: <step> is one more",
      '                               --workflows takes a folder, or a name under <repo>/workflows/: dev',
      '                               a folder of cards starts a plan, a run per card, parents first, at',
      '                               the command line alone (nemia start --help)',
      '                               a card of a plan (nemia start --help) starts its body: --workflows is its',
      '                               workflow: unless given, and its after: needs an --after for each',
      "                               a frontmatter block of keys a plan's card lacks is refused by its key,",
      '                               never taken as the brief: file an inbox card with nemia inbox add <file>',
      "                               --input <file>: copied into the run's own inputs/ directory, and named",
      "                               on every step's brief under what was asked for; once per file",
      '                               --factory <name>: the workflow must be attached to the factory, whose',
      '                               hires fill its steps, and a step left with no agent is refused (nemia',
      '                               factory --help). A factory with one repository gives the run its',
      "                               --repo, and a repository not one of the factory's is refused, naming",
      '                               them. Without it, the run is started in the factory whose repository',
      '                               holds --repo, else where nemia start is typed, on that repository, when',
      '                               one factory alone does; none, or two, is refused, naming the fix.',
      '                               The default factory is history only: --factory default is refused',
      '                               a card of the inbox (nemia inbox --help), by its path or its name,',
      '                               starts its body, or --brief "<brief>" in its place, and stays in the',
      '                               inbox, listed as started: --workflows is its workflow:',
      '                               unless given, --repo its repo:, --factory its factory:, and a card',
      '                               that names no factory either way is refused',
      '  nemia concluded <runId>',
      '                               what a run started with --from <runId> would be handed of it, now',
      '  nemia inbox',
      '                               the cards parked before they are started: name, first line, workflow',
      '                               and repo when set, and started as <runId> (nemia inbox --help)',
      '  nemia inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>]',
      '                               park an idea as a card in the inbox, named from its first line',
      '  nemia inbox queue <name> [--workflow <w>] [--off]',
      '                               mark a card to start on its own: the tick starts the oldest queued',
      '                               card once a run slot is free; --off takes the mark back',
      '  nemia inbox from <name> <run>... | --off',
      '                               set the runs a card is handed as context (from:), read and',
      '                               never waited on; --off takes them off',
      '  nemia inbox rm <name>',
      '                               drop a card without starting it',
      '  nemia factory',
      "                               the store's factories: the default first — every run and card that",
      '                               names no factory, read, never written — then each by name with its',
      '                               repositories (nemia factory --help)',
      '  nemia factory ls',
      '                               the same, by its name',
      '  nemia factory add <name> --repo <path> [--repo <path> ...] [--no-trust]',
      '                               file a factory: a lowercase slug naming one or more directories,',
      '                               each trusted for its steps unless --no-trust',
      '  nemia factory apply <name> --template <folder|archive> --repo <path> [--repo <path> ...] [--set <key>=<value> ...] [--no-trust]',
      '                               make a factory from a template that passes its check, its parameters',
      '                               given with --set; the daemon renders its tree',
      '  nemia factory diff <name> --to <x.y.z> [--template <folder|archive>]',
      "                               preview a templated factory's upgrade: what merges cleanly, and each",
      '                               conflict with its sides; nothing is written',
      '  nemia factory upgrade <name> --to <x.y.z> [--template <folder|archive>] [--downgrade]',
      '                               upgrade a templated factory: its file wants --to, and the daemon merges',
      "                               the template's change into its tree once each conflict is resolved",
      '  nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>',
      "                               choose for one conflict of a templated factory's upgrade: your tree, the",
      '                               template, or the text of a file; the daemon merges once each has one',
      '  nemia factory attach <factory> <workflow>',
      "                               offer a workflow in a factory, by its folder's name: a factory offers",
      '                               only the workflows attached to it',
      '  nemia factory detach <factory> <workflow>',
      '                               take a workflow back, once no hire fills its steps',
      '  nemia factory hire <factory> <agent> --step <workflow>/<step>',
      "                               hire an agent into a workflow's step: one a step, a second replaces it",
      '  nemia factory fire <factory> --step <workflow>/<step>',
      "                               take a step's hire back",
      '  nemia factory schedule <factory> <workflow> --cron <expr> --brief <text> [--repo <path>] [--tz <zone>]',
      '                               start a run of an attached workflow at each fire of a cron, by the',
      '                               daemon, at every level; a second replaces the first',
      '  nemia factory unschedule <factory> <workflow>',
      "                               take a workflow's schedule back: the daemon starts it no more",
      '  nemia factory servers <factory>',
      "                               a factory's own MCP servers, each with the state its harness reports",
      '  nemia factory server add <factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]',
      "                               record a remote MCP server for a factory: its steps' sessions are",
      '                               handed it, and an agent `mcp:` line names it',
      '  nemia factory server rm <factory> <server>',
      "                               take a server off a factory's record",
      '  nemia factory rules <name> [--file <path>|- | --clear]',
      "                               a factory's rules and policies: words told to every agent hired into",
      "                               it, after its custom instructions and before the step's own note,",
      '                               kept by the store with the factory. Bare, prints them; --file writes',
      '                               them (- for stdin); --clear removes them. Words only: a frontmatter',
      '                               block is refused. A run keeps the rules it was started with',
      '  nemia factory instruction <name> [--path <path> | --store | --clear]',
      "                               where a factory's instruction is kept, what Nemia is to know of the",
      '                               factory (its agents are told its rules: nemia factory rules): bare,',
      "                               prints it; --path reads it from a file in the factory's first folder,",
      '                               --store keeps it in the store, --clear reads NEMIA.md in the first',
      '                               folder again',
      '  nemia factory instruct <name> --file <path>|- | --clear',
      '                               write the instruction the store keeps for a factory (- for stdin), what',
      '                               Nemia is to know of it and no step is told, or remove it with --clear',
      '  nemia factory revisions <name> follow|pinned',
      "                               whether a factory's runs follow merged revisions at each filing (follow)",
      '                               or keep them until nemia refresh (pinned, the default)',
      '  nemia factory trust <name>',
      "                               trust a factory's places for the harnesses its steps run on, so each",
      "                               place's own settings apply to them",
      '  nemia factory rm <name>',
      "                               remove a factory's file, and the instruction and the rules the store",
      '                               keeps for it',
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
      '  nemia retry <runId> [<step>] [--continue | --fresh | --model <m> | --recheck | --round] [--answer <n>=<letter>]... [--message "<answer>"] [--budget <amount>]',
      '                               try a step waiting on you again, once, on the next tick:',
      '                               --continue (default) continues its session, told what happened;',
      '                               --fresh a new session on its branch; --model <m> the same, on m;',
      '                               --recheck runs its check again, and files no session;',
      '                               --round: once more — a loop out of rounds goes round again, once,',
      '                               the step it loops to continued, then a new reviewer; the step is the',
      '                               one that closes the loop, left out where the run has one loop;',
      '                               --message "<answer>" goes into the try\'s brief, as ## Your answer:',
      '                               for a step that signed off blocked, the answer to its needs — or',
      '                               what you have to say to any step you try again; not with --recheck',
      '                               or --round. The next argument is the answer, whatever it starts with;',
      "                               an answer that is only one of these flags' names goes as --message=<answer>;",
      '                               --budget <amount>: for a step with a budget that waits on you, its',
      '                               cap raised to that many dollars, above its cap and what it has cost;',
      '                               with --round, the cap of a step of the loop over its budget;',
      '                               --answer <n>=<letter>: answer question n, numbered as nemia decide',
      '                               <runId> prints them, with the option its letter names; once for each',
      '                               question: "<n>=a,c" chooses several where it takes several,',
      '                               "<n>=a: <words>" adds your own words, "<n>: <words>" says words',
      '                               alone; --message is then the note under your answers',
      '  nemia approve <runId> [<step>] [--answer <n>=<letter>]... [--message "<words>"]',
      '                               let a step waiting at its gate hand on: what waits on it is filed on',
      '                               the next tick, and every step after the gate is handed your words',
      '                               under ## Approved. To send it back instead, with what to change:',
      '                               nemia retry <runId> <step> --message "<objection>"',
      '                               Of a loop out of rounds — the step that closes it, or the run alone',
      '                               where it has one loop — enough: the loop ends on your words, with its',
      '                               findings open, --message "<why>" required. What waits on the looping',
      '                               step is filed as if it had said again: false, and every step after',
      '                               the loop is handed your words and those findings under ## Accepted.',
      '                               To go round once more instead: nemia retry <runId> [<step>] --round',
      '                               --answer <n>=<letter>: answer question n, numbered as nemia decide',
      '                               <runId> prints them, with the option its letter names; once for each',
      '                               question: "<n>=a,c" chooses several where it takes several,',
      '                               "<n>=a: <words>" adds your own words, "<n>: <words>" says words',
      '                               alone; --message is then the note under your answers',
      '  nemia refresh <runId> [<step>] [--base]',
      '                               take the new revisions: a run keeps the workflow, agents, skills and',
      '                               factory rules it resolved when it started, and this pins it to the',
      '                               ones they hold now, so every filing after it — a new step, a retry,',
      '                               a round — is filed on them. What has already been filed is not re-run,',
      '                               and the steps the run has are neither added to nor removed. Refused of',
      '                               a run that has filed nothing, which resolves afresh at its first filing',
      '                               anyway, of one already on the newest revision of every kind, and of one',
      '                               whose factory follows revisions (nemia factory revisions), whose every',
      '                               filing takes them with no refresh;',
      "                               --base: take the base instead — a loop's work that no longer merges",
      '                               cleanly goes back to merge it, once, on the next tick, on the round it',
      '                               is on, which the merge does not spend; the step is the one that closes',
      '                               the loop, left out where the run has one loop',
      '  nemia say <runId> <step> "<words>"',
      "                               tell a step's running session something, through its harness: the",
      "                               engine journals the words on the step's task, nemia ls notes the step",
      '                               said to, and nemia decide prints them under it. A try that continues',
      '                               the session is handed them again, as ## Said to your session',
      '  nemia ls [<runId>]',
      '                               runs and their steps — a run waiting on another says waiting on <run>,',
      '                               one the cap on runs in flight holds waiting for a run slot (2 of 2 in',
      "                               flight); what each step's tries and the run have cost, where measured;",
      '                               last, whether a nemia up ticks the store and when its last pass was;',
      '                               first, while the store is paused, Pausing: N finishing and each',
      '                               session, check or landing at work, or Paused once none is, then each',
      '                               check it holds, a landing with its merge staged in the checkout',
      '                               (MERGE_HEAD) among them; a step whose check it holds says waiting on',
      '                               the pause',
      '  nemia show <runId>',
      '                               the run, and what each step was told',
      '  nemia logs <runId> <step>',
      "                               that step's session output",
      '  nemia stats [--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [--line|--json]',
      '                               what every run in the store adds up to, by UTC day: rounds to',
      '                               acceptance of each loop: step, landings of the workspace: base step',
      "                               and on which try, cost and time per landed run, and each step's",
      '                               tries, time, cost, checks and gate waits; first the last 14 days',
      '                               against the 14 before. A number nothing measured reads —, never 0.',
      '                               --line: one line, for a recap; --json: the whole answer',
      '  nemia passes [--last <n>] [--json]',
      '                               what the recent passes of the tick cost: their median and slowest',
      '                               time, a histogram of their times, where the time went phase by',
      '                               phase, and what the last saw — the runs in the store, its journal',
      '                               reads, the sessions queued and admitted. --last <n>: the last n',
      '                               passes only; --json: the whole answer',
      '  nemia series [--range 24h|7d|30d|all] [--json]',
      "                               the system's series over a range: a pass's time and its phases, its",
      '                               journal reads, the runs in the store, the sessions queued and admitted',
      '                               and the longest wait, the load, and the quota used. --range: 24h (a',
      '                               point a minute, the default), 7d or 30d (an hour), all (a day);',
      '                               --json: the whole answer',
      '  nemia agents [--repo .]',
      "                               the agents a step may name, the repository's then yours: what each is",
      '                               for, what it says it can do (an entry for each skill, read off its',
      '                               SKILL.md), and the skills it is given (its skills:)',
      '  nemia agents card <name> [--repo .] [--from repo|yours]',
      '                               that agent in the shape of an A2A Agent Card, JSON on stdout and',
      '                               nothing else — every field the protocol marks REQUIRED but',
      '                               supportedInterfaces, which is left out because nothing here serves an',
      '                               agent over A2A. The card describes; it is not an address',
      '  nemia agents sources [--path <folder>]',
      '                               the agent files the store knows of, to copy into your library:',
      "                               each repository's, yours, and those of a --path <folder>",
      '  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]',
      '                               your custom instructions for that agent: words you add to it without',
      '                               rewriting it, kept in <store>/custom-instructions/<name>.md and told',
      '                               after its instructions. Bare, prints them; --file writes them (- for',
      '                               stdin); --clear removes them. Words only: a frontmatter block is',
      '                               refused. A run keeps the words it was started with; nemia, the',
      "                               store's own agent, is told them in her open session",
      '  nemia agents write (yours | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]',
      '                               an agent of yours, or of a templated --factory, written from its file:',
      '                               <name> is the agent it changes or renames, at the --version it was',
      '                               read at; none, a new one',
      '  nemia agents copy <file> [--as <name>] [--keep <part>]...',
      '                               an agent file copied into your library, with its schema and skills;',
      '                               a part your library holds otherwise stops it: --as or --keep',
      '  nemia agents rm yours <name> --version <v>',
      '                               an agent of yours removed, at the --version it was read at',
      '  nemia agents run yours <name> --brief <words>',
      '                               an agent of yours tried on a short brief, in a folder of its own,',
      '                               capped at $1',
      '  nemia skills write (yours | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]',
      '                               a skill of yours, or of a templated --factory, written from its',
      '                               SKILL.md: <name> is the skill it changes, at the --version it was',
      '                               read at; none, a new one',
      '  nemia cancel <runId>',
      '                               stop what it has in flight; file nothing more',
      '  nemia hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]',
      '                               file nothing more of a run until other runs land, as --after would',
      '                               have: what is in flight finishes, nothing new is filed, and nothing',
      '                               is asked of you — nemia ls and nemia decide say held until <run> lands, and',
      '                               what a step asks is asked once the hold lifts. The tick lifts it when',
      '                               every run named has landed. Refused of a run cancelled, pruned,',
      '                               finished or already held, and of a run named that is unknown, the run',
      '                               itself, or one that already waits on it, through --after or a hold.',
      '                               --why: the reason, shown beside held until <run> lands wherever it is',
      '                               said; --by: who puts the hold (default: your OS user).',
      '                               nemia hold <runId> --off: lift the hold now, and the next tick goes on as',
      '                               if it had never been put',
      '  nemia rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]]',
      "                               forget runs that are over, a line each: a run's worktrees removed",
      '                               through git, what one held uncommitted committed first, then its',
      '                               record and every file under WF_ROOT keyed by its id. Refused while',
      '                               a task of it is in flight, anything is due to be filed or asked',
      '                               for, or a run waiting on it has not started. Its branches are kept:',
      "                               --delete-branches deletes those merged into the run's base branch,",
      '                               and --force-unmerged beside it the others, with their work. Then',
      "                               the engine forgets the run's tasks: their journals and session",
      '                               files; one not settled yet is forgotten by the next passes',
      '  nemia prune [<runId> ...] [--unmerged] [--artifacts] [--yes]',
      '                               free the space runs that are over hold: their worktrees, removed',
      "                               through git, and nothing else — each run's record, branches and",
      '                               files are kept, and it stays on nemia ls, nemia decide and the board,',
      '                               marked pruned. --artifacts removes its files too (runs/<id>/',
      '                               artifacts/: screenshots, logs), of a run whose worktrees are',
      '                               already gone as well; its record and branches are still kept.',
      '                               Lists what it would remove, with its size, and removes it on',
      '                               --yes, or on y at the prompt. With no run, every run. Refused',
      '                               while a run is not over, owes a hand-off, is a folder run, or has',
      '                               a worktree held, on no branch, or with changes no commit has;',
      '                               and a finished run not merged unless --unmerged, with --artifacts',
      '                               as without: its files are what a person reads to decide it',
      '  nemia pause [--why "<words>"] [--by <name>] [--now [--yes]]',
      '                               pause the store: no pass starts new work — no step, try, round or',
      '                               check filed, no queued task admitted, no queued card started — and',
      '                               what runs finishes, its end and closeout recorded; a landing whose',
      '                               check has ended commits or aborts. Pausing: N finishing while a',
      '                               session works or a check or landing runs, Paused once none does.',
      '                               nemia start still writes a run, and approvals, retries and answers are',
      '                               kept, not acted on: the pass after nemia resume files what waits. nemia ls,',
      '                               nemia watch --once, nemia start and nemia up say it, and nemia ls names what finishes.',
      '                               Refused while a pause stands.',
      '                               --why: the reason, said wherever the pause is; --by: who pauses it',
      '                               (default: your OS user)',
      '                               --now: pause at once — each step session or check at work, but a',
      '                               landing, is asked to stop and tried again on nemia resume: a continue of',
      '                               its session, or a recheck. A pause that stands is kept as it was.',
      '                               --yes: with --now, act; without it, --now only says what it would',
      '                               interrupt',
      '  nemia resume',
      '                               resume the store: the next pass files what waits',
      '  nemia subscribe <name> <task> [-l <selector>]... [--digest-every <minutes>] [--at-least <level>]',
      "                               give the engine's long-lived task <task> a subscription to the feed,",
      '                               named <name>, from its end: a line one of its selectors takes is said to',
      '                               it at once, and the rest folded into a digest said with the next wake,',
      '                               or after --digest-every minutes (default 60) with none.',
      '                               -l: the lines a selector takes, given again for another (default:',
      '                               waits=person, the lines that wait on a person). Refused for a task not',
      '                               long-lived.',
      "                               --at-least: only the lines of runs whose factory's level is at least",
      '                               this (manual, semi-auto, auto), read as each line is delivered.',
      '  nemia unsubscribe <name>',
      '                               take the subscription <name> away: its task is told nothing more of the feed',
      '  nemia level [manual|semi-auto|auto] [--factory <name> [--for <duration> | --end]]',
      "                               Nemia, the store's own agent: bare, where she is, each factory's level and",
      "                               how to reach her; a level sets the store's, which every factory follows",
      "                               unless it has its own; --factory sets that factory's, --for raises it for",
      '                               a stretch (90m, 2h, 1d; up to 7d) and --end ends the raise. semi-auto keeps',
      "                               her session: what waits on you (a gate, a step's question, a loop out of",
      '                               rounds, a cap) is asked of you, and a write that cannot be undone or',
      '                               changes your settings or a factory; the rest is hers. auto is semi-auto,',
      "                               but an answer your confirmed list allows in the run's state is given",
      '                               unasked (nemia policy <agent>), in a session of hers filed since auto came:',
      '                               one kept from before asks every answer until filed again (manual, then',
      '                               auto once it is off). A factory at manual is left alone, and her session',
      '                               stops once none is above manual',
      '  nemia memory [<fact>]',
      "                               what Nemia keeps of the store: bare, her facts' names; given one, its",
      '                               words. Read only: her session alone writes them',
      '  nemia policy <agent>',
      "                               the agent's rules at auto: the answers it may give unasked, in force once",
      '                               you confirm them, and what it proposed from your custom instruction,',
      '                               with the words the machinery cannot hold, kept as guidance',
      '  nemia policy propose <agent> --file <path>|-',
      "                               the agent's proposal: rules from your custom instruction, as JSON,",
      '                               with the words the machinery cannot hold kept as guidance; none is in',
      '                               force until you confirm it (nemia policy confirm)',
      "  nemia policy confirm <agent> <id> --words '<words>'",
      '                               put in force a rule the agent proposed, or the default again, as its',
      '                               words read: from then on, at auto, the answer it names is given unasked',
      '                               where it holds. Refused once the rule reads otherwise. Your first confirm',
      '                               keeps the default beside it. Asked of you every time',
      '  nemia policy rm <agent> <id>',
      '                               take a rule out of force, the default among them: what it allowed is',
      '                               asked of you again. Asked of you every time',
      '  nemia service install [--env KEY=VALUE ...] [--name <name>] [--take-over <pid>]',
      '                               install the daemon as a login service: a systemd user unit on Linux,',
      '                               a launchd agent on macOS. It runs the api of this checkout with this',
      '                               node, WF_ROOT and PATH, and each --env, written once; it restarts on',
      '                               failure and starts at login. Started now unless another daemon holds',
      '                               the store; --take-over <pid> pauses the store, waits for landing',
      '                               checks, stops that pid and starts the service. --name: the service',
      '                               name (nemia; required for a store that is not the default)',
      '  nemia service uninstall [--name <name>]',
      '                               stop the login service, disable it and remove its file; a daemon',
      '                               started by hand is left alone',
      '  nemia service status [--name <name>]',
      '                               the login service and the lease: whether it is installed and runs,',
      '                               the checkout it runs, who holds the store, and lingering',
      '  nemia service restart [--name <name>]',
      "                               restart the service's daemon on the code it runs: pause the store, wait",
      '                               for landing checks, stop it, start the service, and resume once the new',
      '                               daemon has completed its first pass; refused, naming the log, when that',
      '                               pass fails. A pause a person put stands. Starts the service where',
      "                               nothing ticks; a daemon started by hand is named with --take-over's line",
      '  nemia upgrade <tag> [--repo <path>] [--name <name>]',
      "                               build the tag from a clean export into the store's releases/<tag>:",
      '                               npm ci, npm run build and npm run release:check there, on a trial',
      '                               store; then point releases/current at it and restart the daemon onto',
      '                               it where the login service runs the pointer. A tag built already is',
      '                               switched to without a rebuild, so an older tag rolls back. --repo:',
      "                               the repository the tag is in (the running release's source);",
      '                               --name: the service (nemia)',
      '  nemia version [--json]',
      "                               this nemia's release, an install's tag or a checkout, and its folder;",
      "                               the release the store's releases/current names; and the release the",
      '                               daemon runs, from its lease. --json: the whole answer',
      '  nemia frontmatter rewrite [<folder>...] [--check]',
      "                               rewrite as YAML each markdown file's frontmatter still in the former",
      "                               line form, under the folders given or the store's own. --check: write",
      '                               nothing, and exit 1 where a rewrite is due',
      '  nemia workflows write (yours | factory) <name> --folder <draft> [--factory <name>] [--version <v>]',
      '                               a workflow folder of yours, or of a templated --factory, written from',
      '                               a draft folder; one there already, at the --version it was read at',
      '  nemia workflows rm yours <name> --version <v>',
      '                               a workflow folder of yours removed, at the --version it was read at',
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
      '  nemia watch [cursor] [--once] [-l <selector>]... [--cursor-file <path>] [--json]',
      "                               the feed's lines, followed as the tick writes them, until ^C, and a",
      '                               daemon down line when nothing ticks the store, daemon up when it does',
      "                               again: a run's status, a step's word as nemia ls says it, and what a",
      "                               person's word changed. --once: read from the cursor to the feed's end,",
      '                               print cursor: <n> and stop; from the start with no cursor. -l: the',
      '                               lines a selector takes, given again for another (key=v, key!=v, "key in',
      '                               (a,b)", "key notin (a,b)", key), over run, factory, workflow, step,',
      '                               agent, kind, reason, on, via, type, waits and source. --cursor-file:',
      '                               keep the cursor read to in a file, and start from it where it is there.',
      '                               --json: one JSON object a line, a feed line with its cursor, and a',
      '                               cursor of its own every 30 seconds while the feed is still. With no -l,',
      '                               every line; -l waits=person takes the lines that wait on a person. A',
      '                               step with no agent carries agent: none, which -l agent!=none leaves out.',
      "                               A line's reason is a step's code as the api gives the step (reason);",
      '                               its word and message are for people: select on the reason, never on',
      '                               the words.',
      '  nemia admit [--at-least <level>] [--auto <agent>]',
      "                               a call's admission: the call a session is about to make, on stdin, answered",
      '                               ask where it answers what waits on you;',
      '                               --at-least: deny a call acting on a run or a factory below the level;',
      "                               --auto: let through, for a run of a factory at auto, an answer the agent's",
      '                               rules you confirmed allow in the run as it stands (nemia policy <agent>)',
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
    ['  nemia a <runId>', `${' '.repeat(31)}h`, '  nemia c <runId>', `${' '.repeat(31)}h`].join('\n'),
  );
});

/** A spec that takes a card's `name`, and the words a person or the api alone gives. */
const CARD: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [
    { flag: '--file', kind: 'text', key: 'file', only: { side: 'cli', why: 'the api is sent the words' } },
    { flag: '--words', kind: 'text', key: 'words', only: { side: 'api', why: 'a command line names a file', required: true } },
  ],
  unknown: (arg) => `UNKNOWN ${arg}`,
};

type Table = Parameters<typeof commandBreaks>[0];

const POST = { method: 'POST', path: '/api/x', status: 202 } as const;
const GET = { method: 'GET', path: '/api/x', status: 200 } as const;
const PUT = { method: 'PUT', path: '/api/cards/:name', status: 200 } as const;
const BY_HAND = { method: 'POST', path: '/api/x', status: 201, hand: 'it answers a Location' } as const;
const SETS = { method: 'DELETE', path: '/api/x', status: 200, sets: { off: true, mode: 'fast' } } as const;
const ROUTES = [
  { method: 'POST', path: '/api/x', status: 200 },
  { method: 'DELETE', path: '/api/x', status: 200, sets: { off: true } },
] as const;
const API = { side: 'api', why: 'w' } as const;
const CLI_ALONE = { side: 'cli', why: 'w' } as const;
const SAID_NOTHING = { ...CARD, flags: [{ ...CARD.flags[0], only: { side: 'cli', why: '' } } as const, CARD.flags[1]] };

/**
 * Each table `commandBreaks` reads, the CLI's verbs and runners beside it, and what it breaks: one list of fragments per break, in
 * order, each naming the entry and the fix; none for a table that keeps its rules.
 */
const BREAKS: ReadonlyArray<readonly [string, Table, readonly string[], readonly string[], ReadonlyArray<readonly string[]>]> = [
  ['an entry that ticks and writes', [{ name: 'x', route: POST, handler, writes: true, ticks: true }], [], [], []],
  [
    'REFUSED: an entry that ticks and writes nothing, since nothing it does waits on a pass',
    [{ name: 'x', route: POST, handler, writes: false, ticks: true }],
    [],
    [],
    [['x ticks and writes nothing', 'writes: true']],
  ],
  ['an entry routed, beside a verb of another name', [{ name: 'a', route: POST, handler }], ['b'], [], []],
  ['an entry the CLI alone serves', [{ name: 'a', only: CLI_ALONE, handler }], [], [], []],
  [
    'a name twice',
    [
      { name: 'a', route: POST, handler },
      { name: 'a', route: { ...POST, path: '/api/y' }, handler },
    ],
    [],
    [],
    [['a is defined twice']],
  ],
  ['an entry served nowhere', [{ name: 'a', handler }], [], [], [['a has no route and no only', 'which side alone serves it']]],
  ['a command that is also a verb of the CLI', [{ name: 'a', route: POST, handler }], ['a'], [], [['a is a command', 'out of VERBS']]],
  [
    'one path, another method',
    [
      { name: 'a', route: GET, handler },
      { name: 'b', route: POST, handler },
    ],
    [],
    [],
    [],
  ],
  [
    'two entries routed on one method and path, of which the api serves the first alone',
    [
      { name: 'a', route: GET, only: API, handler },
      { name: 'b', route: GET, only: API, handler },
    ],
    [],
    [],
    [['b is routed on GET /api/x, as a is', 'a path of its own']],
  ],
  [
    'an entry named by a former spelling, which the line it names would never reach',
    [{ name: 'agents remove', route: POST, handler }],
    [],
    [],
    [['agents remove', 'RENAMED']],
  ],
  ['a verb of the CLI beside an entry the api alone serves', [{ name: 'decide', route: GET, only: API, handler }], ['decide'], [], []],
  [
    'a verb of the CLI beside an entry the CLI serves',
    [{ name: 'decide', route: GET, only: CLI_ALONE, handler }],
    ['decide'],
    [],
    [['decide is', 'take it out of VERBS']],
  ],
  ['an entry the CLI alone serves with a runner and no handler', [{ name: 'a', only: CLI_ALONE }], [], ['a'], []],
  [
    'an entry the api serves with no handler',
    [{ name: 'a', route: POST }],
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
    [{ name: 'a', route: GET, only: API, handler }],
    [],
    ['a', 'b'],
    [
      ['a has a runner', 'its entry in the table', 'take it out of RUNS'],
      ['b has a runner', 'its entry in the table', 'take it out of RUNS'],
    ],
  ],
  [
    'the keys a route sets, each filled by a flag',
    [{ name: 'a', route: SETS, spec: { ...HOLDING, flags: [...HOLDING.flags, ...SPEC.flags] }, handler }],
    [],
    [],
    [],
  ],
  [
    'a key a route sets that no flag fills: off',
    [{ name: 'a', route: SETS, spec: SPEC, handler }],
    [],
    [],
    [["a's route sets off", 'name a key']],
  ],
  ['a key a route sets that no flag fills: mode', [{ name: 'a', route: SETS, spec: HOLDING, handler }], [], [], [["a's route sets mode"]]],
  ["a name in a route's path its spec takes", [{ name: 'a', route: PUT, spec: CARD, handler }], [], [], []],
  [
    "a name in a route's path that no argument of its spec takes",
    [{ name: 'a', route: { ...PUT, path: '/api/cards/:card' }, spec: CARD, handler }],
    [],
    [],
    [['names :card', 'key a positional card']],
  ],
  ['a route served by hand, saying why', [{ name: 'a', route: BY_HAND, handler }], [], [], []],
  [
    'a why left empty, of a route served by hand',
    [{ name: 'a', route: { ...BY_HAND, hand: ' ' }, handler }],
    [],
    [],
    [['served by hand and says no why']],
  ],
  [
    'a why left empty, of a side alone',
    [{ name: 'a', only: { side: 'cli', why: '' }, handler }],
    [],
    [],
    [['served on the cli alone and says no why']],
  ],
  [
    'a why left empty, of a flag one side alone takes',
    [{ name: 'a', route: PUT, spec: SAID_NOTHING, handler }],
    [],
    [],
    [["a's --file is taken on the cli alone", 'says no why']],
  ],
  [
    'a flag the api alone takes, handed by a route served by hand',
    [{ name: 'a', route: { ...PUT, hand: 'by hand' }, spec: CARD, handler }],
    [],
    [],
    [],
  ],
  [
    'a flag the api alone takes on an entry with no route that hands it',
    [{ name: 'a', route: { ...PUT, method: 'GET' }, spec: CARD, handler }],
    [],
    [],
    [["a's --words is taken on the api alone", 'route it, or take the flag out']],
  ],
  [
    'a flag the api alone takes on an entry the CLI alone serves',
    [{ name: 'a', only: { side: 'cli', why: 'a file' }, spec: CARD, handler }],
    [],
    [],
    [["a's --words is taken on the api alone"]],
  ],
  ["an entry's routes, each keeping the rules", [{ name: 'a', route: ROUTES, spec: HOLDING, handler }], [], [], []],
  [
    "one of an entry's routes routed on another's path",
    [
      { name: 'a', route: ROUTES, spec: HOLDING, handler },
      { name: 'b', route: { method: 'DELETE', path: '/api/x', status: 200 }, handler },
    ],
    [],
    [],
    [['b is routed on DELETE /api/x, as a is']],
  ],
  [
    "a key one of an entry's routes sets that no flag fills",
    [{ name: 'a', route: ROUTES, spec: SPEC, handler }],
    [],
    [],
    [["a's route sets off"]],
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
 * A command of the table, a command line, and what it refuses of it before anything is read: the fragments it names — the command,
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
  ['hold, neither --until nor --off', 'hold', ['r-x'], ['nemia hold needs the runs to wait on', '--off to lift a hold']],
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
  ['pause, why and by', 'pause', ['--why', 'merging by hand', '--by=ann'], null],
  ['pause, nothing', 'pause', [], null],
  ['pause, now with yes', 'pause', ['--now', '--yes', '--why', 'the bill'], null],
  ['resume, a flag', 'resume', ['--all'], ['nemia resume takes no --all', 'whoever paused it']],
  ['resume, nothing', 'resume', [], null],

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

  ['watch, a cursor that is no number', 'watch', ['x'], ['nemia watch takes one cursor at most', '`cursor:` line']],
  ['watch, two cursors', 'watch', ['1', '2'], ['nemia watch does not take 2']],
  ['watch, a flag it does not take', 'watch', ['--from'], ['nemia watch does not take --from']],
  ["watch, a typo'd short flag is no cursor", 'watch', ['-L'], ['nemia watch does not take -L']],
  ['watch, a cursor', 'watch', ['12'], null],
  ['watch, every flag', 'watch', ['--once', '12', '-l', 'factory=nemia', '--json'], null],
  ['watch, a selector on no key of a feed line', 'watch', ['-l', 'message=hi'], ['"message" is no key of a feed line']],
  ['watch, an empty selector', 'watch', ['-l', 'factory=nemia', '-l', ''], ['"" is no selector']],
  ['watch, --cursor-file given nothing', 'watch', ['--cursor-file'], ['nemia watch --cursor-file takes the path']],
  ['watch, --cursor-file twice', 'watch', ['--cursor-file', 'a', '--cursor-file', 'b'], ['nemia watch takes --cursor-file once']],
  [
    'watch, a cursor beside a cursor file',
    'watch',
    ['500', '--cursor-file', 'f'],
    ['not both', 'given 500', 'drop the 500', 'drop --cursor-file', 'delete the file'],
  ],

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

  ['show, a run', 'show', ['r'], null],
  ['show, a flag where the run stands', 'show', ['--x'], ["nemia show takes one run's id", 'not --x.']],
  ['show, a word more', 'show', ['r', 'extra'], ["nemia show takes one run's id", 'not extra.']],
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
  ['inbox, a word it has no command of', 'inbox', ['frob'], ['nemia inbox does not take frob', 'nemia inbox --help']],
  ['factory, a word it has no command of', 'factory', ['frob'], ['nemia factory does not take frob', 'nemia factory --help']],
];

test('REFUSED at shipped defaults: what each command refuses of its command line, before anything is read, Invalid with exit 2', async (t) => {
  for (const [row, command, argv, said, not = []] of REFUSALS)
    await t.test(row, () => {
      const words = refusedBy(entry(command), argv);
      if (said === null) return assert.equal(words, null);
      names(words, ...said);
      for (const word of not) assert.ok(!words!.includes(word), `${words} names ${word}`);
    });
  await t.test('watch, -l given no selector: the forms, then every key of a feed line, in order', () => {
    const words = refusedBy(entry('watch'), ['-l', '--json']);
    names(words, 'nemia watch -l takes', '-l <key>=<value>', '-l <key>!=<value>', '-l "<key> in (<a>,<b>)"', '-l "<key> notin (<a>,<b>)"');
    assert.deepEqual(words!.split('The keys: ')[1].split(', '), [
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
    ]);
  });
});

test('a command line refuses a flag the api alone takes, as one the command does not take, and reads one the CLI alone takes', () => {
  assert.equal(refusalOf(['x', '--words', 'hi'], CARD), 'UNKNOWN --words');
  assert.equal(refusalOf(['x', '--words=hi'], CARD), 'UNKNOWN --words=hi');
  assert.deepEqual(parseArgv(CARD, ['x', '--file', 'f.md']), { name: 'x', file: 'f.md' });
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
