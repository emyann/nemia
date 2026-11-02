/**
 * The Workflow door's contract (`WorkflowDoor`, `src/workflows/workflows.store.ts`), as walks (`door-walks.ts`): every method's rows, run
 * on the files by `src/workflows/workflows.store.test.ts` and on the memory stand-in by `src/workflows/memory.store.test.ts`. A workflow
 * written is listed, there at a version and read back as its steps, written again at its version, and removed and gone; and the write
 * check: a step name that is no file's, an `after:` naming no step, steps waiting on each other, a write over a folder with no version or
 * at one it moved on from, and one given a version where nothing is, are each refused with nothing written; a removal something still
 * needs is refused, the folder kept.
 *
 * A step naming an agent is resolved against the agents the side's Agent door holds (`agentsOn`): each side gives its Workflow door the
 * Agent and Skill doors of the same layer (`defs`), and a walk writes the agent through that door.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in. A former spelling a folder's files still hold is the files'
 * alone, since the stand-in renders every file today: `workflows.store.test.ts` reads its hint.
 */
import assert from 'node:assert/strict';
import type { DoorSide, DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import { anAgent } from './agent-walks.ts';
import type { WorkflowDefs, WorkflowDoorShape, WorkflowDraft } from '../src/workflows/workflows.store.ts';
import type { AgentDoorShape } from '../src/agents/agent-door.store.ts';
import { AgentName } from '../src/agents/agents.model.ts';
import { WorkflowDir } from '../src/folder/folder.model.ts';
import type { StepDraft } from '../src/workflow/index.ts';

type Walk = DoorWalk<WorkflowDoorShape>;
type Side = DoorSide<WorkflowDoorShape>;

/** A side of the Workflow door with the Agent and Skill doors its door finds a workflow's agents and skills through. */
export type WorkflowSide = Side & { readonly defs: WorkflowDefs };

/** The Agent door a side's Workflow door reads agents through: what a walk writes an agent with. */
const agentsOn = (side: Side): AgentDoorShape => {
  const { defs } = side as Partial<WorkflowSide>;
  assert.ok(defs, `the ${side.layer} side gives its Workflow door no Agent door: give the side its defs`);
  return defs.agents;
};

/** `scribe` written on a side as an agent of yours, through the Agent door its Workflow door reads through. */
const scribeOn = (side: Side): void => {
  done(agentsOn(side).agents.write(AgentName.read('scribe'), anAgent(), undefined, { dir: `${side.root}/workflows/agents` }));
};

/** A workflow of one step, `build`, naming the agent `scribe`. */
const scribed = (): WorkflowDraft => aWorkflow([{ ...aStep('build'), agent: 'scribe' }]);

/** Of a step read or written, what a walk compares of its agent: its name, and the model it gives the step. */
const agentOf = (steps: readonly { name: string; agent?: { name: string }; model?: string }[]) =>
  steps.map((s) => [s.name, s.agent?.name, s.model]);

/** A step drafted as the builder sends one: its name, the steps it waits on, and its words. */
export const aStep = (name: string, after: string[] = []): StepDraft => ({ name, after, place: 'git', body: `Do ${name}.` });

/** A workflow drafted as the builder sends one: `plan`, then `build` waiting on it, unless other steps are given. */
export const aWorkflow = (steps: StepDraft[] = [aStep('plan'), aStep('build', ['plan'])], readme?: string): WorkflowDraft => ({
  steps,
  ...(readme !== undefined && { readme }),
});

/** The folder of yours `name` on a side: `<root>/workflows/<name>`. */
export const yoursOn = ({ root }: Side, name: string): WorkflowDir => WorkflowDir.read(`${root}/workflows/${name}`);

/** `name` written on a side as a new workflow, at the version it is at after. */
const written = (side: Side, name: string, draft: WorkflowDraft = aWorkflow()): string =>
  done(side.door.workflows.write(yoursOn(side, name), draft)).version;

/** What a refused write leaves: still nothing there. */
const refusedWrite = (side: Side, draft: WorkflowDraft) => ({
  write: act(side.door.workflows.write(yoursOn(side, 'dev'), draft)),
  there: done(side.door.workflows.there(yoursOn(side, 'dev'))).kind,
});

export const WORKFLOW_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'workflows.list': [
    { name: 'none in an empty store', walk: (side) => done(side.door.workflows.list(`${side.root}/workflows`)), says: [] },
    {
      name: 'each written, by name, sorted',
      walk: (side) => {
        written(side, 'zeta');
        written(side, 'alpha');
        return done(side.door.workflows.list(`${side.root}/workflows`));
      },
      says: ['alpha', 'zeta'],
    },
    {
      name: 'REFUSED: a holder that is no whole path is Invalid',
      walk: (side) => act(side.door.workflows.list('workflows')),
      says: { refused: 'Invalid' },
    },
  ],
  'workflows.read': [
    {
      name: 'REFUSED: no folder is Invalid',
      walk: (side) => act(side.door.workflows.read(yoursOn(side, 'dev'))),
      says: { refused: 'Invalid' },
    },
    {
      name: 'its steps, in the order they run',
      walk: (side) => {
        written(side, 'dev');
        return done(side.door.workflows.read(yoursOn(side, 'dev'))).map((s) => [s.name, s.after, s.body]);
      },
      says: [
        ['plan', [], 'Do plan.'],
        ['build', ['plan'], 'Do build.'],
      ],
    },
    {
      name: "a step naming an agent the side's Agent door holds, resolved with its keys",
      walk: (side) => {
        scribeOn(side);
        written(side, 'dev', scribed());
        return agentOf(done(side.door.workflows.read(yoursOn(side, 'dev'))));
      },
      says: [['build', 'scribe', 'sonnet']],
    },
    {
      name: 'REFUSED: a folder that is no workflow’s id is Invalid',
      walk: (side) => act(side.door.workflows.read(WorkflowDir.read(`${side.root}/workflows/../dev`))),
      says: { refused: 'Invalid' },
    },
  ],
  'workflows.there': [
    { name: 'nothing before it is written', walk: (side) => done(side.door.workflows.there(yoursOn(side, 'dev'))), says: { kind: 'none' } },
    {
      name: 'a folder at the version its write answered',
      walk: (side) => {
        const version = written(side, 'dev');
        const there = done(side.door.workflows.there(yoursOn(side, 'dev')));
        return there.kind === 'folder' && there.version === version;
      },
      says: true,
    },
  ],
  'workflows.write': [
    {
      name: 'a new workflow: every file written',
      walk: (side) => {
        const { dir, written, kept, removed } = done(side.door.workflows.write(yoursOn(side, 'dev'), aWorkflow(undefined, '# Dev\n')));
        return { dir, written, kept, removed };
      },
      says: { dir: '<root>/workflows/dev', written: ['README.md', 'build.md', 'plan.md'], kept: [], removed: [] },
    },
    {
      name: 'written again at its version: a step unchanged kept, a step gone removed',
      walk: (side) => {
        const version = written(side, 'dev');
        const {
          written: files,
          kept,
          removed,
        } = done(side.door.workflows.write(yoursOn(side, 'dev'), aWorkflow([aStep('plan')]), version));
        return { written: files, kept, removed };
      },
      says: { written: [], kept: ['plan.md'], removed: ['build.md'] },
    },
    {
      name: "a step naming an agent the side's Agent door holds: written, and answered resolved with its keys",
      walk: (side) => {
        scribeOn(side);
        const { written: files, steps } = done(side.door.workflows.write(yoursOn(side, 'dev'), scribed()));
        return { written: files, steps: agentOf(steps) };
      },
      says: { written: ['build.md'], steps: [['build', 'scribe', 'sonnet']] },
    },
    {
      name: 'REFUSED: a step naming an agent no door holds is Invalid, nothing written',
      walk: (side) => refusedWrite(side, scribed()),
      says: { write: { refused: 'Invalid' }, there: 'none' },
    },
    {
      name: 'REFUSED: over a folder with no version is a Conflict, the folder as it was',
      walk: (side) => {
        written(side, 'dev');
        return {
          write: act(side.door.workflows.write(yoursOn(side, 'dev'), aWorkflow([aStep('plan')]))),
          steps: done(side.door.workflows.read(yoursOn(side, 'dev'))).length,
        };
      },
      says: { write: { refused: 'Conflict' }, steps: 2 },
    },
    {
      name: 'REFUSED: at a version it moved on from is a Conflict',
      walk: (side) => {
        const version = written(side, 'dev');
        done(side.door.workflows.write(yoursOn(side, 'dev'), aWorkflow([aStep('plan')]), version));
        return act(side.door.workflows.write(yoursOn(side, 'dev'), aWorkflow(), version));
      },
      says: { refused: 'Conflict' },
    },
    {
      name: 'REFUSED: given a version where nothing is, Missing',
      walk: (side) => act(side.door.workflows.write(yoursOn(side, 'dev'), aWorkflow(), 'v1')),
      says: { refused: 'Missing' },
    },
    {
      name: 'REFUSED: a step name that is no file’s is Invalid, nothing written',
      walk: (side) => refusedWrite(side, aWorkflow([aStep('a/b')])),
      says: { write: { refused: 'Invalid' }, there: 'none' },
    },
    {
      name: 'REFUSED: an after naming no step is Invalid, nothing written',
      walk: (side) => refusedWrite(side, aWorkflow([aStep('build', ['plan'])])),
      says: { write: { refused: 'Invalid' }, there: 'none' },
    },
    {
      name: 'REFUSED: steps waiting on each other are Invalid, nothing written',
      walk: (side) => refusedWrite(side, aWorkflow([aStep('plan', ['build']), aStep('build', ['plan'])])),
      says: { write: { refused: 'Invalid' }, there: 'none' },
    },
    {
      name: 'REFUSED: no step is Invalid, nothing written',
      walk: (side) => refusedWrite(side, aWorkflow([])),
      says: { write: { refused: 'Invalid' }, there: 'none' },
    },
  ],
  'workflows.remove': [
    {
      name: 'removed at its version, every file named, and gone',
      walk: (side) => {
        const version = written(side, 'dev', aWorkflow(undefined, '# Dev\n'));
        const { dir, removed } = done(side.door.workflows.remove(yoursOn(side, 'dev'), version, []));
        return { dir, removed, there: done(side.door.workflows.there(yoursOn(side, 'dev'))).kind };
      },
      says: { dir: '<root>/workflows/dev', removed: ['README.md', 'build.md', 'plan.md'], there: 'none' },
    },
    {
      name: 'REFUSED: with no version is Invalid, at one it moved on from a Conflict',
      walk: (side) => {
        written(side, 'dev');
        return [
          act(side.door.workflows.remove(yoursOn(side, 'dev'), undefined, [])),
          act(side.door.workflows.remove(yoursOn(side, 'dev'), 'v0', [])),
        ];
      },
      says: [{ refused: 'Invalid' }, { refused: 'Conflict' }],
    },
    {
      name: 'REFUSED: still needed is a Conflict, the folder kept',
      walk: (side) => {
        const version = written(side, 'dev');
        return {
          remove: act(side.door.workflows.remove(yoursOn(side, 'dev'), version, ['run r-1 reads its steps from it.'])),
          there: done(side.door.workflows.there(yoursOn(side, 'dev'))).kind,
        };
      },
      says: { remove: { refused: 'Conflict' }, there: 'folder' },
    },
    {
      name: 'REFUSED: not there is Missing',
      walk: (side) => act(side.door.workflows.remove(yoursOn(side, 'dev'), undefined, [])),
      says: { refused: 'Missing' },
    },
  ],
  'workflows.hints': [
    {
      name: 'none for a folder written today',
      walk: (side) => {
        written(side, 'dev');
        return done(side.door.workflows.hints(yoursOn(side, 'dev')));
      },
      says: [],
    },
  ],
};
