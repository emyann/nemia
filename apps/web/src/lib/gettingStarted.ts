/**
 * The welcome's milestones as its pages say them: where each milestone's page is (`MILESTONE_LINKS`), and each milestone's name as a
 * page's Next says it (`MILESTONE_NAMES`). Where each milestone stands is the api's read, never kept here.
 */
import type { Milestone } from 'objects';

/** The page that does each milestone. */
export const MILESTONE_LINKS: Readonly<Record<Milestone, '/setup' | '/welcome/factory' | '/welcome/volume' | '/welcome/card'>> = {
  harness: '/setup',
  factory: '/welcome/factory',
  volume: '/welcome/volume',
  succeeded: '/welcome/card',
};

/** Each milestone's name, as a page's Next says it. */
export const MILESTONE_NAMES: Readonly<Record<Milestone, string>> = {
  harness: 'A harness',
  factory: 'A factory',
  volume: 'A volume',
  succeeded: 'A first run that succeeded',
};
