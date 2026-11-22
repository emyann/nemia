/**
 * Which request of a story is a stray (apps/web, `.storybook/network.ts`, `strayOf`, read by the preview's fallback handler): one that
 * would leave the browser. A request to the board's api (`/api`, which Vite forwards to an api the stories never have) or to another
 * origin is a stray, answered by no story's handler: the preview records it and answers it with a network error, and the story fails
 * after it is drawn, naming it. A request for the stories' own files, on their own origin and outside `/api`, is no stray.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A request as the story's page sent it: whether it is to the page's own origin, and its path. */
export type StoryRequest = { readonly sameOrigin: boolean; readonly path: string };

/** Whether `path` is the board's api or under it, by whole segments: `/api` and `/api/…`, never `/apiary`. */
const underApi = (path: string) => path === '/api' || path.startsWith('/api/');

const strayOfSpec = spec<(request: StoryRequest) => boolean>({
  requires: ({ input: [request] }) => request.path.startsWith('/'),
  ensures: {
    theApiIsAStray: {
      description: "A request to the board's api on the page's own origin is a stray: Vite would forward it to an api that is not there",
      condition: ({ input: [request], output }) => !request.sameOrigin || !underApi(request.path) || output,
    },
    anotherOriginIsAStray: {
      description: 'A request to another origin is a stray: no story draws from the network',
      condition: ({ input: [request], output }) => request.sameOrigin || output,
    },
    ownFilesPass: {
      description: "A request on the page's own origin outside /api, a module, a font, a picture, is no stray",
      condition: ({ input: [request], output }) => !request.sameOrigin || underApi(request.path) || !output,
    },
  },
});
export type StrayOf = Implementation<typeof strayOfSpec>;
