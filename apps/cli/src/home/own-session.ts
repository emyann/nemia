/**
 * How a person's own session starts in a factory's home (`ownSessionOf`), and which earlier copies of that home the client removes once
 * it has rendered one (`staleCopiesOf`): pure decisions, proved by `contracts/own-session.contract.ts`. The session starts in the copy,
 * the person's repository added beside it, the copy denied to its edits, and the home's settings read alone, as a step's session starts in
 * its run's copy.
 */
import type { OwnSessionOf, SessionEnv, StaleCopiesOf } from '../../contracts/own-session.contract.ts';

export type { OwnSession, OwnSessionPlace, SessionFlag, SessionEnv } from '../../contracts/own-session.contract.ts';

/** Whether `inner` is `outer` or a folder under it. */
const within = (inner: string, outer: string): boolean => inner === outer || inner.startsWith(outer + '/');

/** The environment the session adds: the variable that loads an added folder's memory files, where the person turned them on. */
const memoryEnv = (on: boolean): SessionEnv => (on ? { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' } : {});

/**
 * The person's session in the copy `copy` of a factory's home, `repo` added beside it: refused where one folder holds the other, else
 * started in the copy with the repository added, the copy's edits denied as a read-only mount's are, and the project's settings alone.
 * @param place The copy, the repository and whether the repository's memory files load.
 */
export const ownSessionOf: OwnSessionOf = (place) => {
  if (within(place.copy, place.repo)) return { kind: 'refused', reason: 'repo-holds-home' };
  if (within(place.repo, place.copy)) return { kind: 'refused', reason: 'home-holds-repo' };
  return {
    kind: 'start',
    cwd: place.copy,
    flags: [
      { name: '--add-dir', value: place.repo },
      { name: '--disallowedTools', value: 'Edit(/' + place.copy + '/**)' },
      { name: '--setting-sources', value: 'project' },
    ],
    env: memoryEnv(place.claudeMd),
  };
};

/**
 * The copies among `present` to remove once `current` is rendered: every other copy of the home, but a render still being written (a
 * name opening with `.`).
 * @param present The names in the folder of the home's copies.
 * @param current The name of the copy just rendered, the home's digest.
 */
export const staleCopiesOf: StaleCopiesOf = (present, current) => present.filter((name) => name !== current && !name.startsWith('.'));
