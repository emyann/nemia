/**
 * The lines over a step's session that are about the session itself, each the shared band both conversations draw
 * (`conversation/ConversationBand.tsx`): the session the api is reading again on a beat, the session the board cannot read at all, and
 * the session that has ended, which is where a person is told there is nobody left to say anything to.
 *
 * The frame is the family's; the words are a step's alone, which is why they live here and not in the family's folder.
 */
import { CircleXIcon, PauseIcon, RefreshCwIcon } from 'lucide-react';
import { ConversationBand } from '@/components/conversation/ConversationBand';

/**
 * A session the api cannot stream and is reading again on a beat, `why` in the api's own words: a quiet note, not a failure, since
 * nothing is lost and what the session says arrives a beat later. It goes of itself once a live stream can be had again.
 */
export function SessionRetryingBand({ why }: { why: string }) {
  return (
    <ConversationBand role="status" what="retrying" icon={<RefreshCwIcon />} title="Reading the session again">
      {`${why} Nothing is lost; what it says next arrives a moment later.`}
    </ConversationBand>
  );
}

/** The session unread: the board asked the api for it and was refused or not answered, `why` as the read said it. */
export function SessionUnreadableBand({ why }: { why: string }) {
  return (
    <ConversationBand role="alert" what="unreadable" icon={<CircleXIcon />} title="The board cannot read this session">
      {why}
    </ConversationBand>
  );
}

/**
 * The session that has ended, or that there is not yet one to say anything to: nothing more arrives here, and `why` is where to act
 * instead (`sayable`). It stands in the composer's place, which is not drawn at all while this band is — one sentence about the fact,
 * not two in two voices (the owner's answer at design's gate).
 */
export function SessionStoppedBand({ why }: { why: string }) {
  return (
    <ConversationBand role="status" what="stopped" icon={<PauseIcon />} title="Nothing more arrives here">
      {why}
    </ConversationBand>
  );
}
