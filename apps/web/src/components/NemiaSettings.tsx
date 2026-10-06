import { useId, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { levelQuery, nemiaFactQuery, nemiaMemoryQuery, putLevel, type Level, type NemiaLevel } from '../lib/api';
import { offeredLevel, PRUNE_WORDS, sessionOf, spendWords } from '../lib/nemia';
import { clockWord } from '../lib/quota';
import { useNow } from '../lib/useNow';
import { CopyButton } from './CopyButton';

/**
 * Nemia, the store's own agent, on the Settings page: her level with its switch, her session's state, how to reach it, what her sessions
 * cost and what a person allowed her, then her memory, read-only. A write sets what the section shows from the api's answer and reads her
 * level again; a refusal is shown in the api's words.
 */
export function NemiaSettings() {
  const queryClient = useQueryClient();
  const { data, error } = useQuery(levelQuery);
  const write = useMutation({
    mutationFn: (level: Level) => putLevel(level),
    onSuccess: (now) => {
      queryClient.setQueryData(levelQuery.queryKey, now);
      void queryClient.invalidateQueries({ queryKey: levelQuery.queryKey, exact: true });
    },
  });
  const ask = (level: Level) => {
    write.reset();
    write.mutate(level);
  };
  return (
    <section aria-label="Nemia" data-nemia-section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Nemia</h2>
        <p className="text-sm text-muted-foreground">
          The store's own agent, across every factory: on Semi-auto she keeps a session of her own, and what waits on you — a gate, a step's
          question, a loop out of rounds — is asked of you first, as is a write that cannot be undone or changes your settings or a factory.
          The rest is hers.
        </p>
      </div>
      {data ? (
        <>
          <LevelPart nemia={data} pending={write.isPending} onAsk={ask} />
          {write.error && (
            <div data-nemia-refused className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
              <p className="text-sm font-medium text-destructive">Not set:</p>
              <p className="font-mono text-xs break-words whitespace-pre-wrap text-destructive">{write.error.message}</p>
            </div>
          )}
          <SessionPart nemia={data} pending={write.isPending} onAsk={ask} />
          <ReachPart reach={data.reach} />
          <SpendPart nemia={data} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? `Could not read where she is: ${error.message}` : 'Reading where she is…'}
        </p>
      )}
      <MemoryPart />
    </section>
  );
}

/** One part of the section, under its heading. */
function Part({ heading, children, ...data }: { heading: string; children: ReactNode } & Record<`data-${string}`, string | boolean>) {
  return (
    <div {...data} className="flex flex-col gap-2 border-t pt-4">
      <h3 className="text-sm font-medium">{heading}</h3>
      {children}
    </div>
  );
}

/**
 * Her level: the Semi-auto switch, selected while she is on it, which writes the other level; and since when she is there. Its word is a
 * label of its own beside it, naming the switch's input, since React Aria's switch is a label round its input.
 */
function LevelPart({ nemia, pending, onAsk }: { nemia: NemiaLevel; pending: boolean; onAsk: (level: Level) => void }) {
  const id = useId();
  const now = useNow(60_000);
  return (
    <Part heading="Level" data-nemia-level={nemia.level}>
      <div className="flex items-center gap-2">
        <Switch id={id} isSelected={nemia.level === 'semi-auto'} isDisabled={pending} onChange={() => onAsk(offeredLevel(nemia))} />
        <label htmlFor={id} data-nemia-switch className="cursor-pointer text-sm">
          Semi-auto
        </label>
        {pending && <span className="text-xs text-muted-foreground">Writing…</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {nemia.level === 'semi-auto'
          ? 'Semi-auto: the keeper keeps her session, and what waits on you waits for your answer. Off, Manual stops her session at its next beat.'
          : 'Manual: no session of hers is kept. On, Semi-auto files her one at the keeper’s next beat.'}
        {nemia.since !== null && <span data-nemia-since> Set at {clockWord(new Date(nemia.since), new Date(now))}.</span>}
      </p>
    </Part>
  );
}

/** Her session's state in the board's words, its task and its phase as the runtime says it; stopped from outside, a way to a fresh one. */
function SessionPart({ nemia, pending, onAsk }: { nemia: NemiaLevel; pending: boolean; onAsk: (level: Level) => void }) {
  const { kind, words } = sessionOf(nemia);
  return (
    <Part heading="Her session" data-nemia-session data-state={kind}>
      <p className="text-sm">{words}</p>
      {nemia.task !== null && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Task{' '}
            <code data-nemia-task className="font-mono">
              {nemia.task}
            </code>
          </span>
          {nemia.phase !== null && (
            <span>
              Phase{' '}
              <code data-nemia-phase className="font-mono">
                {nemia.phase}
              </code>
            </span>
          )}
        </p>
      )}
      {kind === 'stopped' && (
        <div>
          <Button variant="outline" size="sm" data-nemia-restart isDisabled={pending} onPress={() => onAsk('semi-auto')}>
            Start a fresh session
          </Button>
        </div>
      )}
    </Part>
  );
}

/** How a person reaches her session, as the api says it: its first line a command to copy, the rest sentences. None while none runs. */
function ReachPart({ reach }: { reach: readonly string[] }) {
  if (!reach.length) return null;
  const [command, ...rest] = reach;
  return (
    <Part heading="Reach her" data-nemia-reach>
      <div className="flex max-w-full items-center gap-1 self-start rounded-md border bg-muted/40 px-2 py-1">
        <code data-nemia-attach className="font-mono text-xs break-all">
          {command}
        </code>
        <CopyButton text={command} />
      </div>
      {rest.map((line) => (
        <p key={line} className="text-xs text-muted-foreground">
          {line}
        </p>
      ))}
    </Part>
  );
}

/** What her ended sessions cost, once one is filed, and the allow rules a person gave her at a prompt, beyond what ships. */
function SpendPart({ nemia }: { nemia: NemiaLevel }) {
  if (nemia.spend === null && !nemia.allows.length) return null;
  return (
    <Part heading="What she spent and was allowed">
      {nemia.spend !== null && (
        <p data-nemia-spend className="text-sm">
          {spendWords(nemia.spend)}
        </p>
      )}
      {nemia.allows.length > 0 && (
        <div data-nemia-allows className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Allowed at a prompt, beyond what ships (her folder's local settings):</p>
          <span className="flex flex-wrap gap-1">
            {nemia.allows.map((rule) => (
              <code key={rule} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {rule}
              </code>
            ))}
          </span>
        </div>
      )}
    </Part>
  );
}

/** The facts she keeps, each by name and opened to read its words, then how a person has one pruned: by asking her. */
function MemoryPart() {
  const { data, error } = useQuery(nemiaMemoryQuery);
  return (
    <Part heading="Her memory" data-nemia-memory>
      {data ? (
        data.facts.length ? (
          <ul className="flex flex-col gap-1">
            {data.facts.map((name) => (
              <li key={name}>
                <Fact name={name} />
              </li>
            ))}
          </ul>
        ) : (
          <p data-nemia-no-facts className="text-sm text-muted-foreground">
            She keeps no facts yet.
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? `Could not read her memory: ${error.message}` : 'Reading her memory…'}
        </p>
      )}
      <p data-nemia-prune className="text-xs text-muted-foreground">
        {PRUNE_WORDS}
      </p>
    </Part>
  );
}

/** One fact by name, folded; its words read and drawn only while it is open. */
function Fact({ name }: { name: string }) {
  return (
    <Collapsible data-nemia-fact={name}>
      {({ isExpanded }) => (
        <>
          <CollapsibleTrigger className="rounded-sm font-mono text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
            {isExpanded ? '▾' : '▸'} {name}
          </CollapsibleTrigger>
          <CollapsibleContent>{isExpanded && <FactText name={name} />}</CollapsibleContent>
        </>
      )}
    </Collapsible>
  );
}

/** A fact's words, as she wrote them. */
function FactText({ name }: { name: string }) {
  const { data, error } = useQuery(nemiaFactQuery(name));
  if (data?.fact)
    return (
      <pre data-nemia-fact-text className="mt-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap">
        {data.fact.text}
      </pre>
    );
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {error instanceof Error ? `Could not read this fact: ${error.message}` : 'Reading the fact…'}
    </p>
  );
}
