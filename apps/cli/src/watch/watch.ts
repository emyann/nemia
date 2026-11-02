/** `nemia watch`, the feed followed over the api's stream. Until it is ported it runs on the old path, unchanged. */
import { spawned } from '../local.ts';

export const watch = (args: readonly string[]): Promise<number> => spawned(['watch', ...args]);
