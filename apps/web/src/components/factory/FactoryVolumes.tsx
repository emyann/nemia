/**
 * A factory's volumes, on its settings page, read-only: each folder of the person's machine its runs reach beside its repositories, its
 * path as the api resolved it, its mark (`:ro` or `:rw`, as docker compose marks it) and the line that takes it back. A writable one says
 * it is not the run's workspace, which a person weighs: drawn as theirs, light. With none, the line that adds one, as the api answered it.
 */
import { Fragment } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Card, CardContent, Divider, EmptyState, Tag, Title } from '@/components/ui/ds';
import type { Factory, FactoryVolume } from '@/lib/api/factories';
import { ink } from '@/lib/meaning';
import { cn } from '@/lib/utils';
import { CommandText } from './FactorySchedules';

/** One volume: its path, its mark, the caveat of a writable one, and the line that takes it back. */
function VolumeRow({ volume: v }: { volume: FactoryVolume }) {
  return (
    <div data-factory-volume={v.path} className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 font-mono text-body-medium [overflow-wrap:anywhere]">{v.path}</span>
        <Tag variant={v.readOnly ? 'tonal' : 'outlined'} className="font-mono" data-volume-mark={v.readOnly ? 'ro' : 'rw'}>
          {v.readOnly ? ':ro' : ':rw'}
        </Tag>
      </div>
      {!v.readOnly && (
        <p data-volume-caveat className="flex items-start gap-2 text-body-medium text-muted-foreground">
          <TriangleAlert className={cn('mt-0.5 size-4 shrink-0', ink.yours)} aria-hidden />
          <span>Writable, and not the run's workspace: nothing commits or lands what a step writes here.</span>
        </p>
      )}
      <CommandText text={v.commands.rm} />
    </div>
  );
}

/** The volumes of `factory`, marked `data-factory-volumes` with its name, in the api's order (`VolumeRow`). */
export function FactoryVolumes({ factory }: { factory: Pick<Factory, 'name' | 'volumes' | 'commands'> }) {
  return (
    <Card variant="outlined" data-factory-volumes={factory.name} classNames={{ content: 'gap-4' }}>
      <CardContent
        headline={
          <Title size="medium" component="h3">
            Volumes
          </Title>
        }
        supportingText="Folders of this machine every local step of a run here reaches, beside its repositories, read-only (:ro) or writable (:rw). A volume is mounted and taken back on the command line."
        classNames={{ header: 'mb-0' }}
      />
      {factory.volumes.length === 0 ? (
        <div data-no-volumes>
          <EmptyState
            size="sm"
            title="No volume"
            description="This factory's runs reach only its repositories. To mount a folder for them, type:"
            action={<CommandText text={factory.commands.volume} />}
            className="max-w-full"
          />
        </div>
      ) : (
        factory.volumes.map((v, i) => (
          <Fragment key={v.path}>
            {i > 0 && <Divider />}
            <VolumeRow volume={v} />
          </Fragment>
        ))
      )}
    </Card>
  );
}
