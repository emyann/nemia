/**
 * What the CLI's verbs and runners share: the help, a verb's shape, how a program is given its place, a usage refusal, a person's yes.
 */
import readline from 'node:readline/promises';
import { Effect } from 'effect';
import { CLI_VERBS, Invalid, PlaceService, TABLE, helpOf, type engine, type Place } from '../runner.ts';

/** The engine the verbs talk to: the board under `WF_ROOT`, unless a test hands one of its own. */
export type Engine = ReturnType<typeof engine>;

/** `program` given `place`, and still to be run: how a command gives its program the place `main` was handed. */
export const placedIn = <A, E, R>(place: Place, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, PlaceService>> =>
  Effect.provide(program, PlaceService.layer(place));

/** A verb: it takes what follows it on the command line, the engine and the place, and prints what it did, or throws a refusal. */
export type Verb = (rest: string[], e: Engine, place: Place) => void | Promise<void>;

/** What `wf`, the alias of `nemia`, prints on stderr before it runs the command it is given, one line naming what to type next. */
export const WF_HINT = 'wf is now nemia: type `nemia <args>`; wf stays an alias until a later release removes it.';

/** What `nemia` prints for no verb, for a verb it does not know, and for a verb given too little to act on. */
export const HELP = `nemia — run a workflow of agent steps

${helpOf(TABLE)}
${helpOf(CLI_VERBS)}

A workflow is a folder of markdown files. One file is one step:

    ---
    harness: codex        # claude (default) | codex | claude-detached
    after: implement      # what must finish first: verified, or unverified if it has no check
    output: review.json   # what its closeout declares for a later step: a JSON Schema beside it
    loop: implement       # again: true in its closeout runs implement again, then this step
    rounds: 3             # at most this many rounds (3 unless set), then a person decides
    ---
    Review the change in this workspace as a second engineer would.

No key is control flow: \`after\` orders, \`resume\` continues, \`check\` measures, \`retries\` counts the
tries the run may re-file a step its check refused, \`gate\` holds a step's handoff for a person's nemia approve,
\`denials\` holds one whose try the harness denied a call, \`output\` declares what a closeout says for a later step and \`input\` reads it, \`loop\` is the edge back
and \`rounds\` counts it — whether to go round is the step's own \`again\` — and the rest (model, effort,
permissionMode on Claude Code, sandbox on Codex, tools, disallowedTools, allowedTools, background, remote, deadlineSeconds, budget) say who does the work, with
what, who may drive it, for how long and for how much. Everything else the agent is told is prose.

  nemia ls says what the run established: verified ✓ · checking · failed ✗ check (exit N)
  · unverified (no check: declared) · unsigned (ended without its closeout, or without a field its
  output: declares) · BLOCKED · rounds exhausted (asked for another round on the last)
  · over budget $4.20 of $3 (its tries have cost their budget: or more, and nothing more is filed for
  it on the run's word) · budget exhausted (its harness ended its session at its budget:)
  · denied (its harness denied its try a call, and the step says denials: fail: nothing after it is filed)
  · awaiting approval (at its gate: nothing after it is filed until nemia approve — and, on an ending step
  that runs in the repository's checkout, nothing of it at all until then).

  → to decide names a run at its result that nobody has decided: its ending step's gate, in the folder's
  words, with the nemia approve that runs it — or, in a folder with no ending step, its branch ahead of the
  base branch with nothing having merged it.

  WF_ROOT            where runs and the engine's board live, an absolute path (default ~/.agent-workflows)
  WF_MAX_CONCURRENT  sessions at work per pool at once, a whole number from 1 (default 2): claude and
                     claude-detached one pool, codex and checks their own; a blocked session holds no
                     slot; one run's review competes with another run's implement
  WF_MAX_RUNS        runs in flight at once (unset or 0: no cap): a run with nothing filed waits for a
                     slot, oldest first; a run waiting on --after counts once it is filed; a run of a
                     one-step workflow that says slot: none is not counted and never waits for one

nemia watch follows what the workflow decides: a step at its gate, one blocked, a run waiting on another,
done. To follow what the engine does under it — each attempt started, ended, settled — use the engine:
a run's task ids carry the run and the step, so its output already names the work. Point it at this board:

    AE_ROOT="\${WF_ROOT:-$HOME/.agent-workflows}/engine" ae watch`;

export const usage = (message: string): never => {
  throw new Invalid({ message });
};

/** A person's yes, asked on the terminal: false with no terminal to ask on, and for anything but y or yes. */
export async function confirmed(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}
