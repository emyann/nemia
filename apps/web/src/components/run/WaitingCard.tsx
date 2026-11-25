import { Body, Card, Tag, Title } from '@/components/ui/ds';
import type { ListedRun, WaitingRun } from '@/lib/api/runs';
import { judged, type UnjudgedRun } from '@/lib/api/judged';
import { namespaceOf } from '@/lib/factories';
import { ANY_WAIT, OPENS } from '@/lib/words';
import { previewBar } from '../step/StepPreview';
import { CopyId, CutButton, CutFrame, CutTag, Run, TextLink } from '../look';

/**
 * A run that waits on a person, as a card: the run part at lg (`Run`) — its meta line, its title, its step now and how long it has waited
 * on a person this time, its steps as its workflow's graph, each node a button that opens its step's card, its cost and Open run, the card
 * glowing yellow; how many of `among`, the page's runs, wait on it, and each run its words name by its mark. It decides nothing and shows
 * no command: the run's page does. A run the list could not judge is a card of its own (`UnjudgedCard`).
 */
export function WaitingCard({ run, among = [], asOf }: { run: WaitingRun | UnjudgedRun; among?: readonly ListedRun[]; asOf: Date }) {
  return judged(run) ? <JudgedCard run={run} among={among} asOf={asOf} /> : <UnjudgedCard run={run} />;
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
          <Title size="medium" className="relative z-10 m-0">
            <TextLink to="/runs/$runId" params={{ runId: run.id }}>
              {run.id}
            </TextLink>
          </Title>
          <CopyId id={run.id} />
        </div>
        <Body size="medium" colorRole="on-surface-variant" data-sentence className="m-0">
          {run.unjudged}
        </Body>
        <div data-foot className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <CutButton to="/runs/$runId" params={{ runId: run.id }} quiet className="ml-auto">
            {OPENS}
          </CutButton>
        </div>
      </Card>
    </CutFrame>
  );
}

/** A waiting run judged: the run part at lg (`Run`), each node of its graph a button that opens its step's card. */
function JudgedCard({ run, among, asOf }: { run: WaitingRun; among: readonly ListedRun[]; asOf: Date }) {
  return <Run run={run} size="lg" asOf={asOf} among={among} wrap={previewBar(run, asOf)} className="h-full" />;
}
