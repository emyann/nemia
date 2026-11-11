/**
 * An agent read as the spec an Agent object carries (`AgentSpec` of objects): its role, description, keys, the skills and MCP servers it
 * names each joined as its line writes them, its harness prompt, its instructions, and the result schema its `output:` names (`output`,
 * its file and text) where one is given. One reading for the agent on disk (`agentNow`, `current.verb.ts`) and for an agent composed from
 * an upgrade's merge. Pure.
 */
import type { Agent } from '../agents/agents.ts';

/** An agent's spec as a proposal carries it. */
export type AgentSpecRead = {
  role?: string;
  description?: string;
  keys: Agent['keys'];
  skills?: string;
  harnessPrompt?: string;
  mcp?: string;
  output?: { file: string; text: string };
  instructions: string;
};

/** The spec `agent` says, as it parses (`parseAgent`), with the result schema `schema` its `output:` names, where one is given. */
export function agentSpecOf(agent: Agent, schema?: { readonly file: string; readonly text: string } | null): AgentSpecRead {
  return {
    ...(agent.role !== undefined && { role: agent.role }),
    ...(agent.description !== undefined && { description: agent.description }),
    keys: agent.keys,
    ...(agent.skills !== undefined && { skills: agent.skills.join(', ') }),
    ...(agent.harnessPrompt !== undefined && { harnessPrompt: agent.harnessPrompt }),
    ...(agent.mcp !== undefined && { mcp: agent.mcp.join(', ') }),
    ...(schema != null && { output: { file: schema.file, text: schema.text } }),
    instructions: agent.body,
  };
}
