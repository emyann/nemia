/**
 * Which resource a word typed at `nemia get`, `apply` and `explain` names (apps/cli, src/objects/resource.ts, `resourceNamed`), as
 * kubectl's mapper reads one: among the resources the api's discovery says it serves (`GET /api`, `objects`' `APIResource`), the one
 * whose plural or singular is the word, the caller having put it in lower case (`Card`, `card` and `cards` name one resource). A
 * sub-resource (`runs/hold`, a name with a `/`) is an action of a kind, never something these verbs read or write, so no word names one;
 * a word that names no resource is refused, and the caller names the resources there are.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { APIResource } from 'objects';

/** Why no resource is answered: the word names none the api serves. */
export type NoResource = { readonly refused: 'unknown' };

/** Whether `resource` is a kind's own, never a sub-resource of one. */
const whole = (resource: APIResource): boolean => !resource.name.includes('/');

/** Whether `word` names `resource`: its plural or its singular. */
const names = (resource: APIResource, word: string): boolean => resource.name === word || resource.singularName === word;

/** Whether `out` is a resource, not a refusal. */
const isResource = (out: APIResource | NoResource): out is APIResource => !('refused' in out);

const resourceNamedSpec = spec<(resources: readonly APIResource[], word: string) => APIResource | NoResource>({
  ensures: {
    answersOneServed: {
      description: 'A resource answered is one discovery lists',
      condition: ({ input: [resources], output }) => !isResource(output) || resources.some((r) => r.name === output.name),
    },
    answersWhatTheWordNames: {
      description: 'A resource answered is the one the word names, by its plural or its singular',
      condition: ({ input: [, word], output }) => !isResource(output) || names(output, word),
    },
    neverASubResource: {
      description: 'No word names a sub-resource: those are a kind’s actions',
      condition: ({ output }) => !isResource(output) || whole(output),
    },
    refusedOnlyWhenNoneNamed: {
      description: 'A word is refused only where no kind’s own resource is named by it',
      condition: ({ input: [resources, word], output }) => isResource(output) || !resources.some((r) => whole(r) && names(r, word)),
    },
  },
});

/** `resourceNamed`'s type, which src/objects/resource.ts takes. */
export type ResourceNamed = Implementation<typeof resourceNamedSpec>;
