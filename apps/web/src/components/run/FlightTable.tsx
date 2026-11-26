import { useNavigate } from '@tanstack/react-router';
import { Body, Cell, Column, Label, Row, Table, TableBody, TableHeader, TooltipTrigger } from '@/components/ui/ds';
import type { ListedRun } from '@/lib/api/runs';
import { judged, type UnjudgedRun } from '@/lib/api/judged';
import { namespaceOf } from '@/lib/factories';
import { ink } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';
import { previewBar } from '../step/StepPreview';
import { RunActions } from './RunActions';
import { CopyId, CutFrame, FRAMED_ROW, FRAMED_TABLE, HeldTooltip, Run, TableAtCut, TextLink } from '../look';

/** A column's heading, in the look's small caps. */
const HEAD = 'uppercase';

/** A run's title in a row: one line as wide as its words, cut to the column's room, the whole of it in the kit's tooltip where cut. */
const TITLE = 'block w-fit max-w-full truncate font-medium';

/**
 * A run in flight the list could not judge, a task it reads having a journal that does not read: its id for its title, a link, with a
 * copy control and its factory; nothing at work and no cost, since nothing of it is judged; and what it does now, the list's sentence
 * of why. The row opens the run's page, as its title does, on a press or Enter, through the board's router.
 */
function UnjudgedRow({ run }: { run: UnjudgedRun }) {
  const navigate = useNavigate();
  return (
    <Row
      id={run.id}
      data-run={run.id}
      data-unreadable=""
      className={FRAMED_ROW}
      onAction={() => void navigate({ to: '/runs/$runId', params: { runId: run.id } })}
    >
      <Cell className="py-3">
        <span className="flex min-w-0 flex-col gap-1">
          <TooltipTrigger delay={300}>
            <TextLink to="/runs/$runId" params={{ runId: run.id }} className={TITLE}>
              <Body size="large" component="span">
                {run.id}
              </Body>
            </TextLink>
            <HeldTooltip repeats>{run.id}</HeldTooltip>
          </TooltipTrigger>
          <Body size="small" component="span" colorRole="on-surface-variant" className="flex items-center gap-3.5 font-medium">
            <CopyId id={run.id} short />
            <span data-factory={namespaceOf(run.factory)}>{namespaceOf(run.factory)}</span>
          </Body>
        </span>
      </Cell>
      <Cell>
        <Body size="small" component="span" data-now-unreadable className={`break-words ${ink.failure}`}>
          {run.unjudged}
        </Body>
      </Cell>
      <Cell data-clock />
      <Cell data-cost />
    </Row>
  );
}

/**
 * The judged run whose row holds `target`, and the row, from `runs`: null under the table's head, and on a row the list could not judge.
 * @param runs the rows' runs
 * @param target what the menu was asked for on
 */
const rowRunOf = (runs: readonly (ListedRun | UnjudgedRun)[], target: Element) => {
  const row = target.closest('[role="row"][data-run]');
  const run = row && runs.find((r) => r.id === row.getAttribute('data-run'));
  return row && run && judged(run) ? { run, at: row } : null;
};

/**
 * The runs in flight, as the kit's dense table in the look's cut frame, quiet: each judged run the run part at md as a row (`Run`,
 * `layout="row"`) — its title over its meta line, what it does now in marks over its steps' graph, each node a button that opens its
 * step's card, how many of `among` wait on it, its time at work at `asOf` and its cost, each with its breakdown over it. Narrower than
 * its columns, the table scrolls sideways inside its frame. A run the list could not judge is a row of its own (`UnjudgedRow`). A judged
 * row's actions open by right-click, a long press or the keyboard's menu key (`RunActions`).
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
      <TableAtCut data-table-box>
        <RunActions runOf={(target) => rowRunOf(runs, target)} className="contents">
          <Table aria-label="Runs in flight" density="dense" className={cn('min-w-[880px] table-fixed', FRAMED_TABLE)}>
            <TableHeader>
              <Column id="run" isRowHeader className={HEAD}>
                <Label size="small" component="span">
                  Run
                </Label>
              </Column>
              <Column id="now" className={cn(HEAD, 'w-[360px]')}>
                <Label size="small" component="span">
                  Now
                </Label>
              </Column>
              <Column id="clock" align="end" className={cn(HEAD, 'w-[160px]')}>
                <Label size="small" component="span">
                  Clock
                </Label>
              </Column>
              <Column id="cost" align="end" className={cn(HEAD, 'w-[96px]')}>
                <Label size="small" component="span">
                  Cost
                </Label>
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
        </RunActions>
      </TableAtCut>
    </CutFrame>
  );
}
