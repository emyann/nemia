/**
 * The words of the routes that write a person's agents: an agent's custom instructions written or cleared, an agent file copied into
 * the library, and an agent's rule for auto put in force and taken out (`nemia policy confirm`, `nemia policy rm`), the person's, from
 * the board. A confirm takes the rule's words as the person read them, and a drop no body but none or `{}`; a name that is no agent's
 * is refused before either.
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

/** The body a confirm takes: the rule's words, as the person read them. */
const CONFIRM_SHAPE = '`{ "words": "<the rule\'s words, as read>" }`';

/** Why the text `text` a rule's route `at` was sent is no body it reads, or null for none or `{}`. */
function noBody(at: Named, text: string): string | null {
  if (!text.trim()) return null;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && !Array.isArray(body) && Object.keys(body).length === 0) return null;
  } catch {
    return `${at.method} ${at.path} takes no body but \`{}\`, and this request's body is not JSON.`;
  }
  return `${at.method} ${at.path} takes no body but \`{}\`: the agent and the rule are in its path.`;
}

/** The refusal of a path naming no agent, 400. */
const agentNamed = (at: Named): string | null => {
  const wrong = agentNameRefusal(at.name);
  return wrong === undefined ? null : `${at.method} ${at.path}: ${wrong}`;
};

/** A rule for auto put in force: and its body: the rule's words, as the person read them. */
export const POLICY_CONFIRM: RouteWords = {
  shape: CONFIRM_SHAPE,
  issue: (at) => () => `${at.method} ${at.path} takes the rule's words as you read them, and no other key: ${CONFIRM_SHAPE}.`,
  named: agentNamed,
  strict: true,
};

/** A rule for auto taken out of force. */
export const POLICY_DROP: RouteWords = {
  shape: '`{}`',
  issue: (at) => () => `${at.method} ${at.path} takes no body but \`{}\`.`,
  named: agentNamed,
  bodyless: noBody,
};
