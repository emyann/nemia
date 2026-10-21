/**
 * The one message of Nemia's chat that is hers alone to draw: the one this browser kept because the api would not take it. Everything
 * else said in her chat is the family's (`conversation/Said`), from which this takes the line that says who said it and when (`Who`).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CutTag } from '@/components/look';
import { Who } from '@/components/conversation/Said';
import { container, ink } from '@/lib/meaning';
import type { ChatKept } from '@/lib/chatOutbox';

/**
 * The message this browser kept because the api would not take it: its tag and its line in the failure's colour, and the three things
 * the person may do with it — send it again, change its words, throw it away. It is drawn as theirs, at the right, as every message of
 * theirs is.
 */
export function ChatKeptMessage({
  kept,
  onAgain,
  onEdit,
  onDiscard,
}: {
  kept: ChatKept;
  onAgain: () => void;
  onEdit: (text: string) => void;
  onDiscard: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div data-chat-kept className="flex max-w-[94%] flex-col items-end gap-1.5 self-end">
      <Who who="You" at={kept.at}>
        <CutTag>
          <span data-chat-tag="kept" className={`inline-flex items-center px-2 py-0.5 text-label-small uppercase ${container.failure}`}>
            Not sent
          </span>
        </CutTag>
      </Who>
      {draft === null ? (
        <div data-chat-bubble="kept" className="px-3.5 py-2.5 text-body-medium text-on-surface ring-1 ring-failure ring-inset">
          {kept.text}
        </div>
      ) : (
        <Textarea aria-label="Change the message" value={draft} onChange={(event) => setDraft(event.target.value)} />
      )}
      <span className={`text-body-small ${ink.failure}`}>The board lost the daemon. Nothing reached her.</span>
      <div className="flex flex-wrap justify-end gap-2">
        {draft === null ? (
          <>
            <Button variant="secondary" size="sm" onPress={onAgain}>
              Send again
            </Button>
            <Button variant="outline" size="sm" onPress={() => setDraft(kept.text)}>
              Edit
            </Button>
            <Button variant="link" size="sm" onPress={onDiscard}>
              Discard
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                onEdit(draft);
                setDraft(null);
              }}
            >
              Keep the change
            </Button>
            <Button variant="link" size="sm" onPress={() => setDraft(null)}>
              Leave it
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
