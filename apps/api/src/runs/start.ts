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
import { START, startFactoryAtOnce, type StartInput } from 'agent-orchestrator';
import { Conflict, Invalid, Missing, type RunStart } from 'objects';
import { declaredAs } from '../objects/refused.ts';
import type { Refusal } from '../guard.ts';
import type { Served } from '../layer.ts';
import { folderOf } from '../workflows/workflows.ts';

/** What a start's own refusals are answered as, by their status: no such workflow, one in each source, no brief. */
const START_REFUSALS = [Missing, Conflict, Invalid] as const;

/** Why a start with no card and no brief is not one (422). */
const NO_BRIEF = `A run needs a brief: what to do, as \`nemia start <brief>\` takes it. Write it in \`brief\` — the run's steps are told it, under "What was asked for".`;

/**
 * What a start starts: a workflow's folder, with a brief — or, for an inbox card, the card and the brief given in place of its
 * body.
 */
export type Asked =
  | {
      dir: string;
      brief: string;
      after: string[] | undefined;
      context: string[] | undefined;
      label: string[] | undefined;
      card?: undefined;
    }
  | {
      dir: string;
      brief: string | undefined;
      after: string[] | undefined;
      context: string[] | undefined;
      label: string[] | undefined;
      card: string;
    };

/**
 * What a start starts off its decoded body, or why it does not: the workflow it names (404, 409), and the brief (422) — the api's
 * own, since `startRun` takes any string and `nemia start` prints its help for none. The body's shape (400) is its endpoint's.
 *
 * `after`, `context` and `label` are only shaped by the body: whether this run may wait on each run, be handed each, or take each label is
 * `startRun`'s to say (`afterRefusal`, `contextRefusal`, `parseLabelEdits`), in its words. With a `card` the brief is what the person made
 * of its body, and may be left out, for the body as it is; a blank one is the package's to refuse, as `nemia start <card> --brief ""` is.
 */
function startOf(body: Omit<RunStart, 'card'> & { card?: string }, repo: string, home: string, tree?: string): Asked | Refusal {
  const { workflow, brief, from, after, context, card, label } = body;
  const folder = folderOf(workflow, from, repo, home, tree);
  if ('status' in folder) return folder;
  const handed = { after: after && [...after], context: context && [...context], label: label && [...label] };
  if (card !== undefined) return { dir: folder.dir, brief, ...handed, card };
  if (brief === undefined || !brief.trim()) return { status: 422, error: NO_BRIEF };
  return { dir: folder.dir, brief: brief.trim(), ...handed };
}

/**
 * The card `card` started on the workflow `body` names (`startOf`, `cardStarted`), in the factory `factory` where one is named over the
 * card's own: what the Card's `start` verb runs (src/objects). The workflow not found is its refusal, by its status. A card whose `repo:`
 * the run looked at none of carries it as `ignoredRepo`, as `nemia start` prints it.
 */
export async function cardStart(
  s: Served,
  card: string,
  body: RunStart,
  factory: string | undefined,
): Promise<{ id: string; card: string; ignoredRepo?: string } | Refusal> {
  const asked = startOf({ ...body, card }, s.repo, s.home, s.factory?.tree);
  if ('status' in asked) return asked;
  if (asked.card === undefined) return { status: 422, error: NO_BRIEF };
  const started = await cardStarted(s, { ...asked, card: asked.card }, factory);
  return {
    id: started.id,
    card: started.card ?? card,
    ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
  };
}

/**
 * The inbox card `asked` names, started by `nemia start`'s entry (`START`) with the request's repository as the caller's and in the
 * factory `factory` when one is named, over the card's `factory:` — one that names none either way is refused, its fix
 * `?factory=<name>` — and what the Card's `start` answers: the run's id and the card's name — the card kept in the inbox, listed as
 * started — and the card's `repo:` the run did not look at.
 */
async function cardStarted(s: Served, asked: Extract<Asked, { card: string }>, factory: string | undefined) {
  const given: StartInput = {
    card: asked.card,
    at: s.repo,
    factory,
    fix: '?factory=<name>',
    workflows: asked.dir,
    instead: asked.brief,
    after: asked.after,
    context: asked.context,
    label: asked.label,
  };
  const started = await s.inRequest(START.handler(given));
  return {
    id: started.id,
    card: started.card,
    ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
  };
}

/**
 * A run started in the request's namespace off its decoded body, as `nemia start <brief> --workflows <folder> --repo <repo> --after
 * <runId> --from <runId>` starts one: what the Run's `create` runs (objects/runs.ts), the request placed in the namespace's factory and on
 * its `?repo=` (`placedIn`). Through the entry's handler (`START`); refused as `startOf` says, by its status (`START_REFUSALS`). Its
 * answer is the run's id.
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
export async function runStart(s: Served, body: RunStart): Promise<{ id: string }> {
  const { repo, home, factory } = s;
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
    label: asked.label,
    factory: found.factory?.name,
  };
  const { id } = await s.inRequest(START.handler(given));
  return { id };
}
