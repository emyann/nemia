/** `nemia closeout`, read from the api. Until it is ported it runs on the old path, unchanged. */
import { spawned } from '../local.ts';

export const closeout = (args: readonly string[]): Promise<number> => spawned(['closeout', ...args]);
