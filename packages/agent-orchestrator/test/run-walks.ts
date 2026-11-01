/**
 * The Run door's contract (`RunDoor`, `src/runs/runs.store.ts`), as walks (`door-walks.ts`): every method's rows, run on the files by
 * `run-store.test.ts` and on the memory stand-in by `src/runs/memory.store.test.ts`. A run made is read back with a person's files composed
 * onto it and written back with none; a record gone is not made again; whether a run is there, taken and called off; the stamps a pass
 * compares; an ask of each kind written once at its name, read, consumed and answered from; a hold, a refresh ask and a prune marker put
 * and taken back; a cancellation kept as first written; a run forgotten; the markers of what `nemia rm` forgets. And the write check:
 * a new run or one written back that breaks an invariant of the model's `Run` is refused `Invalid` and nothing is written, and a new run
 * at an id already made is refused `Conflict`, the first left as it was, as is a second run from one card while the first stands.
 *
 * Each row's ids are its own: the files side is one store for the whole file.
 */
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { RunDoorShape } from '../src/runs/runs.store.ts';
import { RunId } from '../src/record/record.model.ts';
import type { PersonRequest, Run } from '../src/record/record.ts';

type Walk = DoorWalk<RunDoorShape>;
type Door = RunDoorShape;

const at = '2026-09-30T09:00:00.000Z';
const idOf = (id: string): RunId => RunId.read(id);

/** A repository run's record as the tick writes one today, frozen steps and all. */
export const aRun = (id: string): Run => ({
  id,
  repo: '/repo',
  workspace: '/repo',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/repo/workflows/dev',
  workflow: [
    { name: 'implement', after: [], body: 'do it', harness: 'claude' },
    { name: 'review', after: ['implement'], body: 'read it', harness: 'claude' },
  ],
  steps: { implement: { taskId: `${id}-implement`, workspace: '/w/implement', branch: `wf/${id}/implement` }, review: { taskId: null } },
  createdAt: '2026-09-01T00:00:00.000Z',
});

/** A run made through the door under `id`. */
const made = (door: Door, id: string): Run => {
  const run = aRun(id);
  act(door.runs.create(run));
  return run;
};

/** What a read of `id` answers: its brief, or the refusal's kind. */
const briefOf = (door: Door, id: string): unknown => {
  const read = act(door.runs.read(idOf(id)));
  return 'refused' in read ? read : read.brief;
};

/** A run whose implement step's second try ran under a task no filing names. */
const misnamed = (id: string): Run => {
  const run = aRun(id);
  return {
    ...run,
    steps: { ...run.steps, implement: { ...run.steps.implement, taskId: 't-1', tries: [{ taskId: `${id}-implement`, cause: 'fresh' }] } },
  };
};

/** A run under `id` started out of the inbox's card `card`. */
const fromCard = (id: string, card: string): Run => ({ ...aRun(id), from: { inbox: card } });

/** A run that waits on itself. */
const selfWaiting = (id: string): Run => ({ ...aRun(id), after: [id] });

/** A run whose implement step landed both a commit and an abort. */
const landedTwice = (id: string): Run => {
  const run = aRun(id);
  return {
    ...run,
    steps: { ...run.steps, implement: { ...run.steps.implement, landed: { commit: 'a'.repeat(40), aborted: 'conflict' } } },
  };
};

/** One ask of each kind a person writes, and its key's number. */
const ASKS: Array<{ asked: PersonRequest; n: number }> = [
  { asked: { kind: 'retry', of: 'try', ask: { step: 'implement', try: 2, mode: 'fresh', message: 'again', at } }, n: 2 },
  { asked: { kind: 'retry', of: 'round', ask: { step: 'review', round: 3, at } }, n: 3 },
  { asked: { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at, message: 'yes' } }, n: 1 },
  { asked: { kind: 'approve', of: 'loop', ask: { step: 'review', try: 1, at, message: 'good enough' } }, n: 1 },
  {
    asked: {
      kind: 'refresh',
      of: 'base',
      ask: { step: 'review', round: 2, at, merge: { target: 'implement', try: 3, onto: 'main', sha: 'a'.repeat(40) } },
    },
    n: 3,
  },
];
const stepOf = (asked: PersonRequest): string => (asked.of === 'base' ? asked.ask.merge.target : asked.ask.step);

const READ: Walk[] = [
  {
    name: 'a run made is read back with the hold, the approval and the cancellation beside it composed onto it',
    walk: ({ door }) => {
      made(door, 'w-read');
      const hold = act(door.holds.put(idOf('w-read'), ['other-run'], {}));
      act(door.asks.write(idOf('w-read'), { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at, message: 'yes' } }));
      const cancelledAt = act(door.runs.cancel(idOf('w-read')));
      const read = act(door.runs.read(idOf('w-read'))) as Run;
      return {
        brief: read.brief,
        hold: read.hold?.until,
        held: read.hold?.at === (hold as { at: string }).at,
        approvals: read.approvals,
        cancelled: read.cancelledAt === cancelledAt,
      };
    },
    says: {
      brief: 'add a flag',
      hold: ['other-run'],
      held: true,
      approvals: [{ step: 'implement', try: 1, at, message: 'yes' }],
      cancelled: true,
    },
  },
  { name: 'an id never made is refused as missing', walk: ({ door }) => briefOf(door, 'w-never-made'), says: { refused: 'Missing' } },
];

const CREATE: Walk[] = [
  {
    name: 'REFUSED: a new run whose try ran under a task no filing names is not made (triesNamed)',
    walk: ({ door }) => [act(door.runs.create(misnamed('w-misnamed'))), act(door.runs.exists(idOf('w-misnamed')))],
    says: [{ refused: 'Invalid' }, false],
  },
  {
    name: 'REFUSED: a new run that waits on itself is not made (afterOthers)',
    walk: ({ door }) => [act(door.runs.create(selfWaiting('w-self'))), act(door.runs.exists(idOf('w-self')))],
    says: [{ refused: 'Invalid' }, false],
  },
  {
    name: 'REFUSED: a new run whose step landed both a commit and an abort is not made',
    walk: ({ door }) => [act(door.runs.create(landedTwice('w-landed'))), act(door.runs.exists(idOf('w-landed')))],
    says: [{ refused: 'Invalid' }, false],
  },
  {
    name: 'REFUSED: a new run under an id outside the pattern runId mints is not made (RunId.OnCreate)',
    walk: ({ door }) => [act(door.runs.create(aRun('W_Upper'))), act(door.runs.exists(idOf('W_Upper')))],
    says: [{ refused: 'Invalid' }, false],
  },
  {
    name: 'REFUSED: a new run at an id already made conflicts, and the first stays as it was',
    walk: ({ door }) => {
      made(door, 'w-twice');
      const again = act(door.runs.create({ ...aRun('w-twice'), brief: 'another' }));
      return [again, briefOf(door, 'w-twice')];
    },
    says: [{ refused: 'Conflict' }, 'add a flag'],
  },
  {
    name: 'REFUSED: a second run from one card is a Conflict, the first kept, nothing left under the second id',
    walk: ({ door }) => {
      act(door.runs.create(fromCard('w-card-first', 'w-card-twice')));
      const again = act(door.runs.create(fromCard('w-card-second', 'w-card-twice')));
      return [again, briefOf(door, 'w-card-first'), act(door.runs.taken(idOf('w-card-second')))];
    },
    says: [{ refused: 'Conflict' }, 'add a flag', false],
  },
  {
    name: 'a card whose run was forgotten starts again',
    walk: ({ door }) => {
      act(door.runs.create(fromCard('w-card-gone', 'w-card-again')));
      act(door.runs.forget(idOf('w-card-gone')));
      return [act(door.runs.create(fromCard('w-card-anew', 'w-card-again'))), briefOf(door, 'w-card-anew')];
    },
    says: [undefined, 'add a flag'],
  },
];

const REWRITE: Walk[] = [
  {
    name: 'a record removed is not written back: rewrite answers false and makes no record',
    walk: ({ door }) => {
      const run = made(door, 'w-gone');
      act(door.runs.forget(idOf(run.id)));
      return [act(door.runs.rewrite(run)), act(door.runs.exists(idOf(run.id)))];
    },
    says: [false, false],
  },
  {
    name: "a run written back carries none of a person's files composed onto it, and reads back with them still",
    walk: ({ door }) => {
      const run = made(door, 'w-one-writer');
      act(door.holds.put(idOf(run.id), ['other-run'], {}));
      act(door.runs.prune(idOf(run.id), { at, worktrees: [] }));
      const read = act(door.runs.read(idOf(run.id))) as Run;
      act(door.runs.rewrite({ ...read, brief: 'changed' }));
      act(door.holds.lift(idOf(run.id), read.hold!.at));
      act(door.runs.prune(idOf(run.id), undefined));
      const again = act(door.runs.read(idOf(run.id))) as Run;
      return { brief: again.brief, hold: again.hold, pruned: again.pruned };
    },
    says: { brief: 'changed', hold: undefined, pruned: undefined },
  },
  {
    name: 'REFUSED: a run written back whose try ran under a task no filing names is not written, and the record is left as it was',
    walk: ({ door }) => {
      made(door, 'w-rewrite-misnamed');
      const refused = act(door.runs.rewrite({ ...misnamed('w-rewrite-misnamed'), brief: 'broken' }));
      return [refused, briefOf(door, 'w-rewrite-misnamed')];
    },
    says: [{ refused: 'Invalid' }, 'add a flag'],
  },
];

const RUNS: Record<string, Walk[]> = {
  'runs.read': READ,
  'runs.list': [
    {
      name: 'every run made is listed by id, and one the memo keeps is listed as given',
      walk: ({ door }) => {
        made(door, 'w-list-a');
        made(door, 'w-list-b');
        const kept = { ...aRun('w-list-b'), brief: 'kept' };
        const listed = act(door.runs.list(undefined, (id) => (id === 'w-list-b' ? kept : undefined))) as Run[];
        return listed.filter((r) => r.id.startsWith('w-list-')).map((r) => [r.id, r.brief]);
      },
      says: [
        ['w-list-a', 'add a flag'],
        ['w-list-b', 'kept'],
      ],
    },
  ],
  'runs.find': [
    {
      name: 'a run made is found, and an id never made is not',
      walk: ({ door }) => {
        made(door, 'w-find');
        return [(act(door.runs.find(idOf('w-find'))) as Run | undefined)?.brief, act(door.runs.find(idOf('w-find-never')))];
      },
      says: ['add a flag', undefined],
    },
  ],
  'runs.create': CREATE,
  'runs.rewrite': REWRITE,
  'runs.stamps': [
    {
      name: "an ask moves its run's stamp, and another run's stands",
      walk: ({ door }) => {
        made(door, 'w-stamp');
        made(door, 'w-stamp-other');
        const before = act(door.runs.stamps()) as Map<string, string>;
        act(door.asks.write(idOf('w-stamp'), ASKS[0].asked));
        const after = act(door.runs.stamps()) as Map<string, string>;
        return [
          Boolean(before.get('w-stamp')),
          before.get('w-stamp') === after.get('w-stamp'),
          before.get('w-stamp-other') === after.get('w-stamp-other'),
        ];
      },
      says: [true, false, true],
    },
  ],
  'runs.exists': [
    {
      name: 'a run exists once made and not once forgotten, and an id never made does not',
      walk: ({ door }) => {
        const before = act(door.runs.exists(idOf('w-exists')));
        made(door, 'w-exists');
        const there = act(door.runs.exists(idOf('w-exists')));
        act(door.runs.forget(idOf('w-exists')));
        return [before, there, act(door.runs.exists(idOf('w-exists')))];
      },
      says: [false, true, false],
    },
  ],
  'runs.taken': [
    {
      name: "an id is taken by a record or a person's file alone, and free with neither",
      walk: ({ door }) => {
        made(door, 'w-taken');
        act(door.holds.put(idOf('w-taken-held'), ['x'], {}));
        return ['w-taken', 'w-taken-held', 'w-taken-free'].map((id) => act(door.runs.taken(idOf(id))));
      },
      says: [true, true, false],
    },
  ],
  'runs.calledOff': [
    {
      name: 'a plain run is not called off; a cancelled, a held and a pruned one is',
      walk: ({ door }) => {
        for (const id of ['w-off-plain', 'w-off-cancelled', 'w-off-held', 'w-off-pruned']) made(door, id);
        act(door.runs.cancel(idOf('w-off-cancelled')));
        act(door.holds.put(idOf('w-off-held'), ['x'], {}));
        act(door.runs.prune(idOf('w-off-pruned'), { at, worktrees: [] }));
        return ['w-off-plain', 'w-off-cancelled', 'w-off-held', 'w-off-pruned'].map((id) => act(door.runs.calledOff(idOf(id))));
      },
      says: [false, true, true, true],
    },
  ],
  'runs.cancel': [
    {
      name: 'a run cancelled twice keeps the first time, and is read with it',
      walk: ({ door }) => {
        made(door, 'w-cancel');
        const first = act(door.runs.cancel(idOf('w-cancel')));
        return [act(door.runs.cancel(idOf('w-cancel'))) === first, (act(door.runs.read(idOf('w-cancel'))) as Run).cancelledAt === first];
      },
      says: [true, true],
    },
  ],
  'runs.forget': [
    {
      name: "a run forgotten loses its record and every person's file, in order, another run keeps its own, and a second forget removes nothing",
      walk: ({ door }) => {
        for (const id of ['w-forget', 'w-forget-other']) {
          made(door, id);
          act(door.runs.cancel(idOf(id)));
          act(door.runs.prune(idOf(id), { at, worktrees: [] }));
          act(door.holds.put(idOf(id), ['x'], {}));
          act(door.refresh.put(idOf(id)));
          act(door.asks.write(idOf(id), { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at } }));
        }
        const removed = act(door.runs.forget(idOf('w-forget')));
        const kept = act(door.runs.read(idOf('w-forget-other'))) as Run;
        return {
          removed,
          taken: act(door.runs.taken(idOf('w-forget'))),
          kept: Boolean(kept.cancelledAt && kept.pruned && kept.hold && kept.approvals),
          again: act(door.runs.forget(idOf('w-forget'))),
        };
      },
      says: {
        removed: [
          'runs/w-forget.json',
          'runs/w-forget.cancelled',
          'runs/w-forget.pruned',
          'runs/w-forget.hold',
          'runs/w-forget.refresh',
          'runs/w-forget.asks/',
        ],
        taken: false,
        kept: true,
        again: [],
      },
    },
  ],
  'runs.ids': [
    {
      name: 'the id of every run made, sorted',
      walk: ({ door }) => {
        made(door, 'w-ids-b');
        made(door, 'w-ids-a');
        return (act(door.runs.ids()) as string[]).filter((id) => id.startsWith('w-ids-'));
      },
      says: ['w-ids-a', 'w-ids-b'],
    },
  ],
  'runs.filesAt': [
    {
      name: 'a run that handed on no file has no files directory',
      walk: ({ door }) => (made(door, 'w-files'), act(door.runs.filesAt(idOf('w-files')))),
      says: undefined,
    },
  ],
  'runs.dropFiles': [
    { name: 'a files directory never there drops as gone', walk: ({ door }) => act(door.runs.dropFiles(idOf('w-drop-never'))), says: null },
  ],
  'runs.prune': [
    {
      name: 'a prune marker put is read back, and taken back is not',
      walk: ({ door }) => {
        made(door, 'w-prune');
        const marker = { at, worktrees: [{ path: '/w/implement', bytes: 12 }], artifacts: { at, bytes: 3 } };
        act(door.runs.prune(idOf('w-prune'), marker));
        const put = (act(door.runs.read(idOf('w-prune'))) as Run).pruned;
        act(door.runs.prune(idOf('w-prune'), undefined));
        return [put, (act(door.runs.read(idOf('w-prune'))) as Run).pruned];
      },
      says: [{ at, worktrees: [{ path: '/w/implement', bytes: 12 }], artifacts: { at, bytes: 3 } }, undefined],
    },
  ],
  'runs.pruned': [
    {
      name: 'the prune marker is read by its own reader, and none for a run with none',
      walk: ({ door }) => {
        act(door.runs.prune(idOf('w-pruned'), { at, worktrees: [] }));
        return [act(door.runs.pruned(idOf('w-pruned'))), act(door.runs.pruned(idOf('w-pruned-none')))];
      },
      says: [{ at, worktrees: [] }, undefined],
    },
  ],
};

const ASK_WALKS: Record<string, Walk[]> = {
  'asks.write': [
    {
      name: 'an ask of each kind is written once where `where` finds it, and a second there is refused as no stray',
      walk: ({ door }) => {
        made(door, 'w-write-asks');
        const wheres = ASKS.map(({ asked, n }) => act(door.asks.where(idOf('w-write-asks'), { of: asked.of, step: stepOf(asked), n })));
        return ASKS.map(({ asked }, i) => {
          const first = done(door.asks.write(idOf('w-write-asks'), asked));
          const again = done(
            door.asks.write(idOf('w-write-asks'), { ...asked, ask: { ...asked.ask, at: '2026-10-01T00:00:00.000Z' } } as PersonRequest),
          );
          const stray = again.written ? undefined : again.stray;
          return [first.written, first.where === wheres[i], again.written, again.where === wheres[i], stray];
        }).concat([[new Set(wheres).size === ASKS.length]]);
      },
      says: [...ASKS.map(() => [true, true, false, true, null]), [true]],
    },
  ],
  'asks.where': [
    {
      name: "an ask is found in its run's asks, by which of its verb it is, its step and its number",
      walk: ({ door, root }) => {
        const where = done(door.asks.where(idOf('w-where'), { of: 'try', step: 'implement', n: 2 }));
        return [where.startsWith(`${root}/runs/w-where.asks/`), where.endsWith('-implement-2')];
      },
      says: [true, true],
    },
  ],
  'asks.read': [
    {
      name: 'the asks waiting are read: a retry among the asks, a round and a merge among the rounds, and approvals onto the run',
      walk: ({ door }) => {
        made(door, 'w-read-asks');
        for (const { asked } of ASKS) act(door.asks.write(idOf('w-read-asks'), asked));
        const read = act(door.asks.read(idOf('w-read-asks'))) as {
          asks: unknown[];
          rounds: Array<{ step: string; round: number; merge?: unknown }>;
          notes: string[];
        };
        const run = act(door.runs.read(idOf('w-read-asks'))) as Run;
        return {
          asks: read.asks,
          rounds: read.rounds.map((r) => [r.step, r.round, Boolean(r.merge)]).sort((a, b) => String(a).localeCompare(String(b))),
          notes: read.notes,
          approvals: run.approvals?.length,
          acceptances: run.acceptances?.length,
        };
      },
      says: {
        asks: [ASKS[0].asked.ask],
        rounds: [
          ['review', 2, true],
          ['review', 3, false],
        ],
        notes: [],
        approvals: 1,
        acceptances: 1,
      },
    },
  ],
  'asks.consume': [
    {
      name: 'an ask stays until the record holds its try, is consumed once it does, and is still answered from',
      walk: ({ door }) => {
        const run = made(door, 'w-consume');
        act(door.asks.write(idOf(run.id), ASKS[0].asked));
        const { asks, rounds } = done(door.asks.read(idOf(run.id)));
        act(door.asks.consume(run, asks, rounds));
        const stays = (act(door.asks.read(idOf(run.id))) as { asks: unknown[] }).asks.length;
        const tried = {
          ...run,
          steps: {
            ...run.steps,
            implement: {
              ...run.steps.implement,
              tries: [{ taskId: `${run.id}-implement`, cause: 'fresh' as const }],
              taskId: `${run.id}-implement-try2`,
            },
          },
        };
        act(door.asks.consume(tried, asks, rounds));
        return [stays, (act(door.asks.read(idOf(run.id))) as { asks: unknown[] }).asks.length];
      },
      says: [1, 0],
    },
  ],
  'asks.answers': [
    {
      name: 'every retry that carried a message is answered from, waiting or consumed',
      walk: ({ door }) => {
        made(door, 'w-answers');
        act(door.asks.write(idOf('w-answers'), ASKS[0].asked));
        act(door.asks.write(idOf('w-answers'), { kind: 'retry', of: 'try', ask: { step: 'review', try: 2, mode: 'fresh', at } }));
        return (act(door.asks.answers(idOf('w-answers'))) as Array<{ message?: string }>).map((a) => a.message);
      },
      says: ['again'],
    },
  ],
};

const HOLDS: Record<string, Walk[]> = {
  'holds.put': [
    {
      name: 'a hold is put once: a second put answers null and the first stands',
      walk: ({ door }) => {
        made(door, 'w-put');
        const hold = act(door.holds.put(idOf('w-put'), ['other-run'], { why: 'wait for it', by: 'ann' })) as {
          until: string[];
          why: string;
          by: string;
          at: string;
        };
        const again = act(door.holds.put(idOf('w-put'), ['third-run'], {}));
        const read = (act(door.runs.read(idOf('w-put'))) as Run).hold;
        return [hold.until, hold.why, hold.by, again, read?.at === hold.at];
      },
      says: [['other-run'], 'wait for it', 'ann', null, true],
    },
  ],
  'holds.lift': [
    {
      name: 'a hold is lifted only as it was put: not one put at another time, and the one standing',
      walk: ({ door }) => {
        const hold = act(door.holds.put(idOf('w-lift'), ['other-run'], {})) as { at: string };
        return [
          act(door.holds.lift(idOf('w-lift'), '2020-01-01T00:00:00.000Z')),
          act(door.holds.stands(idOf('w-lift'))),
          act(door.holds.lift(idOf('w-lift'), hold.at)),
          act(door.holds.stands(idOf('w-lift'))),
        ];
      },
      says: [false, true, true, false],
    },
  ],
  'holds.stands': [
    {
      name: 'no hold stands for a run nobody held',
      walk: ({ door }) => act(door.holds.stands(idOf('w-stands-none'))),
      says: false,
    },
  ],
  'refresh.put': [
    {
      name: 'a refresh ask is put once: a second answers null, and it stands until lifted',
      walk: ({ door }) => {
        const first = act(door.refresh.put(idOf('w-refresh'))) as { at: string } | null;
        return [Boolean(first?.at), act(door.refresh.put(idOf('w-refresh'))), act(door.refresh.stands(idOf('w-refresh')))];
      },
      says: [true, null, true],
    },
  ],
  'refresh.lift': [
    {
      name: 'a refresh ask lifted says it was there, and lifted again that it was not',
      walk: ({ door }) => {
        act(door.refresh.put(idOf('w-refresh-lift')));
        return [
          act(door.refresh.lift(idOf('w-refresh-lift'))),
          act(door.refresh.lift(idOf('w-refresh-lift'))),
          act(door.refresh.stands(idOf('w-refresh-lift'))),
        ];
      },
      says: [true, false, false],
    },
  ],
  'refresh.stands': [
    {
      name: 'no refresh ask stands for a run nobody asked to refresh',
      walk: ({ door }) => act(door.refresh.stands(idOf('w-refresh-none'))),
      says: false,
    },
  ],
};

const FORGETTING: Record<string, Walk[]> = {
  'forgetting.write': [
    {
      name: "a marker written is read back whole over the one there, and listed by its run's id",
      walk: ({ door }) => {
        act(door.forgetting.write(idOf('w-forgetting'), ['t-1']));
        act(door.forgetting.write(idOf('w-forgetting'), ['t-1', 't-2']));
        return [
          act(door.forgetting.read(idOf('w-forgetting'))),
          (act(door.forgetting.list()) as string[]).filter((id) => id.startsWith('w-forgetting')),
        ];
      },
      says: [['t-1', 't-2'], ['w-forgetting']],
    },
  ],
  'forgetting.read': [
    {
      name: 'no marker is read for a run with none',
      walk: ({ door }) => act(door.forgetting.read(idOf('w-forgetting-none'))),
      says: undefined,
    },
  ],
  'forgetting.list': [
    {
      name: 'the runs a marker stands for, sorted',
      walk: ({ door }) => {
        act(door.forgetting.write(idOf('w-fl-b'), []));
        act(door.forgetting.write(idOf('w-fl-a'), []));
        return (act(door.forgetting.list()) as string[]).filter((id) => id.startsWith('w-fl-'));
      },
      says: ['w-fl-a', 'w-fl-b'],
    },
  ],
  'forgetting.lift': [
    {
      name: 'a marker lifted is gone, and lifted again is no refusal',
      walk: ({ door }) => {
        act(door.forgetting.write(idOf('w-fg-lift'), ['t-1']));
        act(door.forgetting.lift(idOf('w-fg-lift')));
        return [act(door.forgetting.read(idOf('w-fg-lift'))), act(door.forgetting.lift(idOf('w-fg-lift')))];
      },
      says: [undefined, undefined],
    },
  ],
  'forgetting.where': [
    {
      name: "a run's marker is found under forgetting/",
      walk: ({ door }) => act(door.forgetting.where(idOf('w-fg-where'))),
      says: '<root>/forgetting/w-fg-where.json',
    },
  ],
};

/** The Run door's walks, by method: every method of `RunDoorShape` has one, or `walksOn`'s first test fails. */
export const RUN_WALKS: Readonly<Record<string, readonly Walk[]>> = { ...RUNS, ...ASK_WALKS, ...HOLDS, ...FORGETTING };
