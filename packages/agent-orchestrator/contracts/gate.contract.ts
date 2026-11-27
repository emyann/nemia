/**
 * A gate, from a person's side (agent-orchestrator, src/gate/gate.ts): why `nemia approve` will not approve a step
 * (`approvalRefusal`), and whether a step's task, held open, waits for a person's word (`holdsOpen`, src/gate/holds-open/holds-open.ts,
 * its spec `holds-open.contract.ts`'s). The task turns on where
 * the step stands (`standing`, status.ts), which reads some forty functions of the run's record and closeouts: the gate
 * takes what its spec proves of it (`standing.contract.ts`), and nothing of its body. The approval turns on the word the run
 * reads for the step (`runWords`), its standing with the routing laid over it, so a node the run says waits at its gate is
 * never refused as not filed: declared, with what the gate leans on of it (`theRunsWords`). The send-back (`retryable`) only shapes
 * what a refusal says: declared pure, and nothing more.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import type { Verdict } from '../src/check/check.ts';
import type { Closeout } from '../src/closeout/index.ts';
import type { CloseoutAsked, Run, TaskPhase } from '../src/record/record.ts';
import type { RetryAsk } from '../src/retry/index.ts';
import type { StepSpec } from '../src/step/step.ts';
import { retryable } from '../src/retry/retry.ts';
import { type SpendOf, standing } from '../src/status/status.ts';
import { runWords } from '../src/route/routed/routed-words.ts';
import { holdsOpen } from '../src/gate/holds-open/holds-open.ts';
import { approved, gated, tryNow } from './laws.ts';

export const sendBack = assume(retryable, { pure: true });

/**
 * Every step's word on this pass, as the run's status and `nemia ls` read it (`runWords`, routed-words.ts): where it stands, with its
 * routing laid over it — a table condition never filed reads `awaiting approval` once its table answered, where it is gated and the try
 * it is on is not approved. Its loop over the steps, each read off the words before it, is not read by the verifier: what the gate
 * leans on is declared here, trusted, and held on real runs by `brokenOn` (`test/gate-assumptions.test.ts`).
 */
export const theRunsWords = assume(runWords, {
  pure: true,
  ensures: {
    /** A step the run reads awaiting approval is gated: by its workflow, or by the run. */
    awaitingOnlyAtAGate: ({ input: [steps, run], output }) =>
      steps.every((s) => output.get(s.name) !== 'awaiting approval' || gated(s, run)),
    /** Nobody has approved the try of a step the run reads awaiting approval. */
    awaitingIsUnapproved: ({ input: [steps, run], output }) =>
      steps.every((s) => output.get(s.name) !== 'awaiting approval' || !approved(run, s.name)),
  },
});

/** The word the run reads for the step `name` on this pass (`runWords`), the callbacks left out given as the gate defaults them. */
const theRunsWord = (
  steps: readonly StepSpec[],
  run: Run,
  name: string,
  p: (taskId: string) => TaskPhase,
  c: ((step: string) => Closeout | undefined) | undefined,
  a: ((taskId: string) => CloseoutAsked) | undefined,
  v: ((step: string) => Verdict | undefined) | undefined,
  s: SpendOf | undefined,
) => runWords(steps, run, p, c ?? (() => undefined), a ?? (() => false), s ?? (() => undefined), v ?? (() => undefined)).get(name);

/**
 * Whether the step `name` waits at its gate on this pass: the run reads it `awaiting approval` (`theRunsWord`) — and, filed, it stands
 * there too (`standing`), since its session is then what waits for the word. A step never filed waits where the run alone reads it so: a
 * gated table condition whose table answered. The routing never reads a filed step `awaiting
 * approval` where its standing does not (`filedWord` only ever says `unverified` or `unsigned`), so the second half changes nothing of
 * a real run: it says that a filed step's gate is its session's.
 */
const atItsGate = (
  steps: readonly StepSpec[],
  run: Run,
  name: string,
  p: (taskId: string) => TaskPhase,
  c: ((step: string) => Closeout | undefined) | undefined,
  a: ((taskId: string) => CloseoutAsked) | undefined,
  v: ((step: string) => Verdict | undefined) | undefined,
  s: SpendOf | undefined,
) => {
  const step = steps.find((x) => x.name === name);
  if (step === undefined || theRunsWord(steps, run, name, p, c, a, v, s) !== 'awaiting approval') return false;
  return (
    !run.steps[name]?.taskId ||
    standing(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v).status === 'awaiting approval'
  );
};

const approvalRefusalSpec = spec<
  (
    steps: readonly StepSpec[],
    run: Run,
    name: string,
    message: string | undefined,
    phaseOf: (taskId: string) => TaskPhase,
    closeoutOf?: (step: string) => Closeout | undefined,
    askedCloseout?: (taskId: string) => CloseoutAsked,
    verdictOf?: (step: string) => Verdict | undefined,
    asks?: readonly RetryAsk[],
    spendOf?: SpendOf,
  ) => string | null
>({
  /**
   * A run holds a record of each of its steps: `nemia start` writes one for each (start.verb.ts). Each step's name appears once among
   * `steps`: a step's name is its file's within one folder (src/folder/folder.store.ts:66).
   */
  requires: ({ input: [steps, run] }) =>
    steps.every((s) => Object.hasOwn(run.steps, s.name)) && steps.every((s, i) => !steps.some((t, j) => j !== i && t.name === s.name)),
  ensures: {
    emptyWords: {
      description: 'A message given blank is refused',
      condition: ({ input: [, , , message], output }) => message === undefined || message.trim() !== '' || output !== null,
    },
    aStepOfTheWorkflow: {
      description: 'A name that is no step of the workflow is refused',
      condition: ({ input: [steps, , name], output }) => steps.some((s) => s.name === name) || output !== null,
    },
    aCancelledRunFilesNothing: {
      description: 'Nothing is approved on a cancelled run',
      condition: ({ input: [, run], output }) => !run.cancelledAt || output !== null,
    },
    aPrunedRunFilesNothing: {
      description: 'Nothing is approved on a pruned run',
      condition: ({ input: [, run], output }) => !run.pruned || output !== null,
    },
    aHeldRunFilesNothing: {
      description: 'Nothing is approved on a held run',
      condition: ({ input: [, run], output }) => !run.hold || output !== null,
    },
    onlyAGate: {
      description: 'Only a gated step is approved',
      condition: ({ input: [steps, run, name], output }) => {
        const step = steps.find((s) => s.name === name);
        return output !== null || (step !== undefined && gated(step, run));
      },
    },
    onceATry: {
      description: 'A try is approved once',
      condition: ({ input: [, run, name], output }) =>
        output !== null || !(run.approvals ?? []).some((x) => x.step === name && x.try === tryNow(run, name)),
    },
    notWhileASendBackIsAsked: {
      description: 'Nothing is approved while the step is sent back for another try',
      condition: ({ input: [, run, name, , , , , , asks], output }) =>
        output !== null || !(asks ?? []).some((x) => x.step === name && x.try === tryNow(run, name) + 1),
    },
    onlyWhereItWaits: {
      description:
        "Only a step the run reads awaiting approval is approved — the word the run's status and nemia ls read, routing and all — and a filed one where it stands at its gate",
      condition: ({ input: [steps, run, name, , p, c, a, v, , s], output }) =>
        output !== null || atItsGate(steps, run, name, p, c, a, v, s),
    },
    takenAtItsGate: {
      description:
        'An approval of a step the run reads awaiting approval — a gated step that signed off, a gated table condition never filed whose table answered — on a run neither cancelled nor pruned, is taken: but where its words are blank, the run is held, or the try after it is asked for',
      condition: ({ input: [steps, run, name, message, p, c, a, v, asks, s], output }) => {
        const step = steps.find((x) => x.name === name);
        if (step === undefined || run.cancelledAt || run.pruned) return true;
        if (message !== undefined && message.trim() === '') return true;
        if (run.hold) return true;
        if ((asks ?? []).some((x) => x.step === name && x.try === tryNow(run, name) + 1)) return true;
        return !atItsGate(steps, run, name, p, c, a, v, s) || output === null;
      },
    },
    heldOpenForIt: {
      description:
        "What nemia approve accepts of a step it filed, that step's task is held open for: the approval reaches the session that waits. A step never filed — a table condition — has no session to reach",
      condition: ({ input: [steps, run, name, , p, c, a, v, , s], output }) => {
        const step = steps.find((x) => x.name === name);
        return (
          output !== null ||
          !run.steps[name]?.taskId ||
          (step !== undefined && holdsOpen(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v))
        );
      },
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ApprovalRefusal = Implementation<typeof approvalRefusalSpec>;
