/**
 * The words of the routes that put an agent's rule for auto in force and take one out (`nemia auto confirm`, `nemia auto drop`): the
 * person's, from the board; each takes no body but none or `{}`, and a name that is no agent's is refused before it.
 */
import { agentNameRefusal } from 'agent-orchestrator/workflow';
import type { Guarded } from '../guard.ts';
import type { Named, RouteWords } from './words.ts';

/** A rule for auto confirmed or dropped, the guard's words of the route `at`. */
const ruleGuard = (at: Named, off: boolean): Guarded => ({
  route: `${at.method} ${at.path}`,
  does: off ? "takes an agent's rule for auto out of force" : "puts an agent's rule for auto in force",
  forAnother: off ? 'drop one' : 'confirm one',
  why: off
    ? 'what the rule allowed is asked of you again'
    : 'at auto, the agent gives the answer the rule names unasked wherever the run meets its conditions',
  reach: off ? "drop it on the agent's settings on the board" : "confirm it on the agent's settings on the board",
  instead: off ? `Drop it with \`nemia auto drop ${at.name} <id>\`` : `Confirm it with \`nemia auto confirm ${at.name} <id>\``,
  shape: '`{}`',
});

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

/** A rule for auto put in force, as the guard's refusals word it. */
export const AUTO_CONFIRM: RouteWords = {
  shape: '`{}`',
  guard: (at) => ruleGuard(at, false),
  issue: (at) => () => `${at.method} ${at.path} takes no body but \`{}\`.`,
  named: agentNamed,
  bodyless: noBody,
};

/** A rule for auto taken out of force, as the guard's refusals word it. */
export const AUTO_DROP: RouteWords = {
  shape: '`{}`',
  guard: (at) => ruleGuard(at, true),
  issue: (at) => () => `${at.method} ${at.path} takes no body but \`{}\`.`,
  named: agentNamed,
  bodyless: noBody,
};
