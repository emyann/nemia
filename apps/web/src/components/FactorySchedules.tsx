import { Fragment } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import type { Factory, FactorySchedule } from '../lib/api';
import { fireWord } from '../lib/schedules';
import { useNow } from '../lib/useNow';
import { CopyButton } from './CopyButton';
import { routeLink } from './routeLink';

/** A link to a run's page, drawn as a link button (`routeLink`). */
const RouterLinkButton = routeLink(LinkButton);

/** A line a person types, as the api answered it, and the button that copies it. */
function CommandText({ text }: { text: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1 text-left font-mono text-body-small [overflow-wrap:anywhere]">{text}</code>
      <CopyButton text={text} />
    </div>
  );
}

/**
 * One schedule: its workflow and cron, read in its time zone; what each run is asked; its next fire and its last scheduled run, linked
 * to the run's page; why its latest fire was not started, where it was refused; and the line that takes it back.
 */
function ScheduleRow({ schedule: s, now }: { schedule: FactorySchedule; now: Date }) {
  return (
    <div data-factory-schedule={s.workflow} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{s.workflow}</span>
        <Badge variant="secondary" className="font-mono">
          {s.cron}
        </Badge>
        {s.tz && <Badge variant="outline">{s.tz}</Badge>}
      </div>
      <p className="text-body-medium text-muted-foreground">{s.brief}</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-body-medium">
        <dt className="text-muted-foreground">Next run</dt>
        <dd data-schedule-next title={s.next ?? undefined}>
          {s.next ? fireWord(new Date(s.next), now) : 'none: its cron never fires'}
        </dd>
        <dt className="text-muted-foreground">Last run</dt>
        <dd data-schedule-last>
          {s.last ? (
            <>
              <RouterLinkButton to="/runs/$runId" params={{ runId: s.last.run }} variant="link" size="sm" className="h-auto px-0">
                {s.last.run}
              </RouterLinkButton>{' '}
              <span className="text-muted-foreground">{fireWord(new Date(s.last.at), now)}</span>
            </>
          ) : (
            'none yet'
          )}
        </dd>
        {s.repo && (
          <>
            <dt className="text-muted-foreground">Repository</dt>
            <dd className="truncate font-mono text-body-small">{s.repo}</dd>
          </>
        )}
      </dl>
      {s.refused && (
        <Alert variant="destructive" data-schedule-refused>
          <AlertTitle>Its latest fire started no run</AlertTitle>
          <AlertDescription>{s.refused}</AlertDescription>
        </Alert>
      )}
      <CommandText text={s.commands.unschedule} />
    </div>
  );
}

/**
 * A factory's schedules, on its settings page, read-only: each workflow the daemon starts on its own, at each fire of its cron and at
 * every level, unless the store is paused (`ScheduleRow`). With none, the line that schedules one, as the api answered it.
 */
export function FactorySchedules({ factory }: { factory: Factory }) {
  const now = new Date(useNow(60_000));
  return (
    <Card data-factory-schedules={factory.name}>
      <CardHeader>
        <CardTitle>Schedules</CardTitle>
        <CardDescription>
          The workflows this factory starts on its own: the daemon starts a run at each fire of its cron, at every level, unless the store
          is paused. A schedule is written and taken back on the command line.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {factory.schedules.length === 0 ? (
          <Empty data-no-schedules className="border">
            <EmptyHeader>
              <EmptyTitle>No schedule</EmptyTitle>
              <EmptyDescription>This factory starts no run on its own. To start one of its workflows on a cron, type:</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-full">
              <CommandText text={factory.commands.schedule} />
            </EmptyContent>
          </Empty>
        ) : (
          factory.schedules.map((s, i) => (
            <Fragment key={s.workflow}>
              {i > 0 && <Separator />}
              <ScheduleRow schedule={s} now={now} />
            </Fragment>
          ))
        )}
      </CardContent>
    </Card>
  );
}
