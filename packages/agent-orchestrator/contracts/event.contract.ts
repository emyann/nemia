/**
 * A feed line served as an `Event` (agent-orchestrator, src/event-object/event.ts; no code yet): the namespace it is served in, and the reason it
 * is served under.
 *
 * Its namespace (`eventNamespace`): the factory its line names (`labels.factory`, `default` on a run's line in the default
 * factory); a run's or a step's line that names none, written before lines carried labels, is in `default`, since every run is in a
 * namespace; a daemon's line and the store's that name no factory are in none, cluster-scoped (decision 17). An empty label names no
 * factory.
 *
 * Its reason (`eventReason`): the line's own, where it is a code of this `nemia`'s feed (`known`, `REASON_CODES`), else `Unknown`, so the
 * `Event`'s `reason` stays one of the closed words its Schema reads (`EVENT_REASONS`) whatever a newer writer stamped.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a line is about, as the feed's `involved.kind` says it. Declared here until `src/event-object/event.ts` holds it. */
export type EventInvolvedKind = 'Run' | 'Step' | 'Daemon' | 'Store';

/** Whether a line of this kind is a run's: the run's own, or one of its steps'. */
const ofARun = (kind: EventInvolvedKind): boolean => kind === 'Run' || kind === 'Step';

/** Whether the line names a factory: a label given, and not empty. */
const namesAFactory = (factory: string | undefined): factory is string => factory !== undefined && factory.length > 0;

const eventNamespaceSpec = spec<(kind: EventInvolvedKind, factory: string | undefined) => string | undefined>({
  ensures: {
    inTheFactoryItNames: {
      description: "An event whose line names a factory is in that factory's namespace",
      condition: ({ input: [, factory], output }) => !namesAFactory(factory) || output === factory,
    },
    aRunsEventIsInDefaultWhenItNamesNone: {
      description: "A run's or a step's event whose line names no factory is in default",
      condition: ({ input: [kind, factory], output }) => !ofARun(kind) || namesAFactory(factory) || output === 'default',
    },
    daemonAndStoreAreClusterScopedWhenTheyNameNone: {
      description: "A daemon's or the store's event whose line names no factory is in no namespace",
      condition: ({ input: [kind, factory], output }) => ofARun(kind) || namesAFactory(factory) || output === undefined,
    },
  },
});

/** `eventNamespace`'s type, which `src/event-object/event.ts` takes. */
export type EventNamespace = Implementation<typeof eventNamespaceSpec>;

const eventReasonSpec = spec<(reason: string, known: readonly string[]) => string>({
  requires: ({ input: [, known] }) => known.includes('Unknown'),
  ensures: {
    itsOwnWhenKnown: {
      description: "An event is served under its line's reason where that reason is a code of the feed",
      condition: ({ input: [reason, known], output }) => !known.includes(reason) || output === reason,
    },
    unknownOtherwise: {
      description: 'An event whose line names a reason the feed has no code for is served as Unknown',
      condition: ({ input: [reason, known], output }) => known.includes(reason) || output === 'Unknown',
    },
    alwaysAKnownCode: {
      description: 'An event is always served under a code of the feed',
      condition: ({ input: [, known], output }) => known.includes(output),
    },
  },
});

/** `eventReason`'s type, which `src/event-object/event.ts` takes. */
export type EventReason = Implementation<typeof eventReasonSpec>;
