import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Ellipsis, X } from 'lucide-react';
import { Body, Button, IconButton, Menu, SideSheet, Checkbox } from '@/components/ui/ds';
import { CutComboBox } from '@/components/look';
import { factoriesQuery } from '@/lib/api/factories';
import { dropCard, inboxPageQuery, queueCard, setCardAfter, setCardFrom, type InboxEntry } from '@/lib/api/inbox';
import { type Started } from '@/lib/api/workflows';
import { queueable, startedCard, unassigned, type CardRefusal } from '@/lib/inbox';
import { sayWritten } from '@/lib/written';
import { FactoryCardStart, UnassignedStart } from '../factory/FactoryCardStart';
import { ContextPicker } from '../agent/ContextPicker';
import { ResendCard } from './ResendCard';

/** What a card's action was refused with, told to the card to show: none where the action is tried again. */
type Refused = (refusal: Omit<CardRefusal, 'entry'> | null) => void;

/** Which sheet a card's menu has open beside the page: none, or the one of the action pressed. */
type Sheet = 'start' | 'after' | 'reads' | 'chain' | 'send' | null;

/** What each sheet is called: its title and the name the dialog is given. */
const SHEETS: Record<Exclude<Sheet, null>, (name: string) => string> = {
  start: (name) => `Start ${name}`,
  after: (name) => `Run ${name} after`,
  reads: (name) => `Runs ${name} reads`,
  chain: (name) => `Start the chain of ${name}`,
  send: (name) => `Send ${name} on`,
};

/**
 * What a card's start is, said once for the page: the card is not started, reads, and no record says it ran. A started card has its
 * run's page instead.
 */
const startable = (entry: InboxEntry) => !startedCard(entry) && entry.error === null;

/** The invalidation every write of a card ends with: the inbox is read again, whatever the answer. */
const useRead = () => {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['inbox'] });
};

/**
 * The one Start of a card, and what stands beside it. A card not started and not queued: Start, which queues it where it names a factory
 * and a workflow (it runs once the cards before it are done, and when there is room), and opens its start where it names either not. A
 * card queued shows no Start; its menu takes the start back. A card whose start was refused, or that waits on a card only a person can
 * release, shows Edit, which opens what to change. A card started shows Open run.
 */
function CardPrimary({
  entry,
  stuck,
  onSheet,
  onRefused,
  size = 'xsmall',
}: {
  entry: InboxEntry;
  stuck: boolean;
  onSheet: (sheet: Sheet) => void;
  onRefused: Refused;
  size?: 'xsmall' | 'small';
}) {
  const navigate = useNavigate();
  const read = useRead();
  const queue = useMutation({
    mutationFn: () => queueCard(entry),
    onMutate: () => onRefused(null),
    onSuccess: () => sayWritten('started', entry.name, () => void navigate({ to: '/inbox/$name', params: { name: entry.name } })),
    onError: (error) => onRefused({ action: 'queue', message: error.message }),
    onSettled: read,
  });
  const run = entry.startedAs.at(-1);
  if (startedCard(entry) && run !== undefined) {
    return (
      <Button variant="outlined" size={size} href={`/runs/${encodeURIComponent(run)}`}>
        Open run
      </Button>
    );
  }
  if (!startable(entry)) return null;
  if (entry.state === 'refused') {
    return (
      <Button variant="outlined" size={size} href={`/inbox/${encodeURIComponent(entry.name)}`}>
        Edit
      </Button>
    );
  }
  if (stuck) {
    return (
      <Button variant="outlined" size={size} onPress={() => onSheet('after')}>
        Edit
      </Button>
    );
  }
  if (entry.state === 'queued') return null;
  return (
    <Button
      variant="outlined"
      size={size}
      isDisabled={queue.isPending}
      onPress={() => (queueable(entry) ? queue.mutate() : onSheet('start'))}
    >
      Start
    </Button>
  );
}

/**
 * A card's menu, behind one button: Start now, ahead of its chain; Cancel start; Start chain…; Edit; Run it after…; Runs it reads…; Copy
 * its name; Send on; Remove: each where it applies to the card. `chain` is the cards of its chain where the page draws it whole.
 */
function CardMenu({
  entry,
  chain,
  onSheet,
  onRefused,
}: {
  entry: InboxEntry;
  chain: readonly InboxEntry[] | null;
  onSheet: (sheet: Sheet) => void;
  onRefused: Refused;
}) {
  const read = useRead();
  const remove = useMutation({
    mutationFn: () => dropCard(entry),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'remove', message: error.message }),
    onSettled: read,
  });
  const unqueue = useMutation({
    mutationFn: () => queueCard(entry, { off: true }),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'unqueue', message: error.message }),
    onSettled: read,
  });
  const navigate = useNavigate();
  const waits = (entry.waits?.length ?? 0) > 0;
  const open = startable(entry);
  const items = [
    ...(open && (waits || entry.state === 'queued')
      ? [{ id: 'now', label: 'Start now, ahead of its chain', onAction: () => onSheet('start') }]
      : []),
    ...(open && entry.state === 'queued' ? [{ id: 'cancel', label: 'Cancel start', onAction: () => unqueue.mutate() }] : []),
    ...(open && chain !== null && chain.length > 1 ? [{ id: 'chain', label: 'Start chain…', onAction: () => onSheet('chain') }] : []),
    ...(open ? [{ id: 'edit', label: 'Edit', onAction: () => void navigate({ to: '/inbox/$name', params: { name: entry.name } }) }] : []),
    ...(open ? [{ id: 'after', label: 'Run it after…', onAction: () => onSheet('after') }] : []),
    ...(open ? [{ id: 'reads', label: 'Runs it reads…', onAction: () => onSheet('reads') }] : []),
    { id: 'copy', label: 'Copy its name', onAction: () => void navigator.clipboard?.writeText(entry.name).catch(() => undefined) },
    ...(startedCard(entry) && entry.error === null ? [{ id: 'send', label: 'Send on', onAction: () => onSheet('send') }] : []),
    ...(entry.file.endsWith('.md') ? [{ id: 'remove', label: 'Remove', onAction: () => remove.mutate() }] : []),
  ];
  return (
    <Menu
      placement="bottom end"
      offset={6}
      triggerButton={
        <IconButton variant="standard" size="xsmall" icon={Ellipsis} aria-label={`More actions on ${entry.name}`} data-card-menu="" />
      }
      items={items}
    />
  );
}

/**
 * The sheet a card's menu opens beside the page, `sheet` of them: its start in the factory it names or one a person picks, the cards it
 * runs after, the runs it reads, the cards of its chain to start, or its sending on. `chain` is the cards of its chain, where the page
 * draws it whole. A start the api took opens the run's page.
 */
function CardSheet({
  entry,
  chain,
  sheet,
  onClose,
  onRefused,
}: {
  entry: InboxEntry;
  chain: readonly InboxEntry[] | null;
  sheet: Sheet;
  onClose: () => void;
  onRefused: Refused;
}) {
  const navigate = useNavigate();
  const onStarted = (started: Started) => {
    onClose();
    void navigate({ to: '/runs/$runId', params: { runId: started.id } });
  };
  return (
    <SideSheet variant="modal" title={sheet === null ? 'Card' : SHEETS[sheet](entry.name)} isOpen={sheet !== null} onClose={onClose}>
      {sheet === 'start' &&
        (unassigned(entry) ? (
          <UnassignedStart
            entry={entry}
            onStarted={onStarted}
            onRefused={(message) => onRefused(message === null ? null : { action: 'start', message })}
          />
        ) : (
          <FactoryCardStart
            entry={entry}
            onStarted={onStarted}
            onRefused={(message) => onRefused(message === null ? null : { action: 'start', message })}
          />
        ))}
      {sheet === 'after' && <AfterSheet entry={entry} onRefused={onRefused} />}
      {sheet === 'reads' && <ReadsSheet entry={entry} onRefused={onRefused} />}
      {sheet === 'chain' && chain !== null && <ChainSheet entry={entry} chain={chain} onClose={onClose} onRefused={onRefused} />}
      {sheet === 'send' && <SendSheet entry={entry} onRefused={onRefused} />}
    </SideSheet>
  );
}

/**
 * The cards a card runs after, each with the key that takes it off, and a field that finds another by its words and adds it, each
 * written at once.
 */
function AfterSheet({ entry, onRefused }: { entry: InboxEntry; onRefused: Refused }) {
  const read = useRead();
  const [text, setText] = useState('');
  const write = useMutation({
    mutationFn: (names: string[]) => setCardAfter(entry, names),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'from', message: error.message }),
    onSettled: read,
  });
  const before = (entry.waits ?? []).filter((w) => w.kind !== 'cycle').map((w) => w.card);
  const [names, setNames] = useState(before);
  const found = useQuery({
    ...inboxPageQuery({ fieldSelector: 'status.inPlay=true', search: text, limit: 8 }),
    enabled: text.trim() !== '',
  }).data;
  const suggestions = (found?.entries ?? [])
    .filter((e) => e.name !== entry.name && !names.includes(e.name))
    .map((e) => ({ id: e.name, label: e.title ?? e.name, hint: e.name }));
  const change = (next: string[]) => {
    setNames(next);
    write.mutate(next);
  };
  return (
    <div data-after-sheet className="space-y-4">
      <Body size="small">It runs once each of these is done. Cards in the inbox only; a card cannot run after itself.</Body>
      <CutComboBox
        label="Run it after"
        text={text}
        onText={setText}
        suggestions={suggestions}
        onPick={(id) => {
          setText('');
          change([...names, id]);
        }}
        onSubmit={(name) => {
          setText('');
          change([...names, name]);
        }}
        placeholder="Find a card by its words"
      />
      <ul aria-label="Runs after" className="space-y-1">
        {names.map((name) => (
          <li key={name} className="flex items-center gap-2">
            <Body size="medium" component="span" className="font-mono">
              {name}
            </Body>
            <IconButton
              size="xsmall"
              variant="standard"
              icon={X}
              aria-label={`Take ${name} off`}
              onPress={() => change(names.filter((n) => n !== name))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The runs a card reads as context, picked and written at once, as the card's page does. */
function ReadsSheet({ entry, onRefused }: { entry: InboxEntry; onRefused: Refused }) {
  const read = useRead();
  const write = useMutation({
    mutationFn: (runs: string[]) => setCardFrom(entry, runs),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'from', message: error.message }),
    onSettled: read,
  });
  const shown = write.isPending ? write.variables : entry.from;
  return <ContextPicker label="Reads as context" selected={shown} onChange={(runs) => write.mutate(runs)} disabled={write.isPending} />;
}

/** A started card's sending on, to a workflow its factory offers or none for its factory's card triggers. */
function SendSheet({ entry, onRefused }: { entry: InboxEntry; onRefused: Refused }) {
  const offered = useQuery(factoriesQuery).data?.find((f) => f.name === entry.factory)?.workflows ?? [];
  return (
    <ResendCard
      entry={entry}
      workflows={offered}
      onRefused={(message) => onRefused(message === null ? null : { action: 'resend', message })}
    />
  );
}

/**
 * The cards of a chain not yet started, each chosen to start: the card asked about and every card it waits on stay chosen, since a card
 * cannot run before them. Start queues each chosen card, so each runs once the cards before it are done and there is room.
 */
function ChainSheet({
  entry,
  chain,
  onClose,
  onRefused,
}: {
  entry: InboxEntry;
  chain: readonly InboxEntry[];
  onClose: () => void;
  onRefused: Refused;
}) {
  const read = useRead();
  const open = chain.filter((card) => startable(card) && card.state === 'filed' && queueable(card));
  const must = new Set<string>([entry.name]);
  for (let again = true; again;) {
    again = false;
    for (const card of open) {
      if (must.has(card.name)) continue;
      if (open.some((later) => must.has(later.name) && card.followedBy.includes(later.name))) {
        must.add(card.name);
        again = true;
      }
    }
  }
  const [chosen, setChosen] = useState(() => new Set(open.map((card) => card.name)));
  const start = useMutation({
    mutationFn: async () => {
      for (const card of open) if (chosen.has(card.name)) await queueCard(card);
    },
    onMutate: () => onRefused(null),
    onSuccess: onClose,
    onError: (error) => onRefused({ action: 'queue', message: error.message }),
    onSettled: read,
  });
  return (
    <div data-chain-sheet className="space-y-4">
      <Body size="small">Each card chosen runs once the cards before it are done. Cards that others wait on cannot be left out.</Body>
      <ul aria-label="Cards of the chain" className="space-y-1">
        {open.map((card) => (
          <li key={card.name}>
            <Checkbox
              isSelected={chosen.has(card.name)}
              isDisabled={must.has(card.name)}
              onChange={(on) => setChosen((was) => new Set(on ? [...was, card.name] : [...was].filter((n) => n !== card.name)))}
            >
              {card.title ?? card.name}
            </Checkbox>
          </li>
        ))}
      </ul>
      <Button variant="outlined" isDisabled={start.isPending || open.length === 0} onPress={() => start.mutate()}>
        Start the chosen
      </Button>
    </div>
  );
}

/**
 * A card's actions: its one Start (`CardPrimary`), its menu (`CardMenu`) and the sheet each opens, which this holds the open one of.
 * `stuck` is a card that waits on one only a person can release, whose Start is Edit.
 */
export function CardActions({
  entry,
  chain,
  stuck,
  onRefused,
  size,
}: {
  entry: InboxEntry;
  chain: readonly InboxEntry[] | null;
  stuck: boolean;
  onRefused: Refused;
  size?: 'xsmall' | 'small';
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  return (
    <>
      <CardPrimary entry={entry} stuck={stuck} onSheet={setSheet} onRefused={onRefused} size={size} />
      <CardMenu entry={entry} chain={chain} onSheet={setSheet} onRefused={onRefused} />
      <CardSheet entry={entry} chain={chain} sheet={sheet} onClose={() => setSheet(null)} onRefused={onRefused} />
    </>
  );
}

/** A link to a card's page, in the card's title: its name where it has no title. */
export function CardLink({ entry, className }: { entry: InboxEntry; className?: string }) {
  return (
    <Link to="/inbox/$name" params={{ name: entry.name }} className={className}>
      {entry.title ?? entry.file}
    </Link>
  );
}
