/**
 * The plain-code rival: the same two properties, guessed from the brief's text alone, with no model and no request.
 *
 * Pure, and deliberately small. This is what the judge has to beat to earn its place: pivot §2.3 found that a fair
 * baseline — `'apps/web' in brief` — already scored P 0.94 on *whether the run's branch touched `apps/web`*, so a judge
 * that only matches it has bought nothing. (That is not the label here. `judge runs` scores against the folder a person
 * chose, which is a different question and a harder one: a brief can name `apps/web` and still be sent to `dev`.)
 *
 * The rules are the questions' own words in plain code, not a search for the best score:
 *
 *   web    the brief names `apps/web` or `apps/api` — the two paths the web question itself names.
 *   plan   the brief holds a planning word AND names three or more parts of the repository — the plan question's two
 *          halves, "leaves real design decisions open" and "changes several parts of the system together".
 *
 * **Tuned once, on the runs it is scored on, and that is the whole of it.** Over the owner's 74 dispatched runs on
 * 2026-09-19: `apps/web` alone scored P 0.71 R 1.00 on web and `apps/web` or `apps/api` P 0.68 R 1.00, and the wording's
 * two paths were kept over the better-scoring single one. On plan, the two halves joined by *or* fired on 69 of the 74
 * briefs (P 0.23 R 1.00, 15 of 74 whole folders right), so they were joined by *and* instead (P 0.23 R 0.75, 22 of 74).
 * Nothing else was changed, and no word was added or removed after a score. The README says the same.
 */
import { folderOf } from './card.ts';

/** The paths the web question names. A brief that names one is guessed to change what a person loads in a browser. */
export const WEB_PATHS = ['apps/web', 'apps/api'] as const;

/** Words a person writing a brief uses when the design is not settled yet. */
export const PLANNING_WORDS = [
  'plan', 'plans', 'planned', 'planner', 'planning', 'design', 'designs', 'designed', 'decide', 'decides',
  'decision', 'decisions', 'propose', 'proposes', 'proposal', 'challenge', 'challenges', 'options', 'trade-off',
  'trade-offs', 'tradeoff', 'tradeoffs',
] as const;

/** The parts of the repository, as `card.ts`'s `REPOSITORY` names them: a change across three is a change that spans. */
export const PARTS = ['packages/agent-engine', 'packages/agent-workflows', 'apps/api', 'apps/web', 'workflows/'] as const;

/** Three or more parts named is "several parts that must agree". */
export const PARTS_FOR_PLAN = 3;

const WORD = new RegExp(`\\b(?:${PLANNING_WORDS.join('|')})\\b`, 'i');

export const namesWeb = (brief: string): boolean => WEB_PATHS.some((p) => brief.includes(p));

export const planningWord = (brief: string): boolean => WORD.test(brief);

export const partsNamed = (brief: string): number => PARTS.filter((p) => brief.includes(p)).length;

export type Guess = {
  readonly web: boolean;
  readonly plan: boolean;
  /** The folder the two properties name, through `card.ts`'s own function: the rival names folders the judge's way. */
  readonly folder: string;
};

/** Pure: no model, no request, no state but the brief's text. */
export const rival = (brief: string): Guess => {
  const web = namesWeb(brief);
  const plan = planningWord(brief) && partsNamed(brief) >= PARTS_FOR_PLAN;
  return { web, plan, folder: folderOf(plan, web) };
};
