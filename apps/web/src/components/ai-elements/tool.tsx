"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { CodeBlock, type CodeLanguage } from "./code-block";

// From AI Elements (registry.ai-sdk.dev/tool.json), with a call's state in a transcript's words rather than the AI SDK's
// `ToolUIPart`: the board draws a conversation that happened, and hosts no model, so it has no `ai` package to type it by.
// A call is running while its session may still answer it, and has no result once it cannot.
export type ToolState = "running" | "completed" | "error" | "no-result";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("not-prose w-full rounded-md border", className)}
    {...props}
  />
);

export type ToolHeaderProps = {
  title: string;
  /** What the call was about — its command, its file — after its name, on one line. */
  detail?: string | null;
  state: ToolState;
  className?: string;
};

const labels: Record<ToolState, string> = {
  running: "Running",
  completed: "Completed",
  error: "Error",
  "no-result": "No result",
};

const icons: Record<ToolState, ReactNode> = {
  running: <ClockIcon className="size-4 animate-pulse" />,
  completed: <CheckCircleIcon className="size-4 text-green-600 dark:text-green-500" />,
  error: <XCircleIcon className="size-4 text-destructive" />,
  "no-result": <CircleIcon className="size-4 text-muted-foreground" />,
};

const getStatusBadge = (status: ToolState) => (
  <Badge className="gap-1.5 rounded-full text-xs" data-tool-state={status} variant="secondary">
    {icons[status]}
    {labels[status]}
  </Badge>
);

export const ToolHeader = ({
  className,
  title,
  detail,
  state,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "group flex w-full items-center justify-between gap-4 p-3 text-left",
      className
    )}
    {...props}
  >
    <div className="flex min-w-0 items-center gap-2">
      <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium text-sm">{title}</span>
      {detail && (
        <span className="min-w-0 truncate font-mono text-muted-foreground text-xs" title={detail}>
          {detail}
        </span>
      )}
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {getStatusBadge(state)}
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </div>
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input ?? null, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  /** The result as the transcript has it: text, whatever the tool returned. */
  output: string;
  isError: boolean;
  language?: CodeLanguage;
};

export const ToolOutput = ({
  className,
  output,
  isError,
  language = "text",
  ...props
}: ToolOutputProps) => (
  <div className={cn("space-y-2 p-4", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {isError ? "Error" : "Result"}
    </h4>
    <div
      className={cn(
        "max-h-96 overflow-auto rounded-md text-xs [&_table]:w-full",
        isError
          ? "bg-destructive/10 text-destructive"
          : "bg-muted/50 text-foreground"
      )}
    >
      {output ? (
        <CodeBlock
          className={cn(isError && "border-destructive/30 [&_pre]:text-destructive!")}
          code={output}
          language={language}
        />
      ) : (
        <p className="p-3 text-muted-foreground">(empty)</p>
      )}
    </div>
  </div>
);
