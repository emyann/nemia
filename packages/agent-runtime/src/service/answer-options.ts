/**
 * Why `answer` refuses the options it was handed, or `undefined`: the turn's cap moved under `config`, and is refused at its old
 * place. The engine and its stand-in both ask it first, so neither keeps an answer the other refuses.
 */
export const answerOptionsRefusalOf = (options: object): string | undefined =>
  Object.hasOwn(options, 'budgetUsd')
    ? "`budgetUsd` is the harness's configuration: give it under `config`, as `answer(id, text, { config: { budgetUsd: … } })`."
    : undefined;
