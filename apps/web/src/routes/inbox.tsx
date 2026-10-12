import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FactoryCardStart } from '../components/FactoryCardStart';
import { CardMeta, GoneItem, PageLink, PRIMARY, Refused, SECONDARY, Tried } from '../components/InboxParts';
import { CardFrom } from '../components/CardFrom';
import { StartRun } from '../components/StartRun';
import { FIELD, WorkflowOptions } from '../components/WorkflowOptions';
import { dropCard, fileCard, inboxQuery, queueCard, repositoryQuery, workflowsQuery, type InboxEntry, type Started } from '../lib/api';
import { factorySearch, keptBy, shownIn } from '../lib/factories';
import {
  cardLines,
  namedElsewhere,
  newestCardsFirst,
  presetOf,
  queueable,
  queuedWord,
  queueOf,
  workflowKey,
  type CardRefusal,
} from '../lib/inbox';

export const Route = createFileRoute('/inbox')({
  validateSearch: factorySearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(inboxQuery),
  component: InboxPage,
  errorComponent: ({ error }) => (
    <p className="text-sm text-failure">
      Could not load the inbox: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

/**
 * The inbox: a box that files a card, and the cards, newest first, each startable and removable. The page keeps what a start or a drop was
 * refused with, by card, since the inbox is read again after each answer: a card gone behind the page's back leaves the list, and its
 * refusal stays where it was listed until dismissed. A refusal is kept by the entry's file, as `cardLines` matches them: a card and a stray
 * file beside it answer to one name, and a refusal is of one of them.
 *
 * Every factory's cards are listed, each tagged with its own; the factory the sidebar picks, kept in the address as `?factory=<name>`,
 * keeps only its own: the counts are of the cards it keeps, and a factory that keeps none says so and how to show every factory's.
 */
function InboxPage() {
  const { data: entries } = useSuspenseQuery(inboxQuery);
  const { factory } = Route.useSearch();
  const [refusals, setRefusals] = useState<CardRefusal[]>([]);
  const all = newestCardsFirst(entries);
  const cards = shownIn(all, factory);
  const queue = queueOf(cards).length;
  const lines = cardLines(entries, refusals).filter(({ entry }) => keptBy(factory)(entry));
  const refusalFor = (entry: InboxEntry) => (refusal: Omit<CardRefusal, 'entry'> | null) =>
    setRefusals((kept) => [...kept.filter((r) => r.entry.file !== entry.file), ...(refusal ? [{ ...refusal, entry }] : [])]);

  return (
    <article className="space-y-6">
      <p className="text-sm text-muted-foreground">
        An idea parked as a card until you start a workflow on it: a file each in the store&apos;s {code('inbox/')}, as the box below or the
        command line parks one. Starting a card writes its run&apos;s record as any start does, and removes the card. A card queued starts
        on its own, on the workflow it names, when the daemon — this api, or the command line&apos;s — has a run slot free: the oldest
        queued first.
      </p>
      <FileCard />
      <section aria-label="Cards" className="space-y-3">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold">
          Cards{' '}
          <span data-count className="text-xs font-normal text-muted-foreground">
            {cards.length}
          </span>
          {queue > 0 && (
            <span data-queue-count className="text-xs font-normal text-muted-foreground">
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
        {cards.length === 0 && all.length > 0 && (
          <p data-filtered-out className="text-sm text-muted-foreground">
            No card of the factory <span className="font-mono">{factory}</span>.{' '}
            <Link to="/inbox" search={{}} replace className="underline underline-offset-2">
              Show every factory&apos;s
            </Link>
            .
          </p>
        )}
        {all.length === 0 && (
          <p data-empty className="text-sm text-muted-foreground">
            The inbox is empty. File an idea in the box above, or from the command line.
          </p>
        )}
      </section>
    </article>
  );
}

/**
 * The box that files a card, as the CLI's `inbox add "<idea>" --workflow <name> --repo <path>` does: the idea; what runs it, when it is
 * known; and the repository it is about, the api's own until a person changes it — empty, for a card that names none. Then the api's
 * refusal in full, with the idea kept to send again. A workflow whose every step works in a folder (`folderTeam`) looks at no repository,
 * and the api refuses a card for one that names one: once it is picked, the box goes, and no repository is sent, whatever a person typed
 * before.
 */
function FileCard() {
  const queryClient = useQueryClient();
  const workflows = useQuery(workflowsQuery);
  const repository = useQuery(repositoryQuery);
  const [idea, setIdea] = useState('');
  const [workflow, setWorkflow] = useState('');
  const [repo, setRepo] = useState<string | null>(null);
  const about = repo ?? repository.data?.repo ?? '';
  const picked = workflows.data?.find((w) => workflowKey(w) === workflow) ?? null;
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
      className="space-y-3 rounded-lg border border-outline-variant bg-card p-4 shadow-sm"
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
          {workflows.error && <p className="text-xs text-failure">Could not list the workflows: {workflows.error.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.repo} className="block text-sm font-medium">
            {inFolders ? 'Where its work goes' : 'Repository'}
          </label>
          {inFolders ? (
            <p data-in-folders className="text-xs text-muted-foreground">
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
        <span className="text-xs text-muted-foreground">Parked, not started: nothing runs until you start it.</span>
      </div>
      {file.isError && (
        <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <p className="text-sm font-medium text-on-failure-container">Not filed. The api refused it:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{file.error.message}</p>
        </div>
      )}
    </form>
  );
}

/**
 * A card: its first line, linked to its page, and under it its name, factory, workflow, repository and filing time (`CardMeta`); Start,
 * which opens its start form, and Remove. Queue on a card that names a workflow (`queueable`), and on a queued card its place and when it
 * was queued, and Unqueue; and, when the tick tried its start and did not make it, why — a card refused stays queued, as the package keeps
 * it. A card a run's record names — started, its removal failed — links to its run and offers Remove only. An entry that does not read as a
 * card shows why, with its file for a title, and offers Remove when it is a card's file, which the CLI's `inbox rm` can drop.
 *
 * Its page shows the body rendered and its keys explained, and for a file that does not read, the file as written. A folder, a name the api
 * refuses, or a stray file a card of the same name answers for has no page (`hasPage`), and its title is its name alone.
 *
 * A start from this page whose card could not be removed is kept (`kept`): the start form goes, since the card may not start again, and the
 * card says it was started as that run, before the inbox is read again and names it, with why its removal failed, in the api's words —
 * which only the start's answer carries, so a later visit says it was started, and not why.
 *
 * What its start, drop, queue or unqueue was last refused with is the page's (`refusal`, told through `onRefused`), shown at its foot.
 * Remove, Queue and Unqueue read the inbox again whatever the answer, so a card dropped, queued or started behind the page's back reads as
 * it is; a card refused because it is gone leaves the list, its refusal kept in its place (`GoneItem`).
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
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const queue = useMutation({
    mutationFn: (off: boolean) => queueCard(entry.name, { off }),
    onMutate: () => onRefused(null),
    onError: (error, off) => onRefused({ action: off ? 'unqueue' : 'queue', message: error.message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const startedAs = kept && !entry.startedAs.includes(kept.id) ? [...entry.startedAs, kept.id] : entry.startedAs;
  const started = startedAs.length > 0;
  const startable = !started && entry.error === null;

  return (
    <li
      aria-label={`Card ${entry.name}`}
      data-card={entry.name}
      className="space-y-3 rounded-lg border border-outline-variant bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1 space-y-1">
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
          <CardMeta entry={entry} />
          <CardFrom entry={entry} editable={startable} onRefused={onRefused} />
          {entry.queued && (
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span
                data-queued={entry.queued.place ?? ''}
                className="rounded-full border border-outline-variant bg-surface-container-highest px-2 py-0.5 font-medium text-on-surface-variant"
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

      {started && <StartedAs startedAs={startedAs} kept={kept} />}
      {entry.queued && entry.tried && <Tried entry={{ ...entry, tried: entry.tried }} />}
      {entry.error !== null && (
        <div className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <p className="text-sm font-medium text-on-failure-container">Does not read as a card, so it cannot start:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{entry.error}</p>
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

/** The runs a card still in the inbox was started as, each linked, and why its removal failed where this page was told (`kept`). */
function StartedAs({ startedAs, kept }: { startedAs: readonly string[]; kept: { why: string } | null }) {
  return (
    <p data-started-as className="text-sm text-yours">
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
  );
}

/**
 * A card's start: in the factory it names (`FactoryCardStart`), or, for a card of the default factory, on the api's repository
 * (`StartHere`). A start the api took opens the run's page — unless the card stayed in the inbox, which `onKept` is told of, with why, and
 * the page stays. A refusal is `onRefused`'s to show, since the form may not outlive it.
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
  const onStarted = (started: Started) => {
    if (started.removed === false) onKept({ id: started.id, why: started.why ?? 'the api did not say why' });
    else void navigate({ to: '/runs/$runId', params: { runId: started.id } });
  };
  return entry.factory !== null && entry.factory !== 'default' ? (
    <FactoryCardStart entry={entry} onStarted={onStarted} onRefused={onRefused} />
  ) : (
    <StartHere entry={entry} onStarted={onStarted} onRefused={onRefused} />
  );
}

/**
 * A card's start on the api's repository: the workflow, preset from the card and changeable, and `StartRun` with the brief prefilled from
 * its body. The workflows listed are those of the api's repository: a card about another repository names a workflow of that one, and
 * presets none of these.
 */
function StartHere({
  entry,
  onStarted,
  onRefused,
}: {
  entry: InboxEntry;
  onStarted: (started: Started) => void;
  onRefused: (message: string | null) => void;
}) {
  const workflows = useQuery(workflowsQuery);
  const repository = useQuery(repositoryQuery);
  const here = repository.data?.repo;
  const [picked, setPicked] = useState<string | null>(null);
  const preset = workflows.data && here !== undefined ? presetOf(entry.workflow, entry.repo, here, workflows.data) : null;
  const key = picked ?? (preset ? workflowKey(preset) : '');
  const workflow = workflows.data?.find((w) => w.error === null && workflowKey(w) === key) ?? null;
  const field = useId();

  return (
    <div data-start-card className="space-y-3 border-t border-outline-variant pt-4">
      <div className="space-y-1.5">
        <label htmlFor={field} className="block text-sm font-medium">
          Workflow
        </label>
        {workflows.error || repository.error ? (
          <p className="text-xs text-failure">
            Could not list the workflows to start it on: {(workflows.error ?? repository.error)!.message}
          </p>
        ) : !workflows.data || here === undefined ? (
          <p className="text-xs text-muted-foreground">Reading the workflows…</p>
        ) : (
          <select id={field} value={key} onChange={(event) => setPicked(event.target.value)} className={`${FIELD} sm:max-w-xs`}>
            <option value="" disabled>
              Pick what runs it
            </option>
            <WorkflowOptions workflows={workflows.data} />
          </select>
        )}
        {entry.workflow && workflows.data && here !== undefined && !preset && (
          <p data-unlisted className="text-xs text-yours">
            {namedElsewhere(entry.workflow, entry.repo, here) ? (
              <>
                The card names {code(entry.workflow)}, a workflow of {code(entry.repo!)}, and the workflows here are {code(here)}&apos;s:
                pick the one to run it on, or start it from the command line, which finds that one.
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
          onStarted={onStarted}
          onRefused={onRefused}
        />
      )}
    </div>
  );
}
