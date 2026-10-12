import { useState, type ReactNode } from 'react';
import type { KeyRow } from '../lib/api';
import { cn } from '../lib/utils';
import { Markdown } from './Markdown';

/**
 * A file's keys as a table: a row per key the package has — set or not, so a person reads what the file could say beside what it does —
 * with its value and one line of what it means, the package's own. A key the file does not set is muted, and says so.
 */
export function KeyTable({ rows, note }: { rows: readonly KeyRow[]; note?: ReactNode }) {
  return (
    <section aria-label="Keys" className="space-y-2">
      <div className="space-y-0.5">
        <h2 className="text-title-small">Keys</h2>
        {note && <p className="text-body-small text-muted-foreground">{note}</p>}
      </div>
      <div className="overflow-x-auto rounded border border-outline-variant">
        <table className="w-full min-w-[36rem] border-collapse text-left text-body-medium">
          <thead className="bg-surface-container text-body-small text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-medium">
                key
              </th>
              <th scope="col" className="px-3 py-1.5 font-medium">
                value
              </th>
              <th scope="col" className="px-3 py-1.5 font-medium">
                what it means
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, value, meaning }) => (
              <tr key={key} data-key={key} data-set={value !== null} className="border-t border-outline-variant align-top">
                <th
                  scope="row"
                  className={cn('w-36 px-3 py-1.5 font-mono text-body-small font-medium', value === null && 'text-muted-foreground')}
                >
                  {key}
                </th>
                <td data-value className="w-56 px-3 py-1.5 font-mono text-body-small break-all">
                  {value ?? <span className="font-sans text-muted-foreground">not set</span>}
                </td>
                <td
                  data-meaning
                  className={cn('px-3 py-1.5 text-body-small', value === null ? 'text-muted-foreground' : 'text-foreground')}
                >
                  <Markdown>{meaning}</Markdown>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * A file, rendered — what `children` draws of it — or as written: a toggle between the two, the file's path beside it. As written is the
 * text whole, frontmatter included, as an editor shows it; nothing on the page writes to it.
 */
export function AsWritten({ file, source, children }: { file: string; source: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <section aria-label="The file" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-outline-variant pb-2">
        <p className="min-w-0 font-mono text-body-small break-all text-muted-foreground">{file}</p>
        <button
          type="button"
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
          title={shown ? 'Show it rendered, with its keys' : 'Show the file as written, frontmatter included'}
          className={cn(
            'shrink-0 rounded border px-2 py-0.5 text-body-small font-medium',
            shown ? 'border-rest bg-rest text-on-rest' : 'border-outline hover:bg-accent',
          )}
        >
          Source
        </button>
      </div>
      {shown ? (
        <pre
          data-source
          className="overflow-x-auto rounded border border-outline-variant bg-surface-container p-3 font-mono text-body-small leading-relaxed whitespace-pre-wrap break-words"
        >
          {source}
        </pre>
      ) : (
        children
      )}
    </section>
  );
}
