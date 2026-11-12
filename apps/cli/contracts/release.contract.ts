/**
 * Whether this client and the daemon it asks are of one release (apps/cli, src/release.ts, `releaseMet`): the api-consumer intent's Q9,
 * a client and a daemon of different releases refused, naming `nemia version` on both machines, with no compatibility layer between
 * them. The client's release is the one its install's `release.json` says; the daemon's, the one its `GET /api/health` answers
 * (`Health.release`, an optional key of `objects`). Either is `null` where it says none: a checkout, or a daemon of a release before the
 * key, which is let through, since nothing is known to differ (`unsaid`).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * How two releases meet: `met`, both say one and it is the same; `differs`, both say one and they are not the same, which the client
 * refuses before it asks anything else; `unsaid`, either says none.
 */
export type ReleaseMeeting = 'met' | 'differs' | 'unsaid';

/** Whether both sides say a release. */
const bothSay = (client: string | null, daemon: string | null): boolean => client !== null && daemon !== null;

const releaseMetSpec = spec<(client: string | null, daemon: string | null) => ReleaseMeeting>({
  ensures: {
    differsExactlyWhenBothSayAndDisagree: {
      description: 'A client and a daemon that both say their release are refused exactly where the two are not the same',
      condition: ({ input: [client, daemon], output }) =>
        (output === 'differs') === (bothSay(client, daemon) && client !== daemon),
    },
    metExactlyWhenBothSayTheSame: {
      description: 'A client and a daemon that both say the same release meet',
      condition: ({ input: [client, daemon], output }) => (output === 'met') === (bothSay(client, daemon) && client === daemon),
    },
    unsaidExactlyWhenEitherIsSilent: {
      description: 'Where either side says no release — a checkout, or a daemon from before the key — nothing is known to differ',
      condition: ({ input: [client, daemon], output }) => (output === 'unsaid') === !bothSay(client, daemon),
    },
  },
});
export type ReleaseMet = Implementation<typeof releaseMetSpec>;
