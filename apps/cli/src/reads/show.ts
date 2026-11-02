/** `nemia show`, read from the api. Until it is ported it runs on the old path, unchanged. */
import { spawned } from '../local.ts';

export const show = (args: readonly string[]): Promise<number> => spawned(['show', ...args]);
