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
    console.log("container", container);
    if (!container) return true;
    const threshold = 50; // pixels from bottom to consider "at bottom"
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    console.log(
      "vals",
      container.scrollHeight,
      container.scrollTop,
      container.clientHeight,
      threshold,
      atBottom
    );
    return atBottom;
  }, []);

  // Detect scroll intent from wheel direction - fires before scroll position changes
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const atBottom = isAtBottom();
      console.log("atBottom", atBottom);
      if (e.deltaY < 0) {
        // Scrolling up
        setShouldAutoscroll(false);
      } else if (atBottom) {
        // Scrolling down and at bottom
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
    setShouldAutoscroll(true); // Enable autoscroll when user sends a message
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
    <div className="chat">
      <main
        className="chat-container"
        ref={messagesContainerRef}
        onWheel={handleWheel}
      >
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome">
              <h1>tell me anything</h1>
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

      <footer className="input-area">
        <form className="input-container" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="..."
            rows={1}
            autoFocus
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!input.trim() || isLoading}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <div className="input-hint">
          <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
        </div>
      </footer>
    </div>
  );
}
