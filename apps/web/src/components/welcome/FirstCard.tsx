import { useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { PageName, RadioTile, RadioTileGroup } from '@/components/look';
import { Button, TextField } from '@/components/ui/ds';
import { factoriesQuery, type Factory } from '@/lib/api/factories';
import { factoryWorkflowsQuery } from '@/lib/api/workflows';
import { startRepo } from '@/lib/factories';
import { fileCard, startCard } from '@/lib/api/inbox';
import { quotaQuery } from '@/lib/api/quota';
import { workflowStatsQuery } from '@/lib/api/stats';
import { dollars } from '@/lib/money';
import { durationWords } from '@/lib/duration';
import { quotaShort } from '@/lib/footer';
import { useNow } from '@/lib/useNow';
import {
  costLineOf,
  ESTIMATE_WORDS,
  FIRST_CARD_LABEL,
  FIRST_RUN_ESTIMATE,
  FIRST_WORKFLOW,
  firstGatesOf,
  firstWorkflowOf,
  SUGGESTIONS,
} from '@/lib/firstCard';

/** The factory a first card is filed in: the one chosen, else the first with a writable volume, else the first of the store's. */
const factoryFiledIn = (factories: readonly Factory[], chosen: string | undefined) => {
  const own = factories.filter((f) => !f.default);
  return own.find((f) => f.name === chosen) ?? own.find((f) => f.worksOn.length > 0) ?? own[0];
};

/**
 * The start of a first card: file it labelled as the first card, start it gated at its ending (`firstGatesOf`), and open the run's page.
 */
function useFirstStart() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const start = (factory: string, workflow: string, body: string, gates: readonly string[]) => {
    setPending(true);
    setRefused(undefined);
    fileCard({ factory, body, workflow, label: [FIRST_CARD_LABEL] })
      .then((card) => startCard({ name: card.name, factory }, { workflow, brief: body, ...(gates.length ? { gates } : {}) }))
      .then(
        (started) => void navigate({ to: '/runs/$runId', params: { runId: started.id } }),
        (err: unknown) => {
          setPending(false);
          setRefused(err instanceof Error ? err.message : String(err));
        },
      );
  };
  return { pending, refused, start };
}

/**
 * The welcome's fourth milestone, "What first?", at `/welcome/card`: the factory it is filed in (a choice where the store holds several),
 * three suggested small changes that fill the card's words, which the person may replace with their own, the workflow it runs in
 * (`firstWorkflowOf`: quick where the factory offers it, else a choice of the factory's own), the cost line above Start, and Start, which
 * files the card labelled `FIRST_CARD_LABEL` and starts it, gated at its landing in quick, then opens the run's page, where the hints are.
 * A refusal is said in the api's words; a skip leads to the board.
 */
export function FirstCard() {
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const factory = factoryFiledIn(factories, chosen);
  const offered = factory?.workflows ?? [];
  const first = firstWorkflowOf(offered);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const workflow = first ?? (picked !== undefined && offered.includes(picked) ? picked : undefined);
  const [body, setBody] = useState('');
  const gates = useFirstGates(factory, workflow);
  const { pending, refused, start } = useFirstStart();
  const navigate = useNavigate();
  const own = factories.filter((f) => !f.default);
  return (
    <article
      data-first-card={factory === undefined ? 'no-factory' : 'write'}
      className="mx-auto flex max-w-3xl flex-col gap-8 px-3 py-6 @lg/page:px-6"
    >
      <header className="flex flex-col gap-1">
        <PageName>What first?</PageName>
        <p className="text-body-medium text-on-surface-variant">
          A card says what you want; a workflow does it in steps; a gate waits on you before it lands. Start with something small.
        </p>
      </header>
      {factory === undefined ? (
        <p data-first-no-factory className="m-0 text-body-medium text-on-surface-variant">
          The store holds no factory yet: make one and give it its work first.
        </p>
      ) : (
        <>
          {own.length > 1 && (
            <RadioTileGroup label="Which factory?" layout="column" value={factory.name} onChange={(name) => setChosen(String(name))}>
              {own.map((f) => (
                <RadioTile key={f.name} value={f.name} data-first-factory={f.name} title={f.name} description="File the card here." />
              ))}
            </RadioTileGroup>
          )}
          <CardWords body={body} onBody={setBody} pending={pending} />
          {first === undefined && <WorkflowChoice offered={offered} picked={picked} onPick={setPicked} />}
          {workflow !== undefined && <CostLine workflow={workflow} />}
          {refused !== undefined && (
            <p role="alert" data-first-refused className="m-0 text-body-small break-words text-failure">
              {refused}
            </p>
          )}
        </>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="text" size="small" data-welcome-skip onPress={() => void navigate({ to: '/' })}>
          Skip, go to the board
        </Button>
        {factory !== undefined && (
          <Button
            variant="filled"
            data-first-start
            isDisabled={pending || workflow === undefined || gates === undefined || body.trim() === ''}
            onPress={() => workflow !== undefined && gates !== undefined && start(factory.name, workflow, body.trim(), gates)}
          >
            {gates !== undefined && gates.length > 0 ? 'Start, gated before it lands' : 'Start'}
          </Button>
        )}
      </footer>
    </article>
  );
}

/**
 * The gates the first card's run is started with (`firstGatesOf`): quick's at once; another workflow's once the factory's listing of it
 * is read, which says its ending step; undefined while it is read. A workflow the factory wires to no one repository is started with none,
 * and the start says the api's refusal.
 */
function useFirstGates(factory: Factory | undefined, workflow: string | undefined) {
  const on = factory !== undefined && workflow !== undefined && workflow !== FIRST_WORKFLOW ? startRepo(factory, workflow) : undefined;
  const repo = on !== undefined && 'repo' in on ? on.repo : undefined;
  const listed = useQuery({
    ...factoryWorkflowsQuery({ factory: factory?.name ?? '', repo: repo ?? '' }),
    enabled: repo !== undefined,
  });
  if (workflow === undefined) return undefined;
  if (workflow === FIRST_WORKFLOW || repo === undefined) return firstGatesOf(workflow, undefined);
  if (listed.isError) return firstGatesOf(workflow, undefined);
  if (!listed.data) return undefined;
  return firstGatesOf(workflow, listed.data.find((w) => w.name === workflow && w.error === null)?.steps);
}

/** The card's words: the three suggestions, a press filling the field, and the field the person may write in. */
function CardWords({ body, onBody, pending }: { body: string; onBody: (body: string) => void; pending: boolean }) {
  return (
    <>
      <RadioTileGroup
        label="Pick one, or write your own"
        layout="column"
        value={SUGGESTIONS.find((s) => s.body === body)?.title ?? ''}
        onChange={(title) => onBody(SUGGESTIONS.find((s) => s.title === title)?.body ?? body)}
      >
        {SUGGESTIONS.map((s) => (
          <RadioTile key={s.title} value={s.title} data-first-suggestion={s.title} title={s.title} description={s.body} />
        ))}
      </RadioTileGroup>
      <div data-first-body>
        <TextField
          label="Your card"
          multiline
          supportingText="What you want, in your words: the workflow reads it as its brief"
          value={body}
          onChange={onBody}
          isDisabled={pending}
        />
      </div>
    </>
  );
}

/** The factory's own workflows to run the card in, where it offers no quick. */
function WorkflowChoice({
  offered,
  picked,
  onPick,
}: {
  offered: readonly string[];
  picked: string | undefined;
  onPick: (name: string) => void;
}) {
  return (
    <RadioTileGroup label="Which workflow?" layout="column" value={picked ?? ''} onChange={(name) => onPick(String(name))}>
      {offered.map((name) => (
        <RadioTile key={name} value={name} data-first-workflow={name} title={name} description={`Run the card in ${name}.`} />
      ))}
    </RadioTileGroup>
  );
}

/**
 * The cost line above Start: what one landed run of `workflow` cost and took on this store, where it measured any, else the stated
 * estimate (`costLineOf`), with the harness's current quota beside it where it was read.
 */
function CostLine({ workflow }: { workflow: string }) {
  const stats = useQuery(workflowStatsQuery(workflow));
  const quota = useQuery(quotaQuery);
  const line = costLineOf(stats.data, FIRST_RUN_ESTIMATE);
  const now = useNow(60_000);
  const short = quota.data?.state === 'fresh' ? quotaShort(quota.data, null, new Date(now)).text : undefined;
  return (
    <p data-cost-line={line.kind} className="m-0 text-body-medium text-on-surface-variant">
      {line.kind === 'measured'
        ? `A ${workflow} run that landed here took about ${durationWords(line.ms, 'minute')} and cost about ${dollars(line.dollars)}.`
        : `A small run takes ${ESTIMATE_WORDS}: an estimate, since this store has measured none yet.`}
      {short === undefined ? '' : ` Your plan's windows now: ${short}.`}
    </p>
  );
}
