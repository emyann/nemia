/**
 * shadcn's Trace, drawn in the look: what an agent did, a line a step, each with an icon, one sentence and a quiet fact in mono. A
 * line says its state in the board's meanings, and a step opens to show what it asked and what came back, or the steps nested under
 * it.
 */
import * as React from 'react';
import { Button as ButtonPrimitive, DisclosureStateContext, type ButtonProps } from 'react-aria-components';
import { ChevronRightIcon } from 'lucide-react';

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * A line's state: at work (`running`), failed (`error`), not started (`pending`), or waiting on the person (`yours`, the look's
 * own); a line with none is done.
 */
export type TraceStatus = 'running' | 'error' | 'pending' | 'yours';

/** What a line wears in each state, its icon, title and fact included. */
const STATUS: Record<TraceStatus, string> = {
  running:
    '*:data-[slot=trace-icon]:text-alive *:data-[slot=trace-title]:shimmer *:data-[slot=trace-title]:shimmer-color-alive motion-reduce:*:data-[slot=trace-title]:animate-none',
  error: 'text-failure *:data-[slot=trace-icon]:text-failure *:data-[slot=trace-description]:text-failure',
  pending: 'text-on-surface-variant',
  yours: 'border-l-2 border-yours pl-1.5 *:data-[slot=trace-icon]:text-yours',
};

/** A trace: its lines and folds one under the other. */
function Trace({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="trace" className={cn('flex w-full min-w-0 flex-col gap-0.5', className)} {...props} />;
}

/** One step: its icon, its sentence and its fact, in the state `status` says, done when it says none. */
function TraceLine({ className, status, ...props }: React.ComponentProps<'span'> & { status?: TraceStatus }) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        'flex min-h-8 w-full max-w-full min-w-0 items-center gap-2.5 px-2 py-1 text-body-medium text-on-surface',
        status && STATUS[status],
        className,
      )}
      {...props}
    />
  );
}

/** A line's icon, 16 pixels, in the quiet ink unless its state gives it one. */
function TraceIcon({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="trace-icon"
      aria-hidden="true"
      className={cn(
        'flex size-4 shrink-0 items-center justify-center text-on-surface-variant [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    />
  );
}

/** A line's sentence, cut with an ellipsis where it runs out of room; a file, a command or a query in it is `code`, in mono. */
function TraceTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="trace-title"
      className={cn('min-w-0 flex-1 truncate motion-reduce:shimmer-none [&_code]:font-mono [&_code]:text-body-small', className)}
      {...props}
    />
  );
}

/** A line's quiet fact on its right, in mono: a duration, a count, a diff stat. */
function TraceDescription({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="trace-description"
      className={cn('shrink-0 font-mono text-body-small text-on-surface-variant tabular-nums', className)}
      {...props}
    />
  );
}

/** A step that opens: its trigger over its content, closed unless `isExpanded` or `defaultExpanded` says otherwise. */
function TraceCollapsible({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Collapsible>, 'isExpanded' | 'className'> &
  (
    | { isExpanded?: undefined }
    | {
        isExpanded: boolean;
        onExpandedChange: NonNullable<React.ComponentProps<typeof Collapsible>['onExpandedChange']>;
      }
  ) & {
    className?: string;
  }) {
  return <Collapsible data-slot="trace-collapsible" className={cn('flex w-full min-w-0 flex-col', className)} {...props} />;
}

/** What opens a step: the line it holds, a state layer under the pointer, and a chevron on its right that turns down while open. */
function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}: Omit<ButtonProps, 'className' | 'children' | 'slot'> & {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <ButtonPrimitive
      slot="trigger"
      {...props}
      data-slot="trace-collapsible-trigger"
      className={cn(
        'group/trace-collapsible-trigger flex w-full max-w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-sm pr-2 text-left outline-none hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      {children}
      <TraceIcon className="transition-transform group-aria-expanded/trace-collapsible-trigger:rotate-90">
        <ChevronRightIcon />
      </TraceIcon>
    </ButtonPrimitive>
  );
}

/** How a step's content stands under it: a sub-agent's steps nested on a rule, or what it asked and what came back, in mono. */
const CONTENT = {
  nest: 'mb-1 ml-4 border-l border-outline-variant pl-2',
  body: 'mt-0.5 mb-1.5 ml-8.5 bg-surface-container px-3 py-2 font-mono text-body-small whitespace-pre-wrap wrap-anywhere text-on-surface shadow-[inset_2px_0_0_var(--md-sys-color-outline-variant)]',
} as const;

/** What a step holds, drawn only while it is open, as `kind` stands it: `nest` for steps under it, `body` for what it asked and got. */
function TraceCollapsibleContent({
  className,
  children,
  kind = 'nest',
  ...props
}: Omit<React.ComponentProps<typeof CollapsibleContent>, 'className' | 'children'> & {
  className?: string;
  children?: React.ReactNode;
  kind?: keyof typeof CONTENT;
}) {
  const open = React.useContext(DisclosureStateContext)?.isExpanded ?? false;
  return (
    <CollapsibleContent data-slot="trace-collapsible-content" className="min-w-0" {...props}>
      {open && (
        <div data-slot="trace-collapsible-content-inner" data-kind={kind} className={cn('min-w-0', CONTENT[kind], className)}>
          {children}
        </div>
      )}
    </CollapsibleContent>
  );
}

export { Trace, TraceLine, TraceIcon, TraceTitle, TraceDescription, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent };
