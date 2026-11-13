import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import type { StepArtifact, StepValue } from '../../lib/api/tries.ts';
import { viewOpened } from '../../lib/viewAddress';
import { cn, focusRing } from '../ui/ds/utils';
import { when } from '../step/Facts';

/** Bytes as a person reads them, as the CLI's `decide` prints a file's size and the CLI's `prune` a worktree's (`sizeOf`). */
export const bytesWord = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 ** 3
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/** A file the api serves: its name, its link and its kind. */
type Served = Extract<StepArtifact, { url: string }>;

const served = (artifact: StepArtifact): artifact is Served => 'url' in artifact;

/** A chip's frame: a hairline box in the mono face, the kit's ring under the keyboard. */
const CHIP = cn(
  'inline-flex max-w-full items-center gap-1.5 border border-outline-variant px-2 py-1 font-mono text-body-small text-on-surface no-underline hover:bg-surface-container-high',
  focusRing(),
);

/**
 * What opens a served file: with the step it is of, its viewer's sheet by the address (`?view=<step>/<path>`, a push, so Back closes
 * it); with none, the file itself in a new tab.
 */
function Opens({ artifact, step, className, children }: { artifact: Served; step: string | null; className: string; children: ReactNode }) {
  const title = `Open ${artifact.name}`;
  if (step === null)
    return (
      <a href={artifact.url} target="_blank" rel="noreferrer" title={title} className={className}>
        {children}
      </a>
    );
  return (
    <Link
      to="."
      search={(prev: Record<string, unknown>) => viewOpened(prev, { step, path: artifact.path })}
      resetScroll={false}
      data-opens-view={artifact.path}
      title={title}
      className={className}
    >
      {children}
    </Link>
  );
}

/**
 * The files a closeout named, or a step's folder holds: each picture the api serves as a thumbnail in a grid, every other file it serves
 * as a chip with its name (and its size, with `size`, or where it is no text), each opening its viewer's sheet where `step` names the
 * step it is of (`?view=`), else in a new tab. One the CLI's `prune --artifacts` removed is its path, muted, and when it went, as the
 * run's `pruned` row gives the same moment (`when`); any other path the api does not serve is the path, as the closeout gave it. `none`
 * is said where there are none.
 */
export function Artifacts({
  artifacts,
  step = null,
  size = false,
  none = 'none named',
}: {
  artifacts: readonly StepArtifact[];
  step?: string | null;
  size?: boolean;
  none?: string;
}) {
  if (!artifacts.length) return <p className="text-body-small text-on-surface-variant">{none}</p>;
  const pictures = artifacts.filter((a): a is Served => served(a) && a.kind === 'image');
  const rest = artifacts.filter((a) => !(served(a) && a.kind === 'image'));
  return (
    <div data-artifacts className="mt-1 space-y-2 text-body-small">
      {pictures.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          {pictures.map((picture) => (
            <li key={picture.path} data-artifact="image" className="min-w-0">
              <Opens artifact={picture} step={step} className={cn('block', focusRing())}>
                <img
                  src={picture.url}
                  alt={picture.name}
                  className="aspect-[4/3] w-full border border-outline-variant bg-surface-container object-cover object-top"
                />
                <span className="mt-1 block truncate font-mono text-on-surface-variant">{picture.name}</span>
              </Opens>
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {rest.map((artifact, i) => (
            <li key={`${i}:${artifact.path}`} className="max-w-full min-w-0 break-all">
              <Chip artifact={artifact} step={step} size={size} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One file that is no picture: a chip that opens it where the api serves it, its path where not, its prune where it was removed. */
function Chip({ artifact, step, size }: { artifact: StepArtifact; step: string | null; size: boolean }) {
  if ('pruned' in artifact) {
    return (
      <span data-artifact="pruned">
        <span className="font-mono text-on-surface-variant">{artifact.path}</span>
        <span className="text-on-surface-variant"> — its files were removed at {when(artifact.prunedAt)}, by a prune of its files</span>
      </span>
    );
  }
  if (!served(artifact)) {
    return (
      <span data-artifact="path" className="font-mono">
        {artifact.path}
      </span>
    );
  }
  return (
    <span data-artifact={artifact.kind}>
      <Opens artifact={artifact} step={step} className={CHIP}>
        <FileText aria-hidden="true" className="size-3.5 shrink-0 text-on-surface-variant" />
        <span className="truncate">{artifact.name}</span>
        {(size || artifact.kind === 'other') && <span className="shrink-0 text-on-surface-variant">· {bytesWord(artifact.size)}</span>}
      </Opens>
    </span>
  );
}

const linkClass = 'font-mono font-medium text-foreground underline underline-offset-2';

/**
 * The values a closeout handed on beside its files: each its name as a label, then the value, a link opening in a new tab where the api
 * found it an http(s) address (`link`), else the value as text. Nothing for none.
 */
export function Values({ values }: { values: readonly StepValue[] }) {
  if (!values.length) return null;
  return (
    <ul data-values className="mt-1 flex flex-col gap-1 text-body-small">
      {values.map((v, i) => (
        <li key={`${i}:${v.name}`} data-value={v.name} className="break-all">
          <span className="text-label-small uppercase text-muted-foreground">{v.name}</span>{' '}
          {v.link ? (
            <a href={v.link} target="_blank" rel="noreferrer" className={linkClass}>
              {v.value}
            </a>
          ) : (
            <span className="font-mono">{v.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
