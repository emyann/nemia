/**
 * The place of a step's session's talk while its conversation is first read, a file of its own so the step bar, which loads the talk
 * lazily, draws it without loading the talk.
 */
import { TalkReading } from '@/components/conversation/TalkReading';

/** The prefix every data mark of a step's session is written under, which its pages read: `SessionTalk`'s own. */
const MARKS = 'session';

/**
 * The talk's place while the conversation is first read: the family's shell in the shape of its turns (`TalkReading`), named by
 * `words`, the line it stands in for, at `density`.
 */
export function SessionReading({ words, density = 'page' }: { words: string; density?: 'page' | 'compact' }) {
  return <TalkReading marks={MARKS} label={words} density={density} />;
}
