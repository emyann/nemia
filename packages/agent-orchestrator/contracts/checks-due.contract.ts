/**
 * Which of a step's named checks the pass files now, and where the step stands on them (agent-orchestrator, src/check/checks-due.ts,
 * `checksDue`): the judgement a tick makes of a step's checks on every pass, from what the engine holds of each check's task, and carries
 * nothing between passes.
 *
 * A step's checks are a graph of waits, as GitHub Actions' jobs are by their `needs:`: each check waits on the checks it names in `after:`
 * (the one above it where it names none, which the loader has already resolved, a check turned off by `enabled: false` taken out and its
 * waits handed to the checks that waited on it). A check is filed once every check it waits on has passed, so checks with no wait between
 * them run side by side. After a refusal no new check starts: a check already running finishes, and the step reads `failed` once none is
 * running, so the try after it is told every check that refused. A check that did not finish is no verdict on the work, and starts nothing
 * after it either.
 *
 * The orchestrator's, never the runtime's: the runtime runs each check as a task and records its exit code; what a step's checks mean
 * together is a workflow's word (`docs/architecture.md`, *Who owns what*).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * Where one check stands, off its task: `waiting`, not filed yet on this try; `running`, filed and not settled; `passed`, exit 0;
 * `refused`, a non-zero exit; `unfinished`, settled with no exit code (killed, stopped, past its deadline).
 */
export type CheckStanding = 'waiting' | 'running' | 'passed' | 'refused' | 'unfinished';

/** One check of a step as the pass reads it: its name, the checks it waits on (resolved by the loader), and where it stands. */
export type CheckNode = { readonly name: string; readonly after: readonly string[]; readonly standing: CheckStanding };

/**
 * Where a step stands on its checks: `checking` while one runs or can still be filed, `passed` once every check passed, `failed` once one
 * refused or did not finish and none is still running.
 */
export type ChecksVerdict = 'checking' | 'passed' | 'failed';

/** What the pass does with a step's checks: the names it files now, in the step's order, and where the step stands on them. */
export type ChecksDue = { readonly file: readonly string[]; readonly verdict: ChecksVerdict };

/** Whether a check settled with no pass: it refused, or did not finish. */
const stopped = (c: CheckNode) => c.standing === 'refused' || c.standing === 'unfinished';

/** Whether the check named `name` passed. */
const passedNamed = (checks: readonly CheckNode[], name: string) => checks.some((c) => c.name === name && c.standing === 'passed');

/** Whether every check `c` waits on passed. */
const ready = (checks: readonly CheckNode[], c: CheckNode) => c.after.every((name) => passedNamed(checks, name));

/** Whether the names hold `name`. */
const named = (names: readonly string[], name: string) => names.some((n) => n === name);

const checksDueSpec = spec<(checks: readonly CheckNode[]) => ChecksDue>({
  /**
   * What the loader lets through: at least one check, each named once, each waiting only on a check of the step other than itself (a
   * cycle is refused at load, and no law needs it ruled out here).
   */
  requires: ({ input: [checks] }) =>
    checks.length >= 1 &&
    checks.every((c, i) => checks.every((d, j) => i === j || c.name !== d.name)) &&
    checks.every((c) => c.after.every((name) => name !== c.name && checks.some((d) => d.name === name))),
  ensures: {
    nothingAfterARefusal: {
      description: 'Once a check refused or did not finish, no new check starts on this try, the ones already running left to finish',
      condition: ({ input: [checks], output }) => !checks.some(stopped) || output.file.length === 0,
    },
    filesOnlyWhatWaits: {
      description: 'Only a check not yet filed on this try is filed: a running or settled check is never filed again',
      condition: ({ input: [checks], output }) =>
        output.file.every((name) => checks.some((c) => c.name === name && c.standing === 'waiting')),
    },
    filesOnlyWhatIsReady: {
      description: 'A check is filed only once every check it waits on has passed',
      condition: ({ input: [checks], output }) => output.file.every((name) => checks.some((c) => c.name === name && ready(checks, c))),
    },
    filesEveryReadyCheck: {
      description:
        'With no refusal, every check whose waits have all passed is filed now, so checks with no wait between them run side by side',
      condition: ({ input: [checks], output }) =>
        checks.some(stopped) || checks.every((c) => c.standing !== 'waiting' || !ready(checks, c) || named(output.file, c.name)),
    },
    passedExactlyWhenEveryCheckPassed: {
      description: 'The step passes its checks exactly when every one of them passed',
      condition: ({ input: [checks], output }) => (output.verdict === 'passed') === checks.every((c) => c.standing === 'passed'),
    },
    failedExactlyWhenARefusalSettled: {
      description:
        'The step fails its checks exactly when one refused or did not finish and none is still running, so the try is told every refusal',
      condition: ({ input: [checks], output }) =>
        (output.verdict === 'failed') === (checks.some(stopped) && !checks.some((c) => c.standing === 'running')),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ChecksDueOf = Implementation<typeof checksDueSpec>;
