/**
 * Where the tick acts on proposals: a reference the tick's pass yields once its runs are judged (`ProposalsAct`), given the runs it listed
 * and each judged run's status. Its default acts on none; the daemon's loop (`up`) gives it `proposalsActed` (`pass.verb.ts`). A
 * reference rather than an import, since the pass reads the served objects (`factory/object/`), whose verbs reach the tick through the
 * command table.
 */
import { Context, Effect } from 'effect';
import type { Refusal } from '../refusal/refusal.ts';
import type { EngineService } from '../runtime-client.ts';
import type { PlaceService } from '../place/place.store.ts';
import type { StoreRoot } from '../config/root.store.ts';
import type { Run } from '../record/record.ts';
import type { RunState } from './apply.ts';

/** What the tick hands the proposals pass: where a queued card starts, the runs it listed, and each judged run's status. */
export type ProposalsActed = (
  repo: string | undefined,
  runs: readonly Pick<Run, 'id'>[],
  judged: ReadonlyMap<string, { readonly status: RunState }>,
) => Effect.Effect<void, Refusal, EngineService | PlaceService | StoreRoot>;

/** The proposals pass the tick runs: none by default. */
export const ProposalsAct = Context.Reference<ProposalsActed>('agent-orchestrator/ProposalsAct', {
  defaultValue: () => () => Effect.void,
});
