/**
 * Whether a template's layout gives a file a place (agent-orchestrator, src/template/layout.ts, `inLayout`): `file` its path from the
 * template's root, `named` the files a `{ path }` of a document names. Beside the root files, `workflows/`, `agents/` and `skills/`, a
 * template holds one folder of carried files its workflows share, `carried/`, any file at any depth in it: the render copies it byte for
 * byte into the factory's tree and a run freezes it beside its workflow's folder. A file a `{ path }` names is in the layout wherever it
 * is; a file at the root that is no root file, and a file under a holder the layout does not know, is not.
 */
import { type Implementation, spec } from '@emyann/tsverify';

const ROOT_FILES = ['nemia.yaml', 'NEMIA.md', 'RULES.md', 'nemia.lock.yaml'];
/**
 * Each holder the layout knows, by the prefix a path under it opens with: a path's holder is the part before its first `/`, and no
 * holder's name holds one.
 */
const HOLDERS = ['workflows/', 'agents/', 'skills/', 'carried/'];

/** Whether `file` has no part `..`, said without splitting it, which the verifier does not model. */
const noParentPart = (file: string): boolean => file !== '..' && !file.startsWith('../') && !file.endsWith('/..') && !file.includes('/../');

/**
 * The laws say what the layout holds as a whole; which files a known holder's folder takes (a workflow's notes, an agent's three files,
 * anything of a skill) is the code's, `open`, and `src/template/check.test.ts` holds each folder's rows.
 */
const inLayoutSpec = spec<(file: string, named: ReadonlySet<string>) => boolean>({
  open: ['output'],
  requires: ({ input: [file] }) => file.length > 0 && !file.startsWith('/') && noParentPart(file),
  ensures: {
    namedIsIn: {
      description: 'A file a {path:} of a document names is in the layout',
      condition: ({ input: [file, named], output }) => !named.has(file) || output,
    },
    rootFilesAreIn: {
      description: "The template's root files are in the layout",
      condition: ({ input: [file], output }) => !ROOT_FILES.includes(file) || output,
    },
    carriedIsIn: {
      description: 'Every file under carried/, at any depth, is in the layout',
      condition: ({ input: [file], output }) =>
        !(file.startsWith('carried/') && file.length > 'carried/'.length && !file.endsWith('/')) || output,
    },
    strayRootIsOut: {
      description: 'A file at the root that is no root file is out unless named',
      condition: ({ input: [file, named], output }) => file.includes('/') || ROOT_FILES.includes(file) || named.has(file) || !output,
    },
    strayHolderIsOut: {
      description: 'A file under a holder the layout does not know is out unless named',
      condition: ({ input: [file, named], output }) =>
        !file.includes('/') || HOLDERS.some((holder) => file.startsWith(holder)) || named.has(file) || !output,
    },
  },
});

/** `inLayout`'s type, which `src/template/layout.ts` takes. */
export type InLayout = Implementation<typeof inLayoutSpec>;
