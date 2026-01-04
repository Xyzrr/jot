import {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  type FormEvent,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import { useChat, type MessageWithId } from "../hooks/useChat";
import { AssistantMessage } from "./Message";

// Isolated input component - typing here doesn't re-render messages
function ChatInput({
  onSend,
  onStop,
  isLoading,
}: {
  onSend: (content: string) => void;
  onStop: () => void;
  isLoading: boolean;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
      textareaRef.current.style.overflowY =
        textareaRef.current.scrollHeight > 150 ? "auto" : "hidden";
    }
  };

  return (
    <footer className="py-6 px-10 pb-[calc(--spacing(10)+env(safe-area-inset-bottom))] relative z-10">
      <form
        className="flex items-end gap-2 bg-bg-secondary border border-border rounded-lg p-1 transition-colors focus-within:border-border-focus"
        onSubmit={handleSubmit}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="..."
          rows={1}
          autoFocus
          className="flex-1 bg-transparent border-none text-text-primary font-sans text-base py-2 px-4 resize-none max-h-[150px] leading-relaxed tracking-tight select-text focus:outline-none placeholder:text-text-muted overflow-hidden"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="w-9 h-9 mb-0.5 rounded border-none cursor-pointer flex items-center justify-center transition-all bg-transparent text-text-muted hover:text-error"
            title="Stop generating"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            className="w-9 h-9 mb-0.5 rounded border-none cursor-pointer flex items-center justify-center transition-all bg-transparent text-text-muted disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:text-text-primary"
            disabled={!input.trim()}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-[18px] h-[18px]"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </form>
      <div className="text-center mt-4 text-[0.7rem] text-text-muted opacity-60 tracking-wide max-sm:hidden">
        <kbd className="font-mono text-[0.65rem]">Enter</kbd> to send ·{" "}
        <kbd className="font-mono text-[0.65rem]">Shift+Enter</kbd> for new line
      </div>
    </footer>
  );
}

// Memoized user message - never re-renders once created
const UserMessage = memo(function UserMessage({
  content,
}: {
  content: string;
}) {
  return (
    <div className="self-end max-w-[85%] py-2 px-4 bg-bg-tertiary text-text-primary rounded-lg ml-auto text-[0.95rem] select-text animate-fade-in whitespace-pre-wrap">
      {content}
    </div>
  );
});

// Memoized assistant message wrapper
const MemoizedAssistantMessage = memo(function MemoizedAssistantMessage({
  message,
  toolResults,
}: {
  message: Extract<MessageWithId["message"], { role: "assistant" }>;
  toolResults: Map<string, { toolName: string; result: unknown }>;
}) {
  return <AssistantMessage message={message} toolResults={toolResults} />;
});

// Historical messages only - no streaming props means no re-render during streaming
const HistoricalMessages = memo(function HistoricalMessages({
  messages,
}: {
  messages: MessageWithId[];
}) {
  // Build tool results map from messages
  const toolResultsMap = new Map<
    string,
    { toolName: string; result: unknown }
  >();
  for (const msg of messages) {
    if (msg.message.role === "tool") {
      for (const part of msg.message.content) {
        if (part.type === "tool-result") {
          toolResultsMap.set(part.toolCallId, {
            toolName: part.toolName,
            result: part.output,
          });
        }
      }
    }
  }

  return (
    <>
      {messages.map((m) => {
        if (m.message.role === "user") {
          const content =
            typeof m.message.content === "string"
              ? m.message.content
              : m.message.content
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("");
          return <UserMessage key={m.id} content={content} />;
        }
        if (m.message.role === "assistant") {
          return (
            <MemoizedAssistantMessage
              key={m.id}
              message={
                m.message as Extract<typeof m.message, { role: "assistant" }>
              }
              toolResults={toolResultsMap}
            />
          );
        }
        return null; // tool messages rendered with their assistant
      })}
    </>
  );
});

export function Chat() {
  const {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    streamingBlocks,
    partialToolArgs,
    isStreamingToolCall,
    currentAssistantId,
  } = useChat();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoscroll = useRef(true);

  const isAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 50;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold
    );
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const atBottom = isAtBottom();
      if (e.deltaY < 0) {
        shouldAutoscroll.current = false;
      } else if (atBottom) {
        shouldAutoscroll.current = true;
      }
    },
    [isAtBottom]
  );

  // Autoscroll when messages change or streaming content updates
  useEffect(() => {
    if (shouldAutoscroll.current) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [messages, streamingBlocks]);

  const hasStreamingContent =
    currentAssistantId && (streamingBlocks.length > 0 || isStreamingToolCall);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main
        className="flex-1 overflow-y-auto p-10 relative z-1 overscroll-contain"
        ref={messagesContainerRef}
        onWheel={handleWheel}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col gap-10">
          {messages.length === 0 && !isLoading && (
            <div className="py-16">
              <h1 className="text-2xl font-light text-text-secondary mb-4 tracking-tight">
                tell me anything
              </h1>
            </div>
          )}

          {/* Historical messages - memoized, won't re-render during streaming */}
          <HistoricalMessages messages={messages} />

          {/* Streaming message - renders separately, doesn't affect historical */}
          {hasStreamingContent && currentAssistantId && (
            <AssistantMessage
              key={currentAssistantId}
              streaming={{
                blocks: streamingBlocks,
                partialToolArgs,
                isStreamingToolCall,
              }}
            />
          )}

          {isLoading && !hasStreamingContent && (
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full opacity-0 animate-breathe" />
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>
      <ChatInput
        onSend={sendMessage}
        onStop={stopGeneration}
        isLoading={isLoading}
      />
    </div>
  );
}
