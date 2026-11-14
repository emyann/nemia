/**
 * Which viewer draws a step's file in the addressable sheet (`viewerOf`, proved by `contracts/artifact-viewer.contract.ts`), from the
 * kind the api serves it as and its name's extension (`extensionOf`), never its bytes. Pure.
 */
import type { ViewerOf } from '../../contracts/artifact-viewer.contract.ts';

export type { Viewer } from '../../contracts/artifact-viewer.contract.ts';

/**
 * The viewer of `file`: a picture for an image; for text, markdown for `.md` and `.markdown`, JSON for `.json`, and text for any other;
 * none for a file the api does not serve or serves as no kind the board draws.
 */
export const viewerOf: ViewerOf = (file) => {
  if (file.kind === 'image') return 'picture';
  if (file.kind !== 'text') return 'none';
  if (file.extension === 'md' || file.extension === 'markdown') return 'markdown';
  return file.extension === 'json' ? 'json' : 'text';
};

/**
 * The extension of a file's name or path, lower case and without its dot: what follows the last dot of its last segment, '' where it
 * has none, or where its only dot starts it (`.env`).
 */
export function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}
