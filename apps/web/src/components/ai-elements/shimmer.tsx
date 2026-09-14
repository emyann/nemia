"use client";

import { cn } from "@/lib/utils";
import { type CSSProperties, type ElementType, memo } from "react";

// From AI Elements (registry.ai-sdk.dev/shimmer.json), drawn by shadcn's `shimmer` utility (shadcn/tailwind.css) in
// place of `motion`: the board carries no animation library for one line of text, and the utility already stills
// itself for a reader who asks for reduced motion.
export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
};

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
}: TextShimmerProps) => (
  <Component
    className={cn("shimmer inline-block", className)}
    style={{ "--shimmer-duration": `${duration}s` } as CSSProperties}
  >
    {children}
  </Component>
);

export const Shimmer = memo(ShimmerComponent);
