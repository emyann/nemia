/**
 * A run, drawn at a size: one recipe for every surface that draws a run, in tailwind-variants' slots and variants, as the kit writes
 * its own parts (`ui/ds/components/Chip.tsx`). Each slot names the kit's roles.
 *
 * Three axes. `size` is how much it says, each size all the one under it says and more (`says`, `lib/runSays.ts`). `layout` is its
 * shape at md, where the runs list draws a row and the floor a card of the same things. `tone` is its state's meaning, the one colour
 * it carries (`ChipTone`, `lib/nowChip.ts`): on its chip, its words and, as a card, its edge and its ground — the surface mixed with
 * that tone's role, two roles and nothing else; in light, yours and failure keep the card's own ground, where their inks would fall under
 * 4.5:1 on the mix.
 *
 * The slots carry no type: the type role of each part that says words is `runType`'s, drawn through the kit's primitives.
 */
import { tv } from '@/components/ui/ds/utils';
import type { ChipTone } from '@/lib/nowChip';

/** A run's tone: its state's meaning, the chip's colour. */
export type RunTone = ChipTone;

export const runRecipe = tv({
  slots: {
    base: 'relative min-w-0 text-on-surface',
    ground: 'bg-surface-container-low',
    head: 'flex min-w-0 items-center gap-3.5 font-medium text-on-surface-variant',
    id: 'font-mono text-on-surface-variant',
    title: 'relative z-10 m-0 min-w-0 font-medium text-on-surface',
    now: 'flex min-w-0 items-center gap-x-2.5 gap-y-1',
    agent: 'shrink-0 font-medium text-on-surface',
    end: 'ml-auto inline-flex shrink-0 items-center gap-2.5',
    clock: 'font-mono whitespace-nowrap text-on-surface',
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
        title: 'block truncate',
      },
      md: {},
      lg: {
        base: 'flex flex-col gap-2.5 py-[18px] pr-[26px] pl-[22px]',
        title: 'line-clamp-2',
        now: 'flex-wrap',
        foot: 'mt-1 flex-wrap',
      },
      xl: {
        base: 'flex flex-col gap-3 py-[22px] pr-[30px] pl-[26px]',
        title: 'line-clamp-3',
        now: 'flex-wrap',
        foot: 'mt-1',
      },
    },
    layout: {
      row: {},
      card: {},
    },
    tone: {
      alive: { ground: 'bg-[color-mix(in_srgb,var(--meaning-alive-container)_22%,var(--md-sys-color-surface-container-low))]' },
      yours: {
        ground:
          'bg-surface-container-low dark:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_3%,var(--md-sys-color-surface-container-low))]',
        clock: 'text-yours',
      },
      failure: {
        ground:
          'bg-surface-container-low dark:bg-[color-mix(in_srgb,var(--md-sys-color-error)_4%,var(--md-sys-color-surface-container-low))]',
      },
      waits: { ground: 'bg-surface-container-low' },
      rest: { ground: 'bg-[color-mix(in_srgb,var(--md-sys-color-inverse-surface)_4%,var(--md-sys-color-surface-container-low))]' },
    },
  },
  compoundVariants: [
    { size: 'md', layout: 'row', class: { title: 'static z-auto block truncate' } },
    {
      size: 'md',
      layout: 'card',
      class: {
        base: 'flex flex-col gap-1.5 pt-[11px] pr-4 pb-2 pl-3.5',
        head: 'justify-between gap-2 text-on-surface-variant uppercase',
        title: 'line-clamp-2',
        agent: 'min-w-0 shrink truncate',
        foot: 'justify-between',
      },
    },
    { size: 'md', layout: 'card', tone: 'alive', class: { clock: 'text-alive' } },
  ],
  defaultVariants: { size: 'md', layout: 'card', tone: 'alive' },
});

/** A type role of the kit's: its primitive and its size. */
export type RunType = { role: 'body' | 'label' | 'title'; size: 'large' | 'medium' | 'small' };

/** The kit's body role at `size`. */
const body = (size: RunType['size']) => ({ role: 'body', size }) satisfies RunType;

/** The kit's label role, small: the card's meta line in capitals. */
const LABEL_SMALL = { role: 'label', size: 'small' } satisfies RunType;

/**
 * The type role of each part of a run that says words, at its size and in its layout: its meta line (`head`), its id, its title, its
 * agent and its clock.
 * @param size How much the run says (`xs` to `xl`).
 * @param layout Its shape at md: a row of the runs table or a card.
 */
export function runType(size: 'xs' | 'sm' | 'md' | 'lg' | 'xl', layout: 'row' | 'card' = 'card') {
  const card = size === 'md' && layout === 'card';
  const title: RunType = size === 'xl' ? { role: 'title', size: 'medium' } : size === 'sm' || card ? body('medium') : body('large');
  return {
    head: card ? LABEL_SMALL : body('small'),
    id: card ? LABEL_SMALL : body('small'),
    title,
    agent: card ? body('small') : body('medium'),
    clock: { role: 'body', size: size === 'sm' || card ? 'small' : 'medium' } as const,
  } satisfies Record<string, RunType>;
}
