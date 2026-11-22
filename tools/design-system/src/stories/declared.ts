/**
 * What a story declares, read from its module as Storybook reads it: its meta's tags then its own, a tag written `!<tag>` taking that
 * tag back off, and whether its parameters, its own over its meta's, name MSW handlers (`parameters.msw`). Pure and free of Node, so the
 * card's runner bundles it and decides a story's fate in the page before drawing it.
 */
import type { StoryDeclared } from '../../contracts/produce.contract.ts';

/** What a meta or a story carries that says what it is: its tags and its parameters. */
export type Annotated = { readonly tags?: readonly string[]; readonly parameters?: Readonly<Record<string, unknown>> };

/**
 * The tags `levels` give a story, in order, each `!<tag>` removing a tag an earlier level gave.
 * @param levels the tags of each level, from the widest (the meta) to the story's own.
 */
export const mergedTags = (levels: readonly (readonly string[])[]) => {
  const tags: string[] = [];
  for (const tag of levels.flat()) {
    const removed = tag.startsWith('!') ? tag.slice(1) : undefined;
    if (removed !== undefined) tags.splice(0, tags.length, ...tags.filter((one) => one !== removed));
    else if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
};

/**
 * A story's declaration: its tags merged over its meta's, and whether either's parameters name MSW handlers.
 * @param meta the story file's default export.
 * @param story the story's export.
 */
export const declaredOf = (meta: Annotated, story: Annotated) =>
  ({
    tags: mergedTags([meta.tags ?? [], story.tags ?? []]),
    msw: (story.parameters?.msw ?? meta.parameters?.msw) != null,
  }) satisfies StoryDeclared;
