import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import { useChat } from "../hooks/useChat";
import { Message } from "./Message";

export function Chat() {
  const { messages, isLoading, sendMessage } = useChat();
  const [input, setInput] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [shouldAutoscroll, setShouldAutoscroll] = useState(true);

  // Check if user is at the bottom of the scroll container
  const isAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 50;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    return atBottom;
  }, []);

  // Detect scroll intent from wheel direction
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const atBottom = isAtBottom();
      if (e.deltaY < 0) {
        setShouldAutoscroll(false);
      } else if (atBottom) {
        setShouldAutoscroll(true);
      }
    },
    [isAtBottom]
  );

  // Autoscroll when messages change, but only if enabled
  useEffect(() => {
    if (shouldAutoscroll) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [messages, shouldAutoscroll]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setShouldAutoscroll(true);
    sendMessage(input.trim());
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
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150
      )}px`;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main
        className="flex-1 overflow-y-auto p-10 relative z-[1] overscroll-contain"
        ref={messagesContainerRef}
        onWheel={handleWheel}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col gap-10">
          {messages.length === 0 && (
            <div className="py-16">
              <h1 className="text-2xl font-light text-text-secondary mb-4 tracking-tight">
                tell me anything
              </h1>
            </div>
          )}

          {messages.map((message, i) => (
            <Message
              key={message.id}
              message={message}
              isStreaming={
                isLoading &&
                i === messages.length - 1 &&
                message.role === "assistant"
              }
            />
          ))}

          <div ref={messagesEndRef} />
        </div>
      </main>

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
            className="flex-1 bg-transparent border-none text-text-primary font-sans text-base py-2 px-4 resize-none max-h-[150px] leading-relaxed tracking-tight select-text focus:outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            className="w-9 h-9 rounded border-none cursor-pointer flex items-center justify-center transition-all bg-transparent text-text-muted disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:text-text-primary"
            disabled={!input.trim() || isLoading}
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
        </form>
        <div className="text-center mt-4 text-[0.7rem] text-text-muted opacity-60 tracking-wide max-sm:hidden">
          <kbd className="font-mono text-[0.65rem]">Enter</kbd> to send ·{" "}
          <kbd className="font-mono text-[0.65rem]">Shift+Enter</kbd> for new
          line
        </div>
      </footer>
    </div>
  );
}
