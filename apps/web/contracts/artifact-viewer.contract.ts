/**
 * Which viewer draws a step's file in the addressable sheet (`viewerOf`, src/lib/viewers.ts), from what the api says of it — its kind
 * (`ARTIFACT_KINDS`) — and its name's extension, never its bytes: a picture as a picture; of text, markdown as markdown, JSON as JSON, and
 * any other text (a log among them) as text; a file the api does not serve, or of no kind the board draws, by no viewer, offered whole by
 * its link. Pictures are not paired, by name or otherwise.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ArtifactKind } from 'objects';

/** The viewer that draws a file, or none. */
export type Viewer = 'picture' | 'markdown' | 'json' | 'text' | 'none';

/**
 * A file as the viewer is chosen for it: the kind the api serves it as (null for a file it does not serve), and its extension, lower
 * case, without its dot ('' for none).
 */
export type ViewedFile = { readonly kind: ArtifactKind | null; readonly extension: string };

const viewerOfSpec = spec<(file: ViewedFile) => Viewer>({
  ensures: {
    aPictureIsAPicture: {
      description: 'A file served as an image is drawn as a picture',
      condition: ({ input: [file], output }) => file.kind !== 'image' || output === 'picture',
    },
    markdownAsMarkdown: {
      description: 'A text file named .md or .markdown is drawn as markdown',
      condition: ({ input: [file], output }) =>
        !(file.kind === 'text' && (file.extension === 'md' || file.extension === 'markdown')) || output === 'markdown',
    },
    jsonAsJson: {
      description: 'A text file named .json is drawn as JSON',
      condition: ({ input: [file], output }) => !(file.kind === 'text' && file.extension === 'json') || output === 'json',
    },
    otherTextAsText: {
      description: 'Any other text file, a log among them, is drawn as text',
      condition: ({ input: [file], output }) =>
        !(file.kind === 'text' && !['md', 'markdown', 'json'].includes(file.extension)) || output === 'text',
    },
    noViewerForTheRest: {
      description: 'A file the api does not serve, or serves as no kind the board draws, has no viewer: it is offered by its link',
      condition: ({ input: [file], output }) => file.kind === 'image' || file.kind === 'text' || output === 'none',
    },
  },
});

/** `viewerOf`'s type, which src/lib/viewers.ts takes. */
export type ViewerOf = Implementation<typeof viewerOfSpec>;
