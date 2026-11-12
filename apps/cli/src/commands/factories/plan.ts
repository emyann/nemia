/**
 * What `nemia factory diff` prints of the preview the api answers (`FactoryPlan`): a templated factory's upgrade — what merges cleanly
 * and from which side, each conflict quoted, the plan's digest and the line that files it (`planLines`) — or a hand-made one's takeover
 * by a template (`adoptLines`); and the lines a person types to resolve a conflict or approve a proposal. Ported word for word from the
 * orchestrator's `planLines` (`factory/upgrade/merge.ts`) and `adoptLines` (`adopt/adopt.ts`). Pure.
 */
import type { FactoryAdoptPlan, FactoryUpgradePlan } from 'objects';

/** The version a base holds where no status names it, as the plan and the upgrade print it. */
export const UNKNOWN = 'a version no status names';

/** The line that resolves the conflict `at` of the factory `name`, as a person types it. */
export const resolveLine = (name: string, at: string): string => `nemia factory resolve ${name} '${at}' --ours|--theirs|--file <path>`;

/** The line that approves the proposal `proposal` resolving conflicts of the factory `name`, as a person types it. */
export const approveLine = (name: string, proposal: string): string => `nemia proposals approve ${proposal} -n ${name}`;

/** Where a clean change came from, as the plan says it. */
const FROM = { template: 'the template', factory: 'your tree', both: 'both, merged' } as const;

/** The lines of `text`, each without its newline: none for an empty text. */
const linesOf = (text: string): string[] => (text === '' ? [] : text.split(/(?<=\n)/).map((line) => line.replace(/\n$/, '')));

/** A side as the plan quotes it: each line indented under its name, or that it has none. */
function sideLines(name: string, text: string | null): string[] {
  if (text === null) return [`    ${name}: none`];
  return [`    ${name}:`, ...linesOf(text).map((line) => `      | ${line}`)];
}

/** The head of an upgrade's plan: the versions, or, for a switch, both templates and that the merge has no common base. */
function headLines({ name, from, to, switched }: FactoryUpgradePlan): string[] {
  const was = from ?? UNKNOWN;
  if (switched === undefined) return [was === to ? `${name}: its parameters at ${to}` : `${name}: ${was} → ${to}`];
  return [
    `${name}: ${switched.from} ${was} → ${switched.to} ${to}`,
    `switch: ${switched.to} is another template than ${switched.from}, the one ${name}'s base was rendered from, so the merge has no common base: nothing tells your own work from what ${switched.from} left, and each conflict below, a file only your tree holds among them, asks your choice`,
  ];
}

/**
 * What `nemia factory diff` prints of a templated factory's upgrade: where it is a switch, both templates; what merges cleanly, then
 * each conflict, its base side where it has one, the parameters the upgrade drops where any, the plan's digest, and the line that files
 * it; then, where there are conflicts, the line that resolves each, after the upgrade's, since a resolve is taken for a filed upgrade.
 */
export function planLines(plan: FactoryUpgradePlan): string[] {
  const { name, merge, next } = plan;
  const lines = headLines(plan);
  lines.push(`merges cleanly: ${merge.merged.length}`);
  for (const merged of merge.merged) lines.push(`  ${merged.at}  from ${FROM[merged.from]}`);
  lines.push(`conflicts: ${merge.conflicts.length}`);
  for (const conflict of merge.conflicts)
    lines.push(
      `  ${conflict.at}`,
      ...(merge.base === 'none' ? [] : sideLines('base', conflict.base)),
      ...sideLines('ours', conflict.ours),
      ...sideLines('theirs', conflict.theirs),
    );
  if (next.dropped.length) lines.push(`dropped: ${next.dropped.join(', ')}`);
  lines.push(`plan: ${next.digest}`);
  if (!merge.conflicts.length) return [...lines, `${next.line} files it; the daemon merges it on its next pass.`];
  return [
    ...lines,
    `first, ${next.line} files it; then a choice for each conflict:`,
    ...merge.conflicts.map((conflict) => `    ${resolveLine(name, conflict.at)}`),
    'the daemon merges once each conflict is resolved.',
  ];
}

/** `names` as a list a person reads, or `none`. */
const listed = (names: readonly string[]): string => (names.length ? names.join(', ') : 'none');

/** A hire's change as a line: the step, and the agent it had and has. */
const hireLine = (h: FactoryAdoptPlan['plan']['hires'][number]): string =>
  h.kind === 'added'
    ? `  + ${h.step}: ${h.now ?? ''}`
    : h.kind === 'dropped'
      ? `  - ${h.step}: ${h.was ?? ''}`
      : `  ~ ${h.step}: ${h.was ?? ''} → ${h.now ?? ''}`;

/** The runs a takeover finds waiting or in flight, and the policy they follow after it. */
const runsLine = ({ ids, policy }: FactoryAdoptPlan['plan']['runs']): string =>
  ids.length
    ? `runs waiting or in flight: ${ids.join(', ')} — each keeps the workflow frozen on its record; ${policy === 'follow' ? "under follow, each takes the tree's hires and rules at its next step" : 'under pinned, each keeps what it resolved'}`
    : 'runs waiting or in flight: none';

/**
 * What `nemia factory diff` prints of a hand-made factory's takeover: what stays, what the template rewires, the rules no longer read and
 * the line that writes them into the tree, the runs waiting or in flight, what it would strand, and the line to type, which carries the
 * plan's digest. Nothing is written.
 */
export function adoptLines({ plan, digest, line }: FactoryAdoptPlan): string[] {
  const { factory, kept, workflows, hires, revisions, rules, stranded } = plan;
  const blocked = stranded.cards.length > 0 || stranded.schedules.length > 0;
  return [
    `${factory}: taken over by the template, in place — nothing is written until nemia factory adopt`,
    `stays: its name, its repositories (${listed(kept.repos)}), its schedules (${listed(kept.schedules)}), ${kept.instruction ? 'its instruction' : 'no instruction'}, its volumes (${listed(kept.volumes)}), its harness settings (${listed(kept.settings)}), its cards, its runs and its stats`,
    `workflows: + ${listed(workflows.added)}; - ${listed(workflows.dropped)}; kept ${listed(workflows.kept)}`,
    hires.length ? 'hires:' : 'hires: unchanged',
    ...hires.map(hireLine),
    revisions.was === revisions.now ? `revisions: ${revisions.now}, unchanged` : `revisions: ${revisions.was} → ${revisions.now}`,
    ...(rules === null
      ? []
      : [
          `rules: ${rules} will no longer be read; the tree's are. To keep them, write them into the tree once it is taken over: nemia factory rules ${factory} --file ${rules}`,
        ]),
    runsLine(plan.runs),
    ...stranded.cards.map((c) => `stranded: the card ${c.name}, filed for ${c.workflow ?? ''}, which the template does not offer`),
    ...stranded.schedules.map(
      (w) => `stranded: the schedule of ${w}, which the template does not offer — nemia factory unschedule ${factory} ${w}`,
    ),
    `plan: ${digest}`,
    blocked ? 'nemia factory adopt refuses this takeover until nothing is stranded.' : `to take it over: ${line}`,
  ];
}
