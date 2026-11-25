import { useState, type ReactNode } from 'react';
import type { KeyRow } from '../../lib/api/library.ts';
import { cn } from '../../lib/utils';
import { Markdown } from '../markdown/Markdown';
import { Body, Button, Title } from '@/components/ui/ds';

/**
 * A file's keys as a table: a row per key the package has — set or not, so a person reads what the file could say beside what it does —
 * with its value and one line of what it means, the package's own. A key the file does not set is muted, and says so.
 */
export function KeyTable({ rows, note }: { rows: readonly KeyRow[]; note?: ReactNode }) {
  return (
    <section aria-label="Keys" className="space-y-2">
      <div className="space-y-0.5">
        <Title size="small" component="h2">
          Keys
        </Title>
        {note && (
          <Body size="small" colorRole="on-surface-variant">
            {note}
          </Body>
        )}
      </div>
      <div className="overflow-x-auto rounded border border-outline-variant">
        <Body size="medium" component="div" className="contents">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <Body size="small" component="div" className="contents">
              <thead className="bg-surface-container text-on-surface-variant">
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
            </Body>
            <tbody>
              {rows.map(({ key, value, meaning }) => (
                <tr key={key} data-key={key} data-set={value !== null} className="border-t border-outline-variant align-top">
                  <Body size="small" component="div" className="contents">
                    <th scope="row" className={cn('w-36 px-3 py-1.5 font-mono font-medium', value === null && 'text-on-surface-variant')}>
                      {key}
                    </th>
                  </Body>
                  <Body size="small" component="div" className="contents">
                    <td data-value className="w-56 px-3 py-1.5 font-mono break-all">
                      {value ?? <span className="font-sans text-on-surface-variant">not set</span>}
                    </td>
                  </Body>
                  <Body size="small" component="div" className="contents">
                    <td data-meaning className={cn('px-3 py-1.5', value === null ? 'text-on-surface-variant' : 'text-on-surface')}>
                      <Markdown>{meaning}</Markdown>
                    </td>
                  </Body>
                </tr>
              ))}
            </tbody>
          </table>
        </Body>
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
        <Body size="small" colorRole="on-surface-variant" className="min-w-0 font-mono break-all">
          {file}
        </Body>
        <span
          title={shown ? 'Show it rendered, with its keys' : 'Show the file as written, frontmatter included'}
          className="inline-flex shrink-0"
        >
          <Button variant="outlined" size="xsmall" isToggle isSelected={shown} onChange={setShown}>
            Source
          </Button>
        </span>
      </div>
      {shown ? (
        <Body size="small" component="div" className="contents">
          <pre
            data-source
            className="overflow-x-auto rounded border border-outline-variant bg-surface-container p-3 font-mono leading-relaxed whitespace-pre-wrap break-words"
          >
            {source}
          </pre>
        </Body>
      ) : (
        children
      )}
    </section>
  );
}
