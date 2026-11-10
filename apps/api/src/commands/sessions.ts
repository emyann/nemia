/** The words of the route that sets Nemia's level, which her keeper acts on. */
import type { RouteWords } from './words.ts';

/** The body `PUT /api/level` takes: `nemia level`'s level, as JSON. */
const LEVEL_SHAPE = '`{ "level": "manual" | "semi-auto" | "auto" }`';

/** Nemia's level set: and its body; a level that is none is the package's 422. */
export const LEVEL: RouteWords = {
  shape: LEVEL_SHAPE,
  issue:
    () =>
    ({ input }) =>
      `\`level\` is the level Nemia is set to, as \`nemia level <level>\` takes it: manual, semi-auto or auto. This request's was ${JSON.stringify(input) ?? 'left out'}: ${LEVEL_SHAPE}.`,
};
