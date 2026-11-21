/** `nemia lines <runId>`'s runner (`runs.lines`): the lines kept beside a run, printed as YAML, or JSON with `--json`. */
import type { Args } from 'objects';
import { answered } from '../answer.ts';
import { textArg } from '../requests.ts';

/**
 * `nemia lines`' runner: the run's decide and refresh lines, each step's, the card it came from and its workflow's page address.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export const lines = (args: Args) => answered('lines', args, (c) => c.runs.lines({ params: { name: textArg(args, 'runId') ?? '' } }));
