/**
 * A person's ask of a step's next try, as the board's rows make it: the CLI `retry`'s ways, the button and box every ask is made with, the
 * ask itself through the api (`useAsk`), and the api's refusal of it, verbatim (`Refusal`); and the asks of a loop's round (`useRound`)
 * and of its approval as it stands (`useApprove`).
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { approveStep, askRound, askTry, type QuestionAnswer, type RetryMode } from '../../lib/api';
import { runsMoved } from '@/lib/runWrites';
import { useRunNamespace } from '@/lib/runNamespace';

/** Each of the CLI `retry`'s ways, as an answer offers it. */
export const MODES: Record<RetryMode, string> = {
  continue: 'continue its session',
  fresh: 'a new session',
  recheck: 'its check again, and no session',
};

export const BUTTON =
  'rounded bg-primary px-3 py-1.5 text-body-medium font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary';

export const TEXTAREA =
  'block w-full resize-y rounded border border-outline bg-background px-2 py-1.5 text-body-medium placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none';

/**
 * An ask for a step's next try through the api (`askTry`), and the run read again once the api has it: its own record alone (`exact`),
 * never its decisions, which are keyed by the state of the run they were read for (`decisionStamp`) — a refetch of the key the page is on
 * would fill it with the answer for the state after this write, which is what the next key is for — and the list the Factory's card reads,
 * which answers a gate from the board.
 *
 * A mutation's `step` names another step to try instead, at an ending step's gate, where the send-back goes to the work and not to the step
 * at the gate (`sendBackTo` in agent-orchestrator); the request the api takes does not carry it. Its `answers` are a person's to the
 * questions the step's closeout asks, which the api checks and writes as the try's message, the `message` beside them their note.
 *
 * Sent in the run's namespace: `namespace` where the caller holds it, as a card on the floor does, else the run's own (`useRunNamespace`).
 */
export function useAsk(runId: string, step: string, onAsked: () => void, namespace?: string) {
  const queryClient = useQueryClient();
  const namespaceNow = useRunNamespace(runId, namespace);
  return useMutation({
    mutationFn: ({
      step: to,
      ...how
    }: {
      mode: RetryMode;
      message?: string;
      budget?: number;
      answers?: readonly QuestionAnswer[];
      step?: string;
    }) => namespaceNow().then((ns) => askTry(ns, runId, to ?? step, how)),
    onSuccess: () => {
      onAsked();
      void runsMoved(queryClient, runId);
    },
  });
}

/**
 * An approval of a loop out of rounds as it stands through the api (`approveStep`), which on a loop ends it as the CLI's `approve` does,
 * and the run read again once the api has it — its detail, and the list the Factory's card reads, each by its own key (`exact`): a
 * decision is keyed by the state it was read for, and the next state is a key of its own.
 */
export function useApprove(runId: string, step: string) {
  const queryClient = useQueryClient();
  const namespaceNow = useRunNamespace(runId);
  return useMutation({
    mutationFn: (how: { message: string }) => namespaceNow().then((ns) => approveStep(ns, runId, step, how)),
    onSuccess: () => {
      void runsMoved(queryClient, runId);
    },
  });
}

/**
 * An ask for another round of a run's loop through the api (`askRound`), and the run read again once the api has it, as for a try
 * (`runsMoved`): its own record, and the list the frame reads, since the api drops the step from those waiting on you and marks the round
 * due at once.
 */
export function useRound(runId: string) {
  const queryClient = useQueryClient();
  return useMutation(roundAsk(queryClient, runId, useRunNamespace(runId)));
}

/** What `useRound` hands `useMutation`: the ask in the run's namespace, as `namespaceNow` answers it, and the reads it makes again. */
export const roundAsk = (queryClient: QueryClient, runId: string, namespaceNow: () => Promise<string>) => ({
  mutationFn: ({ step, ...how }: { step: string; budget?: number }) => namespaceNow().then((ns) => askRound(ns, runId, step, how)),
  onSuccess: () => {
    void runsMoved(queryClient, runId);
  },
});

/**
 * The api's refusal of an ask, beside what made it, verbatim: the package's sentence, or the api's own about the request. `not` says what
 * did not happen: `Not asked`, or `Not approved`.
 */
export function Refusal({ error, not = 'Not asked' }: { error: Error; not?: string }) {
  return (
    <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-body-medium font-medium text-on-failure-container">{not}. The api refused it:</p>
      <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{error.message}</p>
    </div>
  );
}
