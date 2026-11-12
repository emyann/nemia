/**
 * The runners of the group's commands (`objects`' `DEFINITION_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. A command's runner joins here in the change that moves its words;
 * the table is total over the group's names, so one left out does not compile.
 */
import type { DefinitionCommand } from 'objects';
import type { Runner } from '../runner.ts';
import { agentsCard, agentsCopy, agentsListed, agentsSources } from './agents.ts';
import { agentsCustom } from './custom.ts';
import { agentsRm, agentsRun, workflowsRm } from './library.ts';
import { policy, policyConfirm, policyPropose, policyRm } from './policy.ts';
import { policyReach } from './reach.ts';

/** Each of the group's commands' runner. */
export const DEFINITION_RUNNERS: Readonly<Record<DefinitionCommand, Runner>> = {
  agents: agentsListed,
  'agents card': agentsCard,
  'agents sources': agentsSources,
  'agents custom': agentsCustom,
  'agents copy': agentsCopy,
  'agents rm': agentsRm,
  'agents run': agentsRun,
  policy,
  'policy propose': policyPropose,
  'policy confirm': policyConfirm,
  'policy rm': policyRm,
  'policy reach': policyReach,
  'workflows rm': workflowsRm,
};
