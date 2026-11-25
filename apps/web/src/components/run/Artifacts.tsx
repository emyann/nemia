import type { ReactNode } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import type { StepArtifact, StepValue } from '../../lib/api/tries.ts';
import { fileKey } from '../../lib/stepPart';
import { viewOpened } from '../../lib/viewAddress';
import { cn, focusRing } from '../ui/ds/utils';
import { Body, Chip as KitChip, Label } from '../ui/ds';
import { when } from '../step/Facts';

/**
 * Bytes as a person reads them, as the CLI's `decide` prints a file's size and the CLI's `prune` a worktree's (`sizeOf`).
 *
 * @param bytes the size, in bytes
 */
export const bytesWord = (bytes: number) =>
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
      search={(prev: Record<string, unknown>) => viewOpened(prev, { step, path: fileKey(artifact) })}
      resetScroll={false}
      data-opens-view={fileKey(artifact)}
      title={title}
      className={className}
    >
      {children}
    </Link>
  );
}

/**
 * The files a closeout named, or a step's folder holds: each picture the api serves as a thumbnail in a grid, captioned by its path (its
 * `name`, which names the link, so the picture itself says nothing twice: an empty `alt`), every other file it serves
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
  if (!artifacts.length)
    return (
      <Body size="small" colorRole="on-surface-variant">
        {none}
      </Body>
    );
  const pictures = artifacts.filter((a): a is Served => served(a) && a.kind === 'image');
  const rest = artifacts.filter((a) => !(served(a) && a.kind === 'image'));
  return (
    <Body size="small" component="div" data-artifacts className="mt-1 space-y-2">
      {pictures.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          {pictures.map((picture) => (
            <li key={fileKey(picture)} data-artifact="image" className="min-w-0">
              <Opens artifact={picture} step={step} className={cn('block', focusRing())}>
                <img
                  src={picture.url}
                  alt=""
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
            <li key={`${i}:${fileKey(artifact)}`} className="max-w-full min-w-0 break-all">
              <Chip artifact={artifact} step={step} size={size} />
            </li>
          ))}
        </ul>
      )}
    </Body>
  );
}

/** One file that is no picture: a chip that opens it where the api serves it, its path where not, its prune where it was removed. */
function Chip({ artifact, step, size }: { artifact: StepArtifact; step: string | null; size: boolean }) {
  if ('pruned' in artifact) {
    return (
      <span data-artifact="pruned">
        <span className="font-mono text-on-surface-variant">{fileKey(artifact)}</span>
        <span className="text-on-surface-variant"> — its files were removed at {when(artifact.prunedAt)}, by a prune of its files</span>
      </span>
    );
  }
  if (!served(artifact)) {
    return (
      <span data-artifact="path" className="font-mono">
        {fileKey(artifact)}
      </span>
    );
  }
  return step === null ? (
    <Opened artifact={artifact} href={artifact.url} size={size} />
  ) : (
    <Viewed artifact={artifact} step={step} size={size} />
  );
}

/** The glyph of a file that is no picture, at the size the kit's chip hands its icon. */
function FileGlyph({ size, className }: { size?: number; className?: string }) {
  return <FileText aria-hidden="true" size={size} className={className} />;
}

/** A served file whose step is named: the chip links to its viewer's sheet by the address, `?view=<step>/<path>`. */
function Viewed({ artifact, step, size }: { artifact: Served; step: string; size: boolean }) {
  const router = useRouter();
  const href = router.buildLocation({
    to: '.',
    search: (prev: Record<string, unknown>) => viewOpened(prev, { step, path: fileKey(artifact) }),
  }).href;
  return <Opened artifact={artifact} href={href} size={size} view={fileKey(artifact)} />;
}

/**
 * A served file as the kit's assist chip, a link: to its viewer's sheet where `view` names its path there (a push that keeps the page's
 * scroll, so Back closes it), else to `href`, the file itself, in a new tab. Its name, then its size where `size` asks or it is no text,
 * cut to the room the list gives it, whole in the title of what holds it.
 */
function Opened({ artifact, href, size, view }: { artifact: Served; href: string; size: boolean; view?: string }) {
  return (
    <span
      data-artifact={artifact.kind}
      data-opens-view={view}
      title={`Open ${artifact.name}`}
      className="inline-flex max-w-full [&>a]:max-w-full [&>a>div]:min-w-0 [&>a>div>span]:min-w-0"
    >
      <KitChip
        href={href}
        target={view === undefined ? '_blank' : undefined}
        rel={view === undefined ? 'noreferrer' : undefined}
        routerOptions={view === undefined ? undefined : { resetScroll: false }}
        icon={FileGlyph}
      >
        <span className="block truncate font-mono">
          {artifact.name}
          {(size || artifact.kind === 'other') && (
            <>
              {' '}
              <span className="text-on-surface-variant">· {bytesWord(artifact.size)}</span>
            </>
          )}
        </span>
      </KitChip>
    </span>
  );
}

const linkClass = 'font-mono font-medium text-on-surface underline underline-offset-2';

/**
 * The values a closeout handed on beside its files: each its name as a label, then the value, a link opening in a new tab where the api
 * found it an http(s) address (`link`), else the value as text. Nothing for none.
 */
export function Values({ values }: { values: readonly StepValue[] }) {
  if (!values.length) return null;
  return (
    <Body size="small" component="div" className="contents">
      <ul data-values className="mt-1 flex flex-col gap-1">
        {values.map((v, i) => (
          <li key={`${i}:${v.name}`} data-value={v.name} className="break-all">
            <Label size="small" component="span" colorRole="on-surface-variant" className="uppercase">
              {v.name}
            </Label>{' '}
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
    </Body>
  );
}
