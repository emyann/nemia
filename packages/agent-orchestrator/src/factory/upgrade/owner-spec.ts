/**
 * The spec an owner of an upgrade's conflicts proposes, as the person's choices compose its files from the merge
 * (`ownerObjects`): a Workflow
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
import { compose, isJsonObject, type Choice, type TreeMerge } from './merge.ts';
import { WIRING_FILE } from './resolution.ts';
import type { ResolutionOwner } from '../../../contracts/resolution.contract.ts';
import type { AgentHiresFired, Hires } from '../../../contracts/upgrade-apply.contract.ts';

/** The text files of a composed tree, by their path in it. */
type Texts = ReadonlyMap<string, string>;

/** `choices` with each conflict of `merge` left without one given `'ours'`: what a part of the merge is composed with. */
const filledFor = (merge: TreeMerge, choices: Readonly<Record<string, Choice>>) =>
  Object.fromEntries(merge.conflicts.map((c) => [c.at, choices[c.at] ?? 'ours']));

/**
 * The text files of the tree `merge` composes with `choices`, a conflict with no choice taken as the tree has it.
 * @param merge The merge of the trees: its clean entries and its conflicts.
 * @param choices The person's choice for each conflict, by where it is; a conflict with none is taken as the tree has it.
 */
function composedTexts(merge: TreeMerge, choices: Readonly<Record<string, Choice>>) {
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
const under = (texts: Texts, prefix: string, direct: boolean) =>
  [...texts]
    .filter(([at]) => at.startsWith(prefix) && !(direct && at.slice(prefix.length).includes('/')))
    .map(([at, text]) => ({ path: at.slice(prefix.length), text }));

/**
 * What a refusal of `nemia factory resolve` says last: nothing proposed, the choice kept, and how to choose again.
 * @param factory The factory's name.
 * @param owner The owner of the conflicts chosen for: its kind and name.
 */
const keptLine = (factory: string, owner: ResolutionOwner) =>
  `Nothing was proposed; your choice is kept. Choose again for a conflict of the ${owner.kind} ${owner.name} to propose it again ` +
  `(nemia factory resolve ${factory} <conflict> --ours|--theirs|--file <path>).`;

/** A removal no proposal makes, refused: what to type instead. */
const unremovable = (factory: string, owner: ResolutionOwner, what: string) =>
  new Invalid({
    message: `nemia factory resolve: your choices remove ${what}, which no proposal removes: keep it, --ours or --file <path> on its conflict. ${keptLine(factory, owner)}`,
  });

/** `read()`, or `Invalid` saying the owner as the choices compose it does not read. */
function readOrRefused<A>(factory: string, owner: ResolutionOwner, read: () => A) {
  try {
    return read();
  } catch (err) {
    throw new Invalid({
      message: `nemia factory resolve: the ${owner.kind} ${owner.name} as your choices compose it does not read: ${err instanceof Error ? err.message : String(err)} ${keptLine(factory, owner)}`,
    });
  }
}

/** The Workflow `name` as `texts` compose its folder, its removal where it is left no file. */
function workflowOf(factory: string, owner: ResolutionOwner, texts: Texts) {
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
function agentOf(factory: string, owner: ResolutionOwner, texts: Texts) {
  const folder = `workflows/${AGENTS_FOLDER}/`;
  const text = texts.get(`${folder}${owner.name}.md`);
  if (text === undefined) return undefined;
  const agent = readOrRefused(factory, owner, () => parseAgent(owner.name, text, (file) => texts.get(`${folder}${file}`)));
  const file = agent.keys.output;
  const schema = file === undefined ? undefined : texts.get(`${folder}${file}`);
  return agentSpecOf(agent, file === undefined || schema === undefined ? null : { file, text: schema });
}

/** The Skill `name` as `texts` compose its folder; refused where it is left no SKILL.md. */
function skillOf(factory: string, owner: ResolutionOwner, texts: Texts) {
  const files = under(texts, `workflows/${SKILLS_FOLDER}/${owner.name}/`, false);
  const page = files.find((f) => f.path === 'SKILL.md');
  if (page === undefined) throw unremovable(factory, owner, `the skill ${owner.name}'s SKILL.md`);
  const others = files.filter((f) => f.path !== 'SKILL.md');
  return readOrRefused(factory, owner, () => skillSpecOf(owner.name, page.text, others, skillTurnCost(owner.name, page.text).preload));
}

/** The Hire `<workflow>.<step>` as the composed wiring hires its step: its agent, or none where the wiring hires no one there. */
function hireOf(factory: string, owner: ResolutionOwner, texts: Texts) {
  const cut = owner.name.indexOf('.');
  const [workflow, step] = [owner.name.slice(0, cut), owner.name.slice(cut + 1)];
  const wiring = readOrRefused(factory, owner, () => JSON.parse(texts.get(WIRING_FILE) ?? '{}'));
  const hires = isJsonObject(wiring) ? wiring.hires : undefined;
  const agent = isJsonObject(hires) ? hires[`${workflow}/${step}`] : undefined;
  return { workflow, step, ...(typeof agent === 'string' && { agent }) };
}

/** The Factory's rules and instruction as `texts` compose them; refused where either is removed. */
function factoryOf(factory: string, owner: ResolutionOwner, texts: Texts, ours: Texts) {
  const rules = texts.get('RULES.md');
  const instruction = texts.get('NEMIA.md');
  if (rules === undefined && ours.has('RULES.md')) throw unremovable(factory, owner, `the factory ${factory}'s rules, RULES.md`);
  if (instruction === undefined && ours.has('NEMIA.md'))
    throw unremovable(factory, owner, `the factory ${factory}'s instruction, NEMIA.md`);
  return { ...(rules !== undefined && { rules }), ...(instruction !== undefined && { instruction }) };
}

/** The hires a tree's wiring text holds, each with its step as `<workflow>/<step>`: none where it holds none or does not read. */
function hiresIn(text: string | undefined) {
  let wiring: unknown;
  try {
    wiring = JSON.parse(text ?? '{}');
  } catch {
    return [];
  }
  const hires = isJsonObject(wiring) ? wiring.hires : undefined;
  return Object.entries(isJsonObject(hires) ? hires : {}).flatMap(([step, agent]) => (typeof agent === 'string' ? [{ step, agent }] : []));
}

/**
 * What the removal of `agent` does to the hires: the steps of the tree's wiring `tree` it is hired into, fired by the same proposal; or,
 * where the wiring the upgrade composes, `composed`, still hires it, the steps it is hired into there.
 * @param agent The agent the resolution removes.
 * @param tree The tree's hires now.
 * @param composed The hires the upgrade composes.
 */
export const agentHiresFired: AgentHiresFired = (agent, tree, composed) => {
  const into = (hires: Hires) => hires.filter((hire) => hire.agent === agent).map((hire) => hire.step);
  const still = into(composed);
  return still.length > 0 ? { stillHired: still } : { fire: into(tree) };
};

/** One object an owner proposes: its kind, its name and its spec, undefined for a removal. */
export type OwnerObject = { kind: ResolutionOwner['kind']; name: string; spec: unknown };

/** The Hire `<workflow>/<step>` fired: its object, which hires no one into the step. */
const fired = (step: string) => {
  const cut = step.indexOf('/');
  const [workflow, name] = [step.slice(0, cut), step.slice(cut + 1)];
  return { kind: 'Hire', name: `${workflow}.${name}`, spec: { workflow, step: name } } satisfies OwnerObject;
};

/**
 * The objects `owner` of `factory` proposes as `merge` composes its files with `choices`: the spec of the owner, or its removal; and, for
 * an Agent the composition removes, first a Hire fired for each step the tree's wiring hires it into, so the factory never holds a hire of
 * an agent it no longer has. `ours`, the tree's text files now, says what a removal of the rules or the instruction takes away, and what
 * the tree hires. Thrown `Invalid` as the file's head says, and where the composed wiring still hires the agent it removes.
 * @param factory The factory's name.
 * @param owner The owner of the conflicts: its kind and name.
 * @param merge The merge of the trees: its clean entries and its conflicts.
 * @param choices The person's choice for each conflict, by where it is; a conflict with none is taken as the tree has it.
 * @param ours The tree's text files now, by their path in it.
 */
export function ownerObjects(
  factory: string,
  owner: ResolutionOwner,
  merge: TreeMerge,
  choices: Readonly<Record<string, Choice>>,
  ours: Texts,
) {
  const texts = composedTexts(merge, choices);
  const object = (spec: unknown) => ({ kind: owner.kind, name: owner.name, spec }) satisfies OwnerObject;
  switch (owner.kind) {
    case 'Workflow':
      return [object(workflowOf(factory, owner, texts))];
    case 'Agent': {
      const spec = agentOf(factory, owner, texts);
      if (spec !== undefined) return [object(spec)];
      const removed = agentHiresFired(owner.name, hiresIn(ours.get(WIRING_FILE)), hiresIn(texts.get(WIRING_FILE)));
      if ('stillHired' in removed)
        throw new Invalid({
          message: `nemia factory resolve: your choices remove the agent ${owner.name}, which the upgraded wiring still hires into ${removed.stillHired.join(', ')}: keep the agent, --ours or --file <path> on its conflict, or fire its hires, nemia factory fire <workflow>.<step>. ${keptLine(factory, owner)}`,
        });
      return [...removed.fire.map(fired), object(undefined)];
    }
    case 'Skill':
      return [object(skillOf(factory, owner, texts))];
    case 'Hire':
      return [object(hireOf(factory, owner, texts))];
    case 'Factory':
      return [object(factoryOf(factory, owner, texts, ours))];
  }
  return [];
}
