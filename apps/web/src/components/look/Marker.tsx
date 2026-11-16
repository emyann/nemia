/**
 * The look's marker: a quiet line across a conversation for what frames it rather than being said in it — a session that began, a
 * turn cut short — its words centred between two hairlines, wrapping where they run past the column with a hairline kept on either side. A link in its words is underlined, and lit on hover.
 */
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** The line, its hairlines on either side of the words; `className` sets their type, the data marks its caller's own. */
export function Marker({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="marker"
      className={cn(
        'relative flex min-h-4 w-full items-center gap-2 text-left text-body-medium text-on-surface-variant',
        'before:mr-1 before:h-px before:min-w-6 before:flex-1 before:bg-outline-variant after:ml-1 after:h-px after:min-w-6 after:flex-1 after:bg-outline-variant',
        className,
      )}
    >
      <span
        data-slot="marker-content"
        className="min-w-0 flex-initial text-center wrap-break-word *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-on-surface"
      >
        {children}
      </span>
    </div>
  );
}
