/**
 * A workflow is a folder of markdown files. That is the whole format.
 *
 * Each file is one step: frontmatter says which harness runs it and what must finish first, and
 * the body is what the agent is told — in prose, because prose is what the person writing it
 * already knows how to write.
 *
 *     ---
 *     harness: codex
 *     after: implement
 *     ---
 *     Review the changes on this branch. Be specific about correctness, not style.
 *
 * All but one: a `README.md` beside the steps says what the workflow is for, and is not a step.
 *
 * **No key is control flow.** No conditions, no expressions, and no loop a keyword decides. That is
 * deliberate. The interesting decisions in this kind of work — is this good enough, did it actually do
 * what was asked — are not predicates a workflow language could evaluate. They are judgements, and a
 * judgement belongs to a step with an agent in it, not to a keyword. The workflow is a team, not a
 * program: `after` orders, `resume` continues, `check` measures, `retries` counts, `output` declares
 * what a step's closeout says for the steps after it and `input` reads it, `loop` is the edge back and
 * `rounds` counts it, `gate` waits for a person, and the rest say who does the work, for how long and for how much.
 *
 * `loop` is the one edge that points backwards, and it is still not a condition: whether the work goes
 * round again is the looping step's agent's word — `again`, in its closeout, the way `blocked` is — and
 * the run only files the round and counts, the way `retries` is a count.
 *
 * **The keys are a closed list.** A key the parser does not know is refused by name, and a value
 * it cannot use is refused with the fix, before anything is spent. Accepted and ignored,
 * `afer: implement` would read as no `after` at all and start the reviewer at once, beside the
 * implementer, with write access; `deadlineSeconds: 5m` would read as NaN and stop the step on its
 * first tick. A `check:` the parser drops is a constraint nobody enforces.
 *
 * **This entry is the format as data, and reads nothing.** It parses and checks text, and writes a step or an agent back to text;
 * `folder.store.ts` is what reads a folder from disk and hands it here (`loadWorkflows`, `workflowFolder`, …), and `agents/read.store.ts`
 * and `skills/read.store.ts` the agents and skills beside it (`loadAgents`, `skillsFor`, …). So
 * `agent-orchestrator/workflow`, this file, is the format alone, re-exported by name from where it lives, and the readers are exported
 * from the package's root (`docs/architecture.md`).
 */
export {
  AGENTS_FOLDER,
  CLOSEOUT_FIELDS,
  DEFAULT_ROUNDS,
  isReadme,
  LOOP_REPLIES,
  outputFields,
  SKILLS_FOLDER,
  splitFrontmatter,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  stepPlace,
  WorkflowError,
} from './step/step.ts';
export type { OutputSchema, StepAgent, StepKey, StepOutput, Workflow } from './step/step.ts';
export {
  HARNESSES,
  isRemoteHarness,
  REMOTE_NAME,
  REMOTE_PREFIX,
  REMOTE_REFUSED_KEYS,
  remoteNameOf,
  remoteRetryRefusal,
} from './harness/harness.ts';
export {
  allowRuleOf,
  contextText,
  DENIALS,
  disallowedBy,
  dollarsOf,
  PLACES,
  sessionContext,
  SKILL_NAME,
  SLOTS,
  tokensOf,
  WORKSPACES,
} from './keys/index.ts';
export type { DeniedAt } from './keys/index.ts';
export {
  asNamed,
  codexModeLine,
  codexModeWritten,
  FORMER_KEYS,
  formerKeyLine,
  formerKeysIn,
  formerSandbox,
  frontmatterKey,
  harnessPromptLine,
  harnessPromptNamed,
  modeOf,
} from './former/former.ts';
export type { FrozenStep } from './former/former.ts';
export {
  autoDropped,
  directoryFence,
  fansOut,
  isFolderTeam,
  loopSpan,
  orderSteps,
  parseWorkflow,
  POLICY_KEYS,
  renderStep,
  skillAt,
  terminalSteps,
  upstreamOf,
  validate,
} from './workflow/index.ts';
export type { StepDraft } from './workflow/index.ts';
export {
  agentsDir,
  agentsFolderRefusal,
  asFileSays,
  linkRefusal,
  parseFolder,
  readmeDescription,
  stepFiles,
  stepNameRefusal,
} from './folder/folder.ts';
export {
  AGENT_KEYS,
  AGENT_OWN_KEYS,
  agentCard,
  agentDraftOf,
  agentNameRefusal,
  cardRetired,
  CLAUDE_CODE_IGNORED,
  HARNESS_PROMPTS,
  isCardFile,
  ownSkill,
  parseAgent,
  renderAgent,
  skillNameRefusal,
  skillTurnCost,
  tokensAbout,
} from './agents/agents.ts';
export type {
  Agent,
  AgentCardShape,
  AgentDraft,
  AgentKey,
  AgentOwnKey,
  Agents,
  HarnessPrompt,
  RoleKey,
  SkillCost,
  SkillsFound,
} from './agents/agents.ts';
export { renderSkill, skillDraftOf, skillEntryOf, withPreload } from './skills/skills.ts';
export type { AgentSkill, SkillDraft } from './skills/skills.ts';
