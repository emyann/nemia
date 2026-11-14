/**
 * A fold of a step's part: a line that opens to what it holds, drawn only while open (React Aria's panel keeps and lays out what a closed
 * one holds), so a closed fold reads nothing and holds nothing to find.
 */
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn, focusRing } from '@/components/ui/ds/utils';

/** A fold titled `title`, closed unless `open`, marked `data-fold` with `name` for whoever reads it. */
export function Fold({ name, title, open = false, children }: { name: string; title: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <Collapsible data-fold={name} defaultExpanded={open}>
      {({ isExpanded }) => (
        <>
          <CollapsibleTrigger
            className={cn('w-full py-1 text-left text-label-medium text-on-surface-variant uppercase hover:text-on-surface', focusRing())}
          >
            <span aria-hidden="true">{isExpanded ? '▾ ' : '▸ '}</span>
            {title}
          </CollapsibleTrigger>
          <CollapsibleContent>{isExpanded && <div className="space-y-3 pt-2 pb-1">{children}</div>}</CollapsibleContent>
        </>
      )}
    </Collapsible>
  );
}
