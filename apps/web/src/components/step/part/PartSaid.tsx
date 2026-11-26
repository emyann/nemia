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
import { Body, Label } from '@/components/ui/ds';

/** What the step said, as its part's model has it. */
type Said = Exclude<StepPartModel['said'], 'none'>;

/** What the step `step` said of its shown try (`said`); its account folded, its statement as it came where it could not be read. */
export function PartSaid({ step, said }: { step: StepView; said: Said }) {
  const shown = step.tries.find((t) => t.try === step.shown);
  const outcome = shown ? outcomeOf(shown, 'No closeout on the record of this try.') : null;
  return (
    <Body size="medium" component="div" className="contents">
      <section data-part-said={step.name} aria-label="What it said" className="min-w-0 scroll-mt-4 space-y-2">
        <Label size="medium" component="h3" colorRole="on-surface-variant" className="uppercase">
          Said
        </Label>
        {outcome && <OutcomeHead outcome={outcome} />}
        {shown?.answer && <YourAnswer answer={shown.answer} by={shown.answeredBy} />}
        {said.kind === 'unreadable' ? (
          <AsItCame raw={step.unreadable?.raw ?? said.error} />
        ) : (
          <>
            <Body size="medium" colorRole="on-surface" data-summary>
              {summaryShown(said.summary)}
            </Body>
            {said.needs && <ClosedNeeds needs={said.needs} />}
            {step.closeout?.refused.map((why) => (
              <Body size="small" key={why} data-refused className="text-failure">
                not accepted: {why}
              </Body>
            ))}
            {said.account && (
              <Fold name="account" title="Its account">
                <Markdown data-body>{said.account}</Markdown>
              </Fold>
            )}
          </>
        )}
      </section>
    </Body>
  );
}
