/**
 * The commands that start work, the inbox's, the factories', `nemia agents custom`, and `nemia pause` and `nemia resume`, as entries of the
 * table: a flag none of them takes is refused in the command's own words, before anything is read or written — where its required arguments
 * stand, as the argument left out by a command that says its refusal of one (`missing`) but for one that refuses the flag first
 * (`flagFirst`), and after them as the flag it does not take; a word `nemia inbox` or `nemia factory` has no command of is refused, and
 * their `--help` prints their own help.
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';

const ROOT = scratch('wf-stray-flags-');
process.env.WF_ROOT = ROOT;
const { main } = await import('../src/cli/main.ts');
const { FACTORY_HELP } = await import('../src/factory/factory.verb.ts');
const { INBOX_HELP } = await import('../src/inbox/commands.verb.ts');
const { PLAN_HELP } = await import('../src/start/commands.verb.ts');

/** No command here reaches the engine: each is refused, or prints its help, before anything is read. */
const NO_ENGINE = promised({});

const INBOX_SAYS =
  'It lists the inbox — nemia inbox — files a card with nemia inbox add "<idea>", queues one with nemia inbox queue <name>, and drops one with ' +
  'nemia inbox rm <name> (nemia inbox --help).';
const FACTORY_SAYS =
  'It lists the factories — nemia factory ls — files one with nemia factory add <name> --repo <path>, attaches a workflow with ' +
  'nemia factory attach <factory> <workflow>, detaches it with nemia factory detach <factory> <workflow>, hires an agent into a step with ' +
  'nemia factory hire <factory> <agent> --step <workflow>/<step>, fires it with nemia factory fire <factory> --step <workflow>/<step>, ' +
  "schedules a workflow's runs with nemia factory schedule <factory> <workflow> --cron <expr> --brief <text>, takes the schedule back " +
  'with nemia factory unschedule <factory> <workflow>, ' +
  'writes the rules its agents are told with nemia factory rules <name> --file <path>, ' +
  "says where Nemia's instruction for it is kept with nemia factory instruction <name>, writes it with nemia factory instruct <name> --file <path>, " +
  'and removes one with nemia factory rm <name> (nemia factory --help).';
const START_SAYS =
  'It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --from <runId> once per run to read as context; --input <file> ' +
  'once per file to hand its steps; --gate <step> once per step to gate; --factory <name>; and, for an inbox card, --brief "<brief>".';

/** Each command, the words that fill its required arguments, and what it says of a flag it does not take. */
const REFUSALS: Array<[string[], string[], string]> = [
  [['start'], ['build it'], `nemia start does not take --nope. ${START_SAYS}`],
  [['plan'], ['./plan'], 'nemia plan does not take --nope. It takes the plan folder, then --repo <r> and --factory <name>.'],
  [['inbox'], [], `nemia inbox does not take --nope. ${INBOX_SAYS}`],
  [
    ['inbox', 'add'],
    ['an idea'],
    'nemia inbox add does not take --nope. It takes the idea, then --workflow <name>, --repo <path> and --factory <name>.',
  ],
  [
    ['inbox', 'queue'],
    ['card'],
    "nemia inbox queue does not take --nope. It takes the card's name, then --workflow <w>, or --off to take the card back.",
  ],
  [['inbox', 'rm'], ['card'], 'nemia inbox rm drops one card, and --nope is a second: nemia inbox rm <name>, once per card.'],
  [['factory'], [], `nemia factory does not take --nope. ${FACTORY_SAYS}`],
  [['factory', 'ls'], [], 'nemia factory ls takes nothing, and was given --nope: nemia factory ls lists every factory.'],
  [
    ['factory', 'add'],
    ['f'],
    "nemia factory add does not take --nope. It takes the factory's name, then --repo <path>, once per repository.",
  ],
  [
    ['factory', 'attach'],
    ['f', 'w'],
    'nemia factory attach does not take --nope. It takes the factory, then the workflow: nemia factory attach <factory> <workflow>.',
  ],
  [
    ['factory', 'detach'],
    ['f', 'w'],
    'nemia factory detach does not take --nope. It takes the factory, then the workflow: nemia factory detach <factory> <workflow>.',
  ],
  [['factory', 'hire'], ['f', 'a'], 'nemia factory hire does not take --nope. It takes <factory> <agent>, then --step <workflow>/<step>.'],
  [['factory', 'fire'], ['f'], 'nemia factory fire does not take --nope. It takes <factory>, then --step <workflow>/<step>.'],
  [
    ['factory', 'rules'],
    ['f'],
    "nemia factory rules takes one factory's name, then --file <path> (or --file - for stdin) or --clear, not --nope.",
  ],
  [
    ['factory', 'instruction'],
    ['f'],
    "nemia factory instruction takes one factory's name, then --path <path>, --store or --clear, not --nope: nemia factory instruction <name> [--path <path> | --store | --clear].",
  ],
  [
    ['factory', 'instruct'],
    ['f'],
    "nemia factory instruct takes one factory's name, then --file <path> (or --file - for stdin) or --clear, not --nope.",
  ],
  [['factory', 'rm'], ['f'], 'nemia factory rm removes one factory, and --nope is a second: nemia factory rm <name>, once per factory.'],
  [
    ['agents', 'custom'],
    ['scribe'],
    "nemia agents custom takes one agent's name, then --file <path> (or --file - for stdin), --clear or --repo <r>, not --nope.",
  ],
  [['pause'], [], 'nemia pause does not take --nope: nemia pause [--why "<words>"] [--by <name>] [--now [--yes]].'],
  [['resume'], [], 'nemia resume takes no --nope: it resumes the store, whoever paused it.'],
];

/**
 * What each command that says its own refusal of a required argument left out says of a flag where that argument stands: the argument
 * left out, before the flag is looked at. The others, and `nemia factory attach` and `detach`, which refuse the flag first (`flagFirst`),
 * say there what they say of the flag after their arguments.
 */
const MISSING: Readonly<Record<string, string>> = {
  'inbox add':
    'nemia inbox add takes the idea, first: nemia inbox add "<idea>" [--workflow <name>] [--repo <path>] [--factory <name>], or a file: ' +
    'nemia inbox add ./idea.md. Nothing was filed.',
  'inbox queue':
    'nemia inbox queue takes the name of the card to queue, as nemia inbox lists it: nemia inbox queue <name> [--workflow <w>] [--off].',
  'inbox rm': 'nemia inbox rm takes the name of the card to drop, as nemia inbox lists it: nemia inbox rm <name>.',
  'factory add':
    "nemia factory add takes the factory's name, first: nemia factory add <name> --repo <path> [--repo <path> ...]. Nothing was filed.",
  'factory hire':
    'nemia factory hire takes the factory, then the agent: nemia factory hire <factory> <agent> --step <workflow>/<step>. Nothing was hired.',
  'factory fire': 'nemia factory fire takes the factory first: nemia factory fire <factory> --step <workflow>/<step>. Nothing was fired.',
  'factory rules': "nemia factory rules takes the factory's name: nemia factory rules <name> [--file <path>|- | --clear].",
  'factory instruction':
    "nemia factory instruction takes the factory's name: nemia factory instruction <name> [--path <path> | --store | --clear].",
  'factory instruct': "nemia factory instruct takes the factory's name: nemia factory instruct <name> --file <path>|- or --clear.",
  'factory rm': 'nemia factory rm takes the name of the factory to remove, as nemia factory ls lists it: nemia factory rm <name>.',
};

/** `main` on `argv`, refused: its words and its exit code. */
async function refusalOf(argv: string[]): Promise<{ message: string; exitCode?: number }> {
  try {
    await main(argv, NO_ENGINE);
  } catch (err) {
    return { message: (err as Error).message, exitCode: (err as { exitCode?: number }).exitCode };
  }
  return assert.fail(`nemia ${argv.join(' ')} was not refused`);
}

test('REFUSED at shipped defaults: a flag the command does not take, where its required arguments stand and after them', async () => {
  for (const [command, required, message] of REFUSALS) {
    const where = required.length > 0 ? (MISSING[command.join(' ')] ?? message) : message;
    assert.deepEqual(await refusalOf([...command, '--nope']), { message: where, exitCode: 2 }, `nemia ${command.join(' ')} --nope`);
    const after = [...command, ...required, '--nope'];
    assert.deepEqual(await refusalOf(after), { message, exitCode: 2 }, `nemia ${after.join(' ')}`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'cordon')), false, 'the store not paused');
});

test('REFUSED at shipped defaults: a word nemia inbox or nemia factory has no command of', async () => {
  assert.deepEqual(await refusalOf(['inbox', 'frob']), { message: `nemia inbox does not take frob. ${INBOX_SAYS}`, exitCode: 2 });
  assert.deepEqual(await refusalOf(['factory', 'frob']), { message: `nemia factory does not take frob. ${FACTORY_SAYS}`, exitCode: 2 });
});

test('nemia inbox --help, nemia factory --help and nemia plan --help print their own help', async (t) => {
  for (const [argv, help] of [
    [['inbox', '--help'], INBOX_HELP],
    [['factory', '--help'], FACTORY_HELP],
    [['plan', '--help'], PLAN_HELP],
  ] as const) {
    const out: string[] = [];
    const log = t.mock.method(console, 'log', (...args: unknown[]) => {
      out.push(args.join(' '));
    });
    try {
      await main([...argv], NO_ENGINE);
    } finally {
      log.mock.restore();
    }
    assert.deepEqual(out, [help], `nemia ${argv.join(' ')}`);
  }
});
