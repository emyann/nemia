import { Card, Tag } from '@/components/ui/ds';
import type { WaitingRun } from '@/lib/api/runs';
import { judged, type UnjudgedRun } from '@/lib/api/judged';
import { namespaceOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { ink } from '@/lib/meaning';
import { presentWait } from '@/lib/runWords';
import { ANY_WAIT, OPENS } from '@/lib/words';
import { previewBar } from '../step/StepPreview';
import { RunCostCell } from './RunCostCell';
import { RunMeta } from './RunMeta';
import { RunNow } from './RunNow';
import { CopyId, CutButton, CutFrame, CutTag, RunSteps, TextLink } from '../look';

/**
 * A run that waits on a person, as a card: its meta line (`RunMeta`: its id's end with a copy control, its factory and workflow, its
 * own labels); its title as a link, raised over the copy control's target, so a press on the title opens the run; what it does now in
 * marks (`RunNow`: the yellow chip of the step it waits on you at, its agent, the words of what is asked), and at that line's end how
 * long it has waited on a person this time, where the answer dates that wait; then a foot of its own steps as a short rail, each bar a
 * button that opens its step's card, its cost, and one button at the card's right that opens the run's page (`OPENS`). It decides
 * nothing and shows no command: the run's page does. A run the list could not judge is a card of its own (`UnjudgedCard`).
 */
export function WaitingCard({ run, asOf }: { run: WaitingRun | UnjudgedRun; asOf: Date }) {
  return judged(run) ? <JudgedCard run={run} asOf={asOf} /> : <UnjudgedCard run={run} />;
}

/**
 * A waiting run the list could not judge, a task it reads having a journal that does not read: a wait on a person in no particular
 * words, its factory, its id for its title, a link, with a copy control, the list's sentence of why, and the button that opens its page;
 * no steps and no tiles, since nothing of it is judged.
 */
function UnjudgedCard({ run }: { run: UnjudgedRun }) {
  return (
    <CutFrame hue="yours" className="h-full">
      <Card
        component="article"
        variant="elevated"
        aria-label={run.id}
        data-run={run.id}
        data-unreadable=""
        className="overflow-visible rounded-none bg-transparent shadow-none"
        classNames={{ content: 'gap-3 p-6' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <CutTag>
            <Tag data-wait-tag variant="filled" color="primary" className="uppercase">
              {ANY_WAIT.tag({ step: null, done: 0 })}
            </Tag>
          </CutTag>
          <Tag data-factory={namespaceOf(run.factory)} variant="outlined" className="uppercase">
            {namespaceOf(run.factory)}
          </Tag>
        </div>
        <div className="flex flex-col items-start gap-1">
          <h3 className="relative z-10 m-0 text-title-medium">
            <TextLink to="/runs/$runId" params={{ runId: run.id }}>
              {run.id}
            </TextLink>
          </h3>
          <CopyId id={run.id} />
        </div>
        <p data-sentence className="m-0 text-body-medium text-on-surface-variant">
          {run.unjudged}
        </p>
        <div data-foot className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <CutButton to="/runs/$runId" params={{ runId: run.id }} className="ml-auto">
            {OPENS}
          </CutButton>
        </div>
      </Card>
    </CutFrame>
  );
}

/** A waiting run judged: every part `WaitingCard` says. */
function JudgedCard({ run, asOf }: { run: WaitingRun; asOf: Date }) {
  const title = titleOf(run);
  const waited = presentWait(run, asOf);
  return (
    <CutFrame hue="yours" className="h-full">
      <Card
        component="article"
        variant="elevated"
        aria-label={title}
        data-run={run.id}
        className="overflow-visible rounded-none bg-transparent shadow-none"
        classNames={{ content: 'gap-2.5 py-[18px] pr-[26px] pl-[22px]' }}
      >
        <RunMeta run={run} />
        <h3 className="relative z-10 m-0 text-body-large font-medium">
          <TextLink to="/runs/$runId" params={{ runId: run.id }}>
            {title}
          </TextLink>
        </h3>
        <RunNow
          run={run}
          asOf={asOf}
          rail={false}
          end={
            waited !== null && (
              <span data-waited className={`font-mono text-body-small whitespace-nowrap ${ink.yours}`}>
                waited {waited}
              </span>
            )
          }
        />
        <div data-foot className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-3">
          <RunSteps steps={run.steps} cancelled={run.cancelledAt !== null} held={run.holding != null} wrap={previewBar(run, asOf)} />
          <span data-cost className={`font-mono text-body-small whitespace-nowrap ${ink.money}`}>
            <RunCostCell run={run} />
          </span>
          <CutButton to="/runs/$runId" params={{ runId: run.id }} className="ml-auto">
            {OPENS}
          </CutButton>
        </div>
      </Card>
    </CutFrame>
  );
}
