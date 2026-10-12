/**
 * The box that files a card, on the Inbox page: the idea, and the factory it is filed in, picked from a list. With a factory, the
 * repository is the factory's own and the workflows are those it offers there; with none, the idea is filed alone.
 */
import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { factoriesQuery, factoryWorkflowsQuery, fileCard, storeQuery, type Factory, type Place } from '../lib/api';
import { keptBy } from '../lib/factories';
import { cardFiling, factoriesOffered, factoryPreset, workflowKey } from '../lib/inbox';
import { PRIMARY } from './InboxParts';
import { FIELD, WorkflowOptions } from './WorkflowOptions';

const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

/** What the box's lists hold: the factory's name, `''` for none; the repository picked among several; and the workflow's key. */
type Picks = { factory: string; repo: string; workflow: string };

/**
 * The box: the idea, the Factory list (`FactoryField`) and, under a factory, where the card runs and on what (`InFactory`); File; then
 * the api's refusal in full, with the idea kept to send again, or a note for a card filed where the page's filter hides it (`Hidden`).
 *
 * `shown` is the factory the address names, which the list starts on when it is offered (`factoryPreset`), until a person picks. Picking
 * a factory forgets the repository and the workflow picked under the last one, and what is sent is what the lists offer now
 * (`cardFiling`): no repository a person did not choose.
 */
export function FileCard({ shown }: { shown: string | undefined }) {
  const queryClient = useQueryClient();
  const factories = useQuery(factoriesQuery);
  const offered = factoriesOffered(factories.data ?? []);
  const [idea, setIdea] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [repo, setRepo] = useState('');
  const [workflow, setWorkflow] = useState('');
  const [filed, setFiled] = useState<{ name: string; factory: string | null } | null>(null);
  const picks: Picks = { factory: chosen ?? factoryPreset(shown, offered), repo, workflow };
  const factory = offered.find((f) => f.name === picks.factory) ?? null;
  const place = placeOf(factory, repo);
  const workflows = useQuery({ ...factoryWorkflowsQuery(place ?? { factory: '', repo: '' }), enabled: place !== null });
  const listed = place === null ? [] : (workflows.data ?? []);
  const picked = listed.find((w) => w.error === null && workflowKey(w) === workflow) ?? null;
  const file = useMutation({
    mutationFn: () => fileCard(cardFiling({ idea, factory, repo, workflow: picked })),
    onMutate: () => setFiled(null),
    onSuccess: ({ name }) => {
      setIdea('');
      setWorkflow('');
      setFiled({ name, factory: factory?.name ?? null });
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });

  return (
    <form
      aria-label="File a card"
      className="space-y-3 rounded-lg border border-outline-variant bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        file.mutate();
      }}
    >
      <IdeaField idea={idea} onIdea={setIdea} />
      <FactoryField
        offered={offered}
        picked={picks.factory}
        error={factories.error}
        onPick={(name) => {
          setChosen(name);
          setRepo('');
          setWorkflow('');
        }}
      />
      {factory && (
        <InFactory factory={factory} picks={picks} onRepo={setRepo} onWorkflow={setWorkflow}>
          {workflows.error ? (
            <p className="text-xs text-failure">Could not list the workflows: {workflows.error.message}</p>
          ) : (
            place !== null && workflows.data && <WorkflowOptions workflows={workflows.data} />
          )}
        </InFactory>
      )}
      {picked?.folderTeam && (
        <p data-in-folders className="text-xs text-muted-foreground">
          {picked.name} works in folders the run makes for it, and looks at no repository: the card names none.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!idea.trim() || file.isPending} className={PRIMARY}>
          {file.isPending ? 'Filing…' : 'File'}
        </button>
        <span className="text-xs text-muted-foreground">Parked, not started: nothing runs until you start it.</span>
      </div>
      {filed && !keptBy(shown)(filed) && <Hidden name={filed.name} shown={shown!} />}
      {file.isError && <NotFiled message={file.error.message} />}
    </form>
  );
}

/** The idea's field: its first line names the card. */
function IdeaField({ idea, onIdea }: { idea: string; onIdea: (idea: string) => void }) {
  const field = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={field} className="block text-sm font-medium">
        An idea
      </label>
      <textarea
        id={field}
        value={idea}
        onChange={(event) => onIdea(event.target.value)}
        rows={3}
        placeholder="What it is about: its first line names the card, and the rest is its body."
        className={`${FIELD} resize-y`}
      />
    </div>
  );
}

/** What a filing was refused with, in the api's words. */
function NotFiled({ message }: { message: string }) {
  return (
    <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-sm font-medium text-on-failure-container">Not filed. The api refused it:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
    </div>
  );
}

/**
 * Where the factory's workflows are read for the box: on its only repository, or on the one picked among several; null with no
 * factory, and while a factory on several, or on none, has none to read them on.
 */
function placeOf(factory: Pick<Factory, 'name' | 'repos'> | null, repo: string): Place | null {
  if (factory === null) return null;
  const on = factory.repos.length === 1 ? factory.repos[0] : factory.repos.includes(repo) ? repo : null;
  return on === null ? null : { factory: factory.name, repo: on };
}

/**
 * The Factory list: "No factory" first, then each factory offered; under no factory, what that means for the card — and, when the store
 * has no factory to offer, the line that files one.
 */
function FactoryField({
  offered,
  picked,
  error,
  onPick,
}: {
  offered: readonly Pick<Factory, 'name'>[];
  picked: string;
  error: Error | null;
  onPick: (name: string) => void;
}) {
  const { data: store } = useQuery(storeQuery);
  const field = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={field} className="block text-sm font-medium">
        Factory
      </label>
      <select id={field} value={picked} onChange={(event) => onPick(event.target.value)} className={`${FIELD} sm:max-w-xs`}>
        <option value="">No factory: chosen at start</option>
        {offered.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-failure">Could not list the factories: {error.message}</p>}
      {picked === '' && (
        <p data-parked className="text-xs text-muted-foreground">
          Parked with no factory: it gets its factory, workflow and repository when you start it.
        </p>
      )}
      {!error && offered.length === 0 && store && (
        <p data-no-factory className="text-xs text-muted-foreground">
          The store has no factory yet: file one with {code(store.fileFactory)}.
        </p>
      )}
    </div>
  );
}

/**
 * Under a factory: its repository, said as text when it has one and picked from a list when it has several, "None: chosen at start"
 * first and nothing preset; and its Workflow list, whose options are `children`, once the repository they are read on is known.
 */
function InFactory({
  factory,
  picks,
  onRepo,
  onWorkflow,
  children,
}: {
  factory: Pick<Factory, 'name' | 'repos'>;
  picks: Picks;
  onRepo: (repo: string) => void;
  onWorkflow: (key: string) => void;
  children: ReactNode;
}) {
  const ids = { repo: useId(), workflow: useId() };
  const several = factory.repos.length > 1;
  const known = placeOf(factory, picks.repo) !== null;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <label htmlFor={ids.workflow} className="block text-sm font-medium">
          Workflow
        </label>
        <select
          id={ids.workflow}
          value={known ? picks.workflow : ''}
          disabled={!known}
          onChange={(event) => onWorkflow(event.target.value)}
          className={`${FIELD} disabled:cursor-not-allowed`}
        >
          <option value="">None: chosen at start</option>
          {children}
        </select>
        {!known && several && (
          <p data-needs-repo className="text-xs text-muted-foreground">
            Pick a repository to choose among the workflows {code(factory.name)} offers on it.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        {several ? (
          <>
            <label htmlFor={ids.repo} className="block text-sm font-medium">
              Repository
            </label>
            <select
              id={ids.repo}
              value={factory.repos.includes(picks.repo) ? picks.repo : ''}
              onChange={(event) => {
                onRepo(event.target.value);
                onWorkflow('');
              }}
              className={`${FIELD} font-mono text-xs`}
            >
              <option value="">None: chosen at start</option>
              {factory.repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Repository</p>
            <p data-factory-repo className="py-1.5 font-mono text-xs break-all text-muted-foreground">
              {factory.repos[0] ?? `${factory.name} names no repository.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** The note for a card just filed that the page's filter, on the factory `shown`, does not list: its name, and the way to see it. */
function Hidden({ name, shown }: { name: string; shown: string }) {
  return (
    <p data-filed-hidden className="text-xs text-muted-foreground">
      Filed as <span className="font-mono">{name}</span>, which the cards below, of the factory <span className="font-mono">{shown}</span>,
      do not list.{' '}
      <Link to="/inbox" search={{}} replace className="underline underline-offset-2">
        Show every factory&apos;s
      </Link>
      .
    </p>
  );
}
