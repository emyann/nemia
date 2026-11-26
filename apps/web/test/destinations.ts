/**
 * Where each part of a second component system the board takes, and each control it draws by hand, moves to: the plan of the move
 * onto the one system, the ds kit, a part at a time. A key is `<module>:<name>` for an import, the module by its canonical spelling
 * and the name as the module exports it (`@/components/ui/button:Button`, `react-aria-components:Dialog`), `<element>` for a raw
 * element (`<button>`), `<CutField><input>` for an input the look's CutField frames, and `@/lib/classes:<NAME>` for a shared class
 * string that draws a control. `stories.test.ts` holds the map to the tree through `mapGaps` (`stories.ts`): a key the board takes
 * with no destination is refused, and so is a destination nothing
 * takes any more, so the map is cut in the move that takes the last file off a key. Only `RouterProvider` is exempt, and stays.
 */
import type * as Kit from '../src/components/ui/ds/index.ts';

/** A part the kit exports, by its name in the kit's index: a destination naming no part of the kit fails the typecheck. */
type KitPart = keyof typeof Kit;

/**
 * Where a key moves: a part of the kit (`kit`, with how where it is not plain), a part of the look (`look`), the frame's own state
 * (`frame`), no part, the page's own markup (`plain`), a part asked of the kit's factory and the run that carries the ask, none until
 * filed (`ask`), or none, and why it stays (`exempt`).
 */
export type Destination =
  | { readonly kind: 'kit'; readonly part: KitPart; readonly how?: string }
  | { readonly kind: 'look'; readonly part: string }
  | { readonly kind: 'frame'; readonly part: string }
  | { readonly kind: 'plain'; readonly why: string }
  | { readonly kind: 'ask'; readonly what: string; readonly run: string | null }
  | { readonly kind: 'exempt'; readonly why: string };

/** The part of the kit `part` is. */
const kit = (part: KitPart, how?: string) => (how === undefined ? { kind: 'kit', part } : { kind: 'kit', part, how }) satisfies Destination;

/** The inline alert the kit lacks, asked of the design system's factory. */
const ALERT: Destination = { kind: 'ask', what: 'inline alert: a tinted surface with a title and a description', run: null };

/** Every key the board takes from a second system or draws by hand, and where it moves. */
export const DESTINATIONS: Readonly<Record<string, Destination>> = {
  '@/components/ui/alert:Alert': ALERT,
  '@/components/ui/alert:AlertDescription': ALERT,
  '@/components/ui/alert:AlertTitle': ALERT,
  '@/components/ui/badge:Badge': kit('Tag'),
  '@/components/ui/button:Button': kit('Button'),
  '@/components/ui/card:Card': kit('Card'),
  '@/components/ui/card:CardContent': kit('CardContent'),
  '@/components/ui/card:CardDescription': kit('Body'),
  '@/components/ui/card:CardHeader': kit('CardContent'),
  '@/components/ui/card:CardTitle': kit('Title'),
  '@/components/ui/empty:Empty': kit('EmptyState'),
  '@/components/ui/empty:EmptyContent': kit('EmptyState'),
  '@/components/ui/empty:EmptyDescription': kit('EmptyState'),
  '@/components/ui/empty:EmptyHeader': kit('EmptyState'),
  '@/components/ui/empty:EmptyTitle': kit('EmptyState'),
  '@/components/ui/field:Field': kit('TextField'),
  '@/components/ui/field:FieldDescription': kit('TextField', 'its description'),
  '@/components/ui/field:FieldGroup': { kind: 'plain', why: "the page's own column of fields" },
  '@/components/ui/field:FieldLabel': kit('TextField', 'its label'),
  '@/components/ui/input:Input': kit('TextField'),
  '@/components/ui/select:Select': kit('Select'),
  '@/components/ui/select:SelectContent': kit('Select'),
  '@/components/ui/select:SelectItem': kit('SelectItem'),
  '@/components/ui/select:SelectTrigger': kit('Select'),
  '@/components/ui/select:SelectValue': kit('Select'),
  '@/components/ui/separator:Separator': kit('Divider'),
  '@/components/ui/textarea:Textarea': kit('TextField', 'multiline'),
  'react-aria-components:PopoverContext': {
    kind: 'ask',
    what: "a preview card anchored to an element other than its trigger (a bar's whole rail), and opened without its entering animation",
    run: null,
  },
  'react-aria-components:RouterProvider': {
    kind: 'exempt',
    why: "the kit's Link and Button route href through it, and the kit exports none",
  },
  '<CutField><input>': {
    kind: 'ask',
    what: "a text field with no container of its own, for a frame the page draws (the look's CutField): the kit's TextField draws its filled or outlined box around the input",
    run: null,
  },
  '<textarea>': kit('TextField', 'multiline'),
};

/** The keys a file may go on taking: the map's `exempt` destinations, never held to a baseline. */
export const EXEMPT: readonly string[] = Object.entries(DESTINATIONS)
  .filter(([, destination]) => destination.kind === 'exempt')
  .map(([key]) => key);
