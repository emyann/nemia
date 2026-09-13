/**
 * A workflow is a folder of markdown files. That is the whole format.
 *
 * Each file is one step: frontmatter says which harness runs it and what must finish first, and
 * the body is what the agent is told — in prose, because prose is what the person writing it
 * already knows how to write.
 *
 *     ---
 *     harness: codex
 *     after: implement
 *     ---
 *     Review the changes on this branch. Be specific about correctness, not style.
 *
 * **There is exactly one non-prose key: `after`.** No conditions, no loops, no expressions. That
 * is deliberate. The interesting decisions in this kind of work — is this good enough, did it
 * actually do what was asked — are not predicates a workflow language could evaluate. They are
 * judgements, and a judgement belongs to a step with an agent in it, not to a keyword. The
 * workflow is a team, not a program.
 */
import fs from 'node:fs';
import path from 'node:path';

export type Workflow = {
  /** The step's name — the file's, minus `.md`. What `after` refers to. */
  name: string;
  /** What must have SUCCEEDED before this may run. `[]` means it starts at once. */
  after: string[];
  /**
   * Continue that step's session instead of starting cold — the author coming back to answer,
   * with their own memory of why they did it that way.
   *
   * The second and last structural key. Like `after` it is a relationship between steps, not
   * control flow: there is still nothing here that branches, loops or evaluates a condition.
   * Implies `after`, since you cannot continue a session that has not run.
   */
  resume?: string;
  /** Everything below the frontmatter: what the agent is told. */
  body: string;
  harness?: string;
  model?: string;
  permissionMode?: string;
  deadlineSeconds?: number;
  maxAttempts?: number;
  /**
   * A shell command the run executes in the step's workspace after the step hands off; exit 0 is
   * what makes the step verified. It measures, it does not route. The command is read from the
   * workflow the run froze, never from a checkout the step can edit.
   */
  check?: string;
  /** How many times the run re-files the step after its check refuses it. Absent means none. */
  retries?: number;
};

export class WorkflowError extends Error {}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

export function parseWorkflow(name: string, text: string): Workflow {
  const m = FRONTMATTER.exec(text);
  const meta: Record<string, string> = {};
  if (m) {
    for (const line of m[1]!.split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const body = (m ? text.slice(m[0].length) : text).trim();
  if (!body) throw new WorkflowError(`${name}: the body is empty — a step with nothing to say is not a step`);

  const after = (meta.after ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // `resume: x` implies `after: x` — continuing a session that has not run is not a thing.
  if (meta.resume && !after.includes(meta.resume)) after.push(meta.resume);

  return {
    name,
    after,
    resume: meta.resume,
    body,
    harness: meta.harness,
    model: meta.model,
    permissionMode: meta.permissionMode,
    deadlineSeconds: meta.deadlineSeconds ? Number(meta.deadlineSeconds) : undefined,
    maxAttempts: meta.maxAttempts ? Number(meta.maxAttempts) : undefined,
    check: meta.check,
    retries: meta.retries ? Number(meta.retries) : undefined,
  };
}

/** Read a folder of steps and check that they form a workflow rather than a wish. */
export function loadWorkflows(dir: string): Workflow[] {
  if (!fs.existsSync(dir)) throw new WorkflowError(`no workflow folder at ${dir}`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) throw new WorkflowError(`${dir} has no .md steps in it`);

  const steps = files.map((f) => parseWorkflow(path.basename(f, '.md'), fs.readFileSync(path.join(dir, f), 'utf8')));
  validate(steps);
  return steps;
}

/**
 * Two ways a folder of markdown is not a workflow: a step waits on one that does not exist, or the
 * steps wait on each other. Both are caught here, before anything is spent.
 */
export function validate(steps: readonly Workflow[]): void {
  const names = new Set(steps.map((s) => s.name));
  for (const s of steps) {
    for (const a of s.after) {
      if (!names.has(a)) throw new WorkflowError(`${s.name}: waits on "${a}", which is not a step here`);
      if (a === s.name) throw new WorkflowError(`${s.name}: waits on itself`);
    }
    if (s.resume) {
      const target = steps.find((x) => x.name === s.resume);
      if (!target) throw new WorkflowError(`${s.name}: resumes "${s.resume}", which is not a step here`);
      // A session belongs to the harness that made it. Continuing it from another is not resuming,
      // it is a different agent claiming someone else's memory.
      if ((target.harness ?? 'claude') !== (s.harness ?? 'claude')) {
        throw new WorkflowError(`${s.name}: resumes ${target.name}, which runs on a different harness (${target.harness ?? 'claude'})`);
      }
    }
  }

  // Kahn's algorithm: if anything is left when nothing else can be removed, it is a cycle.
  const pending = new Map(steps.map((s) => [s.name, new Set(s.after)]));
  for (let moved = true; moved;) {
    moved = false;
    for (const [name, deps] of pending) {
      if (deps.size === 0) {
        pending.delete(name);
        for (const other of pending.values()) other.delete(name);
        moved = true;
      }
    }
  }
  if (pending.size) throw new WorkflowError(`these steps wait on each other: ${[...pending.keys()].sort().join(', ')}`);
}

/**
 * Could two steps of this workflow ever run at the same time?
 *
 * True when there is more than one starting point, or when any step is followed by more than one.
 * Used to refuse `--no-worktree` on a workflow that fans out: without isolation those steps would
 * share a directory, which is the arrangement the whole worktree design exists to prevent.
 */
export function fansOut(steps: readonly Workflow[]): boolean {
  const roots = steps.filter((s) => s.after.length === 0);
  if (roots.length > 1) return true;
  return steps.some((s) => steps.filter((x) => x.after.includes(s.name)).length > 1);
}

/**
 * The steps nothing waits on — where a run's work ends up.
 *
 * A run that succeeded is useless if nobody can find what it produced, so this is what `wf ls`
 * reports as the result. Usually one step; several when a workflow deliberately ends wide.
 */
export function terminalSteps(steps: readonly Workflow[]): Workflow[] {
  return steps.filter((s) => !steps.some((other) => other.after.includes(s.name)));
}
