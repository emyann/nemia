/**
 * A route to a workflow files a card (`sendCards`): each workflow node due its card (`Assessment.send`) files one queued card through the
 * Card door, under a name its run and node derive (`sentCardName`), and its record keeps `sent` once. A controller.
 */
import { Effect } from 'effect';
import type { Workflow } from '../workflow.ts';
import { isRepositoryRun, type CloseoutAsked, type Run, type StepStatus, type TaskPhase } from '../record/record.ts';
import { stepStatus, type SpendOf } from '../status/status.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { firstPiece } from '../piece/piece.ts';
import { answeredRoute } from './route-words.ts';
import { conditionOf } from './route.ts';
import type { Closeout } from '../closeout/index.ts';
import { found } from '../tick/told.verb.ts';
import type { Verdict } from '../check/check.ts';

/** What a pass files of its due work: the steps ready (`Assessment.ready`) and the workflow nodes due their card (`Assessment.send`). */
export type Due = { ready: readonly string[]; send: readonly string[] };

/** What a pass read that a route's words are read by: the tick's `PassReads`, which this names no further to keep the import one way. */
export type SendReads = {
  steps: Workflow[];
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

/** The text of a routed card: queued, on the node's workflow, handed the caller as context (`from:`), its repository and factory kept. */
export function sentCardText(run: Run, node: Workflow, condition: string, route: string | undefined, at: string): string {
  const keys = [
    `workflow: ${node.workflow ?? ''}`,
    ...(isRepositoryRun(run) ? [`repo: ${run.repo}`] : []),
    ...(run.factory ? [`factory: ${run.factory}`] : []),
    `from: ${run.id}`,
    `queued: ${at}`,
  ];
  const asked = firstPiece(run.brief, '\n').trim() || `Work routed on from run ${run.id}`;
  const why = `Routed from run ${run.id}: its condition \`${condition}\`${route ? ` took the route \`${route}\`, which` : ''} files this card for the workflow \`${node.workflow ?? ''}\` (its node \`${node.name}\`). What the condition read is handed to this run under \`## From run ${run.id}\`.`;
  return ['---', ...keys, '---', '', asked, '', why, ''].join('\n');
}

/**
 * File the card of each workflow node in `send`, exclusively, and write `sent: { card, at }` on its record: answers with the nodes written.
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
    const answer = condition ? answeredRoute(condition, run, reads.signedOff, wordOf) : undefined;
    const card = sentCardName(run.id, name);
    const now = new Date().toISOString();
    const text = sentCardText(run, node, condition?.name ?? '', answer?.kind === 'route' ? answer.route : undefined, now);
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
