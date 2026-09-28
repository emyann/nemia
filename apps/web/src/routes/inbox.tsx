import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { StartRun } from '../components/StartRun';
import {
  dropCard,
  fileCard,
  inboxQuery,
  queueCard,
  repositoryQuery,
  workflowNameOf,
  workflowsQuery,
  type InboxEntry,
  type WorkflowListing,
} from '../lib/api';
import {
  cardLines,
  hasPage,
  namedElsewhere,
  newestCardsFirst,
  presetOf,
  queueable,
  queuedWord,
  queueOf,
  triedLine,
  workflowKey,
  type CardRefusal,
} from '../lib/inbox';

export const Route = createFileRoute('/inbox')({
  loader: ({ context }) => context.queryClient.ensureQueryData(inboxQuery),
  component: InboxPage,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load the inbox: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

const FIELD =
  'block w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400';
const PRIMARY =
  'rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100';
const SECONDARY =
  'rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900';

/**
 * The inbox: a box that files a card, and the cards, newest first, each startable and removable. The page keeps what a start or a drop was
 * refused with, by card, since the inbox is read again after each answer: a card gone behind the page's back leaves the list, and its refusal
 * stays where it was listed until dismissed.
 */
function InboxPage() {
  const { data: entries } = useSuspenseQuery(inboxQuery);
  const [refusals, setRefusals] = useState<CardRefusal[]>([]);
  const cards = newestCardsFirst(entries);
  const queue = queueOf(entries).length;
  const lines = cardLines(entries, refusals);
  // Kept by the entry's file, as `cardLines` matches them: a card and a stray file beside it answer to one name, and a refusal is of one of them.
  const refusalFor = (entry: InboxEntry) => (refusal: Omit<CardRefusal, 'entry'> | null) =>
    setRefusals((kept) => [...kept.filter((r) => r.entry.file !== entry.file), ...(refusal ? [{ ...refusal, entry }] : [])]);

  return (
    <article className="space-y-6">
      <p className="text-sm text-neutral-500">
        An idea parked as a card until you start a workflow on it: a file each in the store&apos;s {code('inbox/')}, as{' '}
        {code('wf inbox add')} parks one. Starting a card writes its run&apos;s record as {code('wf start')} does, and removes the card. A
        card queued starts on its own, on the workflow it names, when {code('wf up')} has a run slot free: the oldest queued first.
      </p>
      <FileCard />
      <section aria-label="Cards" className="space-y-3">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold">
          Cards{' '}
          <span data-count className="text-xs font-normal text-neutral-500">
            {cards.length}
          </span>
          {queue > 0 && (
            <span data-queue-count className="text-xs font-normal text-neutral-500">
              · {queue} queued
            </span>
          )}
        </h2>
        {lines.length > 0 && (
          <ul className="space-y-3">
            {lines.map(({ entry, refusal, gone }) =>
              gone ? (
                <GoneItem key={`gone:${entry.file}`} entry={entry} refusal={refusal!} onDismiss={() => refusalFor(entry)(null)} />
              ) : (
                <CardItem key={entry.file} entry={entry} entries={entries} refusal={refusal} onRefused={refusalFor(entry)} />
              ),
            )}
          </ul>
        )}
        {cards.length === 0 && (
          <p data-empty className="text-sm text-neutral-500">
            The inbox is empty. File an idea in the box above, or from the command line: {code('wf inbox add "<idea>"')}.
          </p>
        )}
      </section>
    </article>
  );
}

/** The workflows a card can name: those that read, the repository's then yours, as the Workflows page lists them. */
function WorkflowOptions({ workflows }: { workflows: readonly WorkflowListing[] }) {
  return workflows
    .filter((w) => w.error === null)
    .map((w) => (
      <option key={workflowKey(w)} value={workflowKey(w)}>
        {w.name}
        {w.from === 'yours' ? ' (yours)' : ''}
      </option>
    ));
}

/**
 * The box that files a card, as `wf inbox add "<idea>" --workflow <name> --repo <path>` does: the idea; what runs it, when it is known; and the
 * repository it is about, the api's own until a person changes it — empty, for a card that names none. Then the api's refusal in full, with the
 * idea kept to send again.
 */
function FileCard() {
  const queryClient = useQueryClient();
  const workflows = useQuery(workflowsQuery);
  const repository = useQuery(repositoryQuery);
  const [idea, setIdea] = useState('');
  const [workflow, setWorkflow] = useState('');
  // Null until a person types in it: the api's repository, once it has said which.
  const [repo, setRepo] = useState<string | null>(null);
  const about = repo ?? repository.data?.repo ?? '';
  const picked = workflows.data?.find((w) => workflowKey(w) === workflow) ?? null;
  // A team whose every step works in a folder looks at no repository, and the api refuses a card for one that names one: no box, and
  // nothing sent, whatever a person typed before picking it.
  const inFolders = picked?.folderTeam ?? false;
  const file = useMutation({
    mutationFn: () =>
      fileCard({
        body: idea,
        ...(picked ? { workflow: picked.name, from: picked.from } : {}),
        ...(!inFolders && about.trim() ? { repo: about.trim() } : {}),
      }),
    onSuccess: () => {
      setIdea('');
      setWorkflow('');
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
  const ids = { idea: useId(), workflow: useId(), repo: useId() };

  return (
    <form
      aria-label="File a card"
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
      onSubmit={(event) => {
        event.preventDefault();
        file.mutate();
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor={ids.idea} className="block text-sm font-medium">
          An idea
        </label>
        <textarea
          id={ids.idea}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          rows={3}
          placeholder="What it is about: its first line names the card, and the rest is its body."
          className={`${FIELD} resize-y`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <label htmlFor={ids.workflow} className="block text-sm font-medium">
            Workflow
          </label>
          <select id={ids.workflow} value={workflow} onChange={(event) => setWorkflow(event.target.value)} className={FIELD}>
            <option value="">None: chosen at start</option>
            {workflows.data && <WorkflowOptions workflows={workflows.data} />}
          </select>
          {workflows.error && (
            <p className="text-xs text-red-700 dark:text-red-400">Could not list the workflows: {workflows.error.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.repo} className="block text-sm font-medium">
            {inFolders ? 'Where its work goes' : 'Repository'}
          </label>
          {inFolders ? (
            <p data-in-folders className="text-xs text-neutral-600 dark:text-neutral-400">
              {picked!.name} works in folders the run makes for it, and looks at no repository. The card names none, and the run says where
              the work is.
            </p>
          ) : (
            <input
              id={ids.repo}
              value={about}
              onChange={(event) => setRepo(event.target.value)}
              placeholder="None: the repository its start names"
              className={`${FIELD} font-mono text-xs`}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!idea.trim() || file.isPending} className={PRIMARY}>
          {file.isPending ? 'Filing…' : 'File'}
        </button>
        <span className="text-xs text-neutral-500">Parked, not started: nothing runs until you start it.</span>
      </div>
      {file.isError && (
        <div data-refused className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Not filed. The api refused it:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{file.error.message}</p>
        </div>
      )}
    </form>
  );
}

/**
 * A card: its first line, linked to its page, its workflow and repository when it names them, and when it was filed; Start, which opens its
 * start form, and Remove. Queue on a card that names a workflow (`queueable`), and on a queued card its place and when it was queued, and
 * Unqueue; and, when the tick tried its start and did not make it, why — a card refused stays queued, as the package keeps it.
 * A card a run's record names — started, its removal failed — links to its run and offers Remove only. An entry that does not read as a card
 * shows why, and offers Remove when it is a card's file, which `wf inbox rm` can drop.
 *
 * A start from this page whose card could not be removed is kept (`kept`): the start form goes, since the card may not start again, and the
 * card says it was started as that run, with why its removal failed, in the api's words — which only the start's answer carries, so a later
 * visit says it was started, and not why.
 *
 * What its start or its drop was last refused with is the page's (`refusal`, told through `onRefused`), shown at its foot: the inbox is read
 * again after any answer, and a card refused because it is gone leaves the list, its refusal kept in its place (`GoneItem`).
 */
function CardItem({
  entry,
  entries,
  refusal,
  onRefused,
}: {
  entry: InboxEntry;
  /** The inbox as the page listed it, which says whether this entry has a page of its own (`hasPage`). */
  entries: readonly InboxEntry[];
  refusal: CardRefusal | null;
  onRefused: (refusal: Omit<CardRefusal, 'entry'> | null) => void;
}) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [kept, setKept] = useState<{ id: string; why: string } | null>(null);
  const remove = useMutation({
    mutationFn: () => dropCard(entry.name),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'remove', message: error.message }),
    // Whatever the answer: a card dropped behind the page's back — a 404 — leaves the list too.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  // Queued, or taken off the queue: read again whatever the answer, so a card queued or started behind the page's back — a 409 — reads as it is.
  const queue = useMutation({
    mutationFn: (off: boolean) => queueCard(entry.name, { off }),
    onMutate: () => onRefused(null),
    onError: (error, off) => onRefused({ action: off ? 'unqueue' : 'queue', message: error.message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  // The run a start just wrote, before the inbox is read again and names it.
  const startedAs = kept && !entry.startedAs.includes(kept.id) ? [...entry.startedAs, kept.id] : entry.startedAs;
  const started = startedAs.length > 0;
  const startable = !started && entry.error === null;

  return (
    <li
      aria-label={`Card ${entry.name}`}
      data-card={entry.name}
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1 space-y-1">
          {/* Its title opens its page: the body rendered and its keys explained — for a file that does not read too, with the file as written. A
              folder, a name the api refuses, or a stray file a card of the same name answers for has no page (`hasPage`), and is its name alone. */}
          {entry.error === null ? (
            <p data-title className="font-medium break-words">
              <PageLink entry={entry} entries={entries}>
                {entry.title}
              </PageLink>
            </p>
          ) : (
            <p className="font-mono text-sm break-all">
              <PageLink entry={entry} entries={entries}>
                {entry.file}
              </PageLink>
            </p>
          )}
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="font-mono">{entry.name}</span>
            {entry.workflow && (
              <span data-workflow={entry.workflow} title={entry.workflow}>
                workflow <span className="font-mono text-neutral-700 dark:text-neutral-300">{workflowNameOf(entry.workflow)}</span>
              </span>
            )}
            {entry.repo && (
              <span data-repo className="font-mono break-all">
                {entry.repo}
              </span>
            )}
            {entry.filedAt && (
              <time dateTime={entry.filedAt} title="When its file was last written">
                {new Date(entry.filedAt).toLocaleString()}
              </time>
            )}
          </p>
          {entry.queued && (
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-500">
              <span
                data-queued={entry.queued.place ?? ''}
                className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 font-medium text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
              >
                {queuedWord(entry.queued)}
              </span>
              <span>
                since{' '}
                <time data-queued-at dateTime={entry.queued.at} title="When it was queued: what orders the queue">
                  {new Date(entry.queued.at).toLocaleString()}
                </time>
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {startable && (
            <button
              type="button"
              aria-expanded={starting}
              onClick={() => setStarting(!starting)}
              className={starting ? SECONDARY : PRIMARY}
            >
              {starting ? 'Close' : 'Start'}
            </button>
          )}
          {queueable(entry) && (
            <button
              type="button"
              disabled={queue.isPending}
              onClick={() => queue.mutate(false)}
              className={SECONDARY}
              title="Start it on its own, on its workflow, when a run slot frees"
            >
              {queue.isPending ? 'Queueing…' : 'Queue'}
            </button>
          )}
          {entry.queued && (
            <button
              type="button"
              disabled={queue.isPending}
              onClick={() => queue.mutate(true)}
              className={SECONDARY}
              title="Take it off the queue: it waits for you to start it"
            >
              {queue.isPending ? 'Unqueueing…' : 'Unqueue'}
            </button>
          )}
          {entry.file.endsWith('.md') && (
            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()} className={SECONDARY}>
              {remove.isPending ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {started && (
        <p data-started-as className="text-sm text-amber-700 dark:text-amber-400">
          Started as{' '}
          {startedAs.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link to="/runs/$runId" params={{ runId: id }} className="font-mono underline underline-offset-2">
                {id}
              </Link>
            </span>
          ))}
          , and still here because its removal failed. Remove drops it; to run the idea again, file it again.
          {kept && (
            <span data-kept className="mt-1 block font-mono text-xs break-all">
              {kept.why}
            </span>
          )}
        </p>
      )}
      {entry.queued && entry.tried && <Tried entry={{ ...entry, tried: entry.tried }} />}
      {entry.error !== null && (
        <div className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Does not read as a card, so it cannot start:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{entry.error}</p>
        </div>
      )}
      {starting && startable && (
        <StartCard
          entry={entry}
          onKept={setKept}
          onRefused={(message) => onRefused(message === null ? null : { action: 'start', message })}
        />
      )}
      {refusal && <Refused refusal={refusal} />}
    </li>
  );
}

/** An entry's words, linked to its page where it has one among the entries listed with it (`hasPage`). */
function PageLink({ entry, entries, children }: { entry: InboxEntry; entries: readonly InboxEntry[]; children: ReactNode }) {
  if (!hasPage(entry, entries)) return <>{children}</>;
  return (
    <Link
      to="/inbox/$name"
      params={{ name: entry.name }}
      className="underline decoration-neutral-300 underline-offset-4 hover:decoration-current dark:decoration-neutral-600"
    >
      {children}
    </Link>
  );
}

/**
 * A card the inbox no longer lists, kept in its place for what its start or its drop was refused with: dropped or started behind the page's
 * back. Its first line and name, that it is gone, the refusal, and Dismiss, which takes the line away.
 */
function GoneItem({ entry, refusal, onDismiss }: { entry: InboxEntry; refusal: CardRefusal; onDismiss: () => void }) {
  return (
    <li
      aria-label={`Card ${entry.name}, no longer in the inbox`}
      data-gone={entry.name}
      className="space-y-3 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
    >
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1 space-y-1">
          <p data-title className="font-medium break-words text-neutral-500">
            {entry.title ?? entry.file}
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="font-mono">{entry.name}</span>
            <span>Gone from the inbox since this page listed it.</span>
          </p>
        </div>
        <button type="button" onClick={onDismiss} className={`${SECONDARY} shrink-0`}>
          Dismiss
        </button>
      </div>
      <Refused refusal={refusal} />
    </li>
  );
}

/**
 * The tick's last try of a queued card's start, which did not start it (`triedLine`): refused, in amber — it stays queued and waits for you; failed
 * otherwise, muted — the tick tries it again on the next pass.
 */
function Tried({ entry }: { entry: InboxEntry & { tried: NonNullable<InboxEntry['tried']> } }) {
  const { refused } = entry.tried;
  return (
    <p
      data-tried={refused ? 'refused' : 'failed'}
      className={`rounded border px-3 py-2 text-xs break-words ${refused ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200' : 'border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400'}`}
    >
      {triedLine(entry, new Date(entry.tried.at).toLocaleString())}
    </p>
  );
}

const NOT_DONE: Record<CardRefusal['action'], string> = {
  start: 'Not started',
  remove: 'Not removed',
  queue: 'Not queued',
  unqueue: 'Not taken off the queue',
};

/** What a start, a drop, a queue or its taking back was refused with, in the api's words. */
function Refused({ refusal }: { refusal: CardRefusal }) {
  return (
    <div
      data-refused={refusal.action}
      className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40"
    >
      <p className="text-sm font-medium text-red-800 dark:text-red-300">{NOT_DONE[refusal.action]}. The api refused it:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{refusal.message}</p>
    </div>
  );
}

/**
 * A card's start: the workflow, preset from the card and changeable, and `StartRun` with the brief prefilled from its body. A start the api
 * took opens the run's page — unless the card stayed in the inbox, which `onKept` is told of, with why, and the page stays. A refusal is
 * `onRefused`'s to show, since the form may not outlive it.
 */
function StartCard({
  entry,
  onKept,
  onRefused,
}: {
  entry: InboxEntry;
  onKept: (kept: { id: string; why: string }) => void;
  onRefused: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const workflows = useQuery(workflowsQuery);
  // The api's repository, whose workflows are listed: a name on a card about another is that one's, and presets none of these.
  const repository = useQuery(repositoryQuery);
  const here = repository.data?.repo;
  const [picked, setPicked] = useState<string | null>(null);
  const preset = workflows.data && here !== undefined ? presetOf(entry.workflow, entry.repo, here, workflows.data) : null;
  const key = picked ?? (preset ? workflowKey(preset) : '');
  const workflow = workflows.data?.find((w) => w.error === null && workflowKey(w) === key) ?? null;
  const field = useId();

  return (
    <div data-start-card className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <div className="space-y-1.5">
        <label htmlFor={field} className="block text-sm font-medium">
          Workflow
        </label>
        {workflows.error || repository.error ? (
          <p className="text-xs text-red-700 dark:text-red-400">
            Could not list the workflows to start it on: {(workflows.error ?? repository.error)!.message}
          </p>
        ) : !workflows.data || here === undefined ? (
          <p className="text-xs text-neutral-500">Reading the workflows…</p>
        ) : (
          <select id={field} value={key} onChange={(event) => setPicked(event.target.value)} className={`${FIELD} sm:max-w-xs`}>
            <option value="" disabled>
              Pick what runs it
            </option>
            <WorkflowOptions workflows={workflows.data} />
          </select>
        )}
        {entry.workflow && workflows.data && here !== undefined && !preset && (
          <p data-unlisted className="text-xs text-amber-700 dark:text-amber-400">
            {namedElsewhere(entry.workflow, entry.repo, here) ? (
              <>
                The card names {code(entry.workflow)}, a workflow of {code(entry.repo!)}, and the workflows here are {code(here)}&apos;s:
                pick the one to run it on, or start it with {code('wf start')}, which finds that one.
              </>
            ) : (
              <>The card names {code(entry.workflow)}, which is not a workflow here that reads: pick the one to run it on.</>
            )}
          </p>
        )}
      </div>
      {workflow && (
        <StartRun
          workflow={workflow}
          card={{ name: entry.name, body: entry.body ?? '' }}
          {...(entry.repo ? { repo: entry.repo } : {})}
          onStarted={(started) => {
            if (started.removed === false) onKept({ id: started.id, why: started.why ?? 'the api did not say why' });
            else void navigate({ to: '/runs/$runId', params: { runId: started.id } });
          }}
          onRefused={onRefused}
        />
      )}
    </div>
  );
}
