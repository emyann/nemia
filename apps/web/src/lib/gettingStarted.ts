/**
 * The floor's "Getting started" list: where each milestone's page is (`MILESTONE_LINKS`; the harness's, the factory's and the volume's today, the
 * next cards adding theirs), each milestone's name as the list says it, whether the list is shown (`starterShown`), and the person's
 * dismissal of it, kept in this browser through `lib/stored.ts`, since the server keeps nothing of it. Where each milestone stands is the
 * api's read, never kept here.
 */
import type { Milestone, MilestoneRead } from 'objects';
import { readStored, store } from './stored.ts';

/** The page that does each milestone, where one is built: none for those whose page a later card adds. */
export const MILESTONE_LINKS: Readonly<Record<Milestone, '/setup' | '/welcome/factory' | '/welcome/volume' | undefined>> = {
  harness: '/setup',
  factory: '/welcome/factory',
  volume: '/welcome/volume',
  landed: undefined,
};

/** Each milestone's name, as the list's row says it. */
export const MILESTONE_NAMES: Readonly<Record<Milestone, string>> = {
  harness: 'A harness',
  factory: 'A factory',
  volume: 'A volume',
  landed: 'A first change merged',
};

/** The key the dismissal is kept under. */
const STARTER_KEY = 'nemia:getting-started-dismissed';

/** Whether the list was dismissed in this browser: kept as `1`, anything else read as not. */
export const readStarterDismissed = (): boolean => readStored(STARTER_KEY, (raw) => (raw === '1' ? true : undefined), false);

/** Keeps the dismissal, so the list is not shown again in this browser. */
export const keepStarterDismissed = (): void => store(STARTER_KEY, '1');

/**
 * Whether the list is shown: not dismissed in this browser, and no run has landed yet.
 * @param milestones The store's milestones, as the api read them.
 * @param dismissed Whether the person dismissed the list in this browser.
 */
export const starterShown = (milestones: readonly MilestoneRead[], dismissed: boolean): boolean =>
  !dismissed && milestones.some((m) => m.name === 'landed' && m.state !== 'done');
