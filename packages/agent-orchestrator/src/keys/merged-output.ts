/**
 * The one output of a step that hires an agent: the fields the agent's `output:` declares, then those the step's own adds, each with
 * one owner. Pure: it reads the two declarations `outputOf` already read, and refuses a field both declare.
 */
import { AGENTS_FOLDER, type OutputOwner, refuse, type StepOutput } from '../step/step.ts';

/** Who declares a field: `agent` with its name and schema file, or `step` with its own. */
const ownerOf = (by: OutputOwner['by'], name: string, output: StepOutput): OutputOwner => ({ by, name, file: output.file });

/** Where a declarer's `output:` line is, as a refusal names it. */
const declarer = (o: OutputOwner): string =>
  o.by === 'agent'
    ? `agent ${o.name} (${AGENTS_FOLDER}/${o.name}.md, \`output: ${o.file}\`)`
    : `step ${o.name} (${o.name}.md, \`output: ${o.file}\`)`;

/**
 * Step `step`'s output, merged from its agent `agent`'s declaration `fromAgent` and its own `own`: the agent's fields first, then the
 * step's, each recorded in `owners`. `file` is the step's own `output:` line where it has one, else the agent's, as the step's file is
 * written back. Undefined when neither declares one. Refuses a field both declare, naming it and both declarers: a field has one owner.
 */
export function mergedOutput(
  step: string,
  agent: string,
  fromAgent: StepOutput | undefined,
  own: StepOutput | undefined,
): StepOutput | undefined {
  if (!fromAgent && !own) return undefined;
  const sides = [
    ...(fromAgent ? [{ output: fromAgent, owner: ownerOf('agent', agent, fromAgent) }] : []),
    ...(own ? [{ output: own, owner: ownerOf('step', step, own) }] : []),
  ];
  const owners: Record<string, OutputOwner> = {};
  for (const { output, owner } of sides) {
    for (const field of Object.keys(output.schema.properties)) {
      const first = owners[field];
      if (first)
        refuse(
          `${step}: \`${field}\` is declared by ${declarer(first)} and by ${declarer(owner)}: a field has one owner. Delete it from one of the two.`,
        );
      owners[field] = owner;
    }
  }
  const schema = {
    ...fromAgent?.schema,
    ...own?.schema,
    type: 'object' as const,
    properties: { ...fromAgent?.schema.properties, ...own?.schema.properties },
    required: [...(fromAgent?.schema.required ?? []), ...(own?.schema.required ?? [])],
    additionalProperties: false as const,
  };
  return { file: (own ?? fromAgent)!.file, schema, owners };
}
