/** Where a session is reached on the web, as `objects` says it beside Nemia's level (`NemiaLevel.bridge`). */
import type { NemiaLevel } from './nemia.ts';

/** A session's web link, or why it has none. */
export type Bridge = NonNullable<NemiaLevel['bridge']>;
