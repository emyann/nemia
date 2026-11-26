/**
 * The box that files a card, on the Inbox page: the idea, and the factory it is filed in, picked from a list. With a factory, the workflows
 * are those it offers, by name, and the repository is the one its wiring gives the workflow picked, said and never picked; with none, the
 * idea is filed alone. Files dropped, chosen or pasted are carried by the card, each uploaded first.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { factoriesQuery, type Factory } from '../../lib/api/factories.ts';
import { fileCard } from '../../lib/api/inbox.ts';
import { storeQuery } from '../../lib/api/store.ts';
import { keptBy, startRepo } from '../../lib/factories';
import { cardFiling, factoriesOffered, factoryPreset } from '../../lib/inbox';
import { Body, Select, SelectItem, TextField } from '@/components/ui/ds';
import { Reading, ReadingLines, CutPress } from '@/components/look';
import { CARD_FILES_MOST } from 'objects';
import { sayWritten } from '@/lib/written';
import { inputsAdded } from '@/lib/startInputs';
import { StartInputs } from '../run/StartInputs';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** A command or a name in mono, at the size of the small body it is said in. */
const code = (text: string) => <code className="font-mono">{text}</code>;

/**
 * The box: the idea, the Factory list (`FactoryField`) and, under a factory, the workflow it runs and the repository the factory gives it
 * (`InFactory`); File; once filed, the frame's snackbar names the card and offers Open, to its page; then the api's refusal in full, with
 * the idea kept to send again, or a note for a card filed where the page's filter hides it (`Hidden`).
 *
 * `shown` is the factory the address names, which the list starts on when it is offered (`factoryPreset`), until a person picks. Picking
 * a factory forgets the workflow picked under the last one, and what is sent is what the lists offer now (`cardFiling`): the factory and
 * the workflow's name, never a repository nor an origin — the factory places the card's run.
 */
export function FileCard({ shown }: { shown: string | undefined }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const factories = useQuery(factoriesQuery);
  const offered = factoriesOffered(factories.data ?? []);
  const [idea, setIdea] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState('');
  const [filed, setFiled] = useState<{ name: string; factory: string | null } | null>(null);
  const [given, setGiven] = useState<File[]>([]);
  const factory = offered.find((f) => f.name === (chosen ?? factoryPreset(shown, offered))) ?? null;
  const picked = factory?.workflows?.includes(workflow) ? workflow : null;
  const file = useMutation({
    mutationFn: () => fileCard({ ...cardFiling({ idea, factory, workflow: picked }), given }),
    onMutate: () => setFiled(null),
    onSuccess: ({ name }) => {
      setIdea('');
      setWorkflow('');
      setGiven([]);
      setFiled({ name, factory: factory?.name ?? null });
      sayWritten('filed', name, () => void navigate({ to: '/inbox/$name', params: { name } }));
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });

  return (
    <form
      aria-label="File a card"
      className="space-y-3 rounded-lg border border-outline-variant bg-surface-container-low p-4 shadow-sm"
      onPaste={(event) => {
        const pasted = [...event.clipboardData.files];
        if (pasted.length > 0) setGiven(inputsAdded(given, pasted));
      }}
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
      <StartInputs
        label="Files the card carries"
        note={`A picture its text names, ![shot](shot.png), is shown on its page. ${CARD_FILES_MOST} files at most.`}
        files={given}
        onChange={setGiven}
        isDisabled={file.isPending}
      />
      <div className="flex flex-wrap items-center gap-3">
        <CutPress pending={file.isPending} type="submit" isDisabled={!idea.trim() || file.isPending}>
          {file.isPending ? 'Filing…' : 'File'}
        </CutPress>
        <Body size="small" component="span">
          Parked, not started: nothing runs until you start it.
        </Body>
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
      <Body size="medium" className="font-medium text-on-failure-container">
        Not filed. The api refused it:
      </Body>
      <Body size="small" className="font-mono whitespace-pre-wrap break-words text-on-failure-container">
        {message}
      </Body>
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
        placeholder="No factory: chosen at start"
        value={picked === '' ? null : picked}
        onChange={(key) => onPick(key === NONE || key === null ? '' : String(key))}
        className="@md/page:max-w-xs"
      >
        <SelectItem id={NONE} label="No factory: chosen at start" />
        {offered.map((f) => (
          <SelectItem key={f.name} id={f.name} label={f.name} />
        ))}
      </Select>
      {error && <ReadTrouble what="the factories" error={error} size="small" />}
      {picked === '' && (
        <Body size="small" data-parked>
          Parked with no factory: it gets its factory, workflow and repository when you start it.
        </Body>
      )}
      {!error && !read && (
        <Body size="small" component="div" data-reading-factories>
          <Reading label="Reading the factories…">
            <ReadingLines widths={['w-64']} />
          </Reading>
        </Body>
      )}
      {!error && read && offered.length === 0 && store && (
        <Body size="small" data-no-factory>
          The store has no factory yet: file one with {code(store.fileFactory)}.
        </Body>
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
  const [only, ...more] = factory.worksOn;
  return (
    <div className="grid gap-3 @md/page:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <Select
          label="Workflow"
          data-workflow-field
          placeholder="None: chosen at start"
          value={picked === null || picked === '' ? null : picked}
          isDisabled={offered.length === 0}
          onChange={(key) => onWorkflow(key === NONE || key === null ? '' : String(key))}
        >
          <SelectItem id={NONE} label="None: chosen at start" />
          {offered.map((name) => (
            <SelectItem key={name} id={name} label={name} />
          ))}
        </Select>
        {offered.length === 0 && (
          <Body size="small" data-no-workflow>
            {code(factory.name)} offers no workflow yet: attach one with {code(factory.commands.attach)}.
          </Body>
        )}
      </div>
      <div className="space-y-1.5">
        <Body size="medium" className="font-medium">
          Repository
        </Body>
        {on !== null && 'why' in on ? (
          <Body size="small" data-unwired={on.refused} className="break-words text-yours">
            {on.why}
          </Body>
        ) : (
          <Body size="small" colorRole="on-surface-variant" data-factory-repo className="py-1.5 font-mono break-all">
            {on !== null
              ? on.repo
              : only !== undefined && !more.length
                ? only
                : only === undefined
                  ? `${factory.name} has no volume to work on: ${factory.commands.volume}`
                  : `The factory's, for the workflow its start runs.`}
          </Body>
        )}
      </div>
    </div>
  );
}

/** The note for a card just filed that the page's filter, on the factory `shown`, does not list: its name, and the way to see it. */
function Hidden({ name, shown }: { name: string; shown: string }) {
  return (
    <Body size="small" data-filed-hidden>
      Filed as <span className="font-mono">{name}</span>, which the cards below, of the factory <span className="font-mono">{shown}</span>,
      do not list.{' '}
      <Link to="/inbox" search={{}} replace className="underline underline-offset-2">
        Show every factory&apos;s
      </Link>
      .
    </Body>
  );
}
