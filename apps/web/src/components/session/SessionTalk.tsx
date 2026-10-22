/**
 * The talk of a step's session: the family's talk (`conversation/Talk`) fed the step's turns through its own adapter (`sessionItems`),
 * under the `session` prefix every page of it reads. What is the step's alone — the brief it was told, the words a person said to it,
 * its closeout — it draws itself through the family's one escape hatch (`drawOwn`, `SessionOwn`); the line over what is new, the jump
 * pill, the scroll that follows the latest and the bubble of a message being written are the family's.
 *
 * Nothing of a step's session goes unread: a person reads it by opening it, and no read mark is posted, so the talk is given no `newAt`
 * and nothing readable.
 *
 * Where there is no conversation to draw — the step not filed, no session of its task started, the conversation still being read,
 * nothing in it the engine can read — the step's own words stand in the family's empty shell (`TalkEmpty`), which carries the mark a
 * page selects the empty state by.
 */
import { Talk, TalkEmpty } from '@/components/conversation/Talk';
import { sessionItems } from '@/lib/sessionItems';
import type { Turn } from '@/lib/transcript';
import { SessionOwn } from './SessionOwn';

/** The prefix every data mark of a step's session is written under, which its pages read. */
const MARKS = 'session';

/** What a reader is told the talk is, at its latest and read back. */
const [LABEL, BACK] = ["The step's conversation", "Earlier in the step's conversation"];

/** A quiet line in the talk's place: why there is no conversation to draw, or that it is being read. */
export function SessionQuiet({ words }: { words: string }) {
  return (
    <TalkEmpty marks={MARKS}>
      <p className="p-6 text-body-medium text-on-surface-variant">{words}</p>
    </TalkEmpty>
  );
}

type Props = {
  /** Who the session's own words are drawn as: the step, by its name. */
  who: string;
  turns: readonly Turn[];
  /** Whether the session may still add to it: a call with no answer in the tail is running while it may. */
  live: boolean;
  /** The message the session is writing, drawn after the turns until the whole of it takes its place. */
  writing?: string | null;
  /** `compact` for the run page's Activity tab; the session page's own by default. */
  density?: 'page' | 'compact';
};

/** The talk: the step's turns on the family's shape, its own items drawn by `SessionOwn`, and the message being written. */
export function SessionTalk({ who, turns, live, writing = null, density = 'page' }: Props) {
  return (
    <Talk
      items={sessionItems(turns, who, live)}
      marks={MARKS}
      label={LABEL}
      backLabel={BACK}
      newAt={null}
      unread={0}
      readable={null}
      onRead={() => {}}
      drawOwn={(own) => <SessionOwn own={own} marks={MARKS} />}
      density={density}
      writing={writing}
    />
  );
}
