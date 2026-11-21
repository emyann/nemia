/**
 * Whether a started card may be sent on — filed again as a card of its own, to the workflow a person names or naming none for its
 * factory's triggers, handed the runs it was started as (`nemia inbox resend`, the Card's `resend`, `POST
 * /api/namespaces/<factory>/cards/<name>/resend`) — and why not (agent-orchestrator, src/inbox/resend.ts, `resendRefusal`), before anything
 * is written: a card no run was started from has nothing to be sent on from, and is queued or started as it is (`unstarted`, naming
 * `nemia inbox queue`); a card sent on already has its card filed, under the name its runs give it (`sent`, a Conflict naming that card),
 * so the idea is never sent on twice from one card; and a card whose run is still pending or running is not sent on while that run works
 * (`in-flight`, naming `nemia cancel`), so the idea never runs twice at once. A card whose run waits on a person — blocked, or at a gate —
 * or has ended, is sent on.
 *
 * One refusal is answered where several hold, the first of that order.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CardState } from 'objects';

/**
 * What the refusal is read from: the card's state as the inbox judges it (`CardState`: its own word until it starts, its run's phase from
 * then on), and whether a card is filed already under the name its sending on would take (`taken`).
 */
export type ResendAsk = {
  readonly state: CardState;
  readonly taken: boolean;
};

/** Why a card is not sent on, closed: never started, sent on already, or its run still at work. */
export type ResendRefusal = 'unstarted' | 'sent' | 'in-flight';

/** Whether the card's state is a run's phase: a run was started from it. */
const started = (state: CardState) => state !== 'filed' && state !== 'queued' && state !== 'refused';

/** Whether the card's run is still at work: started and not yet waiting on a person, nor ended. */
const atWork = (state: CardState) => state === 'pending' || state === 'running';

const resendRefusalSpec = spec<(ask: ResendAsk) => ResendRefusal | null>({
  ensures: {
    unstartedRefused: {
      description: 'A card no run was started from is refused as unstarted, whatever else holds: it is queued or started as it is',
      condition: ({ input: [ask], output }) => started(ask.state) || output === 'unstarted',
    },
    sentOnce: {
      description: 'A started card whose sent-on card is filed already is refused as sent: an idea is sent on once from a card',
      condition: ({ input: [ask], output }) => !started(ask.state) || !ask.taken || output === 'sent',
    },
    waitsForItsRun: {
      description: 'A started card not yet sent on, whose run is pending or running, is refused as in flight: the idea never runs twice at once',
      condition: ({ input: [ask], output }) => !started(ask.state) || ask.taken || !atWork(ask.state) || output === 'in-flight',
    },
    sentOnOtherwise: {
      description: 'A started card not yet sent on, whose run waits on a person or has ended, is sent on',
      condition: ({ input: [ask], output }) => !started(ask.state) || ask.taken || atWork(ask.state) || output === null,
    },
  },
});

/** `resendRefusal`'s type, which src/inbox/resend.ts takes. */
export type ResendRefusalOf = Implementation<typeof resendRefusalSpec>;
