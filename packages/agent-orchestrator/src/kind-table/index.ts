/** The face of `kind-table/`: the Table of each kind a page of which the api serves, and the columns a client prints, by name. */
export {
  AGENT_COLUMNS,
  FACTORY_COLUMNS,
  MCP_SERVER_COLUMNS,
  SKILL_COLUMNS,
  agentTable,
  factoryTable,
  mcpServerTable,
  proposalTable,
  skillTable,
} from './kind-table.ts';
export {
  delegationTable,
  eventTable,
  hireTable,
  libraryAddTable,
  scheduleTable,
  subscriptionTable,
  triggerTable,
  volumeTable,
} from './wiring-table.ts';
export { programTable, templateTable, workflowTable } from './definition-table.ts';
