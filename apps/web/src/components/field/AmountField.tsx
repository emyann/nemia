/**
 * An amount a person types — a budget, a raise, a cost line, a step's count — in the kit's `NumberField`, said to its form at each
 * keystroke as well as when the field commits it.
 */
import { useState } from 'react';
import { NumberField, type NumberFieldProps } from '@/components/ui/ds';
import { AMOUNT_FORMATS, amountTyped, type AmountKind } from '../../lib/amount';

/** What the field takes beside the kit's own props: the amount it holds, what hears each change of it, and its kind. */
type AmountFieldProps = Omit<NumberFieldProps, 'value' | 'defaultValue' | 'onChange' | 'onInput' | 'formatOptions'> & {
  value: number | null;
  onAmount: (amount: number | null) => void;
  kind?: AmountKind;
};

/**
 * The kit's `NumberField` over an amount of `kind`, in its format (`AMOUNT_FORMATS`: dollars to the cent as the board writes money, a
 * count whole), never below zero. The kit's field says its value only once it commits it (blur, Enter, an arrow key), so the text is
 * read as it is typed too, off the input's own `input` event, which React Aria hands the input (`amountTyped`): `onAmount` hears each
 * keystroke that leaves an amount in the field, or none where it is emptied, and the committed amount again where the commit changed it.
 *
 * The field is given the amount it last committed, not `value` as each keystroke moves it, since a value given while it is typed is
 * formatted over what is being typed (`1.` drawn back as `$1`); a `value` the form changes under the field, which no keystroke sent, is
 * drawn in its place.
 */
export function AmountField({ value, onAmount, kind = 'dollars', ...field }: AmountFieldProps) {
  const [held, setHeld] = useState(value);
  const [sent, setSent] = useState(value);
  if (value !== sent) {
    setHeld(value);
    setSent(value);
  }
  const say = (amount: number | null) => {
    setSent(amount);
    onAmount(amount);
  };
  return (
    <NumberField
      {...field}
      formatOptions={AMOUNT_FORMATS[kind]}
      minValue={0}
      value={held ?? Number.NaN}
      onInput={(event) => {
        const typed = amountTyped(event.currentTarget.value, kind);
        if (typed !== undefined && typed !== sent) say(typed);
      }}
      onChange={(committed) => {
        const amount = Number.isNaN(committed) ? null : committed;
        setHeld(amount);
        if (amount !== sent) say(amount);
      }}
    />
  );
}
