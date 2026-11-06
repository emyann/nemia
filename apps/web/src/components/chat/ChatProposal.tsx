/**
 * A proposal her message links to (`/factories/<factory>/proposals/<name>`, read by `proposalLinkOf`), drawn under her words as the
 * proposal page's own part (`ProposalCard`), read live, with its Approve and Decline: never a copy, so an approval made on its page reads
 * here on the next read. The board sends no session token, so a click is the person's. Her words above it are hers.
 */
import { ProposalCard } from '@/components/ProposalCard';

/** The proposal `name` of the factory `factory`, in her frame at the width of her asks. */
export function ChatProposal({ factory, name }: { factory: string; name: string }) {
  return (
    <div data-chat-proposal={name} data-factory={factory} className="flex max-w-[94%] min-w-0 flex-col gap-2">
      <ProposalCard factory={factory} name={name} />
    </div>
  );
}
