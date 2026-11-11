/**
 * A factory's cost line per workflow (`costLines`): what a run of the workflow may cost before its gate says so, in dollars, set by the
 * person with `nemia factory cost-line set` and frozen on a run at its start (`Run.costLine`). A gate whose caps let the run cost more
 * says it (`GateBudgets.line`), and no rule of auto approves it unasked (`withinBudget`); it cuts nothing. Its refusals, and a line set
 * or taken back; `nemia factory ls` lists them (`costLineLines`, factory.ts). Pure.
 */
import { workflowNameRefusal, type Factory } from '../factory.ts';

/** A factory's cost lines, by the workflow's folder name, in dollars. */
export type CostLines = Readonly<Record<string, number>>;

/** Whether `usd` is an amount a line can be: dollars above zero, and finite, as a cap is. */
export const isLineAmount = (usd: number): boolean => Number.isFinite(usd) && usd > 0;

/**
 * Why `factory` cannot set a cost line of `usd` for `workflow`, or undefined: a workflow's name that is not one, a workflow it does not
 * offer (its attach named), or an amount that is not dollars above zero. Each ends saying nothing was changed.
 */
export function costLineRefusal(factory: Pick<Factory, 'name' | 'workflows'>, workflow: string, usd: number): string | undefined {
  const badName = workflowNameRefusal(workflow);
  if (badName !== undefined) return `${badName} Nothing was changed.`;
  if (!factory.workflows.includes(workflow))
    return `${factory.name} does not offer the workflow ${workflow}, so no run of it has a line to pass. Attach it first — nemia factory attach ${factory.name} ${workflow} — then set its line. Nothing was changed.`;
  if (!isLineAmount(usd))
    return `a cost line is dollars above zero, in digits, like 80 or 12.50, and ${String(usd)} is not one: nemia factory cost-line set ${factory.name} ${workflow} <usd>. Nothing was changed.`;
  return undefined;
}

/** Why `factory` takes back no line of `workflow`: it sets none, naming those it sets. */
export const unsetCostLineRefusal = (factory: Pick<Factory, 'name' | 'costLines'>, workflow: string): string => {
  const set = Object.keys(factory.costLines ?? {}).sort();
  return `${factory.name} sets no cost line for ${workflow}. ${set.length ? `It sets one for: ${set.join(', ')}.` : 'It sets none.'} Nothing was changed.`;
};

/** `lines` with `usd` for `workflow`, an earlier line of it replaced. */
export const withCostLine = (lines: CostLines | undefined, workflow: string, usd: number): Record<string, number> => ({
  ...lines,
  [workflow]: usd,
});

/** `lines` with none for `workflow`, or undefined where none is left. */
export const withoutCostLine = (lines: CostLines | undefined, workflow: string): Record<string, number> | undefined => {
  const { [workflow]: _gone, ...rest } = lines ?? {};
  return Object.keys(rest).length ? rest : undefined;
};
