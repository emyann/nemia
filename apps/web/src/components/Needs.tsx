import { Fragment, type ReactNode } from 'react';
import type { RunDetail } from '../lib/api';
import { askedOf, needsOf, needText, offersOf, stepAnchor, type OfferKind } from '../lib/asks';
import { onYouOf, toDecideOf } from '../lib/factory';
import { Continue } from './Decide';
import { Markdown } from './Markdown';
import { container } from '../lib/meaning';

/** The line of an offer's command (`kind`) for its step, as the api answers it on the step (`commands`); none for a step the run lacks. */
const lineOf = (run: RunDetail, offer: { step: string; kind: OfferKind }): string =>
  run.steps.find((s) => s.name === offer.step)?.commands[offer.kind] ?? '';

/**
 * A banner's link to the step `step`, saying `children`: a button calling `onStep` with the step where one is given, as in the frame's bar,
 * where a hash would point nowhere; else a hash to the step's section on the run's page.
 */
function StepLink({ step, onStep, children }: { step: string; onStep: ((step: string) => void) | undefined; children: ReactNode }) {
  const className = 'underline underline-offset-2';
  return onStep ? (
    <button type="button" data-approve={step} className={className} onClick={() => onStep(step)}>
      {children}
    </button>
  ) : (
    <a href={`#${stepAnchor(step)}`} data-approve={step} className={className}>
      {children}
    </a>
  );
}

/**
 * What a person has to decide about the run's result, above the banner and the page, as the CLI's `ls` prints `→ to decide:` above
 * `→ waiting on you`: the ending step's gate, in the folder's own words, with the command that approves it — linked to that step's
 * section, where Approve and Send back are, by a hash the browser scrolls to and no navigation, or given `onStep` a button calling it with
 * the step (`StepLink`) — or the result branch nobody has merged. Nothing while there is nothing to decide.
 */
export function ToDecideBanner({ run, onStep }: { run: RunDetail; onStep?: (step: string) => void }) {
  const decide = toDecideOf(run);
  if (!decide) return null;
  return (
    <section aria-label="To decide" data-to-decide={decide.kind} className={`rounded px-3 py-2 text-body-medium ${container.yours}`}>
      <strong>To decide:</strong>{' '}
      {decide.kind === 'approve' ? (
        <StepLink step={decide.step} onStep={onStep}>
          {decide.said}
        </StepLink>
      ) : (
        decide.said
      )}
    </section>
  );
}

/**
 * What a step needs, after its name, whole on hover: an agent's question drawn as its markdown, in a box that scrolls past a few lines;
 * what the harness says, as it says it, cut at four lines.
 */
function NeedWords({ need }: { need: ReturnType<typeof needsOf>[number] }) {
  if (need.kind === 'asks')
    return (
      <div data-need-words className="max-h-40 overflow-y-auto pr-1 break-words" title={needText(need)}>
        <strong>{need.step}</strong> asks: <Markdown>{need.needs}</Markdown>
      </div>
    );
  return (
    <p className="line-clamp-4 whitespace-pre-wrap break-words" title={needText(need)}>
      <strong>{need.step}</strong> {need.kind === 'harness' ? 'is ' : ''}
      {needText(need)}
    </p>
  );
}

/**
 * The banner at the top of a run's page: who the run waits on, in the package's words, and what each step needs — its question, or that the
 * harness blocked its session, with what that harness says it waits for, what the session said last, and under them where a person answers
 * the wait: in Claude Code, and never from here. A session the harness blocked is continued from here, as the CLI's `retry` continues it
 * (`Continue`); once that try is asked, the banner says what the tick does with it, in the CLI `ls`'s words: the step's note.
 *
 * Who it waits on is said as the CLI's `ls` says it after `→ waiting on you:` (`onYou`): a step's name, and for a step at its gate,
 * `approve plan`, linked to the step's section, where Approve and Send back are. Without the ending step whose gate the to-decide banner
 * says (`onYouOf`), which is above this one and names it: the CLI's `ls` does not ask for the same step twice. A run whose whole `waiting
 * on you` was that step has no banner here at all. A link to a step's section is a hash the browser scrolls to, and no navigation, or given
 * `onStep` a button calling it with the step (`StepLink`). A step at its gate is said in the line alone: its approval is no question to
 * list under it.
 *
 * A question is answered from the Decide section; a session the harness blocked, here. Under such a session, what a person does about the
 * wait, in the package's words (`answerIn`): the harness answers it, and this board does not — Continue only asks the tick for another try.
 * Once that try is asked, the next tick stops the session, so that advice goes, and the step's note says what was asked instead.
 */
export function NeedsBanner({ run, onStep }: { run: RunDetail; onStep?: (step: string) => void }) {
  const needs = needsOf(run).filter((need) => need.kind !== 'approve');
  const said = onYouOf(run);
  const asks = run.waitingOnYou.map((step, i) => ({ step, said: run.onYou[i] ?? step })).filter((one) => said.includes(one.said));
  if (!asks.length && !needs.length) return null;
  const offers = offersOf(run);
  return (
    <section aria-label="Waiting on you" className={`space-y-1.5 rounded px-3 py-2 text-body-medium ${container.yours}`}>
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
                  <StepLink step={step} onStep={onStep}>
                    {said}
                  </StepLink>
                )}
              </Fragment>
            ))}
          </strong>{' '}
          — signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget —{' '}
          <code>{run.decide}</code>
        </p>
      )}
      {needs.length > 0 && (
        <ul className="space-y-2">
          {needs.map((need) => {
            const offer = need.kind === 'harness' ? offers.find((o) => o.step === need.step) : undefined;
            const asked = need.kind === 'harness' ? askedOf(run, need.step) : null;
            return (
              <li key={need.step} data-need={need.kind} data-step={need.step} className="space-y-1.5">
                <NeedWords need={need} />
                {need.kind === 'harness' && need.waitingFor && !asked && (
                  <p data-advice className="break-words text-body-small">
                    {need.waitingFor.advice}
                  </p>
                )}
                {offer?.case === 'continue' && <Continue runId={run.id} step={need.step} line={lineOf(run, offer)} />}
                {asked && (
                  <p data-note className="font-mono text-body-small">
                    {asked.note ?? `try ${asked.try} asked`}
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
