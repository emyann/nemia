/**
 * The command table's parser, help and rules: a command line read against a spec and refused in its own words, the line a refusal
 * shows, the help the table prints, and where a table breaks its rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandBreaks, commandLine, helpOf, leftOut, parseArgv, type Spec } from './command.ts';
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
    assert.equal((err as { exitCode?: number }).exitCode, 2);
    return (err as Error).message;
  }
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
  assert.equal(
    refusalOf(['--nope'], { ...SPEC, missing: 'MISSING' }),
    'MISSING',
    'a spec that says its own refusal of an argument left out says it',
  );
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
  assert.equal(
    refusalOf(['r-1', 'impl', '--fresh', '--recheck'], RETRY.spec),
    'nemia retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.',
  );
  assert.equal(
    refusalOf(['r-1', 'impl', '--message', '--fresh'], RETRY.spec),
    "--message takes what to tell the step, and --fresh is one of nemia retry's own flags, so the answer was left out: " +
      'nemia retry <runId> <step> --message "<answer>". If --fresh is the whole answer, give it as --message=--fresh.',
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
      '  nemia start <brief.md|card.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--gate <step> ...] [--factory <name>] [--brief "<brief>"]',
      '                               --after <runId>: file nothing of this run until nemia decide says that',
      '                               run has shipped — finished, and its result branch on the base',
      '                               branch — and start from the base as it is then; once per run.',
      '                               --from <runId>: hand this run what that run concluded, as context,',
      '                               and wait on nothing: shipped or still in flight, it is read once,',
      "                               when this run's steps are filed, and said not shipped, not judged",
      '                               until it has shipped; once per run.',
      "                               --gate <step>: that step's closeout waits for nemia approve before",
      "                               anything after it is filed, as a step's own gate: true does; once",
      "                               per step. An inbox card's gate: <step> is one more",
      '                               --workflows takes a folder, or a name under <repo>/workflows/: dev',
      '                               a card of a plan (nemia plan --help) starts its body: --workflows is its',
      '                               workflow: unless given, and its after: needs an --after for each',
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
      '                               a card of the inbox (nemia inbox --help) starts its body, or --brief',
      '                               "<brief>" in its place, and leaves the inbox: --workflows is its workflow:',
      '                               unless given, --repo its repo:, --factory its factory:, and a card',
      '                               that names no factory either way is refused',
      '  nemia plan <folder> [--repo .] [--factory <name>]',
      '                               start a plan: one run per card in the folder, parents first, each',
      '                               --after the runs of the cards its after: names, in the factory as',
      '                               nemia start finds it (nemia plan --help)',
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
      '  nemia factory add <name> --repo <path> [--repo <path> ...]',
      '                               file a factory: a lowercase slug naming one or more directories',
      '  nemia factory attach <factory> <workflow>',
      "                               offer a workflow in a factory, by its folder's name: a factory offers",
      '                               only the workflows attached to it',
      '  nemia factory detach <factory> <workflow>',
      '                               take a workflow back, once no hire fills its steps',
      '  nemia factory hire <factory> <agent> --step <workflow>/<step>',
      "                               hire an agent into a workflow's step: one a step, a second replaces it",
      '  nemia factory fire <factory> --step <workflow>/<step>',
      "                               take a step's hire back",
      '  nemia factory rm <name>',
      "                               remove a factory's file",
      '  nemia retry <runId> <step> [--nudge | --fresh | --model <m> | --recheck] [--message "<answer>"] [--budget <amount>]',
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
      '  nemia approve <runId> <step> [--message "<words>"]',
      '                               let a step waiting at its gate hand on: what waits on it is filed on',
      '                               the next tick, and every step after the gate is handed your words',
      '                               under ## Approved. To send it back instead, with what to change:',
      '                               nemia retry <runId> <step> --message "<objection>"',
      '  nemia round <runId> [<step>] [--budget <amount>]',
      '                               once more: a loop out of rounds goes round again, once, on the',
      '                               next tick — the step it loops to continued, then a new reviewer;',
      '                               --budget raises the cap of a step of the loop over its budget',
      '  nemia accept <runId> [<step>] --message "<why>"',
      '                               enough: a loop out of rounds ends on your word, with its findings',
      '                               open. What waits on the looping step is filed on the next tick as',
      '                               if it had said again: false — a gated ending goes to its gate —',
      '                               and every step after the loop is handed your words and those',
      '                               findings under ## Accepted. The other answer to nemia round',
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
      '                               landing it holds with its merge staged in the checkout (MERGE_HEAD)',
      '  nemia show <runId>',
      '                               the run, and what each step was told',
      '  nemia logs <runId> <step>',
      "                               that step's session output",
      '  nemia feed [cursor]',
      "                               what the tick judged, a line each time it changed: a run's status, a",
      "                               step's word as nemia ls says it, and what a person's word changed — then",
      '                               cursor: <n>, to read on from with nemia feed <n>; from the start with none',
      '  nemia stats [--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [--line|--json]',
      '                               what every run in the store adds up to, by UTC day: rounds to',
      '                               acceptance of each loop: step, landings of the workspace: main step',
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
      '  nemia agents [--repo .]',
      "                               the agents a step may name, the repository's then yours: what each is",
      '                               for, what it says it can do (an entry for each skill, read off its',
      '                               SKILL.md), and the skills it is given (its skills:)',
      '  nemia agents card <name> [--repo .] [--from repo|yours]',
      '                               that agent in the shape of an A2A Agent Card, JSON on stdout and',
      '                               nothing else — every field the protocol marks REQUIRED but',
      '                               supportedInterfaces, which is left out because nothing here serves an',
      '                               agent over A2A. The card describes; it is not an address',
      '  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]',
      '                               your custom instructions for that agent: words you add to it without',
      '                               rewriting it, kept in <store>/custom-instructions/<name>.md and told',
      '                               after its instructions. Bare, prints them; --file writes them (- for',
      '                               stdin); --clear removes them. Words only: a frontmatter block is',
      '                               refused. A run keeps the words it was started with',
      '  nemia cancel <runId>',
      '                               stop what it has in flight; file nothing more',
      '  nemia hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]',
      '                               file nothing more of a run until other runs ship, as --after would',
      '                               have: what is in flight finishes, nothing new is filed, and nothing',
      '                               is asked of you — nemia ls and nemia decide say held until <run> ships, and',
      '                               what a step asks is asked once the hold lifts. The tick lifts it when',
      '                               every run named has shipped. Refused of a run cancelled, pruned,',
      '                               finished or already held, and of a run named that is unknown, the run',
      '                               itself, or one that already waits on it, through --after or a hold.',
      '                               --why: the reason, shown beside held until <run> ships wherever it is',
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
      '                               and --force-unmerged beside it the others, with their work',
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
      '                               a worktree locked, on no branch, or with changes no commit has;',
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
      '                               nemia feed, nemia start and nemia up say it, and nemia ls names what finishes.',
      '                               Refused while a pause stands.',
      '                               --why: the reason, said wherever the pause is; --by: who pauses it',
      '                               (default: your OS user)',
      '                               --now: pause at once — each step session or check at work, but a',
      '                               landing, is asked to stop and tried again on nemia resume: a nudge of',
      '                               its session, or a recheck. A pause that stands is kept as it was.',
      '                               --yes: with --now, act; without it, --now only says what it would',
      '                               interrupt',
      '  nemia resume',
      '                               resume the store: the next pass files what waits',
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
      '  nemia watch [cursor]',
      "                               nemia feed's lines, followed as the tick writes them, until ^C",
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

/** `nemia hold`'s two forms, as each of its refusals ends on them. */
const HOLD_SHAPE = 'nemia hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>], or nemia hold <runId> --off';

test("REFUSED at shipped defaults: nemia hold's arguments, before any run is read, in today's words whole", () => {
  const hold = entry('hold');
  const first = 'nemia hold takes the run first: nemia hold <runId> --until <runId> [--until <runId> ...], or nemia hold <runId> --off.';
  for (const argv of [[], ['--until', 'a'], ['-x', '--off']]) assert.equal(refusedBy(hold, argv), first, argv.join(' '));
  const until = `--until takes the run to wait on, by id: ${HOLD_SHAPE}.`;
  for (const argv of [['--until'], ['--until', '--off'], ['--until', '-a'], ['--until=']])
    assert.equal(refusedBy(hold, ['r-x', ...argv]), until, argv.join(' '));
  assert.equal(refusedBy(hold, ['r-x']), `nemia hold needs the runs to wait on, or --off to lift a hold: ${HOLD_SHAPE}.`);
  assert.equal(
    refusedBy(hold, ['r-x', '--until', 'a', '--off']),
    `nemia hold takes --until or --off, not both: lift the hold first, then hold it again — ${HOLD_SHAPE}.`,
  );
  assert.equal(
    refusedBy(hold, ['r-x', '--off', '--why', 'w']),
    `nemia hold --off lifts the hold whole, and takes no --why or --by: those go with --until, on the hold put next — ${HOLD_SHAPE}.`,
  );
  assert.equal(
    refusedBy(hold, ['r-x', '--after', 'a']),
    `nemia hold does not take --after. It takes the run, then the runs it waits on or --off: ${HOLD_SHAPE}.`,
  );
  assert.equal(refusedBy(hold, ['r-x', '--until', 'a', '--why', '--x']), `--why takes the words for why the run is held: ${HOLD_SHAPE}.`);
  assert.equal(
    refusedBy(hold, ['r-x', '--until', 'a', '--by', ' ']),
    '--by takes who puts the hold, by a name, and was given only blanks: give it words, or leave --by out.',
  );
  assert.equal(
    refusedBy(hold, ['r-x', '--until', 'a', '--by', 'a', '--by', 'b']),
    `nemia hold takes --by once: a hold says one by. ${HOLD_SHAPE}.`,
  );
  assert.equal(refusedBy(hold, ['r-x', '--until', 'a', '--until', 'b', '--why', 'w']), null);
  assert.equal(refusedBy(hold, ['r-x', '--off', '--off']), null);
});

test("REFUSED at shipped defaults: nemia pause's and nemia resume's arguments, before the store is read, in their words whole", () => {
  const pause = entry('pause');
  const shape = 'nemia pause [--why "<words>"] [--by <name>] [--now [--yes]]';
  assert.equal(refusedBy(pause, ['--why', '--by']), `--why takes the words for why the store is paused: ${shape}.`);
  assert.equal(refusedBy(pause, ['--by']), `--by takes who pauses it, by a name: ${shape}.`);
  assert.equal(refusedBy(pause, ['--why', '--x']), `--why takes the words for why the store is paused: ${shape}.`);
  assert.equal(
    refusedBy(pause, ['--why', ' \n ']),
    '--why takes the words for why the store is paused, and was given only blanks: give it words, or leave --why out.',
  );
  assert.equal(refusedBy(pause, ['--by', 'b'.repeat(65)]), '--by takes at most 64 characters, and was given 65: say it shorter.');
  assert.equal(refusedBy(pause, ['--by', 'a', '--by', 'b']), `nemia pause takes --by once: a pause says one by. ${shape}.`);
  assert.equal(refusedBy(pause, ['now']), `nemia pause does not take now: ${shape}.`);
  assert.equal(refusedBy(pause, ['--why', 'merging by hand', '--by=ann']), null);
  assert.equal(refusedBy(pause, []), null);
  assert.equal(refusedBy(pause, ['--now', '--now=yes']), `nemia pause does not take --now=yes: ${shape}.`);
  assert.equal(refusedBy(pause, ['--now', '--yes', '--why', 'the bill']), null);
  assert.equal(refusedBy(entry('resume'), ['--all']), 'nemia resume takes no --all: it resumes the store, whoever paused it.');
  assert.equal(refusedBy(entry('resume'), []), null);
});

test("REFUSED at shipped defaults: nemia tick's, nemia up's and nemia watch's arguments, in today's words whole", () => {
  assert.equal(
    refusedBy(entry('tick'), ['--bogus']),
    'nemia tick takes no --bogus: nemia tick runs one pass, and nemia tick --stats says after it what the pass cost.',
  );
  assert.equal(refusedBy(entry('tick'), ['--stats']), null);
  const up = entry('up');
  for (const argv of [
    ['--stats', '20'],
    ['20', '--stats'],
  ])
    assert.equal(
      refusedBy(up, argv),
      'nemia up --stats reads what the last pass cost and ticks nothing, so it takes no 20: nemia up --stats alone, or nemia up 20 to tick.',
    );
  assert.match(
    refusedBy(up, ['soon']) ?? '',
    /^nemia up takes its pass interval in whole milliseconds, from 1 to \d+, and "soon" is not one: /,
  );
  assert.match(
    refusedBy(up, ['--x']) ?? '',
    /^nemia up takes its pass interval in whole milliseconds, from 1 to \d+, and "--x" is not one: /,
  );
  assert.equal(refusedBy(up, ['10', '20']), 'nemia up takes one pass interval at most, and was given 20 too: nemia up [ms].');
  assert.equal(refusedBy(up, ['10']), null);
  const cursor =
    'nemia watch takes one cursor at most, a whole number of bytes — 0, or the number a `cursor:` line printed: nemia watch [cursor]';
  for (const argv of [['x'], ['1', '2'], ['--from']]) assert.equal(refusedBy(entry('watch'), argv), cursor, argv.join(' '));
  assert.equal(refusedBy(entry('watch'), ['12']), null);
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

test('a table breaks its rules: a name in a route’s path that no argument of its spec takes', () => {
  const route = { method: 'PUT', path: '/api/cards/:name', status: 200 } as const;
  assert.deepEqual(commandBreaks([{ name: 'a', route, spec: CARD, handler }], []), []);
  assert.deepEqual(commandBreaks([{ name: 'a', route: { ...route, path: '/api/cards/:card' }, spec: CARD, handler }], []), [
    "a's route PUT /api/cards/:card names :card, which no argument of its spec takes: key a positional card",
  ]);
});

test('a table breaks its rules: a why left empty, of a route served by hand, of a side alone, of a flag one side alone takes', () => {
  const route = { method: 'POST', path: '/api/x', status: 201, hand: 'it answers a Location' } as const;
  assert.deepEqual(commandBreaks([{ name: 'a', route, handler }], []), []);
  assert.deepEqual(commandBreaks([{ name: 'a', route: { ...route, hand: ' ' }, handler }], []), [
    "a's route POST /api/x is served by hand and says no why: say why the table does not generate it",
  ]);
  assert.deepEqual(commandBreaks([{ name: 'a', only: { side: 'cli', why: '' }, handler }], []), [
    'a is served on the cli alone and says no why: say why',
  ]);
  const put = { method: 'PUT', path: '/api/cards/:name', status: 200 } as const;
  const said = { ...CARD, flags: [{ ...CARD.flags[0], only: { side: 'cli', why: '' } } as const, CARD.flags[1]] };
  assert.deepEqual(commandBreaks([{ name: 'a', route: put, spec: said, handler }], []), [
    "a's --file is taken on the cli alone and says no why: say why",
  ]);
});

test('a table breaks its rules: a flag the api alone takes on an entry the table generates no route of', () => {
  const put = { method: 'PUT', path: '/api/cards/:name', status: 200 } as const;
  assert.deepEqual(commandBreaks([{ name: 'a', route: put, spec: CARD, handler }], []), []);
  const broken = ["a's --words is taken on the api alone, and the table generates no route of it: route it, or take the flag out"];
  assert.deepEqual(commandBreaks([{ name: 'a', route: { ...put, hand: 'by hand' }, spec: CARD, handler }], []), broken);
  assert.deepEqual(
    commandBreaks([{ name: 'a', route: { method: 'GET', path: '/api/cards/:name', status: 200 }, spec: CARD, handler }], []),
    broken,
  );
});

test('a table breaks its rules on each of an entry’s routes: one routed on another’s path, and a key one of them sets that no flag fills', () => {
  const routes = [
    { method: 'POST', path: '/api/x', status: 200 },
    { method: 'DELETE', path: '/api/x', status: 200, sets: { off: true } },
  ] as const;
  assert.deepEqual(commandBreaks([{ name: 'a', route: routes, spec: HOLDING, handler }], []), []);
  assert.deepEqual(
    commandBreaks(
      [
        { name: 'a', route: routes, spec: HOLDING, handler },
        { name: 'b', route: { method: 'DELETE', path: '/api/x', status: 200 }, handler },
      ],
      [],
    ),
    ['b is routed on DELETE /api/x, as a is: give it a path of its own'],
  );
  assert.deepEqual(commandBreaks([{ name: 'a', route: routes, spec: SPEC, handler }], []), [
    "a's route sets off, which no flag of its spec fills: name a key the command reads",
  ]);
});

test('a command line refuses a flag the api alone takes, as one the command does not take, and reads one the CLI alone takes', () => {
  assert.equal(refusalOf(['x', '--words', 'hi'], CARD), 'UNKNOWN --words');
  assert.equal(refusalOf(['x', '--words=hi'], CARD), 'UNKNOWN --words=hi');
  assert.deepEqual(parseArgv(CARD, ['x', '--file', 'f.md']), { name: 'x', file: 'f.md' });
});
