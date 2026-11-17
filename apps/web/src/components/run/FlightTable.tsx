import { Cell, Column, Row, Table, TableBody, TableHeader, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import type { ListedRun } from '@/lib/api/runs';
import { judged, type UnjudgedRun } from '@/lib/api/judged';
import { namespaceOf } from '@/lib/factories';
import { ink } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';
import { previewBar } from '../step/StepPreview';
import { CopyId, CutFrame, FRAMED_BOX, FRAMED_END, FRAMED_ROW, FRAMED_TABLE, Run, TextLink } from '../look';

/** A column's heading, in the look's small caps. */
const HEAD = 'text-label-small uppercase';

/** A run's title in a row: one line, cut to the column's room, the whole of it in the kit's tooltip. */
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
          <TooltipTrigger delay={300}>
            <TextLink to="/runs/$runId" params={{ runId: run.id }} className={TITLE}>
              {run.id}
            </TextLink>
            <Tooltip>{run.id}</Tooltip>
          </TooltipTrigger>
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
 * The runs in flight, as the kit's dense table in the look's cut frame, quiet: each judged run the run part at md as a row (`Run`,
 * `layout="row"`) — its title over its meta line, what it does now in marks over its steps' graph, each node a button that opens its
 * step's card, how many of `among` wait on it, its time at work at `asOf` and its cost, each with its breakdown over it. Narrower than
 * its columns, the table scrolls sideways inside its frame. A run the list could not judge is a row of its own (`UnjudgedRow`).
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
                <Run key={run.id} run={run} size="md" layout="row" asOf={asOf} among={among} wrap={previewBar(run, asOf)} />
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
