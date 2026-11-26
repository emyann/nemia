/**
 * What a step asks of its model, judged against the harness's recorded list (`modelJudged`), and the words a refusal says it in: the
 * pieces the load, the start (`--model`, a card's `model:`) and the retry (`--model`) each put their own opening on.
 */
import { fenceReach } from 'agent-runtime/vocabulary';
import { modeOf } from '../former/former.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import type { StepSpec } from '../step/step.ts';
import { modelJudged, type ModelJudged, type ModelListed } from './models.ts';

/** A step's fence word, as `modeOf` reads it. */
type FenceWord = Parameters<typeof modeOf>[0];

/** The models each harness lists as the store last recorded them, by the harness's name: a harness with no entry has no list. */
export type ModelLists = Readonly<Record<string, readonly ModelListed[]>>;

/**
 * The models `lists` holds for the step's harness (`DEFAULT_HARNESS` where it names none): undefined where none is recorded.
 * @param harness The step's harness, or undefined for the default one.
 * @param lists What each harness lists, as recorded; undefined where none is recorded.
 */
export const listedFor = (harness: string | undefined, lists: ModelLists | undefined) => {
  const name = harness ?? DEFAULT_HARNESS;
  return lists !== undefined && Object.hasOwn(lists, name) ? lists[name] : undefined;
};

/**
 * How `model`, named on `harness`, stands against the list that harness recorded in `lists`: judged with the mode the session runs in
 * (the one named, else the one it is filed in) and its effort. Pure.
 * @param model The model named.
 * @param harness The harness the session runs on, or undefined for the default one.
 * @param named The mode or sandbox named for the session, or undefined where none is.
 * @param effort The effort named for the session, or undefined where none is.
 * @param lists What each harness lists, as recorded; undefined where none is recorded.
 */
export function harnessModelJudged(
  model: string,
  harness: string | undefined,
  named: string | undefined,
  effort: string | undefined,
  lists: ModelLists | undefined,
) {
  const reach = fenceReach(harness ?? DEFAULT_HARNESS);
  return modelJudged(model, listedFor(harness, lists), { mode: named ?? reach?.given, effort, autoMode: reach?.autoMode });
}

/**
 * How `model`, named for `step`, stands against the list its harness recorded in `lists`, as `harnessModelJudged` judges it with the
 * step's own fence and effort. Pure.
 * @param model The model named for the step.
 * @param step The step, with its harness, fence word and effort.
 * @param lists What each harness lists, as recorded; undefined where none is recorded.
 */
export const stepModelJudged = (model: string, step: Pick<StepSpec, 'harness' | 'effort'> & FenceWord, lists: ModelLists | undefined) =>
  harnessModelJudged(model, step.harness, modeOf(step), step.effort, lists);

/**
 * The words that say why `model` is refused for a step as `judged` says, naming what to write instead; undefined where it is taken or not
 * judged. Pure.
 * @param model The model named.
 * @param judged How it stands (`stepModelJudged`).
 * @param listed The harness's list the judgement was made against.
 */
export function modelWords(model: string, judged: ModelJudged, listed: readonly ModelListed[] = []) {
  const ids = listed.map((m) => m.id).join(', ');
  switch (judged.kind) {
    case 'unchecked':
    case 'listed':
      return undefined;
    case 'alias':
      return `\`${model}\` is an alias, and a step runs on the id its harness lists for it: write \`${judged.id}\`. The ids it lists: ${ids}.`;
    case 'unlisted':
      return `\`${model}\` is no model its harness lists. The ids it lists: ${ids}.`;
    case 'mode-dropped':
      return `\`${model}\` drops \`${judged.mode}\`: the session would run in \`default\`, and a job denies every call \`default\` would ask about. Name a mode it keeps in the step's fence, or a model that keeps \`${judged.mode}\`: ${listed
        .filter((m) => m.keepsAuto !== false)
        .map((m) => m.id)
        .join(', ')}.`;
    case 'effort-unlisted':
      return `\`${model}\` does not take the step's effort. The levels it takes: ${judged.efforts.join(', ')}.`;
  }
}

/**
 * Why the model `step` names does not load, or undefined where it names none or the list holds it: `<step>: model …` with what to write.
 * @param step The step as resolved, with its agent's model where it names none.
 * @param lists What each harness lists, as recorded; undefined where none is recorded.
 */
export function stepModelRefusal(step: Pick<StepSpec, 'name' | 'model' | 'harness' | 'effort'> & FenceWord, lists: ModelLists | undefined) {
  if (step.model === undefined || step.model === 'inherit') return undefined;
  const words = modelWords(step.model, stepModelJudged(step.model, step, lists), listedFor(step.harness, lists));
  return words === undefined ? undefined : `${step.name}: \`model: ${step.model}\`: ${words}`;
}
