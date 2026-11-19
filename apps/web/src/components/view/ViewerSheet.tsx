/**
 * The viewer's sheet: a file of a step drawn over the page by the viewer its kind and its name pick (`viewerOf`) — a picture, markdown,
 * JSON or text — with the step's other files a press away on either side; a file no viewer draws offers its link. It is a place of the
 * address (`?view=<step>/<path>`, `lib/viewAddress.ts`), mounted once at the root: a link that opens it pushes the address, so Back
 * closes it, and its Close takes the key out of the address. The run is the page's (`/runs/<run>…`) or the bar's (`?bar=`).
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useMatches, useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { barOf } from '@/lib/bar';
import { stepFileQuery } from '@/lib/api/steps';
import type { StepArtifact } from '@/lib/api/tries';
import { useRunRead } from '@/lib/runView';
import { fileKey, viewedFilesOf } from '@/lib/stepPart';
import { viewClosed, viewOf, viewOpened } from '@/lib/viewAddress';
import { extensionOf, viewerOf, type Viewer } from '@/lib/viewers';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { Body, SideSheet, Title } from '@/components/ui/ds';
import { Markdown } from '../markdown/Markdown';
import { Json } from '../step/Outcome';
import { bytesWord } from '../run/Artifacts';
import { Reading, ReadingLines } from '@/components/look';

/** A file the api serves: its name, its link and its kind. */
type Served = Extract<StepArtifact, { url: string }>;

/** The viewer of a file: by the kind the api serves it as and its name's extension; none for one it does not serve. */
const viewerOfFile = (file: StepArtifact) => viewerOf({ kind: 'url' in file ? file.kind : null, extension: extensionOf(fileKey(file)) });

/** The run the sheet's file is of: the page's, else the bar's. */
function useViewedRun() {
  const page = useMatches({
    select: (matches) => matches.flatMap((m) => ('runId' in m.params && typeof m.params.runId === 'string' ? [m.params.runId] : [])).at(-1),
  });
  const bar = useRouterState({ select: (state) => barOf((state.location.search as Record<string, unknown>).bar) });
  if (page) return page;
  return bar?.kind === 'run' || bar?.kind === 'step' ? bar.run : null;
}

/** The sheet over every page, open while the address names a file (`?view=`). */
export function ViewerSheet() {
  const view = useRouterState({ select: (state) => viewOf((state.location.search as Record<string, unknown>).view) });
  const run = useViewedRun();
  const navigate = useNavigate();
  if (!view || run === null) return null;
  const close = () =>
    void navigate({ to: '.', search: (prev: Record<string, unknown>) => viewClosed(prev), replace: true, resetScroll: false });
  return (
    <SideSheet
      variant="modal"
      isOpen
      onClose={close}
      title={
        <Title size="medium" component="h2" className="min-w-0 font-mono break-all">
          {view.path}
        </Title>
      }
      className="w-full sm:w-3xl"
    >
      <Viewed run={run} step={view.step} path={view.path} />
    </SideSheet>
  );
}

/** The file `path` of the step `step` of the run `run`, read with the run, and the way to its step's other files. */
function Viewed({ run, step: name, path }: { run: string; step: string; path: string }) {
  const { view } = useRunRead(run);
  const step = view?.steps.find((s) => s.name === name);
  const files = step ? viewedFilesOf(step) : [];
  const at = files.findIndex((f) => fileKey(f) === path);
  const file = files[at];
  return (
    <div data-viewer-sheet={`${name}/${path}`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 border-b border-outline-variant pb-4">
        <Body size="medium" colorRole="on-surface-variant">
          {name}
          {file && 'url' in file ? ` · ${bytesWord(file.size)}` : ''}
          {files.length > 1 && at >= 0 ? ` · file ${at + 1} of ${files.length}` : ''}
        </Body>
        {files.length > 1 && at >= 0 && (
          <nav aria-label="The step's other files" className="flex gap-2">
            <Step step={name} to={files[(at - 1 + files.length) % files.length]} words="Previous" />
            <Step step={name} to={files[(at + 1) % files.length]} words="Next" />
          </nav>
        )}
      </div>
      <div>
        {!view ? (
          <Reading label="Reading the run…">
            <ReadingLines widths={['w-full', 'w-11/12', 'w-5/6', 'w-full', 'w-2/3', 'w-3/4']} className="gap-1 text-body-medium" />
          </Reading>
        ) : !file ? (
          <p data-viewer="missing" className="text-body-medium text-failure">
            {name} has no file {path} on this try: open it again from its step's part.
          </p>
        ) : (
          <Drawn file={file} />
        )}
      </div>
    </div>
  );
}

/** A link to another file of the step, replacing the one shown, so Back still closes the sheet. */
function Step({ step, to, words }: { step: string; to: StepArtifact | undefined; words: 'Previous' | 'Next' }) {
  if (!to) return null;
  const Icon = words === 'Previous' ? ChevronLeft : ChevronRight;
  return (
    <Link
      to="."
      search={(prev: Record<string, unknown>) => viewOpened(prev, { step, path: fileKey(to) })}
      replace
      resetScroll={false}
      data-viewer-step={words.toLowerCase()}
      className={cn('inline-flex items-center gap-1 border border-outline-variant px-2 py-1 text-label-medium uppercase', focusRing())}
    >
      {words === 'Previous' && <Icon aria-hidden="true" className="size-4" />}
      {words}
      {words === 'Next' && <Icon aria-hidden="true" className="size-4" />}
    </Link>
  );
}

/** A file drawn by its viewer: a picture whole, a text read and drawn as markdown, JSON or text; none, its link. */
function Drawn({ file }: { file: StepArtifact }) {
  const viewer = viewerOfFile(file);
  if (!('url' in file))
    return (
      <p data-viewer="none" className="text-body-medium text-on-surface-variant">
        {'pruned' in file ? 'Its files were removed by a prune of its files.' : 'The api does not serve this file.'}
      </p>
    );
  if (viewer === 'picture') return <img data-viewer="picture" src={file.url} alt={file.name} className="max-w-full" />;
  if (viewer === 'none')
    return (
      <p data-viewer="none" className="text-body-medium">
        No viewer draws this file here.{' '}
        <a href={file.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Open {file.name} in a new tab
        </a>
        .
      </p>
    );
  return <TextFile file={file} viewer={viewer} />;
}

/**
 * A text file, read, drawn as markdown, as JSON (as it came where it does not parse), or as it is; while its read is out, the shape of
 * its lines under a status that says it is read.
 */
export function TextFile({ file, viewer }: { file: Served; viewer: Exclude<Viewer, 'picture' | 'none'> }) {
  const read = useQuery(stepFileQuery(file.url));
  if (read.error)
    return (
      <p className="text-body-medium text-failure">
        Could not read {file.name}: {read.error.message}
      </p>
    );
  if (read.data === undefined)
    return (
      <Reading label={`Reading ${file.name}…`}>
        <ReadingLines widths={['w-1/2', 'w-full', 'w-11/12', 'w-5/6', 'w-full', 'w-2/3']} className="gap-1 text-body-medium" />
      </Reading>
    );
  if (viewer === 'markdown')
    return (
      <div data-viewer="markdown">
        <Markdown>{read.data}</Markdown>
      </div>
    );
  if (viewer === 'json') return <Json data-viewer="json" value={parsed(read.data)} />;
  return (
    <pre data-viewer="text" className="font-mono text-body-small whitespace-pre-wrap break-words">
      {read.data}
    </pre>
  );
}

/** The JSON a text holds, or the text itself where it holds none. */
function parsed(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text as unknown;
  }
}
