/**
 * Nemia's chat with nothing said yet: her face, her greeting, what she is for, the three tags the canvas gives it — her level, how
 * many factories she keeps, how many runs are at work — and the four things a person may start with, each of which, pressed, goes to
 * her outbox as if it had been typed and Entered (the owner's answer at design's gate).
 */
import { Button } from '@/components/ui/button';
import { container } from '@/lib/meaning';
import { levelWord } from '@/lib/nemia';
import type { NemiaLevel } from '@/lib/api';
import type { Presence } from '@/lib/presence';
import { NemiaFace } from '../NemiaFace';

/** What a person may start with: the three questions and the one instruction the canvas draws. */
export const CHAT_STARTERS = ['What is waiting on me?', 'What is at work?', 'What did today cost?', 'Start a run'] as const;

/** One of the tags over her greeting: quiet, or in the alive container for what is at work. */
const Tag = ({ at, children }: { at?: 'work'; children: string }) => (
  <span
    data-chat-tag={at ?? 'quiet'}
    className={`inline-flex h-5.5 items-center px-2 text-label-small uppercase ${at === 'work' ? container.alive : 'border border-outline-variant text-on-surface-variant'}`}
  >
    {children}
  </span>
);

/** Her greeting, her tags and the four chips. `atWork` is how many runs are at work, as the frame counts them. */
export function ChatEmpty({
  nemia,
  presence,
  atWork,
  onSend,
}: {
  nemia: NemiaLevel | undefined;
  presence: Presence;
  atWork: number;
  onSend: (text: string) => void;
}) {
  const factories = nemia?.factories.length ?? 0;
  return (
    <div data-chat-empty className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-3 px-0.5 pt-4">
        <NemiaFace presence={presence} size={60} />
        <h3 className="text-title-medium text-on-surface">I keep your factories running.</h3>
        <p className="text-body-medium text-on-surface-variant">
          Ask what waits on you, tell me what to start, or ask why a run stopped. I act on what you tell me and ask before what is yours to
          decide.
        </p>
        <div className="flex flex-wrap gap-2">
          <Tag>{levelWord(nemia?.level ?? 'manual')}</Tag>
          <Tag>{factories === 1 ? '1 factory' : `${factories} factories`}</Tag>
          <Tag at="work">{atWork === 1 ? '1 run at work' : `${atWork} runs at work`}</Tag>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label-small text-on-surface-variant uppercase">Start with</span>
        <div className="flex flex-wrap gap-2">
          {CHAT_STARTERS.map((words) => (
            <Button key={words} variant="outline" size="sm" data-chat-chip isDisabled={presence.notSent} onPress={() => onSend(words)}>
              {words}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
