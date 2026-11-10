/**
 * The default factory's two converters, one each way, both reading objects' `DEFAULT_NAMESPACE`, its one name: a run, a card or a place
 * names the default factory as none (null), and a filter, a tag and a verb's namespace name it. A leaf, importing no sibling, so every
 * file under `lib/api` reaches it (`test/api-files.test.ts`); the rest of the board reaches it through `lib/factories.ts`.
 */
import { DEFAULT_NAMESPACE } from 'objects';

/**
 * The name of a factory as the api answers it, null or absent for the default factory: objects' `DEFAULT_NAMESPACE` for that one. The
 * name a filter, a tag and a card show, and the namespace a verb is sent in. `factoryIn` is the way back.
 */
export const namespaceOf = (factory: string | null | undefined): string => factory ?? DEFAULT_NAMESPACE;

/** A factory's name in the api's form, the way back from `namespaceOf`: null for the default factory, named as none. */
export const factoryIn = (namespace: string | undefined): string | null =>
  namespace === undefined || namespace === DEFAULT_NAMESPACE ? null : namespace;
