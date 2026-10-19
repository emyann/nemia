/**
 * The heading each layer of what a session is told is told under, and the layers joined under them (`headedLayers`): a step's words are
 * composed by two writers — the prompt its agent is rendered into (`renderedPrompt`) and the body a step on another harness is told in its
 * brief (`parseWorkflow`) — and read back by a third (`toldLayers`). Pure.
 */
/**
 * The heading each layer Nemia composes is told under, by its number in the precedence order the doctrine numbers them in (the package's
 * README, *Five layers*) and the owner whose words follow, in the second person: the layers a session is told as text are 1, 2, 4 and 5,
 * the folder's files being 3 and read by the harness itself wherever the session works.
 */
export const LAYER_HEADINGS = {
  instructions: "## 1. Instructions — your role's own words",
  custom: '## 2. Custom instructions — the person who hired you',
  factory: "## 4. The factory's rules — every step of this factory",
  policy: "## 5. The step's policy — this step of this process",
} as const;

/** A layer of what a session is told that Nemia composes as text, by the key its heading is written under (`LAYER_HEADINGS`). */
export type ComposedLayer = keyof typeof LAYER_HEADINGS;

/**
 * The layers given, each under its heading (`LAYER_HEADINGS`), joined as a brief's or a prompt's parts are, after a blank line: a session
 * reads whose words each is and which of them wins where two differ. A layer with no words is left out, heading and all, and layers that
 * are all empty are the empty text. Pure, and the one writer of this text: `renderedPrompt` composes a step's prompt with it,
 * `parseWorkflow` the body a step on another harness is told in its brief, and `toldLayers` cuts a brief back on it.
 *
 * @param layers Each layer by its key, with the words frozen for it or none.
 */
export const headedLayers = (layers: ReadonlyArray<readonly [ComposedLayer, string | undefined]>): string =>
  layers
    .filter(([, words]) => words)
    .map(([layer, words]) => `${LAYER_HEADINGS[layer]}\n\n${words!.trimEnd()}`)
    .join('\n\n');
