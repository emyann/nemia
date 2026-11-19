/**
 * Where a step's session starts, the folder it works on, its rules read against that folder, and which added folders' memory files
 * load (`contracts/session-home.contract.ts`).
 */
import type { InWorkspace, MemoryFilesOf, SessionStartOf } from '../../../contracts/session-home.contract.ts';
import { editDenied, everyFileUnder, expandedIn, WORKSPACE_EXPRESSION } from './spelled.ts';

const FILE_TOOLS: readonly string[] = ['Read', 'Edit', 'Write', 'NotebookEdit'];

/**
 * Where a step's session starts: in its run's frozen home, with its workspace added beside it, writable by its own rules or read-only
 * where its fence writes nothing, and the home denied; or in its workspace as before.
 * @param i What the filing knows of the step: its workspace, the run's home, whether it runs here, whether its harness adds a
 * writable folder and whether its fence writes.
 */
export const sessionStart: SessionStartOf = (i) => {
  if (i.home === undefined || !i.local || !i.addsFolders) return { cwd: i.workspace, worked: null, denies: [] };
  return {
    cwd: i.home,
    worked: i.writes ? { path: i.workspace, readOnly: false, ruled: true } : { path: i.workspace, readOnly: true },
    denies: [editDenied(i.home)],
  };
};

/**
 * A step's rule read against its workspace: `${{ workspace }}` expanded to the workspace, and a relative path of a file rule
 * (`Read`, `Edit`, `Write`, `NotebookEdit`) named in the workspace, a leading `./` taken off; any other rule as written.
 * @param rule The rule as the step's fence writes it.
 * @param workspace The step's workspace, absolute.
 */
export const inWorkspace: InWorkspace = (rule, workspace) => {
  if (rule.includes(WORKSPACE_EXPRESSION)) return expandedIn(rule, workspace);
  const open = rule.indexOf('(');
  if (open < 0 || !rule.endsWith(')')) return rule;
  const tool = rule.slice(0, open);
  const inner = rule.slice(open).slice(1, -1);
  if (!FILE_TOOLS.includes(tool) || inner.length === 0 || inner.startsWith('/') || inner.startsWith('~')) return rule;
  const path = inner.startsWith('./') ? inner.slice(2) : inner;
  return tool + '(/' + workspace + '/' + path + ')';
};

/**
 * Which added folders' memory files the harness loads: none unless a person switched one on, and then every folder left off skipped.
 * @param folders Each folder added to the session, and whether its memory files are switched on.
 */
export const memoryFilesOf: MemoryFilesOf = (folders) => {
  if (!folders.some((f) => f.claudeMd)) return { load: false, excludes: [] };
  return { load: true, excludes: folders.filter((f) => !f.claudeMd).map((f) => everyFileUnder(f.path)) };
};
