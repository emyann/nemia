/**
 * The rest of the store's plain reads, each one endpoint asked and its answer printed: `nemia concluded <runId>` (`runs.concluded`), the
 * section a run started with `--from <runId>` would be handed; `nemia logs <runId> <step>` (`steps.log`), the step's session output, as
 * many of its last lines as the api answers; and `nemia memory [<fact>]` (`nemia.memory`, `nemia.fact`), the facts Nemia keeps or one
 * fact's words.
 */
import { type Args, CONCLUDED_WORDS, LOG_TAIL, LOGS_WORDS, MEMORY_WORDS, NemiaMemory } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';

/** The text under `key`, which the spec requires: refused by the parse before a runner where it is left out. */
const required = (args: Args, key: string): string => textArg(args, key) ?? '';

/** `nemia concluded <runId>`'s runner: the section it would be handed, its leading blank lines dropped. */
export async function concluded(args: Args): Promise<number> {
  const name = required(args, 'runId');
  const { section } = await asked(CONCLUDED_WORDS.name, (c) => c.runs.concluded({ params: { name } }));
  said([section.replace(/^\n+/, '')]);
  return 0;
}

/**
 * `nemia logs <runId> <step>`'s runner: the step's session output, its last `LOG_TAIL.most` lines, or that it has not run yet where it
 * has none; where the api left lines out, stderr says so.
 */
export async function logs(args: Args): Promise<number> {
  const runId = required(args, 'runId');
  const step = required(args, 'step');
  const log = await asked(LOGS_WORDS.name, (c) => c.steps.log({ params: { runId, step }, query: { tail: String(LOG_TAIL.most) } }));
  said(log.lines.length ? log.lines : [`${step} has not run yet`]);
  if (log.truncated)
    process.stderr.write(`nemia logs: its first lines are left out, past the last ${LOG_TAIL.most} the api answers of a step's output\n`);
  return 0;
}

/** What `nemia memory` prints: one fact's words, or the facts she keeps and where. */
export const memoryLines = (data: typeof NemiaMemory.Type): string[] => {
  if (data.fact !== null) return data.fact.text.replace(/\n$/, '').split('\n');
  if (!data.facts.length) return [`Nemia keeps no fact yet (${data.dir}).`];
  return [`Nemia keeps ${data.facts.length} fact${data.facts.length === 1 ? '' : 's'} in ${data.dir}:`, ...data.facts.map((f) => `  ${f}`)];
};

/** `nemia memory [<fact>]`'s runner: bare, the facts she keeps (`nemia.memory`); given one, its words (`nemia.fact`). */
export async function memory(args: Args): Promise<number> {
  const fact = textArg(args, 'fact');
  const data = await asked(MEMORY_WORDS.name, (c) => (fact === undefined ? c.nemia.memory() : c.nemia.fact({ params: { fact } })));
  said(memoryLines(data));
  return 0;
}
