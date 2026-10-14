import { useEffect, useRef, type ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import type { ProposedAction } from "@packages/types";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { toolLabel, type AssistantChatMessage, type AssistantError, type PendingTurn, type ProposalState } from "@/hooks/use-assistant-chat";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { cn } from "@/lib/utils";
import ProposalCard from "./ProposalCard";

export interface MessageListProps {
  messages: AssistantChatMessage[];
  pending: PendingTurn | null;
  error: AssistantError | null;
  proposalState: (messageId: string, actionId: string) => ProposalState;
  // Without ids, every pending or failed card of the message.
  onApply: (messageId: string, actionIds?: string[]) => void;
  onIgnore: (messageId: string, actionId: string) => void;
  // Shown while the thread is empty.
  empty?: ReactNode;
  className?: string;
}

// Only follow the tail when the reader is already near it.
const FOLLOW_WITHIN_PX = 80;

export default function MessageList({ messages, pending, error, proposalState, onApply, onIgnore, empty, className }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_WITHIN_PX;
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (node && nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages, pending?.text, pending?.tool, pending?.actions.length, error]);

  const isEmpty = messages.length === 0 && !pending;

  return (
    <div ref={scrollRef} onScroll={onScroll} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3", className)}>
      {isEmpty ? (
        empty
      ) : (
        <div className="flex flex-col gap-4">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserTurn key={message.id} content={message.content} />
            ) : (
              <AssistantTurn key={message.id} message={message} proposalState={proposalState} onApply={onApply} onIgnore={onIgnore} />
            ),
          )}
          {pending && <LiveTurn pending={pending} />}
        </div>
      )}
      {error && (
        <Callout tone="danger" className={cn(isEmpty ? "mt-3" : "mt-4")}>
          {error.message}
        </Callout>
      )}
    </div>
  );
}

function UserTurn({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] whitespace-pre-wrap break-words rounded-lg bg-callout px-3 py-2 text-sm touch:text-base">{content}</div>
    </div>
  );
}

function AssistantTurn({
  message,
  proposalState,
  onApply,
  onIgnore,
}: {
  message: AssistantChatMessage;
  proposalState: MessageListProps["proposalState"];
  onApply: MessageListProps["onApply"];
  onIgnore: MessageListProps["onIgnore"];
}) {
  const actions = message.actions ?? [];
  return (
    <div className="flex flex-col gap-2">
      {message.content && <AnswerText content={message.content} />}
      {actions.length > 0 && <ProposalGroup messageId={message.id} actions={actions} proposalState={proposalState} onApply={onApply} onIgnore={onIgnore} />}
      {message.tools && message.tools.length > 0 && <p className="text-caption text-muted-foreground">{describeTools(message.tools)}</p>}
    </div>
  );
}

// The turn in flight: the text and cards so far, then the current tool and the dots.
function LiveTurn({ pending }: { pending: PendingTurn }) {
  const tool = pending.tool?.replace(/(\.{3}|…)\s*$/, "");
  return (
    <div className="flex flex-col gap-2">
      {pending.text && <AnswerText content={pending.text} />}
      {pending.actions.length > 0 && (
        <div className="flex flex-col gap-2">
          {pending.actions.map((action) => (
            <ProposalCard key={action.id} action={action} state={{ status: "pending" }} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <span className="chat-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {tool ? <span className="min-w-0 truncate">{tool}…</span> : <span className="sr-only">L'assistant répond</span>}
      </div>
    </div>
  );
}

function AnswerText({ content }: { content: string }) {
  return <div className="break-words text-sm touch:text-base">{renderChatMarkdown(content)}</div>;
}

function ProposalGroup({
  messageId,
  actions,
  proposalState,
  onApply,
  onIgnore,
}: {
  messageId: string;
  actions: ProposedAction[];
  proposalState: MessageListProps["proposalState"];
  onApply: MessageListProps["onApply"];
  onIgnore: MessageListProps["onIgnore"];
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const states = actions.map((action) => proposalState(messageId, action.id));
  const open = states.filter((s) => s.status === "pending" || s.status === "failed").length;
  const applying = states.some((s) => s.status === "applying");
  return (
    <div ref={groupRef} tabIndex={-1} className="flex flex-col gap-2 outline-none">
      {actions.map((action, i) => (
        <ProposalCard
          key={action.id}
          action={action}
          state={states[i]}
          onApply={() => onApply(messageId, [action.id])}
          onIgnore={() => onIgnore(messageId, action.id)}
        />
      ))}
      {actions.length > 1 && open > 1 && (
        <div className="flex justify-end">
          <Button variant="default" size="sm" icon={<CheckCheck />} disabled={applying} onClick={() => { groupRef.current?.focus(); onApply(messageId); }}>
            Tout appliquer
          </Button>
        </div>
      )}
    </div>
  );
}

// « Recherche de recettes · Lecture de l'événement (2) »: each tool once, with its count past one.
function describeTools(tools: string[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) counts.set(tool, (counts.get(tool) ?? 0) + 1);
  return [...counts].map(([tool, count]) => (count > 1 ? `${toolLabel(tool)} (${count})` : toolLabel(tool))).join(" · ");
}
