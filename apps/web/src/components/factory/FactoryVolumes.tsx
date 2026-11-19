/**
 * A factory's volumes, on its settings page: each folder or git URL its runs reach, its path as the api resolved it, its mark (`:ro` or
 * `:rw`, as docker compose marks it), the origin it was cloned from, and Remove, which takes it back. A writable volume is a repository
 * the factory works on, and says so. Under them, the form that gives one: a path or a git URL and its mode, sent as the CLI's `nemia
 * factory volume add` sends it, the api's refusal shown in its words under the form. Each write reads the factories again.
 */
import { Fragment, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, Divider, EmptyState, Tag, TextField, Title } from '@/components/ui/ds';
import { CutPress, Pending, RadioTile, RadioTileGroup } from '@/components/look';
import type { Factory, FactoryVolume } from '@/lib/api/factories';
import { factories } from '@/lib/api/objects';
import { ink } from '@/lib/meaning';
import { CommandText } from './FactorySchedules';

/** The two modes a volume is given in: worked on, a repository its runs work in (`:rw`), or read by every step (`:ro`). */
type Mode = 'rw' | 'ro';

/** What a person asks of the factory's volumes: one given, or one taken back by its path. */
type Change = { kind: 'add'; volume: string } | { kind: 'remove'; path: string };

/** The api's words for a write it refused, or none. */
const refusalOf = (error: unknown) =>
  error === null || error === undefined ? null : error instanceof Error ? error.message : 'the api answered nothing the board reads.';

/** One volume: its path, its mark, what it is, where it was cloned from, and Remove, pending while its own removal is out. */
function VolumeRow({
  volume: v,
  removing,
  held,
  onRemove,
}: {
  volume: FactoryVolume;
  removing: boolean;
  held: boolean;
  onRemove: () => void;
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
    mutationFn: (asked: Change) =>
      (asked.kind === 'add'
        ? factories.addVolume(factory.name, { volume: asked.volume })
        : factories.removeVolume(factory.name, asked.path)) satisfies Promise<unknown> as Promise<unknown>,
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
              held={change.isPending}
              onRemove={() => change.mutate({ kind: 'remove', path: v.path })}
            />
          </Fragment>
        ))
      )}
      <Divider />
      <VolumeForm adding={pending?.kind === 'add'} held={change.isPending} onAdd={(volume) => change.mutate({ kind: 'add', volume })} />
      {refused !== null && (
        <p role="alert" data-volume-refused className={`text-body-medium [overflow-wrap:anywhere] ${ink.failure}`}>
          {change.variables?.kind === 'remove' ? 'Not removed' : 'Not added'}: {refused}
        </p>
      )}
    </Card>
  );
}
