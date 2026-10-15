import { ChevronRight, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Avatar, Body, Label, Meter, Tag } from '@/components/ui/ds';
import { ink } from '@/lib/meaning';
import type { CardNote, CardSpend, CardTime, StepCardFacts } from '@/lib/stepCard';
import { cn } from '@/lib/utils';
import { CutFrame, CutTag, TextLink } from './look';

/** The ink of the time box's figure, by its kind's meaning. */
const TIME_INK: Record<CardTime['ink'], string> = {
  alive: ink.alive,
  yours: ink.yours,
  failure: ink.failure,
  plain: 'text-on-surface',
  muted: 'text-on-surface-variant',
};

const NOTE_ICON = { info: Info, shield: ShieldAlert, fail: TriangleAlert } as const;

/** A small-caps label of the card, muted: the time box's, a fact's, the spend's. */
function Key({ children, className }: { children: string; className?: string }) {
  return (
    <Label component="span" size="small" colorRole="on-surface-variant" className={cn('uppercase', className)}>
      {children}
    </Label>
  );
}

/** The agent's avatar, name and role, and the step's word as a cut tag; `no agent` where the step names none. */
function Head({ facts }: { facts: StepCardFacts }) {
  const { agent, tag } = facts;
  return (
    <div className="flex items-center gap-3">
      <Avatar
        size={40}
        alt={agent?.name ?? 'no agent'}
        fallback={agent?.initial ?? '·'}
        className="shrink-0 bg-secondary-container text-on-secondary-container"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span data-step-agent className="truncate text-title-small">
          {agent?.name ?? 'no agent'}
        </span>
        {agent?.role && (
          <Body component="span" size="small" colorRole="on-surface-variant">
            {agent.role}
          </Body>
        )}
      </div>
      <CutTag>
        <Tag data-step-tag color={tag.color} variant={tag.variant} className="uppercase">
          {tag.word}
        </Tag>
      </CutTag>
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

/** The session's five facts, whole, in a grid of a label and a value. */
function Facts({ facts }: { facts: NonNullable<StepCardFacts['facts']> }) {
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

/** The spend: the kit's meter in the money colour where a spend and a budget are measured, else its words in money. */
function Spend({ spend }: { spend: CardSpend }) {
  if (spend.kind === 'meter')
    return (
      <div data-step-spend="meter" className="border-t border-outline-variant pt-3">
        <Meter label={spend.label} value={spend.value} maxValue={spend.max} valueLabel={spend.said} showValue color="tertiary" />
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

/** The card's note, with its icon: in the failure's ink for a refusal, muted for every other. */
function Note({ note }: { note: CardNote }) {
  const Icon = NOTE_ICON[note.icon];
  return (
    <div data-step-note className={cn('flex items-start gap-2', note.icon === 'fail' ? ink.failure : 'text-on-surface-variant')}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="text-body-small break-words">{note.text}</span>
    </div>
  );
}

/**
 * A step's card, in the look's cut frame in the step's hue (`alive` at work, `yours` at a gate, none for the rest): its agent and the
 * step's word, its name with its tries and rounds, its time, its session's five facts, its spend, a note when there is one, and one
 * action, a link to the step's page. While the run's own answer is read, it says so in place of what it has not read.
 */
export function StepCard({ facts }: { facts: StepCardFacts }) {
  return (
    <CutFrame hue={facts.hue} size={24} className="w-[416px] max-w-full">
      <Content facts={facts} />
    </CutFrame>
  );
}

/** What the card holds inside its frame, top to bottom. */
function Content({ facts }: { facts: StepCardFacts }) {
  return (
    <div data-step-card data-step-kind={facts.kind} className="flex flex-col gap-3.5 p-4 text-on-surface">
      <Head facts={facts} />
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <Label component="span" size="large" className="uppercase">
          {facts.step}
        </Label>
        {facts.place && <span className="font-mono text-body-small text-on-surface-variant">{facts.place}</span>}
      </div>
      {facts.time && <Time time={facts.time} />}
      {facts.facts ? (
        <Facts facts={facts.facts} />
      ) : (
        <Body data-step-reading size="small" colorRole="on-surface-variant">
          Reading the step…
        </Body>
      )}
      {facts.spend && <Spend spend={facts.spend} />}
      {facts.note && <Note note={facts.note} />}
      <TextLink
        data-step-action
        to="/runs/$runId/steps/$step"
        params={{ runId: facts.action.runId, step: facts.action.step }}
        className="inline-flex min-h-10 items-center gap-1 self-start text-label-large uppercase"
      >
        {facts.action.words}
        <ChevronRight aria-hidden="true" className="size-4" />
      </TextLink>
    </div>
  );
}
