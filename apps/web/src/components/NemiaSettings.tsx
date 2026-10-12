import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  levelQuery,
  nemiaFactQuery,
  nemiaMemoryQuery,
  putLevel,
  type Bridge,
  type FactoryLevel,
  type Level,
  type LevelAsk,
  type NemiaLevel,
} from '../lib/api';
import { DEFAULT_NAME } from '../lib/factories';
import { factoryWords, freshLevel, LEVELS, levelWord, PRUNE_WORDS, RAISE_STRETCHES, raisesOver, sessionOf, spendWords } from '../lib/nemia';
import { clockWord } from '../lib/quota';
import { useNow } from '../lib/useNow';
import { AutoRules } from './AutoRules';
import { CopyButton } from './CopyButton';
import { BridgeWords } from './Facts';
import { TrustLine } from './NemiaTrust';

/**
 * Nemia, the store's own agent, on the Settings page: the store's level and where it is picked, each factory's level with its default and a
 * raise for a stretch, her rules at Auto, her session's state, how to reach it, what her sessions cost and what a person allowed her,
 * then her memory, read-only. A write sets what the section shows from the api's answer and reads her
 * level again; a refusal is shown in the api's words.
 */
export function NemiaSettings() {
  const queryClient = useQueryClient();
  const { data, error } = useQuery(levelQuery);
  const write = useMutation({
    mutationFn: (ask: LevelAsk) => putLevel(ask),
    onSuccess: (now) => {
      queryClient.setQueryData(levelQuery.queryKey, now);
      void queryClient.invalidateQueries({ queryKey: levelQuery.queryKey, exact: true });
    },
  });
  const ask = (level: LevelAsk) => {
    write.reset();
    write.mutate(level);
  };
  const askLevel = (level: Level) => ask({ level });
  return (
    <section aria-label="Nemia" data-nemia-section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-medium">Nemia</h2>
        <p className="text-body-medium text-muted-foreground">
          The store's own agent, across every factory: on Semi-auto she keeps a session of her own, and what waits on you — a gate, a step's
          question, a loop out of rounds — is asked of you first, as is a write that cannot be undone or changes your settings or a factory.
          The rest is hers. On Auto, an answer the rules you confirmed allow is hers too.
        </p>
      </div>
      {data ? (
        <>
          <LevelPart nemia={data} pending={write.isPending} onAsk={askLevel} />
          <FactoriesPart factories={data.factories} pending={write.isPending} onAsk={ask} />
          {write.error && (
            <div data-nemia-refused className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
              <p className="text-body-medium font-medium text-destructive">Not set:</p>
              <p className="font-mono text-body-small break-words whitespace-pre-wrap text-destructive">{write.error.message}</p>
            </div>
          )}
          <AutoRules agent="nemia" />
          <SessionPart nemia={data} pending={write.isPending} onAsk={askLevel} />
          <ReachPart reach={data.reach} bridge={data.bridge} />
          <SpendPart nemia={data} />
        </>
      ) : (
        <p className="text-body-medium text-muted-foreground">
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
      <h3 className="text-title-small">{heading}</h3>
      {children}
    </div>
  );
}

/**
 * A level picked among Manual, Semi-auto and Auto, named `label`, showing `level`: a pick of another writes it, a pick of the same none.
 * `marks` say where it is pressed.
 */
function LevelSelect({
  label,
  level,
  pending,
  onPick,
  marks,
}: {
  label: string;
  level: Level;
  pending: boolean;
  onPick: (level: Level) => void;
  marks: Record<`data-${string}`, boolean>;
}) {
  return (
    <Select
      aria-label={label}
      value={level}
      onChange={(key) => {
        const picked = LEVELS.find((each) => each === key);
        if (picked !== undefined && picked !== level) onPick(picked);
      }}
      isDisabled={pending}
    >
      <SelectTrigger size="sm" {...marks} className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {LEVELS.map((each) => (
            <SelectItem key={each} id={each}>
              {levelWord(each)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * Her level, picked among the three, what it means, and since when she is there; while her folder is not trusted, beside the switch, that
 * no session of hers is filed until it is, and the line that trusts it.
 */
function LevelPart({ nemia, pending, onAsk }: { nemia: NemiaLevel; pending: boolean; onAsk: (level: Level) => void }) {
  const now = useNow(60_000);
  return (
    <Part heading="Level" data-nemia-level={nemia.level}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <LevelSelect label="Her level" level={nemia.level} pending={pending} onPick={onAsk} marks={{ 'data-nemia-pick': true }} />
        {pending && <span className="text-body-small text-muted-foreground">Writing…</span>}
      </div>
      <p className="text-body-small text-muted-foreground">
        {LEVEL_LINES[nemia.level]}
        {nemia.since !== null && <span data-nemia-since> Set at {clockWord(new Date(nemia.since), new Date(now))}.</span>}
      </p>
      <TrustLine trust={nemia.trust} />
    </Part>
  );
}

/** What each level of hers means. */
const LEVEL_LINES: Record<Level, string> = {
  manual: 'Manual: no session of hers is kept unless a factory is above Manual. Above it, the keeper files her one at its next beat.',
  'semi-auto':
    'Semi-auto: the keeper keeps her session, and what waits on you waits for your answer. At Manual, her session stops at its next beat, unless a factory is still above Manual.',
  auto: 'Auto: as Semi-auto, but an answer the rules you confirmed allow in the run’s state is given without asking you. It holds in a session of hers filed since the board offered Auto: one kept from before asks you every answer until it is filed again — set her level and every factory above Manual to Manual, ending any raise, and once her session reads Off, set them back.',
};

/**
 * Each factory's level: she works on one at Semi-auto, and one at Manual is left alone, its runs and its lines not hers. The default
 * factory's is the store's, set above; each other has its default and a raise for a stretch, which ends by itself.
 */
function FactoriesPart({
  factories,
  pending,
  onAsk,
}: {
  factories: readonly FactoryLevel[];
  pending: boolean;
  onAsk: (ask: LevelAsk) => void;
}) {
  const now = useNow(60_000);
  return (
    <Part heading="Factories" data-nemia-factories>
      <p className="text-body-small text-muted-foreground">
        She works on a factory at Semi-auto, and at Auto gives unasked what your rules allow; one at Manual is left alone, its runs and its
        news not hers. Raise one for a stretch: it goes back to its default by itself once the stretch ends.
      </p>
      <ul className="flex flex-col gap-2">
        {factories.map((row) => (
          <li key={row.factory}>
            <FactoryRow row={row} now={new Date(now)} pending={pending} onAsk={onAsk} />
          </li>
        ))}
      </ul>
    </Part>
  );
}

/**
 * One factory's level, its words, and what a person sets of it: its default, picked among the three, a raise to a level over its default
 * for a chosen stretch, and the end of a raise in force. The default factory's level is the store's, picked above.
 */
function FactoryRow({ row, now, pending, onAsk }: { row: FactoryLevel; now: Date; pending: boolean; onAsk: (ask: LevelAsk) => void }) {
  const byDefault = row.factory === DEFAULT_NAME;
  return (
    <div data-factory-level={row.factory} data-level={row.level} className="flex flex-col gap-2 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body-medium">{row.factory}</span>
        <Badge variant={row.level === 'manual' ? 'secondary' : 'default'}>{levelWord(row.level)}</Badge>
        {row.raise !== null && (
          <Badge variant="outline" data-factory-raised>
            Raised
          </Badge>
        )}
      </div>
      <p data-factory-words className="text-body-small text-muted-foreground">
        {factoryWords(row, byDefault, now)}
      </p>
      {!byDefault && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2 text-body-medium">
            By default
            <LevelSelect
              label={`${row.factory}'s level by default`}
              level={row.default}
              pending={pending}
              onPick={(level) => onAsk({ level, factory: row.factory })}
              marks={{ 'data-factory-default': true }}
            />
          </span>
          {row.raise !== null ? (
            <Button
              variant="outline"
              size="sm"
              data-factory-end
              isDisabled={pending}
              onPress={() => onAsk({ factory: row.factory, end: true })}
            >
              End the raise
            </Button>
          ) : (
            <RaiseControls row={row} pending={pending} onAsk={onAsk} />
          )}
        </div>
      )}
    </div>
  );
}

/** Where a raise to each level is pressed. */
const RAISE_MARKS: Record<Level, Record<`data-${string}`, boolean>> = {
  manual: {},
  'semi-auto': { 'data-factory-raise': true },
  auto: { 'data-factory-raise-auto': true },
};

/** A factory's raise for a chosen stretch, a button for each level over its default; none at Auto by default. */
function RaiseControls({ row, pending, onAsk }: { row: FactoryLevel; pending: boolean; onAsk: (ask: LevelAsk) => void }) {
  const [stretch, setStretch] = useState<string>(RAISE_STRETCHES[0]);
  const levels = raisesOver(row.default);
  if (!levels.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Raise for" value={stretch} onChange={(key) => setStretch(String(key))} isDisabled={pending}>
        <SelectTrigger size="sm" data-factory-stretch className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {RAISE_STRETCHES.map((word) => (
              <SelectItem key={word} id={word}>
                {word}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {levels.map((level) => (
        <Button
          key={level}
          variant="outline"
          size="sm"
          {...RAISE_MARKS[level]}
          isDisabled={pending}
          onPress={() => onAsk({ level, factory: row.factory, for: stretch })}
        >
          Raise to {levelWord(level)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Her session's state in the board's words; once her task is filed, its name and its phase as the runtime says it; stopped from outside, a
 * way to a fresh one.
 */
function SessionPart({ nemia, pending, onAsk }: { nemia: NemiaLevel; pending: boolean; onAsk: (level: Level) => void }) {
  const { kind, words } = sessionOf(nemia);
  return (
    <Part heading="Her session" data-nemia-session data-state={kind}>
      <p className="text-body-medium">{words}</p>
      {nemia.phase !== null && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-small text-muted-foreground">
          <span>
            Task{' '}
            <code data-nemia-task className="font-mono">
              {nemia.task}
            </code>
          </span>
          <span>
            Phase{' '}
            <code data-nemia-phase className="font-mono">
              {nemia.phase}
            </code>
          </span>
        </p>
      )}
      {kind === 'stopped' && (
        <div>
          <Button variant="outline" size="sm" data-nemia-restart isDisabled={pending} onPress={() => onAsk(freshLevel(nemia.level))}>
            Start a fresh session
          </Button>
        </div>
      )}
    </Part>
  );
}

/**
 * How a person reaches her session, as the api says it: its first line a command to copy, the rest sentences, but for the line her bridge
 * says, drawn from `bridge` itself: her web link to open, or why it is not up. None while none runs.
 */
function ReachPart({ reach, bridge }: { reach: readonly string[]; bridge: Bridge | null }) {
  if (!reach.length) return null;
  const [command, ...lines] = reach;
  const rest = bridge === null ? lines : lines.slice(0, -1);
  return (
    <Part heading="Reach her" data-nemia-reach>
      <div className="flex max-w-full items-center gap-1 self-start rounded-md border bg-muted/40 px-2 py-1">
        <code data-nemia-attach className="font-mono text-body-small break-all">
          {command}
        </code>
        <CopyButton text={command} />
      </div>
      {rest.map((line) => (
        <p key={line} className="text-body-small text-muted-foreground">
          {line}
        </p>
      ))}
      {bridge && (
        <p className="text-body-small text-muted-foreground">
          <BridgeWords bridge={bridge} data-nemia-bridge />
        </p>
      )}
    </Part>
  );
}

/** What her ended sessions cost, once one is filed, and the allow rules a person gave her at a prompt, beyond what ships. */
function SpendPart({ nemia }: { nemia: NemiaLevel }) {
  if (nemia.spend === null && !nemia.allows.length) return null;
  return (
    <Part heading="What she spent and was allowed">
      {nemia.spend !== null && (
        <p data-nemia-spend className="text-body-medium">
          {spendWords(nemia.spend)}
        </p>
      )}
      {nemia.allows.length > 0 && (
        <div data-nemia-allows className="flex flex-col gap-1">
          <p className="text-body-small text-muted-foreground">Allowed at a prompt, beyond what ships (her folder's local settings):</p>
          <span className="flex flex-wrap gap-1">
            {nemia.allows.map((rule) => (
              <code key={rule} className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-small">
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
          <p data-nemia-no-facts className="text-body-medium text-muted-foreground">
            She keeps no facts yet.
          </p>
        )
      ) : (
        <p className="text-body-medium text-muted-foreground">
          {error instanceof Error ? `Could not read her memory: ${error.message}` : 'Reading her memory…'}
        </p>
      )}
      <p data-nemia-prune className="text-body-small text-muted-foreground">
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
          <CollapsibleTrigger className="rounded-sm font-mono text-body-small outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
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
      <pre
        data-nemia-fact-text
        className="mt-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-body-small break-words whitespace-pre-wrap"
      >
        {data.fact.text}
      </pre>
    );
  return (
    <p className="mt-1 text-body-small text-muted-foreground">
      {error instanceof Error ? `Could not read this fact: ${error.message}` : 'Reading the fact…'}
    </p>
  );
}
