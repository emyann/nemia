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
 * `workflow-store.ts` is what reads a folder from disk and hands it here (`loadWorkflows`, `loadAgents`, `workflowFolder`, …). So
 * `agent-orchestrator/workflow`, this file, is the format alone, re-exported by name from where it lives, and the readers are exported
 * from the package's root (`docs/architecture.md`).
 */
export {
  AGENT_KEYS,
  AGENT_OWN_KEYS,
  agentCard,
  agentNameRefusal,
  AGENTS_FOLDER,
  agentsDir,
  agentsFolderRefusal,
  allowRuleOf,
  asNamed,
  AUTO_UNSUPPORTED,
  autoDropped,
  cardRetired,
  CLAUDE_CODE_IGNORED,
  CLOSEOUT_FIELDS,
  codexModeLine,
  codexModeWritten,
  CONTEXT_WINDOWS,
  contextText,
  DEFAULT_PERMISSION_MODE,
  DEFAULT_ROUNDS,
  DENIALS,
  disallowedBy,
  dollarsOf,
  EFFORTS,
  fansOut,
  FORMER_KEYS,
  formerKeyLine,
  formerKeysIn,
  formerSandbox,
  frontmatterKey,
  HARNESSES,
  isCardFile,
  isFolderTeam,
  isReadme,
  isRemoteHarness,
  keepsAuto,
  linkRefusal,
  LOOP_REPLIES,
  loopSpan,
  modeOf,
  orderSteps,
  outputFields,
  ownSkill,
  parseAgent,
  parseFolder,
  parseWorkflow,
  PERMISSION_MODES,
  readmeDescription,
  REMOTE_NAME,
  REMOTE_PREFIX,
  REMOTE_REFUSED_KEYS,
  remoteNameOf,
  remoteRetryRefusal,
  renderAgent,
  renderSkill,
  renderStep,
  SANDBOXES,
  sessionContext,
  SKILL_NAME,
  skillAt,
  skillDraftOf,
  skillEntryOf,
  skillNameRefusal,
  SKILLS_FOLDER,
  skillTurnCost,
  SLOTS,
  splitFrontmatter,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  stepFiles,
  stepNameRefusal,
  SYSTEM_PROMPTS,
  terminalSteps,
  tokensAbout,
  tokensOf,
  upstreamOf,
  validate,
  withPreload,
  WorkflowError,
  WORKSPACES,
} from './keys/keys.ts';
export type {
  Agent,
  AgentCardShape,
  AgentDraft,
  AgentKey,
  AgentOwnKey,
  Agents,
  AgentSkill,
  DeniedAt,
  FrozenStep,
  OutputSchema,
  RoleKey,
  SkillCost,
  SkillDraft,
  SkillsFound,
  StepAgent,
  StepDraft,
  StepKey,
  StepOutput,
  SystemPrompt,
  Workflow,
} from './keys/keys.ts';
