"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

// AI Elements' `Response`, which its registry now ships as `MessageResponse` inside message.tsx
// (registry.ai-sdk.dev/message.json), taken alone: the rest of that file is the AI SDK's message parts, branches and
// attachments, which a transcript has none of. Static: what a transcript says is already written, whole.
export type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      mode="static"
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
