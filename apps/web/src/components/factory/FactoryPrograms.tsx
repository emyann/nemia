/**
 * A factory's programs on its settings page: the long-lived commands its template keeps running for it, one row each with its name, the
 * conditions it writes and where its task runs now: Running with its restarts and since when, Pending before it is filed, or Down with what
 * to type so it runs again. A factory whose template declares none draws nothing, and no page of its own is made for them.
 */
import { useQuery } from '@tanstack/react-query';
import type { Program } from 'objects';
import { Tag } from '@/components/ui/ds';
import { factoryProgramsQuery } from '@/lib/api/factories';

/**
 * One program: its name, its phase in a tag, what it writes, and since when and how often it was started again; its fix where it is
 * Down.
 */
function ProgramRow({ program: p }: { program: Program }) {
  const phase = p.status?.phase ?? 'Pending';
  return (
    <li data-factory-program={p.metadata.name} className="flex flex-col gap-2 rounded-shape-medium border border-outline-variant p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-title-small">{p.metadata.name}</span>
        <Tag variant="outlined" data-program-phase={phase}>
          {phase}
        </Tag>
        <span className="text-body-medium text-on-surface-variant">
          writes {p.spec.writes.length === 0 ? 'no condition' : p.spec.writes.join(', ')}
        </span>
      </div>
      {p.status?.since !== undefined && (
        <p className="text-body-medium text-on-surface-variant">
          {phase === 'Down' ? 'Down' : 'Up'} since {p.status.since}, started again {p.status.restarts}{' '}
          {p.status.restarts === 1 ? 'time' : 'times'}.
        </p>
      )}
      {p.status?.message !== undefined && (
        <p data-program-fix className="text-body-medium">
          {p.status.message}
        </p>
      )}
    </li>
  );
}

/** The programs of the factory `name`, read now; nothing where it has none or they are not read yet. */
export function FactoryPrograms({ name }: { name: string }) {
  const { data } = useQuery(factoryProgramsQuery(name));
  if (data === undefined || data.length === 0) return null;
  return (
    <section aria-label="Programs" data-factory-programs={name} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-medium">Programs</h2>
        <p className="text-body-medium text-on-surface-variant">
          What this factory's template keeps running for it: each writes the conditions that steps wait on. The daemon starts one again when
          it ends.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {data.map((p) => (
          <ProgramRow key={p.metadata.name} program={p} />
        ))}
      </ul>
    </section>
  );
}
