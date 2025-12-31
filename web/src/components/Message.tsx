import { useState, useRef, useEffect } from "react";
import type { Message as MessageType, Block } from "../hooks/useChat";
import { ToolCall } from "./ToolCall";
import { ToolResult } from "./ToolResult";
import { CodeStreaming } from "./CodeStreaming";

interface Props {
  message: MessageType;
  isStreaming?: boolean;
}

export function Message({ message, isStreaming }: Props) {
  if (message.role === "user") {
    return <div className="message user">{message.content}</div>;
  }

  return <AssistantMessage message={message} isStreaming={isStreaming} />;
}

function AssistantMessage({ message, isStreaming }: Props) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Execute scripts after streaming completes
  useEffect(() => {
    if (!isStreaming && contentRef.current && message.content) {
      const scripts = message.content.match(/<script>([\s\S]*?)<\/script>/gi);
      if (scripts) {
        scripts.forEach((script) => {
          const code = script.replace(/<\/?script>/gi, "");
          try {
            const fn = new Function("container", code);
            fn(contentRef.current);
          } catch (e) {
            console.error("Script execution error:", e);
          }
        });
      }
    }
  }, [isStreaming, message.content]);

  return (
    <div className={`message assistant ${isStreaming ? "streaming" : ""}`}>
      <div className="assistant-content-area" ref={contentRef}>
        {message.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>

      {isStreaming && <div className="streaming-dot" />}

      {showCode && (
        <div className="assistant-code active">
          <pre>
            <code>{message.content}</code>
          </pre>
        </div>
      )}

      <div className="message-actions">
        <button
          className={`action-btn ${showCode ? "active" : ""}`}
          onClick={() => setShowCode(!showCode)}
          title="View code"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
        <button
          className={`action-btn ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title="Copy"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return <TextBlock content={block.content} />;
    case "tool-call":
      return <ToolCall toolName={block.toolName} args={block.args} />;
    case "tool-call-streaming":
      return <CodeStreaming toolName={block.toolName} partialArgs={block.partialArgs} />;
    case "tool-result":
      return <ToolResult toolName={block.toolName} result={block.result} />;
  }
}

function TextBlock({ content }: { content: string }) {
  // Strip script tags for display (they execute separately)
  const displayContent = content.replace(/<script>[\s\S]*?<\/script>/gi, "");

  return (
    <div
      className="assistant-content"
      dangerouslySetInnerHTML={{ __html: displayContent }}
    />
  );
}

