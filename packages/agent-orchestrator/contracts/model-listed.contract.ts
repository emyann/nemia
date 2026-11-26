/**
 * A model named for a step judged against what its harness lists (src/workflow/models.ts, `modelJudged`): the one judgement an agent's or
 * a step's `model:`, a card's `model:`, `nemia start --model` and `nemia retry --model` are each refused by, in the words of what named it.
 *
 * The list is the harness's own, as the daemon last recorded it (`Engine.models`); `undefined` where none is recorded for the harness —
 * a store whose daemon has not asked yet, a harness that lists no models (codex) — and then nothing is judged (the person's answer,
 * 2026-11-26). Where a list is recorded: a canonical id it holds is taken; a word that resolves to one (an alias, `opus`) is refused,
 * naming the id; any other word is refused. A listed model is refused too where it drops the step's mode (the harness's auto mode, on a
 * model whose row says it does not keep it), and where the step's effort is not among the model's levels. A fact the harness does not
 * say (no auto-mode word, no effort levels) refuses nothing.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A model its harness lists, as far as a judgement reads it: its canonical id, the words that resolve to it, and two facts of it. */
export type ModelListed = {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly keepsAuto: boolean | undefined;
  readonly efforts: readonly string[] | undefined;
};

/** What the step asks of the session beside its model: its mode (named, else the one it is filed in) and its effort, each where it has one. */
export type ModelAsk = {
  readonly mode: string | undefined;
  readonly effort: string | undefined;
  /** The harness's word for the mode its rows' `supportsAutoMode` speaks of (Claude Code's `auto`); undefined for a harness with none. */
  readonly autoMode: string | undefined;
};

/** How a model named for a step stands against its harness's list. */
export type ModelJudged =
  | { readonly kind: 'unchecked' }
  | { readonly kind: 'listed' }
  | { readonly kind: 'alias'; readonly id: string }
  | { readonly kind: 'unlisted' }
  | { readonly kind: 'mode-dropped'; readonly mode: string }
  | { readonly kind: 'effort-unlisted'; readonly efforts: readonly string[] };

/** The model `listed` holds by the id `model`, if any. */
const byId = (listed: readonly ModelListed[], model: string) => listed.find((m) => m.id === model);

/** Whether `m` drops the mode `ask` runs in: the harness's auto mode, on a model whose row says it does not keep it. */
const dropsMode = (m: ModelListed, ask: ModelAsk) => ask.mode !== undefined && ask.mode === ask.autoMode && m.keepsAuto === false;

/** Whether `m` is refused the effort `ask` names: one it says its levels of, and not among them. */
const refusesEffort = (m: ModelListed, ask: ModelAsk) =>
  ask.effort !== undefined && m.efforts !== undefined && !m.efforts.includes(ask.effort);

/** Whether `a` and `b` hold the same words in the same order. */
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((w, i) => w === b[i]);

const modelJudgedSpec =spec<(model: string, listed: readonly ModelListed[] | undefined, ask: ModelAsk) => ModelJudged>({
  requires: ({ input: [model] }) => model !== '',
  ensures: {
    noListJudgesNothing: {
      description: 'Where no list is recorded for the harness, any model passes unchecked',
      condition: ({ input: [, listed], output }) => (listed === undefined) === (output.kind === 'unchecked'),
    },
    takenExactlyWhenListedAndKept: {
      description: 'A model is taken exactly when its harness lists it by that id, and it keeps the step’s mode and effort',
      condition: ({ input: [model, listed, ask], output }) => {
        const m = listed === undefined ? undefined : byId(listed, model);
        return (output.kind === 'listed') === (m !== undefined && !dropsMode(m, ask) && !refusesEffort(m, ask));
      },
    },
    anAliasNamesItsId: {
      description: 'A word the list holds as another id’s alias is refused, naming the id it resolves to',
      condition: ({ input: [model, listed], output }) => {
        if (listed === undefined || byId(listed, model) !== undefined) return true;
        const of = listed.find((m) => m.aliases.includes(model));
        return of === undefined || (output.kind === 'alias' && output.id === of.id);
      },
    },
    anyOtherWordIsUnlisted: {
      description: 'A word the list holds neither as an id nor as an alias is refused as unlisted',
      condition: ({ input: [model, listed], output }) =>
        listed === undefined ||
        listed.some((m) => m.id === model || m.aliases.includes(model)) ||
        output.kind === 'unlisted',
    },
    aDroppedModeIsSaid: {
      description: 'A listed model that drops the step’s mode is refused, naming the mode',
      condition: ({ input: [model, listed, ask], output }) => {
        const m = listed === undefined ? undefined : byId(listed, model);
        return m === undefined || !dropsMode(m, ask) || (output.kind === 'mode-dropped' && output.mode === ask.mode);
      },
    },
    anUnlistedEffortNamesTheLevels: {
      description: 'A listed model that keeps the mode but not the step’s effort is refused, naming the levels it has',
      condition: ({ input: [model, listed, ask], output }) => {
        const m = listed === undefined ? undefined : byId(listed, model);
        return (
          m === undefined ||
          dropsMode(m, ask) ||
          !refusesEffort(m, ask) ||
          (output.kind === 'effort-unlisted' && sameList(output.efforts, m.efforts ?? []))
        );
      },
    },
  },
});

/** `modelJudged`'s type, which src/workflow/models.ts takes. */
export type ModelJudgedOf = Implementation<typeof modelJudgedSpec>;
