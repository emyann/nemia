/**
 * The verbs. Parse, call, print — no logic lives here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { engine, listRuns, readRun, resultBranches, start, stepViews, tick } from './runner.ts';
import { loadWorkflows } from './workflow.ts';

const HELP = `wf — run a workflow of agent steps

  wf start <brief.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree]
  wf tick                      one pass: tick the engine, file what became ready
  wf up [ms]                   the same, on a timer
  wf ls [runId]                runs and their steps
  wf show <runId>              the run, and what each step was told
  wf logs <runId> <step>       that step's session output

A workflow is a folder of markdown files. One file is one step:

    ---
    harness: codex        # claude (default) | codex
    after: implement      # what must succeed first
    ---
    Review the changes on this branch. Be specific about correctness, not style.

The only non-prose key is \`after\`. Everything else the agent is told is prose.

  WF_ROOT            where runs and the engine's board live
  WF_MAX_CONCURRENT  sessions per harness at once (default 2)

To follow what the engine is doing, use the engine — a run's task ids carry the run and the step,
so its output already names the work. Point it at this board:

    AE_ROOT="\${WF_ROOT:-$HOME/.agent-workflows}/engine" ae watch`;

const flag = (argv: string[], name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

export async function main(argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  const e = engine();

  switch (verb) {
    case 'start': {
      const arg = rest[0];
      if (!arg || arg.startsWith('--')) return console.log(HELP);
      const brief = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8').trim() : arg;
      const run = start({
        brief,
        repo: path.resolve(flag(rest, 'repo', '.')!),
        workflowDir: path.resolve(flag(rest, 'workflows', './workflows')!),
        isolate: !rest.includes('--no-worktree'),
      });
      const steps = loadWorkflows(run.workflowDir);
      console.log(`${run.id}  ${steps.length} step(s): ${steps.map((s) => s.name).join(' → ')}`);
      console.log(`workspace: ${run.workspace}`);
      console.log(`run 'wf tick' (or 'wf up') to start it`);
      return;
    }

    case 'tick': {
      const results = await tick(e);
      if (!results.length) return console.log('no runs');
      for (const r of results) {
        const filed = r.filed.length ? `  filed: ${r.filed.join(', ')}` : '';
        const blocked = r.blocked.length ? `  blocked: ${r.blocked.join(', ')}` : '';
        console.log(`${r.run.id}  ${r.status}${filed}${blocked}`);
      }
      return;
    }

    case 'up': {
      const every = Number(rest[0]) || 4_000;
      console.log(`up — every ${every}ms, ^C to stop`);
      for (;;) {
        for (const r of await tick(e)) {
          if (r.filed.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  filed ${r.filed.join(', ')}`);
        }
        await new Promise((r) => setTimeout(r, every));
      }
    }

    case 'ls': {
      const runs = rest[0] ? [readRun(rest[0])] : listRuns();
      if (!runs.length) return console.log('no runs');
      for (const run of runs) {
        console.log(`${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}`);
        for (const s of await stepViews(e, run)) {
          console.log(`   ${s.name.padEnd(14)} ${s.phase.padEnd(20)} ${s.branch ?? ''}`);
        }
        // Where to go and look. A run whose result nobody can find is a run that did not happen.
        const result = resultBranches(run);
        if (result.length) console.log(`   → result: ${result.join(', ')}  (in ${run.repo})`);
      }
      return;
    }

    case 'show': {
      if (!rest[0]) return console.log(HELP);
      const run = readRun(rest[0]);
      console.log(JSON.stringify({ ...run, brief: `${run.brief.slice(0, 120)}…` }, null, 2));
      return;
    }

    case 'logs': {
      const [runId, stepName] = rest;
      if (!runId || !stepName) return console.log(HELP);
      const taskId = readRun(runId).steps[stepName]?.taskId;
      if (!taskId) return console.log(`${stepName} has not run yet`);
      return console.log(await e.logs(taskId));
    }

    default:
      return console.log(HELP);
  }
}
