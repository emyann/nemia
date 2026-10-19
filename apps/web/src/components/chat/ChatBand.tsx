/**
 * The lines inside Nemia's chat that are about the chat itself, each the shared band both conversations draw
 * (`conversation/ConversationBand.tsx`): her session stopped, with a way to start it, the board having lost the daemon, her chat the
 * board cannot read at all, and her chat the api is reading again on a beat.
 */
import { CircleXIcon, PauseIcon, RefreshCwIcon } from 'lucide-react';
import { ConversationBand } from '@/components/conversation/ConversationBand';
import { LinkButton } from '@/components/ui/button';
import { clockWord } from '@/lib/quota';
import { routeLink } from '../routeLink';

const RouterLinkButton = routeLink(LinkButton);

/**
 * Why her session stopped, and what to do: Start her session leads to her settings, where a level above Manual files her one, and Why
 * it stopped to the same page's section. `words` is the board's own account of her session (`sessionOf`).
 */
export function ChatStoppedBand({ words }: { words: string }) {
  return (
    <>
      <ConversationBand role="status" what="stopped" icon={<PauseIcon />} title="Her session stopped">
        {`${words} Your factories still tick; gates still come to you. What you write waits for her.`}
      </ConversationBand>
      <div className="flex flex-wrap gap-2">
        <RouterLinkButton to="/settings" variant="secondary" size="sm" data-chat-start>
          Start her session
        </RouterLinkButton>
        <RouterLinkButton to="/settings" variant="link" size="sm">
          Why it stopped
        </RouterLinkButton>
      </div>
    </>
  );
}

/**
 * The board having lost the daemon, since `since`: it tries the kept message again on its own, and nothing the person wrote is lost.
 * What they may do with that message — send it again, change it, throw it away — is on the message itself (`ChatKeptMessage`).
 */
export function ChatLostBand({ since, now }: { since: string; now: Date }) {
  return (
    <ConversationBand role="alert" what="lost" icon={<CircleXIcon />} title="No answer from the daemon">
      {`Since ${clockWord(new Date(since), now)}. The board tries again every few seconds; nothing you wrote is lost.`}
    </ConversationBand>
  );
}

/**
 * Her chat unread: the board asked the api for it and was refused or not answered, `why` as the read said it. Nothing of her is drawn
 * beside it — a greeting with a level and counts read from nothing would say what the board does not know — and the board reads again
 * on its own every few seconds.
 */
export function ChatUnreadableBand({ why }: { why: string }) {
  return (
    <ConversationBand role="alert" what="unreadable" icon={<CircleXIcon />} title="The board cannot read her chat">
      {`${why}. It reads again every few seconds; what you write is kept here until the api takes it.`}
    </ConversationBand>
  );
}

/**
 * Her chat the api cannot stream and is reading again on a beat, `why` in the api's own words: a quiet note, not a failure, since
 * nothing is lost and what she says arrives a beat later. It goes of itself once a live stream can be had again.
 */
export function ChatRetryingBand({ why }: { why: string }) {
  return (
    <ConversationBand role="status" what="retrying" icon={<RefreshCwIcon />} title="Reading her chat again">
      {`${why} Nothing is lost; what she says arrives a moment later.`}
    </ConversationBand>
  );
}
