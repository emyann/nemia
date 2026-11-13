/**
 * Where the tick acts on proposals: a service the tick's pass yields once its runs are judged (`ProposalsAct`), given the runs it listed
 * and each judged run's status. It has no default: a program that runs the pass is given it where it is composed — `nemia tick`
 * (`cli/main.ts`) and the daemon's loop (`up`), each by `withProposalsPass` (`pass.verb.ts`) — so a tick that acts on no proposal does not
 * compile. A service rather than an import, so the pass names what it needs and its composition says what it is given.
 */
import { Context, type Effect } from 'effect';
import type { Refusal } from '../refusal/refusal.ts';
import type { EngineService } from '../runtime-client.ts';
import type { PlaceService } from '../place/place.store.ts';
import type { StoreRoot } from '../config/root.store.ts';
import type { StoreConfig } from '../config/config.store.ts';
import type { Run } from '../record/record.ts';
import type { RunState } from './apply.ts';

/** What the tick hands the proposals pass: the runs it listed, and each judged run's status. */
export type ProposalsActed = (
  runs: readonly Pick<Run, 'id'>[],
  judged: ReadonlyMap<string, { readonly status: RunState }>,
) => Effect.Effect<void, Refusal, EngineService | PlaceService | StoreRoot | StoreConfig>;

/** The proposals pass the tick runs, given where the program that runs the pass is composed. */
export class ProposalsAct extends Context.Service<ProposalsAct, ProposalsActed>()('agent-orchestrator/ProposalsAct') {}
