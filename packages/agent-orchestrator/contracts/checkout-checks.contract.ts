/**
 * Whether an ending's checks still hold the repository's own checkout (agent-orchestrator, src/ending/ending.ts, `checksHoldCheckout`):
 * what `landingOpen` reads of its checks, beside its session in flight and a merge of its own staged there, so that another run's ending
 * is filed into that checkout once nothing of this one needs it any more.
 *
 * An ending (`workspace: base`) works in one directory, the repository's own checkout, and its checks run there after it signs off. A
 * check that runs a command (`run:`) runs it there; a check that waits on a condition (`condition:`) runs nothing there — its writer,
 * a program or a person, reads what it reads elsewhere, as a wait on a CI service at the commit that landed does. Such a check holds
 * nothing: the checkout is given back once every check that runs there has passed, while a condition is still not written, and the step
 * is still judged on all of them. A check that runs there and refused, or did not finish, keeps it held for a signed ending until the run
 * has recorded what it landed (`landingDue`); the record, once written, ends the hold.
 *
 * The orchestrator's, never the runtime's: one checkout at a time is a workflow's rule (`heldCheckouts`, src/cap/cap.ts), and whether a
 * check runs a command or waits on a condition is the workflow's word on its check.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CheckStanding } from './checks-due.contract.ts';

/**
 * One check of an ending as the hold reads it: whether it runs a command in the repository's own checkout (`runsThere`: a `run:` check,
 * never a `condition:` one), and where it stands on the current try (`CheckStanding`: `waiting` where it is not filed yet, its plan read
 * before any is).
 */
export type CheckoutCheck = { readonly runsThere: boolean; readonly standing: CheckStanding };

/** A check that runs in the checkout and is running there now. */
const inTheCheckout = (c: CheckoutCheck) => c.runsThere && c.standing === 'running';

/** A check that runs in the checkout and has not passed: still due, running, refused or unfinished. */
const owedTheCheckout = (c: CheckoutCheck) => c.runsThere && c.standing !== 'passed';

const checksHoldCheckoutSpec = spec<(checks: readonly CheckoutCheck[], signedDone: boolean) => boolean>({
  /** An ending that lands on its check has one at least (`landsOnCheck`), its plan read from `check:` or `checks:`. */
  requires: ({ input: [checks] }) => checks.length >= 1,
  ensures: {
    aCheckRunningInTheCheckoutHoldsIt: {
      description: 'A check that runs in the checkout and is running there holds it, however the step signed off',
      condition: ({ input: [checks], output }) => !checks.some(inTheCheckout) || output,
    },
    aSignedEndingHoldsItUntilItsCheckoutChecksPass: {
      description:
        'An ending that signed off done holds the checkout while a check that runs there has not passed: still to be filed, running, or refused and its landing not yet recorded',
      condition: ({ input: [checks, signedDone], output }) => !(signedDone && checks.some(owedTheCheckout)) || output,
    },
    givenBackOnceEveryCheckoutCheckPassed: {
      description:
        'Once every check that runs in the checkout has passed, the checks hold it no more, whatever the conditions it waits on stand at',
      condition: ({ input: [checks], output }) => checks.some(owedTheCheckout) || !output,
    },
    anEndingThatDidNotSignDoneHoldsItOnlyWhileACheckRunsThere: {
      description:
        'An ending that signed off anything but done holds the checkout by its checks only while one that runs there is running there',
      condition: ({ input: [checks, signedDone], output }) => signedDone || checks.some(inTheCheckout) || !output,
    },
  },
});

/** `checksHoldCheckout`'s type, which the code takes: it then imports nothing of tsverify. */
export type ChecksHoldCheckout = Implementation<typeof checksHoldCheckoutSpec>;
