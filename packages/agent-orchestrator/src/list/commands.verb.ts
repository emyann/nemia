/** `nemia ls`, an entry of the command table: every run, or the one named, and its steps (`runsListed`). */
import { Effect, Schema } from 'effect';
import { LS_WORDS } from 'objects';
import { runsListed } from './list.verb.ts';
import type { RunsListed } from './list.ts';
import { selectorsIn, type Served } from '../command/entry.verb.ts';

/** What `nemia ls`'s handler takes: a run's id or none, its selectors, and the labels shown. */
const LsInput = Schema.Struct({
  runId: Schema.optionalKey(Schema.String),
  selector: Schema.optionalKey(Schema.Array(Schema.String)),
  showLabels: Schema.optionalKey(Schema.Boolean),
  labelColumns: Schema.optionalKey(Schema.Array(Schema.String)),
});

/**
 * `nemia ls`, whose words the client holds (`objects`' `LS_WORDS`): every run, or the one named, and its steps, as the package reads each
 * (`runsListed`), of the runs its selectors take, refused (`Invalid`) where one is no selector. The client prints the runs' `Table`
 * (`GET /api/runs`), which the MCP port prints too, and one run named off its object (`GET /api/runs/:name`): the api serves no route of
 * this handler's answer.
 */
export const LS: Served<RunsListed, typeof LsInput.Type> = {
  ...LS_WORDS,
  input: LsInput,
  handler: (args) => Effect.flatMap(selectorsIn(args), (s) => runsListed(args.runId, s)),
};
