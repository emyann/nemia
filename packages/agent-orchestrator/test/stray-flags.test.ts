/**
 * The commands that start work, the inbox's, the factories' and `wf agents custom`, as entries of the table: a flag none of them takes is
 * refused in the command's own words, before or after its required arguments, and before anything is read; a word `wf inbox` or
 * `wf factory` has no command of is refused, and their `--help` prints their own help.
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
    for (const argv of [
      [...command, '--nope'],
      [...command, ...required, '--nope'],
    ])
      assert.deepEqual(await refusalOf(argv), { message, exitCode: 2 }, `wf ${argv.join(' ')}`);
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
