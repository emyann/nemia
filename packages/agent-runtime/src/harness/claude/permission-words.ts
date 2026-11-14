/**
 * The words a permission ask is shown in and answered by, and the command a shell call was typed with: read by `permission.ts` and its
 * contract (`contracts/permission.contract.ts`).
 */

/** What a call that would ask a person is told where no answer reached it: its holder was let go, or its turn was ended. */
export const ASK_CUT =
  'The question went to the person and this call did not wait for their answer: the session was paused or its turn was ended while it ' +
  'waited. Their answer is said to you as words once they give it, naming the question. Carry on without it.';

/** The choice that runs the call this once. */
export const PERMISSION_ONCE = 'Allow once';

/** The choice that runs the call and saves the rules the SDK suggested, so a call like it is not asked again. */
export const PERMISSION_ALWAYS = 'Always allow';

/** The choice that refuses the call. */
export const PERMISSION_DENY = 'Deny';

/** What a call the person denied with no words of their own is told. */
export const PERMISSION_DENIED =
  'The person denied this call where it was shown to them. Do not run it again unasked: say in your answer what you were denied, and ask them if you need it.';

/** The command a shell call was typed with, as its input holds it: nothing for another tool, or for an input with no command string. */
export const commandOf = (tool: string, input: Record<string, unknown>): string | undefined => {
  const command = input['command'];
  return tool === 'Bash' && typeof command === 'string' ? command : undefined;
};
