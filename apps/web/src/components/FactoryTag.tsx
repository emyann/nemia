/** The factory tags a row or a card shows, and the filter by factory over the Runs and Inbox pages. */
import { Factory } from 'lucide-react';
import { useId } from 'react';
import { DEFAULT_NAME, factoryCounts } from '@/lib/factories';
import { cn } from '@/lib/utils';
import { RouteLink } from './AgentParts';
import { FIELD } from './WorkflowOptions';

const TAG = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap';
const NAMED = 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200';
const MUTED = 'border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400';

/** A factory's mark, before its name on a tag, so it reads as a factory beside a repository or a place. */
const mark = <Factory aria-hidden className="size-3 shrink-0" />;

/**
 * One factory's tag, `data-factory-tag` its name after a factory's mark: a named factory's in colour, linked to its floor when `linked` and
 * plain text where it sits inside another link, with no tooltip where a card's stretched link lies under it; the default factory's muted,
 * and never linked, since a run of it is read on the Runs page.
 */
export function FactoryTag({ name, linked = false }: { name: string; linked?: boolean }) {
  if (name === DEFAULT_NAME) {
    return (
      <span data-factory-tag={name} title="The default factory: it holds every run and card that names none" className={cn(TAG, MUTED)}>
        {mark}
        {name}
      </span>
    );
  }
  if (!linked) {
    return (
      <span data-factory-tag={name} title={`In the factory ${name}`} className={cn(TAG, NAMED)}>
        {mark}
        {name}
      </span>
    );
  }
  return (
    <RouteLink
      to="/factories/$factory"
      params={{ factory: name }}
      data-factory-tag={name}
      aria-label={`Factory ${name}`}
      className={cn(
        TAG,
        NAMED,
        'outline-none hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:border-sky-700',
      )}
    >
      {mark}
      {name}
    </RouteLink>
  );
}

/** The tags of the factories `names`, in their order, each linked when `linked`; nothing for none. */
export function FactoryTags({ names, linked = false, className }: { names: readonly string[]; linked?: boolean; className?: string }) {
  if (!names.length) return null;
  return (
    <span data-factory-tags className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {names.map((name) => (
        <FactoryTag key={name} name={name} linked={linked} />
      ))}
    </span>
  );
}

/**
 * The filter by factory over a page's runs or cards: `All factories (n)`, then each factory they name with how many (`factoryCounts`), the
 * default first. `factory` is the one kept, none for all; a factory none of them names any more stays offered, at 0, until it is cleared.
 * Nothing while they name one factory and none is kept: there is nothing to choose.
 */
export function FactoryFilter({
  items,
  factory,
  onChange,
}: {
  items: readonly { factory: string | null }[];
  factory: string | undefined;
  onChange: (factory: string | undefined) => void;
}) {
  const id = useId();
  const counts = factoryCounts(items);
  if (counts.length < 2 && factory === undefined) return null;
  const offered = factory === undefined || counts.some((c) => c.name === factory) ? counts : [...counts, { name: factory, count: 0 }];
  return (
    <div data-factory-filter className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Factory
      </label>
      <select
        id={id}
        value={factory ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={cn(FIELD, 'w-auto min-w-40')}
      >
        <option value="">All factories ({items.length})</option>
        {offered.map(({ name, count }) => (
          <option key={name} value={name}>
            {name} ({count})
          </option>
        ))}
      </select>
    </div>
  );
}
