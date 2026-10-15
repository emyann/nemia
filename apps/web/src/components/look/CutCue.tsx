import type { ReactNode } from 'react';
import { ink } from '@/lib/meaning';
import { cn } from '@/lib/utils';
import { CutFrame, type FrameHue } from './CutFrame';

/** The ink of a cue's words, by its hue: none is the quiet ink. */
const WORDS: Record<FrameHue, string> = {
  yours: ink.yours,
  alive: ink.alive,
  failure: ink.failure,
  none: 'text-on-surface-variant',
};

/**
 * A cue: a few words in small caps in the look's small cut frame, cut 9, its edge and its words in `hue` — what waits on a person,
 * a session at work, what failed, or none, at rest. What stands beside a face or in a panel's header to say what holds.
 */
export function CutCue({ hue = 'none', children }: { hue?: FrameHue; children: ReactNode }) {
  return (
    <CutFrame hue={hue} size={9} className="inline-flex shrink-0">
      <span data-cue={hue} className={cn('inline-flex h-7 items-center px-3.5 text-label-small whitespace-nowrap uppercase', WORDS[hue])}>
        {children}
      </span>
    </CutFrame>
  );
}
