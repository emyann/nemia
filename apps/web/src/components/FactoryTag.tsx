/** The factory tags a row or a card shows. */
import { Factory } from 'lucide-react';
import { DEFAULT_NAME } from '@/lib/factories';
import { cn } from '@/lib/utils';
import { RouteLink } from './AgentParts';

const TAG = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap';
const NAMED = 'border-sage bg-surface-variant text-on-surface-variant';
const MUTED = 'border-outline-variant text-muted-foreground';

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
      className={cn(TAG, NAMED, 'outline-none hover:border-on-surface-variant focus-visible:ring-2 focus-visible:ring-ring/50')}
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
