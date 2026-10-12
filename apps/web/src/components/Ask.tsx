/**
 * A person's ask of a step's next try, as the board's rows make it: the CLI `retry`'s ways, the button and box every ask is made with, the
 * ask itself through the api (`useAsk`), and the api's refusal of it, verbatim (`Refusal`); and the asks of a loop's round (`useRound`)
 * and of its acceptance (`useAccept`).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptLoop, askRound, askTry, type QuestionAnswer, type RetryMode } from '../lib/api';
import { runsMoved } from '@/lib/runWrites';

/** Each of the CLI `retry`'s ways, as an answer offers it. */
export const MODES: Record<RetryMode, string> = {
  nudge: 'continue its session',
  fresh: 'a new session',
  recheck: 'its check again, and no session',
};

export const BUTTON =
  'rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary';

export const TEXTAREA =
  'block w-full resize-y rounded border border-outline bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none';

/**
 * An ask for a step's next try through the api (`askTry`), and the run read again once the api has it: its own record alone (`exact`),
 * never its decisions, which are keyed by the state of the run they were read for (`decisionStamp`) — a refetch of the key the page is on
 * would fill it with the answer for the state after this write, which is what the next key is for — and the list the Factory's card reads,
 * which answers a gate from the board.
 *
 * A mutation's `step` names another step to try instead, at an ending step's gate, where the send-back goes to the work and not to the step
 * at the gate (`sendBackTo` in agent-orchestrator); the request the api takes does not carry it. Its `answers` are a person's to the
 * questions the step's closeout asks, which the api checks and writes as the try's message, the `message` beside them their note.
 */
export function useAsk(runId: string, step: string, onAsked: () => void) {
  const queryClient = useQueryClient();
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
    }) => askTry(runId, to ?? step, how),
    onSuccess: () => {
      onAsked();
      void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });
      void runsMoved(queryClient);
    },
  });
}

/**
 * An acceptance of a loop out of rounds through the api (`acceptLoop`), and the run read again once the api has it — its detail, and the
 * list the Factory's card reads, each by its own key (`exact`): a decision is keyed by the state it was read for, and the next state is a
 * key of its own.
 */
export function useAccept(runId: string, step: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (how: { message: string }) => acceptLoop(runId, step, how),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });
      void runsMoved(queryClient);
    },
  });
}

/**
 * An ask for another round of a run's loop through the api (`askRound`), and the run read again once the api has it: its record alone
 * (`exact`), as for a try, since a decision is keyed by the state it was read for.
 */
export function useRound(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (how: { step?: string; budget?: number }) => askRound(runId, how),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });
    },
  });
}

/**
 * The api's refusal of an ask, beside what made it, verbatim: the package's sentence, or the api's own about the request. `not` says what
 * did not happen: `Not asked`, or `Not approved`.
 */
export function Refusal({ error, not = 'Not asked' }: { error: Error; not?: string }) {
  return (
    <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-sm font-medium text-on-failure-container">{not}. The api refused it:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{error.message}</p>
    </div>
  );
}
