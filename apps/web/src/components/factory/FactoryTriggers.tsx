/**
 * A factory's triggers on its settings page: what starts its work on its own, at a time (its schedules) or on the cards its selector
 * selects. Each says, in a tag of its own, whether it can spend quota — whether anything its target reaches runs an agent — apart from what
 * it does now: the cards it queues and those that wait on a clash, or a schedule's details (`ScheduleRow`: its cron, brief, next fire, last
 * run, refusal and the line that takes it back). A card trigger of the factory's own is taken back with Remove; one its template defines is
 * said as the template's; a new one is written by the line the api answers for it, and with no schedule, the line that schedules one.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Trigger } from 'objects';
import { Button, Tag } from '@/components/ui/ds';
import { Pending, Reading, ReadingLines } from '@/components/look';
import { deleteTrigger, factorySchedulesQuery, factoryTriggersQuery } from '@/lib/api/factories';
import { firesWhen, queuesWords, quotaWords } from '@/lib/triggers';
import { fireWord } from '@/lib/schedules';
import { useNow } from '@/lib/useNow';
import type { FactorySchedule } from '@/lib/api/factories';
import { CommandText, ScheduleRow } from './FactorySchedules';

/**
 * One trigger: its name, kind and target, when it fires, its quota, what it does now — a time trigger's schedule (`schedule`) where the
 * factory lists it — and a Remove for a card trigger of its own.
 */
function TriggerRow({
  trigger: t,
  schedule,
  now,
  onRemove,
  pending,
}: {
  trigger: Trigger;
  schedule: FactorySchedule | undefined;
  now: Date;
  onRemove: () => void;
  pending: boolean;
}) {
  const cards = t.spec.when.kind === 'cards';
  const clashes = t.status.clashes ?? [];
  return (
    <li data-factory-trigger={t.metadata.name} className="flex flex-col gap-2 rounded-shape-medium border border-outline-variant p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-title-small">{t.metadata.name}</span>
        <Tag variant="outlined">{cards ? 'cards' : 'time'}</Tag>
        <span className="text-body-medium text-muted-foreground">
          {firesWhen(t)} → {t.spec.target.name}
        </span>
        {t.status.from === 'template' && <Tag variant="outlined">from its template</Tag>}
      </div>
      <p data-trigger-quota={t.status.quota} className="text-label-large">
        {quotaWords(t)}
      </p>
      {schedule === undefined ? (
        <p data-trigger-now className="text-body-medium">
          {cards ? queuesWords(t) : t.status.next ? `Next fire ${fireWord(new Date(t.status.next), now)}` : 'Its cron never fires'}
        </p>
      ) : (
        <ScheduleRow schedule={schedule} now={now} />
      )}
      {clashes.map((c) => (
        <p key={c.card} data-trigger-clash={c.card} className="text-body-medium text-muted-foreground">
          {c.card} waits: triggers {c.with.join(', ')} clash. Change a selector or the card's labels.
        </p>
      ))}
      {cards && t.status.from === 'factory' && (
        <div>
          <Button size="xsmall" variant="outlined" isDisabled={pending} onPress={onRemove} icon={pending ? Pending : undefined}>
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * The triggers of the factory `name`, read now, and its schedules, the details of its time triggers (`factorySchedulesQuery`), read now
 * too; `line`, the line that writes a card trigger of it, as the api answered it; and `scheduleLine`, the line that schedules a workflow,
 * shown once its schedules are read and it has none.
 */
export function FactoryTriggers({ name, line, scheduleLine }: { name: string; line: string; scheduleLine: string }) {
  const queryClient = useQueryClient();
  const now = new Date(useNow(60_000));
  const { data } = useQuery(factoryTriggersQuery(name));
  const schedules = useQuery(factorySchedulesQuery(name)).data;
  const remove = useMutation({
    mutationFn: (trigger: string) => deleteTrigger(name, trigger),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: factoryTriggersQuery(name).queryKey, exact: true }),
  });
  return (
    <section aria-label="Triggers" data-factory-triggers={name} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-medium">Triggers</h2>
        <p className="text-body-medium text-muted-foreground">
          What starts this factory's work on its own: a cron, or each card whose labels a selector selects, queued in the order filed. A
          trigger spends quota only where something its target reaches runs an agent.
        </p>
      </div>
      {data === undefined ? (
        <Reading label="Reading the triggers…" className="flex flex-col gap-2">
          <ReadingLines widths={['w-1/2', 'w-3/4']} />
        </Reading>
      ) : data.length === 0 ? (
        <p data-no-triggers className="text-body-medium text-muted-foreground">
          This factory has no trigger.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((t) => (
            <TriggerRow
              key={t.metadata.name}
              trigger={t}
              schedule={t.spec.when.kind === 'time' ? schedules?.find((s) => s.workflow === t.spec.target.name) : undefined}
              now={now}
              pending={remove.isPending && remove.variables === t.metadata.name}
              onRemove={() => remove.mutate(t.metadata.name)}
            />
          ))}
        </ul>
      )}
      <CommandText text={line} />
      {schedules?.length === 0 && (
        <div data-no-schedules className="flex flex-col gap-1">
          <p className="text-body-medium text-muted-foreground">No schedule: to start one of its workflows on a cron, type:</p>
          <CommandText text={scheduleLine} />
        </div>
      )}
    </section>
  );
}
