import { Card, Tag } from '@/components/ui/ds';
import type { WaitingRun } from '@/lib/api';
import { clockBreakdown, costBreakdown, tokensBreakdown, tokensSaid } from '@/lib/breakdown';
import { factoryOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { presentWait, sinceShort, waitSentence, waitTag, whenWords } from '@/lib/runWords';
import { CopyId, CutButton, CutFrame, CutTag, RunSteps, StatTile, TextLink } from './look';

/**
 * A waiting run's three tiles: its wall time, what it cost and its tokens, each over its breakdown where the answer gives one. Every
 * time is said against `asOf`, the instant the answer was read at.
 */
function Tiles({ run, asOf }: { run: WaitingRun; asOf: Date }) {
  const { clock, cost, tokens, stepCosts } = run;
  return (
    <div data-tiles className="flex flex-wrap gap-2">
      <StatTile
        hue="grey"
        label="Clock"
        value={sinceShort(clock?.wallMs ?? run.wallMs)}
        breakdown={clock && clockBreakdown(clock, whenWords(new Date(run.createdAt), asOf))}
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
 * answer dates that wait, its title as a link, its id with a copy control, one plain sentence, its own steps as a rail, three tiles, and
 * one button that opens the run's page. It decides nothing and shows no command: the run's page does.
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
        <div className="flex flex-col items-start gap-2">
          <h3 className="m-0 text-title-medium">
            <TextLink to="/runs/$runId" params={{ runId: run.id }}>
              {title}
            </TextLink>
          </h3>
          <CopyId id={run.id} />
        </div>
        <p data-sentence className="m-0 text-body-medium text-on-surface-variant">
          {run.unreadable ?? waitSentence(run)}
        </p>
        <RunSteps steps={run.steps} cancelled={run.cancelledAt !== null} held={run.holding != null} names />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <Tiles run={run} asOf={asOf} />
          <CutButton to="/runs/$runId" params={{ runId: run.id }}>
            Open the run
          </CutButton>
        </div>
      </Card>
    </CutFrame>
  );
}
