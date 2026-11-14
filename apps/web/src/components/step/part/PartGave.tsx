/**
 * What a step gave, of the try its part shows: the packet a later step takes it as, its declared fields in its schema's order each drawn
 * by its widget (a dash before it is given), what it declared and did not give, its loop's replies, then its files — pictures as
 * thumbnails, the rest as chips, each opening the viewer's sheet — its values, and one fold counting the files it left unnamed. On the
 * graph's node, the first of them on one line.
 */
import type { StepView } from '@/lib/runView';
import { stepFilesOf, type PartSize, type StepPartModel } from '@/lib/stepPart';
import { Artifacts, Values } from '../../run/Artifacts';
import { FieldWidgetView } from '../../field/widgets/FieldWidgetView';
import { Replies } from '../Outcome';
import { Fold } from './Fold';

/** What the step gave, as its part's model has it. */
type Gave = Exclude<StepPartModel['gave'], 'none'>;

/** A value on one line: a string as it is, anything else as its JSON. */
const lineOf = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/** The first of what the step gave, on one line: its first field given, else its first file, else its first value. */
function First({ gave }: { gave: Gave }) {
  const field = gave.fields.find((f) => f.given);
  const file = gave.files[0];
  const value = gave.values[0];
  const said = field
    ? `${field.name}: ${lineOf(field.value)}`
    : file
      ? file.path
      : value
        ? `${value.name}: ${value.value}`
        : gave.fields[0]
          ? `${gave.fields[0].name}: —`
          : null;
  if (said === null) return null;
  return (
    <p data-part-gave="S" title={said} className="truncate font-mono text-body-small text-on-surface-variant">
      {said}
    </p>
  );
}

/** What the step `step` gave of its shown try (`gave`), at `size`. */
export function PartGave({ step, gave, size }: { step: StepView; gave: Gave; size: PartSize }) {
  if (size === 'S') return <First gave={gave} />;
  const closeout = step.closeout;
  const unnamed = stepFilesOf(step).unnamed;
  return (
    <section data-part-gave={size} aria-label="What it gave" className="min-w-0 space-y-3 text-body-medium">
      <h3 className="text-label-medium text-on-surface-variant uppercase">
        Gave{gave.packet && <span className="normal-case"> — handed on as {gave.packet}</span>}
      </h3>
      {gave.fields.map((field) => (
        <FieldWidgetView
          key={field.name}
          name={field.name}
          widget={field.widget}
          value={field.value}
          given={field.given}
          schema={closeout?.schema[field.name] ?? null}
          questions={closeout?.questions.find((q) => q.field === field.name)?.questions ?? null}
          budgets={step.gate?.budgets ?? null}
        />
      ))}
      {closeout && closeout.missing.length > 0 && (
        <p data-missing className="text-body-small text-yours">
          declared and not given: {closeout.missing.join(', ')}
        </p>
      )}
      {closeout?.replies && <Replies replies={closeout.replies} />}
      {gave.files.length > 0 && <Artifacts artifacts={gave.files} step={step.name} />}
      <Values values={gave.values} />
      {gave.unnamed > 0 && (
        <Fold name="unnamed" title={`${gave.unnamed} ${gave.unnamed === 1 ? 'file' : 'files'} it did not name`}>
          <Artifacts artifacts={unnamed} step={step.name} size />
        </Fold>
      )}
    </section>
  );
}
