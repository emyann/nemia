/**
 * A workflow node starts its run (`sendCards`): each node due (`Assessment.send`) starts a run of the workflow it names, directly, with no
 * card filed, handed the run as context and briefed by its title (`brief: title`) or the run's own card (`brief: card`), and its record
 * keeps `sent` once; a `card: backlog` node files the run's card back to the inbox, unqueued, under a name its run and node derive.
 * A controller.
 */
import { Effect } from 'effect';
import type { StepSpec } from '../workflow.ts';
import { isRepositoryRun, type CloseoutAsked, type Run, type TaskPhase } from '../record/record.ts';
import { stepStatus, type SpendOf } from '../status/status.ts';
import { CardDoor, type CardDoorShape } from '../cards/cards.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { inheritedLabels, parseLabelEdits, type Labels } from '../labels/labels.ts';
import { DEFAULT_NAMESPACE } from 'objects';
import { CardName } from '../inbox/inbox.model.ts';
import { parseInboxCard } from '../inbox/index.ts';
import { cardFilesAt, workflowPlace } from '../inbox/inbox.verb.ts';
import { startRun } from '../start/start.verb.ts';
import { factoryOrNone } from '../factory/door/factories.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { firstPiece } from '../piece/piece.ts';
import { answeredRoute } from '../route/routed/index.ts';
import { conditionOf } from '../route/index.ts';
import type { Closeout } from '../closeout/index.ts';
import { found } from '../tick/told.verb.ts';
import { renderFrontmatter, type FrontmatterPair } from '../frontmatter/frontmatter.ts';
import type { Verdict } from '../check/index.ts';

/** What a pass files of its due work: the steps ready (`Assessment.ready`) and the workflow nodes due their card (`Assessment.send`). */
export type Due = { ready: readonly string[]; send: readonly string[] };

/** What a pass read that a route's words are read by: the tick's `RunRead`, which this names no further to keep the import one way. */
export type SendReads = {
  steps: StepSpec[];
  phaseOf: (taskId: string) => TaskPhase;
  signedOff: (step: string) => Closeout | undefined;
  asked: (taskId: string) => CloseoutAsked;
  verdictOf: (step: string) => Verdict | undefined;
  spendOf: SpendOf;
};

/**
 * Each step's own word on the pass, as the pass read it (`stepStatus`): what a route's producer is read by. `pending` for no such step.
 * @param run The run the pass read.
 * @param reads The pass's reads: the steps, the tasks' phases, the closeouts, what each cost and each check's verdict.
 */
export const wordReader = (run: Run, reads: SendReads) => (name: string) => {
  const step = reads.steps.find((s) => s.name === name);
  return step ? stepStatus(step, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf, reads.verdictOf) : 'pending';
};

/**
 * The card a backlog node files: `<run>-<node>-backlog`.
 * @param run The id of the run the node is in.
 * @param node The backlog node's name.
 */
const backlogCardName = (run: string, node: string) => `${run}-${node}-backlog`;

/**
 * The step whose closeout a condition's route was read from: a table's producer (`route: { from: <producer>.<field> }`), else the
 * condition itself, a judge or a script whose own closeout said the route.
 * @param condition The condition whose route was read.
 */
const routeProducer = (condition: StepSpec) => (condition.route?.kind === 'table' ? firstPiece(condition.route.from, '.') : condition.name);

/**
 * The title a routed card opens with: the first line of the `title` its condition's producer signed off on, where its `output:` declares
 * one and it says one; else the first line of the run's brief, the run's own title.
 * @param run The run, whose brief and id title the card where the producer says none.
 * @param producer How the condition's producer signed off, or undefined where it has not.
 */
function sentCardTitle(run: Run, producer: Closeout | undefined) {
  const said = producer?.output?.title;
  const title = typeof said === 'string' ? firstPiece(said.trim(), '\n').trim() : '';
  return title || firstPiece(run.brief, '\n').trim() || `Work routed on from run ${run.id}`;
}

/**
 * The run's own card as it was given, which a `brief: card` or `card: backlog` node carries on: its body, its labels, its files and the
 * namespace that keeps them (its factory, `default` for none).
 */
export type GivenCard = {
  readonly body: string;
  readonly labels: Labels;
  readonly files?: readonly { readonly name: string; readonly file: string }[];
  readonly namespace?: string;
};

/** Why a node acted, worded once for its text: the run's condition, the route it took and the reason the producer gave. */
type Why = { readonly condition: string; readonly route: string | undefined; readonly reason: string | undefined };

/** The line a run or a card says it came from, and the producer's reason where it gave one. */
function whyLines(run: Run, node: StepSpec, why: Why) {
  const took = `its condition \`${why.condition}\`${why.route ? ` took the route \`${why.route}\`, which` : ''}`;
  const where =
    node.card === 'backlog'
      ? `Filed back to the backlog from run ${run.id}: ${took} files this card back to the inbox, unqueued (its node \`${node.name}\`).`
      : `Started from run ${run.id}: ${took} starts this run of the workflow \`${node.workflow ?? ''}\` (its node \`${node.name}\`). What the condition read is handed to this run under \`## From run ${run.id}\`.`;
  const reason = why.reason?.trim();
  return [where, ...(reason ? ['', `Its reason: ${reason}`] : [])];
}

/** `labels` after the edits of `relabel`, kubectl's, each taken with overwrite since the workflow's author wrote it; checked at load. */
const relabelled = (labels: Labels, relabel: readonly string[]) => {
  const parsed = parseLabelEdits(relabel);
  return inheritedLabels({ parents: [], card: labels, edits: 'edits' in parsed ? parsed.edits : [] }).labels;
};

/** Whether the given card's Files are kept by the run's factory, whose inbox the onward card is filed in. */
const sameFactory = (run: Run, given: GivenCard | undefined) =>
  (given?.namespace ?? DEFAULT_NAMESPACE) === (run.factory ?? DEFAULT_NAMESPACE);

/** The `files:` pair a backlog card carries: the given card's files, kept in the run's factory. */
const filesCarried = (run: Run, given: GivenCard | undefined) => {
  const files = given?.files ?? [];
  const pairs: FrontmatterPair[] = files.length && sameFactory(run, given) ? [['files', Object.fromEntries(files.map((f) => [f.name, f.file]))]] : [];
  return pairs;
};

/**
 * The text of the card a `card: backlog` node files: the run's own card filed back to the inbox naming no workflow and unqueued, its
 * body (else the run's brief) and its labels after the edits the node's `relabel:` lists, its factory and the given card's files
 * (`files:`), the same Files by id, where the card's namespace is the run's factory, whose inbox the card is filed in: a File of
 * another namespace is none that factory keeps, so it is left off.
 * @param run The run the card is filed back from: its id, repository and factory.
 * @param node The backlog node: its name, `card:` and `relabel:`.
 * @param why The name of the condition whose route filed the card, the route it took where one is said, and the producer's reason.
 * @param labels The run's labels, which a card of a run with no card of its own takes.
 * @param given The run's own card, where it was started from one that reads; undefined otherwise.
 */
export function sentCardText(run: Run, node: StepSpec, why: Why, labels: Labels, given: GivenCard | undefined) {
  const carried = relabelled(given?.labels ?? labels, node.relabel ?? []);
  const keys: FrontmatterPair[] = [
    ...(isRepositoryRun(run) ? [['repo', run.repo] as const] : []),
    ...(run.factory ? [['factory', run.factory] as const] : []),
    ['from', run.id],
    ...(Object.keys(carried).length ? [['labels', carried] as const] : []),
    ...filesCarried(run, given),
  ];
  const head = ['---', renderFrontmatter(keys).replace(/\n$/, ''), '---', ''];
  return [...head, (given?.body ?? run.brief).trim(), '', ...whyLines(run, node, why), ''].join('\n');
}

/**
 * The brief of the run a `workflow:` node starts: by default (`brief: title`) the title its condition's producer gave, then why the run
 * was started; with `brief: card` the run's own card as it was given, its body (else the run's brief), then why it was started and the
 * producer's reason.
 * @param run The run the node is in.
 * @param node The workflow node: its name, its workflow and its `brief:`.
 * @param why The name of the condition whose route started the run, the route it took where one is said, and the producer's reason.
 * @param title The title the run opens with (`sentCardTitle`), for `brief: title`.
 * @param given The run's own card, where it was started from one that reads; undefined otherwise.
 */
export function childBrief(run: Run, node: StepSpec, why: Why, title: string, given: GivenCard | undefined) {
  const card = node.brief === 'card';
  const lead = card ? (given?.body ?? run.brief).trim() : title;
  return [lead, '', ...whyLines(run, node, card ? why : { ...why, reason: undefined }), ''].join('\n');
}

/**
 * The names of the given card's files the onward card or run does not carry, since the given card is of another namespace than the run's
 * factory, whose inbox keeps none of its Files; none where it carries them all, or where the node carries none (`brief: title`).
 * @param run The run the node is in: its factory.
 * @param node The node: its `card:` and `brief:`.
 * @param given The run's own card, where it was started from one that reads; undefined otherwise.
 */
export function filesLeftOff(run: Run, node: Pick<StepSpec, 'card' | 'brief'>, given: GivenCard | undefined) {
  const carries = node.card === 'backlog' || node.brief === 'card';
  return !carries || sameFactory(run, given) ? [] : (given?.files ?? []).map((f) => f.name);
}

/**
 * The run's own card as it was given, where it was started from one that is still filed and reads: its body and its labels.
 * @param door The Card door.
 * @param run The run, whose `from.inbox` names its card.
 */
const givenCard = Effect.fnUntraced(function* (door: CardDoorShape, run: Run) {
  const name = run.from?.inbox;
  if (name === undefined) return undefined;
  const text = yield* Effect.orElseSucceed(door.cards.read(CardName.read(name)), () => null);
  if (text === null) return undefined;
  try {
    const card = parseInboxCard(`${name}.md`, text);
    return {
      body: card.body,
      labels: card.labels ?? {},
      ...(card.files !== undefined ? { files: card.files } : {}),
      namespace: card.factory ?? DEFAULT_NAMESPACE,
    } satisfies GivenCard;
  } catch {
    return undefined;
  }
});

/**
 * The run's labels as the store holds them now (`/registry/runmarks/<id>/labels`), else those on the run as the pass read it, else none.
 */
const storedLabels = Effect.fnUntraced(function* (run: Run) {
  const stored = yield* Effect.result((yield* RunDoor).runs.find(RunId.read(run.id), () => {}));
  return (stored._tag === 'Success' ? stored.success?.labels : undefined) ?? run.labels ?? {};
});

/** What the pass read of why a node acts: its condition's name, the route it took and the reason its producer signed off with. */
const whyOf = (run: Run, reads: SendReads, node: StepSpec, wordOf: ReturnType<typeof wordReader>) => {
  const condition = conditionOf(node, reads.steps);
  const answer = condition ? answeredRoute(condition, run, reads.signedOff, wordOf, reads.steps) : undefined;
  const producer = condition ? reads.signedOff(routeProducer(condition)) : undefined;
  const why = { condition: condition?.name ?? '', route: answer?.kind === 'route' ? answer.route : undefined, reason: producer?.summary };
  return { why, title: sentCardTitle(run, producer) };
};

/** The note `sendCards` leaves on the pass for the run the node `node` started. */
const startedNote = (node: StepSpec, child: string) => `${node.name}: started the run ${child} of ${node.workflow ?? ''}.`;

/** What a refusal of the child's start says on the node's row. */
const refusalText = (node: StepSpec, err: unknown) =>
  `${node.name}: the run of ${node.workflow ?? ''} could not be started — ${err instanceof Error ? err.message : String(err)}`;

/**
 * The run the node `name` of `run` started, where one stands: found again by its claim's record (`startedBy`), so a pass that started it
 * and died before the record was written adopts it.
 */
const childOf = Effect.fnUntraced(function* (run: Run, name: string) {
  const all = yield* (yield* RunDoor).runs.list();
  return all.find((r) => r.startedBy?.run === run.id && r.startedBy.node === name);
});

/**
 * Start the run of the workflow node `node`: its place resolved as a card's start resolves it (`workflowPlace`), handed `run` as context,
 * briefed by `childBrief`, the run's stored labels its card labels, and the given card's files (same factory) its inputs under
 * `brief: card`. Fails with what `startRun` refuses; a run already claimed by the node is found again by the caller.
 */
const startChild = Effect.fnUntraced(function* (
  door: CardDoorShape,
  f: { run: Run; reads: SendReads },
  node: StepSpec,
  wordOf: ReturnType<typeof wordReader>,
) {
  const { run, reads } = f;
  const { why, title } = whyOf(run, reads, node, wordOf);
  const given = node.brief === 'card' ? yield* givenCard(door, run) : undefined;
  const labels = yield* storedLabels(run);
  const factory = yield* Effect.orElseSucceed(factoryOrNone(run.factory), () => undefined);
  const { repo, workflowDir } = yield* workflowPlace({
    filed: factory,
    name: node.workflow ?? '',
    callerRepo: isRepositoryRun(run) ? run.repo : '.',
  });
  const cardFiles =
    given?.files?.length && sameFactory(run, given)
      ? yield* cardFilesAt(yield* StoreRoot, { factory: given.namespace, files: given.files })
      : [];
  const started = yield* startRun({
    brief: childBrief(run, node, why, title, given),
    repo,
    repoNamed: false,
    workflowDir,
    context: [run.id],
    startedBy: { run: run.id, node: node.name },
    ...(cardFiles.length ? { cardFiles } : {}),
    ...(run.factory ? { factory: run.factory } : {}),
    labels: { card: given?.labels ?? labels },
  });
  return { child: started.id, leftOff: filesLeftOff(run, node, given) };
});

/**
 * Send each workflow node in `send`: start its run (`startChild`) or, on a `card: backlog` node, file the card back to the inbox,
 * exclusively, and write `sent` on its record — `sent: { run, at }`, or `sent: { card, at }` — answering with the nodes written.
 * A run already claimed by the node, or a card already at its name — a pass that started or filed it and died before the record was
 * written — is adopted, dated when it was made, so a pass never sends twice. A node already `sent` is left as it is. A start the factory
 * refuses is written on the node as `refused` and tried again on each pass, so a factory that is fixed is picked up.
 */
export const sendCards = Effect.fn('sendCards')(function* (f: { run: Run; reads: SendReads; notes: string[] }, send: readonly string[]) {
  const { run, reads } = f;
  const door = yield* CardDoor;
  const wordOf = wordReader(run, reads);
  const sent: string[] = [];
  for (const name of send) {
    const node = found(
      reads.steps.find((s) => s.name === name),
      `the workflow node ${name}`,
    );
    if ((node.workflow === undefined && node.card !== 'backlog') || run.steps[name]?.sent) continue;
    const now = new Date().toISOString();
    const at = { ...(run.steps[name] ?? { taskId: null }) };
    delete at.refused;
    if (node.card === 'backlog') {
      const card = backlogCardName(run.id, name);
      const { why } = whyOf(run, reads, node, wordOf);
      const given = yield* givenCard(door, run);
      const text = sentCardText(run, node, why, yield* storedLabels(run), given);
      const filed = yield* Effect.result(door.cards.add(CardName.read(card), text));
      if (filed._tag === 'Failure' && filed.failure._tag !== 'Conflict') {
        f.notes.push(`${name}: its card ${card} could not be filed — ${filed.failure.message}. The next pass files it again.`);
        continue;
      }
      const filedAt = filed._tag === 'Failure' ? ((yield* door.cards.filedAt(CardName.read(card))) ?? now) : now;
      run.steps[name] = { ...at, sent: { card, at: filedAt } };
      f.notes.push(`${name}: filed the card ${card} back to the inbox, unqueued.`);
      const leftOff = filesLeftOff(run, node, given);
      if (leftOff.length)
        f.notes.push(
          `${name}: its card ${card} carries none of ${leftOff.join(', ')}: the card it was given from is of another factory than the run's, ${run.factory ?? DEFAULT_NAMESPACE}, which keeps none of its Files. Attach them to ${card} with nemia inbox attach ${card} <path>.`,
        );
      sent.push(name);
      continue;
    }
    const claimed = yield* childOf(run, name);
    if (claimed !== undefined) {
      run.steps[name] = { ...at, sent: { run: claimed.id, at: claimed.createdAt } };
      f.notes.push(startedNote(node, claimed.id));
      sent.push(name);
      continue;
    }
    const started = yield* Effect.result(startChild(door, f, node, wordOf));
    if (started._tag === 'Success') {
      const { child, leftOff } = started.success;
      run.steps[name] = { ...at, sent: { run: child, at: now } };
      f.notes.push(startedNote(node, child));
      if (leftOff.length)
        f.notes.push(
          `${name}: the run ${child} carries none of ${leftOff.join(', ')}: the card it was given from is of another factory than the run's, ${run.factory ?? DEFAULT_NAMESPACE}, which keeps none of its Files.`,
        );
      sent.push(name);
      continue;
    }
    const raced = yield* childOf(run, name);
    if (raced !== undefined) {
      run.steps[name] = { ...at, sent: { run: raced.id, at: raced.createdAt } };
      f.notes.push(startedNote(node, raced.id));
      sent.push(name);
      continue;
    }
    const message = refusalText(node, started.failure);
    if (run.steps[name]?.refused?.message === message) continue;
    run.steps[name] = { ...at, refused: { message, at: now } };
    f.notes.push(`${message}. The next pass tries again.`);
    sent.push(name);
  }
  return sent;
});
