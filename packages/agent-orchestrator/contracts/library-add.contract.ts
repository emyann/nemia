/**
 * What a factory has added from the store's library, and what each add is (agent-orchestrator, src/library/library.ts): three pure
 * deciders over what the verbs and the pass read afresh, carrying nothing between passes.
 *
 * `libraryAddsOf`: a factory's adds are its record's (`factories/<name>/library.json`) where it has one, and else those its workflows
 * resolve from the library today (`derived`, read on every call and never written by a read), so a factory filed before the library had
 * adds keeps every item it runs with, and no store is migrated by a write. The first add or removal writes the record whole from what this
 * answers, and from then on the record alone says.
 *
 * `libraryAddState`: an add is `resolved` where the library holds its name and nothing of the factory's comes first, `shadowed` where the
 * factory's own tree or its repository holds the name too (and wins it, as the lookup reads `factory · repo · user · builtin`), and
 * `missing` where the library no longer holds it — a builtin an upgrade dropped, or the person's removed by hand — which the factory's
 * page and the feed say, with the fix.
 *
 * `libraryAddRefusal`: an add of a name the library does not hold is Missing; an add again of one added goes on (the write is whole and
 * idempotent); a removal of one not added is Missing, and of one added goes on, missing or not, so a dropped builtin can always be taken
 * out. Its kind is the api's answer; its words are nobody's law.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { DefinitionOrigin, LibraryAddStateWord, LibraryKind as ObjectsLibraryKind } from 'objects';

/**
 * The kinds a factory adds from the library by name. A workflow is added by `nemia factory attach`, the factory's `workflows`, as today,
 * and is no add of this record.
 */
export type LibraryKind = ObjectsLibraryKind;

/** One add: the kind and the name of a library item. */
export type LibraryRef = { readonly kind: LibraryKind; readonly name: string };

/** Where a definition is read from: `objects`' `DEFINITION_ORIGINS`. */
export type Origin = DefinitionOrigin;

/** What an add is in its factory: resolved, shadowed by the factory's own, or missing from the library (`LIBRARY_ADD_STATES`). */
export type LibraryAddState = LibraryAddStateWord;

/** What an add or a removal of an add does. */
export type LibraryAddWrite = 'add' | 'remove';

/** A refusal of an add or a removal: its kind, and its words. */
export type LibraryAddRefused = { readonly kind: 'Missing'; readonly message: string };

/** Whether `a` and `b` are the same adds, in the same order. */
const sameRefs = (a: readonly LibraryRef[], b: readonly LibraryRef[]) =>
  a.length === b.length && a.every((ref, i) => ref.kind === b.at(i)?.kind && ref.name === b.at(i)?.name);

/** Whether `held` holds an origin of the library: the person's, or a builtin. */
const inLibrary = (held: readonly Origin[]) => held.includes('user') || held.includes('builtin');

/** Whether `held` holds an origin of the factory's own: its tree, or its repository. */
const ownFirst = (held: readonly Origin[]) => held.includes('factory') || held.includes('repo');

const libraryAddsOfSpec = spec<(recorded: readonly LibraryRef[] | undefined, derived: readonly LibraryRef[]) => readonly LibraryRef[]>({
  ensures: {
    theRecordSays: {
      description: 'A factory with a record of its adds has exactly those',
      condition: ({ input: [recorded], output }) => recorded === undefined || sameRefs(output, recorded),
    },
    unrecordedKeepsWhatItRuns: {
      description: 'A factory with no record has every library item its workflows resolve today',
      condition: ({ input: [recorded, derived], output }) => recorded !== undefined || sameRefs(output, derived),
    },
  },
});

const libraryAddStateSpec = spec<(held: readonly Origin[]) => LibraryAddState>({
  ensures: {
    missingExactlyWhenTheLibraryHoldsNone: {
      description: 'An add is missing exactly when the library holds its name no longer',
      condition: ({ input: [held], output }) => (output === 'missing') === !inLibrary(held),
    },
    shadowedByTheFactorysOwn: {
      description: "An add the library holds is shadowed exactly when the factory's tree or its repository holds the name too",
      condition: ({ input: [held], output }) => !inLibrary(held) || (output === 'shadowed') === ownFirst(held),
    },
    resolvedOtherwise: {
      description: "An add the library holds, and nothing of the factory's holds, is resolved",
      condition: ({ input: [held], output }) => !(inLibrary(held) && !ownFirst(held)) || output === 'resolved',
    },
  },
});

const libraryAddRefusalSpec = spec<(does: LibraryAddWrite, held: boolean, added: boolean) => LibraryAddRefused | null>({
  ensures: {
    addOfNothingIsMissing: {
      description: 'An add of a name the library does not hold is Missing',
      condition: ({ input: [does, held], output }) => !(does === 'add' && !held) || output?.kind === 'Missing',
    },
    addOfALibraryItemGoes: {
      description: 'An add of a name the library holds goes on, added already or not',
      condition: ({ input: [does, held], output }) => !(does === 'add' && held) || output === null,
    },
    removalOfWhatIsNotAddedIsMissing: {
      description: 'A removal of an item the factory has not added is Missing',
      condition: ({ input: [does, , added], output }) => !(does === 'remove' && !added) || output?.kind === 'Missing',
    },
    removalOfAnAddGoes: {
      description: 'A removal of an item the factory added goes on, whether the library still holds it or not',
      condition: ({ input: [does, , added], output }) => !(does === 'remove' && added) || output === null,
    },
  },
});

/** `libraryAddsOf`'s type, which `src/library/library.ts` takes. */
export type LibraryAddsOf = Implementation<typeof libraryAddsOfSpec>;

/** `libraryAddState`'s type, which `src/library/library.ts` takes. */
export type LibraryAddStateOf = Implementation<typeof libraryAddStateSpec>;

/** `libraryAddRefusal`'s type, which `src/library/library.ts` takes. */
export type LibraryAddRefusal = Implementation<typeof libraryAddRefusalSpec>;
