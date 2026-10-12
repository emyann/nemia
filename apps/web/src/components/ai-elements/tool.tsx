/**
 * A tool call in a transcript, folded to one line: `Tool` on the aria base's `Collapsible`, `ToolHeader` with the call's name, what it was
 * about and how it went, and `ToolContent` with its input (`ToolInput`) and its result (`ToolOutput`). A call's state is in a transcript's
 * words (`ToolState`): running while its session may still answer it, and no result once it cannot.
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CheckCircleIcon, ChevronDownIcon, CircleIcon, ClockIcon, WrenchIcon, XCircleIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useContext } from 'react';
import { DisclosureStateContext } from 'react-aria-components';
import { CodeBlock, type CodeLanguage } from './code-block';

export type ToolState = 'running' | 'completed' | 'error' | 'no-result';

export type ToolProps = Omit<ComponentProps<typeof Collapsible>, 'className'> & { className?: string };

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn('not-prose w-full rounded-md border', className)} {...props} />
);

export type ToolHeaderProps = {
  title: string;
  /** What the call was about — its command, its file — after its name, on one line. */
  detail?: string | null;
  state: ToolState;
  className?: string;
};

const labels: Record<ToolState, string> = {
  running: 'Running',
  completed: 'Completed',
  error: 'Error',
  'no-result': 'No result',
};

const icons: Record<ToolState, ReactNode> = {
  running: <ClockIcon className="size-4 animate-pulse" />,
  completed: <CheckCircleIcon className="size-4 text-muted-foreground" />,
  error: <XCircleIcon className="size-4 text-destructive" />,
  'no-result': <CircleIcon className="size-4 text-muted-foreground" />,
};

const getStatusBadge = (status: ToolState) => (
  <Badge className="gap-1.5 rounded-full text-body-small" data-tool-state={status} variant="secondary">
    {icons[status]}
    {labels[status]}
  </Badge>
);

/** A call's line: its name, what it was about, how it went, and a chevron turned by the trigger's `aria-expanded`. */
export const ToolHeader = ({ className, title, detail, state, ...props }: ToolHeaderProps) => (
  <CollapsibleTrigger className={cn('group flex w-full items-center justify-between gap-4 p-3 text-left', className)} {...props}>
    <div className="flex min-w-0 items-center gap-2">
      <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium text-body-medium">{title}</span>
      {detail && (
        <span className="min-w-0 truncate font-mono text-muted-foreground text-body-small" title={detail}>
          {detail}
        </span>
      )}
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {getStatusBadge(state)}
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />
    </div>
  </CollapsibleTrigger>
);

export type ToolContentProps = Omit<ComponentProps<typeof CollapsibleContent>, 'className' | 'children'> & {
  className?: string;
  children?: ReactNode;
};

/**
 * A call's input and result, drawn only while the call is open: a `DisclosurePanel` keeps its children mounted and hidden, and a folded
 * result, highlighted and some long, costs nothing until someone opens it. `className` styles what is drawn, not the panel: a panel hidden
 * `until-found` is still laid out, so a margin or a border on it would show under a closed fold.
 */
export const ToolContent = ({ className, children, ...props }: ToolContentProps) => {
  const expanded = useContext(DisclosureStateContext)?.isExpanded ?? false;
  return (
    <CollapsibleContent {...props}>
      {expanded && <div className={cn('fade-in-0 slide-in-from-top-2 animate-in text-popover-foreground', className)}>{children}</div>}
    </CollapsibleContent>
  );
};

export type ToolInputProps = ComponentProps<'div'> & {
  input: unknown;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn('space-y-2 overflow-hidden p-4', className)} {...props}>
    <h4 className="text-muted-foreground text-label-medium uppercase">Parameters</h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input ?? null, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<'div'> & {
  /** The result as the transcript has it: text, whatever the tool returned. */
  output: string;
  isError: boolean;
  language?: CodeLanguage;
};

export const ToolOutput = ({ className, output, isError, language = 'text', ...props }: ToolOutputProps) => (
  <div className={cn('space-y-2 p-4', className)} {...props}>
    <h4 className="text-muted-foreground text-label-medium uppercase">{isError ? 'Error' : 'Result'}</h4>
    <div
      className={cn(
        'max-h-96 overflow-auto rounded-md text-body-small [&_table]:w-full',
        isError ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-foreground',
      )}
    >
      {output ? (
        <CodeBlock className={cn(isError && 'border-destructive/30 [&_pre]:text-destructive!')} code={output} language={language} />
      ) : (
        <p className="p-3 text-muted-foreground">(empty)</p>
      )}
    </div>
  </div>
);
