/**
 * A route to a workflow files a card (`sendCards`): each workflow node due its card (`Assessment.send`) files one queued card through the
 * Card door, under a name its run and node derive (`sentCardName`), and its record keeps `sent` once. A controller.
 */
import { Effect } from 'effect';
import type { StepSpec } from '../workflow.ts';
import { isRepositoryRun, type CloseoutAsked, type Run, type StepStatus, type TaskPhase } from '../record/record.ts';
import { stepStatus, type SpendOf } from '../status/status.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import type { Labels } from '../labels/labels.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { firstPiece } from '../piece/piece.ts';
import { answeredRoute } from '../route/routed/index.ts';
import { conditionOf } from '../route/index.ts';
import type { Closeout } from '../closeout/index.ts';
import { found } from '../tick/told.verb.ts';
import { renderFrontmatter, type FrontmatterPair } from '../frontmatter/frontmatter.ts';
import type { Verdict } from '../check/check.ts';

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

/** Each step's own word on the pass, as the pass read it (`stepStatus`): what a route's producer is read by. `pending` for no such step. */
export const wordReader =
  (run: Run, reads: SendReads) =>
  (name: string): StepStatus => {
    const step = reads.steps.find((s) => s.name === name);
    return step
      ? stepStatus(step, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf, reads.verdictOf)
      : 'pending';
  };

/**
 * The card a workflow node files: `<run>-<node>-routed`. A person's card is named by `runId`, whose last piece is four letters or digits,
 * so a name whose last piece is `routed` is never drawn for one.
 */
export const sentCardName = (run: string, node: string): string => `${run}-${node}-routed`;

/**
 * The step whose closeout a condition's route was read from: a table's producer (`route: { from: <producer>.<field> }`), else the
 * condition itself, a judge or a script whose own closeout said the route.
 */
export const routeProducer = (condition: StepSpec): string =>
  condition.route?.kind === 'table' ? firstPiece(condition.route.from, '.') : condition.name;

/**
 * The title a routed card opens with: the first line of the `title` its condition's producer signed off on, where its `output:` declares
 * one and it says one; else the first line of the run's brief, the run's own title.
 */
export function sentCardTitle(run: Run, producer: Closeout | undefined): string {
  const said = producer?.output?.title;
  const title = typeof said === 'string' ? firstPiece(said.trim(), '\n').trim() : '';
  return title || firstPiece(run.brief, '\n').trim() || `Work routed on from run ${run.id}`;
}

/**
 * The text of a routed card: queued, on the node's workflow, handed the caller as context (`from:`), its repository and factory kept, the
 * run's labels (`labels`, `runs/<id>.labels`) as its own `labels:`, so a card routed out of a labelled run is selected by the same labels,
 * and `title` its first line.
 */
export function sentCardText(
  run: Run,
  node: StepSpec,
  condition: string,
  route: string | undefined,
  at: string,
  title: string,
  labels: Labels,
): string {
  const keys: FrontmatterPair[] = [
    ['workflow', node.workflow ?? ''],
    ...(isRepositoryRun(run) ? [['repo', run.repo] as const] : []),
    ...(run.factory ? [['factory', run.factory] as const] : []),
    ['from', run.id],
    ['queued', at],
    ...(Object.keys(labels).length ? [['labels', labels] as const] : []),
  ];
  const why = `Routed from run ${run.id}: its condition \`${condition}\`${route ? ` took the route \`${route}\`, which` : ''} files this card for the workflow \`${node.workflow ?? ''}\` (its node \`${node.name}\`). What the condition read is handed to this run under \`## From run ${run.id}\`.`;
  return ['---', renderFrontmatter(keys).replace(/\n$/, ''), '---', '', title, '', why, ''].join('\n');
}

/** The run's labels as the store holds them now (`runs/<id>.labels`), else those on the run as the pass read it, else none. */
const storedLabels = Effect.fnUntraced(function* (run: Run) {
  const stored = yield* Effect.result((yield* RunDoor).runs.find(RunId.read(run.id), () => {}));
  return (stored._tag === 'Success' ? stored.success?.labels : undefined) ?? run.labels ?? {};
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
    if (node.workflow === undefined || run.steps[name]?.sent) continue;
    const condition = conditionOf(node, reads.steps);
    const answer = condition ? answeredRoute(condition, run, reads.signedOff, wordOf, reads.steps) : undefined;
    const card = sentCardName(run.id, name);
    const now = new Date().toISOString();
    const title = sentCardTitle(run, condition ? reads.signedOff(routeProducer(condition)) : undefined);
    const labels = yield* storedLabels(run);
    const text = sentCardText(run, node, condition?.name ?? '', answer?.kind === 'route' ? answer.route : undefined, now, title, labels);
    const filed = yield* Effect.result(door.cards.add(CardName.read(card), text));
    if (filed._tag === 'Failure' && filed.failure._tag !== 'Conflict') {
      f.notes.push(`${name}: its card ${card} could not be filed — ${filed.failure.message}. The next pass files it again.`);
      continue;
    }
    const at = filed._tag === 'Failure' ? ((yield* door.cards.filedAt(CardName.read(card))) ?? now) : now;
    run.steps[name] = { ...(run.steps[name] ?? { taskId: null }), sent: { card, at } };
    f.notes.push(`${name}: filed the card ${card}, queued for ${node.workflow}.`);
    sent.push(name);
  }
  return sent;
});
