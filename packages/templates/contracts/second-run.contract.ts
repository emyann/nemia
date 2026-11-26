/**
 * Whether a red CI context is worth a second run before the step that waits on it hears of it (`packages/templates/sdlc/carried/ci-log.ts`,
 * `toldOf` and `rerunDue`, which `ci-watch.ts` asks of a red head before it re-runs it once: `Red`, `contracts/ci-write.contract.ts`). A
 * red job is told apart by what GitHub and
 * its own log say of it: a failure whose log names a line that failed it — a test, a type error, a lint rule, a runner's failed subject,
 * as `failures` reads a log — is the change's, and a second run of the same commit would fail it again; any other red (timed out,
 * started up wrong, a failure whose log names no such line: an install, a network step, a runner lost) is the machine's, and a failure
 * whose log could not be read cannot be told, so it keeps the re-run it had. A context is re-run only where no red job of it is the
 * change's: one such job keeps the context red whatever the others do on a second run.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What a red job's log said, as `failures` read it: `failing`, it names a line that failed the job; `bare`, it was read and names none,
 * so only its tail can be given; `unread`, GitHub gave no log for it (refused, expired, not yet written).
 */
export type Reading = 'failing' | 'bare' | 'unread';

/**
 * A job the CI context judged red, as the wait knows it before it re-runs anything: `verdict`, its conclusion upper-cased as GitHub
 * gives it (`FAILURE`, `TIMED_OUT`, a startup failure, …, a cancel GitHub cut off at the job's time limit read as `TIMED_OUT`), and
 * `reading`, what its log said.
 */
export type RedJob = { verdict: string; reading: Reading };

/**
 * Whose a red job is: `change`, the commit's, which a second run would fail again; `machine`, CI's own, which a second run may pass;
 * `untold`, a failure whose log could not be read, re-run as before.
 */
export type Told = 'change' | 'machine' | 'untold';

/** What the wait does with a red context before it says anything to the step: re-run its failed jobs once, or report it now. */
export type Second = 'rerun' | 'report';

/** A job GitHub concluded failed, as against cut off, timed out or never started. */
const failed = (job: RedJob) => job.verdict === 'FAILURE';

const toldOfSpec = spec<(job: RedJob) => Told>({
  ensures: {
    changeIsAFailureWhoseLogNamesWhy: {
      description: "A red job is the change's exactly where it failed and its log names a line that failed it",
      condition: ({ input: [job], output }) => (output === 'change') === (failed(job) && job.reading === 'failing'),
    },
    untoldIsAFailureWithNoLog: {
      description: 'A red job cannot be told exactly where it failed and GitHub gave no log of it',
      condition: ({ input: [job], output }) => (output === 'untold') === (failed(job) && job.reading === 'unread'),
    },
  },
});
export type ToldOf = Implementation<typeof toldOfSpec>;

const rerunDueSpec = spec<(told: readonly Told[]) => Second>({
  ensures: {
    reportedExactlyWhenAJobIsTheChanges: {
      description:
        "A red context is reported at once exactly where one of its red jobs is the change's, which a second run would leave red; else its failed jobs are re-run once, as before",
      condition: ({ input: [told], output }) => (output === 'report') === told.some((t) => t === 'change'),
    },
  },
});
export type RerunDue = Implementation<typeof rerunDueSpec>;
