/**
 * The verbs that start work — `wf start`, `wf plan` and `wf inbox` — their flags and help, read off the command line, and what each prints.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  addToInbox,
  approvedFirst,
  cardToStart,
  pausedRead,
  pausedWords,
  type Paused,
  dropFromInbox,
  endingSteps,
  formerKeyLines,
  fromNote,
  gatesOf,
  ignoredRepoLine,
  inboxDir,
  inboxLines,
  inboxNameAt,
  inputsDir,
  isGitRun,
  leftOutMounts,
  noCardLine,
  planLines,
  planStopped,
  queueInInbox,
  readInbox,
  repoFor,
  start,
  startFactory,
  defaultStartsAllowed,
  startFromInbox,
  startPlan,
  stepsOf,
  workflowAt,
  workflowFolder,
  writersOf,
} from '../runner.ts';
import { HELP, usage, readFlags, type Engine } from './flags.ts';

export const PLAN_HELP = `wf plan <folder> [--repo .] [--factory <name>]

Start a plan: one run per card in the folder, parents first, each waiting on the runs of the cards it names.
That is the record wf start --after writes, so the tick files a card's run once its parents have shipped, and
every card is a decision at its own wf decide. Nothing else is written: the runs and their after are the plan.
It prints a line per card: the card, its run, its workflow, and what it waits on. Every run is started in
--factory, else the factory whose repository holds --repo, else the folder wf plan is typed in, when one
factory alone does, on that repository; none, or two, is refused before any run is started, naming the fix.

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

type StartHow = {
  workflows?: string;
  repo?: string;
  isolate: boolean;
  after: string[];
  inputs: string[];
  gates: string[];
  brief?: string;
  factory?: string;
};

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
  '--factory':
    "the factory the run is started in, whose hires fill the workflow's steps; without it, the one whose repository holds the folder: wf start <brief> --factory <name>",
} as const;

/** Why a value flag of `wf start` is taken once, as its refusal says it, where it is not the workflow. */
const ONCE: Readonly<Record<string, string>> = {
  '--brief': 'is asked one thing',
  '--repo': 'works on one repository',
  '--factory': 'is started in one factory',
};

/**
 * `wf start`'s flags, after the brief: `--workflows <dir>`, `--repo <r>`, `--after <runId>` as often as there are runs to wait on,
 * `--input <file>` as often as there are files to hand its steps, `--gate <step>` as often as there are steps to gate, `--factory <name>`,
 * and `--no-worktree`.
 */
export function startHow(argv: string[]): StartHow {
  const { values, switches } = readFlags(argv, {
    takes: START_TAKES,
    switches: ['--no-worktree'],
    repeats: ['--after', '--input', '--gate'],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf start does not take ${arg}. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --input <file> once per file to hand its steps; --gate <step> once per step to gate; --factory <name>; and, for an inbox card, --brief "<brief>".`
        : `wf start takes one brief, and ${arg} is a second. Quote a brief with spaces — wf start "<brief>" — or give it as a file: wf start ./brief.md.`,
    twice: (flag) => `wf start takes ${flag} once: a run ${ONCE[flag] ?? 'works on one workflow'}.`,
  });
  return {
    workflows: values['--workflows']?.[0],
    repo: values['--repo']?.[0],
    isolate: !switches.length,
    after: values['--after'] ?? [],
    inputs: values['--input'] ?? [],
    gates: values['--gate'] ?? [],
    ...(values['--brief'] ? { brief: values['--brief'][0] } : {}),
    ...(values['--factory'] ? { factory: values['--factory'][0] } : {}),
  };
}

/**
 * `wf plan`'s flags, after the folder: `--repo <r>` and `--factory <name>`, once each. `wf start`'s others are refused by name, each with
 * why the folder says it instead; and anything else, as `wf start` refuses it.
 */
export function planHow(argv: string[]): { repo?: string; factory?: string } {
  const { values } = readFlags(argv, {
    takes: {
      '--repo': 'the repository the plan works on: wf plan <folder> --repo <r>',
      '--factory': "the factory every card's run is started in: wf plan <folder> --factory <name>",
    },
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
        ? `wf plan does not take ${arg}. It takes the plan folder, then --repo <r> and --factory <name>.`
        : `wf plan takes one folder, and ${arg} is a second. A plan is every card in one folder: wf plan <folder> --repo <r>.`,
    twice: (flag) =>
      flag === '--factory'
        ? 'wf plan takes --factory once: a plan is started in one factory.'
        : 'wf plan takes --repo once: a plan works on one repository.',
  });
  return { repo: values['--repo']?.[0], ...(values['--factory'] ? { factory: values['--factory'][0] } : {}) };
}

/**
 * Where a start of a workflow typed here is made (`startFactory`): the factory `--factory` names, else the one whose repository holds
 * `--repo`, else the directory it is typed in; and its repository — the one that holds the folder, when the factory was found from it,
 * else `--repo`, else the factory's one repository, else here (`repoFor`). Refused as `startFactory` and `repoFor` refuse.
 */
function placeOfStart(how: { repo?: string; factory?: string }): { factory?: string; repo: string } {
  const named = how.repo === undefined ? undefined : path.resolve(how.repo);
  const found = startFactory(how.factory, named ?? path.resolve('.'), '--factory <name>');
  const factory = found.factory?.name;
  return { ...(factory !== undefined ? { factory } : {}), repo: found.repo ?? repoFor(factory, named, path.resolve('.')) };
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

/** What one of `wf inbox add`'s flags names, once per card. */
const ADD_NAMES: Record<string, string> = { '--workflow': 'workflow', '--repo': 'repository', '--factory': 'factory' };

/** `wf inbox add`'s flags, after the idea: `--workflow <name>`, `--repo <path>` and `--factory <name>`, once each. */
export function inboxAddHow(argv: string[]): { workflow?: string; repo?: string; factory?: string } {
  const { values } = readFlags(argv, {
    takes: {
      '--workflow': 'the workflow to start the card on, by name or as a path: wf inbox add "<idea>" --workflow <name>',
      '--repo': 'the repository the idea is about: wf inbox add "<idea>" --repo <path>',
      '--factory': 'the factory that processes the card: wf inbox add "<idea>" --factory <name>',
    },
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf inbox add does not take ${arg}. It takes the idea, then --workflow <name>, --repo <path> and --factory <name>.`
        : `wf inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — wf inbox add "<idea>" — or give it as a file: wf inbox add ./idea.md.`,
    twice: (flag) => `wf inbox add takes ${flag} once: a card names one ${ADD_NAMES[flag]}.`,
  });
  return { workflow: values['--workflow']?.[0], repo: values['--repo']?.[0], factory: values['--factory']?.[0] };
}

/** The factory a run was started in, and the repository a git run works on there, as `wf start` says it; none in the default factory. */
const factoryLine = (run: ReturnType<typeof start>): string[] =>
  run.factory ? [`factory: ${run.factory}${isGitRun(run) ? `, on ${run.repo}` : ''}`] : [];

/**
 * The folders of its factory a run mounts, read-only, as `wf start` says them, and those left out because they were no directory; none
 * in the default factory.
 */
const mountLines = (run: ReturnType<typeof start>): string[] => {
  const missing = leftOutMounts(run);
  const written = writersOf(stepsOf(run), run.mounts);
  return [
    ...(run.mounts?.length
      ? [
          `mounts: ${run.mounts.map((m) => m.path).join(', ')} — read-only, for every local step${written.length ? ' but where written below' : ''}`,
        ]
      : []),
    ...written.map((w) => `writable: ${w.path} — for ${w.steps.join(', ')} alone`),
    ...(missing.length
      ? [`not mounted: ${missing.join(', ')} — of the factory's repositories, and no directory now; start again once it is there`]
      : []),
  ];
};

/** The steps of a run just started that wait on a person: each gated, and the ending a person approves before it is filed. */
function gateLines(run: ReturnType<typeof start>, steps: ReturnType<typeof stepsOf>): string[] {
  const gates = gatesOf(steps, run);
  const ends = endingSteps(steps, run)
    .filter((s) => approvedFirst(s, run))
    .map((s) => s.name);
  const held = gates.filter((name) => !ends.includes(name));
  return [
    ...(held.length
      ? [
          `gated at: ${held.join(', ')} — nothing after ${held.length > 1 ? 'each' : 'it'} is filed until wf approve ${run.id} <step>, once it has signed off`,
        ]
      : []),
    ...(ends.length
      ? [
          `ends at: ${ends.join(', ')} — nothing of ${ends.length > 1 ? 'them' : 'it'} runs until wf approve ${run.id} ${ends[0]}, which is what files ${ends.length > 1 ? 'them' : 'it'}`,
        ]
      : []),
  ];
}

/**
 * What `wf start` prints of a run it started: its steps, where it came from when said, its factory, the folders it mounts, where it works,
 * and what it waits on and ends at; and, while the store is paused (`paused`), that nothing of it is filed until it resumes.
 */
function printStarted(run: ReturnType<typeof start>, paused: Paused, from?: string): void {
  const steps = stepsOf(run);
  console.log(`${run.id}  ${steps.length} step(s): ${steps.map((s) => (s.agent ? `${s.name} (${s.agent.name})` : s.name)).join(' → ')}`);
  if (from) console.log(from);
  for (const line of factoryLine(run)) console.log(line);
  for (const line of mountLines(run)) console.log(line);
  console.log(`workspace: ${run.workspace}${isGitRun(run) ? '' : ' — a folder per step, made as each is filed, with no git repository'}`);
  if (run.inputs?.length) console.log(`inputs: ${run.inputs.join(', ')} — copied into ${inputsDir(run)}`);
  if (run.after?.length)
    console.log(`waits on: ${run.after.join(', ')} — nothing is filed until wf decide says each has shipped onto ${run.branch}`);
  for (const line of gateLines(run, steps)) console.log(line);
  console.log(`run 'wf tick' (or 'wf up') to start it`);
  const pause = pausedWords(paused);
  if (pause) console.log(`${pause}: nothing of this run is filed until then`);
  for (const line of formerKeyLines(run.workflowDir)) console.log(line);
}

/** `wf start` of the inbox's card `inboxName`: its body, or `--brief` in its place — a file's text, or the words — started and said. */
async function startInboxCard(inboxName: string, how: StartHow, e: Engine): Promise<void> {
  const brief =
    how.brief === undefined
      ? undefined
      : fs.statSync(how.brief, { throwIfNoEntry: false })?.isFile()
        ? fs.readFileSync(how.brief, 'utf8')
        : how.brief;
  const started = startFromInbox({
    name: inboxName,
    ...(brief !== undefined ? { brief } : {}),
    ...(how.workflows !== undefined ? { workflow: how.workflows } : {}),
    ...(how.repo !== undefined ? { repo: path.resolve(how.repo) } : {}),
    callerRepo: path.resolve('.'),
    isolate: how.isolate,
    after: how.after,
    inputs: how.inputs,
    gates: how.gates,
    ...(how.factory !== undefined ? { factory: how.factory } : {}),
    fix: '--factory <name>',
  });
  printStarted(
    started.run,
    await pausedRead(e),
    started.removed
      ? `${fromNote(started.run)} — removed from the inbox`
      : `${fromNote(started.run)} — still in the inbox: ${started.why}. wf inbox lists it as started as ${started.run.id}: drop it with wf inbox rm ${inboxName}`,
  );
  if (started.ignoredRepo) console.log(ignoredRepoLine(started.ignoredRepo));
}

/**
 * `wf start`: a run of a brief, a plan's card or an inbox card, and what it prints of it. A file that is not a plan's card
 * (`cardToStart`) is the whole brief, frontmatter and all, and a card's own `workflow:` is found from its plan folder.
 */
export async function startVerb(rest: string[], e: Engine): Promise<void> {
  const arg = rest[0];
  if (!arg || arg.startsWith('--')) return console.log(HELP);
  const how = startHow(rest.slice(1));
  const inboxName = inboxNameAt(arg);
  if (inboxName !== null) return startInboxCard(inboxName, how, e);
  if (how.brief !== undefined)
    usage(
      `wf start takes --brief only for a card of the inbox, in place of its body: wf start ${path.join(inboxDir(), '<name>.md')} --brief "<brief>". Anywhere else the brief is its first argument: wf start "<brief>".`,
    );
  const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : undefined;
  const card = text === undefined ? null : cardToStart(arg, text, how.after);
  const { factory, repo } = placeOfStart(how);
  const run = start({
    brief: card ? card.body : (text?.trim() ?? arg),
    repo,
    repoNamed: how.repo !== undefined,
    workflowDir:
      how.workflows === undefined && card?.workflow !== undefined
        ? workflowFolder(card.workflow, path.dirname(path.resolve(arg)), repo)
        : workflowFolder(how.workflows ?? './workflows', process.cwd(), repo),
    isolate: how.isolate,
    after: how.after,
    inputs: how.inputs,
    gates: how.gates,
    ...(factory !== undefined ? { factory } : {}),
  });
  printStarted(run, await pausedRead(e));
}

/**
 * `wf plan`: a run per card of a plan folder, a line each, in the factory and on the repository a `wf start` typed here would be
 * (`placeOfStart`); a card that did not start stops the rest, and fails with what it was told.
 */
export function planVerb(rest: string[]): void {
  if (rest.includes('--help')) return console.log(PLAN_HELP);
  const folder = rest[0];
  if (!folder || folder.startsWith('--')) return console.log(HELP);
  const { factory, repo } = placeOfStart(planHow(rest.slice(1)));
  const plan = { dir: path.resolve(folder), repo: path.resolve(repo) };
  const { started, stopped, folderOf } = startPlan({ ...plan, ...(factory !== undefined ? { factory } : {}) });
  for (const line of planLines(started)) console.log(line);
  if (stopped) {
    const told = planStopped({ card: stopped.card, why: stopped.error.message, rest: stopped.rest }, started, { ...plan, folderOf });
    throw Object.assign(new Error(told), { exitCode: stopped.error.exitCode ?? 1 });
  }
  console.log(`run 'wf tick' (or 'wf up') to start them`);
}

/** `wf inbox`: each card, a line each, and how to start, queue or drop one; or that the inbox is empty. */
function inboxList(): void {
  const listing = readInbox();
  if (!listing.length) return console.log(`the inbox is empty — park an idea with wf inbox add "<idea>"`);
  for (const line of inboxLines(listing, defaultStartsAllowed())) console.log(line);
  console.log(
    `\nstart one: wf start ${path.join(inboxDir(), '<name>.md')} [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: wf inbox queue <name> — drop one: wf inbox rm <name>`,
  );
}

/**
 * `wf inbox add`: an idea, the words or a file's text, filed as a card, with a `--workflow` path read from where it is typed
 * (`workflowAt`).
 */
function inboxAdd(args: string[]): void {
  const idea = args[0];
  if (idea === undefined || idea.startsWith('--'))
    usage(
      'wf inbox add takes the idea, first: wf inbox add "<idea>" [--workflow <name>] [--repo <path>] [--factory <name>], or a file: wf inbox add ./idea.md. Nothing was filed.',
    );
  const how = inboxAddHow(args.slice(1));
  const at = fs.statSync(idea, { throwIfNoEntry: false });
  if (at?.isDirectory())
    usage(
      `${idea} is a directory, and wf inbox add takes the idea as text or as one file: wf inbox add "<idea>", or wf inbox add ./idea.md.`,
    );
  const workflow = how.workflow === undefined ? undefined : workflowAt(how.workflow, process.cwd());
  const { card, file } = addToInbox({
    text: at ? fs.readFileSync(idea, 'utf8') : idea,
    ...(at ? { from: idea, dir: path.dirname(path.resolve(idea)) } : { dir: process.cwd() }),
    ...(workflow !== undefined ? { workflow } : {}),
    ...(how.repo !== undefined ? { repo: path.resolve(how.repo) } : {}),
    ...(how.factory !== undefined ? { factory: how.factory } : {}),
  });
  console.log(
    `${card.name}  ${card.body.split('\n')[0].slice(0, 56)}${card.workflow ? `  workflow: ${card.workflow}` : ''}${card.repo ? `  repo: ${card.repo}` : ''}${card.factory ? `  factory: ${card.factory}` : ''}`,
  );
  console.log(`filed: ${file} — start it with wf start ${file}${card.workflow ? '' : ' --workflows <w>'}`);
}

/**
 * `wf inbox queue`: a card marked to start on its own, or with `--off` the mark taken back; a `--workflow` path is written absolute
 * (`workflowAt`).
 */
function inboxQueue(args: string[]): void {
  const [name, ...more] = args;
  if (name === undefined || name.startsWith('--'))
    usage('wf inbox queue takes the name of the card to queue, as wf inbox lists it: wf inbox queue <name> [--workflow <w>] [--off].');
  const how = inboxQueueHow(more);
  const workflow = how.workflow === undefined ? undefined : workflowAt(how.workflow, process.cwd());
  const queued = queueInInbox(name, { off: how.off, ...(workflow !== undefined ? { workflow } : {}) });
  if (queued.was === 'not queued') return console.log(`${name}  not queued — nothing to take back`);
  if (queued.was === 'taken back')
    return console.log(`${name}  taken back: it no longer starts on its own — start it with wf start ${queued.file}`);
  console.log(
    `${name}  queued at ${queued.card.queued}, ${queued.place} of ${queued.of}  workflow: ${queued.card.workflow}${queued.card.repo ? `  repo: ${queued.card.repo}` : ''}${queued.card.factory ? `  factory: ${queued.card.factory}` : ''}`,
  );
  console.log(
    `the tick starts it on its own once its turn comes and a run slot is free${queued.card.repo ? '' : ', on the repository wf up runs in'} — take it back with wf inbox queue ${name} --off`,
  );
}

/** `wf inbox rm`: one card dropped without starting it, or, for a name with no card, which cards there are. */
function inboxRm(args: string[]): void {
  const [name, ...more] = args;
  if (name === undefined || name.startsWith('--'))
    usage('wf inbox rm takes the name of the card to drop, as wf inbox lists it: wf inbox rm <name>.');
  if (more.length) usage(`wf inbox rm drops one card, and ${more[0]} is a second: wf inbox rm <name>, once per card.`);
  const dropped = dropFromInbox(name);
  return console.log(
    dropped.removed
      ? `${name}  dropped, and nothing started — ${dropped.file} removed`
      : `${noCardLine(name, dropped.cards)} Nothing to drop.`,
  );
}

/** `wf inbox` and its subcommands `add`, `queue` and `rm`; anything else is refused, naming the four. */
export function inboxVerb(rest: string[]): void {
  const [sub, ...args] = rest;
  if (sub === '--help') return console.log(INBOX_HELP);
  if (sub === undefined) return inboxList();
  if (sub === 'add') return inboxAdd(args);
  if (sub === 'queue') return inboxQueue(args);
  if (sub === 'rm') return inboxRm(args);
  return usage(
    `wf inbox does not take ${sub}. It lists the inbox — wf inbox — files a card with wf inbox add "<idea>", queues one with wf inbox queue <name>, and drops one with wf inbox rm <name> (wf inbox --help).`,
  );
}
