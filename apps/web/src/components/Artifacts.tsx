import type { StepArtifact } from '../lib/api';

/** Bytes as a person reads them, as `wf decide` prints a file's size. */
export const bytesWord = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/**
 * The files a closeout named. One the api serves: an image drawn inline, opening full-size in a new tab; a text file as a link;
 * anything else as a link with its size. Any other path as the path, as the closeout gave it.
 */
export function Artifacts({ artifacts }: { artifacts: readonly StepArtifact[] }) {
  if (!artifacts.length) return <p className="text-xs text-neutral-500">none named</p>;
  return (
    <ul className="mt-1 space-y-2 text-xs">
      {artifacts.map((artifact, i) => (
        <li key={`${i}:${artifact.path}`} className="break-all">
          <ArtifactView artifact={artifact} />
        </li>
      ))}
    </ul>
  );
}

const linkClass = 'font-mono font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100';

/** One file a closeout named, drawn as `Artifacts` draws each: the Output tab draws an image a field names with it too. */
export function ArtifactView({ artifact }: { artifact: StepArtifact }) {
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
            className="max-h-60 max-w-full rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
          />
        </a>
        <figcaption className="font-mono text-neutral-500">
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
      {artifact.kind === 'other' && <span className="text-neutral-500"> · {bytesWord(artifact.size)}</span>}
    </span>
  );
}
