/**
 * An amount a person types, in the kit's `NumberField`: the formats the board shows one in, and what a field holds while it is still
 * being typed, which the field itself says only once it commits (on blur, Enter or a step). Pure.
 */

/** How an amount is written in its field: dollars to the cent, a count whole. */
export type AmountKind = 'dollars' | 'count';

/**
 * The format of each kind of amount, as the field's `formatOptions`: dollars to the cent, as the board writes money (`dollars`), `$16.00`
 * and `$2.50` — not `budgetWord`'s `$16`, since React Aria's parser of a format that strips the cents of a whole amount
 * (`trailingZeroDisplay`) refuses a decimal point typed; a count whole, with no separator, as a key of a step is written.
 */
export const AMOUNT_FORMATS: Readonly<Record<AmountKind, Intl.NumberFormatOptions>> = {
  dollars: { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 },
  count: { maximumFractionDigits: 0, useGrouping: false },
};

/**
 * The amount a field's text holds as typed, read in the field's locale and format: `null` for an empty field, the number for one the
 * format reads, and `undefined` for a text it does not, or one finer than the format keeps — a key the field refuses, which it takes
 * back before it is drawn.
 * @param text What the field's input holds.
 * @param kind The kind of amount the field takes, which says its format.
 * @param locale The locale the field formats in; the runtime's own where none is given, as the kit's field takes it.
 */
export function amountTyped(text: string, kind: AmountKind, locale?: string): number | null | undefined {
  const parts = new Intl.NumberFormat(locale, AMOUNT_FORMATS[kind]).formatToParts(-12345.6);
  const symbol = (type: Intl.NumberFormatPartTypes): string | undefined => parts.find((part) => part.type === type)?.value;
  const dropped = new Set(parts.filter((part) => ['group', 'currency', 'literal'].includes(part.type)).map((part) => part.value));
  let plain = '';
  for (const char of text.replace(/\s/g, '')) {
    if (dropped.has(char)) continue;
    plain += char === symbol('decimal') ? '.' : char === symbol('minusSign') ? '-' : char;
  }
  if (plain === '' || plain === '-') return null;
  const fraction = plain.split('.')[1]?.length ?? 0;
  const most = AMOUNT_FORMATS[kind].maximumFractionDigits ?? 0;
  return /^-?(\d+\.?\d*|\.\d+)$/.test(plain) && fraction <= most ? Number(plain) : undefined;
}
