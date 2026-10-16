/**
 * Her proposal in the chat, the canvas's boards 5 and 6: a one-question ask whose choices carry no explanation of their own, so each
 * choice is said whole by its own button — the first filled, the rest outlined, as the canvas draws them — and nothing else is asked
 * of the person. Answered, it keeps her words and her tag turns to `Proposed`, with the line that says what they chose (board 6).
 *
 * `drawnAsk` says when an ask is drawn this way; one whose choices explain themselves is `ChatAsk`, and several questions
 * `ChatAskMany`.
 */
import { Button } from '@/components/ui/button';
import type { AskPick } from '@/lib/api';
import type { ChatAsk as Ask } from '@/lib/chatFollowing';
import { AskChose, AskHead, AskWords } from './ChatAsk';

/** Board 5 and board 6: her words, one button for each choice, and the choice on its line once it is made. */
export function ChatProposal({ ask, onAnswer }: { ask: Ask; onAnswer: (id: string, picks: readonly AskPick[]) => void }) {
  const question = ask.questions[0];
  const answered = ask.chose !== undefined;
  return (
    <div data-chat-ask="actions" className="flex max-w-[94%] flex-col gap-2.5">
      <AskHead ask={ask} />
      <AskWords text={ask.text} />
      {question !== undefined && !answered && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((option, i) => (
            <Button
              key={option.label}
              data-chat-action={option.label}
              size="sm"
              variant={i === 0 ? 'secondary' : 'outline'}
              onPress={() => onAnswer(ask.call, [{ question: question.question, labels: [option.label] }])}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      <AskChose ask={ask} />
    </div>
  );
}
