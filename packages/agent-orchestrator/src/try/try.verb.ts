/**
 * An agent of yours tried on a short brief, judged before anything is written, in this order: the place (`yoursOnlyRefusal`), the brief,
 * the agent's file, what the try could not run (`untriedOf`), a skill only the repository has (`repoSkillsRefusal`), and a try of it still
 * moving; then its folder written (`tryFolder`) and a run of it started with no repository (`startRun`) — a tick files it. The command line
 * and the api's route both run it, through the table's `agents run`.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { EngineService, tried } from '../runtime-client.ts';
import { runStore } from '../record/files.store.ts';
import { tryOf } from '../summary/reads.verb.ts';
import { judgedNow } from '../summary/summary.verb.ts';
import { startRun } from '../start/start.verb.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { skillNamesIn } from '../agents/read.store.ts';
import { agentRead, agentSkillsFound } from '../roster/roster.store.ts';
import type { AgentReading } from '../roster/roster.ts';
import { repoSkillsRefusal, untriedOf, yourAgentsDir } from './try.ts';
import { tryFolder } from './try.store.ts';
import { yourSkillsDir, yoursOnlyRefusal } from '../yours/yours.ts';

/**
 * What a try is asked: who asks (the command), the agent's place and name, the brief, the repository a skill may be in (none from the
 * command line) and the store.
 */
export type TryAsked = { who: string; from: string; name: string; brief: string; repo: string; home: string };

/** The skills the agent `reading` gives that only the repository `repo` has: each its name and folder. None when no repository is named. */
function repoOnlySkills(reading: AgentReading, repo: string, home: string): Array<{ name: string; dir: string }> {
  if (!repo) return [];
  const theirs = [path.join(path.resolve(repo), '.claude', 'skills'), path.join(path.resolve(repo), 'workflows', 'skills')];
  const found = agentSkillsFound(reading.dir, repo, home).at;
  return skillNamesIn(reading.source).flatMap((name) => {
    const dir = found.get(name);
    return typeof dir === 'string' && theirs.includes(path.dirname(path.resolve(dir))) ? [{ name, dir }] : [];
  });
}

/** The agent to try, read now, or the refusal of the brief, of an agent there is not, or of one that does not read or cannot be tried. */
function triedAgent({ who, from, name, brief, repo, home }: TryAsked): AgentReading {
  const where = yoursOnlyRefusal(who, 'agents', from, name, repo, home);
  if (where) throw new Invalid({ message: where });
  if (!brief.trim()) {
    throw new Invalid({
      message: `The brief is empty, and a try asks the agent to do something. Write what it should do — a sentence is enough.`,
    });
  }
  const dir = yourAgentsDir(home);
  const reading = agentRead('yours', dir, name, { repo, home });
  if (!reading) {
    throw new Missing({
      message: `Yours has no agent named '${name}' (${path.join(dir, `${name}.md`)}). nemia agents lists the agents there are.`,
    });
  }
  if (reading.error) throw new Invalid({ message: `${name} cannot be tried while its file does not read: ${reading.error}` });
  const untried = untriedOf({ ...reading, from: 'yours', schemaFile: reading.schema?.file ?? null }, home);
  if (untried) throw new Invalid({ message: untried.why });
  const theirs = repoSkillsRefusal(name, repoOnlySkills(reading, repo, home), yourSkillsDir(home));
  if (theirs) throw new Invalid({ message: theirs });
  return reading;
}

/** The try asked (`TryAsked`) started: the run's id. Refuses, by kind, as the file's head says. */
export const tryAgent = Effect.fnUntraced(function* (asked: TryAsked) {
  const reading = yield* tried(() => triedAgent(asked));
  const e = yield* EngineService;
  const tries = runStore.runs.list().filter((run) => tryOf(run, asked.home)?.agent === asked.name);
  const moving = (yield* judgedNow(e, asked.home, tries)).find((run) => run.moving);
  if (moving) {
    return yield* Effect.fail(
      new Conflict({
        message: `A try of ${asked.name} is still running (${moving.id}): one at a time. Wait for it to end — its page shows how it goes — then try again.`,
      }),
    );
  }
  const workflowDir = yield* tried(() => tryFolder(asked.name, reading.version, reading.keys, asked.home));
  const run = yield* startRun({ brief: asked.brief.trim(), repo: '', workflowDir });
  return { id: run.id };
});
