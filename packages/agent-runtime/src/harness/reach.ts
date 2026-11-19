/**
 * What a harness's fence words reach (`FenceReach`) and which characters its permission rules cannot carry in a path, read off its
 * declaration (`declaration.ts`): pure, so a caller that only judges words asks without loading a runner.
 */
import { own } from '../core/own.ts';
import { HARNESS_DECLARATIONS } from './declaration.ts';

export type { FenceReach } from './declaration.ts';

/**
 * What harness `harness`'s fence words reach on `model` (`FenceReach`), or `undefined` for a harness whose declaration carries no fence
 * reach: a command, an A2A agent, or a name the runtime does not know.
 * @param harness The harness's name.
 * @param model The model the session runs on, or undefined for the harness's default.
 */
export const fenceReach = (harness: string, model?: string) => own(HARNESS_DECLARATIONS, harness)?.reach?.(model);

/**
 * The first character of `path` that a permission rule of harness `harness` cannot carry, so that a rule naming the path would end, or
 * name another folder, or widen to one beside it; `undefined` for a path every rule carries, and on a harness whose fence takes no rule
 * naming a path: Codex, a command, an A2A agent, or a name the runtime does not know.
 * @param harness The harness's name.
 * @param path The path a rule would name.
 */
export const unruledIn = (harness: string, path: string) => own(HARNESS_DECLARATIONS, harness)?.unruled?.exec(path)?.[0];
