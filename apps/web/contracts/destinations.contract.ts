/**
 * Where the board's map of destinations falls short of what the board draws with (apps/web, test/stories.ts, `mapGaps`): the map
 * (`test/destinations.ts`) gives each part of a second system the board takes, and each control it draws by hand, the place it moves
 * to, and is the plan's inventory, so it holds every key the board takes and no key the board no longer takes.
 *
 * The facts are read by the caller from the tree, never here: each key a file of `apps/web/src` takes, `<module>:<name>` for an
 * import of a second system (`@/components/ui/button:Button`, `react-aria-components:Dialog`) and `<button>` or `@/lib/classes:BUTTON`
 * for a control drawn by hand, once each however many files take it; and each key the map gives a destination, once each. A key taken that
 * the map gives no destination is unmapped, and refused; a key the map gives a destination that nothing takes is unused, and refused,
 * so the map is cut in the change that moves the last file off it.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the map lacks and what it holds past its use. */
export type Gaps = {
  /** The keys the board takes that the map gives no destination, once each. */
  readonly unmapped: readonly string[];
  /** The keys the map gives a destination that no file of the board takes, once each. */
  readonly unused: readonly string[];
};

/** Whether `list` holds no value twice: none is among those before it. */
const once = (list: readonly string[]): boolean => list.every((one, at) => !list.slice(0, at).includes(one));

const mapGapsSpec = spec<(taken: readonly string[], mapped: readonly string[]) => Gaps>({
  requires: ({ input: [taken, mapped] }) => once(taken) && once(mapped),
  ensures: {
    unmappedExactlyWhereNoDestination: {
      description: 'A key the board takes is refused as unmapped exactly when the map gives it no destination',
      condition: ({ input: [taken, mapped], output }) =>
        taken.every((key) => output.unmapped.includes(key) === !mapped.includes(key)) &&
        output.unmapped.every((key) => taken.includes(key)),
    },
    unmappedOnce: {
      description: 'Each unmapped key is named once',
      condition: ({ output }) => once(output.unmapped),
    },
    unusedExactlyWhereNothingTakes: {
      description: 'A destination is refused as unused exactly when no file of the board takes its key',
      condition: ({ input: [taken, mapped], output }) =>
        mapped.every((key) => output.unused.includes(key) === !taken.includes(key)) && output.unused.every((key) => mapped.includes(key)),
    },
    unusedOnce: {
      description: 'Each unused destination is named once',
      condition: ({ output }) => once(output.unused),
    },
  },
});
export type MapGaps = Implementation<typeof mapGapsSpec>;
