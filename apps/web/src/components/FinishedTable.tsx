import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/ds';
import type { FinishedPage } from '@/lib/api';
import { factoryOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { ink } from '@/lib/meaning';
import { agoWords, endedWords } from '@/lib/runWords';
import { instantWhole } from '@/lib/instant';
import { cn } from '@/components/ui/ds/utils';
import { RunClockCell } from './RunClockCell';
import { CopyId, CutFrame, FRAMED_BOX, FRAMED_ROW, FRAMED_TABLE, Pager, TextLink } from './look';

/** A column's heading, in the look's small caps. */
const HEAD = 'text-label-small uppercase';

/** A fact in the mono face, on one line. */
const FACT = 'font-mono text-body-small whitespace-nowrap';

/** How long ago a column says something was (`agoWords`), cut to the column's room with the whole instant on hover. */
const WHEN = 'text-body-small';

/** How long ago `at` was at `asOf`, in a `<time>` whose hover says the whole instant. */
const Ago = ({ at, asOf }: { at: string; asOf: Date }) => (
  <time dateTime={at} title={instantWhole(new Date(at))} className="block truncate">
    {agoWords(new Date(at), asOf)}
  </time>
);

/** One finished run's row: its title as a link, then its facts, each plain. Times are said against `asOf`. */
function FinishedRow({ run, asOf }: { run: FinishedPage['runs'][number]; asOf: Date }) {
  const ended = endedWords(run.outcome);
  return (
    <Row id={run.id} data-run={run.id} data-outcome={run.outcome} className={FRAMED_ROW}>
      <Cell>
        <TextLink to="/runs/$runId" params={{ runId: run.id }} title={titleOf(run)} className="block truncate text-body-medium">
          {titleOf(run)}
        </TextLink>
      </Cell>
      <Cell truncate data-factory={factoryOf(run)} className="text-label-small uppercase text-on-surface-variant">
        {factoryOf(run)}
      </Cell>
      <Cell data-created className={cn(WHEN, 'text-on-surface-variant')}>
        <Ago at={run.createdAt} asOf={asOf} />
      </Cell>
      <Cell data-finished className={WHEN}>
        <Ago at={run.finishedAt} asOf={asOf} />
      </Cell>
      <Cell data-clock>
        <RunClockCell run={run} asOf={asOf} finished />
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
 * link, its factory, how long ago it was created and how long ago it finished, each with the whole instant on hover, its time at work
 * with a preview over it breaking that clock down (`RunClockCell`), its cost, how it ended, and its
 * id's end with a copy control, the last row with no line under it; then the pager, under a line of its own. A page that holds no row
 * draws no table and no line, and the pager says why. Narrower than its columns, the table scrolls sideways inside its frame.
 */
export function FinishedTable({ page }: { page: FinishedPage }) {
  const asOf = new Date(page.asOf);
  return (
    <CutFrame size={24}>
      {page.runs.length > 0 && (
        <div data-table-box className={FRAMED_BOX}>
          <Table aria-label="Finished runs" density="dense" className={cn('min-w-[920px] table-fixed', FRAMED_TABLE)}>
            <TableHeader>
              <Column id="run" isRowHeader className={HEAD}>
                Run
              </Column>
              <Column id="factory" className={cn(HEAD, 'w-24')}>
                Factory
              </Column>
              <Column id="created" className={cn(HEAD, 'w-28')}>
                Created
              </Column>
              <Column id="finished" className={cn(HEAD, 'w-28')}>
                Finished
              </Column>
              <Column id="clock" align="end" className={cn(HEAD, 'w-28')}>
                Clock
              </Column>
              <Column id="cost" align="end" className={cn(HEAD, 'w-20')}>
                Cost
              </Column>
              <Column id="outcome" className={cn(HEAD, 'w-24')}>
                Outcome
              </Column>
              <Column id="id" align="end" className={cn(HEAD, 'w-28')}>
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
      <div data-pager-box className={cn('px-4 py-3', page.runs.length > 0 && 'border-t border-outline-variant')}>
        <Pager page={page.page} pages={page.pages} total={page.total} size={page.size} />
      </div>
    </CutFrame>
  );
}
