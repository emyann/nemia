/**
 * The board's one approval of a step, wherever a person approves one: the run page's gate, the Factory's card and a loop out of rounds.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { approveStep, type QuestionAnswer } from './api';
import { useRunNamespace } from './runNamespace';
import { runsMoved } from './runWrites';

/** What an approval carries: its words, the answers to what the step asks, and the budgets a person changed. */
type ApprovalBody = { message?: string; answers?: readonly QuestionAnswer[]; budgets?: readonly { step: string; usd: number }[] };

/**
 * An approval of a step through the api (`approveStep`) — at its gate, or of a loop out of rounds as it stands, which the package ends
 * as the CLI's `approve` does — then `onApproved`, then the run read again once (`runsMoved`): its detail, and the list the Factory's card
 * reads, each by its own key, never a decision, which is keyed by the state it was read for. Sent in the run's namespace: `namespace`
 * where the caller holds it, as a card on the floor does, else the run's own (`useRunNamespace`).
 */
export function useApprove(runId: string, step: string, { onApproved, namespace }: { onApproved?: () => void; namespace?: string } = {}) {
  const queryClient = useQueryClient();
  const namespaceNow = useRunNamespace(runId, namespace);
  return useMutation({
    mutationFn: (how: ApprovalBody) => namespaceNow().then((ns) => approveStep(ns, runId, step, how)),
    onSuccess: () => {
      onApproved?.();
      void runsMoved(queryClient, runId);
    },
  });
}
