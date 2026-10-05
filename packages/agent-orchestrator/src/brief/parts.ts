/**
 * Where a brief is cut into parts, pure: the runtime keeps each long part once, so a section two briefs share is stored once.
 */

/**
 * `brief` cut before each line that opens a `## ` section, every part but the first starting with it: parts that, put end to end,
 * are `brief`, so a section reads alike in every brief that has it, whatever comes before it.
 */
export const briefParts = (brief: string): string[] => brief.split(/(?<=\n)(?=## )/);

/** `spec` with its brief cut into parts (`briefParts`) beside it: the runtime keeps each part once, and the brief is filed whole. */
export const inParts = <S extends { brief: string }>(spec: S): S & { briefParts: string[] } => ({
  ...spec,
  briefParts: briefParts(spec.brief),
});
