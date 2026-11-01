/**
 * The fields at a door that still say a state or a kind as a string (`closed-state.test.ts`), each with the card that closes it, the
 * list only shrinking.
 *
 * `OPEN_STATE`: each field named `phase`, `status`, `state`, `kind`, `type` or `reason` that a door's exported types reach — an entry of
 * agent-runtime's or agent-orchestrator's `exports`, or a type the api exports from its `src` — whose type, null and undefined taken
 * off, is `string` or a union with a `string` member (`closed-state.ts` finds them), keyed `<file>#<Owner>.<path>.<prop>`: the file
 * that declares the named type it sits in, that type's name and the way down to the field (`[]` an element, `{}` an index signature's
 * value). A reader compares such a field to its words; typed `string`, it lets a sentence through where a word was meant.
 *
 * 17 fields the day the guard was written, and 15 once the same card closed a factory condition's `type` and `reason`. One site
 * is reached by every type that carries it and keyed once, by the named type that declares it: the api's `Relayed` under the
 * orchestrator's `StepMoment`.
 *
 * It only shrinks: a change that closes a field takes its entry off in the same commit, and a rename of the type or the field moves its
 * key with it. A new field at a door is typed as a closed union named in its context's glossary.json, never added here. Today's open
 * fields, printed as entries: `node tools/guards/test/closed-state.ts`.
 */
export const OPEN_STATE: Readonly<Record<string, { readonly card: string }>> = {
  'apps/api/src/capabilities/capabilities.ts#McpServer.type': { card: 'Close third-party kinds at the doors' },
  'apps/api/src/detail/tries.ts#StepAttempts.latest.reason': { card: "Close the orchestrator's state words at its doors" },
  'apps/api/src/factory/ceilings.ts#MetricRead.type': { card: 'Close third-party kinds at the doors' },
  'packages/agent-orchestrator/src/series/series.ts#RollupLine.l.kind': { card: "Close the orchestrator's state words at its doors" },
  'packages/agent-orchestrator/src/series/series.ts#RollupLine.l.phase': { card: "Close the orchestrator's state words at its doors" },
  'packages/agent-runtime/src/harness/seam.ts#TranscriptEvent.origin.kind': { card: 'Close third-party kinds at the doors' },
};
