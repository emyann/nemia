/**
 * What a step's card says, read from the run's own answer (`RunDetail`), the run's row on the list and the agents: the card's kind and
 * the hue of its frame, its tag, its agent, its tries and rounds, its time, its session's five facts, its spend, a note and its one
 * action, `Read and approve` at an approval's gate. Pure, so that each state is proven without a browser; `StepCard` draws it.
 */
import type { AgentListing } from './api/agents.ts';
import type { StepPhase } from './api/reasons.ts';
import type { RunDetail } from './api/detail.ts';
import type { RunSummary } from './api/runs.ts';
import { meaningOf } from './meaning.ts';
import { sinceShort, sinceWords, whenWords } from './runWords.ts';
import { stateDrawn, stepState, type StepState } from './status.ts';
import { stateWordsOf } from './words.ts';

/** The card's five kinds, one a story: a step at work, at a gate (waiting on a person), done, to come, and failed. */
export type StepKind = 'work' | 'gate' | 'done' | 'come' | 'failed';

/** The hue of the card's frame: the look's `FrameHue`, said here where no component is loaded. */
export type CardHue = 'alive' | 'yours' | 'none';

/** The kit's `Tag` a kind is drawn with. */
export type CardTag = { word: string; color: 'secondary' | 'primary' | 'neutral' | 'error'; variant: 'tonal' | 'filled' | 'outlined' };

/** The time box: what it measures, its figure, a note beside it, and the ink of its figure. */
export type CardTime = { label: string; value: string; note: string; ink: 'alive' | 'yours' | 'failure' | 'plain' | 'muted' };

/** The spend: the kit's `Meter` where a spend and a budget are both measured, else words. */
export type CardSpend =
  | { kind: 'meter'; label: string; value: number; max: number; said: string }
  | { kind: 'words'; label: string; said: string; note: string };

/** A note under the facts, and the icon it is drawn with. */
export type CardNote = { text: string; icon: 'info' | 'shield' | 'fail' };

/** Everything the card draws; `facts`, `time` and `spend` are null while the run's own answer is read. */
export type StepCardFacts = {
  kind: StepKind;
  hue: CardHue;
  tag: CardTag;
  agent: { name: string; initial: string; role: string } | null;
  step: string;
  place: string | null;
  time: CardTime | null;
  facts: Array<{ key: string; value: string }> | null;
  spend: CardSpend | null;
  note: CardNote | null;
  action: { words: string; runId: string; step: string };
};

/** A step of the run's own answer. */
type DetailStep = RunDetail['steps'][number];

/** What the card reads: the run's row, the step's name, the run's own answer once read, the agents once read, and the instant now. */
export type StepCardInput = {
  run: Pick<RunSummary, 'id' | 'cancelledAt' | 'holding' | 'steps'>;
  step: string;
  detail?: Pick<RunDetail, 'steps'> | undefined;
  agents?: ReadonlyArray<Pick<AgentListing, 'name' | 'role'>> | undefined;
  now: Date;
};

const TAGS: Record<StepKind, Omit<CardTag, 'word'>> = {
  work: { color: 'secondary', variant: 'tonal' },
  gate: { color: 'primary', variant: 'filled' },
  done: { color: 'neutral', variant: 'tonal' },
  come: { color: 'secondary', variant: 'outlined' },
  failed: { color: 'error', variant: 'tonal' },
};

/** The kind of each phase that says it alone; a step to come or stopped is done where a session of it ran, else to come. */
const KIND_OF: Record<Exclude<StepPhase, 'pending' | 'stopped'>, StepKind> = {
  running: 'work',
  waiting: 'gate',
  succeeded: 'done',
  failed: 'failed',
};

/**
 * A step's kind, by its phase (`KIND_OF`): at work while it or its check runs, at a gate while it waits on a person, done, failed, and
 * for a step to come or stopped, done where a session of it ran, else to come. A step a person's hold of the run stops (`held`) asks
 * nothing of anyone while the hold stands: no gate, as a step to come.
 */
export function kindOf(phase: StepPhase, state: StepState, ran: boolean): StepKind {
  if (phase === 'pending' || phase === 'stopped' || state === 'held') return ran ? 'done' : 'come';
  return KIND_OF[phase];
}

/** The frame's hue for a state, its drawing's own: `alive` at work, `yours` where it waits on a person, and none for every other. */
export function hueOf(state: StepState): CardHue {
  const meaning = meaningOf(stateDrawn[state].hue);
  return meaning === 'alive' || meaning === 'yours' ? meaning : 'none';
}

/** How many rounds the step's loop may run: its own `rounds:`, or that of the step whose loop runs it again; null outside a loop. */
function roundsOf(step: DetailStep, steps: readonly DetailStep[]): number | null {
  return step.spec?.rounds ?? steps.find((other) => other.spec?.loop === step.name)?.spec?.rounds ?? null;
}

/**
 * The step's tries and rounds, never its place among the run's steps (the rail says it): `try 1 · round 1 of 3`, `2 tries` for a step
 * done after more than one, `up to 3 rounds` for a step to come in a loop, and `not started` for one outside it.
 */
export function placeOf(step: DetailStep, steps: readonly DetailStep[], kind: StepKind): string {
  const rounds = roundsOf(step, steps);
  const current = step.tries.at(-1);
  if (!current) return rounds === null ? 'not started' : `up to ${rounds} rounds`;
  const tries = kind === 'done' && step.tries.length > 1 ? `${step.tries.length} tries` : `try ${current.try}`;
  return rounds === null ? tries : `${tries} · round ${current.round} of ${rounds}`;
}

/** When the step's last session started and ended and how long it ran, from its timeline, else from its latest attempt. */
function sessionOf(step: DetailStep): { start: string | null; end: string | null; ranMs: number | null } {
  const session = [...step.timeline].reverse().find((entry) => entry.session !== null)?.session ?? null;
  const latest = step.attempts.latest;
  return {
    start: session?.spawnedAt ?? latest?.startedAt ?? null,
    end: session?.endedAt ?? latest?.endedAt ?? null,
    ranMs: session?.ranMs ?? null,
  };
}

/** A time box whose instant is not known: its label and a dash. */
const untimed = (label: string, ink: CardTime['ink']): CardTime => ({ label, value: '—', note: '', ink });

/** How long its last session ran, said under an ended step's instant. */
const ranNote = (step: DetailStep, ranMs: number | null): string =>
  ranMs === null ? '' : `${step.tries.length > 1 ? 'its last try ran' : 'ran'} ${sinceWords(ranMs)}`;

/**
 * The time box of each kind: at work for how long and since when, waiting since its session ended, done or failed at its end and how long
 * it ran, and to come after the steps it waits for.
 */
export function timeOf(step: DetailStep, kind: StepKind, now: Date): CardTime {
  const { start, end, ranMs } = sessionOf(step);
  const since = (from: string, label: string, ink: CardTime['ink']): CardTime => ({
    label,
    value: sinceShort(now.getTime() - Date.parse(from)),
    note: `since ${whenWords(new Date(from), now)}`,
    ink,
  });
  const at = (label: string, ink: CardTime['ink']): CardTime =>
    end === null ? untimed(label, ink) : { label, value: whenWords(new Date(end), now), note: ranNote(step, ranMs), ink };
  if (kind === 'work') return start === null ? untimed('At work', 'alive') : since(start, 'At work', 'alive');
  if (kind === 'gate') {
    const from = end ?? start;
    return from === null ? untimed('Waiting', 'yours') : since(from, 'Waiting', 'yours');
  }
  if (kind === 'failed') return at('Failed', 'failure');
  if (kind === 'done') return at('Done', 'plain');
  const after = step.spec?.after ?? [];
  return { label: 'Starts', value: after.length > 0 ? `after ${after.join(', ')}` : 'when filed', note: '', ink: 'muted' };
}

/** A context window in tokens as the card says it: `400k tokens`, or the model's whole window where the step sets none. */
const contextSaid = (tokens: number | null): string =>
  tokens === null ? 'whole window' : tokens >= 1000 ? `${Math.round(tokens / 1000)}k tokens` : `${tokens} tokens`;

/** The session's five facts, whole: its harness, model, effort, context and permission, from what its try was filed with first. */
export function factsOf(step: DetailStep): Array<{ key: string; value: string }> {
  const { spec, filed } = step;
  const first = (...values: Array<string | null | undefined>): string => values.find((value) => value != null) ?? 'default';
  return [
    { key: 'Harness', value: first(spec?.harness) },
    { key: 'Model', value: first(filed?.model, spec?.model) },
    { key: 'Effort', value: first(filed?.effort, spec?.effort) },
    { key: 'Context', value: contextSaid(filed?.contextTokens ?? spec?.context ?? null) },
    { key: 'Permission', value: first(filed?.permissionMode, spec?.permissionMode, spec?.sandbox) },
  ];
}

/**
 * The spend: at work, not measured yet, since a session's spend is measured when it ends; to come, its budget; else the kit's meter of
 * its spend against its budget, or its spend alone where it has none, or not measured where nothing was.
 */
export function spendOf(step: DetailStep, kind: StepKind): CardSpend {
  const { spent, budget } = step;
  const of = budget ? `of ${budget.said}` : '';
  if (kind === 'work') return { kind: 'words', label: 'Spent', said: 'not measured yet', note: of };
  if (kind === 'come') return { kind: 'words', label: 'Budget', said: budget?.said ?? 'none set', note: '' };
  if (spent && budget) return { kind: 'meter', label: 'Spent', value: spent.usd, max: budget.usd, said: `${spent.said} of ${budget.said}` };
  return { kind: 'words', label: 'Spent', said: spent?.said ?? 'not measured', note: of };
}

/** The check's refusal, or null where its check did not refuse. */
const refusalOf = (step: DetailStep): string | null => (step.check?.refused ? `It failed its check (${step.check.refused.exit}).` : null);

/** What the gate asks, or what a person said when they approved it; null for a step with no gate. */
function gateWords(step: DetailStep, now: Date): string | null {
  if (step.gate?.awaiting) return step.needs ?? 'It waits for your approval.';
  const approval = step.gate?.approval;
  return approval ? `Approved at ${whenWords(new Date(approval.at), now)}.` : null;
}

/**
 * The card's one note, the first that says something: the agent's last line, the calls its harness denied, its check's refusal, then
 * its gate's words; null when none does.
 */
export function noteOf(step: DetailStep, now: Date): CardNote | null {
  if (step.lastLine) return { text: step.lastLine, icon: 'info' };
  if (step.denied) return { text: step.denied.words, icon: 'shield' };
  const refused = refusalOf(step);
  if (refused) return { text: refused, icon: 'fail' };
  const gate = gateWords(step, now);
  return gate ? { text: gate, icon: 'info' } : null;
}

/** The agent of a step, by the run's row, with its role from the agents' listing; null for a step that names none. */
function agentOf(name: string | null, agents: StepCardInput['agents']): StepCardFacts['agent'] {
  if (!name) return null;
  const role = agents?.find((agent) => agent.name === name)?.role ?? '';
  return { name, initial: name.charAt(0).toUpperCase(), role };
}

/** The codes of a step the run's row does not list: one the engine has no record of, to come. */
const UNLISTED = { phase: 'pending', reason: 'Unknown', on: null, via: null } as const;

/**
 * The card of the step `step` of `run`: what the run's row knows at once (its state, its agent), and once the run's own answer is read,
 * its tries, time, facts, spend and note.
 */
export function stepCardOf({ run, step, detail, agents, now }: StepCardInput): StepCardFacts {
  const row = run.steps.find((s) => s.name === step);
  const codes = row ?? UNLISTED;
  const { phase } = codes;
  const state = stepState(codes, run.cancelledAt !== null, run.holding != null);
  const own = detail?.steps.find((s) => s.name === step);
  const kind = kindOf(phase, state, Boolean(own && own.tries.length > 0));
  return {
    kind,
    hue: hueOf(state),
    tag: { word: stateWordsOf(state, codes.on, run.holding != null).rail, ...TAGS[kind] },
    agent: agentOf(row?.agent ?? null, agents),
    step,
    place: own && detail ? placeOf(own, detail.steps, kind) : null,
    time: own ? timeOf(own, kind, now) : null,
    facts: own ? factsOf(own) : null,
    spend: own ? spendOf(own, kind) : null,
    note: own ? noteOf(own, now) : null,
    action: { words: state === 'awaiting-approval' ? 'Read and approve' : 'Open the step', runId: run.id, step },
  };
}
