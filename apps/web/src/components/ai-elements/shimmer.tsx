/**
 * A line of text that shimmers while something is under way, drawn by shadcn's `shimmer` utility (shadcn/tailwind.css) over `duration`
 * seconds: no animation library, and the utility stills itself for a reader who asks for reduced motion.
 */
'use client';

import { cn } from '@/lib/utils';
import { type CSSProperties, type ElementType, memo } from 'react';

export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
};

const ShimmerComponent = ({ children, as: Component = 'p', className, duration = 2 }: TextShimmerProps) => (
  <Component className={cn('shimmer inline-block', className)} style={{ '--shimmer-duration': `${duration}s` } as CSSProperties}>
    {children}
  </Component>
);

export const Shimmer = memo(ShimmerComponent);
