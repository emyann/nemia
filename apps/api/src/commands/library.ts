/**
 * The words of the routes that write a person's agents: an agent's custom instructions written or cleared, and an agent file copied
 * into the library.
 */
import { agentNameRefusal } from 'agent-orchestrator/workflow';
import { valueAt } from '../body.ts';
import type { Named, RouteWords } from './words.ts';

const CUSTOM_PUT_SHAPE = '`{ "words": "<what the agent is told after its instructions>" }`';

/** The route of the custom instructions `at` names, as a refusal says it: `PUT /api/custom-instructions/<name>`. */
const customRoute = ({ method, name }: Named): string => `${method} /api/custom-instructions/${name}`;

/**
 * A write or a clear of an agent's custom instructions: a name that would leave the folder is refused in
 * the package's words, and the words that are not a string in the api's.
 */
export const AGENTS_CUSTOM: RouteWords = {
  shape: CUSTOM_PUT_SHAPE,
  issue: (at) => (_issue, body) =>
    `${customRoute(at)}: \`words\` are what the agent is told after its instructions, a string: ${CUSTOM_PUT_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['words']))}.`,
  named: (at) => {
    const wrong = agentNameRefusal(at.name);
    return wrong === undefined ? null : `${customRoute(at)}: ${wrong}`;
  },
  notJson: (at) => `${customRoute(at)} takes a JSON body: ${CUSTOM_PUT_SHAPE}.`,
};

const COPY_SHAPE = '`{ "file": "<an agent\'s file>", "as"?: "<its name in your library>", "keep"?: ["<skill or schema>", ...] }`';

/**
 * An agent file copied into your library: and its body in the api's words: every key it does not take,
 * named at once, else the first key its schema refused — `file`, `as` and `keep`, each as `nemia agents copy` takes it.
 */
export const AGENTS_COPY: RouteWords = {
  shape: COPY_SHAPE,
  issue:
    () =>
    ({ path: [key], kind, input }, body) => {
      if (kind === 'excess' && typeof body === 'object' && body !== null) {
        const unknown = Object.keys(body).filter((k) => !['file', 'as', 'keep'].includes(k));
        return `POST /api/agents/yours/copy does not take ${unknown.map((k) => `\`${k}\``).join(', ')}: it takes ${COPY_SHAPE}.`;
      }
      const was = `This request's was ${JSON.stringify(input) ?? 'left out'}: ${COPY_SHAPE}.`;
      if (key === 'file') return `\`file\` is the agent's file to copy, as \`nemia agents copy <file>\` takes it: a path. ${was}`;
      if (key === 'as')
        return `\`as\` is the agent's name in your library, as \`nemia agents copy <file> --as <name>\` takes it: a name, or left out. ${was}`;
      if (key === 'keep')
        return `\`keep\` lists the skills and the schema whose library's version stays, as \`--keep <part>\` given many times: a list of names, or left out. ${was}`;
      return `POST /api/agents/yours/copy takes a JSON object: ${COPY_SHAPE}.`;
    },
  strict: true,
};
