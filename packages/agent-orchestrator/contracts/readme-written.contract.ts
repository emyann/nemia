/**
 * The README a write of a workflow writes (agent-orchestrator, src/folder/folder.ts), whichever writer writes it: the library's write
 * (`PUT /api/workflows/<name>`) and a proposal's apply, and the preview of the spec a proposal will hold once written (`mergedSpec`).
 *
 * A Workflow's `spec.readme` is the folder's README as its file holds it, frontmatter and all, so a README given with a frontmatter of its
 * own is the whole file, written exactly as given: a Workflow read and proposed back writes its README unchanged. A README given with no
 * frontmatter of its own is the instruction alone, written under the frontmatter the README on disk opens with (none where it opens with
 * none), so a writer that edits the instruction alone — the board's builder, which shows `status.readmeBody` — keeps the needs and the
 * other keys that frontmatter declares. None given leaves the README as it is: the write writes none (undefined).
 *
 * Whether the given text opens with a frontmatter, and the block the README on disk opens with, are read by the caller with the parser's
 * one pattern (`FRONTMATTER`, src/step/step.ts): the laws are over what it read.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A README given to a write: its text as sent, and whether that text opens with a frontmatter of its own. */
export type ReadmeGiven = { readonly text: string; readonly ownFrontmatter: boolean };

const readmeWrittenSpec = spec<(diskBlock: string, given: ReadmeGiven | undefined) => string | undefined>({
  ensures: {
    noneGivenWritesNone: {
      description: 'A write writes a README exactly when it gives one: given none, the README on disk is left as it is',
      condition: ({ input: [, given], output }) => (given === undefined) === (output === undefined),
    },
    ownFrontmatterWrittenAsGiven: {
      description: 'A README given with a frontmatter of its own is the whole file, written exactly as given',
      condition: ({ input: [, given], output }) => given === undefined || !given.ownFrontmatter || output === given.text,
    },
    instructionKeepsTheDisksFrontmatter: {
      description:
        'A README given with no frontmatter of its own is written under the frontmatter the README on disk opens with, its instruction as given',
      condition: ({ input: [diskBlock, given], output }) =>
        given === undefined || given.ownFrontmatter || output === diskBlock + given.text,
    },
  },
});

/** `readmeWritten`'s type, which `src/folder/folder.ts` takes: the README a write writes, from the disk's block and the README given. */
export type ReadmeWrittenOf = Implementation<typeof readmeWrittenSpec>;
