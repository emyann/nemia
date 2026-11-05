/**
 * What becomes of a node not yet filed (agent-orchestrator, src/route/route.ts, `nodeFate`), from its parents' words and, for a node that
 * names the route it takes (`when:`), the route its condition answered on the try the condition is on. Worked out on every pass, beside
 * `stepStatus`, and carried nowhere: `skipped` spreads down the graph from the conditions' answers, and a join runs once one parent ran
 * and every other is skipped. `assess`'s ready loop acts on it.
 *
 * - `ready`: file it. Its route is taken (or it names none), every parent is satisfied or skipped, and one ran — or it has no parent.
 * - `skipped`: it never runs on this route — its condition answered another, or every parent is skipped.
 * - `unreachable`: a parent stops what follows it, and its route does not skip it first.
 * - `waits`: neither yet — a parent still in flight, or a condition that has not answered.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { StepStatus } from '../src/record/record.ts';

/** A step's word, with the two the routing build adds to `StepStatus` (implement adds them there; this then reads `StepStatus`). */
export type NodeWord = StepStatus;

/** What a node not yet filed does on this pass. */
export type Fate = 'ready' | 'waits' | 'skipped' | 'unreachable';

/** A parent a follower may be filed on: work it did, or a card it filed (`sent`). */
const satisfies = (w: NodeWord): boolean => w === 'verified' || w === 'unverified' || w === 'sent';

/** A route not taken: neither satisfies nor stops. */
const skipped = (w: NodeWord): boolean => w === 'skipped';

/** The machinery's stops (`stopsFollowers`, record.ts): each a person's, or a break. */
const stops = (w: NodeWord): boolean =>
  w === 'blocked' ||
  w === 'unsigned' ||
  w === 'awaiting approval' ||
  w === 'exhausted' ||
  w === 'over budget' ||
  w === 'budget exhausted' ||
  w === 'denied' ||
  w === 'failed (check)' ||
  w === 'failed' ||
  w === 'stopped';

/** Its condition answered a route it does not take. */
const offRoute = (when: readonly string[] | undefined, answered: string | undefined): boolean =>
  when !== undefined && answered !== undefined && !when.includes(answered);

/** Its route is taken: it names none, or its condition answered one it names. */
const onRoute = (when: readonly string[] | undefined, answered: string | undefined): boolean =>
  when === undefined || (answered !== undefined && when.includes(answered));

const nodeFateSpec = spec<(when: readonly string[] | undefined, answered: string | undefined, parents: readonly NodeWord[]) => Fate>({
  /**
   * Which of `waits` and `unreachable` a node no law places reads is the code's: the laws say only what must be ready, skipped or
   * stopped.
   */
  open: ['output'],
  ensures: {
    offItsRouteIsSkipped: {
      description: 'A node whose condition answered a route it does not take is skipped',
      condition: ({ input: [when, answered], output }) => !offRoute(when, answered) || output === 'skipped',
    },
    everyParentSkippedIsSkipped: {
      description: 'A node every parent of which is skipped is skipped too: a skip spreads down the graph',
      condition: ({ input: [, , parents], output }) => !(parents.length > 0 && parents.every(skipped)) || output === 'skipped',
    },
    readyExactlyWhenJoined: {
      description:
        'A node is filed exactly when its route is taken, every parent is satisfied or skipped, and at least one ran — or it has none',
      condition: ({ input: [when, answered, parents], output }) =>
        (output === 'ready') ===
        (onRoute(when, answered) && parents.every((p) => satisfies(p) || skipped(p)) && (parents.length === 0 || parents.some(satisfies))),
    },
    aStopStopsWhatIsOnItsRoute: {
      description: 'A parent that stops what follows makes a node on its route unreachable, never ready and never skipped',
      condition: ({ input: [when, answered, parents], output }) =>
        offRoute(when, answered) || !parents.some(stops) || output === 'unreachable',
    },
    skippedOnlyByARoute: {
      description: 'A node is skipped only by a route not taken: its own, or every parent skipped',
      condition: ({ input: [when, answered, parents], output }) =>
        output !== 'skipped' || offRoute(when, answered) || (parents.length > 0 && parents.every(skipped)),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type NodeFate = Implementation<typeof nodeFateSpec>;
