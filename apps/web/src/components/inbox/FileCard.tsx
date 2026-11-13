/**
 * The box that files a card, on the Inbox page: the idea, and the factory it is filed in, picked from a list. With a factory, the workflows
 * are those it offers, by name, and the repository is the one its wiring gives the workflow picked, said and never picked; with none, the
 * idea is filed alone.
 */
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { factoriesQuery, type Factory } from '../../lib/api/factories.ts';
import { fileCard } from '../../lib/api/inbox.ts';
import { storeQuery } from '../../lib/api/store.ts';
import { keptBy, startRepo } from '../../lib/factories';
import { cardFiling, factoriesOffered, factoryPreset } from '../../lib/inbox';
import { FIELD } from '../workflow/WorkflowOptions';
import { BUTTON } from '../../lib/classes';

const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;

/**
 * The box: the idea, the Factory list (`FactoryField`) and, under a factory, the workflow it runs and the repository the factory gives it
 * (`InFactory`); File; then the api's refusal in full, with the idea kept to send again, or a note for a card filed where the page's
 * filter hides it (`Hidden`).
 *
 * `shown` is the factory the address names, which the list starts on when it is offered (`factoryPreset`), until a person picks. Picking
 * a factory forgets the workflow picked under the last one, and what is sent is what the lists offer now (`cardFiling`): the factory and
 * the workflow's name, never a repository nor an origin — the factory places the card's run.
 */
export function FileCard({ shown }: { shown: string | undefined }) {
  const queryClient = useQueryClient();
  const factories = useQuery(factoriesQuery);
  const offered = factoriesOffered(factories.data ?? []);
  const [idea, setIdea] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState('');
  const [filed, setFiled] = useState<{ name: string; factory: string | null } | null>(null);
  const factory = offered.find((f) => f.name === (chosen ?? factoryPreset(shown, offered))) ?? null;
  const picked = factory?.workflows?.includes(workflow) ? workflow : null;
  const file = useMutation({
    mutationFn: () => fileCard(cardFiling({ idea, factory, workflow: picked })),
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
        read={factories.data !== undefined}
        picked={factory?.name ?? ''}
        error={factories.error}
        onPick={(name) => {
          setChosen(name);
          setWorkflow('');
        }}
      />
      {factory && <InFactory factory={factory} picked={picked} onWorkflow={setWorkflow} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!idea.trim() || file.isPending} className={BUTTON}>
          {file.isPending ? 'Filing…' : 'File'}
        </button>
        <span className="text-body-small text-muted-foreground">Parked, not started: nothing runs until you start it.</span>
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
      <label htmlFor={field} className="block text-body-medium font-medium">
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
      <p className="text-body-medium font-medium text-on-failure-container">Not filed. The api refused it:</p>
      <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
    </div>
  );
}

/**
 * The Factory list: "No factory" first, then each factory offered; under no factory, what that means for the card. Until the factories
 * are read (`read`), that they are being read; once read, when the store has none to offer, the line that files one.
 */
function FactoryField({
  offered,
  read,
  picked,
  error,
  onPick,
}: {
  offered: readonly Pick<Factory, 'name'>[];
  read: boolean;
  picked: string;
  error: Error | null;
  onPick: (name: string) => void;
}) {
  const { data: store } = useQuery(storeQuery);
  const field = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={field} className="block text-body-medium font-medium">
        Factory
      </label>
      <select id={field} value={picked} onChange={(event) => onPick(event.target.value)} className={`${FIELD} @md/page:max-w-xs`}>
        <option value="">No factory: chosen at start</option>
        {offered.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>
      {error && <p className="text-body-small text-failure">Could not list the factories: {error.message}</p>}
      {picked === '' && (
        <p data-parked className="text-body-small text-muted-foreground">
          Parked with no factory: it gets its factory, workflow and repository when you start it.
        </p>
      )}
      {!error && !read && (
        <p data-reading-factories className="text-body-small text-muted-foreground">
          Reading the factories…
        </p>
      )}
      {!error && read && offered.length === 0 && store && (
        <p data-no-factory className="text-body-small text-muted-foreground">
          The store has no factory yet: file one with {code(store.fileFactory)}.
        </p>
      )}
    </div>
  );
}

/**
 * Under a factory: its Workflow list, the workflows it offers by name, "None: chosen at start" first and nothing preset; and its
 * repository, said as text and never picked: the one its wiring gives the workflow picked (`startRepo`), or why it gives none, naming
 * the attach; with no workflow picked, its only one, or that the workflow picked at start decides.
 */
function InFactory({ factory, picked, onWorkflow }: { factory: Factory; picked: string | null; onWorkflow: (name: string) => void }) {
  const field = useId();
  const offered = factory.workflows ?? [];
  const on = picked === null ? null : startRepo(factory, picked);
  const [only, ...more] = factory.repos;
  return (
    <div className="grid gap-3 @md/page:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <label htmlFor={field} className="block text-body-medium font-medium">
          Workflow
        </label>
        <select
          id={field}
          value={picked ?? ''}
          disabled={offered.length === 0}
          onChange={(event) => onWorkflow(event.target.value)}
          className={`${FIELD} disabled:cursor-not-allowed`}
        >
          <option value="">None: chosen at start</option>
          {offered.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {offered.length === 0 && (
          <p data-no-workflow className="text-body-small text-muted-foreground">
            {code(factory.name)} offers no workflow yet: attach one with {code(factory.commands.attach)}.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="text-body-medium font-medium">Repository</p>
        {on !== null && 'why' in on ? (
          <p data-unwired={on.refused} className="text-body-small break-words text-yours">
            {on.why}
          </p>
        ) : (
          <p data-factory-repo className="py-1.5 font-mono text-body-small break-all text-muted-foreground">
            {on !== null
              ? on.repo
              : only !== undefined && !more.length
                ? only
                : only === undefined
                  ? `${factory.name} names no repository.`
                  : `The factory's, for the workflow its start runs.`}
          </p>
        )}
      </div>
    </div>
  );
}

/** The note for a card just filed that the page's filter, on the factory `shown`, does not list: its name, and the way to see it. */
function Hidden({ name, shown }: { name: string; shown: string }) {
  return (
    <p data-filed-hidden className="text-body-small text-muted-foreground">
      Filed as <span className="font-mono">{name}</span>, which the cards below, of the factory <span className="font-mono">{shown}</span>,
      do not list.{' '}
      <Link to="/inbox" search={{}} replace className="underline underline-offset-2">
        Show every factory&apos;s
      </Link>
      .
    </p>
  );
}
