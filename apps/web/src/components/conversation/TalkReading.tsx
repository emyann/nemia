/**
 * The talk's place while a conversation is first read, a file of its own so a host that loads the talk lazily draws it without loading
 * the talk: the kit's skeletons in the shape of its turns.
 */
import { Reading } from '@/components/look';
import { Skeleton } from '@/components/ui/ds';
import { mark } from '@/lib/conversation';
import { cn } from '@/lib/utils';

/** The turns a conversation is drawn with while it is first read: who spoke, and its bubble, lines of text over its padding. */
const TURNS_READ = [
  { who: 'agent', bubble: 'h-[calc(3lh+1.25rem)] w-full' },
  { who: 'person', bubble: 'h-[calc(1lh+1.25rem)] w-1/2' },
  { who: 'agent', bubble: 'h-[calc(2lh+1.25rem)] w-5/6' },
] as const;

/**
 * The shell while a conversation is first read: three turns, each who spoke over a bubble, the agent's at the left and the person's at
 * the right, as the talk lays them out at `density`; named once for a screen reader by `label`, the line it replaces. Its data mark is
 * under the prefix `marks` names (`mark`).
 */
export function TalkReading({ marks, label, density = 'page' }: { marks: string; label: string; density?: 'page' | 'compact' }) {
  return (
    <div {...mark(marks, 'reading')} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Reading label={label} className={cn('flex flex-col', density === 'compact' ? 'gap-2' : 'gap-4 py-4')}>
        {TURNS_READ.map((turn, at) => (
          <div key={at} className={cn('flex w-[80%] flex-col gap-1.5', turn.who === 'person' && 'items-end self-end')}>
            <Skeleton className="w-28 text-label-small" />
            <Skeleton shape="rectangle" className={cn('rounded-none text-body-medium', turn.bubble)} />
          </div>
        ))}
      </Reading>
    </div>
  );
}
