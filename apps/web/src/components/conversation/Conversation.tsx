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
  /** The message the session is writing, drawn after the turns as its own text is, until the whole message replaces it. */
  partial?: string | null;
  /** `compact` for the inspector's narrow tab; the session page's by default. */
  density?: 'page' | 'compact';
  className?: string;
};

/**
 * A step's conversation, in shadcn's scroller: read-only, newest at the bottom. It starts at the end, and follows what is
 * added while the reader is at the bottom; a reader who scrolls up is left where they are, with a button back down. A call with no result
 * in its tail, where nothing has been said since (`tailStart`), is still running while the session is live.
 */
export function Conversation({ turns, live, partial = null, density = 'page', className }: Props) {
  const tail = tailStart(turns);
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className={className}>
        <MessageScrollerViewport aria-label="The step's conversation">
          <MessageScrollerContent
            className={cn(
              density === 'page'
                ? 'mx-auto w-full max-w-3xl gap-5 px-4 py-6'
                : 'gap-3 py-1 pr-1 text-body-small [&_[data-slot=bubble-content]]:text-body-small',
            )}
          >
            {turns.map((turn, i) => (
              <MessageScrollerItem key={turn.key} messageId={turn.key}>
                <TurnView turn={turn} live={live} last={i === turns.length - 1} tail={i >= tail} />
              </MessageScrollerItem>
            ))}
            {partial !== null && (
              <MessageScrollerItem key="partial" messageId="partial">
                <div data-partial>
                  <TurnView turn={{ kind: 'said', key: 'partial', at: '', role: 'assistant', text: partial }} live={live} last tail />
                </div>
              </MessageScrollerItem>
            )}
            {live && (
              <MessageScrollerItem key="following">
                <Shimmer as="p" className="text-body-small text-muted-foreground">
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
