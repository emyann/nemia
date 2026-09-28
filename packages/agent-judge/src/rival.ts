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
 * **Tuned once, on the runs it is scored on, and that is the whole of it.** One measurement, over the owner's 75
 * dispatched runs on 2026-09-19, which the README reports the same numbers from:
 *
 *   web    `apps/web` alone P 0.74 R 1.00; `apps/web` or `apps/api` P 0.71 R 1.00. The wording's two paths were kept
 *          over the better-scoring single one, because the question the judge is asked names both.
 *   plan   the two halves joined by *or* fire on 69 of the 75 briefs (P 0.25 R 1.00, 18 of 75 whole folders right), so
 *          they were joined by *and* instead: fires on 39 (P 0.28 R 0.65, 35 of 75).
 *
 * Nothing else was changed, and no word was added or removed after a score.
 */
import { folderOf } from './card.ts';

/** The paths the web question names. A brief that names one is guessed to change what a person loads in a browser. */
export const WEB_PATHS = ['apps/web', 'apps/api'] as const;

/** Words a person writing a brief uses when the design is not settled yet. */
export const PLANNING_WORDS = [
  'plan',
  'plans',
  'planned',
  'planner',
  'planning',
  'design',
  'designs',
  'designed',
  'decide',
  'decides',
  'decision',
  'decisions',
  'propose',
  'proposes',
  'proposal',
  'challenge',
  'challenges',
  'options',
  'trade-off',
  'trade-offs',
  'tradeoff',
  'tradeoffs',
] as const;

/** The parts of the repository, as `card.ts`'s `REPOSITORY` names them: a change across three is a change that spans. */
export const PARTS = ['packages/agent-runtime', 'packages/agent-orchestrator', 'apps/api', 'apps/web', 'workflows/'] as const;

/**
 * What a part was called before, and still counts as it: the briefs already in a store name the old folders, and a brief
 * scored again must count the parts it counted then.
 */
export const FORMERLY: Partial<Record<(typeof PARTS)[number], string>> = {
  'packages/agent-runtime': 'packages/agent-engine', // renamed on 2026-09-23
  'packages/agent-orchestrator': 'packages/agent-workflows', // renamed on 2026-09-23
};

/** Three or more parts named is "several parts that must agree". */
export const PARTS_FOR_PLAN = 3;

const WORD = new RegExp(`\\b(?:${PLANNING_WORDS.join('|')})\\b`, 'i');

/**
 * A path named as itself, not as the tail of a longer one. `workflows/` is the end of
 * `packages/agent-orchestrator/src/run.ts`, which briefs write constantly, so a plain `includes` counted one path as two
 * parts and the plan rule fired on briefs that name two. A part counts where nothing word-like runs into it.
 */
const pathIn = (path: string) => new RegExp(`(?<![\\w-])${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

const AT = Object.fromEntries([...WEB_PATHS, ...PARTS, ...Object.values(FORMERLY)].map((p) => [p, pathIn(p)]));

export const namesWeb = (brief: string): boolean => WEB_PATHS.some((p) => AT[p]!.test(brief));

export const planningWord = (brief: string): boolean => WORD.test(brief);

export const partsNamed = (brief: string): number =>
  PARTS.filter((p) => AT[p]!.test(brief) || (FORMERLY[p] !== undefined && AT[FORMERLY[p]]!.test(brief))).length;

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
