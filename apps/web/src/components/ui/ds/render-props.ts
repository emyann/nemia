"use client";

import { composeRenderProps } from "react-aria-components";
import { cn } from "./utils";

/**
 * Merge a React Aria render-prop `className` with static Tailwind classes.
 *
 * Lives apart from `utils.ts` on purpose: `react-aria-components` is marked
 * `client-only`, so anything importing it becomes unusable from a Server
 * Component. Keeping it here lets `utils.ts` (cn / tv / twMergeConfig /
 * focusRing) stay server-safe for the presentational components.
 */
export function composeTailwindRenderProps<T>(
  className: string | ((v: T) => string) | undefined,
  tw: string,
): string | ((v: T) => string) {
  return composeRenderProps(className, (className) => cn(tw, className));
}
