'use client';

// From AI Elements (registry.ai-sdk.dev/reasoning.json). One change: `ReasoningContent` spread its collapsible's props onto
// its markdown renderer as well; the text is given to the board's `Markdown` alone, as it is written.
//
// AI Elements is written on Radix, with no React Aria variant, so this is adapted by hand to the aria base's `Collapsible`,
// React Aria's `Disclosure`, which `Reasoning` drives with `isExpanded` and `onExpandedChange`. Radix's
// `useControllableState` is a few lines of state here, as the sidebar's provider has it. `ReasoningContent` draws the
// thought only while it is open: a `DisclosurePanel` keeps its children mounted and hidden, where Radix's unmounted them.
// Its `className` styles what is drawn, not the panel: a panel hidden `until-found` is still laid out, so a margin or a
// border on it would show under a closed thought.

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, memo, useCallback, useContext, useEffect, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { Shimmer } from './shimmer';

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
};

export type ReasoningProps = Omit<
  ComponentProps<typeof Collapsible>,
  'className' | 'isExpanded' | 'defaultExpanded' | 'onExpandedChange'
> & {
  className?: string;
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = true,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const [openState, setOpenState] = useState(defaultOpen);
    const isOpen = open ?? openState;
    const setIsOpen = useCallback(
      (next: boolean) => {
        if (open === undefined) {
          setOpenState(next);
        }
        onOpenChange?.(next);
      },
      [open, onOpenChange],
    );
    const [durationState, setDuration] = useState<number | undefined>(undefined);
    const duration = durationProp ?? durationState;

    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Track duration when streaming starts and ends
    useEffect(() => {
      if (isStreaming) {
        if (startTime === null) {
          setStartTime(Date.now());
        }
      } else if (startTime !== null) {
        setDuration(Math.ceil((Date.now() - startTime) / MS_IN_S));
        setStartTime(null);
      }
    }, [isStreaming, startTime]);

    // Auto-open when streaming starts, auto-close when streaming ends (once only)
    useEffect(() => {
      if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed) {
        // Add a small delay before closing to allow user to see the content
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosed]);

    return (
      <ReasoningContext.Provider value={{ isStreaming, isOpen, setIsOpen, duration }}>
        <Collapsible className={cn('not-prose mb-4', className)} isExpanded={isOpen} onExpandedChange={setIsOpen} {...props}>
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = Omit<ComponentProps<typeof CollapsibleTrigger>, 'className' | 'children'> & {
  className?: string;
  children?: ReactNode;
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>Thinking...</Shimmer>;
  }
  if (duration === undefined) {
    return <p>Thought for a few seconds</p>;
  }
  return <p>Thought for {duration} seconds</p>;
};

export const ReasoningTrigger = memo(
  ({ className, children, getThinkingMessage = defaultGetThinkingMessage, ...props }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn('flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground', className)}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon className="size-4" />
            {getThinkingMessage(isStreaming, duration)}
            <ChevronDownIcon className={cn('size-4 transition-transform', isOpen ? 'rotate-180' : 'rotate-0')} />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = Omit<ComponentProps<typeof CollapsibleContent>, 'className' | 'children'> & {
  className?: string;
  children: string;
};

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => {
  const { isOpen } = useReasoning();

  return (
    <CollapsibleContent {...props}>
      {isOpen && (
        <div className={cn('mt-4 text-sm', 'fade-in-0 slide-in-from-top-2 animate-in text-muted-foreground', className)}>
          <Markdown>{children}</Markdown>
        </div>
      )}
    </CollapsibleContent>
  );
});

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
