/**
 * A task's admission: a command the runtime runs before each call of the session to the tools it names, and the check of its shape
 * every harness shares. The harness hands the command the call, and does what it answers; a harness that cannot ask one before a call
 * refuses the task before it is journalled (`harnessRefusalOf`).
 */

/**
 * The command run before each call to one of `tools`, as a Pod's probe gives its `exec`: the program first, then its arguments, no
 * shell between. It reads the call (`AdmissionCall`) as JSON on its stdin, and prints an answer (`AdmissionAnswer`) as JSON on its
 * stdout, or nothing, for no opinion: the call then meets the session's own rules. A command that fails, prints what is no answer, or
 * runs past its bound answers `ask`, so a fault goes to the person and never through. A call to a tool not in `tools` pays no process.
 */
export type Admission = { command: string[]; tools: string[] };

/** A call the session is about to make: the tool's name, its input as the harness gives it, and the folder the session is in. */
export type AdmissionCall = { tool: string; input: Record<string, unknown>; cwd: string };

/**
 * What admission says of a call: run it unasked, ask the person, or refuse it; and why, in words the person reads at the prompt
 * (`message`, once spelled `reason`, which the adapter still reads from a command that prints it).
 */
export type AdmissionAnswer = { decision: 'allow' | 'ask' | 'deny'; message: string };

/** The decisions an answer takes. */
export const ADMISSION_DECISIONS: ReadonlyArray<AdmissionAnswer['decision']> = ['allow', 'ask', 'deny'];

/** The keys admission has: a key beside them is a misspelling or a field no harness reads. */
const ADMISSION_KEYS: readonly string[] = ['command', 'tools'];

/** A tool's name as a harness gives it: a letter first, then letters, digits and underscores (`Bash`, or an MCP tool's full name). */
const TOOL = /^[A-Za-z][A-Za-z0-9_]*$/;

/** A string a process can be handed, not empty: one with no NUL, which would end it early on its way to the program. */
const isWord = (v: unknown): v is string => typeof v === 'string' && v !== '' && !v.includes(String.fromCharCode(0));

/**
 * Why a task's `config.admission` cannot be run before its calls — or `undefined`. Refuses a value that is not an object of
 * `command` and `tools` alone, a `command` that is not a list of strings with no NUL, the program first and named, and `tools` that
 * is not a list of tools' names, at least one: admission that sees no call decides nothing.
 */
export const admissionRefusalOf = (admission: unknown): string | undefined => {
  if (admission === undefined) return undefined;
  if (typeof admission !== 'object' || admission === null || Array.isArray(admission)) {
    return `\`callAdmission: ${JSON.stringify(admission)}\` is not admission. Give an object, like { "command": ["my-admit"], "tools": ["Bash"] }, or leave it out.`;
  }
  const stray = Object.keys(admission).find((key) => !ADMISSION_KEYS.includes(key));
  if (stray) return `\`callAdmission.${stray}\` is not one of admission's keys. It has \`command\` and \`tools\` alone.`;
  const { command, tools } = admission as Partial<Admission>;
  if (!(Array.isArray(command) && command.length > 0 && command.every(isWord))) {
    return `\`callAdmission.command: ${JSON.stringify(command)}\` is not a command. Give the program and its arguments as a list of strings with no NUL, the program first, like ["my-admit", "--strict"].`;
  }
  if (!(Array.isArray(tools) && tools.length > 0 && tools.every((tool) => typeof tool === 'string' && TOOL.test(tool)))) {
    return `\`callAdmission.tools: ${JSON.stringify(tools)}\` names no tool admission sees. Give the tools whose calls it decides, by name, like ["Bash"].`;
  }
  return undefined;
};
