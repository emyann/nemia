/**
 * Whether a schedule may be written into a factory for what it says of the repository its runs work on, and why not (agent-orchestrator,
 * src/factory/factory.ts, `scheduleRepoRefusal`), before anything is written. A schedule's `repo` is retired, as a card's `repo:` was: a
 * scheduled run works on the repository the factory's wiring names for its workflow (`wiredRepo`), else the factory's only one. So a
 * write that sets a `repo` the schedule had none of, or another than the one it has, is refused (`repo`, naming `nemia factory attach
 * <factory> <workflow> --repo <name>`), while one that sends an old schedule's back as it is, or leaves it out, is not; and a schedule of
 * a workflow the factory places on no repository — several, none wired for it — is refused (`unwired`, naming the same attach), since
 * its runs would not know where to work.
 *
 * One refusal is answered where both hold: a retired `repo` set is said first, whatever the wiring.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What the refusal is read from: the retired `repo` the schedule has now and the one the write sends (each absent where unset, each as
 * `path.resolve` spells it), and whether the factory's wiring places a repository for the workflow (`wiredRepo` answers one).
 */
export type ScheduleRepoAsk = {
  readonly repoNow?: string;
  readonly repoSent?: string;
  readonly wired: boolean;
};

/**
 * Why a schedule's write is refused for its repository, closed: a retired `repo` set or changed, or a workflow the wiring places
 * nowhere.
 */
export type ScheduleRepoRefusal = 'repo' | 'unwired';

/** Whether the write sets a `repo` the schedule has none of, or another than the one it has: leaving it out sets none. */
const placesByRepo = (ask: ScheduleRepoAsk): boolean => ask.repoSent !== undefined && ask.repoSent !== ask.repoNow;

const scheduleRepoRefusalSpec = spec<(ask: ScheduleRepoAsk) => ScheduleRepoRefusal | null>({
  ensures: {
    repoRetired: {
      description:
        "A write that sets a schedule's repository, or changes an old schedule's, is refused: the factory's wiring places its runs",
      condition: ({ input: [ask], output }) => !placesByRepo(ask) || output === 'repo',
    },
    oldRepoKept: {
      description: "A write that sends an old schedule's repository back as it is, or leaves it out, is never refused for it",
      condition: ({ input: [ask], output }) => placesByRepo(ask) || output !== 'repo',
    },
    unwiredRefused: {
      description: 'A schedule of a workflow the factory places on no repository is refused, where its repository is not refused first',
      condition: ({ input: [ask], output }) => placesByRepo(ask) || ask.wired || output === 'unwired',
    },
    scheduledOtherwise: {
      description: 'A schedule of a workflow the wiring places, sending no new repository, is let through',
      condition: ({ input: [ask], output }) => placesByRepo(ask) || !ask.wired || output === null,
    },
  },
});

/** `scheduleRepoRefusal`'s type, which src/factory/factory.ts takes. */
export type ScheduleRepoRefusalOf = Implementation<typeof scheduleRepoRefusalSpec>;
