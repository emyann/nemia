/**
 * What the welcome's template form asks of a template's parameters, off `Template.spec.parameters` as the api serves it: where each is
 * drawn (`parameterFieldOf`) and the `--set` word each field sends (`setWordOf`), both proved by
 * `contracts/template-parameters.contract.ts`; each of a template's parameters as the form reads it (`parameterReadsOf`), and the words
 * a form sends (`setsOf`). Pure: the drawing is components/welcome/TemplateParameters.tsx.
 */
import type { TemplateParameter } from 'objects';
import type { ParameterFieldOf, ParameterRead, SetWordOf } from '../../contracts/template-parameters.contract.ts';

export type { ParameterRead } from '../../contracts/template-parameters.contract.ts';

/**
 * Where a parameter is drawn: nowhere where a volume sets it, open where the template asks it or it has no default, else folded.
 * @param parameter The parameter as the form reads it.
 */
export const parameterFieldOf: ParameterFieldOf = (parameter) => {
  if (parameter.follows) return 'none';
  return parameter.ask || parameter.defaultWord === null ? 'asked' : 'more';
};

/**
 * The `--set` word a field sends: none where a volume sets it, it is blank or at its default, else `<name>=<value>`.
 * @param parameter The parameter as the form reads it.
 * @param given The field's value as text, a switch's `true` or `false`.
 */
export const setWordOf: SetWordOf = (parameter, given) => {
  if (parameter.follows || given === '' || given === parameter.defaultWord) return null;
  return parameter.name + '=' + given;
};

/**
 * The parameter `name` as the form reads it: whether the template asks it, whether a volume sets it, and its default as a field writes it.
 * @param name The parameter's name.
 * @param parameter The parameter as the template declares it.
 */
const parameterReadOf = (name: string, parameter: TemplateParameter) =>
  ({
    name,
    type: parameter.type,
    ask: parameter.ask === true,
    follows: parameter.whenOrigin !== undefined,
    defaultWord: parameter.default === undefined ? null : String(parameter.default),
  }) satisfies ParameterRead;

/**
 * Each of a template's parameters as the form reads it, in the order the template declares them.
 * @param parameters The template's parameters, by name.
 */
export const parameterReadsOf = (parameters: Readonly<Record<string, TemplateParameter>>) =>
  Object.entries(parameters).map(([name, parameter]) => parameterReadOf(name, parameter));

/**
 * The value a field starts at: its default as a field writes it, else `false` for a switch and nothing for any other field.
 * @param read The parameter as the form reads it.
 */
export const startWordOf = (read: ParameterRead) => read.defaultWord ?? (read.type === 'boolean' ? 'false' : '');

/**
 * The `--set` words a form sends, in the order the template declares its parameters: the word `setWordOf` gives each declared
 * parameter's field, a field not given taken at its start; a key no parameter declares never sends one.
 * @param reads The template's parameters as the form reads them.
 * @param given Each field's value as text, by the parameter's name.
 */
export const setsOf = (reads: readonly ParameterRead[], given: Readonly<Record<string, string>>) =>
  reads.flatMap((read) => {
    const word = setWordOf(read, given[read.name] ?? startWordOf(read));
    return word === null ? [] : [word];
  });
