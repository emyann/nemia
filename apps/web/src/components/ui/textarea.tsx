import * as React from 'react';
import { cn } from '@/lib/utils';
import { composeRenderProps, TextArea as TextareaPrimitive } from 'react-aria-components';

function Textarea({ className, ...props }: React.ComponentProps<typeof TextareaPrimitive>) {
  return (
    <TextareaPrimitive
      data-slot="textarea"
      className={composeRenderProps(className, (className) =>
        cn(
          'flex field-sizing-content min-h-16 w-full rounded-lg border border-outline bg-transparent px-2.5 py-2 text-body-large transition-colors outline-none placeholder:text-on-surface-variant focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-outline/50 disabled:opacity-50 aria-invalid:border-failure aria-invalid:ring-3 aria-invalid:ring-failure/20 md:text-body-medium dark:bg-outline/30 dark:disabled:bg-outline/80 dark:aria-invalid:border-failure/50 dark:aria-invalid:ring-failure/40',
          className,
        ),
      )}
      {...props}
    />
  );
}

export { Textarea };
