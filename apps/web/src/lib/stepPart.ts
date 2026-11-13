/**
 * A step's part: the one model every size of a step is drawn from — the graph's node (S), the preview card (M), and the ledger, the bar
 * and the step's page (L) — six slots in an order that never changes (`PART_SLOTS`), a size leaving slots out and never reordering
 * them (`slotsOf`). The head says who, what and where the step stands (the words the step's card said, written here once:
 * `headOf`, which `stepCard.ts` draws from); then what it asks of a person, what it got, by source, what it said, what it gave — its
 * declared fields drawn by their widgets, its files, its values and how many files it left unnamed — and the detail of the try shown.
 * A slot that does not apply to the step says `none`. Pure, so each state is proven without a browser.
 */
import type { HandedHow, StepPhase, TaskSource } from 'objects';
import type { AgentListing } from './api/agents.ts';
import type { StepArtifact, StepValue } from './api/tries.ts';
import { agentOf, type RunView, type StepSpecView } from './api/judged.ts';
import type { RunDetail, StepView } from './runView.ts';
import { packetsOf, type Packet, type PacketStep } from './canvas.ts';
import { fieldReadOf, widgetOf, type FieldWidget } from './fieldWidget.ts';
import { meaningOf } from './meaning.ts';
import { durationWords } from './duration.ts';
import { whenWords } from './runWords.ts';
import { stateDrawn, stepState, type StepState } from './status.ts';
import { stateWordsOf } from './words.ts';

/** The slots of a step's part, in the one order every size draws them in. */
export const PART_SLOTS = ['head', 'asks', 'got', 'said', 'gave', 'detail'] as const;

/** One of `PART_SLOTS`. */
type PartSlot = (typeof PART_SLOTS)[number];

/** The sizes a part is drawn at: on the graph's node, as the preview card, and whole (the ledger, the bar, the step's page). */
export type PartSize = 'S' | 'M' | 'L';

/** The slots each size draws: a smaller size leaves slots out, never reorders them. */
const SLOTS_AT: Record<PartSize, ReadonlySet<PartSlot>> = {
  S: new Set(['head', 'asks']),
  M: new Set(['head', 'asks', 'said', 'gave']),
  L: new Set(PART_SLOTS),
};

/** What a slot says where it does not apply to the step. */
export type None = 'none';

/** The card's five kinds, one a story: a step at work, at a gate (waiting on a person), done, to come, and failed. */
export type StepKind = 'work' | 'gate' | 'done' | 'come' | 'failed';

/** The hue of the head's frame: the look's `FrameHue`, said here where no component is loaded. */
type HeadHue = 'alive' | 'yours' | 'none';

/** The kit's `Tag` a kind is drawn with. */
type HeadTag = { word: string; color: 'secondary' | 'primary' | 'neutral' | 'error'; variant: 'tonal' | 'filled' | 'outlined' };

/** The time box: what it measures, its figure, a note beside it, and the ink of its figure. */
export type CardTime = { label: string; value: string; note: string; ink: 'alive' | 'yours' | 'failure' | 'plain' | 'muted' };

/** The spend: the kit's `Meter` where a spend and a budget are both measured, else words. */
export type CardSpend =
  | { kind: 'meter'; label: string; value: number; max: number; said: string }
  | { kind: 'words'; label: string; said: string; note: string };

/** A note under the facts, and the icon it is drawn with. */
export type CardNote = { text: string; icon: 'info' | 'shield' | 'fail' };

/** Who the step is given: its agent's name, its initial and its role. */
type Who = { name: string; initial: string; role: string };

/**
 * The head: the step's name, who it is given, its state and the word for it, its model, its time, its spend, its try and round, its
 * check, its gate, its session's five facts, its one note and its one action, and the tries a picker offers with the one shown. Each
 * fact that does not apply says `none`, as do the facts read from the run's own answer while it is read.
 */
export type PartHead = {
  step: string;
  kind: StepKind;
  hue: HeadHue;
  tag: HeadTag;
  state: StepState;
  word: string;
  who: Who | None;
  /** Its model, as its try was filed with or the run froze it; `none` where neither names one. */
  model: string;
  time: CardTime | None;
  spend: CardSpend | None;
  /** Its try and round, its check's word and its gate's words: each `none` where it does not apply, or while the answer is read. */
  round: string;
  check: string;
  gate: string;
  facts: Array<{ key: string; value: string }> | None;
  note: CardNote | None;
  action: { words: string; runId: string; step: string };
  tries: readonly number[];
  shown: number | null;
};

/** What the head reads: the run's row, the step's name, the run's own answer once read, the agents once read, and the instant now. */
export type HeadInput = {
  run: Pick<RunView, 'id' | 'cancelledAt' | 'holding' | 'steps'>;
  step: string;
  detail?: Pick<RunDetail, 'steps'> | undefined;
  agents?: ReadonlyArray<Pick<AgentListing, 'name' | 'role'>> | undefined;
  now: Date;
};

const TAGS: Record<StepKind, Omit<HeadTag, 'word'>> = {
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
function hueOf(state: StepState): HeadHue {
  const meaning = meaningOf(stateDrawn[state].hue);
  return meaning === 'alive' || meaning === 'yours' ? meaning : 'none';
}

/** Whether a state waits on a person: its drawing's meaning is `yours`. */
const waitsOnYou = (state: StepState): boolean => meaningOf(stateDrawn[state].hue) === 'yours';

/** How many rounds the step's loop may run: its own `rounds:`, or that of the step whose loop runs it again; null outside a loop. */
function roundsOf(step: StepView, steps: readonly StepView[]): number | null {
  return step.spec?.rounds ?? steps.find((other) => other.spec?.loop === step.name)?.spec?.rounds ?? null;
}

/**
 * The step's tries and rounds, never its place among the run's steps (the rail says it): `try 1 · round 1 of 3`, `2 tries` for a step
 * done after more than one, `up to 3 rounds` for a step to come in a loop, and `not started` for one outside it.
 */
function placeOf(step: StepView, steps: readonly StepView[], kind: StepKind): string {
  const rounds = roundsOf(step, steps);
  const current = step.tries.at(-1);
  if (!current) return rounds === null ? 'not started' : `up to ${rounds} rounds`;
  const tries = kind === 'done' && step.tries.length > 1 ? `${step.tries.length} tries` : `try ${current.try}`;
  return rounds === null ? tries : `${tries} · round ${current.round} of ${rounds}`;
}

/** When the step's last session started and ended and how long it ran, from its timeline, else from its latest attempt. */
function sessionOf(step: StepView): { start: string | null; end: string | null; ranMs: number | null } {
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
const ranNote = (step: StepView, ranMs: number | null): string =>
  ranMs === null ? '' : `${step.tries.length > 1 ? 'its last try ran' : 'ran'} ${durationWords(ranMs, 'minute')}`;

/**
 * The time box of each kind: at work for how long and since when, waiting since its session ended, done or failed at its end and how long
 * it ran, and to come after the steps it waits for.
 */
function timeOf(step: StepView, kind: StepKind, now: Date): CardTime {
  const { start, end, ranMs } = sessionOf(step);
  const since = (from: string, label: string, ink: CardTime['ink']): CardTime => ({
    label,
    value: durationWords(now.getTime() - Date.parse(from), 'minute'),
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

/** A context window in tokens as the head says it: `400k tokens`, or the model's whole window where the step sets none. */
const contextSaid = (tokens: number | null): string =>
  tokens === null ? 'whole window' : tokens >= 1000 ? `${Math.round(tokens / 1000)}k tokens` : `${tokens} tokens`;

/** The first of `values` that is set, else `default`. */
const firstSet = (...values: Array<string | null | undefined>): string => values.find((value) => value != null) ?? 'default';

/** The session's five facts, whole: its harness, model, effort, context and permission, from what its try was filed with first. */
function factsOf(step: StepView): Array<{ key: string; value: string }> {
  const { spec, filed } = step;
  return [
    { key: 'Harness', value: firstSet(spec?.harness) },
    { key: 'Model', value: firstSet(filed?.model, spec?.model) },
    { key: 'Effort', value: firstSet(filed?.effort, spec?.effort) },
    { key: 'Context', value: contextSaid(filed?.contextTokens ?? spec?.context ?? null) },
    { key: 'Permission', value: firstSet(filed?.fence, spec?.fence, spec?.sandbox) },
  ];
}

/**
 * The spend: at work, not measured yet, since a session's spend is measured when it ends; to come, its budget; else the kit's meter of
 * its spend against its budget, or its spend alone where it has none, or not measured where nothing was.
 */
function spendOf(step: StepView, kind: StepKind): CardSpend {
  const { spent, budget } = step;
  const of = budget ? `of ${budget.said}` : '';
  if (kind === 'work') return { kind: 'words', label: 'Spent', said: 'not measured yet', note: of };
  if (kind === 'come') return { kind: 'words', label: 'Budget', said: budget?.said ?? 'none set', note: '' };
  if (spent && budget) return { kind: 'meter', label: 'Spent', value: spent.usd, max: budget.usd, said: `${spent.said} of ${budget.said}` };
  return { kind: 'words', label: 'Spent', said: spent?.said ?? 'not measured', note: of };
}

/** The check's refusal, or null where its check did not refuse. */
const refusalOf = (step: StepView): string | null => (step.check?.refused ? `It failed its check (${step.check.refused.exit}).` : null);

/** What the step's check says: its verdict's word, the exit of one that failed, `not run yet` before its verdict; none without a check. */
function checkOf(step: StepView): string {
  const verdict = step.check?.verdict;
  if (!step.check) return 'none';
  if (!verdict) return 'not run yet';
  return verdict.result === 'failed' && verdict.exit !== null ? `failed (exit ${verdict.exit})` : verdict.result;
}

/** What the gate asks, or what a person said when they approved it; null for a step with no gate. */
function gateWords(step: StepView, now: Date): string | null {
  if (step.gate?.awaiting) return step.needs ?? 'It waits for your approval.';
  const approval = step.gate?.approval;
  return approval ? `Approved at ${whenWords(new Date(approval.at), now)}.` : null;
}

/**
 * The head's one note, the first that says something: the agent's last line, the calls its harness denied, its check's refusal, then
 * its gate's words; null when none does.
 */
function noteOf(step: StepView, now: Date): CardNote | null {
  if (step.lastLine) return { text: step.lastLine, icon: 'info' };
  if (step.denied) return { text: step.denied.words, icon: 'shield' };
  const refused = refusalOf(step);
  if (refused) return { text: refused, icon: 'fail' };
  const gate = gateWords(step, now);
  return gate ? { text: gate, icon: 'info' } : null;
}

/** The agent of a step, as the run froze it (`agentOf`), with its role from the agents' listing; none for a step that names none. */
function whoOf(name: string | null, agents: HeadInput['agents']): Who | None {
  if (!name) return 'none';
  const role = agents?.find((agent) => agent.name === name)?.role ?? '';
  return { name, initial: name.charAt(0).toUpperCase(), role };
}

/** The codes of a step the run's row does not list: one the engine has no record of, to come. */
const UNLISTED = { phase: 'pending', reason: 'Unknown', on: null, via: null } as const;

/** The head's facts read from the run's own answer, each `none` while it is read. */
type OwnFacts = Pick<PartHead, 'time' | 'spend' | 'round' | 'check' | 'gate' | 'facts' | 'note' | 'tries' | 'shown'>;

const UNREAD: OwnFacts = {
  time: 'none',
  spend: 'none',
  round: 'none',
  check: 'none',
  gate: 'none',
  facts: 'none',
  note: 'none',
  tries: [],
  shown: null,
};

/** The head's facts of `own`, a step of the run's own answer whose steps are `steps`, of kind `kind`. */
const ownFacts = (own: StepView, steps: readonly StepView[], kind: StepKind, now: Date): OwnFacts => ({
  time: timeOf(own, kind, now),
  spend: spendOf(own, kind),
  round: placeOf(own, steps, kind),
  check: checkOf(own),
  gate: gateWords(own, now) ?? 'none',
  facts: factsOf(own),
  note: noteOf(own, now) ?? 'none',
  tries: own.tries.map((t) => t.try),
  shown: own.shown,
});

/**
 * The head of the step `step` of `run`: what the run's row knows at once (its state, its agent, its model), and once the run's own answer
 * is read, its tries, time, facts, spend, check, gate and note — each `none` until then, or where it does not apply.
 */
export function headOf({ run, step, detail, agents, now }: HeadInput): PartHead {
  const row = run.steps.find((s) => s.name === step);
  const codes = row ?? UNLISTED;
  const state = stepState(codes, run.cancelledAt !== null, run.holding != null);
  const own = detail?.steps.find((s) => s.name === step);
  const kind = kindOf(codes.phase, state, Boolean(own && own.tries.length > 0));
  const word = stateWordsOf(state, codes.on, run.holding != null).rail;
  return {
    step,
    kind,
    hue: hueOf(state),
    tag: { word, ...TAGS[kind] },
    state,
    word,
    who: whoOf(row ? agentOf(row) : null, agents),
    model: own?.filed?.model ?? own?.spec?.model ?? row?.spec?.model ?? 'none',
    ...(own && detail ? ownFacts(own, detail.steps, kind, now) : UNREAD),
    action: { words: state === 'awaiting-approval' ? 'Read and approve' : 'Open the step', runId: run.id, step },
  };
}

/**
 * What the step asks of a person: its gate's approval while it awaits one (and the budgets it proposes), the questions its closeout asks,
 * what it needs, the calls its harness denied, and what it waits for with the advice beside it. Each null where it asks none of it.
 */
type PartAsks = {
  gate: NonNullable<StepView['gate']> | null;
  questions: NonNullable<StepView['closeout']>['questions'];
  needs: string | null;
  denied: StepView['denied'];
  waitingFor: StepView['waitingFor'];
};

/** What the step asks of a person while its state waits on one, and what it waits for whatever its state; none where it asks nothing. */
function asksOf(step: StepView, state: StepState): PartAsks | None {
  const yours = waitsOnYou(state);
  const asks: PartAsks = {
    gate: yours && step.gate?.awaiting ? step.gate : null,
    questions: yours ? (step.closeout?.questions ?? []) : [],
    needs: yours ? step.needs : null,
    denied: yours ? step.denied : null,
    waitingFor: step.waitingFor,
  };
  const asked = asks.gate || asks.questions.length > 0 || asks.needs || asks.denied || asks.waitingFor;
  return asked ? asks : 'none';
}

/** Where a line of what a step got came from, in the order Got draws them: you, steps, checks, other runs, the run, its agent. */
export const GOT_ORDER = ['you', 'step', 'check', 'other-run', 'run', 'agent'] as const;

/**
 * A line of what a step got: what a person said to it; what a step handed it, named by its packet where it is handed that step's declared
 * output; a check's verdict, and the step it judged; a run it was handed as context, what it asked and how it was handed; the run's own
 * sections; and its agent, with the skills it was given.
 */
type GotLine =
  | { from: 'you'; texts: readonly string[] }
  | { from: 'step'; step: string; packet: Packet | null; texts: readonly string[] }
  | { from: 'check'; step: string | null; texts: readonly string[] }
  | { from: 'other-run'; run: string; asked: string; body: string; how: HandedHow | null }
  | { from: 'run'; texts: readonly string[] }
  | { from: 'agent'; agent: string | null; text: string | null; skills: readonly string[] };

/** The text parts of a task that came from `source` (the run's take every part the read did not cut), and the step that gave each. */
const textsFrom = (step: StepView, source: TaskSource): Array<{ text: string; step: string | null }> =>
  (step.taskParts ?? []).flatMap((part) =>
    part.kind === 'text' && (part.source ?? 'run') === source ? [{ text: part.text, step: part.step ?? null }] : [],
  );

/** The names of `items`' steps, each once, in their order: null for an item with none. */
const stepsOf = (items: ReadonlyArray<{ step: string | null }>): Array<string | null> => [...new Set(items.map((i) => i.step))];

/**
 * What the step got, a line per source in `GOT_ORDER`: you; each step that handed it a part, or whose declared output it is handed (its
 * packet), in the order its task names them, then its input's; each check; each run it was handed; the run's own sections; and its agent.
 */
function gotOf(step: StepView, packets: readonly Packet[]): GotLine[] {
  const into = packets.filter((p) => p.to === step.name);
  const packetOf = (giver: string): Packet | null => into.find((p) => p.from === giver) ?? null;
  const you = textsFrom(step, 'person');
  const handed = textsFrom(step, 'step');
  const givers = [...new Set([...stepsOf(handed).flatMap((s) => (s === null ? [] : [s])), ...into.map((p) => p.from)])];
  const checks = textsFrom(step, 'check');
  const run = textsFrom(step, 'run');
  const layers = step.layers;
  const agent = agentOf(step);
  return [
    ...(you.length > 0 ? [{ from: 'you' as const, texts: you.map((t) => t.text) }] : []),
    ...givers.map((giver) => ({
      from: 'step' as const,
      step: giver,
      packet: packetOf(giver),
      texts: handed.filter((t) => t.step === giver).map((t) => t.text),
    })),
    ...stepsOf(checks).map((judged) => ({
      from: 'check' as const,
      step: judged,
      texts: checks.filter((t) => t.step === judged).map((t) => t.text),
    })),
    ...(step.taskParts ?? []).flatMap((part) =>
      part.kind === 'from'
        ? [{ from: 'other-run' as const, run: part.run, asked: part.asked, body: part.body, how: part.how ?? null }]
        : [],
    ),
    ...(run.length > 0 ? [{ from: 'run' as const, texts: run.map((t) => t.text) }] : []),
    ...(agent === null && layers?.agent == null
      ? []
      : [
          {
            from: 'agent' as const,
            agent,
            text: layers?.agent ?? null,
            skills: [...(layers?.agentSkills ?? []), ...(layers?.addedSkills ?? [])],
          },
        ]),
  ];
}

/** What the step said, of the try shown: its outcome, its summary, its account one fold down, what it needs; or why it does not read. */
type PartSaid =
  | {
      kind: 'closeout';
      outcome: NonNullable<StepView['closeout']>['outcome'];
      summary: string;
      account: string | null;
      needs: string | null;
    }
  | { kind: 'unreadable'; error: string };

/** What the step said, of the try shown; none before it signed off. */
function saidOf(step: StepView): PartSaid | None {
  const { closeout, unreadable } = step;
  if (closeout)
    return { kind: 'closeout', outcome: closeout.outcome, summary: closeout.summary, account: closeout.body, needs: closeout.needs };
  return unreadable ? { kind: 'unreadable', error: unreadable.error } : 'none';
}

/** A declared field of the step's output: its name, the widget that draws it, and its value; a dash (`given` false) before it is given. */
type GaveField = { name: string; widget: FieldWidget; given: boolean; value: unknown };

/**
 * What the step gave, of the try shown: its packet's label where a step takes its declared output, its declared fields in its schema's
 * order, then its files, its values, and how many files its folders hold that its closeout did not name.
 */
type PartGave = {
  packet: string | null;
  fields: readonly GaveField[];
  files: readonly StepArtifact[];
  values: readonly StepValue[];
  unnamed: number;
};

/** The step's declared fields: as the closeout's schema reads them, in its order; before a closeout, as the run froze them, each a dash. */
function fieldsOf(step: StepView, spec: StepSpecView | null): GaveField[] {
  const closeout = step.closeout;
  const declared = spec?.fields ?? [];
  if (!closeout) return declared.map((f) => ({ name: f.name, widget: widgetOf(fieldReadOf(null, f.shape)), given: false, value: null }));
  const shapeOf = (name: string) => closeout.shapes?.[name] ?? declared.find((f) => f.name === name)?.shape ?? null;
  const names = [...Object.keys(closeout.schema), ...declared.map((f) => f.name).filter((n) => !Object.hasOwn(closeout.schema, n))];
  return names.map((name) => ({
    name,
    widget: widgetOf(fieldReadOf(closeout.schema[name], shapeOf(name))),
    given: Object.hasOwn(closeout.output, name),
    value: Object.hasOwn(closeout.output, name) ? closeout.output[name] : null,
  }));
}

/** How many files the step's artifacts folder and its folder hold that its closeout did not name, each path counted once. */
function unnamedOf(step: StepView): number {
  const named = new Set((step.closeout?.artifacts ?? []).map((a) => a.path));
  const held = new Set([...(step.artifactsFolder?.files ?? []), ...step.files].map((f) => f.path));
  return [...held].filter((path) => !named.has(path)).length;
}

/** What the step gave, of the try shown; none where it declares nothing and gave nothing. */
function gaveOf(step: StepView, packets: readonly Packet[]): PartGave | None {
  const gave: PartGave = {
    packet: packets.find((p) => p.from === step.name)?.label ?? null,
    fields: fieldsOf(step, step.spec),
    files: step.closeout?.artifacts ?? [],
    values: step.closeout?.values ?? [],
    unnamed: unnamedOf(step),
  };
  return gave.fields.length + gave.files.length + gave.values.length + gave.unnamed > 0 ? gave : 'none';
}

/**
 * The detail, folded: the try shown and the tries a picker offers, how it was told (its body, its brief and its layers), its task by
 * part, its spec, its timeline, and the try its Debug (the lifecycle path) reads.
 */
type PartDetail = {
  shown: number | null;
  tries: readonly number[];
  body: string | null;
  told: string | null;
  layers: StepView['layers'];
  task: StepView['taskParts'];
  spec: StepSpecView | null;
  timeline: StepView['timeline'];
  debug: { try: number | null };
};

const detailOf = (step: StepView): PartDetail => ({
  shown: step.shown,
  tries: step.tries.map((t) => t.try),
  body: step.body,
  told: step.told,
  layers: step.layers,
  task: step.taskParts,
  spec: step.spec,
  timeline: step.timeline,
  debug: { try: step.shown },
});

/** A step's part: its six slots, each `none` where it does not apply; the head always does. */
export type StepPartModel = {
  head: PartHead;
  asks: PartAsks | None;
  got: readonly GotLine[] | None;
  said: PartSaid | None;
  gave: PartGave | None;
  detail: PartDetail | None;
};

/** A step as its packets count it: its input, and what its shown try gave (its output's fields and its files). */
const packetStepOf = (step: StepView): PacketStep => ({
  name: step.name,
  input: step.spec?.input ?? [],
  fields: Object.keys(step.closeout?.output ?? {}).length,
  files: step.closeout?.artifacts.length ?? 0,
});

/** Every packet of the run's view, each counted from its giver's shown try (`packetsOf`). */
export const packetsOfView = (view: Pick<RunDetail, 'steps'>): Packet[] => packetsOf(view.steps.map(packetStepOf));

/**
 * The part of the step `step` of the run's view `view`, of the try each step shows (`StepView.shown`, the address's choice): its head
 * (`headOf`), and once the step is in the view, what it asks, got, said and gave, and its detail; each `none` where it does not apply.
 */
export function stepPartOf(
  view: RunDetail,
  step: string,
  now: Date,
  agents?: ReadonlyArray<Pick<AgentListing, 'name' | 'role'>>,
): StepPartModel {
  const head = headOf({ run: view, step, detail: view, agents, now });
  const own = view.steps.find((s) => s.name === step);
  if (!own) return { head, asks: 'none', got: 'none', said: 'none', gave: 'none', detail: 'none' };
  const packets = packetsOfView(view);
  const got = gotOf(own, packets);
  return {
    head,
    asks: asksOf(own, head.state),
    got: got.length > 0 ? got : 'none',
    said: saidOf(own),
    gave: gaveOf(own, packets),
    detail: detailOf(own),
  };
}

/** The slots `size` draws of `part`, in `PART_SLOTS`' order, each with what it says. */
export const slotsOf = (part: StepPartModel, size: PartSize): Array<{ slot: PartSlot; value: StepPartModel[PartSlot] }> =>
  PART_SLOTS.filter((slot) => SLOTS_AT[size].has(slot)).map((slot) => ({ slot, value: part[slot] }));
