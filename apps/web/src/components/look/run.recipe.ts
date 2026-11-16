/**
 * A run, drawn at a size: one recipe for every surface that draws a run, in tailwind-variants' slots and variants, as the kit writes
 * its own parts (`ui/ds/components/Chip.tsx`). Each slot names the kit's roles.
 *
 * Three axes. `size` is how much it says, each size all the one under it says and more (`says`, `lib/runSays.ts`). `layout` is its
 * shape at md, where the runs list draws a row and the floor a card of the same things. `tone` is its state's meaning, the one colour
 * it carries (`ChipTone`, `lib/nowChip.ts`): on its chip, its words and, as a card, its edge and its ground — the surface mixed with
 * that tone's role, two roles and nothing else; in light, yours and failure keep the card's own ground, where their inks would fall under
 * 4.5:1 on the mix.
 */
import { tv } from '@/components/ui/ds/utils';
import type { ChipTone } from '@/lib/nowChip';

/** A run's tone: its state's meaning, the chip's colour. */
export type RunTone = ChipTone;

export const runRecipe = tv({
  slots: {
    base: 'relative min-w-0 text-on-surface',
    ground: 'bg-card',
    head: 'flex min-w-0 items-center gap-3.5 text-body-small font-medium text-on-surface-variant',
    id: 'font-mono text-body-small text-on-surface-variant',
    title: 'relative z-10 m-0 min-w-0 flex-1 font-medium text-on-surface',
    now: 'flex min-w-0 items-center gap-x-2.5 gap-y-1',
    agent: 'shrink-0 text-body-medium font-medium text-on-surface',
    end: 'ml-auto inline-flex shrink-0 items-center gap-2.5',
    clock: 'font-mono text-body-medium whitespace-nowrap text-on-surface',
    words: '',
    steps: 'flex min-w-0',
    facts: 'grid grid-cols-4 gap-x-4 gap-y-1 border-t border-outline-variant pt-4',
    runs: 'flex flex-col gap-2.5 border-t border-outline-variant pt-4',
    foot: 'flex min-w-0 items-center gap-x-4 gap-y-2',
  },
  variants: {
    size: {
      xs: { base: 'inline-flex items-center align-baseline' },
      sm: {
        base: 'flex items-center gap-2.5 py-2 pr-4 pl-3',
        title: 'block flex-1 truncate text-body-medium',
        clock: 'text-body-small',
      },
      md: {},
      lg: {
        base: 'flex flex-col gap-2.5 py-[18px] pr-[26px] pl-[22px]',
        title: 'line-clamp-2 text-body-large',
        now: 'flex-wrap',
        foot: 'mt-1 flex-wrap',
      },
      xl: {
        base: 'flex flex-col gap-3 py-[22px] pr-[30px] pl-[26px]',
        title: 'line-clamp-3 text-title-medium',
        now: 'flex-wrap',
        foot: 'mt-1',
      },
    },
    layout: {
      row: {},
      card: {},
    },
    tone: {
      alive: { ground: 'bg-[color-mix(in_srgb,var(--md-sys-color-secondary-container)_22%,var(--md-sys-color-surface-container-low))]' },
      yours: {
        ground: 'bg-card dark:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_6%,var(--md-sys-color-surface-container-low))]',
        clock: 'text-yours',
      },
      failure: { ground: 'bg-card dark:bg-[color-mix(in_srgb,var(--md-sys-color-error)_4%,var(--md-sys-color-surface-container-low))]' },
      waits: { ground: 'bg-card' },
      rest: { ground: 'bg-[color-mix(in_srgb,var(--md-sys-color-inverse-surface)_4%,var(--md-sys-color-surface-container-low))]' },
    },
  },
  compoundVariants: [
    { size: 'md', layout: 'row', class: { title: 'static z-auto block truncate text-body-large' } },
    {
      size: 'md',
      layout: 'card',
      class: {
        base: 'flex flex-col gap-1.5 pt-[11px] pr-4 pb-2 pl-3.5',
        head: 'justify-between gap-2 text-label-small text-outline uppercase',
        title: 'line-clamp-2 text-body-medium',
        agent: 'min-w-0 shrink truncate text-body-small',
        clock: 'text-body-small',
        foot: 'justify-between',
      },
    },
    { size: 'md', layout: 'card', tone: 'alive', class: { clock: 'text-alive' } },
  ],
  defaultVariants: { size: 'md', layout: 'card', tone: 'alive' },
});
