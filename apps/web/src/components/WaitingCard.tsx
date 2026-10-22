import { Card, Tag } from '@/components/ui/ds';
import type { WaitingRun } from '@/lib/api';
import { clockBreakdown, costBreakdown, tokensBreakdown, tokensSaid } from '@/lib/breakdown';
import { factoryOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { runClock } from '@/lib/factory';
import { openWord, presentWait, waitSentence, waitTag, whenWords } from '@/lib/runWords';
import { previewBar } from './StepPreview';
import { CopyId, CutButton, CutFrame, CutTag, RunSteps, StatTile, TextLink } from './look';

/**
 * A waiting run's three tiles: its time at work, what it cost and its tokens, each over its breakdown where the answer gives one. Every
 * time is said against `asOf`, the instant the answer was read at.
 *
 * The Clock tile says the time at work, as the runs tables' Clock column does (`runClock`, drawn as a row says it), and hands those
 * very words to its breakdown as its head, where the wall time the rows add up to is the foot: the card and the tables say one thing.
 */
function Tiles({ run, asOf }: { run: WaitingRun; asOf: Date }) {
  const { clock, cost, tokens, stepCosts } = run;
  const atWork = runClock(run, asOf.getTime(), false, 'row').words;
  return (
    <div data-tiles className="flex flex-wrap gap-2">
      <StatTile
        hue="grey"
        label="Clock"
        value={atWork}
        breakdown={clock && clockBreakdown(clock, atWork, whenWords(new Date(run.createdAt), asOf))}
      />
      <StatTile hue="money" label="Cost" value={cost?.said ?? 'none'} breakdown={cost && stepCosts && costBreakdown(cost, stepCosts)} />
      <StatTile
        hue="grey"
        label="Tokens"
        value={tokens ? tokensSaid(tokens.total) : 'none'}
        breakdown={tokens && tokensBreakdown(tokens)}
      />
    </div>
  );
}

/**
 * A run that waits on a person, as a card: what is asked and its factory as tags, how long it has waited on a person this time where the
 * answer dates that wait, its title as a link, its id with a copy control four pixels under it, one plain sentence, its own steps as a
 * rail, each bar a button that opens its step's card, three tiles, and one button at the card's right, beside the tiles where the
 * card holds both and under them where it does not, which says what there is to read (`openWord`) and opens the run's page. The title
 * stands over the copy control's target, so a press on the title opens the run. It decides nothing and shows no command: the run's
 * page does.
 */
export function WaitingCard({ run, asOf }: { run: WaitingRun; asOf: Date }) {
  const title = titleOf(run);
  const waited = presentWait(run, asOf);
  return (
    <CutFrame hue="yours" className="h-full">
      <Card
        component="article"
        variant="elevated"
        aria-label={title}
        data-run={run.id}
        data-unreadable={run.unreadable ? '' : undefined}
        className="overflow-visible rounded-none bg-transparent shadow-none"
        classNames={{ content: 'gap-3 p-6' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <CutTag>
            <Tag data-wait-tag variant="filled" color="primary" className="uppercase">
              {waitTag(run)}
            </Tag>
          </CutTag>
          <Tag data-factory={factoryOf(run)} variant="outlined" className="uppercase">
            {factoryOf(run)}
          </Tag>
          {waited !== null && (
            <span data-waited className="ml-auto font-mono text-body-small text-on-surface-variant uppercase">
              waiting {waited}
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <h3 className="relative z-10 m-0 text-title-medium">
            <TextLink to="/runs/$runId" params={{ runId: run.id }}>
              {title}
            </TextLink>
          </h3>
          <CopyId id={run.id} />
        </div>
        <p data-sentence className="m-0 text-body-medium text-on-surface-variant">
          {run.unreadable ?? waitSentence(run)}
        </p>
        <RunSteps steps={run.steps} cancelled={run.cancelledAt !== null} held={run.holding != null} names wrap={previewBar(run, asOf)} />
        <div data-foot className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <Tiles run={run} asOf={asOf} />
          <CutButton to="/runs/$runId" params={{ runId: run.id }} className="ml-auto">
            {openWord(run)}
          </CutButton>
        </div>
      </Card>
    </CutFrame>
  );
}
