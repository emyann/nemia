import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-body-small font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-failure aria-invalid:ring-failure/20 dark:aria-invalid:ring-failure/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary [a]:hover:bg-primary/80',
        secondary: 'bg-surface-container-highest text-on-surface [a]:hover:bg-surface-container-highest/80',
        destructive:
          'bg-failure-container text-on-failure-container focus-visible:ring-failure/20 dark:focus-visible:ring-failure/40 [a]:hover:bg-failure-container/90',
        outline: 'border-outline-variant text-on-surface [a]:hover:bg-surface-container-highest [a]:hover:text-on-surface-variant',
        ghost: 'hover:bg-surface-container-highest hover:text-on-surface-variant dark:hover:bg-surface-container-highest/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    render?: (props: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
  }) {
  if (render) {
    const renderProps = {
      'data-slot': 'badge',
      'data-variant': variant,
      className: cn(badgeVariants({ variant }), className),
      ...props,
    };

    return render(renderProps);
  }

  return <span data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
