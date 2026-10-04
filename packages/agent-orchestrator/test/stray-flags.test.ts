/**
 * The commands that start work, the inbox's, the factories' and `wf agents custom`, as entries of the table: a flag none of them takes is
 * refused in the command's own words, before anything is read — where its required arguments stand, as the argument left out by a command
 * that says its refusal of one (`missing`) but for one that refuses the flag first (`flagFirst`), and after them as the flag it does not
 * take; a word `wf inbox` or `wf factory` has no command of is refused, and their `--help` prints their own help.
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Engine } from 'agent-runtime';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-stray-flags-');
process.env.WF_ROOT = ROOT;
const { main } = await import('../src/cli/main.ts');
const { FACTORY_HELP } = await import('../src/factory/factory.verb.ts');
const { INBOX_HELP } = await import('../src/inbox/commands.verb.ts');
const { PLAN_HELP } = await import('../src/start/commands.verb.ts');

/** No command here reaches the engine: each is refused, or prints its help, before anything is read. */
const NO_ENGINE = {} as Engine;

const INBOX_SAYS =
  'It lists the inbox — wf inbox — files a card with wf inbox add "<idea>", queues one with wf inbox queue <name>, and drops one with ' +
  'wf inbox rm <name> (wf inbox --help).';
const FACTORY_SAYS =
  'It lists the factories — wf factory ls — files one with wf factory add <name> --repo <path>, attaches a workflow with ' +
  'wf factory attach <factory> <workflow>, detaches it with wf factory detach <factory> <workflow>, hires an agent into a step with ' +
  'wf factory hire <factory> <agent> --step <workflow>/<step>, fires it with wf factory fire <factory> --step <workflow>/<step>, and ' +
  'removes one with wf factory rm <name> (wf factory --help).';
const START_SAYS =
  'It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --input <file> ' +
  'once per file to hand its steps; --gate <step> once per step to gate; --factory <name>; and, for an inbox card, --brief "<brief>".';

/** Each command, the words that fill its required arguments, and what it says of a flag it does not take. */
const REFUSALS: Array<[string[], string[], string]> = [
  [['start'], ['build it'], `wf start does not take --nope. ${START_SAYS}`],
  [['plan'], ['./plan'], 'wf plan does not take --nope. It takes the plan folder, then --repo <r> and --factory <name>.'],
  [['inbox'], [], `wf inbox does not take --nope. ${INBOX_SAYS}`],
  [
    ['inbox', 'add'],
    ['an idea'],
    'wf inbox add does not take --nope. It takes the idea, then --workflow <name>, --repo <path> and --factory <name>.',
  ],
  [
    ['inbox', 'queue'],
    ['card'],
    "wf inbox queue does not take --nope. It takes the card's name, then --workflow <w>, or --off to take the card back.",
  ],
  [['inbox', 'rm'], ['card'], 'wf inbox rm drops one card, and --nope is a second: wf inbox rm <name>, once per card.'],
  [['factory'], [], `wf factory does not take --nope. ${FACTORY_SAYS}`],
  [['factory', 'ls'], [], 'wf factory ls takes nothing, and was given --nope: wf factory ls lists every factory.'],
  [['factory', 'add'], ['f'], "wf factory add does not take --nope. It takes the factory's name, then --repo <path>, once per repository."],
  [
    ['factory', 'attach'],
    ['f', 'w'],
    'wf factory attach does not take --nope. It takes the factory, then the workflow: wf factory attach <factory> <workflow>.',
  ],
  [
    ['factory', 'detach'],
    ['f', 'w'],
    'wf factory detach does not take --nope. It takes the factory, then the workflow: wf factory detach <factory> <workflow>.',
  ],
  [['factory', 'hire'], ['f', 'a'], 'wf factory hire does not take --nope. It takes <factory> <agent>, then --step <workflow>/<step>.'],
  [['factory', 'fire'], ['f'], 'wf factory fire does not take --nope. It takes <factory>, then --step <workflow>/<step>.'],
  [['factory', 'rm'], ['f'], 'wf factory rm removes one factory, and --nope is a second: wf factory rm <name>, once per factory.'],
  [
    ['agents', 'custom'],
    ['scribe'],
    "wf agents custom takes one agent's name, then --file <path> (or --file - for stdin), --clear or --repo <r>, not --nope.",
  ],
];

/**
 * What each command that says its own refusal of a required argument left out says of a flag where that argument stands: the argument
 * left out, before the flag is looked at. The others, and `wf factory attach` and `detach`, which refuse the flag first (`flagFirst`), say
 * there what they say of the flag after their arguments.
 */
const MISSING: Readonly<Record<string, string>> = {
  'inbox add':
    'wf inbox add takes the idea, first: wf inbox add "<idea>" [--workflow <name>] [--repo <path>] [--factory <name>], or a file: ' +
    'wf inbox add ./idea.md. Nothing was filed.',
  'inbox queue':
    'wf inbox queue takes the name of the card to queue, as wf inbox lists it: wf inbox queue <name> [--workflow <w>] [--off].',
  'inbox rm': 'wf inbox rm takes the name of the card to drop, as wf inbox lists it: wf inbox rm <name>.',
  'factory add':
    "wf factory add takes the factory's name, first: wf factory add <name> --repo <path> [--repo <path> ...]. Nothing was filed.",
  'factory hire':
    'wf factory hire takes the factory, then the agent: wf factory hire <factory> <agent> --step <workflow>/<step>. Nothing was hired.',
  'factory fire': 'wf factory fire takes the factory first: wf factory fire <factory> --step <workflow>/<step>. Nothing was fired.',
  'factory rm': 'wf factory rm takes the name of the factory to remove, as wf factory ls lists it: wf factory rm <name>.',
};

/** `main` on `argv`, refused: its words and its exit code. */
async function refusalOf(argv: string[]): Promise<{ message: string; exitCode?: number }> {
  try {
    await main(argv, NO_ENGINE);
  } catch (err) {
    return { message: (err as Error).message, exitCode: (err as { exitCode?: number }).exitCode };
  }
  return assert.fail(`wf ${argv.join(' ')} was not refused`);
}

test('REFUSED at shipped defaults: a flag the command does not take, where its required arguments stand and after them', async () => {
  for (const [command, required, message] of REFUSALS) {
    const where = required.length > 0 ? (MISSING[command.join(' ')] ?? message) : message;
    assert.deepEqual(await refusalOf([...command, '--nope']), { message: where, exitCode: 2 }, `wf ${command.join(' ')} --nope`);
    const after = [...command, ...required, '--nope'];
    assert.deepEqual(await refusalOf(after), { message, exitCode: 2 }, `wf ${after.join(' ')}`);
  }
});

test('REFUSED at shipped defaults: a word wf inbox or wf factory has no command of', async () => {
  assert.deepEqual(await refusalOf(['inbox', 'frob']), { message: `wf inbox does not take frob. ${INBOX_SAYS}`, exitCode: 2 });
  assert.deepEqual(await refusalOf(['factory', 'frob']), { message: `wf factory does not take frob. ${FACTORY_SAYS}`, exitCode: 2 });
});

test('wf inbox --help, wf factory --help and wf plan --help print their own help', async (t) => {
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
    assert.deepEqual(out, [help], `wf ${argv.join(' ')}`);
  }
});
