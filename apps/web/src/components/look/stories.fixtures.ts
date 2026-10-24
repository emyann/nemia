/** What the look's stories draw their parts with: runs' steps in each state a rail shows, and the grounds a part is shown on. */
import type { CSSProperties } from 'react';
import type { RunSummary } from '@/lib/api';

/** A step of a rail, by its name and its codes, and its check's verdict. */
type RailStep = Pick<RunSummary['steps'][number], 'name' | 'phase' | 'reason' | 'verdict'>;

/** The codes of each state the stories draw. */
const VERIFIED = { phase: 'succeeded', reason: 'CheckPassed', verdict: { result: 'passed', exit: 0 } } as const;
const UNVERIFIED = { phase: 'succeeded', reason: 'Succeeded', verdict: null } as const;
const APPROVAL = { phase: 'waiting', reason: 'AwaitingApproval', verdict: null } as const;
const WORKING = { phase: 'running', reason: 'Running', verdict: null } as const;
const TO_COME = { phase: 'pending', reason: 'Waiting', verdict: null } as const;
const REFUSED_CHECK = { phase: 'failed', reason: 'CheckFailed', verdict: { result: 'failed', exit: 1 } } as const;

/** A run at its gate: every step verified, the last waiting on a person's word. */
export const GATE: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...VERIFIED },
  { name: 'review', ...VERIFIED },
  { name: 'land', ...APPROVAL },
];

/** A run whose steps are done, on a check or on their own word. */
export const DONE: RailStep[] = [
  { name: 'design', ...UNVERIFIED },
  { name: 'implement', ...VERIFIED },
  { name: 'review', ...UNVERIFIED },
  { name: 'land', ...APPROVAL },
];

/** A run at work on its second step. */
export const AT_WORK: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...WORKING },
  { name: 'review', ...TO_COME },
  { name: 'land', ...TO_COME },
];

/** A run whose second step failed its check. */
export const REFUSED: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...REFUSED_CHECK },
  { name: 'review', ...TO_COME },
];

/** A card's ground around a part, as a part stands on a card. */
export const ON_CARD: CSSProperties = { display: 'inline-block', padding: 16, background: 'var(--card)' };

/** The page's own ground around a part, with room for a glow. */
export const ON_PLAIN: CSSProperties = { display: 'inline-block', padding: 40, background: 'var(--background)' };

/** A ground unlike the page's and the card's, on which a cut corner painted over is seen. */
export const ON_OTHER: CSSProperties = { display: 'inline-block', padding: 40, background: 'var(--md-sys-color-inverse-surface)' };

/** What a card in a frame holds its lines in. */
export const CARD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 26px 24px' };

/** Parts side by side. */
export const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 };
