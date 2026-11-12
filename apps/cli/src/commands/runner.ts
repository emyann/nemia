/** A moved command's runner: on its words parsed against its spec, it asks the api, prints, and answers its exit code. */
import type { Args } from 'objects';

export type Runner = (args: Args) => Promise<number>;
