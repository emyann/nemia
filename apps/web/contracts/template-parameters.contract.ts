/**
 * What the welcome's template form asks of a template's parameters, off `Template.spec.parameters` as the api serves it: where each
 * parameter is drawn (`parameterFieldOf`, src/lib/templateParameters.ts) — open among those the template asks, folded under More
 * parameters, or not at all where the factory's first writable volume sets it (`whenOrigin`) — and the `--set` word each field sends
 * (`setWordOf`): none for a field left blank or at its default, so the template's default fills it as at the command line, and
 * `<name>=<value>` for one the person filled.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TemplateParameterType } from 'objects';

/**
 * A declared parameter as the form reads it: its name, its type, whether the template marks it to ask (`ask: true`), whether a volume
 * sets it (`whenOrigin` given), and its default as the field writes it (`String(default)`), null where it declares none.
 */
export type ParameterRead = {
  readonly name: string;
  readonly type: TemplateParameterType;
  readonly ask: boolean;
  readonly follows: boolean;
  readonly defaultWord: string | null;
};

/** Where a parameter is drawn: open among the asked ones, folded under More parameters, or not drawn. */
export type ParameterField = 'asked' | 'more' | 'none';

const parameterFieldOfSpec = spec<(parameter: ParameterRead) => ParameterField>({
  ensures: {
    aVolumeSetsIt: {
      description: 'A parameter the first writable volume sets is never drawn: it asks nothing of the person',
      condition: ({ input: [p], output }) => !p.follows || output === 'none',
    },
    askedIsOpen: {
      description: 'A parameter the template marks to ask is drawn open, where no volume sets it',
      condition: ({ input: [p], output }) => !(!p.follows && p.ask) || output === 'asked',
    },
    noDefaultIsOpen: {
      description: 'A parameter with no default must be given, so it is drawn open, where no volume sets it',
      condition: ({ input: [p], output }) => !(!p.follows && p.defaultWord === null) || output === 'asked',
    },
    theRestIsFolded: {
      description: 'A parameter not marked to ask, with a default and set by no volume, is folded under More parameters',
      condition: ({ input: [p], output }) => !(!p.follows && !p.ask && p.defaultWord !== null) || output === 'more',
    },
  },
});

/** `parameterFieldOf`'s type, which src/lib/templateParameters.ts takes. */
export type ParameterFieldOf = Implementation<typeof parameterFieldOfSpec>;

const setWordOfSpec = spec<(parameter: ParameterRead, given: string) => string | null>({
  ensures: {
    aVolumeSetsItSendsNothing: {
      description: 'A parameter the first writable volume sets is never sent from the form',
      condition: ({ input: [p], output }) => !p.follows || output === null,
    },
    blankIsSkipped: {
      description: 'A field left blank sends no --set, so the template default fills it',
      condition: ({ input: [, given], output }) => given !== '' || output === null,
    },
    theDefaultIsSkipped: {
      description: 'A field left at its default sends no --set, so the template default fills it',
      condition: ({ input: [p, given], output }) => given !== p.defaultWord || output === null,
    },
    filledIsSent: {
      description: 'A field the person filled, other than its default, sends exactly <name>=<value>',
      condition: ({ input: [p, given], output }) =>
        !(!p.follows && given !== '' && given !== p.defaultWord) || output === p.name + '=' + given,
    },
  },
});

/** `setWordOf`'s type, which src/lib/templateParameters.ts takes: `given` is the field's value as text, a switch's `true` or `false`. */
export type SetWordOf = Implementation<typeof setWordOfSpec>;
