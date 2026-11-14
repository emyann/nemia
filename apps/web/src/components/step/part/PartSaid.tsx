/**
 * What a step said, of the try its part shows, drawn once: how the try ended and who said it, the answer a person gave the try, its
 * summary, what it needs, what the run did not accept of it, and its account one fold down; or, for a statement that could not be read,
 * why, and the statement as it came.
 */
import { outcomeOf } from '@/lib/outcome';
import type { StepView } from '@/lib/runView';
import type { StepPartModel } from '@/lib/stepPart';
import { summaryShown } from '@/lib/transcript';
import { Markdown } from '../../markdown/Markdown';
import { AsItCame, ClosedNeeds, YourAnswer } from '../Closeout';
import { OutcomeHead } from '../Outcome';
import { Fold } from './Fold';

/** What the step said, as its part's model has it. */
type Said = Exclude<StepPartModel['said'], 'none'>;

/** What the step `step` said of its shown try (`said`); its account folded, its statement as it came where it could not be read. */
export function PartSaid({ step, said }: { step: StepView; said: Said }) {
  const shown = step.tries.find((t) => t.try === step.shown);
  const outcome = shown ? outcomeOf(shown, 'No closeout on the record of this try.') : null;
  return (
    <section data-part-said={step.name} aria-label="What it said" className="min-w-0 scroll-mt-4 space-y-2 text-body-medium">
      <h3 className="text-label-medium text-on-surface-variant uppercase">Said</h3>
      {outcome && <OutcomeHead outcome={outcome} />}
      {shown?.answer && <YourAnswer answer={shown.answer} by={shown.answeredBy} />}
      {said.kind === 'unreadable' ? (
        <AsItCame raw={step.unreadable?.raw ?? said.error} />
      ) : (
        <>
          <p data-summary className="text-body-medium text-on-surface">
            {summaryShown(said.summary)}
          </p>
          {said.needs && <ClosedNeeds needs={said.needs} />}
          {step.closeout?.refused.map((why) => (
            <p key={why} data-refused className="text-body-small text-failure">
              not accepted: {why}
            </p>
          ))}
          {said.account && (
            <Fold name="account" title="Its account">
              <Markdown data-body>{said.account}</Markdown>
            </Fold>
          )}
        </>
      )}
    </section>
  );
}
