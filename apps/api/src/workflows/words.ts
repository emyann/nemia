/**
 * The names the builder writes by, judged before a byte is written: a workflow's, one folder directly in the store's `workflows/`, and a
 * schema's, a `.json` file directly in that folder. Each refusal is a sentence naming the fix (400).
 */
import { AGENTS_FOLDER } from 'agent-orchestrator/workflow';

/**
 * Why `name` cannot be a folder of yours (400), or undefined: a name the listing would show, one folder directly in the store's
 * `workflows/`.
 */
export function workflowNameRefusal(name: unknown): string | undefined {
  const fix = 'Name it as its folder is named — dev, say.';
  if (typeof name !== 'string' || !name.trim()) return `A workflow has no name, and a workflow is named by its folder. ${fix}`;
  const as = `\`${name}\` is not a workflow's name:`;
  if (/[\\/]/.test(name)) return `${as} a workflow is one folder in yours, and a slash names a folder inside another. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(name)) return `${as} it holds a control character — ${JSON.stringify(name)}. ${fix}`;
  if (name.startsWith('.'))
    return `${as} a folder whose name starts with a dot is hidden, and the board lists no hidden folder as a workflow. ${fix}`;
  if (name !== name.trim()) return `${as} a name with spaces around it is a folder nobody can type. Write it without them.`;
  if (new TextEncoder().encode(name).length > 255) return `${as} it is longer than a folder's name may be, 255 bytes. ${fix}`;
  if (name === AGENTS_FOLDER)
    return `${as} ${AGENTS_FOLDER}/ is the folder of the agents the workflows beside it name, and its files are agents, not steps. ${fix}`;
  return undefined;
}

/** Why `file` cannot be a schema beside the steps (400), or undefined: a `.json` file directly in the folder, not hidden. */
export function schemaNameRefusal(file: string): string | undefined {
  const fix = 'Name it beside its step — review.schema.json, say.';
  const as = `\`${file}\` is not a schema's file:`;
  if (/[\\/]/.test(file)) return `${as} a schema lives in the workflow's folder, and a slash names a file in another. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(file)) return `${as} it holds a control character — ${JSON.stringify(file)}. ${fix}`;
  if (file.startsWith('.')) return `${as} a file whose name starts with a dot is hidden, and nobody listing the folder sees it. ${fix}`;
  if (!file.endsWith('.json') || file === '.json')
    return `${as} a JSON Schema's file ends in .json, which is what the builder lists beside the steps. ${fix}`;
  if (new TextEncoder().encode(file).length > 255) return `${as} it is longer than a file's name may be, 255 bytes. ${fix}`;
  return undefined;
}
