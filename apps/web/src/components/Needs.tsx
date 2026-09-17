import { Fragment } from 'react';
import type { RunDetail } from '../lib/api';
import { needsOf, needText, offersOf, stepAnchor } from '../lib/asks';
import { Continue } from './Decide';

/**
 * The banner at the top of a run's page: who the run waits on, in the package's words, and what each step needs — its question, or that
 * the harness blocked its session, with what the session said last. A session the harness blocked is continued from here, as `wf retry`
 * continues it (`Continue`); once that try is asked, the banner says what the tick does with it, in `wf ls`'s words: the step's note.
 *
 * Who it waits on is said as `wf ls` says it after `→ waiting on you:` (`onYou`): a step's name, and for a step at its gate, `approve plan`,
 * linked to the step's section, where Approve and Send back are.
 */
export function NeedsBanner({ run }: { run: RunDetail }) {
  // A step at its gate is said in the line, as `wf ls` says it (`approve plan`): its approval is no question to list under it.
  const needs = needsOf(run).filter((need) => need.kind !== 'approve');
  if (!run.waitingOnYou.length && !needs.length) return null;
  const offers = offersOf(run);
  return (
    <section aria-label="Waiting on you" className="space-y-1.5 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {run.waitingOnYou.length > 0 && (
        <p>
          Waiting on you:{' '}
          <strong>
            {run.onYou.map((said, i) => {
              const step = run.waitingOnYou[i]!;
              return (
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
              );
            })}
          </strong>{' '}
          — signed off blocked, unsigned, refused by its check, waiting at its gate, out of rounds, or past its budget —{' '}
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
