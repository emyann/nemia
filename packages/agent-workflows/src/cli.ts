/**
 * The verbs. Parse, call, print — no logic lives here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { artifacts, cancel, decide, diffStat, engine, list, listRuns, missingArtifacts, readArtifact, readRun, resultBranches, start, tick } from './runner.ts';
import { loadWorkflows } from './workflow.ts';

const HELP = `wf — run a workflow of agent steps

  wf start <brief.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree]
  wf tick                      one pass: tick the engine, file what became ready
  wf up [ms]                   the same, on a timer
  wf ls [runId]                runs and their steps
  wf cancel <runId>            stop what it has in flight; file nothing more
  wf decide <runId>            what the run produced, and the choice it leaves you
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
        const calledOff = run.cancelledAt ? '  (cancelled)' : '';
        console.log(`${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}${calledOff}`);
        const { steps, waitingOnYou } = await list(e, run);
        // As wide as this run's longest status, so its branches still line up beside it.
        const width = Math.max(20, ...steps.map((s) => s.status.length));
        for (const s of steps) {
          console.log(`   ${s.name.padEnd(14)} ${s.status.padEnd(width)} ${s.branch ?? ''}`);
        }
        // The step a person has to act on, and where to act. Said here and not left to the result
        // line, because a run blocked on its first step has no result branch yet.
        if (waitingOnYou.length) console.log(`   → waiting on you: ${waitingOnYou.join(', ')}  —  wf decide ${run.id}`);
        // Where to go and look. A run whose result nobody can find is a run that did not happen.
        const result = resultBranches(run);
        if (result.length) console.log(`   → result: ${result.join(', ')}  —  wf decide ${run.id}`);
      }
      return;
    }

    case 'cancel': {
      if (!rest[0]) return console.log(HELP);
      const { run, plan } = await cancel(e, rest[0]);

      // Say what happened, in every case. A `wf cancel` that prints nothing is indistinguishable
      // from one that did nothing — and "already finished" and "nothing was in flight" are exactly
      // the answers a person cannot tell apart from silence.
      if (plan.kind === 'finished') return console.log(`${run.id}  already ${plan.status} — nothing to stop`);

      console.log(plan.kind === 'already-cancelled' ? `${run.id}  already cancelled at ${plan.at}` : `${run.id}  cancelled`);
      if (plan.stop.length) console.log(`   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`);
      else if (plan.kind === 'cancel') console.log(`   nothing was in flight — no further steps will be filed`);
      return;
    }

    // The run does not end by going quiet. A review and a reply are two opinions and something
    // has to say what ships — which is a person's job, so the run's last act is to put the
    // material in front of one. Read-only on purpose: it shows the choice and the exact commands,
    // and does not decide anything itself.
    case 'decide': {
      if (!rest[0]) return console.log(HELP);
      const { run, decision, closeouts } = await decide(e, rest[0]);
      const head = `${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}`;

      if (decision.kind === 'cancelled') return console.log(`${head}\n\n  cancelled at ${decision.at} — nothing to decide`);
      if (decision.kind === 'running') return console.log(`${head}\n\n  still running: ${decision.waiting.join(', ')}\n  nothing to decide yet`);
      if (decision.kind === 'shipped') return console.log(`${head}\n\n  shipped — ${decision.branches.join(', ')} is already on ${run.branch}`);

      console.log(`${head}\n`);
      if (decision.failed.length) console.log(`  FAILED: ${decision.failed.join(', ')}  (wf logs ${run.id} <step>)`);
      // A step that stopped itself and said why is a different thing from one that broke, and the
      // difference decides whether you read a summary or a log.
      if (decision.stuck.length) console.log(`  BLOCKED, waiting on you: ${decision.stuck.join(', ')}`);
      if (!decision.failed.length && !decision.stuck.length) console.log(`  every step succeeded`);

      // Each step's own closeout: the summary is written FOR this moment. The reviewer never saw
      // it — that is the point of the field — and you are the audience it was addressed to.
      for (const name of Object.keys(run.steps)) {
        const c = closeouts[name];
        if (!c) continue;
        if ('error' in c) { console.log(`\n  ${name}: closeout unreadable — ${c.error}`); continue; }
        console.log(`\n  ${name}${c.outcome === 'blocked' ? '  BLOCKED' : ''}`);
        if (c.summary) console.log(`    ${c.summary.split('\n').join('\n    ')}`);
        if (c.needs) console.log(`    needs: ${c.needs}`);
        const missing = missingArtifacts(run, name, c);
        if (missing.length) console.log(`    !! declared but not on the branch: ${missing.join(', ')}  — it did not travel`);
      }
      console.log();

      for (const branch of decision.branches) {
        const stat = diffStat(run, branch);
        console.log(`  ${branch}${stat ? `  —${stat}` : ''}`);

        // Markdown a step ADDED is a message written for whoever reads next, and today that is
        // you. Source it added is in the diff, where source belongs.
        const notes = artifacts(run, branch).filter((f) => f.endsWith('.md') && !f.includes('/'));
        for (const file of notes) {
          const text = readArtifact(run, branch, file).trimEnd();
          const lines = text.split('\n');
          console.log(`\n  ── ${file} ${'─'.repeat(Math.max(0, 64 - file.length))}`);
          for (const l of lines.slice(0, 120)) console.log(`  ${l}`);
          if (lines.length > 120) console.log(`  … ${lines.length - 120} more lines — git show ${branch}:${file}`);
        }
      }

      const first = decision.branches[0];
      if (first) {
        console.log(`\n  ship it   git -C ${run.repo} merge --no-ff ${first}`);
        console.log(`  drop it   git -C ${run.repo} branch -D ${decision.branches.join(' ')}`);
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
