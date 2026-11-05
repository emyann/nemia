/**
 * A run's namespace (agent-orchestrator, src/object/run-list.ts, `runNamespace`): the factory its record names, `default`
 * for a run whose record names none. What the generic path reads to answer a run under `/api/namespaces/<namespace>/runs/<name>`: a run
 * is in exactly one namespace, and a read or a named action addressed under any other is `Missing`, as one no run has the name of. The
 * list of a namespace keeps the runs whose namespace it is; the list across namespaces keeps every run.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The namespace of a run whose record names no factory, as `objects`' `DEFAULT_NAMESPACE` says it. */
const DEFAULT = 'default';

const runNamespaceSpec = spec<(factory: string | undefined) => string>({
  requires: ({ input: [factory] }) => factory === undefined || factory !== '',
  ensures: {
    noFactoryIsDefault: {
      description: 'A run whose record names no factory is in the namespace default',
      condition: ({ input: [factory], output }) => factory !== undefined || output === DEFAULT,
    },
    aFactoryIsItsNamespace: {
      description: 'A run whose record names a factory is in the namespace of that name, and no other',
      condition: ({ input: [factory], output }) => factory === undefined || output === factory,
    },
    neverEmpty: {
      description: 'Every run is in some namespace: the namespace is never the empty word',
      condition: ({ output }) => output !== '',
    },
  },
});

/** `runNamespace`'s type, which `src/object/run-list.ts` takes. */
export type RunNamespace = Implementation<typeof runNamespaceSpec>;
