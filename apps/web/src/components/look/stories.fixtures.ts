/** What the look's stories draw their parts with: runs' steps in each state a rail shows, and the grounds a part is shown on. */
import type { CSSProperties } from 'react';

/** A run at its gate: every step verified, the last waiting on a person's word. */
export const GATE = [
  { name: 'design', status: 'verified ✓' },
  { name: 'implement', status: 'verified ✓' },
  { name: 'review', status: 'verified ✓' },
  { name: 'land', status: 'awaiting approval' },
];

/** A run whose steps are done, on a check or on their own word. */
export const DONE = [
  { name: 'design', status: 'unverified' },
  { name: 'implement', status: 'verified ✓' },
  { name: 'review', status: 'unverified' },
  { name: 'land', status: 'awaiting approval' },
];

/** A run at work on its second step. */
export const AT_WORK = [
  { name: 'design', status: 'verified ✓' },
  { name: 'implement', status: 'working' },
  { name: 'review', status: 'waiting' },
  { name: 'land', status: 'waiting' },
];

/** A run whose second step failed its check. */
export const REFUSED = [
  { name: 'design', status: 'verified ✓' },
  { name: 'implement', status: 'failed ✗ check (exit 1)' },
  { name: 'review', status: 'waiting' },
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
