import * as React from 'react';
import { cn } from '@/lib/utils';
import { composeRenderProps, Input as InputPrimitive } from 'react-aria-components';

function Input({ className, type, ...props }: React.ComponentProps<typeof InputPrimitive>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={composeRenderProps(className, (className) =>
        cn(
          'h-8 w-full min-w-0 rounded-lg border border-outline bg-transparent px-2.5 py-1 text-body-large transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-body-medium file:font-medium file:text-on-surface placeholder:text-on-surface-variant focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-outline/50 disabled:opacity-50 aria-invalid:border-failure aria-invalid:ring-3 aria-invalid:ring-failure/20 md:text-body-medium dark:bg-outline/30 dark:disabled:bg-outline/80 dark:aria-invalid:border-failure/50 dark:aria-invalid:ring-failure/40',
          className,
        ),
      )}
      {...props}
    />
  );
}

export { Input };
