import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import type { StepArtifact } from '../lib/api';
import { descriptionOf, type Outcome, outcomeWord, type OutputKind, outputKind } from '../lib/outcome';
import { cn } from '../lib/utils';
import { ArtifactView } from './Artifacts';
import { Markdown } from './Markdown';
import { container } from '../lib/meaning';

const BADGE: Record<Outcome['by'] | 'blocked', string> = {
  agent: container.sage,
  blocked: container.yours,
  machine: container.failure,
  unreadable: container.failure,
  nobody: 'bg-muted text-foreground',
};

const BY: Record<Outcome['by'], string> = {
  agent: 'said by the agent',
  unreadable: 'said by the agent, not readable',
  machine: 'no statement: the machine’s reason',
  nobody: 'no statement',
};

/**
 * How a try ended, first, in words: the agent's `done` or `blocked`, or the machine's reason it has no statement — and who said it.
 * `aside` sits at the right of the line: the Raw switch, for a try with a statement to show.
 */
export function OutcomeHead({ outcome, aside }: { outcome: Outcome; aside?: ReactNode }) {
  const word = outcomeWord(outcome);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p data-outcome={word} data-by={outcome.by} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge
            className={cn('text-body-medium', BADGE[outcome.by === 'agent' && outcome.outcome === 'blocked' ? 'blocked' : outcome.by])}
          >
            {word}
          </Badge>{' '}
          <span className="text-body-small text-muted-foreground">{BY[outcome.by]}</span>
        </p>
        {aside}
      </div>
      {outcome.by === 'agent' && outcome.cut && <p className="text-body-small text-failure">… {outcome.cut}.</p>}
      {outcome.by !== 'agent' && (
        <p data-reason className="text-muted-foreground">
          {outcome.words}
        </p>
      )}
    </div>
  );
}

/**
 * A closeout's field under its name, drawn as `outputKind` says from its value and the schema it was declared by. `named` false where
 * the name is said already, on the fold the field sits in.
 */
export function FieldView({
  name,
  named = true,
  schema,
  value,
  artifacts,
  images,
}: {
  name: string;
  named?: boolean;
  schema: unknown;
  value: unknown;
  artifacts: readonly StepArtifact[];
  images: ReadonlySet<string>;
}) {
  const kind = outputKind(schema, value, images);
  return (
    <section data-field={name} data-kind={kind} aria-label={name} className="min-w-0 space-y-1">
      {named && <h4 className="font-mono text-body-small text-muted-foreground">{name}</h4>}
      <KindView kind={kind} schema={schema} value={value} artifacts={artifacts} />
    </section>
  );
}

function KindView({
  kind,
  schema,
  value,
  artifacts,
}: {
  kind: OutputKind;
  schema: unknown;
  value: unknown;
  artifacts: readonly StepArtifact[];
}) {
  switch (kind) {
    case 'findings':
      return <Records kind={kind} records={value as Array<Record<string, unknown>>} place={findingPlace} />;
    case 'table':
      return <Records kind={kind} records={value as Array<Record<string, unknown>>} place={firstField} />;
    case 'replies':
      return <Replies replies={value as Array<Record<string, unknown>>} />;
    case 'yesno':
      return <YesNo yes={value as boolean} description={descriptionOf(schema)} />;
    case 'list':
      return <StringList items={value as string[]} artifacts={artifacts} />;
    case 'image':
      return <ArtifactView artifact={artifactAt(artifacts, value as string)} />;
    case 'markdown':
      return <Markdown>{value as string}</Markdown>;
    case 'text':
      return typeof value === 'string' ? <Markdown>{value}</Markdown> : <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
    case 'json':
      return <Json value={value} />;
  }
}

const artifactAt = (artifacts: readonly StepArtifact[], path: string): StepArtifact => artifacts.find((a) => a.path === path) ?? { path };

const None = () => <p className="text-body-small text-muted-foreground">none</p>;

type Place = (record: Record<string, unknown>) => { place: string; rest: string[] };

/** A finding's place, `file:line`, or the file alone when its line is null: it is about something absent. */
const findingPlace: Place = (r) => ({
  place:
    r.line === null || r.line === undefined
      ? String(r.file)
      : `${String(r.file)}:${typeof r.line === 'number' || typeof r.line === 'string' ? r.line : JSON.stringify(r.line)}`,
  rest: Object.keys(r).filter((k) => k !== 'file' && k !== 'line'),
});

/** A record's first field as its heading: a plan's file is its `path`. */
const firstField: Place = (r) => {
  const [first, ...rest] = Object.keys(r);
  return { place: first === undefined ? '' : text(r[first]), rest };
};

const text = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * Records a row each: the place over what is said of it, stacked, since the inspector is too narrow for two columns. One field
 * beside the place is drawn unnamed; more are each under their name. A field's text is markdown; anything else, its JSON.
 */
function Records({ kind, records, place }: { kind: 'findings' | 'table'; records: Array<Record<string, unknown>>; place: Place }) {
  if (!records.length) return <None />;
  return (
    <table data-kind={kind} className="w-full text-body-medium">
      <tbody>
        {records.map((record, i) => {
          const { place: where, rest } = place(record);
          return (
            <tr key={i} className="block border-t border-outline-variant py-1.5 first:border-t-0 first:pt-0">
              <th
                scope="row"
                data-place
                title={where}
                className="block break-all text-left font-mono text-body-small font-medium text-foreground underline decoration-outline decoration-dotted underline-offset-2"
              >
                {where}
              </th>
              <td className="block min-w-0 space-y-1 pt-0.5">
                {rest.map((key) => (
                  <div key={key} data-cell={key}>
                    {rest.length > 1 && (
                      <>
                        <span className="font-mono text-body-small text-muted-foreground">{key}</span>{' '}
                      </>
                    )}
                    {typeof record[key] === 'string' ? (
                      <Markdown>{record[key]}</Markdown>
                    ) : (
                      <code className="font-mono text-body-small">{text(record[key])}</code>
                    )}
                  </div>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const ANSWER: Record<string, string> = {
  fixed: container.sage,
  "won't fix": 'bg-surface-container-highest text-foreground',
};

/**
 * A loop's target's answers, `finding → answer · why`: the finding, then its answer and why beneath it — the finding and why as the
 * markdown they are, each maybe more than a line, and the answer a badge.
 */
function Replies({ replies }: { replies: Array<Record<string, unknown>> }) {
  return (
    <ul className="space-y-2 text-body-small">
      {replies.map((reply, i) => {
        const answer = text(reply.answer ?? '');
        const why = reply.why === undefined ? '' : text(reply.why);
        return (
          <li key={i} data-answer={answer} className="space-y-0.5">
            <Markdown>{text(reply.finding ?? '')}</Markdown>{' '}
            <div className="flex items-start gap-1.5 text-muted-foreground">
              <span className="shrink-0">
                → <Badge className={ANSWER[answer] ?? ANSWER["won't fix"]}>{answer}</Badge>
              </span>
              {why && (
                <>
                  {' '}
                  <span aria-hidden>·</span> <Markdown>{why}</Markdown>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A yes or a no, and what it means: its field's description in the schema it was declared by. */
function YesNo({ yes, description }: { yes: boolean; description: string | null }) {
  return (
    <p>
      <span data-yesno={yes ? 'yes' : 'no'} className="font-semibold">
        {yes ? 'yes' : 'no'}
      </span>
      {description && (
        <>
          {' '}
          <span className="text-body-small text-muted-foreground">— {description}</span>
        </>
      )}
    </p>
  );
}

/**
 * Strings a line each, each the markdown it may be; one that names an image among the try's files, that image, with no bullet beside its
 * caption.
 */
function StringList({ items, artifacts }: { items: string[]; artifacts: readonly StepArtifact[] }) {
  if (!items.length) return <None />;
  return (
    <ul className="list-disc space-y-1 pl-4 marker:text-muted-foreground">
      {items.map((item, i) => {
        const artifact = artifacts.find((a) => a.path === item && 'url' in a && a.kind === 'image');
        return artifact ? (
          <li key={i} className="-ml-4 list-none">
            <ArtifactView artifact={artifact} />
          </li>
        ) : (
          <li key={i}>
            <Markdown>{item}</Markdown>
          </li>
        );
      })}
    </ul>
  );
}

/** A value as the JSON it came as. */
export function Json({ value, ...data }: { value: unknown; 'data-raw'?: boolean }) {
  return (
    <pre
      {...data}
      className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-body-small leading-snug"
    >
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
