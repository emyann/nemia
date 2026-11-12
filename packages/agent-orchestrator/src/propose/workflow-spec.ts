/**
 * A workflow folder's files read as the spec a Workflow object carries (`WorkflowSpec` of objects): each step, a `.md` file that is not
 * its README, by its name, its frontmatter's keys in the form the spec carries them (`servedKeys`) and its body, in the order of their
 * names; its README; and the folder's other text files (`files`), sorted by name. One reading for the folder on disk (`workflowSpecAt`,
 * `current.verb.ts`) and for a folder composed from an upgrade's merge (`nemia factory resolve`). Pure.
 */
import { isReadme, splitFrontmatter } from '../step/step.ts';
import { isMarkdown } from '../folder/folder.ts';
import { frontmatterValues, MAP_KEYS, readFrontmatter } from '../frontmatter/frontmatter.ts';
import { STEP_KEY_FORM } from 'objects';
import { tokensOf } from '../keys/index.ts';
import { isHarnessBlock } from '../former/former.ts';
import { isMap } from '../template/index.ts';

/** A text file directly in a workflow's folder: its name and its text. */
export type FolderText = { readonly name: string; readonly text: string };

/** A workflow's spec as a proposal carries it. */
export type WorkflowSpecRead = {
  readme?: string;
  steps: { name: string; keys: Record<string, unknown>; body: string }[];
  files: { path: string; text: string }[];
};

/**
 * `keys` with a harness's block, `<harness>: { fence: { … } }`, read into its fence keys as the parser reads it (`readKeys`), each at the
 * top level, where a Workflow's spec carries a step's fence and from where its write puts it back under the block (`fencedPairs`). A
 * block that holds anything but a fence map, or a fence key also set at the top level, is carried as it reads, for the write to refuse
 * in the parser's words; so is a key that names no harness.
 */
const fenceRead = (keys: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(keys).flatMap(([key, value]): [string, unknown][] => {
      if (!isHarnessBlock(key) || !isMap(value)) return [[key, value]];
      const { fence, ...rest } = value;
      if (Object.keys(rest).length > 0 || !isMap(fence) || Object.keys(fence).some((k) => Object.hasOwn(keys, k))) return [[key, value]];
      return Object.entries(fence);
    }),
  );

/** The frontmatter of a file's text as a record, and its body. */
export const fileParts = (name: string, text: string): { keys: Record<string, unknown>; body: string } => {
  const { block, body } = splitFrontmatter(name, text);
  const keys: unknown = block === null ? {} : frontmatterValues(block);
  return { keys: typeof keys === 'object' && keys !== null ? (keys as Record<string, unknown>) : {}, body };
};

/**
 * The keys of a step's `block` the loader reads as text though they hold a map (`MAP_KEYS`), each as the JSON text `readKeys` keeps of
 * it: the block read as the loader reads it (`readFrontmatter`, every scalar the string written), whether the file writes the map in flow
 * or as a block. A key written as a line is left out, carried as it reads.
 */
const mapTexts = (name: string, block: string | null): Record<string, string> =>
  block === null
    ? {}
    : Object.fromEntries(
        readFrontmatter(name, block).entries.flatMap(({ key, value }) =>
          MAP_KEYS.includes(key) && typeof value === 'object' && !Array.isArray(value) ? [[key, JSON.stringify(value)]] : [],
        ),
      );

/**
 * A step's keys as its frontmatter reads them put in the form a Workflow's spec carries them (objects' `STEP_KEY_FORM`): a
 * list of steps or of names, which a file writes `a, b`, as its names; a context window written `200k` as its tokens. Any other value as
 * it reads, the proposal's check judging it; a map on a key the loader reads as text is `mapTexts`'.
 */
const servedKeys = (keys: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(keys).map(([key, value]) => {
      const form = (STEP_KEY_FORM as Readonly<Record<string, string>>)[key];
      if (typeof value !== 'string') return [key, value];
      if (form === 'steps' || form === 'list')
        return [
          key,
          value
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
        ];
      return [key, form === 'tokens' ? (tokensOf(value) ?? value) : value];
    }),
  );

/** The spec `files`, the text files of a workflow's folder, say: its steps, its README where it has one, and its other files. */
export function workflowSpecOf(files: readonly FolderText[]): WorkflowSpecRead {
  const byName = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const readme = byName.find((f) => isReadme(f.name));
  const steps = byName
    .filter((f) => f.name.endsWith('.md') && !isReadme(f.name))
    .map((f) => {
      const name = f.name.slice(0, -'.md'.length);
      const { keys, body } = fileParts(name, f.text);
      return { name, keys: { ...servedKeys(fenceRead(keys)), ...mapTexts(name, splitFrontmatter(name, f.text).block) }, body };
    });
  const others = byName.filter((f) => !isMarkdown(f.name)).map((f) => ({ path: f.name, text: f.text }));
  return { ...(readme !== undefined && { readme: readme.text }), steps, files: others };
}
