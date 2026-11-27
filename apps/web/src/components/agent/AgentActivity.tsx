import { useQuery } from '@tanstack/react-query';
import { Body, Label } from '@/components/ui/ds';
import { CutFrame, CutTag, MeaningTag, SectionHead, TextLink } from '@/components/look';
import { judged, type RunView } from '@/lib/api/judged';
import { openRunsQuery } from '@/lib/api/runs';
import { activityOf, stepsAtWorkOf, type Activity, type AtWorkRow } from '@/lib/atWork';
import { durationWords } from '@/lib/duration';
import { useNow } from '@/lib/useNow';
import { Hovered } from './Hovered';

/** The sentence the working tag says on hover. */
const WORKING_SAID = 'A session of this agent is at work on a run now.';

/**
 * What the agent is doing now, read off the runs of its factory that are not finished, and read again on each event of the feed: the
 * steps at work that name it, longest first (`activityOf`).
 * @param name The agent's name.
 * @param factory The factory whose runs are read.
 */
export function useAgentActivity(name: string, factory: string) {
  const now = useNow(30_000);
  const { data } = useQuery(openRunsQuery(factory));
  const runs: readonly RunView[] = data ? [...data.waiting, ...data.inFlight].filter(judged) : [];
  return activityOf(stepsAtWorkOf(runs, now), name);
}

/** How long a session has been at work, as the page says it: `for 14m`. */
const forWords = (minutes: number) => `for ${durationWords(minutes * 60_000, 'minute')}`;

/** The quiet mono line of a row: where its step is and which try it is. */
const where = (row: AtWorkRow) => `${row.workflow} › ${row.step} · try ${row.try}`;

/** The working tag, cut, with its hover. */
function WorkingTag() {
  return (
    <Hovered said={WORKING_SAID}>
      <CutTag>
        <MeaningTag hue="alive">working</MeaningTag>
      </CutTag>
    </Hovered>
  );
}

/**
 * The line under the agent's description: what it is doing now. One session names its run as a link and says where its step is; several
 * count themselves and point to the Working list; none says so, and when its last session ended where that is known (`endedAgo`).
 * @param props.activity What the agent is doing.
 * @param props.endedAgo How long ago its last session ended, in words; null where unknown.
 */
export function ActivityLine({ activity, endedAgo }: { activity: Activity; endedAgo: string | null }) {
  if (activity.kind === 'none')
    return (
      <Body size="large" data-activity="none" className="text-on-surface-variant">
        Not working now.{endedAgo !== null && ` Its last session ended ${endedAgo}.`}
      </Body>
    );
  if (activity.kind === 'one') {
    const { row } = activity;
    return (
      <div data-activity="one" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <WorkingTag />
        <Body size="large" component="span">
          Working on{' '}
          <TextLink to="/runs/$runId" params={{ runId: row.run }} data-activity-run={row.run}>
            {row.title}
          </TextLink>
        </Body>
        <Body size="small" component="span" className="font-mono text-on-surface-variant">
          {where(row)} · {forWords(row.minutes)}
        </Body>
      </div>
    );
  }
  return (
    <div data-activity="many" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <WorkingTag />
      <Body size="large" component="span">
        {activity.rows.length} sessions at once
      </Body>
      <Body size="large" component="span" className="text-on-surface-variant">
        Each one is listed under Working.
      </Body>
    </div>
  );
}

/**
 * The Working section: the sessions of an agent at work at once, the longest first, each its run's title as a link, where its step is, its
 * try and its round when past the first, and how long it has been at work at the right. Only where there are several.
 * @param props.activity What the agent is doing; nothing is drawn unless several sessions are at work.
 */
export function WorkingSection({ activity }: { activity: Activity }) {
  if (activity.kind !== 'many') return null;
  return (
    <section aria-label="Working" className="space-y-3">
      <SectionHead count={activity.rows.length} word="Working" tone="alive" />
      <CutFrame size={16}>
        <ul className="divide-y divide-outline-variant">
          {activity.rows.map((row) => (
            <li key={`${row.run}/${row.step}`} data-working-row={row.run} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <Body size="large" className="truncate">
                  <TextLink to="/runs/$runId" params={{ runId: row.run }}>
                    {row.title}
                  </TextLink>
                </Body>
                <Body size="small" className="font-mono text-on-surface-variant">
                  …{row.run.slice(-4)} · {where(row)}
                  {row.round > 1 && ` · round ${row.round}`}
                </Body>
              </div>
              <Label size="large" component="span" className="shrink-0 font-mono text-on-surface-variant">
                {forWords(row.minutes)}
              </Label>
            </li>
          ))}
        </ul>
      </CutFrame>
    </section>
  );
}
