/** What sessions consumed, as `objects` says it (`StepUsed`): in the CLI `decide`'s words, a count nobody measured absent, never 0. */
import type { PeakMark as PeakMarkWord } from 'objects';

export type { StepUsed } from 'objects';

/** How near a session's context came to its window, null where nothing was measured. */
export type PeakMark = PeakMarkWord | null;
