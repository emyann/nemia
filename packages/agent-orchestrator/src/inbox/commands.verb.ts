/**
 * `wf inbox`, each of its forms an entry of the command table: the cards listed, an idea filed as one, a card queued to start on its own
 * or taken off the queue, and a card dropped. The api serves each: the list and the filing by routes of its own, which call these
 * handlers, the queue and the drop on the routes the table generates.
 */
import path from 'node:path';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { defaultStartsAllowed } from '../factory/factory.store.ts';
import { inboxDir } from '../record/files.store.ts';
import { Missing } from '../refusal/refusal.ts';
import { inboxLines, noCardLine, type InboxCard, type InboxListing } from './inbox.ts';
import { addToInbox, dropFromInbox, queueInInbox, readInbox, type InboxDropped, type InboxQueued } from './inbox.store.ts';

export const INBOX_HELP = `wf inbox
wf inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>]
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
    factory: pipao             # the factory it is started in (wf factory --help); required to start
    ---
    Cache the engine's views between passes.

  wf inbox       lists each card: its name, the first line of its body, its workflow and repo when set, and
                 started as <runId> for a card a run's record says it was started as — a card whose removal failed.
                 An entry that does not read as a card is listed with why.
  wf inbox add   files an idea, text or a file, named with the slug a run id makes of its first line, suffix and
                 all; --workflow, --repo and --factory write the keys, over a file's own.
  wf inbox queue marks a card to start on its own: each pass, once every run has been advanced and a run slot is
                 free (WF_MAX_RUNS; always, with no cap), the tick starts the oldest queued card, one per pass, on its
                 workflow:, in its factory:, on its repo:, else its factory's one repository, else the directory wf up
                 runs in. --workflow writes the key too; --off, or wf inbox rm, takes the card back. wf inbox says
                 queued and its place; a start the package refused is said there and on wf up's line, and the card is
                 not tried again until it is edited or queued again (or, with no repository named by the card or its
                 factory, wf up runs in another repository); a start that failed otherwise is said once, and tried
                 again on the next pass.
  wf inbox rm    drops a card without starting it. A name with no card says so, and which cards there are.

Refused by name: a key a card does not have, a key set to nothing, a repo: that is not an absolute path to a
directory, a queued: that is not a time or is on a card with no workflow:, a gate: naming more than one step or
saying true, a factory: that is not a factory's name — and, at start, a gate: naming no step of the workflow, a
card that names no factory and is started with no --factory, never one taken from its folder or its repo:, a
factory: the store does not have, default, or one that does not offer the workflow — an add with no idea, and a name that would
leave the folder; and a queue of a name with no card, of a card with no workflow and no --workflow, of one
already queued, and of one a run was started from.`;

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `wf inbox`: each card, a line each, and how to start, queue or drop one; or that the inbox is empty. */
export const INBOX: Command<{ cards: InboxListing[] }> = {
  name: 'inbox',
  usage: '',
  help: [
    'the cards parked before they are started: name, first line, workflow',
    'and repo when set, and started as <runId> (wf inbox --help)',
  ],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) =>
      `wf inbox does not take ${arg}. It lists the inbox — wf inbox — files a card with wf inbox add "<idea>", queues one with wf inbox queue <name>, and drops one with wf inbox rm <name> (wf inbox --help).`,
  },
  writes: false,
  route: { method: 'GET', path: '/api/inbox', status: 200 },
  manual: INBOX_HELP,
  handler: async () => ({ cards: readInbox() }),
  print: ({ cards }) =>
    cards.length
      ? [
          ...inboxLines(cards, defaultStartsAllowed()),
          `\nstart one: wf start ${path.join(inboxDir(), '<name>.md')} [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: wf inbox queue <name> — drop one: wf inbox rm <name>`,
        ]
      : [`the inbox is empty — park an idea with wf inbox add "<idea>"`],
};

/** What one of `wf inbox add`'s flags names, once per card. */
const ADD_NAMES: Readonly<Record<string, string>> = { '--workflow': 'workflow', '--repo': 'repository', '--factory': 'factory' };

/** One of `wf inbox add`'s value flags, keyed by its name, taking what `takes` says, once. */
const addFlag = (flag: string, takes: string): Flag => ({
  flag,
  kind: 'text',
  key: flag.slice(2),
  takes: `${flag} takes ${takes}`,
  twice: `wf inbox add takes ${flag} once: a card names one ${ADD_NAMES[flag]}.`,
});

/** `wf inbox add`'s spec: the idea, then `--workflow`, `--repo` and `--factory`, once each. */
const ADD_SPEC: Spec = {
  positionals: [{ key: 'idea', takes: 'required', kind: 'text' }],
  flags: [
    addFlag('--workflow', 'the workflow to start the card on, by name or as a path: wf inbox add "<idea>" --workflow <name>'),
    addFlag('--repo', 'the repository the idea is about: wf inbox add "<idea>" --repo <path>'),
    addFlag('--factory', 'the factory that processes the card: wf inbox add "<idea>" --factory <name>'),
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `wf inbox add does not take ${arg}. It takes the idea, then --workflow <name>, --repo <path> and --factory <name>.`
      : `wf inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — wf inbox add "<idea>" — or give it as a file: wf inbox add ./idea.md.`,
  apart: (_value, flag) => ADD_SPEC.flags.find((f) => f.flag === flag)?.takes ?? '',
  missing:
    'wf inbox add takes the idea, first: wf inbox add "<idea>" [--workflow <name>] [--repo <path>] [--factory <name>], or a file: wf inbox add ./idea.md. Nothing was filed.',
};

/**
 * `wf inbox add`: an idea filed as a card. Its handler is handed the idea's text under `idea`, and, for an idea read from a file, the file
 * under `from` and its folder under `dir`, the folder a workflow's path is read from: the CLI's runner reads the file, and the api's route
 * finds the workflow among the folders a start finds one in, so neither a path nor a file reaches the handler from a body.
 */
export const INBOX_ADD: Command<{ card: InboxCard; file: string }> = {
  name: 'inbox add',
  usage: '"<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>]',
  help: ['park an idea as a card in the inbox, named from its first line'],
  spec: ADD_SPEC,
  check: (args) => leftOut(ADD_SPEC, args),
  writes: true,
  route: {
    method: 'POST',
    path: '/api/inbox',
    status: 201,
    hand: 'its body names a workflow by `from` and name, which the api finds among the folders a start finds one in before the card is written: never a path sent',
  },
  async handler(_e, args) {
    const from = textOf(args, 'from');
    const dir = textOf(args, 'dir');
    const workflow = textOf(args, 'workflow');
    const repo = textOf(args, 'repo');
    const factory = textOf(args, 'factory');
    return addToInbox({
      text: textOf(args, 'idea') ?? '',
      ...(from !== undefined ? { from } : {}),
      ...(dir !== undefined ? { dir } : {}),
      ...(workflow !== undefined ? { workflow } : {}),
      ...(repo !== undefined ? { repo } : {}),
      ...(factory !== undefined ? { factory } : {}),
    });
  },
  print: ({ card, file }) => [
    `${card.name}  ${card.body.split('\n')[0].slice(0, 56)}${card.workflow ? `  workflow: ${card.workflow}` : ''}${card.repo ? `  repo: ${card.repo}` : ''}${card.factory ? `  factory: ${card.factory}` : ''}`,
    `filed: ${file} — start it with wf start ${file}${card.workflow ? '' : ' --workflows <w>'}`,
  ],
};

/** `--workflow <w>`, which `wf inbox queue` writes on the card with the mark. */
const QUEUE_WORKFLOW: Flag = {
  flag: '--workflow',
  kind: 'text',
  key: 'workflow',
  takes: '--workflow takes the workflow the card starts on, by name or as a path: wf inbox queue <name> --workflow <w>',
  twice: 'wf inbox queue takes --workflow once: a card starts on one workflow.',
  only: {
    side: 'cli',
    why: 'a card is queued from the board on the workflow it names: the api refuses a workflow sent, and files one with the card',
  },
};

/** `wf inbox queue`'s spec: the card's name, then `--workflow <w>` once, or `--off`. */
const QUEUE_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [QUEUE_WORKFLOW, { flag: '--off', kind: 'switch', key: 'off' }],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `wf inbox queue does not take ${arg}. It takes the card's name, then --workflow <w>, or --off to take the card back.`
      : `wf inbox queue queues one card, and ${arg} is a second: wf inbox queue <name>, once per card.`,
  apart: () => QUEUE_WORKFLOW.takes!,
  missing: 'wf inbox queue takes the name of the card to queue, as wf inbox lists it: wf inbox queue <name> [--workflow <w>] [--off].',
};

/** What `wf inbox queue` did, as the api answers it, and the card as it now reads. */
type Queued = {
  name: string;
  file: string;
  was: InboxQueued['was'];
  queued: string | null;
  place: number | null;
  of: number | null;
  card: InboxCard;
};

/**
 * `wf inbox queue`: a card marked to start on its own, or with `--off` the mark taken back. `--workflow` is the command line's alone, and
 * written as it is handed: its runner reads a path from where it is typed (`inboxQueueRun`), and this handler reads no folder of its own.
 */
export const INBOX_QUEUE: Command<Queued> = {
  name: 'inbox queue',
  usage: '<name> [--workflow <w>] [--off]',
  help: ['mark a card to start on its own: the tick starts the oldest queued', 'card once a run slot is free; --off takes the mark back'],
  spec: QUEUE_SPEC,
  check: (args) =>
    args.off === true && args.workflow !== undefined
      ? '--off takes the card out of the queue, and --workflow writes what starts it: give one of them.'
      : leftOut(QUEUE_SPEC, args),
  writes: true,
  route: [
    { method: 'POST', path: '/api/inbox/:name/queue', status: 200, sets: { off: false } },
    { method: 'DELETE', path: '/api/inbox/:name/queue', status: 200, sets: { off: true } },
  ],
  apiKeys: ['name', 'file', 'was', 'queued', 'place', 'of'],
  async handler(_e, args) {
    const workflow = textOf(args, 'workflow');
    const done = queueInInbox(textOf(args, 'name') ?? '', { off: args.off === true, ...(workflow !== undefined ? { workflow } : {}) });
    return {
      name: done.card.name,
      file: done.file,
      was: done.was,
      queued: done.card.queued ?? null,
      place: done.place ?? null,
      of: done.of ?? null,
      card: done.card,
    };
  },
  print({ name, file, was, place, of, card }) {
    if (was === 'not queued') return [`${name}  not queued — nothing to take back`];
    if (was === 'taken back') return [`${name}  taken back: it no longer starts on its own — start it with wf start ${file}`];
    return [
      `${name}  queued at ${card.queued}, ${place} of ${of}  workflow: ${card.workflow}${card.repo ? `  repo: ${card.repo}` : ''}${card.factory ? `  factory: ${card.factory}` : ''}`,
      `the tick starts it on its own once its turn comes and a run slot is free${card.repo ? '' : ', on the repository wf up runs in'} — take it back with wf inbox queue ${name} --off`,
    ];
  },
};

/** `wf inbox rm`: one card dropped without starting it, or, for a name with no card, which cards there are — on the api, a `Missing`. */
export const INBOX_RM: Command<InboxDropped> = {
  name: 'inbox rm',
  usage: '<name>',
  help: ['drop a card without starting it'],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `wf inbox rm drops one card, and ${arg} is a second: wf inbox rm <name>, once per card.`,
    missing: 'wf inbox rm takes the name of the card to drop, as wf inbox lists it: wf inbox rm <name>.',
  },
  writes: true,
  route: { method: 'DELETE', path: '/api/inbox/:name', status: 200 },
  handler: async (_e, args) => dropFromInbox(textOf(args, 'name') ?? ''),
  apiRefusal: (dropped, args) => (dropped.removed ? null : new Missing({ message: noCardLine(textOf(args, 'name') ?? '', dropped.cards) })),
  print: (dropped, args) => [
    dropped.removed
      ? `${textOf(args, 'name')}  dropped, and nothing started — ${dropped.file} removed`
      : `${noCardLine(textOf(args, 'name') ?? '', dropped.cards)} Nothing to drop.`,
  ],
};

/** `wf inbox`'s entries, in the order `wf`'s help lists them. */
export const INBOXES: readonly Command[] = [INBOX, INBOX_ADD, INBOX_QUEUE, INBOX_RM] as readonly Command[];
