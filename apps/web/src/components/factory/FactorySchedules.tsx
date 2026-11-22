import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import type { FactorySchedule } from '../../lib/api/factories.ts';
import { fireWord } from '../../lib/schedules';
import { CopyButton } from '../command/CopyButton';
import { routeLink } from '../nav/routeLink';

/** A link to a run's page, drawn as a link button (`routeLink`). */
const RouterLinkButton = routeLink(LinkButton);

/** A line a person types, as the api answered it, and the button that copies it. */
export function CommandText({ text }: { text: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 rounded bg-surface-container-highest px-2 py-1 text-left font-mono text-body-small [overflow-wrap:anywhere]">{text}</code>
      <CopyButton text={text} />
    </div>
  );
}

/**
 * One schedule, the details of a trigger of the time kind on the Triggers section (`FactoryTriggers`): its workflow and cron, read in its
 * time zone; what each run is asked; its next fire and its last scheduled run, linked to the run's page; why its latest fire was not
 * started, where it was refused; and the line that takes it back.
 */
export function ScheduleRow({ schedule: s, now }: { schedule: FactorySchedule; now: Date }) {
  return (
    <div data-factory-schedule={s.workflow} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{s.workflow}</span>
        <Badge variant="secondary" className="font-mono">
          {s.cron}
        </Badge>
        {s.tz && <Badge variant="outline">{s.tz}</Badge>}
      </div>
      <p className="text-body-medium text-on-surface-variant">{s.brief}</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-body-medium">
        <dt className="text-on-surface-variant">Next run</dt>
        <dd data-schedule-next title={s.next ?? undefined}>
          {s.next ? fireWord(new Date(s.next), now) : 'none: its cron never fires'}
        </dd>
        <dt className="text-on-surface-variant">Last run</dt>
        <dd data-schedule-last>
          {s.last ? (
            <>
              <RouterLinkButton to="/runs/$runId" params={{ runId: s.last.run }} variant="link" size="sm" className="h-auto px-0">
                {s.last.run}
              </RouterLinkButton>{' '}
              <span className="text-on-surface-variant">{fireWord(new Date(s.last.at), now)}</span>
            </>
          ) : (
            'none yet'
          )}
        </dd>
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
