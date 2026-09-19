/**
 * The workflow builder's draft, without React: a folder of yours as its steps, changed a key at a time — an edge drawn or taken away, a step
 * added or removed, a value set — and put back in the listing's shape. Pure. What a step may say is the package's to judge when the draft is
 * saved; the draft judges only what it needs to stay a draft: one step per name, and a name to call it by.
 */
import type { GraphEdge, ListedStep, RunGraph, SchemaFile, WorkflowListing, WorkflowStepSpec } from './api';
import { COLUMN_WIDTH, layout, stepsOf, type Point } from './layout.ts';

/** A step being built: as the listing has it, and a schema pasted for its `output:`, written beside it on save — null for none. */
export type DraftStep = ListedStep & { schema: { file: string; text: string } | null };

/** The rounds a `loop:` runs when its step does not say: the package's `DEFAULT_ROUNDS`, which a loop drawn is given. */
export const DEFAULT_ROUNDS = 3;

/** A step that sets nothing, as the listing has one. */
export const UNSET: Readonly<WorkflowStepSpec> = {
  harness: null, model: null, effort: null, context: null, after: [], resume: null, input: [], agent: null, permissionMode: null, tools: null, disallow: [], remote: null,
  deadlineSeconds: null, maxAttempts: null, budget: null, check: null, retries: null, gate: null, output: null, loop: null, rounds: null,
};

/** A folder's steps as a draft: as they are listed, nothing pasted — and none of its lists the listing's, which the page's cache holds. */
export const draftOf = (workflow: Pick<WorkflowListing, 'steps'>): DraftStep[] =>
  workflow.steps.map(({ name, spec, body }) => ({
    name,
    spec: { ...spec, after: [...spec.after], input: [...spec.input], disallow: [...spec.disallow], tools: spec.tools && [...spec.tools] },
    body,
    schema: null,
  }));

const without = (list: readonly string[], name: string): string[] => list.filter((x) => x !== name);

/** `name`'s spec with `change` made to it. */
const changed = (steps: readonly DraftStep[], name: string, change: (spec: WorkflowStepSpec) => WorkflowStepSpec): DraftStep[] =>
  steps.map((step) => (step.name === name ? { ...step, spec: change(step.spec) } : step));

/**
 * An edge drawn from `source` to `target`: `after: source` on `target` — or, drawn from the loop handle, `loop: target` on `source`, with the
 * default rounds when it had none. Nothing for an edge from a step to itself, one already there, or a name the draft does not have: the canvas
 * only draws between its own nodes, and the parser refuses a step waiting on itself in words the board need not provoke.
 */
export function connect(steps: readonly DraftStep[], source: string, target: string, loop: boolean): DraftStep[] {
  const names = steps.map((s) => s.name);
  if (source === target || !names.includes(source) || !names.includes(target)) return [...steps];
  if (loop) return changed(steps, source, (spec) => ({ ...spec, loop: target, rounds: spec.rounds ?? DEFAULT_ROUNDS }));
  return changed(steps, target, (spec) => (spec.after.includes(source) ? spec : { ...spec, after: [...spec.after, source] }));
}

/**
 * An edge taken away, by its id on the canvas (`edgesOf`): `a->b` takes `a` from `b`'s `after` — and `resume: a`, which `after` lists too, so
 * the key does not put the edge back — and `loop:a->b` takes `a`'s `loop` and its `rounds`.
 */
export function disconnect(steps: readonly DraftStep[], id: string): DraftStep[] {
  const loop = /^loop:(.+)->(.+)$/.exec(id);
  if (loop) return changed(steps, loop[1]!, (spec) => ({ ...spec, loop: null, rounds: null }));
  const after = /^(.+)->(.+)$/.exec(id);
  if (!after) return [...steps];
  const [, from, to] = after as unknown as [string, string, string];
  return changed(steps, to, (spec) => ({ ...spec, after: without(spec.after, from), resume: spec.resume === from ? null : spec.resume }));
}

/** Why `name` cannot be added as a step, or null: a name there is none of, or one the draft has already. The rest is the package's to say on save. */
export function nameRefusal(steps: readonly DraftStep[], name: string): string | null {
  if (!name.trim()) return 'A step needs a name: its file is <name>.md.';
  if (steps.some((s) => s.name === name)) return `There is a step named ${name} already.`;
  return null;
}

/** A step added: its name and what its agent is told, every key unset. The draft as it was, for a name refused (`nameRefusal`). */
export function addStep(steps: readonly DraftStep[], name: string, body: string): DraftStep[] {
  if (nameRefusal(steps, name)) return [...steps];
  return [...steps, { name, spec: { ...UNSET, after: [], input: [], disallow: [] }, body, schema: null }];
}

/** A step removed, and every key of another step that names it: `after`, `input`, `resume`, and `loop` with its rounds. */
export function removeStep(steps: readonly DraftStep[], name: string): DraftStep[] {
  return steps.filter((s) => s.name !== name).map((step) => {
    const { spec } = step;
    const names = spec.after.includes(name) || spec.input.includes(name) || spec.resume === name || spec.loop === name;
    if (!names) return step;
    return {
      ...step,
      spec: {
        ...spec,
        after: without(spec.after, name),
        input: without(spec.input, name),
        resume: spec.resume === name ? null : spec.resume,
        ...(spec.loop === name ? { loop: null, rounds: null } : {}),
      },
    };
  });
}

/**
 * One key set on a step. `loop` brings its rounds with it — the default when set with none, none when unset — as drawing and taking away the
 * edge do; `resume` waits on the step it names, as the parser reads it. Every other key is set as given.
 */
export function setKey<K extends keyof WorkflowStepSpec>(steps: readonly DraftStep[], name: string, key: K, value: WorkflowStepSpec[K]): DraftStep[] {
  return changed(steps, name, (spec) => {
    const next = { ...spec, [key]: value };
    if (key === 'loop') next.rounds = value === null ? null : spec.rounds ?? DEFAULT_ROUNDS;
    if (key === 'resume' && typeof value === 'string' && !spec.after.includes(value)) next.after = [...spec.after, value];
    return next;
  });
}

/** What a step's agent is told, set. */
export const setBody = (steps: readonly DraftStep[], name: string, body: string): DraftStep[] =>
  steps.map((step) => (step.name === name ? { ...step, body } : step));

/**
 * A schema pasted for a step's `output:`, which names its file: written beside the steps when the draft is saved. Null takes the paste back,
 * and leaves `output:` as it is.
 */
export const setSchema = (steps: readonly DraftStep[], name: string, schema: DraftStep['schema']): DraftStep[] =>
  steps.map((step) => (step.name === name ? { ...step, schema, spec: schema ? { ...step.spec, output: schema.file } : step.spec } : step));

/**
 * The draft's graph, as the api's `graphOf` draws a folder's: its roots, an `after` edge per step a step waits on, and a `loop` edge from each
 * looping step back. Only between its own steps.
 */
export function draftGraph(steps: readonly DraftStep[]): RunGraph {
  const names = new Set(steps.map((s) => s.name));
  const edges: GraphEdge[] = [];
  const roots: string[] = [];
  for (const { name, spec } of steps) {
    const after = [...new Set(spec.after)].filter((from) => names.has(from) && from !== name);
    if (!after.length) roots.push(name);
    for (const from of after) edges.push({ from, to: name, kind: 'after' });
    if (spec.loop && names.has(spec.loop) && spec.loop !== name) edges.push({ from: name, to: spec.loop, kind: 'loop', rounds: spec.rounds ?? DEFAULT_ROUNDS });
  }
  return { roots, edges };
}

/**
 * Where each step goes on the builder's canvas: as a folder's graph is laid out, left to right by `after`. Steps that wait on each other have
 * no such order — the package refuses them on save, and the board lets a person draw them to see it — so they go in a row, in the draft's order.
 */
export function placesOf(steps: readonly DraftStep[]): { at: Map<string, Point>; cycle: boolean } {
  const names = steps.map((s) => s.name);
  try {
    return { at: layout(stepsOf(names, draftGraph(steps).edges)), cycle: false };
  } catch {
    return { at: new Map(names.map((name, i) => [name, { x: i * COLUMN_WIDTH, y: 0 }])), cycle: true };
  }
}

/** The steps in the order a run of them runs, as the package orders a folder's (`orderSteps`): each after what it waits on, ties as given. */
export function orderOf(steps: readonly DraftStep[]): string[] {
  const names = new Set(steps.map((s) => s.name));
  const placed: string[] = [];
  let pending = [...steps];
  for (;;) {
    const next = pending.find((s) => s.spec.after.every((a) => placed.includes(a) || !names.has(a)));
    if (!next) break;
    placed.push(next.name);
    pending = pending.filter((s) => s !== next);
  }
  return [...placed, ...pending.map((s) => s.name)];
}

/** A step as it is compared: its keys in one order, its body, and a pasted schema. */
const said = (step: ListedStep, schema: DraftStep['schema']): string =>
  JSON.stringify([Object.keys(step.spec).sort().map((k) => [k, step.spec[k as keyof WorkflowStepSpec]]), step.body, schema]);

/** The steps of the draft that are not as the folder was listed — changed, added, or given a schema to write — by name. */
export function unsavedSteps(steps: readonly DraftStep[], workflow: Pick<WorkflowListing, 'steps'>): string[] {
  const was = new Map(workflow.steps.map((s) => [s.name, said(s, null)]));
  return steps.filter((step) => was.get(step.name) !== said(step, step.schema)).map((s) => s.name);
}

/** Whether the draft is not the folder as listed: a step changed or added, or one listed and gone. */
export const unsaved = (steps: readonly DraftStep[], workflow: Pick<WorkflowListing, 'steps'>): boolean =>
  unsavedSteps(steps, workflow).length > 0 || workflow.steps.some((listed) => !steps.some((s) => s.name === listed.name));

/** The draft as a save puts it: each step in the listing's shape, a pasted schema's file named by its `output:`. */
export const toPut = (steps: readonly DraftStep[]): ListedStep[] =>
  steps.map(({ name, spec, body, schema }) => ({ name, spec: schema ? { ...spec, output: schema.file } : spec, body }));

/** The schemas pasted in the draft, as a save carries them: written beside the steps with them, judged with them first. */
export const schemasOf = (steps: readonly DraftStep[]): SchemaFile[] => steps.flatMap(({ schema }) => (schema ? [{ file: schema.file, text: schema.text }] : []));

/** A list typed as the form's list fields take one — `Read, Grep` — as the listing has it: its names, or none for nothing typed. */
export const listOf = (typed: string): string[] => typed.split(',').map((s) => s.trim()).filter(Boolean);

/** A count or an amount typed into the form, as the listing has it: null for nothing typed, and otherwise the number, which the package judges. */
/**
 * Tokens as a person types them — `200k`, `150000`, `1M` — or null for none, or for anything else: the package's `tokensOf`, which the page
 * cannot import. Whether the harness takes the number is the package's to say when the draft is saved.
 */
export function tokensOf(typed: string): number | null {
  const m = /^(\d+)([km])?$/i.exec(typed.trim());
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** A context window as the package's `renderStep` writes it: thousands with `k` when it is a whole number of them, digits otherwise. */
export const contextText = (tokens: number): string => (tokens % 1_000 === 0 ? `${tokens / 1_000}k` : String(tokens));

export function numberOf(typed: string): number | null {
  if (!typed.trim()) return null;
  const n = Number(typed);
  return Number.isFinite(n) ? n : null;
}

/** A folder written, put into the page's listing in the listing's order — the repository's first, then yours, each by name — for the next read to confirm. */
export function listedWith(list: readonly WorkflowListing[] | undefined, written: WorkflowListing): WorkflowListing[] {
  const others = (list ?? []).filter((w) => !(w.from === written.from && w.name === written.name));
  return [...others, written].sort((a, b) => (a.from === b.from ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.from === 'repo' ? -1 : 1));
}
