import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/ds';
import type { FinishedPage } from '@/lib/api';
import { factoryOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { ink } from '@/lib/meaning';
import { endedWords, sinceShort, whenWords } from '@/lib/runWords';
import { cn } from '@/components/ui/ds/utils';
import { CopyId } from './CopyId';
import { CutFrame } from './CutFrame';
import { Pager } from './Pager';
import { TextLink } from './TextLink';

/** A fact in the mono face, on one line. */
const FACT = 'font-mono text-body-small whitespace-nowrap';

/** One finished run's row: its title as a link, then its facts, each plain. Times are said against `asOf`. */
function FinishedRow({ run, asOf }: { run: FinishedPage['runs'][number]; asOf: Date }) {
  const ended = endedWords(run.outcome);
  return (
    <Row id={run.id} data-run={run.id} data-outcome={run.outcome} className="bg-transparent">
      <Cell>
        <TextLink to="/runs/$runId" params={{ runId: run.id }} title={titleOf(run)} className="block truncate text-body-medium">
          {titleOf(run)}
        </TextLink>
      </Cell>
      <Cell truncate data-factory={factoryOf(run)} className="text-label-small text-on-surface-variant uppercase">
        {factoryOf(run)}
      </Cell>
      <Cell data-created className={cn(FACT, 'text-on-surface-variant')}>
        <time dateTime={run.createdAt}>{whenWords(new Date(run.createdAt), asOf)}</time>
      </Cell>
      <Cell data-finished className={FACT}>
        <time dateTime={run.finishedAt}>{whenWords(new Date(run.finishedAt), asOf)}</time>
      </Cell>
      <Cell data-clock className={FACT}>
        {sinceShort(run.wallMs)}
      </Cell>
      <Cell data-cost className={cn(FACT, ink.money)}>
        {run.cost?.said}
      </Cell>
      <Cell>
        <span data-ended title={ended.title} className={cn('text-label-small uppercase', ink[ended.hue])}>
          {ended.word}
        </span>
      </Cell>
      <Cell>
        <CopyId id={run.id} short />
      </Cell>
    </Row>
  );
}

/**
 * One page of the finished runs, newest finished first, as the kit's dense table in the look's cut frame, quiet: each run's title as a
 * link, its factory, when it was created and when it finished, its wall time and its cost, how it ended, and its id's end with a copy
 * control; then the pager. A page that holds no row draws no table, and the pager says why. Narrower than its columns, the table
 * scrolls sideways inside its frame.
 */
export function FinishedTable({ page }: { page: FinishedPage }) {
  const asOf = new Date(page.asOf);
  return (
    <CutFrame size={24}>
      {page.runs.length > 0 && (
        <div data-table-box className="overflow-x-auto">
          <Table aria-label="Finished runs" density="dense" className="min-w-[920px] table-fixed">
            <TableHeader>
              <Column id="run" isRowHeader>
                Run
              </Column>
              <Column id="factory" className="w-24">
                Factory
              </Column>
              <Column id="created" className="w-28">
                Created
              </Column>
              <Column id="finished" className="w-28">
                Finished
              </Column>
              <Column id="clock" align="end" className="w-20">
                Clock
              </Column>
              <Column id="cost" align="end" className="w-20">
                Cost
              </Column>
              <Column id="outcome" className="w-24">
                Outcome
              </Column>
              <Column id="id" align="end" className="w-24">
                Id
              </Column>
            </TableHeader>
            <TableBody>
              {page.runs.map((run) => (
                <FinishedRow key={run.id} run={run} asOf={asOf} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="px-4 py-3">
        <Pager page={page.page} pages={page.pages} total={page.total} size={page.size} />
      </div>
    </CutFrame>
  );
}
