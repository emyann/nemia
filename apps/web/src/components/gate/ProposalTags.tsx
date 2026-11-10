import type { ProposalPhase } from 'objects';
import { filled, ringed } from '@/lib/meaning';
import { widensHue } from '@/lib/proposals';
import { cn } from '@/lib/utils';
import { PROPOSAL_WORDS } from '@/lib/words';

/** What the Widens access mark means, on hover. */
const WIDENS_TITLE = 'An object it changes reaches further than it did: read each change before approving it.';

/**
 * A proposal's tags, wherever the board names one: its phase in the person's words, filled in its hue with its whole sentence on hover
 * (`PROPOSAL_WORDS`), and the *Widens access* mark where the machinery says it widens, ringed in yours while it waits on you. `size` is
 * the proposal's own page's (`medium`) or a row of the factory's list (`small`).
 */
export function ProposalTags({ phase, widens, size }: { phase: ProposalPhase; widens: boolean; size: 'small' | 'medium' }) {
  const words = PROPOSAL_WORDS[phase];
  const type = size === 'small' ? 'text-label-small' : 'text-label-medium';
  return (
    <>
      <span data-proposal-word title={words.title} className={cn('rounded px-2 py-0.5', type, filled[words.hue])}>
        {words.word}
      </span>
      {widens && (
        <span data-proposal-widens title={WIDENS_TITLE} className={cn('rounded px-2 py-0.5', type, ringed[widensHue(phase)])}>
          Widens access
        </span>
      )}
    </>
  );
}
