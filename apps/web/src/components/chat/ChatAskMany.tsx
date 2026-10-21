/**
 * Her several questions in the chat, the canvas's board 7b: a tab for each question
 * and one more for Submit, the options of the question in hand numbered with the Recommended tag her words marked, a row that takes
 * the person's own words, Back and Next with `N OF M` beside them, and on the last tab the recap of every answer, where Submit stays
 * off until every question has one.
 *
 * Nothing is filed until Submit: the answer is one write of every question's at once, as the call she holds open takes it. Her words
 * over the flow are no bubble of their own: an ask's words are its first question's, which the tab in hand says itself. Answered, the
 * tabs go and the questions with them, so what was asked is drawn beside what was answered (`Asked`): the chat is a history, and an
 * answer alone says nothing of the question it answered.
 * `drawnAsk` says when an ask is drawn this way.
 */
import { useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { Radio, RadioGroup } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import type { AskPick, AskQuestion } from '@/lib/api';
import { askAnswered, askLeft, type ChatAsk as Ask } from '@/lib/chatFollowing';
import { AskChose, AskHead, AskOption } from './ChatAsk';

/** What the group's value is for the own-words row, and the prefix each option's label carries, so neither can be the other. */
const [OWN, LABEL] = ['own', 'o:'];

/** One option row, the canvas's `opt`, chosen and not. */
const OPTION = 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-3 py-2.5 outline-none cursor-pointer';
const [OPTION_ON, OPTION_OFF] = ['bg-secondary-container text-on-secondary-container', 'ring-1 ring-outline-variant ring-inset'];

/** The person's answer to each question of the ask, by the question's place in it; absent where they have not answered it yet. */
type Picks = Record<number, AskPick>;

/** The value the group holds for the question `i`: the label chosen, the own-words row, or none. */
const valueOf = (pick: AskPick | undefined): string | null => {
  if (pick === undefined) return null;
  if (pick.words !== undefined) return OWN;
  const label = pick.labels?.[0];
  return label === undefined ? null : `${LABEL}${label}`;
};

/** A tab for each question, then Submit: the one in hand marked, each answered one with a check. */
function Tabs({ ask, picks, tab, onGo }: { ask: Ask; picks: Picks; tab: number; onGo: (tab: number) => void }) {
  const last = ask.questions.length;
  return (
    <nav aria-label="The questions" className="flex flex-wrap gap-1.5">
      {[...ask.questions.map((q) => q.header), 'Submit'].map((head, i) => {
        const done = i < last && askAnswered(picks[i]);
        return (
          <button
            key={head}
            type="button"
            data-chat-qtab={i === tab ? 'on' : done ? 'done' : 'off'}
            aria-current={i === tab ? 'step' : 'false'}
            onClick={() => onGo(i)}
            className={`inline-flex h-7.5 items-center gap-1.5 px-2.5 text-label-small uppercase outline-none ${
              i === tab
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface-variant ring-1 ring-outline-variant ring-inset'
            }`}
          >
            {done && <CheckIcon aria-hidden="true" className="size-3.5" />}
            {head}
          </button>
        );
      })}
    </nav>
  );
}

/** The question in hand: its words, its numbered options, and the row that takes the person's own words. */
function Question({ question, pick, onPick }: { question: AskQuestion; pick: AskPick | undefined; onPick: (pick: AskPick) => void }) {
  const own = pick?.words;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="pb-2.5 text-title-small font-title-small">{question.question}</legend>
      <RadioGroup
        aria-label={question.question}
        value={valueOf(pick)}
        onChange={(value) =>
          onPick(
            value === OWN
              ? { question: question.question, words: own ?? '' }
              : { question: question.question, labels: [value.slice(LABEL.length)] },
          )
        }
        className="flex flex-col gap-2"
      >
        {question.options.map((option, n) => (
          <Radio
            key={option.label}
            value={`${LABEL}${option.label}`}
            data-chat-option={option.label}
            className={({ isSelected }) => `${OPTION} ${isSelected ? OPTION_ON : OPTION_OFF}`}
          >
            {({ isSelected }) => (
              <AskOption n={n + 1} label={option.label} why={option.description} recommended={option.recommended}>
                <span
                  aria-hidden="true"
                  className={`mt-1 size-4 rounded-full border-2 ${isSelected ? 'border-alive bg-alive' : 'border-outline'}`}
                />
              </AskOption>
            )}
          </Radio>
        ))}
        <Radio value={OWN} data-chat-option="own" className={({ isSelected }) => `${OPTION} ${isSelected ? OPTION_ON : OPTION_OFF}`}>
          {({ isSelected }) => (
            <AskOption n={question.options.length + 1} label="Your own words" recommended={false}>
              <span
                aria-hidden="true"
                className={`mt-1 size-4 rounded-full border-2 ${isSelected ? 'border-alive bg-alive' : 'border-outline'}`}
              />
            </AskOption>
          )}
        </Radio>
      </RadioGroup>
      <input
        type="text"
        aria-label="Your own answer"
        data-chat-own
        placeholder="Type something"
        value={own ?? ''}
        onChange={(event) => onPick({ question: question.question, words: event.target.value })}
        className="h-8 min-w-0 bg-surface-container-high px-2.5 text-body-medium text-on-surface outline-none ring-1 ring-outline-variant ring-inset placeholder:text-on-surface-variant"
      />
    </fieldset>
  );
}

/** Every answer as it stands, with what is left to answer and the Submit that waits for it. */
function Recap({ ask, picks, onBack, onSubmit }: { ask: Ask; picks: Picks; onBack: () => void; onSubmit: () => void }) {
  const open = ask.questions.filter((_, i) => !askAnswered(picks[i])).length;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-title-small font-title-small">Your answers</span>
      <dl data-chat-recap className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 bg-surface-container-highest px-3.5 py-3">
        {ask.questions.map((question, i) => {
          const pick = picks[i];
          const said = pick?.words?.trim() || (pick?.labels ?? []).join(', ');
          return (
            <div key={question.question} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-label-small text-on-surface-variant uppercase">{question.header}</dt>
              <dd className={`m-0 text-body-small ${said ? '' : 'text-on-surface-variant'}`}>{said || 'Not answered yet'}</dd>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button data-chat-submit size="sm" isDisabled={open > 0} onPress={onSubmit}>
          Submit answers
        </Button>
        <Button size="sm" variant="outline" onPress={onBack}>
          Back
        </Button>
        <span data-chat-left className="ml-auto text-body-small text-on-surface-variant">
          {askLeft(open)}
        </span>
      </div>
    </div>
  );
}

/**
 * Every question of an answered ask beside the answer the person gave it: what the tabs showed while it waited, kept where the chat
 * keeps the answer, so a person reading their own history reads the questions too. Nothing at all while it waits: the tabs say them.
 */
function Asked({ ask }: { ask: Ask }) {
  const chose = ask.chose;
  if (chose === undefined) return null;
  return (
    <dl data-chat-asked className="m-0 flex flex-col gap-2 bg-surface-container-highest px-3.5 py-3">
      {ask.questions.map((question) => (
        <div key={question.question} className="flex flex-col gap-0.5">
          <dt className="text-body-small text-on-surface-variant">{question.question}</dt>
          <dd className="m-0 text-body-medium">{chose[question.question] ?? 'Not answered'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Board 7b: her questions one tab at a time, then the recap, and one write of every answer at Submit. */
export function ChatAskMany({ ask, onAnswer }: { ask: Ask; onAnswer: (id: string, picks: readonly AskPick[]) => void }) {
  const last = ask.questions.length;
  const [tab, setTab] = useState(0);
  const [picks, setPicks] = useState<Picks>({});
  const question = ask.questions[tab];
  return (
    <div data-chat-ask="many" className="flex flex-col gap-2.5">
      <AskHead ask={ask} />
      {ask.chose === undefined && (
        <>
          <Tabs ask={ask} picks={picks} tab={tab} onGo={setTab} />
          {question !== undefined ? (
            <>
              <Question question={question} pick={picks[tab]} onPick={(pick) => setPicks((held) => ({ ...held, [tab]: pick }))} />
              <div className="flex flex-wrap items-center gap-2">
                {tab > 0 && (
                  <Button size="sm" variant="outline" onPress={() => setTab(tab - 1)}>
                    Back
                  </Button>
                )}
                <Button size="sm" variant="secondary" onPress={() => setTab(Math.min(tab + 1, last))}>
                  Next
                </Button>
                <span data-chat-of className="ml-auto font-mono text-body-small text-on-surface-variant">{`${tab + 1} OF ${last}`}</span>
              </div>
            </>
          ) : (
            <Recap
              ask={ask}
              picks={picks}
              onBack={() => setTab(Math.max(last - 1, 0))}
              onSubmit={() =>
                onAnswer(
                  ask.call,
                  ask.questions.map((_, i) => picks[i]).filter((pick): pick is AskPick => pick !== undefined),
                )
              }
            />
          )}
        </>
      )}
      <Asked ask={ask} />
      <AskChose ask={ask} />
    </div>
  );
}
