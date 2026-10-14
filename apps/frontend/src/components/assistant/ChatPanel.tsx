import { forwardRef, useImperativeHandle, useRef } from "react";
import { MessageSquarePlus, PanelRight, X } from "lucide-react";
import ActionMenu, { type ActionMenuItem } from "@/components/ui/ActionMenu";
import { IconButton } from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import type { AssistantChat } from "@/hooks/use-assistant-chat";
import { ASSISTANT_DISABLED_MESSAGE } from "@/lib/assistant-client";
import { hasAssistantSelection, type AssistantPageSelection } from "@/lib/assistant-context";
import { dayMonthShortLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import ChatWelcome from "./ChatWelcome";
import Composer, { type ComposerHandle } from "./Composer";
import MessageList from "./MessageList";

export interface ChatPanelHandle {
  focusComposer: () => void;
}

export interface ChatPanelProps {
  chat: AssistantChat;
  draft: string;
  onDraftChange: (value: string) => void;
  // Sends the draft; the host clears it once the hook accepted the message.
  onSubmit: (text: string) => void;
  selection: AssistantPageSelection;
  // The chip's ×: the next message goes without the page's record.
  onDropSelection: () => void;
  docked: boolean;
  // Present only when the viewport can hold a docked sheet.
  onToggleDock?: () => void;
  onClose: () => void;
  className?: string;
}

// The header chip: the page's label, else a word for the kind of record.
export function selectionLabel(selection: AssistantPageSelection): string {
  if (selection.label) return selection.label;
  if (selection.eventId) return "Événement";
  if (selection.date) {
    try {
      return dayMonthShortLabel(selection.date);
    } catch {
      return selection.date;
    }
  }
  if (selection.recipeId) return "Recette";
  if (selection.clientId) return "Client";
  return "";
}

const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  { chat, draft, onDraftChange, onSubmit, selection, onDropSelection, docked, onToggleDock, onClose, className },
  ref,
) {
  const composerRef = useRef<ComposerHandle>(null);
  const focusComposer = () => composerRef.current?.focus();

  useImperativeHandle(ref, () => ({ focusComposer }), []);

  const pick = (text: string) => {
    onDraftChange(text);
    focusComposer();
  };

  const newConversation = () => {
    chat.reset();
    focusComposer();
  };

  const items: ActionMenuItem[] = [{ label: "Nouvelle conversation", icon: <MessageSquarePlus />, onClick: newConversation }];
  if (onToggleDock) items.push({ label: docked ? "Flotter" : "Ancrer à droite", icon: <PanelRight />, onClick: onToggleDock });

  const hasSelection = hasAssistantSelection(selection);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border pl-4 pr-2">
        <span className="shrink-0 text-base font-semibold">Assistant</span>
        {hasSelection && (
          <span className="flex h-7 min-w-0 items-center gap-0.5 rounded-sm bg-selected pl-2 pr-0.5 text-sm text-primary" title={selectionLabel(selection)}>
            <span className="truncate">{selectionLabel(selection)}</span>
            <button
              type="button"
              aria-label="Retirer le contexte"
              onClick={onDropSelection}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-hover focus-visible:outline-none focus-visible:shadow-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <ActionMenu items={items} title="Assistant" />
          <IconButton size="sm" aria-label="Fermer" onClick={onClose} icon={<X />} />
        </div>
      </div>

      <MessageList
        messages={chat.messages}
        pending={chat.pending}
        error={chat.disabled ? null : chat.error}
        proposalState={chat.proposalState}
        onApply={(messageId, actionIds) => void chat.apply(messageId, actionIds)}
        onIgnore={chat.ignore}
        empty={<ChatWelcome selection={selection} onPick={pick} />}
      />

      {chat.disabled ? (
        <div className="shrink-0 border-t border-border p-3">
          <Callout tone="warning">{ASSISTANT_DISABLED_MESSAGE}</Callout>
        </div>
      ) : (
        <Composer
          ref={composerRef}
          value={draft}
          onChange={onDraftChange}
          onSend={() => onSubmit(draft)}
          onStop={chat.abort}
          busy={chat.pending !== null}
        />
      )}
    </div>
  );
});

export default ChatPanel;
