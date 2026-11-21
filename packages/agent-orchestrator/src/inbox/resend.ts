/**
 * A started card sent on (`nemia inbox resend`): filed again as a card of its own, `<run>-resent`, to the workflow a person names or
 * naming none for its factory's card triggers, handed the runs it was started as. Whether it may be (`resendRefusal`, whose laws are
 * contracts/resend.contract.ts'), the words of each refusal (`resendRefusalMessage`), which run it is sent on from (`resentFrom`), the new
 * card's name (`resentCardName`) and its text (`resentText`). Pure: resend.verb.ts reads the card, its runs and the inbox.
 */
import type { ResendRefusal, ResendRefusalOf } from '../../contracts/resend.contract.ts';
import type { RunPhase } from '../phase/phase.ts';
import { CARD_IN_PLAY, cardText, type InboxCard } from './inbox.ts';

/**
 * Why a started card is not sent on, closed, or null where it is: `unstarted`, a card no run was started from; `sent`, one whose sent-on
 * card is filed already (`taken`); `in-flight`, one whose run is pending or running. The first of that order where several hold.
 * @param ask The card's state as the inbox judges it, and whether its sent-on card's name is taken.
 */
export const resendRefusal: ResendRefusalOf = (ask) => {
  if (ask.state === 'filed' || ask.state === 'queued' || ask.state === 'refused') return 'unstarted';
  if (ask.taken) return 'sent';
  if (ask.state === 'pending' || ask.state === 'running') return 'in-flight';
  return null;
};

/**
 * The card a started card is sent on as: `<run>-resent`, after the run it is sent on from. A person's card's run is named by `runId`,
 * whose last piece is four letters or digits, so no run's own card ends `-resent`.
 * @param run The run the card is sent on from, by id.
 */
export const resentCardName = (run: string) => `${run}-resent`;

/**
 * The run a card is sent on from, of the runs it was started as with their phases in the order they were started, as its state reads
 * (`cardState`): the first still in play, else the last; undefined for a card no run was started from.
 * @param runs The runs the card was started as, each with its phase as read now, in the order they were started.
 */
export const resentFrom = (runs: readonly { readonly id: string; readonly phase: RunPhase }[]) =>
  runs.find((r) => CARD_IN_PLAY[r.phase]) ?? runs.at(-1);

/**
 * The words of a refusal of `nemia inbox resend`, each naming what to do instead.
 * @param refusal Why the card is not sent on.
 * @param card The card asked to be sent on, by name.
 * @param run The run it was started as that its state reads, by id; none for a card never started.
 */
export function resendRefusalMessage(refusal: ResendRefusal, card: string, run: string | undefined) {
  const runId = run ?? '<run>';
  switch (refusal) {
    case 'unstarted':
      return `${card}: no run was started from this card, so there is nothing to send it on from. Queue it on the workflow it needs — nemia inbox queue ${card} --workflow <name> — or start it: nemia start ${card} --workflows <name>. Nothing was filed.`;
    case 'sent':
      return `${card}: sent on already, as the card ${resentCardName(runId)}: an idea is sent on once from a card. Read it with nemia inbox, or drop it first with nemia inbox rm ${resentCardName(runId)}. Nothing was filed.`;
    case 'in-flight':
      return `${card}: its run ${runId} is still at work, and the idea never runs twice at once. Wait until it waits on you or ends, or call it off first: nemia cancel ${runId}. Nothing was filed.`;
  }
}

/**
 * The text of the card a started card is sent on as (`<run>-resent`): its body, then a line saying where it was sent on from; its
 * `factory:` and `labels:` kept, so its factory's card triggers select it as they selected the card; `from:` its own runs then those it was
 * started as, each once; `workflow:` the one given, queued at `at`, or none and unqueued, for its factory's card triggers; `gate:` and
 * `model:` kept only for the card's own workflow, since they name its steps; `repo:`, retired, dropped. Reads back as a card.
 * @param card The card sent on, as read.
 * @param run The run it is sent on from, by id: what its new card is named after and its line names.
 * @param runs Every run it was started as, by id, in the order they were started: what its new card is handed as context.
 * @param workflow The workflow to send it to, by name; none for its factory's card triggers.
 * @param at The time it is queued at, as an ISO time: read only with a workflow.
 */
export function resentText(card: InboxCard, run: string, runs: readonly string[], workflow: string | undefined, at: string) {
  const to =
    workflow === undefined ? "naming no workflow, for its factory's card triggers to route" : `to the workflow \`${workflow}\``;
  const line = `Sent on from run ${run} (card ${card.name}) with nemia inbox resend, ${to}.`;
  const from = [...new Set([...(card.from ?? []), ...runs])];
  const same = workflow !== undefined && workflow === card.workflow;
  const { gate, model, ...kept } = card;
  const sent: InboxCard = {
    ...kept,
    ...(same && gate !== undefined ? { gate } : {}),
    ...(same && model !== undefined ? { model } : {}),
    file: `${resentCardName(run)}.md`,
    body: `${card.body}\n\n${line}`,
  };
  return cardText(sent, {
    workflow,
    repo: undefined,
    queued: workflow === undefined ? undefined : at,
    from: from.length ? from.join(', ') : undefined,
  });
}
