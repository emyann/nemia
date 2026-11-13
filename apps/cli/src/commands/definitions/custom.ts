/**
 * `nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]`: a person's custom instructions for one agent — read bare, written
 * from the words `--file` holds (read here, sent as words), removed with `--clear` — asked of the Agent group's `…/instructions` in
 * `default` on the repository `--repo` names, or, for `nemia`, the store's own agent, of hers at `/api/nemia/instructions`; and the lines
 * each prints. A file there that does not read is the api's answer in `error`, refused here, exit 2, in its words.
 */
import { AGENTS_CUSTOM_WORDS, DEFAULT_NAMESPACE, type AgentInstructions, type AgentInstructionsCleared, type Args } from 'objects';
import { Refused } from '../../refused.ts';
import { asked } from '../../objects.ts';
import { said, switchArg, textArg } from '../requests.ts';
import { onRepo, wordsRead } from './sent.ts';

const COMMAND = AGENTS_CUSTOM_WORDS.name;

/** The store's own agent, whose custom instructions the api serves at `/api/nemia/instructions`. */
const STORE_AGENT = 'nemia';

/** What a write or a clear says of a run already started. */
const KEPT = 'a run already started keeps the words it was started with';

/** What a write or a clear says of the store's own agent's open session, which no run freezes. */
const TOLD = "her open session is told at the keeper's next beat";

/** What a clear prints. */
const clearedLines = ({ name, file, removed }: AgentInstructionsCleared): string[] => [
  removed
    ? `${name}: custom instructions removed, ${file} — ${name === STORE_AGENT ? TOLD : KEPT}`
    : `${name} has no custom instructions to remove`,
];

/** What a write prints. */
const writtenLines = ({ name, file }: AgentInstructions): string[] => [
  name === STORE_AGENT
    ? `${name}: custom instructions written to ${file}, told after her instructions in every session she is filed with — ${TOLD}`
    : `${name}: custom instructions written to ${file}, told after its instructions in every run started from now — ${KEPT}`,
];

/** What a read prints: the file and the words; that there are none, and how to set them; or, for a file that does not read, refused. */
function readLines({ name, file, words, error }: AgentInstructions): string[] {
  if (error !== null) throw new Refused(error);
  if (words === null)
    return [`${name} has no custom instructions. Set them with nemia agents custom ${name} --file <path>, or --file - for stdin.`];
  return [file, '', words];
}

/** `nemia agents custom`'s runner: a clear, a write of the words `--file` holds, or a read. */
export async function agentsCustom(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const file = textArg(args, 'file');
  const hers = name === STORE_AGENT;
  const params = { namespace: DEFAULT_NAMESPACE, name };
  if (switchArg(args, 'clear')) {
    said(
      clearedLines(
        await asked(COMMAND, (c) =>
          hers ? c.nemia.clearInstructions() : onRepo(args, (query) => c.agents.deleteInstructions({ params, query })),
        ),
      ),
    );
    return 0;
  }
  if (file !== undefined) {
    const payload = { words: wordsRead(file, COMMAND) };
    said(
      writtenLines(
        await asked(COMMAND, (c) =>
          hers ? c.nemia.writeInstructions({ payload }) : onRepo(args, (query) => c.agents.putInstructions({ params, query, payload })),
        ),
      ),
    );
    return 0;
  }
  said(
    readLines(
      await asked(COMMAND, (c) => (hers ? c.nemia.instructions() : onRepo(args, (query) => c.agents.instructions({ params, query })))),
    ),
  );
  return 0;
}
