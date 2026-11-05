/**
 * Whether a write of a Workflow, an Agent or a Skill on the generic path goes on (agent-orchestrator, src/definition/served.ts,
 * `definitionWriteRefusal`): the namespace it is sent to, what it does, and the origin of the definition it addresses there (`none` where
 * nothing is at the name). Every definition of yours is served in `default`, and a write there is a write of every namespace that resolves
 * it, so writes are taken in `default` alone; the api writes your library alone, never a checkout nor what Nemia builds in. The kind of
 * the refusal is the api's answer (`REFUSAL_STATUS`); its words are nobody's law. A version's judgement stays
 * `definitionVersionRefusal`'s and `workflowVersionRefusal`'s, after this one lets a write through.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where the addressed definition is read from, or `none` where nothing is at its name. */
export type WriteThere = 'repo' | 'yours' | 'builtin' | 'none';

/** What a write does: makes a definition, replaces one, removes one, or runs one of its named actions (`try`, `copy`). */
export type DefinitionWrite = 'create' | 'replace' | 'remove' | 'act';

/** A refusal's kind, as the package's refusals are told apart. */
export type WriteRefused = { readonly kind: 'Invalid' | 'Missing'; readonly message: string };

const definitionWriteRefusalSpec = spec<(namespace: string, does: DefinitionWrite, there: WriteThere) => WriteRefused | null>({
  ensures: {
    defaultAlone: {
      description: 'A write sent to a namespace other than default is Invalid: a definition of yours is written once, in default',
      condition: ({ input: [namespace], output }) => namespace === 'default' || output?.kind === 'Invalid',
    },
    createInDefaultGoes: {
      description: 'A definition made in default goes on, to your library, whatever another origin holds at its name',
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && does === 'create') || output === null,
    },
    yoursGoes: {
      description: 'A replace, a removal or an action on a definition of yours in default goes on',
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && does !== 'create' && there === 'yours') || output === null,
    },
    noneIsMissing: {
      description: 'A replace, a removal or an action where nothing is at the name is Missing',
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && does !== 'create' && there === 'none') || output?.kind === 'Missing',
    },
    notYoursIsInvalid: {
      description: "A replace or a removal of the repository's or a builtin definition is Invalid: the api writes your library alone",
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && (does === 'replace' || does === 'remove') && (there === 'repo' || there === 'builtin')) ||
        output?.kind === 'Invalid',
    },
  },
});

/** `definitionWriteRefusal`'s type, which `src/definition/served.ts` takes. */
export type DefinitionWriteRefusal = Implementation<typeof definitionWriteRefusalSpec>;
