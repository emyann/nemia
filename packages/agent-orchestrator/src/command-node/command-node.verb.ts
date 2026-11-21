/**
 * A command node (`run:`) filed as a command task under the id its node would get (`stepTaskId`): its shell line run with `sh -c` in its
 * first parent's workspace, told what a check is told (`CheckEnv`), its first parent's closeout (`WF_CLOSEOUT`), the file it answers in
 * (`WF_ANSWER`, read by the runtime once at exit) and a token minted for its task under the agent it names (`WF_SESSION_TOKEN`), so the
 * `nemia` it calls acts as that agent while it runs. What it said is read off its attempt on every pass (`commandCloseout`). A
 * controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { asked, type Engine } from '../runtime-client.ts';
import { CHECK_DEADLINE_SECONDS, CHECK_NICENESS, checkEnvOf } from '../check/index.ts';
import { stepTaskId, tryOf, type Run } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import { MOMENTUM } from '../status/status.ts';
import type { Closeout } from '../closeout/index.ts';
import { artifactsDir } from '../record/record.store.ts';
import { carriedFilesDir, workflowFilesDir } from '../frozen/frozen.store.ts';
import { checkCloseout, writeCheckCloseout } from '../check/check.store.ts';
import { SESSION_TOKEN } from '../filed/filed.ts';
import { stepToken } from '../token/token.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { COMMAND_ANSWER_FILE, isCommandNode } from './command-node.ts';

/** What a pass hands the filing of its command nodes: a part of its `Filing` (file.verb.ts). */
export type CommandFiling = {
  e: Engine;
  run: Run;
  reads: { steps: StepSpec[]; signedOff: (step: string) => Closeout | undefined };
  mayFile: () => boolean;
};

/**
 * File each ready command node the engine does not hold, until the pass may file no more: answers with the nodes on the record; the caller
 * files the rest as sessions.
 * @param f The pass's filing: the engine, the run, the steps and their closeouts.
 * @param ready The nodes ready on this pass, in order.
 */
export const fileCommands = Effect.fn('fileCommands')(function* (f: CommandFiling, ready: readonly string[]) {
  const filed: string[] = [];
  for (const name of ready) {
    const step = f.reads.steps.find((s) => s.name === name);
    if (!isCommandNode(step)) continue;
    if (!f.mayFile()) break;
    yield* fileCommand(f, step, stepTaskId(f.run, step.name, tryOf(f.run, step.name)));
    filed.push(name);
  }
  return filed;
});

/**
 * File one command node's try as the task `taskId`, or adopt the task a pass before this one filed under it, and put it on the record.
 * What a retry of a command node files too (`sendTry`): a command has no session to continue, so every try runs its line afresh.
 * @param f The pass's filing.
 * @param step The command node.
 * @param taskId The task its try is filed as.
 */
export const fileCommand = Effect.fn('fileCommand')(function* (f: CommandFiling, step: StepSpec & { run: string }, taskId: string) {
  const home = yield* StoreRoot;
  const { e, run } = f;
  if (!(yield* asked('view', e.view(taskId))).state.brief) {
    const files = path.resolve(artifactsDir(home, run, step.name));
    fs.mkdirSync(files, { recursive: true });
    const answer = path.join(files, COMMAND_ANSWER_FILE);
    fs.rmSync(answer, { force: true });
    fs.mkdirSync(path.dirname(checkCloseout(home, taskId)), { recursive: true });
    const parent = step.after[0];
    const workspace = (parent === undefined ? undefined : run.steps[parent]?.workspace) ?? run.workspace;
    const closeout = parent === undefined ? undefined : f.reads.signedOff(parent);
    const env = {
      ...checkEnvOf(run, step, {
        workspace,
        files,
        closeout: closeout && writeCheckCloseout(home, taskId, closeout),
        ...(run.workflowFiles === undefined ? {} : { workflowFiles: workflowFilesDir(home, run, run.workflowFiles) }),
        ...(run.carriedFiles === undefined ? {} : { carriedFiles: carriedFilesDir(home, run, run.carriedFiles) }),
      }),
      WF_ANSWER: answer,
      [SESSION_TOKEN]: stepToken(home, run, step, taskId, tryOf(run, step.name)).sessionToken,
    };
    yield* asked(
      'file',
      e.file({
        id: taskId,
        harness: 'command',
        priority: MOMENTUM,
        brief: step.run,
        cwd: workspace,
        deadlineSeconds: step.deadlineSeconds ?? CHECK_DEADLINE_SECONDS,
        config: { command: ['sh', '-c', step.run], env, niceness: CHECK_NICENESS, terminationMessagePath: answer },
      }),
    );
  }
  run.steps[step.name] = { ...run.steps[step.name], taskId };
});
