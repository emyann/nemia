/**
 * The git side of the place's contract, at git's boundary: every walk of `WALKS` (`place-walks.ts`) asked of the git place over real
 * git, in scratch repositories. It gives the answers the test place is held to, which `place-contract.test.ts` runs the same walks on.
 */
import { gitPlace } from '../place/git/place.ts';
import { GIT_ENV, gitWorld } from './git-world.ts';
import { walksOn } from './place-walks.ts';

walksOn(() => ({ place: gitPlace({ env: GIT_ENV }), world: gitWorld }));
