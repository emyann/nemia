/**
 * The fields a step's closeout owes of what its `output:` declares (agent-orchestrator, src/pinned/pinned.ts): `filedFields`, read
 * by `owedFields` (src/status/status.ts) for every closeout the run judges. A step's try is judged by the definition it was filed
 * with, never by the one its run follows later: a run in a factory that follows revisions (`revisions: follow`) takes a new revision
 * of a step's agent at its next filing, and a try that ended before it gave its closeout to the schema it was handed then.
 *
 * What the try was filed with is read off its record (`StepRecord.declared`, written at each filing by `filedOn`), so a pass carries
 * nothing between passes. A record written before it kept only the digest of the schema it was filed with (`StepRecord.closeoutHash`):
 * where that digest is the one the step would be filed with now, the definition has not moved and its fields are owed; where it has
 * moved, the fields it was filed with are unknown, and the harness held the closeout to that schema, so a field the closeout lacks is
 * one the schema it was handed did not ask.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What a step's record says of the filing of its current try. `declared`: the fields its `output:` declared then, in the schema's
 * order (`StepRecord.declared`), absent on a record written before they were kept. `moved`: the closeout schema the try was filed with
 * (`StepRecord.closeoutHash`) is not the one the step would be filed with now (`closeoutHashOf`); false where no digest was kept,
 * which says nothing moved.
 */
export type FiledWith = { declared?: readonly string[]; moved: boolean };

/** The same fields in the same order: the order is the schema's, and `nemia decide` prints them in it. */
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

const filedFieldsSpec = spec<(filed: FiledWith, now: readonly string[], gave: readonly string[]) => string[]>({
  ensures: {
    aTryIsJudgedByItsFiling: {
      description:
        'A try whose record kept what it was filed with owes exactly those fields, whatever its step declares now: a revision followed after it was filed adds none and takes none away',
      condition: ({ input: [filed], output }) => filed.declared === undefined || sameList(output, filed.declared),
    },
    anUnmovedDefinitionOwesWhatItDeclares: {
      description:
        'A try whose record kept no fields, and whose schema has not moved since it was filed, owes what its step declares now: that is the definition it was filed with',
      condition: ({ input: [filed, now], output }) => filed.declared !== undefined || filed.moved || sameList(output, now),
    },
    /**
     * The full law, "owes exactly the fields its step declares now that its closeout gave, in the step's order", waits on tsverify
     * proving that a filter's result keeps every element that passes (src-a-filter-s-result-is-pro-p25m);
     * `src/status/status.test.ts` (`owedFields`, a moved schema) holds it until then. tsverify 0.9.0 still
     * leaves it `bounded`.
     */
    aMovedDefinitionOwesNoFieldItLacks: {
      description:
        'A try whose record kept no fields, and whose schema has moved since it was filed, owes only fields its step declares now and its closeout gave: a field it lacks is one the schema it was handed did not ask',
      condition: ({ input: [filed, now, gave], output }) =>
        filed.declared !== undefined || !filed.moved || output.every((f) => now.includes(f) && gave.includes(f)),
    },
  },
});

/** `filedFields`'s type, which the code takes: it then imports nothing of tsverify. */
export type FiledFields = Implementation<typeof filedFieldsSpec>;
