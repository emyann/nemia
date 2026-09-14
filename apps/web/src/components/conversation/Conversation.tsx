import { Shimmer } from '@/components/ai-elements/shimmer';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { tailStart, type Turn } from '@/lib/transcript';
import { cn } from '@/lib/utils';
import { TurnView } from './Turns';

type Props = {
  turns: Turn[];
  /** Whether the session may still add to it: the last call runs, and the end says it is being followed. */
  live: boolean;
  /** `compact` for the inspector's narrow tab; the session page's by default. */
  density?: 'page' | 'compact';
  className?: string;
};

/**
 * A step's conversation, in shadcn's scroller: read-only, newest at the bottom. It starts at the end, and follows what is
 * added while the reader is at the bottom; a reader who scrolls up is left where they are, with a button back down.
 */
export function Conversation({ turns, live, density = 'page', className }: Props) {
  // Where nothing has been said since: a call there with no result is still running while the session is live.
  const tail = tailStart(turns);
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className={className}>
        <MessageScrollerViewport aria-label="The step's conversation">
          <MessageScrollerContent
            className={cn(density === 'page' ? 'mx-auto w-full max-w-3xl gap-5 px-4 py-6' : 'gap-3 py-1 pr-1 text-xs [&_[data-slot=bubble-content]]:text-xs')}
          >
            {turns.map((turn, i) => (
              <MessageScrollerItem key={turn.key} messageId={turn.key}>
                <TurnView turn={turn} live={live} last={i === turns.length - 1} tail={i >= tail} />
              </MessageScrollerItem>
            ))}
            {live && (
              <MessageScrollerItem key="following">
                <Shimmer as="p" className="text-xs text-muted-foreground">
                  Following the session as it goes
                </Shimmer>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
