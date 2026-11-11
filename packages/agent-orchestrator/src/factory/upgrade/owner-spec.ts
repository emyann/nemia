/**
 * The spec an owner of an upgrade's conflicts proposes, as the person's choices compose its files from the merge (`ownerSpec`): a Workflow
 * its folder's text files (`workflowSpecOf`); an Agent its file and the result schema its `output:` names (`agentSpecOf`); a Skill its
 * SKILL.md and its folder's other text files (`skillSpecOf`); a Hire the wiring's value for its step; the Factory its rules and its
 * instruction. One reading each with what the tree holds now (`currentOf`), so the proposal reads as a change of only what was chosen.
 * Its removal (`undefined`) where the composition leaves the owner no file — a Workflow, an Agent — or a Hire fired. Refused `Invalid`,
 * the choices kept: a composition that does not read; a workflow left with files but no step; and the removal of what no proposal
 * removes, a Skill, the rules or the instruction. Pure.
 */
import { Invalid } from '../../refusal/refusal.ts';
import { textIn } from '../../folder/folder.ts';
import { parseAgent, skillTurnCost } from '../../agents/agents.ts';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../../step/step.ts';
import { agentSpecOf, skillSpecOf, workflowSpecOf } from '../../propose/index.ts';
import { compose, type Choice, type TreeMerge } from './merge.ts';
import { WIRING_FILE } from './resolution.ts';
import type { ResolutionOwner } from '../../../contracts/resolution.contract.ts';

/** The text files of a composed tree, by their path in it. */
type Texts = ReadonlyMap<string, string>;

/** `choices` with each conflict of `merge` left without one given `'ours'`: what a part of the merge is composed with. */
const filledFor = (merge: TreeMerge, choices: Readonly<Record<string, Choice>>): Record<string, Choice> =>
  Object.fromEntries(merge.conflicts.map((c) => [c.at, choices[c.at] ?? 'ours']));

/** The text files of the tree `merge` composes with `choices`, a conflict with no choice taken as the tree has it. */
export function composedTexts(merge: TreeMerge, choices: Readonly<Record<string, Choice>>): Texts {
  const composed = compose(merge, filledFor(merge, choices));
  const entries = 'entries' in composed ? composed.entries : [];
  return new Map(
    entries.flatMap((entry) => {
      const text = textIn(entry.bytes);
      return text === null ? [] : [[entry.path, text] as const];
    }),
  );
}

/** The files of `texts` under `prefix`, each by its path after it, at any depth, or directly in it alone (`direct`). */
const under = (texts: Texts, prefix: string, direct: boolean): { path: string; text: string }[] =>
  [...texts]
    .filter(([at]) => at.startsWith(prefix) && !(direct && at.slice(prefix.length).includes('/')))
    .map(([at, text]) => ({ path: at.slice(prefix.length), text }));

/** What a refusal of `nemia factory resolve` says last: nothing proposed, the choice kept, and how to choose again. */
export const keptLine = (factory: string, owner: ResolutionOwner): string =>
  `Nothing was proposed; your choice is kept. Choose again for a conflict of the ${owner.kind} ${owner.name} to propose it again ` +
  `(nemia factory resolve ${factory} <conflict> --ours|--theirs|--file <path>).`;

/** A removal no proposal makes, refused: what to type instead. */
const unremovable = (factory: string, owner: ResolutionOwner, what: string): Invalid =>
  new Invalid({
    message: `nemia factory resolve: your choices remove ${what}, which no proposal removes: keep it, --ours or --file <path> on its conflict. ${keptLine(factory, owner)}`,
  });

/** `read()`, or `Invalid` saying the owner as the choices compose it does not read. */
function readOrRefused<A>(factory: string, owner: ResolutionOwner, read: () => A): A {
  try {
    return read();
  } catch (err) {
    throw new Invalid({
      message: `nemia factory resolve: the ${owner.kind} ${owner.name} as your choices compose it does not read: ${err instanceof Error ? err.message : String(err)} ${keptLine(factory, owner)}`,
    });
  }
}

/** The Workflow `name` as `texts` compose its folder, its removal where it is left no file. */
function workflowOf(factory: string, owner: ResolutionOwner, texts: Texts): unknown {
  const files = under(texts, `workflows/${owner.name}/`, true).map(({ path, text }) => ({ name: path, text }));
  if (files.length === 0) return undefined;
  const spec = readOrRefused(factory, owner, () => workflowSpecOf(files));
  if (spec.steps.length === 0)
    throw new Invalid({
      message: `nemia factory resolve: your choices leave the workflow ${owner.name} with no step, and a workflow has one at least: keep a step's file, --ours or --theirs on its conflict. ${keptLine(factory, owner)}`,
    });
  return spec;
}

/** The Agent `name` as `texts` compose its file and its result schema, its removal where it is left no file. */
function agentOf(factory: string, owner: ResolutionOwner, texts: Texts): unknown {
  const folder = `workflows/${AGENTS_FOLDER}/`;
  const text = texts.get(`${folder}${owner.name}.md`);
  if (text === undefined) return undefined;
  const agent = readOrRefused(factory, owner, () => parseAgent(owner.name, text, (file) => texts.get(`${folder}${file}`)));
  const file = agent.keys.output;
  const schema = file === undefined ? undefined : texts.get(`${folder}${file}`);
  return agentSpecOf(agent, file === undefined || schema === undefined ? null : { file, text: schema });
}

/** The Skill `name` as `texts` compose its folder; refused where it is left no SKILL.md. */
function skillOf(factory: string, owner: ResolutionOwner, texts: Texts): unknown {
  const files = under(texts, `workflows/${SKILLS_FOLDER}/${owner.name}/`, false);
  const page = files.find((f) => f.path === 'SKILL.md');
  if (page === undefined) throw unremovable(factory, owner, `the skill ${owner.name}'s SKILL.md`);
  const others = files.filter((f) => f.path !== 'SKILL.md');
  return readOrRefused(factory, owner, () => skillSpecOf(owner.name, page.text, others, skillTurnCost(owner.name, page.text).preload));
}

/** The Hire `<workflow>.<step>` as the composed wiring hires its step: its agent, or none where the wiring hires no one there. */
function hireOf(factory: string, owner: ResolutionOwner, texts: Texts): unknown {
  const cut = owner.name.indexOf('.');
  const [workflow, step] = [owner.name.slice(0, cut), owner.name.slice(cut + 1)];
  const wiring = readOrRefused(factory, owner, (): unknown => JSON.parse(texts.get(WIRING_FILE) ?? '{}'));
  const hires = typeof wiring === 'object' && wiring !== null ? (wiring as { hires?: unknown }).hires : undefined;
  const agent = typeof hires === 'object' && hires !== null ? (hires as Record<string, unknown>)[`${workflow}/${step}`] : undefined;
  return { workflow, step, ...(typeof agent === 'string' && { agent }) };
}

/** The Factory's rules and instruction as `texts` compose them; refused where either is removed. */
function factoryOf(factory: string, owner: ResolutionOwner, texts: Texts, ours: Texts): unknown {
  const rules = texts.get('RULES.md');
  const instruction = texts.get('NEMIA.md');
  if (rules === undefined && ours.has('RULES.md')) throw unremovable(factory, owner, `the factory ${factory}'s rules, RULES.md`);
  if (instruction === undefined && ours.has('NEMIA.md'))
    throw unremovable(factory, owner, `the factory ${factory}'s instruction, NEMIA.md`);
  return { ...(rules !== undefined && { rules }), ...(instruction !== undefined && { instruction }) };
}

/**
 * The spec `owner` of `factory` proposes as `merge` composes its files with `choices`, or its removal (`undefined`); `ours`, the tree's
 * text files now, says what a removal of the rules or the instruction takes away. Thrown `Invalid` as the file's head says.
 */
export function ownerSpec(
  factory: string,
  owner: ResolutionOwner,
  merge: TreeMerge,
  choices: Readonly<Record<string, Choice>>,
  ours: Texts,
): unknown {
  const texts = composedTexts(merge, choices);
  switch (owner.kind) {
    case 'Workflow':
      return workflowOf(factory, owner, texts);
    case 'Agent':
      return agentOf(factory, owner, texts);
    case 'Skill':
      return skillOf(factory, owner, texts);
    case 'Hire':
      return hireOf(factory, owner, texts);
    case 'Factory':
      return factoryOf(factory, owner, texts, ours);
  }
}
