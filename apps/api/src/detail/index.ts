/**
 * One run in full, as the runs' routes answer it: judged by the orchestrator (`runPage`, `agent-orchestrator`), whose types are re-exported
 * here under the names the api's routes and tests read them by.
 */
export type {
  RunDetail,
  StepAcceptance,
  StepApproval,
  StepAsked,
  StepBudget,
  StepFiled,
  StepGate,
  StepRaise,
  StepSpec,
  StepTimelineTotal,
  StepTimelineTry,
} from 'agent-orchestrator';
