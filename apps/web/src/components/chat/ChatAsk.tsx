/**
 * A question of Nemia's in her chat, and the parts her three drawings share: who asked and when with the tag that says what it is
 * (`AskHead`), her words with the links they carry (`AskWords`), one choice as the canvas's option row (`AskOption`), and the line
 * that says what the person chose once they have (`AskChose`). `ChatAsk` itself is the canvas's board 7: one question whose choices
 * explain themselves, drawn as a radio form — checkboxes in the same fieldset where the question takes several — with the Answer
 * button off until it is answered, and a plain link where her words carry one. The question itself is her words over the fieldset
 * (`AskEvent.text` is the first question's own), so the fieldset names its header alone and never says the question twice.
 *
 * Her one-question ask whose choices need no explanation is `ChatProposal` (boards 5 and 6), and several questions take
 * `ChatAskMany` (board 7b); `drawnAsk` says which of the three an ask takes.
 */
import { useState, type ReactNode } from 'react';
import { CheckIcon } from 'lucide-react';
import { Checkbox, Radio, RadioGroup } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { CutTag, cutShape, TEXT_LINK } from '@/components/look';
import { container } from '@/lib/meaning';
import { askAnswered, linksOf, type ChatAsk as Ask } from '@/lib/chatFollowing';
import type { AskPick, AskQuestion } from '@/lib/api';
import { timeOfDay } from '@/lib/timeOfDay';
import { Markdown } from '../Markdown';

/** How far an ask's bubble is cut, in pixels: her words' own cut. */
const ASK_CUT = 10;

/** One option row, the canvas's `opt`: a hairline box that becomes the tonal container once it is the choice. */
const OPTION = 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-3 py-2.5 outline-none cursor-pointer';

/** The same row chosen, and not. */
const [OPTION_ON, OPTION_OFF] = [`bg-secondary-container text-on-secondary-container`, 'ring-1 ring-outline-variant ring-inset'];

/** What the tag over an ask says, by what it is and whether it is answered. */
export const askTag = (ask: Ask): { words: string; hue: 'yours' | 'money' | 'grey' } =>
  ask.chose !== undefined
    ? { words: ask.kind === 'proposal' ? 'Proposed' : 'Answered', hue: 'grey' }
    : ask.kind === 'proposal'
      ? { words: 'Proposes', hue: 'money' }
      : { words: 'Asks you', hue: 'yours' };

/** Who asked and when, with the tag that says what it is. */
export function AskHead({ ask }: { ask: Ask }) {
  const tag = askTag(ask);
  return (
    <div className="flex items-center gap-2">
      <span className="text-label-small text-on-surface-variant uppercase">{`Nemia · ${timeOfDay(new Date(ask.at))}`}</span>
      <CutTag>
        <span
          data-chat-tag={tag.words.toLowerCase()}
          className={`inline-flex items-center px-2 py-0.5 text-label-small uppercase ${container[tag.hue]}`}
        >
          {tag.words}
        </span>
      </CutTag>
    </div>
  );
}

/** Her words over the ask, in her own bubble, the links in them left for the row under it (`linksOf`). */
export function AskWords({ text }: { text: string }) {
  return (
    <div
      data-chat-bubble="agent"
      className="bg-surface-container-highest px-3.5 py-2.5 text-body-medium text-on-surface"
      style={{ clipPath: cutShape(ASK_CUT) }}
    >
      <Markdown>{text}</Markdown>
    </div>
  );
}

/** Each link her words carry, as a plain link beside the ask's own controls. */
export function AskLinks({ text }: { text: string }) {
  const { links } = linksOf(text);
  return links.map((link) => (
    <a key={`${link.href} ${link.words}`} href={link.href} className={`text-label-large ${TEXT_LINK}`}>
      {link.words}
    </a>
  ));
}

/** One choice: its number where the drawing numbers them, its label, the Recommended tag her words marked it with, and why. */
export function AskOption({
  n,
  label,
  why,
  recommended,
  children,
}: {
  n?: number;
  label: string;
  why?: string;
  recommended: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <span className="col-start-2 text-title-small font-title-small">
        {n !== undefined && <span className="mr-1.5 font-mono text-on-surface-variant">{`${n}.`}</span>}
        {label}
        {recommended && (
          <span data-chat-recommended className="ml-2 inline-flex items-center border border-current px-1.5 text-label-small uppercase">
            Recommended
          </span>
        )}
      </span>
      {why !== undefined && why !== '' && <span className="col-start-2 text-body-small">{why}</span>}
    </>
  );
}

/** The line that says what the person chose, once they have: a check, their answers, and when they said so. */
export function AskChose({ ask }: { ask: Ask }) {
  if (ask.chose === undefined) return null;
  const chose = Object.values(ask.chose).join(' · ');
  return (
    <span data-chat-chose className="inline-flex items-center gap-1.5 text-label-small text-on-surface-variant uppercase">
      <CheckIcon aria-hidden="true" className="size-3.5" />
      {`You chose: ${chose}${ask.choseAt === undefined ? '' : ` · ${timeOfDay(new Date(ask.choseAt))}`}`}
    </span>
  );
}

/** The one question's options as rows, several of them where it takes several: a checkbox each, a radio each otherwise. */
function Options({ question, pick, onPick }: { question: AskQuestion; pick: AskPick; onPick: (pick: AskPick) => void }) {
  const chosen = pick.labels ?? [];
  if (!question.multiSelect)
    return (
      <RadioGroup
        aria-label={question.question}
        value={chosen[0] ?? null}
        onChange={(label) => onPick({ question: question.question, labels: [label] })}
        className="flex flex-col gap-2"
      >
        {question.options.map((option) => (
          <Radio
            key={option.label}
            value={option.label}
            data-chat-option={option.label}
            className={({ isSelected }) => `${OPTION} ${isSelected ? OPTION_ON : OPTION_OFF}`}
          >
            {({ isSelected }) => (
              <AskOption label={option.label} why={option.description} recommended={option.recommended}>
                <span
                  aria-hidden="true"
                  className={`mt-1 size-4 rounded-full border-2 ${isSelected ? 'border-alive bg-alive' : 'border-outline'}`}
                />
              </AskOption>
            )}
          </Radio>
        ))}
      </RadioGroup>
    );
  return (
    <div role="group" aria-label={question.question} className="flex flex-col gap-2">
      {question.options.map((option) => (
        <Checkbox
          key={option.label}
          data-chat-option={option.label}
          isSelected={chosen.includes(option.label)}
          onChange={(on) =>
            onPick({
              question: question.question,
              labels: on ? [...chosen, option.label] : chosen.filter((label) => label !== option.label),
            })
          }
          className={({ isSelected }) => `${OPTION} ${isSelected ? OPTION_ON : OPTION_OFF}`}
        >
          {({ isSelected }) => (
            <AskOption label={option.label} why={option.description} recommended={option.recommended}>
              <span
                aria-hidden="true"
                className={`mt-1 grid size-4 place-items-center border-2 ${isSelected ? 'border-alive bg-alive text-on-alive' : 'border-outline'}`}
              >
                {isSelected && <CheckIcon className="size-3" />}
              </span>
            </AskOption>
          )}
        </Checkbox>
      ))}
    </div>
  );
}

/**
 * Board 7: her one question with its choices explained, answered from the chat. The Answer button is off until a choice is made, and
 * the whole ask is drawn as her answered record — the choice on its line — once the person has answered it.
 */
export function ChatAsk({ ask, onAnswer }: { ask: Ask; onAnswer: (id: string, picks: readonly AskPick[]) => void }) {
  const question = ask.questions[0];
  const [pick, setPick] = useState<AskPick>({ question: question?.question ?? '', labels: [] });
  const answered = ask.chose !== undefined;
  return (
    <div data-chat-ask="form" className="flex flex-col gap-2.5">
      <AskHead ask={ask} />
      <AskWords text={ask.text} />
      {question !== undefined && !answered && (
        <>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="pb-2 text-label-small text-on-surface-variant uppercase">{`1 of 1 · ${question.header}`}</legend>
            <Options question={question} pick={pick} onPick={setPick} />
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button data-chat-answer size="sm" isDisabled={!askAnswered(pick)} onPress={() => onAnswer(ask.call, [pick])}>
              Answer
            </Button>
            <AskLinks text={ask.text} />
          </div>
        </>
      )}
      <AskChose ask={ask} />
    </div>
  );
}
