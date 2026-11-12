/**
 * A harness as a need (src/needs/harness.ts): what the runtime's adapters declare of their install and sign-in, judged four ways.
 *
 * - `harnessesOfRun`: the harnesses a run needs, from the steps of its workflow as the run froze them. A step that runs a session runs
 *   on the harness it names, or on the runtime's default where it names none; a step that runs no session (a script, a gate, a route)
 *   needs no harness. Only a harness whose adapter declares needs is one (a command or a remote agent declares none), and each once.
 * - `runsHoldingRemoval`: the runs a fix that takes a need away (`kind: removes`, a harness deactivated) waits on. Every unfinished run
 *   whose needs name it, and no other: the refusal names them, with how to stop each.
 * - `harnessVersionWord`: what the readiness read says of the version a harness answered, against the pin this release was tested
 *   with: the pin itself is `tested`, any other version `untested` (it still runs), and no answer `unread`.
 * - `upgradeCarries`: the harnesses `nemia upgrade` installs at the new release's pins before it switches: each the tools folder holds
 *   activated, and each the running release carries in its own tree (Claude Code, in the releases that bundled it), so nothing that ran
 *   stops after the switch; none twice, and nothing the person never had.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A step of a run's frozen workflow, as far as its harness goes: the harness it names, and whether it runs a session at all. */
export type StepHarness = { readonly harness: string | undefined; readonly runsSession: boolean };

/** The harness `step` runs on: the one it names, else `defaultHarness`. */
const harnessOfStep = (step: StepHarness, defaultHarness: string): string => step.harness ?? defaultHarness;

/** Whether `list` holds no name twice. */
const noneTwice = (list: readonly string[]): boolean => list.every((name, i) => list.indexOf(name) === i);

const harnessesOfRunSpec = spec<(steps: readonly StepHarness[], defaultHarness: string, withNeeds: readonly string[]) => readonly string[]>(
  {
    ensures: {
      aSessionStepsHarnessIsNeeded: {
        description: 'Each step that runs a session needs the harness it runs on, where that harness declares needs',
        condition: ({ input: [steps, defaultHarness, withNeeds], output }) =>
          steps.every(
            (s) =>
              !s.runsSession || !withNeeds.includes(harnessOfStep(s, defaultHarness)) || output.includes(harnessOfStep(s, defaultHarness)),
          ),
      },
      onlyAHarnessASessionRunsOn: {
        description: 'A harness is needed only where a step of the run runs a session on it: a script or a gate needs none',
        condition: ({ input: [steps, defaultHarness], output }) =>
          output.every((h) => steps.some((s) => s.runsSession && harnessOfStep(s, defaultHarness) === h)),
      },
      onlyAHarnessThatDeclaresNeeds: {
        description: 'A harness whose adapter declares no needs (a command, a remote agent) is never one',
        condition: ({ input: [, , withNeeds], output }) => output.every((h) => withNeeds.includes(h)),
      },
      eachOnce: {
        description: 'A harness two steps run on is needed once',
        condition: ({ output }) => noneTwice(output),
      },
    },
  },
);

/** `harnessesOfRun`'s type, which src/needs/harness.ts takes. */
export type HarnessesOfRun = Implementation<typeof harnessesOfRunSpec>;

/** An unfinished run, as far as a removal goes: its id and the names of the needs it has (its workflow's, its place's, its harnesses'). */
export type RunNeeding = { readonly run: string; readonly needs: readonly string[] };

const runsHoldingRemovalSpec = spec<(need: string, unfinished: readonly RunNeeding[]) => readonly string[]>({
  ensures: {
    aRunThatNeedsItHolds: {
      description: 'Every unfinished run that needs what a fix would take away holds the fix, and is named',
      condition: ({ input: [need, unfinished], output }) => unfinished.every((r) => !r.needs.includes(need) || output.includes(r.run)),
    },
    onlyARunThatNeedsItHolds: {
      description: 'A run that does not need it holds nothing: each run named needs it',
      condition: ({ input: [need, unfinished], output }) =>
        output.every((id) => unfinished.some((r) => r.run === id && r.needs.includes(need))),
    },
    eachOnce: {
      description: 'A run is named once',
      condition: ({ output }) => noneTwice(output),
    },
  },
});

/** `runsHoldingRemoval`'s type, which src/needs/harness.ts takes. */
export type RunsHoldingRemoval = Implementation<typeof runsHoldingRemovalSpec>;

/** What the readiness read says of a harness's version against its pin. */
export type HarnessVersionWord = 'tested' | 'untested' | 'unread';

const harnessVersionWordSpec = spec<(found: string | undefined, pin: string) => HarnessVersionWord>({
  ensures: {
    thePinIsTested: {
      description: 'A harness that answers the version this release was tested with is tested',
      condition: ({ input: [found, pin], output }) => found !== pin || output === 'tested',
    },
    anyOtherVersionIsUntested: {
      description: 'A harness that answers any other version is untested: it still runs, and the read says so',
      condition: ({ input: [found, pin], output }) => found === undefined || found === pin || output === 'untested',
    },
    noAnswerIsUnread: {
      description: 'A harness whose version could not be read is neither tested nor untested',
      condition: ({ input: [found], output }) => found !== undefined || output === 'unread',
    },
  },
});

/** `harnessVersionWord`'s type, which src/needs/harness.ts takes. */
export type HarnessVersionWordOf = Implementation<typeof harnessVersionWordSpec>;

/** What an upgrade reads before it switches: the harnesses the tools folder holds activated, and those the running release carries. */
export type HarnessesHeld = { readonly activated: readonly string[]; readonly bundled: readonly string[] };

const upgradeCarriesSpec = spec<(held: HarnessesHeld, pinned: readonly string[]) => readonly string[]>({
  ensures: {
    anActivatedHarnessMoves: {
      description: 'Each harness activated in the tools folder is installed at the new release’s pin, where that release pins it',
      condition: ({ input: [held, pinned], output }) => held.activated.every((h) => !pinned.includes(h) || output.includes(h)),
    },
    aBundledHarnessIsKept: {
      description: 'A harness the running release carries in its own tree is activated at the new pin, so nothing that ran stops',
      condition: ({ input: [held, pinned], output }) => held.bundled.every((h) => !pinned.includes(h) || output.includes(h)),
    },
    nothingThePersonNeverHad: {
      description: 'An upgrade installs no harness that was neither activated nor carried by the running release',
      condition: ({ input: [held], output }) => output.every((h) => held.activated.includes(h) || held.bundled.includes(h)),
    },
    onlyAPinnedHarness: {
      description: 'An upgrade installs only a harness the new release pins',
      condition: ({ input: [, pinned], output }) => output.every((h) => pinned.includes(h)),
    },
    eachOnce: {
      description: 'A harness both activated and carried is installed once',
      condition: ({ output }) => noneTwice(output),
    },
  },
});

/** `upgradeCarries`' type, which src/release/carry.ts takes. */
export type UpgradeCarries = Implementation<typeof upgradeCarriesSpec>;
