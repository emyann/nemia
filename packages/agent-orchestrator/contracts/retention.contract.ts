/**
 * Which releases go (agent-orchestrator, src/retention/retention.ts): `retention`, given the releases installed under the store's
 * `releases/`, newest first, and what is in use — the pointer's tag, the tags a running Nemia process or a session in flight runs on, and
 * the count of local sessions in flight that recorded no release. Claude Code's rule: keep the current, every release in use and the two
 * newest; remove the rest; and remove nothing while the pointer is missing or a session's release is unknown, since removing a release
 * under a session would crash it.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Installed, InUse, Retention } from '../src/retention/retention.ts';

/** Whether `tag` is kept by what is in use: the pointer names it, or a process or a session runs on it. */
const inUseBy = (inUse: InUse, tag: string): boolean => tag === inUse.current || inUse.pinned.includes(tag);

const retentionSpec = spec<(installed: readonly Installed[], inUse: InUse) => Retention>({
  /**
   * The installed releases are distinct folders. They come newest first (`newestFirst`), which the laws read only as "the first two":
   * the verifier does not model the order of strings, so that order is held by `src/retention/retention.test.ts`.
   */
  requires: ({ input: [installed] }) => installed.every((r, i) => installed.every((o, j) => j <= i || o.tag !== r.tag)),
  ensures: {
    neverTheCurrent: {
      description: 'The release the pointer names is never removed',
      condition: ({ input: [, inUse], output }) => output.remove.every((tag) => tag !== inUse.current),
    },
    neverWhatRuns: {
      description: 'A release a process or a session in flight runs on is never removed',
      condition: ({ input: [, inUse], output }) => output.remove.every((tag) => !inUse.pinned.includes(tag)),
    },
    neverTheTwoNewest: {
      description: 'The two newest releases are never removed',
      condition: ({ input: [installed], output }) => output.remove.every((tag) => installed.every((r, i) => i >= 2 || r.tag !== tag)),
    },
    onlyWhatIsInstalled: {
      description: 'Only an installed release is removed',
      condition: ({ input: [installed], output }) => output.remove.every((tag) => installed.some((r) => r.tag === tag)),
    },
    heldRemovesNothing: {
      description: 'A held sweep removes nothing',
      condition: ({ output }) => output.held === null || output.remove.length === 0,
    },
    noPointerHolds: {
      description: 'With no pointer, nothing is removed',
      condition: ({ input: [, inUse], output }) => (output.held === 'no pointer') === (inUse.current === null),
    },
    anUnrecordedSessionHolds: {
      description: 'A local session in flight that recorded no release holds every removal',
      condition: ({ input: [, inUse], output }) => (output.held === 'unrecorded') === (inUse.current !== null && inUse.unrecorded > 0),
    },
    /**
     * The full law, "every installed release that is not current, not running and not among the two newest is removed", waits on
     * tsverify proving that a filter's result keeps every element that passes (src-a-filter-s-result-is-pro-p25m), and
     * harness-updates-retention-s-jhbx restores it once a release does; `src/retention/retention.test.ts` holds it until then.
     */
    somethingGoes: {
      description: 'Unheld, where some installed release is not current, not running and not among the two newest, something is removed',
      condition: ({ input: [installed, inUse], output }) =>
        output.held !== null || installed.every((r, i) => i < 2 || inUseBy(inUse, r.tag)) || output.remove.length > 0,
    },
  },
});

/** `retention`'s type, which the code takes: it then imports nothing of tsverify. */
export type ReleaseRetention = Implementation<typeof retentionSpec>;
