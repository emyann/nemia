import { Cell, Column, Row, Table, TableBody, TableHeader, Tag } from '@/components/ui/ds';
import type { ListedRun } from '@/lib/api';
import { factoryOf } from '@/lib/factories';
import { titleOf } from '@/lib/factory';
import { ink } from '@/lib/meaning';
import { nowOf, sinceShort } from '@/lib/runWords';
import { cn } from '@/components/ui/ds/utils';
import { CopyId, CutFrame, CutTag, FRAMED_BOX, FRAMED_END, FRAMED_ROW, FRAMED_TABLE, RunSteps, TextLink } from './look';

/** A column's heading, in the look's small caps. */
const HEAD = 'text-label-small uppercase';

/** How long a run has been at work without a stop, at `asOf`; none for a run nothing of which runs. */
const workingMs = (run: ListedRun, asOf: Date): number | null => (run.atWork?.since ? asOf.getTime() - Date.parse(run.atWork.since) : null);

/** What a row in flight does now: the word of its step as a tag and its note; for a run the api could not judge, the api's sentence. */
function Now({ run, asOf }: { run: ListedRun; asOf: Date }) {
  if (run.unreadable) {
    return (
      <span data-now-unreadable className={`text-body-small break-words ${ink.failure}`}>
        {run.unreadable}
      </span>
    );
  }
  const now = nowOf(run, workingMs(run, asOf));
  if (!now) return null;
  return (
    <span className="flex items-center gap-3">
      <CutTag>
        <Tag data-now-word variant="tonal" color="secondary" className="uppercase">
          {now.word}
        </Tag>
      </CutTag>
      <span data-now-note className="text-body-small whitespace-nowrap text-on-surface-variant">
        {now.note}
      </span>
    </span>
  );
}

/**
 * The runs in flight, as the kit's dense table in the look's cut frame, in the hue of a session at work: each run's title as a link,
 * its id with a copy control and its factory, each control and each factory at one edge from row to row; its own steps as a rail;
 * what it does now; its wall time at `asOf` and its cost, plain.
 * Narrower than its columns, the table scrolls sideways inside its frame.
 */
export function FlightTable({ runs, asOf }: { runs: readonly ListedRun[]; asOf: Date }) {
  const room = Math.max(0, ...runs.map((run) => run.id.length));
  return (
    <CutFrame hue="alive" size={24}>
      <div data-table-box className={cn(FRAMED_BOX, FRAMED_END)}>
        <Table aria-label="Runs in flight" density="dense" className={cn('min-w-[920px] table-fixed', FRAMED_TABLE)}>
          <TableHeader>
            <Column id="run" isRowHeader className={HEAD}>
              Run
            </Column>
            <Column id="steps" className={cn(HEAD, 'w-40')}>
              Steps
            </Column>
            <Column id="now" className={cn(HEAD, 'w-64')}>
              Now
            </Column>
            <Column id="clock" align="end" className={cn(HEAD, 'w-20')}>
              Clock
            </Column>
            <Column id="cost" align="end" className={cn(HEAD, 'w-24')}>
              Cost
            </Column>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <Row key={run.id} id={run.id} data-run={run.id} data-unreadable={run.unreadable ? '' : undefined} className={FRAMED_ROW}>
                <Cell className="py-1">
                  <span className="flex flex-col gap-4 pb-2">
                    <TextLink to="/runs/$runId" params={{ runId: run.id }} title={titleOf(run)} className="block truncate text-title-small">
                      {titleOf(run)}
                    </TextLink>
                    <span className="flex items-center gap-2">
                      <CopyId id={run.id} room={room} />
                      <span data-factory={factoryOf(run)} className="text-label-small uppercase text-on-surface-variant">
                        {factoryOf(run)}
                      </span>
                    </span>
                  </span>
                </Cell>
                <Cell>
                  <RunSteps steps={run.steps} cancelled={run.cancelledAt !== null} held={run.holding != null} />
                </Cell>
                <Cell>
                  <Now run={run} asOf={asOf} />
                </Cell>
                <Cell data-clock className="font-mono text-body-small whitespace-nowrap">
                  {sinceShort(run.wallMs)}
                </Cell>
                <Cell data-cost className={`font-mono text-body-small whitespace-nowrap ${ink.money}`}>
                  {run.cost?.said}
                </Cell>
              </Row>
            ))}
          </TableBody>
        </Table>
      </div>
    </CutFrame>
  );
}
