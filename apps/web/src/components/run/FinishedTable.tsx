import { Cell, Column, Focusable, Row, Table, TableBody, TableHeader, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import { useQuery } from '@tanstack/react-query';
import { FINISHED_SIZE, type FinishedPage } from '@/lib/api/runs';
import { runLinesQuery } from '@/lib/api/run';
import { titleOf } from '@/lib/factory';
import { ink } from '@/lib/meaning';
import { agoWords } from '@/lib/runWords';
import { ENDED } from '@/lib/words';
import { instantWhole } from '@/lib/instant';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { CutFrame, FRAMED_BOX, FRAMED_ROW, FRAMED_TABLE, Pager, RunClock, RunCost, RunMeta, TextLink } from '../look';

/** A column's heading, in the look's small caps. */
const HEAD = 'text-label-small uppercase';

/** A fact in the mono face, on one line. */
const FACT = 'font-mono text-body-small whitespace-nowrap';

/** How long ago a column says something was (`agoWords`), cut to the column's room with the whole instant in its tooltip. */
const WHEN = 'text-body-medium';

/** How long ago `at` was at `asOf`, in a `<time>` whose kit's tooltip says the whole instant, on hover and on focus. */
const Ago = ({ at, asOf }: { at: string; asOf: Date }) => {
  const ago = agoWords(new Date(at), asOf);
  return (
    <TooltipTrigger delay={300}>
      <Focusable>
        <time
          dateTime={at}
          role="img"
          aria-label={ago}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the instant's tooltip by focusing it
          tabIndex={0}
          className={cn('block truncate', focusRing())}
        >
          {ago}
        </time>
      </Focusable>
      <Tooltip>{instantWhole(new Date(at))}</Tooltip>
    </TooltipTrigger>
  );
};

/**
 * One finished run's row: its title as a link over its meta line (`RunMeta`, its workflow linked to its page, which is its lines'
 * `runLinesQuery` the route's loader read), when it finished, its time at work, its cost and how it ended, a plain word, red only where
 * it failed. Times are said against `asOf`.
 */
function FinishedRow({ run, asOf }: { run: FinishedPage['runs'][number]; asOf: Date }) {
  const ended = ENDED[run.outcome];
  const workflowPage = useQuery(runLinesQuery(run.id)).data?.workflowPage ?? null;
  return (
    <Row id={run.id} data-run={run.id} data-outcome={run.outcome} className={FRAMED_ROW}>
      <Cell className="py-2.5">
        <span className="flex min-w-0 flex-col gap-1">
          <TooltipTrigger delay={300}>
            <TextLink to="/runs/$runId" params={{ runId: run.id }} className="block truncate text-body-large font-medium">
              {titleOf(run)}
            </TextLink>
            <Tooltip>{titleOf(run)}</Tooltip>
          </TooltipTrigger>
          <RunMeta run={run} workflowPage={workflowPage} />
        </span>
      </Cell>
      <Cell data-finished className={cn(WHEN, 'text-on-surface-variant')}>
        <Ago at={run.finishedAt} asOf={asOf} />
      </Cell>
      <Cell data-clock>
        <RunClock run={run} asOf={asOf} finished />
      </Cell>
      <Cell data-cost className={cn(FACT, ink.money)}>
        <RunCost run={run} />
      </Cell>
      <Cell>
        <TooltipTrigger delay={300}>
          <Focusable>
            <span
              data-ended
              role="img"
              aria-label={ended.word}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the outcome's tooltip by focusing it
              tabIndex={0}
              className={cn('text-label-small uppercase', run.outcome === 'failed' ? ink.failure : 'text-on-surface-variant', focusRing())}
            >
              {ended.word}
            </span>
          </Focusable>
          <Tooltip>{ended.title}</Tooltip>
        </TooltipTrigger>
      </Cell>
    </Row>
  );
}

/**
 * One page of the finished runs, newest finished first, as the kit's dense table in the look's cut frame, quiet: each run's title as a
 * link over its meta line, its id's end with a copy control, its factory and the workflow it ran, linked to the workflow's page as
 * `WorkflowLink` links it (`workflowTarget`), and its own labels; how long ago it finished, the whole instant in the kit's tooltip; its
 * time at work with a preview over it breaking that clock down (`RunClock`); its cost with a preview of its tokens by kind
 * (`RunCost`); and how it ended, its sentence in the kit's tooltip, the last row with no line under it; then the pager, under a line
 * of its own, which stands on the address' trail (`trail`). A page that holds no row draws no table and no line, and the pager says why.
 * Narrower than its columns, the table scrolls sideways inside its frame.
 */
export function FinishedTable({ page, trail }: { page: FinishedPage; trail: readonly string[] }) {
  const asOf = new Date(page.asOf);
  return (
    <CutFrame size={24}>
      {page.runs.length > 0 && (
        <div data-table-box className={FRAMED_BOX}>
          <Table aria-label="Finished runs" density="dense" className={cn('min-w-[880px] table-fixed', FRAMED_TABLE)}>
            <TableHeader>
              <Column id="run" isRowHeader className={HEAD}>
                Run
              </Column>
              <Column id="finished" className={cn(HEAD, 'w-[150px]')}>
                Finished
              </Column>
              <Column id="clock" align="end" className={cn(HEAD, 'w-[144px]')}>
                Clock
              </Column>
              <Column id="cost" align="end" className={cn(HEAD, 'w-[96px]')}>
                Cost
              </Column>
              <Column id="outcome" className={cn(HEAD, 'w-[110px]')}>
                Outcome
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
        <Pager trail={trail} next={page.continue} count={page.runs.length} total={page.total} size={FINISHED_SIZE} />
      </div>
    </CutFrame>
  );
}
