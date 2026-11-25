/**
 * What a try's check printed, read through the api a page at a time (`steps.checkOutput`): its last lines first, the end being where a
 * check says what failed, then earlier or later pages, stdout or stderr, and only the lines containing a text searched for, each line
 * after its number in the stream. While the check runs it is read again on a beat, and says so.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CheckOutput as Printed, OutputStream } from 'objects';
import { steps } from '@/lib/api/objects';
import { PATH_POLL_MS } from '@/lib/lifecyclePath';
import { Reading, ReadingLines } from '@/components/look';
import { Body, Button, SearchBar, Segment, SegmentedButton } from '@/components/ui/ds';
import { focusRing } from '@/components/ui/ds/utils';
import { cn } from '@/lib/utils';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** How many lines a page of the reader holds. */
const PAGE = 200;

/** Where the reader reads: the last lines, on from a line, or back from one. */
type At = { readonly last: true } | { readonly from: number } | { readonly before: number };

/** The try whose check is read: its run, its step and its number. */
export type CheckRead = { readonly runId: string; readonly step: string; readonly try: number; readonly check?: string };

/** The page `at` asks, as the api's query spells it. */
const pageOf = (at: At) =>
  'last' in at
    ? { last: String(PAGE) }
    : 'from' in at
      ? { from: String(at.from), limit: String(PAGE) }
      : { before: String(at.before), limit: String(PAGE) };

/** The stream read and the search over its lines, each a choice that reads the stream's end again. */
function Controls({
  stream,
  onStream,
  onSearch,
}: {
  stream: OutputStream;
  onStream: (s: OutputStream) => void;
  onSearch: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedButton
        aria-label="Which stream"
        className="w-auto flex-none"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[stream]}
        onSelectionChange={(keys) => onStream([...keys][0] === 'stderr' ? 'stderr' : 'stdout')}
      >
        <Segment id="stdout" className="flex-none">
          stdout
        </Segment>
        <Segment id="stderr" className="flex-none">
          stderr
        </Segment>
      </SegmentedButton>
      <SearchBar
        data-check-output-search
        placeholder="Search its lines"
        onSubmit={(text) => onSearch(text.trim())}
        onClear={() => onSearch('')}
        className="max-w-80 shadow-none"
      />
    </div>
  );
}

/** The lines of a page, each after its number in the stream, the box scrolled to its last line where `atEnd`, else to its first. */
function Lines({ lines, atEnd }: { lines: Printed['lines']; atEnd: boolean }) {
  const box = useRef<HTMLPreElement>(null);
  const last = lines.at(-1)?.n;
  useLayoutEffect(() => {
    const at = box.current;
    if (at) at.scrollTop = atEnd ? at.scrollHeight : 0;
  }, [atEnd, last]);
  if (!lines.length) return null;
  return (
    <pre
      ref={box}
      role="region"
      aria-label="Its lines"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a box that scrolls is reached by the keyboard
      tabIndex={0}
      className={cn('max-h-96 overflow-auto rounded bg-surface-container-highest p-2 font-mono text-body-small leading-snug', focusRing())}
    >
      {lines.map((line) => (
        <span key={line.n} data-line={line.n} className="flex gap-3">
          <span aria-hidden className="w-12 flex-none text-end text-on-surface-variant select-none">
            {line.n}
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{line.text}</span>
        </span>
      ))}
    </pre>
  );
}

/**
 * The presses that read the page before this one, back from the line the api says lines are held before (`before`), held lines and not
 * line numbers, so a page back under a search holds as many matches as one forward; the one after it; and the stream's end again. None
 * where the page is all there is.
 */
function Pages({ data, at, onAt }: { data: Printed; at: At; onAt: (at: At) => void }) {
  const before = data.before;
  const next = data.next;
  if (before === undefined && next === undefined && 'last' in at) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outlined" isDisabled={before === undefined} onPress={() => before !== undefined && onAt({ before })}>
        Earlier lines
      </Button>
      <Button variant="outlined" isDisabled={next === undefined} onPress={() => next !== undefined && onAt({ from: next })}>
        Later lines
      </Button>
      <Button variant="outlined" isDisabled={'last' in at} onPress={() => onAt({ last: true })}>
        The end
      </Button>
    </div>
  );
}

/** The reader of what the check of the try `read` names printed, opened on its stdout's last lines. */
export function CheckOutput({ read }: { read: CheckRead }) {
  const [stream, setStream] = useState<OutputStream>('stdout');
  const [at, setAt] = useState<At>({ last: true });
  const [match, setMatch] = useState('');
  const asked = { stream, ...pageOf(at), ...(match === '' ? {} : { match }), ...(read.check === undefined ? {} : { check: read.check }) };
  const output = useQuery({
    queryKey: ['check-output', read.runId, read.step, read.try, asked],
    queryFn: () => steps.checkOutput(read.runId, read.step, read.try, asked),
    refetchInterval: (query) => (query.state.data?.running ? PATH_POLL_MS : false),
  });
  const data = output.data;
  return (
    <div data-check-output={read.try} data-stream={stream} className="space-y-2">
      <Controls
        stream={stream}
        onStream={(s) => {
          setStream(s);
          setAt({ last: true });
        }}
        onSearch={(text) => {
          setMatch(text);
          setAt({ last: true });
        }}
      />
      {output.error ? (
        <ReadTrouble what="what the check printed" error={output.error} className="text-body-small" />
      ) : data === undefined ? (
        <Reading label="Reading what the check printed">
          <ReadingLines widths={['w-2/3', 'w-1/2', 'w-3/4']} className="gap-1 text-body-small" />
        </Reading>
      ) : (
        <>
          <Body size="small" colorRole="on-surface-variant" data-check-output-said>
            {said(data, match)}
          </Body>
          <Lines lines={data.lines} atEnd={!('from' in at)} />
          <Pages data={data} at={at} onAt={setAt} />
        </>
      )}
    </div>
  );
}

/** What the reader says over the lines it shows: whose they are, how many of how many, and whether more may come. */
function said(data: Printed, match: string) {
  if (data.taskId === null) return 'No check filed for this try yet: it has printed nothing.';
  const of = data.partial
    ? 'The runtime kept no whole stdout of this check: these are the end of its log.'
    : data.total === 0
      ? `Nothing on its ${data.stream}.`
      : match !== ''
        ? `${data.matched ?? 0} of its ${data.total} lines on ${data.stream} contain “${match}”.`
        : `Lines ${data.lines[0]?.n ?? 0}–${data.lines.at(-1)?.n ?? 0} of its ${data.total} on ${data.stream}.`;
  return data.running ? `${of} The check still runs, and is read again as it prints.` : of;
}
