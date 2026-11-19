/**
 * A factory's volumes, on its settings page: each folder or git URL its runs reach, its path as the api resolved it, its mark (`:ro` or
 * `:rw`, as docker compose marks it), the origin it was cloned from, and Remove, which takes it back. A writable volume is a repository
 * the factory works on, and says so. Each has its two switches, set as `nemia factory volume set` sets them (a PATCH on the Volume):
 * whether its CLAUDE.md files load into the factory's sessions, and whether its skills are offered to them. Under them, the form that
 * gives one: a path or a git URL and its mode, sent as the CLI's `nemia factory volume add` sends it, the api's refusal shown in its words
 * under the form. Each write reads the factories again.
 */
import { Fragment, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, Divider, EmptyState, Switch, Tag, TextField, Title } from '@/components/ui/ds';
import { CutPress, Pending, RadioTile, RadioTileGroup } from '@/components/look';
import type { Factory, FactoryVolume } from '@/lib/api/factories';
import { factories, volumes } from '@/lib/api/objects';
import { ink } from '@/lib/meaning';
import { CommandText } from './FactorySchedules';

/** The two modes a volume is given in: worked on, a repository its runs work in (`:rw`), or read by every step (`:ro`). */
type Mode = 'rw' | 'ro';

/** A volume's two switches, by their keys on the api. */
type SwitchKey = 'claudeMd' | 'skills';

/** What a person asks of the factory's volumes: one given, one taken back by its path, or one switch of one set, by its name. */
type Change =
  | { kind: 'add'; volume: string }
  | { kind: 'remove'; path: string }
  | { kind: 'switch'; name: string; key: SwitchKey; on: boolean };

/** What each switch is called and what it does, said beside it. */
const SWITCHES: ReadonlyArray<{ key: SwitchKey; label: string; means: string }> = [
  {
    key: 'claudeMd',
    label: 'Load its CLAUDE.md',
    means: "Its CLAUDE.md files load into the sessions of this factory's runs. Off unless you turn it on.",
  },
  {
    key: 'skills',
    label: 'Offer its skills',
    means: "The skills in its .claude/skills are offered to the sessions of this factory's runs. On unless you turn it off.",
  },
];

/** What a refused write was asked to do, said before the api's words. */
const NOT_DONE: Record<Change['kind'], string> = { add: 'Not added', remove: 'Not removed', switch: 'Not changed' };

/** The api's words for a write it refused, or none. */
const refusalOf = (error: unknown): string | null =>
  error === null || error === undefined ? null : error instanceof Error ? error.message : 'the api answered nothing the board reads.';

/**
 * One volume: its path, its mark, what it is, where it was cloned from, its two switches, each showing the value asked while its own
 * write is out (`asked`), and Remove, pending while its own removal is out. A volume with no stored name has its switches held.
 */
function VolumeRow({
  volume: v,
  removing,
  asked,
  held,
  onRemove,
  onSwitch,
}: {
  volume: FactoryVolume;
  removing: boolean;
  asked: { key: SwitchKey; on: boolean } | undefined;
  held: boolean;
  onRemove: () => void;
  onSwitch: (key: SwitchKey, on: boolean) => void;
}) {
  return (
    <div data-factory-volume={v.path} className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 font-mono text-body-medium [overflow-wrap:anywhere]">{v.path}</span>
        <Tag variant={v.readOnly ? 'tonal' : 'outlined'} className="font-mono" data-volume-mark={v.readOnly ? 'ro' : 'rw'}>
          {v.readOnly ? ':ro' : ':rw'}
        </Tag>
        <Button
          variant="text"
          size="xsmall"
          className="ml-auto"
          icon={removing ? Pending : undefined}
          isDisabled={held}
          aria-label={`Remove ${v.path}`}
          data-volume-remove={v.path}
          onPress={onRemove}
        >
          Remove
        </Button>
      </div>
      <p data-volume-role={v.readOnly ? 'read' : 'worked-on'} className="text-body-medium text-muted-foreground">
        {v.readOnly ? 'Read by every local step of a run here.' : 'Worked on: a repository this factory runs its work in.'}
        {v.origin !== null && <span className="[overflow-wrap:anywhere]"> Cloned from {v.origin}.</span>}
      </p>
      <div data-volume-switches className="flex flex-col">
        {SWITCHES.map((sw) => (
          <Switch
            key={sw.key}
            labelPosition="start"
            supportingText={sw.means}
            data-volume-switch={sw.key}
            isSelected={asked?.key === sw.key ? asked.on : v[sw.key]}
            isDisabled={held || v.name === null}
            onChange={(on) => onSwitch(sw.key, on)}
          >
            {sw.label}
          </Switch>
        ))}
      </div>
      <CommandText text={v.commands.rm} />
    </div>
  );
}

/** The form that gives `factory` a volume: its path or git URL, its mode, and Add, pending while the write is out. */
function VolumeForm({ adding, held, onAdd }: { adding: boolean; held: boolean; onAdd: (volume: string) => void }) {
  const [where, setWhere] = useState('');
  const [mode, setMode] = useState<Mode>('rw');
  const given = where.trim();
  return (
    <form
      data-volume-form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (given) onAdd(`${given}:${mode}`);
      }}
    >
      <TextField
        label="Path or git URL"
        value={where}
        onChange={setWhere}
        supportingText="A folder of the machine the api runs on, by its whole path, or a git URL it clones."
      />
      <RadioTileGroup aria-label="Mode" value={mode} onChange={(m) => setMode(m === 'ro' ? 'ro' : 'rw')}>
        <RadioTile value="rw" title="Worked on (:rw)" description="A repository the factory's runs work in" />
        <RadioTile value="ro" title="Read only (:ro)" description="A folder every local step reads" />
      </RadioTileGroup>
      <CutPress type="submit" pending={adding} isDisabled={held || !given} className="self-start">
        Add
      </CutPress>
    </form>
  );
}

/** The volumes of `factory`, marked `data-factory-volumes` with its name, in the api's order (`VolumeRow`), and the form that adds one. */
export function FactoryVolumes({ factory }: { factory: Pick<Factory, 'name' | 'volumes' | 'commands'> }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (asked: Change): Promise<unknown> =>
      asked.kind === 'add'
        ? factories.addVolume(factory.name, { volume: asked.volume })
        : asked.kind === 'remove'
          ? factories.removeVolume(factory.name, asked.path)
          : volumes.patch(factory.name, asked.name, asked.key === 'claudeMd' ? { claudeMd: asked.on } : { skills: asked.on }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['factories'] }),
  });
  const pending = change.isPending ? change.variables : undefined;
  const refused = refusalOf(change.error);
  return (
    <Card variant="outlined" data-factory-volumes={factory.name} classNames={{ content: 'gap-4' }}>
      <CardContent
        headline={
          <Title size="medium" component="h3">
            Volumes
          </Title>
        }
        supportingText="What this factory's runs reach: the repositories it works on (:rw) and the folders every local step reads (:ro), each a folder of this machine or a git URL it clones."
        classNames={{ header: 'mb-0' }}
      />
      {factory.volumes.length === 0 ? (
        <div data-no-volumes>
          <EmptyState
            size="sm"
            title="No volume"
            description="This factory works on no repository yet, and starts no run until it has one. Add one below, or type:"
            action={<CommandText text={factory.commands.volume} />}
            className="max-w-full"
          />
        </div>
      ) : (
        factory.volumes.map((v, i) => (
          <Fragment key={v.path}>
            {i > 0 && <Divider />}
            <VolumeRow
              volume={v}
              removing={pending?.kind === 'remove' && pending.path === v.path}
              asked={pending?.kind === 'switch' && pending.name === v.name ? pending : undefined}
              held={change.isPending}
              onRemove={() => change.mutate({ kind: 'remove', path: v.path })}
              onSwitch={(key, on) => {
                if (v.name !== null) change.mutate({ kind: 'switch', name: v.name, key, on });
              }}
            />
          </Fragment>
        ))
      )}
      {factory.volumes.length > 0 && (
        <p data-volume-switches-reach className="text-body-medium text-muted-foreground">
          A change reaches the runs started after it; a run under way keeps what it began with.
        </p>
      )}
      <Divider />
      <VolumeForm adding={pending?.kind === 'add'} held={change.isPending} onAdd={(volume) => change.mutate({ kind: 'add', volume })} />
      {refused !== null && (
        <p role="alert" data-volume-refused className={`text-body-medium [overflow-wrap:anywhere] ${ink.failure}`}>
          {NOT_DONE[change.variables?.kind ?? 'add']}: {refused}
        </p>
      )}
    </Card>
  );
}
