/**
 * Which resource a word typed at `nemia get`, `apply` and `explain` names, pure (`contracts/resource.contract.ts`): among the resources
 * discovery lists, the first kind's own whose plural or singular is the word, the caller having put it in lower case; never a
 * sub-resource (`runs/hold`). A word that names none is refused, and the caller names the resources there are.
 */
import type { ResourceNamed } from '../../contracts/resource.contract.ts';

export const resourceNamed: ResourceNamed = (resources, word) =>
  resources.find((r) => !r.name.includes('/') && (r.name === word || r.singularName === word)) ?? { refused: 'unknown' };
