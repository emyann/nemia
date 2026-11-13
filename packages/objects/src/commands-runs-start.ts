/**
 * The words of `nemia start`: a run of a workflow, named by its name, from a brief in words or a file's text, or of an inbox card by its
 * name. A plan folder and a workflow given as a path are the client's to refuse, naming the start by name. Pure.
 */
import type { CommandWords, Flag, Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';

/** Why a value flag of `nemia start` is taken once, as its refusal says it. */
const ONCE: Readonly<Record<string, string>> = {
  '--workflows': 'works on one workflow',
  '--brief': 'is asked one thing',
  '--repo': 'works on one repository',
  '--factory': 'is started in one factory',
};

/** One of `nemia start`'s value flags: taken once, unless `many`; `cli`, why the api does not take it as typed, where it does not. */
function startFlag(flag: string, key: string, takes: string, how: { many?: true; cli?: string } = {}): Flag {
  return {
    flag,
    kind: 'text',
    key,
    takes: `${flag} takes ${takes}`,
    ...(how.many ? { many: true } : { twice: `nemia start takes ${flag} once: a run ${ONCE[flag]}.` }),
    ...(how.cli !== undefined ? { only: { side: 'cli', why: how.cli } } : {}),
  };
}

/** `nemia start`'s spec: the brief, then its flags, each value flag also as `--flag=<value>`. */
const START_SPEC: Spec = {
  positionals: [{ key: 'brief', takes: 'required', kind: 'text' }],
  flags: [
    startFlag(
      '--workflows',
      'workflows',
      'the name of the workflow the run is of, as its factory offers it: nemia start <brief> --workflows <name>',
    ),
    startFlag('--repo', 'repo', 'a repository, to find the factory the run is started in: nemia start <brief> --repo <r>'),
    startFlag('--after', 'after', 'the run this one waits on, by its id: nemia start <brief> --after <runId> [--after <runId> ...]', {
      many: true,
    }),
    startFlag(
      '--from',
      'context',
      'a run this one is handed as context, by its id, never waited on: nemia start <brief> --from <runId> [--from <runId> ...]',
      { many: true },
    ),
    startFlag('--input', 'inputs', "a file to hand the run's steps: nemia start <brief> --input <file> [--input <file> ...]", {
      many: true,
      cli: 'a file is read from where nemia start is typed, and the api is sent its bytes by name, never a path',
    }),
    startFlag(
      '--card',
      'cards',
      "an inbox card to hand the run's steps, by its name, copied as it reads now: nemia start <brief> --card <name> [--card <name> ...]",
      { many: true },
    ),
    startFlag(
      '--gate',
      'gates',
      'the step whose closeout waits for a person before anything after it is filed: nemia start <brief> --gate <step> [--gate <step> ...]',
      { many: true },
    ),
    startFlag(
      '--model',
      'models',
      "a step's model in this run alone, its other steps and every other run keeping their agents': nemia start <brief> --model <step>=<model> [--model <step>=<model> ...]",
      { many: true },
    ),
    startFlag(
      '--label',
      'label',
      'a label the run is created with, key=value to set one or key- to drop one it would inherit: nemia start <brief> --label team=core [--label <edit> ...]',
      { many: true },
    ),
    startFlag(
      '--brief',
      'instead',
      'what the run is asked to do in place of an inbox card\'s body, as text or a file: nemia start <card> --brief "<brief>"',
    ),
    startFlag(
      '--factory',
      'factory',
      "the factory the run is started in, whose hires fill the workflow's steps; without it, the one whose repository holds --repo: nemia start <brief> --factory <name>",
    ),
    { flag: '--no-worktree', kind: 'switch', key: 'noWorktree' },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia start does not take ${arg}. It takes the brief, then --workflows <name>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --from <runId> once per run to read as context; --input <file> once per file to hand its steps; --card <name> once per inbox card to hand its steps; --gate <step> once per step to gate; --model <step>=<model> once per step to run on another model; --label key=value (or key-) once per label; --factory <name>; and, for an inbox card, --brief "<brief>".`
      : `nemia start takes one brief, and ${arg} is a second. Quote a brief with spaces — nemia start "<brief>" — or give it as a file: nemia start ./brief.md.`,
  apart: (_value, flag) => START_SPEC.flags.find((f) => f.flag === flag)?.takes ?? '',
};

/** `nemia start`'s usage, as the help lists it. */
const START_USAGE =
  '<brief.md|card|"text"> --workflows <name> [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--card <name> ...] [--gate <step> ...] [--model <step>=<model> ...] [--factory <name>] [--brief "<brief>"]';

/** `nemia start`: a run of a workflow, by its name, from a brief, a file's text or an inbox card. */
export const START_WORDS = {
  name: 'start',
  served: [{ endpoint: 'runs.create' }, { endpoint: 'cards.start', as: 'inbox_start' }],
  usage: START_USAGE,
  help: [
    'start a run of a workflow from a brief, a text, or a card of the inbox',
    '--workflows <name>: the workflow, by its name, as its factory offers',
    "it (nemia workflows lists them); a card's own workflow: where it names",
    'one. A path to a workflow folder, and a folder of cards, are refused:',
    'file each card (nemia inbox add <card>) and start it by its name',
    '--after <runId>: file nothing of this run until nemia decide says that',
    'run has landed — finished, and its result branch on the base',
    'branch — and start from the base as it is then; once per run.',
    '--from <runId>: hand this run what that run concluded, as context,',
    'and wait on nothing: landed or still in flight, it is read once,',
    "when this run's steps are filed, and said not landed, not judged",
    'until it has landed; once per run.',
    "--gate <step>: that step's closeout waits for nemia approve before",
    "anything after it is filed, as a step's own gate: true does; once",
    "per step. An inbox card's gate: <step> is one more",
    '--model <step>=<model>: that step runs on the model in this run alone;',
    "its other steps, and every other run, keep their agents' models. Once",
    "per step, over an inbox card's model: for the same step. Refused, naming",
    "the models that keep it, where the step's harness refuses the model or",
    'its permission mode is dropped on it',
    'a file that opens with a frontmatter block of workflow: and after: starts',
    'its body, on its workflow: unless --workflows is given; its after: needs',
    'an --after for each. Any other key is refused by its name, never taken',
    'as the brief: file an inbox card with nemia inbox add <file>',
    "--input <file>: copied into the run's own inputs/ directory, and named",
    "on every step's brief under what was asked for; once per file",
    '--card <name>: an inbox card, as nemia inbox lists it, copied as it',
    "reads now into the run's inputs/cards/<name>.md and named on every",
    "step's brief beside the files; once per card. A name with no card is",
    'refused before anything is written',
    '--factory <name>: the workflow must be attached to the factory, whose',
    'hires fill its steps, and a step left with no agent is refused (nemia',
    'factory --help). Without it, the run is started in the factory whose',
    "repository holds --repo, else the daemon's own repository, when one",
    'factory alone does; none, or two, is refused, naming the fix. In a',
    'factory the run works on the repository it names for the workflow',
    '(nemia factory attach <factory> <workflow> --repo <name>), else its',
    'only one: --repo only finds the factory, and the start says so where',
    'it differs',
    'The default factory is history only: --factory default is refused',
    'a card of the inbox (nemia inbox --help), by its name, starts its body,',
    'or --brief "<brief>" in its place, and stays in the inbox, listed as',
    'started: --workflows, a name, is its workflow: unless given, --factory',
    'its factory:, and a card that names no factory either way is refused;',
    '--repo is refused: its factory places the run',
  ],
  spec: START_SPEC,
  check: (args) => leftOut(START_SPEC, args),
  writes: true,
  ticks: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `create` of `objects`' Api, calling this handler with the folder it found" },
} as const satisfies CommandWords;
