/**
 * The models a harness lists for a session, by their canonical ids (src/harness/claude/models.ts, `listedOf`): read off the rows the
 * Agent SDK's `Query.supportedModels()` answers (`ModelInfo`, sdk.d.ts:1512). A row's `value` may be an alias (`opus`) whose
 * `resolvedModel` is "the canonical wire model id this row's `value` resolves to"; the canonical id of a row is its `resolvedModel`, else
 * its `value`. A model is listed once by that id, with the words that resolve to it kept as its aliases (so a refusal can say what `opus`
 * stands for), and with the facts of the first row that names it: its display name, whether it keeps auto mode, and its effort levels,
 * each undefined where the harness says nothing.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A row of the harness's list, as far as Nemia reads it: the SDK's `ModelInfo` fields of the same names. */
export type ModelRow = {
  readonly value: string;
  readonly resolvedModel?: string;
  readonly displayName: string;
  readonly supportsAutoMode?: boolean;
  readonly supportedEffortLevels?: readonly string[];
};

/** A model the harness lists: its canonical id, the other words that resolve to it, and what the harness says of it. */
export type ListedModel = {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly name: string;
  readonly keepsAuto: boolean | undefined;
  readonly efforts: readonly string[] | undefined;
};

/** The canonical id of `row`: what its `value` resolves to, else the value itself. */
const idOf = (row: ModelRow) => row.resolvedModel ?? row.value;

/** Whether `list` holds no name twice. */
const noneTwice = (list: readonly string[]) => list.every((name, i) => !list.slice(0, i).includes(name));

/** Whether `a` and `b` hold the same words in the same order, or are both absent. */
const sameList = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  a === undefined ? b === undefined : b !== undefined && a.length === b.length && a.every((w, i) => w === b.at(i));

const listedOfSpec = spec<(rows: readonly ModelRow[]) => readonly ListedModel[]>({
  requires: ({ input: [rows] }) => rows.every((r) => r.value !== '' && r.resolvedModel !== ''),
  ensures: {
    everyRowsIdIsListed: {
      description: 'Each row the harness answers is listed, by the id its value resolves to',
      condition: ({ input: [rows], output }) => rows.every((r) => output.some((m) => m.id === idOf(r))),
    },
    onlyACanonicalId: {
      description: 'An id is listed only where a row resolves to it: an alias row yields its resolved model, never its own word',
      condition: ({ input: [rows], output }) => output.every((m) => rows.some((r) => idOf(r) === m.id)),
    },
    eachIdOnce: {
      description: 'A model an alias row and its own row both name is listed once',
      condition: ({ output }) => noneTwice(output.map((m) => m.id)),
    },
    anAliasNamesItsModel: {
      description:
        'A word that resolves to another id is kept among that model’s aliases (with everyRowsIdIsListed: every such word is kept by the model listed for it)',
      condition: ({ input: [rows], output }) =>
        output.every((m) => rows.every((r) => idOf(r) !== m.id || r.value === m.id || m.aliases.includes(r.value))),
    },
    onlyAWordThatResolvesToIt: {
      description: 'An alias of a model is a row’s word that resolves to it, and never the id itself',
      condition: ({ input: [rows], output }) =>
        output.every((m) => m.aliases.every((a) => a !== m.id && rows.some((r) => r.value === a && idOf(r) === m.id))),
    },
    theFirstRowsFacts: {
      description: 'A model says what the first row naming it says: its display name, whether it keeps auto mode, its effort levels',
      condition: ({ input: [rows], output }) =>
        output.every((m) => {
          const first = rows.find((r) => idOf(r) === m.id);
          return (
            first !== undefined &&
            m.name === first.displayName &&
            m.keepsAuto === first.supportsAutoMode &&
            sameList(m.efforts, first.supportedEffortLevels)
          );
        }),
    },
  },
});

/** `listedOf`'s type, which src/harness/claude/models.ts takes. */
export type ListedOf = Implementation<typeof listedOfSpec>;

const uniqueIdsOfSpec = spec<(ids: readonly string[]) => readonly string[]>({
  ensures: {
    everyIdKept: {
      description: 'Each id given is kept',
      condition: ({ input: [ids], output }) => ids.every((id) => output.includes(id)),
    },
    onlyIdsGiven: {
      description: 'An id is kept only where it was given',
      condition: ({ input: [ids], output }) => output.every((id) => ids.includes(id)),
    },
    eachIdOnce: {
      description: 'No id is kept twice',
      condition: ({ output }) => noneTwice(output),
    },
  },
});

/** `uniqueIdsOf`'s type, which src/harness/claude/models.ts takes. */
export type UniqueIdsOf = Implementation<typeof uniqueIdsOfSpec>;
