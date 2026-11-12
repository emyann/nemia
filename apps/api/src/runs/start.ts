/**
 * A run started: of a workflow, by the Run's `create` (`POST /api/namespaces/<namespace>/runs`, objects/runs.ts, `runStart`), its body
 * `objects`' `RunStart`, decoded by its endpoint; or of an inbox card, by the Card's `start` (objects/cards.ts, `cardStart`), the same
 * handler's `startFromInbox`, `nemia start <inbox>/<name>.md`'s: the same record, with `from` on it, and the card kept, listed as started.
 * Each is `nemia start`'s entry of the package's command table (`START`), called by type: it writes the run's record and files nothing —
 * `nemia tick` or `nemia up` files the first step, as it does for a run started at the command line.
 *
 * The workflow a body names is found among the folders a start finds one in (`folderOf`, workflows/workflows.ts), in the factory the
 * request is served in: never a path sent.
 */
import {
  START,
  sentInputRefusal,
  sentInputsRemoved,
  sentInputsWritten,
  startedLines,
  startFactoryAtOnce,
  type StartInput,
} from 'agent-orchestrator';
import { type CardStart, type CardStarted, Conflict, Invalid, Missing, type RunStart, type RunStarted } from 'objects';
import { declaredAs } from '../objects/refused.ts';
import type { Refusal } from '../guard.ts';
import type { Served } from '../layer.ts';
import { repoNeeded } from '../factory/place.ts';
import { folderOf } from '../workflows/workflows.ts';

/** What a start's own refusals are answered as, by their status: no such workflow, one in each source, no brief. */
const START_REFUSALS = [Missing, Conflict, Invalid] as const;

/** Why a start with no card and no brief is not one (422). */
const NO_BRIEF = `A run needs a brief: what to do, as \`nemia start <brief>\` takes it. Write it in \`brief\` — the run's steps are told it, under "What was asked for".`;

/** What a start of a run from a brief starts: a workflow's folder, with a brief. */
export type Asked = {
  dir: string;
  brief: string;
  after: string[] | undefined;
  context: string[] | undefined;
  cards: string[] | undefined;
  label: string[] | undefined;
};

/** What a start of a brief and of a card both take beside: each step's model, as `<step>=<model>`, the gates, and no worktree. */
const extrasOf = (body: Pick<RunStart, 'models' | 'gates' | 'noWorktree'>) => ({
  ...(body.models !== undefined ? { models: Object.entries(body.models).map(([step, model]) => `${step}=${model}`) } : {}),
  ...(body.gates !== undefined ? { gates: [...body.gates] } : {}),
  ...(body.noWorktree === true ? { noWorktree: true } : {}),
});

/**
 * `start` handed the files `inputs` names, written where it reads them (`sentInputsWritten`) and removed once it has: refused (422)
 * naming `--input` where one cannot be handed (`sentInputRefusal`), before anything is written.
 */
async function withInputs<A>(inputs: RunStart['inputs'], start: (files: string[] | undefined) => Promise<A>): Promise<A> {
  if (inputs === undefined || !inputs.length) return start(undefined);
  const refused = sentInputRefusal(inputs);
  if (refused !== null) throw declaredAs(START_REFUSALS, { status: 422, error: refused });
  const here = sentInputsWritten(inputs);
  try {
    return await start(here.files);
  } finally {
    sentInputsRemoved(here.dir);
  }
}

/** What a start answers beside the run's id, off what `START` answered: what `nemia start` prints of it, its lines among them. */
const startedOf = (started: Awaited<ReturnType<typeof runStarted>>): RunStarted => ({
  id: started.id,
  ...(started.card !== undefined ? { card: started.card } : {}),
  ...(started.queueLeft !== undefined ? { queueLeft: started.queueLeft } : {}),
  ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
  ...(started.paused !== undefined ? { paused: started.paused } : {}),
  ...(started.landed !== undefined ? { landed: [...started.landed] } : {}),
  ...(started.hints !== undefined ? { hints: [...started.hints] } : {}),
  ...(started.notMounted !== undefined ? { notMounted: [...started.notMounted] } : {}),
  ...(started.notVolumes !== undefined ? { notVolumes: [...started.notVolumes] } : {}),
  lines: startedLines(started),
});

/** `START`'s handler on `given`, in the request `s` serves. */
const runStarted = (s: Served, given: StartInput) => s.inRequest(START.handler(given));

/** The lists a body hands the run, copied: what `startRun` judges, in its words. */
const handedOf = (body: {
  after?: readonly string[];
  context?: readonly string[];
  cards?: readonly string[];
  label?: readonly string[];
}) => ({
  after: body.after && [...body.after],
  context: body.context && [...body.context],
  cards: body.cards && [...body.cards],
  label: body.label && [...body.label],
});

/**
 * What a start starts off its decoded body, or why it does not: the workflow it names (404, 409), and the brief (422) — the api's
 * own, since `startRun` takes any string and `nemia start` prints its help for none. The body's shape (400) is its endpoint's.
 *
 * `after`, `context`, `cards` and `label` are only shaped by the body: whether this run may wait on each run, be handed each run or card,
 * or take each label is `startRun`'s to say (`afterRefusal`, `contextRefusal`, `cardsRefusal`, `parseLabelEdits`), in its words.
 */
function startOf(body: RunStart, repo: string, home: string, tree?: string): Asked | Refusal {
  const folder = folderOf(body.workflow, body.from, repo, home, tree);
  if ('status' in folder) return folder;
  if (body.brief === undefined || !body.brief.trim()) return { status: 422, error: NO_BRIEF };
  return { dir: folder.dir, brief: body.brief.trim(), ...handedOf(body) };
}

/**
 * The card `card` started as `nemia start <card> --factory <namespace>` starts it: what the Card's `start` verb runs (src/objects), the
 * request placed in its namespace's factory. On the workflow `body` names, found among the folders a start finds one in (`folderOf`), the
 * factory's tree first — the workflow not found its refusal, by its status — or, where it names none, the card's own `workflow:`, which
 * the package finds as `nemia start` does (`startFromInbox`). In the factory `factory` where one is named over the card's own: one that
 * names none either way is refused, its fix `?factory=<name>`. With the request's repository as the caller's, `instead` the brief given in
 * place of the card's body, which may be left out, for the body as it is; a blank one is the package's to refuse, as `nemia start <card>
 * --brief ""` is. Answered with the run's id, what `nemia start` prints of it, and the card's name — the card kept in the inbox, listed
 * as started — and the card's `repo:` the run did not look at, as `ignoredRepo`, as `nemia start` prints it.
 */
export async function cardStart(s: Served, card: string, body: CardStart, factory: string | undefined): Promise<CardStarted | Refusal> {
  const repo = repoNeeded(s);
  const folder = body.workflow === undefined ? undefined : folderOf(body.workflow, body.from, repo, s.home, s.factory?.tree);
  if (folder !== undefined && 'status' in folder) return folder;
  const handed = handedOf(body);
  const given: StartInput = {
    card,
    at: repo,
    factory,
    fix: '?factory=<name>',
    workflows: folder?.dir,
    instead: body.brief,
    after: handed.after,
    context: handed.context,
    cards: handed.cards,
    label: handed.label,
    ...(body.repo !== undefined ? { repo: body.repo } : {}),
    ...extrasOf(body),
  };
  const started = await withInputs(body.inputs, (inputs) => runStarted(s, { ...given, ...(inputs ? { inputs } : {}) }));
  return { ...startedOf(started), card: started.card ?? card };
}

/**
 * A run started in the request's namespace off its decoded body, as `nemia start <brief> --workflows <folder> --repo <repo> --after
 * <runId> --from <runId>` starts one: what the Run's `create` runs (objects/runs.ts), the request placed in the namespace's factory and on
 * its `?repo=` (`placedIn`). Through the entry's handler (`START`); refused as `startOf` says, by its status (`START_REFUSALS`). Its
 * answer is the run's id, and what `nemia start` prints of it (`startedOf`). Its models, gates, no worktree and the files handed to its
 * steps are the body's (`extrasOf`, `withInputs`).
 *
 * A refusal of the package's is thrown, and answered by its kind, word for word: `nemia start`'s refusal is an `Invalid`, 422 — a folder
 * that does not read as a workflow, a step named for another's check or try, a `.worktreeinclude` it cannot use, or a run this one cannot
 * wait on (`afterRefusal`). A failure that is not a refusal is a 500, git's on a repository it cannot branch from among them — no git
 * checkout, no commit — which the queue tries again on its next pass. In a factory (the namespace of one), the run is started in it
 * (`startRun`'s `factory`), which refuses a workflow it has not attached, a step its hires leave unfilled and a repository outside it, each
 * an `Invalid`. Every run is started in a factory: a start in `default`, which names none, runs in the one factory whose repository holds
 * the api's repository, or `?repo=`, on that repository (`startFactoryAtOnce`, as `nemia start` finds it), and is refused, `Invalid`, where
 * none or two do, naming the namespace to start it in.
 */
export async function runStart(s: Served, body: RunStart): Promise<RunStarted> {
  const { home, factory } = s;
  const repo = repoNeeded(s);
  const asked = startOf(body, repo, home, factory?.tree);
  if ('status' in asked) throw declaredAs(START_REFUSALS, asked);
  const found = factory
    ? { factory, repo }
    : startFactoryAtOnce(home, undefined, repo, 'POST /api/namespaces/<name>/runs', s.config.defaultFactoryStarts);
  const given: StartInput = {
    brief: asked.brief,
    repo: found.repo ?? repo,
    workflows: asked.dir,
    after: asked.after,
    context: asked.context,
    cards: asked.cards,
    label: asked.label,
    factory: found.factory?.name,
    ...extrasOf(body),
  };
  return startedOf(await withInputs(body.inputs, (inputs) => runStarted(s, { ...given, ...(inputs ? { inputs } : {}) })));
}
