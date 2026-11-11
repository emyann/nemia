/**
 * A workflow folder's files read as the spec a Workflow object carries (`WorkflowSpec` of objects): each step, a `.md` file that is not
 * its README, by its name, its frontmatter's keys and its body, in the order of their names; its README; and the folder's other text
 * files (`files`), sorted by name. One reading for the folder on disk (`workflowSpecAt`, `current.verb.ts`) and for a folder composed
 * from an upgrade's merge (`nemia factory resolve`). Pure.
 */
import { isReadme, splitFrontmatter } from '../step/step.ts';
import { frontmatterValues } from '../frontmatter/frontmatter.ts';

/** A text file directly in a workflow's folder: its name and its text. */
export type FolderText = { readonly name: string; readonly text: string };

/** A workflow's spec as a proposal carries it. */
export type WorkflowSpecRead = {
  readme?: string;
  steps: { name: string; keys: Record<string, unknown>; body: string }[];
  files: { path: string; text: string }[];
};

/** The frontmatter of a file's text as a record, and its body. */
export const fileParts = (name: string, text: string): { keys: Record<string, unknown>; body: string } => {
  const { block, body } = splitFrontmatter(name, text);
  const keys: unknown = block === null ? {} : frontmatterValues(block);
  return { keys: typeof keys === 'object' && keys !== null ? (keys as Record<string, unknown>) : {}, body };
};

/** The spec `files`, the text files of a workflow's folder, say: its steps, its README where it has one, and its other files. */
export function workflowSpecOf(files: readonly FolderText[]): WorkflowSpecRead {
  const byName = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const readme = byName.find((f) => isReadme(f.name));
  const steps = byName
    .filter((f) => f.name.endsWith('.md') && !isReadme(f.name))
    .map((f) => {
      const name = f.name.slice(0, -'.md'.length);
      return { name, ...fileParts(name, f.text) };
    });
  const others = byName.filter((f) => !f.name.endsWith('.md')).map((f) => ({ path: f.name, text: f.text }));
  return { ...(readme !== undefined && { readme: readme.text }), steps, files: others };
}
