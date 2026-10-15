import type { StepArtifact, StepValue } from '../lib/api';
import { when } from './Facts';

/** Bytes as a person reads them, as the CLI's `decide` prints a file's size and the CLI's `prune` a worktree's (`sizeOf`). */
export const bytesWord = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 ** 3
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/**
 * The files a closeout named. One the api serves: an image drawn inline, opening full-size in a new tab; a text file as a link;
 * anything else as a link with its size. The CLI's `prune --artifacts` removed as its path, greyed, and when it went. Any other path as the
 * path, as the closeout gave it.
 *
 * `size` puts every file's size beside its name, and says so when there are none: for a list of what a folder holds rather than of
 * what a step named, where the size is part of what a person came to see.
 */
export function Artifacts({
  artifacts,
  size = false,
  none = 'none named',
}: {
  artifacts: readonly StepArtifact[];
  size?: boolean;
  none?: string;
}) {
  if (!artifacts.length) return <p className="text-body-small text-muted-foreground">{none}</p>;
  return (
    <ul className="mt-1 space-y-2 text-body-small">
      {artifacts.map((artifact, i) => (
        <li key={`${i}:${artifact.path}`} className="break-all">
          <ArtifactView artifact={artifact} size={size} />
        </li>
      ))}
    </ul>
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

/**
 * One file a closeout named, drawn as `Artifacts` draws each: the Output tab draws an image a field names with it too. One gone with the
 * run's files is not missing: it is the path it had, and when the CLI's `prune --artifacts` removed it, in the form the run's `pruned` row
 * gives the same moment (`when`), not the api's ISO words.
 */
export function ArtifactView({ artifact, size = false }: { artifact: StepArtifact; size?: boolean }) {
  if ('pruned' in artifact) {
    return (
      <span data-artifact="pruned">
        <span className="font-mono text-muted-foreground">{artifact.path}</span>
        <span className="text-muted-foreground"> — its files were removed at {when(artifact.prunedAt)}, by a prune of its files</span>
      </span>
    );
  }
  if (!('url' in artifact)) {
    return (
      <span data-artifact="path" className="font-mono">
        {artifact.path}
      </span>
    );
  }
  if (artifact.kind === 'image') {
    return (
      <figure data-artifact="image" className="space-y-1">
        <a href={artifact.url} target="_blank" rel="noreferrer" title={`Open ${artifact.name} full-size in a new tab`} className="block">
          <img
            src={artifact.url}
            alt={artifact.name}
            className="max-h-60 max-w-full rounded border border-outline-variant bg-surface-container"
          />
        </a>
        <figcaption className="font-mono text-muted-foreground">
          {artifact.name} · {bytesWord(artifact.size)}
        </figcaption>
      </figure>
    );
  }
  return (
    <span data-artifact={artifact.kind}>
      <a href={artifact.url} target="_blank" rel="noreferrer" className={linkClass}>
        {artifact.name}
      </a>
      {(size || artifact.kind === 'other') && <span className="text-muted-foreground"> · {bytesWord(artifact.size)}</span>}
    </span>
  );
}
