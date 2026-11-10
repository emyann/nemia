/**
 * What a capture keeps of a `system`/`init` line (agent-runtime, src/harness/detached/output.ts, `initKept`), given what the capture's
 * earlier `init` lines already say to a reader of it (`claudeStreamOutput`): the folder the first names, the model the first names, and
 * the version of Claude Code and the permission mode the last names. The SDK prints one per turn, each listing every tool and command,
 * which no reader reads: a line is kept, cut to the fields a reader reads, only where it changes what a reader reads, and the first
 * always, since a stream with an `init` line is a session known to have started.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The fields of an `init` line a reader of the capture reads, as the SDK names them, but the mode, in the runtime's word (`ranIn`). */
export type InitRead = {
  readonly cwd?: string;
  readonly model?: string;
  readonly claude_code_version?: string;
  readonly ranIn?: string;
};

/**
 * What a reader reads once `line` follows what `read` already said: the first folder, the first model, the last version and the last
 * mode named.
 */
const readOf = (read: InitRead | undefined, line: InitRead): InitRead => ({
  cwd: read?.cwd ?? line.cwd,
  model: read?.model ?? line.model,
  claude_code_version: line.claude_code_version ?? read?.claude_code_version,
  ranIn: line.ranIn ?? read?.ranIn,
});

/** Whether two readings say the same. */
const same = (a: InitRead, b: InitRead): boolean =>
  a.cwd === b.cwd && a.model === b.model && a.claude_code_version === b.claude_code_version && a.ranIn === b.ranIn;

const initKeptSpec = spec<(line: InitRead, read: InitRead | undefined) => InitRead | undefined>({
  ensures: {
    theFirstIsKept: {
      description: 'The first init line of a capture is kept: it says the session started',
      condition: ({ input: [, read], output }) => (read === undefined ? output !== undefined : true),
    },
    readsTheSame: {
      description: 'A reader reads the same of the capture whether the line was kept, cut or dropped',
      condition: ({ input: [line, read], output }) => read === undefined || same(readOf(read, output ?? {}), readOf(read, line)),
    },
    dropsWhatChangesNothing: {
      description: 'A later init line that changes nothing a reader reads is not kept',
      condition: ({ input: [line, read], output }) => (read !== undefined && same(readOf(read, line), read) ? output === undefined : true),
    },
    keepsWhatChangesTheReading: {
      description: 'A later init line that changes what a reader reads is kept',
      condition: ({ input: [line, read], output }) => (read !== undefined && !same(readOf(read, line), read) ? output !== undefined : true),
    },
    keptAsItSaidIt: {
      description: 'A kept line says each field a reader reads as the line said it, and nothing else',
      condition: ({ input: [line], output }) =>
        output === undefined ||
        (output.cwd === line.cwd &&
          output.model === line.model &&
          output.claude_code_version === line.claude_code_version &&
          output.ranIn === line.ranIn),
    },
  },
});

export type InitKept = Implementation<typeof initKeptSpec>;
