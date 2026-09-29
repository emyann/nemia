/**
 * An agent's listing before and without the package's read: the one with nothing in it, which each listing starts from, and the one of a
 * file that does not read as an agent, its lines as written so the form can show what to fix.
 */
import {
  AGENT_KEYS,
  AGENT_OWN_KEYS,
  AGENTS_FOLDER,
  FORMER_KEYS,
  formerSandbox,
  frontmatterKey,
  isCardFile,
  splitFrontmatter,
  type RoleKey,
} from 'agent-orchestrator/workflow';
import type { AgentSchema } from 'agent-orchestrator';
import type { AgentListing, AgentUser } from './agents.ts';
import type { WorkflowSource } from '../workflows/workflows.ts';

/**
 * The keys a step has too. The agent's own (`AGENT_OWN_KEYS`: its role, description, skills and system prompt) are no step's, so the form
 * shows them apart (`RoleKey`).
 */
const ROLE_KEYS = AGENT_KEYS.filter((key): key is RoleKey => !(AGENT_OWN_KEYS as readonly string[]).includes(key));

/**
 * A `skills:` line as written, for a file that does not read — none where it names a card file, a former line the package refuses: the
 * form's save then writes the agent without it, which is the fix its refusal names.
 */
function skillsLineOf(source: string): string | null {
  const line = frontmatterKey(source, 'skills');
  return line === undefined || isCardFile(line) ? null : line;
}

/** The listing of the agent `name` at `file`, with nothing read into it: its place, its version and the nodes that name it. */
export const empty = (
  from: WorkflowSource,
  dir: string,
  file: string,
  name: string,
  version: string,
  usedBy: AgentUser[],
): AgentListing => ({
  name,
  from,
  dir,
  file,
  role: null,
  description: null,
  keys: {},
  body: '',
  schema: null,
  card: null,
  cardError: null,
  skills: null,
  given: [],
  systemPrompt: null,
  source: '',
  version,
  usedBy,
  error: null,
  untried: null,
});

/**
 * The listing of a file that does not read as an agent (`agent`, the package's refusal, or nothing where the load found none): `base` with
 * the lines `source` writes, a former key read as the key it became, its instructions as written, and the schema its `output:` names
 * (`sidecarOf`) — so the form shows what to fix, and the refusal says why.
 */
export function unreadListing(
  base: AgentListing,
  source: string,
  agent: Error | undefined,
  sidecarOf: (named: string | undefined) => AgentSchema | null,
): AgentListing {
  const formerOf = (key: RoleKey) => Object.keys(FORMER_KEYS).filter((former) => FORMER_KEYS[former] === key);
  const keys = Object.fromEntries(
    ROLE_KEYS.flatMap((key) => {
      const value = [key, ...formerOf(key)].map((named) => frontmatterKey(source, named)).find((v) => v !== undefined);
      return value === undefined ? [] : [[key, value]];
    }),
  ) as Partial<Record<RoleKey, string>>;
  const former =
    keys.harness === 'codex' && keys.sandbox === undefined && keys.permissionMode !== undefined
      ? formerSandbox(keys.permissionMode)
      : undefined;
  if (former !== undefined) {
    delete keys.permissionMode;
    keys.sandbox = former;
  }
  let body = '';
  try {
    body = splitFrontmatter(base.file, source).body;
  } catch {
    body = source;
  }
  return {
    ...base,
    role: frontmatterKey(source, 'role') ?? null,
    description: frontmatterKey(source, 'description') ?? null,
    keys,
    body,
    schema: sidecarOf(keys.output),
    skills: skillsLineOf(source),
    systemPrompt: frontmatterKey(source, 'systemPrompt') ?? null,
    source,
    error: agent ? agent.message : `${AGENTS_FOLDER}/${base.name}.md does not read.`,
  };
}
