/**
 * A card's phase (`cardPhase`, proved by contracts/card-phase.contract.ts): where a card stands as a person sorts cards, a summary of its
 * finer state, as Kubernetes' Pod phase is of its containers' states. Pure.
 */
import type { CardPhaseOf } from '../../contracts/card-phase.contract.ts';

/**
 * The phase of the card `read` describes: its run's end says done, failed or cancelled; a run at work, or a queued card that waits on no
 * card, says working; a refused start, a run waiting on a person, or a queued card whose wait is stalled says waiting; a queued card held
 * by cards of its after: says blocked; a card filed says notStarted.
 * @param read The card's state, and the waits of its `after:`.
 */
export const cardPhase: CardPhaseOf = (read) => {
  switch (read.state) {
    case 'succeeded':
      return 'done';
    case 'failed':
      return 'failed';
    case 'stopped':
    case 'cancelled':
      return 'cancelled';
    case 'pending':
    case 'running':
      return 'working';
    case 'waiting':
    case 'refused':
      return 'waiting';
    case 'queued':
      return read.waits === 'stalled' ? 'waiting' : read.waits === 'held' ? 'blocked' : 'working';
    case 'filed':
      return 'notStarted';
  }
};
