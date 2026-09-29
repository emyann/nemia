/**
 * The verbs that start work — `wf start`, `wf plan` and `wf inbox` — as their flags and help: what each takes, read off the command line.
 */
import { usage, readFlags } from './flags.ts';

export const PLAN_HELP = `wf plan <folder> [--repo .]

Start a plan: one run per card in the folder, parents first, each waiting on the runs of the cards it names.
That is the record wf start --after writes, so the tick files a card's run once its parents have shipped, and
every card is a decision at its own wf decide. Nothing else is written: the runs and their after are the plan.
It prints a line per card: the card, its run, its workflow, and what it waits on.

A card is one markdown file, <card>.md, and README.md beside the cards says what the plan is for:

    ---
    workflow: dev     # a workflow under <repo>/workflows/, or a path from the plan folder
    after: b, c       # the cards whose runs ship first; without it, the card starts at once
    ---
    Put the flag on the settings page, now that it is parsed and stored.

The body is the run's brief. Refused by name before any run is started: a key a card does not have, a card
with no workflow: or an empty body, an after: naming a card the folder does not have, cards that wait on
each other, a file that is not .md, a folder with no card, and a card whose workflow does not load.

The folder says what --after, --workflows and --no-worktree would, and wf plan refuses them. A wf start that
refuses part-way stops the plan: the runs it started stand, and it prints a wf start for each card left.`;

export const INBOX_HELP = `wf inbox
wf inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>]
wf inbox queue <name> [--workflow <w>] [--off]
wf inbox rm <name>

An inbox is cards before they are started: \${WF_ROOT:-~/.agent-workflows}/inbox/, one <name>.md per card, beside
runs/. A card is a plan's card with two differences — its keys optional, and no after:, since what it waits on
is said at start:

    ---
    workflow: dev              # what runs it, chosen at start when the card does not say
    repo: /home/me/code/app    # the repository it is about, as an absolute path
    queued: 2026-09-16T10:00:00.000Z   # when it was queued to start on its own: wf inbox queue writes it
    gate: plan                 # the step whose closeout waits for wf approve in the run it starts
    ---
    Cache the engine's views between passes.

  wf inbox       lists each card: its name, the first line of its body, its workflow and repo when set, and
                 started as <runId> for a card a run's record says it was started as — a card whose removal failed.
                 An entry that does not read as a card is listed with why.
  wf inbox add   files an idea, text or a file, named with the slug a run id makes of its first line, suffix and
                 all; --workflow and --repo write the keys, over a file's own.
  wf inbox queue marks a card to start on its own: each pass, once every run has been advanced and a run slot is
                 free (WF_MAX_RUNS; always, with no cap), the tick starts the oldest queued card, one per pass, on its
                 workflow: and its repo: or the directory wf up runs in. --workflow writes the key too; --off, or
                 wf inbox rm, takes the card back. wf inbox says queued and its place; a start the package refused
                 is said there and on wf up's line, and the card is not tried again until it is edited or queued again
                 (or, naming no repo:, wf up runs in another repository); a start that failed otherwise is said once,
                 and tried again on the next pass.
  wf inbox rm    drops a card without starting it. A name with no card says so, and which cards there are.

Refused by name: a key a card does not have, a key set to nothing, a repo: that is not an absolute path to a
directory, a queued: that is not a time or is on a card with no workflow:, a gate: naming more than one step or
saying true — and, at start, one naming no step of the workflow — an add with no idea, and a name that would
leave the folder; and a queue of a name with no card, of a card with no workflow and no --workflow, of one
already queued, and of one a run was started from.`;

type StartHow = { workflows?: string; repo?: string; isolate: boolean; after: string[]; inputs: string[]; gates: string[]; brief?: string };

/** What each of `wf start`'s value flags takes, as its refusal says it. */
const START_TAKES = {
  '--workflows': 'the workflow folder: wf start <brief> --workflows <dir>',
  '--repo': 'the repository the run works on: wf start <brief> --repo <r>',
  '--after': 'the run this one waits on, by its id: wf start <brief> --after <runId> [--after <runId> ...]',
  '--input': "a file to hand the run's steps: wf start <brief> --input <file> [--input <file> ...]",
  '--gate':
    'the step whose closeout waits for a person before anything after it is filed: wf start <brief> --gate <step> [--gate <step> ...]',
  '--brief':
    'what the run is asked to do in place of an inbox card\'s body, as text or a file: wf start <inbox>/<name>.md --brief "<brief>"',
} as const;

/**
 * `wf start`'s flags, after the brief: `--workflows <dir>`, `--repo <r>`, `--after <runId>` as often as there are runs to wait on, `--input <file>`
 * as often as there are files to hand its steps, `--gate <step>` as often as there are steps to gate, and `--no-worktree`.
 */
export function startHow(argv: string[]): StartHow {
  const { values, switches } = readFlags(argv, {
    takes: START_TAKES,
    switches: ['--no-worktree'],
    repeats: ['--after', '--input', '--gate'],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf start does not take ${arg}. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --input <file> once per file to hand its steps; --gate <step> once per step to gate; and, for an inbox card, --brief "<brief>".`
        : `wf start takes one brief, and ${arg} is a second. Quote a brief with spaces — wf start "<brief>" — or give it as a file: wf start ./brief.md.`,
    twice: (flag) =>
      `wf start takes ${flag} once: a run ${flag === '--brief' ? 'is asked one thing' : `works on one ${flag === '--repo' ? 'repository' : 'workflow'}`}.`,
  });
  return {
    workflows: values['--workflows']?.[0],
    repo: values['--repo']?.[0],
    isolate: !switches.length,
    after: values['--after'] ?? [],
    inputs: values['--input'] ?? [],
    gates: values['--gate'] ?? [],
    ...(values['--brief'] ? { brief: values['--brief'][0] } : {}),
  };
}

/**
 * `wf plan`'s one flag, after the folder: `--repo <r>`. `wf start`'s others are refused by name, each with why the folder says it instead;
 * and anything else, as `wf start` refuses it.
 */
export function planHow(argv: string[]): { repo?: string } {
  const { values } = readFlags(argv, {
    takes: { '--repo': 'the repository the plan works on: wf plan <folder> --repo <r>' },
    refuses: {
      '--after':
        'wf plan does not take --after: each card says what it waits on, in its after:, and the folder is the whole plan. To wait on a run already started, start the card by hand: wf start <card.md> --workflows <dir> --after <runId>.',
      '--workflows':
        'wf plan does not take --workflows: each card names its own, in its workflow: — a folder under <repo>/workflows/, or a path from the plan folder.',
      '--input':
        'wf plan does not take --input: a card has no input files of its own. Start that card by hand with its files: wf start <card.md> --workflows <dir> --input <file>.',
      '--gate':
        "wf plan does not take --gate: a plan's cards are gated by their workflows' own gate: true. To gate one card's run at a step, start that card by hand: wf start <card.md> --workflows <dir> --gate <step>.",
      '--no-worktree':
        'wf plan does not take --no-worktree: a card another waits on ships a result branch, and a run that works on its base branch has none, so every card after it would wait for ever.',
    },
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf plan does not take ${arg}. It takes the plan folder, then --repo <r>.`
        : `wf plan takes one folder, and ${arg} is a second. A plan is every card in one folder: wf plan <folder> --repo <r>.`,
    twice: () => 'wf plan takes --repo once: a plan works on one repository.',
  });
  return { repo: values['--repo']?.[0] };
}

/** `wf inbox queue`'s flags, after the card's name: `--workflow <w>` once, and `--off` — not both. */
export function inboxQueueHow(argv: string[]): { workflow?: string; off: boolean } {
  const { values, switches } = readFlags(argv, {
    takes: { '--workflow': 'the workflow the card starts on, by name or as a path: wf inbox queue <name> --workflow <w>' },
    switches: ['--off'],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf inbox queue does not take ${arg}. It takes the card's name, then --workflow <w>, or --off to take the card back.`
        : `wf inbox queue queues one card, and ${arg} is a second: wf inbox queue <name>, once per card.`,
    twice: () => 'wf inbox queue takes --workflow once: a card starts on one workflow.',
  });
  const workflow = values['--workflow']?.[0];
  if (switches.length && workflow !== undefined)
    usage('--off takes the card out of the queue, and --workflow writes what starts it: give one of them.');
  return { ...(workflow !== undefined ? { workflow } : {}), off: switches.length > 0 };
}

/** `wf inbox add`'s flags, after the idea: `--workflow <name>` and `--repo <path>`, once each. */
export function inboxAddHow(argv: string[]): { workflow?: string; repo?: string } {
  const { values } = readFlags(argv, {
    takes: {
      '--workflow': 'the workflow to start the card on, by name or as a path: wf inbox add "<idea>" --workflow <name>',
      '--repo': 'the repository the idea is about: wf inbox add "<idea>" --repo <path>',
    },
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf inbox add does not take ${arg}. It takes the idea, then --workflow <name> and --repo <path>.`
        : `wf inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — wf inbox add "<idea>" — or give it as a file: wf inbox add ./idea.md.`,
    twice: (flag) => `wf inbox add takes ${flag} once: a card names one ${flag === '--repo' ? 'repository' : 'workflow'}.`,
  });
  return { workflow: values['--workflow']?.[0], repo: values['--repo']?.[0] };
}
