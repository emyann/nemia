import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/ds';
import { CutField, CutTag, TextLink } from '@/components/look';
import { CLOSED_LABEL_KEYS, type Labels as LabelMap } from '@/lib/api/labels';

/** The labels of `map` in key order, each `key=value`. */
const entriesOf = (map: Readonly<LabelMap>): Array<[string, string]> =>
  Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** One label, a cut tag reading `key=value`, linking to its label page. */
function LabelTag({ name, value }: { name: string; value: string }) {
  return (
    <CutTag>
      <TextLink to="/labels/$key/$value" params={{ key: name, value }} data-label={`${name}=${value}`}>
        <Tag variant="tonal" color="secondary">
          {name}={value}
        </Tag>
      </TextLink>
    </CutTag>
  );
}

/** A row's own labels as tags — `factory` and `workflow` left to the row's own columns — none drawn for none. */
export function LabelTags({ labels }: { labels: Readonly<LabelMap> }) {
  const entries = entriesOf(labels).filter(([key]) => !CLOSED_LABEL_KEYS.includes(key));
  if (entries.length === 0) return null;
  return (
    <span data-labels className="inline-flex flex-wrap items-center gap-1.5">
      {entries.map(([key, value]) => (
        <LabelTag key={key} name={key} value={value} />
      ))}
    </span>
  );
}

/**
 * A card's or a run's labels, edited: each a tag, a person's own with a Remove beside it (`factory` and `workflow`, the store's, shown
 * and never removed), and a field that adds `key=value`. `edit` sends the edits (`key=value`, `key-`) and resolves once the api has
 * written them; a refusal is said under the field in the api's words.
 */
export function Labels({ labels, edit }: { labels: Readonly<LabelMap>; edit: (edits: readonly string[]) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [refused, setRefused] = useState<string | null>(null);
  const send = (edits: readonly string[], done?: () => void) =>
    edit(edits).then(
      () => {
        setRefused(null);
        done?.();
      },
      (error: unknown) => setRefused(error instanceof Error ? error.message : String(error)),
    );
  return (
    <section data-labels-edit aria-label="Labels" className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
        {entriesOf(labels).map(([key, value]) => (
          <li key={key} className="inline-flex items-center gap-1">
            <LabelTag name={key} value={value} />
            {CLOSED_LABEL_KEYS.includes(key) ? null : (
              <Button type="button" size="xs" variant="ghost" aria-label={`Remove ${key}`} onClick={() => void send([`${key}-`])}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex max-w-md flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const typed = text.trim();
          if (typed !== '') void send([typed], () => setText(''));
        }}
      >
        <CutField>
          <div className="flex items-center gap-2 py-1 pr-1 pl-3.5">
            <input
              aria-label="Add a label"
              name="label"
              value={text}
              placeholder="key=value"
              onChange={(event) => setText(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant"
            />
            <Button type="submit" size="sm" variant="secondary">
              Add
            </Button>
          </div>
        </CutField>
        {refused === null ? null : (
          <p role="alert" data-labels-refused className="m-0 text-body-small text-failure">
            {refused}
          </p>
        )}
      </form>
    </section>
  );
}
