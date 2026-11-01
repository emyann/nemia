/**
 * The folder a workflow is (agent-orchestrator, src/folder/folder.ts): why a path cannot be a `WorkflowDir`, the id the Workflow door is
 * addressed by (`workflowDirRefusal`). A workflow's folder is named as `workflowFolder` resolves it: absolute, normalized, not the root,
 * and neither the folder of agents nor of skills beside the workflows. The words are nobody's law, only that a refusal is one.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../src/step/step.ts';

/** Whether the folder's own name, the path's last segment, is `name`. */
const namedAs = (dir: string, name: string): boolean => dir === name || dir.endsWith('/' + name);

/** Whether a path holds a segment `.` or `..`, an empty one, or ends in a slash: what resolving it would change. */
const unnormalized = (dir: string): boolean =>
  dir.includes('//') ||
  dir.includes('/./') ||
  dir.includes('/../') ||
  dir.endsWith('/.') ||
  dir.endsWith('/..') ||
  (dir.length > 1 && dir.endsWith('/'));

const workflowDirRefusalSpec = spec<(dir: string) => string | null>({
  ensures: {
    relativeRefused: {
      description: 'A path that is not absolute is refused: a relative one names another folder from each working directory',
      condition: ({ input: [dir], output }) => dir.startsWith('/') || output !== null,
    },
    unnormalizedRefused: {
      description: 'A path resolving would change is refused: two spellings of one folder would be two ids',
      condition: ({ input: [dir], output }) => !unnormalized(dir) || output !== null,
    },
    rootRefused: {
      description: 'The root is refused: a workflow is a folder with a name',
      condition: ({ input: [dir], output }) => dir !== '/' || output !== null,
    },
    agentsFolderRefused: {
      description: 'The folder of agents beside the workflows is refused',
      condition: ({ input: [dir], output }) => !namedAs(dir, AGENTS_FOLDER) || output !== null,
    },
    skillsFolderRefused: {
      description: 'The folder of skills beside the workflows is refused',
      condition: ({ input: [dir], output }) => !namedAs(dir, SKILLS_FOLDER) || output !== null,
    },
    resolvedFolderGoes: {
      description: 'An absolute, normalized folder that is not the root and neither agents nor skills is taken',
      condition: ({ input: [dir], output }) =>
        !dir.startsWith('/') ||
        unnormalized(dir) ||
        dir === '/' ||
        namedAs(dir, AGENTS_FOLDER) ||
        namedAs(dir, SKILLS_FOLDER) ||
        output === null,
    },
  },
});
export type WorkflowDirRefusal = Implementation<typeof workflowDirRefusalSpec>;
