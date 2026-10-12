import type { ReactNode } from 'react';

/** The clip that cuts a tag's top-right corner, seven pixels along each side. */
const TAG_CUT = 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)';

/** A tag with its top-right corner cut, as the look cuts the tag that says a state: what it holds takes no focus, so no ring is cut. */
export function CutTag({ children }: { children: ReactNode }) {
  return (
    <span data-cut-tag className="inline-flex" style={{ clipPath: TAG_CUT }}>
      {children}
    </span>
  );
}
