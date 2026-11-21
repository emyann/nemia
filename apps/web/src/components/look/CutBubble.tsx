import type { ReactNode } from 'react';
import { cutShape, type CutSize } from './cut';

/** The data marks a caller names the bubble by, under its own prefix (`mark`, `lib/conversation.ts`). */
type Marks = { [mark: `data-${string}`]: string | true | undefined };

/**
 * The agent's words in a conversation, on a ground of the highest surface cut at its top-right and bottom-left corners by `size`: the
 * ground is the bubble's own element, clipped to the cut shape, so the words' ground is read from it. It draws no edge, so its clip
 * cuts none open, and its padding is its own, which keeps what it holds clear of both diagonals. `pre` keeps the words' own line breaks
 * and spaces, for a message told as it is written. The caller's data marks are put on the bubble.
 */
export function CutBubble({ size = 10, pre = false, children, ...marks }: { size?: CutSize; pre?: boolean; children: ReactNode } & Marks) {
  return (
    <div
      {...marks}
      className={
        pre
          ? 'bg-surface-container-highest px-3.5 py-2.5 whitespace-pre-wrap text-body-medium text-on-surface'
          : 'bg-surface-container-highest px-3.5 py-2.5 text-body-medium text-on-surface'
      }
      style={{ clipPath: cutShape(size) }}
    >
      {children}
    </div>
  );
}
