import { useState } from 'react';
import { XIcon } from 'lucide-react';
import { Body, Button, IconButton, Label, ModalDialog, Title } from '@/components/ui/ds';
import { CutFrame } from '@/components/look';
import { CUT_MODAL } from '@/lib/classes';
import { personOf } from '@/lib/agentName';
import { wordsOf } from '@/lib/agentPage';
import { Markdown } from '../markdown/Markdown';

/** How many lines of the instructions the panel shows. */
const LINES = 10;

/**
 * An agent's instructions: a panel headed with their word count, their first ten lines and a Show all, which opens the whole of them in a
 * dialog, a cut frame 640 pixels wide under the agent's name and its file, scrolling inside the frame. The kit's dialog keeps the scrim,
 * the focus trap and Escape. The instructions are Markdown, and a soft line break joins a paragraph's lines.
 * @param props.name The agent's name.
 * @param props.file The agent's file, as the dialog names it.
 * @param props.body The instructions as its file writes them.
 */
export function AgentInstructions({ name, file, body }: { name: string; file: string; body: string }) {
  const [open, setOpen] = useState(false);
  const words = wordsOf(body);
  return (
    <section aria-label="Instructions" className="flex">
      <CutFrame size={16} className="w-full">
        <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
          <div data-instructions-head className="flex items-baseline justify-between gap-2">
            <Label size="medium" component="h2" className="m-0 uppercase">
              Instructions
            </Label>
            <Body size="small" component="span" className="text-on-surface-variant">
              {words} words
            </Body>
          </div>
          <Body size="medium" component="div" data-instructions-panel style={{ maxHeight: `${LINES}lh` }} className="overflow-hidden">
            <Markdown top>{body}</Markdown>
          </Body>
          <div>
            <Button variant="outlined" size="small" onPress={() => setOpen(true)}>
              Show all
            </Button>
          </div>
        </div>
      </CutFrame>
      <ModalDialog isOpen={open} onClose={() => setOpen(false)} title={`${personOf(name)}'s instructions`} className={CUT_MODAL}>
        <CutFrame size={24} className="w-[640px] max-w-full">
          <div data-instructions-modal className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 pt-3 pr-4 pl-4">
              <Title size="medium" component="h2" className="m-0">
                {personOf(name)}&apos;s instructions
              </Title>
              <IconButton
                variant="standard"
                size="xsmall"
                icon={XIcon}
                aria-label="Close"
                onPress={() => setOpen(false)}
                className="shrink-0"
              />
            </div>
            <Body size="small" className="shrink-0 px-4 pb-3 font-mono text-on-surface-variant">
              {file} · {words} words
            </Body>
            <Body
              size="large"
              component="div"
              tabIndex={0}
              role="region"
              aria-label="Instructions"
              className="mb-5 min-h-0 overflow-y-auto px-4"
            >
              <Markdown top>{body}</Markdown>
            </Body>
          </div>
        </CutFrame>
      </ModalDialog>
    </section>
  );
}
