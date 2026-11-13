/**
 * The head of a step's part (`headOf`, lib/stepPart.ts): who the step is given, its word as a cut tag, its name with its tries and
 * rounds, and, from the preview card's size up, its time, its session's five facts, its spend, its one note and its one action; whole,
 * its check and its gate besides. While the run's own answer is read, it says so in place of what it has not read.
 */
import { ChevronRight, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Avatar, Body, Label, Meter, Tag } from '@/components/ui/ds';
import { ink } from '@/lib/meaning';
import type { CardNote, CardSpend, CardTime, PartHead as Head, PartSize } from '@/lib/stepPart';
import { cn } from '@/lib/utils';
import { CutTag, TextLink } from '../../look';

/** The ink of the time box's figure, by its kind's meaning. */
const TIME_INK: Record<CardTime['ink'], string> = {
  alive: ink.alive,
  yours: ink.yours,
  failure: ink.failure,
  plain: 'text-on-surface',
  muted: 'text-on-surface-variant',
};

const NOTE_ICON = { info: Info, shield: ShieldAlert, fail: TriangleAlert } as const;

/** A small-caps label of the head, muted: the time box's, a fact's, the spend's. */
function Key({ children, className }: { children: string; className?: string }) {
  return (
    <Label component="span" size="small" colorRole="on-surface-variant" className={cn('uppercase', className)}>
      {children}
    </Label>
  );
}

/** The step's word as a cut tag. */
function StateTag({ head }: { head: Head }) {
  return (
    <CutTag>
      <Tag data-step-tag color={head.tag.color} variant={head.tag.variant} className="uppercase">
        {head.tag.word}
      </Tag>
    </CutTag>
  );
}

/** The agent's avatar, name and role, and the step's word as a cut tag; `no agent`, with no avatar, where the step names none. */
function Who({ head }: { head: Head }) {
  const who = head.who === 'none' ? null : head.who;
  return (
    <div className="flex items-center gap-3">
      {who && (
        <Avatar size={40} alt={who.name} fallback={who.initial} className="shrink-0 bg-secondary-container text-on-secondary-container" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span data-step-agent className="truncate text-title-small">
          {who?.name ?? 'no agent'}
        </span>
        {who?.role && (
          <Body component="span" size="small" colorRole="on-surface-variant">
            {who.role}
          </Body>
        )}
      </div>
      <StateTag head={head} />
    </div>
  );
}

/** The step's name, and its tries and rounds where they are read. */
function Name({ head }: { head: Head }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
      <Label component="span" size="large" className="truncate uppercase" title={head.step}>
        {head.step}
      </Label>
      {head.round !== 'none' && <span className="font-mono text-body-small text-on-surface-variant">{head.round}</span>}
    </div>
  );
}

/** The time box: what it measures, its figure in its kind's ink, and its note. */
function Time({ time }: { time: CardTime }) {
  return (
    <div data-step-time className="flex flex-wrap items-baseline gap-x-2.5 bg-surface-container-highest px-3 py-2.5">
      <Key className="w-[84px]">{time.label}</Key>
      <span className={cn('font-mono text-body-large', TIME_INK[time.ink])}>{time.value}</span>
      <span className="font-mono text-body-small text-on-surface-variant">{time.note}</span>
    </div>
  );
}

/** Facts in a grid of a label and a value: the session's five, and whole, its check and its gate. */
function Facts({ facts }: { facts: ReadonlyArray<{ key: string; value: string }> }) {
  return (
    <dl data-step-facts className="m-0 grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
      {facts.map((fact) => (
        <div key={fact.key} className="contents">
          <dt>
            <Key>{fact.key}</Key>
          </dt>
          <dd data-fact={fact.key} className="m-0 font-mono text-body-medium break-words">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The spend: the kit's meter in the money colour, its label the head's small caps, where a spend and a budget are measured, else its
 * words in money.
 */
function Spend({ spend }: { spend: CardSpend }) {
  if (spend.kind === 'meter')
    return (
      <div data-step-spend="meter" className="border-t border-outline-variant pt-3">
        <Meter
          label={<Key>{spend.label}</Key>}
          value={spend.value}
          maxValue={spend.max}
          valueLabel={spend.said}
          showValue
          color="tertiary"
        />
      </div>
    );
  return (
    <div data-step-spend="words" className="flex flex-wrap items-baseline gap-x-2.5 border-t border-outline-variant pt-3">
      <Key className="w-24">{spend.label}</Key>
      <span className={cn('font-mono text-body-medium', ink.money)}>{spend.said}</span>
      <span className="font-mono text-body-small text-on-surface-variant">{spend.note}</span>
    </div>
  );
}

/** The head's note, with its icon: in the failure's ink for a refusal, muted for every other; on one line at the node's size. */
function Note({ note, line = false }: { note: CardNote; line?: boolean }) {
  const Icon = NOTE_ICON[note.icon];
  return (
    <div
      data-step-note
      title={line ? note.text : undefined}
      className={cn('flex min-w-0 items-start gap-2', note.icon === 'fail' ? ink.failure : 'text-on-surface-variant')}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className={cn('text-body-small', line ? 'truncate' : 'break-words')}>{note.text}</span>
    </div>
  );
}

/** The whole head's two facts beside the session's: its check and its gate, each where the step has one. */
const wholeFacts = (head: Head): Array<{ key: string; value: string }> => [
  ...(head.facts === 'none' ? [] : head.facts),
  ...(head.check === 'none' ? [] : [{ key: 'Check', value: head.check }]),
  ...(head.gate === 'none' ? [] : [{ key: 'Gate', value: head.gate }]),
];

/**
 * The head at `size`: on the graph's node (S), its name and word, its tries and its note on a line; as the preview card (M) and whole
 * (L), its agent, its time, its facts — whole, its check and gate too — its spend, its note and its action, a link to the step's page
 * (`action`: the card's always, the whole part's where it stands off the step's page).
 */
export function PartHead({ head, size, action = size === 'M' }: { head: Head; size: PartSize; action?: boolean }) {
  if (size === 'S')
    return (
      <div data-step-head="S" data-step-kind={head.kind} className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Name head={head} />
          <StateTag head={head} />
        </div>
        {head.note !== 'none' && <Note note={head.note} line />}
      </div>
    );
  const facts = size === 'L' ? wholeFacts(head) : head.facts === 'none' ? [] : head.facts;
  return (
    <div
      data-step-head={size}
      {...(size === 'M' && { 'data-step-card': true })}
      data-step-name={head.step}
      data-step-kind={head.kind}
      className="flex flex-col gap-3.5 text-on-surface"
    >
      <Who head={head} />
      <Name head={head} />
      {head.time !== 'none' && <Time time={head.time} />}
      {head.facts === 'none' ? (
        <Body data-step-reading size="small" colorRole="on-surface-variant">
          Reading the step…
        </Body>
      ) : (
        <Facts facts={facts} />
      )}
      {head.spend !== 'none' && <Spend spend={head.spend} />}
      {head.note !== 'none' && <Note note={head.note} />}
      {action && (
        <TextLink
          data-step-action
          to="/runs/$runId/steps/$step"
          params={{ runId: head.action.runId, step: head.action.step }}
          className="inline-flex min-h-10 items-center gap-1 self-start text-label-large uppercase"
        >
          {head.action.words}
          <ChevronRight aria-hidden="true" className="size-4" />
        </TextLink>
      )}
    </div>
  );
}
