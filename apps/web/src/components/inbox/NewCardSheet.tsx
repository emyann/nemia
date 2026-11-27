import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { CARD_FILES_MOST } from 'objects';
import { Body, Checkbox, IconButton, SideSheet } from '@/components/ui/ds';
import { CutComboBox, CutPress, CutSelect, CutTextArea, CutTextField } from '@/components/look';
import { factoriesQuery } from '@/lib/api/factories';
import { fileCard, inboxPageQuery, queueCard } from '@/lib/api/inbox';
import { cardFiling, factoriesOffered, factoryPreset } from '@/lib/inbox';
import { inputsAdded } from '@/lib/startInputs';
import { sayWritten } from '@/lib/written';
import { StartInputs } from '../run/StartInputs';

/** What a card is filed with: its first line, the title, and below it the details. */
const bodyOf = (title: string, details: string) => (details.trim() === '' ? title.trim() : `${title.trim()}\n\n${details.trim()}`);

/** A list of what was added to the card, each with the key that takes it off: the cards it runs after, the labels it carries. */
function Added({ label, items, onRemove }: { label: string; items: readonly string[]; onRemove: (item: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-1">
          <Body size="small" component="span" className="font-mono">
            {item}
          </Body>
          <IconButton size="xsmall" variant="standard" icon={X} aria-label={`Take ${item} off`} onPress={() => onRemove(item)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The form of a new card, in the side sheet: its title and details, the factory and workflow it runs in, the cards it runs after (found
 * by their words), its labels (suggested from those in use, with how many cards hold each), its files, and whether it starts once it
 * is filed. File card is the one filled press. `shown` is the factory the page is of, which the form starts on; `onDone` closes the
 * sheet. Filed, the snackbar names the card and offers Open; a refusal stays in the form, in the api's words.
 */
function NewCardForm({ shown, onDone }: { shown: string | undefined; onDone: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const factories = useQuery(factoriesQuery);
  const offered = factoriesOffered(factories.data ?? []);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState('');
  const [after, setAfter] = useState<string[]>([]);
  const [afterText, setAfterText] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelText, setLabelText] = useState('');
  const [given, setGiven] = useState<File[]>([]);
  const [starts, setStarts] = useState(false);
  const factory = offered.find((f) => f.name === (chosen ?? factoryPreset(shown, offered))) ?? null;
  const picked = factory?.workflows?.includes(workflow) ? workflow : null;
  const found = useQuery({ ...inboxPageQuery({ fieldSelector: 'status.inPlay=true', search: afterText, limit: 8 }), enabled: afterText.trim() !== '' }).data;
  const inUse = useQuery(inboxPageQuery({ limit: 1 })).data?.labels ?? [];
  const file = useMutation({
    mutationFn: async () => {
      const filed = await fileCard({ ...cardFiling({ idea: bodyOf(title, details), factory, workflow: picked }), label: labels, after, given });
      if (starts && factory !== null && picked !== null) await queueCard({ name: filed.name, factory: factory.name });
      return { ...filed, started: starts && factory !== null && picked !== null };
    },
    onSuccess: ({ name, started }) => {
      sayWritten(started ? 'started' : 'filed', name, () => void navigate({ to: '/inbox/$name', params: { name } }));
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
      onDone();
    },
  });
  const labelSuggestions = inUse
    .filter((l) => !labels.includes(`${l.key}=${l.value}`) && `${l.key}=${l.value}`.includes(labelText.trim().toLowerCase()))
    .slice(0, 8)
    .map((l) => ({ id: `${l.key}=${l.value}`, label: `${l.key}: ${l.value}`, hint: String(l.cards) }));
  const cardSuggestions = (found?.entries ?? []).filter((e) => !after.includes(e.name)).map((e) => ({ id: e.name, label: e.title ?? e.name, hint: e.name }));
  const addLabel = (label: string) => {
    setLabelText('');
    if (/^[^=\s]+=\S+$/.test(label) && !labels.includes(label)) setLabels([...labels, label]);
  };
  return (
    <form
      aria-label="New card"
      className="flex flex-col gap-4"
      onPaste={(event) => {
        const pasted = [...event.clipboardData.files];
        if (pasted.length > 0) setGiven(inputsAdded(given, pasted));
      }}
      onSubmit={(event) => {
        event.preventDefault();
        file.mutate();
      }}
    >
      <CutTextField label="Title" value={title} onChange={setTitle} isRequired autoFocus />
      <CutTextArea label="Details" value={details} onChange={setDetails} placeholder="What it is about." />
      <CutSelect
        label="Factory"
        value={factory?.name ?? ''}
        onChange={(name) => {
          setChosen(name);
          setWorkflow('');
        }}
        choices={[{ id: '', label: 'No factory: chosen at start' }, ...offered.map((f) => ({ id: f.name, label: f.name }))]}
        placeholder="No factory: chosen at start"
      />
      {factory && (
        <CutSelect
          label="Workflow"
          value={picked ?? ''}
          onChange={setWorkflow}
          isDisabled={(factory.workflows ?? []).length === 0}
          choices={[{ id: '', label: 'None: chosen at start' }, ...(factory.workflows ?? []).map((name) => ({ id: name, label: name }))]}
          placeholder="None: chosen at start"
        />
      )}
      <div className="flex flex-col gap-2">
        <CutComboBox
          label="Run it after"
          text={afterText}
          onText={setAfterText}
          suggestions={cardSuggestions}
          onPick={(name) => {
            setAfterText('');
            setAfter([...after, name]);
          }}
          onSubmit={(name) => {
            setAfterText('');
            setAfter([...after, name]);
          }}
          placeholder="Find a card by its words"
        />
        <Added label="Runs after" items={after} onRemove={(name) => setAfter(after.filter((n) => n !== name))} />
      </div>
      <div className="flex flex-col gap-2">
        <CutComboBox
          label="Labels"
          text={labelText}
          onText={setLabelText}
          suggestions={labelSuggestions}
          onPick={addLabel}
          onSubmit={addLabel}
          placeholder="key=value"
        />
        <Added label="Labels" items={labels} onRemove={(label) => setLabels(labels.filter((l) => l !== label))} />
      </div>
      <StartInputs
        label="Files the card carries"
        note={`A picture its text names, ![shot](shot.png), is shown on its page. ${CARD_FILES_MOST} files at most.`}
        files={given}
        onChange={setGiven}
        isDisabled={file.isPending}
      />
      <Checkbox isSelected={starts} onChange={setStarts} isDisabled={factory === null || picked === null}>
        Start it once it is filed
      </Checkbox>
      {file.isError && (
        <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <Body size="medium" className="font-medium text-on-failure-container">
            Not filed. The api refused it:
          </Body>
          <Body size="small" className="font-mono whitespace-pre-wrap break-words text-on-failure-container">
            {file.error.message}
          </Body>
        </div>
      )}
      <div className="flex items-center gap-3">
        <CutPress pending={file.isPending} type="submit" isDisabled={title.trim() === '' || file.isPending}>
          {file.isPending ? 'Filing…' : 'File card'}
        </CutPress>
      </div>
    </form>
  );
}

/**
 * The page's New card: the one filled press of the Inbox, which opens the new card's side sheet (`NewCardForm`). `factory` is the factory
 * the page is of, where it is a factory's.
 */
export function NewCard({ factory }: { factory?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CutPress onPress={() => setOpen(true)} data-new-card="">
        New card
      </CutPress>
      <SideSheet variant="modal" title="New card" isOpen={open} onClose={() => setOpen(false)}>
        {open && <NewCardForm shown={factory} onDone={() => setOpen(false)} />}
      </SideSheet>
    </>
  );
}
