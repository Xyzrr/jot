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
    return (
      <div className="self-end max-w-[85%] py-2 px-4 bg-bg-tertiary text-text-primary rounded-lg ml-auto text-[0.95rem] select-text animate-fade-in">
        {message.content}
      </div>
    );
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
    <div className="flex flex-col gap-2 animate-fade-in group">
      <div className="flex flex-col gap-4" ref={contentRef}>
        {message.blocks.map((block, i) => (
          <BlockRenderer
            key={i}
            block={block}
            nextBlock={message.blocks[i + 1]}
          />
        ))}
      </div>

      {isStreaming && (
        <div className="w-1 h-1 bg-text-muted rounded-full opacity-0 animate-breathe mt-2" />
      )}

      {showCode && (
        <div className="mt-2">
          <pre className="m-0 p-4 bg-bg-secondary border border-border rounded-lg font-mono text-xs text-text-muted overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-words">
            <code className="bg-transparent p-0">{message.content}</code>
          </pre>
        </div>
      )}

      <div className="flex gap-0.5 mt-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          className={`flex items-center justify-center w-6 h-6 p-0 bg-transparent border-none cursor-pointer rounded transition-colors ${
            showCode
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
          onClick={() => setShowCode(!showCode)}
          title="View code"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
        <button
          className={`flex items-center justify-center w-6 h-6 p-0 bg-transparent border-none cursor-pointer rounded transition-colors ${
            copied
              ? "text-success"
              : "text-text-muted hover:text-text-secondary"
          }`}
          onClick={handleCopy}
          title="Copy"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BlockRenderer({
  block,
  nextBlock,
}: {
  block: Block;
  nextBlock?: Block;
}) {
  switch (block.type) {
    case "text":
      return <TextBlock content={block.content} />;
    case "tool-call": {
      // Check if the next block is the result for this tool call
      const hasResult =
        nextBlock?.type === "tool-result" &&
        nextBlock.toolName === block.toolName;
      return (
        <ToolCall
          toolName={block.toolName}
          args={block.args}
          hasResult={hasResult}
        />
      );
    }
    case "tool-call-streaming":
      return <CodeStreaming partialArgs={block.partialArgs} />;
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
