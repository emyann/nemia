/**
 * A fold of a step's part: a line that opens to what it holds, drawn only while open (React Aria's panel keeps and lays out what a closed
 * one holds), so a closed fold reads nothing and holds nothing to find.
 */
import { useState, type ReactNode } from 'react';
import { Disclosure, DisclosurePanel, DisclosureTrigger, Label } from '@/components/ui/ds';

/**
 * The panel at its own height, unclipped: the kit's panel clips to the height it measured as it opened, and what a fold draws once
 * open, and reads after, is taller than that.
 */
const UNCLIPPED = 'h-auto overflow-visible';

/** A fold titled `title`, closed unless `open`, marked `data-fold` with `name` for whoever reads it. */
export function Fold({ name, title, open = false, children }: { name: string; title: ReactNode; open?: boolean; children: ReactNode }) {
  const [isExpanded, setExpanded] = useState(open);
  return (
    <Disclosure data-fold={name} isExpanded={isExpanded} onExpandedChange={setExpanded}>
      <DisclosureTrigger className="min-h-0 px-0 py-1">
        <Label size="medium" component="span" colorRole="on-surface-variant" className="font-label-medium uppercase">
          {title}
        </Label>
      </DisclosureTrigger>
      <DisclosurePanel isUnstyled className={UNCLIPPED}>
        {isExpanded && <div className="space-y-3 pt-2 pb-1">{children}</div>}
      </DisclosurePanel>
    </Disclosure>
  );
}
