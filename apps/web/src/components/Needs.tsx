import { Fragment } from 'react';
import type { RunDetail } from '../lib/api';
import { needsOf, needText, offersOf, stepAnchor } from '../lib/asks';
import { onYouOf, toDecideOf } from '../lib/factory';
import { Continue } from './Decide';

/**
 * What a person has to decide about the run's result, above the banner and the page, as `wf ls` prints `→ to decide:` above
 * `→ waiting on you`: the ending step's gate, in the folder's own words, with the command that approves it — linked to that step's
 * section, where Approve and Send back are — or the result branch nobody has merged. Nothing while there is nothing to decide.
 */
export function ToDecideBanner({ run }: { run: RunDetail }) {
  const decide = toDecideOf(run);
  if (!decide) return null;
  return (
    <section
      aria-label="To decide"
      data-to-decide={decide.kind}
      className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
    >
      <strong>To decide:</strong>{' '}
      {decide.kind === 'approve' ? (
        // To the ending step's section, where its gate is: a hash the browser scrolls to, and no navigation.
        <a href={`#${stepAnchor(decide.step)}`} data-approve={decide.step} className="underline underline-offset-2">
          {decide.said}
        </a>
      ) : (
        decide.said
      )}
    </section>
  );
}

/**
 * The banner at the top of a run's page: who the run waits on, in the package's words, and what each step needs — its question, or that
 * the harness blocked its session, with what that harness says it waits for, what the session said last, and under them where a person
 * answers the wait: in Claude Code, and never from here. A session the harness blocked is continued from here, as `wf retry` continues it
 * (`Continue`); once that try is asked, the banner says what the tick does with it, in `wf ls`'s words: the step's note.
 *
 * Who it waits on is said as `wf ls` says it after `→ waiting on you:` (`onYou`): a step's name, and for a step at its gate, `approve plan`,
 * linked to the step's section, where Approve and Send back are. Without the ending step whose gate the to-decide banner says (`onYouOf`),
 * which is above this one and names it: `wf ls` does not ask for the same step twice. A run whose whole `waiting on you` was that step has
 * no banner here at all.
 */
export function NeedsBanner({ run }: { run: RunDetail }) {
  // A step at its gate is said in the line, as `wf ls` says it (`approve plan`): its approval is no question to list under it.
  const needs = needsOf(run).filter((need) => need.kind !== 'approve');
  // Each step waited on with `wf ls`'s words for it, the ending step's own gate left to the banner above.
  const said = onYouOf(run);
  const asks = run.waitingOnYou.map((step, i) => ({ step, said: run.onYou[i] ?? step })).filter((one) => said.includes(one.said));
  if (!asks.length && !needs.length) return null;
  const offers = offersOf(run);
  return (
    <section aria-label="Waiting on you" className="space-y-1.5 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {asks.length > 0 && (
        <p>
          Waiting on you:{' '}
          <strong>
            {asks.map(({ step, said }, i) => (
              <Fragment key={step}>
                {i > 0 && ', '}
                {said === step ? (
                  said
                ) : (
                  // To the step's section on this page, where Approve is: a hash the browser scrolls to, and no navigation.
                  <a href={`#${stepAnchor(step)}`} data-approve={step} className="underline underline-offset-2">
                    {said}
                  </a>
                )}
              </Fragment>
            ))}
          </strong>{' '}
          — signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget —{' '}
          <code>wf decide {run.id}</code>
        </p>
      )}
      {needs.length > 0 && (
        <ul className="space-y-2">
          {needs.map((need) => {
            // A question is answered from the Decide section; a session the harness blocked, here.
            const offer = need.kind === 'harness' ? offers.find((o) => o.step === need.step) : undefined;
            return (
              <li key={need.step} data-need={need.kind} data-step={need.step} className="space-y-1.5">
                <p className="line-clamp-4 whitespace-pre-wrap break-words" title={needText(need)}>
                  <strong>{need.step}</strong> {need.kind === 'harness' ? 'is ' : ''}
                  {needText(need)}
                </p>
                {/* What a person does about the wait the line above says, in the package's words: the harness answers it, and this board
                    does not — Continue below only asks the tick for another try (`answerIn`). Once that try is asked, the next tick stops
                    this session, so the advice to answer a prompt in it goes, and the note below says what was asked instead. */}
                {need.kind === 'harness' && need.waitingFor && offer?.kind !== 'asked' && (
                  <p data-advice className="break-words text-xs">
                    {need.waitingFor.advice}
                  </p>
                )}
                {offer?.kind === 'continue' && <Continue runId={run.id} step={need.step} />}
                {offer?.kind === 'asked' && (
                  <p data-note className="font-mono text-xs">
                    {offer.note ?? `try ${offer.try} asked`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
