/**
 * The templates' debt in the core, file by file, held by `template-names.test.ts`: each source file of a package or an app that says a
 * name a shipped template says today (its own, a workflow's, a step's, a parameter's or an output field's), with its count and the card
 * that removes it. The counts only shrink: a change that takes a name out of a file lowers its entry in the same commit, and the entry
 * goes once its file is clean.
 */

/** One file's debt: how many names it says, the card that clears them and why. */
export type TemplateDebt = { readonly count: number; readonly card: string; readonly why: string };

/** The filed cards that clear a template's name in the core, by the id an entry names. */
export const TEMPLATE_CARDS: Readonly<Record<string, string>> = {
  '7kuf': 'templates-a-run-s-github-wor-7kuf: a template says how its runs wait on CI, never the core',
};

/** Each core file that says a template's name today. */
export const TEMPLATE_NAMES: Readonly<Record<string, TemplateDebt>> = {
  'packages/agent-orchestrator/src/check/check.ts': {
    count: 1,
    card: '7kuf',
    why: "its deadline comment is sized on one template's CI wait",
  },
};
