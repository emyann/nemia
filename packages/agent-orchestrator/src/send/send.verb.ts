/**
 * A card node files a card (`sendCards`): each node due its card (`Assessment.send`) files one card through the Card door, under a name
 * its run and node derive (`sentCardName`), and its record keeps `sent` once — a queued card of its own for its workflow, the run's own
 * card as given for it (`card: given`), or the run's card back to the inbox, unqueued (`card: backlog`). A controller.
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
 * The card a workflow node files: `<run>-<node>-routed`. A person's card is named by `runId`, whose last piece is four letters or digits,
 * so a name whose last piece is `routed` is never drawn for one.
 * @param run The id of the run the node is in.
 * @param node The workflow node's name.
 */
export const sentCardName = (run: string, node: string) => `${run}-${node}-routed`;

/**
 * The step whose closeout a condition's route was read from: a table's producer (`route: { from: <producer>.<field> }`), else the
 * condition itself, a judge or a script whose own closeout said the route.
 * @param condition The condition whose route was read.
 */
export const routeProducer = (condition: StepSpec) =>
  condition.route?.kind === 'table' ? firstPiece(condition.route.from, '.') : condition.name;

/**
 * The title a routed card opens with: the first line of the `title` its condition's producer signed off on, where its `output:` declares
 * one and it says one; else the first line of the run's brief, the run's own title.
 * @param run The run, whose brief and id title the card where the producer says none.
 * @param producer How the condition's producer signed off, or undefined where it has not.
 */
export function sentCardTitle(run: Run, producer: Closeout | undefined) {
  const said = producer?.output?.title;
  const title = typeof said === 'string' ? firstPiece(said.trim(), '\n').trim() : '';
  return title || firstPiece(run.brief, '\n').trim() || `Work routed on from run ${run.id}`;
}

/**
 * The run's own card as it was given, which a `card: given` or `card: backlog` node files on: its body, its labels, its files and the
 * namespace that keeps them (its factory, `default` for none).
 */
export type GivenCard = {
  readonly body: string;
  readonly labels: Labels;
  readonly files?: readonly { readonly name: string; readonly file: string }[];
  readonly namespace?: string;
};

/** Why a card was filed by a node, worded once for its text: the run, its condition, the route and the reason the producer gave. */
type Why = { readonly condition: string; readonly route: string | undefined; readonly reason: string | undefined };

/** The line a routed card says it came from, and the producer's reason where it gave one. */
function whyLines(run: Run, node: StepSpec, why: Why) {
  const took = `its condition \`${why.condition}\`${why.route ? ` took the route \`${why.route}\`, which` : ''}`;
  const where =
    node.card === 'backlog'
      ? `Filed back to the backlog from run ${run.id}: ${took} files this card back to the inbox, unqueued (its node \`${node.name}\`).`
      : `Routed from run ${run.id}: ${took} files this card for the workflow \`${node.workflow ?? ''}\` (its node \`${node.name}\`). What the condition read is handed to this run under \`## From run ${run.id}\`.`;
  const reason = why.reason?.trim();
  return [where, ...(reason ? ['', `Its reason: ${reason}`] : [])];
}

/** `labels` after the edits of `relabel`, kubectl's, each taken with overwrite since the workflow's author wrote it; checked at load. */
const relabelled = (labels: Labels, relabel: readonly string[]) => {
  const parsed = parseLabelEdits(relabel);
  return inheritedLabels({ parents: [], card: labels, edits: 'edits' in parsed ? parsed.edits : [] }).labels;
};

/**
 * The text of the card a node files, by its `card:`. `routed` (the default): queued, on the node's workflow, handed the caller as context
 * (`from:`), its repository and factory kept, the run's labels (`labels`, `/registry/runmarks/<id>/labels`) as its own `labels:`, so a card routed out
 * of a labelled run is selected by the same labels, and `title` its first line. `given`: the same, but the run's own card as it was given
 * (`given`), its body and its labels, else the run's brief, then why it was routed and the producer's reason. `backlog`: the run's card
 * filed back to the inbox naming no workflow and unqueued, its labels after the edits the node's `relabel:` lists. `given` and `backlog`
 * keep the given card's files (`files:`), the same Files by id, where the card's namespace is the run's factory, whose inbox the card
 * is filed in: a File of another namespace is none the onward card's factory keeps, so it is left off there.
 * @param run The run the card is routed from: its id, repository and factory.
 * @param node The node that files the card: its name, its workflow, its `card:` and `relabel:`.
 * @param why The name of the condition whose route filed the card, the route it took where one is said, and the producer's reason.
 * @param at When the card is queued, ISO.
 * @param title The card's first line (`sentCardTitle`), for a routed card.
 * @param labels The run's labels, which a routed card takes as its own.
 * @param given The run's own card, where it was started from one that reads; undefined otherwise.
 */
export function sentCardText(run: Run, node: StepSpec, why: Why, at: string, title: string, labels: Labels, given: GivenCard | undefined) {
  const kind = node.card ?? 'routed';
  const own = given?.labels ?? labels;
  const carried = kind === 'backlog' ? relabelled(own, node.relabel ?? []) : kind === 'given' ? own : labels;
  const keys: FrontmatterPair[] = [
    ...(kind === 'backlog' ? [] : [['workflow', node.workflow ?? ''] as const]),
    ...(isRepositoryRun(run) ? [['repo', run.repo] as const] : []),
    ...(run.factory ? [['factory', run.factory] as const] : []),
    ['from', run.id],
    ...(kind === 'backlog' ? [] : [['queued', at] as const]),
    ...(Object.keys(carried).length ? [['labels', carried] as const] : []),
    ...filesCarried(run, kind, given),
  ];
  const head = ['---', renderFrontmatter(keys).replace(/\n$/, ''), '---', ''];
  if (kind === 'routed') return [...head, title, '', ...whyLines(run, node, { ...why, reason: undefined }), ''].join('\n');
  const body = (given?.body ?? run.brief).trim();
  return [...head, body, '', ...whyLines(run, node, why), ''].join('\n');
}

/** Whether the given card's Files are kept by the run's factory, whose inbox the onward card is filed in. */
const sameFactory = (run: Run, given: GivenCard | undefined) =>
  (given?.namespace ?? DEFAULT_NAMESPACE) === (run.factory ?? DEFAULT_NAMESPACE);

/** The `files:` pair the onward card carries: the given card's files, for `given` and `backlog`, kept in the run's factory. */
const filesCarried = (run: Run, kind: string, given: GivenCard | undefined) => {
  const files = given?.files ?? [];
  const pairs: FrontmatterPair[] =
    kind !== 'routed' && files.length && sameFactory(run, given) ? [['files', Object.fromEntries(files.map((f) => [f.name, f.file]))]] : [];
  return pairs;
};

/**
 * The names of the given card's files the onward card a `given` or `backlog` node files does not carry, since the given card is of
 * another namespace than the run's factory, whose inbox keeps none of its Files; none where it carries them all, or is routed.
 * @param run The run the card is routed from: its factory.
 * @param node The node that files the card: its `card:`.
 * @param given The run's own card, where it was started from one that reads; undefined otherwise.
 */
export function filesLeftOff(run: Run, node: Pick<StepSpec, 'card'>, given: GivenCard | undefined) {
  const kind = node.card ?? 'routed';
  return kind === 'routed' || sameFactory(run, given) ? [] : (given?.files ?? []).map((f) => f.name);
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

/** The run's labels as the store holds them now (`/registry/runmarks/<id>/labels`), else those on the run as the pass read it, else none. */
const storedLabels = Effect.fnUntraced(function* (run: Run) {
  const stored = yield* Effect.result((yield* RunDoor).runs.find(RunId.read(run.id), () => {}));
  return (stored._tag === 'Success' ? stored.success?.labels : undefined) ?? run.labels ?? {};
});

/** What a pass notes of the card `card` the node `node` filed. */
const filedNote = (node: StepSpec, card: string) =>
  node.card === 'backlog'
    ? `${node.name}: filed the card ${card} back to the inbox, unqueued.`
    : `${node.name}: filed the card ${card}, queued for ${node.workflow ?? ''}.`;

/**
 * The text of the card the node `node` of `run` files now (`sentCardText`): titled by its condition's producer, why it was filed by the
 * route its condition answered and the producer's reason, the run's labels as the store holds them, and the run's own card where the node
 * files it given or back to the backlog.
 */
const nodeCardText = Effect.fnUntraced(function* (
  door: CardDoorShape,
  run: Run,
  reads: SendReads,
  node: StepSpec,
  wordOf: ReturnType<typeof wordReader>,
  now: string,
) {
  const condition = conditionOf(node, reads.steps);
  const answer = condition ? answeredRoute(condition, run, reads.signedOff, wordOf, reads.steps) : undefined;
  const producer = condition ? reads.signedOff(routeProducer(condition)) : undefined;
  const labels = yield* storedLabels(run);
  const given = node.card === 'given' || node.card === 'backlog' ? yield* givenCard(door, run) : undefined;
  const why = {
    condition: condition?.name ?? '',
    route: answer?.kind === 'route' ? answer.route : undefined,
    reason: producer?.summary,
  };
  return { text: sentCardText(run, node, why, now, sentCardTitle(run, producer), labels, given), leftOff: filesLeftOff(run, node, given) };
});

/**
 * File the card of each workflow node in `send`, exclusively, titled by its condition's producer (`sentCardTitle`) and labelled by the
 * run's labels as the store holds them now, whichever way the pass read the run (those it read where the store answers none), and write
 * `sent: { card, at }` on its record: answers with the nodes written.
 * A card already at its name — a pass that filed it and died before the record was written — is adopted, dated when it was filed, so a
 * pass never files a second. A node already `sent` is left as it is.
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
    const card = sentCardName(run.id, name);
    const now = new Date().toISOString();
    const { text, leftOff } = yield* nodeCardText(door, run, reads, node, wordOf, now);
    const filed = yield* Effect.result(door.cards.add(CardName.read(card), text));
    if (filed._tag === 'Failure' && filed.failure._tag !== 'Conflict') {
      f.notes.push(`${name}: its card ${card} could not be filed — ${filed.failure.message}. The next pass files it again.`);
      continue;
    }
    const at = filed._tag === 'Failure' ? ((yield* door.cards.filedAt(CardName.read(card))) ?? now) : now;
    run.steps[name] = { ...(run.steps[name] ?? { taskId: null }), sent: { card, at } };
    f.notes.push(filedNote(node, card));
    if (leftOff.length)
      f.notes.push(
        `${name}: its card ${card} carries none of ${leftOff.join(', ')}: the card it was given from is of another factory than the run's, ${run.factory ?? DEFAULT_NAMESPACE}, which keeps none of its Files. Attach them to ${card} with nemia inbox attach ${card} <path>.`,
      );
    sent.push(name);
  }
  return sent;
});
