import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, composeRenderProps, type CheckboxProps } from 'react-aria-components';

function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive
      data-slot="checkbox"
      className={composeRenderProps(className, (className) =>
        cn(
          'group/checkbox flex items-center gap-2 text-body-medium outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50',
          className,
        ),
      )}
      {...props}
    >
      {composeRenderProps(children, (children, { isSelected, isIndeterminate }) => (
        <>
          <span
            data-slot="checkbox-indicator"
            className="relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input text-current transition-colors dark:bg-input/30 group-data-focus-visible/checkbox:border-ring group-data-focus-visible/checkbox:ring-3 group-data-focus-visible/checkbox:ring-ring/50 group-data-invalid/checkbox:border-destructive group-data-invalid/checkbox:ring-3 group-data-invalid/checkbox:ring-destructive/20 group-data-selected/checkbox:border-primary group-data-selected/checkbox:bg-primary group-data-selected/checkbox:text-primary-foreground dark:group-data-selected/checkbox:bg-primary [&>svg]:size-3.5"
          >
            {(isSelected || isIndeterminate) && <CheckIcon />}
          </span>
          {children}
        </>
      ))}
    </CheckboxPrimitive>
  );
}

export { Checkbox };
