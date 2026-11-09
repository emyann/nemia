/**
 * A condition whose eval is a script (`route: { script: <path> }`): filed as a command task under the id its step would get
 * (`stepTaskId`), run from the run's frozen copy of its workflow folder and told what a check is told (`CheckEnv`), with the request it
 * reads (`WF_REQUEST`) and the file it answers in (`WF_ANSWER`), which the runtime reads once at exit and keeps on the attempt. What it
 * answered is read off that attempt on every pass (`scriptCloseouts`), and its route copied onto its record once per try (`fileScripts`).
 * A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { asked, type Engine, type TaskView } from '../runtime-client.ts';
import { CHECK_DEADLINE_SECONDS, CHECK_NICENESS, checkEnvOf, type Verdict } from '../check/check.ts';
import { stepTaskId, tryOf, type CloseoutAsked, type Run, type TaskPhase } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { MOMENTUM, stepStatus, type SpendOf } from '../status/status.ts';
import { answeredRoute, routeSettled } from '../route/routed/index.ts';
import type { Closeout } from '../closeout/index.ts';
import { artifactsDir } from '../record/record.store.ts';
import { workflowFilesDir } from '../frozen/frozen.store.ts';
import { attemptIn, isScript, scriptRead } from './script.store.ts';

/** The files a script condition is handed in its artifacts folder: the request it reads, and the answer it writes. */
export const REQUEST_FILE = 'route-request.json';
export const ANSWER_FILE = 'route-answer.json';

/** What a pass hands the copy of its conditions' routes and the filing of its script conditions: a part of its `Filing` (file.verb.ts). */
export type ScriptFiling = {
  e: Engine;
  run: Run;
  reads: {
    steps: Workflow[];
    views: Map<string, TaskView>;
    phaseOf: (taskId: string) => TaskPhase;
    signedOff: (step: string) => Closeout | undefined;
    asked: (taskId: string) => CloseoutAsked;
    verdictOf: (step: string) => Verdict | undefined;
    spendOf: SpendOf;
  };
  mayFile: () => boolean;
  notes: string[];
};

/**
 * Copy each table condition's route onto its record, once for the try it is on (`StepRecord.route`, `by: 'table'`), where its table
 * answers one and nothing is there for the try: a person's (`routeFile`) or one copied before. Answers with the conditions written. The
 * pass reads the route afresh either way (`answeredRoute`); the copy, written with the record when the pass writes it — as it does on the
 * pass that files the route's first node — keeps what the run took after the producer's closeout is pruned.
 */
export function answerTables(f: Pick<ScriptFiling, 'run' | 'reads'>): string[] {
  const { run, reads } = f;
  const wordOf = (name: string) => {
    const step = reads.steps.find((s) => s.name === name);
    return step
      ? stepStatus(step, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf, reads.verdictOf)
      : 'pending';
  };
  const written: string[] = [];
  for (const step of reads.steps) {
    const record = run.steps[step.name];
    if (step.route?.kind !== 'table' || !record || record.taskId) continue;
    const n = tryOf(run, step.name);
    if (record.route?.try === n && (record.route.by !== 'table' || routeSettled(step, run, reads.steps))) continue;
    const answer = answeredRoute(step, run, reads.signedOff, wordOf, reads.steps);
    if (answer?.kind !== 'route' || (record.route?.try === n && record.route.route === answer.route)) continue;
    run.steps[step.name] = { ...record, route: { route: answer.route, try: n, by: 'table' } };
    written.push(step.name);
  }
  return written;
}

/**
 * Copy each script condition's route onto its record once for the try it is on (`StepRecord.route`, `by: 'script'`), then file each ready
 * script condition the engine does not hold, until the pass may file no more. Answers with the conditions filed; the caller files the rest.
 */
export const fileScripts = Effect.fn('fileScripts')(function* (f: ScriptFiling, ready: readonly string[]) {
  const { run, reads } = f;
  for (const step of reads.steps) {
    const record = run.steps[step.name];
    const n = tryOf(run, step.name);
    if (!record || record.route?.try === n) continue;
    const read = scriptRead(step, run, attemptIn(reads.views));
    if (read?.kind === 'route') run.steps[step.name] = { ...record, route: { route: read.route, try: n, by: 'script' } };
  }
  const filed: string[] = [];
  for (const name of ready) {
    const step = reads.steps.find((s) => s.name === name);
    if (!isScript(step)) continue;
    if (!f.mayFile()) break;
    if (yield* fileScript(f, step)) filed.push(name);
  }
  return filed;
});

/** File one script condition, or adopt the task a pass before this one filed under its id: answers with whether it is on the record. */
const fileScript = Effect.fnUntraced(function* (f: ScriptFiling, step: Workflow & { routes: string[] }) {
  const { e, run } = f;
  const script = step.route?.kind === 'script' ? step.route.script : '';
  if (run.workflowFiles === undefined) {
    f.notes.push(
      `${step.name}: the run keeps no copy of its workflow folder to run \`${script}\` from: start the run again (\`nemia start\`), which freezes one`,
    );
    return false;
  }
  const taskId = stepTaskId(run, step.name, tryOf(run, step.name));
  if (!(yield* asked('view', e.view(taskId))).state.brief) {
    const files = path.resolve(artifactsDir(run, step.name));
    fs.mkdirSync(files, { recursive: true });
    const request = path.join(files, REQUEST_FILE);
    const answer = path.join(files, ANSWER_FILE);
    const closeouts = Object.fromEntries(step.after.map((p) => [p, f.reads.signedOff(p)?.output ?? {}]));
    fs.writeFileSync(request, `${JSON.stringify({ v: 1, step: step.name, routes: step.routes, closeouts }, null, 2)}\n`);
    fs.rmSync(answer, { force: true });
    const parent = [...step.after].sort()[0];
    const workspace = (parent === undefined ? undefined : run.steps[parent]?.workspace) ?? run.workspace;
    const workflowFiles = workflowFilesDir(run, run.workflowFiles);
    const command = ['node', path.join(workflowFiles, script)];
    const env = {
      ...checkEnvOf(run, step, { workspace, files, closeout: undefined, workflowFiles }),
      WF_REQUEST: request,
      WF_ANSWER: answer,
    };
    yield* asked(
      'file',
      e.file({
        id: taskId,
        harness: 'command',
        priority: MOMENTUM,
        brief: command.join(' '),
        cwd: workspace,
        deadlineSeconds: step.deadlineSeconds ?? CHECK_DEADLINE_SECONDS,
        config: { command, env, niceness: CHECK_NICENESS, terminationMessagePath: answer },
      }),
    );
  }
  run.steps[step.name] = { ...run.steps[step.name], taskId };
  return true;
});
