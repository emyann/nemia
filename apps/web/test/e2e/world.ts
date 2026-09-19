/**
 * Where the e2e's things are, and what the runner (run.ts) sets up for the pages to read: the store the api serves, the environment it
 * runs in, and what draft's stand-in inbox has heard. Set only by the runner, through `setStore` and `setApiEnv`; a page reads them
 * when it is visited, never as it is imported, when the runner has set up nothing yet.
 */
import path from 'node:path';

export const WEB = path.resolve(import.meta.dirname, '..', '..');
export const REPO = path.resolve(WEB, '..', '..');
export const API = path.join(REPO, 'apps', 'api');
export const OUT = path.resolve(process.env.WF_ARTIFACTS || path.join(REPO, '.e2e'));

/** The seeded store, a temporary WF_ROOT, while the e2e runs. */
export let store: string | undefined;
export function setStore(to: string | undefined): void {
  store = to;
}
/** The environment the api runs in — its store, its `claude`, where sessions register — for a `wf` a page runs on the same store. */
export let apiEnv: NodeJS.ProcessEnv = {};
export function setApiEnv(to: NodeJS.ProcessEnv): void {
  apiEnv = to;
}
/** Every line draft's stand-in inbox (SAYING, INBOX) has been sent, in order: what the `say` page holds its words to. */
export const heard: unknown[] = [];
