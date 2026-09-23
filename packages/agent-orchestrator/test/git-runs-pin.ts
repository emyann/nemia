/**
 * What `git-before-after.test.ts` reads every shipped folder's runs as: the briefs, the workspace plans, the decisions, the listings and
 * a forget's line of a git run, built by hand with fixed ids, times and paths, so nothing here runs git or reads the clock.
 *
 * Not a test file (`*.test.ts`): the test imports it, and so did the one-off that wrote `fixtures/git-runs-before.json` from the code
 * of the commit before folder workspaces.
 */
import path from 'node:path';
import { composeBrief, decision, forgetLine, listing, toDecide, workspacePlan, type Run, type TaskPhase } from '../src/run.ts';
import type { Closeout } from '../src/closeout.ts';
import { outputFields, type Workflow } from '../src/workflow.ts';
import { loadWorkflows } from '../src/workflow-store.ts';

export const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Every shipped folder, the package's own `ui` copy included, by path from the repository's root. */
export const SHIPPED = [
  'workflows/dev', 'workflows/dev-build', 'workflows/dev-planned', 'workflows/dev-planned-build', 'workflows/supervisor', 'workflows/ui',
  'packages/agent-orchestrator/workflows/ui',
];

const ID = 'r-pin';

const aRun = (steps: readonly Workflow[], isolate: boolean): Run => ({
  id: ID, repo: '/repo', workspace: '/repo', baseRef: 'abc1234', branch: 'main', isolate,
  brief: 'add a flag', workflowDir: '/wf/workflow', createdAt: '2026-01-01T00:00:00Z',
  steps: Object.fromEntries(steps.map((s) => [s.name, {
    taskId: `t-${s.name}`,
    workspace: s.workspace === 'main' || !isolate ? '/repo' : `/wf/worktrees/${ID}/${s.name}`,
    branch: s.workspace === 'main' || !isolate ? 'main' : `wf/${ID}/${s.name}`,
    ...(s.check ? { check: { taskId: `c-${s.name}` } } : {}),
  }])),
});

/** A value of the type a declared output field asks for: what a step that signed off well would have given. */
const valueOf = (step: Workflow, field: string): unknown => {
  const spec = (step.output?.schema.properties[field] ?? {}) as { type?: string; enum?: unknown[] };
  if (spec.enum) return spec.enum[0];
  return spec.type === 'array' ? [] : spec.type === 'object' ? {} : spec.type === 'boolean' ? true
    : spec.type === 'number' || spec.type === 'integer' ? 1 : `${step.name}'s ${field}`;
};

const closeout = (step: Workflow): Closeout => ({
  outcome: 'done', summary: `did ${step.name}`, artifacts: [], needs: null,
  output: { ...Object.fromEntries(outputFields(step).map((f) => [f, valueOf(step, f)])), ...(step.loop ? { again: false } : {}), replies: [] },
} as Closeout);

/** No step waits on it: a folder's last steps, the ones a failure is pinned on. */
const terminal = (steps: readonly Workflow[]) => steps.filter((s) => !steps.some((o) => o.after.includes(s.name))).map((s) => s.name);

const PHASES = ['running', 'succeeded', 'last failed'] as const;

const phasesOf = (steps: readonly Workflow[], which: (typeof PHASES)[number]): Record<string, TaskPhase> =>
  Object.fromEntries(steps.flatMap((s) => {
    const phase: TaskPhase = which === 'running' ? 'running' : which === 'last failed' && terminal(steps).includes(s.name) ? 'failed' : 'succeeded';
    // A step's check settles as the step did: passed (exit 0) beside a step that succeeded.
    return [[`t-${s.name}`, phase], ...(s.check ? [[`c-${s.name}`, phase]] : [])];
  }));

/** Everything pinned for one folder, as JSON, with the checkout's own path written `<repo>`. */
export function pin(folder: string): unknown {
  const steps = loadWorkflows(path.join(REPO, folder));
  const out: Record<string, unknown> = {};
  for (const isolate of [true, false]) {
    const run = aRun(steps, isolate);
    const closeoutOf = (name: string) => { const s = steps.find((x) => x.name === name); return s ? closeout(s) : undefined; };
    const phases: Record<string, unknown> = {};
    for (const which of PHASES) {
      const phase = phasesOf(steps, which);
      const phaseOf = (id: string) => phase[id] ?? 'unknown';
      const verdictOf = (name: string) => (phase[`c-${name}`] === 'succeeded' ? 0 : phase[`c-${name}`] === 'failed' ? 1 : undefined);
      const settledCloseout = (name: string) => (phase[`t-${name}`] === 'succeeded' ? closeoutOf(name) : undefined);
      const standings = steps.filter((s) => s.workspace !== 'main').map((s) => ({ branch: `wf/${ID}/${s.name}`, where: 'ahead' as const, commits: 2 }));
      const status = which === 'running' ? 'running' : which === 'succeeded' ? 'succeeded' : 'failed';
      phases[which] = {
        decision: decision(steps, run, phaseOf, () => false, settledCloseout, () => true, verdictOf),
        listing: listing(steps, run, phaseOf, settledCloseout, () => true, verdictOf, [], [], [], [], undefined, undefined, undefined, standings),
        toDecide: toDecide(steps, run, status, () => (which === 'succeeded' ? 'succeeded' : 'failed') as never, standings) ?? null,
      };
    }
    out[isolate ? 'worktrees' : 'no worktrees'] = {
      briefs: Object.fromEntries(steps.map((s) => [s.name, composeBrief(s, run, steps, closeoutOf, `/wf/runs/${ID}/artifacts/${s.name}`)])),
      plans: Object.fromEntries(steps.map((s) => [s.name, workspacePlan(steps, s)])),
      phases,
    };
  }
  return JSON.parse(JSON.stringify(out).split(REPO).join('<repo>'));
}

/** A forget's line, for a run that cut worktrees and one that did not: no folder in it, so said once. */
export const forgetLines = (): string[] => [true, false].map((isolate) => forgetLine({
  id: ID, kind: 'forgotten', repo: '/repo', base: 'main', isolate,
  removed: isolate ? [`/wf/worktrees/${ID}/implement`, `/wf/worktrees/${ID}/review`] : [],
  handedOff: isolate ? [{ step: 'review', branch: `wf/${ID}/review`, commit: '0123456789abcdef' }] : [],
  gone: [], left: [],
  branches: isolate ? [{ branch: `wf/${ID}/implement`, deleted: true, why: 'merged' }, { branch: `wf/${ID}/review`, deleted: false, why: 'unmerged' }] : [],
  files: [`runs/${ID}.json`, `runs/${ID}/`],
}));

export const everything = () => ({ folders: Object.fromEntries(SHIPPED.map((f) => [f, pin(f)])), forget: forgetLines() });
