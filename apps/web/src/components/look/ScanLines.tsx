import type { ReactNode } from 'react';
import { cn } from '@/components/ui/ds/utils';

/** The ink of what is read, thinned to `percent` of itself over nothing: the ground says no meaning, so it takes no hue. */
const thin = (percent: number) => `color-mix(in srgb, var(--md-sys-color-on-surface) ${percent}%, transparent)`;

/** The look's glow, from the top left corner of the ground. */
const GLOW = `radial-gradient(900px 420px at 0% 0%, ${thin(7)}, transparent 70%)`;

/** The look's scan lines: one faint line every four pixels, down the ground. */
const LINES = `repeating-linear-gradient(to bottom, ${thin(4)} 0 1px, transparent 1px 4px)`;

/** The look's ground under a page: a glow and, unless `lines` is false, scan lines over it, both behind what it holds. */
export function ScanLines({ lines = true, className, children }: { lines?: boolean; className?: string; children: ReactNode }) {
  return (
    <div data-scan-lines={lines} className={cn('bg-background', className)} style={{ backgroundImage: lines ? `${GLOW}, ${LINES}` : GLOW }}>
      {children}
    </div>
  );
}
