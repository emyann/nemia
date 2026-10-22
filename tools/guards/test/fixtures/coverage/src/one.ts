/** The sign of `n` as a word: the test reaches the first branch alone. */
export const sign = (n: number): string => {
  if (n >= 0) {
    return 'positive';
  }
  const word = 'negative';
  return word;
};
