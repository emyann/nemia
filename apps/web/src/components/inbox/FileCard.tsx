/**
 * The box that files a card, on the Inbox page: the idea, and the factory it is filed in, picked from a list. With a factory, the workflows
 * are those it offers, by name, and the repository is the one its wiring gives the workflow picked, said and never picked; with none, the
 * idea is filed alone.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { factoriesQuery, type Factory } from '../../lib/api/factories.ts';
import { fileCard } from '../../lib/api/inbox.ts';
import { storeQuery } from '../../lib/api/store.ts';
import { keptBy, startRepo } from '../../lib/factories';
import { cardFiling, factoriesOffered, factoryPreset } from '../../lib/inbox';
import { Button, Select, SelectItem, TextField } from '@/components/ui/ds';
import { Reading, ReadingLines } from '@/components/look';

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
        <Button type="submit" isDisabled={!idea.trim() || file.isPending}>
          {file.isPending ? 'Filing…' : 'File'}
        </Button>
        <span className="text-body-small text-muted-foreground">Parked, not started: nothing runs until you start it.</span>
      </div>
      {filed && !keptBy(shown)(filed) && <Hidden name={filed.name} shown={shown!} />}
      {file.isError && <NotFiled message={file.error.message} />}
    </form>
  );
}

/** The key of the option that picks nothing: no factory's or workflow's name, which has no parentheses. */
const NONE = '(none)';

/** The idea's field: its first line names the card. */
function IdeaField({ idea, onIdea }: { idea: string; onIdea: (idea: string) => void }) {
  return (
    <TextField
      label="An idea"
      multiline
      value={idea}
      onChange={onIdea}
      placeholder="What it is about: its first line names the card, and the rest is its body."
    />
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
  return (
    <div className="space-y-1.5">
      <Select
        label="Factory"
        data-factory-field
        selectedKey={picked === '' ? NONE : picked}
        onSelectionChange={(key) => onPick(key === NONE || key === null ? '' : String(key))}
        className="@md/page:max-w-xs"
      >
        <SelectItem id={NONE} label="No factory: chosen at start" />
        {offered.map((f) => (
          <SelectItem key={f.name} id={f.name} label={f.name} />
        ))}
      </Select>
      {error && <p className="text-body-small text-failure">Could not list the factories: {error.message}</p>}
      {picked === '' && (
        <p data-parked className="text-body-small text-muted-foreground">
          Parked with no factory: it gets its factory, workflow and repository when you start it.
        </p>
      )}
      {!error && !read && (
        <div data-reading-factories>
          <Reading label="Reading the factories…">
            <ReadingLines widths={['w-64']} className="text-body-small" />
          </Reading>
        </div>
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
  const offered = factory.workflows ?? [];
  const on = picked === null ? null : startRepo(factory, picked);
  const [only, ...more] = factory.repos;
  return (
    <div className="grid gap-3 @md/page:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <Select
          label="Workflow"
          data-workflow-field
          selectedKey={picked === null || picked === '' ? NONE : picked}
          isDisabled={offered.length === 0}
          onSelectionChange={(key) => onWorkflow(key === NONE || key === null ? '' : String(key))}
        >
          <SelectItem id={NONE} label="None: chosen at start" />
          {offered.map((name) => (
            <SelectItem key={name} id={name} label={name} />
          ))}
        </Select>
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
