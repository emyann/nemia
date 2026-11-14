/**
 * A declared field of a step's output, drawn by the widget its schema picked once (`widgetOf`, `lib/fieldWidget.ts`), never by its value:
 * prose as markdown, a word of an `enum` as a tag, a list, a table, an object's rows, a yes or a no, a number, a link, a commit, and the
 * JSON of what no one widget draws; questions and budgets by the gate's own parts. A field not given yet is a dash.
 */
import type { ReactNode } from 'react';
import { Tag } from '@/components/ui/ds';
import { CopyId } from '@/components/look';
import type { FieldWidget } from '@/lib/fieldWidget';
import type { Question } from '@/lib/api/tries';
import type { Frozen } from '@/lib/frozen';
import { descriptionOf } from '@/lib/outcome';
import { Markdown } from '../../markdown/Markdown';
import { Json } from '../../step/Outcome';
import { Questions } from '../../gate/Questions';
import { GateBudgetRows, type GateBudgets } from '../../gate/GateBudgets';

/** A value as one line of text: a string as it is, anything else as its JSON. */
const textOf = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/** Whether `value` is an object that is no list. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** What says nothing was given: a dash, muted. */
const Dash = () => (
  <span data-dash className="font-mono text-body-medium text-on-surface-variant">
    —
  </span>
);

/** A cell's value: a string as the markdown it may be, anything else as its JSON. */
const Cell = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? <Markdown>{value}</Markdown> : <code className="font-mono text-body-small">{textOf(value)}</code>;

/** A list of scalars, a line each, a string as its markdown. */
function List({ items }: { items: readonly unknown[] }) {
  if (items.length === 0) return <Dash />;
  return (
    <ul className="list-disc space-y-1 pl-4 marker:text-on-surface-variant">
      {items.map((item, i) => (
        <li key={i}>
          <Cell value={item} />
        </li>
      ))}
    </ul>
  );
}

/** A table of objects: a column for each key any row has, in the order they first come, and a row for each object. */
function Table({ rows }: { rows: readonly unknown[] }) {
  const records = rows.filter(isRecord);
  if (records.length === 0) return <Dash />;
  const keys = [...new Set(records.flatMap((r) => Object.keys(r)))];
  return (
    <div className="max-w-full overflow-x-auto">
      <table data-table className="w-full border-collapse text-left text-body-small">
        <thead>
          <tr>
            {keys.map((key) => (
              <th
                key={key}
                scope="col"
                className="border-b border-outline-variant px-2 py-1 font-mono text-body-small text-on-surface-variant"
              >
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record, i) => (
            <tr key={i} className="border-b border-outline-variant last:border-b-0">
              {keys.map((key) => (
                <td key={key} data-cell={key} className="min-w-24 px-2 py-1 align-top">
                  {key in record ? <Cell value={record[key]} /> : <Dash />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An object's rows: each key and its value. */
function Rows({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(6rem,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1 text-body-small">
      {Object.entries(value).map(([key, one]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-on-surface-variant">{key}</dt>
          <dd className="m-0 min-w-0 break-words">
            <Cell value={one} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** An http(s) address, which opens in a new tab; any other text as it is. */
function Link({ value }: { value: string }) {
  const web = /^https?:\/\//.test(value);
  return web ? (
    <a href={value} target="_blank" rel="noreferrer" className="font-mono text-body-small break-all underline underline-offset-2">
      {value}
    </a>
  ) : (
    <span className="font-mono text-body-small break-all">{value}</span>
  );
}

/** What a widget is handed: the field's name, its value (never null), its schema, and its questions and budgets where it has them. */
type Given = {
  name: string;
  value: unknown;
  schema: unknown;
  questions: readonly Frozen<Question>[] | null;
  budgets: Frozen<GateBudgets> | null;
};

/** A yes or a no, and what the schema says it means beside it. */
function YesNo({ value, schema }: { value: unknown; schema: unknown }) {
  const description = descriptionOf(schema);
  return (
    <p>
      <span data-yesno={value ? 'yes' : 'no'} className="text-label-large uppercase">
        {value ? 'yes' : 'no'}
      </span>
      {description && <span className="text-body-small text-on-surface-variant"> — {description}</span>}
    </p>
  );
}

/** Each widget's drawing of a value, or null where the value is not of the shape it draws, for JSON to draw it instead. */
const DRAWS: Record<FieldWidget, (given: Given) => ReactNode | null> = {
  prose: ({ value }) => (typeof value === 'string' ? <Markdown>{value}</Markdown> : null),
  words: ({ value }) => (
    <Tag color="neutral" variant="outlined" data-words className="font-mono">
      {textOf(value)}
    </Tag>
  ),
  list: ({ value }) => (Array.isArray(value) ? <List items={value} /> : null),
  table: ({ value }) => (Array.isArray(value) ? <Table rows={value} /> : null),
  record: ({ value }) => (isRecord(value) ? <Rows value={value} /> : null),
  yesNo: ({ value, schema }) => <YesNo value={value} schema={schema} />,
  number: ({ value }) => <span className="font-mono text-body-large">{textOf(value)}</span>,
  link: ({ value }) => (typeof value === 'string' ? <Link value={value} /> : null),
  commit: ({ value }) => (typeof value === 'string' ? <CopyId id={value} /> : null),
  questions: ({ name, questions }) => (questions && questions.length > 0 ? <Questions field={name} questions={questions} /> : null),
  budgets: ({ name, budgets }) => (budgets ? <GateBudgetRows step={name} budgets={budgets} /> : null),
  json: () => null,
};

/** What a field holds, drawn by its widget; JSON where the value is not what the widget draws. */
function Drawn({ widget, ...given }: Given & { widget: FieldWidget }): ReactNode {
  if (given.value === null || given.value === undefined) return <Dash />;
  return DRAWS[widget](given) ?? <Json value={given.value} />;
}

/**
 * A declared field under its name, drawn by `widget`: a dash while it is not `given`. `questions` are the ones the closeout parsed of a
 * questions field, `budgets` the gate's of a budgets field; each drawn by the gate's own part where the field is of that shape.
 */
export function FieldWidgetView({
  name,
  widget,
  value,
  given,
  schema = null,
  questions = null,
  budgets = null,
}: {
  name: string;
  widget: FieldWidget;
  value: unknown;
  given: boolean;
  schema?: unknown;
  questions?: readonly Frozen<Question>[] | null;
  budgets?: Frozen<GateBudgets> | null;
}) {
  return (
    <section data-field={name} data-widget={widget} data-given={given || undefined} aria-label={name} className="min-w-0 space-y-1">
      <h4 className="font-mono text-body-small text-on-surface-variant">{name}</h4>
      {given ? <Drawn name={name} widget={widget} value={value} schema={schema} questions={questions} budgets={budgets} /> : <Dash />}
    </section>
  );
}
