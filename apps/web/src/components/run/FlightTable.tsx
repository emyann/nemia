import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/ds';
import type { ListedRun } from '@/lib/api/runs';
import { judged, type UnjudgedRun } from '@/lib/api/judged';
import { namespaceOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { ink } from '@/lib/meaning';
import { waitedOnBy } from '@/lib/nowChip';
import { cn } from '@/components/ui/ds/utils';
import { RunClockCell } from './RunClockCell';
import { RunCostCell } from './RunCostCell';
import { RunMeta } from './RunMeta';
import { RunNow } from './RunNow';
import { CopyId, CutFrame, FRAMED_BOX, FRAMED_END, FRAMED_ROW, FRAMED_TABLE, TextLink } from '../look';

/** A column's heading, in the look's small caps. */
const HEAD = 'text-label-small uppercase';

/** A run's title in a row: one line, cut to the column's room, the whole of it on hover. */
const TITLE = 'block truncate text-body-large font-medium';

/**
 * A run in flight the list could not judge, a task it reads having a journal that does not read: its id for its title, a link, with a
 * copy control and its factory; nothing at work and no cost, since nothing of it is judged; and what it does now, the list's sentence
 * of why.
 */
function UnjudgedRow({ run }: { run: UnjudgedRun }) {
  return (
    <Row id={run.id} data-run={run.id} data-unreadable="" className={FRAMED_ROW}>
      <Cell className="py-3">
        <span className="flex min-w-0 flex-col gap-1">
          <TextLink to="/runs/$runId" params={{ runId: run.id }} title={run.id} className={TITLE}>
            {run.id}
          </TextLink>
          <span className="flex items-center gap-3.5 text-body-small font-medium text-on-surface-variant">
            <CopyId id={run.id} short />
            <span data-factory={namespaceOf(run.factory)}>{namespaceOf(run.factory)}</span>
          </span>
        </span>
      </Cell>
      <Cell>
        <span data-now-unreadable className={`text-body-small break-words ${ink.failure}`}>
          {run.unjudged}
        </span>
      </Cell>
      <Cell data-clock />
      <Cell data-cost />
    </Row>
  );
}

/**
 * The runs in flight, as the kit's dense table in the look's cut frame, quiet: each run's title as a link
 * over its meta line (`RunMeta`: its id's end with a copy control, its factory and workflow, its own labels); what it does now in marks
 * (`RunNow`: one chip in the colour of its state, its agent, its round, its words, how many of `among` wait on it and its budget), its
 * steps' rail under them, each bar a button that opens its step's card; its time at work at `asOf`, a preview over it breaking that
 * clock down (`RunClockCell`); and its cost, a preview over it breaking its tokens down by kind (`RunCostCell`). Narrower than its
 * columns, the table scrolls sideways inside its frame. A run the list could not judge is a row of its own (`UnjudgedRow`).
 */
export function FlightTable({
  runs,
  among,
  asOf,
}: {
  runs: readonly (ListedRun | UnjudgedRun)[];
  among: readonly ListedRun[];
  asOf: Date;
}) {
  return (
    <CutFrame size={24}>
      <div data-table-box className={cn(FRAMED_BOX, FRAMED_END)}>
        <Table aria-label="Runs in flight" density="dense" className={cn('min-w-[880px] table-fixed', FRAMED_TABLE)}>
          <TableHeader>
            <Column id="run" isRowHeader className={HEAD}>
              Run
            </Column>
            <Column id="now" className={cn(HEAD, 'w-[360px]')}>
              Now
            </Column>
            <Column id="clock" align="end" className={cn(HEAD, 'w-[144px]')}>
              Clock
            </Column>
            <Column id="cost" align="end" className={cn(HEAD, 'w-[96px]')}>
              Cost
            </Column>
          </TableHeader>
          <TableBody>
            {runs.map((run) =>
              judged(run) ? (
                <Row key={run.id} id={run.id} data-run={run.id} className={FRAMED_ROW}>
                  <Cell className="py-3">
                    <span className="flex min-w-0 flex-col gap-1">
                      <TextLink to="/runs/$runId" params={{ runId: run.id }} title={titleOf(run)} className={TITLE}>
                        {titleOf(run)}
                      </TextLink>
                      <RunMeta run={run} />
                    </span>
                  </Cell>
                  <Cell className="py-3">
                    <RunNow run={run} asOf={asOf} waitedBy={waitedOnBy(among, run.id)} />
                  </Cell>
                  <Cell data-clock>
                    <RunClockCell run={run} asOf={asOf} finished={false} />
                  </Cell>
                  <Cell data-cost className={`font-mono text-body-small whitespace-nowrap ${ink.money}`}>
                    <RunCostCell run={run} />
                  </Cell>
                </Row>
              ) : (
                <UnjudgedRow key={run.id} run={run} />
              ),
            )}
          </TableBody>
        </Table>
      </div>
    </CutFrame>
  );
}
